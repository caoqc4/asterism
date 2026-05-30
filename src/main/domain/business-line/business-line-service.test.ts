import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../../db/client.js';
import { BusinessLineRepository } from '../../db/repositories/business-line-repository.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { BlockerRepository } from '../../db/repositories/blocker-repository.js';
import { CompletionCriteriaRepository } from '../../db/repositories/completion-criteria-repository.js';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { ProcessTemplateRepository } from '../../db/repositories/process-template-repository.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { SourceContextRepository } from '../../db/repositories/source-context-repository.js';
import { TaskDependencyRepository } from '../../db/repositories/task-dependency-repository.js';
import { TaskFileRepository } from '../../db/repositories/task-file-repository.js';
import { TaskProcessBindingRepository } from '../../db/repositories/task-process-binding-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { WaitingItemRepository } from '../../db/repositories/waiting-item-repository.js';
import { formatBusinessLineContextPackForPrompt } from '../../../shared/business-line-context-pack.js';
import { makeTempDir } from '../../test-utils.js';
import { TaskService } from '../task/task-service.js';
import { BusinessLineService } from './business-line-service.js';
import type { DecisionRecord } from '../../../shared/types/decision.js';

function buildTaskService(): TaskService {
  return new TaskService(
    new TaskRepository(),
    new WaitingItemRepository(),
    new ArtifactRepository(),
    new SourceContextRepository(),
    new ProcessTemplateRepository(),
    new TaskProcessBindingRepository(),
    new BlockerRepository(),
    new TaskDependencyRepository(),
    new CompletionCriteriaRepository(),
    new TaskFileRepository(),
    new DecisionRepository(),
  );
}

describe('BusinessLineService', () => {
  let tempRoot = '';
  let taskService: TaskService;
  let service: BusinessLineService;
  let businessLineRepository: BusinessLineRepository;
  let decisionStore: DecisionRecord[];
  const decisionService = {
    create: vi.fn(async (input: unknown) => {
      const created = {
        id: `decision_learning_${decisionStore.length + 1}`,
        taskId: null,
        scope: 'global',
        kind: 'policy_change',
        sourceType: 'system',
        ...(input as object),
        status: 'pending',
        createdAt: '2026-05-29T00:00:00.000Z',
        updatedAt: '2026-05-29T00:00:00.000Z',
      } as DecisionRecord;
      decisionStore.push(created);
      return created;
    }),
    list: vi.fn(async () => decisionStore),
  };

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-business-line-');
    setDatabaseUserDataPathForTests(tempRoot);
    taskService = buildTaskService();
    businessLineRepository = new BusinessLineRepository();
    decisionStore = [];
    service = new BusinessLineService(
      businessLineRepository,
      taskService,
      decisionService as never,
    );
    decisionService.create.mockClear();
    decisionService.list.mockClear();
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('adapts top-level project tasks into business lines through legacy_task_id', async () => {
    const project = await taskService.create({
      title: 'GoalPilot product',
      summary: 'Business-line-centered AI workbench',
      taskType: 'project',
      taskFacets: ['project'],
    });

    const lines = await service.list();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      title: 'GoalPilot product',
      legacyTaskId: project.id,
      kind: 'project',
    });
  });

  it('records post-action review, proposes SOP revision, and loads accepted revision into context pack', async () => {
    await taskService.create({
      title: 'GoalPilot product',
      taskType: 'project',
      taskFacets: ['project'],
    });
    const [line] = await service.list();

    const reviewed = await service.recordReview({
      businessLineId: line!.id,
      resultSummary: 'Navigation model moved from task-first to business-line-first.',
      evidenceItems: ['Design doc updated'],
      hypothesisChange: 'Business line should own reusable judgment.',
      skillUpdateSuggestions: ['When navigation debates recur, anchor decisions to business-line learning loop evidence.'],
      nextActionSuggestions: ['Update Today suggestion trust layer.'],
      confidence: 80,
      requiresDecision: true,
    });

    expect(reviewed.records.some((record) => record.type === 'review')).toBe(true);
    expect(reviewed.records.filter((record) => record.type === 'review')).toHaveLength(1);
    expect(reviewed.contextPack.latestRecords.filter((record) => record.type === 'review')).toHaveLength(1);
    expect(reviewed.learning.skillRevisions).toHaveLength(1);
    expect(reviewed.learning.skillRevisions[0]?.status).toBe('proposed');
    expect(decisionService.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'policy_change',
      sourceId: reviewed.learning.skillRevisions[0]?.sourceReviewId,
    }));
    expect(reviewed.nextActions).toHaveLength(2);
    expect(reviewed.nextActions[0]?.nextStep).toBe('Update Today suggestion trust layer.');
    expect(reviewed.overview.nextSuggestion).toMatchObject({
      businessLineId: line!.id,
      nextStep: 'Update Today suggestion trust layer.',
      type: 'progress',
    });
    await expect(service.listTodaySuggestions()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessLineId: line!.id,
        nextStep: 'Update Today suggestion trust layer.',
        taskId: reviewed.nextActions[0]?.id,
        type: 'progress',
      }),
    ]));

    await expect(service.acceptSkillRevision({
      revisionId: reviewed.learning.skillRevisions[0]!.id,
      approvedBy: 'tester',
    })).rejects.toThrow(/requires an approved Decision/);
    decisionStore = decisionStore.map((decision) => ({ ...decision, status: 'approved' }));

    const accepted = await service.acceptSkillRevision({
      revisionId: reviewed.learning.skillRevisions[0]!.id,
      approvedBy: 'tester',
    });

    expect(accepted.learning.acceptedSkills).toHaveLength(1);
    expect(accepted.contextPack.acceptedSkills[0]?.nextContent).toContain('business-line learning loop');
    expect(accepted.overview.nextSuggestion?.type).toBe('progress');
    expect(accepted.overview.nextSuggestion?.nextStep).toBe('Update Today suggestion trust layer.');
    expect(accepted.overview.nextSuggestion?.sourceRecords.join(' ')).toContain('business-line learning loop');
    expect(accepted.overview.nextSuggestion?.businessLineId).toBe(line!.id);
    const promptContext = formatBusinessLineContextPackForPrompt(accepted);
    expect(promptContext).toContain('BusinessLineContextPack');
    expect(promptContext).toContain('Update Today suggestion trust layer.');
    expect(promptContext).toContain('business-line learning loop');
    await expect(service.listTodaySuggestions()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessLineId: line!.id,
        nextStep: 'Update Today suggestion trust layer.',
        taskId: reviewed.nextActions[0]?.id,
        type: 'progress',
      }),
    ]));
  });

  it('uses structured reviews as canonical review memory and hides legacy native mirrors', async () => {
    const created = await service.create({
      title: 'Review memory line',
      goal: 'Keep one review memory entry',
      kind: 'software_product',
    });

    const reviewed = await service.recordReview({
      businessLineId: created.id,
      resultSummary: 'Structured review should appear once.',
      confidence: 78,
    });
    const sourceReview = reviewed.learning.reviews[0]!;

    expect(reviewed.records.filter((record) => record.type === 'review')).toEqual([
      expect.objectContaining({
        id: `review:${sourceReview.id}`,
        provenance: expect.objectContaining({
          sourceType: 'review',
          sourceId: sourceReview.id,
        }),
      }),
    ]);
    expect(reviewed.contextPack.latestRecords.filter((record) => record.type === 'review')).toHaveLength(1);

    await businessLineRepository.createRecord({
      businessLineId: created.id,
      type: 'review',
      source: 'post_action_review',
      summary: 'Structured review should appear once.',
      confidence: 78,
      linkedActionId: null,
      shouldAffectFutureContext: true,
    });
    await businessLineRepository.createRecord({
      businessLineId: created.id,
      type: 'review',
      source: 'template:custom:review_prompt',
      summary: 'Review prompt: This native prompt should remain visible.',
      confidence: 75,
      linkedActionId: null,
      shouldAffectFutureContext: false,
    });

    const workspace = await service.getWorkspace(created.id);
    expect(workspace?.records.filter((record) => record.type === 'review')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `review:${sourceReview.id}`,
        provenance: expect.objectContaining({ sourceType: 'review' }),
      }),
      expect.objectContaining({
        source: 'template:custom:review_prompt',
        provenance: expect.objectContaining({ sourceType: 'business_line_record' }),
      }),
    ]));
    expect(workspace?.records.some((record) =>
      record.type === 'review'
      && record.source === 'post_action_review'
      && record.provenance?.sourceType === 'business_line_record')).toBe(false);
    expect(workspace?.contextPack.latestRecords.filter((record) => record.type === 'review')).toHaveLength(1);
  });

  it('accepts non-risky skill revisions inline', async () => {
    const created = await service.create({
      title: 'Canonical non-risky business line',
      goal: 'Accept safe learning inline',
      kind: 'software_product',
    });

    const reviewed = await service.recordReview({
      businessLineId: created.id,
      resultSummary: 'A safe operating note emerged.',
      skillUpdateSuggestions: ['Prefer short weekly evidence summaries before planning.'],
      requiresDecision: false,
    });

    expect(decisionService.create).not.toHaveBeenCalled();
    const accepted = await service.acceptSkillRevision({
      revisionId: reviewed.learning.skillRevisions[0]!.id,
      approvedBy: 'tester',
    });

    expect(accepted.learning.acceptedSkills[0]?.nextContent).toBe('Prefer short weekly evidence summaries before planning.');
    expect(accepted.learning.skillRevisions[0]?.status).toBe('active');
  });

  it('manages SOP revision lifecycle with Decision-gated activation, supersede, rejection, disable, and rollback', async () => {
    const created = await service.create({
      title: 'SOP lifecycle line',
      goal: 'Keep SOP revisions safe',
      kind: 'software_product',
    });
    const firstReview = await service.recordReview({
      businessLineId: created.id,
      resultSummary: 'First SOP emerged.',
      skillUpdateSuggestions: ['Use the first SOP before planning.'],
    });
    const firstAccepted = await service.acceptSkillRevision({
      revisionId: firstReview.learning.skillRevisions[0]!.id,
      approvedBy: 'tester',
    });
    const firstRevision = firstAccepted.learning.acceptedSkills[0]!;
    expect(firstRevision).toMatchObject({
      status: 'active',
      approvalSourceType: 'operator',
      approvedBy: 'tester',
      previousContent: null,
    });

    const riskyReview = await service.recordReview({
      businessLineId: created.id,
      resultSummary: 'Risky SOP update emerged.',
      skillUpdateSuggestions: ['Use the second SOP only after approval.'],
      requiresDecision: true,
      reviewAfterAt: '2000-01-01T00:00:00.000Z',
      expiresAt: '2999-01-01T00:00:00.000Z',
    });
    const secondRevisionId = riskyReview.learning.skillRevisions.find((revision) =>
      revision.nextContent === 'Use the second SOP only after approval.')!.id;

    await expect(service.acceptSkillRevision({
      revisionId: secondRevisionId,
      approvedBy: 'tester',
    })).rejects.toThrow(/requires an approved Decision/);
    decisionStore = decisionStore.map((decision) => ({ ...decision, status: 'approved' }));

    const secondAccepted = await service.acceptSkillRevision({
      revisionId: secondRevisionId,
      approvedBy: 'tester',
    });
    const secondRevision = secondAccepted.learning.acceptedSkills[0]!;
    const supersededFirst = secondAccepted.learning.skillRevisions.find((revision) => revision.id === firstRevision.id)!;
    expect(secondRevision).toMatchObject({
      status: 'active',
      approvalSourceType: 'decision',
      approvalSourceId: 'decision_learning_1',
      rollbackTargetRevisionId: firstRevision.id,
      previousContent: 'Use the first SOP before planning.',
      needsReview: true,
      isExpired: false,
      provenance: expect.objectContaining({
        sourceType: 'business_line_review',
        sourceReviewSummary: 'Risky SOP update emerged.',
      }),
    });
    expect(secondRevision.contentDiff).toContain('- Use the first SOP before planning.');
    expect(secondRevision.contentDiff).toContain('+ Use the second SOP only after approval.');
    expect(supersededFirst).toMatchObject({
      status: 'superseded',
      supersededByRevisionId: secondRevision.id,
    });
    expect(secondAccepted.contextPack.acceptedSkills.map((revision) => revision.id)).toEqual([secondRevision.id]);
    expect(secondAccepted.overview.nextSuggestion?.sourceRecords.join(' ')).toContain('Use the second SOP only after approval.');
    expect(secondAccepted.overview.nextSuggestion?.sourceRecords.join(' ')).not.toContain('Use the first SOP before planning.');
    expect(secondAccepted.records.some((record) => record.type === 'rule')).toBe(false);

    const rejectedReview = await service.recordReview({
      businessLineId: created.id,
      resultSummary: 'Rejected SOP emerged.',
      skillUpdateSuggestions: ['This SOP should be rejected.'],
    });
    const rejectedRevisionId = rejectedReview.learning.skillRevisions.find((revision) =>
      revision.nextContent === 'This SOP should be rejected.')!.id;
    const rejectedWorkspace = await service.rejectSkillRevision({
      revisionId: rejectedRevisionId,
      rejectedBy: 'tester',
    });
    expect(rejectedWorkspace.learning.skillRevisions.find((revision) => revision.id === rejectedRevisionId)).toMatchObject({
      status: 'rejected',
      rejectedBy: 'tester',
      rejectedAt: expect.any(String),
    });
    expect(rejectedWorkspace.contextPack.acceptedSkills.map((revision) => revision.nextContent))
      .not.toContain('This SOP should be rejected.');

    const rolledBack = await service.rollbackSkillRevision({
      revisionId: secondRevision.id,
      approvedBy: 'tester',
    });
    expect(rolledBack.learning.acceptedSkills.map((revision) => revision.id)).toEqual([firstRevision.id]);
    expect(rolledBack.learning.skillRevisions.find((revision) => revision.id === secondRevision.id)).toMatchObject({
      status: 'disabled',
      disabledBy: 'tester',
    });
    expect(rolledBack.learning.skillRevisions.find((revision) => revision.id === firstRevision.id)).toMatchObject({
      status: 'active',
      approvalSourceType: 'rollback',
      approvalSourceId: secondRevision.id,
    });

    const disabled = await service.disableSkillRevision({
      revisionId: firstRevision.id,
      disabledBy: 'tester',
    });
    expect(disabled.learning.acceptedSkills).toHaveLength(0);
    expect(disabled.contextPack.acceptedSkills).toHaveLength(0);
    expect(disabled.overview.nextSuggestion?.sourceRecords.join(' ')).not.toContain('Use the first SOP before planning.');

    const expiredReview = await service.recordReview({
      businessLineId: created.id,
      resultSummary: 'Expired SOP proposal emerged.',
      skillUpdateSuggestions: ['Expired SOP should never activate.'],
      expiresAt: '2000-01-01T00:00:00.000Z',
    });
    const expiredRevisionId = expiredReview.learning.skillRevisions.find((revision) =>
      revision.nextContent === 'Expired SOP should never activate.')!.id;
    await expect(service.acceptSkillRevision({
      revisionId: expiredRevisionId,
      approvedBy: 'tester',
    })).rejects.toThrow(/Expired business-line skill revision/);
  });

  it('creates a Web Product template business line with initial structure, review prompts, proposed SOPs, and actions', async () => {
    const created = await service.create({
      title: 'Activation web product',
      goal: 'Improve trial activation.',
      kind: 'software_product',
      template: 'web_product',
      desiredOutcome: 'Trial users reach first completed workflow faster.',
      continuousInformation: 'Customer signals, experiments, releases, and activation metrics.',
      aiWorkAndConfirmation: 'AI drafts specs and release notes; publish, deploy, and pricing require approval.',
    });

    const workspace = await service.getWorkspace(created.id);
    expect(workspace?.businessLine).toMatchObject({
      title: 'Activation web product',
      kind: 'software_product',
    });
    expect(workspace?.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'template:web_product:structure',
        summary: expect.stringContaining('Customer/problem signals'),
      }),
      expect.objectContaining({
        source: 'template:web_product:record',
        summary: expect.stringContaining('Trial users reach first completed workflow faster.'),
      }),
      expect.objectContaining({
        source: 'template:web_product:review_prompt',
        summary: expect.stringContaining('Review prompt: What user, market, or product signal changed?'),
        shouldAffectFutureContext: false,
      }),
    ]));
    expect(workspace?.learning.skillRevisions.length).toBeGreaterThanOrEqual(3);
    expect(workspace?.learning.skillRevisions.every((revision) => revision.status === 'proposed')).toBe(true);
    expect(workspace?.learning.acceptedSkills).toHaveLength(0);
    expect(workspace?.nextActions[0]).toMatchObject({
      businessLineId: created.id,
      nextStep: 'Capture the current user problem, product surface, and one success metric.',
    });
    await expect(service.list()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: created.id,
        title: 'Activation web product',
        nextActionCount: 1,
      }),
    ]));
  });

  it('creates a Custom business line from editable creation inputs', async () => {
    const created = await service.create({
      title: 'Custom partner motion',
      template: 'custom',
      desiredOutcome: 'Partner handoffs become predictable.',
      continuousInformation: 'Lead source, owner, next checkpoint.',
      aiWorkAndConfirmation: 'AI drafts summaries; partner commitments need confirmation.',
      initialStructure: ['Partner source log', 'Commitment review lane'],
      initialRecords: ['Initial custom record'],
      reviewPrompts: ['Did the partner commitment change?'],
      proposedSops: ['Confirm owner and next checkpoint before suggesting partner work.'],
      initialNextActions: ['Capture the first partner handoff.'],
    });

    const workspace = await service.getWorkspace(created.id);
    expect(workspace?.businessLine.kind).toBe('general');
    expect(workspace?.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'template:custom:structure',
        summary: 'Structure: Partner source log',
      }),
      expect.objectContaining({
        source: 'template:custom:record',
        summary: 'Initial custom record',
      }),
      expect.objectContaining({
        source: 'template:custom:review_prompt',
        summary: 'Review prompt: Did the partner commitment change?',
      }),
    ]));
    expect(workspace?.learning.skillRevisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nextContent: 'Confirm owner and next checkpoint before suggesting partner work.',
        status: 'proposed',
      }),
    ]));
    expect(workspace?.nextActions[0]?.nextStep).toBe('Capture the first partner handoff.');
  });

  it('copies inherited creation structure and accepted SOPs as proposed learning, not active rules', async () => {
    const source = await service.create({
      title: 'Source web product',
      template: 'web_product',
      desiredOutcome: 'Learn reusable product habits.',
    });
    const sourceWorkspace = await service.getWorkspace(source.id);
    const sourceRevision = sourceWorkspace!.learning.skillRevisions[0]!;
    const acceptedSource = await service.acceptSkillRevision({
      revisionId: sourceRevision.id,
      approvedBy: 'tester',
    });
    expect(acceptedSource.learning.acceptedSkills).toHaveLength(1);

    const inherited = await service.create({
      title: 'Inherited web product',
      template: 'custom',
      desiredOutcome: 'Reuse structure safely.',
      sourceBusinessLineId: source.id,
      proposedSops: ['Local proposed SOP only.'],
      initialNextActions: ['Capture inherited setup notes.'],
    });

    const workspace = await service.getWorkspace(inherited.id);
    expect(workspace?.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: `business_line:${source.id}:structure`,
        summary: expect.stringContaining('Structure:'),
      }),
    ]));
    expect(workspace?.learning.acceptedSkills).toHaveLength(0);
    expect(workspace?.contextPack.acceptedSkills).toHaveLength(0);
    expect(workspace?.records.some((record) => record.type === 'rule')).toBe(false);
    expect(workspace?.learning.skillRevisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nextContent: acceptedSource.learning.acceptedSkills[0]?.nextContent,
        status: 'proposed',
        changeReason: 'Inherited from Source web product; explicit acceptance required before active use.',
      }),
    ]));
  });

  it('routes risky canonical business-line learning through a global Decision', async () => {
    const created = await service.create({
      title: 'Canonical business line',
      goal: 'Prove learning loop without a legacy task',
      kind: 'software_product',
    });

    const reviewed = await service.recordReview({
      businessLineId: created.id,
      resultSummary: 'A canonical business line learned a decision rule.',
      skillUpdateSuggestions: ['Escalate risky policy changes before applying them.'],
      nextActionSuggestions: ['Draft the next canonical action.'],
      requiresDecision: true,
    });

    expect(reviewed.nextActions).toHaveLength(1);
    expect(reviewed.nextActions[0]?.nextStep).toBe('Draft the next canonical action.');
    expect(reviewed.overview.nextSuggestion).toMatchObject({
      businessLineId: created.id,
      nextStep: 'Draft the next canonical action.',
      taskId: reviewed.nextActions[0]?.id,
      type: 'progress',
    });
    await expect(service.listTodaySuggestions()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessLineId: created.id,
        nextStep: 'Draft the next canonical action.',
        taskId: reviewed.nextActions[0]?.id,
        type: 'progress',
      }),
    ]));
    expect(decisionService.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'policy_change',
      businessLineId: created.id,
      scope: 'business_line',
      taskId: null,
    }));
  });

  it('reads canonical business-line actions and resolves durable object ownership', async () => {
    const created = await service.create({
      title: 'Canonical owned business line',
      goal: 'Own durable work directly',
      kind: 'software_product',
    });
    const ownedTask = await taskService.create({
      title: 'Owned canonical action',
      businessLineId: created.id,
    });
    await taskService.update({
      id: ownedTask.id,
      nextStep: 'Execute owned canonical action.',
    });

    const workspace = await service.getWorkspace(created.id);
    expect(workspace?.nextActions.map((task) => task.id)).toContain(ownedTask.id);
    await expect(service.listTodaySuggestions()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessLineId: created.id,
        taskId: ownedTask.id,
        nextStep: 'Execute owned canonical action.',
      }),
    ]));
    await expect(businessLineRepository.resolveBusinessLineForTask(ownedTask.id)).resolves.toBe(created.id);

    const runRepository = new RunRepository();
    const run = await runRepository.create({
      taskId: ownedTask.id,
      businessLineId: created.id,
      type: 'draft',
    });
    expect(run.businessLineId).toBe(created.id);
    await expect(businessLineRepository.resolveBusinessLineForRun(run.id)).resolves.toBe(created.id);

    const decision = await new DecisionRepository().create({
      businessLineId: created.id,
      title: 'Confirm canonical business-line policy',
      scope: 'business_line',
      kind: 'policy_change',
      sourceType: 'system',
    });
    expect(decision.businessLineId).toBe(created.id);
    await expect(businessLineRepository.resolveBusinessLineForDecision(decision.id)).resolves.toBe(created.id);

    const source = await new SourceContextRepository().create({
      taskId: ownedTask.id,
      title: 'Owned source',
      kind: 'note',
      runId: run.id,
    });
    await expect(businessLineRepository.resolveBusinessLineForSource(source.id)).resolves.toBe(created.id);

    const artifact = await new ArtifactRepository().createFromRun({
      taskId: ownedTask.id,
      runId: run.id,
      runType: 'draft',
      content: 'Owned artifact',
    });
    await expect(businessLineRepository.resolveBusinessLineForArtifact(artifact.id)).resolves.toBe(created.id);

    const taskFile = await new TaskFileRepository().create({
      taskId: ownedTask.id,
      name: 'Owned note.md',
      kind: 'file',
      content: 'Owned file',
    });
    await expect(businessLineRepository.resolveBusinessLineForTaskFile(taskFile.id)).resolves.toBe(created.id);
  });

  it('projects business memory records with provenance and only includes marked records in context', async () => {
    const created = await service.create({
      title: 'Projected memory line',
      goal: 'Use records as business memory',
      kind: 'software_product',
    });
    const other = await service.create({
      title: 'Other memory line',
      goal: 'Stay excluded',
      kind: 'software_product',
    });
    const ownedTask = await taskService.create({
      title: 'Projection action',
      businessLineId: created.id,
    });
    const run = await new RunRepository().create({
      taskId: ownedTask.id,
      businessLineId: created.id,
      type: 'draft',
    });
    const keySource = await new SourceContextRepository().create({
      taskId: ownedTask.id,
      businessLineId: created.id,
      title: 'Verified signal',
      kind: 'note',
      note: 'Customer success asked for faster onboarding.',
      isKey: true,
      credibility: 'verified',
      runId: run.id,
    });
    const crossBusinessSource = await new SourceContextRepository().create({
      taskId: ownedTask.id,
      businessLineId: other.id,
      title: 'Foreign signal',
      kind: 'note',
      note: 'This should stay out of the current business line.',
      isKey: true,
    });
    const artifact = await new ArtifactRepository().createFromRun({
      taskId: ownedTask.id,
      businessLineId: created.id,
      runId: run.id,
      runType: 'draft',
      content: 'Draft artifact output',
    });
    const crossBusinessArtifact = await new ArtifactRepository().createFromRun({
      taskId: ownedTask.id,
      businessLineId: other.id,
      runId: run.id,
      runType: 'draft',
      content: 'Foreign artifact output',
    });
    const taskFile = await new TaskFileRepository().create({
      taskId: ownedTask.id,
      businessLineId: created.id,
      name: 'Memory note.md',
      kind: 'file',
      content: 'Business memory file',
    });
    const crossBusinessFile = await new TaskFileRepository().create({
      taskId: ownedTask.id,
      businessLineId: other.id,
      name: 'Foreign note.md',
      kind: 'file',
      content: 'Foreign business memory file',
    });
    decisionStore.push({
      id: 'decision_projected_memory',
      taskId: ownedTask.id,
      businessLineId: created.id,
      title: 'Approve projected memory policy',
      status: 'pending',
      scope: 'business_line',
      kind: 'policy_change',
      sourceType: 'system',
      sourceId: null,
      sourceLabel: 'Projected memory policy',
      createdAt: '2026-05-29T00:00:00.000Z',
      updatedAt: '2026-05-29T00:00:00.000Z',
    });
    decisionStore.push({
      id: 'decision_foreign_memory',
      taskId: ownedTask.id,
      businessLineId: other.id,
      title: 'Foreign decision',
      status: 'pending',
      scope: 'business_line',
      kind: 'policy_change',
      sourceType: 'system',
      sourceId: null,
      sourceLabel: 'Foreign policy',
      createdAt: '2026-05-29T00:00:00.000Z',
      updatedAt: '2026-05-29T00:00:00.000Z',
    });
    await service.recordReview({
      businessLineId: created.id,
      sourceActionId: ownedTask.id,
      resultSummary: 'Review confirmed projected memory should guide the next action.',
      confidence: 82,
    });

    const workspace = await service.getWorkspace(created.id);
    const recordSourceIds = workspace!.records.map((record) => record.provenance?.sourceId);

    expect(workspace?.records.every((record) => record.provenance)).toBe(true);
    expect(workspace?.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `source_context:${keySource.id}`,
        type: 'signal',
        shouldAffectFutureContext: true,
        futureContextReason: expect.stringContaining('marked key'),
        provenance: expect.objectContaining({
          sourceType: 'source_context',
          sourceId: keySource.id,
          taskId: ownedTask.id,
          runId: run.id,
        }),
      }),
      expect.objectContaining({
        id: `artifact:${artifact.id}`,
        type: 'result',
        shouldAffectFutureContext: false,
        provenance: expect.objectContaining({
          sourceType: 'artifact',
          sourceId: artifact.id,
        }),
      }),
      expect.objectContaining({
        id: `task_file:${taskFile.id}`,
        type: 'artifact',
        shouldAffectFutureContext: false,
        provenance: expect.objectContaining({
          sourceType: 'task_file',
          sourceId: taskFile.id,
        }),
      }),
      expect.objectContaining({
        id: 'decision:decision_projected_memory',
        type: 'decision',
        shouldAffectFutureContext: true,
        provenance: expect.objectContaining({
          sourceType: 'decision',
          sourceId: 'decision_projected_memory',
        }),
      }),
      expect.objectContaining({
        type: 'review',
        shouldAffectFutureContext: true,
        provenance: expect.objectContaining({
          sourceType: 'review',
        }),
      }),
    ]));
    expect(recordSourceIds).not.toContain(crossBusinessSource.id);
    expect(recordSourceIds).not.toContain(crossBusinessArtifact.id);
    expect(recordSourceIds).not.toContain(crossBusinessFile.id);
    expect(recordSourceIds).not.toContain('decision_foreign_memory');

    const contextRecordIds = workspace!.contextPack.latestRecords.map((record) => record.id);
    expect(contextRecordIds).toContain(`source_context:${keySource.id}`);
    expect(contextRecordIds).toContain('decision:decision_projected_memory');
    expect(contextRecordIds).not.toContain(`artifact:${artifact.id}`);
    expect(contextRecordIds).not.toContain(`task_file:${taskFile.id}`);
    const promptContext = formatBusinessLineContextPackForPrompt(workspace!);
    expect(promptContext).toContain('Verified signal');
    expect(promptContext).not.toContain('Draft artifact output');
  });

  it('resolves legacy project child durable objects through the parent business line', async () => {
    const project = await taskService.create({
      title: 'Legacy project business line',
      summary: 'Existing task-only project',
      taskType: 'project',
      taskFacets: ['project'],
    });
    const [line] = await service.list();
    expect(line).toMatchObject({
      legacyTaskId: project.id,
    });
    const childTask = await taskService.create({
      title: 'Legacy child execution task',
      parentTaskId: project.id,
    });

    await expect(businessLineRepository.resolveBusinessLineForTask(childTask.id)).resolves.toBe(line!.id);

    const run = await new RunRepository().create({
      taskId: childTask.id,
      type: 'draft',
    });
    await expect(businessLineRepository.resolveBusinessLineForRun(run.id)).resolves.toBe(line!.id);

    const source = await new SourceContextRepository().create({
      taskId: childTask.id,
      title: 'Legacy child source',
      kind: 'note',
      runId: run.id,
    });
    await expect(businessLineRepository.resolveBusinessLineForSource(source.id)).resolves.toBe(line!.id);

    const artifact = await new ArtifactRepository().createFromRun({
      taskId: childTask.id,
      runId: run.id,
      runType: 'draft',
      content: 'Legacy child artifact',
    });
    await expect(businessLineRepository.resolveBusinessLineForArtifact(artifact.id)).resolves.toBe(line!.id);

    const taskFile = await new TaskFileRepository().create({
      taskId: childTask.id,
      name: 'Legacy child note.md',
      kind: 'file',
      content: 'Legacy child file',
    });
    await expect(businessLineRepository.resolveBusinessLineForTaskFile(taskFile.id)).resolves.toBe(line!.id);
  });

  it('keeps canonical linked actions after the action record falls out of display windows', async () => {
    const created = await service.create({
      title: 'Canonical long-lived business line',
      goal: 'Keep action membership stable',
      kind: 'software_product',
    });
    const reviewed = await service.recordReview({
      businessLineId: created.id,
      resultSummary: 'Review produced an action.',
      nextActionSuggestions: ['Stable canonical action.'],
    });
    const actionTaskId = reviewed.nextActions[0]!.id;
    await expect(businessLineRepository.listActionTaskIds(created.id)).resolves.toContain(actionTaskId);
    await expect(taskService.getDetail(actionTaskId)).resolves.toMatchObject({
      businessLineId: created.id,
    });

    for (let index = 0; index < 60; index += 1) {
      await businessLineRepository.createRecord({
        businessLineId: created.id,
        type: 'signal',
        source: `later-source:${index}`,
        summary: `Later record ${index}`,
      });
    }

    const workspace = await service.getWorkspace(created.id);
    expect(workspace?.nextActions.map((task) => task.id)).toContain(actionTaskId);
    await expect(service.listTodaySuggestions()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessLineId: created.id,
        taskId: actionTaskId,
        nextStep: 'Stable canonical action.',
        type: 'progress',
      }),
    ]));

    await new TaskRepository().transition({ id: actionTaskId, nextState: 'completed' });
    const completedWorkspace = await service.getWorkspace(created.id);
    expect(completedWorkspace?.nextActions.map((task) => task.id)).not.toContain(actionTaskId);

    const archivedReview = await service.recordReview({
      businessLineId: created.id,
      resultSummary: 'Review produced an action that will be archived.',
      nextActionSuggestions: ['Stable canonical action to archive.'],
    });
    const archivedActionTaskId = archivedReview.nextActions[0]!.id;
    await new TaskRepository().transition({ id: archivedActionTaskId, nextState: 'archived' });
    const archivedWorkspace = await service.getWorkspace(created.id);
    expect(archivedWorkspace?.nextActions.map((task) => task.id)).not.toContain(archivedActionTaskId);
  });
});

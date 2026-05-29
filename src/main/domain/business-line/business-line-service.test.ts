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
    await expect(service.listTodaySuggestions()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessLineId: line!.id,
        nextStep: 'Update Today suggestion trust layer.',
        taskId: reviewed.nextActions[0]?.id,
        type: 'progress',
      }),
    ]));
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

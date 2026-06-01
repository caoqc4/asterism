import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDatabase, initDatabase, setDatabaseUserDataPathForTests } from '../../db/client.js';
import { businessLineSkillRevisions } from '../../db/schema.js';
import { BusinessLineRepository } from '../../db/repositories/business-line-repository.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { BlockerRepository } from '../../db/repositories/blocker-repository.js';
import { CompletionCriteriaRepository } from '../../db/repositories/completion-criteria-repository.js';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { ProcessTemplateRepository } from '../../db/repositories/process-template-repository.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { SourceContextRepository } from '../../db/repositories/source-context-repository.js';
import { TaskDependencyRepository } from '../../db/repositories/task-dependency-repository.js';
import { TaskFileRepository } from '../../db/repositories/task-file-repository.js';
import { TaskProcessBindingRepository } from '../../db/repositories/task-process-binding-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { WaitingItemRepository } from '../../db/repositories/waiting-item-repository.js';
import { formatBusinessLineContextPackForPrompt } from '../../../shared/business-line-context-pack.js';
import {
  buildNativeCliAdapterContract,
  formatNativeCliAdapterContractForStep,
} from '../../../shared/native-cli-adapter-contract.js';
import { classifyRunScope } from '../../../shared/run-scope.js';
import { buildTaskplaneWritebackApprovalItems } from '../../../shared/taskplane-writeback-approval.js';
import { dispatchTaskplaneWritebackApplyPlan } from '../../../shared/taskplane-writeback-dispatch.js';
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

  it('blocks queued Next Action writes until the Taskplane writeback gate is confirmed', async () => {
    await taskService.create({
      title: 'GoalPilot product',
      taskType: 'project',
      taskFacets: ['project'],
    });
    const [line] = await service.list();
    const before = await service.getWorkspace(line!.id);
    const beforeActionIds = before?.contextPack.openNextActions.map((action) => action.id) ?? [];

    await expect(service.createQueuedBusinessLineNextAction({
      businessLineId: line!.id,
      currentRunStatus: 'running',
      evidenceRunId: 'run_queue',
      nextStep: 'Draft the queued checklist.',
      operatorConfirmed: false,
      sourceActionId: line!.legacyTaskId,
      title: 'Draft queued checklist',
    })).rejects.toThrow('Queued Next Action write requires a confirmed Taskplane writeback gate.');

    const workspace = await service.getWorkspace(line!.id);
    expect(workspace?.contextPack.openNextActions.map((action) => action.id)).toEqual(beforeActionIds);
  });

  it('adds a queued Next Action behind the current run after writeback confirmation', async () => {
    await taskService.create({
      title: 'GoalPilot product',
      taskType: 'project',
      taskFacets: ['project'],
    });
    const [line] = await service.list();

    const created = await service.createQueuedBusinessLineNextAction({
      businessLineId: line!.id,
      currentRunStatus: 'running',
      evidenceRunId: 'run_queue',
      nextStep: 'Draft the queued checklist.',
      operatorConfirmed: true,
      riskLevel: 'low',
      sourceActionId: line!.legacyTaskId,
      summary: 'Follow-up from the current run.',
      title: 'Draft queued checklist',
    });

    expect(created).toMatchObject({
      businessLineId: line!.id,
      nextStep: 'Draft the queued checklist.',
      parentTaskId: line!.legacyTaskId,
      riskLevel: 'low',
      title: 'Draft queued checklist',
    });
    const workspace = await service.getWorkspace(line!.id);
    expect(workspace?.contextPack.openNextActions.map((action) => action.id)).toContain(created.id);
    expect(workspace?.records.some((record) =>
      record.type === 'action'
      && record.linkedActionId === created.id
      && record.source === 'run:run_queue')).toBe(true);
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

  it('records completed-run review options as business records, next actions, and proposed SOP revisions', async () => {
    const created = await service.create({
      title: 'Run review product',
      goal: 'Learn from completed execution',
      kind: 'software_product',
    });
    const action = await taskService.create({
      title: 'Run the launch check',
      businessLineId: created.id,
    });

    const workspace = await service.recordReview({
      businessLineId: created.id,
      sourceActionId: action.id,
      sourceRunId: 'run_business_line_execution',
      resultSummary: 'The completed run found launch evidence.',
      evidenceItems: ['Run run_business_line_execution completed.'],
      recordSuggestions: [{
        type: 'result',
        source: 'run:run_business_line_execution',
        summary: 'Launch evidence changed the next recommendation.',
        confidence: 82,
        shouldAffectFutureContext: true,
      }],
      nextActionSuggestions: ['Follow up on launch evidence.'],
      skillUpdateSuggestions: ['When launch evidence changes, review it before ranking the next action.'],
      confidence: 82,
    });

    expect(workspace.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'result',
        source: 'run:run_business_line_execution',
        linkedActionId: action.id,
        summary: 'Launch evidence changed the next recommendation.',
      }),
      expect.objectContaining({
        type: 'review',
        linkedActionId: action.id,
        summary: 'The completed run found launch evidence.',
      }),
    ]));
    expect(workspace.nextActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessLineId: created.id,
        nextStep: 'Follow up on launch evidence.',
      }),
    ]));
    expect(workspace.learning.skillRevisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nextContent: 'When launch evidence changes, review it before ranking the next action.',
        status: 'proposed',
      }),
    ]));
    expect(workspace.overview.nextSuggestion).toMatchObject({
      businessLineId: created.id,
      type: 'progress',
    });
  });

  it('smoke-tests the CLI-first business line runtime loop through Next Action, run evidence, Write Intent, review, SOP gate, and Today', async () => {
    const created = await service.create({
      title: 'Migration smoke product',
      goal: 'Prove Business is the primary work owner.',
      kind: 'software_product',
      template: 'custom',
      initialRecords: ['Initial market signal should guide execution.'],
      initialNextActions: ['Run the first business-line action.'],
    });
    expect(created.legacyTaskId).toBeNull();

    const initialWorkspace = await service.getWorkspace(created.id);
    const initialAction = initialWorkspace!.nextActions[0]!;
    expect(initialWorkspace?.businessLine).toMatchObject({
      id: created.id,
      legacyTaskId: null,
    });
    expect(initialAction).toMatchObject({
      businessLineId: created.id,
      nextStep: 'Run the first business-line action.',
    });

    const initialToday = await service.listTodaySuggestions();
    expect(initialToday[0]).toMatchObject({
      businessLineId: created.id,
      taskId: initialAction.id,
      type: 'progress',
      nextStep: 'Run the first business-line action.',
    });
    const runPromptContext = formatBusinessLineContextPackForPrompt(initialWorkspace!);
    expect(runPromptContext).toContain('BusinessLineContextPack');
    expect(runPromptContext).toContain('Run the first business-line action.');

    const runtimeOutput = JSON.stringify({
      type: 'TASKPLANE_WRITE_INTENTS',
      intents: [
        {
          type: 'business_record.create',
          summary: 'Runtime evidence changed the business-line recommendation.',
          recordType: 'result',
          shouldAffectFutureContext: true,
          confidence: 86,
        },
        {
          type: 'business_next_action.create',
          title: 'Follow the runtime evidence',
          nextStep: 'Follow the runtime evidence with the next business action.',
          summary: 'The approved runtime writeback created the next executable carrier.',
        },
        {
          type: 'business_sop_revision.propose',
          nextContent: 'When runtime evidence changes priority, cite the approved business record before suggesting the next action.',
          changeReason: 'Runtime evidence changed priority.',
          requiresDecision: false,
        },
      ],
    });
    const runRepository = new RunRepository();
    const runStepRepository = new RunStepRepository();
    const run = await runRepository.create({
      taskId: initialAction.id,
      businessLineId: created.id,
      type: 'agent',
      instructions: [
        'Agent CLI (Codex CLI) read-only: Execute the first business-line action.',
        'selectedAgentScheme=codex',
        'selectedCliRuntime=codex',
        runPromptContext,
      ].join('\n\n'),
    });
    const runScope = classifyRunScope({
      businessLineId: created.id,
      requestSurface: 'right_panel_task_progress_intent',
      taskBusinessLineId: initialAction.businessLineId,
      taskId: initialAction.id,
    });
    const nativeCliContract = buildNativeCliAdapterContract({
      capabilityMode: 'native',
      commandPreview: 'codex exec --json --sandbox read-only --cd /workspace -',
      contextManifest: {
        activeSurface: 'next_action',
        capabilityAllowance: {
          businessLineSkillPolicy: 'business_memory_only',
          globalConfigurationPolicy: 'global_capability_configuration',
          source: 'per_action_context_manifest',
          surfaces: [],
          summary: 'files=read_only tools=runtime_native writeback=write_intent_only',
        },
        exclusionReasons: [],
        items: [{
          contentIncluded: true,
          id: 'business-line-context-pack',
          kind: 'task_state',
          label: 'BusinessLineContextPack',
        }],
        summary: 'businessLineContextPack=attached / nextAction=attached / writeBoundary=proposal_only',
        userFacingSummary: 'Business line context and Next Action are ready for the selected Agent CLI.',
      },
      runId: run.id,
      runScope,
      runtimeCapabilities: {
        commandRouting: {
          passthroughRequiresExplicitNamespace: true,
          productOwned: ['/goal', '/status', '/cancel'],
          runtimeNative: ['/codex goal'],
        },
        defaultPermissionMode: 'read_only',
        defaultResetStrategy: 'product_transcript_reset',
        executionKind: 'cli',
        id: 'codex',
        label: 'Codex CLI',
        nativeGoalMode: {
          availability: 'available',
          minimumVersion: '0.133.0',
          reason: 'Detected.',
        },
        supportsClearGoal: true,
        supportsNativeCompact: false,
        supportsNativeClear: false,
        supportsNativeGoalMode: true,
        supportsPauseGoal: false,
        supportsResumeGoal: false,
        supportsSingleRun: true,
        supportsStructuredProgressEvents: true,
        supportsWorkspaceWrite: false,
      },
      runtimeId: 'codex',
      runtimeLabel: 'Codex CLI',
      sandboxMode: 'read-only',
      taskId: initialAction.id,
      taskTitle: initialAction.title,
      workspaceRoot: '/workspace',
    });
    await runStepRepository.create({
      runId: run.id,
      kind: 'plan',
      title: 'agent cli run accepted',
      output: 'Agent CLI run context assembly gate ready. selectedCliRuntime=codex businessLineContextPack=included nextActionCarrier=attached',
    });
    await runStepRepository.create({
      runId: run.id,
      kind: 'plan',
      title: 'Native CLI adapter contract',
      input: JSON.stringify(nativeCliContract),
      output: formatNativeCliAdapterContractForStep(nativeCliContract),
    });
    await runStepRepository.create({
      runId: run.id,
      kind: 'model',
      title: 'codex cli completed',
      output: runtimeOutput,
    });
    await runStepRepository.create({
      runId: run.id,
      kind: 'decision',
      title: '验收子 Agent 检查',
      input: JSON.stringify({
        decision: 'accept_for_review',
        runtime: 'codex_cli',
        businessLineId: created.id,
        taskId: initialAction.id,
      }),
      output: 'Verdict: pass\nVerifier decision: accept_for_review\nCan mark task complete: no\nNext action: review_business_line_write_intents',
    });
    const completedRun = await runRepository.updateResult(
      run.id,
      'completed',
      runtimeOutput,
      'ai',
    );
    expect(completedRun.instructions).toContain('BusinessLineContextPack');
    expect(completedRun.instructions).toContain('selectedCliRuntime=codex');
    expect(completedRun.businessLineId).toBe(created.id);
    const runSteps = await runStepRepository.listForRun(run.id);
    expect(runSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'agent cli run accepted',
        output: expect.stringContaining('selectedCliRuntime=codex'),
      }),
      expect.objectContaining({
        title: 'Native CLI adapter contract',
        output: expect.stringContaining('selected_cli_runtime=codex'),
      }),
      expect.objectContaining({
        title: 'codex cli completed',
        output: expect.stringContaining('TASKPLANE_WRITE_INTENTS'),
      }),
      expect.objectContaining({
        title: '验收子 Agent 检查',
        input: expect.stringContaining('"runtime":"codex_cli"'),
        output: expect.stringContaining('Verifier decision: accept_for_review'),
      }),
    ]));
    expect(runSteps.find((step) => step.title === 'Native CLI adapter contract')?.output)
      .toContain('directProductMutationAllowed=no');
    expect(runSteps.find((step) => step.title === 'Native CLI adapter contract')?.output)
      .toContain('postRunReview=agent_runtime_verification');
    await new TaskRepository().transition({ id: initialAction.id, nextState: 'completed' });

    const approvalItems = buildTaskplaneWritebackApprovalItems({
      runDetails: [completedRun],
      taskId: initialAction.id,
      taskTitle: initialAction.title,
    });
    expect(approvalItems.filter((item) => item.kind === 'business_line').map((item) => item.plan.action)).toEqual([
      'business_record.create',
      'business_next_action.create',
      'business_sop_revision.propose',
    ]);
    expect(approvalItems.filter((item) => item.kind === 'business_line')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'runtime_write_intent',
        summary: expect.stringContaining('确认'),
      }),
    ]));
    for (const item of approvalItems.filter((candidate) => candidate.kind === 'business_line')) {
      await expect(dispatchTaskplaneWritebackApplyPlan({
        taskId: initialAction.id,
        plan: item.plan,
        ports: {
          createBusinessLineRecord: (input) => service.createBusinessLineRecord(input),
          createBusinessLineNextAction: (input) => input.queuePolicy
            ? service.createQueuedBusinessLineNextAction({
                ...input,
                currentRunStatus: input.queuePolicy.currentRunStatus,
                interruptCurrentRun: input.queuePolicy.interruptCurrentRun,
                operatorConfirmed: true,
                riskLevel: input.queuePolicy.riskLevel,
                riskNote: input.queuePolicy.riskNote,
              })
            : service.createBusinessLineNextAction(input),
          proposeBusinessLineSopRevision: (input) => service.proposeBusinessLineSopRevision(input),
          recordTimelineEvent: (taskId, type, payload) => taskService.recordTimelineEvent({ taskId, type, payload }),
        },
      })).resolves.toMatchObject({
        action: item.plan.action,
        status: 'completed',
      });
    }

    const afterWriteback = await service.getWorkspace(created.id);
    const writebackAction = afterWriteback!.nextActions.find((action) =>
      action.nextStep === 'Follow the runtime evidence with the next business action.')!;
    const nonRiskyRevision = afterWriteback!.learning.skillRevisions.find((revision) =>
      revision.nextContent === 'When runtime evidence changes priority, cite the approved business record before suggesting the next action.')!;
    expect(afterWriteback?.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'result',
        linkedActionId: initialAction.id,
        summary: 'Runtime evidence changed the business-line recommendation.',
      }),
    ]));
    expect(writebackAction).toMatchObject({
      businessLineId: created.id,
      parentTaskId: null,
    });
    expect(nonRiskyRevision).toMatchObject({
      businessLineId: created.id,
      status: 'proposed',
    });

    const reviewed = await service.recordReview({
      businessLineId: created.id,
      sourceActionId: initialAction.id,
      sourceRunId: run.id,
      resultSummary: 'Post-run review recorded the approved runtime outcome.',
      evidenceItems: [`Run ${run.id} completed.`],
      recordSuggestions: [{
        type: 'result',
        source: `run:${run.id}`,
        summary: 'Review confirmed that approved runtime evidence should shape future context.',
        confidence: 84,
        shouldAffectFutureContext: true,
      }],
      skillUpdateSuggestions: ['Change pricing and publishing policy without further review.'],
      confidence: 84,
      requiresDecision: true,
    });

    expect(reviewed.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'review',
        linkedActionId: initialAction.id,
        provenance: expect.objectContaining({ sourceType: 'review' }),
      }),
      expect.objectContaining({
        type: 'result',
        linkedActionId: initialAction.id,
        source: `run:${run.id}`,
        summary: 'Review confirmed that approved runtime evidence should shape future context.',
      }),
    ]));

    const accepted = await service.acceptSkillRevision({
      revisionId: nonRiskyRevision.id,
      approvedBy: 'tester',
    });
    expect(accepted.learning.acceptedSkills[0]?.nextContent).toContain('approved business record');

    const changedToday = await service.listTodaySuggestions();
    expect(changedToday[0]).toMatchObject({
      businessLineId: created.id,
      taskId: writebackAction.id,
      type: 'progress',
      nextStep: 'Follow the runtime evidence with the next business action.',
    });
    expect(changedToday[0]?.taskId).not.toBe(initialAction.id);
    expect(changedToday[0]?.sourceRecords.join(' ')).toContain('approved business record');

    const riskyRevision = reviewed.learning.skillRevisions.find((revision) =>
      revision.nextContent === 'Change pricing and publishing policy without further review.')!;
    expect(decisionService.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'policy_change',
      businessLineId: created.id,
      scope: 'business_line',
      taskId: null,
      sourceId: riskyRevision.sourceReviewId,
    }));
    await expect(service.acceptSkillRevision({
      revisionId: riskyRevision.id,
      approvedBy: 'tester',
    })).rejects.toThrow(/requires an approved Decision/);
    const finalWorkspace = await service.getWorkspace(created.id);
    const finalContext = formatBusinessLineContextPackForPrompt(finalWorkspace!);
    expect(finalContext).toContain('approved business record');
    expect(finalContext).not.toContain('Change pricing and publishing policy without further review.');
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

  it('generates deterministic Today suggestions with impact, effort, confidence, source ids, and non-executable record gaps', async () => {
    const progressLine = await service.create({
      title: 'Progress business line',
      goal: 'Ship the next useful increment.',
      kind: 'software_product',
    });
    const progressTask = await taskService.create({
      title: 'Progress action',
      businessLineId: progressLine.id,
    });
    await taskService.update({
      id: progressTask.id,
      nextStep: 'Run the customer evidence review.',
      riskLevel: 'medium',
      riskNote: 'Touches customer-facing prioritization.',
    });
    const progressRecord = await businessLineRepository.createRecord({
      businessLineId: progressLine.id,
      type: 'signal',
      source: 'manual:evidence',
      summary: 'Customer evidence changed the release priority.',
      shouldAffectFutureContext: true,
    });

    const improvementLine = await service.create({
      title: 'Improvement business line',
      goal: 'Turn learning into action.',
      kind: 'software_product',
    });
    const improvementReview = await service.recordReview({
      businessLineId: improvementLine.id,
      resultSummary: 'Post-action review changed the operating rule.',
      skillUpdateSuggestions: ['Review customer evidence before choosing the next action.'],
    });
    await service.acceptSkillRevision({
      revisionId: improvementReview.learning.skillRevisions[0]!.id,
      approvedBy: 'tester',
    });

    const gapLine = await service.create({
      title: 'Record gap business line',
      kind: 'software_product',
    });

    const suggestions = await service.listTodaySuggestions();
    const progress = suggestions.find((suggestion) => suggestion.businessLineId === progressLine.id)!;
    const improvement = suggestions.find((suggestion) => suggestion.businessLineId === improvementLine.id)!;
    const gap = suggestions.find((suggestion) => suggestion.businessLineId === gapLine.id)!;

    expect(suggestions.map((suggestion) => suggestion.type).slice(0, 3)).toEqual([
      'progress',
      'improvement',
      'record_gap',
    ]);
    expect(progress).toMatchObject({
      type: 'progress',
      businessLineId: progressLine.id,
      taskId: progressTask.id,
      nextStep: 'Run the customer evidence review.',
      expectedImpact: expect.stringContaining('Move Progress business line forward'),
      effort: {
        level: 'medium',
        note: 'One focused execution step.',
      },
      risk: {
        level: 'medium',
        note: 'Touches customer-facing prioritization.',
      },
      requiresDecision: false,
    });
    expect(progress.confidence).toBeGreaterThanOrEqual(80);
    expect(progress.sourceRecordIds).toContain(progressRecord.id);
    expect(progress.sourceRecords.join(' ')).toContain('Customer evidence changed the release priority.');

    expect(improvement).toMatchObject({
      type: 'improvement',
      businessLineId: improvementLine.id,
      taskId: null,
      nextStep: 'Create or choose the next business-line action using the accepted learning.',
      expectedImpact: expect.stringContaining('Turn accepted learning into a concrete next action'),
      effort: {
        level: 'low',
        note: 'Planning step to choose or create the next action.',
      },
      requiresDecision: false,
    });
    expect(improvement.sourceRecordIds).toContain(`review:${improvementReview.learning.reviews[0]!.id}`);
    expect(improvement.sourceRecords.join(' ')).toContain('Review customer evidence before choosing the next action.');

    expect(gap).toMatchObject({
      type: 'record_gap',
      businessLineId: gapLine.id,
      taskId: null,
      nextStep: 'Capture the business-line goal before choosing executable work.',
      expectedImpact: expect.stringContaining('before selecting work'),
      effort: {
        level: 'low',
        note: 'Context capture only; not executable delivery work.',
      },
      confidence: 45,
      sourceRecordIds: [],
      sourceRecords: [],
      requiresDecision: false,
    });
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
    const sourceOnlyRecord = await businessLineRepository.createRecord({
      businessLineId: source.id,
      type: 'signal',
      source: 'source-only:future-context',
      summary: 'Do not leak this source business-line record into target context.',
      shouldAffectFutureContext: true,
    });

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
        shouldAffectFutureContext: false,
        provenance: expect.objectContaining({
          sourceBusinessLineId: source.id,
        }),
      }),
    ]));
    expect(workspace?.contextPack.latestRecords.map((record) => record.source))
      .not.toContain(`business_line:${source.id}:structure`);
    expect(workspace?.contextPack.latestRecords.map((record) => record.id))
      .not.toContain(sourceOnlyRecord.id);
    expect(workspace?.learning.acceptedSkills).toHaveLength(0);
    expect(workspace?.contextPack.acceptedSkills).toHaveLength(0);
    expect(workspace?.records.some((record) => record.type === 'rule')).toBe(false);
    expect(workspace?.learning.skillRevisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nextContent: acceptedSource.learning.acceptedSkills[0]?.nextContent,
        status: 'proposed',
        changeReason: 'Inherited from Source web product; explicit acceptance required before active use.',
        provenance: expect.objectContaining({
          sourceBusinessLineId: source.id,
          sourceBusinessLineTitle: 'Source web product',
          sourceSkillRevisionId: acceptedSource.learning.acceptedSkills[0]?.id,
        }),
      }),
    ]));

    const inheritedRevision = workspace!.learning.skillRevisions.find((revision) =>
      revision.provenance?.sourceType === 'inherited');
    expect(inheritedRevision).toBeTruthy();
    const activated = await service.acceptSkillRevision({
      revisionId: inheritedRevision!.id,
      approvedBy: 'tester',
    });
    expect(activated.contextPack.acceptedSkills.map((revision) => revision.id))
      .toContain(inheritedRevision!.id);
    expect(activated.contextPack.acceptedSkills[0]?.provenance).toEqual(expect.objectContaining({
      sourceBusinessLineId: source.id,
      sourceSkillRevisionId: acceptedSource.learning.acceptedSkills[0]?.id,
    }));
  });

  it('keeps non-future records and inactive or expired SOP revisions out of the default context pack', async () => {
    const created = await service.create({
      title: 'Context boundary line',
      goal: 'Only approved and eligible memory reaches context.',
      kind: 'software_product',
    });
    const futureRecord = await businessLineRepository.createRecord({
      businessLineId: created.id,
      type: 'signal',
      source: 'manual:future',
      summary: 'Future eligible business record.',
      shouldAffectFutureContext: true,
    });
    const evidenceOnlyRecord = await businessLineRepository.createRecord({
      businessLineId: created.id,
      type: 'signal',
      source: 'manual:evidence_only',
      summary: 'Evidence-only business record.',
      shouldAffectFutureContext: false,
    });
    const acceptedReview = await service.recordReview({
      businessLineId: created.id,
      resultSummary: 'Accepted SOP emerged.',
      skillUpdateSuggestions: ['Use only non-expired accepted SOPs in context.'],
    });
    const accepted = await service.acceptSkillRevision({
      revisionId: acceptedReview.learning.skillRevisions[0]!.id,
      approvedBy: 'tester',
    });
    const acceptedRevision = accepted.learning.acceptedSkills[0]!;
    await service.recordReview({
      businessLineId: created.id,
      resultSummary: 'Proposed SOP should stay evidence-only.',
      skillUpdateSuggestions: ['Proposed SOP should not enter context.'],
    });
    const rejectedReview = await service.recordReview({
      businessLineId: created.id,
      resultSummary: 'Rejected SOP should stay evidence-only.',
      skillUpdateSuggestions: ['Rejected SOP should not enter context.'],
    });
    const rejectedRevision = rejectedReview.learning.skillRevisions.find((revision) =>
      revision.nextContent === 'Rejected SOP should not enter context.')!;
    await service.rejectSkillRevision({
      revisionId: rejectedRevision.id,
      rejectedBy: 'tester',
    });

    const beforeExpiry = await service.getWorkspace(created.id);
    expect(beforeExpiry?.records.map((record) => record.id)).toEqual(expect.arrayContaining([
      futureRecord.id,
      evidenceOnlyRecord.id,
    ]));
    expect(beforeExpiry?.contextPack.latestRecords.map((record) => record.id)).toContain(futureRecord.id);
    expect(beforeExpiry?.contextPack.latestRecords.map((record) => record.id)).not.toContain(evidenceOnlyRecord.id);
    expect(beforeExpiry?.contextPack.acceptedSkills.map((revision) => revision.nextContent)).toEqual([
      'Use only non-expired accepted SOPs in context.',
    ]);
    expect(beforeExpiry?.contextPack.acceptedSkills.map((revision) => revision.nextContent))
      .not.toContain('Proposed SOP should not enter context.');
    expect(beforeExpiry?.contextPack.acceptedSkills.map((revision) => revision.nextContent))
      .not.toContain('Rejected SOP should not enter context.');

    await initDatabase()
      .update(businessLineSkillRevisions)
      .set({
        expiresAt: '2000-01-01T00:00:00.000Z',
      })
      .where(eq(businessLineSkillRevisions.id, acceptedRevision.id));

    const afterExpiry = await service.getWorkspace(created.id);
    const expiredRevision = afterExpiry?.learning.skillRevisions.find((revision) =>
      revision.id === acceptedRevision.id);
    expect(expiredRevision).toMatchObject({
      status: 'active',
      isExpired: true,
    });
    expect(afterExpiry?.learning.acceptedSkills.map((revision) => revision.id))
      .not.toContain(acceptedRevision.id);
    expect(afterExpiry?.contextPack.acceptedSkills.map((revision) => revision.id))
      .not.toContain(acceptedRevision.id);
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
    await expect(businessLineRepository.resolveBusinessLineOwnership({ taskId: ownedTask.id })).resolves.toMatchObject({
      status: 'resolved',
      businessLineId: created.id,
      legacy: false,
      source: 'task',
      taskId: ownedTask.id,
    });
    await expect(businessLineRepository.resolveBusinessLineOwnership({
      explicitBusinessLineId: created.id,
    })).resolves.toMatchObject({
      status: 'resolved',
      businessLineId: created.id,
      source: 'explicit',
    });
    await expect(businessLineRepository.resolveBusinessLineOwnership({
      allowOneOff: true,
    })).resolves.toMatchObject({
      status: 'one_off',
      businessLineId: null,
    });
    await expect(businessLineRepository.resolveBusinessLineOwnership({
      explicitBusinessLineId: 'missing_business_line',
    })).resolves.toMatchObject({
      status: 'missing',
      reason: 'business_line_not_found',
      missingBusinessLineId: 'missing_business_line',
    });
    const other = await service.create({
      title: 'Other ownership line',
      goal: 'Reject mismatched carriers',
      kind: 'software_product',
    });
    await expect(businessLineRepository.resolveBusinessLineOwnership({
      explicitBusinessLineId: other.id,
      taskId: ownedTask.id,
    })).resolves.toMatchObject({
      status: 'mismatch',
      explicitBusinessLineId: other.id,
      resolvedBusinessLineId: created.id,
      resolvedSource: 'task',
      taskId: ownedTask.id,
    });

    const runRepository = new RunRepository();
    const run = await runRepository.create({
      taskId: ownedTask.id,
      type: 'draft',
    });
    expect(run.businessLineId).toBeNull();
    await expect(businessLineRepository.resolveBusinessLineForRun(run.id)).resolves.toBe(created.id);
    await expect(businessLineRepository.resolveBusinessLineOwnership({ runId: run.id })).resolves.toMatchObject({
      status: 'resolved',
      businessLineId: created.id,
      source: 'run_task',
      taskId: ownedTask.id,
      runId: run.id,
    });

    const decision = await new DecisionRepository().create({
      taskId: ownedTask.id,
      title: 'Confirm canonical business-line policy',
      scope: 'business_line',
      kind: 'policy_change',
      sourceType: 'system',
    });
    expect(decision.businessLineId).toBeNull();
    await expect(businessLineRepository.resolveBusinessLineForDecision(decision.id)).resolves.toBe(created.id);
    await expect(businessLineRepository.resolveBusinessLineOwnership({ decisionId: decision.id })).resolves.toMatchObject({
      status: 'resolved',
      businessLineId: created.id,
      source: 'decision_task',
      taskId: ownedTask.id,
      decisionId: decision.id,
    });

    const source = await new SourceContextRepository().create({
      taskId: ownedTask.id,
      title: 'Owned source',
      kind: 'note',
      runId: run.id,
    });
    await expect(businessLineRepository.resolveBusinessLineForSource(source.id)).resolves.toBe(created.id);
    await expect(businessLineRepository.resolveBusinessLineOwnership({ sourceContextId: source.id })).resolves.toMatchObject({
      status: 'resolved',
      businessLineId: created.id,
      source: 'source_context_run',
      sourceContextId: source.id,
      runId: run.id,
    });

    const artifact = await new ArtifactRepository().createFromRun({
      taskId: ownedTask.id,
      runId: run.id,
      runType: 'draft',
      content: 'Owned artifact',
    });
    await expect(businessLineRepository.resolveBusinessLineForArtifact(artifact.id)).resolves.toBe(created.id);
    await expect(businessLineRepository.resolveBusinessLineOwnership({ artifactId: artifact.id })).resolves.toMatchObject({
      status: 'resolved',
      businessLineId: created.id,
      source: 'artifact_run',
      artifactId: artifact.id,
      runId: run.id,
    });

    const taskFile = await new TaskFileRepository().create({
      taskId: ownedTask.id,
      name: 'Owned note.md',
      kind: 'file',
      content: 'Owned file',
    });
    await expect(businessLineRepository.resolveBusinessLineForTaskFile(taskFile.id)).resolves.toBe(created.id);
    await expect(businessLineRepository.resolveBusinessLineOwnership({ taskFileId: taskFile.id })).resolves.toMatchObject({
      status: 'resolved',
      businessLineId: created.id,
      source: 'task_file_task',
      taskFileId: taskFile.id,
      taskId: ownedTask.id,
    });
  });

  it('applies business-line-native writeback through resolved service ownership', async () => {
    const created = await service.create({
      title: 'Native writeback business line',
      goal: 'Persist business-native writeback',
      kind: 'software_product',
    });
    const sourceAction = await taskService.create({
      title: 'Owned execution carrier',
      businessLineId: created.id,
    });

    const record = await service.createBusinessLineRecord({
      businessLineId: null,
      sourceActionId: sourceAction.id,
      source: 'run:run_business',
      summary: 'Business-native signal persisted through service.',
      type: 'signal',
    });
    const nextAction = await service.createBusinessLineNextAction({
      businessLineId: null,
      evidenceRunId: 'run_business',
      sourceActionId: sourceAction.id,
      title: 'Draft native writeback checklist',
    });
    const revision = await service.proposeBusinessLineSopRevision({
      businessLineId: null,
      changeReason: 'Runtime proposed a reusable rule.',
      evidenceRunId: 'run_business',
      nextContent: 'Verify business-native writebacks before activation.',
      requiresDecision: true,
      sourceActionId: sourceAction.id,
    });

    expect(record).toMatchObject({
      businessLineId: created.id,
      linkedActionId: sourceAction.id,
      summary: 'Business-native signal persisted through service.',
      type: 'signal',
    });
    expect(nextAction).toMatchObject({
      businessLineId: created.id,
      nextStep: 'Draft native writeback checklist',
    });
    expect(revision).toMatchObject({
      businessLineId: created.id,
      nextContent: 'Verify business-native writebacks before activation.',
      status: 'proposed',
    });
    expect(decisionService.create).toHaveBeenCalledWith(expect.objectContaining({
      businessLineId: created.id,
      kind: 'policy_change',
      sourceLabel: 'Business Line SOP revision writeback',
    }));
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
    await expect(businessLineRepository.resolveBusinessLineOwnership({ taskId: childTask.id })).resolves.toMatchObject({
      status: 'resolved',
      businessLineId: line!.id,
      legacy: true,
      source: 'legacy_task',
      taskId: childTask.id,
    });

    const run = await new RunRepository().create({
      taskId: childTask.id,
      type: 'draft',
    });
    await expect(businessLineRepository.resolveBusinessLineForRun(run.id)).resolves.toBe(line!.id);
    await expect(businessLineRepository.resolveBusinessLineOwnership({ runId: run.id })).resolves.toMatchObject({
      status: 'resolved',
      businessLineId: line!.id,
      legacy: true,
      source: 'run_task',
      taskId: childTask.id,
      runId: run.id,
    });

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

  it('projects scheduled/event tasks and external previews as business-line automations and read-only sensors', async () => {
    const created = await service.create({
      title: 'Business-line automation loop',
      goal: 'Continuously watch customer signals',
      kind: 'software_product',
    });
    const scheduledTask = await taskService.create({
      title: 'Watch Gmail for customer escalation signals',
      summary: 'Read-only Gmail monitoring loop.',
      taskType: 'scheduled',
      taskFacets: ['scheduled', 'routine'],
      businessLineId: created.id,
    });
    await new SourceContextRepository().create({
      taskId: scheduledTask.id,
      businessLineId: created.id,
      title: 'Gmail escalation candidate',
      kind: 'doc',
      uri: 'gmail://message/escalation_1',
      note: 'Connector source: Gmail:escalation_1',
      batchId: 'connector:gmail:escalation_1',
      credibility: 'verified',
    });
    const externalRecord = await businessLineRepository.createRecord({
      businessLineId: created.id,
      type: 'signal',
      source: 'external_access:gmail:reviewed_preview',
      summary: 'External signal reviewed from Gmail: escalation candidate.',
      confidence: 80,
      linkedActionId: scheduledTask.id,
      shouldAffectFutureContext: false,
    });

    const workspace = await service.getWorkspace(created.id);

    expect(workspace?.automations.automations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessLineId: created.id,
        loopId: `business_line_loop:${created.id}:${scheduledTask.id}`,
        carrierTaskId: scheduledTask.id,
        taskId: scheduledTask.id,
        kind: 'scheduled',
        triggerLabel: 'Scheduled loop',
        mutationBoundary: expect.stringContaining('Standing Approval'),
        readinessEvidence: expect.objectContaining({
          businessLineId: created.id,
          carrierTaskId: scheduledTask.id,
          runtime: 'runtime_gate_required',
          standingApproval: 'required',
          runLimit: 'required',
          reviewBoundary: 'post_step_review_required',
        }),
      }),
    ]));
    expect(workspace?.automations.sensors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceType: 'scheduled_task',
        readOnly: true,
        confirmationBoundary: 'confirmation_or_valid_loop_policy',
        reviewBoundary: expect.stringContaining('candidate record'),
      }),
      expect.objectContaining({
        sourceType: 'external_access',
        sourceLabel: 'gmail',
        readOnly: true,
      }),
    ]));
    expect(workspace?.records.map((record) => record.id)).toContain(externalRecord.id);
    expect(workspace?.contextPack.latestRecords.map((record) => record.id)).not.toContain(externalRecord.id);
    expect(workspace?.contextPack.permissionBoundaries.join('\n')).toContain('Business-line sensors are read-only');
    expect(workspace?.contextPack.permissionBoundaries.join('\n')).toContain('External Access previews');
  });
});

import { describe, expect, it } from 'vitest';

import {
  buildApiRuntimeChatAssistantInvocation,
  buildApiRuntimeDecisionDraftInvocation,
  buildApiRuntimeDecompositionDraftInvocation,
  buildDeferredAgentApiExecutionRunInvocation,
  buildLocalTaskTypeReviewInvocation,
  buildProductHarnessDecisionDraftInvocation,
  buildProductHarnessMemoryProposalInvocation,
  buildProductHarnessVerificationAssistInvocation,
  evaluateAgentApiDecompositionPromotionReadiness,
  evaluateAgentApiDecompositionPromotionReadinessFromEvidence,
  evaluateAgentApiExecutionPromotionReadiness,
  evaluateAgentApiExecutionPromotionReadinessFromEvidence,
  evaluateAgentApiExecutionPromotionReadinessForInvocation,
} from './ai-runtime-invocation.js';
import { buildSubtaskCreateManyWritebackApplyPlan } from './taskplane-writeback-apply-plan.js';

describe('ai runtime invocation contract', () => {
  it('wraps local task type review in the same invocation shape future runtimes can return', () => {
    const invocation = buildLocalTaskTypeReviewInvocation({
      taskId: 'task_project',
      taskTitle: '开发小程序',
      currentType: 'simple',
    });

    expect(invocation).toMatchObject({
      phase: 'task_type_review',
      layer: 'local_rule',
      runtime: {
        mode: 'local_rule',
        label: '本地结构化类型规则',
      },
      status: 'completed',
      proposal: {
        taskId: 'task_project',
        currentType: 'simple',
        suggestedType: 'project',
        source: 'local_rule',
      },
    });
    expect(invocation.summary).toContain('项目型');
  });

  it('wraps API-runtime project decomposition drafts without turning them into writes', () => {
    const invocation = buildApiRuntimeDecompositionDraftInvocation({
      draft: {
        parentGoal: '上线小程序',
        subtasks: [
          {
            title: '需求与范围确认',
            summary: '确认范围',
            acceptanceCriteria: '范围文档可验收',
            dependency: null,
            rationale: '独立边界清楚',
          },
        ],
        review: '粒度合适',
        nextStep: '请确认创建',
      },
    });

    expect(invocation).toMatchObject({
      phase: 'decomposition_draft',
      layer: 'api_runtime',
      runtime: {
        mode: 'api',
        label: 'Agent API Runtime 规划',
      },
      status: 'completed',
    });
    expect(invocation.draft.subtasks).toHaveLength(1);
    expect(invocation.summary).toContain('1 个项目子任务草稿');
  });

  it('promotes Agent API decomposition only through a reversible proposal card and create-many apply plan', () => {
    const blocked = evaluateAgentApiDecompositionPromotionReadiness({
      applyPlan: null,
      reversibleProposalCardReady: false,
    });

    expect(blocked).toMatchObject({
      ready: false,
      satisfiedRequirements: [],
      missingRequirements: [
        'selected_runtime_contract',
        'parent_task_identity',
        'reversible_proposal_card',
        'subtask_create_many_apply_plan',
        'agent_api_decomposition_source',
        'operator_confirmation_boundary',
        'draft_only_timeline_evidence',
      ],
    });
    expect(blocked.summary).toContain('ready=no');
    expect(blocked.summary).toContain('promotionReady=no');
    expect(blocked.summary).toContain('requirements=0/7');
    expect(blocked.summary).toContain('promotionRequirements=0/7');
    expect(blocked.summary).toContain('promotionMissingRequirements=selected_runtime_contract,parent_task_identity,reversible_proposal_card');

    const applyPlan = buildSubtaskCreateManyWritebackApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [{
        acceptanceCriteria: '范围文档可验收',
        dependency: null,
        summary: '确认范围',
        title: '需求与范围确认',
      }],
    });
    const ready = evaluateAgentApiDecompositionPromotionReadiness({
      applyPlan,
      reversibleProposalCardReady: true,
      selectedRuntimeContractReady: true,
    });

    expect(ready).toMatchObject({
      ready: true,
      satisfiedRequirements: [
        'selected_runtime_contract',
        'parent_task_identity',
        'reversible_proposal_card',
        'subtask_create_many_apply_plan',
        'agent_api_decomposition_source',
        'operator_confirmation_boundary',
        'draft_only_timeline_evidence',
      ],
      missingRequirements: [],
    });
    expect(ready.summary).toContain('selectedRuntimeContract=ready');
    expect(ready.summary).toContain('promotionReady=yes');
    expect(ready.summary).toContain('requirements=7/7');
    expect(ready.summary).toContain('promotionRequirements=7/7');
    expect(ready.summary).toContain('parentTask=task_project');
    expect(ready.summary).toContain('applyPlanParentTask=task_project');
    expect(ready.summary).toContain('parentTaskEvidenceChain=ready');
    expect(ready.summary).toContain('proposalCard=ready');
    expect(ready.summary).toContain('applyPlan=subtask.create_many');
    expect(ready.summary).toContain('source=agent_api_decomposition');
    expect(ready.summary).toContain('proposalId=missing');
    expect(ready.summary).toContain('subtaskCount=1');
    expect(ready.summary).toContain('evidenceRunId=run_api_decomposition');
    expect(ready.summary).toContain('confirmationBoundary=operator_confirmed_subtask_create_many');
    expect(ready.summary).toContain('draftOnlyBeforeConfirmation=true');
    expect(ready.summary).toContain('runtimeMode=missing');
    expect(ready.summary).toContain('invocationLayer=missing');
    expect(ready.summary).toContain('missingRequirements=none');
    expect(ready.summary).toContain('promotionMissingRequirements=none');
    expect(ready.summary).toContain('missing=none');
  });

  it('derives Agent API decomposition promotion readiness from structured service evidence', () => {
    const partialApplyPlan = buildSubtaskCreateManyWritebackApplyPlan({
      evidenceRunId: 'run_cli_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_cli_decomposition',
      subtasks: [buildSubtaskDraft()],
    });
    const partial = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan: partialApplyPlan,
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        status: 'ready',
        subtaskCount: 1,
        subtaskTitles: ['需求与范围确认'],
      },
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(partial).toMatchObject({
      ready: false,
      satisfiedRequirements: [
        'selected_runtime_contract',
        'parent_task_identity',
        'reversible_proposal_card',
        'subtask_create_many_apply_plan',
        'operator_confirmation_boundary',
        'draft_only_timeline_evidence',
      ],
      missingRequirements: ['agent_api_decomposition_source'],
    });
    expect(partial.summary).toContain('requirements=6/7');
    expect(partial.summary).toContain('promotionMissingRequirements=agent_api_decomposition_source');
    expect(partial.summary).toContain('proposalId=project_decomposition:task_project');
    expect(partial.summary).toContain('expectedProposalId=project_decomposition:task_project');
    expect(partial.summary).toContain('proposalIdEvidenceChain=ready');
    expect(partial.summary).toContain('proposalSubtaskCount=1');
    expect(partial.summary).toContain('applyPlanSubtaskCount=1');
    expect(partial.summary).toContain('proposalSubtaskEvidenceChain=ready');
    expect(partial.summary).toContain('proposalSubtaskTitles=需求与范围确认');
    expect(partial.summary).toContain('applyPlanSubtaskTitles=需求与范围确认');
    expect(partial.summary).toContain('proposalSubtaskIdentityChain=ready');
    expect(partial.summary).toContain('subtaskCount=1');
    expect(partial.summary).toContain('evidenceRunId=run_cli_decomposition');
    expect(partial.summary).toContain('confirmationBoundary=operator_confirmed_subtask_create_many');
    expect(partial.summary).toContain('draftOnlyBeforeConfirmation=true');
    expect(partial.summary).toContain('runtimeMode=api');
    expect(partial.summary).toContain('invocationLayer=api_runtime');

    const readyApplyPlan = buildSubtaskCreateManyWritebackApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });
    const ready = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan: readyApplyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        status: 'ready',
        subtaskCount: 1,
        subtaskTitles: ['需求与范围确认'],
      },
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(ready).toMatchObject({
      ready: true,
      missingRequirements: [],
    });
    expect(ready.summary).toContain('requirements=7/7');
    expect(ready.summary).toContain('source=agent_api_decomposition');
    expect(ready.summary).toContain('proposalId=project_decomposition:task_project');
    expect(ready.summary).toContain('expectedProposalId=project_decomposition:task_project');
    expect(ready.summary).toContain('proposalIdEvidenceChain=ready');
    expect(ready.summary).toContain('proposalParentTask=task_project');
    expect(ready.summary).toContain('proposalTaskEvidenceChain=ready');
    expect(ready.summary).toContain('proposalSubtaskCount=1');
    expect(ready.summary).toContain('applyPlanSubtaskCount=1');
    expect(ready.summary).toContain('proposalSubtaskEvidenceChain=ready');
    expect(ready.summary).toContain('proposalSubtaskTitles=需求与范围确认');
    expect(ready.summary).toContain('applyPlanSubtaskTitles=需求与范围确认');
    expect(ready.summary).toContain('proposalSubtaskIdentityChain=ready');
    expect(ready.summary).toContain('parentTask=task_project');
    expect(ready.summary).toContain('applyPlanParentTask=task_project');
    expect(ready.summary).toContain('parentTaskEvidenceChain=ready');
    expect(ready.summary).toContain('evidenceRunId=run_api_decomposition');
    expect(ready.summary).toContain('subtaskCount=1');
    expect(ready.summary).toContain('confirmationBoundary=operator_confirmed_subtask_create_many');
    expect(ready.summary).toContain('draftOnlyBeforeConfirmation=true');
    expect(ready.summary).toContain('runtimeMode=api');
    expect(ready.summary).toContain('invocationLayer=api_runtime');
  });

  it('blocks Agent API decomposition promotion when parent-task evidence is stitched from another task', () => {
    const applyPlan = buildSubtaskCreateManyWritebackApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project_a',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project_b',
      reversibleProposalCard: {
        parentTaskId: 'task_project_b',
        proposalId: 'project_decomposition:task_project_b',
        status: 'ready',
        subtaskCount: 1,
        subtaskTitles: ['需求与范围确认'],
      },
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['parent_task_identity', 'reversible_proposal_card'],
    });
    expect(mismatch.summary).toContain('parentTask=task_project_b');
    expect(mismatch.summary).toContain('applyPlanParentTask=task_project_a');
    expect(mismatch.summary).toContain('parentTaskEvidenceChain=missing');
    expect(mismatch.summary).toContain('promotionMissingRequirements=parent_task_identity');
  });

  it('blocks Agent API decomposition promotion when the reversible proposal belongs to another parent task', () => {
    const applyPlan = buildSubtaskCreateManyWritebackApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project_a',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project_a',
      reversibleProposalCard: {
        parentTaskId: 'task_project_b',
        proposalId: 'project_decomposition:task_project_b',
        status: 'ready',
        subtaskTitles: ['需求与范围确认'],
      },
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['reversible_proposal_card'],
    });
    expect(mismatch.summary).toContain('proposalCard=missing');
    expect(mismatch.summary).toContain('proposalParentTask=task_project_b');
    expect(mismatch.summary).toContain('proposalTaskEvidenceChain=missing');
    expect(mismatch.summary).toContain('promotionMissingRequirements=reversible_proposal_card');
  });

  it('blocks Agent API decomposition promotion when the proposal subtask count does not match the apply plan', () => {
    const applyPlan = buildSubtaskCreateManyWritebackApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        status: 'ready',
        subtaskCount: 2,
        subtaskTitles: ['需求与范围确认'],
      },
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['reversible_proposal_card'],
    });
    expect(mismatch.summary).toContain('proposalCard=missing');
    expect(mismatch.summary).toContain('proposalTaskEvidenceChain=ready');
    expect(mismatch.summary).toContain('proposalSubtaskCount=2');
    expect(mismatch.summary).toContain('applyPlanSubtaskCount=1');
    expect(mismatch.summary).toContain('proposalSubtaskEvidenceChain=missing');
    expect(mismatch.summary).toContain('promotionMissingRequirements=reversible_proposal_card');
  });

  it('blocks Agent API decomposition promotion when the proposal id does not match the parent task', () => {
    const applyPlan = buildSubtaskCreateManyWritebackApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'proposal_1',
        status: 'ready',
        subtaskCount: 1,
        subtaskTitles: ['需求与范围确认'],
      },
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['reversible_proposal_card'],
    });
    expect(mismatch.summary).toContain('proposalId=proposal_1');
    expect(mismatch.summary).toContain('expectedProposalId=project_decomposition:task_project');
    expect(mismatch.summary).toContain('proposalIdEvidenceChain=missing');
    expect(mismatch.summary).toContain('proposalCard=missing');
  });

  it('blocks Agent API decomposition promotion when proposal subtask titles do not match the apply plan', () => {
    const applyPlan = buildSubtaskCreateManyWritebackApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        status: 'ready',
        subtaskCount: 1,
        subtaskTitles: ['Different child task'],
      },
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['reversible_proposal_card'],
    });
    expect(mismatch.summary).toContain('proposalSubtaskEvidenceChain=ready');
    expect(mismatch.summary).toContain('proposalSubtaskTitles=Different child task');
    expect(mismatch.summary).toContain('applyPlanSubtaskTitles=需求与范围确认');
    expect(mismatch.summary).toContain('proposalSubtaskIdentityChain=missing');
    expect(mismatch.summary).toContain('proposalCard=missing');
  });

  it('wraps decision drafts with API-runtime provenance', () => {
    const invocation = buildApiRuntimeDecisionDraftInvocation({
      draft: {
        taskId: 'task_1',
        title: '是否上线',
        rationale: '需要拍板上线窗口。',
        suggestedScope: 'task',
        suggestedKind: 'direction_choice',
        suggestedSourceType: 'manual',
        source: 'ai',
        selectedTemplateIds: [],
        selectedTemplateTitles: [],
        selectionReason: '未使用模板。',
      },
      runtimeLabel: 'Agent API Runtime · openai / gpt-test',
    });

    expect(invocation).toMatchObject({
      phase: 'decision_draft',
      layer: 'api_runtime',
      runtime: {
        mode: 'api',
        label: 'Agent API Runtime · openai / gpt-test',
      },
      status: 'completed',
      draft: {
        source: 'ai',
        title: '是否上线',
      },
    });
  });

  it('wraps fallback decision drafts as product harness work', () => {
    const invocation = buildProductHarnessDecisionDraftInvocation({
      draft: {
        taskId: 'task_1',
        title: '本地草稿',
        rationale: 'AI 不可用时仍给用户一个可确认草稿。',
        suggestedScope: 'task',
        suggestedKind: 'direction_choice',
        suggestedSourceType: 'manual',
        source: 'fallback',
        selectedTemplateIds: [],
        selectedTemplateTitles: [],
        selectionReason: '未评估模板。',
      },
    });

    expect(invocation).toMatchObject({
      phase: 'decision_draft',
      layer: 'product_harness',
      runtime: {
        mode: 'product_harness',
        label: 'Taskplane 本地决策草稿',
      },
      status: 'skipped',
    });
  });

  it('wraps API-runtime chat assistant responses with phase provenance', () => {
    const globalInvocation = buildApiRuntimeChatAssistantInvocation({
      phase: 'global_assistant',
      runtimeLabel: 'Agent API Runtime · openai / gpt-test',
      text: '今天先看阻塞。',
    });
    const taskInvocation = buildApiRuntimeChatAssistantInvocation({
      phase: 'task_assistant',
      pilotDecision: {
        backend: 'agent_api',
        backendPlan: {
          backend: 'agent_api',
          maxTurns: 1,
          outputContract: 'pilot_decision_summary',
          reason: 'A short model-assisted Pilot judgment may resolve ambiguous routing before execution.',
          status: 'requested',
          triggers: ['multi_task_priority'],
        },
        confidence: 'model_assisted',
        executor: 'agent_api',
        messagePriority: 'follow_up',
        movement: 'execute',
        operationMode: 'bounded_decision_backend',
        priorityLane: 'steady',
        reason: 'Pilot selected execute via api_runtime.',
      },
      text: '下一步是补齐验收标准。',
    });

    expect(globalInvocation).toMatchObject({
      phase: 'global_assistant',
      layer: 'api_runtime',
      runtime: {
        mode: 'api',
        label: 'Agent API Runtime · openai / gpt-test',
      },
      status: 'completed',
      text: '今天先看阻塞。',
    });
    expect(taskInvocation.summary).toContain('任务上下文');
    expect(taskInvocation.pilotDecision?.backendPlan.outputContract).toBe('pilot_decision_summary');
  });

  it('represents Agent API task execution as an explicit deferred execution_run invocation', () => {
    const invocation = buildDeferredAgentApiExecutionRunInvocation({
      runtimeLabel: 'Agent API Runtime · openai / gpt-test',
    });

    expect(invocation).toMatchObject({
      phase: 'execution_run',
      layer: 'api_runtime',
      runtime: {
        mode: 'api',
        label: 'Agent API Runtime · openai / gpt-test',
      },
      status: 'skipped',
    });
    expect(invocation.summary).toContain('no provider-visible execution_run starts');
    expect(invocation.summary).toContain('context-readiness');
    expect(invocation.summary).toContain('writeback harness gates');
    expect(invocation.summary).toContain('promotionReady=no');
    expect(invocation.summary).toContain('promotionRequirements=0/11');
    expect(invocation.summary).toContain('requiredGates=0/9');
    expect(invocation.summary).toContain('promotionMissingRequirements=selected_runtime_contract,target_task_identity,provider_visible_preflight');
    expect(invocation.summary).toContain('executionRunMissingRequirements=selected_runtime_contract,target_task_identity,provider_visible_preflight');
    expect(invocation.summary).toContain('missingGates=simplicity_check,runtime_action,runtime_context_assembly');
    expect(invocation.deferredReason).toContain('Agent API Runtime task execution remains deferred');
    expect(invocation.promotionRequirements).toEqual([
      'selected_runtime_contract',
      'target_task_identity',
      'provider_visible_preflight',
      'runtime_context_manifest',
      'context_readiness_step',
      'task_memory_guidance',
      'run_goal_contract',
      'write_intent_extraction',
      'reviewed_patch_apply_boundary',
      'post_step_verification',
      'run_evidence_persistence',
    ]);
    expect(invocation.promotionRequirements).toContain('write_intent_extraction');
    expect(invocation.promotionRequirements).toContain('reviewed_patch_apply_boundary');
    expect(invocation.promotionRequirements).toContain('selected_runtime_contract');
    expect(invocation.promotionRequirements).toContain('target_task_identity');
    expect(invocation.requiredGates).toEqual([
      'simplicity_check',
      'runtime_action',
      'runtime_context_assembly',
      'context_readiness',
      'task_memory_coverage',
      'task_memory_guidance',
      'pre_step',
      'subtask_start',
      'post_step',
    ]);
    expect(invocation.requiredGates).toContain('context_readiness');
    expect(invocation.requiredGates).toContain('runtime_context_assembly');
    expect(invocation.requiredGates).toContain('post_step');

    const readiness = evaluateAgentApiExecutionPromotionReadinessForInvocation(invocation);

    expect(readiness).toMatchObject({
      ready: false,
      satisfiedRequirements: [],
      satisfiedGates: [],
      missingRequirements: invocation.promotionRequirements,
      missingGates: invocation.requiredGates,
    });
    expect(readiness.summary).toContain('requirements=0/11');
    expect(readiness.summary).toContain('gates=0/9');
  });

  it('keeps Agent API execution promotion closed until every requirement and gate has service evidence', () => {
    const blocked = evaluateAgentApiExecutionPromotionReadiness({
      satisfiedGates: [
        'simplicity_check',
        'runtime_action',
        'runtime_context_assembly',
      ],
      satisfiedRequirements: [
        'selected_runtime_contract',
        'target_task_identity',
        'provider_visible_preflight',
        'runtime_context_manifest',
        'context_readiness_step',
      ],
    });

    expect(blocked).toMatchObject({
      ready: false,
      satisfiedRequirements: [
        'selected_runtime_contract',
        'target_task_identity',
        'provider_visible_preflight',
        'runtime_context_manifest',
        'context_readiness_step',
      ],
      missingRequirements: expect.arrayContaining([
        'task_memory_guidance',
        'run_goal_contract',
        'write_intent_extraction',
        'reviewed_patch_apply_boundary',
        'post_step_verification',
        'run_evidence_persistence',
      ]),
      missingGates: expect.arrayContaining([
        'context_readiness',
        'task_memory_coverage',
        'task_memory_guidance',
        'pre_step',
        'subtask_start',
        'post_step',
      ]),
    });
    expect(blocked.summary).toContain('ready=no');
    expect(blocked.summary).toContain('requirements=5/11');
    expect(blocked.summary).toContain('gates=3/9');

    const ready = evaluateAgentApiExecutionPromotionReadiness({
      satisfiedGates: [
        'simplicity_check',
        'runtime_action',
        'runtime_context_assembly',
        'context_readiness',
        'task_memory_coverage',
        'task_memory_guidance',
        'pre_step',
        'subtask_start',
        'post_step',
      ],
      satisfiedRequirements: [
        'selected_runtime_contract',
        'target_task_identity',
        'provider_visible_preflight',
        'runtime_context_manifest',
        'context_readiness_step',
        'task_memory_guidance',
        'run_goal_contract',
        'write_intent_extraction',
        'reviewed_patch_apply_boundary',
        'post_step_verification',
        'run_evidence_persistence',
      ],
    });

    expect(ready).toMatchObject({
      ready: true,
      missingRequirements: [],
      missingGates: [],
    });
    expect(ready.summary).toContain('ready=yes');
    expect(ready.summary).toContain('missingRequirements=none');
    expect(ready.summary).toContain('missingGates=none');
  });

  it('derives Agent API execution promotion readiness from structured service evidence', () => {
    const partial = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      contextManifestSummary: 'task=task_1 / files=2',
      contextReadinessStep: {
        status: 'ready',
        stepId: 'step_context_ready',
      },
      gates: {
        simplicity_check: true,
        runtime_action: true,
        runtime_context_assembly: true,
      },
      providerVisiblePreflight: {
        configuredProvider: 'openai',
        providerConfigured: true,
        runId: 'run_api_execution_partial',
        startupProbe: 'not_called',
        status: 'ready',
        taskId: 'task_1',
      },
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runtimeMode: 'api',
      },
      targetTaskId: 'task_1',
    });

    expect(partial).toMatchObject({
      ready: false,
      satisfiedRequirements: [
        'selected_runtime_contract',
        'target_task_identity',
        'provider_visible_preflight',
        'runtime_context_manifest',
        'context_readiness_step',
      ],
      satisfiedGates: [
        'simplicity_check',
        'runtime_action',
        'runtime_context_assembly',
      ],
      missingRequirements: expect.arrayContaining([
        'task_memory_guidance',
        'run_goal_contract',
        'write_intent_extraction',
        'reviewed_patch_apply_boundary',
        'post_step_verification',
        'run_evidence_persistence',
      ]),
    });
    expect(partial.summary).toContain('requirements=5/11');
    expect(partial.summary).toContain('gates=3/9');
    expect(partial.summary).toContain('targetTask=task_1');
    expect(partial.summary).toContain('runEvidenceTask=missing');
    expect(partial.summary).toContain('targetTaskEvidenceChain=ready');
    expect(partial.summary).toContain('providerConfigured=ready');
    expect(partial.summary).toContain('configuredProvider=openai');
    expect(partial.summary).toContain('providerStartupProbe=not_called');
    expect(partial.summary).toContain('providerPreflightRun=run_api_execution_partial');
    expect(partial.summary).toContain('providerPreflightRunEvidenceChain=ready');
    expect(partial.summary).toContain('providerPreflightTask=task_1');
    expect(partial.summary).toContain('providerPreflightTaskEvidenceChain=ready');
    expect(partial.summary).toContain('runId=missing');
    expect(partial.summary).toContain('writeIntentRun=missing');
    expect(partial.summary).toContain('writeIntentRunEvidenceChain=missing');
    expect(partial.summary).toContain('writeIntentTask=missing');
    expect(partial.summary).toContain('writeIntentTaskEvidenceChain=missing');
    expect(partial.summary).toContain('contextStep=step_context_ready');
    expect(partial.summary).toContain('contextManifest=task=task_1 / files=2');
    expect(partial.summary).toContain('writeIntentActions=none');
    expect(partial.summary).toContain('runtimeMode=api');
    expect(partial.summary).toContain('invocationLayer=api_runtime');

    const ready = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
    });

    expect(ready).toMatchObject({
      ready: true,
      missingRequirements: [],
      missingGates: [],
    });
    expect(ready.summary).toContain('requirements=11/11');
    expect(ready.summary).toContain('gates=9/9');
    expect(ready.summary).toContain('targetTask=task_1');
    expect(ready.summary).toContain('runEvidenceTask=task_1');
    expect(ready.summary).toContain('targetTaskEvidenceChain=ready');
    expect(ready.summary).toContain('providerConfigured=ready');
    expect(ready.summary).toContain('configuredProvider=openai');
    expect(ready.summary).toContain('providerStartupProbe=not_called');
    expect(ready.summary).toContain('providerPreflightRun=run_api_execution');
    expect(ready.summary).toContain('providerPreflightRunEvidenceChain=ready');
    expect(ready.summary).toContain('providerPreflightTask=task_1');
    expect(ready.summary).toContain('providerPreflightTaskEvidenceChain=ready');
    expect(ready.summary).toContain('runId=run_api_execution');
    expect(ready.summary).toContain('writeIntentRun=run_api_execution');
    expect(ready.summary).toContain('writeIntentRunEvidenceChain=ready');
    expect(ready.summary).toContain('writeIntentTask=task_1');
    expect(ready.summary).toContain('writeIntentTaskEvidenceChain=ready');
    expect(ready.summary).toContain('taskMemoryGuidance=ready');
    expect(ready.summary).toContain('taskMemoryGuidanceCount=1');
    expect(ready.summary).toContain('runGoalConditions=1');
    expect(ready.summary).toContain('writeIntentActions=artifact.propose,task_file.propose');
    expect(ready.summary).toContain('reviewedPatchApplyBoundary=ready');
    expect(ready.summary).toContain('postStepVerifier=taskplane.verifier.lightweight');
    expect(ready.summary).toContain('terminalEvidence=present');

    const mismatch = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runEvidencePersistence: {
        runId: 'run_api_execution',
        taskId: 'task_2',
        terminalEvidenceStatus: 'present',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: expect.arrayContaining(['target_task_identity']),
    });
    expect(mismatch.summary).toContain('targetTask=task_1');
    expect(mismatch.summary).toContain('runEvidenceTask=task_2');
    expect(mismatch.summary).toContain('targetTaskEvidenceChain=missing');
  });

  it('requires patch artifact and task file write intents before satisfying execution writeback extraction', () => {
    const artifactOnly = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      writeIntentExtraction: {
        status: 'ready',
        supportedActions: ['artifact.propose'],
      },
    });

    expect(artifactOnly).toMatchObject({
      ready: false,
      missingRequirements: ['write_intent_extraction'],
    });
    expect(artifactOnly.summary).toContain('writeIntentActions=artifact.propose');
    expect(artifactOnly.summary).toContain('writeIntentRunEvidenceChain=missing');
    expect(artifactOnly.summary).toContain('writeIntentTaskEvidenceChain=missing');
  });

  it('requires write intent extraction to belong to the same run and target task', () => {
    const wrongRun = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      writeIntentExtraction: {
        runId: 'run_other',
        status: 'ready',
        supportedActions: ['artifact.propose', 'task_file.propose'],
        taskId: 'task_1',
      },
    });

    expect(wrongRun).toMatchObject({
      ready: false,
      missingRequirements: ['write_intent_extraction'],
    });
    expect(wrongRun.summary).toContain('writeIntentRun=run_other');
    expect(wrongRun.summary).toContain('writeIntentRunEvidenceChain=missing');
    expect(wrongRun.summary).toContain('writeIntentTaskEvidenceChain=ready');

    const wrongTask = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      writeIntentExtraction: {
        runId: 'run_api_execution',
        status: 'ready',
        supportedActions: ['artifact.propose', 'task_file.propose'],
        taskId: 'task_2',
      },
    });

    expect(wrongTask).toMatchObject({
      ready: false,
      missingRequirements: ['write_intent_extraction'],
    });
    expect(wrongTask.summary).toContain('writeIntentRunEvidenceChain=ready');
    expect(wrongTask.summary).toContain('writeIntentTask=task_2');
    expect(wrongTask.summary).toContain('writeIntentTaskEvidenceChain=missing');
  });

  it('requires provider-visible preflight to carry the configured provider identity', () => {
    const missingProvider = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      providerVisiblePreflight: {
        providerConfigured: true,
        startupProbe: 'not_called',
        status: 'ready',
      },
    });

    expect(missingProvider).toMatchObject({
      ready: false,
      missingRequirements: ['provider_visible_preflight'],
    });
    expect(missingProvider.summary).toContain('providerConfigured=ready');
    expect(missingProvider.summary).toContain('configuredProvider=missing');
    expect(missingProvider.summary).toContain('providerStartupProbe=not_called');
  });

  it('requires provider-visible preflight to belong to the same run and target task', () => {
    const wrongRun = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      providerVisiblePreflight: {
        configuredProvider: 'openai',
        providerConfigured: true,
        runId: 'run_other',
        startupProbe: 'not_called',
        status: 'ready',
        taskId: 'task_1',
      },
    });

    expect(wrongRun).toMatchObject({
      ready: false,
      missingRequirements: ['provider_visible_preflight'],
    });
    expect(wrongRun.summary).toContain('providerPreflightRun=run_other');
    expect(wrongRun.summary).toContain('providerPreflightRunEvidenceChain=missing');
    expect(wrongRun.summary).toContain('providerPreflightTaskEvidenceChain=ready');

    const wrongTask = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      providerVisiblePreflight: {
        configuredProvider: 'openai',
        providerConfigured: true,
        runId: 'run_api_execution',
        startupProbe: 'not_called',
        status: 'ready',
        taskId: 'task_2',
      },
    });

    expect(wrongTask).toMatchObject({
      ready: false,
      missingRequirements: ['provider_visible_preflight'],
    });
    expect(wrongTask.summary).toContain('providerPreflightRunEvidenceChain=ready');
    expect(wrongTask.summary).toContain('providerPreflightTask=task_2');
    expect(wrongTask.summary).toContain('providerPreflightTaskEvidenceChain=missing');
  });

  it('wraps product-harness verification and memory proposal phases', () => {
    const verification = buildProductHarnessVerificationAssistInvocation({
      verification: {
        evaluator: 'taskplane.verifier.lightweight',
        verdict: 'pass',
        decision: 'accept_for_review',
        reason: 'Runtime produced evidence.',
        evidence: ['stdout=present'],
        missingEvidence: [],
        nextAction: 'review_memory_proposal',
        userConfirmationRequired: true,
        canMarkTaskComplete: false,
        shouldProposeTaskMemory: true,
        contract: {
          completionConditionCount: 1,
          completionConditions: ['回答用户请求'],
          objective: '检查实现路径',
          runId: 'run_1',
          runtimeLabel: 'Codex CLI',
          taskGoalStatus: 'active',
          taskId: 'task_1',
        },
      },
    });
    const memory = buildProductHarnessMemoryProposalInvocation({
      sourceRunId: 'run_1',
      targets: ['task_record'],
      userConfirmationRequired: true,
    });

    expect(verification).toMatchObject({
      phase: 'verification_assist',
      layer: 'product_harness',
      runtime: {
        mode: 'product_harness',
        label: 'Taskplane lightweight verifier',
      },
      status: 'completed',
    });
    expect(memory).toMatchObject({
      phase: 'memory_proposal',
      layer: 'product_harness',
      proposal: {
        sourceRunId: 'run_1',
        targets: ['task_record'],
        userConfirmationRequired: true,
      },
    });
  });
});

function completeAgentApiExecutionPromotionEvidence() {
  return {
    contextManifestSummary: 'task=task_1 / files=2 / sourceContexts=1',
    contextReadinessStep: {
      status: 'ready' as const,
      stepId: 'step_context_ready',
    },
    gates: {
      simplicity_check: true,
      runtime_action: true,
      runtime_context_assembly: true,
      context_readiness: true,
      task_memory_coverage: true,
      task_memory_guidance: true,
      pre_step: true,
      subtask_start: true,
      post_step: true,
    },
    postStepVerification: {
      status: 'ready' as const,
      verifier: 'taskplane.verifier.lightweight',
    },
    providerVisiblePreflight: {
      configuredProvider: 'openai',
      providerConfigured: true,
      runId: 'run_api_execution',
      startupProbe: 'not_called' as const,
      status: 'ready' as const,
      taskId: 'task_1',
    },
    reviewedPatchApplyBoundary: {
      explicitApplyOnly: true,
      promotionPreflightReady: true,
    },
    runEvidencePersistence: {
      runId: 'run_api_execution',
      taskId: 'task_1',
      terminalEvidenceStatus: 'present' as const,
    },
    runGoalContract: {
      completionConditionCount: 1,
      objective: 'Produce reviewable task evidence.',
    },
    selectedRuntimeContract: {
      invocationLayer: 'api_runtime' as const,
      phase: 'execution_run' as const,
      runtimeMode: 'api' as const,
    },
    targetTaskId: 'task_1',
    taskMemoryGuidance: {
      guidanceCount: 1,
      status: 'ready' as const,
    },
    writeIntentExtraction: {
      runId: 'run_api_execution',
      status: 'ready' as const,
      supportedActions: ['artifact.propose', 'task_file.propose'],
      taskId: 'task_1',
    },
  };
}

function buildSubtaskDraft() {
  return {
    acceptanceCriteria: '范围文档可验收',
    dependency: null,
    summary: '确认范围',
    title: '需求与范围确认',
  };
}

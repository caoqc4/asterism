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
  deriveAgentApiDurableWritebackBoundaryFromTaskEvidence,
  evaluateAgentApiDecompositionPromotionReadiness,
  evaluateAgentApiDecompositionPromotionReadinessFromEvidence,
  evaluateAgentApiExecutionPromotionReadiness,
  evaluateAgentApiExecutionPromotionReadinessFromEvidence,
  evaluateAgentApiExecutionPromotionReadinessForInvocation,
} from './ai-runtime-invocation.js';
import type { AgentApiExecutionPromotionServiceEvidence } from './ai-runtime-invocation.js';
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

    const applyPlan = buildAgentApiDecompositionApplyPlan({
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
      parentTaskId: 'task_project',
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
    expect(ready.summary).toContain('timelineSource=agent_api_decomposition');
    expect(ready.summary).toContain('sourceEvidenceChain=ready');
    expect(ready.summary).toContain('proposalId=missing');
    expect(ready.summary).toContain('subtaskCount=1');
    expect(ready.summary).toContain('evidenceRunId=run_api_decomposition');
    expect(ready.summary).toContain('timelineEvidenceRunId=run_api_decomposition');
    expect(ready.summary).toContain('evidenceRunIdChain=ready');
    expect(ready.summary).toContain('confirmationBoundary=operator_confirmed_subtask_create_many');
    expect(ready.summary).toContain('draftOnlyBeforeConfirmation=true');
    expect(ready.summary).toContain('runtimeMode=missing');
    expect(ready.summary).toContain('invocationLayer=missing');
    expect(ready.summary).toContain('missingRequirements=none');
    expect(ready.summary).toContain('promotionMissingRequirements=none');
    expect(ready.summary).toContain('missing=none');
  });

  it('derives Agent API decomposition promotion readiness from structured service evidence', () => {
    const partialApplyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_cli_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_cli_decomposition',
      subtasks: [buildSubtaskDraft()],
    });
    const partial = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan: partialApplyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_cli_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      providerConfiguration: {
        configuredProvider: 'openai',
        providerConfigured: true,
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_cli_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
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
    expect(partial.summary).toContain('proposalEvidenceRunId=run_cli_decomposition');
    expect(partial.summary).toContain('proposalEvidenceRunChain=ready');
    expect(partial.summary).toContain('proposalSubtaskCount=1');
    expect(partial.summary).toContain('applyPlanSubtaskCount=1');
    expect(partial.summary).toContain('proposalSubtaskEvidenceChain=ready');
    expect(partial.summary).toContain('proposalSubtaskTitles=需求与范围确认');
    expect(partial.summary).toContain('applyPlanSubtaskTitles=需求与范围确认');
    expect(partial.summary).toContain('proposalRationales=独立边界清楚');
    expect(partial.summary).toContain('applyPlanRationales=独立边界清楚');
    expect(partial.summary).toContain('proposalRationaleEvidenceChain=ready');
    expect(partial.summary).toContain('applyPlanRationaleEvidenceChain=ready');
    expect(partial.summary).toContain('proposalSubtaskUniqueChain=ready');
    expect(partial.summary).toContain('proposalSubtaskIdentityChain=ready');
    expect(partial.summary).toContain('subtaskCount=1');
    expect(partial.summary).toContain('evidenceRunId=run_cli_decomposition');
    expect(partial.summary).toContain('timelineEvidenceRunId=run_cli_decomposition');
    expect(partial.summary).toContain('sourceEvidenceChain=ready');
    expect(partial.summary).toContain('evidenceRunIdChain=ready');
    expect(partial.summary).toContain('confirmationBoundary=operator_confirmed_subtask_create_many');
    expect(partial.summary).toContain('draftOnlyBeforeConfirmation=true');
    expect(partial.summary).toContain('runtimeMode=api');
    expect(partial.summary).toContain('invocationLayer=api_runtime');
    expect(partial.summary).toContain('selectedRuntimeEvidenceRunId=run_cli_decomposition');
    expect(partial.summary).toContain('selectedRuntimeEvidenceRunChain=ready');
    expect(partial.summary).toContain('selectedRuntimeParentTask=task_project');
    expect(partial.summary).toContain('selectedRuntimeParentTaskEvidenceChain=ready');
    expect(partial.summary).toContain('selectedRuntimeProvider=openai');
    expect(partial.summary).toContain('selectedRuntimeProviderEvidenceChain=ready');
    expect(partial.summary).toContain('providerConfigured=ready');
    expect(partial.summary).toContain('configuredProvider=openai');
    expect(partial.summary).toContain('configuredProviderEvidenceChain=ready');
    expect(partial.summary).toContain('timelineRuntimeEvidenceRunId=run_cli_decomposition');
    expect(partial.summary).toContain('timelineRuntimeParentTask=task_project');
    expect(partial.summary).toContain('timelineRuntimeProvider=openai');

    const readyApplyPlan = buildAgentApiDecompositionApplyPlan({
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
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      providerConfiguration: {
        configuredProvider: 'openai',
        providerConfigured: true,
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
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
    expect(ready.summary).toContain('proposalEvidenceRunId=run_api_decomposition');
    expect(ready.summary).toContain('proposalEvidenceRunChain=ready');
    expect(ready.summary).toContain('proposalParentTask=task_project');
    expect(ready.summary).toContain('proposalTaskEvidenceChain=ready');
    expect(ready.summary).toContain('proposalSubtaskCount=1');
    expect(ready.summary).toContain('applyPlanSubtaskCount=1');
    expect(ready.summary).toContain('proposalSubtaskEvidenceChain=ready');
    expect(ready.summary).toContain('proposalSubtaskTitles=需求与范围确认');
    expect(ready.summary).toContain('applyPlanSubtaskTitles=需求与范围确认');
    expect(ready.summary).toContain('proposalSubtaskSummaries=确认范围');
    expect(ready.summary).toContain('applyPlanSubtaskSummaries=确认范围');
    expect(ready.summary).toContain('proposalSubtaskSummaryEvidenceChain=ready');
    expect(ready.summary).toContain('applyPlanSubtaskSummaryEvidenceChain=ready');
    expect(ready.summary).toContain('proposalAcceptanceCriteria=范围文档可验收');
    expect(ready.summary).toContain('applyPlanAcceptanceCriteria=范围文档可验收');
    expect(ready.summary).toContain('proposalAcceptanceCriteriaEvidenceChain=ready');
    expect(ready.summary).toContain('applyPlanAcceptanceCriteriaEvidenceChain=ready');
    expect(ready.summary).toContain('proposalDependencies=none');
    expect(ready.summary).toContain('applyPlanDependencies=none');
    expect(ready.summary).toContain('proposalDependencyEvidenceChain=ready');
    expect(ready.summary).toContain('applyPlanDependencyEvidenceChain=ready');
    expect(ready.summary).toContain('proposalSubtaskUniqueChain=ready');
    expect(ready.summary).toContain('proposalSubtaskIdentityChain=ready');
    expect(ready.summary).toContain('parentTask=task_project');
    expect(ready.summary).toContain('applyPlanParentTask=task_project');
    expect(ready.summary).toContain('parentTaskEvidenceChain=ready');
    expect(ready.summary).toContain('evidenceRunId=run_api_decomposition');
    expect(ready.summary).toContain('timelineEvidenceRunId=run_api_decomposition');
    expect(ready.summary).toContain('sourceEvidenceChain=ready');
    expect(ready.summary).toContain('evidenceRunIdChain=ready');
    expect(ready.summary).toContain('subtaskCount=1');
    expect(ready.summary).toContain('confirmationBoundary=operator_confirmed_subtask_create_many');
    expect(ready.summary).toContain('draftOnlyBeforeConfirmation=true');
    expect(ready.summary).toContain('runtimeMode=api');
    expect(ready.summary).toContain('invocationLayer=api_runtime');
    expect(ready.summary).toContain('selectedRuntimeEvidenceRunId=run_api_decomposition');
    expect(ready.summary).toContain('selectedRuntimeEvidenceRunChain=ready');
    expect(ready.summary).toContain('selectedRuntimeParentTask=task_project');
    expect(ready.summary).toContain('selectedRuntimeParentTaskEvidenceChain=ready');
    expect(ready.summary).toContain('selectedRuntimeProvider=openai');
    expect(ready.summary).toContain('selectedRuntimeProviderEvidenceChain=ready');
    expect(ready.summary).toContain('providerConfigured=ready');
    expect(ready.summary).toContain('configuredProvider=openai');
    expect(ready.summary).toContain('configuredProviderEvidenceChain=ready');
    expect(ready.summary).toContain('timelineRuntimeEvidenceRunId=run_api_decomposition');
    expect(ready.summary).toContain('timelineRuntimeParentTask=task_project');
    expect(ready.summary).toContain('timelineRuntimeProvider=openai');
  });

  it('blocks Agent API decomposition promotion when selected runtime provider is stitched', () => {
    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan: buildAgentApiDecompositionApplyPlan({
        evidenceRunId: 'run_api_decomposition',
        parentTaskId: 'task_project',
        source: 'agent_api_decomposition',
        subtasks: [buildSubtaskDraft()],
      }),
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        phase: 'decomposition_draft',
        provider: 'anthropic',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract'],
    });
    expect(mismatch.summary).toContain('selectedRuntimeProvider=anthropic');
    expect(mismatch.summary).toContain('timelineRuntimeProvider=openai');
    expect(mismatch.summary).toContain('selectedRuntimeProviderEvidenceChain=missing');
    expect(mismatch.summary).toContain('selectedRuntimeEvidenceChain=missing');
  });

  it('blocks Agent API decomposition promotion when the proposal card comes from another run', () => {
    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan: buildAgentApiDecompositionApplyPlan({
        evidenceRunId: 'run_api_decomposition',
        parentTaskId: 'task_project',
        source: 'agent_api_decomposition',
        subtasks: [buildSubtaskDraft()],
      }),
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        acceptanceCriteria: ['范围文档可验收'],
        evidenceRunId: 'run_other',
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        rationales: ['独立边界清楚'],
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
      },
      providerConfiguration: {
        configuredProvider: 'openai',
        providerConfigured: true,
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        phase: 'decomposition_draft',
        provider: 'openai',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['reversible_proposal_card'],
    });
    expect(mismatch.summary).toContain('proposalIdEvidenceChain=ready');
    expect(mismatch.summary).toContain('proposalEvidenceRunId=run_other');
    expect(mismatch.summary).toContain('proposalEvidenceRunChain=missing');
    expect(mismatch.summary).toContain('proposalSubtaskIdentityChain=ready');
  });

  it('blocks Agent API decomposition promotion when configured provider evidence is stitched', () => {
    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan: buildAgentApiDecompositionApplyPlan({
        evidenceRunId: 'run_api_decomposition',
        parentTaskId: 'task_project',
        source: 'agent_api_decomposition',
        subtasks: [buildSubtaskDraft()],
      }),
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
      },
      providerConfiguration: {
        configuredProvider: 'anthropic',
        providerConfigured: true,
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        phase: 'decomposition_draft',
        provider: 'openai',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract'],
    });
    expect(mismatch.summary).toContain('selectedRuntimeProvider=openai');
    expect(mismatch.summary).toContain('timelineRuntimeProvider=openai');
    expect(mismatch.summary).toContain('providerConfigured=ready');
    expect(mismatch.summary).toContain('configuredProvider=anthropic');
    expect(mismatch.summary).toContain('configuredProviderEvidenceChain=missing');
    expect(mismatch.summary).toContain('selectedRuntimeProviderEvidenceChain=missing');
    expect(mismatch.summary).toContain('selectedRuntimeEvidenceChain=missing');
  });

  it('blocks Agent API decomposition promotion when apply-plan source and timeline evidence are stitched', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });
    applyPlan.timeline.payload.source = 'agent_cli_decomposition';
    applyPlan.timeline.payload.evidenceRunId = 'run_other';

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: [
        'reversible_proposal_card',
        'agent_api_decomposition_source',
        'draft_only_timeline_evidence',
      ],
    });
    expect(mismatch.summary).toContain('source=agent_api_decomposition');
    expect(mismatch.summary).toContain('timelineSource=agent_cli_decomposition');
    expect(mismatch.summary).toContain('sourceEvidenceChain=missing');
    expect(mismatch.summary).toContain('evidenceRunId=run_api_decomposition');
    expect(mismatch.summary).toContain('timelineEvidenceRunId=run_other');
    expect(mismatch.summary).toContain('evidenceRunIdChain=missing');
    expect(mismatch.summary).toContain('proposalEvidenceRunId=run_api_decomposition');
    expect(mismatch.summary).toContain('proposalEvidenceRunChain=missing');
  });

  it('blocks Agent API decomposition promotion when selected-runtime evidence is not tied to the apply-plan timeline', () => {
    const applyPlan = buildSubtaskCreateManyWritebackApplyPlan({
      confirmationSurface: 'readiness_smoke_operator_confirmation',
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
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract'],
    });
    expect(mismatch.summary).toContain('runtimeMode=api');
    expect(mismatch.summary).toContain('invocationLayer=api_runtime');
    expect(mismatch.summary).toContain('timelineRuntimeMode=missing');
    expect(mismatch.summary).toContain('timelineInvocationLayer=missing');
    expect(mismatch.summary).toContain('timelineInvocationPhase=missing');
    expect(mismatch.summary).toContain('selectedRuntimeEvidenceChain=missing');
  });

  it('blocks Agent API decomposition promotion when selected-runtime evidence is stitched from another run or parent task', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });

    const wrongRun = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_other',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(wrongRun).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract'],
    });
    expect(wrongRun.summary).toContain('selectedRuntimeEvidenceRunId=run_other');
    expect(wrongRun.summary).toContain('selectedRuntimeEvidenceRunChain=missing');
    expect(wrongRun.summary).toContain('selectedRuntimeParentTaskEvidenceChain=ready');

    const wrongParent = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_other',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(wrongParent).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract'],
    });
    expect(wrongParent.summary).toContain('selectedRuntimeEvidenceRunChain=ready');
    expect(wrongParent.summary).toContain('selectedRuntimeParentTask=task_other');
    expect(wrongParent.summary).toContain('selectedRuntimeParentTaskEvidenceChain=missing');
  });

  it('blocks Agent API decomposition promotion when the confirmation surface is missing', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });
    delete applyPlan.timeline.payload.confirmationSurface;

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        acceptanceCriteria: ['范围文档可验收'],
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        rationales: ['独立边界清楚'],
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['operator_confirmation_boundary'],
    });
    expect(mismatch.summary).toContain('confirmationSurface=missing');
    expect(mismatch.summary).toContain('confirmationSurfaceEvidenceChain=missing');
  });

  it('blocks Agent API decomposition promotion when timeline runtime contract identity is stitched', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });
    applyPlan.timeline.payload.runtimeContract = {
      evidenceRunId: 'run_other',
      invocationLayer: 'api_runtime',
      parentTaskId: 'task_other',
      provider: 'openai',
      phase: 'decomposition_draft',
      runtimeMode: 'api',
    };

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract'],
    });
    expect(mismatch.summary).toContain('selectedRuntimeEvidenceRunChain=ready');
    expect(mismatch.summary).toContain('selectedRuntimeParentTaskEvidenceChain=ready');
    expect(mismatch.summary).toContain('timelineRuntimeEvidenceRunId=run_other');
    expect(mismatch.summary).toContain('timelineRuntimeParentTask=task_other');
    expect(mismatch.summary).toContain('selectedRuntimeEvidenceChain=missing');
  });

  it('blocks Agent API decomposition promotion when draft-only timeline evidence has no run identity', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
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
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract', 'reversible_proposal_card', 'draft_only_timeline_evidence'],
    });
    expect(mismatch.summary).toContain('evidenceRunId=missing');
    expect(mismatch.summary).toContain('timelineEvidenceRunId=missing');
    expect(mismatch.summary).toContain('evidenceRunIdChain=missing');
    expect(mismatch.summary).toContain('proposalEvidenceRunId=run_api_decomposition');
    expect(mismatch.summary).toContain('proposalEvidenceRunChain=missing');
    expect(mismatch.summary).toContain('selectedRuntimeEvidenceRunChain=missing');
  });

  it('blocks Agent API decomposition promotion when parent-task evidence is stitched from another task', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
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
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project_a',
        provider: 'openai',
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

  it('blocks Agent API decomposition promotion when service parent-task evidence is absent', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['parent_task_identity'],
    });
    expect(mismatch.summary).toContain('parentTask=task_project');
    expect(mismatch.summary).toContain('applyPlanParentTask=task_project');
    expect(mismatch.summary).toContain('parentTaskEvidenceChain=missing');
  });

  it('blocks Agent API decomposition promotion when the reversible proposal belongs to another parent task', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
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
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project_a',
        provider: 'openai',
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
    const applyPlan = buildAgentApiDecompositionApplyPlan({
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
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 2,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
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
    const applyPlan = buildAgentApiDecompositionApplyPlan({
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
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
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
    const applyPlan = buildAgentApiDecompositionApplyPlan({
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
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskTitles: ['Different child task'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
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

  it('blocks Agent API decomposition promotion when proposal subtask summaries do not match the apply plan', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['Different summary'],
        subtaskTitles: ['需求与范围确认'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['reversible_proposal_card'],
    });
    expect(mismatch.summary).toContain('proposalSubtaskSummaries=Different summary');
    expect(mismatch.summary).toContain('applyPlanSubtaskSummaries=确认范围');
    expect(mismatch.summary).toContain('proposalSubtaskSummaryEvidenceChain=ready');
    expect(mismatch.summary).toContain('proposalSubtaskIdentityChain=missing');
    expect(mismatch.summary).toContain('proposalCard=missing');
  });

  it('blocks Agent API decomposition promotion when proposal acceptance criteria do not match the apply plan', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        acceptanceCriteria: ['Different criteria'],
        rationales: ['独立边界清楚'],
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['reversible_proposal_card'],
    });
    expect(mismatch.summary).toContain('proposalAcceptanceCriteria=Different criteria');
    expect(mismatch.summary).toContain('applyPlanAcceptanceCriteria=范围文档可验收');
    expect(mismatch.summary).toContain('proposalAcceptanceCriteriaEvidenceChain=ready');
    expect(mismatch.summary).toContain('proposalSubtaskIdentityChain=missing');
    expect(mismatch.summary).toContain('proposalCard=missing');
  });

  it('blocks Agent API decomposition promotion when proposal rationales do not match the apply plan', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft()],
    });

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['Different rationale'],
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['reversible_proposal_card'],
    });
    expect(mismatch.summary).toContain('proposalRationales=Different rationale');
    expect(mismatch.summary).toContain('applyPlanRationales=独立边界清楚');
    expect(mismatch.summary).toContain('proposalRationaleEvidenceChain=ready');
    expect(mismatch.summary).toContain('applyPlanRationaleEvidenceChain=ready');
    expect(mismatch.summary).toContain('proposalSubtaskIdentityChain=missing');
    expect(mismatch.summary).toContain('proposalCard=missing');
  });

  it('blocks Agent API decomposition promotion when proposal dependencies do not match the apply plan', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [{
        ...buildSubtaskDraft(),
        dependency: '完成需求确认',
      }],
    });

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
        dependencies: ['其他依赖'],
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['reversible_proposal_card'],
    });
    expect(mismatch.summary).toContain('proposalDependencies=其他依赖');
    expect(mismatch.summary).toContain('applyPlanDependencies=完成需求确认');
    expect(mismatch.summary).toContain('proposalDependencyEvidenceChain=ready');
    expect(mismatch.summary).toContain('applyPlanDependencyEvidenceChain=ready');
    expect(mismatch.summary).toContain('proposalSubtaskIdentityChain=missing');
    expect(mismatch.summary).toContain('proposalCard=missing');
  });

  it('blocks Agent API decomposition promotion when repeated subtask titles make identity ambiguous', () => {
    const duplicateDraft = {
      ...buildSubtaskDraft(),
      title: '需求与范围确认',
    };
    const applyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [buildSubtaskDraft(), duplicateDraft],
    });

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 2,
        subtaskTitles: ['需求与范围确认', '需求与范围确认'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['reversible_proposal_card'],
    });
    expect(mismatch.summary).toContain('proposalSubtaskEvidenceChain=ready');
    expect(mismatch.summary).toContain('proposalSubtaskTitles=需求与范围确认|需求与范围确认');
    expect(mismatch.summary).toContain('applyPlanSubtaskTitles=需求与范围确认|需求与范围确认');
    expect(mismatch.summary).toContain('proposalSubtaskUniqueChain=missing');
    expect(mismatch.summary).toContain('proposalSubtaskIdentityChain=missing');
    expect(mismatch.summary).toContain('proposalCard=missing');
  });

  it('blocks Agent API decomposition promotion when near-duplicate subtask titles make identity ambiguous', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [
        {
          acceptanceCriteria: '需求清单可验收。',
          dependency: null,
          summary: '分析需求边界。',
          title: '需求分析',
        },
        {
          acceptanceCriteria: '需求风险可验收。',
          dependency: null,
          summary: '梳理需求风险。',
          title: '分析需求',
        },
      ],
    });

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 2,
        subtaskTitles: ['需求分析', '分析需求'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['reversible_proposal_card'],
    });
    expect(mismatch.summary).toContain('proposalSubtaskEvidenceChain=ready');
    expect(mismatch.summary).toContain('proposalSubtaskTitles=需求分析|分析需求');
    expect(mismatch.summary).toContain('applyPlanSubtaskTitles=需求分析|分析需求');
    expect(mismatch.summary).toContain('proposalSubtaskUniqueChain=missing');
    expect(mismatch.summary).toContain('proposalSubtaskIdentityChain=missing');
    expect(mismatch.summary).toContain('proposalCard=missing');
  });

  it('blocks Agent API decomposition promotion when blank subtask titles are filtered out of identity evidence', () => {
    const applyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [
        buildSubtaskDraft(),
        {
          acceptanceCriteria: '补齐验收。',
          dependency: null,
          summary: '缺少标题。',
          title: '   ',
        },
      ],
    });

    const mismatch = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 2,
        subtaskTitles: ['需求与范围确认', ''],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: [
        'reversible_proposal_card',
        'subtask_create_many_apply_plan',
      ],
    });
    expect(mismatch.summary).toContain('proposalSubtaskCount=2');
    expect(mismatch.summary).toContain('applyPlanSubtaskCount=2');
    expect(mismatch.summary).toContain('proposalSubtaskEvidenceChain=ready');
    expect(mismatch.summary).toContain('proposalSubtaskTitles=需求与范围确认');
    expect(mismatch.summary).toContain('applyPlanSubtaskTitles=需求与范围确认');
    expect(mismatch.summary).toContain('proposalSubtaskTitleEvidenceChain=missing');
    expect(mismatch.summary).toContain('applyPlanSubtaskTitleEvidenceChain=missing');
    expect(mismatch.summary).toContain('proposalSubtaskUniqueChain=missing');
    expect(mismatch.summary).toContain('proposalSubtaskIdentityChain=missing');
    expect(mismatch.summary).toContain('proposalCard=missing');
  });

  it('blocks Agent API decomposition promotion when the apply plan has no concrete subtasks', () => {
    const emptyApplyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [],
    });

    const generic = evaluateAgentApiDecompositionPromotionReadiness({
      applyPlan: emptyApplyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCardReady: true,
      selectedRuntimeContractReady: true,
    });

    expect(generic).toMatchObject({
      ready: false,
      missingRequirements: ['subtask_create_many_apply_plan'],
    });
    expect(generic.summary).toContain('subtaskCount=0');
    expect(generic.summary).toContain('applyPlanSubtaskTitles=missing');
    expect(generic.summary).toContain('applyPlanSubtaskTitleEvidenceChain=missing');

    const emptyServiceEvidence = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan: emptyApplyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 0,
        subtaskTitles: [],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(emptyServiceEvidence).toMatchObject({
      ready: false,
      missingRequirements: [
        'reversible_proposal_card',
        'subtask_create_many_apply_plan',
      ],
    });
    expect(emptyServiceEvidence.summary).toContain('applyPlanSubtaskCount=0');
    expect(emptyServiceEvidence.summary).toContain('proposalSubtaskCount=0');
    expect(emptyServiceEvidence.summary).toContain('applyPlanSubtaskTitles=missing');
    expect(emptyServiceEvidence.summary).toContain('proposalSubtaskTitleEvidenceChain=missing');
    expect(emptyServiceEvidence.summary).toContain('applyPlanSubtaskTitleEvidenceChain=missing');

    const blankTitleApplyPlan = buildAgentApiDecompositionApplyPlan({
      evidenceRunId: 'run_api_decomposition',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
      subtasks: [{
        ...buildSubtaskDraft(),
        title: '   ',
      }],
    });

    const serviceEvidence = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({
      applyPlan: blankTitleApplyPlan,
      parentTaskId: 'task_project',
      reversibleProposalCard: {
        parentTaskId: 'task_project',
        proposalId: 'project_decomposition:task_project',
        evidenceRunId: 'run_api_decomposition',
        status: 'ready',
        subtaskCount: 1,
        subtaskSummaries: ['确认范围'],
        subtaskTitles: ['需求与范围确认'],
        acceptanceCriteria: ['范围文档可验收'],
        rationales: ['独立边界清楚'],
      },
      selectedRuntimeContract: {
        evidenceRunId: 'run_api_decomposition',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        provider: 'openai',
        phase: 'decomposition_draft',
        runtimeMode: 'api',
      },
    });

    expect(serviceEvidence).toMatchObject({
      ready: false,
      missingRequirements: [
        'reversible_proposal_card',
        'subtask_create_many_apply_plan',
      ],
    });
    expect(serviceEvidence.summary).toContain('applyPlanSubtaskCount=1');
    expect(serviceEvidence.summary).toContain('applyPlanSubtaskTitles=missing');
    expect(serviceEvidence.summary).toContain('applyPlanSubtaskTitleEvidenceChain=missing');
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

  it('does not promote Agent API execution from invocation-declared requirements without service evidence', () => {
    const completedInvocation = {
      ...buildDeferredAgentApiExecutionRunInvocation(),
      status: 'completed' as const,
    };

    const readiness = evaluateAgentApiExecutionPromotionReadinessForInvocation(completedInvocation);

    expect(readiness).toMatchObject({
      ready: false,
      satisfiedRequirements: [],
      satisfiedGates: [],
      missingRequirements: completedInvocation.promotionRequirements,
      missingGates: completedInvocation.requiredGates,
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
        taskId: 'task_1',
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
      pilotDecision: {
        backend: 'agent_api',
        executor: 'agent_api',
        messagePriority: 'steer',
        movement: 'execute',
        operationMode: 'product_control_layer',
        priorityLane: 'continue_or_review',
      },
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        provider: 'openai',
        runId: 'run_api_execution_partial',
        runtimeMode: 'api',
        taskId: 'task_1',
      },
      simplicityCheck: {
        smallestMovement: 'run_start',
        status: 'ready',
        taskId: 'task_1',
      },
      runtimeAction: {
        action: 'run_start',
        allowed: true,
        requestSurface: 'readiness_smoke_operator_request',
        runId: 'run_api_execution_partial',
        status: 'ready',
        surface: 'run',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(partial).toMatchObject({
      ready: false,
      satisfiedRequirements: [
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
    expect(partial.summary).toContain('requirements=2/11');
    expect(partial.summary).toContain('gates=3/9');
    expect(partial.summary).toContain('targetTask=task_1');
    expect(partial.summary).toContain('runEvidenceTask=missing');
    expect(partial.summary).toContain('targetTaskEvidenceChain=missing');
    expect(partial.summary).toContain('runEvidenceTaskEvidenceChain=missing');
    expect(partial.summary).toContain('selectedRuntimeRun=run_api_execution_partial');
    expect(partial.summary).toContain('selectedRuntimeRunEvidenceChain=missing');
    expect(partial.summary).toContain('selectedRuntimeTask=task_1');
    expect(partial.summary).toContain('selectedRuntimeTaskEvidenceChain=ready');
    expect(partial.summary).toContain('selectedRuntimeProvider=openai');
    expect(partial.summary).toContain('selectedRuntimeProviderEvidenceChain=ready');
    expect(partial.summary).toContain('providerPreflightStatus=ready');
    expect(partial.summary).toContain('providerConfigured=ready');
    expect(partial.summary).toContain('configuredProvider=openai');
    expect(partial.summary).toContain('configuredProviderEvidenceChain=ready');
    expect(partial.summary).toContain('providerStartupProbe=not_called');
    expect(partial.summary).toContain('providerPreflightRun=run_api_execution_partial');
    expect(partial.summary).toContain('providerPreflightRunEvidenceChain=missing');
    expect(partial.summary).toContain('providerPreflightTask=task_1');
    expect(partial.summary).toContain('providerPreflightTaskEvidenceChain=ready');
    expect(partial.summary).toContain('pilotDecisionEvidenceChain=ready');
    expect(partial.summary).toContain('pilotDecisionExecutor=agent_api');
    expect(partial.summary).toContain('pilotDecisionMovement=execute');
    expect(partial.summary).toContain('pilotDecisionOperationMode=product_control_layer');
    expect(partial.summary).toContain('pilotDecisionBackend=agent_api');
    expect(partial.summary).toContain('pilotDecisionMessagePriority=steer');
    expect(partial.summary).toContain('pilotDecisionPriorityLane=continue_or_review');
    expect(partial.summary).toContain('runId=missing');
    expect(partial.summary).toContain('writeIntentRun=missing');
    expect(partial.summary).toContain('writeIntentRunEvidenceChain=missing');
    expect(partial.summary).toContain('writeIntentTask=missing');
    expect(partial.summary).toContain('writeIntentTaskEvidenceChain=missing');
    expect(partial.summary).toContain('writeIntentExtraction=missing');
    expect(partial.summary).toContain('contextStep=step_context_ready');
    expect(partial.summary).toContain('contextStepTask=task_1');
    expect(partial.summary).toContain('contextStepTaskEvidenceChain=ready');
    expect(partial.summary).toContain('contextManifest=task=task_1 / files=2');
    expect(partial.summary).toContain('contextManifestTask=task_1');
    expect(partial.summary).toContain('contextManifestEvidenceChain=ready');
    expect(partial.summary).toContain('writeIntentSupportedActionCount=0');
    expect(partial.summary).toContain('writeIntentActions=none');
    expect(partial.summary).toContain('writeIntentDeclaredActionCount=0');
    expect(partial.summary).toContain('reviewedPatchExplicitApply=no');
    expect(partial.summary).toContain('patchPromotionPreflight=missing');
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
    expect(ready.summary).toContain('runEvidenceTaskEvidenceChain=ready');
    expect(ready.summary).toContain('selectedRuntimeRun=run_api_execution');
    expect(ready.summary).toContain('selectedRuntimeRunEvidenceChain=ready');
    expect(ready.summary).toContain('selectedRuntimeTask=task_1');
    expect(ready.summary).toContain('selectedRuntimeTaskEvidenceChain=ready');
    expect(ready.summary).toContain('selectedRuntimeProvider=openai');
    expect(ready.summary).toContain('selectedRuntimeProviderEvidenceChain=ready');
    expect(ready.summary).toContain('providerPreflightStatus=ready');
    expect(ready.summary).toContain('providerConfigured=ready');
    expect(ready.summary).toContain('configuredProvider=openai');
    expect(ready.summary).toContain('configuredProviderEvidenceChain=ready');
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
    expect(ready.summary).toContain('writeIntentExtraction=ready');
    expect(ready.summary).toContain('contextStepTask=task_1');
    expect(ready.summary).toContain('contextStepTaskEvidenceChain=ready');
    expect(ready.summary).toContain('simplicityCheck=ready');
    expect(ready.summary).toContain('simplicityCheckTask=task_1');
    expect(ready.summary).toContain('simplicityCheckSmallestMovement=run_start');
    expect(ready.summary).toContain('simplicityCheckGateEvidenceChain=ready');
    expect(ready.summary).toContain('runtimeAction=run_start');
    expect(ready.summary).toContain('runtimeActionStatus=ready');
    expect(ready.summary).toContain('runtimeActionSurface=run');
    expect(ready.summary).toContain('runtimeActionRequestSurface=readiness_smoke_operator_request');
    expect(ready.summary).toContain('runtimeActionRequestSurfaceEvidenceChain=ready');
    expect(ready.summary).toContain('runtimeActionRun=run_api_execution');
    expect(ready.summary).toContain('runtimeActionRunIdentityChain=ready');
    expect(ready.summary).toContain('runtimeActionTask=task_1');
    expect(ready.summary).toContain('runtimeActionGateEvidenceChain=ready');
    expect(ready.summary).toContain('taskMemoryGuidance=ready');
    expect(ready.summary).toContain('contextManifestTask=task_1');
    expect(ready.summary).toContain('contextManifestEvidenceChain=ready');
    expect(ready.summary).toContain('taskMemoryGuidanceCount=1');
    expect(ready.summary).toContain('taskMemoryGuidanceTask=task_1');
    expect(ready.summary).toContain('taskMemoryGuidanceTaskEvidenceChain=ready');
    expect(ready.summary).toContain('taskMemoryCoverage=ready');
    expect(ready.summary).toContain('taskMemoryCoverageTask=task_1');
    expect(ready.summary).toContain('taskMemoryCoverageEvidenceChain=ready');
    expect(ready.summary).toContain('taskMemoryCoverageGateEvidenceChain=ready');
    expect(ready.summary).toContain('runGoalConditions=1');
    expect(ready.summary).toContain('runGoalRun=run_api_execution');
    expect(ready.summary).toContain('runGoalRunEvidenceChain=ready');
    expect(ready.summary).toContain('runGoalTask=task_1');
    expect(ready.summary).toContain('runGoalTaskEvidenceChain=ready');
    expect(ready.summary).toContain('subtaskStart=ready');
    expect(ready.summary).toContain('subtaskStartTask=task_1');
    expect(ready.summary).toContain('subtaskStartEvidenceChain=ready');
    expect(ready.summary).toContain('subtaskStartGateEvidenceChain=ready');
    expect(ready.summary).toContain('writeIntentSupportedActionCount=2');
    expect(ready.summary).toContain('writeIntentActions=artifact.propose,task_file.propose');
    expect(ready.summary).toContain('writeIntentDeclaredActionCount=2');
    expect(ready.summary).toContain('writeIntentActionIdentityChain=ready');
    expect(ready.summary).toContain('writeIntentActionBoundary=ready');
    expect(ready.summary).toContain('reviewedPatchApplyBoundary=ready');
    expect(ready.summary).toContain('reviewedPatchBoundaryMode=applied_patch');
    expect(ready.summary).toContain('reviewedPatchExplicitApply=yes');
    expect(ready.summary).toContain('patchPromotionPreflight=ready');
    expect(ready.summary).toContain('patchPromotionStatus=applied');
    expect(ready.summary).toContain('patchPromotionRun=run_api_execution');
    expect(ready.summary).toContain('patchPromotionRunEvidenceChain=ready');
    expect(ready.summary).toContain('patchPromotionTask=task_1');
    expect(ready.summary).toContain('patchPromotionTaskEvidenceChain=ready');
    expect(ready.summary).toContain('postStepRun=run_api_execution');
    expect(ready.summary).toContain('postStepRunEvidenceChain=ready');
    expect(ready.summary).toContain('postStepTask=task_1');
    expect(ready.summary).toContain('postStepTaskEvidenceChain=ready');
    expect(ready.summary).toContain('postStepVerifier=taskplane.verifier.lightweight');
    expect(ready.summary).toContain('terminalRunStatus=completed');
    expect(ready.summary).toContain('terminalRunStatusEvidenceChain=ready');
    expect(ready.summary).toContain('terminalEvidence=present');
    expect(ready.summary).toContain('terminalEvidenceSummary=output_chars=42');
    expect(ready.summary).toContain('terminalEvidenceSummaryChain=ready');

    const mismatch = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runEvidencePersistence: {
        runId: 'run_api_execution',
        taskId: 'task_2',
        terminalEvidenceSummary: 'output_chars=42',
        terminalEvidenceStatus: 'present',
        terminalRunStatus: 'completed',
      },
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: expect.arrayContaining(['target_task_identity', 'run_evidence_persistence']),
    });
    expect(mismatch.summary).toContain('targetTask=task_1');
    expect(mismatch.summary).toContain('runEvidenceTask=task_2');
    expect(mismatch.summary).toContain('targetTaskEvidenceChain=missing');
    expect(mismatch.summary).toContain('runEvidenceTaskEvidenceChain=missing');
  });

  it('requires persisted Run evidence to come from a terminal run status', () => {
    const running = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runEvidencePersistence: {
        runId: 'run_api_execution',
        taskId: 'task_1',
        terminalEvidenceSummary: 'output_chars=42',
        terminalEvidenceStatus: 'present',
        terminalRunStatus: 'running',
      },
    });

    expect(running).toMatchObject({
      ready: false,
      missingRequirements: ['run_evidence_persistence'],
    });
    expect(running.summary).toContain('terminalRunStatus=running');
    expect(running.summary).toContain('terminalRunStatusEvidenceChain=missing');

    const failed = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runEvidencePersistence: {
        runId: 'run_api_execution',
        taskId: 'task_1',
        terminalEvidenceSummary: 'failure_reason_chars=18',
        terminalEvidenceStatus: 'present',
        terminalRunStatus: 'failed',
      },
    });

    expect(failed).toMatchObject({
      ready: true,
      missingRequirements: [],
    });
    expect(failed.summary).toContain('terminalRunStatus=failed');
    expect(failed.summary).toContain('terminalRunStatusEvidenceChain=ready');
  });

  it('requires persisted Run evidence to include reviewable terminal evidence summary', () => {
    const missingSummary = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runEvidencePersistence: {
        runId: 'run_api_execution',
        taskId: 'task_1',
        terminalEvidenceStatus: 'present',
        terminalRunStatus: 'completed',
      },
    });

    expect(missingSummary).toMatchObject({
      ready: false,
      missingRequirements: ['run_evidence_persistence'],
    });
    expect(missingSummary.summary).toContain('terminalEvidence=present');
    expect(missingSummary.summary).toContain('terminalEvidenceSummary=missing');
    expect(missingSummary.summary).toContain('terminalEvidenceSummaryChain=missing');
  });

  it('requires Agent API execution selected runtime provider identity to match provider preflight', () => {
    const wrongProvider = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      selectedRuntimeContract: {
        ...completeAgentApiExecutionPromotionEvidence().selectedRuntimeContract,
        provider: 'anthropic',
      },
    });

    expect(wrongProvider).toMatchObject({
      ready: false,
      missingRequirements: expect.arrayContaining([
        'selected_runtime_contract',
        'provider_visible_preflight',
      ]),
    });
    expect(wrongProvider.summary).toContain('selectedRuntimeProvider=anthropic');
    expect(wrongProvider.summary).toContain('configuredProvider=openai');
    expect(wrongProvider.summary).toContain('selectedRuntimeProviderEvidenceChain=missing');
    expect(wrongProvider.summary).toContain('configuredProviderEvidenceChain=missing');

    const missingProvider = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      selectedRuntimeContract: {
        ...completeAgentApiExecutionPromotionEvidence().selectedRuntimeContract,
        provider: null,
      },
    });

    expect(missingProvider).toMatchObject({
      ready: false,
      missingRequirements: expect.arrayContaining([
        'selected_runtime_contract',
        'provider_visible_preflight',
      ]),
    });
    expect(missingProvider.summary).toContain('selectedRuntimeProvider=missing');
    expect(missingProvider.summary).toContain('selectedRuntimeProviderEvidenceChain=missing');
    expect(missingProvider.summary).toContain('configuredProviderEvidenceChain=missing');
  });

  it('requires Agent API execution selected runtime evidence to include the Pilot executor decision', () => {
    const missingPilotDecision = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      pilotDecision: null,
    });

    expect(missingPilotDecision).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract'],
    });
    expect(missingPilotDecision.summary).toContain('selectedRuntimeRunEvidenceChain=ready');
    expect(missingPilotDecision.summary).toContain('selectedRuntimeTaskEvidenceChain=ready');
    expect(missingPilotDecision.summary).toContain('selectedRuntimeProviderEvidenceChain=ready');
    expect(missingPilotDecision.summary).toContain('pilotDecisionEvidenceChain=missing');
    expect(missingPilotDecision.summary).toContain('pilotDecisionExecutor=missing');

    const wrongExecutor = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      pilotDecision: {
        backend: 'codex_cli',
        executor: 'codex_cli',
        messagePriority: 'steer',
        movement: 'execute',
        operationMode: 'product_control_layer',
        priorityLane: 'continue_or_review',
      },
    });

    expect(wrongExecutor).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract'],
    });
    expect(wrongExecutor.summary).toContain('pilotDecisionEvidenceChain=missing');
    expect(wrongExecutor.summary).toContain('pilotDecisionExecutor=codex_cli');
  });

  it('requires runtime context manifest evidence to belong to the target task', () => {
    const mismatch = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      contextManifestSummary: 'task=task_2 / files=2 / sourceContexts=1',
    });

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['runtime_context_manifest'],
    });
    expect(mismatch.summary).toContain('targetTask=task_1');
    expect(mismatch.summary).toContain('contextManifest=task=task_2 / files=2 / sourceContexts=1');
    expect(mismatch.summary).toContain('contextManifestTask=task_2');
    expect(mismatch.summary).toContain('contextManifestEvidenceChain=missing');

    const serviceTaskEvidence = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      contextManifestSummary: 'executionKind=api / status=partial',
      contextManifestTaskId: 'task_1',
    });

    expect(serviceTaskEvidence).toMatchObject({
      ready: true,
      missingRequirements: [],
    });
    expect(serviceTaskEvidence.summary).toContain('contextManifest=executionKind=api / status=partial');
    expect(serviceTaskEvidence.summary).toContain('contextManifestTask=task_1');
    expect(serviceTaskEvidence.summary).toContain('contextManifestEvidenceChain=ready');
  });

  it('requires selected runtime contract evidence to belong to the same run and target task', () => {
    const wrongRun = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        provider: 'openai',
        runId: 'run_other',
        runtimeMode: 'api',
        taskId: 'task_1',
      },
    });

    expect(wrongRun).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract'],
    });
    expect(wrongRun.summary).toContain('selectedRuntimeRun=run_other');
    expect(wrongRun.summary).toContain('selectedRuntimeRunEvidenceChain=missing');
    expect(wrongRun.summary).toContain('selectedRuntimeTaskEvidenceChain=ready');

    const wrongTask = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        provider: 'openai',
        runId: 'run_api_execution',
        runtimeMode: 'api',
        taskId: 'task_2',
      },
    });

    expect(wrongTask).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract'],
    });
    expect(wrongTask.summary).toContain('selectedRuntimeRunEvidenceChain=ready');
    expect(wrongTask.summary).toContain('selectedRuntimeTask=task_2');
    expect(wrongTask.summary).toContain('selectedRuntimeTaskEvidenceChain=missing');
  });

  it('requires context readiness step evidence to belong to the target task', () => {
    const wrongTask = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      contextReadinessStep: {
        status: 'ready',
        stepId: 'step_context_ready',
        taskId: 'task_2',
      },
    });

    expect(wrongTask).toMatchObject({
      ready: false,
      missingRequirements: ['context_readiness_step'],
    });
    expect(wrongTask.summary).toContain('contextStep=step_context_ready');
    expect(wrongTask.summary).toContain('contextStepTask=task_2');
    expect(wrongTask.summary).toContain('contextStepTaskEvidenceChain=missing');
  });

  it('requires Run Goal Contract evidence to belong to the same run and target task', () => {
    const missingPersistedRun = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runEvidencePersistence: null,
    });

    expect(missingPersistedRun).toMatchObject({
      ready: false,
      missingRequirements: expect.arrayContaining([
        'target_task_identity',
        'run_goal_contract',
        'run_evidence_persistence',
      ]),
    });
    expect(missingPersistedRun.summary).toContain('runGoalRun=run_api_execution');
    expect(missingPersistedRun.summary).toContain('runGoalRunEvidenceChain=missing');
    expect(missingPersistedRun.summary).toContain('targetTaskEvidenceChain=missing');

    const wrongRun = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runGoalContract: {
        completionConditionCount: 1,
        objective: 'Produce reviewable task evidence.',
        runId: 'run_other',
        taskId: 'task_1',
      },
    });

    expect(wrongRun).toMatchObject({
      ready: false,
      missingRequirements: ['run_goal_contract'],
    });
    expect(wrongRun.summary).toContain('runGoalRun=run_other');
    expect(wrongRun.summary).toContain('runGoalRunEvidenceChain=missing');
    expect(wrongRun.summary).toContain('runGoalTaskEvidenceChain=ready');

    const wrongTask = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runGoalContract: {
        completionConditionCount: 1,
        objective: 'Produce reviewable task evidence.',
        runId: 'run_api_execution',
        taskId: 'task_2',
      },
    });

    expect(wrongTask).toMatchObject({
      ready: false,
      missingRequirements: ['run_goal_contract'],
    });
    expect(wrongTask.summary).toContain('runGoalRunEvidenceChain=ready');
    expect(wrongTask.summary).toContain('runGoalTask=task_2');
    expect(wrongTask.summary).toContain('runGoalTaskEvidenceChain=missing');
  });

  it('does not satisfy the pre-step gate from a Run Goal Contract on another run', () => {
    const wrongRun = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runGoalContract: {
        completionConditionCount: 1,
        objective: 'Produce reviewable task evidence.',
        runId: 'run_other',
        taskId: 'task_1',
      },
    });

    expect(wrongRun).toMatchObject({
      ready: false,
      missingRequirements: ['run_goal_contract'],
      missingGates: ['pre_step'],
    });
    expect(wrongRun.summary).toContain('runGoalRun=run_other');
    expect(wrongRun.summary).toContain('runGoalRunEvidenceChain=missing');
    expect(wrongRun.summary).toContain('preStepGateEvidenceChain=missing');
  });

  it('requires task memory guidance evidence to belong to the target task', () => {
    const noPendingGuidance = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      taskMemoryGuidance: {
        guidanceCount: 0,
        status: 'ready',
        taskId: 'task_1',
      },
    });

    expect(noPendingGuidance).toMatchObject({
      ready: true,
      missingRequirements: [],
    });
    expect(noPendingGuidance.summary).toContain('taskMemoryGuidance=ready');
    expect(noPendingGuidance.summary).toContain('taskMemoryGuidanceCount=0');
    expect(noPendingGuidance.summary).toContain('taskMemoryGuidanceTask=task_1');
    expect(noPendingGuidance.summary).toContain('taskMemoryGuidanceTaskEvidenceChain=ready');

    const wrongTask = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      taskMemoryGuidance: {
        guidanceCount: 1,
        status: 'ready',
        taskId: 'task_2',
      },
    });

    expect(wrongTask).toMatchObject({
      ready: false,
      missingRequirements: ['task_memory_guidance'],
    });
    expect(wrongTask.summary).toContain('taskMemoryGuidance=ready');
    expect(wrongTask.summary).toContain('taskMemoryGuidanceCount=1');
    expect(wrongTask.summary).toContain('taskMemoryGuidanceTask=task_2');
    expect(wrongTask.summary).toContain('taskMemoryGuidanceTaskEvidenceChain=missing');
  });

  it('does not satisfy the subtask-start gate without target-task readiness evidence', () => {
    const missingEvidence = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      subtaskStart: null,
    });

    expect(missingEvidence).toMatchObject({
      ready: false,
      missingRequirements: [],
      missingGates: ['subtask_start'],
    });
    expect(missingEvidence.summary).toContain('subtaskStart=missing');
    expect(missingEvidence.summary).toContain('subtaskStartTask=missing');
    expect(missingEvidence.summary).toContain('subtaskStartEvidenceChain=missing');
    expect(missingEvidence.summary).toContain('subtaskStartGateEvidenceChain=missing');

    const wrongTask = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      subtaskStart: {
        status: 'ready',
        taskId: 'task_2',
      },
    });

    expect(wrongTask).toMatchObject({
      ready: false,
      missingRequirements: [],
      missingGates: ['subtask_start'],
    });
    expect(wrongTask.summary).toContain('subtaskStart=ready');
    expect(wrongTask.summary).toContain('subtaskStartTask=task_2');
    expect(wrongTask.summary).toContain('subtaskStartEvidenceChain=missing');
    expect(wrongTask.summary).toContain('subtaskStartGateEvidenceChain=missing');
  });

  it('does not satisfy the task-memory-coverage gate without target-task coverage evidence', () => {
    const missingEvidence = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      taskMemoryCoverage: null,
    });

    expect(missingEvidence).toMatchObject({
      ready: false,
      missingRequirements: [],
      missingGates: ['task_memory_coverage'],
    });
    expect(missingEvidence.summary).toContain('taskMemoryCoverage=missing');
    expect(missingEvidence.summary).toContain('taskMemoryCoverageTask=missing');
    expect(missingEvidence.summary).toContain('taskMemoryCoverageEvidenceChain=missing');
    expect(missingEvidence.summary).toContain('taskMemoryCoverageGateEvidenceChain=missing');

    const wrongTask = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      taskMemoryCoverage: {
        status: 'ready',
        taskId: 'task_2',
      },
    });

    expect(wrongTask).toMatchObject({
      ready: false,
      missingRequirements: [],
      missingGates: ['task_memory_coverage'],
    });
    expect(wrongTask.summary).toContain('taskMemoryCoverage=ready');
    expect(wrongTask.summary).toContain('taskMemoryCoverageTask=task_2');
    expect(wrongTask.summary).toContain('taskMemoryCoverageEvidenceChain=missing');
    expect(wrongTask.summary).toContain('taskMemoryCoverageGateEvidenceChain=missing');
  });

  it('does not satisfy simplicity or runtime-action gates without service evidence', () => {
    const missingEvidence = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runtimeAction: null,
      simplicityCheck: null,
    });

    expect(missingEvidence).toMatchObject({
      ready: false,
      missingRequirements: [],
      missingGates: ['simplicity_check', 'runtime_action'],
    });
    expect(missingEvidence.summary).toContain('simplicityCheck=missing');
    expect(missingEvidence.summary).toContain('simplicityCheckGateEvidenceChain=missing');
    expect(missingEvidence.summary).toContain('runtimeAction=missing');
    expect(missingEvidence.summary).toContain('runtimeActionGateEvidenceChain=missing');

    const wrongIdentity = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runtimeAction: {
        action: 'run_start',
        allowed: true,
        runId: 'run_other',
        status: 'ready',
        surface: 'run',
        taskId: 'task_2',
      },
      simplicityCheck: {
        smallestMovement: 'run_start',
        status: 'ready',
        taskId: 'task_2',
      },
    });

    expect(wrongIdentity).toMatchObject({
      ready: false,
      missingRequirements: [],
      missingGates: ['simplicity_check', 'runtime_action'],
    });
    expect(wrongIdentity.summary).toContain('simplicityCheckTask=task_2');
    expect(wrongIdentity.summary).toContain('runtimeActionRunIdentityChain=missing');
    expect(wrongIdentity.summary).toContain('runtimeActionTask=task_2');
  });

  it('blocks Agent API execution promotion when the runtime request surface is missing', () => {
    const missingRequestSurface = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runtimeAction: {
        action: 'run_start',
        allowed: true,
        runId: 'run_api_execution',
        status: 'ready',
        surface: 'run',
        taskId: 'task_1',
      },
    });

    expect(missingRequestSurface).toMatchObject({
      ready: false,
      missingRequirements: [],
      missingGates: ['runtime_action'],
    });
    expect(missingRequestSurface.summary).toContain('runtimeActionRequestSurface=missing');
    expect(missingRequestSurface.summary).toContain('runtimeActionRequestSurfaceEvidenceChain=missing');
    expect(missingRequestSurface.summary).toContain('runtimeActionGateEvidenceChain=missing');
  });

  it('blocks Agent API execution promotion from generic IPC run surfaces', () => {
    const genericIpcSurface = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runtimeAction: {
        action: 'run_start',
        allowed: true,
        requestSurface: 'ipc_run_trigger',
        runId: 'run_api_execution',
        status: 'ready',
        surface: 'run',
        taskId: 'task_1',
      },
    });

    expect(genericIpcSurface).toMatchObject({
      ready: false,
      missingRequirements: [],
      missingGates: ['runtime_action'],
    });
    expect(genericIpcSurface.summary).toContain('runtimeActionRequestSurface=ipc_run_trigger');
    expect(genericIpcSurface.summary).toContain('runtimeActionRequestSurfaceEvidenceChain=missing');
    expect(genericIpcSurface.summary).toContain('runtimeActionGateEvidenceChain=missing');
  });

  it('keeps scheduled Agent API execution promotion closed until scheduled approval gates are promoted', () => {
    const scheduledSurface = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      runtimeAction: {
        action: 'run_start',
        allowed: true,
        requestSurface: 'scheduled_event_agent_trigger',
        runId: 'run_api_execution',
        status: 'ready',
        surface: 'run',
        taskId: 'task_1',
      },
    });

    expect(scheduledSurface).toMatchObject({
      ready: false,
      missingRequirements: [],
      missingGates: ['runtime_action'],
    });
    expect(scheduledSurface.summary).toContain('runtimeActionRequestSurface=scheduled_event_agent_trigger');
    expect(scheduledSurface.summary).toContain('runtimeActionRequestSurfaceEvidenceChain=missing');
    expect(scheduledSurface.summary).toContain('runtimeActionGateEvidenceChain=missing');
  });

  it('requires patch artifact and task file write intents before satisfying execution writeback extraction', () => {
    const artifactOnly = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      writeIntentExtraction: {
        declaredActions: ['artifact.propose'],
        status: 'ready',
        supportedActions: ['artifact.propose'],
      },
    });

    expect(artifactOnly).toMatchObject({
      ready: false,
      missingRequirements: expect.arrayContaining(['write_intent_extraction']),
    });
    expect(artifactOnly.summary).toContain('writeIntentActions=artifact.propose');
    expect(artifactOnly.summary).toContain('writeIntentRunEvidenceChain=missing');
    expect(artifactOnly.summary).toContain('writeIntentTaskEvidenceChain=missing');
  });

  it('requires write intent extraction to belong to the same run and target task', () => {
    const wrongRun = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      writeIntentExtraction: {
        declaredActions: ['artifact.propose', 'task_file.propose'],
        runId: 'run_other',
        status: 'ready',
        supportedActions: ['artifact.propose', 'task_file.propose'],
        taskId: 'task_1',
      },
    });

    expect(wrongRun).toMatchObject({
      ready: false,
      missingRequirements: expect.arrayContaining(['write_intent_extraction']),
    });
    expect(wrongRun.summary).toContain('writeIntentRun=run_other');
    expect(wrongRun.summary).toContain('writeIntentRunEvidenceChain=missing');
    expect(wrongRun.summary).toContain('writeIntentTaskEvidenceChain=ready');

    const wrongTask = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      writeIntentExtraction: {
        declaredActions: ['artifact.propose', 'task_file.propose'],
        runId: 'run_api_execution',
        status: 'ready',
        supportedActions: ['artifact.propose', 'task_file.propose'],
        taskId: 'task_2',
      },
    });

    expect(wrongTask).toMatchObject({
      ready: false,
      missingRequirements: expect.arrayContaining(['write_intent_extraction']),
    });
    expect(wrongTask.summary).toContain('writeIntentRunEvidenceChain=ready');
    expect(wrongTask.summary).toContain('writeIntentTask=task_2');
    expect(wrongTask.summary).toContain('writeIntentTaskEvidenceChain=missing');
  });

  it('blocks Agent API execution promotion when Write Intent extraction includes non-proposal actions', () => {
    const unsafeAction = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      writeIntentExtraction: {
        declaredActions: ['artifact.propose', 'task_file.propose', 'workspace.apply'],
        runId: 'run_api_execution',
        status: 'ready',
        supportedActions: ['artifact.propose', 'task_file.propose', 'workspace.apply'],
        taskId: 'task_1',
      },
    });

    expect(unsafeAction).toMatchObject({
      ready: false,
      missingRequirements: expect.arrayContaining(['write_intent_extraction']),
    });
    expect(unsafeAction.summary).toContain('writeIntentActions=artifact.propose,task_file.propose,workspace.apply');
    expect(unsafeAction.summary).toContain('writeIntentSupportedActionCount=3');
    expect(unsafeAction.summary).toContain('writeIntentDeclaredActionCount=3');
    expect(unsafeAction.summary).toContain('writeIntentActionIdentityChain=missing');
    expect(unsafeAction.summary).toContain('writeIntentActionBoundary=missing');
    expect(unsafeAction.summary).toContain('writeIntentRunEvidenceChain=ready');
    expect(unsafeAction.summary).toContain('writeIntentTaskEvidenceChain=ready');
  });

  it('blocks Agent API execution promotion when Write Intent actions are duplicated', () => {
    const duplicateAction = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      writeIntentExtraction: {
        declaredActions: ['artifact.propose', 'task_file.propose', 'task_file.propose'],
        runId: 'run_api_execution',
        status: 'ready',
        supportedActions: ['artifact.propose', 'task_file.propose', 'task_file.propose'],
        taskId: 'task_1',
      },
    });

    expect(duplicateAction).toMatchObject({
      ready: false,
      missingRequirements: expect.arrayContaining(['write_intent_extraction']),
    });
    expect(duplicateAction.summary).toContain('writeIntentActions=artifact.propose,task_file.propose,task_file.propose');
    expect(duplicateAction.summary).toContain('writeIntentSupportedActionCount=3');
    expect(duplicateAction.summary).toContain('writeIntentDeclaredActionCount=3');
    expect(duplicateAction.summary).toContain('declaredWriteIntentActions=artifact.propose,task_file.propose,task_file.propose');
    expect(duplicateAction.summary).toContain('writeIntentDeclaredActionChain=missing');
    expect(duplicateAction.summary).toContain('writeIntentActionIdentityChain=missing');
    expect(duplicateAction.summary).toContain('writeIntentActionBoundary=missing');
    expect(duplicateAction.summary).toContain('writeIntentRunEvidenceChain=ready');
    expect(duplicateAction.summary).toContain('writeIntentTaskEvidenceChain=ready');
  });

  it('blocks Agent API execution promotion when declared Write Intent action evidence is missing', () => {
    const missingDeclaredActionEvidence = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      writeIntentExtraction: {
        runId: 'run_api_execution',
        status: 'ready',
        supportedActions: ['artifact.propose', 'task_file.propose'],
        taskId: 'task_1',
      },
    });

    expect(missingDeclaredActionEvidence.ready).toBe(false);
    expect(missingDeclaredActionEvidence.missingRequirements).toContain('write_intent_extraction');
    expect(missingDeclaredActionEvidence.summary).toContain('writeIntentDeclaredActionCount=0');
    expect(missingDeclaredActionEvidence.summary).toContain('declaredWriteIntentActions=none');
    expect(missingDeclaredActionEvidence.summary).toContain('writeIntentDeclaredActionEvidenceChain=missing');
    expect(missingDeclaredActionEvidence.summary).toContain('writeIntentDeclaredActionChain=missing');
    expect(missingDeclaredActionEvidence.summary).toContain('writeIntentActionBoundary=missing');
  });

  it('keeps post-run Agent API execution promotion blocked until writeback evidence is complete', () => {
    const postRunNoWriteback = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      reviewedPatchApplyBoundary: null,
      writeIntentExtraction: null,
    });

    expect(postRunNoWriteback).toMatchObject({
      ready: false,
      satisfiedRequirements: [
        'selected_runtime_contract',
        'target_task_identity',
        'provider_visible_preflight',
        'runtime_context_manifest',
        'context_readiness_step',
        'task_memory_guidance',
        'run_goal_contract',
        'post_step_verification',
        'run_evidence_persistence',
      ],
      missingRequirements: [
        'write_intent_extraction',
        'reviewed_patch_apply_boundary',
      ],
      missingGates: [],
    });
    expect(postRunNoWriteback.summary).toContain('requirements=9/11');
    expect(postRunNoWriteback.summary).toContain('gates=9/9');
    expect(postRunNoWriteback.summary).toContain('runId=run_api_execution');
    expect(postRunNoWriteback.summary).toContain('terminalRunStatus=completed');
    expect(postRunNoWriteback.summary).toContain('terminalEvidence=present');
    expect(postRunNoWriteback.summary).toContain('postStepRunEvidenceChain=ready');
    expect(postRunNoWriteback.summary).toContain('postStepTaskEvidenceChain=ready');
    expect(postRunNoWriteback.summary).toContain('writeIntentSupportedActionCount=0');
    expect(postRunNoWriteback.summary).toContain('writeIntentActions=none');
    expect(postRunNoWriteback.summary).toContain('writeIntentDeclaredActionCount=0');
    expect(postRunNoWriteback.summary).toContain('writeIntentMode=proposal_boundary');
    expect(postRunNoWriteback.summary).toContain('noWriteIntentRequired=no');
    expect(postRunNoWriteback.summary).toContain('reviewedPatchApplyBoundary=missing');
  });

  it('allows Agent API execution promotion when a completed run proves no write intents or workspace patch were required', () => {
    const noWriteRun = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      reviewedPatchApplyBoundary: {
        appliedPromotionStatus: 'not_required',
        explicitApplyOnly: true,
        noWorkspaceWriteRequired: true,
        promotionPreflightReady: false,
        runId: 'run_api_execution',
        taskId: 'task_1',
      },
      writeIntentExtraction: {
        declaredActions: [],
        noWriteIntentRequired: true,
        runId: 'run_api_execution',
        status: 'ready',
        supportedActions: [],
        taskId: 'task_1',
      },
    });

    expect(noWriteRun).toMatchObject({
      ready: true,
      missingRequirements: [],
      missingGates: [],
    });
    expect(noWriteRun.summary).toContain('writeIntentActions=none');
    expect(noWriteRun.summary).toContain('writeIntentSupportedActionCount=0');
    expect(noWriteRun.summary).toContain('writeIntentDeclaredActionCount=0');
    expect(noWriteRun.summary).toContain('writeIntentMode=no_write_intents_required');
    expect(noWriteRun.summary).toContain('noWriteIntentRequired=yes');
    expect(noWriteRun.summary).toContain('writeIntentActionIdentityChain=missing');
    expect(noWriteRun.summary).toContain('writeIntentActionBoundary=ready');
    expect(noWriteRun.summary).toContain('reviewedPatchApplyBoundary=ready');
    expect(noWriteRun.summary).toContain('reviewedPatchBoundaryMode=no_workspace_write');
    expect(noWriteRun.summary).toContain('reviewedPatchExplicitApply=yes');
    expect(noWriteRun.summary).toContain('noWorkspaceWriteRequired=yes');
    expect(noWriteRun.summary).toContain('patchPromotionPreflight=missing');
    expect(noWriteRun.summary).toContain('patchPromotionStatus=not_required');
    expect(noWriteRun.summary).toContain('patchPromotionRunEvidenceChain=ready');
    expect(noWriteRun.summary).toContain('patchPromotionTaskEvidenceChain=ready');
  });

  it('does not treat declared-but-invalid write intents as no-write Agent API promotion evidence', () => {
    const invalidDeclaredIntent = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      reviewedPatchApplyBoundary: {
        appliedPromotionStatus: 'not_required',
        explicitApplyOnly: true,
        noWorkspaceWriteRequired: true,
        promotionPreflightReady: false,
        runId: 'run_api_execution',
        taskId: 'task_1',
      },
      writeIntentExtraction: {
        declaredActions: ['source_context.create'],
        noWriteIntentRequired: true,
        runId: 'run_api_execution',
        status: 'ready',
        supportedActions: [],
        taskId: 'task_1',
      },
    });

    expect(invalidDeclaredIntent).toMatchObject({
      ready: false,
      missingRequirements: expect.arrayContaining(['write_intent_extraction']),
    });
    expect(invalidDeclaredIntent.summary).toContain('writeIntentActions=none');
    expect(invalidDeclaredIntent.summary).toContain('writeIntentSupportedActionCount=0');
    expect(invalidDeclaredIntent.summary).toContain('writeIntentDeclaredActionCount=1');
    expect(invalidDeclaredIntent.summary).toContain('declaredWriteIntentActions=source_context.create');
    expect(invalidDeclaredIntent.summary).toContain('writeIntentDeclaredActionChain=missing');
    expect(invalidDeclaredIntent.summary).toContain('noWriteIntentRequired=yes');
    expect(invalidDeclaredIntent.summary).toContain('writeIntentActionBoundary=missing');
  });

  it('blocks source-context-only Agent API promotion until durable writeback apply is confirmed', () => {
    const sourceContextRun = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      reviewedPatchApplyBoundary: {
        appliedPromotionStatus: 'not_required',
        explicitApplyOnly: true,
        noWorkspaceWriteRequired: true,
        promotionPreflightReady: false,
        runId: 'run_api_execution',
        taskId: 'task_1',
      },
      writeIntentExtraction: {
        declaredActions: ['source_context.create'],
        runId: 'run_api_execution',
        status: 'ready',
        supportedActions: ['source_context.create'],
        taskId: 'task_1',
      },
    });

    expect(sourceContextRun).toMatchObject({
      ready: false,
      missingRequirements: ['reviewed_patch_apply_boundary'],
      missingGates: [],
    });
    expect(sourceContextRun.summary).toContain('writeIntentActions=source_context.create');
    expect(sourceContextRun.summary).toContain('writeIntentSupportedActionCount=1');
    expect(sourceContextRun.summary).toContain('writeIntentDeclaredActionCount=1');
    expect(sourceContextRun.summary).toContain('writeIntentMode=proposal_boundary');
    expect(sourceContextRun.summary).toContain('writeIntentActionIdentityChain=ready');
    expect(sourceContextRun.summary).toContain('writeIntentActionBoundary=ready');
    expect(sourceContextRun.summary).toContain('reviewedPatchApplyBoundary=missing');
    expect(sourceContextRun.summary).toContain('reviewedPatchBoundaryMode=durable_writeback_mismatch');
    expect(sourceContextRun.summary).toContain('noWorkspaceWriteRequired=yes');
    expect(sourceContextRun.summary).toContain('patchPromotionStatus=not_required');
    expect(sourceContextRun.summary).toContain('durableWritebackAction=missing');
    expect(sourceContextRun.summary).toContain('durableWritebackStatus=missing');
    expect(sourceContextRun.summary).toContain('durableWritebackRunEvidenceChain=missing');
    expect(sourceContextRun.summary).toContain('durableWritebackTaskEvidenceChain=missing');
  });

  it('allows source-context-only Agent API promotion after durable writeback apply evidence is confirmed', () => {
    const sourceContextRun = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      durableWritebackBoundary: {
        action: 'source_context.create',
        confirmationSurface: 'right_panel_writeback_confirmation',
        runId: 'run_api_execution',
        status: 'applied',
        taskId: 'task_1',
      },
      reviewedPatchApplyBoundary: null,
      writeIntentExtraction: {
        declaredActions: ['source_context.create'],
        runId: 'run_api_execution',
        status: 'ready',
        supportedActions: ['source_context.create'],
        taskId: 'task_1',
      },
    });

    expect(sourceContextRun).toMatchObject({
      ready: true,
      missingRequirements: [],
      missingGates: [],
    });
    expect(sourceContextRun.summary).toContain('writeIntentActions=source_context.create');
    expect(sourceContextRun.summary).toContain('reviewedPatchApplyBoundary=ready');
    expect(sourceContextRun.summary).toContain('reviewedPatchBoundaryMode=durable_writeback');
    expect(sourceContextRun.summary).toContain('durableWritebackAction=source_context.create');
    expect(sourceContextRun.summary).toContain('durableWritebackStatus=applied');
    expect(sourceContextRun.summary).toContain('durableWritebackConfirmationSurface=right_panel_writeback_confirmation');
    expect(sourceContextRun.summary).toContain('durableWritebackRunEvidenceChain=ready');
    expect(sourceContextRun.summary).toContain('durableWritebackTaskEvidenceChain=ready');
  });

  it('recovers source-context durable writeback promotion evidence from task detail records', () => {
    const durableWritebackBoundary = deriveAgentApiDurableWritebackBoundaryFromTaskEvidence({
      action: 'source_context.create',
      runId: 'run_api_execution',
      sourceContexts: [{
        runId: 'run_api_execution',
        status: 'active',
        taskId: 'task_1',
      }],
      taskId: 'task_1',
      timeline: [{
        payload: JSON.stringify({
          confirmationSurface: 'taskplane_writeback_approval_queue',
          evidenceRunId: 'run_api_execution',
          source: 'taskplane_write_intent',
        }),
        type: 'panel.source_updated',
      }],
    });

    expect(durableWritebackBoundary).toEqual({
      action: 'source_context.create',
      confirmationSurface: 'taskplane_writeback_approval_queue',
      runId: 'run_api_execution',
      status: 'applied',
      taskId: 'task_1',
    });

    const readiness = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      durableWritebackBoundary,
      reviewedPatchApplyBoundary: null,
      writeIntentExtraction: {
        declaredActions: ['source_context.create'],
        runId: 'run_api_execution',
        status: 'ready',
        supportedActions: ['source_context.create'],
        taskId: 'task_1',
      },
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.summary).toContain('reviewedPatchBoundaryMode=durable_writeback');
    expect(readiness.summary).toContain('durableWritebackConfirmationSurface=taskplane_writeback_approval_queue');
  });

  it('does not recover durable writeback promotion evidence from mismatched or unconfirmed task detail records', () => {
    const mismatched = deriveAgentApiDurableWritebackBoundaryFromTaskEvidence({
      action: 'source_context.create',
      runId: 'run_api_execution',
      sourceContexts: [{
        runId: 'run_other',
        status: 'active',
        taskId: 'task_1',
      }],
      taskId: 'task_1',
      timeline: [{
        payload: JSON.stringify({
          confirmationSurface: 'taskplane_writeback_approval_queue',
          evidenceRunId: 'run_api_execution',
        }),
        type: 'panel.source_updated',
      }],
    });
    const unconfirmed = deriveAgentApiDurableWritebackBoundaryFromTaskEvidence({
      action: 'source_context.create',
      runId: 'run_api_execution',
      sourceContexts: [{
        runId: 'run_api_execution',
        status: 'active',
        taskId: 'task_1',
      }],
      taskId: 'task_1',
      timeline: [{
        payload: JSON.stringify({
          evidenceRunId: 'run_api_execution',
        }),
        type: 'panel.source_updated',
      }],
    });

    expect(mismatched).toBeNull();
    expect(unconfirmed).toBeNull();
  });

  it('blocks patch-proposal Agent API promotion when reviewed-patch apply is replaced by no-workspace-write evidence', () => {
    const patchIntentWithoutApply = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      reviewedPatchApplyBoundary: {
        appliedPromotionStatus: 'not_required',
        explicitApplyOnly: true,
        noWorkspaceWriteRequired: true,
        promotionPreflightReady: false,
        runId: 'run_api_execution',
        taskId: 'task_1',
      },
    });

    expect(patchIntentWithoutApply).toMatchObject({
      ready: false,
      missingRequirements: ['reviewed_patch_apply_boundary'],
    });
    expect(patchIntentWithoutApply.summary).toContain('writeIntentActions=artifact.propose,task_file.propose');
    expect(patchIntentWithoutApply.summary).toContain('writeIntentActionIdentityChain=ready');
    expect(patchIntentWithoutApply.summary).toContain('reviewedPatchApplyBoundary=missing');
    expect(patchIntentWithoutApply.summary).toContain('reviewedPatchBoundaryMode=no_workspace_write_mismatch');
    expect(patchIntentWithoutApply.summary).toContain('noWorkspaceWriteRequired=yes');
    expect(patchIntentWithoutApply.summary).toContain('patchPromotionStatus=not_required');
  });

  it('blocks no-write Agent API promotion when reviewed-patch apply evidence claims an applied patch', () => {
    const noWriteIntentWithAppliedPatch = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      reviewedPatchApplyBoundary: {
        appliedPromotionStatus: 'applied',
        explicitApplyOnly: true,
        promotionPreflightReady: true,
        runId: 'run_api_execution',
        taskId: 'task_1',
      },
      writeIntentExtraction: {
        declaredActions: [],
        noWriteIntentRequired: true,
        runId: 'run_api_execution',
        status: 'ready',
        supportedActions: [],
        taskId: 'task_1',
      },
    });

    expect(noWriteIntentWithAppliedPatch).toMatchObject({
      ready: false,
      missingRequirements: ['reviewed_patch_apply_boundary'],
    });
    expect(noWriteIntentWithAppliedPatch.summary).toContain('writeIntentActions=none');
    expect(noWriteIntentWithAppliedPatch.summary).toContain('noWriteIntentRequired=yes');
    expect(noWriteIntentWithAppliedPatch.summary).toContain('reviewedPatchApplyBoundary=missing');
    expect(noWriteIntentWithAppliedPatch.summary).toContain('reviewedPatchBoundaryMode=patch_apply_mismatch');
    expect(noWriteIntentWithAppliedPatch.summary).toContain('patchPromotionStatus=applied');
  });

  it('blocks source-context-only Agent API promotion when extra unsupported write intents were declared', () => {
    const mixedDeclaredIntent = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      reviewedPatchApplyBoundary: {
        appliedPromotionStatus: 'not_required',
        explicitApplyOnly: true,
        noWorkspaceWriteRequired: true,
        promotionPreflightReady: false,
        runId: 'run_api_execution',
        taskId: 'task_1',
      },
      writeIntentExtraction: {
        declaredActions: ['source_context.create', 'workspace.apply'],
        runId: 'run_api_execution',
        status: 'ready',
        supportedActions: ['source_context.create'],
        taskId: 'task_1',
      },
    });

    expect(mixedDeclaredIntent).toMatchObject({
      ready: false,
      missingRequirements: expect.arrayContaining(['write_intent_extraction']),
    });
    expect(mixedDeclaredIntent.summary).toContain('writeIntentActions=source_context.create');
    expect(mixedDeclaredIntent.summary).toContain('writeIntentSupportedActionCount=1');
    expect(mixedDeclaredIntent.summary).toContain('writeIntentDeclaredActionCount=2');
    expect(mixedDeclaredIntent.summary).toContain('declaredWriteIntentActions=source_context.create,workspace.apply');
    expect(mixedDeclaredIntent.summary).toContain('writeIntentDeclaredActionChain=missing');
    expect(mixedDeclaredIntent.summary).toContain('writeIntentActionIdentityChain=missing');
    expect(mixedDeclaredIntent.summary).toContain('writeIntentActionBoundary=missing');
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
      missingRequirements: expect.arrayContaining([
        'selected_runtime_contract',
        'provider_visible_preflight',
      ]),
    });
    expect(missingProvider.summary).toContain('providerConfigured=ready');
    expect(missingProvider.summary).toContain('configuredProvider=missing');
    expect(missingProvider.summary).toContain('configuredProviderEvidenceChain=missing');
    expect(missingProvider.summary).toContain('providerStartupProbe=not_called');
  });

  it('requires provider-visible preflight to carry explicit no-startup-probe evidence', () => {
    const missingStartupProbe = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      providerVisiblePreflight: {
        configuredProvider: 'openai',
        providerConfigured: true,
        runId: 'run_api_execution',
        status: 'ready',
        taskId: 'task_1',
      } as unknown as NonNullable<AgentApiExecutionPromotionServiceEvidence['providerVisiblePreflight']>,
    });

    expect(missingStartupProbe).toMatchObject({
      ready: false,
      missingRequirements: ['provider_visible_preflight'],
    });
    expect(missingStartupProbe.summary).toContain('providerStartupProbe=missing');
    expect(missingStartupProbe.summary).toContain('providerPreflightRunEvidenceChain=ready');
    expect(missingStartupProbe.summary).toContain('providerPreflightTaskEvidenceChain=ready');
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

  it('requires reviewed patch apply evidence to be applied and tied to the same run and target task', () => {
    const pending = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      reviewedPatchApplyBoundary: {
        appliedPromotionStatus: 'pending',
        explicitApplyOnly: true,
        promotionPreflightReady: false,
        runId: 'run_api_execution',
        taskId: 'task_1',
      },
    });

    expect(pending).toMatchObject({
      ready: false,
      missingRequirements: ['reviewed_patch_apply_boundary'],
    });
    expect(pending.summary).toContain('reviewedPatchApplyBoundary=missing');
    expect(pending.summary).toContain('patchPromotionStatus=pending');
    expect(pending.summary).toContain('patchPromotionRunEvidenceChain=ready');
    expect(pending.summary).toContain('patchPromotionTaskEvidenceChain=ready');

    const wrongRun = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      reviewedPatchApplyBoundary: {
        appliedPromotionStatus: 'applied',
        explicitApplyOnly: true,
        promotionPreflightReady: true,
        runId: 'run_other',
        taskId: 'task_1',
      },
    });

    expect(wrongRun).toMatchObject({
      ready: false,
      missingRequirements: ['reviewed_patch_apply_boundary'],
    });
    expect(wrongRun.summary).toContain('patchPromotionRun=run_other');
    expect(wrongRun.summary).toContain('patchPromotionRunEvidenceChain=missing');
    expect(wrongRun.summary).toContain('patchPromotionTaskEvidenceChain=ready');

    const wrongTask = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      reviewedPatchApplyBoundary: {
        appliedPromotionStatus: 'applied',
        explicitApplyOnly: true,
        promotionPreflightReady: true,
        runId: 'run_api_execution',
        taskId: 'task_2',
      },
    });

    expect(wrongTask).toMatchObject({
      ready: false,
      missingRequirements: ['reviewed_patch_apply_boundary'],
    });
    expect(wrongTask.summary).toContain('patchPromotionRunEvidenceChain=ready');
    expect(wrongTask.summary).toContain('patchPromotionTask=task_2');
    expect(wrongTask.summary).toContain('patchPromotionTaskEvidenceChain=missing');
  });

  it('requires post-step verification to belong to the same run and target task', () => {
    const wrongRun = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      postStepVerification: {
        runId: 'run_other',
        status: 'ready',
        taskId: 'task_1',
        verifier: 'taskplane.verifier.lightweight',
      },
    });

    expect(wrongRun).toMatchObject({
      ready: false,
      missingRequirements: ['post_step_verification'],
    });
    expect(wrongRun.summary).toContain('postStepRun=run_other');
    expect(wrongRun.summary).toContain('postStepRunEvidenceChain=missing');
    expect(wrongRun.summary).toContain('postStepTaskEvidenceChain=ready');

    const wrongTask = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
      ...completeAgentApiExecutionPromotionEvidence(),
      postStepVerification: {
        runId: 'run_api_execution',
        status: 'ready',
        taskId: 'task_2',
        verifier: 'taskplane.verifier.lightweight',
      },
    });

    expect(wrongTask).toMatchObject({
      ready: false,
      missingRequirements: ['post_step_verification'],
    });
    expect(wrongTask.summary).toContain('postStepRunEvidenceChain=ready');
    expect(wrongTask.summary).toContain('postStepTask=task_2');
    expect(wrongTask.summary).toContain('postStepTaskEvidenceChain=missing');
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
      taskId: 'task_1',
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
      runId: 'run_api_execution',
      status: 'ready' as const,
      taskId: 'task_1',
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
    pilotDecision: {
      backend: 'agent_api' as const,
      executor: 'agent_api' as const,
      messagePriority: 'steer' as const,
      movement: 'execute' as const,
      operationMode: 'product_control_layer' as const,
      priorityLane: 'continue_or_review' as const,
    },
    reviewedPatchApplyBoundary: {
      appliedPromotionStatus: 'applied' as const,
      explicitApplyOnly: true,
      promotionPreflightReady: true,
      runId: 'run_api_execution',
      taskId: 'task_1',
    },
    runEvidencePersistence: {
      runId: 'run_api_execution',
      taskId: 'task_1',
      terminalEvidenceSummary: 'output_chars=42',
      terminalEvidenceStatus: 'present' as const,
      terminalRunStatus: 'completed' as const,
    },
    runGoalContract: {
      completionConditionCount: 1,
      objective: 'Produce reviewable task evidence.',
      runId: 'run_api_execution',
      taskId: 'task_1',
    },
    selectedRuntimeContract: {
      invocationLayer: 'api_runtime' as const,
      phase: 'execution_run' as const,
      provider: 'openai',
      runId: 'run_api_execution',
      runtimeMode: 'api' as const,
      taskId: 'task_1',
    },
    simplicityCheck: {
      smallestMovement: 'run_start',
      status: 'ready' as const,
      taskId: 'task_1',
    },
    subtaskStart: {
      status: 'ready' as const,
      taskId: 'task_1',
    },
    runtimeAction: {
      action: 'run_start',
      allowed: true,
      requestSurface: 'readiness_smoke_operator_request' as const,
      runId: 'run_api_execution',
      status: 'ready' as const,
      surface: 'run',
      taskId: 'task_1',
    },
    targetTaskId: 'task_1',
    taskMemoryGuidance: {
      guidanceCount: 1,
      status: 'ready' as const,
      taskId: 'task_1',
    },
    taskMemoryCoverage: {
      status: 'ready' as const,
      taskId: 'task_1',
    },
    writeIntentExtraction: {
      declaredActions: ['artifact.propose', 'task_file.propose'],
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
    rationale: '独立边界清楚',
    summary: '确认范围',
    title: '需求与范围确认',
  };
}

function buildAgentApiDecompositionApplyPlan(
  params: Omit<Parameters<typeof buildSubtaskCreateManyWritebackApplyPlan>[0], 'confirmationSurface'>
    & Partial<Pick<Parameters<typeof buildSubtaskCreateManyWritebackApplyPlan>[0], 'confirmationSurface'>>,
) {
  return buildSubtaskCreateManyWritebackApplyPlan({
    ...params,
    confirmationSurface: params.confirmationSurface ?? 'readiness_smoke_operator_confirmation',
    runtimeContract: params.runtimeContract ?? {
      evidenceRunId: params.evidenceRunId ?? null,
      invocationLayer: 'api_runtime',
      parentTaskId: params.parentTaskId,
      provider: 'openai',
      phase: 'decomposition_draft',
      runtimeMode: 'api',
    },
  });
}

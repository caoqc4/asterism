import { describe, expect, it } from 'vitest';

import {
  buildRunGoalContract,
  deriveTaskGoalLifecycleState,
  evaluateGoalContextTransitionReadiness,
  evaluateRuntimeNativeGoalForwarding,
  formatRunGoalContractForPrompt,
  formatRunGoalContractForStep,
  parseAgentRuntimeSlashCommand,
  parseProductGoalDraft,
  type RunGoalContract,
} from './agent-runtime-goal.js';
import { buildDefaultAgentCliRuntimeCapabilities } from './agent-cli-runtime-status.js';
import { evaluateBusinessMemoryCoverage } from './business-memory-coverage.js';
import { evaluateContextTransition } from './context-transition.js';
import type { RuntimeContextManifest } from './runtime-context.js';
import type { TaskDetail } from './types/task.js';
import { evaluateNativeGoalForwardingReadiness } from './native-goal-forwarding-readiness.js';

describe('agent-runtime-goal', () => {
  it('keeps product /goal commands owned by Taskplane', () => {
    expect(parseAgentRuntimeSlashCommand('/goal 完成迁移并保持测试通过')).toEqual({
      kind: 'product_goal_set',
      objective: '完成迁移并保持测试通过',
    });
    expect(parseAgentRuntimeSlashCommand('/goal')).toEqual({ kind: 'product_goal_status' });
    expect(parseAgentRuntimeSlashCommand('/goal status')).toEqual({ kind: 'product_goal_status' });
    expect(parseAgentRuntimeSlashCommand('/goal pause')).toEqual({ kind: 'product_goal_pause' });
    expect(parseAgentRuntimeSlashCommand('/goal resume')).toEqual({ kind: 'product_goal_resume' });
    expect(parseAgentRuntimeSlashCommand('/goal clear')).toEqual({ kind: 'product_goal_clear' });
  });

  it('parses product goal drafts with optional completion conditions', () => {
    expect(parseProductGoalDraft([
      '完成 Agent CLI 目标闭环',
      '验收:',
      '- Run Goal Contract 写入目标',
      '- verifier 给出下一步',
      '完成条件: 任务记忆提案出现；测试通过',
    ].join('\n'))).toEqual({
      objective: '完成 Agent CLI 目标闭环',
      completionConditions: [
        'Run Goal Contract 写入目标',
        'verifier 给出下一步',
        '任务记忆提案出现',
        '测试通过',
      ],
    });
  });

  it('requires explicit namespace for runtime-native goal forwarding', () => {
    expect(parseAgentRuntimeSlashCommand('/codex goal complete PLAN.md')).toEqual({
      kind: 'runtime_native_goal',
      runtimeId: 'codex',
      objective: 'complete PLAN.md',
    });
    expect(parseAgentRuntimeSlashCommand('/claude goal all tests pass')).toEqual({
      kind: 'runtime_native_goal',
      runtimeId: 'claude',
      objective: 'all tests pass',
    });
    expect(parseAgentRuntimeSlashCommand('/runtime goal selected backend loop')).toEqual({
      kind: 'runtime_native_goal',
      runtimeId: 'selected',
      objective: 'selected backend loop',
    });
  });

  it('requires a concrete objective for runtime-native goal requests', () => {
    expect(parseAgentRuntimeSlashCommand('/codex goal ')).toEqual({
      kind: 'unknown',
      command: '/codex goal',
    });
    expect(parseAgentRuntimeSlashCommand('/runtime goal ')).toEqual({
      kind: 'unknown',
      command: '/runtime goal',
    });
  });

  it('does not guess unknown slash commands', () => {
    expect(parseAgentRuntimeSlashCommand('普通任务消息')).toEqual({ kind: 'none' });
    expect(parseAgentRuntimeSlashCommand('/unknown do work')).toEqual({
      kind: 'unknown',
      command: '/unknown',
    });
  });

  it('keeps runtime-native goal forwarding closed behind a shared policy', () => {
    expect(evaluateRuntimeNativeGoalForwarding(null)).toMatchObject({
      forwarded: false,
      policy: 'capability_unavailable',
      reason: 'Adapter capability is unavailable.',
      supportsNativeGoalMode: false,
    });

    const disabled = buildDefaultAgentCliRuntimeCapabilities('codex', 'Codex CLI');
    expect(evaluateRuntimeNativeGoalForwarding(disabled)).toMatchObject({
      forwarded: false,
      passthroughRequiresExplicitNamespace: true,
      policy: 'native_goal_unverified',
      reason: 'Codex CLI native goal mode requires Codex CLI 0.133.0+; installed version is unknown.',
      supportsNativeGoalMode: false,
    });

    const oldCodex = buildDefaultAgentCliRuntimeCapabilities('codex', 'Codex CLI', 'codex-cli 0.125.0');
    expect(evaluateRuntimeNativeGoalForwarding(oldCodex)).toMatchObject({
      forwarded: false,
      passthroughRequiresExplicitNamespace: true,
      policy: 'runtime_requires_update',
      reason: 'Codex CLI native goal mode requires Codex CLI 0.133.0+; detected 0.125.0.',
      supportsNativeGoalMode: false,
    });

    const currentCodex = buildDefaultAgentCliRuntimeCapabilities('codex', 'Codex CLI', 'codex-cli 0.133.0');
    expect(evaluateRuntimeNativeGoalForwarding(currentCodex)).toMatchObject({
      forwarded: false,
      passthroughRequiresExplicitNamespace: true,
      policy: 'passthrough_entrypoint_closed',
      reason: 'Adapter declares native goal support, but Taskplane passthrough entrypoint is not open yet.',
      supportsNativeGoalMode: true,
    });

    expect(evaluateNativeGoalForwardingReadiness({
      adapterId: 'codex',
      adapterCapabilityVerified: true,
      commandShapeVerified: true,
      controlBoundaryVerified: false,
      memoryBoundaryVerified: true,
      packagedSmokeVerified: false,
      progressEvidenceVerified: true,
      sourceOfTruthBoundaryVerified: true,
      stateReflectionVerified: true,
    })).toMatchObject({
      ready: false,
      status: 'audit_only',
      missingEvidence: ['control boundary', 'packaged smoke'],
    });
  });

  it('derives Task Goal lifecycle from durable timeline events', () => {
    expect(deriveTaskGoalLifecycleState({
      nextStep: '完成验收',
      timeline: [],
    })).toMatchObject({
      objective: '完成验收',
      status: 'active',
    });
    expect(deriveTaskGoalLifecycleState({
      nextStep: '完成验收',
      timeline: [{
        id: 'event_pause',
        taskId: 'task_1',
        type: 'panel.task_goal_paused',
        payload: JSON.stringify({ objective: '完成验收', source: '/goal pause' }),
        createdAt: '2026-05-20T01:00:00.000Z',
      }],
    })).toMatchObject({
      objective: '完成验收',
      source: '/goal pause',
      status: 'paused',
    });
    expect(deriveTaskGoalLifecycleState({
      nextStep: null,
      timeline: [{
        id: 'event_clear',
        taskId: 'task_1',
        type: 'panel.task_goal_updated',
        payload: JSON.stringify({ cleared: true, previousObjective: '完成验收', source: '/goal clear' }),
        createdAt: '2026-05-20T02:00:00.000Z',
      }],
    })).toMatchObject({
      objective: null,
      previousObjective: '完成验收',
      status: 'cleared',
    });
  });

  it('persists Task Goal lifecycle in the Run Goal Contract', () => {
    const contract = buildRunGoalContract({
      contextGateSummary: 'gate ready',
      contextManifest: { summary: 'manifest ready' } as RuntimeContextManifest,
      executionKind: 'cli',
      prompt: 'Run a one-off inspection.',
      runId: 'run_1',
      runtimeId: 'codex',
      runtimeLabel: 'Codex CLI',
      sandboxMode: 'read-only',
      task: {
        completionCriteria: [],
        id: 'task_1',
        nextStep: 'Durable goal that is paused.',
        resumeCard: { nextSuggestedMove: 'Resume goal' },
        timeline: [{
          id: 'event_pause',
          taskId: 'task_1',
          type: 'panel.task_goal_paused',
          payload: JSON.stringify({ objective: 'Durable goal that is paused.', source: '/goal pause' }),
          createdAt: '2026-05-20T01:00:00.000Z',
        }],
        title: 'Task 1',
      } as unknown as TaskDetail,
    });

    expect(contract.taskGoal).toMatchObject({
      objective: 'Durable goal that is paused.',
      source: '/goal pause',
      status: 'paused',
    });
    expect(contract.objective).toBe('Run a one-off inspection.');
    expect(formatRunGoalContractForStep(contract)).toContain('taskGoal=paused');
    expect(formatRunGoalContractForPrompt(contract)).toContain('Task Goal: status=paused');
  });

  it('carries selected runtime capability declarations in the Run Goal Contract', () => {
    const contract = buildRunGoalContract({
      contextGateSummary: 'gate ready',
      contextManifest: { summary: 'manifest ready' } as RuntimeContextManifest,
      executionKind: 'cli',
      prompt: 'Inspect native capabilities.',
      runId: 'run_1',
      runtimeCapabilities: buildDefaultAgentCliRuntimeCapabilities('codex', 'Codex CLI', '0.133.0'),
      runtimeId: 'codex',
      runtimeLabel: 'Codex CLI',
      sandboxMode: 'read-only',
      task: {
        completionCriteria: [],
        id: 'task_1',
        nextStep: 'Inspect native capabilities.',
        resumeCard: null,
        timeline: [],
        title: 'Task 1',
      } as unknown as TaskDetail,
    });

    expect(contract.runtimeCapabilities).toEqual(expect.arrayContaining([
      'native_goal=available',
      'web_search=unverified',
      'workspace_write=unsupported',
      'memory=product_controlled',
    ]));
    expect(formatRunGoalContractForStep(contract)).toContain('runtimeCapabilities=');
    expect(formatRunGoalContractForPrompt(contract)).toContain('Runtime capabilities:');
  });

  it('uses Task Goal timeline completion conditions when task criteria are not persisted yet', () => {
    const contract = buildRunGoalContract({
      contextGateSummary: 'gate ready',
      contextManifest: { summary: 'manifest ready' } as RuntimeContextManifest,
      executionKind: 'cli',
      prompt: 'Continue the durable goal.',
      runId: 'run_1',
      runtimeId: 'codex',
      runtimeLabel: 'Codex CLI',
      sandboxMode: 'read-only',
      task: {
        completionCriteria: [],
        id: 'task_1',
        nextStep: 'Durable goal with criteria.',
        resumeCard: null,
        timeline: [{
          id: 'event_goal',
          taskId: 'task_1',
          type: 'panel.task_goal_updated',
          payload: JSON.stringify({
            objective: 'Durable goal with criteria.',
            completionConditions: ['Verifier records evidence', 'Task memory proposal is surfaced'],
            source: '/goal',
          }),
          createdAt: '2026-05-20T01:00:00.000Z',
        }],
        title: 'Task 1',
      } as unknown as TaskDetail,
    });

    expect(contract.taskGoal.completionConditions).toEqual([
      'Verifier records evidence',
      'Task memory proposal is surfaced',
    ]);
    expect(contract.completionConditions).toEqual([
      'Verifier records evidence',
      'Task memory proposal is surfaced',
    ]);
  });

  it('allows long goal compact only after owner coverage, verifier, preservation proof, run evidence, and next safe action pass', () => {
    const owner = {
      actionId: 'action_1',
      businessLineId: 'business_1',
      kind: 'next_action' as const,
      taskId: 'task_1',
    };
    const result = evaluateGoalContextTransitionReadiness({
      action: 'compact',
      businessMemoryCoverage: evaluateBusinessMemoryCoverage({
        action: 'context_compact',
        owner,
        hasBusinessLineState: true,
        hasBusinessLineContextPack: true,
        hasCurrentNextAction: true,
        hasNextSafeAction: true,
        hasRecentRunEvidence: true,
        hasRelevantBusinessRecord: true,
        hasSpecificHandoffSignal: true,
        memoryWriteCompleted: true,
      }),
      contextTransition: evaluateContextTransition({
        intent: 'context_refresh',
        owner,
        hasTaskContext: true,
        hasSpecificHandoffSignal: true,
        memoryWriteCompleted: true,
        preferCompact: true,
      }),
      contract: buildContract(),
      hasRecentRunEvidence: true,
      nextSafeAction: 'Review the compacted recovery state, then continue the next action.',
      owner,
      stopCondition: {
        description: 'Goal is still active until verification evidence is reviewed.',
        status: 'not_met',
      },
      verifier: {
        decision: 'accept_for_review',
        evidence: ['stdout=present'],
        missingEvidence: [],
        reason: 'Verifier accepted run evidence for review.',
        verdict: 'pass',
      },
    });

    expect(result).toMatchObject({
      status: 'allowed',
      canCompact: true,
      canReset: false,
      nextAction: 'compact_with_product_transcript_reset',
      resetStrategy: 'product_transcript_reset',
      nativeRuntimeMemoryCleared: false,
      nativeRuntimeResetClaim: 'not_claimed',
      ownerSummary: 'next_action:business_1:action=action_1:task=task_1',
    });
    expect(result.evidence).toEqual(expect.arrayContaining([
      'businessCoverage=pass',
      'preservationProof=ready',
      'runEvidence=present',
      'nextSafeAction=present',
      'verifier=pass',
      'stopCondition=not_met',
      'resetStrategy=product_transcript_reset',
    ]));
  });

  it('blocks goal reset with the smallest missing recovery action when coverage or decisions are unsafe', () => {
    const owner = { kind: 'business_line' as const, businessLineId: 'business_1' };
    const result = evaluateGoalContextTransitionReadiness({
      action: 'reset',
      businessMemoryCoverage: evaluateBusinessMemoryCoverage({
        action: 'context_reset',
        owner,
        hasBusinessLineState: true,
        hasBusinessLineContextPack: true,
        hasNextSafeAction: true,
        hasOpenDecision: true,
        hasRelevantBusinessRecord: false,
        hasSpecificHandoffSignal: true,
      }),
      contract: buildContract(),
      hasPendingDecision: true,
      hasRecentRunEvidence: true,
      nextSafeAction: 'Resolve the pending Decision before resetting.',
      owner,
      stopCondition: { status: 'not_met' },
      verifier: {
        decision: 'accept_for_review',
        evidence: ['stdout=present'],
        missingEvidence: [],
        reason: 'Verifier accepted evidence.',
        verdict: 'pass',
      },
    });

    expect(result).toMatchObject({
      status: 'blocked',
      canReset: false,
      nextAction: 'resolve_pending_decision',
      requiredWrites: ['decision'],
    });
    expect(result.missing).toEqual(expect.arrayContaining([
      'A pending Decision must be resolved before compact/reset.',
      'A pending Decision must be resolved before context transition.',
    ]));
  });

  it('never claims native runtime memory was cleared unless adapter evidence exists', () => {
    const owner = { kind: 'business_line' as const, businessLineId: 'business_1' };
    const base = {
      action: 'reset' as const,
      businessMemoryCoverage: evaluateBusinessMemoryCoverage({
        action: 'context_reset',
        owner,
        hasBusinessLineState: true,
        hasBusinessLineContextPack: true,
        hasNextSafeAction: true,
        hasRecentRunEvidence: true,
        hasRelevantBusinessRecord: true,
        hasSpecificHandoffSignal: true,
        memoryWriteCompleted: true,
      }),
      contract: buildContract(),
      hasRecentRunEvidence: true,
      nextSafeAction: 'Rehydrate from BusinessLineContextPack and continue.',
      owner,
      runtimeCapabilities: {
        ...buildDefaultAgentCliRuntimeCapabilities('claude', 'Claude Code', 'claude-code 2.0.0'),
        supportsPersistentSession: true,
        supportsNativeClear: true,
      },
      stopCondition: { status: 'not_met' as const },
      verifier: {
        decision: 'accept_for_review' as const,
        evidence: ['stdout=present'],
        missingEvidence: [],
        reason: 'Verifier accepted evidence.',
        verdict: 'pass' as const,
      },
    };

    expect(evaluateGoalContextTransitionReadiness(base)).toMatchObject({
      status: 'allowed',
      resetStrategy: 'runtime_native_clear',
      nativeRuntimeMemoryCleared: false,
      nativeRuntimeResetClaim: 'not_claimed',
      nextAction: 'reset_with_runtime_native_clear',
    });
    expect(evaluateGoalContextTransitionReadiness({
      ...base,
      adapterEvidence: {
        adapterEvidenceId: 'reset_event_1',
        nativeClearCompleted: true,
        runtimeSessionId: 'session_1',
      },
    })).toMatchObject({
      nativeRuntimeMemoryCleared: true,
      nativeRuntimeResetClaim: 'adapter_evidence_present',
    });
  });
});

function buildContract(partial: Partial<RunGoalContract> = {}): RunGoalContract {
  return {
    id: 'run_1',
    taskId: 'task_1',
    taskTitle: 'Runtime closure',
    taskGoal: {
      objective: 'Finish runtime goal closure.',
      completionConditions: [],
      previousObjective: null,
      source: '/goal',
      status: 'active',
      updatedAt: '2026-05-20T00:00:00.000Z',
    },
    executionKind: 'cli',
    runtimeId: 'codex',
    runtimeLabel: 'Codex CLI',
    sandboxMode: 'read-only',
    userRequest: 'Check next step.',
    objective: 'Finish runtime goal closure.',
    completionConditions: ['Output is reviewable.'],
    validationEvidence: ['Terminal output persisted.'],
    constraints: ['Do not modify files.'],
    runtimeCapabilities: ['workspace_write=unsupported'],
    contextManifestSummary: 'manifest ready',
    contextGateSummary: 'gate ready',
    expectedOutput: ['Key findings'],
    ...partial,
  };
}

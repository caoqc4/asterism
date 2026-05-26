import { describe, expect, it } from 'vitest';

import {
  buildRunGoalContract,
  deriveTaskGoalLifecycleState,
  evaluateRuntimeNativeGoalForwarding,
  formatRunGoalContractForPrompt,
  formatRunGoalContractForStep,
  parseAgentRuntimeSlashCommand,
  parseProductGoalDraft,
} from './agent-runtime-goal.js';
import { buildDefaultAgentCliRuntimeCapabilities } from './agent-cli-runtime-status.js';
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
});

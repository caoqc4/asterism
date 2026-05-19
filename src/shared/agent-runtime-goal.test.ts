import { describe, expect, it } from 'vitest';

import {
  buildRunGoalContract,
  deriveTaskGoalLifecycleState,
  formatRunGoalContractForPrompt,
  formatRunGoalContractForStep,
  parseAgentRuntimeSlashCommand,
} from './agent-runtime-goal.js';
import type { RuntimeContextManifest } from './runtime-context.js';
import type { TaskDetail } from './types/task.js';

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

  it('does not guess unknown slash commands', () => {
    expect(parseAgentRuntimeSlashCommand('普通任务消息')).toEqual({ kind: 'none' });
    expect(parseAgentRuntimeSlashCommand('/unknown do work')).toEqual({
      kind: 'unknown',
      command: '/unknown',
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
});

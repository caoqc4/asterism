import { describe, expect, it } from 'vitest';
import type { RunDetailRecord, RunStepRecord } from '@shared/types/run';
import { deriveAgentCliProgress } from './agentCliProgress';

const now = '2026-01-01T00:00:00.000Z';

function step(partial: Partial<RunStepRecord>): RunStepRecord {
  return {
    id: partial.id ?? `step_${partial.index ?? 0}`,
    runId: 'run_1',
    index: partial.index ?? 0,
    kind: partial.kind ?? 'tool_call',
    status: partial.status ?? 'completed',
    title: partial.title ?? 'Agent CLI 原生事件',
    input: partial.input ?? null,
    output: partial.output ?? null,
    error: partial.error ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function detail(partial: Partial<RunDetailRecord>): RunDetailRecord {
  return {
    id: 'run_1',
    taskId: 'task_1',
    type: 'agent',
    status: 'running',
    instructions: null,
    output: null,
    outputSource: null,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
    steps: [],
    ...partial,
  };
}

describe('deriveAgentCliProgress', () => {
  it('recognizes native web search events', () => {
    const progress = deriveAgentCliProgress(detail({
      steps: [
        step({ index: 0, title: 'agent cli run accepted', kind: 'plan' }),
        step({
          index: 1,
          title: 'Codex CLI 原生事件：web_search',
          output: 'Found official Codex docs.',
        }),
      ],
    }));

    expect(progress.state).toBe('researching');
    expect(progress.label).toContain('联网检索');
    expect(progress.detail).toBe('Found official Codex docs.');
  });

  it('recognizes native workspace and command events', () => {
    const progress = deriveAgentCliProgress(detail({
      steps: [
        step({
          index: 1,
          title: 'Claude Code 原生事件：Bash',
          output: 'rg -n "agent"',
        }),
      ],
    }));

    expect(progress.state).toBe('reading_workspace');
    expect(progress.label).toContain('读取工作区');
  });

  it('moves completed runs into result organization state', () => {
    const progress = deriveAgentCliProgress(detail({
      status: 'completed',
      output: 'Done.',
    }));

    expect(progress.state).toBe('completed');
    expect(progress.label).toContain('正在整理结果');
  });
});

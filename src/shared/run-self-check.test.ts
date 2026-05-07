import { describe, expect, it } from 'vitest';

import { evaluateRunSelfCheck, evaluateRunStepSelfCheck } from './run-self-check.js';
import type { RunRecord, RunStepRecord } from './types/run.js';

const now = '2026-01-01T00:00:00.000Z';

function buildStep(partial: Partial<RunStepRecord> = {}): RunStepRecord {
  return {
    id: partial.id ?? 'step_1',
    runId: partial.runId ?? 'run_1',
    index: partial.index ?? 0,
    kind: partial.kind ?? 'tool_result',
    status: partial.status ?? 'completed',
    title: partial.title ?? '生成报告',
    input: partial.input ?? null,
    output: 'output' in partial ? partial.output ?? null : 'report.md created',
    error: 'error' in partial ? partial.error ?? null : null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildRun(partial: Partial<RunRecord> = {}): RunRecord {
  return {
    id: partial.id ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    type: partial.type ?? 'agent',
    status: partial.status ?? 'completed',
    instructions: partial.instructions ?? null,
    output: partial.output ?? 'Run completed.',
    outputSource: partial.outputSource ?? 'ai',
    failureReason: partial.failureReason ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

describe('run self-check lightweight rule engine', () => {
  it('passes completed steps with output evidence', () => {
    expect(evaluateRunStepSelfCheck(buildStep())).toMatchObject({
      tone: 'pass',
      label: '检查通过',
      source: 'lightweight_rule_engine',
    });
  });

  it('mentions applicable work habits in step check details', () => {
    expect(evaluateRunStepSelfCheck(buildStep(), { applicableWorkHabitCount: 2 })).toMatchObject({
      detail: '已通过轻量规则对照并留下结果记录。 本次还对照 2 条已确认工作习惯。',
    });
  });

  it('warns when a completed step has no reviewable output', () => {
    expect(evaluateRunStepSelfCheck(buildStep({ output: null }))).toMatchObject({
      tone: 'warn',
      label: '需补证据',
    });
  });

  it('fails failed steps with their error reason', () => {
    expect(evaluateRunStepSelfCheck(buildStep({ status: 'failed', error: '网络超时' }))).toMatchObject({
      tone: 'fail',
      detail: '网络超时',
    });
  });

  it('summarizes run failure when any step check fails', () => {
    expect(evaluateRunSelfCheck(buildRun(), {
      ...buildRun(),
      steps: [buildStep({ status: 'failed', error: '发送失败' })],
    })).toMatchObject({
      tone: 'fail',
      label: 'Run 检查未通过',
    });
  });

  it('mentions applicable work habits in run check details', () => {
    expect(evaluateRunSelfCheck(buildRun(), {
      ...buildRun(),
      steps: [buildStep()],
    }, { applicableWorkHabitCount: 1 })).toMatchObject({
      detail: '执行结果已有输出或步骤证据，可进入人工审查。 本次还对照 1 条已确认工作习惯。',
    });
  });
});

import type { RunDetailRecord, RunRecord, RunStepRecord } from './types/run.js';

export type RunSelfCheckTone = 'pass' | 'warn' | 'fail' | 'pending';
export type RunSelfCheckSource = 'lightweight_rule_engine' | 'ai_verifier';

export type RunSelfCheckResult = {
  tone: RunSelfCheckTone;
  label: string;
  detail: string;
  source: RunSelfCheckSource;
};

const source: RunSelfCheckSource = 'lightweight_rule_engine';

export function evaluateRunStepSelfCheck(step: RunStepRecord): RunSelfCheckResult {
  if (step.status === 'failed') {
    return {
      tone: 'fail',
      label: '检查未通过',
      detail: step.error ?? '步骤执行失败，需要修正后继续。',
      source,
    };
  }
  if (step.status === 'completed') {
    const hasEvidence = Boolean(step.output?.trim() || step.error?.trim());
    return {
      tone: hasEvidence ? 'pass' : 'warn',
      label: hasEvidence ? '检查通过' : '需补证据',
      detail: hasEvidence ? '已通过轻量规则对照并留下结果记录。' : '步骤已结束，但没有留下可审查输出。',
      source,
    };
  }
  if (step.status === 'running') {
    return {
      tone: 'pending',
      label: '检查待完成',
      detail: '步骤结束后自动展示对照结论。',
      source,
    };
  }
  return {
    tone: 'pending',
    label: '未开始',
    detail: '等待执行后检查。',
    source,
  };
}

export function evaluateRunSelfCheck(run: RunRecord, detail?: RunDetailRecord | null): RunSelfCheckResult {
  if (run.status === 'failed') {
    return {
      tone: 'fail',
      label: 'Run 检查未通过',
      detail: run.failureReason ?? 'Run 执行失败，需要修正后重试。',
      source,
    };
  }

  if (run.status === 'completed') {
    const steps = detail?.steps ?? [];
    const hasFailedStep = steps.some((step) => evaluateRunStepSelfCheck(step).tone === 'fail');
    const hasEvidence = Boolean(run.output?.trim()) || steps.some((step) => step.output?.trim());
    if (hasFailedStep) {
      return {
        tone: 'fail',
        label: 'Run 检查未通过',
        detail: '有步骤检查失败，需要回看执行记录。',
        source,
      };
    }
    return {
      tone: hasEvidence ? 'pass' : 'warn',
      label: hasEvidence ? 'Run 验证通过' : 'Run 需补验证',
      detail: hasEvidence ? '执行结果已有输出或步骤证据，可进入人工审查。' : 'Run 已完成，但缺少可复核输出。',
      source,
    };
  }

  if (run.status === 'running' || run.status === 'paused') {
    return {
      tone: 'pending',
      label: run.status === 'paused' ? 'Run 暂停中' : 'Run 检查中',
      detail: 'Run 完成后会汇总步骤检查结果。',
      source,
    };
  }

  return {
    tone: 'pending',
    label: '等待执行',
    detail: 'Run 启动后显示检查结果。',
    source,
  };
}

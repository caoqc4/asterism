import type { RunDetailRecord, RunStepRecord } from '@shared/types/run';

export type AgentCliProgressState =
  | 'preparing'
  | 'researching'
  | 'using_tool'
  | 'reading_workspace'
  | 'reasoning'
  | 'verifying'
  | 'completed'
  | 'failed';

export type AgentCliProgressSnapshot = {
  detail?: string;
  label: string;
  state: AgentCliProgressState;
};

type MinimalRunDetail = Pick<RunDetailRecord, 'failureReason' | 'status' | 'steps'>;

export function deriveAgentCliProgress(detail: MinimalRunDetail | null | undefined): AgentCliProgressSnapshot {
  if (!detail) {
    return {
      label: '正在准备任务上下文...',
      state: 'preparing',
    };
  }
  if (detail.status === 'failed') {
    return {
      detail: detail.failureReason ?? undefined,
      label: '任务 Agent 运行失败，正在等待结果整理。',
      state: 'failed',
    };
  }
  if (detail.status === 'completed') {
    return {
      label: '任务 Agent 已完成，正在整理结果。',
      state: 'completed',
    };
  }

  const latestStep = [...(detail.steps ?? [])]
    .sort((left, right) => left.index - right.index)
    .at(-1);
  if (!latestStep) {
    return {
      label: '正在准备任务上下文...',
      state: 'preparing',
    };
  }
  return deriveAgentCliProgressFromStep(latestStep);
}

function deriveAgentCliProgressFromStep(step: Pick<RunStepRecord, 'kind' | 'output' | 'status' | 'title'>): AgentCliProgressSnapshot {
  const title = step.title.trim();
  const output = step.output?.trim() ?? '';
  const haystack = `${title}\n${output}`.toLowerCase();
  const capability = readStepCapability(output);
  const preparationStatus = /Agent CLI 联网调研准备/i.test(title)
    ? readStepKeyValue(output, 'status')
    : null;

  if (preparationStatus) {
    if (preparationStatus === 'captured') {
      return {
        detail: compactWebResearchPreparationDetail(output, preparationStatus),
        label: '正在整理 Taskplane 联网调研来源。',
        state: 'researching',
      };
    }
    if (preparationStatus === 'skipped' && isWebResearchPersistenceFailure(output)) {
      return {
        detail: compactWebResearchPreparationDetail(output, preparationStatus),
        label: '联网调研来源未能保存，正在准备交给原生 CLI 继续。',
        state: 'preparing',
      };
    }
    return {
      detail: compactWebResearchPreparationDetail(output, preparationStatus),
      label: '正在检查是否需要联网调研。',
      state: 'preparing',
    };
  }

  if (/上下文就绪|context readiness|readiness\.evaluate|decision=(ready|self_research|plan_first|ask_user|blocked)/.test(haystack)) {
    return {
      detail: compactStepDetail(output),
      label: '正在判断上下文是否足够，并选择执行、调研、计划或询问。',
      state: 'preparing',
    };
  }
  if (/验收|verification|verify|check/.test(haystack)) {
    return {
      label: '正在做结果验收和收尾整理。',
      state: 'verifying',
    };
  }
  if (/任务记忆|memory/.test(haystack)) {
    return {
      label: '正在整理任务记忆建议。',
      state: 'verifying',
    };
  }
  if (/completed|完成/.test(haystack) && step.kind === 'model') {
    return {
      label: 'Runtime 已返回结果，正在整理到任务动态。',
      state: 'verifying',
    };
  }
  if (capability === 'web_search' || isExternalResearchStep(haystack)) {
    return {
      detail: compactStepDetail(output),
      label: '正在使用原生 CLI 联网检索或整理来源。',
      state: 'researching',
    };
  }
  if (capability === 'workspace_write') {
    return {
      detail: compactStepDetail(output),
      label: '检测到工作区写入候选；原生 CLI 不会直接写入工作区，正在等待 patch artifact、ready task_file Write Intent、ready patch artifact Write Intent 或 patch-review/promotion evidence 审查。',
      state: 'verifying',
    };
  }
  if (
    capability === 'workspace_read'
    || capability === 'shell_command'
    || isWorkspaceOrCommandStep(haystack)
  ) {
    return {
      detail: compactStepDetail(output),
      label: '正在读取工作区、运行命令或调用本地工具。',
      state: 'reading_workspace',
    };
  }
  if (/tool|call|mcp|hook|原生事件/.test(haystack) || step.kind === 'tool_call' || step.kind === 'tool_result') {
    return {
      detail: compactStepDetail(output),
      label: '正在使用原生 CLI 工具推进任务。',
      state: 'using_tool',
    };
  }
  if (/目标契约|accepted|接收|run accepted/.test(haystack)) {
    return {
      label: 'Runtime 已接收任务，正在开始执行。',
      state: 'reasoning',
    };
  }
  return {
    label: 'Runtime 正在思考并推进任务。',
    state: 'reasoning',
  };
}

function readStepCapability(output: string): string | null {
  const match = output.match(/^capability=([a-z0-9_.-]+)/im);
  return match?.[1]?.toLowerCase() ?? null;
}

function readStepKeyValue(output: string, key: string): string | null {
  return readStepKeyValueRaw(output, key)?.toLowerCase() ?? null;
}

function readStepKeyValueRaw(output: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = output.match(new RegExp(`^${escapedKey}=([^\\n\\r]+)`, 'im'));
  return match?.[1]?.trim() ?? null;
}

function compactWebResearchPreparationDetail(
  output: string,
  status: string,
): string | undefined {
  if (status === 'captured') {
    const sources = readStepKeyValueRaw(output, 'sources');
    const query = readStepKeyValueRaw(output, 'query');
    const sourceContextIds = readStepKeyValueRaw(output, 'source_context_ids');
    const queryLabel = query ? `；查询：${compactLine(query)}` : '';
    const evidenceLabel = sourceContextIds ? `；证据：${compactLine(sourceContextIds)}` : '';
    return `已保存 ${sources && sources !== '0' ? sources : '若干'} 个来源到来源上下文${queryLabel}${evidenceLabel}。`;
  }
  if (status === 'not_needed') {
    return '当前任务没有识别到需要新鲜外部资料。';
  }
  const reason = readStepKeyValueRaw(output, 'reason');
  return reason ? compactLine(reason) : undefined;
}

function isWebResearchPersistenceFailure(output: string): boolean {
  const reason = readStepKeyValueRaw(output, 'reason') ?? output;
  return /none could be saved|could not be saved|source context.*unavailable/i.test(reason);
}

function isExternalResearchStep(haystack: string): boolean {
  if (/workspace[._-]search|workspace[._-]read|ripgrep|\brg\b|\bgrep\b|\bls\b|\bcat\b/.test(haystack)) {
    return false;
  }
  return /联网|web[_\s.-]?search|websearch|browse|browser|external|url|https?:\/\//.test(haystack);
}

function isWorkspaceOrCommandStep(haystack: string): boolean {
  return /workspace|read|grep|ripgrep|\brg\b|file|\bls\b|\bcat\b|\bsed\b|bash|shell|command|terminal|exec|write|edit|patch|apply_patch/.test(haystack);
}

function compactStepDetail(output: string): string | undefined {
  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => Boolean(line) && !/^(capability|provider_event)=/.test(line));
  if (!firstLine) return undefined;
  return compactLine(firstLine);
}

function compactLine(value: string): string {
  return value.length > 90 ? `${value.slice(0, 87)}...` : value;
}

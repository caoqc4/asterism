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
  it('recognizes context readiness as a native preparation step', () => {
    const progress = deriveAgentCliProgress(detail({
      steps: [
        step({
          index: 1,
          kind: 'plan',
          title: 'Agent CLI 上下文就绪判断',
          output: 'decision=self_research\nmovement=research\nsummary=Context readiness: self_research.',
        }),
      ],
    }));

    expect(progress.state).toBe('preparing');
    expect(progress.label).toContain('判断上下文');
    expect(progress.detail).toBe('decision=self_research');
  });

  it('recognizes native web search events', () => {
    const progress = deriveAgentCliProgress(detail({
      steps: [
        step({ index: 0, title: 'agent cli run accepted', kind: 'plan' }),
        step({
          index: 1,
          title: 'Codex CLI 联网检索：web_search',
          output: 'capability=web_search\nprovider_event=tool.result\nFound official Codex docs.',
        }),
      ],
    }));

    expect(progress.state).toBe('researching');
    expect(progress.label).toContain('联网检索');
    expect(progress.detail).toBe('Found official Codex docs.');
  });

  it('does not show web research progress when preparation says research is not needed', () => {
    const progress = deriveAgentCliProgress(detail({
      steps: [
        step({
          index: 1,
          title: 'Agent CLI 联网调研准备',
          output: [
            'status=not_needed',
            'capability_mode=native',
            'sources=0',
            'reason=The selected task and user request do not appear to require fresh external research.',
          ].join('\n'),
        }),
      ],
    }));

    expect(progress.state).toBe('preparing');
    expect(progress.label).toContain('是否需要联网调研');
    expect(progress.detail).toBe('当前任务没有识别到需要新鲜外部资料。');
  });

  it('summarizes captured web research preparation without exposing raw status keys', () => {
    const progress = deriveAgentCliProgress(detail({
      steps: [
        step({
          index: 1,
          title: 'Agent CLI 联网调研准备',
          output: [
            'status=captured',
            'capability_mode=native',
            'sources=3',
            'source_context_ids=source_context_1,source_context_2,source_context_3',
            'query=Codex CLI docs',
            'reason=Taskplane captured web research into Source Context before handing the task to the selected Agent CLI.',
          ].join('\n'),
        }),
      ],
    }));

    expect(progress.state).toBe('researching');
    expect(progress.label).toContain('联网调研来源');
    expect(progress.detail).toBe('已保存 3 个来源到来源上下文；查询：Codex CLI docs；证据：source_context_1,source_context_2,source_context_3。');
  });

  it('identifies web research source persistence failures as unsaved evidence', () => {
    const progress = deriveAgentCliProgress(detail({
      steps: [
        step({
          index: 1,
          title: 'Agent CLI 联网调研准备',
          output: [
            'status=skipped',
            'capability_mode=native',
            'sources=0',
            'attempted_sources=2',
            'failed_sources=2',
            'query=Codex CLI docs',
            'reason=Taskplane web research produced 2 source context item(s), but none could be saved. Selected native CLI web/search is unverified by the current probe; Taskplane will only project native web/search when visible events appear.',
          ].join('\n'),
        }),
      ],
    }));

    expect(progress.state).toBe('preparing');
    expect(progress.label).toContain('来源未能保存');
    expect(progress.detail).toContain('none could be saved');
    expect(progress.detail).toContain('尝试来源：2，失败：2');
  });

  it('does not mistake workspace search for web research', () => {
    const progress = deriveAgentCliProgress(detail({
      steps: [
        step({
          index: 1,
          title: 'Tool started: workspace.search',
          output: 'capability=workspace_read\nprovider_event=tool.call\n{"query":"agent"}',
        }),
      ],
    }));

    expect(progress.state).toBe('reading_workspace');
    expect(progress.label).toContain('读取工作区');
    expect(progress.detail).toBe('{"query":"agent"}');
  });

  it('recognizes native workspace and command events', () => {
    const progress = deriveAgentCliProgress(detail({
      steps: [
        step({
          index: 1,
          title: 'Claude Code 命令执行：Bash',
          output: 'capability=shell_command\nprovider_event=assistant\nrg -n "agent"',
        }),
      ],
    }));

    expect(progress.state).toBe('reading_workspace');
    expect(progress.label).toContain('读取工作区');
  });

  it('shows workspace write capability events as reviewable write candidates', () => {
    const progress = deriveAgentCliProgress(detail({
      steps: [
        step({
          index: 1,
          title: 'Codex CLI 工作区写入候选',
          output: 'capability=workspace_write\napply_patch changed src/app.ts',
        }),
      ],
    }));

    expect(progress.state).toBe('verifying');
    expect(progress.label).toContain('工作区写入候选');
    expect(progress.label).toContain('不会直接写入工作区');
    expect(progress.label).toContain('ready task_file Write Intent');
    expect(progress.label).toContain('ready patch artifact Write Intent');
    expect(progress.label).toContain('patch-review/promotion evidence');
    expect(progress.detail).toBe('apply_patch changed src/app.ts');
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

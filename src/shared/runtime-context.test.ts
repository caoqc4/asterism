import { describe, expect, it } from 'vitest';

import type { AgentWorkingContext } from './types/agent-execution.js';
import { buildRuntimeCapabilitySnapshot } from './runtime-capability-snapshot.js';
import {
  buildRuntimeContextAssemblyPolicy,
  buildRuntimeContextManifest,
  buildRuntimeContextSnapshot,
  formatRuntimeContextManifestForStep,
} from './runtime-context.js';

function buildWorkingContext(): AgentWorkingContext {
  return {
    productPrinciples: 'principles',
    task: {
      id: 'task_1',
      title: 'Launch task',
      summary: 'Ship the launch note',
      state: 'running',
      nextStep: 'Draft',
      riskLevel: 'medium',
      riskNote: null,
    },
    priorityLane: 'escalate_now',
    resumeSummary: 'Resume launch',
    completion: {
      total: 2,
      satisfied: 1,
      open: 1,
      nextOpenCriterion: 'Legal approved',
    },
    blockers: [],
    dependencies: [],
    sources: [
      {
        capturedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'source_1',
        title: 'Launch source',
        kind: 'note',
        isKey: true,
        note: 'Primary',
        contentPreview: 'Source preview',
        runId: null,
        sourceRole: 'raw',
        status: 'active',
        updatedAt: '2026-01-01T00:00:00.000Z',
        uri: 'https://example.com/launch',
      },
    ],
    artifacts: [
      {
        title: 'Draft.md',
        kind: 'note',
        sourceType: 'run',
        updatedAt: '2026-01-01T00:00:00.000Z',
        contentPreview: 'Draft preview',
      },
    ],
    taskFiles: [
      {
        path: 'Task.md',
        kind: 'file',
        updatedAt: '2026-01-01T00:00:00.000Z',
        contentPreview: '# Task',
      },
    ],
    processTemplates: [
      {
        id: 'template_1',
        title: 'Writing checklist',
        kind: 'skill',
        summary: 'Checklist summary',
      },
    ],
    recentTimeline: [
      {
        type: 'task.updated',
        summary: 'Next step changed',
        createdAt: '2026-01-02T00:00:00.000Z',
        dateGroup: '2026-01-02',
        objectFamily: '任务字段',
        priorityGroup: '留痕事件',
      },
    ],
  };
}

describe('runtime context manifest', () => {
  it('builds an explicit context snapshot for global, task, and task-file modes', () => {
    expect(buildRuntimeContextSnapshot({})).toMatchObject({
      activeSurface: 'global',
      mode: 'global',
      taskId: null,
      conversationMode: 'global',
      isTaskBound: false,
      summary: '全局上下文',
    });

    expect(buildRuntimeContextSnapshot({
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
    })).toMatchObject({
      activeSurface: 'task',
      mode: 'task',
      taskId: 'task_1',
      selectedFilePath: null,
      conversationMode: 'task_bound',
      isTaskBound: true,
      summary: '任务上下文：Launch task',
    });

    expect(buildRuntimeContextSnapshot({
      selectedFile: { path: 'Task.md', kind: 'task_record' },
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
    })).toMatchObject({
      activeSurface: 'task',
      mode: 'task_file',
      selectedFilePath: 'Task.md',
      selectedFileKind: 'task_record',
      summary: '任务上下文：Launch task / 文件：Task.md',
    });
  });

  it('projects agent working context into one runtime manifest', () => {
    const manifest = buildRuntimeContextManifest({
      applicableWorkHabits: ['先做事实核对'],
      selectedFile: { path: 'notes.md', kind: 'file', contentPreview: 'Selected file' },
      workingContext: buildWorkingContext(),
    });

    expect(manifest).toMatchObject({
      activeSurface: 'task',
      summary: 'Runtime context manifest / surface=task / task=Launch task / items=8 / sources=1 / artifacts=1 / files=2 / timeline=1 / habits=1',
      userFacingSummary: '当前会读取：任务状态、当前选中文件、1 个来源、1 个产物、最近记录、适用工作习惯。',
    });
    expect(manifest.items.map((item) => item.kind)).toEqual([
      'task_state',
      'selected_file',
      'source_context',
      'artifact',
      'task_file',
      'process_template',
      'timeline',
      'work_habit',
    ]);
    expect(formatRuntimeContextManifestForStep(manifest)).toContain(
      'selected_file:notes.md:notes.md:content=yes:include=include:reason=selected_file',
    );
    expect(formatRuntimeContextManifestForStep(manifest)).toContain(
      'source_context:source_1:Launch source:content=yes:include=caution:reason=key_source',
    );
  });

  it('preserves source quality metadata from agent working context sources', () => {
    const workingContext = buildWorkingContext();
    workingContext.sources = [
      {
        ...workingContext.sources[0],
        id: 'source_duplicate',
        title: '重复来源',
        contentPreview: 'duplicate source',
        isDuplicate: true,
        uri: 'https://example.com/duplicate',
      },
      {
        ...workingContext.sources[0],
        id: 'source_sensitive',
        title: '敏感来源',
        contentPreview: 'token=secret',
        containsSensitiveData: true,
        uri: 'https://example.com/private',
      },
      {
        ...workingContext.sources[0],
        id: 'source_low_credibility',
        title: '低可信来源',
        contentPreview: 'unverified',
        credibility: 'low',
        uri: 'https://example.com/low',
      },
    ];

    const manifest = buildRuntimeContextManifest({ workingContext });

    expect(manifest.items.find((item) => item.id === 'source_duplicate')).toMatchObject({
      contentIncluded: false,
      inclusionDecision: 'exclude',
      inclusionReason: 'duplicate',
    });
    expect(manifest.items.find((item) => item.id === 'source_sensitive')).toMatchObject({
      contentIncluded: true,
      inclusionDecision: 'caution',
      inclusionReason: 'sensitive',
    });
    expect(manifest.items.find((item) => item.id === 'source_low_credibility')).toMatchObject({
      contentIncluded: true,
      inclusionDecision: 'caution',
      inclusionReason: 'low_credibility',
    });
  });

  it('describes global context without task-bound durable inputs', () => {
    expect(buildRuntimeContextManifest({}).userFacingSummary).toBe(
      '全局上下文：不会读取具体任务文件；可以捕获新任务或讨论方向。',
    );
  });

  it('evaluates task-bound context assembly against required read order', () => {
    const manifest = buildRuntimeContextManifest({
      workingContext: buildWorkingContext(),
    });
    const policy = buildRuntimeContextAssemblyPolicy({ manifest });

    expect(policy).toMatchObject({
      activeSurface: 'task',
      canExecuteTaskWork: true,
      missingRequired: [],
      summary: 'Runtime context assembly ready.',
    });
    expect(policy.requirements.map((item) => [item.kind, item.status])).toEqual([
      ['product_principles', 'included'],
      ['task_state', 'included'],
      ['task_md', 'included'],
      ['task_records', 'optional'],
      ['selected_file', 'optional'],
      ['structured_signals', 'included'],
      ['work_habits', 'optional'],
    ]);
  });

  it('normalizes task memory paths in context assembly checks', () => {
    const manifest = buildRuntimeContextManifest({
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
      taskFiles: [
        { path: ' Task.md ', kind: 'file', contentPreview: '# Task' },
        { path: ' Task Records\\handoff.md ', kind: 'file', contentPreview: '# Handoff' },
      ],
    });
    const policy = buildRuntimeContextAssemblyPolicy({ manifest });

    expect(policy.requirements.map((item) => [item.kind, item.status])).toContainEqual(['task_md', 'included']);
    expect(policy.requirements.map((item) => [item.kind, item.status])).toContainEqual(['task_records', 'included']);
  });

  it('blocks task execution policy when required inputs are missing', () => {
    const manifest = buildRuntimeContextManifest({
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
    });
    const policy = buildRuntimeContextAssemblyPolicy({
      manifest,
      productPrinciplesIncluded: false,
    });

    expect(policy.canExecuteTaskWork).toBe(false);
    expect(policy.missingRequired).toEqual(['product_principles', 'task_md']);
    expect(policy.summary).toBe('Runtime context assembly missing required inputs: product_principles,task_md.');
  });

  it('accepts task files supplied without a full working context', () => {
    const manifest = buildRuntimeContextManifest({
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
      taskFiles: [
        { path: 'Task.md', kind: 'file', contentPreview: '# Task' },
      ],
    });

    expect(manifest.items.map((item) => item.kind)).toEqual(['task_state', 'task_file']);
    expect(buildRuntimeContextAssemblyPolicy({ manifest })).toMatchObject({
      canExecuteTaskWork: true,
      missingRequired: [],
    });
  });

  it('can include runtime capability state as context assembly input', () => {
    const manifest = buildRuntimeContextManifest({
      capabilities: buildRuntimeCapabilitySnapshot({
        aiStatus: {
          configured: true,
          apiKeyStored: true,
          apiKeySource: 'env',
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-latest',
          baseUrl: null,
          workspaceRoot: '/repo',
          updatedAt: '2026-01-01T00:00:00.000Z',
          configPath: '/config.json',
          featureFlags: { enableScheduler: false },
        },
      }),
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
      taskFiles: [{ path: 'Task.md', kind: 'file', contentPreview: '# Task' }],
    });

    expect(manifest.items.map((item) => item.kind)).toEqual(['task_state', 'task_file', 'capability']);
    expect(manifest.summary).toContain('capabilities=1');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('capability:runtime_capabilities');
  });

  it('adds source freshness inclusion reasons to manifest source contexts', () => {
    const manifest = buildRuntimeContextManifest({
      sourceContexts: [
        {
          id: 'source_recent',
          title: '近期来源',
          kind: 'doc',
          contentPreview: 'recent',
          uri: 'https://example.com/recent',
          updatedAt: '2026-05-14T00:00:00.000Z',
        },
        {
          id: 'source_old',
          title: '陈旧来源',
          kind: 'note',
          contentPreview: 'old',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'source_selected',
          title: '显式选择来源',
          kind: 'note',
          contentPreview: 'selected',
          selected: true,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
      taskFiles: [{ path: 'Task.md', kind: 'file', contentPreview: '# Task' }],
    });

    expect(manifest.items.find((item) => item.id === 'source_recent')).toMatchObject({
      contentIncluded: true,
      inclusionDecision: 'include',
      inclusionReason: 'recent',
    });
    expect(manifest.items.find((item) => item.id === 'source_old')).toMatchObject({
      contentIncluded: false,
      inclusionDecision: 'exclude',
      inclusionReason: 'stale',
    });
    expect(manifest.items.find((item) => item.id === 'source_selected')).toMatchObject({
      contentIncluded: true,
      inclusionDecision: 'include',
      inclusionReason: 'explicitly_selected',
    });
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('include=exclude:reason=stale');
  });

  it('combines source freshness with quality checks before including source context', () => {
    const manifest = buildRuntimeContextManifest({
      sourceContexts: [
        {
          id: 'source_sensitive',
          title: '敏感来源',
          kind: 'doc',
          contentPreview: 'api_key=secret',
          uri: 'https://example.com/private',
          updatedAt: '2026-05-14T00:00:00.000Z',
        },
        {
          id: 'source_untraceable',
          title: '无追溯备注',
          kind: 'note',
          contentPreview: '客户似乎改变想法',
          updatedAt: '2026-05-14T00:00:00.000Z',
        },
        {
          id: 'source_duplicate',
          title: '重复来源',
          kind: 'doc',
          contentPreview: 'duplicate',
          isDuplicate: true,
          uri: 'https://example.com/duplicate',
          updatedAt: '2026-05-14T00:00:00.000Z',
        },
        {
          id: 'source_low_credibility',
          title: '低可信来源',
          kind: 'doc',
          contentPreview: 'low credibility',
          credibility: 'low',
          uri: 'https://example.com/low',
          updatedAt: '2026-05-14T00:00:00.000Z',
        },
      ],
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
      taskFiles: [{ path: 'Task.md', kind: 'file', contentPreview: '# Task' }],
    });

    expect(manifest.items.find((item) => item.id === 'source_sensitive')).toMatchObject({
      contentIncluded: true,
      inclusionDecision: 'caution',
      inclusionReason: 'sensitive',
    });
    expect(manifest.items.find((item) => item.id === 'source_untraceable')).toMatchObject({
      contentIncluded: true,
      inclusionDecision: 'caution',
      inclusionReason: 'missing_trace',
    });
    expect(manifest.items.find((item) => item.id === 'source_duplicate')).toMatchObject({
      contentIncluded: false,
      inclusionDecision: 'exclude',
      inclusionReason: 'duplicate',
    });
    expect(manifest.items.find((item) => item.id === 'source_low_credibility')).toMatchObject({
      contentIncluded: true,
      inclusionDecision: 'caution',
      inclusionReason: 'low_credibility',
    });
  });

  it('adds selected-file relevance reasons to manifest selected files', () => {
    const manifest = buildRuntimeContextManifest({
      selectedFile: {
        path: 'AI 项目拆解自检.md',
        kind: 'ai_output',
        contentPreview: 'draft',
      },
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
      taskFiles: [{ path: 'Task.md', kind: 'file', contentPreview: '# Task' }],
    });

    expect(manifest.items.find((item) => item.kind === 'selected_file')).toMatchObject({
      inclusionDecision: 'caution',
      inclusionReason: 'generated_output',
    });
  });
});

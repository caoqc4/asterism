import { describe, expect, it } from 'vitest';

import type { AgentWorkingContext } from './types/agent-execution.js';
import type { BusinessLineWorkspace } from './types/business-line.js';
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

function buildBusinessLineWorkspace(partial: Partial<BusinessLineWorkspace> = {}): BusinessLineWorkspace {
  const businessLine: BusinessLineWorkspace['businessLine'] = {
    id: 'business_line_product',
    title: 'Product line',
    summary: 'Grow the product launch motion.',
    goal: 'Convert launch evidence into better next actions.',
    kind: 'software_product',
    legacyTaskId: null,
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
  };
  const contextPack: BusinessLineWorkspace['contextPack'] = {
    businessSummary: businessLine.summary,
    currentGoal: businessLine.goal,
    recentChanges: ['Launch evidence changed the next recommendation.'],
    activeDecisions: [],
    openNextActions: [],
    latestRecords: [],
    acceptedSkills: [],
    knownConstraints: ['Do not bypass writeback confirmation.'],
    permissionBoundaries: ['Runtime output proposes; Taskplane services persist.'],
    missingContext: [],
  };
  return {
    businessLine,
    contextPack,
    learning: {
      acceptedSkills: [],
      reviews: [],
      skillRevisions: [],
    },
    nextActions: [],
    overview: {
      blockedDecisions: [],
      latestImprovement: null,
      latestResult: null,
      missingContext: [],
      nextSuggestion: null,
      recentChanges: ['Launch evidence changed the next recommendation.'],
    },
    records: [],
    sourceRecords: [],
    automations: {
      automations: [],
      sensors: [],
    },
    ...partial,
  };
}

describe('runtime context manifest', () => {
  it('builds an explicit context snapshot for global, business-line, next-action, legacy-task, and task-file modes', () => {
    expect(buildRuntimeContextSnapshot({})).toMatchObject({
      activeSurface: 'global',
      mode: 'global',
      taskId: null,
      conversationMode: 'global',
      isTaskBound: false,
      summary: '全局上下文',
    });

    expect(buildRuntimeContextSnapshot({
      businessLineContextPack: buildBusinessLineWorkspace(),
    })).toMatchObject({
      activeSurface: 'business_line',
      mode: 'business_line',
      taskId: null,
      conversationMode: 'business_line_bound',
      isTaskBound: false,
      summary: '业务线上下文：Product line',
    });

    expect(buildRuntimeContextSnapshot({
      businessLineContextPack: buildBusinessLineWorkspace(),
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
    })).toMatchObject({
      activeSurface: 'next_action',
      mode: 'next_action',
      taskId: 'task_1',
      conversationMode: 'task_bound',
      isTaskBound: true,
    });

    expect(buildRuntimeContextSnapshot({
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
    })).toMatchObject({
      activeSurface: 'legacy_task',
      mode: 'legacy_task',
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
      activeSurface: 'task_file',
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
      activeSurface: 'task_file',
      summary: 'Runtime context manifest / surface=task_file / task=Launch task / items=8 / sources=1 / artifacts=1 / files=2 / timeline=1 / habits=1 / exclusions=none',
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

  it('treats business-line context packs as first-class manifest surfaces', () => {
    const manifest = buildRuntimeContextManifest({
      businessLineContextPack: buildBusinessLineWorkspace({
        contextPack: {
          ...buildBusinessLineWorkspace().contextPack,
          missingContext: ['Need pricing source.'],
        },
      }),
    });

    expect(manifest).toMatchObject({
      activeSurface: 'business_line',
      userFacingSummary: '业务线上下文：当前会读取：BusinessLineContextPack。',
    });
    expect(manifest.items).toEqual([
      expect.objectContaining({
        contentIncluded: true,
        id: 'business_line_product',
        kind: 'business_line_context_pack',
        label: 'Product line',
        note: expect.stringContaining('BusinessLineContextPack'),
      }),
    ]);
    expect(manifest.summary).toContain('surface=business_line');
    expect(manifest.summary).toContain('businessLine=Product line');
    expect(manifest.summary).toContain('contextPack=BusinessLineContextPack');
    expect(manifest.summary).toContain('packMissing=1');
    expect(manifest.summary).toContain('exclusions=none');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain(
      'business_line_context_pack:business_line_product:Product line:content=yes',
    );
  });

  it('treats next actions as business-line task carriers while keeping task memory gates', () => {
    const manifest = buildRuntimeContextManifest({
      businessLineContextPack: buildBusinessLineWorkspace(),
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
      taskFiles: [{ path: 'Task.md', kind: 'file', contentPreview: '# Task' }],
    });
    const policy = buildRuntimeContextAssemblyPolicy({ manifest });

    expect(manifest.activeSurface).toBe('next_action');
    expect(manifest.items.map((item) => item.kind)).toEqual([
      'business_line_context_pack',
      'task_state',
      'task_file',
    ]);
    expect(manifest.summary).toContain('surface=next_action');
    expect(manifest.userFacingSummary).toContain('BusinessLineContextPack、任务状态');
    expect(policy).toMatchObject({
      activeSurface: 'next_action',
      canExecuteTaskWork: true,
      missingRequired: [],
    });
  });

  it('bridges optional capability surfaces as context-only boundaries', () => {
    const manifest = buildRuntimeContextManifest({
      capabilityRegistry: [
        {
          access: 'read_only',
          configured: true,
          family: 'external_access',
          id: 'external_access.connectors',
          label: 'External Access',
          missingReason: null,
          requiredGate: 'runtime_entrypoint_coverage',
          requiresApproval: true,
          status: 'available',
          summary: 'connected=1 / pending=0 / errors=0 / catalogue=1',
          visibility: 'policy_gated',
        },
        {
          access: 'read_only',
          configured: false,
          family: 'skill',
          id: 'skills.catalogue',
          label: 'Skills',
          missingReason: 'No ready model-visible Skill is enabled.',
          requiredGate: 'runtime_entrypoint_coverage',
          requiresApproval: false,
          status: 'unconfigured',
          summary: 'enabled=1 / ready=1 / modelVisible=0 / needsConfig=0 / catalogue=1',
          visibility: 'hidden',
        },
        {
          access: 'mixed',
          configured: false,
          family: 'mcp',
          id: 'mcp.servers',
          label: 'MCP Servers',
          missingReason: 'Connected MCP tools are not exposed through the runtime tool gate.',
          requiredGate: 'runtime_entrypoint_coverage',
          requiresApproval: true,
          status: 'unconfigured',
          summary: 'connectedServers=1 / tools=3 / modelVisibleTools=0 / errors=0 / catalogue=1',
          visibility: 'hidden',
        },
      ],
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
      taskFiles: [{ path: 'Task.md', kind: 'file', contentPreview: '# Task' }],
    });

    expect(manifest.items.filter((item) => item.kind === 'capability').map((item) => item.id)).toEqual([
      'capability:external_access',
      'capability:skill',
      'capability:mcp',
    ]);
    expect(formatRuntimeContextManifestForStep(manifest)).toContain(
      'capability:capability:external_access:External Access context bridge:content=yes',
    );
    expect(formatRuntimeContextManifestForStep(manifest)).toContain(
      'note=family=mcp / status=unconfigured / configured=0 / available=0 / blocked=1',
    );
    expect(manifest.capabilityAllowance?.summary).toContain('perBusinessLineMatrix=no');
    expect(manifest.capabilityAllowance?.surfaces.find((surface) => surface.surface === 'external_access')).toMatchObject({
      allowance: 'context_only',
    });
    expect(manifest.capabilityAllowance?.surfaces.find((surface) => surface.surface === 'skills')).toMatchObject({
      allowance: 'blocked',
    });
    expect(manifest.capabilityAllowance?.surfaces.find((surface) => surface.surface === 'mcp_tools')).toMatchObject({
      allowance: 'blocked',
    });
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('capability_allowance:external_access:context_only');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('capability_allowance:mcp_tools:blocked');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('businessLineSkills=business_memory_only');
    expect(manifest.userFacingSummary).toContain('运行能力状态');
  });

  it('attaches deterministic task memory retrieval to task-bound manifests', () => {
    const manifest = buildRuntimeContextManifest({
      applicableWorkHabits: ['先做事实核对'],
      selectedFile: { path: 'Task.md', kind: 'file', contentPreview: '# Task' },
      workingContext: buildWorkingContext(),
    });

    expect(manifest.memoryRetrieval).toMatchObject({
      totalCount: 7,
      includedCount: 6,
      cautionCount: 1,
      excludedCount: 0,
    });
    expect(manifest.memoryRetrieval?.topResults.map((item) => item.kind)).toContain('task_state');
    expect(manifest.memoryRetrieval?.topResults.map((item) => item.kind)).toContain('task_md');
    expect(manifest.memoryRetrieval?.topResults.map((item) => item.kind)).toContain('work_habit');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('memory_retrieval:total=7');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('task_md/Task.md/include');
  });

  it('surfaces received completion handoff records in task-bound memory retrieval', () => {
    const workingContext = buildWorkingContext();
    workingContext.taskFiles = [
      ...workingContext.taskFiles,
      {
        path: 'Task Records/2026-05-20-received-handoff.md',
        kind: 'file',
        updatedAt: '2026-05-20T00:00:00.000Z',
        contentPreview: '# Record: Task Completion Handoff\n\n## From\n- Previous task\n\n## To\n- Launch task',
      },
    ];

    const manifest = buildRuntimeContextManifest({ workingContext });
    const handoff = manifest.memoryRetrieval?.topResults.find((item) => item.id === 'Task Records/2026-05-20-received-handoff.md');

    expect(handoff).toMatchObject({
      kind: 'task_record',
      decision: 'include',
      reasons: expect.arrayContaining(['current_task_scope']),
      title: '2026-05-20-received-handoff.md',
    });
    expect(formatRuntimeContextManifestForStep(manifest)).toContain(
      'task_record/Task Records/2026-05-20-received-handoff.md/include/current_task_scope',
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
    expect(manifest.summary).toContain('exclusions=source_context:source_duplicate:duplicate');
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
      activeSurface: 'legacy_task',
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
          runtimeMode: 'api',
          featureFlags: { enableScheduler: false },
        },
      }),
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
      taskFiles: [{ path: 'Task.md', kind: 'file', contentPreview: '# Task' }],
    });

    expect(manifest.items.map((item) => item.kind)).toEqual(['task_state', 'task_file', 'capability']);
    expect(manifest.summary).toContain('capabilities=1');
    expect(manifest.summary).toContain('allowances=6');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('capability:runtime_capabilities');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('capability_allowance:local_file_scope:read_only');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('capability_allowance:hooks:blocked');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('selectedRuntime=Agent API Runtime');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('runtimeExecutable=no');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('supported provider-backed phases');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('Task execution run remains deferred');
  });

  it('formats runtime capability context as counts without exposing hidden optional catalogue entries', () => {
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
          toolScaffoldSummaries: [
            {
              family: 'skill',
              descriptorIds: ['skill.prompt_shape'],
              implementedCount: 0,
              reservedCount: 1,
              connectorPolicyRecords: [],
              localVerificationEvidence: [],
              textPromptExposedIds: [],
              providerNativeExposedIds: [],
              checkpointRequiredIds: [],
              credentialGatedIds: ['skill.prompt_shape'],
              localVerificationRequiredIds: ['skill.prompt_shape'],
              modelVisibleIds: [],
              summary: 'skill.prompt_shape reserved for Brainstorming catalogue preview',
            },
            {
              family: 'mcp',
              descriptorIds: ['mcp.safe_read'],
              implementedCount: 0,
              reservedCount: 1,
              connectorPolicyRecords: [],
              localVerificationEvidence: [],
              textPromptExposedIds: [],
              providerNativeExposedIds: [],
              checkpointRequiredIds: [],
              credentialGatedIds: ['mcp.safe_read'],
              localVerificationRequiredIds: ['mcp.safe_read'],
              modelVisibleIds: [],
              summary: 'mcp.safe_read reserved for Playwright MCP catalogue preview',
            },
          ],
        },
      }),
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
      taskFiles: [{ path: 'Task.md', kind: 'file', contentPreview: '# Task' }],
    });
    const formatted = formatRuntimeContextManifestForStep(manifest);

    expect(formatted).toContain('modelVisibleTools=0');
    expect(formatted).toContain('checkpointTools=0');
    expect(formatted).not.toContain('skill.prompt_shape');
    expect(formatted).not.toContain('mcp.safe_read');
    expect(formatted).not.toContain('Brainstorming');
    expect(formatted).not.toContain('Playwright');
  });

  it('formats capability registry status as counts in runtime context', () => {
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
          capabilityRegistry: [
            {
              access: 'mixed',
              configured: true,
              family: 'skill',
              id: 'skills.catalogue',
              label: 'Skills',
              missingReason: null,
              requiredGate: 'runtime_entrypoint_coverage',
              requiresApproval: true,
              status: 'available',
              summary: 'Brainstorming service ready',
              visibility: 'model_visible',
            },
            {
              access: 'mixed',
              configured: false,
              family: 'mcp',
              id: 'mcp.servers',
              label: 'MCP Servers',
              missingReason: 'Connected MCP tools are not exposed through the runtime tool gate.',
              requiredGate: 'runtime_entrypoint_coverage',
              requiresApproval: true,
              status: 'unconfigured',
              summary: 'Playwright MCP connected but hidden',
              visibility: 'hidden',
            },
          ],
        },
      }),
      task: { id: 'task_1', title: 'Launch task', state: 'running' },
      taskFiles: [{ path: 'Task.md', kind: 'file', contentPreview: '# Task' }],
    });
    const formatted = formatRuntimeContextManifestForStep(manifest);

    expect(formatted).toContain('capabilityRows=2');
    expect(formatted).toContain('capabilityAvailable=1');
    expect(formatted).toContain('capabilityModelVisible=1');
    expect(formatted).toContain('capabilityBlocked=1');
    expect(formatted).toContain('capability_allowance:skills:blocked');
    expect(formatted).toContain('capability_allowance:mcp_tools:blocked');
    expect(formatted).not.toContain('Brainstorming');
    expect(formatted).not.toContain('Playwright');
  });

  it('adds source freshness inclusion reasons to manifest source contexts', () => {
    const manifest = buildRuntimeContextManifest({
      now: '2026-05-15T00:00:00.000Z',
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
    expect(manifest.exclusionReasons).toEqual([
      {
        id: 'source_old',
        kind: 'source_context',
        label: '陈旧来源',
        reason: 'stale',
      },
    ]);
    expect(manifest.summary).toContain('exclusions=source_context:source_old:stale');
    expect(formatRuntimeContextManifestForStep(manifest)).toContain('exclusion_reasons:source_context/source_old/stale');
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

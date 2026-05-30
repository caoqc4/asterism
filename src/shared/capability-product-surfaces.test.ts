import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EXTERNAL_ACCESS_SOURCE_CATALOGUE_ITEMS,
  DEFAULT_MCP_SERVER_CATALOGUE_ITEMS,
  DEFAULT_SKILL_CATALOGUE_ITEMS,
  PRODUCT_RUNTIME_RULE_ITEMS,
  defaultMcpProductSurfaceStatus,
  defaultSkillsProductSurfaceStatus,
  mcpStatusForCapability,
  skillsStatusForCapability,
} from './capability-product-surfaces.js';

describe('capability product surfaces', () => {
  it('keeps Gmail as the first default optional External Access source', () => {
    expect(DEFAULT_EXTERNAL_ACCESS_SOURCE_CATALOGUE_ITEMS).toEqual([{
      id: 'gmail',
      kind: 'email',
      label: 'Gmail',
      desc: '系统默认可选邮箱授权；授权后只在任务需要时读取邮件元数据，并在入库前复核',
    }]);
  });

  it('keeps default Skills catalogue data in a shared product surface', () => {
    expect(DEFAULT_SKILL_CATALOGUE_ITEMS).toHaveLength(1);
    expect(DEFAULT_SKILL_CATALOGUE_ITEMS[0]).toMatchObject({
      id: 'brainstorming',
      name: 'Brainstorming',
      invokeId: 'brainstorming',
    });
    expect(defaultSkillsProductSurfaceStatus()).toEqual({
      enabledCount: 0,
      readyCount: 0,
      modelVisibleCount: 0,
      needsConfigCount: 0,
      catalogueCount: DEFAULT_SKILL_CATALOGUE_ITEMS.length,
    });
  });

  it('surfaces product runtime rules separately from optional skill catalogue entries', () => {
    expect(PRODUCT_RUNTIME_RULE_ITEMS).toHaveLength(9);
    expect(PRODUCT_RUNTIME_RULE_ITEMS[0]).toMatchObject({
      id: 'goalpilot.task_router',
      name: 'GoalPilot Business Advancement Router',
      path: 'docs/specs/goalpilot-task-advancement-framework.md',
    });
    expect(PRODUCT_RUNTIME_RULE_ITEMS.map((rule) => rule.id)).toEqual([
      'goalpilot.task_router',
      'agent.execution_rules',
      'agent.output_contract',
      'task.memory_rules',
      'pilot.decision_contract',
      'priority.attention_routing',
      'native.capability_mapping',
      'native.runtime_orchestration',
      'decision.writeback_orchestration',
    ]);
    expect(PRODUCT_RUNTIME_RULE_ITEMS[3]).toMatchObject({
      name: 'Business Memory Spec',
      path: 'docs/specs/task-memory-spec.md',
    });
    expect(PRODUCT_RUNTIME_RULE_ITEMS[3]?.desc).toContain('Business Records');
    expect(PRODUCT_RUNTIME_RULE_ITEMS[3]?.desc).toContain('BusinessLineContextPack');
    expect(PRODUCT_RUNTIME_RULE_ITEMS[6]).toMatchObject({
      name: 'Native Agent Capability Mapping',
      path: 'docs/specs/native-agent-capability-mapping.md',
    });
    expect(PRODUCT_RUNTIME_RULE_ITEMS[4]).toMatchObject({
      name: 'Pilot Decision Contract',
      path: 'docs/specs/pilot-decision-contract.md',
    });
    expect(PRODUCT_RUNTIME_RULE_ITEMS[4]?.desc).toContain('operation mode');
    expect(PRODUCT_RUNTIME_RULE_ITEMS[4]?.desc).toContain('backendPlan');
  });

  it('keeps default MCP catalogue data disconnected until a real service connects', () => {
    expect(DEFAULT_MCP_SERVER_CATALOGUE_ITEMS).toEqual([{
      id: 'playwright',
      name: 'Playwright MCP',
      command: 'npx @playwright/mcp@latest',
      transport: 'stdio',
    }]);
    expect(defaultMcpProductSurfaceStatus()).toEqual({
      connectedServerCount: 0,
      toolCount: 0,
      modelVisibleToolCount: 0,
      errorCount: 0,
      catalogueCount: DEFAULT_MCP_SERVER_CATALOGUE_ITEMS.length,
    });
  });

  it('projects live Skills service state separately from model-visible exposure', () => {
    expect(skillsStatusForCapability([
      { id: 'brainstorming', status: 'ready', modelVisible: false },
      { id: 'task-memory', status: 'ready', modelVisible: true },
      { id: 'internal-draft', status: 'enabled', modelVisible: false },
      { id: 'broken-skill', status: 'error', modelVisible: false },
    ])).toEqual({
      enabledCount: 3,
      readyCount: 2,
      modelVisibleCount: 1,
      needsConfigCount: 2,
      catalogueCount: DEFAULT_SKILL_CATALOGUE_ITEMS.length,
    });
  });

  it('projects live MCP service state separately from connected tool count', () => {
    expect(mcpStatusForCapability([
      { id: 'playwright', status: 'connected', toolCount: 4, modelVisibleToolCount: 0 },
      { id: 'docs', status: 'connected', toolCount: 2, modelVisibleToolCount: 1 },
      { id: 'broken', status: 'error', toolCount: 3, modelVisibleToolCount: 3 },
      { id: 'off', status: 'disconnected', toolCount: 5, modelVisibleToolCount: 5 },
    ])).toEqual({
      connectedServerCount: 2,
      toolCount: 6,
      modelVisibleToolCount: 1,
      errorCount: 1,
      catalogueCount: DEFAULT_MCP_SERVER_CATALOGUE_ITEMS.length,
    });
  });
});

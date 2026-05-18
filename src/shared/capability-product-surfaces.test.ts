import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EXTERNAL_ACCESS_SOURCE_CATALOGUE_ITEMS,
  DEFAULT_MCP_SERVER_CATALOGUE_ITEMS,
  DEFAULT_SKILL_CATALOGUE_ITEMS,
  defaultMcpProductSurfaceStatus,
  defaultSkillsProductSurfaceStatus,
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
    expect(DEFAULT_SKILL_CATALOGUE_ITEMS[0]).toMatchObject({
      id: 'brainstorming',
      name: 'Brainstorming',
      invokeId: 'brainstorming',
    });
    expect(defaultSkillsProductSurfaceStatus()).toEqual({
      enabledCount: 0,
      readyCount: DEFAULT_SKILL_CATALOGUE_ITEMS.length,
      needsConfigCount: 0,
    });
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
      errorCount: 0,
    });
  });
});

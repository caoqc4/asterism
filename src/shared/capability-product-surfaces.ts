import type { CapabilityProductSurfaceStatus } from './capability-registry.js';

export type SkillServiceItemStatus = 'disabled' | 'enabled' | 'ready' | 'error';

export type DefaultSkillCatalogueItem = {
  id: string;
  name: string;
  invokeId: string;
  desc: string;
};

export type SkillServiceItem = {
  id: string;
  status: SkillServiceItemStatus;
  modelVisible: boolean;
};

export type DefaultMcpServerCatalogueItem = {
  id: string;
  name: string;
  command: string;
  transport: 'stdio' | 'sse' | 'http';
};

export type McpServiceServerStatus = 'disconnected' | 'connected' | 'error';

export type McpServiceServer = {
  id: string;
  status: McpServiceServerStatus;
  toolCount: number;
  modelVisibleToolCount: number;
};

export type DefaultExternalAccessSourceCatalogueItem = {
  id: string;
  kind: 'email' | 'calendar' | 'github' | 'notion' | 'slack' | 'linear' | 'jira' | 'other';
  label: string;
  desc: string;
};

export const DEFAULT_EXTERNAL_ACCESS_SOURCE_CATALOGUE_ITEMS: DefaultExternalAccessSourceCatalogueItem[] = [
  {
    id: 'gmail',
    kind: 'email',
    label: 'Gmail',
    desc: '系统默认可选邮箱授权；授权后只在任务需要时读取邮件元数据，并在入库前复核',
  },
];

export const DEFAULT_SKILL_CATALOGUE_ITEMS: DefaultSkillCatalogueItem[] = [
  {
    id: 'brainstorming',
    name: 'Brainstorming',
    invokeId: 'brainstorming',
    desc: '在创建功能、组件或修改行为前，先帮助 AI 做意图澄清、方案比较和边界收束',
  },
];

export const DEFAULT_MCP_SERVER_CATALOGUE_ITEMS: DefaultMcpServerCatalogueItem[] = [
  {
    id: 'playwright',
    name: 'Playwright MCP',
    command: 'npx @playwright/mcp@latest',
    transport: 'stdio',
  },
];

export function defaultSkillsProductSurfaceStatus(): NonNullable<CapabilityProductSurfaceStatus['skills']> {
  return {
    enabledCount: 0,
    readyCount: 0,
    modelVisibleCount: 0,
    needsConfigCount: 0,
    catalogueCount: DEFAULT_SKILL_CATALOGUE_ITEMS.length,
  };
}

export function defaultMcpProductSurfaceStatus(): NonNullable<CapabilityProductSurfaceStatus['mcp']> {
  return {
    connectedServerCount: 0,
    toolCount: 0,
    modelVisibleToolCount: 0,
    errorCount: 0,
    catalogueCount: DEFAULT_MCP_SERVER_CATALOGUE_ITEMS.length,
  };
}

export function skillsStatusForCapability(
  skills: SkillServiceItem[],
): NonNullable<CapabilityProductSurfaceStatus['skills']> {
  return {
    enabledCount: skills.filter((skill) => skill.status === 'enabled' || skill.status === 'ready').length,
    readyCount: skills.filter((skill) => skill.status === 'ready').length,
    modelVisibleCount: skills.filter((skill) => skill.status === 'ready' && skill.modelVisible).length,
    needsConfigCount: skills.filter((skill) => skill.status === 'enabled' || skill.status === 'error').length,
    catalogueCount: DEFAULT_SKILL_CATALOGUE_ITEMS.length,
  };
}

export function mcpStatusForCapability(
  servers: McpServiceServer[],
): NonNullable<CapabilityProductSurfaceStatus['mcp']> {
  return {
    connectedServerCount: servers.filter((server) => server.status === 'connected').length,
    toolCount: servers
      .filter((server) => server.status === 'connected')
      .reduce((sum, server) => sum + Math.max(0, server.toolCount), 0),
    modelVisibleToolCount: servers
      .filter((server) => server.status === 'connected')
      .reduce((sum, server) => sum + Math.max(0, server.modelVisibleToolCount), 0),
    errorCount: servers.filter((server) => server.status === 'error').length,
    catalogueCount: DEFAULT_MCP_SERVER_CATALOGUE_ITEMS.length,
  };
}

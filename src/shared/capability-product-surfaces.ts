import type { CapabilityProductSurfaceStatus } from './capability-registry.js';

export type DefaultSkillCatalogueItem = {
  id: string;
  name: string;
  invokeId: string;
  desc: string;
};

export type DefaultMcpServerCatalogueItem = {
  id: string;
  name: string;
  command: string;
  transport: 'stdio' | 'sse' | 'http';
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
  {
    id: 'web_search',
    name: 'Web Search',
    invokeId: 'web_search',
    desc: '实时搜索互联网，获取最新信息和资料',
  },
  {
    id: 'code_runner',
    name: 'Code Runner',
    invokeId: 'code_runner',
    desc: '在沙盒环境中执行 Python / Node.js 代码',
  },
  {
    id: 'browser',
    name: 'Browser',
    invokeId: 'browser',
    desc: '控制浏览器访问网页、截图、抓取内容',
  },
  {
    id: 'file_read',
    name: 'File Read',
    invokeId: 'file_read',
    desc: '读取工作区文件内容，辅助 AI 理解上下文',
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
    readyCount: DEFAULT_SKILL_CATALOGUE_ITEMS.length,
    needsConfigCount: 0,
  };
}

export function defaultMcpProductSurfaceStatus(): NonNullable<CapabilityProductSurfaceStatus['mcp']> {
  return {
    connectedServerCount: 0,
    toolCount: 0,
    errorCount: 0,
  };
}

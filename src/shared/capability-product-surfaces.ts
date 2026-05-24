import type { CapabilityProductSurfaceStatus } from './capability-registry.js';

export type SkillServiceItemStatus = 'disabled' | 'enabled' | 'ready' | 'error';

export type DefaultSkillCatalogueItem = {
  id: string;
  name: string;
  invokeId: string;
  desc: string;
};

export type ProductRuntimeRuleItem = {
  id: string;
  name: string;
  invokeId: string;
  desc: string;
  layer: string;
  load: string;
  enforcement: string;
  path: string;
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

export const PRODUCT_RUNTIME_RULE_ITEMS: ProductRuntimeRuleItem[] = [
  {
    id: 'goalpilot.task_router',
    name: 'GoalPilot Task Router',
    invokeId: 'goalpilot.task_router',
    desc: '任务推进总则：判断目标、阶段、下一步、上下文清洁度，并索引需要按需加载的规则或工具。',
    layer: 'Always-loaded router',
    load: '每次 Taskplane 控制的 Agent runtime 上下文都会加载',
    enforcement: 'Prompt rule + product routing gates',
    path: 'docs/specs/goalpilot-task-advancement-framework.md',
  },
  {
    id: 'agent.execution_rules',
    name: 'Agent Operating Principles',
    invokeId: 'agent.execution_rules',
    desc: '具体执行阶段规则：任务创建、执行、子任务、工具使用、状态变更、完成声明和验收边界。',
    layer: 'Phase-loaded skill',
    load: '进入具体执行、子任务、工具、写入或完成判断时加载',
    enforcement: 'Prompt rule + runtime entrypoint gates',
    path: 'docs/specs/agent-operating-principles.md',
  },
  {
    id: 'agent.output_contract',
    name: 'Agent Output Contract',
    invokeId: 'agent.output_contract',
    desc: '用户可见输出规则：聊天、进度卡片、草案、提案、执行摘要、文件输出和验证结果如何呈现。',
    layer: 'Phase-loaded skill',
    load: '需要渲染用户可见输出或产品结构化输出时加载',
    enforcement: 'Prompt rule + output projection tests',
    path: 'docs/specs/agent-output-contract.md',
  },
  {
    id: 'task.memory_rules',
    name: 'Task Memory Spec',
    invokeId: 'task.memory_rules',
    desc: '任务记忆规则：Task.md、Task Records、Source Context、上下文清理和恢复信息如何读写。',
    layer: 'Phase-loaded skill',
    load: '读取、写入、清理、切换或评估任务记忆时加载',
    enforcement: 'Prompt rule + write-intent and memory gates',
    path: 'docs/specs/task-memory-spec.md',
  },
  {
    id: 'native.runtime_orchestration',
    name: 'Native Runtime Orchestration',
    invokeId: 'native.runtime_orchestration',
    desc: '原生 CLI / API runtime 架构规则：Taskplane 控制层、runtime 执行层、决策层和 Write Intent 边界。',
    layer: 'Architecture spec',
    load: '修改 CLI/API adapter、决策层、Write Intent、进度投影或 runtime 边界时加载',
    enforcement: 'Architecture rule + service tests',
    path: 'docs/specs/native-agent-runtime-orchestration.md',
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

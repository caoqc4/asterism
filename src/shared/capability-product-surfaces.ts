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
    desc: '任务记忆规则：Task.md、Task Records、Source Context、上下文刷新和恢复信息如何读写。',
    layer: 'Phase-loaded skill',
    load: '读取、写入、刷新、切换或评估任务记忆时加载',
    enforcement: 'Prompt rule + write-intent and memory gates',
    path: 'docs/specs/task-memory-spec.md',
  },
  {
    id: 'pilot.decision_contract',
    name: 'Pilot Decision Contract',
    invokeId: 'pilot.decision_contract',
    desc: 'Pilot 决策契约：把 GoalPilot 推进判断和优先级排序落成 operation mode、消息优先级、DecisionBackend、执行器、升级和 gate。',
    layer: 'Phase-loaded architecture skill',
    load: '设计、审查或执行 Pilot 判断、steer/follow-up/escalate、executor routing 或多任务协调时加载',
    enforcement: 'PilotDecision contract + routing tests',
    path: 'docs/specs/pilot-decision-contract.md',
  },
  {
    id: 'priority.attention_routing',
    name: 'Priority Attention Routing',
    invokeId: 'priority.attention_routing',
    desc: '多任务注意力排序规则：复用 Brief 优先级语义，决定当前最该处理的任务、阻塞、拍板、复核或清晰度缺口。',
    layer: 'Phase-loaded skill',
    load: 'Brief、Pilot 或多任务队列需要选择焦点任务、解释排序或升级时加载',
    enforcement: 'Priority lane evaluator + Brief/Pilot tests',
    path: 'docs/specs/priority-attention-routing.md',
  },
  {
    id: 'native.capability_mapping',
    name: 'Native Agent Capability Mapping',
    invokeId: 'native.capability_mapping',
    desc: '原生 agent 能力映射：把 Codex/Claude 的 plan、goal、memory、compact、skills、hooks、subagents、status 和 review 对齐到 Taskplane 产品状态。',
    layer: 'Architecture skill',
    load: '设计 runtime 能力、上下文就绪、plan/goal/memory/context 映射或 CLI adapter 行为时加载',
    enforcement: 'Architecture rule + capability/status tests',
    path: 'docs/specs/native-agent-capability-mapping.md',
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
  {
    id: 'decision.writeback_orchestration',
    name: 'Decision Writeback Orchestration',
    invokeId: 'decision.writeback_orchestration',
    desc: '中间决策层规则：用 decision skills、hooks/gates 和 Write Intent 把 runtime 证据闭环到产品数据。',
    layer: 'Architecture skill',
    load: '解释 runtime 结果、写回记忆、生成提案、审查产品功能影响面时加载',
    enforcement: 'Decision skills + deterministic hooks/gates',
    path: 'docs/specs/decision-layer-writeback-orchestration.md',
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

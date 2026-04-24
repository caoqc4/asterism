import type {
  AgentPolicy,
  AgentToolName,
  AgentToolResult,
  AgentToolRisk,
  AgentWorkingContext,
} from '../../../shared/types/agent-execution.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import type { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';

export type AgentToolDefinition = {
  name: AgentToolName;
  description: string;
  risk: AgentToolRisk;
  requiresConfirmation: boolean;
};

type ToolExecutionContext = {
  runId: string;
  taskId: string;
  workingContext?: AgentWorkingContext;
};

type ArtifactCreateNoteInput = {
  title: string;
  content: string;
};

function parseArtifactCreateNoteInput(input: unknown): ArtifactCreateNoteInput {
  if (!input || typeof input !== 'object') {
    throw new Error('artifact.create_note requires an object input.');
  }

  const candidate = input as Partial<ArtifactCreateNoteInput>;
  const title = candidate.title?.trim();
  const content = candidate.content?.trim();

  if (!title) {
    throw new Error('artifact.create_note requires a title.');
  }

  if (!content) {
    throw new Error('artifact.create_note requires content.');
  }

  return { title, content };
}

function buildConfirmationDecisionTitle(name: AgentToolName, risk: AgentToolRisk): string {
  const riskLabel: Record<AgentToolRisk, string> = {
    safe_read: '安全读取',
    local_write: '本地写入',
    external_read: '外部读取',
    external_write: '外部写入',
    sensitive: '敏感操作',
  };

  return `确认${riskLabel[risk]}：${name}`;
}

function formatWorkingContextSummary(context: AgentWorkingContext): string {
  return [
    `任务：${context.task.title}`,
    `状态：${context.task.state}`,
    `下一步：${context.task.nextStep ?? '暂无'}`,
    `优先级语义：${context.priorityLane}`,
    `恢复摘要：${context.resumeSummary}`,
    `完成标准：${context.completion.satisfied}/${context.completion.total}`,
    context.completion.nextOpenCriterion
      ? `下一条未完成标准：${context.completion.nextOpenCriterion}`
      : '下一条未完成标准：暂无',
    `阻塞项：${context.blockers.map((item) => item.title).join('；') || '无'}`,
    `依赖项：${context.dependencies.map((item) => item.title).join('；') || '无'}`,
    `关键来源：${context.sources.filter((item) => item.isKey).map((item) => item.title).join('；') || '无'}`,
    `方法模板：${context.processTemplates.map((item) => item.title).join('；') || '无'}`,
  ].join('\n');
}

export class AgentToolRegistry {
  private readonly definitions: AgentToolDefinition[] = [
    {
      name: 'task.inspect_context',
      description: 'Inspect the current Taskplane working context snapshot for this run.',
      risk: 'safe_read',
      requiresConfirmation: false,
    },
    {
      name: 'artifact.create_note',
      description: 'Create a local note artifact attached to the current Taskplane run.',
      risk: 'local_write',
      requiresConfirmation: false,
    },
  ];

  constructor(
    private readonly artifactRepository: ArtifactRepository,
    private readonly runStepRepository: RunStepRepository,
    private readonly runCheckpointRepository: RunCheckpointRepository = new RunCheckpointRepository(),
    private readonly decisionRepository: Pick<DecisionRepository, 'create'> | null = null,
  ) {}

  list(): AgentToolDefinition[] {
    return this.definitions;
  }

  async execute(
    name: AgentToolName,
    input: unknown,
    context: ToolExecutionContext,
    policy?: AgentPolicy,
  ): Promise<AgentToolResult> {
    const definition = this.definitions.find((item) => item.name === name);

    if (!definition) {
      throw new Error(`Unknown agent tool: ${name}`);
    }

    const callStep = await this.runStepRepository.create({
      runId: context.runId,
      kind: 'tool_call',
      status: 'running',
      title: `调用工具：${name}`,
      input: JSON.stringify(input),
    });

    try {
      if (policy?.confirmationRequiredRisks.includes(definition.risk)) {
        const decisionTitle = buildConfirmationDecisionTitle(name, definition.risk);
        const checkpoint = await this.runCheckpointRepository.create({
          runId: context.runId,
          stepId: callStep.id,
          kind: 'tool_permission',
          payload: JSON.stringify({
            tool: name,
            risk: definition.risk,
            input,
            decisionId: null,
            decisionTitle,
          }),
        });
        const decision = this.decisionRepository
          ? await this.decisionRepository.create({
              taskId: context.taskId,
              title: decisionTitle,
              sourceType: 'agent_checkpoint',
              sourceId: checkpoint.id,
              sourceLabel: name,
            })
          : null;
        const payload = JSON.stringify({
          tool: name,
          risk: definition.risk,
          input,
          decisionId: decision?.id ?? null,
          decisionTitle,
        });
        const checkpointWithDecision = decision
          ? await this.runCheckpointRepository.updatePayload(checkpoint.id, payload)
          : checkpoint;
        const summary = decision
          ? `工具 ${name} 需要确认后才能继续，已创建 Decision：${decision.title}。`
          : `工具 ${name} 需要确认后才能继续。`;

        await this.runStepRepository.update(callStep.id, {
          status: 'skipped',
          output: summary,
        });
        await this.runStepRepository.create({
          runId: context.runId,
          kind: 'checkpoint',
          status: 'pending',
          title: `等待确认：${name}`,
          output: summary,
        });

        return {
          success: false,
          status: 'needs_confirmation',
          summary,
          checkpointId: checkpointWithDecision.id,
        };
      }

      const result = await this.executeKnownTool(name, input, context);
      await this.runStepRepository.update(callStep.id, {
        status: 'completed',
        output: result.summary,
      });
      await this.runStepRepository.create({
        runId: context.runId,
        kind: 'tool_result',
        status: 'completed',
        title: `工具结果：${name}`,
        output: result.output ?? result.summary,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown agent tool error';
      await this.runStepRepository.update(callStep.id, {
        status: 'failed',
        error: message,
      });
      await this.runStepRepository.create({
        runId: context.runId,
        kind: 'tool_result',
        status: 'failed',
        title: `工具失败：${name}`,
        error: message,
      });
      return {
        success: false,
        summary: `工具 ${name} 执行失败：${message}`,
        error: message,
      };
    }
  }

  private async executeKnownTool(
    name: AgentToolName,
    input: unknown,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (name) {
      case 'task.inspect_context': {
        if (!context.workingContext) {
          throw new Error('task.inspect_context requires a working context.');
        }

        const output = formatWorkingContextSummary(context.workingContext);

        return {
          success: true,
          status: 'completed',
          summary: '已读取当前任务上下文摘要。',
          output,
        };
      }
      case 'artifact.create_note': {
        const parsed = parseArtifactCreateNoteInput(input);
        const artifact = await this.artifactRepository.createNoteFromRun({
          taskId: context.taskId,
          runId: context.runId,
          title: parsed.title,
          content: parsed.content,
        });

        return {
          success: true,
          summary: `已创建本地 note 产物：${artifact.title}`,
          output: artifact.content,
          artifactId: artifact.id,
        };
      }
      default:
        throw new Error(`Unknown agent tool: ${name}`);
    }
  }
}

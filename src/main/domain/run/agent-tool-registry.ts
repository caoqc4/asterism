import type {
  AgentToolName,
  AgentToolResult,
  AgentToolRisk,
} from '../../../shared/types/agent-execution.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
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

export class AgentToolRegistry {
  private readonly definitions: AgentToolDefinition[] = [
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
  ) {}

  list(): AgentToolDefinition[] {
    return this.definitions;
  }

  async execute(
    name: AgentToolName,
    input: unknown,
    context: ToolExecutionContext,
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

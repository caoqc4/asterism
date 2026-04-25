import type {
  AgentToolName,
  AgentToolRisk,
} from '../../../shared/types/agent-execution.js';
import type { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { createToolPermissionCheckpointPayload } from '../../../shared/types/run-checkpoint-payload.js';

export type AgentToolPermissionCheckpointResult = {
  checkpointId: string;
  decisionId: string | null;
  summary: string;
};

export class AgentCheckpointRecorder {
  constructor(
    private readonly runCheckpointRepository: RunCheckpointRepository,
    private readonly runStepRepository: RunStepRepository,
    private readonly decisionRepository: Pick<DecisionRepository, 'create'> | null = null,
  ) {}

  async createToolPermissionCheckpoint(params: {
    runId: string;
    taskId: string;
    stepId: string;
    tool: AgentToolName;
    risk: AgentToolRisk;
    input: unknown;
    decisionTitle: string;
    preview?: string | null;
  }): Promise<AgentToolPermissionCheckpointResult> {
    const checkpoint = await this.runCheckpointRepository.create({
      runId: params.runId,
      stepId: params.stepId,
      kind: 'tool_permission',
      payload: JSON.stringify(createToolPermissionCheckpointPayload({
        tool: params.tool,
        risk: params.risk,
        input: params.input,
        decisionId: null,
        decisionTitle: params.decisionTitle,
      })),
    });
    const decision = this.decisionRepository
      ? await this.decisionRepository.create({
          taskId: params.taskId,
          title: params.decisionTitle,
          sourceType: 'agent_checkpoint',
          sourceId: checkpoint.id,
          sourceLabel: params.tool,
        })
      : null;
    const checkpointWithDecision = decision
      ? await this.runCheckpointRepository.updatePayload(
          checkpoint.id,
          JSON.stringify(createToolPermissionCheckpointPayload({
            tool: params.tool,
            risk: params.risk,
            input: params.input,
            decisionId: decision.id,
            decisionTitle: params.decisionTitle,
          })),
        )
      : checkpoint;
    const summary = decision
      ? `工具 ${params.tool} 需要确认后才能继续，已创建 Decision：${decision.title}。`
      : `工具 ${params.tool} 需要确认后才能继续。`;

    await this.runStepRepository.update(params.stepId, {
      status: 'skipped',
      output: summary,
    });
    await this.runStepRepository.create({
      runId: params.runId,
      kind: 'checkpoint',
      status: 'pending',
      title: `等待确认：${params.tool}`,
      input: params.preview ?? null,
      output: summary,
    });

    return {
      checkpointId: checkpointWithDecision.id,
      decisionId: decision?.id ?? null,
      summary,
    };
  }
}

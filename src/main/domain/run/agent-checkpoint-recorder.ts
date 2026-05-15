import type {
  AgentPolicy,
  AgentSessionEvent,
  AgentToolName,
  AgentToolRisk,
} from '../../../shared/types/agent-execution.js';
import type { AgentToolExecutionPolicy } from '../../../shared/agent-tool-scaffold.js';
import { classifyRuntimeActionEvent } from '../../../shared/runtime-surface-routing.js';
import type { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import type { SandboxPatchPromotionRepository } from '../../db/repositories/sandbox-patch-promotion-repository.js';
import {
  createPatchPromotionCheckpointPayload,
  createResumeCheckpointPayload,
  createToolPermissionCheckpointPayload,
} from '../../../shared/types/run-checkpoint-payload.js';

export type AgentToolPermissionCheckpointResult = {
  checkpointId: string;
  decisionId: string | null;
  event: Extract<AgentSessionEvent, { type: 'checkpoint.created' }>;
  summary: string;
};

export type AgentResumeCheckpointResult = {
  checkpointId: string;
  event: Extract<AgentSessionEvent, { type: 'checkpoint.created' }>;
};

export type AgentPatchPromotionCheckpointResult = {
  checkpointId: string;
  decisionId: string | null;
  event: Extract<AgentSessionEvent, { type: 'checkpoint.created' }>;
  summary: string;
};

export class AgentCheckpointRecorder {
  constructor(
    private readonly runCheckpointRepository: RunCheckpointRepository,
    private readonly runStepRepository: RunStepRepository,
    private readonly decisionRepository: Pick<DecisionRepository, 'create'> | null = null,
    private readonly sandboxPatchPromotionRepository: Pick<SandboxPatchPromotionRepository, 'createPending'> | null = null,
  ) {}

  async createToolPermissionCheckpoint(params: {
    runId: string;
    taskId: string;
    agentSessionId?: string | null;
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
        ...(params.agentSessionId ? { agentSessionId: params.agentSessionId } : {}),
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
            ...(params.agentSessionId ? { agentSessionId: params.agentSessionId } : {}),
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
      kind: classifyRuntimeActionEvent({
        kind: 'checkpoint_created',
        checkpointKind: 'tool_permission',
        operation: params.tool,
        text: summary,
        risk: params.risk === 'external_write'
          ? 'external_write'
          : params.risk === 'local_write' || params.risk === 'local_command' || params.risk === 'sensitive'
            ? 'local_write'
            : 'none',
        requiresConfirmation: true,
      }).runStepKind,
      status: 'pending',
      title: `等待确认：${params.tool}`,
      input: params.preview ?? null,
      output: summary,
    });

    const event: Extract<AgentSessionEvent, { type: 'checkpoint.created' }> = {
      type: 'checkpoint.created',
      runId: params.runId,
      checkpointId: checkpointWithDecision.id,
      checkpointKind: 'tool_permission',
      reason: summary,
      decisionId: decision?.id ?? null,
      tool: params.tool,
    };

    return {
      checkpointId: checkpointWithDecision.id,
      decisionId: decision?.id ?? null,
      event,
      summary,
    };
  }

  async createResumeCheckpoint(params: {
    runId: string;
    taskId: string;
    agentSessionId?: string | null;
    reason: string;
    nextTool: AgentToolName;
    nextInput: unknown;
    policySnapshot: AgentPolicy;
    observations?: unknown;
  }): Promise<AgentResumeCheckpointResult> {
    const step = await this.runStepRepository.create({
      runId: params.runId,
      kind: classifyRuntimeActionEvent({
        kind: 'checkpoint_created',
        checkpointKind: 'resume',
        operation: params.nextTool,
        text: params.reason,
        requiresConfirmation: true,
      }).runStepKind,
      status: 'pending',
      title: '等待恢复 agent run',
      input: JSON.stringify({
        reason: params.reason,
        nextTool: params.nextTool,
        nextInput: params.nextInput,
      }),
      output: params.reason,
    });
    const checkpoint = await this.runCheckpointRepository.create({
      runId: params.runId,
      stepId: step.id,
      kind: 'resume',
      payload: JSON.stringify(createResumeCheckpointPayload({
        reason: params.reason,
        runId: params.runId,
        ...(params.agentSessionId ? { agentSessionId: params.agentSessionId } : {}),
        nextTool: params.nextTool,
        nextInput: params.nextInput,
        policySnapshot: params.policySnapshot,
        observations: params.observations,
        taskId: params.taskId,
      })),
    });

    const event: Extract<AgentSessionEvent, { type: 'checkpoint.created' }> = {
      type: 'checkpoint.created',
      runId: params.runId,
      checkpointId: checkpoint.id,
      checkpointKind: 'resume',
      reason: params.reason,
      tool: params.nextTool,
    };

    return {
      checkpointId: checkpoint.id,
      event,
    };
  }

  async createPatchPromotionCheckpoint(params: {
    runId: string;
    taskId: string;
    artifactId: string;
    artifactSummary: string;
    expectedFiles?: string[];
    patchDigest?: string | null;
    sessionId: string;
    policySnapshot: AgentToolExecutionPolicy;
    decisionTitle: string;
    preview?: string | null;
  }): Promise<AgentPatchPromotionCheckpointResult> {
    const step = await this.runStepRepository.create({
      runId: params.runId,
      kind: classifyRuntimeActionEvent({
        kind: 'checkpoint_created',
        checkpointKind: 'patch_promotion',
        operation: 'workspace.staged_patch',
        text: params.decisionTitle,
        risk: 'local_write',
        requiresConfirmation: true,
      }).runStepKind,
      status: 'pending',
      title: '等待确认：sandbox patch promotion',
      input: params.preview ?? params.artifactSummary,
      output: `等待确认是否将 sandbox patch 提升到工作区：${params.artifactSummary}`,
    });
    const checkpoint = await this.runCheckpointRepository.create({
      runId: params.runId,
      stepId: step.id,
      kind: 'patch_promotion',
      payload: JSON.stringify(createPatchPromotionCheckpointPayload({
        artifactId: params.artifactId,
        artifactSummary: params.artifactSummary,
        sessionId: params.sessionId,
        descriptorId: 'workspace.staged_patch',
        decisionId: null,
        decisionTitle: params.decisionTitle,
        ...(params.expectedFiles?.length ? { expectedFiles: params.expectedFiles } : {}),
        ...(params.patchDigest ? { patchDigest: params.patchDigest } : {}),
        policySnapshot: params.policySnapshot,
        preview: params.preview ?? null,
      })),
    });
    const decision = this.decisionRepository
      ? await this.decisionRepository.create({
          taskId: params.taskId,
          title: params.decisionTitle,
          sourceType: 'agent_checkpoint',
          sourceId: checkpoint.id,
          sourceLabel: 'workspace.staged_patch',
        })
      : null;
    const checkpointWithDecision = decision
      ? await this.runCheckpointRepository.updatePayload(
          checkpoint.id,
          JSON.stringify(createPatchPromotionCheckpointPayload({
            artifactId: params.artifactId,
            artifactSummary: params.artifactSummary,
            sessionId: params.sessionId,
            descriptorId: 'workspace.staged_patch',
            decisionId: decision.id,
            decisionTitle: params.decisionTitle,
            ...(params.expectedFiles?.length ? { expectedFiles: params.expectedFiles } : {}),
            ...(params.patchDigest ? { patchDigest: params.patchDigest } : {}),
            policySnapshot: params.policySnapshot,
            preview: params.preview ?? null,
          })),
        )
      : checkpoint;
    if (
      decision
      && this.sandboxPatchPromotionRepository
      && params.expectedFiles?.length
      && params.patchDigest
    ) {
      await this.sandboxPatchPromotionRepository.createPending({
        artifactId: params.artifactId,
        auditSummary: params.artifactSummary,
        checkpointId: checkpointWithDecision.id,
        decisionId: decision.id,
        expectedFiles: params.expectedFiles,
        patchDigest: params.patchDigest,
        runId: params.runId,
        sourceId: params.sessionId,
        taskId: params.taskId,
      });
    }
    const summary = decision
      ? `Sandbox patch promotion 需要确认后才能继续，已创建 Decision：${decision.title}。`
      : 'Sandbox patch promotion 需要确认后才能继续。';

    const event: Extract<AgentSessionEvent, { type: 'checkpoint.created' }> = {
      type: 'checkpoint.created',
      runId: params.runId,
      checkpointId: checkpointWithDecision.id,
      checkpointKind: 'patch_promotion',
      reason: summary,
      decisionId: decision?.id ?? null,
      tool: null,
    };

    return {
      checkpointId: checkpointWithDecision.id,
      decisionId: decision?.id ?? null,
      event,
      summary,
    };
  }
}

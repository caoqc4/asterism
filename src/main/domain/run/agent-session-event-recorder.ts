import type { AgentSessionEvent } from '../../../shared/types/agent-execution.js';
import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { projectAgentRuntimeEventSessionStatus } from '../../../shared/agent-runtime-events.js';
import {
  mapAgentRuntimeEventToRunStep,
  type AgentRuntimeRunStepDraft,
} from './agent-runtime-event-step-mapper.js';

type RecordableAgentSessionEvent = Extract<
  AgentSessionEvent,
  | { type: 'session.started' }
  | { type: 'plan.proposed' }
  | { type: 'tool.started' }
  | { type: 'tool.completed' }
  | { type: 'tool.failed' }
  | { type: 'checkpoint.created' }
  | { type: 'session.heartbeat' }
  | { type: 'session.paused' }
  | { type: 'session.completed' }
  | { type: 'session.failed' }
  | { type: 'session.interrupted' }
  | { type: 'session.cancelled' }
>;

function isRecordableEvent(event: AgentSessionEvent): event is RecordableAgentSessionEvent {
  return (
    event.type === 'session.started' ||
    event.type === 'plan.proposed' ||
    event.type === 'tool.started' ||
    event.type === 'tool.completed' ||
    event.type === 'tool.failed' ||
    event.type === 'checkpoint.created' ||
    event.type === 'session.heartbeat' ||
    event.type === 'session.paused' ||
    event.type === 'session.completed' ||
    event.type === 'session.failed' ||
    event.type === 'session.interrupted' ||
    event.type === 'session.cancelled'
  );
}

function isTerminalEvent(event: AgentSessionEvent): boolean {
  return (
    event.type === 'session.paused' ||
    event.type === 'session.completed' ||
    event.type === 'session.failed' ||
    event.type === 'session.interrupted' ||
    event.type === 'session.cancelled'
  );
}

function titleOverrides(event: RecordableAgentSessionEvent): Partial<Omit<AgentRuntimeRunStepDraft, 'runId'>> {
  switch (event.type) {
    case 'session.started':
      return {
        title: '开始 Agent session',
      };
    case 'plan.proposed':
      return {
        title: event.source === 'fallback'
          ? '采用保守 fallback agent 步骤计划'
          : '采用模型提出的 agent 步骤计划',
      };
    case 'tool.started':
      return {
        title: `Agent 工具开始：${event.tool}`,
      };
    case 'tool.completed':
      return {
        title: `Agent 工具完成：${event.tool}`,
      };
    case 'tool.failed':
      return {
        title: `Agent 工具失败：${event.tool}`,
      };
    case 'checkpoint.created':
      return {
        title: `创建 Agent checkpoint：${event.checkpointKind}`,
      };
    case 'session.heartbeat':
      return {
        title: 'Agent session 心跳',
      };
    case 'session.paused':
      return {
        title: 'Agent session 已暂停',
      };
    case 'session.completed':
      return {
        title: '完成 Agent session',
      };
    case 'session.failed':
      return {
        title: 'Agent session 执行失败',
      };
    case 'session.interrupted':
      return {
        title: 'Agent session 已中断',
      };
    case 'session.cancelled':
      return {
        title: 'Agent session 已取消',
      };
  }
}

export class AgentSessionEventRecorder {
  private terminalEventRecorded = false;
  private terminalSessionStatus: AgentSessionRecord['status'] | null = null;
  private readonly pendingToolStepIds = new Map<string, string[]>();

  constructor(private readonly runStepRepository: RunStepRepository) {}

  hasTerminalEvent(): boolean {
    return this.terminalEventRecorded;
  }

  getTerminalSessionStatus(): AgentSessionRecord['status'] | null {
    return this.terminalSessionStatus;
  }

  async record(event: AgentSessionEvent): Promise<RunStepRecord | null> {
    const projectedStatus = projectAgentRuntimeEventSessionStatus(event);
    if (isTerminalEvent(event)) {
      this.terminalEventRecorded = true;
      this.terminalSessionStatus = projectedStatus;
    }

    if (!isRecordableEvent(event)) {
      return null;
    }

    const draft = mapAgentRuntimeEventToRunStep(event);

    if (event.type === 'tool.completed' || event.type === 'tool.failed') {
      await this.finishPendingToolStep(event);
    }

    const record = await this.runStepRepository.create({
      ...draft,
      ...titleOverrides(event),
      runId: draft.runId,
    });

    if (event.type === 'tool.started') {
      const key = pendingToolKey(event.runId, event.tool);
      this.pendingToolStepIds.set(key, [
        ...(this.pendingToolStepIds.get(key) ?? []),
        record.id,
      ]);
    }

    return record;
  }

  private async finishPendingToolStep(
    event: Extract<AgentSessionEvent, { type: 'tool.completed' | 'tool.failed' }>,
  ): Promise<void> {
    const key = pendingToolKey(event.runId, event.tool);
    const pending = this.pendingToolStepIds.get(key);
    const stepId = pending?.shift();

    if (!pending?.length) {
      this.pendingToolStepIds.delete(key);
    }

    if (!stepId) {
      return;
    }

    if (event.type === 'tool.completed') {
      await this.runStepRepository.update(stepId, {
        status: 'completed',
        output: event.result.output ?? event.result.summary,
      });
      return;
    }

    await this.runStepRepository.update(stepId, {
      status: 'failed',
      output: event.result?.output ?? event.result?.summary ?? null,
      error: event.error,
    });
  }
}

function pendingToolKey(runId: string, tool: string): string {
  return `${runId}:${tool}`;
}

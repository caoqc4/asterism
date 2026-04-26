import type { AgentSessionEvent } from '../../../shared/types/agent-execution.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import {
  mapAgentRuntimeEventToRunStep,
  type AgentRuntimeRunStepDraft,
} from './agent-runtime-event-step-mapper.js';

type RecordableAgentSessionEvent = Extract<
  AgentSessionEvent,
  | { type: 'session.started' }
  | { type: 'plan.proposed' }
  | { type: 'tool.completed' }
  | { type: 'tool.failed' }
  | { type: 'checkpoint.created' }
  | { type: 'session.paused' }
  | { type: 'session.completed' }
  | { type: 'session.failed' }
>;

function isRecordableEvent(event: AgentSessionEvent): event is RecordableAgentSessionEvent {
  return (
    event.type === 'session.started' ||
    event.type === 'plan.proposed' ||
    event.type === 'tool.completed' ||
    event.type === 'tool.failed' ||
    event.type === 'checkpoint.created' ||
    event.type === 'session.paused' ||
    event.type === 'session.completed' ||
    event.type === 'session.failed'
  );
}

function isTerminalEvent(event: AgentSessionEvent): boolean {
  return (
    event.type === 'session.paused' ||
    event.type === 'session.completed' ||
    event.type === 'session.failed'
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
  }
}

export class AgentSessionEventRecorder {
  private terminalEventRecorded = false;

  constructor(private readonly runStepRepository: RunStepRepository) {}

  hasTerminalEvent(): boolean {
    return this.terminalEventRecorded;
  }

  async record(event: AgentSessionEvent): Promise<RunStepRecord | null> {
    if (isTerminalEvent(event)) {
      this.terminalEventRecorded = true;
    }

    if (!isRecordableEvent(event)) {
      return null;
    }

    const draft = mapAgentRuntimeEventToRunStep(event);

    return this.runStepRepository.create({
      ...draft,
      ...titleOverrides(event),
      runId: draft.runId,
    });
  }
}

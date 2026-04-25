import type { AgentToolName, AgentToolRisk } from './agent-execution.js';

export const RUN_CHECKPOINT_PAYLOAD_VERSION = 1;

export type ToolPermissionCheckpointPayloadV1 = {
  version: 1;
  kind: 'tool_permission';
  tool: AgentToolName;
  risk: AgentToolRisk;
  input: unknown;
  decisionId: string | null;
  decisionTitle: string;
};

export type ResumeCheckpointPayloadV1 = {
  version: 1;
  kind: 'resume';
  reason: string;
  nextTool: AgentToolName;
  nextInput: unknown;
  observations?: unknown;
  taskId?: string;
};

export type RunCheckpointPayloadV1 =
  | ToolPermissionCheckpointPayloadV1
  | ResumeCheckpointPayloadV1;

export type ParsedRunCheckpointPayload = Record<string, unknown> & {
  version?: unknown;
  kind?: unknown;
  tool?: unknown;
  nextTool?: unknown;
  risk?: unknown;
  reason?: unknown;
  decisionId?: unknown;
  decisionTitle?: unknown;
  input?: unknown;
  nextInput?: unknown;
};

export function createToolPermissionCheckpointPayload(
  input: Omit<ToolPermissionCheckpointPayloadV1, 'version' | 'kind'>,
): ToolPermissionCheckpointPayloadV1 {
  return {
    version: RUN_CHECKPOINT_PAYLOAD_VERSION,
    kind: 'tool_permission',
    ...input,
  };
}

export function createResumeCheckpointPayload(
  input: Omit<ResumeCheckpointPayloadV1, 'version' | 'kind'>,
): ResumeCheckpointPayloadV1 {
  return {
    version: RUN_CHECKPOINT_PAYLOAD_VERSION,
    kind: 'resume',
    ...input,
  };
}

export function parseRunCheckpointPayload(payload: string | null | undefined): ParsedRunCheckpointPayload | null {
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed as ParsedRunCheckpointPayload;
  } catch {
    return null;
  }
}

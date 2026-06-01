import type { AgentPolicy, AgentToolName, AgentToolRisk } from './agent-execution.js';
import type { AgentToolExecutionPolicy } from '../agent-tool-scaffold.js';
import { isAgentToolName } from '../agent-tools.js';

export const RUN_CHECKPOINT_PAYLOAD_VERSION = 1;

export type ToolPermissionCheckpointPayloadV1 = {
  version: 1;
  kind: 'tool_permission';
  agentSessionId?: string;
  tool: AgentToolName;
  risk: AgentToolRisk;
  input: unknown;
  decisionId: string | null;
  decisionTitle: string;
};

export type ResumeCheckpointPayloadV1 = {
  version: 1;
  kind: 'resume';
  runId: string;
  agentSessionId?: string;
  reason: string;
  nextTool: AgentToolName;
  nextInput: unknown;
  policySnapshot: AgentPolicy;
  observations?: unknown;
  taskId?: string;
};

export type PatchPromotionCheckpointPayloadV1 = {
  version: 1;
  kind: 'patch_promotion';
  artifactId: string;
  artifactSummary: string;
  sessionId: string;
  descriptorId: 'workspace.staged_patch';
  decisionId: string | null;
  decisionTitle: string;
  expectedFiles?: string[];
  patchDigest?: string;
  policySnapshot: AgentToolExecutionPolicy;
  preview?: string | null;
};

export type RunCheckpointPayloadV1 =
  | ToolPermissionCheckpointPayloadV1
  | ResumeCheckpointPayloadV1
  | PatchPromotionCheckpointPayloadV1;

export const TOOL_PERMISSION_CHECKPOINT_RESUME_TOOLS = [
  'artifact.create_note',
  'decision.draft',
  'source_context.create',
  'task.create_completion_criterion',
  'task.update_next_step',
  'workspace.run_command',
  'workspace.write_patch',
] as const satisfies readonly AgentToolName[];

export type ToolPermissionCheckpointResumeTool =
  typeof TOOL_PERMISSION_CHECKPOINT_RESUME_TOOLS[number];

const TOOL_PERMISSION_CHECKPOINT_RESUME_TOOL_SET = new Set<string>(
  TOOL_PERMISSION_CHECKPOINT_RESUME_TOOLS,
);

export function isToolPermissionCheckpointResumeTool(
  tool: unknown,
): tool is ToolPermissionCheckpointResumeTool {
  return typeof tool === 'string' && TOOL_PERMISSION_CHECKPOINT_RESUME_TOOL_SET.has(tool);
}

export function requiresTaskMutationResumePolicy(
  tool: ToolPermissionCheckpointResumeTool,
): boolean {
  return (
    tool === 'source_context.create' ||
    tool === 'decision.draft' ||
    tool === 'task.create_completion_criterion' ||
    tool === 'task.update_next_step'
  );
}

export type ParsedRunCheckpointPayload = Record<string, unknown> & {
  version?: unknown;
  kind?: unknown;
  agentSessionId?: unknown;
  tool?: unknown;
  nextTool?: unknown;
  risk?: unknown;
  reason?: unknown;
  runId?: unknown;
  decisionId?: unknown;
  decisionTitle?: unknown;
  artifactId?: unknown;
  artifactSummary?: unknown;
  sessionId?: unknown;
  descriptorId?: unknown;
  expectedFiles?: unknown;
  patchDigest?: unknown;
  preview?: unknown;
  input?: unknown;
  nextInput?: unknown;
  policySnapshot?: unknown;
};

export type ResumeCheckpointPayloadValidation =
  | {
      status: 'valid';
      payload: Omit<ResumeCheckpointPayloadV1, 'policySnapshot'> & {
        nextTool: AgentToolName;
        policySnapshot?: AgentPolicy;
      };
    }
  | {
      status: 'invalid';
      reason: string;
    };

export type ValidResumeCheckpointPayload = Extract<
  ResumeCheckpointPayloadValidation,
  { status: 'valid' }
>['payload'];

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

export function createPatchPromotionCheckpointPayload(
  input: Omit<PatchPromotionCheckpointPayloadV1, 'version' | 'kind'>,
): PatchPromotionCheckpointPayloadV1 {
  return {
    version: RUN_CHECKPOINT_PAYLOAD_VERSION,
    kind: 'patch_promotion',
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

export function isAgentPolicy(value: unknown): value is AgentPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<AgentPolicy>;

  return (
    typeof candidate.maxSteps === 'number' &&
    typeof candidate.maxWallTimeMs === 'number' &&
    typeof candidate.allowNetwork === 'boolean' &&
    typeof candidate.allowLocalWorkspaceRead === 'boolean' &&
    typeof candidate.allowLocalFileWrite === 'boolean' &&
    Array.isArray(candidate.confirmationRequiredRisks)
  );
}

export function validateResumeCheckpointPayload(
  payload: string | null | undefined,
  expected: {
    runId: string;
    taskId: string;
  },
): ResumeCheckpointPayloadValidation {
  const parsed = parseRunCheckpointPayload(payload);

  if (!parsed) {
    return invalidResumeCheckpointPayload('Resume checkpoint payload is not valid JSON.');
  }

  if (parsed.version !== undefined && parsed.version !== RUN_CHECKPOINT_PAYLOAD_VERSION) {
    return invalidResumeCheckpointPayload(
      `Unsupported resume checkpoint payload version: ${String(parsed.version)}.`,
    );
  }

  if (parsed.kind !== undefined && parsed.kind !== 'resume') {
    return invalidResumeCheckpointPayload(
      `Resume checkpoint payload kind is not resume: ${String(parsed.kind)}.`,
    );
  }

  if (parsed.runId !== undefined && parsed.runId !== expected.runId) {
    return invalidResumeCheckpointPayload(
      `Resume checkpoint payload runId does not match run: ${expected.runId}.`,
    );
  }

  if (parsed.taskId !== undefined && parsed.taskId !== expected.taskId) {
    return invalidResumeCheckpointPayload(
      `Resume checkpoint payload taskId does not match task: ${expected.taskId}.`,
    );
  }

  if (parsed.policySnapshot !== undefined && !isAgentPolicy(parsed.policySnapshot)) {
    return invalidResumeCheckpointPayload('Resume checkpoint payload policySnapshot is invalid.');
  }

  if (!isAgentToolName(parsed.nextTool)) {
    return invalidResumeCheckpointPayload(
      `Unsupported resume tool: ${String(parsed.nextTool ?? 'unknown')}`,
    );
  }

  if (!parsed.nextInput || typeof parsed.nextInput !== 'object' || Array.isArray(parsed.nextInput)) {
    return invalidResumeCheckpointPayload('Resume checkpoint payload is missing nextInput.');
  }

  if (parsed.nextTool === 'artifact.create_note') {
    const artifactNoteInputError = validateArtifactCreateNoteResumeInput(parsed.nextInput);

    if (artifactNoteInputError) {
      return invalidResumeCheckpointPayload(artifactNoteInputError);
    }
  }

  return {
    status: 'valid',
    payload: {
      version: RUN_CHECKPOINT_PAYLOAD_VERSION,
      kind: 'resume',
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      runId: typeof parsed.runId === 'string' ? parsed.runId : expected.runId,
      ...(typeof parsed.agentSessionId === 'string' ? { agentSessionId: parsed.agentSessionId } : {}),
      nextTool: parsed.nextTool,
      nextInput: parsed.nextInput,
      policySnapshot: isAgentPolicy(parsed.policySnapshot)
        ? parsed.policySnapshot
        : undefined,
      observations: parsed.observations,
      taskId: typeof parsed.taskId === 'string' ? parsed.taskId : expected.taskId,
    },
  };
}

export function isSupportedResumeCheckpointPayload(
  payload: ValidResumeCheckpointPayload,
): boolean {
  return payload.nextTool === 'artifact.create_note';
}

function validateArtifactCreateNoteResumeInput(input: object): string | null {
  const candidate = input as {
    content?: unknown;
    title?: unknown;
  };
  const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
  const content = typeof candidate.content === 'string' ? candidate.content.trim() : '';

  if (!title) {
    return 'artifact.create_note requires a title.';
  }

  if (!content) {
    return 'artifact.create_note requires content.';
  }

  return null;
}

function invalidResumeCheckpointPayload(reason: string): ResumeCheckpointPayloadValidation {
  return {
    status: 'invalid',
    reason,
  };
}

import { describe, expect, it } from 'vitest';

import {
  createPatchPromotionCheckpointPayload,
  createResumeCheckpointPayload,
  createToolPermissionCheckpointPayload,
  isSupportedResumeCheckpointPayload,
  parseRunCheckpointPayload,
  validateResumeCheckpointPayload,
} from './run-checkpoint-payload.js';

describe('run checkpoint payload helpers', () => {
  it('creates versioned tool-permission checkpoint payloads', () => {
    const payload = createToolPermissionCheckpointPayload({
      agentSessionId: 'agent_session_1',
      tool: 'artifact.create_note',
      risk: 'local_write',
      input: { title: 'Note', content: 'Body' },
      decisionId: 'decision_1',
      decisionTitle: '确认本地写入：artifact.create_note',
    });

    expect(payload).toEqual({
      version: 1,
      kind: 'tool_permission',
      agentSessionId: 'agent_session_1',
      tool: 'artifact.create_note',
      risk: 'local_write',
      input: { title: 'Note', content: 'Body' },
      decisionId: 'decision_1',
      decisionTitle: '确认本地写入：artifact.create_note',
    });
  });

  it('creates versioned resume checkpoint payloads', () => {
    const payload = createResumeCheckpointPayload({
      reason: '等待先解除阻塞。',
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      nextTool: 'artifact.create_note',
      nextInput: { title: 'Recovered note', content: 'Recovered note' },
      policySnapshot: {
        maxSteps: 8,
        maxWallTimeMs: 120_000,
        allowNetwork: false,
        allowLocalWorkspaceRead: false,
        allowLocalFileWrite: false,
        confirmationRequiredRisks: ['external_write', 'sensitive'],
      },
      taskId: 'task_1',
    });

    expect(payload).toMatchObject({
      version: 1,
      kind: 'resume',
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      reason: '等待先解除阻塞。',
      nextTool: 'artifact.create_note',
      policySnapshot: expect.objectContaining({
        allowLocalFileWrite: false,
        confirmationRequiredRisks: ['external_write', 'sensitive'],
      }),
      taskId: 'task_1',
    });
  });

  it('creates versioned patch-promotion checkpoint payloads', () => {
    const payload = createPatchPromotionCheckpointPayload({
      artifactId: 'artifact_1',
      artifactSummary: 'Reviewable sandbox patch',
      sessionId: 'sandbox_session_1',
      descriptorId: 'workspace.staged_patch',
      decisionId: null,
      decisionTitle: '确认提升 sandbox patch',
      expectedFiles: ['src/a.ts'],
      patchDigest: 'sha256:abc123',
      policySnapshot: {
        descriptorId: 'workspace.staged_patch',
        sessionKind: 'sandbox',
        credentialPolicy: 'none',
        networkPolicy: 'disabled',
        timeoutMs: 120_000,
        outputLimitBytes: 64_000,
      },
      preview: 'diff --git a/src/a.ts b/src/a.ts',
    });

    expect(payload).toEqual({
      version: 1,
      kind: 'patch_promotion',
      artifactId: 'artifact_1',
      artifactSummary: 'Reviewable sandbox patch',
      sessionId: 'sandbox_session_1',
      descriptorId: 'workspace.staged_patch',
      decisionId: null,
      decisionTitle: '确认提升 sandbox patch',
      expectedFiles: ['src/a.ts'],
      patchDigest: 'sha256:abc123',
      policySnapshot: expect.objectContaining({
        descriptorId: 'workspace.staged_patch',
        timeoutMs: 120_000,
        outputLimitBytes: 64_000,
      }),
      preview: 'diff --git a/src/a.ts b/src/a.ts',
    });
  });

  it('parses versioned and legacy JSON payloads', () => {
    expect(parseRunCheckpointPayload(JSON.stringify({
      version: 1,
      kind: 'tool_permission',
      tool: 'artifact.create_note',
      risk: 'local_write',
      input: {},
      decisionId: null,
      decisionTitle: '确认本地写入：artifact.create_note',
    }))).toMatchObject({
      version: 1,
      kind: 'tool_permission',
      tool: 'artifact.create_note',
    });

    expect(parseRunCheckpointPayload(JSON.stringify({
      nextTool: 'artifact.create_note',
      nextInput: {},
    }))).toMatchObject({
      nextTool: 'artifact.create_note',
    });

    expect(parseRunCheckpointPayload(JSON.stringify({
      version: 1,
      kind: 'patch_promotion',
      artifactId: 'artifact_1',
      sessionId: 'sandbox_session_1',
      descriptorId: 'workspace.staged_patch',
      decisionId: 'decision_1',
    }))).toMatchObject({
      kind: 'patch_promotion',
      artifactId: 'artifact_1',
      decisionId: 'decision_1',
    });

    expect(parseRunCheckpointPayload('not json')).toBeNull();
  });

  it('validates restart-safe resume checkpoint payloads', () => {
    const validation = validateResumeCheckpointPayload(JSON.stringify({
      version: 1,
      kind: 'resume',
      reason: '等待先解除阻塞。',
      runId: 'run_1',
      taskId: 'task_1',
      agentSessionId: 'agent_session_1',
      nextTool: 'artifact.create_note',
      nextInput: { title: 'Recovered note', content: 'Recovered note' },
      policySnapshot: {
        maxSteps: 8,
        maxWallTimeMs: 120_000,
        allowNetwork: false,
        allowLocalWorkspaceRead: false,
        allowLocalFileWrite: false,
        confirmationRequiredRisks: ['external_write', 'sensitive'],
      },
    }), {
      runId: 'run_1',
      taskId: 'task_1',
    });

    expect(validation).toEqual({
      status: 'valid',
      payload: expect.objectContaining({
        kind: 'resume',
        nextTool: 'artifact.create_note',
        nextInput: { title: 'Recovered note', content: 'Recovered note' },
        policySnapshot: expect.objectContaining({
          allowLocalFileWrite: false,
        }),
        runId: 'run_1',
        taskId: 'task_1',
        agentSessionId: 'agent_session_1',
        version: 1,
      }),
    });
    expect(validation.status === 'valid' && isSupportedResumeCheckpointPayload(validation.payload)).toBe(true);
  });

  it.each([
    {
      payload: 'not json',
      reason: 'Resume checkpoint payload is not valid JSON.',
    },
    {
      payload: JSON.stringify({ version: 2, kind: 'resume', nextTool: 'artifact.create_note', nextInput: {} }),
      reason: 'Unsupported resume checkpoint payload version: 2.',
    },
    {
      payload: JSON.stringify({ version: 1, kind: 'tool_permission', nextTool: 'artifact.create_note', nextInput: {} }),
      reason: 'Resume checkpoint payload kind is not resume: tool_permission.',
    },
    {
      payload: JSON.stringify({ version: 1, kind: 'resume', runId: 'run_other', nextTool: 'artifact.create_note', nextInput: {} }),
      reason: 'Resume checkpoint payload runId does not match run: run_1.',
    },
    {
      payload: JSON.stringify({ version: 1, kind: 'resume', taskId: 'task_other', nextTool: 'artifact.create_note', nextInput: {} }),
      reason: 'Resume checkpoint payload taskId does not match task: task_1.',
    },
    {
      payload: JSON.stringify({ version: 1, kind: 'resume', nextTool: 'artifact.create_note', nextInput: {}, policySnapshot: { allowNetwork: false } }),
      reason: 'Resume checkpoint payload policySnapshot is invalid.',
    },
    {
      payload: JSON.stringify({ version: 1, kind: 'resume', nextTool: 'not.a_tool', nextInput: {} }),
      reason: 'Unsupported resume tool: not.a_tool',
    },
    {
      payload: JSON.stringify({ version: 1, kind: 'resume', nextTool: 'artifact.create_note' }),
      reason: 'Resume checkpoint payload is missing nextInput.',
    },
    {
      payload: JSON.stringify({ version: 1, kind: 'resume', nextTool: 'artifact.create_note', nextInput: {} }),
      reason: 'artifact.create_note requires a title.',
    },
    {
      payload: JSON.stringify({
        version: 1,
        kind: 'resume',
        nextTool: 'artifact.create_note',
        nextInput: { title: 'Recovered note', content: '' },
      }),
      reason: 'artifact.create_note requires content.',
    },
  ])('rejects invalid resume checkpoint payloads: $reason', ({ payload, reason }) => {
    expect(validateResumeCheckpointPayload(payload, {
      runId: 'run_1',
      taskId: 'task_1',
    })).toEqual({
      status: 'invalid',
      reason,
    });
  });
});

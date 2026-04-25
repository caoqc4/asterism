import { describe, expect, it } from 'vitest';

import {
  createResumeCheckpointPayload,
  createToolPermissionCheckpointPayload,
  parseRunCheckpointPayload,
} from './run-checkpoint-payload.js';

describe('run checkpoint payload helpers', () => {
  it('creates versioned tool-permission checkpoint payloads', () => {
    const payload = createToolPermissionCheckpointPayload({
      tool: 'artifact.create_note',
      risk: 'local_write',
      input: { title: 'Note', content: 'Body' },
      decisionId: 'decision_1',
      decisionTitle: '确认本地写入：artifact.create_note',
    });

    expect(payload).toEqual({
      version: 1,
      kind: 'tool_permission',
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
      reason: '等待先解除阻塞。',
      nextTool: 'artifact.create_note',
      policySnapshot: expect.objectContaining({
        allowLocalFileWrite: false,
        confirmationRequiredRisks: ['external_write', 'sensitive'],
      }),
      taskId: 'task_1',
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

    expect(parseRunCheckpointPayload('not json')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import {
  buildDefaultOperatorStartedRunRequest,
  isOperatorStartedRunKind,
  validateOperatorStartedRunRequest,
} from './operator-started-run.js';

describe('operator-started run contract', () => {
  it('builds a default hidden manual browser evidence request', () => {
    const request = buildDefaultOperatorStartedRunRequest({
      kind: 'browser_evidence_smoke',
      reason: 'Capture localhost evidence before review.',
      taskId: 'task_1',
    });

    expect(request).toMatchObject({
      descriptorId: 'browser.readonly_evidence',
      kind: 'browser_evidence_smoke',
      modelExposure: 'hidden',
      operatorConfirmed: true,
      providerCallAllowed: false,
      reason: 'Capture localhost evidence before review.',
      schedulerAllowed: false,
      taskId: 'task_1',
      policy: expect.objectContaining({
        credentialPolicy: 'explicit_config',
        descriptorId: 'browser.readonly_evidence',
        networkPolicy: 'allowlisted',
        sessionKind: 'browser',
      }),
    });
    expect(validateOperatorStartedRunRequest(request)).toMatchObject({
      summary: 'Operator-started run request valid / kind=browser_evidence_smoke / descriptor=browser.readonly_evidence / modelExposure=hidden / scheduler=no / providerCall=no',
      valid: true,
    });
  });

  it('maps code-agent and sandbox patch review requests to staged-patch policy', () => {
    expect(buildDefaultOperatorStartedRunRequest({
      kind: 'code_agent_preview',
      taskId: 'task_1',
    })).toMatchObject({
      descriptorId: 'workspace.staged_patch',
      policy: expect.objectContaining({
        descriptorId: 'workspace.staged_patch',
        networkPolicy: 'disabled',
        sessionKind: 'sandbox',
      }),
    });
    expect(buildDefaultOperatorStartedRunRequest({
      kind: 'sandbox_patch_review',
      taskId: 'task_1',
    })).toMatchObject({
      descriptorId: 'workspace.staged_patch',
    });
  });

  it('rejects ambient starts, model exposure, provider calls, and descriptor drift', () => {
    expect(validateOperatorStartedRunRequest({
      ...buildDefaultOperatorStartedRunRequest({
        kind: 'browser_evidence_smoke',
        taskId: 'task_1',
      }),
      descriptorId: 'workspace.staged_patch',
      modelExposure: 'policy_gated',
      operatorConfirmed: false,
      providerCallAllowed: true,
      schedulerAllowed: true,
    })).toMatchObject({
      blockedReasons: expect.arrayContaining([
        'Operator-started run request requires explicit operator confirmation.',
        'Operator-started run request must keep model exposure hidden.',
        'Operator-started run request must not allow scheduler starts.',
        'Operator-started run request must not allow provider calls by default.',
        'Operator-started run request descriptor must match its kind.',
      ]),
      valid: false,
    });
  });

  it('rejects policy mismatch against the selected internal run kind', () => {
    const request = buildDefaultOperatorStartedRunRequest({
      kind: 'browser_evidence_smoke',
      taskId: 'task_1',
    });

    expect(validateOperatorStartedRunRequest({
      ...request,
      policy: buildDefaultOperatorStartedRunRequest({
        kind: 'code_agent_preview',
        taskId: 'task_1',
      }).policy,
    })).toMatchObject({
      blockedReasons: expect.arrayContaining([
        'Operator-started run policy descriptor must match its kind.',
      ]),
      valid: false,
    });
  });

  it('exposes a narrow kind guard', () => {
    expect(isOperatorStartedRunKind('browser_evidence_smoke')).toBe(true);
    expect(isOperatorStartedRunKind('browser.controlled_interaction')).toBe(false);
    expect(isOperatorStartedRunKind('scheduled_agent_run')).toBe(false);
  });
});

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

  it('builds a default hidden manual browser controlled local QA request', () => {
    const request = buildDefaultOperatorStartedRunRequest({
      kind: 'browser_controlled_local_qa',
      reason: 'Run controlled local browser QA.',
      taskId: 'task_1',
    });

    expect(request).toMatchObject({
      descriptorId: 'browser.controlled_interaction',
      kind: 'browser_controlled_local_qa',
      modelExposure: 'hidden',
      operatorConfirmed: true,
      providerCallAllowed: false,
      reason: 'Run controlled local browser QA.',
      schedulerAllowed: false,
      taskId: 'task_1',
      policy: expect.objectContaining({
        credentialPolicy: 'explicit_config',
        descriptorId: 'browser.controlled_interaction',
        networkPolicy: 'allowlisted',
        sessionKind: 'browser',
      }),
    });
    expect(validateOperatorStartedRunRequest(request)).toMatchObject({
      summary: 'Operator-started run request valid / kind=browser_controlled_local_qa / descriptor=browser.controlled_interaction / modelExposure=hidden / scheduler=no / providerCall=no',
      valid: true,
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
        kind: 'browser_controlled_local_qa',
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
    expect(isOperatorStartedRunKind('browser_controlled_local_qa')).toBe(true);
    expect(isOperatorStartedRunKind('code_agent_preview')).toBe(false);
    expect(isOperatorStartedRunKind('sandbox_patch_review')).toBe(false);
    expect(isOperatorStartedRunKind('browser.controlled_interaction')).toBe(false);
    expect(isOperatorStartedRunKind('scheduled_agent_run')).toBe(false);
  });
});

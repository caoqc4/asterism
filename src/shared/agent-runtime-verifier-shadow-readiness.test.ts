import { describe, expect, it } from 'vitest';

import type { ApiVerifierShadowSample } from './agent-runtime-verifier-shadow-readiness.js';
import { evaluateApiVerifierShadowReadiness } from './agent-runtime-verifier-shadow-readiness.js';

describe('agent-runtime-verifier-shadow-readiness', () => {
  it('blocks default-on verifier behavior until representative shadow evidence exists', () => {
    const readiness = evaluateApiVerifierShadowReadiness([
      sample(1, ['successful_agent_cli'], 'accept_for_review'),
    ]);

    expect(readiness).toMatchObject({
      ready: false,
      status: 'not_ready',
      sampleCount: 1,
      invalidCount: 0,
      missingKinds: [
        'failed_or_cancelled_agent_cli',
        'missing_evidence',
        'task_goal_conditions',
        'pending_task_memory',
      ],
    });
    expect(readiness.blockers).toContain('Need at least 30 shadow samples before changing verifier behavior.');
    expect(readiness.blockers.join('\n')).toContain('Missing representative samples');
  });

  it('requires a clean recent structured-validity window and low total invalid rate', () => {
    const samples = buildCompleteSampleSet();
    samples[29] = {
      ...samples[29],
      apiDecision: null,
      apiOutputValid: false,
    };

    const readiness = evaluateApiVerifierShadowReadiness(samples);

    expect(readiness.ready).toBe(false);
    expect(readiness.invalidCount).toBe(1);
    expect(readiness.invalidInRecentWindow).toBe(1);
    expect(readiness.blockers).toContain('Recent structured verifier window has 1 invalid sample(s).');
    expect(readiness.blockers).toContain('Invalid output rate 3.3% exceeds 2.0%.');
  });

  it('requires disagreements to stay inspectable and below the compatibility threshold', () => {
    const samples = buildCompleteSampleSet();
    for (const index of [3, 7, 11, 15]) {
      samples[index] = {
        ...samples[index],
        apiDecision: samples[index].lightweightDecision === 'accept_for_review'
          ? 'needs_evidence'
          : 'accept_for_review',
        disagreementInspectable: index !== 15,
      };
    }

    const readiness = evaluateApiVerifierShadowReadiness(samples);

    expect(readiness.ready).toBe(false);
    expect(readiness.disagreementCount).toBe(4);
    expect(readiness.uninspectableDisagreementCount).toBe(1);
    expect(readiness.blockers).toContain('Decision disagreement rate 13.3% exceeds 10.0%.');
    expect(readiness.blockers).toContain('1 disagreement(s) are not inspectable from persisted evidence.');
  });

  it('marks the API verifier ready for assist only after all shadow thresholds pass', () => {
    const readiness = evaluateApiVerifierShadowReadiness(buildCompleteSampleSet());

    expect(readiness).toMatchObject({
      ready: true,
      status: 'ready_for_assist',
      sampleCount: 30,
      invalidCount: 0,
      invalidInRecentWindow: 0,
      disagreementCount: 0,
      missingKinds: [],
      blockers: [],
    });
  });

  it('can require future Agent API execution samples once that runtime becomes executable', () => {
    const currentOnly = evaluateApiVerifierShadowReadiness(buildCompleteSampleSet(), {
      requireAgentApiSamples: true,
    });
    const withAgentApi = evaluateApiVerifierShadowReadiness([
      ...buildCompleteSampleSet(),
      sample(31, ['agent_api'], 'accept_for_review'),
    ], {
      requireAgentApiSamples: true,
    });

    expect(currentOnly.ready).toBe(false);
    expect(currentOnly.missingKinds).toEqual(['agent_api']);
    expect(withAgentApi.ready).toBe(true);
  });
});

function buildCompleteSampleSet(): ApiVerifierShadowSample[] {
  return Array.from({ length: 30 }, (_, index) => {
    const number = index + 1;
    if (number === 1) return sample(number, ['successful_agent_cli'], 'accept_for_review');
    if (number === 2) return sample(number, ['failed_or_cancelled_agent_cli'], 'failed');
    if (number === 3) return sample(number, ['missing_evidence'], 'needs_evidence');
    if (number === 4) return sample(number, ['task_goal_conditions'], 'accept_for_review');
    if (number === 5) return sample(number, ['pending_task_memory'], 'accept_for_review');
    return sample(number, ['successful_agent_cli'], 'accept_for_review');
  });
}

function sample(
  number: number,
  kinds: ApiVerifierShadowSample['kinds'],
  decision: ApiVerifierShadowSample['lightweightDecision'],
): ApiVerifierShadowSample {
  return {
    apiDecision: decision,
    apiOutputValid: true,
    createdAtIso: `2026-05-20T00:${String(number).padStart(2, '0')}:00.000Z`,
    disagreementInspectable: true,
    id: `sample_${number}`,
    kinds,
    lightweightDecision: decision,
  };
}

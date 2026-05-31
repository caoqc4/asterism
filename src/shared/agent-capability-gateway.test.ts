import { describe, expect, it } from 'vitest';

import {
  decisionBackendForAgentScheme,
  inferSelectedAgentScheme,
  resolveAgentCapabilityGateway,
  selectedAgentSchemeForRuntimeMode,
} from './agent-capability-gateway.js';

describe('Agent Capability Gateway taxonomy', () => {
  it('maps the user default runtime mode without treating it as execution readiness', () => {
    expect(selectedAgentSchemeForRuntimeMode('api')).toBe('agent_api');
    expect(selectedAgentSchemeForRuntimeMode('codex')).toBe('codex');
    expect(selectedAgentSchemeForRuntimeMode('claude')).toBe('claude');
    expect(selectedAgentSchemeForRuntimeMode(null)).toBeNull();

    const apiSelection = resolveAgentCapabilityGateway({
      availableDecisionBackends: ['rules', 'agent_api', 'codex_cli'],
      runtime: { agentCliReady: true, apiRuntimeReady: true },
      runtimeNeed: 'task_execution',
      selectedAgentScheme: selectedAgentSchemeForRuntimeMode('api'),
    });

    expect(apiSelection.selectedAgentScheme).toBe('agent_api');
    expect(apiSelection.providerCapabilityProbe.agentApiConfigured).toBe(true);
    expect(apiSelection.providerCapabilityProbe.agentApiExecutionReady).toBe(false);
    expect(apiSelection.providerCapabilityProbe.selectedSchemeSupportsNeed).toBe(false);
    expect(apiSelection.executionRuntime).toBe('codex_cli');
  });

  it('keeps the selected Agent scheme separate from runtime need and backend ids', () => {
    expect(inferSelectedAgentScheme({
      agentCliReady: true,
      apiRuntimeReady: false,
      selectedCliRuntime: 'claude',
    })).toBe('claude');
    expect(decisionBackendForAgentScheme('claude')).toBe('claude_cli');

    const selection = resolveAgentCapabilityGateway({
      availableDecisionBackends: ['rules', 'agent_api', 'claude_cli'],
      runtime: { agentCliReady: true, apiRuntimeReady: true },
      runtimeNeed: 'decision',
      selectedAgentScheme: 'claude',
    });

    expect(selection).toMatchObject({
      decisionBackend: 'claude_cli',
      executionRuntime: 'claude_cli',
      permissionGate: 'decision_backend',
      runtimeNeed: 'decision',
      selectedAgentScheme: 'claude',
      status: 'selected_scheme',
    });
    expect(selection.fallback).toBeNull();
  });

  it('keeps CLI-first task execution supported while Agent API execution remains gated', () => {
    const cliExecution = resolveAgentCapabilityGateway({
      availableDecisionBackends: ['rules', 'codex_cli', 'agent_api'],
      runtime: { agentCliReady: true, apiRuntimeReady: true },
      runtimeNeed: 'task_execution',
      selectedAgentScheme: 'codex',
    });

    expect(cliExecution).toMatchObject({
      decisionBackend: 'codex_cli',
      executionRuntime: 'codex_cli',
      permissionGate: 'runtime_entrypoint',
      status: 'selected_scheme',
    });
    expect(cliExecution.providerCapabilityProbe.agentApiExecutionReady).toBe(false);

    const apiExecution = resolveAgentCapabilityGateway({
      availableDecisionBackends: ['rules', 'agent_api', 'codex_cli'],
      runtime: { agentCliReady: true, apiRuntimeReady: true },
      runtimeNeed: 'task_execution',
      selectedAgentScheme: 'agent_api',
    });

    expect(apiExecution.providerCapabilityProbe).toMatchObject({
      agentApiConfigured: true,
      agentApiExecutionReady: false,
      selectedSchemeSupportsNeed: false,
    });
    expect(apiExecution.status).toBe('fallback');
    expect(apiExecution.decisionBackend).toBe('codex_cli');
    expect(apiExecution.fallback).toMatchObject({
      from: 'agent_api',
      to: 'codex_cli',
    });
  });

  it('keeps deterministic rules and human review as non-model control paths', () => {
    const noModelNeeded = resolveAgentCapabilityGateway({
      runtimeNeed: 'none',
      runtime: { agentCliReady: true, apiRuntimeReady: true },
      selectedAgentScheme: 'codex',
    });

    expect(noModelNeeded).toMatchObject({
      decisionBackend: 'rules',
      executionRuntime: 'local_rule',
      permissionGate: 'not_applicable',
      status: 'non_model',
    });

    const review = resolveAgentCapabilityGateway({
      availableDecisionBackends: ['human_review'],
      runtimeNeed: 'decision',
      runtime: {},
      selectedAgentScheme: 'codex',
    });

    expect(review).toMatchObject({
      decisionBackend: 'human_review',
      executionRuntime: 'human',
      permissionGate: 'human_review',
      status: 'fallback',
    });
    expect(review.fallback?.policy.visibility).toBe('explicit');
  });

  it('records explicit fallback instead of silently switching schemes', () => {
    const selection = resolveAgentCapabilityGateway({
      availableDecisionBackends: ['rules', 'agent_api'],
      runtime: { agentCliReady: false, apiRuntimeReady: true },
      runtimeNeed: 'decision',
      selectedAgentScheme: 'codex',
    });

    expect(selection.decisionBackend).toBe('agent_api');
    expect(selection.status).toBe('fallback');
    expect(selection.fallback).toMatchObject({
      from: 'codex',
      policy: {
        allowed: true,
        visibility: 'explicit',
      },
      to: 'agent_api',
    });
    expect(selection.fallback?.reason).toContain('Selected Agent scheme codex cannot satisfy decision');
  });
});

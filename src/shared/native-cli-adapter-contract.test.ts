import { describe, expect, it } from 'vitest';

import type { AgentRuntimeAdapterCapabilities } from './agent-runtime-goal.js';
import {
  buildNativeCliAdapterContract,
  formatNativeCliAdapterContractForStep,
} from './native-cli-adapter-contract.js';
import type { RuntimeContextManifest } from './runtime-context.js';
import type { RunScope } from './types/run.js';

describe('native CLI adapter contract', () => {
  it('records the selected CLI runtime, business-line owner, carrier, context, evidence, and writeback boundary', () => {
    const contract = buildNativeCliAdapterContract({
      capabilityMode: 'native',
      commandPreview: 'codex exec --json --sandbox read-only --cd /repo -',
      contextManifest: buildContextManifest(),
      runId: 'run_1',
      runScope: buildRunScope({
        businessLineId: 'business_line_1',
        businessLineContextPack: 'included',
        durableBusinessReview: 'eligible',
        kind: 'next_action_execution',
      }),
      runtimeCapabilities: buildRuntimeCapabilities(),
      runtimeId: 'codex',
      runtimeLabel: 'Codex CLI',
      sandboxMode: 'read-only',
      taskId: 'task_1',
      taskTitle: 'Ship the next action',
      workspaceRoot: '/repo',
    });

    expect(contract).toMatchObject({
      adapterKind: 'native_cli',
      runtime: {
        executionRuntime: 'codex_cli',
        runtimeId: 'codex',
        selectedAgentScheme: 'codex',
      },
      scope: {
        businessLineId: 'business_line_1',
        carrier: {
          kind: 'next_action_task',
          taskId: 'task_1',
        },
        oneOffScope: null,
      },
      context: {
        businessLineContextPack: 'included',
        contextManifestItemCount: 2,
      },
      allowedSurface: {
        files: {
          mode: 'read_only',
          workspaceWriteAllowed: false,
        },
        mcp: {
          taskplaneManaged: 'context_only',
        },
      },
      evidence: {
        evidenceOnly: true,
        nativeEventStream: 'run_steps_when_available',
      },
      writeIntent: {
        directProductMutationAllowed: false,
        evidenceRunId: 'run_1',
        outputMarker: 'TASKPLANE_WRITE_INTENTS',
        proposalRequired: true,
      },
      postRunReview: {
        durableWritePath: 'taskplane_write_intent_services',
      },
      compactAndHandoff: {
        defaultResetStrategy: 'product_transcript_reset',
        handoffType: 'runtime_or_subagent_handoff',
        preservationGate: 'context_transition_policy',
      },
    });
    expect(contract.writeIntent.acceptedIntentTypes).toContain('business_review.record');
    expect(contract.writeIntent.acceptedIntentTypes).toContain('task_record.create');
  });

  it('makes one-off non-durable scope explicit when no business-line owner exists', () => {
    const contract = buildNativeCliAdapterContract({
      capabilityMode: 'restricted',
      commandPreview: 'claude -p --permission-mode plan --output-format stream-json',
      contextManifest: buildContextManifest({ summary: 'Task-only context' }),
      runId: 'run_2',
      runScope: buildRunScope({
        businessLineId: null,
        businessLineContextPack: 'not_applicable',
        durableBusinessReview: 'not_applicable',
        kind: 'one_off_non_durable_action',
      }),
      runtimeCapabilities: buildRuntimeCapabilities({
        id: 'claude',
        label: 'Claude Code',
        supportsNativeClear: true,
        supportsNativeCompact: true,
      }),
      runtimeId: 'claude',
      runtimeLabel: 'Claude Code',
      sandboxMode: 'read-only',
      taskId: 'task_2',
      taskTitle: 'One-off review',
      workspaceRoot: '/repo',
    });

    expect(contract.runtime).toMatchObject({
      executionRuntime: 'claude_cli',
      runtimeId: 'claude',
      selectedAgentScheme: 'claude',
    });
    expect(contract.scope.oneOffScope).toMatchObject({
      reason: expect.stringContaining('No durable business-line owner'),
    });
    expect(contract.scope.runScope.kind).toBe('one_off_non_durable_action');
    expect(contract.context.businessLineContextPack).toBe('not_applicable');
    expect(contract.compactAndHandoff).toMatchObject({
      nativeClearAllowed: true,
      nativeCompactAllowed: true,
    });
    expect(formatNativeCliAdapterContractForStep(contract)).toContain('oneOffScope=yes');
  });
});

function buildRunScope(partial: Partial<RunScope>): RunScope {
  return {
    businessLineContextPack: 'not_applicable',
    businessLineId: null,
    durableBusinessReview: 'not_applicable',
    kind: 'one_off_non_durable_action',
    legacyBusinessLineOwner: false,
    ownershipSource: 'none',
    taskExecutionMemory: 'included',
    taskId: 'task_1',
    ...partial,
  };
}

function buildContextManifest(partial: Partial<RuntimeContextManifest> = {}): RuntimeContextManifest {
  return {
    activeSurface: 'task',
    items: [
      {
        contentIncluded: true,
        id: 'task_1',
        kind: 'task_state',
        label: 'Task 1',
      },
      {
        contentIncluded: true,
        id: 'capability_1',
        kind: 'capability',
        label: 'Codex CLI',
      },
    ],
    summary: 'Task context plus runtime capabilities.',
    userFacingSummary: 'Task context is ready.',
    ...partial,
  };
}

function buildRuntimeCapabilities(
  partial: Partial<AgentRuntimeAdapterCapabilities> = {},
): AgentRuntimeAdapterCapabilities {
  return {
    commandRouting: {
      passthroughRequiresExplicitNamespace: true,
      productOwned: ['/goal', '/status', '/cancel'],
      runtimeNative: ['/codex goal'],
    },
    defaultPermissionMode: 'read_only',
    defaultResetStrategy: 'product_transcript_reset',
    executionKind: 'cli',
    id: 'codex',
    label: 'Codex CLI',
    nativeGoalMode: {
      availability: 'available',
      minimumVersion: '0.133.0',
      reason: 'Detected.',
    },
    supportsClearGoal: true,
    supportsNativeGoalMode: true,
    supportsPauseGoal: false,
    supportsResumeGoal: false,
    supportsSingleRun: true,
    supportsStructuredProgressEvents: true,
    supportsWorkspaceWrite: false,
    ...partial,
  };
}

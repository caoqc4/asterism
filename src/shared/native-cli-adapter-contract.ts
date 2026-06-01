import type {
  AgentExecutionRuntime,
  UserSelectedAgentScheme,
} from './agent-capability-gateway.js';
import type {
  AgentRuntimeAdapterCapabilities,
} from './agent-runtime-goal.js';
import type { AgentCliRuntimeId } from './agent-cli-runtime-status.js';
import type { RuntimeContextManifest } from './runtime-context.js';
import type { AgentCliRunSandboxMode, RunScope } from './types/run.js';
import type { AgentCliCapabilityMode } from './types/settings.js';

export type NativeCliAdapterContract = {
  adapterKind: 'native_cli';
  allowedSurface: NativeCliAllowedSurface;
  compactAndHandoff: NativeCliCompactAndHandoffContract;
  context: NativeCliContextContract;
  evidence: NativeCliEvidenceContract;
  postRunReview: NativeCliPostRunReviewContract;
  runtime: NativeCliRuntimeContract;
  scope: NativeCliScopeContract;
  writeIntent: NativeCliWriteIntentContract;
};

export type NativeCliRuntimeContract = {
  capabilityMode: AgentCliCapabilityMode;
  commandPreview: string;
  executionRuntime: AgentExecutionRuntime;
  runtimeId: AgentCliRuntimeId;
  runtimeLabel: string;
  sandboxMode: AgentCliRunSandboxMode;
  selectedAgentScheme: UserSelectedAgentScheme;
};

export type NativeCliScopeContract = {
  businessLineId: string | null;
  carrier: {
    kind: 'next_action_task';
    taskId: string;
    taskTitle: string;
  };
  oneOffScope: {
    reason: string;
    writeBoundary: string;
  } | null;
  runScope: RunScope;
};

export type NativeCliContextContract = {
  businessLineContextPack: 'included' | 'not_applicable';
  capabilityAllowanceSummary: string | null;
  contextManifestItemCount: number;
  contextManifestSummary: string;
  contextPackBoundary: string;
};

export type NativeCliAllowedSurface = {
  files: {
    mode: 'read_only';
    workspaceRoot: string;
    workspaceWriteAllowed: false;
  };
  mcp: {
    taskplaneManaged: 'context_only';
  };
  tools: {
    externalAccess: 'context_only_or_runtime_native';
    nativeCliTools: 'runtime_dependent';
    taskplaneManagedSkills: 'context_only';
  };
};

export type NativeCliEvidenceContract = {
  commandPreview: string;
  evidenceOnly: true;
  nativeEventStream: 'run_steps_when_available';
  runId: string;
  terminalTranscript: 'run_output';
};

export type NativeCliWriteIntentContract = {
  acceptedIntentTypes: string[];
  directProductMutationAllowed: false;
  evidenceRunId: string;
  outputMarker: 'TASKPLANE_WRITE_INTENTS';
  proposalRequired: true;
};

export type NativeCliPostRunReviewContract = {
  durableWritePath: 'taskplane_write_intent_services';
  memoryProposalStepTitle: 'task_memory_proposal';
  verificationStepTitle: 'agent_runtime_verification';
};

export type NativeCliCompactAndHandoffContract = {
  defaultResetStrategy: 'product_transcript_reset' | 'runtime_native_clear' | 'runtime_restart';
  handoffType: 'runtime_or_subagent_handoff';
  nativeCompactAllowed: boolean;
  nativeClearAllowed: boolean;
  preservationGate: 'context_transition_policy';
};

export function buildNativeCliAdapterContract(params: {
  capabilityMode: AgentCliCapabilityMode;
  commandPreview: string;
  contextManifest: RuntimeContextManifest;
  runId: string;
  runScope: RunScope;
  runtimeCapabilities: AgentRuntimeAdapterCapabilities;
  runtimeId: AgentCliRuntimeId;
  runtimeLabel: string;
  sandboxMode: AgentCliRunSandboxMode;
  taskId: string;
  taskTitle: string;
  workspaceRoot: string;
}): NativeCliAdapterContract {
  return {
    adapterKind: 'native_cli',
    allowedSurface: {
      files: {
        mode: 'read_only',
        workspaceRoot: params.workspaceRoot,
        workspaceWriteAllowed: false,
      },
      mcp: {
        taskplaneManaged: 'context_only',
      },
      tools: {
        externalAccess: 'context_only_or_runtime_native',
        nativeCliTools: 'runtime_dependent',
        taskplaneManagedSkills: 'context_only',
      },
    },
    compactAndHandoff: {
      defaultResetStrategy: params.runtimeCapabilities.defaultResetStrategy ?? 'product_transcript_reset',
      handoffType: 'runtime_or_subagent_handoff',
      nativeCompactAllowed: params.runtimeCapabilities.supportsNativeCompact === true,
      nativeClearAllowed: params.runtimeCapabilities.supportsNativeClear === true,
      preservationGate: 'context_transition_policy',
    },
    context: {
      businessLineContextPack: params.runScope.businessLineContextPack,
      capabilityAllowanceSummary: params.contextManifest.capabilityAllowance?.summary ?? null,
      contextManifestItemCount: params.contextManifest.items.length,
      contextManifestSummary: params.contextManifest.summary,
      contextPackBoundary: 'Taskplane assembles context; native CLI receives allowed context only.',
    },
    evidence: {
      commandPreview: params.commandPreview,
      evidenceOnly: true,
      nativeEventStream: 'run_steps_when_available',
      runId: params.runId,
      terminalTranscript: 'run_output',
    },
    postRunReview: {
      durableWritePath: 'taskplane_write_intent_services',
      memoryProposalStepTitle: 'task_memory_proposal',
      verificationStepTitle: 'agent_runtime_verification',
    },
    runtime: {
      capabilityMode: params.capabilityMode,
      commandPreview: params.commandPreview,
      executionRuntime: executionRuntimeForNativeCli(params.runtimeId),
      runtimeId: params.runtimeId,
      runtimeLabel: params.runtimeLabel,
      sandboxMode: params.sandboxMode,
      selectedAgentScheme: params.runtimeId,
    },
    scope: {
      businessLineId: params.runScope.businessLineId,
      carrier: {
        kind: 'next_action_task',
        taskId: params.taskId,
        taskTitle: params.taskTitle,
      },
      oneOffScope: params.runScope.businessLineId
        ? null
        : {
            reason: 'No durable business-line owner is resolved for this native CLI run.',
            writeBoundary: 'Runtime output remains evidence until Write Intent resolves a durable owner or stays task-scoped.',
          },
      runScope: params.runScope,
    },
    writeIntent: {
      acceptedIntentTypes: [
        'artifact.propose',
        'business_handoff.record',
        'business_next_action.create',
        'business_record.create',
        'business_review.record',
        'business_sop_revision.propose',
        'decision.create',
        'source_context.create',
        'subtask.propose',
        'task.complete.propose',
        'task.mark_blocked',
        'task.update_next_step',
        'task_file.propose',
        'task_record.create',
      ],
      directProductMutationAllowed: false,
      evidenceRunId: params.runId,
      outputMarker: 'TASKPLANE_WRITE_INTENTS',
      proposalRequired: true,
    },
  };
}

export function formatNativeCliAdapterContractForStep(contract: NativeCliAdapterContract): string {
  return [
    `adapter=${contract.adapterKind}`,
    `selected_cli_runtime=${contract.runtime.runtimeId}`,
    `execution_runtime=${contract.runtime.executionRuntime}`,
    `businessLineId=${contract.scope.businessLineId ?? 'none'}`,
    `carrier=${contract.scope.carrier.kind}:${contract.scope.carrier.taskId}`,
    `runScope=${contract.scope.runScope.kind}`,
    `oneOffScope=${contract.scope.oneOffScope ? 'yes' : 'no'}`,
    `contextManifestSummary=${contract.context.contextManifestSummary}`,
    `contextManifestItems=${contract.context.contextManifestItemCount}`,
    `businessLineContextPack=${contract.context.businessLineContextPack}`,
    contract.context.capabilityAllowanceSummary ? `capabilityAllowance=${contract.context.capabilityAllowanceSummary}` : null,
    `fileSurface=${contract.allowedSurface.files.mode}`,
    `workspaceWriteAllowed=${contract.allowedSurface.files.workspaceWriteAllowed ? 'yes' : 'no'}`,
    `mcpSurface=${contract.allowedSurface.mcp.taskplaneManaged}`,
    `runEvidence=${contract.evidence.nativeEventStream}+${contract.evidence.terminalTranscript}`,
    `writeIntent=${contract.writeIntent.outputMarker}`,
    `directProductMutationAllowed=${contract.writeIntent.directProductMutationAllowed ? 'yes' : 'no'}`,
    `postRunReview=${contract.postRunReview.verificationStepTitle}`,
    `resetStrategy=${contract.compactAndHandoff.defaultResetStrategy}`,
    `handoff=${contract.compactAndHandoff.handoffType}`,
  ].filter((line): line is string => line !== null).join('\n');
}

function executionRuntimeForNativeCli(runtimeId: AgentCliRuntimeId): AgentExecutionRuntime {
  return runtimeId === 'claude' ? 'claude_cli' : 'codex_cli';
}

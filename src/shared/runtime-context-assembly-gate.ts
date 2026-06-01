import type { RuntimeContextAssemblyPolicy } from './runtime-context.js';

export type RuntimeContextAssemblyGateEvaluation = {
  canProceed: boolean;
  required: boolean;
  summary: string;
  blockedReasons: string[];
};

export function evaluateRuntimeContextAssemblyGate(params: {
  contextAssembly?: RuntimeContextAssemblyPolicy | null;
  executionLabel: string;
  modelExposure: 'hidden' | 'visible' | 'policy_gated';
  providerCallAllowed: boolean;
  providerVisibleTaskContext: boolean;
}): RuntimeContextAssemblyGateEvaluation {
  if (params.providerVisibleTaskContext) {
    if (!params.contextAssembly) {
      const reason = 'Provider-visible task execution requires runtime context assembly.';
      return blockedGate(params.executionLabel, true, [reason]);
    }

    if (!params.contextAssembly.canExecuteTaskWork) {
      return blockedGate(params.executionLabel, true, [params.contextAssembly.summary]);
    }

    return {
      blockedReasons: [],
      canProceed: true,
      required: true,
      summary: `${params.executionLabel} context assembly gate ready: ${params.contextAssembly.summary}`,
    };
  }

  const blockedReasons = [
    params.providerCallAllowed
      ? 'Non-model runtime entry must not allow provider calls.'
      : null,
    params.modelExposure !== 'hidden'
      ? 'Non-model runtime entry must keep model exposure hidden.'
      : null,
  ].filter((reason): reason is string => Boolean(reason));

  if (blockedReasons.length > 0) {
    return blockedGate(params.executionLabel, false, blockedReasons);
  }

  return {
    blockedReasons: [],
    canProceed: true,
    required: false,
    summary: `${params.executionLabel} context assembly gate not required: providerCall=no / modelExposure=hidden`,
  };
}

function blockedGate(
  executionLabel: string,
  required: boolean,
  blockedReasons: string[],
): RuntimeContextAssemblyGateEvaluation {
  return {
    blockedReasons,
    canProceed: false,
    required,
    summary: `${executionLabel} context assembly gate blocked: ${blockedReasons.join('; ')}`,
  };
}

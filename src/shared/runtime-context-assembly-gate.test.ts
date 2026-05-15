import { describe, expect, it } from 'vitest';

import { evaluateRuntimeContextAssemblyGate } from './runtime-context-assembly-gate.js';

describe('evaluateRuntimeContextAssemblyGate', () => {
  it('requires context assembly for provider-visible task execution', () => {
    expect(evaluateRuntimeContextAssemblyGate({
      contextAssembly: {
        activeSurface: 'task',
        canExecuteTaskWork: true,
        missingRequired: [],
        requirements: [],
        summary: 'Runtime context assembly ready.',
      },
      executionLabel: 'ordinary Run',
      modelExposure: 'visible',
      providerCallAllowed: true,
      providerVisibleTaskContext: true,
    })).toMatchObject({
      canProceed: true,
      required: true,
      summary: 'ordinary Run context assembly gate ready: Runtime context assembly ready.',
    });
  });

  it('blocks provider-visible task execution when context assembly is missing or failed', () => {
    expect(evaluateRuntimeContextAssemblyGate({
      contextAssembly: null,
      executionLabel: 'ordinary Run',
      modelExposure: 'visible',
      providerCallAllowed: true,
      providerVisibleTaskContext: true,
    })).toMatchObject({
      blockedReasons: ['Provider-visible task execution requires runtime context assembly.'],
      canProceed: false,
      required: true,
    });

    expect(evaluateRuntimeContextAssemblyGate({
      contextAssembly: {
        activeSurface: 'task',
        canExecuteTaskWork: false,
        missingRequired: ['task_md'],
        requirements: [],
        summary: 'Runtime context assembly missing required inputs: task_md.',
      },
      executionLabel: 'Code Agent model producer',
      modelExposure: 'policy_gated',
      providerCallAllowed: true,
      providerVisibleTaskContext: true,
    })).toMatchObject({
      blockedReasons: ['Runtime context assembly missing required inputs: task_md.'],
      canProceed: false,
      required: true,
    });
  });

  it('does not require context assembly for hidden non-model runtime entries', () => {
    expect(evaluateRuntimeContextAssemblyGate({
      executionLabel: 'operator-started browser QA',
      modelExposure: 'hidden',
      providerCallAllowed: false,
      providerVisibleTaskContext: false,
    })).toMatchObject({
      canProceed: true,
      required: false,
      summary: 'operator-started browser QA context assembly gate not required: providerCall=no / modelExposure=hidden',
    });
  });

  it('blocks non-model entries that accidentally allow model exposure', () => {
    expect(evaluateRuntimeContextAssemblyGate({
      executionLabel: 'operator-started browser QA',
      modelExposure: 'visible',
      providerCallAllowed: true,
      providerVisibleTaskContext: false,
    })).toMatchObject({
      blockedReasons: [
        'Non-model runtime entry must not allow provider calls.',
        'Non-model runtime entry must keep model exposure hidden.',
      ],
      canProceed: false,
      required: false,
    });
  });
});

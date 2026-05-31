import { describe, expect, it } from 'vitest';

import {
  chooseContextResetStrategy,
  evaluateContextTransition,
} from './context-transition.js';

describe('context transition', () => {
  it('continues without transition work outside task context', () => {
    expect(evaluateContextTransition({
      intent: 'start_global_conversation',
      hasTaskContext: false,
      chatMessageCount: 0,
    })).toMatchObject({
      action: 'continue',
      handoffType: 'ephemeral_session_handoff',
      resetStrategy: 'none',
      requiresUserConfirmation: false,
    });
  });

  it('preserves and resets after a task chat has recoverable signals', () => {
    expect(evaluateContextTransition({
      intent: 'context_refresh',
      hasTaskContext: true,
      messages: [
        { role: 'user', text: '决定做基础教程网站，下一步整理页面范围。' },
      ],
    })).toMatchObject({
      action: 'preserve_and_reset',
      canProceedAfterWrites: true,
      handoffType: 'next_action_handoff',
      requiresUserConfirmation: true,
      resetStrategy: 'product_transcript_reset',
      preservation: expect.objectContaining({
        status: 'needs_write',
      }),
    });
  });

  it('creates a handoff for task switching instead of silently clearing context', () => {
    expect(evaluateContextTransition({
      intent: 'switch_task',
      hasTaskContext: true,
      messages: [
        { role: 'user', text: '风险是 API 权限还没确认，下一步交接给实现子任务。' },
      ],
    })).toMatchObject({
      action: 'create_handoff',
      handoffType: 'next_action_handoff',
      recoveryArtifact: {
        artifactKind: 'handoff_recovery_artifact',
        handoffType: 'next_action_handoff',
        rawTranscriptIncluded: false,
        writebackTarget: {
          requiresTaskplaneGate: true,
          surface: 'task_record',
        },
      },
      requiresUserConfirmation: true,
      resetStrategy: 'product_transcript_reset',
    });
  });

  it('defaults business-line context refresh to durable business handoff', () => {
    expect(evaluateContextTransition({
      intent: 'context_refresh',
      hasBusinessLineContext: true,
      hasTaskContext: false,
      messages: [
        { role: 'user', text: '业务线刷新：下一步补来源，风险是记录缺少 evidence pointer。' },
      ],
    })).toMatchObject({
      action: 'preserve_and_reset',
      handoffType: 'durable_business_handoff',
      preservation: expect.objectContaining({
        requiredWriteIntents: expect.arrayContaining([
          expect.objectContaining({ targetSurface: 'business_record' }),
        ]),
      }),
    });
  });

  it('can explicitly model a durable business handoff before context clearing', () => {
    expect(evaluateContextTransition({
      intent: 'context_refresh',
      handoffType: 'durable_business_handoff',
      hasBusinessLineContext: true,
      hasTaskContext: false,
      messages: [
        { role: 'user', text: '业务线交接：下一步复核来源，风险是记录缺少 evidence pointer。' },
      ],
    })).toMatchObject({
      action: 'preserve_and_reset',
      handoffType: 'durable_business_handoff',
      preservation: expect.objectContaining({
        requiredWriteIntents: expect.arrayContaining([
          expect.objectContaining({ targetSurface: 'business_record' }),
        ]),
      }),
    });
  });

  it('keeps short-term reasoning unless compact was explicitly preferred', () => {
    expect(evaluateContextTransition({
      intent: 'context_refresh',
      hasTaskContext: true,
      chatMessageCount: 8,
      shortTermReasoningActive: true,
    })).toMatchObject({
      action: 'block_transition',
      resetStrategy: 'none',
    });

    expect(evaluateContextTransition({
      intent: 'context_refresh',
      hasTaskContext: true,
      chatMessageCount: 8,
      preferCompact: true,
      shortTermReasoningActive: true,
    })).toMatchObject({
      action: 'compact',
      resetStrategy: 'product_transcript_reset',
    });
  });

  it('chooses runtime-native reset only when the adapter owns a persistent session', () => {
    expect(chooseContextResetStrategy({
      runtimeCapabilities: {
        id: 'codex',
        label: 'Codex CLI',
        executionKind: 'cli',
        supportsSingleRun: true,
        supportsPersistentSession: false,
        supportsNativeClear: true,
        supportsNativeCompact: true,
        supportsNativeGoalMode: false,
        supportsPauseGoal: false,
        supportsResumeGoal: false,
        supportsClearGoal: false,
        supportsStructuredProgressEvents: false,
        supportsWorkspaceWrite: false,
        defaultPermissionMode: 'read_only',
        nativeGoalMode: {
          availability: 'unsupported',
          minimumVersion: null,
          reason: 'not verified',
        },
        commandRouting: {
          productOwned: [],
          runtimeNative: [],
          passthroughRequiresExplicitNamespace: true,
        },
      },
    })).toBe('product_transcript_reset');

    expect(chooseContextResetStrategy({
      runtimeCapabilities: {
        id: 'claude',
        label: 'Claude Code',
        executionKind: 'cli',
        supportsSingleRun: true,
        supportsPersistentSession: true,
        supportsNativeClear: true,
        supportsNativeCompact: true,
        supportsNativeGoalMode: false,
        supportsPauseGoal: false,
        supportsResumeGoal: false,
        supportsClearGoal: false,
        supportsStructuredProgressEvents: false,
        supportsWorkspaceWrite: false,
        defaultPermissionMode: 'plan',
        nativeGoalMode: {
          availability: 'unsupported',
          minimumVersion: null,
          reason: 'not verified',
        },
        commandRouting: {
          productOwned: [],
          runtimeNative: [],
          passthroughRequiresExplicitNamespace: true,
        },
      },
    })).toBe('runtime_native_clear');

    expect(chooseContextResetStrategy({
      preferCompact: true,
      runtimeCapabilities: {
        id: 'claude',
        label: 'Claude Code',
        executionKind: 'cli',
        supportsSingleRun: true,
        supportsPersistentSession: true,
        supportsNativeClear: true,
        supportsNativeCompact: true,
        supportsNativeGoalMode: false,
        supportsPauseGoal: false,
        supportsResumeGoal: false,
        supportsClearGoal: false,
        supportsStructuredProgressEvents: false,
        supportsWorkspaceWrite: false,
        defaultPermissionMode: 'plan',
        nativeGoalMode: {
          availability: 'unsupported',
          minimumVersion: null,
          reason: 'not verified',
        },
        commandRouting: {
          productOwned: [],
          runtimeNative: [],
          passthroughRequiresExplicitNamespace: true,
        },
      },
    })).toBe('runtime_compact');

    expect(chooseContextResetStrategy({
      runtimeCapabilities: {
        id: 'claude',
        label: 'Claude Code',
        executionKind: 'cli',
        supportsSingleRun: true,
        supportsPersistentSession: true,
        supportsNativeClear: false,
        supportsNativeCompact: false,
        supportsNativeGoalMode: false,
        supportsPauseGoal: false,
        supportsResumeGoal: false,
        supportsClearGoal: false,
        supportsStructuredProgressEvents: false,
        supportsWorkspaceWrite: false,
        defaultPermissionMode: 'plan',
        nativeGoalMode: {
          availability: 'unsupported',
          minimumVersion: null,
          reason: 'not verified',
        },
        commandRouting: {
          productOwned: [],
          runtimeNative: [],
          passthroughRequiresExplicitNamespace: true,
        },
      },
    })).toBe('runtime_restart');
  });
});

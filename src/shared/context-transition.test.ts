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
      requiresUserConfirmation: true,
      resetStrategy: 'product_transcript_reset',
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
  });
});

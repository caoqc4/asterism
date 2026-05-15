import { describe, expect, it } from 'vitest';

import { evaluateRuntimeAction } from './runtime-action-evaluator.js';

describe('runtime action evaluator', () => {
  it('treats same-task context switches as ui-only', () => {
    expect(evaluateRuntimeAction({
      action: 'context_switch',
      fromTaskId: 'task_1',
      targetTaskId: 'task_1',
      messageCount: 4,
    })).toMatchObject({
      allowed: true,
      surface: 'ui_only',
      requiresConfirmation: false,
      shouldPersistTaskRecord: false,
    });
  });

  it('requires handoff-aware confirmation before switching away from an active task discussion', () => {
    expect(evaluateRuntimeAction({
      action: 'context_switch',
      fromTaskId: 'task_1',
      targetTaskId: 'task_2',
      messageCount: 3,
      hasSpecificHandoffSignal: true,
    })).toMatchObject({
      allowed: true,
      surface: 'task_record',
      requiresConfirmation: true,
      shouldPersistTaskRecord: true,
      shouldRefreshContext: true,
    });
  });

  it('blocks task context clearing when no recoverable signal exists', () => {
    expect(evaluateRuntimeAction({
      action: 'context_clear',
      fromTaskId: 'task_1',
      messageCount: 3,
      hasSpecificHandoffSignal: false,
    })).toMatchObject({
      allowed: false,
      surface: 'task_record',
      shouldPersistTaskRecord: false,
    });
  });

  it('allows empty or global context clearing without task records', () => {
    expect(evaluateRuntimeAction({
      action: 'context_clear',
      fromTaskId: 'task_1',
      messageCount: 0,
    })).toMatchObject({
      allowed: true,
      surface: 'ui_only',
      shouldPersistTaskRecord: false,
    });

    expect(evaluateRuntimeAction({
      action: 'context_clear',
      fromTaskId: null,
      messageCount: 4,
    })).toMatchObject({
      allowed: true,
      surface: 'ui_only',
      shouldPersistTaskRecord: false,
    });
  });

  it('routes closeout and file write proposal to distinct durable surfaces', () => {
    expect(evaluateRuntimeAction({
      action: 'phase_closeout',
      fromTaskId: 'task_1',
      messageCount: 2,
    })).toMatchObject({
      allowed: true,
      surface: 'task_record',
      shouldPersistTaskRecord: true,
      shouldRefreshContext: true,
    });

    expect(evaluateRuntimeAction({
      action: 'task_file_write_proposal',
      fromTaskId: 'task_1',
      messageCount: 2,
    })).toMatchObject({
      allowed: true,
      surface: 'decision_checkpoint',
      requiresConfirmation: true,
      shouldPersistTaskRecord: false,
    });
  });

  it('routes decision actions through the decision checkpoint surface', () => {
    expect(evaluateRuntimeAction({
      action: 'decision_action',
      decisionAction: 'approve',
      fromTaskId: 'task_1',
    })).toMatchObject({
      allowed: true,
      surface: 'decision_checkpoint',
      requiresConfirmation: true,
      shouldRefreshContext: true,
    });

    expect(evaluateRuntimeAction({
      action: 'decision_action',
      decisionAction: 'defer',
      fromTaskId: 'task_1',
    })).toMatchObject({
      allowed: true,
      surface: 'decision_checkpoint',
      requiresConfirmation: false,
      shouldRefreshContext: false,
    });
  });

  it('routes task state transitions through timeline semantics', () => {
    expect(evaluateRuntimeAction({
      action: 'task_state_transition',
      fromTaskId: 'task_1',
      targetTaskState: 'completed',
    })).toMatchObject({
      allowed: true,
      surface: 'timeline',
      requiresConfirmation: true,
      shouldPersistTaskRecord: true,
      shouldRefreshContext: true,
    });

    expect(evaluateRuntimeAction({
      action: 'task_state_transition',
      fromTaskId: 'task_1',
      targetTaskState: 'waiting_external',
    })).toMatchObject({
      allowed: true,
      surface: 'timeline',
      requiresConfirmation: false,
      shouldPersistTaskRecord: false,
      shouldRefreshContext: true,
    });
  });

  it('routes task field mutations through timeline semantics', () => {
    expect(evaluateRuntimeAction({
      action: 'task_mutation',
      fromTaskId: 'task_1',
    })).toMatchObject({
      allowed: true,
      surface: 'timeline',
      requiresConfirmation: false,
      shouldRefreshContext: true,
    });

    expect(evaluateRuntimeAction({
      action: 'task_mutation',
      fromTaskId: null,
    })).toMatchObject({
      allowed: false,
      surface: 'timeline',
    });
  });

  it('routes run start and resume through run semantics', () => {
    expect(evaluateRuntimeAction({
      action: 'run_start',
      fromTaskId: 'task_1',
    })).toMatchObject({
      allowed: true,
      surface: 'run',
      requiresConfirmation: false,
      shouldRefreshContext: true,
    });

    expect(evaluateRuntimeAction({
      action: 'run_resume',
      fromTaskId: 'task_1',
    })).toMatchObject({
      allowed: true,
      surface: 'run',
      requiresConfirmation: true,
      shouldRefreshContext: true,
    });
  });
});

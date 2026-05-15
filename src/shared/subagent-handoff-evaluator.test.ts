import { describe, expect, it } from 'vitest';

import { evaluateSubagentHandoff } from './subagent-handoff-evaluator.js';

const baseAssignment = {
  inheritsPrinciples: true,
  taskContextProvided: true,
  scope: 'Inspect task hierarchy runtime helpers and report a bounded patch.',
  allowedActions: ['analysis', 'implementation', 'verification'] as const,
  allowedFileScopes: ['src/shared', 'docs/plans'],
};

describe('subagent handoff evaluator', () => {
  it('accepts a scoped handoff with evidence and explicit recovery fields', () => {
    const result = evaluateSubagentHandoff({
      assignment: baseAssignment,
      handoff: {
        summary: 'Added a shared hierarchy helper and regression tests.',
        actionsPerformed: ['implementation', 'verification'],
        filesChanged: ['src/shared/task-hierarchy.ts'],
        evidence: ['npm run test -- src/shared/task-hierarchy.test.ts'],
        risks: ['No known residual risk.'],
        unresolvedQuestions: ['None.'],
        recommendedNextAction: 'Review and integrate the patch.',
      },
    });

    expect(result).toMatchObject({
      allowed: true,
      tone: 'pass',
      errorCount: 0,
      warningCount: 0,
    });
  });

  it('blocks subagents that lack principles, task context, or narrow scope', () => {
    const result = evaluateSubagentHandoff({
      assignment: {
        inheritsPrinciples: false,
        taskContextProvided: false,
        scope: '',
        allowedActions: ['analysis'],
      },
      handoff: {
        summary: 'Looked around.',
        recommendedNextAction: 'Continue.',
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.tone).toBe('fail');
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'missing_principles',
      'missing_task_context',
      'missing_scope',
    ]));
  });

  it('blocks scope escapes and confirmation-boundary violations', () => {
    const result = evaluateSubagentHandoff({
      assignment: baseAssignment,
      handoff: {
        summary: 'Changed runtime and created follow-up tasks.',
        actionsPerformed: ['implementation', 'documentation'],
        filesChanged: ['src/renderer/pages/TasksPage.tsx', 'src/shared/runtime-handoff.ts'],
        evidence: ['npm run test'],
        risks: ['Requires review.'],
        recommendedNextAction: 'Commit changes.',
        createdSubtasks: true,
        bypassedConfirmationBoundary: true,
        modifiedPrinciples: true,
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'outside_action_scope',
      'outside_file_scope',
      'unapproved_subtask_creation',
      'confirmation_boundary_bypassed',
      'principles_modified',
    ]));
  });

  it('warns when a usable handoff omits verification or next-step recovery details', () => {
    const result = evaluateSubagentHandoff({
      assignment: baseAssignment,
      handoff: {
        summary: 'Updated a shared runtime helper.',
        actionsPerformed: ['implementation'],
        filesChanged: ['src/shared/runtime-handoff.ts'],
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.tone).toBe('warn');
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'missing_recommended_next_action',
      'missing_evidence_for_changes',
      'risks_or_questions_unacknowledged',
    ]));
  });
});

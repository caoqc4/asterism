import { describe, expect, it } from 'vitest';

import {
  AGENT_PRINCIPLES_COMPLIANCE,
  summarizeAgentPrinciplesCompliance,
} from './agent-principles-compliance.js';

const requiredSections = [
  'First Principles And Simplicity',
  'Required Read Order',
  'Information Routing Protocol',
  'Task Creation Protocol',
  'Project And Subtask Protocol',
  'Subtask Start Evaluation',
  'Execution Protocol',
  'Task.md Rules',
  'Task Records Rules',
  'Source Materials Protocol',
  'Working Files And Outputs',
  'Verification Protocol',
  'Task-Level Closeout And Next-Task Evaluation',
  'Subagent Protocol',
  'Context Clearing And New Conversations',
  'Work Habits Boundary',
  'Decisions, Confirmation, And Self-Check',
];

describe('agent principles compliance matrix', () => {
  it('tracks every major operating-principles section', () => {
    expect(AGENT_PRINCIPLES_COMPLIANCE.map((item) => item.section)).toEqual(requiredSections);
  });

  it('does not claim full compliance while known gaps remain', () => {
    const summary = summarizeAgentPrinciplesCompliance();

    expect(summary.implemented).toBe(0);
    expect(summary.partial).toBeGreaterThan(0);
    expect(summary.missing).toBe(0);
    expect(AGENT_PRINCIPLES_COMPLIANCE.some((item) => item.gaps.length > 0)).toBe(true);
    expect(AGENT_PRINCIPLES_COMPLIANCE.some((item) => (
      item.section === 'Verification Protocol' &&
      item.gaps.some((gap) => gap.includes('future project-level state transitions'))
    ))).toBe(true);
  });

  it('keeps each item actionable', () => {
    for (const item of AGENT_PRINCIPLES_COMPLIANCE) {
      expect(item.implementedBy.length).toBeGreaterThan(0);
      expect(item.gaps.length).toBeGreaterThan(0);
      expect(item.nextVerification.length).toBeGreaterThan(0);
    }
  });

  it('does not route future runtime work into the legacy WorkbenchPage', () => {
    const text = JSON.stringify(AGENT_PRINCIPLES_COMPLIANCE);

    expect(text).toContain('Legacy WorkbenchPage remains retired');
    expect(text).not.toContain('Workbench write paths');
    expect(text).not.toContain('Implement Decisions workbench');
  });

  it('does not keep completed context assembly work as a future task', () => {
    const text = JSON.stringify(AGENT_PRINCIPLES_COMPLIANCE);

    expect(text).toContain('RuntimeContextAssemblyGate requires read-order assembly');
    expect(text).not.toContain('Add RuntimeContextAssemblyPolicy');
    expect(text).not.toContain('not yet for every execution boundary');
  });

  it('does not keep completed Task.md evaluator work as a future task', () => {
    const text = JSON.stringify(AGENT_PRINCIPLES_COMPLIANCE);

    expect(text).toContain('TaskMdUpdateNeedEvaluation centralizes Task.md update needs');
    expect(text).not.toContain('Add TaskMdUpdateNeed evaluator');
  });

  it('does not keep completed subtask-start evaluator work as a future task', () => {
    const text = JSON.stringify(AGENT_PRINCIPLES_COMPLIANCE);

    expect(text).toContain('SubtaskStartEvaluation provides a shared runtime object');
    expect(text).not.toContain('Add shared SubtaskStartEvaluation');
  });

  it('records that task switching uses the same pending-memory boundary', () => {
    const text = JSON.stringify(AGENT_PRINCIPLES_COMPLIANCE);

    expect(text).toContain('task-switch checks TaskMemoryCoverageEvaluation');
    expect(text).toContain('blocks unresolved TaskMemoryGuidanceState through AutoContextClearReadiness');
  });

  it('records service-boundary completion and waiting-state guards', () => {
    const text = JSON.stringify(AGENT_PRINCIPLES_COMPLIANCE);

    expect(text).toContain('completion transitions require task_completion memory coverage');
    expect(text).toContain('waiting transitions require a waiting reason');
  });

  it('records that phase closeout uses the same pending-memory boundary', () => {
    const text = JSON.stringify(AGENT_PRINCIPLES_COMPLIANCE);

    expect(text).toContain('phase closeout consumes TaskMemoryCoverageEvaluation and pending TaskMemoryGuidanceState');
    expect(text).toContain('phase closeout blocks chat clearing when the closeout result still has blocker');
  });

  it('records that paused run resume uses the same pending-memory boundary', () => {
    const text = JSON.stringify(AGENT_PRINCIPLES_COMPLIANCE);

    expect(text).toContain('Paused Run resume consumes pending TaskMemoryGuidanceState');
  });

  it('records that approved decision checkpoint resume uses the same pending-memory boundary', () => {
    const text = JSON.stringify(AGENT_PRINCIPLES_COMPLIANCE);

    expect(text).toContain('Approved Decision checkpoint resume consumes pending TaskMemoryGuidanceState');
  });
});

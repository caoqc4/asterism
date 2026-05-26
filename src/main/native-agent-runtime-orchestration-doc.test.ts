import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Native Agent Runtime Orchestration spec', () => {
  it('keeps the implementation state aligned with current native CLI writeback support', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'docs/specs/native-agent-runtime-orchestration.md'),
      'utf8',
    );

    expect(content).toContain('pre-run web research bridge');
    expect(content).toContain('research query');
    expect(content).toContain('Right-panel runtime-native goal responses');
    expect(content).toContain('same readiness summary and missing evidence');
    expect(content).toContain('context.readiness.evaluate');
    expect(content).toContain('Pilot coordination is modeled as a product role');
    expect(content).toContain('Phase-2 Pilot assistance is bounded');
    expect(content).toContain('pilot_decision_summary');
    expect(content).toContain('Pilot 决策辅助计划');
    expect(content).toContain('Agent API chat invocations preserve');
    expect(content).toContain('skipped `execution_run`');
    expect(content).toContain('`execution_run` as deferred');
    expect(content).toContain('no provider-visible execution run starts');
    expect(content).toContain('`product_control_layer` or');
    expect(content).toContain('`persistent_ai_pilot_reserved` is a future');
    expect(content).toContain('future `wanman_matrix` executor');
    expect(content).toContain('completed chat summary');
    expect(content).toContain('local');
    expect(content).toContain('command/workspace activity');
    expect(content).toContain('capability-tagged Run');
    expect(content).toContain('`command_execution` items');
    expect(content).toContain('workspace reads, commands');
    expect(content).toContain('`workspace_write` capability steps are treated as write candidates');
    expect(content).toContain('`artifact.propose` Write Intent may carry `kind: "patch"`');
    expect(content).toContain('`imported_patch_artifact` sandbox draft sources');
    expect(content).toContain('explicitly apply an approved reviewed-patch promotion');
    expect(content).toContain('records applied or blocked run evidence');
    expect(content).toContain('no workspace files were');
    expect(content).toContain('Run evidence before re-reviewing');
    expect(content).toContain('post-apply verification results');
    expect(content).toContain('workspace drift blocks apply');
    expect(content).toContain('packaged task-files');
    expect(content).toContain('scheduled, event-triggered, and');
    expect(content).toContain('automaticStartAllowed: false');
    expect(content).toContain('automatic-start boundary');
    expect(content).toContain('AgentStandingApprovalPolicy');
    expect(content).toContain('shared L2 authorization surface');
    expect(content).toContain('daily run limit');
    expect(content).toContain('does not create a scheduler');
    expect(content).toContain('buildStandingApprovalConfirmationDraft');
    expect(content).toContain('operator-facing L2');
    expect(content).toContain('schedulerTriggerAllowed=false');
    expect(content).toContain('workspaceWriteAllowed=false');
    expect(content).toContain('blocks other automation readiness gaps');
    expect(content).toContain('adapter-level native capability declarations');
    expect(content).toContain('provider help output');
    expect(content).toContain('compact/clear context');
    expect(content).toContain('adapter capability support');
    expect(content).toContain('non-empty configured hook commands or hook entries');
    expect(content).toContain('non-empty `.claude/agents/*.md` files');
    expect(content).toContain('placeholders do');
    expect(content).toContain('not count as readiness');
    expect(content).toContain('AI Runtime settings surface shows these before a run starts');
    expect(content).toContain('selected-runtime');
    expect(content).toContain('native CLI prompts before execution');
    expect(content).toContain('while the native');
    expect(content).toContain('falls back to parsing the completed stdout transcript');
    expect(content).toContain('task records, task files,');
    expect(content).toContain('artifacts, source contexts, decisions, next-step updates, blockers');
    expect(content).toContain('for task,');
    expect(content).toContain('source, decision, subtask, task-file, and artifact writes');
    expect(content).toContain('Task Dynamics');
    expect(content).toContain('outside the right panel');
    expect(content).toContain('TaskplaneWritebackApprovalItem');
    expect(content).toContain('subtask.propose` is normalized into a `subtask.create_many` apply plan');
    expect(content).toContain('Agent API project-decomposition confirmation path');
    expect(content).toContain('AI 项目拆解自检.md');
    expect(content).toContain('created child task ids and the task record path');
    expect(content).toContain('draft-only before operator confirmation');
    expect(content).not.toContain('completion proposals are not fully wired into the same pipeline');
  });
});

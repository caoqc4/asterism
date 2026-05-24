# Taskplane Claude Code Instructions

This file is a thin native Claude Code adapter. It points Claude Code to
Taskplane's canonical runtime rules without duplicating long specs.

Taskplane is the product control layer. Native CLIs execute work and return
evidence; Taskplane owns durable task state, task memory, source context,
decisions, verification, and write gates.

## Always Read

- `docs/specs/goalpilot-task-advancement-framework.md`

GoalPilot is the always-loaded task router. Use it to choose the smallest useful
movement: clarify, research, shape, decompose, execute, verify, persist, hand
off, or pause.

## Load On Demand

- Execution, tool use, subagents, state mutation, or completion claims:
  `docs/specs/agent-operating-principles.md`
- User-visible chat, progress, drafts, proposals, files, or summaries:
  `docs/specs/agent-output-contract.md`
- Task memory, Task.md, Task Records, Source Context, context refresh, or
  recovery:
  `docs/specs/task-memory-spec.md`
- Codex or Claude Code plan, goal, memory, compact, skills, hooks, subagents,
  status, review, or context-readiness mapping:
  `docs/specs/native-agent-capability-mapping.md`
- Runtime result interpretation, decision skills, hooks, gates, Write Intent,
  or product writeback:
  `docs/specs/decision-layer-writeback-orchestration.md`
- CLI/API adapter, Write Intent, progress projection, or orchestration changes:
  `docs/specs/native-agent-runtime-orchestration.md`

## Boundaries

- Prefer movement over repeated clarification. Ask only when the missing answer
  blocks the next useful action, changes material risk, or changes the
  deliverable boundary.
- If context is sufficient, say so briefly only when useful and move into the
  chosen plan, research, execution, verification, or writeback path.
- Do not mutate Taskplane structured data directly. Propose durable writes
  through Taskplane Write Intent or product services.
- Do not create real subtasks, mark tasks complete, clear context, or perform
  high-impact writes without the relevant Taskplane gate or user confirmation.
- Keep this file short. Add detailed behavior to the relevant spec, skill, hook,
  service gate, or test instead.

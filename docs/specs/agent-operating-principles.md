# Taskplane Agent Operating Principles

Document id: taskplane.agent-operating-principles.v1
Owner: Taskplane product design
Layer: skill / phase-based execution rules
Load: concrete execution, runtime runs, subagents, tool use, state mutation, completion claims
Scope: task execution and durable product behavior
Authority: required when loaded; deterministic gates still enforce must-follow rules in code

## Purpose

This document classifies the Agent Operating Principles in the Taskplane runtime
layer stack. It is not the always-loaded business-line advancement router.
GoalPilot decides when these execution rules are relevant.

The runtime prompt copy currently lives in
`src/shared/agent-principles.ts` so product tests can verify the exact injected
text. Keep this docs page as the human-readable placement and loading contract.

## When To Load

Load the Agent Operating Principles when the selected movement involves:

- creating or mutating tasks, subtasks, Decisions, files, artifacts, sources, or
  task state;
- executing an Agent CLI, Agent API, subagent, tool, MCP, connector, or local
  command path;
- checking execution safety, write permissions, confirmation boundaries, or
  runtime entrypoint gates;
- verifying completion, closing a task, handing off work, or resuming after a
  checkpoint;
- deciding whether business/task memory or context cleanup is safe.

Do not load the full execution rules for every ordinary chat turn. GoalPilot
should first choose the movement, then load this document only when the movement
needs execution-level constraints.

## Relationship To Other Specs

- GoalPilot is always loaded and routes business-line advancement before
  execution rules take over.
- Agent Output Contract loads when the movement renders user-visible or
  product-surface output.
- Task Memory Spec loads when the movement reads, writes, clears, or evaluates
  durable business memory or task execution memory.
- Decision Layer Writeback Orchestration loads when execution output must be
  interpreted into Write Intent, proposal cards, hooks, gates, or product
  feature impact audit entries.
- Native Agent Runtime Orchestration loads when changing CLI/API adapter,
  DecisionBackend, progress projection, or runtime boundaries.

## Hard Boundaries

Rules that must always be true should be implemented as hooks, validators,
service guards, or tests. Prose in this document can guide an Agent, but it
must not be the only enforcement for:

- durable writes;
- task state transitions;
- child task creation;
- context clearing;
- source ingestion;
- completion claims;
- external or local side effects.

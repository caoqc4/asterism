# Native Agent Capability Mapping

Document id: `taskplane.native-agent-capability-mapping.v1`
Owner: Taskplane product architecture
Layer: architecture skill / native capability alignment
Load: runtime capability design, GoalPilot routing changes, native CLI adapter
behavior, context readiness, plan/goal/memory/compact/review mapping
Scope: Codex CLI, Claude Code, future Agent API, Taskplane control plane
Authority: implementation-guiding; Taskplane state and write gates still win

## Purpose

Taskplane should reuse mature native agent behaviors instead of flattening them
into product-authored prompts. This document maps Codex and Claude Code
capabilities into Taskplane's control model so the product can benefit from
native plan, goal, memory, context, skills, hooks, subagents, and review
patterns while keeping Taskplane task state authoritative.

The goal is not to copy one vendor UI. The goal is to preserve the mature
agent execution loop underneath Taskplane's durable task, memory, evidence, and
writeback loop.

## Native Pattern To Preserve

Mature coding agents tend to separate a run into these concerns:

- understand enough context before acting;
- plan or explore safely before writes;
- execute through native tools when the boundary is clear;
- keep stable project guidance in always-loaded files;
- load specialized workflows on demand;
- use hooks and permissions for deterministic constraints;
- isolate large or specialized searches in subagents;
- compact context without losing recovery state;
- verify, review, and record evidence before claiming done.

Taskplane should expose these concerns as product states and gates, not as a
single oversized prompt.

## Capability Map

| Native capability | Taskplane role | Product authority |
| --- | --- | --- |
| Plan / read-only explore | Context readiness and task shaping before execution. | GoalPilot chooses Shape, Research, or Execute. |
| Persistent goal loop | Long-running executor for a clear task objective. | Taskplane owns task goal, acceptance, pause, resume, and closeout. |
| AGENTS.md / CLAUDE.md / memory files | Thin startup adapters and stable project guidance. | GoalPilot stays canonical; Taskplane memory stays structured. |
| Skills / custom commands | Phase-loaded reusable workflows. | Product skills are indexed by GoalPilot and surfaced separately from optional user skills. |
| Hooks / permissions | Deterministic constraints around tools and lifecycle events. | Taskplane service guards validate writes, clears, completion, and external effects. |
| Subagents / task tools | Isolated research, audit, review, or source digestion. | Returned results are evidence, not direct product mutation. |
| Compact / clear / resume | Context hygiene and recoverable continuation. | Taskplane persists recovery notes before clearing or switching tasks. |
| Status / tool events | Runtime progress projection. | Taskplane stores run steps and shows compact user progress. |
| Review / eval | Completion and quality feedback. | Taskplane verifies against acceptance, evidence, blockers, and user decisions. |

## Vendor Reference Paths

These paths are reference designs, not product ownership transfer.

Codex-style path:

```text
AGENTS.md / rules
-> plan or context exploration
-> optional native goal loop for sustained execution
-> tools, skills, subagents, or web/search as available
-> compact/status/review signals
-> Taskplane Write Intent, verification, memory, evidence, closeout
```

Claude Code-style path:

```text
CLAUDE.md / project memory
-> Plan Mode or read-only exploration when context is fuzzy or risky
-> permissions and hooks constrain tools and side effects
-> subagents isolate review, research, audit, or large context work
-> slash commands such as compact, clear, memory, agents, permissions, model
   map to Taskplane context refresh, memory edit, capability, and runtime state
-> Taskplane Write Intent, verification, memory, evidence, closeout
```

For Taskplane, Claude Code's useful pattern is the separation between:

- memory files for project guidance;
- settings and permissions for tool boundaries;
- hooks for deterministic lifecycle checks;
- subagents for context isolation;
- Plan Mode for safe analysis before edits;
- slash commands for explicit session operations.

Taskplane should preserve those separations. `CLAUDE.md` stays a thin adapter,
Taskplane memory stays structured, hooks/gates enforce durable writes, and
Claude Code output remains evidence until converted into Write Intent.

## Context Readiness Pattern

Before execution, Taskplane should decide whether the agent has enough context
to act. This is separate from task memory retrieval and separate from asking the
user.

The readiness check asks:

1. Is the active task clean, or is unrelated conversation/file context leaking
   in?
2. Is the goal or next movement clear enough for a reversible step?
3. Are acceptance, risk, permission, external-effect, or credential boundaries
   clear enough for this movement?
4. Can missing facts be learned from files, source context, web research,
   official docs, prior records, or runtime tools?
5. Is the missing answer something only the user can decide?

If the answer can be discovered, research or inspect instead of asking. If the
answer is a user-owned boundary, ask one high-signal question. If enough
context exists, state a compact readiness status only when useful, then move
into the chosen action.

## Taskplane Adaptation Rules

- Do not transform ordinary user messages into verbose product prompts when a
  native CLI can handle the task directly with surrounding context.
- Prefer native plan/explore behavior for fuzzy or risky execution rather than
  repeated clarification.
- Prefer native research/search/browse capabilities, or Taskplane's source
  bridge, before asking the user to supply public information.
- Treat native goal mode as an executor capability below Taskplane mission
  state, never as the source of product truth.
- Treat native memory files as startup guidance; task decisions, evidence,
  source contexts, and recovery notes still live in Taskplane structured data.
- Promote any must-follow rule into a hook, gate, validator, service guard, or
  test instead of relying on prompt compliance.

## Adapter Implications

Codex and Claude adapters should report capabilities in a runtime-neutral way:

- plan/read-only mode available;
- persistent goal mode available or gated;
- native web/search/browse visibility;
- memory adapter files present;
- hooks or permission constraints available;
- subagent/delegation capability available;
- compact/resume/status events observable;
- review/eval signals observable.

Taskplane can then choose the right movement without pretending every runtime
has the same features. When a capability is missing, the product should either
use another backend, run a Taskplane bridge, or surface a clear blocker.

## Relationship To Other Specs

- GoalPilot is the always-loaded router that decides the movement and whether
  context is ready.
- Agent Operating Principles load for concrete execution and completion claims.
- Task Memory Spec loads when context must be persisted, retrieved, refreshed,
  or cleared.
- Decision Layer Writeback Orchestration converts runtime evidence into Write
  Intent and product proposals.
- Native Agent Runtime Orchestration defines the adapter boundary and runtime
  result contract.

## Reference Anchors

- Codex slash commands: https://developers.openai.com/codex/cli/slash-commands
- Codex goal use case: https://developers.openai.com/codex/use-cases/follow-goals
- Codex memories: https://developers.openai.com/codex/memories
- Claude Code common workflows and Plan Mode:
  https://docs.anthropic.com/en/docs/claude-code/common-workflows
- Claude Code memory and `CLAUDE.md`:
  https://docs.anthropic.com/en/docs/claude-code/memory
- Claude Code settings and permissions:
  https://docs.anthropic.com/en/docs/claude-code/settings
- Claude Code hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Claude Code subagents:
  https://docs.anthropic.com/en/docs/claude-code/sub-agents
- Claude Code slash commands:
  https://docs.anthropic.com/en/docs/claude-code/slash-commands

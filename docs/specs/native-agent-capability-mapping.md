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

## Mature Product Lessons

Codex and Claude Code converge on the same deeper architecture:

1. **Rules are layered.** Always-loaded files provide stable orientation,
   while skills, commands, hooks, and memories load by phase.
2. **Planning is a permission state.** Plan/read-only exploration is a real
   mode, not just a nicer answer style.
3. **Autonomy needs a classifier.** Long-running or auto modes still need
   deterministic allow/deny rules, model-backed classifiers, and fallback to
   manual approval.
4. **Context must be inspectable.** Users and product code need to see what
   rules, files, memories, sources, tools, and skills are actually in context.
5. **Subagents are context isolation.** Their value is keeping exploration,
   review, and source digestion out of the main thread until summarized.
6. **Compaction is a lifecycle event.** Skills, rules, and user boundaries can
   be lost or truncated after compaction unless the product reattaches the
   right small context.
7. **Completion is gated.** The agent should not stop or mark complete until
   evidence, criteria, blockers, and pending decisions pass review.

Taskplane should turn these into product primitives instead of more prompt
text: readiness skills, permission modes, action classifiers, context
manifests, subagent evidence, compaction gates, and completion gates.

## Claude Code Deep Reference

Claude Code's strongest pattern for Taskplane is its staged permission ladder:

| Claude Code pattern | Product lesson | Taskplane mapping |
| --- | --- | --- |
| `default` read-first mode | Safe exploration can be the default posture. | Read-only Agent CLI run and context readiness gate. |
| `plan` mode | Explore and propose before changing disk. | `context.readiness.evaluate` returns `plan_first`; show plan proposal before write-capable work. |
| `acceptEdits` | User accepts a plan, then reviews diffs after execution. | Future write-capable run mode with patch/artifact approval. |
| `auto` mode | Autonomy requires background classification and fallback. | Runtime action classifier plus repeated-block fallback to confirmation. |
| `dontAsk` | Non-interactive runs need pre-approved tool lists. | CI/scheduled task lanes can use allowlisted tools only. |
| `bypassPermissions` | Full autonomy belongs only in isolated sandboxes. | Never expose bypass to ordinary Taskplane runs; use disposable sandbox only. |

Other Claude Code mechanisms also map directly:

- Plan approval becomes a Taskplane proposal card, not a chat paragraph.
- User-stated boundaries such as "do not push" become Decisions or temporary
  gates before they are lost to compaction.
- `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStart`, `SubagentStop`,
  `PreCompact`, `PostCompact`, and task completion hooks map to Taskplane
  runtime entry, write intent, completion, context refresh, and subagent gates.
- Skills may survive compaction only within a budget, so Taskplane must record
  which product skills were invoked and reattach the current phase skill after
  context refresh.
- `/context` and `/memory` imply a product need: users should be able to see
  which Task.md, Task Records, Source Context, Work Habits, rules, skills, and
  runtime capabilities were used in a run.
- Subagent output should return as source/evidence summary plus risk flags; it
  should not mutate Taskplane state directly.

## Codex Deep Reference

Codex contributes a complementary model:

| Codex pattern | Product lesson | Taskplane mapping |
| --- | --- | --- |
| `/plan` and planning affordances | Planning is a first-class run phase. | Taskplane plan/shape movement before execute. |
| `/goal` | A persistent goal loop is executor-local. | Taskplane owns mission state; Codex goal is one run capability. |
| Memories | Stable preferences and workflows should be saved outside one chat. | Work Habits plus task-scoped memory surfaces. |
| `AGENTS.md` | Startup guidance should be thin and discoverable. | `AGENTS.md` points to GoalPilot and phase specs. |
| Skills and tools | Reusable workflows should be invoked by description and need. | Product skills are phase-loaded and visible in capability surfaces. |
| Review/eval workflows | Completion needs evidence and feedback loops. | Verification records, task completion gate, and source evidence. |

Codex validates the GoalPilot positioning: Taskplane should not become a
better single-agent goal loop. It should coordinate goals, tasks, runs, agents,
state, evidence, and review across runtimes.

## Agent Matrix Reference

Wanman-style matrix runtimes are useful reference executors, not Taskplane's
product identity. They coordinate multiple agents inside one delegated mission.
Taskplane Pilot coordinates across tasks and missions, chooses what deserves
attention, selects an executor, and verifies outcome evidence.

Taskplane should therefore model a matrix runtime as an executor capability:

| Matrix capability | Taskplane mapping |
| --- | --- |
| CEO/coordinator agent | Mission-internal executor coordinator below Pilot. |
| Message bus | Runtime event and evidence stream. |
| Task pool / initiative board | Imported evidence or mapped child task proposals, not source of Taskplane truth. |
| Artifact store | Artifact / Evidence proposal. |
| Per-agent worktree and HOME | Future run workspace isolation policy. |
| Escalation | Decision or human approval gate. |

The useful lesson is supervisor discipline: event logs, isolated workspaces,
capability declarations, skill snapshots, and explicit escalation boundaries.
Do not replace Taskplane's mission control layer with a black-box matrix.

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

`context.readiness.evaluate` should return one of:

| Decision | Meaning | Default next movement |
| --- | --- | --- |
| `ready` | Context is enough for a reversible next step. | Execute or shape. |
| `self_research` | Missing facts are public or source-derived. | Use native research or Taskplane source bridge. |
| `plan_first` | Work is broad, risky, or code-changing. | Use native plan/read-only exploration. |
| `ask_user` | Missing answer is user-owned. | Ask one high-signal question or create Decision. |
| `blocked` | A hard gate failed. | Pause until gate is resolved. |

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
- provider event projection into neutral web-search, workspace-read,
  workspace-write, command, MCP, and hook progress states;
- adapter-level native capability declarations surfaced before execution:
  structured events, runtime-dependent web/search, workspace read/write
  boundary, hooks, subagents, product-controlled memory, compact, and clear;
- memory adapter files present;
- hooks or permission constraints available;
- subagent/delegation capability available;
- compact/resume/status events observable;
- review/eval signals observable.

Taskplane can then choose the right movement without pretending every runtime
has the same features. When a capability is missing, the product should either
use another backend, run a Taskplane bridge, or surface a clear blocker.
Adapter-level declarations are not a substitute for live provider probes; they
are the minimum pre-run contract until stable CLI signals are available.

## Relationship To Other Specs

- GoalPilot is the always-loaded router that decides the movement and whether
  context is ready.
- Pilot Decision Contract defines how selected movement and priority become
  DecisionBackend choice, message priority, executor selection, and
  matrix-runtime delegation boundary.
- Pilot operation mode is a product-control choice first. Persistent AI Pilot
  remains a future opt-in capability, not a requirement for native CLI support.
- Priority Attention Routing defines Brief/Pilot focus selection when multiple
  tasks compete.
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

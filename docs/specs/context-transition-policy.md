# Context Transition Policy

Document id: taskplane.context-transition-policy.v1
Owner: Taskplane product runtime
Layer: phase-loaded skill / deterministic gate
Load: when compacting, resetting, clearing, handing off, switching business lines or Next Actions, closing a phase, or starting a new conversation
Authority: required when loaded; service gates own final writes and resets

## Purpose

Taskplane treats chat as temporary working memory. Context transition is the
shared policy for deciding when to keep it, compact it, reset it, or turn it
into the smallest recoverable handoff.

This policy is not another always-loaded router. GoalPilot decides when context
transition matters. This policy defines the concrete preservation and reset
rules once that movement has been chosen.

## Core Rule

Never discard business-line or task-bound chat just because it is long.

Transition only after the runtime can answer:

- What valuable signals would be lost?
- Which durable surface should preserve them?
- Can the next Agent recover business line, state, next safe action,
  constraints, and evidence without the old chat window?
- Is there a user decision, blocker, dependency, or short-term reasoning chain
  that must keep the current context alive?

If any answer is missing, keep the context or ask for the specific missing
decision. Do not use context reset to bypass user judgment.

## Valuable Signals

Preserve only signals that change future recovery or execution:

- goal, scope, audience, non-goals, or acceptance boundary;
- user decision, correction, preference, or constraint;
- next step, owner, follow-up, blocker, dependency, or risk;
- source, external reference, evidence, or research line;
- artifact, file, PR, page, output, or run evidence;
- handoff, phase closeout, business-line switch, Next Action/task switch, or
  compact/reset rationale.

Ordinary acknowledgements, repeated phrasing, generic questions, and already
covered state can be discarded.

## Transition Actions

Use the smallest action that preserves recovery:

- Keep context: low-signal discussion, blockers, open decisions, or active
  short-term reasoning.
- Compact: preserve a recovery proof, then continue with a shorter working
  context when the runtime supports it or the product transcript can be reset.
- Preserve and reset: write the smallest recovery note, then rebuild context
  from Taskplane memory.
- Create handoff: before business-line switch, Next Action switch, phase
  closeout, child handoff, runtime/subagent continuation, or cross-agent
  continuation.
- Continue: when no business-line/task context or no active discussion needs
  transition.

## Handoff V2 Types

Every handoff must name one of these types before any durable writes are
applied:

| Type | Source -> Target | Default Surface | Use When |
| --- | --- | --- | --- |
| `ephemeral_session_handoff` | current chat/session -> refreshed session | temporary file, product transcript reset proof, or no durable write when no valuable signal exists | Clearing, compacting, restarting, or refreshing working context without changing durable owner. |
| `durable_business_handoff` | business line A, review, source event, or phase -> business line A/B future work | Business Record, with pointers to reviews, SOP revisions, Decisions, sources, Runs, files, and artifacts | Business-line state, rationale, record gap, learning, or future context must survive beyond one task. |
| `next_action_handoff` | active Next Action/task -> child, successor, resumed action, or legacy task recovery | Task Record or Task.md update, plus structured task state | Concrete execution state must transfer to another action without making the task the durable business owner. |
| `runtime_or_subagent_handoff` | runtime, tool run, subagent, scheduler probe, or verifier -> Taskplane Agent/service gate | Run Step, runtime result, temporary file, or writeback proposal | Execution output must be evaluated before Taskplane applies Business Records, Task Records, files, Decisions, or other writes. |

Minimum fields:

- source and target: business line, Next Action/task, session, runtime, or
  subagent;
- reason: why the handoff exists now;
- current state: what is true, incomplete, blocked, or invalidated;
- next safe action: the first reversible continuation step;
- constraints and Decisions: approvals, blockers, risks, dependencies, and
  unresolved user judgment;
- evidence pointers: records, reviews, Runs, Run Steps, files, Decisions,
  Source Context, artifacts, PRs, or external sources;
- exclusions: what was intentionally not copied because it was transcript
  noise, duplicate reasoning, stale context, or unrelated business/task history;
- target surface: Business Record, Task Record, Run Step, temporary file, or no
  write.

Handoff is a boundary, not a transcript dump. Prefer pointers to durable
records and produced evidence over copying full chat, stdout, or hidden prompts.
Do not treat every handoff as a Task Record: choose the surface from the type
and recovery job.

## Reset Strategy

Taskplane chooses reset strategy from the runtime capability envelope:

- `runtime_compact`: only when Taskplane controls a persistent runtime session
  and the adapter verifies native compact support.
- `runtime_native_clear`: only when Taskplane controls a persistent runtime
  session and the adapter verifies native clear support.
- `runtime_restart`: when the runtime is persistent but reset must be achieved
  by replacing the session.
- `product_transcript_reset`: default for current native CLI one-shot runs;
  Taskplane resets the right-panel transcript and reassembles context for the
  next run.
- `none`: no reset is safe or needed.

Do not claim native CLI memory has been cleared unless the adapter actually
owns and clears that runtime session.

## Preservation Proof

Before reset or handoff, create a minimal preservation proof when valuable
signals exist. The proof should include:

- business line or task title and capture time;
- handoff type, source, and target;
- preservation status and reason;
- grouped valuable signals by target surface;
- recovery check for goal, state, next step, constraints, and evidence;
- missing coverage, if any;
- discarded rationale for non-useful chat.

The proof is a digest, not a transcript archive.

## Write Surfaces

Route writes through Taskplane services:

- Business Record: durable business-line handoff, phase rationale, correction,
  review summary, context-refresh archive, or future-context note.
- Task.md: concise goal, state, next step, or recovery summary.
- Task Records: Next Action or legacy task handoff, phase closeout, correction,
  failure review, context preservation proof, or option rationale.
- Decision: user approval or boundary that cannot be inferred.
- Source Context: external facts, docs, research, or evidence.
- Run/Run Step: execution evidence and runtime/subagent handoff result before
  writeback is applied.
- Artifact/task file: produced work or concrete file references.
- Temporary file: ephemeral session handoff, scratch recovery notes, or
  runtime/subagent output that has not passed a durable write gate.

Runtime output may propose Write Intent. Only Taskplane services apply it.

## Hooks And Gates

This policy must be enforced by deterministic checks:

- context preservation evaluator;
- context transition evaluator;
- business/task memory coverage check;
- runtime action guard;
- task record worthiness check;
- writeback dispatch validation.

The model may recommend a transition, but hooks decide whether it can proceed.
Runtime/subagent handoff must be evaluated before any proposed writes are
applied. Context clearing cannot bypass business-line recovery: when business
state, records, Decisions, sources, reviews, or SOP-relevant lessons would be
lost, preserve them through the Memory Spec before clearing.

## Relationship To Native CLIs

Codex CLI, Claude Code, and future API runtimes are execution engines. They may
have their own plan, goal, compact, clear, memory, and skill features.
Taskplane can use those features only when the adapter capability says they are
available and Taskplane can still preserve structured state.

The source of truth remains Taskplane business-line state, Next Action/task
state, memory, evidence, and write-intent history.

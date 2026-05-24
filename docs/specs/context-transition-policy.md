# Context Transition Policy

Document id: taskplane.context-transition-policy.v1
Owner: Taskplane product runtime
Layer: phase-loaded skill / deterministic gate
Load: when compacting, resetting, clearing, handing off, switching tasks, closing a phase, or starting a new conversation
Authority: required when loaded; service gates own final writes and resets

## Purpose

Taskplane treats chat as temporary working memory. Context transition is the
shared policy for deciding when to keep it, compact it, reset it, or turn it
into a handoff record.

This policy is not another always-loaded router. GoalPilot decides when context
transition matters. This policy defines the concrete preservation and reset
rules once that movement has been chosen.

## Core Rule

Never discard task-bound chat just because it is long.

Transition only after the runtime can answer:

- What valuable signals would be lost?
- Which durable surface should preserve them?
- Can the next Agent recover goal, state, next step, constraints, and evidence
  without the old chat window?
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
- handoff, phase closeout, task switch, compact/reset rationale.

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
- Create handoff: before task switch, phase closeout, child handoff, or
  cross-agent continuation.
- Continue: when no task context or no active discussion needs transition.

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

- task title and capture time;
- preservation status and reason;
- grouped valuable signals by target surface;
- recovery check for goal, state, next step, constraints, and evidence;
- missing coverage, if any;
- discarded rationale for non-useful chat.

The proof is a digest, not a transcript archive.

## Write Surfaces

Route writes through Taskplane services:

- Task.md: concise goal, state, next step, or recovery summary.
- Task Records: handoff, phase closeout, correction, failure review, context
  preservation proof, or option rationale.
- Decision: user approval or boundary that cannot be inferred.
- Source Context: external facts, docs, research, or evidence.
- Run/Run Step: execution evidence.
- Artifact/task file: produced work or concrete file references.

Runtime output may propose Write Intent. Only Taskplane services apply it.

## Hooks And Gates

This policy must be enforced by deterministic checks:

- context preservation evaluator;
- context transition evaluator;
- task memory coverage check;
- runtime action guard;
- task record worthiness check;
- writeback dispatch validation.

The model may recommend a transition, but hooks decide whether it can proceed.

## Relationship To Native CLIs

Codex CLI, Claude Code, and future API runtimes are execution engines. They may
have their own plan, goal, compact, clear, memory, and skill features.
Taskplane can use those features only when the adapter capability says they are
available and Taskplane can still preserve structured state.

The source of truth remains Taskplane task state, memory, evidence, and
write-intent history.

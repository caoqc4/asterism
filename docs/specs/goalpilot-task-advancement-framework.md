# GoalPilot Business Advancement Framework

Document id: taskplane.task-advancement-framework.v1
Owner: Taskplane product design
Layer: operating-principle / always-loaded business-line advancement router
Load: always in Taskplane-controlled Agent runtime context
Scope: global business-line advancement and Next Action execution routing
Authority: required routing reference; detailed phase rules are loaded on demand
Line budget: keep under 200 lines

## Purpose

GoalPilot is the short, always-loaded business-line advancement layer for Taskplane and the operating reference for product-side movement decisions. It is the single always-loaded product rule for business-line advancement.

It decides how work moves from fuzzy intent to a shaped business line, executable Next Action, verified result, and recoverable record or learning. A Business Line is the durable product object. A Task is the execution unit and Next Action carrier. Legacy task recovery remains supported, but it is not the default product ownership model.

GoalPilot does not contain detailed execution, memory, output, source, or tool rules. Instead, it routes each movement to the smallest needed runtime, rule document, skill, hook, or review path.

Use it silently. Do not show GoalPilot as a checklist unless the user asks why a movement was chosen.

## Core Question

What is the smallest movement that advances this business line, selected Next Action, or one-off request without creating unnecessary structure?

Prefer movement over interrogation. Ask only when missing information blocks the next useful action, changes a key risk, or materially changes the deliverable boundary. If the user has given enough signal, state a reasonable default and move forward through research, shaping, drafting, execution, or verification.

For product, website, documentation, tutorial, or planning tasks, theme, target audience, and content shape are usually enough to advance. Do not keep asking secondary preferences such as private vs public, directory vs learning path, or display style when they can be adjustable defaults in a first draft.

## Rule Hierarchy

Keep authority and load order simple:

- `AGENTS.md` / `CLAUDE.md` are thin native CLI adapters. They point here and should not duplicate product rules.
- GoalPilot is the only always-loaded total rule. It chooses movement and indexes the smallest needed follow-up rule.
- Pilot Decision Contract turns GoalPilot plus priority into message, backend, executor, and gate decisions. Load it when decision shape matters; do not treat it as a second total rule.
- Priority Attention Routing is a phase-loaded ranking skill shared by Brief and Pilot when business lines or Next Actions compete.
- Execution, output, memory, context transition, source/evidence, writeback, and native runtime rules are phase-loaded skills or architecture specs.
- Hooks and gates are deterministic code constraints. If something must always happen, implement it there instead of relying on model memory.

## Control Sequence

Run decisions in this order:

- Identify the scope: business line, global inbox, Next Action / task, running run, correction, handoff, one-off chat, or legacy task recovery.
- If durable work affects a business, product, content channel, workflow, or automation loop and no business line exists, shape or create the business line before treating a task as the owner.
- If multiple business lines or Next Actions compete, load Priority Attention Routing and select the focus before judging advancement.
- If the user clearly selected the current business line or Next Action, do not re-rank the whole pool unless a blocker, risk, or dependency changes the focus.
- For the focus, choose the smallest movement: clarify, research, shape, create business line, choose Next Action, execute, verify, review, persist, learn, hand off, or pause.
- Load the smallest needed rule, skill, runtime, hook, gate, or review path.
- Choose the executor task only after the movement and permission boundary are clear.
- After the movement, stay on this business line, enter a Next Action, return to the parent business line, use legacy task recovery, or stop.

When choosing the movement, ask:

- What is the real business line, or is this a one-off request?
- Which Next Action / task, if any, should carry execution?
- Is the boundary clear enough to act?
- What would count as success or acceptable progress?
- Which uncertainty matters: goal, scope, evidence, execution, risk, ownership, blocker, dependency, source, file, or decision?
- Can source review, web research, files, records, task memory, or runtime tools answer the uncertainty better than asking the user?
- Is the current context clean, or contaminated by another business line, task, stale prompt, unrelated selected file, or previous conversation?

## Context Readiness

Before asking or executing, judge whether the context is clean and sufficient.

Context is sufficient when the business line or one-off scope, Next Action or movement, risk or permission boundary, and recovery source are clear enough for a reversible next step. Missing details are not blockers when they are adjustable defaults or can be learned from files, source review, web research, records, task memory, runtime tools, or a first-pass draft.

Self-research before asking when external facts, product examples, official docs, repository state, prior records, or source evidence can answer the gap. Ask the user only when the answer changes the goal, acceptance boundary, irreversible cost, security/legal/credential boundary, external side effect, or a preference only the user can know.

When context is enough, move. A brief "context is sufficient; starting" status is useful before visible execution, but should not become another planning turn.

## Situation Map

| Situation | Default movement | Load next |
| --- | --- | --- |
| Fuzzy intent | Clarify or Shape | Intake rules; create a business line only if becoming durable. |
| New durable business, product, content channel, workflow, or automation loop | Create business line or Shape | Business shell and memory rules; user confirmation before durable structure. |
| Today suggestion | Choose Next Action or Review | Priority Attention Routing; BusinessLineContextPack; source/risk explanation. |
| Existing business line missing goal, records, owner signal, or next action | Shape | Output contract if responding; memory spec if persisting. |
| Product, website, document, or tutorial with theme, audience, content shape | Research or Shape | Source rules, output contract, or execution rules as needed. |
| Business line too broad for one run | Choose Next Action or Decompose | User confirmation before child/Next Action creation. |
| Next Action active | Shape or Execute | Task-scoped execution rules; do not re-plan the business line unless boundary is wrong. |
| Multiple active business lines or Next Actions compete | Rank and focus | Priority Attention Routing; then selected business/Next Action rules. |
| Research-dependent business line or action | Research | Source rules and selected runtime/tool capabilities. |
| Executable Next Action | Execute | Agent operating principles and runtime/tool rules. |
| Long-running executable action with clear stop condition | Execute through persistent goal capability when available | Native runtime orchestration, run goal contract, verification gates. |
| Blocked, waiting, risky, or decision-bound | Pause or Decision | Decision/checkpoint hooks. |
| Work produced | Verify or Review | Verification/review rules; capture business record when useful. |
| Post-action review or user correction | Review or Learn | Business records, review, and learning/SOP proposal gates. |
| Learning or SOP update proposed | Learn or Decision | Learning/SOP revision gate; Decisions for risky updates. |
| Scheduler loop, automation, or sensor signal | Review, Propose, or Execute | Scheduler/loop rules and standing approval gates. |
| Legacy project/routine task | Legacy task recovery or Choose Next Action | Compatibility adapter; recover business line before durable writes when possible. |
| Stable pause, closeout, or handoff | Persist or Handoff | Memory spec and context transition policy. |

This map is a starting point, not a script.

## On-Demand References

GoalPilot chooses when these documents or flows matter:

- Agent Operating Principles: load for concrete execution, runtime runs, subagents, tool use, state mutation, and completion claims.
- Agent Output Contract: load when rendering chat, progress cards, drafts, proposals, run summaries, verification results, or user-facing files.
- Task Memory Spec: load when reading/writing business or task memory, switching focus, clearing context, closing a phase, or deciding if recovery is sufficient.
- Context Transition Policy: load when compacting, resetting, clearing, handing off, switching tasks, starting a new conversation, or proving that useful chat context has been preserved.
- Pilot Decision Contract: load when defining Pilot role, message priority, DecisionBackend choice, executor routing, or matrix-runtime delegation.
- Priority Attention Routing: load when Brief or Pilot must rank competing business lines, Next Actions, blockers, decisions, dependencies, artifacts, or completion chances.
- Native Agent Capability Mapping: load when aligning Codex or Claude Code plan, goal, memory, compact, skills, hooks, subagents, status, or review capabilities to Taskplane product states.
- Source / evidence rules: load when research, citations, source contexts, freshness, credibility, or external facts affect the task.
- Decision Layer Writeback Orchestration: load when runtime evidence must become Write Intent, proposal cards, memory/source/decision updates, or feature impact audit entries.
- Native Agent Runtime Orchestration: load when changing CLI/API runtime architecture, DecisionBackend, persistent goal capability, progress projection, or adapter boundaries.
- Work Habits: retrieve only applicable confirmed habits; do not treat habits as global prompt bulk.

## Persistence And Write Intent

Conversation is temporary working context. Persist only when the information changes future recovery, execution, evidence, or user decisions.

Durable writes must go through Taskplane services and confirmation gates where required. Runtime output can propose Write Intent; it cannot directly mutate Taskplane structured data.

Use the smallest durable surface:

- Structured task state for current status, hierarchy, blockers, dependencies, criteria, and next step of the execution unit / Next Action.
- Business Records for durable business-line memory, review, and rationale.
- Learning/SOP revisions for reusable business-line behavior after review.
- Task.md and Task Records for active Next Action execution memory and legacy task recovery.
- Source Context for evidence and research material.
- Decisions for user approval boundaries.
- Artifacts and task files for work products.

## Context Transition Decision

Before compacting, resetting, switching business lines or Next Actions, advancing a child task, or starting a new conversation, first classify the current chat: temporary noise, active reasoning, recoverable signal, handoff, or decision/blocker.

GoalPilot owns this trigger decision. If useful signals exist, load Context Transition Policy and require a preservation proof before reset or handoff. If only low-signal repetition exists, keep or continue rather than exposing mode choices. Do not carry business line A or task A chat history into business line B or task B as if it were durable memory.

## Verification And Review

Do not treat generated text, a run result, or an obvious next action as proof that the business line is healthy or the current execution task is complete.

Before closeout, verify against acceptance criteria, user intent, blockers,
dependencies, pending decisions, risk, produced files, sources, and evidence.

Use review/eval after failures, repeated user corrections, risky writes, runtime adapter changes, or task-completion decisions. Feed lessons into the right layer: memory, scoped rule, skill, hook, or test.

## Anti-Patterns

- Loading every spec for every turn.
- Asking for secondary preferences instead of drafting a reversible default.
- Executing before goal, boundary, context, or permission is sufficient.
- Treating "need more context" as a reason to ask before trying available self-research, files, memory, or runtime tools.
- Re-planning a business line when the user is advancing a clear Next Action.
- Completing a business line or task because a next action is obvious.
- Treating a task queue as the durable product model.
- Treating a runtime-native goal loop as Taskplane's source of truth.
- Keeping must-follow rules only in prompt text instead of hooks.

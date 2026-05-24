# Pilot Decision Contract

Document id: `taskplane.pilot-decision-contract.v1`
Owner: Taskplane product architecture
Layer: phase-loaded architecture skill / Pilot role contract
Load: Pilot routing, multi-task focus, message priority, executor selection,
DecisionBackend selection, escalation, and run handoff
Scope: GoalPilot, Brief priority routing, native CLI/API runtimes, future
matrix executors, human review
Authority: implementation-guiding; Taskplane gates and write services remain
authoritative

## Purpose

Pilot is Taskplane's product-side decision posture. It is not a currently separate always-running agent. It judges and coordinates; it does not own durable state and does not replace executor runtimes.

The role is always available at the product-control layer, but this document is
not a second always-loaded total rule. Pilot composes GoalPilot movement with
Priority Attention Routing, message priority, backend choice, executor choice,
and gates.

A Pilot decision can be produced by rules, an Agent API call, a Codex CLI
decision run, a Claude CLI decision run, a future matrix runtime, or human
review behind one `DecisionBackend` contract.

## Operation Model

Pilot is always present as product control logic, not as a default background
model process.

| Mode | Meaning | Current status |
| --- | --- | --- |
| `product_control_layer` | Deterministic rules, product state, hooks, gates, and human review decide the route. | Default. |
| `bounded_decision_backend` | A short API/CLI/matrix decision backend may assist an ambiguous Pilot decision. | Allowed when explicitly selected by capability. |
| `persistent_ai_pilot_reserved` | A long-lived AI Pilot watches tasks and coordinates proactively. | Future opt-in only; not returned by the current evaluator. |

Do not implement or imply a persistent AI Pilot unless the product has explicit
watch/autopilot mode, cost controls, permission gates, event replay, and user
visibility.

## Role Split

| Role | Owns | Does not own |
| --- | --- | --- |
| Pilot | route, priority, context readiness, message priority, executor choice, escalation, verification posture | direct task mutation or long task execution |
| Executor | concrete work through Codex, Claude, API, matrix runtime, tool run, or human action | Taskplane state authority |

This is a dual-role product model, not a mandatory two-agent or two-process architecture. The first implementation may run Pilot as rules plus bounded decision calls.

## Phase 2 Bounded Decision

Phase 2 means rules still decide first. A bounded backend is requested only
when the rule layer sees a coordination trigger:

- competing tasks need priority selection;
- the user is steering or correcting the current path;
- a blocked state is ambiguous but a runtime can inspect context;
- a task has context but no usable priority lane.

The backend gets one short Pilot preflight, not an open-ended conversation. It
must decide route before acting, prefer the next reversible step when context
is enough, research or inspect public/source-derived gaps before asking, and
ask only for user-owned boundaries. Durable state still returns as proposal or
evidence.

Each decision carries a `backendPlan` with status, backend, triggers,
`maxTurns=1`, and `outputContract=pilot_decision_summary`. If no model backend
is usable, the status is `fallback_to_rules` or `human_review`; Taskplane does
not silently invent another runtime.

## Pilot Decision Contract

A Pilot decision should answer:

- What movement should happen next: ask, research, shape, decompose, execute,
  verify, persist, handoff, or pause?
- Is the user message a follow-up, steer, or escalation?
- Which priority lane applies when tasks compete?
- Which executor should handle the next action?
- Which product rules, hooks, gates, and evidence surfaces are required?
- Which operation mode is being used: product control layer, bounded decision
  backend, or future reserved persistent Pilot?
- Should a model-backed decision backend be used, or are deterministic rules
  enough?

Pilot output is evidence and routing intent. It may create Write Intent
candidates, but it must not persist product state directly.

## Decision Backends

Supported backend kinds:

- `rules`: deterministic evaluators and gates.
- `agent_api`: future or configured API evaluator.
- `codex_cli`: bounded Codex CLI decision run.
- `claude_cli`: bounded Claude Code decision run.
- `wanman_matrix`: future matrix-level coordinator evidence.
- `human_review`: user-owned decision or unresolved ambiguity.

Backend choice is capability-based. If only CLI is available, Pilot may use CLI.
If only API is available, Pilot may use API. If neither is available, Pilot
falls back to rules or human review instead of writing silently.

## Message Priority

Pilot should classify incoming user messages:

| Priority | Meaning | Default handling |
| --- | --- | --- |
| `follow_up` | Adds context or continues the current path. | Queue into current task/run path. |
| `steer` | Corrects, interrupts, cancels, or changes direction. | Stop or redirect current run when possible; preserve correction evidence. |
| `escalate` | Touches user-owned boundary, high risk, credentials, money, legal, deploy, delete, or security. | Pause automation and require confirmation or Decision. |

This classification is a product event, not just chat tone.

## Executor Selection

Executor choice is separate from Pilot backend choice:

- local rule for purely product-side checks;
- human for user-owned decisions or approval;
- Codex or Claude CLI for code/repo-native execution;
- Agent API for lightweight provider execution;
- matrix runtime for multi-agent mission-internal execution when available.

Future matrix executors are delegated mission engines. Taskplane remains the
mission control layer that verifies outcome evidence.

## Wanman Reference Boundary

Wanman-style coordinators usually coordinate multiple agents inside one
mission. Taskplane Pilot coordinates across tasks and missions first, then may
delegate one selected mission to a matrix executor.

Do not turn GoalPilot into an agent matrix runtime. Reserve `wanman_matrix` as
an executor backend while keeping Taskplane's task, evidence, decision, and
memory authority.

## Hooks And Gates

Pilot cannot bypass:

- runtime entrypoint gates;
- priority and escalation boundaries;
- context readiness and context transition gates;
- write-intent validation;
- confirmation requirements;
- completion verification;
- task memory coverage;
- service-level write authorization.

If a Pilot rule must always hold, implement it as a deterministic evaluator,
hook, gate, or test.

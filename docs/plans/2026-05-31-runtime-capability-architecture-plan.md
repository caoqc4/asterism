# Runtime Capability Architecture Plan

Date: 2026-05-31
Status: Draft plan
Owner: Taskplane product architecture

## Purpose

Taskplane has finished the business-line-first rule and implementation migration. The next large goal is not to redesign business lines again. It is to clarify and harden the AI capability architecture so future execution, coordination, scheduling, and writeback work does not drift back into the original unfinished Agent API-first path.

This plan defines the technical direction:

```text
Taskplane owns business lines, Next Actions, memory, decisions, verification, and writes.
Agent CLI runtimes are the first production execution layer.
Agent API remains a same-level future runtime, promoted only through evidence gates.
Pilot / scheduler / coordination are Taskplane control-layer decisions that may use AI backends, but they are not themselves durable state owners.
```

## Current Assessment

The user's product-level understanding is mostly correct:

- The first shippable AI execution capability should be native Agent CLI, especially Codex CLI and Claude Code.
- Agent API was part of the early design and has partial infrastructure, but complete provider-visible execution is still deferred by the product audit.
- The product can expose multiple AI capability schemes, but the first version should not promise equal API/CLI parity.
- Runtime, coordination, scheduler, writeback, and review still need strong architecture, even if the first concrete executor is CLI.
- Coordination may use AI, and when it does, it should prefer the user's selected Agent capability scheme if that scheme can safely satisfy the movement.

The technical correction is important:

```text
"User selected Agent scheme" is the default AI capability source.
"Pilot selected decision backend" is a scoped use of that capability for one movement.
```

A user may choose Codex CLI, Claude Code, or Agent API as the default Agent scheme. When research, shaping, review, decision assistance, scheduler analysis, or task execution needs AI, Taskplane should first try to use the selected scheme through the relevant capability gate. If the selected scheme cannot safely satisfy that movement, Taskplane should either use deterministic rules, ask for user confirmation to use a fallback, or pause with a clear unsupported-capability reason. It should not silently switch AI schemes.

Rules are still the first control layer, but "rules first" means rules decide whether AI is needed and which gate applies. It does not mean non-execution phases are forced to a fixed backend that ignores the user's selected Agent scheme.

## Product Roles

### 1. Taskplane Control Plane

Owns durable product truth:

- Business Lines
- Next Actions / Tasks as execution carriers
- Business Records
- Task Records
- Source Context
- Decisions
- SOP revisions
- Run records and verification
- Write gates and confirmation

No runtime should mutate this state directly.

### 2. Pilot / Coordination Layer

Owns routing and judgment, not durable state:

- What business line needs attention?
- Is the current message a follow-up, steer, escalation, or one-off?
- Is the next movement clarify, research, shape, execute, verify, review, persist, learn, handoff, or pause?
- Which executor should run the concrete work?
- Which gates are required before durable writes?

Pilot can be implemented with deterministic rules first. When a routing problem needs AI assistance, Pilot should use the user's selected Agent scheme if that scheme supports the required decision, research, or review capability. A fallback backend must be explicit, visible, and permissioned. Pilot should not become a persistent autonomous AI manager in the first version.

### 3. Runtime Layer

Owns concrete execution and returns evidence:

- `codex` Agent CLI
- `claude` Agent CLI
- future `agent_api`
- future `wanman_matrix` or other delegated mission engines

Runtime output is evidence. It may propose Write Intent. It does not own Taskplane state.

### 4. Writeback / Review Layer

Converts runtime evidence into product changes:

- parse Write Intent
- validate business-line owner and target task identity
- create proposal / apply plan
- require confirmation or Standing Approval
- persist through Taskplane services
- create review and learning/SOP proposals

This is the real closed loop. It must stay runtime-neutral.

## Runtime Selection Model

Runtime selection should be modeled as capability-based routing, not a single global if/else.

### User Default Runtime

The user can choose a default runtime mode:

- `codex`
- `claude`
- `api`

For the first production slice, `codex` and `claude` are the supported execution runtimes. If the user selects `api`, Agent API can be used only for the phases that are currently supported by evidence gates. Provider-visible task execution remains gated. The product should display this as a capability limitation, not silently reroute execution to another scheme.

### Movement-Specific Runtime Need

Every movement should declare its need:

```ts
type RuntimeNeed =
  | "none"
  | "decision"
  | "read_only_execution"
  | "task_execution"
  | "decomposition"
  | "writeback_interpretation"
  | "review"
  | "scheduler_loop";
```

The selected backend should answer:

- Can the user's default runtime satisfy this need?
- If yes, which gate and context manifest are required?
- If not, can deterministic rules solve the movement without model execution?
- If a different AI scheme would be useful, has the user explicitly allowed that fallback?
- Does using the selected or fallback backend require user-visible confirmation?

### Backend Selection Is Not State Mutation

A backend choice can produce:

- route decision
- run plan
- context readiness result
- proposal
- evidence
- blocked reason

It cannot directly create Business Records, update tasks, approve Decisions, or mark completion.

## First-Version Architecture Principle

The first production target should be:

```text
CLI-first, API-aware, runtime-neutral.
```

Meaning:

- The harness must not be hardcoded to Codex-only or Claude-only.
- The product can display Agent API as a future same-level runtime.
- But the happy path should use Agent CLI execution because it already has real local evidence and mature native behavior.
- Agent API should not be promoted by UI availability or provider configuration alone.
- Any future Agent API execution must pass the same context, task identity, writeback, verification, and run evidence gates as CLI.

## What The 29-Hour Goal Likely Did Wrong

The previous long-running goal probably tried to close too many layers at once:

- complete future Agent API execution;
- finish writeback evidence;
- repair patch promotion;
- update audit language;
- maybe touch scheduler or decomposition;
- while the product architecture was still task-first.

That made it easy to spend time proving partial future API readiness rather than shipping a coherent CLI-first product loop.

The corrected strategy is:

```text
Do not promote all Agent API paths.
Do not build a persistent AI Pilot.
Do not expand scheduler automation first.
Make the runtime harness and coordination contract runtime-neutral.
Use the selected Agent scheme for every AI-assisted movement when capability gates allow it.
Deepen the CLI-first path as the first production-ready scheme.
```

## Architecture Targets

### Target A: Runtime-Neutral Harness

All execution paths should share a neutral contract:

```text
Business Line
-> Next Action / one-off scope
-> Pilot route decision
-> runtime need
-> selected backend
-> context pack
-> run
-> evidence
-> write intent / review / verification
-> durable write through Taskplane services
```

The code should avoid embedding "Agent API" or "Codex CLI" as product concepts where the concept is really "execution runtime", "decision backend", or "writeback interpreter".

### Target B: CLI-First Execution

For first release, the main run path should be:

```text
RightPanel / Business Next Action
-> RunService
-> selected Agent CLI runtime
-> Run steps and terminal evidence
-> Write Intent proposal
-> confirmation / approval
-> Business Record / Task Record / Source Context / Decision / SOP proposal
-> post-run review
```

This path should be product complete before Agent API parity is attempted.

### Target C: Bounded Coordination

Pilot should have these modes:

- `product_control_layer`: default deterministic rules and gates.
- `bounded_decision_backend`: one short AI-assisted decision when the route is ambiguous, using the selected Agent scheme when supported.
- `persistent_ai_pilot_reserved`: future, not first release.

The selected Agent scheme should be the default AI backend for Pilot assistance. Pilot must still record the backend, reason, gate, and any fallback. Deterministic rules and human review are not alternate AI schemes; they are non-model control paths.

### Target D: Scheduler As Business-Line Loop Carrier

Scheduler should not become its own product owner. It should observe or trigger business-line loops:

- sensor: read-only observation;
- automation: bounded action;
- scheduled/event task: execution carrier;
- standing approval: explicit gate;
- review: post-run evidence and next suggestion.

Scheduler can use CLI first. Future API scheduler paths stay deferred unless they pass the same run and writeback gates.

### Target E: Agent API Promotion Path

Agent API is not removed. It is kept as a same-level future runtime with strict promotion gates:

- selected runtime/provider identity
- configured provider identity
- target task and business-line owner
- provider-visible preflight
- context manifest
- context readiness
- Write Intent extraction
- operator confirmation / Standing Approval
- post-run verification
- run evidence persistence

Do not promote "API configured" into "API execution ready".

## Non-Goals

- Do not build a persistent autonomous Pilot now.
- Do not route all coordination through Agent API.
- Do not make scheduler the source of business truth.
- Do not make Task Records or Task.md the primary business memory again.
- Do not hide Agent API entirely; show it as same-level but partial/gated.
- Do not require API parity before shipping CLI-first execution.

## Step Plan

### Runtime Architecture Goal 0: Capability Boundary Audit

#### Objective

Audit whether the current implementation clearly separates:

- user runtime mode;
- execution runtime;
- Pilot decision backend;
- scheduler loop carrier;
- writeback interpreter;
- provider capability probe.

#### Acceptance

- A concrete drift appendix is added to this plan or a related audit doc.
- Each drift is classified as aligned, naming drift, compatibility adapter, needs code boundary, or should not change now.
- No product behavior changes.

#### Verification

```bash
rg -n "runtimeMode|DecisionBackend|backendPlan|agent_api|codex|claude|executionRuntime|Pilot|Scheduler|Write Intent" src/main src/shared src/renderer docs/specs
npm run audit:product-progress -- --next
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Runtime Architecture Goal 0 only - capability boundary audit.

Read:
- AGENTS.md
- docs/specs/goalpilot-task-advancement-framework.md
- docs/specs/native-agent-runtime-orchestration.md
- docs/specs/native-agent-capability-mapping.md
- docs/specs/pilot-decision-contract.md
- docs/specs/decision-layer-writeback-orchestration.md
- docs/plans/2026-05-31-runtime-capability-architecture-plan.md

Inspect code and docs for drift between:
- user runtime mode
- execution runtime
- Pilot decision backend
- scheduler loop carrier
- writeback interpreter
- provider capability probe

Update the plan with an audit appendix. Classify each finding as aligned, naming drift, compatibility adapter, needs code boundary, or should not change now.

Do not change product behavior. Stop at a checkpoint.
```

### Runtime Architecture Goal 1: Runtime Need And Backend Taxonomy

#### Objective

Introduce or consolidate shared terminology for runtime needs and backend choices so code does not treat `runtimeMode` as the answer to every AI decision.

#### Acceptance

- Shared types or evaluators distinguish `RuntimeNeed`, `ExecutionRuntime`, and `DecisionBackend`.
- Existing code continues to support `codex`, `claude`, and `api`.
- Tests prove that the selected Agent scheme is preferred for AI-assisted phases when supported, rules/human review can still resolve non-model control decisions, and API configuration does not imply API execution readiness.

#### Verification

```bash
npm test -- src/shared src/main/domain/decision src/main/domain/run -t "runtime|backend|Pilot|Agent API|CLI"
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Runtime Architecture Goal 1 only - runtime need and backend taxonomy.

Add the smallest shared taxonomy needed to separate:
- user default runtime mode
- execution runtime
- Pilot decision backend
- provider capability probe

Preserve existing behavior. Do not promote Agent API execution. Do not rename user-facing product broadly.

Add focused tests proving:
- The selected Agent scheme is preferred for AI-assisted movement when capability gates allow it.
- CLI-first remains the supported production execution path.
- Agent API remains same-level but gated.
- Pilot backend selection records the selected scheme, gate, and fallback instead of silently switching schemes.

Run focused tests, lint, build:main, and git diff --check. Stop at a checkpoint.
```

### Runtime Architecture Goal 2: CLI-First Harness Readiness

#### Objective

Make the main first-release execution loop explicitly CLI-first and runtime-neutral.

#### Acceptance

- RightPanel and Business Next Action execution can explain selected Agent CLI runtime, context pack, business-line owner, Next Action carrier, and evidence writeback path.
- Agent API remains visible as partial/gated when selected.
- Product audit continues to show CLI P0 ready and future API deferred.

#### Verification

```bash
npm test -- src/main/domain/run/run-service.test.ts src/renderer/App.test.tsx src/renderer/pages/BusinessLinesPage.test.tsx -t "business line|runtime|CLI|RightPanel|Next Action"
npm run audit:product-progress -- --next
npm run lint
npm run build
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Runtime Architecture Goal 2 only - CLI-first harness readiness.

Make the user-visible and service evidence path explicit for first-release Agent CLI execution:
- selected CLI runtime
- businessLineId
- Next Action / task carrier
- context pack
- run evidence
- Write Intent proposal
- post-run review

Do not broaden Agent API execution. If runtimeMode=api appears, it must remain partial/gated for task execution unless existing readiness gates pass.

Update tests and audit evidence only as needed. Stop at a checkpoint.
```

### Runtime Architecture Goal 3: Bounded Pilot Backend Contract

#### Objective

Ensure coordination can use AI without becoming a hidden persistent agent.

#### Acceptance

- Pilot decision records include operation mode, backend, trigger, max turns, fallback, and executor choice.
- Rules are default. Bounded AI decision backend is opt-in per ambiguous decision.
- No persistent Pilot/autopilot loop is introduced.

#### Verification

```bash
npm test -- src/main/domain/decision src/shared -t "Pilot|DecisionBackend|bounded|product_control_layer|persistent_ai_pilot_reserved"
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Runtime Architecture Goal 3 only - bounded Pilot backend contract.

Harden the Pilot decision backend boundary:
- product_control_layer is default
- bounded_decision_backend may use CLI/API/rules/human review when explicitly selected
- persistent_ai_pilot_reserved remains future-only
- backend choice is recorded as evidence, not durable state mutation

Do not implement persistent Pilot. Do not expand scheduler automation. Stop at a checkpoint.
```

### Runtime Architecture Goal 4: Scheduler Loop Backend Boundary

#### Objective

Clarify scheduler as business-line loop carrier, not product owner.

#### Acceptance

- Scheduled/event/routine tasks resolve business-line owner before durable writes.
- Scheduler proposals use Decision/Standing Approval gates.
- CLI-first scheduled execution remains supported.
- Future API scheduler remains deferred unless existing gates pass.

#### Verification

```bash
npm test -- src/shared/agent-orchestration.test.ts src/shared/scheduler-decision-proposal.test.ts src/main/domain/business-line/business-line-service.test.ts -t "business-line loop|scheduler|standing approval|scheduled|event"
npm run audit:product-progress -- --next
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Runtime Architecture Goal 4 only - scheduler loop backend boundary.

Ensure scheduler/sensor/automation paths remain business-line loop carriers:
- resolve businessLineId
- carry execution through Next Action/task when needed
- require Standing Approval or Decision gate for mutation
- keep CLI-first execution supported
- keep future API scheduler paths deferred unless all readiness gates pass

Do not turn scheduler into a separate product owner. Stop at a checkpoint.
```

### Runtime Architecture Goal 5: Agent API Deferred Contract Cleanup

#### Objective

Keep Agent API visible and configurable without implying production readiness for task execution.

#### Acceptance

- Agent API UI/status distinguishes configured, partial, read-only/proposal-capable, and execution-ready.
- Product audit remains strict: provider configuration does not equal execution readiness.
- Right-panel / decomposition / patch apply future API gaps remain explicit until each evidence chain is real.

#### Verification

```bash
npm test -- src/shared/product-feature-impact-audit.test.ts src/shared/capability-registry.test.ts src/renderer/App.test.tsx -t "Agent API|runtime|deferred|readiness|configured"
node scripts/agent-api-promotion-readiness-smoke.mjs
node scripts/agent-api-decomposition-promotion-readiness-smoke.mjs
npm run audit:product-progress -- --next
npm run lint
npm run build
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Runtime Architecture Goal 5 only - Agent API deferred contract cleanup.

Keep Agent API as a same-level future runtime, but make its partial/gated state explicit:
- configured provider is not execution readiness
- provider tool/search probe is not task execution readiness
- right-panel execution, decomposition, scheduler, and patch apply each need separate evidence chains

Do not remove Agent API. Do not promote it globally. Stop at a checkpoint.
```

### Runtime Architecture Goal 6: Closeout Audit

#### Objective

Verify the architecture now supports CLI-first execution while keeping API-later and coordination boundaries clean.

#### Acceptance

- Product audit still reports CLI P0 ready.
- Business-line-first checks remain ready.
- Agent API future deferred items are explicit and not confused with first-release blockers.
- No test expectation still says task-first product ownership.

#### Verification

```bash
npm run audit:product-progress -- --next
npm run lint
npm run build
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Runtime Architecture Goal 6 only - closeout audit.

Verify the runtime capability architecture after Goals 0-5:
- CLI-first execution is the first-release path.
- Agent API remains same-level but partial/gated.
- Pilot coordination is bounded and backend-neutral.
- Scheduler is a business-line loop carrier.
- Writeback stays product-controlled.

Fix only audit/test/doc drift. Do not start a new feature. Stop at a checkpoint.
```

## Recommended Execution Order

Run these goals in order:

1. Goal 0: capability boundary audit
2. Goal 1: taxonomy
3. Goal 2: CLI-first harness readiness
4. Goal 3: bounded Pilot backend
5. Goal 4: scheduler loop backend
6. Goal 5: Agent API deferred contract cleanup
7. Goal 6: closeout audit

If any goal starts touching unrelated UI polish, broad rename, full API execution, or persistent AI Pilot, stop and checkpoint.

## Success Criteria

This architecture track is complete when:

- first-release AI execution clearly runs through Agent CLI;
- Runtime selection is configurable but capability-gated;
- Agent API is visible as future/partial without being mistaken for ready task execution;
- coordination can use AI as a bounded backend but defaults to product rules;
- scheduler loops carry business-line actions rather than owning product state;
- all durable writes flow through Taskplane Write Intent, service validation, and confirmation gates.

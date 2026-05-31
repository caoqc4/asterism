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

## Reference Review

This plan intentionally borrows architecture patterns without copying another
product's product model.

### OpenClaw / Pi Agent

Reference:

- `https://docs.openclaw.ai/pi`
- `https://www.openclawbook.xyz/en/ch01-understanding-openclaw/1.2-core-architecture-overview`

Relevant pattern:

- A runtime/gateway layer can unify external agent backends and tool access.
- The gateway should own backend capability routing, not product memory.
- If copied too literally, this becomes a platform rebuild before Taskplane has
  shipped its first complete product loop.

Taskplane take:

```text
Keep a thin Agent Capability Gateway.
Do not build a full Pi-style runtime platform now.
```

### Multica / Local Daemon Native CLI Pattern

Reference:

- `https://multica.ai/docs/how-multica-works`

Relevant pattern:

- A local daemon can run native coding agents, preserve their strengths, and
  expose them through a product surface.
- This validates the CLI-first move: native CLIs already implement many hard
  runtime behaviors better than Taskplane can rebuild quickly.

Taskplane take:

```text
Use Codex CLI / Claude Code as first production runtimes.
Taskplane should provide context, scope, gates, and writeback.
It should not reimplement the inner agent loop first.
```

### Claude / Codex Native Agent Layering

References:

- `https://code.claude.com/docs/en/features-overview`
- `https://code.claude.com/docs/en/skills`
- `https://code.claude.com/docs/en/hooks`
- `https://code.claude.com/docs/en/sub-agents`
- `https://developers.openai.com/codex/cli`

Relevant pattern:

- Mature native agent environments separate memory, project rules, scoped rules,
  skills, tools, hooks, subagents, and review/eval.
- The key lesson is not "put everything in one prompt". The lesson is to place
  each type of instruction or constraint at the layer where it belongs.

Taskplane take:

```text
Taskplane product rules live in specs, services, gates, and tests.
Runtime-specific adapters translate those rules into AGENTS.md / CLAUDE.md /
skills / hooks / CLI arguments only when needed.
```

### MCP

Reference:

- `https://modelcontextprotocol.io/docs/getting-started/intro`

Relevant pattern:

- MCP is a standard connector/tool protocol.
- It should not become the product's business memory or permission model.

Taskplane take:

```text
MCP is capability plumbing.
Business-line ownership, write gates, and decisions remain Taskplane-owned.
```

### AIHero Handoff

Reference:

- `https://www.aihero.dev/skills-handoff`

Relevant pattern:

- Handoff is useful because it compresses a session into a portable context
  packet for another agent/session.
- Raw transcript transfer is less useful than typed recovery: objective,
  decisions, constraints, changed files, evidence, blockers, and next steps.

Taskplane take:

```text
Handoff is a typed recovery artifact.
It may become a Business Record, Next Action handoff, or runtime/subagent
handoff, but it should not bypass Taskplane write gates.
```

### Wanman-Style Coordination

Reference:

- Current public material is treated as product inspiration rather than a
  dependency. The useful idea is a matrix/coordination layer that can route work
  across multiple workers.

Relevant pattern:

- A matrix runtime is useful for delegated missions.
- It is dangerous if it becomes the product's source of truth.

Taskplane take:

```text
Taskplane coordination is multi-task / multi-business-line coordination.
Wanman-style matrix execution is a future runtime backend below Pilot, not the
default control layer.
```

### YC Self-Improving Company Frame

Reference:

- User-provided YC notes on AI-native and self-improving companies.

Relevant pattern:

- The durable asset is business context, not the software shell on top.
- Loops improve when sensors, decisions, tools, gates, and learning are closed.

Taskplane take:

```text
The product loop is:
Business Line -> Context -> Next Action -> Runtime Evidence -> Review ->
Business Record / SOP Revision -> Better Next Action.
```

Do not overbuild an autonomous company brain. First prove one business line can
learn from one completed action.

## Revised Architecture Thesis

The previous implementation had two competing instincts:

1. build a full runtime gateway and Agent API/native-agent platform;
2. ship quickly by leaning on native CLI runtimes.

The revised thesis is a synthesis:

```text
Taskplane should build a product control plane plus a thin Agent Capability
Gateway. The gateway routes AI-assisted movements to the user's selected agent
scheme when that scheme has the required capability. Native CLIs are the first
production runtimes. Agent API and matrix runtimes remain same-level future
backends behind explicit capability and evidence gates.
```

This prevents two failure modes:

- overbuilding a gateway before the product loop is proven;
- hardcoding Codex/Claude CLI so deeply that future API or matrix backends
  require another rewrite.

## Agent Capability Stack

Taskplane's bottom-layer agent architecture should be expressed as seven layers.

### Layer 1: Product Control Plane

Owns:

- Business Lines
- Next Actions / execution carriers
- Business Records
- Source Context
- Decisions
- SOP revisions
- Runs, reviews, verification, write gates

This layer is not replaceable by a runtime.

### Layer 2: Agent Capability Gateway

Owns runtime-neutral capability selection:

- user-selected agent scheme;
- runtime need;
- capability probe;
- fallback policy;
- context manifest;
- permission/write boundary;
- evidence contract.

This is not a heavy runtime platform. It is a typed gateway that answers:

```text
Can the selected scheme safely satisfy this movement now?
What context is allowed?
What may it do?
What evidence must come back?
What write gate applies?
```

### Layer 3: Runtime Adapters

Own concrete invocation details:

- Codex CLI adapter;
- Claude Code adapter;
- future Agent API adapter;
- future matrix-runtime adapter.

Adapters may translate Taskplane context into native runtime affordances:

- `AGENTS.md` / project rules;
- `CLAUDE.md`;
- native skill references;
- CLI flags;
- MCP server availability;
- hooks;
- subagent instructions;
- compact / resume / handoff packets.

Adapters do not own durable Taskplane state.

### Layer 4: Capability Scaffolding

Owns what the selected runtime can access:

- MCP tools;
- skills;
- external access connectors;
- local file scopes;
- browser / computer-use permissions;
- hooks and deterministic pre/post checks.

These are mostly global capabilities with per-action and per-business-line
scope gates. Do not create a full per-business-line MCP/runtime matrix unless a
real permission problem appears.

### Layer 5: Coordination / Pilot

Owns bounded routing decisions:

- clarify;
- research;
- shape;
- decompose;
- execute;
- verify;
- persist;
- review;
- handoff;
- pause.

Rules are default. AI-assisted routing is allowed only as a bounded movement
through the Agent Capability Gateway. The selected user agent scheme should be
preferred when it can satisfy the need. Fallbacks must be explicit and visible.

### Layer 6: Scheduler / Loop Carrier

Owns time/event triggering as a carrier, not product truth:

- sensors;
- scheduled routines;
- event triggers;
- standing approval checks;
- readiness gates;
- post-run review triggers.

Scheduler should create or carry business-line Next Actions. It should not
mutate durable business state without the same write gates as interactive runs.

### Layer 7: Evaluation / Review / Learning

Owns closed-loop improvement:

- interpret runtime evidence;
- create Business Records;
- propose or apply Next Actions;
- propose SOP revisions;
- send risky changes to Decisions;
- produce typed handoff packets;
- update future context only after acceptance.

This layer is the product's main differentiation. Runtime execution is useful,
but durable learning is the moat.

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

## Detailed Step Plan

Use this detailed queue for the next implementation pass. It supersedes the
legacy coarse goal queue later in this document.

### Architecture Goal 0: Boundary Drift Audit

#### Objective

Audit current code and docs against the seven-layer stack:

- Product Control Plane
- Agent Capability Gateway
- Runtime Adapters
- Capability Scaffolding
- Pilot / Coordination
- Scheduler / Loop Carrier
- Evaluation / Review / Learning

#### Acceptance

- Add or update an implementation drift appendix.
- Classify each finding as:
  - aligned;
  - naming drift;
  - compatibility adapter;
  - needs gateway boundary;
  - needs runtime adapter change;
  - needs UI wording change;
  - should not change now.
- No product behavior changes.

#### Verification

```bash
rg -n "runtimeMode|DecisionBackend|backendPlan|agent_api|codex|claude|executionRuntime|Pilot|Scheduler|Write Intent|BusinessLineContextPack|handoff|MCP|skills|capability" src/main src/shared src/renderer docs/specs docs/plans
npm run audit:product-progress -- --next
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Architecture Goal 0 only - boundary drift audit.

Read:
- AGENTS.md
- docs/specs/goalpilot-task-advancement-framework.md
- docs/specs/native-agent-runtime-orchestration.md
- docs/specs/native-agent-capability-mapping.md
- docs/specs/pilot-decision-contract.md
- docs/specs/decision-layer-writeback-orchestration.md
- docs/specs/task-memory-spec.md
- docs/specs/context-transition-policy.md
- docs/plans/2026-05-31-runtime-capability-architecture-plan.md

Audit the current implementation against the seven-layer architecture:
1. Product Control Plane
2. Agent Capability Gateway
3. Runtime Adapters
4. Capability Scaffolding
5. Pilot / Coordination
6. Scheduler / Loop Carrier
7. Evaluation / Review / Learning

Update the plan with an implementation drift appendix. Classify findings as aligned, naming drift, compatibility adapter, needs gateway boundary, needs runtime adapter change, needs UI wording change, or should not change now.

Do not change product behavior. Stop at a checkpoint.
```

### Architecture Goal 1: Agent Capability Gateway Taxonomy

#### Objective

Introduce the smallest shared taxonomy that prevents `runtimeMode` from being
used as the answer to every AI capability question.

#### Acceptance

- Shared code distinguishes:
  - user-selected agent scheme;
  - runtime need;
  - execution runtime;
  - decision backend;
  - capability probe;
  - fallback policy;
  - permission/write gate.
- The selected user agent scheme is preferred for AI-assisted movement when it
  can satisfy the required capability.
- Deterministic rules and human review remain valid non-model control paths.
- Agent API configuration does not imply task execution readiness.
- Fallback is explicit, visible, and recorded.

#### Verification

```bash
npm test -- src/shared src/main/domain/decision src/main/domain/run -t "runtime|backend|Pilot|Agent API|CLI|capability|fallback|selected scheme"
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Architecture Goal 1 only - Agent Capability Gateway taxonomy.

Add the smallest shared taxonomy needed to separate:
- user-selected agent scheme
- runtime need
- execution runtime
- Pilot decision backend
- provider capability probe
- fallback policy
- write/permission gate

Preserve existing behavior. Do not promote Agent API execution. Do not rename user-facing product broadly.

Add focused tests proving:
- The selected Agent scheme is preferred for AI-assisted movement when capability gates allow it.
- CLI-first remains the supported production execution path.
- Agent API remains same-level but gated.
- Rules/human review remain valid non-model control paths.
- Fallback is explicit and recorded instead of silently switching schemes.

Run focused tests, lint, build:main, and git diff --check. Stop at a checkpoint.
```

### Architecture Goal 2: Native CLI Adapter Contract

#### Objective

Make native CLI execution an explicit adapter contract, not ad hoc process
launching.

#### Acceptance

- Codex CLI and Claude Code share a runtime-neutral run envelope:
  - business-line scope;
  - Next Action / one-off carrier;
  - context manifest;
  - allowed file/tool/MCP surface;
  - run steps / evidence stream;
  - Write Intent output contract;
  - post-run review hook;
  - reset / compact / handoff behavior.
- Adapter output is evidence, never direct product state mutation.
- RightPanel and Business Next Action execution can explain selected Agent CLI
  runtime, context pack, business-line owner, carrier, and writeback path.
- Agent API remains visible as partial/gated when selected.

#### Verification

```bash
npm test -- src/main/domain/run/run-service.test.ts src/renderer/App.test.tsx src/renderer/pages/BusinessLinesPage.test.tsx -t "business line|runtime|CLI|RightPanel|Next Action|context pack|Write Intent"
npm run audit:product-progress -- --next
npm run lint
npm run build
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Architecture Goal 2 only - native CLI adapter contract.

Make native CLI execution an explicit adapter contract:
- selected CLI runtime
- businessLineId
- Next Action / task carrier
- one-off scope when there is no durable business owner
- context manifest/context pack
- allowed tool/file/MCP surface
- run evidence
- Write Intent proposal
- post-run review
- compact/handoff behavior

Do not broaden Agent API execution. If runtimeMode=api appears, it must remain partial/gated for task execution unless existing readiness gates pass.

Update tests and audit evidence only as needed. Stop at a checkpoint.
```

### Architecture Goal 3: Capability Scaffolding Surface

#### Objective

Separate global capabilities from scoped runtime access.

#### Acceptance

- MCP, skills, external access, hooks, browser/computer-use, and local file
  scopes are modeled as capability surfaces.
- Capability surfaces can be global, but each action/run receives a scoped
  allowance.
- Business-line-specific SOP/skills remain business memory, not global runtime
  configuration.
- No per-business-line MCP/runtime matrix is introduced unless a real permission
  boundary requires it.

#### Verification

```bash
npm test -- src/shared src/main/domain/run src/renderer/App.test.tsx -t "MCP|skills|capability|external access|permission|business line"
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Architecture Goal 3 only - capability scaffolding surface.

Separate capability surfaces from runtime state:
- MCP/tools
- skills
- external access
- hooks
- browser/computer-use
- local file scopes

Keep global configuration global, but ensure each action/run receives an explicit scoped allowance. Keep business-line SOP/skills as business memory, not broad runtime configuration.

Do not build a per-business-line MCP/runtime/provider matrix unless a failing test proves the need. Stop at a checkpoint.
```

### Architecture Goal 4: Handoff And Context Transition Contract

#### Objective

Turn handoff into a typed recovery artifact for cross-session, subagent, and
runtime transitions.

#### Acceptance

- Handoff packets distinguish:
  - ephemeral session handoff;
  - durable business handoff;
  - Next Action handoff;
  - runtime/subagent handoff.
- Handoff includes objective, current state, decisions, constraints, changed
  files/artifacts, evidence, exclusions, blockers, next step, and writeback
  target.
- Handoff never copies raw transcript as product truth.
- Runtime compact/reset/restart behavior is documented and tested.

#### Verification

```bash
npm test -- src/shared/context-transition.test.ts src/shared/context-preservation.test.ts src/main/domain/business-line/business-line-service.test.ts src/renderer/App.test.tsx -t "handoff|compact|context transition|business record|Next Action"
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Architecture Goal 4 only - handoff and context transition contract.

Make handoff a typed recovery artifact:
- ephemeral_session_handoff
- durable_business_handoff
- next_action_handoff
- runtime_or_subagent_handoff

Ensure handoff records objective, decisions, constraints, evidence, exclusions, blockers, next step, and writeback target. It must not become a raw transcript dump and must not bypass Taskplane write gates.

Add focused tests and stop at a checkpoint.
```

### Architecture Goal 5: Bounded Pilot Backend Contract

#### Objective

Ensure coordination can use AI without becoming a hidden persistent agent.

#### Acceptance

- Pilot decision records include operation mode, backend, trigger, max turns,
  fallback, and executor choice.
- Rules are default.
- Bounded AI decision backend uses the selected user agent scheme when supported.
- Fallback backend is explicit and visible.
- No persistent Pilot/autopilot loop is introduced.

#### Verification

```bash
npm test -- src/main/domain/decision src/shared -t "Pilot|DecisionBackend|bounded|product_control_layer|persistent_ai_pilot_reserved|fallback|selected scheme"
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Architecture Goal 5 only - bounded Pilot backend contract.

Harden the Pilot decision backend boundary:
- product_control_layer is default
- bounded_decision_backend may use selected CLI/API/rules/human review when explicitly selected and capability-gated
- persistent_ai_pilot_reserved remains future-only
- backend choice is recorded as evidence, not durable state mutation
- fallback is explicit, visible, and permissioned

Do not implement persistent Pilot. Do not expand scheduler automation. Stop at a checkpoint.
```

### Architecture Goal 6: Scheduler Loop Backend Boundary

#### Objective

Clarify scheduler as business-line loop carrier, not product owner.

#### Acceptance

- Scheduled/event/routine tasks resolve business-line owner before durable writes.
- Scheduler proposals use Decision/Standing Approval gates.
- CLI-first scheduled execution remains supported.
- Future API scheduler remains deferred unless existing gates pass.
- Read-only sensors may create reviewable Business Record candidates.
- Mutating automations create Next Actions or Decision-gated write proposals.

#### Verification

```bash
npm test -- src/shared/agent-orchestration.test.ts src/shared/scheduler-decision-proposal.test.ts src/main/domain/business-line/business-line-service.test.ts -t "business-line loop|scheduler|standing approval|scheduled|event|sensor|automation"
npm run audit:product-progress -- --next
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Architecture Goal 6 only - scheduler loop backend boundary.

Ensure scheduler/sensor/automation paths remain business-line loop carriers:
- resolve businessLineId
- carry execution through Next Action/task when needed
- require Standing Approval or Decision gate for mutation
- keep CLI-first execution supported
- keep future API scheduler paths deferred unless all readiness gates pass

Do not turn scheduler into a separate product owner. Stop at a checkpoint.
```

### Architecture Goal 7: Matrix Runtime Boundary

#### Objective

Reserve Wanman-style matrix execution as a future runtime backend, not the
default Taskplane coordinator.

#### Acceptance

- Matrix runtime is represented as an executor/backend capability, not product
  owner.
- It can receive scoped missions with context manifests and write boundaries.
- It cannot create Business Records, Decisions, SOPs, or completions directly.
- No matrix runtime is invoked in production paths yet.

#### Verification

```bash
npm test -- src/shared/agent-orchestration.test.ts src/shared/product-feature-impact-audit.test.ts -t "matrix|wanman|runtime|executor|business line"
npm run audit:product-progress -- --next
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Architecture Goal 7 only - matrix runtime boundary.

Represent Wanman-style matrix execution as a future runtime backend below Pilot:
- scoped mission
- context manifest
- tool/file/MCP surface
- evidence return
- Write Intent only

Do not implement matrix execution. Do not turn it into the product coordinator. Stop at a checkpoint.
```

### Architecture Goal 8: Agent API Deferred Contract Cleanup

#### Objective

Keep Agent API visible and configurable without implying production readiness for
task execution.

#### Acceptance

- Agent API UI/status distinguishes configured, partial, read-only/proposal-capable, and execution-ready.
- Product audit remains strict: provider configuration does not equal execution readiness.
- Right-panel / decomposition / patch apply future API gaps remain explicit until each evidence chain is real.
- Agent API promotion is per movement and per entrypoint, not global.

#### Verification

```bash
npm test -- src/shared/product-feature-impact-audit.test.ts src/shared/capability-registry.test.ts src/renderer/App.test.tsx -t "Agent API|runtime|deferred|readiness|configured|promotion"
node scripts/agent-api-promotion-readiness-smoke.mjs
node scripts/agent-api-decomposition-promotion-readiness-smoke.mjs
npm run audit:product-progress -- --next
npm run lint
npm run build
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Architecture Goal 8 only - Agent API deferred contract cleanup.

Keep Agent API as a same-level future runtime, but make its partial/gated state explicit:
- configured provider is not execution readiness
- provider tool/search probe is not task execution readiness
- right-panel execution, decomposition, scheduler, and patch apply each need separate evidence chains

Do not remove Agent API. Do not promote it globally. Stop at a checkpoint.
```

### Architecture Goal 9: CLI-First End-To-End Runtime Smoke

#### Objective

Prove the first-version path as a real product loop, not just type boundaries.

#### Acceptance

- A local smoke creates or uses a business line.
- It creates or selects a Next Action.
- It routes through selected Agent CLI runtime.
- It records run evidence.
- It proposes at least one business-line-native Write Intent.
- It requires the correct confirmation/Decision gate.
- It creates review output and a future Next Action or SOP proposal.
- No Agent API or matrix backend is required.

#### Verification

```bash
npm test -- src/main/domain/business-line/business-line-service.test.ts src/main/domain/run/run-service.test.ts src/renderer/App.test.tsx -t "business line|CLI|run|review|Write Intent|Next Action"
npm run audit:product-progress -- --next
npm run lint
npm run build
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Architecture Goal 9 only - CLI-first end-to-end runtime smoke.

Add or harden a local first-version smoke that proves:
Business Line -> Next Action -> selected Agent CLI -> run evidence -> Write Intent -> confirmation/Decision gate -> review -> Business Record/SOP/Next Action.

Do not require Agent API. Do not add broad UI polish. Stop at a checkpoint.
```

### Architecture Goal 10: Closeout Audit

#### Objective

Verify the architecture now supports CLI-first execution while keeping API-later,
matrix-later, handoff, scheduler, and coordination boundaries clean.

#### Acceptance

- Product audit still reports CLI P0 ready.
- Business-line-first checks remain ready.
- Agent API future deferred items are explicit and not confused with first-release blockers.
- No test expectation still says task-first product ownership.
- No spec says MCP/skills/external access own business memory.
- No spec says Pilot/scheduler/matrix runtime owns durable state.
- Handoff and review create typed recovery/learning artifacts, not transcript dumps.

#### Verification

```bash
npm run audit:product-progress -- --next
npm run lint
npm run build
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Architecture Goal 10 only - closeout audit.

Verify the runtime capability architecture after Goals 0-9:
- CLI-first execution is the first-release path.
- Agent API remains same-level but partial/gated.
- Matrix runtime remains future-only below Pilot.
- Pilot coordination is bounded and backend-neutral.
- Scheduler is a business-line loop carrier.
- Handoff is typed recovery, not raw transcript.
- Writeback stays product-controlled.

Fix only audit/test/doc drift. Do not start a new feature. Stop at a checkpoint.
```

## Legacy Coarse Step Plan

The section below is retained as historical context from the earlier, coarser
runtime plan. Prefer the detailed goals above when creating new Codex goals.

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

## Legacy Coarse Execution Order

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

## Implementation Drift Appendix

Date: 2026-05-31
Scope: Architecture Goal 0 boundary drift audit only.
Behavior changes: none.

This audit reviewed the current implementation against the seven-layer stack and
classifies drift using the Goal 0 categories. The codebase is broadly aligned
with the CLI-first, API-aware, runtime-neutral thesis, but the next architecture
pass should make the Agent Capability Gateway explicit before changing behavior.

| Layer | Finding | Classification | Evidence | Follow-up |
| --- | --- | --- | --- | --- |
| Product Control Plane | Business-line durable ownership is now the dominant rule and implementation posture. Runtime output enters product state as evidence or Write Intent, not direct mutation. | aligned | `AGENTS.md`; `docs/specs/goalpilot-task-advancement-framework.md`; `src/shared/taskplane-write-intent.ts`; `src/shared/product-feature-impact-audit.ts`; `src/main/domain/run/run-service.ts` | Keep this as the non-negotiable state authority in later goals. |
| Product Control Plane | Task.md, Task Records, legacy task recovery, and Tasks UI remain active surfaces. This is valid compatibility support, but it can still look task-first in local implementation names. | compatibility adapter | `docs/specs/task-memory-spec.md`; `src/renderer/pages/TasksPage.tsx`; `src/shared/context-preservation.ts`; `src/shared/context-transition.ts` | Do not remove or broadly rename now. Keep future business-line work routed through owner resolution and Business Records. |
| Agent Capability Gateway | There is no single gateway object or taxonomy that answers selected agent scheme, runtime need, capability probe, fallback policy, context manifest, permission boundary, and evidence contract together. The behavior exists in distributed pieces. | needs gateway boundary | `src/shared/task-advancement-orchestrator.ts`; `src/shared/runtime-capability-snapshot.ts`; `src/shared/capability-registry.ts`; `src/shared/pilot-decision-contract.ts`; `src/shared/runtime-entrypoint-coverage.ts` | Goal 1 should introduce the smallest shared gateway taxonomy before adapter or UI behavior changes. |
| Agent Capability Gateway | `runtimeMode` / `AiRuntimeMode` still carries several meanings: user-selected agent scheme, execution runtime selector, Agent API partial layer, and UI/runtime status. | naming drift | `src/shared/types/settings.ts`; `src/shared/runtime-capability-snapshot.ts`; `src/shared/ai-runtime-invocation.ts`; `src/main/domain/decision/decision-service.ts`; `src/renderer/pages/ModelPage.tsx` | Rename conceptually in the new taxonomy first; avoid broad user-facing rename in Goal 0. |
| Agent Capability Gateway | Pilot backend selection can prefer `agent_api` before the selected CLI backend when both are available, because the selector receives `selectedCliRuntime` but not a full selected agent scheme / need / fallback policy. | needs gateway boundary | `src/shared/pilot-decision-contract.ts` | Goal 1 or Goal 5 should make selected-scheme preference explicit and record fallback instead of relying on backend list order. |
| Runtime Adapters | Codex CLI and Claude Code have a real adapter envelope: read-only invocation, context manifest, BusinessLineContextPack, Run Goal Contract, runtime event projection, Run steps, Pilot snapshot, web/source bridge, and post-run verification. | aligned | `src/main/domain/agent-cli/agent-cli-run-service.ts`; `src/shared/agent-cli-runtime-status.ts`; `src/shared/business-line-context-pack.ts`; `src/shared/agent-runtime-goal.ts`; `src/shared/runtime-context.ts` | Goal 2 can formalize this existing shape as the adapter contract. |
| Runtime Adapters | Retained `RunService` and Code Agent model-producer paths are API-like compatibility surfaces. They are heavily gated and audited, but they should not become implicit fallback when Agent CLI is selected. | compatibility adapter | `src/main/domain/run/run-service.ts`; `src/main/domain/run/code-agent-run-service.ts`; `src/shared/runtime-entrypoint-coverage.ts`; `src/shared/ai-runtime-invocation.ts` | Keep as retained compatibility / future Agent API evidence until the gateway can route by capability and selected scheme. |
| Runtime Adapters | Runtime-native goal passthrough is intentionally audit-only. Capability detection exists, but command forwarding, session ownership, progress reflection, cancellation, memory boundary, and packaged smoke evidence are still missing. | should not change now | `docs/specs/native-agent-runtime-orchestration.md`; `src/main/domain/agent-cli/agent-cli-run-service.ts`; `src/shared/native-goal-forwarding-readiness.ts`; `src/shared/agent-runtime-goal.ts` | Leave closed in Goal 0. Revisit only through the native-goal readiness gate. |
| Capability Scaffolding | MCP, skills, external access, browser/computer-use, hooks, provider-native tools, workspace, and sandbox capabilities are surfaced through registries, safety strips, runtime status probes, and scoped context bridges. | aligned | `src/shared/capability-registry.ts`; `src/shared/capability-product-surfaces.ts`; `src/shared/agent-tool-scaffold.ts`; `src/renderer/pages/McpPage.tsx`; `src/renderer/pages/SkillsPage.tsx`; `src/renderer/pages/ModelPage.tsx` | Goal 3 should keep global configuration global while making per-action allowance explicit in gateway/context manifests. |
| Capability Scaffolding | The plan's "do not build a per-business-line MCP/runtime matrix" is still correct. Existing business-line SOPs and skills stay memory/context, while capability configuration stays global and gated per action. | should not change now | `docs/plans/2026-05-29-business-line-centered-redesign.md`; `src/shared/capability-registry.ts`; `src/shared/business-line-context-pack.ts`; `src/renderer/pages/BusinessLinesPage.tsx` | Avoid new per-business-line runtime/provider matrix until a real permission problem appears. |
| Pilot / Coordination | Pilot is bounded and auditable: operation mode, backend, backendPlan, maxTurns, message priority, executor, gates, and snapshots are represented and recorded into Agent CLI/API paths. | aligned | `src/shared/pilot-decision-contract.ts`; `src/main/domain/agent-cli/agent-cli-run-service.ts`; `src/main/domain/run/run-service.ts`; `src/shared/product-feature-impact-audit.ts` | Keep `persistent_ai_pilot_reserved` future-only. |
| Pilot / Coordination | Pilot is currently a contract plus evaluators, not a single `pilot.route` gateway skill behind the broader capability gateway. That is acceptable for now but should be unified with selected-scheme routing. | needs gateway boundary | `src/shared/pilot-decision-contract.ts`; `src/shared/task-advancement-orchestrator.ts`; `docs/specs/decision-layer-writeback-orchestration.md` | Goal 5 should depend on Goal 1 taxonomy rather than adding a resident Pilot. |
| Scheduler / Loop Carrier | Scheduler is mostly a loop carrier: it has feature flags, Standing Approval, run-limit evidence, task-source ports, trigger ports, timeline evidence, and scheduler Decision proposal plans with direct persistence disabled. | aligned | `src/main/scheduler/scheduler-service.ts`; `src/shared/agent-orchestration.ts`; `src/shared/scheduler-decision-proposal.ts`; `src/shared/runtime-entrypoint-coverage.ts`; `src/renderer/pages/BriefPage.tsx` | Preserve the carrier model and evidence trail. |
| Scheduler / Loop Carrier | Scheduled/event Agent triggers currently route through the Code Agent run port / model-producer compatibility path rather than a selected-scheme Agent Capability Gateway. | needs runtime adapter change | `src/main/scheduler/scheduler-service.ts`; `src/shared/agent-orchestration.ts`; `src/shared/product-feature-impact-audit.ts` | Goal 6 should route scheduler execution through the same selected-scheme gateway/adapters once the gateway taxonomy exists. |
| Scheduler / Loop Carrier | Standing Approval UI says the confirmed policy "will not start scheduler", while the same card can expose an operator "start once" action after confirmation. The intended boundary is "no automatic scheduler start". | needs UI wording change | `src/renderer/pages/TasksPage.tsx`; `src/shared/agent-orchestration.ts` | Later UI copy should distinguish automatic starts from explicit operator-started scheduled/event runs. |
| Evaluation / Review / Learning | Write Intent extraction, validation, proposal cards, writeback apply plans, dispatch, run verification, business review, SOP proposal, source context, patch promotion, and product-feature audit are present and runtime-neutral. | aligned | `src/shared/taskplane-write-intent.ts`; `src/shared/taskplane-writeback-apply-plan.ts`; `src/shared/taskplane-writeback-proposal.ts`; `src/main/domain/run/run-verification-service.ts`; `src/shared/business-line-post-run-review.ts`; `src/shared/product-feature-impact-audit.ts` | Goal 9 should prove the full CLI-first loop end to end rather than adding more surface-specific rules first. |
| Evaluation / Review / Learning | Agent API execution promotion evidence is very strict and visible, but the amount of readiness detail is scattered across capability registry, product audit, RunService, settings, and smokes. | naming drift | `src/shared/ai-runtime-invocation.ts`; `src/shared/capability-registry.ts`; `src/main/domain/run/run-service.ts`; `src/renderer/pages/ModelPage.tsx`; `scripts/agent-api-promotion-readiness-smoke.mjs` | Keep the strict gates. Later docs/UI can consolidate naming without weakening promotion requirements. |

### Checkpoint Recommendation

Proceed next with Architecture Goal 1. The smallest useful movement is a shared
Agent Capability Gateway taxonomy that separates selected agent scheme, runtime
need, execution runtime, decision backend, capability probe, fallback policy,
permission gate, and evidence contract. Do not change product behavior until
that vocabulary is in place.

## Runtime Capability Boundary Audit Appendix

Date: 2026-05-31
Scope: Runtime Architecture Goal 0 capability boundary audit only.
Behavior changes: none.

This audit revisits the narrower legacy runtime boundary question after the
later architecture goals have landed. The current implementation now has a
shared Agent Capability Gateway vocabulary, CLI-first execution evidence,
Agent API deferred evidence, scheduler-loop gateway evidence, and a runtime-
neutral Write Intent/writeback path. Remaining drift is mostly naming or
retained compatibility surfaces that should not be broadened during Goal 0.

| Boundary | Finding | Classification | Evidence | Follow-up |
| --- | --- | --- | --- | --- |
| User runtime mode | `AiRuntimeMode` still stores the user-facing selection as `api`, `codex`, or `claude`, and renderer/main code still calls it `runtimeMode`. The Agent Capability Gateway maps that into `UserSelectedAgentScheme` (`agent_api`, `codex`, `claude`) before capability routing. | naming drift | `src/shared/types/settings.ts`; `src/shared/agent-capability-gateway.ts`; `src/main/keychain/ai-config-service.ts`; `src/renderer/pages/ModelPage.tsx` | Keep the stored setting stable. Future cleanup can rename code-facing adapters toward selected agent scheme without changing UI copy or migration behavior. |
| User runtime mode | CLI selections are first-release execution-capable while selected `api` is a peer runtime selection whose provider-visible task execution remains deferred. This distinction is explicit in runtime snapshots and settings chips. | aligned | `src/shared/runtime-capability-snapshot.ts`; `src/shared/capability-registry.ts`; `src/renderer/pages/ModelPage.tsx`; `src/shared/product-feature-impact-audit.ts` | Preserve `runtimeExecutable=no`, `executionReady=no`, and `globalAgentApiPromotionAllowed=false` for Agent API until per-entrypoint promotion evidence is complete. |
| Execution runtime | The shared gateway now separates `AgentExecutionRuntime` (`codex_cli`, `claude_cli`, `agent_api`, `local_rule`, `human`, `wanman_matrix`) from user selection and Pilot backend. Native CLI runs record an explicit `Native CLI adapter contract` with execution runtime, context manifest, allowed surfaces, evidence, Write Intent, review, and handoff boundaries. | aligned | `src/shared/agent-capability-gateway.ts`; `src/shared/native-cli-adapter-contract.ts`; `src/main/domain/agent-cli/agent-cli-run-service.ts`; `src/main/domain/business-line/business-line-service.test.ts` | Keep execution runtime evidence on run steps; do not infer durable product writes from runtime identity alone. |
| Execution runtime | Retained `RunService` / Agent API-like execution and Code Agent model-producer paths are still compatibility adapters. They are useful for future API promotion evidence, but they are not the first-release Agent CLI entrypoint and they block silent switching when CLI is selected. | compatibility adapter | `src/main/domain/run/run-service.ts`; `src/main/domain/run/code-agent-run-service.ts`; `src/shared/runtime-entrypoint-coverage.ts`; `src/shared/ai-runtime-invocation.ts` | Keep these paths gated and audited. Promote only per movement/entrypoint through selected-runtime, target-task, writeback, verification, and run-evidence gates. |
| Execution runtime | `capabilitySnapshotAllowsModelExecution()` and `capabilityRegistryAllowsModelExecution()` still use broad "model execution" naming for selected Agent API plus configured provider. The surrounding summaries correctly keep `execution_run` deferred, but the helper name can blur provider invocation with product task execution. | needs code boundary | `src/shared/runtime-capability-snapshot.ts`; `src/shared/capability-registry.ts`; `src/shared/runtime-verification.ts`; `src/shared/runtime-capability-snapshot.test.ts` | Later code should split provider/model invocation readiness from task `execution_run` readiness. Do not change behavior in Goal 0. |
| Pilot decision backend | Pilot backend selection is now a product-control decision over `AgentDecisionBackend`, and `evaluatePilotDecision()` delegates selected-scheme preference, fallback, and permission gate calculation to `resolveAgentCapabilityGateway()`. The resulting `backendPlan` records status, backend, triggers, max turns, fallback, and output contract. | aligned | `src/shared/pilot-decision-contract.ts`; `src/shared/agent-capability-gateway.ts`; `src/renderer/components/RightPanel.tsx`; `src/main/domain/run/run-service.ts` | Keep Pilot as bounded coordination evidence. Do not introduce a persistent Pilot loop or let backend choice mutate product state. |
| Pilot decision backend | RightPanel still assembles `availableDecisionBackends` locally (`rules`, optional Agent API, selected CLI, `human_review`) before calling the shared evaluator. This is a UI integration compatibility seam, but selected CLI/runtime preference is resolved by the gateway rather than raw array order. | compatibility adapter | `src/renderer/components/RightPanel.tsx`; `src/shared/pilot-decision-contract.ts`; `src/shared/agent-capability-gateway.ts` | Keep until a main-side capability gateway service owns the entire Pilot input. No behavior change is needed for Goal 0. |
| Scheduler loop carrier | Scheduler-loop runtime routing now uses the shared capability gateway with `runtimeNeed=scheduler_loop`. Selected Agent API scheduler paths are marked `schedulerLoopApiDeferred=true`; selected CLI paths can prove `schedulerLoopCliFirstSupported=true`; trigger plans still require Standing Approval, run-limit evidence, target task identity, and post-step evidence. | aligned | `src/shared/agent-orchestration.ts`; `src/main/scheduler/scheduler-service.ts`; `src/shared/product-feature-impact-audit.ts`; `src/main/scheduler/scheduler-service.test.ts` | Preserve scheduler as business-line loop carrier. Do not let API scheduler fallback use the compatibility trigger port without scheduler-specific promotion gates. |
| Scheduler loop carrier | Scheduled Brief generation remains an Agent API adapter path and explicitly refuses to run when the selected runtime mode is Codex CLI or Claude Code. This is separate from scheduled/event Agent execution and should stay as compatibility behavior until selected-scheme brief routing is redesigned. | compatibility adapter | `src/main/scheduler/scheduler-service.ts`; `src/shared/runtime-entrypoint-coverage.ts`; `docs/specs/native-agent-runtime-orchestration.md` | Keep the no-silent-switch guard. If brief generation later supports CLI, add it through the gateway rather than widening the API adapter. |
| Writeback interpreter | Writeback interpretation is runtime-neutral: native CLI and Agent API outputs become `TASKPLANE_WRITE_INTENTS` / proposals, then approval items, apply plans, dispatch, service validation, and business-line ownership checks. Runtime output remains evidence until product write gates apply it. | aligned | `docs/specs/decision-layer-writeback-orchestration.md`; `src/shared/taskplane-writeback-proposal.ts`; `src/shared/taskplane-writeback-approval.ts`; `src/shared/taskplane-writeback-apply-plan.ts`; `src/main/domain/writeback/taskplane-writeback-dispatch-service.ts` | Keep Write Intent extraction as the interpreter boundary; do not add runtime-specific direct write paths. |
| Writeback interpreter | RightPanel still contains surface-specific proposal staging and renderer fallback dispatch code for task files, artifacts, source context, structured writeback, and decomposition. This is retained UI compatibility around the shared writeback interpreter. | compatibility adapter | `src/renderer/components/RightPanel.tsx`; `src/renderer/pages/TasksPage.tsx`; `src/shared/taskplane-writeback-dispatch.ts`; `src/main/ipc/handlers.ts` | Preserve the main-side `taskplaneWriteback:apply` boundary as the product path. Future cleanup can reduce renderer duplication after the shared interpreter is service-owned. |
| Provider capability probe | Provider and tool capability probes are evidence, not execution readiness. Agent API provider readiness requires selected runtime identity, configured provider identity, provider-owned metadata, explicit tool declarations, no startup probe, and matching package identity; settings expose `providerToolReadiness` without promoting task execution. | aligned | `src/shared/agent-api-provider-tool-readiness.ts`; `src/shared/capability-registry.ts`; `src/shared/configuration-safety-report.ts`; `src/renderer/pages/ModelPage.tsx`; `scripts/agent-api-provider-tool-readiness-smoke.mjs` | Keep `startupProbe=never` for Agent API provider capability summaries and require per-entrypoint promotion evidence before provider-visible execution. |
| Provider capability probe | Agent CLI capability probes read help output, workspace metadata, package metadata, native search, hooks, and subagent signals without executing the runtime. Those probes are allowed to enrich adapter capability evidence, not product memory or writeback authority. | aligned | `src/main/domain/agent-cli/agent-cli-runtime-status-service.ts`; `src/shared/agent-cli-runtime-status.ts`; `src/shared/capability-registry.ts`; `docs/specs/native-agent-capability-mapping.md` | Keep CLI probes read-only/no-start. Runtime-native capabilities still require Taskplane context, permission, and writeback gates. |
| Runtime-native goal | Runtime-native goal passthrough remains audit-only/closed. The capability surface can detect native goal support, but command forwarding, persistent-session ownership, progress reflection, cancellation, packaged smoke evidence, and memory boundaries are not yet proven. | should not change now | `docs/specs/native-agent-runtime-orchestration.md`; `src/shared/native-goal-forwarding-readiness.ts`; `src/shared/agent-runtime-goal.ts`; `src/main/domain/agent-cli/agent-cli-run-service.ts` | Leave closed until the native-goal forwarding readiness gate and opt-in smoke evidence prove the full boundary. |

### Runtime Goal 0 Checkpoint

No product behavior changes are required for Runtime Architecture Goal 0. The
current implementation is sufficiently separated for an audit checkpoint:
selected user runtime mode, execution runtime, Pilot decision backend,
scheduler loop carrier, writeback interpreter, and provider capability probe
are now distinguishable in code and product audit evidence. The next useful
runtime work should be code-boundary cleanup around model/provider invocation
readiness versus task `execution_run` readiness, not a behavior change.

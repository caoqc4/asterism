# Runtime Lifecycle Coverage

Date: 2026-05-14

## Purpose

Runtime deepening is broader than Agent execution compliance.

The Agent Operating Principles describe how Agents should behave during task work. The runtime lifecycle describes how the product should coordinate task intake, context, execution, memory, verification, decisions, hierarchy, activity, and capabilities across UI, data, and Agent surfaces.

Source of truth in code:

- `src/shared/runtime-lifecycle-coverage.ts`

Related but narrower:

- `src/shared/agent-principles.ts`
- `src/shared/agent-principles-compliance.ts`

## Lifecycle Phases

The current coverage matrix tracks these phases:

1. Task intake and capture
2. Context entry and binding
3. Context assembly
4. Priority and attention
5. Execution start and step loop
6. Information routing and memory
7. Decision and confirmation
8. Verification and closeout
9. Pause, resume, and handoff
10. Project and hierarchy runtime
11. Activity timeline and audit
12. Capabilities and external access

Each phase records:

- current status;
- priority;
- runtime scope;
- what currently covers it;
- what sits outside the Agent principles;
- known gaps;
- next implementation steps.

## Current Read

The product is not yet runtime-complete.

Strongest areas:

- information routing taxonomy;
- task closeout and context clearing;
- run, run-step, task closeout, context clear, and first-pass project verification wired into completion and project detail surfaces;
- initial task intake routing for the global capture flow;
- initial context snapshot and required read-order assembly policy, including ordinary Run and Code Agent model-producer execution blocking when required inputs are missing;
- Decision/checkpoint boundaries for risky tools;
- early task hierarchy model migration;
- first-pass project child draft validation before confirmed subtask creation.
- service-level child task capture now blocks generic phase-template titles and parent-title repeats.
- project decomposition generation checks the full task list for existing children, including `parentTaskId` links.
- task creation, parent moves, and parent-side child list updates keep `parentTaskId` and parent `childTaskIds` synchronized at the service boundary.
- hierarchy consistency diagnostics can find old parent/child mismatches through the service/IPC boundary, and can produce a non-mutating repair plan that separates safe actions from manual-review items.
- ordinary task files stay in the task-file class instead of being projected as artifacts.

Weakest areas:

- full task intake and pre-create evaluation across every retained creation entry point;
- a single confirmation boundary for all child-task creation paths beyond project decomposition;
- full context snapshot ownership;
- source freshness and context inclusion reasons;
- Decision judgment-center effect presentation after approval/defer/cancel;
- Decisions judgment center;
- unified runtime handoff shape;
- legacy local task hierarchy attributes and old inconsistent relationship records still need a confirmed cleanup/repair apply path after the database relationship becomes authoritative.
- capability state in context/action evaluation;
- activity timeline as a complete runtime audit projection.

## Design Rule

Do not treat Agent Principles compliance as equivalent to runtime lifecycle completion.

Agent Principles compliance asks:

> Did Agent execution follow the operating contract?

Runtime Lifecycle coverage asks:

> Did the product coordinate UI state, data state, execution state, memory, verification, and user decisions across the whole task lifecycle?

Both are needed.

## Recommended Order

1. Add `RuntimeContextSnapshot` and `RuntimeContextAssemblyPolicy`.
2. Extend `RuntimeIntakeEvaluation` beyond the initial RightPanel capture flow to project decomposition and every task creation entry point.
3. Wire `pre_step` and `post_step` verification into execution services and panel durable actions, and route more project state transitions through project verification.
4. Add `RuntimeHandoff` and `RuntimeResumePlan`.
5. Implement Decisions judgment center.
6. Add `RuntimeCapabilitySnapshot`.
7. Finish data model migration for task hierarchy and facets, and route every child-task creation path through shared child draft evaluation.

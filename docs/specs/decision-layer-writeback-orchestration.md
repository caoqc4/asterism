# Decision Layer Writeback Orchestration

Document id: `taskplane.decision-layer-writeback-orchestration.v1`
Owner: Taskplane product architecture
Layer: architecture skill / decision and hook orchestration
Load: runtime result interpretation, writeback, memory proposal, advancement
evaluation, feature impact audits
Scope: DecisionBackend, WriteIntentExtractor, validators, hooks, gates, and
Taskplane write services
Authority: implementation-guiding; deterministic write gates are required
Status: Architecture decision, implementation-guiding

## Purpose

Taskplane can support native Agent CLIs, future Agent APIs, or both. The product
must still have one closed loop from execution evidence to durable Taskplane
state.

This document defines the middle layer between runtime output and product data.
It uses the same mental model as skills and hooks:

- decision skills perform bounded semantic judgment;
- hooks and gates enforce deterministic constraints;
- Write Intent is the shared data contract;
- Taskplane services remain the only durable write path.

The decision layer is not a fourth model capability. It is Taskplane runtime
orchestration that may use deterministic rules, a Codex CLI decision run, a
Claude Code decision run, a future Agent API evaluator, or a subagent as a
backend.

## Closed Loop With CLI Only

The product is allowed to run with only native CLI capability. Agent API support
is useful, but not required for closure.

CLI-only closure requires this chain:

```text
Taskplane assembles context
-> native CLI executes and returns evidence
-> WriteIntentExtractor reads structured intent or derives candidates
-> Decision Skill judges ambiguous candidates when needed
-> Hook/Gate validates scope, phase, schema, risk, and confirmation need
-> Proposal card or automatic low-risk write
-> Taskplane service persists
-> Timeline, Run step, task dynamics, and memory surfaces record evidence
```

If no API runtime is configured, semantic decision work can use a bounded
read-only CLI decision run or fall back to deterministic review. If no model is
available for the decision layer, Taskplane can still surface a review-required
proposal instead of writing silently.

No backend may bypass Taskplane write gates.

## Product Roles

### Control Plane

Owns durable truth:

- task state, hierarchy, blockers, dependencies, completion criteria;
- Task.md, Task Records, Source Context, Decisions, Work Habits;
- run records, run steps, task dynamics, verification evidence;
- confirmation and write authority.

### Runtime Layer

Executes work and returns evidence:

- Codex CLI;
- Claude Code;
- future Agent API;
- MCP, connectors, local commands, or browser operators when explicitly exposed.

Runtimes may propose structured intent. They do not persist product state.

### Decision Layer

Interprets evidence into product-level proposals:

- choose the next GoalPilot movement;
- extract or derive Write Intent;
- judge memory worthiness;
- judge source quality and freshness;
- verify completion evidence;
- detect blockers, follow-up tasks, decisions, or context-refresh needs.

Decision skills should be narrow and phase-loaded. They are not global prompt
bulk.

### Hooks And Gates

Enforce product safety and consistency:

- schema validation;
- task and scope match;
- phase permission;
- duplicate detection;
- confirmation requirement;
- source freshness and credibility boundary;
- completion and context-clear readiness;
- service-level write authorization.

Anything that must always happen belongs here, not only in prose.

## Decision Skills

Use decision skills as reusable product workflows. They can be implemented by
rules, CLI runs, API calls, or subagents behind the same interface.

Recommended first skills:

| Skill | Question | Output |
| --- | --- | --- |
| `pilot.route` | What should Pilot coordinate next, which operation mode applies, and which backend/executor should be used? | PilotDecision |
| `pilot.message_priority` | Is the user message follow-up, steer, or escalate? | priority, reason |
| `priority.route` | Which task deserves attention when multiple tasks compete? | focus task, lane, reason |
| `advancement.evaluate` | What movement should happen next? | movement, reason, required rules |
| `context.readiness.evaluate` | Is context sufficient, self-researchable, plan-first, user-bound, or blocked? | ready / self_research / plan_first / ask_user / blocked |
| `write_intent.extract` | What product write is being proposed? | candidate Write Intent list |
| `memory.worthiness` | Is this worth durable memory? | write / skip / ask |
| `source.quality` | Can this source be trusted for this task? | include / caution / exclude |
| `completion.verify` | Is the task actually complete? | complete proposal / continue / ask |
| `context.refresh` | Is context clean and recoverable? | refresh plan or clear readiness |

Each skill returns structured output plus evidence. It must not directly call a
write service.

## Hook And Gate Placement

Use hooks and gates for fixed product constraints:

| Hook/Gate | Enforces |
| --- | --- |
| Runtime entrypoint gate | Whether a UI/service path may start execution or mutate state |
| Context readiness gate | Whether the next move is execute, research, plan, ask, or pause |
| Write intent validator | Type schema, target task, required evidence, phase permission |
| Confirmation gate | Whether a proposal must be approved before persistence |
| Memory gate | Whether Task.md, Task Record, or Source Context is the right surface |
| Source gate | Freshness, credibility, duplication, and traceability |
| Completion gate | Criteria, evidence, unresolved blockers, and user approval |
| Context clear gate | Recovery sufficiency before clearing or switching task context |

Hooks should be deterministic and testable. They can call a decision skill only
for semantic classification, then still enforce the final rule locally.

## Write Intent Boundaries

Runtime output may contain explicit `TASKPLANE_WRITE_INTENTS`, legacy structured
blocks, or plain text evidence. The extractor normalizes these into candidate
intents.

Write Intent may describe:

- `task_record.create`;
- `source_context.create`;
- `decision.create`;
- `subtask.propose`;
- `task_file.propose`;
- `task.update_next_step`;
- `task.mark_blocked`;
- `task.complete.propose`;
- future artifact proposals.

Write Intent is a proposal. Persistence happens only after validation and,
where required, confirmation.

## File Boundary Map

Keep the rule documents small and layered:

| File | Role | Should contain | Should not contain |
| --- | --- | --- | --- |
| `AGENTS.md` / `CLAUDE.md` | Native CLI adapter | Pointers to canonical specs and write boundaries | Long product rules |
| GoalPilot | Always-loaded router | Movement choice, load routing, context cleanliness | Detailed write formats |
| Pilot Decision Contract | Decision contract | Message priority, DecisionBackend, executor choice, escalation gates | Task movement principles |
| Priority Attention Routing | Ranking skill | Multi-task focus, Brief priority lanes, escalation ranking | Write formats |
| Agent Operating Principles | Execution skill | Execution safety, tools, subagents, task mutation principles | Memory surface formats |
| Agent Output Contract | Output skill | Chat, cards, drafts, proposals, summaries | State authority rules |
| Task Memory Spec | Memory skill | Task.md, Records, Source Context, refresh and recovery | Runtime adapter design |
| Native Agent Capability Mapping | Architecture skill | Native plan, goal, memory, compact, skills, hooks, subagents, status, review mapping | Durable write formats |
| Native Runtime Orchestration | Runtime architecture | CLI/API boundaries and runtime result contract | Product-wide writeback details |
| This document | Decision and writeback architecture | Decision skills, hooks, Write Intent closure, feature audit | Vendor-specific runtime behavior |

## Product Feature Impact Audit

Because this architecture changes the execution chain, review product features
by risk and write authority, not by page count.

The executable audit registry lives in
`src/shared/product-feature-impact-audit.ts`. Keep this registry aligned with
the high-priority areas below so new execution, writeback, capability, or
context-clearing paths cannot drift outside the GoalPilot / Write Intent /
hook-gate model.

Audit each feature with these questions:

1. Does it only read, or can it execute, propose, persist, clear, or mutate?
2. Which GoalPilot movement does it represent?
3. Which product rule skill should load for that movement?
4. Which Write Intent types can appear?
5. Which hook/gate validates the action?
6. Does the user need a confirmation card?
7. What evidence appears in Run steps, Timeline, task dynamics, or memory?
8. Can it still work when only CLI runtime is available?
9. Can it still work when only API runtime is available in the future?
10. What test or smoke path proves the boundary?

High-priority audit areas:

- right-panel chat, run start, run progress, and run completion;
- task creation, decomposition, subtask start, and task switching;
- Task.md, Task Records, Source Context, and context clearing;
- Decisions, checkpoints, completion, blockers, and next-step changes;
- task files, artifacts, local writes, and sandbox promotion;
- External Access, Skills, MCP, browser tools, and runtime capability gates;
- Work Habits, settings, scheduled/routine/event-triggered work;
- smoke tests, packaged runtime, native CLI readiness, and recovery flows.

Do not redesign every feature at once. Add or adjust gates where a feature can
cross the execution/write boundary, then add tests that prove the boundary.

## Implementation Order

1. Keep CLI execution and API execution behind runtime-neutral results.
2. Expand Write Intent extraction to all planned intent types.
3. Add validators for each intent type before adding persistence paths.
4. Surface proposals in product UI before automatic persistence.
5. Add decision skills only where deterministic rules are insufficient.
6. Promote repeated must-follow decisions into hooks, gates, or tests.
7. Run the product feature impact audit and track gaps by feature family.

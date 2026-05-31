# Business Memory Agent Experience Plan

Date: 2026-05-31
Status: Draft implementation plan
Owner: Taskplane product architecture
Related:
- `docs/plans/2026-05-30-business-line-first-execution-plan.md`
- `docs/plans/2026-05-30-business-line-architecture-migration-plan.md`
- `docs/plans/2026-05-31-runtime-capability-architecture-plan.md`
- `docs/specs/context-transition-policy.md`
- `docs/specs/task-memory-spec.md`
- `docs/specs/native-agent-capability-mapping.md`
- `docs/specs/native-agent-runtime-orchestration.md`

## Purpose

Taskplane has moved its product model from task-first to business-line-first.
The next design question is how long-running agent work should keep quality high
without depending on one ever-growing chat transcript.

This plan combines two related streams:

1. Re-evaluate and migrate Taskplane's existing auto context clear, reset,
   compact, handoff, and recovery behavior from task-memory-first to
   business-memory-first.
2. Translate useful native-agent product patterns, especially Codex-style
   durable threads, goals, automations, steering, queueing, side panel review,
   tools, and shared memory, into Taskplane's own business-line model.

The target is not to copy Codex. Taskplane's product thesis is different:

```text
Business Line = durable owner and learning memory
Next Action / legacy task = execution carrier
Native CLI / future API = execution or assistance runtime
Taskplane services = source of truth, gates, and writeback
Chat transcript = temporary working context
```

## First Principles

1. Context is disposable. Business memory is durable.
   Chat history may help a current run, but it must not become the only place
   where business state, decisions, constraints, evidence, or learning exist.

2. Clear only after preservation proof.
   Automatic context clearing, compacting, or restarting is safe only when the
   valuable signals have been written or intentionally excluded through the
   correct Taskplane surface.

3. Rehydrate from structured memory, not raw transcript.
   A refreshed session should rebuild context from BusinessLineContextPack,
   Business Records, Reviews, Decisions, accepted SOPs, sources, artifacts, and
   current Next Action state.

4. Native agent features are capabilities, not product truth.
   Codex CLI or Claude Code may provide goals, skills, browser/computer reach,
   memory, compact, or automations. They become Taskplane features only when the
   adapter exposes evidence and Taskplane routes them through business-line
   ownership, permissions, review, and write gates.

5. Retrieval must be scoped before it is smart.
   Deterministic owner-aware retrieval comes before RAG/vector search. Semantic
   search is useful only after the corpus is clean, typed, permissioned, and
   provenance-aware.

6. The smallest useful movement wins.
   If a clean Business Record fixes context recovery, do not invent a new
   workflow object. If a Next Action needs only one verifier, do not start a
   scheduler rewrite.

## Non-Goals

- Do not replace Business Records, Reviews, Decisions, or SOP revisions with
  saved raw transcripts.
- Do not make durable threads a new top-level product object.
- Do not introduce vector/RAG infrastructure as the first slice.
- Do not promote Agent API execution or imply API/CLI parity.
- Do not duplicate MCP, runtime, provider, or external-access settings per
  business line.
- Do not rename Taskplane or GoalPilot broadly in this migration.
- Do not redesign the business-line product model again.

## Current Implementation Assessment

### Already Aligned

- `docs/specs/context-transition-policy.md` already states that chat is
  temporary working memory and that context clearing cannot bypass
  business-line recovery.
- `docs/specs/task-memory-spec.md` already defines business-line memory
  coverage: BusinessLineContextPack, current Next Action, blockers, Decisions,
  Business Records, Reviews, accepted SOPs, files, sources, artifacts, evidence,
  and Work Habits.
- `src/main/domain/business-line/business-line-service.ts` already builds a
  BusinessLineContextPack.
- Native CLI runs already receive business-line context through the CLI adapter
  path.
- Handoff V2 already distinguishes:
  - `ephemeral_session_handoff`
  - `durable_business_handoff`
  - `next_action_handoff`
  - `runtime_or_subagent_handoff`

### Partially Aligned

- `src/shared/context-preservation.ts` can infer durable business handoff when
  business-line context exists, but surrounding call sites still often pass
  task-first assumptions.
- Runtime handoff, context refresh, and right-panel archive flows know how to
  preserve context, but many visible and writeback paths still default to
  Task.md or Task Records.
- `RuntimeContextManifest` has a strong task memory shape, but it does not yet
  make `business_line` and `next_action` first-class active surfaces.
- Existing deterministic task-memory retrieval is a good foundation, but it is
  not yet a business-memory retrieval layer.

### Drift To Fix

- Auto context clear readiness still evaluates task context first.
- RightPanel context refresh can require `taskId` even when the active owner is
  a business line.
- Context reset/restart does not consistently prove that Business Records,
  Reviews, accepted SOPs, Decisions, and current Next Action state are enough to
  recover without the old transcript.
- Runtime context and retrieval naming can still imply that task memory is the
  primary memory surface.

## Codex Feature Translation

These are design references, not copy targets. Official Codex docs describe
Codex as an agentic coding environment with goals, skills, browser/computer
reach, automations, and review surfaces. Taskplane should borrow the underlying
job-to-be-done and translate it into business-line control.

Reference:
- `https://developers.openai.com/codex/explore`
- User-provided Codex feature notes/screenshots.
- `https://www.aihero.dev/skills-handoff`

| Codex Pattern | Problem It Solves | Taskplane Translation |
| --- | --- | --- |
| Durable threads | Avoid re-explaining context across long work | Business Line plus typed context transition. Persist signals into Business Records, Reviews, Decisions, SOP revisions, sources, artifacts, and Next Action memory instead of relying on a pinned raw chat. |
| Goals | Let the agent keep moving until a measurable endpoint | Goal Contract on a Next Action or business-line movement: objective, verifier, stop condition, risk boundary, owner, and recovery plan. |
| Automations | Let long-running work continue when the user is away | Business-line loop carriers: scheduled/event/routine Next Actions with Standing Approval or Decision gates. |
| Steering | Correct a running task without restarting it | Run Steering: user intervention creates a bounded correction event, updates run evidence, and may produce a Business Record or Decision. |
| Queueing | Add follow-up work without interrupting current work | Next Action queue inside the business line. New work is proposed or queued behind the current run with owner and risk labels. |
| Side panel | Review artifacts beside the conversation | Taskplane RightPanel / artifact inspector should show generated files, sources, writeback proposals, review candidates, and preservation preview. |
| Shared memory | Make knowledge available across sessions | Business Memory: typed records with provenance and scope, plus accepted SOPs and Work Habits. Cross-business reuse must be explicit. |
| Tools and reach | Let the agent operate browsers, apps, files, MCP, and skills | Capability allowance manifest: selected runtime plus scoped file/tool/MCP/browser/computer-use surfaces. Runtime may act only inside the allowed envelope. |
| Work from anywhere | Let a local or remote run continue with progress visible | Durable run state, run steps, checkpoints, notifications, and recoverable handoff. Mobile/remote is a later surface, not a different memory model. |

### Important Product Boundary

Using Codex CLI does not automatically mean Taskplane ships every Codex product
feature. The native CLI may contain an internal version of a feature, but
Taskplane should treat it as available only when all of the following are true:

```text
adapter capability declares it
run evidence proves it happened
business-line owner is known
permissions are scoped
Taskplane write gates apply durable state
UI can show status, review, or recovery when needed
```

This protects Taskplane from silently depending on runtime-local memory that
cannot be inspected, reset, reviewed, or recovered by the product.

## Target Model

### Context Owner

Introduce or normalize one shared owner vocabulary:

```ts
type ContextOwner =
  | { kind: "global" }
  | { kind: "business_line"; businessLineId: string }
  | { kind: "next_action"; businessLineId: string; actionId: string; taskId?: string }
  | { kind: "legacy_task"; taskId: string; businessLineId?: string };
```

The owner answers:

- What durable surface owns this memory?
- What execution carrier is active, if any?
- Is this one-off chat, business work, Next Action execution, or legacy task
  recovery?
- Which records and SOPs may enter future context?

### Business Memory Coverage

Add a business-memory evaluator beside legacy task-memory coverage:

```text
BusinessMemoryCoverageEvaluation
owner
status: pass | needs_memory_write | needs_user_clarification | blocked | not_applicable
missing: structured reasons
requiredWrites: proposed Business Record / Review / Decision / SOP / Next Action
recoveryQuestions: goal, state, next step, constraints, evidence
preservationProofReady: boolean
```

The evaluator should use the existing Task Memory Spec rules and extend them to
business-line owners. It should not weaken task recovery gates for legacy tasks.

### Context Transition Plan

Every clear, compact, restart, handoff, or phase switch should produce a plan:

```text
ContextTransitionPlan
owner
strategy: keep | compact | preserve_and_reset | create_handoff | continue
resetStrategy: runtime_compact | runtime_native_clear | runtime_restart | product_transcript_reset | none
handoffType
preservationProof
writebackTarget
rehydrationPlan
blockedReason
```

### Rehydration Plan

After compact/reset/restart, Taskplane rebuilds context from:

```text
BusinessLineContextPack
current Next Action / task execution memory
active Decisions and blockers
recent Business Records / Reviews with shouldAffectFutureContext=true
accepted, non-expired SOP revisions
selected sources and artifacts
recent run evidence
Work Habits
explicit handoff recovery artifact
```

### Retrieval Before RAG

The first release should implement deterministic business-memory retrieval:

- owner filter first;
- status filter second;
- future-context flag third;
- freshness and provenance fourth;
- keyword/query relevance after that.

Only after this is stable should Taskplane add semantic retrieval. If added,
semantic results must still pass strict filters:

```text
businessLineId
source business line if cross-business
shouldAffectFutureContext
record type
SOP status
Decision status
provenance
sensitivity
freshness
permission scope
```

Wiki/folder structure can remain a human-readable projection. It should not be
the only machine-readable memory source.

## Product Experience Requirements

### 1. Context Refresh / Reset

When the user refreshes or clears context, show:

- current owner: Global, Business Line, Next Action, or Legacy Task;
- what will be preserved;
- where it will be written;
- what will be excluded;
- whether the next session can recover goal, state, next action, constraints,
  and evidence.

Low-risk, already-covered refresh can proceed with compact UI. Risky or
incomplete refresh should ask for the missing decision or memory write.

### 2. Goal Continuation

A long goal should not repeatedly stop for non-material confirmation. It should
continue while:

- acceptance criteria are clear;
- stop conditions are not met;
- risk boundary is not crossed;
- memory coverage remains recoverable;
- writeback proposals stay inside approved surfaces.

It must stop when:

- a user decision is needed;
- ownership is unclear;
- a durable write is risky;
- context cannot be safely preserved;
- verifier fails or contradicts the goal.

### 3. Steering And Queueing

While a run is active:

- steering changes the current run's direction and records a correction event;
- queueing adds a proposed Next Action behind the current run;
- neither should silently mutate Business Records or SOPs without a write gate.

### 4. Side Panel Review

The RightPanel should remain the review and control surface for:

- active owner and context indicator;
- generated artifacts and files;
- writeback proposals;
- run evidence and verification status;
- Business Record / Review / SOP candidates;
- preservation preview before clear/reset.

### 5. Shared Memory

Shared memory should mean typed business memory, not one global transcript.

- Global Work Habits may be shared by default.
- Business-line SOPs are scoped to their business line.
- Cross-business reuse is explicit and should appear as inherited evidence or a
  proposed SOP, not automatic context pollution.

## Implementation Goals

Each goal should be run independently and stop at a checkpoint unless the prompt
explicitly asks for commit/push.

### Goal 0: Drift Audit

#### Objective

Audit the current implementation against this plan without changing product
behavior.

#### Acceptance

- Identify all task-first context clear/reset/retrieval paths.
- Classify each as aligned, compatibility adapter, needs owner change, needs
  writeback routing change, needs UI wording change, or should not change now.
- Update this document with an implementation drift appendix.
- No product behavior changes.

#### Verification

```bash
rg -n "auto-context|context refresh|context clear|compact|reset|RuntimeContextManifest|BusinessLineContextPack|task-memory|Task Records|Task.md|handoff|retrieval" src/main src/shared src/renderer docs/specs docs/plans
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Business Memory Agent Experience Goal 0 only - drift audit.

Read:
- AGENTS.md
- docs/specs/goalpilot-task-advancement-framework.md
- docs/specs/task-memory-spec.md
- docs/specs/context-transition-policy.md
- docs/specs/native-agent-capability-mapping.md
- docs/plans/2026-05-31-business-memory-agent-experience-plan.md

Inspect current context clear/reset/compact/handoff/retrieval implementation.
Update the plan with an implementation drift appendix. Classify each finding as
aligned, compatibility adapter, needs owner change, needs writeback routing
change, needs UI wording change, or should not change now.

Do not change product behavior. Run verification and stop with a checkpoint.
```

### Goal 1: Context Owner And Business Memory Coverage

#### Objective

Create shared owner and coverage primitives so clear/reset/retrieval can reason
about business lines, Next Actions, legacy tasks, and global chat consistently.

#### Required Behavior

- Add a typed owner model or normalize the existing one.
- Add BusinessMemoryCoverageEvaluation.
- Keep legacy task-memory coverage intact.
- Coverage should answer whether context can be cleared, compacted, reset, or
  handed off.
- Tests cover business-line pass, missing Business Record, pending Decision,
  Next Action carrier, legacy task, and global not-applicable cases.

#### Verification

```bash
npm test -- src/shared/auto-context-clear-readiness.test.ts src/shared/context-preservation.test.ts src/shared/task-memory-coverage.test.ts -t "business|owner|coverage|clear|legacy|global"
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Business Memory Agent Experience Goal 1 only - context owner and business memory coverage.

Add or normalize a shared ContextOwner model for global, business_line,
next_action, and legacy_task.

Add BusinessMemoryCoverageEvaluation beside existing task-memory coverage.
Do not weaken legacy task coverage. Do not change RightPanel behavior yet.

Add focused tests and stop with a checkpoint.
```

### Goal 2: Owner-Aware Preservation And Writeback Routing

#### Objective

Make context preservation choose the correct durable surface from the owner and
handoff type.

#### Required Behavior

- Business-line context refresh writes or proposes Business Record.
- Next Action execution handoff writes or proposes Task Record / Task.md only
  when execution recovery needs it.
- Runtime/subagent output remains Run/Run Step or writeback proposal.
- Ephemeral session refresh may use temporary proof or no durable write when no
  valuable signal exists.
- Raw transcript is never written as product truth.

#### Verification

```bash
npm test -- src/shared/context-preservation.test.ts src/shared/context-transition.test.ts src/shared/taskplane-writeback-proposal.test.ts src/shared/taskplane-writeback-approval.test.ts -t "business|handoff|writeback|owner|transcript|temporary"
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Business Memory Agent Experience Goal 2 only - owner-aware preservation and writeback routing.

Route context preservation by ContextOwner and Handoff V2 type:
- business_line -> Business Record
- next_action -> Task Record/Task.md only for execution recovery
- runtime_or_subagent -> Run/Run Step or writeback proposal
- ephemeral_session -> temporary proof or no durable write when no valuable signal exists

Do not dump raw transcripts. Add focused tests and stop with a checkpoint.
```

### Goal 3: RightPanel And Chat Context Refresh Migration

#### Objective

Move RightPanel/fullscreen chat refresh from task-bound assumptions to
owner-aware context transition.

#### Required Behavior

- Context indicator names the active owner.
- Business-line chat can refresh without a taskId when coverage passes.
- Next Action chat still preserves execution state when needed.
- Preview shows preserved signals, target surface, excluded noise, and recovery
  status.
- Existing legacy task refresh still works.

#### Verification

```bash
npm test -- src/renderer/App.test.tsx src/renderer/components/RightPanel.test.tsx -t "context refresh|business line|Next Action|legacy task|preservation|owner"
npm test -- src/shared/auto-context-clear-readiness.test.ts src/shared/runtime-handoff.test.ts -t "business|refresh|reset|handoff"
npm run lint
npm run build
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Business Memory Agent Experience Goal 3 only - RightPanel and Chat context refresh migration.

Update RightPanel/fullscreen Chat context refresh to use ContextOwner and
BusinessMemoryCoverageEvaluation. Business-line chat must not require taskId.
Next Action and legacy task refresh must keep execution recovery behavior.

Show preservation target, exclusions, and recovery readiness in the preview.
Add focused tests and stop with a checkpoint.
```

### Goal 4: Runtime Context Manifest Surfaces

#### Objective

Make runtime context assembly explicitly business-line/Next-Action aware.

#### Required Behavior

- RuntimeContextManifest supports `global`, `business_line`, `next_action`,
  `legacy_task`, and `task_file` surfaces.
- BusinessLineContextPack is loaded for business-line and Next Action runs.
- Legacy task surfaces remain compatibility adapters.
- Manifest records included/excluded memory sources and why.
- Native CLI adapter contract can report the manifest summary.

#### Verification

```bash
npm test -- src/shared/runtime-context.test.ts src/shared/native-cli-adapter-contract.test.ts src/main/domain/agent-cli/agent-cli-run-service.test.ts -t "business_line|next_action|legacy_task|manifest|context pack"
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Business Memory Agent Experience Goal 4 only - runtime context manifest surfaces.

Extend RuntimeContextManifest to make business_line and next_action first-class
active surfaces while keeping legacy task compatibility. Include
BusinessLineContextPack and exclusion reasons in the manifest summary.

Do not change Agent API promotion. Add focused tests and stop with a checkpoint.
```

### Goal 5: Goal-Aware Compact And Reset

#### Objective

Let long goals continue through safe compact/reset without losing business
memory or repeatedly asking for non-material confirmation.

#### Required Behavior

- Add a Goal Context Transition check that combines:
  - goal objective;
  - verifier or stop condition;
  - current owner;
  - coverage status;
  - pending Decisions;
  - run evidence;
  - next safe action.
- Compact/reset is allowed only after preservation proof passes.
- If native runtime compact/clear is unavailable, use product transcript reset
  and rehydrate from memory.
- Failed coverage blocks reset and produces the smallest missing write or
  clarification request.

#### Verification

```bash
npm test -- src/shared/auto-context-clear-readiness.test.ts src/shared/context-transition.test.ts src/shared/agent-runtime-goal.test.ts src/main/domain/run/run-service.test.ts -t "goal|compact|reset|coverage|preservation|verifier"
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Business Memory Agent Experience Goal 5 only - goal-aware compact and reset.

Add a deterministic check that decides whether a long goal can compact/reset
based on owner, verifier, stop condition, business memory coverage, pending
Decisions, run evidence, and next safe action.

Use product transcript reset when native runtime compact/clear is unavailable.
Do not claim native runtime memory was cleared unless adapter evidence exists.

Add focused tests and stop with a checkpoint.
```

### Goal 6: Business Memory Retrieval Foundation

#### Objective

Create deterministic business-memory retrieval before adding semantic/RAG.

#### Required Behavior

- Retrieve records by owner first.
- Include Business Records, Reviews, accepted SOPs, active Decisions, selected
  sources, artifacts, current Next Action, recent run evidence, and Work Habits.
- Exclude records with `shouldAffectFutureContext=false` unless explicitly
  requested.
- Exclude proposed/rejected/expired/disabled SOPs from active context.
- Cross-business memory is excluded unless explicitly selected.
- Return reasons for included and excluded items.

#### Verification

```bash
npm test -- src/shared/task-memory-retrieval.test.ts src/main/domain/business-line/business-line-service.test.ts src/shared/memory-surface-policy.test.ts -t "business memory|retrieval|future context|SOP|cross-business|source|artifact|Decision"
npm run lint
npm run build:main
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Business Memory Agent Experience Goal 6 only - deterministic business memory retrieval.

Build owner-scoped deterministic retrieval for Business Records, Reviews,
accepted SOPs, active Decisions, selected sources, artifacts, current Next
Action, recent run evidence, and Work Habits.

Do not add embeddings/vector/RAG yet. Add inclusion/exclusion reasons and
focused tests. Stop with a checkpoint.
```

### Goal 7: Steering And Queueing

#### Objective

Translate Codex-style steering and queueing into Taskplane business-line runs.

#### Required Behavior

- Steering creates a bounded run correction event.
- Queueing creates or proposes a Next Action behind the current run.
- Both preserve owner, risk, evidence, and writeback gate.
- Steering cannot silently update SOPs or Decisions.
- Queueing cannot interrupt a running action unless the user confirms.

#### Verification

```bash
npm test -- src/main/domain/run/run-service.test.ts src/shared/taskplane-writeback-proposal.test.ts src/main/domain/business-line/business-line-service.test.ts src/renderer/App.test.tsx -t "steering|queue|Next Action|run correction|business line"
npm run lint
npm run build
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Business Memory Agent Experience Goal 7 only - steering and queueing.

Add product-level steering and queued Next Action semantics for business-line
runs. Steering is a bounded correction to the current run. Queueing proposes or
adds follow-up work behind the current run.

Do not bypass write gates or Decisions. Add focused tests and stop with a checkpoint.
```

### Goal 8: Side Panel Artifact And Preservation Review

#### Objective

Make the side panel the review surface for artifacts, writebacks, and context
preservation.

#### Required Behavior

- Show generated artifacts/files beside the active conversation.
- Show Business Record / Review / SOP candidates before durable write.
- Show context preservation preview before refresh/reset.
- Show run evidence and verifier status.
- Keep UI compact; no new heavy dashboard.

#### Verification

```bash
npm test -- src/renderer/App.test.tsx src/renderer/components/RightPanel.test.tsx -t "artifact|preservation|review|Business Record|SOP|writeback|evidence"
npm run lint
npm run build
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Business Memory Agent Experience Goal 8 only - side panel artifact and preservation review.

Improve the RightPanel review surface for artifacts, writeback proposals,
Business Record/Review/SOP candidates, preservation preview, and run evidence.

Keep the UI compact. Do not create a new dashboard. Add focused tests and stop
with a checkpoint.
```

### Goal 9: RAG / Wiki Decision Checkpoint

#### Objective

Decide whether semantic retrieval or wiki-style memory projection is needed for
the first release after deterministic retrieval exists.

#### Required Behavior

- Audit deterministic retrieval quality.
- Define what semantic retrieval would add.
- Define what wiki/folder projection would add.
- Decide: defer, prototype behind flag, or implement minimal local index.
- No production vector dependency unless explicitly approved.

#### Verification

```bash
rg -n "retrieval|Business Record|SOP|shouldAffectFutureContext|embedding|vector|wiki|folder|source" src/main src/shared src/renderer docs/specs docs/plans
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Business Memory Agent Experience Goal 9 only - RAG/wiki decision checkpoint.

After deterministic business-memory retrieval exists, audit whether semantic
retrieval or wiki/folder projection is needed for first release.

Update the plan with a recommendation: defer, prototype behind flag, or
implement minimal local index. Do not add a production vector dependency.
Stop with a checkpoint.
```

### Goal 10: Closeout Audit And RC Test Update

#### Objective

Prove the context/memory experience is ready for manual RC testing.

#### Required Behavior

- Add or update product audit checks for business-memory context transition.
- Update RC product chain test plan with manual steps:
  - create business line;
  - discuss in chat;
  - execute Next Action;
  - preserve/refresh context;
  - rehydrate context;
  - continue goal;
  - review artifact/writeback;
  - create Business Record/Review/SOP proposal.
- Audit should distinguish CLI-first ready from Agent API deferred.

#### Verification

```bash
npm test -- src/shared/product-feature-impact-audit.test.ts src/main/local-smoke-boundaries-script.test.ts
npm run audit:product-progress -- --next
npm run lint
npm run build
git diff --check
```

#### Codex Prompt

```text
Goal: Complete Business Memory Agent Experience Goal 10 only - closeout audit and RC test update.

Add or update audit coverage for business-memory context transition. Update the
RC test plan with manual steps for business-line discussion, Next Action
execution, context preservation/reset, rehydration, continuation, artifact
review, and Business Record/Review/SOP proposal.

Keep CLI-first ready and Agent API deferred clearly separated. Run verification
and stop with a checkpoint.
```

## Expected First-Release State

After these goals:

- Business-line chat and Next Action execution can safely compact/reset/restart
  without losing recovery state.
- Context reset is not raw transcript deletion; it is preservation proof plus
  rehydration from typed memory.
- Native CLI remains the production execution path.
- Agent API remains a gated same-level future runtime.
- Codex-inspired features are represented as Taskplane primitives:
  - durable thread -> business memory and handoff;
  - goal -> Goal Contract and verifier;
  - automation -> business-line loop carrier;
  - steering -> run correction;
  - queueing -> Next Action queue;
  - side panel -> review/writeback/preservation surface;
  - shared memory -> scoped Business Records/SOP/Decisions.

## Open Decisions

1. Should fullscreen chat and RightPanel always share the same active
   ContextOwner, or can fullscreen chat temporarily operate in global mode with
   explicit writeback target?
2. Should business-line context refresh auto-write a low-risk Business Record
   after preview, or always require manual confirmation for the first release?
3. Should Context Inspector be visible in the first release, or only available
   as debug/audit output?
4. When deterministic retrieval works, should semantic retrieval be deferred or
   prototyped behind a local-only feature flag?

## Sources

- OpenAI Codex Explore: `https://developers.openai.com/codex/explore`
- AIHero handoff reference provided by the user:
  `https://www.aihero.dev/skills-handoff`
- User-provided Codex feature notes and screenshots in the design discussion.
- User-provided YC self-improving company notes in the design discussion.


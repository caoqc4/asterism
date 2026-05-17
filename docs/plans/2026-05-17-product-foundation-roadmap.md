# Product Foundation Roadmap

This roadmap covers the product foundations that should be evaluated and
improved after the current runtime-deepening phase. It intentionally excludes
settled Tasks-page layout and interaction changes unless a foundation requires
data wiring into an existing component.

## Stage Status

The current runtime-deepening stage can pause as complete for retained entry
points. Current work should shift from adding broader runtime flows to
strengthening the foundations that runtime depends on:

- information classification and memory surfaces;
- capability and permission boundaries;
- retrieval and search;
- data model migration and repair;
- configuration and safety;
- cross-task learning;
- attention summaries.

The ordering below follows first principles:

1. The product is task-memory-first, so information and memory surfaces must be
   reliable before adding more automation.
2. Automation depends on capability boundaries, so capability state must be
   explicit before expanding external access or tool use.
3. Once memory grows, retrieval becomes the next bottleneck.
4. Data migrations and compatibility cleanup should follow the new canonical
   model instead of preceding it.
5. Brief and attention surfaces should consume stable data, not invent their
   own semantics.

## Package A: Information, Files, Sources, And Artifacts

Goal: make every durable information surface unambiguous.

Primary question:

> When something is saved, what is it, where does it belong, and how should AI
> reuse it later?

Scope:

- Task.md;
- Task Records;
- ordinary task files;
- AI output;
- artifacts;
- source materials;
- selected files;
- important references.

Tasks:

1. Audit all retained creation/update paths for task files, source contexts,
   artifacts, Task.md, and Task Records.
2. Define a single classification matrix:
   - durable recovery memory;
   - evidence/source material;
   - generated output;
   - user-authored artifact;
   - ordinary supporting file;
   - discussion-only.
3. Add or tighten regression tests for misclassification cases:
   - AI-generated notes must not become source materials;
   - source captures must not become Task Records unless record-worthy;
   - ordinary local files must not become artifacts by path alone;
   - Task.md and Task Records must not be created through generic file paths.
4. Register retained write entry points against the matrix:
   - surface;
   - write policy;
   - required guard;
   - whether the write is recovery memory, evidence, generated output, artifact,
     ordinary support, or judgment state.
5. Make source-quality metadata mandatory where it is known:
   - captured time;
   - source role;
   - traceability;
   - credibility;
   - duplicate signal;
   - sensitivity signal.
6. Update docs so each memory surface has a clear write/read standard.

Acceptance criteria:

- every retained write path is covered by a routing/classification test;
- task-memory guidance can point to the correct surface without text-pattern
  guessing for known structured writes;
- no new UI surface is required.

## Package B: Capability And Permission Registry

Goal: make available capabilities explicit, inspectable, and permission-bound.

Primary question:

> What can this Taskplane instance actually do right now, and what needs user
> approval before AI can use it?

Scope:

- model/provider readiness;
- External Access;
- Skills;
- MCP;
- workspace tools;
- sandbox/code-agent capabilities;
- scheduler/background execution;
- browser/operator-style capabilities.

Tasks:

1. Define a shared capability registry shape for retained capability families:
   - id;
   - status;
   - configured/missing reason;
   - model-visible or hidden;
   - read-only or mutating;
   - requires approval;
   - required runtime gate.
2. Map current Settings, Model, External Access, Skills, MCP, and sandbox
   configuration into that registry.
3. Connect provider-visible execution checks to the registry where they
   currently use ad hoc capability inputs.
4. Add tests that disabled, unconfigured, or approval-required capabilities
   cannot silently become model-visible.
5. Keep external connector ingestion deferred until the registry can express
   source quality and permission boundaries.

Acceptance criteria:

- runtime capability snapshots and UI capability pages agree on status;
- adding a new capability requires choosing visibility, permission, and gate;
- no capability is enabled merely because a page renders it.

Initial implementation: `CapabilityRegistry` projects the current runtime
capability snapshot into explicit capability entries for model provider, Code
Agent model producer, workspace, verification checks, scheduler, sandbox coding
agent, self-check, model-visible tools, checkpointed tools, and deferred
External Access / Skills / MCP / browser capability rows. Disabled or
unconfigured capabilities remain hidden from model-visible exposure. The
existing AI config status boundary now returns this registry so current and
future capability-facing UI can consume one shared data model. Sandbox coding
availability is based on feature flag plus backend probe/readiness, not the
feature flag alone. External Access, Skills, MCP, and browser/operator rows now
have an optional product-surface status input so they can be promoted from
deferred rows once their pages or services expose structured status. The
runtime snapshot also preserves tool scaffold family summaries, allowing Skills,
MCP, and browser/operator to appear as explicit hidden/unconfigured reserved
rows instead of generic deferred rows before their product pages expose richer
status. External Access remains deferred until connector status is available.

## Package C: Search, Retrieval, And Reference Index

Goal: make task memory findable without relying on chat context length.

Primary question:

> Given a task or user query, what saved facts should be read first?

Scope:

- tasks;
- Task.md;
- Task Records;
- task dynamics;
- Decisions;
- source contexts;
- artifacts;
- work habits;
- process templates.

Tasks:

1. Define a local search/index contract:
   - searchable entity type;
   - task binding;
   - title;
   - summary/content preview;
   - timestamps;
   - source quality metadata;
   - importance signals.
2. Start with deterministic local retrieval before adding embedding/vector work:
   - exact title/path search;
   - task-bound recent records;
   - key sources;
   - important files;
   - pending decisions;
   - active blockers/dependencies.
3. Add a read-order policy for task execution:
   - current Task.md;
   - relevant Task Records;
   - active decisions/blockers;
   - key source materials;
   - relevant artifacts;
   - applicable work habits.
4. Add tests for retrieval priority and exclusion:
   - archived or low-quality sources are not included by default;
   - unrelated task records do not outrank current task memory;
   - explicit selected files can be included with caution when relevance is weak.
5. Defer global semantic search UI until the deterministic index is reliable.

Acceptance criteria:

- task execution can assemble enough context from durable memory without
  relying on old chat;
- retrieval results carry inclusion/exclusion reasons;
- no large new search UI is required in this package.

Initial implementation: `TaskMemoryRetrieval` defines a deterministic local
search index and execution-memory retrieval order across task state, Task.md,
Task Records, task dynamics, Decisions, source contexts, artifacts, task files,
blockers, dependencies, Work Habits, and applied process templates. The first
ranking pass keeps current task state and Task.md ahead of pending Decisions,
active blockers/dependencies, current Task Records, key sources, artifacts, and
support files. Results carry include/caution/exclude decisions plus reasons;
archived or duplicate sources are excluded by default, sensitive sources are
included with caution, unrelated records are excluded unless the query matches,
and selected files can surface with caution without making them authoritative.
`RuntimeContextManifest` now consumes this retrieval projection directly and
emits a compact `memory_retrieval` summary for provider-visible step context,
so retained Run / RightPanel execution paths share the same read-order signal
instead of rebuilding local lists.

## Package D: Data Model, Migration, And Repair

Goal: make canonical data fields authoritative and legacy compatibility bounded.

Primary question:

> Which fields are the source of truth, and how do old records become safe?

Scope:

- task hierarchy;
- task type/facets;
- file/source/artifact relationships;
- decision links;
- run/task dynamic links;
- schema migrations;
- repair plans.

Tasks:

1. List canonical fields per core domain object.
2. List legacy fallback fields and the exact condition under which they may be
   read.
3. Add migration/repair diagnostics for:
   - missing parent/child backlinks;
   - stale renderer-local hierarchy attributes;
   - orphaned file/source/artifact records;
   - decisions without valid task/source context where task binding is expected.
4. Keep automatic repairs limited to mechanically safe cases.
5. Route ambiguous repair cases to Decisions as judgment-center maintenance
   items.

Acceptance criteria:

- new writes use canonical fields only;
- compatibility fallback is read-only and documented;
- unsafe repairs produce explicit Decisions instead of silent mutation.

Initial implementation: `CanonicalDataContract` lists authoritative fields,
write/read authority, legacy fallback rules, and repair routes for task state,
task hierarchy, task files, source contexts, artifacts, Decisions, run events,
task dynamics, Work Habits, and process templates. Hierarchy fallback is now
documented as read-only and only allowed while persisted `parentTaskId` /
`childTaskIds` fields are genuinely missing; title-pattern hierarchy inference
is also bounded to that legacy case. Artifact classification has no folder-name
fallback, source-context keyword classification is below explicit `sourceRole`,
and ambiguous hierarchy/decision repairs route to Decisions rather than silent
mutation.
`CanonicalDataDiagnostics` now adds read-only mechanical checks for missing
canonical fields, orphan task references, and task-scoped Decisions without a
valid task binding, giving migration and repair work a shared checklist before
any writer mutates data.

## Package E: Configuration, Safety, And Auditability

Goal: keep local-first power features understandable and safe.

Primary question:

> What can change local data, spend provider credits, access external systems,
> or touch workspace files?

Scope:

- config.json;
- keychain secrets;
- environment overrides;
- provider config;
- workspace root;
- sandbox and patch promotion;
- external access credentials;
- scheduler settings;
- audit events.

Tasks:

1. Normalize configuration state into:
   - configured;
   - missing;
   - disabled by flag;
   - disabled by policy;
   - approval required.
2. Add tests for precedence:
   - environment variables;
   - local config;
   - keychain;
   - feature flags.
3. Ensure every mutating or costly action has:
   - runtime gate;
   - user-visible reason when blocked;
   - audit/task dynamic event when executed.
4. Keep live provider, Docker, browser, and external-service checks manual or
   explicitly opted in.
5. Document the safety boundary for capability pages.

Acceptance criteria:

- configuration reads never expose secrets to renderer or model context;
- dangerous capability probes do not run at startup;
- blocked actions explain the exact missing config or approval.

Initial implementation: `ConfigurationSafetyReport` projects existing
`AiConfigStatus` plus `CapabilityRegistry` into safety-facing surfaces for
model provider, API key presence, workspace root, scheduler, sandbox coding,
sandbox patch promotion, External Access, and browser/operator. It normalizes
states into configured, missing, disabled-by-flag, disabled-by-policy, and
approval-required; records whether approval is needed; and marks startup probe
policy as never, safe-read-only, or manual-only. API key state only reports the
source class (`env`/`keychain`/missing) and never exposes secret values.
Provider spend, sandbox, browser, and external-service checks remain manual or
explicitly opted in.
`AiConfigService` now attaches this report to `AiConfigStatus`, so existing
settings/model/capability service consumers can read one shared safety
projection without a new UI or IPC boundary.

## Package F: Work Habits, SOPs, And Method Library

Goal: make cross-task learning useful without turning one-off facts into rules.

Primary question:

> What should Taskplane remember across tasks, and what should stay inside the
> current task?

Scope:

- Work Habits;
- SOP extraction;
- process templates;
- preference memory;
- conflict resolution;
- task-specific corrections.

Tasks:

1. Define the boundary between:
   - task-specific Task Record;
   - cross-task Work Habit;
   - reusable SOP;
   - process template;
   - temporary discussion.
2. Add or tighten intake tests for corrections and preferences:
   - "this task should..." stays task-bound;
   - "always / next time / by default..." can become Work Habit proposal;
   - process instructions with repeated workflow shape can become SOP/template.
3. Add conflict detection rules:
   - new habit conflicts with confirmed habit;
   - SOP proposal duplicates existing template;
   - task-specific exception should not overwrite global habit.
4. Keep AI-learned items proposal-based unless explicitly confirmed.
5. Ensure applicable Work Habits are included in execution context with reasons.

Acceptance criteria:

- cross-task memory writes require proposal/confirmation;
- task-specific corrections do not leak into global behavior;
- execution context can explain which habits were applied.

Initial implementation: `CrossTaskLearningBoundary` classifies candidate
learning text into task records, Work Habit proposals, process-template/SOP
proposals, or discussion-only. Task-specific corrections stay task-bound;
global preference wording becomes a pending Work Habit proposal; reusable
step/process language becomes a process-template proposal; and temporary
brainstorming stays out of durable cross-task memory. All cross-task learning
surfaces require confirmation before they affect future execution.
`WorkHabitService` now consumes the boundary before retained Work Habit
proposal and SOP-template writes, so task-specific corrections are rejected at
the service boundary instead of relying on UI or prompt discipline.

## Package G: Brief And Attention System

Goal: keep Brief as an attention summary, not a second task manager.

Primary question:

> What should the user notice today, and why?

Scope:

- Brief page;
- priority projection;
- external signals;
- pending decisions;
- blockers;
- recent task dynamics;
- today/history summary.

Tasks:

1. Confirm Brief consumes shared priority/attention projection instead of its
   own ordering.
2. Define Brief inclusion lanes:
   - unblock or decide;
   - continue next step;
   - review evidence;
   - external signal;
   - recent completion/failure.
3. Add explanation fields for why an item appears in Brief.
4. Keep display limits explicit and separate from Tasks full queue.
5. Defer layout changes unless the data projection cannot express the current
   behavior.

Acceptance criteria:

- Brief and Tasks share ordering for the same candidate set;
- Brief can explain inclusion and display-limit behavior;
- Brief does not own task state transitions beyond existing guarded actions.

Initial implementation: `BriefAttentionBoundary` consumes the shared
`PriorityAttentionProjection` rather than introducing a separate Brief sorter.
It maps displayed candidates into explicit Brief lanes: unblock/decide,
continue next step, review evidence, external signal, and recent outcome. The
projection preserves total count, displayed count, truncation, and display
limit so Brief can remain a capped attention summary while Tasks owns the full
queue.
`HomeBriefData` now exposes that attention summary beside `recommendedActions`,
so the current Brief layout can stay stable while future UI can show richer
attention explanations from the shared projection.
`BriefExecutor` also consumes the attention summary, so scheduled/fallback
briefs preserve the rule that Brief is a capped attention summary and Tasks
owns the full queue.

## Recommended Execution Order

1. Package A: Information, Files, Sources, And Artifacts.
2. Package B: Capability And Permission Registry.
3. Package C: Search, Retrieval, And Reference Index.
4. Package D: Data Model, Migration, And Repair.
5. Package E: Configuration, Safety, And Auditability.
6. Package F: Work Habits, SOPs, And Method Library.
7. Package G: Brief And Attention System.

Packages A-C should run first because they directly determine whether task
memory can replace long chat context. Packages D-E should follow to reduce
legacy and safety risk. Packages F-G should consume the stabilized memory and
capability layers rather than inventing parallel logic.

## First Implementation Slice

Start with Package A, but keep the slice narrow:

1. Inventory retained write paths for task files, source contexts, artifacts,
   Task.md, and Task Records.
2. Create a shared "memory surface classification matrix" as code or docs.
   Initial implementation: `MemorySurfacePolicy` maps runtime surfaces to
   recovery memory, evidence source, generated output, user artifact,
   supporting file, decision boundary, execution event, cross-task rule, or
   discussion-only.
3. Add regression tests for the known confusing cases:
   - AI output vs source material;
   - artifact vs ordinary local file;
   - Task Record vs source capture;
   - reserved Task.md / Task Records paths.
4. Register retained write entrypoints with surface, write policy, and guard
   coverage so future durable writers cannot bypass the classification matrix.
5. Normalize source-context quality metadata at the service boundary:
   - source role;
   - explicit unknown credibility;
   - duplicate signal;
   - sensitive-data signal.
6. Update only data/routing helpers and tests unless a current UI component is
   already rendering the wrong label from existing data.

Do not start with connector ingestion, semantic search, batch Decisions, or new
UI pages. Those depend on the foundations above.

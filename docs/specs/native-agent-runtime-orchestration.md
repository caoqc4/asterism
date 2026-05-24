# Native Agent Runtime Orchestration

Document id: `taskplane.native-agent-runtime-orchestration.v1`
Owner: Taskplane product architecture
Layer: architecture spec / runtime orchestration
Load: runtime adapter changes, Write Intent, DecisionBackend, progress projection, CLI/API boundaries
Scope: native Agent CLI, future Agent API, Taskplane control and decision layers
Authority: implementation-guiding; product state authority and write gates are required
Status: Architecture decision, implementation-guiding

## Purpose

Taskplane should use mature Agent CLIs for execution without giving up
Taskplane's authority over task state, structured memory, source evidence, and
workflow decisions.

This spec defines the architecture that connects:

- Taskplane control plane;
- native Agent CLI runtimes such as Codex CLI and Claude Code;
- the future Agent API Runtime;
- the decision and write-intent layer between execution output and durable
  Taskplane data.

It exists because "CLI can execute" and "Taskplane can remember" are not enough
by themselves. The product needs a stable bridge that decides what AI output
means for a task before anything is written into structured product state.

## First Principles

Taskplane has three non-transferable responsibilities:

1. **State authority**: task identity, hierarchy, status, blockers, next step,
   completion criteria, task memory, and source evidence are Taskplane data.
2. **Action boundary**: Taskplane decides when a run may start, when user
   confirmation is required, and which durable changes are allowed.
3. **Traceability**: Taskplane must preserve why a task moved, which runtime
   produced evidence, which sources were used, and who confirmed durable writes.

Native CLIs already provide mature reasoning, research, code navigation, and
tool execution. Codex Goal Mode is an example of this: it is a runtime-native
persistent objective loop, not a replacement for Taskplane task state.
Taskplane should not rebuild mature execution loops unless it has a
product-specific reason.

The minimal correct architecture is therefore:

```text
Taskplane controls state and writes.
Native CLIs execute and produce evidence.
The decision/write-intent layer interprets evidence into Taskplane changes.
```

Do not give a runtime direct write access to Taskplane structured data. Allow it
to propose structured write intent.

## Relationship To Existing Specs

- `taskplane.task-advancement-framework.v1` chooses the next kind of movement:
  ask, research, shape, decompose, execute, verify, persist, hand off, or pause.
- `taskplane.agent-operating-principles.v1` loads for execution-level rules,
  runtime runs, tools, subagents, state mutation, and completion claims.
- `taskplane.agent-output-contract.v1` decides how the chosen movement appears
  in chat, progress cards, drafts, run detail, and memory proposals.
- `taskplane.task-memory-spec.v1` defines durable memory surfaces and write
  standards.
- `taskplane.native-agent-capability-mapping.v1` maps Codex and Claude Code
  plan, goal, memory, compact, skills, hooks, subagents, status, and review
  capabilities into Taskplane product states.
- `taskplane.decision-layer-writeback-orchestration.v1` defines how decision
  skills, hooks, gates, Write Intent, and product write services close the loop
  after runtime execution.
- This spec defines how native runtimes, future API runtimes, and Taskplane's
  decision/write-intent bridge cooperate without blurring authority boundaries.

If this spec conflicts with a runtime's convenience behavior, Taskplane's state
authority wins. Runtime-native features may assist execution or judgment, but
they do not replace Taskplane's write, confirmation, or verification gates.

## Codex Goal Mode Relationship

Codex `/goal` is an executor capability: a persistent objective attached to a
Codex thread or CLI session. GoalPilot is the product control layer above that
capability. Therefore:

- Taskplane `/goal` sets the durable Taskplane Task Goal and acceptance
  conditions.
- Codex native Goal Mode can later implement a long-running execution run when
  the selected adapter proves command shape, state reflection, progress,
  cancellation, memory, source-of-truth, and packaged smoke evidence.
- A runtime-native goal result is still evidence. Taskplane must verify it,
  extract Write Intent, and persist through Taskplane services.
- Native goal forwarding must stay explicit; product `/goal` must not silently
  become Codex `/goal`.

As of the current adapter policy, Codex CLI `0.133.0+` is modeled as having the
native goal capability available, but Taskplane passthrough remains closed until
the native goal readiness gate is satisfied.

## Architecture Layers

### 1. Taskplane Control Plane

The control plane owns product truth:

- structured task state;
- task hierarchy and dependency state;
- Task.md and Task Records;
- Source Contexts and source metadata;
- Decisions and approval boundaries;
- Run records, Run steps, and verification records;
- GoalPilot and execution policy documents;
- user confirmation and write authority.

The control plane is the only layer allowed to perform durable Taskplane writes.

### 2. Decision / Write Intent Layer

The decision layer converts task context and AI evidence into product-level
intent:

- should the task ask, research, execute, decompose, persist, pause, or close?
- what memory, decision, source, subtask, next-step, blocker, or completion
  update is being proposed?
- is the proposal valid for the selected task and current phase?
- does the proposal require user confirmation?
- what evidence supports the proposal?

This layer is not a runtime. It is product orchestration. It may use rules,
native CLI decision runs, or future API evaluators as backends, but the layer
itself belongs to Taskplane.

The detailed writeback contract for this layer lives in
`docs/specs/decision-layer-writeback-orchestration.md`.

### 3. Runtime Layer

The runtime layer runs AI work and returns evidence:

- Codex CLI adapter;
- Claude Code adapter;
- future Agent API adapter;
- subprocess lifecycle, cancellation, timeout, sandbox, command preview;
- runtime event parsing;
- terminal output and event evidence.

Runtime adapters must not decide durable task state. They may provide output,
events, proposed intents, persistent goal loop evidence, and execution evidence.

## Product Rule Skills And Hooks

Taskplane uses the word "skill" in two different product senses:

- **Product runtime rules** are built-in specs that shape Taskplane-controlled
  Agent runtime behavior. They include GoalPilot, Agent Operating Principles,
  Agent Output Contract, Task Memory Spec, and this orchestration spec. They
  may appear in the Skills page for transparency, but they are not optional
  user tools and cannot be disabled from that page.
- **Optional user skills** are reusable workflows or tools that may later be
  enabled, configured, and exposed to a model through explicit runtime gates.

GoalPilot is the only always-loaded product rule. Other product runtime rules
are phase-loaded when GoalPilot or the runtime movement needs them.

If a rule must always hold, it belongs in a deterministic hook, validator,
service guard, confirmation gate, or test. Product-rule prose can guide an
Agent, but it must not be the only enforcement for durable writes, task state
transitions, child task creation, context clearing, source ingestion,
completion claims, or external side effects.

## Current Implementation State

### Supported Now

Taskplane currently has a working native CLI execution backend:

- Codex CLI runs through `codex exec --json --sandbox read-only --cd <workspace>
  --skip-git-repo-check -`.
- Claude Code runs through `claude -p --permission-mode plan --output-format
  stream-json`.
- The right panel sends the user's chat text as the runtime request. Taskplane
  does not rewrite ordinary user turns into a separate product-authored prompt.
- Taskplane injects task state, Task.md previews, Source Context previews,
  GoalPilot guidance, capability policy, and a Run Goal Contract as surrounding
  context.
- GoalPilot context readiness is a distinct pre-execution judgment: when the
  next step is clear enough, adapters should move into native plan, research,
  or execution instead of repeatedly asking secondary preference questions.
- Agent CLI runs record a `context.readiness.evaluate` step that classifies the
  next movement as ready, self-research, plan-first, ask-user, or blocked
  before the native runtime receives the prompt.
- Codex CLI native Goal Mode is detected as an adapter capability for
  `0.133.0+`; older Codex versions are shown as needing an update, and Claude
  native goal mode remains unverified by the Taskplane adapter.
- Runtime JSONL or stream-json output is parsed into Run steps when possible.
- The right panel polls active native CLI runs and projects the latest Run step
  into compact progress states such as preparing, researching, reading
  workspace, using tools, verifying, completed, or failed.
- Taskplane can perform a pre-run web research bridge when the task clearly
  needs fresh external information, save the digest and raw links as Source
  Context, and show the captured source count in the completed chat summary.
- Native CLI web/search/browse events are projected into Run steps and the
  completed chat summary, so users can see that research happened without
  reading raw terminal output.
- Raw terminal output remains available as run evidence.
- Taskplane extracts structured `TASKPLANE_WRITE_INTENTS` from native CLI
  output and can surface confirmation cards for task records, source contexts,
  decisions, next-step updates, blockers, completion proposals, and subtask
  drafts.
- Taskplane runs verification and may create memory proposals after the runtime
  returns.
- Codex CLI has a packaged-app live smoke path that verifies local account
  readiness, run completion, output capture, and unchanged workspace fixtures.

### Not Complete Yet

Native CLI integration is not a complete product-grade Agent experience yet:

- runtime-native goal passthrough is still gated; explicit `/codex goal`,
  `/claude goal`, or `/runtime goal` requests are recorded as audit evidence
  rather than forwarded until the readiness gate passes;
- runtime progress projection is present, but it still relies on best-effort
  labels from parsed Run steps and should deepen its Codex JSONL and Claude
  stream-json schema mapping over time;
- real Codex JSONL and Claude stream-json event shapes need deeper schema
  mapping as they evolve;
- Claude real-account execution has not been validated in this repository's
  current environment;
- Write Intent extraction and confirmation UI cover the first planned intent
  set, and right-panel confirmations now invoke main-side writeback dispatch
  for task, source, decision, subtask, and task-file writes; non-UI
  confirmation flows still need to invoke that adapter outside the right panel;
- task advancement decisions remain distributed across UI, run service,
  verifier, and prompt guidance instead of one orchestrator.

## Runtime Result Contract

Every runtime should normalize its result into a runtime-neutral shape:

```ts
type RuntimeResult = {
  runId: string;
  runtimeId: 'codex' | 'claude' | 'agent_api' | string;
  status: 'completed' | 'failed' | 'cancelled' | 'timed_out';
  output: string;
  events: RuntimeEvent[];
  evidence: RunEvidence;
  failureReason?: string | null;
};
```

The runtime result is evidence. It is not a direct product mutation.

Runtime events should be detailed enough for replay and debugging, but the chat
panel should only receive a compact progress projection.

## Write Intent Contract

AI output should enter structured Taskplane data through write intent.

```ts
type TaskplaneWriteIntent =
  | {
      type: 'task_record.create';
      taskId: string;
      content: string;
      evidenceRunId: string;
      confidence: 'low' | 'medium' | 'high';
    }
  | {
      type: 'decision.create';
      taskId: string;
      title: string;
      rationale: string;
      options?: string[];
      proposedOutcome?: string;
      evidenceRunId: string;
    }
  | {
      type: 'source_context.create';
      taskId: string;
      title: string;
      uri?: string | null;
      note: string;
      credibility?: 'unknown' | 'low' | 'medium' | 'high';
      evidenceRunId: string;
    }
  | {
      type: 'task.update_next_step';
      taskId: string;
      nextStep: string;
      reason: string;
      evidenceRunId: string;
    }
  | {
      type: 'subtask.propose';
      parentTaskId: string;
      subtasks: Array<{
        title: string;
        summary: string;
        acceptanceCriteria: string;
        dependency?: string | null;
      }>;
      evidenceRunId: string;
    }
  | {
      type: 'task.mark_blocked';
      taskId: string;
      reason: string;
      unblockCondition?: string | null;
      evidenceRunId: string;
    }
  | {
      type: 'task.complete.propose';
      taskId: string;
      evidence: string;
      evidenceRunId: string;
    };
```

The CLI may emit this intent directly if instructed. A decision backend may also
derive it from runtime output. In both cases, intent remains a proposal until
Taskplane validates and persists it.

## Write Intent Pipeline

Use the same pipeline for CLI and API runtimes:

```text
RuntimeResult
-> WriteIntentExtractor
-> WriteIntentValidator
-> Proposal / Confirmation
-> Taskplane service write
-> Timeline / Run step / Task dynamics evidence
```

### Extract

Extract intents from:

- structured runtime output;
- known JSON blocks such as decomposition drafts;
- runtime event evidence;
- future API evaluator responses;
- optional CLI decision runs.

Extraction should be tolerant: invalid or partial intent should become a review
issue, not a silent write.

### Validate

Validation is deterministic and belongs to Taskplane:

- the target task exists and matches the selected scope;
- the intent type is allowed in the current phase;
- required fields are present;
- the write does not bypass a confirmation boundary;
- source metadata is not treated as verified when credibility is unknown;
- proposed subtasks are not tiny chores unless the task type warrants it;
- completion proposals cite evidence and do not directly mark completion.

### Confirm

Require user confirmation for:

- creating or deleting tasks;
- marking a task complete;
- durable Task Record writes that summarize ambiguous or important conclusions;
- Decisions and risky approvals;
- cross-task Work Habits;
- any write whose target or evidence is uncertain.

Routine run evidence and task dynamics can be written automatically when they
do not alter user-authored memory or task structure.

### Persist

Only Taskplane services persist data. Runtime output must not write the
database, mutate files, or bypass service-level guards.

## Decision Backends

The decision layer should support multiple backends because the product may
have only CLI, only API, or both.

### Deterministic Backend

Use first when rules are enough:

- run start gate;
- task context existence;
- read-only boundary;
- pending memory warning;
- whether a write type always requires confirmation;
- whether runtime evidence exists;
- whether a task is blocked or missing a required field.

This backend should be fast, testable, and provider-independent.

### Native CLI Decision Backend

Use when semantic judgment is needed and a capable CLI is available.

The CLI decision backend runs a bounded, read-only decision request over:

- selected task state;
- recent task memory;
- runtime output and event summary;
- applicable specs;
- candidate write intents.

It should return structured suggestions only. It does not persist.

Example use cases:

- judge whether a result is enough to move forward;
- decide whether an output should become a Task Record;
- propose the next GoalPilot movement;
- summarize useful write intent from a long runtime output;
- identify whether a child task should be further decomposed.

### Agent API Decision Backend

Use as the long-term structured evaluator path.

The API backend should produce schema-validated responses for:

- advancement evaluation;
- write-intent extraction;
- memory proposal worthiness;
- source quality review;
- completion verification;
- context refresh and handoff.

The API backend can replace CLI decision runs for stable low-latency decisions,
but it should not replace native CLI execution where the CLI is better at
workspace reasoning, tool use, or coding-agent behavior.

## Orchestrator

Introduce `TaskAdvancementOrchestrator` as the product coordinator. It should
not be a runtime adapter.

Responsibilities:

1. classify the user's request and selected task state;
2. assemble the right context bundle;
3. choose the movement: ask, research, execute, decompose, persist, verify,
   pause, or closeout;
4. choose the runtime or decision backend if AI is needed;
5. create a Run Goal Contract for execution runs;
6. pass RuntimeResult into write-intent extraction;
7. validate and surface proposals;
8. call Taskplane write services after confirmation.

The orchestrator is the place where GoalPilot becomes executable product logic
instead of only prompt guidance.

## Runtime Progress Projection

The backend records run steps and the right panel projects active native CLI
runs into compact progress status.

Add a compact state model:

```ts
type RuntimeProgressState =
  | 'preparing_context'
  | 'researching'
  | 'using_tool'
  | 'reading_workspace'
  | 'reasoning'
  | 'verifying'
  | 'completed'
  | 'failed';
```

Projection rules:

- chat shows compact status only;
- run detail and task dynamics keep raw event evidence;
- repeated tool events should collapse into one moving status;
- source capture should show whether sources were captured or skipped during
  progress/final summaries when relevant;
- verification and memory proposal should be visible as product actions, not
  raw stdout.

Example display:

```text
正在准备任务上下文...
正在联网调研...
正在读取来源...
正在整理结果...
正在验收并生成任务记录建议...
```

The first implementation is intentionally a UI projection over existing Run
steps. Deeper streaming or runtime-specific schema support can improve
freshness, but should not replace the Run step evidence trail.

## Subagents And Native Runtime Features

Subagents, hooks, native goals, and runtime-specific workflows are implementation
tools, not architecture ownership boundaries.

Use them when they help:

- isolate a decision run;
- review output;
- summarize intent;
- inspect source evidence;
- run a runtime-native verifier.

Do not let them:

- write Taskplane structured data directly;
- replace Taskplane confirmation gates;
- silently override GoalPilot or Task Memory Spec;
- make Taskplane depend on one vendor's feature for core orchestration.

Taskplane should expose a product-level `DecisionBackend` abstraction. A Claude
subagent, a Codex decision run, or an Agent API call can all implement it.

## Implementation Plan

### Phase 1: Native Runtime Backend

Status: mostly implemented.

- Keep Codex CLI and Claude Code as read-only/plan native runtimes.
- Keep JSONL/stream-json event capture.
- Keep run steps, verifier, and memory proposal integration.
- Continue live Codex packaged smoke.
- Add Claude live smoke when account readiness permits.

### Phase 2: Observable Runtime Progress

Status: implemented as a first pass.

- Map `Agent CLI 联网调研准备` and native events into compact progress states.
- Show status in the right panel while a run is active.
- keep detailed event evidence in run detail/task dynamics;
- do not render raw JSONL or stdout in chat.

### Phase 3: Write Intent Layer

Status: started.

- Define `TaskplaneWriteIntent`.
- Extract `subtask.propose` intents from legacy `TASKPLANE_DECOMPOSITION`
  blocks and `TASKPLANE_WRITE_INTENTS` wrappers.
- Extract `task_record.create` and `source_context.create` from
  `TASKPLANE_WRITE_INTENTS`; task records and source contexts can be surfaced
  through confirmed proposal cards and routed through main-side writeback
  dispatch.
- Extract `decision.create`, `task.update_next_step`, `task.mark_blocked`, and
  `task.complete.propose` from `TASKPLANE_WRITE_INTENTS` into shared validated
  intent objects.
- Validate subtask proposal basics before any persistence path can use it.
- `subtask.propose` is normalized into a `subtask.create_many` apply plan.
  Confirmation now routes through main-side writeback dispatch, where the task
  service adapter promotes the parent to a project, creates planned child tasks,
  stores child completion criteria and matched dependencies when available, and
  records project timeline evidence. The renderer keeps a compatibility fallback
  using the same shared dispatch contract.
- Right-panel proposal cards and service-level persistence paths now cover
  decision, next-step, blocker, completion, source, subtask, and task-record
  intents.
- Validate against task scope, phase, and memory policy before persistence.
- surface proposal cards;
- persist only through Taskplane services.

### Phase 4: Task Advancement Orchestrator

Centralize scattered movement decisions:

- move ask/research/execute/decompose/closeout routing out of ad hoc UI and
  prompt fragments;
- use deterministic rules first;
- call DecisionBackend only when semantic judgment is needed;
- preserve user confirmation boundaries.

### Phase 5: API Decision Backend

Replace or augment CLI decision runs with structured API evaluators:

- advancement evaluator;
- write-intent evaluator;
- memory proposal evaluator;
- source quality evaluator;
- completion verifier.

The API backend is an evaluator, not a replacement for native CLI execution.

## Non-Goals

- Do not rebuild Codex or Claude's full coding-agent loop inside Taskplane.
- Do not expose arbitrary CLI flags in settings before each flag is modeled as
  a product policy.
- Do not let runtime output directly mutate the database.
- Do not require Agent API availability for native CLI execution.
- Do not bind core orchestration to Claude subagents or any single runtime's
  private feature.
- Do not make chat the durable task memory.

## Acceptance Criteria

The architecture is working when:

- a user can start a task-bound native CLI run from Taskplane;
- Taskplane can show what phase the run is in without dumping raw events;
- runtime evidence is persisted as run steps;
- runtime output can produce structured write intent for records, sources,
  decisions, next steps, blockers, completion proposals, and subtask drafts;
- invalid intent is rejected or surfaced for review;
- meaningful durable writes require confirmation;
- Taskplane services perform all database writes;
- a future Agent API evaluator can replace a CLI decision backend without
  changing the runtime layer;
- GoalPilot, output, and memory specs are policy inputs to the orchestrator,
  not just long prompt text.

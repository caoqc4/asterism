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
- Pilot coordination role and DecisionBackend selection;
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
- `taskplane.pilot-decision-contract.v1` defines how a GoalPilot movement and
  priority signal become message priority, DecisionBackend choice, executor
  routing, and escalation.
- `taskplane.priority-attention-routing.v1` defines the shared Today/Brief/Pilot
  business-line attention and why-now language for competing business lines,
  Next Actions, and legacy task queue compatibility inputs.
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
  the selected adapter declares native goal capability and proves command shape,
  state reflection, progress, cancellation, memory, source-of-truth, and
  packaged smoke evidence.
- A runtime-native goal result is still evidence. Taskplane must verify it,
  extract Write Intent, and persist through Taskplane services.
- Native goal forwarding must stay explicit; product `/goal` must not silently
  become Codex `/goal`.
- Audit-only runtime-native goal requests should surface the readiness summary
  and missing evidence, not just record that forwarding was skipped.
- Right-panel runtime-native goal responses and panel timeline payloads should
  include the same readiness summary and missing evidence before any future
  passthrough entrypoint is opened.

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

Pilot is the named coordination role in this layer. Pilot may use rules,
Agent API, Codex CLI, Claude CLI, a future matrix runtime, or human review as a
DecisionBackend. That does not make Pilot the executor, and it does not give
Pilot write authority.

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

Executor is the role that performs concrete work. Today an executor may be
Codex CLI, Claude Code, API Runtime, a local rule path, or a human action. A
future `wanman_matrix` executor can coordinate multiple mission-internal
agents, while Taskplane Pilot remains the business-line, Next Action, and
mission control layer.

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
- Pilot coordination is modeled as a product role: rules handle clear routes,
  and API/CLI DecisionBackends may assist ambiguous routing without bypassing
  Taskplane gates.
- Phase-2 Pilot assistance is bounded: a `backendPlan` records trigger,
  backend, `maxTurns=1`, and `pilot_decision_summary`; the right panel injects
  a short Pilot preflight into the selected CLI/API call instead of starting a
  resident Pilot agent.
- Agent CLI run records preserve a trimmed Pilot decision snapshot as
  `Pilot 决策辅助计划`, so backend choice and fallback status remain visible
  after execution.
- Agent CLI run records also preserve a `Native CLI adapter contract` step that
  names the selected CLI runtime, business-line owner or one-off scope, Next
  Action carrier, context manifest, allowed file/tool/MCP surface, run evidence,
  Write Intent proposal boundary, post-run review, and compact/handoff policy.
- Agent API chat invocations preserve the same trimmed Pilot decision snapshot
  in invocation provenance, keeping phase-2 auditability runtime-neutral.
- Shared AI Runtime invocation provenance includes a skipped `execution_run`
  shape for deferred Agent API task execution, so UI and service code can refer
  to API execution readiness without silently starting provider-visible work.
  Agent API capability diagnostics label `execution_run` as deferred, and the
  deferred invocation reason states that no provider-visible execution run starts
  until Taskplane context-readiness, run evidence, verification, and writeback
  gates are satisfied.
- Deferred Agent API `execution_run` invocations also carry structured promotion
  requirements: selected-runtime contract, target-task identity,
  provider-visible preflight, runtime context manifest, context-readiness step,
  task-memory guidance, Run Goal Contract, Write Intent extraction,
  reviewed-patch apply boundary, post-step verification, and Run evidence
  persistence. Agent API capability summaries expose both
  `executionRunPromotionRequirements=0/11` and
  `executionRunMissingRequirements=...`, plus
  `executionRunMissingGates=...`, so the deferred execution boundary is
  visible before any provider-visible run can start. The opt-in Agent API
  execution preflight smoke prints the same `executionRunMissingRequirements`
  and `executionRunMissingGates` fields alongside `promotionMissingRequirements`,
  while still defaulting to provider-not-called.
- The current Pilot operation mode is either `product_control_layer` or
  `bounded_decision_backend`. `persistent_ai_pilot_reserved` is a future
  explicit watch/autopilot capability, not the default runtime shape.
- Agent CLI runs record a `context.readiness.evaluate` step that classifies the
  next movement as ready, self-research, plan-first, ask-user, or blocked
  before the native runtime receives the prompt.
- Codex CLI native Goal Mode is detected as an adapter capability for
  `0.133.0+`; older Codex versions are shown as needing an update, and Claude
  native goal mode remains unverified by the Taskplane adapter.
- Agent CLI status carries adapter-level native capability declarations for
  structured events, runtime-dependent web/search, workspace read/write
  boundaries, hooks, subagents, and product-controlled memory/compact/clear; the
  AI Runtime settings surface shows these before a run starts.
- The status probe also parses lightweight provider help output for
  structured-event flags and, where exposed, native hook-event and agent/subagent
  signals. These are still capability declarations, not permission grants.
- The status probe combines top-level and execution help output where safe, so
  native web/search activation, resume commands, compact/clear context
  affordances, plan/read-only affordances, hook events, Claude agents, and
  native memory-loading hints can be shown before execution without starting a
  run. Probed compact/clear signals are reflected in adapter capability support,
  but Taskplane still selects runtime-native reset only after preservation gates
  pass and the adapter owns a persistent session.
- The status probe also inspects configured-workspace native guidance files and
  directories such as `AGENTS.md`, `CLAUDE.md`, `.claude/settings*.json`, and
  `.claude/agents/` as capability evidence only. The same no-start metadata
  probe can read `.codex/config.*` and `.claude/settings*.json` for explicit
  web/search tool declarations. Claude hook readiness requires non-empty
  configured hook commands or hook entries, and Claude subagent readiness
  requires usable `.claude/agents/*.md` content with a heading or metadata, so
  empty files and placeholder-only files do not count as readiness. These checks
  do not execute the runtime and do not grant write permissions.
- The status probe can also read explicit provider-owned CLI `package.json`
  capability metadata when the executable resolves inside a matching
  Codex/OpenAI or Claude/Anthropic package. Only structured capability/tool
  declarations count; arbitrary wrappers or descriptive package text do not
  promote native web/search readiness.
- The Run Goal Contract and Agent CLI context bridge pass those selected-runtime
  capability declarations into native CLI prompts before execution, so the
  runtime sees the same capability boundary shown in Taskplane UI.
- Runtime context manifests carry a per-action scoped capability allowance for
  MCP tools, skills, external access, hooks, browser/computer-use, and local
  file scope. Global capability configuration remains global, business-line
  SOPs/skills remain business memory, and each run records whether a surface is
  context-only, read-only, runtime-native gated, or blocked.
- Runtime JSONL or stream-json output is parsed into Run steps when possible.
- Agent CLI stdout JSONL lines are projected into Run steps while the native
  process is still running. If a custom executor cannot stream lines, Taskplane
  falls back to parsing the completed stdout transcript.
- The right panel polls active native CLI runs and projects the latest Run step
  into compact progress states such as preparing, researching, reading
  workspace, using tools, verifying, completed, or failed.
- Taskplane can perform a pre-run web research bridge when the task clearly
  needs fresh external information, save the digest and raw links as Source
  Context, and show the captured source count in the completed chat summary.
  Progress and completion summaries also include the research query, so saved
  sources can be traced back to the triggering request without opening raw Run
  steps.
  Runtime names such as Codex CLI or Claude Code and generic current-task
  wording are not enough by themselves to trigger this bridge.
- Native CLI tool/search/browse events are projected into capability-tagged Run
  steps and the completed chat summary, including child-task advancement
  messages, so users can distinguish web research, workspace reads, commands,
  and tool calls without reading raw terminal output.
- Native CLI `workspace_write` capability steps are treated as write candidates:
  post-step verification requires reviewable promotion evidence before Taskplane
  considers them recoverable. Accepted evidence is a run-backed patch artifact,
  a patch-promotion checkpoint, a ready `task_file.propose` Write Intent, or a
  ready `artifact.propose` Write Intent with `kind: "patch"`; ordinary note /
  run-output artifacts are not enough by themselves.
- Terminal Run verification carries same-run artifacts and checkpoints into
  post-step self-checks when repository evidence is available, so run-backed
  patch artifacts and patch-promotion checkpoints can satisfy the same
  `workspace_write` promotion-evidence rule used by Run detail verification.
- Native CLI `artifact.propose` Write Intent may carry `kind: "patch"` when
  the content is reviewable diff evidence. Confirmed patch proposals are saved
  as run-backed patch artifacts through the main-side ArtifactRepository port;
  they still do not apply workspace files by themselves.
- Confirmed run-backed patch artifacts can be normalized into
  `imported_patch_artifact` sandbox draft sources and previewed through the
  existing sandbox patch review planner. This creates a path from native CLI
  patch evidence into sandbox review and promotion Decisions without granting
  direct workspace writes.
- Tasks file workspace exposes that path as a patch artifact "沙箱预检" action.
  The preview returns changed files, requested checks, idempotency evidence, and
  an explicit no-workspace-write guarantee before any sandbox review run or
  promotion Decision is created.
- Tasks file workspace also exposes an explicit "运行 review" action for
  confirmed patch artifacts. Taskplane creates a new audit Run, applies the patch
  only inside the disposable local-container workdir, persists the reviewed patch
  artifact, and creates the patch-promotion checkpoint / Decision when checks
  pass. The host workspace remains unchanged.
- Reviewed patch artifacts now show the associated patch-promotion checkpoint and
  Decision status in the task file workspace, including the fact that workspace
  application remains disabled by default and controlled by the promotion apply
  boundary.
- When `enableSandboxPatchPromotionApply` is enabled, the task file workspace can
  explicitly apply an approved reviewed-patch promotion after operator
  confirmation. The main process reruns promotion preflight, writes only matching
  reviewed files, records applied or blocked run evidence, and refreshes task/run
  state.
- Future API/runtime-generated patch promotion must first prove the
  selected-runtime contract and target-task identity, then reuse the same
  run-bound reviewed-patch apply workflow: patch artifact, promotion Decision,
  promotion preflight, explicit operator apply, same-run evidence chain, and
  post-apply Run evidence.
- Blocked promotion notices explicitly state that no workspace files were
  written and point operators back to Run evidence before re-reviewing or
  regenerating the patch.
- Applied promotion notices point operators back to Run evidence to review
  touched files and post-apply verification results after workspace writes.
- Tasks file workspace apply guidance states that only reviewed patch files
  passing promotion preflight are written, workspace drift blocks apply, and
  operators should review Run evidence after completion.
- Completed native run chat summaries mention both web research and local
  command/workspace activity when those events were recorded.
- Codex JSONL `command_execution` items are projected as `shell_command` Run
  steps, preserving command, status, exit code, and output preview for right-panel
  progress.
- Raw terminal output remains available as run evidence.
- Taskplane extracts structured `TASKPLANE_WRITE_INTENTS` from native CLI
  output and can surface confirmation cards for task records, task files,
  artifacts, source contexts, decisions, next-step updates, blockers,
  completion proposals, and subtask drafts.
- Selected native Agent CLI project decomposition now uses the same task-bound
  right-panel execution path: GoalPilot routes the request as
  `decomposition_draft`, the native CLI returns `subtask.propose` Write Intent,
  and Taskplane confirms durable child creation through the shared writeback
  apply path.
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
- native capability declarations use adapter defaults plus lightweight help and
  workspace probes, and still need deeper provider-specific checks for exact
  hook config semantics, packaged metadata, native memory behavior, and
  web/search readiness;
- real Codex JSONL and Claude stream-json event shapes need deeper schema
  mapping as they evolve;
- Claude real-account execution has a default-skipped packaged live smoke mode
  on the shared Agent CLI task harness, but it has not passed in this
  repository's current environment without local account readiness;
- Write Intent extraction and confirmation UI cover the first planned intent
  set. Right-panel confirmations invoke main-side writeback dispatch for task,
  source, decision, subtask, task-file, and artifact writes, and Task Dynamics
  can approve Run-detail non-subtask writeback proposals through the same
  dispatch adapter outside the right panel;
- confirmed patch artifacts have user-facing preview and sandbox-review run
  paths; a feature-flagged SandboxPatchPromotionApplyService can apply approved
  promotion checkpoints after preflight, and task file workspace views project
  applied, blocked, approved-but-unapplied, or missing-apply-record promotion
  status from Run detail; when the apply flag is enabled, Tasks exposes an
  explicit apply action for approved reviewed patches, and packaged task-files
  smoke now drives applied and blocked UI actions against a temporary workspace.
  Workspace application remains disabled by default and still needs broader
  write-boundary guidance before it becomes a normal happy path;
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
- Run the default-skipped Claude packaged live smoke when account readiness
  permits.

### Phase 2: Observable Runtime Progress

Status: implemented.

- Map `Agent CLI 联网调研准备` and provider native events into compact progress
  states with capability markers such as web search, workspace read, command,
  write candidate, MCP, and hook.
- Show status in the right panel while a run is active.
- keep detailed event evidence in run detail/task dynamics;
- do not render raw JSONL or stdout in chat.

### Phase 3: Write Intent Layer

Status: started.

- Define `TaskplaneWriteIntent`.
- Extract `subtask.propose` intents from legacy `TASKPLANE_DECOMPOSITION`
  blocks and `TASKPLANE_WRITE_INTENTS` wrappers.
- Extract `task_record.create`, `task_file.propose`, `artifact.propose`, and
  `source_context.create` from `TASKPLANE_WRITE_INTENTS`; task records, task
  files, artifacts, and source contexts can be surfaced through confirmed
  proposal cards and routed through main-side writeback dispatch.
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
- Task Dynamics uses `TaskplaneWritebackApprovalItem` to surface Run-detail
  Write Intent and task-memory proposals outside the right panel while still
  requiring operator confirmation and main-side writeback dispatch.
- Validate against task scope, phase, and memory policy before persistence.
- surface proposal cards;
- persist only through Taskplane services.

### Phase 4: Task Advancement Orchestrator

Status: started.

Centralize scattered movement decisions:

- move ask/research/execute/decompose/closeout routing out of ad hoc UI and
  prompt fragments;
- use deterministic rules first;
- call DecisionBackend only when semantic judgment is needed;
- preserve user confirmation boundaries.

Current implementation:

- `src/shared/pilot-decision-contract.ts` wraps the shared advancement decision with
  Pilot message priority, DecisionBackend choice, bounded backend plan,
  executor selection, and priority-lane evidence.
- `src/shared/task-advancement-orchestrator.ts` composes runtime intake and
  context-readiness evaluation into a shared advancement decision.
- Right-panel task chat uses Pilot plus the shared advancement decision before
  launching Agent CLI, so user-owned approval boundaries stay local while
  child-task advancement can continue through native runtime research/execution.
- When Pilot requests a bounded decision backend, the right panel uses the
  same selected CLI/API runtime with a short preflight instruction rather than
  spinning up a separate always-on coordinator.
- Project decomposition uses the same shared decision before requesting a
  reversible subtask draft; durable child creation remains behind confirmation.
- Manual context refresh and phase closeout call the same shared decision before
  memory handoff, quality checks, and context clearing continue through existing
  Taskplane gates.
- Task completion confirmation calls the shared decision before the modal
  records passed, waiting, or override-completed outcomes through existing
  verification and operator-confirmation gates.
- Selected task project verification calls the shared decision before rendering
  local project-readiness evidence in the task detail surface.
- Main-side Taskplane writeback dispatch calls the shared decision before
  applying validated Write Intent through task, decision, source, file, or
  subtask services.
- A business-line loop is the product-level scheduler object: it observes a
  business line, proposes or executes bounded Next Actions, captures review
  evidence, and feeds records or SOP updates back through Taskplane gates.
  Scheduled, event-triggered, and routine tasks are execution carriers inside
  that loop, not the durable scheduler owner.
- A sensor is read-only loop observation. It can inspect time, external events,
  source changes, run health, or task state and return evidence, but it cannot
  mutate Taskplane data or start a runtime by itself.
- An automation is a bounded loop action. It may start only after trigger
  readiness proves the business line, carrier task, selected runtime, Standing
  Approval, daily run-limit evidence, and post-step review/writeback gates.
- `AgentAutomationReadiness` can diagnose business-line loop carriers such as
  scheduled, event-triggered, and routine tasks when procedure, inputs, runtime,
  risk, and completion criteria are present, but it still returns
  `automaticStartAllowed: false` and blocks default read-only native runtime
  auto-start until a separate scheduled/event execution entrypoint is available.
  Its summary includes `automationReady`, `requirements=x/9`, and
  `missingRequirements=...` / `automationMissingRequirements=...` evidence. The
  dedicated scheduled/event trigger planner may mark
  `scheduledEventEntrypoint=available` only when the scheduler trigger service
  is connected; final runtime start still depends on Standing Approval,
  run-limit evidence, and post-step gates.
- Read-only orchestration diagnostics expose the automatic-start boundary, so
  manual/operator-started readiness is distinct from scheduled/event carriers
  that require a separate execution entrypoint.
- `AgentStandingApprovalPolicy` is the shared L2 authorization surface. It is
  accepted only when the policy is active, unexpired, scoped to the task type or
  task id, allows the requested lane and runtime, stays within the risk ceiling
  and daily run limit, carries a visible reason, and automation readiness is not
  blocked. The evaluator returns satisfied and missing requirement lists plus
  `standingApprovalReady`, `requirements=x/13`, `missingRequirements=...`, and
  `standingApprovalMissingRequirements=...` evidence. This evaluates
  authorization only; it does not create a scheduler
  trigger, IPC entrypoint, or workspace write path by itself.
- `buildStandingApprovalConfirmationDraft` creates the operator-facing L2
  authorization draft from the same readiness and policy evaluator. The draft is
  confirmation-only, carries `schedulerTriggerAllowed=false` and
  `workspaceWriteAllowed=false`, tolerates only the known scheduled/event
  entrypoint blocker, and blocks other automation readiness gaps.
- Confirming the draft writes `panel.standing_approval_confirmed` through the
  existing TaskService timeline mutation guard. That record preserves the policy
  and evaluation evidence, but still carries `schedulerTriggerAllowed=false` and
  `workspaceWriteAllowed=false`; a separate scheduled/event trigger service is
  still required before any automatic native runtime start.
- `planScheduledEventAgentTrigger` is the shared no-start trigger planner. It
  consumes confirmed Standing Approval Task Dynamics records, re-checks runtime
  readiness, carrier-task readiness, policy expiry/scope/risk, and
  scheduled/event task class, accepts explicit daily run-limit accounting input,
  blocks plans when `maxRunsPerDay` is reached, then returns a ready/blocked
  plan. By default the plan stays no-start with `runtimeStartAllowed=false`;
  when a dedicated trigger service is explicitly connected and daily run-limit
  count evidence is present, a ready plan may return
  `runtimeStartAllowed=true`. The plan exposes runtime-start satisfied and
  missing requirement lists plus
  `runtimeStartReady`, `runtimeStartRequirements=x/3`, and
  `runtimeStartMissingRequirements=...` evidence for trigger-plan readiness,
  scheduler trigger service connection, and run-limit count. The plan also carries the
  trigger Run evidence contract: context readiness, target business-line
  evidence when available, target-task identity, task-memory coverage,
  task-memory guidance, subtask-start, run-limit count, and post-step evidence.
- `SchedulerService.diagnoseScheduledEventAgentTriggers` wires the planner to a
  scheduler diagnostic entrypoint. It reads selected-runtime readiness from AI
  config status, uses `RunRepository.countCreatedSinceByTask` for persisted
  same-day run-limit counts when available, and returns ready/blocked plans. It
  does not resolve runtime config, schedule a trigger job, or start a native
  runtime.
- `SchedulerService.triggerScheduledEventAgentRun` is the first narrow
  trigger-service connection point. It is exposed through the explicit operator
  IPC `scheduler:triggerScheduledEventAgentRun` and through a 15-minute
  scheduler sweep that only loads scheduled/event/routine candidates from a
  dedicated task-source port: both paths require an injected Code Agent trigger
  port, and the background sweep also requires the Task Dynamics timeline port
  before any automatic start can run. The shared trigger plan also records the
  `scheduler_loop` Agent Capability Gateway decision: selected CLI schemes can
  prove CLI-first scheduler-loop support, while selected Agent API scheduler
  paths stay deferred and cannot silently use the compatibility trigger port.
  The service reuses the same Standing Approval and same-day run-limit checks, sets
  `schedulerTriggerServiceConnected=true`, and only starts a Code Agent run when
  the plan is ready. The generated run request keeps `operatorConfirmed=true`
  because the confirmed Standing Approval is the operator confirmation boundary
  for the bounded automatic action, uses the model-producer path, and instructs
  the run to produce reviewable patch artifacts or proposals rather than direct
  workspace writes. After a run starts, the service records
  `panel.scheduled_event_agent_triggered` with the run id, run
  status/outputSource/failureReason returned by the trigger port,
  `terminalRunEvidenceStatus`, `triggerRunEvidenceStatus`, standing approval
  policy id, automation readiness summary plus satisfied/missing requirements,
  `triggerKind`, run-limit state, runtime-start gate state, and required trigger
  evidence so Task Dynamics can distinguish this operator-triggered autonomous
  action from ordinary run creation. The generated run request carries the same
  automation readiness summary, including `scheduledEventEntrypoint=available`
  when the trigger service is connected. The single-run result also returns
  `terminalRunEvidenceStatus` and
  `triggerRunEvidenceStatus` for the operator message. Sweep
  results expose `skipReason`, `checkedTaskIds`, `startedRunIds`,
  `blockedReasons`, `blockedTaskSummaries`, `runFailureReasons`,
  `automationMissingRequirements`, `automationSatisfiedRequirements`,
  `runtimeStartMissingRequirements`, and `terminalRunEvidenceMissingRunIds`,
  plus `triggerRunEvidenceRequired` and `triggerRunEvidenceStatus`, at the top
  level for operator-facing run
  evidence. `SchedulerStatus.lastScheduledEventAgentSweepSummary` preserves the
  latest completed, `ports_not_connected`, `in_flight`, or `sweep_failed` sweep
  outcome, including sanitized task-source/trigger-port failure evidence with
  `triggerRunEvidenceStatus=not_started`. If timeline recording fails after a
  run starts, the failed sweep still preserves `startedRunIds`,
  `terminalRunEvidenceMissingRunIds`, required trigger evidence, and
  `triggerRunEvidenceStatus=pending_terminal_run_evidence`, but does not count
  the started run as a blocked task. Failed sweeps release the in-flight guard,
  so the operator can see background automation health even when the sweep
  correctly starts no run or recovers after a failed sweep.
- Post-run review is part of the loop contract. A scheduled/event carrier may
  produce run evidence, source context, artifacts, business records, review
  proposals, Next Actions, or SOP revision proposals, but risky mutation,
  external/public effects, money-affecting changes, or cross-business reuse
  remain Decision-gated before they can become active context.
- Wanman or other matrix runtimes remain executor backends below Taskplane
  Pilot. They may execute one delegated loop action and return evidence, but
  they do not own the business-line loop, scheduler policy, Standing Approval,
  run-limit accounting, review gate, or durable write authority.
- The retained Agent API project-decomposition confirmation path now builds the
  same `subtask.create_many` apply plan as native CLI decomposition, including
  parent summary, parent/child criteria, dependencies, project timeline, and
  the `AI 项目拆解自检.md` task record. The project-decomposition timeline now
  carries both created child task ids and the task record path as evidence.
- Decomposition writeback timeline evidence records that generated subtasks were
  draft-only before operator confirmation, keeping API and CLI decomposition
  reversible until the shared create-many plan is approved.

Remaining work:

- If Agent API decomposition is promoted as a primary runtime path, require the
  selected-runtime contract and parent-task identity, then keep draft generation
  task-bound and reversible before it reaches writeback confirmation.
- If Agent API task execution is promoted, replace the skipped `execution_run`
  invocation with a real provider-visible execution entrypoint only after the
  selected-runtime contract, target-task identity, context readiness,
  task-memory, Run Goal, Write Intent, reviewed-patch, subtask-start, post-step,
  and Run evidence gates pass.
- If scheduled/event native runtime execution is promoted, keep it inside the
  business-line loop contract: use a dedicated scheduled/event entrypoint and
  confirmation model rather than `scheduler_maintenance`, scheduled Brief
  assistance, or generic automation readiness.

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
- runtime output can produce structured write intent for records, task files,
  artifacts, sources, decisions, next steps, blockers, completion proposals,
  and subtask drafts;
- invalid intent is rejected or surfaced for review;
- meaningful durable writes require confirmation;
- Taskplane services perform all database writes;
- a future Agent API evaluator can replace a CLI decision backend without
  changing the runtime layer;
- GoalPilot, output, and memory specs are policy inputs to the orchestrator,
  not just long prompt text.

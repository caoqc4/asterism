# Agent Execution Layer Design

## Status

Living design for the execution layer after the front task-management loop.

This document defines how Taskplane should evolve from the current text-only `Run`
executor into a real local agent execution layer. It is intentionally scoped to
the local-first desktop product: Task remains the control-plane object, Run
remains the execution record, and the agent layer must not turn the product into
a generic chat shell or opaque tool log viewer.

## Current Baseline

The current implementation has a healthy control-plane spine:

- `Task` owns lifecycle, recovery wording, completion criteria, blockers,
  dependencies, source context, and process context.
- `Decision` owns formal human judgment.
- `Run` owns one execution attempt and writes completion/failure back into Task
  timeline semantics.
- `Artifact` persists useful output from successful runs.
- `ProcessTemplate` already behaves like a lightweight skill candidate pool:
  selectors decide whether a Run, Brief, or Decision draft should reference a
  template.

The first execution-layer spine is now in place:

- `RunService.trigger` creates a run, optionally moves planned tasks to
  `running`, resolves AI config, selects process templates, routes execution
  through `RunOrchestrator`, writes completed/failed/paused outcomes, creates
  artifacts, and annotates the task.
- `RunOrchestrator` writes plan/model/final steps for text runs and hands
  `agent` runs into `AgentRunLoop`.
- `AgentRunLoop` assembles a typed working context, asks for a constrained JSON
  step proposal, enforces read-only observation before local writes, persists
  readable observation summaries, and pauses when context says a local write
  should wait.
- `AgentToolRegistry` can inspect task context, inspect task timeline, and
  create local note artifacts while writing tool call/result steps.
- Confirmation-required tools create checkpoints and pending Decisions;
  approved Decisions can resume the pending local tool.
- Paused runs now create resume checkpoints, can continue the saved next local
  tool from Runs or Tasks, and show readable continuation failures in the UI.
- Provider support is still mostly model-text oriented through Vercel AI SDK or
  native Replicate text prediction; reliable multi-turn tool use is not yet a
  runtime guarantee.

The remaining gap is no longer "does Taskplane have a trace spine?" It is
"what is the boundary for a real executor session that can run beyond one local
tool, survive interruption, and eventually support code/research/social work?"

So the product control plane is ahead of the agent runtime. The next phase
should keep that advantage instead of importing a heavy runtime that ignores the
Task/Run/Decision model.

## Design Positioning

Taskplane should treat external agent-runtime ideas as architecture references,
not as the product center.

- OpenClaw-like systems answer "how does an agent do work?"
- Taskplane answers "which task needs work, under what context, with what
  evidence, and when must the user decide?"
- Pi-style runtime concepts are useful at the execution-layer boundary:
  planner, step loop, tool registry, observation stream, checkpoints, and
  resumability.

The product should therefore implement a Taskplane-native agent layer:

```text
Task Control Plane
  -> Run Orchestrator
     -> Agent Runtime
        -> Planner
        -> Step Loop
        -> Tool Registry
        -> Provider Adapter
        -> Checkpoint Store
     -> Run Events / Artifacts / Decisions
  -> Task Timeline / Recovery / Completion
```

## Principles

1. Task remains the durable unit of meaning.
   The agent can produce runs, artifacts, decisions, blockers, and completion
   evidence, but it must not become a second hidden task system.

2. Run becomes a resumable execution attempt.
   A run should have steps, observations, outputs, and a clear terminal status.

3. Tool calls are typed product actions.
   The agent should not directly mutate SQLite. It calls registered tools that
   route through domain services.

4. Human confirmation is a first-class stop state.
   Anything involving external communication, credential creation, destructive
   local actions, permission changes, financial actions, or sensitive-data
   transmission must become a `Decision` or explicit confirmation checkpoint.

5. Low-level trace is persisted, but UI stays product-level.
   Runs can store step events and tool observations. The first UI should show a
   readable execution summary and selected evidence, with deep trace available
   later.

6. Local-first means recoverable after app restart.
   Pending/running runs must be able to resume, fail safely, or request user
   review from SQLite state.

## Runtime Objects

### Run

`Run` remains the public execution attempt. It needs additional fields or
side-tables rather than becoming a blob:

- `executor_kind`: `text`, `agent`
- `goal`: normalized execution objective
- `plan_summary`: short current plan
- `status`: keep `pending`, `running`, `completed`, `failed`; add
  `needs_confirmation` and `paused` when the UI can support them
- `started_at`, `completed_at`
- `failure_kind`: `provider`, `tool`, `policy`, `user_cancelled`, `unknown`

### Run Step

New durable child object:

- `id`
- `run_id`
- `index`
- `kind`: `plan`, `model`, `tool_call`, `tool_result`, `artifact`, `decision`,
  `checkpoint`, `final`
- `status`: `pending`, `running`, `completed`, `failed`, `skipped`
- `title`
- `input`
- `output`
- `error`
- `created_at`, `updated_at`

This is the agent trace backbone. The UI can summarize it without exposing every
raw detail.

### Agent Checkpoint

New durable child object:

- `id`
- `run_id`
- `step_id`
- `kind`: `resume`, `confirmation`, `tool_permission`, `external_wait`
- `payload`
- `status`: `open`, `resolved`, `cancelled`
- `created_at`, `resolved_at`

This gives resumability and allows the run to pause without pretending it
failed.

## Execution Contracts

The execution layer should expose a small internal contract:

```ts
type AgentRunRequest = {
  runId: string;
  taskId: string;
  goal: string;
  instructions?: string;
  mode: 'draft' | 'summarize' | 'code' | 'research' | 'social';
  context: AgentWorkingContext;
  policy: AgentPolicy;
};

type AgentRunResult =
  | { status: 'completed'; output: string; artifacts: AgentArtifactDraft[] }
  | { status: 'failed'; failureKind: string; message: string }
  | { status: 'needs_confirmation'; checkpointId: string; message: string }
  | { status: 'paused'; checkpointId: string; message: string };
```

`AgentWorkingContext` should be assembled from existing Taskplane context:

- task title, summary, next step, state, priority lane
- recent timeline events
- completion criteria
- active blocker/dependency/waiting item
- key source contexts
- selected process templates
- relevant recent runs/artifacts/decisions

`AgentPolicy` should be explicit and local:

- allowed tool categories
- max steps
- max wall time
- network allowed or not
- file write allowed or not
- confirmation-required action categories
- provider/model config

## Tool Registry

The first registry should be small and domain-shaped.

P0 internal tools:

- `task.update_summary`
- `task.update_next_step`
- `task.create_completion_criterion`
- `task.satisfy_completion_criterion`
- `decision.draft`
- `artifact.create`
- `source_context.create`
- `process_template.select`

P1 local workspace tools:

- `workspace.read_file`
- `workspace.search`
- `workspace.write_patch`
- `workspace.run_command`

P1/P2 external tools:

- browser or web research
- social/media drafting
- email/calendar connectors
- GitHub issue/PR tooling

Tool contract:

```ts
type AgentToolDefinition = {
  name: string;
  description: string;
  inputSchema: unknown;
  risk: 'safe_read' | 'local_write' | 'external_read' | 'external_write' | 'sensitive';
  requiresConfirmation: boolean;
  execute(input: unknown, context: ToolExecutionContext): Promise<AgentToolResult>;
};
```

All tools must write observations to `run_steps`. Domain-mutating tools must go
through existing services, not repositories directly.

## Provider Adapter Boundary

The current `generateRuntimeText` path should become one adapter under a broader
execution runtime.

```text
Agent Runtime
  -> Model Adapter
     -> text generation
     -> structured tool-call planning
     -> final answer synthesis
```

Provider support should keep the existing split:

- OpenAI-compatible and fal/OpenRouter can use tool-call capable chat APIs when
  configured.
- Anthropic can use its tool-use API through the adapter.
- Replicate can remain text-only unless the selected model and relay support
  structured tool calls. In text-only mode the runtime can still produce plans
  and final drafts, but should not pretend to have reliable autonomous tool use.

This distinction matters in UI: a run should show `agent capable` vs
`text-only fallback` instead of hiding provider limits.

## Run Lifecycle

P0 agent lifecycle:

1. User triggers a Run from Task Action Desk.
2. `RunService` creates a run with `executor_kind = agent`.
3. `RunOrchestrator` assembles working context and policy.
4. Runtime writes a `plan` step.
5. Runtime loops through model/tool/final steps until:
   - completed
   - failed
   - needs confirmation
   - paused by limits
6. Completed run creates artifacts and task timeline events.
7. Failed run annotates task with retry-oriented recovery.
8. Confirmation-needed run creates or links a Decision and pauses.

The first implementation can be synchronous inside the Main process as long as
it writes steps before and after each substantial operation. Once the step model
is stable, the same contract can move to a background worker.

## UI Surface Changes

Tasks Action Desk:

- add Run mode selector: `Draft`, `Summarize`, `Agent`
- when Agent is selected, show capability hints from current provider:
  `text-only`, `tool-capable`, `requires confirmation for writes`

Runs page:

- show current plan, status, final output, artifacts, and checkpoint state
- show step summary list, not raw debug trace by default
- show `继续执行`, `取消`, or `返回任务推进` depending on status

Home:

- active agent runs should appear as `continue_or_review`
- confirmation-needed runs should appear as `unblock_or_decide`
- failed tool runs should appear as escalation if they block completion

Decisions:

- confirmation checkpoints that need human judgment should appear as Decisions
  only when they affect task direction, external action, risk, resource use, or
  sensitive data transmission.

## Safety And Confirmation Model

The runtime must classify actions before execution:

- Always safe: read Taskplane task context, summarize local Taskplane objects,
  create draft artifacts.
- Confirm or Decision required: external post/send/submit/upload, local file
  deletion, permission changes, credential creation, persistent account changes,
  sensitive-data transmission, financial or medical actions.
- Hand-off required: final password change submission, CAPTCHA solving, bypassing
  browser safety barriers.

This maps cleanly to Taskplane:

- low-risk uncertainty becomes a paused checkpoint
- product/user judgment becomes a Decision
- forbidden or hand-off actions become a failed or blocked run with clear reason

## Data Migration Plan

Suggested tables:

- `run_steps`
- `run_checkpoints`

Suggested `runs` extensions:

- `executor_kind`
- `goal`
- `plan_summary`
- `failure_kind`
- `started_at`
- `completed_at`

No new top-level product object is required for the first agent layer. The
runtime should strengthen Run and Artifact before inventing an "Agent Task"
object.

## Implemented Phases

### Phase 1: Agent Trace Spine

Implemented baseline:

- `run_steps` schema, repository, shared types, and tests
- plan/model/final step writing for text runs
- compact step summaries in Runs page
- readable agent plan-source and tool-observation summaries

Remaining cleanup:

- add `failure_kind`, `started_at`, and `completed_at` only when the UI needs
  those distinctions
- keep raw structured step payloads small enough for local SQLite inspection

### Phase 2: Agent Orchestrator

Implemented baseline:

- `RunOrchestrator`
- `AgentRunRequest`, `AgentPolicy`, and `AgentWorkingContext`
- text run orchestration plus agent-mode handoff
- planner/fallback plan writing for constrained agent proposals

Remaining cleanup:

- make provider capability visible before the user triggers an agent run
- separate provider failure, planner failure, and tool failure in user-facing
  recovery wording

### Phase 3: Internal Tool Registry

Implemented baseline:

- typed internal tool registry
- read-only task context and timeline inspection tools
- local note artifact creation tool
- tool call/result step persistence
- policy-driven confirmation checkpoints for confirmation-required tools

Remaining cleanup:

- add domain-shaped tools one at a time only when a Task flow needs them
- keep local-write tools behind observation and checkpoint policy

### Phase 4: Checkpoints And Confirmation

Implemented baseline:

- `run_checkpoints` schema, repository, and tests
- confirmation checkpoints linked to Decisions
- approved checkpoint Decision resumption
- deferred/cancelled settlement as non-resumable
- paused resume checkpoints for local-write gating
- continuation from Runs and Tasks with visible failure feedback

Remaining cleanup:

- make checkpoint payload shape versioned before adding more tools
- surface cancelled/non-resumable states more clearly in Home recommendations

## Next Major Phase: Executor Session Boundary

The next phase should define a durable executor/session boundary before adding
workspace, browser, social, or coding tools. Without this boundary, new tools
would couple directly to `AgentRunLoop` and make interruption, cancellation,
provider capability, and restart recovery harder later.

Recommended contract:

```ts
type AgentSessionRequest = {
  runId: string;
  taskId: string;
  mode: 'draft' | 'summarize' | 'agent' | 'code' | 'research' | 'social';
  objective: string;
  context: AgentWorkingContext;
  policy: AgentPolicy;
  capabilities: AgentRuntimeCapabilities;
};

type AgentSessionEvent =
  | { type: 'plan'; summary: string }
  | { type: 'model'; output: string }
  | { type: 'tool_call'; tool: string; input: unknown }
  | { type: 'tool_result'; tool: string; result: AgentToolResult }
  | { type: 'checkpoint'; checkpointId: string; reason: string }
  | { type: 'final'; output: string };

type AgentSessionResult =
  | { status: 'completed'; output: string }
  | { status: 'failed'; failureKind: string; message: string }
  | { status: 'paused'; checkpointId: string; message: string }
  | { status: 'needs_confirmation'; checkpointId: string; message: string };
```

The executor owns step-by-step runtime progress. `RunService` should remain the
settlement boundary that creates/updates the public `Run`, annotates `Task`,
and persists artifacts.

### Required Boundaries

- `AgentExecutor`: starts or resumes one run session and emits typed session
  events.
- `AgentSessionStore`: persists enough session state to resume or explain why a
  run cannot resume after restart.
- `AgentRuntimeCapabilities`: records whether the selected provider supports
  structured tool calling, text-only planning, streaming, file context, or
  long-running sessions.
- `AgentToolRegistry`: remains the only way executors mutate Taskplane domain
  state.
- `RunOrchestrator`: adapts session events into `run_steps`, checkpoints, and
  final settlement.

### First Concrete Next Task

Continue the executor/session boundary without adding new external tools.

Completed slice:

1. Add shared/internal types for `AgentSessionRequest`, `AgentSessionEvent`,
   `AgentSessionResult`, and `AgentRuntimeCapabilities`.
2. Extract the current `AgentRunLoop.run(...)` behavior behind an
   `AgentExecutor` interface.
3. Add a `LocalAgentExecutor` adapter that delegates to the existing loop, so
   behavior stays unchanged.
4. Teach `RunOrchestrator` to call the executor interface instead of the
   concrete loop.
5. Add unit tests proving current paused/completed/failed agent outcomes still
   settle exactly as before.

Completed slice:

1. Add a small `AgentSessionStore` abstraction that can record session metadata
   for a run without changing public `Run` shape yet.
2. Persist runtime capability metadata for each agent run, including whether it
   used text-only planning or structured tool calling.
3. Teach `RunOrchestrator` to write the session metadata before starting the
   executor.

Completed slice:

1. Add agent session records to `RunDetailRecord`.
2. Surface the capability summary in run detail or Runs page copy.
3. Add renderer coverage for the capability hint.

Completed slice:

1. Add safe read-only workspace tools behind the executor boundary:
   `workspace.search` and `workspace.read_file`.
2. Keep them disabled unless policy explicitly allows local workspace reads.
3. Persist every call/result as ordinary run steps.
4. Add tests proving these tools cannot write files and cannot run commands.

Completed slice:

1. Decide how workspace tools enter agent plans: conservative local-only
   heuristic first, then model-proposed tool calls later.
2. Add plan parsing support for `workspace.search` and `workspace.read_file`
   only when `allowLocalWorkspaceRead` is true.
3. Keep patch and command tools out of the available planner set.

Completed slice:

1. Add a UI/config path for enabling read-only workspace access per run.
2. Keep the default agent run policy disabled until the user opts in.
3. Surface the resulting capability in the run session metadata.

Completed slice:

1. Make run-session capability metadata reflect the per-run workspace-read
   opt-in.
2. Add coverage that an opted-in agent run stores `fileContext=true` while a
   default run stores `fileContext=false`.
3. Keep patch and command execution unavailable.

Next code slice:

1. Evaluate the alpha flow for a read-only workspace agent run from task setup
   through Runs detail.
2. Add workspace-read prompt guidance so the model only sees workspace tools
   when the run opts in.
3. Decide whether the next implementation step should be a stricter workspace
   root selector.
4. Keep patch and command execution unavailable.

Success: Taskplane can inspect local project context for coding-like tasks only
when the user has explicitly enabled read-only workspace access for that run,
and the run detail can explain that capability afterward.

# Agent Execution Layer Design

## Status

Draft for the next implementation phase after the front task-management loop.

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

The current execution layer is still narrow:

- `RunService.trigger` creates a run, optionally moves planned tasks to
  `running`, resolves AI config, selects process templates, calls `TextExecutor`,
  writes a completed/failed run, creates an artifact, and annotates the task.
- `TextExecutor` produces a single text output for `draft` or `summarize`.
- Provider support is model-text oriented through Vercel AI SDK or native
  Replicate text prediction.

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

## Implementation Phases

### Phase 1: Agent Trace Spine

- add `run_steps` repository and tests
- extend Run model with `executor_kind`
- route current `TextExecutor` through step writing
- show step summaries in Runs page

Success: existing draft/summarize runs still work, but every run has a readable
step trail.

### Phase 2: Agent Orchestrator

- add `RunOrchestrator`
- define `AgentRunRequest`, `AgentPolicy`, and `AgentWorkingContext`
- add a text-only planner/finalizer path
- persist plan and final steps

Success: an `agent` run can create a plan and final artifact even before tool
calling is enabled.

### Phase 3: Internal Tool Registry

- add typed tool registry for safe Taskplane domain tools
- allow model/planner to request internal tools
- write every tool call/result as run steps
- route mutations through domain services

Success: agent runs can update next step, create artifacts, and draft Decisions
with traceable product semantics.

### Phase 4: Checkpoints And Confirmation

- add `run_checkpoints`
- pause runs for confirmation-required actions
- link checkpoints to Decisions when the decision changes task direction or
  requires human judgment

Success: the agent can stop at the right boundary instead of either failing or
silently overreaching.

### Phase 5: Local Workspace Tools

- add read/search tools first
- add patch/command tools behind explicit local policy
- create artifacts from diffs, command summaries, and generated files

Success: Taskplane can start supporting coding-agent-like workflows while still
keeping Task/Run/Decision as the product control plane.

## First Concrete Next Task

Implement Phase 1.

Recommended first code slice:

1. Add shared `RunStepRecord` types.
2. Add `run_steps` schema and repository.
3. Update `RunService` or a small `RunStepRecorder` to write:
   - `plan` or `model` step before executor call
   - `final` step on success
   - `failed` step on error
4. Add repository and service tests.
5. Add a compact step summary section to Runs page.

This gives the project the execution trace spine needed for the real agent layer
without destabilizing provider support or front task-management behavior.

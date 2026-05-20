# Agent Runtime Harness And Goal Compatibility

Date: 2026-05-19

## Purpose

This note captures the product direction after evaluating Agent CLI, future Agent API, Codex/Claude goal modes, Anthropic Managed Agents, Hermes Agent, Multica, OpenClaw, and Claude Cowork.

The main design correction is:

- Agent CLI and Agent API are peer execution runtimes.
- Taskplane's product runtime is the durable session and harness around those runtimes.
- Goal, task decomposition, context assembly, verification, memory proposals, context clearing, and Decisions should belong to Taskplane's harness unless a specific runtime adapter explicitly owns a narrower execution detail.

This avoids treating the first-version Agent CLI path as the entire agent product, while still allowing Taskplane to ship a narrow and safe execution lane first.

## External Signals

### Codex And Claude Native Goals

Codex documents `/goal` as an experimental CLI feature for durable long-running objectives with a verifiable stopping condition. It can set, inspect, pause, resume, or clear a goal when the feature flag is enabled.

Claude Code documents `/goal` as a session-scoped completion condition. Claude keeps taking turns until a separate evaluator judges the condition met, and `claude -p "/goal ..."` can run that loop non-interactively.

References:

- https://developers.openai.com/codex/use-cases/follow-goals
- https://developers.openai.com/codex/cli/slash-commands
- https://code.claude.com/docs/en/goal

The useful Taskplane lesson is that native goal mode is real execution capability, not just prompt sugar. The product risk is hidden ownership: if Taskplane forwards `/goal` blindly, the durable state may live inside a CLI session while Taskplane's task goal, Task Records, run verification, and context clearing know only fragments of the work.

Therefore Taskplane should:

- keep product-level `/goal` owned by Taskplane by default;
- allow native goal mode only through explicit runtime-native routing;
- record native goal commands and terminal outcomes in Taskplane's run history;
- keep Taskplane's Run Goal Contract and verifier as the acceptance source of truth.

For the first product version, the priority is borrowing the goal pattern, not forwarding native goal commands. The useful framework is durable objective state, explicit completion conditions, bounded continuation, pause/resume/clear controls, verifier judgment, and memory handoff. Native Codex/Claude goal invocation is a later adapter optimization after Taskplane's own task loop is stable.

### DeepSeek As CLI Backend

DeepSeek currently presents itself primarily as an OpenAI/Anthropic-compatible API provider rather than a standalone official coding-agent CLI. Its official docs show direct `curl`/SDK calls against `https://api.deepseek.com`, and an Agent Integrations guide explains how to point Claude Code at the DeepSeek Anthropic-compatible endpoint with environment variables such as `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` and `ANTHROPIC_AUTH_TOKEN=<DeepSeek API Key>`.

References:

- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code

For Taskplane, that means DeepSeek should be treated as:

- a future Agent API/model provider candidate through the OpenAI/Anthropic-compatible API surface;
- or a configured backend behind an existing CLI runtime such as Claude Code, if the user chooses that local CLI setup.

It should not be modeled as a first-version peer Agent CLI runtime unless DeepSeek ships or documents a stable official CLI with task execution, cancellation, stdout/progress, and permission semantics comparable to Codex CLI or Claude Code.

### Anthropic Managed Agents

Anthropic describes Managed Agents as a decoupled architecture with:

- session: the durable append-only record of what happened;
- harness: the loop that calls the model and routes tool calls;
- sandbox: the environment where code runs and files can be edited.

Reference: https://www.anthropic.com/engineering/managed-agents

For Taskplane, the useful signal is not "add many agents." The useful signal is interface separation:

```text
Taskplane Session
  Task state, Task.md, Task Records, source contexts, Decisions, Runs, run steps,
  run verifications, timeline, task dynamics.

Taskplane Harness
  Runtime gates, context assembly, goal contract, runtime adapter selection,
  slash-command routing, verification, memory routing, pause/resume/cancel.

Execution Backend / Sandbox
  Agent CLI, Agent API, Code Agent sandbox, future external tool or MCP execution.
```

### Multica

Multica separates server, local daemon, and local AI coding tool. Its server owns workspaces, issues, task queue, and agent definitions; the daemon runs on the user's machine and invokes local tools such as Claude Code or Codex. Multica also allows custom CLI arguments to be appended to the tool command, while warning that different tools interpret flags differently.

References:

- https://multica.ai/docs/how-multica-works
- https://multica.ai/docs/agents-create

Taskplane should borrow the separation between product state and execution backend, but not copy remote queue semantics yet. The local app can act as product server and daemon in the first version.

### Hermes Agent Goals

Hermes treats `/goal` as a persistent control-plane feature. It stores goal state, starts an iteration loop, runs a judge after each turn, supports a turn budget, and lets user messages preempt queued continuation. Status, pause, and clear are safe control-plane actions while work is running.

References:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/goals
- https://hermes-agent.lzw.me/docs/en/user-guide/features/goals

The important product ideas for Taskplane:

- `/goal` should be a Taskplane control-plane action by default, not an accidental raw prompt.
- A conservative verifier should decide continue / pause / done.
- If a future continuation loop is added, user input should preempt automatic continuation.
- Goal state should persist outside a transient model context.
- Any future loop needs a hard budget and explicit resume.

### OpenClaw

OpenClaw exposes an `agent` command with explicit session selectors and agent targeting. It supports gateway execution and local embedded execution, and keeps session routing separate from reply delivery.

Reference: https://docs.openclaw.ai/cli/agent

The useful Taskplane lesson is that explicit session identity matters. A command should know which durable session it targets before execution starts. Taskplane already has this through task id, run id, and task dynamics; native CLI command forwarding should preserve that identity instead of creating hidden external sessions.

### Claude Cowork

Claude Cowork presents tasks as long-running local work. It plans, breaks complex work into subtasks when needed, can coordinate parallel workstreams, runs code in an isolated local VM, shows progress, allows user steering, supports scheduled tasks, and requires explicit permission before permanent deletion.

Reference: https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork

The useful Taskplane lesson is not uncontrolled parallelism. The useful lesson is a visible task-level work surface:

- plan before run;
- progress indicators;
- user steering;
- bounded subagents;
- explicit destructive-action permission;
- tasks and projects as first-class work containers.

## Product Positioning

Taskplane should distinguish four layers:

```text
Product Session
  Durable task memory and audit log.

Product Harness
  Goal, planning, context, gates, verification, memory routing, Decisions,
  command routing, and runtime adapter selection.

Execution Runtime
  User-selected backend for executing agent work.
  First version: Agent CLI.
  Future version: Agent API.

Native Backend Mode
  Optional runtime-specific features such as Codex/Claude native goal mode.
```

Agent CLI and Agent API are peers in the execution runtime layer. They are a user choice, not a helper-vs-primary split.

Task decomposition, context confirmation, task records, task acceptance, and context clearing are not "Agent API runtime" features. They are Taskplane harness features. Some of them may call a model service internally, but that does not make them the selected execution runtime.

The practical rule for the next passes is: delaying Agent API execution does not delay the runtime task loop. Task Goal control, decomposition drafts, subtask-start checks, context assembly, run gates, verifier checks, task-memory proposals, completion checks, handoff records, and context clearing must keep working as Taskplane harness flows while Agent CLI is the first executable backend. When Agent API later becomes executable, it should plug into these harness contracts rather than bring a parallel task lifecycle.

Project decomposition has two harness boundaries. Draft generation is provider-visible planning and must stay draft-only behind context assembly, task-memory guidance, and `subtask_draft` checks. User-confirmed child creation is a durable write and must recheck `subtask_draft`, task mutation, post-step evidence, and timeline allowlists. It should not claim `subtask_start` until Taskplane is actually entering or running a child task.

Completion handoff is the opposite side of that boundary. Once completion evidence has passed, entering the next existing child or successor is a `task_to_task_handoff` entrypoint: the completed task keeps `task_completion` coverage, the target task must pass `subtask_start`, and only then should Taskplane write completion/received handoff records, timeline replay events, and open the next task context.

Phase closeout is a separate `phase_closeout_handoff` boundary. It can write a phase Task Record and completion-check evidence without marking the task complete. It consumes RuntimeHandoff and pending-memory checks before refreshing chat, and it only invokes `subtask_start` when the closeout result selects an existing child or successor to enter next.

Ordinary context transitions remain lighter than either handoff boundary. `context.refreshOrLeave` covers same-task refresh, manual refresh, leaving task context, and starting a global conversation. `context.taskSwitch` covers selecting another task in the right panel without completing or entering execution. Both consume RuntimeHandoff, task-memory coverage, and pending task-memory guidance, but neither should claim task completion, task mutation, or `subtask_start`.

## Goal Model

Taskplane should support three related but separate goal concepts:

### Task Goal

The durable product-level objective for a task or subtask.

It is the source of truth for what the work is trying to accomplish. It should survive context clearing, runtime switching, and app restarts.

### Run Goal Contract

The execution-time projection of a Task Goal into a specific run.

It should include:

- task id and title;
- selected execution runtime;
- sandbox or permission mode;
- user request;
- objective;
- completion conditions;
- validation evidence;
- constraints and non-goals;
- context manifest summary;
- expected output shape.

This is already partially implemented for Agent CLI as the `Agent CLI 目标契约` run step.

### Native Runtime Goal Mode

An optional backend feature where Taskplane asks a specific runtime to use its native goal behavior, such as Codex or Claude goal mode.

Native runtime goal mode is not the product source of truth. It is a backend execution strategy.

## Slash Command Routing

The earlier instinct to never pass `/goal` to the underlying CLI is too strict. Mature agent products show that command passthrough can be useful, but only when routing is explicit.

Taskplane should use a command-routing policy:

### Product-owned commands

These are parsed by Taskplane first:

```text
/goal <text>
/goal status
/goal pause
/goal resume
/goal clear
/cancel
/status
```

By default, `/goal` sets or updates the Taskplane Task Goal and creates a Run Goal Contract. It should not silently create a hidden Codex or Claude goal outside Taskplane's session.

### Runtime-native commands

Runtime-native commands are allowed only when:

- the selected runtime adapter declares support;
- the user explicitly selects native goal mode in the UI, or uses an explicit namespace;
- Taskplane records the native command in the session log;
- Taskplane can still cancel, time out, and verify the result.

Possible explicit forms:

```text
/runtime goal <text>
/codex goal <text>
/claude goal <text>
```

The exact surface can be decided later. The product rule is that native command forwarding must be explicit and auditable.

### Native Goal Forwarding Evidence Gate

Runtime-native goal passthrough must stay audit-only until a runtime adapter proves all of the following:

- **Command shape**: the adapter owns an explicit non-interactive command form for native goal execution. Taskplane must not infer hidden flags from free text or shell aliases.
- **State reflection**: Taskplane can record the forwarded objective, runtime id, command preview, run id, terminal status, and whether the runtime accepted or rejected native goal mode.
- **Progress evidence**: the runtime exposes enough stdout, structured progress, or checkpoint text for task dynamics to show what happened without opening the native runtime session.
- **Control boundary**: Taskplane can cancel or time out the forwarded native goal request and persist cancellation/failure evidence in the same run.
- **Memory boundary**: successful terminal evidence still goes through the verifier and user-confirmed Task Memory proposal path. Native runtime memory cannot replace Taskplane Task Records.
- **No silent source of truth shift**: Taskplane `/goal` remains product-owned. Native goal mode is per explicit request or explicit UI toggle, never a background side effect of the durable Task Goal.
- **Packaged smoke**: the adapter has a deterministic fake-runtime packaged smoke that proves audit, forwarding, cancellation, terminal evidence, task dynamics, and no unexpected workspace writes.

Until every item is satisfied, `/codex goal ...`, `/claude goal ...`, and `/runtime goal ...` remain runtime-audit entries that do not call the CLI.

### Local Daemon Decision Rule

Do not add a local daemon for the first Agent CLI product loop. The Electron main process plus persisted run steps is enough while Taskplane only needs bounded task-bound runs, cancellation, terminal evidence, and packaged smoke coverage.

A daemon becomes justified only if at least one of these requirements becomes real and cannot be handled safely in-process:

- a runtime session must survive app restarts while preserving cancellation and checkpoint ownership;
- multiple long-running agent sessions need scheduling, backpressure, or resource isolation beyond the current workload tracker;
- native runtime progress must be streamed and replayed as structured events rather than terminal stdout/stderr;
- workspace sandbox/checkpoint state needs a separate supervisor process with explicit recovery after crashes;
- Agent API or CLI-native goal mode requires resumable harness/session semantics that the Electron process cannot own reliably.

Until then, daemon work is deferred. The product should continue hardening the current harness contract, packaged smokes, and run evidence before adding another process boundary.

### CLI Argument Exposure Rule

Do not expose arbitrary custom CLI arguments in first-version settings. Runtime command shape stays adapter-owned:

- Codex remains `codex exec --sandbox read-only --cd <workspace> --skip-git-repo-check -`.
- Claude remains `claude -p --permission-mode plan --output-format text`.
- Workspace-write or editing modes remain rejected at the service boundary.

Guarded custom arguments can be considered only when each flag is modeled as a typed capability or policy field, not a free-form string. A future flag must declare:

- which adapter owns it;
- whether it changes workspace write capability, network/tool access, account scope, model spend, or persistence;
- how it appears in command preview and run evidence;
- which packaged fake-runtime smoke proves it does not bypass sandbox, cancellation, context assembly, task memory, or verifier gates.

Until then, adapter code is the only place CLI arguments may be changed.

### API Verifier Subagent Rule

The future Agent API verifier subagent should augment, not replace, the current harness contract. It must consume the same persisted inputs the lightweight verifier already uses:

- Run Goal Contract;
- terminal step output, stderr/failure reason, and status;
- task completion criteria and Task Goal lifecycle state;
- task-memory guidance/proposal state;
- selected execution runtime boundary and sandbox/permission mode.

It must emit the same decision shape as `taskplane.verifier.lightweight`: verdict, decision, reason, evidence, missing evidence, next action, `shouldProposeTaskMemory`, `userConfirmationRequired`, and `canMarkTaskComplete`.

Safety boundaries:

- The API verifier may add richer evidence analysis, but it cannot mark a task complete by itself in the first version.
- `userConfirmationRequired` remains true for Task Memory writes and task completion.
- If the API verifier is unavailable, times out, or emits invalid structure, Taskplane falls back to the deterministic lightweight verifier.
- API verifier output must be persisted as run verification evidence, not hidden chat text.
- Packaged/non-provider smokes must continue to pass with the lightweight verifier only.

This keeps the verifier subagent as an acceptance helper rather than a second execution runtime or an automatic completion authority.

Implementation boundary: run acceptance verification is now modeled as a non-executing `verification_harness` entrypoint. It consumes terminal run evidence and the Run Goal Contract through post-step verification. A future API verifier subagent can plug into that entrypoint in shadow or assist mode, but it must not start work, mutate task state, or bypass user-confirmed completion/memory writes.

### API Verifier Default-On Threshold

Keep the API verifier subagent off by default until it satisfies all of these conditions:

- **Shadow mode first**: run it beside the lightweight verifier without changing user-visible decisions for at least 30 representative runs before it can affect product behavior. The sample must include successful Agent CLI runs, failed/timeout/cancelled CLI runs, missing-evidence runs, runs with Task Goal completion conditions, runs with pending task-memory proposals, and future Agent API runs once that runtime becomes executable.
- **Structured validity**: schema-invalid, partial, or unparsable verifier outputs must be 0 in the last 20 shadow runs and below 2% across the full tracked sample. Any invalid output must fall back to `taskplane.verifier.lightweight`.
- **Decision compatibility**: when the API verifier disagrees with the lightweight verifier, Taskplane records the disagreement as evidence and chooses the more conservative next action. Unexplained disagreements must stay below 10% of the tracked sample, and every disagreement must be inspectable from persisted run evidence.
- **No autonomous completion**: `canMarkTaskComplete` stays false unless a separate task-completion confirmation path is implemented and tested.
- **Memory confirmation preserved**: `shouldProposeTaskMemory=true` may surface richer Task Record drafts, but user confirmation is still required before writing.
- **Provider-off acceptance**: packaged and local default smokes still pass without any provider/API call.
- **Operational budget**: timeout, retry, and cost limits are explicit and visible in run evidence. The first default-on candidate should use no automatic retries, a per-check timeout at or below 15 seconds, and a visible provider/model/cost estimate in the verification step.
- **Rollout switch**: default-on must still be controlled by a runtime setting or feature flag for at least one release, so packaged/provider-off environments and enterprise/offline workflows can keep the lightweight verifier only.

Only after those conditions are met should the API verifier become the default acceptance helper. Even then, the lightweight verifier remains the deterministic fallback.

### Plain text fallback

If a slash command is unknown or unsupported by the current runtime, Taskplane should not guess. It should explain what is supported and offer to send the text as a normal task message.

## Runtime Adapter Capability Shape

Future runtime adapters should expose a small capability contract:

```ts
type AgentRuntimeAdapterCapabilities = {
  id: 'codex' | 'claude' | 'agent_api';
  label: string;
  executionKind: 'cli' | 'api';
  supportsSingleRun: boolean;
  supportsNativeGoalMode: boolean;
  supportsPauseGoal: boolean;
  supportsResumeGoal: boolean;
  supportsClearGoal: boolean;
  supportsStructuredProgressEvents: boolean;
  supportsWorkspaceWrite: boolean;
  defaultPermissionMode: 'read_only' | 'plan' | 'workspace_write';
  commandRouting: {
    productOwned: string[];
    runtimeNative: string[];
    passthroughRequiresExplicitNamespace: boolean;
  };
};
```

First-version Agent CLI adapters should keep:

- Codex: single read-only run as default;
- Claude Code: plan-mode run as default;
- native goal mode: supported later behind an explicit adapter flag;
- workspace write: disabled until product confirmation and promotion paths exist.

Future Agent API should implement the same harness contract rather than owning a separate task lifecycle.

## Subagent Positioning

Subagents should be bounded harness roles, not unlimited worker spawning.

First useful roles:

- verifier subagent: reviews a Run Goal Contract, terminal output, completion criteria, and task memory; writes a run verification result;
- context assembler subagent: proposes what context should be included in a run;
- decomposition reviewer subagent: checks project subtask drafts before user confirmation.

The first subagent to productize should be the verifier. It has read-only scope and strengthens task acceptance without expanding execution risk.

## Compatibility With Current Taskplane Flows

Existing product flows remain compatible with Agent CLI as the first execution runtime:

- project decomposition remains a Taskplane harness planner flow;
- subtask draft validation remains shared product logic;
- subtask start and context readiness checks remain runtime gates;
- Task Records and Task.md remain product memory surfaces;
- run verification remains a product harness concern;
- context clearing remains blocked by pending memory guidance;
- Agent CLI provides terminal execution evidence and optional native backend capabilities.

The main missing bridge is not another execution backend. It is making Task Goal, Run Goal Contract, command routing, and verifier subagent explicit shared concepts.

## Recommended Implementation Order

1. Promote Agent CLI run contract into a shared `RunGoalContract` type.
2. Add a product-level `TaskGoal` state or derive a first version from task next step plus completion criteria.
3. Add slash-command parsing in RightPanel for product-owned `/goal` commands.
4. Show current Task Goal in the task-bound panel.
5. Keep `/goal` product-owned by default.
6. Add runtime adapter capability flags for native goal mode, initially disabled or experimental.
7. Add explicit native command namespace or UI toggle before passing goal commands to Codex or Claude.
8. Upgrade the lightweight `验收子 Agent 检查` into a verifier subagent that emits structured run verification.
9. Only after that, consider a Taskplane-controlled continuation loop with budget, pause, resume, and user-message preemption.

## Current Implementation Status

First pass implemented on 2026-05-19:

- `RunGoalContract` is now a shared runtime-harness type.
- Agent CLI runs write the shared contract into the existing `Agent CLI 目标契约` run step.
- RightPanel parses product-owned `/goal` commands before chat or Agent CLI execution.
- `/goal <text>` updates the task `nextStep` as the first durable Task Goal projection.
- `/goal` now accepts optional lightweight completion conditions with headings such as `验收:`, `完成条件:`, `acceptance:`, or bullet lines under those headings. Taskplane writes those conditions as completion criteria when possible, and also records them in the Task Goal timeline payload so the next Run Goal Contract can consume them before a detail refresh.
- `/goal status` reports the current Task Goal state and its explicit completion conditions, falling back to open task completion criteria only when the goal itself has no recorded conditions.
- `/goal clear` clears that durable Task Goal projection when a goal exists, records the previous objective, and keeps the lifecycle visible in task dynamics.
- `/goal pause` and `/goal resume` now persist Task Goal lifecycle control events. A paused Task Goal remains visible on the task, but is not projected as the next Run Goal Contract objective until resumed.
- `RunGoalContract` now carries the derived Task Goal lifecycle state, so verifier/subagent code can distinguish an active durable Task Goal from a paused goal plus one-off user request.
- `/codex goal ...`, `/claude goal ...`, and `/runtime goal ...` are recognized as explicit runtime-native goal requests. Native forwarding remains disabled, but Taskplane now records a non-executing audit run with a skipped step so the request appears in the Run evidence chain as well as task dynamics.
- The task-bound panel surfaces the current Task Goal above the run-context preview.
- Agent CLI runtime status now carries explicit adapter capability flags. Codex and Claude both default `supportsNativeGoalMode=false`, `supportsWorkspaceWrite=false`, and `passthroughRequiresExplicitNamespace=true`.
- Runtime-native goal forwarding is evaluated by a shared closed policy (`evaluateRuntimeNativeGoalForwarding`) instead of ad hoc UI strings. Even if an adapter later declares native goal support, Taskplane still records audit-only evidence until the passthrough entrypoint is explicitly opened.
- Native goal forwarding readiness now has a local evidence-gate evaluator. It keeps forwarding audit-only until command shape, state reflection, progress evidence, cancellation/timeout control, memory boundary, Taskplane source-of-truth boundary, and packaged fake-runtime smoke are all verified for the adapter.
- Product `/goal` updates and explicit native-goal requests are persisted into task dynamics through `panel.task_goal_updated` and `panel.runtime_native_goal_requested`; runtime-native goal requests also persist a completed system-output audit run without calling the CLI.
- Task dynamics projects runtime-native goal audit runs as readable non-forwarded evidence, so users see that the request was audited rather than silently executed or dropped.
- The Agent CLI terminal acceptance check now uses a shared bounded verifier contract (`taskplane.verifier.lightweight`) that reads the Run Goal Contract and terminal evidence. The result includes a structured decision (`accept_for_review`, `needs_evidence`, or `failed`), next action, memory-proposal flag, and an explicit `canMarkTaskComplete=false` safety boundary. This is still local and deterministic, but gives the future API verifier subagent a stable input/output shape.
- Agent CLI task-memory proposal creation now follows the verifier result instead of duplicating its own stdout rule: only `shouldProposeTaskMemory=true` creates the `任务记忆建议` step, and the proposal records the verifier decision and next action.
- Agent CLI Task Record suggestions now include the runtime permission boundary, Run Goal objective, completion-condition count, verifier decision, source run id, and user-confirmation requirement before the user confirms any memory write.
- Agent CLI Task Record suggestions now also list the concrete completion conditions reviewed by the verifier, so accepted memory proposals preserve more than a condition count.
- The confirmed Task Memory write plan preserves structured suggested Task Record content, including runtime boundary and objective fields, all the way into the final create input.
- Confirming the Task Memory write proposal preserves goal acceptance-condition details in the created Task Record and clears the pending-memory blocker for the next task-bound Agent run.
- Agent CLI run_start now has explicit regression coverage for the Task Memory gate: a previous `任务记忆建议` that still needs Task Record confirmation blocks the next CLI run before Taskplane creates a run or calls the executor.
- Agent CLI now has explicit service-level regressions for the shared target-readiness and context-assembly gates: completed/archived tasks or missing Task.md recovery context stop execution before Taskplane creates a run or calls the CLI.
- Agent CLI cancellation is tracked as local execution control rather than a new execution start: the registered gate is explicit operator confirmation, and terminal evidence still lands through the already-gated run path.
- Runtime-native goal audit is registered as its own non-executing runtime-audit entrypoint. It requires explicit operator confirmation plus a non-empty objective, records system audit evidence, and still does not call the CLI.
- AI Runtime configuration now separates three concepts in copy: first-version Agent CLI execution, future peer Agent API Runtime execution, and model-service configuration for global helper/summaries/lightweight model calls.
- RightPanel uses the same terminology: global chat is model-service assistance, unavailable CLI falls back to model-service assistance, and legacy `api` runtime mode is shown as `Agent API Runtime` in development rather than as an active model-service executor.
- CapabilityRegistry and ConfigurationSafetyReport now include `agent_api.runtime` as a disabled peer execution runtime, so diagnostics and context manifests see Agent API as a real planned runtime rather than conflating it with model-service configuration.
- RuntimeCapabilitySnapshot now records the selected execution runtime (`codex`, `claude`, or `api`), its runtime kind, and whether it is executable. CapabilityRegistry summaries surface the selected Agent CLI or selected-but-disabled Agent API state for diagnostics without changing execution behavior.
- ConfigurationSafetyReport keeps the user-facing safety reason separate from an optional diagnostic summary, so Settings and capability pages can show selected-runtime diagnostics without replacing the blocking reason.
- RuntimeContextManifest includes the selected runtime label, kind, executable flag, and reason in the `runtime_capabilities` item, so Agent CLI accepted steps and context bridges carry the same runtime boundary shown in diagnostics.
- Agent CLI accepted steps now persist the formatted RuntimeContextManifest, including `memory_retrieval` rows, so received completion handoff Task Records are visible both in run evidence and in the prompt sent to the selected CLI.
- Code Agent model-producer runs now persist a retained RuntimeContextManifest step and pass that formatted manifest into the provider prompt. This keeps future Agent API execution aligned with Agent CLI on task memory retrieval, received handoff recovery, and product-owned context bridge evidence even though Agent API remains a later peer execution runtime.
- Product-owned `/goal` is now registered as a durable Taskplane harness entrypoint. It writes task nextStep, completion criteria, and `panel.task_goal_*` timeline events through task mutation guards, and it remains independent of the selected execution runtime.
- Run acceptance verification is now registered separately as a non-executing `verification_harness` entrypoint. This keeps the lightweight verifier and future API verifier subagent inside Taskplane's harness, not inside the Agent API execution layer.
- API verifier default-on criteria now have a local readiness evaluator. It does not call a provider or change user-visible decisions; it only checks whether persisted future shadow samples meet the documented sample count, representative-case, structured-validity, disagreement-rate, and inspectability thresholds. A pure projection can derive those samples from run detail once a future run has both lightweight and `ai_verifier` run-level verification records.
- Project decomposition confirmation now records the correct gate boundary: it rechecks `subtask_draft` before creating real child tasks, while `subtask_start` remains reserved for entering or running an existing child.
- Completion handoff is now registered as a `task_to_task_handoff` boundary: task completion coverage stays with the completed task, `subtask_start` guards the next task, and durable handoff records/timeline events are written only on that path.
- Phase closeout is now registered as a separate `phase_closeout_handoff` boundary, so stage closeout, chat refresh, and optional next-task entry stay distinct from full task completion.
- Context transitions are split into `context.refreshOrLeave` and `context.taskSwitch`, keeping ordinary refresh/leave/switch flows on RuntimeHandoff and task-memory checks without overstating them as completion, mutation, or subtask-start entrypoints.
- Future Agent API execution should use the same entrypoint category as Agent CLI (`provider_visible_execution`) once it becomes executable. It must reuse runtime action, context assembly, task-memory coverage/guidance, pre-step, subtask-start, and post-step gates; Agent API cancellation/control and audit-only backend features should stay in separate control/audit entrypoint categories.

Remaining next steps are hardening the Taskplane-owned goal loop and deciding when the Agent API verifier subagent has enough structured reliability to augment the deterministic lightweight verifier. Native CLI goal forwarding remains a later compatibility track, not a first-version product blocker.

## Non-Goals For The Next Pass

- Do not enable workspace-write Agent CLI mode by default.
- Do not make CLI-native goal state the Taskplane source of truth.
- Do not add unbounded multi-agent execution.
- Do not let unknown slash commands silently pass through to a runtime.
- Do not treat future Agent API as a helper layer; it is a peer execution runtime once completed.

## Resolved Constraints

- `/goal <text>` only sets or updates the durable Taskplane Task Goal. It does not auto-start execution.
- A task-bound Agent run still starts from a normal task message after the user has the right task context open.
- The first-version Taskplane-owned goal loop is explicit and bounded: each Agent run must be user-started, and verifier output can propose the next run but cannot launch it automatically.
- Runtime-native goal requests require an explicit namespace such as `/codex goal ...`, `/claude goal ...`, or `/runtime goal ...`.
- Runtime-native goal requests are audit-only in the first Agent CLI version. Taskplane records evidence that the request was not forwarded, and does not call the CLI for that request.
- Native goal routing is per explicit request for now. There is no global or per-task setting that silently forwards product `/goal` state into a runtime-native goal mode.
- Taskplane remains the source of truth for task goal, session evidence, run logs, task dynamics, and user-confirmed memory writes.
- The first-version Agent CLI harness keeps sandbox mode read-only for Codex and plan mode for Claude.

## Future Automatic Continuation Gate

Automatic continuation is not part of the first-version Agent CLI product loop. It can be reconsidered only after all of these conditions are true:

- The run has an active Taskplane Task Goal, concrete completion conditions, and a deterministic continue / pause / done verifier result.
- The next continuation prompt is visible as a proposed action before execution.
- Pending decisions, open runtime gates, cancellation, timeout, failed terminal steps, and unwritten task-memory proposals all block continuation.
- The loop has an explicit user-configured turn budget, a visible pause control, and a resume path that records why execution continued.
- New user input preempts the queued continuation and is stored as the latest operator intent.
- Packaged-app smoke coverage proves continuation preserves run evidence, task dynamics, task-memory proposals, and workspace write boundaries.

## Remaining Decisions

- How much native CLI goal progress Codex and Claude can expose in non-interactive task runs, and whether that progress is rich enough to satisfy the Native Goal Forwarding Evidence Gate. This is optional compatibility work, not the first-version goal-framework requirement.
- Which concrete future requirement, if any, crosses the Local Daemon Decision Rule.
- Whether future shadow-mode verifier samples satisfy the concrete API Verifier Default-On Threshold.

## Next Evaluation Checklist

1. Keep first-version `/goal` work focused on Taskplane-owned durable goal state, completion conditions, explicit user-started bounded runs, verifier judgment, and user-confirmed task-memory proposals.
2. If native runtime goal compatibility becomes important, run a manual Codex/Claude native-goal discovery pass outside the default smoke path, using fake or disposable tasks, and capture:
   - exact command forms;
   - stdout/stderr shape;
   - terminal status behavior;
   - cancellation behavior;
   - whether progress can be replayed without opening the native session.
   Use `npm run manual:agent-cli-native-goal-discovery` for version/help probes, and enable `TASKPLANE_RUN_AGENT_CLI_NATIVE_GOAL_DISCOVERY=true` only for disposable candidate command execution.
3. Compare those findings against the Native Goal Forwarding Evidence Gate before changing adapter flags.
4. Keep local daemon work blocked unless a real requirement crosses the Local Daemon Decision Rule.
5. If Agent API verifier work resumes, start in shadow mode and measure the API Verifier Default-On Threshold before changing user-visible decisions.

## Discovery Notes

- Official OpenAI Codex material documents `/goal` as an experimental Codex CLI slash command gated by `features.goals`, with set/view/pause/resume/clear behavior and guidance for durable objectives. That is evidence that native Codex goal mode is a real backend capability. It is not yet evidence that Taskplane can safely forward a task-bound, non-interactive `codex exec` request without additional adapter proof. References: https://developers.openai.com/codex/use-cases/follow-goals and https://developers.openai.com/codex/cli/slash-commands
- Official Claude Code material documents `/goal` as a session-scoped completion condition that can run non-interactively with `claude -p "/goal ..."`. It also documents `/agents`, `--agent`, `--agents`, subagent files, memory, and tool restrictions as agent/subagent configuration surfaces. The non-interactive Claude goal form is concrete enough for a future candidate probe, but Taskplane still needs cancellation, stdout/progress, sandbox/permission, and memory/verifier evidence before forwarding it. References: https://code.claude.com/docs/en/goal, https://code.claude.com/docs/en/cli-usage, and https://code.claude.com/docs/en/sub-agents
- 2026-05-20 local Codex CLI help probe (`codex-cli 0.125.0`) showed `exec`, `review`, `login`, `logout`, `mcp`, `plugin`, `mcp-server`, `app-server`, `app`, and `completion` as top-level commands. `codex goal --help` and `codex goals --help` returned the top-level help shape rather than an explicit native goal subcommand. This does not contradict the documented slash command, but it is evidence to keep Codex native goal passthrough audit-only until a concrete task-bound non-interactive command shape is probed.
- 2026-05-20 local Claude Code help probe (`2.1.144`) showed non-interactive print mode plus agent configuration flags such as `--agent` and `--agents`, but `claude goal --help` and `claude goals --help` returned the general Claude Code help shape rather than an explicit native goal subcommand. This does not contradict the documented `claude -p "/goal ..."` slash-command form; it only rules out treating `goal` as a shell subcommand. Taskplane still needs a disposable candidate probe before enabling forwarding.
- The manual native-goal discovery script now keeps default probing to version/help surfaces only. It prints candidate slash-command argument examples for explicit opt-in runs instead of probing `goal` or `goals` as shell subcommands by default.

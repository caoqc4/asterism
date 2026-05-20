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
- User input should preempt automatic continuation.
- Goal state should persist outside a transient model context.
- The loop needs a hard budget and explicit resume.

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
- `/goal clear` clears that durable Task Goal projection when a goal exists, records the previous objective, and keeps the lifecycle visible in task dynamics.
- `/goal pause` and `/goal resume` now persist Task Goal lifecycle control events. A paused Task Goal remains visible on the task, but is not projected as the next Run Goal Contract objective until resumed.
- `RunGoalContract` now carries the derived Task Goal lifecycle state, so verifier/subagent code can distinguish an active durable Task Goal from a paused goal plus one-off user request.
- `/codex goal ...`, `/claude goal ...`, and `/runtime goal ...` are recognized as explicit runtime-native goal requests. Native forwarding remains disabled, but Taskplane now records a non-executing audit run with a skipped step so the request appears in the Run evidence chain as well as task dynamics.
- The task-bound panel surfaces the current Task Goal above the run-context preview.
- Agent CLI runtime status now carries explicit adapter capability flags. Codex and Claude both default `supportsNativeGoalMode=false`, `supportsWorkspaceWrite=false`, and `passthroughRequiresExplicitNamespace=true`.
- Runtime-native goal forwarding is evaluated by a shared closed policy (`evaluateRuntimeNativeGoalForwarding`) instead of ad hoc UI strings. Even if an adapter later declares native goal support, Taskplane still records audit-only evidence until the passthrough entrypoint is explicitly opened.
- Product `/goal` updates and explicit native-goal requests are persisted into task dynamics through `panel.task_goal_updated` and `panel.runtime_native_goal_requested`; runtime-native goal requests also persist a completed system-output audit run without calling the CLI.
- Task dynamics projects runtime-native goal audit runs as readable non-forwarded evidence, so users see that the request was audited rather than silently executed or dropped.
- The Agent CLI terminal acceptance check now uses a shared bounded verifier contract (`taskplane.verifier.lightweight`) that reads the Run Goal Contract and terminal evidence. The result includes a structured decision (`accept_for_review`, `needs_evidence`, or `failed`), next action, memory-proposal flag, and an explicit `canMarkTaskComplete=false` safety boundary. This is still local and deterministic, but gives the future API verifier subagent a stable input/output shape.
- Agent CLI task-memory proposal creation now follows the verifier result instead of duplicating its own stdout rule: only `shouldProposeTaskMemory=true` creates the `任务记忆建议` step, and the proposal records the verifier decision and next action.
- Agent CLI Task Record suggestions now include the runtime permission boundary, Run Goal objective, completion-condition count, verifier decision, source run id, and user-confirmation requirement before the user confirms any memory write.
- The confirmed Task Memory write plan preserves structured suggested Task Record content, including runtime boundary and objective fields, all the way into the final create input.
- Agent CLI run_start now has explicit regression coverage for the Task Memory gate: a previous `任务记忆建议` that still needs Task Record confirmation blocks the next CLI run before Taskplane creates a run or calls the executor.
- Agent CLI now has explicit service-level regressions for the shared target-readiness and context-assembly gates: completed/archived tasks or missing Task.md recovery context stop execution before Taskplane creates a run or calls the CLI.
- AI Runtime configuration now separates three concepts in copy: first-version Agent CLI execution, future peer Agent API Runtime execution, and model-service configuration for global helper/summaries/lightweight model calls.
- RightPanel uses the same terminology: global chat is model-service assistance, unavailable CLI falls back to model-service assistance, and legacy `api` runtime mode is shown as `Agent API Runtime` in development rather than as an active model-service executor.
- CapabilityRegistry and ConfigurationSafetyReport now include `agent_api.runtime` as a disabled peer execution runtime, so diagnostics and context manifests see Agent API as a real planned runtime rather than conflating it with model-service configuration.
- RuntimeCapabilitySnapshot now records the selected execution runtime (`codex`, `claude`, or `api`), its runtime kind, and whether it is executable. CapabilityRegistry summaries surface the selected Agent CLI or selected-but-disabled Agent API state for diagnostics without changing execution behavior.
- ConfigurationSafetyReport keeps the user-facing safety reason separate from an optional diagnostic summary, so Settings and capability pages can show selected-runtime diagnostics without replacing the blocking reason.
- RuntimeContextManifest includes the selected runtime label, kind, executable flag, and reason in the `runtime_capabilities` item, so Agent CLI accepted steps and context bridges carry the same runtime boundary shown in diagnostics.

Remaining next steps are deciding what evidence an adapter must provide before actual native-goal forwarding is allowed, and replacing the deterministic lightweight verifier with an optional API verifier subagent when the Agent API runtime is ready.

## Non-Goals For The Next Pass

- Do not enable workspace-write Agent CLI mode by default.
- Do not make CLI-native goal state the Taskplane source of truth.
- Do not add unbounded multi-agent execution.
- Do not let unknown slash commands silently pass through to a runtime.
- Do not treat future Agent API as a helper layer; it is a peer execution runtime once completed.

## Resolved Constraints

- `/goal <text>` only sets or updates the durable Taskplane Task Goal. It does not auto-start execution.
- A task-bound Agent run still starts from a normal task message after the user has the right task context open.
- Runtime-native goal requests require an explicit namespace such as `/codex goal ...`, `/claude goal ...`, or `/runtime goal ...`.
- Runtime-native goal requests are audit-only in the first Agent CLI version. Taskplane records evidence that the request was not forwarded, and does not call the CLI for that request.
- Native goal routing is per explicit request for now. There is no global or per-task setting that silently forwards product `/goal` state into a runtime-native goal mode.
- Taskplane remains the source of truth for task goal, session evidence, run logs, task dynamics, and user-confirmed memory writes.
- The first-version Agent CLI harness keeps sandbox mode read-only for Codex and plan mode for Claude.

## Remaining Decisions

- What adapter-level evidence is required before actual runtime-native goal forwarding can be enabled for Codex or Claude.
- How much native CLI goal progress Codex and Claude can expose in non-interactive task runs.
- Whether a local daemon is needed later for richer session/checkpoint/replay behavior, or whether the Electron app process remains enough.
- Whether guarded custom CLI arguments should be exposed through settings, or kept adapter-owned only.
- How the future Agent API Runtime verifier/subagent replaces or augments the deterministic lightweight verifier contract.

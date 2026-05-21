# Agent Runtime Harness And Goal Compatibility

Date: 2026-05-19

## Purpose

This note captures the product direction after evaluating Agent CLI, future Agent API, Codex/Claude goal modes, Anthropic Managed Agents, Hermes Agent, Multica, OpenClaw, and Claude Cowork.

The main design correction is:

- Agent CLI and Agent API are peer AI invocation runtimes, not helper-vs-primary layers.
- Taskplane's product runtime is the durable session and harness that decides which runtime phase is happening, which context and gates apply, and which selected AI invocation adapter should be used when that phase needs model work.
- Goal, task type review, task decomposition, context assembly, execution, verification, memory proposals, context clearing, and Decisions should belong to Taskplane's harness unless a specific runtime adapter explicitly owns a narrower backend detail.

This avoids treating the first-version Agent CLI path as a code-execution-only feature, while still allowing Taskplane to ship the safest adapter first. Agent CLI is the first selected AI invocation layer; Agent API is the future peer selected AI invocation layer.

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
  Goal, task type review, planning, decomposition, context, gates, execution
  intent, verification, memory routing, Decisions, command routing, and runtime
  adapter selection.

AI Invocation Runtime
  User-selected backend for AI calls made by harness phases.
  First version: Agent CLI.
  Future version: Agent API.

Native Backend Mode
  Optional runtime-specific features such as Codex/Claude native goal mode.
```

Agent CLI and Agent API are peers in the AI invocation runtime layer. They are a user choice, not a helper-vs-primary split. Execution run is only one harness phase that may call the selected runtime; task type review, decomposition draft, verifier assist, and memory synthesis can also be AI-invocation phases.

Task decomposition, context confirmation, task records, task acceptance, task type review, and context clearing are not "Agent API runtime" features. They are Taskplane harness features. When one of these phases needs AI, it should use the selected AI invocation runtime. If the selected runtime cannot satisfy that phase yet, Taskplane should mark the phase unsupported or explicitly route through the selected API runtime path, not silently fall through to a different AI layer.

The practical rule for the next passes is: delaying Agent API does not delay the runtime task loop, but it does require the Agent CLI path to be evaluated as the first selected AI invocation adapter across more than terminal execution. Task Goal control, task type review, decomposition drafts, subtask-start checks, context assembly, run gates, verifier checks, task-memory proposals, completion checks, handoff records, and context clearing must keep working as Taskplane harness flows while Agent CLI is the first selectable adapter. When Agent API later becomes selectable, it should plug into these harness contracts rather than bring a parallel task lifecycle.

## AI Invocation Contract

Runtime phases should call AI through an adapter-neutral contract:

```text
RuntimeInvocationRequest
  phase:
    task_type_review
    decomposition_draft
    task_planning
    execution_run
    verification_assist
    memory_proposal
    handoff_summary
  task/session identity
  selected runtime mode
  context manifest
  expected output contract
  permission/sandbox boundary
  persistence policy
```

Adapter responsibilities:

- Agent CLI adapter: translate the request into Codex CLI or Claude Code command/prompt shape, preserve Taskplane context manifest and permission boundary, record stdout/stderr/run steps, and return structured evidence or a proposal when possible.
- Agent API adapter: translate the same request into provider-native messages/tools, enforce the same context manifest, output contract, gates, and persistence policy, and return the same evidence/proposal shape.
- API runtime adapter: provider-backed model calls belong under the Agent API Runtime path. They are a peer AI invocation layer, not an auxiliary helper for Agent CLI and not an implicit fallback when a selected CLI is unavailable.

The first implementation target is not to make every phase use CLI immediately. The target is to remove hidden coupling: every model-facing phase should declare whether it uses the selected runtime, local rules, or product harness only. Cross-runtime fallback must be an explicit user-visible choice, not a quiet service behavior.

## Current Implementation Assessment - 2026-05-21

The current implementation is partly aligned with this model:

- Taskplane already owns the durable harness concepts: task goals, Run Goal Contract, context manifest, runtime gates, task-memory guidance, verifier evidence, Decisions, handoff, and context clearing.
- Agent CLI is wired for the `execution_run` phase: task-bound run start, context assembly, read-only/plan permission boundary, cancellation, terminal evidence, verifier result, and memory proposal.
- Agent API is represented as a disabled peer runtime in capability/configuration state, but it is not yet an executable selected runtime.
- Project decomposition already has draft and confirmation harness boundaries, but draft generation still needs an explicit selected-runtime invocation decision. The current provider-backed implementation should be treated as the API runtime path until the CLI adapter supports this phase.
- Task type review now has a structured local-rule phase. Task capture uses
  `inferTaskTypeProfile` immediately, so titles such as "开发小程序" become
  project work at creation time. RightPanel's "判断任务类型" action returns a
  structured proposal and writes `taskType/taskFacets` only after user
  confirmation through guarded task metadata update. It does not call a hidden
  API helper.
- Global chat and lightweight summaries are AI invocation phases too. They should use the selected runtime where supported; current provider-backed behavior should be named as the API runtime path, not as a generic assistant fallback.

Immediate cleanup target:

1. Inventory every model-facing call site (`chatWithAI`, decomposition draft generation, task type review, verifier assist candidates, memory synthesis candidates).
2. Mark each call as one of: selected AI invocation runtime, API runtime path, local rule, or no AI.
3. Add a small adapter-neutral `RuntimeInvocationRequest`/`RuntimeInvocationResult` contract before adding deeper features.
4. Treat the existing local-rule task type review as the first non-execution
   invocation shape: structured recommendation, reason, user confirmation, and
   guarded `taskType/taskFacets` writeback. Future CLI/API adapters can add
   confidence or richer reasoning without changing that boundary.

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
- selected AI invocation runtime;
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
- selected AI invocation runtime boundary and sandbox/permission mode.

It must emit the same decision shape as `taskplane.verifier.lightweight`: verdict, decision, reason, evidence, missing evidence, next action, `shouldProposeTaskMemory`, `userConfirmationRequired`, and `canMarkTaskComplete`.

Safety boundaries:

- The API verifier may add richer evidence analysis, but it cannot mark a task complete by itself in the first version.
- `userConfirmationRequired` remains true for Task Memory writes and task completion.
- If the API verifier is unavailable, times out, or emits invalid structure, Taskplane keeps the deterministic product-harness verifier as the authority for that run.
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

Only after those conditions are met should the API verifier become the default acceptance helper. Even then, the lightweight verifier remains the deterministic product-harness authority for offline, invalid-output, timeout, or provider-disabled cases.

### Plain Text Handling

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

Existing product flows remain compatible with Agent CLI as the first AI invocation runtime, but several still need adapter-neutral routing cleanup:

- project decomposition remains a Taskplane harness planner flow, but its model-facing draft generation should be routed through the selected AI invocation runtime; the current provider-backed implementation is the API runtime path, not an Agent CLI fallback;
- task type review currently exists as a local-rule harness phase with
  proposal/confirmation/writeback; future selected-runtime adapters may improve
  judgment quality, but they must preserve the same proposal boundary;
- subtask draft validation remains shared product logic;
- subtask start and context readiness checks remain runtime gates;
- Task Records and Task.md remain product memory surfaces;
- run verification remains a product harness concern;
- context clearing remains blocked by pending memory guidance;
- Agent CLI provides terminal execution evidence today and should become the first selected adapter for any additional AI invocation phase that can be safely expressed through read-only/plan prompts.

The main missing bridge is not another backend. It is making Task Goal, Run Goal Contract, runtime invocation phase, command routing, task type review, decomposition draft, and verifier subagent explicit shared concepts.

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
- RightPanel now shows an active task-bound Agent CLI run as a read-only execution card with runtime label, run id, task-dynamics persistence, memory-proposal boundary, and cancellation behavior before the terminal step arrives.
- RightPanel now summarizes Task Memory write proposals before the editable draft, so users can inspect key findings, next step, risks, verification result, and links before confirming a Task Record write.
- Confirming a Task Memory write proposal now reports the target, written path, and pending-memory gate clearance in the panel message instead of only saying the write completed.
- Agent CLI run_start now has explicit regression coverage for the Task Memory gate: a previous `任务记忆建议` that still needs Task Record confirmation blocks the next CLI run before Taskplane creates a run or calls the executor.
- Agent CLI now has explicit service-level regressions for the shared target-readiness and context-assembly gates: completed/archived tasks or missing Task.md recovery context stop execution before Taskplane creates a run or calls the CLI.
- Agent CLI cancellation is tracked as local execution control rather than a new execution start: the registered gate is explicit operator confirmation, and terminal evidence still lands through the already-gated run path.
- Runtime-native goal audit is registered as its own non-executing runtime-audit entrypoint. It requires explicit operator confirmation plus a non-empty objective, records system audit evidence, and still does not call the CLI.
- AI Runtime configuration now presents Agent CLI and Agent API as peer AI invocation runtimes. Provider configuration belongs to the Agent API Runtime path and is not described as a helper or hidden fallback for Agent CLI.
- RightPanel now avoids the old fallback wording: selected CLI global phases that are not yet wired are marked as not yet connected, unavailable CLI task phases do not silently fall through to API calls, and `api` runtime mode is shown as the Agent API invocation path for currently wired question/planning phases.
- CapabilityRegistry and ConfigurationSafetyReport now include `agent_api.runtime` as a disabled peer AI invocation runtime, so diagnostics and context manifests see Agent API as a real planned runtime rather than conflating it with raw provider configuration.
- RuntimeCapabilitySnapshot now records the selected AI invocation runtime (`codex`, `claude`, or `api`), its runtime kind, and whether the relevant phase is executable. CapabilityRegistry summaries surface the selected Agent CLI or selected-but-disabled Agent API state for diagnostics without changing execution behavior.
- ConfigurationSafetyReport keeps the user-facing safety reason separate from an optional diagnostic summary, so Settings and capability pages can show selected-runtime diagnostics without replacing the blocking reason.
- RuntimeContextManifest includes the selected runtime label, kind, executable flag, and reason in the `runtime_capabilities` item, so Agent CLI accepted steps and context bridges carry the same runtime boundary shown in diagnostics.
- Agent CLI accepted steps now persist the formatted RuntimeContextManifest, including `memory_retrieval` rows, so received completion handoff Task Records are visible both in run evidence and in the prompt sent to the selected CLI.
- Code Agent model-producer runs now persist a retained RuntimeContextManifest step and pass that formatted manifest into the provider prompt. This keeps future Agent API invocation aligned with Agent CLI on task memory retrieval, received handoff recovery, and product-owned context bridge evidence even though Agent API remains a later peer AI invocation runtime.
- Product-owned `/goal` is now registered as a durable Taskplane harness entrypoint. It writes task nextStep, completion criteria, and `panel.task_goal_*` timeline events through task mutation guards, and it remains independent of the selected AI invocation runtime.
- Run acceptance verification is now registered separately as a non-executing `verification_harness` entrypoint. This keeps the lightweight verifier and future API verifier subagent inside Taskplane's harness, not inside the Agent API execution layer.
- API verifier default-on criteria now have a local readiness evaluator. It does not call a provider or change user-visible decisions; it only checks whether persisted future shadow samples meet the documented sample count, representative-case, structured-validity, disagreement-rate, and inspectability thresholds. A pure projection can derive those samples from run detail once a future run has both lightweight and `ai_verifier` run-level verification records.
- Project decomposition confirmation now records the correct gate boundary: it rechecks `subtask_draft` before creating real child tasks, while `subtask_start` remains reserved for entering or running an existing child.
- Completion handoff is now registered as a `task_to_task_handoff` boundary: task completion coverage stays with the completed task, `subtask_start` guards the next task, and durable handoff records/timeline events are written only on that path.
- Phase closeout is now registered as a separate `phase_closeout_handoff` boundary, so stage closeout, chat refresh, and optional next-task entry stay distinct from full task completion.
- Context transitions are split into `context.refreshOrLeave` and `context.taskSwitch`, keeping ordinary refresh/leave/switch flows on RuntimeHandoff and task-memory checks without overstating them as completion, mutation, or subtask-start entrypoints.
- Future Agent API execution should use the same entrypoint category as Agent CLI (`provider_visible_execution`) once it becomes executable. More generally, future Agent API invocations should use the same harness phase contracts as Agent CLI invocations: runtime action, context assembly, task-memory coverage/guidance, pre-step, subtask-start where applicable, post-step, output contract validation, and user-confirmed persistence. Agent API cancellation/control and audit-only backend features should stay in separate control/audit entrypoint categories.
- The 2026-05-21 architecture correction is that "execution runtime" is too narrow for the selected AI layer. The selected runtime is an AI invocation layer. Execution run is one phase; task type review, decomposition draft, verification assist, and memory proposal are also potential selected-runtime phases. Existing code still contains provider-backed API paths and rule-based paths that should be inventoried before deeper feature work.

The first-version Taskplane-owned goal loop is now stabilized for the Agent CLI path: durable `/goal` state, completion conditions, explicit user-started runs, verifier evidence, task-memory proposals, cancellation handling, fake packaged smoke, CLI-only live smoke, and packaged-app Codex live smoke all have acceptance coverage. Remaining work should stay in preservation or adapter-neutral cleanup tracks unless a new product requirement appears: inventory all AI-facing runtime phases, route them through the selected AI invocation contract where feasible, decide when the Agent API verifier subagent has enough structured reliability to augment the deterministic lightweight verifier, and keep native CLI goal forwarding as a later compatibility track rather than a first-version product blocker.

## 2026-05-21 Implementation Invocation Inventory

This pass checks the corrected product model against the actual code. The product runtime/harness owns the task flow. Agent CLI and Agent API are peer AI invocation runtimes selected by the user. Provider-backed calls should be grouped under the Agent API Runtime path; they must not be treated as an auxiliary fallback for Agent CLI.

| Runtime phase | Current implementation | Current invocation layer | Evaluation | Next action |
| --- | --- | --- | --- | --- |
| Global chat / global helper | `RightPanel.send` uses `window.api.chatWithAI` only for the selected API runtime path; selected CLI global chat is marked not-yet-wired rather than falling through. `ipcMain.handle('ai:chat')` rejects selected CLI modes before resolving API config, otherwise calls `generateText` and returns `global_assistant` or `task_assistant` provenance. | API runtime path where selected; unsupported selected-CLI phase otherwise. | Better aligned with the two-choice runtime model. The remaining gap is implementing a CLI adapter for global assistant or explicitly leaving it unsupported. | Wire CLI support only when command shape, cancellation, and evidence are clear. |
| Task-bound chat when Agent CLI is ready | `RightPanel.send` calls `window.api.triggerAgentCliRun`; `AgentCliRunService` runs Codex/Claude with task context and read-only/plan boundaries. | Selected Agent CLI runtime. | This is the first-version selected-runtime path and is aligned. | Preserve behavior; future Agent API execution should implement the same phase contract instead of a separate product flow. |
| Task-bound chat when selected runtime is unavailable | `RightPanel.send` now returns selected-runtime unavailable guidance and does not call `chatWithAI`. | Unsupported selected runtime phase. | Aligned. This prevents hidden cross-runtime execution and makes the user fix installation/login/runtime choice deliberately. | Preserve this behavior; add a future explicit "run with another runtime" user action if product needs it. |
| Retained ordinary RunService execution | `run:trigger` calls `RunService.trigger`, which uses `RunOrchestrator`, `RuntimeAiConfig`, `TextExecutor`, optional provider-native tool schemas, and a local conservative agent plan inside the same run when structured model proposals are unavailable or unsafe. | API Runtime / Agent API-like execution path, gated as provider-visible execution. | Compatible as a retained path, but it must not be mistaken for first-version Agent CLI execution or used as hidden fallback when selected CLI is unavailable. The word `fallback` in this path means local conservative planning within the same already-selected provider-visible run, not cross-runtime routing. | Keep registered as `run.trigger`; when Agent API becomes selectable, reconcile this path under the Agent API adapter contract. |
| Product `/goal` | `RightPanel` parses slash commands and writes task goal state/timeline through Taskplane handlers before chat or CLI forwarding. | Product harness, no selected runtime call. | Correct. Goal state belongs to Taskplane and should remain runtime-independent. | Keep native CLI goal forwarding as optional audit-only compatibility until adapter evidence exists. |
| Runtime-native goal request | `/codex goal`, `/claude goal`, and `/runtime goal` record audit evidence without forwarding. | Runtime audit, no selected runtime call. | Correct for first version. It borrows native goal ideas without giving native sessions source-of-truth authority. | Revisit only after disposable command-shape, progress, cancellation, permission, and memory-boundary probes pass. |
| Task capture and type review | RightPanel task capture uses `inferTaskTypeProfile` before `task:create`, so project-like titles such as "开发小程序" are created as project work. The separate "判断任务类型" action builds a structured local proposal through `buildLocalTaskTypeReviewInvocation` and writes `taskType/taskFacets` only after user confirmation. | Local rule invocation contract; future selected-runtime candidate. | Aligned for first version. It fixes the visible classification issue without pretending a different runtime made the judgment, and keeps AI二次校验 as a future selected-runtime enhancement rather than a hidden API call. | Add selected CLI/API adapters later while preserving the same proposal and confirmation boundary. |
| Project decomposition draft | `TasksPage.generateProjectDecomposition` calls `window.api.decomposeProject`; `ipcMain.handle('ai:decomposeProject')` calls `generateText` and validates drafts with `evaluateRuntimeSubtaskDraft`. | API runtime path for the currently implemented adapter. | Aligned at the harness level: it is draft-only, creates no child tasks, and now rejects selected Agent CLI modes instead of silently switching runtimes. The remaining gap is adapter neutrality for selected CLI/API invocation. | Keep the `decomposition_draft` contract; future CLI/API adapters must return the same structured draft before the product harness can confirm writes. |
| Project decomposition confirmation | `TasksPage` confirms generated children and rechecks `subtask_draft` before creating durable subtasks, criteria, dependencies, parent updates, and records. | Product harness / durable write. | Correct. Confirmation is independent of which selected AI runtime produced the draft, and `subtask_start` only applies when Taskplane actually enters or runs a child task. | Keep unchanged; use it as the write boundary for both CLI and API-generated drafts. |
| Decision draft | `DecisionService.draft` and process-template selectors use provider-backed structured generation only when API Runtime is selected, then write through Decision draft boundaries. Draft records carry optional `decision_draft` invocation provenance. | API runtime path when selected; selected CLI modes stay local product harness/skipped until adapters exist. | Better aligned. It is named as a runtime phase, avoids hidden cross-runtime API calls, and keeps Decision persistence behind `decision.create`. | Later add selected CLI/API adapters for richer decision drafting without changing the confirmation/write boundary. |
| Scheduled Brief snapshot | `SchedulerService.generateScheduledBrief` builds `HomeBriefData`, optionally asks `BriefProcessTemplateSelector` to choose relevant templates, then calls `BriefExecutor` only when API Runtime is selected. If provider execution is unavailable or a CLI runtime is selected, it writes a deterministic local brief snapshot with `fallbackReason`. | API runtime path when selected; selected CLI modes stay local product harness/fallback until adapters exist. | Better aligned. It is not task execution, but it is still an AI invocation phase, so it no longer treats API as a hidden fallback for selected CLI. | Keep provider use under the API Runtime path; later add invocation metadata to `BriefSnapshotRecord` if scheduled brief provenance needs to be shown in UI. |
| Run acceptance verification | Lightweight verifier consumes terminal evidence and Run Goal Contract; future API verifier samples are readiness-gated. | Product verifier harness, currently local deterministic. | Correct. Subagent/API verification belongs here as bounded verification assistance, not as unbounded multi-agent execution. | Future Agent API verifier can run in shadow mode behind the documented default-on threshold. |
| Task memory proposal | Agent CLI terminal evidence creates a user-confirmed Task Record proposal when verifier permits. | Product harness using run evidence. | Correct for first version. It makes output durable only through user confirmation. | Optional future selected-runtime phase can improve proposal quality, but the write boundary stays product-owned. |
| Agent tool durable writes | `AgentToolRegistry` owns task next-step updates, completion criteria, source-context creation, artifact notes, workspace reads, and confirmed local command/file-write checkpoints for the retained API-like run path. `decision.draft` is a proposal tool only; formal Decision persistence remains behind `decision.create`. Provider-native schemas expose only the matrix-approved safe/read or draft tools and never expose local writes, command execution, source-context writes, or artifact writes directly. | Product harness durable-write boundary inside an already-gated run. | Aligned. Tool execution is not a second runtime: durable writes still require task-mutation/pre-step checks, post-step verification, recovery guidance, and checkpoint/Decision confirmation where risk requires it. | Keep provider-native tool exposure matrix narrow; future Agent API adapter should reuse the same registry instead of bypassing it. |
| Code Agent model producer | `CodeAgentRunService` can retain context and call `prepareCodeAgentModelProducerRuntime` behind explicit provider-call and feature flags. | Future Agent API-like execution path, gated. | Useful compatibility evidence. It already shares context-manifest behavior with Agent CLI, but it is not yet the user-selected Agent API Runtime. | Reconcile under the future Agent API adapter rather than treating it as a helper. |

### Implementation Conclusion

The first-version Agent CLI path is compatible with the existing task runtime flow because the harness already owns goal state, context assembly, decomposition confirmation, verification, memory proposal, handoff, and clearance. The remaining mismatch is not that Agent CLI "only executes"; it is that several AI-facing harness phases still call provider-backed APIs directly instead of going through a selected AI invocation contract. The practical next step is to introduce that contract gradually, using the now-structured task type review proposal as the reference shape for future selected-runtime adapters.

Suggested implementation order:

1. Add shared phase names and request/result types for selected AI invocations, without changing behavior.
2. Add selected-runtime task type review adapters only when they can return the existing structured, user-confirmed proposal shape without cross-runtime fallback.
3. Convert project decomposition draft to the same invocation contract while keeping the existing `subtask_draft` and confirmation gates.
4. Inventory decision draft as a later selected-runtime candidate.
5. Keep verification subagent/API work in shadow mode until it beats the deterministic verifier on the documented readiness gate.

### 2026-05-21 Decomposition Invocation Update

Project decomposition draft now uses the shared `decomposition_draft` invocation wrapper in `ai:decomposeProject`. The IPC result remains backward-compatible with the existing draft shape and adds optional provenance: phase, layer, runtime label, status, and summary. Current provider-backed generation is labeled as `api_runtime` for the currently implemented adapter path; it is not a fallback when Agent CLI is selected, and the IPC handler rejects selected CLI modes before resolving API config. Confirmed child creation remains a separate product harness write behind `project.decompositionConfirm`, and future Agent CLI / Agent API adapters must feed the same draft contract before that write boundary can run.

### 2026-05-21 Decision Draft Invocation Update

Decision drafts now carry optional `decision_draft` invocation provenance. Provider-backed drafts are labeled `api_runtime` with the configured provider/model only when API Runtime is selected; selected CLI modes produce local `product_harness` / `skipped` drafts instead of resolving API config. Decision creation remains a separate user-confirmed write through `decision.create`.

### 2026-05-21 Chat Assistant Invocation Update

API Runtime chat responses now carry optional invocation provenance. Global chat is labeled `global_assistant`; task-bound API assistance is labeled `task_assistant`. Selected Agent CLI global chat remains unsupported rather than falling through to API Runtime, and `ai:chat` now rejects selected CLI modes at the IPC boundary before resolving API config.

### 2026-05-21 Verification And Memory Proposal Invocation Update

Agent CLI terminal verification and task-memory proposals now carry product-harness invocation provenance in their run step input. The verifier step is labeled `verification_assist` and remains `product_harness`; the memory guidance step is labeled `memory_proposal` and remains a user-confirmed proposal, not a write.

### 2026-05-21 Scheduled Brief Runtime Boundary Update

Scheduled Brief generation is now registered as `brief.scheduledSnapshot` in runtime entrypoint coverage. It is an API Runtime assistance path over a bounded `HomeBriefData` projection when API Runtime is selected, not an Agent CLI fallback. If API Runtime configuration or generation fails, or if Codex/Claude is the selected runtime before a Brief adapter exists, SchedulerService persists a deterministic product-harness brief snapshot with `fallbackReason`; no other AI runtime is invoked implicitly.

### 2026-05-21 Retained RunService Runtime Boundary Update

The older `run.trigger` path is now documented as a retained API Runtime / Agent API-like execution surface. It remains a provider-visible execution entrypoint with context assembly, task-memory guidance, pre-step, subtask-start, and post-step gates. Its local conservative `fallback` plan is an in-run safety behavior, not cross-runtime fallback and not a substitute for the selected Agent CLI entrypoint.

### 2026-05-21 Agent Tool Boundary Update

Agent tool durable writes are now explicitly documented as product-harness durable writes inside an already-gated run. Provider-native tool schemas stay narrower than text-prompt planning: they do not expose local command, file write, next-step update, source-context create, or artifact-create tools directly. `decision.draft` remains a draft/proposal tool; formal Decision persistence stays behind `decision.create`, and Decision approval/defer/cancel stays behind `decision.act`. Any future Agent API adapter must keep using the AgentToolRegistry boundary so task mutation, post-step verification, recovery guidance, and tool-permission checkpoints remain product-owned.

### 2026-05-21 Decision Resume Boundary Update

Decision approval is not a general execution trigger. `decision.approvedCheckpointResume` only resumes when `DecisionService.act` finds an open checkpoint linked to the approved Decision, validates the checkpoint payload, rechecks target-task readiness and pending task-memory guidance, and then resumes the specific tool, browser-controlled action, or patch-promotion flow represented by that checkpoint. Ordinary Decision approval remains a judgment-center action and cannot become arbitrary tool execution.

## Non-Goals For The Next Pass

- Do not enable workspace-write Agent CLI mode by default.
- Do not make CLI-native goal state the Taskplane source of truth.
- Do not add unbounded multi-agent execution.
- Do not let unknown slash commands silently pass through to a runtime.
- Do not treat future Agent API as a helper layer; it is a peer AI invocation runtime once completed.

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
- Whether a future user-facing continuation feature is worth adding after the first-version bounded run loop has enough real usage evidence. Until then, automatic continuation remains outside the Agent CLI alpha.

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
- 2026-05-20 local Codex CLI read-only smoke (`codex-cli 0.125.0`) passed the opt-in command `TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE=true TASKPLANE_AGENT_CLI_SMOKE_RUNTIME=codex npm run manual:agent-cli-readonly-smoke` with `auth=ready`, `workspace=unchanged`, `phrase=matched`, and `status=passed`. This validates the first-version Codex CLI acceptance path at the official CLI/account layer while keeping the default smoke non-spending and skipped unless explicitly enabled.
- 2026-05-20 local packaged-app Codex CLI live smoke (`TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:agent-cli-task-live:mac`) passed with isolated app data, a temporary workspace, task-bound Agent CLI execution through the packaged UI, `workspace=unchanged`, `phrase=matched`, and `status=passed`. This bridges the fake packaged smoke and CLI-only smoke without adding a default provider-spending gate.
- 2026-05-20 local Claude Code help probe (`2.1.144`) showed non-interactive print mode plus agent configuration flags such as `--agent` and `--agents`, but `claude goal --help` and `claude goals --help` returned the general Claude Code help shape rather than an explicit native goal subcommand. This does not contradict the documented `claude -p "/goal ..."` slash-command form; it only rules out treating `goal` as a shell subcommand. Taskplane still needs a disposable candidate probe before enabling forwarding.
- 2026-05-20 local Claude Code read-only smoke (`2.1.144`) detected CLI auth but the provider returned an account/organization error during `claude -p --permission-mode plan`; the temporary workspace stayed unchanged. Treat this as a non-blocking account-readiness gap for the secondary CLI path, not a first-version Codex acceptance blocker.
- The manual native-goal discovery script now keeps default probing to version/help surfaces only. It prints candidate slash-command argument examples for explicit opt-in runs instead of probing `goal` or `goals` as shell subcommands by default.

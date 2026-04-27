# Agent Execution Layer Roadmap

## Purpose

This roadmap turns the current alpha baseline into the next implementation
sequence for Taskplane's real agent execution layer.

The front task-management loop is now covered enough to treat Task as the
control plane:

- capture or create work
- attach context, blockers, dependencies, criteria, Decisions, Runs, and
  Artifacts
- move work through recovery and closeout
- inspect and continue work from Home, Tasks, Decisions, and Runs

The next phase should not add a generic chat or shell runner. It should build a
Taskplane-native executor that can safely do longer work while preserving Task,
Run, Decision, Artifact, and Timeline semantics.

## Current Baseline

Implemented and locally verified:

- text runs through `RunOrchestrator`
- agent runs through a `LocalAgentExecutor` boundary
- persisted run steps, checkpoints, agent sessions, and capability metadata
- read-only workspace search/read behind per-run opt-in
- packaged read-only workspace agent pass
- confirmation-gated `workspace.write_patch` at code/integration level
- patch approval resumption through Decisions
- patch guardrails for local file-write policy, workspace root containment,
  expected files, diff preview, no pre-approval mutation, and normal-run
  fallback when a model proposes patch steps
- confirmation-gated `workspace.run_command` at registry level, limited to
  `test` / `lint` scripts in `package.json` and resumed only after Decision
  approval

Still intentionally deferred:

- exposing workspace writes in prompts or task UI
- exposing workspace command execution in prompts or task UI
- browser/computer-control tools
- social/media/email posting tools
- autonomous multi-run scheduling

## Execution Layer Shape

The next runtime should have five clear layers:

1. `RunService`
   Public settlement boundary. It owns Run status, task annotations, final
   artifacts, and recovery wording.

2. `RunOrchestrator`
   Adapter from product intent into executor sessions. It assembles context,
   policy, provider capability, and writes product-level run steps.

3. `AgentExecutor`
   Runtime session boundary. It plans, loops, resumes, pauses, and reports
   typed events without directly mutating Taskplane domain state.

4. `AgentToolRegistry`
   Only allowed path from agent execution into Taskplane or the local
   workspace. Every mutating tool must go through policy, checkpoints, and
   domain services.

5. Provider adapters
   Normalize text-only planning, structured tool calls, streaming, and provider
   limits into explicit runtime capabilities.

## Next Implementation Slices

### Slice 0: Agent Runtime v2 Boundary

Status: accepted as the next design boundary.

Decision doc:
[AGENT_EXECUTION_LAYER_V2_DECISION.md](AGENT_EXECUTION_LAYER_V2_DECISION.md).

Reference architecture assessment:
[AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md](AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md).

Multica focused reference:
[AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md](AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md).

Task breakdown:
[AGENT_EXECUTION_TASK_BREAKDOWN.md](AGENT_EXECUTION_TASK_BREAKDOWN.md).

Sandbox decision:
[AGENT_EXECUTION_SANDBOX_DECISION.md](AGENT_EXECUTION_SANDBOX_DECISION.md).

Future execution design:
[AGENT_EXECUTION_FUTURE_DESIGN.md](AGENT_EXECUTION_FUTURE_DESIGN.md).

Tool scaffold plan:
[AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md](AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md).

Orchestration plan:
[AGENT_EXECUTION_ORCHESTRATION_PLAN.md](AGENT_EXECUTION_ORCHESTRATION_PLAN.md).

Orchestration UI design:
[AGENT_EXECUTION_ORCHESTRATION_UI_DESIGN.md](AGENT_EXECUTION_ORCHESTRATION_UI_DESIGN.md).

Goal: make the local agent runtime more durable before making it more
powerful. The current implementation now has a typed runtime event spine,
checkpoint-validated restart/replay review, and explicit tool exposure matrix while
keeping workspace write/command, browser/computer control, external posting,
and autonomous scheduling deferred.

Acceptance:

- current text-only and provider-native paths still settle the same way
- run steps can be written from typed runtime events
- checkpoint events map to persisted checkpoints and pending Decisions
- paused/confirmation sessions are resumable only when an open checkpoint is
  loaded and validated; otherwise replay review stays inspect-only
- runtime readiness has a named domain concept before the code-agent UI
  expands beyond the sandboxed producer lane
- external frameworks remain references rather than runtime dependencies until
  Taskplane has a separate sandbox or workflow-authoring decision
- the task sequence in
  [AGENT_EXECUTION_TASK_BREAKDOWN.md](AGENT_EXECUTION_TASK_BREAKDOWN.md) stays
  aligned as Slice 0 is implemented
- provider-native workspace write/command proposals still fall back without side
  effects
- `npm run accept:agent-local` and `npm run verify` pass

### Orchestration Layer

Status: drafted as the next implementation plan after evidence UX polish.

Decision doc:
[AGENT_EXECUTION_ORCHESTRATION_PLAN.md](AGENT_EXECUTION_ORCHESTRATION_PLAN.md).

UI design:
[AGENT_EXECUTION_ORCHESTRATION_UI_DESIGN.md](AGENT_EXECUTION_ORCHESTRATION_UI_DESIGN.md).

Goal: introduce runtime/profile/request/lifecycle objects before Taskplane adds
queue/claim behavior, automatic starts, or broader connector lanes.

Acceptance:

- `ExecutionRuntime` starts as a read-only snapshot over existing sandbox and
  connector readiness
- `AgentProfile` starts with the current manual Code Agent profile and does not
  grant tool authority
- `OrchestrationRequest` can wrap existing manual Code Agent and operator
  browser evidence starts without behavior change
- `AgentRunLifecycle` vocabulary explains operator-started, queued, claimed,
  running, paused, completed, failed, and cancelled attempts
- skill-informed automation readiness is diagnostic-only until a separate
  policy decision accepts automatic start
- hidden browser, MCP, computer-use, skills, and creator connectors stay hidden
  from model-visible channels
- Tasks, Runs, and Settings use shared read-only orchestration presentation
  helpers before any queue worker or automatic-start UI is introduced

### Automatic Start Boundary

Do not treat "automatic" and "unsafe" as the same thing.

Taskplane should allow automatic start only when the execution path is already
clear enough to be policy-evaluated before launch:

- a mature skill or process template matches the task
- required inputs are present
- allowed tool families are known
- risk level is within user/workspace policy
- prior similar runs have been accepted or the user explicitly enabled this
  workflow
- the runtime is ready and its sandbox/credential/network posture is visible

When those conditions are absent, the system should fall back to proposal,
checkpoint, or Decision review before work starts.

### Slice 1: Approval UX Readiness

Status: completed for the existing Runs and Decisions checkpoint review
surfaces.

Goal: make the existing `workspace.write_patch` checkpoint understandable before
any user-facing write opt-in exists.

- keep the tool absent from model prompts and task run UI
- keep local write disabled in normal runs
- use `npm run accept:agent-local` as the repeatable non-live agent acceptance
  gate; its workspace-patch slice starts from a real pending Decision and
  approves the checkpoint
- confirm Runs and Decisions explain the affected files, preview, risk, and
  consequence
- use `npm test -- src/renderer/App.test.tsx` as the renderer checkpoint review
  coverage for visible patch and command checkpoint summaries
- keep the alpha checklist aligned with the exact repeatable commands

Acceptance:

- no local file changes before approval
- approved Decision resumes and resolves the checkpoint
- deferred or cancelled Decision settles the run clearly
- UI never implies command execution is available
- Runs detail separates patch summary, expected files, and patch-body preview
- Runs detail separates command script, args, timeout, cwd, and preview
- Decisions detail repeats write/command consequences and the current `test` /
  `lint` command allowlist constraint before approval

### Slice 2: Provider Capability Truthfulness

Status: first UI/session truthfulness slice completed.

Goal: stop treating every model provider as equally agent-capable.

Completed:

- Tasks and Runs agent forms preview provider/session capability before
  triggering a run.
- The preview names text-only planning, per-run read-only workspace context,
  task update/evidence tool opt-in state, structured tool-call deferral in the
  local executor, Replicate native text-path limitations, and patch/command
  unavailability.
- Provider preview coverage now asserts Anthropic, OpenAI, OpenAI-compatible,
  fal/OpenRouter, and Replicate wording stays truthful.
- Agent sessions keep `textOnlyPlanning`, `structuredToolCalls`, `fileContext`,
  `taskMutationTools`, `streaming`, and `longRunningSessions` as explicit
  metadata.
- Shared provider capability descriptors and provider tool-call normalization
  types define the adapter entry shape while failing closed for raw or malformed
  provider payloads.
- An offline OpenAI-compatible chat-completion-style fixture adapter can
  translate `tool_calls` into normalized Taskplane proposals and now feeds the
  gated provider-native session path after payload extraction. It fails closed
  for malformed tool-call envelopes, non-`function` calls, missing `function`
  objects, and non-object JSON arguments.
- An offline Anthropic Messages-style fixture adapter can translate `tool_use`
  content blocks into normalized Taskplane proposals and is available through
  the same gated provider-native dispatcher. It fails closed for malformed
  content blocks, unsupported block types, missing ids/names, and non-object
  inputs.
- A shared offline provider-native dispatcher selects the Anthropic or
  OpenAI-compatible fixture adapter by provider and fails closed for Replicate;
  execution still requires the reserved flag, provider payload extraction,
  successful normalization, and the session gate.
- `featureFlags.enableProviderNativeToolCalls` now exists as a default-off
  rollout flag for the gated provider-native session path; fallback sessions
  still persist `structuredToolCalls=false`.
- A shared shadow observer can summarize provider-native normalization outcomes
  without returning executable proposals; explicit provider-native sessions use
  a separate session-gated path after normalization succeeds.

Acceptance:

- default local runs show honest capability copy
- read-only workspace opt-in updates `fileContext=true`
- task update tool opt-in updates `taskMutationTools=true`
- provider limitations do not silently enable tool plans
- pre-run copy distinguishes provider text paths from persisted session
  capabilities
- raw provider tool-call payloads do not become executable steps without a
  dedicated adapter translation
- mixed valid and invalid provider tool-call payloads fail as a whole instead
  of executing the valid subset
- OpenAI-compatible fixture translation validates JSON function arguments before
  producing normalized proposals
- Anthropic fixture translation validates `tool_use.input` objects before
  producing normalized proposals
- provider-native dispatch keeps Replicate on the unsupported structured
  tool-call path
- enabling the reserved feature flag alone does not change session capability
  metadata
- shadow observation exposes `skipped`, `observed`, or `failed` summaries only;
  it does not feed `AgentRunLoop`

Still deferred:

- exposing provider-native workspace mutation or command tools in prompts
- provider-specific long-running session adapters
- broader provider/model matrices beyond the tested safe-read path

Before expanding provider-native tool calls beyond the current gated safe-read
slice, use [STRUCTURED_TOOL_CALLS_DECISION.md](STRUCTURED_TOOL_CALLS_DECISION.md)
and follow
[PROVIDER_NATIVE_TOOL_CALL_ROLLOUT_PLAN.md](PROVIDER_NATIVE_TOOL_CALL_ROLLOUT_PLAN.md).

### Slice 3: Domain-Shaped Task Tools

Status: first opt-in exposure implemented, including read-only completion
evidence review.

Goal: let the agent help advance Taskplane tasks without touching the local
workspace.

Completed tools:

- `task.update_next_step` (implemented as a registry-level service-routed tool;
  prompt-exposed only through the explicit task-tool opt-in)
- `task.create_completion_criterion` (implemented as a registry-level
  service-routed tool; prompt-exposed only through the explicit task-tool
  opt-in)
- `task.review_completion_evidence` (implemented as a registry-level safe-read
  tool; prompt-exposed only through the explicit task-tool opt-in, and does not
  satisfy criteria or complete tasks)
- `source_context.create` (implemented as a registry-level service-routed tool;
  prompt-exposed only through the explicit task-tool opt-in)
- `decision.draft` (implemented as a registry-level draft-only tool; it does
  not create a formal Decision and is prompt-exposed only through the explicit
  task-tool opt-in)

Repeatable local acceptance:

- `npm run accept:agent-local` for the combined non-live agent gate
- `npm run accept:domain-agent-tools` when only this slice needs a focused
  rerun

Rules:

- one tool per slice
- service-level route only, no direct repository mutation from the registry
- run-step observation for every call/result
- confirmation required when the action changes task direction materially

Acceptance:

- the task timeline explains the change
- Home recovery reflects the change
- failed tool calls leave retryable run output
- completion evidence review leaves criteria and task state unchanged

### Slice 4: Command Allowlist Decision

Status: first registry-level implementation completed.

Goal: design and implement the smallest confirmed local `workspace.run_command`
runner.

Decision doc: [WORKSPACE_COMMAND_ALLOWLIST_DECISION.md](WORKSPACE_COMMAND_ALLOWLIST_DECISION.md).

The decision must specify:

- allowed command families
- cwd and workspace-root containment
- environment variable policy
- timeout and output truncation
- no network by default unless explicitly allowed
- no destructive commands in the first slice
- checkpoint requirements

Acceptance:

- a decision doc exists and is accepted
- command execution uses only `test` / `lint` scripts in `package.json`
- command execution requires explicit local command policy and checkpoint
  approval
- normal model-produced command steps still fall back until a later UI/policy
  opt-in slice exposes them

### Slice 5: Tool Scaffold Contracts

Status: completed as a hidden scaffold and diagnostic baseline.

Goal: reserve the common interfaces for MCP, browser/Playwright, skills,
workspace coding tools, computer-use, and creator connectors before any one
lane hard-codes its own path.

Plan doc: [AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md](AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md).

Implementation sequence:

1. Define shared tool descriptors with family, risk tier, schema, artifact
   behavior, credential requirements, and sandbox/connector requirements.
   Status: implemented in `src/shared/agent-tool-scaffold.ts`.
2. Define exposure policy separately from runtime execution policy.
   Status: implemented with shared exposure delegation and execution-policy
   validation.
3. Define tool-session metadata for sandbox, browser, MCP, and connector
   sessions.
   Status: reserved in shared metadata contracts.
4. Define common artifact and checkpoint metadata for patches, screenshots,
   traces, command logs, generated drafts, and connector previews.
   Status: reserved in shared metadata contracts.
5. Keep all new descriptors hidden until a lane-specific decision exposes
   them.
   Status: covered by scaffold tests and Settings diagnostics; reserved lanes
   remain hidden.

Acceptance:

- MCP/browser/skills/coding/creator/computer-use can be represented without
  being exposed
- discovery does not imply trust
- prompt/provider exposure does not imply runtime permission
- credential access is explicit and absent by default
- mutating actions still route through artifacts and Decisions

### Slice 6: Sandboxed Coding Agent Lane

Status: active behind non-live and backend-readiness gates.

Goal: support the original AI programming scenario without turning Taskplane
into an unbounded host shell. This is the Taskplane-owned path for
Pi-coding-agent-like work.

Design docs:

- [AGENT_EXECUTION_SANDBOX_DECISION.md](AGENT_EXECUTION_SANDBOX_DECISION.md)
- [AGENT_EXECUTION_FUTURE_DESIGN.md](AGENT_EXECUTION_FUTURE_DESIGN.md)
- [AGENT_EXECUTION_TASK_BREAKDOWN.md](AGENT_EXECUTION_TASK_BREAKDOWN.md)
- [AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md](AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md)
- [AGENT_EXECUTION_PATCH_DRAFT_SOURCE_DECISION.md](AGENT_EXECUTION_PATCH_DRAFT_SOURCE_DECISION.md)
- [AGENT_EXECUTION_SANDBOXED_CODING_PRODUCER_DESIGN.md](AGENT_EXECUTION_SANDBOXED_CODING_PRODUCER_DESIGN.md)
- [AGENT_EXECUTION_PATCH_PROMOTION_APPLY_DECISION.md](AGENT_EXECUTION_PATCH_PROMOTION_APPLY_DECISION.md)

Implementation sequence:

1. Define disabled-by-default `SandboxProvider` interfaces and capability
   metadata, without exposing any new model-visible tools. Initial shared
   contracts now exist in `src/shared/agent-sandbox-provider.ts`; the default
   provider remains disabled.
2. Add a temp-workspace sandbox smoke path that uses no credentials and cannot
   mutate the user's workspace. `TempWorkspaceSandboxProvider` now prepares
   and disposes an isolated staging root without command execution or source
   workspace mutation.
3. Add a staged patch artifact format for file changes, logs, and risk
   summaries. Shared patch artifact helpers now normalize changed files,
   command logs, risk summary, diff preview, and generic artifact descriptors
   without promoting changes.
4. Route targeted checks through the existing command-policy shape, beginning
   with `test` / `lint` style scripts only. Shared check-plan helpers now
   filter requested scripts to the allowlist and summarize check results
   without executing commands.
5. Add Decision review and promotion semantics before any staged patch can
   touch the user's workspace. Shared promotion-checkpoint helpers now build a
   `patch_promotion` checkpoint descriptor with reason, consequence, preview,
   resume target, and policy snapshot without applying the patch. The run
   checkpoint payload and `AgentCheckpointRecorder` now also recognize
   Decision-linked `patch_promotion` checkpoints, still without applying or
   promoting staged files.
   `AGENT_EXECUTION_PATCH_PROMOTION_APPLY_DECISION.md` now defines the gates
   required before this can safely advance from review-only confirmation to
   actual workspace file application.
6. Only after the above is accepted, expose a narrow coding-agent run option in
   the UI and prompt/provider exposure matrix. A shared eligibility gate now
   combines the default-off feature flag, sandbox provider capabilities,
   workspace root, command policy, and execution policy into explicit blocked
   reasons before any entrypoint can become eligible.

Current guardrail state:

- the temp-workspace provider is a smoke/staging-root provider only
- coding-session preparation is gated and returns `blocked` before creating a
  staging root when eligibility fails
- session manifests and summaries exist for audit/run-step copy
- the temp provider remains intentionally ineligible because it does not yet
  support targeted command execution or patch artifact production
- the internal patch draft source boundary exists and is validated before
  review planning: ordinary local-note runs, provider-native payloads,
  host-process tools, unsafe file paths, credential passthrough, non-Decision
  promotion, and non-allowlisted checks are blocked before a ready plan can be
  created
- validated source identity is now carried through preview planning, request
  audit, idempotency keys, session manifest summaries, and persisted patch
  artifact review metadata

Accepted backend connection state:

The first real sandbox provider backend is now connected for the manual
producer path. The local-container backend supports targeted `test` / `lint`
checks against an internal merged work tree, keeps the selected workspace and
staging root read-only from the container, emits patch artifacts inside the
sandbox boundary, and still routes workspace promotion through the validated
source and Decision-linked `patch_promotion` path.

Next implementation target:

[CODE_AGENT_MODEL_CONTEXT_DECISION.md](CODE_AGENT_MODEL_CONTEXT_DECISION.md)
now defines the next non-file context boundary before retrieval snippets,
Skills/MCP observations, browser evidence, or Taskplane source/artifact content
can enter provider prompts. The key product question is not whether the data is
locally available, but whether the user has explicitly selected it for
provider-visible model context.

Backend review gate:
[AGENT_EXECUTION_SANDBOX_BACKEND_REVIEW.md](AGENT_EXECUTION_SANDBOX_BACKEND_REVIEW.md).

Invocation gate:
[AGENT_EXECUTION_SANDBOX_PRODUCER_INVOCATION_DECISION.md](AGENT_EXECUTION_SANDBOX_PRODUCER_INVOCATION_DECISION.md).

Future product-surface proposal:
[CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md](CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md).

Future UI task breakdown:
[CODE_AGENT_MODE_UI_TASK_BREAKDOWN.md](CODE_AGENT_MODE_UI_TASK_BREAKDOWN.md).

Backend candidate readiness is now represented in code by
`AgentSandboxBackendProfile` and `evaluateAgentSandboxBackendReadiness`. A
candidate must be a container or remote VM style backend, must not inherit the
host environment, must not pass through credentials, must support one selected
workspace mount, staged writes, structured targeted commands, output limits,
and patch artifacts. Host-process candidates fail readiness by design.
Backend probes are represented separately from profiles: an unavailable probe
records why no backend can be used, and only an available probe can become a
backend profile for readiness evaluation.

Acceptance:

- no host-process arbitrary shell
- no inherited provider keys, relay keys, keychain secrets, or user session
  tokens in the sandbox
- no file promotion without a Decision
- every edit/check produces RunSteps and artifacts
- failed or paused work can be recovered from Task/Run/Decision surfaces
- provider-native unsafe write/command proposals still fail closed unless the
  sandbox lane explicitly exposes them

Out of scope for this slice:

- browser/computer control
- GitHub mutation
- external posting/email/calendar/social publishing
- autonomous scheduled coding work
- Pi runtime embedding or Pi extension compatibility

## Near-Term Recommendation

Keep `workspace.run_command` and `workspace.write_patch` registry-only in the
current host workspace. Slice 5 tool scaffold contracts and Slice 6 guardrails
now exist for a disabled-by-default sandboxed coding-agent lane. The local
container producer backend can now be manually invoked through explicit
operator-confirmed paths, but UI/prompt exposure still requires a separate
code-agent mode product-surface decision. For workspace tools inside the current host workspace, still use
[WORKSPACE_TOOL_UI_OPT_IN_DECISION.md](WORKSPACE_TOOL_UI_OPT_IN_DECISION.md)
before any prompt-level exposure.

Before adding any stronger closeout mutation, use
[COMPLETION_EVIDENCE_TOOL_DECISION.md](COMPLETION_EVIDENCE_TOOL_DECISION.md):
the accepted closeout-adjacent agent slice reviews evidence only, without
satisfying criteria or completing tasks automatically.

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
  allowlisted `package.json` scripts and resumed only after Decision approval

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

### Slice 1: Approval UX Readiness

Status: completed for the existing Runs and Decisions checkpoint review
surfaces.

Goal: make the existing `workspace.write_patch` checkpoint understandable before
any user-facing write opt-in exists.

- keep the tool absent from model prompts and task run UI
- keep local write disabled in normal runs
- use `npm run accept:workspace-patch` as the repeatable local approval exercise
  that starts from a real pending Decision and approves the checkpoint
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
- Decisions detail repeats write/command consequences and the command allowlist
  constraint before approval

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
  types now define the future adapter entry shape while failing closed for raw
  or malformed provider payloads.
- An offline OpenAI-compatible chat-completion-style fixture adapter can
  translate `tool_calls` into normalized Taskplane proposals, but it is not
  connected to provider execution or run sessions.
- An offline Anthropic Messages-style fixture adapter can translate `tool_use`
  content blocks into normalized Taskplane proposals, but it is not connected
  to provider execution or run sessions.
- A shared offline provider-native dispatcher selects the Anthropic or
  OpenAI-compatible fixture adapter by provider and fails closed for Replicate;
  it is not connected to provider execution or run sessions.
- `featureFlags.enableProviderNativeToolCalls` now exists as a default-off
  rollout flag, but current runs ignore it for execution and still persist
  `structuredToolCalls=false`.

Acceptance:

- default local runs show honest capability copy
- read-only workspace opt-in updates `fileContext=true`
- task update tool opt-in updates `taskMutationTools=true`
- provider limitations do not silently enable tool plans
- pre-run copy distinguishes provider text paths from persisted session
  capabilities
- raw provider tool-call payloads do not become executable steps without a
  dedicated adapter translation
- OpenAI-compatible fixture translation validates JSON function arguments before
  producing normalized proposals
- Anthropic fixture translation validates `tool_use.input` objects before
  producing normalized proposals
- provider-native dispatch keeps Replicate on the unsupported structured
  tool-call path
- enabling the reserved feature flag alone does not change session capability
  metadata

Deferred:

- enabling true structured tool calls for providers or relays that can support
  them
- provider-specific long-running session adapters

Before enabling provider-native tool calls, use
[STRUCTURED_TOOL_CALLS_DECISION.md](STRUCTURED_TOOL_CALLS_DECISION.md). The
current accepted behavior remains text-only JSON planning with
`structuredToolCalls=false` in persisted sessions. Follow
[PROVIDER_NATIVE_TOOL_CALL_ROLLOUT_PLAN.md](PROVIDER_NATIVE_TOOL_CALL_ROLLOUT_PLAN.md)
for any future staged wiring.

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

- `npm run accept:domain-agent-tools`

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
- command execution uses only allowlisted `package.json` scripts
- command execution requires explicit local command policy and checkpoint
  approval
- normal model-produced command steps still fall back until a later UI/policy
  opt-in slice exposes them

## Near-Term Recommendation

Keep `workspace.run_command` and `workspace.write_patch` registry-only. The
domain-shaped task tools are now exposed behind an explicit per-run opt-in, so
the next execution-layer work should deepen provider capability handling through
[STRUCTURED_TOOL_CALLS_DECISION.md](STRUCTURED_TOOL_CALLS_DECISION.md) or
continue workspace checkpoint review without prompt-level workspace mutation
exposure. For workspace tools, use
[WORKSPACE_TOOL_UI_OPT_IN_DECISION.md](WORKSPACE_TOOL_UI_OPT_IN_DECISION.md)
before any prompt-level exposure.

Before adding any stronger closeout mutation, use
[COMPLETION_EVIDENCE_TOOL_DECISION.md](COMPLETION_EVIDENCE_TOOL_DECISION.md):
the accepted closeout-adjacent agent slice reviews evidence only, without
satisfying criteria or completing tasks automatically.

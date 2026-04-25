# Provider-Native Tool Call Rollout Plan

## Status

In progress. The first explicit provider-native agent-session path is wired
behind `evaluateProviderNativeSessionGate`; normal runs still use text-only
planning unless every gate passes.

This plan defines the safe sequence for using the reserved
`featureFlags.enableProviderNativeToolCalls` flag. The first wired path still
requires a provider response-body payload and successful adapter normalization
before any session can persist `structuredToolCalls=true`.

## Goal

Let Taskplane eventually accept provider-native tool-call responses without
bypassing the existing local executor safety model.

The desired future path is:

```text
provider response
  -> provider-native dispatcher
  -> provider-specific adapter
  -> provider tool-call normalizer
  -> AgentStepProposal
  -> AgentRunLoop policy gates
  -> AgentToolRegistry
  -> run steps / checkpoints / Decisions
```

## Rollout Slices

### Slice 0: Offline Adapter Fixtures

Status: completed.

- shared agent tool-name guard
- provider tool-call normalizer
- OpenAI-compatible fixture adapter
- Anthropic fixture adapter
- provider-native dispatcher
- Replicate fail-closed behavior
- reserved default-off feature flag

Acceptance:

- fixture adapters normalize only tested shapes
- malformed inputs fail closed
- mixed known and unknown provider tool-call steps fail closed instead of
  partially executing known steps
- raw provider payloads do not become executable steps without translation
- the feature flag alone does not change session metadata

### Slice 1: Shadow Normalization

Status: diagnostic-only RunOrchestrator wiring completed.

When the flag is true, the provider response may be copied into the dispatcher
only for a non-executing shadow pass. The shadow result may be written as a
diagnostic run step or session metadata, but it must not replace text-only
planning and must not feed `AgentRunLoop`.

Rules:

- no tool execution
- no `structuredToolCalls=true`
- no change to final output
- no prompt exposure changes
- no workspace write/command exposure

Acceptance:

- tests prove shadow normalization success/failure is observable
- tests prove execution still uses text-only planning
- failed shadow normalization does not fail the run
- session metadata remains truthful: `structuredToolCalls=false`
- observing provider-native tool calls in a shadow step does not change the
  local agent session executor or capability metadata

Implementation boundary:

- `observeProviderNativeToolCalls` summarizes `skipped`, `observed`, or `failed`
  shadow outcomes without returning executable `AgentStepProposal` objects
- this shadow observer remains diagnostic-only; explicit provider-native
  execution uses the later session-gated path instead of the shadow result
- `generateRuntimeTextResult` can now return trimmed text plus an optional
  minimal provider response-body payload for OpenAI-compatible `tool_calls` or
  Anthropic `content`, while the legacy `generateRuntimeText` helper still
  returns text only
- RunOrchestrator does not infer native tool calls from text output; when the
  reserved flag is enabled and a provider payload exists, it passes
  `providerPayload.payload` into the shadow observer and writes only a
  diagnostic run step
- observed or failed shadow normalization never feeds `AgentRunLoop`, changes
  final output, or changes persisted `structuredToolCalls=false` session
  capability metadata

### Slice 2: Parser Parity Harness

Status: policy-parity tests completed; explicit real-run wiring now exists
through the later provider-native session gate.

Before any execution wiring, compare native normalized proposals with current
text JSON proposals through the same plan-building code.

Rules:

- native proposals can be passed into plan-building tests
- run-loop policy behavior must match text JSON proposals
- denied tools must remain denied
- confirmation-required tools must still checkpoint

Acceptance:

- policy-gated read-only workspace calls require `allowLocalWorkspaceRead=true`
- task/evidence calls require `allowTaskMutationTools=true`
- workspace patch and command still require explicit policy plus confirmation
  and remain out of normal plans until workspace-tool exposure is separately
  accepted
- unknown provider tools become validation/fallback output, not execution

Implementation boundary:

- provider-native normalized proposals can be passed into `AgentRunLoop`
  plan-building tests
- production runs feed provider-native proposals into `AgentRunLoop` only
  through the explicit provider-native session gate from Slice 3

### Slice 3: Explicit Provider-Native Session

Status: first explicit RunOrchestrator wiring completed behind the provider-native
session gate, with a guarded live fal OpenRouter safe-read tool-call probe now
passing locally.

Only after shadow and parity coverage pass, allow a dedicated internal executor
path to use native normalized proposals for one run session.

Acceptance gate: [PROVIDER_NATIVE_SESSION_ACCEPTANCE.md](PROVIDER_NATIVE_SESSION_ACCEPTANCE.md).

Rules:

- must require `featureFlags.enableProviderNativeToolCalls=true`
- must record `structuredToolCalls=true` only for sessions that actually execute
  the native-normalized path
- must write provider, model, adapter, raw summary, provider call ids, and stop
  reason into run steps or session metadata
- must keep task/evidence, workspace read, workspace write, and command policy
  gates unchanged

Current boundary:

- `LocalAgentExecutor.executeProviderNativeSession` can delegate a normalized
  `ProviderToolCallPlan.proposal` through the existing `AgentRunLoop`
- shared agent-session metadata helpers define the current local executor
  metadata and provider-native metadata shape with provider, model,
  adapter, raw summary, provider call ids, and stop reason
- `evaluateProviderNativeSessionGate` defines the explicit runtime-selection
  gates used by RunOrchestrator before executing provider-native sessions
- RunOrchestrator selects this path only when the run is `agent`, the reserved
  flag is enabled, a supported provider payload exists, and normalization
  succeeds
- provider-native tool names now have Taskplane-owned provider-safe aliases
  such as `taskplane__workspace__search`, and the normalizer maps those aliases
  back into internal `AgentToolName` values before `AgentRunLoop`
- a pure schema builder can derive the first provider-side tool schema list from
  `AgentToolRegistry` definitions and the current run policy; it exposes only
  safe-read tools, includes workspace read tools only when
  `allowLocalWorkspaceRead=true`, and never exposes write or command tools
- when the reserved flag is enabled for an agent run, text generation passes
  those safe-read schemas to AI SDK `generateText` as provider-side tools
  without local `execute` handlers; local execution still only happens after
  response-body extraction, adapter normalization, the provider-native session
  gate, and `AgentRunLoop` policy checks
- provider-native extraction accepts either minimal raw provider response-body
  shapes or AI SDK standard `toolCalls`, then normalizes both through the same
  provider-tool-call plan boundary
- provider-native agent sessions can proceed when the provider response contains
  normalized tool calls but no assistant text; in that case the final run output
  is taken from the completed tool observation instead of the empty model text
- fal/OpenAI-compatible relay model creation uses the AI SDK chat-completions
  path so provider-native tool-call extraction sees chat-style tool calls rather
  than OpenAI Responses payloads
- normal runs, failed normalization, unsupported providers, and missing payloads
  remain text-only plus optional shadow diagnostics
- provider-side tool exposure remains limited to the schema builder's safe-read
  allowlist; workspace mutation, command, and task-write exposure remain
  deferred

Acceptance:

- completed, failed, paused, and confirmation-needed outcomes settle through
  `RunService` exactly like current local runs
- Runs detail clearly distinguishes text-only planning from provider-native
  structured tool calling
- workspace mutation tools remain unavailable in normal prompts unless the
  workspace-tool exposure decision is separately accepted

## Non-Goals

- no arbitrary shell
- no autonomous background scheduling
- no provider-side tool execution outside `AgentToolRegistry`
- no browser/computer-control tools
- no external posting, email, or social tools

## Stop Conditions

Pause rollout if any slice shows:

- provider payloads executing without `AgentRunLoop` policy checks
- session metadata claiming `structuredToolCalls=true` without the native path
- workspace patch or command tools appearing in normal prompts
- failed adapter parsing causing a successful text-only run to fail
- provider-specific raw payloads being persisted without a concise redacted
  summary

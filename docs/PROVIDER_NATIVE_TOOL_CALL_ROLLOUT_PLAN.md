# Provider-Native Tool Call Rollout Plan

## Status

Proposed. Do not wire provider-native structured tool calls into real agent
runs yet.

This plan defines the safe sequence for using the reserved
`featureFlags.enableProviderNativeToolCalls` flag later. The flag exists in
config/env, but current runs still use text-only JSON planning and persist
`structuredToolCalls=false`.

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
- raw provider payloads do not become executable steps without translation
- the feature flag alone does not change session metadata

### Slice 1: Shadow Normalization

Status: shared helper completed; not wired into real runs.

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

Implementation boundary:

- `observeProviderNativeToolCalls` summarizes `skipped`, `observed`, or `failed`
  shadow outcomes without returning executable `AgentStepProposal` objects
- future RunOrchestrator wiring must keep this diagnostic-only until parser
  parity coverage is complete

### Slice 2: Parser Parity Harness

Status: first policy-parity tests completed; not wired into real runs.

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
- production runs still do not feed provider-native proposals into
  `AgentRunLoop`

### Slice 3: Explicit Provider-Native Session

Only after shadow and parity coverage pass, allow a dedicated internal executor
path to use native normalized proposals for one run session.

Rules:

- must require `featureFlags.enableProviderNativeToolCalls=true`
- must record `structuredToolCalls=true` only for sessions that actually execute
  the native-normalized path
- must write provider, model, adapter, raw summary, provider call ids, and stop
  reason into run steps or session metadata
- must keep task/evidence, workspace read, workspace write, and command policy
  gates unchanged

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

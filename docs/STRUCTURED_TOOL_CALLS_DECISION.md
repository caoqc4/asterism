# Structured Tool Calls Decision

## Status

Proposed. Do not enable provider-native structured tool calls in normal agent
runs until this decision is accepted and locally validated.

## Decision

Keep the current Taskplane agent runtime on text-only JSON planning for now.

Provider-native structured tool calls should become available only after a
dedicated provider adapter boundary can normalize each provider or relay into
the existing Taskplane execution contract:

```text
Provider tool-call response
  -> Provider adapter normalization
  -> AgentStepProposal
  -> AgentRunLoop policy checks
  -> AgentToolRegistry execution
  -> Run steps / checkpoints / Decisions
```

Until that adapter exists, all persisted agent sessions must continue to record
`structuredToolCalls=false`, even when the selected provider can technically
support tool calls outside Taskplane.

## Why

Taskplane's safety model lives in the local executor, not in any one model
provider. A provider-native tool call is only safe when it is translated into
the same typed tool proposal path that already enforces:

- per-run policy flags
- read-only observation before local writes
- registry-only tool execution
- confirmation checkpoints
- Decision-backed approval and settlement
- run-step visibility

Enabling native tool calls directly at the provider layer would make the UI
claim stronger execution capability than the product can currently guarantee.
It would also risk bypassing the conservative fallback behavior that keeps
workspace writes and commands unavailable in normal prompts.

## Current Runtime Truth

Current agent runs use:

- text-only planning in the local executor
- constrained JSON proposal parsing
- local fallback behavior when a model proposes unavailable tools
- explicit per-run opt-ins for read-only workspace context and task/evidence
  tools
- registry-only workspace patch and command tools
- `structuredToolCalls=false` in persisted session capability metadata

The pre-run capability preview may say a provider path is deferred or limited,
but persisted session metadata must describe what Taskplane actually used for
that run.

## Adapter Requirements

Before any provider-native structured tool-call path is enabled, the adapter
must provide a small normalized contract:

```ts
type ProviderToolCallPlan = {
  source: 'provider_tool_call';
  provider: string;
  model: string;
  steps: AgentStepProposal[];
  rawSummary: string;
};
```

The adapter must normalize at least:

- tool name
- parsed JSON input
- provider call id, if present
- final-answer text, if present
- partial or malformed tool-call errors
- stop reason or continuation signal

Provider-specific raw payloads may be kept for debugging, but the run loop
should execute only normalized `AgentStepProposal` objects through
`AgentToolRegistry`.

## Policy Gates

Structured tool calls must not grant new permissions by themselves. The run
loop must continue to deny or checkpoint tools according to the existing policy
shape:

```ts
type AgentPolicy = {
  allowLocalWorkspaceRead: boolean;
  allowTaskMutationTools: boolean;
  allowLocalFileWrite: boolean;
  allowLocalCommandRun: boolean;
  confirmationRequiredRisks: AgentToolRisk[];
};
```

Rules:

- read-only workspace calls require `allowLocalWorkspaceRead=true`
- task/evidence tools require `allowTaskMutationTools=true`
- workspace patch calls require `allowLocalFileWrite=true` and confirmation
- workspace command calls require `allowLocalCommandRun=true`, package-script
  allowlist validation, and confirmation
- sensitive or external-write tools must become Decisions or confirmation
  checkpoints before execution
- unavailable or policy-denied tool calls must settle as readable fallback,
  validation failure, checkpoint, or retryable failure; they must not execute
  directly

## Provider Notes

- Anthropic: may map tool-use blocks into normalized proposals when an adapter
  exists.
- OpenAI: may map tool calls or response tool items into normalized proposals
  when an adapter exists.
- OpenAI-compatible relays: must be treated as capability-unknown until the
  relay's exact request/response shape is covered by tests.
- fal/OpenRouter-style relays: can be supported through the same
  OpenAI-compatible adapter only when their tool-call behavior is verified for
  the configured model path.
- Replicate: remains text-only unless the specific model or relay path exposes
  a tested structured tool-call response shape. Native Replicate text
  prediction must keep `structuredToolCalls=false`.

## UI And Metadata Requirements

- Pre-run copy may distinguish provider potential from Taskplane runtime
  support.
- Persisted agent-session capability metadata must describe actual run behavior,
  not provider marketing capability.
- A run may record `structuredToolCalls=true` only after the normalized adapter
  path has executed for that run.
- Runs detail should keep showing whether the session used text-only planning or
  structured tool calling.
- Workspace patch and command tools must still remain unavailable in normal
  prompts until a separate workspace-tool exposure decision accepts them.

## Testing Requirements

Before implementation is accepted:

- adapter unit tests cover each enabled provider or relay response shape
- malformed provider tool-call payloads fall back without executing tools
- run-loop tests prove policy gates behave the same for native tool calls and
  text JSON proposals
- renderer capability tests distinguish pre-run deferral copy from persisted
  `structuredToolCalls=true/false` session summaries
- integration tests prove workspace write and command calls still checkpoint
  instead of executing directly
- local verification passes without GitHub Actions

## Non-Goals

- no arbitrary shell
- no automatic workspace mutation
- no provider-specific tool execution outside `AgentToolRegistry`
- no browser, computer-control, social, or email tools
- no long-running autonomous background scheduler

## Acceptance Criteria

- a provider can advertise tool-call support without Taskplane silently enabling
  tool execution
- provider-native tool-call output becomes ordinary Taskplane run steps
- unavailable tools still produce readable fallback or validation output
- every mutating tool keeps the existing policy and confirmation behavior
- session capability metadata is truthful for the exact run that occurred

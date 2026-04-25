# Structured Tool Calls Decision

## Status

Accepted for the first gated provider-native safe-read slice.

Provider-native structured tool calls are available only when the explicit
`enableProviderNativeToolCalls` flag is on and the provider response passes the
adapter, session gate, and `AgentRunLoop` policy checks. Workspace mutation,
commands, and stronger task closeout tools remain deferred.

## Decision

Taskplane may accept provider-native structured tool calls only through a
dedicated provider adapter boundary that normalizes each provider or relay into
the existing Taskplane execution contract:

```text
Provider tool-call response
  -> Provider adapter normalization
  -> AgentStepProposal
  -> AgentRunLoop policy checks
  -> AgentToolRegistry execution
  -> Run steps / checkpoints / Decisions
```

Persisted agent sessions may record `structuredToolCalls=true` only after this
normalized path actually executes for that run. Text-only fallback sessions and
unsupported provider paths must keep `structuredToolCalls=false`.

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
- provider-native safe-read tool schemas for supported providers only when
  `featureFlags.enableProviderNativeToolCalls=true`
- provider-native sessions with `structuredToolCalls=true` only when the
  provider payload normalizes successfully and the session gate passes
- `featureFlags.enableProviderNativeToolCalls=false` by default

The pre-run capability preview may say a provider path is deferred or limited,
but persisted session metadata must describe what Taskplane actually used for
that run.

Rollout sequencing is tracked in
[PROVIDER_NATIVE_TOOL_CALL_ROLLOUT_PLAN.md](PROVIDER_NATIVE_TOOL_CALL_ROLLOUT_PLAN.md).

## Adapter Requirements

Provider-native structured tool-call paths must provide a small normalized
contract:

```ts
type ProviderToolCallPlan = {
  source: 'provider_tool_call';
  provider: string;
  model: string;
  proposal: AgentStepProposal;
  rawSummary: string;
  providerCallIds: string[];
  stopReason?: string | null;
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

- Anthropic: maps tested Messages-style `tool_use` blocks into normalized
  proposals.
- OpenAI: maps tested chat-completion-style tool calls into normalized
  proposals.
- OpenAI-compatible relays: use the same chat-completion adapter only after the
  relay's request/response shape is covered by tests.
- fal/OpenRouter-style relays: use the OpenAI-compatible adapter through the AI
  SDK chat-completions path; `google/gemini-2.5-flash` has passed the guarded
  safe-read live probe and isolated RunService live acceptance.
- Replicate: remains text-only unless the specific model or relay path exposes
  a tested structured tool-call response shape. Native Replicate text
  prediction must keep `structuredToolCalls=false`.

## UI And Metadata Requirements

- Pre-run copy may distinguish provider potential from Taskplane runtime
  support.
- Shared provider capability descriptors support pre-run copy and adapter
  selection but do not grant permissions by themselves.
- Capability descriptors may report the reserved
  `enableProviderNativeToolCalls` flag, but actual session metadata changes only
  when a gated provider-native session executes.
- Persisted agent-session capability metadata must describe actual run behavior,
  not provider marketing capability.
- A run may record `structuredToolCalls=true` only after the normalized adapter
  path has executed for that run.
- `enableProviderNativeToolCalls` must not flip session metadata by itself; it
  only becomes meaningful when provider payload extraction, adapter
  normalization, and the session gate all pass.
- Runs detail should keep showing whether the session used text-only planning or
  structured tool calling.
- Workspace patch and command tools must still remain unavailable in normal
  prompts until a separate workspace-tool exposure decision accepts them.

## Testing Requirements

Before additional provider-native expansion is accepted:

- rollout must follow
  [PROVIDER_NATIVE_TOOL_CALL_ROLLOUT_PLAN.md](PROVIDER_NATIVE_TOOL_CALL_ROLLOUT_PLAN.md)
- adapter unit tests cover each enabled provider or relay response shape
- shared provider capability descriptor tests keep unconfigured, Replicate, and
  OpenAI-compatible-style providers on truthful text-only or deferred states
- malformed provider tool-call payloads fall back without executing tools
- run-loop tests prove policy gates behave the same for native tool calls and
  text JSON proposals
- renderer capability tests distinguish pre-run deferral copy from persisted
  `structuredToolCalls=true/false` session summaries
- integration tests prove registry-level workspace write and command calls still
  checkpoint instead of executing directly
- RunService integration tests prove provider-native workspace write or command
  proposals fall back without creating checkpoints or changing files unless a
  later explicit exposure decision accepts that path
- local verification passes without GitHub Actions
- guarded live validation should use
  `npm run accept:provider-native-live:preflight`,
  `npm run accept:provider-native-live`, and
  `npm run accept:provider-native-live:run` only with explicit local test keys

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

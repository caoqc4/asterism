# Provider-Native Session Acceptance Gate

## Purpose

This gate defines what must be true before Taskplane expands provider-native
structured tool calls beyond the first gated production agent-session path.

Current accepted behavior remains:

- normal agent runs use text-only planning
- provider-native payloads may be shadow-observed
- provider-native execution is selected only when all runtime-selection gates
  pass
- persisted local agent sessions keep `structuredToolCalls=false`; only the
  explicit provider-native session path may persist `structuredToolCalls=true`

## Must Pass Before Wiring

### Runtime Selection

- `RunOrchestrator` selects provider-native execution only when:
  - `featureFlags.enableProviderNativeToolCalls=true`
  - the text-generation result includes a provider payload
  - adapter normalization returns `status=normalized`
  - the run type is `agent`
- `evaluateProviderNativeSessionGate` stays aligned with these selection rules
  before RunOrchestrator calls `executeProviderNativeSession`.
- Adapter failure must keep the text-only path successful when model text is
  otherwise usable.
- Replicate native text prediction must remain unsupported for provider-native
  structured tool execution.
- Current text generation does not yet send provider-side tool schemas, so this
  path activates only when a provider response body already contains a tested
  tool-call shape.

### Session Truthfulness

- `structuredToolCalls=true` may be persisted only for a session that actually
  executes `executeProviderNativeSession`.
- Text-only fallback or shadow-only sessions must keep
  `structuredToolCalls=false`.
- Provider-native session metadata must include:
  - provider
  - model
  - adapter
  - raw summary
  - provider call ids
  - stop reason
- Session metadata must not persist raw provider payloads, proposal inputs, or
  generated private text.

### Policy Parity

- Provider-native proposals must go through the same `AgentRunLoop` plan
  builder as text JSON proposals.
- Read-only workspace tools still require `allowLocalWorkspaceRead=true`.
- Task update/evidence tools still require `allowTaskMutationTools=true`.
- Workspace patch and command proposals must remain fallback-only in normal
  runs until the workspace-tool exposure decision accepts prompt-level access.
- Confirmation-required tools must still checkpoint through Decisions.

### Run Settlement

- Completed, failed, paused, and needs-confirmation provider-native sessions
  must settle through `RunService` exactly like local text sessions.
- Final run output must come from the `AgentRunLoop` result, not raw provider
  payloads.
- Runs detail must show whether the session used text-only planning or
  provider-native structured tool calling.

### Verification

- Unit coverage:
  - adapter success/failure by provider
  - dispatcher success/failure by provider
  - shadow observation success/failure/no-op
  - provider-native executor completed/failed/paused/needs-confirmation
  - RunOrchestrator does not call provider-native executor unless all selection
    gates pass
- Integration coverage:
  - at least one persisted provider-native agent session with
    `structuredToolCalls=true`
  - one provider-native fallback case that leaves `structuredToolCalls=false`
  - one policy-denied provider-native task/workspace proposal that falls back or
    checkpoints exactly like the text JSON path
- Local verification must pass without GitHub Actions:

```bash
npm test
npm run lint
```

## Non-Goals For First Wiring

- no autonomous scheduling
- no shell execution beyond already checkpointed registry behavior
- no browser or computer-control tools
- no provider-side tool execution outside `AgentToolRegistry`
- no raw provider payload persistence

## Stop Conditions

Stop and return to shadow-only behavior if:

- a provider payload executes without normalization
- a session records `structuredToolCalls=true` without executing the
  provider-native path
- adapter failure breaks an otherwise successful text-only run
- provider proposal inputs or raw payload bodies appear in session metadata
- workspace patch or command tools become prompt-visible through this slice

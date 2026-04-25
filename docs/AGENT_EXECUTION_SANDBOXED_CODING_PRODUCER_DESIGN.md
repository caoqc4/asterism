# Agent Execution Sandboxed Coding Producer Design

## Status

Draft design for the first real internal producer that may create a validated
`SandboxPatchDraftSource`.

This document does not approve a UI-visible coding mode, real model-visible
coding tools, host-process file mutation, arbitrary shell, browser/computer
control, MCP tool execution, or external publishing.

Read first:

- [AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md](AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md)
- [AGENT_EXECUTION_SANDBOX_DECISION.md](AGENT_EXECUTION_SANDBOX_DECISION.md)
- [AGENT_EXECUTION_PATCH_DRAFT_SOURCE_DECISION.md](AGENT_EXECUTION_PATCH_DRAFT_SOURCE_DECISION.md)
- [AGENT_EXECUTION_LAYER_ROADMAP.md](AGENT_EXECUTION_LAYER_ROADMAP.md)

## Goal

Create the first Taskplane-owned path that can turn a bounded coding attempt
into a reviewable patch source:

```text
Task / Run context
  -> prepared sandboxed coding session
  -> narrow model/tool/observation loop
  -> staged writes inside sandbox boundary
  -> changed-file and diff extraction
  -> evidence and requested-check summary
  -> SandboxPatchDraftSource
  -> previewFromSource()
  -> sandbox patch-review run plan
  -> Decision-linked patch_promotion checkpoint
```

The producer is internal. It is not a prompt tool, renderer button, or generic
workspace write API.

## First-Principles Invariants

The producer exists because a coding agent can create useful work only after it
can propose concrete file changes. That moment is also where risk begins.

Therefore the producer must preserve these invariants:

1. **No ambient host authority**: the producer never writes directly to the
   selected workspace.
2. **Prepared scope**: it receives one run id, task id, selected workspace root,
   command policy, execution policy, and model/session policy snapshot.
3. **Narrow computer interface**: the inner loop gets task-specific read,
   edit-staging, list, and check feedback surfaces; it does not get a raw shell
   or generic host filesystem API.
4. **Staged output**: changed files and diffs are collected from staging, not
   inferred from model text.
5. **Evidence over vibes**: the source records observations, command summaries,
   and a model summary without exposing secrets.
6. **Idempotent resume**: source id and requested checks are stable across
   retry/resume; a resumed producer does not duplicate side effects.
7. **Decision promotion**: the producer can only create a source for review; it
   cannot promote the patch.

## Reference Architecture Mapping

### Pi / OpenClaw

Adopt the compact inner loop and embedding shell:

```text
prepare session -> model turn -> tool proposal -> policy gate
  -> tool execution -> observation event -> next turn or terminal state
```

Taskplane owns the shell. It prepares the workspace, policies, tool exposure,
session metadata, event bridge, and source normalization before the model loop
starts. The producer should not import Pi directly or copy broad Read / Write /
Edit / Bash powers.

### OpenHands

Adopt the provider boundary: code execution belongs in a sandbox runtime or
equivalent isolated backend, not in the Electron main process. The producer can
start with an injected fake runner for tests, but the first real backend must
be container or remote-VM shaped and must pass the existing sandbox readiness
gate.

### SWE-agent

Adopt the agent-computer-interface lesson. Coding agents need better
task-specific interfaces, not a generic terminal:

- read selected files
- search indexed workspace text
- stage file replacements or structured patches
- inspect staged diff
- run allowlisted checks
- receive bounded observations

### Plandex

Adopt pending-change review. The producer accumulates proposed changes in a
staging area and emits a patch source; it never directly applies project
changes.

### LangGraph / Microsoft Agent Framework

Adopt durable checkpoints and human-in-the-loop semantics without adopting a
graph runtime. The producer state must be persisted enough to recover the run
after restart and to explain why a source was accepted or blocked.

### MCP / Skills / Browser

Treat these as future tool families behind the same host policy boundary. They
may later feed connector-normalized sources, but they are not part of the first
coding producer.

## Proposed Producer Contract

```ts
type SandboxedCodingProducerRequest = {
  runId: string;
  taskId: string;
  workspaceRoot: string;
  sourceId: string;
  intent: {
    taskTitle: string;
    instructions: string;
    completionCriteria: string[];
  };
  modelPolicy: {
    providerKind: string;
    toolExposure: 'sandboxed_coding_producer';
  };
  commandPolicy: {
    allowedScripts: Array<'test' | 'lint'>;
    timeoutMs: number;
    outputLimitBytes: number;
  };
  executionPolicy: {
    network: 'disabled' | 'allowlisted';
    noCredentialPassthrough: true;
    promotion: 'decision_required';
  };
};
```

The producer result should be:

```ts
type SandboxedCodingProducerResult =
  | {
      status: 'source_ready';
      source: SandboxPatchDraftSource;
      sessionSummary: string;
    }
  | {
      status: 'blocked' | 'failed' | 'paused';
      reason: string;
      sessionSummary: string;
    };
```

The source must still pass `validateSandboxPatchDraftSource()` before it can
feed `previewFromSource()`.

## Producer Flow

1. **Prepare**
   - Resolve selected workspace root.
   - Build source id from run id, task id, producer kind, and attempt id.
   - Prepare sandbox session with read-only workspace mount and writable
     staging area.
   - Persist session manifest and initial RunStep.

2. **Expose Narrow Tools**
   - `workspace.read_file` for selected workspace files.
   - `workspace.search_text` with bounded output.
   - `staging.write_file` or `staging.apply_structured_patch` inside staging.
   - `staging.diff` to inspect pending changes.
   - `checks.run` for allowlisted `test` / `lint`.
   - No raw shell, no host write, no credential access.

3. **Run Inner Loop**
   - Model proposes a tool call.
   - Producer policy validates tool, path, size, and command.
   - Tool executes in sandbox/staging.
   - Observation is bounded, redacted, and emitted as an event.
   - Loop ends when model requests final patch review, hits budget, fails, or
     requires a Decision.

4. **Collect Source**
   - Enumerate changed files from staging.
   - Normalize relative paths.
   - Generate bounded diff preview.
   - Summarize evidence and command results.
   - Choose requested checks from allowlist.
   - Build `SandboxPatchDraftSource`.

5. **Review Plan**
   - Call `SandboxPatchReviewPlanningService.previewFromSource()`.
   - If ready, continue through existing sandbox patch-review request/audit
     path.
   - If blocked, persist a visible failed/blocked RunStep.

## Data And Event Shape

The producer should emit product-level events rather than raw logs only:

- `sandbox_producer.started`
- `sandbox_producer.tool_requested`
- `sandbox_producer.tool_blocked`
- `sandbox_producer.tool_completed`
- `sandbox_producer.check_completed`
- `sandbox_producer.source_ready`
- `sandbox_producer.blocked`
- `sandbox_producer.failed`
- `sandbox_producer.paused`

RunStep projection should stay compact:

- one preparation step
- bounded tool/check result steps
- one source summary step
- one Decision/checkpoint step after patch review is ready

## Storage

Minimum persisted state before implementation:

- producer session id / source id
- run id / task id / workspace root
- policy snapshot
- staging root or backend session handle
- event summaries
- accepted/rejected tool calls
- changed-file list and diff summary
- requested checks
- terminal status

Do not persist provider credentials, raw environment variables, full unbounded
stdout/stderr, or model chain-of-thought.

## Failure Modes

- **No sandbox backend**: return `blocked`.
- **Feature flag disabled**: return `blocked`.
- **Workspace missing or changed**: return `blocked`.
- **Unsafe path**: block the tool call and continue only if the model can
  recover.
- **Non-allowlisted command**: block the tool call.
- **Check failure**: source may still be emitted with failed check evidence,
  but promotion remains blocked or requires explicit review.
- **Diff empty**: source is blocked.
- **Output too large**: truncate and record truncation in evidence.
- **Restart mid-session**: resume from persisted producer state or fail visibly
  without promoting files.

## Implementation Slices

Completed non-live slices:

1. Producer request/result types and pure validation helpers.
2. Fake/injected producer runner preview path for tests only.
3. Staged file collector that converts staging contents into a patch draft.
4. Producer event types and compact RunStep projection.
5. Non-live source/preview bridge into `previewFromSource()`.
6. Add integration coverage for blocked, failed, empty-diff, and source-ready
   producer results.
7. Bounded producer session metadata formatting for future `agent_sessions`
   persistence and Run detail diagnostics, without persisting raw provider
   prompts, environment variables, or unbounded logs.

Next slice:

8. Connect a real sandbox backend only after a backend decision/review confirms
   the implementation still satisfies the sandbox decision and source boundary.

## Acceptance

- no producer path can write directly to the selected workspace
- no producer path exposes raw shell or host process commands
- every source-ready result includes source id, run id, task id, workspace root,
  changed files, diff, evidence, requested checks, and Decision promotion
  policy
- invalid sources are blocked by `validateSandboxPatchDraftSource()`
- ready sources pass through `previewFromSource()`
- persisted artifact metadata can trace the patch back to source identity
- local-note diagnostics remain blocked-only
- `npm run accept:sandbox-coding` and `npm run verify` pass

## References

- OpenClaw Pi integration:
  <https://openclawlab.com/en/docs/pi/>
- OpenClaw agent loop:
  <https://docs.openclaw.ai/agent-loop>
- OpenHands sandbox overview:
  <https://docs.openhands.dev/openhands/usage/sandboxes/overview>
- OpenHands runtime architecture:
  <https://docs.openhands.dev/openhands/usage/architecture/runtime>
- SWE-agent ACI paper:
  <https://arxiv.org/abs/2405.15793>
- Plandex pending changes docs:
  <https://docs.plandex.ai/core-concepts/reviewing-changes>
- LangGraph durable execution:
  <https://docs.langchain.com/oss/python/langgraph/durable-execution>
- Microsoft Agent Framework 1.0:
  <https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/>
- MCP specification:
  <https://modelcontextprotocol.io/specification/draft>

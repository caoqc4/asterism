# Agent Execution Layer v2 Decision

## Status

Accepted as the next design boundary after the alpha task-management and local
agent acceptance slices.

Read
[AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md](AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md)
first for the first-principles framework assessment that supports this boundary.

## Decision

Agent execution layer v2 should make Taskplane's local agent runtime more
durable before it becomes more powerful.

The next phase should not expose workspace patching, command execution,
browser/computer control, external posting, or autonomous scheduling to normal
agent prompts. Those capabilities remain registry-only or deferred behind their
existing decision gates.

Instead, v2 starts by formalizing a resumable agent session contract:

- a run-scoped session loop with typed runtime events
- durable step and checkpoint state that can survive app restart
- provider adapters that normalize model output into the same event/proposal
  contract
- tool execution only through `AgentToolRegistry`
- explicit policy gates before every mutation
- confirmation checkpoints and Decisions for higher-risk actions
- product-level summaries that keep Task, Run, Decision, Artifact, and Timeline
  as the user-facing control plane

## First-Principles Rationale

The core product problem is not "can the model call more tools?" It is "can the
system safely turn task context into recoverable work with visible evidence and
clear human decision points?"

That means the smallest valuable v2 increment is runtime reliability:

- If a run pauses, the user should know why and how to resume.
- If a provider returns structured calls, they should pass through the same
  policy gates as text-planned steps.
- If a tool mutates task or workspace state, the mutation should be visible in
  Taskplane domain objects, not hidden in a raw tool log.
- If a tool is not exposed, provider-native payloads must still fail closed or
  fall back without side effects.

Pi and OpenClaw should be treated as separate but related references: Pi is the
inner-loop reference for a small stateful agent runtime with tool execution and
event streaming, while OpenClaw is the embedding reference for wrapping that
loop with sessions, gateway/channel concerns, policy filtering, and persistence.
Taskplane should keep those ideas, but preserve its own control-plane model
instead of copying an execution-first agent shell.

## v2 Slice 1: Runtime Event Spine

Goal: make the existing `AgentExecutor` boundary event-shaped instead of only
return-result-shaped.

The executor should be able to emit typed events such as:

- `session.started`
- `plan.proposed`
- `tool.started`
- `tool.completed`
- `tool.failed`
- `checkpoint.created`
- `session.paused`
- `session.completed`
- `session.failed`

The first implementation can still run synchronously inside `RunService`, but
the contract should make long-running and resumable sessions possible later.

Acceptance:

- existing text-only and provider-native paths still settle the same way
- run steps are written from event handling, not ad hoc executor branches
- failed tool events preserve retryable error wording
- checkpoint events map to persisted `run_checkpoints` and pending Decisions
- `npm run accept:agent-local` passes

Current implementation note: session event recording persists session-start,
plan, tool-start, tool-result/failure, checkpoint-created, pause, completion,
and failure events. `tool.started` creates a running tool-call RunStep, and the
recorder updates that step to completed or failed when the matching result event
arrives.

## v2 Slice 2: Resume Contract

Goal: make pause/resume behavior a runtime contract instead of a special case
for one saved next tool.

The checkpoint payload should carry enough structured state to resume a session
deterministically:

- session id or run id
- next tool or continuation target
- validated input
- policy snapshot relevant to the pending action
- user-visible reason
- linked Decision id when applicable

Acceptance:

- deferred/cancelled Decisions still settle runs as non-resumable
- approved Decisions resume exactly one pending action
- app restart does not lose the pending reason or next action
- stale or incompatible checkpoint payloads fail safely with visible wording

## v2 Slice 3: Tool Exposure Matrix

Goal: separate "tool exists in registry" from "model can see it" and "runtime
may execute it."

Each tool should have three explicit gates:

- registry availability
- prompt/provider schema exposure
- runtime policy execution

The current implementation records prompt/provider exposure in
`src/shared/agent-tool-exposure.ts`. Text prompts and provider-native schemas
must consume that shared matrix instead of carrying separate allowlists.

For the current alpha boundary:

| Tool group | Registry | Prompt/schema exposure | Runtime execution |
| --- | --- | --- | --- |
| task context/timeline read | yes | yes | yes |
| workspace search/read | yes | per-run read-only opt-in | per-run read-only opt-in |
| task update/evidence tools | yes | per-run task-tool opt-in | per-run task-tool opt-in |
| high-risk completion criteria | yes | task-tool opt-in | Decision checkpoint before mutation |
| workspace patch | yes | no | explicit local file-write policy + Decision |
| workspace command | yes | no | explicit local command policy + Decision |
| browser/computer/external posting | no | no | no |

Acceptance:

- provider-native schema exposure remains safe-read only unless a later decision
  changes it
- normal prompts still omit workspace write and command tools
- tests prove policy-denied provider-native workspace proposals do not create
  checkpoints or change files

## Non-Goals

- no autonomous background task execution
- no arbitrary shell commands
- no browser/computer-control tools
- no external publishing, email, social, calendar, or GitHub mutation tools
- no automatic completion satisfaction or task closeout
- no hidden task system inside the runtime

## Implementation Order

1. Introduce typed runtime event objects and adapt the current local executor to
   emit them internally.
2. Move run-step writes behind an event-to-run-step mapper.
3. Normalize existing pause/checkpoint handling through the same event mapper.
4. Add restart-safe resume tests around approved/deferred/cancelled checkpoint
   Decisions. Status: covered by `DecisionService` integration tests that create
   a real checkpoint, close the database connection, and settle the Decision
   through fresh service/repository instances.
5. Only after those pass, revisit whether a narrow user-requested workspace
   write or command UI opt-in should be designed.

## Verification

Use local verification while GitHub Actions quota is unavailable:

```bash
npm run accept:agent-runtime
npm run accept:agent-local
npm run verify
```

Do not dispatch or watch GitHub Actions for this decision while Actions quota is
disabled.

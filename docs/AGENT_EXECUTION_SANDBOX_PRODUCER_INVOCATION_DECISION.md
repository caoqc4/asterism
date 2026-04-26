# Agent Execution Sandbox Producer Invocation Decision

## Status

Accepted for the current alpha execution-layer slice.

The explicit local-container producer execution service exists, but this
decision does not expose a user-visible code-agent mode, normal task/run UI
entrypoint, prompt-level tool, MCP tool, Skills execution, browser/computer
control, external publishing, or autonomous scheduling.

Read first:

- [AGENT_EXECUTION_SANDBOX_DECISION.md](AGENT_EXECUTION_SANDBOX_DECISION.md)
- [AGENT_EXECUTION_SANDBOX_BACKEND_REVIEW.md](AGENT_EXECUTION_SANDBOX_BACKEND_REVIEW.md)
- [AGENT_EXECUTION_SANDBOXED_CODING_PRODUCER_DESIGN.md](AGENT_EXECUTION_SANDBOXED_CODING_PRODUCER_DESIGN.md)
- [WORKSPACE_TOOL_UI_OPT_IN_DECISION.md](WORKSPACE_TOOL_UI_OPT_IN_DECISION.md)

## Decision

Keep the sandboxed coding producer execution service limited to explicit
internal/manual invocation.

Allowed now:

- unit and integration tests
- `accept:sandbox-coding` non-live verification
- `accept:sandbox-coding:backend-preflight` read-only Docker readiness
- `accept:sandbox-coding:producer-preview-smoke` default skipped and explicit
  non-live smoke
- the same smoke with
  `TASKPLANE_RUN_SANDBOX_PRODUCER_DOCKER_CHECKS=true` when an operator
  deliberately wants Docker-backed check validation
- future local CLI/manual operator paths that pass `operatorConfirmed: true`

Not allowed yet:

- normal Task/Run UI buttons for code-agent execution
- model-visible Read / Write / Edit / Bash tools
- automatic invocation from a normal agent run
- scheduled/background code-agent work
- MCP, browser, computer-use, Skills, GitHub mutation, or publishing tools
- credential passthrough into the sandbox

## Why

From first principles, a code-agent lane crosses a stronger boundary than task
management. It can read a workspace, produce code changes, and execute project
checks. Even inside Docker, those actions need an explicit invocation surface,
clear user intent, bounded scope, and reviewable output before they become
ordinary product features.

The current execution service is the right backend boundary: it blocks before
Docker probing unless `operatorConfirmed` is true, then probes the local
container backend, prepares a sandbox session, runs the producer preview flow,
and still emits only staged patch evidence for Decision review. That is enough
for manual validation. It is not enough for broad UI exposure.

## Required Product Gates Before UI Exposure

Before a Task/Run UI entrypoint can call this service, Taskplane needs:

1. A dedicated code-agent mode decision covering copy, warnings, and user
   expectations.
2. A visible run form that states Docker may start containers and checks may run
   inside them.
3. A pre-run capability panel that shows workspace root, network disabled,
   credential passthrough disabled, allowed checks, and Decision-only promotion.
4. Run detail rendering for sandbox producer sessions, staged diffs, check
   evidence, blocked diagnostics, and failed/paused recovery.
5. Manual alpha validation on a real workspace with Docker available.
6. `npm run accept:sandbox-coding`, producer preview smoke, and `npm run verify`
   passing locally.

Before model prompt exposure, Taskplane additionally needs a separate tool
exposure decision. The current producer remains an internal executor path, not a
model-visible generic workspace API.

## Current Invocation Contract

Any caller must provide:

- `operatorConfirmed: true`
- a normalized sandboxed coding producer request
- feature flags with sandbox coding explicitly enabled
- a prepared producer loop
- bounded patch summary and completion intent
- local container Docker probe success or a blocked diagnostic path

If `operatorConfirmed` is false, the service returns blocked before probing
Docker. If Docker is unavailable, the preflight path returns blocked diagnostics
and must not prepare a runner session.

## Acceptance

- tests prove no Docker probe occurs without operator confirmation
- tests prove confirmed execution passes the probe result into the non-UI
  preview service
- Docker-backed smoke remains manually gated by environment variables
- normal task UI and prompt paths remain unchanged
- no credentials are passed into sandbox checks
- workspace mutation remains staged and Decision-reviewed

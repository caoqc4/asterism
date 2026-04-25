# Agent Execution Sandbox Decision

## Status

Accepted as the sandbox boundary before any broad code-agent mode is exposed.

Read first:

- [AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md](AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md)
- [AGENT_EXECUTION_LAYER_V2_DECISION.md](AGENT_EXECUTION_LAYER_V2_DECISION.md)
- [AGENT_EXECUTION_TASK_BREAKDOWN.md](AGENT_EXECUTION_TASK_BREAKDOWN.md)

## Decision

Taskplane alpha must not expose a broad coding-agent execution mode.

The current execution layer may keep:

- task context and timeline read tools
- read-only workspace search/read when explicitly enabled per run
- task/evidence tools when explicitly enabled per run
- registry-only workspace patch and command tools behind Decision checkpoints

It must not expose arbitrary shell, browser/computer control, broad workspace
write, credential-bearing tools, or autonomous background code execution to
normal prompts or provider-native schemas.

Before code-agent mode is accepted, Taskplane needs a dedicated sandbox
implementation. The recommended first acceptable target is a local container
sandbox with narrow mounts and explicit command policy, or a remote sandbox
with equivalent isolation. Host-process execution is not acceptable for broad
agent coding.

## First-Principles Rationale

An agent that can edit files and run commands is not just "a model with more
tools." It is a process that can transform a user's local machine, credentials,
network access, repository state, and build artifacts.

Therefore the first question is not which agent framework to copy. The first
question is which damage boundaries exist if the model or tool proposal is
wrong.

For Taskplane, the product invariant is:

```text
Task -> Run -> AgentSession -> RunStep -> Checkpoint / Decision -> Artifact -> Timeline
```

Code execution must remain inside that control plane. It cannot become a hidden
terminal session with side effects that only appear after the fact.

The reference frameworks point to the same conclusion:

- Pi-style inner loops are useful for compact plan/tool/observe cycles, but
  they still need a bounded execution environment.
- OpenClaw-style embedding is useful for product/session integration, but the
  shell must not grant ambient host authority.
- OpenHands and SWE-agent show that coding agents are environment problems
  before prompt problems.
- Plandex-style diff review reinforces that file changes should be promoted as
  reviewable artifacts, not silently applied product state.
- MCP-style connector boundaries are useful only if each tool is separately
  exposed, authorized, and audited.

## Rejected Option: Host Process Code Agent

Host-process execution means Taskplane would let an agent run commands directly
in the user's app process or inherited local shell environment.

Rejected for broad code-agent mode because it cannot reliably bound:

- workspace writes outside the intended root
- credential and environment-variable access
- network calls and package-install side effects
- long-running or runaway processes
- generated files and build artifacts
- accidental mutation of unrelated repositories
- auditability after app restart

The existing `workspace.run_command` tool is not this mode. It remains a
registry-only, allowlisted package-script tool behind explicit local command
policy and Decision checkpoints.

## Acceptable Sandbox Shape

The minimum acceptable sandbox for a future code-agent mode must provide these
properties before any prompt or provider schema can expose it.

### Workspace Boundary

- Mount exactly one selected workspace root.
- Default to read-only context.
- Write only to an explicit working branch, temp overlay, or patch staging
  area.
- Promote changes back to Taskplane as artifacts or reviewable patches before
  they affect user-visible task state.
- Reject absolute paths and path traversal outside the workspace root.

### Credentials

- Do not inherit the host app environment by default.
- Start with an empty or allowlisted environment.
- Never pass Taskplane provider keys, relay keys, keychain secrets, or user
  session tokens into the sandbox unless a separate connector-specific
  Decision accepts it.
- Redact secrets from run steps, artifacts, command output, and error messages.

### Network

- Default network policy should be off or allowlisted.
- Package-manager access must be a separate opt-in with visible cost/risk
  wording.
- External posting, messaging, email, calendar, browser, and GitHub mutation
  remain out of scope.

### Commands

- Commands must be structured tool calls, not raw shell text.
- Use an allowlist with explicit arguments, timeout, working directory, and
  output limit.
- Deny interactive commands.
- Capture stdout/stderr as bounded RunStep output.
- Treat timeout, non-zero exit, and output truncation as first-class tool
  results.

### Artifacts And Diffs

- File changes should first become patch artifacts or staged workspace changes.
- The user should be able to inspect changed files before promotion.
- Generated large artifacts should be referenced by path/summary, not pasted
  wholesale into timeline text.
- RunStep and Timeline entries should explain what changed and why.

### Resume And Audit

- A paused code-agent action must resume exactly one pending action.
- Checkpoint payloads must include run id, session id when available,
  continuation target, validated input, policy snapshot, and user-visible
  reason.
- Stale or incompatible payloads must fail visibly and safely.

## Rollout Sequence

1. Keep current alpha behavior: no broad code-agent mode.
2. Finish restart-safe resume validation for the current local agent.
3. Keep `agent-tool-exposure` as the single prompt/provider exposure matrix.
4. Design the sandbox provider interface without exposing it to prompts.
5. Add a disabled-by-default sandbox smoke test using a temp workspace.
6. Add patch-artifact review before any file promotion.
7. Only then consider a narrow user-requested coding mode behind explicit
   local configuration.

## Acceptance

- No new prompt or provider-native schema exposes arbitrary code execution.
- Workspace patch and command tools remain unexposed to normal model prompts.
- Current registry-only patch and command tools keep their Decision checkpoints.
- The task breakdown and roadmap link this sandbox decision.
- Any future code-agent work starts from a sandbox provider interface, not from
  host-process command execution.

## Non-Goals

- no browser/computer-control agent
- no autonomous scheduled coding work
- no arbitrary shell
- no external posting/email/calendar/social tools
- no GitHub mutation tools
- no plugin or skill marketplace
- no automatic file promotion without review

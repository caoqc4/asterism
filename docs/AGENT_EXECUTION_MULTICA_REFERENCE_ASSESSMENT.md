# Multica Reference Assessment

## Status

Accepted as a focused reference note for Taskplane's agent execution layer.

This document complements
[AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md](AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md).
It should be read as a product/control-plane comparison, not as a dependency
decision.

## Scope

Multica was reviewed because it is close to Taskplane's target problem space:
task management plus managed coding agents. The review covered:

- public website: <https://multica.ai/>
- repository: <https://github.com/multica-ai/multica>
- README, CLI/daemon guide, self-hosting guide, product overview docs
- local source review of `server/internal/daemon`, `server/pkg/agent`,
  task lifecycle handlers, migrations, runtime models, and skill injection

## Product Chain

Multica's core product chain is:

```text
Workspace / Issue / Comment
  -> Agent assignee or @agent mention
  -> agent task queue
  -> runtime claim
  -> local daemon executes a coding-agent CLI
  -> streamed task messages, comments, status updates, and final task result
```

The product treats agents as first-class teammates. An agent has a profile,
runtime binding, provider, instructions, skills, custom environment, custom
arguments, MCP configuration, and model. It can be assigned issues, mentioned in
comments, participate in issue conversations, and resume previous sessions.

This is closer to "agent-managed Linear/Jira" than to a raw agent SDK.

## Execution Architecture

Multica separates the control plane from the execution worker:

- The server stores workspace, issue, comment, agent, skill, runtime, task, and
  activity state.
- The daemon runs on the user's machine, authenticates with the server,
  registers available runtimes, heartbeats, polls for tasks, claims work, and
  streams task messages back.
- A runtime is effectively `daemon x provider`: one local daemon can expose
  multiple providers if multiple coding-agent CLIs are available.
- The daemon prepares an execution environment, injects Multica context,
  exposes the `multica` CLI to the spawned agent, and resumes prior sessions /
  workdirs when available.
- The backend layer wraps coding-agent CLIs behind one interface:

  ```text
  Backend.Execute(prompt, options)
    -> Session.Messages
    -> Session.Result
  ```

Providers reviewed in source include Claude, Codex, Copilot, OpenClaw,
OpenCode, Gemini, Hermes, Pi, Cursor, and Kimi. Each backend adapts a different
CLI protocol:

- Codex uses `codex app-server --listen stdio://`.
- Pi uses JSON mode plus a session file.
- OpenClaw uses local JSON output and a managed session id.
- Other providers use their own streaming or JSON formats.

Multica's strongest execution-layer idea is therefore not a new model loop; it
is a platform wrapper around existing coding-agent CLIs, with queueing,
runtime registration, context injection, session resume, event normalization,
and product-level state.

## What Taskplane Should Borrow

### Runtime Registry

Taskplane should introduce an explicit `ExecutionRuntime` concept before the
code-agent UI grows too far:

- runtime id
- provider
- mode: local container, external CLI, future remote sandbox
- status: not checked, ready, blocked, offline
- health evidence and last check time
- capability summary: checks, patch output, network policy, credential policy,
  MCP/skills/browser availability when those families are later enabled

This is more durable than hiding execution capability inside individual Run
metadata.

### Agent Profile vs Runtime

Multica's split between agent identity and runtime location is useful.
Taskplane should keep these separate:

- `AgentProfile`: instructions, role, default process templates / skills,
  model/provider preference, allowed tool families
- `ExecutionRuntime`: where and how execution actually runs
- `Run`: one attempt with concrete policy and evidence

This avoids coupling "who is doing the work" to "which local machine/container
executes it."

### Claim / Start / Complete Lifecycle

The daemon claim model is a useful reference for future orchestration:

```text
queued -> claimed/dispatched -> running -> completed / failed / cancelled
```

Taskplane does not need a network daemon for the first visible code-agent UI,
but it should keep this lifecycle vocabulary in the domain model so a future
local worker, external CLI worker, or remote sandbox can plug in without
rewriting Run semantics.

### Skills As Execution Readiness

Multica's skill model reinforces a first-principles point: skills are not just
"extra context"; they can be evidence that a task has an established execution
procedure.

For Taskplane, a mature skill/process template can contribute to an automation
readiness decision:

- the task matches a known workflow
- required inputs are present
- allowed tools are known
- risk level is within policy
- previous runs have succeeded or been accepted
- user or workspace policy permits automatic start for this workflow

This makes "automatic start" a policy result, not a universal default.

### Provider Wrapping

Multica shows a pragmatic route for supporting mature coding agents:

- wrap CLI protocols behind a small internal interface
- normalize messages and final results into Taskplane events
- preserve provider-native session ids when possible
- keep provider-specific flags and resume behavior inside adapters

Taskplane can learn from this without making external CLIs the first execution
path. The current sandboxed producer can remain Taskplane-owned, while future
providers can be added as runtime adapters.

## What Taskplane Should Not Copy Directly

### Assignment Equals Execution

Multica commonly starts work when an issue is assigned to an agent or when an
agent is mentioned. Taskplane should not copy that as a blanket rule.

Taskplane's default alpha posture should be:

```text
unclear workflow or high-risk tools
  -> propose / checkpoint / Decision

clear workflow + mature skill + required inputs + policy allows auto-start
  -> automatic start is allowed
```

The distinction matters. Automatic start is desirable when execution is routine,
well-scoped, and authorized. It is dangerous when the agent is guessing the
workflow, touching broad workspace state, using credentials, posting externally,
or running tools whose blast radius is not visible to the user.

### Cloud-Team Complexity

Multica is a team collaboration platform with workspaces, members, roles,
multi-user inbox, cloud/self-host deployment, local daemons, and runtime
pairing. Taskplane should not pull that complexity into the first code-agent
mode.

Taskplane should stay local-first and task-native until the single-user
execution loop is trustworthy.

### Broad Host Authority

Multica's daemon intentionally launches local coding-agent CLIs with workspace
context, API tokens, custom environment, MCP config, and access to the local
machine's installed tools. That is powerful but broad.

Taskplane's first code-agent mode should keep:

- Docker/backend readiness visible
- network disabled
- credentials disabled
- no host mutation
- staged patch output
- Decision-required promotion

MCP, browser/Playwright, skills, computer-use, and external publishing should be
added as policy-governed tool families after the runtime boundary is stable.

## Taskplane Decision

Multica should be treated as a primary reference for:

- task-management control plane plus local agent execution worker
- runtime registration and health
- agent profile/runtime separation
- multi-provider coding-agent CLI wrapping
- skill-informed execution readiness
- task lifecycle projection into product UI

Multica should not replace the existing Pi/OpenClaw reference split:

- Pi remains the strongest reference for a small inner agent loop.
- OpenClaw remains the strongest reference for embedding that loop into a local
  product shell with policy, channels, sessions, and skills.
- Multica is the strongest reference for the product/control-plane bridge:
  agents as assignable workers, runtime registry, queue/claim lifecycle, and
  daemon/provider wrapping.

## Implications For The Next Taskplane Work

Before building the visible code-agent UI, update the implementation plan around
three explicit concepts:

1. `ExecutionRuntime`
   The user-visible execution capability and readiness object.

2. `AgentProfile`
   The role/instruction/skill/policy object. It may later power automatic starts
   when a task matches a mature workflow.

3. `AgentRunLifecycle`
   The queue/claim/start/stream/complete/fail/cancel vocabulary that maps into
   existing Run, RunStep, Decision, Artifact, and Timeline records.

The first UI can still be narrow and manual. The architecture should leave room
for policy-approved automatic starts once Taskplane can prove that a task has a
clear workflow, a mature skill, complete inputs, and an acceptable tool/risk
profile.

## Sources

- Multica website: <https://multica.ai/>
- Multica repository: <https://github.com/multica-ai/multica>
- CLI and daemon guide:
  <https://github.com/multica-ai/multica/blob/main/CLI_AND_DAEMON.md>
- Self-hosting guide:
  <https://github.com/multica-ai/multica/blob/main/SELF_HOSTING.md>
- Local source review of `server/internal/daemon`,
  `server/pkg/agent`, `server/internal/service/task.go`,
  `server/internal/handler/daemon.go`, and runtime/skill migrations from a
  shallow clone of `multica-ai/multica`.

# Agent Execution Orchestration Plan

## Status

Draft implementation plan for the orchestration layer that follows the current
execution evidence and recovery UX slices.

Read with:

- [AGENT_EXECUTION_LAYER_V2_DECISION.md](AGENT_EXECUTION_LAYER_V2_DECISION.md)
- [AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md](AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md)
- [AGENT_EXECUTION_FUTURE_DESIGN.md](AGENT_EXECUTION_FUTURE_DESIGN.md)
- [AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md](AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md)
- [AGENT_EXECUTION_TASK_BREAKDOWN.md](AGENT_EXECUTION_TASK_BREAKDOWN.md)

## First-Principles Decision

Taskplane orchestration should answer one question before it starts work:

```text
Can this task be dispatched to a known runtime, under a known profile and
policy, with recoverable evidence and a clear stop/resume path?
```

If the answer is no, Taskplane should stay in proposal, Decision, or manual Run
mode. If the answer is yes, the orchestration layer may create a queued manual
or future automatic run, but the run still has to produce Taskplane-owned
evidence:

```text
Task -> OrchestrationRequest -> Run -> AgentSession -> RunStep
  -> Checkpoint / Decision -> Artifact -> Timeline
```

The orchestration layer is therefore not a generic queue or background worker.
It is the product boundary that decides when a task can become an execution
attempt, which runtime may claim it, which profile/policy applies, and how the
attempt remains visible and recoverable.

## Reference Lessons To Keep

Pi remains the inner-loop reference: small stateful sessions, tool events,
pause/resume, and explicit tool execution.

OpenClaw remains the embedding reference: agent runtime wrapped by product
policy, local shell boundaries, skills, channels, and persistence.

Multica is the orchestration reference: agent profiles, runtime registration,
queue/claim lifecycle, local daemon/provider wrapping, skill-informed
automation readiness, and product-visible task status.

Taskplane should borrow those shapes, not their authority model. Runtime
registration does not grant tool access. Skills do not grant credentials.
Assignment does not imply automatic execution unless the automation-readiness
policy passes.

## Core Objects To Introduce

### ExecutionRuntime

Represents where execution can happen.

Initial fields:

- runtime id and display name
- kind: `local_sandbox`, `external_cli`, `browser_session`, `mcp_client`,
  `creator_connector`, or future remote sandbox
- status: `not_checked`, `ready`, `blocked`, `offline`
- health summary, blocked reasons, and last checked time
- capability families: coding, browser, MCP, skills, creator, computer-use
- policy posture: network, credentials, workspace mutation, command allowlist

The current sandbox backend readiness can feed the first local-sandbox runtime.

### AgentProfile

Represents who or what is doing the work.

Initial fields:

- profile id, name, and role
- default instructions
- allowed tool families
- preferred provider/model where applicable
- linked process templates or skills
- automation-readiness requirements

The existing manual Code Agent profile can become the first static profile.

### OrchestrationRequest

Represents an intent to start or prepare execution.

Initial fields:

- task id and requested lane: coding, creator, browser evidence, or general
- profile id
- runtime id or runtime selector
- start mode: `manual`, `operator_started`, or future `policy_auto`
- selected policy snapshot
- required inputs and missing-input reasons
- idempotency key

### AgentRunLifecycle

Represents how an execution attempt moves.

Initial vocabulary:

```text
drafted -> queued -> claimed -> running
  -> paused / needs_confirmation
  -> completed / failed / cancelled
```

The current Run statuses can remain the persisted user-facing state while this
vocabulary becomes the orchestration contract.

## Slice Plan

### O1: Read-Only Orchestration Snapshot

Goal: surface runtime/profile/lifecycle facts without changing execution.

Status: started. Shared snapshot helpers now build the first local-sandbox
runtime, manual Code Agent profile, manual/operator-started lifecycle, and
hidden connector family summary. Settings and the Task detail Code Agent
surface can display the same read-only orchestration summary without enabling
queue, claim, scheduler, or automatic-start behavior.

Work:

- add shared snapshot helpers for current runtime readiness, static Code Agent
  profile, hidden browser/MCP/skill/creator families, and latest lifecycle
  state
- feed the snapshot into Settings and Task detail copy where equivalent facts
  are currently assembled ad hoc
- keep all starts manual; no queue, scheduler, or provider call is introduced

Acceptance:

- existing Code Agent readiness wording still matches current behavior
- hidden connector families remain `not_exposed`
- `npm run verify` passes

### O2: OrchestrationRequest Contract

Goal: formalize the payload that turns task intent into a run attempt.

Work:

- define shared request/result types
- map existing operator-started browser evidence and manual code-agent preview
  inputs into the request shape
- include profile id, runtime id, policy snapshot, and idempotency key
- keep service handlers delegating to the existing run services

Acceptance:

- no behavior change for manual Code Agent or Browser Evidence starts
- rejected requests explain missing runtime, profile, inputs, or policy
- no scheduler or automatic start path is enabled

### O3: Queue/Claim Vocabulary Without Background Autonomy

Goal: make future dispatch explicit while keeping alpha starts operator-driven.

Work:

- add lifecycle projection helpers for drafted/queued/claimed/running/paused
- record lifecycle steps as RunSteps or session metadata for manually started
  runs
- avoid any autonomous polling worker or cron behavior

Acceptance:

- Runs can explain whether a run was operator-started, queued, claimed, or
  blocked before execution
- restart/recovery still routes through existing checkpoint and Decision paths

### O4: Skill-Informed Automation Readiness

Goal: compute whether a task could be auto-started later, without auto-starting
now.

Work:

- build a read-only readiness evaluator from task state, process template /
  skill match, required inputs, allowed tools, risk, prior accepted evidence,
  runtime readiness, and user/workspace policy
- show readiness as diagnostics only
- treat mature skills as evidence of procedure, not as permission

Acceptance:

- high-risk, missing-input, credential-bearing, or broad-tool tasks stay
  blocked
- clear low-risk repeat workflows can be marked `eligible` but not launched
- no scheduler or auto-run flag is persisted

### O5: Lane-Specific Expansion

Only after O1-O4 are locally accepted:

- coding lane: richer sandbox provider adapters and patch-review recovery
- browser lane: controlled interaction behind checkpoint-required policy
- creator lane: draft artifacts and publication previews, no posting
- MCP lane: safe-read adapters after descriptor/policy review
- computer-use lane: separate high-risk decision

## Non-Goals

- no autonomous scheduler in this plan
- no browser/computer control exposure
- no arbitrary shell
- no credential-bearing connector action
- no external posting, purchase, email, calendar, or GitHub mutation
- no automatic start until the readiness evaluator and user policy are accepted

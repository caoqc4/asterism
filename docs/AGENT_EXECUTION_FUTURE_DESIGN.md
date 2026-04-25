# Agent Execution Future Design

## Status

Draft design for the post-Slice-0 execution layer.

Read first:

- [AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md](AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md)
- [AGENT_EXECUTION_LAYER_V2_DECISION.md](AGENT_EXECUTION_LAYER_V2_DECISION.md)
- [AGENT_EXECUTION_SANDBOX_DECISION.md](AGENT_EXECUTION_SANDBOX_DECISION.md)
- [AGENT_EXECUTION_TASK_BREAKDOWN.md](AGENT_EXECUTION_TASK_BREAKDOWN.md)
- [AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md](AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md)

## Design Goal

Taskplane's future agent execution layer should support longer, resumable,
reviewable work without turning the product into a generic autonomous shell.
AI programming and creator/self-media automation are target scenarios, not
incidental add-ons. The design goal is to support those workflows through
bounded execution, artifacts, Decisions, and recovery rather than through
ambient host authority.

The durable product control plane remains:

```text
Task -> Run -> AgentSession -> RunStep -> Checkpoint / Decision -> Artifact -> Timeline
```

The execution layer may become more capable only when new capabilities can be
projected back into this control plane with clear evidence, pause points, and
recovery behavior.

## First-Principles Boundary

The next question is not "which framework should Taskplane adopt?" The next
question is "which unit of work can be paused, inspected, resumed, and explained
without hidden side effects?"

That makes the future architecture event-first and domain-owned:

- model turns produce normalized proposals
- proposals become typed runtime events
- events are projected into RunSteps, Checkpoints, Decisions, Artifacts, and
  Timeline entries
- tools are visible to models only through an exposure matrix
- tools execute only through `AgentToolRegistry` or future registry-compatible
  adapters
- sandboxed code execution is a separate provider boundary, not ambient host
  authority

## Runtime Shape

The future runtime should keep a small Pi-style inner loop:

```text
prepare session
  -> model turn
  -> normalize proposal/tool call
  -> policy and exposure check
  -> execute tool or create checkpoint
  -> observe result
  -> continue, pause, fail, or complete
```

Taskplane should keep the loop embedded in the product, following the
OpenClaw-style wrapper pattern:

```text
RunOrchestrator prepares task context, policy, provider, and exposed tools
  -> AgentExecutor owns turn/tool/session mechanics
  -> event bridge records Taskplane domain evidence
  -> RunService settles Run and Task outcomes
```

No framework owns Taskplane state. Framework ideas may inform the loop, but
SQLite repositories and Taskplane services remain the source of truth.

## Tool Scaffold Layer

MCP, browser/Playwright, skills, workspace coding tools, computer-use, and
creator connectors should be treated as shared execution scaffolding, not as
separate product shortcuts. Each family should enter through the same
descriptor, exposure, policy, session, artifact, and checkpoint concepts
defined in [AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md](AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md).

The agent execution layer should therefore reserve interfaces for:

- sandbox sessions for coding work
- browser sessions and Playwright-style evidence capture
- MCP clients and external tool/resource discovery
- skill/process prompt shaping
- creator artifact and publishing-preview connectors
- future computer-use sessions

Reserving these interfaces does not mean exposing the tools. Each family still
needs lane-specific acceptance before model-visible use.

## Core Components

### AgentExecutor

Owns session execution. It should stay small and event-shaped.

Responsibilities:

- accept an `AgentSessionRequest`
- run model/tool turns
- emit `AgentSessionEvent`
- return terminal `AgentSessionResult`
- avoid direct Task, Run, Decision, or Artifact mutation except through
  approved tool boundaries

Future extension:

- side-quest sessions for isolated subwork
- resumable sessions with persisted continuation targets
- streaming model/tool event support

### AgentSessionEvent Bridge

Owns projection from runtime events into product evidence.

Responsibilities:

- write RunSteps from model, plan, tool, checkpoint, and terminal events
- connect checkpoint events to RunCheckpoint and Decision records
- ensure event wording stays user-readable
- prevent noisy duplicate steps

Future extension:

- event replay for recovered sessions
- event compaction for long runs
- trace/span export if needed later

### AgentCheckpointRecorder

Owns checkpoint persistence.

Current role:

- create tool-permission checkpoints
- create resume checkpoints
- write linked pending RunSteps
- keep payloads versioned and restart-safe

Future role:

- become the single command boundary for `checkpoint.created`
- validate checkpoint compatibility before resume
- attach Decision ids consistently
- support additional checkpoint kinds only after acceptance

### AgentToolRegistry

Owns executable Taskplane tools.

Responsibilities:

- enforce runtime policy as final authority
- execute task/domain/workspace tools
- create confirmation checkpoints for risky tools
- return structured `AgentToolResult`

Future extension:

- registry-compatible MCP resource/tool adapters
- sandbox provider tools
- richer structured results for diff artifacts, command output, and evidence

### Agent Tool Exposure Matrix

Owns what the model can see.

Rules:

- registry availability does not imply prompt exposure
- prompt exposure does not imply runtime permission
- provider-native schema exposure must use the same matrix as text prompts
- workspace patch/command tools stay unexposed until a separate decision
  accepts them

## Side Quests And Branching

Pi-style branching is useful, but only as a product-visible mechanism.

Taskplane may later support "side quests" for bounded subwork such as:

- gather extra workspace context
- draft an alternate plan
- retry a failed tool with adjusted input
- inspect a patch before promotion
- ask for missing human input

Side quests must not become hidden autonomous tasks. Each branch should have:

- parent Run or AgentSession id
- purpose
- policy snapshot
- visible outcome
- artifacts or observations promoted back to the parent session

## Replay And Idempotency

LangGraph-style durability matters more than graph syntax.

Future resume behavior should follow these rules:

- replay should not repeat side effects
- mutating tools need idempotency keys or existing-state checks
- command and patch execution must be represented by checkpoints and artifacts
- stale checkpoint payloads fail visibly
- run recovery should prefer explicit "cannot resume safely" wording over
  guessing

## Sandbox Provider Boundary

OpenHands, SWE-agent, Plandex, and smolagents all point to the same conclusion:
code execution needs an environment boundary before it needs a smarter prompt.

Future code-agent mode should start with a disabled-by-default sandbox provider
interface:

```text
SandboxProvider
  -> prepare workspace
  -> expose bounded tools
  -> execute structured command/edit actions
  -> return artifacts, diffs, logs, and status
  -> dispose or persist sandbox state
```

The first implementation should prefer local container or equivalent isolation.
Host-process arbitrary shell is not an acceptable code-agent foundation.

## Coding And Creator Automation Lanes

Taskplane should treat AI programming and creator/self-media work as two
product lanes that share the same execution spine.

Coding lane:

- workspace context gathering
- patch planning
- sandboxed edit actions or staged diff generation
- targeted `test` / `lint` checks under explicit command policy
- patch artifacts and risk summaries
- Decision review before promotion

Creator lane:

- source/context gathering
- outline, script, post, and asset checklist drafting
- artifact generation and versioning
- review checkpoints for tone, claims, brand fit, and publication readiness
- no external posting or credential-bearing connector action until a separate
  connector decision accepts it

Both lanes should still settle into Taskplane objects: RunSteps for trace,
Artifacts for useful outputs, Decisions for human judgment, Timeline for
causality, and Task state for recovery or closeout.

## Human Feedback Routing

CrewAI-style human feedback should map to Taskplane Decisions, not a separate
agent inbox.

Use Decisions for:

- approving local writes or commands
- selecting among plans
- providing missing context
- accepting or rejecting generated artifacts
- deciding whether to continue a paused run

The agent should pause at these points. It should not simulate approval or
continue through ambiguous risk.

## MCP And External Tools

MCP is a future connector boundary, not a permission system.

If Taskplane adds MCP later:

- discovered tools start hidden
- each tool gets a registry descriptor
- each tool gets exposure rules
- each tool gets runtime policy checks
- credential-bearing connectors require separate Decisions or configuration
- external posting/email/calendar/social tools remain out of scope until a
  dedicated decision accepts them

## Suggested Build Order

1. Keep Slice 0 accepted and docs aligned.
2. Define shared tool scaffold contracts for descriptors, exposure policy,
   execution policy, sessions, artifacts, and checkpoints.
3. Define `SandboxProvider` types behind a disabled feature flag. Initial
   disabled-by-default contracts now exist in
   `src/shared/agent-sandbox-provider.ts`.
4. Add sandbox smoke tests using a temporary workspace and no credentials.
   `TempWorkspaceSandboxProvider` now covers isolated staging-root preparation
   and cleanup without command execution or source workspace mutation.
5. Add a coding-agent patch artifact path before any file promotion.
6. Make checkpoint events the command boundary for checkpoint creation.
7. Add event replay/compaction tests for longer sessions.
8. Add browser/Playwright read-only evidence capture after scaffold contracts
   exist.
9. Add skills/process prompt shaping after it is clear skills cannot grant
   tool authority by themselves.
10. Add MCP safe-read adapters after discovery, exposure, and runtime policy
   are split.
11. Add creator artifact/review lane after coding patch review proves the
   artifact/Decision flow.
12. Add side-quest session records only after parent/child visibility is
   designed.

## Non-Goals Until Accepted

- always-on autonomy
- cron or scheduled autonomous work
- messaging-channel execution
- browser/computer-control tools
- arbitrary shell
- host-process code-agent mode
- skill marketplace
- external posting/email/calendar/social tools
- GitHub mutation tools
- hidden agent-owned task state

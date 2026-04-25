# Agent Execution Reference Architecture Assessment

## Status

Accepted as the evaluation layer before expanding Taskplane's agent execution
runtime beyond the current local acceptance gate.

This document should be read before using
[AGENT_EXECUTION_LAYER_V2_DECISION.md](AGENT_EXECUTION_LAYER_V2_DECISION.md) to
implement larger runtime changes.

## First-Principles Product Chain

Taskplane's agent execution layer exists to turn a Task into recoverable work,
not to become a generic autonomous agent shell.

The product chain is:

```text
Task context
  -> Run request
  -> Agent session
  -> Plan
  -> Tool / observation loop
  -> Checkpoint / Decision when risk or uncertainty appears
  -> Artifact / Timeline evidence
  -> Task recovery, continuation, or closeout
```

The control plane must stay visible:

- `Task` owns meaning, priority, recovery, blockers, dependencies, criteria,
  and closeout context.
- `Run` owns one execution attempt and its observable trace.
- `Decision` owns human judgment and approval.
- `Artifact` owns durable useful output.
- `Timeline` owns user-readable causality.

Therefore the execution layer should optimize for:

1. **Recoverability**: a run can pause, resume, fail safely, or explain why it
   cannot continue.
2. **Policy gates**: registry availability, prompt/schema exposure, and runtime
   execution permission are separate decisions.
3. **Human control**: higher-risk actions create checkpoints and Decisions
   before mutating task or workspace state.
4. **Evidence**: outputs become artifacts, timeline events, or completion
   evidence; they are not buried in raw logs.
5. **Provider portability**: provider-native tool calls normalize into the same
   Taskplane proposal/event contract.
6. **Local-first safety**: workspace and credential access should start
   narrower than the model's apparent capability.

## Recommendation

Do not adopt one framework wholesale for v2.

Instead, keep a Taskplane-native runtime and selectively borrow mature patterns:

- **LangGraph / Microsoft Agent Framework** for durable event/workflow concepts.
- **OpenHands / SWE-agent / Plandex** for code-workspace safety, diff review,
  command containment, and coding-agent ergonomics.
- **MCP** for future tool/resource interoperability vocabulary.
- **CrewAI / AutoGen-style systems** for later multi-agent role patterns, not
  for the first v2 runtime.
- **OpenClaw-like local autonomous agents** as a cautionary reference for
  sandboxing, permission defaults, and remote exposure risks.

The next implementation should continue the current v2 direction:

1. typed runtime events
2. event-to-run-step mapping
3. restart-safe checkpoint/resume contract
4. explicit tool exposure matrix
5. only then consider narrow user-requested workspace write or command UI
   opt-ins

## Evaluation Criteria

References are useful only when they improve Taskplane's product chain. Each
framework or protocol is evaluated against these criteria:

1. **Control-plane fit**: can Task, Run, Decision, Artifact, and Timeline remain
   the user-visible source of truth?
2. **Durability**: can a run pause, resume, recover from process failure, and
   avoid repeating side effects?
3. **Tool boundary clarity**: does it separate tool definition, model exposure,
   execution policy, and user consent?
4. **Sandbox posture**: does it assume host access, container isolation, remote
   isolation, or a selectable model?
5. **Human judgment**: can uncertain or risky actions stop at a reviewable
   checkpoint instead of becoming silent mutations?
6. **Observability**: can execution be summarized as product evidence, not just
   raw logs?
7. **Local desktop fit**: can it run without introducing a heavy hosted control
   plane or a second product model?
8. **Implementation cost**: does adopting it now reduce risk, or does it
   increase coupling before the product needs that power?

## Reference Matrix

| Reference | Mature Pattern To Learn | Fit For Taskplane | What Not To Copy |
| --- | --- | --- | --- |
| LangGraph | Durable execution, human-in-the-loop, stateful workflow graph, streaming and persistence concepts | Strong reference for runtime event spine, resumable nodes, and explicit state transitions | Do not force Taskplane tasks into a graph DSL before product flows need graph authoring |
| Microsoft Agent Framework / AutoGen lineage | Separation between agents and workflows, type-safe routing, checkpointing, session state, telemetry | Strong reference for distinguishing open-ended agent work from explicit workflow steps | Do not import enterprise abstraction layers before local desktop flows justify them |
| OpenHands | Sandbox provider model for code/file/command execution; Docker vs process vs remote tradeoffs | Strong reference for future workspace write/command isolation | Do not run broad host tools by default; Taskplane should keep write/command registry-only until UI opt-in |
| SWE-agent | Agent-computer interface for coding tasks and issue-to-patch flow | Useful reference for future code-agent UX, patch loops, test feedback, and repository task framing | Do not make GitHub issue fixing the center of Taskplane; Task remains broader than code issues |
| Plandex | Long-task planning, multi-file diff review, terminal coding workflow, user-reviewed changes | Useful reference for future document/code patch review surfaces | Do not require terminal-first operation or a separate planning object model that bypasses Task/Run |
| CrewAI | Agent roles, crews, flows, memory, task processes, human-in-the-loop triggers | Later reference for multi-agent collaboration or team-like task decomposition | Do not introduce multiple autonomous roles before single-session recovery is robust |
| MCP | Standard vocabulary for tools/resources/prompts and external server interoperability | Strong future reference for tool contracts and resource exposure | Do not treat any MCP tool as safe merely because it is discoverable; Taskplane policy gates still apply |
| OpenClaw-like local autonomous agents | Local-first always-on agents, skills, gateways, messaging integrations, sandbox configuration pressure | Useful as a cautionary reference for permission defaults, marketplace/tool risk, and remote gateway exposure | Do not copy always-on autonomy, broad host access, or remote tool exposure into the alpha execution layer |

## Adopted Architecture Principles

### 1. Taskplane Runtime Before Framework Runtime

Taskplane should own the runtime contract:

```text
AgentSessionEvent
  -> event-to-run-step mapper
  -> checkpoint/Decision mapper
  -> artifact/timeline settlement
```

External frameworks can inspire individual mechanisms, but Taskplane should not
outsource control-plane semantics to them.

### 2. Explicit State Beats Hidden Agent Memory

Long-running agents need state, but the durable state should be Taskplane state:

- run steps
- checkpoints
- decisions
- artifacts
- task timeline
- agent session metadata

Framework memory can be useful later, but it must not replace visible task
recovery or evidence.

### 3. Tool Exposure Has Three Gates

Every tool belongs to three independent gates:

1. registered in `AgentToolRegistry`
2. exposed to prompts or provider-native schemas
3. executable under the current runtime policy

This is stricter than many agent frameworks, but it fits Taskplane's local-first
and human-control requirements.

### 4. Workflow Graphs Are Optional, Events Are Required

Graph-style orchestration is useful when the product needs branching,
multi-agent coordination, or repeated long workflows.

For v2, typed runtime events are enough. They let Taskplane persist,
summarize, and resume execution without prematurely adopting a full graph
runtime.

### 5. Code Execution Needs Sandbox Design First

Before Taskplane exposes code execution or broad command access, it needs a
separate sandbox decision:

- host process vs container vs remote sandbox
- workspace root containment
- environment variable policy
- network policy
- file write policy
- command allowlist
- output truncation and artifact promotion

The current `workspace.run_command` and `workspace.write_patch` registry-only
paths are useful acceptance slices, not a reason to expose coding-agent powers
yet.

## Implications For v2

### Keep

- Task/Run/Decision/Artifact/Timeline as the control plane.
- `AgentToolRegistry` as the only mutation path.
- provider-native normalization into Taskplane proposals/events.
- local acceptance through `npm run accept:agent-local`.
- workspace write/command prompt exposure deferred.

### Add Next

- event emission from the current local executor path
- event-to-run-step mapper integration in `RunOrchestrator`
- checkpoint payloads that carry a policy snapshot and continuation target
- resume tests that simulate app restart using persisted SQLite state
- a written sandbox decision before any coding-agent execution mode

### Defer

- multi-agent crews
- browser/computer control
- arbitrary shell commands
- external posting/email/calendar/social tools
- always-on autonomous scheduling
- automatic completion satisfaction or task closeout

## Framework-Specific Notes

### LangGraph

LangGraph is the closest conceptual match for durable stateful orchestration.
Its main lesson is not "use LangGraph now"; it is that durable execution,
human-in-the-loop state inspection, and long-running workflow state should be
first-class runtime concerns.

Taskplane should borrow the durable-state idea while keeping its own Task/Run
objects as the persisted state boundary.

Decision: learn from LangGraph's checkpointer, thread identifier, interrupt,
and replay discipline. Do not import a graph runtime into the alpha desktop app
until Taskplane has product-level graph authoring or repeated branching flows.

### Microsoft Agent Framework / AutoGen

Microsoft's current Agent Framework separates agent-style open-ended work from
workflow-style explicit routing and emphasizes session state, type safety,
checkpointing, telemetry, and human-in-the-loop scenarios.

Taskplane should mirror that separation: agent sessions can remain flexible,
while high-risk task transitions and workspace mutations should be explicit
workflow/checkpoint moments.

Decision: borrow the distinction between open-ended agents and explicit
workflows, plus middleware/telemetry/session-state vocabulary. Do not add a
multi-agent framework dependency before the single-agent session is restart-safe.

### OpenHands

OpenHands is most relevant to future coding-agent work. Its sandbox-provider
model highlights the real design question for code execution: where does code
run, with what isolation, and what host access is allowed?

Taskplane should not expose code execution until it has an explicit sandbox
decision. The current `test` / `lint` command runner is intentionally much
narrower.

Decision: use OpenHands as the primary future reference for sandbox-provider
choices: process is fast but unsafe, Docker gives host isolation, and remote
sandboxes change deployment shape. Taskplane should write its own sandbox
decision before any broad code-agent mode.

### SWE-agent

SWE-agent is useful for thinking about coding tasks as agent-computer
interfaces: issue context, repository inspection, patching, and feedback from
tests.

Taskplane should learn from that loop when it later designs code-task execution,
but code tasks should still feed Taskplane Runs, Artifacts, Decisions, and
Timeline events.

Decision: borrow the agent-computer-interface idea for future code work: the
agent should get a narrow, task-specific interface rather than a human terminal
with broad privileges.

### Plandex

Plandex is useful for long coding tasks and user-reviewed multi-file changes.
The relevant idea is disciplined planning plus diff review for large tasks.

Taskplane can reuse the pattern later for workspace patch review, but should
not adopt a separate terminal-first project model.

Decision: borrow cumulative diff review, model mixing, and stepwise autonomy
concepts for future code execution UX. Keep Taskplane's current Decision-based
patch approval as the durable review object.

### CrewAI

CrewAI's agents/crews/flows model is useful later if Taskplane adds
multi-role execution or process-template-driven agent collaboration.

For now, it is too much structure. Single-session recoverability is the
precondition.

Decision: defer crews, delegated roles, and hierarchical processes until
Taskplane can explain, resume, and audit one agent session cleanly.

### MCP

MCP is useful vocabulary for tools, resources, and prompts, and could become a
future interoperability layer for external context/tools.

Taskplane should keep MCP behind the same registry/exposure/policy gates. A
discoverable tool is not automatically a safe tool.

Decision: use MCP's vocabulary and schema discipline as a future compatibility
target, especially resources/prompts/tools and structured tool results. Keep
Taskplane's policy layer above MCP because MCP itself cannot enforce consent or
local file safety.

### OpenClaw-like Systems

OpenClaw-like always-on local agents are relevant because they expose the
permission problem sharply: broad local host access, gateway integrations,
skills, messaging, and remote control become powerful quickly.

For Taskplane, this is a reason to keep v2 conservative. Always-on autonomy and
broad host access are non-goals until the checkpoint, sandbox, and audit model
is much stronger.

Decision: treat this family as a risk reference, not an adoption target. The
useful lessons are channel allowlists, remote-input distrust, per-session
sandboxing, and clear warnings before host tools or messaging integrations are
enabled.

## Resulting Architecture Decision

Taskplane's v2 execution layer should be:

```text
RunService
  -> RunOrchestrator
  -> AgentExecutor
  -> AgentSessionEvent stream
  -> Event mappers
       -> RunStep
       -> Checkpoint / Decision
       -> Artifact / Timeline
  -> AgentToolRegistry
       -> tool definition
       -> prompt/schema exposure
       -> runtime policy
       -> optional human confirmation
```

This keeps external frameworks as reference architectures instead of product
dependencies. The implementation sequence should stay:

1. Wire current executor outputs through `AgentSessionEvent` handling.
2. Persist run steps from event mappers instead of ad hoc orchestrator branches.
3. Normalize checkpoint creation and resume through event handling.
4. Add restart-safe resume tests around persisted SQLite state.
5. Write a separate sandbox decision before exposing any broad code-agent,
   browser, computer-control, external-posting, or always-on agent mode.

## Immediate Next Task

The next code task is not to add a new framework. It is to finish Slice 0 by
wiring the already-created runtime event types and
`agent-runtime-event-step-mapper` into `RunOrchestrator`, while proving that the
existing text-only, provider-native safe-read, checkpoint, and denied-tool paths
still settle the same way.

## Sources Reviewed

- LangGraph overview:
  <https://docs.langchain.com/oss/python/langgraph/overview>
- LangGraph durable execution:
  <https://docs.langchain.com/oss/python/langgraph/durable-execution>
- Microsoft Agent Framework overview:
  <https://learn.microsoft.com/en-us/agent-framework/overview/>
- OpenHands sandbox overview:
  <https://docs.openhands.dev/openhands/usage/sandboxes/overview>
- SWE-agent repository:
  <https://github.com/swe-agent/swe-agent>
- Plandex project:
  <https://plandex.ai/>
- CrewAI documentation:
  <https://docs.crewai.com/>
- MCP tool specification:
  <https://modelcontextprotocol.io/specification/draft/server/tools>
- MCP specification:
  <https://modelcontextprotocol.io/specification/draft>
- OpenClaw repository:
  <https://github.com/openclaw/openclaw>

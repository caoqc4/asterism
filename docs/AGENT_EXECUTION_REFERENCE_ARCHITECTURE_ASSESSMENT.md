# Agent Execution Reference Architecture Assessment

## Status

Accepted as the reference-architecture assessment for Taskplane's agent
execution layer.

This document supersedes the first lightweight assessment. It separates
first-principles product requirements from framework-specific ideas, and it
must be read before using
[AGENT_EXECUTION_LAYER_V2_DECISION.md](AGENT_EXECUTION_LAYER_V2_DECISION.md)
for further execution-layer work.

## Why This Was Re-Assessed

The first assessment treated "OpenClaw-like" systems as one category and did
not evaluate Pi as its own reference. That was too coarse.

OpenClaw's public documentation describes an embedded Pi integration:
OpenClaw prepares sessions, tools, policies, channels, and runtime metadata,
then calls Pi through `runEmbeddedPiAgent` / `createAgentSession()` and bridges
Pi events into the OpenClaw agent stream. Pi is therefore not merely a flavor
of OpenClaw; it is a direct execution-layer reference.

The corrected evaluation is:

- **Pi** is a primary reference for the inner agent loop.
- **OpenClaw** is a primary reference for embedding that loop into a local,
  message-driven product with gateway, session, policy, and channel concerns.
- Other frameworks are evaluated for specific patterns, not as wholesale
  dependencies.

## First-Principles Product Chain

Taskplane's execution layer exists to turn a Task into recoverable work. It
should not become a generic autonomous shell.

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

The visible control plane must remain:

- `Task`: user meaning, priority, recovery, blockers, dependencies, completion
  criteria, and closeout context
- `Run`: one execution attempt and its observable trace
- `Decision`: human judgment, approval, deferral, and cancellation
- `Artifact`: durable useful output
- `Timeline`: user-readable causality

The execution layer is successful when it makes work recoverable, reviewable,
and auditable without hiding a second task system inside the agent runtime.

## Evaluation Criteria

Every reference was evaluated against these criteria:

1. **Control-plane fit**: can Task/Run/Decision/Artifact/Timeline remain the
   source of truth?
2. **Inner-loop clarity**: does it define the model/tool/observation/session
   loop cleanly?
3. **Durability**: can work pause, resume, recover, and avoid repeating side
   effects?
4. **Tool boundary**: does it separate tool definition, model exposure,
   execution policy, and user consent?
5. **Sandbox posture**: does it assume host access, container isolation, remote
   isolation, or a selectable sandbox?
6. **Human judgment**: can risky actions stop at a reviewable checkpoint?
7. **Observability**: can execution be projected into product-level evidence,
   not only raw logs?
8. **Provider portability**: does it avoid locking sessions to one model
   provider's exact message/tool format?
9. **Local desktop fit**: can it support a local-first product without imposing
   a hosted control plane?
10. **Implementation cost**: does adopting the idea now reduce risk, or does it
    increase coupling before Taskplane needs it?

## Reference Architecture Matrix

| Reference | What It Actually Optimizes For | Adopt For Taskplane | Do Not Copy Now |
| --- | --- | --- | --- |
| Pi / pi-agent-core / pi-coding-agent | Minimal inner loop, stateful session, tool execution, event streaming, message queues, provider abstraction, coding-agent extensions | Make Taskplane's `AgentExecutor` small, event-shaped, provider-normalized, and tool-registry driven | Do not copy broad Read/Write/Edit/Bash powers or agent self-extension before sandbox and Decision gates exist |
| OpenClaw | Embedding Pi into a persistent messaging gateway with sessions, channels, skills, custom tools, policy filtering, compaction, auth failover, event streams | Learn embedding architecture: prepared run, session lanes, event bridge, policy-filtered tool set, channel-aware output shaping | Do not copy always-on autonomy, messaging channels, remote gateways, cron, broad host access, or skill marketplaces into alpha |
| LangGraph | Durable graph/workflow execution with checkpoints, interrupts, persistence, deterministic replay, and human-in-the-loop | Borrow durability concepts: checkpoint IDs, replay-safe side effects, pause/resume semantics | Do not force Taskplane into a graph DSL until product users need workflow authoring |
| Microsoft Agent Framework / AutoGen lineage | Explicit split between agents and workflows, session state, middleware, telemetry, checkpoint storage, human-in-the-loop workflows | Borrow the agent-vs-workflow distinction and storage-pluggable checkpoint model | Do not import enterprise workflow layers before the local single-session loop is stable |
| OpenHands | Software-agent platform with sandbox providers, remote/local workspace abstractions, event callbacks, lifecycle control | Primary reference for future code-execution sandbox design | Do not expose arbitrary code/file/command execution in Taskplane until a sandbox decision exists |
| SWE-agent | Agent-computer interface for software tasks: specialized file viewer, edit command, lint/test feedback, benchmarkable issue-to-patch loop | Borrow the ACI idea: narrow task-specific tools outperform generic terminals | Do not make GitHub issue fixing the center of Taskplane; Taskplane tasks are broader |
| Plandex | Terminal coding workflow for large multi-file tasks, context management, cumulative diff review, configurable autonomy | Borrow planning + diff-review ergonomics for future workspace patch mode | Do not add a separate terminal-first plan object that bypasses Task/Run/Decision |
| CrewAI | Multi-agent crews, flows, event-driven workflow state, persistence, human feedback decorators | Later reference for process-template-driven collaboration and HITL routing | Do not introduce crews before one-agent session recovery is robust |
| MCP | Standard protocol for tools/resources/prompts, schemas, structured tool results, host/client/server boundaries, consent guidance | Future compatibility layer for external tools/resources; useful naming/schema discipline now | Do not treat discovered MCP tools as safe; Taskplane policy must sit above MCP |
| OpenAI Agents SDK | Agents, tools, handoffs, guardrails, sessions, tracing, hosted/sandbox tools | Borrow guardrail boundary vocabulary and tracing/span shape | Do not depend on SDK guardrails for built-in/hosted tools; Taskplane needs registry-level policy |
| Google ADK | Event-backed session state, tool/callback contexts, state deltas, session services | Borrow "state changes must flow through events" principle | Do not adopt ADK as runtime; Taskplane already owns domain state |
| Pydantic AI | Typed agent interface plus durable integrations through Temporal/DBOS/Prefect/Restate | Borrow durable-execution integration posture and typed output validation | Do not add a Python durable runtime underneath Electron for v2 |
| smolagents | Small multi-step agents, CodeAgent vs ToolCallingAgent, callbacks, sandbox options | Borrow the small-core bias and explicit code-agent sandbox warning | Do not use code-as-action as the default Taskplane execution model |

## Primary Reference Notes

### Pi

Pi is the most important correction to the assessment.

Sources reviewed include Pi's generated docs for `@mariozechner/pi-agent-core`,
the `badlogic/pi-mono` repository, OpenClaw's `docs/pi.md`, PyPI metadata for
`pi-agent-core`, and Armin Ronacher's "Pi: The Minimal Agent Within OpenClaw".

Key architectural ideas:

- `pi-agent-core` is a stateful runtime for tool execution, message queuing, and
  event streaming.
- The agent state includes system prompt, active model, thinking level, tools,
  message history, and stream status.
- Pi emits granular events such as agent start/end, turn start/end, message
  start/update/end, and tool-related updates.
- Pi's design favors a tiny core and lets applications embed or extend the
  agent rather than forcing a large workflow framework.
- Pi sessions can carry custom application messages and extension state; the
  broader Pi coding-agent stack adds session persistence, branching,
  compaction, extensions, and skills.
- The Pi/OpenClaw integration is embedded in-process rather than subprocess or
  RPC-first, giving OpenClaw control over session lifecycle, event handling,
  custom tools, system prompts, auth profile rotation, and provider switching.

Taskplane decision:

- Adopt Pi's **small inner-loop shape**:

  ```text
  AgentSession
    -> model turn
    -> tool proposal
    -> policy check
    -> tool execution
    -> observation event
    -> next turn or terminal event
  ```

- Keep Taskplane's current `AgentSessionEvent` spine and extend it toward Pi's
  lifecycle/tool/message event shape.
- Keep provider-normalized sessions; do not tie session history to one provider
  format.
- Treat session branching as a future design input for "side quests" such as
  fixing a tool, gathering extra context, or trying an alternate plan without
  polluting the main Run.
- Do not copy Pi's broad coding powers until Taskplane has a sandbox decision.
  Pi's default Read/Write/Edit/Bash philosophy is powerful for coding agents,
  but Taskplane's alpha boundary requires registry/exposure/policy gates and
  Decisions before mutation.

Current Taskplane support boundary:

- Slice 0 implements Pi-like inner-loop ideas inside Taskplane-owned code:
  typed session events, event-to-RunStep projection, provider-normalized
  sessions, registry-driven tools, policy gates, checkpoint/Decision pauses,
  and restart-safe resume validation.
- Taskplane does **not** embed Pi as a runtime dependency, expose Pi's coding
  tool set, or claim compatibility with Pi session extensions.
- Pi-style branching, compaction, side quests, and richer message/event
  replay remain future design inputs, not current product capabilities.
- Pi coding-agent capabilities are still strategically required for
  Taskplane's target AI programming workflows. They should be reintroduced as
  Taskplane-owned sandboxed patch/artifact capabilities, not as direct Pi
  runtime embedding or unrestricted Read/Write/Edit/Bash host access.

### OpenClaw

OpenClaw is best understood as an embedding/product-shell reference around Pi.

Sources reviewed include OpenClaw's Agent Loop docs, Agent Runtime docs,
repository README, and `docs/pi.md`.

Key architectural ideas:

- OpenClaw's agent loop is described as intake -> context assembly -> model
  inference -> tool execution -> streaming replies -> persistence.
- Runs are serialized per session lane, with global lanes available for broader
  concurrency control.
- OpenClaw prepares workspace, skills, context files, system prompt sections,
  model/provider settings, and auth profile state before entering the Pi loop.
- It bridges Pi lifecycle/tool/assistant events into OpenClaw's own agent
  stream.
- Its tool architecture layers base coding tools, replacements, OpenClaw tools,
  channel tools, policy filtering, schema normalization, and abort wrapping.
- It also exposes the risk side of local autonomous agents: broad host access,
  messaging channels, cron, skills, remote gateways, and credential-bearing
  integrations become dangerous quickly.

Taskplane decision:

- Adopt the **prepared-run wrapper** idea:

  ```text
  RunOrchestrator prepares context, policy, provider, and tools
    -> AgentExecutor owns the model/tool loop
    -> Event bridge writes RunStep/Checkpoint/Decision/Artifact/Timeline
  ```

- Adopt session/global lane thinking later if Taskplane adds background or
  long-running runs.
- Adopt tool layering, but keep it stricter:
  registry availability, prompt/schema exposure, and runtime execution remain
  separate gates.
- Do not adopt messaging channels, cron, always-on execution, or broad host
  tools in v2.

### LangGraph

LangGraph is the clearest durability reference.

Sources reviewed include LangGraph durable execution and overview docs.

Key architectural ideas:

- Durable execution persists workflow progress at key points.
- Checkpointers and thread identifiers make a workflow instance resumable.
- Human-in-the-loop and long-running workflows are first-class use cases.
- Durable replay requires deterministic/idempotent design; side effects and
  non-deterministic work should be wrapped so they are not repeated on resume.
- Interrupts and commands provide pause/resume mechanics.

Taskplane decision:

- Adopt durable semantics, not the graph DSL:
  checkpoint IDs, resume targets, side-effect idempotency, and persisted
  execution history belong in Taskplane.
- `RunCheckpoint` should eventually carry enough structured state to resume
  exactly one pending continuation.
- Tool results that mutate state should be idempotent or guarded by existing
  domain state checks.
- Defer graph authoring until users need visible workflow design.

### Microsoft Agent Framework / AutoGen Lineage

Microsoft Agent Framework is useful because it distinguishes open-ended agents
from explicit workflows.

Sources reviewed include Microsoft Agent Framework overview and workflow
checkpoint docs.

Key architectural ideas:

- Use agents for open-ended/conversational work; use workflows for explicit
  execution order and coordination.
- The framework emphasizes session-based state, type safety, middleware,
  telemetry, checkpoint storage, and graph-based multi-agent workflows.
- Checkpoint storage is pluggable: in-memory, local file, or Cosmos DB.

Taskplane decision:

- Keep Taskplane's agent loop flexible, but make risky transitions explicit
  workflow/checkpoint moments.
- Store checkpoints in Taskplane's SQLite domain model, not in a framework-owned
  checkpoint store.
- Borrow the "if a function can handle it, do that instead of an AI agent"
  discipline for domain services.
- Defer multi-agent orchestration until the single-agent loop can pause,
  resume, and explain itself.

### OpenHands

OpenHands is the strongest sandbox/code-execution reference.

Sources reviewed include OpenHands sandbox overview, runtime architecture docs,
SDK API sandbox docs, and project site/repository.

Key architectural ideas:

- Code execution is treated as a sandbox/workspace problem.
- OpenHands distinguishes Docker sandbox, process sandbox, and remote sandbox
  providers.
- Older runtime docs describe a client/server runtime that executes actions in
  the sandbox and returns observations.
- Remote workspaces can move infrastructure and lifecycle management to a
  hosted runtime API.

Taskplane decision:

- Before broad coding-agent mode, write a dedicated sandbox decision covering:
  host process vs Docker vs remote, workspace mounts, environment variables,
  network policy, command allowlist, output limits, artifact promotion, and
  teardown.
- Keep current `workspace.write_patch` and `workspace.run_command` registry-only
  slices as acceptance scaffolding, not as prompt-exposed capabilities.

### SWE-agent

SWE-agent is the strongest "interface design matters" reference for coding
tasks.

Sources reviewed include SWE-agent ACI docs, repository, and paper.

Key architectural ideas:

- SWE-agent is built around an Agent-Computer Interface (ACI).
- ACI is the set of tools and interaction format that lets the agent operate a
  computer environment.
- SWE-agent's custom ACI includes specialized file viewing/editing and feedback
  mechanisms such as linting edits.
- Benchmarks show the interface itself affects software-engineering
  performance.

Taskplane decision:

- Design Taskplane tools as product-specific interfaces, not generic shell
  access.
- For future code work, provide file viewers, patch review, test feedback, and
  repo summaries shaped for agents.
- Keep code issue fixing as one task type, not the whole product.

### Plandex

Plandex is useful for large coding tasks and review ergonomics.

Sources reviewed include Plandex site, repository, and context-management docs.

Key architectural ideas:

- Plandex is a terminal-based coding agent for large projects/tasks.
- It emphasizes context loading/selection, large-file/project maps, model
  mixing, full-auto vs stepwise control, command execution, and cumulative diff
  review.
- Changes stay isolated until reviewed/applied.

Taskplane decision:

- Borrow cumulative diff review and configurable autonomy for future workspace
  patch mode.
- Keep review as Taskplane `Decision` objects, not a separate terminal-only
  approval model.
- Keep context management tied to Task/Run and workspace root policy.

### CrewAI

CrewAI is a later-stage orchestration reference.

Sources reviewed include CrewAI Flows, Flow persistence, and human-feedback
docs.

Key architectural ideas:

- Flows provide structured event-driven workflows with state, routers, branches,
  persistence, and resume.
- `@human_feedback` can pause execution, collect feedback, and resume from a
  pending flow.
- Crews/tasks/processes support multi-agent collaboration.

Taskplane decision:

- Borrow human-feedback routing ideas for future Decision UX.
- Borrow process-template-to-flow thinking only after Taskplane has repeated
  user workflows that justify it.
- Do not introduce crews/multi-role agents before one-agent recovery is stable.

### MCP

MCP is a protocol reference, not a safety boundary by itself.

Sources reviewed include the MCP specification and current tools specification.

Key architectural ideas:

- MCP defines host/client/server boundaries and exposes resources, prompts, and
  tools.
- Tools have names, descriptions, input schemas, optional output schemas, and
  structured/unstructured results.
- The spec explicitly warns that tools can represent arbitrary code execution;
  hosts should provide consent, authorization, visibility, access controls,
  timeouts, validation, and audit logging.
- Tool annotations must be treated as untrusted unless from trusted servers.

Taskplane decision:

- Adopt MCP-compatible naming/schema discipline where useful.
- Treat MCP servers as external tool providers behind `AgentToolRegistry`.
- Apply Taskplane policy above MCP discovery:
  a discovered tool is not exposed, executable, or trusted by default.

## Secondary Reference Notes

### OpenAI Agents SDK

Useful for guardrail and tracing vocabulary.

Sources reviewed include official Agents SDK intro, guardrails, sessions, and
tracing docs.

Key architectural ideas:

- Agents, tools, handoffs, sessions, guardrails, tracing, and MCP support are
  first-class SDK concepts.
- Tool guardrails wrap custom function tools before/after execution.
- The docs explicitly note guardrail boundary limits: handoffs, hosted tools,
  and built-in execution tools do not all pass through the same tool guardrail
  pipeline.

Taskplane decision:

- Borrow guardrail vocabulary and tracing/span shape.
- Do not rely on framework guardrails as the source of truth. Taskplane's
  registry/exposure/policy gates remain mandatory.

### Google ADK

Useful for event-backed state mutation.

Sources reviewed include ADK runtime/session state docs.

Key architectural ideas:

- State changes made inside callbacks/tools are routed into event actions and
  persisted by the session service when events are appended.
- Direct session-state mutation outside the managed event lifecycle is
  discouraged because it bypasses audit history, persistence, thread-safety, and
  timestamps.

Taskplane decision:

- This directly supports Taskplane's event-spine direction:
  state changes should become events first, then persisted domain objects.
- Keep Taskplane's SQLite repositories as the durable state layer.

### Pydantic AI

Useful for typed agents and durable integration posture.

Sources reviewed include Pydantic AI durable execution docs and core agent
docs.

Key architectural ideas:

- Durable agent execution is supported through Temporal, DBOS, Prefect, and
  Restate.
- The integrations use public interfaces and serve as references for other
  durable systems.
- Pydantic AI emphasizes typed outputs, tools, streaming, MCP, and agent graphs.

Taskplane decision:

- Borrow typed validation and durable-integration boundaries.
- Do not introduce a Python runtime dependency for v2.

### smolagents

Useful as a small-core/code-agent contrast.

Sources reviewed include Hugging Face smolagents docs and repository.

Key architectural ideas:

- Agents inherit from a multi-step loop.
- `CodeAgent` writes actions as Python code; `ToolCallingAgent` uses JSON-style
  tool calls.
- It supports callbacks, managed agents, run summaries, final answer checks,
  and sandbox backends such as Docker or Pyodide/Deno WebAssembly.

Taskplane decision:

- Borrow the small-core bias and explicit distinction between code actions and
  tool calls.
- Do not make code-as-action the default Taskplane execution mode.

## Adopted Taskplane Reference Model

Taskplane should use a native runtime, inspired most directly by Pi's inner loop
and OpenClaw's embedded-product wrapper:

```text
RunService
  -> RunOrchestrator
       prepares task context, provider config, policies, exposed tool schemas
  -> AgentExecutor
       owns one agent session loop
  -> AgentSessionEvent stream
       session.started
       plan.proposed
       model.completed / model.delta later
       tool.started
       tool.completed / tool.failed
       checkpoint.created
       session.paused / session.completed / session.failed
  -> Event mappers
       RunStep
       RunCheckpoint
       Decision
       Artifact
       Timeline
  -> AgentToolRegistry
       registry availability
       prompt/provider schema exposure
       runtime policy execution
       confirmation / Decision gate
```

This intentionally keeps framework ideas behind Taskplane domain objects.

## Adoption Decisions

### Adopt Now

- Pi-style small inner loop, but Taskplane-owned.
- OpenClaw-style embedding wrapper, but Taskplane control plane first.
- Typed `AgentSessionEvent` as the runtime event spine.
- Event-to-RunStep mapping as the first visible projection.
- Tool registry/exposure/policy as three independent gates.
- Provider-native tool calls normalized into Taskplane proposals/events.
- Decision-backed checkpoints before higher-risk mutations.

### Study Next

- Shared tool scaffold contracts for MCP, browser/Playwright, skills,
  computer-use, coding tools, and creator connectors before lane-specific
  exposure.
- Pi coding-agent patch/edit/test ergonomics behind a Taskplane
  `SandboxProvider`, patch artifacts, and Decision review.
- Pi session branching for future side quests and sub-runs.
- OpenClaw session lanes for future background/long-running execution.
- LangGraph durable replay/idempotency patterns for restart-safe resume.
- OpenHands sandbox-provider choices for future code-agent mode.
- MCP resource/tool schemas for external connector compatibility.
- CrewAI human-feedback routing for richer Decision UX.

### Defer

- Full graph workflow runtime.
- Multi-agent crews.
- Always-on autonomy or cron.
- Messaging-channel execution.
- Browser/computer-control tools.
- Arbitrary shell or broad workspace mutation.
- Agent self-extension or skill marketplace.
- External posting/email/calendar/social tools.
- Automatic completion satisfaction or task closeout.

## Immediate Implementation Implications

The next implementation work should stay on Slice 0:

1. Keep wiring current executor paths through `AgentSessionEvent` handling.
2. Normalize checkpoint creation through the same event pipeline.
3. Persist enough checkpoint payload to resume one pending action safely after
   app restart.
4. Add resume tests that rebuild services from persisted SQLite state.
5. Do not add a framework dependency until the event/checkpoint contract is
   stable.

After Slice 0, write a separate sandbox decision before broad code execution.

## Sources Reviewed

Primary sources and near-primary technical references:

- Pi agent core overview:
  <https://www.mintlify.com/badlogic/pi-mono/agent/overview>
- Pi monorepo:
  <https://github.com/badlogic/pi-mono>
- Pi coding-agent package:
  <https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent>
- OpenClaw Pi integration:
  <https://github.com/openclaw/openclaw/blob/main/docs/pi.md>
- OpenClaw agent loop:
  <https://docs.openclaw.ai/concepts/agent-loop>
- OpenClaw sandbox/runtime concepts:
  <https://docs.openclaw.ai/concepts/agent-runtimes>
- Armin Ronacher on Pi:
  <https://lucumr.pocoo.org/2026/1/31/pi/>
- LangGraph durable execution:
  <https://docs.langchain.com/oss/python/langgraph/durable-execution>
- Microsoft Agent Framework overview:
  <https://learn.microsoft.com/en-us/agent-framework/overview/>
- Microsoft Agent Framework checkpoints:
  <https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints>
- OpenHands sandbox overview:
  <https://docs.openhands.dev/openhands/usage/runtimes/overview>
- OpenHands SDK API sandbox:
  <https://docs.openhands.dev/sdk/guides/agent-server/api-sandbox>
- SWE-agent Agent-Computer Interface:
  <https://swe-agent.com/1.0/background/aci/>
- SWE-agent repository:
  <https://github.com/swe-agent/SWE-agent>
- Plandex project:
  <https://plandex.ai/>
- Plandex repository:
  <https://github.com/plandex-ai/plandex>
- Plandex context management:
  <https://docs.plandex.ai/core-concepts/context-management/>
- CrewAI Flows:
  <https://docs.crewai.com/en/concepts/flows>
- CrewAI Human Feedback in Flows:
  <https://docs.crewai.com/en/learn/human-feedback-in-flows>
- MCP specification:
  <https://modelcontextprotocol.io/specification/draft>
- MCP tools specification:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>
- OpenAI Agents SDK:
  <https://openai.github.io/openai-agents-python/>
- OpenAI Agents SDK guardrails:
  <https://openai.github.io/openai-agents-python/guardrails/>
- Google ADK session state:
  <https://adk.dev/sessions/state/>
- Pydantic AI durable execution:
  <https://pydantic.dev/docs/ai/integrations/durable_execution/overview/>
- Hugging Face smolagents:
  <https://huggingface.co/docs/smolagents/reference/agents>

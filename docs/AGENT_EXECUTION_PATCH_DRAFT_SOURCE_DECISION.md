# Agent Execution Patch Draft Source Decision

## Status

Accepted as the planning boundary before Taskplane lets any internal execution
path create a sandbox patch-review plan.

Read first:

- [AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md](AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md)
- [AGENT_EXECUTION_SANDBOX_DECISION.md](AGENT_EXECUTION_SANDBOX_DECISION.md)
- [AGENT_EXECUTION_LAYER_ROADMAP.md](AGENT_EXECUTION_LAYER_ROADMAP.md)
- [AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md](AGENT_EXECUTION_TOOL_SCAFFOLD_PLAN.md)

## Decision

Taskplane should introduce an **internal patch draft source** boundary before
any real sandbox patch-review plan can become `ready`.

The source is not a model-visible tool, UI action, or generic file-edit API. It
is an internal, typed producer contract that can hand the sandbox review
planner a proposed patch only after Taskplane can prove where the patch came
from, what workspace it targets, which checks should run, and how promotion
will stop at a Decision.

普通 `local_note` agent sessions must remain diagnostic-only. They may record
that sandbox patch review is blocked, but they must not carry a real patch
draft into `SandboxPatchReviewPlanningService.preview()`.

## First-Principles Rationale

A patch draft is the first moment where an agent's work becomes potentially
dangerous. Before the draft exists, the system is only planning or observing.
After the draft exists, Taskplane is handling a concrete proposal to change the
user's workspace.

Therefore the source of the draft must answer six questions:

1. **Authority**: Which internal component was allowed to create this draft?
2. **Scope**: Which run, task, workspace root, and file set does it target?
3. **Isolation**: Was the draft produced outside the host workspace or without
   mutating it?
4. **Evidence**: Which observations, logs, or model/tool events justify it?
5. **Verification**: Which targeted checks are requested, and why are they
   allowlisted?
6. **Promotion**: What human Decision must happen before the patch touches the
   workspace?

If any answer is missing, the correct state is `blocked`, not "try the patch
anyway."

## Reference Architecture Lessons

### Pi / OpenClaw

Pi is useful for a small inner loop: model turn, tool proposal, policy check,
tool execution, observation, next turn. OpenClaw's Pi integration is useful for
the embedding shell: prepare context, tools, policy, session metadata, and
event bridging before entering the loop.

Taskplane should copy the **embedding boundary**, not broad coding powers. A
patch draft source should sit after a prepared internal execution lane, not
inside ordinary note-writing output. The source should emit product events that
can become RunSteps and artifacts.

### OpenHands

OpenHands treats code execution as a sandbox/runtime concern. Its docs describe
Docker, process, and remote sandbox providers, with Docker as the recommended
isolated option and process mode as unsafe. Its runtime architecture sends
actions into a containerized execution server and returns observations.

Taskplane should adopt the provider boundary: draft-producing code work belongs
inside a selected sandbox provider or equivalent isolated backend. Host-process
draft production remains rejected for broad coding-agent mode.

### SWE-agent

SWE-agent's main lesson is the agent-computer interface: software agents do
better with narrow, purpose-built file, edit, navigation, and test feedback
interfaces than with generic terminals.

Taskplane should avoid a raw "write arbitrary files" draft source. The source
should produce a structured patch draft with changed files, diff preview, risk
summary, and targeted check intent.

### Plandex

Plandex emphasizes plans, context management, configurable autonomy, and a diff
review sandbox where changes accumulate before they are applied to the project.

Taskplane should borrow the isolated pending-change model. The patch draft
source should produce pending review material, not directly apply files.
Promotion remains a Taskplane Decision.

### LangGraph / Microsoft Agent Framework

Durable execution frameworks emphasize checkpointing, pause/resume, and
human-in-the-loop review. The relevant idea is not a graph DSL; it is that
long-running or risky work needs persisted state and resumable checkpoints.

Taskplane should keep draft source outputs idempotent and checkpoint-oriented.
The source output must be recoverable after restart and must not repeat side
effects during resume.

### MCP

MCP standardizes tool/resource boundaries, but its own security guidance puts
consent and tool invocation control at the host level.

Taskplane should treat future MCP or skill-originated patch proposals as
external source candidates, never as automatically trusted drafts.

## Source Categories

### Rejected For Now

- `local_note` model text output
- provider-native tool-call payloads from normal agent runs
- host-process `workspace.write_patch`
- host-process `workspace.run_command`
- user-pasted arbitrary diff without a source record
- MCP tool output without Taskplane policy wrapping

These can inform a future task or Decision, but they must not directly create a
ready sandbox patch-review plan.

### Candidate Sources

1. **Sandboxed coding session output**
   - Produced inside `SandboxProvider`.
   - Writes only to staging.
   - Emits structured changed-file and diff metadata.
   - Runs targeted checks through injected runner boundaries.

2. **Imported patch artifact**
   - A user or trusted connector imports a patch artifact.
   - Taskplane validates file paths and diff structure.
   - It still routes through sandbox checks and Decision promotion.

3. **Future branch/side-quest session**
   - A bounded sub-session tries an implementation path.
   - Its output becomes a candidate patch artifact.
   - Parent run sees only summarized evidence and reviewable artifacts.

4. **Future MCP or skill lane**
   - Only after connector-specific policy exists.
   - The external tool output must be normalized into Taskplane's patch draft
     contract before review.

## Proposed Contract

Future code should define a type similar to:

```ts
type SandboxPatchDraftSource = {
  sourceKind:
    | 'sandbox_session'
    | 'imported_patch_artifact'
    | 'side_quest_session'
    | 'connector_normalized_patch';
  sourceId: string;
  runId: string;
  taskId: string;
  workspaceRoot: string;
  patchDraft: {
    summary: string;
    files: string[];
    diff: string;
    riskSummary?: string | null;
  };
  requestedScripts: Array<'test' | 'lint'>;
  evidence: {
    observations: string[];
    commandSummaries: string[];
    modelSummary?: string | null;
  };
  policySnapshot: {
    noCredentialPassthrough: true;
    network: 'disabled' | 'allowlisted';
    promotion: 'decision_required';
  };
};
```

The source contract should be separate from `SandboxPatchReviewRunPlan`. The
planner consumes a validated source and produces `ready` or `blocked`; it does
not create the source.

## Required Validation

Before a source can feed a ready plan:

- `runId`, `taskId`, and `workspaceRoot` are present.
- `workspaceRoot` matches the configured selected workspace.
- every changed file is relative, normalized, unique, and inside the workspace.
- `diff` is non-empty and bounded for RunStep display.
- source kind is in the accepted list.
- requested checks are allowlisted (`test` / `lint` first).
- execution policy has no credential passthrough.
- promotion policy is `Decision` required.
- idempotency key includes source id, run id, task id, and check scripts.
- source evidence is summarized without exposing secrets.

## Implementation Plan

Completed boundary work:

1. `SandboxPatchDraftSource` now exists as a source-local type and validator.
2. Focused tests reject local-note, provider-native, host-process, unsafe path,
   credential-passthrough, non-Decision-promotion, and non-allowlisted check
   payloads.
3. `SandboxPatchReviewPlanningService.previewFromSource(source)` validates the
   source, optionally checks selected workspace identity, then calls the
   existing non-executing planner.
4. `previewLocalNoteDiagnostic()` remains blocked-only.
5. Source identity is now persisted into request audit, idempotency keys,
   session manifest summaries, and sandbox patch-review artifact metadata.

Next implementation work:

6. Design the first real producer:
   sandboxed coding session output.
7. Only after a real producer exists, consider a UI-visible coding run option.

## Acceptance

- no ordinary local agent run can pass a real patch draft
- no provider-native payload can create a ready plan by itself
- no host-process tool can become a draft source for this lane
- every ready plan has a source id, workspace root, idempotency key, and
  Decision promotion path
- sandbox checks and patch artifacts remain non-live unless an explicit runner
  is supplied by an internal execution path
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
- Plandex official site:
  <https://plandex.ai/>
- Plandex pending changes docs:
  <https://docs.plandex.ai/core-concepts/reviewing-changes>
- LangGraph durable execution:
  <https://docs.langchain.com/oss/python/langgraph/durable-execution>
- Microsoft Agent Framework 1.0:
  <https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/>
- MCP specification:
  <https://modelcontextprotocol.io/specification/draft>

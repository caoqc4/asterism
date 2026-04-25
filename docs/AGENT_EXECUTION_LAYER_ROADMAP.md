# Agent Execution Layer Roadmap

## Purpose

This roadmap turns the current alpha baseline into the next implementation
sequence for Taskplane's real agent execution layer.

The front task-management loop is now covered enough to treat Task as the
control plane:

- capture or create work
- attach context, blockers, dependencies, criteria, Decisions, Runs, and
  Artifacts
- move work through recovery and closeout
- inspect and continue work from Home, Tasks, Decisions, and Runs

The next phase should not add a generic chat or shell runner. It should build a
Taskplane-native executor that can safely do longer work while preserving Task,
Run, Decision, Artifact, and Timeline semantics.

## Current Baseline

Implemented and locally verified:

- text runs through `RunOrchestrator`
- agent runs through a `LocalAgentExecutor` boundary
- persisted run steps, checkpoints, agent sessions, and capability metadata
- read-only workspace search/read behind per-run opt-in
- packaged read-only workspace agent pass
- confirmation-gated `workspace.write_patch` at code/integration level
- patch approval resumption through Decisions
- patch guardrails for local file-write policy, workspace root containment,
  expected files, diff preview, no pre-approval mutation, and normal-run
  fallback when a model proposes patch steps

Still intentionally deferred:

- exposing workspace writes in prompts or task UI
- `workspace.run_command`
- browser/computer-control tools
- social/media/email posting tools
- autonomous multi-run scheduling

## Execution Layer Shape

The next runtime should have five clear layers:

1. `RunService`
   Public settlement boundary. It owns Run status, task annotations, final
   artifacts, and recovery wording.

2. `RunOrchestrator`
   Adapter from product intent into executor sessions. It assembles context,
   policy, provider capability, and writes product-level run steps.

3. `AgentExecutor`
   Runtime session boundary. It plans, loops, resumes, pauses, and reports
   typed events without directly mutating Taskplane domain state.

4. `AgentToolRegistry`
   Only allowed path from agent execution into Taskplane or the local
   workspace. Every mutating tool must go through policy, checkpoints, and
   domain services.

5. Provider adapters
   Normalize text-only planning, structured tool calls, streaming, and provider
   limits into explicit runtime capabilities.

## Next Implementation Slices

### Slice 1: Approval UX Readiness

Goal: make the existing `workspace.write_patch` checkpoint understandable before
any user-facing write opt-in exists.

- keep the tool absent from model prompts and task run UI
- keep local write disabled in normal runs
- use `npm run accept:workspace-patch` as the repeatable local approval exercise
  that starts from a real pending Decision and approves the checkpoint
- confirm Runs and Decisions explain the affected files, preview, risk, and
  consequence
- update the alpha checklist with the exact repeatable command or fixture

Acceptance:

- no local file changes before approval
- approved Decision resumes and resolves the checkpoint
- deferred or cancelled Decision settles the run clearly
- UI never implies command execution is available

### Slice 2: Provider Capability Truthfulness

Goal: stop treating every model provider as equally agent-capable.

Started:

- Tasks and Runs agent forms preview provider/session capability before
  triggering a run.
- The preview names text-only planning, per-run read-only workspace context,
  structured tool-call unavailability, and patch/command unavailability.

Remaining:

- keep `textOnlyPlanning`, `structuredToolCalls`, `fileContext`, `streaming`,
  and `longRunningSessions` as explicit session metadata
- make Replicate/text-only runs explain that they can draft and plan but do not
  have reliable structured tool calling
- add provider-routing tests around capability calculation

Acceptance:

- default local runs show honest capability copy
- read-only workspace opt-in updates `fileContext=true`
- provider limitations do not silently enable tool plans

### Slice 3: Domain-Shaped Task Tools

Goal: let the agent help advance Taskplane tasks without touching the local
workspace.

Candidate tools:

- `task.update_next_step` (implemented as a registry-level service-routed tool;
  not exposed in prompts or normal agent plans)
- `task.create_completion_criterion`
- `source_context.create`
- `decision.draft`

Rules:

- one tool per slice
- service-level route only, no direct repository mutation from the registry
- run-step observation for every call/result
- confirmation required when the action changes task direction materially

Acceptance:

- the task timeline explains the change
- Home recovery reflects the change
- failed tool calls leave retryable run output

### Slice 4: Command Allowlist Decision

Goal: design before implementing `workspace.run_command`.

The decision must specify:

- allowed command families
- cwd and workspace-root containment
- environment variable policy
- timeout and output truncation
- no network by default unless explicitly allowed
- no destructive commands in the first slice
- checkpoint requirements

Acceptance:

- a decision doc exists and is accepted
- no command execution is exposed until the allowlist is implemented and tested

## Near-Term Recommendation

Do Slice 1 next. It closes the gap between the existing write-patch backend and
the future UI/prompt exposure decision without increasing agent autonomy.

Only after that should Taskplane choose between:

- adding safe domain-shaped task tools, or
- designing the command allowlist for coding-agent workflows.

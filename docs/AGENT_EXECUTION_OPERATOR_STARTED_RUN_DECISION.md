# Agent Execution Operator-Started Run Decision

## Status

Accepted as the execution-layer control contract for the first manual Browser
Evidence Run entrypoint.

This document defines the shared contract for manually started internal runs.
The first concrete Browser Evidence smoke entrypoint is now wired through IPC
and the Runs page. It still does not add a scheduler path, provider call, or
model-visible tool.

Read with:

- [AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md](AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md)
- [CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md](CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md)
- [AGENT_EXECUTION_SANDBOX_DECISION.md](AGENT_EXECUTION_SANDBOX_DECISION.md)

## First-Principles Position

Some execution work is neither a normal model run nor a background automation.
It is an operator-started internal run: the user presses an explicit control,
Taskplane performs bounded local/runtime work, and the result is recorded as
RunSteps and Artifacts for review.

This exists to avoid three failure modes:

- hiding runtime power inside prompts
- making one-off UI buttons that each invent their own safety rules
- letting scheduler or model exposure creep into lanes that are still under
  review

The shared boundary is:

```text
operator intent -> validated internal run request -> Run -> RunSteps/Artifacts
```

## Accepted Contract

The first contract is implemented in
`src/shared/types/operator-started-run.ts`.

Supported kinds:

- `browser_evidence_smoke`
- `code_agent_preview`
- `sandbox_patch_review`

Required invariants:

- `operatorConfirmed: true`
- `modelExposure: hidden`
- `schedulerAllowed: false`
- `providerCallAllowed: false`
- descriptor id must match the run kind
- execution policy must validate against the shared tool scaffold

Kind mapping:

- `browser_evidence_smoke` -> `browser.readonly_evidence`
- `code_agent_preview` -> `workspace.staged_patch`
- `sandbox_patch_review` -> `workspace.staged_patch`

## Why This Comes Before More UI

Browser Evidence now has a manual smoke, persistence, and Run review card. The
next temptation is to add a browser-specific button. That would work once, but
it would duplicate safety logic already needed by Code Agent and sandbox patch
review.

The better primitive is a generic operator-started run request. Each UI surface
can later create one of these requests, but the safety invariants stay in one
shared validator.

## Current Decision

Do not expose a new generic operator-started UI yet.

The first concrete path is Browser Evidence Tier 1 because it is the smallest
runtime lane: manual start, isolated local fixture, screenshot/text artifacts,
no provider calls, no scheduler, no model-visible browser tool, and no
mutation.

## Implementation Status

The first service entry is implemented in
`src/main/domain/run/operator-started-run-service.ts`.

Current behavior:

- validates `OperatorStartedRunRequest`
- implements only `browser_evidence_smoke`
- creates an `agent` Run with operator-started instructions
- records an accepted-plan RunStep
- calls an injectable browser-evidence smoke executor
- persists captured evidence through `BrowserEvidencePersister`
- marks the Run completed on capture
- writes a failed tool-result RunStep and marks the Run failed on blocked or
  failed browser evidence
- is exposed through `run:triggerOperatorStarted`
- is available from Runs / Action Desk as `运行 Browser Evidence Smoke`

Still deferred:

- generic operator-started UI
- scheduler starts
- provider/model calls
- Code Agent / sandbox patch review migration onto this service

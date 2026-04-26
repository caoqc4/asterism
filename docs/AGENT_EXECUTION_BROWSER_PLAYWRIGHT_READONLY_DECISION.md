# Agent Execution Browser / Playwright Read-Only Decision

## Status

Accepted as the next execution-layer planning target after the Code Agent
staged-patch lifecycle UI slice.

This decision does not enable browser tools in prompts, provider-native schemas,
or runtime execution. It defines the boundary for a future read-only browser
lane so Taskplane can add web evidence safely after the sandboxed coding lane.

## First-Principles Position

Taskplane's browser lane exists to collect evidence for a task, not to become
ambient desktop control.

For AI programming, browser evidence means inspecting local dev servers,
documentation pages, app screenshots, console-visible failures, and page text.
For creator and self-media work, browser evidence means collecting page facts,
screenshots, links, and claim-checking context before drafting or publishing.

The first browser lane must therefore be:

- read-only
- isolated from the user's normal browser profile
- credential-free by default
- artifact-producing
- interruptible and reviewable from Run/Task
- hidden from model-visible tools until a separate exposure decision accepts it

## Reference Lessons

- Pi-style agent loops reinforce the need for small tool steps, observations,
  and checkpoints.
- OpenClaw-style embedding reinforces that browser/runtime events should flow
  back into the host product's task and run objects.
- Playwright is the right implementation reference for deterministic page
  inspection, screenshots, traces, and local app validation.
- MCP remains a separate connector boundary; browser evidence should not depend
  on an MCP server being trusted.

## Accepted Boundary

The first lane is `browser.readonly_evidence`.

Allowed later:

- open an allowlisted URL in an isolated browser session
- inspect page title, URL, selected visible text, and basic DOM evidence
- capture screenshot, trace, or extracted text artifacts
- run bounded Playwright-style read-only checks
- inspect local dev servers when the operator explicitly starts the run

Not allowed in this lane:

- login with the user's normal browser profile
- reading or exporting cookies
- typing into credential fields
- posting, publishing, buying, sending, deleting, submitting, or mutating remote
  state
- bypassing CAPTCHA, paywalls, or site safety controls
- exposing browser control to normal agent prompts
- background or scheduled browser runs

## Policy Shape

The existing scaffold descriptor remains the source of truth:

- descriptor id: `browser.readonly_evidence`
- family: `browser_playwright`
- lifecycle: `reserved`
- session kind: `browser`
- risk: `external_read`
- default exposure: `hidden`
- artifact kinds: `screenshot`, `browser_trace`, `browser_extract`
- credential policy: `explicit_config`
- network policy: allowlisted only

The default policy can allow network only inside a browser session boundary, but
must still reject unrestricted network and credential drift.

## Rollout Sequence

### B0: Keep Descriptor Hidden

Already implemented in `agent-tool-scaffold`.

Acceptance:

- `browser.readonly_evidence` remains reserved
- text prompt and provider-native exposure stay empty
- default policy is bounded and validates against the descriptor

### B1: Browser Evidence Contract

Add shared types only:

- `BrowserEvidenceRequest`
- `BrowserEvidenceResult`
- `BrowserEvidenceArtifact`
- `BrowserSessionPolicy`

These types should model URL, purpose, allowed evidence kinds, timeout,
network allowlist, output size, and artifact summaries.

Acceptance:

- no Playwright runtime is started
- no renderer UI is exposed
- tests prove mutation actions are not representable in the v1 request

### B2: Read-Only Preflight

Add a local preflight that reports whether the browser evidence lane is
configured, still hidden, and safe to keep disabled.

Acceptance:

- preflight never opens a browser
- preflight never calls the network
- Settings or Runs can later reuse the same summary

### B3: Isolated Runner Smoke

Only after B1/B2, add a manually invoked local smoke against a disposable local
HTML page or explicitly provided local dev URL.

Acceptance:

- isolated browser context
- no persistent profile
- screenshot/text artifacts only
- no remote mutation APIs
- no model-visible tool exposure

### B4: Task / Run Review Surface

Surface browser evidence as Run artifacts and Task timeline evidence.

Acceptance:

- evidence is reviewable from Run and Task
- failed page load or timeout creates readable recovery text
- rerun is manual and explicit

## Current Decision

Do not implement browser automation as an agent tool yet. The next code slice
should be B1: shared Browser Evidence Contract types and tests, with the
existing scaffold descriptor still hidden.


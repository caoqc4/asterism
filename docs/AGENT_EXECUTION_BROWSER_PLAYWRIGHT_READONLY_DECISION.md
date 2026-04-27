# Agent Execution Browser / Playwright Read-Only Decision

## Status

Accepted as the next execution-layer planning target after the Code Agent
staged-patch lifecycle UI slice.

This decision does not enable browser tools in prompts, provider-native schemas,
or runtime execution. It defines the first boundary for browser work so
Taskplane can add web evidence safely after the sandboxed coding lane, while
keeping room for controlled interaction later.

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

This is intentionally the first lane, not the final browser capability. A
useful browser agent eventually needs controlled interaction. The product risk
boundary should be action-tiered rather than blanket read-only forever.

## Reference Lessons

- Pi-style agent loops reinforce the need for small tool steps, observations,
  and checkpoints.
- OpenClaw-style embedding reinforces that browser/runtime events should flow
  back into the host product's task and run objects.
- Playwright is the right implementation reference for deterministic page
  inspection, screenshots, traces, local app validation, and later controlled
  interaction.
- MCP remains a separate connector boundary; browser evidence should not depend
  on an MCP server being trusted.
- Competitor/product references point to a broader but still gated browser
  model:
  - Codex uses isolated task environments and makes internet access an explicit
    environment decision, not an ambient power.
  - OpenClaw exposes a full browser surface, including snapshots, screenshots,
    clicks, typing, downloads, uploads, cookies/storage, credentials, remote CDP,
    and profile allowlists.
  - Hermes supports cloud browser providers, local Chrome/CDP attach, private
    URL local routing, visual/snapshot evidence, and live viewing.
  - Multica reinforces the runtime-registry pattern: browser capability should
    be a runtime capability, not hidden in a prompt.
  - CoWork OS uses a tiered web stack: search, lightweight fetch, browser tools,
    and scraping/anti-bot tools, with permissions and domain guardrails.
  - Vercel's `agent-browser` shows the value of an agent-oriented browser CLI:
    accessibility snapshots with refs, click/fill/type, screenshots, and live
    preview/pair browsing.
  - Microsoft Foundry's Browser Automation tool uses a sandboxed Playwright
    workspace and warns to use trusted sites, avoid sensitive actions, and build
    error handling for volatile pages.
  - Pause is a useful product-positioning signal for task-centric browsing and
    BYO-key local-first work, but its public site does not currently expose
    enough browser-tool permission detail to use it as a low-level boundary
    reference.

Public sources reviewed on 2026-04-27:

- OpenAI Codex agent internet access:
  https://developers.openai.com/codex/cloud/internet-access
- OpenClaw browser docs:
  https://docs.openclaw.ai/tools/browser
- Hermes Agent browser automation:
  https://hermes-agent.nousresearch.com/docs/user-guide/features/browser
- Multica docs:
  https://multica.ai/docs
- CoWork OS features / browser automation:
  https://coworkosapp.com/docs/features/
- Vercel `agent-browser`:
  https://github.com/vercel-labs/agent-browser
- Microsoft Foundry Browser Automation:
  https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/browser-automation
- Pause:
  https://www.pause.build/

## Accepted Boundary

The first lane is `browser.readonly_evidence`. The long-term browser family
should evolve in tiers.

The first-principles decision is that browser capability is not a single
permission. It is a ladder of state access and side-effect risk. Reading a
known URL, opening an isolated page for screenshots, clicking a local dev-server
button, using a logged-in work profile, and publishing external content are
different powers and must be represented by different Taskplane policies,
RunSteps, artifacts, and checkpoint rules.

### Tier 0: HTTP / Fetch Evidence

Use when a URL can be read without a browser.

Allowed later:

- fetch a known URL
- extract readable text
- capture response metadata and source URL

Boundary:

- no JS execution
- no cookies by default
- no form submission
- preferred before launching a browser

### Tier 1: Browser Read-Only Evidence

Allowed now as the first planned runtime lane:

- open an allowlisted URL in an isolated browser session
- inspect page title, URL, selected visible text, and basic DOM evidence
- capture screenshot, trace, or extracted text artifacts
- run bounded Playwright-style read-only checks
- inspect local dev servers when the operator explicitly starts the run

Not allowed in Tier 1:

- login with the user's normal browser profile
- reading or exporting cookies
- typing into credential fields
- posting, publishing, buying, sending, deleting, submitting, or mutating remote
  state
- bypassing CAPTCHA, paywalls, or site safety controls
- exposing browser control to normal agent prompts
- background or scheduled browser runs

### Tier 2: Controlled Browser Interaction

Needed for useful AI programming and creator workflows, but not enabled until a
separate decision accepts it.

Allowed later behind explicit per-run policy:

- click links/buttons on allowlisted origins
- type into non-sensitive fields
- select options, scroll, wait, and dismiss simple non-sensitive popups
- interact with local dev servers for QA
- produce screenshot, trace, console, network, and extracted-text artifacts

Boundary:

- no credential fields
- no file upload/download unless separately allowed
- no final submit/post/publish/purchase/delete without a checkpoint Decision
- no arbitrary page JavaScript by default; `evaluate` is a higher-risk
  diagnostic action
- every action emits a RunStep and can be stopped or rerun

### Tier 3: Authenticated / Real-World Action

Needed for some future workflows, but highest risk.

Allowed only after separate connector or browser-action decisions:

- attach to a user-approved browser profile or CDP session
- use existing login state to inspect work apps
- prepare drafts in authenticated systems
- perform submissions only after explicit Decision approval

Boundary:

- credential-bearing sessions require explicit config and visible session state
- cookies/storage export is not a normal tool
- MFA/CAPTCHA/payment/legal/medical/financial decisions hand off to the user
- external side effects produce preview artifacts and approval checkpoints

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

Status: implemented at shared-type level.

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
- request validation rejects mutation actions, credential use, non-isolated
  profiles, unrestricted network, off-allowlist URLs, oversized output, and
  excessive timeouts

### B2: Read-Only Preflight

Status: implemented at shared-helper level.

Add a local preflight that reports whether the browser evidence lane is
configured, still hidden, and safe to keep disabled.

Acceptance:

- preflight never opens a browser
- preflight never calls the network
- Settings or Runs can later reuse the same summary
- preflight reports configured origin count, hidden model exposure, no browser
  start, no network call, and the fact that the runtime remains reserved

### B3: Isolated Runner Smoke

Status: fixture contract implemented; runtime still deferred.

Only after B1/B2, add a manually invoked local smoke against a disposable local
HTML page or explicitly provided local dev URL.

Acceptance:

- isolated browser context
- no persistent profile
- screenshot/text artifacts only
- no remote mutation APIs
- no model-visible tool exposure
- fixture preparation does not start a browser, call a network, expose tools,
  or make mutation actions representable

### B4: Task / Run Review Surface

Surface browser evidence as Run artifacts and Task timeline evidence.

Acceptance:

- evidence is reviewable from Run and Task
- failed page load or timeout creates readable recovery text
- rerun is manual and explicit

## Current Decision

Do not implement broad browser automation as a normal model-visible agent tool
yet. B1 shared Browser Evidence Contract types, B2 preflight summary helpers,
and the B3 runner-smoke fixture contract are in place, with the existing
scaffold descriptor still hidden. Settings surfaces the preflight as read-only
diagnostics without starting a browser or calling the network. `npm run
manual:browser-evidence-fixture` now writes the local HTML fixture, request
JSON, and preflight JSON without starting a browser or making network calls.

The next code slice should be a real isolated Playwright smoke for Tier 1
evidence only: local fixture/dev-server URL, isolated profile, screenshot/text
artifacts, no credentials, no mutation, no model-visible tool exposure.

The next design slice should define Tier 2 controlled interaction policy in
parallel. Taskplane should support click/type/select on allowlisted,
non-sensitive flows once the policy is accepted; it should not remain
read-only forever, because AI programming QA and creator workflows both need
bounded interaction to be genuinely useful.

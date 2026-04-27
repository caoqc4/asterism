# Agent Execution Browser Controlled Interaction Decision

## Status

Draft decision for the post-Tier-1 browser lane.

This document does not enable browser interaction in prompts, provider-native
schemas, IPC, scheduler runs, or product UI. It defines the policy that must be
accepted before Taskplane adds Tier 2 click/type/select browser actions.

Current implementation note:

- `src/shared/types/browser-controlled-interaction.ts` drafts the Tier 2 schema
  only: allowed action names, operator-started policy, action step draft,
  checkpoint payload shape, and validation.
- `buildBrowserControlledInteractionLocalQaFixture()` prepares a non-executing
  local-dev QA fixture plan with HTML, allowed origin, planned actions, and
  expected evidence. The fixture explicitly records `browserStart=no`,
  `networkCall=no`, `pageMutation=no`, and `modelExposure=hidden`.
- `npm run manual:browser-controlled-fixture` materializes that fixture to a
  temporary directory for review without starting an HTTP server, Playwright, or
  any browser action.
- The fixture also writes expected RunStep drafts for each planned action. These
  drafts are comparison targets for a future runner; they are not persisted.
- `browser.controlled_interaction` is intentionally not registered in
  `agent-tool-scaffold`, so it remains unavailable to text prompts,
  provider-native schemas, IPC, scheduler runs, and product UI.

Read with:

- [AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md](AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md)
- [AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md](AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md)
- [AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md](AGENT_EXECUTION_MULTICA_REFERENCE_ASSESSMENT.md)

## First-Principles Position

A browser is not just a reader. It is also a stateful identity surface and a
side-effect surface.

The product goal is not maximum autonomy. The goal is recoverable task work:
Taskplane should let an agent inspect, try, validate, and prepare work in a
browser while the user can see what happened, stop it, rerun it, or approve a
final side effect.

That implies:

- reading and screenshotting are evidence collection
- clicking, typing, selecting, and scrolling are controlled interaction
- submitting, posting, publishing, buying, deleting, sending, uploading, and
  account-changing are external side effects
- logged-in browser state is a credential-bearing connector, not a casual
  browser option
- every browser action must become a RunStep or artifact so it is auditable

## Reference Lessons

Public references reviewed on 2026-04-27 show the same shape:

- OpenAI Codex keeps internet access as an explicit environment decision and
  warns about prompt injection, secret exfiltration, malware, and license risk.
- OpenClaw exposes a broad browser surface, but distinguishes isolated managed
  profiles, user profiles, remote CDP, SSRF policy, and profile overrides.
- Hermes and Vercel `agent-browser` use accessibility snapshots / refs to make
  click and type actions more stable for agents.
- CoWork OS splits web access into fetch, browser, and scraping tiers, with
  domain guardrails and failure diagnostics.
- Microsoft Foundry Browser Automation uses isolated Playwright sessions and
  warns to run on low-privilege environments without sensitive data.
- Multica reinforces that browser capability should belong to a runtime
  profile/daemon capability, not be hidden in prompt text.
- Pause is useful as a task-centric, BYO-key product signal, but its public
  site is not detailed enough to define low-level permission boundaries.

## Accepted Shape

Tier 2 is `browser.controlled_interaction`.

It is not a replacement for Tier 1. It builds on Tier 1 evidence:

```text
Task -> Run -> BrowserSession -> BrowserAction RunStep
     -> Evidence Artifact -> Checkpoint / Decision when side effects appear
```

Allowed actions after a separate implementation decision:

- navigate to allowlisted URLs
- click links/buttons identified through a current snapshot/ref or safe locator
- type into non-sensitive text fields
- fill non-sensitive form fields
- select dropdown values
- press safe keys such as Tab, Escape, Arrow keys, and Enter only when Enter is
  not a final submit action
- scroll and wait
- dismiss simple non-sensitive cookie/consent/popover UI
- capture screenshot, visible text, console summary, and trace artifacts after
  actions

Not allowed in Tier 2:

- credential fields, password managers, API keys, OAuth prompts, MFA, CAPTCHA,
  payments, legal/medical/financial decisions, or account-security settings
- upload/download unless a separate file-transfer policy accepts it
- arbitrary `evaluate` by default
- cookie/localStorage export
- use of the user's normal browser profile
- final submit/post/publish/purchase/delete/send actions without an explicit
  checkpoint Decision
- background or scheduled browser interaction

## Policy Model

The runner request must carry:

- `allowedOrigins`
- `allowedActions`
- `sensitiveFieldPolicy`
- `sideEffectPolicy`
- `maxActions`
- `timeoutMs`
- `outputLimitBytes`
- `artifactKinds`
- `operatorStarted: true`

Runtime must enforce:

- default deny for any action not in `allowedActions`
- origin allowlist on navigation and subresource routing
- isolated browser context by default
- no persistent user profile
- no credentials unless Tier 3 is accepted later
- bounded action count and timeout
- RunStep before and after every action
- screenshot/text evidence after meaningful page state changes
- stop/rerun visible from Run detail before any model-visible exposure

## Checkpoint Rules

Create a `Decision` checkpoint before:

- any action likely to submit remote state
- any action on a page containing credential or payment fields
- any file upload/download
- any transition from draft/preparation into publication, sending, booking, or
  deletion
- any request to attach to a logged-in profile or remote CDP session

The checkpoint payload should include:

- current URL and origin
- action type and target label/ref
- screenshot artifact id
- extracted visible-text summary
- side-effect classification
- exact action that would be resumed after approval

## Product Implication

For AI programming, Tier 2 should first support local dev-server QA:

- open localhost
- click through a non-authenticated flow
- fill harmless test inputs
- capture screenshot/text/console evidence
- stop before any destructive or external submission

For self-media / creator workflows, Tier 2 should first support preparation:

- gather references
- open draft surfaces only in isolated or approved contexts
- fill local or sandboxed draft forms
- capture preview artifacts
- require a Decision before publication or sending

## Current Decision

Do not implement Tier 2 yet.

The next implementation slice remains Tier 1 Run artifact surfacing. Tier 2 is
accepted as the intended next browser capability family only after:

- Tier 1 evidence artifacts are visible and reviewable in Runs
- browser action RunStep schema is drafted
- checkpoint payload shape is drafted
- local dev-server QA smoke is designed separately from authenticated real-world
  browser actions

Current progress:

- The browser action step draft and checkpoint payload shape are drafted in
  shared types with validation coverage.
- The local dev-server QA fixture plan is design-only and can be materialized
  locally. It must not start a browser or expose a model-visible tool until
  separately accepted.
- Expected RunStep drafts are now generated from the validated action plan, so
  future implementation can be checked against a stable evidence shape before
  any browser runtime is wired.

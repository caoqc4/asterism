# Agent Execution Browser Controlled Interaction Acceptance Plan

## Status

Draft acceptance plan for Tier 2 browser controlled interaction.

This plan does not enable browser actions in prompts, provider-native schemas,
IPC, scheduler runs, or product UI. It breaks the already drafted
`browser.controlled_interaction` policy into local acceptance slices.

Read with:

- [AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_DECISION.md](AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_DECISION.md)
- [AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md](AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md)
- [AGENT_EXECUTION_OPERATOR_STARTED_RUN_DECISION.md](AGENT_EXECUTION_OPERATOR_STARTED_RUN_DECISION.md)
- [AGENT_EXECUTION_ORCHESTRATION_PLAN.md](AGENT_EXECUTION_ORCHESTRATION_PLAN.md)

## First-Principles Gate

Taskplane should only add browser control when the system can answer five
questions before, during, and after every action:

1. What operator intent started this browser work?
2. Which isolated browser runtime, origin allowlist, and action policy apply?
3. What exact action was attempted, and what page state evidence proves it?
4. Could the action submit credentials, money, publication, deletion, account
   changes, or other external side effects?
5. What can the operator review, stop, rerun, or approve from persisted records?

If any answer is missing, the slice must remain schema-only or dry-run-only.

## Reference Constraints

The accepted reference pattern remains tiered:

- Codex-style explicit environment/network decisions.
- OpenClaw-style separation between isolated managed browser profiles, user
  profiles, remote CDP, and SSRF/origin policy.
- Hermes / Vercel `agent-browser` style accessibility refs for stable actions.
- CoWork-style separation between fetch/read, browser evidence, and interaction.
- Multica-style runtime/profile capability registry rather than hidden prompt
  power.

Taskplane's version should stay Task/Run/Decision/Artifact native. Browser
capability is an operator-started runtime lane first, not a general model tool.

## Acceptance Slices

### BCI1: Review Contract Helper

Status: locally accepted. Renderer review helpers now format validated safe,
checkpoint-required, and blocked controlled-interaction drafts without adding
IPC, UI, browser launch, provider schema, scheduler, or model-visible tool
exposure.

Goal: make controlled-interaction review data reusable before any runtime is
wired.

Implement shared helpers that:

- format a validated action step draft for Runs review
- summarize checkpoint-required actions
- classify why an action is blocked before execution
- keep `browser.controlled_interaction` unregistered in the tool scaffold

Acceptance:

- unit tests cover safe actions, checkpoint-required actions, blocked origins,
  sensitive-field blocks, and max-action/timeout policy failures
- no IPC, UI button, browser launch, provider schema, or scheduler path is added

### BCI2: Runner Dry-Run Plan

Status: locally accepted. The dry-run recorder persists validated action plans
as RunStep evidence in isolated DB tests while recording `browserStart=no`,
`networkCall=no`, `pageMutation=no`, scheduler=no, providerCall=no, and
`modelExposure=hidden`.

Goal: prove the runner can convert validated action plans into auditable steps
without controlling a browser.

Implement a dry-run executor that:

- accepts only validated local QA fixture requests
- records planned `session` / `tool_result` / `artifact` RunStep drafts
- records `browserStart=no`, `networkCall=no`, and `modelExposure=hidden`
- returns a blocked result for unsupported origins or side-effect actions

Acceptance:

- repository/service tests persist the dry-run RunSteps in an isolated DB
- failed validation never launches Playwright and creates clear blocked evidence
- the descriptor remains hidden from model/tool exposure

### BCI3: Local QA Runner Smoke

Status: locally accepted for the localhost fixture path. The runner validates
every request before launch, blocks invalid or checkpoint-required actions
before browser start, runs the fixture in an isolated Playwright Chromium
context, and captures page-summary, visible-text, and screenshot artifacts.
It is still not wired to IPC, product UI, scheduler starts, provider schemas, or
model-visible browser tools.

Goal: execute harmless local dev-server browser actions in an isolated context.

Implement only the local QA fixture path:

- disposable local HTTP fixture
- isolated Playwright context with no credentials
- allowlisted localhost origin
- actions limited to navigate, click, non-sensitive type, select, and evidence
  capture
- screenshot / visible-text / page-summary artifacts after meaningful actions

Acceptance:

- manual command runs against a temporary user-data directory and temporary
  workspace only
- every action produces before/after RunStep evidence or a blocked result
- no authenticated profile, external origin, upload/download, submit/post,
  provider call, scheduler start, or model-visible tool is enabled

### BCI4: Checkpoint Boundary

Status: locally accepted at the shared payload-builder layer. Possible
side-effect actions can now produce a versioned checkpoint payload with current
URL, origin, action, policy snapshot, optional screenshot/text review fields,
and `resume=deferred`. It does not create Decisions or auto-resume browser
actions.

Goal: stop before possible external side effects with a Decision payload that
can resume later.

Implement checkpoint creation for:

- submit/post/publish/send/purchase/delete-like actions
- credential, payment, OAuth, MFA, CAPTCHA, file-transfer, or account-security
  surfaces
- requests to attach to a user profile or remote CDP session

Acceptance:

- checkpoint payload includes current URL, origin, target label/ref, screenshot
  artifact id, visible-text summary, policy snapshot, and exact resume action
- approval does not auto-resume until a separate resume slice is accepted
- cancellation/defer settles the run without browser mutation

### BCI5: Runs Review Surface

Goal: make controlled browser evidence inspectable before adding broader UI.

Extend Runs detail to show:

- action timeline
- policy summary
- blocked/checkpoint reasons
- screenshot/text artifacts
- next review move
- explicit "no model exposure / no scheduler" state

Acceptance:

- App tests cover completed local QA, blocked validation, and checkpoint-needed
  cases
- review UI has no generic browser prompt box and no hidden action execution

### BCI6: Operator-Started Entry Point

Goal: add the first visible control only after BCI1-BCI5 are locally accepted.

The first UI entry should be a local QA smoke control, not arbitrary URL
automation.

Acceptance:

- button creates an `OperatorStartedRunRequest`-shaped internal run
- available only for the local QA fixture or a clearly allowlisted non-sensitive
  local dev-server target
- product copy makes it clear that this is controlled local browser QA, not
  authenticated web automation
- no provider-native/browser tool schema exposure

## Explicit Non-Goals

- no general web browsing agent
- no logged-in user profile
- no remote CDP attachment
- no credential entry
- no publishing/posting/sending/purchasing/deleting
- no arbitrary JavaScript evaluation
- no scheduler or background browser run
- no model-visible browser tool until a later acceptance decision

## Recommended Next Task

Start with BCI5. The next slice should make persisted controlled-browser
dry-run, local-QA, blocked, and checkpoint-required evidence reviewable from
Runs without adding a generic browser prompt box, IPC trigger, scheduler start,
provider schema, or model-visible browser tool.

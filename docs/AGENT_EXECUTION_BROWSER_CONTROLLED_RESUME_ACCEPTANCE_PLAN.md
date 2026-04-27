# Agent Execution Browser Controlled Resume Acceptance Plan

## Status

Draft acceptance plan for checkpoint-approved browser controlled interaction
resume.

This plan does not enable arbitrary browser automation, authenticated browser
profiles, remote CDP, scheduler starts, provider-native browser schemas, or
model-visible browser tools. It defines the narrow path for resuming one
previously checkpointed `browser.controlled_interaction` action after explicit
operator approval.

Read with:

- [AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_DECISION.md](AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_DECISION.md)
- [AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_ACCEPTANCE_PLAN.md](AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_ACCEPTANCE_PLAN.md)
- [AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md](AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md)
- [AGENT_EXECUTION_OPERATOR_STARTED_RUN_DECISION.md](AGENT_EXECUTION_OPERATOR_STARTED_RUN_DECISION.md)

## First-Principles Gate

Approving a browser checkpoint is not the same as granting browser access.

The durable product primitive is:

```text
recorded action -> review evidence -> explicit approval -> one bounded resume
```

Taskplane should only resume a checkpointed browser action when it can answer
these questions from persisted records, before launching a browser:

1. What exact action was paused, including target ref/label, URL, origin, and
   side-effect class?
2. What evidence did the operator review before approval?
3. Does the current policy still allow that exact origin and action?
4. Can the resumed action be executed once without credentials, profile state,
   arbitrary script, scheduler, provider call, or broader session power?
5. What post-action evidence proves what happened, and how can the operator
   inspect or stop the run if page state drifted?

If any answer is missing, resume must block and require a new checkpoint.

## Reference Constraints

The accepted reference pattern remains tiered and checkpoint native:

- Pi-style agent loops: small tool steps, observations, and resumable pauses.
- Codex-style explicit environment and network decisions rather than ambient
  powers.
- OpenClaw-style separation between isolated profiles, user profiles, remote
  CDP, SSRF/origin policy, and profile overrides.
- Hermes / Vercel `agent-browser` style stable snapshot refs before action.
- CoWork-style separation between read/fetch, browser evidence, and controlled
  browser interaction.
- Multica-style runtime capability registry, so browser power is a declared
  lane rather than hidden prompt behavior.

Taskplane's version should stay Task/Run/Decision/Artifact native. Approval
resumes the recorded action, not a general browser session.

## Accepted Boundary

This plan covers only a post-BCI6 resume path:

```text
Run checkpoint payload -> Decision approval -> resume validator
  -> isolated browser context -> one action -> evidence artifacts -> RunStep
```

Allowed in the first resume path:

- checkpoint payload kind `browser_controlled_interaction`
- one approved action from the versioned payload
- local QA fixture or clearly allowlisted non-sensitive local dev-server origin
- isolated Playwright context with no user credentials
- action re-validation immediately before browser launch
- pre-action and post-action RunSteps
- screenshot, visible-text summary, and page-summary artifacts after resume

Still not allowed:

- arbitrary URLs
- logged-in user profiles
- remote CDP attachment
- credential, payment, OAuth, MFA, CAPTCHA, account-security, legal, medical,
  financial, or identity-verification surfaces
- file upload/download
- arbitrary page JavaScript evaluation
- publish/post/send/purchase/delete on external services
- scheduler or background resume
- provider/model-visible browser tools
- broad multi-action continuation after approval

## Resume Invariants

Approval authorizes exactly one action.

The resume service must re-check:

- checkpoint payload version and kind
- linked Decision state is approved
- Run/checkpoint is still open and resumable
- descriptor id is `browser.controlled_interaction`
- policy snapshot is compatible with the current policy
- action name is still allowed
- origin is still allowlisted
- target metadata is present
- payload was not already consumed
- execution is operator/Decision driven, not scheduler driven

The runtime must block if:

- page URL or origin differs from the payload and no explicit safe relocation
  rule exists
- target ref/label cannot be found with enough confidence
- sensitive fields or side-effect surfaces appear before action
- the action would require credentials or user profile state
- any policy drift broadens the payload's original permissions
- the action has already been resumed

## Acceptance Slices

### BCR1: Resume Review Contract

Status: locally accepted. Renderer review helpers now summarize approved,
blocked, stale-payload, and already-consumed browser controlled checkpoint
resume states without adding browser launch, IPC, scheduler, provider schema,
or model-visible tool exposure.

Goal: make browser checkpoint approval readable before any resume runtime is
wired.

Implement helpers that:

- parse and summarize `browser_controlled_interaction` checkpoint payloads
- distinguish `resumeReady`, `blocked`, `stalePayload`, and `alreadyConsumed`
- show the exact action, origin, reviewed evidence, policy snapshot, and resume
  consequence
- keep model exposure, scheduler, generic URLs, profiles, and provider schemas
  explicitly absent

Acceptance:

- unit tests cover valid v1 payloads, unknown versions, wrong kinds, missing
  action metadata, incompatible policies, and already-consumed payloads
- renderer review copy makes clear that approval resumes one recorded action
- no browser launch, IPC trigger, scheduler path, or provider schema is added

### BCR2: Resume Validator

Status: locally accepted. Shared pure validation now parses browser controlled
checkpoint payloads and returns either a one-action resume plan or blocked
reasons for stale payloads, non-approved Decisions, consumed/cancelled
checkpoints, descriptor mismatch, scheduler/provider/model exposure drift,
action/origin drift, policy drift, or missing target metadata.

Goal: centralize the pre-launch permission check.

Implement a pure validator that accepts checkpoint payload, Decision state,
current policy, descriptor metadata, and requested resume context.

Acceptance:

- denies non-approved Decisions
- denies stale/invalid payloads
- denies action, origin, credential, profile, scheduler, provider, and model
  exposure drift
- returns a normalized one-action resume plan when safe
- has no Playwright dependency and no database mutation

### BCR3: Dry-Run Resume Recorder

Status: locally accepted. The dry-run recorder persists checkpoint review,
validator outcome, planned one-action resume, and expected post-action evidence
RunSteps while recording `browserStart=no`, `pageMutation=no`,
`providerCall=no`, `scheduler=no`, and `modelExposure=hidden`.

Goal: prove resume can be audited without controlling a browser.

Implement a dry-run path that records:

- checkpoint reviewed
- resume validation accepted or blocked
- planned single action
- expected post-action evidence requirements
- `browserStart=no`, `pageMutation=no`, `providerCall=no`,
  `scheduler=no`, and `modelExposure=hidden`

Acceptance:

- repository/service tests persist RunSteps in an isolated DB
- blocked validation creates clear evidence and does not mark the payload
  consumed
- approved dry-run does not launch a browser

### BCR4: Local QA Resume Smoke

Status: locally accepted. The local QA resume runner validates the approved
checkpoint payload immediately before browser launch, opens only the
disposable localhost fixture URL in an isolated Playwright context, executes
exactly one resumed action, captures page-summary / visible-text / screenshot
artifacts after the action, and blocks invalid resume contexts before browser
start.

Goal: execute one approved checkpoint action against the existing local QA
fixture.

Implement only the disposable localhost path:

- create or load a checkpoint-required fixture action
- approve through the existing Decision/checkpoint flow
- validate immediately before launch
- launch isolated Playwright Chromium
- execute exactly one resumed action
- capture screenshot, visible text, and page summary after action
- mark the checkpoint consumed only after successful post-action evidence

Acceptance:

- manual smoke uses a temporary user-data directory and temporary local server
- invalid/checkpoint drift blocks before browser launch
- retrying the same approved checkpoint is blocked as already consumed
- no external origin, authenticated profile, provider call, scheduler start, or
  model-visible browser tool is involved

### BCR5: Runs And Decisions Review Surface

Status: locally accepted. Runs detail now surfaces Browser Controlled Resume
review states for approved-ready, resumed, blocked/stale, and consumed
checkpoint payloads using linked Decision status, checkpoint state, resume
evidence, reviewed payload evidence, consequence, policy, and next-review
wording. It adds no generic browser prompt, arbitrary URL input, Playwright
launch from UI, scheduler start, provider schema, model-visible tool, or
Decision auto-resume.

Goal: make approval and resume outcomes inspectable from existing surfaces.

Extend the existing review UI to show:

- checkpoint evidence reviewed before approval
- one-action resume consequence
- current resume state: pending, approved-ready, resumed, blocked, or consumed
- post-resume artifacts
- next review move

Acceptance:

- App tests cover approved-ready, resumed, blocked drift, and consumed states
- UI does not include a generic browser prompt or arbitrary URL input
- Decision approval copy says it resumes one recorded action, not a session

### BCR6: Operator/Decision Service Integration

Goal: connect the accepted local QA resume path through the existing Run and
Decision services.

Implement service wiring only after BCR1-BCR5 are accepted.

Acceptance:

- approval path invokes the resume service only for the accepted
  `browser_controlled_interaction` payload kind
- resume is idempotent and restart-safe
- failed resume writes a failed RunStep and leaves a clear review state
- successful resume writes post-action artifacts, resolves/consumes the
  checkpoint, and marks the Run outcome explicitly
- no scheduler, provider call, authenticated profile, or model-visible exposure

## Explicit Non-Goals

- no generic browser prompt
- no arbitrary URL runner
- no logged-in or persistent user profile
- no remote CDP
- no credential entry
- no external publish/post/send/purchase/delete automation
- no multi-action autonomous continuation after a single approval
- no scheduler/background resume
- no provider-native browser tool schema
- no model-visible browser tool

## Recommended Next Task

BCR1-BCR5 are locally accepted. Next, implement BCR6 only.

BCR6 should connect the accepted local-QA resume path through the existing
Run/Decision services in an idempotent, restart-safe way. Keep the implementation
limited to accepted `browser_controlled_interaction` payloads and localhost QA
resume; do not add arbitrary URLs, authenticated profiles, scheduler starts,
provider schemas, model-visible tools, or broad multi-action continuation.

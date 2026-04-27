# Agent Execution Browser Controlled Resume Manual Review

## Status

Manual packaged-app review checklist for the BCR1-BCR6 checkpoint-approved
local-QA resume path.

This checklist is intentionally narrower than a product launch checklist. It
does not validate arbitrary URLs, authenticated profiles, remote CDP,
scheduler starts, provider schemas, model-visible browser tools, file transfer,
credential entry, or multi-action browser continuation.

Read with:

- [AGENT_EXECUTION_BROWSER_CONTROLLED_RESUME_ACCEPTANCE_PLAN.md](AGENT_EXECUTION_BROWSER_CONTROLLED_RESUME_ACCEPTANCE_PLAN.md)
- [AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_ACCEPTANCE_PLAN.md](AGENT_EXECUTION_BROWSER_CONTROLLED_INTERACTION_ACCEPTANCE_PLAN.md)
- [ALPHA_MANUAL_RUN_LOG.md](ALPHA_MANUAL_RUN_LOG.md)

## Review Goal

Confirm that the accepted browser resume path remains review-first and bounded:

```text
browser checkpoint payload -> Decision approval -> localhost-only resume
  -> one browser action -> post-action evidence -> Run review
```

Approval must resume one recorded action only. It must not grant a browser
session or expose a generic browser tool.

## Preflight

- Local `.env` may exist, but this review must not require provider calls.
- GitHub Actions must not be dispatched.
- Use isolated `TASKPLANE_USER_DATA_DIR` when running packaged or manual app
  checks.
- Keep test data disposable.
- Run `npm run verify` after any code changes.
- Run `npm run manual:browser-controlled-resume-smoke` before packaged UI
  review to confirm the local Playwright path still works.

## Manual Review Cases

### MBR1: Resume Smoke Baseline

Run:

```text
npm run manual:browser-controlled-resume-smoke
```

Accept when output shows:

- `status=completed`
- `oneAction=yes`
- `credentials=not-used`
- `externalOrigin=blocked`
- `modelExposure=hidden`
- artifacts include `page_summary`, `visible_text`, and `screenshot`

Reject if the smoke requires a provider key, scheduler, product UI trigger,
authenticated profile, arbitrary URL input, or more than one browser action.

### MBR2: Runs Review Surface

In an isolated app fixture, inspect a Run with a
`browser_controlled_interaction` checkpoint payload and linked Decision.

Accept when Runs detail shows:

- Browser Controlled Interaction evidence
- Browser Controlled Resume review
- Decision state
- exact action and origin
- reviewed evidence summary
- consequence that approval resumes one action, not a session
- policy summary with hidden model exposure and no scheduler/provider call
- next review move

Reject if Runs detail includes a generic browser prompt, arbitrary URL input,
or a hidden action button that launches Playwright directly from the review
card.

### MBR3: Approved Local Resume

Approve a linked browser checkpoint Decision whose payload origin is localhost
or loopback.

Accept when:

- the checkpoint is resolved only after the local-QA resume executor completes
- the Run is updated with system output from the resume result
- a checkpoint RunStep records Browser resume completion
- review surface shows resumed or consumed state
- post-action evidence is inspectable from persisted Run output/steps

Reject if approval launches an external origin, uses credentials, calls a
provider, starts from scheduler, or continues with additional browser actions.

### MBR4: Non-Local Origin Block

Use a browser controlled checkpoint payload whose origin is not localhost or
loopback.

Accept when:

- approval writes a failed checkpoint RunStep
- the checkpoint is cancelled
- the Run is marked failed with a clear local-QA-origin block reason
- no browser executor is invoked

Reject if any external origin is launched or silently downgraded into a
generic browser session.

### MBR5: Already Consumed / Drifted Review

Inspect resolved, cancelled, stale, and malformed checkpoint payload states.

Accept when:

- resolved checkpoints read as consumed/resumed review states
- cancelled or drifted checkpoints read as blocked
- malformed browser payloads read as stale
- non-browser checkpoints are not rendered as browser resume work

Reject if stale or non-browser checkpoint payloads appear eligible for browser
resume.

## Completion Note

When MBR1-MBR5 pass, add a row to [ALPHA_MANUAL_RUN_LOG.md](ALPHA_MANUAL_RUN_LOG.md)
with the isolated user-data directory, command outputs, and any remaining
manual friction. Keep the accepted scope local-QA only until a new connector
acceptance plan exists.

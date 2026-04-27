# Browser / Playwright Tier 1 Acceptance Checklist

## Status

Drafted from the shared connector policy and local verification evidence
records. This checklist accepts only `browser.readonly_evidence` Tier 1 review
readiness. It does not enable model-visible browser tools, controlled
interaction, authenticated browsing, scheduler runs, or external side effects.

## Scope

Descriptor:

- id: `browser.readonly_evidence`
- family: `browser_playwright`
- lifecycle: `reserved`
- session kind: `browser`
- risk: `external_read`
- model exposure: hidden
- network: allowlisted browser session only
- credential policy: explicit config
- artifacts: `screenshot`, `browser_trace`, `browser_extract`
- checkpoint: none for read-only evidence

The first-principles bar is simple: browser work is accepted only when it
produces reviewable task evidence and remains unable to mutate remote state.

## Required Checklist

1. Policy boundary is recorded.
   - The descriptor must produce a connector policy record with
     `modelVisible=no`, `network=allowlisted`, `credential=explicit_config`,
     and `verification=required`.
2. Model-visible exposure remains disabled.
   - Text prompts and provider-native schemas must not include
     `browser.readonly_evidence`.
3. Local verification evidence is present.
   - A local run must record browser session evidence, tool-result/capture
     RunSteps, and an artifact with screenshot or extracted page evidence.
4. Credential boundary is explicit.
   - Tier 1 must use isolated, credential-free browser state unless a later
     accepted connector decision changes the policy.
5. Run review is visible.
   - Runs detail must show the Browser Evidence review card with URL, evidence
     kinds, artifact id, summary, and screenshot path when present.

Optional:

- No checkpoint is required for Tier 1 read-only evidence because no page action
  is resumed after approval.

## Local Verification Commands

Use local verification while GitHub Actions quota is unavailable:

```bash
npm test -- src/shared/agent-tool-scaffold.test.ts src/shared/types/browser-evidence.test.ts src/main/domain/run/browser-evidence-runner.test.ts src/main/domain/run/operator-started-run-service.test.ts src/renderer/App.test.tsx --run
npm run manual:browser-evidence-smoke
npm run verify
```

Manual UI acceptance remains the stronger product check:

- start the dev app with an isolated `TASKPLANE_USER_DATA_DIR`
- create or select a task
- open Runs
- click `运行 Browser Evidence Smoke`
- confirm the completed Run shows Browser Evidence artifacts and related task
  timeline evidence

## Deferred Until Tier 2

Do not accept these under Tier 1:

- click, type, select, scroll-as-action, or submit tools
- authenticated user profile or persistent browser state
- cookie/localStorage export
- file upload/download
- external posting, publishing, buying, sending, deleting, or account changes
- scheduled/background browser runs
- model-visible browser tool exposure

Tier 2 must remain behind the controlled-interaction decision and a separate
local dev-server QA smoke.

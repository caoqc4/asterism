# Release Candidate Product Chain Test Plan

Document id: taskplane.release-candidate-product-chain-test-plan.v1
Owner: Taskplane product/runtime
Date: 2026-05-31
Status: draft for automated validation and manual dogfood

## Purpose

Validate whether the current Taskplane product chain is ready for real manual
use with the first-version CLI-first runtime path.

This document is intentionally a test plan, not a new architecture plan. It
should help Codex run one automated validation pass, then help the user run a
real manual business-line workflow.

## Product Scope

The first-version product chain under test is:

```text
Business Line
-> Today / Next Action suggestion
-> CLI-first Agent run
-> runtime evidence
-> Write Intent / proposal gate
-> review
-> Business Record / Next Action / SOP proposal
-> updated future suggestion
```

The current release candidate is CLI-first:

- Native CLI runtime is the primary production execution path.
- Agent API remains a same-level future runtime, but deferred/gated.
- Scheduler/event automation is a business-line loop carrier, not the owner of
  product state.
- Taskplane owns durable business state, records, decisions, write gates,
  review, and learning.
- Business Line is the durable product object. Task is the execution unit and
  Next Action carrier.

## Non-Goals

Do not use this validation pass to:

- implement Agent API parity;
- enable global Agent API task execution;
- redesign the business-line product model;
- add new templates, dashboards, connectors, or automation features;
- rename GoalPilot broadly before the product naming decision is made;
- bypass Write Intent, Decision, review, or SOP gates to make a test pass.

Only fix minimal blocking defects discovered by the test pass. If a fix is
needed, keep it narrow, rerun the failing check, and stop with a checkpoint.

## Release Candidate Exit Criteria

The release candidate is ready for manual real-use testing when:

- required automated checks pass;
- product audit reports CLI-first readiness and no P0 CLI partial blockers;
- packaged local smoke either passes or has an explicit, non-product blocker;
- the app can create or open a business line, choose a Next Action, start a
  CLI-backed run, show evidence, propose gated writeback, review the result,
  and update the future business-line context;
- Agent API gaps remain visibly deferred and do not block the CLI-first path;
- no direct structured-data mutation bypasses Taskplane product services or
  confirmation gates;
- no cross-business memory or SOP enters active context without explicit user
  selection/acceptance.

## Automated Pass

Run this before manual dogfood. The required pass avoids live provider calls and
does not require a real Codex or Claude account.

### 1. Preflight

```bash
git status --short --branch
rg -n "businessLineFirst|runtimeArchitectureCloseout|mainlineCliP0|p0CliPartial|Agent API|CLI-first" src/shared scripts docs/plans docs/specs
```

Expected:

- Worktree state is reported before the run.
- The test runner understands that CLI-first is the blocking path and Agent API
  is deferred/gated.

### 2. Product Audit And Build Gate

```bash
npm run audit:product-progress -- --next
npm run lint
npm run build
git diff --check
```

Expected:

- `mainlineCliP0=ready`.
- `p0CliPartial=<none>`.
- `runtimeArchitectureCloseout readiness=ready checks=10 issues=0`, when that
  closeout line is present.
- Build may show the existing Vite chunk-size warning only.

### 3. Focused Business-Line And Runtime Tests

```bash
npm test -- src/main/domain/business-line/business-line-service.test.ts src/main/domain/run/run-service.test.ts src/main/domain/agent-cli/agent-cli-run-service.test.ts src/renderer/App.test.tsx -t "business line|Business|Today|Next Action|CLI|review|Write Intent|SOP|context"
npm test -- src/shared/product-feature-impact-audit.test.ts src/main/local-smoke-boundaries-script.test.ts -t "businessLineFirst|runtime architecture|CLI-first|Agent API|local smoke"
npm test -- src/shared/native-cli-adapter-contract.test.ts src/shared/agent-capability-gateway.test.ts src/shared/capability-scoped-allowance.test.ts src/shared/context-preservation.test.ts src/shared/context-transition.test.ts
```

If a filter skips all tests unexpectedly, rerun the same files without `-t` and
report that the filter was stale.

Expected:

- Business-line records, context packs, Next Actions, reviews, SOP revisions,
  and Today suggestions are covered.
- CLI adapter contract evidence is covered.
- Agent API readiness remains gated/deferred rather than promoted.
- Handoff/recovery and context preservation stay typed and bounded.

### 4. Local Non-Live Smoke

```bash
npm run smoke:build
npm run smoke:agent-cli-task:mac
npm run smoke:agent-cli-web-research
```

Expected:

- Packaged task-bound Agent CLI smoke uses fixture/fake runtime evidence unless
  explicitly opted into live mode.
- Web research bridge smoke remains non-live by default.
- No workspace mutation occurs outside expected temporary workspaces.

### 5. Packaged RC Smoke

Run this before real dogfood if time allows. It is stronger and slower because
it builds the unsigned macOS app.

```bash
npm run smoke:release:mac
npm run accept:packaged-recovery:mac
npm run accept:product-surfaces:mac
npm run accept:release:mac-preflight
```

Expected:

- Unsigned local app launches and package/runtime/timeline smokes pass.
- Recovery, context refresh, context learning, code-agent UI, Agent CLI task,
  decisions, settings, external access, local inbox, and task files surfaces are
  still reachable.
- No Apple signing/notarization/upload is attempted.

### 6. Optional Live CLI Smoke

Only run after the user explicitly wants a live local CLI call. This may call
the user's installed Codex or Claude CLI/account.

```bash
TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE=true TASKPLANE_AGENT_CLI_SMOKE_RUNTIME=codex npm run manual:agent-cli-readonly-smoke
npm run dist:mac:dir
TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:agent-cli-task-live:mac
```

Expected:

- `auth=ready` when the local account is configured.
- `workspace=unchanged`.
- Read-only phrase/evidence matches.
- If account/config is missing, report it as an environment blocker, not a
  product blocker.

## Automated Codex Prompt

Use this prompt in a fresh Codex window when running the automated pass:

```text
Goal: Run the Release Candidate Product Chain Validation automated pass only.

Read:
- AGENTS.md
- docs/specs/goalpilot-task-advancement-framework.md
- docs/TESTING.md
- docs/plans/2026-05-31-release-candidate-product-chain-test-plan.md

Validate the CLI-first product chain:
Business Line -> Today/Next Action -> CLI-first run -> runtime evidence ->
Write Intent/proposal gate -> review -> Business Record/Next Action/SOP
proposal -> updated future suggestion.

Do not implement Agent API parity, new templates, new connectors, or broad
architecture changes. Do not change product behavior unless a test failure
blocks validation. If a minimal fix is required, make only that fix, rerun the
failing command plus the relevant gate, and stop with a checkpoint.

Run the required automated commands in this test plan:
1. Preflight
2. Product Audit And Build Gate
3. Focused Business-Line And Runtime Tests
4. Local Non-Live Smoke

Then decide whether Packaged RC Smoke is necessary based on time and current
failure risk. Do not run Optional Live CLI Smoke unless explicitly instructed.

Report:
- exact commands run;
- pass/fail result for each command;
- product audit summary lines;
- any changed files;
- any blocker vs non-blocker distinction;
- whether manual real-use testing can start.

Stop at a checkpoint. Do not continue into new feature work.
```

## Manual Real-Use Test

Start manual dogfood only after the automated pass is green or any failures are
understood as non-product environment blockers.

### Launch

Use either dev mode or the packaged app:

```bash
npm run dev
```

or:

```bash
npm run dist:mac:dir
open release/mac-arm64/Taskplane.app
```

If the app path differs, find it with:

```bash
find release -maxdepth 3 -name "*.app" -print
```

### Manual Checklist

1. Open the app and confirm the top-level navigation matches the new product
   model: Today / Business / Decisions / Chat or equivalent, with legacy task
   surfaces clearly marked as compatibility.
2. Create a new business line for a real small dogfood workflow, for example
   `Taskplane RC dogfood` or the current product work.
3. Use the creation flow with the Web Product / Software Product or Custom
   template. Confirm generated structure, initial records, review prompts, and
   proposed SOPs are editable and not overcomplicated.
4. Open the business-line workspace. Confirm Overview, Records, Next Actions,
   Learning/SOP, and relevant settings are visible or reachable.
5. Create or select one safe Next Action that can be completed in under 30
   minutes.
6. Start an Agent run from the business-line or Next Action context. Confirm the
   context indicator makes the target explicit: Global, Business Line, Next
   Action, Legacy Task, or Run/Review.
7. Confirm the run uses the selected CLI-first runtime path for execution. Agent
   API should appear as deferred/gated rather than silently taking over.
8. During the run, check that progress/evidence is visible and that no durable
   state is changed without a proposal or confirmation gate.
9. Complete or stop the run. Confirm the post-run review option is offered.
10. Accept one safe Business Record or Next Action proposal.
11. Propose one SOP/learning update. Confirm non-risky updates can be accepted
    through the intended gate and risky updates create a Decision before
    becoming active.
12. Return to Today. Confirm the next suggestion reflects the new record,
    review, or accepted learning.
13. Restart the app. Confirm business-line records, Next Actions, Decisions,
    and accepted/rejected SOP state persist.
14. Switch to a different business line or one-off chat. Confirm context from
    the previous business line is not silently reused.
15. Open runtime/settings/capability surfaces. Confirm configured CLI runtime,
    skills/MCP/external access, and Agent API status are understandable without
    implying that API execution is ready.

## Manual Failure Checks

During dogfood, deliberately check these failure boundaries:

- Cancel or stop a run. It must not mark the Next Action complete.
- Reject a writeback proposal. It must not appear later as accepted context.
- Reject or disable an SOP revision. It must not affect future suggestions.
- Create a record that should not affect future context. It must remain visible
  as evidence but stay out of the default BusinessLineContextPack.
- Try a cross-business inherited structure/SOP. It should be source evidence or
  proposed learning, not active context, until accepted.
- Open an Agent API path if visible. It must remain clearly gated/deferred.

## Manual Result Template

Copy this after a manual test run:

```text
Date:
Commit:
Runtime mode:
App mode: dev / packaged
Business line:
Next Action:

Automated validation:
- audit:
- lint/build:
- focused tests:
- smoke:

Manual result:
- business-line creation:
- Today / Next Action:
- CLI run:
- runtime evidence:
- Write Intent / gate:
- review:
- Business Record:
- SOP / Learning:
- persistence after restart:
- cross-business isolation:

Blockers:
- P0:
- P1:

Non-blocking polish:

Decision:
- ready for deeper dogfood / fix blockers first / defer
```

## Triage Rules

Classify issues by product risk:

- P0: data loss, direct write gate bypass, wrong business-line ownership,
  wrong active context, unsafe public/external mutation, run marked complete
  without evidence, CLI-first path broken.
- P1: manual workflow blocked, review/writeback confusing enough to prevent
  use, persistence unreliable, packaged smoke broken without environment cause.
- P2: copy, layout, missing helper text, slow but usable flow, non-critical
  missing explanation.
- Deferred: Agent API parity, provider-native tool/search execution, full
  scheduler automation, broad template coverage, naming/brand migration.

Do not block the first CLI-first manual dogfood on Deferred items.

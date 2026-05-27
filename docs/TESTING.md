# Testing

## Overview

Taskplane uses layered local verification:

- service-level unit tests for domain and config logic;
- SQLite-backed integration tests for repositories and service persistence;
- renderer `jsdom` interaction tests for control-plane flows;
- IPC handler tests for main-process entrypoints;
- smoke scripts for build, package, runtime, and selected packaged UI paths.

## Standard Gate

```bash
npm run verify
```

This runs:

1. `npm run test`
2. `npm run lint`
3. `npm run build`

Run this before opening a pull request or pushing a meaningful change.

For local alpha readiness on macOS, run the broader acceptance gate:

```bash
npm run accept:alpha-local
```

This includes `verify`, read-only canonical data diagnostics against the local
SQLite database when one exists, local agent/runtime gates, packaged release
smoke, packaged recovery smoke, product-surface packaged smoke, and the
read-only macOS release preflight.

The product-surface packaged smoke includes Task files editing plus applied and
blocked reviewed-patch promotion apply paths against a temporary workspace; run
`npm run dist:mac:dir` first when validating that UI path locally.

## Focused Test Commands

```bash
npm run test
npm run lint
npm run build
npm run smoke:build
```

Read-only local data diagnostics:

```bash
npm run diagnostics:canonical-data
npm run audit:product-progress
```

This checks the local SQLite database against the canonical data contract. Use
`node scripts/canonical-data-diagnostics.mjs --db /path/to/taskplane.db` after
`npm run build:main` to inspect a specific database.
`npm run diagnostics:canonical-data:optional` is the same read-only check but
skips successfully when no local database exists, which keeps fresh local alpha
environments reproducible.
`npm run audit:product-progress` reads the source product feature audit only,
prints status / CLI / future API closure counts, and fails if audit structure
checks find a regression. The `currentCompletion` line separates current P0 CLI
blockers from future API deferred work, and the `focus` line lists P0 feature
families whose CLI-only closure is still partial. Add `-- --next` to print the
first open gap and next action for every unfinished feature family.

For a single Vitest file:

```bash
npx vitest run path/to/file.test.ts
```

## Package Smoke Commands

After producing an unpacked macOS app with `npm run dist:mac:dir`, run:

```bash
npm run smoke:package:mac
npm run smoke:runtime:mac
```

Or run the combined unsigned local release smoke:

```bash
npm run smoke:release:mac
```

Targeted packaged recovery/config coverage:

```bash
npm run accept:packaged-recovery:mac
```

Targeted packaged product-surface coverage:

```bash
npm run accept:product-surfaces:mac
```

This is a supplemental product-surface smoke, not the full UI surface list. It
covers External Access empty/safety state, External Access fixture-connected
state, External Access opt-in local-inbox connector state, Decisions
judgment-center resolution, and task file open/save persistence in the packaged
app. Brief recovery is
covered by `accept:packaged-recovery:mac`, and task-dynamics replay rendering is
covered by `smoke:release:mac` through `smoke:timeline-ui:mac`.
The External Access fixture uses `TASKPLANE_EXTERNAL_ACCESS_FIXTURE_JSON` only
inside the smoke process, so it does not contact live providers or change the
default no-connector state. The local-inbox smoke uses
`TASKPLANE_EXTERNAL_ACCESS_LOCAL_INBOX_DIR` with a temporary directory, creates
a packaged-app task through the preload API, previews the local inbox evidence,
and confirms that it can be written through the task Source Context memory
path.
Skills/MCP capability-status fixture coverage can use
`TASKPLANE_CAPABILITY_PRODUCT_SURFACE_FIXTURE_JSON`; it only projects local
ready/connected/model-visible counts through the shared capability registry and
does not start Skill or MCP processes.
Gmail connector tests use an injected fetch implementation and do not contact
Google. Live Gmail OAuth/token validation remains manual until a concrete OAuth
flow is selected.

Gmail connector local preflight:

```bash
npm run accept:external-access:gmail-preflight
```

This command validates the environment shape, hides the OAuth token value, and
does not call Gmail or write task memory. It accepts either the current static
access-token path or the future OAuth client-id path, redacts access tokens and
OAuth client secrets, and does not inspect keychain refresh tokens.

Mocked Gmail OAuth control flow:

```bash
npm run accept:external-access:gmail-oauth-local
```

This command covers the local OAuth control chain without real Google
credentials: connect/disconnect confirmation boundaries, authorization-session
composition, loopback callback handling, token refresh/disconnect behavior, the
confirmed source-ingestion bridge into task Source Context memory, IPC, preload
exposure, and the External Access page controls. It does not contact Google,
does not open a real browser in tests, and is not part of the default local
alpha gate.

Release readiness preflight:

```bash
npm run accept:release:mac-preflight
```

The preflight is read-only. It does not sign, notarize, upload, or contact Apple
services.

## Agent CLI and Legacy Sandbox Gates

Agent CLI real smoke is the current primary coding-agent path and is opt-in
because it calls the user's locally installed official CLI:

```bash
TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE=true npm run manual:agent-cli-readonly-smoke
```

Codex CLI is the verified default. Claude Code can be checked explicitly when a
local `claude` command and valid account are available:

```bash
TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE=true TASKPLANE_AGENT_CLI_SMOKE_RUNTIME=claude npm run manual:agent-cli-readonly-smoke
TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME=claude TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:claude-agent-cli-task-live:mac
```

The packaged task-bound Agent CLI smoke uses a fake Codex executable and fixture
runtime status, so it does not require a real account by default:

```bash
npm run smoke:agent-cli-task:mac
```

The local web-research bridge smoke is also non-live by default. It stubs the
OpenAI web-search bridge and validates fresh/current research triggering, Source
Context persistence, the `Agent CLI 联网调研准备` Run step, and right-panel
progress projection without contacting external networks:

```bash
npm run smoke:agent-cli-web-research
```

Native CLI web/search behavior is checked by a separate opt-in live smoke, not
by the default test or smoke path:

```bash
npm run manual:agent-cli-native-web-search-smoke
TASKPLANE_RUN_AGENT_CLI_NATIVE_WEB_SEARCH_SMOKE=true npm run manual:agent-cli-native-web-search-smoke
TASKPLANE_RUN_AGENT_CLI_NATIVE_WEB_SEARCH_SMOKE=true TASKPLANE_AGENT_CLI_SMOKE_RUNTIME=claude npm run manual:agent-cli-native-web-search-smoke
```

The default command must report `status=skip`, `skipReason=opt_in_required`,
`cli=not-called`, `network=not-called`, and `workspace=unchanged`. A passing
opt-in run is manual evidence for exact native web/search readiness; it is
intentionally separate from static no-start capability probes.

On 2026-05-27, local Codex CLI `codex-cli 0.125.0` passed this opt-in native
web/search smoke with `auth=ready`, `workspace=unchanged`, `phrase=matched`,
`network=called`, and `status=passed`. The Codex argument order matters:
`--search` is a top-level option, so the smoke uses `codex --search exec ...`.

That smoke covers the first-version Agent CLI product loop inside the packaged
app: task-bound run creation, accepted and terminal run evidence, cancellation
evidence, read-only workspace protection, task dynamics replay, Run Goal
Contract/verifier/memory-proposal evidence, Taskplane-owned `/goal`
completion conditions flowing into the run contract and memory proposal, and
explicit runtime-native goal audit requests that are recorded but not forwarded.

To manually validate the packaged app against the real local Codex CLI account,
first build the unpacked macOS app, then opt in explicitly:

```bash
npm run dist:mac:dir
TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:agent-cli-task-live:mac
# Optional Claude Code pass when a local Claude account is ready:
TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME=claude TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:claude-agent-cli-task-live:mac
```

This launches the packaged app with isolated user data and a temporary workspace,
injects only the detected local Agent CLI runtime status, runs one task-bound
read-only Agent CLI request, checks the expected phrase in the terminal step, and
fails if workspace files change. The default command stays skipped, reports
`accountReadiness=not-checked` and `manualEvidence=not-recorded`, and must not
call the CLI or launch the app.

On 2026-05-20, this packaged-app live smoke passed locally with Codex CLI
`codex-cli 0.125.0`, `auth=ready`, `workspace=unchanged`, `phrase=matched`, and
`status=passed`.

Latest focused verification for this loop:

```bash
npm exec vitest run src/shared/agent-runtime-goal.test.ts src/shared/agent-runtime-verifier.test.ts src/shared/native-goal-forwarding-readiness.test.ts src/shared/agent-runtime-verifier-shadow-readiness.test.ts src/main/domain/agent-cli/agent-cli-run-service.test.ts src/renderer/App.test.tsx -t "goal|Agent CLI|任务记忆写入提案|verifier"
npm exec vitest run src/main/local-smoke-boundaries-script.test.ts
npm run smoke:agent-cli-task:mac
npm run manual:agent-cli-readonly-smoke
```

The default manual read-only smoke must report `status=skip`,
`skipReason=opt_in_required`, `cli=not-called`, and `workspace=unchanged`
unless `TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE=true` is explicitly set.

The Code Agent model-producer live and preview smokes follow the same explicit
evidence convention: default output must include `status=skip`,
`skipReason=opt_in_required`, `provider=not-called`, `docker=not-started`, and
`workspace=unchanged`. Enabled runs with incomplete provider configuration must
switch to `skipReason=config_missing` without calling the provider, starting
Docker, or mutating the workspace.

Manual live evidence is intentionally recorded as historical validation, not as
a default CI requirement. On 2026-05-20, local Codex CLI `codex-cli 0.125.0`
passed the opt-in smoke with `auth=ready`, `workspace=unchanged`,
`phrase=matched`, and `status=passed` using:

```bash
TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE=true TASKPLANE_AGENT_CLI_SMOKE_RUNTIME=codex npm run manual:agent-cli-readonly-smoke
```

The same local pass checked Claude Code `2.1.144` as optional secondary adapter
compatibility evidence. The CLI and auth status were detectable, but execution returned a provider
account/organization error while preserving `workspace=unchanged`. On
2026-05-26, a focused Claude Code `stream-json --verbose` probe also reached
provider execution and returned `401 authentication_failed`, confirming that the
remaining gap is account/provider readiness rather than Taskplane workspace
safety. Keep this as non-blocking evidence until a valid Claude account can pass
the same opt-in read-only smoke; do not let it block Codex CLI, Agent API,
scheduled/event, writeback, or recovery acceptance progress.

Do not count a third-party model behind Claude Code as Claude account readiness
unless Claude Code itself exposes and documents that provider as a supported
execution path. Current local help exposes Claude model selection and
third-party infrastructure providers such as Bedrock/Vertex/Foundry, but no
OpenAI/Codex-compatible model route; using Codex directly should stay in the
Codex CLI adapter smoke path.

Runtime-native goal discovery is an optional compatibility track, not a
first-version product gate. By default it only probes local CLI version/help
output, so it can be used to inspect command shape without starting a goal. The
default output reports `taskplaneGoalLoop=available`,
`nativeGoalForwarding=audit-only`, `passthrough=closed`, and
`continueWith=taskplane_goal_loop`, plus `status=skip` and
`skipReason=opt_in_required`, to make clear that Taskplane-owned task
advancement can continue even when runtime-native goal forwarding is closed:

```bash
npm run manual:agent-cli-native-goal-discovery
```

Codex Goal Mode is version-aware in Taskplane. Codex CLI `0.133.0+` is modeled
as having native Goal Mode available, while older detected versions are shown as
requiring an update. Availability does not open passthrough by itself: explicit
runtime-native goal requests still remain audit-only until the Native Goal
Forwarding Evidence Gate passes.

Claude Code can be probed explicitly:

```bash
TASKPLANE_AGENT_CLI_NATIVE_GOAL_RUNTIME=claude npm run manual:agent-cli-native-goal-discovery
```

To run one disposable candidate native-goal command, opt in explicitly and pass
the exact argument vector as JSON. This may call the user's installed CLI and
account, so keep it outside default smoke/acceptance paths:

```bash
TASKPLANE_RUN_AGENT_CLI_NATIVE_GOAL_DISCOVERY=true \
TASKPLANE_AGENT_CLI_NATIVE_GOAL_RUNTIME=codex \
TASKPLANE_AGENT_CLI_NATIVE_GOAL_OBJECTIVE="inspect disposable goal support" \
TASKPLANE_AGENT_CLI_NATIVE_GOAL_ARGS_JSON='["exec","--json","--sandbox","read-only","--enable","goals","/goal inspect disposable goal support"]' \
npm run manual:agent-cli-native-goal-discovery
```

For Claude Code, use the documented non-interactive slash-command form:

```bash
TASKPLANE_RUN_AGENT_CLI_NATIVE_GOAL_DISCOVERY=true \
TASKPLANE_AGENT_CLI_NATIVE_GOAL_RUNTIME=claude \
TASKPLANE_AGENT_CLI_NATIVE_GOAL_OBJECTIVE="inspect disposable goal support" \
TASKPLANE_AGENT_CLI_NATIVE_GOAL_ARGS_JSON='["-p","/goal inspect disposable goal support","--permission-mode","plan","--output-format","text"]' \
npm run manual:agent-cli-native-goal-discovery
```

The candidate command runs in a disposable workspace and fails if workspace
files change. Use the captured command, stdout/stderr, status, cancellation
behavior, and workspace result to compare against the Native Goal Forwarding
Evidence Gate before enabling any runtime-native forwarding. First-version goal
work should remain focused on Taskplane-owned durable goals, verifier evidence,
and user-confirmed task-memory proposals.

The shared readiness gates are local contract tests, not live-provider tests:

```bash
npm exec vitest run src/shared/native-goal-forwarding-readiness.test.ts src/shared/agent-runtime-verifier-shadow-readiness.test.ts
```

They keep native goal forwarding audit-only until the evidence gate is complete,
and keep the future API verifier in shadow/assist mode until representative
persisted samples satisfy the default-on threshold.

The Agent API / sandbox execution lane remains gated and explicit while it
matures as a peer runtime. These commands are useful when maintaining that
runtime boundary, but they are not the first-run Agent CLI validation path:

```bash
npm run manual:agent-api-execution-preflight-smoke
TASKPLANE_RUN_AGENT_API_EXECUTION_PREFLIGHT_SMOKE=true npm run manual:agent-api-execution-preflight-smoke
npm run accept:agent-local
npm run accept:scheduled-event-agent-sweep-smoke
npm run accept:sandbox-coding
npm run accept:sandbox-coding:code-agent-ui
npm run accept:sandbox-coding:model-producer-preflight
```

The default preflight and smoke paths do not call external providers, start
Docker checks, or mutate a selected workspace unless their explicit environment
gates are enabled.

The scheduled/event Agent sweep smoke is local and non-live. It runs against
built main-process modules and proves the scheduler sweep can load duplicate
Standing Approval candidates, reuse persisted run-limit accounting, start one
bounded Code Agent run with the trigger Run evidence contract and run-limit
evidence, preserve the target task id, task-memory guidance, first open
completion criterion, first source title, and post-step terminal-evidence
guidance in the bounded run request, keep the `workspaceWriteAllowed=false`
proposal-only boundary visible to the run, preserve Standing Approval scope
evidence, block the duplicate through in-sweep daily-limit counting, record
`panel.scheduled_event_agent_triggered` with target task, runtime-start
requirement, run-status evidence, and `workspaceWriteAllowed=false` timeline
boundary, expose top-level `startedRunIds` and
`blockedReasons`, report `skipReason=none` for completed sweeps, prove
`triggerKind` evidence for both manual and cron starts, prove startup
`scheduledEventAgentSweepJobConnected` evidence before the first cron tick, and keep
`workspace=unchanged`, `provider=not-called`, and `docker=not-started`.

The Agent API execution preflight is deliberately narrower than a full task
run: default output must include `status=skip`, `skipReason=opt_in_required`,
`provider=not-called`, `executionRun=deferred`, `promotionReady=no`,
`promotionRequirements=0/11`, `requiredGates=0/9`,
`promotionMissingRequirements=...`, `missingGates=...`, and
`workspace=unchanged`.
A passing opt-in run proves that the configured
provider can answer one Taskplane Agent API Runtime text request, while full
provider-visible task `execution_run` remains deferred behind the shared
context-readiness, Run Goal Contract, Write Intent, verification, and
evidence-persistence gates.

On 2026-05-26, local `fal-openrouter / google/gemini-2.5-flash` passed this
opt-in preflight with `provider=called`, `phrase=matched`,
`workspace=unchanged`, and `status=passed`.

Provider-spending checks are intentionally opt-in:

```bash
npm run accept:provider-native-live:preflight
npm run accept:provider-native-live
npm run accept:provider-native-live:run
```

Use these only when a deliberate live provider request is acceptable. Incomplete
preflight configuration must report `status=skip` and
`skipReason=config_missing` before any provider call.

## What to Test

For ordinary code changes:

- run `npm run verify`;
- add focused tests for the changed module;
- use renderer tests for user-visible workflow changes;
- use repository/service integration tests when persistence behavior changes.

For package/build changes:

- run `npm run smoke:build`;
- run `npm run smoke:release:mac` on macOS when the packaged app path may be
  affected.

For local-first recovery or config surfaces:

- run `npm run accept:packaged-recovery:mac` after producing a packaged app.
- run `npm run accept:product-surfaces:mac` when External Access, Decisions, or
  task-file surfaces may be affected.

## CI

GitHub Actions runs the verification workflow for pushes and pull requests when
enabled for the repository.

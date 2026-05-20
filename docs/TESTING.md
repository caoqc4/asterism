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
```

This checks the local SQLite database against the canonical data contract. Use
`node scripts/canonical-data-diagnostics.mjs --db /path/to/taskplane.db` after
`npm run build:main` to inspect a specific database.
`npm run diagnostics:canonical-data:optional` is the same read-only check but
skips successfully when no local database exists, which keeps fresh local alpha
environments reproducible.

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
```

The packaged task-bound Agent CLI smoke uses a fake Codex executable and fixture
runtime status, so it does not require a real account by default:

```bash
npm run smoke:agent-cli-task:mac
```

That smoke covers the first-version Agent CLI product loop inside the packaged
app: task-bound run creation, accepted and terminal run evidence, cancellation
evidence, read-only workspace protection, task dynamics replay, Run Goal
Contract/verifier/memory-proposal evidence, and explicit runtime-native goal
audit requests that are recorded but not forwarded.

Runtime-native goal discovery is manual and non-blocking. By default it only
probes local CLI version/help output, so it can be used to inspect command
shape without starting a goal:

```bash
npm run manual:agent-cli-native-goal-discovery
```

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
TASKPLANE_AGENT_CLI_NATIVE_GOAL_ARGS_JSON='["exec","--sandbox","read-only","/goal inspect disposable goal support"]' \
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
Evidence Gate before enabling any runtime-native forwarding.

The Agent API / sandbox execution lane remains gated and explicit while it
matures as a peer runtime. These commands are useful when maintaining that
runtime boundary, but they are not the first-run Agent CLI validation path:

```bash
npm run accept:agent-local
npm run accept:sandbox-coding
npm run accept:sandbox-coding:code-agent-ui
npm run accept:sandbox-coding:model-producer-preflight
```

The default preflight and smoke paths do not call external providers, start
Docker checks, or mutate a selected workspace unless their explicit environment
gates are enabled.

Provider-spending checks are intentionally opt-in:

```bash
npm run accept:provider-native-live:preflight
npm run accept:provider-native-live
npm run accept:provider-native-live:run
```

Use these only when a deliberate live provider request is acceptable.

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

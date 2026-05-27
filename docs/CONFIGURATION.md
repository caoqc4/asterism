# Configuration

## Config Model

Taskplane uses a dual configuration model.

For local development and validation, Taskplane also reads environment variables
from the process environment or a repo-root `.env` file. Environment variables
override non-sensitive `config.json` values at runtime and can provide an API key
without writing it to Keychain.

### Non-sensitive config

Stored in:

- `app.getPath('userData')/config.json`

Examples:

- AI provider
- model id
- optional OpenAI-compatible base URL
- optional read-only workspace root for opted-in agent runs
- feature flags
- scheduler enablement

Example shape:

```json
{
  "aiProvider": "anthropic",
  "aiModel": "claude-3-5-sonnet-latest",
  "aiBaseUrl": null,
  "workspaceRoot": null,
  "featureFlags": {
    "enableScheduler": false,
    "enableProviderNativeToolCalls": false,
    "enableSandboxCodingAgent": false,
    "enableSandboxPatchPromotionApply": false
  },
  "updatedAt": "2026-04-22T00:00:00.000Z"
}
```

### Sensitive config

Stored in the OS keychain via `keytar`.

Examples:

- AI API keys
- future OAuth credentials

These values are never written to `config.json`.

## Current Settings UI

The app currently exposes a Settings page for:

- provider selection
- model selection
- custom base URL for OpenAI-compatible providers
- read-only workspace root for opted-in agent runs
- API key storage
- scheduler enable/disable
- manual sandbox backend readiness detection

Supported provider values:

- `anthropic`: native Anthropic SDK path.
- `openai`: native OpenAI SDK path.
- `openai-compatible`: OpenAI-compatible relay using `Authorization: Bearer <key>` and the configured base URL. Taskplane uses the relay's `/chat/completions` path through the AI SDK.
- `fal-openrouter`: fal OpenRouter relay using `https://fal.run/openrouter/router/openai/v1` by default and `Authorization: Key <key>`. Taskplane uses the relay's `/chat/completions` path through the AI SDK.
- `replicate`: native Replicate prediction API using `https://api.replicate.com/v1` by default and `Authorization: Bearer <key>`.

Replicate native support currently covers prompt-to-text Run and Brief generation with text models that accept `prompt` and `system_prompt` inputs. Use a Replicate model slug such as `openai/gpt-oss-20b`. If the chosen Replicate-facing relay exposes an OpenAI-compatible `/v1` endpoint instead, use `openai-compatible`.

The UI is not the only config entry point. Advanced users can edit non-sensitive values in `config.json` directly.

## Local `.env`

Create `.env` in the repository root for local runs:

```bash
TASKPLANE_AI_PROVIDER=replicate
TASKPLANE_AI_MODEL=openai/gpt-oss-20b
TASKPLANE_AI_BASE_URL=
TASKPLANE_AI_API_KEY=your-test-key
TASKPLANE_WORKSPACE_ROOT=/absolute/path/to/your/workspace
TASKPLANE_ENABLE_SCHEDULER=false
TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS=false
TASKPLANE_ENABLE_SANDBOX_CODING_AGENT=false
TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER=false
TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY=false
```

Set `TASKPLANE_ENV_FILE=/absolute/path/to/.env` to load a different file.
Existing shell environment variables win over values from `.env`; this applies
to the app and to local preflight scripts. Preflight output prints `<set>` for
API keys instead of the key value.

Keep `TASKPLANE_ENABLE_SCHEDULER=false` for local AI/provider validation unless
you specifically want hourly brief snapshots and stale-run checks running in the
background. It is independent from provider-native tool-call validation.
Keep `TASKPLANE_ENABLE_SANDBOX_CODING_AGENT=false` unless you are deliberately
working on the disabled-by-default sandbox coding-agent lane; the flag is a
rollout gate and does not by itself expose broad code execution.
Keep `TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER=false` unless you are
deliberately validating the model-backed Code Agent producer. Even when this
flag is true, provider spend still requires the operator to select `Use model
producer` in a Code Agent run and confirm the run notice.
Keep `TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY=false` unless you are
deliberately validating approved sandbox patch promotion against a disposable
workspace. When enabled, approving a ready `workspace.staged_patch` Decision can
write the reviewed files after promotion preflight passes. When disabled,
reviewed-patch notices remain no-write and show a disabled apply action instead
of hiding the boundary.

### External Access: Gmail

Gmail is the first system default optional authorization item for External
Access. The page shows it by default, but Taskplane does not authorize, probe,
or sync Gmail until the user explicitly starts authorization. The current
read-only network connector can still be configured through environment-gated
credentials:

```bash
TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCESS_TOKEN=ya29...
TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCOUNT=user@example.com
TASKPLANE_EXTERNAL_ACCESS_GMAIL_QUERY=newer_than:7d
TASKPLANE_EXTERNAL_ACCESS_GMAIL_MAX_RESULTS=10
```

The token connector expects an OAuth access token with the minimum read-only
Gmail scope needed for message listing and metadata reads. The OAuth control
path stores only a refresh token in the local keychain and refreshes access
tokens only for task-bound evidence planning. Taskplane does not send email,
does not modify labels, and does not import full email bodies in this slice.

AI config/status reads only project the configured connector state. Gmail API
network calls are limited to task-bound source-ingestion planning, where message
metadata and snippets are normalized through `ConnectorSourceIngestionPlan`.
Gmail evidence is marked sensitive by default, so it requires review before it
can become task source material.

Use this read-only preflight before testing a Gmail token:

```bash
npm run accept:external-access:gmail-preflight
```

The preflight reports whether the token, account label, query, and result limit
are configured. It prints `<set>` for tokens and OAuth client secrets, accepts
either the static access-token path or the OAuth client-id path, and does not
call Gmail, inspect keychain refresh tokens, or write task memory.

The planned production OAuth path is documented in
`docs/plans/2026-05-17-gmail-oauth-design.md`. The intended direction is a
desktop installed-app OAuth flow with system-browser authorization, loopback
callback, refresh-token storage in keychain, access tokens kept short-lived, and
continued task-bound connector ingestion. Gmail OAuth remains out of the default
local acceptance gate until it has explicitly opted-in live validation.
`GmailOAuthTokenStore` stores refresh tokens in the keychain account
`external_access_gmail_refresh_token`. `GmailOAuthService` creates desktop
authorization URLs with PKCE/state, exchanges authorization codes, refreshes
short-lived access tokens on demand, and keeps token response bodies out of
surfaced errors. `createGmailOAuthLoopbackListener` captures only the OAuth code
and state on `127.0.0.1` with an ephemeral port, returns a close-browser page,
and closes itself. `createGmailOAuthAuthorizationSession` composes those pieces
into the browser-flow session used by the External Access page.
`GmailOAuthService.disconnect()` revokes the stored refresh token when one
exists, always deletes the local keychain refresh token, and keeps revoke
response bodies out of surfaced errors. `GmailConnectorAdapter` can use the
OAuth access-token provider; status reads still do not refresh tokens or call
Gmail, and the provider is called only when task-bound source ingestion lists
Gmail evidence.

OAuth refresh-token wiring can be enabled for local development with:

```bash
TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID=your-desktop-oauth-client-id
TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_SECRET=
```

When no static access token is configured, the connector factory can project a
stored keychain refresh token as configured Gmail status without network
probing. The refresh token is exchanged only during task-bound source-ingestion
planning.
Main-process Gmail OAuth connect/disconnect entrypoints now exist behind
explicit confirmation:

- `externalAccess:gmailOAuthConnect` opens the system browser, waits for the
  local loopback callback, and emits `settings.changed` only after the refresh
  token is stored.
- `externalAccess:gmailOAuthDisconnect` revokes when possible, clears the local
  keychain refresh token, and emits `settings.changed` after local credentials
  are cleared.

The External Access page exposes Gmail as a system default optional item. It is
visible by default but remains unauthorized until the user explicitly starts the
OAuth flow. The connect/disconnect controls do not mutate tasks, write task
memory, or start background Gmail sync.

The Settings page can manually detect the local sandbox backend. This is an
explicit button-triggered, read-only Docker availability probe; Taskplane does
not run it during startup or AI config status reads. A ready backend status is
only a prerequisite signal for later sandboxed coding-agent work and does not
enable code-agent execution by itself.

The same manual detection also displays Producer Backend readiness. That second
line combines the backend probe with the current feature flags and workspace
root. It should remain blocked when Docker is unavailable, when
`TASKPLANE_ENABLE_SANDBOX_CODING_AGENT=false`, or when no workspace root is
configured. For a terminal-only read-only check, run:

```bash
npm run accept:sandbox-coding:backend-preflight
```

The preflight does not start containers, pull images, run checks, or call AI
providers.

The real model-backed Code Agent producer path is additionally locked behind a
two-step gate. `TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER=true` only exposes
local capability in the Task detail Code Agent panel; a provider call still
requires the current run to select `Use model producer`, provide explicit
context files, keep at least one allowlisted check selected, and confirm the
operator notice. Use this read-only preflight before enabling the manual path:

```bash
npm run accept:sandbox-coding:model-producer-preflight
```

For the preflight to report `status=ready`, the local `.env` needs:

```bash
TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER=true
TASKPLANE_ENABLE_SANDBOX_CODING_AGENT=true
TASKPLANE_AI_PROVIDER=fal-openrouter
TASKPLANE_AI_MODEL=google/gemini-2.5-flash
TASKPLANE_AI_API_KEY=your-test-key
TASKPLANE_WORKSPACE_ROOT=/absolute/path/to/workspace
# Optional: comma-separated workspace-relative files to provide as read-only evidence.
TASKPLANE_CODE_AGENT_CONTEXT_FILES=src/example.ts,docs/notes.md
```

For `openai-compatible`, also set `TASKPLANE_AI_BASE_URL`. For `replicate`, use
an `owner/model` model id. `TASKPLANE_CODE_AGENT_CONTEXT_FILES` is optional; if
set, Taskplane validates those selected files before the model producer runs
and blocks path escapes, sensitive files, binary content, missing files, and
oversized context. The preflight only checks local configuration; it does not
call the provider, start Docker, or mutate the workspace.
When context files are configured, the preflight also checks that they are
workspace-relative, text-only, present under `TASKPLANE_WORKSPACE_ROOT`, and
within the current context size limits.

After the preflight reports `status=ready`, an explicit one-request live smoke
is available:

```bash
npm run accept:sandbox-coding:model-producer-live
TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_LIVE=true npm run accept:sandbox-coding:model-producer-live
npm run accept:sandbox-coding:model-producer-preview-smoke
TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_PREVIEW_SMOKE=true npm run accept:sandbox-coding:model-producer-preview-smoke
```

The default commands should report `status=skip`,
`skipReason=opt_in_required`, `provider=not-called`, `docker=not-started`, and
`workspace=unchanged`. If explicitly enabled without complete provider config,
they report `skipReason=config_missing` and still do not call the provider,
start Docker, or mutate the workspace. The model-producer live smoke sends one
provider request, validates the returned strict JSON through the staged-file
contract, and still does not start Docker or mutate the workspace. The
model-producer preview smoke also sends one provider request, but runs the
result through the local-container sandbox producer preview service on a
disposable workspace with an injected check runner; it does not start Docker and
does not mutate the selected workspace.

The producer preview service also has an opt-in non-live smoke path:

```bash
npm run accept:sandbox-coding:producer-preview-smoke
TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE=true npm run accept:sandbox-coding:producer-preview-smoke
TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE=true TASKPLANE_RUN_SANDBOX_PRODUCER_DOCKER_CHECKS=true npm run accept:sandbox-coding:producer-preview-smoke
```

The first command should report `skipped`. The second command builds the main
process code, creates a temporary workspace, runs the local-container producer
preview service with an injected producer loop and injected check runner, and
confirms the workspace stays unchanged. It does not start Docker or call AI
providers. The third command is the explicit Docker-backed check smoke: it may
start Docker containers or pull the default image, so keep it manual and run it
only when validating the local container backend.

For fal OpenRouter:

```bash
TASKPLANE_AI_PROVIDER=fal-openrouter
TASKPLANE_AI_MODEL=google/gemini-2.5-flash
TASKPLANE_AI_BASE_URL=
TASKPLANE_AI_API_KEY=your-fal-key
TASKPLANE_ENABLE_SCHEDULER=false
TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS=true
TASKPLANE_ENABLE_SANDBOX_CODING_AGENT=false
```

For a generic OpenAI-compatible relay:

```bash
TASKPLANE_AI_PROVIDER=openai-compatible
TASKPLANE_AI_MODEL=your-model-id
TASKPLANE_AI_BASE_URL=https://your-relay.example.com/v1
TASKPLANE_AI_API_KEY=your-test-key
TASKPLANE_ENABLE_SCHEDULER=false
TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS=true
TASKPLANE_ENABLE_SANDBOX_CODING_AGENT=false
```

## macOS Release Signing Variables

These values are not required for normal local development, unsigned package
smoke checks, or AI provider validation. Add them only when preparing a
dedicated signed/notarized macOS release pass:

```bash
CSC_NAME=
CSC_LINK=
CSC_KEY_PASSWORD=
APPLE_ID=
APPLE_APP_SPECIFIC_PASSWORD=
APPLE_TEAM_ID=
# Alternative notarization path:
APPLE_API_KEY=
APPLE_API_KEY_ID=
APPLE_API_ISSUER=
```

Use either a local keychain `Developer ID Application` certificate, `CSC_NAME`,
or `CSC_LINK` for signing certificate selection. When `CSC_LINK` is used,
`CSC_KEY_PASSWORD` is required. For Apple notarization, electron-builder accepts
either the Apple ID app-specific password group (`APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) or the App Store Connect API key
group (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`).

Before attempting actual signing or notarization, run:

```bash
npm run release:mac:preflight
```

The preflight is read-only. It reports missing local prerequisites without
signing, notarizing, uploading, or calling Apple services. Use
`npm run release:mac:preflight -- --strict` only when a missing prerequisite
should fail the shell command.

The full local verification gate does not require these signing or notarization
variables. Release readiness may still be `status=not-ready` until they are
configured, while ordinary unsigned package validation can pass.

## Read-Only Workspace Root

`TASKPLANE_WORKSPACE_ROOT` or `config.json.workspaceRoot` defines the root used by opted-in
read-only workspace agent runs.

When this value is empty, Taskplane blocks Agent CLI execution instead of guessing
from the app process working directory.

Settings changes are read when workspace tools execute, so changing the workspace root does not
require an app restart.

Current workspace tools are read-only:

- `workspace.search`
- `workspace.read_file`

Patch creation and command execution are not enabled.

## Agent CLI Capability Mode

Taskplane defaults Agent CLI runs to `native` mode. In this mode Taskplane does
not downgrade Codex CLI or Claude Code: the official CLI may use its own
read-only search, browse, source, documentation, and reasoning capabilities
according to that CLI's installed configuration and permission mode. Taskplane
still owns task context, run records, verification, and memory proposals.

In the Agent CLI path, the user's chat text is the user request sent to the
official CLI. Taskplane adds task state, Task.md/Task Records, source previews,
GoalPilot guidance, and run contracts as surrounding context, then performs
verification and memory proposal after the CLI returns. Taskplane should not
rewrite ordinary user turns into a separate product-authored request before
calling the CLI.

When a CLI exposes structured terminal events, Taskplane asks for that stream
and projects it into Run steps: Codex uses `codex exec --json`, and Claude Code
uses `claude -p --output-format stream-json --verbose`. Parsed tool/search/browse events
become capability-tagged steps such as `Codex CLI 联网检索：web_search` or
`Claude Code 命令执行：Bash`; if the stream shape changes or cannot be parsed,
Taskplane falls back to the terminal stdout summary instead of treating the run
as failed.

The Agent API Runtime remains a separate future invocation path. Current
Taskplane execution work prioritizes the native Agent CLI path.

To verify the future Agent API Runtime's provider-visible text-call readiness
without promoting task execution, run the opt-in preflight smoke:

```bash
npm run manual:agent-api-execution-preflight-smoke
TASKPLANE_RUN_AGENT_API_EXECUTION_PREFLIGHT_SMOKE=true npm run manual:agent-api-execution-preflight-smoke
```

The default command reports `status=skip`, `skipReason=opt_in_required`,
`provider=not-called`, `executionRun=deferred`, `promotionReady=no`,
`promotionRequirements=0/11`, `requiredGates=0/9`, and `workspace=unchanged`.
When explicitly enabled and provider config is complete, it sends one minimal
text request through the same provider mapping used by the API text path and
checks that a disposable
workspace remains unchanged. Passing output is Agent API provider-readiness
evidence only; full task `execution_run` remains deferred until the runtime
satisfies the shared Taskplane harness gates.

On 2026-05-26, this opt-in preflight passed locally with
`fal-openrouter / google/gemini-2.5-flash`, `provider=called`,
`phrase=matched`, `workspace=unchanged`, and `status=passed`.

The capability mode is stored in `featureFlags.agentCliCapabilityMode`:

- `native`: default. Respect the official CLI's native read-only capabilities.
  For research-like tasks, Taskplane may also run an optional OpenAI web-search
  source-capture step before invoking the CLI when the OpenAI bridge is
  configured. This records `Agent CLI 联网调研准备` plus Source Context evidence;
  when unavailable, the run step records the skip reason and the CLI can still
  use its own native tools.
- `audit_enhanced`: same native CLI execution path, with the source-capture
  expectation made explicit for audit-heavy tasks. This still requires the
  selected Provider to be OpenAI and an available OpenAI key.
- `restricted`: use only Taskplane-provided context. Do not use live web,
  search, connector, or external tools unless their results were already
  injected into the run context.

Set `TASKPLANE_AGENT_CLI_CAPABILITY_MODE=native|audit_enhanced|restricted` to
override the saved mode for local testing.

For local non-live acceptance of the Taskplane web-research bridge, run
`npm run smoke:agent-cli-web-research`. It uses mocked provider output to cover
fresh/current trigger detection, Source Context persistence, the
`Agent CLI 联网调研准备` Run step, and renderer progress mapping. Live source
capture still requires the OpenAI bridge configuration above.

To collect opt-in evidence for the selected native CLI's own web/search tool,
run one manual live smoke outside the default acceptance path:

```bash
TASKPLANE_RUN_AGENT_CLI_NATIVE_WEB_SEARCH_SMOKE=true npm run manual:agent-cli-native-web-search-smoke
TASKPLANE_RUN_AGENT_CLI_NATIVE_WEB_SEARCH_SMOKE=true TASKPLANE_AGENT_CLI_SMOKE_RUNTIME=claude npm run manual:agent-cli-native-web-search-smoke
```

The default command reports `status=skip`, `skipReason=opt_in_required`,
`cli=not-called`, `network=not-called`, and `workspace=unchanged`. Treat
passing output as manual runtime-readiness evidence only; static status probes
still rely on no-start help, workspace metadata, and provider-owned package
metadata.

On 2026-05-27, this opt-in smoke passed locally with Codex CLI
`codex-cli 0.125.0`, `auth=ready`, `workspace=unchanged`, `phrase=matched`,
`network=called`, and `status=passed`. The working invocation shape for this
version is `codex --search exec ...`; `--search` is a top-level Codex option,
not an `exec` subcommand option.

## Agent CLI Real Smoke

Agent CLI smoke tests are opt-in and call the user's locally installed official
CLI. They create a temporary workspace, ask the CLI to return a validation
phrase, and fail if the temporary workspace changes.

Codex CLI is the current primary verified path:

```bash
TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE=true npm run manual:agent-cli-readonly-smoke
```

The latest local live validation recorded on 2026-05-20 used Codex CLI
`codex-cli 0.125.0` and passed with `auth=ready`, `workspace=unchanged`,
`phrase=matched`, and `status=passed`. Treat this as manual acceptance evidence;
the default smoke path stays skipped unless the explicit environment flag is set.

Codex native Goal Mode is tracked separately from Taskplane Task Goal. The
adapter treats Codex CLI `0.133.0+` as native-goal capable, shows older Codex
versions as needing an update, and still keeps runtime-native goal passthrough
closed until the Taskplane evidence gate proves command shape, progress,
cancellation, memory, and source-of-truth boundaries. The default native-goal
discovery output reports `taskplaneGoalLoop=available`,
`nativeGoalForwarding=audit-only`, `passthrough=closed`, and
`continueWith=taskplane_goal_loop`, so a closed native-goal passthrough should
not be interpreted as Taskplane task advancement being blocked.

For a manual packaged-app live pass against the real local Codex account, build
the unpacked app first and then run the opt-in task smoke:

```bash
npm run dist:mac:dir
TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:agent-cli-task-live:mac
# Optional Claude Code pass when a local Claude account is ready:
TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME=claude TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:claude-agent-cli-task-live:mac
```

This path uses isolated app data, a temporary workspace, selected Agent CLI
read-only execution, and workspace snapshot comparison. It is not part of
default local acceptance because it calls the user's real CLI account.

The latest local packaged-app live validation recorded on 2026-05-20 used Codex
CLI `codex-cli 0.125.0` and passed with `auth=ready`, `workspace=unchanged`,
`phrase=matched`, and `status=passed`.

Claude Code support is implemented but its real smoke requires a local
`claude` command and a valid Claude account. Treat that smoke as optional
secondary adapter compatibility evidence. If that account is unavailable, keep
Claude smoke non-blocking and continue validating Codex CLI, Agent API,
scheduled/event, writeback, and recovery paths:

```bash
TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE=true TASKPLANE_AGENT_CLI_SMOKE_RUNTIME=claude npm run manual:agent-cli-readonly-smoke
```

The latest local Claude Code check on 2026-05-20 detected `claude` `2.1.144`
and authenticated CLI status, but the read-only execution returned a provider
account/organization error. The temporary workspace remained unchanged, so this
is a non-blocking account-readiness gap rather than a Taskplane workspace safety
failure.
On 2026-05-26, a focused Claude Code `stream-json --verbose` probe reached
provider execution and returned `401 authentication_failed`, confirming that the
remaining gap is Claude account/provider readiness. A Codex model should be
validated through the Codex CLI adapter; do not treat a third-party model behind
Claude Code as Claude readiness unless Claude Code exposes that provider as an
official supported execution path.

## Scheduler Flag

`featureFlags.enableScheduler`

When `true`:

- startup recovery runs
- startup brief generation runs
- hourly brief snapshots are scheduled
- stale run checks are scheduled

When `false`:

- scheduler jobs are not registered

## Provider-Native Tool Call Flag

`featureFlags.enableProviderNativeToolCalls`

This flag enables the current gated provider-native structured tool-call path for
tool-capable providers. It is persisted and can be overridden with
`TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS`.

Current boundaries:

- supported providers: `anthropic`, `openai`, `openai-compatible`, and `fal-openrouter`
- unsupported provider: `replicate` native text predictions
- provider-side tools are limited to policy-allowed safe-read schemas
- Taskplane does not pass local AI SDK `execute` handlers to providers
- local execution still requires provider payload extraction, adapter normalization,
  the provider-native session gate, and `AgentRunLoop` policy checks

Use this preflight before spending provider credit on a live local validation:

```bash
npm run accept:provider-native-live:preflight
```

When the preflight reports `status=ready`, run the live validation. It sends one
small provider request that forces the safe-read `task.inspect_context` tool
schema and verifies that the provider returns a matching tool call:

```bash
npm run accept:provider-native-live
```

To validate that a real provider tool call can cross the Taskplane RunService
boundary in an isolated temporary database, run:

```bash
npm run accept:provider-native-live:run
```

This command also spends one small provider request when preflight is ready.

## Fallback Behavior

If an AI API key is missing:

- run execution fails with an explicit reason
- brief generation falls back to a local text summary

This keeps the app usable even when AI credentials are not configured.

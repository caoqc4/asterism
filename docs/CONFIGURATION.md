# Configuration

## Config Model

Taskplane uses a dual configuration model.

For local development and alpha validation, Taskplane also reads environment variables from the
process environment or a repo-root `.env` file. Environment variables override non-sensitive
`config.json` values at runtime and can provide an API key without writing it to Keychain.

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
    "enableProviderNativeToolCalls": false
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
```

Keep `TASKPLANE_ENABLE_SCHEDULER=false` for local AI/provider validation unless
you specifically want hourly brief snapshots and stale-run checks running in the
background. It is independent from provider-native tool-call validation.

For fal OpenRouter:

```bash
TASKPLANE_AI_PROVIDER=fal-openrouter
TASKPLANE_AI_MODEL=google/gemini-2.5-flash
TASKPLANE_AI_BASE_URL=
TASKPLANE_AI_API_KEY=your-fal-key
TASKPLANE_ENABLE_SCHEDULER=false
TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS=true
```

For a generic OpenAI-compatible relay:

```bash
TASKPLANE_AI_PROVIDER=openai-compatible
TASKPLANE_AI_MODEL=your-model-id
TASKPLANE_AI_BASE_URL=https://your-relay.example.com/v1
TASKPLANE_AI_API_KEY=your-test-key
TASKPLANE_ENABLE_SCHEDULER=false
TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS=true
```

Set `TASKPLANE_ENV_FILE=/absolute/path/to/.env` to load a different file. Existing shell
environment variables win over values from `.env`.

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
```

Use either a local keychain `Developer ID Application` certificate, `CSC_NAME`,
or `CSC_LINK` for signing certificate selection. `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are the electron-builder
environment variables required for Apple notarization.

Before attempting actual signing or notarization, run:

```bash
npm run release:mac:preflight
```

The preflight is read-only. It reports missing local prerequisites without
signing, notarizing, uploading, or calling Apple services. Use
`npm run release:mac:preflight -- --strict` only when a missing prerequisite
should fail the shell command.

## Read-Only Workspace Root

`TASKPLANE_WORKSPACE_ROOT` or `config.json.workspaceRoot` defines the root used by opted-in
read-only workspace agent runs.

When this value is empty, Taskplane falls back to the app process working directory. Workspace
tools still remain disabled unless the user explicitly enables read-only workspace context for
that run.

Settings changes are read when workspace tools execute, so changing the workspace root does not
require an app restart.

Current workspace tools are read-only:

- `workspace.search`
- `workspace.read_file`

Patch creation and command execution are not enabled.

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

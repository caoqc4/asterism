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
    "enableScheduler": false
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
- `openai-compatible`: OpenAI-compatible relay using `Authorization: Bearer <key>` and the configured base URL.
- `fal-openrouter`: fal OpenRouter relay using `https://fal.run/openrouter/router/openai/v1` by default and `Authorization: Key <key>`.
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
```

For fal OpenRouter:

```bash
TASKPLANE_AI_PROVIDER=fal-openrouter
TASKPLANE_AI_MODEL=google/gemini-2.5-flash
TASKPLANE_AI_BASE_URL=
TASKPLANE_AI_API_KEY=your-fal-key
```

For a generic OpenAI-compatible relay:

```bash
TASKPLANE_AI_PROVIDER=openai-compatible
TASKPLANE_AI_MODEL=your-model-id
TASKPLANE_AI_BASE_URL=https://your-relay.example.com/v1
TASKPLANE_AI_API_KEY=your-test-key
```

Set `TASKPLANE_ENV_FILE=/absolute/path/to/.env` to load a different file. Existing shell
environment variables win over values from `.env`.

## Read-Only Workspace Root

`TASKPLANE_WORKSPACE_ROOT` or `config.json.workspaceRoot` defines the root used by opted-in
read-only workspace agent runs.

When this value is empty, Taskplane falls back to the app process working directory. Workspace
tools still remain disabled unless the user explicitly enables read-only workspace context for
that run.

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

## Fallback Behavior

If an AI API key is missing:

- run execution fails with an explicit reason
- brief generation falls back to a local text summary

This keeps the app usable even when AI credentials are not configured.

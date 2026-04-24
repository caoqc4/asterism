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
- feature flags
- scheduler enablement

Example shape:

```json
{
  "aiProvider": "anthropic",
  "aiModel": "claude-3-5-sonnet-latest",
  "aiBaseUrl": null,
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
- API key storage
- scheduler enable/disable

Supported provider values:

- `anthropic`: native Anthropic SDK path.
- `openai`: native OpenAI SDK path.
- `openai-compatible`: OpenAI-compatible relay using `Authorization: Bearer <key>` and the configured base URL.
- `fal-openrouter`: fal OpenRouter relay using `https://fal.run/openrouter/router/openai/v1` by default and `Authorization: Key <key>`.

Replicate's native API uses model-specific prediction inputs rather than a single chat-completions shape, so use `openai-compatible` only when the chosen Replicate-facing relay exposes an OpenAI-compatible `/v1` endpoint.

The UI is not the only config entry point. Advanced users can edit non-sensitive values in `config.json` directly.

## Local `.env`

Create `.env` in the repository root for local runs:

```bash
TASKPLANE_AI_PROVIDER=fal-openrouter
TASKPLANE_AI_MODEL=google/gemini-2.5-flash
TASKPLANE_AI_BASE_URL=
TASKPLANE_AI_API_KEY=your-test-key
TASKPLANE_ENABLE_SCHEDULER=false
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

# Configuration

## Config Model

Taskplane uses a dual configuration model.

### Non-sensitive config

Stored in:

- `app.getPath('userData')/config.json`

Examples:

- AI provider
- model id
- feature flags
- scheduler enablement

Example shape:

```json
{
  "aiProvider": "anthropic",
  "aiModel": "claude-3-5-sonnet-latest",
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
- API key storage
- scheduler enable/disable

The UI is not the only config entry point. Advanced users can edit non-sensitive values in `config.json` directly.

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

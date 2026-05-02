# Real Use Guide

Use this when moving from alpha validation into daily local use.

## Before First Real Use

Run the current non-live local handoff gate:

```bash
npm run accept:alpha-local
```

The current latest baseline has passed this end to end on macOS for the
unsigned/ad-hoc local app path.

## Launch The Packaged App

For real use, launch the packaged app without a temporary
`TASKPLANE_USER_DATA_DIR`:

```bash
ELECTRON_RUN_AS_NODE= \
release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane
```

Do not use the alpha walkthrough command with
`TASKPLANE_USER_DATA_DIR=/tmp/taskplane-alpha-walkthrough` for real work. That
path is intentionally disposable test state.

## First Session

Keep the first real session small:

1. Create one real task.
2. Add a summary and next step.
3. Add one source context item if useful.
4. Add one completion criterion.
5. Move the task through one normal state transition.
6. Return to Home and confirm the task appears in the expected recovery lane.
7. Save Settings with non-sensitive provider/model/workspace-root values.

Only add API keys after the basic local task loop feels correct.

## Safe Defaults

Keep these disabled unless you are deliberately validating the matching path:

- scheduler
- provider-native tool calls
- sandbox coding agent
- Code Agent model producer
- sandbox patch promotion apply

For normal real use, Code Agent, Browser Evidence, workspace write, command
execution, Docker-backed checks, provider-spending live validation, signing, and
notarization should remain manual and explicit.

## Local Data And Secrets

Taskplane stores non-sensitive app config in the app user-data directory as
`config.json`.

Sensitive credentials such as AI API keys are stored in the OS keychain via
Settings. They should not be committed to the repository or written into docs.

Local `.env` values can override runtime config during development and
validation. For daily use, prefer Settings for non-sensitive config and the OS
keychain for API keys.

## When To Stop And Fix

Pause real use and file a friction note if:

- data appears in an unexpected temporary user-data directory
- a task cannot be recovered from Home, Task detail, Decisions, or Runs
- the app suggests completion while an active blocker or dependency dominates
  the task
- any provider call, Docker action, workspace write, command execution, signing,
  notarization, upload, or Apple network action starts without explicit opt-in

Use [ALPHA_WALKTHROUGH.md](ALPHA_WALKTHROUGH.md) when you want a structured
manual pass instead of daily use.

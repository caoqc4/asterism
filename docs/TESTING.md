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

This includes `verify`, local agent/runtime gates, packaged release smoke,
packaged recovery smoke, product-surface packaged smoke, and the read-only macOS
release preflight.

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

This covers External Access empty/safety state, Decisions judgment-center
resolution, and task file open/save persistence in the packaged app.

Release readiness preflight:

```bash
npm run accept:release:mac-preflight
```

The preflight is read-only. It does not sign, notarize, upload, or contact Apple
services.

## Agent and Sandbox Gates

These commands keep higher-risk agent capabilities explicit and local:

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

# Releases

## Current Release Goal

The current release setup is focused on a local macOS packaging workflow first.

Current validated goal:

- produce a local macOS unpacked build
- keep packaging unsigned/ad-hoc signed for local validation
- verify the packaged app structure before any signed/notarized release work

Deferred goals:

- produce final macOS `dmg` and `zip` artifacts for distribution
- add Developer ID signing and notarization

## Commands

### Run the standard verification gate

```bash
npm run verify
```

This runs tests, type-checking, and the production build before packaging-specific checks.

### Run the build smoke check

```bash
npm run smoke:build
```

This verifies the packaged renderer, Electron main/preload entrypoints, and electron-builder file mapping before running heavier packaging commands.

### Produce an unpacked macOS app

```bash
npm run dist:mac:dir
```

This command rebuilds native modules for Electron before packaging and restores
the local Node ABI afterward. It currently produces:

- `release/mac-arm64/Taskplane.app`

After packaging, verify the unpacked app signature locally:

```bash
npm run smoke:package:mac
npm run smoke:runtime:mac
```

Or run the full unsigned local release smoke path in one command:

```bash
npm run smoke:release:mac
```

The package smoke check validates the app bundle, key `Info.plist` metadata,
native module unpacking, ASAR integrity metadata, required ASAR entries, absence
of compiled test files, executable bit, and the local code signature. The
runtime smoke check launches the packaged executable with isolated user data and
confirms it creates `config.json`, initializes the core `taskplane.db` SQLite
schema, and clears `ELECTRON_RUN_AS_NODE`.

### Check signed/notarized release readiness

```bash
npm run release:mac:preflight
```

This is a read-only local preflight. It does not sign, notarize, upload, or call
Apple services. It checks whether the current machine and environment have the
basic pieces electron-builder expects for a signed/notarized macOS pass:

- a macOS host with `notarytool`
- a `Developer ID Application` signing identity, `CSC_NAME`, or `CSC_LINK`
- `CSC_KEY_PASSWORD` when using `CSC_LINK`
- either `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`
- or `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`
- package metadata required for macOS artifacts

Use the strict form when the preflight should fail the shell command if any
required signing/notarization input is missing:

```bash
npm run release:mac:preflight -- --strict
```

### Produce macOS release artifacts

```bash
npm run dist:mac
```

Do not treat these artifacts as release-ready until signing and notarization are
configured and tested.

Artifacts are written to:

- `release/`

## Not Included Yet

- signed macOS artifact production
- notarization submission and stapling
- final branded icons
- Windows installer configuration
- Linux packaging

## Current Local Baseline

As of the current alpha path:

- `npm run verify` passes locally
- `npm run smoke:build` passed on 2026-05-01, covering renderer/main build
  outputs and electron-builder file mapping
- `npm run dist:mac:dir` passes locally
- `npm run smoke:package:mac` passes locally for the unpacked app
- `npm run smoke:runtime:mac` passes locally for isolated packaged startup and
  core SQLite schema initialization
- `npm run smoke:release:mac` passed on 2026-05-01 for the combined unsigned
  macOS path, including Electron native-module rebuild, unsigned/ad-hoc app
  packaging, package smoke, and isolated runtime smoke
- `npm run accept:release:mac-preflight` passed on 2026-05-01 without signing,
  notarizing, uploading, or calling Apple services. Current readiness is
  `not-ready`: macOS host, `notarytool`, app id, product name, and mac targets
  are present; Developer ID signing source and Apple notarization credentials
  are missing.
- notarization submission is skipped because the dedicated signed/notarized release pass has not been executed

## Why macOS first

- current development environment is macOS
- native dependency validation is easiest on the host platform
- release engineering can be proven on one platform before expanding to Windows and Linux

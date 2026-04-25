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
codesign --verify --deep --strict --verbose=2 release/mac-arm64/Taskplane.app
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

- code signing
- notarization
- final branded icons
- Windows installer configuration
- Linux packaging

## Current Local Baseline

As of the current alpha path:

- `npm run verify` passes locally
- `npm run smoke:build` passes locally
- `npm run dist:mac:dir` passes locally
- `codesign --verify --deep --strict --verbose=2 release/mac-arm64/Taskplane.app` passes for the unpacked app
- notarization is skipped because release credentials/options are not configured

## Why macOS first

- current development environment is macOS
- native dependency validation is easiest on the host platform
- release engineering can be proven on one platform before expanding to Windows and Linux

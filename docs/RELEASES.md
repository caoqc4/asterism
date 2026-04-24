# Releases

## Current Release Goal

The current release setup is focused on a local macOS packaging workflow first.

Initial goals:

- produce a local macOS unpacked build
- produce macOS `dmg` and `zip` artifacts
- keep packaging unsigned for local validation

## Commands

### Build the app

```bash
npm run build
```

### Run the build smoke check

```bash
npm run smoke:build
```

This verifies the packaged renderer, Electron main/preload entrypoints, and electron-builder file mapping before running heavier packaging commands.

### Produce an unpacked macOS app

```bash
npm run dist:mac:dir
```

### Produce macOS release artifacts

```bash
npm run dist:mac
```

Artifacts are written to:

- `release/`

## Not Included Yet

- code signing
- notarization
- final branded icons
- Windows installer configuration
- Linux packaging

## Why macOS first

- current development environment is macOS
- native dependency validation is easiest on the host platform
- release engineering can be proven on one platform before expanding to Windows and Linux

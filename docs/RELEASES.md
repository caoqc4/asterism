# Releases

## Current Scope

The release workflow currently focuses on local macOS packaging first:

- produce an unpacked macOS app;
- validate bundle structure and runtime startup;
- keep local packaging unsigned/ad-hoc signed by default;
- defer signed/notarized distribution until credentials and release policy are
  configured.

## Standard Verification

```bash
npm run verify
```

Run this before packaging-specific checks.

## Build Smoke

```bash
npm run smoke:build
```

This verifies renderer/main/preload build outputs and electron-builder file
mapping.

## Unpacked macOS App

```bash
npm run dist:mac:dir
```

This produces:

```text
release/mac-arm64/Taskplane.app
```

Then run:

```bash
npm run smoke:package:mac
npm run smoke:runtime:mac
```

Or run the combined path:

```bash
npm run smoke:release:mac
```

The combined smoke builds the unpacked app and validates package structure,
runtime startup, and packaged Timeline UI behavior.

## Packaged Recovery Checks

```bash
npm run accept:packaged-recovery:mac
```

This checks selected packaged UI recovery/config paths against an existing
unpacked app.

## Signed/Notarized Readiness

```bash
npm run release:mac:preflight
npm run accept:release:mac-preflight
```

These are read-only checks. They do not sign, notarize, upload, or contact
Apple services.

They inspect whether the current machine and environment have the pieces
electron-builder expects for a signed/notarized macOS pass:

- macOS host and `notarytool`;
- Developer ID signing identity or certificate source;
- Apple ID or App Store Connect API key notarization credentials;
- package metadata for macOS artifacts.

## Distribution Artifacts

```bash
npm run dist:mac
```

Do not treat generated `dmg` or `zip` artifacts as release-ready until signing
and notarization are configured and tested.

## Not Included Yet

- signed macOS artifact production;
- notarization submission and stapling;
- Windows installer configuration;
- Linux packaging.

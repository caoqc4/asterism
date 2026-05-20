# Build Resources

This directory holds packaging-time resources for Electron builds.

Current contents:

- `icon.png`: macOS packaging icon generated from the GoalPilot brand mark.

Source brand assets live under `src/renderer/assets/brand/`:

- `goalpilot-logo.png`: app mark used in the UI and packaging icon.
- `goalpilot-logo-ui.png`: small app mark generated for renderer UI imports.
- `goalpilot-wordmark.png`: full GoalPilot wordmark for future branded surfaces.

Keep package identity fields such as `appId` and release-data paths separate
from visual branding until a migration plan is ready.

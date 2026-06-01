# Build Resources

This directory holds packaging-time resources for Electron builds.

Current contents:

- `icon.png`: macOS packaging icon generated from the light-background
  asterism brand mark.

Source brand assets live under `src/renderer/assets/brand/`:

- `asterism-logo-dark-source.png`: dark-background source mark used for dark packaging previews.
- `asterism-logo-light-source.png`: light-background source mark used for the package icon.
- `asterism-logo-ui.png`: small app mark generated for renderer UI imports.

The macOS app keeps the legacy Taskplane userData directory for this rebrand
checkpoint, so visual branding and data storage identity remain separate.

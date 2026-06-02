# Public Alpha Readiness

## Status

asterism is a source-only alpha. It is suitable for local development,
contributor testing, and dogfood of the local-first Business -> Next Action ->
Agent run -> Review -> Writeback loop.

It is not a polished end-user release. There are no official signed or
notarized binaries, no auto-update channel, and no hosted service.

## Ready

- Local install and development from source with `npm install` or `npm ci`.
- Electron desktop shell through `npm run rebuild:electron && npm run dev`.
- Local-first persistence for Business, Next Action, tasks, decisions, runs,
  reviews, source context, and artifacts.
- Business creation, Business workspace navigation, and initial Next Action
  creation.
- Task-bound Agent CLI run path for logged-in Codex CLI or Claude Code
  installations.
- Run evidence, verifier, review, and business-line review surfaces.
- Writeback confirmation gates: agent output becomes evidence or proposals
  until the user confirms a write.
- Pending structured writeback and business-line review proposal recovery after
  restart for the current alpha path.
- `npm run verify:alpha` as the public alpha quick verification path.

## Partial

- The UI is usable but still alpha-grade. Copy, layout, and review surfaces are
  being hardened through real dogfood.
- Local macOS packaging works for your own machine, but the app is unsigned or
  ad-hoc signed and not notarized.
- Contributor experience is improving, but native module ABI switching is still
  a manual step.
- Packaged app and Agent CLI smoke checks exist, but they are opt-in and
  platform-specific.
- Screenshot and marketing assets are intentionally deferred until the product
  surface is stable enough to represent publicly.

## Deferred

- Official signed and notarized binaries.
- Auto-update.
- Agent API task execution. Provider/API configuration is optional and does not
  make full task execution ready by itself.
- Cloud sync, hosted service, and team collaboration.
- A stable plugin or extension API.
- Full recovery for every possible artifact/source/task-file proposal shape
  outside the current structured writeback and business-line review paths.

## Known Risks And Expected Warnings

- `npm run build` currently prints Vite's chunk-size warning for a JavaScript
  chunk larger than 500 kB. Treat it as an expected alpha warning unless the
  command exits non-zero.
- Native modules such as `better-sqlite3` and `keytar` must be rebuilt for the
  right runtime:
  - `npm run rebuild:electron` before `npm run dev` or local packaged app work;
  - `npm run rebuild:node` before Node/Vitest verification.
- Real Agent CLI runs require a locally installed and logged-in Codex CLI or
  Claude Code. CLI authentication stays in the official CLI.
- Provider/API configuration is optional and not required for local records,
  Business, or Tasks.
- A local packaged app can become stale after source changes. Rebuild with
  `npm run dist:mac:dir` before testing packaged UI behavior.
- Local unpacked macOS apps may trigger unsigned/not-notarized app warnings.

## How To Verify

Quick public alpha check:

```bash
npm run rebuild:node
npm run verify:alpha
```

Local development path:

```bash
npm install
npm run rebuild:electron
npm run dev
```

If you switch from Electron development back to tests:

```bash
npm run rebuild:node
```

Optional packaged and Agent CLI checks:

```bash
npm run dist:mac:dir
npm run smoke:package:mac
npm run smoke:runtime:mac
npm run smoke:agent-cli-task:mac
```

The packaged smoke commands use isolated local data. The Agent CLI task smoke
uses a fake Codex CLI by default. Real CLI dogfood is manual and opt-in; do not
run it against a sensitive workspace.

## Release Posture

The repository is public and licensed under MIT. The current distribution model
is source-only alpha. Users run from source or build a local unpacked app for
their own machine.

Do not treat generated `dmg`, `zip`, or unpacked app artifacts as official
release binaries until signing, notarization, release policy, and support
channels are configured and documented.

简短中文摘要：当前是仅源码 alpha，适合本地开发、贡献者验证和低风险 dogfood；没有官方签名包、公证包、自动更新或云服务。要跑快速验证，请使用 `npm run verify:alpha`。

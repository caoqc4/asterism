# Alpha Handoff

This is the short handoff note for the current local alpha path. Use the longer
logs only when you need audit detail:

- [ALPHA_ACCEPTANCE_ASSESSMENT.md](ALPHA_ACCEPTANCE_ASSESSMENT.md)
- [ALPHA_WALKTHROUGH.md](ALPHA_WALKTHROUGH.md)
- [REAL_USE.md](REAL_USE.md)
- [ALPHA_MANUAL_RUN_LOG.md](ALPHA_MANUAL_RUN_LOG.md)
- [TESTING.md](TESTING.md)
- [RELEASES.md](RELEASES.md)

## Current Status

Taskplane is functionally alpha-accepted for the local unsigned macOS path.
The core product loop is in place:

- create and recover tasks
- maintain source context, process context, blockers, dependencies, and
  completion criteria
- create and act on Decisions
- trigger and inspect Runs
- review artifacts and timeline evidence
- use Home, Tasks, Decisions, Runs, and Settings as the main local work surfaces
- validate Code Agent and Browser Evidence surfaces through non-live or
  explicitly gated local paths

Signed and notarized release execution is still deferred.

## Latest Local Baseline

As of 2026-05-02 on pushed `main`:

- `npm run accept:alpha-local` passed end to end on latest `main`.
- `npm test` passed with 128 test files / 951 tests.
- `npm run verify` passed with tests, type-checking, and production
  renderer/main builds.
- The alpha handoff constituents passed when run as focused commands:
  `accept:agent-local`, `accept:sandbox-coding:code-agent-ui`,
  `accept:sandbox-coding:model-producer-preflight`, `smoke:release:mac`,
  `accept:packaged-recovery:mac`, and `accept:release:mac-preflight`.
- `smoke:release:mac` rebuilt the unsigned/ad-hoc macOS app and passed package,
  runtime, and packaged Timeline UI smoke checks.
- `accept:release:mac-preflight` remained read-only and reported the expected
  `status=not-ready` because Developer ID signing and Apple notarization
  credentials are not configured.

A previous combined `npm run accept:alpha-local` attempt was interrupted after
Vitest stopped producing output. That did not reproduce on the latest full gate:
the complete command passed end to end.

## Validation Commands

For ordinary code changes:

```bash
npm run verify
```

For a complete non-live local alpha handoff check:

```bash
npm run accept:alpha-local
```

If the combined handoff command hangs after a passing Vitest phase, rerun the
same gate as focused commands:

```bash
npm test
npm run accept:agent-local
npm run accept:sandbox-coding:model-producer-preflight
npm run smoke:release:mac
npm run accept:packaged-recovery:mac
npm run accept:release:mac-preflight
```

For build or packaging changes, also keep:

```bash
npm run smoke:build
npm run smoke:release:mac
```

## Boundaries

Keep these out of scope unless a dedicated release or product decision opens
them:

- signed macOS artifact production
- notarization submission and stapling
- provider-spending live validation
- broad browser, computer-use, MCP, skills, or creator-tool model exposure
- new domain-object expansion
- automatic Code Agent starts, scheduler-driven agent starts, or queue workers
- normal prompt exposure for workspace write or command tools

The current accepted posture is local-first, manual-confirmed, inspect-first,
and non-live by default.

## Next Best Work

1. Run a human alpha walkthrough on the current unsigned app and capture only
   concrete product friction with [ALPHA_WALKTHROUGH.md](ALPHA_WALKTHROUGH.md).
2. Start daily local use with [REAL_USE.md](REAL_USE.md), keeping first-session
   scope small.
3. Fix small alpha friction without broadening the domain model.
4. Keep release docs and handoff notes concise as evidence changes.
5. Start signed/notarized release work only after Developer ID signing and Apple
   notarization credentials are available.
6. Revisit execution-layer expansion only through a separate accepted design
   slice.

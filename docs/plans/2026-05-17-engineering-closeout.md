# Engineering Closeout: Runtime, Memory, and Product Foundation

Updated: 2026-05-17

## Scope

This closeout covers the recent runtime deepening, task-memory framework, Decisions judgment center, task dynamics replay, Brief alignment, Capability/External Access foundation, packaged recovery smokes, and the local alpha acceptance gate.

Stage decision: the retained runtime and task-memory foundation work can close
for this phase. Remaining items are mostly future-entrypoint, future-connector,
or future-UI constraints; continuing to add runtime abstractions without a new
product surface would increase maintenance cost without improving the current
user workflow.

## What Is Now Covered

- Runtime gates are the shared entry path for current and future execution starts.
- Task memory has a dedicated specification and is referenced by the agent operating principles.
- Context clearing is treated as a runtime decision based on task-memory sufficiency, not a fixed five-turn rule.
- Task-memory write surfaces are classified through one policy matrix, and retained memory-write IPC channels are bound to that coverage.
- Canonical data diagnostics are part of local alpha acceptance without failing fresh environments that do not yet have a local SQLite database.
- Brief and Tasks share priority ordering behavior.
- Decisions is positioned as a judgment center, not a duplicate task list.
- Task dynamics has structured replay data and a task-centered timeline UI.
- External Access has a safe empty state and explicit authorization boundaries.
- Packaged app smoke coverage includes Brief recovery, task dynamics replay UI, External Access, Decisions, and task file open/save.
- Capability safety is projected through `ConfigurationSafetyReport`; Settings, Model, External Access, Skills, and MCP consume the shared projection.

## Verification

Verified on 2026-05-17:

```bash
npm run verify
npm run diagnostics:canonical-data:optional
npm run accept:agent-local
npm run accept:product-surfaces:mac
npm run accept:alpha-local
```

Result: passed. `diagnostics:canonical-data:optional` reported
`issues=0 / manualReview=0 / readOnly=0 / safeAutoRepair=0` against the local
database. The full alpha gate passed through verify, canonical diagnostics,
agent/runtime acceptance, packaged release smoke, packaged recovery smoke,
supplemental product-surface smoke, and release preflight.
After adding the opt-in local inbox connector, `accept:product-surfaces:mac`
was rerun and passed the External Access empty, fixture-connected, local-inbox,
Decisions, and task-file packaged checks.

Re-verified on 2026-05-18 after the capability-state and product-foundation
follow-up changes:

```bash
npm run test
npm run lint
npm run build
npm run diagnostics:canonical-data:optional
npm run accept:agent-local
npm run smoke:release:mac
npm run accept:packaged-recovery:mac
npm run accept:product-surfaces:mac
npm run accept:sandbox-coding:model-producer-preflight
npm run accept:release:mac-preflight
```

Result: passed for automated tests, type/build, canonical diagnostics,
agent-local gates, packaged release smoke, packaged recovery smoke, and
product-surface smoke. Canonical diagnostics reported
`issues=0 / manualReview=0 / readOnly=0 / safeAutoRepair=0`. The model producer
preflight returned the expected local `status=skip` because the opt-in model
producer and sandbox-coding flags were not enabled. The macOS release preflight
again returned `status=not-ready` because local Developer ID signing and Apple
notarization credentials were not configured; it performed no signing,
notarization, upload, Apple network request, live provider request, Docker
probe, or workspace mutation.

The release preflight completed with `status=not-ready` because the local
machine does not have Developer ID signing or Apple notarization credentials
configured; no signing, notarization, upload, Apple network request, live
provider request, Docker probe, or workspace mutation was performed.

Recent closeout commits:

- `d233fd2` Add local inbox packaged smoke.
- `317024e` Add opt-in local inbox connector.
- `46ce057` Make canonical diagnostics optional in alpha gate.
- `6066449` Bind memory write IPC channels to surface coverage.
- `8fbe6dc` Check memory write IPC handler coverage.
- `07289a2` Clarify packaged surface smoke coverage.
- Skills and MCP now use shared default optional catalogue definitions that
  feed the same `CapabilityRegistry` product-surface projection consumed by
  their pages. Skills keeps only Brainstorming as the first default optional
  catalogue item, and catalogue count is separated from ready count until a real
  Skills service promotes entries.

## Known Limits

- macOS release preflight can be `not-ready` on a local machine without Developer ID and notarization credentials.
- Live model-provider execution remains credentials-gated.
- Docker/local-container sandbox mutation remains host-capability-gated.
- Real external connectors are not smoke-tested until connector integrations exist.
- Future runtime entrypoints still need to register with the existing runtime gate, memory-surface, and capability registries before they count as retained behavior.

## Product Continuation

Next work should move to a concrete product surface instead of continuing
runtime deepening in isolation. Recommended order:

1. External Access connector growth: the first opt-in read-only local inbox
   adapter, Gmail network connector slice, Gmail OAuth control path, and
   confirmed source-review write bridge are connected through the existing
   capability and source-ingestion boundaries. Gmail has a read-only environment
   preflight that hides token values and performs no network call; add
   credentials-gated live OAuth smoke coverage only when real Google OAuth
   credentials are available.
2. Skills/MCP capability pages: reuse `ConfigurationSafetyReport` and
   `CapabilityRegistry` without changing settled Tasks-page layout. The first
   read-only safety strip is in place, and the pages now describe local
   catalogue/server registration as preview state rather than real
   model-visible tool exposure. Default Brainstorming and Playwright MCP entries
   now come from shared product-surface definitions; future work should replace
   those static defaults with real structured Skills/MCP status when those
   services exist.
3. Retrieval/search growth: the deterministic execution-memory index is in
   place; add broader search UI or semantic retrieval only when a concrete
   lookup workflow needs it.
4. Work Habits / method library growth: the retained boundaries now prevent
   task-specific facts from becoming global habits and dedupe equivalent
   manual/proposed/SOP memory; add richer method-library surfaces only when a
   real reuse workflow appears.
5. Decisions batch handling or richer navigation: only if a real multi-decision
   workflow appears.

Future product work should keep these constraints:

- new execution entrypoints must use `RuntimeEntrypointCoverage`;
- new durable information writes must use `MemorySurfaceWriteCoverage`;
- new source ingestion must use `ConnectorSourceIngestionPlan`;
- new capability surfaces must reuse `CapabilityRegistry` and
  `ConfigurationSafetyReport`;
- settled Tasks-page layout and interactions should stay unchanged unless a
  product feature explicitly requires data wiring into existing components.

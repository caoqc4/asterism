# Code Agent Model Context Decision

## Status

Drafted as the next model-backed Code Agent boundary after selected workspace
file context.

This document does not approve automatic context injection, MCP execution,
Skills execution, browser evidence reuse, authenticated browsing, external
posting, or model-visible coding tools.

Read with:

- [AGENT_EXECUTION_SANDBOXED_CODING_PRODUCER_DESIGN.md](AGENT_EXECUTION_SANDBOXED_CODING_PRODUCER_DESIGN.md)
- [AGENT_EXECUTION_SANDBOX_BACKEND_REVIEW.md](AGENT_EXECUTION_SANDBOX_BACKEND_REVIEW.md)
- [CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md](CODE_AGENT_MODE_PRODUCT_SURFACE_DECISION.md)

## First-Principles Decision

Model context is an authority boundary, not just a convenience feature.

Taskplane may have many useful local records: task summaries, source context,
artifacts, browser evidence, prior run outputs, process templates, and future
Skills/MCP observations. But once any of that content enters a provider prompt,
it has crossed from local product memory into provider-visible execution input.

Therefore the default rule is:

```text
locally available does not mean provider-visible
```

The model-backed Code Agent should receive only context that is:

- explicitly selected for this run
- bounded in size and type
- shown as read-only evidence
- recorded in RunSteps or equivalent audit metadata
- compatible with the sandbox and Decision promotion policy

## Current Accepted Context

### Selected Workspace Files

Accepted now.

The Task detail Code Agent surface can collect explicit workspace-relative file
paths. The main service reads only those selected text files from the configured
workspace root, blocks path escapes, sensitive paths, binary files, missing
files, oversized files, and absent context, then injects the content into the
model producer prompt as read-only evidence.

This is enough for the first model-backed preview because it keeps the
operator's intent clear: "use these files as context for this patch."

## Candidate Next Context Sources

### Taskplane Source Context

Manifest-only selection is accepted now. Content inclusion is accepted only
through the separate explicit opt-in below.

Source context can contain pasted docs, links, notes, decisions, credentials by
mistake, or private strategy. It must not be auto-included merely because it is
attached to the task. The first safe shape is a checkbox or picker that selects
specific source-context items for the run, with a count/preview summary before
provider calls.

The current Code Agent surface may record selected source-context ids and
titles in the provider-visible context manifest for audit. That manifest does
not send source-context content, notes, or URI page bodies to the provider.

### Taskplane Source Context Content

Accepted now behind a separate explicit content opt-in.

Source-context content can become model-visible only when all of these
conditions are true:

- the run is already explicitly using the model producer
- at least one bounded workspace context file is still selected
- the operator separately opts in to include selected source-context content,
  distinct from selecting source-context ids for the manifest
- only source-context records attached to the current task can be included
- only the stored local snapshot fields can be included: title, kind, uri,
  note, and content
- Taskplane must not fetch linked URLs, browser pages, MCP resources, or
  external documents as part of this slice
- each item and the total source-context payload must have byte limits before
  provider runtime config is resolved
- the RunStep manifest must record item count, item ids/titles, and whether
  content was included, without dumping raw source-context content into the
  RunStep
- the model prompt must render source-context content in a separate read-only
  evidence section from workspace files
- invalid, duplicate, or detached source-context ids must fail closed before
  provider runtime config is resolved

If source context is selected without the separate content opt-in, selection is
audit-only and remains `contentIncluded=false`.

### Recent Artifacts And Run Outputs

Potentially acceptable next, but not yet accepted as model-visible content.

Artifacts and run outputs may include generated drafts, browser extracts,
provider outputs, stack traces, paths, and local state. They need the same
explicit selection and bounded rendering rule. Patch artifacts should be
handled carefully to avoid feeding an already rejected or stale patch back into
the model as if it were accepted truth.

Manifest-only selection is accepted now:

- the operator can select task-attached artifact ids for audit
- Taskplane records artifact id, title, kind, source run id, and whether content
  was included
- artifact content defaults to `contentIncluded=false`
- patch artifacts, browser evidence, and failed run outputs remain
  content-ineligible in this slice
- selected artifact ids must belong to the current task
- invalid or detached artifact ids fail closed before provider runtime config
  is resolved

Artifact or run-output content remains unaccepted. Any future content path
needs kind-specific policy, byte limits, source-run status checks, stale-patch
handling, and a prompt section that labels generated material as prior output
rather than accepted truth. The backend rejects any attempted
`includeArtifactContent=true` request before provider runtime config is
resolved.

### Retrieval Snippets

Deferred.

Retrieval is useful, but it adds a second selection mechanism: Taskplane would
choose snippets on the user's behalf. Before that is allowed, the retrieval
query, source set, ranking, omitted results, and total token budget need to be
visible in run evidence.

### Skills, MCP, Browser Evidence

Deferred until connector-specific policy slices are accepted.

Skills can encode procedure, MCP can expose external resources, and browser
evidence can carry page content. Each needs its own credential, network,
staleness, and user-consent boundary before becoming provider-visible Code
Agent context.

## Implementation Sequence

1. Keep selected workspace files as the only model-backed Code Agent context.
2. Add a non-executing "provider-visible context selection" abstraction that can
   represent selected files and future selected Taskplane objects. Accepted for
   selected workspace files.
3. Add explicit source-context selection in the Code Agent surface.
   Accepted as manifest-only selection by default: selected source context
   ids/titles can be recorded for audit without content entering the model.
4. Persist the selected context manifest as a RunStep before provider runtime
   config is resolved. Accepted with per-item content visibility: selected
   workspace files can be prompt evidence, selected source context remains
   manifest-only unless the separate source-context content opt-in is enabled.
5. Render the selected context manifest on Runs detail without dumping full
   provider prompt contents.
6. Evaluate artifact/run-output selection after source-context manifest
   selection is visible.
7. Define and implement explicit source-context content opt-in using the
   source-context content conditions above. Accepted for stored local
   source-context snapshots only; this does not include artifact, browser, MCP,
   Skills, retrieval, or external URL-fetching behavior.
8. Evaluate task-attached artifact selection as manifest-only audit data before
   any artifact or run-output content enters the model prompt. Accepted for
   task-attached artifact ids/titles/kinds/source-run metadata only; artifact
   content remains provider-invisible.

## Non-Goals

- no automatic inclusion of all task context
- no provider-visible MCP resources
- no provider-visible browser evidence
- no Skills execution or hidden skill prompt expansion
- no credential-bearing context
- no broad retrieval without a visible source manifest
- no workspace mutation without Decision promotion

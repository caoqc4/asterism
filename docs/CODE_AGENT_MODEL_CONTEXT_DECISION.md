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

Potentially acceptable next, but only by explicit selection.

Source context can contain pasted docs, links, notes, decisions, credentials by
mistake, or private strategy. It must not be auto-included merely because it is
attached to the task. The first safe shape is a checkbox or picker that selects
specific source-context items for the run, with a count/preview summary before
provider calls.

### Recent Artifacts And Run Outputs

Potentially acceptable after source context.

Artifacts and run outputs may include generated drafts, browser extracts,
provider outputs, stack traces, paths, and local state. They need the same
explicit selection and bounded rendering rule. Patch artifacts should be
handled carefully to avoid feeding an already rejected or stale patch back into
the model as if it were accepted truth.

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
   Accepted as manifest-only selection: selected source context ids/titles can
   be recorded for audit, but source-context content is not yet sent to the
   model.
4. Persist the selected context manifest as a RunStep before provider runtime
   config is resolved. Accepted with per-item content visibility: selected
   workspace files can be prompt evidence, selected source context remains
   manifest-only.
5. Render the selected context manifest on Runs detail without dumping full
   provider prompt contents.
6. Only after that, evaluate artifact/run-output selection.

## Non-Goals

- no automatic inclusion of all task context
- no provider-visible MCP resources
- no provider-visible browser evidence
- no Skills execution or hidden skill prompt expansion
- no credential-bearing context
- no broad retrieval without a visible source manifest
- no workspace mutation without Decision promotion

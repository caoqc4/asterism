# Open Source Strategy

This document records the current public-facing repository strategy for
asterism. It is intentionally lightweight and should be revised as the release,
support, and commercial surfaces become clearer.

## Current License

asterism is currently licensed under the MIT License.

## Why MIT for Now

MIT keeps the project easy to inspect, fork, modify, and reuse while the core
architecture is still changing. It also matches the current goal: make the
local-first desktop workbench understandable and useful to outside developers
without adding a heavier contribution or patent framework before the public
surface is stable.

## Why Not Apache 2.0 Yet

Apache 2.0 may be a better fit later if the project needs an explicit patent
grant, larger organizational adoption, or a more formal contribution model. For
now, switching licenses would add process before there is a clear practical
need. The current strategy is to keep MIT and revisit the license if the risk
profile changes.

## Why Not Open-core Yet

asterism is not being split into open-core and commercial editions at this
stage. The immediate priority is to make the local-first product, safety model,
runtime boundaries, and contributor documentation coherent in one public codebase.

Future commercial surfaces can be added without splitting the core repository
early. Candidate surfaces include:

- cloud sync;
- team collaboration features;
- hosted agent runs;
- enterprise connectors;
- paid support, onboarding, or managed deployment help.

## Public Release Checklist

Before making the repository public, complete at least this checklist:

- Review `docs_private` references and decide whether private planning material
  should be removed from the public repository, moved to a private repository,
  or kept out of indexed public documentation.
- Run a secret and history scan, including committed history and generated
  artifacts.
- Publish or confirm a security contact path.
- Decide whether to add a Code of Conduct before inviting outside
  contributions.
- Confirm that the English and Chinese README entry points clearly state
  source-only alpha distribution and no official signed binaries yet.
- Confirm GitHub About metadata, topics, license detection, and README wording.
- Confirm that public docs do not promise unavailable screenshots, releases,
  hosted services, support channels, or compatibility guarantees.

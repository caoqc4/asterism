# Open Source Strategy

This document records the current public-facing repository strategy for
asterism. It is intentionally lightweight and should be revised as the release,
support, and commercial surfaces become clearer.

## Current License

asterism is currently licensed under the Apache License, Version 2.0.

## Why Apache 2.0

Apache 2.0 keeps the project permissive while adding an explicit patent grant
and a clearer contribution default. That fits a local-first desktop workbench
that may grow into deeper runtime integrations, external connectors, hosted
surfaces, or organizational adoption.

The repository should keep the standard Apache 2.0 `LICENSE` text and a top-level
`NOTICE` file in source and binary distributions. Project metadata should use
the SPDX identifier `Apache-2.0`.

## Third-party Notices

The project license does not change third-party dependency licenses. Before
official binary distribution, generate or review third-party license notices for
packaged dependencies and make sure the release artifact preserves required
license and attribution material.

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
- Confirm [Public alpha readiness](PUBLIC_ALPHA_READINESS.md) reflects the
  current ready/partial/deferred status before pointing new public users to the
  repository.
- Confirm GitHub About metadata, topics, license detection, and README wording.
- Confirm that public docs do not promise unavailable screenshots, releases,
  hosted services, support channels, or compatibility guarantees.
- Confirm future public docs follow
  [Documentation scope](DOCUMENTATION_SCOPE.md).

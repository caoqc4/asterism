# Documentation Scope

## Purpose

Public documentation is part of the asterism product surface. It should help
outside users, contributors, and security reviewers understand what the product
does, how to run it, and where its safety boundaries are.

Public docs are not an internal working-memory dump. Do not publish raw
planning notes, manual logs, local machine records, or exploratory scratchpads
just because they were useful during implementation.

## Public By Default

These files and directories are public by default when they are accurate and do
not contain private operational details:

- `README.md`
- `README.zh-CN.md`
- `LICENSE`
- `SECURITY.md`
- `CONTRIBUTING.md`
- Core user and contributor docs under `docs/`

Core docs include architecture, safety, configuration, development, testing,
release, and public repository strategy material.

## Public With Review

`docs/specs/*` is public with review.

Specs are runtime and internal contract documentation. They may keep
compatibility protocol names when those names are required to explain existing
storage, APIs, environment variables, or runtime gates. They must still avoid
misleading users about the public product name, current release status, support
guarantees, hosted services, or signed binaries.

## Private By Default

These materials should stay private by default:

- `docs_private`
- `docs/plans`
- manual validation logs
- dogfood notes
- RC checkpoint reports
- implementation scratchpads
- product strategy drafts

Do not move these files into the public repository as-is.

## Promotion Rule

Internal documentation can be promoted only after it becomes stable,
maintainable, and externally useful.

Before promotion, rewrite the material into a durable public explanation, remove
local or private evidence, collapse timeline-specific notes into current
guidance, and place the result in the appropriate `docs/` page.

## Pre-Push Checklist

Before pushing documentation to the public repository, check:

- no secrets, tokens, credentials, private keys, or OAuth material;
- no private filesystem paths, local usernames, or local machine data;
- no unpublished customer, vendor, account, or personal data;
- no obsolete brand used as the user-facing product name;
- no promise of official signed binaries, notarized releases, auto-update,
  cloud services, support channels, or compatibility guarantees unless that
  surface is actually available and documented;
- no raw manual logs, dogfood notes, RC checkpoint reports, implementation
  scratchpads, or product strategy drafts.

## Old Naming Policy

`Taskplane`, `GoalPilot`, `TASKPLANE_*`, `TaskplaneWriteback*`, and
`taskplane.db` may remain as internal protocol, runtime, environment,
compatibility, or storage names where changing them would obscure current
behavior or migration history.

These names must not be used as the public product brand. User-facing product
docs should call the product `asterism` unless they are explicitly explaining an
internal compatibility name.

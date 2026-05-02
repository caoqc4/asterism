# Contributing

Thanks for contributing to Taskplane.

## Before You Start

- Read [README.md](README.md)
- Read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- Read [docs/CONFIGURATION.md](docs/CONFIGURATION.md)

## Project Principles

- Keep renderer logic UI-focused.
- Keep business rules in the Electron main process.
- Do not bypass IPC boundaries for convenience.
- Prefer small, reviewable changes over large mixed refactors.

## Local Workflow

### Install dependencies

```bash
npm install
```

### Run the app

```bash
npm run dev
```

### Validate before opening a PR

```bash
npm run verify
```

Run `npm run smoke:build` as well when package, build, Electron entrypoint, or
packaging configuration changes. Use `npm run accept:alpha-local` for a full
non-live local alpha handoff check, not for every ordinary PR.

## Pull Request Expectations

- Explain the user-facing goal of the change.
- Mention any architecture or data-model impact.
- Keep scope focused when possible.
- Include follow-up work separately instead of bundling unrelated cleanup.

## Areas That Need Extra Care

- config and keychain handling
- SQLite schema changes and compatibility
- scheduler behavior
- AI execution and failure handling
- IPC contracts shared across main and renderer

## Design Discussions

Internal product and architecture working notes are not part of the public repo surface by default. Public-facing changes should be documented in repo-visible docs when they affect contributors.

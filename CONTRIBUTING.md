# Contributing

Thanks for contributing to asterism.

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

Use `npm ci` when you want a clean install that exactly follows
`package-lock.json`.

### Run the app

```bash
npm run rebuild:electron
npm run dev
```

If you later run Node/Vitest commands in the same checkout, switch native
modules back first:

```bash
npm run rebuild:node
```

### Validate before opening a PR

For docs, UI copy, onboarding, and small public-alpha changes:

```bash
npm run verify:alpha
```

For runtime, IPC, domain, native-module, packaged-app, or broader product
behavior changes:

```bash
npm run verify
```

Run `npm run smoke:build` as well when package, build, Electron entrypoint, or
packaging configuration changes. Run the package or release smoke commands
listed in [docs/TESTING.md](docs/TESTING.md) when your change affects packaged
runtime behavior.

`verify:alpha` does not require a signed binary, real provider key, live Agent
CLI account, external workspace write, or GitHub Actions. Agent CLI live smokes
are manual opt-in checks only.

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

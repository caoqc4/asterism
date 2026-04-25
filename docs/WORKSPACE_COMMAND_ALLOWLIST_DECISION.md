# Workspace Command Allowlist Decision

## Status

Accepted for the first registry-level implementation.

`workspace.run_command` is implemented as a confirmed package-script runner, but
it remains absent from model prompts and normal agent plans until a later UI /
policy opt-in slice deliberately exposes it.

## Decision

The first command-running slice should be an explicitly confirmed, package-script
runner. It should not expose arbitrary shell execution.

Allowed command shape:

```json
{
  "summary": "Why this command is needed",
  "script": "test",
  "args": ["src/main/domain/run/agent-tool-registry.test.ts"],
  "timeoutMs": 120000
}
```

Taskplane should resolve `script` through the configured workspace root
`package.json` scripts and execute it as:

```text
npm run <script> -- <args...>
```

The tool must use argument arrays, not a shell string.

## Initial Allowlist

Start with targeted local validation scripts only:

- `test`
- `lint`

Do not include broad verification, build, packaging, or release scripts in the
first slice. Do not include `verify`, `build`, smoke scripts, `dist:mac`,
`dist:mac:dir`, package-manager install scripts, git remote commands,
deployment commands, credential commands, or arbitrary user-provided commands.

## Execution Policy

Defaults:

- `allowLocalCommandRun=false`
- command execution requires a confirmation checkpoint
- command execution remains absent from model prompts and normal agent plans
- command execution is disabled unless a future UI opt-in explicitly enables it

Runtime rules:

- cwd is always the configured workspace root
- the workspace root must contain the `package.json` used for script lookup
- reject missing scripts
- reject scripts outside the allowlist
- reject script names or args containing path traversal only when they are used
  as file paths by a later richer schema; the first slice treats args as plain
  argv values
- inherit a minimal environment only; do not inject API keys by default
- set `CI=1` for deterministic local validation where appropriate
- capture stdout and stderr with truncation
- mark timeout and non-zero exit as tool failures
- never retry automatically

## Confirmation UX

Before execution, create:

- a `run_checkpoint` with status `open`
- a pending `Decision` linked to the checkpoint
- a Runs-page summary showing script, args, timeout, cwd, and expected result

Approval resumes the command once. Defer or cancel settles the run as failed for
that pending action, matching the current workspace patch checkpoint semantics.

## Non-Goals

- no arbitrary shell strings
- no long-running daemon or process manager
- no package installation
- no network publishing
- no git push, release upload, deployment, or remote mutation
- no command execution from model proposals before UI/policy opt-in exists

## Testing Requirements

Accepted implementation coverage:

- unit tests reject disabled policy, missing package scripts, and
  non-allowlisted scripts
- integration test runs a harmless allowlisted script in a temp workspace
- checkpoint test proves no command executes before approval
- Decision approval test proves the approved checkpoint resumes exactly once
- renderer test shows command checkpoint summary and read/write/command
  capability separation
- run-loop test proves model-proposed command steps fall back unless a later
  prompt/UI slice intentionally exposes them
- full `npm run verify` passes locally

Recent hardening:

- missing workspace-root `package.json` now fails with an explicit
  `workspace.run_command` error before any checkpoint is created
- timeout behavior is covered with a clamped 1000ms local package-script test
- broad verification scripts such as `verify` are rejected by the first
  command allowlist

## Resolved Questions

- Allowlisted scripts stay fixed in code for the first registry-level slice.
  Config-backed allowlists are deferred until there is a user-facing command
  opt-in.
- Successful command output remains a run-step observation, not a first-class
  Artifact, until a later workflow shows that command output needs artifact
  lifecycle behavior.
- `verify`, build, and smoke scripts are excluded from the first command
  allowlist. They can be reconsidered only after a user-facing command opt-in
  has a clearer review model.

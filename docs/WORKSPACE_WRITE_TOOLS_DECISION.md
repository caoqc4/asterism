# Workspace Write Tools Decision

## Status

Draft decision for the next execution-layer phase. Do not implement
`workspace.write_patch` or `workspace.run_command` until this document is
accepted and the packaged read-only workspace path has been manually repeated.

## Decision

Taskplane will add workspace write and command tools only as explicitly
confirmed, resumable agent actions. The first write-capable phase should support
patch proposal and local command execution as separate capabilities:

- `workspace.write_patch`: applies a bounded textual patch inside the configured
  workspace root.
- `workspace.run_command`: runs a bounded command inside the configured
  workspace root.

Both tools must be disabled by default, unavailable to model prompts unless the
run opts in, and blocked by a confirmation checkpoint before execution.

## Why

Read-only workspace context is now useful enough for coding-like tasks: an agent
run can search/read local files, persist observations, expose `fileContext`, and
return final output instead of raw proposal JSON. The next capability jump is
local mutation. That jump changes the risk profile from "inspect context" to
"modify a user's working tree or run code on their machine", so it needs a
stronger product boundary than the current read-only tools.

## Non-Goals

- No autonomous command execution.
- No shell access outside the configured workspace root.
- No background long-running process manager in this phase.
- No credential, network, package-manager, git push, or destructive command
  execution without a later dedicated decision.
- No direct SQLite mutation by external executors.

## Policy Model

Add explicit policy flags rather than overloading read access:

```ts
type AgentPolicy = {
  allowLocalWorkspaceRead: boolean;
  allowLocalFileWrite: boolean;
  allowLocalCommandRun: boolean;
  confirmationRequiredRisks: AgentToolRisk[];
};
```

Defaults:

- `allowLocalWorkspaceRead=false`
- `allowLocalFileWrite=false`
- `allowLocalCommandRun=false`
- local write and command risks require confirmation

The UI should present write/command opt-ins separately from read-only context.
Read-only workspace access must remain independently useful.

## Patch Tool Boundary

`workspace.write_patch` input should be structured:

```ts
{
  "summary": "Short human-readable intent",
  "patch": "*** Begin Patch\n...",
  "expectedFiles": ["relative/path.ts"]
}
```

Rules:

- Resolve every touched path through the configured workspace root.
- Reject path traversal, absolute paths outside root, binary files, and files
  above a configured size limit.
- Generate a diff preview before applying.
- Require a confirmation checkpoint that stores the summary, file list, and
  diff preview.
- Apply only after the checkpoint is approved.
- Persist the applied diff as a run step and as a task artifact when useful.

Rollback in the first phase is "show the reverse diff", not automatic revert.
Automatic revert can come later after the product has a clearer undo model.

## Command Tool Boundary

`workspace.run_command` input should be structured:

```ts
{
  "summary": "Why this command is needed",
  "command": "npm",
  "args": ["test", "--", "src/main/domain/run/run-service.integration.test.ts"],
  "timeoutMs": 120000
}
```

Rules:

- Use command plus args, not a shell string.
- Run with `cwd` set to the configured workspace root.
- Start with an allowlist: test, lint, build, and smoke commands from the local
  package scripts are acceptable candidates.
- Reject commands involving network publishing, credential inspection, global
  installs, destructive file operations, or git remote mutation.
- Capture stdout/stderr with size limits.
- Require confirmation before execution.
- Mark timeout and non-zero exit as tool failures, not silent partial success.

## Confirmation UX

Before a write or command runs, Taskplane should create:

- a `run_checkpoint` with status `open`
- a pending `Decision` linked to the checkpoint
- a readable Runs-page checkpoint summary

The approval screen should show:

- tool name and risk category
- intended files or command
- diff preview or command arguments
- expected result
- clear approve / defer / cancel actions

Approving resumes the tool. Deferring or cancelling settles the run as
non-resumable for that action unless a later resume policy is designed.

## Testing Requirements

Before implementation is accepted:

- Unit tests prove path traversal and disabled-policy calls fail.
- Repository tests prove checkpoint payloads persist enough context to resume.
- Run loop tests prove write/command steps are never exposed without opt-in.
- Renderer tests prove the UI distinguishes read-only context from write/command
  capability.
- An isolated integration test applies a harmless patch to a temp workspace.
- An isolated integration test runs an allowlisted command in a temp workspace.
- Full `npm run verify` passes locally; GitHub Actions remains unused while
  quota is unavailable.

## Open Questions

- Should patch approval live in Decisions only, or should Runs get a dedicated
  diff modal first?
- Should command allowlists be configured in `config.json`, package scripts, or
  both?
- Should approved write tools create completion evidence automatically, or only
  ordinary run artifacts?
- What is the first real user-facing workflow that justifies write access:
  code patching, document editing, test execution, or release preparation?


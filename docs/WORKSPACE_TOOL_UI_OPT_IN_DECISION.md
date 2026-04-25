# Workspace Tool UI Opt-In Decision

## Status

Proposed. Do not expose workspace patch or command tools to normal agent prompts
until this decision is accepted and manually validated.

## Decision

Keep workspace mutation tools registry-only for the next alpha slice.

Current registry-level tools:

- `workspace.write_patch`
- `workspace.run_command`

Both can be exercised through acceptance tests and confirmation checkpoint
resumption, but neither should appear in normal model prompts or task/run form
opt-ins yet.

The next UI work should improve **checkpoint review clarity**, not prompt-level
tool exposure.

## Why

Task update tools are now safe enough for a per-run opt-in because they mutate
Taskplane domain state through services and leave timeline evidence. Workspace
patch and command tools are different: they can modify a working tree or run
local code. Even with confirmation checkpoints, a user needs a clearer review
surface before those tools become part of ordinary agent planning.

The safest next step is to make the existing checkpoint path easier to inspect:

- show file list and diff preview clearly for `workspace.write_patch`
- show script, args, timeout, cwd, and captured output expectations clearly for
  `workspace.run_command`
- keep approve/defer/cancel consequences explicit
- keep normal prompts saying patch/commands are unavailable

## Exposure Tiers

### Tier 0: Internal Acceptance

Status: implemented.

- registry tools exist
- policy gates deny execution by default
- confirmation checkpoints create linked Decisions
- approval resumes exactly once
- local tests and acceptance commands cover the path

### Tier 1: Checkpoint Review UX

Recommended next workspace-tool slice.

Status: in progress. Runs detail now separates `workspace.write_patch` summary,
expected files, and patch-body preview, and separately surfaces
`workspace.run_command` script, args, timeout, cwd, and command preview.
Decisions now make checkpoint consequences explicit for patch writes, command
runs, and defer/cancel settlement.

- no prompt exposure
- no normal run-form opt-in
- improve Runs/Decisions checkpoint review copy and layout
- add a manual alpha path for reviewing a pending patch/command checkpoint

### Tier 2: Manual Tool Request

Future slice.

- user explicitly requests a patch or command from a dedicated UI action
- agent/model may draft the patch or command proposal
- execution still requires confirmation
- command allowlist remains fixed or config-backed

### Tier 3: Agent Planning Opt-In

Deferred.

- model sees `workspace.write_patch` or `workspace.run_command` as available
  tools only after a high-friction per-run opt-in
- run detail must show capability metadata for workspace write/command exposure
- prompt must include hard limits and confirmation semantics

## Non-Goals

- no arbitrary shell
- no package installation
- no git push, deployment, release upload, or credential inspection
- no automatic workspace mutation from a normal agent run
- no background process manager

## Testing Requirements For Tier 1

- renderer tests show patch checkpoint file list and diff preview remain
  visible and readable
- renderer tests show command checkpoint script, args, timeout, and cwd preview
- `npm test -- src/renderer/App.test.tsx` covers the current renderer review
  summaries
- Decision guidance tests explain approve/defer/cancel consequences for both
  tools
- local acceptance commands continue to pass
- full local verification passes without GitHub Actions

## Acceptance Criteria Before Tier 2

- a user can inspect a pending workspace checkpoint without reading raw JSON
- a user can tell whether approving will write files or run a command
- a user can see that defer/cancel makes the current run non-resumable for that
  action
- command allowlist behavior is documented in the UI or linked copy
- no normal prompt includes workspace mutation tools

## Open Questions

- Should Tier 1 use the existing Runs/Decisions surfaces only, or add a small
  dedicated checkpoint detail panel?
- Should command output become a first-class artifact after approval, or remain
  run-step output?
- Should command allowlists stay fixed in code for alpha, or move into local
  config before any UI exposure?

# Alpha Acceptance Checklist

Use this checklist for manual local validation before treating the prototype as alpha-ready.

For the current coverage and manual-validation assessment, see [ALPHA_ACCEPTANCE_ASSESSMENT.md](ALPHA_ACCEPTANCE_ASSESSMENT.md).
For recording a concrete manual pass, use [ALPHA_MANUAL_RUN_LOG.md](ALPHA_MANUAL_RUN_LOG.md).

## Verification Gate

- Run `npm run verify`.
- Run `npm run accept:agent-local` for the non-live agent execution-layer
  acceptance slice. This does not call external providers.
- Run `npm run accept:sandbox-coding:backend-preflight` when validating the
  future sandbox backend path. It is read-only and should report blocked when
  Docker is not running.
- Run `npm run smoke:build` if package, build, Electron entrypoint, or packaging configuration changed.
- Do not manually dispatch or watch GitHub Actions while Actions quota is unavailable.

## Core Task Loop

- Create a new task from the Tasks page.
- Confirm the task opens into the recovery-first detail view.
- Add or update summary and next step.
- Move the task through at least one valid state transition.
- Confirm the timeline explains the change with readable wording.

## Context Objects

- Add a source context item and mark it as key.
- Add a process template and bind it to the task.
- Add a blocker or dependency.
- Confirm the task resume card and Home surface reflect the active bottleneck.
- Resolve the blocker or dependency and confirm recovery wording changes.

## Decision And Run Loop

- Draft or create a decision from a task.
- Act on the decision and confirm the task updates with follow-up semantics.
- Trigger a run from a task.
- Confirm run output or failure writes back to the task timeline.
- Open the related Decision or Run from task / object timeline actions.
- For an agent run, optionally enable read-only workspace context and confirm the Runs detail shows the session capability while no patch or command execution is available.

### Task Tool Opt-In Agent Path

Use this to validate the first user-facing task-update tool exposure. It should
not modify workspace files or run commands.

- Create a task with a clear next-step update request.
- Trigger an `agent` run with `允许任务内更新/证据工具` enabled.
- Confirm the capability preview and Runs detail show task update/evidence tools enabled.
- Confirm the task timeline records the service-routed task update.
- Confirm the run steps include the accepted domain tool call/result.
- Confirm workspace patch and command tools remain unavailable to the normal
  agent run.

### Read-Only Workspace Agent Packaged Pass

Use this before release-readiness signoff, after `npm run dist:mac:dir` has produced
`release/mac-arm64/Taskplane.app`.

- Create an isolated workspace directory with a small text file containing a unique marker.
- Launch the packaged app executable with isolated user data and workspace root, for example:

```bash
ELECTRON_RUN_AS_NODE= \
TASKPLANE_USER_DATA_DIR=/tmp/taskplane-alpha-workspace-agent \
TASKPLANE_WORKSPACE_ROOT=/tmp/taskplane-alpha-workspace-root \
release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane
```

- Configure deliberate local AI credentials through `.env`, Settings, or Keychain.
- Create a task that asks the agent to inspect the unique marker before writing a note.
- Trigger an `agent` run with `允许只读工作区上下文` enabled.
- Confirm Runs detail shows read-only workspace context enabled and sandbox coding lane disabled; workspace patch/commands unavailable.
- Confirm the run steps include workspace search/read observations for the marker.
- Confirm the final run output is readable agent output, not raw proposal JSON.
- Confirm no local patch or command execution is available.

### Sandbox Backend Diagnostic Path

Use this when working on the disabled-by-default sandbox coding lane. It should
not run containers or expose a coding-agent mode.

- In Settings, click `检测 Sandbox Backend`.
- Confirm `Sandbox Backend` reports ready only when Docker is available.
- Confirm `Producer Backend` remains blocked when the sandbox coding-agent flag
  is off or no workspace root is configured.
- Run `npm run accept:sandbox-coding:backend-preflight` and confirm it reports
  the same ready/blocked Docker availability at the terminal.
- Run `npm run accept:sandbox-coding:producer-preview-smoke` and confirm it
  reports skipped by default.
- Run `TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE=true npm run
  accept:sandbox-coding:producer-preview-smoke` only when deliberately checking
  the non-live producer preview service wiring; confirm it reports
  `docker=not-started`, `ai=not-called`, and `workspace=unchanged`.
- Run `TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE=true
  TASKPLANE_RUN_SANDBOX_PRODUCER_DOCKER_CHECKS=true npm run
  accept:sandbox-coding:producer-preview-smoke` only for a deliberate local
  Docker check smoke. It may start containers or pull the default image.
- Run `npm run accept:sandbox-coding:patch-promotion-apply-smoke` to validate
  the default no-write and flag-enabled apply promotion paths against real
  SQLite and a throwaway workspace, without Docker or AI calls.
- Confirm no new model-visible Read/Write/Edit/Bash, browser/computer, or
  external publishing tools appear in a normal agent run.

### Code Agent Model Producer Manual Gate

Use this only when deliberately validating the model-backed Code Agent path.
The env flag exposes capability, but it must not spend provider credit unless a
single run also selects `Use model producer` and provides explicit context
files.

- Run `npm run accept:sandbox-coding:model-producer-preflight` first. Confirm
  it reports ready or clearly explains missing local `.env` values without
  calling providers, probing Docker, or touching the workspace.
- Run `npm run accept:sandbox-coding:code-agent-ui` to validate the preflight
  summary, package-script availability gates, UI payload filtering, and IPC
  recheck without Docker or provider calls.
- Run `npm run manual:code-agent-ui-fixture` when you need a fresh isolated
  user-data directory plus disposable workspace for the UI pass. The script
  prints a launch command and does not start Taskplane, probe Docker, call a
  provider, or mutate the real workspace.
- Launch Taskplane with isolated state and a disposable workspace. Set
  `TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER=true`,
  `TASKPLANE_ENABLE_SANDBOX_CODING_AGENT=true`, provider/model/API key values,
  and `TASKPLANE_WORKSPACE_ROOT`.
- Open a task and confirm the Code Agent panel says model producer is available
  by local env, while still requiring `Use model producer`, context files, and
  operator confirmation.
- Confirm the Code Agent preflight summary is visible before start. It should
  summarize runtime readiness, selected checks, producer mode, context-file
  requirement, Decision promotion, and the next required action.
- Confirm unavailable `test` or `lint` package scripts are shown as unavailable
  and are not selected; if both are unavailable, the start button remains
  blocked.
- Without selecting `Use model producer`, start a manual sandbox preview and
  confirm it stays on the local diagnostic producer and does not call the
  provider. Runs detail should show `Producer source：local diagnostic preview
  / no provider call`.
- Select `Use model producer` with no context files and confirm the start
  button remains blocked with a clear context-file reason.
- Add one or more workspace-relative context files, keep at least one
  allowlisted check selected, confirm the Docker/Decision notice, then start
  the run only when deliberately spending one provider request.
- Confirm Runs detail keeps the staged patch Decision-gated and the selected
  workspace unchanged before any later promotion approval. For a model-backed
  run, Runs detail should show `Producer source：model-backed / provider call
  already spent for this run / Decision promotion still required`.

### Workspace Patch Approval Path

Use this as a code-level execution-layer validation only. The patch tool is not
yet exposed in agent prompts or the task UI.

- Run the repeatable local approval exercise:

```bash
npm run accept:agent-local
```

- Run the renderer checkpoint review coverage:

```bash
npm test -- src/renderer/App.test.tsx
```

- Create an isolated workspace file and a `workspace.write_patch` checkpoint through the internal tool registry or service integration path.
- Confirm the checkpoint payload includes expected files and a diff preview.
- Confirm Runs detail surfaces `摘要`, expected files, and the patch-body preview before approval.
- Approve the linked Decision.
- Confirm the patch applies only after approval and the checkpoint resolves.
- Confirm `workspace.run_command` remains unavailable to normal agent prompts
  and task UI, while its registry-level command checkpoint path remains covered
  separately by local tests and visible Runs summary coverage for script, args,
  timeout, cwd, and preview.

### Sandbox Patch Promotion Apply Path

Use this only with isolated user data and a disposable workspace. This validates
the Code Agent staged patch promotion path, not normal agent prompt access.

- Start from a throwaway workspace with a tiny text file and simple `test` /
  `lint` scripts.
- Launch Taskplane with isolated state and apply enabled, for example:

```bash
ELECTRON_RUN_AS_NODE= \
TASKPLANE_USER_DATA_DIR=/tmp/taskplane-alpha-sandbox-promotion-apply \
TASKPLANE_WORKSPACE_ROOT=/tmp/taskplane-alpha-sandbox-promotion-workspace \
TASKPLANE_ENABLE_SANDBOX_CODING_AGENT=true \
TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY=true \
release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane
```

- In Task detail, use the manual Code Agent intent surface to produce a staged
  patch review on the disposable file.
- Open the generated Run and confirm `Staged Patch Review` shows the staged
  source, expected files, readiness, linked Decision, and workspace unchanged
  before approval.
- Open the linked `workspace.staged_patch` Decision and approve it.
- Confirm the disposable workspace file changes only after approval.
- Confirm Runs detail shows the promotion as resolved and the workspace status
  as applied after Decision approval, with touched files in the checkpoint
  RunStep.
- Repeat once with `TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY=false` and
  confirm approval resolves preflight-only while leaving workspace files
  unchanged.
- The repeatable local smoke for the same core behavior is:

```bash
npm run accept:sandbox-coding:patch-promotion-apply-smoke
```

## Completion Loop

- Add at least one completion criterion.
- Satisfy and reopen it.
- Confirm closeout guidance changes when criteria are satisfied or nearly satisfied.
- Confirm recent decisions, runs, or artifacts can surface as completion evidence when relevant.

## Home Recovery Loop

- Confirm Home recommended actions prioritize escalation, unblock/decide, continue/review, and clarify work coherently.
- Open a task from Home recent activity, key signals, and resume previews.
- Confirm follow-up drafts or suggested next moves are prefilled only when context supports them.
- Confirm stale blocker or stale dependency cases read as escalation instead of ordinary blocked work.

## Settings And Local Config

- Save Settings with provider, model, API key, and scheduler flag.
- Confirm status reflects the local config path.
- Restart locally if needed and confirm non-sensitive settings persist.
- Confirm missing API key behavior is explicit rather than silent.

## Release Readiness

- Build locally with `npm run build`.
- Run `npm run smoke:build` before packaging.
- Produce `npm run dist:mac:dir` only after the manual alpha path is coherent.
- Run `npm run smoke:package:mac` after producing the unpacked macOS app.
- Run `npm run smoke:runtime:mac` to confirm packaged startup creates isolated config and initializes SQLite data.
- Or run `npm run smoke:release:mac` to combine the unpacked macOS build and both smoke checks.
- Run `npm run accept:release:mac-preflight` to check signed/notarized release
  prerequisites and regression coverage for both Apple ID and App Store Connect
  API key notarization env groups, without signing, notarizing, uploading, or
  calling Apple services.
- Do not start signed/notarized release work until the local alpha path passes without major friction.

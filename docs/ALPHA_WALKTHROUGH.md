# Alpha Walkthrough

Use this script for a human alpha walkthrough of the current unsigned local app.
Keep the session focused on product friction, not new feature ideas.

## Setup

Start from the current handoff note:

- [ALPHA_HANDOFF.md](ALPHA_HANDOFF.md)

Use an isolated user-data directory so the walkthrough does not touch normal
local state:

```bash
ELECTRON_RUN_AS_NODE= \
TASKPLANE_USER_DATA_DIR=/tmp/taskplane-alpha-walkthrough \
release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane
```

If the app has not been packaged yet, run:

```bash
npm run smoke:release:mac
```

## Pass Criteria

Pass means a user can complete the local-first work loop without getting lost:

- capture a task
- clarify the task
- add useful context
- make or review a decision
- run or inspect execution evidence
- recover from Home
- understand whether the task can close
- save basic local settings

Do not require signed/notarized distribution, live provider spending, Docker
execution, or broad tool exposure for this pass.

## Focus Matrix

Use the walkthrough to judge product friction, not to duplicate every automated
check.

| Focus | Walkthrough Steps | Existing Coverage | Human Check |
| --- | --- | --- | --- |
| Core task loop | 2-6, 15-17 | Repository, service, renderer, and packaged Timeline/Home smokes cover task creation semantics, transitions, source context, completion criteria, closeout evidence, and Home recovery routes. | Confirm the flow feels understandable in the real packaged app: labels, action order, and return paths should not make the user hunt. |
| Context and learning | 6-8, 16-17 | Packaged project-decomposition and Context learning smokes cover project decomposition, key source / habit surfaces, artifact learning boundaries, and SOP hints. | Confirm source/process/blocker/dependency actions are findable from the workbench without needing prior knowledge. |
| Decisions and runs | 11-14 | Packaged Run/Decision recovery smoke covers checkpoint review, terminal run evidence, staged patch recovery, Browser Evidence review, and task return drafts. | For the normal run path, prefer no-key/fallback wording unless provider credentials are deliberately configured for this pass. |
| Settings | 18 | Packaged Settings config smoke covers non-sensitive config persistence and relaunch hydration. | Confirm the status copy makes local storage and Keychain boundaries obvious. |
| Explicit opt-in only | Code Agent, live providers, Docker, signing/notarization | Non-live preflights and smoke checks cover disabled/default-safe states. | Do not run these during a normal walkthrough unless the pass is explicitly about that capability. |

## Walkthrough Script

1. Open the packaged app with isolated user data.
2. Create a task from Tasks.
3. Confirm the task opens directly into detail.
4. Add a summary and next step.
5. Move the task through one valid state transition.
6. Add one source context item and mark it as key.
7. Add one process template or method note.
8. Add one blocker or dependency.
9. Return to Home and confirm the bottleneck is visible.
10. Resolve the blocker or dependency and confirm recovery wording changes.
11. Create or draft one Decision.
12. Act on the Decision and confirm task follow-up changes.
13. Trigger a Run without relying on live provider spending unless credentials
    are deliberately configured for this pass.
14. Open the related Run and inspect output, failure, or evidence wording.
15. Add one completion criterion.
16. Satisfy or reopen the criterion and inspect closeout guidance.
17. Return to Home and open the task from a recommended action, key signal, or
    resume preview.
18. Open Settings, save non-sensitive local config, and confirm the status text
    explains where config is stored.

## Code Agent And Browser Evidence

Only inspect these surfaces unless this walkthrough explicitly targets them:

- Code Agent preflight should remain manual, gated, and non-live by default.
- Browser Evidence review should remain inspect-first and local-QA scoped.
- Workspace write and command tools should not appear as normal prompt power.
- Provider-spending model paths should require deliberate local opt-in.

## Friction Log Format

Record each issue in [ALPHA_MANUAL_RUN_LOG.md](ALPHA_MANUAL_RUN_LOG.md) or a
temporary note using this shape:

```text
Area:
Step:
Expected:
Observed:
Severity: Low | Medium | High
Suggested fix:
```

Keep severity practical:

- Low: wording, layout, or navigation friction with a clear workaround.
- Medium: blocks a normal alpha path until the user discovers a workaround.
- High: data loss, wrong state, unsafe action, or a loop that prevents recovery.

## Stop Conditions

Stop the walkthrough and fix before continuing if you see:

- task data disappearing or saving to the wrong user-data directory
- a local write, command, Docker, provider, signing, notarization, upload, or
  Apple network action starting without explicit opt-in
- Home, Task detail, Decisions, or Runs trapping the user without a clear return
  path
- completion guidance marking a task complete while active blockers or
  dependencies still dominate the work

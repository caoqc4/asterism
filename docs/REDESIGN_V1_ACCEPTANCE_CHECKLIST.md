# Redesign V1 Acceptance Checklist

Use this checklist to validate the frontend redesign against
`doc_privice/19超级董秘_产品功能设计方案_v_1.md` and
`doc_privice/20超级董秘_自检查与自学习方案设计_v_1.md`.

This is a product acceptance checklist, not a backend capability promise. Items
that require live external integrations, real schedulers, or deeper verifier
agents are listed separately as deferred runtime work.

## Verification Gate

- Run `npm run verify`.
- Confirm the app can launch without a dev-server-only assumption.
- Confirm the main branch or review branch is clean before manual validation.
- Do not treat disabled future integration buttons as failures unless a real
  backend capability has been added.

## Brief

- Internal focus is always visible and task-native: focus items route into the
  right panel or workbench instead of creating a separate chat-first workflow.
- Waiting, running, blocked, and decision-needed tasks expose a clear next move.
- Brief snapshot history is available when recent snapshots exist.
- External signal empty state may remain visible by design to teach the future
  capability; it is not a failure while live external ingestion is deferred.
- External signal confirmation should only be considered accepted when real
  connected sources can produce new signals.

## Right Panel

- Global conversation can be captured as a pending task.
- Pending captured tasks do not appear in Tasks until explicitly confirmed.
- Abandoning a pending capture requires a second confirmation and archives the
  captured record.
- Switching into a task context explains that Taskplane rebuilds context from
  task memory, execution records, key sources, and work habits.
- Automatic context clearing preserves the same task conversation and must only
  clear after a specific enough handoff has been archived.
- Manual clearing archives the current conversation before clearing, and lets
  the user add missing facts if the handoff is too generic.
- User-initiated new conversation starts a new free discussion space; it should
  not imply continuation of the old task conversation unless the user explicitly
  binds or mentions that task again.

## Tasks

- Creating a normal task does not create unrelated default subtasks.
- Task type suggestions are visible and user-adjustable before creation.
- Scheduled and event tasks create one task with editable configuration hints;
  runtime scheduling and external event listeners are deferred runtime work.
- Project tasks create a parent first, then ask AI for a decomposition draft.
- Project decomposition chooses subtask count from the project boundary, keeps
  chunks large and independent, and requires user confirmation before creating
  real subtasks.
- Users can regenerate or abandon a project decomposition draft before creating
  children.
- Confirmed project decomposition writes an AI self-check source note with
  confirmed wording, not pending wording.

## Workbench

- Resume card explains current status, next move, risks, key sources, and thin
  context correction when signals are sparse.
- Execution tab keeps Runs scoped under the task, not global navigation.
- Step checks remain visible as lightweight rule checks even when Run / Task
  self-check is disabled.
- Run checks and completion confirmation follow AI behavior preferences.
- Check records label whether they come from lightweight rule comparison or a
  verifier sub-agent source.
- Project parent workbench summarizes child progress; actual execution happens
  in child task workbenches.
- Complex child tasks should be upgraded to project type rather than nesting
  deeper than project to child task.

## Sources And Artifacts

- Sources tab lets users add source context, mark key sources, and archive
  sources.
- At most the recent key sources are promoted into AI context; full source
  management remains in the workbench.
- Artifact tab distinguishes AI-generated, manual note, browser evidence, and
  Code Agent artifacts where available.
- Markdown and plain text artifacts can be edited inline; other formats are
  renamed in Taskplane and opened externally by the system.
- Editing artifact body creates a self-learning observation source.
- Renaming an artifact or saving without body changes does not create a
  self-learning observation.
- Deleting an artifact requires confirmation and affects only the artifact
  record, not the task, sources, or activity timeline.

## Completion And Decisions

- Completion confirmation checks completion criteria and recent Run verification
  before a task is marked done.
- Users can still complete with unmet checks; this is user sovereignty, not a
  system failure.
- Completion overrides are recorded as task activity and can become learning
  signals when self-learning is enabled.
- Decisions are grouped and ranked with impact, reversibility, and recommended
  option cues.
- Decision handling routes back to the task instead of becoming a separate
  project-management surface.

## Context And Self-Learning

- Context is positioned as AI perception and memory, not a file manager or
  unresolved-question inbox.
- External-signal uncertainty belongs in Brief capture; task-progress questions
  belong in the right panel.
- Work habits show source type, scope, status, usage count, and local storage
  boundary.
- Pending work habits do not apply to future AI prompts until confirmed.
- Users can adopt, suppress, disable, delete, or manually add work habits.
- Conflict resolution between pending and confirmed habits is explicit.
- Learning is node-triggered: completion, override, SOP extraction, artifact
  content edit, or session refresh preservation.
- The UI must continue to state that Taskplane does not perform continuous
  behavior monitoring.
- SOP templates are created only from an explicit workbench action.

## Settings, Model, Skills, MCP, Connections

- AI behavior settings expose self-check, self-learning, context compression,
  communication style, and confirmation threshold.
- Confirmation threshold explains low, normal, and high confirmation behavior in
  user terms.
- Model provider keys are presented as local keychain data; model choice should
  not be described as task memory.
- Skills and MCP are capability libraries; adding a tool should not imply
  automatic execution without task context and confirmation policy.
- Connections can show future sources, but live sync and authorization remain
  deferred until backend integration exists.

## Deferred Runtime Work

These should not block frontend redesign acceptance:

- Live external-source ingestion into Brief.
- Real scheduler execution and event listener runtime.
- Deep LLM verifier agents for every Step.
- Token-accurate context usage and compression triggers.
- Full transcript archive browsing.
- Advanced saved searches and custom task views.
- Native file/folder integration beyond current artifact handling.

## Manual Walkthrough Script

1. Open Brief and confirm internal focus plus external signal empty-state intent.
2. Continue a focus task in the right panel.
3. Capture a global conversation as a task; confirm it before it enters Tasks.
4. Create a project task; generate, review, regenerate or discard the draft;
   then confirm child task creation.
5. Open a child task workbench and inspect Resume, Execution, Sources,
   Artifacts, and Activity.
6. Edit a text artifact body and confirm a learning observation is written.
7. Rename an artifact and confirm no new learning observation is written.
8. Complete a task with unmet criteria and confirm the override is visible in
   Activity and Context learning surfaces.
9. Review pending Decisions and confirm impact/reversibility cues are readable.
10. Open Context and confirm pending habits do not apply until approved.

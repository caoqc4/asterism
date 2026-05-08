# Redesign Alignment Assessment

Status: current `main` assessment for the high-fidelity prototype and the
product design documents in `doc_privice/19...` and `doc_privice/20...`.

Assessment date: 2026-05-07.

## Summary

The current `main` branch is broadly aligned with the v1 product direction:
Taskplane now reads as a task-native Agent workbench rather than a chat-first or
run-first tool. The main navigation, Brief/Tasks/Decisions/Context split,
right-panel task conversation model, task workbench, project decomposition,
self-check visibility, and work-habit learning surfaces are in place.

The remaining gaps are not mostly missing UI screens. They are product-depth
gaps that should be validated through alpha use: real external signal
ingestion, real scheduled/event trigger execution, stronger AI-backed verifier
behavior, and richer session history. These should stay out of the current
frontend redesign closeout unless a real use case proves they are blocking.

Recommended next state: run focused alpha walkthroughs and fix only concrete
product friction. Avoid broad new feature work until real use exposes a
blocking gap.

For the concrete product validation pass, use
[REDESIGN_V1_ACCEPTANCE_CHECKLIST.md](REDESIGN_V1_ACCEPTANCE_CHECKLIST.md).

## Product Document 19 Alignment

| Area | Status | Current Alignment | Remaining Work |
| --- | --- | --- | --- |
| Navigation zones | Aligned | Zone 1 task surfaces and Zone 2 capability/config surfaces are separated; Runs are no longer a primary nav concept. | Cosmetic tuning only. |
| Brief page | Aligned with one intentional exception | Internal focus, stats strip, state-driven primary actions, waiting/running routing, and drag ordering are covered. External signal empty state remains visible by product choice to hint the future feature. | Real external signal ingestion and confirmation flow remain future/backend work. |
| Tasks page lenses and rows | Aligned | Lenses include execution state and task type. Row selection, preview, inline actions, context menu actions, and workbench entry are covered. | Saved searches and full custom views are deferred. |
| Tasks preview | Aligned | Preview shows why-now/next-step/config notes, decisions routing, and key sources capped to recent 3. | More source ranking can wait for real usage. |
| Workbench shell | Aligned | Resume card, execution/source/artifact/activity tabs, active Run progress, task header actions, and thin-context correction prompt are present. | Resume generation is still lightweight/fallback-heavy; stronger AI narrative can be improved later. |
| Work folder / artifacts | Aligned for v1 | Artifact list includes source labels such as AI generated, manual note, Code Agent, and browser evidence. Markdown/text editing is supported. | Native file folder integration and richer preview are future work. |
| Decisions page | Aligned | Decisions are user-approval centered, pending-only by default, and now expose ranking cues such as impact and recovery caution. | Deadline bucketing can be refined later. |
| Context page | Aligned | The page is positioned as AI perception and memory: connected sources, task memory, and work habits. It explicitly separates external-signal uncertainty from task-progress questions. | Full connection management is represented but not backed by live sync. |
| Task type system | Mostly aligned | AI/type-review prompts exist; one-off, scheduled, event, and project semantics are surfaced. Scheduled/event config hints are visible in task/workbench surfaces. | Actual scheduler/event trigger runtime is not fully part of this redesign closeout. |
| Project decomposition | Aligned for v1 | Project creation no longer hard-codes 3 default subtasks. AI is guided to draft parent/child decomposition, self-check it, keep chunks large, and require confirmation before real subtasks. | Multi-round AI refinement can be made richer once real decomposition quality is observed. |
| Right panel | Aligned | Global capture, task context, soft context switching, full-screen mode, history summary, task capture confirmation, and session refresh are present. | Full archived transcript browsing is still minimal. |
| Priority Lane | Aligned | Priority lanes drive Brief, Tasks, Workbench summaries, activity badges, and execution context. | Lane explanation copy can continue to be polished. |
| Self-check/self-learning UI hooks | Aligned | Run/Step checks surface in Workbench execution; work habits live in Context; SOP extraction is available from Workbench. | See document 20 for deeper behavior gaps. |

## Product Document 20 Alignment

| Area | Status | Current Alignment | Remaining Work |
| --- | --- | --- | --- |
| Step-level self-check | v1 aligned | Step checks remain visible even when Run checks are disabled. Current implementation is explicitly described as a lightweight rule engine that checks execution state, result records, and applicable work habits. | A true LLM/verifier sub-agent is future work; current v1 intentionally avoids deep semantic judging. |
| Run-level self-check | Aligned | Run checks are visible in Workbench and controlled by AI behavior preferences. Completed/failed runs get pass/warn/fail style summaries. | More precise AI-backed verification can be added behind existing source labels. |
| Task-level completion check | Aligned | Completion modal checks criteria, recent Run verification, unmet criteria, and user override. Overrides become learning signals. | More granular original-intent comparison remains future. |
| Failure handling | Partially aligned | Failed checks are surfaced; retry limit preference is visible in Workbench copy. | Full automated retry orchestration is not yet a frontend redesign concern. |
| Learning triggers | Aligned for v1 | Learning signals are constrained to Step/Run/Task completion, artifact edits, SOP extraction, and session refresh preservation. UI states that it does not continuously monitor behavior. | More intelligent delta extraction from edits can be improved later. |
| Silent/proposed/SOP outputs | Aligned | Work habits support silent/proposal/SOP/manual sources. Pending rules do not apply until confirmed; SOP is user-triggered. | Right-panel non-blocking habit proposal prompts can become richer later. |
| Work habit data model | Aligned | Records include rule, source, scope, status, created/last-applied timestamps, application count, examples, and storage/privacy boundary. | Migration or export UX can wait. |
| Cross-task observation window | Aligned for v1 | Completion override observations aggregate by distinct task and become a pending cross-task pattern after 3 observed tasks. | Threshold calibration should be based on real use rather than more code now. |
| Conflict handling | Aligned | Context detects pending-vs-confirmed conflicts in the same scope and lets the user adopt the new rule or suppress it. | More nuanced semantic conflict detection can wait. |
| Rule priority | Aligned | Applicable habits sort by project > task type > global, then application count; Context explains the priority. | Per-task scope is not fully exposed as a separate UI option yet. |
| Local privacy boundary | Aligned | Context states work habits are stored in the local Taskplane database and excludes chat full text, artifact body, credentials, and implicit background behavior logs. | Encryption/export policy is outside this redesign. |
| Session as temporary work memory | Aligned | Right-panel history explains current conversation is temporary; new sessions start from task memory. Task welcome seed now includes task memory, execution records, key sources, and work habits. | Full transcript archive browsing is minimal. |
| Session refresh / compression | Aligned for v1 | Refresh suggestions trigger on repetition, correction churn, generic replies, or compression threshold. Refresh preserves selected decisions/preferences/unresolved questions and explicitly avoids saving full chat text. | Token-accurate context usage is not implemented; current trigger is heuristic. |

## Deferred On Purpose

These items should not block alpha use of the redesign baseline:

- Live external-source ingestion into Brief.
- Full scheduler/event listener runtime for scheduled and event-triggered tasks.
- Deep LLM judge for every Step.
- Full transcript history browser in the right panel.
- Saved searches and advanced task-list customization.
- Rich native file/folder integration beyond current artifact handling.
- Per-task work-habit scope UI if task-type/project/global already cover v1.

## Suggested Manual Walkthrough

For each focused alpha pass, run one manual product walkthrough:

1. Open Brief and confirm external-signal empty state is visible by design.
2. Continue a Brief focus task into the right panel.
3. Capture a global conversation as a task and confirm it before it appears in
   Tasks.
4. Create a project task, generate an AI decomposition draft, confirm real
   subtasks only after reviewing the draft.
5. Open a task workbench and inspect Resume, Run checks, Sources, Artifacts,
   and Activity priority badges.
6. Complete a task with unmet checks and verify the override learning signal
   appears in Context.
7. Refresh a long/repetitive right-panel session and verify only selected
   memory is preserved.
8. Review Decisions and confirm ranking cues make approval risk clearer.

## Alpha Recommendation

The next work item should be alpha-use validation rather than more feature
expansion:

- keep this assessment as the redesign baseline on `main`;
- list the intentional exception for Brief external-signal empty state;
- call out backend/runtime deferred items separately from frontend redesign
  acceptance;
- require `npm run verify` plus targeted packaged smokes before treating a new
  alpha baseline as accepted.

# Testing Map

## Overview

Taskplane currently uses a layered testing strategy:

- service-level unit tests for domain and config logic
- SQLite-backed integration tests for repository behavior
- renderer `jsdom` interaction tests for key control-plane flows
- IPC handler tests for event-emitting main-process entrypoints
- local `verify` quality-gate coverage
- GitHub Actions `verify` coverage on pushes to `main` and pull requests when Actions capacity is available
- build smoke verification for packaged renderer/main/preload entrypoints

Current test files:

- `src/main/bootstrap/runtime-paths.test.ts`
- `src/main/code-agent-model-producer-preflight-script.test.ts`
- `src/main/config/app-config-service.test.ts`
- `src/main/db/client.test.ts`
- `src/main/keychain/ai-config-service.test.ts`
- `src/main/local-smoke-boundaries-script.test.ts`
- `src/main/domain/task/task-service.test.ts`
- `src/main/domain/decision/decision-service.test.ts`
- `src/main/domain/decision/decision-service.integration.test.ts`
- `src/main/domain/run/run-service.test.ts`
- `src/main/domain/run/run-service.integration.test.ts`
- `src/main/domain/run/run-orchestrator.test.ts`
- `src/main/domain/run/agent-tool-registry.integration.test.ts`
- `src/main/domain/run/agent-run-loop.test.ts`
- `src/main/domain/run/agent-tool-registry.test.ts`
- `src/main/domain/run/agent-working-context.test.ts`
- `src/main/domain/run/agent-executor.test.ts`
- `src/main/domain/run/agent-checkpoint-recorder.test.ts`
- `src/main/domain/brief/home-brief-service.test.ts`
- `src/main/domain/brief/process-template-selector.test.ts`
- `src/main/domain/working-context/assembler.test.ts`
- `src/main/scheduler/scheduler-service.test.ts`
- `src/main/db/repositories/task-repository.integration.test.ts`
- `src/main/db/repositories/run-repository.integration.test.ts`
- `src/main/db/repositories/run-step-repository.integration.test.ts`
- `src/main/db/repositories/run-checkpoint-repository.integration.test.ts`
- `src/main/db/repositories/decision-repository.integration.test.ts`
- `src/main/db/repositories/agent-session-repository.integration.test.ts`
- `src/main/db/repositories/brief-snapshot-repository.integration.test.ts`
- `src/main/db/repositories/waiting-item-repository.integration.test.ts`
- `src/main/db/repositories/artifact-repository.integration.test.ts`
- `src/main/db/repositories/source-context-repository.integration.test.ts`
- `src/main/db/repositories/blocker-repository.integration.test.ts`
- `src/main/db/repositories/task-dependency-repository.integration.test.ts`
- `src/main/db/repositories/completion-criteria-repository.integration.test.ts`
- `src/main/db/repositories/process-template-repository.integration.test.ts`
- `src/main/db/repositories/task-process-binding-repository.integration.test.ts`
- `src/main/domain/run/process-template-selector.test.ts`
- `src/main/domain/decision/process-template-selector.test.ts`
- `src/main/executors/ai-client.test.ts`
- `src/main/executors/brief-executor.test.ts`
- `src/main/executors/replicate-client.test.ts`
- `src/main/executors/text-executor.test.ts`
- `src/main/ipc/handlers.test.ts`
- `src/main/preload.test.ts`
- `src/renderer/App.test.tsx`
- `src/renderer/lib/agentCapabilities.test.ts`
- `src/renderer/lib/agentOrchestrationPresentation.test.ts`
- `src/shared/agent-runtime-events.test.ts`
- `src/shared/agent-tool-exposure.test.ts`
- `src/shared/working-context/priority-lanes.test.ts`
- `src/shared/working-context/timeline.test.ts`
- `src/shared/working-context/transitions.test.ts`
- `src/shared/types/run-checkpoint-payload.test.ts`

## Coverage Map

### Service tests

Covered today:

- `runtime-paths`
  dev/packaged renderer path resolution and user-data override behavior
- `AppConfigService`
  config defaults, persistence, workspace-root config, migration behavior
- `db/client`
  SQLite user-data path override, bootstrap, and connection lifecycle behavior
- `AiConfigService`
  config-path reporting and legacy keychain API-key migration behavior
- `TaskService`
  transitions, invalid transitions, signal updates, task-resume derivation, blocker/dependency/completion-criteria lifecycle writes, decision annotations, and completed/failed/paused run-settlement annotations
- `DecisionService`
  task existence checks, decision-to-task lifecycle linkage, AI/fallback decision-draft composition, checkpoint Decision approval/defer settlement, and isolated workspace patch approval through real SQLite repositories
- `RunService`
  successful execution path, failure path, paused path, paused checkpoint continuation, task restoration after settled runs, artifact creation on successful output, orchestration result settlement, an isolated read-only workspace agent path through persisted run detail, and an isolated task-mutation tool opt-in path through persisted task detail
- `RunOrchestrator`
  plan/model/final step writes, process-template selector fallback, executor failure recording, diagnostic-only provider-native shadow step writes, gated provider-native session selection, agent-mode handoff into the local run loop, truthful structured-tool capability metadata for tool-capable providers, and paused agent-loop propagation
- `LocalAgentExecutor`
  adapter behavior that preserves current local agent-loop outcomes behind the executor/session boundary, plus an internal provider-native session entry that delegates normalized proposals through the same run loop
- `Agent runtime events`
  typed v2 runtime event names, checkpoint event metadata, and terminal event
  classification plus the first event-to-run-step mapper for plan/model/tool,
  checkpoint, and terminal session events
- `Provider native session gate`
  explicit pre-wiring runtime selection gates for run type, feature flag,
  provider support, provider payload presence, and normalization success
- `AgentRunLoop`
  typed local observe-then-write plan building, constrained JSON proposal parsing, policy-gated workspace read steps, explicit task-mutation tool opt-in, required read-only observation steps before local writes, observation-aware planner continue/stop decision writes, fallback behavior, visible plan-source run-step writes, in-memory tool observations, persisted structured observation-summary run steps, and failed / confirmation-needed tool outcomes
- `AgentRunLoop provider-native parity`
  provider-native normalized proposals go through the same plan-building policy
  gates as text JSON proposals in tests, including fallback for workspace
  mutation and command proposals, plus RunService integration coverage proving
  those denied workspace proposals do not create checkpoints or change files
- `Provider-native tool-call acceptance`
  `npm run accept:provider-native-tools` exercises provider-native extraction,
  provider adapters, safe-read schema exposure, selection gates, run-loop policy
  parity, and RunService persistence without calling external providers
- `Agent local acceptance`
  `npm run accept:agent-local` combines the non-live workspace patch, domain
  tool, provider-native, and sandbox-coding acceptance scripts into one local
  gate. The agent-runtime portion keeps the same coverage split across
  sequential Vitest calls so the local gate exits cleanly after lifecycle and
  recorder-heavy tests.
- `Sandbox coding acceptance`
  `npm run accept:sandbox-coding` exercises the disabled-by-default sandbox
  provider contracts, temp/local-container sandbox boundaries, targeted-check
  helpers, Code Agent model-context boundaries, patch-review persistence, run
  adapter, service factory, and session metadata/readiness summaries without
  calling Docker, external providers, or live services. The script runs 40
  Vitest files / 260 tests in ten sequential batches so the focused
  sandbox-coding gate exits cleanly inside
  `accept:agent-local`.
- `Sandbox backend preflight`
  `npm run accept:sandbox-coding:backend-preflight` performs a read-only Docker
  server probe for the future real local-container backend path. It reports
  ready/blocked status without starting containers, pulling images, running
  checks, or calling AI providers.
- `Code Agent model producer preflight`
  `npm run accept:sandbox-coding:model-producer-preflight` checks local `.env`
  readiness for the model-backed Code Agent capability. It reports missing
  provider/model/key/workspace/feature flags without calling providers, probing
  Docker, or touching the workspace. The env capability is passive by itself:
  the manual Task detail run must also select `Use model producer`, provide
  context files, keep at least one allowlisted check selected, and confirm the
  operator notice before a provider-backed run can start.
  `TASKPLANE_CODE_AGENT_CONTEXT_FILES` can then select comma-separated
  workspace-relative files for bounded prompt context; invalid selected files
  block the model producer run before sandbox execution starts. The preflight
  also validates configured context files locally without spending provider
  credit. Script coverage verifies shell environment values override `.env`
  values while API keys and stale secret-like `.env` values stay redacted.
- `Code Agent UI/config/IPС acceptance`
  `npm run accept:sandbox-coding:code-agent-ui` exercises the Code Agent
  preflight summary, package-script availability detection, renderer payload
  filtering, and IPC recheck without Docker or provider calls. The script keeps
  main-process config and IPC checks in separate Vitest calls, then runs the
  renderer capability and App coverage together so the focused UI/config/IPC
  gate exits cleanly in the combined local agent acceptance path.
- `Browser controlled local QA fixture`
  `npm run manual:browser-controlled-fixture` materializes the Tier 2
  controlled-interaction fixture plan without starting a browser, calling the
  network, mutating a page, or exposing a model-visible browser tool. It also
  writes expected RunStep drafts for future runner comparison.
- `Code Agent model producer live smoke`
  `npm run accept:sandbox-coding:model-producer-live` is skipped by default.
  With `TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_LIVE=true`, it sends one
  provider request, validates the returned staged-file JSON contract, and still
  avoids Docker and workspace mutation.
- `Code Agent model producer preview smoke`
  `npm run accept:sandbox-coding:model-producer-preview-smoke` is skipped by
  default. With `TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_PREVIEW_SMOKE=true`,
  it sends one provider request, feeds the model-backed loop through the
  sandbox producer preview service on a disposable workspace, uses an injected
  check runner, and still avoids Docker and selected-workspace mutation.
- `Local smoke command boundaries`
  script coverage locks the default skip paths for sandbox producer preview,
  Code Agent model-producer live smoke, and Code Agent model-producer preview
  smoke so they do not call providers, start Docker, or mutate workspaces
  unless their explicit env gates are enabled.
- `Provider-native live validation`
  `npm run accept:provider-native-live:preflight` checks local readiness without
  spending provider credit, and `npm run accept:provider-native-live` performs a
  guarded one-call safe-read tool probe when explicitly configured.
  `npm run accept:provider-native-live:run` feeds a real provider tool-call
  payload through an isolated RunService database and verifies the gated
  provider-native session settlement path. The live Vitest config also keeps a
  no-credit preflight regression path for shell-environment overrides and
  redacted readiness output; the provider call itself stays opt-in.
- `AgentWorkingContext`
  task-detail compression into typed agent run context, default policy, and plan-step request summaries
- `AgentToolRegistry`
  internal tool discovery, read-only context/timeline inspection, read-only completion evidence review, service-routed task next-step updates, completion-criterion creation, source-context creation, and draft-only Decision proposals, policy-gated read-only workspace search/file reads, dynamic workspace-root resolution, local note artifact creation, confirmation-gated workspace patch application, tool call/result step writes, validation failure recording, policy-driven confirmation checkpoints, and Decision creation for confirmation checkpoints
- `AgentCheckpointRecorder`
  centralized tool-permission checkpoint creation, Decision linkage,
  checkpoint RunStep projection, recorder-owned `checkpoint.created` events,
  and restart-safe resume checkpoint payload creation
- `Agent tool exposure matrix`
  shared text-prompt and provider-native exposure rules, per-run opt-ins for
  workspace read and task/evidence tools, and permanent non-exposure of
  workspace patch/command tools even when runtime policy can execute them
- `AgentToolRegistry integration`
  service-routed task next-step updates, completion-criterion creation, read-only completion evidence review without satisfying criteria or completing tasks, source-context creation, and draft-only Decision proposals through real SQLite repositories, including task timeline evidence and run-step observations
- `RunService integration`
  isolated read-only workspace agent path with persisted run detail and agent
  session metadata, task mutation opt-in flow through persisted task detail, and
  completion evidence review that leaves criteria open and task state unchanged
- `Run checkpoint payload`
  versioned v1 payload helpers for tool-permission and resume checkpoints, with legacy JSON parsing compatibility, plus the shared approved-Decision resumable tool boundary
- `DecisionService`
  checkpoint Decision approval can resume local note creation, task next-step
  updates, high-risk completion-criterion creation, and confirmation-gated
  workspace patch application; integration coverage now also verifies approved,
  deferred, and cancelled checkpoint Decisions after a database/service restart
- `TextExecutor`
  lane-aware run prompt composition, constrained JSON proposal prompting for agent runs, opt-in workspace tool prompt guidance, opt-in domain task/evidence tool prompt guidance, and result-shaped text generation with optional minimal provider payload extraction
- `Agent capability UI helpers`
  pre-run agent capability preview wording, including text-only local executor behavior, read-only workspace opt-in state, task update/evidence tool opt-in state, structured tool-call deferral wording, and Replicate-specific text-only planning wording
- `Runs agent session summaries`
  run-detail capability summaries plus concise session metadata summaries for
  local and provider-native executor sessions, including provider raw summaries
  without exposing raw payload bodies
- `Agent provider capability descriptors`
  shared provider execution descriptors for unconfigured, local text-executor,
  OpenAI-compatible-style, fal/OpenRouter, and Replicate native text paths,
  while keeping provider-native structured tool calls behind the explicit rollout
  flag and session gate
- `Agent session metadata`
  shared local executor metadata formatting and provider-native session
  metadata formatting without persisting raw provider payloads
- `Provider tool-call normalizer`
  shared normalized provider tool-call plan validation, including fail-closed
  handling for malformed, mixed known/unknown, or raw provider payloads before
  any provider adapter can execute steps
- `OpenAI-compatible tool-call adapter`
  offline chat-completion-style `tool_calls` fixture normalization, including
  JSON argument validation and fail-closed handling when tool calls are absent
  or include non-function call shapes
- `Anthropic tool-use adapter`
  offline Messages-style `tool_use` content block normalization, including
  object input validation and fail-closed handling when content blocks are
  malformed, unsupported, or contain no supported tool
- `Provider native tool-call adapter`
  offline provider dispatch across Anthropic, OpenAI, OpenAI-compatible,
  fal/OpenRouter, and Replicate fail-closed behavior without connecting the run
  loop
- `Provider tool-call shadow observation`
  non-executing shadow normalization result summaries that skip when the
  reserved flag is disabled, report malformed provider payload failures, and
  never expose executable steps
- `Agent tool helpers`
  shared runtime tool-name guard used by provider normalization so future
  adapters validate against the same Taskplane tool list
- `AI clients`
  Vercel SDK client routing plus native Replicate text prediction request/response handling
- `HomeBriefService`
  waiting, risk, missing-next-step, recommended actions, recent artifacts, recent lifecycle activity, artifact-aware brief semantics, and active-task process-template candidate aggregation
- `SchedulerService`
  startup behavior, cron registration, fallback brief generation, and brief-time process-template selector behavior

These tests protect core business semantics before SQLite or renderer concerns enter the picture.

### Repository integration tests

Covered today:

- `TaskRepository`
  task creation, signal persistence, structured timeline writes, transitions
- `RunRepository`
  run creation, result persistence including paused runs, stale run queries
- `RunStepRepository`
  ordered execution-step creation, updates, and per-run retrieval
- `RunCheckpointRepository`
  open checkpoint creation, per-run retrieval, resume checkpoint creation, decision-id lookup, and checkpoint settlement
- `AgentSessionRepository`
  agent session metadata persistence for run-scoped executor capabilities, including task update tool capability, and terminal status updates
- `DecisionRepository`
  decision creation, optional source metadata persistence, action persistence, timeline writes
- `BriefSnapshotRepository`
  source persistence, fallback reasons, recent ordering, and limit behavior
- `WaitingItemRepository`
  active waiting-item upserts and resolution behavior
- `ArtifactRepository`
  run-output and note artifact persistence, recent ordering, and timeline writes
- `SourceContextRepository`
  source-context creation, updates, archiving, active-task listing behavior, and empty bulk lookup guards
- `BlockerRepository`
  active blocker creation, updates, resolution, per-task active lookup behavior, and empty bulk lookup guards
- `TaskDependencyRepository`
  active task-dependency creation, updates, resolution, per-task active lookup behavior, and empty bulk lookup guards
- `CompletionCriteriaRepository`
  completion-criteria creation, updates, satisfy/reopen flows, per-task ordering behavior, and empty bulk lookup guards
- `ProcessTemplateRepository`
  reusable process-template creation, updates, archive behavior, and active listing
- `TaskProcessBindingRepository`
  task-level template apply/remove flows, active binding listing, and empty bulk lookup guards

These tests verify real SQLite behavior rather than mocked repository calls.

### IPC handler tests

Covered today:

- `settings:setAiConfig`
  config writes, scheduler start/stop decisions, `settings.changed`
- `decision:act`
  decision action routing plus `decision.changed` and `task.changed`
- `run:trigger`
  run trigger routing plus `run.changed`, `task.changed`, and `brief.changed`
- `run:continuePaused`
  paused-run checkpoint continuation routing plus `run.changed`, `task.changed`, and `brief.changed`
- `task:transition`
  task transition routing plus `task.changed`
- `completionCriteria:create`
  completion-criteria writes plus `task.changed`
- `taskDependency:create`
  task-dependency writes plus `task.changed` for both blocked and upstream tasks

These tests protect the main-process edge where renderer calls become domain actions and event broadcasts.

### Preload bridge tests

Covered today:

- `window.api` exposure through `contextBridge`
- invoke-channel bindings for preload methods
- event subscription forwarding plus unsubscribe behavior

These tests protect the boundary between the Electron main process and the renderer workbench.

### Renderer interaction tests

Covered today:

- `Home recommended action -> Tasks detail`
- `Home recent artifact -> Tasks detail continuation`
- `Home key source material -> Tasks source-context focus`
- `Home source-context recommended action -> Tasks source-context focus`
- `Home key-source prioritization -> Tasks source-context focus`
- `Home recent activity -> Tasks detail follow-up intent`
- `Home recent activity -> Decisions / Runs`
- `Home recent activity` lightweight follow-up actions
- `Home recent activity` paused run follow-up actions
- `Home recent activity` blocker created/resolved recovery actions
- `Home recent activity` blocker-linked source-update re-evaluation actions
- `Home resume preview -> Tasks` recovery flow
- `Home resume preview` key-source/current-method explanations, latest-change object entry, recent-change-aware follow-up actions, and lightweight priority-lane labels
- `Home brief` process-template-aware scheduling path
- `Home key signals -> Tasks detail follow-up intent`
- `Home blocked tasks -> Tasks blocker/source-context recovery`
- `Home blocked tasks -> blocker source entry`
- `Home blocked tasks -> resolve blocker and resume waiting when clearly linked`
- `Home blocked tasks -> stale-first blocker ordering and blocker-age cues`
- `Home needs-escalation signal -> task recovery with escalation guidance`
- `Home priority-lane headline/lede copy and lane-aware recommended-action ordering`
- `Home recommended actions` lightweight priority-lane labels
- `Home recent activity` lightweight priority-lane labels
- `Home key signal` lightweight priority-lane labels
- `Brief fallback output` lane-grouped wording
- `Tasks quick decision submission`
- `Tasks quick run submission`
- `Tasks agent quick run -> read-only workspace opt-in`
- `Runs agent session summary -> read-only workspace and patch/command capability visibility`
- `Tasks paused run recovery -> checkpoint continuation`
- `Tasks related activity -> Decisions / Runs`
- `Tasks timeline -> Decisions / Runs`
- `Tasks source context create / edit flow`
- `Tasks blocker create / resolve flow`
- `Tasks completion criteria create / satisfy / reopen flow`
- `Tasks completed-transition guidance from completion criteria`
- `Tasks potential completion evidence from approved decisions, runs, and artifacts`
- `Tasks completion evidence -> likely matching criteria focus`
- `Tasks completion evidence -> open backing Decision / Run objects`
- closeout-ready recovery surfaces now also assert that approved decisions and completed runs read as explicit completion evidence instead of generic continue/review changes
- `Home closeout tasks` for completion-ready and near-completion recovery flows
- `Home closeout tasks` now also distinguish completion-ready vs evidence-check-needed wording
- `Home closeout tasks` now also cover the direct `查看收尾证据` path for near-completion tasks
- `Home closeout tasks` now also cover the direct `查看最终收尾依据` path for completion-ready tasks
- closeout tasks now also show already satisfied completion-criteria highlights alongside current closeout evidence
- near-completion closeout tasks and task resume cards now also surface the last unfinished completion criterion
- `Tasks list` now keeps completion-ready work ahead of near-completion work inside `继续推进/复核`
- `Tasks action desk` closeout primary moves now keep completion-standard review ahead of generic run setup
- `Priority lane` closeout-aware wording on home/task recovery surfaces
- `Tasks process context create / apply / remove flow`
- `Tasks resume card visibility, key-source prioritization explanation, method-selection explanation, lifecycle-aware suggested-move derivation, and recovery actions`
- `Tasks resume card` lightweight priority-lane cue
- `Tasks resume card latest-change object entry`
- `Tasks` first-screen recovery boundaries, key-slice snapshot behavior, and prioritized timeline previews
- `Tasks quick decision draft flow`
- `Tasks list` lane-aware ordering and lightweight lane labels
- `Tasks list` lane-aware summary copy
- stale task dependencies now also assert escalation-oriented home rendering instead of ordinary dependency-blocked rendering
- home recent activity now also covers dependency `created / resolved` lifecycle routing and upstream-task entry behavior
- `Tasks action desk` active-blocker primary moves now keep blocker handling ahead of generic decision/run setup
- `Tasks action setup` lane-aware quick decision/run defaults and Decision-vs-Run setup ordering
- `Tasks action desk` dependency-blocked primary moves now keep dependency re-evaluation or upstream work ahead of generic decision/run setup
- `Decision draft / Run` backend prompt composition now absorbs task-level lane guidance, and the run/brief/decision process-template selectors now assert the same lane guidance in their selection prompts
- task timeline actions and related-task timeline actions now assert lane-aware follow-up wording in renderer flows
- compact task timeline previews now assert lane-aware event selection in shared working-context tests
- compact task timeline previews now also assert long trace-heavy histories do not crowd out older action-shaping events
- latest-change selection now asserts action-shaping timeline events stay ahead of newer weak trace events
- home resume latest-change derivation now asserts meaningful task timeline events can fill gaps when global home activity does not include that task
- task timeline summaries now assert explanatory wording that does not duplicate resume latest-change phrasing
- task waiting-reason timeline changes now use shared explanatory wording across task and object surfaces
- task source-archive and process-template timeline summaries now use shared explanatory wording instead of page-local formatting
- task timeline display summaries now preserve unknown event types while routing known events through shared explanatory wording
- task timeline event badges now use shared labels while preserving unknown event types
- `Decisions` page current-focus and queue navigation
- `Decisions / Runs -> Tasks` follow-up return flows
- `Decisions / Runs` related-task timeline context
- `Decisions / Runs` related-task timeline object entry
- `Decisions / Runs` related-task timeline follow-up actions
- `Decisions / Runs` related-task timeline priority-group headings
- `Decisions / Runs` related-task timeline readable summaries as primary event text
- `Decisions / Runs` related-task timeline summaries now assert the same explanatory wording as task detail timelines
- `Decisions / Runs` focus-surface information density and action grouping
- `Decisions` page checkpoint Decision consequence guidance
- `Runs` page checkpoint summaries for confirmation-needed agent runs
- `Runs` page resume checkpoint summaries for paused agent runs
- `Runs` page paused agent checkpoint continuation action
- `Runs` page paused agent checkpoint continuation error feedback
- `Runs` page agent session capability summary, including task update tool state
- provider-specific agent capability preview wording for Anthropic, OpenAI,
  OpenAI-compatible, fal/OpenRouter, and Replicate
- `Runs` page readable agent plan-source summaries
- `Runs` page readable agent tool observation summaries
- `Runs` page replay recovery for running agent sessions with active latest
  steps, preserving inspect-first / no-auto-replay task recovery wording plus
  structured recovery intent and anchor visibility
- `Runs` page replay recovery for paused agent sessions without open
  checkpoints, keeping recovery evidence-review first and hiding direct resume
- `Runs` page replay recovery for failed agent sessions, routing back to task
  work as new-run preparation instead of replay or continuation
- `Runs` page replay recovery for cancelled agent sessions, routing back to task
  work as new-run preparation instead of replay or continuation
- `Runs` page terminal completed-session recovery, routing back to task work as
  evidence review with no restore/replay prompt
- `Runs` page trigger form refresh and newly-created run selection, including repeated triggers
- shared timeline summaries across `Tasks / Decisions / Runs`
- `Tasks` timeline date grouping layered above existing key/explain/trace
  priority groups
- `Tasks` timeline object-family grouping layered between date groups and
  key/explain/trace priority groups
- `Runs` and `Decisions` related-task timelines now share the same date /
  object-family / key-explain-trace grouping semantics as Task detail
- agent read-only timeline observations now include the same date /
  object-family / key-explain-trace scan path for `task.inspect_timeline` and
  completion evidence review
- Code Agent provider-visible artifact selection now fails closed on duplicate
  artifact ids before provider runtime config resolution
- paused agent-run continuation now blocks multiple valid open resume
  checkpoints before executing a local tool, resolving a checkpoint, or
  settling the run
- paused agent-run continuation now also blocks payload-bound
  `agentSessionId` values that do not resolve to a checkpoint-backed session
  before executing tools
- Runs page paused-run continuation gating now mirrors those backend recovery
  boundaries by hiding the continue button for multiple valid resume
  checkpoints or missing payload-bound agent-session bindings
- Runs page recovery-strip replay review, next-safe-move copy, and recovery
  instruction drafts now mirror payload-bound agent-session filtering, keeping
  missing-bound-session resume checkpoints in `checkpoint_missing`
  inspect-first recovery
- shared paused-run resume eligibility now covers unique valid resume
  checkpoint selection, supported payload checks, payload-bound session checks,
  and session-scoped replay checkpoint filtering for both backend and Runs UI
- approved checkpoint Decisions now block local tool resumption before
  execution when the checkpoint payload is bound to a missing or
  non-checkpoint-backed agent session
- `Settings save flow`
- `Settings save flow` now also asserts Home scheduler enabled/running state and scheduler timestamps refresh from Home brief data
- `Settings save flow` now also covers read-only workspace root persistence
- `waiting item` visibility and direct resolution
- `source context` visibility plus create/edit interactions in task detail, explicit key-source marking, and source-focused recovery from Home
- `process context` visibility plus create/bind/remove interactions in task detail
- `Decision cancel -> task signal refresh`
- `Run failed -> task signal refresh`
- `Decision action -> Home brief refresh`
- `Run failed -> Home brief refresh`
- `Task transition -> Home signal refresh`
- `Runs` page current-focus detail inspection
- Timeline readable summaries and compact expansion behavior
- Timeline compact expansion now asserts long trace-heavy histories keep action-shaping groups visible before trace events
- Timeline compact expansion now also asserts priority-group headings for key, explanatory, and trace events
- Timeline action shortcuts for failed, waiting, risk, and artifact events, including shared gating for key and strongly explanatory events
- Timeline object entry shortcuts for decision, run, source, and run-backed artifact events, including shared gating for key and strongly explanatory events
- task detail artifact visibility and Home recent-artifact visibility
- task detail current-snapshot/action-desk/activity-feed presentation paths
- lane-aware task transition guidance and recommended transition ordering in task detail
- newly created tasks reopening into clarify-first task detail focus instead of only appearing in the list
- early captured/triaged tasks reshaping the action desk toward clarification-first primary moves
- early captured/triaged tasks using clarify-first resume wording in recovery surfaces instead of generic lifecycle fallback copy
- early captured/triaged tasks surfacing as clarify-first home recent-activity items
- early captured/triaged tasks using clarify-first task-list summary and card copy
- early captured/triaged tasks using clarify-first wording in brief fallback output

These tests focus on high-value control-plane interactions rather than broad page rendering snapshots.

## What Is Not Covered Yet

Still missing or intentionally light:

- end-to-end packaged-app tests
- richer timeline grouping beyond priority-level sections is covered at the
  renderer/helper level; packaged visual regressions remain intentionally light

## Current Quality Gates

Every meaningful change should pass:

```bash
npm run verify
```

Current verification:

- `npm run verify` for tests, type-checking, and production build
- on 2026-05-01, `npm run verify` passed locally with 128 test files / 936
  tests after adding checkpoint-id-bearing blockers for invalid or unsupported
  paused-run resume payloads.
- on 2026-05-01, `npm run verify` passed locally with 128 test files / 936
  tests after naming non-recovery open checkpoint kinds in agent-session
  recovery next-step copy without changing resume eligibility.
- on 2026-05-01, `npm run verify` passed locally with 128 test files / 936
  tests after making unsupported approved checkpoint resume evidence
  actionable for unknown tool-permission checkpoints and patch-promotion
  checkpoints without a preflight service.
- on 2026-05-01, `npm run verify` passed locally with 128 test files / 934
  tests after covering source-context metadata in Runs checkpoint summaries
  while keeping long source content out of the inline checkpoint summary.
- on 2026-05-01, `npm run verify` passed locally with 128 test files / 934
  tests after surfacing task-domain tool inputs in Runs checkpoint summaries.
- on 2026-05-01, `npm run verify` passed locally with 128 test files / 933
  tests after classifying `decision.draft` as a local-write/task-mutation tool
  and covering approved checkpoint resumption for it.
- on 2026-05-01, `npm run verify` passed locally with 128 test files / 932
  tests after aligning Decisions page checkpoint guidance and task follow-up
  prefill with the broader approved tool-permission resumable tool set.
- on 2026-05-01, `npm run verify` passed locally with 128 test files / 931
  tests after aligning Runs browser-controlled review copy with the approved
  single-action Browser Controlled Resume path.
- on 2026-05-01, `npm run verify` passed locally with 128 test files / 931
  tests after moving the approved tool-permission Decision resumable-tool
  boundary into a shared payload helper and covering task next-step checkpoint
  resumption.
- on 2026-05-01, `npm run verify` passed locally with 128 test files / 929
  tests after extracting checkpoint-backed agent-session status writes into a
  shared settlement helper used by RunService and DecisionService, with helper
  coverage proving running sessions are not checkpoint-settled.
- on 2026-05-01, `npm run verify` passed locally with 128 test files / 928
  tests after Task detail Timeline date/object-family grouping, related
  Timeline surface alignment, agent read-only timeline observation alignment,
  duplicate Code Agent artifact selection boundary coverage, ambiguous paused
  resume checkpoint blocking, payload-bound resume session validation, Runs
  recovery anchor/gating/replay alignment, shared resume eligibility helper
  extraction, Decision approval session-binding validation,
  completed-session terminal evidence, and cancelled-session new-run routing
  coverage.
- GitHub Actions runs `npm run verify` on pushes to `main` and pull requests when Actions capacity is available
- `npm run smoke:build` when package/build entrypoints change
- `npm run smoke:package:mac` after producing `release/mac-arm64/Taskplane.app`, including ASAR content checks
- `npm run smoke:runtime:mac` after producing `release/mac-arm64/Taskplane.app`, for isolated packaged startup and SQLite schema initialization
- `npm run smoke:release:mac` for the combined unsigned macOS build/package/runtime path
- `npm run accept:agent-local` for the local agent stack, including the non-live
  sandbox/code-agent domain boundary and the Code Agent preflight UI/config/IPC
  gate
- `npm run accept:sandbox-coding` when you only need the non-live sandbox/code-agent
  domain boundary, including staged patch contracts and Decision-gated promotion
  behavior
- `npm run accept:sandbox-coding:code-agent-ui` when you only need the Code Agent
  preflight summary, package-script availability gates, renderer payload
  filtering, and IPC recheck
- `npm run accept:sandbox-coding:producer-preview-smoke` when you need the
  sandbox producer preview smoke. It skips by default; with
  `TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE=true`, it exercises the non-live
  preview service without Docker, provider calls, or selected-workspace
  mutation. Add `TASKPLANE_RUN_SANDBOX_PRODUCER_DOCKER_CHECKS=true` only for a
  deliberate Docker-backed local check smoke.
- `npm run accept:sandbox-coding:patch-promotion-apply-smoke` when you need the
  disposable-workspace patch-promotion apply smoke. It does not start Docker or
  call AI providers.
- `npm run manual:browser-evidence-smoke` when validating Tier 1 browser
  evidence against a disposable local fixture. It starts local browser
  automation, but does not call providers, use authenticated profiles, or expose
  a model-visible browser tool.
- `npm run manual:browser-controlled-smoke` and
  `npm run manual:browser-controlled-resume-smoke` when validating the local-QA
  controlled browser path. These run against disposable localhost fixtures and
  keep arbitrary URLs, authenticated profiles, scheduler auto-start, and
  provider calls out of scope.
- `npm run accept:provider-native-live:preflight` before spending provider
  credit on live provider-native validation; this is read-only and prints
  redacted readiness only
- `npm run accept:provider-native-live` only when a deliberate one-call provider
  tool-call probe is acceptable
- `npm run accept:provider-native-live:run` only when a deliberate one-call
  provider-backed RunService settlement probe is acceptable
- `npm run accept:release:mac-preflight` before signed/notarized macOS release
  readiness checks; it is read-only and does not sign, notarize, upload, or call
  Apple services

When GitHub Actions is unavailable or disabled because of monthly quota, local verification is the temporary source of truth:

- run `npm run verify` before pushing ordinary changes
- run `npm run smoke:build` when package/build entrypoints change
- run `npm run smoke:package:mac` after `npm run dist:mac:dir`
- run `npm run smoke:runtime:mac` after `npm run dist:mac:dir`
- or run `npm run smoke:release:mac` to cover the unsigned macOS package path in one command
- run `npm run accept:provider-native-live:preflight` for no-credit
  provider-native readiness checks, but avoid the live provider-native commands
  unless spending test credit is intentional
- run browser and sandbox manual smoke commands only from a deliberate local
  validation pass; they do not require GitHub Actions, but some of them may
  start local browser automation, Docker-backed checks, or disposable-workspace
  apply paths when their explicit env gates are enabled
- run `npm run accept:release:mac-preflight` for no-upload macOS release
  readiness checks when signing/notarization inputs change
- avoid manually dispatching or watching remote workflow runs until Actions capacity is restored

## Suggested Next Test Targets

Recommended next additions:

1. targeted packaged-app smoke coverage for the Task detail Timeline scan path

The current goal is not exhaustive coverage. The goal is to protect the product's control-plane semantics and the most expensive-to-break local-first flows.

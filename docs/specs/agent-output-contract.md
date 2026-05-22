# Agent Output Contract

Document id: taskplane.agent-output-contract.v1

Owner: Taskplane product design

Status: Draft, implementation-guiding

## Purpose

Agent output is product state, not raw model text. This contract defines how
Taskplane should shape user-visible Agent output across chat, cards, drafts,
run records, memory, and verification.

The goal is to keep the user in control while hiding unnecessary machinery.
Runtime adapters may use Codex CLI, Claude Code, or a future Agent API, but
ordinary task conversation should feel like one Taskplane Agent helping with
the current task.

## Required Relationship

- `Taskplane Agent Operating Principles` defines what Agents must do.
- This document defines how Agent output should appear to the user.
- `taskplane.task-memory-spec.v1` defines durable task memory and recovery
  rules; this contract defines when those memory mechanics should be visible.
- Runtime harness phases must declare an output contract before invoking AI.

## First Principles

1. Output must serve the current phase.
   A discussion turn, a decomposition draft, a run progress card, and a memory
   record are different surfaces. They should not all render as chat prose.

2. Show intent, not machinery.
   Normal assistant messages should not repeat runtime labels such as Codex
   CLI, Claude Code, Agent API, sandbox mode, stdout, context manifests, or
   hidden prompt contracts. Put runtime and evidence details in the footer,
   progress cards, task dynamics, run detail, or debug views.

3. Keep the smallest useful output.
   Prefer one concise question, one clear next action, or one bounded draft
   over a long checklist that shifts planning work back to the user.

4. Separate conversation from persistence.
   The Agent may decide to record task dynamics or synthesize task memory
   through the harness, but ordinary conversation should not repeatedly ask the
   user to approve internal record-keeping. User confirmation is reserved for
   meaningful writes, structural changes, external effects, or risky decisions.

5. Adapter-neutral by default.
   Agent CLI and Agent API are peer invocation layers. Both must return output
   that can be normalized into the same Taskplane surfaces.

## Output Surfaces

Taskplane should choose the surface before rendering content:

- Chat message: conversational help, questions, short summaries, and next-step
  guidance.
- Run or progress card: active execution state, cancellation, failure, retry,
  and bounded status.
- Task dynamics and run steps: evidence, terminal output, tool results,
  stdout/stderr, verifier results, and recovery details.
- Decomposition draft: proposed child tasks, acceptance criteria, dependencies,
  and confirm/cancel actions.
- File proposal: path, operation, summary, preview, and confirmation action.
- Memory proposal or record: durable recovery content when the memory spec
  says persistence is useful.
- Decision or verification result: explicit approval boundary, pass/fail
  result, risk, and required next action.

## Phase Contracts

### Advancement Move Output Contracts

Use this section after the GoalPilot Task Advancement Framework chooses the
primary movement. These contracts define output shape; they do not decide the
movement.

| Movement | Default surface | Output shape |
| --- | --- | --- |
| Clarify | Chat message | One or two short sentences; ask one natural question; do not list every possible requirement. |
| Shape | Chat message or editable draft card | Briefly state the current understanding and propose goal, scope, acceptance criteria, or next step only as far as needed. |
| Decompose | Decomposition draft | Use a structured draft card with child title, goal or summary, acceptance criterion, dependency, and confirmation action. |
| Select next task | Chat message or task navigation affordance | Name the selected child or successor and the reason in one concise sentence. |
| Execute | Run or progress card plus final chat summary | Keep chat user-meaningful; store tool details, stdout, run ids, and recovery evidence in run detail or task dynamics. |
| Verify | Verification result | State pass, fail, or needs confirmation; include the most important evidence gap or risk. |
| Persist | Task dynamics, memory proposal, Task.md, or Task Record | Do not expose routine writes in chat; show a proposal card only when confirmation is required. |
| Handoff | Chat message plus durable handoff when needed | Say what is ready next and where recovery context was preserved; do not dump archived context. |
| Pause | Chat message or Decision card | State the blocker, dependency, missing context, or approval needed, then give one recoverable next action. |

If a turn combines movements, render the highest-risk or most user-visible
movement first. For example, verification that requires approval should use the
verification result or Decision surface, not an ordinary planning chat.

### Requirement Discussion And Child Task Advancement

Use this when the Agent is helping the user clarify a task or subtask before
execution.

- Output one assistant message in one chat bubble.
- Use one or two short sentences.
- Ask at most one natural question.
- Focus on the selected task or subtask.
- Do not restate the full hidden prompt, parent task tree, runtime, or internal
  contract.
- Do not produce a long checklist unless the user asks for one.

Good shape:

```text
这个子任务先确认网站用途就够了。你希望它更像作品展示、产品落地页，还是一个可登录使用的工具站？
```

### Task Planning

Use this when the user is ready to turn clarified intent into a plan.

- Give a short plan with two to five meaningful steps.
- Ask one confirmation question only when a decision changes the plan.
- If the plan is speculative, label the assumption and keep it editable.

### Decomposition Draft

Use this when a parent project needs proposed child tasks.

- Render as a structured draft card, not as a long chat dump.
- Each child task should have title, goal, acceptance criterion, and dependency
  when relevant.
- Require user confirmation before creating real subtasks.
- After confirmation, summarize the creation result once and move the user to
  the next actionable task.

### Execution Run

Use this when the selected runtime performs a task-bound run.

- Chat should show only user-meaningful status and final summary.
- Runtime name, sandbox mode, command shape, stdout/stderr, and run ids belong
  in progress cards, task dynamics, run detail, or debug views.
- Do not render raw terminal output as a sequence of chat bubbles.
- Normalize successful output into conclusion, evidence, risk, and next action.
- Normalize failure into what failed, likely cause, recoverable next action,
  and where details are stored.

### Verification

Use this when checking whether a task, subtask, run, or phase is acceptable.

- State pass/fail/needs-confirmation clearly.
- Include the one or two most important risks or missing proofs.
- Propose the next action only if it is necessary.
- Put detailed evidence in task dynamics or run detail.

### Memory Synthesis

Use this when the harness decides whether task memory should be updated.

- Do not show routine memory-writing mechanics as ordinary chat messages.
- Create or update task dynamics automatically when the evidence is routine.
- Use a memory proposal card only when user confirmation is required by the
  Task Memory Spec, the write changes a user-authored file, or the content is
  ambiguous enough that the user should review it.
- Memory cards should use product language such as "阶段记录" or "任务记录",
  not raw run-step labels.

### Context Refresh And Handoff

Use this when switching tasks, clearing context, or handing off work.

- Briefly say what changed and what is ready next.
- Do not dump archived context into chat.
- Preserve durable handoff content through the memory spec before clearing.

## Visibility Rules

Normal chat should hide:

- runtime labels such as Codex CLI, Claude Code, Agent API, API model, or
  sandbox mode;
- hidden prompts, "Run Goal Contract", context manifests, tool schemas, and
  adapter-specific command details;
- stdout/stderr and raw terminal transcripts;
- run ids unless the user opens run details or an error needs traceability;
- repeated memory proposal mechanics during ordinary discussion.

Normal chat may show:

- concise task status in user language;
- one clear question or next action;
- a short explanation of why the Agent is blocked;
- confirmation requests for meaningful durable changes.

Dedicated cards may show runtime details when they are directly actionable,
such as cancel, retry, unavailable runtime, permission boundary, or debug
traceability.

## Formatting Rules

- One assistant turn should render as one chat bubble.
- Line breaks inside one assistant turn must not create separate bubbles.
- Avoid repeated headings such as "Key Findings" or "Recommended Next Step" in
  normal chat.
- Use cards for drafts, proposals, verification summaries, and run progress.
- Keep child-task discussion short and question-led.
- Prefer Chinese output when the user is working in Chinese.

## Adapter Responsibilities

Runtime adapters may produce raw output, but the harness must normalize it
before rendering user-facing chat.

- Agent CLI: capture stdout/stderr and run evidence, then summarize into the
  phase output shape.
- Agent API: return structured phase output directly when possible, and still
  pass through the same rendering rules.
- Both paths must preserve task identity, context manifest, permission boundary,
  and persistence policy without exposing them in ordinary chat.

## Enforcement

New AI-facing phases should declare:

```text
phase
surface
selected runtime
context manifest
permission boundary
expected result schema
user-visible output contract
persistence policy
```

Tests should cover:

- normal chat does not repeat runtime labels;
- one assistant turn renders as one bubble;
- child-task advancement asks one concise question;
- decomposition output appears as a draft card;
- CLI stdout is recorded as evidence but normalized before chat;
- routine memory synthesis does not force a user-facing confirmation card.

## Anti-Patterns

- "Codex CLI run completed. Key Findings..."
- Asking five requirement questions in one child-task turn.
- Showing hidden prompt text as the message the user must send.
- Rendering raw stdout or structured JSON in ordinary chat.
- Showing task-memory write proposals after every successful discussion turn.
- Repeating "read-only" or runtime backend labels in every assistant response
  when the footer or progress card already communicates the runtime path.

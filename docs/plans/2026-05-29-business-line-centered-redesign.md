# Business-Line-Centered GoalPilot Redesign

Date: 2026-05-29
Status: Draft for product discussion
Owner: Product design

## Decision Summary

GoalPilot should move its product center from task management to business-line
progression.

The current product is a task-native control layer with AI execution, durable
task memory, decisions, source context, artifacts, skills, runtime configuration,
and local safety gates. That foundation is still valuable. The adjustment is to
make a long-lived business line the primary object users understand, while
tasks become next actions inside a business line or one-off actions handled
directly through chat.

The new product promise:

> GoalPilot makes each business line legible to AI, executable by agents,
> reviewable by the user, and able to improve from its own results.

User-facing phrasing should be simpler:

> GoalPilot helps each business line build its own working memory, next-step
> judgment, and reusable playbook.

Or shorter:

> Every business action should make the next action smarter.

The product should not become a generic "business operating system" with many
visible abstract objects. Use a simple surface:

- business lines as the main durable workspaces;
- records and files as business memory;
- current suggestions as the cross-business attention surface;
- decisions as the approval boundary;
- skills/SOPs as reusable business know-how;
- capabilities as the global agent/tool configuration layer.

## First Principles

The user is not primarily trying to manage tasks, notes, files, or agents. The
user is trying to make a long-running effort become more capable over time.

For GoalPilot, a useful business line must do five things:

1. Capture important context so AI can read what happened.
2. Decide the next useful move from current context.
3. Execute or assist execution through the available agent/runtime tools.
4. Gate risky actions through explicit decisions and quality checks.
5. Feed results back into records, skills, SOPs, and future suggestions.

Use the razor:

- If a concept only helps the system reason, keep it internal.
- If users must act on it repeatedly, make it visible.
- If it is only a future sharing or marketplace concern, defer it.
- If an existing Taskplane surface can carry the responsibility, reuse it before
  adding a new module.

## What Changes

### From Task-First To Business-Line-First

Current object language:

```text
Task -> decomposition -> run -> record -> decision -> closeout
```

Target object language:

```text
Business line -> records -> current suggestions -> execution -> review -> improved skills/SOPs
```

Tasks still exist, but their product role changes:

- one-off tasks can be handled in chat without becoming a durable business
  object;
- project and routine tasks become business lines or next actions within a
  business line;
- scheduled and event-triggered tasks become automations inside a business line;
- composite tasks should not remain a separate product type unless a concrete
  workflow later proves the need.

### Work Navigation

Keep the existing two-zone sidebar structure.

```text
Work
- Today / Current Suggestions
- Business Lines
- Chat
- Decisions

Capabilities
- External Access
- Skills
- MCP
- AI Runtime
- Work Habits
- Settings
```

The work zone changes because the primary object changes. The capabilities zone
mostly stays because those are global agent/tool/system configuration surfaces.

Chat remains a first-class mode, but the default daily entry should be Today /
Current Suggestions rather than Chat. This prevents GoalPilot from feeling like
another generic AI chat app. Business Line is the durable data object; Today is
the daily use entry; Chat is the interaction mode.

Tasks should be removed from the top-level work navigation. Task management is
not deleted; it becomes business-line next actions plus cross-business current
suggestions.

Brief should be renamed or reframed as Current Suggestions. It should no longer
feel like a task summary; it should surface:

- progress suggestions: what to do next;
- record suggestions: what context is missing;
- improvement suggestions: which skill, SOP, tool, source, or workflow should
  be upgraded.

### Chat Modes

The right-side chat panel should remain because it is useful for working beside
a selected business line, record, file, or action.

Add two more modes:

- Chat page: a full main-area conversation surface opened from the Work zone.
- Focus chat: a full-screen mode available from any page that hides detail panes
  but preserves the current context.

Every chat mode must show a compact context indicator:

```text
Context: Global
Context: Business line / Personal media account
Context: Business line / Personal media account / Content creation
Context: Next action / Draft three Xiaohongshu scripts
```

This prevents full-screen discussion from losing the writeback target.

### Collapsible Sidebar

The left sidebar should support three states:

- expanded: icon, label, zone headers, footer;
- compact: icons only, active route highlighted, tooltip on hover;
- focus: a narrow handle or active-route icon remains visible so the user can
  recover navigation without hunting.

Do not fully hide the sidebar by default. A visible handle preserves orientation
and makes recovery predictable.

## Business Line Workspace

A business line is a template-generated, user-adjustable workspace. It should
not be a rigid business ontology.

An item should become a business line only when it is long-lived enough to
benefit from durable memory and learning. Use this rule of thumb:

- lifecycle is longer than two to four weeks;
- it repeatedly produces records, decisions, outputs, and feedback;
- it has a continuing goal or lightweight success signal;
- it can accumulate reusable skills, SOPs, or judgment rules;
- it will generate multiple future next actions.

Otherwise:

- one-off work stays a chat action;
- short complex work becomes a next action inside a business line;
- repeated scheduled/event work becomes an automation inside a business line.

Minimum visible sections inside a business line for the architecture:

```text
Overview
Files / Records
Next Actions
Review
Skills / Rules
Settings
```

The MVP UI can compress this to four visible areas:

```text
Overview
Records
Next Actions
Learning
```

`Learning` combines review and skills/rules until usage proves they need
separate first-level tabs. Settings can live behind a secondary action.

Overview should answer:

- What is this business line trying to accomplish?
- What changed recently?
- What should be done next?
- What is blocked by a decision?
- What result came back recently?
- What context is missing?
- What improvement did the system discover?

Files / Records should present the generated business structure. The folder
tree is the user's understandable mental model; the system can attach metadata
behind it.

Do not make folder management the core product experience. AI should reason
over record types even when users browse a folder tree.

Minimum record metadata:

```text
type: signal | hypothesis | decision | action | artifact | result | review | rule
business_line_id
source
summary
created_at
confidence
linked_action_id
linked_decision_id
should_affect_future_context
```

This lets GoalPilot distinguish evidence, decisions, results, and reusable
rules instead of treating every file as equal note text.

Next Actions is one queue per business line. Folder-specific action views can be
filters, but each folder should not own a separate todo system.

Review turns results into durable learning. Its output can update records,
business-line skills, SOPs, and future suggestions.

Skills / Rules shows business-line skills only. Global skills stay in the
Capabilities Skills page.

Default context isolation:

- a business line should not silently load another business line's records or
  skills;
- cross-business reuse must be explicit, such as "create from existing business
  line" or "reference this other business line's learning";
- borrowed learning should be copied as a proposed skill/SOP, not silently used
  as active context.

### Business Line Context Pack

Each agent run or substantial chat turn against a business line should assemble
a compact `BusinessLineContextPack`:

```text
business summary
current goal
current stage
recent changes
active decisions
open next actions
latest records
accepted skills/SOPs
lightweight signals
known constraints
permission boundaries
missing context
```

This is the concrete meaning of "AI-legible business line".

## Business Line Creation

Creation should be conversational but short. The goal is not to collect every
detail; the goal is to generate a useful starting workspace and make the line
AI-legible from day one.

Ask only questions that shape the first useful structure:

1. What is this business line?
2. What outcome would make it better?
3. What information must be recorded continuously?
4. What work should AI be allowed to do, and what needs confirmation?
5. Is this based on an existing business line's structure or experience?

The result should generate:

- initial folder structure;
- a business-line summary;
- default `_skill.md` or equivalent business-line skills;
- default review prompts;
- initial current suggestions;
- decision boundaries;
- optional external source notes.

### Example: Personal Media Business

Default structure should be stable and simple:

```text
00_Inbox
01_Market_and_Competitors
02_Topic_Pool
03_Content_Creation
  Xiaohongshu
  Douyin
  Bilibili
04_Publishing_Records
  Xiaohongshu
  Douyin
  Bilibili
05_Data_Feedback
06_Review_and_Learning
07_Business_Rules
```

Do not ask the user to choose between "platform-first" and "topic-first"
information architecture during creation. Generate the stable default and let
the user adjust it later.

When a topic is selected and becomes a concrete content action, the user and AI
can decide form and platform:

```text
short text / image / short video / long video
Xiaohongshu / Douyin / Bilibili / other
```

The resulting files can be placed under the relevant platform folders. If the
user later prefers a topic-first layout, that is a workspace customization, not
an upfront product branch.

### Example: Web Product Business

Default structure:

```text
00_Inbox
01_Market_and_Demand
02_Product_Ideas
03_Validation_and_Research
04_Product_Development
05_Release_Records
06_User_Feedback
07_Review_and_Learning
08_Business_Rules
```

Do not pre-create "core app", "website", "docs", or "payment" folders during
business-line creation unless the user already names them. Concrete products
should be created during business progression:

```text
04_Product_Development/Taskplane
04_Product_Development/Landing_Page
```

Different ends or modules of the same product should usually live inside the
same product folder. Different products should get different folders.

## Skills, Work Habits, And SOPs

Keep the Skills page simple:

```text
Global Skills
Business Line Skills
```

Global skills are reusable capabilities such as brainstorming, frontend design,
documentation, SEO, code review, and spreadsheet work.

Business-line skills are scoped to one business line. They may be associated
with a folder or stage, but the top-level Skills page does not need a third
"stage skills" category. A business-line skill can display its origin:

```text
Business line: Personal media account
Origin: 02_Topic_Pool/_skill.md
Purpose: topic selection rules
```

Work Habits should remain separate from business SOPs.

- Work Habits record how the user prefers to collaborate with AI.
- Business Skills/SOPs record how a specific business line should operate.

Work Habits can have global or business-line scope. Avoid folder-level Work
Habit scope until real usage proves it is necessary.

Business-line skill/SOP updates need provenance and rollback because bad
learning can pollute future execution.

Minimum fields for a business-line skill revision:

```text
skill_id
business_line_id
scope_path
previous_content
next_content
change_reason
source_review_id
approved_by
status: proposed | active | disabled | superseded
effective_at
rollback_target_revision_id
expires_or_review_after
```

## Capabilities

External Access, MCP, and AI Runtime should remain global configuration
surfaces.

Do not split every capability by business line in the first version. That would
create configuration complexity before the need is proven.

Use this rule:

- configuration and readiness are global;
- usage context can be business-line-specific;
- permission gates belong to the action that uses the capability.

Examples:

- Gmail authorization is global, but selected Gmail evidence can be attached to
  one business line.
- MCP servers are globally installed and inspected, but a business-line action
  can choose to use an MCP tool.
- AI Runtime is globally configured, while a run can still show which runtime
  was used and whether the action required confirmation.

Action-level risk should drive Decisions:

```text
read_only: can run automatically when context is clean
draft_only: can generate output, user publishes or applies it
local_mutation: requires confirmation before writing user files or state
external_write: strong confirmation and decision record
money_deploy_publish: strong confirmation, decision record, and verification
```

## Closed-Loop Improvement

This is the key product upgrade.

Iteration review should not be only a final folder or occasional ritual.
Improvement must run through the whole business-line cycle.

Every important action can produce one of three outcomes:

1. Progress: the business line moved forward.
2. Evidence: the business line learned something about the market, user,
   product, content, channel, or workflow.
3. Improvement: the business line discovered that a record, skill, SOP, tool,
   source, or quality gate should change.

Current Suggestions should therefore include improvement suggestions, not only
task suggestions.

Example improvement suggestions:

```text
This content draft required repeated title rewrites. Suggest updating
03_Content_Creation/_skill.md with the final title-screening rule.
```

```text
This development action failed because the project launch command was unclear.
Suggest generating a run/verify skill for 04_Product_Development/Taskplane.
```

```text
This topic decision lacked recent competitor examples. Suggest adding a weekly
competitor capture action under 01_Market_and_Competitors.
```

High-impact improvements should route through Decisions before changing
business-line structure, permissions, external integrations, or durable SOPs.
Low-risk improvements can be proposed inline after review.

### Suggestion Shape

Today / Current Suggestions should not be a list of vague AI recommendations.
Each suggestion should carry an explanation compact enough for the user to
trust or reject it:

```text
type: progress | record_gap | improvement
business_line_id
title
why_now
expected_impact
effort
risk
confidence
source_record_ids
next_step
requires_decision
```

### Review Shape

Review should be structured enough to change future behavior. A freeform
summary can be shown to the user, but the durable review object should include:

```text
review_id
business_line_id
source_action_id
result_summary
evidence_items[]
hypothesis_change
skill_update_suggestions[]
next_action_suggestions[]
confidence
requires_decision
created_at
```

### Lightweight Signals

Do not build a full metrics dashboard in the first redesign, but each business
line should define one to three lightweight signals so improvement can be
grounded in results.

Examples:

- web product: releases shipped, user feedback count, validated requests;
- media: posts published, comments/saves/views, topic hit rate;
- ecommerce: conversions, material test result, return/refund signals.

## Task Package Evaluation

The earlier "task package" idea has a useful core: a successful execution can be
captured as a repeatable unit with inputs, steps, tools, permissions, outputs,
verification, and risk boundaries.

However, with business lines as the first-class object, task packages should not
become a separate top-level module.

Decision:

- do not add Task Packages as a first-class object in the redesign;
- preserve the reusable-execution idea as business-line skills, SOPs, and
  future template actions;
- defer sharing/marketplace packaging until business-line reuse is proven.

Why:

- a visible Task Package object competes with Task, Skill, SOP, Automation, and
  Business Line;
- safety comes from structured inputs, permissions, quality gates, and
  confirmation boundaries, not from the word "package";
- users should experience "this business line got better at doing this" before
  they are asked to manage reusable packages.

Possible later feature:

```text
Save as Template Action
```

This should appear after a successful review, not as a navigation module.

## Current Implementation Assessment

Current routes:

```text
brief
tasks
decisions
connections
skills
mcp
model
work-habits
settings
```

Current strengths to reuse:

- `BriefPage` already projects a capped attention surface.
- `TasksPage` already has task detail, files, artifacts, source contexts,
  project decomposition, scheduled/event/routine concepts, completion checks,
  task dynamics, and right-panel handoff.
- `DecisionsPage` already functions as a judgment inbox.
- `RightPanel` already supports global and task-bound chat context.
- `SkillsPage`, `McpPage`, `ConnectionsPage`, `ModelPage`, and
  `WorkHabitsPage` already define the capability zone.
- The main process already has repositories and services for tasks, decisions,
  runs, run steps, artifacts, source contexts, task files, process templates,
  and work habits.

Current limitations:

- durable memory is task-bound rather than business-line-bound;
- top-level navigation teaches users to think in tasks;
- task types are overloaded with one-off, project, scheduled, event, routine,
  and composite-like usage;
- `TasksPage` carries too much product responsibility;
- improvement suggestions exist only indirectly through closeout, completion
  checks, Work Habits, and process templates;
- chat has only docked/suspended behavior, not a full chat page or focus mode.

## Data Model Direction

Avoid a risky all-at-once migration.

### Minimal Canonical Shell

Recommended first step: add a minimal `business_lines` table while using an
adapter to read existing task-bound data.

```text
business_lines
- id
- title
- summary
- goal
- kind/template
- status
- legacy_task_id nullable
- created_at
- updated_at
```

This gives the new product object a real canonical home without forcing a full
task-memory migration.

### Compatibility Adapter

Existing top-level `project` and `routine` tasks can be mapped into business
lines through `legacy_task_id`. Keep existing task IDs and task-bound memory
while proving the new product shape.

This allows the navigation and workspace experience to change before database
migration.

### Expanded Canonical Phase

After the MVP proves the loop, expand the model:

```text
business_lines
- id
- title
- summary
- kind/template
- goal
- status
- structure_json
- source_business_line_id
- created_at
- updated_at
```

Add business-line links to existing objects where needed:

```text
tasks.business_line_id
decisions.business_line_id
runs.business_line_id
artifacts.business_line_id or inherited from task/run
source_contexts.business_line_id or inherited from task/run
task_files.business_line_id
process_templates.business_line_id
work_habits.business_line_id nullable
timeline_events.business_line_id or business_line_events
```

Do not duplicate every task table immediately. The first canonical migration can
link existing records to a business line and keep task-bound details for next
actions.

## Migration Plan

### Phase 1: Product Language And Navigation

- Add Work routes: Today / Current Suggestions, Business Lines, Chat,
  Decisions.
- Keep Capabilities routes unchanged: External Access, Skills, MCP, AI Runtime,
  Work Habits, Settings.
- Rename Brief surface to Today / Current Suggestions.
- Hide Tasks from top-level navigation; expose legacy Tasks through Business
  Lines or a temporary internal route during migration.
- Add collapsible sidebar states.
- Add full chat page and focus chat mode after the business-line loop is usable.

Acceptance:

- the top-level app no longer teaches "Tasks first";
- all existing capabilities remain reachable;
- no existing data is lost or silently migrated.

### Phase 2: Business Line Workspace MVP

- Add the minimal `business_lines` shell.
- Add Business Lines list.
- Map existing top-level project/routine tasks into business-line cards through
  a compatibility adapter.
- Create a Business Line workspace wrapper around existing task detail data.
- Show Overview, Records, Next Actions, and Learning.
- Keep child tasks as Next Actions.
- Keep task files/artifacts/source contexts visible as records/outputs.

Acceptance:

- an existing project can be opened as a business line;
- users can see next actions without opening the old Tasks page;
- decisions and chat still work with the selected context.

### Phase 3: Business Line Creation Wizard

- Add template-based creation for one dogfood template and custom. The first
  template should be Web Product / Software Product so GoalPilot can manage its
  own development loop.
- Generate default folder structure and initial business-line skills.
- Ask only the short creation questions listed above.
- Allow creation based on an existing business line's structure and skills.
- Do not copy historical records by default.

Acceptance:

- a user can create a useful business line in under two minutes;
- generated structure is editable after creation;
- inherited business lines carry structure/SOPs, not stale history.

### Phase 4: Review And Improvement Loop

- Add review capture after meaningful execution.
- Project review output into records, skill/SOP updates, and improvement
  suggestions.
- Add suggestion type: progress, record gap, improvement.
- Add skill/SOP revision provenance and rollback.
- Route high-risk structure/permission changes to Decisions.
- Keep "Save as Template Action" deferred unless repeated usage proves demand.

Acceptance:

- after an action completes, the system can suggest a concrete business-line
  improvement;
- accepted improvements update the correct business-line skill/SOP surface;
- rejected improvements do not affect future agent context.

### Phase 5: Automations And Sensors

- Move scheduled/event concepts into business-line automation settings.
- Treat External Access previews as sensors that produce reviewable business
  records.
- Add capability gates per action, not per abstract business-line matrix.

Acceptance:

- scheduled/event work is understandable as "this business line watches or runs
  this loop";
- external evidence never becomes business memory without review;
- mutating actions still require the existing confirmation boundaries.

## Reference Products And Adopted Lessons

- Todoist: use Inbox/Today/Projects as evidence that low-cognitive-load
  navigation works. Adopt quick capture, current-focus view, and project-like
  grouping. Do not inherit task-first positioning.
  Reference: https://www.todoist.com/help/articles/todoist-glossary-cA60laWMH
- Linear: use workspace/project/agent guidance/template separation as a model
  for keeping work objects separate from agent configuration. Adopt scoped
  templates and guidance. Do not copy software-team-specific issue semantics.
  References: https://linear.app/docs/linear-agent and
  https://linear.app/docs/project-templates
- Notion: use templates as starting structures, not rigid ontology. Adopt
  editable generated templates. Do not compete on freeform document power.
  Reference: https://www.notion.com/en-gb/help/database-templates
- GitHub Actions: reusable workflows show how repeatable execution needs
  explicit inputs, permissions, and caller/callee boundaries. Adopt this later
  for template actions, not as an MVP module.
  Reference:
  https://docs.github.com/en/actions/reference/workflows-and-actions/reusable-workflows
- Claude Skills: skills are useful when repeated instructions or procedures
  should be loaded on demand. Adopt global skills and business-line skills.
  Reference: https://code.claude.com/docs/en/skills
- MCP: MCP is a global tool/data integration layer. Keep MCP as a capability
  surface, while business-line actions can use MCP tools through gates.
  Reference: https://modelcontextprotocol.io/docs/getting-started/intro
- YC AI-native/self-improving company talks: adopt the principles that company
  context must be AI-legible, closed loops beat open loops, context/skills are
  more valuable than ephemeral software, and agents should improve the system
  after failures. Do not copy the full "company brain" scope into the first
  product milestone.
  References:
  https://www.youtube.com/watch?v=EN7frwQIbKc and
  https://www.youtube.com/watch?v=t-G67yKAHBQ

## Non-Goals For The First Redesign

- full company brain;
- token usage management;
- marketplace for task packages or workflow templates;
- complex per-business-line MCP/runtime/source permission matrices;
- independent folder-level todo systems;
- folder-level Work Habit scope;
- autonomous night-time code changes or deployment;
- full metrics dashboard for every business type;
- forcing every business into a fixed loop taxonomy.

## Open Decisions

1. Naming: internally use `business_line`; Chinese UI should likely use
   "业务"; English UI can use "Businesses" or "Ventures".
2. Today naming: use "Today / 今日" for the daily route, with "current
   suggestions" as the internal concept.
3. Learning visibility: MVP should show a lightweight Learning area, not a heavy
   Review management tab.
4. Template scope: start with Web Product / Software Product plus Custom; add
   Personal Media and Ecommerce after dogfooding proves the loop.
5. Chat order: Chat remains a first-class Work route, but Today should be the
   default daily entry.

## Recommended First Slice

Build the smallest slice that proves the new product thesis:

1. Add minimal `business_lines` shell plus compatibility adapter for existing
   project/routine tasks.
2. Add Business Line workspace with Overview, Records, Next Actions, and
   Learning.
3. Reframe Brief as Today / Current Suggestions and bind each suggestion to a
   `business_line_id`.
4. Move Tasks out of top-level navigation and expose child/open work as business
   line Next Actions.
5. Add structured post-action review that can create a record and propose a
   business-line skill/SOP revision.
6. Add one dogfood Web Product / Software Product template plus Custom.

This slice demonstrates the product shift without requiring a large schema
migration or a premature automation system.

Follow-up interaction slice:

1. Add Chat as a first-class Work route.
2. Add focus chat.
3. Add compact/focus sidebar states.

# Context Clear And New Conversation Decision

Date: 2026-05-11

This note records the product decision from the first manual alpha discussion
around the right-panel conversation model.

Related follow-up notes:

- [TASK_FILES_AND_AGENT_MEMORY_DESIGN.md](TASK_FILES_AND_AGENT_MEMORY_DESIGN.md)
  defines the task-file and Agent-memory surface that should receive durable
  handoffs created by context clearing.
- [NAVIGATION_AND_TASKS_VIEW_REFINEMENT_DECISION.md](NAVIGATION_AND_TASKS_VIEW_REFINEMENT_DECISION.md)
  defines the broader Tasks workspace where task management, task files, and
  object-driven task/file views are planned to converge.

## Problem

The current right panel can suggest a fresh session after a task conversation
gets long, repetitive, or generic. In manual testing, this exposed a product
ambiguity:

- a new panel/window appeared to remember the task and broad topic;
- it did not clearly preserve the exact technical progress, such as reaching
  Playwright as a candidate for dynamic news-page scraping;
- the `x` on the task context chip was unclear and looked like closing or
  clearing work, while it actually removes the current task binding from the
  panel.

The core problem is not whether Taskplane should open a new window. The core
problem is deciding whether the current conversation context can be safely
cleared.

## Decision

Separate two concepts:

1. Automatic context clearing keeps the current task conversation continuous.
2. User-initiated new conversation starts a new free conversation space.

These should not share the same product meaning.

## Automatic Context Clearing

Automatic clearing is an internal context-management mechanism for the same
task conversation. It should not feel like the user is starting over.

Recommended behavior:

- start checking after the default threshold, currently around 5 user turns;
- after that, check after each user turn whether the current conversation is
  ready to clear;
- before clearing, extract and persist a handoff record with confirmed
  conclusions, candidate options, rejected options with reasons, unresolved
  questions, next actions, and user preferences or constraints;
- persist that handoff into the selected task's durable memory surface, such as
  `Task Records/`, once the task-file model exists;
- clear only when the handoff is specific enough to resume the same work;
- if the handoff is too generic, keep the current context and optionally ask
  the user to confirm or add missing details.

For example, a safe handoff for the news-push task should preserve that
Playwright has been discussed as a candidate for dynamic webpage scraping, and
that RSS, API, BeautifulSoup, Scrapy, and Playwright still need boundary
comparison.

## Manual Mode

Manual mode is a user-controlled cleanup path. It may use the same handoff
record shape, but the user explicitly starts it.

Recommended behavior:

- offer a context strategy control above the chat input;
- include at least automatic clearing, manual confirmation before clearing, and
  reminder-only modes;
- when the user asks to clear manually, first organize and archive the current
  conversation;
- show the archive summary or a compact safety result before clearing;
- allow the user to add missing facts before clearing.

## New Conversation

A user-initiated new conversation is not a continuation of the old
conversation. It is a deliberate new workspace for free discussion.

Recommended behavior:

- the button should mean "start a new conversation", not "continue the old
  conversation";
- if the current conversation has unarchived useful information, archive it
  before clearing the panel;
- the new conversation should start globally or unbound, unless the user
  explicitly chooses a task;
- the assistant may later suggest binding to an existing task, retrieving prior
  task memory, or creating a new task based on what the user says;
- the first assistant message should not pretend to continue the previous
  conversation.

## Task Context Chip

The current task context chip `x` should not carry the product burden of new
conversation or context clearing.

Recommended behavior:

- rename or tooltip it as "leave task context" if it remains;
- consider moving it into a small context menu;
- provide a clearer primary action for "new conversation";
- keep "bind/switch task context" as a separate action from "new conversation".

## Acceptance Notes

- Automatic context clearing must not clear if the extracted handoff is generic.
- Manual clearing must archive before clearing.
- New conversation must not default to continuing the old conversation.
- Task binding and context clearing must be visually and behaviorally distinct.
- A Playwright-style technical discussion should not be reduced to "continue
  discussing scraping technology" if concrete candidates and next steps exist.

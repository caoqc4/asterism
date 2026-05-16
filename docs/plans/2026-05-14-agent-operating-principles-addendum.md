# Agent Operating Principles Addendum

Date: 2026-05-14

## Purpose

This addendum supplements `Taskplane Agent Operating Principles` without changing the original document.

The original principles remain the read-only baseline for Agent execution behavior. This addendum clarifies their intended scope and identifies the lifecycle stages that should be covered by separate runtime design.

## Scope Clarification

The Agent Operating Principles primarily cover Agent behavior around task execution:

- what the Agent should inspect before acting;
- where new information should be routed;
- when Decisions and checkpoints are required;
- how task memory should be updated;
- how verification, closeout, handoff, and context clearing should work;
- what Agents and subagents must not decide on their own.

They are not a complete product runtime specification.

The following concerns exceed the Agent principles and should be governed by runtime lifecycle design:

- task intake, capture, draft, and confirmation UX;
- Brief vs Tasks vs Decisions vs Right Panel responsibilities;
- selected task, active panel task, selected file, and prompt-context synchronization;
- priority and attention projections;
- project directory and hierarchy data authority;
- task-dynamics projection and audit UX;
- capability availability, connector state, model settings, and external-access policy;
- product-level pause, resume, retry, and state recovery.

## Recommended Relationship

Use the documents as a layered system:

1. Agent Operating Principles:
   The behavior contract for Agents during task creation, execution, memory updates, verification, handoff, and closeout.

2. Agent Principles Compliance Matrix:
   A mapping from each principle section to implemented runtime behavior, gaps, and tests.

3. Runtime Lifecycle Coverage:
   A broader product-runtime map that covers UI state, data state, execution state, capability state, and task lifecycle behavior beyond Agent execution.

## Additive Guidance

Future changes should avoid expanding the original Agent document into an all-purpose product spec.

First-principles and simplicity guidance belongs in the Agent document because it constrains Agent behavior across all stages:

- identify the real object, user-visible outcome, authoritative data source, and smallest durable state change before acting;
- prefer explicit structured state over title patterns, chat implication, or inferred workflow phases;
- avoid creating extra tasks, files, records, statuses, queues, prompts, agents, or confirmation steps unless they remove real ambiguity, reduce repeated user effort, or protect against meaningful risk;
- when uncertain, keep the system reversible and inspectable through proposals, trade-off explanation, or user confirmation instead of silent structural mutation.

Runtime entrypoint gate guidance also belongs in the Agent document as an execution constraint, while the detailed implementation lives in runtime lifecycle coverage:

- any retained entrypoint must first be classified by the durable object or execution boundary it can affect;
- the entrypoint should attach the smallest applicable shared gate before mutation or execution;
- UI-only read, filter, selection, and display paths do not need gates unless they change durable state, execution state, task context, or decision state;
- service/domain boundaries still need defensive gates even when a UI caller already checked the action;
- every retained mutating, executing, context-clearing, checkpoint-resuming, or decision-changing entrypoint must be registered in `RuntimeEntrypointCoverage`;
- provider-visible planning entrypoints that only produce drafts should use the planning baseline rather than masquerading as full execution, and any durable follow-up creation must remain a separate gated mutation;
- `RuntimeEntrypointCoverage` remains a regression registry, not dynamic discovery.

When a new rule is about Agent behavior, add it through a clearly versioned addendum or a future version of the Agent principles.

When a new rule is about product runtime behavior, add it to runtime lifecycle design and coverage instead.

This keeps the Agent contract focused while allowing runtime deepening to cover the full product.

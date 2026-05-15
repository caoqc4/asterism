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
- activity timeline projection and audit UX;
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

When a new rule is about Agent behavior, add it through a clearly versioned addendum or a future version of the Agent principles.

When a new rule is about product runtime behavior, add it to runtime lifecycle design and coverage instead.

This keeps the Agent contract focused while allowing runtime deepening to cover the full product.

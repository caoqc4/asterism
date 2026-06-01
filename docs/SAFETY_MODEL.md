# Safety Model

asterism's default safety posture is local-first, explicit, and reviewable.

## Default Boundaries

- Renderer code does not directly access SQLite.
- Renderer code does not directly access the OS keychain.
- Renderer code does not directly call AI providers.
- Workspace reads and writes require explicit main-process policy.
- Higher-risk agent capabilities are opt-in and visible to the user.

## Provider Calls

Provider-backed execution requires local configuration and an explicit user
action. Tests and preflights should prefer no-credit, no-provider paths unless a
live validation is intentionally being run.

## Workspace Access

Read-only workspace context is opt-in. Workspace mutation is more restricted
and should remain review-first, decision-gated, and auditable.

## Docker and Sandbox Work

Docker-backed checks and sandboxed coding flows are not part of ordinary UI
startup. They should be gated by explicit local configuration, user action, and
targeted validation commands.

## Browser Automation

Browser/Playwright-style functionality should remain scoped to local QA or
clearly bounded evidence capture unless a broader browser capability has a
separate accepted design and review path.

## Release Actions

Normal verification must not sign, notarize, upload artifacts, or contact Apple
services. Release preflight commands are read-only unless a dedicated release
command explicitly states otherwise.

## Review Principle

When a capability can mutate local data, spend provider credit, run code, launch
containers, or interact with external systems, it should have:

- clear user intent;
- bounded scope;
- visible evidence;
- a safe failure path;
- tests or smoke checks that prove the boundary.

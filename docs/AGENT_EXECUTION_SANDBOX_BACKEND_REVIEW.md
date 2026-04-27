# Agent Execution Sandbox Backend Review

## Status

Accepted as the review gate before connecting the first real sandboxed coding
producer runner.

This document does not approve a user-visible code-agent mode, arbitrary shell,
browser/computer control, MCP tools, Skills execution, external publishing, or
credential passthrough.

Read first:

- [AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md](AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md)
- [AGENT_EXECUTION_SANDBOX_DECISION.md](AGENT_EXECUTION_SANDBOX_DECISION.md)
- [AGENT_EXECUTION_SANDBOXED_CODING_PRODUCER_DESIGN.md](AGENT_EXECUTION_SANDBOXED_CODING_PRODUCER_DESIGN.md)

## First-Principles Decision

A coding agent is useful only when it can observe a workspace, change files, run
feedback checks, and return a patch. Each of those powers is also a way to
damage local work, leak credentials, or create unreviewed side effects.

Therefore the first real backend must optimize for controlled patch production,
not maximum tool power:

1. The selected workspace is mounted read-only.
2. All writes go to a staging area.
3. The runtime receives no ambient host environment and no credentials.
4. Network starts disabled.
5. Commands are structured `test` / `lint` checks, not arbitrary shell.
6. The output is a bounded patch source plus evidence.
7. Promotion remains a Decision checkpoint outside the producer.

## Reference Lessons

Pi is the inner-loop reference: small session, policy-gated tool proposal,
execution, observation, and terminal state. Taskplane should borrow that loop
shape, but not expose broad Read/Write/Edit/Bash powers directly to the host.

OpenClaw is the embedding reference: product code prepares session policy,
workspace scope, metadata, and event bridging around a lower-level coding
runtime. Taskplane should keep that wrapper ownership in `RunService`,
`RunOrchestrator`, and the producer preflight service.

OpenHands is the sandbox-provider reference: code execution belongs behind a
runtime boundary. Taskplane should connect either a local container backend or a
remote isolated backend; it should not treat the Electron main process as the
execution environment.

SWE-agent and Plandex reinforce the same product conclusion: the agent-computer
interface should be task-specific and review-oriented. The producer should emit
staged diffs and check evidence, not directly apply changes.

## Backend Options

| Option | Decision | Why |
| --- | --- | --- |
| Local container | First acceptable backend | Matches the current readiness gate, supports read-only workspace and writable staging mounts, can run bounded checks locally, and keeps credentials out by default. |
| Remote sandbox | Acceptable later | Good for stronger isolation and cross-machine reliability, but needs lifecycle, cost, upload, and privacy decisions before it becomes the default. |
| Host process | Rejected | Violates the core invariant: the producer would inherit local filesystem, shell, and environment authority. |
| Provider-native code interpreter | Deferred | Useful for some artifact tasks, but it does not naturally operate on the selected local workspace and cannot replace staged patch review. |

## Required Runtime Contract

The real runner may start only from a validated launch envelope:

- `status=ready`
- backend kind and required runner family match
- run id, task id, source id, session id, and workspace root are present
- provider/model policy exposes only `sandboxed_coding_producer`
- network is `disabled`
- credential passthrough is forbidden
- host process and host environment inheritance are forbidden
- workspace input is read-only
- output writes are staged
- promotion is `decision_required`
- checks are limited to allowlisted `test` / `lint`

If any item fails, the preflight stays blocked and may persist a bounded
diagnostic session. It must not create a runner.

## Implementation State

The local-container runner is connected only behind the accepted chain:

```text
request validation
  -> backend probe/readiness
  -> connection gate
  -> connection plan
  -> launch envelope validation
  -> backend preflight service
  -> explicit runner construction
```

The runner is injected and testable in the same style as the existing
local-container command runner. Docker remains a runtime dependency detected by
preflight, not a requirement for the normal test suite. Targeted checks run
against a container-internal merged work tree: the selected workspace and
staging root are mounted read-only, staged files are overlaid inside the
container workdir, and only allowlisted `test` / `lint` scripts can run.

## Acceptance

- blocked Docker/backend state persists bounded diagnostics when a run id exists
- ready preflight returns a launch envelope and creates no runner
- launch envelope validation fails closed if isolation, credential, network,
  runner-family, or command-policy invariants are weakened
- normal `npm run verify` does not require Docker
- live Docker smoke remains manual through `npm run
  accept:sandbox-coding:backend-preflight`

## Next Review

Do not broaden sandbox backend authority next. The next producer-context review
should decide how non-file context becomes provider-visible: retrieval snippets,
Taskplane source/artifact content, Skills/MCP observations, and browser
evidence all need explicit selection and connector-specific policy before they
enter a model-backed producer prompt.

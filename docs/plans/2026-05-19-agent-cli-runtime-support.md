# Agent CLI Runtime Support

## Decision

Taskplane should prioritize a thin Agent CLI runtime layer before continuing to deepen the self-built API-agent runtime as the primary execution path.

The current self-built API-agent work remains valuable, but its strongest parts are task memory, runtime gates, context assembly, provider safety, Decisions, and auditability. Rebuilding the full coding-agent execution layer would duplicate mature tools such as Codex CLI, Claude Code, Cursor Agent, Gemini CLI, OpenCode, and Kiro CLI.

The next stage should therefore make Taskplane able to call a user-installed, user-authenticated official Agent CLI in the background, starting with Codex CLI.

## Current Self-Built API-Agent Status

Current estimated maturity: 55-65%.

Strong areas:

- task memory and runtime context assembly;
- runtime pre-step gates;
- capability registry and safety report;
- provider-native tool exposure gating;
- Decision/checkpoint confirmation boundaries;
- run steps, artifacts, and replay foundations.

Incomplete areas:

- mature long-running coding-agent loop;
- robust code-edit execution and recovery;
- broad external tool ecosystem;
- production-grade command/session lifecycle;
- agent CLI account login support;
- user-facing runtime observability comparable to dedicated agent tools.

This means Taskplane can already decide whether work is safe and well-contextualized, but should not yet rely on the self-built API-agent path as the only route for real coding-agent execution.

## Product Positioning

Taskplane should not directly manage ChatGPT browser sessions or simulate account login.

Instead:

- users install and authenticate official CLIs themselves, for example `codex --login`;
- Taskplane detects CLI availability and readiness;
- Taskplane launches the CLI as a local subprocess only after explicit user action;
- Taskplane captures logs, outputs, artifacts, and changed-file evidence;
- Taskplane writes results back through Run steps, task memory, Decisions, and existing confirmation boundaries.

This keeps official account auth inside the official CLI while allowing Taskplane to provide task memory, judgment, and execution governance.

## Reference Model

Multica's useful pattern is:

```text
Product UI / task system
-> local daemon/runtime registry
-> user-installed AI coding CLI
-> result/log/status written back to task system
```

Taskplane should adapt the pattern locally, without adopting the full remote worker or team queue model yet:

```text
Taskplane app
-> local Agent CLI adapter
-> Codex CLI or another installed coding-agent CLI
-> Run steps / artifacts / Decisions / task memory
```

## MVP Scope

First supported CLI: Codex CLI.

MVP capabilities:

- detect whether `codex` is installed;
- read `codex --version` when available;
- expose a clear login hint when execution fails due to missing auth, such as `codex --login`;
- run one explicit, user-triggered background task;
- restrict working directory to the configured workspace root;
- pass a Taskplane-generated prompt/context bundle to the CLI;
- capture stdout, stderr, exit code, start/end time, and timeout;
- persist output as Run steps and artifacts;
- keep all writes and risky outcomes behind existing runtime/Decision gates.

Out of scope for the first pass:

- cloud runtimes;
- remote workers;
- multi-machine runtime pools;
- automatic assignment or scheduler-triggered CLI runs;
- direct ChatGPT web-session usage;
- automatic commit/push/release;
- broad multi-CLI abstraction before Codex CLI proves the path.

## Capability Model

Add a new capability family later:

```text
agent_cli_runtime
```

Suggested status shape:

```ts
type AgentCliRuntimeStatus = {
  catalogueCount: number;
  detectedCount: number;
  readyCount: number;
  runningCount: number;
  errorCount: number;
  runtimes: Array<{
    id: string;
    cli: 'codex' | 'claude' | 'cursor' | 'gemini' | 'opencode' | 'kiro';
    label: string;
    command: string;
    installed: boolean;
    version: string | null;
    authState: 'unknown' | 'ready' | 'needs_login' | 'error';
    workload: 'idle' | 'running' | 'blocked';
    modelVisible: false;
    executable: boolean;
    requiresApproval: true;
    missingReason: string | null;
  }>;
};
```

Important boundary:

```text
installed/authenticated/ready does not mean model-visible or auto-executable.
```

The CLI runtime is an execution backend, not a provider-native tool automatically exposed to the model.

## Runtime Path

Manual run flow:

```text
User starts agent CLI run
-> Taskplane evaluates runtime action
-> Task memory coverage and context assembly checks run
-> Taskplane builds a prompt/context bundle
-> Codex CLI subprocess starts in workspace root
-> stdout/stderr stream into Run steps
-> result is summarized into artifact/task memory
-> patches or risky writes require Decision/checkpoint review
```

The adapter should reuse existing concepts:

- RuntimeActionEvaluation;
- RuntimeVerification;
- RuntimeContextManifest;
- TaskMemoryCoverageEvaluation;
- Run steps;
- artifacts;
- Decision checkpoints;
- CapabilityRegistry;
- ConfigurationSafetyReport.

## Implementation Order

1. Agent CLI catalogue and read-only status service.
2. Codex CLI detector.
3. CapabilityRegistry and ConfigurationSafetyReport projection.
4. Manual Codex CLI run adapter with stdout/stderr capture.
5. Run step/artifact persistence.
6. Runtime gate and task memory integration.
7. Cancellation/timeout handling.
8. Later: Claude Code and other CLI adapters.

## Acceptance Criteria

- A user can authenticate Codex CLI through the official CLI flow outside Taskplane.
- Taskplane can detect the CLI and show a safe readiness state.
- A user can explicitly run a Taskplane task through Codex CLI.
- Taskplane stores logs and outputs in the run timeline.
- Taskplane does not store ChatGPT browser sessions.
- Taskplane does not auto-run, auto-commit, or auto-push.
- CLI execution cannot bypass existing runtime gates or task memory checks.

## Strategic Summary

Taskplane should become the task-memory, context, judgment, and runtime-governance layer around mature coding agents.

The self-built API-agent runtime remains useful for lightweight local tools and future non-coding workflows, but the next product milestone should be Agent CLI support, starting with Codex CLI.

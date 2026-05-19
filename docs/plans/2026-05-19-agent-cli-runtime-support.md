# Agent CLI Runtime Support

## Decision

Taskplane should prioritize a thin Agent CLI runtime layer before continuing to deepen the self-built API-agent runtime as the primary execution path.

The current self-built API-agent work remains valuable, but its strongest parts are task memory, runtime gates, context assembly, provider safety, Decisions, and auditability. Rebuilding the full coding-agent execution layer would duplicate mature tools such as Codex CLI, Claude Code, Cursor Agent, Gemini CLI, OpenCode, and Kiro CLI.

The next stage should therefore make Taskplane able to call a user-installed, user-authenticated official Agent CLI in the background, starting with Codex CLI and Claude Code.

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

- users install and authenticate official CLIs themselves, for example `codex login`;
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

First supported CLIs: Codex CLI and Claude Code.

MVP capabilities:

- detect whether `codex` is installed;
- read `codex --version` when available;
- expose a clear login hint when execution fails due to missing auth, such as `codex login`;
- run one explicit, user-triggered background task;
- restrict working directory to the configured workspace root;
- pass a Taskplane-generated prompt/context bundle to the CLI;
- capture stdout, stderr, exit code, start/end time, and timeout;
- return the Run record immediately after the gated run is accepted;
- project active CLI subprocesses back into runtime workload status;
- accept operator-confirmed cancellation for active CLI subprocesses;
- persist output as Run steps and artifacts;
- keep all writes and risky outcomes behind existing runtime/Decision gates.

Out of scope for the first pass:

- cloud runtimes;
- remote workers;
- multi-machine runtime pools;
- automatic assignment or scheduler-triggered CLI runs;
- direct ChatGPT web-session usage;
- automatic commit/push/release;
- broad multi-CLI abstraction before Codex CLI and Claude Code prove the path.
- enabling any CLI execution before its official non-interactive, read-only invocation contract is verified.

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
  readyManualRunCount: number;
  runningCount: number;
  errorCount: number;
  runtimes: Array<{
    id: string;
    cli: 'codex' | 'claude' | 'cursor' | 'gemini' | 'opencode' | 'kiro';
    label: string;
    command: string;
    executablePath: string | null;
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

`command` is the user-facing command name. `executablePath` is the resolved
path from the user's shell environment and should be preferred by the execution
adapter when present. This avoids a packaged Electron process detecting a CLI
through a login shell and then failing to spawn it through a narrower app PATH.

Important boundary:

```text
installed/authenticated/ready does not mean model-visible or auto-executable.
```

The CLI runtime is an execution backend, not a provider-native tool automatically exposed to the model.

Capability Registry and ConfigurationSafetyReport must use `readyManualRunCount`, not only `readyCount` or `manualRunCount`, when deciding whether an Agent CLI execution backend is configured. A status-only future CLI login must not make the Agent CLI capability available if no authenticated manual-run runtime is ready.

## Runtime Path

Manual run flow:

```text
User starts agent CLI run
-> Taskplane evaluates runtime action
-> Task memory coverage and context assembly checks run
-> Taskplane builds a prompt/context bundle
-> Taskplane creates a running Run and returns its id to the UI
-> selected Agent CLI subprocess starts in workspace root in the background
-> stdout/stderr are captured into terminal Run steps
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

## Adapter Boundary

The first implementation keeps each executable Agent CLI behind an explicit runtime adapter boundary:

- each executable CLI must provide its own command args, command preview, prompt builder, and terminal step labels;
- the shared run service owns Taskplane gates, task memory checks, context assembly, workload tracking, cancellation, and terminal persistence;
- a detected runtime is not executable unless a run adapter is registered and the runtime reports `executionSupport: 'manual_run'`;
- an executable runtime must also report `authState: 'ready'` before the UI or execution service can launch it;
- Claude Code uses its own read-only planning adapter instead of reusing Codex-specific flags.

This avoids accidentally reusing Codex-specific flags for other CLIs. It also keeps the current product promise narrow: Taskplane can launch official CLIs only as background read-only planning runs, while file edits remain outside the first Agent CLI lane.

## Claude Code Evaluation

Official Claude Code docs currently expose two relevant surfaces:

- status/authentication commands: `claude auth login`, `claude auth status`;
- non-interactive execution: `claude -p` / `claude --print`, with permission modes such as `plan`, `dontAsk`, `acceptEdits`, and `bypassPermissions`.

Taskplane should not enable Claude execution only because `claude -p` exists. Claude Code's scripted mode has its own permission and settings model, including permission modes and tool allow/deny rules. The safe bridge is therefore:

- detect `claude` and `claude --version`;
- check auth readiness with `claude auth status`;
- mark Claude Code as `executionSupport: 'manual_run'` only when the dedicated adapter is present;
- show `claude auth login` as the official login hint;
- launch Claude Code with `claude -p --permission-mode plan --output-format text`;
- pass the Taskplane prompt through stdin and instruct Claude Code to research and propose without editing files or continuing into an editing mode;
- keep Capability Registry unavailable unless at least one ready manual-run runtime is present and a workspace root is configured;
- keep the RightPanel launch control disabled and reject execution requests unless the selected CLI is authenticated and ready;
- show `readyManualRunCount` in AI Runtime status so users can distinguish detected CLIs from executable CLIs;
- provide a manual AI Runtime re-detect action after users complete official CLI login in a terminal;
- persist Claude Code runs through the same run steps, task annotations, verification records, workload tracking, and cancellation flow as Codex runs.

Reference: https://code.claude.com/docs/en/cli-usage and https://code.claude.com/docs/en/headless.

## Implementation Order

1. Agent CLI catalogue and read-only status service.
2. Codex CLI detector.
3. CapabilityRegistry and ConfigurationSafetyReport projection.
4. Manual Codex CLI run adapter with stdout/stderr capture.
5. Async run start with background terminal persistence.
6. Run step/artifact persistence.
7. Runtime gate and task memory integration.
8. Manual read-only Agent CLI smoke, skipped by default unless explicitly enabled.
9. Cancellation/timeout handling.
10. Runtime-specific adapter boundary for command/prompt/step labeling.
11. Claude Code auth-status bridge.
12. Claude Code read-only plan-mode adapter.
13. Later: other CLI adapters after their official read-only/non-interactive command contracts are verified.

## Acceptance Criteria

- A user can authenticate Codex CLI or Claude Code through the official CLI flow outside Taskplane.
- Taskplane can detect the CLI and show a safe readiness state.
- A ready CLI does not count as executable until a workspace root is configured.
- A user can explicitly run a Taskplane task through Codex CLI or Claude Code.
- The UI receives a Run id immediately after the gated run is accepted.
- The UI can request cancellation for the active task-bound CLI run.
- Taskplane stores logs and outputs in the run timeline.
- Task dynamics can replay CLI sandbox mode, output, and failure/cancellation evidence.
- Taskplane does not store ChatGPT browser sessions.
- Taskplane does not auto-run, auto-commit, or auto-push.
- CLI execution cannot bypass existing runtime gates or task memory checks.
- Active CLI subprocesses can be cancelled without leaving runtime workload status stuck.
- A status-only future CLI cannot be launched until a dedicated run adapter is enabled.
- Claude Code readiness uses the official `claude auth status` command and points users to `claude auth login`.
- Claude Code execution uses official non-interactive print mode with `--permission-mode plan`.
- Agent CLI launch controls and execution services require a ready manual-run runtime, not merely an installed CLI.
- The real Agent CLI smoke is opt-in only:
  `TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE=true npm run manual:agent-cli-readonly-smoke`.
- The smoke defaults to Codex CLI. Claude Code can be checked explicitly with:
  `TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE=true TASKPLANE_AGENT_CLI_SMOKE_RUNTIME=claude npm run manual:agent-cli-readonly-smoke`.
- Default local acceptance and tests must not call Agent CLIs or model providers.

## Strategic Summary

Taskplane should become the task-memory, context, judgment, and runtime-governance layer around mature coding agents.

The self-built API-agent runtime remains useful for lightweight local tools and future non-coding workflows, but the next product milestone should be Agent CLI support, starting with Codex CLI and Claude Code.

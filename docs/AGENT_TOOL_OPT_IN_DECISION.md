# Agent Tool Opt-In Decision

## Status

Accepted and implemented for the first domain-tool exposure slice.

The registry already contains domain tools, read-only workspace tools,
confirmation-gated patching, and confirmation-gated package-script commands.
This decision chooses which of those capabilities can become visible to normal
agent runs first.

## Decision

The first user-facing tool opt-in should expose **domain-shaped task tools**,
not workspace write or command tools.

Recommended first opt-in:

- `task.update_next_step`
- `task.create_completion_criterion`
- `source_context.create`
- `decision.draft`

These tools remain disabled by default and require the explicit per-run
`allowTaskMutationTools=true` option. The Tasks and Runs trigger forms present
this separately from read-only workspace context.

Workspace mutation tools stay registry-only for now:

- `workspace.write_patch`
- `workspace.run_command`

They can continue to be exercised through acceptance commands and Decision
checkpoint resumption, but they should not be prompt-exposed or selectable in
normal user-triggered agent runs yet.

## Why

Domain tools improve the Taskplane control loop without touching the user's
filesystem or running local code. They route through existing domain services,
write task timeline evidence, and already have real SQLite acceptance coverage.

Workspace write and command tools carry a different risk profile. Even with
confirmation checkpoints, they can mutate a working tree or run code on the
machine. Their first product exposure should wait until the UI can explain
diffs, command output, and non-resumable outcomes more clearly.

## Policy Model

Add a new policy flag rather than reusing workspace permissions:

```ts
type AgentPolicy = {
  allowLocalWorkspaceRead: boolean;
  allowTaskMutationTools: boolean;
  allowLocalFileWrite: boolean;
  allowLocalCommandRun: boolean;
  confirmationRequiredRisks: AgentToolRisk[];
};
```

Defaults:

- `allowTaskMutationTools=false`
- `allowLocalWorkspaceRead=false`
- `allowLocalFileWrite=false`
- `allowLocalCommandRun=false`

When `allowTaskMutationTools=true`, the prompt may mention the domain tools and
the run loop may accept model-proposed steps for the allowed subset.

## First Exposure Rules

- Keep read-only observation before mutation.
- Allow at most one domain mutation per first exposed run.
- Keep `decision.draft` draft-only; it must not create a formal Decision.
- Do not expose `task.satisfy_completion_criterion` yet because it can move a
  task closer to closeout and deserves stronger completion evidence handling.
- Do not expose workspace write or command tools in the same slice.
- Keep all accepted tool calls visible in run steps and task timeline evidence.

## UI Copy

The run form should describe this as task updates, not automation:

```text
允许 Agent 建议并写入任务内更新
```

Supporting copy:

```text
可更新下一步、添加完成标准、补充来源上下文或草拟 Decision。不会修改工作区文件或运行命令。
```

Capability preview should distinguish:

- read-only workspace context
- task update tools
- workspace patch/command tools

## Testing Requirements

Accepted implementation coverage:

- run-loop tests prove domain mutation tools are accepted only when
  `allowTaskMutationTools=true`
- prompt tests prove domain tools are mentioned only with the opt-in
- renderer tests prove the run form separates read-only workspace context from
  task update tools and workspace write/command tools
- existing integration and service tests prove the allowed tools still route
  through domain services and write run-step observations
- full local verification passes without GitHub Actions

## Non-Goals

- no workspace write prompt exposure
- no command prompt exposure
- no browser/computer/social tools
- no automatic task closeout
- no background autonomous scheduling

## Open Questions

- Should the first UI expose all four domain tools together, or begin with only
  `decision.draft` and `source_context.create`?
- Should an agent-created completion criterion require a follow-up Decision when
  the task is high risk?

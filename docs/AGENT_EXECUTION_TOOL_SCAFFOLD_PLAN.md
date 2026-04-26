# Agent Execution Tool Scaffold Plan

## Status

Planning baseline for the shared tool scaffold above Taskplane's agent
execution layer.

Initial shared TypeScript contracts now exist in
`src/shared/agent-tool-scaffold.ts`. They reserve descriptor, family, session,
artifact, checkpoint, credential, lifecycle, and default-exposure concepts for
current and future tool lanes without exposing new tools to prompts, provider
schemas, or runtime execution.

The same shared module now also reserves default execution policy, tool session
records, tool artifact descriptors, and checkpoint descriptors. These remain
metadata contracts only; no sandbox, browser, MCP, skill, computer-use, or
creator connector runtime is enabled by them.

It also validates execution-policy envelopes against the selected descriptor's
session, network, credential, timeout, and output boundaries. This keeps future
lane-specific code from treating a hand-built policy as trusted runtime
permission.

Family-level scaffold summaries can now report, without enabling a lane, which
descriptors are implemented versus reserved, which are exposed to text prompts
or provider-native schemas under the current policy, and which require
checkpoints or credentials.

Read with:

- [AGENT_EXECUTION_LAYER_ROADMAP.md](AGENT_EXECUTION_LAYER_ROADMAP.md)
- [AGENT_EXECUTION_SANDBOX_DECISION.md](AGENT_EXECUTION_SANDBOX_DECISION.md)
- [AGENT_EXECUTION_FUTURE_DESIGN.md](AGENT_EXECUTION_FUTURE_DESIGN.md)
- [AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md](AGENT_EXECUTION_REFERENCE_ARCHITECTURE_ASSESSMENT.md)

## First-Principles Position

MCP, browser automation, Playwright, skills, computer-use, workspace tools,
and future connectors are not one-off feature ideas. They are the scaffold that
lets an agent do useful work across domains.

Taskplane's target scenarios start with AI programming and creator /
self-media workflows, but the same scaffold must later support other task
types. The safe architecture is therefore:

```text
Task intent
  -> Run / AgentSession
  -> Tool Scaffold
  -> Registry descriptor
  -> Exposure matrix
  -> Policy gate
  -> Sandbox or connector boundary
  -> Artifact / Checkpoint / Decision / Timeline evidence
```

No scaffold capability should bypass `Task`, `Run`, `Decision`, `Artifact`,
or `Timeline`. Tool availability, model exposure, runtime permission, and
credential access must remain separate.

## Capability Families

### Workspace And Coding

Purpose: AI programming, repository maintenance, local project work.

Examples:

- workspace search/read
- staged patch generation
- targeted `test` / `lint` checks
- sandboxed edit actions
- patch/log/risk artifacts

Boundary:

- start through `SandboxProvider`
- no host arbitrary shell
- no file promotion without Decision review

### Browser And Playwright

Purpose: web inspection, QA, data gathering, creator research, form-free
browser tasks, and future browser-based workflows.

Examples:

- open a URL in an isolated browser context
- inspect page text, DOM, network, screenshots
- run Playwright-style scripted checks
- capture evidence artifacts

Boundary:

- browser sessions are sandboxed tool sessions, not ambient desktop control
- no credential-bearing browser profile by default
- no posting, purchasing, messaging, or irreversible action without a
  connector-specific Decision
- screenshots, traces, and extracted observations become artifacts

### MCP And External Tool Servers

Purpose: standardize external tools/resources/prompts.

Examples:

- local MCP resources
- repository or docs servers
- SaaS/tool connectors
- future team or content systems

Boundary:

- discovery does not imply trust
- every discovered tool needs a Taskplane registry descriptor
- every descriptor needs exposure rules and runtime policy
- credential-bearing MCP servers require explicit configuration and Decisions

### Skills And Process Templates

Purpose: reusable procedures, task recipes, creator workflows, coding
playbooks, and domain-specific instructions.

Examples:

- code review skill
- release checklist skill
- social post drafting skill
- video script workflow
- reusable process templates already modeled in Taskplane

Boundary:

- skills can shape prompts and tool plans, but cannot grant new tool authority
- skill execution must still route through the registry and policy gates
- user-created or imported skills need provenance and versioning before
  automatic use

### Computer-Use And Desktop Automation

Purpose: future local app automation where browser/workspace/MCP are not
enough.

Boundary:

- highest-risk scaffold family
- must stay behind a separate decision
- no ambient desktop control in alpha
- require visible session state, screenshots/artifacts, interruption, and
  explicit approval for irreversible actions

### Creator And Publishing Connectors

Purpose: creator/self-media workflows after artifact review is proven.

Examples:

- draft scripts/posts
- prepare asset lists
- validate claims and links
- schedule or publish through platform APIs later

Boundary:

- artifact drafting comes before external publishing
- no credential-bearing publish/post/send action without connector-specific
  Decisions
- publication output must be reviewable and recoverable from Taskplane objects

## Shared Interfaces To Reserve

These interfaces should be reserved before adding more tool families:

- `ToolDescriptor`: stable id, family, risk tier, schema, artifact behavior,
  credential needs, sandbox/connector requirements
- `ToolExposurePolicy`: prompt visibility, provider-native schema visibility,
  per-run opt-ins, feature flags, user role/config gates
- `ToolExecutionPolicy`: workspace root, sandbox id, network policy,
  credential policy, timeout, output limit, idempotency key
- `ToolSession`: browser session, sandbox session, MCP client session, or
  connector session with lifecycle and cleanup
- `ToolArtifact`: patch, screenshot, trace, browser extract, command log,
  generated draft, connector payload preview
- `ToolCheckpoint`: required approval reason, consequence, preview, resume
  target, policy snapshot

The first implementation does not need every interface fully built, but naming
and data boundaries should avoid baking tools directly into prompts or UI
forms.

## Rollout Order

1. **Scaffold contracts**
   Define shared descriptors, exposure policy, execution policy, session
   metadata, artifact kinds, and checkpoint metadata behind feature flags.
   Initial descriptor/family/session/artifact/checkpoint/credential contracts
   are in place with reserved future lanes hidden by default.
   Execution-policy defaults and checkpoint-required helpers are also in place
   so future lanes can share one conservative metadata shape before runtime
   integration.
   Execution-policy validation now fails closed when a policy targets an
   unknown descriptor, drifts away from the descriptor's session or credential
   boundary, asks local-only tools for network access, or exceeds bounded
   timeout/output limits.
   Family-level summaries also provide a future Settings/preflight fact source
   while keeping reserved lanes hidden.

2. **Sandboxed coding lane**
   Implement `SandboxProvider`, staged patch artifacts, targeted checks, and
   Decision promotion. This validates the highest-value AI programming path.

3. **Browser/Playwright read-only lane**
   Add isolated browser sessions for inspect/screenshot/extract/test evidence.
   Keep mutation/posting/login actions out of scope.
   The accepted planning boundary is
   [AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md](AGENT_EXECUTION_BROWSER_PLAYWRIGHT_READONLY_DECISION.md):
   shared evidence-contract types and tests are in place, and the next slice is
   a no-browser, no-network preflight summary. `browser.readonly_evidence`
   remains reserved and hidden.

4. **Skills/process lane**
   Map Taskplane process templates and imported skills into prompt-shaping
   records that cannot grant tools by themselves.

5. **MCP adapter lane**
   Add MCP discovery behind hidden descriptors, then expose only selected
   safe-read resources/tools through Taskplane policy.

6. **Creator artifact lane**
   Build self-media drafting, script/post artifacts, evidence checks, and
   review Decisions using the same artifact/checkpoint system.

7. **High-risk connector lanes**
   Add publishing, messaging, email/calendar, GitHub mutation, or computer-use
   only after separate connector decisions define credentials, reversibility,
   audit, and approval rules.

## Acceptance

- New tool families cannot bypass `AgentToolRegistry` or successor registry
  adapters.
- Tool discovery never equals model exposure.
- Model exposure never equals runtime permission.
- Runtime permission never includes credentials by default.
- Mutating or irreversible actions create artifacts and/or Decisions before
  promotion.
- Every tool family can be disabled without breaking core task management.
- Local alpha remains usable with only local verification while GitHub Actions
  quota is unavailable.

## Current Decision

Plan for all scaffold families now, but implement them in risk order. The
sandboxed coding patch lane has validated the first staged review loop, so the
next planning target is the Browser/Playwright read-only evidence lane. Shared
contracts are now in place, so the next step is preflight facts only; browser
execution, model exposure, credentials, and posting/mutation remain deferred.

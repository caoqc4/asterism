# Documentation

Public developer documentation for Taskplane.

## Start Here

- [Architecture](ARCHITECTURE.md)
- [Safety model](SAFETY_MODEL.md)
- [Configuration](CONFIGURATION.md)
- [Development](DEVELOPMENT.md)
- [Testing](TESTING.md)
- [Releases](RELEASES.md)

## Runtime Specs

Taskplane specs are layered by load behavior:

- Always-loaded router: [GoalPilot task advancement framework](specs/goalpilot-task-advancement-framework.md)
- Phase-loaded execution rules: [Taskplane Agent Operating Principles](specs/agent-operating-principles.md)
- Phase-loaded rules: [Agent output contract](specs/agent-output-contract.md)
- Phase-loaded memory rules and gates: [Task memory spec](specs/task-memory-spec.md)
- Architecture spec: [Native Agent runtime orchestration](specs/native-agent-runtime-orchestration.md)

GoalPilot decides the movement and indexes the relevant rule set. Do not treat
every spec as mandatory prompt context for every Agent turn.

## Documentation Scope

This directory is intended for information that is useful to outside users,
contributors, and security reviewers.

Raw product notes, manual validation logs, local machine records, and exploratory
design journals are intentionally kept out of the public documentation surface.

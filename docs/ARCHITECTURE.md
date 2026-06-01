# Architecture

asterism is a local-first Electron application with a task-native control
plane.

## Layers

```text
src/main      Electron main process
src/renderer  React renderer
src/shared    shared contracts and pure helpers
```

## Main Process

The main process owns trusted local capabilities:

- SQLite connection and migrations;
- repositories and domain services;
- local scheduler lifecycle;
- AI execution clients;
- OS keychain access;
- filesystem and packaged-runtime paths;
- IPC handlers exposed through preload.

Renderer code should call these capabilities through typed IPC contracts rather
than reaching into local resources directly.

## Renderer

The renderer owns the user interface:

- Home control surface;
- task management views for priority handling, task directory, task detail, task files, and task dynamics;
- right-panel task conversation and runtime handoff UI;
- Decisions judgment inbox and retained Runs/task-dynamics projections;
- Context, Settings, and capability configuration views;
- no separate task workspace entry: task context, files, execution handoff, and AI collaboration are handled by Tasks plus the right panel.

The renderer does not directly access SQLite, keychain secrets, provider APIs,
or shell commands.

## Shared Contracts

`src/shared` contains types and pure helpers used across process boundaries.
Keep cross-boundary payloads explicit and serializable.

## Core Domain Objects

- Task
- Decision
- Run
- Run step
- Run checkpoint
- Artifact
- Source context
- Process template
- Blocker
- Task dependency
- Completion criterion
- Work habit

## Local-First Data Model

asterism stores application data locally. Non-sensitive configuration is stored
in a local config file. Secrets such as provider API keys are stored in the OS
keychain.

The project is designed so important work state belongs to the task rather than
to a transient chat transcript.

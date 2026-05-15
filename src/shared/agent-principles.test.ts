import { describe, expect, it } from 'vitest';

import {
  TASKPLANE_AGENT_PRINCIPLES,
  TASKPLANE_AGENT_PRINCIPLES_ID,
  TASKPLANE_AGENT_PRINCIPLES_TITLE,
} from './agent-principles.js';

describe('Taskplane Agent product principles', () => {
  it('defines a product-owned read-only operating document for Agent work', () => {
    expect(TASKPLANE_AGENT_PRINCIPLES_ID).toBe('taskplane.agent-operating-principles.v1');
    expect(TASKPLANE_AGENT_PRINCIPLES_TITLE).toBe('Taskplane Agent Operating Principles');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Write policy: read-only for Agents and ordinary task execution');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('before creating tasks, executing tasks, updating task memory, clearing context, delegating subagents, or closing work');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## First Principles And Simplicity');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('identify the real object being managed');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Prefer explicit structured state over title patterns');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Do not introduce new categories, folders, statuses, queues, prompts, agents, or confirmation steps unless');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Required Read Order');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Information Routing Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('route it to the smallest durable surface');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Create or update a task file when the information is a work product');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('create a write proposal with path, operation, summary, and content preview');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Propose a Work Habit when the information is a recurring cross-task preference');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Task Creation Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Before creating a task, decide whether the user input should become a task, Task Record, task file, artifact, Decision, Work Habit proposal, or continued discussion.');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('one-off, project, scheduled, event-triggered, or routine');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('assign one primary type and preserve secondary type facets');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Project And Subtask Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Subtasks remain drafts until the user confirms creation.');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Subtask Start Evaluation');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Check context cleanliness before context sufficiency.');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Context cleanliness means the runtime is not contaminated');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Context sufficiency means the target subtask has enough correct task state');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Execution Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Task.md, the primary recovery file');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Task Records Rules');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('context-clear archive');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Do not store full chat transcripts in task files by default.');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Source Materials Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Source materials are first-class task context');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Every recorded source material must preserve a timestamp or captured-at time');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('group source materials by run, date, or execution batch');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Read source materials with a freshness boundary.');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Use older source materials mainly for audit, comparison, trend, recovery, or user verification');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Do not require a default outputs folder.');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Do not silently create or overwrite task working files from a normal conversation.');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Verification Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Use step-level verification');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Use task-level verification');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Use project-level verification');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Task-Level Closeout And Next-Task Evaluation');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Next-task evaluation is a post-task-level action, not a separate execution protocol.');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Do not blindly carry task A chat history into task B.');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Subagent Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Subagents must inherit these operating principles');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Manual clearing must archive useful task signals before clearing');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Reminder-only mode should warn about long or repetitive context without clearing automatically.');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Leaving task context, clearing context, and starting a new conversation are separate actions');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Work Habits Boundary');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Do not introduce RAG, embeddings, or summary indexing as the default reading path');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Do not replace user decisions with Agent guesses.');
  });
});

import { describe, expect, it } from 'vitest';

import {
  classifyCreateTaskFileSurface,
  classifyRuntimeActionEvent,
  classifyRuntimeInformationCandidate,
  classifyRuntimeFileSurface,
  classifySourceContextSurface,
  normalizeCreateDecisionInput,
  normalizeCreateManualArtifactInput,
  normalizeCreateSourceContextInput,
  normalizeCreateTaskFileInput,
  normalizeCreateWorkHabitProposalInput,
  routeRuntimeInformation,
} from './runtime-surface-routing.js';

describe('runtime surface routing', () => {
  it('classifies Task.md as task state', () => {
    expect(classifyRuntimeFileSurface({ kind: 'task_record', path: 'Task.md' })).toMatchObject({
      surface: 'task_state',
      fileClass: 'task',
      label: '任务说明',
    });
    expect(classifyRuntimeFileSurface({ kind: 'local_file', path: ' Task.md ' })).toMatchObject({
      surface: 'task_state',
      fileClass: 'task',
    });
  });

  it('classifies Task Records paths as task records', () => {
    expect(classifyRuntimeFileSurface({ kind: 'local_file', path: 'Task Records/phase-closeout.md' })).toMatchObject({
      surface: 'task_record',
      fileClass: 'record',
    });
    expect(classifyRuntimeFileSurface({ kind: 'local_file', path: ' Task Records\\phase-closeout.md ' })).toMatchObject({
      surface: 'task_record',
      fileClass: 'record',
    });
  });

  it('classifies digest source contexts as AI output instead of source material', () => {
    expect(classifyRuntimeFileSurface({ kind: 'source', sourceRole: 'digest', name: 'AI 项目拆解自检.md' })).toMatchObject({
      surface: 'ai_output',
      fileClass: 'ai_output',
    });
  });

  it('does not treat AI output text as source material when source role is inferred', () => {
    expect(normalizeCreateSourceContextInput({
      taskId: 'task_1',
      title: 'AI 项目拆解自检',
      kind: 'note',
      content: 'Note: 5 个子任务；用户已确认创建。',
      note: 'AI 生成的项目拆解自检。',
    })).toMatchObject({
      sourceRole: 'digest',
    });
    expect(classifySourceContextSurface({
      title: 'AI 项目拆解自检',
      note: 'AI 生成的项目拆解自检。',
    })).toBe('ai_output');
  });

  it('classifies raw source contexts as source materials', () => {
    expect(classifyRuntimeFileSurface({ kind: 'source', sourceRole: 'raw', name: '访谈记录.md' })).toMatchObject({
      surface: 'source_material',
      fileClass: 'source',
    });
  });

  it('keeps traceable raw source material as source material even when the title asks for approval', () => {
    expect(classifySourceContextSurface({
      title: '客户确认是否上线的邮件',
      note: '来自客户邮箱的原始邮件内容。',
      sourceRole: 'raw',
    })).toBe('source_material');
  });

  it('classifies artifacts separately from task files', () => {
    expect(routeRuntimeInformation({ kind: 'artifact', artifactKind: 'note', name: '测试方案.md' })).toBe('artifact');
  });

  it('does not classify ordinary Artifacts folder files as artifacts by path alone', () => {
    expect(classifyRuntimeFileSurface({ kind: 'local_file', path: 'Artifacts/notes.md' })).toMatchObject({
      surface: 'task_file',
      fileClass: 'file',
    });
  });

  it('keeps ordinary local files as task files', () => {
    expect(classifyRuntimeFileSurface({ kind: 'local_file', path: 'drafts/notes.md' })).toMatchObject({
      surface: 'task_file',
      fileClass: 'file',
    });
  });

  it('routes task-record-like source contexts away from source material', () => {
    expect(classifySourceContextSurface({
      title: '阶段收尾记录',
      note: '任务记录：阶段收尾、质量检查和执行交接。',
    })).toBe('task_record');
  });

  it('does not promote generic source captures to task records without record-worthy wording', () => {
    expect(classifySourceContextSurface({
      title: '客户访谈原文',
      note: '用户提供的一手访谈材料。',
    })).toBe('source_material');
  });

  it('does not let source-context title patterns override explicit source roles', () => {
    expect(classifySourceContextSurface({
      title: '阶段收尾记录',
      note: '用户提供的原始会议记录。',
      sourceRole: 'raw',
    })).toBe('source_material');
    expect(classifySourceContextSurface({
      title: '客户访谈原文',
      note: 'AI digest for later recovery.',
      sourceRole: 'digest',
    })).toBe('ai_output');
  });

  it('defaults AI-generated source contexts to digest role', () => {
    expect(normalizeCreateSourceContextInput({
      taskId: 'task_1',
      title: '产物编辑观察',
      kind: 'note',
      note: '自学习观察：用户编辑了 AI 产物。',
    })).toMatchObject({
      sourceRole: 'digest',
    });
  });

  it('keeps manually added source contexts as raw sources by default', () => {
    expect(normalizeCreateSourceContextInput({
      taskId: 'task_1',
      title: 'PRD',
      kind: 'doc',
      note: 'Primary doc',
    })).toMatchObject({
      sourceRole: 'raw',
    });
  });

  it('normalizes Task Records file creation paths before classification', () => {
    const input = normalizeCreateTaskFileInput({
      taskId: 'task_1',
      name: 'phase-closeout.md',
      path: 'Task Records/phase-closeout.md',
      kind: 'file',
    });

    expect(input).toMatchObject({
      path: 'Task Records/phase-closeout.md',
      content: '',
    });
    expect(classifyCreateTaskFileSurface(input)).toBe('task_record');
  });

  it('keeps reserved Task.md and Task Records paths out of ordinary task-file classification', () => {
    expect(classifyCreateTaskFileSurface({
      taskId: 'task_1',
      name: 'anything.md',
      path: 'Task.md',
      kind: 'file',
      content: '# Task',
    })).toBe('task_state');

    expect(classifyCreateTaskFileSurface({
      taskId: 'task_1',
      name: 'handoff.md',
      path: 'Task Records/handoff.md',
      kind: 'file',
      content: 'handoff',
    })).toBe('task_record');
  });

  it('normalizes folder task files with trailing slash and empty content', () => {
    expect(normalizeCreateTaskFileInput({
      taskId: 'task_1',
      name: 'drafts',
      kind: 'folder',
      content: '# ignored',
    })).toMatchObject({
      path: 'drafts/',
      content: '',
    });
  });

  it('keeps manual artifact creation on the artifact surface', () => {
    const input = normalizeCreateManualArtifactInput({
      taskId: 'task_1',
      title: '  ',
    });

    expect(input).toMatchObject({
      title: 'Untitled artifact',
      content: '',
      kind: 'note',
    });
    expect(routeRuntimeInformation({ kind: 'artifact', artifactKind: input.kind, name: input.title })).toBe('artifact');
  });

  it('routes risky external writes to decisions', () => {
    expect(classifyRuntimeInformationCandidate({
      text: '确认是否把最终报告发送给客户',
      risk: 'external_write',
    })).toMatchObject({
      surface: 'decision',
      shouldPersist: true,
      requiresConfirmation: true,
      decisionKind: 'external_write',
    });
  });

  it('routes completion acceptance to decisions', () => {
    expect(classifyRuntimeInformationCandidate({
      text: '这个任务是否可以验收完成？',
      risk: 'completion',
    })).toMatchObject({
      surface: 'decision',
      decisionKind: 'completion_acceptance',
    });
  });

  it('routes recurring cross-task preferences to work habit candidates', () => {
    expect(classifyRuntimeInformationCandidate({
      text: '以后所有类似任务都先做内部评审再对外发送',
      isCrossTaskPreference: true,
      workHabitScope: 'task_type',
    })).toMatchObject({
      surface: 'work_habit',
      shouldPersist: true,
      requiresConfirmation: true,
      workHabitScope: 'task_type',
    });
  });

  it('routes structured execution events to run steps', () => {
    expect(classifyRuntimeInformationCandidate({
      kind: 'tool_result',
      text: 'pytest completed successfully',
    })).toMatchObject({
      surface: 'run_step',
      shouldPersist: true,
      requiresConfirmation: false,
    });
  });

  it('classifies runtime action events as durable run steps', () => {
    expect(classifyRuntimeActionEvent({
      kind: 'tool_started',
      operation: 'workspace.search',
    })).toMatchObject({
      surface: 'run_step',
      runStepKind: 'tool_call',
      shouldRecordRunStep: true,
      shouldCreateDecision: false,
    });
  });

  it('marks checkpoint runtime actions as run steps that also need decisions', () => {
    expect(classifyRuntimeActionEvent({
      kind: 'checkpoint_created',
      checkpointKind: 'tool_permission',
      operation: 'workspace.write_patch',
      text: '确认是否允许写入本地工作区。',
      risk: 'local_write',
      requiresConfirmation: true,
    })).toMatchObject({
      surface: 'run_step',
      runStepKind: 'checkpoint',
      shouldRecordRunStep: true,
      shouldCreateDecision: true,
      requiresConfirmation: true,
      decisionKind: 'risk_approval',
    });
  });

  it('keeps exploratory discussion out of durable state', () => {
    expect(classifyRuntimeInformationCandidate({
      text: '我们先聊聊这个方向可能怎么做',
      hasActionableChange: false,
    })).toMatchObject({
      surface: 'discussion',
      shouldPersist: false,
    });
  });

  it('normalizes task decisions with manual source defaults', () => {
    expect(normalizeCreateDecisionInput({
      taskId: ' task_1 ',
      title: ' 是否确认上线方案 ',
    })).toMatchObject({
      taskId: 'task_1',
      title: '是否确认上线方案',
      scope: 'task',
      kind: 'direction_choice',
      sourceType: 'manual',
      options: [],
      recommendation: null,
    });
  });

  it('normalizes checkpoint decisions as agent resume decisions', () => {
    expect(normalizeCreateDecisionInput({
      taskId: 'task_1',
      title: '确认恢复本地写入',
      sourceType: 'agent_checkpoint',
      sourceId: ' checkpoint_1 ',
    })).toMatchObject({
      scope: 'task',
      kind: 'agent_resume',
      sourceType: 'agent_checkpoint',
      sourceId: 'checkpoint_1',
    });
  });

  it('normalizes external access decisions when no task is bound', () => {
    expect(normalizeCreateDecisionInput({
      title: 'Approve external connector write access',
      sourceType: 'external_access',
      sourceLabel: ' Gmail connector ',
    })).toMatchObject({
      taskId: null,
      scope: 'external_access',
      kind: 'external_write',
      sourceType: 'external_access',
      sourceLabel: 'Gmail connector',
    });
  });

  it('does not let title-pattern inference override explicit decision fields', () => {
    expect(normalizeCreateDecisionInput({
      title: '是否批准外部写入和验收完成',
      scope: 'task',
      kind: 'direction_choice',
      sourceType: 'manual',
      taskId: 'task_1',
    })).toMatchObject({
      scope: 'task',
      kind: 'direction_choice',
      sourceType: 'manual',
    });
  });

  it('normalizes work habit proposals as pending candidates', () => {
    expect(normalizeCreateWorkHabitProposalInput({
      rule: '以后类似任务先内部评审再对外发送',
      taskTitle: '客户周报',
      scope: 'task_type',
    })).toMatchObject({
      rule: '以后类似任务先内部评审再对外发送',
      scope: 'task_type',
      scopeLabel: '客户周报',
      examples: '客户周报',
    });
  });
});

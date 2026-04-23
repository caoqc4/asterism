import { useEffect, useRef, useState } from 'react';

import type { RecommendedActionIntent } from '@shared/types/brief';
import type { CreateDecisionInput, DecisionDraftRecord, DecisionRecord } from '@shared/types/decision';
import type {
  ApplyProcessTemplateInput,
  AppliedProcessTemplateRecord,
  CreateProcessTemplateInput,
  ProcessTemplateKind,
  ProcessTemplateRecord,
  UpdateProcessTemplateInput,
} from '@shared/types/process-template';
import type { CreateRunInput, RunRecord } from '@shared/types/run';
import type {
  CreateSourceContextInput,
  SourceContextKind,
  SourceContextRecord,
  UpdateSourceContextInput,
} from '@shared/types/source-context';
import type {
  CreateTaskInput,
  TaskDetail,
  TaskListItemRecord,
  TaskRiskLevel,
  TaskState,
  TimelineEventRecord,
  UpdateTaskInput,
} from '@shared/types/task';
import {
  getTaskTimelineFollowUpActionLabel,
  getTaskTimelinePriority,
  getTaskTimelinePriorityLabel,
  interpretTaskTimelineEvent,
} from '@shared/working-context/timeline';

const riskOptions: TaskRiskLevel[] = ['none', 'low', 'medium', 'high'];
const sourceContextKindOptions: SourceContextKind[] = [
  'link',
  'doc',
  'issue',
  'pr',
  'website_list',
  'note',
];
const processTemplateKindOptions: ProcessTemplateKind[] = [
  'skill',
  'workflow',
  'sop',
  'checklist',
];

const transitionOptions: Record<TaskState, TaskState[]> = {
  captured: ['triaged', 'planned', 'archived'],
  triaged: ['planned', 'archived'],
  planned: ['running', 'waiting_external', 'completed', 'archived'],
  running: ['planned', 'waiting_external', 'completed', 'archived'],
  waiting_external: ['planned', 'running', 'completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

const TIMELINE_PREVIEW_COUNT = 5;

function getTaskCardTone(task: TaskListItemRecord): string {
  if (task.riskLevel === 'high') {
    return 'task-card-danger';
  }

  if (task.state === 'waiting_external' || task.waitingReason) {
    return 'task-card-warning';
  }

  if (!task.nextStep && !['completed', 'archived'].includes(task.state)) {
    return 'task-card-muted';
  }

  return '';
}

function buildTaskBadges(task: TaskListItemRecord): string[] {
  const badges: string[] = [];

  if (task.riskLevel !== 'none') {
    badges.push(`risk:${task.riskLevel}`);
  }

  if (task.state === 'waiting_external' || task.waitingReason) {
    badges.push('waiting');
  }

  if (!task.nextStep && !['completed', 'archived'].includes(task.state)) {
    badges.push('next-step?');
  }

  return badges;
}

function safeParsePayload(payload: string | null): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formatSourceContextKind(kind: SourceContextKind): string {
  switch (kind) {
    case 'doc':
      return '文档';
    case 'issue':
      return 'Issue';
    case 'pr':
      return 'PR';
    case 'website_list':
      return '网站列表';
    case 'note':
      return '备注';
    default:
      return '链接';
  }
}

function formatProcessTemplateKind(kind: ProcessTemplateKind): string {
  switch (kind) {
    case 'workflow':
      return '流程';
    case 'sop':
      return 'SOP';
    case 'checklist':
      return '清单';
    default:
      return 'Skill';
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '未填写';
  }

  return String(value);
}

function formatTimelineBadge(type: string): string {
  switch (type) {
    case 'task.created':
      return '创建';
    case 'task.decision_approved':
      return '决策批准';
    case 'task.decision_deferred':
      return '决策延后';
    case 'task.decision_cancelled':
      return '决策取消';
    case 'task.run_failed':
      return '执行失败';
    case 'task.run_completed':
      return '执行完成';
    case 'task.transitioned':
      return '状态';
    case 'task.next_step_changed':
      return '下一步';
    case 'task.waiting_changed':
      return '等待';
    case 'waiting_item.created':
      return '等待项';
    case 'waiting_item.updated':
      return '等待项';
    case 'waiting_item.resolved':
      return '等待项';
    case 'artifact.created':
      return '产物';
    case 'source_context.created':
      return '来源';
    case 'source_context.updated':
      return '来源';
    case 'source_context.archived':
      return '来源';
    case 'process_template.applied':
      return '方法';
    case 'process_template.removed':
      return '方法';
    case 'process_template.selected':
      return '方法';
    case 'process_template.skipped':
      return '方法';
    case 'task.risk_changed':
      return '风险';
    case 'task.updated':
      return '更新';
    default:
      return type;
  }
}

function getTimelineToneClass(type: string): string {
  if (getTaskTimelinePriority(type) === 'p3') {
    return 'timeline-item-muted';
  }

  switch (type) {
    case 'task.decision_cancelled':
    case 'task.run_failed':
    case 'task.risk_changed':
      return 'timeline-item-risk';
    case 'task.decision_approved':
    case 'task.decision_deferred':
      return 'timeline-item-state';
    case 'task.run_completed':
      return 'timeline-item-state';
    case 'task.waiting_changed':
    case 'waiting_item.created':
    case 'waiting_item.updated':
    case 'waiting_item.resolved':
      return 'timeline-item-waiting';
    case 'artifact.created':
      return 'timeline-item-next-step';
    case 'source_context.created':
    case 'source_context.updated':
    case 'source_context.archived':
    case 'process_template.applied':
    case 'process_template.removed':
    case 'process_template.selected':
    case 'process_template.skipped':
      return 'timeline-item-default';
    case 'task.transitioned':
      return 'timeline-item-state';
    case 'task.next_step_changed':
      return 'timeline-item-next-step';
    default:
      return 'timeline-item-default';
  }
}

function formatTimelineSummary(event: TimelineEventRecord): string {
  if (
    event.type === 'task.decision_approved' ||
    event.type === 'task.decision_deferred' ||
    event.type === 'task.decision_cancelled' ||
    event.type === 'task.run_failed' ||
    event.type === 'task.run_completed' ||
    event.type === 'waiting_item.created' ||
    event.type === 'waiting_item.updated' ||
    event.type === 'waiting_item.resolved' ||
    event.type === 'source_context.created' ||
    event.type === 'source_context.updated' ||
    event.type === 'artifact.created' ||
    event.type === 'task.risk_changed' ||
    event.type === 'task.next_step_changed' ||
    event.type === 'task.transitioned'
  ) {
    return interpretTaskTimelineEvent(event).summary;
  }

  const payload = safeParsePayload(event.payload);

  switch (event.type) {
    case 'task.created':
      return `创建任务：${formatValue(payload?.title)}`;
    case 'task.waiting_changed':
      return `等待原因从“${formatValue(payload?.from)}”调整为“${formatValue(payload?.to)}”`;
    case 'source_context.archived':
      return `归档来源材料：${formatValue(payload?.title)}`;
    case 'process_template.applied':
      return `挂载方法模板：${formatValue(payload?.title)} [${formatValue(payload?.kind)}]`;
    case 'process_template.removed':
      return `移除方法模板：${formatValue(payload?.title)} [${formatValue(payload?.kind)}]`;
    case 'process_template.selected': {
      const sourceType = payload?.sourceType === 'decision_draft' ? '决策草拟' : '执行';
      return `本次${sourceType}选择方法模板：${formatValue((payload?.titles as string[] | undefined)?.join('、'))}；原因：${formatValue(payload?.reason)}`;
    }
    case 'process_template.skipped': {
      const sourceType = payload?.sourceType === 'decision_draft' ? '决策草拟' : '执行';
      return `本次${sourceType}未调用方法模板；原因：${formatValue(payload?.reason)}`;
    }
    case 'task.updated':
      return '任务字段已更新';
    default:
      return event.type;
  }
}

function getTimelineActionLabel(type: string): string | null {
  return getTaskTimelineFollowUpActionLabel(type);
}

function getTimelineObjectLabel(event: TimelineEventRecord): string | null {
  return interpretTaskTimelineEvent(event).objectAction.label;
}

type TasksPageProps = {
  decisions: DecisionRecord[];
  focusedTaskRequest: {
    key: string;
    taskId: string;
    intent: RecommendedActionIntent | null;
  } | null;
  runs: RunRecord[];
  tasks: TaskListItemRecord[];
  onApplyProcessTemplate: (input: ApplyProcessTemplateInput) => Promise<AppliedProcessTemplateRecord>;
  onArchiveProcessTemplate: (id: string) => Promise<ProcessTemplateRecord>;
  onCreateDecision: (input: CreateDecisionInput) => Promise<void>;
  onDraftDecision: (taskId: string, note?: string | null) => Promise<DecisionDraftRecord>;
  onCreateProcessTemplate: (input: CreateProcessTemplateInput) => Promise<ProcessTemplateRecord>;
  onCreateSourceContext: (input: CreateSourceContextInput) => Promise<SourceContextRecord>;
  onArchiveSourceContext: (id: string) => Promise<SourceContextRecord>;
  onOpenDecision: (decisionId: string) => void;
  onOpenRun: (runId: string) => void;
  onRefresh: () => Promise<void>;
  onCreateTask: (input: CreateTaskInput) => Promise<void>;
  onRemoveProcessTemplate: (bindingId: string) => Promise<AppliedProcessTemplateRecord>;
  onTriggerRun: (input: CreateRunInput) => Promise<void>;
  onUpdateProcessTemplate: (input: UpdateProcessTemplateInput) => Promise<ProcessTemplateRecord>;
  onUpdateSourceContext: (input: UpdateSourceContextInput) => Promise<SourceContextRecord>;
  onUpdateTask: (input: UpdateTaskInput) => Promise<TaskListItemRecord>;
  onTransitionTask: (
    taskId: string,
    nextState: TaskState,
    waitingReason?: string,
  ) => Promise<TaskListItemRecord>;
  onTaskFocusConsumed: () => void;
};

export function TasksPage({
  decisions,
  focusedTaskRequest,
  runs,
  tasks,
  onApplyProcessTemplate,
  onArchiveProcessTemplate,
  onCreateDecision,
  onDraftDecision,
  onCreateProcessTemplate,
  onCreateSourceContext,
  onArchiveSourceContext,
  onOpenDecision,
  onOpenRun,
  onRefresh,
  onCreateTask,
  onRemoveProcessTemplate,
  onTriggerRun,
  onUpdateProcessTemplate,
  onUpdateSourceContext,
  onUpdateTask,
  onTransitionTask,
  onTaskFocusConsumed,
}: TasksPageProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(tasks[0]?.id ?? null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [draftNextStep, setDraftNextStep] = useState('');
  const [draftWaitingReason, setDraftWaitingReason] = useState('');
  const [draftRiskLevel, setDraftRiskLevel] = useState<TaskRiskLevel>('none');
  const [draftRiskNote, setDraftRiskNote] = useState('');
  const [quickDecisionTitle, setQuickDecisionTitle] = useState('');
  const [quickDecisionNote, setQuickDecisionNote] = useState('');
  const [quickDecisionRationale, setQuickDecisionRationale] = useState<string | null>(null);
  const [quickRunType, setQuickRunType] = useState<CreateRunInput['type']>('draft');
  const [quickRunInstructions, setQuickRunInstructions] = useState('');
  const [transitionWaitingReason, setTransitionWaitingReason] = useState('');
  const [sourceContextEditingId, setSourceContextEditingId] = useState<string | null>(null);
  const [sourceContextTitle, setSourceContextTitle] = useState('');
  const [sourceContextKind, setSourceContextKind] = useState<SourceContextKind>('link');
  const [sourceContextIsKey, setSourceContextIsKey] = useState(false);
  const [sourceContextUri, setSourceContextUri] = useState('');
  const [sourceContextContent, setSourceContextContent] = useState('');
  const [sourceContextNote, setSourceContextNote] = useState('');
  const [sourceContextError, setSourceContextError] = useState<string | null>(null);
  const [processTemplateEditingId, setProcessTemplateEditingId] = useState<string | null>(null);
  const [processTemplateTitle, setProcessTemplateTitle] = useState('');
  const [processTemplateSummary, setProcessTemplateSummary] = useState('');
  const [processTemplateKind, setProcessTemplateKind] = useState<ProcessTemplateKind>('skill');
  const [processTemplateTags, setProcessTemplateTags] = useState('');
  const [processTemplateContent, setProcessTemplateContent] = useState('');
  const [processTemplateError, setProcessTemplateError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const detailFormRef = useRef<HTMLFormElement | null>(null);
  const quickActionsRef = useRef<HTMLDivElement | null>(null);
  const quickDecisionCardRef = useRef<HTMLFormElement | null>(null);
  const quickRunCardRef = useRef<HTMLFormElement | null>(null);
  const transitionCardRef = useRef<HTMLDivElement | null>(null);
  const sourceContextSectionRef = useRef<HTMLDivElement | null>(null);
  const processContextSectionRef = useRef<HTMLDivElement | null>(null);

  function updateDraftRiskLevel(nextRiskLevel: TaskRiskLevel) {
    setDraftRiskLevel(nextRiskLevel);

    if (detailError) {
      setDetailError(null);
    }

    if (
      nextRiskLevel !== 'high' &&
      detail?.riskLevel === 'high' &&
      draftRiskNote === (detail.riskNote ?? '')
    ) {
      setDraftRiskNote('');
    }
  }

  useEffect(() => {
    if (!selectedTaskId && tasks[0]) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    if (!focusedTaskRequest) {
      return;
    }

    const taskExists = tasks.some((task) => task.id === focusedTaskRequest.taskId);

    if (taskExists) {
      setSelectedTaskId(focusedTaskRequest.taskId);
    }
  }, [focusedTaskRequest, tasks]);

  useEffect(() => {
    if (!focusedTaskRequest || !detail || focusedTaskRequest.taskId !== detail.id) {
      return;
    }

    const intent = focusedTaskRequest.intent;

    if (intent?.prefillNextStep !== undefined) {
      setDraftNextStep(intent.prefillNextStep ?? '');
    }

    if (intent?.prefillRunInstructions !== undefined) {
      setQuickRunInstructions(intent.prefillRunInstructions ?? '');
    }

    if (intent?.prefillRiskLevel) {
      setDraftRiskLevel(intent.prefillRiskLevel);
    }

    if (intent?.prefillRiskNote !== undefined) {
      setDraftRiskNote(intent.prefillRiskNote ?? '');
    }

    if (intent?.sourceContextId) {
      const matchedSourceContext = detail.sourceContexts.find(
        (item) => item.id === intent.sourceContextId,
      );

      if (matchedSourceContext) {
        populateSourceContextForm(matchedSourceContext);
      }
    }

    const focusTarget =
      intent?.type === 'focus_source_context'
        ? sourceContextSectionRef.current
        : intent?.focusArea === 'quick-actions'
          ? quickActionsRef.current
          : detailFormRef.current;

    if (typeof focusTarget?.scrollIntoView === 'function') {
      focusTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    onTaskFocusConsumed();
  }, [detail, focusedTaskRequest, onTaskFocusConsumed]);

  useEffect(() => {
    let mounted = true;

    async function loadDetail() {
      if (!selectedTaskId) {
        setDetail(null);
        return;
      }

      const nextDetail = await window.api.getTaskDetail(selectedTaskId);

      if (mounted) {
        setDetail(nextDetail);
        setDraftTitle(nextDetail?.title ?? '');
        setDraftSummary(nextDetail?.summary ?? '');
        setDraftNextStep(nextDetail?.nextStep ?? '');
        setDraftWaitingReason(nextDetail?.waitingReason ?? '');
        setDraftRiskLevel(nextDetail?.riskLevel ?? 'none');
        setDraftRiskNote(nextDetail?.riskNote ?? '');
        setTransitionWaitingReason(nextDetail?.waitingReason ?? '');
        setSourceContextEditingId(null);
        setSourceContextTitle('');
        setSourceContextKind('link');
        setSourceContextIsKey(false);
        setSourceContextUri('');
        setSourceContextContent('');
        setSourceContextNote('');
        setSourceContextError(null);
        setProcessTemplateEditingId(null);
        setProcessTemplateTitle('');
        setProcessTemplateSummary('');
        setProcessTemplateKind('skill');
        setProcessTemplateTags('');
        setProcessTemplateContent('');
        setProcessTemplateError(null);
        setDetailError(null);
        setTransitionError(null);
        setShowAllTimeline(false);
        setQuickDecisionTitle(
          nextDetail ? `${nextDetail.title} 需要拍板` : '',
        );
        setQuickDecisionNote(nextDetail?.nextStep ?? '');
        setQuickDecisionRationale(null);
        setQuickRunInstructions(nextDetail?.nextStep ?? nextDetail?.summary ?? '');
      }
    }

    void loadDetail();

    return () => {
      mounted = false;
    };
  }, [selectedTaskId, tasks]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newTaskTitle.trim()) {
      return;
    }

    await onCreateTask({ title: newTaskTitle.trim() });
    setNewTaskTitle('');
    await onRefresh();
  }

  async function handleSaveDetail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail) {
      return;
    }

    if (draftRiskLevel === 'high' && !draftRiskNote.trim()) {
      setDetailError('将风险等级设为 high 前，请先填写风险说明。');
      return;
    }

    setDetailError(null);

    await onUpdateTask({
      id: detail.id,
      title: draftTitle,
      summary: draftSummary,
      nextStep: draftNextStep,
      waitingReason: draftWaitingReason,
      riskLevel: draftRiskLevel,
      riskNote: draftRiskNote,
    });

    await onRefresh();
    const nextDetail = await window.api.getTaskDetail(detail.id);
    setDetail(nextDetail);
  }

  async function handleTransition(nextState: TaskState) {
    if (!detail) {
      return;
    }

    if (nextState === 'waiting_external' && !transitionWaitingReason.trim()) {
      setTransitionError('转入 waiting_external 前，请先填写等待原因。');
      return;
    }

    setTransitionError(null);

    await onTransitionTask(detail.id, nextState, nextState === 'waiting_external' ? transitionWaitingReason : undefined);
    await onRefresh();
    const nextDetail = await window.api.getTaskDetail(detail.id);
    setDetail(nextDetail);
  }

  async function handleQuickDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail || !quickDecisionTitle.trim()) {
      return;
    }

    await onCreateDecision({
      taskId: detail.id,
      title: quickDecisionTitle.trim(),
    });
    setQuickDecisionTitle(`${detail.title} 需要拍板`);
    setQuickDecisionRationale(null);
    await onRefresh();
  }

  async function handleDraftQuickDecision() {
    if (!detail) {
      return;
    }

    const draft = await onDraftDecision(detail.id, quickDecisionNote.trim() || null);
    setQuickDecisionTitle(draft.title);
    setQuickDecisionRationale(
      `${draft.source === 'ai' ? 'AI 草拟' : 'Fallback 草拟'}：${draft.rationale}${
        draft.selectedTemplateTitles.length
          ? ` | 模板：${draft.selectedTemplateTitles.join('、')}`
          : ''
      }`,
    );
  }

  async function handleQuickRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail) {
      return;
    }

    await onTriggerRun({
      taskId: detail.id,
      type: quickRunType,
      instructions: quickRunInstructions.trim(),
    });
    await onRefresh();
  }

  function populateSourceContextForm(item: SourceContextRecord) {
    setSourceContextEditingId(item.id);
    setSourceContextTitle(item.title);
    setSourceContextKind(item.kind);
    setSourceContextIsKey(item.isKey);
    setSourceContextUri(item.uri ?? '');
    setSourceContextContent(item.content ?? '');
    setSourceContextNote(item.note ?? '');
    setSourceContextError(null);
  }

  function resetSourceContextForm() {
    setSourceContextEditingId(null);
    setSourceContextTitle('');
    setSourceContextKind('link');
    setSourceContextIsKey(false);
    setSourceContextUri('');
    setSourceContextContent('');
    setSourceContextNote('');
    setSourceContextError(null);
  }

  function focusSourceContext(sourceContextId: string | null) {
    if (!detail || !sourceContextId) {
      return;
    }

    const matchedSourceContext = detail.sourceContexts.find((item) => item.id === sourceContextId);

    if (!matchedSourceContext) {
      return;
    }

    populateSourceContextForm(matchedSourceContext);
    if (typeof sourceContextSectionRef.current?.scrollIntoView === 'function') {
      sourceContextSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function populateProcessTemplateForm(item: ProcessTemplateRecord) {
    setProcessTemplateEditingId(item.id);
    setProcessTemplateTitle(item.title);
    setProcessTemplateSummary(item.summary ?? '');
    setProcessTemplateKind(item.kind);
    setProcessTemplateTags(item.tags.join(', '));
    setProcessTemplateContent(item.content);
    setProcessTemplateError(null);
  }

  function resetProcessTemplateForm() {
    setProcessTemplateEditingId(null);
    setProcessTemplateTitle('');
    setProcessTemplateSummary('');
    setProcessTemplateKind('skill');
    setProcessTemplateTags('');
    setProcessTemplateContent('');
    setProcessTemplateError(null);
  }

  function focusProcessTemplate(templateId: string | null) {
    if (!detail || !templateId) {
      return;
    }

    const matchedTemplate =
      detail.processTemplates.find((item) => item.id === templateId) ??
      detail.availableProcessTemplates.find((item) => item.id === templateId);

    if (!matchedTemplate) {
      return;
    }

    populateProcessTemplateForm(matchedTemplate);
    if (typeof processContextSectionRef.current?.scrollIntoView === 'function') {
      processContextSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function focusActionTarget(target: 'decision' | 'run' | 'transition') {
    const node =
      target === 'decision'
        ? quickDecisionCardRef.current
        : target === 'run'
          ? quickRunCardRef.current
          : transitionCardRef.current;

    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function adoptResumeNextStep() {
    if (!detail) {
      return;
    }

    setDraftNextStep(detail.resumeCard.nextSuggestedMove);
    setDetailError(null);
    if (typeof detailFormRef.current?.scrollIntoView === 'function') {
      detailFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function openResumeLatestChange() {
    if (!detail?.resumeCard.latestChange.action.targetType || !detail.resumeCard.latestChange.action.targetId) {
      return;
    }

    if (detail.resumeCard.latestChange.action.targetType === 'source_context') {
      focusSourceContext(detail.resumeCard.latestChange.action.targetId);
      return;
    }

    if (detail.resumeCard.latestChange.action.targetType === 'decision') {
      onOpenDecision(detail.resumeCard.latestChange.action.targetId);
      return;
    }

    onOpenRun(detail.resumeCard.latestChange.action.targetId);
  }

  async function handleSaveSourceContext(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail) {
      return;
    }

    if (!sourceContextTitle.trim()) {
      setSourceContextError('请先填写来源标题。');
      return;
    }

    if (
      ['link', 'doc', 'issue', 'pr'].includes(sourceContextKind) &&
      !sourceContextUri.trim()
    ) {
      setSourceContextError('该来源类型需要填写链接。');
      return;
    }

    setSourceContextError(null);

    if (sourceContextEditingId) {
      await onUpdateSourceContext({
        id: sourceContextEditingId,
        title: sourceContextTitle,
        kind: sourceContextKind,
        isKey: sourceContextIsKey,
        uri: sourceContextUri,
        content: sourceContextContent,
        note: sourceContextNote,
      });
    } else {
      await onCreateSourceContext({
        taskId: detail.id,
        title: sourceContextTitle,
        kind: sourceContextKind,
        isKey: sourceContextIsKey,
        uri: sourceContextUri,
        content: sourceContextContent,
        note: sourceContextNote,
      });
    }

    await onRefresh();
    const nextDetail = await window.api.getTaskDetail(detail.id);
    setDetail(nextDetail);
    resetSourceContextForm();
  }

  async function handleArchiveCurrentSourceContext(id: string) {
    if (!detail) {
      return;
    }

    await onArchiveSourceContext(id);
    await onRefresh();
    const nextDetail = await window.api.getTaskDetail(detail.id);
    setDetail(nextDetail);

    if (sourceContextEditingId === id) {
      resetSourceContextForm();
    }
  }

  async function handleSaveProcessTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail) {
      return;
    }

    if (!processTemplateTitle.trim()) {
      setProcessTemplateError('请先填写模板标题。');
      return;
    }

    if (!processTemplateContent.trim()) {
      setProcessTemplateError('请先填写模板内容。');
      return;
    }

    setProcessTemplateError(null);
    const tags = processTemplateTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (processTemplateEditingId) {
      await onUpdateProcessTemplate({
        id: processTemplateEditingId,
        title: processTemplateTitle,
        summary: processTemplateSummary,
        kind: processTemplateKind,
        tags,
        content: processTemplateContent,
      });
    } else {
      const created = await onCreateProcessTemplate({
        title: processTemplateTitle,
        summary: processTemplateSummary,
        kind: processTemplateKind,
        tags,
        content: processTemplateContent,
      });

      await onApplyProcessTemplate({
        taskId: detail.id,
        templateId: created.id,
      });
    }

    await onRefresh();
    const nextDetail = await window.api.getTaskDetail(detail.id);
    setDetail(nextDetail);
    resetProcessTemplateForm();
  }

  async function handleApplyAvailableProcessTemplate(templateId: string) {
    if (!detail) {
      return;
    }

    await onApplyProcessTemplate({
      taskId: detail.id,
      templateId,
    });
    await onRefresh();
    setDetail(await window.api.getTaskDetail(detail.id));
  }

  async function handleRemoveCurrentProcessTemplate(bindingId: string) {
    if (!detail) {
      return;
    }

    await onRemoveProcessTemplate(bindingId);
    await onRefresh();
    setDetail(await window.api.getTaskDetail(detail.id));
  }

  async function handleArchiveCurrentProcessTemplate(id: string) {
    if (!detail) {
      return;
    }

    await onArchiveProcessTemplate(id);
    await onRefresh();
    setDetail(await window.api.getTaskDetail(detail.id));

    if (processTemplateEditingId === id) {
      resetProcessTemplateForm();
    }
  }

  function handleTimelineAction(event: TimelineEventRecord) {
    if (!detail) {
      return;
    }

    const payload = safeParsePayload(event.payload);

    if (event.type === 'task.decision_cancelled') {
      setQuickDecisionTitle(`${detail.title} 重新拍板`);
    }

    if (event.type === 'task.decision_approved') {
      setDraftNextStep(`已获批准，继续推进：${formatValue(payload?.decisionTitle)}`);
    }

    if (event.type === 'task.decision_deferred') {
      setDraftNextStep('跟进该决策是否可以恢复拍板，或准备替代推进路径。');
      setTransitionWaitingReason(formatValue(payload?.waitingReason));
    }

    if (event.type === 'task.run_failed') {
      setQuickRunType('draft');
      setQuickRunInstructions(
        `请先处理这个失败原因，再准备新的执行内容：${formatValue(payload?.failureReason)}`,
      );
    }

    if (event.type === 'task.waiting_changed') {
      setDraftNextStep(`跟进并确认是否解除等待：${formatValue(payload?.to)}`);
    }

    if (event.type === 'task.risk_changed') {
      const nextRisk = (payload?.to as Record<string, unknown> | undefined) ?? {};
      const nextRiskLevel = nextRisk.level;
      const nextRiskNote = formatValue(nextRisk.note);

      if (nextRiskLevel && ['none', 'low', 'medium', 'high'].includes(String(nextRiskLevel))) {
        setDraftRiskLevel(nextRiskLevel as TaskRiskLevel);
      }

      setDraftRiskNote(nextRiskNote === '未填写' ? '' : nextRiskNote);
      setDraftNextStep(
        `处理当前风险并确认是否需要降级：${nextRiskNote === '未填写' ? '补充风险说明' : nextRiskNote}`,
      );
    }

    if (event.type === 'artifact.created') {
      const artifactId = payload?.artifactId;
      const artifact = detail.artifacts.find((item) => item.id === artifactId);
      const artifactTitle = artifact?.title ?? formatValue(payload?.title);
      const artifactContent = artifact?.content ?? '';

      setDraftNextStep(`基于产物继续推进：${artifactTitle}`);
      setQuickRunInstructions(
        artifactContent
          ? `请基于这份已有产物继续扩展、改写或整理：${artifactContent}`
          : `请基于已有产物继续推进：${artifactTitle}`,
      );
    }

    const focusTarget =
      event.type === 'task.decision_approved' ||
      event.type === 'task.decision_deferred' ||
      event.type === 'task.waiting_changed' ||
      event.type === 'task.risk_changed' ||
      event.type === 'artifact.created'
        ? detailFormRef.current
        : quickActionsRef.current;

    if (typeof focusTarget?.scrollIntoView === 'function') {
      focusTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function handleTimelineObjectOpen(event: TimelineEventRecord) {
    const objectAction = interpretTaskTimelineEvent(event).objectAction;

    if (objectAction.targetType === 'decision' && objectAction.targetId) {
      onOpenDecision(objectAction.targetId);
      return;
    }

    if (objectAction.targetType === 'run' && objectAction.targetId) {
      onOpenRun(objectAction.targetId);
    }
  }

  const relatedDecisions = detail
    ? decisions
        .filter((decision) => decision.taskId === detail.id)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 5)
    : [];

  const relatedRuns = detail
    ? runs
        .filter((run) => run.taskId === detail.id)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 5)
    : [];

  const visibleTimeline = detail
    ? showAllTimeline
      ? detail.timeline
      : [...detail.timeline]
          .sort((left, right) => {
            const priorityOrder = { p1: 0, p2: 1, p3: 2 } as const;
            const priorityDiff =
              priorityOrder[getTaskTimelinePriority(left.type)] -
              priorityOrder[getTaskTimelinePriority(right.type)];

            if (priorityDiff !== 0) {
              return priorityDiff;
            }

            return right.createdAt.localeCompare(left.createdAt);
          })
          .slice(0, TIMELINE_PREVIEW_COUNT)
    : [];
  const snapshotArtifact = detail?.artifacts[0] ?? null;
  const snapshotSourceContext = detail?.sourceContexts[0] ?? null;
  const snapshotProcessTemplate = detail?.processTemplates[0] ?? null;

  return (
    <section className="tasks-layout">
      <article className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Tasks</p>
            <h2>任务列表</h2>
          </div>
        </div>
        <form className="stack" onSubmit={handleCreate}>
          <label>
            新任务标题
            <input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} />
          </label>
          <button type="submit">创建任务</button>
        </form>
        <div className="task-list">
          {tasks.length === 0 ? (
            <p className="meta">还没有任务，先创建一条开始流转。</p>
          ) : (
            tasks.map((task) => (
              <button
                className={`task-card task-card-button ${getTaskCardTone(task)} ${
                  task.id === selectedTaskId ? 'task-card-active' : ''
                }`}
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                type="button"
              >
                <div className="task-row">
                  <strong>{task.title}</strong>
                  <span className="status">{task.state}</span>
                </div>
                <p className="meta">{task.summary || task.id}</p>
                {buildTaskBadges(task).length ? (
                  <div className="signal-row">
                    {buildTaskBadges(task).map((badge) => (
                      <span className="signal-pill" key={badge}>
                        {badge}
                      </span>
                    ))}
                  </div>
                ) : null}
                {task.nextStep ? <p className="meta">下一步：{task.nextStep}</p> : null}
                {task.waitingReason ? <p className="meta">等待：{task.waitingReason}</p> : null}
              </button>
            ))
          )}
        </div>
      </article>

      <article className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Task Detail</p>
            <h2>{detail?.title ?? '选择一个任务'}</h2>
          </div>
        </div>
        {detail ? (
          <>
            <form className="stack" onSubmit={handleSaveDetail} ref={detailFormRef}>
              <label>
                标题
                <input
                  value={draftTitle}
                  onChange={(event) => {
                    setDraftTitle(event.target.value);
                    if (detailError) {
                      setDetailError(null);
                    }
                  }}
                />
              </label>
              <label>
                Summary
                <textarea
                  rows={4}
                  value={draftSummary}
                  onChange={(event) => {
                    setDraftSummary(event.target.value);
                    if (detailError) {
                      setDetailError(null);
                    }
                  }}
                />
              </label>
              <label>
                Next Step
                <input
                  value={draftNextStep}
                  onChange={(event) => {
                    setDraftNextStep(event.target.value);
                    if (detailError) {
                      setDetailError(null);
                    }
                  }}
                />
              </label>
              <label>
                Waiting Reason
                <input
                  value={draftWaitingReason}
                  onChange={(event) => {
                    setDraftWaitingReason(event.target.value);
                    if (detailError) {
                      setDetailError(null);
                    }
                  }}
                />
              </label>
              <label>
                Risk Level
                <select
                  value={draftRiskLevel}
                  onChange={(event) => updateDraftRiskLevel(event.target.value as TaskRiskLevel)}
                >
                  {riskOptions.map((riskLevel) => (
                    <option key={riskLevel} value={riskLevel}>
                      {riskLevel}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Risk Note
                <textarea
                  rows={3}
                  value={draftRiskNote}
                  onChange={(event) => {
                    setDraftRiskNote(event.target.value);
                    if (detailError) {
                      setDetailError(null);
                    }
                  }}
                />
              </label>
              {detailError ? <p className="meta">{detailError}</p> : null}
              <button type="submit">保存详情</button>
            </form>

            <div className="transition-group detail-stage">
                <div className="detail-stage-head">
                  <div>
                    <p className="eyebrow">Current Snapshot</p>
                    <h3>恢复与当前推进</h3>
                  </div>
                  <p className="meta">第一屏只保留能帮助你恢复状态、看清当前对象并继续推进的切片。</p>
                </div>
              <div className="detail-cluster-grid">
                <div className="transition-group detail-card-group detail-card-wide">
                  <h3>Task Resume Card</h3>
                  <div className="timeline-item timeline-item-state">
                    <strong>Resume Summary</strong>
                    <p className="meta">{detail.resumeCard.summary}</p>
                    <div className="resume-grid">
                      <div className="resume-cell">
                        <strong>Current State</strong>
                        <p className="meta">{detail.resumeCard.currentState}</p>
                      </div>
                      <div className="resume-cell">
                        <strong>Latest Change</strong>
                        <p className="meta">{detail.resumeCard.latestChange.summary}</p>
                        {detail.resumeCard.latestChange.action.label ? (
                          <button
                            className="ghost-button timeline-action"
                            onClick={openResumeLatestChange}
                            type="button"
                          >
                            {detail.resumeCard.latestChange.action.label}
                          </button>
                        ) : null}
                      </div>
                      <div className="resume-cell">
                        <strong>Key Source</strong>
                        <p className="meta">Material Shelf slice</p>
                        <p className="meta">{detail.resumeCard.keySource.title}</p>
                        {detail.resumeCard.keySource.detail ? (
                          <p className="meta">{detail.resumeCard.keySource.detail}</p>
                        ) : null}
                        {detail.resumeCard.keySource.priorityReason ? (
                          <p className="meta">{detail.resumeCard.keySource.priorityReason}</p>
                        ) : null}
                      </div>
                      <div className="resume-cell">
                        <strong>Current Method</strong>
                        <p className="meta">Active Methods slice</p>
                        <p className="meta">{detail.resumeCard.currentMethod.title}</p>
                        {detail.resumeCard.currentMethod.detail ? (
                          <p className="meta">{detail.resumeCard.currentMethod.detail}</p>
                        ) : null}
                        {detail.resumeCard.currentMethod.selectionReason ? (
                          <p className="meta">{detail.resumeCard.currentMethod.selectionReason}</p>
                        ) : null}
                      </div>
                      <div className="resume-cell resume-cell-wide">
                        <strong>Next Suggested Move</strong>
                        <p className="meta">{detail.resumeCard.nextSuggestedMove}</p>
                      </div>
                    </div>
                    <div className="timeline-actions">
                      {detail.resumeCard.keySource.sourceContextId ? (
                        <button
                          className="ghost-button timeline-action"
                          onClick={() => focusSourceContext(detail.resumeCard.keySource.sourceContextId)}
                          type="button"
                        >
                          打开 Material Shelf
                        </button>
                      ) : null}
                      {detail.resumeCard.currentMethod.templateId ? (
                        <button
                          className="ghost-button timeline-action"
                          onClick={() => focusProcessTemplate(detail.resumeCard.currentMethod.templateId)}
                          type="button"
                        >
                          打开 Active Methods
                        </button>
                      ) : null}
                      <button
                        className="ghost-button timeline-action"
                        onClick={adoptResumeNextStep}
                        type="button"
                      >
                        采用建议下一步
                      </button>
                    </div>
                  </div>
                </div>

                <div className="transition-group detail-card-group">
                  <h3>Task Signals</h3>
                  <p className="meta">这里只保留任务当前现态，不在这一层重复展开完整历史。</p>
                  <div className="timeline-list">
                    <div className="timeline-item">
                      <strong>Next Step</strong>
                      <p className="meta">{detail.nextStep ?? '未填写'}</p>
                    </div>
                    <div className="timeline-item">
                      <strong>Waiting Reason</strong>
                      <p className="meta">{detail.activeWaitingItem?.reason ?? detail.waitingReason ?? '未填写'}</p>
                      {detail.activeWaitingItem ? (
                        <p className="meta">
                          waiting item · {detail.activeWaitingItem.status} · since {detail.activeWaitingItem.createdAt}
                        </p>
                      ) : null}
                    </div>
                    <div className="timeline-item">
                      <strong>Risk</strong>
                      <p className="meta">
                        {detail.riskLevel}
                        {detail.riskNote ? ` · ${detail.riskNote}` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {detail.activeWaitingItem ? (
                  <div className="transition-group detail-card-group">
                    <h3>Current Waiting Item</h3>
                    <p className="meta">只显示当前正在生效的等待切片，更多历史放到 Timeline。</p>
                    <div className="timeline-list">
                      <div className="timeline-item timeline-item-waiting">
                        <div className="task-row">
                          <strong>{detail.activeWaitingItem.reason}</strong>
                          <span className="signal-pill timeline-badge timeline-item-waiting">
                            {detail.activeWaitingItem.status}
                          </span>
                        </div>
                        <p className="meta">Started at {detail.activeWaitingItem.createdAt}</p>
                        <p className="meta">Linked to the task&apos;s current waiting state.</p>
                        {detail.state === 'waiting_external' ? (
                          <button
                            className="ghost-button timeline-action"
                            onClick={() => void handleTransition('planned')}
                            type="button"
                          >
                            解除等待
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="transition-group detail-card-group">
                  <h3>Recent Artifact</h3>
                  <p className="meta">这里只显示最新产物，避免把当前层做成产物归档区。</p>
                  <div className="timeline-list">
                    {snapshotArtifact ? (
                      <div className="timeline-item timeline-item-next-step" key={snapshotArtifact.id}>
                        <div className="task-row">
                          <strong>{snapshotArtifact.title}</strong>
                          <span className="signal-pill timeline-badge timeline-item-next-step">
                            {snapshotArtifact.kind}
                          </span>
                        </div>
                        <p className="meta">
                          source: {snapshotArtifact.sourceType} · {snapshotArtifact.sourceId}
                        </p>
                        <p className="meta brief-preview">{snapshotArtifact.content}</p>
                        {detail.artifacts.length > 1 ? (
                          <p className="meta">其余 {detail.artifacts.length - 1} 条产物留在下方活动与历史层。</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="meta">当前任务还没有沉淀出 artifact。</p>
                    )}
                  </div>
                </div>

                <div className="transition-group detail-card-group">
                  <h3>Key Source Materials</h3>
                  <p className="meta">当前层只保留最关键的一条来源切片，完整材料管理下沉到 Context Studio。</p>
                  <div className="timeline-list">
                    {snapshotSourceContext ? (
                      <button
                        className="task-card task-card-button task-card-muted"
                        key={`key-source:${snapshotSourceContext.id}`}
                        onClick={() => populateSourceContextForm(snapshotSourceContext)}
                        type="button"
                      >
                        <div className="task-row">
                          <strong>{snapshotSourceContext.title}</strong>
                          <span className="signal-pill timeline-badge timeline-item-default">
                            {formatSourceContextKind(snapshotSourceContext.kind)}
                            {snapshotSourceContext.isKey ? ' · key' : ''}
                          </span>
                        </div>
                        {snapshotSourceContext.note ? <p className="meta">{snapshotSourceContext.note}</p> : null}
                        {snapshotSourceContext.uri ? (
                          <p className="meta brief-preview">{snapshotSourceContext.uri}</p>
                        ) : null}
                        <p className="meta">最近更新：{snapshotSourceContext.updatedAt}</p>
                        {detail.sourceContexts.length > 1 ? (
                          <p className="meta">其余 {detail.sourceContexts.length - 1} 条来源材料移到 Context Studio。</p>
                        ) : null}
                      </button>
                    ) : (
                      <p className="meta">当前还没有关键来源材料。</p>
                    )}
                  </div>
                  {snapshotSourceContext ? (
                    <div className="timeline-actions">
                      <button
                        className="ghost-button timeline-action"
                        onClick={() => focusSourceContext(snapshotSourceContext.id)}
                        type="button"
                      >
                        前往 Context Studio 管理来源
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="transition-group detail-card-group">
                  <h3>Current Method</h3>
                  <p className="meta">当前层只保留一个主方法切片，完整模板管理下沉到 Context Studio。</p>
                  <div className="timeline-list">
                    {snapshotProcessTemplate ? (
                      <div
                        className="timeline-item timeline-item-state"
                        key={`current-method:${snapshotProcessTemplate.bindingId}`}
                      >
                        <div className="task-row">
                          <strong>{snapshotProcessTemplate.title}</strong>
                          <span className="signal-pill timeline-badge timeline-item-state">
                            {formatProcessTemplateKind(snapshotProcessTemplate.kind)}
                          </span>
                        </div>
                        {snapshotProcessTemplate.summary ? (
                          <p className="meta">{snapshotProcessTemplate.summary}</p>
                        ) : null}
                        {snapshotProcessTemplate.tags.length ? (
                          <p className="meta">tags: {snapshotProcessTemplate.tags.join(', ')}</p>
                        ) : null}
                        {detail.resumeCard.currentMethod.selectionReason ? (
                          <p className="meta">{detail.resumeCard.currentMethod.selectionReason}</p>
                        ) : null}
                        {detail.processTemplates.length > 1 ? (
                          <p className="meta">其余 {detail.processTemplates.length - 1} 个方法模板移到 Context Studio。</p>
                        ) : null}
                        <div className="timeline-actions">
                          <button
                            className="ghost-button timeline-action"
                            onClick={() => focusProcessTemplate(snapshotProcessTemplate.id)}
                            type="button"
                          >
                            打开当前方法模板
                          </button>
                          <button
                            className="ghost-button timeline-action"
                            onClick={() => focusProcessTemplate(snapshotProcessTemplate.id)}
                            type="button"
                          >
                            前往 Context Studio 管理方法
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="meta">当前任务还没有启用中的方法模板。</p>
                    )}
                  </div>
                </div>

              </div>
            </div>

            <div className="transition-group detail-stage">
              <div className="detail-stage-head">
                <div>
                  <p className="eyebrow">Action Desk</p>
                  <h3>动作与状态流转</h3>
                </div>
                <p className="meta">先给当前最常用的三个入口，详细配置再放到下方，不把中层做成工具箱。</p>
              </div>
              <div className="detail-cluster-grid">
                <div className="transition-group detail-card-group detail-card-wide">
                  <h3>Primary Moves</h3>
                  <p className="meta">这里只前置最常用的推进入口，具体填写和状态选择放在下方。</p>
                  <div className="primary-moves-grid">
                    <button
                      className="ghost-button primary-move-button"
                      onClick={() => focusActionTarget('decision')}
                      type="button"
                    >
                      草拟或创建 Decision
                    </button>
                    <button
                      className="ghost-button primary-move-button"
                      onClick={() => focusActionTarget('run')}
                      type="button"
                    >
                      配置并触发 Run
                    </button>
                    <button
                      className="ghost-button primary-move-button"
                      onClick={() => focusActionTarget('transition')}
                      type="button"
                    >
                      调整任务状态
                    </button>
                  </div>
                </div>

                <div className="transition-group detail-card-group" ref={sourceContextSectionRef}>
                  <h3>Action Setup</h3>
                  <p className="meta">需要补充上下文时，再使用这里的详细表单。</p>
                  <div className="quick-actions-grid" ref={quickActionsRef}>
                    <form
                      className="stack task-card quick-action-card"
                      onSubmit={handleQuickDecision}
                      ref={quickDecisionCardRef}
                    >
                      <strong>Decision</strong>
                      <label>
                        决策标题
                        <input
                          value={quickDecisionTitle}
                          onChange={(event) => setQuickDecisionTitle(event.target.value)}
                        />
                      </label>
                      <label>
                        拍板背景
                        <textarea
                          rows={3}
                          value={quickDecisionNote}
                          onChange={(event) => setQuickDecisionNote(event.target.value)}
                        />
                      </label>
                      {quickDecisionRationale ? <p className="meta">{quickDecisionRationale}</p> : null}
                      <button type="button" className="ghost-button" onClick={() => void handleDraftQuickDecision()}>
                        草拟 Decision
                      </button>
                      <button type="submit">提交 Decision</button>
                    </form>

                    <form
                      className="stack task-card quick-action-card"
                      onSubmit={handleQuickRun}
                      ref={quickRunCardRef}
                    >
                      <strong>Run</strong>
                      <label>
                        Run 类型
                        <select
                          value={quickRunType}
                          onChange={(event) =>
                            setQuickRunType(event.target.value as CreateRunInput['type'])
                          }
                        >
                          <option value="draft">draft</option>
                          <option value="summarize">summarize</option>
                        </select>
                      </label>
                      <label>
                        附加要求
                        <textarea
                          rows={3}
                          value={quickRunInstructions}
                          onChange={(event) => setQuickRunInstructions(event.target.value)}
                        />
                      </label>
                      <button type="submit">触发 Run</button>
                    </form>
                  </div>
                </div>

                <div className="transition-group detail-card-group" ref={transitionCardRef}>
                  <h3>状态流转</h3>
                  <p className="meta">只保留当前状态允许的后续流转，避免把所有状态都摊在面前。</p>
                  <div className="stack">
                    <label>
                      Waiting Transition Reason
                      <input
                        placeholder="例如：等待外部审批 / 客户回复 / 法务确认"
                        value={transitionWaitingReason}
                        onChange={(event) => {
                          setTransitionWaitingReason(event.target.value);
                          if (transitionError) {
                            setTransitionError(null);
                          }
                        }}
                      />
                    </label>
                    {transitionError ? <p className="meta">{transitionError}</p> : null}
                  </div>
                  <div className="chip-row">
                    {transitionOptions[detail.state].length === 0 ? (
                      <p className="meta">当前状态没有可用的下一步。</p>
                    ) : (
                      transitionOptions[detail.state].map((nextState) => (
                        <button
                          className="ghost-button"
                          key={nextState}
                          onClick={() => void handleTransition(nextState)}
                          type="button"
                        >
                          转到 {nextState}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="transition-group detail-stage">
              <div className="detail-stage-head">
                <div>
                  <p className="eyebrow">Activity Feed</p>
                  <h3>关联活动与任务历史</h3>
                </div>
                <p className="meta">最后再看相关对象和 Timeline，更容易分清“当前”与“历史”。</p>
              </div>

              <div className="transition-group detail-card-group">
                <h3>Related Activity</h3>
                <div className="related-grid">
                  <div className="timeline-list">
                    <strong>Decisions</strong>
                    {relatedDecisions.length ? (
                      relatedDecisions.map((decision) => (
                        <button
                          className="timeline-item task-card-button"
                          key={decision.id}
                          onClick={() => onOpenDecision(decision.id)}
                          type="button"
                        >
                          <div className="task-row">
                            <strong>{decision.title}</strong>
                            <span className="status">{decision.status}</span>
                          </div>
                          <p className="meta">{decision.updatedAt}</p>
                        </button>
                      ))
                    ) : (
                      <p className="meta">当前任务还没有关联 decision。</p>
                    )}
                  </div>

                  <div className="timeline-list">
                    <strong>Recent Runs</strong>
                    {relatedRuns.length ? (
                      relatedRuns.map((run) => (
                        <button
                          className="timeline-item task-card-button"
                          key={run.id}
                          onClick={() => onOpenRun(run.id)}
                          type="button"
                        >
                          <div className="task-row">
                            <strong>{run.type}</strong>
                            <span className="status">{run.status}</span>
                          </div>
                          <p className="meta">
                            {run.outputSource ? `来源：${run.outputSource}` : '来源：尚未产生'}
                          </p>
                          <p className="meta">{run.updatedAt}</p>
                        </button>
                      ))
                    ) : (
                      <p className="meta">当前任务还没有关联 run。</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="transition-group detail-card-group">
                <div className="task-row">
                  <div>
                    <h3>Timeline</h3>
                    <p className="meta">预览优先展示关键事件与解释事件，较弱的留痕事件默认后退。</p>
                  </div>
                  {detail.timeline.length > TIMELINE_PREVIEW_COUNT ? (
                    <button
                      className="ghost-button timeline-toggle"
                      onClick={() => setShowAllTimeline((current) => !current)}
                      type="button"
                    >
                      {showAllTimeline ? '收起旧事件' : `展开全部 (${detail.timeline.length})`}
                    </button>
                  ) : null}
                </div>
                <div className="timeline-list">
                  {visibleTimeline.map((event) => (
                    <div className={`timeline-item ${getTimelineToneClass(event.type)}`} key={event.id}>
                      <div className="task-row">
                        <strong>{formatTimelineSummary(event)}</strong>
                        <div className="timeline-badge-row">
                          <span
                            className={`signal-pill timeline-badge ${getTimelineToneClass(event.type)}`}
                          >
                            {formatTimelineBadge(event.type)}
                          </span>
                          <span className="signal-pill timeline-priority-pill">
                            {getTaskTimelinePriorityLabel(event.type)}
                          </span>
                        </div>
                      </div>
                      <p className="meta">{event.createdAt}</p>
                      {getTimelineActionLabel(event.type) || getTimelineObjectLabel(event) ? (
                        <div className="timeline-actions">
                          {getTimelineActionLabel(event.type) ? (
                            <button
                              className="ghost-button timeline-action"
                              onClick={() => handleTimelineAction(event)}
                              type="button"
                            >
                              {getTimelineActionLabel(event.type)}
                            </button>
                          ) : null}
                          {getTimelineObjectLabel(event) ? (
                            <button
                              className="ghost-button timeline-action"
                              onClick={() => handleTimelineObjectOpen(event)}
                              type="button"
                            >
                              {getTimelineObjectLabel(event)}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="transition-group detail-stage">
              <div className="detail-stage-head">
                <div>
                  <p className="eyebrow">Context Studio</p>
                  <h3>来源与方法管理</h3>
                </div>
                <p className="meta">完整的来源材料和方法模板管理下沉到这一层，不再抢第一屏恢复入口。</p>
              </div>
              <div className="detail-cluster-grid">
                <div className="transition-group detail-card-group">
                  <h3>Source Context</h3>
                  <p className="meta">这一层管理任务依赖的材料，不和方法模板混在一起；上方 Resume Card 的 Key Source 就是从这里抽出的关键切片。</p>
                  <div className="studio-section">
                    <div className="studio-section-head">
                      <strong>Material Shelf</strong>
                      <p className="meta">当前任务已挂载的来源材料。</p>
                    </div>
                    <div className="timeline-list">
                      {detail.sourceContexts.length ? (
                        detail.sourceContexts.map((item) => (
                          <div className="timeline-item" key={item.id}>
                            <div className="task-row">
                              <strong>{item.title}</strong>
                              <span className="signal-pill timeline-badge timeline-item-default">
                                {formatSourceContextKind(item.kind)}
                                {item.isKey ? ' · key' : ''}
                              </span>
                            </div>
                            {item.uri ? (
                              <p className="meta">
                                <a href={item.uri} rel="noreferrer" target="_blank">
                                  {item.uri}
                                </a>
                              </p>
                            ) : null}
                            {item.note ? <p className="meta">{item.note}</p> : null}
                            {item.content ? <p className="meta brief-preview">{item.content}</p> : null}
                            <div className="timeline-actions">
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => populateSourceContextForm(item)}
                                type="button"
                              >
                                编辑来源
                              </button>
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => void handleArchiveCurrentSourceContext(item.id)}
                                type="button"
                              >
                                归档来源
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="meta">当前任务还没有挂载来源材料。</p>
                      )}
                    </div>
                  </div>
                  <form className="stack studio-form" onSubmit={handleSaveSourceContext}>
                    <div className="studio-section-head">
                      <strong>{sourceContextEditingId ? 'Edit Material' : 'Add Material'}</strong>
                      <p className="meta">在这里维护来源标题、链接、说明和是否为关键来源。</p>
                    </div>
                    <label>
                      来源标题
                      <input
                        value={sourceContextTitle}
                        onChange={(event) => {
                          setSourceContextTitle(event.target.value);
                          if (sourceContextError) {
                            setSourceContextError(null);
                          }
                        }}
                      />
                    </label>
                    <label>
                      来源类型
                      <select
                        value={sourceContextKind}
                        onChange={(event) => setSourceContextKind(event.target.value as SourceContextKind)}
                      >
                        {sourceContextKindOptions.map((kind) => (
                          <option key={kind} value={kind}>
                            {formatSourceContextKind(kind)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="checkbox-row">
                      <input
                        checked={sourceContextIsKey}
                        onChange={(event) => setSourceContextIsKey(event.target.checked)}
                        type="checkbox"
                      />
                      标记为关键来源
                    </label>
                    <label>
                      链接 / URI
                      <input
                        value={sourceContextUri}
                        onChange={(event) => {
                          setSourceContextUri(event.target.value);
                          if (sourceContextError) {
                            setSourceContextError(null);
                          }
                        }}
                      />
                    </label>
                    <label>
                      说明
                      <textarea
                        rows={2}
                        value={sourceContextNote}
                        onChange={(event) => setSourceContextNote(event.target.value)}
                      />
                    </label>
                    <label>
                      补充内容
                      <textarea
                        rows={3}
                        value={sourceContextContent}
                        onChange={(event) => setSourceContextContent(event.target.value)}
                      />
                    </label>
                    {sourceContextError ? <p className="meta">{sourceContextError}</p> : null}
                    <div className="timeline-actions">
                      <button type="submit">{sourceContextEditingId ? '保存来源' : '新增来源'}</button>
                      {sourceContextEditingId ? (
                        <button className="ghost-button" onClick={resetSourceContextForm} type="button">
                          取消编辑
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>

                <div className="transition-group detail-card-group" ref={processContextSectionRef}>
                  <h3>Process Context</h3>
                  <p className="meta">这一层管理任务当前采用的方法和可复用模板库；上方 Resume Card 的 Current Method 就是从这里抽出的当前切片。</p>
                  <div className="studio-section">
                    <div className="studio-section-head">
                      <strong>Active Methods</strong>
                      <p className="meta">当前任务已挂载的方法模板。</p>
                    </div>
                    <div className="timeline-list">
                      {detail.processTemplates.length ? (
                        detail.processTemplates.map((item) => (
                          <div className="timeline-item timeline-item-state" key={item.bindingId}>
                            <div className="task-row">
                              <strong>{item.title}</strong>
                              <span className="signal-pill timeline-badge timeline-item-state">
                                {formatProcessTemplateKind(item.kind)}
                              </span>
                            </div>
                            {item.summary ? <p className="meta">{item.summary}</p> : null}
                            {item.tags.length ? <p className="meta">tags: {item.tags.join(', ')}</p> : null}
                            <p className="meta">active template · bound at {item.boundAt}</p>
                            <p className="meta brief-preview">{item.content}</p>
                            <div className="timeline-actions">
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => populateProcessTemplateForm(item)}
                                type="button"
                              >
                                编辑模板
                              </button>
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => void handleRemoveCurrentProcessTemplate(item.bindingId)}
                                type="button"
                              >
                                移除模板
                              </button>
                              <button
                                className="ghost-button timeline-action"
                                onClick={() => void handleArchiveCurrentProcessTemplate(item.id)}
                                type="button"
                              >
                                归档模板
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="meta">当前任务还没有挂载方法模板。</p>
                      )}
                    </div>
                  </div>
                  <div className="studio-section">
                    <div className="studio-section-head">
                      <strong>Template Library</strong>
                      <p className="meta">可复用的方法模板库，用来给当前任务补充方法卡。</p>
                    </div>
                    <div className="timeline-list">
                      <div className="timeline-item">
                        {detail.availableProcessTemplates.length ? (
                          <div className="stack">
                            {detail.availableProcessTemplates.map((item) => (
                              <div className="task-row" key={item.id}>
                                <div>
                                  <strong>{item.title}</strong>
                                  <p className="meta">
                                    {formatProcessTemplateKind(item.kind)}
                                    {item.summary ? ` · ${item.summary}` : ''}
                                  </p>
                                </div>
                                <button
                                  className="ghost-button timeline-action"
                                  onClick={() => void handleApplyAvailableProcessTemplate(item.id)}
                                  type="button"
                                >
                                  挂载模板
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="meta">当前没有可挂载的其它模板。</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <form className="stack studio-form" onSubmit={handleSaveProcessTemplate}>
                    <div className="studio-section-head">
                      <strong>{processTemplateEditingId ? 'Edit Template' : 'Create Template'}</strong>
                      <p className="meta">维护可复用的方法卡，再决定是否挂到当前任务上。</p>
                    </div>
                    <label>
                      模板标题
                      <input
                        value={processTemplateTitle}
                        onChange={(event) => {
                          setProcessTemplateTitle(event.target.value);
                          if (processTemplateError) {
                            setProcessTemplateError(null);
                          }
                        }}
                      />
                    </label>
                    <label>
                      模板类型
                      <select
                        value={processTemplateKind}
                        onChange={(event) => setProcessTemplateKind(event.target.value as ProcessTemplateKind)}
                      >
                        {processTemplateKindOptions.map((kind) => (
                          <option key={kind} value={kind}>
                            {formatProcessTemplateKind(kind)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      简述
                      <input
                        value={processTemplateSummary}
                        onChange={(event) => setProcessTemplateSummary(event.target.value)}
                      />
                    </label>
                    <label>
                      标签
                      <input
                        placeholder="writing, outreach, review"
                        value={processTemplateTags}
                        onChange={(event) => setProcessTemplateTags(event.target.value)}
                      />
                    </label>
                    <label>
                      模板内容
                      <textarea
                        rows={5}
                        value={processTemplateContent}
                        onChange={(event) => setProcessTemplateContent(event.target.value)}
                      />
                    </label>
                    {processTemplateError ? <p className="meta">{processTemplateError}</p> : null}
                    <div className="timeline-actions">
                      <button type="submit">
                        {processTemplateEditingId ? '保存模板' : '创建模板并挂载'}
                      </button>
                      {processTemplateEditingId ? (
                        <button className="ghost-button" onClick={resetProcessTemplateForm} type="button">
                          取消编辑
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="meta">先在左侧创建或选择一个任务。</p>
        )}
      </article>
    </section>
  );
}

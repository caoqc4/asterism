import { useState, useRef, useCallback, useEffect } from 'react';
import type { ProjectDecompositionResult } from '@shared/types/ipc';
import type { TaskDetail, TaskListItemRecord, TaskRiskLevel, TaskState, TimelineEventRecord, UpdateTaskInput } from '@shared/types/task';
import type { SourceContextRecord } from '@shared/types/source-context';
import type { ArtifactRecord } from '@shared/types/artifact';
import type { TaskFileRecord } from '@shared/types/task-file';
import type { DecisionRecord } from '@shared/types/decision';
import type { RunRecord } from '@shared/types/run';
import { isUnconfirmedPanelCaptureRecord } from '@shared/panel-capture';
import { selectApplicableWorkHabits as selectApplicableWorkHabitsFromList } from '@shared/work-habit-rules';
import { TaskCompletionCheckModal } from '../components/TaskCompletionCheckModal';
import {
  buildProjectDecompositionGuidance,
  buildTaskPlanningPrompt,
  defaultScheduleForType,
  defaultTriggerForType,
  inferTaskExecutionType,
  loadTaskAttributes,
  moveTaskToProject,
  saveTaskAttributes,
  type TaskAttributeRecord,
  type TaskExecutionType,
} from '../lib/taskAttributes';
import { getPersistedWorkHabitStorageSnapshot, type WorkHabitRecord } from '../lib/workHabits';
import {
  createManualArtifact,
  deleteArtifactWorkspace,
  mergeTaskArtifacts,
  updateArtifactWorkspace,
} from '../lib/artifactWorkspace';
import {
  createLocalTaskFile,
  deleteLocalTaskFile,
  loadLocalTaskFiles,
  loadTaskFileContentOverrides,
  updateLocalTaskFile,
  updateTaskFileContentOverride,
  type LocalTaskFileRecord,
} from '../lib/taskFileWorkspace';

type Lane = 'escalate' | 'unblock' | 'continue' | 'clarify' | 'steady';
type TaskStatus = 'running' | 'waiting' | 'blocked' | 'idle' | 'done';
type TaskType = TaskExecutionType;
type ViewMode = 'lane' | 'list' | 'timeline';
type TaskDetailViewMode = 'manage' | 'timeline';
type CapturedTaskSummary = { id: string; title: string; type: TaskType };
type SelectedObject = 'task-list' | 'task' | 'file';
type VirtualTaskFile = {
  id: string;
  taskId: string;
  name: string;
  path: string;
  kind: 'task_record' | 'records_folder' | 'source' | 'artifact' | 'local_file' | 'local_folder';
  content: string;
  editable: boolean;
  sourceId?: string;
  artifactId?: string;
};
type PendingFileSwitch = (() => void) | null;
export type TaskWorkspaceSelectionContext = {
  taskId: string | null;
  taskTitle: string | null;
  selectedFile: {
    path: string;
    kind: string;
    dirty?: boolean;
    contentPreview: string | null;
  } | null;
};

interface Task {
  id: string;
  title: string;
  lane: Lane;
  status: TaskStatus;
  type: TaskType;
  parentTaskId?: string;
  childTaskIds: string[];
  whyNow?: string;
  nextStep?: string;
  waitingOn?: string;
  commitment?: string;
  schedule?: string;
  trigger?: string;
  dependencyId?: string;
  dependencyReady?: boolean;
  updatedAt: string;
  state: TaskState;
}

const LANE_LABELS: Record<Lane, string> = {
  escalate: 'Escalate now',
  unblock:  'Unblock or decide',
  continue: 'Continue or review',
  clarify:  'Clarify',
  steady:   'Steady',
};

const LANE_ORDER: Lane[] = ['escalate', 'unblock', 'continue', 'clarify', 'steady'];

type Lens =
  | 'all'
  | 'running' | 'waiting' | 'blocked'
  | 'needsDecision'
  | 'simple' | 'project' | 'scheduled' | 'event'
  | 'done'
  | `project:${string}`;

type ExplorerGroup = 'status' | 'type' | 'files';

const DEFER_OPTIONS = [
  { label: '明天', value: 'tomorrow' },
  { label: '本周末', value: 'weekend' },
  { label: '下周一', value: 'next-monday' },
  { label: '选日期…', value: 'custom' },
];

function deferLabel(value: string): string {
  return DEFER_OPTIONS.find((opt) => opt.value === value)?.label ?? value;
}

/* ─── Map real task record → UI task ─── */

function derivelane(r: TaskListItemRecord): Lane {
  if (r.riskLevel === 'high') return 'escalate';
  if (r.activeDependency) return 'unblock';
  if (r.activeBlocker || r.state === 'waiting_external') return 'unblock';
  if (r.state === 'running') return 'continue';
  if (r.state === 'captured') return 'clarify';
  if (r.riskLevel === 'medium') return 'unblock';
  if (r.state === 'completed' || r.state === 'archived') return 'steady';
  return 'continue';
}

function deriveStatus(r: TaskListItemRecord): TaskStatus {
  if (r.state === 'running') return 'running';
  if (r.state === 'waiting_external') return 'waiting';
  if (r.activeDependency) return 'blocked';
  if (r.activeBlocker) return 'blocked';
  if (r.state === 'completed' || r.state === 'archived') return 'done';
  return 'idle';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  simple:    '一次性',
  project:   '项目',
  scheduled: '定时',
  event:     '事件',
};

const TASK_TYPE_CAPTURE_NEXT_STEP: Record<TaskType, string> = {
  simple: '创建单条任务，进入 Tasks 后可直接执行或继续规划。',
  project: '先创建项目父任务，再由 AI 拆解草稿；确认后才创建真实子任务。',
  scheduled: '先创建单条定时任务，周期和触发条件可在工作台 Header 调整。',
  event: '先创建单条事件触发任务，监听条件可在工作台 Header 调整。',
};

const TASK_TYPE_CAPTURE_HINT: Record<TaskType, string> = {
  simple: '一次性任务创建后可继续规划目标和验收标准',
  project: '项目型任务创建后可让 AI 拆解并自检',
  scheduled: '定时任务创建后可确认周期与执行节奏',
  event: '事件触发任务创建后可确认来源与触发条件',
};

const RISK_OPTIONS: Array<{ label: string; value: TaskRiskLevel }> = [
  { label: '高', value: 'high' },
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' },
  { label: '无', value: 'none' },
];

function fromRecord(r: TaskListItemRecord, attrs?: TaskAttributeRecord | null): Task {
  const inferredType = inferTaskExecutionType(r.title);
  const type = attrs?.type && (attrs.typeConfirmed || attrs.type !== 'simple' || inferredType === 'simple')
    ? attrs.type
    : inferredType;
  return {
    id: r.id,
    title: r.title,
    lane: derivelane(r),
    status: deriveStatus(r),
    type,
    parentTaskId: attrs?.parentTaskId ?? undefined,
    childTaskIds: attrs?.childTaskIds ?? [],
    whyNow: r.summary ?? undefined,
    nextStep: r.nextStep ?? undefined,
    waitingOn: r.activeDependency
      ? r.dependencyReevaluation
        ? `依赖可复核：${r.dependencyReevaluation.upstreamTaskTitle}`
        : `依赖：${r.activeDependency.blockedByTaskTitle ?? r.activeDependency.reason ?? '上游任务'}`
      : r.waitingReason ? `等待：${r.waitingReason}` : undefined,
    dependencyId: r.activeDependency?.id,
    dependencyReady: Boolean(r.dependencyReevaluation),
    commitment: attrs?.commitment ?? undefined,
    schedule: attrs?.schedule ?? undefined,
    trigger: attrs?.trigger ?? undefined,
    updatedAt: formatDate(r.updatedAt),
    state: r.state,
  };
}

function confirmedTaskRecords(records: TaskListItemRecord[]): TaskListItemRecord[] {
  return records.filter((record) => !isUnconfirmedPanelCaptureRecord(record));
}

interface TasksPageProps {
  onOpenPanel: (taskId: string, draftPrompt?: string, taskTitle?: string) => void;
  onOpenWorkbench: (taskId: string) => void;
  onOpenDecision: () => void;
  onSelectionContextChange?: (context: TaskWorkspaceSelectionContext) => void;
  focusTaskId?: string | null;
}

export function TasksPage({ onOpenPanel, onOpenWorkbench, onOpenDecision, onSelectionContextChange, focusTaskId = null }: TasksPageProps) {
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [lens, setLens] = useState<Lens>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('lane');
  const [taskDetailViewMode, setTaskDetailViewMode] = useState<TaskDetailViewMode>('manage');
  const [openGroups, setOpenGroups] = useState<Record<ExplorerGroup, boolean>>({
    status: true,
    type: true,
    files: true,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<SelectedObject>('task-list');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [fileDraft, setFileDraft] = useState('');
  const [fileDirty, setFileDirty] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [fileContentOverrides, setFileContentOverrides] = useState<Record<string, string>>(() => loadTaskFileContentOverrides());
  const [localTaskFiles, setLocalTaskFiles] = useState<Record<string, LocalTaskFileRecord[]>>(() => loadLocalTaskFiles());
  const [pendingFileSwitch, setPendingFileSwitch] = useState<PendingFileSwitch>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<TaskDetail | null>(null);
  const [selectedSources, setSelectedSources] = useState<SourceContextRecord[]>([]);
  const [selectedArtifacts, setSelectedArtifacts] = useState<ArtifactRecord[]>([]);
  const [selectedRuns, setSelectedRuns] = useState<RunRecord[]>([]);
  const [pendingDecisions, setPendingDecisions] = useState<DecisionRecord[]>([]);
  const [deferOpenId, setDeferOpenId] = useState<string | null>(null);
  const [deferConflict, setDeferConflict] = useState<{ task: Task; option: string; count: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
  const [completionCheckTask, setCompletionCheckTask] = useState<Task | null>(null);
  const [projectDraft, setProjectDraft] = useState<{ projectId: string; result: ProjectDecompositionResult } | null>(null);
  const [projectDecomposingId, setProjectDecomposingId] = useState<string | null>(null);
  const [projectCreatingChildrenId, setProjectCreatingChildrenId] = useState<string | null>(null);
  const [projectDecompositionError, setProjectDecompositionError] = useState<string | null>(null);
  const [workHabits, setWorkHabits] = useState<WorkHabitRecord[]>([]);

  const [showCapture, setShowCapture] = useState(false);
  const [captureTitle, setCaptureTitle] = useState('');
  const [captureType, setCaptureType] = useState<TaskType>('simple');
  const [captureTypeTouched, setCaptureTypeTouched] = useState(false);
  const [captureCommitment, setCaptureCommitment] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [capturedTask, setCapturedTask] = useState<CapturedTaskSummary | null>(null);

  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  function reloadTasks() {
    window.api?.listTasks().then((records) => {
      const attrs = loadTaskAttributes();
      setAllTasks(confirmedTaskRecords(records).map((record) => fromRecord(record, attrs[record.id])));
    }).catch(() => {});
  }

  function reloadPendingDecisions() {
    window.api?.listDecisions?.()
      .then((decisions) => setPendingDecisions(decisions.filter((decision) => decision.status === 'pending')))
      .catch(() => {});
  }

  function reloadWorkHabits() {
    void getPersistedWorkHabitStorageSnapshot()
      .then((snapshot) => setWorkHabits(snapshot.habits))
      .catch(() => {});
  }

  function reloadTaskFilesForTask(taskId: string) {
    if (!window.api?.listTaskFiles) return;
    window.api.listTaskFiles(taskId)
      .then((files) => {
        setLocalTaskFiles((current) => ({
          ...current,
          [taskId]: files.map(taskFileRecordToLocalRecord),
        }));
      })
      .catch(() => {});
  }

  function reloadRunsForTask(taskId: string | null = selectedId) {
    if (!taskId || !window.api?.listRuns) {
      setSelectedRuns([]);
      return;
    }
    window.api.listRuns()
      .then((runs) => {
        const taskRuns = runs
          .filter((run) => run.taskId === taskId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setSelectedRuns(taskRuns);
      })
      .catch(() => {
        setSelectedRuns([]);
      });
  }

  function reloadTaskDetailForTask(taskId: string, isCancelled: () => boolean = () => false) {
    if (!window.api?.getTaskDetail) return;
    window.api.getTaskDetail(taskId)
      .then((detail) => {
        if (isCancelled()) return;
        setSelectedTaskDetail(detail);
        const keySources = (detail?.sourceContexts ?? [])
          .filter((source) => source.status === 'active')
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 8);
        setSelectedSources(keySources);
        setSelectedArtifacts(mergeTaskArtifacts(taskId, detail?.artifacts ?? []));
      })
      .catch(() => {});
    reloadTaskFilesForTask(taskId);
    reloadRunsForTask(taskId);
  }

  // Load real tasks from backend when available
  useEffect(() => {
    if (!window.api) return;
    setLoading(true);
    window.api.listTasks()
      .then((records) => {
        const attrs = loadTaskAttributes();
        setAllTasks(confirmedTaskRecords(records).map((record) => fromRecord(record, attrs[record.id])));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    reloadPendingDecisions();
    reloadWorkHabits();

    const unsub = window.api.subscribeToEvents((event) => {
      if (event.type === 'task.changed') {
        reloadTasks();
        if (event.entityId) {
          reloadTaskFilesForTask(event.entityId);
          if (event.entityId === selectedIdRef.current) {
            reloadTaskDetailForTask(event.entityId);
          }
        }
      }
      if (event.type === 'run.changed') reloadRunsForTask();
      if (event.type === 'decision.changed') reloadPendingDecisions();
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (showCapture) reloadWorkHabits();
  }, [showCapture]);

  const projectParents = allTasks.filter((task) => task.type === 'project' && !task.parentTaskId);
  const taskTypeGroups: Array<{ type: TaskType; label: string; lens: Lens; tasks: Task[] }> = [
    { type: 'simple', label: '一次性任务', lens: 'simple', tasks: allTasks.filter((task) => task.type === 'simple') },
    { type: 'project', label: '项目型', lens: 'project', tasks: allTasks.filter((task) => task.type === 'project' && !task.parentTaskId) },
    { type: 'scheduled', label: '定时任务', lens: 'scheduled', tasks: allTasks.filter((task) => task.type === 'scheduled') },
    { type: 'event', label: '事件触发', lens: 'event', tasks: allTasks.filter((task) => task.type === 'event') },
  ];
  const filtered = allTasks.filter((t) => {
    if (lens === 'all') return true;
    if (lens === 'running') return t.status === 'running';
    if (lens === 'waiting') return t.status === 'waiting';
    if (lens === 'blocked') return t.status === 'blocked';
    if (lens === 'needsDecision') return pendingDecisions.some((decision) => decision.taskId === t.id);
    if (lens === 'simple') return t.type === 'simple';
    if (lens === 'project') return t.type === 'project';
    if (lens === 'scheduled') return t.type === 'scheduled';
    if (lens === 'event') return t.type === 'event';
    if (lens === 'done') return t.status === 'done';
    if (lens.startsWith('project:')) {
      const projectId = lens.slice('project:'.length);
      return t.id === projectId || t.parentTaskId === projectId;
    }
    return true;
  });

  const selectedTask = allTasks.find((t) => t.id === selectedId) ?? null;
  const selectedHasDecision = Boolean(selectedTask && pendingDecisions.some((decision) => decision.taskId === selectedTask.id));
  const selectedTaskPlanningPrompt = selectedTask
    ? buildTaskPlanningPrompt(selectedTask.title, selectedTask.type, 'panel')
    : null;
  const captureSopSuggestions = captureTitle.trim()
    ? selectApplicableWorkHabitsFromList(workHabits, {
        taskTitle: captureTitle,
        taskTypeLabel: TASK_TYPE_LABELS[captureType],
        limit: 4,
      }).filter((habit): habit is WorkHabitRecord => habit.source === 'sop')
    : [];
  const capturePhaseItems = buildCapturePhaseItems(
    captureTitle,
    captureType,
    captureTypeTouched,
    captureSopSuggestions.length,
  );

  useEffect(() => {
    let cancelled = false;
    setSelectedTaskDetail(null);
    setSelectedSources([]);
    setSelectedArtifacts([]);
    setSelectedRuns([]);
    if (!selectedId || !window.api?.getTaskDetail) return;

    reloadTaskDetailForTask(selectedId, () => cancelled);

    return () => { cancelled = true; };
  }, [selectedId]);

  function runObjectSwitch(action: () => void) {
    if (!fileDirty) {
      action();
      return;
    }
    setPendingFileSwitch(() => action);
  }

  async function saveFileDraft() {
    if (!selectedFile) return;
    const nextContent = fileDraft;
    setFileContentOverrides((current) => ({ ...current, [selectedFile.id]: nextContent }));
    if (selectedFile.kind === 'task_record' || selectedFile.kind === 'local_file') {
      updateTaskFileContentOverride(selectedFile.id, nextContent);
    }
    if (selectedFile.kind === 'task_record' && window.api?.updateTask) {
      const patch = parseTaskRecordPatch(nextContent);
      if (patch.summary !== undefined || patch.nextStep !== undefined) {
        const updated = await window.api.updateTask({
          id: selectedFile.taskId,
          ...patch,
        }).catch(() => null);
        if (updated) {
          setAllTasks((current) => current.map((task) => (
            task.id === selectedFile.taskId
              ? {
                  ...task,
                  whyNow: updated.summary ?? undefined,
                  nextStep: updated.nextStep ?? undefined,
                  updatedAt: formatDate(updated.updatedAt),
                }
              : task
          )));
          setSelectedTaskDetail((current) => (
            current?.id === selectedFile.taskId
              ? {
                  ...current,
                  summary: updated.summary,
                  nextStep: updated.nextStep,
                  updatedAt: updated.updatedAt,
                }
              : current
          ));
        }
      }
      if (window.api.createTaskFile && window.api.updateTaskFile) {
        const existingTaskRecord = (localTaskFiles[selectedFile.taskId] ?? []).find(isPersistedTaskRecordFile);
        const persisted = existingTaskRecord
          ? await window.api.updateTaskFile({ id: existingTaskRecord.id, content: nextContent }).catch(() => null)
          : await window.api.createTaskFile({
            taskId: selectedFile.taskId,
            name: 'Task.md',
            path: 'Task.md',
            kind: 'file',
            content: nextContent,
          }).catch(() => null);
        if (persisted) {
          const nextFile = taskFileRecordToLocalRecord(persisted);
          setLocalTaskFiles((current) => {
            const withoutOld = (current[selectedFile.taskId] ?? []).filter((file) => file.id !== nextFile.id);
            return {
              ...current,
              [selectedFile.taskId]: [nextFile, ...withoutOld],
            };
          });
        }
      }
    }
    if (selectedFile.kind === 'source' && selectedFile.sourceId && window.api?.updateSourceContext) {
      await window.api.updateSourceContext({ id: selectedFile.sourceId, content: nextContent }).catch(() => undefined);
    }
    if (selectedFile.kind === 'artifact' && selectedFile.artifactId) {
      if (window.api?.updateArtifact) {
        const updated = await window.api.updateArtifact({ id: selectedFile.artifactId, content: nextContent }).catch(() => null);
        if (updated) {
          setSelectedArtifacts((current) => mergeTaskArtifacts(selectedFile.taskId, current.map((artifact) => (
            artifact.id === updated.id ? updated : artifact
          ))));
        }
      } else {
        updateArtifactWorkspace(selectedFile.artifactId, { content: nextContent });
      }
    }
    if (selectedFile.kind === 'local_file') {
      const persisted = window.api?.updateTaskFile
        ? await window.api.updateTaskFile({ id: selectedFile.id, content: nextContent }).catch(() => null)
        : null;
      if (!persisted) {
        updateLocalTaskFile(selectedFile.taskId, selectedFile.id, { content: nextContent });
      }
      const nextFile: LocalTaskFileRecord = persisted
        ? taskFileRecordToLocalRecord(persisted)
        : { ...selectedFile, kind: 'local_file', content: nextContent, updatedAt: new Date().toISOString() };
      setLocalTaskFiles((current) => ({
        ...current,
        [selectedFile.taskId]: (current[selectedFile.taskId] ?? []).map((file) => (
          file.id === selectedFile.id ? { ...file, ...nextFile } : file
        )),
      }));
    }
    setFileDirty(false);
  }

  async function saveAndContinueSwitch() {
    const next = pendingFileSwitch;
    await saveFileDraft();
    setPendingFileSwitch(null);
    next?.();
  }

  function discardAndContinueSwitch() {
    const next = pendingFileSwitch;
    setFileDirty(false);
    setFileDraft(selectedFile?.content ?? '');
    setPendingFileSwitch(null);
    next?.();
  }

  function selectTask(id: string | null) {
    runObjectSwitch(() => {
      setSelectedId(id);
      setSelectedFileId(null);
      setFileDirty(false);
      setFileDraft('');
      setSelectedObject(id ? 'task' : 'task-list');
      setTaskDetailViewMode('manage');
      setDeferOpenId(null);
    });
  }

  function selectLens(nextLens: Lens) {
    runObjectSwitch(() => {
      setLens(nextLens);
      setSelectedId(null);
      setSelectedFileId(null);
      setFileDirty(false);
      setFileDraft('');
      setSelectedObject('task-list');
      setTaskDetailViewMode('manage');
      setDeferOpenId(null);
    });
  }

  useEffect(() => {
    if (!focusTaskId || focusTaskId === selectedId) return;
    selectTask(focusTaskId);
  }, [focusTaskId, selectedId]);

  function handleRowClick(id: string) {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      selectTask(selectedId === id ? null : id);
    }, 180);
  }

  function handleRowDoubleClick(id: string) {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    onOpenWorkbench(id);
  }

  const persistedSelectedTaskFiles = selectedTask ? localTaskFiles[selectedTask.id] ?? [] : [];
  const persistedTaskRecord = persistedSelectedTaskFiles.find(isPersistedTaskRecordFile) ?? null;
  const visiblePersistedTaskFiles = persistedSelectedTaskFiles.filter((file) => !isPersistedTaskRecordFile(file));
  const taskFiles = selectedTask
    ? applyFileOverrides([
      ...buildVirtualTaskFiles(selectedTask, selectedSources, selectedArtifacts, persistedTaskRecord?.content),
      ...visiblePersistedTaskFiles,
    ], fileContentOverrides)
    : [];
  const selectedFile = taskFiles.find((file) => file.id === selectedFileId) ?? null;

  useEffect(() => {
    const selectedFileContext = selectedObject === 'file' && selectedFile
      ? {
          path: selectedFile.path,
          kind: selectedFile.kind,
          dirty: fileDirty,
          contentPreview: truncateFileContext(fileDirty ? fileDraft : selectedFile.content),
        }
      : null;
    onSelectionContextChange?.({
      taskId: selectedTask?.id ?? null,
      taskTitle: selectedTask?.title ?? null,
      selectedFile: selectedFileContext,
    });
  }, [
    fileDirty,
    fileDraft,
    onSelectionContextChange,
    selectedFile?.content,
    selectedFile?.kind,
    selectedFile?.path,
    selectedObject,
    selectedTask?.id,
    selectedTask?.title,
  ]);

  function selectTaskFile(file: VirtualTaskFile) {
    if (file.kind === 'records_folder' || file.kind === 'local_folder') return;
    runObjectSwitch(() => {
      setSelectedId(file.taskId);
      setSelectedFileId(file.id);
      setSelectedObject('file');
      setFileDraft(file.content);
      setFileDirty(false);
    });
  }

  function returnToTaskWorkspace() {
    runObjectSwitch(() => {
      setSelectedObject(selectedId ? 'task' : 'task-list');
      setSelectedFileId(null);
      setFileDraft('');
      setFileDirty(false);
    });
  }

  async function createTaskFile(kind: 'file' | 'folder') {
    if (!selectedTask) return;
    const fallbackName = kind === 'file' ? 'notes.md' : 'drafts/';
    const rawName = window.prompt(kind === 'file' ? '新建文件名' : '新建文件夹名', fallbackName)?.trim();
    if (!rawName) return;
    const normalizedName = kind === 'folder' && !rawName.endsWith('/') ? `${rawName}/` : rawName;
    const persisted = window.api?.createTaskFile
      ? await window.api.createTaskFile({
        taskId: selectedTask.id,
        name: normalizedName,
        kind,
        content: '',
      }).catch(() => null)
      : null;
    const file = persisted
      ? taskFileRecordToLocalRecord(persisted)
      : createLocalTaskFile({
        taskId: selectedTask.id,
        name: normalizedName,
        kind: kind === 'file' ? 'local_file' : 'local_folder',
      });
    setLocalTaskFiles((current) => ({
      ...current,
      [selectedTask.id]: [file, ...(current[selectedTask.id] ?? [])],
    }));
    if (kind === 'file') {
      selectTaskFile(file);
    }
  }

  async function createTaskRecordFile() {
    if (!selectedTask) return;
    const today = new Date().toISOString().slice(0, 10);
    const fallbackName = `${today}-record.md`;
    const rawName = window.prompt('新建任务记录', fallbackName)?.trim();
    if (!rawName) return;
    const normalizedName = rawName.endsWith('.md') ? rawName : `${rawName}.md`;
    const recordPath = normalizedName.includes('/')
      ? normalizedName
      : `Task Records/${normalizedName}`;
    const displayName = recordPath.split('/').filter(Boolean).at(-1) ?? normalizedName;
    const content = [
      `# Record: ${displayName.replace(/\.md$/i, '')}`,
      '',
      '## Trigger',
      '',
      '## Summary',
      '',
      '## Confirmed',
      '',
      '## Open',
      '',
      '## Next',
      '',
      '## Links',
      '',
    ].join('\n');
    const persisted = window.api?.createTaskFile
      ? await window.api.createTaskFile({
        taskId: selectedTask.id,
        name: displayName,
        path: recordPath,
        kind: 'file',
        content,
      }).catch(() => null)
      : null;
    const file = persisted
      ? taskFileRecordToLocalRecord(persisted)
      : createLocalTaskFile({
        taskId: selectedTask.id,
        name: displayName,
        kind: 'local_file',
        content,
      });
    const nextFile = persisted ? file : { ...file, path: recordPath };
    setLocalTaskFiles((current) => ({
      ...current,
      [selectedTask.id]: [nextFile, ...(current[selectedTask.id] ?? [])],
    }));
    selectTaskFile(nextFile);
  }

  async function createArtifactFile() {
    if (!selectedTask) return;
    const title = window.prompt('新建产物文件名', 'notes.md')?.trim();
    if (!title) return;
    const artifact = window.api?.createManualArtifact
      ? await window.api.createManualArtifact({ taskId: selectedTask.id, title, content: '' }).catch(() => null)
      : null;
    const fallbackArtifact = artifact ?? createManualArtifact({ taskId: selectedTask.id, title, content: '' });
    setSelectedArtifacts((current) => mergeTaskArtifacts(selectedTask.id, [fallbackArtifact, ...current]));
    const file = artifactToVirtualFile(fallbackArtifact);
    selectTaskFile(file);
  }

  async function renameSelectedFile() {
    if (!selectedFile) return;
    const nextName = window.prompt('重命名', selectedFile.name)?.trim();
    if (!nextName || nextName === selectedFile.name) return;
    if (selectedFile.kind === 'artifact' && selectedFile.artifactId) {
      if (window.api?.updateArtifact) {
        const updated = await window.api.updateArtifact({ id: selectedFile.artifactId, title: nextName }).catch(() => null);
        if (updated) {
          setSelectedArtifacts((current) => mergeTaskArtifacts(selectedFile.taskId, current.map((artifact) => (
            artifact.id === updated.id ? updated : artifact
          ))));
        }
      } else {
        updateArtifactWorkspace(selectedFile.artifactId, { title: nextName });
        setSelectedArtifacts((current) => mergeTaskArtifacts(selectedFile.taskId, current));
      }
      return;
    }
    if (selectedFile.kind !== 'local_file' && selectedFile.kind !== 'local_folder') return;
    const normalizedName = selectedFile.kind === 'local_folder' && !nextName.endsWith('/') ? `${nextName}/` : nextName;
    const persisted = window.api?.updateTaskFile
      ? await window.api.updateTaskFile({ id: selectedFile.id, name: normalizedName, path: normalizedName }).catch(() => null)
      : null;
    if (!persisted) {
      updateLocalTaskFile(selectedFile.taskId, selectedFile.id, { name: normalizedName, path: normalizedName });
    }
    const nextFile: LocalTaskFileRecord = persisted
      ? taskFileRecordToLocalRecord(persisted)
      : {
        ...selectedFile,
        kind: selectedFile.kind,
        name: normalizedName,
        path: normalizedName,
        updatedAt: new Date().toISOString(),
      };
    setLocalTaskFiles((current) => ({
      ...current,
      [selectedFile.taskId]: (current[selectedFile.taskId] ?? []).map((file) => (
        file.id === selectedFile.id ? { ...file, ...nextFile } : file
      )),
    }));
  }

  async function moveSelectedFile() {
    if (!selectedFile || selectedFile.kind === 'task_record' || selectedFile.kind === 'source') return;
    const nextPath = window.prompt('移动到路径', selectedFile.path)?.trim();
    if (!nextPath || nextPath === selectedFile.path) return;
    const nextName = nextPath.split('/').filter(Boolean).at(-1) ?? selectedFile.name;
    if (selectedFile.kind === 'artifact' && selectedFile.artifactId) {
      if (window.api?.updateArtifact) {
        const updated = await window.api.updateArtifact({ id: selectedFile.artifactId, title: nextName }).catch(() => null);
        if (updated) {
          setSelectedArtifacts((current) => mergeTaskArtifacts(selectedFile.taskId, current.map((artifact) => (
            artifact.id === updated.id ? updated : artifact
          ))));
        }
      } else {
        updateArtifactWorkspace(selectedFile.artifactId, { title: nextName });
        setSelectedArtifacts((current) => mergeTaskArtifacts(selectedFile.taskId, current));
      }
      return;
    }
    if (selectedFile.kind !== 'local_file' && selectedFile.kind !== 'local_folder') return;
    const normalizedPath = selectedFile.kind === 'local_folder' && !nextPath.endsWith('/') ? `${nextPath}/` : nextPath;
    const persisted = window.api?.updateTaskFile
      ? await window.api.updateTaskFile({ id: selectedFile.id, name: nextName, path: normalizedPath }).catch(() => null)
      : null;
    if (!persisted) {
      updateLocalTaskFile(selectedFile.taskId, selectedFile.id, { name: nextName, path: normalizedPath });
    }
    const nextFile: LocalTaskFileRecord = persisted
      ? taskFileRecordToLocalRecord(persisted)
      : {
        ...selectedFile,
        kind: selectedFile.kind,
        name: nextName,
        path: normalizedPath,
        updatedAt: new Date().toISOString(),
      };
    setLocalTaskFiles((current) => ({
      ...current,
      [selectedFile.taskId]: (current[selectedFile.taskId] ?? []).map((file) => (
        file.id === selectedFile.id ? { ...file, ...nextFile } : file
      )),
    }));
  }

  async function deleteSelectedFile() {
    if (!selectedFile || selectedFile.kind === 'task_record' || selectedFile.kind === 'source') return;
    if (!window.confirm(`删除 ${selectedFile.name}？`)) return;
    if (selectedFile.kind === 'artifact' && selectedFile.artifactId) {
      if (window.api?.deleteArtifact) {
        const deleted = await window.api.deleteArtifact(selectedFile.artifactId).catch(() => null);
        if (deleted) {
          setSelectedArtifacts((current) => mergeTaskArtifacts(selectedFile.taskId, current.filter((artifact) => artifact.id !== deleted.id)));
        }
      } else {
        deleteArtifactWorkspace(selectedFile.artifactId);
        setSelectedArtifacts((current) => mergeTaskArtifacts(selectedFile.taskId, current));
      }
    }
    if (selectedFile.kind === 'local_file' || selectedFile.kind === 'local_folder') {
      const deleted = window.api?.deleteTaskFile
        ? await window.api.deleteTaskFile(selectedFile.id).catch(() => null)
        : null;
      if (!deleted) {
        deleteLocalTaskFile(selectedFile.taskId, selectedFile.id);
      }
      setLocalTaskFiles((current) => ({
        ...current,
        [selectedFile.taskId]: (current[selectedFile.taskId] ?? []).filter((file) => file.id !== selectedFile.id),
      }));
    }
    setSelectedObject('task');
    setSelectedFileId(null);
    setFileDraft('');
    setFileDirty(false);
  }

  function handleContextMenu(e: React.MouseEvent, taskId: string) {
    e.preventDefault();
    setSelectedId(null);
    setContextMenu({ x: e.clientX, y: e.clientY, taskId });
  }

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  function toggleGroup(group: ExplorerGroup) {
    setOpenGroups((current) => ({ ...current, [group]: !current[group] }));
  }

  async function transitionWithPlanningHop(task: Task, nextState: TaskState, waitingReason?: string | null) {
    if (!window.api) return;
    if ((task.state === 'captured' || task.state === 'triaged') && nextState !== 'archived') {
      await window.api.transitionTask({ id: task.id, nextState: 'planned' });
    }
    await window.api.transitionTask({ id: task.id, nextState, waitingReason });
  }

  function completeTask(task: Task) {
    setAllTasks((prev) => prev.filter((t) => t.id !== task.id));
    setSelectedId(null);
    transitionWithPlanningHop(task, 'completed').catch(() => reloadTasks());
  }

  function markWaitingAfterCompletionCheck(task: Task, reason: string) {
    setCompletionCheckTask(null);
    setAllTasks((prev) => prev.filter((t) => t.id !== task.id));
    setSelectedId(null);
    transitionWithPlanningHop(task, 'waiting_external', reason).catch(() => reloadTasks());
  }

  function deferTask(task: Task, option: string) {
    setDeferOpenId(null);
    const simulatedCount = option === 'next-monday' ? 4 : 1;
    if (simulatedCount >= 3) {
      setDeferConflict({ task, option, count: simulatedCount });
      return;
    }
    confirmDeferTask(task, deferLabel(option));
  }

  function confirmDeferTask(task: Task, targetLabel: string) {
    setDeferConflict(null);
    setSelectedId(null);
    setAllTasks((prev) => prev.filter((t) => t.id !== task.id));
    transitionWithPlanningHop(task, 'waiting_external', `延后处理：${targetLabel}`).catch(() => reloadTasks());
  }

  function updateTaskRisk(taskId: string, riskLevel: TaskRiskLevel) {
    const nextLane: Lane = riskLevel === 'high'
      ? 'escalate'
      : riskLevel === 'medium'
        ? 'unblock'
        : 'continue';
    setContextMenu(null);
    setSelectedId(taskId);
    setAllTasks((prev) => prev.map((task) => (
      task.id === taskId
        ? { ...task, lane: nextLane, status: riskLevel === 'high' ? 'blocked' : task.status }
        : task
    )));
    window.api?.updateTask({ id: taskId, riskLevel }).catch(() => reloadTasks());
  }

  function archiveTask(taskId: string) {
    const task = allTasks.find((item) => item.id === taskId);
    if (!task) return;
    setContextMenu(null);
    setSelectedId(null);
    setAllTasks((prev) => prev.filter((item) => item.id !== taskId));
    transitionWithPlanningHop(task, 'archived').catch(() => reloadTasks());
  }

  function copyTaskLink(taskId: string) {
    setContextMenu(null);
    const link = `taskplane://task/${taskId}`;
    void navigator.clipboard?.writeText(link).catch(() => {});
  }

  function moveIntoProject(taskId: string, projectId: string | null) {
    const result = moveTaskToProject(taskId, projectId);
    setContextMenu(null);
    setSelectedId(taskId);
    setAllTasks((prev) => prev.map((task) => {
      if (task.id === taskId) {
        return { ...task, parentTaskId: result.task.parentTaskId ?? undefined };
      }
      if (result.previousProject && task.id === result.previousProject.taskId) {
        return { ...task, childTaskIds: result.previousProject.childTaskIds };
      }
      if (result.nextProject && task.id === result.nextProject.taskId) {
        return { ...task, type: 'project', childTaskIds: result.nextProject.childTaskIds };
      }
      return task;
    }));
  }

  async function resolveReadyDependency(task: Task) {
    if (!window.api || !task.dependencyId) return;
    try {
      await window.api.resolveTaskDependency(task.dependencyId);
      setAllTasks((prev) => prev.map((item) => (
        item.id === task.id
          ? {
              ...item,
              dependencyId: undefined,
              dependencyReady: false,
              waitingOn: undefined,
              status: 'idle',
              lane: item.state === 'captured' ? 'clarify' : 'continue',
            }
          : item
      )));
    } catch {
      reloadTasks();
    }
  }

  async function generateProjectDecomposition(project: Task) {
    if (!window.api?.decomposeProject || projectDecomposingId) {
      setProjectDecompositionError('当前版本暂时无法调用 AI 拆解服务。');
      return;
    }
    setProjectDecomposingId(project.id);
    setProjectDecompositionError(null);
    try {
      const result = await window.api.decomposeProject({
        taskId: project.id,
        instructions: buildProjectDecompositionGuidance(project.title),
      });
      setProjectDraft({ projectId: project.id, result });
    } catch (error) {
      setProjectDecompositionError(error instanceof Error ? error.message : 'AI 拆解失败，请稍后重试。');
    } finally {
      setProjectDecomposingId(null);
    }
  }

  async function createProjectChildren(project: Task) {
    if (!window.api || projectCreatingChildrenId) return;
    const draft = projectDraft?.projectId === project.id ? projectDraft.result : null;
    if (!draft) return;
    setProjectCreatingChildrenId(project.id);
    setProjectDecompositionError(null);
    try {
      const childRecords = await Promise.all(draft.subtasks.map((subtask) => window.api!.createTask({
        title: subtask.title,
        summary: subtask.summary,
      })));
      const plannedChildRecords = await Promise.all(childRecords.map((child) => (
        window.api!.transitionTask({ id: child.id, nextState: 'planned' })
      )));
      await Promise.all(childRecords.map((child, index) => window.api!.createCompletionCriteria({
        taskId: child.id,
        text: draft.subtasks[index]?.acceptanceCriteria ?? '完成后能明确验收。',
        verificationResponsibility: 'unknown',
      })));

      const childRecordByTitle = new Map(plannedChildRecords.map((child) => [child.title.trim(), child]));
      await Promise.all(draft.subtasks.map((subtask, index) => {
        const dependencyTitle = subtask.dependency?.trim();
        if (!dependencyTitle) return Promise.resolve(null);
        const dependency = childRecordByTitle.get(dependencyTitle)
          ?? plannedChildRecords.find((child) => dependencyTitle.includes(child.title) || child.title.includes(dependencyTitle));
        const child = plannedChildRecords[index];
        if (!child || !dependency || dependency.id === child.id) return Promise.resolve(null);
        return window.api!.createTaskDependency({
          taskId: child.id,
          blockedByTaskId: dependency.id,
          reason: subtask.dependency,
        });
      }));

      const childIds = [...project.childTaskIds, ...plannedChildRecords.map((child) => child.id)];
      const parentAttrs = saveTaskAttributes(project.id, { childTaskIds: childIds });
      const updatedParent = await window.api.updateTask({
        id: project.id,
        summary: draft.parentGoal,
        nextStep: draft.nextStep,
      });
      await window.api.createSourceContext({
        taskId: project.id,
        title: 'AI 项目拆解自检',
        kind: 'note',
        isKey: true,
        content: draft.review,
        note: `${draft.subtasks.length} 个子任务；用户已确认创建。`,
      });
      await window.api.createCompletionCriteria({
        taskId: project.id,
        text: `完成并验收 ${draft.subtasks.length} 个项目子任务。`,
        verificationResponsibility: 'unknown',
      });
      const childTasks = plannedChildRecords.map((child) => {
        const draftSubtask = draft.subtasks.find((subtask) => subtask.title === child.title);
        const childAttrs = saveTaskAttributes(child.id, {
          type: 'simple',
          typeConfirmed: true,
          parentTaskId: project.id,
        });
        const dependencyTitle = draftSubtask?.dependency?.trim() ?? '';
        const dependency = dependencyTitle
          ? plannedChildRecords.find((candidate) => dependencyTitle.includes(candidate.title) || candidate.title.includes(dependencyTitle))
          : null;
        const baseTask = fromRecord({ ...child, activeBlocker: null, activeWaitingItem: null }, childAttrs);
        return {
          ...baseTask,
          status: dependency ? 'blocked' as const : baseTask.status,
          lane: dependency ? 'unblock' as const : baseTask.lane,
          waitingOn: dependency ? `依赖：${dependency.title}` : baseTask.waitingOn,
        };
      });

      setAllTasks((prev) => {
        const nextParent = prev.map((task) => (
          task.id === project.id
            ? {
                ...fromRecord({
                  ...updatedParent,
                  activeBlocker: null,
                  activeWaitingItem: null,
                  activeDependency: null,
                  dependencyReevaluation: null,
                }, parentAttrs),
                childTaskIds: parentAttrs.childTaskIds,
              }
            : task
        ));
        return [...childTasks, ...nextParent];
      });
      setProjectDraft(null);
    } catch (error) {
      setProjectDecompositionError(error instanceof Error ? error.message : '创建子任务失败，请稍后重试。');
    } finally {
      setProjectCreatingChildrenId(null);
    }
  }

  function groupByLane(tasks: Task[]): Record<Lane, Task[]> {
    const result = {} as Record<Lane, Task[]>;
    LANE_ORDER.forEach((lane) => { result[lane] = []; });
    tasks.forEach((t) => result[t.lane].push(t));
    return result;
  }

  function resetCaptureDraft() {
    setCaptureTitle('');
    setCaptureType('simple');
    setCaptureTypeTouched(false);
    setCaptureCommitment('');
  }

  async function captureTask() {
    const title = captureTitle.trim();
    if (!title || capturing) return;
    setCapturing(true);
    try {
      let newId: string;
      const selectedType = captureType;
      if (window.api) {
        const record = await window.api.createTask({ title });
        newId = record.id;
        const plannedRecord = await window.api.transitionTask({ id: record.id, nextState: 'planned' });
        const attrs = saveTaskAttributes(newId, {
          type: selectedType,
          typeConfirmed: true,
          commitment: captureCommitment,
          schedule: defaultScheduleForType(selectedType),
          trigger: defaultTriggerForType(selectedType),
        });
        setAllTasks((prev) => [fromRecord({ ...plannedRecord, activeBlocker: null, activeWaitingItem: null }, attrs), ...prev]);
      } else {
        newId = `t-${Date.now()}`;
        const attrs = saveTaskAttributes(newId, {
          type: selectedType,
          typeConfirmed: true,
          commitment: captureCommitment,
          schedule: defaultScheduleForType(selectedType),
          trigger: defaultTriggerForType(selectedType),
        });
        const fake: Task = {
          id: newId, title, lane: 'clarify', status: 'idle',
          type: attrs.type,
          childTaskIds: attrs.childTaskIds,
          commitment: attrs.commitment ?? undefined,
          schedule: attrs.schedule ?? undefined,
          trigger: attrs.trigger ?? undefined,
          updatedAt: new Date().toLocaleDateString('zh'),
          state: 'planned',
        };
        setAllTasks((prev) => [fake, ...prev]);
      }
      resetCaptureDraft();
      setShowCapture(false);
      setCapturedTask({ id: newId, title, type: selectedType });
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="tasks-page" onClick={closeContextMenu}>
      <aside className="lenses-rail task-resource-explorer">
        <div className="task-explorer-head">
          <span>Tasks</span>
          <button className="icon-btn" aria-label="+ 新建任务" title="新建任务" onClick={() => {
            setShowCapture((visible) => {
              if (visible) resetCaptureDraft();
              return !visible;
            });
          }}>+</button>
        </div>

        <ExplorerGroupHeader label="执行状态" open={openGroups.status} onClick={() => toggleGroup('status')} />
        {openGroups.status && (
          <>
            <LensItem label="全部任务" active={lens === 'all'} onClick={() => selectLens('all')} count={allTasks.length} icon="•" />
            <LensItem label="Running" active={lens === 'running'} onClick={() => selectLens('running')}
              dot="running" count={allTasks.filter(t => t.status === 'running').length} />
            <LensItem label="Waiting" active={lens === 'waiting'} onClick={() => selectLens('waiting')}
              dot="waiting" count={allTasks.filter(t => t.status === 'waiting').length} />
            <LensItem label="Blocked" active={lens === 'blocked'} onClick={() => selectLens('blocked')}
              dot="risk" count={allTasks.filter(t => t.status === 'blocked').length} />
            <LensItem label="Needs Decision" active={lens === 'needsDecision'} onClick={() => selectLens('needsDecision')} icon="?"
              count={pendingDecisions.length} />
            <LensItem label="Completed / Archived" active={lens === 'done'} onClick={() => selectLens('done')} icon="▣"
              count={allTasks.filter(t => t.status === 'done').length} />
          </>
        )}

        <ExplorerGroupHeader label="任务类型" open={openGroups.type} onClick={() => toggleGroup('type')} />
        {openGroups.type && (
          <div className="task-type-tree">
            {taskTypeGroups.map((group) => (
              <div className="task-type-group" key={group.type}>
                <LensItem
                  label={group.label}
                  active={lens === group.lens}
                  onClick={() => selectLens(group.lens)}
                  icon={group.type === 'simple' ? '•' : group.type === 'project' ? '▰' : group.type === 'scheduled' ? '↻' : '⚡'}
                  count={group.tasks.length}
                />
                {group.tasks.length > 0 && (
                  <div className="task-type-children">
                    {group.tasks.slice(0, 12).map((task) => (
                      <TaskExplorerTreeItem
                        key={task.id}
                        task={task}
                        allTasks={allTasks}
                        selectedId={selectedId}
                        selectedObject={selectedObject}
                        onSelect={selectTask}
                      />
                    ))}
                  </div>
                )}
                {group.tasks.length > 12 && (
                  <button className="task-type-more" onClick={() => selectLens(group.lens)}>
                    还有 {group.tasks.length - 12} 个，点击查看全部
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <ExplorerGroupHeader label="任务文件" open={openGroups.files} onClick={() => toggleGroup('files')} />
        {openGroups.files && (
          <>
            {selectedTask && (
              <div className="task-file-tools">
                <input
                  className="task-file-search"
                  value={fileSearch}
                  onChange={(event) => setFileSearch(event.target.value)}
                  placeholder="搜索文件"
                />
                <div className="task-file-tool-row">
                  <button className="btn sm ghost" onClick={() => void createTaskFile('file')}>文件</button>
                  <button className="btn sm ghost" onClick={() => void createTaskFile('folder')}>文件夹</button>
                  <button className="btn sm ghost" onClick={() => void createTaskRecordFile()}>记录</button>
                  <button className="btn sm ghost" onClick={createArtifactFile}>产物</button>
                </div>
              </div>
            )}
            <div className="task-file-tree">
              {!selectedTask && <div className="task-explorer-empty">选择任务后显示文件</div>}
              {selectedTask && taskFiles.filter((file) => (
                !fileSearch.trim()
                || file.path.toLowerCase().includes(fileSearch.trim().toLowerCase())
              )).map((file) => (
                <button
                  key={file.id}
                  className={`task-file-item${selectedFileId === file.id ? ' active' : ''}${file.kind === 'records_folder' || file.kind === 'local_folder' ? ' folder' : ''}`}
                  onClick={() => selectTaskFile(file)}
                  disabled={file.kind === 'records_folder' || file.kind === 'local_folder'}
                  title={file.path}
                >
                  <span>{file.kind === 'records_folder' || file.kind === 'local_folder' ? '▸' : file.kind === 'source' ? '◇' : file.kind === 'artifact' ? '◆' : '•'}</span>
                  <span>{file.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      <div className="tasks-main">
        <div className="tasks-toolbar">
          {selectedObject === 'file' && selectedFile ? (
            <FileHeader
              file={selectedFile}
              dirty={fileDirty}
              onBack={returnToTaskWorkspace}
              onSave={saveFileDraft}
              onRename={renameSelectedFile}
              onMove={moveSelectedFile}
              onDelete={deleteSelectedFile}
            />
          ) : selectedObject === 'task' && selectedTask ? (
            <div className="view-switcher">
              {([
                ['manage', '任务管理'],
                ['timeline', '时间线'],
              ] as Array<[TaskDetailViewMode, string]>).map(([mode, label]) => (
                <button
                  key={mode}
                  className={`view-btn${taskDetailViewMode === mode ? ' active' : ''}`}
                  onClick={() => setTaskDetailViewMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div className="view-switcher">
              {(['lane', 'list', 'timeline'] as ViewMode[]).map((m) => (
                <button
                  key={m}
                  className={`view-btn${viewMode === m ? ' active' : ''}`}
                  onClick={() => setViewMode(m)}
                >
                  {m === 'lane' ? 'Default Sort' : m === 'list' ? 'All List' : 'Timeline'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Capture form */}
        {showCapture && (
          <div className="capture-form">
            <input
              className="capture-input"
              autoFocus
              placeholder="任务标题… (Enter 快速创建)"
              value={captureTitle}
              onChange={(e) => {
                const nextTitle = e.target.value;
                setCaptureTitle(nextTitle);
                if (!captureTypeTouched) {
                  setCaptureType(inferTaskExecutionType(nextTitle));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void captureTask(); }
                if (e.key === 'Escape') {
                  setShowCapture(false);
                  resetCaptureDraft();
                }
              }}
            />
            <div className="capture-type-suggestion">
              <span>{captureTypeTouched ? '用户确认类型' : 'AI 建议类型'}</span>
              <strong>{TASK_TYPE_LABELS[captureType]}</strong>
            </div>
            <div className="capture-type-row">
              {(['simple', 'project', 'scheduled', 'event'] as TaskType[]).map((type) => (
                <button
                  key={type}
                  className={`capture-type-btn${captureType === type ? ' active' : ''}`}
                  onClick={() => {
                    setCaptureType(type);
                    setCaptureTypeTouched(true);
                  }}
                >
                  {TASK_TYPE_LABELS[type]}
                </button>
              ))}
              <input
                className="capture-commitment-input"
                placeholder="交付备注（可选）"
                value={captureCommitment}
                onChange={(e) => setCaptureCommitment(e.target.value)}
              />
            </div>
            <div className="capture-type-note">
              类型由 AI 根据标题预判，你只需要确认或调整建议；点击创建即确认当前建议。定时/事件会先创建单条任务，周期和触发条件可在工作台 Header 调整；项目型先生成拆解草稿，确认后才创建真实子任务。
            </div>
            <div className="capture-phase-flow" aria-label="任务创建阶段">
              {capturePhaseItems.map((item, index) => (
                <div key={item.label} className={`capture-phase-item${item.active ? ' active' : ''}`}>
                  <span className="capture-phase-index">{index + 1}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
            {captureSopSuggestions.length > 0 && (
              <div className="capture-sop-suggestions">
                <span>可参考流程模板</span>
                {captureSopSuggestions.slice(0, 2).map((habit) => (
                  <strong key={habit.id}>{habit.rule}</strong>
                ))}
                <small>创建后 AI 会在规划讨论中建议是否加载，不会自动套用。</small>
              </div>
            )}
            <div className="capture-actions">
              <button className={`btn sm primary${capturing ? ' disabled' : ''}`} onClick={() => void captureTask()} disabled={!captureTitle.trim() || capturing}>
                {capturing ? '创建中…' : '创建'}
              </button>
              <button className="btn sm ghost" onClick={() => {
                setShowCapture(false);
                resetCaptureDraft();
              }}>
                取消
              </button>
              <span className="capture-ai-hint muted">
                {TASK_TYPE_CAPTURE_HINT[captureType]}
              </span>
            </div>
          </div>
        )}

        {/* Post-capture AI nudge */}
        {capturedTask && (
          <div className="capture-nudge">
            <span>✓ 已创建</span>
            <button className="btn sm primary" onClick={() => {
              const followup = buildTaskPlanningPrompt(capturedTask.title, capturedTask.type);
              onOpenPanel(capturedTask.id, followup.prompt, capturedTask.title);
              setCapturedTask(null);
            }}>
              {buildTaskPlanningPrompt(capturedTask.title, capturedTask.type).label} →
            </button>
            <button className="icon-btn" style={{ marginLeft: 4 }} onClick={() => setCapturedTask(null)} title="关闭">
              <span style={{ fontSize: 12, lineHeight: 1 }}>×</span>
            </button>
          </div>
        )}

        <div className="task-list">
          {selectedObject === 'file' && selectedFile ? (
            <FileWorkspace
              file={selectedFile}
              draft={fileDraft}
              dirty={fileDirty}
              onChange={(value) => {
                setFileDraft(value);
                setFileDirty(value !== selectedFile.content);
              }}
            />
          ) : selectedObject === 'task' && selectedTask && taskDetailViewMode === 'timeline' ? (
            <TaskTimelineView
              task={selectedTask}
              timeline={selectedTaskDetail?.timeline ?? []}
              runCount={selectedRuns.length}
            />
          ) : selectedObject === 'task' && selectedTask ? (
            <TaskPreview
              task={selectedTask}
              childTasks={allTasks.filter((candidate) => candidate.parentTaskId === selectedTask.id)}
              completionCriteria={selectedTaskDetail?.completionCriteria ?? []}
              taskFiles={taskFiles}
              artifactCount={selectedArtifacts.length}
              projectDraft={projectDraft?.projectId === selectedTask.id ? projectDraft.result : null}
              projectBusy={projectDecomposingId === selectedTask.id}
              projectCreating={projectCreatingChildrenId === selectedTask.id}
              projectError={projectDecompositionError}
              keySources={selectedSources.slice(0, 3)}
              hasPendingDecision={selectedHasDecision}
              planningLabel={selectedTaskPlanningPrompt?.label ?? '规划讨论'}
              onOpenPanel={() => {
                if (!selectedTaskPlanningPrompt) return;
                onOpenPanel(selectedTask.id, selectedTaskPlanningPrompt.prompt, selectedTask.title);
              }}
              activityTimeline={selectedTaskDetail?.timeline ?? []}
              runCount={selectedRuns.length}
              onOpenWorkbench={() => onOpenWorkbench(selectedTask.id)}
              onOpenDecision={onOpenDecision}
              deferOpen={deferOpenId === selectedTask.id}
              onDeferToggle={() => setDeferOpenId((prev) => (prev === selectedTask.id ? null : selectedTask.id))}
              onDeferSelect={(option) => deferTask(selectedTask, option)}
              onComplete={() => setCompletionCheckTask(selectedTask)}
              onMore={(event) => handleContextMenu(event, selectedTask.id)}
              onResolveDependency={() => resolveReadyDependency(selectedTask)}
              onGenerateDecomposition={() => generateProjectDecomposition(selectedTask)}
              onCreateDraftChildren={() => createProjectChildren(selectedTask)}
              onDiscardDraft={() => setProjectDraft((current) => (
                current?.projectId === selectedTask.id ? null : current
              ))}
            />
          ) : lens === 'project' ? (
            <ProjectTreeView
              projects={projectParents}
              tasks={allTasks}
              selectedId={selectedId}
              deferOpenId={deferOpenId}
              onRowClick={handleRowClick}
              onRowDoubleClick={handleRowDoubleClick}
              onContextMenu={handleContextMenu}
              onDeferToggle={(task) => setDeferOpenId((prev) => (prev === task.id ? null : task.id))}
              onDeferSelect={deferTask}
              onComplete={(task) => setCompletionCheckTask(task)}
              onMore={(event, task) => handleContextMenu(event, task.id)}
              onResolveDependency={resolveReadyDependency}
              projectDraft={projectDraft}
              decomposingId={projectDecomposingId}
              creatingChildrenId={projectCreatingChildrenId}
              decompositionError={projectDecompositionError}
              onGenerateDecomposition={generateProjectDecomposition}
              onCreateDraftChildren={createProjectChildren}
              onDiscardDraft={(project) => setProjectDraft((current) => (
                current?.projectId === project.id ? null : current
              ))}
            />
          ) : viewMode === 'lane' ? (
            LANE_ORDER.map((lane) => {
              const group = groupByLane(filtered)[lane];
              if (group.length === 0) return null;
              return (
                <div key={lane} className="lane-group">
                  <div className="lane-group-header">
                    <span className={`tag lane-${lane}`}>{LANE_LABELS[lane]}</span>
                    <span className="lane-count">{group.length}</span>
                  </div>
                  {group.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={selectedId === task.id}
                      deferOpen={deferOpenId === task.id}
                      onClick={() => handleRowClick(task.id)}
                      onDoubleClick={() => handleRowDoubleClick(task.id)}
                      onContextMenu={(e) => handleContextMenu(e, task.id)}
                      onDeferToggle={(e) => { e.stopPropagation(); setDeferOpenId((prev) => (prev === task.id ? null : task.id)); }}
                      onDeferSelect={(opt) => deferTask(task, opt)}
                      onComplete={(e) => { e.stopPropagation(); setCompletionCheckTask(task); }}
                      onMore={(e) => { e.stopPropagation(); handleContextMenu(e, task.id); }}
                      onResolveDependency={(item) => resolveReadyDependency(item)}
                    />
                  ))}
                </div>
              );
            })
          ) : viewMode === 'timeline' ? (
            <TimelineView tasks={filtered} onOpen={onOpenWorkbench} />
          ) : (
            filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={selectedId === task.id}
                deferOpen={deferOpenId === task.id}
                onClick={() => handleRowClick(task.id)}
                onDoubleClick={() => handleRowDoubleClick(task.id)}
                onContextMenu={(e) => handleContextMenu(e, task.id)}
                onDeferToggle={(e) => {
                  e.stopPropagation();
                  setDeferOpenId((prev) => (prev === task.id ? null : task.id));
                }}
                onDeferSelect={(opt) => deferTask(task, opt)}
                onComplete={(e) => {
                  e.stopPropagation();
                  setCompletionCheckTask(task);
                }}
                onMore={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e, task.id);
                }}
                onResolveDependency={(item) => resolveReadyDependency(item)}
              />
            ))
          )}
          {selectedObject === 'task-list' && filtered.length === 0 && !loading && (
            <div className="tasks-empty">
              {allTasks.length === 0
                ? <><p>还没有任何任务。</p><p className="muted" style={{ marginTop: 4, fontSize: 12 }}>点击左侧「+」开始捕获你的第一个任务。</p></>
                : <p>当前视角下没有任务。</p>
              }
            </div>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          task={allTasks.find((task) => task.id === contextMenu.taskId) ?? null}
          projects={projectParents}
          onClose={closeContextMenu}
          onOpenWorkbench={() => { onOpenWorkbench(contextMenu.taskId); closeContextMenu(); }}
          onMoveToProject={(projectId) => moveIntoProject(contextMenu.taskId, projectId)}
          onUpdateRisk={(riskLevel) => updateTaskRisk(contextMenu.taskId, riskLevel)}
          onArchive={() => archiveTask(contextMenu.taskId)}
          onCopyLink={() => copyTaskLink(contextMenu.taskId)}
        />
      )}

      {deferConflict && (
        <div className="modal-backdrop" onClick={() => setDeferConflict(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>目标日已比较饱满</h3>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                下周一已有 {deferConflict.count} 件任务，继续安排到周一还是移到周二？
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn sm" onClick={() => setDeferConflict(null)}>
                取消
              </button>
              <button
                className="btn sm"
                onClick={() => confirmDeferTask(deferConflict.task, deferLabel(deferConflict.option))}
              >
                周一
              </button>
              <button
                className="btn sm primary"
                onClick={() => confirmDeferTask(deferConflict.task, '周二')}
              >
                周二
              </button>
              <button
                className="btn sm ghost"
                onClick={() => {
                  const taskId = deferConflict.task.id;
                  setDeferConflict(null);
                  setSelectedId(taskId);
                  setDeferOpenId(taskId);
                }}
              >
                我来选
              </button>
            </div>
          </div>
        </div>
      )}

      {completionCheckTask && (
        <TaskCompletionCheckModal
          taskId={completionCheckTask.id}
          taskTitle={completionCheckTask.title}
          onCancel={() => setCompletionCheckTask(null)}
          onCompleteAnyway={() => {
            const task = completionCheckTask;
            if (!task) return;
            setCompletionCheckTask(null);
            completeTask(task);
          }}
          onMarkWaiting={(reason) => {
            const task = completionCheckTask;
            if (!task) return;
            markWaitingAfterCompletionCheck(task, reason);
          }}
        />
      )}

      {pendingFileSwitch && (
        <div className="modal-backdrop" onClick={() => setPendingFileSwitch(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>文件有未保存修改</h3>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                先保存、放弃修改，或取消本次切换。
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn sm" onClick={() => setPendingFileSwitch(null)}>取消</button>
              <button className="btn sm ghost" onClick={discardAndContinueSwitch}>放弃修改</button>
              <button className="btn sm primary" onClick={() => void saveAndContinueSwitch()}>保存并继续</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildVirtualTaskFiles(
  task: Task,
  sources: SourceContextRecord[],
  artifacts: ArtifactRecord[],
  persistedTaskRecordContent?: string,
): VirtualTaskFile[] {
  const taskRecord = persistedTaskRecordContent ?? [
    '# Task',
    '',
    '## Goal',
    task.title,
    '',
    '## Current Progress',
    task.whyNow ?? 'No summary recorded yet.',
    '',
    '## Key Context',
    sources.length ? sources.map((source) => `- ${source.title}${source.note ? `: ${source.note}` : ''}`).join('\n') : 'No key files or sources linked yet.',
    '',
    '## Decisions',
    'No durable decisions recorded in this task file yet.',
    '',
    '## Constraints',
    task.waitingOn ?? 'No active constraint recorded.',
    '',
    '## Open Questions',
    'No open questions recorded yet.',
    '',
    '## Next Step',
    task.nextStep ?? 'Clarify the next step.',
    '',
    '## Important Files',
    sources.length ? sources.map((source) => `- ${source.title}`).join('\n') : 'No important files linked yet.',
    '',
    '## Recent Records',
    'Task Records/ is ready for durable handoffs and milestone notes.',
    '',
  ].join('\n');

  return [
    {
      id: `${task.id}:task-md`,
      taskId: task.id,
      name: 'Task.md',
      path: 'Task.md',
      kind: 'task_record',
      content: taskRecord,
      editable: true,
    },
    {
      id: `${task.id}:records`,
      taskId: task.id,
      name: 'Task Records/',
      path: 'Task Records/',
      kind: 'records_folder',
      content: '',
      editable: false,
    },
    ...sources.map((source) => sourceToVirtualFile(task.id, source)),
    ...artifacts.map(artifactToVirtualFile),
  ];
}

function parseTaskRecordPatch(content: string): Pick<UpdateTaskInput, 'summary' | 'nextStep'> {
  const summary = normalizeTaskRecordSection(readMarkdownSection(content, 'Current Progress'), [
    'No summary recorded yet.',
  ]);
  const nextStep = normalizeTaskRecordSection(readMarkdownSection(content, 'Next Step'), [
    'Clarify the next step.',
  ]);
  const patch: Pick<UpdateTaskInput, 'summary' | 'nextStep'> = {};
  if (summary !== undefined) patch.summary = summary;
  if (nextStep !== undefined) patch.nextStep = nextStep;
  return patch;
}

function readMarkdownSection(content: string, heading: string): string | undefined {
  const expectedHeading = `## ${heading.toLowerCase()}`;
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.trim().toLowerCase() === expectedHeading);
  if (start === -1) return undefined;

  const section: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^##\s+/.test(line.trim())) break;
    section.push(line);
  }
  return section.join('\n').trim();
}

function normalizeTaskRecordSection(value: string | undefined, placeholders: string[]): string | null | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || placeholders.includes(normalized)) return null;
  return normalized;
}

function artifactToVirtualFile(artifact: ArtifactRecord): VirtualTaskFile {
  return {
    id: `${artifact.taskId}:artifact:${artifact.id}`,
    taskId: artifact.taskId,
    name: artifact.title,
    path: `Artifacts/${artifact.title}`,
    kind: 'artifact',
    artifactId: artifact.id,
    content: artifact.content,
    editable: artifact.kind === 'note' || artifact.title.endsWith('.md') || artifact.title.endsWith('.txt'),
  };
}

function applyFileOverrides(files: VirtualTaskFile[], overrides: Record<string, string>): VirtualTaskFile[] {
  return files.map((file) => overrides[file.id] == null ? file : { ...file, content: overrides[file.id] });
}

function taskFileRecordToLocalRecord(record: TaskFileRecord): LocalTaskFileRecord {
  return {
    id: record.id,
    taskId: record.taskId,
    name: record.name,
    path: record.path,
    kind: record.kind === 'folder' ? 'local_folder' : 'local_file',
    content: record.content,
    editable: record.kind === 'file',
    updatedAt: record.updatedAt,
  };
}

function isPersistedTaskRecordFile(file: LocalTaskFileRecord): boolean {
  return file.path === 'Task.md';
}

function truncateFileContext(value: string, limit = 1600): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}...` : trimmed;
}

function sourceToVirtualFile(taskId: string, source: SourceContextRecord): VirtualTaskFile {
  const isTaskRecord = source.title === '会话刷新前保全'
    || source.title === '阶段收尾记录'
    || source.note?.startsWith('任务记录：');
  return {
    id: `${taskId}:source:${source.id}`,
    taskId,
    name: `${source.title}.md`,
    path: isTaskRecord ? `Task Records/${source.title}.md` : `Sources/${source.title}.md`,
    kind: 'source',
    sourceId: source.id,
    content: [
      `# ${source.title}`,
      '',
      source.uri ? `URI: ${source.uri}` : null,
      source.note ? `Note: ${source.note}` : null,
      '',
      source.content ?? 'No content captured for this source yet.',
      '',
    ].filter(Boolean).join('\n'),
    editable: true,
  };
}

function FileHeader({
  file,
  dirty,
  onBack,
  onSave,
  onRename,
  onMove,
  onDelete,
}: {
  file: VirtualTaskFile;
  dirty: boolean;
  onBack: () => void;
  onSave: () => void | Promise<void>;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const immutableFile = file.kind === 'task_record' || file.kind === 'source';
  return (
    <div className="file-workspace-header">
      <button className="btn sm ghost" onClick={onBack}>返回任务</button>
      <div className="file-tab active">
        <span>{file.name}</span>
        {dirty && <span className="file-dirty">•</span>}
      </div>
      <span className="file-path">{file.path}</span>
      <button className="btn sm ghost" onClick={onRename} disabled={immutableFile}>重命名</button>
      <button className="btn sm ghost" onClick={onMove} disabled={immutableFile}>移动</button>
      <button className="btn sm ghost" onClick={onDelete} disabled={immutableFile}>删除</button>
      <button className="btn sm primary" onClick={() => void onSave()} disabled={!dirty}>保存</button>
    </div>
  );
}

function ExplorerGroupHeader({
  label,
  open,
  onClick,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button className="lens-group-toggle" onClick={onClick} aria-expanded={open}>
      <span>{open ? '▾' : '▸'}</span>
      <span>{label}</span>
    </button>
  );
}

function FileWorkspace({
  file,
  draft,
  dirty,
  onChange,
}: {
  file: VirtualTaskFile;
  draft: string;
  dirty: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="file-workspace">
      <div className="file-workspace-meta">
        <span>{file.kind === 'task_record' ? 'Primary task record' : file.kind === 'source' ? 'Projected source context' : file.kind === 'artifact' ? 'Projected artifact' : 'Task file'}</span>
        <span>{file.editable ? (dirty ? 'Unsaved changes' : 'Saved') : 'Read-only preview'}</span>
      </div>
      {!file.editable && (
        <div className="file-readonly-note">
          此文件当前仅支持只读预览；非文本或受保护文件不会在 v1 中强制内联编辑。
        </div>
      )}
      <textarea
        className="file-editor"
        value={draft}
        onChange={(event) => onChange(event.target.value)}
        readOnly={!file.editable}
        spellCheck={false}
      />
    </div>
  );
}

function TaskTimelineView({
  task,
  timeline,
  runCount,
}: {
  task: Task;
  timeline: TimelineEventRecord[];
  runCount: number;
}) {
  const ordered = [...timeline].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="task-timeline-workspace">
      <div className="task-preview-head">
        <span className={`tag lane-${task.lane}`}>{LANE_LABELS[task.lane]}</span>
        <h3 className="task-preview-title">{task.title}</h3>
        <div className="task-preview-type-row">
          <span className="tag">{TASK_TYPE_LABELS[task.type]}</span>
          {runCount > 0 && <span className="preview-type-hint">{runCount} 条执行记录</span>}
        </div>
      </div>

      <div className="preview-section">
        <div className="preview-label">时间线</div>
        {ordered.length === 0 ? (
          <div className="tasks-empty compact">
            <p>当前任务还没有活动记录。</p>
          </div>
        ) : (
          <div className="task-timeline-list">
            {ordered.map((event) => (
              <div key={event.id} className="task-timeline-item">
                <span className="task-timeline-time">{formatIsoDate(event.createdAt)}</span>
                <div>
                  <strong>{formatTimelineEventType(event.type)}</strong>
                  {summarizeTimelinePayload(event) && <p>{summarizeTimelinePayload(event)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatIsoDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatTimelineEventType(type: string): string {
  const labels: Record<string, string> = {
    'task.created': '任务已创建',
    'task.updated': '任务信息已更新',
    'task.transitioned': '任务状态已变化',
    'completion_criteria.created': '完成标准已添加',
    'completion_criteria.satisfied': '完成标准已满足',
    'completion_check.recorded': '完成检查已记录',
    'decision.created': '拍板项已创建',
    'run.started': '执行已启动',
    'run.completed': '执行已完成',
    'artifact.created': '产物已生成',
    'source_context.created': '来源已记录',
  };
  return labels[type] ?? type.replace(/[._-]+/g, ' ');
}

function formatTaskStatus(status: TaskStatus): string {
  if (status === 'running') return 'Running';
  if (status === 'waiting') return 'Waiting';
  if (status === 'blocked') return 'Blocked';
  if (status === 'done') return 'Completed';
  return 'Idle';
}

function summarizeTimelinePayload(event: TimelineEventRecord): string | null {
  if (!event.payload) return null;
  try {
    const parsed = JSON.parse(event.payload) as Record<string, unknown>;
    if (event.type === 'task.transitioned') {
      const from = typeof parsed.from === 'string' ? parsed.from : null;
      const to = typeof parsed.to === 'string' ? parsed.to : null;
      if (from && to) return `${from} → ${to}`;
    }
    if (event.type === 'task.created' && typeof parsed.title === 'string') {
      return `创建「${parsed.title}」`;
    }
    if (event.type === 'task.updated') {
      const fields = Object.keys(parsed).filter((key) => parsed[key] != null);
      if (fields.length > 0) return `更新 ${fields.slice(0, 3).join(', ')}`;
    }
    if (event.type.startsWith('completion_criteria') && typeof parsed.text === 'string') {
      return parsed.text;
    }
  } catch {
    return event.payload.length > 96 ? `${event.payload.slice(0, 96)}…` : event.payload;
  }
  return event.payload.length > 96 ? `${event.payload.slice(0, 96)}…` : event.payload;
}

/* ─── Timeline view ─── */

function TimelineView({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const grouped = new Map<string, Task[]>();
  for (const t of [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const key = t.updatedAt;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }

  if (tasks.length === 0) return null;

  return (
    <div className="timeline-view">
      {[...grouped.entries()].map(([date, group]) => (
        <div key={date} className="timeline-group">
          <div className="timeline-date">{date}</div>
          <div className="timeline-items">
            {group.map((task) => (
              <div key={task.id} className="timeline-item" onClick={() => onOpen(task.id)}>
                <div className={`timeline-dot ${task.status}`} />
                <div className="timeline-content">
                  <span className="timeline-title">{task.title}</span>
                  <span className={`tag lane-${task.lane}`} style={{ fontSize: 10, marginLeft: 8 }}>
                    {LANE_LABELS[task.lane]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Lens item ─── */

interface LensItemProps {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
  dot?: string;
  icon?: string;
}

function LensItem({ label, active, onClick, count, dot, icon }: LensItemProps) {
  return (
    <button className={`lens-item${active ? ' active' : ''}`} onClick={onClick}>
      {dot && <span className={`dot ${dot}`} />}
      {icon && <span className="lens-icon">{icon}</span>}
      <span className="lens-label">{label}</span>
      {count != null && count > 0 && (
        <span className="lens-count">{count}</span>
      )}
    </button>
  );
}

function TaskExplorerTreeItem({
  task,
  allTasks,
  selectedId,
  selectedObject,
  onSelect,
}: {
  task: Task;
  allTasks: Task[];
  selectedId: string | null;
  selectedObject: SelectedObject;
  onSelect: (id: string) => void;
}) {
  const children = allTasks
    .filter((candidate) => candidate.parentTaskId === task.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="task-type-node">
      <button
        className={`task-explorer-task${selectedId === task.id && selectedObject !== 'file' ? ' active' : ''}`}
        aria-label={task.title}
        onClick={() => onSelect(task.id)}
        title={task.title}
      >
        <span className={`dot ${statusDot(task.status)}`} />
        <span className="task-explorer-title-visual" data-title={task.title} aria-hidden="true" />
      </button>
      {children.length > 0 && (
        <div className="task-type-children nested">
          {children.map((child) => (
            <button
              key={child.id}
              className={`task-explorer-task child${selectedId === child.id && selectedObject !== 'file' ? ' active' : ''}`}
              aria-label={child.title}
              onClick={() => onSelect(child.id)}
              title={child.title}
            >
              <span className={`dot ${statusDot(child.status)}`} />
              <span className="task-explorer-title-visual" data-title={child.title} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function buildCapturePhaseItems(title: string, type: TaskType, typeTouched: boolean, sopSuggestionCount: number): Array<{
  label: string;
  detail: string;
  active: boolean;
}> {
  const hasTitle = Boolean(title.trim());
  return [
    {
      label: '捕获意图',
      detail: hasTitle
        ? '已根据标题形成初步任务意图，后续可在右侧面板继续补上下文。'
        : '先写下任务目标或外部线索，AI 会根据标题预判类型。',
      active: true,
    },
    {
      label: '确认类型',
      detail: hasTitle
        ? typeTouched
          ? `你已确认为${TASK_TYPE_LABELS[type]}任务，可继续调整或直接创建。`
          : `AI 建议为${TASK_TYPE_LABELS[type]}任务，你只需要确认或调整建议。`
        : '输入标题后会给出一次性 / 项目 / 定时 / 事件建议。',
      active: hasTitle,
    },
    {
      label: '创建后推进',
      detail: sopSuggestionCount > 0
        ? `${TASK_TYPE_CAPTURE_NEXT_STEP[type]} 已发现可参考流程模板，创建后 AI 会建议是否加载。`
        : TASK_TYPE_CAPTURE_NEXT_STEP[type],
      active: hasTitle,
    },
  ];
}

function ProjectTreeView({
  projects,
  tasks,
  selectedId,
  deferOpenId,
  onRowClick,
  onRowDoubleClick,
  onContextMenu,
  onDeferToggle,
  onDeferSelect,
  onComplete,
  onMore,
  onResolveDependency,
  projectDraft,
  decomposingId,
  creatingChildrenId,
  decompositionError,
  onGenerateDecomposition,
  onCreateDraftChildren,
  onDiscardDraft,
}: {
  projects: Task[];
  tasks: Task[];
  selectedId: string | null;
  deferOpenId: string | null;
  onRowClick: (id: string) => void;
  onRowDoubleClick: (id: string) => void;
  onContextMenu: (event: React.MouseEvent, taskId: string) => void;
  onDeferToggle: (task: Task) => void;
  onDeferSelect: (task: Task, option: string) => void;
  onComplete: (task: Task) => void;
  onMore: (event: React.MouseEvent, task: Task) => void;
  onResolveDependency: (task: Task) => void;
  projectDraft: { projectId: string; result: ProjectDecompositionResult } | null;
  decomposingId: string | null;
  creatingChildrenId: string | null;
  decompositionError: string | null;
  onGenerateDecomposition: (project: Task) => void;
  onCreateDraftChildren: (project: Task) => void;
  onDiscardDraft: (project: Task) => void;
}) {
  if (projects.length === 0) return null;

  return (
    <div className="project-tree">
      {projects.map((project) => {
        const children = project.childTaskIds
          .map((id) => tasks.find((task) => task.id === id))
          .filter((task): task is Task => Boolean(task));
        const done = children.filter((task) => task.status === 'done').length;
        return (
          <div key={project.id} className="project-group">
            <div className="project-group-head">
              <span className="project-disclosure">▾</span>
              <span className="project-group-title">{project.title}</span>
              <span className="project-progress">{done}/{children.length} 子任务完成</span>
            </div>
            <TaskRow
              task={project}
              selected={selectedId === project.id}
              deferOpen={deferOpenId === project.id}
              onClick={() => onRowClick(project.id)}
              onDoubleClick={() => onRowDoubleClick(project.id)}
              onContextMenu={(event) => onContextMenu(event, project.id)}
              onDeferToggle={(event) => { event.stopPropagation(); onDeferToggle(project); }}
              onDeferSelect={(option) => onDeferSelect(project, option)}
              onComplete={(event) => { event.stopPropagation(); onComplete(project); }}
              onMore={(event) => { event.stopPropagation(); onMore(event, project); }}
              onResolveDependency={onResolveDependency}
            />
            {children.map((child) => (
              <div key={child.id} className="project-child-row">
                <TaskRow
                  task={child}
                  selected={selectedId === child.id}
                  deferOpen={deferOpenId === child.id}
                  onClick={() => onRowClick(child.id)}
                  onDoubleClick={() => onRowDoubleClick(child.id)}
                  onContextMenu={(event) => onContextMenu(event, child.id)}
                  onDeferToggle={(event) => { event.stopPropagation(); onDeferToggle(child); }}
                  onDeferSelect={(option) => onDeferSelect(child, option)}
                  onComplete={(event) => { event.stopPropagation(); onComplete(child); }}
                  onMore={(event) => { event.stopPropagation(); onMore(event, child); }}
                  onResolveDependency={onResolveDependency}
                />
              </div>
            ))}
            {children.length === 0 && (
              <ProjectDecompositionPanel
                project={project}
                draft={projectDraft?.projectId === project.id ? projectDraft.result : null}
                busy={decomposingId === project.id}
                creating={creatingChildrenId === project.id}
                error={decompositionError}
                onGenerate={() => onGenerateDecomposition(project)}
                onCreate={() => onCreateDraftChildren(project)}
                onDiscard={() => onDiscardDraft(project)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProjectDecompositionPanel({
  project,
  draft,
  busy,
  creating,
  error,
  onGenerate,
  onCreate,
  onDiscard,
}: {
  project: Task;
  draft: ProjectDecompositionResult | null;
  busy: boolean;
  creating: boolean;
  error: string | null;
  onGenerate: () => void;
  onCreate: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="project-child-empty">
      {!draft ? (
        <>
          <div className="project-empty-title">等待 AI 根据项目目标拆解子任务</div>
          <div className="project-empty-copy">拆解前不会自动生成模板任务；先生成草稿，确认后再创建真实子任务。</div>
          <button className={`btn sm primary${busy ? ' disabled' : ''}`} onClick={onGenerate} disabled={busy}>
            {busy ? '生成中…' : '生成拆解草稿'}
          </button>
        </>
      ) : (
        <>
          <div className="project-draft-head">
            <div>
              <div className="project-empty-title">AI 拆解草稿</div>
              <div className="project-empty-copy">{draft.parentGoal}</div>
            </div>
            <div className="project-draft-actions">
              <button className="btn sm ghost" onClick={onGenerate} disabled={busy || creating}>
                {busy ? '生成中…' : '重新生成'}
              </button>
              <button className="btn sm ghost" onClick={onDiscard} disabled={creating}>
                放弃草稿
              </button>
              <button className={`btn sm primary${creating ? ' disabled' : ''}`} onClick={onCreate} disabled={creating}>
                {creating ? '创建中…' : '确认创建子任务'}
              </button>
            </div>
          </div>
          <div className="project-draft-list">
            {draft.subtasks.map((subtask) => (
              <div key={`${project.id}-${subtask.title}`} className="project-draft-item">
                <strong>{subtask.title}</strong>
                <span>{subtask.summary}</span>
                <small>验收：{subtask.acceptanceCriteria}</small>
                {subtask.dependency && <small>依赖：{subtask.dependency}</small>}
                <small>独立性：{subtask.rationale}</small>
              </div>
            ))}
          </div>
          <div className="project-draft-review">
            <div className="project-draft-review-title">拆解自检</div>
            <div className="project-draft-checks">
              <span>大块任务</span>
              <span>边界独立</span>
              <span>依赖明确</span>
              <span>验收可见</span>
            </div>
            <p>{draft.review}</p>
            <small>{draft.nextStep}</small>
            <small>层级规则：最多保持项目 → 子任务两层；复杂子任务应升级为项目型重新拆解。</small>
          </div>
        </>
      )}
      {error && <div className="project-draft-error">{error}</div>}
    </div>
  );
}

/* ─── Task row ─── */

interface TaskRowProps {
  task: Task;
  selected: boolean;
  deferOpen: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDeferToggle: (e: React.MouseEvent) => void;
  onDeferSelect: (opt: string) => void;
  onComplete: (e: React.MouseEvent) => void;
  onMore: (e: React.MouseEvent) => void;
  onResolveDependency: (task: Task) => void;
}

function TaskRow({
  task, selected, deferOpen,
  onClick, onDoubleClick, onContextMenu,
  onDeferToggle, onDeferSelect, onComplete, onMore, onResolveDependency,
}: TaskRowProps) {
  return (
    <div
      className={`task-row${selected ? ' selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Status dot */}
      <span className={`dot ${statusDot(task.status)}`} style={{ flexShrink: 0 }} />

      {/* Title + metadata */}
      <div className="task-row-body">
        <span className="task-row-title">{task.title}</span>
        <div className="task-row-meta">
          {task.type !== 'simple' && (
            <span className="tag">
              {task.type === 'project' ? '项目' : task.type === 'scheduled' ? '定时' : '事件'}
            </span>
          )}
          {task.whyNow && !selected && (
            <span className="task-row-why">{task.whyNow}</span>
          )}
          {task.waitingOn && (
            <span className={`task-row-waiting${task.dependencyReady ? ' ready' : ''}`}>{task.waitingOn}</span>
          )}
        </div>
      </div>

      {/* Right side: timestamp or action buttons */}
      {selected ? (
        <div className="task-row-actions" onClick={(e) => e.stopPropagation()}>
          {task.dependencyReady && task.dependencyId && (
            <button className="btn sm" onClick={() => onResolveDependency(task)}>解除依赖</button>
          )}
          <div style={{ position: 'relative' }}>
            <button className="btn sm ghost" onClick={onDeferToggle}>延后 ▾</button>
            {deferOpen && (
              <div className="defer-menu">
                {DEFER_OPTIONS.map((opt) => (
                  <button key={opt.value} className="defer-option"
                    onClick={(e) => { e.stopPropagation(); onDeferSelect(opt.value); }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn sm" onClick={onComplete}>完成</button>
          <button className="btn sm ghost" onClick={onMore} style={{ padding: '3px 6px' }}>⋯</button>
        </div>
      ) : (
        <span className="task-row-date">{task.updatedAt}</span>
      )}
    </div>
  );
}

function statusDot(status: TaskStatus): string {
  if (status === 'running') return 'running';
  if (status === 'waiting') return 'waiting';
  if (status === 'blocked') return 'risk';
  if (status === 'done') return 'completed';
  return '';
}

/* ─── Task preview ─── */

interface TaskPreviewProps {
  task: Task;
  childTasks: Task[];
  completionCriteria: TaskDetail['completionCriteria'];
  taskFiles: VirtualTaskFile[];
  artifactCount: number;
  projectDraft: ProjectDecompositionResult | null;
  projectBusy: boolean;
  projectCreating: boolean;
  projectError: string | null;
  keySources: SourceContextRecord[];
  activityTimeline: TimelineEventRecord[];
  runCount: number;
  hasPendingDecision: boolean;
  planningLabel: string;
  onOpenPanel: () => void;
  onOpenWorkbench: () => void;
  onOpenDecision: () => void;
  deferOpen: boolean;
  onDeferToggle: () => void;
  onDeferSelect: (opt: string) => void;
  onComplete: () => void;
  onMore: (event: React.MouseEvent) => void;
  onResolveDependency: () => void;
  onGenerateDecomposition: () => void;
  onCreateDraftChildren: () => void;
  onDiscardDraft: () => void;
}

function TaskPreview({
  task,
  childTasks,
  completionCriteria,
  taskFiles,
  artifactCount,
  projectDraft,
  projectBusy,
  projectCreating,
  projectError,
  keySources,
  activityTimeline,
  runCount,
  hasPendingDecision,
  planningLabel,
  onOpenPanel,
  onOpenWorkbench,
  onOpenDecision,
  deferOpen,
  onDeferToggle,
  onDeferSelect,
  onComplete,
  onMore,
  onResolveDependency,
  onGenerateDecomposition,
  onCreateDraftChildren,
  onDiscardDraft,
}: TaskPreviewProps) {
  const draftPanelRef = useRef<HTMLDivElement | null>(null);
  const recentActivity = [...activityTimeline]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);
  const visibleContextFiles = taskFiles
    .filter((file) => !['records_folder', 'local_folder', 'task_record'].includes(file.kind))
    .slice(0, 4);
  const hasNonDefaultTaskFiles = taskFiles.some((file) => !['records_folder', 'local_folder', 'task_record'].includes(file.kind));
  const contextObjectCount = visibleContextFiles.length + Math.max(0, artifactCount - visibleContextFiles.filter((file) => file.kind === 'artifact').length);
  const completedCriteria = completionCriteria.filter((criterion) => criterion.status === 'satisfied').length;
  const completedChildren = childTasks.filter((child) => child.status === 'done').length;
  const needsProjectDecomposition = task.type === 'project' && childTasks.length === 0;
  const hasContextContent = visibleContextFiles.length > 0 || keySources.length > 0 || artifactCount > 0;
  const readyForWorkbench = Boolean(task.nextStep)
    && !task.waitingOn
    && task.status !== 'blocked'
    && task.status !== 'waiting'
    && (completionCriteria.length > 0 || hasContextContent || hasNonDefaultTaskFiles || runCount > 0 || task.type === 'scheduled' || task.type === 'event');
  const hasStructureContent = task.type === 'project'
    || completionCriteria.length > 0
    || Boolean(task.schedule)
    || Boolean(task.trigger)
    || Boolean(task.commitment);
  const primaryAction = hasPendingDecision
    ? {
        label: '去拍板 →',
        onClick: onOpenDecision,
        disabled: false,
        tone: 'decision' as const,
      }
    : needsProjectDecomposition
      ? {
          label: projectDraft
            ? '审阅拆解草稿 →'
            : projectBusy ? '生成中…' : '生成拆解草稿 →',
          onClick: projectDraft ? () => draftPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) : onGenerateDecomposition,
          disabled: projectBusy,
          tone: 'decompose' as const,
        }
      : readyForWorkbench
        ? {
            label: '打开工作台 →',
            onClick: onOpenWorkbench,
            disabled: false,
            tone: 'workbench' as const,
          }
        : {
            label: `${planningLabel} →`,
            onClick: onOpenPanel,
            disabled: false,
            tone: 'plan' as const,
          };
  const showPlanSecondary = primaryAction.onClick !== onOpenPanel;
  const showWorkbenchSecondary = primaryAction.onClick !== onOpenWorkbench
    && !hasPendingDecision
    && !needsProjectDecomposition
    && (completionCriteria.length > 0 || hasContextContent || hasNonDefaultTaskFiles || runCount > 0);

  return (
    <div className="task-preview-inner">
      <section className="task-detail-layer identity">
        <div className="task-preview-head">
          <h3 className="task-preview-title">{task.title}</h3>
          <div className="task-preview-type-row">
            <span className={`tag lane-${task.lane}`}>{LANE_LABELS[task.lane]}</span>
            <span className="tag">{TASK_TYPE_LABELS[task.type]}</span>
            <span className="tag subtle">{formatTaskStatus(task.status)}</span>
            {task.parentTaskId && <span className="preview-type-hint">子任务</span>}
            {task.type === 'project' && <span className="preview-type-hint">可在项目型 Lens 查看</span>}
            {task.type === 'scheduled' && <span className="preview-type-hint">周期触发</span>}
            {task.type === 'event' && <span className="preview-type-hint">监听外部条件</span>}
          </div>
        </div>
      </section>

      <section className="task-detail-layer progression">
        <div className="task-detail-layer-head">
          <span className="preview-label">推进</span>
          {hasPendingDecision && <span className="task-detail-alert">等待拍板</span>}
        </div>

        {task.whyNow && (
          <div className={`why-now${task.lane === 'escalate' ? ' risk' : task.lane === 'unblock' ? ' waiting' : ''}`}>
            {task.whyNow}
          </div>
        )}

        <div className="task-detail-action-strip">
          <div className="task-detail-next-step">
            <span>下一步</span>
            <p>{task.nextStep || '等待补充下一步行动。'}</p>
          </div>

          <button
            className={`btn primary task-primary-action ${primaryAction.tone}`}
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
          >
            {primaryAction.label}
          </button>
        </div>

        {task.waitingOn && (
          <div className="preview-chip">
            <span className="dot waiting" />
            {task.waitingOn}
          </div>
        )}

        <div className="task-detail-primary-actions">
          {showPlanSecondary && (
            <button className="btn ghost" onClick={onOpenPanel}>
              {planningLabel} →
            </button>
          )}
          {showWorkbenchSecondary && (
            <button className="btn ghost" onClick={onOpenWorkbench}>
              打开工作台 →
            </button>
          )}
        </div>

        <div className="preview-task-actions">
          {task.dependencyReady && task.dependencyId && (
            <button className="btn sm" onClick={onResolveDependency}>解除依赖</button>
          )}
          <div className="preview-defer-action">
            <button className="btn sm ghost" onClick={onDeferToggle}>延后 ▾</button>
            {deferOpen && (
              <div className="defer-menu">
                {DEFER_OPTIONS.map((opt) => (
                  <button key={opt.value} className="defer-option" onClick={() => onDeferSelect(opt.value)}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn sm" onClick={onComplete}>完成</button>
          <button className="btn sm ghost" onClick={onMore} style={{ padding: '3px 6px' }}>⋯</button>
        </div>
      </section>

      <section className={`task-detail-layer structure${hasStructureContent ? '' : ' quiet'}`}>
        <div className="task-detail-layer-head">
          <span className="preview-label">结构</span>
          {!hasStructureContent && <span className="preview-type-hint">按需建立</span>}
        </div>

        {task.type === 'project' ? (
          <>
            <div className="task-detail-grid">
              <div className="task-detail-stat">
                <strong>{completedChildren}/{childTasks.length}</strong>
                <span>子任务完成</span>
              </div>
              <div className="task-detail-stat">
                <strong>{completionCriteria.length}</strong>
                <span>完成标准</span>
              </div>
            </div>
            {childTasks.length === 0 && (
              <p className="preview-config-note">等待 AI 根据项目目标拆解子任务；先生成草稿，确认后再创建真实子任务。</p>
            )}
            {projectDraft && (
              <div ref={draftPanelRef} className="task-detail-project-draft">
                <div className="task-detail-project-draft-head">
                  <strong>AI 拆解草稿</strong>
                  <span>{projectDraft.subtasks.length} 个建议子任务</span>
                </div>
                <div className="task-detail-project-draft-list">
                  {projectDraft.subtasks.slice(0, 3).map((subtask) => (
                    <div key={`${task.id}-${subtask.title}`} className="task-detail-project-draft-item">
                      <strong>{subtask.title}</strong>
                      <span>{subtask.summary}</span>
                      <small>验收：{subtask.acceptanceCriteria}</small>
                      {subtask.dependency && <small>依赖：{subtask.dependency}</small>}
                    </div>
                  ))}
                </div>
                <div className="task-detail-project-draft-review">
                  <span>拆解自检</span>
                  <p>{projectDraft.review}</p>
                  <small>{projectDraft.nextStep}</small>
                </div>
                <div className="task-detail-project-draft-actions">
                  <button className="btn sm ghost" onClick={onGenerateDecomposition} disabled={projectBusy || projectCreating}>
                    {projectBusy ? '生成中…' : '重新生成'}
                  </button>
                  <button className="btn sm ghost" onClick={onDiscardDraft} disabled={projectCreating}>放弃草稿</button>
                  <button className={`btn sm primary${projectCreating ? ' disabled' : ''}`} onClick={onCreateDraftChildren} disabled={projectCreating}>
                    {projectCreating ? '创建中…' : '确认创建子任务'}
                  </button>
                </div>
              </div>
            )}
            {projectError && (
              <div className="project-draft-error">{projectError}</div>
            )}
          </>
        ) : completionCriteria.length > 0 ? (
          <>
            <div className="task-detail-grid">
              <div className="task-detail-stat">
                <strong>{completedCriteria}/{completionCriteria.length}</strong>
                <span>完成标准满足</span>
              </div>
              <div className="task-detail-stat">
                <strong>{runCount}</strong>
                <span>执行记录</span>
              </div>
            </div>
            <div className="task-detail-criteria-list">
              {completionCriteria.slice(0, 3).map((criterion) => (
                <div key={criterion.id} className={`task-detail-criterion ${criterion.status}`}>
                  <span>{criterion.status === 'satisfied' ? '✓' : '○'}</span>
                  <p>{criterion.text}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="preview-config-note compact">暂无完成标准；需要验收标准时可在工作台补充。</p>
        )}

        {task.schedule && (
          <>
            <div className="preview-chip">
              <span>↻</span>
              <span>{task.schedule}</span>
            </div>
            <p className="preview-config-note">周期配置保存在任务属性中，每次触发会在执行记录里形成独立 Run。</p>
          </>
        )}
        {task.trigger && (
          <>
            <div className="preview-chip">
              <span>⚡</span>
              <span>{task.trigger}</span>
            </div>
            <p className="preview-config-note">事件触发任务是一条持续监听规则，触发结果会追加到任务产物和执行记录，不会自动新建散乱任务。</p>
          </>
        )}
        {task.commitment && (
          <div className="preview-chip">
            <span>交付</span>
            <span>{task.commitment}</span>
          </div>
        )}
      </section>

      <section className={`task-detail-layer context${hasContextContent ? '' : ' quiet'}`}>
        <div className="task-detail-layer-head">
          <span className="preview-label">上下文</span>
          <span className="preview-type-hint">
            {hasContextContent ? `${contextObjectCount} 个上下文项目` : 'Task.md 可打开'}
          </span>
        </div>

        <div className="task-detail-file-list">
          {visibleContextFiles.length > 0 ? visibleContextFiles.map((file) => (
            <div key={file.id} className="task-detail-file-item">
              <span>{file.kind === 'artifact' ? '产物' : file.kind === 'source' ? '来源' : '文件'}</span>
              <strong>{file.name}</strong>
            </div>
          )) : (
            <p className="preview-config-note compact">Task.md 和 Task Records 在左侧任务文件树中打开；当前没有额外来源或产物。</p>
          )}
        </div>

        {hasContextContent && (
          <p className="preview-config-note">来源、产物和记录会投影到任务文件；完整读写从左侧任务文件树进入。</p>
        )}
      </section>

      <section className="task-detail-layer history">
        <div className="task-detail-layer-head">
          <span className="preview-label">活动记录</span>
          {runCount > 0 && <span className="preview-type-hint">{runCount} 条执行记录</span>}
        </div>
        {recentActivity.length === 0 ? (
          <p className="preview-config-note">当前任务暂无活动记录。执行过程和详细证据可从工作台查看。</p>
        ) : (
          <div className="preview-activity-list">
            {recentActivity.map((event) => (
              <div key={event.id} className="preview-activity-item">
                <span>{formatIsoDate(event.createdAt)}</span>
                <div>
                  <strong>{formatTimelineEventType(event.type)}</strong>
                  {summarizeTimelinePayload(event) && <p>{summarizeTimelinePayload(event)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
        {runCount > 0 && recentActivity.length > 0 && <p className="preview-config-note">完整执行过程在工作台查看。</p>}
      </section>
    </div>
  );
}

/* ─── Context menu ─── */

interface ContextMenuProps {
  x: number;
  y: number;
  task: Task | null;
  projects: Task[];
  onClose: () => void;
  onOpenWorkbench: () => void;
  onMoveToProject: (projectId: string | null) => void;
  onUpdateRisk: (riskLevel: TaskRiskLevel) => void;
  onArchive: () => void;
  onCopyLink: () => void;
}

function ContextMenu({
  x,
  y,
  task,
  projects,
  onClose,
  onOpenWorkbench,
  onMoveToProject,
  onUpdateRisk,
  onArchive,
  onCopyLink,
}: ContextMenuProps) {
  const projectOptions = task
    ? projects.filter((project) => project.id !== task.id && project.id !== task.parentTaskId)
    : [];
  const items = [
    { label: '打开工作台', action: onOpenWorkbench },
    { label: '归档', action: onArchive },
    { label: '复制链接', action: onCopyLink },
  ];

  return (
    <div
      className="ctx-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="ctx-menu-item muted" onClick={onClose}>
        移至项目
      </button>
      {projectOptions.map((project) => (
        <button key={project.id} className="ctx-menu-item sub" onClick={() => onMoveToProject(project.id)}>
          {project.title}
        </button>
      ))}
      {task?.parentTaskId && (
        <button className="ctx-menu-item sub" onClick={() => onMoveToProject(null)}>
          移出项目
        </button>
      )}
      <button className="ctx-menu-item muted" onClick={onClose}>
        改优先级
      </button>
      {RISK_OPTIONS.map((option) => (
        <button key={option.value} className="ctx-menu-item sub" onClick={() => onUpdateRisk(option.value)}>
          {option.label}
        </button>
      ))}
      {items.map((item) => (
        <button key={item.label} className="ctx-menu-item" onClick={item.action}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

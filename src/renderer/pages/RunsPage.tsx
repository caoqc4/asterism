import { Fragment, useEffect, useState } from 'react';

import type { ArtifactRecord } from '@shared/types/artifact';
import { parseRunCheckpointPayload } from '@shared/types/run-checkpoint-payload';
import { evaluateSandboxPatchPromotionReadiness } from '@shared/sandbox-patch-promotion-readiness';
import { projectAgentRunLifecycle } from '@shared/agent-orchestration';
import type { RecommendedActionIntent } from '@shared/types/brief';
import {
  buildDefaultOperatorStartedRunRequest,
  type OperatorStartedRunRequest,
} from '@shared/types/operator-started-run';
import type {
  CreateRunInput,
  RunCheckpointRecord,
  RunDetailRecord,
  RunRecord,
  RunStepRecord,
} from '@shared/types/run';
import type { AiConfigStatus } from '@shared/types/settings';
import type { TaskDetail, TaskListItemRecord, TimelineEventRecord } from '@shared/types/task';
import {
  formatTaskTimelineEventSummary,
  getTaskTimelineFollowUpActionLabel,
  getTaskTimelineLane,
  getTaskTimelineLaneLabel,
  getTaskTimelineObjectAction,
  getTaskTimelinePreviewEvents,
  getTaskTimelineResponsibilitySummary,
  groupTaskTimelineEventsByPriority,
  parseTimelinePayload,
} from '@shared/working-context/timeline';
import {
  formatAgentSessionCapabilitySummary,
  formatAgentSessionMetadataSummary,
  formatAgentSessionReplayNextStepDraft,
  formatAgentSessionRestartSummary,
  formatAgentSessionReplayReviewSummary,
  formatAgentSessionToolFamiliesSummary,
  formatCodeAgentRerunIntent,
  formatPreRunAgentCapabilitySummary,
  formatSandboxProducerSourceSummary,
  formatSandboxProducerLifecycleSummary,
} from '../lib/agentCapabilities';

const RELATED_TIMELINE_PREVIEW_COUNT = 4;

type StagedPatchReviewSummary = {
  artifactSummary: string | null;
  decisionId: string | null;
  checks: string[];
  decisionTitle: string | null;
  files: string[];
  patchPreview: string | null;
  promotionStatus: string | null;
  readinessSummary: string | null;
  readinessStatus: string | null;
  sourceId: string | null;
  workspaceStatus: string;
};

type StagedPatchEvidenceItem = {
  label: string;
  status: 'ready' | 'blocked' | 'pending';
  summary: string;
};

type BrowserEvidenceReviewSummary = {
  artifactId: string;
  artifactTitle: string;
  evidenceKinds: string[];
  screenshotPath: string | null;
  summary: string;
  url: string | null;
};

function formatRelatedTimelineSummary(event: TimelineEventRecord): string {
  return formatTaskTimelineEventSummary(event);
}

function getRunLifecycleStartMode(run: Pick<RunRecord, 'instructions'>): 'manual' | 'operator_started' {
  return run.instructions?.startsWith('Operator-started')
    ? 'operator_started'
    : 'manual';
}

function getRelatedTimelineActionLabel(event: TimelineEventRecord): string | null {
  return getTaskTimelineFollowUpActionLabel(event.type);
}

function getRelatedTimelineObjectLabel(event: TimelineEventRecord): string | null {
  return getTaskTimelineObjectAction(event).label;
}

function getRelatedTimeline(events: TimelineEventRecord[], runId: string): TimelineEventRecord[] {
  const relatedEvents = events.filter((event) => {
    if (event.type === 'task.run_failed' || event.type === 'task.run_completed') {
      return true;
    }

    if (event.type === 'task.risk_changed' || event.type === 'task.next_step_changed') {
      return true;
    }

    if (event.type === 'artifact.created') {
      const payload = parseTimelinePayload(event.payload);
      return payload?.sourceType === 'run' && payload?.sourceId === runId;
    }

    return false;
  });

  return getTaskTimelinePreviewEvents(relatedEvents, RELATED_TIMELINE_PREVIEW_COUNT);
}

function formatAgentToolLabel(tool: string): string {
  const labels: Record<string, string> = {
    'task.inspect_context': '读取任务上下文',
    'task.inspect_timeline': '读取最近时间线',
    'task.review_completion_evidence': '审查完成证据',
    'task.update_next_step': '更新任务下一步',
    'task.create_completion_criterion': '创建完成标准',
    'artifact.create_note': '写入本地 note',
    'decision.draft': '草拟 Decision',
    'source_context.create': '创建来源上下文',
    'workspace.search': '搜索工作区',
    'workspace.read_file': '读取工作区文件',
    'workspace.run_command': '运行工作区命令',
    'workspace.write_patch': '应用工作区 patch',
  };

  return labels[tool] ?? tool;
}

function formatAgentToolStatus(status: string): string {
  const labels: Record<string, string> = {
    completed: '已完成',
    failed: '失败',
    needs_confirmation: '等待确认',
  };

  return labels[status] ?? status;
}

function formatActionError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getBrowserEvidenceReviewSummary(detail: RunDetailRecord | null): BrowserEvidenceReviewSummary | null {
  const artifact = detail?.artifacts?.find((item) => item.kind === 'browser_evidence');
  if (!artifact) {
    return null;
  }

  const payload = parseBrowserEvidenceArtifactPayload(artifact);
  const evidenceKinds = Array.isArray(payload?.artifacts)
    ? payload.artifacts
      .map((item) => typeof item?.kind === 'string' ? item.kind : null)
      .filter((item): item is string => Boolean(item))
    : [];
  const screenshotPath = Array.isArray(payload?.artifacts)
    ? payload.artifacts
      .map((item) => typeof item?.path === 'string' && item.kind === 'screenshot' ? item.path : null)
      .find((item): item is string => Boolean(item)) ?? null
    : null;

  return {
    artifactId: artifact.id,
    artifactTitle: artifact.title,
    evidenceKinds,
    screenshotPath,
    summary: typeof payload?.result?.summary === 'string'
      ? payload.result.summary
      : artifact.content.slice(0, 240),
    url: typeof payload?.request?.url === 'string' ? payload.request.url : null,
  };
}

function parseBrowserEvidenceArtifactPayload(artifact: ArtifactRecord): Record<string, any> | null {
  try {
    const parsed = JSON.parse(artifact.content);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function formatAgentPlanStepSummary(step: RunStepRecord): string | null {
  if (step.kind !== 'plan' || !step.title.includes('agent 步骤计划')) {
    return null;
  }

  const source = step.title.includes('模型提出')
    ? '模型提出的步骤计划'
    : '保守 fallback 步骤计划';
  const tools = (step.output ?? '')
    .split('\n')
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean)
    .map(formatAgentToolLabel);

  if (!tools.length) {
    return `${source}：没有可执行步骤。`;
  }

  return `${source}：${tools.join(' -> ')}`;
}

function formatAgentObservationSummary(step: RunStepRecord): string | null {
  if (step.title !== '汇总 agent 工具观察' || !step.output) {
    return null;
  }

  const summaries = step.output
    .split('\n')
    .map((line) => {
      const match = line.match(/^\d+\.\s+(.+?)\s+\[(.+?)\]\s+(.+)$/);

      if (!match) {
        return line.trim();
      }

      const [, tool, status, summary] = match;

      return `${formatAgentToolLabel(tool)}（${formatAgentToolStatus(status)}）：${summary}`;
    })
    .filter(Boolean);

  if (!summaries.length) {
    return null;
  }

  return `工具观察：${summaries.join('；')}`;
}

function parseRunStepInput(input?: string | null): Map<string, string> {
  return new Map(
    (input ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        return separatorIndex > 0
          ? [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)] as const
          : [line, ''] as const;
      }),
  );
}

function formatSandboxProducerStepSummary(step: RunStepRecord): string | null {
  if (!step.title.startsWith('Sandbox producer') && step.title !== 'Sandboxed coding producer started') {
    return null;
  }

  const input = parseRunStepInput(step.input);

  if (step.title === 'Sandboxed coding producer started') {
    return [
      'Producer started',
      input.get('source') ? `source=${input.get('source')}` : null,
      step.output || null,
    ].filter(Boolean).join('；');
  }

  const checkMatch = step.title.match(/^Sandbox producer check (passed|failed): (.+)$/);
  if (checkMatch) {
    const [, status, script] = checkMatch;

    return [
      `Check evidence：${script} ${status}`,
      input.get('source') ? `source=${input.get('source')}` : null,
      step.output || step.error || null,
      status === 'failed' ? 'next=review failed check evidence before retry' : null,
    ].filter(Boolean).join('；');
  }

  if (step.title === 'Sandbox producer source ready') {
    return [
      'Patch source ready',
      input.get('source') ? `source=${input.get('source')}` : null,
      input.get('files') ? `files=${input.get('files')}` : null,
      step.output || null,
      'next=review patch-promotion Decision; workspace changes only after approval',
    ].filter(Boolean).join('；');
  }

  if (step.title.includes('blocked')) {
    return [
      'Producer blocked',
      step.output || step.error || input.get('blockedReasons') || null,
      'next=fix runtime readiness, then start a new manual run',
    ].filter(Boolean).join('；');
  }

  if (step.title.includes('failed')) {
    return [
      'Producer failed',
      step.error || step.output || null,
      'next=review failed evidence before retry',
    ].filter(Boolean).join('；');
  }

  if (step.title.includes('paused')) {
    return [
      'Producer paused',
      step.output || step.error || null,
      'next=resolve linked Decision or checkpoint',
    ].filter(Boolean).join('；');
  }

  if (step.title.includes('tool requested') || step.title.includes('tool completed')) {
    return [
      `Sandbox tool：${step.title.replace(/^Sandbox producer tool (requested|completed):\s*/, '')}`,
      input.get('source') ? `source=${input.get('source')}` : null,
      step.output || step.error || null,
    ].filter(Boolean).join('；');
  }

  return null;
}

function formatRunStepSummary(step: RunStepRecord): string {
  const agentPlanSummary = formatAgentPlanStepSummary(step);

  if (agentPlanSummary) {
    return agentPlanSummary;
  }

  const agentObservationSummary = formatAgentObservationSummary(step);

  if (agentObservationSummary) {
    return agentObservationSummary;
  }

  const sandboxProducerStepSummary = formatSandboxProducerStepSummary(step);

  if (sandboxProducerStepSummary) {
    return sandboxProducerStepSummary;
  }

  if (step.error) {
    return step.error;
  }

  if (step.output) {
    return step.output;
  }

  if (step.input) {
    return step.input;
  }

  return '该步骤已记录，但没有额外内容。';
}

function truncateSummary(value: string, limit = 180): string {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function extractPreviewLine(preview: string | null, label: string): string | null {
  if (!preview) {
    return null;
  }

  const line = preview
    .split('\n')
    .find((candidate) => candidate.startsWith(`${label}:`));

  return line?.slice(label.length + 1).trim() || null;
}

function formatDiffPreview(preview: string | null): string | null {
  if (!preview) {
    return null;
  }

  const patchStart = preview.indexOf('*** Begin Patch');
  const content = patchStart >= 0 ? preview.slice(patchStart) : preview;

  return truncateSummary(content.replace(/\s+/g, ' '));
}

function formatRunCheckpointSummary(checkpoint: RunCheckpointRecord): string {
  if (!checkpoint.payload) {
    return '该 checkpoint 没有额外内容。';
  }

  const payload = parseRunCheckpointPayload(checkpoint.payload);

  if (payload) {
    const input = payload.input && typeof payload.input === 'object'
      ? payload.input as Record<string, unknown>
      : null;
    const expectedFiles = Array.isArray(input?.expectedFiles)
      ? input.expectedFiles.filter((item): item is string => typeof item === 'string')
      : [];
    const rawDiffPreview = typeof input?.diffPreview === 'string'
      ? input.diffPreview
      : null;
    const diffPreview = formatDiffPreview(rawDiffPreview);
    const patchSummary = rawDiffPreview
      ? (typeof input?.summary === 'string'
          ? input.summary.trim()
          : extractPreviewLine(rawDiffPreview, 'Summary'))
      : null;
    const previewFiles = extractPreviewLine(rawDiffPreview, 'Files');
    const rawCommandPreview = typeof input?.commandPreview === 'string'
      ? input.commandPreview
      : null;
    const commandPreview = rawCommandPreview
      ? truncateSummary(rawCommandPreview.replace(/\s+/g, ' '))
      : null;
    const script = typeof input?.script === 'string' ? input.script : null;
    const commandArgs = Array.isArray(input?.args)
      ? input.args.filter((item): item is string => typeof item === 'string')
      : [];
    const timeout = typeof input?.timeoutMs === 'number'
      ? `${input.timeoutMs}ms`
      : extractPreviewLine(rawCommandPreview, 'Timeout');
    const cwd = extractPreviewLine(rawCommandPreview, 'Cwd');
    const summaryParts = [
      typeof payload.tool === 'string' ? `工具：${payload.tool}` : null,
      typeof payload.nextTool === 'string' ? `下一工具：${payload.nextTool}` : null,
      typeof payload.risk === 'string' ? `风险：${payload.risk}` : null,
      typeof payload.reason === 'string' ? `原因：${payload.reason}` : null,
      patchSummary ? `摘要：${patchSummary}` : null,
      expectedFiles.length ? `文件：${expectedFiles.join(', ')}` : previewFiles ? `文件：${previewFiles}` : null,
      script ? `脚本：npm run ${script}` : null,
      script ? '限制：仅允许 package.json 中的 test / lint 脚本' : null,
      commandArgs.length ? `参数：${commandArgs.join(' ')}` : null,
      timeout ? `超时：${timeout}` : null,
      cwd ? `工作目录：${cwd}` : null,
      diffPreview ? `预览：${diffPreview}` : null,
      commandPreview ? `预览：${commandPreview}` : null,
      typeof payload.decisionTitle === 'string' ? `Decision：${payload.decisionTitle}` : null,
    ].filter((part): part is string => Boolean(part));

    if (summaryParts.length) {
      return summaryParts.join('；');
    }
  }

  return truncateSummary(checkpoint.payload);
}

function getStagedPatchReviewSummary(detail: RunDetailRecord | null): StagedPatchReviewSummary | null {
  if (!detail) {
    return null;
  }

  const sourceStep = (detail.steps ?? []).find((step) => step.title === 'Sandbox producer source ready');
  const sourceInput = parseRunStepInput(sourceStep?.input);
  const sourceFiles = sourceInput.get('files')
    ?.split(',')
    .map((file) => file.trim())
    .filter(Boolean) ?? [];
  const checks = (detail.steps ?? [])
    .map((step) => {
      const match = step.title.match(/^Sandbox producer check (passed|failed): (.+)$/);
      return match ? `${match[2]} ${match[1]}` : null;
    })
    .filter((check): check is string => Boolean(check));
  const promotionCheckpoint = (detail.checkpoints ?? []).find((checkpoint) => {
    const payload = parseRunCheckpointPayload(checkpoint.payload);
    return checkpoint.kind === 'patch_promotion' || payload?.kind === 'patch_promotion';
  });
  const promotionReadiness = promotionCheckpoint
    ? evaluateSandboxPatchPromotionReadiness(promotionCheckpoint)
    : null;
  const promotionPayload = parseRunCheckpointPayload(promotionCheckpoint?.payload);
  const preview = typeof promotionPayload?.preview === 'string' ? promotionPayload.preview : null;
  const previewFiles = extractPreviewLine(preview, 'Files')
    ?.split(',')
    .map((file) => file.trim())
    .filter(Boolean) ?? [];
  const files = sourceFiles.length ? sourceFiles : previewFiles;

  if (!sourceStep && !promotionCheckpoint) {
    return null;
  }

  return {
    artifactSummary: typeof promotionPayload?.artifactSummary === 'string'
      ? promotionPayload.artifactSummary
      : null,
    checks,
    decisionId: typeof promotionPayload?.decisionId === 'string'
      ? promotionPayload.decisionId
      : null,
    decisionTitle: typeof promotionPayload?.decisionTitle === 'string'
      ? promotionPayload.decisionTitle
      : null,
    files,
    patchPreview: formatDiffPreview(preview),
    promotionStatus: promotionCheckpoint?.status ?? null,
    readinessSummary: promotionReadiness?.summary ?? null,
    readinessStatus: promotionReadiness?.status ?? null,
    sourceId: sourceInput.get('source')
      ?? (typeof promotionPayload?.sessionId === 'string' ? promotionPayload.sessionId : null),
    workspaceStatus: getStagedPatchWorkspaceStatus(detail, promotionCheckpoint ?? null),
  };
}

function getStagedPatchWorkspaceStatus(
  detail: RunDetailRecord,
  promotionCheckpoint: RunCheckpointRecord | null,
): string {
  const evidence = [
    detail.output,
    detail.failureReason,
    ...(detail.steps ?? []).flatMap((step) => [step.title, step.output, step.error]),
  ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n');

  if (evidence.includes('Sandbox patch promotion applied')) {
    return 'workspace promotion applied after Decision approval';
  }

  if (evidence.includes('Sandbox patch promotion already applied')) {
    return 'workspace already matched the promoted patch';
  }

  if (evidence.includes('Workspace file application is still deferred')) {
    return 'Decision resolved in preflight-only mode; workspace files were not written';
  }

  if (evidence.includes('No workspace files were written.') || promotionCheckpoint?.status === 'cancelled') {
    return 'promotion blocked or cancelled; workspace files were not written';
  }

  if (promotionCheckpoint?.status === 'resolved') {
    return 'Decision resolved; inspect Run result and steps for workspace application evidence';
  }

  return 'workspace unchanged until Decision approval';
}

function getStagedPatchEvidenceChecklist(review: StagedPatchReviewSummary): StagedPatchEvidenceItem[] {
  const failedChecks = review.checks.filter((check) => check.includes('failed'));
  const passedChecks = review.checks.filter((check) => check.includes('passed'));
  const workspaceApplied = review.workspaceStatus.includes('applied')
    || review.workspaceStatus.includes('already matched');
  const workspaceUnchanged = review.workspaceStatus.includes('unchanged')
    || review.workspaceStatus.includes('not written')
    || review.workspaceStatus.includes('deferred');

  return [
    {
      label: 'Source evidence',
      status: review.sourceId && review.files.length ? 'ready' : 'blocked',
      summary: review.sourceId && review.files.length
        ? `source=${review.sourceId}; files=${review.files.join(', ')}`
        : 'missing source id or changed-file list',
    },
    {
      label: 'Targeted checks',
      status: failedChecks.length ? 'blocked' : passedChecks.length ? 'ready' : 'pending',
      summary: failedChecks.length
        ? `failed=${failedChecks.join(', ')}`
        : passedChecks.length
          ? `passed=${passedChecks.join(', ')}`
          : 'no check evidence recorded',
    },
    {
      label: 'Promotion Decision',
      status: review.decisionId
        ? review.promotionStatus === 'open' ? 'pending' : 'ready'
        : 'blocked',
      summary: review.decisionId
        ? `${review.promotionStatus ?? 'unknown'}; ${review.decisionTitle ?? review.decisionId}`
        : 'missing promotion Decision link',
    },
    {
      label: 'Workspace mutation',
      status: workspaceApplied ? 'ready' : workspaceUnchanged ? 'pending' : 'blocked',
      summary: review.workspaceStatus,
    },
  ];
}

function getStagedPatchEvidenceStatusLabel(status: StagedPatchEvidenceItem['status']): string {
  const labels: Record<StagedPatchEvidenceItem['status'], string> = {
    ready: 'ready',
    blocked: 'blocked',
    pending: 'pending',
  };

  return labels[status];
}

function getStagedPatchReviewNextMove(review: StagedPatchReviewSummary): string {
  const failedChecks = review.checks.filter((check) => check.includes('failed'));

  if (failedChecks.length) {
    return `next=review failed check evidence before rerun: ${failedChecks.join(', ')}`;
  }

  if (!review.decisionId) {
    return 'next=inspect checkpoint evidence; promotion Decision link is missing';
  }

  if (review.promotionStatus === 'open') {
    return 'next=open promotion Decision; workspace remains unchanged until approval';
  }

  if (review.workspaceStatus.includes('applied') || review.workspaceStatus.includes('already matched')) {
    return 'next=return to task and verify completion criteria against promoted workspace changes';
  }

  if (review.workspaceStatus.includes('not written') || review.workspaceStatus.includes('deferred')) {
    return 'next=return to task and prepare rerun or explicit apply validation';
  }

  return 'next=review Run result and task timeline before deciding whether to rerun';
}

type RunsPageProps = {
  aiStatus: AiConfigStatus | null;
  focusedRunId: string | null;
  runs: RunRecord[];
  tasks: TaskListItemRecord[];
  onOpenTask: (taskId: string, intent: RecommendedActionIntent) => void;
  onOpenDecision: (decisionId: string) => void;
  onContinuePausedRun: (runId: string) => Promise<RunRecord>;
  onRefresh: () => Promise<void>;
  onRunFocusConsumed: () => void;
  onTriggerOperatorStartedRun?: (input: OperatorStartedRunRequest) => Promise<RunRecord>;
  onTriggerRun: (input: CreateRunInput) => Promise<RunRecord>;
};

export function RunsPage({
  aiStatus,
  focusedRunId,
  runs,
  tasks,
  onOpenDecision,
  onOpenTask,
  onContinuePausedRun,
  onRefresh,
  onRunFocusConsumed,
  onTriggerOperatorStartedRun,
  onTriggerRun,
}: RunsPageProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(runs[0]?.id ?? null);
  const [detail, setDetail] = useState<RunDetailRecord | null>(null);
  const [relatedTaskDetail, setRelatedTaskDetail] = useState<TaskDetail | null>(null);
  const [runActionError, setRunActionError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateRunInput>({
    taskId: tasks[0]?.id ?? '',
    type: 'draft',
    instructions: '',
  });

  useEffect(() => {
    if (!selectedRunId && runs[0]) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  useEffect(() => {
    setRunActionError(null);
  }, [selectedRunId]);

  useEffect(() => {
    if (!focusedRunId) {
      return;
    }

    if (runs.some((run) => run.id === focusedRunId)) {
      setSelectedRunId(focusedRunId);
      onRunFocusConsumed();
    }
  }, [focusedRunId, onRunFocusConsumed, runs]);

  useEffect(() => {
    let mounted = true;

    async function loadDetail() {
      if (!selectedRunId) {
        setDetail(null);
        return;
      }

      const nextDetail = await window.api.getRunDetail(selectedRunId);

      if (mounted) {
        setDetail(nextDetail);
      }
    }

    void loadDetail();

    return () => {
      mounted = false;
    };
  }, [selectedRunId, runs]);

  useEffect(() => {
    let mounted = true;

    async function loadRelatedTaskDetail() {
      if (!detail?.taskId) {
        setRelatedTaskDetail(null);
        return;
      }

      const nextDetail = await window.api.getTaskDetail(detail.taskId);

      if (mounted) {
        setRelatedTaskDetail(nextDetail);
      }
    }

    void loadRelatedTaskDetail();

    return () => {
      mounted = false;
    };
  }, [detail?.id, detail?.taskId]);

  function handleRelatedTimelineObjectOpen(event: TimelineEventRecord) {
    const objectAction = getTaskTimelineObjectAction(event);

    if (objectAction.targetType === 'run' && objectAction.targetId) {
      setSelectedRunId(objectAction.targetId);
    }
  }

  async function continuePausedRun(run: RunDetailRecord): Promise<void> {
    setRunActionError(null);

    try {
      const updated = await onContinuePausedRun(run.id);

      setSelectedRunId(updated.id);
      await onRefresh();
    } catch (error) {
      setRunActionError(`继续 paused run 失败：${formatActionError(error)}`);
    }
  }

  async function triggerBrowserEvidenceSmoke(): Promise<void> {
    if (!form.taskId || !onTriggerOperatorStartedRun) {
      return;
    }

    setRunActionError(null);

    try {
      const created = await onTriggerOperatorStartedRun(buildDefaultOperatorStartedRunRequest({
        kind: 'browser_evidence_smoke',
        reason: 'Capture isolated Browser Evidence smoke output for Run review.',
        taskId: form.taskId,
      }));

      setSelectedRunId(created.id);
      await onRefresh();
    } catch (error) {
      setRunActionError(`Browser Evidence smoke 失败：${formatActionError(error)}`);
    }
  }

  const relatedTimeline = detail
    ? getRelatedTimeline(relatedTaskDetail?.timeline ?? [], detail.id)
    : [];
  const relatedTimelineGroups = groupTaskTimelineEventsByPriority(relatedTimeline);
  const detailSteps = detail?.steps ?? [];
  const detailCheckpoints = detail?.checkpoints ?? [];
  const latestAgentSession = detail?.agentSessions?.at(-1) ?? null;
  const latestAgentSessionMetadata = latestAgentSession
    ? formatAgentSessionMetadataSummary(latestAgentSession)
    : null;
  const latestAgentSessionToolFamilies = latestAgentSession
    ? formatAgentSessionToolFamiliesSummary(latestAgentSession)
    : null;
  const latestAgentSessionRestart = latestAgentSession
    ? formatAgentSessionRestartSummary(latestAgentSession)
    : null;
  const latestAgentSessionReplayReview = latestAgentSession
    ? formatAgentSessionReplayReviewSummary(latestAgentSession, detailSteps, detailCheckpoints)
    : null;
  const sandboxProducerSource = latestAgentSession
    ? formatSandboxProducerSourceSummary(latestAgentSession)
    : null;
  const sandboxProducerLifecycle = formatSandboxProducerLifecycleSummary(latestAgentSession);
  const stagedPatchReview = getStagedPatchReviewSummary(detail);
  const stagedPatchEvidenceChecklist = stagedPatchReview
    ? getStagedPatchEvidenceChecklist(stagedPatchReview)
    : [];
  const browserEvidenceReview = getBrowserEvidenceReviewSummary(detail);
  const runLifecycleProjection = detail
    ? projectAgentRunLifecycle({
        runStatus: detail.status,
        startMode: getRunLifecycleStartMode(detail),
      })
    : null;
  const focusNextStepDraft = detail
    ? latestAgentSession
      ? formatAgentSessionReplayNextStepDraft({
          checkpoints: detailCheckpoints,
          runType: detail.type,
          session: latestAgentSession,
          steps: detailSteps,
        })
      : detail.status === 'failed'
        ? `检查最近一次 ${detail.type} run 的失败原因，并决定是否重试。`
        : detail.status === 'paused'
          ? `复核最近一次 ${detail.type} run 的暂停原因，处理阻塞后再继续。`
          : `审阅最近一次 ${detail.type} run 的结果，并决定是否继续推进。`
    : '';

  return (
    <section className="tasks-layout">
      <article className="panel">
        <article className="hero page-hero">
          <p className="eyebrow">Runs</p>
          <h1>执行记录</h1>
          <p className="lede">这里承接 Run 的对象视角：先看当前执行焦点，再决定是否发起新的 run 或切换到队列中的其他记录。</p>
        </article>

        <div className="transition-group detail-stage">
          <div className="detail-stage-head">
            <div>
              <p className="eyebrow">Current Focus</p>
              <h3>{detail ? `${detail.type} / ${detail.status}` : '选择一个 run'}</h3>
            </div>
            <p className="meta">这里只承接当前这次执行的局部检查：先看结果，再判断怎么处理，然后回到任务继续推进。</p>
          </div>
        </div>
        {detail ? (
          <div className="detail-cluster-grid">
            <div className="task-card detail-card-group">
              <p className="eyebrow">Run Snapshot</p>
              <div className="task-row">
                <strong>{detail.type}</strong>
                <span className="status">{detail.status}</span>
              </div>
              <p className="meta">关联任务：{detail.taskId}</p>
              <p className="meta">创建时间：{detail.createdAt}</p>
              <p className="meta">结果来源：{detail.outputSource || '尚未产生'}</p>
              {runLifecycleProjection ? (
                <p className="meta">
                  {runLifecycleProjection.summary}
                </p>
              ) : null}
              {latestAgentSession ? (
                <>
                  <p className="meta">
                    Agent session：{formatAgentSessionCapabilitySummary(latestAgentSession)}
                  </p>
                  {latestAgentSessionToolFamilies ? (
                    <p className="meta">
                      Tool families：{latestAgentSessionToolFamilies}
                    </p>
                  ) : null}
                  {latestAgentSessionRestart ? (
                    <p className="meta">
                      Restart hint：{latestAgentSessionRestart}
                    </p>
                  ) : null}
                  {latestAgentSessionReplayReview ? (
                    <p className="meta">
                      {latestAgentSessionReplayReview}
                    </p>
                  ) : null}
                  {latestAgentSessionMetadata ? (
                    <p className="meta">
                      Session metadata：{latestAgentSessionMetadata}
                    </p>
                  ) : null}
                  {sandboxProducerSource ? (
                    <p className="meta">
                      {sandboxProducerSource}
                    </p>
                  ) : null}
                  {sandboxProducerLifecycle ? (
                    <p className="meta">
                      {sandboxProducerLifecycle}
                    </p>
                  ) : null}
                </>
              ) : null}
              <p className="meta">附加要求：{detail.instructions || '无'}</p>
              <p className="meta">这里负责确认这次执行本身是否成功、为什么失败，以及是否值得继续推进。</p>
            </div>
            <div className="task-card detail-card-group">
              <p className="eyebrow">Focus Moves</p>
              <strong>先处理这次执行结果</strong>
              <p className="meta">只保留当前最关键的执行后续动作；更完整的恢复与上下文承接仍然回到任务页处理。</p>
              <div className="chip-row">
                <button
                  className="ghost-button"
                  onClick={() =>
                    onOpenTask(detail.taskId, {
                      type: 'focus_next_step',
                      focusArea: 'detail',
                      prefillNextStep: focusNextStepDraft,
                    })
                  }
                  type="button"
                >
                  回到任务推进
                </button>
                {detail.status === 'paused' ? (
                  <button
                    className="ghost-button"
                    onClick={() => void continuePausedRun(detail)}
                    type="button"
                  >
                    继续 paused run
                  </button>
                ) : null}
              </div>
              {runActionError ? <p className="meta">{runActionError}</p> : null}
            </div>
            <div className="task-card detail-card-group detail-card-wide">
              <p className="eyebrow">Run Result</p>
              <strong>{detail.output ? '查看这次执行产出的结果' : '这次执行还没有可读结果'}</strong>
              <p className="meta">这里只保留结果检查必需的信息，不把 run 页继续扩成第二套任务详情。</p>
              <div className="timeline-list">
                <div className="timeline-item timeline-item-state">
                  <strong>输出结果</strong>
                  <p>{detail.output || '尚无输出'}</p>
                </div>
                <div className="timeline-item">
                  <strong>失败原因</strong>
                  <p className="meta">{detail.failureReason || '无'}</p>
                </div>
              </div>
            </div>
            {stagedPatchReview ? (
              <div className="task-card detail-card-group detail-card-wide">
                <p className="eyebrow">Staged Patch Review</p>
                <strong>审阅 sandbox 产出的 staged patch 证据</strong>
                <p className="meta">
                  Staged patch review：{
                    [
                      stagedPatchReview.sourceId ? `source=${stagedPatchReview.sourceId}` : null,
                      stagedPatchReview.files.length ? `files=${stagedPatchReview.files.join(', ')}` : null,
                      stagedPatchReview.checks.length ? `checks=${stagedPatchReview.checks.join(', ')}` : null,
                      stagedPatchReview.promotionStatus ? `promotion=${stagedPatchReview.promotionStatus}` : null,
                      stagedPatchReview.readinessStatus ? `readiness=${stagedPatchReview.readinessStatus}` : null,
                      stagedPatchReview.decisionTitle ? `Decision=${stagedPatchReview.decisionTitle}` : null,
                      stagedPatchReview.workspaceStatus,
                    ].filter(Boolean).join(' / ')
                  }
                </p>
                {stagedPatchReview.artifactSummary ? (
                  <p className="meta">Artifact：{stagedPatchReview.artifactSummary}</p>
                ) : null}
                {stagedPatchReview.readinessSummary ? (
                  <p className="meta">Promotion readiness：{stagedPatchReview.readinessSummary}</p>
                ) : null}
                {stagedPatchReview.patchPreview ? (
                  <p className="meta">Patch preview：{stagedPatchReview.patchPreview}</p>
                ) : null}
                <p className="meta">Next review move：{getStagedPatchReviewNextMove(stagedPatchReview)}</p>
                <div className="timeline-list">
                  {stagedPatchEvidenceChecklist.map((item) => (
                    <div className={`timeline-item timeline-item-${item.status}`} key={item.label}>
                      <div className="task-row">
                        <strong>{item.label}</strong>
                        <span className="status">{getStagedPatchEvidenceStatusLabel(item.status)}</span>
                      </div>
                      <p className="meta">{item.summary}</p>
                    </div>
                  ))}
                </div>
                {stagedPatchReview.decisionId ? (
                  <div className="chip-row">
                    <button
                      className="ghost-button"
                      onClick={() => {
                        if (stagedPatchReview.decisionId) {
                          onOpenDecision(stagedPatchReview.decisionId);
                        }
                      }}
                      type="button"
                    >
                      打开 promotion Decision
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() =>
                        onOpenTask(detail.taskId, {
                          type: 'focus_next_step',
                          focusArea: 'code-agent',
                          prefillCodeAgentPatchIntent: formatCodeAgentRerunIntent({
                            decisionTitle: stagedPatchReview.decisionTitle,
                            files: stagedPatchReview.files,
                            runId: detail.id,
                            workspaceStatus: stagedPatchReview.workspaceStatus,
                          }),
                        })
                      }
                      type="button"
                    >
                      回到任务准备重跑
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {browserEvidenceReview ? (
              <div className="task-card detail-card-group detail-card-wide">
                <p className="eyebrow">Browser Evidence</p>
                <strong>审阅这次浏览器证据采集</strong>
                <p className="meta">
                  Browser evidence：{
                    [
                      browserEvidenceReview.url ? `url=${browserEvidenceReview.url}` : null,
                      browserEvidenceReview.evidenceKinds.length
                        ? `artifacts=${browserEvidenceReview.evidenceKinds.join(', ')}`
                        : null,
                      `artifact=${browserEvidenceReview.artifactId}`,
                    ].filter(Boolean).join(' / ')
                  }
                </p>
                <p className="meta">{browserEvidenceReview.summary}</p>
                {browserEvidenceReview.screenshotPath ? (
                  <p className="meta">Screenshot：{browserEvidenceReview.screenshotPath}</p>
                ) : null}
                <p className="meta">Next review move：review captured evidence before enabling any controlled browser interaction.</p>
              </div>
            ) : null}
            <div className="task-card detail-card-group detail-card-wide">
              <p className="eyebrow">Execution Steps</p>
              <strong>{detailSteps.length ? '这次执行的步骤轨迹' : '这次执行还没有步骤轨迹'}</strong>
              <p className="meta">这里先展示产品可读的执行摘要，后续 agent 工具调用会继续落在同一条步骤轨迹里。</p>
              <div className="timeline-list">
                {detailSteps.length ? (
                  detailSteps.map((step) => (
                    <div className={`timeline-item timeline-item-${step.status}`} key={step.id}>
                      <div className="task-row">
                        <strong>{step.index}. {step.title}</strong>
                        <div className="task-row-compact">
                          <span className="status">{step.kind}</span>
                          <span className="status">{step.status}</span>
                        </div>
                      </div>
                      <p className="meta">{formatRunStepSummary(step)}</p>
                    </div>
                  ))
                ) : (
                  <p className="meta">旧 run 可能没有步骤数据；新 run 会自动写入 plan / model / final 步骤。</p>
                )}
              </div>
            </div>
            <div className="task-card detail-card-group detail-card-wide">
              <p className="eyebrow">Checkpoints</p>
              <strong>{detailCheckpoints.length ? '这次执行等待处理的断点' : '这次执行没有等待处理的断点'}</strong>
              <p className="meta">Checkpoint 用来承接需要人工确认、外部等待或恢复续跑的执行中断；后续会继续映射到正式 Decision。</p>
              <div className="timeline-list">
                {detailCheckpoints.length ? (
                  detailCheckpoints.map((checkpoint) => (
                    <div className={`timeline-item timeline-item-${checkpoint.status}`} key={checkpoint.id}>
                      <div className="task-row">
                        <strong>{checkpoint.kind}</strong>
                        <div className="task-row-compact">
                          <span className="status">{checkpoint.status}</span>
                          {checkpoint.stepId ? <span className="status">{checkpoint.stepId}</span> : null}
                        </div>
                      </div>
                      <p className="meta">{formatRunCheckpointSummary(checkpoint)}</p>
                      <p className="meta">
                        创建时间：{checkpoint.createdAt}
                        {checkpoint.resolvedAt ? `；解决时间：${checkpoint.resolvedAt}` : ''}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="meta">普通 draft / summarize run 通常不会产生 checkpoint；需要确认的 agent 工具调用会在这里出现。</p>
                )}
              </div>
            </div>
            <div className="task-card detail-card-group detail-card-wide">
              <p className="eyebrow">Related Task Timeline</p>
              <strong>这次执行如何改变了任务</strong>
              <p className="meta">这里只截取最能解释当前 run 的最近任务变化，帮助你判断处理完这次执行后该如何回流到主任务。</p>
              <div className="timeline-list">
                {relatedTimelineGroups.length ? (
                  relatedTimelineGroups.map((group) => (
                    <Fragment key={group.id}>
                      <div className="timeline-group-heading">
                        <span>{group.title}</span>
                        <span>{group.events.length}</span>
                      </div>
                      {group.events.map((event) => (
                        <div className="timeline-item" key={event.id}>
                          <div className="task-row">
                            <strong>{formatRelatedTimelineSummary(event)}</strong>
                            <div className="task-row-compact">
                              {getTaskTimelineLaneLabel(event.type) ? (
                                <span className={`status lane-status lane-status-${getTaskTimelineLane(event.type)}`}>
                                  {getTaskTimelineLaneLabel(event.type)}
                                </span>
                              ) : null}
                              <span className="status">{event.createdAt}</span>
                            </div>
                          </div>
                          <p className="meta">{event.type}</p>
                          {getTaskTimelineResponsibilitySummary(event) ? (
                            <p className="meta">{getTaskTimelineResponsibilitySummary(event)}</p>
                          ) : null}
                          {getRelatedTimelineActionLabel(event) || getRelatedTimelineObjectLabel(event) ? (
                            <div className="chip-row">
                              {getRelatedTimelineActionLabel(event) ? (
                                <button
                                  className="ghost-button"
                                  onClick={() =>
                                    onOpenTask(detail.taskId, {
                                      type: 'focus_next_step',
                                      focusArea: 'detail',
                                      prefillNextStep:
                                        event.type === 'task.run_failed'
                                          ? `检查最近一次 ${detail.type} run 的失败原因，并决定是否重试。`
                                          : `审阅最近一次 ${detail.type} run 的结果，并决定是否继续推进。`,
                                    })
                                  }
                                  type="button"
                                >
                                  {getRelatedTimelineActionLabel(event)}
                                </button>
                              ) : null}
                              {getRelatedTimelineObjectLabel(event) ? (
                                <button
                                  className="ghost-button"
                                  onClick={() => handleRelatedTimelineObjectOpen(event)}
                                  type="button"
                                >
                                  {getRelatedTimelineObjectLabel(event)}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </Fragment>
                  ))
                ) : (
                  <p className="meta">当前没有和这次 run 强相关的最近任务历史。</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="meta">先创建或选择一个 run。</p>
        )}

        <div className="transition-group detail-stage">
          <div className="detail-stage-head">
            <div>
              <p className="eyebrow">Action Desk</p>
              <h3>触发新的 Run</h3>
            </div>
            <p className="meta">这里保留最小的执行入口，方便基于当前任务重新发起 draft 或 summarize。</p>
          </div>
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!form.taskId) {
                return;
              }
              const created = await onTriggerRun(form);
              setSelectedRunId(created.id);
              await onRefresh();
            }}
          >
            <label>
              关联任务
              <select
                value={form.taskId}
                onChange={(event) => setForm((current) => ({ ...current, taskId: event.target.value }))}
              >
                <option value="">选择任务</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Run 类型
              <select
                value={form.type}
                onChange={(event) => {
                  const nextType = event.target.value as CreateRunInput['type'];
                  setForm((current) => ({
                    ...current,
                    type: nextType,
                    allowLocalWorkspaceRead: nextType === 'agent'
                      ? current.allowLocalWorkspaceRead
                      : undefined,
                    allowTaskMutationTools: nextType === 'agent'
                      ? current.allowTaskMutationTools
                      : undefined,
                  }));
                }}
              >
                <option value="draft">draft</option>
                <option value="summarize">summarize</option>
                <option value="agent">agent</option>
              </select>
            </label>
            <label>
              附加要求
              <textarea
                rows={4}
                value={form.instructions}
                onChange={(event) =>
                  setForm((current) => ({ ...current, instructions: event.target.value }))
                }
              />
            </label>
            {form.type === 'agent' ? (
              <>
                <label>
                  <input
                    checked={Boolean(form.allowLocalWorkspaceRead)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allowLocalWorkspaceRead: event.target.checked || undefined,
                      }))
                    }
                    type="checkbox"
                  />
                  允许只读工作区上下文
                </label>
                <label>
                  <input
                    checked={Boolean(form.allowTaskMutationTools)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allowTaskMutationTools: event.target.checked || undefined,
                      }))
                    }
                    type="checkbox"
                  />
                  允许任务内更新/证据工具
                </label>
                <p className="meta">
                  {formatPreRunAgentCapabilitySummary(
                    aiStatus,
                    Boolean(form.allowLocalWorkspaceRead),
                    Boolean(form.allowTaskMutationTools),
                  )}
                </p>
              </>
            ) : null}
            <div className="chip-row">
              <button type="submit">触发 Run</button>
              <button
                className="ghost-button"
                disabled={!form.taskId || !onTriggerOperatorStartedRun}
                onClick={() => void triggerBrowserEvidenceSmoke()}
                type="button"
              >
                运行 Browser Evidence Smoke
              </button>
            </div>
          </form>
        </div>
      </article>

      <article className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Runs</p>
            <h2>Run Queue</h2>
          </div>
        </div>
        <div className="task-list">
          {runs.length === 0 ? (
            <p className="meta">还没有执行记录。</p>
          ) : (
            runs.map((run) => (
              <button
                className={`task-card task-card-button ${
                  run.id === selectedRunId ? 'task-card-active' : ''
                }`}
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
                type="button"
              >
                <div className="task-row">
                  <strong>{run.type}</strong>
                  <span className="status">{run.status}</span>
                </div>
                <p className="meta">{run.taskId}</p>
                <p className="meta">
                  {run.outputSource ? `来源：${run.outputSource}` : '来源：尚未产生'}
                </p>
              </button>
            ))
          )}
        </div>
      </article>
    </section>
  );
}

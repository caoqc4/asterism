import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  AgentPolicy,
  AgentToolName,
  AgentToolResult,
  AgentToolRisk,
  AgentWorkingContext,
} from '../../../shared/types/agent-execution.js';
import { evaluateRuntimeAction } from '../../../shared/runtime-action-evaluator.js';
import { evaluateRuntimeVerification } from '../../../shared/runtime-verification.js';
import { buildRuntimeRecoveryGuidance } from '../../../shared/runtime-recovery-guidance.js';
import type { TaskMdDurableField } from '../../../shared/task-md-update-need.js';
import type { DecisionDraftRecord, DraftDecisionInput } from '../../../shared/types/decision.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import type {
  SourceContextCredibility,
  SourceContextKind,
  SourceContextRole,
} from '../../../shared/types/source-context.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import type { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import type { TaskService } from '../task/task-service.js';
import { AgentCheckpointRecorder } from './agent-checkpoint-recorder.js';

export type AgentToolDefinition = {
  name: AgentToolName;
  description: string;
  risk: AgentToolRisk;
  requiresConfirmation: boolean;
};

type ToolExecutionContext = {
  runId: string;
  taskId: string;
  sessionId?: string | null;
  workingContext?: AgentWorkingContext;
};

type DecisionDraftService = {
  draft(input: DraftDecisionInput): Promise<DecisionDraftRecord>;
};

type ArtifactCreateNoteInput = {
  title: string;
  content: string;
};

type DecisionDraftToolInput = {
  note?: string | null;
};

type TaskUpdateNextStepInput = {
  nextStep: string;
};

type TaskCreateCompletionCriterionInput = {
  text: string;
};

type SourceContextCreateInput = {
  title: string;
  kind?: SourceContextKind;
  isKey?: boolean;
  uri?: string | null;
  content?: string | null;
  note?: string | null;
  capturedAt?: string | null;
  batchId?: string | null;
  sourceRole?: SourceContextRole;
  credibility?: SourceContextCredibility | null;
  isDuplicate?: boolean;
  containsSensitiveData?: boolean;
};

type WorkspaceReadFileInput = {
  path: string;
};

type WorkspaceSearchInput = {
  query: string;
  maxResults?: number;
};

type WorkspaceRunCommandInput = {
  summary: string;
  script: string;
  args: string[];
  timeoutMs: number;
};

type WorkspaceWritePatchInput = {
  summary: string;
  patch: string;
  expectedFiles: string[];
};

const WORKSPACE_READ_LIMIT = 20_000;
const WORKSPACE_SEARCH_MAX_RESULTS = 25;
const WORKSPACE_PATCH_MAX_BYTES = 40_000;
const WORKSPACE_COMMAND_OUTPUT_LIMIT = 20_000;
const WORKSPACE_COMMAND_DEFAULT_TIMEOUT_MS = 120_000;
const WORKSPACE_COMMAND_MAX_TIMEOUT_MS = 300_000;
const PRODUCT_PRINCIPLES_PROTECTED_FILES = new Set([
  'src/shared/agent-principles.ts',
  'src/shared/task-advancement-framework.ts',
  'src/shared/core-agent-context.ts',
  'docs/specs/goalpilot-task-advancement-framework.md',
]);
const sourceContextKinds = new Set<SourceContextKind>(['link', 'doc', 'issue', 'pr', 'website_list', 'note']);
const sourceContextRoles = new Set<SourceContextRole>(['raw', 'digest', 'stable_reference']);
const sourceContextCredibilities = new Set<SourceContextCredibility>(['verified', 'unknown', 'low']);
const WORKSPACE_COMMAND_ALLOWED_SCRIPTS = new Set([
  'test',
  'lint',
]);
const WORKSPACE_SEARCH_SKIP_DIRS = new Set([
  '.git',
  'dist',
  'dist-electron',
  'node_modules',
  'release',
]);
const WORKSPACE_SEARCH_SKIP_EXTENSIONS = new Set([
  '.db',
  '.ico',
  '.jpg',
  '.jpeg',
  '.png',
  '.sqlite',
  '.webp',
]);

function parseArtifactCreateNoteInput(input: unknown): ArtifactCreateNoteInput {
  if (!input || typeof input !== 'object') {
    throw new Error('artifact.create_note requires an object input.');
  }

  const candidate = input as Partial<ArtifactCreateNoteInput>;
  const title = candidate.title?.trim();
  const content = candidate.content?.trim();

  if (!title) {
    throw new Error('artifact.create_note requires a title.');
  }

  if (!content) {
    throw new Error('artifact.create_note requires content.');
  }

  return { title, content };
}

function parseDecisionDraftToolInput(input: unknown): DecisionDraftToolInput {
  if (input === undefined || input === null) {
    return {};
  }

  if (typeof input !== 'object') {
    throw new Error('decision.draft requires an object input.');
  }

  const candidate = input as Partial<DecisionDraftToolInput>;

  return {
    note: candidate.note?.trim() || null,
  };
}

function parseTaskUpdateNextStepInput(input: unknown): TaskUpdateNextStepInput {
  if (!input || typeof input !== 'object') {
    throw new Error('task.update_next_step requires an object input.');
  }

  const candidate = input as Partial<TaskUpdateNextStepInput>;
  const nextStep = candidate.nextStep?.trim();

  if (!nextStep) {
    throw new Error('task.update_next_step requires nextStep.');
  }

  return { nextStep };
}

function parseTaskCreateCompletionCriterionInput(input: unknown): TaskCreateCompletionCriterionInput {
  if (!input || typeof input !== 'object') {
    throw new Error('task.create_completion_criterion requires an object input.');
  }

  const candidate = input as Partial<TaskCreateCompletionCriterionInput>;
  const text = candidate.text?.trim();

  if (!text) {
    throw new Error('task.create_completion_criterion requires text.');
  }

  return { text };
}

function parseSourceContextCreateInput(input: unknown): Required<Pick<SourceContextCreateInput, 'kind' | 'title'>> & Omit<SourceContextCreateInput, 'kind' | 'title'> {
  if (!input || typeof input !== 'object') {
    throw new Error('source_context.create requires an object input.');
  }

  const candidate = input as Partial<SourceContextCreateInput>;
  const title = candidate.title?.trim();
  const kind = candidate.kind ?? 'note';

  if (!title) {
    throw new Error('source_context.create requires a title.');
  }

  if (!sourceContextKinds.has(kind)) {
    throw new Error(`source_context.create received unsupported kind: ${kind}`);
  }

  if (candidate.sourceRole !== undefined && !sourceContextRoles.has(candidate.sourceRole)) {
    throw new Error(`source_context.create received unsupported sourceRole: ${candidate.sourceRole}`);
  }

  if (candidate.credibility !== undefined && candidate.credibility !== null && !sourceContextCredibilities.has(candidate.credibility)) {
    throw new Error(`source_context.create received unsupported credibility: ${candidate.credibility}`);
  }

  if (candidate.isDuplicate !== undefined && typeof candidate.isDuplicate !== 'boolean') {
    throw new Error('source_context.create requires isDuplicate to be boolean when provided.');
  }

  if (candidate.containsSensitiveData !== undefined && typeof candidate.containsSensitiveData !== 'boolean') {
    throw new Error('source_context.create requires containsSensitiveData to be boolean when provided.');
  }

  return {
    title,
    kind,
    isKey: candidate.isKey,
    uri: candidate.uri,
    content: candidate.content,
    note: candidate.note,
    capturedAt: candidate.capturedAt,
    batchId: candidate.batchId,
    sourceRole: candidate.sourceRole,
    credibility: candidate.credibility,
    isDuplicate: candidate.isDuplicate,
    containsSensitiveData: candidate.containsSensitiveData,
  };
}

function parseWorkspaceReadFileInput(input: unknown): WorkspaceReadFileInput {
  if (!input || typeof input !== 'object') {
    throw new Error('workspace.read_file requires an object input.');
  }

  const candidate = input as Partial<WorkspaceReadFileInput>;
  const filePath = candidate.path?.trim();

  if (!filePath) {
    throw new Error('workspace.read_file requires a path.');
  }

  return { path: filePath };
}

function parseWorkspaceSearchInput(input: unknown): WorkspaceSearchInput {
  if (!input || typeof input !== 'object') {
    throw new Error('workspace.search requires an object input.');
  }

  const candidate = input as Partial<WorkspaceSearchInput>;
  const query = candidate.query?.trim();

  if (!query) {
    throw new Error('workspace.search requires a query.');
  }

  const maxResults = typeof candidate.maxResults === 'number'
    ? Math.max(1, Math.min(WORKSPACE_SEARCH_MAX_RESULTS, Math.floor(candidate.maxResults)))
    : WORKSPACE_SEARCH_MAX_RESULTS;

  return { query, maxResults };
}

function parseWorkspaceRunCommandInput(input: unknown): WorkspaceRunCommandInput {
  if (!input || typeof input !== 'object') {
    throw new Error('workspace.run_command requires an object input.');
  }

  const candidate = input as Partial<WorkspaceRunCommandInput>;
  const summary = candidate.summary?.trim();
  const script = candidate.script?.trim();
  const args = Array.isArray(candidate.args)
    ? candidate.args.map((item) => (typeof item === 'string' ? item : ''))
    : [];
  const timeoutMs = typeof candidate.timeoutMs === 'number'
    ? Math.max(1_000, Math.min(WORKSPACE_COMMAND_MAX_TIMEOUT_MS, Math.floor(candidate.timeoutMs)))
    : WORKSPACE_COMMAND_DEFAULT_TIMEOUT_MS;

  if (!summary) {
    throw new Error('workspace.run_command requires a summary.');
  }

  if (!script) {
    throw new Error('workspace.run_command requires a script.');
  }

  if (!WORKSPACE_COMMAND_ALLOWED_SCRIPTS.has(script)) {
    throw new Error(`workspace.run_command script is not allowed: ${script}`);
  }

  if (args.some((item) => !item)) {
    throw new Error('workspace.run_command args must be strings.');
  }

  return { summary, script, args, timeoutMs };
}

function parseWorkspaceWritePatchInput(input: unknown): WorkspaceWritePatchInput {
  if (!input || typeof input !== 'object') {
    throw new Error('workspace.write_patch requires an object input.');
  }

  const candidate = input as Partial<WorkspaceWritePatchInput>;
  const summary = candidate.summary?.trim();
  const patch = typeof candidate.patch === 'string' ? candidate.patch : '';
  const expectedFiles = Array.isArray(candidate.expectedFiles)
    ? candidate.expectedFiles.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : [];

  if (!summary) {
    throw new Error('workspace.write_patch requires a summary.');
  }

  if (!patch.trim()) {
    throw new Error('workspace.write_patch requires a patch.');
  }

  if (Buffer.byteLength(patch, 'utf8') > WORKSPACE_PATCH_MAX_BYTES) {
    throw new Error('workspace.write_patch patch is too large.');
  }

  if (!expectedFiles.length) {
    throw new Error('workspace.write_patch requires expectedFiles.');
  }

  return { summary, patch, expectedFiles };
}

function resolveWorkspacePath(workspaceRoot: string, requestedPath: string): string {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, requestedPath);
  const relative = path.relative(root, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Workspace path must stay inside the configured workspace root.');
  }

  return resolved;
}

type ParsedPatchOperation =
  | {
      type: 'add';
      file: string;
      content: string;
    }
  | {
      type: 'update';
      file: string;
      replacements: Array<{
        oldText: string;
        newText: string;
      }>;
    };

type ParsedPatchReplacement = Extract<ParsedPatchOperation, { type: 'update' }>['replacements'][number];

function normalizePatchFilePath(filePath: string): string {
  return filePath.replace(/^a\//, '').replace(/^b\//, '').trim();
}

function parseApplyPatch(patch: string): ParsedPatchOperation[] {
  const lines = patch.replace(/\r\n/g, '\n').split('\n');
  const operations: ParsedPatchOperation[] = [];
  let index = 0;

  if (lines[index]?.trim() !== '*** Begin Patch') {
    throw new Error('workspace.write_patch patch must start with *** Begin Patch.');
  }
  index += 1;

  while (index < lines.length) {
    const line = lines[index];

    if (line?.trim() === '*** End Patch') {
      return operations;
    }

    if (line?.startsWith('*** Delete File:') || line?.startsWith('*** Move to:')) {
      throw new Error('workspace.write_patch does not support delete or move operations.');
    }

    if (line?.startsWith('*** Add File:')) {
      const file = normalizePatchFilePath(line.slice('*** Add File:'.length));
      index += 1;
      const contentLines: string[] = [];

      while (index < lines.length && !lines[index]?.startsWith('*** ')) {
        const contentLine = lines[index];
        if (!contentLine?.startsWith('+')) {
          throw new Error('workspace.write_patch add-file lines must start with +.');
        }
        contentLines.push(contentLine.slice(1));
        index += 1;
      }

      operations.push({ type: 'add', file, content: `${contentLines.join('\n')}\n` });
      continue;
    }

    if (line?.startsWith('*** Update File:')) {
      const file = normalizePatchFilePath(line.slice('*** Update File:'.length));
      index += 1;
      const replacements: ParsedPatchReplacement[] = [];

      while (index < lines.length && !lines[index]?.startsWith('*** ')) {
        if (!lines[index]?.startsWith('@@')) {
          index += 1;
          continue;
        }

        index += 1;
        const oldLines: string[] = [];
        const newLines: string[] = [];

        while (index < lines.length && !lines[index]?.startsWith('@@') && !lines[index]?.startsWith('*** ')) {
          const patchLine = lines[index] ?? '';
          const prefix = patchLine[0];
          const body = patchLine.slice(1);

          if (prefix === ' ') {
            oldLines.push(body);
            newLines.push(body);
          } else if (prefix === '-') {
            oldLines.push(body);
          } else if (prefix === '+') {
            newLines.push(body);
          } else if (patchLine.trim() !== '') {
            throw new Error('workspace.write_patch update lines must start with space, -, or +.');
          }

          index += 1;
        }

        replacements.push({
          oldText: `${oldLines.join('\n')}\n`,
          newText: `${newLines.join('\n')}\n`,
        });
      }

      if (!replacements.length) {
        throw new Error(`workspace.write_patch update for ${file} must include at least one hunk.`);
      }

      operations.push({ type: 'update', file, replacements });
      continue;
    }

    throw new Error('workspace.write_patch contains an unsupported patch section.');
  }

  throw new Error('workspace.write_patch patch must end with *** End Patch.');
}

function getPatchTouchedFiles(operations: ParsedPatchOperation[]): string[] {
  return [...new Set(operations.map((operation) => operation.file))];
}

function assertNoProtectedProductPrincipleWrites(files: string[]): void {
  const protectedFile = files.find((file) => PRODUCT_PRINCIPLES_PROTECTED_FILES.has(file));

  if (protectedFile) {
    throw new Error(`workspace.write_patch cannot modify read-only product principles: ${protectedFile}`);
  }
}

async function buildWorkspacePatchPreview(params: {
  input: WorkspaceWritePatchInput;
  workspaceRoot: string;
}): Promise<string> {
  const operations = parseApplyPatch(params.input.patch);
  const touchedFiles = getPatchTouchedFiles(operations);
  const expected = new Set(params.input.expectedFiles);

  if (!operations.length) {
    throw new Error('workspace.write_patch patch does not contain any file operation.');
  }

  assertNoProtectedProductPrincipleWrites(touchedFiles);

  for (const file of touchedFiles) {
    if (!expected.has(file)) {
      throw new Error(`workspace.write_patch touched unexpected file: ${file}`);
    }

    resolveWorkspacePath(params.workspaceRoot, file);
  }

  return [
    `Summary: ${params.input.summary}`,
    `Files: ${touchedFiles.join(', ')}`,
    params.input.patch,
  ].join('\n\n');
}

async function applyWorkspacePatch(params: {
  input: WorkspaceWritePatchInput;
  workspaceRoot: string;
}): Promise<string[]> {
  const operations = parseApplyPatch(params.input.patch);
  const expected = new Set(params.input.expectedFiles);
  const touchedFiles = getPatchTouchedFiles(operations);
  const pendingWrites: Array<{
    filePath: string;
    content: string;
    ensureDirectory: boolean;
  }> = [];

  assertNoProtectedProductPrincipleWrites(touchedFiles);

  for (const file of touchedFiles) {
    if (!expected.has(file)) {
      throw new Error(`workspace.write_patch touched unexpected file: ${file}`);
    }
  }

  for (const operation of operations) {
    const filePath = resolveWorkspacePath(params.workspaceRoot, operation.file);

    if (operation.type === 'add') {
      try {
        await fs.stat(filePath);
        throw new Error(`workspace.write_patch add target already exists: ${operation.file}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      pendingWrites.push({
        filePath,
        content: operation.content,
        ensureDirectory: true,
      });
      continue;
    }

    const stat = await fs.stat(filePath);

    if (!stat.isFile()) {
      throw new Error('workspace.write_patch can only update files.');
    }

    let content = await fs.readFile(filePath, 'utf8');

    for (const replacement of operation.replacements) {
      if (!content.includes(replacement.oldText)) {
        throw new Error(`workspace.write_patch could not match update hunk in ${operation.file}.`);
      }

      content = content.replace(replacement.oldText, replacement.newText);
    }

    pendingWrites.push({
      filePath,
      content,
      ensureDirectory: false,
    });
  }

  for (const write of pendingWrites) {
    if (write.ensureDirectory) {
      await fs.mkdir(path.dirname(write.filePath), { recursive: true });
    }

    await fs.writeFile(write.filePath, write.content, 'utf8');
  }

  return touchedFiles;
}

function buildConfirmationDecisionTitle(name: AgentToolName, risk: AgentToolRisk): string {
  const riskLabel: Record<AgentToolRisk, string> = {
    safe_read: '安全读取',
    local_command: '本地命令',
    local_write: '本地写入',
    external_read: '外部读取',
    external_write: '外部写入',
    sensitive: '敏感操作',
  };

  return `确认${riskLabel[risk]}：${name}`;
}

function formatWorkingContextSummary(context: AgentWorkingContext): string {
  return [
    `任务：${context.task.title}`,
    `状态：${context.task.state}`,
    `下一步：${context.task.nextStep ?? '暂无'}`,
    `优先级语义：${context.priorityLane}`,
    `恢复摘要：${context.resumeSummary}`,
    `完成标准：${context.completion.satisfied}/${context.completion.total}`,
    context.completion.nextOpenCriterion
      ? `下一条未完成标准：${context.completion.nextOpenCriterion}`
      : '下一条未完成标准：暂无',
    `阻塞项：${context.blockers.map((item) => item.title).join('；') || '无'}`,
    `依赖项：${context.dependencies.map((item) => item.title).join('；') || '无'}`,
    `关键来源：${context.sources.filter((item) => item.isKey).map((item) => item.title).join('；') || '无'}`,
    `工作产物：${context.artifacts.map((item) => `${item.title} (${item.kind})${item.contentPreview ? `：${item.contentPreview}` : ''}`).join('；') || '无'}`,
    `任务文件：${(context.taskFiles ?? []).map((item) => `${item.path} (${item.kind})${item.contentPreview ? `：${item.contentPreview}` : ''}`).join('；') || '无'}`,
    `方法模板：${context.processTemplates.map((item) => item.title).join('；') || '无'}`,
  ].join('\n');
}

function formatTimelineSummary(context: AgentWorkingContext): string {
  if (!context.recentTimeline.length) {
    return '最近没有可用的任务时间线事件。';
  }

  return context.recentTimeline
    .map((event, index) => formatTimelineEventObservation(event, index))
    .join('\n');
}

function formatTimelineEventObservation(
  event: AgentWorkingContext['recentTimeline'][number],
  index: number,
): string {
  const scanPath = [
    event.dateGroup,
    event.objectFamily,
    event.priorityGroup,
  ].filter(Boolean).join(' / ');
  const prefix = scanPath ? `${event.createdAt} · ${scanPath}` : event.createdAt;

  return `${index + 1}. ${prefix} · ${event.type} · ${event.summary}`;
}

function assertTaskMutationAllowed(context: ToolExecutionContext): void {
  const evaluation = evaluateRuntimeAction({
    action: 'task_mutation',
    fromTaskId: context.taskId,
    targetTaskId: context.taskId,
  });
  const verification = evaluateRuntimeVerification({
    mode: 'pre_step',
    action: evaluation,
    hasRequiredContext: true,
  });

  if (!verification.canProceed) {
    throw new Error(verification.detail);
  }
}

const durableAgentTools = new Set<AgentToolName>([
  'task.update_next_step',
  'task.create_completion_criterion',
  'artifact.create_note',
  'source_context.create',
]);

function buildAgentToolPostStep(name: AgentToolName, result: AgentToolResult, context: ToolExecutionContext): RunStepRecord {
  const timestamp = new Date().toISOString();
  return {
    id: `agent_tool_post_step_${timestamp}`,
    runId: context.runId,
    index: 1,
    kind: 'tool_result',
    status: result.success ? 'completed' : 'failed',
    title: `工具后置检查：${name}`,
    input: null,
    output: result.output ?? result.summary,
    error: result.error ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function verifyDurableAgentToolResult(name: AgentToolName, result: AgentToolResult, context: ToolExecutionContext): void {
  if (!durableAgentTools.has(name) || !result.success) return;
  const verification = evaluateRuntimeVerification({
    mode: 'post_step',
    step: buildAgentToolPostStep(name, result, context),
    producedDurableChange: true,
    hasRecoveryNote: Boolean((result.output ?? result.summary).trim()),
  });
  if (!verification.canProceed) {
    throw new Error(verification.detail);
  }
}

function withRuntimeRecoveryGuidance(
  name: AgentToolName,
  result: AgentToolResult,
  context: ToolExecutionContext,
): AgentToolResult {
  if (!durableAgentTools.has(name) || !result.success) return result;
  const text = [result.summary, result.output].filter(Boolean).join('\n');

  const guidance = buildRuntimeRecoveryGuidance({
    text,
    hasTaskContext: Boolean(context.taskId),
    importantFilePath: name === 'artifact.create_note' ? result.artifactId ?? result.summary : null,
    producedDurableChange: true,
    taskRecordProducedDurableChange: name === 'source_context.create' ? false : undefined,
    taskMdDurableFields: durableTaskMdFieldsForTool(name),
    includeTaskRecord: name === 'source_context.create',
  });

  return guidance.items.length
    ? {
        ...result,
        recoveryGuidance: guidance.messages,
        recoveryGuidanceItems: guidance.items.map((item) => ({
          target: item.target,
          message: item.message,
          reason: item.evaluation.reason,
          referencePath: item.referencePath ?? null,
        })),
      }
    : result;
}

function durableTaskMdFieldsForTool(name: AgentToolName): TaskMdDurableField[] {
  switch (name) {
    case 'task.update_next_step':
      return ['nextStep'];
    case 'task.create_completion_criterion':
      return ['completionCriteria'];
    case 'artifact.create_note':
      return ['artifact'];
    case 'source_context.create':
      return ['sourceContext'];
    default:
      return [];
  }
}

function formatRuntimeRecoveryGuidance(result: AgentToolResult): string | null {
  if (!result.recoveryGuidanceItems?.length) return null;
  return result.recoveryGuidanceItems
    .map((item) => {
      const target = item.target === 'task_md' ? 'Task.md' : 'Task Record';
      const reference = item.referencePath ? ` / reference=${item.referencePath}` : '';
      return `- ${target}: ${item.reason}${reference}`;
    })
    .join('\n');
}

function formatRuntimeRecoveryGuidanceInput(result: AgentToolResult): string | null {
  if (!result.recoveryGuidanceItems?.length) return null;
  const referencedItems = result.recoveryGuidanceItems
    .filter((item) => Boolean(item.referencePath))
    .map((item) => ({
      target: item.target,
      reason: item.reason,
      referencePath: item.referencePath ?? null,
    }));
  return JSON.stringify({
    targets: Array.from(new Set(result.recoveryGuidanceItems.map((item) => item.target))),
    ...(referencedItems.length ? { items: referencedItems } : {}),
  });
}

function isPotentialCompletionEvidence(event: AgentWorkingContext['recentTimeline'][number]): boolean {
  return (
    event.type === 'task.decision_approved' ||
    event.type === 'task.run_completed' ||
    event.type === 'artifact.created' ||
    event.summary.includes('完成') ||
    event.summary.includes('收尾') ||
    event.summary.includes('证据')
  );
}

function formatCompletionEvidenceReview(context: AgentWorkingContext): string {
  const evidence = context.recentTimeline.filter(isPotentialCompletionEvidence);
  const artifacts = context.artifacts.slice(0, 5);
  const missingEvidence = context.completion.nextOpenCriterion
    ? `仍需补证据或人工确认：${context.completion.nextOpenCriterion}`
    : context.completion.open > 0
      ? `仍有 ${context.completion.open} 条完成标准未满足，需要人工核对。`
      : '当前没有未完成标准；仍需用户确认是否转为 completed。';
  const blockers = context.blockers.length
    ? `阻塞项仍存在：${context.blockers.map((item) => item.title).join('；')}`
    : '阻塞项：无';
  const dependencies = context.dependencies.length
    ? `依赖项仍存在：${context.dependencies.map((item) => item.title).join('；')}`
    : '依赖项：无';

  return [
    '完成证据审查：只读结果，不会满足完成标准或完成任务。',
    `完成标准进度：${context.completion.satisfied}/${context.completion.total}`,
    missingEvidence,
    blockers,
    dependencies,
    evidence.length
      ? [
          '可能支持收尾的近期证据：',
          ...evidence.map((event, index) => formatTimelineEventObservation(event, index)),
        ].join('\n')
      : '可能支持收尾的近期证据：暂无。',
    artifacts.length
      ? [
          '可复核工作产物：',
          ...artifacts.map((artifact, index) => `${index + 1}. ${artifact.title} (${artifact.kind}) · ${artifact.sourceType} · ${artifact.updatedAt}${artifact.contentPreview ? ` · ${artifact.contentPreview}` : ''}`),
        ].join('\n')
      : '可复核工作产物：暂无。',
    context.task.riskLevel === 'none'
      ? '建议：用户复核证据后再手动满足标准或完成任务。'
      : `建议：该任务风险为 ${context.task.riskLevel}，收尾前建议先草拟或处理 Decision。`,
  ].join('\n');
}

async function walkWorkspace(root: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') {
        continue;
      }

      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!WORKSPACE_SEARCH_SKIP_DIRS.has(entry.name)) {
          await visit(absolutePath);
        }
        continue;
      }

      if (entry.isFile() && !WORKSPACE_SEARCH_SKIP_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(absolutePath);
      }
    }
  }

  await visit(root);
  return files;
}

async function readPackageScripts(workspaceRoot: string): Promise<Record<string, string>> {
  const packageJsonPath = resolveWorkspacePath(workspaceRoot, 'package.json');
  let rawPackageJson: string;

  try {
    rawPackageJson = await fs.readFile(packageJsonPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('workspace.run_command requires package.json in the workspace root.');
    }

    throw error;
  }

  const packageJson = JSON.parse(rawPackageJson) as {
    scripts?: unknown;
  };

  if (!packageJson.scripts || typeof packageJson.scripts !== 'object' || Array.isArray(packageJson.scripts)) {
    return {};
  }

  return packageJson.scripts as Record<string, string>;
}

async function runWorkspacePackageScript(params: {
  input: WorkspaceRunCommandInput;
  workspaceRoot: string;
}): Promise<string> {
  const root = path.resolve(params.workspaceRoot);
  const scripts = await readPackageScripts(root);

  if (typeof scripts[params.input.script] !== 'string') {
    throw new Error(`workspace.run_command script not found in package.json: ${params.input.script}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      'npm',
      ['run', params.input.script, '--', ...params.input.args],
      {
        cwd: root,
        env: {
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
          CI: '1',
        },
        shell: false,
      },
    );
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, params.input.timeoutMs);

    function append(chunk: Buffer): void {
      output += chunk.toString('utf8');
      if (output.length > WORKSPACE_COMMAND_OUTPUT_LIMIT) {
        output = `${output.slice(0, WORKSPACE_COMMAND_OUTPUT_LIMIT)}\n[truncated]`;
      }
    }

    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error(`workspace.run_command timed out after ${params.input.timeoutMs}ms.`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`workspace.run_command exited with code ${code}.\n${output.trim()}`.trim()));
        return;
      }

      resolve(output.trim());
    });
  });
}

export class AgentToolRegistry {
  private readonly definitions: AgentToolDefinition[] = [
    {
      name: 'task.inspect_context',
      description: 'Inspect the current Taskplane working context snapshot for this run.',
      risk: 'safe_read',
      requiresConfirmation: false,
    },
    {
      name: 'task.inspect_timeline',
      description: 'Inspect recent Taskplane timeline events available in the working context.',
      risk: 'safe_read',
      requiresConfirmation: false,
    },
    {
      name: 'task.review_completion_evidence',
      description: 'Review completion criteria and recent evidence without mutating task closeout state.',
      risk: 'safe_read',
      requiresConfirmation: false,
    },
    {
      name: 'task.update_next_step',
      description: 'Update the current Taskplane task next step through TaskService.',
      risk: 'local_write',
      requiresConfirmation: false,
    },
    {
      name: 'task.create_completion_criterion',
      description: 'Create an open completion criterion for the current Taskplane task through TaskService.',
      risk: 'local_write',
      requiresConfirmation: false,
    },
    {
      name: 'artifact.create_note',
      description: 'Create a local note artifact attached to the current Taskplane run.',
      risk: 'local_write',
      requiresConfirmation: false,
    },
    {
      name: 'decision.draft',
      description: 'Draft a Decision proposal for the current Taskplane task without creating a formal Decision.',
      risk: 'local_write',
      requiresConfirmation: false,
    },
    {
      name: 'source_context.create',
      description: 'Create a source context item for the current Taskplane task through TaskService.',
      risk: 'local_write',
      requiresConfirmation: false,
    },
    {
      name: 'workspace.search',
      description: 'Search text files inside the configured local workspace root.',
      risk: 'safe_read',
      requiresConfirmation: false,
    },
    {
      name: 'workspace.read_file',
      description: 'Read a text file inside the configured local workspace root.',
      risk: 'safe_read',
      requiresConfirmation: false,
    },
    {
      name: 'workspace.run_command',
      description: 'Run a confirmed allowlisted package script inside the configured local workspace root.',
      risk: 'local_command',
      requiresConfirmation: true,
    },
    {
      name: 'workspace.write_patch',
      description: 'Apply a bounded textual patch inside the configured local workspace root.',
      risk: 'local_write',
      requiresConfirmation: true,
    },
  ];

  constructor(
    private readonly artifactRepository: ArtifactRepository,
    private readonly runStepRepository: RunStepRepository,
    private readonly runCheckpointRepository: RunCheckpointRepository = new RunCheckpointRepository(),
    private readonly decisionRepository: Pick<DecisionRepository, 'create'> | null = null,
    private readonly workspaceRootResolver: () => string = () => process.cwd(),
    private readonly taskService: Pick<TaskService, 'createCompletionCriteria' | 'createSourceContext' | 'update'> | null = null,
  ) {
    this.checkpointRecorder = new AgentCheckpointRecorder(
      this.runCheckpointRepository,
      this.runStepRepository,
      this.decisionRepository,
    );
  }

  private decisionDraftService: DecisionDraftService | null = null;
  private readonly checkpointRecorder: AgentCheckpointRecorder;

  setDecisionDraftService(decisionDraftService: DecisionDraftService): void {
    this.decisionDraftService = decisionDraftService;
  }

  list(): AgentToolDefinition[] {
    return this.definitions;
  }

  async execute(
    name: AgentToolName,
    input: unknown,
    context: ToolExecutionContext,
    policy?: AgentPolicy,
  ): Promise<AgentToolResult> {
    const definition = this.definitions.find((item) => item.name === name);

    if (!definition) {
      throw new Error(`Unknown agent tool: ${name}`);
    }

    const callStep = await this.runStepRepository.create({
      runId: context.runId,
      kind: 'tool_call',
      status: 'running',
      title: `调用工具：${name}`,
      input: JSON.stringify(input),
    });

    try {
      const highRiskCompletionCriterionInput =
        name === 'task.create_completion_criterion' &&
        context.workingContext?.task.riskLevel === 'high'
          ? parseTaskCreateCompletionCriterionInput(input)
          : null;
      const requiresConfirmation =
        Boolean(highRiskCompletionCriterionInput) ||
        Boolean(policy?.confirmationRequiredRisks.includes(definition.risk));

      if (requiresConfirmation) {
        if (name === 'workspace.write_patch') {
          if (!policy?.allowLocalFileWrite) {
            throw new Error('workspace.write_patch requires allowLocalFileWrite policy.');
          }

          const parsed = parseWorkspaceWritePatchInput(input);
          const workspaceRoot = this.workspaceRootResolver();
          const diffPreview = await buildWorkspacePatchPreview({
            input: parsed,
            workspaceRoot,
          });
          const decisionTitle = buildConfirmationDecisionTitle(name, definition.risk);
          const checkpoint = await this.checkpointRecorder.createToolPermissionCheckpoint({
            runId: context.runId,
            taskId: context.taskId,
            agentSessionId: context.sessionId,
            stepId: callStep.id,
            tool: name,
            risk: definition.risk,
            input: {
              ...parsed,
              diffPreview,
            },
            decisionTitle,
            preview: diffPreview,
          });

          return {
            success: false,
            status: 'needs_confirmation',
            summary: checkpoint.summary,
            checkpointId: checkpoint.checkpointId,
            checkpointKind: 'tool_permission',
            checkpointEvent: checkpoint.event,
            decisionId: checkpoint.decisionId,
          };
        }

        if (name === 'workspace.run_command') {
          if (!policy?.allowLocalCommandRun) {
            throw new Error('workspace.run_command requires allowLocalCommandRun policy.');
          }

          const parsed = parseWorkspaceRunCommandInput(input);
          const workspaceRoot = this.workspaceRootResolver();
          const scripts = await readPackageScripts(workspaceRoot);
          if (typeof scripts[parsed.script] !== 'string') {
            throw new Error(`workspace.run_command script not found in package.json: ${parsed.script}`);
          }
          const commandPreview = [
            `Summary: ${parsed.summary}`,
            `Command: npm run ${parsed.script}${parsed.args.length ? ` -- ${parsed.args.join(' ')}` : ''}`,
            `Timeout: ${parsed.timeoutMs}ms`,
            `Cwd: ${path.resolve(workspaceRoot)}`,
          ].join('\n');
          const decisionTitle = buildConfirmationDecisionTitle(name, definition.risk);
          const checkpoint = await this.checkpointRecorder.createToolPermissionCheckpoint({
            runId: context.runId,
            taskId: context.taskId,
            agentSessionId: context.sessionId,
            stepId: callStep.id,
            tool: name,
            risk: definition.risk,
            input: {
              ...parsed,
              commandPreview,
            },
            decisionTitle,
            preview: commandPreview,
          });

          return {
            success: false,
            status: 'needs_confirmation',
            summary: checkpoint.summary,
            checkpointId: checkpoint.checkpointId,
            checkpointKind: 'tool_permission',
            checkpointEvent: checkpoint.event,
            decisionId: checkpoint.decisionId,
          };
        }

        const decisionTitle = buildConfirmationDecisionTitle(name, definition.risk);
        const checkpoint = await this.checkpointRecorder.createToolPermissionCheckpoint({
          runId: context.runId,
          taskId: context.taskId,
          agentSessionId: context.sessionId,
          stepId: callStep.id,
          tool: name,
          risk: definition.risk,
          input: highRiskCompletionCriterionInput ?? input,
          decisionTitle,
        });

        return {
          success: false,
          status: 'needs_confirmation',
          summary: checkpoint.summary,
          checkpointId: checkpoint.checkpointId,
          checkpointKind: 'tool_permission',
          checkpointEvent: checkpoint.event,
          decisionId: checkpoint.decisionId,
        };
      }

      const result = withRuntimeRecoveryGuidance(
        name,
        await this.executeKnownTool(name, input, context, policy),
        context,
      );
      verifyDurableAgentToolResult(name, result, context);
      await this.runStepRepository.update(callStep.id, {
        status: 'completed',
        output: result.summary,
      });
      await this.runStepRepository.create({
        runId: context.runId,
        kind: 'tool_result',
        status: 'completed',
        title: `工具结果：${name}`,
        output: result.output ?? result.summary,
      });
      const recoveryGuidanceOutput = formatRuntimeRecoveryGuidance(result);
      if (recoveryGuidanceOutput) {
        await this.runStepRepository.create({
          runId: context.runId,
          kind: 'plan',
          status: 'completed',
          title: '任务记忆建议',
          input: formatRuntimeRecoveryGuidanceInput(result),
          output: recoveryGuidanceOutput,
        });
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown agent tool error';
      await this.runStepRepository.update(callStep.id, {
        status: 'failed',
        error: message,
      });
      await this.runStepRepository.create({
        runId: context.runId,
        kind: 'tool_result',
        status: 'failed',
        title: `工具失败：${name}`,
        error: message,
      });
      return {
        success: false,
        summary: `工具 ${name} 执行失败：${message}`,
        error: message,
      };
    }
  }

  private async executeKnownTool(
    name: AgentToolName,
    input: unknown,
    context: ToolExecutionContext,
    policy?: AgentPolicy,
  ): Promise<AgentToolResult> {
    switch (name) {
      case 'task.inspect_context': {
        if (!context.workingContext) {
          throw new Error('task.inspect_context requires a working context.');
        }

        const output = formatWorkingContextSummary(context.workingContext);

        return {
          success: true,
          status: 'completed',
          summary: '已读取当前任务上下文摘要。',
          output,
        };
      }
      case 'task.inspect_timeline': {
        if (!context.workingContext) {
          throw new Error('task.inspect_timeline requires a working context.');
        }

        const output = formatTimelineSummary(context.workingContext);

        return {
          success: true,
          status: 'completed',
          summary: '已读取当前任务最近时间线。',
          output,
        };
      }
      case 'task.review_completion_evidence': {
        if (!context.workingContext) {
          throw new Error('task.review_completion_evidence requires a working context.');
        }

        const output = formatCompletionEvidenceReview(context.workingContext);

        return {
          success: true,
          status: 'completed',
          summary: '已审查完成证据；未修改完成标准或任务状态。',
          output,
        };
      }
      case 'task.update_next_step': {
        if (!this.taskService) {
          throw new Error('task.update_next_step requires TaskService.');
        }

        assertTaskMutationAllowed(context);
        const parsed = parseTaskUpdateNextStepInput(input);
        const updated = await this.taskService.update({
          id: context.taskId,
          nextStep: parsed.nextStep,
        });

        return {
          success: true,
          status: 'completed',
          summary: `已更新任务下一步：${updated.nextStep ?? '未填写'}`,
          output: updated.nextStep,
        };
      }
      case 'task.create_completion_criterion': {
        if (!this.taskService) {
          throw new Error('task.create_completion_criterion requires TaskService.');
        }

        assertTaskMutationAllowed(context);
        const parsed = parseTaskCreateCompletionCriterionInput(input);
        const created = await this.taskService.createCompletionCriteria({
          taskId: context.taskId,
          text: parsed.text,
        });

        return {
          success: true,
          status: 'completed',
          summary: `已创建完成标准：${created.text}`,
          output: created.text,
        };
      }
      case 'artifact.create_note': {
        assertTaskMutationAllowed(context);
        const parsed = parseArtifactCreateNoteInput(input);
        const artifact = await this.artifactRepository.createNoteFromRun({
          taskId: context.taskId,
          runId: context.runId,
          title: parsed.title,
          content: parsed.content,
        });

        return {
          success: true,
          summary: `已创建本地 note 产物：${artifact.title}`,
          output: artifact.content,
          artifactId: artifact.id,
        };
      }
      case 'decision.draft': {
        if (!this.decisionDraftService) {
          throw new Error('decision.draft requires DecisionService.');
        }

        const parsed = parseDecisionDraftToolInput(input);
        const draft = await this.decisionDraftService.draft({
          taskId: context.taskId,
          note: parsed.note,
        });
        const output = [
          `Title: ${draft.title}`,
          `Rationale: ${draft.rationale}`,
          `Suggested kind: ${draft.suggestedKind}`,
          `Suggested scope: ${draft.suggestedScope}`,
          `Suggested source: ${draft.suggestedSourceType}`,
          `Source: ${draft.source}`,
          draft.selectedTemplateTitles.length
            ? `Templates: ${draft.selectedTemplateTitles.join(', ')}`
            : `Templates: none`,
          `Selection: ${draft.selectionReason}`,
        ].join('\n');

        return {
          success: true,
          status: 'completed',
          summary: `已草拟 Decision：${draft.title}`,
          output,
        };
      }
      case 'source_context.create': {
        if (!this.taskService) {
          throw new Error('source_context.create requires TaskService.');
        }

        assertTaskMutationAllowed(context);
        const parsed = parseSourceContextCreateInput(input);
        const sourceContext = await this.taskService.createSourceContext({
          taskId: context.taskId,
          title: parsed.title,
          kind: parsed.kind,
          isKey: parsed.isKey,
          uri: parsed.uri,
          content: parsed.content,
          note: parsed.note,
          capturedAt: parsed.capturedAt,
          runId: context.runId,
          batchId: parsed.batchId ?? `run:${context.runId}`,
          sourceRole: parsed.sourceRole ?? 'raw',
          credibility: parsed.credibility,
          isDuplicate: parsed.isDuplicate,
          containsSensitiveData: parsed.containsSensitiveData,
        });

        return {
          success: true,
          status: 'completed',
          summary: `已创建来源上下文：${sourceContext.title}`,
          output: sourceContext.note ?? sourceContext.content ?? sourceContext.uri ?? sourceContext.title,
        };
      }
      case 'workspace.read_file': {
        if (!policy?.allowLocalWorkspaceRead) {
          throw new Error('workspace.read_file requires allowLocalWorkspaceRead policy.');
        }

        const parsed = parseWorkspaceReadFileInput(input);
        const workspaceRoot = this.workspaceRootResolver();
        const filePath = resolveWorkspacePath(workspaceRoot, parsed.path);
        const stat = await fs.stat(filePath);

        if (!stat.isFile()) {
          throw new Error('workspace.read_file can only read files.');
        }

        const content = await fs.readFile(filePath, 'utf8');
        const truncated = content.length > WORKSPACE_READ_LIMIT;
        const output = truncated ? `${content.slice(0, WORKSPACE_READ_LIMIT)}\n[truncated]` : content;

        return {
          success: true,
          status: 'completed',
          summary: `已读取工作区文件：${path.relative(workspaceRoot, filePath)}`,
          output,
        };
      }
      case 'workspace.search': {
        if (!policy?.allowLocalWorkspaceRead) {
          throw new Error('workspace.search requires allowLocalWorkspaceRead policy.');
        }

        const parsed = parseWorkspaceSearchInput(input);
        const root = path.resolve(this.workspaceRootResolver());
        const files = await walkWorkspace(root);
        const matches: string[] = [];

        for (const filePath of files) {
          if (matches.length >= parsed.maxResults!) {
            break;
          }

          const content = await fs.readFile(filePath, 'utf8');
          const line = content
            .split('\n')
            .find((candidate) => candidate.includes(parsed.query));

          if (line) {
            matches.push(`${path.relative(root, filePath)}: ${line.trim()}`);
          }
        }

        return {
          success: true,
          status: 'completed',
          summary: matches.length
            ? `工作区搜索找到 ${matches.length} 条结果。`
            : '工作区搜索没有找到结果。',
          output: matches.join('\n') || null,
        };
      }
      case 'workspace.run_command': {
        if (!policy?.allowLocalCommandRun) {
          throw new Error('workspace.run_command requires allowLocalCommandRun policy.');
        }

        const parsed = parseWorkspaceRunCommandInput(input);
        const workspaceRoot = this.workspaceRootResolver();
        const output = await runWorkspacePackageScript({
          input: parsed,
          workspaceRoot,
        });

        return {
          success: true,
          status: 'completed',
          summary: `已运行工作区命令：npm run ${parsed.script}`,
          output: output || '命令执行完成，没有输出。',
        };
      }
      case 'workspace.write_patch': {
        if (!policy?.allowLocalFileWrite) {
          throw new Error('workspace.write_patch requires allowLocalFileWrite policy.');
        }

        const parsed = parseWorkspaceWritePatchInput(input);
        const workspaceRoot = this.workspaceRootResolver();
        const touchedFiles = await applyWorkspacePatch({
          input: parsed,
          workspaceRoot,
        });

        return {
          success: true,
          status: 'completed',
          summary: `已应用工作区 patch：${touchedFiles.join(', ')}`,
          output: parsed.patch,
        };
      }
      default:
        throw new Error(`Unknown agent tool: ${name}`);
    }
  }
}

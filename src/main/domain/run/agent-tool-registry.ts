import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  AgentPolicy,
  AgentToolName,
  AgentToolResult,
  AgentToolRisk,
  AgentWorkingContext,
} from '../../../shared/types/agent-execution.js';
import type { SourceContextKind } from '../../../shared/types/source-context.js';
import { createToolPermissionCheckpointPayload } from '../../../shared/types/run-checkpoint-payload.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import type { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import type { TaskService } from '../task/task-service.js';

export type AgentToolDefinition = {
  name: AgentToolName;
  description: string;
  risk: AgentToolRisk;
  requiresConfirmation: boolean;
};

type ToolExecutionContext = {
  runId: string;
  taskId: string;
  workingContext?: AgentWorkingContext;
};

type ArtifactCreateNoteInput = {
  title: string;
  content: string;
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
};

type WorkspaceReadFileInput = {
  path: string;
};

type WorkspaceSearchInput = {
  query: string;
  maxResults?: number;
};

type WorkspaceWritePatchInput = {
  summary: string;
  patch: string;
  expectedFiles: string[];
};

const WORKSPACE_READ_LIMIT = 20_000;
const WORKSPACE_SEARCH_MAX_RESULTS = 25;
const WORKSPACE_PATCH_MAX_BYTES = 40_000;
const sourceContextKinds = new Set<SourceContextKind>(['link', 'doc', 'issue', 'pr', 'website_list', 'note']);
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

  return {
    title,
    kind,
    isKey: candidate.isKey,
    uri: candidate.uri,
    content: candidate.content,
    note: candidate.note,
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
    `方法模板：${context.processTemplates.map((item) => item.title).join('；') || '无'}`,
  ].join('\n');
}

function formatTimelineSummary(context: AgentWorkingContext): string {
  if (!context.recentTimeline.length) {
    return '最近没有可用的任务时间线事件。';
  }

  return context.recentTimeline
    .map((event, index) => `${index + 1}. ${event.createdAt} · ${event.type} · ${event.summary}`)
    .join('\n');
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
  ) {}

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
      if (policy?.confirmationRequiredRisks.includes(definition.risk)) {
        if (name === 'workspace.write_patch') {
          if (!policy.allowLocalFileWrite) {
            throw new Error('workspace.write_patch requires allowLocalFileWrite policy.');
          }

          const parsed = parseWorkspaceWritePatchInput(input);
          const workspaceRoot = this.workspaceRootResolver();
          const diffPreview = await buildWorkspacePatchPreview({
            input: parsed,
            workspaceRoot,
          });
          const decisionTitle = buildConfirmationDecisionTitle(name, definition.risk);
          const checkpoint = await this.runCheckpointRepository.create({
            runId: context.runId,
            stepId: callStep.id,
            kind: 'tool_permission',
            payload: JSON.stringify(createToolPermissionCheckpointPayload({
              tool: name,
              risk: definition.risk,
              input: {
                ...parsed,
                diffPreview,
              },
              decisionId: null,
              decisionTitle,
            })),
          });
          const decision = this.decisionRepository
            ? await this.decisionRepository.create({
                taskId: context.taskId,
                title: decisionTitle,
                sourceType: 'agent_checkpoint',
                sourceId: checkpoint.id,
                sourceLabel: name,
              })
            : null;
          const payload = JSON.stringify(createToolPermissionCheckpointPayload({
            tool: name,
            risk: definition.risk,
            input: {
              ...parsed,
              diffPreview,
            },
            decisionId: decision?.id ?? null,
            decisionTitle,
          }));
          const checkpointWithDecision = decision
            ? await this.runCheckpointRepository.updatePayload(checkpoint.id, payload)
            : checkpoint;
          const summary = decision
            ? `工具 ${name} 需要确认后才能继续，已创建 Decision：${decision.title}。`
            : `工具 ${name} 需要确认后才能继续。`;

          await this.runStepRepository.update(callStep.id, {
            status: 'skipped',
            output: summary,
          });
          await this.runStepRepository.create({
            runId: context.runId,
            kind: 'checkpoint',
            status: 'pending',
            title: `等待确认：${name}`,
            input: diffPreview,
            output: summary,
          });

          return {
            success: false,
            status: 'needs_confirmation',
            summary,
            checkpointId: checkpointWithDecision.id,
          };
        }

        const decisionTitle = buildConfirmationDecisionTitle(name, definition.risk);
        const checkpoint = await this.runCheckpointRepository.create({
          runId: context.runId,
          stepId: callStep.id,
          kind: 'tool_permission',
          payload: JSON.stringify(createToolPermissionCheckpointPayload({
            tool: name,
            risk: definition.risk,
            input,
            decisionId: null,
            decisionTitle,
          })),
        });
        const decision = this.decisionRepository
          ? await this.decisionRepository.create({
              taskId: context.taskId,
              title: decisionTitle,
              sourceType: 'agent_checkpoint',
              sourceId: checkpoint.id,
              sourceLabel: name,
            })
          : null;
        const payload = JSON.stringify(createToolPermissionCheckpointPayload({
          tool: name,
          risk: definition.risk,
          input,
          decisionId: decision?.id ?? null,
          decisionTitle,
        }));
        const checkpointWithDecision = decision
          ? await this.runCheckpointRepository.updatePayload(checkpoint.id, payload)
          : checkpoint;
        const summary = decision
          ? `工具 ${name} 需要确认后才能继续，已创建 Decision：${decision.title}。`
          : `工具 ${name} 需要确认后才能继续。`;

        await this.runStepRepository.update(callStep.id, {
          status: 'skipped',
          output: summary,
        });
        await this.runStepRepository.create({
          runId: context.runId,
          kind: 'checkpoint',
          status: 'pending',
          title: `等待确认：${name}`,
          output: summary,
        });

        return {
          success: false,
          status: 'needs_confirmation',
          summary,
          checkpointId: checkpointWithDecision.id,
        };
      }

      const result = await this.executeKnownTool(name, input, context, policy);
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
      case 'task.update_next_step': {
        if (!this.taskService) {
          throw new Error('task.update_next_step requires TaskService.');
        }

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
      case 'source_context.create': {
        if (!this.taskService) {
          throw new Error('source_context.create requires TaskService.');
        }

        const parsed = parseSourceContextCreateInput(input);
        const sourceContext = await this.taskService.createSourceContext({
          taskId: context.taskId,
          title: parsed.title,
          kind: parsed.kind,
          isKey: parsed.isKey,
          uri: parsed.uri,
          content: parsed.content,
          note: parsed.note,
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

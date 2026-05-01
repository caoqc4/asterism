import type {
  CreateDecisionInput,
  DecisionActionInput,
  DecisionDraftRecord,
  DecisionRecord,
  DraftDecisionInput,
} from '../../../shared/types/decision.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import { generateObject } from 'ai';
import { z } from 'zod';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { getLanguageModel } from '../../executors/ai-client.js';
import { AiConfigService } from '../../keychain/ai-config-service.js';
import { TaskService } from '../task/task-service.js';
import type { AgentToolRegistry } from '../run/agent-tool-registry.js';
import { DEFAULT_AGENT_POLICY } from '../run/agent-working-context.js';
import type {
  SandboxPatchPromotionPreflightService,
} from '../run/sandbox-patch-promotion-preflight-service.js';
import type {
  SandboxPatchPromotionApplyService,
} from '../run/sandbox-patch-promotion-apply-service.js';
import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import type { BrowserControlledInteractionResult } from '../../../shared/types/browser-controlled-interaction.js';
import { parseBrowserControlledInteractionCheckpointPayload } from '../../../shared/types/browser-controlled-interaction.js';
import { parseRunCheckpointPayload } from '../../../shared/types/run-checkpoint-payload.js';
import { AgentSessionStore } from '../run/agent-session-store.js';
import {
  findCheckpointBackedAgentSessionForSettlement,
  updateCheckpointBackedAgentSessionStatus,
} from '../run/agent-session-continuation.js';
import {
  DecisionProcessTemplateSelector,
  type DecisionProcessTemplateSelectionResult,
} from './process-template-selector.js';
import { deriveTaskDetailPriorityLane, getPriorityLanePromptGuidance } from '../../../shared/working-context/priority-lanes.js';

const decisionDraftSchema = z.object({
  title: z.string().min(1),
  rationale: z.string().min(1),
});

export type BrowserControlledResumeExecutor = (params: {
  checkpointId: string;
  decision: DecisionRecord;
  payload: string;
  runId: string;
}) => Promise<BrowserControlledInteractionResult>;

function buildFallbackDraftTitle(taskTitle: string, note?: string | null): string {
  if (note?.trim()) {
    return `${taskTitle}：${note.trim().slice(0, 40)}`;
  }

  return `${taskTitle} 需要拍板`;
}

function stripResponsibilityPrefix(summary: string | null | undefined): string | null {
  const trimmed = summary
    ?.trim()
    .replace(/^确认责任：/, '')
    .replace(/^解除责任：/, '')
    .replace(/^推进责任：/, '')
    .trim();

  return trimmed || null;
}

function isLocalBrowserControlledOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function buildDraftPrompt(
  task: TaskDetail,
  input: DraftDecisionInput,
  selection: DecisionProcessTemplateSelectionResult,
): string {
  const selectedTemplates = selection.shouldUse ? selection.selectedTemplates : [];
  const lane = deriveTaskDetailPriorityLane(task);

  return [
    '请草拟一条简洁、明确、适合知识工作者阅读的决策请求。',
    '输出要求：',
    '1. 生成一个简短明确的标题，适合直接作为 Decision 标题。',
    '2. 生成一段 rationale，说明为什么现在需要拍板。',
    '3. 不要替用户做最终 approve/defer/cancel，只帮助组织请求。',
    `任务标题：${task.title}`,
    `任务摘要：${task.summary ?? '暂无'}`,
    `当前状态：${task.state}`,
    `当前 next step：${task.nextStep ?? '暂无'}`,
    `等待原因：${task.waitingReason ?? '暂无'}`,
    getPriorityLanePromptGuidance(lane),
    `当前阻塞解除责任：${stripResponsibilityPrefix(task.resumeCard.currentBlocker.responsibilitySummary) ?? '暂无'}`,
    `当前依赖推进责任：${stripResponsibilityPrefix(task.resumeCard.currentDependency?.responsibilitySummary) ?? '暂无'}`,
    `当前完成确认责任：${stripResponsibilityPrefix(task.resumeCard.completionStatus.nextOpenResponsibilitySummary) ?? '暂无'}`,
    `风险：${
      task.riskLevel === 'none'
        ? '当前未标记明显风险'
        : `${task.riskLevel}${task.riskNote ? ` - ${task.riskNote}` : ''}`
    }`,
    `用户补充说明：${input.note?.trim() || '无'}`,
    '来源材料：',
    ...(task.sourceContexts.length
      ? task.sourceContexts.map(
          (item) => `- ${item.title} [${item.kind}]${item.note ? ` | ${item.note}` : ''}`,
        )
      : ['- 无']),
    '最近产物：',
    ...(task.artifacts.length
      ? task.artifacts.map((item) => `- ${item.title} [${item.kind}]`)
      : ['- 无']),
    '本次可参考的方法模板：',
    ...(selectedTemplates.length
      ? selectedTemplates.map(
          (item) =>
            `- ${item.title} | ${item.kind} | tags=${item.tags.join(', ') || 'none'} | summary=${item.summary ?? '暂无'} | content=${item.content}`,
        )
      : ['- 无']),
  ].join('\n');
}

export class DecisionService {
  constructor(
    private readonly decisionRepository: DecisionRepository,
    private readonly taskService: TaskService,
    private readonly aiConfigService: AiConfigService,
    private readonly processTemplateSelector: DecisionProcessTemplateSelector = new DecisionProcessTemplateSelector(),
    private readonly runCheckpointRepository: Pick<RunCheckpointRepository, 'findOpenByDecisionId' | 'updateStatus'> | null = null,
    private readonly runStepRepository: Pick<RunStepRepository, 'create'> | null = null,
    private readonly runRepository: Pick<RunRepository, 'getDetail' | 'updateResult'> | null = null,
    private readonly agentToolRegistry: AgentToolRegistry | null = null,
    private readonly sandboxPatchPromotionPreflightService: Pick<SandboxPatchPromotionPreflightService, 'preflight'> | null = null,
    private readonly sandboxPatchPromotionApplyService: Pick<SandboxPatchPromotionApplyService, 'apply'> | null = null,
    private readonly sandboxPatchPromotionApplyEnabled: () => boolean = () => false,
    private readonly browserControlledResumeExecutor: BrowserControlledResumeExecutor | null = null,
    private readonly agentSessionStore: Pick<AgentSessionStore, 'listForRun' | 'updateStatus'> | null = null,
  ) {}

  list(): Promise<DecisionRecord[]> {
    return this.decisionRepository.list();
  }

  async draft(input: DraftDecisionInput): Promise<DecisionDraftRecord> {
    const task = await this.taskService.getDetail(input.taskId);

    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }

    const draftId = `decision_draft_${crypto.randomUUID()}`;
    let selection: DecisionProcessTemplateSelectionResult = {
      shouldUse: false,
      selectedTemplates: [],
      reason: '当前未评估 process template。',
    };

    try {
      const runtimeConfig = await this.aiConfigService.resolveRuntimeConfig();

      try {
        selection = await this.processTemplateSelector.select(task, input, runtimeConfig);
      } catch (error) {
        selection = {
          shouldUse: false,
          selectedTemplates: [],
          reason:
            error instanceof Error
              ? `process template selector 不可用：${error.message}`
              : 'process template selector 不可用。',
        };
      }

      if (selection.shouldUse) {
        await this.taskService.annotateProcessTemplateSelected(
          input.taskId,
          'decision_draft',
          draftId,
          selection.selectedTemplates.map((item) => item.id),
          selection.selectedTemplates.map((item) => item.title),
          selection.reason,
        );
      } else {
        await this.taskService.annotateProcessTemplateSkipped(
          input.taskId,
          'decision_draft',
          draftId,
          selection.reason,
          task.processTemplates.length,
        );
      }

      const { object } = await generateObject({
        model: getLanguageModel(runtimeConfig),
        schema: decisionDraftSchema,
        prompt: buildDraftPrompt(task, input, selection),
      });

      return {
        taskId: input.taskId,
        title: object.title.trim(),
        rationale: object.rationale.trim(),
        source: 'ai',
        selectedTemplateIds: selection.selectedTemplates.map((item) => item.id),
        selectedTemplateTitles: selection.selectedTemplates.map((item) => item.title),
        selectionReason: selection.reason,
      };
    } catch {
      return {
        taskId: input.taskId,
        title: buildFallbackDraftTitle(task.title, input.note),
        rationale: input.note?.trim()
          ? `建议围绕“${input.note.trim()}”尽快发起拍板，避免任务继续在当前状态下悬置。`
          : '建议尽快明确这条任务当前需要拍板的关键点，以便后续推进。',
        source: 'fallback',
        selectedTemplateIds: selection.selectedTemplates.map((item) => item.id),
        selectedTemplateTitles: selection.selectedTemplates.map((item) => item.title),
        selectionReason: selection.reason,
      };
    }
  }

  async create(input: CreateDecisionInput): Promise<DecisionRecord> {
    const task = await this.taskService.getDetail(input.taskId);

    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }

    return this.decisionRepository.create(input);
  }

  async act(input: DecisionActionInput): Promise<DecisionRecord> {
    const updated = await this.decisionRepository.act(input);

    if (input.action === 'approve') {
      await this.taskService.annotateDecisionApproved(updated.taskId, updated.title, updated.id);
    }

    if (input.action === 'defer') {
      await this.taskService.annotateDecisionDeferred(updated.taskId, updated.title, updated.id);
    }

    if (input.action === 'cancel') {
      await this.taskService.annotateDecisionCancelled(updated.taskId, updated.title, updated.id);
    }

    await this.settleLinkedCheckpoint(updated, input.action);

    return updated;
  }

  private async settleLinkedCheckpoint(
    decision: DecisionRecord,
    action: DecisionActionInput['action'],
  ): Promise<void> {
    if (!this.runCheckpointRepository || !this.runStepRepository || !this.runRepository) {
      return;
    }

    const checkpoint = await this.runCheckpointRepository.findOpenByDecisionId(decision.id);

    if (!checkpoint) {
      return;
    }

    const payload = parseRunCheckpointPayload(checkpoint.payload);
    const tool = payload?.tool;
    const toolInput = payload?.input;
    const checkpointAgentSessionId = typeof payload?.agentSessionId === 'string'
      ? payload.agentSessionId
      : null;

    if (action !== 'approve') {
      await this.runCheckpointRepository.updateStatus(checkpoint.id, 'cancelled');
      await this.updateLatestCheckpointBackedAgentSession(
        checkpoint.runId,
        'cancelled',
        checkpointAgentSessionId,
      );
      await this.runStepRepository.create({
        runId: checkpoint.runId,
        kind: 'checkpoint',
        status: 'skipped',
        title: `确认未通过：${decision.title}`,
        output:
          action === 'defer'
            ? '关联 Decision 已延后，本次 checkpoint 不再继续执行。'
            : '关联 Decision 已取消，本次 checkpoint 不再继续执行。',
      });
      await this.runRepository.updateResult(
        checkpoint.runId,
        'failed',
        action === 'defer'
          ? `关联 Decision 已延后：${decision.title}`
          : `关联 Decision 已取消：${decision.title}`,
        'system',
        action === 'defer'
          ? `关联 Decision 已延后：${decision.title}`
          : `关联 Decision 已取消：${decision.title}`,
      );
      return;
    }

    if (checkpoint.kind === 'patch_promotion' || payload?.kind === 'patch_promotion') {
      await this.settlePatchPromotionCheckpoint(decision, checkpoint.id, checkpoint.runId);
      return;
    }

    const browserPayload = parseBrowserControlledInteractionCheckpointPayload(checkpoint.payload);
    if (browserPayload.valid) {
      await this.settleBrowserControlledResumeCheckpoint(decision, checkpoint.id, checkpoint.runId, checkpoint.payload);
      return;
    }

    if (
      (
        tool !== 'artifact.create_note' &&
        tool !== 'task.create_completion_criterion' &&
        tool !== 'workspace.write_patch' &&
        tool !== 'workspace.run_command'
      ) ||
      !this.agentToolRegistry
    ) {
      await this.runCheckpointRepository.updateStatus(checkpoint.id, 'resolved');
      await this.runStepRepository.create({
        runId: checkpoint.runId,
        kind: 'checkpoint',
        status: 'completed',
        title: `确认已通过：${decision.title}`,
        output: '关联 Decision 已批准，但当前工具暂不支持自动续跑。',
      });
      return;
    }

    if (
      checkpointAgentSessionId &&
      !(await this.findCheckpointBackedAgentSession(checkpoint.runId, checkpointAgentSessionId))
    ) {
      const summary = `Checkpoint agent session is not resumable for run: ${checkpoint.runId} (${checkpointAgentSessionId}).`;
      await this.runCheckpointRepository.updateStatus(checkpoint.id, 'cancelled');
      await this.runStepRepository.create({
        runId: checkpoint.runId,
        kind: 'checkpoint',
        status: 'failed',
        title: `确认后续跑阻塞：${decision.title}`,
        error: summary,
        output: [
          summary,
          'No checkpoint tool was executed.',
        ].join('\n'),
      });
      await this.runRepository.updateResult(
        checkpoint.runId,
        'failed',
        summary,
        'system',
        summary,
      );
      return;
    }

    const result = await this.agentToolRegistry.execute(
      tool,
      toolInput,
      {
        runId: checkpoint.runId,
        taskId: decision.taskId,
        sessionId: checkpointAgentSessionId,
      },
      {
        ...DEFAULT_AGENT_POLICY,
        allowTaskMutationTools: tool === 'task.create_completion_criterion',
        allowLocalFileWrite: tool === 'workspace.write_patch',
        allowLocalCommandRun: tool === 'workspace.run_command',
        confirmationRequiredRisks: [],
      },
    );

    if (!result.success) {
      await this.updateLatestCheckpointBackedAgentSession(
        checkpoint.runId,
        'failed',
        checkpointAgentSessionId,
      );
      await this.runStepRepository.create({
        runId: checkpoint.runId,
        kind: 'checkpoint',
        status: 'failed',
        title: `确认后续跑失败：${decision.title}`,
        error: result.error ?? result.summary,
      });
      await this.runRepository.updateResult(
        checkpoint.runId,
        'failed',
        result.error ?? result.summary,
        'system',
        result.error ?? result.summary,
      );
      return;
    }

    const run = await this.runRepository.getDetail(checkpoint.runId);
    await this.runCheckpointRepository.updateStatus(checkpoint.id, 'resolved');
    await this.updateLatestCheckpointBackedAgentSession(
      checkpoint.runId,
      'completed',
      checkpointAgentSessionId,
    );
    await this.runStepRepository.create({
      runId: checkpoint.runId,
      kind: 'checkpoint',
      status: 'completed',
      title: `确认已通过：${decision.title}`,
      output: result.summary,
    });
    await this.runRepository.updateResult(
      checkpoint.runId,
      'completed',
      result.output ?? result.summary,
      'system',
    );
    await this.taskService.annotateRunCompleted(
      decision.taskId,
      run?.type ?? 'agent',
      Boolean((result.output ?? result.summary).trim()),
      checkpoint.runId,
    );
  }

  private async settleBrowserControlledResumeCheckpoint(
    decision: DecisionRecord,
    checkpointId: string,
    runId: string,
    payload: string | null,
  ): Promise<void> {
    if (!this.runCheckpointRepository || !this.runStepRepository || !this.runRepository || !payload) {
      return;
    }

    const parsed = parseBrowserControlledInteractionCheckpointPayload(payload);
    if (!parsed.valid || !isLocalBrowserControlledOrigin(parsed.payload.origin)) {
      const summary = parsed.valid
        ? `Browser controlled resume blocked: origin ${parsed.payload.origin} is not a local QA origin.`
        : `Browser controlled resume blocked: ${parsed.blockedReasons.join(' ')}`;
      await this.runCheckpointRepository.updateStatus(checkpointId, 'cancelled');
      await this.updateLatestCheckpointBackedAgentSession(runId, 'failed');
      await this.runStepRepository.create({
        runId,
        kind: 'checkpoint',
        status: 'failed',
        title: `Browser resume blocked：${decision.title}`,
        error: summary,
        output: [
          summary,
          'No browser action was executed.',
        ].join('\n'),
      });
      await this.runRepository.updateResult(runId, 'failed', summary, 'system', summary);
      return;
    }

    if (!this.browserControlledResumeExecutor) {
      await this.runCheckpointRepository.updateStatus(checkpointId, 'resolved');
      await this.runStepRepository.create({
        runId,
        kind: 'checkpoint',
        status: 'completed',
        title: `确认已通过：${decision.title}`,
        output: '关联 Decision 已批准，但当前浏览器 resume executor 未启用。',
      });
      return;
    }

    const result = await this.browserControlledResumeExecutor({
      checkpointId,
      decision,
      payload,
      runId,
    });

    if (result.status !== 'completed') {
      const summary = result.summary;
      const blockedReasons = result.status === 'blocked'
        ? result.blockedReasons.join(' / ') || 'none'
        : 'resume produced a second confirmation request';
      await this.runCheckpointRepository.updateStatus(checkpointId, 'cancelled');
      await this.updateLatestCheckpointBackedAgentSession(runId, 'failed');
      await this.runStepRepository.create({
        runId,
        kind: 'checkpoint',
        status: 'failed',
        title: `Browser resume failed：${decision.title}`,
        error: summary,
        output: [
          summary,
          `Blocked reasons: ${blockedReasons}`,
        ].join('\n'),
      });
      await this.runRepository.updateResult(runId, 'failed', summary, 'system', summary);
      return;
    }

    const run = await this.runRepository.getDetail(runId);
    await this.runCheckpointRepository.updateStatus(checkpointId, 'resolved');
    await this.updateLatestCheckpointBackedAgentSession(runId, 'completed');
    await this.runStepRepository.create({
      runId,
      kind: 'checkpoint',
      status: 'completed',
      title: `Browser resume completed：${decision.title}`,
      output: [
        result.summary,
        `Artifacts: ${result.artifacts.map((artifact) => artifact.kind).join(',') || 'none'}`,
      ].join('\n'),
    });
    await this.runRepository.updateResult(runId, 'completed', result.summary, 'system');
    await this.taskService.annotateRunCompleted(decision.taskId, run?.type ?? 'agent', true, runId);
  }

  private async settlePatchPromotionCheckpoint(
    decision: DecisionRecord,
    checkpointId: string,
    runId: string,
  ): Promise<void> {
    if (!this.runCheckpointRepository || !this.runStepRepository || !this.runRepository) {
      return;
    }

    if (this.sandboxPatchPromotionApplyEnabled() && this.sandboxPatchPromotionApplyService) {
      await this.applyPatchPromotionCheckpoint(decision, checkpointId, runId);
      return;
    }

    if (!this.sandboxPatchPromotionPreflightService) {
      await this.runCheckpointRepository.updateStatus(checkpointId, 'resolved');
      await this.runStepRepository.create({
        runId,
        kind: 'checkpoint',
        status: 'completed',
        title: `确认已通过：${decision.title}`,
        output: '关联 Decision 已批准，但当前工具暂不支持自动续跑。',
      });
      return;
    }

    const preflight = await this.sandboxPatchPromotionPreflightService.preflight(checkpointId);

    if (preflight.status === 'blocked') {
      await this.runCheckpointRepository.updateStatus(checkpointId, 'cancelled');
      await this.updateLatestCheckpointBackedAgentSession(runId, 'failed');
      await this.runStepRepository.create({
        runId,
        kind: 'checkpoint',
        status: 'failed',
        title: `提升预检阻塞：${decision.title}`,
        error: preflight.summary,
        output: [
          preflight.summary,
          'No workspace files were written.',
        ].join('\n'),
      });
      await this.runRepository.updateResult(
        runId,
        'failed',
        preflight.summary,
        'system',
        preflight.summary,
      );
      return;
    }

    await this.runCheckpointRepository.updateStatus(checkpointId, 'resolved');
    await this.runStepRepository.create({
      runId,
      kind: 'checkpoint',
      status: 'completed',
      title: `确认已通过：${decision.title}`,
      output: [
        preflight.summary,
        'Workspace file application is still deferred; no workspace files were written.',
      ].join('\n'),
    });
  }

  private async applyPatchPromotionCheckpoint(
    decision: DecisionRecord,
    checkpointId: string,
    runId: string,
  ): Promise<void> {
    if (
      !this.runCheckpointRepository ||
      !this.runStepRepository ||
      !this.runRepository ||
      !this.sandboxPatchPromotionApplyService
    ) {
      return;
    }

    const result = await this.sandboxPatchPromotionApplyService.apply(checkpointId);

    if (result.status === 'blocked') {
      await this.runCheckpointRepository.updateStatus(checkpointId, 'cancelled');
      await this.updateLatestCheckpointBackedAgentSession(runId, 'failed');
      await this.runStepRepository.create({
        runId,
        kind: 'checkpoint',
        status: 'failed',
        title: `提升应用阻塞：${decision.title}`,
        error: result.auditSummary,
        output: [
          result.auditSummary,
          'No workspace files were written.',
        ].join('\n'),
      });
      await this.runRepository.updateResult(
        runId,
        'failed',
        result.auditSummary,
        'system',
        result.auditSummary,
      );
      return;
    }

    const run = await this.runRepository.getDetail(runId);
    await this.runCheckpointRepository.updateStatus(checkpointId, 'resolved');
    await this.updateLatestCheckpointBackedAgentSession(runId, 'completed');
    await this.runStepRepository.create({
      runId,
      kind: 'checkpoint',
      status: 'completed',
      title: `提升已应用：${decision.title}`,
      output: [
        result.auditSummary,
        `Touched files: ${result.touchedFiles.join(', ')}`,
      ].join('\n'),
    });
    await this.runRepository.updateResult(
      runId,
      'completed',
      result.auditSummary,
      'system',
    );
    await this.taskService.annotateRunCompleted(
      decision.taskId,
      run?.type ?? 'agent',
      true,
      runId,
    );
  }

  private async updateLatestCheckpointBackedAgentSession(
    runId: string,
    status: AgentSessionRecord['status'],
    agentSessionId?: string | null,
  ): Promise<void> {
    await updateCheckpointBackedAgentSessionStatus({
      agentSessionId,
      runId,
      status,
      store: this.agentSessionStore,
    });
  }

  private async findCheckpointBackedAgentSession(
    runId: string,
    agentSessionId?: string | null,
  ): Promise<AgentSessionRecord | null> {
    if (!this.agentSessionStore) {
      return null;
    }

    return findCheckpointBackedAgentSessionForSettlement({
      agentSessionId,
      sessions: await this.agentSessionStore.listForRun(runId),
    });
  }
}

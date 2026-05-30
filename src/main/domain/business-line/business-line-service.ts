import type { DecisionService } from '../decision/decision-service.js';
import type { TaskService } from '../task/task-service.js';
import {
  buildBusinessLineCreationDraft,
  normalizeBusinessLineCreationLines,
} from '../../../shared/business-line-creation-template.js';
import { BusinessLineRepository } from '../../db/repositories/business-line-repository.js';
import type {
  AcceptBusinessLineSkillRevisionInput,
  BusinessLine,
  BusinessLineAutomation,
  BusinessLineCreationTemplate,
  BusinessLineContextPack,
  BusinessLineListItem,
  BusinessLineOwnershipInput,
  BusinessLineOwnershipResolution,
  BusinessLineRecord,
  BusinessLineSensor,
  BusinessLineSkillRevision,
  BusinessLineTodaySuggestion,
  BusinessLineWorkspace,
  BusinessLineReview,
  BusinessLineReviewRecordSuggestion,
  CreateBusinessLineInput,
  DisableBusinessLineSkillRevisionInput,
  RecordBusinessLineReviewInput,
  RejectBusinessLineSkillRevisionInput,
  RollbackBusinessLineSkillRevisionInput,
} from '../../../shared/types/business-line.js';
import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { DecisionRecord } from '../../../shared/types/decision.js';
import type { SourceContextRecord } from '../../../shared/types/source-context.js';
import type { TaskFileRecord } from '../../../shared/types/task-file.js';
import type { TaskListItemRecord } from '../../../shared/types/task.js';

function isBusinessLineLegacyTask(task: TaskListItemRecord): boolean {
  const facets = task.taskFacets ?? [];
  return task.parentTaskId == null && (
    task.taskType === 'project' ||
    task.taskType === 'routine' ||
    facets.includes('project') ||
    facets.includes('routine')
  );
}

function isAutomationTask(task: TaskListItemRecord): boolean {
  if (task.state === 'completed' || task.state === 'archived') return false;
  const facets = task.taskFacets ?? [];
  return task.taskType === 'scheduled'
    || task.taskType === 'event'
    || task.taskType === 'routine'
    || facets.includes('scheduled')
    || facets.includes('event')
    || facets.includes('routine');
}

function automationKindForTask(task: TaskListItemRecord): BusinessLineAutomation['kind'] {
  const facets = task.taskFacets ?? [];
  if (task.taskType === 'event') return 'event';
  if (task.taskType === 'scheduled') return 'scheduled';
  if (task.taskType === 'routine') return 'routine';
  if (facets.includes('event')) return 'event';
  if (facets.includes('scheduled')) return 'scheduled';
  if (facets.includes('routine')) return 'routine';
  return 'scheduled';
}

function automationTriggerLabel(kind: BusinessLineAutomation['kind']): string {
  if (kind === 'event') return 'Event-triggered sensor';
  if (kind === 'routine') return 'Routine loop';
  return 'Scheduled loop';
}

function connectorLabelForSource(source: SourceContextRecord): string | null {
  if (source.batchId?.startsWith('connector:')) {
    return source.batchId.split(':')[1] || 'external_access';
  }
  const connectorNote = source.note?.match(/Connector source:\s*([^\n]+)/i)?.[1]?.trim();
  if (connectorNote) return connectorNote.split(':')[0] || connectorNote;
  return null;
}

function newestFirst<T extends { updatedAt?: string; createdAt: string }>(items: T[]): T[] {
  return [...items].sort((left, right) =>
    (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt));
}

function decisionForReview(reviewId: string, decisions: DecisionRecord[]): DecisionRecord | null {
  return decisions.find((decision) => decision.sourceId === reviewId) ?? null;
}

function compactRecordSummary(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function isPastIso(value: string | null | undefined, now = new Date()): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= now.getTime();
}

type ScoredBusinessLineSuggestion = {
  suggestion: BusinessLineTodaySuggestion;
  score: number;
  updatedAt: string;
};

function sourceRecordIds(records: BusinessLineRecord[], limit = 3): string[] {
  return records
    .map((record) => record.id)
    .filter(Boolean)
    .slice(0, limit);
}

function sourceRecordSummaries(records: BusinessLineRecord[], limit = 3): string[] {
  return records
    .map((record) => record.summary)
    .filter(Boolean)
    .slice(0, limit);
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export class BusinessLineService {
  constructor(
    private readonly businessLineRepository: BusinessLineRepository,
    private readonly taskService: TaskService,
    private readonly decisionService: DecisionService,
  ) {}

  async create(input: CreateBusinessLineInput): Promise<BusinessLine> {
    if (input.legacyTaskId) {
      const task = await this.taskService.getDetail(input.legacyTaskId);
      if (!task) throw new Error(`Task not found: ${input.legacyTaskId}`);
    }
    const sourceBusinessLine = input.sourceBusinessLineId
      ? await this.businessLineRepository.findById(input.sourceBusinessLineId)
      : null;
    if (input.sourceBusinessLineId && !sourceBusinessLine) {
      throw new Error(`Source business line not found: ${input.sourceBusinessLineId}`);
    }
    const businessLine = await this.businessLineRepository.create(input);
    if (this.shouldSeedCreatedBusinessLine(input)) {
      await this.seedCreatedBusinessLine({
        businessLine,
        input,
        sourceBusinessLine,
      });
    }
    return businessLine;
  }

  async list(): Promise<BusinessLineListItem[]> {
    await this.ensureLegacyBusinessLines();
    const [businessLines, tasks] = await Promise.all([
      this.businessLineRepository.list(),
      this.taskService.list(),
    ]);
    const listItems = await Promise.all(businessLines.map(async (businessLine) => {
      const records = await this.businessLineRepository.listRecords(businessLine.id, 25);
      const nextActions = await this.nextActionsForBusinessLine(businessLine, tasks);
      const skillRevisions = await this.businessLineRepository.listSkillRevisions(businessLine.id);
      return {
        ...businessLine,
        nextActionCount: nextActions.length,
        latestRecordSummary: records[0]?.summary ?? null,
        activeSkillCount: skillRevisions.filter((revision) =>
          revision.status === 'active' && !isPastIso(revision.expiresAt)).length,
      };
    }));
    return listItems;
  }

  async getWorkspace(businessLineId: string): Promise<BusinessLineWorkspace | null> {
    await this.ensureLegacyBusinessLines();
    const businessLine = await this.businessLineRepository.findById(businessLineId);
    if (!businessLine) return null;

    const [tasks, records, reviews, skillRevisions, decisions] = await Promise.all([
      this.taskService.list(),
      this.businessLineRepository.listRecords(businessLine.id, 50),
      this.businessLineRepository.listReviews(businessLine.id),
      this.businessLineRepository.listSkillRevisions(businessLine.id),
      this.decisionService.list(),
    ]);
    const nextActions = await this.nextActionsForBusinessLine(businessLine, tasks);
    const legacyDetail = businessLine.legacyTaskId
      ? await this.taskService.getDetail(businessLine.legacyTaskId)
      : null;
    const sourceRecords = await this.businessLineRepository.listSourceContextsForBusinessLine(businessLine.id);
    const automationSnapshot = await this.automationSnapshotForBusinessLine({
      businessLine,
      tasks,
      sourceRecords,
      nativeRecords: records,
    });
    const memoryRecords = await this.memoryRecordsForBusinessLine({
      businessLine,
      nativeRecords: records,
      reviews,
      decisions,
    });
    const reviewIds = new Set(reviews.map((review) => review.id));
    const reviewDecisions = decisions.filter((decision) => decision.sourceId && reviewIds.has(decision.sourceId));
    const blockedDecisions = [
      ...(legacyDetail?.decisions ?? []),
      ...reviewDecisions,
    ].filter((decision, index, list) =>
      decision.status === 'pending' && list.findIndex((item) => item.id === decision.id) === index);
    const activeDecisions = blockedDecisions;
    const enrichedSkillRevisions = skillRevisions.map((revision) => {
      const sourceReview = reviews.find((review) => review.id === revision.sourceReviewId);
      const approvalDecision = decisionForReview(revision.sourceReviewId, decisions);
      const isExpired = isPastIso(revision.expiresAt);
      const needsReview = isPastIso(revision.reviewAfterAt);
      return {
        ...revision,
        provenance: {
          ...(revision.provenance ?? { sourceType: 'business_line_review' as const }),
          sourceReviewId: revision.sourceReviewId,
          sourceReviewSummary: sourceReview?.resultSummary ?? revision.provenance?.sourceReviewSummary ?? null,
          sourceActionId: sourceReview?.sourceActionId ?? revision.provenance?.sourceActionId ?? null,
        },
        requiresDecision: sourceReview?.requiresDecision ?? false,
        approvalDecisionId: approvalDecision?.id ?? null,
        approvalDecisionStatus: approvalDecision?.status ?? null,
        isExpired,
        needsReview,
      };
    });
    const acceptedSkills = enrichedSkillRevisions.filter((revision) =>
      revision.status === 'active' && !revision.isExpired);
    const latestRecords = memoryRecords.filter((record) => record.shouldAffectFutureContext).slice(0, 10);
    const missingContext = this.deriveMissingContext({
      businessLine,
      nextActions,
      recordCount: memoryRecords.length,
    });
    const contextPack: BusinessLineContextPack = {
      businessSummary: businessLine.summary,
      currentGoal: businessLine.goal,
      recentChanges: this.recentChangesForBusinessLine(businessLine, nextActions, latestRecords),
      activeDecisions,
      openNextActions: nextActions,
      latestRecords,
      acceptedSkills,
      knownConstraints: [
        'Cross-business records and skills are excluded unless explicitly selected.',
        'Durable writes must pass Taskplane service and Decision gates.',
      ],
      permissionBoundaries: [
        'Risky skill/SOP updates stay proposed until accepted or routed through Decisions.',
        'Business-line sensors are read-only; local, external, public, or money-affecting mutations require a Decision-approved action.',
        'External Access previews can create reviewable business records, but preview evidence stays out of future context until reviewed or confirmed.',
      ],
      missingContext,
    };

    return {
      businessLine,
      overview: {
        nextSuggestion: this.suggestionForBusinessLine({
          businessLine,
          nextActions,
          records: memoryRecords,
          sourceRecordCount: sourceRecords.length,
          pendingDecisionCount: blockedDecisions.length,
          activeSkills: acceptedSkills,
          stableOrder: 0,
        })?.suggestion ?? null,
        recentChanges: contextPack.recentChanges,
        blockedDecisions,
        missingContext,
        latestResult: memoryRecords.find((record) => record.type === 'result' || record.type === 'review') ?? null,
        latestImprovement: enrichedSkillRevisions.find((revision) => revision.status === 'active' || revision.status === 'proposed') ?? null,
      },
      records: memoryRecords,
      sourceRecords,
      nextActions,
      automations: automationSnapshot,
      learning: {
        reviews,
        skillRevisions: enrichedSkillRevisions,
        acceptedSkills,
      },
      contextPack,
    };
  }

  async listTodaySuggestions(): Promise<BusinessLineTodaySuggestion[]> {
    await this.ensureLegacyBusinessLines();
    const [businessLines, tasks] = await Promise.all([
      this.businessLineRepository.list(),
      this.taskService.list(),
    ]);
    const decisions = await this.decisionService.list();
    const scoredSuggestions = await Promise.all(businessLines.map(async (businessLine, index) => {
      const [nativeRecords, reviews, skillRevisions] = await Promise.all([
        this.businessLineRepository.listRecords(businessLine.id, 10),
        this.businessLineRepository.listReviews(businessLine.id),
        this.businessLineRepository.listSkillRevisions(businessLine.id),
      ]);
      const memoryRecords = await this.memoryRecordsForBusinessLine({
        businessLine,
        nativeRecords,
        reviews,
        decisions,
      });
      const reviewIds = new Set(reviews.map((review) => review.id));
      const sourceRecordCount = businessLine.legacyTaskId
        ? (await this.taskService.getDetail(businessLine.legacyTaskId))?.sourceContexts.length ?? 0
        : 0;
      const taskDecisionCount = businessLine.legacyTaskId
        ? ((await this.taskService.getDetail(businessLine.legacyTaskId))?.decisions ?? []).filter((decision) => decision.status === 'pending').length
        : 0;
      const reviewDecisionCount = decisions.filter((decision) =>
        decision.status === 'pending' && decision.sourceId && reviewIds.has(decision.sourceId)).length;
      const pendingDecisionCount = taskDecisionCount + reviewDecisionCount;
      return this.suggestionForBusinessLine({
        businessLine,
        nextActions: await this.nextActionsForBusinessLine(businessLine, tasks),
        records: memoryRecords,
        sourceRecordCount,
        pendingDecisionCount,
        activeSkills: skillRevisions.filter((revision) => revision.status === 'active' && !isPastIso(revision.expiresAt)),
        stableOrder: index,
      });
    }));
    return scoredSuggestions
      .filter((item): item is ScoredBusinessLineSuggestion => Boolean(item))
      .sort((left, right) =>
        right.score - left.score
        || right.updatedAt.localeCompare(left.updatedAt)
        || left.suggestion.businessLineId.localeCompare(right.suggestion.businessLineId))
      .map((item) => item.suggestion)
      .slice(0, 8);
  }

  async resolveOwnership(input: BusinessLineOwnershipInput): Promise<BusinessLineOwnershipResolution> {
    return this.businessLineRepository.resolveBusinessLineOwnership(input);
  }

  async recordReview(input: RecordBusinessLineReviewInput): Promise<BusinessLineWorkspace> {
    const ownership = await this.resolveOwnership({ explicitBusinessLineId: input.businessLineId });
    if (ownership.status !== 'resolved') throw new Error(`Business line not found: ${input.businessLineId}`);
    const businessLine = await this.businessLineRepository.findById(ownership.businessLineId);
    if (!businessLine) throw new Error(`Business line not found: ${input.businessLineId}`);
    const review = await this.businessLineRepository.createReview(input);
    for (const recordSuggestion of input.recordSuggestions ?? []) {
      const summary = recordSuggestion.summary.trim();
      if (!summary) continue;
      await this.businessLineRepository.createRecord({
        businessLineId: input.businessLineId,
        type: this.normalizeReviewRecordType(recordSuggestion),
        source: recordSuggestion.source?.trim()
          || (input.sourceRunId ? `run:${input.sourceRunId}` : `review:${review.id}`),
        summary,
        confidence: recordSuggestion.confidence ?? input.confidence ?? 70,
        linkedActionId: input.sourceActionId ?? null,
        shouldAffectFutureContext: recordSuggestion.shouldAffectFutureContext ?? true,
      });
    }
    for (const suggestion of input.skillUpdateSuggestions ?? []) {
      if (!suggestion.trim()) continue;
      const scopePath = 'Learning / SOP';
      const previousActiveRevision = await this.activeSkillRevisionForScope(input.businessLineId, scopePath);
      await this.businessLineRepository.createSkillRevision({
        businessLineId: input.businessLineId,
        sourceReviewId: review.id,
        nextContent: suggestion,
        changeReason: input.hypothesisChange ?? input.resultSummary,
        previousContent: previousActiveRevision?.nextContent ?? null,
        scopePath,
        provenance: {
          sourceType: 'business_line_review',
          sourceReviewId: review.id,
          sourceReviewSummary: review.resultSummary,
          sourceActionId: review.sourceActionId,
        },
        reviewAfterAt: input.reviewAfterAt ?? null,
        expiresAt: input.expiresAt ?? null,
      });
    }
    for (const suggestion of input.nextActionSuggestions ?? []) {
      if (!suggestion.trim()) continue;
      const createdTask = await this.taskService.create({
        title: suggestion.trim(),
        summary: `Business line next action from review ${review.id}: ${input.resultSummary}`,
        taskType: 'simple',
        taskFacets: ['simple'],
        parentTaskId: businessLine.legacyTaskId,
        businessLineId: businessLine.id,
      });
      await this.taskService.update({
        id: createdTask.id,
        nextStep: suggestion.trim(),
      });
      const actionRecord = await this.businessLineRepository.createRecord({
        businessLineId: input.businessLineId,
        type: 'action',
        source: `review:${review.id}`,
        summary: suggestion,
        confidence: input.confidence ?? 70,
        linkedActionId: createdTask.id,
      });
      await this.businessLineRepository.createActionLink({
        businessLineId: input.businessLineId,
        taskId: createdTask.id,
        sourceReviewId: review.id,
        sourceRecordId: actionRecord.id,
      });
    }
    if (input.requiresDecision) {
      const decision = await this.decisionService.create({
        taskId: businessLine.legacyTaskId,
        businessLineId: businessLine.id,
        title: `确认业务线学习更新：${businessLine.title}`,
        scope: businessLine.legacyTaskId ? 'task' : 'business_line',
        kind: 'policy_change',
        sourceType: 'system',
        sourceId: review.id,
        sourceLabel: 'Business Line post-action review',
        context: {
          whyNow: '这次复盘提出了可能改变未来建议或 SOP 的学习更新。',
          ifDeferred: '相关 skill/SOP revision 将保持 proposed，不会影响后续业务线 context pack。',
          impact: input.skillUpdateSuggestions?.join(' / ') || input.resultSummary,
          reversibility: '可通过不接受或禁用 revision 回滚。',
        },
        options: [
          { id: 'approve_learning', label: '允许进入业务线学习', description: '继续人工接受具体 revision。' },
          { id: 'keep_proposed', label: '暂不采用', description: '保留复盘记录，但不让 SOP 影响后续建议。' },
        ],
        recommendation: {
          optionId: 'keep_proposed',
          label: '先保持 proposed',
          reason: 'MVP 阶段将风险更新留在显式确认边界内。',
        },
      });
      for (const suggestion of input.skillUpdateSuggestions ?? []) {
        if (!suggestion.trim()) continue;
        await this.businessLineRepository.createRecord({
          businessLineId: input.businessLineId,
          type: 'decision',
          source: `decision:${decision.id}`,
          summary: `Risky learning update requires Decision approval: ${decision.title}`,
          confidence: input.confidence ?? 70,
          linkedDecisionId: decision.id,
          shouldAffectFutureContext: false,
        });
      }
    }
    const workspace = await this.getWorkspace(input.businessLineId);
    if (!workspace) throw new Error(`Business line not found: ${input.businessLineId}`);
    return workspace;
  }

  async acceptSkillRevision(input: AcceptBusinessLineSkillRevisionInput): Promise<BusinessLineWorkspace> {
    const revisionBeforeActivation = await this.businessLineRepository.findSkillRevisionById(input.revisionId);
    if (!revisionBeforeActivation) {
      throw new Error(`Business line skill revision not found: ${input.revisionId}`);
    }
    const reviews = await this.businessLineRepository.listReviews(revisionBeforeActivation.businessLineId);
    const sourceReview = reviews.find((review) => review.id === revisionBeforeActivation.sourceReviewId);
    if (revisionBeforeActivation.status !== 'proposed') {
      throw new Error(`Only proposed business-line skill revisions can be accepted: ${input.revisionId}`);
    }
    if (isPastIso(revisionBeforeActivation.expiresAt)) {
      throw new Error('Expired business-line skill revision cannot be activated.');
    }
    let approvalDecision: DecisionRecord | null = null;
    if (sourceReview?.requiresDecision) {
      approvalDecision = decisionForReview(sourceReview.id, await this.decisionService.list());
      if (approvalDecision?.status !== 'approved') {
        throw new Error('Risky business-line skill revision requires an approved Decision before activation.');
      }
    }
    const revision = await this.businessLineRepository.activateSkillRevision({
      id: input.revisionId,
      approvedBy: input.approvedBy?.trim() || 'local_operator',
      approvalSourceType: approvalDecision ? 'decision' : 'operator',
      approvalSourceId: approvalDecision?.id ?? null,
    });
    const workspace = await this.getWorkspace(revision.businessLineId);
    if (!workspace) throw new Error(`Business line not found: ${revision.businessLineId}`);
    return workspace;
  }

  async rejectSkillRevision(input: RejectBusinessLineSkillRevisionInput): Promise<BusinessLineWorkspace> {
    const revision = await this.businessLineRepository.rejectSkillRevision(
      input.revisionId,
      input.rejectedBy?.trim() || 'local_operator',
    );
    const workspace = await this.getWorkspace(revision.businessLineId);
    if (!workspace) throw new Error(`Business line not found: ${revision.businessLineId}`);
    return workspace;
  }

  async disableSkillRevision(input: DisableBusinessLineSkillRevisionInput): Promise<BusinessLineWorkspace> {
    const revision = await this.businessLineRepository.disableSkillRevision(
      input.revisionId,
      input.disabledBy?.trim() || 'local_operator',
    );
    const workspace = await this.getWorkspace(revision.businessLineId);
    if (!workspace) throw new Error(`Business line not found: ${revision.businessLineId}`);
    return workspace;
  }

  async rollbackSkillRevision(input: RollbackBusinessLineSkillRevisionInput): Promise<BusinessLineWorkspace> {
    const revision = await this.businessLineRepository.rollbackSkillRevision(
      input.revisionId,
      input.approvedBy?.trim() || 'local_operator',
    );
    const workspace = await this.getWorkspace(revision.businessLineId);
    if (!workspace) throw new Error(`Business line not found: ${revision.businessLineId}`);
    return workspace;
  }

  private shouldSeedCreatedBusinessLine(input: CreateBusinessLineInput): boolean {
    return Boolean(
      input.template
      || input.desiredOutcome?.trim()
      || input.continuousInformation?.trim()
      || input.aiWorkAndConfirmation?.trim()
      || input.sourceBusinessLineId?.trim()
      || normalizeBusinessLineCreationLines(input.initialStructure).length
      || normalizeBusinessLineCreationLines(input.initialRecords).length
      || normalizeBusinessLineCreationLines(input.reviewPrompts).length
      || normalizeBusinessLineCreationLines(input.proposedSops).length
      || normalizeBusinessLineCreationLines(input.initialNextActions).length
    );
  }

  private async seedCreatedBusinessLine(params: {
    businessLine: BusinessLine;
    input: CreateBusinessLineInput;
    sourceBusinessLine: BusinessLine | null;
  }): Promise<void> {
    const template = params.input.template ?? 'custom';
    const generated = buildBusinessLineCreationDraft({
      aiWorkAndConfirmation: params.input.aiWorkAndConfirmation,
      continuousInformation: params.input.continuousInformation,
      desiredOutcome: params.input.desiredOutcome ?? params.input.goal,
      template,
      title: params.input.title,
    });
    const initialStructure = normalizeBusinessLineCreationLines(params.input.initialStructure).length
      ? normalizeBusinessLineCreationLines(params.input.initialStructure)
      : generated.initialStructure;
    const initialRecords = normalizeBusinessLineCreationLines(params.input.initialRecords).length
      ? normalizeBusinessLineCreationLines(params.input.initialRecords)
      : generated.initialRecords;
    const reviewPrompts = normalizeBusinessLineCreationLines(params.input.reviewPrompts).length
      ? normalizeBusinessLineCreationLines(params.input.reviewPrompts)
      : generated.reviewPrompts;
    const proposedSops = normalizeBusinessLineCreationLines(params.input.proposedSops).length
      ? normalizeBusinessLineCreationLines(params.input.proposedSops)
      : generated.proposedSops;
    const initialNextActions = normalizeBusinessLineCreationLines(params.input.initialNextActions).length
      ? normalizeBusinessLineCreationLines(params.input.initialNextActions)
      : generated.initialNextActions;
    const inheritedStructure = params.sourceBusinessLine
      ? await this.inheritedStructureRecords(params.sourceBusinessLine)
      : [];
    const inheritedActiveSops = params.sourceBusinessLine
      ? await this.inheritedActiveSops(params.sourceBusinessLine)
      : [];
    const inheritedSopTexts = inheritedActiveSops.map((revision) => revision.nextContent);

    const review = await this.businessLineRepository.createReview({
      businessLineId: params.businessLine.id,
      resultSummary: `Business line created from ${this.templateLabel(template)} creation flow.`,
      evidenceItems: [
        `What this business line is: ${params.input.title.trim()}`,
        params.input.desiredOutcome ? `Outcome: ${params.input.desiredOutcome.trim()}` : null,
        params.input.continuousInformation ? `Continuous records: ${params.input.continuousInformation.trim()}` : null,
        params.input.aiWorkAndConfirmation ? `AI and confirmation: ${params.input.aiWorkAndConfirmation.trim()}` : null,
        params.sourceBusinessLine ? `Based on existing business line: ${params.sourceBusinessLine.title}` : null,
      ].filter((item): item is string => Boolean(item)),
      hypothesisChange: params.input.desiredOutcome ?? params.input.goal ?? null,
      skillUpdateSuggestions: [...proposedSops, ...inheritedSopTexts],
      nextActionSuggestions: initialNextActions,
      confidence: 75,
      requiresDecision: false,
    });

    for (const item of initialStructure) {
      await this.businessLineRepository.createRecord({
        businessLineId: params.businessLine.id,
        type: 'signal',
        source: `template:${template}:structure`,
        summary: `Structure: ${item}`,
        confidence: 75,
        shouldAffectFutureContext: true,
      });
    }
    for (const item of inheritedStructure) {
      await this.businessLineRepository.createRecord({
        businessLineId: params.businessLine.id,
        type: 'signal',
        source: `business_line:${params.sourceBusinessLine!.id}:structure`,
        summary: item.summary,
        confidence: item.confidence,
        shouldAffectFutureContext: true,
      });
    }
    for (const item of initialRecords) {
      await this.businessLineRepository.createRecord({
        businessLineId: params.businessLine.id,
        type: 'signal',
        source: `template:${template}:record`,
        summary: item,
        confidence: 75,
        shouldAffectFutureContext: true,
      });
    }
    for (const prompt of reviewPrompts) {
      await this.businessLineRepository.createRecord({
        businessLineId: params.businessLine.id,
        type: 'review',
        source: `template:${template}:review_prompt`,
        summary: `Review prompt: ${prompt}`,
        confidence: 75,
        shouldAffectFutureContext: false,
      });
    }
    for (const suggestion of proposedSops) {
      await this.businessLineRepository.createSkillRevision({
        businessLineId: params.businessLine.id,
        sourceReviewId: review.id,
        nextContent: suggestion,
        changeReason: `Proposed by ${this.templateLabel(template)} creation flow.`,
        provenance: {
          sourceType: 'template',
          sourceReviewId: review.id,
          sourceReviewSummary: review.resultSummary,
          sourceActionId: review.sourceActionId,
        },
      });
    }
    for (const revision of inheritedActiveSops) {
      await this.businessLineRepository.createSkillRevision({
        businessLineId: params.businessLine.id,
        sourceReviewId: review.id,
        nextContent: revision.nextContent,
        previousContent: null,
        scopePath: revision.scopePath,
        changeReason: `Inherited from ${params.sourceBusinessLine!.title}; explicit acceptance required before active use.`,
        provenance: {
          sourceType: 'inherited',
          sourceReviewId: review.id,
          sourceReviewSummary: review.resultSummary,
          sourceActionId: review.sourceActionId,
        },
      });
    }
    for (const suggestion of initialNextActions) {
      const createdTask = await this.taskService.create({
        title: suggestion,
        summary: `Initial business-line next action from ${this.templateLabel(template)} creation flow.`,
        taskType: 'simple',
        taskFacets: ['simple'],
        parentTaskId: params.businessLine.legacyTaskId,
        businessLineId: params.businessLine.id,
      });
      await this.taskService.update({
        id: createdTask.id,
        nextStep: suggestion,
      });
      const actionRecord = await this.businessLineRepository.createRecord({
        businessLineId: params.businessLine.id,
        type: 'action',
        source: `creation:${review.id}`,
        summary: suggestion,
        confidence: 75,
        linkedActionId: createdTask.id,
      });
      await this.businessLineRepository.createActionLink({
        businessLineId: params.businessLine.id,
        taskId: createdTask.id,
        sourceReviewId: review.id,
        sourceRecordId: actionRecord.id,
      });
    }
  }

  private async inheritedStructureRecords(businessLine: BusinessLine): Promise<Awaited<ReturnType<BusinessLineRepository['listRecords']>>> {
    const records = await this.businessLineRepository.listRecords(businessLine.id, 100);
    return records.filter((record) => record.source.includes(':structure'));
  }

  private async inheritedActiveSops(businessLine: BusinessLine): Promise<BusinessLineSkillRevision[]> {
    return (await this.businessLineRepository.listSkillRevisions(businessLine.id))
      .filter((revision) => revision.status === 'active' && !isPastIso(revision.expiresAt));
  }

  private async activeSkillRevisionForScope(
    businessLineId: string,
    scopePath: string,
  ): Promise<BusinessLineSkillRevision | null> {
    const revisions = await this.businessLineRepository.listSkillRevisions(businessLineId);
    return revisions.find((revision) =>
      revision.status === 'active'
      && revision.scopePath === scopePath
      && !isPastIso(revision.expiresAt)) ?? null;
  }

  private templateLabel(template: BusinessLineCreationTemplate): string {
    return template === 'web_product' ? 'Web Product / Software Product' : 'Custom';
  }

  private normalizeReviewRecordType(record: BusinessLineReviewRecordSuggestion): BusinessLineRecord['type'] {
    const allowed: BusinessLineRecord['type'][] = [
      'signal',
      'hypothesis',
      'decision',
      'action',
      'artifact',
      'result',
      'review',
      'rule',
    ];
    return allowed.includes(record.type) ? record.type : 'result';
  }

  private async memoryRecordsForBusinessLine(params: {
    businessLine: BusinessLine;
    nativeRecords: BusinessLineRecord[];
    reviews: BusinessLineReview[];
    decisions: DecisionRecord[];
  }): Promise<BusinessLineRecord[]> {
    const [sourceContexts, artifacts, taskFiles] = await Promise.all([
      this.businessLineRepository.listSourceContextsForBusinessLine(params.businessLine.id),
      this.businessLineRepository.listArtifactsForBusinessLine(params.businessLine.id),
      this.businessLineRepository.listTaskFilesForBusinessLine(params.businessLine.id),
    ]);
    const reviewIds = new Set(params.reviews.map((review) => review.id));
    const decisionRecords: BusinessLineRecord[] = [];
    for (const decision of params.decisions) {
      if (await this.decisionBelongsToBusinessLine(decision, params.businessLine, reviewIds)) {
        decisionRecords.push(this.projectDecisionRecord(params.businessLine.id, decision));
      }
    }
    const nativeRecords = this.nativeRecordsWithoutProjectedReviewDuplicates(
      params.nativeRecords,
      params.reviews,
    ).filter((record) => !this.isSkillRevisionMirrorRecord(record));

    return newestFirst([
      ...nativeRecords,
      ...sourceContexts.map((source) => this.projectSourceContextRecord(params.businessLine.id, source)),
      ...artifacts.map((artifact) => this.projectArtifactRecord(params.businessLine.id, artifact)),
      ...taskFiles.map((file) => this.projectTaskFileRecord(params.businessLine.id, file)),
      ...decisionRecords,
      ...params.reviews.map((review) => this.projectReviewRecord(params.businessLine.id, review)),
    ]);
  }

  private nativeRecordsWithoutProjectedReviewDuplicates(
    nativeRecords: BusinessLineRecord[],
    reviews: BusinessLineReview[],
  ): BusinessLineRecord[] {
    return nativeRecords.filter((record) =>
      !reviews.some((review) => this.isStructuredReviewMirrorRecord(record, review)));
  }

  private isStructuredReviewMirrorRecord(record: BusinessLineRecord, review: BusinessLineReview): boolean {
    if (record.type !== 'review') return false;
    if (record.source !== 'post_action_review' && !record.source.startsWith('next_action:')) return false;
    return record.summary.trim() === review.resultSummary.trim()
      && (record.linkedActionId ?? null) === (review.sourceActionId ?? null);
  }

  private isSkillRevisionMirrorRecord(record: BusinessLineRecord): boolean {
    return record.type === 'rule' && record.source.startsWith('skill_revision:');
  }

  private async decisionBelongsToBusinessLine(
    decision: DecisionRecord,
    businessLine: BusinessLine,
    reviewIds: Set<string>,
  ): Promise<boolean> {
    if (decision.businessLineId) return decision.businessLineId === businessLine.id;
    if (decision.sourceId && reviewIds.has(decision.sourceId)) return true;
    if (!decision.taskId) return false;
    return (await this.businessLineRepository.resolveBusinessLineForTask(decision.taskId)) === businessLine.id;
  }

  private projectSourceContextRecord(businessLineId: string, source: SourceContextRecord): BusinessLineRecord {
    const summary = source.note ?? source.content ?? source.uri ?? source.title;
    const shouldAffectFutureContext = source.status === 'active' && source.isKey;
    return {
      id: `source_context:${source.id}`,
      type: 'signal',
      businessLineId,
      source: `source_context:${source.id}`,
      summary: compactRecordSummary(`${source.title}: ${summary}`),
      confidence: source.credibility === 'verified' ? 90 : source.credibility === 'low' ? 40 : 60,
      linkedActionId: source.taskId,
      linkedDecisionId: null,
      shouldAffectFutureContext,
      futureContextReason: shouldAffectFutureContext
        ? 'Source context is active and marked key, so it is included in default future context.'
        : 'Source context is visible memory but is not marked key for default future context.',
      provenance: {
        sourceType: 'source_context',
        sourceId: source.id,
        sourceLabel: source.uri ?? source.title,
        taskId: source.taskId,
        runId: source.runId ?? null,
        uri: source.uri,
      },
      createdAt: source.createdAt,
    };
  }

  private projectArtifactRecord(businessLineId: string, artifact: ArtifactRecord): BusinessLineRecord {
    return {
      id: `artifact:${artifact.id}`,
      type: artifact.kind === 'run_output' ? 'result' : 'artifact',
      businessLineId,
      source: `artifact:${artifact.id}`,
      summary: compactRecordSummary(`${artifact.title}: ${artifact.content}`),
      confidence: 70,
      linkedActionId: artifact.taskId,
      linkedDecisionId: null,
      shouldAffectFutureContext: false,
      futureContextReason: 'Artifacts are projected into Records but excluded from default future context until promoted.',
      provenance: {
        sourceType: 'artifact',
        sourceId: artifact.id,
        sourceLabel: artifact.title,
        taskId: artifact.taskId,
        runId: artifact.sourceType === 'run' ? artifact.sourceId : null,
      },
      createdAt: artifact.createdAt,
    };
  }

  private projectTaskFileRecord(businessLineId: string, file: TaskFileRecord): BusinessLineRecord {
    return {
      id: `task_file:${file.id}`,
      type: 'artifact',
      businessLineId,
      source: `task_file:${file.id}`,
      summary: compactRecordSummary(`${file.path}: ${file.content || file.name}`),
      confidence: 65,
      linkedActionId: file.taskId,
      linkedDecisionId: null,
      shouldAffectFutureContext: false,
      futureContextReason: 'Task files are visible business memory but excluded from default future context until promoted.',
      provenance: {
        sourceType: 'task_file',
        sourceId: file.id,
        sourceLabel: file.path,
        taskId: file.taskId,
      },
      createdAt: file.createdAt,
    };
  }

  private projectDecisionRecord(businessLineId: string, decision: DecisionRecord): BusinessLineRecord {
    const shouldAffectFutureContext = decision.status === 'pending' || decision.status === 'approved';
    return {
      id: `decision:${decision.id}`,
      type: 'decision',
      businessLineId,
      source: `decision:${decision.id}`,
      summary: compactRecordSummary(`${decision.title} (${decision.status})`),
      confidence: decision.status === 'approved' ? 85 : decision.status === 'pending' ? 70 : 50,
      linkedActionId: decision.taskId,
      linkedDecisionId: decision.id,
      shouldAffectFutureContext,
      futureContextReason: shouldAffectFutureContext
        ? 'Pending or approved Decisions remain in default future context.'
        : 'Closed Decision is retained as memory but excluded from default future context.',
      provenance: {
        sourceType: 'decision',
        sourceId: decision.id,
        sourceLabel: decision.sourceLabel ?? decision.title,
        taskId: decision.taskId,
      },
      createdAt: decision.createdAt,
    };
  }

  private projectReviewRecord(businessLineId: string, review: BusinessLineReview): BusinessLineRecord {
    return {
      id: `review:${review.id}`,
      type: 'review',
      businessLineId,
      source: `review:${review.id}`,
      summary: compactRecordSummary(review.resultSummary),
      confidence: review.confidence,
      linkedActionId: review.sourceActionId,
      linkedDecisionId: null,
      shouldAffectFutureContext: true,
      futureContextReason: 'Structured post-action review is included in default future context.',
      provenance: {
        sourceType: 'review',
        sourceId: review.id,
        sourceLabel: 'post-action review',
        taskId: review.sourceActionId,
      },
      createdAt: review.createdAt,
    };
  }

  private async ensureLegacyBusinessLines(): Promise<void> {
    const tasks = await this.taskService.list();
    for (const task of tasks.filter(isBusinessLineLegacyTask)) {
      await this.businessLineRepository.ensureForLegacyTask(task);
    }
  }

  private async nextActionsForBusinessLine(
    businessLine: BusinessLine,
    tasks: TaskListItemRecord[],
  ): Promise<TaskListItemRecord[]> {
    const linkedActionIds = new Set(await this.businessLineRepository.listActionTaskIds(businessLine.id));
    return newestFirst(tasks.filter((task) => {
      if (linkedActionIds.has(task.id)) return task.state !== 'completed' && task.state !== 'archived';
      if (!businessLine.legacyTaskId) return false;
      if (task.id === businessLine.legacyTaskId) return task.state !== 'completed' && task.state !== 'archived';
      return task.parentTaskId === businessLine.legacyTaskId
        && task.state !== 'completed'
        && task.state !== 'archived';
    }));
  }

  private async automationSnapshotForBusinessLine(params: {
    businessLine: BusinessLine;
    tasks: TaskListItemRecord[];
    sourceRecords: SourceContextRecord[];
    nativeRecords: BusinessLineRecord[];
  }): Promise<BusinessLineWorkspace['automations']> {
    const linkedActionIds = new Set(await this.businessLineRepository.listActionTaskIds(params.businessLine.id));
    const businessLineTasks = params.tasks.filter((task) =>
      this.taskBelongsToBusinessLine(task, params.businessLine, linkedActionIds));
    const automationTasks = newestFirst(businessLineTasks.filter(isAutomationTask));
    const automations = automationTasks.map((task) =>
      this.projectAutomationTask(params.businessLine.id, task));
    const automationSensors = automationTasks.map((task) =>
      this.projectAutomationSensor(params.businessLine.id, task));
    const externalSensors = this.projectExternalSensors({
      businessLineId: params.businessLine.id,
      sourceRecords: params.sourceRecords,
      nativeRecords: params.nativeRecords,
    });

    return {
      automations,
      sensors: [...automationSensors, ...externalSensors],
    };
  }

  private taskBelongsToBusinessLine(
    task: TaskListItemRecord,
    businessLine: BusinessLine,
    linkedActionIds: Set<string>,
  ): boolean {
    if (task.businessLineId === businessLine.id) return true;
    if (linkedActionIds.has(task.id)) return true;
    if (!businessLine.legacyTaskId) return false;
    return task.id === businessLine.legacyTaskId || task.parentTaskId === businessLine.legacyTaskId;
  }

  private projectAutomationTask(businessLineId: string, task: TaskListItemRecord): BusinessLineAutomation {
    const kind = automationKindForTask(task);
    return {
      id: `automation:${task.id}`,
      businessLineId,
      taskId: task.id,
      kind,
      title: task.title,
      summary: task.summary,
      triggerLabel: automationTriggerLabel(kind),
      status: task.state === 'waiting_external'
        ? 'paused'
        : task.activeBlocker || task.riskLevel === 'high'
        ? 'blocked'
        : 'active',
      risk: {
        level: task.riskLevel,
        note: task.riskNote,
      },
      mutationBoundary: 'Uses global MCP/runtime/external authorization; any local, external, public, or money-affecting mutation must pass an action-level Decision gate.',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private projectAutomationSensor(businessLineId: string, task: TaskListItemRecord): BusinessLineSensor {
    const kind = automationKindForTask(task);
    return {
      id: `sensor:${task.id}`,
      businessLineId,
      sourceType: kind === 'event' ? 'event_task' : 'scheduled_task',
      sourceLabel: task.title,
      title: `${automationTriggerLabel(kind)}: ${task.title}`,
      status: task.state === 'waiting_external' ? 'paused' : 'watching',
      readOnly: true,
      reviewBoundary: 'Read-only sensor output becomes a candidate record first; mutations require a Decision-approved action.',
      sourceTaskId: task.id,
      sourceRecordIds: [],
    };
  }

  private projectExternalSensors(params: {
    businessLineId: string;
    sourceRecords: SourceContextRecord[];
    nativeRecords: BusinessLineRecord[];
  }): BusinessLineSensor[] {
    const sensors = new Map<string, BusinessLineSensor>();
    for (const source of params.sourceRecords) {
      const connectorLabel = connectorLabelForSource(source);
      if (!connectorLabel) continue;
      const key = `external:${connectorLabel}`;
      const existing = sensors.get(key);
      const status: BusinessLineSensor['status'] = source.containsSensitiveData || source.credibility === 'low'
        ? 'needs_review'
        : 'watching';
      sensors.set(key, {
        id: key,
        businessLineId: params.businessLineId,
        sourceType: 'external_access',
        sourceLabel: connectorLabel,
        title: `External Access watch: ${connectorLabel}`,
        status: existing?.status === 'needs_review' || status === 'needs_review' ? 'needs_review' : 'watching',
        readOnly: true,
        reviewBoundary: 'External evidence stays out of future context unless a source or business record is explicitly reviewed or confirmed.',
        sourceTaskId: source.taskId,
        sourceRecordIds: [...new Set([...(existing?.sourceRecordIds ?? []), `source_context:${source.id}`])],
      });
    }
    for (const record of params.nativeRecords) {
      if (!record.source.startsWith('external_access:')) continue;
      const connectorLabel = record.source.split(':')[1] || 'external_access';
      const key = `external:${connectorLabel}`;
      const existing = sensors.get(key);
      sensors.set(key, {
        id: key,
        businessLineId: params.businessLineId,
        sourceType: 'external_access',
        sourceLabel: connectorLabel,
        title: `External Access watch: ${connectorLabel}`,
        status: 'needs_review',
        readOnly: true,
        reviewBoundary: 'Reviewed external previews create business records that remain excluded from future context until explicitly promoted.',
        sourceTaskId: record.linkedActionId,
        sourceRecordIds: [...new Set([...(existing?.sourceRecordIds ?? []), record.id])],
      });
    }
    return [...sensors.values()];
  }

  private deriveMissingContext(params: {
    businessLine: BusinessLine;
    nextActions: TaskListItemRecord[];
    recordCount: number;
  }): string[] {
    return [
      !params.businessLine.goal ? 'Business line goal is not explicit yet.' : null,
      params.recordCount === 0 ? 'No source record or review has been captured for this business line.' : null,
      params.nextActions.length === 0 ? 'No open next action is attached to this business line.' : null,
    ].filter((item): item is string => Boolean(item));
  }

  private recentChangesForBusinessLine(
    businessLine: BusinessLine,
    nextActions: TaskListItemRecord[],
    records: BusinessLineRecord[],
  ): string[] {
    return [
      records[0]?.summary ?? null,
      nextActions[0]?.nextStep ? `Next action: ${nextActions[0].nextStep}` : null,
      businessLine.legacyTaskId ? `Adapted from legacy task ${businessLine.legacyTaskId}.` : null,
    ].filter((item): item is string => Boolean(item)).slice(0, 4);
  }

  private suggestionForBusinessLine(params: {
    businessLine: BusinessLine;
    nextActions: TaskListItemRecord[];
    records: BusinessLineRecord[];
    sourceRecordCount: number;
    pendingDecisionCount: number;
    activeSkills?: BusinessLineSkillRevision[];
    stableOrder: number;
  }): ScoredBusinessLineSuggestion | null {
    const activeSkills = params.activeSkills ?? [];
    const activeSkill = activeSkills[0] ?? null;
    const latestContextRecords = params.records
      .filter((record) => record.shouldAffectFutureContext)
      .slice(0, 3);
    const latestRecord = latestContextRecords[0] ?? params.records[0] ?? null;
    const latestReview = params.records.find((record) => record.type === 'review') ?? null;
    const pendingDecisionRecord = params.records.find((record) =>
      record.type === 'decision' && record.summary.includes('(pending)')) ?? null;

    if (params.nextActions[0]) {
      const task = params.nextActions[0];
      const sourceIds = [
        activeSkill?.sourceReviewId ? `review:${activeSkill.sourceReviewId}` : null,
        pendingDecisionRecord?.id ?? null,
        ...sourceRecordIds(latestContextRecords),
      ].filter((item): item is string => Boolean(item));
      const sourceLabels = [
        activeSkill?.nextContent,
        pendingDecisionRecord?.summary,
        ...sourceRecordSummaries(latestContextRecords),
        params.sourceRecordCount > 0 ? `${params.sourceRecordCount} source records on the legacy task` : null,
      ].filter((item): item is string => Boolean(item));
      const whyNow = task.activeBlocker
        ? `Current blocker: ${task.activeBlocker.title}`
        : task.waitingReason
        ? `Waiting reason: ${task.waitingReason}`
        : params.pendingDecisionCount > 0
        ? 'A pending Decision affects this business line before or during the next action.'
        : activeSkill
        ? `Accepted learning should shape this action: ${activeSkill.nextContent}`
        : latestReview
        ? `Recent review changed the next action context: ${latestReview.summary}`
        : task.nextStep ?? 'This is the current open next action for the business line.';
      const effortLevel = task.activeBlocker || task.riskLevel === 'high'
        ? 'high'
        : task.riskLevel === 'medium' || task.waitingReason
        ? 'medium'
        : 'low';
      return {
        suggestion: {
          id: `business-line-progress:${params.businessLine.id}:${task.id}`,
          type: 'progress',
          businessLineId: params.businessLine.id,
          businessLineTitle: params.businessLine.title,
          whyNow,
          expectedImpact: `Move ${params.businessLine.title} forward by completing its current Next Action.`,
          effort: {
            level: effortLevel,
            note: task.activeBlocker ? 'Includes blocker resolution.' : task.waitingReason ? 'Depends on waiting context.' : 'One focused execution step.',
          },
          confidence: clampConfidence(70 + (task.nextStep ? 10 : 0) + (latestRecord ? 5 : 0) + (activeSkill ? 5 : 0) - (params.pendingDecisionCount > 0 ? 5 : 0)),
          nextStep: task.nextStep ?? `Open next action: ${task.title}`,
          sourceRecords: sourceLabels.slice(0, 4),
          sourceRecordIds: [...new Set(sourceIds)].slice(0, 4),
          risk: { level: task.riskLevel, note: task.riskNote },
          requiresDecision: params.pendingDecisionCount > 0,
          taskId: task.id,
        },
        score: 100
          + (params.pendingDecisionCount > 0 ? 20 : 0)
          + (task.activeBlocker ? 15 : 0)
          + (task.riskLevel === 'high' ? 10 : task.riskLevel === 'medium' ? 5 : 0)
          + (activeSkill ? 5 : 0)
          - params.stableOrder,
        updatedAt: task.updatedAt,
      };
    }

    if (params.records.length === 0 || !params.businessLine.goal) {
      const missingGoal = !params.businessLine.goal;
      return {
        suggestion: {
          id: `business-line-record-gap:${params.businessLine.id}`,
          type: 'record_gap',
          businessLineId: params.businessLine.id,
          businessLineTitle: params.businessLine.title,
          whyNow: missingGoal
            ? 'This business line does not yet have an explicit goal, so Today cannot rank executable work confidently.'
            : 'This business line lacks enough recent records to make a trustworthy next recommendation.',
          expectedImpact: 'Improve future suggestion quality by adding the missing business context before selecting work.',
          effort: { level: 'low', note: 'Context capture only; not executable delivery work.' },
          confidence: params.records.length === 0 ? 45 : 55,
          nextStep: missingGoal
            ? 'Capture the business-line goal before choosing executable work.'
            : 'Capture a short business record before choosing executable work.',
          sourceRecords: sourceRecordSummaries(params.records, 2),
          sourceRecordIds: sourceRecordIds(params.records, 2),
          risk: { level: 'low', note: null },
          requiresDecision: false,
          taskId: null,
        },
        score: 45 + (params.records.length === 0 ? 10 : 0) - params.stableOrder,
        updatedAt: latestRecord?.createdAt ?? params.businessLine.updatedAt,
      };
    }

    if (activeSkill) {
      const sourceIds = [
        activeSkill.sourceReviewId ? `review:${activeSkill.sourceReviewId}` : null,
        ...sourceRecordIds(latestContextRecords),
      ].filter((item): item is string => Boolean(item));
      return {
        suggestion: {
          id: `business-line-improvement:${params.businessLine.id}:${activeSkill.id}`,
          type: 'improvement',
          businessLineId: params.businessLine.id,
          businessLineTitle: params.businessLine.title,
          whyNow: 'Accepted learning is available, but no executable Next Action is attached yet.',
          expectedImpact: 'Turn accepted learning into a concrete next action for this business line.',
          effort: { level: 'low', note: 'Planning step to choose or create the next action.' },
          confidence: clampConfidence(65 + (latestRecord ? 10 : 0)),
          nextStep: 'Create or choose the next business-line action using the accepted learning.',
          sourceRecords: [activeSkill.nextContent, ...sourceRecordSummaries(latestContextRecords, 2)],
          sourceRecordIds: [...new Set(sourceIds)].slice(0, 3),
          risk: { level: 'low', note: null },
          requiresDecision: false,
          taskId: null,
        },
        score: 70 + (latestRecord ? 5 : 0) - params.stableOrder,
        updatedAt: activeSkill.updatedAt,
      };
    }

    return {
      suggestion: {
        id: `business-line-record-gap:${params.businessLine.id}`,
        type: 'record_gap',
        businessLineId: params.businessLine.id,
        businessLineTitle: params.businessLine.title,
        whyNow: 'This business line has records, but no open Next Action or accepted learning to turn into executable work.',
        expectedImpact: 'Clarify whether the current records imply a new next action before Today treats it as work.',
        effort: { level: 'low', note: 'Review and context capture only.' },
        confidence: 60,
        nextStep: 'Review the latest business records and decide whether a Next Action is needed.',
        sourceRecords: sourceRecordSummaries(params.records, 2),
        sourceRecordIds: sourceRecordIds(params.records, 2),
        risk: { level: 'low', note: null },
        requiresDecision: false,
        taskId: null,
      },
      score: 50 - params.stableOrder,
      updatedAt: latestRecord?.createdAt ?? params.businessLine.updatedAt,
    };
  }
}

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
  BusinessLineCreationTemplate,
  BusinessLineContextPack,
  BusinessLineListItem,
  BusinessLineSkillRevision,
  BusinessLineTodaySuggestion,
  BusinessLineWorkspace,
  CreateBusinessLineInput,
  RecordBusinessLineReviewInput,
} from '../../../shared/types/business-line.js';
import type { DecisionRecord } from '../../../shared/types/decision.js';
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

function newestFirst<T extends { updatedAt?: string; createdAt: string }>(items: T[]): T[] {
  return [...items].sort((left, right) =>
    (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt));
}

function decisionForReview(reviewId: string, decisions: DecisionRecord[]): DecisionRecord | null {
  return decisions.find((decision) => decision.sourceId === reviewId) ?? null;
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
        activeSkillCount: skillRevisions.filter((revision) => revision.status === 'active').length,
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
    const sourceRecords = legacyDetail?.sourceContexts ?? [];
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
      return {
        ...revision,
        requiresDecision: sourceReview?.requiresDecision ?? false,
        approvalDecisionId: approvalDecision?.id ?? null,
        approvalDecisionStatus: approvalDecision?.status ?? null,
      };
    });
    const acceptedSkills = enrichedSkillRevisions.filter((revision) => revision.status === 'active');
    const latestRecords = records.filter((record) => record.shouldAffectFutureContext).slice(0, 10);
    const missingContext = this.deriveMissingContext({
      businessLine,
      nextActions,
      recordCount: records.length + sourceRecords.length,
    });
    const contextPack: BusinessLineContextPack = {
      businessSummary: businessLine.summary,
      currentGoal: businessLine.goal,
      recentChanges: this.recentChangesForBusinessLine(businessLine, nextActions, records),
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
      ],
      missingContext,
    };

    return {
      businessLine,
      overview: {
        nextSuggestion: this.suggestionForBusinessLine(businessLine, nextActions, records, sourceRecords.length, blockedDecisions.length),
        recentChanges: contextPack.recentChanges,
        blockedDecisions,
        missingContext,
        latestResult: records.find((record) => record.type === 'result' || record.type === 'review') ?? null,
        latestImprovement: enrichedSkillRevisions.find((revision) => revision.status === 'active' || revision.status === 'proposed') ?? null,
      },
      records,
      sourceRecords,
      nextActions,
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
    const suggestions = await Promise.all(businessLines.map(async (businessLine) => {
      const [records, reviews, decisions] = await Promise.all([
        this.businessLineRepository.listRecords(businessLine.id, 10),
        this.businessLineRepository.listReviews(businessLine.id),
        this.decisionService.list(),
      ]);
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
      return this.suggestionForBusinessLine(
        businessLine,
        await this.nextActionsForBusinessLine(businessLine, tasks),
        records,
        sourceRecordCount,
        pendingDecisionCount,
      );
    }));
    return suggestions
      .filter((suggestion): suggestion is BusinessLineTodaySuggestion => Boolean(suggestion))
      .slice(0, 8);
  }

  async recordReview(input: RecordBusinessLineReviewInput): Promise<BusinessLineWorkspace> {
    const businessLine = await this.businessLineRepository.findById(input.businessLineId);
    if (!businessLine) throw new Error(`Business line not found: ${input.businessLineId}`);
    const review = await this.businessLineRepository.createReview(input);
    await this.businessLineRepository.createRecord({
      businessLineId: input.businessLineId,
      type: 'review',
      source: input.sourceActionId ? `next_action:${input.sourceActionId}` : 'post_action_review',
      summary: input.resultSummary,
      confidence: input.confidence ?? 70,
      linkedActionId: input.sourceActionId ?? null,
      shouldAffectFutureContext: true,
    });
    for (const suggestion of input.skillUpdateSuggestions ?? []) {
      if (!suggestion.trim()) continue;
      await this.businessLineRepository.createSkillRevision({
        businessLineId: input.businessLineId,
        sourceReviewId: review.id,
        nextContent: suggestion,
        changeReason: input.hypothesisChange ?? input.resultSummary,
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
    if (sourceReview?.requiresDecision) {
      const approvalDecision = decisionForReview(sourceReview.id, await this.decisionService.list());
      if (approvalDecision?.status !== 'approved') {
        throw new Error('Risky business-line skill revision requires an approved Decision before activation.');
      }
    }
    const revision = await this.businessLineRepository.activateSkillRevision(
      input.revisionId,
      input.approvedBy?.trim() || 'local_operator',
    );
    await this.businessLineRepository.createRecord({
      businessLineId: revision.businessLineId,
      type: 'rule',
      source: `skill_revision:${revision.id}`,
      summary: revision.nextContent,
      confidence: 90,
      shouldAffectFutureContext: true,
    });
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
      .filter((revision) => revision.status === 'active');
  }

  private templateLabel(template: BusinessLineCreationTemplate): string {
    return template === 'web_product' ? 'Web Product / Software Product' : 'Custom';
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
    records: Awaited<ReturnType<BusinessLineRepository['listRecords']>>,
  ): string[] {
    return [
      records[0]?.summary ?? null,
      nextActions[0]?.nextStep ? `Next action: ${nextActions[0].nextStep}` : null,
      businessLine.legacyTaskId ? `Adapted from legacy task ${businessLine.legacyTaskId}.` : null,
    ].filter((item): item is string => Boolean(item)).slice(0, 4);
  }

  private suggestionForBusinessLine(
    businessLine: BusinessLine,
    nextActions: TaskListItemRecord[],
    records: Awaited<ReturnType<BusinessLineRepository['listRecords']>>,
    sourceRecordCount: number,
    pendingDecisionCount: number,
  ): BusinessLineTodaySuggestion | null {
    const activeSkillRecord = records.find((record) => record.type === 'rule');
    if (nextActions[0]) {
      const task = nextActions[0];
      return {
        id: `business-line-progress:${businessLine.id}:${task.id}`,
        type: 'progress',
        businessLineId: businessLine.id,
        businessLineTitle: businessLine.title,
        whyNow: task.activeBlocker
          ? `Current blocker: ${task.activeBlocker.title}`
          : task.waitingReason
          ? `Waiting reason: ${task.waitingReason}`
          : activeSkillRecord
          ? `Accepted learning should shape this action: ${activeSkillRecord.summary}`
          : task.nextStep ?? 'This is the current open next action for the business line.',
        nextStep: task.nextStep ?? `Open next action: ${task.title}`,
        sourceRecords: [
          activeSkillRecord?.summary,
          records[0]?.summary,
          sourceRecordCount > 0 ? `${sourceRecordCount} source records on the legacy task` : null,
        ].filter((item): item is string => Boolean(item)),
        risk: { level: task.riskLevel, note: task.riskNote },
        requiresDecision: pendingDecisionCount > 0,
        taskId: task.id,
      };
    }
    if (activeSkillRecord) {
      return {
        id: `business-line-improvement:${businessLine.id}:${activeSkillRecord.id}`,
        type: 'improvement',
        businessLineId: businessLine.id,
        businessLineTitle: businessLine.title,
        whyNow: 'Accepted learning is available, but no executable next action is attached yet.',
        nextStep: 'Create or choose the next business-line action using the accepted learning.',
        sourceRecords: [activeSkillRecord.summary],
        risk: { level: 'low', note: null },
        requiresDecision: false,
        taskId: businessLine.legacyTaskId,
      };
    }
    return {
      id: `business-line-record-gap:${businessLine.id}`,
      type: 'record_gap',
      businessLineId: businessLine.id,
      businessLineTitle: businessLine.title,
      whyNow: 'This business line lacks enough recent records to make a trustworthy next recommendation.',
      nextStep: 'Capture a short record or define the next action before execution.',
      sourceRecords: records.map((record) => record.summary).slice(0, 2),
      risk: { level: 'low', note: null },
      requiresDecision: false,
      taskId: businessLine.legacyTaskId,
    };
  }
}

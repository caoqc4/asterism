import cron, { type ScheduledTask } from 'node-cron';

import type { SchedulerStatus } from '../../shared/types/scheduler.js';
import { AppConfigService } from '../config/app-config-service.js';
import { BriefSnapshotRepository } from '../db/repositories/brief-snapshot-repository.js';
import { BriefProcessTemplateSelector } from '../domain/brief/process-template-selector.js';
import { RunRepository } from '../db/repositories/run-repository.js';
import { HomeBriefService } from '../domain/brief/home-brief-service.js';
import { BriefExecutor, buildFallbackBrief } from '../executors/brief-executor.js';
import { AiConfigService } from '../keychain/ai-config-service.js';

function olderThanMinutes(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export class SchedulerService {
  private jobs: ScheduledTask[] = [];
  private started = false;
  private lastBriefAt: string | null = null;
  private lastRunSweepAt: string | null = null;

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly homeBriefService: HomeBriefService,
    private readonly briefSnapshotRepository: BriefSnapshotRepository,
    private readonly runRepository: RunRepository,
    private readonly aiConfigService: AiConfigService,
    private readonly briefExecutor: BriefExecutor,
    private readonly briefProcessTemplateSelector: BriefProcessTemplateSelector = new BriefProcessTemplateSelector(),
  ) {}

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    const config = this.appConfigService.read();

    if (!config.featureFlags.enableScheduler) {
      this.started = false;
      return;
    }

    this.started = true;

    await this.runStartupRecovery();
    await this.generateScheduledBrief('startup');

    this.jobs.push(
      cron.schedule('0 * * * *', () => {
        void this.generateScheduledBrief('hourly');
      }),
    );

    this.jobs.push(
      cron.schedule('*/5 * * * *', () => {
        void this.reconcileStaleRuns();
      }),
    );
  }

  stop(): void {
    for (const job of this.jobs) {
      job.stop();
      job.destroy();
    }

    this.jobs = [];
    this.started = false;
  }

  getStatus(): SchedulerStatus {
    const config = this.appConfigService.read();

    return {
      enabled: config.featureFlags.enableScheduler,
      running: this.started,
      lastBriefAt: this.lastBriefAt,
      lastRunSweepAt: this.lastRunSweepAt,
    };
  }

  private async runStartupRecovery(): Promise<void> {
    await this.reconcileStaleRuns();
  }

  private async generateScheduledBrief(kind: string): Promise<void> {
    const homeData = await this.homeBriefService.getHomeData();
    let selectedTemplates = [] as NonNullable<typeof homeData.processTemplateCandidates>;
    let payload = buildFallbackBrief(homeData, kind, selectedTemplates);
    let source: 'ai' | 'fallback' = 'fallback';
    let fallbackReason: string | null = 'AI brief executor not attempted.';

    try {
      const getStatus = (this.aiConfigService as { getStatus?: AiConfigService['getStatus'] }).getStatus;
      const status = typeof getStatus === 'function' ? await getStatus.call(this.aiConfigService) : null;
      if (status?.runtimeMode && status.runtimeMode !== 'api') {
        const selectedRuntimeLabel = status.runtimeMode === 'codex' ? 'Codex CLI' : 'Claude Code';
        throw new Error(`当前选择的是 ${selectedRuntimeLabel}，Scheduled Brief API adapter 不会切换到 Agent API Runtime。`);
      }
      const runtimeConfig = await this.aiConfigService.resolveRuntimeConfig();
      if ((homeData.processTemplateCandidates?.length ?? 0) > 0) {
        try {
          const selection = await this.briefProcessTemplateSelector.select(
            homeData,
            kind,
            runtimeConfig,
          );

          if (selection.shouldUse) {
            selectedTemplates = selection.selectedTemplates;
          }
        } catch {
          selectedTemplates = [];
        }
      }

      payload = await this.briefExecutor.execute(homeData, kind, runtimeConfig, {
        selectedTemplates,
      });
      source = 'ai';
      fallbackReason = null;
    } catch (error) {
      payload = buildFallbackBrief(homeData, kind, selectedTemplates);
      source = 'fallback';
      fallbackReason = error instanceof Error ? error.message : 'Unknown brief executor error';
    }

    await this.briefSnapshotRepository.create(kind, payload, source, fallbackReason);

    this.lastBriefAt = new Date().toISOString();
  }

  private async reconcileStaleRuns(): Promise<void> {
    const staleRuns = await this.runRepository.listIncompleteOlderThan(olderThanMinutes(5));

    for (const run of staleRuns) {
      await this.runRepository.updateResult(
        run.id,
        'failed',
        run.output ?? 'Run 超过恢复窗口，已由本地 scheduler 标记为 failed。',
        'system',
        'Run exceeded the scheduler recovery window.',
      );
    }

    this.lastRunSweepAt = new Date().toISOString();
  }
}

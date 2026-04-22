import cron, { type ScheduledTask } from 'node-cron';

import type { SchedulerStatus } from '../../shared/types/scheduler.js';
import { AppConfigService } from '../config/app-config-service.js';
import { BriefSnapshotRepository } from '../db/repositories/brief-snapshot-repository.js';
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
    let payload = buildFallbackBrief(homeData, kind);
    let source: 'ai' | 'fallback' = 'fallback';
    let fallbackReason: string | null = 'AI brief executor not attempted.';

    try {
      const runtimeConfig = await this.aiConfigService.resolveRuntimeConfig();
      payload = await this.briefExecutor.execute(homeData, kind, runtimeConfig);
      source = 'ai';
      fallbackReason = null;
    } catch (error) {
      payload = buildFallbackBrief(homeData, kind);
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

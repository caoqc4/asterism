import type { AgentCliRuntimeId } from '../../../shared/agent-cli-runtime-status.js';

export type AgentCliRuntimeWorkloadLease = {
  finish(): void;
};

export type AgentCliRuntimeCancel = (reason: string) => void;

export class AgentCliRuntimeWorkloadTracker {
  private readonly activeRuns = new Map<AgentCliRuntimeId, Map<string, { cancel: AgentCliRuntimeCancel | null }>>();

  start(
    runtimeId: AgentCliRuntimeId,
    runId: string,
    cancel: AgentCliRuntimeCancel | null = null,
  ): AgentCliRuntimeWorkloadLease {
    const runs = this.activeRuns.get(runtimeId) ?? new Map<string, { cancel: AgentCliRuntimeCancel | null }>();
    runs.set(runId, { cancel });
    this.activeRuns.set(runtimeId, runs);

    let finished = false;
    return {
      finish: () => {
        if (finished) return;
        finished = true;
        this.finish(runtimeId, runId);
      },
    };
  }

  getActiveRunCount(runtimeId: AgentCliRuntimeId): number {
    return this.activeRuns.get(runtimeId)?.size ?? 0;
  }

  cancelRun(runId: string, reason: string): boolean {
    for (const runs of this.activeRuns.values()) {
      const activeRun = runs.get(runId);
      if (activeRun) {
        activeRun.cancel?.(reason);
        return true;
      }
    }
    return false;
  }

  resetForTests(): void {
    this.activeRuns.clear();
  }

  private finish(runtimeId: AgentCliRuntimeId, runId: string): void {
    const runs = this.activeRuns.get(runtimeId);
    if (!runs) return;
    runs.delete(runId);
    if (runs.size === 0) {
      this.activeRuns.delete(runtimeId);
    }
  }
}

export const agentCliRuntimeWorkloadTracker = new AgentCliRuntimeWorkloadTracker();

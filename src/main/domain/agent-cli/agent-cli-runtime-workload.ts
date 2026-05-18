import type { AgentCliRuntimeId } from '../../../shared/agent-cli-runtime-status.js';

export type AgentCliRuntimeWorkloadLease = {
  finish(): void;
};

export class AgentCliRuntimeWorkloadTracker {
  private readonly activeRuns = new Map<AgentCliRuntimeId, Set<string>>();

  start(runtimeId: AgentCliRuntimeId, runId: string): AgentCliRuntimeWorkloadLease {
    const runs = this.activeRuns.get(runtimeId) ?? new Set<string>();
    runs.add(runId);
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

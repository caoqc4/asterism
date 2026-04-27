import type {
  AgentRunMode,
  AgentRuntimeCapabilities,
  AgentSessionRecord,
} from '../../../shared/types/agent-execution.js';
import { AgentSessionRepository } from '../../db/repositories/agent-session-repository.js';

export type CreateAgentSessionStoreInput = {
  runId: string;
  mode: AgentRunMode;
  capabilities: AgentRuntimeCapabilities;
  metadata?: string | null;
};

export type AgentSessionStatus = AgentSessionRecord['status'];

export class AgentSessionStore {
  constructor(
    private readonly repository: AgentSessionRepository = new AgentSessionRepository(),
  ) {}

  listForRun(runId: string): Promise<AgentSessionRecord[]> {
    return this.repository.listForRun(runId);
  }

  create(input: CreateAgentSessionStoreInput): Promise<AgentSessionRecord> {
    return this.repository.create(input);
  }

  updateStatus(id: string, status: AgentSessionStatus): Promise<AgentSessionRecord> {
    return this.repository.updateStatus(id, status);
  }
}

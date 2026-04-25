import { asc, eq } from 'drizzle-orm';

import type {
  AgentRunMode,
  AgentRuntimeCapabilities,
  AgentSessionRecord,
} from '../../../shared/types/agent-execution.js';
import { initDatabase } from '../client.js';
import { agentSessions } from '../schema.js';
import { generateId, nowIso } from './repository-utils.js';

type AgentSessionStatus = AgentSessionRecord['status'];

type CreateAgentSessionInput = {
  runId: string;
  mode: AgentRunMode;
  capabilities: AgentRuntimeCapabilities;
  metadata?: string | null;
};

function parseCapabilities(raw: string): AgentRuntimeCapabilities {
  return JSON.parse(raw) as AgentRuntimeCapabilities;
}

function toRecord(row: typeof agentSessions.$inferSelect): AgentSessionRecord {
  return {
    id: row.id,
    runId: row.runId,
    mode: row.mode as AgentRunMode,
    status: row.status as AgentSessionStatus,
    capabilities: parseCapabilities(row.capabilities),
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class AgentSessionRepository {
  async listForRun(runId: string): Promise<AgentSessionRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.runId, runId))
      .orderBy(asc(agentSessions.createdAt));

    return rows.map(toRecord);
  }

  async create(input: CreateAgentSessionInput): Promise<AgentSessionRecord> {
    const db = initDatabase();
    const id = generateId('agent_session');
    const timestamp = nowIso();

    await db.insert(agentSessions).values({
      id,
      runId: input.runId,
      mode: input.mode,
      status: 'running',
      capabilities: JSON.stringify(input.capabilities),
      metadata: input.metadata?.trim() || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const [created] = await db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.id, id))
      .limit(1);

    return toRecord(created);
  }
}

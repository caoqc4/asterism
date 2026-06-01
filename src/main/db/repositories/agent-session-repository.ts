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
  const parsed = JSON.parse(raw) as Partial<AgentRuntimeCapabilities>;

  return {
    structuredToolCalls: Boolean(parsed.structuredToolCalls),
    textOnlyPlanning: Boolean(parsed.textOnlyPlanning),
    streaming: Boolean(parsed.streaming),
    fileContext: Boolean(parsed.fileContext),
    taskMutationTools: Boolean(parsed.taskMutationTools),
    longRunningSessions: Boolean(parsed.longRunningSessions),
  };
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

  async updateStatus(id: string, status: AgentSessionStatus): Promise<AgentSessionRecord> {
    const db = initDatabase();
    const timestamp = nowIso();

    await db
      .update(agentSessions)
      .set({
        status,
        updatedAt: timestamp,
      })
      .where(eq(agentSessions.id, id));

    const [updated] = await db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.id, id))
      .limit(1);

    if (!updated) {
      throw new Error(`Agent session not found: ${id}`);
    }

    return toRecord(updated);
  }
}

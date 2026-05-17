import {
  buildExternalAccessStatus,
  emptyExternalAccessStatus,
  type ExternalAccessConnectorRecord,
  type ExternalAccessStatus,
} from '../../../shared/external-access-status.js';
import {
  planConnectorSourceIngestion,
  type ConnectorSourceIngestionInput,
  type ConnectorSourceIngestionPlan,
} from '../../../shared/connector-source-ingestion.js';
import { readEnvValue } from '../../config/env.js';

export type ExternalAccessStatusReader = () => ExternalAccessStatus | Promise<ExternalAccessStatus>;

export type ExternalAccessConnectorEvidence = Omit<ConnectorSourceIngestionInput, 'connectorId' | 'connectorName' | 'taskId'>;

export type ExternalAccessConnectorAdapter = {
  getStatus(): ExternalAccessConnectorRecord | Promise<ExternalAccessConnectorRecord>;
  listEvidence?(input: { taskId: string }): ExternalAccessConnectorEvidence[] | Promise<ExternalAccessConnectorEvidence[]>;
};

export const EXTERNAL_ACCESS_FIXTURE_ENV = 'TASKPLANE_EXTERNAL_ACCESS_FIXTURE_JSON';

const CONNECTOR_KINDS = new Set<ExternalAccessConnectorRecord['kind']>([
  'email',
  'calendar',
  'github',
  'notion',
  'slack',
  'linear',
  'jira',
  'other',
]);

const CONNECTOR_STATUSES = new Set<ExternalAccessConnectorRecord['status']>([
  'connected',
  'pending',
  'error',
]);

type ExternalAccessFixturePayload = {
  sources?: unknown;
  updatedAt?: unknown;
};

export function readExternalAccessFixtureStatus(raw = readEnvValue(EXTERNAL_ACCESS_FIXTURE_ENV)): ExternalAccessStatus {
  if (!raw?.trim()) return emptyExternalAccessStatus();

  try {
    const parsed = JSON.parse(raw) as ExternalAccessFixturePayload | unknown[];
    const sourceValues = Array.isArray(parsed) ? parsed : parsed.sources;
    if (!Array.isArray(sourceValues)) return invalidFixtureStatus('Fixture payload must contain a sources array.');

    const sources = sourceValues
      .map(normalizeFixtureSource)
      .filter((source): source is ExternalAccessConnectorRecord => Boolean(source));
    const updatedAt = !Array.isArray(parsed) && typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;

    return buildExternalAccessStatus(sources, updatedAt);
  } catch {
    return invalidFixtureStatus(`Invalid ${EXTERNAL_ACCESS_FIXTURE_ENV} JSON.`);
  }
}

export function createExternalAccessStatusService(): ExternalAccessStatusService {
  return new ExternalAccessStatusService(() => readExternalAccessFixtureStatus());
}

export class ExternalAccessStatusService {
  constructor(
    private readonly reader: ExternalAccessStatusReader = emptyExternalAccessStatus,
    private readonly adapters: ExternalAccessConnectorAdapter[] = [],
  ) {}

  async getStatus(): Promise<ExternalAccessStatus> {
    const [status, adapterSources] = await Promise.all([
      this.reader(),
      this.readAdapterStatuses(),
    ]);
    return {
      ...buildExternalAccessStatus([...status.sources, ...adapterSources], status.updatedAt),
    };
  }

  async planSourceIngestion(input: { taskId: string }): Promise<ConnectorSourceIngestionPlan[]> {
    const plans: ConnectorSourceIngestionPlan[] = [];
    for (const adapter of this.adapters) {
      const status = await adapter.getStatus();
      if (status.status !== 'connected' || !adapter.listEvidence) continue;
      const evidenceItems = await adapter.listEvidence(input);
      for (const evidence of evidenceItems) {
        plans.push(planConnectorSourceIngestion({
          ...evidence,
          taskId: input.taskId,
          connectorId: status.id,
          connectorName: status.label,
        }));
      }
    }
    return plans;
  }

  private async readAdapterStatuses(): Promise<ExternalAccessConnectorRecord[]> {
    return Promise.all(this.adapters.map(async (adapter) => ({ ...await adapter.getStatus() })));
  }
}

function invalidFixtureStatus(errorReason: string): ExternalAccessStatus {
  return buildExternalAccessStatus([{
    id: 'external_access_fixture',
    label: 'External Access fixture',
    kind: 'other',
    status: 'error',
    errorReason,
  }]);
}

function normalizeFixtureSource(value: unknown): ExternalAccessConnectorRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  const kind = CONNECTOR_KINDS.has(record.kind as ExternalAccessConnectorRecord['kind'])
    ? record.kind as ExternalAccessConnectorRecord['kind']
    : 'other';
  const status = CONNECTOR_STATUSES.has(record.status as ExternalAccessConnectorRecord['status'])
    ? record.status as ExternalAccessConnectorRecord['status']
    : null;

  if (!id || !label || !status) return null;

  return {
    id,
    label,
    kind,
    accountLabel: typeof record.accountLabel === 'string' ? record.accountLabel : null,
    status,
    lastSyncAt: typeof record.lastSyncAt === 'string' ? record.lastSyncAt : null,
    errorReason: typeof record.errorReason === 'string' ? record.errorReason : null,
  };
}

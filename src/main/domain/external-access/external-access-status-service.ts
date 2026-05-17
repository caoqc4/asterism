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

export type ExternalAccessStatusReader = () => ExternalAccessStatus | Promise<ExternalAccessStatus>;

export type ExternalAccessConnectorEvidence = Omit<ConnectorSourceIngestionInput, 'connectorId' | 'connectorName' | 'taskId'>;

export type ExternalAccessConnectorAdapter = {
  getStatus(): ExternalAccessConnectorRecord | Promise<ExternalAccessConnectorRecord>;
  listEvidence?(input: { taskId: string }): ExternalAccessConnectorEvidence[] | Promise<ExternalAccessConnectorEvidence[]>;
};

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

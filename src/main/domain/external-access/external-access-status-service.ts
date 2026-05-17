import {
  emptyExternalAccessStatus,
  type ExternalAccessStatus,
} from '../../../shared/external-access-status.js';

export type ExternalAccessStatusReader = () => ExternalAccessStatus | Promise<ExternalAccessStatus>;

export class ExternalAccessStatusService {
  constructor(private readonly reader: ExternalAccessStatusReader = emptyExternalAccessStatus) {}

  async getStatus(): Promise<ExternalAccessStatus> {
    const status = await this.reader();
    return {
      ...status,
      sources: status.sources.map((source) => ({ ...source })),
    };
  }
}

import type { CapabilityProductSurfaceStatus } from './capability-registry.js';
import { DEFAULT_EXTERNAL_ACCESS_SOURCE_CATALOGUE_ITEMS } from './capability-product-surfaces.js';

export type ExternalAccessConnectorStatus = 'connected' | 'pending' | 'error';

export type ExternalAccessConnectorRecord = {
  id: string;
  label: string;
  kind: 'email' | 'calendar' | 'github' | 'notion' | 'slack' | 'linear' | 'jira' | 'other';
  accountLabel?: string | null;
  status: ExternalAccessConnectorStatus;
  lastSyncAt?: string | null;
  errorReason?: string | null;
};

export type ExternalAccessStatus = {
  sources: ExternalAccessConnectorRecord[];
  connectedCount: number;
  pendingCount: number;
  errorCount: number;
  updatedAt: string | null;
};

export function emptyExternalAccessStatus(): ExternalAccessStatus {
  return {
    sources: [],
    connectedCount: 0,
    pendingCount: 0,
    errorCount: 0,
    updatedAt: null,
  };
}

export function buildExternalAccessStatus(
  sources: ExternalAccessConnectorRecord[],
  updatedAt: string | null = null,
): ExternalAccessStatus {
  return {
    sources: sources.map((source) => ({ ...source })),
    connectedCount: sources.filter((source) => source.status === 'connected').length,
    pendingCount: sources.filter((source) => source.status === 'pending').length,
    errorCount: sources.filter((source) => source.status === 'error').length,
    updatedAt,
  };
}

export function externalAccessStatusForCapability(
  status: ExternalAccessStatus,
): NonNullable<CapabilityProductSurfaceStatus['externalAccess']> {
  return {
    connectedCount: status.connectedCount,
    pendingCount: status.pendingCount,
    errorCount: status.errorCount,
    catalogueCount: DEFAULT_EXTERNAL_ACCESS_SOURCE_CATALOGUE_ITEMS.length,
  };
}

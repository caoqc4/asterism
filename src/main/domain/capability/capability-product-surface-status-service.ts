import {
  defaultMcpProductSurfaceStatus,
  defaultSkillsProductSurfaceStatus,
  mcpStatusForCapability,
  skillsStatusForCapability,
  type McpServiceServer,
  type McpServiceServerStatus,
  type SkillServiceItem,
  type SkillServiceItemStatus,
} from '../../../shared/capability-product-surfaces.js';
import type { CapabilityProductSurfaceStatus } from '../../../shared/capability-registry.js';
import { readEnvValue } from '../../config/env.js';

export const CAPABILITY_PRODUCT_SURFACE_FIXTURE_ENV = 'TASKPLANE_CAPABILITY_PRODUCT_SURFACE_FIXTURE_JSON';

export type CapabilityProductSurfaceStatusProvider = {
  getSkillsStatus(): NonNullable<CapabilityProductSurfaceStatus['skills']> | Promise<NonNullable<CapabilityProductSurfaceStatus['skills']>>;
  getMcpStatus(): NonNullable<CapabilityProductSurfaceStatus['mcp']> | Promise<NonNullable<CapabilityProductSurfaceStatus['mcp']>>;
};

type CapabilityProductSurfaceFixturePayload = {
  skills?: unknown;
  mcpServers?: unknown;
};

const SKILL_STATUSES = new Set<SkillServiceItemStatus>(['disabled', 'enabled', 'ready', 'error']);
const MCP_SERVER_STATUSES = new Set<McpServiceServerStatus>(['disconnected', 'connected', 'error']);

export class CapabilityProductSurfaceStatusService implements CapabilityProductSurfaceStatusProvider {
  constructor(
    private readonly reader: () => CapabilityProductSurfaceFixturePayload | null | Promise<CapabilityProductSurfaceFixturePayload | null> = readCapabilityProductSurfaceFixture,
  ) {}

  async getSkillsStatus(): Promise<NonNullable<CapabilityProductSurfaceStatus['skills']>> {
    const fixture = await this.reader();
    if (!fixture) return defaultSkillsProductSurfaceStatus();
    if (fixture.skills === undefined) return defaultSkillsProductSurfaceStatus();
    if (!Array.isArray(fixture.skills)) {
      return skillsStatusForCapability([{
        id: 'skills_fixture',
        modelVisible: false,
        status: 'error',
      }]);
    }
    return skillsStatusForCapability(fixture.skills.map(normalizeSkillFixtureItem));
  }

  async getMcpStatus(): Promise<NonNullable<CapabilityProductSurfaceStatus['mcp']>> {
    const fixture = await this.reader();
    if (!fixture) return defaultMcpProductSurfaceStatus();
    if (fixture.mcpServers === undefined) return defaultMcpProductSurfaceStatus();
    if (!Array.isArray(fixture.mcpServers)) {
      return mcpStatusForCapability([{
        id: 'mcp_fixture',
        modelVisibleToolCount: 0,
        status: 'error',
        toolCount: 0,
      }]);
    }
    return mcpStatusForCapability(fixture.mcpServers.map(normalizeMcpFixtureServer));
  }
}

export function createCapabilityProductSurfaceStatusService(): CapabilityProductSurfaceStatusService {
  return new CapabilityProductSurfaceStatusService();
}

export function readCapabilityProductSurfaceFixture(
  raw = readEnvValue(CAPABILITY_PRODUCT_SURFACE_FIXTURE_ENV),
): CapabilityProductSurfaceFixturePayload | null {
  if (!raw?.trim()) return null;

  try {
    const parsed = JSON.parse(raw) as CapabilityProductSurfaceFixturePayload;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        mcpServers: 'invalid',
        skills: 'invalid',
      };
    }
    return parsed;
  } catch {
    return {
      mcpServers: 'invalid',
      skills: 'invalid',
    };
  }
}

function normalizeSkillFixtureItem(value: unknown): SkillServiceItem {
  if (!value || typeof value !== 'object') {
    return {
      id: 'invalid_skill',
      modelVisible: false,
      status: 'error',
    };
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : 'invalid_skill';
  const status = SKILL_STATUSES.has(record.status as SkillServiceItemStatus)
    ? record.status as SkillServiceItemStatus
    : 'error';

  return {
    id,
    modelVisible: record.modelVisible === true,
    status,
  };
}

function normalizeMcpFixtureServer(value: unknown): McpServiceServer {
  if (!value || typeof value !== 'object') {
    return {
      id: 'invalid_mcp_server',
      modelVisibleToolCount: 0,
      status: 'error',
      toolCount: 0,
    };
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : 'invalid_mcp_server';
  const status = MCP_SERVER_STATUSES.has(record.status as McpServiceServerStatus)
    ? record.status as McpServiceServerStatus
    : 'error';

  return {
    id,
    modelVisibleToolCount: positiveInteger(record.modelVisibleToolCount),
    status,
    toolCount: positiveInteger(record.toolCount),
  };
}

function positiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0;
}

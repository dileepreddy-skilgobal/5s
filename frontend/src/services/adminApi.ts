import axios from 'axios';
import { API_BASE_URL, apiClient, getAuthToken } from './api';
import {
  LeaderboardData,
  MaturityOverview,
  PlatformMetrics,
  PlatformTenantRow,
  ReportRegister,
  SubscriptionSummary,
  Tenant,
} from '../types';

/**
 * API methods (and response fields) added for the administration, analytics, reports and subscription
 * screens that are not in services/api.ts yet.
 */

/** Unwraps the `{ success, data }` envelope some endpoints use. */
const unwrap = <T,>(body: unknown): T => {
  const b = body as { success?: unknown; data?: unknown } | null;
  return (b && b.success !== undefined && b.data !== undefined ? b.data : body) as T;
};

export interface PlatformTenantMetricsRow extends PlatformTenantRow {
  /** Currency of the tenant's plan price (null without a plan). */
  currency: string | null;
}

/** GET /platform/metrics, including the per-currency MRR split and the total storage allowance. */
export interface PlatformMetricsDetail extends Omit<PlatformMetrics, 'tenants' | 'totals'> {
  totals: PlatformMetrics['totals'] & {
    /** List-price MRR of ACTIVE, not lapsed organizations, per plan currency. */
    mrrByCurrency: Record<string, number>;
    storageQuotaMb: number;
  };
  tenants: PlatformTenantMetricsRow[];
}

export interface MaturityOverviewDetail extends MaturityOverview {
  kpis: MaturityOverview['kpis'] & {
    auditedLocations: number;
    scheduledAuditsDue: number;
    scheduledAuditsCompleted: number;
  };
}

export interface LeaderboardDetail extends LeaderboardData {
  passScore: number;
  targetScore: number;
}

export interface ReportRegisterDetail extends ReportRegister {
  /** False when file export (REPORTS_EXPORT) is not in the organization's plan; previews always work. */
  exportAllowed?: boolean;
}

export interface SubscriptionSummaryDetail extends SubscriptionSummary {
  /** True when an active plan above the current one exists in the catalogue. */
  upgradeAvailable?: boolean;
}

/**
 * Requests that must run in a specific organization regardless of the tenant the operator has switched
 * to (the shared client always sends the active tenant). Used by the platform console.
 */
const forTenant = (tenantId: string) => {
  const token = getAuthToken();
  return axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
};

export const adminApi = {
  getPlatformMetrics: async (): Promise<PlatformMetricsDetail> => {
    const res = await apiClient.get('/platform/metrics');
    return unwrap<PlatformMetricsDetail>(res.data);
  },

  /** Org admins: set (image data URL) or remove (null) the organization logo. */
  setOrganizationLogo: async (logo: string | null): Promise<{ logoUrl: string | null }> => {
    const res = await apiClient.put('/settings/logo', { logo });
    return unwrap<{ logoUrl: string | null }>(res.data);
  },

  /** Platform console: set or remove another organization's logo (stored in that organization's files). */
  setTenantLogo: async (tenantId: string, logo: string | null): Promise<{ logoUrl: string | null }> => {
    const res = await forTenant(tenantId).put('/settings/logo', { logo });
    return unwrap<{ logoUrl: string | null }>(res.data);
  },

  /** Profile fields only; the logo goes through setTenantLogo and plan / status through the subscription editor. */
  updateTenantProfile: async (tenantId: string, data: { name?: string; industry?: string; storageQuotaMb?: number }): Promise<Tenant> => {
    const res = await apiClient.patch(`/tenants/${tenantId}`, data);
    return unwrap<Tenant>(res.data);
  },

  /** SUSPENDED suspends; ACTIVE reactivates a suspended organization to the status it had before. */
  setTenantSuspended: async (tenantId: string, suspended: boolean): Promise<Tenant> => {
    const res = await apiClient.patch(`/tenants/${tenantId}/status`, { status: suspended ? 'SUSPENDED' : 'ACTIVE' });
    return unwrap<Tenant>(res.data);
  },

  getMaturityOverview: async (timeframe: string, orgNodeId?: string): Promise<MaturityOverviewDetail> => {
    const res = await apiClient.get('/analytics/maturity', { params: { timeframe, ...(orgNodeId ? { orgNodeId } : {}) } });
    return unwrap<MaturityOverviewDetail>(res.data);
  },

  getLeaderboard: async (orgNodeId?: string): Promise<LeaderboardDetail> => {
    const res = await apiClient.get('/analytics/leaderboard', { params: orgNodeId ? { orgNodeId } : {} });
    return unwrap<LeaderboardDetail>(res.data);
  },

  getReportRegisters: async (): Promise<ReportRegisterDetail[]> => {
    const res = await apiClient.get('/reports');
    return unwrap<ReportRegisterDetail[]>(res.data);
  },

  getSubscription: async (): Promise<SubscriptionSummaryDetail> => {
    const res = await apiClient.get('/subscription');
    return unwrap<SubscriptionSummaryDetail>(res.data);
  },
};

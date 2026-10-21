import { apiClient, AnalyticsTrendPoint } from './api';
import {
  AnalyticsKpis,
  BenchmarkRow,
  CertificationData,
  DrilldownData,
  LocationAuditDrilldown,
  ReportExportFormat,
} from '../types';
import type { LeaderboardDetail, MaturityOverviewDetail } from './adminApi';
import {
  AnalyticsScope,
  AreaMaturityData,
  ExecutiveSummary,
  HeatmapDetail,
  InsightsQuery,
  InsightsReportFilterValues,
  InsightsReportPreview,
  InsightsReportRegister,
  PeriodQuery,
} from '../types/insights';

/**
 * Analytics and report API methods that take a period (preset or custom from/to) and an org unit,
 * plus the management registers. Responses are unwrapped by the shared client interceptor.
 */

/** Drops empty values so they are not sent as empty query parameters. */
const clean = (params: object): Record<string, string> => {
  const out: Record<string, string> = {};
  Object.entries(params).forEach(([k, v]) => {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    else if (v === true) out[k] = 'true';
  });
  return out;
};

/** A custom range replaces the preset timeframe. */
const periodParams = (q: InsightsQuery): Record<string, string> =>
  clean(q.from || q.to ? { from: q.from, to: q.to, orgNodeId: q.orgNodeId } : { timeframe: q.timeframe, orgNodeId: q.orgNodeId });

const filenameFromDisposition = (header: unknown): string | null => {
  if (typeof header !== 'string' || !header) return null;
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain && plain[1] ? plain[1].trim() : null;
};

export const insightsApi = {
  getScope: async (): Promise<AnalyticsScope> => (await apiClient.get('/analytics/scope')).data,

  getMaturityOverview: async (q: InsightsQuery): Promise<MaturityOverviewDetail> =>
    (await apiClient.get('/analytics/maturity', { params: periodParams(q) })).data,

  getExecutiveSummary: async (q: InsightsQuery): Promise<ExecutiveSummary> =>
    (await apiClient.get('/analytics/summary', { params: periodParams(q) })).data,

  getAreaMaturity: async (q: InsightsQuery): Promise<AreaMaturityData> =>
    (await apiClient.get('/analytics/area-maturity', { params: periodParams(q) })).data,

  getHeatmap: async (orgNodeId?: string): Promise<HeatmapDetail> =>
    (await apiClient.get('/analytics/heatmap', { params: clean({ orgNodeId }) })).data,

  getLeaderboard: async (orgNodeId?: string): Promise<LeaderboardDetail> =>
    (await apiClient.get('/analytics/leaderboard', { params: clean({ orgNodeId }) })).data,

  getKpis: async (q: InsightsQuery): Promise<AnalyticsKpis> => (await apiClient.get('/analytics/kpis', { params: periodParams(q) })).data,

  getTrend: async (q: InsightsQuery): Promise<AnalyticsTrendPoint[]> => (await apiClient.get('/analytics/trend', { params: periodParams(q) })).data,

  getDrilldown: async (orgNodeId?: string): Promise<DrilldownData> =>
    (await apiClient.get('/analytics/drilldown', { params: clean({ orgNodeId }) })).data,

  getLocationAudits: async (locationId: string, q: PeriodQuery): Promise<LocationAuditDrilldown> =>
    (await apiClient.get(`/analytics/drilldown/locations/${encodeURIComponent(locationId)}`, { params: periodParams(q) })).data,

  getBenchmark: async (level: 'PLANT' | 'DEPARTMENT' | 'AREA', q: InsightsQuery): Promise<BenchmarkRow[]> =>
    (await apiClient.get('/analytics/benchmark', { params: { level, ...periodParams(q) } })).data,

  getCertification: async (orgNodeId?: string): Promise<CertificationData> =>
    (await apiClient.get('/analytics/certification', { params: clean({ orgNodeId }) })).data,

  // --- Reports (operational and management registers) ---

  getReportRegisters: async (): Promise<InsightsReportRegister[]> => (await apiClient.get('/reports')).data,

  /** On-screen preview: first 200 rows, the total match count and, for some registers, headline figures. */
  getReportPreview: async (key: string, filters: InsightsReportFilterValues = {}): Promise<InsightsReportPreview> =>
    (await apiClient.get(`/reports/${encodeURIComponent(key)}`, { params: { ...clean(filters), format: 'json' } })).data,

  /** Downloads an export file; errors carry a Blob body (use getBlobApiErrorMessage). */
  downloadReport: async (key: string, format: ReportExportFormat, filters: InsightsReportFilterValues = {}): Promise<{ blob: Blob; filename: string }> => {
    const res = await apiClient.get(`/reports/${encodeURIComponent(key)}`, { params: { ...clean(filters), format }, responseType: 'blob' });
    const filename = filenameFromDisposition(res.headers?.['content-disposition']) || `${key}-${new Date().toISOString().slice(0, 10)}.${format}`;
    return { blob: res.data as Blob, filename };
  },
};

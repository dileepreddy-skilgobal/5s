import type {
  AnalyticsPeriod,
  HeatmapData,
  HeatmapRow,
  PillarKey,
  ReportFilterKey,
  ReportFilterValues,
  ReportPreview,
  ReportRegister,
} from './index';

/**
 * Types for the analytics (executive summary, area maturity, data scope) and management report endpoints
 * that are not in types/index.ts.
 */

/** A preset timeframe (30D, 3M, 6M, 12M, YTD) or a custom from/to (YYYY-MM-DD, inclusive). */
export interface PeriodQuery {
  timeframe?: string;
  from?: string;
  to?: string;
}

/** Period plus the org unit (plant / department) the figures are limited to. */
export interface InsightsQuery extends PeriodQuery {
  orgNodeId?: string;
}

/** GET /analytics/scope: the org units a plant / department head is limited to. */
export interface AnalyticsScope {
  restricted: boolean;
  nodes: Array<{ id: string; name: string; nodeType: string }>;
}

export interface MaturityBadge {
  level: number;
  name: string;
  description: string;
  color: string;
}

export interface SummaryArea {
  locationId: string;
  areaCode: string;
  name: string;
  department: string;
  averageScore: number | null;
  auditsInPeriod: number;
}

/** GET /analytics/summary */
export interface ExecutiveSummary {
  period: AnalyticsPeriod;
  overallScore: number | null;
  previousPeriodScore: number | null;
  scoreChange: number | null;
  targetScore: number;
  maturity: MaturityBadge | null;
  actions: { open: number; overdue: number };
  audits: { completed: number; planned: number; plannedCompleted: number; adherencePercent: number | null };
  observations: { openCritical: number };
  redTags: { pending: number };
  areas: { total: number; audited: number };
  topAreas: SummaryArea[];
  bottomAreas: SummaryArea[];
}

export interface AreaMaturityRow {
  locationId: string;
  areaCode: string;
  name: string;
  department: string;
  plant: string;
  orgNodeId: string;
  auditsInPeriod: number;
  averageScore: number | null;
  latestScore: number | null;
  lastAuditDate: string | null;
  weakestPillar: PillarKey | null;
  maturity: MaturityBadge | null;
}

/** GET /analytics/area-maturity */
export interface AreaMaturityData {
  period: AnalyticsPeriod;
  levels: Array<{ level: number; name: string; color: string; minScore: number; count: number }>;
  notAssessed: number;
  locations: AreaMaturityRow[];
}

/** Heat-map row with the id of the plant the area belongs to (null when it is not under a plant). */
export interface HeatmapRowDetail extends HeatmapRow {
  plantId: string | null;
}

export interface HeatmapDetail extends Omit<HeatmapData, 'rows'> {
  rows: HeatmapRowDetail[];
}

// --- Reports ---

export type InsightsReportFilterKey = ReportFilterKey | 'repeatOnly' | 'auditorId' | 'source' | 'actionType';

/** Report filters including the management-register filters. */
export interface InsightsReportFilterValues extends ReportFilterValues {
  repeatOnly?: boolean;
  auditorId?: string;
  source?: string;
  actionType?: string;
}

export interface InsightsReportRegister extends Omit<ReportRegister, 'filters'> {
  filters: InsightsReportFilterKey[];
  /** False when file export (REPORTS_EXPORT) is not in the organization's plan; previews always work. */
  exportAllowed?: boolean;
}

/** Headline figure computed over every matching record (e.g. action ageing buckets). */
export interface ReportSummaryItem {
  key: string;
  label: string;
  value: number;
}

export interface InsightsReportPreview extends ReportPreview {
  summary: ReportSummaryItem[] | null;
}

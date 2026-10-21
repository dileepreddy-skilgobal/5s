import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import {
  AnalyticsSettings,
  CertificationRule,
  maturityFor,
  readAnalyticsSettings,
} from '../../core/config/tenant-settings';
import { LocationScope, scopeWhere } from './data-scope.service';

export const DAY_MS = 86400000;
export const PILLAR_KEYS = ['S1_SORT', 'S2_SET_IN_ORDER', 'S3_SHINE', 'S4_STANDARDIZE', 'S5_SUSTAIN', 'S6_SAFETY'] as const;
export type PillarKey = (typeof PILLAR_KEYS)[number];
/** Executions whose results count (submitted for review, disputed or acknowledged). */
const SCORED_STATUSES = ['SUBMITTED', 'DISPUTED', 'ACKNOWLEDGED'];
/** Corrective actions that are finished. */
export const CLOSED_ACTION_STATUSES = ['VERIFIED', 'CLOSED'];
/** Red tags that no longer occupy space / need a decision. */
export const FINISHED_RED_TAG_STATUSES = ['DISPOSED', 'RETURNED', 'CANCELLED'];

export interface Period {
  from: Date;
  to: Date;
  label: string;
}

export interface LocationNode {
  id: string;
  areaCode: string;
  name: string;
  building: string | null;
  riskLevel: string;
  orgNodeId: string;
  ownerId: string | null;
}

/** Maturity band shown with a score (BRD §45). */
export interface MaturitySummary {
  level: number;
  name: string;
  description: string;
  color: string;
}

export interface ScoredExecution {
  id: string;
  locationId: string;
  auditorId: string | null;
  overallScore: number;
  pillarScores: Partial<Record<PillarKey, number>>;
  completedAt: Date;
  auditorName: string;
  auditCode: string;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const avg = (values: number[]): number | null => (values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null);
export const pct = (part: number, whole: number): number | null => (whole > 0 ? round1((part / whole) * 100) : null);

const parsePillars = (raw: string | null): Partial<Record<PillarKey, number>> => {
  try {
    const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Partial<Record<PillarKey, number>> = {};
    PILLAR_KEYS.forEach((k) => {
      const v = Number(obj[k]);
      if (Number.isFinite(v)) out[k] = v;
    });
    return out;
  } catch {
    return {};
  }
};

/**
 * Computes every dashboard metric from transactional data (no estimates or placeholders).
 * A metric with no underlying data is returned as null so the UI can show "no data".
 */
@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Periods & scope
  // ---------------------------------------------------------------------------

  /** Accepts 30D/90D/3M/6M/12M/YTD or an explicit from/to (ISO dates). */
  resolvePeriod(timeframe?: string, from?: string, to?: string): Period {
    if (from || to) {
      const f = from ? new Date(from) : new Date(0);
      const t = to ? new Date(to) : new Date();
      // A bare "to" date means the whole of that day
      if (to && /^\d{4}-\d{2}-\d{2}$/.test(to) && !Number.isNaN(t.getTime())) t.setUTCHours(23, 59, 59, 999);
      if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || f > t) {
        throw new BadRequestException('Invalid custom period: "from" must be a valid date before "to".');
      }
      return { from: f, to: t, label: 'Custom period' };
    }
    const now = new Date();
    const tf = (timeframe || '90D').toUpperCase();
    if (tf === 'YTD') return { from: new Date(now.getFullYear(), 0, 1), to: now, label: 'Year to date' };
    const m = /^(\d{1,3})([DM])$/.exec(tf);
    if (!m) throw new BadRequestException(`Unsupported timeframe "${timeframe}". Use e.g. 30D, 90D, 3M, 6M, 12M, YTD.`);
    const n = Number(m[1]);
    // Month timeframes are calendar months including the current one, so KPIs and the trend share a window
    const fromDate = m[2] === 'D' ? new Date(now.getTime() - n * DAY_MS) : new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
    return { from: fromDate, to: now, label: m[2] === 'D' ? `Last ${n} days` : `Last ${n} months` };
  }

  async settings(tenantId: string): Promise<AnalyticsSettings> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    return readAnalyticsSettings(tenant?.settings);
  }

  /**
   * Active locations, optionally restricted to an org-node sub-tree and to the caller's data scope
   * (plant / department heads; see DataScopeService). Both restrictions apply together.
   */
  async locations(tenantId: string, orgNodeId?: string, scope: LocationScope = null): Promise<LocationNode[]> {
    const and: Prisma.LocationWhereInput[] = [];
    if (orgNodeId) {
      const node = await this.prisma.orgNode.findFirst({ where: { id: orgNodeId, tenantId }, select: { path: true } });
      if (!node) throw new NotFoundException(`Org node '${orgNodeId}' not found`);
      and.push({ orgNode: { path: { startsWith: node.path } } });
    }
    const scoped = scopeWhere(scope);
    if (scoped) and.push(scoped);
    return this.prisma.location.findMany({
      where: { tenantId, status: 'ACTIVE', ...(and.length ? { AND: and } : {}) },
      select: { id: true, areaCode: true, name: true, building: true, riskLevel: true, orgNodeId: true, ownerId: true },
      orderBy: { areaCode: 'asc' },
    });
  }

  async scoredExecutions(tenantId: string, locationIds: string[], from?: Date, to?: Date): Promise<ScoredExecution[]> {
    if (locationIds.length === 0) return [];
    const rows = await this.prisma.auditExecution.findMany({
      where: {
        tenantId,
        locationId: { in: locationIds },
        status: { in: SCORED_STATUSES },
        completedAt: { not: null, ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
      },
      select: {
        id: true,
        locationId: true,
        auditorId: true,
        overallScore: true,
        pillarScores: true,
        completedAt: true,
        auditCode: true,
        auditorName: true,
        auditor: { select: { firstName: true, lastName: true } },
      },
      orderBy: { completedAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      locationId: r.locationId,
      auditorId: r.auditorId,
      overallScore: r.overallScore,
      pillarScores: parsePillars(r.pillarScores),
      completedAt: r.completedAt as Date,
      auditCode: r.auditCode,
      auditorName: r.auditor ? `${r.auditor.firstName} ${r.auditor.lastName}` : r.auditorName ?? '',
    }));
  }

  /** Latest scored execution per location (any time). */
  private latestByLocation(executions: ScoredExecution[]): Map<string, ScoredExecution> {
    const map = new Map<string, ScoredExecution>();
    executions.forEach((e) => map.set(e.locationId, e)); // ascending order → last write wins
    return map;
  }

  // ---------------------------------------------------------------------------
  // KPIs (BRD §47–50, §160)
  // ---------------------------------------------------------------------------

  async kpis(tenantId: string, period: Period, orgNodeId?: string, scope: LocationScope = null) {
    const settings = await this.settings(tenantId);
    const locs = await this.locations(tenantId, orgNodeId, scope);
    const ids = locs.map((l) => l.id);
    const now = new Date();
    const dueUntil = period.to < now ? period.to : now;

    const [executions, previous, instances, observations, actions, redTags] = await Promise.all([
      this.scoredExecutions(tenantId, ids, period.from, period.to),
      this.scoredExecutions(tenantId, ids, new Date(period.from.getTime() - (period.to.getTime() - period.from.getTime())), period.from),
      this.prisma.scheduledAuditInstance.findMany({
        where: { tenantId, locationId: { in: ids }, status: { not: 'CANCELLED' }, dueDate: { gte: period.from, lte: dueUntil } },
        select: { status: true },
      }),
      this.prisma.observation.findMany({
        where: { tenantId, locationId: { in: ids }, createdAt: { gte: period.from, lte: period.to } },
        select: { severity: true, isRepeat: true, status: true, category: true },
      }),
      this.prisma.correctiveAction.findMany({
        where: { tenantId, locationId: { in: ids } },
        select: { status: true, targetDate: true, createdAt: true, verifiedAt: true },
      }),
      this.prisma.redTag.findMany({
        where: { tenantId, locationId: { in: ids } },
        select: { status: true, taggedDate: true, estimatedValue: true },
      }),
    ]);

    const overall = avg(executions.map((e) => e.overallScore));
    const prevOverall = avg(previous.map((e) => e.overallScore));
    const pillars = this.pillarAverages(executions);

    // Audit adherence: scheduled audits due in the period that were completed
    const completedScheduled = instances.filter((i) => i.status === 'SUBMITTED').length;

    // Corrective actions
    const closedInPeriod = actions.filter(
      (a) => CLOSED_ACTION_STATUSES.includes(a.status) && a.verifiedAt && a.verifiedAt >= period.from && a.verifiedAt <= period.to,
    );
    const onTime = closedInPeriod.filter((a) => (a.verifiedAt as Date) <= a.targetDate).length;
    const open = actions.filter((a) => !CLOSED_ACTION_STATUSES.includes(a.status));
    const overdue = open.filter((a) => a.targetDate < now);
    const closureDays = closedInPeriod.map((a) => ((a.verifiedAt as Date).getTime() - a.createdAt.getTime()) / DAY_MS);

    // Red tags
    const pendingTags = redTags.filter((t) => !FINISHED_RED_TAG_STATUSES.includes(t.status));
    const ageing = { days0to7: 0, days8to14: 0, days15to30: 0, over30: 0 };
    pendingTags.forEach((t) => {
      const age = (now.getTime() - t.taggedDate.getTime()) / DAY_MS;
      if (age <= 7) ageing.days0to7++;
      else if (age <= 14) ageing.days8to14++;
      else if (age <= 30) ageing.days15to30++;
      else ageing.over30++;
    });

    const maturity = maturityFor(overall, settings);
    const observationsByCategory: Record<string, number> = {};
    observations.forEach((o) => {
      observationsByCategory[o.category] = (observationsByCategory[o.category] ?? 0) + 1;
    });

    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString(), label: period.label },
      fiveSScore: overall,
      previousPeriodScore: prevOverall,
      scoreChange: overall !== null && prevOverall !== null ? round1(overall - prevOverall) : null,
      targetScore: settings.targetScore,
      pillarScores: pillars,
      maturity: maturity ? { level: maturity.level, name: maturity.name, description: maturity.description, color: maturity.color } : null,
      audits: {
        completed: executions.length,
        scheduledDue: instances.length,
        scheduledCompleted: completedScheduled,
        adherencePercent: pct(completedScheduled, instances.length),
      },
      actions: {
        open: open.length,
        overdue: overdue.length,
        overduePercent: pct(overdue.length, open.length),
        closedInPeriod: closedInPeriod.length,
        onTimeClosurePercent: pct(onTime, closedInPeriod.length),
        averageClosureDays: closureDays.length ? round1(closureDays.reduce((a, b) => a + b, 0) / closureDays.length) : null,
      },
      observations: {
        total: observations.length,
        repeat: observations.filter((o) => o.isRepeat).length,
        repeatPercent: pct(observations.filter((o) => o.isRepeat).length, observations.length),
        critical: observations.filter((o) => o.severity === 'CRITICAL').length,
        openCritical: observations.filter((o) => o.severity === 'CRITICAL' && !['RESOLVED', 'CLOSED'].includes(o.status)).length,
        byCategory: observationsByCategory,
      },
      redTags: {
        pending: pendingTags.length,
        pendingEstimatedValue: round1(pendingTags.reduce((s, t) => s + (t.estimatedValue ?? 0), 0)),
        ageing,
      },
      locations: { total: locs.length, audited: new Set(executions.map((e) => e.locationId)).size },
    };
  }

  private pillarAverages(executions: ScoredExecution[]): Record<PillarKey, number | null> {
    const out = {} as Record<PillarKey, number | null>;
    PILLAR_KEYS.forEach((k) => {
      out[k] = avg(executions.map((e) => e.pillarScores[k]).filter((v): v is number => v !== undefined));
    });
    return out;
  }

  /** Monthly averages for the period (months without audits are null). */
  async trend(tenantId: string, period: Period, orgNodeId?: string, scope: LocationScope = null) {
    const ids = (await this.locations(tenantId, orgNodeId, scope)).map((l) => l.id);
    const executions = await this.scoredExecutions(tenantId, ids, period.from, period.to);
    const months: { key: string; label: string; items: ScoredExecution[] }[] = [];
    const cursor = new Date(period.from.getFullYear(), period.from.getMonth(), 1);
    while (cursor <= period.to) {
      months.push({
        key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
        label: cursor.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
        items: [],
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    executions.forEach((e) => {
      months.find((m) => m.key === `${e.completedAt.getFullYear()}-${e.completedAt.getMonth()}`)?.items.push(e);
    });
    return months.map((m) => ({
      month: m.label,
      audits: m.items.length,
      overall: avg(m.items.map((e) => e.overallScore)),
      ...this.pillarAverages(m.items),
    }));
  }

  // ---------------------------------------------------------------------------
  // Heat map, drill-down, benchmarking (BRD §51, §52, §54)
  // ---------------------------------------------------------------------------

  /** Latest result per active location with department / plant names and open-action counts. */
  async locationHealth(tenantId: string, orgNodeId?: string, scope: LocationScope = null) {
    const locs = await this.locations(tenantId, orgNodeId, scope);
    const ids = locs.map((l) => l.id);
    const [executions, nodes, openActions] = await Promise.all([
      this.scoredExecutions(tenantId, ids),
      this.prisma.orgNode.findMany({ where: { tenantId }, select: { id: true, name: true, code: true, nodeType: true, path: true } }),
      this.prisma.correctiveAction.groupBy({
        by: ['locationId'],
        where: { tenantId, locationId: { in: ids }, status: { notIn: CLOSED_ACTION_STATUSES } },
        _count: { _all: true },
      }),
    ]);
    const latest = this.latestByLocation(executions);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const nodeByCode = new Map(nodes.map((n) => [n.code, n]));
    const openByLocation = new Map(openActions.map((o) => [o.locationId, o._count._all]));

    return locs.map((l) => {
      const node = nodeById.get(l.orgNodeId);
      const ancestors = (node?.path ?? '').split('/').filter(Boolean).map((c) => nodeByCode.get(c)).filter(Boolean);
      const plant = ancestors.find((a) => a?.nodeType === 'PLANT');
      const last = latest.get(l.id);
      return {
        id: l.id,
        areaCode: l.areaCode,
        name: l.name,
        building: l.building ?? '',
        department: node?.name ?? '',
        plant: plant?.name ?? '',
        plantId: plant?.id ?? null,
        orgNodeId: l.orgNodeId,
        overallScore: last ? round1(last.overallScore) : null,
        pillars: Object.fromEntries(PILLAR_KEYS.map((k) => [k, last?.pillarScores[k] !== undefined ? round1(last.pillarScores[k] as number) : null])),
        lastAuditDate: last ? last.completedAt.toISOString() : null,
        lastAuditor: last?.auditorName ?? null,
        lastAuditId: last?.id ?? null,
        openCapaCount: openByLocation.get(l.id) ?? 0,
        riskLevel: l.riskLevel === 'CRITICAL' ? 'HIGH' : l.riskLevel,
        auditHistory: executions.filter((e) => e.locationId === l.id).map((e) => e.overallScore),
      };
    });
  }

  /** One level of the org hierarchy with aggregated scores (enterprise → plant → department → area → audit). */
  async drilldown(tenantId: string, orgNodeId?: string, scope: LocationScope = null) {
    const nodes = await this.prisma.orgNode.findMany({
      where: { tenantId },
      select: { id: true, name: true, code: true, nodeType: true, path: true, parentId: true },
    });
    const current = orgNodeId ? nodes.find((n) => n.id === orgNodeId) : undefined;
    if (orgNodeId && !current) throw new NotFoundException(`Org node '${orgNodeId}' not found`);

    const health = await this.locationHealth(tenantId, orgNodeId, scope);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const children = nodes.filter((n) => (current ? n.parentId === current.id : !n.parentId));

    const aggregate = (path: string) => {
      const inScope = health.filter((h) => (nodeById.get(h.orgNodeId)?.path ?? '').startsWith(path));
      const scored = inScope.filter((h) => h.overallScore !== null);
      return {
        score: avg(scored.map((h) => h.overallScore as number)),
        locationCount: inScope.length,
        auditedCount: scored.length,
        openActions: inScope.reduce((s, h) => s + h.openCapaCount, 0),
      };
    };

    // Walk up the parent chain (the root path segment is an id, not a code)
    const breadcrumb: { id: string; name: string; nodeType: string }[] = [];
    for (let n = current; n; n = n.parentId ? nodeById.get(n.parentId) : undefined) {
      breadcrumb.unshift({ id: n.id, name: n.name, nodeType: n.nodeType });
    }

    return {
      node: current ? { id: current.id, name: current.name, nodeType: current.nodeType, ...aggregate(current.path) } : null,
      breadcrumb,
      children: children
        .map((c) => ({ id: c.id, name: c.name, code: c.code, nodeType: c.nodeType, ...aggregate(c.path) }))
        .filter((c) => c.locationCount > 0),
      locations: health
        .filter((h) => (current ? h.orgNodeId === current.id : false))
        .map((h) => ({ id: h.id, areaCode: h.areaCode, name: h.name, score: h.overallScore, lastAuditDate: h.lastAuditDate, openCapaCount: h.openCapaCount })),
    };
  }

  /** Audits of one area with their findings (drill-down to audit → observation). */
  async locationAudits(tenantId: string, locationId: string, period: Period) {
    const location = await this.prisma.location.findFirst({ where: { id: locationId, tenantId }, select: { id: true, name: true, areaCode: true } });
    if (!location) throw new NotFoundException(`Location '${locationId}' not found`);
    const audits = await this.prisma.auditExecution.findMany({
      where: { tenantId, locationId, status: { in: SCORED_STATUSES }, completedAt: { gte: period.from, lte: period.to } },
      select: {
        id: true,
        auditCode: true,
        status: true,
        overallScore: true,
        completedAt: true,
        auditorName: true,
        observations: { where: { deletedAt: null }, select: { id: true, observationCode: true, title: true, severity: true, status: true, category: true, isRepeat: true } },
      },
      orderBy: { completedAt: 'desc' },
    });
    return { location, audits };
  }

  /** Ranking of plants, departments or areas (BRD §54). */
  async benchmark(tenantId: string, level: 'PLANT' | 'DEPARTMENT' | 'AREA', period: Period, orgNodeId?: string, scope: LocationScope = null) {
    const health = await this.locationHealth(tenantId, orgNodeId, scope);
    const ids = health.map((h) => h.id);
    const [executions, observations] = await Promise.all([
      this.scoredExecutions(tenantId, ids, period.from, period.to),
      this.prisma.observation.findMany({
        where: { tenantId, locationId: { in: ids }, createdAt: { gte: period.from, lte: period.to } },
        select: { locationId: true, isRepeat: true },
      }),
    ]);
    const keyOf = (h: (typeof health)[number]) =>
      level === 'AREA' ? { key: h.id, name: `${h.areaCode} — ${h.name}` } : level === 'PLANT' ? { key: h.plant || '—', name: h.plant || 'Unassigned plant' } : { key: h.orgNodeId, name: h.department };

    const groups = new Map<string, { name: string; locationIds: Set<string>; openActions: number }>();
    health.forEach((h) => {
      const { key, name } = keyOf(h);
      const g = groups.get(key) ?? { name, locationIds: new Set<string>(), openActions: 0 };
      g.locationIds.add(h.id);
      g.openActions += h.openCapaCount;
      groups.set(key, g);
    });

    const rows = Array.from(groups.entries()).map(([key, g]) => {
      const ex = executions.filter((e) => g.locationIds.has(e.locationId));
      const obs = observations.filter((o) => g.locationIds.has(o.locationId));
      return {
        key,
        name: g.name,
        score: avg(ex.map((e) => e.overallScore)),
        audits: ex.length,
        locations: g.locationIds.size,
        openActions: g.openActions,
        observations: obs.length,
        repeatPercent: pct(obs.filter((o) => o.isRepeat).length, obs.length),
      };
    });
    return rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((r, i) => ({ rank: r.score === null ? null : i + 1, ...r }));
  }

  // ---------------------------------------------------------------------------
  // Certification (BRD §46)
  // ---------------------------------------------------------------------------

  async certification(tenantId: string, orgNodeId?: string, scope: LocationScope = null) {
    const settings = await this.settings(tenantId);
    const now = new Date();
    const from = new Date(now);
    from.setMonth(now.getMonth() - settings.certificationWindowMonths);
    const health = await this.locationHealth(tenantId, orgNodeId, scope);
    const ids = health.map((h) => h.id);

    const [executions, observations, actions, instances] = await Promise.all([
      this.scoredExecutions(tenantId, ids, from, now),
      this.prisma.observation.findMany({ where: { tenantId, locationId: { in: ids }, createdAt: { gte: from } }, select: { locationId: true, isRepeat: true } }),
      this.prisma.correctiveAction.findMany({
        where: { tenantId, locationId: { in: ids }, status: { in: CLOSED_ACTION_STATUSES }, verifiedAt: { gte: from } },
        select: { locationId: true, verifiedAt: true, targetDate: true },
      }),
      this.prisma.scheduledAuditInstance.findMany({
        where: { tenantId, locationId: { in: ids }, status: { not: 'CANCELLED' }, dueDate: { gte: from, lte: now } },
        select: { locationId: true, status: true },
      }),
    ]);

    const evaluate = (rule: CertificationRule, m: { avg: number | null; recent: number[]; repeat: number | null; onTime: number | null; adherence: number | null }) =>
      m.avg !== null &&
      m.avg >= rule.minAverageScore &&
      m.recent.length >= rule.sustainedAudits &&
      m.recent.slice(-rule.sustainedAudits).every((s) => s >= rule.minAverageScore) &&
      (rule.maxRepeatRate === null || m.repeat === null || m.repeat <= rule.maxRepeatRate) &&
      (rule.minOnTimeClosure === null || m.onTime === null || m.onTime >= rule.minOnTimeClosure) &&
      (rule.minAdherence === null || m.adherence === null || m.adherence >= rule.minAdherence);

    const rows = health.map((h) => {
      const ex = executions.filter((e) => e.locationId === h.id);
      const obs = observations.filter((o) => o.locationId === h.id);
      const acts = actions.filter((a) => a.locationId === h.id);
      const inst = instances.filter((i) => i.locationId === h.id);
      const metrics = {
        avg: avg(ex.map((e) => e.overallScore)),
        recent: ex.map((e) => e.overallScore),
        repeat: pct(obs.filter((o) => o.isRepeat).length, obs.length),
        onTime: pct(acts.filter((a) => (a.verifiedAt as Date) <= a.targetDate).length, acts.length),
        adherence: pct(inst.filter((i) => i.status === 'SUBMITTED').length, inst.length),
      };
      const achieved = settings.certificationRules.find((r) => evaluate(r, metrics));
      return {
        locationId: h.id,
        areaCode: h.areaCode,
        name: h.name,
        department: h.department,
        certification: achieved?.name ?? null,
        averageScore: metrics.avg,
        auditsInWindow: ex.length,
        repeatPercent: metrics.repeat,
        onTimeClosurePercent: metrics.onTime,
        adherencePercent: metrics.adherence,
      };
    });

    const summary: Record<string, number> = { PLATINUM: 0, GOLD: 0, SILVER: 0, BRONZE: 0, NONE: 0 };
    rows.forEach((r) => summary[r.certification ?? 'NONE']++);
    return { windowMonths: settings.certificationWindowMonths, rules: settings.certificationRules, summary, locations: rows };
  }

  // ---------------------------------------------------------------------------
  // Maturity per area & executive summary (BRD §45, §50)
  // ---------------------------------------------------------------------------

  /**
   * Maturity level of every area from its average audit score in the period. Areas without audits in the period are
   * "not assessed" (no level is invented for them).
   */
  async areaMaturity(tenantId: string, period: Period, orgNodeId?: string, scope: LocationScope = null) {
    const settings = await this.settings(tenantId);
    const health = await this.locationHealth(tenantId, orgNodeId, scope);
    const executions = await this.scoredExecutions(tenantId, health.map((h) => h.id), period.from, period.to);
    const byLocation = new Map<string, ScoredExecution[]>();
    executions.forEach((e) => byLocation.set(e.locationId, [...(byLocation.get(e.locationId) ?? []), e]));

    const locations = health.map((h) => {
      const ex = byLocation.get(h.id) ?? [];
      const averageScore = avg(ex.map((e) => e.overallScore));
      const pillars = this.pillarAverages(ex);
      const weakest = (Object.entries(pillars) as [PillarKey, number | null][])
        .filter((e): e is [PillarKey, number] => e[1] !== null)
        .sort((a, b) => a[1] - b[1])[0];
      const band = maturityFor(averageScore, settings);
      const maturity: MaturitySummary | null = band ? { level: band.level, name: band.name, description: band.description, color: band.color } : null;
      return {
        locationId: h.id,
        areaCode: h.areaCode,
        name: h.name,
        department: h.department,
        plant: h.plant,
        orgNodeId: h.orgNodeId,
        auditsInPeriod: ex.length,
        averageScore,
        latestScore: h.overallScore,
        lastAuditDate: h.lastAuditDate,
        weakestPillar: weakest ? weakest[0] : null,
        maturity,
      };
    });

    const levels = [...settings.maturityBands]
      .sort((a, b) => a.level - b.level)
      .map((b) => ({ level: b.level, name: b.name, color: b.color, minScore: b.minScore, count: locations.filter((l) => l.maturity?.level === b.level).length }));
    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString(), label: period.label },
      levels,
      notAssessed: locations.filter((l) => l.maturity === null).length,
      locations,
    };
  }

  /** One-line leadership view: score and trend, actions, audits done vs planned, best and weakest areas. */
  async executiveSummary(tenantId: string, period: Period, orgNodeId?: string, scope: LocationScope = null) {
    const [k, maturity] = await Promise.all([this.kpis(tenantId, period, orgNodeId, scope), this.areaMaturity(tenantId, period, orgNodeId, scope)]);
    const ranked = maturity.locations
      .filter((l) => l.averageScore !== null)
      .sort((a, b) => (b.averageScore as number) - (a.averageScore as number));
    const pick = (l: (typeof ranked)[number]) => ({
      locationId: l.locationId,
      areaCode: l.areaCode,
      name: l.name,
      department: l.department,
      averageScore: l.averageScore,
      auditsInPeriod: l.auditsInPeriod,
    });
    const top = ranked.slice(0, 3);
    const topIds = new Set(top.map((t) => t.locationId));
    // The weakest areas never repeat an area already listed as a best one
    const bottom = [...ranked].reverse().filter((l) => !topIds.has(l.locationId)).slice(0, 3);
    return {
      period: k.period,
      overallScore: k.fiveSScore,
      previousPeriodScore: k.previousPeriodScore,
      scoreChange: k.scoreChange,
      targetScore: k.targetScore,
      maturity: k.maturity,
      actions: { open: k.actions.open, overdue: k.actions.overdue },
      audits: {
        completed: k.audits.completed,
        planned: k.audits.scheduledDue,
        plannedCompleted: k.audits.scheduledCompleted,
        adherencePercent: k.audits.adherencePercent,
      },
      observations: { openCritical: k.observations.openCritical },
      redTags: { pending: k.redTags.pending },
      areas: k.locations,
      topAreas: top.map(pick),
      bottomAreas: bottom.map(pick),
    };
  }
}

import { Prisma } from '@prisma/client';
import { avg, CLOSED_ACTION_STATUSES, pct, Period } from '../analytics/metrics.service';
import { CLOSED_ACTION, DAY_MS, RegisterContext, RegisterDefinition, ReportFilters, ReportRow, ReportSummaryItem, col, locationScope, name } from './report-registers';

/**
 * Management registers (BRD §81): rankings, maturity, certification, audit trend, auditor performance and action
 * ageing. They are computed with the same MetricsService as the analytics screens, so a report and the dashboard
 * never disagree, and they honour the caller's data scope like every other register.
 */

/** Executions whose results count (submitted for review, disputed or acknowledged). */
const SCORED_STATUSES = ['SUBMITTED', 'DISPUTED', 'ACKNOWLEDGED'];
const DEFAULT_WINDOW = 'Audit completion date (last 12 months when no range is set)';

/** The from/to range, or the last 12 calendar months (as on the analytics screens) when none is given. */
function periodOf(ctx: RegisterContext, f: ReportFilters): Period {
  if (f.from || f.to) return { from: f.from ?? new Date(0), to: f.to ?? new Date(), label: 'Custom period' };
  return ctx.metrics.resolvePeriod('12M');
}

/** Ranks scored rows 1..n by score; unscored rows follow without a rank. */
function ranked<T extends { score: number | null }>(rows: T[]): Array<T & { rank: number | null }> {
  const scored = rows.filter((r) => r.score !== null).sort((a, b) => (b.score as number) - (a.score as number));
  const unscored = rows.filter((r) => r.score === null);
  return [...scored.map((r, i) => ({ ...r, rank: i + 1 })), ...unscored.map((r) => ({ ...r, rank: null }))];
}

const page = (rows: ReportRow[], limit: number) => ({ rows: rows.slice(0, limit), total: rows.length });

/** Ageing buckets for open corrective actions, by whole days since the action was raised. */
export const ACTION_AGE_BUCKETS = [
  { key: 'days0to7', label: '0–7 days', minDays: 0, maxDays: 7 },
  { key: 'days8to15', label: '8–15 days', minDays: 8, maxDays: 15 },
  { key: 'days16to30', label: '16–30 days', minDays: 16, maxDays: 30 },
  { key: 'over30', label: 'Over 30 days', minDays: 31, maxDays: null },
] as const;

const bucketFor = (ageDays: number) => ACTION_AGE_BUCKETS.find((b) => ageDays >= b.minDays && (b.maxDays === null || ageDays <= b.maxDays)) ?? ACTION_AGE_BUCKETS[3];

export const INSIGHT_REGISTERS: RegisterDefinition[] = [
  {
    key: 'area-ranking',
    title: 'Area Ranking',
    description: 'Areas ranked by average audit score, with maturity level, open actions and repeat-observation rate.',
    dateFilter: DEFAULT_WINDOW,
    filters: ['from', 'to', 'orgNodeId'],
    columns: [
      col('rank', 'Rank', 'number', 0.5),
      col('areaCode', 'Area code', 'text', 1.2),
      col('location', 'Location', 'text', 1.6),
      col('department', 'Department', 'text', 1.4),
      col('plant', 'Plant', 'text', 1.3),
      col('audits', 'Audits', 'number', 0.6),
      col('score', 'Average score %', 'percent', 0.9),
      col('latestScore', 'Latest score %', 'percent', 0.9),
      col('maturity', 'Maturity', 'text', 1.1),
      col('openActions', 'Open actions', 'number', 0.8),
      col('repeatPercent', 'Repeat %', 'percent', 0.7),
    ],
    async load(ctx, f, limit) {
      const { prisma, tenantId } = ctx;
      const period = periodOf(ctx, f);
      const m = await ctx.metrics.areaMaturity(tenantId, period, f.orgNodeId, ctx.scope);
      const ids = m.locations.map((l) => l.locationId);
      const [open, observations] = await Promise.all([
        prisma.correctiveAction.groupBy({ by: ['locationId'], where: { tenantId, locationId: { in: ids }, status: { notIn: CLOSED_ACTION } }, _count: { _all: true } }),
        prisma.observation.findMany({
          where: { tenantId, locationId: { in: ids }, createdAt: { gte: period.from, lte: period.to } },
          select: { locationId: true, isRepeat: true },
        }),
      ]);
      const openBy = new Map(open.map((o) => [o.locationId, o._count._all]));
      const rows = ranked(m.locations.map((l) => ({ ...l, score: l.averageScore }))).map((l) => {
        const obs = observations.filter((o) => o.locationId === l.locationId);
        return {
          rank: l.rank,
          areaCode: l.areaCode,
          location: l.name,
          department: l.department || null,
          plant: l.plant || null,
          audits: l.auditsInPeriod,
          score: l.score,
          latestScore: l.latestScore,
          maturity: l.maturity ? `L${l.maturity.level} ${l.maturity.name}` : null,
          openActions: openBy.get(l.locationId) ?? 0,
          repeatPercent: pct(obs.filter((o) => o.isRepeat).length, obs.length),
        };
      });
      return page(rows, limit);
    },
  },
  {
    key: 'department-ranking',
    title: 'Department Ranking',
    description: 'Departments ranked by average audit score, with audits, open actions and repeat-observation rate.',
    dateFilter: DEFAULT_WINDOW,
    filters: ['from', 'to', 'orgNodeId'],
    columns: [
      col('rank', 'Rank', 'number', 0.5),
      col('department', 'Department', 'text', 2),
      col('score', 'Average score %', 'percent', 0.9),
      col('audits', 'Audits', 'number', 0.7),
      col('areas', 'Areas', 'number', 0.6),
      col('openActions', 'Open actions', 'number', 0.8),
      col('observations', 'Observations', 'number', 0.8),
      col('repeatPercent', 'Repeat %', 'percent', 0.7),
    ],
    async load(ctx, f, limit) {
      const rows = await ctx.metrics.benchmark(ctx.tenantId, 'DEPARTMENT', periodOf(ctx, f), f.orgNodeId, ctx.scope);
      return page(
        rows.map((r) => ({
          rank: r.rank,
          department: r.name || null,
          score: r.score,
          audits: r.audits,
          areas: r.locations,
          openActions: r.openActions,
          observations: r.observations,
          repeatPercent: r.repeatPercent,
        })),
        limit,
      );
    },
  },
  {
    key: 'maturity',
    title: 'Maturity Report',
    description: 'Maturity level of every area from its average audit score, with its weakest pillar.',
    dateFilter: DEFAULT_WINDOW,
    filters: ['from', 'to', 'orgNodeId'],
    columns: [
      col('areaCode', 'Area code', 'text', 1.2),
      col('location', 'Location', 'text', 1.6),
      col('department', 'Department', 'text', 1.4),
      col('plant', 'Plant', 'text', 1.2),
      col('audits', 'Audits', 'number', 0.6),
      col('averageScore', 'Average score %', 'percent', 0.9),
      col('level', 'Level', 'number', 0.5),
      col('maturity', 'Maturity', 'text', 1.1),
      col('latestScore', 'Latest score %', 'percent', 0.9),
      col('lastAuditDate', 'Last audit', 'date'),
      col('weakestPillar', 'Weakest pillar', 'text', 1.1),
    ],
    async load(ctx, f, limit) {
      const m = await ctx.metrics.areaMaturity(ctx.tenantId, periodOf(ctx, f), f.orgNodeId, ctx.scope);
      const rows = [...m.locations]
        .sort((a, b) => (b.maturity?.level ?? 0) - (a.maturity?.level ?? 0) || (b.averageScore ?? -1) - (a.averageScore ?? -1))
        .map((l) => ({
          areaCode: l.areaCode,
          location: l.name,
          department: l.department || null,
          plant: l.plant || null,
          audits: l.auditsInPeriod,
          averageScore: l.averageScore,
          level: l.maturity?.level ?? null,
          maturity: l.maturity?.name ?? 'Not assessed',
          latestScore: l.latestScore,
          lastAuditDate: l.lastAuditDate ? new Date(l.lastAuditDate) : null,
          weakestPillar: l.weakestPillar,
        }));
      const summary: ReportSummaryItem[] = [
        ...m.levels.map((lv) => ({ key: `level${lv.level}`, label: `L${lv.level} ${lv.name}`, value: lv.count })),
        { key: 'notAssessed', label: 'Not assessed', value: m.notAssessed },
      ];
      return { ...page(rows, limit), summary };
    },
  },
  {
    key: 'certification',
    title: 'Certification Report',
    description: 'Internal certification level (Platinum / Gold / Silver / Bronze) of every area from the configured rules.',
    dateFilter: null,
    filters: ['orgNodeId', 'status'],
    columns: [
      col('areaCode', 'Area code', 'text', 1.2),
      col('location', 'Location', 'text', 1.6),
      col('department', 'Department', 'text', 1.4),
      col('certification', 'Certification', 'text', 1),
      col('averageScore', 'Average score %', 'percent', 0.9),
      col('audits', 'Audits in window', 'number', 0.8),
      col('repeatPercent', 'Repeat %', 'percent', 0.7),
      col('onTimeClosurePercent', 'On-time closure %', 'percent', 0.9),
      col('adherencePercent', 'Audit adherence %', 'percent', 0.9),
    ],
    async load(ctx, f, limit) {
      const c = await ctx.metrics.certification(ctx.tenantId, f.orgNodeId, ctx.scope);
      const rows = c.locations
        .filter((l) => !f.status || (l.certification ?? 'NONE') === f.status)
        .map((l) => ({
          areaCode: l.areaCode,
          location: l.name,
          department: l.department || null,
          certification: l.certification ?? 'Not certified',
          averageScore: l.averageScore,
          audits: l.auditsInWindow,
          repeatPercent: l.repeatPercent,
          onTimeClosurePercent: l.onTimeClosurePercent,
          adherencePercent: l.adherencePercent,
        }));
      const summary: ReportSummaryItem[] = ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'NONE'].map((k) => ({
        key: k,
        label: k === 'NONE' ? 'Not certified' : k.charAt(0) + k.slice(1).toLowerCase(),
        value: c.summary[k] ?? 0,
      }));
      summary.push({ key: 'windowMonths', label: 'Evaluation window (months)', value: c.windowMonths });
      return { ...page(rows, limit), summary };
    },
  },
  {
    key: 'audit-trend',
    title: 'Audit Score Trend',
    description: 'Monthly average audit score overall and per pillar (months without audits are blank).',
    dateFilter: DEFAULT_WINDOW,
    filters: ['from', 'to', 'orgNodeId'],
    columns: [
      col('month', 'Month', 'text', 1.1),
      col('audits', 'Audits', 'number', 0.6),
      col('overall', 'Overall %', 'percent', 0.8),
      col('S1_SORT', '1S Sort %', 'percent', 0.8),
      col('S2_SET_IN_ORDER', '2S Set in order %', 'percent', 0.9),
      col('S3_SHINE', '3S Shine %', 'percent', 0.8),
      col('S4_STANDARDIZE', '4S Standardize %', 'percent', 0.9),
      col('S5_SUSTAIN', '5S Sustain %', 'percent', 0.8),
      col('S6_SAFETY', '6S Safety %', 'percent', 0.8),
    ],
    async load(ctx, f, limit) {
      const trend = await ctx.metrics.trend(ctx.tenantId, periodOf(ctx, f), f.orgNodeId, ctx.scope);
      return page(trend.map((m) => ({ ...m })), limit);
    },
  },
  {
    key: 'auditor-performance',
    title: 'Auditor Performance',
    description: 'Audits completed, average score given, findings raised and on-time completion of assigned audits per auditor.',
    dateFilter: 'Audit completion date / planned due date (last 12 months when no range is set)',
    filters: ['from', 'to', 'locationId', 'orgNodeId', 'auditorId'],
    columns: [
      col('auditor', 'Auditor', 'text', 1.6),
      col('auditsDone', 'Audits done', 'number', 0.8),
      col('averageScore', 'Average score %', 'percent', 0.9),
      col('findings', 'Findings raised', 'number', 0.8),
      col('assignedDue', 'Assigned & due', 'number', 0.8),
      col('completedOnTime', 'Done on time', 'number', 0.8),
      col('onTimePercent', 'On-time %', 'percent', 0.8),
      col('missed', 'Not done', 'number', 0.7),
    ],
    async load(ctx, f, limit) {
      const { prisma, tenantId } = ctx;
      const period = periodOf(ctx, f);
      const ids = await locationScope(ctx, f);
      const now = new Date();
      const dueUntil = period.to < now ? period.to : now;
      const locationFilter = ids ? { locationId: { in: ids } } : {};
      const [executions, instances] = await Promise.all([
        prisma.auditExecution.findMany({
          where: {
            tenantId,
            ...locationFilter,
            auditorId: f.auditorId ? f.auditorId : { not: null },
            status: { in: SCORED_STATUSES },
            completedAt: { gte: period.from, lte: period.to },
          },
          select: {
            auditorId: true,
            overallScore: true,
            auditor: { select: { firstName: true, lastName: true } },
            _count: { select: { observations: { where: { deletedAt: null } } } },
          },
        }),
        prisma.scheduledAuditInstance.findMany({
          where: {
            tenantId,
            ...locationFilter,
            auditorId: f.auditorId ? f.auditorId : { not: null },
            status: { not: 'CANCELLED' },
            dueDate: { gte: period.from, lte: dueUntil },
          },
          select: {
            auditorId: true,
            status: true,
            dueDate: true,
            auditor: { select: { firstName: true, lastName: true } },
            executions: { where: { completedAt: { not: null } }, select: { completedAt: true } },
          },
        }),
      ]);

      type Acc = { auditor: string | null; scores: number[]; findings: number; due: number; onTime: number; missed: number };
      const by = new Map<string, Acc>();
      const acc = (id: string, who: { firstName: string; lastName: string } | null): Acc => {
        const cur = by.get(id) ?? { auditor: name(who), scores: [], findings: 0, due: 0, onTime: 0, missed: 0 };
        by.set(id, cur);
        return cur;
      };
      executions.forEach((e) => {
        const a = acc(e.auditorId as string, e.auditor);
        a.scores.push(e.overallScore);
        a.findings += e._count.observations;
      });
      instances.forEach((i) => {
        const a = acc(i.auditorId as string, i.auditor);
        a.due++;
        // On time = completed no later than the end of the due day
        const deadline = new Date(i.dueDate.getTime());
        deadline.setUTCHours(23, 59, 59, 999);
        const done = i.status === 'SUBMITTED' || i.executions.length > 0;
        if (done && i.executions.some((x) => (x.completedAt as Date) <= deadline)) a.onTime++;
        if (!done) a.missed++;
      });

      const rows = Array.from(by.values())
        .map((a) => ({
          auditor: a.auditor,
          auditsDone: a.scores.length,
          averageScore: avg(a.scores),
          findings: a.findings,
          assignedDue: a.due,
          completedOnTime: a.onTime,
          onTimePercent: pct(a.onTime, a.due),
          missed: a.missed,
        }))
        .sort((x, y) => y.auditsDone - x.auditsDone || (y.onTimePercent ?? -1) - (x.onTimePercent ?? -1));
      return page(rows, limit);
    },
  },
  {
    key: 'action-ageing',
    title: 'Action Ageing',
    description: 'Open corrective actions by age since they were raised (0–7, 8–15, 16–30, over 30 days), oldest first.',
    dateFilter: null,
    filters: ['locationId', 'orgNodeId', 'status', 'severity', 'assigneeId', 'source', 'actionType'],
    columns: [
      col('actionCode', 'Action', 'text', 1.4),
      col('ageDays', 'Age (days)', 'number', 0.7),
      col('ageBucket', 'Age band', 'text', 0.9),
      col('areaCode', 'Area code', 'text', 1.1),
      col('location', 'Location', 'text', 1.4),
      col('title', 'Title', 'text', 2),
      col('source', 'Source'),
      col('severity', 'Severity'),
      col('assignee', 'Assignee', 'text', 1.2),
      col('createdAt', 'Raised', 'date'),
      col('targetDate', 'Due', 'date'),
      col('daysOverdue', 'Days overdue', 'number', 0.8),
      col('status', 'Status', 'text', 1.1),
      col('escalationTier', 'Escalation', 'text', 1),
    ],
    async load(ctx, f, limit) {
      const { prisma, tenantId } = ctx;
      const ids = await locationScope(ctx, f);
      const now = new Date();
      const where: Prisma.CorrectiveActionWhereInput = {
        tenantId,
        AND: [{ status: { notIn: CLOSED_ACTION_STATUSES } }, ...(f.status ? [{ status: f.status }] : [])],
        ...(ids ? { locationId: { in: ids } } : {}),
        ...(f.assigneeId ? { assigneeId: f.assigneeId } : {}),
        ...(f.source ? { source: f.source } : {}),
        ...(f.actionType ? { actionType: f.actionType } : {}),
        ...(f.severity ? { observation: { severity: f.severity } } : {}),
      };
      // Bucket boundaries as creation dates: age in whole days = floor((now - createdAt) / 1 day)
      const daysAgo = (d: number) => new Date(now.getTime() - d * DAY_MS);
      const [total, rows, ...bucketCounts] = await Promise.all([
        prisma.correctiveAction.count({ where }),
        prisma.correctiveAction.findMany({
          where,
          take: limit,
          orderBy: { createdAt: 'asc' },
          select: {
            actionCode: true, createdAt: true, title: true, source: true, targetDate: true, status: true, escalationTier: true,
            assignee: { select: { firstName: true, lastName: true } },
            observation: { select: { severity: true } },
            location: { select: { areaCode: true, name: true } },
          },
        }),
        ...ACTION_AGE_BUCKETS.map((b) =>
          prisma.correctiveAction.count({
            where: {
              AND: [
                where,
                { createdAt: { lte: daysAgo(b.minDays), ...(b.maxDays === null ? {} : { gt: daysAgo(b.maxDays + 1) }) } },
              ],
            },
          }),
        ),
      ]);
      return {
        total,
        summary: ACTION_AGE_BUCKETS.map((b, i) => ({ key: b.key, label: b.label, value: bucketCounts[i] })),
        rows: rows.map((r) => {
          const ageDays = Math.max(0, Math.floor((now.getTime() - r.createdAt.getTime()) / DAY_MS));
          return {
            actionCode: r.actionCode,
            ageDays,
            ageBucket: bucketFor(ageDays).label,
            areaCode: r.location.areaCode,
            location: r.location.name,
            title: r.title,
            source: r.source,
            severity: r.observation?.severity ?? null,
            assignee: name(r.assignee),
            createdAt: r.createdAt,
            targetDate: r.targetDate,
            daysOverdue: r.targetDate < now ? Math.floor((now.getTime() - r.targetDate.getTime()) / DAY_MS) : null,
            status: r.status,
            escalationTier: r.escalationTier,
          };
        }),
      };
    },
  },
];


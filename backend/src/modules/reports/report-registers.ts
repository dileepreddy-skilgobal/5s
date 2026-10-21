import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { MetricsService } from '../analytics/metrics.service';
import { LocationScope, scopeWhere } from '../analytics/data-scope.service';

export type ColumnType = 'text' | 'number' | 'date' | 'datetime' | 'percent' | 'boolean';

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
  /** Relative width for PDF layout. */
  width: number;
}

export type ReportRow = Record<string, string | number | boolean | Date | null>;

export interface ReportFilters {
  from?: Date;
  to?: Date;
  locationId?: string;
  orgNodeId?: string;
  status?: string;
  severity?: string;
  category?: string;
  assigneeId?: string;
  overdueOnly?: boolean;
  /** Observations flagged as repeats only. */
  repeatOnly?: boolean;
  /** Audits conducted by one auditor. */
  auditorId?: string;
  /** Corrective-action origin: AUDIT, OBSERVATION, RED_TAG, MANAGEMENT_REVIEW. */
  source?: string;
  /** Corrective-action type: CORRECTIVE, PREVENTIVE, KAIZEN. */
  actionType?: string;
}

/** What a register needs to load its rows: data access plus the caller's data scope (plant / department heads). */
export interface RegisterContext {
  prisma: PrismaService;
  metrics: MetricsService;
  tenantId: string;
  scope: LocationScope;
}

/** Headline figure computed over every matching record (not only the previewed rows), e.g. ageing buckets. */
export interface ReportSummaryItem {
  key: string;
  label: string;
  value: number;
}

export interface RegisterResult {
  rows: ReportRow[];
  total: number;
  summary?: ReportSummaryItem[];
}

export interface RegisterDefinition {
  key: string;
  title: string;
  description: string;
  /** Which date the from/to filter applies to (null = no date filter). */
  dateFilter: string | null;
  /** Filters this register understands (for the UI). */
  filters: Array<keyof ReportFilters>;
  columns: ReportColumn[];
  load(ctx: RegisterContext, filters: ReportFilters, limit: number): Promise<RegisterResult>;
}

export const DAY_MS = 86400000;
export const CLOSED_ACTION = ['VERIFIED', 'CLOSED'];
const FINISHED_TAG = ['DISPOSED', 'RETURNED', 'CANCELLED'];
export const name = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);
export const col = (key: string, label: string, type: ColumnType = 'text', width = 1): ReportColumn => ({ key, label, type, width });

/**
 * Location ids in an org-node sub-tree (or the single location) within the caller's data scope,
 * or undefined for "all".
 */
export async function locationScope(ctx: RegisterContext, f: ReportFilters): Promise<string[] | undefined> {
  const { prisma, tenantId, scope } = ctx;
  if (!scope) {
    if (f.locationId) return [f.locationId];
    if (!f.orgNodeId) return undefined;
  }
  const and: Prisma.LocationWhereInput[] = [];
  if (f.locationId) and.push({ id: f.locationId });
  if (f.orgNodeId) {
    const node = await prisma.orgNode.findFirst({ where: { id: f.orgNodeId, tenantId }, select: { path: true } });
    if (!node) throw new BadRequestException(`Org node '${f.orgNodeId}' not found`);
    and.push({ orgNode: { path: { startsWith: node.path } } });
  }
  const scoped = scopeWhere(scope);
  if (scoped) and.push(scoped);
  const locs = await prisma.location.findMany({ where: { tenantId, AND: and }, select: { id: true } });
  return locs.map((l) => l.id);
}

export const range = (f: ReportFilters): Prisma.DateTimeFilter | undefined =>
  f.from || f.to ? { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } : undefined;

export const REGISTERS: RegisterDefinition[] = [
  {
    key: 'audits',
    title: 'Audit Register',
    description: 'Every audit with score, result, findings and acknowledgement.',
    dateFilter: 'Audit start date',
    filters: ['from', 'to', 'locationId', 'orgNodeId', 'status', 'auditorId'],
    columns: [
      col('auditCode', 'Audit', 'text', 1.4),
      col('areaCode', 'Area code', 'text', 1.2),
      col('location', 'Location', 'text', 1.6),
      col('department', 'Department', 'text', 1.4),
      col('auditType', 'Type'),
      col('auditor', 'Auditor', 'text', 1.2),
      col('status', 'Status'),
      col('startedAt', 'Started', 'date'),
      col('completedAt', 'Completed', 'date'),
      col('score', 'Score %', 'percent', 0.8),
      col('passed', 'Passed', 'boolean', 0.7),
      col('criticalFailures', 'Critical fails', 'number', 0.8),
      col('findings', 'Findings', 'number', 0.8),
      col('acknowledgedAt', 'Acknowledged', 'date', 1.15),
      col('disputeStatus', 'Dispute'),
    ],
    async load(ctx, f, limit) {
      const { prisma, tenantId } = ctx;
      const ids = await locationScope(ctx, f);
      const where: Prisma.AuditExecutionWhereInput = {
        tenantId,
        ...(ids ? { locationId: { in: ids } } : {}),
        ...(f.status ? { status: f.status } : {}),
        ...(f.auditorId ? { auditorId: f.auditorId } : {}),
        ...(range(f) ? { startedAt: range(f) } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.auditExecution.count({ where }),
        prisma.auditExecution.findMany({
          where,
          take: limit,
          orderBy: { startedAt: 'desc' },
          select: {
            auditCode: true, auditType: true, status: true, startedAt: true, completedAt: true, overallScore: true, isPassed: true,
            criticalFailureCount: true, acknowledgedAt: true, disputeStatus: true, auditorName: true,
            auditor: { select: { firstName: true, lastName: true } },
            location: { select: { areaCode: true, name: true, orgNode: { select: { name: true } } } },
            _count: { select: { observations: { where: { deletedAt: null } } } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((r) => ({
          auditCode: r.auditCode,
          areaCode: r.location.areaCode,
          location: r.location.name,
          department: r.location.orgNode?.name ?? null,
          auditType: r.auditType,
          auditor: name(r.auditor) ?? r.auditorName,
          status: r.status,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          score: r.status === 'IN_PROGRESS' ? null : r.overallScore,
          passed: r.status === 'IN_PROGRESS' ? null : r.isPassed,
          criticalFailures: r.criticalFailureCount,
          findings: r._count.observations,
          acknowledgedAt: r.acknowledgedAt,
          disputeStatus: r.disputeStatus,
        })),
      };
    },
  },
  {
    key: 'observations',
    title: 'Observation Register',
    description: 'Abnormalities and audit findings with severity, repeat flag and linked action.',
    dateFilter: 'Reported date',
    filters: ['from', 'to', 'locationId', 'orgNodeId', 'status', 'severity', 'category', 'repeatOnly'],
    columns: [
      col('observationCode', 'Observation', 'text', 1.4),
      col('reportedAt', 'Reported', 'date'),
      col('areaCode', 'Area code', 'text', 1.2),
      col('location', 'Location', 'text', 1.4),
      col('category', 'Pillar'),
      col('severity', 'Severity'),
      col('title', 'Title', 'text', 2.2),
      col('status', 'Status'),
      col('repeat', 'Repeat', 'boolean', 0.7),
      col('reportedBy', 'Reported by', 'text', 1.2),
      col('auditCode', 'Audit', 'text', 1.3),
      col('actionCode', 'Action', 'text', 1.3),
      col('actionStatus', 'Action status'),
    ],
    async load(ctx, f, limit) {
      const { prisma, tenantId } = ctx;
      const ids = await locationScope(ctx, f);
      const where: Prisma.ObservationWhereInput = {
        tenantId,
        ...(ids ? { locationId: { in: ids } } : {}),
        ...(f.status ? { status: f.status } : {}),
        ...(f.severity ? { severity: f.severity } : {}),
        ...(f.category ? { category: f.category } : {}),
        ...(f.repeatOnly ? { isRepeat: true } : {}),
        ...(range(f) ? { createdAt: range(f) } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.observation.count({ where }),
        prisma.observation.findMany({
          where,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            observationCode: true, createdAt: true, category: true, severity: true, title: true, status: true, isRepeat: true,
            loggedBy: { select: { firstName: true, lastName: true } },
            location: { select: { areaCode: true, name: true } },
            execution: { select: { auditCode: true } },
            correctiveAction: { select: { actionCode: true, status: true, deletedAt: true } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((r) => {
          const action = r.correctiveAction && !r.correctiveAction.deletedAt ? r.correctiveAction : null;
          return {
            observationCode: r.observationCode,
            reportedAt: r.createdAt,
            areaCode: r.location.areaCode,
            location: r.location.name,
            category: r.category,
            severity: r.severity,
            title: r.title,
            status: r.status,
            repeat: r.isRepeat,
            reportedBy: name(r.loggedBy),
            auditCode: r.execution?.auditCode ?? null,
            actionCode: action?.actionCode ?? null,
            actionStatus: action?.status ?? null,
          };
        }),
      };
    },
  },
  {
    key: 'actions',
    title: 'Corrective Action Register',
    description: 'Corrective actions with owner, due date, overdue days, verification and closure.',
    dateFilter: 'Created date',
    filters: ['from', 'to', 'locationId', 'orgNodeId', 'status', 'severity', 'assigneeId', 'overdueOnly', 'source', 'actionType'],
    columns: [
      col('actionCode', 'Action', 'text', 1.4),
      col('createdAt', 'Created', 'date'),
      col('areaCode', 'Area code', 'text', 1.2),
      col('location', 'Location', 'text', 1.4),
      col('title', 'Title', 'text', 2.2),
      col('source', 'Source'),
      col('actionType', 'Type'),
      col('severity', 'Severity'),
      col('assignee', 'Assignee', 'text', 1.2),
      col('targetDate', 'Due', 'date'),
      col('status', 'Status', 'text', 1.1),
      col('daysOverdue', 'Days overdue', 'number', 0.8),
      col('verifiedAt', 'Verified', 'date'),
      col('verifiedBy', 'Verified by', 'text', 1.2),
      col('closedAt', 'Closed', 'date'),
      col('closedOnTime', 'On time', 'boolean', 0.7),
      col('reopenCount', 'Reopened', 'number', 0.7),
    ],
    async load(ctx, f, limit) {
      const { prisma, tenantId } = ctx;
      const ids = await locationScope(ctx, f);
      const now = new Date();
      const where: Prisma.CorrectiveActionWhereInput = {
        tenantId,
        ...(ids ? { locationId: { in: ids } } : {}),
        ...(f.status ? { status: f.status } : {}),
        ...(f.assigneeId ? { assigneeId: f.assigneeId } : {}),
        ...(f.source ? { source: f.source } : {}),
        ...(f.actionType ? { actionType: f.actionType } : {}),
        ...(f.severity ? { observation: { severity: f.severity } } : {}),
        ...(f.overdueOnly ? { status: { notIn: CLOSED_ACTION }, targetDate: { lt: now } } : {}),
        ...(range(f) ? { createdAt: range(f) } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.correctiveAction.count({ where }),
        prisma.correctiveAction.findMany({
          where,
          take: limit,
          orderBy: { targetDate: 'asc' },
          select: {
            actionCode: true, createdAt: true, title: true, source: true, actionType: true, targetDate: true, status: true, verifiedAt: true, closedAt: true, reopenCount: true,
            assignee: { select: { firstName: true, lastName: true } },
            verifiedBy: { select: { firstName: true, lastName: true } },
            observation: { select: { severity: true } },
            location: { select: { areaCode: true, name: true } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((r) => {
          const open = !CLOSED_ACTION.includes(r.status);
          const finishedAt = r.verifiedAt ?? r.closedAt;
          return {
            actionCode: r.actionCode,
            createdAt: r.createdAt,
            areaCode: r.location.areaCode,
            location: r.location.name,
            title: r.title,
            source: r.source,
            actionType: r.actionType,
            severity: r.observation?.severity ?? null,
            assignee: name(r.assignee),
            targetDate: r.targetDate,
            status: r.status,
            daysOverdue: open && r.targetDate < now ? Math.floor((now.getTime() - r.targetDate.getTime()) / DAY_MS) : null,
            verifiedAt: r.verifiedAt,
            verifiedBy: name(r.verifiedBy),
            closedAt: r.closedAt,
            closedOnTime: finishedAt ? finishedAt <= r.targetDate : null,
            reopenCount: r.reopenCount,
          };
        }),
      };
    },
  },
  {
    key: 'red-tags',
    title: 'Red Tag Register',
    description: 'Red-tagged items with age, disposition and financial recovery.',
    dateFilter: 'Tagged date',
    filters: ['from', 'to', 'locationId', 'orgNodeId', 'status', 'category'],
    columns: [
      col('tagNumber', 'Tag', 'text', 1.3),
      col('taggedDate', 'Tagged', 'date'),
      col('areaCode', 'Area code', 'text', 1.2),
      col('location', 'Location', 'text', 1.4),
      col('itemName', 'Item', 'text', 1.8),
      col('category', 'Category', 'text', 1.2),
      col('quantity', 'Qty', 'number', 0.5),
      col('estimatedValue', 'Est. value', 'number', 0.8),
      col('status', 'Status', 'text', 1.2),
      col('ageDays', 'Age (days)', 'number', 0.7),
      col('dispositionAction', 'Disposition', 'text', 1.2),
      col('closedAt', 'Closed', 'date'),
      col('financialRecovered', 'Recovered', 'number', 0.8),
      col('taggedBy', 'Tagged by', 'text', 1.2),
    ],
    async load(ctx, f, limit) {
      const { prisma, tenantId } = ctx;
      const ids = await locationScope(ctx, f);
      const now = new Date();
      const where: Prisma.RedTagWhereInput = {
        tenantId,
        ...(ids ? { locationId: { in: ids } } : {}),
        ...(f.status ? { status: f.status } : {}),
        ...(f.category ? { category: f.category } : {}),
        ...(range(f) ? { taggedDate: range(f) } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.redTag.count({ where }),
        prisma.redTag.findMany({
          where,
          take: limit,
          orderBy: { taggedDate: 'desc' },
          select: {
            tagNumber: true, taggedDate: true, itemName: true, category: true, quantity: true, estimatedValue: true, status: true,
            dispositionAction: true, actualDispositionDate: true, financialRecovered: true,
            taggedBy: { select: { firstName: true, lastName: true } },
            location: { select: { areaCode: true, name: true } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((r) => ({
          tagNumber: r.tagNumber,
          taggedDate: r.taggedDate,
          areaCode: r.location.areaCode,
          location: r.location.name,
          itemName: r.itemName,
          category: r.category,
          quantity: r.quantity,
          estimatedValue: r.estimatedValue,
          status: r.status,
          ageDays: FINISHED_TAG.includes(r.status)
            ? null
            : Math.floor((now.getTime() - r.taggedDate.getTime()) / DAY_MS),
          dispositionAction: r.dispositionAction,
          closedAt: r.actualDispositionDate,
          financialRecovered: r.financialRecovered,
          taggedBy: name(r.taggedBy),
        })),
      };
    },
  },
  {
    key: 'audit-plan',
    title: 'Audit Plan & Adherence',
    description: 'Scheduled audits with due dates, assigned auditor and completion status.',
    dateFilter: 'Due date',
    filters: ['from', 'to', 'locationId', 'orgNodeId', 'status'],
    columns: [
      col('auditCode', 'Planned audit', 'text', 1.4),
      col('areaCode', 'Area code', 'text', 1.2),
      col('location', 'Location', 'text', 1.6),
      col('auditor', 'Auditor', 'text', 1.3),
      col('auditType', 'Type'),
      col('plannedDate', 'Planned', 'date'),
      col('dueDate', 'Due', 'date'),
      col('status', 'Status'),
      col('score', 'Score %', 'percent', 0.8),
    ],
    async load(ctx, f, limit) {
      const { prisma, tenantId } = ctx;
      const ids = await locationScope(ctx, f);
      const where: Prisma.ScheduledAuditInstanceWhereInput = {
        tenantId,
        ...(ids ? { locationId: { in: ids } } : {}),
        ...(f.status ? { status: f.status } : {}),
        ...(range(f) ? { dueDate: range(f) } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.scheduledAuditInstance.count({ where }),
        prisma.scheduledAuditInstance.findMany({
          where,
          take: limit,
          orderBy: { dueDate: 'asc' },
          select: {
            auditCode: true, auditType: true, plannedDate: true, dueDate: true, status: true, score: true,
            auditor: { select: { firstName: true, lastName: true } },
            location: { select: { areaCode: true, name: true } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((r) => ({
          auditCode: r.auditCode,
          areaCode: r.location.areaCode,
          location: r.location.name,
          auditor: name(r.auditor),
          auditType: r.auditType,
          plannedDate: r.plannedDate,
          dueDate: r.dueDate,
          status: r.status,
          score: r.score,
        })),
      };
    },
  },
  {
    key: 'locations',
    title: 'Location Master',
    description: 'All locations with owner, risk, latest audit result and open actions.',
    dateFilter: null,
    filters: ['locationId', 'orgNodeId', 'status'],
    columns: [
      col('areaCode', 'Area code', 'text', 1.3),
      col('name', 'Location', 'text', 1.8),
      col('department', 'Department', 'text', 1.5),
      col('locationType', 'Type', 'text', 1.2),
      col('riskLevel', 'Risk', 'text', 0.8),
      col('owner', 'Owner', 'text', 1.3),
      col('status', 'Status'),
      col('lastAuditDate', 'Last audit', 'date'),
      col('lastScore', 'Last score %', 'percent', 0.9),
      col('openActions', 'Open actions', 'number', 0.9),
    ],
    async load(ctx, f, limit) {
      const { prisma, tenantId } = ctx;
      const ids = await locationScope(ctx, f);
      const where: Prisma.LocationWhereInput = { tenantId, ...(ids ? { id: { in: ids } } : {}), ...(f.status ? { status: f.status } : {}) };
      const [total, rows] = await Promise.all([
        prisma.location.count({ where }),
        prisma.location.findMany({
          where,
          take: limit,
          orderBy: { areaCode: 'asc' },
          select: {
            id: true, areaCode: true, name: true, locationType: true, riskLevel: true, status: true,
            owner: { select: { firstName: true, lastName: true } },
            orgNode: { select: { name: true } },
          },
        }),
      ]);
      const locIds = rows.map((r) => r.id);
      const [latest, open] = await Promise.all([
        prisma.auditExecution.findMany({
          where: { tenantId, locationId: { in: locIds }, status: { in: ['SUBMITTED', 'DISPUTED', 'ACKNOWLEDGED'] }, completedAt: { not: null } },
          orderBy: { completedAt: 'desc' },
          distinct: ['locationId'],
          select: { locationId: true, completedAt: true, overallScore: true },
        }),
        prisma.correctiveAction.groupBy({ by: ['locationId'], where: { tenantId, locationId: { in: locIds }, status: { notIn: CLOSED_ACTION } }, _count: { _all: true } }),
      ]);
      const latestBy = new Map(latest.map((l) => [l.locationId, l]));
      const openBy = new Map(open.map((o) => [o.locationId, o._count._all]));
      return {
        total,
        rows: rows.map((r) => ({
          areaCode: r.areaCode,
          name: r.name,
          department: r.orgNode?.name ?? null,
          locationType: r.locationType,
          riskLevel: r.riskLevel,
          owner: name(r.owner),
          status: r.status,
          lastAuditDate: latestBy.get(r.id)?.completedAt ?? null,
          lastScore: latestBy.get(r.id)?.overallScore ?? null,
          openActions: openBy.get(r.id) ?? 0,
        })),
      };
    },
  },
];

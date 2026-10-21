import { BadRequestException, Controller, ForbiddenException, Get, NotFoundException, Param, Query, Req, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PrismaService } from '../../core/database/prisma.service';
import { ActivityLogService } from '../../core/activity/activity-log.service';
import { requestMeta } from '../../core/activity/activity-log.util';
import { CurrentUser, TenantId } from '../../core/auth/current-user.decorator';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { values } from '../../core/validation/domain-values';
import { REGISTERS, RegisterDefinition, ReportFilters } from './report-registers';
import { INSIGHT_REGISTERS } from './report-insight-registers';
import { ReportMeta, toCsv, toPdf, toXlsx } from './report-exporters';
import { MetricsService } from '../analytics/metrics.service';
import { DataScopeService } from '../analytics/data-scope.service';

/** Rows shown in the on-screen preview. */
const PREVIEW_ROWS = 200;
/** Hard ceiling for one export; narrower filters are needed beyond it. */
const MAX_EXPORT_ROWS = 50000;
/** PDF is meant for printable reports, not bulk extracts. */
const MAX_PDF_ROWS = 5000;

/** Operational registers first, then the management registers (BRD §81). */
const ALL_REGISTERS: RegisterDefinition[] = [...REGISTERS, ...INSIGHT_REGISTERS];

/** Origins of a corrective action (CorrectiveAction.source). */
const ACTION_SOURCES = ['AUDIT', 'OBSERVATION', 'RED_TAG', 'MANAGEMENT_REVIEW'];

const CONTENT_TYPES = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
} as const;

@ApiTags('Reports & Export')
@ApiBearerAuth()
@Controller('api/v1/reports')
@Roles(...RoleGroups.REPORT_VIEWERS)
export class ReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly metrics: MetricsService,
    private readonly dataScope: DataScopeService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Available registers with their columns, supported filters and whether file export is in the plan' })
  list(@CurrentUser() user: AuthenticatedUser) {
    // Lets the client show the plan lock before anyone tries an export
    const exportAllowed = this.exportAllowed(user);
    return ALL_REGISTERS.map(({ key, title, description, dateFilter, filters, columns }) => ({ key, title, description, dateFilter, filters, columns, exportAllowed }));
  }

  private exportAllowed(user: AuthenticatedUser): boolean {
    return user.isSuperAdmin || !user.subscription || user.subscription.features.includes('REPORTS_EXPORT');
  }

  @Get(':register')
  @ApiOperation({ summary: 'Register preview (format=json, first 200 rows) or export (format=csv | xlsx | pdf)' })
  async run(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Param('register') registerKey: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    const register = ALL_REGISTERS.find((r) => r.key === registerKey);
    if (!register) throw new NotFoundException(`Unknown register '${registerKey}'`);
    const format = (query.format ?? 'json').toLowerCase();
    if (!['json', 'csv', 'xlsx', 'pdf'].includes(format)) throw new BadRequestException('format must be json, csv, xlsx or pdf');

    const filters = this.parseFilters(query);
    const limit = format === 'json' ? PREVIEW_ROWS : format === 'pdf' ? MAX_PDF_ROWS : MAX_EXPORT_ROWS;
    // Plant and department heads only see their own part of the organization
    const scope = await this.dataScope.resolve(user, tenantId, RoleGroups.REPORT_VIEWERS);
    if (filters.orgNodeId) {
      const node = await this.prisma.orgNode.findFirst({ where: { id: filters.orgNodeId, tenantId }, select: { id: true } });
      if (!node) throw new BadRequestException(`Org node '${filters.orgNodeId}' not found`);
      await this.dataScope.assertNodeVisible(tenantId, filters.orgNodeId, scope);
    }
    const { rows, total, summary } = await register.load({ prisma: this.prisma, metrics: this.metrics, tenantId, scope }, filters, limit);

    if (format === 'json') {
      return { register: register.key, title: register.title, columns: register.columns, rows, total, truncated: total > rows.length, summary: summary ?? null };
    }
    // Previews are part of every plan; file exports are a plan feature
    if (!this.exportAllowed(user)) {
      throw new ForbiddenException("PLAN_FEATURE_REQUIRED: REPORTS_EXPORT is not included in your organization's plan. Contact your administrator to upgrade.");
    }
    if (total > limit) {
      throw new BadRequestException(
        `${total} rows match; ${format.toUpperCase()} exports are limited to ${limit}. Narrow the filters${format === 'pdf' ? ' or export to Excel' : ''}.`,
      );
    }

    const [tenant, actor] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      this.prisma.user.findFirst({ where: { id: user.userId }, select: { firstName: true, lastName: true } }),
    ]);
    const meta: ReportMeta = {
      title: register.title,
      organization: tenant?.name ?? '',
      generatedBy: actor ? `${actor.firstName} ${actor.lastName}` : user.email,
      generatedAt: new Date(),
      filters: this.describeFilters(filters),
      summary: summary?.map((s) => `${s.label}: ${s.value}`),
    };
    const file =
      format === 'csv' ? toCsv(register.columns, rows) : format === 'xlsx' ? toXlsx(meta, register.columns, rows) : await toPdf(meta, register.columns, rows);

    // Data leaving the system is part of the audit trail
    await this.activity.record({
      tenantId,
      actorId: user.userId,
      actorEmail: user.email,
      action: 'EXPORT_REPORT',
      entityType: 'Report',
      entityId: register.key,
      outcome: 'SUCCESS',
      statusCode: 200,
      summary: `Exported ${register.title} as ${format.toUpperCase()} (${rows.length} rows)`,
      changes: { format, rows: rows.length, filters: meta.filters },
      ...requestMeta(req),
    });

    const filename = `${register.key}-${meta.generatedAt.toISOString().slice(0, 10)}.${format}`;
    return new StreamableFile(file, {
      type: CONTENT_TYPES[format as keyof typeof CONTENT_TYPES],
      disposition: `attachment; filename="${filename}"`,
      length: file.length,
    });
  }

  private parseFilters(q: Record<string, string | undefined>): ReportFilters {
    const date = (value: string | undefined, endOfDay: boolean) => {
      if (!value) return undefined;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid date '${value}'`);
      // A bare date means the whole day
      if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) d.setUTCHours(23, 59, 59, 999);
      return d;
    };
    const filters: ReportFilters = {
      from: date(q.from, false),
      to: date(q.to, true),
      locationId: q.locationId || undefined,
      orgNodeId: q.orgNodeId || undefined,
      status: q.status || undefined,
      severity: q.severity || undefined,
      category: q.category || undefined,
      assigneeId: q.assigneeId || undefined,
      overdueOnly: q.overdueOnly === 'true',
      repeatOnly: q.repeatOnly === 'true',
      auditorId: q.auditorId || undefined,
      source: q.source ? q.source.toUpperCase() : undefined,
      actionType: q.actionType ? q.actionType.toUpperCase() : undefined,
    };
    if (filters.from && filters.to && filters.from > filters.to) throw new BadRequestException('"from" must be before "to"');
    if (filters.source && !ACTION_SOURCES.includes(filters.source)) {
      throw new BadRequestException(`source must be one of ${ACTION_SOURCES.join(', ')}`);
    }
    if (filters.actionType && !values('ACTION_TYPES').includes(filters.actionType)) {
      throw new BadRequestException(`actionType must be one of ${values('ACTION_TYPES').join(', ')}`);
    }
    return filters;
  }

  private describeFilters(f: ReportFilters): string[] {
    const out: string[] = [];
    if (f.from) out.push(`From ${f.from.toISOString().slice(0, 10)}`);
    if (f.to) out.push(`To ${f.to.toISOString().slice(0, 10)}`);
    if (f.status) out.push(`Status ${f.status}`);
    if (f.severity) out.push(`Severity ${f.severity}`);
    if (f.category) out.push(`Category ${f.category}`);
    if (f.locationId) out.push('Single location');
    if (f.orgNodeId) out.push('Organization unit');
    if (f.assigneeId) out.push('Single assignee');
    if (f.overdueOnly) out.push('Overdue only');
    if (f.repeatOnly) out.push('Repeat observations only');
    if (f.auditorId) out.push('Single auditor');
    if (f.source) out.push(`Source ${f.source}`);
    if (f.actionType) out.push(`Action type ${f.actionType}`);
    return out;
  }
}

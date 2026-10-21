import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { ActivityLogService } from '../../core/activity/activity-log.service';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId } from '../../core/auth/current-user.decorator';

const MAX_PAGE_SIZE = 200;

@ApiTags('Activity Trail')
@ApiBearerAuth()
@Controller('api/v1/activity-logs')
@Roles(...RoleGroups.AUDIT_TRAIL_VIEWERS)
export class ActivityLogsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Search the activity trail (newest first)' })
  async list(
    @TenantId() tenantId: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('outcome') outcome?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || 50));
    const createdAt: Prisma.DateTimeFilter = {};
    for (const [key, value] of [['gte', from], ['lte', to]] as const) {
      if (!value) continue;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid date '${value}'`);
      createdAt[key] = d;
    }
    const where: Prisma.ActivityLogWhereInput = {
      chainKey: tenantId,
      ...(actorId ? { actorId } : {}),
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(outcome ? { outcome } : {}),
      ...(from || to ? { createdAt } : {}),
      ...(q
        ? {
            OR: [
              { summary: { contains: q, mode: 'insensitive' } },
              { actorEmail: { contains: q, mode: 'insensitive' } },
              { entityId: { contains: q } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.findMany({
        where,
        orderBy: { sequence: 'desc' },
        skip: (p - 1) * size,
        take: size,
        select: {
          id: true,
          sequence: true,
          createdAt: true,
          actorId: true,
          actorEmail: true,
          action: true,
          entityType: true,
          entityId: true,
          outcome: true,
          statusCode: true,
          summary: true,
          changes: true,
          ipAddress: true,
          userAgent: true,
        },
      }),
    ]);
    return {
      items: items.map((i) => ({ ...i, changes: i.changes ? JSON.parse(i.changes) : null })),
      total,
      page: p,
      pageSize: size,
    };
  }

  @Get('filters')
  @ApiOperation({ summary: 'Distinct actions and entity types present in the trail, for filter menus' })
  async filters(@TenantId() tenantId: string) {
    const [actions, entityTypes] = await Promise.all([
      this.prisma.activityLog.findMany({ where: { chainKey: tenantId }, distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
      this.prisma.activityLog.findMany({
        where: { chainKey: tenantId, entityType: { not: null } },
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      }),
    ]);
    return { actions: actions.map((a) => a.action), entityTypes: entityTypes.map((e) => e.entityType as string) };
  }

  @Get('verify')
  @ApiOperation({ summary: 'Verify the tamper-evident hash chain of this organization\'s activity trail' })
  verify(@TenantId() tenantId: string) {
    return this.activity.verify(tenantId);
  }
}

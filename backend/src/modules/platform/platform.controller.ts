import { Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../core/database/prisma.service';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId } from '../../core/auth/current-user.decorator';
import { SubscriptionService } from '../../core/subscription/subscription.service';
import { FEATURE_LABELS, FEATURES, parseFeatures, PLATFORM_CURRENCY, subscriptionState } from '../../core/subscription/plans';
import { CreatePlanDto, UpdatePlanDto, UpdateTenantSubscriptionDto } from './dto/platform.dto';

const DAY_MS = 86400000;
const planView = <T extends { features: string }>(p: T) => ({ ...p, features: parseFeatures(p.features) });

/** The organization's own plan, limits and usage. */
@ApiTags('Subscription')
@ApiBearerAuth()
@Controller('api/v1/subscription')
export class SubscriptionController {
  constructor(private readonly subscription: SubscriptionService) {}

  @Get()
  @Roles(...RoleGroups.ORG_ADMINS)
  @ApiOperation({ summary: 'Plan, trial / paid-through dates, usage against limits and included features' })
  get(@TenantId() tenantId: string) {
    return this.subscription.summary(tenantId);
  }
}

/** SaaS operator console (platform super administrators only). */
@ApiTags('Platform Administration')
@ApiBearerAuth()
@Controller('api/v1/platform')
@Roles('SUPER_ADMIN')
export class PlatformController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Plan catalogue with tenant counts' })
  async plans() {
    const plans = await this.prisma.plan.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { tenants: true } } } });
    return { features: FEATURES.map((code) => ({ code, label: FEATURE_LABELS[code] })), plans: plans.map(planView) };
  }

  @Post('plans')
  @ApiOperation({ summary: 'Create a plan' })
  async createPlan(@Body() dto: CreatePlanDto) {
    if (await this.prisma.plan.findUnique({ where: { code: dto.code } })) throw new ConflictException(`Plan ${dto.code} already exists`);
    return planView(await this.prisma.plan.create({ data: { ...dto, currency: PLATFORM_CURRENCY, features: JSON.stringify(dto.features) } }));
  }

  @Patch('plans/:code')
  @ApiOperation({ summary: 'Update a plan (limits apply immediately to subscribed tenants)' })
  async updatePlan(@Param('code') code: string, @Body() dto: UpdatePlanDto) {
    const plan = await this.prisma.plan.findUnique({ where: { code } });
    if (!plan) throw new NotFoundException(`Plan ${code} not found`);
    const { features, ...rest } = dto;
    return planView(await this.prisma.plan.update({ where: { code }, data: { ...rest, currency: PLATFORM_CURRENCY, ...(features ? { features: JSON.stringify(features) } : {}) } }));
  }

  @Patch('tenants/:id/subscription')
  @ApiOperation({ summary: 'Assign plan, status, trial end and paid-through date for a tenant' })
  async updateTenantSubscription(@Param('id') id: string, @Body() dto: UpdateTenantSubscriptionDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant '${id}' not found`);
    let planData: { planId?: string; storageQuotaMb?: number } = {};
    if (dto.planCode) {
      const plan = await this.prisma.plan.findUnique({ where: { code: dto.planCode } });
      if (!plan || !plan.isActive) throw new NotFoundException(`Active plan ${dto.planCode} not found`);
      planData = { planId: plan.id, storageQuotaMb: plan.storageQuotaMb };
    }
    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...planData,
        ...(dto.storageQuotaMb !== undefined ? { storageQuotaMb: dto.storageQuotaMb } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.trialEndsAt !== undefined ? { trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : null } : {}),
        ...(dto.currentPeriodEnd !== undefined ? { currentPeriodEnd: dto.currentPeriodEnd ? new Date(dto.currentPeriodEnd) : null } : {}),
        ...(dto.billingEmail !== undefined ? { billingEmail: dto.billingEmail } : {}),
      },
      include: { plan: true },
    });
    return {
      id: updated.id,
      name: updated.name,
      status: updated.status,
      plan: updated.plan ? planView(updated.plan) : null,
      trialEndsAt: updated.trialEndsAt,
      currentPeriodEnd: updated.currentPeriodEnd,
      storageQuotaMb: updated.storageQuotaMb,
      billingEmail: updated.billingEmail,
      ...subscriptionState(updated),
    };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'SaaS metrics: tenants by status / plan, list-price MRR of active organizations, trials ending, activity, storage, churn risk' })
  async metrics() {
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const tenants = await this.prisma.tenant.findMany({
      select: {
        id: true, name: true, slug: true, status: true, trialEndsAt: true, currentPeriodEnd: true, storageQuotaMb: true, createdAt: true,
        plan: { select: { code: true, name: true, priceMonthly: true, currency: true, features: true, maxUsers: true, maxLocations: true } },
      },
    });
    const [users, activeUsers, audits, locations, storage] = await Promise.all([
      this.prisma.user.groupBy({ by: ['tenantId'], where: { status: { not: 'INACTIVE' } }, _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['tenantId'], where: { lastLoginAt: { gte: since30 } }, _count: { _all: true } }),
      this.prisma.auditExecution.groupBy({ by: ['tenantId'], where: { startedAt: { gte: since30 } }, _count: { _all: true } }),
      this.prisma.location.groupBy({ by: ['tenantId'], _count: { _all: true } }),
      this.prisma.storedFile.groupBy({ by: ['tenantId'], _sum: { sizeBytes: true } }),
    ]);
    const count = (rows: Array<{ tenantId: string; _count: { _all: number } }>) => new Map(rows.map((r) => [r.tenantId, r._count._all]));
    const userMap = count(users);
    const activeMap = count(activeUsers);
    const auditMap = count(audits);
    const locationMap = count(locations);
    const storageMap = new Map(storage.map((s) => [s.tenantId, s._sum.sizeBytes ?? 0]));

    const rows = tenants.map((t) => {
      const state = subscriptionState(t, now);
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        plan: t.plan?.code ?? null,
        readOnly: state.readOnly,
        readOnlyReason: state.readOnlyReason,
        trialEndsAt: t.trialEndsAt,
        currentPeriodEnd: t.currentPeriodEnd,
        users: userMap.get(t.id) ?? 0,
        activeUsers30d: activeMap.get(t.id) ?? 0,
        audits30d: auditMap.get(t.id) ?? 0,
        locations: locationMap.get(t.id) ?? 0,
        storageMb: Math.round(((storageMap.get(t.id) ?? 0) / 1048576) * 10) / 10,
        storageQuotaMb: t.storageQuotaMb,
        // List price of ACTIVE, not lapsed organizations. There is no payment gateway, so this is not
        // collected revenue: paid-through dates are only what platform administrators enter.
        mrr: t.status === 'ACTIVE' && !state.readOnly ? t.plan?.priceMonthly ?? 0 : 0,
        currency: t.plan?.currency ?? null,
        churnRisk: (t.status === 'ACTIVE' || t.status === 'TRIAL') && (activeMap.get(t.id) ?? 0) === 0,
        createdAt: t.createdAt,
      };
    });
    const byStatus: Record<string, number> = {};
    const byPlan: Record<string, number> = {};
    rows.forEach((r) => {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      byPlan[r.plan ?? 'NONE'] = (byPlan[r.plan ?? 'NONE'] ?? 0) + 1;
    });
    return {
      generatedAt: now,
      totals: {
        tenants: rows.length,
        mrr: rows.reduce((s, r) => s + r.mrr, 0),
        // Plans may be priced in different currencies; amounts are only summed within one currency
        mrrByCurrency: rows.reduce<Record<string, number>>((acc, r) => {
          if (r.mrr > 0 && r.currency) acc[r.currency] = (acc[r.currency] ?? 0) + r.mrr;
          return acc;
        }, {}),
        storageQuotaMb: rows.reduce((s, r) => s + r.storageQuotaMb, 0),
        users: rows.reduce((s, r) => s + r.users, 0),
        activeUsers30d: rows.reduce((s, r) => s + r.activeUsers30d, 0),
        audits30d: rows.reduce((s, r) => s + r.audits30d, 0),
        storageMb: Math.round(rows.reduce((s, r) => s + r.storageMb, 0) * 10) / 10,
      },
      byStatus,
      byPlan,
      trialsEndingIn14Days: rows
        .filter((r) => r.status === 'TRIAL' && r.trialEndsAt && r.trialEndsAt >= now && r.trialEndsAt.getTime() - now.getTime() <= 14 * DAY_MS)
        .map((r) => ({ id: r.id, name: r.name, trialEndsAt: r.trialEndsAt })),
      readOnlyTenants: rows.filter((r) => r.readOnly).map((r) => ({ id: r.id, name: r.name, reason: r.readOnlyReason })),
      churnRisk: rows.filter((r) => r.churnRisk).map((r) => ({ id: r.id, name: r.name, users: r.users })),
      tenants: rows,
    };
  }
}

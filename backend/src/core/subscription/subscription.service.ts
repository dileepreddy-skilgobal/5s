import { ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DEFAULT_PLANS, FEATURE_LABELS, FEATURES, LEGACY_USD_DEFAULT_PRICES, parseFeatures, PLATFORM_CURRENCY, subscriptionState } from './plans';

type Db = PrismaService | Prisma.TransactionClient;
const DAY_MS = 86400000;

/** Plan limits, usage and the subscription summary shown to organization administrators. */
@Injectable()
export class SubscriptionService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Creates the default catalogue on first start and grandfathers tenants that predate plans. */
  async onModuleInit() {
    if ((await this.prisma.plan.count()) === 0) {
      for (const p of DEFAULT_PLANS) {
        await this.prisma.plan.create({ data: { ...p, currency: PLATFORM_CURRENCY, features: JSON.stringify(p.features) } });
      }
      this.logger.log(`Created default plans: ${DEFAULT_PLANS.map((p) => p.code).join(', ')}`);
    }
    await this.convertPlansToRupees();
    const enterprise = await this.prisma.plan.findUnique({ where: { code: 'ENTERPRISE' }, select: { id: true } });
    if (enterprise) {
      const { count } = await this.prisma.tenant.updateMany({ where: { planId: null }, data: { planId: enterprise.id } });
      if (count) this.logger.log(`Assigned the Enterprise plan to ${count} existing tenant(s) (grandfathered).`);
    }
  }

  /**
   * Plans created before the platform moved to a single currency are converted to rupees: the default plans
   * still at their old dollar list price get the rupee list price; any other plan keeps its amount, now in
   * rupees, and is logged so a platform administrator can review the price.
   */
  private async convertPlansToRupees() {
    const foreign = await this.prisma.plan.findMany({ where: { currency: { not: PLATFORM_CURRENCY } } });
    for (const plan of foreign) {
      const defaults = DEFAULT_PLANS.find((p) => p.code === plan.code);
      const rupeePrice = defaults && LEGACY_USD_DEFAULT_PRICES[plan.code] === plan.priceMonthly ? defaults.priceMonthly : null;
      await this.prisma.plan.update({
        where: { id: plan.id },
        data: { currency: PLATFORM_CURRENCY, ...(rupeePrice !== null ? { priceMonthly: rupeePrice } : {}) },
      });
      if (rupeePrice !== null) this.logger.log(`Plan ${plan.code}: list price set to ₹${rupeePrice} per month.`);
      else this.logger.warn(`Plan ${plan.code} was priced in ${plan.currency}; it is now ₹${plan.priceMonthly} per month. Review the price in the platform console.`);
    }
  }

  /** Default plan + trial for a newly created organization. */
  async trialDefaults(): Promise<{ status: string; planId: string | null; trialEndsAt: Date; storageQuotaMb?: number }> {
    const code = process.env.DEFAULT_PLAN_CODE || 'PROFESSIONAL';
    const plan = await this.prisma.plan.findUnique({ where: { code } });
    const trialDays = Number(process.env.TRIAL_DAYS ?? 14);
    return {
      status: 'TRIAL',
      planId: plan?.id ?? null,
      trialEndsAt: new Date(Date.now() + trialDays * DAY_MS),
      ...(plan ? { storageQuotaMb: plan.storageQuotaMb } : {}),
    };
  }

  /** Throws when adding `adding` more users / locations would exceed the plan. */
  async assertWithinLimit(tenantId: string, kind: 'users' | 'locations', adding = 1, db: Db = this.prisma) {
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { plan: { select: { name: true, maxUsers: true, maxLocations: true } } } });
    const limit = kind === 'users' ? tenant?.plan?.maxUsers : tenant?.plan?.maxLocations;
    if (limit === null || limit === undefined) return;
    const current =
      kind === 'users'
        ? await db.user.count({ where: { tenantId, status: { not: 'INACTIVE' } } })
        : await db.location.count({ where: { tenantId } });
    if (current + adding > limit) {
      throw new ForbiddenException(
        `PLAN_LIMIT_REACHED: The ${tenant?.plan?.name} plan allows ${limit} ${kind}; you have ${current}. Contact your administrator to upgrade.`,
      );
    }
  }

  async summary(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true, status: true, trialEndsAt: true, currentPeriodEnd: true, billingEmail: true, storageQuotaMb: true,
        plan: { select: { code: true, name: true, description: true, priceMonthly: true, currency: true, maxUsers: true, maxLocations: true, storageQuotaMb: true, features: true, sortOrder: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Organization not found');
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [users, locations, storage, auditsThisMonth, higherPlans] = await Promise.all([
      this.prisma.user.count({ where: { tenantId, status: { not: 'INACTIVE' } } }),
      this.prisma.location.count({ where: { tenantId } }),
      this.prisma.storedFile.aggregate({ where: { tenantId }, _sum: { sizeBytes: true } }),
      this.prisma.auditExecution.count({ where: { tenantId, startedAt: { gte: monthStart } } }),
      // A plan further up the catalogue that could be moved to (none when already on the top plan)
      tenant.plan ? this.prisma.plan.count({ where: { isActive: true, sortOrder: { gt: tenant.plan.sortOrder } } }) : Promise.resolve(0),
    ]);
    const state = subscriptionState({ status: tenant.status, trialEndsAt: tenant.trialEndsAt, currentPeriodEnd: tenant.currentPeriodEnd, plan: tenant.plan });
    const features = tenant.plan ? parseFeatures(tenant.plan.features) : [...FEATURES];
    const daysLeft = (d: Date | null) => (d ? Math.ceil((d.getTime() - Date.now()) / DAY_MS) : null);
    return {
      organization: tenant.name,
      status: tenant.status,
      plan: tenant.plan ? { ...tenant.plan, features } : null,
      upgradeAvailable: higherPlans > 0,
      trialEndsAt: tenant.trialEndsAt,
      trialDaysLeft: tenant.status === 'TRIAL' ? daysLeft(tenant.trialEndsAt) : null,
      currentPeriodEnd: tenant.currentPeriodEnd,
      billingEmail: tenant.billingEmail,
      readOnly: state.readOnly,
      readOnlyReason: state.readOnlyReason,
      usage: {
        users: { used: users, limit: tenant.plan?.maxUsers ?? null },
        locations: { used: locations, limit: tenant.plan?.maxLocations ?? null },
        storageMb: { used: Math.round(((storage._sum.sizeBytes ?? 0) / 1048576) * 10) / 10, limit: tenant.storageQuotaMb },
        auditsThisMonth,
      },
      features: FEATURES.map((code) => ({ code, label: FEATURE_LABELS[code], included: features.includes(code) })),
    };
  }
}

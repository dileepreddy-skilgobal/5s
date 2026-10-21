import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { withJobLease } from '../../core/database/job-lease';
import { AuditSchedulesService } from './audit-schedules.service';

/**
 * Background generation of recurring audits (BRD 22: "Recurring schedules shall automatically create audits").
 *
 * Every SCHEDULE_GENERATION_MINUTES (default 60; 0 disables) each active tenant's active schedules create
 * their next cycles once the planned date is within the schedule's lead time. A job lease makes sure only one
 * API instance generates at a time; generation itself is idempotent per schedule, location and day.
 */
@Injectable()
export class ScheduleGenerationScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleGenerationScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: AuditSchedulesService,
  ) {}

  onApplicationBootstrap() {
    const minutes = Number(process.env.SCHEDULE_GENERATION_MINUTES ?? 60);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      this.logger.log('Audit schedule generation disabled (SCHEDULE_GENERATION_MINUTES=0).');
      return;
    }
    this.timer = setInterval(() => void this.runOnce(), minutes * 60000);
    // First pass shortly after start-up, once the app is serving requests
    setTimeout(() => void this.runOnce(), 20000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One generation pass across all active tenants. Safe to call concurrently and from several instances. */
  async runOnce(now = new Date()): Promise<{ skipped: boolean; createdCount: number }> {
    if (this.running) return { skipped: true, createdCount: 0 };
    this.running = true;
    try {
      const result = await withJobLease(this.prisma, 'audit-schedule-generator', 15 * 60000, async () => {
        let created = 0;
        const tenants = await this.prisma.tenant.findMany({ where: { status: { in: ['ACTIVE', 'TRIAL'] } }, select: { id: true } });
        for (const t of tenants) {
          try {
            const pass = await this.schedules.generateDueSchedules(t.id, now);
            created += pass.createdCount;
            for (const f of pass.failures) {
              this.logger.warn(`Schedule ${f.scheduleId} of tenant ${t.id} was not generated: ${f.message}`);
            }
          } catch (err) {
            this.logger.error(`Schedule generation failed for tenant ${t.id}: ${(err as Error).message}`);
          }
        }
        if (created) this.logger.log(`Schedule generator created ${created} audit(s).`);
        return { skipped: false, createdCount: created };
      });
      return result ?? { skipped: true, createdCount: 0 };
    } catch (err) {
      this.logger.error(`Schedule generation run failed: ${(err as Error).message}`);
      return { skipped: true, createdCount: 0 };
    } finally {
      this.running = false;
    }
  }
}

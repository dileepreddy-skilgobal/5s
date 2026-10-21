import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantSettingsService } from '../config/tenant-settings.service';
import { EscalationStep, TenantSettings, localDayAndHour } from '../config/tenant-settings';
import { WebhooksService } from '../integrations/webhooks.service';
import { NotificationsService } from './notifications.service';
import { withJobLease } from '../database/job-lease';
import { displayDate, plural } from './notification-text';

const DAY_MS = 86400000;
const OPEN_ACTION_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'REOPENED', 'PENDING_VERIFICATION'];
/** Statuses in which the assignee still has to act: reminders and escalation stop once the fix is submitted for verification. */
const ASSIGNEE_ACTION_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'REOPENED'];
/** Red tags still waiting for a decision or for the decided disposition to be carried out. */
const OPEN_RED_TAG_STATUSES = ['RED_TAGGED', 'IN_HOLDING_AREA', 'PENDING_DISPOSITION', 'DISPOSITION_APPROVED'];
const CLOSED_OBSERVATION_STATUSES = ['RESOLVED', 'CLOSED'];
/** Critical observations raised within this window are escalated (older ones were handled before this scan existed). */
const CRITICAL_OBSERVATION_WINDOW_DAYS = 3;
/** Certificates are flagged this many days before they expire (BRD §61 "certification expiry"). */
const CERTIFICATE_WARNING_DAYS = 30;
/** Lead time for "audit due soon" when the audit was not generated from a schedule. */
const DEFAULT_AUDIT_LEAD_DAYS = 2;
/** Leadership roles that receive the consolidated manager digest, scoped to their role assignment's org node. */
const MANAGER_DIGEST_ROLES = ['PLANT_HEAD', 'DEPT_HEAD', 'COORDINATOR_5S', 'EXECUTIVE'];
/** Highest escalation tier stored on an action; further steps keep this tier. */
const MAX_ESCALATION_LEVEL = 3;

const describeOffset = (days: number) =>
  days < 0 ? `due in ${plural(-days, 'day')}` : days === 0 ? 'due today' : `${plural(days, 'day')} overdue`;


/**
 * Escalation tier for the latest ladder step reached: reminders before or on the due date are DUE_SOON, each overdue
 * step up the ladder is the next level (with the BRD ladder: +2 days ESCALATED_L1, +5 ESCALATED_L2, +10 ESCALATED_L3).
 */
export function escalationTierFor(step: EscalationStep | undefined, steps: readonly EscalationStep[]): string {
  if (!step) return 'NORMAL';
  if (step.offsetDays <= 0) return 'DUE_SOON';
  const overdueSteps = steps.filter((s) => s.offsetDays > 0).sort((a, b) => a.offsetDays - b.offsetDays);
  const level = overdueSteps.findIndex((s) => s.offsetDays === step.offsetDays) + 1;
  return `ESCALATED_L${Math.min(Math.max(level, 1), MAX_ESCALATION_LEVEL)}`;
}

/** What one tenant scan did; returned by "Run reminders now". */
export interface TenantScanSummary {
  notificationsCreated: number;
  /** Notifications created per check (only checks that created some are listed). */
  byCheck: Record<string, number>;
  /** Corrective actions whose escalation tier changed. */
  escalationTiersUpdated: number;
  /** Corrective actions that became overdue in this scan (each queued one `action.overdue` webhook event). */
  actionsBecameOverdue: number;
  /** Whether the daily digests were due in this scan (the configured hour has passed in the organization's time zone). */
  digestWindowOpen: boolean;
}

interface LocationScope {
  name: string;
  ownerId: string | null;
  backupOwnerId: string | null;
  orgNode: { path: string } | null;
}

const recipientLocation = (l: LocationScope) => ({ ownerId: l.ownerId, backupOwnerId: l.backupOwnerId, orgNodePath: l.orgNode?.path ?? null });

/**
 * Periodic background work: corrective-action reminders and escalation (BRD T-2 / due / +2 / +5 /
 * +10 matrix, configurable per tenant), overdue and upcoming scheduled audits, critical observations,
 * red-tag ageing, expiring auditor certificates, trial reminders, and the daily digests.
 *
 * Runs every NOTIFICATION_SCAN_MINUTES (default 15; 0 disables). A job lease makes sure only one API
 * instance scans at a time; notification dedupe keys make every reminder idempotent (one per record,
 * event and due date), so re-running a scan never sends anything twice.
 */
@Injectable()
export class EscalationScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EscalationScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: TenantSettingsService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
  ) {}

  onApplicationBootstrap() {
    const minutes = Number(process.env.NOTIFICATION_SCAN_MINUTES ?? 15);
    if (!minutes || minutes <= 0) {
      this.logger.log('Notification scheduler disabled (NOTIFICATION_SCAN_MINUTES=0).');
      return;
    }
    this.timer = setInterval(() => void this.runOnce(), minutes * 60000);
    // First pass shortly after start-up, once the app is serving requests
    setTimeout(() => void this.runOnce(), 10000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One scan across all active tenants. Safe to call concurrently and from several instances. */
  async runOnce(now = new Date()): Promise<{ skipped: boolean; notificationsCreated: number }> {
    if (this.running) return { skipped: true, notificationsCreated: 0 };
    this.running = true;
    try {
      const result = await withJobLease(this.prisma, 'notification-scheduler', 10 * 60000, async () => {
        let created = 0;
        const tenants = await this.prisma.tenant.findMany({ where: { status: { in: ['ACTIVE', 'TRIAL'] } }, select: { id: true } });
        for (const t of tenants) {
          try {
            created += await this.scanTenant(t.id, now);
          } catch (err) {
            this.logger.error(`Scan failed for tenant ${t.id}: ${(err as Error).message}`);
          }
        }
        if (created) this.logger.log(`Scheduler created ${created} notification(s).`);
        return { skipped: false, notificationsCreated: created };
      });
      return result ?? { skipped: true, notificationsCreated: 0 };
    } catch (err) {
      this.logger.error(`Scheduler run failed: ${(err as Error).message}`);
      return { skipped: true, notificationsCreated: 0 };
    } finally {
      this.running = false;
    }
  }

  /** One scan of one tenant; returns the number of notifications created. */
  async scanTenant(tenantId: string, now: Date): Promise<number> {
    return (await this.scanTenantWithSummary(tenantId, now)).notificationsCreated;
  }

  /** One scan of one tenant, reporting what each check did (used by "Run reminders now"). */
  async scanTenantWithSummary(tenantId: string, now: Date): Promise<TenantScanSummary> {
    const settings = await this.settings.get(tenantId);
    const summary: TenantScanSummary = { notificationsCreated: 0, byCheck: {}, escalationTiersUpdated: 0, actionsBecameOverdue: 0, digestWindowOpen: false };
    const record = (check: string, created: number) => {
      if (!created) return;
      summary.notificationsCreated += created;
      summary.byCheck[check] = (summary.byCheck[check] ?? 0) + created;
    };

    record('actionEscalation', await this.escalateActions(tenantId, settings, now, summary));
    record('auditOverdue', await this.overdueAudits(tenantId, settings, now));
    record('auditDueSoon', await this.auditsDueSoon(tenantId, now));
    record('criticalObservation', await this.criticalObservations(tenantId, now));
    record('redTagAgeing', await this.ageingRedTags(tenantId, now));
    record('certificateExpiring', await this.expiringCertificates(tenantId, now));
    record('trialEnding', await this.trialEnding(tenantId, now));

    // ---- Daily digests (once per user per local day, from the configured hour in the organization's time zone) ----
    const { day, hour } = localDayAndHour(now, settings.escalation.timeZone);
    summary.digestWindowOpen = hour >= settings.escalation.digestHour;
    if (summary.digestWindowOpen) {
      if (settings.escalation.dailyDigest) record('dailyDigest', await this.sendDigest(tenantId, now, day));
      if (settings.escalation.managerDigest) record('managerDigest', await this.sendManagerDigest(tenantId, now, day));
    }
    return summary;
  }

  // ---------------------------------------------------------------------------
  // Corrective actions: reminders, escalation ladder, tier and overdue flag
  // ---------------------------------------------------------------------------

  private async escalateActions(tenantId: string, settings: TenantSettings, now: Date, summary: TenantScanSummary): Promise<number> {
    let created = 0;
    const steps = [...settings.escalation.actionSteps].sort((a, b) => a.offsetDays - b.offsetDays);
    // Before the first reminder window an action is NORMAL (a re-planned due date also lands here)
    const windowStart = steps.length ? new Date(now.getTime() - steps[0].offsetDays * DAY_MS) : null;
    const reset = await this.prisma.correctiveAction.updateMany({
      where: {
        tenantId,
        status: { in: ASSIGNEE_ACTION_STATUSES },
        escalationTier: { not: 'NORMAL' },
        ...(windowStart ? { targetDate: { gt: windowStart } } : {}),
      },
      data: { escalationTier: 'NORMAL' },
    });
    summary.escalationTiersUpdated += reset.count;
    // The stored overdue flag follows the assignee's clock: cleared once the fix is submitted or the due date moves out
    await this.prisma.correctiveAction.updateMany({
      where: { tenantId, isOverdue: true, OR: [{ status: { notIn: ASSIGNEE_ACTION_STATUSES } }, { targetDate: { gte: now } }] },
      data: { isOverdue: false },
    });
    await this.flagNewlyOverdue(tenantId, settings, now, summary);
    if (!windowStart) return 0;

    const actions = await this.prisma.correctiveAction.findMany({
      where: {
        tenantId,
        status: { in: ASSIGNEE_ACTION_STATUSES },
        // Only actions already inside the first reminder window
        targetDate: { lte: windowStart },
      },
      select: {
        id: true,
        actionCode: true,
        title: true,
        targetDate: true,
        assigneeId: true,
        escalationTier: true,
        observation: { select: { execution: { select: { auditorId: true } } } },
        location: { select: { name: true, ownerId: true, backupOwnerId: true, orgNode: { select: { path: true } } } },
      },
    });
    for (const a of actions) {
      const daysPastDue = Math.floor((now.getTime() - a.targetDate.getTime()) / DAY_MS);
      // The latest step that applies; earlier steps missed while the scheduler was down are not replayed
      const step = [...steps].reverse().find((s) => daysPastDue >= s.offsetDays);
      if (!step) continue;

      const tier = escalationTierFor(step, steps);
      if (a.escalationTier !== tier) {
        await this.prisma.correctiveAction.updateMany({ where: { id: a.id, tenantId }, data: { escalationTier: tier } });
        summary.escalationTiersUpdated++;
      }

      const userIds = await this.notifications.resolveRecipients(
        { tenantId, assigneeId: a.assigneeId, auditorId: a.observation?.execution?.auditorId ?? null, location: recipientLocation(a.location) },
        step.notify,
      );
      const type = step.offsetDays < 0 ? 'ACTION_DUE_SOON' : step.offsetDays === 0 ? 'ACTION_DUE' : 'ACTION_OVERDUE';
      created += await this.notifications.notify({
        tenantId,
        userIds,
        type,
        title: `${a.actionCode} is ${describeOffset(daysPastDue)}`,
        body: `Corrective action "${a.title}" at ${a.location.name} was due ${displayDate(a.targetDate)}.`,
        entityType: 'CorrectiveAction',
        entityId: a.id,
        link: `/capa?id=${a.id}`,
        // Re-planning the target date re-arms the reminders
        dedupeKey: `action:${a.id}:${a.targetDate.toISOString()}:step:${step.offsetDays}`,
      });
    }
    return created;
  }

  /**
   * Sets the stored overdue flag on actions whose assignee has passed the due date and queues one `action.overdue`
   * webhook event per action and due date (the flag is cleared again when the due date is re-planned).
   */
  private async flagNewlyOverdue(tenantId: string, settings: TenantSettings, now: Date, summary: TenantScanSummary) {
    const steps = [...settings.escalation.actionSteps].sort((a, b) => a.offsetDays - b.offsetDays);
    const late = await this.prisma.correctiveAction.findMany({
      where: { tenantId, status: { in: ASSIGNEE_ACTION_STATUSES }, isOverdue: false, targetDate: { lt: now } },
      select: { id: true, actionCode: true, title: true, targetDate: true, assigneeId: true, locationId: true },
    });
    for (const a of late) {
      // Conditional update: only the instance that flips the flag emits the event
      const flipped = await this.prisma.correctiveAction.updateMany({ where: { id: a.id, tenantId, isOverdue: false }, data: { isOverdue: true } });
      if (flipped.count !== 1) continue;
      summary.actionsBecameOverdue++;
      const daysOverdue = Math.floor((now.getTime() - a.targetDate.getTime()) / DAY_MS);
      await this.webhooks.emit(tenantId, 'action.overdue', {
        id: a.id,
        actionCode: a.actionCode,
        title: a.title,
        targetDate: a.targetDate.toISOString(),
        daysOverdue,
        assigneeId: a.assigneeId,
        locationId: a.locationId,
        escalationTier: escalationTierFor([...steps].reverse().find((s) => daysOverdue >= s.offsetDays), steps),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Scheduled audits
  // ---------------------------------------------------------------------------

  private async overdueAudits(tenantId: string, settings: TenantSettings, now: Date): Promise<number> {
    let created = 0;
    const overdue = await this.prisma.scheduledAuditInstance.findMany({
      where: { tenantId, status: { in: ['SCHEDULED', 'OVERDUE'] }, dueDate: { lt: now } },
      select: {
        id: true,
        auditCode: true,
        dueDate: true,
        status: true,
        auditorId: true,
        location: { select: { name: true, ownerId: true, backupOwnerId: true, orgNode: { select: { path: true } } } },
      },
    });
    const toMark = overdue.filter((i) => i.status === 'SCHEDULED').map((i) => i.id);
    if (toMark.length) {
      await this.prisma.scheduledAuditInstance.updateMany({ where: { id: { in: toMark }, status: 'SCHEDULED' }, data: { status: 'OVERDUE' } });
    }
    for (const i of overdue) {
      const userIds = await this.notifications.resolveRecipients({ tenantId, auditorId: i.auditorId, location: recipientLocation(i.location) }, settings.escalation.overdueAuditNotify);
      created += await this.notifications.notify({
        tenantId,
        userIds,
        type: 'AUDIT_OVERDUE',
        title: `Audit ${i.auditCode} is overdue`,
        body: `The scheduled 5S audit of ${i.location.name} was due ${displayDate(i.dueDate)} and has not been completed.`,
        entityType: 'ScheduledAuditInstance',
        entityId: i.id,
        link: '/schedules',
        dedupeKey: `audit-overdue:${i.id}`,
      });
    }
    return created;
  }

  /** BRD §61 "audit due": the assigned auditor (or, while unassigned, the 5S coordinators) within the schedule's lead time. */
  private async auditsDueSoon(tenantId: string, now: Date): Promise<number> {
    let created = 0;
    // Lead times are at most a few weeks; the bound keeps the query small
    const horizon = new Date(now.getTime() + 60 * DAY_MS);
    const upcoming = await this.prisma.scheduledAuditInstance.findMany({
      where: { tenantId, status: 'SCHEDULED', dueDate: { gte: now }, plannedDate: { lte: horizon } },
      select: {
        id: true,
        auditCode: true,
        plannedDate: true,
        dueDate: true,
        auditorId: true,
        schedule: { select: { leadTimeDays: true } },
        location: { select: { name: true, ownerId: true, backupOwnerId: true, orgNode: { select: { path: true } } } },
      },
    });
    for (const i of upcoming) {
      const leadDays = i.schedule?.leadTimeDays ?? DEFAULT_AUDIT_LEAD_DAYS;
      if (i.plannedDate.getTime() - now.getTime() > leadDays * DAY_MS) continue;
      const userIds = await this.notifications.resolveRecipients(
        { tenantId, auditorId: i.auditorId, location: recipientLocation(i.location) },
        i.auditorId ? ['AUDITOR'] : ['COORDINATOR_5S'],
      );
      created += await this.notifications.notify({
        tenantId,
        userIds,
        type: 'AUDIT_DUE_SOON',
        title: `Audit ${i.auditCode} is coming up`,
        body: i.auditorId
          ? `The 5S audit of ${i.location.name} is planned for ${displayDate(i.plannedDate)} and due ${displayDate(i.dueDate)}.`
          : `The 5S audit of ${i.location.name} is planned for ${displayDate(i.plannedDate)} and has no auditor assigned yet.`,
        entityType: 'ScheduledAuditInstance',
        entityId: i.id,
        link: '/schedules',
        // A rescheduled audit gets a fresh reminder
        dedupeKey: `audit-due:${i.id}:${i.plannedDate.toISOString()}`,
      });
    }
    return created;
  }

  // ---------------------------------------------------------------------------
  // Observations, red tags, certificates, trial
  // ---------------------------------------------------------------------------

  /** BRULE-07: critical observations escalate straight to the area owner and the department head. */
  private async criticalObservations(tenantId: string, now: Date): Promise<number> {
    let created = 0;
    const critical = await this.prisma.observation.findMany({
      where: {
        tenantId,
        severity: 'CRITICAL',
        status: { notIn: CLOSED_OBSERVATION_STATUSES },
        createdAt: { gte: new Date(now.getTime() - CRITICAL_OBSERVATION_WINDOW_DAYS * DAY_MS) },
      },
      select: {
        id: true,
        observationCode: true,
        title: true,
        loggedById: true,
        location: { select: { name: true, ownerId: true, backupOwnerId: true, orgNode: { select: { path: true } } } },
      },
    });
    for (const o of critical) {
      const userIds = await this.notifications.resolveRecipients({ tenantId, location: recipientLocation(o.location) }, ['AREA_OWNER', 'DEPT_HEAD']);
      created += await this.notifications.notify({
        tenantId,
        userIds,
        excludeUserId: o.loggedById,
        type: 'OBSERVATION_CRITICAL',
        title: `Critical observation at ${o.location.name}`,
        body: `${o.observationCode}: ${o.title}`,
        entityType: 'Observation',
        entityId: o.id,
        link: `/observations?id=${o.id}`,
        dedupeKey: `observation-critical:${o.id}`,
      });
    }
    return created;
  }

  /** BRD §61 "red tag ageing": open tags past their target disposition date. */
  private async ageingRedTags(tenantId: string, now: Date): Promise<number> {
    let created = 0;
    const ageing = await this.prisma.redTag.findMany({
      where: { tenantId, status: { in: OPEN_RED_TAG_STATUSES }, targetDispositionDate: { lt: now } },
      select: {
        id: true,
        tagNumber: true,
        itemName: true,
        taggedById: true,
        targetDispositionDate: true,
        location: { select: { name: true, ownerId: true, backupOwnerId: true, orgNode: { select: { path: true } } } },
      },
    });
    for (const t of ageing) {
      if (!t.targetDispositionDate) continue;
      const daysLate = Math.max(1, Math.floor((now.getTime() - t.targetDispositionDate.getTime()) / DAY_MS));
      const roleRecipients = await this.notifications.resolveRecipients({ tenantId, location: recipientLocation(t.location) }, ['AREA_OWNER', 'DEPT_HEAD']);
      created += await this.notifications.notify({
        tenantId,
        userIds: [t.taggedById, ...roleRecipients],
        type: 'RED_TAG_OVERDUE',
        title: `Red tag ${t.tagNumber} is ${plural(daysLate, 'day')} past its decision date`,
        body: `"${t.itemName}" at ${t.location.name} was due for disposition on ${displayDate(t.targetDispositionDate)}.`,
        entityType: 'RedTag',
        entityId: t.id,
        link: `/red-tags?id=${t.id}`,
        // A new target date re-arms the reminder
        dedupeKey: `red-tag-ageing:${t.id}:${t.targetDispositionDate.toISOString()}`,
      });
    }
    return created;
  }

  /** BRD §61 "certification expiry": the holder is told 30 days ahead unless they already hold a later certificate. */
  private async expiringCertificates(tenantId: string, now: Date): Promise<number> {
    let created = 0;
    const warnUntil = new Date(now.getTime() + CERTIFICATE_WARNING_DAYS * DAY_MS);
    const expiring = await this.prisma.trainingCertificate.findMany({
      where: { tenantId, revokedAt: null, validUntil: { gt: now, lte: warnUntil } },
      select: { id: true, userId: true, credentialTitle: true, certificateCode: true, validUntil: true },
    });
    if (!expiring.length) return 0;
    const renewed = new Set(
      (
        await this.prisma.trainingCertificate.findMany({
          where: { tenantId, revokedAt: null, userId: { in: [...new Set(expiring.map((c) => c.userId))] }, validUntil: { gt: warnUntil } },
          select: { userId: true },
        })
      ).map((c) => c.userId),
    );
    for (const c of expiring) {
      if (renewed.has(c.userId)) continue;
      const daysLeft = Math.max(1, Math.ceil((c.validUntil.getTime() - now.getTime()) / DAY_MS));
      created += await this.notifications.notify({
        tenantId,
        userIds: [c.userId],
        type: 'CERTIFICATE_EXPIRING',
        title: `Your certificate expires in ${plural(daysLeft, 'day')}`,
        body: `${c.credentialTitle} (${c.certificateCode}) is valid until ${displayDate(c.validUntil)}. Retake the competency quiz to renew it.`,
        entityType: 'TrainingCertificate',
        entityId: c.id,
        link: '/training',
        dedupeKey: `certificate-expiring:${c.id}`,
      });
    }
    return created;
  }

  /** Trial ending reminders to organization administrators (7 days and 1 day before). */
  private async trialEnding(tenantId: string, now: Date): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true, trialEndsAt: true } });
    if (tenant?.status !== 'TRIAL' || !tenant.trialEndsAt || tenant.trialEndsAt <= now) return 0;
    const daysLeft = Math.ceil((tenant.trialEndsAt.getTime() - now.getTime()) / DAY_MS);
    const milestone = daysLeft <= 1 ? 1 : daysLeft <= 7 ? 7 : null;
    if (!milestone) return 0;
    const admins = await this.notifications.resolveRecipients({ tenantId }, ['ORG_ADMIN']);
    return this.notifications.notify({
      tenantId,
      userIds: admins,
      type: 'TRIAL_ENDING',
      title: `Your free trial ends in ${plural(daysLeft, 'day')}`,
      body: `The trial ends on ${displayDate(tenant.trialEndsAt)}. After that your data stays available read-only until a subscription is activated.`,
      link: '/subscription',
      dedupeKey: `trial-ending:${tenant.trialEndsAt.toISOString()}:${milestone}`,
    });
  }

  // ---------------------------------------------------------------------------
  // Digests
  // ---------------------------------------------------------------------------

  /** Personal digest: each assignee / auditor with open work gets one summary per local day. */
  private async sendDigest(tenantId: string, now: Date, day: string): Promise<number> {
    const [actions, audits] = await Promise.all([
      this.prisma.correctiveAction.findMany({
        where: { tenantId, status: { in: OPEN_ACTION_STATUSES }, assigneeId: { not: null } },
        select: { assigneeId: true, targetDate: true },
      }),
      this.prisma.scheduledAuditInstance.findMany({
        where: { tenantId, status: { in: ['SCHEDULED', 'OVERDUE', 'IN_PROGRESS'] }, auditorId: { not: null }, dueDate: { lte: new Date(now.getTime() + 7 * DAY_MS) } },
        select: { auditorId: true, dueDate: true },
      }),
    ]);
    const perUser = new Map<string, { open: number; overdue: number; audits: number; overdueAudits: number }>();
    const bump = (id: string) => {
      const existing = perUser.get(id);
      if (existing) return existing;
      const fresh = { open: 0, overdue: 0, audits: 0, overdueAudits: 0 };
      perUser.set(id, fresh);
      return fresh;
    };
    actions.forEach((a) => {
      if (!a.assigneeId) return;
      const s = bump(a.assigneeId);
      s.open++;
      if (a.targetDate < now) s.overdue++;
    });
    audits.forEach((i) => {
      if (!i.auditorId) return;
      const s = bump(i.auditorId);
      s.audits++;
      if (i.dueDate < now) s.overdueAudits++;
    });
    let created = 0;
    for (const [userId, s] of perUser) {
      const parts = [
        s.open ? `${plural(s.open, 'open corrective action')}${s.overdue ? `, ${s.overdue} overdue` : ''}` : null,
        s.audits ? `${plural(s.audits, 'audit')} due within 7 days${s.overdueAudits ? `, ${s.overdueAudits} overdue` : ''}` : null,
      ].filter(Boolean);
      created += await this.notifications.notify({
        tenantId,
        userIds: [userId],
        type: 'DAILY_DIGEST',
        title: 'Your 5S work for today',
        body: `You have ${parts.join(' and ')}.`,
        link: '/',
        dedupeKey: `digest:${day}`,
      });
    }
    return created;
  }

  /**
   * BRD §62 manager digest: audits due, overdue actions, new critical issues and yesterday's closure performance,
   * for everything under the org node of each leadership role assignment (organization-wide when unscoped).
   */
  private async sendManagerDigest(tenantId: string, now: Date, day: string): Promise<number> {
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { tenantId, role: { code: { in: MANAGER_DIGEST_ROLES } }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
      select: { userId: true, orgNodeId: true },
    });
    if (!assignments.length) return 0;
    const nodeIds = [...new Set(assignments.map((a) => a.orgNodeId).filter((id): id is string => !!id))];
    const nodePaths = new Map(
      (await this.prisma.orgNode.findMany({ where: { tenantId, id: { in: nodeIds } }, select: { id: true, path: true } })).map((n) => [n.id, n.path]),
    );
    // Per user: null = organization-wide, otherwise the org paths they cover
    const scopes = new Map<string, string[] | null>();
    for (const a of assignments) {
      const current = scopes.get(a.userId);
      if (current === null) continue;
      const path = a.orgNodeId ? nodePaths.get(a.orgNodeId) : undefined;
      // An unscoped assignment (or one whose node no longer exists) covers the whole organization
      if (!a.orgNodeId || !path) scopes.set(a.userId, null);
      else scopes.set(a.userId, [...(current ?? []), path]);
    }

    const dayAgo = new Date(now.getTime() - DAY_MS);
    const pathOf = { location: { select: { orgNode: { select: { path: true } } } } } as const;
    const [actions, audits, redTags, criticals, verified] = await Promise.all([
      this.prisma.correctiveAction.findMany({ where: { tenantId, status: { in: OPEN_ACTION_STATUSES } }, select: { status: true, targetDate: true, ...pathOf } }),
      this.prisma.scheduledAuditInstance.findMany({
        where: { tenantId, status: { in: ['SCHEDULED', 'OVERDUE', 'IN_PROGRESS'] }, dueDate: { lte: new Date(now.getTime() + 7 * DAY_MS) } },
        select: { dueDate: true, ...pathOf },
      }),
      this.prisma.redTag.findMany({ where: { tenantId, status: { in: OPEN_RED_TAG_STATUSES }, targetDispositionDate: { lt: now } }, select: { id: true, ...pathOf } }),
      this.prisma.observation.findMany({ where: { tenantId, severity: 'CRITICAL', createdAt: { gte: dayAgo } }, select: { id: true, ...pathOf } }),
      this.prisma.correctiveAction.findMany({ where: { tenantId, verifiedAt: { gte: dayAgo } }, select: { verifiedAt: true, targetDate: true, ...pathOf } }),
    ]);

    let created = 0;
    for (const [userId, paths] of scopes) {
      const inScope = (r: { location: { orgNode: { path: string } | null } }) =>
        paths === null || (!!r.location.orgNode && paths.some((p) => r.location.orgNode?.path.startsWith(p)));
      const myActions = actions.filter(inScope);
      const overdueActions = myActions.filter((a) => ASSIGNEE_ACTION_STATUSES.includes(a.status) && a.targetDate < now).length;
      const awaitingVerification = myActions.filter((a) => a.status === 'PENDING_VERIFICATION').length;
      const myAudits = audits.filter(inScope);
      const overdueAudits = myAudits.filter((i) => i.dueDate < now).length;
      const ageing = redTags.filter(inScope).length;
      const newCritical = criticals.filter(inScope).length;
      const myVerified = verified.filter(inScope);
      const onTime = myVerified.filter((v) => v.verifiedAt && v.verifiedAt <= v.targetDate).length;
      if (!myActions.length && !myAudits.length && !ageing && !newCritical && !myVerified.length) continue;

      const lines = [
        `Audits due within 7 days: ${myAudits.length}${overdueAudits ? ` (${overdueAudits} overdue)` : ''}`,
        `Open corrective actions: ${myActions.length} (${overdueActions} overdue, ${awaitingVerification} awaiting verification)`,
        `New critical observations in the last 24 hours: ${newCritical}`,
        `Red tags past their disposition date: ${ageing}`,
        `Actions verified in the last 24 hours: ${myVerified.length}${myVerified.length ? ` (${onTime} on time)` : ''}`,
      ];
      created += await this.notifications.notify({
        tenantId,
        userIds: [userId],
        type: 'MANAGER_DIGEST',
        title: overdueActions || overdueAudits || newCritical ? 'Daily 5S summary: items need attention' : 'Daily 5S summary',
        // One sentence per line: the notifications page shows the lines, compact views run them together
        body: lines.map((l) => `${l}.`).join('\n'),
        link: '/analytics',
        dedupeKey: `manager-digest:${day}`,
      });
    }
    return created;
  }
}

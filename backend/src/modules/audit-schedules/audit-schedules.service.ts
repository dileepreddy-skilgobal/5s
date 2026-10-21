import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { TenantSettingsService } from '../../core/config/tenant-settings.service';
import { documentPrefix } from '../../core/config/tenant-settings';
import { TenantReferenceService } from '../../core/database/tenant-reference.service';
import { nextSequenceCode, codeFragment } from '../../core/database/sequence-code';
import { RoleGroups } from '../../core/guards/role-groups';
import { getFrontendUrl } from '../../core/config/app-url';
import {
  CancelInstanceDto,
  CreateScheduleDto,
  MAX_LEAD_TIME_DAYS,
  RescheduleInstanceDto,
  UpdateScheduleDto,
  UpdateScheduledInstanceDto,
} from './dto/audit-schedule.dto';
import { displayDate, plural } from '../../core/notifications/notification-text';

const DAY_MS = 86400000;
/** Days an auditor has to complete a scheduled audit after its planned date. */
const AUDIT_COMPLETION_SLA_DAYS = 3;
/** Safety bound on cycles generated for one schedule in one pass (a daily schedule with a 90-day lead time needs 90). */
const MAX_CYCLES_PER_PASS = 120;
/** Scheduled audits that have not started yet: the only ones that may be rescheduled or cancelled. */
const NOT_STARTED_STATUSES = ['SCHEDULED', 'OVERDUE'];

/**
 * Page a notification about a scheduled audit opens. Self-audits are carried out by area owners, who
 * cannot open the schedule page; they find their audits on the area hub.
 */
const auditLink = (auditType: string) => (auditType === 'SELF' ? '/area-owner-hub' : '/schedules');

const RECURRENCE_INTERVAL_DAYS: Record<string, number> = {
  ONCE: 0,
  DAILY: 1,
  WEEKLY: 7,
  FORTNIGHTLY: 14,
  MONTHLY: 30,
  QUARTERLY: 91,
  ANNUALLY: 365,
};

/** Interval between cycles. CUSTOM_DAYS uses the explicit interval; ONCE returns 0 (single run). */
function resolveIntervalDays(recurrence: string, customDays?: number | null): number {
  if (recurrence === 'CUSTOM_DAYS') {
    if (!customDays || customDays < 1) {
      throw new BadRequestException('recurrenceIntervalDays (≥ 1) is required for CUSTOM_DAYS recurrence');
    }
    return customDays;
  }
  return RECURRENCE_INTERVAL_DAYS[recurrence] ?? 7;
}

@Injectable()
export class AuditSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
private readonly settingsService: TenantSettingsService,
    private readonly tenantRefs: TenantReferenceService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Verifies that every id referenced by a schedule payload belongs to the tenant. */
  private async assertScheduleReferences(
    tenantId: string,
    data: {
      templateId?: string;
      templateVersionId?: string;
      targetOrgNodeId?: string | null;
      targetLocationIds?: string[];
      preferredAuditorId?: string | null;
    },
  ) {
    await this.tenantRefs.assertOptional(tenantId, 'auditTemplate', data.templateId, 'Audit template');
    if (data.templateVersionId) {
      await this.tenantRefs.assertExists(
        tenantId,
        'auditTemplateVersion',
        data.templateVersionId,
        'Template version',
        data.templateId ? { templateId: data.templateId } : {},
      );
    }
    await this.tenantRefs.assertOptional(tenantId, 'orgNode', data.targetOrgNodeId, 'Target org node');
    if (Array.isArray(data.targetLocationIds)) {
      await this.tenantRefs.assertAll(tenantId, 'location', data.targetLocationIds, 'target location');
    }
    await this.tenantRefs.assertOptional(tenantId, 'user', data.preferredAuditorId, 'Preferred auditor');
    if (data.preferredAuditorId) {
      await this.assertAuditConductor(tenantId, data.preferredAuditorId);
    }
  }

  /** Audits may only be assigned to active users holding a role that conducts audits. */
  private async assertAuditConductor(tenantId: string, userId: string) {
    const eligible = await this.prisma.user.count({
      where: {
        id: userId,
        tenantId,
        status: 'ACTIVE',
        assignments: { some: { role: { code: { in: [...RoleGroups.AUDIT_CONDUCTORS] } } } },
      },
    });
    if (eligible === 0) {
      throw new BadRequestException('The selected user is not an active auditor.');
    }
  }

  /** Target scope must name what it targets: an org node for PLANT/DEPARTMENT, locations for SPECIFIC_LOCATIONS. */
  private assertTargetScope(targetType: string, targetOrgNodeId?: string | null, targetLocationIds?: string[]) {
    if ((targetType === 'PLANT' || targetType === 'DEPARTMENT') && !targetOrgNodeId) {
      throw new BadRequestException(`targetOrgNodeId is required for ${targetType} schedules.`);
    }
    if (targetType === 'SPECIFIC_LOCATIONS' && !(targetLocationIds && targetLocationIds.length)) {
      throw new BadRequestException('Select at least one location for a SPECIFIC_LOCATIONS schedule.');
    }
  }

  /** SCHED-<year>-<sequence>, continuing from the tenant's highest existing number (deleted schedules included: they keep their code under the unique constraint). */
  private nextScheduleCode(tenantId: string): Promise<string> {
    return nextSequenceCode(`SCHED-${new Date().getFullYear()}-`, (prefix) =>
      this.prisma.auditSchedule
        .findMany({ where: { tenantId, scheduleCode: { startsWith: prefix }, deletedAt: undefined }, select: { scheduleCode: true } })
        .then((rows) => rows.map((r) => r.scheduleCode)),
    );
  }

  async getSchedules(tenantId: string) {
    const schedules = await this.prisma.auditSchedule.findMany({
      where: { tenantId },
      include: {
        template: { select: { id: true, name: true, code: true } },
        templateVersion: { select: { id: true, versionNumber: true } },
        preferredAuditor: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { generatedInstances: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return schedules.map((s) => ({
      ...s,
      targetLocationIds: JSON.parse(s.targetLocationIds || '[]'),
    }));
  }

  async getScheduleById(tenantId: string, id: string) {
    const s = await this.prisma.auditSchedule.findFirst({
      where: { id, tenantId },
      include: {
        template: true,
        templateVersion: true,
        preferredAuditor: { select: { id: true, firstName: true, lastName: true, email: true } },
        generatedInstances: {
          include: {
            location: { select: { id: true, name: true, areaCode: true, building: true } },
            auditor: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { plannedDate: 'desc' },
          take: 50,
        },
      },
    });

    if (!s) {
      throw new NotFoundException(`Schedule with ID '${id}' not found`);
    }

    return {
      ...s,
      targetLocationIds: JSON.parse(s.targetLocationIds || '[]'),
    };
  }

  async createSchedule(tenantId: string, dto: CreateScheduleDto) {
    await this.assertScheduleReferences(tenantId, dto);
    this.assertTargetScope(dto.targetType, dto.targetOrgNodeId, dto.targetLocationIds);
    if (dto.rotationRule === 'ASSIGNED_AUDITOR' && !dto.preferredAuditorId) {
      throw new BadRequestException('Choose the auditor for an ASSIGNED_AUDITOR schedule.');
    }
    const scheduleCode = dto.scheduleCode ? dto.scheduleCode.trim().toUpperCase() : await this.nextScheduleCode(tenantId);
    const existing = await this.prisma.auditSchedule.findFirst({
      where: { tenantId, scheduleCode },
    });
    if (existing) {
      throw new ConflictException(`Schedule with code '${scheduleCode}' already exists`);
    }

    // Without an explicit version, schedules run the template's latest published version
    const templateVersionId = dto.templateVersionId ?? (await this.prisma.auditTemplateVersion.findFirst({
      where: { tenantId, templateId: dto.templateId, isPublished: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }))?.id;
    if (!templateVersionId) {
      throw new BadRequestException('The selected template has no published version to schedule.');
    }
    if (dto.templateVersionId) {
      const version = await this.prisma.auditTemplateVersion.findUnique({ where: { id: dto.templateVersionId }, select: { isPublished: true } });
      if (!version?.isPublished) {
        throw new BadRequestException('Only a published template version can be scheduled.');
      }
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const recurrenceIntervalDays = resolveIntervalDays(dto.recurrence, dto.recurrenceIntervalDays);

    const schedule = await this.prisma.auditSchedule.create({
      data: {
        tenantId,
        scheduleCode,
        title: dto.title.trim(),
        templateId: dto.templateId,
        templateVersionId,
        auditType: dto.auditType || 'ROUTINE',
        targetType: dto.targetType,
        targetOrgNodeId: dto.targetOrgNodeId || null,
        targetLocationIds: JSON.stringify(dto.targetLocationIds || []),
        recurrence: dto.recurrence,
        recurrenceIntervalDays,
        preferredAuditorId: dto.preferredAuditorId || null,
        rotationRule: dto.rotationRule || 'DEPT_INDEPENDENCE',
        startDate,
        leadTimeDays: dto.leadTimeDays ?? 2,
        nextRunAt: startDate,
        status: 'ACTIVE',
      },
    });

    // Automatically generate initial upcoming audit instances for this schedule
    await this.generateAuditsForSchedule(tenantId, schedule.id);

    return this.getScheduleById(tenantId, schedule.id);
  }

  async generateAuditsForSchedule(tenantId: string, scheduleId: string) {
    const schedule = await this.getScheduleById(tenantId, scheduleId);
    if (schedule.status !== 'ACTIVE') {
      throw new ConflictException(`Schedule ${schedule.scheduleCode} is ${schedule.status}; resume it before generating audits.`);
    }

    // A schedule with an end date completes instead of planning cycles past it
    const nextPlanned = schedule.nextRunAt ? new Date(schedule.nextRunAt) : new Date(schedule.startDate);
    if (schedule.endDate && nextPlanned > new Date(schedule.endDate)) {
      await this.prisma.auditSchedule.update({ where: { id: schedule.id }, data: { status: 'COMPLETED' } });
      return { message: `Schedule ${schedule.scheduleCode} has reached its end date.`, count: 0, createdCount: 0, instances: [] };
    }

    // 1. Resolve target locations (active locations only, no artificial cap)
    let targetLocations: { id: string; areaCode: string; ownerId: string | null }[] = [];
    const locationSelect = { id: true, areaCode: true, ownerId: true } as const;

    if (schedule.targetType === 'SPECIFIC_LOCATIONS') {
      targetLocations = schedule.targetLocationIds.length
        ? await this.prisma.location.findMany({
            where: { tenantId, status: 'ACTIVE', id: { in: schedule.targetLocationIds } },
            select: locationSelect,
          })
        : [];
    } else if ((schedule.targetType === 'DEPARTMENT' || schedule.targetType === 'PLANT') && schedule.targetOrgNodeId) {
      // A plant or department covers every location in its sub-tree of the org hierarchy
      const node = await this.prisma.orgNode.findFirst({
        where: { id: schedule.targetOrgNodeId, tenantId },
        select: { path: true },
      });
      targetLocations = node
        ? await this.prisma.location.findMany({
            where: { tenantId, status: 'ACTIVE', orgNode: { path: { startsWith: node.path } } },
            select: locationSelect,
          })
        : [];
    } else {
      targetLocations = await this.prisma.location.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: locationSelect,
      });
    }

    if (targetLocations.length === 0) {
      return { message: 'No target locations found for this schedule.', count: 0, createdCount: 0, instances: [] };
    }

    // 2. Fetch active users who may conduct audits, for rotation
    const auditors = await this.prisma.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        assignments: { some: { role: { code: { in: [...RoleGroups.AUDIT_CONDUCTORS] } } } },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    // 3. The cycle being generated is the schedule's next run (never in the past)
    const now = new Date();
    const scheduledRun = schedule.nextRunAt ? new Date(schedule.nextRunAt) : new Date(schedule.startDate);
    const plannedDate = scheduledRun > now ? scheduledRun : now;
    const dueDate = new Date(plannedDate.getTime() + AUDIT_COMPLETION_SLA_DAYS * DAY_MS);
    const dayStart = new Date(plannedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);

    const numberingSettings = await this.settingsService.get(tenantId);
    const createdInstances: any[] = [];

    for (let i = 0; i < targetLocations.length; i++) {
      const loc = targetLocations[i];

      // Idempotent per cycle: generating twice for the same planned day does not duplicate audits
      const alreadyPlanned = await this.prisma.scheduledAuditInstance.findFirst({
        where: { tenantId, scheduleId: schedule.id, locationId: loc.id, plannedDate: { gte: dayStart, lt: dayEnd } },
        select: { id: true },
      });
      if (alreadyPlanned) continue;

      // Rotation assignment; a self-audit is carried out by the area's own owner (BRD 21)
      let assignedAuditorId = schedule.auditType === 'SELF' && loc.ownerId ? loc.ownerId : schedule.preferredAuditorId;
      if (!assignedAuditorId && auditors.length > 0) {
        if (schedule.rotationRule === 'DEPT_INDEPENDENCE') {
          // Never assign the area's own owner to audit it
          const independent = auditors.filter((a) => a.id !== loc.ownerId);
          assignedAuditorId = independent.length ? independent[i % independent.length].id : null;
        } else if (schedule.rotationRule === 'RANDOM') {
          assignedAuditorId = auditors[Math.floor(Math.random() * auditors.length)].id;
        } else {
          assignedAuditorId = auditors[i % auditors.length].id;
        }
      }

      const auditCode = await nextSequenceCode(documentPrefix(numberingSettings, 'scheduledAudit', codeFragment(loc.areaCode), plannedDate.getFullYear()), (prefix) =>
        this.prisma.scheduledAuditInstance
          .findMany({ where: { tenantId, auditCode: { startsWith: prefix } }, select: { auditCode: true } })
          .then((rows) => rows.map((r) => r.auditCode)),
      );

      const instance = await this.prisma.scheduledAuditInstance.create({
        data: {
          tenantId,
          scheduleId: schedule.id,
          auditCode,
          templateVersionId: schedule.templateVersionId,
          locationId: loc.id,
          auditorId: assignedAuditorId,
          auditType: schedule.auditType,
          plannedDate,
          dueDate,
          status: 'SCHEDULED',
          notes: `Automated scheduled audit for ${schedule.title}`,
        },
      });

      createdInstances.push(instance);
    }

    const byAuditor = new Map<string, number>();
    createdInstances.forEach((i) => i.auditorId && byAuditor.set(i.auditorId, (byAuditor.get(i.auditorId) ?? 0) + 1));
    for (const [auditorId, count] of byAuditor) {
      await this.notifications.notify({
        tenantId,
        userIds: [auditorId],
        type: 'AUDIT_ASSIGNED',
        title: `${count} audit(s) assigned to you`,
        body: `"${schedule.title}" planned ${plural(count, 'audit')} for you, due ${displayDate(dueDate)}.`,
        entityType: 'AuditSchedule',
        entityId: schedule.id,
        // A page the assignee can open: the schedule page for audit roles, the area hub for self-audits
        link: auditLink(schedule.auditType),
      });
    }

    // 4. Advance the schedule to its next cycle; one-off schedules complete after their single run
    const intervalDays = resolveIntervalDays(schedule.recurrence, schedule.recurrenceIntervalDays);
    await this.prisma.auditSchedule.update({
      where: { id: schedule.id },
      data:
        intervalDays === 0
          ? { lastRunAt: now, status: 'COMPLETED' }
          : { lastRunAt: now, nextRunAt: new Date(plannedDate.getTime() + intervalDays * DAY_MS) },
    });

    return {
      message: `Successfully instantiated ${createdInstances.length} scheduled audits.`,
      count: createdInstances.length,
      createdCount: createdInstances.length,
      instances: createdInstances,
    };
  }

  async getScheduledAudits(tenantId: string, filters?: { status?: string; auditorId?: string; locationId?: string }) {
    const where: any = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.auditorId) where.auditorId = filters.auditorId;
    if (filters?.locationId) where.locationId = filters.locationId;

    return this.prisma.scheduledAuditInstance.findMany({
      where,
      include: {
        location: {
          include: {
            orgNode: { select: { id: true, name: true, code: true } },
          },
        },
        auditor: { select: { id: true, firstName: true, lastName: true, email: true } },
        templateVersion: {
          include: {
            template: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { plannedDate: 'asc' },
    });
  }

  async getScheduledInstance(tenantId: string, instanceId: string) {
    const instance = await this.prisma.scheduledAuditInstance.findFirst({
      where: { id: instanceId, tenantId },
      include: {
        location: { include: { orgNode: { select: { id: true, name: true, code: true } } } },
        auditor: { select: { id: true, firstName: true, lastName: true, email: true } },
        templateVersion: { include: { template: { select: { id: true, name: true, code: true } } } },
      },
    });
    if (!instance) throw new NotFoundException(`Scheduled audit '${instanceId}' not found`);
    return instance;
  }

  async updateSchedule(tenantId: string, id: string, data: UpdateScheduleDto) {
    const current = await this.getScheduleById(tenantId, id);
    await this.assertScheduleReferences(tenantId, {
      targetOrgNodeId: data.targetOrgNodeId,
      targetLocationIds: data.targetLocationIds,
      preferredAuditorId: data.preferredAuditorId,
    });
    if (data.targetType !== undefined || data.targetOrgNodeId !== undefined || data.targetLocationIds !== undefined) {
      this.assertTargetScope(
        data.targetType ?? current.targetType,
        data.targetOrgNodeId !== undefined ? data.targetOrgNodeId : current.targetOrgNodeId,
        data.targetLocationIds ?? current.targetLocationIds,
      );
    }
    if (data.status === 'ACTIVE' && current.status === 'COMPLETED') {
      throw new ConflictException(`Schedule ${current.scheduleCode} is completed and cannot be resumed. Create a new schedule instead.`);
    }
    const rotationRule = data.rotationRule ?? current.rotationRule;
    const preferredAuditorId = data.preferredAuditorId !== undefined ? data.preferredAuditorId : current.preferredAuditorId;
    const auditorChanged = data.rotationRule !== undefined || data.preferredAuditorId !== undefined;
    if (auditorChanged && rotationRule === 'ASSIGNED_AUDITOR' && !preferredAuditorId) {
      throw new BadRequestException('Choose the auditor for an ASSIGNED_AUDITOR schedule.');
    }
    return this.prisma.auditSchedule.update({
      where: { id },
      data: {
        title: data.title !== undefined ? data.title.trim() : undefined,
        // Audits already generated keep their type; the change applies to the next cycles
        auditType: data.auditType !== undefined ? data.auditType : undefined,
        nextRunAt: data.nextRunAt !== undefined ? new Date(data.nextRunAt) : undefined,
        recurrence: data.recurrence !== undefined ? data.recurrence : undefined,
        recurrenceIntervalDays:
          data.recurrence !== undefined || data.recurrenceIntervalDays !== undefined
            ? resolveIntervalDays(data.recurrence ?? current.recurrence, data.recurrenceIntervalDays ?? current.recurrenceIntervalDays)
            : undefined,
        rotationRule: data.rotationRule !== undefined ? data.rotationRule : undefined,
        preferredAuditorId: data.preferredAuditorId !== undefined ? data.preferredAuditorId : undefined,
        targetType: data.targetType !== undefined ? data.targetType : undefined,
        targetOrgNodeId: data.targetOrgNodeId !== undefined ? data.targetOrgNodeId : undefined,
        targetLocationIds: data.targetLocationIds !== undefined ? JSON.stringify(data.targetLocationIds) : undefined,
        leadTimeDays: data.leadTimeDays !== undefined ? Number(data.leadTimeDays) : undefined,
        status: data.status !== undefined ? data.status : undefined,
      },
    });
  }

  async updateScheduledInstance(tenantId: string, instanceId: string, data: UpdateScheduledInstanceDto) {
    const instance = await this.prisma.scheduledAuditInstance.findFirst({
      where: { id: instanceId, tenantId },
    });
    if (!instance) {
      throw new NotFoundException(`Audit instance '${instanceId}' not found`);
    }
    if (['IN_PROGRESS', 'SUBMITTED'].includes(instance.status)) {
      throw new ConflictException(`Audit ${instance.auditCode} is already ${instance.status} and can no longer be rescheduled.`);
    }
    await this.tenantRefs.assertOptional(tenantId, 'user', data.auditorId, 'Auditor');
    if (data.auditorId) {
      await this.assertAuditConductor(tenantId, data.auditorId);
    }

    return this.prisma.scheduledAuditInstance.update({
      where: { id: instanceId },
      data: {
        auditorId: data.auditorId !== undefined ? data.auditorId : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        plannedDate: data.plannedDate ? new Date(data.plannedDate) : undefined,
        status: data.status !== undefined ? data.status : undefined,
        notes: data.notes !== undefined ? data.notes : undefined,
        score: data.score !== undefined ? Number(data.score) : undefined,
      },
    });
  }

  /** Moves one audit that has not started to a new planned (and due) date, keeping a note of why. */
  async rescheduleInstance(tenantId: string, instanceId: string, dto: RescheduleInstanceDto, actorId: string) {
    const instance = await this.getNotStartedInstance(tenantId, instanceId, 'rescheduled');
    const plannedDate = new Date(dto.plannedDate);
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : new Date(plannedDate.getTime() + AUDIT_COMPLETION_SLA_DAYS * DAY_MS);
    if (dueDate < plannedDate) {
      throw new BadRequestException('The due date cannot be before the planned date.');
    }
    const actorName = await this.actorName(actorId);
    const reason = dto.reason?.trim();
    const note = `Rescheduled by ${actorName} from ${instance.plannedDate.toISOString().slice(0, 10)} to ${plannedDate.toISOString().slice(0, 10)}${reason ? `: ${reason}` : ''}`;

    const updated = await this.prisma.scheduledAuditInstance.update({
      where: { id: instanceId },
      // A rescheduled audit is due again, even if it had been flagged overdue
      data: { plannedDate, dueDate, status: 'SCHEDULED', notes: this.appendNote(instance.notes, note) },
    });
    if (instance.auditorId) {
      await this.notifications.notify({
        tenantId,
        userIds: [instance.auditorId],
        excludeUserId: actorId,
        type: 'AUDIT_RESCHEDULED',
        title: `Audit ${instance.auditCode} moved to ${displayDate(plannedDate)}`,
        body: `${note}. It is now due ${displayDate(dueDate)}.`,
        entityType: 'ScheduledAuditInstance',
        entityId: instanceId,
        link: auditLink(instance.auditType),
      });
    }
    return updated;
  }

  /** Cancels one audit that has not started; the reason is kept on the audit. */
  async cancelInstance(tenantId: string, instanceId: string, dto: CancelInstanceDto, actorId: string) {
    const instance = await this.getNotStartedInstance(tenantId, instanceId, 'cancelled');
    const actorName = await this.actorName(actorId);
    const note = `Cancelled by ${actorName}: ${dto.reason.trim()}`;
    const updated = await this.prisma.scheduledAuditInstance.update({
      where: { id: instanceId },
      data: { status: 'CANCELLED', notes: this.appendNote(instance.notes, note) },
    });
    if (instance.auditorId) {
      await this.notifications.notify({
        tenantId,
        userIds: [instance.auditorId],
        excludeUserId: actorId,
        type: 'AUDIT_CANCELLED',
        title: `Audit ${instance.auditCode} was cancelled`,
        body: note,
        entityType: 'ScheduledAuditInstance',
        entityId: instanceId,
        link: auditLink(instance.auditType),
      });
    }
    return updated;
  }

  /**
   * Creates the upcoming audits of every active recurring schedule of the tenant whose next cycle falls
   * within its lead time. Repeats per schedule until the next cycle lies beyond the lead-time window, so a
   * daily schedule with a 3-day lead time always has the next three days planned. Idempotent: generation
   * never creates a second audit for the same schedule, location and day.
   */
  async generateDueSchedules(tenantId: string, now = new Date()) {
    const horizon = new Date(now.getTime() + MAX_LEAD_TIME_DAYS * DAY_MS);
    const due = await this.prisma.auditSchedule.findMany({
      where: { tenantId, status: 'ACTIVE', nextRunAt: { not: null, lte: horizon } },
      select: { id: true },
      orderBy: { nextRunAt: 'asc' },
    });

    let schedulesProcessed = 0;
    let createdCount = 0;
    const failures: Array<{ scheduleId: string; message: string }> = [];
    for (const { id } of due) {
      let processed = false;
      try {
        for (let cycle = 0; cycle < MAX_CYCLES_PER_PASS; cycle++) {
          const current = await this.prisma.auditSchedule.findFirst({
            where: { id, tenantId },
            select: { status: true, nextRunAt: true, leadTimeDays: true },
          });
          if (!current || current.status !== 'ACTIVE' || !current.nextRunAt) break;
          // The next cycle is created once its planned date is within the schedule's lead time
          if (current.nextRunAt.getTime() > now.getTime() + current.leadTimeDays * DAY_MS) break;
          const result = await this.generateAuditsForSchedule(tenantId, id);
          createdCount += result.createdCount;
          processed = true;
        }
      } catch (err) {
        failures.push({ scheduleId: id, message: (err as Error).message });
      }
      if (processed) schedulesProcessed++;
    }
    return { schedulesProcessed, createdCount, failures };
  }

  private async getNotStartedInstance(tenantId: string, instanceId: string, step: string) {
    const instance = await this.prisma.scheduledAuditInstance.findFirst({ where: { id: instanceId, tenantId } });
    if (!instance) {
      throw new NotFoundException(`Audit instance '${instanceId}' not found`);
    }
    if (!NOT_STARTED_STATUSES.includes(instance.status)) {
      throw new ConflictException(`Audit ${instance.auditCode} is ${instance.status} and can no longer be ${step}.`);
    }
    return instance;
  }

  private async actorName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    return user ? `${user.firstName} ${user.lastName}`.trim() : 'a programme manager';
  }

  /** Appends a dated line to an audit's notes so earlier reschedules and their reasons stay visible. */
  private appendNote(existing: string | null, line: string): string {
    const stamped = `[${new Date().toISOString().slice(0, 10)}] ${line}`;
    return existing?.trim() ? `${existing.trim()}\n${stamped}` : stamped;
  }

  async deleteSchedule(tenantId: string, id: string, actorId: string) {
    await this.getScheduleById(tenantId, id);
    return this.prisma.$transaction(async (tx) => {
      // Audits not yet started are no longer due; started and finished ones stay on record
      await tx.scheduledAuditInstance.updateMany({
        where: { tenantId, scheduleId: id, status: { in: ['SCHEDULED', 'OVERDUE'] } },
        data: { status: 'CANCELLED' },
      });
      return tx.auditSchedule.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });
    });
  }

  async generateIcsCalendar(tenantId: string, instanceId?: string): Promise<string> {
    const where: any = { tenantId };
    if (instanceId) {
      where.id = instanceId;
    }
    const instances = await this.prisma.scheduledAuditInstance.findMany({
      where,
      include: {
        location: {
          include: {
            orgNode: { select: { name: true } },
          },
        },
        auditor: { select: { firstName: true, lastName: true, email: true } },
        templateVersion: {
          include: {
            template: { select: { name: true } },
          },
        },
      },
    });

    const formatIcsDate = (d: Date) => {
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SkilGlobal 5S//Audit Calendar Engine//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:5S Audit Schedule Calendar',
      'X-WR-TIMEZONE:Asia/Kolkata',
    ];

    for (const inst of instances) {
      const start = new Date(inst.plannedDate);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour audit slot
      const created = new Date();
      const locName = inst.location?.name || '5S Workstation';
      const areaCode = inst.location?.areaCode || 'LOC';
      const building = inst.location?.building ? `${inst.location.building}, ` : '';
      const plant = inst.location?.orgNode?.name || 'Manufacturing Plant';
      const auditorName = inst.auditor ? `${inst.auditor.firstName} ${inst.auditor.lastName}` : 'Unassigned';
      const tplName = inst.templateVersion?.template?.name || '5S Standard Audit';

      ics.push('BEGIN:VEVENT');
      ics.push(`UID:5s-audit-${inst.id}@skilglobal.com`);
      ics.push(`DTSTAMP:${formatIcsDate(created)}`);
      ics.push(`DTSTART:${formatIcsDate(start)}`);
      ics.push(`DTEND:${formatIcsDate(end)}`);
      ics.push(`SUMMARY:[5S Audit] ${areaCode} - ${locName}`);
      ics.push(`DESCRIPTION:5S Workplace Organization Audit\\nAudit Code: ${inst.auditCode}\\nLocation: ${locName} (${areaCode})\\nTemplate: ${tplName}\\nAssigned Auditor: ${auditorName}\\nDue Date: ${inst.dueDate.toISOString().split('T')[0]}\\n\\nLaunch Mobile Audit: ${getFrontendUrl()}/mobile-audit/${inst.id}`);
      ics.push(`LOCATION:${building}${plant}`);
      ics.push(`STATUS:${inst.status === 'SUBMITTED' ? 'CONFIRMED' : 'TENTATIVE'}`);
      if (inst.auditor?.email) {
        ics.push(`ATTENDEE;CN=${auditorName};ROLE=REQ-PARTICIPANT:mailto:${inst.auditor.email}`);
      }
      ics.push('BEGIN:VALARM');
      ics.push('TRIGGER:-PT24H');
      ics.push('ACTION:DISPLAY');
      ics.push(`DESCRIPTION:Reminder: 5S Audit Scheduled for tomorrow at ${locName}`);
      ics.push('END:VALARM');
      ics.push('BEGIN:VALARM');
      ics.push('TRIGGER:-PT2H');
      ics.push('ACTION:DISPLAY');
      ics.push(`DESCRIPTION:Upcoming: 5S Audit at ${locName} in 2 hours`);
      ics.push('END:VALARM');
      ics.push('END:VEVENT');
    }

    ics.push('END:VCALENDAR');
    return ics.join('\r\n');
  }
}

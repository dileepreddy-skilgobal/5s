import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateScheduleDto, GenerateAuditsDto } from './dto/audit-schedule.dto';

@Injectable()
export class AuditSchedulesService {
  constructor(private readonly prisma: PrismaService) {}

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
    const existing = await this.prisma.auditSchedule.findFirst({
      where: { tenantId, scheduleCode: dto.scheduleCode },
    });
    if (existing) {
      throw new ConflictException(`Schedule with code '${dto.scheduleCode}' already exists`);
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const recurrenceIntervalDays = dto.recurrenceIntervalDays || (dto.recurrence === 'DAILY' ? 1 : dto.recurrence === 'MONTHLY' ? 30 : 7);

    const schedule = await this.prisma.auditSchedule.create({
      data: {
        tenantId,
        scheduleCode: dto.scheduleCode.trim().toUpperCase(),
        title: dto.title.trim(),
        templateId: dto.templateId,
        templateVersionId: dto.templateVersionId,
        auditType: dto.auditType || 'ROUTINE',
        targetType: dto.targetType,
        targetOrgNodeId: dto.targetOrgNodeId || null,
        targetLocationIds: JSON.stringify(dto.targetLocationIds || []),
        recurrence: dto.recurrence,
        recurrenceIntervalDays,
        preferredAuditorId: dto.preferredAuditorId || null,
        rotationRule: dto.rotationRule || 'DEPT_INDEPENDENCE',
        startDate,
        leadTimeDays: dto.leadTimeDays || 2,
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

    // 1. Resolve target locations
    let targetLocations: { id: string; areaCode: string; ownerId: string | null }[] = [];

    if (schedule.targetType === 'SPECIFIC_LOCATIONS' && schedule.targetLocationIds.length > 0) {
      targetLocations = await this.prisma.location.findMany({
        where: { tenantId, id: { in: schedule.targetLocationIds } },
        select: { id: true, areaCode: true, ownerId: true },
      });
    } else if (schedule.targetType === 'DEPARTMENT' && schedule.targetOrgNodeId) {
      targetLocations = await this.prisma.location.findMany({
        where: { tenantId, orgNodeId: schedule.targetOrgNodeId },
        select: { id: true, areaCode: true, ownerId: true },
      });
    } else {
      // ALL_AREAS or PLANT
      targetLocations = await this.prisma.location.findMany({
        where: { tenantId },
        select: { id: true, areaCode: true, ownerId: true },
        take: 20,
      });
    }

    if (targetLocations.length === 0) {
      return { message: 'No target locations found for this schedule.', count: 0 };
    }

    // 2. Fetch available auditors for rotation
    const auditors = await this.prisma.user.findMany({
      where: {
        tenantId,
        assignments: {
          some: {
            role: {
              code: { in: ['AUDITOR', 'COORDINATOR_5S', 'ORG_ADMIN', 'DEPT_HEAD'] },
            },
          },
        },
      },
      select: { id: true, department: true },
    });

    const now = new Date();
    const plannedDate = new Date(now.getTime() + 2 * 86400000); // 2 days ahead
    const dueDate = new Date(plannedDate.getTime() + 3 * 86400000); // 3 days completion SLA

    const yearStr = now.getFullYear();
    const createdInstances: any[] = [];

    for (let i = 0; i < targetLocations.length; i++) {
      const loc = targetLocations[i];
      const seq = String(i + 1).padStart(4, '0');
      const auditCode = `AUD-${loc.areaCode.replace(/[^A-Z0-9]/g, '')}-${yearStr}-${seq}`;

      // Rotation assignment
      let assignedAuditorId = schedule.preferredAuditorId;
      if (!assignedAuditorId && auditors.length > 0) {
        if (schedule.rotationRule === 'DEPT_INDEPENDENCE') {
          // Choose auditor who is not the area owner
          const independentAuditor = auditors.find((a) => a.id !== loc.ownerId) || auditors[0];
          assignedAuditorId = independentAuditor.id;
        } else {
          assignedAuditorId = auditors[i % auditors.length].id;
        }
      }

      const instance = await this.prisma.scheduledAuditInstance.upsert({
        where: { tenantId_auditCode: { tenantId, auditCode } },
        update: {},
        create: {
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

    // Update schedule nextRunAt
    const nextRun = new Date(now.getTime() + schedule.recurrenceIntervalDays * 86400000);
    await this.prisma.auditSchedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: now,
        nextRunAt: nextRun,
      },
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

  async updateSchedule(tenantId: string, id: string, data: any) {
    await this.getScheduleById(tenantId, id);
    return this.prisma.auditSchedule.update({
      where: { id },
      data: {
        title: data.title !== undefined ? data.title : undefined,
        recurrence: data.recurrence !== undefined ? data.recurrence : undefined,
        recurrenceIntervalDays: data.recurrenceIntervalDays !== undefined ? Number(data.recurrenceIntervalDays) : undefined,
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

  async updateScheduledInstance(tenantId: string, instanceId: string, data: any) {
    const instance = await this.prisma.scheduledAuditInstance.findFirst({
      where: { id: instanceId, tenantId },
    });
    if (!instance) {
      throw new NotFoundException(`Audit instance '${instanceId}' not found`);
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

  async deleteSchedule(tenantId: string, id: string) {
    await this.getScheduleById(tenantId, id);
    return this.prisma.auditSchedule.delete({
      where: { id },
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
      ics.push(`DESCRIPTION:5S Workplace Organization Audit\\nAudit Code: ${inst.auditCode}\\nLocation: ${locName} (${areaCode})\\nTemplate: ${tplName}\\nAssigned Auditor: ${auditorName}\\nDue Date: ${inst.dueDate.toISOString().split('T')[0]}\\n\\nLaunch Mobile Audit: http://localhost:5173/mobile-audit?locationId=${inst.locationId}`);
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

  async syncGmailCalendar(tenantId: string, payload: { instanceIds?: string[]; emailToSync?: string }) {
    const where: any = { tenantId };
    if (payload.instanceIds && payload.instanceIds.length > 0) {
      where.id = { in: payload.instanceIds };
    }

    const instances = await this.prisma.scheduledAuditInstance.findMany({
      where,
      include: {
        location: true,
        auditor: true,
        templateVersion: { include: { template: true } },
      },
    });

    const googleCalendarUrls = instances.map((inst) => {
      const start = new Date(inst.plannedDate);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const startIso = start.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const endIso = end.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const title = encodeURIComponent(`[5S Audit] ${inst.location?.areaCode} - ${inst.location?.name}`);
      const details = encodeURIComponent(
        `5S Workplace Organization Audit\nAudit Code: ${inst.auditCode}\nTemplate: ${inst.templateVersion?.template?.name || 'Standard Audit'}\nAssigned Auditor: ${inst.auditor ? inst.auditor.firstName + ' ' + inst.auditor.lastName : 'Unassigned'}\n\nExecute Audit Runner: http://localhost:5173/mobile-audit?locationId=${inst.locationId}`
      );
      const loc = encodeURIComponent(`${inst.location?.building || 'Main Bay'}, ${inst.location?.name || 'Workstation'}`);

      return {
        instanceId: inst.id,
        auditCode: inst.auditCode,
        title: `[5S Audit] ${inst.location?.name}`,
        plannedDate: inst.plannedDate,
        googleCalendarUrl: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startIso}/${endIso}&details=${details}&location=${loc}`,
      };
    });

    return {
      success: true,
      syncedCount: instances.length,
      syncedEmail: payload.emailToSync || 'google.workspace@skilglobal.com',
      syncedAt: new Date().toISOString(),
      googleCalendarUrls,
      message: `Successfully generated Google Calendar / Gmail event synchronization links for ${instances.length} scheduled audit(s).`,
    };
  }
}

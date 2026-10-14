import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateActionDto, UpdateActionDto, Update5WhyDto, SubmitClosureDto, VerifyActionDto } from './dto/corrective-action.dto';

@Injectable()
export class CorrectiveActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listActions(
    tenantId: string,
    query?: { status?: string; assigneeId?: string; locationId?: string; isOverdue?: string; escalationTier?: string; search?: string },
  ) {
    const where: any = { tenantId };
    if (query?.status) where.status = query.status;
    if (query?.assigneeId) where.assigneeId = query.assigneeId;
    if (query?.locationId) where.locationId = query.locationId;
    if (query?.escalationTier) where.escalationTier = query.escalationTier;
    if (query?.isOverdue === 'true') where.isOverdue = true;

    if (query?.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { actionCode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const actions = await this.prisma.correctiveAction.findMany({
      where,
      include: {
        location: { select: { id: true, name: true, areaCode: true, building: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedBy: { select: { id: true, firstName: true, lastName: true } },
        verifiedBy: { select: { id: true, firstName: true, lastName: true } },
        observation: {
          select: {
            id: true,
            observationCode: true,
            category: true,
            severity: true,
            title: true,
            beforePhotoUrl: true,
            execution: {
              select: {
                id: true,
                auditCode: true,
                status: true,
                startedAt: true,
              },
            },
          },
        },
      },
      orderBy: { targetDate: 'asc' },
    });

    const now = new Date();

    return actions.map((act) => {
      const isPastDue = act.status !== 'CLOSED' && act.status !== 'VERIFIED' && act.status !== 'PENDING_ACKNOWLEDGEMENT' && new Date(act.targetDate) < now;
      return {
        ...act,
        isOverdue: isPastDue,
        fiveWhyAnalysis: JSON.parse(act.fiveWhyAnalysis || '{}'),
      };
    });
  }

  async getActionById(tenantId: string, id: string) {
    const action = await this.prisma.correctiveAction.findFirst({
      where: { id, tenantId },
      include: {
        location: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
            orgNode: { select: { id: true, name: true, code: true } },
          },
        },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        assignedBy: { select: { id: true, firstName: true, lastName: true } },
        verifiedBy: { select: { id: true, firstName: true, lastName: true } },
        observation: {
          include: {
            loggedBy: { select: { id: true, firstName: true, lastName: true } },
            execution: { select: { id: true, auditCode: true, startedAt: true } },
          },
        },
        history: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!action) {
      throw new NotFoundException(`Corrective action with ID '${id}' not found`);
    }

    const now = new Date();
    const isPastDue = action.status !== 'CLOSED' && action.status !== 'VERIFIED' && new Date(action.targetDate) < now;

    return {
      ...action,
      isOverdue: isPastDue,
      fiveWhyAnalysis: JSON.parse(action.fiveWhyAnalysis || '{}'),
      observation: {
        ...action.observation,
        tags: JSON.parse(action.observation.tags || '[]'),
      },
    };
  }

  async createAction(tenantId: string, assignedById: string | null, dto: CreateActionDto) {
    const observation = await this.prisma.observation.findFirst({
      where: { id: dto.observationId, tenantId },
    });
    if (!observation) {
      throw new NotFoundException(`Observation '${dto.observationId}' not found`);
    }

    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId },
    });
    if (!location) {
      throw new NotFoundException(`Location '${dto.locationId}' not found`);
    }

    const count = await this.prisma.correctiveAction.count({ where: { tenantId } });
    const year = new Date().getFullYear();
    const cleanPrefix = location.areaCode.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase();
    let seq = count + 1;
    let actionCode = `CAPA-${cleanPrefix}-${year}-${String(seq).padStart(4, '0')}`;
    while (await this.prisma.correctiveAction.findFirst({ where: { tenantId, actionCode } })) {
      seq++;
      actionCode = `CAPA-${cleanPrefix}-${year}-${String(seq).padStart(4, '0')}`;
    }

    const slaHours = dto.slaHours || (observation.severity === 'CRITICAL' ? 24 : observation.severity === 'MAJOR' ? 72 : 168);
    const targetDate = dto.targetDate ? new Date(dto.targetDate) : new Date(Date.now() + slaHours * 3600000);

    const action = await this.prisma.correctiveAction.create({
      data: {
        tenantId,
        actionCode,
        observationId: dto.observationId,
        locationId: dto.locationId,
        title: dto.title,
        description: dto.description,
        actionType: dto.actionType || 'CORRECTIVE',
        rootCauseCategory: dto.rootCauseCategory || 'METHOD',
        assigneeId: dto.assigneeId || location.ownerId,
        assignedById,
        targetDate,
        slaHours,
        status: 'ASSIGNED',
      },
    });

    await this.prisma.observation.update({
      where: { id: dto.observationId },
      data: { status: 'ACTION_ASSIGNED' },
    });

    await this.prisma.actionHistoryLog.create({
      data: {
        tenantId,
        actionId: action.id,
        actorId: assignedById,
        actorName: '5S Coordinator',
        fromStatus: 'OPEN',
        toStatus: 'ASSIGNED',
        comment: `Manual CAPA created with ${slaHours}h SLA.`,
      },
    });

    return this.getActionById(tenantId, action.id);
  }

  async updateAction(tenantId: string, id: string, dto: UpdateActionDto) {
    const existing = await this.prisma.correctiveAction.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Corrective action '${id}' not found`);
    }

    const data: any = { ...dto };
    if (dto.targetDate) {
      data.targetDate = new Date(dto.targetDate);
    }

    await this.prisma.correctiveAction.update({
      where: { id },
      data,
    });

    if (dto.status && dto.status !== existing.status) {
      await this.prisma.actionHistoryLog.create({
        data: {
          tenantId,
          actionId: id,
          fromStatus: existing.status,
          toStatus: dto.status,
          comment: `Status updated to ${dto.status}.`,
        },
      });
    }

    return this.getActionById(tenantId, id);
  }

  async update5Why(tenantId: string, id: string, dto: Update5WhyDto) {
    const existing = await this.prisma.correctiveAction.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Corrective action '${id}' not found`);
    }

    const currentAnalysis = JSON.parse(existing.fiveWhyAnalysis || '{}');
    const updatedAnalysis = {
      ...currentAnalysis,
      why1: dto.why1 !== undefined ? dto.why1 : currentAnalysis.why1 || '',
      why2: dto.why2 !== undefined ? dto.why2 : currentAnalysis.why2 || '',
      why3: dto.why3 !== undefined ? dto.why3 : currentAnalysis.why3 || '',
      why4: dto.why4 !== undefined ? dto.why4 : currentAnalysis.why4 || '',
      why5: dto.why5 !== undefined ? dto.why5 : currentAnalysis.why5 || '',
      rootCauseConclusion: dto.rootCauseConclusion !== undefined ? dto.rootCauseConclusion : currentAnalysis.rootCauseConclusion || '',
      solution: dto.solution !== undefined ? dto.solution : currentAnalysis.solution || '',
      preventiveAction: dto.preventiveAction !== undefined ? dto.preventiveAction : currentAnalysis.preventiveAction || '',
      verificationCriteria: dto.verificationCriteria !== undefined ? dto.verificationCriteria : currentAnalysis.verificationCriteria || '',
    };

    await this.prisma.correctiveAction.update({
      where: { id },
      data: {
        fiveWhyAnalysis: JSON.stringify(updatedAnalysis),
        rootCauseCategory: dto.rootCauseCategory || existing.rootCauseCategory,
      },
    });

    await this.prisma.actionHistoryLog.create({
      data: {
        tenantId,
        actionId: id,
        fromStatus: existing.status,
        toStatus: existing.status,
        comment: '5-Why root cause investigation updated.',
      },
    });

    return this.getActionById(tenantId, id);
  }

  async submitClosure(tenantId: string, id: string, actorId: string | null, dto: SubmitClosureDto) {
    const existing = await this.prisma.correctiveAction.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Corrective action '${id}' not found`);
    }

    if (existing.status === 'PENDING_ACKNOWLEDGEMENT') {
      throw new BadRequestException('Cannot submit CAPA closure before the Area Owner formally acknowledges the audit findings.');
    }

    await this.prisma.correctiveAction.update({
      where: { id },
      data: {
        status: 'PENDING_VERIFICATION',
        closureNotes: dto.closureNotes,
        afterPhotoUrl: dto.afterPhotoUrl,
        closureSubmittedAt: new Date(),
      },
    });

    await this.prisma.observation.update({
      where: { id: existing.observationId },
      data: { status: 'PENDING_VERIFICATION' },
    });

    await this.prisma.actionHistoryLog.create({
      data: {
        tenantId,
        actionId: id,
        actorId,
        actorName: dto.actorName || 'Action Assignee',
        fromStatus: existing.status,
        toStatus: 'PENDING_VERIFICATION',
        comment: `Closure evidence submitted: ${dto.closureNotes}`,
      },
    });

    return this.getActionById(tenantId, id);
  }

  async verifyAction(tenantId: string, id: string, verifierId: string | null, dto: VerifyActionDto) {
    const existing = await this.prisma.correctiveAction.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Corrective action '${id}' not found`);
    }

    if (dto.approved) {
      await this.prisma.correctiveAction.update({
        where: { id },
        data: {
          status: 'VERIFIED',
          verifiedById: verifierId,
          verifiedAt: new Date(),
          verificationNotes: dto.verificationNotes || 'Verification approved by independent verifier.',
        },
      });

      await this.prisma.observation.update({
        where: { id: existing.observationId },
        data: { status: 'CLOSED' },
      });

      await this.prisma.actionHistoryLog.create({
        data: {
          tenantId,
          actionId: id,
          actorId: verifierId,
          actorName: dto.verifierName || 'Independent Verifier',
          fromStatus: existing.status,
          toStatus: 'VERIFIED',
          comment: `Verification sign-off APPROVED. Action closed successfully. ${dto.verificationNotes || ''}`,
        },
      });
    } else {
      // Reopen
      await this.prisma.correctiveAction.update({
        where: { id },
        data: {
          status: 'REOPENED',
          reopenCount: existing.reopenCount + 1,
          verificationNotes: dto.verificationNotes || 'Remediation rejected by verifier. Please rectify.',
        },
      });

      await this.prisma.observation.update({
        where: { id: existing.observationId },
        data: { status: 'IN_PROGRESS' },
      });

      await this.prisma.actionHistoryLog.create({
        data: {
          tenantId,
          actionId: id,
          actorId: verifierId,
          actorName: dto.verifierName || 'Independent Verifier',
          fromStatus: existing.status,
          toStatus: 'REOPENED',
          comment: `Verification REJECTED and REOPENED: ${dto.verificationNotes || 'Inadequate evidence.'}`,
        },
      });
    }

    return this.getActionById(tenantId, id);
  }

  async deleteAction(tenantId: string, id: string) {
    const existing = await this.prisma.correctiveAction.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Corrective action '${id}' not found`);
    }

    await this.prisma.correctiveAction.delete({ where: { id } });
    return { success: true, message: `Action ${existing.actionCode} deleted` };
  }
}

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { FilesService } from '../../core/storage/files.service';
import { TenantSettingsService } from '../../core/config/tenant-settings.service';
import { documentPrefix } from '../../core/config/tenant-settings';
import { nextSequenceCode, codeFragment } from '../../core/database/sequence-code';
import { findRepeatOf } from './repeat-detection';
import { CreateObservationDto, UpdateObservationDto } from './dto/observation.dto';

@Injectable()
export class ObservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: TenantSettingsService,
    private readonly files: FilesService,
  ) {}

  async listObservations(
    tenantId: string,
    query?: {
      category?: string;
      severity?: string;
      status?: string;
      locationId?: string;
      executionId?: string;
      search?: string;
      /** Only observations flagged as repeats of an earlier one. */
      repeatOnly?: boolean;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: any = { tenantId };
    if (query?.repeatOnly) where.isRepeat = true;
    if (query?.category) where.category = query.category;
    if (query?.severity) where.severity = query.severity;
    if (query?.status) where.status = query.status;
    if (query?.locationId) where.locationId = query.locationId;
    if (query?.executionId) where.executionId = query.executionId;
    if (query?.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { observationCode: { contains: query.search, mode: 'insensitive' } },
        { location: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const observations = await this.prisma.observation.findMany({
      where,
      include: {
        location: { select: { id: true, name: true, areaCode: true, building: true } },
        loggedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        correctiveAction: {
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...this.page(query?.limit, query?.offset),
    });

    return observations.map((obs) => ({
      ...obs,
      // Nested includes bypass the soft-delete filter: a deleted action is not shown as the observation's action
      correctiveAction: obs.correctiveAction && !obs.correctiveAction.deletedAt ? obs.correctiveAction : null,
      tags: typeof obs.tags === 'string' ? JSON.parse(obs.tags || '[]') : obs.tags,
      annotationData: typeof obs.annotationData === 'string' ? JSON.parse(obs.annotationData || '[]') : obs.annotationData,
      mediaUrls: JSON.parse(obs.mediaUrls || '[]'),
    }));
  }

  async summary(tenantId: string) {
    const [total, critical, open, kaizen] = await Promise.all([
      this.prisma.observation.count({ where: { tenantId } }),
      this.prisma.observation.count({ where: { tenantId, severity: 'CRITICAL' } }),
      this.prisma.observation.count({ where: { tenantId, status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      this.prisma.observation.count({ where: { tenantId, severity: 'KAIZEN_OPPORTUNITY' } }),
    ]);
    return { total, critical, open, kaizen };
  }

  /** Optional paging; invalid values are ignored, the page size is capped at 200. */
  private page(limit?: number, offset?: number): { take?: number; skip?: number } {
    const take = limit !== undefined && Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : undefined;
    const skip = offset !== undefined && Number.isInteger(offset) && offset > 0 ? offset : undefined;
    return { ...(take ? { take } : {}), ...(skip ? { skip } : {}) };
  }

  async getObservationById(tenantId: string, id: string) {
    const observation = await this.prisma.observation.findFirst({
      where: { id, tenantId },
      include: {
        location: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
            orgNode: { select: { id: true, name: true, code: true } },
          },
        },
        execution: { select: { id: true, auditCode: true, startedAt: true, overallScore: true } },
        loggedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        correctiveAction: {
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
            assignedBy: { select: { id: true, firstName: true, lastName: true } },
            verifiedBy: { select: { id: true, firstName: true, lastName: true } },
            history: { orderBy: { createdAt: 'desc' } },
          },
        },
      },
    });

    if (!observation) {
      throw new NotFoundException(`Observation with ID '${id}' not found`);
    }

    // The earlier occurrence this observation repeats (BRD §49), when flagged
    const repeatOf = observation.repeatOfId
      ? await this.prisma.observation.findFirst({
          where: { id: observation.repeatOfId, tenantId },
          select: { id: true, observationCode: true, title: true, createdAt: true },
        })
      : null;
    // Nested includes bypass the soft-delete filter: a deleted action still holds the link but is not shown
    const action = observation.correctiveAction && !observation.correctiveAction.deletedAt ? observation.correctiveAction : null;

    return {
      ...observation,
      repeatOf,
      hasDeletedAction: !!observation.correctiveAction && !action,
      tags: typeof observation.tags === 'string' ? JSON.parse(observation.tags || '[]') : observation.tags,
      annotationData: typeof observation.annotationData === 'string' ? JSON.parse(observation.annotationData || '[]') : observation.annotationData,
      mediaUrls: JSON.parse(observation.mediaUrls || '[]'),
      correctiveAction: action
        ? {
            ...action,
            fiveWhyAnalysis: JSON.parse(action.fiveWhyAnalysis || '{}'),
          }
        : null,
    };
  }

  async createObservation(tenantId: string, loggedById: string | null, dto: CreateObservationDto) {
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId },
    });
    if (!location) {
      throw new NotFoundException(`Location '${dto.locationId}' not found`);
    }

    // Offline clients may retry a submission whose response was lost: return the original
    if (dto.clientRequestId) {
      const already = await this.prisma.observation.findFirst({ where: { tenantId, clientRequestId: dto.clientRequestId }, select: { id: true } });
      if (already) return this.getObservationById(tenantId, already.id);
    }

    const numberingSettings = await this.settingsService.get(tenantId);
    const observationCode = await nextSequenceCode(documentPrefix(numberingSettings, 'observation', codeFragment(location.areaCode), new Date().getFullYear()), (prefix) =>
      this.prisma.observation
        .findMany({ where: { tenantId, observationCode: { startsWith: prefix }, deletedAt: undefined }, select: { observationCode: true } })
        .then((rows) => rows.map((r) => r.observationCode)),
    );

    const tagsString = typeof dto.tags === 'string' ? dto.tags : JSON.stringify(dto.tags || []);
    const annotationString = typeof dto.annotationData === 'string' ? dto.annotationData : JSON.stringify(dto.annotationData || []);
    // Clients that cannot render (mobile) send shapes only: draw them onto a copy of the photo
    const burnedPhotoUrl =
      !dto.annotatedPhotoUrl || dto.annotatedPhotoUrl === dto.beforePhotoUrl
        ? await this.files.burnAnnotations(tenantId, loggedById, dto.beforePhotoUrl, JSON.parse(annotationString || '[]'), 'observations')
        : null;

    const repeatOfId = await findRepeatOf(this.prisma, {
      tenantId,
      locationId: dto.locationId,
      category: dto.category,
      title: dto.title,
    });

    const observation = await this.prisma.observation.create({
      data: {
        tenantId,
        observationCode,
        isRepeat: repeatOfId !== null,
        repeatOfId,
        locationId: dto.locationId,
        category: dto.category,
        severity: dto.severity,
        title: dto.title,
        description: dto.description,
        beforePhotoUrl: dto.beforePhotoUrl,
        annotatedPhotoUrl: burnedPhotoUrl ?? (dto.annotatedPhotoUrl || dto.beforePhotoUrl),
        annotationData: annotationString,
        status: 'OPEN',
        riskAssessment: dto.riskAssessment,
        tags: tagsString,
        loggedById,
        mediaUrls: JSON.stringify(dto.mediaUrls ?? []),
        voiceNoteUrl: dto.voiceNoteUrl,
        gpsLatitude: dto.gpsLatitude,
        gpsLongitude: dto.gpsLongitude,
        gpsAccuracyM: dto.gpsAccuracyM,
        clientRequestId: dto.clientRequestId,
      },
    });

    return this.getObservationById(tenantId, observation.id);
  }

  async updateObservation(tenantId: string, id: string, dto: UpdateObservationDto) {
    const existing = await this.prisma.observation.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Observation with ID '${id}' not found`);
    }
    if (dto.status !== undefined && dto.status !== existing.status) {
      const linkedAction = await this.prisma.correctiveAction.findFirst({
        where: { tenantId, observationId: id },
        select: { actionCode: true },
      });
      if (linkedAction) {
        throw new ConflictException(
          `This observation's status follows corrective action ${linkedAction.actionCode}; update the action instead.`,
        );
      }
    }

    const data: any = { ...dto };
    if (dto.tags && typeof dto.tags !== 'string') {
      data.tags = JSON.stringify(dto.tags);
    }

    await this.prisma.observation.update({
      where: { id },
      data,
    });

    return this.getObservationById(tenantId, id);
  }

  async deleteObservation(tenantId: string, id: string, actorId: string) {
    const existing = await this.prisma.observation.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Observation with ID '${id}' not found`);
    }

    const action = await this.prisma.correctiveAction.findFirst({ where: { tenantId, observationId: id }, select: { status: true, actionCode: true } });
    if (action && ['VERIFIED', 'CLOSED'].includes(action.status)) {
      throw new ConflictException(`Observation ${existing.observationCode} has verified action ${action.actionCode} and cannot be deleted.`);
    }
    await this.prisma.$transaction([
      // Its open corrective action goes with it (previously a database cascade)
      this.prisma.correctiveAction.updateMany({ where: { tenantId, observationId: id }, data: { deletedAt: new Date(), deletedById: actorId } }),
      this.prisma.observation.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } }),
    ]);
    return { success: true, message: `Observation ${existing.observationCode} deleted` };
  }
}

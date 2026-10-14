import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateObservationDto, UpdateObservationDto } from './dto/observation.dto';

@Injectable()
export class ObservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listObservations(
    tenantId: string,
    query?: { category?: string; severity?: string; status?: string; locationId?: string; executionId?: string; search?: string },
  ) {
    const where: any = { tenantId };
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
      orderBy: { createdAt: 'desc' },
    });

    return observations.map((obs) => ({
      ...obs,
      tags: typeof obs.tags === 'string' ? JSON.parse(obs.tags || '[]') : obs.tags,
      annotationData: typeof obs.annotationData === 'string' ? JSON.parse(obs.annotationData || '[]') : obs.annotationData,
    }));
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

    return {
      ...observation,
      tags: typeof observation.tags === 'string' ? JSON.parse(observation.tags || '[]') : observation.tags,
      annotationData: typeof observation.annotationData === 'string' ? JSON.parse(observation.annotationData || '[]') : observation.annotationData,
      correctiveAction: observation.correctiveAction
        ? {
            ...observation.correctiveAction,
            fiveWhyAnalysis: JSON.parse(observation.correctiveAction.fiveWhyAnalysis || '{}'),
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

    const count = await this.prisma.observation.count({ where: { tenantId } });
    const year = new Date().getFullYear();
    const cleanPrefix = location.areaCode.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase();
    let seq = count + 1;
    let observationCode = `OBS-${cleanPrefix}-${year}-${String(seq).padStart(4, '0')}`;
    while (await this.prisma.observation.findFirst({ where: { tenantId, observationCode } })) {
      seq++;
      observationCode = `OBS-${cleanPrefix}-${year}-${String(seq).padStart(4, '0')}`;
    }

    const tagsString = typeof dto.tags === 'string' ? dto.tags : JSON.stringify(dto.tags || []);
    const annotationString = typeof dto.annotationData === 'string' ? dto.annotationData : JSON.stringify(dto.annotationData || []);

    const observation = await this.prisma.observation.create({
      data: {
        tenantId,
        observationCode,
        locationId: dto.locationId,
        category: dto.category,
        severity: dto.severity,
        title: dto.title,
        description: dto.description,
        beforePhotoUrl: dto.beforePhotoUrl,
        annotatedPhotoUrl: dto.annotatedPhotoUrl || dto.beforePhotoUrl,
        annotationData: annotationString,
        status: 'OPEN',
        riskAssessment: dto.riskAssessment,
        tags: tagsString,
        loggedById,
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

  async deleteObservation(tenantId: string, id: string) {
    const existing = await this.prisma.observation.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Observation with ID '${id}' not found`);
    }

    await this.prisma.observation.delete({ where: { id } });
    return { success: true, message: `Observation ${existing.observationCode} deleted` };
  }
}

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateLocationDto, UpdateLocationDto, CreateTimelineDto, UpdateTimelineDto, AddDocumentDto } from './dto/location.dto';
import * as QRCode from 'qrcode';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveTenantId(tenantIdOrSlug: string): Promise<string> {
    if (!tenantIdOrSlug) return '39aa6fa6-fb16-44f6-81cf-05f3670f1df6';
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdOrSlug);
    if (isUuid) {
      return tenantIdOrSlug;
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantIdOrSlug },
    });
    return tenant ? tenant.id : tenantIdOrSlug;
  }

  async generateNextLocationCode(rawTenantId: string, orgNodeId?: string): Promise<string> {
    const tenantId = await this.resolveTenantId(rawTenantId);
    let basePrefix = 'LOC';

    if (orgNodeId) {
      const node = await this.prisma.orgNode.findFirst({
        where: { id: orgNodeId, tenantId },
      });
      if (node) {
        basePrefix = `LOC-${node.code}`;
      }
    }

    const existing = await this.prisma.location.findMany({
      where: {
        tenantId,
        areaCode: { startsWith: basePrefix },
      },
      select: { areaCode: true },
    });

    let maxNum = 0;
    const regex = new RegExp(`^${basePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-?(\\d+)$`, 'i');
    for (const item of existing) {
      const match = item.areaCode.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    const nextNum = maxNum + 1;
    const formattedNum = nextNum.toString().padStart(2, '0');
    return `${basePrefix}-${formattedNum}`;
  }

  async getLocations(rawTenantId: string, filters?: {
    search?: string;
    orgNodeId?: string;
    locationType?: string;
    riskLevel?: string;
    auditFrequency?: string;
    status?: string;
  }) {
    const tenantId = await this.resolveTenantId(rawTenantId);
    const where: any = { tenantId };

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { areaCode: { contains: filters.search } },
        { building: { contains: filters.search } },
      ];
    }
    if (filters?.orgNodeId) {
      where.orgNodeId = filters.orgNodeId;
    }
    if (filters?.locationType) {
      where.locationType = filters.locationType;
    }
    if (filters?.riskLevel) {
      where.riskLevel = filters.riskLevel;
    }
    if (filters?.auditFrequency) {
      where.auditFrequency = filters.auditFrequency;
    }
    if (filters?.status) {
      where.status = filters.status;
    }

    return this.prisma.location.findMany({
      where,
      include: {
        orgNode: { select: { id: true, name: true, code: true, nodeType: true, path: true } },
        owner: { select: { id: true, firstName: true, lastName: true, email: true, jobTitle: true } },
        backupOwner: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: {
          select: {
            timelines: true,
            documents: true,
            auditLogs: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLocationById(rawTenantId: string, id: string) {
    const tenantId = await this.resolveTenantId(rawTenantId);
    const location = await this.prisma.location.findFirst({
      where: { id, tenantId },
      include: {
        orgNode: {
          include: {
            parent: { select: { id: true, name: true, code: true, nodeType: true } },
          },
        },
        owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, jobTitle: true } },
        backupOwner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        timelines: {
          orderBy: { plannedStartDate: 'asc' },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        auditLogs: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, jobTitle: true, department: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!location) {
      throw new NotFoundException(`Location with ID '${id}' not found`);
    }

    // Generate QR code data URL (PNG) if not cached
    let qrPngDataUrl = '';
    try {
      const qrPayload = location.qrCodeData || `5s://${tenantId}/locations/${location.areaCode}`;
      qrPngDataUrl = await QRCode.toDataURL(qrPayload, {
        width: 300,
        margin: 2,
        color: {
          dark: '#0F172A',
          light: '#FFFFFF',
        },
      });
    } catch (e) {
      // Fallback
    }

    return {
      ...location,
      qrPngDataUrl,
    };
  }

  async createLocation(rawTenantId: string, dto: CreateLocationDto, userId?: string) {
    const tenantId = await this.resolveTenantId(rawTenantId);

    let areaCode = dto.areaCode ? dto.areaCode.trim().toUpperCase().replace(/\s+/g, '-') : '';
    if (!areaCode) {
      areaCode = await this.generateNextLocationCode(tenantId, dto.orgNodeId);
    }

    const existing = await this.prisma.location.findFirst({
      where: { tenantId, areaCode },
    });
    if (existing) {
      areaCode = await this.generateNextLocationCode(tenantId, dto.orgNodeId);
    }

    const qrCodeData = `5s://${tenantId}/locations/${areaCode}`;

    const location = await this.prisma.location.create({
      data: {
        tenantId,
        orgNodeId: dto.orgNodeId,
        areaCode,
        name: dto.name,
        locationType: dto.locationType,
        riskLevel: dto.riskLevel || 'LOW',
        auditFrequency: dto.auditFrequency || 'WEEKLY',
        building: dto.building,
        floor: dto.floor,
        description: dto.description,
        heroPhotoUrl: dto.heroPhotoUrl,
        ownerId: dto.ownerId,
        backupOwnerId: dto.backupOwnerId,
        qrCodeData,
        status: 'ACTIVE',
      },
    });

    // Create default 5S timeline milestones
    const now = new Date();
    const defaultMilestones = [
      { name: '1S - Sort & Red Tag Initial Sweep', days: 7 },
      { name: '2S - Set In Order & Visual Shadow Boards', days: 14 },
      { name: '3S - Shine & Cleaning Responsibilities', days: 21 },
      { name: '4S - Standardize & SOP Displays', days: 28 },
      { name: '5S - Sustain & Scheduled Audit Initiation', days: 35 },
    ];

    for (const m of defaultMilestones) {
      await this.prisma.locationTimeline.create({
        data: {
          tenantId,
          locationId: location.id,
          milestoneName: m.name,
          plannedStartDate: now,
          plannedEndDate: new Date(now.getTime() + m.days * 86400000),
          progressPercent: 0,
          status: 'NOT_STARTED',
          notes: 'Standard 5S Implementation Roadmap',
        },
      });
    }

    // Log creation in audit trail
    await this.prisma.locationAuditLog.create({
      data: {
        tenantId,
        locationId: location.id,
        userId: userId || null,
        actionType: 'CREATED',
        details: JSON.stringify({
          action: 'Created area master',
          areaCode: location.areaCode,
          name: location.name,
        }),
      },
    });

    return this.getLocationById(tenantId, location.id);
  }

  async updateLocation(tenantId: string, id: string, dto: UpdateLocationDto, userId?: string) {
    const existing = await this.getLocationById(tenantId, id);

    const updated = await this.prisma.location.update({
      where: { id },
      data: dto,
    });

    // Log update in audit trail
    await this.prisma.locationAuditLog.create({
      data: {
        tenantId,
        locationId: id,
        userId: userId || null,
        actionType: 'UPDATED',
        details: JSON.stringify({
          action: 'Updated area master details',
          changes: dto,
        }),
      },
    });

    return this.getLocationById(tenantId, id);
  }

  async deleteLocation(tenantId: string, id: string) {
    await this.getLocationById(tenantId, id);
    return this.prisma.location.delete({
      where: { id },
    });
  }

  // --- Location Timelines (Plan & Timeline Sub-module) ---

  async createTimeline(tenantId: string, locationId: string, dto: CreateTimelineDto, userId?: string) {
    await this.getLocationById(tenantId, locationId);

    const timeline = await this.prisma.locationTimeline.create({
      data: {
        tenantId,
        locationId,
        milestoneName: dto.milestoneName,
        plannedStartDate: new Date(dto.plannedStartDate),
        plannedEndDate: new Date(dto.plannedEndDate),
        progressPercent: dto.progressPercent || 0,
        status: dto.status || 'NOT_STARTED',
        notes: dto.notes,
      },
    });

    await this.prisma.locationAuditLog.create({
      data: {
        tenantId,
        locationId,
        userId: userId || null,
        actionType: 'TIMELINE_UPDATED',
        details: JSON.stringify({
          action: 'Added milestone',
          milestone: dto.milestoneName,
        }),
      },
    });

    return timeline;
  }

  async updateTimeline(tenantId: string, locationId: string, timelineId: string, dto: UpdateTimelineDto, userId?: string) {
    await this.getLocationById(tenantId, locationId);

    const data: any = { ...dto };
    if (dto.plannedStartDate) data.plannedStartDate = new Date(dto.plannedStartDate);
    if (dto.plannedEndDate) data.plannedEndDate = new Date(dto.plannedEndDate);
    if (dto.actualStartDate) data.actualStartDate = new Date(dto.actualStartDate);
    if (dto.actualEndDate) data.actualEndDate = new Date(dto.actualEndDate);

    const updated = await this.prisma.locationTimeline.update({
      where: { id: timelineId },
      data,
    });

    await this.prisma.locationAuditLog.create({
      data: {
        tenantId,
        locationId,
        userId: userId || null,
        actionType: 'TIMELINE_UPDATED',
        details: JSON.stringify({
          action: 'Updated milestone progress',
          milestoneId: timelineId,
          progressPercent: dto.progressPercent,
          status: dto.status,
        }),
      },
    });

    return updated;
  }

  async deleteTimeline(tenantId: string, locationId: string, timelineId: string) {
    await this.getLocationById(tenantId, locationId);
    return this.prisma.locationTimeline.delete({
      where: { id: timelineId },
    });
  }

  // --- Location Documents ---

  async addDocument(tenantId: string, locationId: string, dto: AddDocumentDto) {
    await this.getLocationById(tenantId, locationId);
    return this.prisma.locationDocument.create({
      data: {
        tenantId,
        locationId,
        title: dto.title,
        docType: dto.docType,
        fileUrl: dto.fileUrl,
        fileSizeKb: dto.fileSizeKb || 0,
        version: dto.version || '1.0',
      },
    });
  }

  async deleteDocument(tenantId: string, locationId: string, docId: string) {
    await this.getLocationById(tenantId, locationId);
    return this.prisma.locationDocument.delete({
      where: { id: docId },
    });
  }

  // --- Batch QR Generation ---

  async getBatchQrCodes(rawTenantId: string, locationIds?: string[]) {
    const tenantId = await this.resolveTenantId(rawTenantId);
    const where: any = { tenantId };
    if (locationIds && locationIds.length > 0) {
      where.id = { in: locationIds };
    }

    const locations = await this.prisma.location.findMany({
      where,
      include: {
        orgNode: { select: { name: true, code: true } },
        owner: { select: { firstName: true, lastName: true } },
      },
    });

    const qrItems = await Promise.all(
      locations.map(async (loc) => {
        const qrPayload = loc.qrCodeData || `5s://${tenantId}/location/${loc.areaCode}`;
        const qrDataUrl = await QRCode.toDataURL(qrPayload, {
          width: 300,
          margin: 1,
          color: { dark: '#0F172A', light: '#FFFFFF' },
        });

        return {
          id: loc.id,
          areaCode: loc.areaCode,
          name: loc.name,
          locationType: loc.locationType,
          building: loc.building,
          floor: loc.floor,
          orgNodeName: loc.orgNode?.name,
          ownerName: loc.owner ? `${loc.owner.firstName} ${loc.owner.lastName}` : 'Unassigned',
          qrDataUrl,
          qrPayload,
        };
      }),
    );

    return qrItems;
  }
}

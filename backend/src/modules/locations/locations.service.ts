import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SubscriptionService } from '../../core/subscription/subscription.service';
import { TenantReferenceService } from '../../core/database/tenant-reference.service';
import { CreateLocationDto, UpdateLocationDto, CreateTimelineDto, UpdateTimelineDto, AddDocumentDto } from './dto/location.dto';
import { Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';
import { buildLocationQrPayload, defaultMilestoneRows, isUsableQrPayload } from './location-qr';
import { activeAssignmentWhere } from '../../core/auth/active-assignment';

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscription: SubscriptionService,
    private readonly tenantRefs: TenantReferenceService,
  ) {}

  /** Verifies that org node and owner references in a create/update payload belong to the tenant. */
  private async assertLocationReferences(
    tenantId: string,
    dto: { orgNodeId?: string; ownerId?: string; backupOwnerId?: string },
  ) {
    await this.tenantRefs.assertOptional(tenantId, 'orgNode', dto.orgNodeId, 'Org node');
    await this.tenantRefs.assertAll(tenantId, 'user', [dto.ownerId, dto.backupOwnerId], 'owner');
  }

  async generateNextLocationCode(tenantId: string, orgNodeId?: string): Promise<string> {
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
        deletedAt: undefined, // soft-deleted codes stay reserved
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

  /**
   * "My areas" of a user: locations they own or back up, plus every location under the organization units their
   * (unexpired) role assignments are limited to, e.g. a department head scoped to the machining department.
   */
  async myAreasWhere(tenantId: string, userId: string): Promise<Prisma.LocationWhereInput> {
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { tenantId, userId, orgNodeId: { not: null }, ...activeAssignmentWhere() },
      select: { orgNodeId: true },
    });
    const nodeIds = [...new Set(assignments.map((a) => a.orgNodeId).filter((id): id is string => !!id))];
    const nodes = nodeIds.length ? await this.prisma.orgNode.findMany({ where: { tenantId, id: { in: nodeIds } }, select: { path: true } }) : [];
    return {
      OR: [
        { ownerId: userId },
        { backupOwnerId: userId },
        ...nodes.map((n) => ({ orgNode: { path: { startsWith: n.path } } })),
      ],
    };
  }

  async getLocations(tenantId: string, filters?: {
    search?: string;
    orgNodeId?: string;
    locationType?: string;
    riskLevel?: string;
    auditFrequency?: string;
    status?: string;
    /** Owner or backup owner. */
    ownerId?: string;
    /** Only this user's areas (see myAreasWhere). */
    mineOf?: string;
  }) {
    const where: Prisma.LocationWhereInput = { tenantId };
    // Owner and "my areas" filters each carry their own OR; they are combined with AND alongside the search
    const and: Prisma.LocationWhereInput[] = [];
    if (filters?.ownerId) {
      and.push({ OR: [{ ownerId: filters.ownerId }, { backupOwnerId: filters.ownerId }] });
    }
    if (filters?.mineOf) {
      and.push(await this.myAreasWhere(tenantId, filters.mineOf));
    }
    if (and.length) where.AND = and;

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { areaCode: { contains: filters.search, mode: 'insensitive' } },
        { building: { contains: filters.search, mode: 'insensitive' } },
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

  async getLocationById(tenantId: string, id: string) {
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

    const qrPayload = await this.ensureQrPayload(tenantId, location);
    let qrPngDataUrl = '';
    try {
      qrPngDataUrl = await QRCode.toDataURL(qrPayload, {
        width: 300,
        margin: 2,
        color: {
          dark: '#0F172A',
          light: '#FFFFFF',
        },
      });
    } catch {
      // The payload is a short link, so this should not fail; the page shows an empty tag if it does
    }

    return {
      ...location,
      qrCodeData: qrPayload,
      qrPngDataUrl,
    };
  }

  /**
   * Returns the location's scannable payload, repairing records that stored something the scanner cannot
   * read (e.g. a PNG data URL written by the org-hierarchy flow before payloads were unified).
   */
  private async ensureQrPayload(tenantId: string, location: { id: string; areaCode: string; qrCodeData: string | null }) {
    if (isUsableQrPayload(location.qrCodeData)) return location.qrCodeData;
    const payload = buildLocationQrPayload(tenantId, location.areaCode);
    await this.prisma.location.updateMany({ where: { id: location.id, tenantId }, data: { qrCodeData: payload } });
    return payload;
  }

  async createLocation(tenantId: string, dto: CreateLocationDto, userId?: string) {
    await this.assertLocationReferences(tenantId, dto);

    let areaCode = dto.areaCode ? dto.areaCode.trim().toUpperCase().replace(/\s+/g, '-') : '';
    if (areaCode) {
      // A code the user typed is never silently swapped for another one: printed tags would not match.
      // Soft-deleted codes stay reserved (unique index).
      const existing = await this.prisma.location.findFirst({
        where: { tenantId, areaCode, deletedAt: undefined },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(`Area code '${areaCode}' is already in use. Choose another code or leave it blank to generate one.`);
      }
    } else {
      areaCode = await this.generateNextLocationCode(tenantId, dto.orgNodeId);
    }

    const qrCodeData = buildLocationQrPayload(tenantId, areaCode);

    await this.subscription.assertWithinLimit(tenantId, 'locations');
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
    await this.prisma.locationTimeline.createMany({
      data: defaultMilestoneRows(tenantId, location.id, 'Standard 5S Implementation Roadmap'),
    });

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
    const before = await this.getLocationById(tenantId, id);
    await this.assertLocationReferences(tenantId, dto);

    await this.prisma.location.update({
      where: { id },
      data: dto,
    });

    // Log update in audit trail
    await this.prisma.locationAuditLog.create({
      data: {
        tenantId,
        locationId: id,
        userId: userId || null,
        actionType: dto.status && dto.status !== before.status ? 'STATUS_CHANGED' : 'UPDATED',
        details: JSON.stringify({
          action: 'Updated area master details',
          changes: dto,
        }),
      },
    });

    return this.getLocationById(tenantId, id);
  }

  async deleteLocation(tenantId: string, id: string, actorId: string) {
    const location = await this.getLocationById(tenantId, id);
    // Deleting must not orphan live work; audit history itself is preserved by the soft delete
    const [openActions, activeRedTags, inProgressAudits] = await Promise.all([
      this.prisma.correctiveAction.count({ where: { tenantId, locationId: id, status: { notIn: ['VERIFIED', 'CLOSED'] } } }),
      this.prisma.redTag.count({ where: { tenantId, locationId: id, status: { notIn: ['DISPOSED', 'RETURNED', 'CANCELLED'] } } }),
      this.prisma.auditExecution.count({ where: { tenantId, locationId: id, status: 'IN_PROGRESS' } }),
    ]);
    if (openActions || activeRedTags || inProgressAudits) {
      throw new ConflictException(
        `${location.name} still has ${openActions} open corrective action(s), ${activeRedTags} active red tag(s) and ${inProgressAudits} in-progress audit(s). Close or move them first, or set the location to INACTIVE.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.scheduledAuditInstance.updateMany({
        where: { tenantId, locationId: id, status: { in: ['SCHEDULED', 'OVERDUE'] } },
        data: { status: 'CANCELLED' },
      });
      return tx.location.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });
    });
  }

  // --- Location Timelines (Plan & Timeline Sub-module) ---

  private assertDateOrder(start?: string | Date | null, end?: string | Date | null) {
    if (start && end && new Date(end).getTime() < new Date(start).getTime()) {
      throw new BadRequestException('The planned end date cannot be before the planned start date.');
    }
  }

  async createTimeline(tenantId: string, locationId: string, dto: CreateTimelineDto, userId?: string) {
    await this.getLocationById(tenantId, locationId);
    this.assertDateOrder(dto.plannedStartDate, dto.plannedEndDate);

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

    const data: Prisma.LocationTimelineUpdateInput = {
      ...dto,
      plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : undefined,
      plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : undefined,
      actualStartDate: dto.actualStartDate ? new Date(dto.actualStartDate) : undefined,
      actualEndDate: dto.actualEndDate ? new Date(dto.actualEndDate) : undefined,
    };
    await this.tenantRefs.assertExists(tenantId, 'locationTimeline', timelineId, 'Timeline milestone', { locationId });
    if (dto.plannedStartDate || dto.plannedEndDate) {
      const current = await this.prisma.locationTimeline.findFirst({
        where: { id: timelineId, tenantId },
        select: { plannedStartDate: true, plannedEndDate: true },
      });
      this.assertDateOrder(dto.plannedStartDate ?? current?.plannedStartDate, dto.plannedEndDate ?? current?.plannedEndDate);
    }

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
    await this.tenantRefs.assertExists(tenantId, 'locationTimeline', timelineId, 'Timeline milestone', { locationId });
    return this.prisma.locationTimeline.delete({
      where: { id: timelineId },
    });
  }

  // --- Location Documents ---

  async addDocument(tenantId: string, locationId: string, dto: AddDocumentDto, uploadedById?: string) {
    await this.getLocationById(tenantId, locationId);
    // An uploaded file's size comes from storage, not from the client; external links have no size
    const storedId = /^\/api\/v1\/files\/([0-9a-f-]{36})$/i.exec(dto.fileUrl)?.[1];
    const stored = storedId
      ? await this.prisma.storedFile.findFirst({ where: { id: storedId.toLowerCase(), tenantId }, select: { sizeBytes: true } })
      : null;
    if (storedId && !stored) throw new BadRequestException('The attached file was not found.');
    const document = await this.prisma.locationDocument.create({
      data: {
        tenantId,
        locationId,
        title: dto.title,
        docType: dto.docType,
        fileUrl: dto.fileUrl,
        fileSizeKb: stored ? Math.max(1, Math.round(stored.sizeBytes / 1024)) : 0,
        version: dto.version || '1.0',
        uploadedById: uploadedById ?? null,
      },
    });
    await this.prisma.locationAuditLog.create({
      data: {
        tenantId,
        locationId,
        userId: uploadedById ?? null,
        actionType: 'DOCUMENT_ADDED',
        details: JSON.stringify({ action: 'Attached document', title: document.title, docType: document.docType }),
      },
    });
    return document;
  }

  async deleteDocument(tenantId: string, locationId: string, docId: string, userId?: string) {
    await this.getLocationById(tenantId, locationId);
    await this.tenantRefs.assertExists(tenantId, 'locationDocument', docId, 'Document', { locationId });
    const removed = await this.prisma.locationDocument.delete({
      where: { id: docId },
    });
    await this.prisma.locationAuditLog.create({
      data: {
        tenantId,
        locationId,
        userId: userId ?? null,
        actionType: 'DOCUMENT_REMOVED',
        details: JSON.stringify({ action: 'Removed document', title: removed.title, docType: removed.docType }),
      },
    });
    return removed;
  }

  // --- Batch QR Generation ---

  /**
   * One entry per location. A tag that cannot be generated is reported on its own entry (`qrDataUrl: null`
   * plus `error`) so one bad record never empties the whole batch.
   */
  async getBatchQrCodes(tenantId: string, locationIds?: string[], mineOf?: string) {
    const where: Prisma.LocationWhereInput = { tenantId };
    if (locationIds && locationIds.length > 0) {
      where.id = { in: locationIds };
    }
    if (mineOf) {
      where.AND = [await this.myAreasWhere(tenantId, mineOf)];
    }

    const locations = await this.prisma.location.findMany({
      where,
      include: {
        orgNode: { select: { name: true, code: true } },
        owner: { select: { firstName: true, lastName: true } },
      },
      orderBy: { areaCode: 'asc' },
    });

    return Promise.all(
      locations.map(async (loc) => {
        let qrPayload = buildLocationQrPayload(tenantId, loc.areaCode);
        let qrDataUrl: string | null = null;
        let error: string | null = null;
        try {
          qrPayload = await this.ensureQrPayload(tenantId, loc);
          qrDataUrl = await QRCode.toDataURL(qrPayload, {
            width: 300,
            margin: 1,
            color: { dark: '#0F172A', light: '#FFFFFF' },
          });
        } catch (e) {
          error = e instanceof Error ? e.message : 'The QR code could not be generated.';
        }

        return {
          id: loc.id,
          areaCode: loc.areaCode,
          name: loc.name,
          locationType: loc.locationType,
          status: loc.status,
          building: loc.building,
          floor: loc.floor,
          orgNodeName: loc.orgNode?.name ?? null,
          ownerName: loc.owner ? `${loc.owner.firstName} ${loc.owner.lastName}` : null,
          qrDataUrl,
          qrPayload,
          error,
        };
      }),
    );
  }
}

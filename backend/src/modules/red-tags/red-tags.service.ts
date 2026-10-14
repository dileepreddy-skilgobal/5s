import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateRedTagDto, UpdateRedTagDto, SubmitDispositionDto, CloseRedTagDto } from './dto/red-tag.dto';
import * as QRCode from 'qrcode';

@Injectable()
export class RedTagsService {
  constructor(private readonly prisma: PrismaService) {}

  async listRedTags(
    tenantId: string,
    query?: { status?: string; category?: string; locationId?: string; holdingAreaId?: string; ageingTier?: string; search?: string },
  ) {
    const where: any = { tenantId };
    if (query?.status) where.status = query.status;
    if (query?.category) where.category = query.category;
    if (query?.locationId) where.locationId = query.locationId;
    if (query?.holdingAreaId) where.targetHoldingAreaId = query.holdingAreaId;

    if (query?.search) {
      where.OR = [
        { itemName: { contains: query.search, mode: 'insensitive' } },
        { tagNumber: { contains: query.search, mode: 'insensitive' } },
        { reason: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const tags = await this.prisma.redTag.findMany({
      where,
      include: {
        location: { select: { id: true, name: true, areaCode: true, building: true } },
        holdingArea: { select: { id: true, name: true, areaCode: true } },
        taggedBy: { select: { id: true, firstName: true, lastName: true } },
        supervisorApprovedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { taggedDate: 'desc' },
    });

    const now = new Date();

    const mapped = tags.map((t) => {
      const days = Math.floor((now.getTime() - new Date(t.taggedDate).getTime()) / 86400000);
      let tier = '0_7_DAYS';
      if (days >= 31) tier = 'OVER_30_DAYS';
      else if (days >= 15) tier = '15_30_DAYS';
      else if (days >= 8) tier = '8_14_DAYS';

      return {
        ...t,
        ageingDays: days,
        ageingTier: tier,
      };
    });

    if (query?.ageingTier) {
      return mapped.filter((t) => t.ageingTier === query.ageingTier);
    }

    return mapped;
  }

  async getMetrics(tenantId: string) {
    const tags = await this.listRedTags(tenantId);
    const totalTags = tags.length;
    const inHolding = tags.filter((t) => t.status === 'IN_HOLDING_AREA' || t.status === 'RED_TAGGED').length;
    const pendingDisposition = tags.filter((t) => t.status === 'PENDING_DISPOSITION').length;
    const disposed = tags.filter((t) => t.status === 'DISPOSED').length;
    const overdueCount = tags.filter((t) => t.ageingDays > 30 && t.status !== 'DISPOSED').length;

    const totalValue = tags.reduce((acc, t) => acc + (t.estimatedValue || 0), 0);
    const recoveredValue = tags.reduce((acc, t) => acc + (t.financialRecovered || 0), 0);

    const ageingDistribution = {
      under7Days: tags.filter((t) => t.ageingTier === '0_7_DAYS' && t.status !== 'DISPOSED').length,
      days8To14: tags.filter((t) => t.ageingTier === '8_14_DAYS' && t.status !== 'DISPOSED').length,
      days15To30: tags.filter((t) => t.ageingTier === '15_30_DAYS' && t.status !== 'DISPOSED').length,
      over30Days: tags.filter((t) => t.ageingTier === 'OVER_30_DAYS' && t.status !== 'DISPOSED').length,
    };

    // Zone-wise Breakdown
    const zoneMap = new Map<string, any>();
    for (const t of tags) {
      const locId = t.locationId || 'unassigned';
      const locName = (t as any).location?.name || 'Unassigned Zone';
      const areaCode = (t as any).location?.areaCode || 'N/A';
      const building = (t as any).location?.building || 'Main Plant';

      if (!zoneMap.has(locId)) {
        zoneMap.set(locId, {
          locationId: locId,
          locationName: locName,
          areaCode,
          building,
          totalTags: 0,
          activeTags: 0,
          inHolding: 0,
          pendingDisposition: 0,
          disposed: 0,
          overdueCount: 0,
          totalValue: 0,
          recoveredValue: 0,
        });
      }

      const zm = zoneMap.get(locId);
      zm.totalTags++;
      if (t.status !== 'DISPOSED') zm.activeTags++;
      if (t.status === 'IN_HOLDING_AREA' || t.status === 'RED_TAGGED') zm.inHolding++;
      if (t.status === 'PENDING_DISPOSITION') zm.pendingDisposition++;
      if (t.status === 'DISPOSED') zm.disposed++;
      if (t.ageingDays > 30 && t.status !== 'DISPOSED') zm.overdueCount++;
      zm.totalValue += (t.estimatedValue || 0);
      zm.recoveredValue += (t.financialRecovered || 0);
    }

    const zoneBreakdown = Array.from(zoneMap.values());

    return {
      totalTags,
      inHolding,
      pendingDisposition,
      disposed,
      overdueCount,
      totalValue,
      recoveredValue,
      ageingDistribution,
      zoneBreakdown,
    };
  }

  async getRedTagById(tenantId: string, id: string) {
    const tag = await this.prisma.redTag.findFirst({
      where: { id, tenantId },
      include: {
        location: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
            orgNode: { select: { id: true, name: true, code: true } },
          },
        },
        holdingArea: { select: { id: true, name: true, areaCode: true, building: true } },
        taggedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        disposedBy: { select: { id: true, firstName: true, lastName: true } },
        supervisorApprovedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!tag) {
      throw new NotFoundException(`Red tag with ID '${id}' not found`);
    }

    const now = new Date();
    const days = Math.floor((now.getTime() - new Date(tag.taggedDate).getTime()) / 86400000);
    let tier = '0_7_DAYS';
    if (days >= 31) tier = 'OVER_30_DAYS';
    else if (days >= 15) tier = '15_30_DAYS';
    else if (days >= 8) tier = '8_14_DAYS';

    return {
      ...tag,
      ageingDays: days,
      ageingTier: tier,
    };
  }

  async createRedTag(tenantId: string, taggedById: string | null, dto: CreateRedTagDto) {
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId },
    });
    if (!location) {
      throw new NotFoundException(`Location '${dto.locationId}' not found`);
    }

    const count = await this.prisma.redTag.count({ where: { tenantId } });
    const year = new Date().getFullYear();
    const cleanPrefix = location.areaCode.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase();
    let seq = count + 1;
    let tagNumber = `RT-${cleanPrefix}-${year}-${String(seq).padStart(4, '0')}`;
    while (await this.prisma.redTag.findFirst({ where: { tenantId, tagNumber } })) {
      seq++;
      tagNumber = `RT-${cleanPrefix}-${year}-${String(seq).padStart(4, '0')}`;
    }

    // Generate Tag QR Code
    const qrPayload = JSON.stringify({
      type: '5S_RED_TAG',
      tagNumber,
      locationId: dto.locationId,
      itemName: dto.itemName,
    });
    const qrCodeUrl = await QRCode.toDataURL(qrPayload, { width: 300, margin: 2 });

    const targetDate = dto.targetDispositionDate ? new Date(dto.targetDispositionDate) : new Date(Date.now() + 14 * 86400000); // 14 days default holding

    const redTag = await this.prisma.redTag.create({
      data: {
        tenantId,
        tagNumber,
        qrCodeUrl,
        locationId: dto.locationId,
        targetHoldingAreaId: dto.targetHoldingAreaId,
        itemName: dto.itemName,
        itemDescription: dto.itemDescription,
        category: dto.category,
        quantity: dto.quantity || 1,
        unitOfMeasure: dto.unitOfMeasure || 'PCS',
        estimatedValue: dto.estimatedValue,
        taggedById,
        reason: dto.reason,
        photoUrl: dto.photoUrl,
        status: dto.targetHoldingAreaId ? 'IN_HOLDING_AREA' : 'RED_TAGGED',
        targetDispositionDate: targetDate,
      },
    });

    return this.getRedTagById(tenantId, redTag.id);
  }

  async updateRedTag(tenantId: string, id: string, dto: UpdateRedTagDto) {
    const existing = await this.prisma.redTag.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Red tag '${id}' not found`);
    }

    const data: any = { ...dto };
    if (dto.targetDispositionDate) {
      data.targetDispositionDate = new Date(dto.targetDispositionDate);
    }

    await this.prisma.redTag.update({
      where: { id },
      data,
    });

    return this.getRedTagById(tenantId, id);
  }

  async submitDisposition(tenantId: string, id: string, supervisorId: string | null, dto: SubmitDispositionDto) {
    const existing = await this.prisma.redTag.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Red tag '${id}' not found`);
    }

    const status = dto.supervisorApproved ? 'DISPOSITION_APPROVED' : 'PENDING_DISPOSITION';

    await this.prisma.redTag.update({
      where: { id },
      data: {
        dispositionAction: dto.dispositionAction,
        dispositionJustification: dto.dispositionJustification,
        supervisorApprovedById: supervisorId,
        status,
      },
    });

    return this.getRedTagById(tenantId, id);
  }

  async closeRedTag(tenantId: string, id: string, disposedById: string | null, dto: CloseRedTagDto) {
    const existing = await this.prisma.redTag.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Red tag '${id}' not found`);
    }

    await this.prisma.redTag.update({
      where: { id },
      data: {
        status: 'DISPOSED',
        actualDispositionDate: new Date(),
        disposedById,
        closurePhotoUrl: dto.closurePhotoUrl,
        financialRecovered: dto.financialRecovered,
      },
    });

    return this.getRedTagById(tenantId, id);
  }

  async deleteRedTag(tenantId: string, id: string) {
    const existing = await this.prisma.redTag.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Red tag '${id}' not found`);
    }

    await this.prisma.redTag.delete({ where: { id } });
    return { success: true, message: `Red tag ${existing.tagNumber} deleted` };
  }
}

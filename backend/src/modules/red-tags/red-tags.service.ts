import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { getFrontendUrl } from '../../core/config/app-url';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { TenantSettingsService } from '../../core/config/tenant-settings.service';
import { documentPrefix } from '../../core/config/tenant-settings';
import { TenantReferenceService } from '../../core/database/tenant-reference.service';
import { CreateRedTagDto, UpdateRedTagDto, SubmitDispositionDto, CloseRedTagDto, MoveToHoldingDto, RejectDispositionDto } from './dto/red-tag.dto';
import * as QRCode from 'qrcode';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { RoleGroups } from '../../core/guards/role-groups';
import { nextSequenceCode, codeFragment } from '../../core/database/sequence-code';

/** Statuses in which a red tag is still being worked (not yet decided or finished). */
const ACTIVE_RED_TAG_STATUSES = ['RED_TAGGED', 'IN_HOLDING_AREA', 'PENDING_DISPOSITION'] as const;
/** Statuses in which a tag still holds an item in the red-tag process (value on hold, ageing). */
const OPEN_RED_TAG_STATUSES: readonly string[] = [...ACTIVE_RED_TAG_STATUSES, 'DISPOSITION_APPROVED'];
/** Final statuses: the item has left the process. */
const CLOSED_RED_TAG_STATUSES: readonly string[] = ['DISPOSED', 'RETURNED', 'CANCELLED'];
/** Dispositions that keep the item in service; closing them returns it rather than disposing of it. */
const KEEP_IN_SERVICE_DISPOSITIONS = ['RELOCATE', 'REUSE', 'REPAIR_RESTORE', 'KEEP_JUSTIFIED'];

const DAY_MS = 86400000;

/** Link printed on the tag's QR code: opens the tag in the web app. */
function redTagLink(id: string): string {
  return `${getFrontendUrl()}/red-tags?id=${encodeURIComponent(id)}`;
}

function redTagQrCode(id: string): Promise<string> {
  return QRCode.toDataURL(redTagLink(id), { width: 300, margin: 2 });
}

/**
 * Days the item spent tagged: up to today while it is open, and up to its closure once it is finished
 * (disposal date, or the last update for a cancelled tag) so closed tags stop ageing.
 */
function ageingOf(
  tag: { status: string; taggedDate: Date; actualDispositionDate: Date | null; updatedAt: Date; targetDispositionDate: Date | null },
  now: Date,
) {
  const end = CLOSED_RED_TAG_STATUSES.includes(tag.status) ? tag.actualDispositionDate ?? tag.updatedAt : now;
  const days = Math.max(0, Math.floor((end.getTime() - tag.taggedDate.getTime()) / DAY_MS));
  let tier = '0_7_DAYS';
  if (days >= 31) tier = 'OVER_30_DAYS';
  else if (days >= 15) tier = '15_30_DAYS';
  else if (days >= 8) tier = '8_14_DAYS';
  // Past its decide-by date while the item is still in the red-tag process
  const target = tag.targetDispositionDate;
  const isPastTarget = OPEN_RED_TAG_STATUSES.includes(tag.status) && !!target && target < now;
  const daysPastTarget = isPastTarget && target ? Math.max(1, Math.ceil((now.getTime() - target.getTime()) / DAY_MS)) : 0;
  return { ageingDays: days, ageingTier: tier, isPastTarget, daysPastTarget };
}

/** Holding-area figures for the register summary (tags not yet moved have no holding area). */
export interface HoldingAreaMetrics {
  holdingAreaId: string | null;
  name: string;
  areaCode: string | null;
  openTags: number;
  pastTarget: number;
  totalValue: number;
}

export interface ZoneMetrics {
  locationId: string;
  locationName: string;
  areaCode: string;
  building: string | null;
  totalTags: number;
  activeTags: number;
  inHolding: number;
  pendingDisposition: number;
  disposed: number;
  overdueCount: number;
  totalValue: number;
  recoveredValue: number;
}

@Injectable()
export class RedTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: TenantSettingsService,
    private readonly tenantRefs: TenantReferenceService,
    private readonly notifications: NotificationsService,
  ) {}

  async listRedTags(
    tenantId: string,
    query?: {
      status?: string;
      category?: string;
      locationId?: string;
      holdingAreaId?: string;
      ageingTier?: string;
      search?: string;
      /** Only open tags past their decide-by date. */
      overdue?: boolean;
    },
  ) {
    const where: Prisma.RedTagWhereInput = { tenantId };
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
        disposedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { taggedDate: 'desc' },
    });

    const now = new Date();
    const actions = await this.linkedActions(tenantId, tags.map((t) => t.id));
    let mapped = tags.map((t) => ({ ...t, ...ageingOf(t, now), correctiveAction: actions.get(t.id) ?? null }));

    if (query?.ageingTier) mapped = mapped.filter((t) => t.ageingTier === query.ageingTier);
    if (query?.overdue) mapped = mapped.filter((t) => t.isPastTarget);
    return mapped;
  }

  /** Latest corrective action raised from each tag (CorrectiveAction.redTagId). */
  private async linkedActions(tenantId: string, tagIds: string[]) {
    const result = new Map<string, { id: string; actionCode: string; status: string }>();
    if (!tagIds.length) return result;
    const rows = await this.prisma.correctiveAction.findMany({
      where: { tenantId, redTagId: { in: tagIds } },
      select: { id: true, actionCode: true, status: true, redTagId: true },
      orderBy: { createdAt: 'desc' },
    });
    for (const r of rows) {
      if (r.redTagId && !result.has(r.redTagId)) result.set(r.redTagId, { id: r.id, actionCode: r.actionCode, status: r.status });
    }
    return result;
  }

  /**
   * Register KPIs. Value on hold, ageing and overdue counts cover open tags only; disposed, returned and
   * cancelled tags have left the process. Zone figures use the same rules.
   */
  async getMetrics(tenantId: string) {
    const tags = await this.listRedTags(tenantId);
    const open = tags.filter((t) => OPEN_RED_TAG_STATUSES.includes(t.status));
    const isOverdue = (t: { ageingDays: number }) => t.ageingDays > 30;
    const totalTags = tags.length;
    const inHolding = tags.filter((t) => t.status === 'IN_HOLDING_AREA' || t.status === 'RED_TAGGED').length;
    const pendingDisposition = tags.filter((t) => t.status === 'PENDING_DISPOSITION').length;
    const disposed = tags.filter((t) => t.status === 'DISPOSED').length;
    const overdueCount = open.filter(isOverdue).length;

    const totalValue = open.reduce((acc, t) => acc + (t.estimatedValue || 0), 0);
    const recoveredValue = tags.reduce((acc, t) => acc + (t.financialRecovered || 0), 0);

    const ageingDistribution = {
      under7Days: open.filter((t) => t.ageingTier === '0_7_DAYS').length,
      days8To14: open.filter((t) => t.ageingTier === '8_14_DAYS').length,
      days15To30: open.filter((t) => t.ageingTier === '15_30_DAYS').length,
      over30Days: open.filter((t) => t.ageingTier === 'OVER_30_DAYS').length,
    };

    // Zone-wise breakdown
    const zoneMap = new Map<string, ZoneMetrics>();
    for (const t of tags) {
      let zm = zoneMap.get(t.locationId);
      if (!zm) {
        zm = {
          locationId: t.locationId,
          locationName: t.location?.name ?? '',
          areaCode: t.location?.areaCode ?? '',
          building: t.location?.building ?? null,
          totalTags: 0,
          activeTags: 0,
          inHolding: 0,
          pendingDisposition: 0,
          disposed: 0,
          overdueCount: 0,
          totalValue: 0,
          recoveredValue: 0,
        };
        zoneMap.set(t.locationId, zm);
      }

      const isOpen = OPEN_RED_TAG_STATUSES.includes(t.status);
      zm.totalTags++;
      if (isOpen) zm.activeTags++;
      if (t.status === 'IN_HOLDING_AREA' || t.status === 'RED_TAGGED') zm.inHolding++;
      if (t.status === 'PENDING_DISPOSITION') zm.pendingDisposition++;
      if (t.status === 'DISPOSED') zm.disposed++;
      if (isOpen && isOverdue(t)) zm.overdueCount++;
      if (isOpen) zm.totalValue += t.estimatedValue || 0;
      zm.recoveredValue += t.financialRecovered || 0;
    }

    const zoneBreakdown = Array.from(zoneMap.values());

    // Where open items physically wait for a decision
    const holdingMap = new Map<string, HoldingAreaMetrics>();
    for (const t of open) {
      const key = t.targetHoldingAreaId ?? '';
      let hm = holdingMap.get(key);
      if (!hm) {
        hm = {
          holdingAreaId: t.targetHoldingAreaId,
          name: t.holdingArea?.name ?? 'Not yet moved',
          areaCode: t.holdingArea?.areaCode ?? null,
          openTags: 0,
          pastTarget: 0,
          totalValue: 0,
        };
        holdingMap.set(key, hm);
      }
      hm.openTags++;
      if (t.isPastTarget) hm.pastTarget++;
      hm.totalValue += t.estimatedValue || 0;
    }
    const holdingAreaBreakdown = Array.from(holdingMap.values()).sort((a, b) => b.openTags - a.openTags);

    return {
      totalTags,
      pastTargetCount: open.filter((t) => t.isPastTarget).length,
      holdingAreaBreakdown,
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
    const actions = await this.linkedActions(tenantId, [tag.id]);

    return {
      ...tag,
      correctiveAction: actions.get(tag.id) ?? null,
      // Always encode the current link (older tags were printed with a data payload instead)
      qrCodeUrl: await redTagQrCode(tag.id),
      ...ageingOf(tag, new Date()),
    };
  }

  async createRedTag(tenantId: string, taggedById: string | null, dto: CreateRedTagDto) {
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId },
    });
    if (!location) {
      throw new NotFoundException(`Location '${dto.locationId}' not found`);
    }
    await this.tenantRefs.assertOptional(tenantId, 'location', dto.targetHoldingAreaId, 'Holding area');

    const numberingSettings = await this.settingsService.get(tenantId);
    const tagNumber = await nextSequenceCode(documentPrefix(numberingSettings, 'redTag', codeFragment(location.areaCode), new Date().getFullYear()), (prefix) =>
      this.prisma.redTag
        .findMany({ where: { tenantId, tagNumber: { startsWith: prefix }, deletedAt: undefined }, select: { tagNumber: true } })
        .then((rows) => rows.map((r) => r.tagNumber)),
    );

    // The QR code links to the tag itself, so the id is assigned up front
    const id = randomUUID();
    const qrCodeUrl = await redTagQrCode(id);

    const targetDate = dto.targetDispositionDate ? new Date(dto.targetDispositionDate) : new Date(Date.now() + 14 * 86400000); // 14 days default holding

    const redTag = await this.prisma.redTag.create({
      data: {
        id,
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
    const existing = await this.getRedTagForStep(tenantId, id, ACTIVE_RED_TAG_STATUSES, 'edited');
    await this.tenantRefs.assertOptional(tenantId, 'location', dto.targetHoldingAreaId, 'Holding area');

    // Disposition and closure have dedicated workflow steps; only these manual moves are allowed here
    if (dto.status !== undefined && dto.status !== existing.status) {
      const allowedManual =
        (dto.status === 'IN_HOLDING_AREA' && existing.status === 'RED_TAGGED') || dto.status === 'CANCELLED';
      if (!allowedManual) {
        throw new ConflictException(
          `Red tag status cannot be changed from ${existing.status} to ${dto.status} directly. Use the disposition and close steps.`,
        );
      }
    }

    const { targetDispositionDate, ...rest } = dto;
    await this.prisma.redTag.update({
      where: { id },
      data: {
        ...rest,
        ...(targetDispositionDate ? { targetDispositionDate: new Date(targetDispositionDate) } : {}),
      },
    });

    return this.getRedTagById(tenantId, id);
  }

  async submitDisposition(tenantId: string, id: string, actor: AuthenticatedUser, dto: SubmitDispositionDto) {
    const existing = await this.getRedTagForStep(tenantId, id, [...ACTIVE_RED_TAG_STATUSES, 'DISPOSITION_APPROVED'], 'dispositioned');

    // Area owners may propose a disposition; approving it requires supervisor authority
    const closers: readonly string[] = RoleGroups.RED_TAG_CLOSERS;
    const isSupervisor = actor.isSuperAdmin || actor.roles.some((r) => closers.includes(r));
    if (dto.supervisorApproved && !isSupervisor) {
      throw new ForbiddenException('Only a supervisor can approve a red tag disposition. Submit it for approval instead.');
    }

    const status = dto.supervisorApproved ? 'DISPOSITION_APPROVED' : 'PENDING_DISPOSITION';

    const updated = await this.prisma.redTag.updateMany({
      where: { id, tenantId, status: existing.status },
      data: {
        dispositionAction: dto.dispositionAction,
        dispositionJustification: dto.dispositionJustification,
        supervisorApprovedById: dto.supervisorApproved ? actor.userId : null,
        // An approved decision supersedes an earlier rejection; a new proposal keeps it visible for context
        ...(dto.supervisorApproved ? { dispositionRejectionReason: null } : {}),
        status,
      },
    });
    if (updated.count === 0) {
      throw new ConflictException(`Red tag ${existing.tagNumber} was changed by someone else. Reload and try again.`);
    }

    if (status === 'PENDING_DISPOSITION') {
      const loc = await this.prisma.location.findFirst({
        where: { id: existing.locationId, tenantId },
        select: { name: true, ownerId: true, backupOwnerId: true, orgNode: { select: { path: true } } },
      });
      const approvers = await this.notifications.resolveRecipients(
        { tenantId, location: loc ? { ownerId: loc.ownerId, backupOwnerId: loc.backupOwnerId, orgNodePath: loc.orgNode?.path ?? null } : null },
        ['DEPT_HEAD', 'COORDINATOR_5S'],
      );
      await this.notifications.notify({
        tenantId,
        userIds: approvers,
        excludeUserId: actor.userId,
        type: 'RED_TAG_APPROVAL_NEEDED',
        title: `Red tag ${existing.tagNumber} needs a disposition decision`,
        body: `${dto.dispositionAction} was proposed for "${existing.itemName}"${loc ? ` at ${loc.name}` : ''}.`,
        entityType: 'RedTag',
        entityId: id,
        link: `/red-tags?id=${id}`,
      });
    }

    return this.getRedTagById(tenantId, id);
  }

  async closeRedTag(tenantId: string, id: string, disposedById: string, dto: CloseRedTagDto) {
    const existing = await this.getRedTagForStep(tenantId, id, ['DISPOSITION_APPROVED'], 'closed');

    // What was actually done decides the outcome (defaults to the approved decision)
    const actual = dto.actualDispositionAction ?? existing.dispositionAction ?? '';
    const keptInService = KEEP_IN_SERVICE_DISPOSITIONS.includes(actual);
    // A disposal leaves no item behind to check later, so the photo is the only evidence
    if (!keptInService && !dto.closurePhotoUrl) {
      throw new BadRequestException(`Add a photo of the disposal before closing red tag ${existing.tagNumber}.`);
    }
    const updated = await this.prisma.redTag.updateMany({
      where: { id, tenantId, status: 'DISPOSITION_APPROVED' },
      data: {
        status: keptInService ? 'RETURNED' : 'DISPOSED',
        actualDispositionDate: new Date(),
        actualDispositionAction: actual || null,
        disposedById,
        closurePhotoUrl: dto.closurePhotoUrl,
        financialRecovered: dto.financialRecovered,
      },
    });
    if (updated.count === 0) {
      throw new ConflictException(`Red tag ${existing.tagNumber} was changed by someone else. Reload and try again.`);
    }

    return this.getRedTagById(tenantId, id);
  }

  /** The item was moved to a red-tag holding area (or from one holding area to another). */
  async moveToHolding(tenantId: string, id: string, dto: MoveToHoldingDto) {
    const existing = await this.getRedTagForStep(tenantId, id, ['RED_TAGGED', 'IN_HOLDING_AREA'], 'moved');
    await this.tenantRefs.assertExists(tenantId, 'location', dto.holdingAreaId, 'Holding area');
    if (dto.holdingAreaId === existing.locationId) {
      throw new BadRequestException('Choose a holding area other than the place where the item was found.');
    }
    const updated = await this.prisma.redTag.updateMany({
      where: { id, tenantId, status: existing.status },
      data: { status: 'IN_HOLDING_AREA', targetHoldingAreaId: dto.holdingAreaId },
    });
    if (updated.count === 0) {
      throw new ConflictException(`Red tag ${existing.tagNumber} was changed by someone else. Reload and try again.`);
    }
    return this.getRedTagById(tenantId, id);
  }

  /** Supervisor approves the decision proposed for the item. */
  async approveDisposition(tenantId: string, id: string, actor: AuthenticatedUser) {
    const existing = await this.getRedTagForStep(tenantId, id, ['PENDING_DISPOSITION'], 'approved');
    const updated = await this.prisma.redTag.updateMany({
      where: { id, tenantId, status: 'PENDING_DISPOSITION' },
      data: { status: 'DISPOSITION_APPROVED', supervisorApprovedById: actor.userId, dispositionRejectionReason: null },
    });
    if (updated.count === 0) {
      throw new ConflictException(`Red tag ${existing.tagNumber} was changed by someone else. Reload and try again.`);
    }
    await this.notifications.notify({
      tenantId,
      userIds: [existing.taggedById],
      excludeUserId: actor.userId,
      type: 'RED_TAG_DECISION_APPROVED',
      title: `Decision for red tag ${existing.tagNumber} approved`,
      body: `The decision (${existing.dispositionAction ?? 'not recorded'}) for "${existing.itemName}" was approved and can be carried out.`,
      entityType: 'RedTag',
      entityId: id,
      link: `/red-tags?id=${id}`,
    });
    return this.getRedTagById(tenantId, id);
  }

  /** Supervisor rejects the proposed decision; the tag waits for a new decision and keeps the reason. */
  async rejectDisposition(tenantId: string, id: string, actor: AuthenticatedUser, dto: RejectDispositionDto) {
    const existing = await this.getRedTagForStep(tenantId, id, ['PENDING_DISPOSITION'], 'rejected');
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Give the reason for rejecting the decision.');
    }
    const updated = await this.prisma.redTag.updateMany({
      where: { id, tenantId, status: 'PENDING_DISPOSITION' },
      data: {
        status: existing.targetHoldingAreaId ? 'IN_HOLDING_AREA' : 'RED_TAGGED',
        dispositionRejectionReason: reason,
        supervisorApprovedById: null,
      },
    });
    if (updated.count === 0) {
      throw new ConflictException(`Red tag ${existing.tagNumber} was changed by someone else. Reload and try again.`);
    }
    await this.notifications.notify({
      tenantId,
      userIds: [existing.taggedById],
      excludeUserId: actor.userId,
      type: 'RED_TAG_DECISION_REJECTED',
      title: `Decision for red tag ${existing.tagNumber} rejected`,
      body: `The proposed decision for "${existing.itemName}" was rejected: ${reason}`,
      entityType: 'RedTag',
      entityId: id,
      link: `/red-tags?id=${id}`,
    });
    return this.getRedTagById(tenantId, id);
  }

  async deleteRedTag(tenantId: string, id: string, actorId: string) {
    const existing = await this.prisma.redTag.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Red tag '${id}' not found`);
    }
    // Finished tags (disposed, or returned to service) are part of the record and cannot be deleted
    if (existing.status === 'DISPOSED' || existing.status === 'RETURNED') {
      throw new ConflictException(`Red tag ${existing.tagNumber} is ${existing.status} and cannot be deleted.`);
    }

    await this.prisma.redTag.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });
    return { id: existing.id, tagNumber: existing.tagNumber, deleted: true };
  }

  /** Loads a red tag of the tenant, enforcing the statuses in which the requested step is allowed. */
  private async getRedTagForStep(tenantId: string, id: string, allowed: readonly string[], step: string) {
    const existing = await this.prisma.redTag.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Red tag '${id}' not found`);
    }
    if (!allowed.includes(existing.status)) {
      throw new ConflictException(`Red tag ${existing.tagNumber} cannot be ${step} while it is ${existing.status}.`);
    }
    return existing;
  }
}

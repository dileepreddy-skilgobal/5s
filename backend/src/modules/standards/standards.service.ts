import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { TenantReferenceService } from '../../core/database/tenant-reference.service';
import { Prisma } from '@prisma/client';
import { CreateStandardDto, CreateRevisionDto, ApproveRevisionDto, RejectRevisionDto, UpdateStandardDto } from './dto/standard.dto';

/** Stored JSON arrays (rules, photos); anything unreadable becomes an empty list. */
const parseJsonArray = (raw: string | null): unknown[] => {
  try {
    const value: unknown = JSON.parse(raw || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

@Injectable()
export class StandardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantRefs: TenantReferenceService,
  ) {}

  /** Verifies that scope targets (org node / location) belong to the tenant. */
  private async assertScopeTargets(tenantId: string, data: { targetOrgNodeId?: string | null; targetLocationId?: string | null }) {
    await this.tenantRefs.assertOptional(tenantId, 'orgNode', data.targetOrgNodeId, 'Target org node');
    await this.tenantRefs.assertOptional(tenantId, 'location', data.targetLocationId, 'Target location');
  }

  /**
   * A plant / department standard needs the org unit it applies to and a specific-location standard needs the
   * location; the target that does not belong to the scope is cleared.
   */
  private scopeTargets(scopeType: string, targetOrgNodeId?: string | null, targetLocationId?: string | null) {
    if ((scopeType === 'PLANT' || scopeType === 'DEPARTMENT') && !targetOrgNodeId) {
      throw new BadRequestException(`A ${scopeType === 'PLANT' ? 'plant' : 'department'} standard needs the organization unit it applies to.`);
    }
    if (scopeType === 'SPECIFIC_LOCATION' && !targetLocationId) {
      throw new BadRequestException('A specific-location standard needs the location it applies to.');
    }
    return {
      targetOrgNodeId: scopeType === 'PLANT' || scopeType === 'DEPARTMENT' ? targetOrgNodeId ?? null : null,
      targetLocationId: scopeType === 'SPECIFIC_LOCATION' ? targetLocationId ?? null : null,
    };
  }

  async getStandards(tenantId: string, filters?: {
    category?: string;
    scopeType?: string;
    status?: string;
    search?: string;
  }) {
    const where: Prisma.StandardWhereInput = { tenantId };
    if (filters?.category) where.category = filters.category;
    if (filters?.scopeType) where.scopeType = filters.scopeType;
    if (filters?.status) where.status = filters.status;
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const standards = await this.prisma.standard.findMany({
      where,
      include: {
        targetOrgNode: { select: { id: true, name: true, code: true } },
        targetLocation: { select: { id: true, name: true, areaCode: true } },
        revisions: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { id: true, firstName: true, lastName: true } },
            approver: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Every revision is returned with parsed rules and photos (the list shows the revision in force or awaiting approval)
    return standards.map((std) => {
      const revisions = std.revisions.map((r) => ({
        ...r,
        rules: parseJsonArray(r.rules),
        referencePhotos: parseJsonArray(r.referencePhotos),
      }));
      const currentRev = revisions.find((r) => r.isCurrent) || revisions[0];
      return { ...std, revisions, currentRevision: currentRev ?? null };
    });
  }

  /**
   * Published standards that apply to a location: organization-wide ones, those scoped to the location's
   * organization unit or any unit above it, and those written for the location itself. Each comes with the
   * approved revision in force; standards without one are left out.
   */
  async getStandardsForLocation(tenantId: string, locationId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
      select: { id: true, orgNodeId: true },
    });
    if (!location) {
      throw new NotFoundException(`Location '${locationId}' not found`);
    }
    // The location's unit and every unit above it (walked by parent, bounded against corrupt cycles)
    const ancestors: Array<{ id: string }> = [];
    let cursor: string | null = location.orgNodeId;
    for (let depth = 0; cursor && depth < 32; depth++) {
      const node: { id: string; parentId: string | null } | null = await this.prisma.orgNode.findFirst({
        where: { id: cursor, tenantId },
        select: { id: true, parentId: true },
      });
      if (!node || ancestors.some((a) => a.id === node.id)) break;
      ancestors.push({ id: node.id });
      cursor = node.parentId;
    }

    const standards = await this.prisma.standard.findMany({
      where: {
        tenantId,
        status: 'PUBLISHED',
        OR: [
          { scopeType: 'GLOBAL' },
          { scopeType: 'SPECIFIC_LOCATION', targetLocationId: location.id },
          ...(ancestors.length ? [{ scopeType: { in: ['PLANT', 'DEPARTMENT'] }, targetOrgNodeId: { in: ancestors.map((a) => a.id) } }] : []),
        ],
      },
      include: {
        targetOrgNode: { select: { id: true, name: true, code: true } },
        targetLocation: { select: { id: true, name: true, areaCode: true } },
        revisions: {
          where: { isCurrent: true, approvedAt: { not: null } },
          take: 1,
          include: { approver: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });

    return standards
      .filter((std) => std.revisions.length > 0)
      .map(({ revisions, ...std }) => {
        const rev = revisions[0];
        return {
          ...std,
          appliesVia: std.scopeType === 'GLOBAL' ? 'ORGANIZATION' : std.scopeType === 'SPECIFIC_LOCATION' ? 'LOCATION' : 'ORG_UNIT',
          currentRevision: { ...rev, rules: parseJsonArray(rev.rules), referencePhotos: parseJsonArray(rev.referencePhotos) },
        };
      });
  }

  async getStandardById(tenantId: string, id: string) {
    const std = await this.prisma.standard.findFirst({
      where: { id, tenantId },
      include: {
        targetOrgNode: true,
        targetLocation: true,
        revisions: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { id: true, firstName: true, lastName: true, email: true } },
            approver: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        questions: {
          include: {
            section: {
              include: {
                templateVersion: {
                  include: {
                    template: { select: { id: true, code: true, name: true, auditType: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!std) {
      throw new NotFoundException(`Standard with ID '${id}' not found`);
    }

    // The rejecting approver has no relation in the schema; names are looked up in one query
    const rejecterIds = [...new Set(std.revisions.map((r) => r.rejectedById).filter((v): v is string => !!v))];
    const rejecters = rejecterIds.length
      ? await this.prisma.user.findMany({ where: { tenantId, id: { in: rejecterIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : [];
    const rejecterById = new Map(rejecters.map((u) => [u.id, u]));

    const formattedRevisions = std.revisions.map((r) => ({
      ...r,
      rules: parseJsonArray(r.rules),
      referencePhotos: parseJsonArray(r.referencePhotos),
      rejectedBy: r.rejectedById ? rejecterById.get(r.rejectedById) ?? null : null,
    }));
    const currentRev = formattedRevisions.find((r) => r.isCurrent) || formattedRevisions[0] || null;

    return {
      ...std,
      revisions: formattedRevisions,
      currentRevision: currentRev,
    };
  }

  async updateStandard(tenantId: string, id: string, data: UpdateStandardDto) {
    const current = await this.getStandardById(tenantId, id);
    await this.assertScopeTargets(tenantId, data);
    // Publishing goes through revision approval; re-publishing (e.g. un-archiving) needs an approved revision
    if (data.status === 'PUBLISHED' && current.status !== 'PUBLISHED' && !current.revisions.some((r) => r.approvedAt)) {
      throw new BadRequestException('This standard has no approved revision yet. Approve a revision to publish it.');
    }
    const scopeChanged = data.scopeType !== undefined || data.targetOrgNodeId !== undefined || data.targetLocationId !== undefined;
    const targets = scopeChanged
      ? this.scopeTargets(
          data.scopeType ?? current.scopeType,
          data.targetOrgNodeId !== undefined ? data.targetOrgNodeId : current.targetOrgNodeId,
          data.targetLocationId !== undefined ? data.targetLocationId : current.targetLocationId,
        )
      : {};
    return this.prisma.standard.update({
      where: { id },
      data: {
        title: data.title !== undefined ? data.title.trim() : undefined,
        category: data.category,
        scopeType: data.scopeType,
        ...targets,
        status: data.status,
      },
    });
  }

  /** New standards start as DRAFT with an unapproved revision 1.0; approving that revision publishes them. */
  async createStandard(tenantId: string, dto: CreateStandardDto, userId?: string) {
    await this.assertScopeTargets(tenantId, dto);
    const scopeType = dto.scopeType || 'GLOBAL';
    const targets = this.scopeTargets(scopeType, dto.targetOrgNodeId || null, dto.targetLocationId || null);
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.standard.findFirst({
      where: { tenantId, code },
    });
    if (existing) {
      throw new ConflictException(`Standard with code '${code}' already exists in this tenant`);
    }

    const standard = await this.prisma.standard.create({
      data: {
        tenantId,
        code,
        title: dto.title.trim(),
        category: dto.category,
        scopeType,
        ...targets,
        status: 'DRAFT',
      },
    });

    await this.prisma.standardRevision.create({
      data: {
        tenantId,
        standardId: standard.id,
        revisionNumber: '1.0',
        description: dto.description,
        rules: JSON.stringify(dto.rules || []),
        referencePhotos: JSON.stringify(dto.referencePhotos || []),
        videoUrl: dto.videoUrl || null,
        sopDocumentUrl: dto.sopDocumentUrl || null,
        revisionComments: null,
        authorId: userId || null,
        isCurrent: false,
      },
    });

    return this.getStandardById(tenantId, standard.id);
  }

  /** Drafts a revision. The approved revision stays in force until an approver approves the draft. */
  async createRevision(tenantId: string, standardId: string, dto: CreateRevisionDto, userId?: string) {
    await this.getStandardById(tenantId, standardId);

    await this.prisma.standardRevision.create({
      data: {
        tenantId,
        standardId,
        revisionNumber: dto.revisionNumber,
        description: dto.description,
        rules: JSON.stringify(dto.rules || []),
        referencePhotos: JSON.stringify(dto.referencePhotos || []),
        videoUrl: dto.videoUrl || null,
        sopDocumentUrl: dto.sopDocumentUrl || null,
        revisionComments: dto.revisionComments?.trim() || null,
        authorId: userId || null,
        isCurrent: false,
      },
    });

    return this.getStandardById(tenantId, standardId);
  }

  async approveRevision(tenantId: string, standardId: string, revisionId: string, dto: ApproveRevisionDto, approverId?: string) {
    const standard = await this.getStandardById(tenantId, standardId);
    await this.tenantRefs.assertExists(tenantId, 'standardRevision', revisionId, 'Standard revision', { standardId });
    const revision = standard.revisions.find((r) => r.id === revisionId);
    if (revision?.approvedAt) {
      throw new ConflictException(`Revision ${revision.revisionNumber} is already approved.`);
    }
    if (revision?.rejectedAt) {
      throw new ConflictException(`Revision ${revision.revisionNumber} was rejected. Draft a new revision instead.`);
    }
    // The approver's note is stored on its own; the author's revision comment is never overwritten
    const note = dto.comments?.trim() || null;
    const now = new Date();

    // Exactly one revision may be current: the approved one replaces any other
    await this.prisma.$transaction([
      this.prisma.standardRevision.updateMany({
        where: { standardId, tenantId, NOT: { id: revisionId } },
        data: { isCurrent: false },
      }),
      this.prisma.standardRevision.update({
        where: { id: revisionId },
        data: {
          approvedById: approverId || null,
          approvedAt: now,
          effectiveDate: now,
          approvalComments: note,
          isCurrent: true,
        },
      }),
      // Approving the first revision of a draft standard publishes it
      this.prisma.standard.updateMany({
        where: { id: standardId, tenantId, status: 'DRAFT' },
        data: { status: 'PUBLISHED' },
      }),
    ]);

    return this.getStandardById(tenantId, standardId);
  }

  /** Rejects a revision awaiting approval. The revision in force (if any) stays in force; the author can draft again. */
  async rejectRevision(tenantId: string, standardId: string, revisionId: string, dto: RejectRevisionDto, approverId: string) {
    const standard = await this.getStandardById(tenantId, standardId);
    await this.tenantRefs.assertExists(tenantId, 'standardRevision', revisionId, 'Standard revision', { standardId });
    const revision = standard.revisions.find((r) => r.id === revisionId);
    if (revision?.approvedAt) {
      throw new ConflictException(`Revision ${revision.revisionNumber} is already approved.`);
    }
    if (revision?.rejectedAt) {
      throw new ConflictException(`Revision ${revision.revisionNumber} was already rejected.`);
    }
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Give the reason for rejecting the revision.');
    }
    await this.prisma.standardRevision.update({
      where: { id: revisionId },
      data: { rejectedAt: new Date(), rejectedById: approverId, rejectionReason: reason, isCurrent: false },
    });
    return this.getStandardById(tenantId, standardId);
  }

  async deleteStandard(tenantId: string, id: string, actorId: string) {
    await this.getStandardById(tenantId, id);
    return this.prisma.standard.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });
  }
}

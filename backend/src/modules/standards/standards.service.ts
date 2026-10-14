import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateStandardDto, CreateRevisionDto, ApproveRevisionDto } from './dto/standard.dto';

@Injectable()
export class StandardsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStandards(tenantId: string, filters?: {
    category?: string;
    scopeType?: string;
    status?: string;
    search?: string;
  }) {
    const where: any = { tenantId };
    if (filters?.category) where.category = filters.category;
    if (filters?.scopeType) where.scopeType = filters.scopeType;
    if (filters?.status) where.status = filters.status;
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search } },
        { code: { contains: filters.search } },
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

    return standards.map((std) => {
      const currentRev = std.revisions.find((r) => r.isCurrent) || std.revisions[0];
      return {
        ...std,
        currentRevision: currentRev
          ? {
              ...currentRev,
              rules: JSON.parse(currentRev.rules || '[]'),
              referencePhotos: JSON.parse(currentRev.referencePhotos || '[]'),
            }
          : null,
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

    const formattedRevisions = std.revisions.map((r) => ({
      ...r,
      rules: JSON.parse(r.rules || '[]'),
      referencePhotos: JSON.parse(r.referencePhotos || '[]'),
    }));
    const currentRev = formattedRevisions.find((r) => r.isCurrent) || formattedRevisions[0] || null;

    return {
      ...std,
      revisions: formattedRevisions,
      currentRevision: currentRev,
    };
  }

  async updateStandard(tenantId: string, id: string, data: any) {
    await this.getStandardById(tenantId, id);
    return this.prisma.standard.update({
      where: { id },
      data: {
        title: data.title !== undefined ? data.title : undefined,
        category: data.category !== undefined ? data.category : undefined,
        scopeType: data.scopeType !== undefined ? data.scopeType : undefined,
        targetOrgNodeId: data.targetOrgNodeId !== undefined ? data.targetOrgNodeId : undefined,
        targetLocationId: data.targetLocationId !== undefined ? data.targetLocationId : undefined,
        status: data.status !== undefined ? data.status : undefined,
      },
    });
  }

  async createStandard(tenantId: string, dto: CreateStandardDto, userId?: string) {
    const existing = await this.prisma.standard.findFirst({
      where: { tenantId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Standard with code '${dto.code}' already exists in this tenant`);
    }

    const standard = await this.prisma.standard.create({
      data: {
        tenantId,
        code: dto.code.trim().toUpperCase(),
        title: dto.title.trim(),
        category: dto.category,
        scopeType: dto.scopeType || 'GLOBAL',
        targetOrgNodeId: dto.targetOrgNodeId || null,
        targetLocationId: dto.targetLocationId || null,
        status: 'PUBLISHED',
      },
    });

    // Create initial Revision 1.0
    const revision = await this.prisma.standardRevision.create({
      data: {
        tenantId,
        standardId: standard.id,
        revisionNumber: '1.0',
        description: dto.description,
        rules: JSON.stringify(dto.rules || []),
        referencePhotos: JSON.stringify(dto.referencePhotos || []),
        videoUrl: dto.videoUrl || null,
        sopDocumentUrl: dto.sopDocumentUrl || null,
        revisionComments: 'Initial standard authoring & publication',
        authorId: userId || null,
        approvedById: userId || null,
        approvedAt: new Date(),
        isCurrent: true,
      },
    });

    return this.getStandardById(tenantId, standard.id);
  }

  async createRevision(tenantId: string, standardId: string, dto: CreateRevisionDto, userId?: string) {
    await this.getStandardById(tenantId, standardId);

    // Unset previous current flags
    await this.prisma.standardRevision.updateMany({
      where: { standardId },
      data: { isCurrent: false },
    });

    const revision = await this.prisma.standardRevision.create({
      data: {
        tenantId,
        standardId,
        revisionNumber: dto.revisionNumber,
        description: dto.description,
        rules: JSON.stringify(dto.rules || []),
        referencePhotos: JSON.stringify(dto.referencePhotos || []),
        videoUrl: dto.videoUrl || null,
        sopDocumentUrl: dto.sopDocumentUrl || null,
        revisionComments: dto.revisionComments || 'New revision drafted',
        authorId: userId || null,
        isCurrent: true,
      },
    });

    return this.getStandardById(tenantId, standardId);
  }

  async approveRevision(tenantId: string, standardId: string, revisionId: string, dto: ApproveRevisionDto, approverId?: string) {
    await this.getStandardById(tenantId, standardId);

    await this.prisma.standardRevision.update({
      where: { id: revisionId },
      data: {
        approvedById: approverId || null,
        approvedAt: new Date(),
        revisionComments: dto.comments || 'Approved by authority',
        isCurrent: true,
      },
    });

    return this.getStandardById(tenantId, standardId);
  }

  async deleteStandard(tenantId: string, id: string) {
    await this.getStandardById(tenantId, id);
    return this.prisma.standard.delete({
      where: { id },
    });
  }
}

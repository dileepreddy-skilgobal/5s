import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateTemplateDto, CreateSectionDto, CreateQuestionDto, PublishVersionDto } from './dto/audit-template.dto';

@Injectable()
export class AuditTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async getTemplates(tenantId: string, filters?: { auditType?: string; status?: string; search?: string }) {
    const where: any = { tenantId };
    if (filters?.auditType) where.auditType = filters.auditType;
    if (filters?.status) where.status = filters.status;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { code: { contains: filters.search } },
      ];
    }

    const templates = await this.prisma.auditTemplate.findMany({
      where,
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          include: {
            sections: {
              include: {
                _count: { select: { questions: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return templates.map((tpl) => {
      const currentVer = tpl.versions.find((v) => v.isPublished) || tpl.versions[0];
      const totalQuestions = currentVer
        ? currentVer.sections.reduce((sum, s) => sum + s._count.questions, 0)
        : 0;

      return {
        ...tpl,
        categoryScoringModel: JSON.parse(tpl.categoryScoringModel || '{}'),
        currentVersion: currentVer,
        totalQuestions,
        versionCount: tpl.versions.length,
      };
    });
  }

  async getTemplateById(tenantId: string, id: string) {
    const template = await this.prisma.auditTemplate.findFirst({
      where: { id, tenantId },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          include: {
            publisher: { select: { id: true, firstName: true, lastName: true } },
            sections: {
              orderBy: { sortOrder: 'asc' },
              include: {
                questions: {
                  orderBy: { sortOrder: 'asc' },
                  include: {
                    standard: { select: { id: true, code: true, title: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(`Audit Template with ID '${id}' not found`);
    }

    const formattedVersions = template.versions.map((ver) => ({
      ...ver,
      sections: ver.sections.map((sec) => ({
        ...sec,
        questions: sec.questions.map((q) => ({
          ...q,
          options: q.options ? JSON.parse(q.options) : null,
        })),
      })),
    }));
    const currentVer = formattedVersions.find((v) => v.isPublished) || formattedVersions[0] || null;

    const totalQuestions = currentVer
      ? currentVer.sections.reduce((sum, s) => sum + (s.questions ? s.questions.length : 0), 0)
      : 0;

    return {
      ...template,
      categoryScoringModel: JSON.parse(template.categoryScoringModel || '{}'),
      versions: formattedVersions,
      currentVersion: currentVer,
      totalQuestions,
    };
  }

  async createTemplate(tenantId: string, dto: CreateTemplateDto, userId?: string) {
    const existing = await this.prisma.auditTemplate.findFirst({
      where: { tenantId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Audit Template with code '${dto.code}' already exists`);
    }

    const scoringModel = dto.categoryScoringModel
      ? JSON.stringify(dto.categoryScoringModel)
      : JSON.stringify({ S1: 20, S2: 20, S3: 20, S4: 20, S5: 20 });

    const template = await this.prisma.auditTemplate.create({
      data: {
        tenantId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description,
        auditType: dto.auditType,
        categoryScoringModel: scoringModel,
        status: 'ACTIVE',
      },
    });

    // Create initial Version 1.0
    const version = await this.prisma.auditTemplateVersion.create({
      data: {
        tenantId,
        templateId: template.id,
        versionNumber: '1.0',
        changeSummary: 'Initial template draft',
        isPublished: true,
        publishedAt: new Date(),
        publishedById: userId || null,
      },
    });

    return this.getTemplateById(tenantId, template.id);
  }

  async addSection(tenantId: string, templateVersionId: string, dto: CreateSectionDto) {
    const section = await this.prisma.auditTemplateSection.create({
      data: {
        tenantId,
        templateVersionId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        sortOrder: dto.sortOrder || 0,
      },
    });
    return section;
  }

  async addQuestion(tenantId: string, sectionId: string, dto: CreateQuestionDto) {
    const question = await this.prisma.auditTemplateQuestion.create({
      data: {
        tenantId,
        sectionId,
        questionCode: dto.questionCode.trim().toUpperCase(),
        questionText: dto.questionText.trim(),
        description: dto.description,
        guidance: dto.guidance,
        standardId: dto.standardId || null,
        questionType: dto.questionType,
        options: dto.options ? JSON.stringify(dto.options) : null,
        weightage: dto.weightage !== undefined ? dto.weightage : 1.0,
        severity: dto.severity || 'MODERATE',
        isCritical: dto.isCritical || false,
        scoreCapOnFail: dto.scoreCapOnFail || null,
        requireEvidenceOnScoreBelow: dto.requireEvidenceOnScoreBelow || null,
        mandatoryEvidence: dto.mandatoryEvidence || false,
        referencePhotoUrl: dto.referencePhotoUrl || null,
        sortOrder: dto.sortOrder || 0,
      },
    });
    return question;
  }

  async publishVersion(tenantId: string, templateId: string, versionId: string, dto: PublishVersionDto, userId?: string) {
    await this.getTemplateById(tenantId, templateId);

    return this.prisma.auditTemplateVersion.update({
      where: { id: versionId },
      data: {
        isPublished: true,
        publishedAt: new Date(),
        publishedById: userId || null,
        changeSummary: dto.changeSummary || 'Published approved revision',
      },
    });
  }

  async updateTemplate(tenantId: string, id: string, data: any) {
    await this.getTemplateById(tenantId, id);
    return this.prisma.auditTemplate.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        description: data.description !== undefined ? data.description : undefined,
        auditType: data.auditType !== undefined ? data.auditType : undefined,
        status: data.status !== undefined ? data.status : undefined,
        categoryScoringModel: data.categoryScoringModel ? JSON.stringify(data.categoryScoringModel) : undefined,
      },
    });
  }

  async updateSection(tenantId: string, sectionId: string, data: any) {
    return this.prisma.auditTemplateSection.update({
      where: { id: sectionId },
      data: {
        title: data.title !== undefined ? data.title : undefined,
        description: data.description !== undefined ? data.description : undefined,
        category: data.category !== undefined ? data.category : undefined,
        sortOrder: data.sortOrder !== undefined ? data.sortOrder : undefined,
      },
    });
  }

  async updateQuestion(tenantId: string, questionId: string, dto: any) {
    return this.prisma.auditTemplateQuestion.update({
      where: { id: questionId },
      data: {
        questionCode: dto.questionCode !== undefined ? dto.questionCode.trim().toUpperCase() : undefined,
        questionText: dto.questionText !== undefined ? dto.questionText.trim() : undefined,
        description: dto.description !== undefined ? dto.description : undefined,
        guidance: dto.guidance !== undefined ? dto.guidance : undefined,
        standardId: dto.standardId !== undefined ? dto.standardId : undefined,
        questionType: dto.questionType !== undefined ? dto.questionType : undefined,
        options: dto.options !== undefined ? JSON.stringify(dto.options) : undefined,
        weightage: dto.weightage !== undefined ? Number(dto.weightage) : undefined,
        severity: dto.severity !== undefined ? dto.severity : undefined,
        isCritical: dto.isCritical !== undefined ? dto.isCritical : undefined,
        scoreCapOnFail: dto.scoreCapOnFail !== undefined ? (dto.scoreCapOnFail ? Number(dto.scoreCapOnFail) : null) : undefined,
        requireEvidenceOnScoreBelow: dto.requireEvidenceOnScoreBelow !== undefined ? (dto.requireEvidenceOnScoreBelow ? Number(dto.requireEvidenceOnScoreBelow) : null) : undefined,
        mandatoryEvidence: dto.mandatoryEvidence !== undefined ? dto.mandatoryEvidence : undefined,
        referencePhotoUrl: dto.referencePhotoUrl !== undefined ? dto.referencePhotoUrl : undefined,
        sortOrder: dto.sortOrder !== undefined ? dto.sortOrder : undefined,
      },
    });
  }

  async cloneTemplate(tenantId: string, templateId: string, newCode: string, newName?: string, userId?: string) {
    const original = await this.getTemplateById(tenantId, templateId);
    
    const existing = await this.prisma.auditTemplate.findFirst({
      where: { tenantId, code: newCode },
    });
    if (existing) {
      throw new ConflictException(`Audit Template with code '${newCode}' already exists`);
    }

    const cloned = await this.prisma.auditTemplate.create({
      data: {
        tenantId,
        code: newCode.trim().toUpperCase(),
        name: newName || `${original.name} (Clone)`,
        description: original.description,
        auditType: original.auditType,
        categoryScoringModel: JSON.stringify(original.categoryScoringModel),
        status: 'ACTIVE',
      },
    });

    const newVersion = await this.prisma.auditTemplateVersion.create({
      data: {
        tenantId,
        templateId: cloned.id,
        versionNumber: '1.0',
        changeSummary: `Cloned from ${original.code}`,
        isPublished: true,
        publishedAt: new Date(),
        publishedById: userId || null,
      },
    });

    const currentSections = original.currentVersion?.sections || [];
    for (const sec of currentSections) {
      const clonedSec = await this.prisma.auditTemplateSection.create({
        data: {
          tenantId,
          templateVersionId: newVersion.id,
          title: sec.title,
          description: sec.description,
          category: sec.category,
          sortOrder: sec.sortOrder,
        },
      });

      for (const q of (sec.questions || [])) {
        await this.prisma.auditTemplateQuestion.create({
          data: {
            tenantId,
            sectionId: clonedSec.id,
            questionCode: q.questionCode,
            questionText: q.questionText,
            description: q.description,
            guidance: q.guidance,
            standardId: q.standardId,
            questionType: q.questionType,
            options: q.options ? JSON.stringify(q.options) : null,
            weightage: q.weightage,
            severity: q.severity,
            isCritical: q.isCritical,
            scoreCapOnFail: q.scoreCapOnFail,
            requireEvidenceOnScoreBelow: q.requireEvidenceOnScoreBelow,
            mandatoryEvidence: q.mandatoryEvidence,
            referencePhotoUrl: q.referencePhotoUrl,
            sortOrder: q.sortOrder,
          },
        });
      }
    }

    return this.getTemplateById(tenantId, cloned.id);
  }

  async deleteQuestion(tenantId: string, questionId: string) {
    return this.prisma.auditTemplateQuestion.delete({
      where: { id: questionId },
    });
  }

  async deleteTemplate(tenantId: string, id: string) {
    await this.getTemplateById(tenantId, id);
    return this.prisma.auditTemplate.delete({
      where: { id },
    });
  }
}

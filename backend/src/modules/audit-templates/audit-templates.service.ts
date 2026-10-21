import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { TenantReferenceService } from '../../core/database/tenant-reference.service';
import {
  CreateTemplateDto,
  CreateSectionDto,
  CreateQuestionDto,
  PublishVersionDto,
  UpdateTemplateDto,
  UpdateSectionDto,
  UpdateQuestionDto,
} from './dto/audit-template.dto';

/** A published version backs finished audits, so its content never changes; edits go into a new draft version. */
const LOCKED_VERSION_MESSAGE =
  'This template version is published and can no longer be changed. Create a new version to make changes.';

/** A multiple-choice question is only answerable with at least two labelled choices. */
const MIN_CHOICES = 2;

function assertChoices(questionType: string | undefined, options: Array<{ label: string; score: number }> | null | undefined) {
  if (questionType !== 'MULTIPLE_CHOICE') return;
  const labelled = (options ?? []).filter((o) => o.label.trim());
  if (labelled.length < MIN_CHOICES) {
    throw new BadRequestException(`A multiple-choice question needs at least ${MIN_CHOICES} choices, each with a label and a score from 0 to 100.`);
  }
  const labels = new Set(labelled.map((o) => o.label.trim().toLowerCase()));
  if (labels.size !== labelled.length) {
    throw new BadRequestException('The choices of a multiple-choice question must have different labels.');
  }
}

/** Options are stored only for multiple-choice questions; other types ignore them. */
function serialiseOptions(questionType: string, options: Array<{ label: string; score: number }> | null | undefined): string | null {
  if (questionType !== 'MULTIPLE_CHOICE' || !options) return null;
  return JSON.stringify(options.map((o) => ({ label: o.label.trim(), score: o.score })));
}

/** Next major version number after the highest existing one: 1.0, 1.5 -> 2.0. */
function nextVersionNumber(existing: string[]): string {
  const max = existing.reduce((m, v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${Math.floor(max) + 1}.0`;
}

@Injectable()
export class AuditTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantRefs: TenantReferenceService,
  ) {}

  /** Rejects changes to a published version (409). The caller has already checked tenant ownership. */
  private async assertVersionEditable(versionId: string) {
    const version = await this.prisma.auditTemplateVersion.findUnique({ where: { id: versionId }, select: { isPublished: true } });
    if (!version) throw new NotFoundException(`Template version '${versionId}' not found`);
    if (version.isPublished) throw new ConflictException(LOCKED_VERSION_MESSAGE);
  }

  private async assertSectionEditable(sectionId: string) {
    const section = await this.prisma.auditTemplateSection.findUnique({ where: { id: sectionId }, select: { templateVersionId: true } });
    if (!section) throw new NotFoundException(`Template section '${sectionId}' not found`);
    await this.assertVersionEditable(section.templateVersionId);
  }

  private async assertQuestionEditable(questionId: string) {
    const question = await this.prisma.auditTemplateQuestion.findUnique({ where: { id: questionId }, select: { sectionId: true } });
    if (!question) throw new NotFoundException(`Template question '${questionId}' not found`);
    await this.assertSectionEditable(question.sectionId);
  }

  async getTemplates(tenantId: string, filters?: { auditType?: string; status?: string; search?: string }) {
    const where: Prisma.AuditTemplateWhereInput = { tenantId };
    if (filters?.auditType) where.auditType = filters.auditType;
    if (filters?.status) where.status = filters.status;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search, mode: 'insensitive' } },
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
      // Audits run the latest published version; the latest version may be a newer draft
      const currentVer = tpl.versions.find((v) => v.isPublished) || tpl.versions[0];
      const totalQuestions = currentVer
        ? currentVer.sections.reduce((sum, s) => sum + s._count.questions, 0)
        : 0;

      return {
        ...tpl,
        categoryScoringModel: JSON.parse(tpl.categoryScoringModel || '{}'),
        currentVersion: currentVer,
        latestVersion: tpl.versions[0] ?? null,
        hasPublishedVersion: tpl.versions.some((v) => v.isPublished),
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
      latestVersion: formattedVersions[0] ?? null,
      hasPublishedVersion: formattedVersions.some((v) => v.isPublished),
      totalQuestions,
    };
  }

  async createTemplate(tenantId: string, dto: CreateTemplateDto, _userId?: string) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.auditTemplate.findFirst({
      where: { tenantId, code },
    });
    if (existing) {
      throw new ConflictException(`Audit Template with code '${code}' already exists`);
    }

    const scoringModel = dto.categoryScoringModel
      ? JSON.stringify(dto.categoryScoringModel)
      : JSON.stringify({ S1: 20, S2: 20, S3: 20, S4: 20, S5: 20 });

    const template = await this.prisma.auditTemplate.create({
      data: {
        tenantId,
        code,
        name: dto.name.trim(),
        description: dto.description,
        auditType: dto.auditType,
        categoryScoringModel: scoringModel,
        // Becomes ACTIVE when its first version is published
        status: 'DRAFT',
      },
    });

    // Initial version 1.0 starts as an editable draft
    await this.prisma.auditTemplateVersion.create({
      data: {
        tenantId,
        templateId: template.id,
        versionNumber: '1.0',
        changeSummary: 'Initial template draft',
        isPublished: false,
        publishedById: null,
      },
    });

    return this.getTemplateById(tenantId, template.id);
  }

  /** Copies sections and questions of one version into another (inside the caller's transaction). */
  private async copyVersionContent(
    tx: Prisma.TransactionClient,
    tenantId: string,
    sections: Awaited<ReturnType<AuditTemplatesService['getTemplateById']>>['versions'][number]['sections'],
    targetVersionId: string,
  ) {
    for (const sec of sections) {
      const copiedSection = await tx.auditTemplateSection.create({
        data: {
          tenantId,
          templateVersionId: targetVersionId,
          title: sec.title,
          description: sec.description,
          category: sec.category,
          sortOrder: sec.sortOrder,
        },
      });

      for (const q of sec.questions || []) {
        await tx.auditTemplateQuestion.create({
          data: {
            tenantId,
            sectionId: copiedSection.id,
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
  }

  /** New draft version copied from the latest version. Only one draft may exist at a time. */
  async createVersion(tenantId: string, templateId: string) {
    const template = await this.getTemplateById(tenantId, templateId);
    const latest = template.versions[0];
    if (latest && !latest.isPublished) {
      throw new ConflictException(`Version ${latest.versionNumber} is still a draft. Edit or publish it before creating another version.`);
    }

    const versionNumber = nextVersionNumber(template.versions.map((v) => v.versionNumber));
    await this.prisma.$transaction(async (tx) => {
      const version = await tx.auditTemplateVersion.create({
        data: {
          tenantId,
          templateId,
          versionNumber,
          changeSummary: latest ? `Draft based on version ${latest.versionNumber}` : 'Initial template draft',
          isPublished: false,
          publishedById: null,
        },
      });
      if (latest) {
        await this.copyVersionContent(tx, tenantId, latest.sections, version.id);
      }
    });

    return this.getTemplateById(tenantId, templateId);
  }

  async addSection(tenantId: string, templateId: string, templateVersionId: string, dto: CreateSectionDto) {
    await this.tenantRefs.assertExists(tenantId, 'auditTemplateVersion', templateVersionId, 'Template version', { templateId });
    await this.assertVersionEditable(templateVersionId);
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
    await this.tenantRefs.assertExists(tenantId, 'auditTemplateSection', sectionId, 'Template section');
    await this.tenantRefs.assertOptional(tenantId, 'standard', dto.standardId, 'Standard');
    await this.assertSectionEditable(sectionId);
    assertChoices(dto.questionType, dto.options);
    // New questions go to the end of the section unless a position is given
    const sortOrder =
      dto.sortOrder ??
      ((await this.prisma.auditTemplateQuestion.aggregate({ where: { sectionId }, _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;
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
        options: serialiseOptions(dto.questionType, dto.options),
        weightage: dto.weightage !== undefined ? dto.weightage : 1.0,
        severity: dto.severity || 'MODERATE',
        isCritical: dto.isCritical || false,
        scoreCapOnFail: dto.scoreCapOnFail ?? null,
        requireEvidenceOnScoreBelow: dto.requireEvidenceOnScoreBelow ?? null,
        mandatoryEvidence: dto.mandatoryEvidence || false,
        referencePhotoUrl: dto.referencePhotoUrl || null,
        sortOrder,
      },
    });
    return question;
  }

  async publishVersion(tenantId: string, templateId: string, versionId: string, dto: PublishVersionDto, userId?: string) {
    const template = await this.getTemplateById(tenantId, templateId);
    await this.tenantRefs.assertExists(tenantId, 'auditTemplateVersion', versionId, 'Template version', { templateId });

    const version = template.versions.find((v) => v.id === versionId);
    if (version?.isPublished) {
      throw new ConflictException(`Version ${version.versionNumber} is already published.`);
    }
    const questionCount = version?.sections.reduce((sum, s) => sum + s.questions.length, 0) ?? 0;
    if (questionCount === 0) {
      throw new BadRequestException('Add at least one question before publishing this version.');
    }

    return this.prisma.$transaction(async (tx) => {
      const published = await tx.auditTemplateVersion.update({
        where: { id: versionId },
        data: {
          isPublished: true,
          publishedAt: new Date(),
          publishedById: userId || null,
          changeSummary: dto.changeSummary || 'Published approved revision',
        },
      });
      // A template becomes usable for audits once a version is published
      if (template.status === 'DRAFT') {
        await tx.auditTemplate.update({ where: { id: templateId }, data: { status: 'ACTIVE' } });
      }
      return published;
    });
  }

  async updateTemplate(tenantId: string, id: string, data: UpdateTemplateDto) {
    const template = await this.getTemplateById(tenantId, id);
    if (data.status === 'ACTIVE' && !template.hasPublishedVersion) {
      throw new ConflictException('Publish a version of this template before making it active.');
    }
    return this.prisma.auditTemplate.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name.trim() : undefined,
        description: data.description !== undefined ? data.description : undefined,
        auditType: data.auditType !== undefined ? data.auditType : undefined,
        status: data.status !== undefined ? data.status : undefined,
        categoryScoringModel: data.categoryScoringModel ? JSON.stringify(data.categoryScoringModel) : undefined,
      },
    });
  }

  async updateSection(tenantId: string, sectionId: string, data: UpdateSectionDto) {
    await this.tenantRefs.assertExists(tenantId, 'auditTemplateSection', sectionId, 'Template section');
    await this.assertSectionEditable(sectionId);
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

  async deleteSection(tenantId: string, sectionId: string) {
    await this.tenantRefs.assertExists(tenantId, 'auditTemplateSection', sectionId, 'Template section');
    await this.assertSectionEditable(sectionId);
    const answers = await this.prisma.auditAnswer.count({ where: { sectionId } });
    if (answers > 0) {
      throw new ConflictException(`This section has been answered in ${answers} audit answer(s) and cannot be deleted.`);
    }
    // Questions cascade with the section
    return this.prisma.auditTemplateSection.delete({ where: { id: sectionId } });
  }

  async updateQuestion(tenantId: string, questionId: string, dto: UpdateQuestionDto) {
    await this.tenantRefs.assertExists(tenantId, 'auditTemplateQuestion', questionId, 'Template question');
    await this.tenantRefs.assertOptional(tenantId, 'standard', dto.standardId, 'Standard');
    await this.assertQuestionEditable(questionId);
    const current = await this.prisma.auditTemplateQuestion.findUnique({ where: { id: questionId }, select: { questionType: true, options: true } });
    const questionType = dto.questionType ?? current?.questionType ?? 'PASS_FAIL';
    const parsedCurrent = this.parseOptions(current?.options ?? null);
    const options = dto.options !== undefined ? dto.options : parsedCurrent;
    assertChoices(questionType, options);
    const optionsChanged = dto.options !== undefined || dto.questionType !== undefined;
    return this.prisma.auditTemplateQuestion.update({
      where: { id: questionId },
      data: {
        questionCode: dto.questionCode !== undefined ? dto.questionCode.trim().toUpperCase() : undefined,
        questionText: dto.questionText !== undefined ? dto.questionText.trim() : undefined,
        description: dto.description !== undefined ? dto.description : undefined,
        guidance: dto.guidance !== undefined ? dto.guidance : undefined,
        // null unlinks the standard
        standardId: dto.standardId !== undefined ? dto.standardId : undefined,
        questionType: dto.questionType !== undefined ? dto.questionType : undefined,
        // Changing away from multiple choice clears the choices
        options: optionsChanged ? serialiseOptions(questionType, options) : undefined,
        weightage: dto.weightage !== undefined ? Number(dto.weightage) : undefined,
        severity: dto.severity !== undefined ? dto.severity : undefined,
        isCritical: dto.isCritical !== undefined ? dto.isCritical : undefined,
        scoreCapOnFail: dto.scoreCapOnFail !== undefined ? (dto.scoreCapOnFail !== null ? Number(dto.scoreCapOnFail) : null) : undefined,
        requireEvidenceOnScoreBelow:
          dto.requireEvidenceOnScoreBelow !== undefined
            ? dto.requireEvidenceOnScoreBelow !== null
              ? Number(dto.requireEvidenceOnScoreBelow)
              : null
            : undefined,
        mandatoryEvidence: dto.mandatoryEvidence !== undefined ? dto.mandatoryEvidence : undefined,
        referencePhotoUrl: dto.referencePhotoUrl !== undefined ? dto.referencePhotoUrl : undefined,
        sortOrder: dto.sortOrder !== undefined ? dto.sortOrder : undefined,
      },
    });
  }

  /** Rewrites the order of a draft section's questions. The list must contain exactly the section's questions. */
  async reorderQuestions(tenantId: string, sectionId: string, questionIds: string[]) {
    await this.tenantRefs.assertExists(tenantId, 'auditTemplateSection', sectionId, 'Template section');
    await this.assertSectionEditable(sectionId);
    const existing = await this.prisma.auditTemplateQuestion.findMany({ where: { sectionId, tenantId }, select: { id: true } });
    const existingIds = new Set(existing.map((q) => q.id));
    if (existing.length !== questionIds.length || questionIds.some((id) => !existingIds.has(id))) {
      throw new BadRequestException('Send every question of this section exactly once, in the new order.');
    }
    await this.prisma.$transaction(
      questionIds.map((id, index) => this.prisma.auditTemplateQuestion.update({ where: { id }, data: { sortOrder: index + 1 } })),
    );
    return this.prisma.auditTemplateQuestion.findMany({ where: { sectionId, tenantId }, orderBy: { sortOrder: 'asc' } });
  }

  private parseOptions(raw: string | null): Array<{ label: string; score: number }> | null {
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed
        .filter((o): o is { label: unknown; score: unknown } => !!o && typeof o === 'object')
        .map((o) => ({ label: String(o.label ?? ''), score: Number(o.score) || 0 }));
    } catch {
      return null;
    }
  }

  async cloneTemplate(tenantId: string, templateId: string, newCode: string, newName?: string, _userId?: string) {
    const original = await this.getTemplateById(tenantId, templateId);

    const code = newCode.trim().toUpperCase();
    const existing = await this.prisma.auditTemplate.findFirst({
      where: { tenantId, code },
    });
    if (existing) {
      throw new ConflictException(`Audit Template with code '${code}' already exists`);
    }

    const clonedId = await this.prisma.$transaction(async (tx) => {
      const cloned = await tx.auditTemplate.create({
        data: {
          tenantId,
          code,
          name: newName || `${original.name} (Clone)`,
          description: original.description,
          auditType: original.auditType,
          categoryScoringModel: JSON.stringify(original.categoryScoringModel),
          status: 'DRAFT',
        },
      });

      // The copy starts as an editable draft; publish it to use it in audits
      const newVersion = await tx.auditTemplateVersion.create({
        data: {
          tenantId,
          templateId: cloned.id,
          versionNumber: '1.0',
          changeSummary: `Cloned from ${original.code}`,
          isPublished: false,
          publishedById: null,
        },
      });

      await this.copyVersionContent(tx, tenantId, original.currentVersion?.sections || [], newVersion.id);
      return cloned.id;
    });

    return this.getTemplateById(tenantId, clonedId);
  }

  async deleteQuestion(tenantId: string, questionId: string) {
    await this.tenantRefs.assertExists(tenantId, 'auditTemplateQuestion', questionId, 'Template question');
    await this.assertQuestionEditable(questionId);
    // Answers cascade from questions; never destroy recorded audit results
    const answers = await this.prisma.auditAnswer.count({ where: { questionId } });
    if (answers > 0) {
      throw new ConflictException(`This question has been answered in ${answers} audit(s) and cannot be deleted. Publish a new template version without it instead.`);
    }
    return this.prisma.auditTemplateQuestion.delete({
      where: { id: questionId },
    });
  }

  async deleteTemplate(tenantId: string, id: string, actorId: string) {
    const template = await this.getTemplateById(tenantId, id);
    const liveSchedules = await this.prisma.auditSchedule.count({ where: { tenantId, templateId: id, status: { not: 'COMPLETED' } } });
    if (liveSchedules > 0) {
      throw new ConflictException(`${template.name} is used by ${liveSchedules} active schedule(s). Delete or complete them first.`);
    }
    return this.prisma.auditTemplate.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });
  }
}

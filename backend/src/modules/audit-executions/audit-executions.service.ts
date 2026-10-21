import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { TenantReferenceService } from '../../core/database/tenant-reference.service';
import { nextSequenceCode, codeFragment } from '../../core/database/sequence-code';
import { findRepeatOf } from '../observations/repeat-detection';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantSettingsService } from '../../core/config/tenant-settings.service';
import { documentPrefix, slaHoursFor } from '../../core/config/tenant-settings';
import { assertCertifiedAuditor } from '../training/competency';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { FilesService } from '../../core/storage/files.service';
import { evidenceCount, parsePillarWeights, scoreAudit, ScoringAnswer, ScoringQuestion, ScoringRules, truncateWords } from './scoring';
import {
  StartExecutionDto,
  SaveDraftDto,
  SubmitAuditDto,
  AcknowledgeAuditDto,
  DisputeAuditDto,
  ResolveDisputeDto,
} from './dto/audit-execution.dto';
import { displayDate } from '../../core/notifications/notification-text';

@Injectable()
export class AuditExecutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantRefs: TenantReferenceService,
    private readonly settingsService: TenantSettingsService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
  ) {}

  /**
   * Every answer must reference a question of the execution's own template version, with the
   * matching section. Prevents writing answers against other templates or other tenants' questions.
   */
  private async assertAnswersMatchVersion(
    tenantId: string,
    templateVersionId: string,
    answers: Array<{ questionId: string; sectionId: string }>,
  ) {
    const questionIds = Array.from(new Set(answers.map((a) => a.questionId)));
    if (questionIds.length === 0) return;

    const questions = await this.prisma.auditTemplateQuestion.findMany({
      where: { id: { in: questionIds }, tenantId, section: { templateVersionId } },
      select: { id: true, sectionId: true },
    });
    const sectionByQuestion = new Map(questions.map((q) => [q.id, q.sectionId]));

    for (const ans of answers) {
      const sectionId = sectionByQuestion.get(ans.questionId);
      if (!sectionId) {
        throw new BadRequestException(`Question '${ans.questionId}' is not part of this audit's template version`);
      }
      if (sectionId !== ans.sectionId) {
        throw new BadRequestException(`Question '${ans.questionId}' does not belong to section '${ans.sectionId}'`);
      }
    }
  }

  private isProgramManager(actor: AuthenticatedUser): boolean {
    const managers: readonly string[] = RoleGroups.PROGRAM_MANAGERS;
    return actor.isSuperAdmin || actor.roles.some((r) => managers.includes(r));
  }

  /** Loads an execution of the tenant and enforces the allowed current statuses for the requested step. */
  private async getExecutionForTransition(tenantId: string, executionId: string, allowed: string[], step: string) {
    const execution = await this.prisma.auditExecution.findFirst({
      where: { id: executionId, tenantId },
      include: { location: true },
    });
    if (!execution) {
      throw new NotFoundException(`Audit execution '${executionId}' not found`);
    }
    if (!allowed.includes(execution.status)) {
      throw new ConflictException(`Audit ${execution.auditCode} cannot be ${step} while it is ${execution.status}.`);
    }
    return execution;
  }

  /** Answers may only be changed by the auditor conducting the audit (or a 5S programme manager). */
  private assertIsConductingAuditor(execution: { auditorId: string | null; auditCode: string }, actor: AuthenticatedUser) {
    if (execution.auditorId && execution.auditorId !== actor.userId && !this.isProgramManager(actor)) {
      throw new ForbiddenException(`Only the auditor conducting ${execution.auditCode} can change its answers.`);
    }
  }

  /** Segregation of duties: the auditor cannot sign off, dispute or arbitrate their own audit. */
  private assertNotOwnAudit(execution: { auditorId: string | null }, actor: AuthenticatedUser, step: string) {
    if (execution.auditorId && execution.auditorId === actor.userId) {
      throw new ForbiddenException(`The conducting auditor cannot ${step} their own audit.`);
    }
  }

  private async getActorName(userId: string, fallback: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    return user ? `${user.firstName} ${user.lastName}`.trim() : fallback;
  }

  async listExecutions(
    tenantId: string,
    query?: { locationId?: string; status?: string; auditorId?: string; disputeStatus?: string; auditType?: string },
  ) {
    const where: Prisma.AuditExecutionWhereInput = { tenantId };
    if (query?.locationId) where.locationId = query.locationId;
    if (query?.status) where.status = query.status;
    if (query?.auditorId) where.auditorId = query.auditorId;
    // DISPUTED lists open disputes; RESOLVED_ACCEPTED / RESOLVED_REJECTED list ruled ones
    if (query?.disputeStatus) where.disputeStatus = query.disputeStatus;
    if (query?.auditType) where.auditType = query.auditType;

    const executions = await this.prisma.auditExecution.findMany({
      where,
      include: {
        location: { select: { id: true, name: true, areaCode: true, building: true, floor: true } },
        template: { select: { id: true, name: true, code: true, auditType: true } },
        templateVersion: { select: { id: true, versionNumber: true } },
        auditor: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { answers: true, observations: { where: { deletedAt: null } } } },
      },
      orderBy: { startedAt: 'desc' },
    });

    return executions.map((e) => ({
      ...e,
      pillarScores: JSON.parse(e.pillarScores || '{}'),
    }));
  }

  async getExecutionById(tenantId: string, id: string) {
    const execution = await this.prisma.auditExecution.findFirst({
      where: { id, tenantId },
      include: {
        location: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true, email: true } },
            orgNode: { select: { id: true, name: true, code: true, nodeType: true } },
          },
        },
        template: true,
        templateVersion: {
          include: {
            sections: {
              include: {
                questions: {
                  include: {
                    standard: { select: { id: true, title: true, code: true, category: true } },
                  },
                  orderBy: { sortOrder: 'asc' },
                },
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        auditor: { select: { id: true, firstName: true, lastName: true, email: true } },
        answers: {
          include: {
            question: true,
          },
        },
        observations: {
          where: { deletedAt: null },
          include: {
            correctiveAction: {
              include: {
                assignee: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });

    if (!execution) {
      throw new NotFoundException(`Audit execution with ID '${id}' not found`);
    }

    return {
      ...execution,
      pillarScores: JSON.parse(execution.pillarScores || '{}'),
      disputedQuestionIds: this.parseStringList(execution.disputedQuestionIds),
      counterEvidenceUrls: this.parseStringList(execution.counterEvidenceUrls),
      // Multiple-choice options are stored as JSON text; clients get the array (as from /audit-templates)
      templateVersion: {
        ...execution.templateVersion,
        sections: execution.templateVersion.sections.map((s) => ({
          ...s,
          questions: s.questions.map((q) => ({ ...q, options: this.parseOptions(q.options) })),
        })),
      },
      answers: execution.answers.map((a) => ({
        ...a,
        evidenceUrls: JSON.parse(a.evidenceUrls || '[]'),
      })),
    };
  }

  /**
   * Who may start which audit. Audit-conducting roles may start any audit type. A user whose only
   * audit role is AREA_OWNER may start a SELF audit of an area they own (or back up), nothing else.
   * Returns true for such an owner self-audit.
   */
  private assertMayStartAudit(
    actor: AuthenticatedUser,
    location: { ownerId: string | null; backupOwnerId: string | null; name: string },
    auditType: string,
  ): boolean {
    const conductors: readonly string[] = RoleGroups.AUDIT_CONDUCTORS;
    if (actor.isSuperAdmin || actor.roles.some((r) => conductors.includes(r))) return false;
    if (auditType !== 'SELF') {
      throw new ForbiddenException('Area owners can only start a self-audit of their own area.');
    }
    if (location.ownerId !== actor.userId && location.backupOwnerId !== actor.userId) {
      throw new ForbiddenException(`You can only self-audit areas you own; ${location.name} is not one of them.`);
    }
    return true;
  }

  async startExecution(tenantId: string, actor: AuthenticatedUser, dto: StartExecutionDto) {
    const auditorId = actor.userId;
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId },
    });
    if (!location) {
      throw new NotFoundException(`Location '${dto.locationId}' not found`);
    }

    const template = await this.prisma.auditTemplate.findFirst({
      where: { id: dto.templateId, tenantId },
      include: {
        versions: {
          where: { isPublished: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!template) {
      throw new NotFoundException(`Template '${dto.templateId}' not found`);
    }

    const versionId = dto.templateVersionId || template.versions[0]?.id;
    if (!versionId) {
      throw new BadRequestException('Template does not have a published version');
    }
    if (dto.templateVersionId) {
      await this.tenantRefs.assertExists(tenantId, 'auditTemplateVersion', dto.templateVersionId, 'Template version', {
        templateId: dto.templateId,
      });
      // Drafts can still change, so audits only ever run on a published version
      const chosen = await this.prisma.auditTemplateVersion.findUnique({ where: { id: dto.templateVersionId }, select: { isPublished: true } });
      if (!chosen?.isPublished) throw new BadRequestException('This template version is a draft. Publish it before starting an audit.');
    }
    // A scheduled audit runs at its planned location with its planned audit type, and only until it is finished
    const instance = dto.auditInstanceId
      ? await this.prisma.scheduledAuditInstance.findFirst({
          where: { id: dto.auditInstanceId, tenantId },
          select: { id: true, auditCode: true, locationId: true, auditType: true, status: true },
        })
      : null;
    if (dto.auditInstanceId && !instance) {
      throw new NotFoundException(`Scheduled audit instance '${dto.auditInstanceId}' not found`);
    }
    if (instance && instance.locationId !== dto.locationId) {
      throw new BadRequestException(`Scheduled audit ${instance.auditCode} is planned for a different location.`);
    }
    if (instance && ['SUBMITTED', 'CANCELLED'].includes(instance.status)) {
      throw new ConflictException(`Scheduled audit ${instance.auditCode} is ${instance.status} and cannot be started.`);
    }
    // Unscheduled (ad-hoc, surprise, self) audits only use templates that are in use (not draft or retired)
    if (!instance && template.status !== 'ACTIVE') {
      throw new BadRequestException(`Template ${template.code} is ${template.status}; only active templates can be used for an unscheduled audit.`);
    }
    const auditType = instance?.auditType || dto.auditType || template.auditType || 'ROUTINE';
    const ownerSelfAudit = this.assertMayStartAudit(actor, location, auditType);

    // Resume the auditor's own in-progress session for this location and template (or this scheduled audit)
    const existingInProgress = await this.prisma.auditExecution.findFirst({
      where: {
        tenantId,
        locationId: dto.locationId,
        templateId: dto.templateId,
        status: 'IN_PROGRESS',
        ...(dto.auditInstanceId ? { auditInstanceId: dto.auditInstanceId } : { auditorId }),
      },
      orderBy: { startedAt: 'desc' },
    });
    if (existingInProgress) {
      return this.getExecutionById(tenantId, existingInProgress.id);
    }

    const settings = await this.settingsService.get(tenantId);
    // The certified-auditor gate applies to audits; an area owner's self-assessment of their own area is exempt
    if (!ownerSelfAudit) {
      await assertCertifiedAuditor(this.prisma, tenantId, auditorId, settings);
    }

    // Generate Human-Readable Execution Code with collision protection
    const auditCode = await nextSequenceCode(documentPrefix(settings, 'audit', codeFragment(location.areaCode), new Date().getFullYear()), (prefix) =>
      this.prisma.auditExecution
        .findMany({ where: { tenantId, auditCode: { startsWith: prefix }, deletedAt: undefined }, select: { auditCode: true } })
        .then((rows) => rows.map((r) => r.auditCode)),
    );

    const execution = await this.prisma.auditExecution.create({
      data: {
        tenantId,
        auditInstanceId: dto.auditInstanceId,
        locationId: dto.locationId,
        templateId: dto.templateId,
        templateVersionId: versionId,
        auditorId,
        auditCode,
        auditType,
        status: 'IN_PROGRESS',
        auditorName: dto.auditorName || (await this.getActorName(auditorId, '')) || null,
        startedAt: new Date(),
      },
    });

    if (dto.auditInstanceId) {
      await this.prisma.scheduledAuditInstance.updateMany({
        where: { id: dto.auditInstanceId, tenantId },
        data: { status: 'IN_PROGRESS' },
      });
    }

    return this.getExecutionById(tenantId, execution.id);
  }

  async saveDraft(tenantId: string, executionId: string, dto: SaveDraftDto, actor: AuthenticatedUser) {
    const execution = await this.getExecutionForTransition(tenantId, executionId, ['IN_PROGRESS'], 'edited');
    this.assertIsConductingAuditor(execution, actor);
    await this.assertAnswersMatchVersion(tenantId, execution.templateVersionId, dto.answers);
    await this.burnEvidenceAnnotations(tenantId, actor.userId, dto.answers);

    // Upsert Answers
    for (const ans of dto.answers) {
      const evidenceString = typeof ans.evidenceUrls === 'string' ? ans.evidenceUrls : JSON.stringify(ans.evidenceUrls || []);

      await this.prisma.auditAnswer.upsert({
        where: {
          executionId_questionId: {
            executionId,
            questionId: ans.questionId,
          },
        },
        update: {
          score: ans.score,
          maxScore: ans.maxScore ?? 5.0,
          status: ans.status || 'CONFORMING',
          notes: ans.notes,
          evidenceUrls: evidenceString,
          voiceNoteUrl: ans.voiceNoteUrl,
          findingSeverity: ans.findingSeverity ?? null,
        },
        create: {
          tenantId,
          executionId,
          questionId: ans.questionId,
          sectionId: ans.sectionId,
          score: ans.score,
          maxScore: ans.maxScore ?? 5.0,
          status: ans.status || 'CONFORMING',
          notes: ans.notes,
          evidenceUrls: evidenceString,
          voiceNoteUrl: ans.voiceNoteUrl,
          findingSeverity: ans.findingSeverity ?? null,
        },
      });
    }

    if (dto.summaryNotes !== undefined) {
      await this.prisma.auditExecution.update({
        where: { id: executionId },
        data: { summaryNotes: dto.summaryNotes },
      });
    }

    return this.getExecutionById(tenantId, executionId);
  }

  async submitAudit(tenantId: string, executionId: string, dto: SubmitAuditDto, actor: AuthenticatedUser) {
    const execution = await this.prisma.auditExecution.findFirst({
      where: { id: executionId, tenantId },
      include: {
        location: true,
        templateVersion: {
          include: {
            sections: {
              include: {
                questions: true,
              },
            },
          },
        },
      },
    });

    if (!execution) {
      throw new NotFoundException(`Audit execution '${executionId}' not found`);
    }
    if (execution.status !== 'IN_PROGRESS') {
      throw new ConflictException(`Audit ${execution.auditCode} has already been submitted.`);
    }
    this.assertIsConductingAuditor(execution, actor);
    await this.assertAnswersMatchVersion(tenantId, execution.templateVersionId, dto.answers);
    await this.assertSubmissionComplete(tenantId, executionId, execution.templateVersion.sections, dto);
    await this.burnEvidenceAnnotations(tenantId, actor.userId, dto.answers);

    // All submission side effects (answers, scores, findings, CAPAs) commit atomically or not at all
    await this.prisma.$transaction(async (tx) => {
    // 0. Claim the submission: the conditional update guarantees a concurrent double-submit cannot succeed twice
    const claimed = await tx.auditExecution.updateMany({
      where: { id: executionId, tenantId, status: 'IN_PROGRESS' },
      data: { status: 'SUBMITTED' },
    });
    if (claimed.count === 0) {
      throw new ConflictException(`Audit ${execution.auditCode} has already been submitted.`);
    }

    // 1. Save all incoming answers
    for (const ans of dto.answers) {
      const evidenceString = typeof ans.evidenceUrls === 'string' ? ans.evidenceUrls : JSON.stringify(ans.evidenceUrls || []);

      await tx.auditAnswer.upsert({
        where: {
          executionId_questionId: {
            executionId,
            questionId: ans.questionId,
          },
        },
        update: {
          score: ans.score,
          maxScore: ans.maxScore ?? 5.0,
          status: ans.status || 'CONFORMING',
          notes: ans.notes,
          evidenceUrls: evidenceString,
          voiceNoteUrl: ans.voiceNoteUrl,
          findingSeverity: ans.findingSeverity ?? null,
        },
        create: {
          tenantId,
          executionId,
          questionId: ans.questionId,
          sectionId: ans.sectionId,
          score: ans.score,
          maxScore: ans.maxScore ?? 5.0,
          status: ans.status || 'CONFORMING',
          notes: ans.notes,
          evidenceUrls: evidenceString,
          voiceNoteUrl: ans.voiceNoteUrl,
          findingSeverity: ans.findingSeverity ?? null,
        },
      });
    }

    // 2. Fetch all saved answers and calculate scores (same rule as the live preview)
    const savedAnswers = await tx.auditAnswer.findMany({
      where: { executionId, tenantId },
      include: { question: true },
    });
    const settings = await this.settingsService.get(tenantId, tx);
    const rules = await this.loadScoringRules(tenantId, execution.templateId, tx);
    const { questions, sectionCategories } = this.scoringContext(execution.templateVersion.sections);
    // Severities the auditor chose for findings travel with the submitted answers
    const severityOverrides = new Map(dto.answers.filter((a) => a.findingSeverity).map((a) => [a.questionId, a.findingSeverity]));
    const result = scoreAudit(
      questions,
      sectionCategories,
      savedAnswers.map((a) => ({ ...a, findingSeverity: severityOverrides.get(a.questionId) ?? a.findingSeverity ?? null })),
      rules,
    );
    // An audit whose answers are all N/A keeps the historical 100% result
    const finalScore = result.overallScore ?? 100;
    const isPassed = result.criticalFailureCount === 0 && finalScore >= rules.passScore;
    const pillarScores = result.pillarScores;
    const totalMax = result.maxPossibleScore;
    const totalEarned = result.earnedScore;
    const criticalFailCount = result.criticalFailureCount;

    // 3. Auto-generate Observations & Corrective Actions for failing items
    const findingSeverity = new Map(result.findings.map((f) => [f.questionId, f.severity]));
    const failingAnswers = savedAnswers.filter((a) => findingSeverity.has(a.questionId));

    const now = new Date();
    for (let i = 0; i < failingAnswers.length; i++) {
      const failAns = failingAnswers[i];
      const section = execution.templateVersion.sections.find((s) => s.id === failAns.sectionId);
      const category = section?.category || 'S1_SORT';

      const severity = findingSeverity.get(failAns.questionId) ?? 'MODERATE';

      const obsCode = await nextSequenceCode(documentPrefix(settings, 'observation', codeFragment(execution.location.areaCode), now.getFullYear()), (prefix) =>
        tx.observation
          .findMany({ where: { tenantId, observationCode: { startsWith: prefix }, deletedAt: undefined }, select: { observationCode: true } })
          .then((rows) => rows.map((r) => r.observationCode)),
      );

      const firstEvidence = this.firstEvidencePhoto(failAns.evidenceUrls);
      const beforePhoto = firstEvidence.photoUrl;

      // SLA hours from the tenant's severity matrix
      const slaHours = slaHoursFor(settings, severity);
      const targetDate = new Date(now.getTime() + slaHours * 3600000);

      const findingTitle = `Audit Finding: ${failAns.question?.questionText || '5S Non-Conformance'}`;
      const repeatOfId = await findRepeatOf(tx, {
        tenantId,
        locationId: execution.locationId,
        category,
        title: findingTitle,
        questionId: failAns.questionId,
      });

      const observation = await tx.observation.create({
        data: {
          tenantId,
          observationCode: obsCode,
          isRepeat: repeatOfId !== null,
          repeatOfId,
          executionId,
          answerId: failAns.id,
          locationId: execution.locationId,
          category,
          severity,
          title: findingTitle,
          description: failAns.notes || `Non-conformance recorded during audit evaluation for question ${failAns.question?.questionCode || ''}.`,
          beforePhotoUrl: beforePhoto,
          annotatedPhotoUrl: firstEvidence.annotatedPhotoUrl ?? beforePhoto,
          status: 'ACTION_ASSIGNED',
          riskAssessment:
            severity === 'CRITICAL'
              ? `High-risk non-conformance: remediation due within ${slaHours} hours of sign-off.`
              : `${severity === 'MAJOR' ? 'Major' : severity === 'MINOR' ? 'Minor' : 'Moderate'} non-conformance: remediation due within ${slaHours} hours of sign-off.`,
          tags: JSON.stringify([category, severity, 'AuditTriggered']),
          loggedById: execution.auditorId,
        },
      });

      const capaCode = await nextSequenceCode(documentPrefix(settings, 'action', codeFragment(execution.location.areaCode), now.getFullYear()), (prefix) =>
        tx.correctiveAction
          .findMany({ where: { tenantId, actionCode: { startsWith: prefix }, deletedAt: undefined }, select: { actionCode: true } })
          .then((rows) => rows.map((r) => r.actionCode)),
      );

      const action = await tx.correctiveAction.create({
        data: {
          tenantId,
          actionCode: capaCode,
          observationId: observation.id,
          locationId: execution.locationId,
          title: failAns.question?.questionText ? `Remediate: ${truncateWords(failAns.question.questionText, 80)}` : 'Remediate 5S non-conformance',
          description: `Implement corrective action to eliminate root cause identified during 5S audit: ${failAns.notes || failAns.question?.questionText || ''}`,
          actionType: 'CORRECTIVE',
          rootCauseCategory: 'METHOD',
          assigneeId: execution.location.ownerId || execution.auditorId,
          assignedById: execution.auditorId,
          targetDate,
          slaHours,
          status: 'PENDING_ACKNOWLEDGEMENT', // Locked until Area Owner formally acknowledges findings
        },
      });

      await tx.actionHistoryLog.create({
        data: {
          tenantId,
          actionId: action.id,
          actorId: execution.auditorId,
          actorName: dto.auditorName || execution.auditorName || '5S Auditor',
          fromStatus: 'OPEN',
          toStatus: 'PENDING_ACKNOWLEDGEMENT',
          comment: `Action instantiated from Audit ${execution.auditCode}. Remediation locked pending formal acknowledgement by Area Owner.`,
        },
      });
    }

    // 4. Update Execution Record
    await tx.auditExecution.update({
      where: { id: executionId },
      data: {
        status: 'SUBMITTED',
        overallScore: finalScore,
        maxPossibleScore: totalMax,
        earnedScore: totalEarned,
        pillarScores: JSON.stringify(pillarScores),
        isPassed,
        criticalFailureCount: criticalFailCount,
        summaryNotes: dto.summaryNotes || execution.summaryNotes,
        auditorSignature: dto.auditorSignature,
        auditorName: dto.auditorName || execution.auditorName,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : new Date(),
      },
    });

    // 5. Update Scheduled Audit Instance if linked
    if (execution.auditInstanceId) {
      await tx.scheduledAuditInstance.update({
        where: { id: execution.auditInstanceId },
        data: {
          status: 'SUBMITTED',
          score: finalScore,
        },
      });
    }

    }, { timeout: 30000 });

    await this.notifyAuditEvent(tenantId, executionId, 'SUBMITTED', actor.userId);
    return this.getExecutionById(tenantId, executionId);
  }

  /** Live score for the runner: the answers as they would be submitted, scored by the submission rule. No side effects. */
  async previewScore(tenantId: string, executionId: string, dto: SaveDraftDto, actor: AuthenticatedUser) {
    const execution = await this.prisma.auditExecution.findFirst({
      where: { id: executionId, tenantId },
      include: { templateVersion: { include: { sections: { include: { questions: true } } } } },
    });
    if (!execution) {
      throw new NotFoundException(`Audit execution '${executionId}' not found`);
    }
    this.assertIsConductingAuditor(execution, actor);
    await this.assertAnswersMatchVersion(tenantId, execution.templateVersionId, dto.answers);

    const saved = await this.prisma.auditAnswer.findMany({
      where: { executionId, tenantId },
      select: { questionId: true, sectionId: true, score: true, status: true, evidenceUrls: true },
    });
    const merged = this.mergeAnswers(saved, dto.answers);
    const rules = await this.loadScoringRules(tenantId, execution.templateId);
    const { questions, sectionCategories } = this.scoringContext(execution.templateVersion.sections);
    const result = scoreAudit(questions, sectionCategories, merged, rules);
    const gaps = this.answerGaps(execution.templateVersion.sections, merged);

    return {
      ...result,
      passScore: rules.passScore,
      findingThresholdPercent: rules.findingThresholdPercent,
      method: rules.pillarWeights ? 'PILLAR_WEIGHTED' : 'POOLED',
      answeredCount: gaps.requiredCount - gaps.unanswered.length,
      requiredCount: gaps.requiredCount,
      unansweredQuestionIds: gaps.unanswered.map((q) => q.id),
      missingEvidenceQuestionIds: gaps.missingEvidence.map((q) => q.id),
    };
  }

  /** Tenant scoring settings plus the template's pillar weights when pillar-weighted scoring is on. */
  private async loadScoringRules(tenantId: string, templateId: string, db: Prisma.TransactionClient = this.prisma): Promise<ScoringRules> {
    const settings = await this.settingsService.get(tenantId, db);
    const pillarWeights =
      settings.scoring.method === 'PILLAR_WEIGHTED'
        ? parsePillarWeights(
            (await db.auditTemplate.findUnique({ where: { id: templateId }, select: { categoryScoringModel: true } }))?.categoryScoringModel,
          )
        : null;
    return {
      passScore: settings.analytics.passScore,
      criticalFailCap: settings.scoring.criticalFailCap,
      findingThresholdPercent: settings.scoring.findingThresholdPercent,
      pillarWeights,
    };
  }

  private scoringContext(sections: Array<{ id: string; category: string; questions: ScoringQuestion[] }>) {
    const questions = new Map<string, ScoringQuestion>();
    const sectionCategories = new Map<string, string>();
    for (const section of sections) {
      sectionCategories.set(section.id, section.category);
      for (const q of section.questions) questions.set(q.id, q);
    }
    return { questions, sectionCategories };
  }

  /** Saved answers overlaid with the incoming ones (incoming wins), as submission would store them. */
  private mergeAnswers(
    saved: Array<ScoringAnswer & { evidenceUrls: string }>,
    incoming: Array<{ questionId: string; sectionId: string; score: number; status?: string; evidenceUrls?: unknown; findingSeverity?: string }>,
  ): Array<ScoringAnswer & { evidenceUrls: unknown }> {
    const byQuestion = new Map<string, ScoringAnswer & { evidenceUrls: unknown }>(saved.map((a) => [a.questionId, a]));
    for (const a of incoming) {
      byQuestion.set(a.questionId, {
        questionId: a.questionId,
        sectionId: a.sectionId,
        score: a.score,
        status: a.status || 'CONFORMING',
        evidenceUrls: a.evidenceUrls ?? [],
        findingSeverity: a.findingSeverity ?? null,
      });
    }
    return Array.from(byQuestion.values());
  }

  /**
   * Questions still needing an answer (rating or N/A), and questions marked mandatoryEvidence that
   * are answered (not N/A) but have no photo. Informational NOT_APPLICABLE-type questions need no answer.
   */
  private answerGaps(
    sections: Array<{ questions: Array<{ id: string; questionCode: string; questionType: string; mandatoryEvidence: boolean }> }>,
    answers: Array<{ questionId: string; status: string | null | undefined; evidenceUrls: unknown }>,
  ) {
    const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
    const required = sections.flatMap((s) => s.questions).filter((q) => q.questionType !== 'NOT_APPLICABLE');
    const unanswered = required.filter((q) => !byQuestion.has(q.id));
    const missingEvidence = required.filter((q) => {
      const a = byQuestion.get(q.id);
      return !!a && q.mandatoryEvidence && a.status !== 'NOT_APPLICABLE' && evidenceCount(a.evidenceUrls) === 0;
    });
    return { requiredCount: required.length, unanswered, missingEvidence };
  }

  /** Submission requires every question answered or N/A, required photos, and the auditor's signature and name. */
  private async assertSubmissionComplete(
    tenantId: string,
    executionId: string,
    sections: Array<{ questions: Array<{ id: string; questionCode: string; questionType: string; mandatoryEvidence: boolean }> }>,
    dto: SubmitAuditDto,
  ) {
    const saved = await this.prisma.auditAnswer.findMany({
      where: { executionId, tenantId },
      select: { questionId: true, sectionId: true, score: true, status: true, evidenceUrls: true },
    });
    const { unanswered, missingEvidence } = this.answerGaps(sections, this.mergeAnswers(saved, dto.answers));
    const codes = (list: Array<{ questionCode: string }>) => {
      const shown = list.slice(0, 10).map((q) => q.questionCode).join(', ');
      return list.length > 10 ? `${shown} and ${list.length - 10} more` : shown;
    };

    const messages: string[] = [];
    const errors: Array<{ field: string; questionId?: string; problem: string }> = [];
    if (unanswered.length) {
      messages.push(`${unanswered.length === 1 ? '1 question is' : `${unanswered.length} questions are`} not answered: ${codes(unanswered)}`);
      unanswered.forEach((q) => errors.push({ field: 'answers', questionId: q.id, problem: 'NOT_ANSWERED' }));
    }
    if (missingEvidence.length) {
      messages.push(`Photo evidence is required for: ${codes(missingEvidence)}`);
      missingEvidence.forEach((q) => errors.push({ field: 'answers', questionId: q.id, problem: 'EVIDENCE_REQUIRED' }));
    }
    if (!dto.auditorSignature?.trim()) {
      messages.push('The auditor signature is required');
      errors.push({ field: 'auditorSignature', problem: 'REQUIRED' });
    }
    if (!dto.auditorName?.trim()) {
      messages.push('The auditor name is required');
      errors.push({ field: 'auditorName', problem: 'REQUIRED' });
    }
    if (messages.length) {
      throw new BadRequestException({ message: messages, error: 'Audit incomplete', errors });
    }
  }

  private parseStringList(raw: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  private parseOptions(raw: string | null): unknown[] | null {
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /** First evidence photo of an answer (plain URL or `{ photoUrl, annotatedPhotoUrl }` object). */
  private firstEvidencePhoto(evidenceUrls: string): { photoUrl: string | null; annotatedPhotoUrl: string | null } {
    let list: unknown;
    try {
      list = JSON.parse(evidenceUrls || '[]');
    } catch {
      return { photoUrl: null, annotatedPhotoUrl: null };
    }
    const first = Array.isArray(list) ? list[0] : null;
    if (typeof first === 'string') return { photoUrl: first, annotatedPhotoUrl: null };
    if (first && typeof first === 'object') {
      const ev = first as { photoUrl?: unknown; annotatedPhotoUrl?: unknown };
      return {
        photoUrl: typeof ev.photoUrl === 'string' ? ev.photoUrl : null,
        annotatedPhotoUrl: typeof ev.annotatedPhotoUrl === 'string' ? ev.annotatedPhotoUrl : null,
      };
    }
    return { photoUrl: null, annotatedPhotoUrl: null };
  }

  async acknowledgeAudit(tenantId: string, executionId: string, dto: AcknowledgeAuditDto, actor: AuthenticatedUser) {
    const execution = await this.getExecutionForTransition(tenantId, executionId, ['SUBMITTED'], 'acknowledged');
    this.assertNotOwnAudit(execution, actor, 'acknowledge');
    // The signatory is always the authenticated user; client-supplied identity fields are ignored
    const actorName = await this.getActorName(actor.userId, dto.acknowledgedByName || 'Area owner');
    const acknowledgedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.auditExecution.updateMany({
        where: { id: executionId, tenantId, status: 'SUBMITTED' },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedAt,
          acknowledgedById: actor.userId,
          acknowledgedByName: actorName,
          acknowledgementSignature: dto.acknowledgementSignature || null,
          acknowledgementNotes: dto.acknowledgementNotes,
          targetResolutionDate: dto.targetResolutionDate ? new Date(dto.targetResolutionDate) : null,
          disputeStatus: 'NONE',
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(`Audit ${execution.auditCode} was changed by someone else. Reload and try again.`);
      }

      // Unlock all linked CAPA records: activate SLA countdown and transition from PENDING_ACKNOWLEDGEMENT to ASSIGNED
      const linkedObs = await tx.observation.findMany({
        where: { executionId, tenantId },
        include: { correctiveAction: true },
      });

      for (const obs of linkedObs) {
        if (obs.correctiveAction && obs.correctiveAction.status === 'PENDING_ACKNOWLEDGEMENT') {
          const updatedTarget = dto.targetResolutionDate
            ? new Date(dto.targetResolutionDate)
            : new Date(acknowledgedAt.getTime() + (obs.correctiveAction.slaHours || 72) * 3600000);

          await tx.correctiveAction.update({
            where: { id: obs.correctiveAction.id },
            data: {
              status: 'ASSIGNED',
              targetDate: updatedTarget,
            },
          });

          await tx.actionHistoryLog.create({
            data: {
              tenantId,
              actionId: obs.correctiveAction.id,
              actorId: actor.userId,
              actorName,
              fromStatus: 'PENDING_ACKNOWLEDGEMENT',
              toStatus: 'ASSIGNED',
              comment: `Area Owner formally accepted audit findings. CAPA remediation window active (Target: ${updatedTarget.toISOString().split('T')[0]}).`,
            },
          });
        }
      }

      // Record formal timeline audit log
      await tx.locationAuditLog.create({
        data: {
          tenantId,
          locationId: execution.locationId,
          userId: actor.userId,
          actionType: 'AUDIT_ACKNOWLEDGED',
          details: JSON.stringify({
            action: 'Area Owner Formally Acknowledged 5S Audit Findings',
            auditCode: execution.auditCode,
            acknowledgedBy: actorName,
            overallScore: execution.overallScore,
            targetResolutionDate: dto.targetResolutionDate || 'Standard SLA',
            notes: dto.acknowledgementNotes,
          }),
        },
      });
    });

    await this.notifyAuditEvent(tenantId, executionId, 'ACKNOWLEDGED', actor.userId);
    return this.getExecutionById(tenantId, executionId);
  }

  async disputeAudit(tenantId: string, executionId: string, dto: DisputeAuditDto, actor: AuthenticatedUser) {
    const execution = await this.getExecutionForTransition(tenantId, executionId, ['SUBMITTED'], 'disputed');
    this.assertNotOwnAudit(execution, actor, 'dispute');
    if (dto.disputedQuestionIds?.length) {
      await this.assertQuestionsInVersion(tenantId, execution.templateVersionId, dto.disputedQuestionIds);
    }
    const actorName = await this.getActorName(actor.userId, dto.disputedByName || 'Area owner');

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.auditExecution.updateMany({
        where: { id: executionId, tenantId, status: 'SUBMITTED' },
        data: {
          status: 'DISPUTED',
          disputeStatus: 'DISPUTED',
          disputedAt: new Date(),
          disputedById: actor.userId,
          disputedByName: actorName,
          disputeReason: dto.disputeReason,
          disputeNotes: dto.disputeNotes,
          disputedQuestionIds: JSON.stringify(dto.disputedQuestionIds || []),
          counterEvidenceUrls: JSON.stringify(dto.counterEvidenceUrls || []),
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(`Audit ${execution.auditCode} was changed by someone else. Reload and try again.`);
      }

      // Record formal timeline audit log
      await tx.locationAuditLog.create({
        data: {
          tenantId,
          locationId: execution.locationId,
          userId: actor.userId,
          actionType: 'AUDIT_DISPUTED',
          details: JSON.stringify({
            action: 'Area Owner Raised Formal Audit Dispute',
            auditCode: execution.auditCode,
            disputedBy: actorName,
            reason: dto.disputeReason,
            notes: dto.disputeNotes,
          }),
        },
      });
    });

    await this.notifyAuditEvent(tenantId, executionId, 'DISPUTED', actor.userId);
    return this.getExecutionById(tenantId, executionId);
  }

  async resolveDispute(tenantId: string, executionId: string, dto: ResolveDisputeDto, actor: AuthenticatedUser) {
    const execution = await this.getExecutionForTransition(tenantId, executionId, ['DISPUTED'], 'arbitrated');
    // The arbiter must be independent of both parties to the dispute
    this.assertNotOwnAudit(execution, actor, 'arbitrate');
    if (execution.disputedById && execution.disputedById === actor.userId) {
      throw new ForbiddenException('You cannot arbitrate a dispute you raised.');
    }
    const resolverName = await this.getActorName(actor.userId, dto.resolvedByName || '5S Program Lead');

    const isAccepted = dto.decision === 'ACCEPT_DISPUTE';
    const disputeStatus = isAccepted ? 'RESOLVED_ACCEPTED' : 'RESOLVED_REJECTED';

    const updateData: Prisma.AuditExecutionUpdateManyMutationInput = {
      status: 'ACKNOWLEDGED',
      disputeStatus,
      disputeResolutionNotes: dto.resolutionNotes,
      disputeResolvedAt: new Date(),
      disputeResolvedByName: resolverName,
    };

    if (isAccepted && dto.adjustedScore !== undefined) {
      const { analytics } = await this.settingsService.get(tenantId);
      updateData.overallScore = dto.adjustedScore;
      updateData.isPassed = (execution.criticalFailureCount ?? 0) === 0 && dto.adjustedScore >= analytics.passScore;
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.auditExecution.updateMany({
        where: { id: executionId, tenantId, status: 'DISPUTED' },
        data: updateData,
      });
      if (updated.count === 0) {
        throw new ConflictException(`Audit ${execution.auditCode} was changed by someone else. Reload and try again.`);
      }

      // Unlock CAPAs held pending acknowledgement; work already in progress or verified is left untouched
      const linkedObs = await tx.observation.findMany({
        where: { executionId, tenantId },
        include: { correctiveAction: true },
      });

      const now = new Date();
      for (const obs of linkedObs) {
        if (obs.correctiveAction && obs.correctiveAction.status === 'PENDING_ACKNOWLEDGEMENT') {
          await tx.correctiveAction.update({
            where: { id: obs.correctiveAction.id },
            data: {
              status: 'ASSIGNED',
              targetDate: new Date(now.getTime() + (obs.correctiveAction.slaHours || 72) * 3600000),
            },
          });

          await tx.actionHistoryLog.create({
            data: {
              tenantId,
              actionId: obs.correctiveAction.id,
              actorId: actor.userId,
              actorName: resolverName,
              fromStatus: obs.correctiveAction.status,
              toStatus: 'ASSIGNED',
              comment: `Dispute ${dto.decision} by ${resolverName}. CAPA remediation active.`,
            },
          });
        }
      }

      await tx.locationAuditLog.create({
        data: {
          tenantId,
          locationId: execution.locationId,
          userId: actor.userId,
          actionType: 'AUDIT_DISPUTE_RESOLVED',
          details: JSON.stringify({
            action: `Audit Dispute ${isAccepted ? 'Accepted & Score Adjusted' : 'Reviewed & Findings Upheld'}`,
            auditCode: execution.auditCode,
            decision: dto.decision,
            resolvedBy: resolverName,
            resolutionNotes: dto.resolutionNotes,
          }),
        },
      });
    });

    await this.notifyAuditEvent(tenantId, executionId, 'DISPUTE_RESOLVED', actor.userId);
    return this.getExecutionById(tenantId, executionId);
  }

  /** Verifies that disputed question ids belong to the audit's template version. */
  private async assertQuestionsInVersion(tenantId: string, templateVersionId: string, questionIds: string[]) {
    const unique = Array.from(new Set(questionIds));
    const count = await this.prisma.auditTemplateQuestion.count({
      where: { id: { in: unique }, tenantId, section: { templateVersionId } },
    });
    if (count !== unique.length) {
      throw new BadRequestException('One or more disputed questions are not part of this audit.');
    }
  }

  async getAuditReport(tenantId: string, id: string) {
    return this.getExecutionById(tenantId, id);
  }

  async deleteExecution(tenantId: string, id: string, actorId: string) {
    const execution = await this.prisma.auditExecution.findFirst({
      where: { id, tenantId },
    });
    if (!execution) {
      throw new NotFoundException(`Audit execution '${id}' not found`);
    }
    // Submitted audits are part of the compliance record and cannot be deleted
    if (execution.status !== 'IN_PROGRESS') {
      throw new ConflictException(`Audit ${execution.auditCode} is ${execution.status}; only in-progress audits can be deleted.`);
    }

    // Soft delete keeps the draft on record; it disappears from every list and lookup
    await this.prisma.auditExecution.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });

    return { success: true, message: `Execution ${execution.auditCode} deleted` };
  }

  /** Post-commit notifications for audit lifecycle events (never fail the operation). */
  private async notifyAuditEvent(
    tenantId: string,
    executionId: string,
    event: 'SUBMITTED' | 'ACKNOWLEDGED' | 'DISPUTED' | 'DISPUTE_RESOLVED',
    actorId: string,
  ) {
    const ex = await this.prisma.auditExecution.findFirst({
      where: { id: executionId, tenantId },
      select: {
        auditCode: true,
        overallScore: true,
        auditorId: true,
        location: { select: { name: true, ownerId: true, backupOwnerId: true, orgNode: { select: { path: true } } } },
        observations: {
          where: { deletedAt: null },
          select: { correctiveAction: { select: { id: true, actionCode: true, title: true, assigneeId: true, status: true, targetDate: true } } },
        },
      },
    });
    if (!ex) return;
    const location = { ownerId: ex.location.ownerId, backupOwnerId: ex.location.backupOwnerId, orgNodePath: ex.location.orgNode?.path ?? null };
    const findings = ex.observations.length;

    if (event === 'SUBMITTED') {
      await this.notifications.notify({
        tenantId,
        userIds: [ex.location.ownerId, ex.location.backupOwnerId],
        excludeUserId: actorId,
        type: 'AUDIT_SUBMITTED',
        title: `Audit ${ex.auditCode} of ${ex.location.name}: ${ex.overallScore}%`,
        body: `The audit has been submitted with ${findings} finding(s). Please review it, then acknowledge or dispute the result.`,
        entityType: 'AuditExecution',
        entityId: executionId,
        link: '/area-owner-hub',
      });
      return;
    }
    if (event === 'DISPUTED') {
      const userIds = await this.notifications.resolveRecipients({ tenantId, location }, ['COORDINATOR_5S', 'PLANT_HEAD']);
      await this.notifications.notify({
        tenantId,
        userIds: [...userIds, ex.auditorId],
        excludeUserId: actorId,
        type: 'AUDIT_DISPUTED',
        title: `Audit ${ex.auditCode} has been disputed`,
        body: `The result of the audit of ${ex.location.name} was disputed and needs a decision.`,
        entityType: 'AuditExecution',
        entityId: executionId,
        // Dispute resolvers (coordinator, plant head) and the auditor can all open the schedule page's audit results
        link: `/schedules?tab=results&status=DISPUTED&audit=${executionId}`,
      });
      return;
    }
    // Acknowledged or dispute resolved: the findings are final and their actions are now open
    await this.notifications.notify({
      tenantId,
      userIds: [ex.auditorId],
      excludeUserId: actorId,
      type: event === 'ACKNOWLEDGED' ? 'AUDIT_ACKNOWLEDGED' : 'AUDIT_DISPUTE_RESOLVED',
      title: `Audit ${ex.auditCode} ${event === 'ACKNOWLEDGED' ? 'acknowledged' : 'dispute resolved'}`,
      body: `The audit of ${ex.location.name} is final (${ex.overallScore}%).`,
      entityType: 'AuditExecution',
      entityId: executionId,
      link: `/schedules?tab=results&audit=${executionId}`,
    });
    for (const { correctiveAction: a } of ex.observations) {
      if (!a || a.status !== 'ASSIGNED') continue;
      await this.notifications.notify({
        tenantId,
        userIds: [a.assigneeId],
        type: 'ACTION_ASSIGNED',
        title: `New corrective action ${a.actionCode}`,
        body: `"${a.title}" at ${ex.location.name} is assigned to you, due ${displayDate(a.targetDate)}.`,
        entityType: 'CorrectiveAction',
        entityId: a.id,
        link: `/capa?id=${a.id}`,
        dedupeKey: `action-assigned:${a.id}`,
      });
    }
  }


  /** Evidence photos annotated on a device (shapes only) get an annotated copy rendered on the server. */
  private async burnEvidenceAnnotations(tenantId: string, userId: string, answers: Array<{ evidenceUrls?: unknown }>) {
    for (const ans of answers) {
      if (!Array.isArray(ans.evidenceUrls)) continue;
      ans.evidenceUrls = await Promise.all(
        ans.evidenceUrls.map(async (item: unknown) => {
          if (!item || typeof item !== 'object') return item;
          const ev = item as { photoUrl?: string; annotatedPhotoUrl?: string; annotations?: unknown; annotationData?: unknown };
          if (ev.annotatedPhotoUrl) return item;
          const burned = await this.files.burnAnnotations(tenantId, userId, ev.photoUrl, ev.annotations ?? ev.annotationData, 'auditAnswers.evidence');
          return burned ? { ...ev, annotatedPhotoUrl: burned } : item;
        }),
      );
    }
  }

}

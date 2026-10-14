import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import {
  StartExecutionDto,
  SaveDraftDto,
  SubmitAuditDto,
  AcknowledgeAuditDto,
  DisputeAuditDto,
  ResolveDisputeDto,
} from './dto/audit-execution.dto';

@Injectable()
export class AuditExecutionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listExecutions(tenantId: string, query?: { locationId?: string; status?: string; auditorId?: string }) {
    const where: any = { tenantId };
    if (query?.locationId) where.locationId = query.locationId;
    if (query?.status) where.status = query.status;
    if (query?.auditorId) where.auditorId = query.auditorId;

    const executions = await this.prisma.auditExecution.findMany({
      where,
      include: {
        location: { select: { id: true, name: true, areaCode: true, building: true, floor: true } },
        template: { select: { id: true, name: true, code: true, auditType: true } },
        templateVersion: { select: { id: true, versionNumber: true } },
        auditor: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { answers: true, observations: true } },
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
      answers: execution.answers.map((a) => ({
        ...a,
        evidenceUrls: JSON.parse(a.evidenceUrls || '[]'),
      })),
    };
  }

  async startExecution(tenantId: string, auditorId: string | null, dto: StartExecutionDto) {
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

    // Check if an in-progress session already exists for this location and template
    const existingInProgress = await this.prisma.auditExecution.findFirst({
      where: {
        tenantId,
        locationId: dto.locationId,
        templateId: dto.templateId,
        status: 'IN_PROGRESS',
        ...(dto.auditInstanceId ? { auditInstanceId: dto.auditInstanceId } : {}),
      },
      orderBy: { startedAt: 'desc' },
    });
    if (existingInProgress) {
      return this.getExecutionById(tenantId, existingInProgress.id);
    }

    // Generate Human-Readable Execution Code with collision protection
    const count = await this.prisma.auditExecution.count({ where: { tenantId } });
    const year = new Date().getFullYear();
    const cleanPrefix = (location.areaCode || 'LOC').replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase();
    let seq = count + 1;
    let auditCode = `EXEC-${cleanPrefix}-${year}-${String(seq).padStart(4, '0')}`;
    while (await this.prisma.auditExecution.findFirst({ where: { tenantId, auditCode } })) {
      seq++;
      auditCode = `EXEC-${cleanPrefix}-${year}-${String(seq).padStart(4, '0')}`;
    }

    const execution = await this.prisma.auditExecution.create({
      data: {
        tenantId,
        auditInstanceId: dto.auditInstanceId,
        locationId: dto.locationId,
        templateId: dto.templateId,
        templateVersionId: versionId,
        auditorId,
        auditCode,
        auditType: dto.auditType || template.auditType || 'ROUTINE',
        status: 'IN_PROGRESS',
        auditorName: dto.auditorName || 'Active Auditor',
        startedAt: new Date(),
      },
    });

    if (dto.auditInstanceId) {
      await this.prisma.scheduledAuditInstance.update({
        where: { id: dto.auditInstanceId },
        data: { status: 'IN_PROGRESS' },
      });
    }

    return this.getExecutionById(tenantId, execution.id);
  }

  async saveDraft(tenantId: string, executionId: string, dto: SaveDraftDto) {
    const execution = await this.prisma.auditExecution.findFirst({
      where: { id: executionId, tenantId },
    });
    if (!execution) {
      throw new NotFoundException(`Audit execution '${executionId}' not found`);
    }

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
          maxScore: ans.maxScore || 5.0,
          status: ans.status || 'CONFORMING',
          notes: ans.notes,
          evidenceUrls: evidenceString,
          voiceNoteUrl: ans.voiceNoteUrl,
        },
        create: {
          tenantId,
          executionId,
          questionId: ans.questionId,
          sectionId: ans.sectionId,
          score: ans.score,
          maxScore: ans.maxScore || 5.0,
          status: ans.status || 'CONFORMING',
          notes: ans.notes,
          evidenceUrls: evidenceString,
          voiceNoteUrl: ans.voiceNoteUrl,
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

  async submitAudit(tenantId: string, executionId: string, dto: SubmitAuditDto) {
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

    // 1. Save all incoming answers
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
          maxScore: ans.maxScore || 5.0,
          status: ans.status || 'CONFORMING',
          notes: ans.notes,
          evidenceUrls: evidenceString,
          voiceNoteUrl: ans.voiceNoteUrl,
        },
        create: {
          tenantId,
          executionId,
          questionId: ans.questionId,
          sectionId: ans.sectionId,
          score: ans.score,
          maxScore: ans.maxScore || 5.0,
          status: ans.status || 'CONFORMING',
          notes: ans.notes,
          evidenceUrls: evidenceString,
          voiceNoteUrl: ans.voiceNoteUrl,
        },
      });
    }

    // 2. Fetch all saved answers and calculate scores
    const savedAnswers = await this.prisma.auditAnswer.findMany({
      where: { executionId, tenantId },
      include: { question: true },
    });

    let totalEarned = 0;
    let totalMax = 0;
    let criticalFailCount = 0;
    let minScoreCap = 100;

    const pillarEarned: Record<string, number> = {};
    const pillarMax: Record<string, number> = {};

    for (const ans of savedAnswers) {
      const section = execution.templateVersion.sections.find((s) => s.id === ans.sectionId);
      const cat = section?.category || 'S1_SORT';

      pillarEarned[cat] = (pillarEarned[cat] || 0) + ans.score;
      pillarMax[cat] = (pillarMax[cat] || 0) + ans.maxScore;

      totalEarned += ans.score;
      totalMax += ans.maxScore;

      // Check critical question failure
      if (ans.question?.isCritical && (ans.status === 'CRITICAL_FAIL' || ans.score === 0)) {
        criticalFailCount++;
        if (ans.question.scoreCapOnFail) {
          minScoreCap = Math.min(minScoreCap, ans.question.scoreCapOnFail);
        } else {
          minScoreCap = Math.min(minScoreCap, 70); // Default 70% safety cap
        }
      }
    }

    const calculatedRawScore = totalMax > 0 ? (totalEarned / totalMax) * 100 : 100;
    const finalScore = criticalFailCount > 0 ? Math.min(calculatedRawScore, minScoreCap) : calculatedRawScore;
    const isPassed = criticalFailCount === 0 && finalScore >= 70;

    const pillarScores: Record<string, number> = {};
    for (const cat of Object.keys(pillarMax)) {
      pillarScores[cat] = pillarMax[cat] > 0 ? Number(((pillarEarned[cat] / pillarMax[cat]) * 100).toFixed(1)) : 100;
    }

    // 3. Auto-generate Observations & Corrective Actions for failing items
    const failingAnswers = savedAnswers.filter(
      (a) => a.status === 'CRITICAL_FAIL' || a.status === 'MAJOR_NC' || a.status === 'MINOR_NC' || a.score < a.maxScore * 0.6
    );

    const now = new Date();
    for (let i = 0; i < failingAnswers.length; i++) {
      const failAns = failingAnswers[i];
      const section = execution.templateVersion.sections.find((s) => s.id === failAns.sectionId);
      const category = section?.category || 'S1_SORT';

      const severity =
        failAns.status === 'CRITICAL_FAIL' || failAns.question?.isCritical
          ? 'CRITICAL'
          : failAns.status === 'MAJOR_NC'
          ? 'MAJOR'
          : 'MODERATE';

      const obsCount = await this.prisma.observation.count({ where: { tenantId } });
      const obsCode = `OBS-${execution.location.areaCode.slice(0, 4).toUpperCase()}-${now.getFullYear()}-${String(obsCount + i + 1).padStart(4, '0')}`;

      const evidenceList = JSON.parse(failAns.evidenceUrls || '[]');
      const beforePhoto = evidenceList[0]?.photoUrl || evidenceList[0] || null;

      const observation = await this.prisma.observation.create({
        data: {
          tenantId,
          observationCode: obsCode,
          executionId,
          answerId: failAns.id,
          locationId: execution.locationId,
          category,
          severity,
          title: `Audit Finding: ${failAns.question?.questionText || '5S Non-Conformance'}`,
          description: failAns.notes || `Non-conformance recorded during audit evaluation for question ${failAns.question?.questionCode || ''}.`,
          beforePhotoUrl: beforePhoto,
          annotatedPhotoUrl: beforePhoto,
          status: 'ACTION_ASSIGNED',
          riskAssessment: severity === 'CRITICAL' ? 'High risk non-conformance requiring 24h remediation.' : 'Moderate non-conformance.',
          tags: JSON.stringify([category, severity, 'AuditTriggered']),
          loggedById: execution.auditorId,
        },
      });

      // SLA hours based on severity
      const slaHours = severity === 'CRITICAL' ? 24 : severity === 'MAJOR' ? 72 : 168; // 1 day, 3 days, 7 days
      const targetDate = new Date(now.getTime() + slaHours * 3600000);

      const capaCount = await this.prisma.correctiveAction.count({ where: { tenantId } });
      const capaCode = `CAPA-${execution.location.areaCode.slice(0, 4).toUpperCase()}-${now.getFullYear()}-${String(capaCount + i + 1).padStart(4, '0')}`;

      const action = await this.prisma.correctiveAction.create({
        data: {
          tenantId,
          actionCode: capaCode,
          observationId: observation.id,
          locationId: execution.locationId,
          title: `Remediate ${failAns.question?.questionText?.slice(0, 60) || '5S Non-Conformance'}`,
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

      await this.prisma.actionHistoryLog.create({
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
    await this.prisma.auditExecution.update({
      where: { id: executionId },
      data: {
        status: 'SUBMITTED',
        overallScore: Number(finalScore.toFixed(1)),
        maxPossibleScore: totalMax,
        earnedScore: Number(totalEarned.toFixed(1)),
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
      await this.prisma.scheduledAuditInstance.update({
        where: { id: execution.auditInstanceId },
        data: {
          status: 'SUBMITTED',
          score: Number(finalScore.toFixed(1)),
        },
      });
    }

    return this.getExecutionById(tenantId, executionId);
  }

  async acknowledgeAudit(tenantId: string, executionId: string, dto: AcknowledgeAuditDto) {
    const execution = await this.prisma.auditExecution.findFirst({
      where: { id: executionId, tenantId },
      include: { location: true },
    });
    if (!execution) {
      throw new NotFoundException(`Audit execution '${executionId}' not found`);
    }

    const acknowledgedAt = new Date();
    await (this.prisma.auditExecution as any).update({
      where: { id: executionId },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt,
        acknowledgedById: dto.acknowledgedById || null,
        acknowledgedByName: dto.acknowledgedByName,
        acknowledgementSignature: dto.acknowledgementSignature || null,
        acknowledgementNotes: dto.acknowledgementNotes,
        targetResolutionDate: dto.targetResolutionDate ? new Date(dto.targetResolutionDate) : null,
        disputeStatus: 'NONE',
      },
    });

    // Unlock all linked CAPA records: activate SLA countdown and transition from PENDING_ACKNOWLEDGEMENT to ASSIGNED
    const linkedObs = await this.prisma.observation.findMany({
      where: { executionId, tenantId },
      include: { correctiveAction: true },
    });

    for (const obs of linkedObs) {
      if (obs.correctiveAction && (obs.correctiveAction.status === 'PENDING_ACKNOWLEDGEMENT' || obs.correctiveAction.status === 'ASSIGNED')) {
        const updatedTarget = dto.targetResolutionDate
          ? new Date(dto.targetResolutionDate)
          : new Date(acknowledgedAt.getTime() + (obs.correctiveAction.slaHours || 72) * 3600000);

        await this.prisma.correctiveAction.update({
          where: { id: obs.correctiveAction.id },
          data: {
            status: 'ASSIGNED',
            targetDate: updatedTarget,
          },
        });

        await this.prisma.actionHistoryLog.create({
          data: {
            tenantId,
            actionId: obs.correctiveAction.id,
            actorId: dto.acknowledgedById || null,
            actorName: dto.acknowledgedByName || 'Area Owner',
            fromStatus: 'PENDING_ACKNOWLEDGEMENT',
            toStatus: 'ASSIGNED',
            comment: `Area Owner formally accepted audit findings. CAPA remediation window active (Target: ${updatedTarget.toISOString().split('T')[0]}).`,
          },
        });
      }
    }

    // Record formal timeline audit log
    await this.prisma.locationAuditLog.create({
      data: {
        tenantId,
        locationId: execution.locationId,
        userId: dto.acknowledgedById || null,
        actionType: 'AUDIT_ACKNOWLEDGED',
        details: JSON.stringify({
          action: 'Area Owner Formally Acknowledged 5S Audit Findings',
          auditCode: execution.auditCode,
          acknowledgedBy: dto.acknowledgedByName,
          overallScore: execution.overallScore,
          targetResolutionDate: dto.targetResolutionDate || 'Standard SLA',
          notes: dto.acknowledgementNotes,
        }),
      },
    });

    return this.getExecutionById(tenantId, executionId);
  }

  async disputeAudit(tenantId: string, executionId: string, dto: DisputeAuditDto) {
    const execution = await this.prisma.auditExecution.findFirst({
      where: { id: executionId, tenantId },
      include: { location: true },
    });
    if (!execution) {
      throw new NotFoundException(`Audit execution '${executionId}' not found`);
    }

    const disputedAt = new Date();
    await (this.prisma.auditExecution as any).update({
      where: { id: executionId },
      data: {
        status: 'DISPUTED',
        disputeStatus: 'DISPUTED',
        disputedAt,
        disputedById: dto.disputedById || null,
        disputedByName: dto.disputedByName,
        disputeReason: dto.disputeReason,
        disputeNotes: dto.disputeNotes,
        disputedQuestionIds: JSON.stringify(dto.disputedQuestionIds || []),
        counterEvidenceUrls: JSON.stringify(dto.counterEvidenceUrls || []),
      },
    });

    // Record formal timeline audit log
    await this.prisma.locationAuditLog.create({
      data: {
        tenantId,
        locationId: execution.locationId,
        userId: dto.disputedById || null,
        actionType: 'AUDIT_DISPUTED',
        details: JSON.stringify({
          action: 'Area Owner Raised Formal Audit Dispute',
          auditCode: execution.auditCode,
          disputedBy: dto.disputedByName,
          reason: dto.disputeReason,
          notes: dto.disputeNotes,
        }),
      },
    });

    return this.getExecutionById(tenantId, executionId);
  }

  async resolveDispute(tenantId: string, executionId: string, dto: ResolveDisputeDto, resolverName?: string) {
    const execution = await this.prisma.auditExecution.findFirst({
      where: { id: executionId, tenantId },
      include: { location: true },
    });
    if (!execution) {
      throw new NotFoundException(`Audit execution '${executionId}' not found`);
    }

    const isAccepted = dto.decision === 'ACCEPT_DISPUTE';
    const disputeStatus = isAccepted ? 'RESOLVED_ACCEPTED' : 'RESOLVED_REJECTED';

    const updateData: any = {
      status: 'ACKNOWLEDGED',
      disputeStatus,
      disputeResolutionNotes: dto.resolutionNotes,
      disputeResolvedAt: new Date(),
      disputeResolvedByName: dto.resolvedByName || resolverName || '5S Program Lead',
    };

    if (isAccepted && dto.adjustedScore !== undefined) {
      updateData.overallScore = dto.adjustedScore;
    }

    await (this.prisma.auditExecution as any).update({
      where: { id: executionId },
      data: updateData,
    });

    // Unlock linked CAPAs
    const linkedObs = await this.prisma.observation.findMany({
      where: { executionId, tenantId },
      include: { correctiveAction: true },
    });

    const now = new Date();
    for (const obs of linkedObs) {
      if (obs.correctiveAction) {
        await this.prisma.correctiveAction.update({
          where: { id: obs.correctiveAction.id },
          data: {
            status: 'ASSIGNED',
            targetDate: new Date(now.getTime() + (obs.correctiveAction.slaHours || 72) * 3600000),
          },
        });

        await this.prisma.actionHistoryLog.create({
          data: {
            tenantId,
            actionId: obs.correctiveAction.id,
            actorId: null,
            actorName: updateData.disputeResolvedByName,
            fromStatus: obs.correctiveAction.status,
            toStatus: 'ASSIGNED',
            comment: `Dispute ${dto.decision} by ${updateData.disputeResolvedByName}. CAPA remediation active.`,
          },
        });
      }
    }

    await this.prisma.locationAuditLog.create({
      data: {
        tenantId,
        locationId: execution.locationId,
        actionType: 'AUDIT_DISPUTE_RESOLVED',
        details: JSON.stringify({
          action: `Audit Dispute ${isAccepted ? 'Accepted & Score Adjusted' : 'Reviewed & Findings Upheld'}`,
          auditCode: execution.auditCode,
          decision: dto.decision,
          resolvedBy: dto.resolvedByName || resolverName || '5S Program Lead',
          resolutionNotes: dto.resolutionNotes,
        }),
      },
    });

    return this.getExecutionById(tenantId, executionId);
  }

  async getAuditReport(tenantId: string, id: string) {
    return this.getExecutionById(tenantId, id);
  }

  async deleteExecution(tenantId: string, id: string) {
    const execution = await this.prisma.auditExecution.findFirst({
      where: { id, tenantId },
    });
    if (!execution) {
      throw new NotFoundException(`Audit execution '${id}' not found`);
    }

    await this.prisma.auditExecution.delete({
      where: { id },
    });

    return { success: true, message: `Execution ${execution.auditCode} deleted` };
  }
}

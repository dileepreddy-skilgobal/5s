import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { maturityFor, readAnalyticsSettings } from '../../core/config/tenant-settings';
import { FILE_PATH } from '../../core/storage/files.service';
import { avg, CLOSED_ACTION_STATUSES, DAY_MS, MetricsService, PILLAR_KEYS } from '../analytics/metrics.service';

const SUPERVISOR_ROLES = ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD'];
/** Scores and pillar breakdown are averaged over this window (matches the analytics default of 12 months). */
const SCORE_WINDOW_DAYS = 365;
const MAX_EVIDENCE_PER_LOCATION = 200;

export interface EvidenceItem {
  id: string;
  source: 'UPLOAD' | 'CAPA';
  category: string;
  description: string;
  beforePhotoUrl: string;
  afterPhotoUrl: string;
  afterLabel: string | null;
  uploadedBy: string | null;
  uploadedById: string | null;
  createdAt: Date;
  /** For CAPA-derived pairs: the action whose closure photo is the "after". */
  actionCode?: string;
}

/**
 * What the location page shows about an area beyond its master data: its audit scorecard (score,
 * maturity band, per-pillar breakdown, open work) and its before / after improvement evidence.
 * Everything is computed from real records with the same rules as the analytics module.
 */
@Injectable()
export class LocationInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  private async location(tenantId: string, locationId: string) {
    const loc = await this.prisma.location.findFirst({ where: { id: locationId, tenantId }, select: { id: true, ownerId: true, backupOwnerId: true } });
    if (!loc) throw new NotFoundException(`Location '${locationId}' not found`);
    return loc;
  }

  private isSupervisor(actor: AuthenticatedUser) {
    return actor.isSuperAdmin || actor.roles.some((r) => SUPERVISOR_ROLES.includes(r));
  }

  // ---------------------------------------------------------------------------
  // Scorecard
  // ---------------------------------------------------------------------------

  async scorecard(tenantId: string, locationId: string) {
    await this.location(tenantId, locationId);
    const since = new Date(Date.now() - SCORE_WINDOW_DAYS * DAY_MS);
    const [allScored, tenant, openActions, overdueActions, openObservations, uploads, capaPairs] = await Promise.all([
      this.metrics.scoredExecutions(tenantId, [locationId]),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
      this.prisma.correctiveAction.count({ where: { tenantId, locationId, status: { notIn: CLOSED_ACTION_STATUSES } } }),
      // Overdue = still with the assignee past its target date (same rule as the corrective-actions list)
      this.prisma.correctiveAction.count({ where: { tenantId, locationId, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'REOPENED'] }, targetDate: { lt: new Date() } } }),
      // Abnormalities still waiting for an action to be assigned
      this.prisma.observation.count({ where: { tenantId, locationId, status: 'OPEN', correctiveAction: null } }),
      this.prisma.locationEvidence.count({ where: { tenantId, locationId } }),
      this.capaPairCount(tenantId, locationId),
    ]);
    const recent = allScored.filter((e) => e.completedAt >= since);
    const latest = allScored[allScored.length - 1] ?? null; // ascending by completion
    const average = avg(recent.map((e) => e.overallScore));
    const band = maturityFor(average, readAnalyticsSettings(tenant?.settings));
    return {
      audits: {
        windowDays: SCORE_WINDOW_DAYS,
        countInWindow: recent.length,
        averageScore: average,
        maturity: band ? { level: band.level, name: band.name, color: band.color } : null,
        latest: latest ? { id: latest.id, auditCode: latest.auditCode, score: latest.overallScore, completedAt: latest.completedAt, auditorName: latest.auditorName || null } : null,
        pillars: PILLAR_KEYS.map((key) => ({ key, score: avg(recent.map((e) => e.pillarScores[key]).filter((v): v is number => v !== undefined)) })),
      },
      work: { openActions, overdueActions, openObservations },
      evidence: { count: uploads + capaPairs },
    };
  }

  // ---------------------------------------------------------------------------
  // Evidence
  // ---------------------------------------------------------------------------

  /** Closed / verified corrective actions with both a "before" (observation) and an "after" photo. */
  private capaPairWhere(tenantId: string, locationId: string) {
    return {
      tenantId,
      locationId,
      status: { in: CLOSED_ACTION_STATUSES },
      afterPhotoUrl: { not: null },
      observation: { beforePhotoUrl: { not: null }, deletedAt: null },
    };
  }

  private capaPairCount(tenantId: string, locationId: string) {
    return this.prisma.correctiveAction.count({ where: this.capaPairWhere(tenantId, locationId) });
  }

  async listEvidence(tenantId: string, locationId: string): Promise<EvidenceItem[]> {
    await this.location(tenantId, locationId);
    const [uploads, actions] = await Promise.all([
      this.prisma.locationEvidence.findMany({ where: { tenantId, locationId }, orderBy: { createdAt: 'desc' }, take: MAX_EVIDENCE_PER_LOCATION }),
      this.prisma.correctiveAction.findMany({
        where: this.capaPairWhere(tenantId, locationId),
        orderBy: { closureSubmittedAt: 'desc' },
        take: MAX_EVIDENCE_PER_LOCATION,
        select: {
          id: true,
          actionCode: true,
          title: true,
          closureNotes: true,
          afterPhotoUrl: true,
          closureSubmittedAt: true,
          verifiedAt: true,
          updatedAt: true,
          assigneeId: true,
          observation: { select: { category: true, beforePhotoUrl: true, annotatedPhotoUrl: true } },
        },
      }),
    ]);
    const userIds = [...new Set([...uploads.map((u) => u.uploadedById), ...actions.map((a) => a.assigneeId)].filter((v): v is string => !!v))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds }, deletedAt: undefined }, select: { id: true, firstName: true, lastName: true } });
    const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    const items: EvidenceItem[] = [
      ...uploads.map((u) => ({
        id: u.id,
        source: 'UPLOAD' as const,
        category: u.category,
        description: u.description,
        beforePhotoUrl: u.beforePhotoUrl,
        afterPhotoUrl: u.afterPhotoUrl,
        afterLabel: u.afterLabel,
        uploadedBy: u.uploadedById ? nameOf.get(u.uploadedById) ?? null : null,
        uploadedById: u.uploadedById,
        createdAt: u.createdAt,
      })),
      ...actions.map((a) => ({
        id: a.id,
        source: 'CAPA' as const,
        category: a.observation.category,
        description: a.closureNotes?.trim() ? `${a.title} — ${a.closureNotes.trim()}` : a.title,
        beforePhotoUrl: (a.observation.beforePhotoUrl ?? a.observation.annotatedPhotoUrl) as string,
        afterPhotoUrl: a.afterPhotoUrl as string,
        afterLabel: 'AFTER (CAPA CLOSED)',
        uploadedBy: a.assigneeId ? nameOf.get(a.assigneeId) ?? null : null,
        uploadedById: a.assigneeId,
        createdAt: a.verifiedAt ?? a.closureSubmittedAt ?? a.updatedAt,
        actionCode: a.actionCode,
      })),
    ];
    return items.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
  }

  /** Both photos must be images stored for this organization (uploaded with the request or earlier). */
  private async assertStoredImage(tenantId: string, ref: string, label: string) {
    const id = new RegExp(`^${FILE_PATH.replace(/\//g, '\\/')}([0-9a-f-]{36})$`, 'i').exec(ref)?.[1];
    const file = id ? await this.prisma.storedFile.findFirst({ where: { id: id.toLowerCase(), tenantId }, select: { contentType: true } }) : null;
    if (!file || !file.contentType.startsWith('image/')) {
      throw new BadRequestException(`${label} must be a photo uploaded from your device.`);
    }
  }

  async addEvidence(
    tenantId: string,
    locationId: string,
    actor: AuthenticatedUser,
    dto: { category: string; description: string; beforePhotoUrl: string; afterPhotoUrl: string; afterLabel?: string },
  ) {
    const loc = await this.location(tenantId, locationId);
    if (!this.isSupervisor(actor) && loc.ownerId !== actor.userId && loc.backupOwnerId !== actor.userId) {
      throw new ForbiddenException('Only the owner of this area (or a supervisor) can add improvement evidence.');
    }
    await this.assertStoredImage(tenantId, dto.beforePhotoUrl, 'The before photo');
    await this.assertStoredImage(tenantId, dto.afterPhotoUrl, 'The after photo');
    if (dto.beforePhotoUrl === dto.afterPhotoUrl) throw new BadRequestException('The before and after photos must be different.');
    const created = await this.prisma.locationEvidence.create({
      data: {
        tenantId,
        locationId,
        category: dto.category,
        description: dto.description.trim(),
        beforePhotoUrl: dto.beforePhotoUrl,
        afterPhotoUrl: dto.afterPhotoUrl,
        afterLabel: dto.afterLabel?.trim() || null,
        uploadedById: actor.userId,
      },
    });
    await this.prisma.locationAuditLog.create({
      data: {
        tenantId,
        locationId,
        userId: actor.userId,
        actionType: 'EVIDENCE_ADDED',
        details: JSON.stringify({ action: 'Added before / after evidence', category: created.category }),
      },
    });
    return (await this.listEvidence(tenantId, locationId)).find((e) => e.id === created.id) ?? created;
  }

  /** The uploader or a supervisor can remove an uploaded pair; CAPA pairs follow their action. */
  async removeEvidence(tenantId: string, locationId: string, evidenceId: string, actor: AuthenticatedUser) {
    await this.location(tenantId, locationId);
    const item = await this.prisma.locationEvidence.findFirst({ where: { id: evidenceId, tenantId, locationId } });
    if (!item) throw new NotFoundException('Evidence not found');
    if (!this.isSupervisor(actor) && item.uploadedById !== actor.userId) {
      throw new ForbiddenException('Only the person who added this evidence (or a supervisor) can remove it.');
    }
    await this.prisma.locationEvidence.update({ where: { id: evidenceId }, data: { deletedAt: new Date(), deletedById: actor.userId } });
    await this.prisma.locationAuditLog.create({
      data: {
        tenantId,
        locationId,
        userId: actor.userId,
        actionType: 'EVIDENCE_REMOVED',
        details: JSON.stringify({ action: 'Removed before / after evidence', category: item.category }),
      },
    });
    return { id: evidenceId, removed: true };
  }
}

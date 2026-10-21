import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { TenantReferenceService } from '../../core/database/tenant-reference.service';
import { nextSequenceCode, codeFragment } from '../../core/database/sequence-code';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantSettingsService } from '../../core/config/tenant-settings.service';
import { documentPrefix, slaHoursFor, parseStoredSettings } from '../../core/config/tenant-settings';
import {
  CreateActionDto,
  UpdateActionDto,
  Update5WhyDto,
  SubmitClosureDto,
  VerifyActionDto,
  CloseActionDto,
  ReassignActionDto,
  ChangeDueDateDto,
  ActionSource,
} from './dto/corrective-action.dto';
import { displayDate } from '../../core/notifications/notification-text';

/** Statuses in which remediation work (edits, root cause, closure evidence) is allowed. */
const OPEN_ACTION_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'REOPENED'] as const;
/** The root cause may also be prepared while the action waits for the audit to be acknowledged. */
const ANALYSIS_STATUSES = [...OPEN_ACTION_STATUSES, 'PENDING_ACKNOWLEDGEMENT'] as const;
/** The assignee may be changed until the closure evidence is submitted (also while the audit awaits sign-off). */
const REASSIGNABLE_STATUSES = ANALYSIS_STATUSES;

/**
 * Workflow steps the current user may take on an action; mirrors the checks of each endpoint.
 * REASSIGN / RESCHEDULE are the manager-only parts of editing (assignee, due date).
 */
export type ActionStep = 'EDIT' | 'START' | 'ANALYSE' | 'SUBMIT_CLOSURE' | 'VERIFY' | 'CLOSE' | 'DELETE' | 'REASSIGN' | 'RESCHEDULE';

/** Kinds of entry in an action's timeline (GET /corrective-actions/:id/timeline). */
export type TimelineKind =
  | 'CREATED'
  | 'STATUS_CHANGED'
  | 'REASSIGNED'
  | 'DUE_DATE_CHANGED'
  | 'ANALYSIS_UPDATED'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'VERIFICATION_REJECTED'
  | 'CLOSED'
  | 'REOPENED'
  | 'ESCALATED';

/** Structured details stored with history entries (ActionHistoryLog.metadata JSON). */
interface HistoryMetadata {
  type?: TimelineKind;
  fromAssigneeId?: string | null;
  toAssigneeId?: string | null;
  fromTargetDate?: string;
  toTargetDate?: string;
  reason?: string | null;
  escalationTier?: string;
  withoutPhoto?: boolean;
}

function parseMetadata(raw: string | null): HistoryMetadata {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as HistoryMetadata) : {};
  } catch {
    return {};
  }
}

/** Timeline kind of a history entry: explicit metadata first, otherwise derived from the status move. */
function timelineKindOf(entry: { fromStatus: string; toStatus: string; comment: string | null; metadata: string | null }): TimelineKind {
  const meta = parseMetadata(entry.metadata);
  if (meta.type) return meta.type;
  const { fromStatus, toStatus } = entry;
  if (fromStatus === 'OPEN' || fromStatus === 'NEW') return 'CREATED';
  if (fromStatus === toStatus) return (entry.comment ?? '').startsWith('5-Why') ? 'ANALYSIS_UPDATED' : 'STATUS_CHANGED';
  if (toStatus === 'PENDING_VERIFICATION') return 'SUBMITTED';
  if (toStatus === 'VERIFIED') return 'VERIFIED';
  if (fromStatus === 'PENDING_VERIFICATION' && toStatus === 'REOPENED') return 'VERIFICATION_REJECTED';
  if (toStatus === 'CLOSED') return 'CLOSED';
  if (toStatus === 'REOPENED') return 'REOPENED';
  return 'STATUS_CHANGED';
}

/**
 * Tenant setting `capa.allowClosureWithoutPhoto` (default false), read from the stored settings JSON so it
 * works whether or not the typed settings model carries the `capa` section yet.
 */
function allowsClosureWithoutPhoto(settingsJson: string | null | undefined): boolean {
  const stored = parseStoredSettings(settingsJson);
  const capa: unknown = Reflect.get(stored, 'capa');
  return !!capa && typeof capa === 'object' && Reflect.get(capa, 'allowClosureWithoutPhoto') === true;
}

const filled = (v: string | null | undefined): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * The assignee's SLA clock runs only while the action is with them: it stops once closure evidence is
 * submitted (verification is someone else's step) and does not start before the audit is acknowledged.
 */
function isAssigneeOverdue(status: string, targetDate: Date, now: Date): boolean {
  return (OPEN_ACTION_STATUSES as readonly string[]).includes(status) && targetDate < now;
}

export interface FiveWhyContent {
  why1?: string;
  why2?: string;
  why3?: string;
  why4?: string;
  why5?: string;
  rootCauseConclusion?: string;
  solution?: string;
  preventiveAction?: string;
  verificationCriteria?: string;
}

/** A closure can only be submitted once the root cause and the solution are on record. */
function hasRootCauseAndSolution(analysis: FiveWhyContent): boolean {
  const filled = (v?: string) => typeof v === 'string' && v.trim().length > 0;
  const whys = [analysis.why1, analysis.why2, analysis.why3, analysis.why4, analysis.why5];
  return (filled(analysis.rootCauseConclusion) || whys.some(filled)) && filled(analysis.solution);
}

function parseAnalysis(raw: string | null): FiveWhyContent {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as FiveWhyContent) : {};
  } catch {
    return {};
  }
}

@Injectable()
export class CorrectiveActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantRefs: TenantReferenceService,
    private readonly settingsService: TenantSettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  async listActions(
    tenantId: string,
    actor: AuthenticatedUser,
    query?: {
      status?: string;
      assigneeId?: string;
      locationId?: string;
      isOverdue?: string;
      escalationTier?: string;
      search?: string;
      severity?: string;
      source?: string;
    },
  ) {
    const now = new Date();
    const where: Prisma.CorrectiveActionWhereInput = { tenantId };
    if (query?.status) where.status = query.status;
    if (query?.assigneeId) where.assigneeId = query.assigneeId === 'me' ? actor.userId : query.assigneeId;
    if (query?.locationId) where.locationId = query.locationId;
    if (query?.escalationTier) where.escalationTier = query.escalationTier;
    if (query?.source) where.source = query.source;
    // Severity is the severity of the finding the action fixes
    if (query?.severity) where.observation = { severity: query.severity };
    // Overdue is derived with the same rule as the rows (the stored flag is not maintained)
    if (query?.isOverdue === 'true' || query?.isOverdue === '1') {
      where.AND = [{ status: { in: [...OPEN_ACTION_STATUSES] } }, { targetDate: { lt: now } }];
    }

    if (query?.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.OR = [
        { title: contains },
        { description: contains },
        { actionCode: contains },
        { location: { name: contains } },
        { assignee: { OR: [{ firstName: contains }, { lastName: contains }] } },
      ];
    }

    const actions = await this.prisma.correctiveAction.findMany({
      where,
      include: {
        location: { select: { id: true, name: true, areaCode: true, building: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedBy: { select: { id: true, firstName: true, lastName: true } },
        verifiedBy: { select: { id: true, firstName: true, lastName: true } },
        observation: {
          select: {
            id: true,
            observationCode: true,
            category: true,
            severity: true,
            title: true,
            beforePhotoUrl: true,
            execution: {
              select: {
                id: true,
                auditCode: true,
                status: true,
                startedAt: true,
              },
            },
          },
        },
      },
      orderBy: { targetDate: 'asc' },
    });

    const submitters = await this.lastSubmitters(
      tenantId,
      actions.filter((a) => a.status === 'PENDING_VERIFICATION').map((a) => a.id),
    );

    return actions.map((act) => ({
      ...act,
      isOverdue: isAssigneeOverdue(act.status, act.targetDate, now),
      fiveWhyAnalysis: parseAnalysis(act.fiveWhyAnalysis),
      allowedActions: this.allowedActions(act, actor, submitters.get(act.id) ?? null),
    }));
  }

  /** Who submitted the latest closure evidence of each action (for the independent-verifier rule). */
  private async lastSubmitters(tenantId: string, actionIds: string[]): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    if (!actionIds.length) return result;
    const logs = await this.prisma.actionHistoryLog.findMany({
      where: { tenantId, actionId: { in: actionIds }, toStatus: 'PENDING_VERIFICATION' },
      orderBy: { createdAt: 'desc' },
      select: { actionId: true, actorId: true },
    });
    for (const log of logs) {
      if (!result.has(log.actionId)) result.set(log.actionId, log.actorId);
    }
    return result;
  }

  private hasRole(actor: AuthenticatedUser, group: readonly string[]): boolean {
    return actor.isSuperAdmin || actor.roles.some((r) => group.includes(r));
  }

  /**
   * Steps the actor may take on the action right now, using the same role, ownership and status rules
   * the workflow endpoints enforce, so clients only offer actions that will be accepted.
   */
  private allowedActions(
    action: { status: string; assigneeId: string | null },
    actor: AuthenticatedUser,
    lastSubmitterId: string | null,
  ): ActionStep[] {
    const steps: ActionStep[] = [];
    const { status } = action;
    const isManager = this.hasRole(actor, RoleGroups.ACTION_ASSIGNERS);
    const canWork = this.hasRole(actor, RoleGroups.ACTION_OWNERS) && (isManager || action.assigneeId === actor.userId);

    if (canWork && (OPEN_ACTION_STATUSES as readonly string[]).includes(status)) steps.push('EDIT', 'SUBMIT_CLOSURE');
    if (canWork && (status === 'ASSIGNED' || status === 'REOPENED')) steps.push('START');
    if (canWork && (ANALYSIS_STATUSES as readonly string[]).includes(status)) steps.push('ANALYSE');
    // Assignee and due date are set by whoever manages the action, not by the assignee
    if (isManager && (REASSIGNABLE_STATUSES as readonly string[]).includes(status)) steps.push('REASSIGN');
    if (isManager && (OPEN_ACTION_STATUSES as readonly string[]).includes(status)) steps.push('RESCHEDULE');
    if (
      status === 'PENDING_VERIFICATION' &&
      this.hasRole(actor, RoleGroups.ACTION_VERIFIERS) &&
      action.assigneeId !== actor.userId &&
      lastSubmitterId !== actor.userId
    ) {
      steps.push('VERIFY');
    }
    if (status === 'VERIFIED' && this.hasRole(actor, RoleGroups.ACTION_CLOSERS)) steps.push('CLOSE');
    if (status !== 'VERIFIED' && status !== 'CLOSED' && this.hasRole(actor, RoleGroups.PROGRAM_MANAGERS)) steps.push('DELETE');
    return steps;
  }

  async getActionById(tenantId: string, id: string, actor: AuthenticatedUser) {
    const action = await this.prisma.correctiveAction.findFirst({
      where: { id, tenantId },
      include: {
        location: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
            orgNode: { select: { id: true, name: true, code: true } },
          },
        },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        assignedBy: { select: { id: true, firstName: true, lastName: true } },
        verifiedBy: { select: { id: true, firstName: true, lastName: true } },
        observation: {
          include: {
            loggedBy: { select: { id: true, firstName: true, lastName: true } },
            execution: { select: { id: true, auditCode: true, startedAt: true } },
          },
        },
        history: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!action) {
      throw new NotFoundException(`Corrective action with ID '${id}' not found`);
    }

    // History is newest first, so this is the latest closure submission
    const lastSubmission = action.history.find((h) => h.toStatus === 'PENDING_VERIFICATION');
    const redTag = action.redTagId
      ? await this.prisma.redTag.findFirst({
          where: { id: action.redTagId, tenantId },
          select: { id: true, tagNumber: true, itemName: true, status: true },
        })
      : null;

    return {
      ...action,
      redTag,
      isOverdue: isAssigneeOverdue(action.status, action.targetDate, new Date()),
      fiveWhyAnalysis: parseAnalysis(action.fiveWhyAnalysis),
      allowedActions: this.allowedActions(action, actor, lastSubmission?.actorId ?? null),
      observation: {
        ...action.observation,
        tags: JSON.parse(action.observation.tags || '[]'),
      },
    };
  }

  /**
   * Raises a corrective action from an observation, from a red tag, or standalone (management review).
   * Every action fixes one finding record, so red-tag and standalone actions get one created with them.
   */
  async createAction(tenantId: string, actor: AuthenticatedUser, dto: CreateActionDto) {
    const assignedById = actor.userId;
    const settings = await this.settingsService.get(tenantId);

    // ---- Resolve the origin: existing observation, red tag, or a standalone action ----
    let source: ActionSource;
    let redTagId: string | null = null;
    let locationId: string;
    let severity: string;
    let existingObservationId: string | null = null;
    let newFinding: Omit<Prisma.ObservationUncheckedCreateInput, 'tenantId' | 'observationCode' | 'locationId'> | null = null;

    if (dto.observationId) {
      const observation = await this.prisma.observation.findFirst({
        where: { id: dto.observationId, tenantId },
      });
      if (!observation) {
        throw new NotFoundException(`Observation '${dto.observationId}' not found`);
      }
      // One action per finding (soft-deleted actions still hold the link)
      const linked = await this.prisma.correctiveAction.findFirst({
        where: { tenantId, observationId: observation.id, deletedAt: undefined },
        select: { actionCode: true, deletedAt: true },
      });
      if (linked) {
        throw new ConflictException(
          linked.deletedAt
            ? `Observation ${observation.observationCode} is linked to deleted action ${linked.actionCode}; a new action cannot be raised for it.`
            : `Observation ${observation.observationCode} already has corrective action ${linked.actionCode}.`,
        );
      }
      existingObservationId = observation.id;
      source = observation.executionId ? 'AUDIT' : 'OBSERVATION';
      locationId = dto.locationId || observation.locationId;
      severity = observation.severity;
    } else if (dto.redTagId) {
      const tag = await this.prisma.redTag.findFirst({ where: { id: dto.redTagId, tenantId } });
      if (!tag) {
        throw new NotFoundException(`Red tag '${dto.redTagId}' not found`);
      }
      if (tag.status === 'CANCELLED') {
        throw new ConflictException(`Red tag ${tag.tagNumber} is cancelled; no corrective action can be raised from it.`);
      }
      const linked = await this.prisma.correctiveAction.findFirst({
        where: { tenantId, redTagId: tag.id, status: { not: 'CLOSED' } },
        select: { actionCode: true },
      });
      if (linked) {
        throw new ConflictException(`Red tag ${tag.tagNumber} already has open corrective action ${linked.actionCode}.`);
      }
      source = 'RED_TAG';
      redTagId = tag.id;
      locationId = tag.locationId;
      severity = dto.severity || 'MODERATE';
      newFinding = {
        category: 'S1_SORT',
        severity,
        title: `Red tag ${tag.tagNumber}: ${tag.itemName}`,
        description: dto.description,
        beforePhotoUrl: tag.photoUrl,
        annotatedPhotoUrl: tag.photoUrl,
        tags: JSON.stringify(['RED_TAG', tag.tagNumber]),
      };
    } else {
      if (!dto.locationId) {
        throw new BadRequestException('Choose the location the corrective action is for.');
      }
      source = 'MANAGEMENT_REVIEW';
      locationId = dto.locationId;
      severity = dto.severity || 'MODERATE';
      newFinding = {
        category: dto.category || 'S5_SUSTAIN',
        severity,
        title: dto.title,
        description: dto.description,
        tags: JSON.stringify(['MANAGEMENT_REVIEW']),
      };
    }

    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
    });
    if (!location) {
      throw new NotFoundException(`Location '${locationId}' not found`);
    }
    await this.tenantRefs.assertOptional(tenantId, 'user', dto.assigneeId, 'Assignee');

    const year = new Date().getFullYear();
    const actionCode = await nextSequenceCode(documentPrefix(settings, 'action', codeFragment(location.areaCode), year), (prefix) =>
      this.prisma.correctiveAction
        .findMany({ where: { tenantId, actionCode: { startsWith: prefix }, deletedAt: undefined }, select: { actionCode: true } })
        .then((rows) => rows.map((r) => r.actionCode)),
    );
    const observationCode = newFinding
      ? await nextSequenceCode(documentPrefix(settings, 'observation', codeFragment(location.areaCode), year), (prefix) =>
          this.prisma.observation
            .findMany({ where: { tenantId, observationCode: { startsWith: prefix }, deletedAt: undefined }, select: { observationCode: true } })
            .then((rows) => rows.map((r) => r.observationCode)),
        )
      : null;

    const slaHours = dto.slaHours || slaHoursFor(settings, severity);
    const targetDate = dto.targetDate ? new Date(dto.targetDate) : new Date(Date.now() + slaHours * 3600000);
    const actorName = await this.getActorName(assignedById, 'Action Assigner');
    const originLabel: Record<ActionSource, string> = {
      AUDIT: 'an audit finding',
      OBSERVATION: 'an observation',
      RED_TAG: 'a red tag',
      MANAGEMENT_REVIEW: 'a management review',
    };

    const action = await this.prisma.$transaction(async (tx) => {
      let observationId = existingObservationId;
      if (newFinding && observationCode) {
        const finding = await tx.observation.create({
          data: { ...newFinding, tenantId, observationCode, locationId, status: 'ACTION_ASSIGNED', loggedById: assignedById },
        });
        observationId = finding.id;
      } else if (observationId) {
        await tx.observation.update({ where: { id: observationId }, data: { status: 'ACTION_ASSIGNED' } });
      }
      if (!observationId) {
        throw new BadRequestException('The corrective action has no finding to fix.');
      }

      const created = await tx.correctiveAction.create({
        data: {
          tenantId,
          actionCode,
          observationId,
          locationId,
          source,
          redTagId,
          title: dto.title,
          description: dto.description,
          actionType: dto.actionType || 'CORRECTIVE',
          rootCauseCategory: dto.rootCauseCategory || 'METHOD',
          assigneeId: dto.assigneeId || location.ownerId,
          assignedById,
          targetDate,
          slaHours,
          status: 'ASSIGNED',
        },
      });

      await tx.actionHistoryLog.create({
        data: {
          tenantId,
          actionId: created.id,
          actorId: assignedById,
          actorName,
          fromStatus: 'OPEN',
          toStatus: 'ASSIGNED',
          comment: `Raised from ${originLabel[source]} with ${slaHours}h SLA.`,
          metadata: JSON.stringify({ type: 'CREATED', toAssigneeId: created.assigneeId } satisfies HistoryMetadata),
        },
      });
      return created;
    });

    await this.notifyActionEvent(tenantId, action.id, 'ASSIGNED', assignedById);
    return this.getActionById(tenantId, action.id, actor);
  }

  /** Manager step: hand the action to another (active) user of the tenant; recorded in its history. */
  async reassignAction(tenantId: string, id: string, actor: AuthenticatedUser, dto: ReassignActionDto) {
    const existing = await this.getActionForStep(tenantId, id, REASSIGNABLE_STATUSES, 'reassigned');
    await this.tenantRefs.assertExists(tenantId, 'user', dto.assigneeId, 'Assignee', { status: 'ACTIVE' });
    if (dto.assigneeId === existing.assigneeId) {
      throw new ConflictException(`Action ${existing.actionCode} is already assigned to this person.`);
    }
    await this.recordReassignment(tenantId, existing, dto.assigneeId, dto.reason ?? null, actor);
    await this.notifyActionEvent(tenantId, id, 'ASSIGNED', actor.userId);
    return this.getActionById(tenantId, id, actor);
  }

  /** Manager step: move the target date with a reason; recorded in its history and the assignee is told. */
  async changeDueDate(tenantId: string, id: string, actor: AuthenticatedUser, dto: ChangeDueDateDto) {
    const existing = await this.getActionForStep(tenantId, id, OPEN_ACTION_STATUSES, 'rescheduled');
    const targetDate = new Date(dto.targetDate);
    if (targetDate.getTime() <= Date.now()) {
      throw new BadRequestException('The new due date must be in the future.');
    }
    await this.recordDueDateChange(tenantId, existing, targetDate, dto.reason.trim(), actor);
    await this.notifyActionEvent(tenantId, id, 'RESCHEDULED', actor.userId);
    return this.getActionById(tenantId, id, actor);
  }

  private async recordReassignment(
    tenantId: string,
    existing: { id: string; status: string; assigneeId: string | null },
    assigneeId: string,
    reason: string | null,
    actor: AuthenticatedUser,
  ) {
    const names = await this.prisma.user.findMany({
      where: { tenantId, id: { in: [existing.assigneeId, assigneeId].filter((v): v is string => !!v) } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameOf = (userId: string | null) => {
      const u = names.find((n) => n.id === userId);
      return u ? `${u.firstName} ${u.lastName}`.trim() : 'nobody';
    };
    const actorName = await this.getActorName(actor.userId, 'Action Assigner');
    await this.prisma.$transaction([
      this.prisma.correctiveAction.update({ where: { id: existing.id }, data: { assigneeId } }),
      this.prisma.actionHistoryLog.create({
        data: {
          tenantId,
          actionId: existing.id,
          actorId: actor.userId,
          actorName,
          fromStatus: existing.status,
          toStatus: existing.status,
          comment: `Reassigned from ${nameOf(existing.assigneeId)} to ${nameOf(assigneeId)}.${filled(reason) ? ` ${reason.trim()}` : ''}`,
          metadata: JSON.stringify({
            type: 'REASSIGNED',
            fromAssigneeId: existing.assigneeId,
            toAssigneeId: assigneeId,
            reason: filled(reason) ? reason.trim() : null,
          } satisfies HistoryMetadata),
        },
      }),
    ]);
  }

  private async recordDueDateChange(
    tenantId: string,
    existing: { id: string; status: string; targetDate: Date },
    targetDate: Date,
    reason: string | null,
    actor: AuthenticatedUser,
  ) {
    const actorName = await this.getActorName(actor.userId, 'Action Assigner');
    const day = (d: Date) => d.toISOString().slice(0, 10);
    await this.prisma.$transaction([
      // A new date resets any escalation that the old date had triggered
      this.prisma.correctiveAction.update({ where: { id: existing.id }, data: { targetDate, isOverdue: false, escalationTier: 'NORMAL' } }),
      this.prisma.actionHistoryLog.create({
        data: {
          tenantId,
          actionId: existing.id,
          actorId: actor.userId,
          actorName,
          fromStatus: existing.status,
          toStatus: existing.status,
          comment: `Due date moved from ${day(existing.targetDate)} to ${day(targetDate)}.${filled(reason) ? ` ${reason}` : ''}`,
          metadata: JSON.stringify({
            type: 'DUE_DATE_CHANGED',
            fromTargetDate: existing.targetDate.toISOString(),
            toTargetDate: targetDate.toISOString(),
            reason: filled(reason) ? reason : null,
          } satisfies HistoryMetadata),
        },
      }),
    ]);
  }

  /**
   * For the escalation scheduler: sets the action's escalation tier and records the step in its history
   * (no-op when the tier is unchanged). Returns whether anything changed.
   */
  async recordEscalation(tenantId: string, id: string, escalationTier: string, comment: string): Promise<boolean> {
    const existing = await this.prisma.correctiveAction.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, escalationTier: true },
    });
    if (!existing || existing.escalationTier === escalationTier) return false;
    await this.prisma.$transaction([
      this.prisma.correctiveAction.update({ where: { id }, data: { escalationTier } }),
      this.prisma.actionHistoryLog.create({
        data: {
          tenantId,
          actionId: id,
          actorId: null,
          actorName: 'Escalation',
          fromStatus: existing.status,
          toStatus: existing.status,
          comment,
          metadata: JSON.stringify({ type: 'ESCALATED', escalationTier } satisfies HistoryMetadata),
        },
      }),
    ]);
    return true;
  }

  /** Who did what to the action, oldest first, with each entry classified for display. */
  async getTimeline(tenantId: string, id: string) {
    const action = await this.prisma.correctiveAction.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!action) {
      throw new NotFoundException(`Corrective action '${id}' not found`);
    }
    const entries = await this.prisma.actionHistoryLog.findMany({
      where: { tenantId, actionId: id },
      orderBy: { createdAt: 'asc' },
    });
    return entries.map((e) => {
      const meta = parseMetadata(e.metadata);
      return {
        id: e.id,
        kind: timelineKindOf(e),
        at: e.createdAt,
        actorId: e.actorId,
        actorName: e.actorName,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        comment: e.comment,
        fromAssigneeId: meta.fromAssigneeId ?? null,
        toAssigneeId: meta.toAssigneeId ?? null,
        fromTargetDate: meta.fromTargetDate ?? null,
        toTargetDate: meta.toTargetDate ?? null,
        reason: meta.reason ?? null,
        escalationTier: meta.escalationTier ?? null,
      };
    });
  }

  /** Closure rules of the tenant that the client needs before submitting evidence. */
  async getClosurePolicy(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    return { allowClosureWithoutPhoto: allowsClosureWithoutPhoto(tenant?.settings) };
  }

  /** Loads a CAPA of the tenant, enforcing the statuses in which the requested step is allowed. */
  private async getActionForStep(tenantId: string, id: string, allowed: readonly string[], step: string) {
    const existing = await this.prisma.correctiveAction.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Corrective action '${id}' not found`);
    }
    if (!allowed.includes(existing.status)) {
      if (existing.status === 'PENDING_ACKNOWLEDGEMENT') {
        throw new ConflictException(
          `Action ${existing.actionCode} is locked until the Area Owner formally acknowledges the audit findings.`,
        );
      }
      throw new ConflictException(`Action ${existing.actionCode} cannot be ${step} while it is ${existing.status}.`);
    }
    return existing;
  }

  /** Area owners may only work on actions assigned to them; CAPA managers may work on any action. */
  private assertCanWorkOn(action: { assigneeId: string | null; actionCode: string }, actor: AuthenticatedUser) {
    const isManager = this.hasRole(actor, RoleGroups.ACTION_ASSIGNERS);
    if (!isManager && action.assigneeId !== actor.userId) {
      throw new ForbiddenException(`Action ${action.actionCode} is not assigned to you.`);
    }
  }

  private async getActorName(userId: string, fallback: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    return user ? `${user.firstName} ${user.lastName}`.trim() : fallback;
  }

  async updateAction(tenantId: string, id: string, dto: UpdateActionDto, actor: AuthenticatedUser) {
    const existing = await this.getActionForStep(tenantId, id, OPEN_ACTION_STATUSES, 'edited');
    this.assertCanWorkOn(existing, actor);
    await this.tenantRefs.assertOptional(tenantId, 'user', dto.assigneeId, 'Assignee');

    // Status is driven by the workflow endpoints; the only manual transition is starting work on an open action
    if (dto.status !== undefined && dto.status !== existing.status) {
      const canStart = dto.status === 'IN_PROGRESS' && ['ASSIGNED', 'REOPENED'].includes(existing.status);
      if (!canStart) {
        throw new ConflictException(
          `Status cannot be changed from ${existing.status} to ${dto.status} directly. Use the submit-closure and verify steps.`,
        );
      }
    }

    // Assignee and due date belong to whoever manages the action; changes are kept in the history
    const { targetDate, assigneeId, ...rest } = dto;
    const reassign = !!assigneeId && assigneeId !== existing.assigneeId;
    const newTargetDate = targetDate ? new Date(targetDate) : null;
    const reschedule = !!newTargetDate && newTargetDate.getTime() !== existing.targetDate.getTime();
    if ((reassign || reschedule) && !this.hasRole(actor, RoleGroups.ACTION_ASSIGNERS)) {
      throw new ForbiddenException('Only the person managing this action can change its assignee or due date.');
    }
    if (reassign) {
      await this.tenantRefs.assertExists(tenantId, 'user', assigneeId, 'Assignee', { status: 'ACTIVE' });
    }

    await this.prisma.correctiveAction.update({
      where: { id },
      data: rest,
    });
    if (reassign) await this.recordReassignment(tenantId, existing, assigneeId, null, actor);
    if (reschedule && newTargetDate) await this.recordDueDateChange(tenantId, existing, newTargetDate, null, actor);

    if (dto.status && dto.status !== existing.status) {
      await this.prisma.actionHistoryLog.create({
        data: {
          tenantId,
          actionId: id,
          actorId: actor.userId,
          actorName: await this.getActorName(actor.userId, 'Action Owner'),
          fromStatus: existing.status,
          toStatus: dto.status,
          comment: `Status updated to ${dto.status}.`,
        },
      });
    }

    if (reassign) {
      await this.notifyActionEvent(tenantId, id, 'ASSIGNED', actor.userId);
    } else if (reschedule) {
      await this.notifyActionEvent(tenantId, id, 'RESCHEDULED', actor.userId);
    }
    return this.getActionById(tenantId, id, actor);
  }

  async update5Why(tenantId: string, id: string, dto: Update5WhyDto, actor: AuthenticatedUser) {
    const existing = await this.getActionForStep(tenantId, id, ANALYSIS_STATUSES, 'analysed');
    this.assertCanWorkOn(existing, actor);

    const currentAnalysis = parseAnalysis(existing.fiveWhyAnalysis);
    const updatedAnalysis = {
      ...currentAnalysis,
      why1: dto.why1 !== undefined ? dto.why1 : currentAnalysis.why1 || '',
      why2: dto.why2 !== undefined ? dto.why2 : currentAnalysis.why2 || '',
      why3: dto.why3 !== undefined ? dto.why3 : currentAnalysis.why3 || '',
      why4: dto.why4 !== undefined ? dto.why4 : currentAnalysis.why4 || '',
      why5: dto.why5 !== undefined ? dto.why5 : currentAnalysis.why5 || '',
      rootCauseConclusion: dto.rootCauseConclusion !== undefined ? dto.rootCauseConclusion : currentAnalysis.rootCauseConclusion || '',
      solution: dto.solution !== undefined ? dto.solution : currentAnalysis.solution || '',
      preventiveAction: dto.preventiveAction !== undefined ? dto.preventiveAction : currentAnalysis.preventiveAction || '',
      verificationCriteria: dto.verificationCriteria !== undefined ? dto.verificationCriteria : currentAnalysis.verificationCriteria || '',
    };

    await this.prisma.$transaction([
      this.prisma.correctiveAction.update({
        where: { id },
        data: {
          fiveWhyAnalysis: JSON.stringify(updatedAnalysis),
          rootCauseCategory: dto.rootCauseCategory || existing.rootCauseCategory,
        },
      }),
      this.prisma.actionHistoryLog.create({
        data: {
          tenantId,
          actionId: id,
          actorId: actor.userId,
          actorName: await this.getActorName(actor.userId, 'Action Owner'),
          fromStatus: existing.status,
          toStatus: existing.status,
          comment: '5-Why root cause investigation updated.',
        },
      }),
    ]);

    return this.getActionById(tenantId, id, actor);
  }

  async submitClosure(tenantId: string, id: string, actor: AuthenticatedUser, dto: SubmitClosureDto) {
    const existing = await this.getActionForStep(tenantId, id, OPEN_ACTION_STATUSES, 'submitted for closure');
    this.assertCanWorkOn(existing, actor);
    if (!hasRootCauseAndSolution(parseAnalysis(existing.fiveWhyAnalysis))) {
      throw new BadRequestException(
        `Record the root cause and the solution (5-Why analysis) for ${existing.actionCode} before submitting it for verification.`,
      );
    }
    if (!filled(dto.closureNotes)) {
      throw new BadRequestException('Describe what was done to fix the problem.');
    }
    // An after photo is the closure evidence; the tenant may allow an exception with a recorded justification
    const withoutPhoto = !filled(dto.afterPhotoUrl);
    if (withoutPhoto) {
      const { allowClosureWithoutPhoto } = await this.getClosurePolicy(tenantId);
      if (!allowClosureWithoutPhoto) {
        throw new BadRequestException(`Add an after photo of the fixed area before submitting ${existing.actionCode}.`);
      }
      if (!filled(dto.noPhotoJustification)) {
        throw new BadRequestException('Explain why there is no after photo.');
      }
    }
    const closureNotes = withoutPhoto
      ? `${dto.closureNotes.trim()}\n\nNo after photo: ${(dto.noPhotoJustification ?? '').trim()}`
      : dto.closureNotes;
    const actorName = await this.getActorName(actor.userId, 'Action Assignee');

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.correctiveAction.updateMany({
        where: { id, tenantId, status: existing.status },
        data: {
          status: 'PENDING_VERIFICATION',
          closureNotes,
          afterPhotoUrl: withoutPhoto ? null : dto.afterPhotoUrl,
          closureSubmittedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(`Action ${existing.actionCode} was changed by someone else. Reload and try again.`);
      }

      await tx.observation.update({
        where: { id: existing.observationId },
        data: { status: 'PENDING_VERIFICATION' },
      });

      await tx.actionHistoryLog.create({
        data: {
          tenantId,
          actionId: id,
          actorId: actor.userId,
          actorName,
          fromStatus: existing.status,
          toStatus: 'PENDING_VERIFICATION',
          comment: `Closure evidence submitted: ${closureNotes}`,
          metadata: JSON.stringify({
            type: 'SUBMITTED',
            withoutPhoto,
            reason: withoutPhoto ? (dto.noPhotoJustification ?? '').trim() : null,
          } satisfies HistoryMetadata),
        },
      });
    });

    await this.notifyActionEvent(tenantId, id, 'SUBMITTED', actor.userId);
    return this.getActionById(tenantId, id, actor);
  }

  async verifyAction(tenantId: string, id: string, actor: AuthenticatedUser, dto: VerifyActionDto) {
    const existing = await this.getActionForStep(tenantId, id, ['PENDING_VERIFICATION'], 'verified');

    // Independent verification: neither the assignee nor whoever submitted the closure evidence may verify it
    const lastSubmission = await this.prisma.actionHistoryLog.findFirst({
      where: { tenantId, actionId: id, toStatus: 'PENDING_VERIFICATION' },
      orderBy: { createdAt: 'desc' },
      select: { actorId: true },
    });
    if (existing.assigneeId === actor.userId || lastSubmission?.actorId === actor.userId) {
      throw new ForbiddenException('Closure must be verified by someone other than the assignee or the person who submitted it.');
    }
    // The assignee must learn what to fix: a rejection always carries the verifier's reason
    const rejectionReason = dto.verificationNotes?.trim() ?? '';
    if (!dto.approved && !rejectionReason) {
      throw new BadRequestException('Give the reason for rejecting the closure evidence.');
    }

    const verifierName = await this.getActorName(actor.userId, 'Independent Verifier');
    const toStatus = dto.approved ? 'VERIFIED' : 'REOPENED';

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.correctiveAction.updateMany({
        where: { id, tenantId, status: 'PENDING_VERIFICATION' },
        data: dto.approved
          ? {
              status: 'VERIFIED',
              verifiedById: actor.userId,
              verifiedAt: new Date(),
              verificationNotes: dto.verificationNotes || 'Verification approved by independent verifier.',
            }
          : {
              status: 'REOPENED',
              reopenCount: existing.reopenCount + 1,
              verificationNotes: rejectionReason,
            },
      });
      if (updated.count === 0) {
        throw new ConflictException(`Action ${existing.actionCode} was changed by someone else. Reload and try again.`);
      }

      await tx.observation.update({
        where: { id: existing.observationId },
        data: { status: dto.approved ? 'CLOSED' : 'IN_PROGRESS' },
      });

      await tx.actionHistoryLog.create({
        data: {
          tenantId,
          actionId: id,
          actorId: actor.userId,
          actorName: verifierName,
          fromStatus: existing.status,
          toStatus,
          comment: dto.approved
            ? `Verification sign-off APPROVED. Action closed successfully. ${dto.verificationNotes || ''}`
            : `Verification REJECTED and REOPENED: ${rejectionReason}`,
          metadata: dto.approved ? null : JSON.stringify({ type: 'VERIFICATION_REJECTED', reason: rejectionReason } satisfies HistoryMetadata),
        },
      });
    });

    await this.notifyActionEvent(tenantId, id, dto.approved ? 'VERIFIED' : 'REOPENED', actor.userId, dto.approved ? undefined : rejectionReason);
    return this.getActionById(tenantId, id, actor);
  }

  /**
   * Final lifecycle step (BRD: Verified -> Closed): an effectiveness review some time after
   * verification confirms the fix has held. An ineffective fix reopens the action.
   */
  async closeAction(tenantId: string, id: string, actor: AuthenticatedUser, dto: CloseActionDto) {
    const existing = await this.getActionForStep(tenantId, id, ['VERIFIED'], 'closed');
    const actorName = await this.getActorName(actor.userId, 'Effectiveness Reviewer');
    const toStatus = dto.effective ? 'CLOSED' : 'REOPENED';

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.correctiveAction.updateMany({
        where: { id, tenantId, status: 'VERIFIED' },
        data: dto.effective
          ? { status: 'CLOSED', closedAt: new Date(), closedById: actor.userId, effectivenessReview: dto.effectivenessReview }
          : { status: 'REOPENED', reopenCount: existing.reopenCount + 1, effectivenessReview: dto.effectivenessReview },
      });
      if (updated.count === 0) {
        throw new ConflictException(`Action ${existing.actionCode} was changed by someone else. Reload and try again.`);
      }
      if (!dto.effective) {
        await tx.observation.update({ where: { id: existing.observationId }, data: { status: 'IN_PROGRESS' } });
      }
      await tx.actionHistoryLog.create({
        data: {
          tenantId,
          actionId: id,
          actorId: actor.userId,
          actorName,
          fromStatus: 'VERIFIED',
          toStatus,
          comment: dto.effective
            ? `Effectiveness confirmed; action closed. ${dto.effectivenessReview}`
            : `Fix did not hold; action reopened. ${dto.effectivenessReview}`,
        },
      });
    });

    await this.notifyActionEvent(tenantId, id, dto.effective ? 'CLOSED' : 'REOPENED', actor.userId, dto.effective ? undefined : dto.effectivenessReview);
    return this.getActionById(tenantId, id, actor);
  }

  async deleteAction(tenantId: string, id: string, actorId: string) {
    const existing = await this.prisma.correctiveAction.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Corrective action '${id}' not found`);
    }
    // Verified actions are part of the compliance record and cannot be deleted
    if (['VERIFIED', 'CLOSED'].includes(existing.status)) {
      throw new ConflictException(`Action ${existing.actionCode} is ${existing.status} and cannot be deleted.`);
    }

    const deletedAt = new Date();
    // A finding created only to carry this action (red tag, management review) goes with it; an audit
    // finding or observation stays in the register and is open again
    const ownsFinding = existing.source === 'RED_TAG' || existing.source === 'MANAGEMENT_REVIEW';
    await this.prisma.$transaction([
      this.prisma.correctiveAction.update({ where: { id }, data: { deletedAt, deletedById: actorId } }),
      ownsFinding
        ? this.prisma.observation.updateMany({ where: { id: existing.observationId, tenantId }, data: { deletedAt, deletedById: actorId } })
        : this.prisma.observation.updateMany({ where: { id: existing.observationId, tenantId }, data: { status: 'OPEN' } }),
    ]);
    return { id: existing.id, actionCode: existing.actionCode, deleted: true };
  }

  /** Post-commit notifications for corrective-action workflow events (never fail the operation). */
  private async notifyActionEvent(
    tenantId: string,
    id: string,
    event: 'ASSIGNED' | 'SUBMITTED' | 'VERIFIED' | 'REOPENED' | 'CLOSED' | 'RESCHEDULED',
    actorId: string | null,
    /** Reason shown to the assignee (e.g. why the verifier rejected the evidence). */
    detail?: string,
  ) {
    const a = await this.prisma.correctiveAction.findFirst({
      where: { id, tenantId },
      select: { actionCode: true, title: true, status: true, assigneeId: true, assignedById: true, targetDate: true, location: { select: { name: true } } },
    });
    if (!a) return;
    // Actions held until the audit is acknowledged are announced when they unlock
    if (event === 'ASSIGNED' && a.status === 'PENDING_ACKNOWLEDGEMENT') return;
    const due = displayDate(a.targetDate);
    const why = filled(detail) ? ` Reason: ${detail.trim()}` : '';
    const content: Record<typeof event, { userIds: Array<string | null>; title: string; body: string }> = {
      ASSIGNED: { userIds: [a.assigneeId], title: `New corrective action ${a.actionCode}`, body: `"${a.title}" at ${a.location.name} is assigned to you, due ${due}.` },
      SUBMITTED: { userIds: [a.assignedById], title: `${a.actionCode} is ready for verification`, body: `Closure evidence for "${a.title}" at ${a.location.name} was submitted and needs independent verification.` },
      VERIFIED: { userIds: [a.assigneeId], title: `${a.actionCode} verified`, body: `Your fix for "${a.title}" at ${a.location.name} was verified. Thank you.` },
      REOPENED: { userIds: [a.assigneeId], title: `${a.actionCode} reopened`, body: `"${a.title}" at ${a.location.name} was reopened and needs further work (due ${due}).${why}` },
      RESCHEDULED: { userIds: [a.assigneeId], title: `${a.actionCode} has a new due date`, body: `"${a.title}" at ${a.location.name} is now due ${due}.` },
      CLOSED: { userIds: [a.assigneeId, a.assignedById], title: `${a.actionCode} closed`, body: `"${a.title}" at ${a.location.name} passed its effectiveness review and is closed.` },
    };
    const c = content[event];
    await this.notifications.notify({
      tenantId,
      userIds: c.userIds,
      excludeUserId: actorId,
      type: `ACTION_${event}`,
      title: c.title,
      body: c.body,
      entityType: 'CorrectiveAction',
      entityId: id,
      link: `/capa?id=${id}`,
    });
  }

}

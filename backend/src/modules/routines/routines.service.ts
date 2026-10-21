import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { ObservationsService } from '../observations/observations.service';

export type RoutineKind = 'KAMISHIBAI' | 'SHADOW_TOOL';
export const OK_STATUSES: Record<RoutineKind, string[]> = { KAMISHIBAI: ['OK'], SHADOW_TOOL: ['PRESENT'] };
export const STATUSES: Record<RoutineKind, string[]> = { KAMISHIBAI: ['OK', 'NOT_OK'], SHADOW_TOOL: ['PRESENT', 'MISSING', 'DAMAGED'] };
const MAX_ITEMS_PER_KIND = 40;

/** Generic starter Kamishibai checks an administrator can load for a location and then adapt. */
const DEFAULT_KAMISHIBAI: Array<{ text: string; category: string }> = [
  { text: 'Only items needed for today\'s work are at the workstation', category: 'S1_SORT' },
  { text: 'Tools and materials are in their marked places', category: 'S2_SET_IN_ORDER' },
  { text: 'Floor, machines and work surfaces are clean; no leaks', category: 'S3_SHINE' },
  { text: 'Visual standards and labels are in place and readable', category: 'S4_STANDARDIZE' },
  { text: 'Aisles, exits and safety equipment are unobstructed', category: 'S6_SAFETY' },
];

/** Working day used for daily checks (server local calendar day). */
export function today(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());

/**
 * Daily area routines: Kamishibai questions and shadow-board tool checks per location. Items are
 * configured per location; each day the area owner (or a supervisor) records one result per item.
 * A failed check or missing tool can raise an observation, which then follows the normal CAPA flow.
 */
@Injectable()
export class RoutinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly observations: ObservationsService,
  ) {}

  private async location(tenantId: string, locationId: string) {
    const loc = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
      select: { id: true, name: true, areaCode: true, ownerId: true, backupOwnerId: true },
    });
    if (!loc) throw new NotFoundException(`Location '${locationId}' not found`);
    return loc;
  }

  /** Area owners may only work on the areas they own (or back up); supervisors on any area. */
  private assertResponsible(loc: { ownerId: string | null; backupOwnerId: string | null }, actor: AuthenticatedUser) {
    const supervisor = actor.isSuperAdmin || actor.roles.some((r) => ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD'].includes(r));
    if (!supervisor && loc.ownerId !== actor.userId && loc.backupOwnerId !== actor.userId) {
      throw new ForbiddenException('Only the owner of this area (or a supervisor) can record or change its daily routine.');
    }
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  async addItem(tenantId: string, locationId: string, actor: AuthenticatedUser, dto: { kind: RoutineKind; text: string; position?: string; category?: string }) {
    const loc = await this.location(tenantId, locationId);
    this.assertResponsible(loc, actor);
    const count = await this.prisma.routineItem.count({ where: { tenantId, locationId, kind: dto.kind, isActive: true } });
    if (count >= MAX_ITEMS_PER_KIND) throw new BadRequestException(`A location can have at most ${MAX_ITEMS_PER_KIND} active ${dto.kind === 'KAMISHIBAI' ? 'checks' : 'tools'}.`);
    return this.prisma.routineItem.create({
      data: {
        tenantId,
        locationId,
        kind: dto.kind,
        text: dto.text.trim(),
        position: dto.position?.trim() || null,
        category: dto.category ?? (dto.kind === 'SHADOW_TOOL' ? 'S2_SET_IN_ORDER' : 'S5_SUSTAIN'),
        sortOrder: count + 1,
        createdById: actor.userId,
      },
    });
  }

  async addDefaults(tenantId: string, locationId: string, actor: AuthenticatedUser) {
    const loc = await this.location(tenantId, locationId);
    this.assertResponsible(loc, actor);
    const existing = await this.prisma.routineItem.count({ where: { tenantId, locationId, kind: 'KAMISHIBAI', isActive: true } });
    if (existing > 0) throw new ConflictException('This location already has daily checks; edit them instead.');
    await this.prisma.routineItem.createMany({
      data: DEFAULT_KAMISHIBAI.map((d, i) => ({ tenantId, locationId, kind: 'KAMISHIBAI', text: d.text, category: d.category, sortOrder: i + 1, createdById: actor.userId })),
    });
    return this.items(tenantId, locationId);
  }

  async updateItem(tenantId: string, locationId: string, itemId: string, actor: AuthenticatedUser, dto: { text?: string; position?: string | null; category?: string; sortOrder?: number }) {
    const loc = await this.location(tenantId, locationId);
    this.assertResponsible(loc, actor);
    const item = await this.prisma.routineItem.findFirst({ where: { id: itemId, tenantId, locationId, isActive: true } });
    if (!item) throw new NotFoundException('Routine item not found');
    return this.prisma.routineItem.update({
      where: { id: itemId },
      data: {
        ...(dto.text !== undefined ? { text: dto.text.trim() } : {}),
        ...(dto.position !== undefined ? { position: dto.position?.trim() || null } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  /** Retired, not deleted: past results keep pointing at the item they answered. */
  async retireItem(tenantId: string, locationId: string, itemId: string, actor: AuthenticatedUser) {
    const loc = await this.location(tenantId, locationId);
    this.assertResponsible(loc, actor);
    const { count } = await this.prisma.routineItem.updateMany({ where: { id: itemId, tenantId, locationId, isActive: true }, data: { isActive: false } });
    if (count === 0) throw new NotFoundException('Routine item not found');
    return { id: itemId, retired: true };
  }

  private items(tenantId: string, locationId: string) {
    return this.prisma.routineItem.findMany({
      where: { tenantId, locationId, isActive: true },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, kind: true, text: true, position: true, category: true, sortOrder: true },
    });
  }

  // ---------------------------------------------------------------------------
  // Daily results
  // ---------------------------------------------------------------------------

  /** One day's routine for a location: every active item with its result (null = not checked yet). */
  async day(tenantId: string, locationId: string, date?: string) {
    const loc = await this.location(tenantId, locationId);
    const day = date ?? today();
    if (!isDate(day)) throw new BadRequestException('date must be YYYY-MM-DD');
    const [items, checks] = await Promise.all([
      this.items(tenantId, locationId),
      this.prisma.routineCheck.findMany({
        where: { tenantId, locationId, checkDate: day },
        select: { itemId: true, status: true, note: true, observationId: true, checkedAt: true, checkedById: true },
      }),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(checks.map((c) => c.checkedById))] }, deletedAt: undefined },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    const byItem = new Map(checks.map((c) => [c.itemId, { ...c, checkedBy: nameOf.get(c.checkedById) ?? null }]));
    const rows = items.map((i) => ({ ...i, check: byItem.get(i.id) ?? null }));
    const summarize = (kind: RoutineKind) => {
      const list = rows.filter((r) => r.kind === kind);
      const done = list.filter((r) => r.check).length;
      const issues = list.filter((r) => r.check && !OK_STATUSES[kind].includes(r.check.status)).length;
      return { total: list.length, done, issues };
    };
    return {
      location: { id: loc.id, name: loc.name, areaCode: loc.areaCode },
      date: day,
      isToday: day === today(),
      kamishibai: rows.filter((r) => r.kind === 'KAMISHIBAI'),
      tools: rows.filter((r) => r.kind === 'SHADOW_TOOL'),
      summary: { kamishibai: summarize('KAMISHIBAI'), tools: summarize('SHADOW_TOOL') },
    };
  }

  /**
   * Records (or corrects) today's result for one item. Results can only be recorded for the current
   * day, so the history cannot be back-filled. A failed result can raise an observation once.
   */
  async record(
    tenantId: string,
    locationId: string,
    actor: AuthenticatedUser,
    dto: { itemId: string; status: string; note?: string; raiseObservation?: boolean },
  ) {
    const loc = await this.location(tenantId, locationId);
    this.assertResponsible(loc, actor);
    const item = await this.prisma.routineItem.findFirst({ where: { id: dto.itemId, tenantId, locationId, isActive: true } });
    if (!item) throw new NotFoundException('Routine item not found');
    const kind = item.kind as RoutineKind;
    if (!STATUSES[kind].includes(dto.status)) throw new BadRequestException(`status must be one of ${STATUSES[kind].join(', ')}`);
    const failed = !OK_STATUSES[kind].includes(dto.status);
    if (dto.raiseObservation && !failed) throw new BadRequestException('An observation can only be raised for a failed check or a missing / damaged tool.');
    const day = today();
    const existing = await this.prisma.routineCheck.findUnique({ where: { itemId_checkDate: { itemId: item.id, checkDate: day } } });

    let observationId = existing?.observationId ?? null;
    if (dto.raiseObservation && !observationId) {
      const what =
        kind === 'SHADOW_TOOL'
          ? `Shadow board: ${item.text}${item.position ? ` (${item.position})` : ''} ${dto.status === 'MISSING' ? 'missing' : 'damaged'}`
          : `Daily check failed: ${item.text}`;
      const obs = await this.observations.createObservation(tenantId, actor.userId, {
        locationId,
        category: item.category,
        severity: 'MINOR',
        title: what.slice(0, 200),
        description: dto.note?.trim() || `Raised from the daily routine at ${loc.name} on ${day}.`,
        tags: ['DailyRoutine', kind],
      });
      observationId = obs.id;
    }

    const data = { status: dto.status, note: dto.note?.trim() || null, observationId, checkedById: actor.userId, checkedAt: new Date() };
    await this.prisma.routineCheck.upsert({
      where: { itemId_checkDate: { itemId: item.id, checkDate: day } },
      create: { tenantId, locationId, itemId: item.id, checkDate: day, ...data },
      update: data,
    });
    return this.day(tenantId, locationId, day);
  }

  /** Completion and issues per day for the last N days. */
  async history(tenantId: string, locationId: string, days = 30) {
    await this.location(tenantId, locationId);
    const n = Math.min(Math.max(days, 1), 180);
    const dates = Array.from({ length: n }, (_, i) => today(new Date(Date.now() - i * 86400000)));
    const [items, checks] = await Promise.all([
      this.prisma.routineItem.findMany({ where: { tenantId, locationId }, select: { id: true, kind: true, isActive: true, createdAt: true, updatedAt: true } }),
      this.prisma.routineCheck.findMany({
        where: { tenantId, locationId, checkDate: { in: dates } },
        select: { itemId: true, checkDate: true, status: true, item: { select: { kind: true } } },
      }),
    ]);
    const activeKinds = (kind: RoutineKind) => items.filter((i) => i.kind === kind && i.isActive).length;
    // Items in use on a day: created by then and not yet retired (a retired item's last update is its retirement)
    const inUseOn = (kind: RoutineKind, d: string) =>
      items.filter((i) => i.kind === kind && today(i.createdAt) <= d && (i.isActive || today(i.updatedAt) > d)).map((i) => i.id);
    return {
      days: dates.map((d) => {
        const dayChecks = checks.filter((c) => c.checkDate === d);
        const part = (kind: RoutineKind) => {
          const list = dayChecks.filter((c) => c.item.kind === kind);
          // An item answered that day always counts, even if the dates above say otherwise
          const total = new Set([...inUseOn(kind, d), ...list.map((c) => c.itemId)]).size;
          return { total, done: list.length, issues: list.filter((c) => !OK_STATUSES[kind].includes(c.status)).length };
        };
        return { date: d, kamishibai: part('KAMISHIBAI'), tools: part('SHADOW_TOOL') };
      }),
      currentItems: { kamishibai: activeKinds('KAMISHIBAI'), tools: activeKinds('SHADOW_TOOL') },
    };
  }
}

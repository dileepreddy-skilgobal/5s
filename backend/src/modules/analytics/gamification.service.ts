import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { TenantSettingsService } from '../../core/config/tenant-settings.service';
import { AnalyticsSettings } from '../../core/config/tenant-settings';
import { DomainValues } from '../../core/validation/domain-values';
import { CLOSED_ACTION_STATUSES, DAY_MS, MetricsService, ScoredExecution, avg, pct } from './metrics.service';

/** XP granted per kudos; fixed server-side so it cannot be inflated by the client. */
export const KUDOS_POINTS = 25;
/** Maximum kudos one user may send in a rolling 24 hours. */
const KUDOS_DAILY_LIMIT = 10;
/** Score at or above which an owned area earns the "excellent audit" bonus. */
const EXCELLENT_SCORE = 90;
/** XP is counted over a rolling season so newcomers can catch up. */
const SEASON_MONTHS = 12;

type RuleKey =
  | 'AUDIT_CONDUCTED'
  | 'AREA_AUDIT_EXCELLENT'
  | 'AREA_AUDIT_PASSED'
  | 'ACTION_ON_TIME'
  | 'OBSERVATION_REPORTED'
  | 'RED_TAG_RAISED'
  | 'KUDOS_RECEIVED'
  | 'TROPHY_AWARDED';

/** The single source for both the XP calculation and the rules guide shown to users. */
export const POINT_RULES: Record<RuleKey, { points: number; label: string; category: string }> = {
  AUDIT_CONDUCTED: { points: 20, label: 'Audit conducted and submitted', category: 'AUDIT' },
  AREA_AUDIT_EXCELLENT: { points: 100, label: `Owned area scores ≥ ${EXCELLENT_SCORE}% in an audit`, category: 'AUDIT' },
  AREA_AUDIT_PASSED: { points: 40, label: 'Owned area passes an audit', category: 'AUDIT' },
  ACTION_ON_TIME: { points: 50, label: 'Corrective action verified on or before its target date', category: 'CAPA' },
  OBSERVATION_REPORTED: { points: 10, label: 'Abnormality reported', category: 'OBSERVATION' },
  RED_TAG_RAISED: { points: 10, label: 'Red tag raised', category: 'SORT' },
  KUDOS_RECEIVED: { points: KUDOS_POINTS, label: 'Kudos received from a colleague', category: 'RECOGNITION' },
  TROPHY_AWARDED: { points: 250, label: 'Owned area awarded a floating trophy', category: 'TROPHY' },
};

const LEVELS = [
  { levelNumber: 1, title: '5S Starter', minPoints: 0, badgeColor: '#94A3B8' },
  { levelNumber: 2, title: '5S Practitioner', minPoints: 250, badgeColor: '#3B82F6' },
  { levelNumber: 3, title: '5S Contributor', minPoints: 750, badgeColor: '#10B981' },
  { levelNumber: 4, title: '5S Champion', minPoints: 1500, badgeColor: '#F59E0B' },
  { levelNumber: 5, title: '5S Continuous Improvement Champion', minPoints: 3000, badgeColor: '#8B5CF6' },
  { levelNumber: 6, title: 'Plant 5S Master', minPoints: 5000, badgeColor: '#EC4899' },
];

export type TrophyKey = (typeof DomainValues.TROPHY_KEYS)[number];
type Cadence = 'MONTHLY' | 'QUARTERLY';

interface TrophyDefinition {
  key: TrophyKey;
  title: string;
  subtitle: string;
  iconType: string;
  tier: string;
  evaluationPeriod: Cadence;
  /** Days of history the criteria (and the score recorded at award) are evaluated over. */
  windowDays: number;
  criteria: string[];
}

const TROPHIES: TrophyDefinition[] = [
  {
    key: 'GOLDEN_BROOM',
    title: 'The Golden Broom',
    subtitle: 'Best Shopfloor Cleanliness & Visual Order',
    iconType: 'BROOM',
    tier: 'GOLD',
    evaluationPeriod: 'MONTHLY',
    windowDays: 90,
    criteria: ['3S Shine average ≥ 95% across the last 4 audits', 'No overdue corrective actions'],
  },
  {
    key: 'PLANT_EXCELLENCE',
    title: '5S Plant Excellence Cup',
    subtitle: 'Highest Overall 5S Score & Sustained Culture',
    iconType: 'CUP',
    tier: 'PLATINUM',
    evaluationPeriod: 'QUARTERLY',
    windowDays: 90,
    criteria: ['Average audit score ≥ 95% over the last 90 days', 'At least 2 audits in the window'],
  },
  {
    key: 'KAIZEN_SHIELD',
    title: 'Zero-Defect Kaizen Shield',
    subtitle: 'Fastest Corrective Action Closure',
    iconType: 'SHIELD',
    tier: 'SILVER',
    evaluationPeriod: 'MONTHLY',
    windowDays: 90,
    criteria: ['At least 3 corrective actions verified in the last 90 days', '100% closed on or before target date', 'No repeat observations in the window'],
  },
  {
    key: 'SAFETY_VANGUARD',
    title: 'Safety & Ergonomics Vanguard Trophy',
    subtitle: 'Zero Safety Findings & Perfect Demarcations',
    iconType: 'STAR',
    tier: 'BRONZE',
    evaluationPeriod: 'MONTHLY',
    windowDays: 180,
    criteria: ['No 6S Safety observations in the last 180 days', 'At least 3 audits in the window', 'Highest 6S Safety pillar average'],
  },
];

const BADGES = [
  { id: 'EAGLE_EYE_AUDITOR', title: 'Eagle-Eye Auditor', category: 'AUDIT', tier: 'RARE', icon: 'Eye', target: 30, description: 'Conduct and submit 30 audits.' },
  { id: 'SPEEDY_FIXER', title: 'Speedy Fixer', category: 'SPEED', tier: 'EPIC', icon: 'Zap', target: 25, description: 'Have 25 corrective actions verified on or before their target date.' },
  { id: 'RED_TAG_BUSTER', title: 'Red Tag Buster', category: 'SORT', tier: 'RARE', icon: 'Tag', target: 50, description: 'Raise 50 red tags for unneeded items.' },
  { id: 'SHARP_OBSERVER', title: 'Sharp Observer', category: 'OBSERVATION', tier: 'RARE', icon: 'Lightbulb', target: 25, description: 'Report 25 abnormalities.' },
  { id: 'SHINE_MASTER', title: 'Shine Master', category: 'SUSTAIN', tier: 'LEGENDARY', icon: 'Sparkles', target: 10, description: 'Own areas that score ≥ 95% on 3S Shine in 10 audits.' },
  { id: 'SAFETY_SENTINEL', title: 'Safety Sentinel', category: 'SAFETY', tier: 'LEGENDARY', icon: 'ShieldCheck', target: 180, description: 'Keep your owned areas free of 6S Safety observations for 180 consecutive days.' },
  { id: 'TEAM_SPIRIT', title: 'Team Spirit', category: 'RECOGNITION', tier: 'EPIC', icon: 'Sparkles', target: 10, description: 'Receive kudos from colleagues 10 times.' },
] as const;

interface ActivityEvent {
  rule: RuleKey;
  at: Date;
  points: number;
}

/** All raw activity for a tenant, loaded once per request and shared by every gamification view. */
interface TenantActivity {
  settings: AnalyticsSettings;
  now: Date;
  seasonFrom: Date;
  users: { id: string; name: string; department: string; role: string }[];
  locations: { id: string; name: string; areaCode: string; department: string; ownerId: string | null; ownerName: string | null; active: boolean; createdAt: Date }[];
  executions: ScoredExecution[];
  actions: { assigneeId: string | null; locationId: string; verifiedAt: Date; targetDate: Date }[];
  openActions: { locationId: string; targetDate: Date }[];
  observations: { loggedById: string | null; locationId: string; category: string; isRepeat: boolean; createdAt: Date }[];
  redTags: { taggedById: string | null; taggedDate: Date }[];
  kudos: { toUserId: string; points: number; createdAt: Date }[];
  awards: { id: string; trophyKey: string; locationId: string; citation: string; scoreAtAward: number | null; awardedAt: Date; endedAt: Date | null }[];
  instances: { locationId: string; status: string }[];
}

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);

/**
 * Recognition derived from real activity: XP, levels, badges and leaderboards are calculated from
 * audits, corrective actions, observations, red tags, kudos and trophy awards. Nothing is stored
 * except the human decisions (trophy awards and kudos).
 */
@Injectable()
export class GamificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly notifications: NotificationsService,
    private readonly tenantSettings: TenantSettingsService,
  ) {}

  /** Recognition is optional (BRD §55): when an organization switches it off, nothing new can be awarded. */
  private async assertRecognitionEnabled(tenantId: string) {
    const { gamification } = await this.tenantSettings.get(tenantId);
    if (!gamification.enabled) throw new ForbiddenException('Recognition is turned off for this organization');
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  private async loadActivity(tenantId: string): Promise<TenantActivity> {
    const now = new Date();
    const seasonFrom = new Date(now.getFullYear(), now.getMonth() - SEASON_MONTHS, now.getDate());
    const [settings, users, locations] = await Promise.all([
      this.metrics.settings(tenantId),
      this.prisma.user.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: true,
          jobTitle: true,
          assignments: { select: { role: { select: { name: true } } }, take: 1 },
        },
      }),
      this.prisma.location.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          areaCode: true,
          status: true,
          ownerId: true,
          createdAt: true,
          orgNode: { select: { name: true } },
          owner: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);
    const locationIds = locations.map((l) => l.id);

    const [executions, actions, openActions, observations, redTags, kudos, awards, instances] = await Promise.all([
      this.metrics.scoredExecutions(tenantId, locationIds),
      this.prisma.correctiveAction.findMany({
        where: { tenantId, status: { in: CLOSED_ACTION_STATUSES }, verifiedAt: { not: null } },
        select: { assigneeId: true, locationId: true, verifiedAt: true, targetDate: true },
      }),
      this.prisma.correctiveAction.findMany({
        where: { tenantId, status: { notIn: CLOSED_ACTION_STATUSES } },
        select: { locationId: true, targetDate: true },
      }),
      this.prisma.observation.findMany({
        where: { tenantId },
        select: { loggedById: true, locationId: true, category: true, isRepeat: true, createdAt: true },
      }),
      this.prisma.redTag.findMany({ where: { tenantId }, select: { taggedById: true, taggedDate: true } }),
      this.prisma.kudos.findMany({ where: { tenantId }, select: { toUserId: true, points: true, createdAt: true } }),
      this.prisma.trophyAward.findMany({
        where: { tenantId },
        select: { id: true, trophyKey: true, locationId: true, citation: true, scoreAtAward: true, awardedAt: true, endedAt: true },
        orderBy: { awardedAt: 'desc' },
      }),
      this.prisma.scheduledAuditInstance.findMany({
        where: { tenantId, status: { not: 'CANCELLED' }, dueDate: { gte: seasonFrom, lte: now } },
        select: { locationId: true, status: true },
      }),
    ]);

    return {
      settings,
      now,
      seasonFrom,
      users: users.map((u) => ({
        id: u.id,
        name: fullName(u) as string,
        department: u.department ?? '',
        role: u.assignments[0]?.role.name ?? u.jobTitle ?? '',
      })),
      locations: locations.map((l) => ({
        id: l.id,
        name: l.name,
        areaCode: l.areaCode,
        department: l.orgNode?.name ?? '',
        ownerId: l.ownerId,
        ownerName: fullName(l.owner),
        active: l.status === 'ACTIVE',
        createdAt: l.createdAt,
      })),
      executions,
      actions: actions.map((a) => ({ ...a, verifiedAt: a.verifiedAt as Date })),
      openActions,
      observations,
      redTags,
      kudos,
      awards,
      instances,
    };
  }

  // ---------------------------------------------------------------------------
  // XP attribution
  // ---------------------------------------------------------------------------

  private event(rule: RuleKey, at: Date, points = POINT_RULES[rule].points): ActivityEvent {
    return { rule, at, points };
  }

  /** Every XP-earning event per user. Area results are credited to the area's current owner. */
  private userEvents(a: TenantActivity): Map<string, ActivityEvent[]> {
    const byUser = new Map<string, ActivityEvent[]>();
    const push = (userId: string | null | undefined, e: ActivityEvent) => {
      if (!userId) return;
      const list = byUser.get(userId) ?? [];
      list.push(e);
      byUser.set(userId, list);
    };
    const ownerOf = new Map(a.locations.map((l) => [l.id, l.ownerId]));

    a.executions.forEach((e) => {
      push(e.auditorId, this.event('AUDIT_CONDUCTED', e.completedAt));
      const owner = ownerOf.get(e.locationId);
      if (e.overallScore >= EXCELLENT_SCORE) push(owner, this.event('AREA_AUDIT_EXCELLENT', e.completedAt));
      else if (e.overallScore >= a.settings.passScore) push(owner, this.event('AREA_AUDIT_PASSED', e.completedAt));
    });
    a.actions.filter((x) => x.verifiedAt <= x.targetDate).forEach((x) => push(x.assigneeId, this.event('ACTION_ON_TIME', x.verifiedAt)));
    a.observations.forEach((o) => push(o.loggedById, this.event('OBSERVATION_REPORTED', o.createdAt)));
    a.redTags.forEach((t) => push(t.taggedById, this.event('RED_TAG_RAISED', t.taggedDate)));
    a.kudos.forEach((k) => push(k.toUserId, this.event('KUDOS_RECEIVED', k.createdAt, k.points)));
    a.awards.forEach((w) => push(ownerOf.get(w.locationId), this.event('TROPHY_AWARDED', w.awardedAt)));
    return byUser;
  }

  /** XP earned by an area itself (audit results, on-time actions, trophies). */
  private locationPoints(a: TenantActivity, locationId: string): number {
    let points = 0;
    a.executions
      .filter((e) => e.locationId === locationId && e.completedAt >= a.seasonFrom)
      .forEach((e) => {
        if (e.overallScore >= EXCELLENT_SCORE) points += POINT_RULES.AREA_AUDIT_EXCELLENT.points;
        else if (e.overallScore >= a.settings.passScore) points += POINT_RULES.AREA_AUDIT_PASSED.points;
      });
    points += a.actions.filter((x) => x.locationId === locationId && x.verifiedAt >= a.seasonFrom && x.verifiedAt <= x.targetDate).length * POINT_RULES.ACTION_ON_TIME.points;
    points += a.awards.filter((w) => w.locationId === locationId && w.awardedAt >= a.seasonFrom).length * POINT_RULES.TROPHY_AWARDED.points;
    return points;
  }

  private seasonPoints(events: ActivityEvent[] | undefined, seasonFrom: Date): number {
    return (events ?? []).filter((e) => e.at >= seasonFrom).reduce((s, e) => s + e.points, 0);
  }

  private levelFor(points: number) {
    const idx = LEVELS.reduce((found, l, i) => (points >= l.minPoints ? i : found), 0);
    const current = LEVELS[idx];
    const next = LEVELS[idx + 1];
    return {
      levelNumber: current.levelNumber,
      title: current.title,
      badgeColor: current.badgeColor,
      nextLevelTitle: next ? next.title : null,
      pointsToNextLevel: next ? next.minPoints - points : null,
      progressPercent: next ? Math.round(((points - current.minPoints) / (next.minPoints - current.minPoints)) * 100) : 100,
    };
  }

  /** Consecutive passing audits ending with the most recent one. */
  private passingStreak(scores: number[], passScore: number): number {
    let n = 0;
    for (let i = scores.length - 1; i >= 0 && scores[i] >= passScore; i--) n++;
    return n;
  }

  // ---------------------------------------------------------------------------
  // Badges
  // ---------------------------------------------------------------------------

  private badgesFor(a: TenantActivity, userId: string, events: ActivityEvent[]) {
    const dates = (rule: RuleKey) => events.filter((e) => e.rule === rule).map((e) => e.at).sort((x, y) => x.getTime() - y.getTime());
    const owned = a.locations.filter((l) => l.ownerId === userId);
    const ownedIds = new Set(owned.map((l) => l.id));

    const countBadge = (target: number, sortedDates: Date[]) => ({
      current: Math.min(sortedDates.length, target),
      unlockedDate: sortedDates.length >= target ? sortedDates[target - 1] : null,
    });

    const shineDates = a.executions
      .filter((e) => ownedIds.has(e.locationId) && (e.pillarScores.S3_SHINE ?? -1) >= 95)
      .map((e) => e.completedAt);

    // Longest stretch without a 6S Safety observation across owned areas (badges stay earned once reached)
    const safetySentinel = (target: number) => {
      if (owned.length === 0) return { current: 0, unlockedDate: null as Date | null };
      const start = new Date(Math.min(...owned.map((l) => l.createdAt.getTime())));
      const marks = a.observations
        .filter((o) => ownedIds.has(o.locationId) && o.category === 'S6_SAFETY' && o.createdAt >= start)
        .map((o) => o.createdAt)
        .sort((x, y) => x.getTime() - y.getTime());
      let from = start;
      for (const m of [...marks, a.now]) {
        if ((m.getTime() - from.getTime()) / DAY_MS >= target) return { current: target, unlockedDate: new Date(from.getTime() + target * DAY_MS) };
        from = m;
      }
      const lastMark = marks.length ? marks[marks.length - 1] : start;
      return { current: Math.floor((a.now.getTime() - lastMark.getTime()) / DAY_MS), unlockedDate: null };
    };

    return BADGES.map((b) => {
      const progress =
        b.id === 'EAGLE_EYE_AUDITOR' ? countBadge(b.target, dates('AUDIT_CONDUCTED'))
        : b.id === 'SPEEDY_FIXER' ? countBadge(b.target, dates('ACTION_ON_TIME'))
        : b.id === 'RED_TAG_BUSTER' ? countBadge(b.target, dates('RED_TAG_RAISED'))
        : b.id === 'SHARP_OBSERVER' ? countBadge(b.target, dates('OBSERVATION_REPORTED'))
        : b.id === 'TEAM_SPIRIT' ? countBadge(b.target, dates('KUDOS_RECEIVED'))
        : b.id === 'SHINE_MASTER' ? countBadge(b.target, shineDates.sort((x, y) => x.getTime() - y.getTime()))
        : safetySentinel(b.target);
      return {
        id: b.id,
        title: b.title,
        category: b.category,
        tier: b.tier,
        icon: b.icon,
        description: b.description,
        unlocked: progress.unlockedDate !== null,
        unlockedDate: progress.unlockedDate ? progress.unlockedDate.toISOString() : null,
        progress: { current: progress.current, target: b.target, percent: Math.round((progress.current / b.target) * 100) },
      };
    });
  }

  private async assertUser(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
    if (!user) throw new NotFoundException(`User '${userId}' not found`);
  }

  // ---------------------------------------------------------------------------
  // Public views
  // ---------------------------------------------------------------------------

  async getOverview(tenantId: string, userId: string) {
    await this.assertUser(tenantId, userId);
    const a = await this.loadActivity(tenantId);
    const byUser = this.userEvents(a);
    const events = byUser.get(userId) ?? [];
    const points = this.seasonPoints(events, a.seasonFrom);

    const standings = a.users
      .map((u) => ({ id: u.id, points: this.seasonPoints(byUser.get(u.id), a.seasonFrom) }))
      .filter((u) => u.points > 0)
      .sort((x, y) => y.points - x.points);
    const rankIdx = standings.findIndex((s) => s.id === userId);

    const owned = a.locations.filter((l) => l.ownerId === userId && l.active);
    const streaks = owned.map((l) => this.passingStreak(a.executions.filter((e) => e.locationId === l.id).map((e) => e.overallScore), a.settings.passScore));
    const seasonEvents = events.filter((e) => e.at >= a.seasonFrom);
    const count = (rule: RuleKey) => seasonEvents.filter((e) => e.rule === rule).length;

    return {
      success: true,
      data: {
        season: { from: a.seasonFrom.toISOString(), to: a.now.toISOString() },
        userStats: {
          currentPoints: points,
          currentLevel: this.levelFor(points),
          passingAuditStreak: owned.length ? Math.max(...streaks) : null,
          plantRank: rankIdx >= 0 ? rankIdx + 1 : null,
          totalParticipants: standings.length,
          kpis: {
            auditsConducted: count('AUDIT_CONDUCTED'),
            actionsClosedOnTime: count('ACTION_ON_TIME'),
            observationsReported: count('OBSERVATION_REPORTED'),
            redTagsRaised: count('RED_TAG_RAISED'),
            kudosReceived: count('KUDOS_RECEIVED'),
            floatingTrophiesHeld: a.awards.filter((w) => !w.endedAt && owned.some((l) => l.id === w.locationId)).length,
          },
          pointsBreakdown: (Object.keys(POINT_RULES) as RuleKey[])
            .map((rule) => ({ rule, label: POINT_RULES[rule].label, count: count(rule), points: seasonEvents.filter((e) => e.rule === rule).reduce((s, e) => s + e.points, 0) }))
            .filter((r) => r.count > 0),
        },
        /** XP a recipient gets per kudos (fixed server-side). */
        kudosPoints: KUDOS_POINTS,
        pointRulesQuickGuide: (Object.keys(POINT_RULES) as RuleKey[]).map((rule) => ({
          action: POINT_RULES[rule].label,
          points: `+${POINT_RULES[rule].points} XP`,
          category: POINT_RULES[rule].category,
        })),
      },
    };
  }

  async getLeaderboards(tenantId: string) {
    const [a, { gamification }] = await Promise.all([this.loadActivity(tenantId), this.tenantSettings.get(tenantId)]);
    const byUser = this.userEvents(a);
    const active = a.locations.filter((l) => l.active);
    const currentAwards = a.awards.filter((w) => !w.endedAt);
    const trophyTitle = new Map(TROPHIES.map((t) => [t.key as string, t.title]));

    const locationRows = active.map((l) => {
      const scores = a.executions.filter((e) => e.locationId === l.id).map((e) => e.overallScore);
      const verified = a.actions.filter((x) => x.locationId === l.id && x.verifiedAt >= a.seasonFrom);
      const last = scores[scores.length - 1];
      const prev = scores[scores.length - 2];
      const held = currentAwards.filter((w) => w.locationId === l.id).map((w) => trophyTitle.get(w.trophyKey) ?? w.trophyKey);
      return {
        id: l.id,
        name: l.name,
        areaCode: l.areaCode,
        department: l.department,
        areaOwner: l.ownerName,
        points: this.locationPoints(a, l.id),
        overallScore: last !== undefined ? Math.round(last * 10) / 10 : null,
        passingAuditStreak: this.passingStreak(scores, a.settings.passScore),
        trophyBadge: held.length ? held.join(', ') : null,
        capaClosureRate: pct(verified.filter((x) => x.verifiedAt <= x.targetDate).length, verified.length),
        trend: prev === undefined ? null : last - prev >= 1 ? 'UP' : last - prev <= -1 ? 'DOWN' : 'STABLE',
        overdueActions: a.openActions.filter((x) => x.locationId === l.id && x.targetDate < a.now).length,
      };
    });

    const workstationsLeaderboard = [...locationRows]
      .sort((x, y) => y.points - x.points || (y.overallScore ?? -1) - (x.overallScore ?? -1))
      .slice(0, 10)
      .map((r, i) => ({ rank: i + 1, ...r }));

    const departments = new Map<string, typeof locationRows>();
    locationRows.forEach((r) => departments.set(r.department, [...(departments.get(r.department) ?? []), r]));
    const departmentLeaderboard = [...departments.entries()]
      .map(([department, rows]) => {
        const ids = new Set(rows.map((r) => r.id));
        const inst = a.instances.filter((i) => ids.has(i.locationId));
        return {
          department,
          avgScore: avg(rows.filter((r) => r.overallScore !== null).map((r) => r.overallScore as number)),
          totalPoints: rows.reduce((s, r) => s + r.points, 0),
          activeTrophies: currentAwards.filter((w) => ids.has(w.locationId)).length,
          complianceRate: pct(inst.filter((i) => i.status === 'SUBMITTED').length, inst.length),
        };
      })
      .sort((x, y) => (y.avgScore ?? -1) - (x.avgScore ?? -1) || y.totalPoints - x.totalPoints)
      .map((d, i) => ({ rank: i + 1, ...d }));

    const individualChampions = !gamification.showIndividualLeaderboard ? [] : a.users
      .map((u) => {
        const events = byUser.get(u.id) ?? [];
        const points = this.seasonPoints(events, a.seasonFrom);
        return {
          userId: u.id,
          name: u.name,
          role: u.role,
          department: u.department,
          points,
          badgesCount: this.badgesFor(a, u.id, events).filter((b) => b.unlocked).length,
          tier: this.levelFor(points).title,
        };
      })
      .filter((u) => u.points > 0)
      .sort((x, y) => y.points - x.points)
      .slice(0, 10)
      .map((u, i) => ({ rank: i + 1, ...u }));

    // Most improved: average of the last 90 days against the 90 days before
    const recentFrom = new Date(a.now.getTime() - 90 * DAY_MS);
    const priorFrom = new Date(a.now.getTime() - 180 * DAY_MS);
    const improvements = active
      .map((l) => {
        const ex = a.executions.filter((e) => e.locationId === l.id);
        const currentScore = avg(ex.filter((e) => e.completedAt >= recentFrom).map((e) => e.overallScore));
        const previousScore = avg(ex.filter((e) => e.completedAt >= priorFrom && e.completedAt < recentFrom).map((e) => e.overallScore));
        return currentScore !== null && previousScore !== null
          ? { locationId: l.id, areaName: l.name, department: l.department, previousScore, currentScore, delta: Math.round((currentScore - previousScore) * 10) / 10 }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.delta > 0)
      .sort((x, y) => y.delta - x.delta);

    const topBy = (rule: RuleKey) => {
      const best = a.users
        .map((u) => ({ userId: u.id, name: u.name, department: u.department, count: (byUser.get(u.id) ?? []).filter((e) => e.rule === rule && e.at >= a.seasonFrom).length }))
        .filter((u) => u.count > 0)
        .sort((x, y) => y.count - x.count)[0];
      return best ?? null;
    };

    return {
      success: true,
      data: {
        season: { from: a.seasonFrom.toISOString(), to: a.now.toISOString() },
        workstationsLeaderboard,
        departmentLeaderboard,
        individualChampions,
        /** The organization hides the ranking of individual people (area and department rankings stay visible). */
        individualLeaderboardHidden: !gamification.showIndividualLeaderboard,
        mostImproved: improvements[0] ?? null,
        bestAuditor: topBy('AUDIT_CONDUCTED'),
        topRedTagContributor: topBy('RED_TAG_RAISED'),
        zeroOverdueAreas: locationRows
          .filter((r) => r.overallScore !== null && r.overdueActions === 0)
          .map((r) => ({ id: r.id, name: r.name, areaCode: r.areaCode, department: r.department })),
      },
    };
  }

  async getBadges(tenantId: string, userId: string) {
    await this.assertUser(tenantId, userId);
    const a = await this.loadActivity(tenantId);
    const badges = this.badgesFor(a, userId, this.userEvents(a).get(userId) ?? []);
    return {
      success: true,
      data: { badges, unlockedCount: badges.filter((b) => b.unlocked).length, totalBadges: badges.length },
    };
  }

  // ---------------------------------------------------------------------------
  // Trophies
  // ---------------------------------------------------------------------------

  /** Best-qualifying area for a trophy right now, or null when nobody meets the criteria. */
  private contenderFor(t: TrophyDefinition, a: TenantActivity) {
    const from = new Date(a.now.getTime() - t.windowDays * DAY_MS);
    const candidates = a.locations
      .filter((l) => l.active)
      .map((l) => {
        const all = a.executions.filter((e) => e.locationId === l.id);
        const inWindow = all.filter((e) => e.completedAt >= from);
        let metric: number | null = null;
        if (t.key === 'GOLDEN_BROOM') {
          const last4 = all.slice(-4).map((e) => e.pillarScores.S3_SHINE).filter((s): s is number => s !== undefined);
          const shine = last4.length === 4 ? avg(last4) : null;
          const overdue = a.openActions.some((x) => x.locationId === l.id && x.targetDate < a.now);
          metric = shine !== null && shine >= 95 && !overdue ? shine : null;
        } else if (t.key === 'PLANT_EXCELLENCE') {
          const score = inWindow.length >= 2 ? avg(inWindow.map((e) => e.overallScore)) : null;
          metric = score !== null && score >= 95 ? score : null;
        } else if (t.key === 'KAIZEN_SHIELD') {
          const verified = a.actions.filter((x) => x.locationId === l.id && x.verifiedAt >= from);
          const repeats = a.observations.some((o) => o.locationId === l.id && o.isRepeat && o.createdAt >= from);
          const allOnTime = verified.every((x) => x.verifiedAt <= x.targetDate);
          metric = verified.length >= 3 && allOnTime && !repeats ? verified.length : null;
        } else {
          const safetyFindings = a.observations.some((o) => o.locationId === l.id && o.category === 'S6_SAFETY' && o.createdAt >= from);
          const safety = avg(inWindow.map((e) => e.pillarScores.S6_SAFETY).filter((s): s is number => s !== undefined));
          metric = inWindow.length >= 3 && !safetyFindings ? safety : null;
        }
        return metric === null ? null : { locationId: l.id, locationName: l.name, areaCode: l.areaCode, department: l.department, metric };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((x, y) => y.metric - x.metric);
    return candidates[0] ?? null;
  }

  /**
   * First day of the next month or quarter as a calendar date (YYYY-MM-DD). Built from the date parts directly:
   * toISOString() on a local midnight shifts the day back by one east of UTC.
   */
  private nextEvaluationDate(cadence: Cadence, now: Date): string {
    const months = cadence === 'QUARTERLY' ? Math.floor(now.getMonth() / 3) * 3 + 3 : now.getMonth() + 1;
    const year = now.getFullYear() + Math.floor(months / 12);
    const month = (months % 12) + 1;
    return `${year}-${String(month).padStart(2, '0')}-01`;
  }

  async getTrophies(tenantId: string) {
    const a = await this.loadActivity(tenantId);
    const locById = new Map(a.locations.map((l) => [l.id, l]));
    const [kudosFeed] = await Promise.all([
      this.prisma.kudos.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          category: true,
          message: true,
          points: true,
          createdAt: true,
          fromUser: { select: { id: true, firstName: true, lastName: true } },
          toUser: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    const floatingTrophies = TROPHIES.map((t) => {
      const current = a.awards.find((w) => w.trophyKey === t.key && !w.endedAt);
      const loc = current ? locById.get(current.locationId) : undefined;
      return {
        id: t.key,
        title: t.title,
        subtitle: t.subtitle,
        iconType: t.iconType,
        tier: t.tier,
        evaluationPeriod: t.evaluationPeriod,
        criteria: t.criteria,
        currentHolder:
          current && loc
            ? {
                locationId: loc.id,
                locationName: loc.name,
                areaCode: loc.areaCode,
                department: loc.department,
                teamLead: loc.ownerName,
                heldSince: current.awardedAt.toISOString(),
                retentionStreakDays: Math.floor((a.now.getTime() - current.awardedAt.getTime()) / DAY_MS),
                averageScore: current.scoreAtAward,
              }
            : null,
        suggestedContender: this.contenderFor(t, a),
        nextEvaluationDate: this.nextEvaluationDate(t.evaluationPeriod, a.now),
        totalPastHolders: a.awards.filter((w) => w.trophyKey === t.key && w.endedAt).length,
      };
    });

    const hallOfFame = a.awards
      .filter((w) => w.endedAt)
      .map((w) => {
        const loc = locById.get(w.locationId);
        const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return {
          id: w.id,
          trophyId: w.trophyKey,
          trophyTitle: TROPHIES.find((t) => t.key === w.trophyKey)?.title ?? w.trophyKey,
          period: `${fmt(w.awardedAt)} – ${fmt(w.endedAt as Date)}`,
          // Timestamps (not UTC day strings) so the client shows the award day in the viewer's time zone
          periodStart: w.awardedAt.toISOString(),
          periodEnd: (w.endedAt as Date).toISOString(),
          awardedDate: w.awardedAt.toISOString(),
          winningLocation: loc?.name ?? '',
          department: loc?.department ?? '',
          teamLead: loc?.ownerName ?? null,
          auditScore: w.scoreAtAward,
          citation: w.citation,
        };
      });

    return {
      success: true,
      data: {
        floatingTrophies,
        hallOfFame,
        kudosFeed: kudosFeed.map((k) => ({
          id: k.id,
          fromUserId: k.fromUser.id,
          fromUser: fullName(k.fromUser),
          toUserId: k.toUser.id,
          toUser: fullName(k.toUser),
          category: k.category,
          message: k.message,
          points: k.points,
          createdAt: k.createdAt.toISOString(),
        })),
      },
    };
  }

  async awardTrophy(tenantId: string, awardedById: string, payload: { trophyId: string; newLocationId: string; citation: string }) {
    await this.assertRecognitionEnabled(tenantId);
    const trophy = TROPHIES.find((t) => t.key === payload.trophyId);
    if (!trophy) throw new NotFoundException(`Trophy '${payload.trophyId}' not found`);
    const location = await this.prisma.location.findFirst({
      where: { id: payload.newLocationId, tenantId },
      select: { id: true, name: true, status: true },
    });
    if (!location) throw new NotFoundException(`Location '${payload.newLocationId}' not found`);
    if (location.status !== 'ACTIVE') throw new BadRequestException('Trophies can only be awarded to active areas');

    const windowFrom = new Date(Date.now() - trophy.windowDays * DAY_MS);
    const executions = await this.metrics.scoredExecutions(tenantId, [location.id], windowFrom);
    const scoreAtAward = avg(executions.map((e) => e.overallScore));

    try {
      const award = await this.prisma.$transaction(
        async (tx) => {
          const current = await tx.trophyAward.findFirst({ where: { tenantId, trophyKey: trophy.key, endedAt: null } });
          if (current?.locationId === location.id) {
            throw new ConflictException(`${location.name} already holds ${trophy.title}`);
          }
          if (current) {
            // Hand-over: the previous holder moves to the Hall of Fame
            await tx.trophyAward.update({ where: { id: current.id }, data: { endedAt: new Date() } });
          }
          return tx.trophyAward.create({
            data: { tenantId, trophyKey: trophy.key, locationId: location.id, awardedById, citation: payload.citation, scoreAtAward },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      const owners = await this.prisma.location.findFirst({ where: { id: location.id, tenantId }, select: { ownerId: true, backupOwnerId: true } });
      await this.notifications.notify({
        tenantId,
        userIds: [owners?.ownerId, owners?.backupOwnerId],
        excludeUserId: awardedById,
        type: 'TROPHY_AWARDED',
        title: `${location.name} won ${trophy.title}`,
        body: payload.citation,
        entityType: 'TrophyAward',
        entityId: award.id,
        link: '/recognition',
      });
      return {
        success: true,
        message: `Trophy '${trophy.title}' awarded to ${location.name}`,
        data: { id: award.id, trophyId: trophy.key, locationId: location.id, awardedAt: award.awardedAt.toISOString(), scoreAtAward },
      };
    } catch (err) {
      // Two awards of the same trophy at once: the serializable transaction rejects one
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        throw new ConflictException('This trophy was just awarded by someone else; refresh and try again');
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Kudos
  // ---------------------------------------------------------------------------

  async giveKudos(tenantId: string, fromUserId: string, payload: { toUserId: string; category: string; message: string }) {
    await this.assertRecognitionEnabled(tenantId);
    if (payload.toUserId === fromUserId) throw new BadRequestException('You cannot send kudos to yourself');
    const recipient = await this.prisma.user.findFirst({
      where: { id: payload.toUserId, tenantId, status: 'ACTIVE' },
      select: { firstName: true, lastName: true },
    });
    if (!recipient) throw new NotFoundException(`User '${payload.toUserId}' not found`);

    const sentToday = await this.prisma.kudos.count({
      where: { tenantId, fromUserId, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
    if (sentToday >= KUDOS_DAILY_LIMIT) {
      throw new HttpException(`You can send up to ${KUDOS_DAILY_LIMIT} kudos per day`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const kudos = await this.prisma.kudos.create({
      data: { tenantId, fromUserId, toUserId: payload.toUserId, category: payload.category, message: payload.message.trim(), points: KUDOS_POINTS },
    });
    const name = fullName(recipient);
    await this.notifications.notify({
      tenantId,
      userIds: [payload.toUserId],
      type: 'KUDOS_RECEIVED',
      title: `You received kudos (+${KUDOS_POINTS} XP)`,
      body: payload.message.trim(),
      entityType: 'Kudos',
      entityId: kudos.id,
      link: '/recognition',
    });
    return {
      success: true,
      message: `Kudos and +${KUDOS_POINTS} XP sent to ${name}`,
      data: { id: kudos.id, toUserId: payload.toUserId, toUser: name, category: kudos.category, points: kudos.points, createdAt: kudos.createdAt.toISOString() },
    };
  }
}

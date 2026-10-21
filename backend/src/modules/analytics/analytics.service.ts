import { Injectable } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { LocationScope } from './data-scope.service';

/** Dashboard views (maturity overview, heat map, leaderboard) built on MetricsService. */
@Injectable()
export class AnalyticsService {
  constructor(private readonly metrics: MetricsService) {}

  async getMaturityOverview(tenantId: string, timeframe: string = '90D', from?: string, to?: string, orgNodeId?: string, scope: LocationScope = null) {
    const period = this.metrics.resolvePeriod(timeframe, from, to);
    const [kpis, trend] = await Promise.all([this.metrics.kpis(tenantId, period, orgNodeId, scope), this.metrics.trend(tenantId, period, orgNodeId, scope)]);

    const statusFor = (score: number | null, target: number) =>
      score === null ? 'NO_DATA' : score >= target ? 'TARGET_MET' : score >= target - 5 ? 'ON_TRACK' : score >= target - 15 ? 'ATTENTION_NEEDED' : 'PRIORITY_FOCUS';
    const PILLAR_META = [
      { key: 'S1_SORT', pillar: '1S', name: 'Sort', color: '#EF4444' },
      { key: 'S2_SET_IN_ORDER', pillar: '2S', name: 'Set in Order', color: '#8B5CF6' },
      { key: 'S3_SHINE', pillar: '3S', name: 'Shine', color: '#10B981' },
      { key: 'S4_STANDARDIZE', pillar: '4S', name: 'Standardize', color: '#3B82F6' },
      { key: 'S5_SUSTAIN', pillar: '5S', name: 'Sustain', color: '#EC4899' },
      { key: 'S6_SAFETY', pillar: '6S', name: 'Safety', color: '#F59E0B' },
    ] as const;

    return {
      success: true,
      data: {
        timeframe,
        period: kpis.period,
        overallScore: kpis.fiveSScore,
        targetScore: kpis.targetScore,
        scoreDelta:
          kpis.scoreChange === null
            ? 'No earlier audits to compare'
            : `${kpis.scoreChange >= 0 ? '+' : ''}${kpis.scoreChange} pts vs previous period`,
        level: kpis.maturity
          ? { number: kpis.maturity.level, name: kpis.maturity.name, description: kpis.maturity.description, badgeColor: kpis.maturity.color }
          : null,
        kpis: {
          totalLocations: kpis.locations.total,
          auditedLocations: kpis.locations.audited,
          totalAuditsCompleted: kpis.audits.completed,
          auditComplianceRate: kpis.audits.adherencePercent,
          scheduledAuditsDue: kpis.audits.scheduledDue,
          scheduledAuditsCompleted: kpis.audits.scheduledCompleted,
          openAbnormalities: kpis.observations.openCritical,
          safetyIndex: kpis.pillarScores.S6_SAFETY,
        },
        pillarBreakdown: PILLAR_META.map((p) => ({
          pillar: p.pillar,
          name: p.name,
          score: kpis.pillarScores[p.key],
          target: kpis.targetScore,
          status: statusFor(kpis.pillarScores[p.key], kpis.targetScore),
          color: p.color,
        })),
        monthlyTrends: trend.map((m) => ({
          month: m.month,
          audits: m.audits,
          overall: m.overall,
          sort: m.S1_SORT,
          order: m.S2_SET_IN_ORDER,
          shine: m.S3_SHINE,
          standardize: m.S4_STANDARDIZE,
          sustain: m.S5_SUSTAIN,
          safety: m.S6_SAFETY,
        })),
      },
    };
  }

  async get5SHeatmap(tenantId: string, orgNodeId?: string, scope: LocationScope = null) {
    const rows = await this.metrics.locationHealth(tenantId, orgNodeId, scope);
    return {
      success: true,
      data: {
        pillars: [
          { key: 'S1_SORT', label: '1S - Sort', sub: 'Eliminate Unneeded' },
          { key: 'S2_SET_IN_ORDER', label: '2S - Set in Order', sub: 'Organize & Demarcate' },
          { key: 'S3_SHINE', label: '3S - Shine', sub: 'Clean & Inspect' },
          { key: 'S4_STANDARDIZE', label: '4S - Standardize', sub: 'Visual Standards' },
          { key: 'S5_SUSTAIN', label: '5S - Sustain', sub: 'Discipline & Habits' },
          { key: 'S6_SAFETY', label: '6S - Safety', sub: 'Hazard Prevention' },
        ],
        rows: rows.map(({ auditHistory, ...r }) => r),
      },
    };
  }

  async getLeaderboard(tenantId: string, orgNodeId?: string, scope: LocationScope = null) {
    const settings = await this.metrics.settings(tenantId);
    const rows = await this.metrics.locationHealth(tenantId, orgNodeId, scope);
    const scored = rows.filter((r) => r.overallScore !== null);

    /** Consecutive passing audits ending with the most recent one. */
    const passingStreak = (history: number[]) => {
      let n = 0;
      for (let i = history.length - 1; i >= 0 && history[i] >= settings.passScore; i--) n++;
      return n;
    };
    const weakestPillar = (pillars: Record<string, number | null>) => {
      const entries = Object.entries(pillars).filter((e): e is [string, number] => e[1] !== null);
      return entries.length ? entries.sort((a, b) => a[1] - b[1])[0][0] : null;
    };

    // Only passing areas can be champions: a low score is not a benchmark just because it ranks first
    const champions = scored
      .filter((r) => (r.overallScore as number) >= settings.passScore)
      .sort((a, b) => (b.overallScore as number) - (a.overallScore as number))
      .slice(0, 4);
    const attentionRequired = [...rows]
      .filter((r) => r.overallScore === null || (r.overallScore as number) < settings.targetScore || r.openCapaCount > 0)
      .sort((a, b) => (a.overallScore ?? -1) - (b.overallScore ?? -1) || b.openCapaCount - a.openCapaCount)
      .slice(0, 4);

    return {
      success: true,
      data: {
        passScore: settings.passScore,
        targetScore: settings.targetScore,
        champions: champions.map((c, rank) => ({
          rank: rank + 1,
          id: c.id,
          name: c.name,
          areaCode: c.areaCode,
          department: c.department,
          overallScore: c.overallScore,
          passingAuditStreak: passingStreak(c.auditHistory),
          badge: (c.overallScore as number) >= settings.targetScore ? 'Target met' : 'Passing',
        })),
        attentionRequired: attentionRequired.map((a, rank) => ({
          rank: rank + 1,
          id: a.id,
          name: a.name,
          areaCode: a.areaCode,
          department: a.department,
          overallScore: a.overallScore,
          openCapaCount: a.openCapaCount,
          weakestPillar: weakestPillar(a.pillars),
          riskLevel: a.riskLevel,
        })),
      },
    };
  }
}

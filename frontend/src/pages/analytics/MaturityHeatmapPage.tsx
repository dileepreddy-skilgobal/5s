import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '../../services/api';
import { LeaderboardDetail, MaturityOverviewDetail } from '../../services/adminApi';
import { insightsApi } from '../../services/api-insights';
import { AnalyticsScope, AreaMaturityData, ExecutiveSummary, HeatmapDetail, HeatmapRowDetail, InsightsQuery, PeriodQuery } from '../../types/insights';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { FormField } from '../../components/ui/FormField';
import { SummaryCard, SummaryTone } from '../../components/ui/SummaryCard';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Tabs, TabItem } from '../../components/ui/Tabs';
import { PillarKey } from '../../types';
import { pillarVariant, riskLabel } from '../../constants/labels';
import { KpiPanel } from './components/KpiPanel';
import { DrilldownPanel } from './components/DrilldownPanel';
import { BenchmarkPanel } from './components/BenchmarkPanel';
import { CertificationPanel } from './components/CertificationPanel';
import { ExecutiveSummaryStrip } from './components/ExecutiveSummaryStrip';
import { PillarTrendPanel } from './components/PillarTrendPanel';
import { AreaMaturityPanel } from './components/AreaMaturityPanel';
import {
  PanelStatus,
  NoDataHint,
  EmptyState,
  ScorePill,
  SCORE_BANDS,
  isNum,
  fmtPct,
  fmtDate,
  pillarLabel,
  scoreBg,
  scoreBorder,
  scoreColor,
  scoreTone,
} from './components/analyticsShared';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Layers,
  Award,
  AlertTriangle,
  RefreshCw,
  Printer,
  Target,
  Building,
  CheckCircle2,
} from 'lucide-react';

type AnalyticsTab = 'overview' | 'kpis' | 'drilldown' | 'benchmark' | 'certification';

const CUSTOM_PERIOD = 'CUSTOM';

/** YYYY-MM-DD of a local date (the value format of <input type="date">). */
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Periods the API resolves (MetricsService.resolvePeriod); month periods are calendar months. */
const PERIODS: Array<{ value: string; label: string }> = [
  { value: '30D', label: 'Last 30 days' },
  { value: '3M', label: 'Last 3 months' },
  { value: '6M', label: 'Last 6 months' },
  { value: '12M', label: 'Last 12 months' },
  { value: 'YTD', label: 'Year to date' },
  { value: CUSTOM_PERIOD, label: 'Custom range' },
];

const ALL_UNITS = 'ALL';

const RISK_TONE: Record<string, string> = { HIGH: 'var(--color-danger)', MEDIUM: 'var(--color-warning)', LOW: 'var(--color-info)' };

export const MaturityHeatmapPage: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useApp();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState('3M');
  /** Custom range being edited, and the one applied to the figures (applied with the Apply button). */
  const [customDraft, setCustomDraft] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [customApplied, setCustomApplied] = useState<{ from: string; to: string } | null>(null);
  /** Plant or department (org node) every figure is limited to. */
  const [selectedUnit, setSelectedUnit] = useState(ALL_UNITS);
  const [maturityData, setMaturityData] = useState<MaturityOverviewDetail | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapDetail | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardDetail | null>(null);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [areaMaturity, setAreaMaturity] = useState<AreaMaturityData | null>(null);
  const [scope, setScope] = useState<AnalyticsScope | null>(null);

  // Tabs: each management view is mounted (and fetches its data) only once it is first opened
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const [visitedTabs, setVisitedTabs] = useState<Set<AnalyticsTab>>(() => new Set<AnalyticsTab>(['overview']));
  const [refreshKey, setRefreshKey] = useState(0);

  const openTab = (tabId: string) => {
    const id = tabId as AnalyticsTab;
    setActiveTab(id);
    setVisitedTabs((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  };

  /** The period sent to every endpoint: a preset, or the applied custom range. */
  const period: PeriodQuery = useMemo(
    () => (timeframe === CUSTOM_PERIOD && customApplied ? { from: customApplied.from, to: customApplied.to } : { timeframe: timeframe === CUSTOM_PERIOD ? '3M' : timeframe }),
    [timeframe, customApplied],
  );
  const orgNodeId = selectedUnit === ALL_UNITS ? undefined : selectedUnit;
  const query: InsightsQuery = useMemo(() => ({ ...period, orgNodeId }), [period, orgNodeId]);
  const customError =
    timeframe === CUSTOM_PERIOD && (!customDraft.from || !customDraft.to)
      ? 'Choose both dates.'
      : timeframe === CUSTOM_PERIOD && customDraft.from > customDraft.to
        ? '"From" must be on or before "To".'
        : null;

  const changeTimeframe = (value: string) => {
    if (value === CUSTOM_PERIOD && !customApplied) {
      // Start the custom range from the last three months so the figures do not jump
      const to = new Date();
      const from = new Date(to.getFullYear(), to.getMonth() - 2, 1);
      const range = { from: isoDay(from), to: isoDay(to) };
      setCustomDraft(range);
      setCustomApplied(range);
    }
    setTimeframe(value);
  };

  const applyCustom = () => {
    if (customError) return;
    setCustomApplied({ ...customDraft });
  };

  useEffect(() => {
    // Plant / department heads see their own part of the organization; say so on screen
    insightsApi
      .getScope()
      .then(setScope)
      .catch(() => setScope(null));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [mat, heat, lead, sum, maturity] = await Promise.all([
        insightsApi.getMaturityOverview(query),
        // The heat map is always loaded whole (within the caller's scope): it also supplies the plant / department options
        insightsApi.getHeatmap(),
        insightsApi.getLeaderboard(query.orgNodeId),
        insightsApi.getExecutiveSummary(query),
        insightsApi.getAreaMaturity(query),
      ]);
      setMaturityData(mat);
      setHeatmapData(heat);
      setLeaderboard(lead);
      setSummary(sum);
      setAreaMaturity(maturity);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Could not load 5S maturity analytics.');
      setLoadError(message);
      addToast({ type: 'error', title: 'Analytics not loaded', message });
    } finally {
      setLoading(false);
    }
  }, [query, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Plant and department options come from the real heat map rows; a department name used in two plants gets the plant added
  const units = useMemo(() => {
    const plants = new Map<string, { id: string; label: string }>();
    const departments = new Map<string, { id: string; name: string; plant: string }>();
    (heatmapData?.rows || []).forEach((r) => {
      if (r.plantId && !plants.has(r.plantId)) plants.set(r.plantId, { id: r.plantId, label: r.plant || 'Unnamed plant' });
      if (r.orgNodeId && r.orgNodeId !== r.plantId && !departments.has(r.orgNodeId)) {
        departments.set(r.orgNodeId, { id: r.orgNodeId, name: r.department || 'Unnamed department', plant: r.plant });
      }
    });
    const nameCount = new Map<string, number>();
    departments.forEach((u) => nameCount.set(u.name, (nameCount.get(u.name) ?? 0) + 1));
    return {
      plants: Array.from(plants.values()).sort((a, b) => a.label.localeCompare(b.label)),
      departments: Array.from(departments.values())
        .map((u) => ({ id: u.id, label: (nameCount.get(u.name) ?? 0) > 1 && u.plant ? `${u.name} (${u.plant})` : u.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [heatmapData]);

  const filteredRows = (heatmapData?.rows || []).filter((row) => selectedUnit === ALL_UNITS || row.orgNodeId === selectedUnit || row.plantId === selectedUnit);

  // Heat map grouped plant → department → area (BRD §51)
  const heatmapGroups = useMemo(() => {
    const groups: Array<{ plant: string; departments: Array<{ department: string; rows: HeatmapRowDetail[] }> }> = [];
    [...filteredRows]
      .sort((a, b) => (a.plant || '~').localeCompare(b.plant || '~') || (a.department || '').localeCompare(b.department || '') || a.areaCode.localeCompare(b.areaCode))
      .forEach((row) => {
        const plant = row.plant || 'No plant';
        let g = groups.find((x) => x.plant === plant);
        if (!g) {
          g = { plant, departments: [] };
          groups.push(g);
        }
        const department = row.department || 'No department';
        let d = g.departments.find((x) => x.department === department);
        if (!d) {
          d = { department, rows: [] };
          g.departments.push(d);
        }
        d.rows.push(row);
      });
    return groups;
  }, [filteredRows]);
  const heatmapPillars = heatmapData?.pillars || [];

  // Radar chart geometry
  const radarPillars = maturityData?.pillarBreakdown || [];
  const numPillars = radarPillars.length;
  const radius = 100;
  const centerX = 140;
  const centerY = 140;
  const targetScore = maturityData?.targetScore;
  const overallScore = maturityData?.overallScore ?? null;
  const level = maturityData?.level ?? null;
  const allPillarsScored = numPillars > 0 && radarPillars.every((p) => isNum(p.score));
  const anyPillarScored = radarPillars.some((p) => isNum(p.score));

  const getCoordinates = (index: number, score: number, max: number = 100) => {
    const angle = ((Math.PI * 2) / numPillars) * index - Math.PI / 2;
    const r = (score / max) * radius;
    return { x: centerX + r * Math.cos(angle), y: centerY + r * Math.sin(angle) };
  };

  // Only draw the actual polygon when every pillar has data; otherwise just the scored points
  const actualPoints = allPillarsScored
    ? radarPillars
        .map((p, i) => {
          const { x, y } = getCoordinates(i, p.score as number);
          return `${x},${y}`;
        })
        .join(' ')
    : '';

  const targetPoints = radarPillars
    .map((p, i) => {
      const { x, y } = getCoordinates(i, p.target);
      return `${x},${y}`;
    })
    .join(' ');

  const radarSummary = `Pillar scores against the ${fmtPct(targetScore)} target: ${radarPillars
    .map((p) => `${p.pillar} ${p.name} ${isNum(p.score) ? `${p.score}%` : 'no data'}`)
    .join(', ')}.`;

  // Score delta text from the API: "+1.2 pts vs previous period" / "-0.4 pts ..." / "No earlier audits to compare"
  const scoreDelta = maturityData?.scoreDelta || '';
  const deltaDirection = scoreDelta.startsWith('+') ? 'up' : scoreDelta.startsWith('-') ? 'down' : 'none';

  const tabs: TabItem[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={15} /> },
    { id: 'kpis', label: 'Management KPIs', icon: <Target size={15} /> },
    { id: 'drilldown', label: 'Hierarchy drill-down', icon: <Layers size={15} /> },
    { id: 'benchmark', label: 'Benchmark', icon: <Building size={15} /> },
    { id: 'certification', label: 'Certification', icon: <Award size={15} /> },
  ];

  // Area page, opened on its audit tab (drill-down from a heat-map cell or a ranking)
  const openArea = (id: string) => navigate(`/locations/${id}?tab=audit`);
  const kpis = maturityData?.kpis;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="5S Maturity & Heat Map"
        description="Scores, trends and the latest audit result of every area."
        actions={
          <div className="no-print" style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Certification is evaluated over its own window (Settings → Analytics), not this period */}
            {activeTab !== 'certification' && (
              <FormField label="Period" style={{ marginBottom: 0, width: '160px', maxWidth: '100%' }}>
                {(control) => (
                  <select
                    {...control}
                    className="form-select"
                    value={timeframe}
                    onChange={(e) => changeTimeframe(e.target.value)}
                    title="Applies to scores, KPIs, trends, drill-down audits and benchmarks. The heat map always shows each area's latest audit."
                  >
                    {PERIODS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            )}

            {activeTab !== 'certification' && timeframe === CUSTOM_PERIOD && (
              <>
                <FormField label="From" style={{ marginBottom: 0, width: '150px', maxWidth: '100%' }}>
                  {(control) => (
                    <input
                      {...control}
                      type="date"
                      className="form-input"
                      value={customDraft.from}
                      max={customDraft.to || undefined}
                      onChange={(e) => setCustomDraft((d) => ({ ...d, from: e.target.value }))}
                    />
                  )}
                </FormField>
                <FormField label="To" style={{ marginBottom: 0, width: '150px', maxWidth: '100%' }} error={customError ?? undefined}>
                  {(control) => (
                    <input
                      {...control}
                      type="date"
                      className="form-input"
                      value={customDraft.to}
                      min={customDraft.from || undefined}
                      onChange={(e) => setCustomDraft((d) => ({ ...d, to: e.target.value }))}
                    />
                  )}
                </FormField>
                <Button
                  variant="secondary"
                  onClick={applyCustom}
                  disabled={!!customError || (customApplied?.from === customDraft.from && customApplied?.to === customDraft.to)}
                >
                  Apply
                </Button>
              </>
            )}

            {activeTab !== 'drilldown' && (
              <FormField label="Plant or department" style={{ marginBottom: 0, width: '240px', maxWidth: '100%' }}>
                {(control) => (
                  <select
                    {...control}
                    className="form-select"
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    title="Limits the figures, rankings and leaderboards to one plant or department."
                  >
                    <option value={ALL_UNITS}>{scope?.restricted ? 'All my areas' : 'Whole organization'}</option>
                    {units.plants.length > 0 && (
                      <optgroup label="Plants">
                        {units.plants.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {units.departments.length > 0 && (
                      <optgroup label="Departments">
                        {units.departments.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                )}
              </FormField>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                icon={<RefreshCw size={16} />}
                onClick={() => {
                  loadData();
                  setRefreshKey((k) => k + 1);
                }}
              >
                Refresh
              </Button>

              <Button variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>
                Print
              </Button>
            </div>
          </div>
        }
      />

      {scope?.restricted && (
        <div className="quick-tip-card" role="note">
          <span>
            {scope.nodes.length
              ? `Showing your part of the organization: ${scope.nodes.map((n) => n.name).join(', ')}.`
              : 'Your role is not linked to a plant or department yet, so there is no data to show. Ask your administrator to set the scope of your role.'}
          </span>
        </div>
      )}

      <div className="no-print">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={openTab} ariaLabel="Analytics views" />
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW (maturity index, pillar radar, heatmap, trend, leaderboard) */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (loading || !maturityData) && (
        <Card>
          <PanelStatus
            loading={loading}
            error={loadError || (!maturityData ? 'No maturity data returned.' : null)}
            onRetry={loadData}
            loadingText="Loading maturity scores and heat map…"
          />
        </Card>
      )}

      {activeTab === 'overview' && !loading && maturityData && kpis && (
        <>
          {summary && <ExecutiveSummaryStrip summary={summary} />}

          <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '16px' }}>
            {/* Maturity score */}
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>5S score</h2>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span
                        className="tabular-nums"
                        style={{ fontSize: '40px', fontWeight: 700, lineHeight: 1.1, color: isNum(overallScore) ? 'var(--text-primary)' : 'var(--text-tertiary)', letterSpacing: '-0.02em' }}
                      >
                        {fmtPct(overallScore)}
                      </span>
                      {scoreDelta && (
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: deltaDirection === 'none' ? 500 : 600,
                            color: deltaDirection === 'up' ? 'var(--color-success)' : deltaDirection === 'down' ? 'var(--color-danger)' : 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {deltaDirection === 'up' && <TrendingUp size={16} aria-hidden="true" />}
                          {deltaDirection === 'down' && <TrendingDown size={16} aria-hidden="true" />}
                          {scoreDelta}
                        </span>
                      )}
                    </div>
                    {!isNum(overallScore) && <NoDataHint text="No completed audits in this period" />}
                  </div>

                  {level ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-surface-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '8px 12px',
                        maxWidth: '100%',
                      }}
                    >
                      {/* The level colour is configured per organization (Settings → Analytics) */}
                      <span aria-hidden="true" style={{ width: '10px', height: '10px', borderRadius: '50%', background: level.badgeColor, flexShrink: 0 }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-secondary)' }}>Maturity level {level.number}</span>
                        <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{level.name}</span>
                      </span>
                    </div>
                  ) : (
                    <Badge variant="neutral">No maturity level</Badge>
                  )}
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px', color: 'var(--text-secondary)', gap: '8px', flexWrap: 'wrap' }}>
                    <span>
                      Target: <strong style={{ color: 'var(--text-primary)' }}>{fmtPct(targetScore)}</strong>
                    </span>
                    <span style={{ fontWeight: 600, color: isNum(overallScore) && isNum(targetScore) && overallScore >= targetScore ? 'var(--color-success)' : 'var(--text-secondary)' }}>
                      {isNum(overallScore) && isNum(targetScore)
                        ? overallScore >= targetScore
                          ? 'Target met'
                          : `${Math.round((targetScore - overallScore) * 10) / 10} pts to target`
                        : '—'}
                    </span>
                  </div>
                  {isNum(overallScore) && <ProgressBar value={overallScore} height={8} color="primary" ariaLabel="5S score against 100%" />}
                </div>

                <div className="quick-tip-card">
                  <span>
                    {level ? level.description : 'No maturity level yet: there are no completed audits in this period.'}
                    {maturityData.period?.label && <span style={{ color: 'var(--text-tertiary)' }}> · {maturityData.period.label}</span>}
                  </span>
                </div>
              </div>
            </Card>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
              <SummaryCard
                label="Audit adherence"
                value={fmtPct(kpis.auditComplianceRate)}
                icon={<CheckCircle2 size={18} />}
                tone={isNum(kpis.auditComplianceRate) ? 'primary' : 'neutral'}
                hint={
                  <>
                    <span style={{ display: 'block' }}>
                      {isNum(kpis.auditComplianceRate)
                        ? `${kpis.scheduledAuditsCompleted} of ${kpis.scheduledAuditsDue} scheduled audits completed`
                        : 'No scheduled audits were due in this period'}
                    </span>
                    <span style={{ display: 'block' }}>
                      {kpis.totalAuditsCompleted} audit{kpis.totalAuditsCompleted === 1 ? '' : 's'} completed in {kpis.auditedLocations} of {kpis.totalLocations} area
                      {kpis.totalLocations === 1 ? '' : 's'}
                    </span>
                  </>
                }
              />
              <SummaryCard
                label="Safety score"
                value={fmtPct(kpis.safetyIndex)}
                icon={<ShieldCheck size={18} />}
                tone={summaryToneFor(kpis.safetyIndex)}
                hint={
                  <>
                    {!isNum(kpis.safetyIndex) && <span style={{ display: 'block' }}>No data in period</span>}
                    <span style={{ display: 'block' }}>
                      {kpis.openAbnormalities} open critical observation{kpis.openAbnormalities === 1 ? '' : 's'}
                    </span>
                  </>
                }
              />
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: '24px' }}>
            <Card title="Pillar balance" subtitle={`Pillar scores against the ${fmtPct(targetScore)} target`}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {!anyPillarScored && <NoDataHint text="No pillar scores — no audits in this period" />}
                <svg width="280" height="280" viewBox="0 0 280 280" role="img" aria-label={radarSummary} style={{ maxWidth: '100%', height: 'auto' }}>
                  {[0.2, 0.4, 0.6, 0.8, 1.0].map((scale, sIdx) => {
                    const ringPoints = radarPillars
                      .map((_, i) => {
                        const { x, y } = getCoordinates(i, scale * 100);
                        return `${x},${y}`;
                      })
                      .join(' ');
                    return (
                      <polygon
                        key={sIdx}
                        points={ringPoints}
                        style={{ fill: sIdx === 4 ? 'var(--bg-surface-subtle)' : 'none', stroke: 'var(--border-subtle)' }}
                        strokeWidth={sIdx === 4 ? '1.5' : '1'}
                        strokeDasharray={sIdx === 4 ? undefined : '2,2'}
                      />
                    );
                  })}

                  {radarPillars.map((_, i) => {
                    const { x, y } = getCoordinates(i, 100);
                    return <line key={i} x1={centerX} y1={centerY} x2={x} y2={y} style={{ stroke: 'var(--border-subtle)' }} strokeWidth="1" />;
                  })}

                  <polygon points={targetPoints} style={{ fill: 'none', stroke: 'var(--color-info)' }} strokeWidth="1.5" strokeDasharray="4,4" />

                  {actualPoints && <polygon points={actualPoints} style={{ fill: 'var(--color-success)', fillOpacity: 0.22, stroke: 'var(--color-success)' }} strokeWidth="2.5" />}

                  {radarPillars.map((p, i) => {
                    const pt = isNum(p.score) ? getCoordinates(i, p.score) : null;
                    const labelPos = getCoordinates(i, 120);
                    return (
                      <g key={i}>
                        {pt && <circle cx={pt.x} cy={pt.y} r="4.5" style={{ fill: 'var(--color-success)', stroke: 'var(--bg-surface)' }} strokeWidth="1.5" />}
                        <text
                          x={labelPos.x}
                          y={labelPos.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="10"
                          fontWeight="700"
                          style={{ fill: pt ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                        >
                          {p.pillar} ({fmtPct(p.score)})
                        </text>
                      </g>
                    );
                  })}
                </svg>

                <div aria-hidden="true" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', fontSize: '12.5px', marginTop: '12px', color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '12px', height: '4px', background: 'var(--color-success)', display: 'inline-block', borderRadius: '2px' }} />
                    <span>Score</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '12px', height: '2px', borderTop: '2px dashed var(--color-info)', display: 'inline-block' }} />
                    <span>Target ({fmtPct(targetScore)})</span>
                  </div>
                </div>
              </div>
            </Card>

            <div style={{ minWidth: 0 }}>
              <Card title="Pillar breakdown" subtitle="Each pillar's score against the target">
                <div className="grid-auto" style={{ '--min': '240px', gap: '12px' } as React.CSSProperties}>
                  {radarPillars.map((p) => {
                    const hasScore = isNum(p.score);
                    const isTargetMet = hasScore && p.score >= p.target;
                    return (
                      <div
                        key={p.pillar}
                        style={{
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          padding: '12px 16px',
                          background: 'var(--bg-surface)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <Badge variant={pillarVariantFor(p.pillar)}>{p.pillar}</Badge>
                            <strong style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</strong>
                          </div>
                          {hasScore ? (
                            <Badge variant={isTargetMet ? 'success' : p.status === 'ON_TRACK' ? 'info' : p.status === 'PRIORITY_FOCUS' ? 'danger' : 'warning'}>
                              {isTargetMet ? 'Target met' : `${p.score}% / ${p.target}%`}
                            </Badge>
                          ) : (
                            <Badge variant="neutral">No data</Badge>
                          )}
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                            <span>
                              Score: <strong>{fmtPct(p.score)}</strong>
                            </span>
                            <span>Target: {p.target}%</span>
                          </div>
                          {hasScore ? <ProgressBar value={p.score as number} height={6} color={isTargetMet ? 'success' : 'primary'} ariaLabel={`${p.name} score`} /> : <NoDataHint />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>

          {/* Heat map: latest audit per area */}
          <Card
            title="Area heat map"
            subtitle="Latest audit of each area by pillar, grouped by plant and department, regardless of the selected period. Grey: never audited. Select a score to open the area's audits."
            actions={
              <div role="list" aria-label="Score bands" style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12.5px', flexWrap: 'wrap' }}>
                {SCORE_BANDS.map((b, i) => {
                  const upper = i === 0 ? null : SCORE_BANDS[i - 1].min - 1;
                  return (
                    <span key={b.tone} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                      <span aria-hidden="true" style={{ width: '12px', height: '12px', borderRadius: '3px', background: scoreBg(b.min), border: scoreBorder(b.min) }} />
                      {upper === null ? `≥ ${b.min}%` : b.min === 0 ? `< ${SCORE_BANDS[i - 1].min}%` : `${b.min}–${upper}%`} ({b.label.toLowerCase()})
                    </span>
                  );
                })}
              </div>
            }
            noPadding
          >
            <div style={{ overflowX: 'auto' }}>
              <table className="enterprise-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: '200px' }}>Area</th>
                    {heatmapPillars.map((p) => (
                      <th key={p.key} style={{ textAlign: 'center', width: '90px' }} title={p.sub}>
                        {pillarLabel(p.key)}
                      </th>
                    ))}
                    <th style={{ textAlign: 'center', width: '100px' }}>Overall</th>
                    <th style={{ minWidth: '130px' }}>Last audited</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={heatmapPillars.length + 3}>
                        <EmptyState text={selectedUnit === ALL_UNITS ? 'No areas found.' : 'No areas in this plant or department.'} />
                      </td>
                    </tr>
                  )}
                  {heatmapGroups.map((g) => (
                    <React.Fragment key={g.plant}>
                      <tr>
                        <th
                          scope="colgroup"
                          colSpan={heatmapPillars.length + 3}
                          style={{ background: 'var(--bg-surface-subtle)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700, textAlign: 'left' }}
                        >
                          {g.plant}
                        </th>
                      </tr>
                      {g.departments.map((d) => (
                        <React.Fragment key={`${g.plant}-${d.department}`}>
                          <tr>
                            <th
                              scope="colgroup"
                              colSpan={heatmapPillars.length + 3}
                              style={{ color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 600, textAlign: 'left', paddingLeft: '28px' }}
                            >
                              {d.department}
                              <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>
                                {' '}
                                · {d.rows.length} area{d.rows.length === 1 ? '' : 's'}
                              </span>
                            </th>
                          </tr>
                          {d.rows.map((row) => (
                            <tr key={row.id}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span className="code-tag">
                                    {row.areaCode}
                                  </span>
                                  {row.openCapaCount > 0 && <Badge variant="warning">{row.openCapaCount} open action{row.openCapaCount === 1 ? '' : 's'}</Badge>}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openArea(row.id)}
                                  style={{ background: 'none', border: 'none', padding: 0, marginTop: '2px', font: 'inherit', fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', cursor: 'pointer', textAlign: 'left' }}
                                >
                                  {row.name}
                                </button>
                                {row.building && <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{row.building}</div>}
                              </td>

                              {heatmapPillars.map((p) => {
                                const score = row.pillars[p.key as PillarKey] ?? null;
                                const description = isNum(score)
                                  ? `${pillarLabel(p.key)}: ${score}% at ${row.name}${row.lastAuditor ? ` (audited by ${row.lastAuditor})` : ''}`
                                  : `${pillarLabel(p.key)}: not scored at ${row.name}`;
                                return (
                                  <td key={p.key} style={{ textAlign: 'center', padding: '6px 4px' }}>
                                    {/* The area name is the keyboard route to the area; the cells are a mouse shortcut */}
                                    <button
                                      type="button"
                                      tabIndex={-1}
                                      onClick={() => openArea(row.id)}
                                      title={description}
                                      aria-label={description}
                                      style={{
                                        font: 'inherit',
                                        width: '100%',
                                        minWidth: '60px',
                                        background: scoreBg(score),
                                        border: scoreBorder(score),
                                        color: scoreColor(score),
                                        fontWeight: 600,
                                        fontSize: '13px',
                                        fontVariantNumeric: 'tabular-nums',
                                        padding: '8px 4px',
                                        borderRadius: 'var(--radius-sm)',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {fmtPct(score)}
                                    </button>
                                  </td>
                                );
                              })}

                              <td style={{ textAlign: 'center' }}>
                                <ScorePill score={row.overallScore} title={isNum(row.overallScore) ? undefined : 'Never audited'} />
                              </td>

                              <td>
                                {row.lastAuditDate ? (
                                  <>
                                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{fmtDate(row.lastAuditDate)}</div>
                                    {row.lastAuditor && <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>By {row.lastAuditor}</div>}
                                  </>
                                ) : (
                                  <NoDataHint text="Never audited" />
                                )}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {areaMaturity && <AreaMaturityPanel data={areaMaturity} />}

          <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '24px' }}>
            <div style={{ minWidth: 0 }}>
              <Card
                title="Score trend"
                subtitle={`Monthly average audit score${maturityData.period?.label ? ` — ${maturityData.period.label}` : ''}; gaps mark months with no completed audits`}
              >
                <div>
                  {(() => {
                    const trends = maturityData.monthlyTrends || [];
                    const n = trends.length;
                    const scored = trends.filter((t) => isNum(t.overall)).map((t) => t.overall as number);
                    if (n === 0 || scored.length === 0) {
                      return <EmptyState text="No completed audits in this period — no trend to plot." />;
                    }

                    // Y-axis: 50–100% by default, extended downward if any month (or the target) is lower
                    const lowest = Math.min(...scored, isNum(targetScore) ? targetScore : 100);
                    const yMin = Math.max(0, Math.min(50, Math.floor(lowest / 10) * 10));
                    const toY = (v: number) => 180 - ((v - yMin) / (100 - yMin)) * 150;
                    const gridStep = (100 - yMin) / 5;
                    const toX = (idx: number) => (n > 1 ? 70 + idx * (500 / (n - 1)) : 320);
                    const shortLabels = n > 6;

                    // Contiguous runs of months with audits → separate line segments (gaps = no audits)
                    const segments: Array<Array<{ x: number; y: number }>> = [];
                    let current: Array<{ x: number; y: number }> = [];
                    trends.forEach((t, idx) => {
                      if (isNum(t.overall)) {
                        current.push({ x: toX(idx), y: toY(t.overall) });
                      } else if (current.length) {
                        segments.push(current);
                        current = [];
                      }
                    });
                    if (current.length) segments.push(current);

                    const trendSummary = `Monthly 5S score: ${trends.map((t) => `${t.month} ${isNum(t.overall) ? `${t.overall}%` : 'no audits'}`).join(', ')}.${
                      isNum(targetScore) ? ` Target ${targetScore}%.` : ''
                    }`;

                    return (
                      <svg width="100%" height="200" viewBox="0 0 600 200" style={{ overflow: 'visible' }} role="img" aria-label={trendSummary}>
                        {[0, 1, 2, 3, 4, 5].map((i) => {
                          const val = Math.round(yMin + i * gridStep);
                          const y = toY(val);
                          return (
                            <g key={i}>
                              <line x1="40" y1={y} x2="580" y2={y} style={{ stroke: 'var(--border-subtle)' }} strokeWidth="1" />
                              <text x="30" y={y + 4} textAnchor="end" fontSize="10" style={{ fill: 'var(--text-tertiary)' }}>
                                {val}%
                              </text>
                            </g>
                          );
                        })}

                        {isNum(targetScore) && (
                          <line x1="40" y1={toY(targetScore)} x2="580" y2={toY(targetScore)} style={{ stroke: 'var(--color-info)' }} strokeDasharray="4,4" strokeWidth="1.5" />
                        )}

                        {segments.map((seg, sIdx) =>
                          seg.length > 1 ? (
                            <g key={sIdx}>
                              <polygon
                                points={`${seg[0].x},180 ${seg.map((p) => `${p.x},${p.y}`).join(' ')} ${seg[seg.length - 1].x},180`}
                                style={{ fill: 'var(--color-success)', fillOpacity: 0.12 }}
                              />
                              <polyline
                                points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
                                style={{ fill: 'none', stroke: 'var(--color-success)' }}
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </g>
                          ) : null,
                        )}

                        {trends.map((t, i) => {
                          const x = toX(i);
                          const [mon, year] = t.month.split(' ');
                          const label = shortLabels && year ? `${mon} '${year.slice(-2)}` : t.month;
                          return (
                            <g key={i}>
                              <title>{`${t.month}: ${isNum(t.overall) ? `${t.overall}%` : 'no audits'} (${t.audits} audit${t.audits === 1 ? '' : 's'})`}</title>
                              {isNum(t.overall) ? (
                                <>
                                  <circle cx={x} cy={toY(t.overall)} r="5" style={{ fill: 'var(--color-success)', stroke: 'var(--bg-surface)' }} strokeWidth="2" />
                                  <text x={x} y={toY(t.overall) - 10} textAnchor="middle" fontSize="11" fontWeight="600" style={{ fill: 'var(--text-primary)' }}>
                                    {t.overall}%
                                  </text>
                                </>
                              ) : (
                                <text x={x} y="172" textAnchor="middle" fontSize="9" style={{ fill: 'var(--text-tertiary)' }}>
                                  {shortLabels ? '—' : 'No audits'}
                                </text>
                              )}
                              <text x={x} y="195" textAnchor="middle" fontSize="10" style={{ fill: 'var(--text-tertiary)' }}>
                                {label}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>
              </Card>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
              <Card
                title="Top areas"
                subtitle={leaderboard ? `Best latest audit among areas at or above the ${leaderboard.passScore}% pass mark${orgNodeId ? ' in the selected unit' : ''}` : 'Best latest audit among passing areas'}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(leaderboard?.champions || []).length === 0 && <EmptyState text="No area has passed its latest audit yet." />}
                  {(leaderboard?.champions || []).map((champ) => (
                    <button
                      key={champ.id}
                      type="button"
                      onClick={() => openArea(champ.id)}
                      style={{
                        padding: '10px 12px',
                        minHeight: '56px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '10px',
                        width: '100%',
                        textAlign: 'left',
                        cursor: 'pointer',
                        font: 'inherit',
                        color: 'inherit',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span
                          aria-label={`Rank ${champ.rank}`}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-strong)',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {champ.rank}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{champ.name}</span>
                          <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                            {[champ.department, `${champ.passingAuditStreak} passing audit${champ.passingAuditStreak === 1 ? '' : 's'} in a row`].filter(Boolean).join(' • ')}
                          </span>
                        </span>
                      </span>

                      <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                        <ScorePill score={champ.overallScore} />
                        {champ.badge && <Badge variant={champ.badge === 'Target met' ? 'success' : 'info'}>{champ.badge}</Badge>}
                      </span>
                    </button>
                  ))}
                </div>
              </Card>

              <Card title="Needs attention" subtitle="Below target, never audited, or with open corrective actions">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(leaderboard?.attentionRequired || []).length === 0 && <EmptyState text="No area needs attention." />}
                  {(leaderboard?.attentionRequired || []).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openArea(item.id)}
                      style={{
                        padding: '10px 12px',
                        minHeight: '56px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '10px',
                        width: '100%',
                        textAlign: 'left',
                        cursor: 'pointer',
                        font: 'inherit',
                        color: 'inherit',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <AlertTriangle size={16} color={RISK_TONE[item.riskLevel] ?? 'var(--color-info)'} style={{ flexShrink: 0 }} role="img" aria-label={`${riskLabel(item.riskLevel)} risk`} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                          <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                            {[item.department, item.weakestPillar ? `Weakest: ${pillarLabel(item.weakestPillar)}` : ''].filter(Boolean).join(' • ')}
                          </span>
                        </span>
                      </span>
                      <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                        {isNum(item.overallScore) ? <ScorePill score={item.overallScore} /> : <NoDataHint text="Never audited" />}
                        {item.openCapaCount > 0 && (
                          <Badge variant="warning">
                            {item.openCapaCount} open action{item.openCapaCount === 1 ? '' : 's'}
                          </Badge>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          <PillarTrendPanel trends={maturityData.monthlyTrends || []} targetScore={isNum(targetScore) ? targetScore : null} periodLabel={maturityData.period?.label} />
        </>
      )}

      {/* ========================================================================= */}
      {/* MANAGEMENT VIEWS (mounted on first open, then kept to avoid refetching) */}
      {/* ========================================================================= */}
      {visitedTabs.has('kpis') && (
        <div style={{ display: activeTab === 'kpis' ? 'block' : 'none' }}>
          <KpiPanel query={query} refreshKey={refreshKey} />
        </div>
      )}
      {visitedTabs.has('drilldown') && (
        <div style={{ display: activeTab === 'drilldown' ? 'block' : 'none' }}>
          <DrilldownPanel period={period} refreshKey={refreshKey} />
        </div>
      )}
      {visitedTabs.has('benchmark') && (
        <div style={{ display: activeTab === 'benchmark' ? 'block' : 'none' }}>
          <BenchmarkPanel query={query} refreshKey={refreshKey} />
        </div>
      )}
      {visitedTabs.has('certification') && (
        <div style={{ display: activeTab === 'certification' ? 'block' : 'none' }}>
          <CertificationPanel orgNodeId={orgNodeId} refreshKey={refreshKey} />
        </div>
      )}
    </div>
  );
};

/** "1S" … "6S" (the maturity API's pillar ids) → the shared pillar badge colour. */
const PILLAR_KEY_BY_SHORT: Record<string, PillarKey> = {
  '1S': 'S1_SORT',
  '2S': 'S2_SET_IN_ORDER',
  '3S': 'S3_SHINE',
  '4S': 'S4_STANDARDIZE',
  '5S': 'S5_SUSTAIN',
  '6S': 'S6_SAFETY',
};
const pillarVariantFor = (shortCode: string) => pillarVariant(PILLAR_KEY_BY_SHORT[shortCode]);

/** Score band → summary card tone (no score → neutral). */
const summaryToneFor = (score: number | null | undefined): SummaryTone => scoreTone(score) ?? 'neutral';

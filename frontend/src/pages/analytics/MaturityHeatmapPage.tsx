import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { MaturityOverview, HeatmapData, LeaderboardData, HeatmapRow } from '../../types';
import {
  BarChart3,
  TrendingUp,
  ShieldCheck,
  Calendar,
  Layers,
  Award,
  AlertTriangle,
  RefreshCw,
  Printer,
  ChevronRight,
  ExternalLink,
  Target,
  Sparkles,
  Info,
  Building,
  CheckCircle2,
} from 'lucide-react';

export const MaturityHeatmapPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentTenant, addToast } = useApp();

  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('90D');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [maturityData, setMaturityData] = useState<MaturityOverview | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ rowId: string; pillarKey: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mat, heat, lead] = await Promise.all([
        api.getMaturityOverview(timeframe),
        api.get5SHeatmap(),
        api.getLeaderboard(),
      ]);
      setMaturityData(mat);
      setHeatmapData(heat);
      setLeaderboard(lead);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Analytics Load Failed',
        message: err.message || 'Could not retrieve 5S maturity analytics.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeframe, currentTenant]);

  // Filter heatmap rows by department
  const filteredRows = (heatmapData?.rows || []).filter((row) => {
    if (selectedDept === 'ALL') return true;
    return row.department.toLowerCase().includes(selectedDept.toLowerCase());
  });

  // Color helper for heatmap cells
  const getCellBg = (score: number) => {
    if (score >= 90) return 'rgba(16, 185, 129, 0.16)';
    if (score >= 75) return 'rgba(59, 130, 246, 0.16)';
    if (score >= 60) return 'rgba(245, 158, 11, 0.16)';
    return 'rgba(239, 68, 68, 0.16)';
  };

  const getCellTextColor = (score: number) => {
    if (score >= 90) return '#059669';
    if (score >= 75) return '#2563EB';
    if (score >= 60) return '#D97706';
    return '#DC2626';
  };

  const getCellBorder = (score: number) => {
    if (score >= 90) return '1px solid rgba(16, 185, 129, 0.35)';
    if (score >= 75) return '1px solid rgba(59, 130, 246, 0.35)';
    if (score >= 60) return '1px solid rgba(245, 158, 11, 0.35)';
    return '1px solid rgba(239, 68, 68, 0.35)';
  };

  if (loading || !maturityData) {
    return (
      <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-secondary)' }}>
        <div className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto 16px auto' }} />
        Aggregating Enterprise 5S Maturity Indices & Cross-Plant Heatmaps...
      </div>
    );
  }

  // Calculate radar chart points for SVG
  const radarPillars = maturityData.pillarBreakdown || [];
  const numPillars = radarPillars.length;
  const radius = 100;
  const centerX = 140;
  const centerY = 140;

  const getCoordinates = (index: number, score: number, max: number = 100) => {
    const angle = (Math.PI * 2 / numPillars) * index - Math.PI / 2;
    const r = (score / max) * radius;
    const x = centerX + r * Math.cos(angle);
    const y = centerY + r * Math.sin(angle);
    return { x, y };
  };

  const actualPoints = radarPillars
    .map((p, i) => {
      const { x, y } = getCoordinates(i, p.score);
      return `${x},${y}`;
    })
    .join(' ');

  const targetPoints = radarPillars
    .map((p, i) => {
      const { x, y } = getCoordinates(i, p.target);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner Header & Executive Actions */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ background: 'var(--color-primary)', color: '#FFFFFF', padding: '2px 8px', borderRadius: 'var(--radius-xs)', fontSize: '11px', fontWeight: 700 }}>
              Continuous Intelligence
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Operational Governance & Heat Maps
            </span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            5S Maturity Index & Operational Heat Maps
          </h1>
        </div>

        {/* Action Controls */}
        <div className="page-header-actions no-print">
          {/* Timeframe Selector */}
          <select
            className="form-select"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            style={{ width: '150px', height: '36px', fontSize: '13px' }}
          >
            <option value="30D">Last 30 Days</option>
            <option value="90D">Last 90 Days (Q3)</option>
            <option value="6M">Last 6 Months</option>
            <option value="YTD">Year to Date (2026)</option>
            <option value="ALL">All Historical</option>
          </select>

          {/* Department Filter */}
          <select
            className="form-select"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            style={{ width: '180px', height: '36px', fontSize: '13px' }}
          >
            <option value="ALL">All Departments</option>
            <option value="Machining">CNC Machining</option>
            <option value="Assembly">Electronics Assembly</option>
            <option value="Warehouse">Warehouse & Logistics</option>
            <option value="Quality">Quality Assurance</option>
            <option value="Stamping">Metal Stamping</option>
          </select>

          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={() => loadData()}
          >
            Refresh
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={<Printer size={14} />}
            onClick={() => window.print()}
          >
            Print Summary
          </Button>
        </div>
      </div>

      {/* 5S Maturity Score Hero Banner & KPI Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {/* Main Maturity Score Hero */}
        <Card noPadding style={{ gridColumn: 'span 2', borderLeft: `5px solid ${maturityData.level.badgeColor}` }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Enterprise 5S Maturity Index
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '4px' }}>
                  <span style={{ fontSize: '36px', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
                    {maturityData.overallScore}%
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <TrendingUp size={14} /> {maturityData.scoreDelta}
                  </span>
                </div>
              </div>

              <div
                style={{
                  background: `${maturityData.level.badgeColor}18`,
                  color: maturityData.level.badgeColor,
                  border: `1px solid ${maturityData.level.badgeColor}40`,
                  borderRadius: 'var(--radius-md)',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  textAlign: 'right',
                }}
              >
                {maturityData.level.name.split('—')[0]}
              </div>
            </div>

            {/* Target Progression Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                <span>Current Level Target: <strong>{maturityData.targetScore}% (Level 4 Benchmark)</strong></span>
                <span>{maturityData.overallScore >= maturityData.targetScore ? 'Target Exceeded' : `${Math.round((maturityData.targetScore - maturityData.overallScore) * 10) / 10}% to Target`}</span>
              </div>
              <ProgressBar value={maturityData.overallScore} height={8} />
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-surface-subtle)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
              <strong>Maturity Criteria:</strong> {maturityData.level.description}
            </div>
          </div>
        </Card>

        {/* KPI 1: Audit Compliance */}
        <Card noPadding>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'rgba(37, 99, 235, 0.12)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>On-Time Audits</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{maturityData.kpis.auditComplianceRate}%</div>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {maturityData.kpis.totalAuditsCompleted} inspections executed across {maturityData.kpis.totalLocations} stations.
            </div>
          </div>
        </Card>

        {/* KPI 2: 6S Safety Index */}
        <Card noPadding>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'rgba(245, 158, 11, 0.12)', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={20} />
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>6S Safety Index</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#D97706' }}>{maturityData.kpis.safetyIndex}%</div>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {maturityData.kpis.openAbnormalities} open CAPA abnormalities pending verification.
            </div>
          </div>
        </Card>
      </div>

      {/* Middle Grid: 6-Pillar Radar Spider Diagram & Breakdown */}
      <div className="grid grid-cols-3 gap-6">
        {/* Radar Spider SVG Visualization */}
        <Card
          title="6S Pillar Balance & Radar Profile"
          subtitle="Comparing current operational benchmark scores against 90% target threshold"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
            <svg width="280" height="280" viewBox="0 0 280 280">
              {/* Concentric Reference Polygons (20%, 40%, 60%, 80%, 100%) */}
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
                    fill={sIdx === 4 ? 'var(--bg-surface-subtle)' : 'none'}
                    stroke="var(--border-subtle)"
                    strokeWidth={sIdx === 4 ? '1.5' : '1'}
                    strokeDasharray={sIdx === 4 ? undefined : '2,2'}
                  />
                );
              })}

              {/* Axis lines */}
              {radarPillars.map((_, i) => {
                const { x, y } = getCoordinates(i, 100);
                return (
                  <line
                    key={i}
                    x1={centerX}
                    y1={centerY}
                    x2={x}
                    y2={y}
                    stroke="var(--border-subtle)"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Target 90% Polygon (Dashed Blue) */}
              <polygon
                points={targetPoints}
                fill="none"
                stroke="rgba(59, 130, 246, 0.6)"
                strokeWidth="1.5"
                strokeDasharray="4,4"
              />

              {/* Actual Score Polygon (Filled Emerald/Primary) */}
              <polygon
                points={actualPoints}
                fill="rgba(16, 185, 129, 0.25)"
                stroke="#10B981"
                strokeWidth="2.5"
              />

              {/* Data points & Pillar Labels */}
              {radarPillars.map((p, i) => {
                const pt = getCoordinates(i, p.score);
                const labelPos = getCoordinates(i, 120);
                return (
                  <g key={i}>
                    <circle cx={pt.x} cy={pt.y} r="4.5" fill="#10B981" stroke="#FFFFFF" strokeWidth="1.5" />
                    <text
                      x={labelPos.x}
                      y={labelPos.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill="var(--text-primary)"
                    >
                      {p.pillar} ({p.score}%)
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '16px', fontSize: '11px', marginTop: '10px', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '4px', background: '#10B981', display: 'inline-block', borderRadius: '2px' }} />
                <span>Actual Benchmark Score</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '2px', borderTop: '2px dashed #3B82F6', display: 'inline-block' }} />
                <span>Target Threshold (90%)</span>
              </div>
            </div>
          </div>
        </Card>

        {/* 6 Pillars Individual Breakdown Cards */}
        <div style={{ gridColumn: 'span 2' }}>
          <Card
            title="6S Pillar Maturity Breakdown & Gap Analysis"
            subtitle="Pillar-by-pillar compliance health with target status indicators"
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
              {radarPillars.map((p) => {
                const isTargetMet = p.score >= p.target;
                return (
                  <div
                    key={p.pillar}
                    style={{
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                      background: 'var(--bg-surface-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            background: `${p.color}20`,
                            color: p.color,
                            fontWeight: 800,
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-xs)',
                          }}
                        >
                          {p.pillar}
                        </span>
                        <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{p.name}</strong>
                      </div>
                      <Badge variant={isTargetMet ? 'success' : p.score >= 80 ? 'info' : 'warning'}>
                        {isTargetMet ? 'Target Met' : `${p.score}% / ${p.target}%`}
                      </Badge>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        <span>Current: <strong>{p.score}%</strong></span>
                        <span>Benchmark Target: {p.target}%</span>
                      </div>
                      <ProgressBar value={p.score} height={6} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* MAIN 2D 5S WORKSTATION HEATMAP MATRIX */}
      <Card
        title="Cross-Plant 5S Workstation Operational Heatmap"
        subtitle="2D compliance matrix mapping physical shop-floor workstations across all 6S pillars"
        actions={
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '11px' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>Thresholds:</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(16, 185, 129, 0.4)', border: '1px solid #10B981' }} />
              &ge; 90% (World Class)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(59, 130, 246, 0.4)', border: '1px solid #3B82F6' }} />
              75-89% (Standard)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(245, 158, 11, 0.4)', border: '1px solid #F59E0B' }} />
              60-74% (Developing)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(239, 68, 68, 0.4)', border: '1px solid #EF4444' }} />
              &lt; 60% (Critical)
            </span>
          </div>
        }
        noPadding
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="enterprise-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ minWidth: '220px' }}>Workstation / Area</th>
                <th style={{ minWidth: '150px' }}>Department</th>
                <th style={{ textAlign: 'center', width: '90px' }}>1S Sort</th>
                <th style={{ textAlign: 'center', width: '90px' }}>2S Order</th>
                <th style={{ textAlign: 'center', width: '90px' }}>3S Shine</th>
                <th style={{ textAlign: 'center', width: '90px' }}>4S Std</th>
                <th style={{ textAlign: 'center', width: '90px' }}>5S Sustain</th>
                <th style={{ textAlign: 'center', width: '90px' }}>6S Safety</th>
                <th style={{ textAlign: 'center', width: '110px' }}>Overall 5S</th>
                <th style={{ minWidth: '130px' }}>Last Audited</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  {/* Workstation & Code */}
                  <td>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="code-tag" style={{ fontSize: '11px', fontWeight: 700 }}>
                          {row.areaCode}
                        </span>
                        {row.openCapaCount > 0 && (
                          <Badge variant="warning">{row.openCapaCount} CAPA</Badge>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                        {row.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        {row.building}
                      </div>
                    </div>
                  </td>

                  {/* Department */}
                  <td>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {row.department}
                    </span>
                  </td>

                  {/* Heatmap Pillar Cells */}
                  {[
                    { key: 'S1_SORT', score: row.pillars.S1_SORT },
                    { key: 'S2_SET_IN_ORDER', score: row.pillars.S2_SET_IN_ORDER },
                    { key: 'S3_SHINE', score: row.pillars.S3_SHINE },
                    { key: 'S4_STANDARDIZE', score: row.pillars.S4_STANDARDIZE },
                    { key: 'S5_SUSTAIN', score: row.pillars.S5_SUSTAIN },
                    { key: 'S6_SAFETY', score: row.pillars.S6_SAFETY },
                  ].map((cell) => {
                    const isHovered = hoveredCell?.rowId === row.id && hoveredCell?.pillarKey === cell.key;
                    return (
                      <td
                        key={cell.key}
                        style={{ textAlign: 'center', padding: '6px' }}
                        onMouseEnter={() => setHoveredCell({ rowId: row.id, pillarKey: cell.key })}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <div
                          style={{
                            background: getCellBg(cell.score),
                            border: isHovered ? '2px solid var(--color-primary)' : getCellBorder(cell.score),
                            color: getCellTextColor(cell.score),
                            fontWeight: 800,
                            fontSize: '12px',
                            padding: '8px 4px',
                            borderRadius: 'var(--radius-sm)',
                            transition: 'all 0.15s ease',
                            cursor: 'pointer',
                            position: 'relative',
                          }}
                          title={`${cell.key}: ${cell.score}% at ${row.name} (Audited by ${row.lastAuditor})`}
                        >
                          {cell.score}%
                        </div>
                      </td>
                    );
                  })}

                  {/* Overall 5S Score Badge */}
                  <td style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '13px',
                        fontWeight: 800,
                        background: row.overallScore >= 90 ? 'rgba(16, 185, 129, 0.15)' : row.overallScore >= 80 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: row.overallScore >= 90 ? '#059669' : row.overallScore >= 80 ? '#2563EB' : '#D97706',
                      }}
                    >
                      {row.overallScore}%
                    </div>
                  </td>

                  {/* Last Audited */}
                  <td>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {row.lastAuditDate}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      By {row.lastAuditor}
                    </div>
                  </td>

                  {/* Action Link */}
                  <td style={{ textAlign: 'center' }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<ExternalLink size={14} />}
                      onClick={() => navigate(`/locations/${row.id}`)}
                      title="Open Station Details & Gallery"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Bottom Row: Historical Progression Trend & Leaderboards */}
      <div className="grid grid-cols-3 gap-6">
        {/* Historical Maturity Trend SVG Chart */}
        <div style={{ gridColumn: 'span 2' }}>
          <Card
            title="6-Month 5S Maturity Progression Curve"
            subtitle="Tracking enterprise score progression against scheduled milestones"
          >
            <div style={{ padding: '10px 0' }}>
              <svg width="100%" height="200" viewBox="0 0 600 200" style={{ overflow: 'visible' }}>
                {/* Y-axis gridlines */}
                {[50, 60, 70, 80, 90, 100].map((val, idx) => {
                  const y = 180 - ((val - 50) / 50) * 150;
                  return (
                    <g key={idx}>
                      <line x1="40" y1={y} x2="580" y2={y} stroke="var(--border-subtle)" strokeWidth="1" />
                      <text x="30" y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-tertiary)">
                        {val}%
                      </text>
                    </g>
                  );
                })}

                {/* Target line at 90% */}
                <line x1="40" y1={180 - ((90 - 50) / 50) * 150} x2="580" y2={180 - ((90 - 50) / 50) * 150} stroke="#3B82F6" strokeDasharray="4,4" strokeWidth="1.5" />

                {/* Plot Progression Area & Line */}
                {(() => {
                  const points = maturityData.monthlyTrends.map((t, idx) => {
                    const x = 70 + idx * 100;
                    const y = 180 - ((t.overall - 50) / 50) * 150;
                    return { x, y, label: t.month, score: t.overall };
                  });

                  const lineStr = points.map((p) => `${p.x},${p.y}`).join(' ');
                  const areaStr = `70,180 ${lineStr} ${points[points.length - 1].x},180`;

                  return (
                    <g>
                      {/* Area */}
                      <polygon points={areaStr} fill="rgba(16, 185, 129, 0.12)" />
                      {/* Line */}
                      <polyline points={lineStr} fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      {/* Points & Labels */}
                      {points.map((p, i) => (
                        <g key={i}>
                          <circle cx={p.x} cy={p.y} r="5" fill="#10B981" stroke="#FFFFFF" strokeWidth="2" />
                          <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--text-primary)">
                            {p.score}%
                          </text>
                          <text x={p.x} y="195" textAnchor="middle" fontSize="10" fill="var(--text-tertiary)">
                            {p.label}
                          </text>
                        </g>
                      ))}
                    </g>
                  );
                })()}
              </svg>
            </div>
          </Card>
        </div>

        {/* 5S Champions & Priority Kaizen Leaderboard */}
        <Card
          title="Plant 5S Champions"
          subtitle="Top performing benchmark workstations"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {leaderboard?.champions.map((champ) => (
              <div
                key={champ.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: champ.rank === 1 ? '#F59E0B' : champ.rank === 2 ? '#94A3B8' : '#3B82F6',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {champ.rank}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {champ.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      {champ.department} • {champ.streakDays}d streak
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#10B981' }}>
                    {champ.overallScore}%
                  </div>
                  <Badge variant="success">Champion</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

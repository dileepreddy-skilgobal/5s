import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, Gauge, Layers, ShieldAlert, Tag, TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { SummaryCard, SummaryGrid } from '../../../components/ui/SummaryCard';
import { ExecutiveSummary, SummaryArea } from '../../../types/insights';
import { EmptyState, ScorePill, fmtPct, isNum, scoreTone } from './analyticsShared';

/**
 * Leadership strip at the top of the overview (BRD §50): score and its change against the previous period of the same
 * length, actions, audits done vs planned, and the best / weakest areas of the period. Every figure opens the records
 * behind it.
 */
export const ExecutiveSummaryStrip: React.FC<{ summary: ExecutiveSummary }> = ({ summary }) => {
  const navigate = useNavigate();
  const change = summary.scoreChange;
  const trendText = isNum(change)
    ? `${change >= 0 ? '+' : ''}${change} pts vs previous period`
    : 'No earlier audits to compare';

  const areaList = (areas: SummaryArea[], emptyText: string) =>
    areas.length === 0 ? (
      <EmptyState text={emptyText} />
    ) : (
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {areas.map((a) => (
          <li key={a.locationId}>
            <button
              type="button"
              onClick={() => navigate(`/locations/${a.locationId}?tab=audit`)}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                color: 'inherit',
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.name}
                </span>
                <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  {[a.areaCode, a.department, `${a.auditsInPeriod} audit${a.auditsInPeriod === 1 ? '' : 's'}`].filter(Boolean).join(' • ')}
                </span>
              </span>
              <ScorePill score={a.averageScore} />
            </button>
          </li>
        ))}
      </ol>
    );

  return (
    <section aria-label="Executive summary" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <SummaryGrid min={170}>
        <SummaryCard
          label="Overall 5S score"
          value={fmtPct(summary.overallScore)}
          icon={<Gauge size={18} />}
          tone={scoreTone(summary.overallScore) ?? 'neutral'}
          hint={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {isNum(change) && change > 0 && <TrendingUp size={14} aria-hidden="true" />}
              {isNum(change) && change < 0 && <TrendingDown size={14} aria-hidden="true" />}
              {trendText}
            </span>
          }
          onClick={() => navigate('/reports?register=audit-trend')}
        />
        <SummaryCard
          label="Open actions"
          value={summary.actions.open}
          icon={<Layers size={18} />}
          tone="primary"
          hint="Corrective actions not yet verified"
          onClick={() => navigate('/capa')}
        />
        <SummaryCard
          label="Overdue actions"
          value={summary.actions.overdue}
          icon={<AlertTriangle size={18} />}
          tone={summary.actions.overdue > 0 ? 'danger' : 'success'}
          hint={summary.actions.overdue > 0 ? 'Past their target date' : 'Nothing overdue'}
          onClick={() => navigate('/capa?overdue=1')}
        />
        <SummaryCard
          label="Audits done vs planned"
          value={`${summary.audits.plannedCompleted} / ${summary.audits.planned}`}
          icon={<CalendarCheck size={18} />}
          tone={isNum(summary.audits.adherencePercent) ? 'primary' : 'neutral'}
          hint={
            isNum(summary.audits.adherencePercent)
              ? `${summary.audits.adherencePercent}% adherence · ${summary.audits.completed} audits completed in total`
              : `No scheduled audits due · ${summary.audits.completed} audits completed`
          }
          onClick={() => navigate('/reports?register=audit-plan')}
        />
        <SummaryCard
          label="Open critical observations"
          value={summary.observations.openCritical}
          icon={<ShieldAlert size={18} />}
          tone={summary.observations.openCritical > 0 ? 'danger' : 'success'}
          hint="Raised in this period"
          onClick={() => navigate('/observations?severity=CRITICAL')}
        />
        <SummaryCard
          label="Red tags pending"
          value={summary.redTags.pending}
          icon={<Tag size={18} />}
          tone={summary.redTags.pending > 0 ? 'warning' : 'neutral'}
          hint="Awaiting a disposition decision"
          onClick={() => navigate('/red-tags')}
        />
      </SummaryGrid>

      <div className="grid-auto" style={{ '--min': '280px', gap: '16px' } as React.CSSProperties}>
        <Card title="Best areas in period" subtitle="Highest average audit score">
          {areaList(summary.topAreas, 'No audited areas in this period.')}
        </Card>
        <Card title="Weakest areas in period" subtitle="Lowest average audit score">
          {areaList(summary.bottomAreas, summary.topAreas.length ? 'No other audited areas to compare.' : 'No audited areas in this period.')}
        </Card>
      </div>
    </section>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiErrorMessage, isPlanFeatureRequiredError } from '../../../services/api';
import { insightsApi } from '../../../services/api-insights';
import { InsightsQuery } from '../../../types/insights';
import { PlanUpgradeNotice } from '../../../components/common/PlanUpgradeNotice';
import { useApp } from '../../../context/AppContext';
import { useI18n } from '../../../i18n';
import { Card } from '../../../components/ui/Card';
import { SummaryCard, SummaryGrid, SummaryTone } from '../../../components/ui/SummaryCard';
import { Button } from '../../../components/ui/Button';
import { AnalyticsKpis } from '../../../types';
import { CalendarCheck, Clock, AlertTriangle, Repeat, ShieldAlert, Tag, Timer, Layers } from 'lucide-react';
import { PanelStatus, NoDataHint, isNum, fmtPct, fmtNum } from './analyticsShared';

/** Red-tag values are recorded in rupees (see the Red Tag screens). */
const RED_TAG_CURRENCY = 'INR';

interface KpiPanelProps {
  /** Period (preset or custom range) and optional plant / department. */
  query: InsightsQuery;
  refreshKey: number;
}

/**
 * Single management KPI tile. A null value renders "—" with a "no data" hint. With `to`, the tile opens the list
 * or register behind the figure.
 */
const KpiTile: React.FC<{
  icon: React.ReactNode;
  tone: SummaryTone;
  label: string;
  value: string;
  hasData: boolean;
  sub?: React.ReactNode;
  to?: string;
}> = ({ icon, tone, label, value, hasData, sub, to }) => {
  const navigate = useNavigate();
  return (
    <SummaryCard
      label={label}
      value={value}
      icon={icon}
      tone={hasData ? tone : 'neutral'}
      hint={hasData ? sub : 'No data in period'}
      onClick={to ? () => navigate(to) : undefined}
    />
  );
};

export const KpiPanel: React.FC<KpiPanelProps> = ({ query, refreshKey }) => {
  const navigate = useNavigate();
  const { addToast } = useApp();
  const { formatNumber } = useI18n();
  const [data, setData] = useState<AnalyticsKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 403 PLAN_FEATURE_REQUIRED: the organization's plan does not include advanced analytics
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLocked(false);
    try {
      setData(await insightsApi.getKpis(query));
    } catch (err) {
      if (isPlanFeatureRequiredError(err)) {
        setLocked(true);
        return;
      }
      const message = getApiErrorMessage(err, 'Could not retrieve management KPIs.');
      setError(message);
      addToast({ type: 'error', title: 'KPIs not loaded', message });
    } finally {
      setLoading(false);
    }
  }, [query, addToast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (locked) return <PlanUpgradeNotice feature="Management KPIs" description="Management KPIs, drill-down, benchmarking and certification are part of Advanced Analytics, which is not included in your organization's current plan." />;

  if (loading || error || !data) {
    return (
      <Card>
        <PanelStatus loading={loading} error={error || (!data ? 'No KPI data returned.' : null)} onRetry={load} loadingText="Computing management KPIs..." />
      </Card>
    );
  }

  const { audits, actions, observations, redTags, locations } = data;
  const ageing = [
    { label: '0–7 days', count: redTags.ageing.days0to7, color: 'var(--color-success)' },
    { label: '8–14 days', count: redTags.ageing.days8to14, color: 'var(--color-info)' },
    { label: '15–30 days', count: redTags.ageing.days15to30, color: 'var(--color-warning)' },
    { label: '> 30 days', count: redTags.ageing.over30, color: 'var(--color-danger)' },
  ];
  const maxAgeing = Math.max(1, ...ageing.map((a) => a.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
        Period: <strong style={{ color: 'var(--text-primary)' }}>{data.period?.label || query.timeframe}</strong> · {locations.audited} of {locations.total} areas audited · the 5S score and maturity level are on the Overview tab · select a figure to open the records behind it
      </div>

      {/* Audit & action KPIs */}
      <SummaryGrid min={220}>
        <KpiTile
          icon={<CalendarCheck size={18} />}
          tone="primary"
          label="Audit adherence"
          value={fmtPct(audits.adherencePercent)}
          hasData={isNum(audits.adherencePercent)}
          sub={`${audits.scheduledCompleted} of ${audits.scheduledDue} scheduled audits completed · ${audits.completed} audits total`}
          to="/reports?register=audit-plan"
        />
        <KpiTile
          icon={<Clock size={18} />}
          tone="primary"
          label="On-time closure"
          value={fmtPct(actions.onTimeClosurePercent)}
          hasData={isNum(actions.onTimeClosurePercent)}
          sub={`${actions.closedInPeriod} actions closed in period`}
          to="/reports?register=actions"
        />
        <KpiTile
          icon={<AlertTriangle size={18} />}
          tone={actions.overdue > 0 ? 'danger' : 'primary'}
          label="Overdue actions"
          value={String(actions.overdue)}
          hasData
          to="/capa?overdue=1"
          sub={
            isNum(actions.overduePercent) ? (
              `${actions.overduePercent}% of ${actions.open} open actions`
            ) : (
              <>
                {actions.open} open actions · <NoDataHint text="no open actions" />
              </>
            )
          }
        />
        <KpiTile
          icon={<Timer size={18} />}
          tone="primary"
          label="Average closure time"
          value={fmtNum(actions.averageClosureDays, ' days')}
          hasData={isNum(actions.averageClosureDays)}
          sub="Mean days from raise to closure"
          to="/reports?register=action-ageing"
        />
        <KpiTile
          icon={<Repeat size={18} />}
          tone={observations.repeat > 0 ? 'warning' : 'primary'}
          label="Repeat observations"
          value={fmtPct(observations.repeatPercent)}
          hasData={isNum(observations.repeatPercent)}
          sub={`${observations.repeat} of ${observations.total} observations are repeats`}
          to="/reports?register=observations&repeatOnly=1"
        />
        <KpiTile
          icon={<ShieldAlert size={18} />}
          tone={observations.openCritical > 0 ? 'danger' : 'primary'}
          label="Critical observations"
          value={`${observations.openCritical} / ${observations.critical}`}
          hasData
          sub="Open / total critical findings in period"
          to="/observations?severity=CRITICAL"
        />
        <KpiTile
          icon={<Layers size={18} />}
          tone="primary"
          label="Areas audited"
          value={`${locations.audited} / ${locations.total}`}
          hasData
          sub="Areas with at least one audit in period"
          to="/reports?register=area-ranking"
        />
      </SummaryGrid>

      {/* Red tag backlog */}
      <Card
        title="Red-tag backlog and ageing"
        subtitle="Pending red-tagged items awaiting disposition, by age"
        actions={
          <Button size="sm" variant="secondary" onClick={() => navigate('/red-tags')}>
            Open red tags
          </Button>
        }
      >
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: '24px' }}>
          <dl style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: 0 }}>
            <div>
              <dt style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Tag size={16} aria-hidden="true" style={{ color: 'var(--color-danger)' }} />
                Pending red tags
              </dt>
              <dd className="tabular-nums" style={{ margin: '4px 0 0', fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {redTags.pending}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Estimated value pending</dt>
              <dd className="tabular-nums" style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {isNum(redTags.pendingEstimatedValue)
                  ? formatNumber(redTags.pendingEstimatedValue, { style: 'currency', currency: RED_TAG_CURRENCY, maximumFractionDigits: 0 })
                  : '—'}
              </dd>
              <dd style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>Sum of the values entered on pending red tags</dd>
            </div>
          </dl>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }} role="list" aria-label="Pending red tags by age">
            {redTags.pending === 0 ? (
              <NoDataHint text="No pending red tags" />
            ) : (
              ageing.map((b) => (
                <div key={b.label} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' }}>
                  <span style={{ width: '84px', flexShrink: 0, color: 'var(--text-secondary)' }}>{b.label}</span>
                  <div aria-hidden="true" style={{ flex: 1, height: '12px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ width: `${(b.count / maxAgeing) * 100}%`, height: '100%', background: b.color }} />
                  </div>
                  <strong className="tabular-nums" style={{ width: '32px', textAlign: 'right', color: 'var(--text-primary)' }}>
                    {b.count}
                    <span className="sr-only"> red tags</span>
                  </strong>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

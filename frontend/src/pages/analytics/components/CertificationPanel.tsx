import React, { useState, useEffect, useCallback } from 'react';
import { getApiErrorMessage, isPlanFeatureRequiredError } from '../../../services/api';
import { insightsApi } from '../../../services/api-insights';
import { PlanUpgradeNotice } from '../../../components/common/PlanUpgradeNotice';
import { useApp } from '../../../context/AppContext';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { SummaryCard, SummaryGrid, SummaryTone } from '../../../components/ui/SummaryCard';
import { CertificationData, CertificationLevel } from '../../../types';
import { certificationLevelLabel } from '../../../constants/labels';
import { Award } from 'lucide-react';
import { PanelStatus, ScorePill, EmptyState, fmtPct, isNum } from './analyticsShared';

interface CertificationPanelProps {
  /** Plant or department the areas are limited to (all when undefined). */
  orgNodeId?: string;
  refreshKey: number;
}

/** Badge colour per level; the level name is always written out, so colour is never the only cue. */
const LEVEL_VARIANT: Record<CertificationLevel | 'NONE', 'purple' | 'warning' | 'info' | 'neutral'> = {
  PLATINUM: 'purple',
  GOLD: 'warning',
  SILVER: 'info',
  BRONZE: 'neutral',
  NONE: 'neutral',
};

const LEVEL_TONE: Record<CertificationLevel | 'NONE', SummaryTone> = {
  PLATINUM: 'purple',
  GOLD: 'warning',
  SILVER: 'info',
  BRONZE: 'neutral',
  NONE: 'neutral',
};

const LEVEL_ORDER: Array<CertificationLevel | 'NONE'> = ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'NONE'];

const CertBadge: React.FC<{ level: CertificationLevel | null }> = ({ level }) => (
  <Badge variant={LEVEL_VARIANT[level || 'NONE']} icon={level ? <Award size={12} aria-hidden="true" /> : undefined}>
    {certificationLevelLabel(level || 'NONE')}
  </Badge>
);

const NoRequirement = () => <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>No requirement</span>;

const threshold = (v: number | null, prefix: string) => (isNum(v) ? `${prefix} ${v}%` : <NoRequirement />);

export const CertificationPanel: React.FC<CertificationPanelProps> = ({ orgNodeId, refreshKey }) => {
  const { addToast } = useApp();
  const [data, setData] = useState<CertificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 403 PLAN_FEATURE_REQUIRED: the organization's plan does not include advanced analytics
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLocked(false);
    try {
      setData(await insightsApi.getCertification(orgNodeId));
    } catch (err) {
      if (isPlanFeatureRequiredError(err)) {
        setLocked(true);
        return;
      }
      const message = getApiErrorMessage(err, 'Could not load area certification.');
      setError(message);
      addToast({ type: 'error', title: 'Certification not loaded', message });
    } finally {
      setLoading(false);
    }
  }, [orgNodeId, addToast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (locked) return <PlanUpgradeNotice feature="Area certification" description="Management KPIs, drill-down, benchmarking and certification are part of Advanced Analytics, which is not included in your organization's current plan." />;

  if (loading || error || !data) {
    return (
      <Card>
        <PanelStatus loading={loading} error={error || (!data ? 'No certification data returned.' : null)} onRetry={load} loadingText="Evaluating certification rules..." />
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Summary counts */}
      <SummaryGrid min={160}>
        {LEVEL_ORDER.map((lvl) => {
          const count = data.summary?.[lvl] ?? 0;
          return (
            <SummaryCard
              key={lvl}
              label={certificationLevelLabel(lvl)}
              value={count}
              icon={lvl === 'NONE' ? undefined : <Award size={18} />}
              tone={LEVEL_TONE[lvl]}
              hint={count === 1 ? 'area' : 'areas'}
            />
          );
        })}
      </SummaryGrid>

      {/* Rules */}
      <Card
        title="Certification rules"
        subtitle={`Evaluated over a rolling ${data.windowMonths}-month window (not the selected period); the highest level whose rules are all met is awarded. Areas without data for a criterion pass it.`}
        noPadding
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="enterprise-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Level</th>
                <th style={{ textAlign: 'center' }}>Window</th>
                <th style={{ textAlign: 'center' }}>Min avg score</th>
                <th style={{ textAlign: 'center' }}>Max repeat %</th>
                <th style={{ textAlign: 'center' }}>Min on-time closure</th>
                <th style={{ textAlign: 'center' }}>Min adherence</th>
                <th style={{ textAlign: 'center' }}>Sustained audits</th>
              </tr>
            </thead>
            <tbody>
              {data.rules.map((r) => (
                <tr key={r.name}>
                  <td><CertBadge level={r.name} /></td>
                  <td className="num" style={{ textAlign: 'center' }}>{data.windowMonths} months</td>
                  <td className="num" style={{ textAlign: 'center' }}>{threshold(r.minAverageScore, '≥')}</td>
                  <td className="num" style={{ textAlign: 'center' }}>{threshold(r.maxRepeatRate, '≤')}</td>
                  <td className="num" style={{ textAlign: 'center' }}>{threshold(r.minOnTimeClosure, '≥')}</td>
                  <td className="num" style={{ textAlign: 'center' }}>{threshold(r.minAdherence, '≥')}</td>
                  <td className="num" style={{ textAlign: 'center' }}>{isNum(r.sustainedAudits) ? `≥ ${r.sustainedAudits}` : <NoRequirement />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Per-area */}
      <Card title="Area certification" subtitle={`Metrics over the last ${data.windowMonths} months`} noPadding>
        {data.locations.length === 0 ? (
          <EmptyState text="No areas to certify." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="enterprise-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Department</th>
                  <th style={{ textAlign: 'center' }}>Certification</th>
                  <th style={{ textAlign: 'center' }}>Avg score</th>
                  <th style={{ textAlign: 'center' }}>Audits</th>
                  <th style={{ textAlign: 'center' }}>Repeat %</th>
                  <th style={{ textAlign: 'center' }}>On-time closure</th>
                  <th style={{ textAlign: 'center' }}>Adherence</th>
                </tr>
              </thead>
              <tbody>
                {data.locations.map((l) => (
                  <tr key={l.locationId}>
                    <td>
                      <span className="code-tag">{l.areaCode}</span>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{l.name}</div>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{l.department || '—'}</td>
                    <td style={{ textAlign: 'center' }}><CertBadge level={l.certification} /></td>
                    <td style={{ textAlign: 'center' }}><ScorePill score={l.averageScore} /></td>
                    <td className="num" style={{ textAlign: 'center' }}>{l.auditsInWindow}</td>
                    <td className="num" style={{ textAlign: 'center' }}>{fmtPct(l.repeatPercent)}</td>
                    <td className="num" style={{ textAlign: 'center' }}>{fmtPct(l.onTimeClosurePercent)}</td>
                    <td className="num" style={{ textAlign: 'center' }}>{fmtPct(l.adherencePercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

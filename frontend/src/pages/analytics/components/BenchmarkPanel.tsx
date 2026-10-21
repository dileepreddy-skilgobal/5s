import React, { useState, useEffect, useCallback } from 'react';
import { getApiErrorMessage, isPlanFeatureRequiredError } from '../../../services/api';
import { insightsApi } from '../../../services/api-insights';
import { InsightsQuery } from '../../../types/insights';
import { PlanUpgradeNotice } from '../../../components/common/PlanUpgradeNotice';
import { useApp } from '../../../context/AppContext';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { BenchmarkRow } from '../../../types';
import { PanelStatus, ScorePill, EmptyState, fmtPct } from './analyticsShared';

type BenchmarkLevel = 'PLANT' | 'DEPARTMENT' | 'AREA';

interface BenchmarkPanelProps {
  /** Period (preset or custom range) and optional plant / department. */
  query: InsightsQuery;
  refreshKey: number;
}

const LEVELS: Array<{ id: BenchmarkLevel; label: string }> = [
  { id: 'PLANT', label: 'Plant' },
  { id: 'DEPARTMENT', label: 'Department' },
  { id: 'AREA', label: 'Area' },
];

export const BenchmarkPanel: React.FC<BenchmarkPanelProps> = ({ query, refreshKey }) => {
  const { addToast } = useApp();
  const [level, setLevel] = useState<BenchmarkLevel>('DEPARTMENT');
  const [rows, setRows] = useState<BenchmarkRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 403 PLAN_FEATURE_REQUIRED: the organization's plan does not include advanced analytics
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLocked(false);
    try {
      const res = await insightsApi.getBenchmark(level, query);
      setRows(Array.isArray(res) ? res : []);
    } catch (err) {
      if (isPlanFeatureRequiredError(err)) {
        setLocked(true);
        return;
      }
      const message = getApiErrorMessage(err, 'Could not load benchmark rankings.');
      setError(message);
      addToast({ type: 'error', title: 'Benchmark not loaded', message });
    } finally {
      setLoading(false);
    }
  }, [level, query, addToast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (locked) return <PlanUpgradeNotice feature="Benchmarking" description="Management KPIs, drill-down, benchmarking and certification are part of Advanced Analytics, which is not included in your organization's current plan." />;

  const levelLabel = LEVELS.find((l) => l.id === level)?.label || level;

  return (
    <Card
      title={`${levelLabel} benchmark`}
      subtitle="Ranked by average audit score in the selected period"
      noPadding
      actions={
        <div role="group" aria-label="Benchmark level" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {LEVELS.map((l) => (
            <button key={l.id} type="button" className="pillar-tab-pill" aria-pressed={level === l.id} onClick={() => setLevel(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      }
    >
      {loading || error || !rows ? (
        <PanelStatus loading={loading} error={error || (!rows ? 'No benchmark data returned.' : null)} onRetry={load} loadingText="Ranking benchmark groups..." />
      ) : rows.length === 0 ? (
        <EmptyState text={`No ${levelLabel.toLowerCase()} groups found.`} />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="enterprise-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: '90px', textAlign: 'center' }}>Rank</th>
                <th>{levelLabel}</th>
                <th style={{ textAlign: 'center' }}>Score</th>
                <th style={{ textAlign: 'center' }}>Audits</th>
                <th style={{ textAlign: 'center' }}>Areas</th>
                <th style={{ textAlign: 'center' }}>Open actions</th>
                <th style={{ textAlign: 'center' }}>Observations</th>
                <th style={{ textAlign: 'center' }}>Repeat %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ textAlign: 'center' }}>
                    {r.rank !== null && r.rank !== undefined ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          width: '26px',
                          height: '26px',
                          borderRadius: '50%',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          background: 'var(--bg-surface-subtle)',
                          border: '1px solid var(--border-strong)',
                        }}
                        aria-label={`Rank ${r.rank}`}
                      >
                        {r.rank}
                      </span>
                    ) : (
                      <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>Not ranked (no audits)</span>
                    )}
                  </td>
                  <td style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.name || '—'}</td>
                  <td style={{ textAlign: 'center' }}><ScorePill score={r.score} /></td>
                  <td className="num" style={{ textAlign: 'center' }}>{r.audits}</td>
                  <td className="num" style={{ textAlign: 'center' }}>{r.locations}</td>
                  <td style={{ textAlign: 'center' }}>
                    {r.openActions > 0 ? <Badge variant="warning">{r.openActions}</Badge> : <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>0</span>}
                  </td>
                  <td className="num" style={{ textAlign: 'center' }}>{r.observations}</td>
                  <td className="num" style={{ textAlign: 'center', color: r.repeatPercent === null ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{fmtPct(r.repeatPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

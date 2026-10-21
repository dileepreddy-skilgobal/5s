import React from 'react';
import { Card } from '../../../components/ui/Card';
import { MonthlyTrendItem, PillarKey } from '../../../types';
import { EmptyState, fmtPct, isNum, pillarLabel } from './analyticsShared';

/** Monthly trend fields of each pillar (GET /analytics/maturity → monthlyTrends). */
const PILLAR_FIELDS: Array<{ key: PillarKey; field: keyof Pick<MonthlyTrendItem, 'sort' | 'order' | 'shine' | 'standardize' | 'sustain' | 'safety'> }> = [
  { key: 'S1_SORT', field: 'sort' },
  { key: 'S2_SET_IN_ORDER', field: 'order' },
  { key: 'S3_SHINE', field: 'shine' },
  { key: 'S4_STANDARDIZE', field: 'standardize' },
  { key: 'S5_SUSTAIN', field: 'sustain' },
  { key: 'S6_SAFETY', field: 'safety' },
];

const W = 260;
const H = 120;
const PAD = { left: 30, right: 12, top: 12, bottom: 22 };

/**
 * One small chart per pillar (1S–6S) on the same 0–100% scale, so pillars compare at a glance without six
 * overlapping lines. Gaps mark months without audits; the dashed line is the target.
 */
const PillarSparkline: React.FC<{ title: string; points: Array<{ month: string; value: number | null; audits: number }>; target: number | null }> = ({
  title,
  points,
  target,
}) => {
  const n = points.length;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const toX = (i: number) => PAD.left + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const toY = (v: number) => PAD.top + plotH - (v / 100) * plotH;

  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  points.forEach((p, i) => {
    if (isNum(p.value)) current.push({ x: toX(i), y: toY(p.value) });
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length) segments.push(current);

  const scored = points.filter((p) => isNum(p.value));
  const latest = scored.length ? scored[scored.length - 1] : null;
  const first = scored.length > 1 ? scored[0] : null;
  const delta = latest && first && isNum(latest.value) && isNum(first.value) ? Math.round((latest.value - first.value) * 10) / 10 : null;
  const summary = `${title}: ${points.map((p) => `${p.month} ${isNum(p.value) ? `${p.value}%` : 'no audits'}`).join(', ')}.`;

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px', background: 'var(--bg-surface)', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
        <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{title}</strong>
        <span className="tabular-nums" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {latest ? fmtPct(latest.value) : '—'}
          {isNum(delta) && (
            <span style={{ fontWeight: 500, color: 'var(--text-secondary)', marginLeft: '6px' }}>
              ({delta >= 0 ? '+' : ''}
              {delta} pts)
            </span>
          )}
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ display: 'block', overflow: 'visible' }}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={toY(v)} y2={toY(v)} style={{ stroke: 'var(--border-subtle)' }} strokeWidth="1" />
            <text x={PAD.left - 6} y={toY(v) + 3} textAnchor="end" fontSize="9" style={{ fill: 'var(--text-tertiary)' }}>
              {v}%
            </text>
          </g>
        ))}
        {isNum(target) && (
          <line x1={PAD.left} x2={W - PAD.right} y1={toY(target)} y2={toY(target)} style={{ stroke: 'var(--color-info)' }} strokeDasharray="4,3" strokeWidth="1.5" />
        )}
        {segments.map((seg, i) =>
          seg.length > 1 ? (
            <polyline
              key={i}
              points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
              style={{ fill: 'none', stroke: 'var(--color-primary)' }}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null,
        )}
        {points.map((p, i) =>
          isNum(p.value) ? (
            <g key={i}>
              <title>{`${p.month}: ${p.value}% (${p.audits} audit${p.audits === 1 ? '' : 's'})`}</title>
              {/* Generous invisible hit target; the visible marker stays small */}
              <circle cx={toX(i)} cy={toY(p.value)} r="9" style={{ fill: 'transparent' }} />
              <circle cx={toX(i)} cy={toY(p.value)} r="4" style={{ fill: 'var(--color-primary)', stroke: 'var(--bg-surface)' }} strokeWidth="2" />
            </g>
          ) : null,
        )}
        {n > 0 && (
          <>
            <text x={toX(0)} y={H - 4} textAnchor={n > 1 ? 'start' : 'middle'} fontSize="9" style={{ fill: 'var(--text-tertiary)' }}>
              {points[0].month}
            </text>
            {n > 1 && (
              <text x={toX(n - 1)} y={H - 4} textAnchor="end" fontSize="9" style={{ fill: 'var(--text-tertiary)' }}>
                {points[n - 1].month}
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  );
};

export const PillarTrendPanel: React.FC<{ trends: MonthlyTrendItem[]; targetScore: number | null; periodLabel?: string }> = ({ trends, targetScore, periodLabel }) => {
  const anyScore = trends.some((t) => PILLAR_FIELDS.some((p) => isNum(t[p.field])));
  return (
    <Card
      title="Pillar trend (1S–6S)"
      subtitle={`Monthly average score per pillar${periodLabel ? ` — ${periodLabel}` : ''}; same 0–100% scale, dashed line = target`}
    >
      {!anyScore ? (
        <EmptyState text="No completed audits in this period — no pillar trend to plot." />
      ) : (
        <>
          <div className="grid-auto" style={{ '--min': '220px', gap: '12px' } as React.CSSProperties}>
            {PILLAR_FIELDS.map((p) => (
              <PillarSparkline
                key={p.key}
                title={pillarLabel(p.key)}
                target={targetScore}
                points={trends.map((t) => ({ month: t.month, value: t[p.field], audits: t.audits }))}
              />
            ))}
          </div>
          <details style={{ marginTop: '12px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--color-primary)', fontWeight: 600 }}>Show as table</summary>
            <div style={{ overflowX: 'auto', marginTop: '8px' }}>
              <table className="enterprise-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num" style={{ textAlign: 'right' }}>
                      Audits
                    </th>
                    {PILLAR_FIELDS.map((p) => (
                      <th key={p.key} className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {pillarLabel(p.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trends.map((t) => (
                    <tr key={t.month}>
                      <td style={{ whiteSpace: 'nowrap' }}>{t.month}</td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {t.audits}
                      </td>
                      {PILLAR_FIELDS.map((p) => (
                        <td key={p.key} className="num" style={{ textAlign: 'right' }}>
                          {fmtPct(t[p.field])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </Card>
  );
};

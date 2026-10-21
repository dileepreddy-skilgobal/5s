import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { AreaMaturityData } from '../../../types/insights';
import { EmptyState, NoDataHint, ScorePill, pillarLabel } from './analyticsShared';

/**
 * Maturity level of every area (BRD §45) from its average audit score in the selected period, with the count per
 * level. Areas without audits in the period are "not assessed" rather than given a level.
 */
export const AreaMaturityPanel: React.FC<{ data: AreaMaturityData }> = ({ data }) => {
  const navigate = useNavigate();
  const rows = [...data.locations].sort(
    (a, b) => (b.maturity?.level ?? 0) - (a.maturity?.level ?? 0) || (b.averageScore ?? -1) - (a.averageScore ?? -1) || a.areaCode.localeCompare(b.areaCode),
  );

  return (
    <Card
      title="Maturity by area"
      subtitle={`Level from each area's average audit score${data.period?.label ? ` — ${data.period.label}` : ''}`}
      noPadding
    >
      <div role="list" aria-label="Areas per maturity level" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '16px 20px' }}>
        {data.levels.map((lv) => (
          <span
            key={lv.level}
            role="listitem"
            className="pill"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--text-secondary)' }}
          >
            {/* The level colour is configured per organization; the level name always accompanies it */}
            <span aria-hidden="true" style={{ width: '10px', height: '10px', borderRadius: '50%', background: lv.color, flexShrink: 0 }} />
            L{lv.level} {lv.name} (from {lv.minScore}%):
            <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {lv.count}
            </strong>
          </span>
        ))}
        <span role="listitem" className="pill" style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
          Not assessed: <strong style={{ color: 'var(--text-primary)' }}>{data.notAssessed}</strong>
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyState text="No areas found." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="enterprise-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ minWidth: '180px' }}>Area</th>
                <th>Maturity</th>
                <th style={{ textAlign: 'center' }}>Average score</th>
                <th className="num" style={{ textAlign: 'right' }}>
                  Audits
                </th>
                <th>Weakest pillar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.locationId}>
                  <td>
                    <button
                      type="button"
                      onClick={() => navigate(`/locations/${r.locationId}?tab=audit`)}
                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', cursor: 'pointer', textAlign: 'left' }}
                    >
                      {r.name}
                    </button>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{[r.areaCode, r.department].filter(Boolean).join(' • ')}</div>
                  </td>
                  <td>
                    {r.maturity ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        <span aria-hidden="true" style={{ width: '10px', height: '10px', borderRadius: '50%', background: r.maturity.color, flexShrink: 0 }} />
                        L{r.maturity.level} {r.maturity.name}
                      </span>
                    ) : (
                      <NoDataHint text="Not assessed" />
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <ScorePill score={r.averageScore} />
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {r.auditsInPeriod}
                  </td>
                  <td>{r.weakestPillar ? <Badge variant="neutral">{pillarLabel(r.weakestPillar)}</Badge> : <NoDataHint text="—" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiErrorMessage, isPlanFeatureRequiredError } from '../../../services/api';
import { insightsApi } from '../../../services/api-insights';
import { PeriodQuery } from '../../../types/insights';
import { PlanUpgradeNotice } from '../../../components/common/PlanUpgradeNotice';
import { useApp } from '../../../context/AppContext';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { DrilldownData, LocationAuditDrilldown } from '../../../types';
import { auditStatusLabel, auditStatusVariant, humanize, observationStatusLabel, severityLabel, severityVariant } from '../../../constants/labels';
import { ChevronRight, Home, ExternalLink, Repeat, X } from 'lucide-react';
import { SummaryCard, SummaryGrid } from '../../../components/ui/SummaryCard';
import { PanelStatus, ScorePill, EmptyState, fmtDate, fmtPct, isNum, pillarLabel, scoreTone, SCORE_BANDS } from './analyticsShared';

interface DrilldownPanelProps {
  /** Period of the area audits (preset or custom range); unit scores use each area's latest audit. */
  period: PeriodQuery;
  refreshKey: number;
}

const nodeTypeLabel = (t: string) => humanize(t);

const linkButton = (active = true): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  fontSize: '13px',
  fontWeight: 600,
  color: active ? 'var(--color-primary)' : 'var(--text-primary)',
  cursor: 'pointer',
  textAlign: 'left',
});

export const DrilldownPanel: React.FC<DrilldownPanelProps> = ({ period, refreshKey }) => {
  const navigate = useNavigate();
  const { addToast } = useApp();

  const [nodeId, setNodeId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<DrilldownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 403 PLAN_FEATURE_REQUIRED: the organization's plan does not include advanced analytics
  const [locked, setLocked] = useState(false);

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [locationData, setLocationData] = useState<LocationAuditDrilldown | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLocked(false);
    try {
      setData(await insightsApi.getDrilldown(nodeId));
    } catch (err) {
      if (isPlanFeatureRequiredError(err)) {
        setLocked(true);
        return;
      }
      const message = getApiErrorMessage(err, 'Could not load the hierarchy drill-down.');
      setError(message);
      addToast({ type: 'error', title: 'Drill-down not loaded', message });
    } finally {
      setLoading(false);
    }
  }, [nodeId, addToast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const loadLocation = useCallback(async () => {
    if (!selectedLocationId) {
      setLocationData(null);
      return;
    }
    setLocationLoading(true);
    setLocationError(null);
    try {
      setLocationData(await insightsApi.getLocationAudits(selectedLocationId, period));
    } catch (err) {
      const message = getApiErrorMessage(err, 'Could not load audits for this area.');
      setLocationError(message);
      addToast({ type: 'error', title: 'Area audits not loaded', message });
    } finally {
      setLocationLoading(false);
    }
  }, [selectedLocationId, period, addToast]);

  useEffect(() => {
    loadLocation();
  }, [loadLocation, refreshKey]);

  const goToNode = (id?: string) => {
    setSelectedLocationId(null);
    setNodeId(id);
  };

  if (locked) return <PlanUpgradeNotice feature="Hierarchy drill-down" description="Management KPIs, drill-down, benchmarking and certification are part of Advanced Analytics, which is not included in your organization's current plan." />;

  const breadcrumb = data?.breadcrumb || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Breadcrumb */}
      <Card noPadding>
        <nav aria-label="Hierarchy level" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', fontSize: '13px' }}>
          <button
            type="button"
            onClick={() => goToNode(undefined)}
            aria-current={nodeId ? undefined : 'location'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', font: 'inherit', color: nodeId ? 'var(--color-primary)' : 'var(--text-primary)', fontWeight: nodeId ? 500 : 600 }}
          >
            <Home size={16} aria-hidden="true" /> Whole organization
          </button>
          {breadcrumb.map((b, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <React.Fragment key={b.id}>
                <ChevronRight size={14} color="var(--text-tertiary)" aria-hidden="true" />
                <button
                  type="button"
                  aria-current={isLast ? 'location' : undefined}
                  onClick={() => !isLast && goToNode(b.id)}
                  disabled={isLast}
                  style={{ background: 'none', border: 'none', padding: '4px 0', font: 'inherit', cursor: isLast ? 'default' : 'pointer', color: isLast ? 'var(--text-primary)' : 'var(--color-primary)', fontWeight: isLast ? 600 : 500 }}
                >
                  {b.name}
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginLeft: '4px' }}>({nodeTypeLabel(b.nodeType)})</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>
      </Card>

      {loading || error || !data ? (
        <Card>
          <PanelStatus loading={loading} error={error || (!data ? 'No drill-down data returned.' : null)} onRetry={load} loadingText="Loading hierarchy..." />
        </Card>
      ) : (
        <>
          {/* Current node summary */}
          {data.node && (
            <SummaryGrid min={180}>
              <SummaryCard
                label={`${nodeTypeLabel(data.node.nodeType)} score`}
                value={fmtPct(data.node.score)}
                tone={scoreTone(data.node.score) ?? 'neutral'}
                hint={isNum(data.node.score) ? SCORE_BANDS.find((b) => (data.node?.score ?? 0) >= b.min)?.label : 'No audits yet'}
              />
              <SummaryCard label="Areas" value={data.node.locationCount} tone="neutral" />
              <SummaryCard label="Areas audited" value={data.node.auditedCount} tone="neutral" />
              <SummaryCard
                label="Open actions"
                value={data.node.openActions}
                tone={data.node.openActions > 0 ? 'warning' : 'neutral'}
              />
            </SummaryGrid>
          )}

          {/* Child nodes */}
          {(data.children.length > 0 || !data.node) && (
            <Card title="Organization units" subtitle="Score = average of each area's latest audit; open a unit to drill down" noPadding>
              {data.children.length === 0 ? (
                <EmptyState text="No organization units with areas found." />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="enterprise-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Type</th>
                        <th style={{ textAlign: 'center' }}>Score</th>
                        <th style={{ textAlign: 'center' }}>Areas audited</th>
                        <th style={{ textAlign: 'center' }}>Open actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.children.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <button type="button" onClick={() => goToNode(c.id)} style={{ ...linkButton(), display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {c.name} <ChevronRight size={14} aria-hidden="true" />
                            </button>
                            <div>
                              <span className="code-tag">{c.code}</span>
                            </div>
                          </td>
                          <td><Badge variant="neutral">{nodeTypeLabel(c.nodeType)}</Badge></td>
                          <td style={{ textAlign: 'center' }}><ScorePill score={c.score} /></td>
                          <td className="num" style={{ textAlign: 'center' }}>{c.auditedCount} / {c.locationCount}</td>
                          <td style={{ textAlign: 'center' }}>
                            {c.openActions > 0 ? <Badge variant="warning">{c.openActions}</Badge> : <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>0</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* Direct areas of this node */}
          {data.node && (
            <Card title={`Areas directly under ${data.node.name}`} subtitle="Open an area to see its audits and observations" noPadding>
              {data.locations.length === 0 ? (
                <EmptyState text="No areas are attached directly to this unit." />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="enterprise-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th>Area</th>
                        <th style={{ textAlign: 'center' }}>Latest score</th>
                        <th>Last audited</th>
                        <th style={{ textAlign: 'center' }}>Open actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.locations.map((l) => (
                        <tr key={l.id} style={{ background: selectedLocationId === l.id ? 'var(--color-primary-light)' : undefined }}>
                          <td>
                            <span className="code-tag">{l.areaCode}</span>
                            <div style={{ marginTop: '2px' }}>
                              <button type="button" aria-pressed={selectedLocationId === l.id} onClick={() => setSelectedLocationId(l.id)} style={linkButton()}>
                                {l.name}
                              </button>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}><ScorePill score={l.score} /></td>
                          <td style={{ fontSize: '13px', color: l.lastAuditDate ? 'var(--text-primary)' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            {l.lastAuditDate ? fmtDate(l.lastAuditDate) : 'Never audited'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {l.openCapaCount > 0 ? <Badge variant="warning">{l.openCapaCount}</Badge> : <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>0</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* Area → audits → observations */}
      {selectedLocationId && (
        <Card
          title={locationData ? `${locationData.location.name} — audits` : 'Area audits'}
          subtitle={locationData ? `${locationData.location.areaCode} · completed audits in the selected period` : undefined}
          actions={
            <div style={{ display: 'flex', gap: '6px' }}>
              <Button size="sm" variant="secondary" icon={<ExternalLink size={16} />} onClick={() => navigate(`/locations/${selectedLocationId}?tab=audit`)}>
                Area details
              </Button>
              <Button size="sm" variant="ghost" icon={<X size={16} />} onClick={() => setSelectedLocationId(null)} title="Close" aria-label="Close area audits" />
            </div>
          }
        >
          {locationLoading || locationError || !locationData ? (
            <PanelStatus loading={locationLoading} error={locationError || (!locationData ? 'No audit data returned.' : null)} onRetry={loadLocation} loadingText="Loading area audits..." />
          ) : locationData.audits.length === 0 ? (
            <EmptyState text="No completed audits for this area in the selected period." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {locationData.audits.map((a) => (
                <div key={a.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span className="code-tag">{a.auditCode}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {fmtDate(a.completedAt)} · by {a.auditorName || 'Unknown auditor'}
                      </span>
                      <Badge variant={auditStatusVariant(a.status)}>{auditStatusLabel(a.status)}</Badge>
                    </div>
                    <ScorePill score={a.overallScore} />
                  </div>
                  {a.observations.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>No observations raised.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                      {a.observations.map((o) => (
                        <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', flexWrap: 'wrap', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '6px 10px' }}>
                          <Badge variant={severityVariant(o.severity)}>{severityLabel(o.severity)}</Badge>
                          <Badge variant="neutral">{pillarLabel(o.category)}</Badge>
                          {o.isRepeat && <Badge variant="danger" icon={<Repeat size={11} />}>Repeat</Badge>}
                          <span className="code-tag">{o.observationCode}</span>
                          <span style={{ color: 'var(--text-primary)', flex: 1, minWidth: 'min(200px, 100%)' }}>{o.title}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '12.5px' }}>{observationStatusLabel(o.status)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

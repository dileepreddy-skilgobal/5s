import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '../../services/api';
import { areasApi } from '../../services/api-areas';
import { LocationStandard } from '../../types/areas';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { PILLARS, pillarLabel, pillarVariant } from '../../constants/labels';
import { useI18n } from '../../i18n';
import { BookOpen } from 'lucide-react';

const APPLIES_VIA_LABEL: Record<LocationStandard['appliesVia'], string> = {
  ORGANIZATION: 'Whole organization',
  ORG_UNIT: 'Organization unit',
  LOCATION: 'This location',
};

/** Approved standards in force at a location: organization-wide, through its organization units, or its own. */
export const LocationStandardsTab: React.FC<{ locationId: string }> = ({ locationId }) => {
  const { formatDate } = useI18n();
  const [standards, setStandards] = useState<LocationStandard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pillar, setPillar] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStandards(await areasApi.getStandardsForLocation(locationId));
    } catch (err) {
      setError(getApiErrorMessage(err, 'The standards for this location could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => standards.filter((s) => !pillar || s.category === pillar), [standards, pillar]);
  const pillarsPresent = PILLARS.filter((p) => standards.some((s) => s.category === p));

  return (
    <Card
      title="Standards"
      subtitle="Approved standards that apply here: organization-wide, set for one of its units, or written for this location."
      actions={<Link to="/standards" style={{ fontSize: '13px', fontWeight: 600 }}>Standards library</Link>}
    >
      {loading && standards.length === 0 ? (
        <LoadingState label="Loading standards…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : standards.length === 0 ? (
        <EmptyState icon={<BookOpen size={28} />} title="No approved standards apply here yet" description="Standards appear once they are approved and published for the organization, a unit above this location, or the location itself." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {pillarsPresent.length > 1 && (
            <div role="group" aria-label="Filter by pillar" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" className={`pillar-tab-pill${!pillar ? ' active' : ''}`} aria-pressed={!pillar} onClick={() => setPillar('')}>
                All ({standards.length})
              </button>
              {pillarsPresent.map((p) => (
                <button key={p} type="button" className={`pillar-tab-pill${pillar === p ? ' active' : ''}`} aria-pressed={pillar === p} onClick={() => setPillar(p)}>
                  {pillarLabel(p)} ({standards.filter((s) => s.category === p).length})
                </button>
              ))}
            </div>
          )}
          <ul className="grid-auto" style={{ ['--min' as string]: '260px', gap: '16px', listStyle: 'none', margin: 0, padding: 0 } as React.CSSProperties}>
            {shown.map((std) => {
              const rev = std.currentRevision;
              const photo = (rev.referencePhotos ?? []).find((p) => p.type === 'STANDARD_CONDITION' && p.photoUrl);
              return (
                <li key={std.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <ImageWithFallback src={photo?.photoUrl} alt={photo?.description || `Standard condition: ${std.title}`} containerStyle={{ height: '150px', borderRadius: 0, border: 'none' }} emptyText="No reference photo" />
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="code-tag">{std.code}</span>
                      <Badge variant={pillarVariant(std.category)}>{pillarLabel(std.category)}</Badge>
                    </div>
                    <Link to={`/standards/${std.id}`} style={{ fontWeight: 600, color: 'var(--color-primary)', overflowWrap: 'anywhere' }}>{std.title}</Link>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      Rev {rev.revisionNumber}
                      {rev.approvedAt ? ` · in force since ${formatDate(rev.approvedAt)}` : ''} · {rev.rules?.length ?? 0} rule{rev.rules?.length === 1 ? '' : 's'}
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>
                      Applies through: {APPLIES_VIA_LABEL[std.appliesVia]}
                      {std.appliesVia === 'ORG_UNIT' && std.targetOrgNode ? ` (${std.targetOrgNode.name})` : ''}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
};

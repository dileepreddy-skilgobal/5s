import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '../../services/api';
import { capaApi } from '../../services/api-capa';
import { useI18n } from '../../i18n';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/StateViews';
import { actionStatusLabel, BadgeVariant, humanize } from '../../constants/labels';
import { ACTION_SOURCE_LABELS, ActionSource, CapaRecord, CapaTimelineEntry, CapaTimelineKind } from '../../types/capa';
import { ArrowUpRight } from 'lucide-react';

const KIND_LABELS: Record<CapaTimelineKind, { label: string; variant: BadgeVariant }> = {
  CREATED: { label: 'Raised', variant: 'info' },
  STATUS_CHANGED: { label: 'Status changed', variant: 'neutral' },
  REASSIGNED: { label: 'Reassigned', variant: 'warning' },
  DUE_DATE_CHANGED: { label: 'Due date changed', variant: 'warning' },
  ANALYSIS_UPDATED: { label: 'Root cause updated', variant: 'neutral' },
  SUBMITTED: { label: 'Evidence submitted', variant: 'purple' },
  VERIFIED: { label: 'Verified', variant: 'success' },
  VERIFICATION_REJECTED: { label: 'Verification rejected', variant: 'danger' },
  CLOSED: { label: 'Closed', variant: 'success' },
  REOPENED: { label: 'Reopened', variant: 'danger' },
  ESCALATED: { label: 'Escalated', variant: 'danger' },
};

interface CapaTimelineModalProps {
  /** The action whose history is shown; the modal is open while it is set. */
  action: CapaRecord | null;
  onClose: () => void;
}

/** Everything that happened to an action, oldest first: who raised, reassigned, rescheduled, verified or reopened it. */
export const CapaTimelineModal: React.FC<CapaTimelineModalProps> = ({ action, onClose }) => {
  const { formatDate, formatDateTime } = useI18n();
  const [entries, setEntries] = useState<CapaTimelineEntry[]>([]);
  const [detail, setDetail] = useState<CapaRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!action) return;
    setLoading(true);
    setError(null);
    try {
      const [timeline, full] = await Promise.all([capaApi.timeline(action.id), capaApi.get(action.id)]);
      setEntries(timeline);
      setDetail(full);
    } catch (err) {
      setError(getApiErrorMessage(err, 'The history could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [action]);

  useEffect(() => {
    setEntries([]);
    setDetail(null);
    void load();
  }, [load]);

  const source = detail?.source ?? action?.source;
  const sourceText = source && source in ACTION_SOURCE_LABELS ? ACTION_SOURCE_LABELS[source as ActionSource] : humanize(source);

  return (
    <Modal
      isOpen={!!action}
      onClose={onClose}
      title={`History: ${action?.actionCode ?? ''}`}
      subtitle={action?.title}
      maxWidth="640px"
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? (
        <LoadingState label="Loading history…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <dl className="grid-auto" style={{ ['--min' as string]: '160px', gap: '12px', margin: 0, fontSize: '13px' } as React.CSSProperties}>
            <div>
              <dt style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Source</dt>
              <dd style={{ margin: 0 }}>{sourceText || '—'}</dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Finding</dt>
              <dd style={{ margin: 0 }}>
                {detail?.observation ? (
                  <Link to={`/observations?id=${detail.observation.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                    {detail.observation.observationCode}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            {detail?.redTag && (
              <div>
                <dt style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Red tag</dt>
                <dd style={{ margin: 0 }}>
                  <Link to={`/red-tags?id=${detail.redTag.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    {detail.redTag.tagNumber} <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                </dd>
              </div>
            )}
            <div>
              <dt style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Due</dt>
              <dd style={{ margin: 0 }}>{action ? formatDate(action.targetDate) : '—'}</dd>
            </div>
          </dl>

          {entries.length === 0 ? (
            <EmptyState title="No history yet" description="Steps taken on this action are recorded here." />
          ) : (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0' }}>
              {entries.map((e, i) => {
                const meta = KIND_LABELS[e.kind] ?? KIND_LABELS.STATUS_CHANGED;
                const statusMoved = e.fromStatus !== e.toStatus && e.kind !== 'CREATED';
                return (
                  <li
                    key={e.id}
                    style={{
                      position: 'relative',
                      padding: '0 0 16px 20px',
                      borderLeft: i === entries.length - 1 ? '2px solid transparent' : '2px solid var(--border-subtle)',
                      marginLeft: '6px',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ position: 'absolute', left: '-7px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--bg-surface)', border: '2px solid var(--color-primary)' }}
                    />
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                        {formatDateTime(e.at)}
                        {e.actorName ? ` · ${e.actorName}` : ''}
                      </span>
                    </div>
                    {statusMoved && (
                      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {actionStatusLabel(e.fromStatus)} → {actionStatusLabel(e.toStatus)}
                      </div>
                    )}
                    {e.kind === 'DUE_DATE_CHANGED' && e.fromTargetDate && e.toTargetDate && (
                      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {formatDate(e.fromTargetDate)} → {formatDate(e.toTargetDate)}
                      </div>
                    )}
                    {e.comment && (
                      <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{e.comment}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </Modal>
  );
};

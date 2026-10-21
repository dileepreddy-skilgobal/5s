import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../services/api';
import { observationsApi } from '../../services/observationsApi';
import { capaApi } from '../../services/api-capa';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { Observation } from '../../types';
import type { ObservationMedia, ObservationRecord } from '../../types/capa';
import { RaiseCapaModal, RaiseCapaOrigin } from '../capa/RaiseCapaModal';
import {
  actionStatusLabel,
  actionStatusVariant,
  BadgeVariant,
  observationStatusLabel,
  OBSERVATION_STATUS_LABELS,
  pillarLabel,
  PILLAR_LABELS,
  severityLabel,
  severityVariant,
  SEVERITY_LABELS,
} from '../../constants/labels';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { FormField } from '../../components/ui/FormField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { LoadingState, ErrorState } from '../../components/ui/StateViews';
import { ArrowUpRight, FileText, MapPin, Mic, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';

interface ObservationDetailModalProps {
  observationId: string | null;
  onClose: () => void;
  onChanged: (observation: Observation) => void;
  onDeleted: (id: string) => void;
}

const fullName = (u?: { firstName?: string; lastName?: string } | null) => (u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '');

export const formatSlaHours = (hours: number): string =>
  hours % 24 === 0 ? `${hours / 24} ${hours === 24 ? 'day' : 'days'}` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;

/** Badge colour for an observation status (the badge always carries the status label as text). */
export const observationStatusVariant = (code: string | null | undefined): BadgeVariant =>
  code === 'RESOLVED' || code === 'CLOSED'
    ? 'success'
    : code === 'PENDING_VERIFICATION'
    ? 'purple'
    : code === 'ACTION_ASSIGNED' || code === 'IN_PROGRESS'
    ? 'warning'
    : code === 'OPEN'
    ? 'info'
    : 'neutral';

const sectionTitle: React.CSSProperties = { fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px 0' };

export const ObservationDetailModal: React.FC<ObservationDetailModalProps> = ({ observationId, onClose, onChanged, onDeleted }) => {
  const { can, addToast } = useApp();
  const { formatDate, formatDateTime } = useI18n();
  const [observation, setObservation] = useState<ObservationRecord | null>(null);
  const [raiseOrigin, setRaiseOrigin] = useState<RaiseCapaOrigin | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [tried, setTried] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', severity: 'MODERATE', category: 'S1_SORT', status: 'OPEN', riskAssessment: '' });

  const load = useCallback(async () => {
    if (!observationId) return;
    setLoading(true);
    setError(null);
    try {
      const obs = await capaApi.getObservation(observationId);
      setObservation(obs);
    } catch (err) {
      setError(getApiErrorMessage(err, 'This observation could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [observationId]);

  useEffect(() => {
    setEditing(false);
    setTried(false);
    setConfirmDeleteOpen(false);
    setRaiseOrigin(null);
    setObservation(null);
    if (observationId) load();
  }, [observationId, load]);

  const startEdit = (obs: Observation) => {
    setForm({
      title: obs.title,
      description: obs.description ?? '',
      severity: obs.severity,
      category: obs.category,
      status: obs.status,
      riskAssessment: obs.riskAssessment ?? '',
    });
    setTried(false);
    setEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!observation || !form.title.trim() || !form.description.trim()) return;
    setSaving(true);
    try {
      const updated = await observationsApi.update(observation.id, {
        title: form.title.trim(),
        description: form.description.trim(),
        severity: form.severity,
        category: form.category,
        riskAssessment: form.riskAssessment.trim(),
        // The status of an observation with a corrective action follows that action
        ...(observation.correctiveAction ? {} : { status: form.status }),
      });
      setObservation((prev) => (prev ? { ...prev, ...updated } : updated));
      setEditing(false);
      onChanged(updated);
      addToast({ type: 'success', title: 'Observation updated', message: `${updated.observationCode} was saved.` });
    } catch (err) {
      addToast({ type: 'error', title: 'Not saved', message: getApiErrorMessage(err, 'The observation could not be saved.') });
    } finally {
      setSaving(false);
    }
  };

  // Runs only after the user confirms in the dialog
  const handleDelete = async () => {
    if (!observation) return;
    setDeleting(true);
    try {
      await api.deleteObservation(observation.id);
      addToast({ type: 'success', title: 'Observation deleted', message: `${observation.observationCode} was deleted.` });
      setConfirmDeleteOpen(false);
      onDeleted(observation.id);
    } catch (err) {
      setConfirmDeleteOpen(false);
      addToast({ type: 'error', title: 'Not deleted', message: getApiErrorMessage(err, 'The observation could not be deleted.') });
    } finally {
      setDeleting(false);
    }
  };

  const action = observation?.correctiveAction ?? null;
  const canEdit = can('OBSERVATION_MANAGERS');
  const canDelete = can('PROGRAM_MANAGERS');
  const canRaise = can('ACTION_ASSIGNERS') && !!observation && !action && !observation.hasDeletedAction;
  const media: ObservationMedia[] = Array.isArray(observation?.mediaUrls) ? observation.mediaUrls : [];
  const hasGps = typeof observation?.gpsLatitude === 'number' && typeof observation?.gpsLongitude === 'number';

  const openRaise = (obs: ObservationRecord) =>
    setRaiseOrigin({ kind: 'observation', observationId: obs.id, code: obs.observationCode, title: obs.title, description: obs.description, locationId: obs.locationId });

  const footer = observation ? (
    editing ? (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="observation-edit-form" loading={saving}>
          Save changes
        </Button>
      </div>
    ) : (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
        <div>
          {canDelete && (
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => setConfirmDeleteOpen(true)} loading={deleting}>
              Delete
            </Button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {canEdit && (
            <Button variant="primary" icon={<Pencil size={16} />} onClick={() => startEdit(observation)}>
              Edit
            </Button>
          )}
        </div>
      </div>
    )
  ) : undefined;

  const field = (label: string, value: React.ReactNode) => (
    <div style={{ minWidth: 0 }}>
      <dt style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{value}</dd>
    </div>
  );

  return (
    <>
      <Modal
        isOpen={observationId !== null}
        onClose={onClose}
        title={observation ? observation.observationCode : 'Observation'}
        subtitle={observation?.title}
        maxWidth="720px"
        footer={footer}
      >
        {loading ? (
          <LoadingState label="Loading observation…" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !observation ? null : editing ? (
          <form id="observation-edit-form" onSubmit={handleSave} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <FormField label="Title" required error={tried && !form.title.trim() ? 'Enter a title.' : undefined} style={{ margin: 0 }}>
              {(control) => <input {...control} className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
            </FormField>
            <FormField label="Description" required error={tried && !form.description.trim() ? 'Enter a description.' : undefined} style={{ margin: 0 }}>
              {(control) => (
                <textarea {...control} rows={3} className="form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              )}
            </FormField>
            <div className="grid-auto" style={{ ['--min' as string]: '180px', gap: '16px' } as React.CSSProperties}>
              <FormField label="Pillar" style={{ margin: 0 }}>
                {(control) => (
                  <select {...control} className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {Object.entries(PILLAR_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label="Severity" style={{ margin: 0 }}>
                {(control) => (
                  <select {...control} className="form-select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                    {Object.entries(SEVERITY_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label="Status" hint={action ? `Follows corrective action ${action.actionCode}.` : undefined} style={{ margin: 0 }}>
                {(control) => (
                  <select {...control} className="form-select" value={form.status} disabled={!!action} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(OBSERVATION_STATUS_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            </div>
            <FormField label="Risk assessment" style={{ margin: 0 }}>
              {(control) => <input {...control} className="form-input" value={form.riskAssessment} onChange={(e) => setForm({ ...form, riskAssessment: e.target.value })} />}
            </FormField>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <Badge variant={severityVariant(observation.severity)}>{severityLabel(observation.severity)}</Badge>
                <Badge variant={observationStatusVariant(observation.status)}>{observationStatusLabel(observation.status)}</Badge>
                <Badge variant="neutral">{pillarLabel(observation.category)}</Badge>
              </div>
              <ImageWithFallback
                src={observation.annotatedPhotoUrl || observation.beforePhotoUrl}
                alt={`Photo of ${observation.title}`}
                height="260px"
                allowZoom
                style={{ objectFit: 'contain' }}
              />
              <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {observation.description || '—'}
              </p>
              {observation.isRepeat && (
                <div role="note" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '13px', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)' }}>
                  <Badge variant="warning" icon={<Repeat size={11} />}>
                    Repeat
                  </Badge>
                  {observation.repeatOf ? (
                    <span style={{ overflowWrap: 'anywhere' }}>
                      Same issue as{' '}
                      <Link to={`/observations?id=${observation.repeatOf.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                        {observation.repeatOf.observationCode}
                      </Link>{' '}
                      ({formatDate(observation.repeatOf.createdAt)})
                    </span>
                  ) : (
                    <span>This issue was seen at this location before.</span>
                  )}
                </div>
              )}
            </section>

            {(media.length > 0 || observation.voiceNoteUrl || hasGps) && (
              <section aria-labelledby="obs-detail-evidence" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 id="obs-detail-evidence" style={{ ...sectionTitle, marginBottom: 0 }}>
                  Evidence
                </h3>
                {media.some((m) => m.kind === 'PHOTO') && (
                  <div className="grid-auto" style={{ ['--min' as string]: '140px', gap: '8px' } as React.CSSProperties}>
                    {media
                      .filter((m) => m.kind === 'PHOTO')
                      .map((m, i) => (
                        <ImageWithFallback key={`${m.url}-${i}`} src={m.url} alt={`Additional photo ${i + 1} of ${observation.title}`} height="120px" allowZoom />
                      ))}
                  </div>
                )}
                {media
                  .filter((m) => m.kind === 'VIDEO')
                  .map((m, i) => (
                    <video key={`${m.url}-${i}`} src={m.url} controls preload="metadata" aria-label={`Video ${i + 1} of ${observation.title}`} style={{ width: '100%', maxHeight: '280px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)' }} />
                  ))}
                {[...(observation.voiceNoteUrl ? [{ url: observation.voiceNoteUrl, label: 'Voice note' }] : []), ...media.filter((m) => m.kind === 'AUDIO').map((m, i) => ({ url: m.url, label: `Audio ${i + 1}` }))].map((a) => (
                  <div key={a.url} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Mic size={14} aria-hidden="true" /> {a.label}
                    </span>
                    <audio src={a.url} controls preload="metadata" aria-label={a.label} style={{ width: '100%' }} />
                  </div>
                ))}
                {media
                  .filter((m) => m.kind === 'DOCUMENT')
                  .map((m, i) => (
                    <a key={`${m.url}-${i}`} href={m.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, color: 'var(--color-primary)', minHeight: '40px' }}>
                      <FileText size={16} aria-hidden="true" /> Document {i + 1}
                    </a>
                  ))}
                {hasGps && (
                  <a
                    href={`https://www.google.com/maps?q=${observation.gpsLatitude},${observation.gpsLongitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, color: 'var(--color-primary)', minHeight: '40px', overflowWrap: 'anywhere' }}
                  >
                    <MapPin size={16} aria-hidden="true" />
                    Reported at {observation.gpsLatitude?.toFixed(5)}, {observation.gpsLongitude?.toFixed(5)}
                    {typeof observation.gpsAccuracyM === 'number' ? ` (±${Math.round(observation.gpsAccuracyM)} m)` : ''} — open map
                  </a>
                )}
              </section>
            )}

            <section aria-labelledby="obs-detail-details">
              <h3 id="obs-detail-details" style={sectionTitle}>
                Details
              </h3>
              <dl className="grid-auto" style={{ ['--min' as string]: '200px', gap: '16px', margin: 0 } as React.CSSProperties}>
                {field('Location', observation.location ? `${observation.location.name}${observation.location.areaCode ? ` (${observation.location.areaCode})` : ''}` : '—')}
                {field('Logged by', fullName(observation.loggedBy) || '—')}
                {field('Logged', formatDateTime(observation.createdAt))}
                {field('From audit', observation.execution?.auditCode || '—')}
                {field('Risk assessment', observation.riskAssessment || '—')}
              </dl>
            </section>

            <section
              aria-labelledby="obs-detail-action"
              style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)' }}
            >
              <h3 id="obs-detail-action" style={{ ...sectionTitle, marginBottom: '8px' }}>
                Corrective action
              </h3>
              {action ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="code-tag">{action.actionCode}</span>
                    <Badge variant={actionStatusVariant(action.status)}>{actionStatusLabel(action.status)}</Badge>
                  </div>
                  <div style={{ overflowWrap: 'anywhere', color: 'var(--text-primary)' }}>{action.title}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Assigned to {fullName(action.assignee) || 'nobody yet'} ·{' '}
                    {action.status === 'PENDING_ACKNOWLEDGEMENT'
                      ? action.slaHours
                        ? `due ${formatSlaHours(action.slaHours)} after audit sign-off`
                        : 'due date set at audit sign-off'
                      : action.targetDate
                      ? `due ${formatDate(action.targetDate)}`
                      : 'no due date'}
                  </div>
                  <Link
                    to={`/capa?id=${action.id}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, fontSize: '14px', color: 'var(--color-primary)', minHeight: '40px', alignSelf: 'flex-start' }}
                  >
                    Open corrective action <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {observation.hasDeletedAction
                      ? 'The corrective action raised for this observation was deleted.'
                      : 'No corrective action has been raised for this observation.'}
                  </div>
                  {canRaise && (
                    <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => openRaise(observation)}>
                      Raise corrective action
                    </Button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </Modal>

      <RaiseCapaModal
        isOpen={!!raiseOrigin}
        origin={raiseOrigin}
        onClose={() => setRaiseOrigin(null)}
        onCreated={async () => {
          setRaiseOrigin(null);
          if (!observationId) return;
          try {
            const refreshed = await capaApi.getObservation(observationId);
            setObservation(refreshed);
            onChanged(refreshed);
          } catch {
            void load();
          }
        }}
      />

      <ConfirmDialog
        isOpen={confirmDeleteOpen && observation !== null}
        title={observation ? `Delete ${observation.observationCode}?` : 'Delete observation?'}
        message="Its open corrective action is deleted with it."
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </>
  );
};

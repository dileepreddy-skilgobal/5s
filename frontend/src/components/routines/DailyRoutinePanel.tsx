import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Wrench, Plus, Trash2, History } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  api,
  getApiErrorMessage,
  FiveSCategory,
  RoutineDay,
  RoutineHistory,
  RoutineItemRow,
  RoutineKind,
  RoutineStatus,
} from '../../services/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { ErrorState, LoadingState } from '../ui/StateViews';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { PILLARS, pillarLabel } from '../../constants/labels';
import { useI18n } from '../../i18n';

/** A routine day key (YYYY-MM-DD, the organization's working day) as a local date, never shifted by UTC parsing. */
const dayKeyToDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** History rows include each day's item count (items in use that day); older servers only sent done / issues. */
type HistoryPart = { done: number; issues: number; total?: number };

const STATUS_OPTIONS: Record<RoutineKind, Array<{ value: RoutineStatus; label: string; failed: boolean }>> = {
  KAMISHIBAI: [
    { value: 'OK', label: 'OK', failed: false },
    { value: 'NOT_OK', label: 'Not OK', failed: true },
  ],
  SHADOW_TOOL: [
    { value: 'PRESENT', label: 'Present', failed: false },
    { value: 'MISSING', label: 'Missing', failed: true },
    { value: 'DAMAGED', label: 'Damaged', failed: true },
  ],
};

const statusBadge = (status: RoutineStatus) => {
  switch (status) {
    case 'OK':
      return <Badge variant="success">OK ✓</Badge>;
    case 'PRESENT':
      return <Badge variant="success">Present ✓</Badge>;
    case 'NOT_OK':
      return <Badge variant="danger">Not OK</Badge>;
    case 'MISSING':
      return <Badge variant="danger">Missing</Badge>;
    case 'DAMAGED':
      return <Badge variant="warning">Damaged</Badge>;
  }
};

interface DailyRoutinePanelProps {
  locationId: string;
  ownerId?: string | null;
  backupOwnerId?: string | null;
  /** Show the item set-up controls (add / retire / load standard checks). */
  manage?: boolean;
  /** Show the last 30 days of results. */
  showHistory?: boolean;
}

/**
 * Daily area routine for one location: the Kamishibai checks and shadow-board tools with today's
 * results. The area owner (or a supervisor) records each result; a failed check or a missing /
 * damaged tool can raise an observation, which then follows the normal corrective-action flow.
 */
export const DailyRoutinePanel: React.FC<DailyRoutinePanelProps> = ({ locationId, ownerId, backupOwnerId, manage = false, showHistory = false }) => {
  const { currentUser, addToast, can } = useApp();
  const { formatDate } = useI18n();
  const navigate = useNavigate();
  const [day, setDay] = useState<RoutineDay | null>(null);
  const [history, setHistory] = useState<RoutineHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  // A failed result is confirmed with an optional note and observation before it is saved
  const [pending, setPending] = useState<{ item: RoutineItemRow; status: RoutineStatus; note: string; raise: boolean } | null>(null);
  const [newItem, setNewItem] = useState<{ kind: RoutineKind; text: string; position: string; category: FiveSCategory }>({
    kind: 'KAMISHIBAI',
    text: '',
    position: '',
    category: 'S5_SUSTAIN',
  });
  const [saving, setSaving] = useState(false);
  // Item waiting for the removal confirmation
  const [retiring, setRetiring] = useState<RoutineItemRow | null>(null);
  const [retireBusy, setRetireBusy] = useState(false);

  const responsible = !!currentUser && (currentUser.id === ownerId || currentUser.id === backupOwnerId);
  // Mirrors the API: the AREA_MAINTAINERS role, and owners only on their own areas (supervisors on any)
  const canRecord = can('AREA_MAINTAINERS') && (responsible || can('LOCATION_EDITORS'));

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [d, h] = await Promise.all([api.getRoutineDay(locationId), showHistory ? api.getRoutineHistory(locationId, 30) : Promise.resolve(null)]);
      setDay(d);
      setHistory(h);
    } catch (e) {
      setLoadError(getApiErrorMessage(e, 'Could not load the daily routine.'));
    } finally {
      setLoading(false);
    }
  }, [locationId, showHistory]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshHistory = async () => {
    if (!showHistory) return;
    try {
      setHistory(await api.getRoutineHistory(locationId, 30));
    } catch {
      // The day itself was saved; the history table refreshes on the next load
    }
  };

  const save = async (item: RoutineItemRow, status: RoutineStatus, note?: string, raiseObservation?: boolean) => {
    try {
      setBusyItem(item.id);
      const updated = await api.recordRoutineCheck(locationId, { itemId: item.id, status, note: note || undefined, raiseObservation: raiseObservation || undefined });
      setDay(updated);
      setPending(null);
      if (raiseObservation) addToast({ type: 'success', title: 'Observation raised', message: 'The issue was logged and will follow the corrective-action flow.' });
      await refreshHistory();
    } catch (e) {
      addToast({ type: 'error', title: 'Not saved', message: getApiErrorMessage(e) });
    } finally {
      setBusyItem(null);
    }
  };

  const choose = (item: RoutineItemRow, option: { value: RoutineStatus; failed: boolean }) => {
    if (option.failed) setPending({ item, status: option.value, note: item.check?.note ?? '', raise: !item.check?.observationId });
    else save(item, option.value);
  };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newItem.text.trim().length < 3) return;
    try {
      setSaving(true);
      await api.addRoutineItem(locationId, {
        kind: newItem.kind,
        text: newItem.text.trim(),
        position: newItem.kind === 'SHADOW_TOOL' && newItem.position.trim() ? newItem.position.trim() : undefined,
        category: newItem.kind === 'SHADOW_TOOL' ? 'S2_SET_IN_ORDER' : newItem.category,
      });
      setNewItem((p) => ({ ...p, text: '', position: '' }));
      await load();
    } catch (err) {
      addToast({ type: 'error', title: 'Not added', message: getApiErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const loadDefaults = async () => {
    try {
      setSaving(true);
      await api.addDefaultRoutineItems(locationId);
      await load();
    } catch (err) {
      addToast({ type: 'error', title: 'Not added', message: getApiErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const retire = async () => {
    const item = retiring;
    if (!item) return;
    setRetireBusy(true);
    try {
      await api.retireRoutineItem(locationId, item.id);
      setRetiring(null);
      await load();
    } catch (err) {
      addToast({ type: 'error', title: 'Not removed', message: getApiErrorMessage(err) });
    } finally {
      setRetireBusy(false);
    }
  };

  const renderRow = (item: RoutineItemRow) => {
    const options = STATUS_OPTIONS[item.kind];
    const isPending = pending?.item.id === item.id;
    const failed = item.check && options.find((o) => o.value === item.check?.status)?.failed;
    return (
      <div
        key={item.id}
        style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          background: failed ? 'var(--color-danger-bg)' : item.check ? 'var(--color-success-bg)' : 'var(--bg-surface)',
          border: `1px solid ${failed ? 'var(--color-danger-border)' : item.check ? 'var(--color-success-border)' : 'var(--border-subtle)'}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 200px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{item.text}</div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {item.kind === 'SHADOW_TOOL' ? (item.position ? `Position ${item.position}` : 'Shadow board') : pillarLabel(item.category)}
              {item.check && ` · ${item.check.checkedBy ?? 'Recorded'} at ${formatDate(item.check.checkedAt, { hour: '2-digit', minute: '2-digit' })}`}
            </div>
            {item.check?.note && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>“{item.check.note}”</div>}
            {item.check?.observationId && (
              <button
                type="button"
                onClick={() => navigate(`/observations?id=${encodeURIComponent(item.check?.observationId ?? '')}`)}
                style={{ background: 'none', border: 'none', padding: 0, marginTop: '4px', fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                View the observation raised
              </button>
            )}
          </div>
          <div role="group" aria-label={`Result for ${item.text}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {canRecord && day?.isToday
              ? options.map((o) => (
                  <Button
                    key={o.value}
                    size="sm"
                    variant={item.check?.status === o.value ? (o.failed ? 'danger' : 'primary') : 'outline'}
                    disabled={busyItem === item.id}
                    onClick={() => choose(item, o)}
                    aria-pressed={item.check?.status === o.value}
                  >
                    {o.label}
                  </Button>
                ))
              : item.check
                ? statusBadge(item.check.status)
                : <Badge variant="neutral">Not checked</Badge>}
            {manage && canRecord && (
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setRetiring(item)} aria-label={`Remove ${item.text}`} />
            )}
          </div>
        </div>
        {isPending && pending && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
            <input
              className="form-input"
              aria-label={item.kind === 'SHADOW_TOOL' ? 'What happened to the tool (optional)' : 'What is wrong (optional)'}
              placeholder={item.kind === 'SHADOW_TOOL' ? 'What happened to the tool? (optional)' : 'What is wrong? (optional)'}
              maxLength={500}
              value={pending.note}
              onChange={(e) => setPending({ ...pending, note: e.target.value })}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={pending.raise}
                disabled={!!item.check?.observationId}
                onChange={(e) => setPending({ ...pending, raise: e.target.checked })}
              />
              {item.check?.observationId ? 'An observation was already raised for this today' : 'Raise an observation so it gets fixed'}
            </label>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button size="sm" variant="secondary" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="danger" loading={busyItem === item.id} onClick={() => save(item, pending.status, pending.note.trim(), pending.raise)}>
                Save {STATUS_OPTIONS[item.kind].find((o) => o.value === pending.status)?.label}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading && !day) {
    return (
      <Card title="Daily routine">
        <LoadingState compact label="Loading today's routine…" />
      </Card>
    );
  }
  if (loadError || !day) {
    return (
      <Card title="Daily routine">
        <ErrorState message={loadError ?? 'Could not load the daily routine.'} onRetry={load} />
      </Card>
    );
  }

  const section = (kind: RoutineKind) => {
    const rows = kind === 'KAMISHIBAI' ? day.kamishibai : day.tools;
    const s = kind === 'KAMISHIBAI' ? day.summary.kamishibai : day.summary.tools;
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    return (
      <Card
        title={kind === 'KAMISHIBAI' ? 'Daily checks (Kamishibai)' : 'Shadow-board tools'}
        subtitle={
          kind === 'KAMISHIBAI'
            ? `${day.location.name} · ${formatDate(dayKeyToDate(day.date))}${day.isToday ? ' (today)' : ''}`
            : 'Mark each tool present, missing or damaged'
        }
        actions={
          s.total > 0 ? (
            <Badge variant={s.issues > 0 ? 'danger' : s.done === s.total ? 'success' : 'neutral'}>
              {s.done}/{s.total} done{s.issues > 0 ? ` · ${s.issues} issue${s.issues === 1 ? '' : 's'}` : ''}
            </Badge>
          ) : undefined
        }
      >
        {/* Red only for real issues; partial progress is not a failure */}
        {s.total > 0 && (
          <ProgressBar
            value={pct}
            color={s.issues > 0 ? 'danger' : s.done === s.total ? 'success' : 'primary'}
            ariaLabel={`${kind === 'KAMISHIBAI' ? 'Checks' : 'Tools'} done today: ${s.done} of ${s.total}`}
          />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: s.total > 0 ? '16px' : 0 }}>
          {rows.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {kind === 'KAMISHIBAI' ? 'No daily checks are set up for this area yet.' : 'No shadow-board tools are registered for this area yet.'}
              {manage && canRecord && kind === 'KAMISHIBAI' && (
                <Button size="sm" variant="secondary" loading={saving} onClick={loadDefaults}>
                  Load 5 standard checks
                </Button>
              )}
              {!manage && canRecord && (
                <Button size="sm" variant="ghost" onClick={() => navigate(`/locations/${locationId}?tab=routine`)}>
                  Set up
                </Button>
              )}
            </div>
          ) : (
            rows.map(renderRow)
          )}
        </div>
      </Card>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {section('KAMISHIBAI')}
      {section('SHADOW_TOOL')}

      {manage && canRecord && (
        <Card title="Add to the routine" subtitle="Checks are answered once a day; tools are counted on the shadow board">
          <form onSubmit={addItem} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '1 1 170px', minWidth: 0, marginBottom: 0 }}>
              <label className="form-label" htmlFor={`routine-kind-${locationId}`}>Type</label>
              <select id={`routine-kind-${locationId}`} className="form-select" value={newItem.kind} onChange={(e) => setNewItem({ ...newItem, kind: e.target.value as RoutineKind })}>
                <option value="KAMISHIBAI">Daily check</option>
                <option value="SHADOW_TOOL">Shadow-board tool</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: '3 1 240px', minWidth: 0, marginBottom: 0 }}>
              <label className="form-label" htmlFor={`routine-text-${locationId}`}>{newItem.kind === 'KAMISHIBAI' ? 'Check (a yes/no question)' : 'Tool name'}</label>
              <input
                id={`routine-text-${locationId}`}
                className="form-input"
                required
                minLength={3}
                maxLength={200}
                placeholder={newItem.kind === 'KAMISHIBAI' ? 'e.g. Coolant tray is dry' : 'e.g. Torque wrench 20–100 Nm'}
                value={newItem.text}
                onChange={(e) => setNewItem({ ...newItem, text: e.target.value })}
              />
            </div>
            {newItem.kind === 'SHADOW_TOOL' ? (
              <div className="form-group" style={{ flex: '1 1 130px', minWidth: 0, marginBottom: 0 }}>
                <label className="form-label" htmlFor={`routine-position-${locationId}`}>Board position</label>
                <input id={`routine-position-${locationId}`} className="form-input" maxLength={60} placeholder="e.g. A3" value={newItem.position} onChange={(e) => setNewItem({ ...newItem, position: e.target.value })} />
              </div>
            ) : (
              <div className="form-group" style={{ flex: '1 1 170px', minWidth: 0, marginBottom: 0 }}>
                <label className="form-label" htmlFor={`routine-pillar-${locationId}`}>5S pillar</label>
                <select id={`routine-pillar-${locationId}`} className="form-select" value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value as FiveSCategory })}>
                  {PILLARS.map((c) => (
                    <option key={c} value={c}>
                      {pillarLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button type="submit" size="md" icon={<Plus size={16} />} loading={saving}>
              Add
            </Button>
          </form>
        </Card>
      )}

      {showHistory && history && (
        <Card title="Last 30 days" subtitle="Results recorded per day (checks and tools)" actions={<History size={16} aria-hidden="true" color="var(--text-tertiary)" />}>
          <div className="enterprise-table-container">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">
                    <ClipboardCheck size={14} aria-hidden="true" style={{ verticalAlign: 'middle' }} /> Checks done
                  </th>
                  <th className="num">
                    <Wrench size={14} aria-hidden="true" style={{ verticalAlign: 'middle' }} /> Tools counted
                  </th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody>
                {history.days.map((d) => {
                  const k: HistoryPart = d.kamishibai;
                  const t: HistoryPart = d.tools;
                  const issues = k.issues + t.issues;
                  const nothing = k.done + t.done === 0;
                  const of = (part: HistoryPart, current: number) => `${part.done}/${part.total ?? current}`;
                  return (
                    <tr key={d.date}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(dayKeyToDate(d.date))}</td>
                      <td className="num">{nothing ? '—' : of(k, history.currentItems.kamishibai)}</td>
                      <td className="num">{nothing ? '—' : of(t, history.currentItems.tools)}</td>
                      <td>{nothing ? <Badge variant="neutral">Not done</Badge> : issues > 0 ? <Badge variant="danger">{issues}</Badge> : <Badge variant="success">None</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        isOpen={retiring !== null}
        title="Remove from the daily routine?"
        message={<><strong>{retiring?.text}</strong> is no longer checked each day. Past results are kept.</>}
        confirmLabel="Remove"
        tone="danger"
        busy={retireBusy}
        onConfirm={retire}
        onCancel={() => setRetiring(null)}
      />
    </div>
  );
};

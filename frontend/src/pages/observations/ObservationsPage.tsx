import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../services/api';
import { observationsApi, ObservationSummary } from '../../services/observationsApi';
import { PercentAnnotation } from '../../services/auditExecutionApi';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { useCachedSettings, useTerminology } from '../../hooks/useTerminology';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { SummaryCard, SummaryGrid, SummaryTone } from '../../components/ui/SummaryCard';
import { FormField, SearchInput, FilterBar } from '../../components/ui/FormField';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/StateViews';
import { PhotoAnnotationModal } from '../../components/common/PhotoAnnotationModal';
import { DuplicateNotice, DuplicateChecking, useDuplicateCheck } from '../../components/common/DuplicateNotice';
import { Location, SettingsSeverity } from '../../types';
import type { ObservationRecord } from '../../types/capa';
import {
  observationStatusLabel,
  OBSERVATION_STATUS_LABELS,
  pillarLabel,
  PILLAR_LABELS,
  PILLARS,
  severityLabel,
  severityVariant,
  SEVERITY_LABELS,
  actionStatusLabel,
} from '../../constants/labels';
import { ObservationDetailModal, formatSlaHours, observationStatusVariant } from './ObservationDetailModal';
import { AlertTriangle, Sparkles, Plus, Camera, MapPin, CalendarDays, ShieldAlert, Layers, RefreshCw, Trash2, Repeat } from 'lucide-react';

const PAGE_SIZE = 24;
const SEARCH_DELAY_MS = 350;

const emptyForm = (locationId = '') => ({
  locationId,
  category: 'S1_SORT',
  severity: 'MODERATE',
  title: '',
  description: '',
  riskAssessment: '',
});

interface PhotoDraft {
  originalDataUrl: string;
  annotatedDataUrl: string;
  annotations: PercentAnnotation[];
}

const ellipsis: React.CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

export const ObservationsPage: React.FC = () => {
  const { addToast, can } = useApp();
  const { relabel } = useTerminology();
  const settings = useCachedSettings();
  const { formatDate, formatNumber } = useI18n();

  const [observations, setObservations] = useState<ObservationRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ObservationSummary | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);

  // Detail drawer; also opened by deep links (/observations?id=…) from search and notifications.
  // Links may also preset the filters (?status=&severity=&locationId=) or open the quick form (?new=1&locationId=).
  const [searchParams, setSearchParams] = useSearchParams();
  const detailId = searchParams.get('id');

  // Filters (applied by the server)
  const [selectedPillar, setSelectedPillar] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>(() => searchParams.get('severity') || 'ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>(() => searchParams.get('status') || 'ALL');
  const [selectedLocationId, setSelectedLocationId] = useState<string>(() => searchParams.get('locationId') || 'ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // New observation
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [newObs, setNewObs] = useState(emptyForm());
  const [photo, setPhoto] = useState<PhotoDraft | null>(null);
  const [annotationOpen, setAnnotationOpen] = useState<boolean>(false);
  const [creating, setCreating] = useState(false);
  const [createTried, setCreateTried] = useState(false);

  const openDetail = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('id', id);
    setSearchParams(next);
  };
  const closeDetail = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters = useCallback(
    () => ({
      category: selectedPillar !== 'ALL' ? selectedPillar : undefined,
      severity: selectedSeverity !== 'ALL' ? selectedSeverity : undefined,
      status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
      locationId: selectedLocationId !== 'ALL' ? selectedLocationId : undefined,
      search: search || undefined,
    }),
    [selectedPillar, selectedSeverity, selectedStatus, selectedLocationId, search],
  );

  const requestSeq = useRef(0);
  const loadFirstPage = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      // One extra row tells whether there is another page
      const page = await observationsApi.list({ ...filters(), limit: PAGE_SIZE + 1, offset: 0 });
      if (seq !== requestSeq.current) return;
      setObservations(page.slice(0, PAGE_SIZE));
      setHasMore(page.length > PAGE_SIZE);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(getApiErrorMessage(err, 'Observations could not be loaded.'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filters]);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await observationsApi.summary());
    } catch {
      // The counts are secondary; the list shows its own error
      setSummary(null);
    }
  }, []);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    loadSummary();
    api
      .getLocations()
      .then((locs) => {
        setLocations(locs);
        setNewObs((prev) => (prev.locationId ? prev : { ...prev, locationId: locs[0]?.id ?? '' }));
      })
      .catch((err) => addToast({ type: 'error', title: 'Locations not loaded', message: getApiErrorMessage(err, 'The location list could not be loaded.') }));
  }, [loadSummary, addToast]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await observationsApi.list({ ...filters(), limit: PAGE_SIZE + 1, offset: observations.length });
      setObservations((prev) => [...prev, ...page.slice(0, PAGE_SIZE)]);
      setHasMore(page.length > PAGE_SIZE);
    } catch (err) {
      addToast({ type: 'error', title: 'Could not load more', message: getApiErrorMessage(err, 'More observations could not be loaded.') });
    } finally {
      setLoadingMore(false);
    }
  };

  const refresh = () => {
    loadFirstPage();
    loadSummary();
  };

  // Advisory duplicate check while logging a new observation (never blocks submission)
  const dupTitle = newObs.title.trim();
  const duplicateCheck = useDuplicateCheck(
    createOpen && newObs.locationId && dupTitle.length >= 3 ? `${newObs.locationId}|${newObs.category}|${dupTitle.toLowerCase()}` : '',
    async () =>
      (await api.findDuplicateObservations({ locationId: newObs.locationId, title: dupTitle, category: newObs.category })).map((d) => ({
        id: d.id,
        code: d.observationCode,
        title: d.title,
        status: d.status,
        similarity: d.similarity,
        link: `/observations?id=${d.id}`,
      })),
  );

  const openCreate = (locationId?: string) => {
    setNewObs(emptyForm(locationId ?? locations[0]?.id ?? ''));
    setPhoto(null);
    setCreateTried(false);
    setCreateOpen(true);
  };

  // Quick report from an area page: /observations?new=1&locationId=<id> opens the form for that location
  const wantsQuickCreate = searchParams.get('new') === '1';
  const quickLocationId = searchParams.get('locationId');
  useEffect(() => {
    if (!wantsQuickCreate || locations.length === 0) return;
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
    if (!can('SHOPFLOOR_REPORTERS')) {
      addToast({ type: 'warning', title: 'Not available', message: 'Your role cannot log observations.' });
      return;
    }
    const known = quickLocationId && locations.some((l) => l.id === quickLocationId);
    openCreate(known ? quickLocationId : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsQuickCreate, locations]);

  const handleCreateObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateTried(true);
    if (!newObs.locationId || !newObs.title.trim() || !newObs.description.trim()) return;
    setCreating(true);
    try {
      const created = await observationsApi.create({
        locationId: newObs.locationId,
        category: newObs.category,
        severity: newObs.severity,
        title: newObs.title.trim(),
        description: newObs.description.trim(),
        riskAssessment: newObs.riskAssessment.trim() || undefined,
        // No photo means no photo: nothing is substituted
        beforePhotoUrl: photo?.originalDataUrl,
        annotatedPhotoUrl: photo && photo.annotations.length ? photo.annotatedDataUrl : undefined,
        annotationData: photo?.annotations.length ? photo.annotations : undefined,
      });
      setCreateOpen(false);
      setPhoto(null);
      addToast({ type: 'success', title: 'Observation logged', message: `${created.observationCode} was added to the register.` });
      refresh();
    } catch (err) {
      addToast({ type: 'error', title: 'Observation not logged', message: getApiErrorMessage(err, 'The observation could not be saved.') });
    } finally {
      setCreating(false);
    }
  };

  const slaHint = (severity: string): string | null => {
    const hours = settings?.sla.hoursBySeverity[severity as SettingsSeverity];
    return hours ? `If a corrective action is raised, it is due ${formatSlaHours(hours)} after it is assigned.` : null;
  };

  const actionDue = (obs: ObservationRecord): string | null => {
    const action = obs.correctiveAction;
    if (!action) return null;
    if (action.status === 'PENDING_ACKNOWLEDGEMENT') return action.slaHours ? `Due ${formatSlaHours(action.slaHours)} after sign-off` : null;
    return action.targetDate ? `Due ${formatDate(action.targetDate)}` : null;
  };

  const kpis: Array<{ label: string; value: number | undefined; icon: React.ReactNode; tone: SummaryTone; hint: string }> = [
    { label: 'Total', value: summary?.total, icon: <AlertTriangle size={18} />, tone: 'primary', hint: 'All logged observations' },
    { label: 'Critical', value: summary?.critical, icon: <ShieldAlert size={18} />, tone: 'danger', hint: 'Critical severity' },
    { label: 'Not yet resolved', value: summary?.open, icon: <Layers size={18} />, tone: 'warning', hint: 'Still open or being worked on' },
    { label: 'Kaizen ideas', value: summary?.kaizen, icon: <Sparkles size={18} />, tone: 'purple', hint: 'Improvement opportunities' },
  ];

  const filtersActive = selectedPillar !== 'ALL' || selectedSeverity !== 'ALL' || selectedStatus !== 'ALL' || selectedLocationId !== 'ALL' || !!search;
  const severityHint = slaHint(newObs.severity);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title={relabel('Observations')}
        description="Problems, hazards and improvement ideas found on the shop floor."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={refresh}>
              Refresh
            </Button>
            {can('SHOPFLOOR_REPORTERS') && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => openCreate()}>
                {relabel('Log observation')}
              </Button>
            )}
          </>
        }
      />

      <SummaryGrid min={200}>
        {kpis.map((k) => (
          <SummaryCard key={k.label} label={k.label} value={k.value === undefined ? '—' : formatNumber(k.value)} icon={k.icon} tone={k.tone} hint={k.hint} />
        ))}
      </SummaryGrid>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div role="group" aria-label="Filter by pillar" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[{ key: 'ALL', label: 'All pillars' }, ...PILLARS.map((p) => ({ key: p, label: PILLAR_LABELS[p] }))].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className="pillar-tab-pill"
              aria-pressed={selectedPillar === tab.key}
              onClick={() => setSelectedPillar(tab.key)}
              style={{ minHeight: '40px', flexShrink: 0 }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <FilterBar label="Filter observations">
          <SearchInput label="Search observations" placeholder="Search code, title, description or location" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          <select aria-label="Severity" className="form-select" value={selectedSeverity} onChange={(e) => setSelectedSeverity(e.target.value)}>
            <option value="ALL">All severities</option>
            {Object.entries(SEVERITY_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <select aria-label="Status" className="form-select" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
            <option value="ALL">All statuses</option>
            {Object.entries(OBSERVATION_STATUS_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <select aria-label="Location" className="form-select" value={selectedLocationId} onChange={(e) => setSelectedLocationId(e.target.value)}>
            <option value="ALL">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.areaCode} — {l.name}
              </option>
            ))}
          </select>
        </FilterBar>
      </div>

      {loading ? (
        <LoadingState label="Loading observations…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadFirstPage} />
      ) : observations.length === 0 ? (
        <EmptyState
          title={filtersActive ? 'No observations match these filters' : 'No observations yet'}
          description={filtersActive ? 'Change or clear the filters to see more.' : 'Observations logged on the shop floor or raised by audits appear here.'}
        />
      ) : (
        <>
          <ul className="grid-auto" style={{ ['--min' as string]: '300px', gap: '16px', listStyle: 'none', margin: 0, padding: 0 } as React.CSSProperties}>
            {observations.map((obs) => {
              const due = actionDue(obs);
              return (
                <li key={obs.id} id={`observation-${obs.id}`} style={{ minWidth: 0 }}>
                  <Card noPadding style={{ height: '100%', ...(obs.id === detailId ? { outline: '2px solid var(--color-primary)', outlineOffset: '2px' } : {}) }}>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <ImageWithFallback
                        src={obs.annotatedPhotoUrl || obs.beforePhotoUrl}
                        height="170px"
                        alt={`Photo of ${obs.title}`}
                        containerStyle={{ borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border-subtle)' }}
                      />
                      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span className="code-tag" style={ellipsis} title={obs.observationCode}>
                            {obs.observationCode}
                          </span>
                          <Badge variant={observationStatusVariant(obs.status)}>{observationStatusLabel(obs.status)}</Badge>
                        </div>
                        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, lineHeight: 1.35, minWidth: 0 }}>
                          <button
                            type="button"
                            onClick={() => openDetail(obs.id)}
                            title={obs.title}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              textAlign: 'left',
                              color: 'var(--text-primary)',
                              font: 'inherit',
                              cursor: 'pointer',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {obs.title}
                          </button>
                        </h2>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <Badge variant={severityVariant(obs.severity)}>{severityLabel(obs.severity)}</Badge>
                          <Badge variant="neutral">{pillarLabel(obs.category)}</Badge>
                          {obs.isRepeat && (
                            <Badge variant="warning" icon={<Repeat size={11} />}>
                              Repeat
                            </Badge>
                          )}
                        </div>
                        <p
                          style={{
                            fontSize: '13px',
                            color: 'var(--text-secondary)',
                            margin: 0,
                            lineHeight: 1.45,
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {obs.description}
                        </p>
                        <div
                          style={{
                            marginTop: 'auto',
                            paddingTop: '12px',
                            borderTop: '1px solid var(--border-subtle)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            fontSize: '12.5px',
                            color: 'var(--text-secondary)',
                            minWidth: 0,
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <MapPin size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                            <span style={ellipsis} title={obs.location?.name || undefined}>
                              {obs.location?.name || '—'}
                            </span>
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CalendarDays size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                            Logged {formatDate(obs.createdAt)}
                          </span>
                          {obs.correctiveAction && (
                            <span style={{ overflowWrap: 'anywhere' }}>
                              Action {obs.correctiveAction.actionCode}: {actionStatusLabel(obs.correctiveAction.status)}
                              {due ? ` · ${due}` : ''}
                            </span>
                          )}
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => openDetail(obs.id)} aria-label={`View ${obs.observationCode}`} style={{ width: '100%' }}>
                          View details
                        </Button>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={relabel('Log observation')}
        subtitle="Record a problem, hazard or improvement idea."
        maxWidth="640px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-observation-form" variant="primary" icon={<Plus size={16} />} loading={creating}>
              {relabel('Log observation')}
            </Button>
          </div>
        }
      >
        <form id="create-observation-form" onSubmit={handleCreateObservation} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormField label="Location" required error={createTried && !newObs.locationId ? 'Choose a location.' : undefined} style={{ margin: 0 }}>
            {(control) => (
              <select {...control} className="form-select" value={newObs.locationId} onChange={(e) => setNewObs({ ...newObs, locationId: e.target.value })}>
                {locations.length === 0 && <option value="">No locations available</option>}
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.areaCode} — {l.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <div className="grid-auto" style={{ ['--min' as string]: '200px', gap: '16px' } as React.CSSProperties}>
            <FormField label="Pillar" required style={{ margin: 0 }}>
              {(control) => (
                <select {...control} className="form-select" value={newObs.category} onChange={(e) => setNewObs({ ...newObs, category: e.target.value })}>
                  {PILLARS.map((p) => (
                    <option key={p} value={p}>
                      {PILLAR_LABELS[p]}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="Severity" required hint={severityHint ?? undefined} style={{ margin: 0 }}>
              {(control) => (
                <select {...control} className="form-select" value={newObs.severity} onChange={(e) => setNewObs({ ...newObs, severity: e.target.value })}>
                  {Object.entries(SEVERITY_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>

          <FormField label="Title" required error={createTried && !newObs.title.trim() ? 'Enter a title.' : undefined} style={{ margin: 0 }}>
            {(control) => (
              <input
                {...control}
                type="text"
                className="form-input"
                placeholder="e.g. Broken fixture left next to the conveyor"
                value={newObs.title}
                onChange={(e) => setNewObs({ ...newObs, title: e.target.value })}
              />
            )}
          </FormField>

          <DuplicateChecking active={duplicateCheck.loading} />
          <DuplicateNotice matches={duplicateCheck.matches} description="open observations at this location" />

          <FormField label="Description" required error={createTried && !newObs.description.trim() ? 'Enter a description.' : undefined} style={{ margin: 0 }}>
            {(control) => (
              <textarea
                {...control}
                rows={3}
                className="form-textarea"
                placeholder="What did you see, and exactly where?"
                value={newObs.description}
                onChange={(e) => setNewObs({ ...newObs, description: e.target.value })}
              />
            )}
          </FormField>

          <FormField label="Risk assessment" style={{ margin: 0 }}>
            {(control) => (
              <input
                {...control}
                type="text"
                className="form-input"
                placeholder="e.g. Trip hazard for operators on the night shift"
                value={newObs.riskAssessment}
                onChange={(e) => setNewObs({ ...newObs, riskAssessment: e.target.value })}
              />
            )}
          </FormField>

          <div>
            <div className="form-label">Photo</div>
            {photo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <ImageWithFallback src={photo.annotatedDataUrl} height="180px" alt="Photo to attach to the observation" style={{ objectFit: 'contain' }} />
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button type="button" variant="secondary" size="sm" icon={<Camera size={16} />} onClick={() => setAnnotationOpen(true)}>
                    Replace photo
                  </Button>
                  <Button type="button" variant="ghost" size="sm" icon={<Trash2 size={16} />} onClick={() => setPhoto(null)}>
                    Remove photo
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" icon={<Camera size={16} />} onClick={() => setAnnotationOpen(true)}>
                Add photo
              </Button>
            )}
          </div>
        </form>
      </Modal>

      <PhotoAnnotationModal
        isOpen={annotationOpen}
        onClose={() => setAnnotationOpen(false)}
        title="Observation photo"
        onSave={(_url, _shapes, result) => setPhoto({ originalDataUrl: result.originalDataUrl, annotatedDataUrl: result.annotatedDataUrl, annotations: result.annotations })}
      />

      <ObservationDetailModal
        observationId={detailId}
        onClose={closeDetail}
        onChanged={(updated) => {
          setObservations((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
          loadSummary();
        }}
        onDeleted={(id) => {
          setObservations((prev) => prev.filter((o) => o.id !== id));
          closeDetail();
          loadSummary();
        }}
      />
    </div>
  );
};

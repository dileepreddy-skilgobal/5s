import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api, getApiErrorMessage, FiveSCategory, LocationEvidenceItem, LocationScorecard } from '../../services/api';
import { Location, LocationTimeline, LocationDocument, AuditExecution, CorrectiveAction, Observation, OrgNode, User as UserRecord } from '../../types';
import { AuditReportModal } from '../../components/common/AuditReportModal';
import { DailyRoutinePanel } from '../../components/routines/DailyRoutinePanel';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SearchInput } from '../../components/ui/FormField';
import { QrCodeImage } from '../../components/common/QrCodeImage';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs, TabItem } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import {
  BadgeVariant,
  DOCUMENT_TYPE_LABELS,
  PILLARS,
  actionStatusLabel,
  actionStatusVariant,
  auditStatusLabel,
  auditStatusVariant,
  documentTypeLabel,
  frequencyLabel,
  humanize,
  locationStatusLabel,
  locationTypeLabel,
  pillarLabel,
  pillarVariant,
  riskLabel,
  riskVariant,
  severityLabel,
  severityVariant,
} from '../../constants/labels';
import { useI18n } from '../../i18n';
import { LocationFormModal, fieldErrorStyle } from './LocationFormModal';
import { LocationStandardsTab } from './LocationStandardsTab';
import {
  QrCode,
  Calendar,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Package,
  Activity,
  Plus,
  Edit2,
  Trash2,
  Upload,
  Camera,
  Printer,
  Sparkles,
  TrendingUp,
  PlusCircle,
  FileSpreadsheet,
  Edit3,
  BookOpen,
  Tag,
} from 'lucide-react';

type TimelineStatus = LocationTimeline['status'];
type DocType = LocationDocument['docType'];

const TIMELINE_STATUS_LABELS: Record<TimelineStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  DELAYED: 'Delayed',
};
const timelineStatusLabel = (s: string | undefined) => (s && s in TIMELINE_STATUS_LABELS ? TIMELINE_STATUS_LABELS[s as TimelineStatus] : humanize(s));
const timelineStatusVariant = (s: string | undefined): BadgeVariant =>
  s === 'COMPLETED' ? 'success' : s === 'IN_PROGRESS' ? 'info' : s === 'DELAYED' ? 'danger' : 'neutral';

/** Today (or today + n days) as YYYY-MM-DD from local getters, so the date never shifts by the UTC offset. */
const localDayKey = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayKeyOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Local midnight of a YYYY-MM-DD date input, as an ISO timestamp. */
const dayKeyToIso = (key: string) => new Date(`${key}T00:00:00`).toISOString();

const pct = (n: number) => `${Math.round(n)}%`;

/** Event types in the location's activity history and how they are grouped by the filter. */
const ACTIVITY_GROUPS = {
  MILESTONES: ['TIMELINE_UPDATED'],
  DETAILS: ['CREATED', 'UPDATED', 'STATUS_CHANGED', 'EXCEL_IMPORTED', 'QR_REGENERATED'],
  FILES: ['DOCUMENT_ADDED', 'DOCUMENT_REMOVED', 'EVIDENCE_ADDED', 'EVIDENCE_REMOVED'],
} as const;
type ActivityFilter = 'ALL' | keyof typeof ACTIVITY_GROUPS;

const ACTIVITY_META: Record<string, { label: string; variant: BadgeVariant; icon: React.ReactNode }> = {
  TIMELINE_UPDATED: { label: 'Milestone updated', variant: 'purple', icon: <TrendingUp size={14} /> },
  CREATED: { label: 'Location created', variant: 'success', icon: <PlusCircle size={14} /> },
  UPDATED: { label: 'Details changed', variant: 'neutral', icon: <Edit3 size={14} /> },
  STATUS_CHANGED: { label: 'Status changed', variant: 'warning', icon: <Edit3 size={14} /> },
  EXCEL_IMPORTED: { label: 'Imported from spreadsheet', variant: 'neutral', icon: <FileSpreadsheet size={14} /> },
  DOCUMENT_ADDED: { label: 'Document attached', variant: 'info', icon: <FileText size={14} /> },
  DOCUMENT_REMOVED: { label: 'Document removed', variant: 'neutral', icon: <FileText size={14} /> },
  EVIDENCE_ADDED: { label: 'Before / after photos added', variant: 'success', icon: <Camera size={14} /> },
  EVIDENCE_REMOVED: { label: 'Before / after photos removed', variant: 'neutral', icon: <Camera size={14} /> },
};
const activityMeta = (type: string) => ACTIVITY_META[type] ?? { label: humanize(type), variant: 'neutral' as BadgeVariant, icon: <Activity size={14} /> };

const TONE: Record<BadgeVariant, { bg: string; fg: string }> = {
  success: { bg: 'var(--color-success-bg)', fg: 'var(--color-success)' },
  info: { bg: 'var(--color-info-bg)', fg: 'var(--color-info)' },
  warning: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning)' },
  danger: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger)' },
  purple: { bg: 'var(--color-purple-bg)', fg: 'var(--color-purple)' },
  neutral: { bg: 'var(--bg-surface-subtle)', fg: 'var(--text-secondary)' },
};

/** Field names in "details changed" events. References and photos are summarised instead of showing raw ids. */
const CHANGE_LABELS: Record<string, { label: string; format?: (v: unknown) => string }> = {
  name: { label: 'Name' },
  locationType: { label: 'Type', format: (v) => locationTypeLabel(String(v)) },
  riskLevel: { label: 'Risk', format: (v) => riskLabel(String(v)) },
  auditFrequency: { label: 'Audit frequency', format: (v) => frequencyLabel(String(v)) },
  status: { label: 'Status', format: (v) => locationStatusLabel(String(v)) },
  building: { label: 'Building' },
  floor: { label: 'Floor' },
  description: { label: 'Description' },
  ownerId: { label: 'Owner', format: (v) => (v ? 'changed' : 'removed') },
  backupOwnerId: { label: 'Backup owner', format: (v) => (v ? 'changed' : 'removed') },
  orgNodeId: { label: 'Unit', format: () => 'changed' },
  heroPhotoUrl: { label: 'Baseline photo', format: (v) => (v ? 'changed' : 'removed') },
};

const chipStyle: React.CSSProperties = { fontSize: '12px', background: 'var(--bg-surface-subtle)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' };

const ActivityDetails: React.FC<{ details: string }> = ({ details }) => {
  let parsed: Record<string, unknown> | null = null;
  if (details && details.startsWith('{')) {
    try {
      parsed = JSON.parse(details) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  }
  if (!parsed) return <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>{details}</div>;

  if (parsed.action === 'Updated milestone progress') {
    const progress = typeof parsed.progressPercent === 'number' ? parsed.progressPercent : null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
          {progress != null ? <>Progress set to <strong>{progress}%</strong></> : 'Milestone changed'}
        </div>
        {(progress != null || parsed.status) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {progress != null && (
              <div style={{ width: '140px' }}>
                <ProgressBar value={progress} height={6} ariaLabel={`Progress ${progress}%`} />
              </div>
            )}
            {typeof parsed.status === 'string' && <Badge variant={timelineStatusVariant(parsed.status)}>{timelineStatusLabel(parsed.status)}</Badge>}
          </div>
        )}
      </div>
    );
  }
  if (parsed.action === 'Added milestone') {
    return <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Added milestone <strong>{String(parsed.milestone ?? '')}</strong></div>;
  }
  if (parsed.action === 'Created area master' || parsed.action === 'Created with organization unit') {
    return (
      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
        Created <strong>{String(parsed.name ?? '')}</strong> (<code>{String(parsed.areaCode ?? '')}</code>)
      </div>
    );
  }
  if (parsed.action === 'Updated area master details' && parsed.changes && typeof parsed.changes === 'object') {
    const entries = Object.entries(parsed.changes as Record<string, unknown>);
    return (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {entries.map(([k, v]) => {
          const meta = CHANGE_LABELS[k];
          const value = meta?.format ? meta.format(v) : v === '' || v === null || v === undefined ? '(empty)' : String(v);
          return (
            <span key={k} style={chipStyle}>
              <strong>{meta?.label ?? humanize(k)}:</strong> {value}
            </span>
          );
        })}
      </div>
    );
  }
  if (typeof parsed.title === 'string') {
    return (
      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
        <strong>{parsed.title}</strong>
        {typeof parsed.docType === 'string' ? ` · ${documentTypeLabel(parsed.docType)}` : ''}
      </div>
    );
  }
  if (typeof parsed.category === 'string') {
    return <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{pillarLabel(parsed.category)}</div>;
  }
  if (typeof parsed.action === 'string') {
    return <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{parsed.action}</div>;
  }
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {Object.entries(parsed).map(([k, v]) => (
        <span key={k} style={chipStyle}>
          <strong>{humanize(k)}:</strong> {String(v)}
        </span>
      ))}
    </div>
  );
};

interface MilestoneForm {
  id: string | null;
  name: string;
  start: string;
  end: string;
  progress: number;
  status: TimelineStatus;
  notes: string;
}

const newMilestoneForm = (): MilestoneForm => ({ id: null, name: '', start: localDayKey(), end: localDayKey(14), progress: 0, status: 'NOT_STARTED', notes: '' });

interface DocForm {
  title: string;
  docType: DocType;
  version: string;
  /** An uploaded file (sent as a data URL and stored by the API) or a link to an existing document. */
  fileUrl: string;
  fileName: string;
  link: string;
}

const newDocForm = (): DocForm => ({ title: '', docType: 'SOP', version: '1.0', fileUrl: '', fileName: '', link: '' });

const isStoredFile = (url: string) => url.includes('/api/v1/files/');

export const LocationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTenant, currentUser, addToast, can } = useApp();
  const { formatDate, formatDateTime } = useI18n();

  const [location, setLocation] = useState<Location | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // `?tab=routine` (e.g. from the area-owner dashboard) opens a specific tab; the URL follows the tab shown
  const [activeTab, setActiveTab] = useState<string>(searchParams.get('tab') || 'overview');
  const urlTab = searchParams.get('tab');
  useEffect(() => {
    if (urlTab) setActiveTab(urlTab);
  }, [urlTab]);
  const selectTab = (tab: string) => {
    setActiveTab(tab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === 'overview') next.delete('tab');
        else next.set('tab', tab);
        return next;
      },
      { replace: true },
    );
  };
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modals
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [uploadEvidenceModalOpen, setUploadEvidenceModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [auditExecutions, setAuditExecutions] = useState<AuditExecution[]>([]);
  const [auditsError, setAuditsError] = useState<string | null>(null);

  // Edit / delete the location itself
  const [editOpen, setEditOpen] = useState(false);
  const [editRefs, setEditRefs] = useState<{ orgNodes: OrgNode[]; users: UserRecord[] } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 5S Evidence Gallery: uploaded before/after pairs and closed corrective actions with photos (server)
  const [evidenceList, setEvidenceList] = useState<LocationEvidenceItem[]>([]);
  // Real scores, maturity band, pillar breakdown and open work for this area
  const [scorecard, setScorecard] = useState<LocationScorecard | null>(null);
  const [locationActions, setLocationActions] = useState<CorrectiveAction[]>([]);
  const [openObservations, setOpenObservations] = useState<Observation[]>([]);
  const [insightErrors, setInsightErrors] = useState<{ scorecard?: string; evidence?: string; work?: string }>({});
  const [savingEvidence, setSavingEvidence] = useState(false);
  // Before / after record waiting for the removal confirmation
  const [removeEvidenceId, setRemoveEvidenceId] = useState<string | null>(null);
  const [removingEvidence, setRemovingEvidence] = useState(false);

  // Evidence Form State (both photos must be uploaded from the device)
  const [evidenceCategory, setEvidenceCategory] = useState<FiveSCategory>('S1_SORT');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [evidenceBeforePhoto, setEvidenceBeforePhoto] = useState('');
  const [evidenceAfterPhoto, setEvidenceAfterPhoto] = useState('');
  const [evidenceAfterLabel, setEvidenceAfterLabel] = useState('');
  const [evidenceErrors, setEvidenceErrors] = useState<Partial<Record<'description' | 'photos' | 'form', string>>>({});

  // Milestones
  const [milestoneForm, setMilestoneForm] = useState<MilestoneForm | null>(null);
  const [milestoneErrors, setMilestoneErrors] = useState<Partial<Record<'name' | 'end' | 'form', string>>>({});
  const [savingMilestone, setSavingMilestone] = useState(false);
  const [deleteMilestone, setDeleteMilestone] = useState<LocationTimeline | null>(null);

  // Documents
  const [docForm, setDocForm] = useState<DocForm | null>(null);
  const [docErrors, setDocErrors] = useState<Partial<Record<'title' | 'file' | 'form', string>>>({});
  const [savingDoc, setSavingDoc] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<LocationDocument | null>(null);
  const [removingDoc, setRemovingDoc] = useState(false);

  // Activity history filtering
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('ALL');
  const [activitySearch, setActivitySearch] = useState('');

  /** Scorecard, evidence and open work load independently; a failed part shows its own error. */
  const loadInsights = useCallback(async (locationId: string) => {
    const errors: { scorecard?: string; evidence?: string; work?: string } = {};
    const [card, evidence, work] = await Promise.all([
      api.getLocationScorecard(locationId).catch((e) => {
        errors.scorecard = getApiErrorMessage(e, 'The scorecard could not be loaded.');
        return null;
      }),
      api.getLocationEvidence(locationId).catch((e) => {
        errors.evidence = getApiErrorMessage(e, 'The photo evidence could not be loaded.');
        return [] as LocationEvidenceItem[];
      }),
      Promise.all([api.getCorrectiveActions({ locationId }), api.getObservations({ locationId, status: 'OPEN' })]).catch((e) => {
        errors.work = getApiErrorMessage(e, 'The open work could not be loaded.');
        return [[], []] as [CorrectiveAction[], Observation[]];
      }),
    ]);
    setScorecard(card);
    setEvidenceList(evidence);
    setLocationActions(work[0].filter((a) => !['VERIFIED', 'CLOSED'].includes(a.status)));
    setOpenObservations(work[1].filter((o) => !o.correctiveAction));
    setInsightErrors(errors);
  }, []);

  const loadAudits = useCallback(async (locationId: string) => {
    try {
      setAuditExecutions((await api.getAuditExecutions({ locationId })) || []);
      setAuditsError(null);
    } catch (e) {
      setAuditsError(getApiErrorMessage(e, 'The audits could not be loaded.'));
    }
  }, []);

  const reloadLocation = useCallback(async () => {
    if (!id) return;
    setLocation(await api.getLocationById(id));
  }, [id]);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      setLocation(await api.getLocationById(id));
      await Promise.all([loadInsights(id), loadAudits(id)]);
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'This location could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [id, loadInsights, loadAudits]);

  useEffect(() => {
    loadAll();
  }, [loadAll, currentTenant]);

  const openEdit = async () => {
    setEditOpen(true);
    if (editRefs) return;
    try {
      const [orgNodes, users] = await Promise.all([api.getOrgNodes(), api.getUsers()]);
      setEditRefs({ orgNodes, users });
    } catch (err) {
      setEditOpen(false);
      addToast({ type: 'error', title: 'Cannot edit right now', message: getApiErrorMessage(err, 'The organization units and users could not be loaded.') });
    }
  };

  const handleDeleteLocation = async () => {
    if (!location) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteLocation(location.id);
      addToast({ type: 'success', title: 'Location deleted', message: `${location.name} was deleted. Its history is kept.` });
      navigate('/locations');
    } catch (err) {
      // The server lists the open work that blocks deletion
      setDeleteError(getApiErrorMessage(err, 'The location could not be deleted.'));
    } finally {
      setDeleting(false);
    }
  };

  // --- Milestones ---------------------------------------------------------------

  const openMilestone = (tl?: LocationTimeline) => {
    setMilestoneErrors({});
    setMilestoneForm(
      tl
        ? {
            id: tl.id,
            name: tl.milestoneName,
            start: dayKeyOf(tl.plannedStartDate),
            end: dayKeyOf(tl.plannedEndDate),
            progress: tl.progressPercent,
            status: tl.status,
            notes: tl.notes ?? '',
          }
        : newMilestoneForm(),
    );
  };

  /** Moving the progress keeps the status consistent unless the user picked "Delayed". */
  const setMilestoneProgress = (value: number) =>
    setMilestoneForm((f) => {
      if (!f) return f;
      const progress = Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
      const status: TimelineStatus = f.status === 'DELAYED' && progress < 100 ? 'DELAYED' : progress === 100 ? 'COMPLETED' : progress > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
      return { ...f, progress, status };
    });

  const handleSaveMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !milestoneForm) return;
    const errors: typeof milestoneErrors = {};
    if (!milestoneForm.name.trim()) errors.name = 'Enter a name.';
    if (!milestoneForm.start || !milestoneForm.end) errors.end = 'Enter both dates.';
    else if (milestoneForm.end < milestoneForm.start) errors.end = 'The end date cannot be before the start date.';
    setMilestoneErrors(errors);
    if (Object.keys(errors).length) return;

    const existing = location?.timelines?.find((t) => t.id === milestoneForm.id);
    const payload: Partial<LocationTimeline> = {
      milestoneName: milestoneForm.name.trim(),
      plannedStartDate: dayKeyToIso(milestoneForm.start),
      plannedEndDate: dayKeyToIso(milestoneForm.end),
      progressPercent: milestoneForm.progress,
      status: milestoneForm.status,
      notes: milestoneForm.notes.trim(),
    };
    if (existing) {
      if (milestoneForm.progress > 0 && !existing.actualStartDate) payload.actualStartDate = new Date().toISOString();
      if (milestoneForm.progress === 100 && !existing.actualEndDate) payload.actualEndDate = new Date().toISOString();
    }
    setSavingMilestone(true);
    try {
      if (milestoneForm.id) await api.updateTimeline(id, milestoneForm.id, payload);
      else await api.createTimeline(id, payload);
      addToast({ type: 'success', title: milestoneForm.id ? 'Milestone saved' : 'Milestone added', message: milestoneForm.name.trim() });
      setMilestoneForm(null);
      await reloadLocation();
    } catch (err) {
      setMilestoneErrors({ form: getApiErrorMessage(err, 'The milestone could not be saved.') });
    } finally {
      setSavingMilestone(false);
    }
  };

  const handleDeleteMilestone = async () => {
    if (!id || !deleteMilestone) return;
    setSavingMilestone(true);
    try {
      await api.deleteTimeline(id, deleteMilestone.id);
      addToast({ type: 'success', title: 'Milestone deleted', message: deleteMilestone.milestoneName });
      setDeleteMilestone(null);
      await reloadLocation();
    } catch (err) {
      addToast({ type: 'error', title: 'Not deleted', message: getApiErrorMessage(err, 'The milestone could not be deleted.') });
    } finally {
      setSavingMilestone(false);
    }
  };

  // --- Documents ----------------------------------------------------------------

  const openDocModal = () => {
    setDocErrors({});
    setDocForm(newDocForm());
  };

  const handleDocFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const url = reader.result;
        setDocForm((f) => (f ? { ...f, fileUrl: url, fileName: file.name, title: f.title || file.name.replace(/\.[^.]+$/, '') } : f));
        setDocErrors((x) => ({ ...x, file: undefined }));
      }
    };
    reader.onerror = () => setDocErrors((x) => ({ ...x, file: 'The file could not be read.' }));
    reader.readAsDataURL(file);
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !docForm) return;
    const errors: typeof docErrors = {};
    const link = docForm.link.trim();
    if (!docForm.title.trim()) errors.title = 'Enter a title.';
    if (!docForm.fileUrl && !link) errors.file = 'Choose a file or paste a link.';
    else if (!docForm.fileUrl && !/^https?:\/\//i.test(link)) errors.file = 'The link must start with http:// or https://.';
    setDocErrors(errors);
    if (Object.keys(errors).length) return;
    setSavingDoc(true);
    try {
      await api.addDocument(id, { title: docForm.title.trim(), docType: docForm.docType, fileUrl: docForm.fileUrl || link, version: docForm.version.trim() || '1.0' });
      addToast({ type: 'success', title: 'Document attached', message: `${documentTypeLabel(docForm.docType)} "${docForm.title.trim()}" was attached.` });
      setDocForm(null);
      await reloadLocation();
    } catch (err) {
      setDocErrors({ form: getApiErrorMessage(err, 'The document could not be attached.') });
    } finally {
      setSavingDoc(false);
    }
  };

  const handleRemoveDocument = async () => {
    if (!id || !deleteDoc) return;
    setRemovingDoc(true);
    try {
      await api.deleteDocument(id, deleteDoc.id);
      addToast({ type: 'success', title: 'Document removed', message: deleteDoc.title });
      setDeleteDoc(null);
      await reloadLocation();
    } catch (err) {
      addToast({ type: 'error', title: 'Not removed', message: getApiErrorMessage(err, 'The document could not be removed.') });
    } finally {
      setRemovingDoc(false);
    }
  };

  /** Stored files are served through short-lived signed links, so a fresh link is fetched on every open. */
  const openDocument = async (doc: LocationDocument) => {
    if (!isStoredFile(doc.fileUrl) || !id) {
      window.open(doc.fileUrl, '_blank', 'noopener');
      return;
    }
    // Open the tab synchronously (popup blockers), then point it at the fresh link
    const tab = window.open('', '_blank');
    try {
      const fresh = await api.getLocationById(id);
      setLocation(fresh);
      const url = fresh.documents?.find((d) => d.id === doc.id)?.fileUrl;
      if (!url) throw new Error('The document is no longer attached.');
      if (tab) tab.location.href = url;
      else window.open(url, '_blank', 'noopener');
    } catch (err) {
      tab?.close();
      addToast({ type: 'error', title: 'Cannot open the file', message: getApiErrorMessage(err, 'The file could not be opened.') });
    }
  };

  // --- Evidence -----------------------------------------------------------------

  const readPhoto = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setter(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const resetEvidenceForm = () => {
    setEvidenceCategory('S1_SORT');
    setEvidenceDescription('');
    setEvidenceBeforePhoto('');
    setEvidenceAfterPhoto('');
    setEvidenceAfterLabel('');
    setEvidenceErrors({});
  };

  const handleSaveEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const errors: typeof evidenceErrors = {};
    if (evidenceDescription.trim().length < 5) errors.description = 'Describe the improvement (at least 5 characters).';
    if (!evidenceBeforePhoto || !evidenceAfterPhoto) errors.photos = 'Add both a before and an after photo.';
    setEvidenceErrors(errors);
    if (Object.keys(errors).length) return;
    try {
      setSavingEvidence(true);
      await api.addLocationEvidence(id, {
        category: evidenceCategory,
        description: evidenceDescription.trim(),
        beforePhotoUrl: evidenceBeforePhoto,
        afterPhotoUrl: evidenceAfterPhoto,
        afterLabel: evidenceAfterLabel.trim() || undefined,
      });
      setUploadEvidenceModalOpen(false);
      resetEvidenceForm();
      await loadInsights(id);
      addToast({ type: 'success', title: 'Photos added', message: `Before / after photos added for ${location?.name ?? 'this location'}.` });
    } catch (err) {
      setEvidenceErrors({ form: getApiErrorMessage(err, 'The photos could not be saved.') });
    } finally {
      setSavingEvidence(false);
    }
  };

  const handleRemoveEvidence = async () => {
    const evidenceId = removeEvidenceId;
    if (!id || !evidenceId) return;
    setRemovingEvidence(true);
    try {
      await api.removeLocationEvidence(id, evidenceId);
      setRemoveEvidenceId(null);
      await loadInsights(id);
      addToast({ type: 'info', title: 'Photos removed', message: 'The before / after record was removed from the gallery.' });
    } catch (err) {
      addToast({ type: 'error', title: 'Not removed', message: getApiErrorMessage(err, 'Could not remove the evidence.') });
    } finally {
      setRemovingEvidence(false);
    }
  };

  if (loading && !location) {
    return <LoadingState label="Loading location…" />;
  }
  if (!location) {
    return (
      <Card>
        <ErrorState message={loadError ?? 'This location could not be loaded.'} onRetry={loadAll} />
        <div style={{ textAlign: 'center', paddingBottom: '16px' }}>
          <Link to="/locations">Back to locations</Link>
        </div>
      </Card>
    );
  }

  const openWorkCount = locationActions.length + openObservations.length;
  const isAreaResponsible = !!currentUser && (currentUser.id === location.ownerId || currentUser.id === location.backupOwnerId);
  // Mirrors the API: the AREA_MAINTAINERS role, and owners only on their own areas (supervisors on any)
  const canMaintainArea = can('AREA_MAINTAINERS') && (isAreaResponsible || can('LOCATION_EDITORS'));
  const canEditLocation = can('LOCATION_EDITORS');
  const dueText = (iso: string) => {
    const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
    const date = formatDate(iso);
    if (days < 0) return `${date} (${-days} day${days === -1 ? '' : 's'} overdue)`;
    if (days === 0) return `${date} (due today)`;
    return `${date} (${days} day${days === 1 ? '' : 's'} left)`;
  };
  const place = [location.building, location.floor].filter(Boolean).join(', ');
  const averageScore = scorecard?.audits.averageScore;
  const logs = location.auditLogs || [];

  const tabs: TabItem[] = [
    { id: 'overview', label: 'Overview & plan', icon: <Calendar size={15} />, badge: location.timelines?.length || undefined },
    { id: 'evidence', label: 'Before / after photos', icon: <Camera size={15} />, badge: evidenceList.length || undefined },
    { id: 'audit', label: 'Audits & scores', icon: <FileCheck size={15} />, badge: averageScore != null ? pct(averageScore) : undefined },
    { id: 'routine', label: 'Daily routine', icon: <Package size={15} /> },
    { id: 'capa', label: 'Open findings', icon: <AlertTriangle size={15} />, badge: openWorkCount ? `${openWorkCount} open` : undefined },
    { id: 'documents', label: 'Documents', icon: <FileText size={15} />, badge: location.documents?.length || undefined },
    { id: 'standards', label: 'Standards', icon: <BookOpen size={15} /> },
    { id: 'history', label: 'Activity history', icon: <Clock size={15} /> },
  ];

  // Overall 5S implementation rollout progress across milestones
  const timelines = location.timelines || [];
  const overall5SProgress = timelines.length > 0 ? Math.round(timelines.reduce((acc, t) => acc + t.progressPercent, 0) / timelines.length) : 0;

  const filteredLogs = logs.filter((log) => {
    if (activityFilter !== 'ALL' && !(ACTIVITY_GROUPS[activityFilter] as readonly string[]).includes(log.actionType)) return false;
    const q = activitySearch.trim().toLowerCase();
    if (!q) return true;
    const userName = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System';
    return userName.toLowerCase().includes(q) || activityMeta(log.actionType).label.toLowerCase().includes(q) || (log.details || '').toLowerCase().includes(q);
  });

  const qrPayload = location.qrCodeData ?? '';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        breadcrumbs={[{ label: 'Locations', to: '/locations' }, { label: location.name }]}
        title={<span style={{ overflowWrap: 'anywhere' }}>{location.name}</span>}
        meta={
          <>
            <Badge variant={location.status === 'ACTIVE' ? 'success' : 'warning'}>{locationStatusLabel(location.status)}</Badge>
            <span className="code-tag" style={{ whiteSpace: 'nowrap' }}>{location.areaCode}</span>
          </>
        }
        actions={
          <>
            {canEditLocation && (
              <Button variant="secondary" icon={<Edit2 size={16} />} onClick={openEdit}>
                Edit details
              </Button>
            )}
            <Button variant="secondary" icon={<QrCode size={16} />} onClick={() => setQrModalOpen(true)}>
              QR tag
            </Button>
            {can('SHOPFLOOR_REPORTERS') && (
              <>
                <Button variant="secondary" icon={<AlertTriangle size={16} />} onClick={() => navigate(`/observations?new=1&locationId=${encodeURIComponent(location.id)}`)}>
                  Report abnormality
                </Button>
                <Button variant="secondary" icon={<Tag size={16} />} onClick={() => navigate(`/red-tags?new=1&locationId=${encodeURIComponent(location.id)}`)}>
                  Raise red tag
                </Button>
              </>
            )}
            {can('PROGRAM_MANAGERS') && (
              <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => { setDeleteError(null); setDeleteOpen(true); }}>
                Delete
              </Button>
            )}
            {can('AUDIT_CONDUCTORS') && (
              <Button variant="primary" icon={<Sparkles size={16} />} onClick={() => navigate(`/mobile-audit?locationId=${location.id}`)}>
                Start audit
              </Button>
            )}
          </>
        }
      />

      {/* Key facts at a glance */}
      <Card noPadding>
        <dl className="keep-cols" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))' }}>
          {([
            { label: 'Unit', value: location.orgNode?.name ?? '—', sub: location.orgNode?.code },
            { label: 'Building / floor', value: place || '—' },
            { label: 'Risk', value: <Badge variant={riskVariant(location.riskLevel)}>{riskLabel(location.riskLevel)}</Badge> },
            { label: 'Audit cadence', value: frequencyLabel(location.auditFrequency), sub: locationTypeLabel(location.locationType) },
            {
              label: 'Area owner',
              value: location.owner ? `${location.owner.firstName} ${location.owner.lastName}` : <span style={{ color: 'var(--text-tertiary)' }}>Unassigned</span>,
              sub: location.owner?.jobTitle,
            },
            {
              label: '5S roll-out progress',
              value: timelines.length ? `${overall5SProgress}%` : '—',
              extra: <ProgressBar value={overall5SProgress} height={6} ariaLabel={`5S roll-out progress ${overall5SProgress}%`} />,
            },
          ] as Array<{ label: string; value: React.ReactNode; sub?: string | null; extra?: React.ReactNode }>).map((fact) => (
            <div key={fact.label} style={{ padding: '16px 20px', minWidth: 0, borderRight: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', marginRight: '-1px', marginBottom: '-1px' }}>
              <dt style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 500 }}>{fact.label}</dt>
              <dd style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{fact.value}</dd>
              {fact.sub && <dd style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--text-tertiary)', overflowWrap: 'anywhere' }}>{fact.sub}</dd>}
              {fact.extra && <dd style={{ margin: '8px 0 0' }}>{fact.extra}</dd>}
            </div>
          ))}
        </dl>
      </Card>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={selectTab} ariaLabel="Location sections" />

      <div className="tab-panels">
        {/* Overview & roll-out plan */}
        {activeTab === 'overview' && (
          <div className="animate-fade-in grid grid-cols-3 gap-6">
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
              <Card
                title="5S roll-out milestones"
                subtitle="Planned dates and progress of each 5S step for this location"
                actions={
                  canMaintainArea ? (
                    <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => openMilestone()}>
                      Add milestone
                    </Button>
                  ) : undefined
                }
              >
                <div>
                  {timelines.length === 0 ? (
                    <EmptyState title="No milestones yet" description={canMaintainArea ? 'Add the steps of the 5S roll-out for this location.' : undefined} />
                  ) : (
                    timelines.map((tl, i) => (
                      <div key={tl.id} style={{ padding: i === 0 ? '0 0 16px' : '16px 0', borderTop: i === 0 ? undefined : '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <div
                              aria-hidden="true"
                              style={{ width: '28px', height: '28px', flexShrink: 0, borderRadius: 'var(--radius-full)', background: tl.status === 'COMPLETED' ? 'var(--color-success-bg)' : 'var(--color-primary-light)', color: tl.status === 'COMPLETED' ? 'var(--color-success)' : 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              {tl.status === 'COMPLETED' ? <CheckCircle2 size={15} /> : <Calendar size={14} />}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{tl.milestoneName}</div>
                              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                                Planned {formatDate(tl.plannedStartDate)} – {formatDate(tl.plannedEndDate)}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Badge variant={timelineStatusVariant(tl.status)}>{timelineStatusLabel(tl.status)}</Badge>
                            {canMaintainArea && (
                              <>
                                <Button size="sm" variant="ghost" icon={<Edit2 size={14} />} onClick={() => openMilestone(tl)} aria-label={`Edit ${tl.milestoneName}`} />
                                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleteMilestone(tl)} aria-label={`Delete ${tl.milestoneName}`} />
                              </>
                            )}
                          </div>
                        </div>
                        <ProgressBar value={tl.progressPercent} showLabel height={7} ariaLabel={`${tl.milestoneName}: ${tl.progressPercent}%`} />
                        {tl.notes && (
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', background: 'var(--bg-pale)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                            {tl.notes}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card title="Description">
                <p style={{ fontSize: '14px', color: location.description ? 'var(--text-secondary)' : 'var(--text-tertiary)', lineHeight: '1.6', margin: 0 }}>
                  {location.description || 'No description'}
                </p>
              </Card>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
              <Card
                title="Baseline photo"
                noPadding
                actions={canEditLocation && !location.heroPhotoUrl ? <Button size="sm" variant="ghost" onClick={openEdit}>Add photo</Button> : undefined}
              >
                <ImageWithFallback src={location.heroPhotoUrl || undefined} height="190px" allowZoom={!!location.heroPhotoUrl} alt={`Baseline photo of ${location.name}`} emptyText="No baseline photo yet" />
              </Card>

              <Card title="Ownership and details">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {([
                    { label: 'Area owner', person: location.owner, sub: location.owner?.jobTitle },
                    { label: 'Backup owner', person: location.backupOwner, sub: location.backupOwner?.email },
                  ] as const).map(({ label, person, sub }) => (
                    <div key={label}>
                      <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                        <div
                          aria-hidden="true"
                          style={{ width: '36px', height: '36px', flexShrink: 0, borderRadius: 'var(--radius-full)', background: person ? 'var(--color-primary)' : 'var(--bg-surface-subtle)', border: person ? 'none' : '1px dashed var(--border-strong)', color: person ? '#FFFFFF' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '13px' }}
                        >
                          {person ? `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase() : '?'}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: person ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: '14px' }}>
                            {person ? `${person.firstName} ${person.lastName}` : 'Unassigned'}
                          </div>
                          {sub && <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', overflowWrap: 'anywhere' }}>{sub}</div>}
                        </div>
                      </div>
                    </div>
                  ))}

                  <dl style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px', fontSize: '13px', margin: 0 }} className="keep-cols">
                    <dt style={{ color: 'var(--text-secondary)' }}>Type</dt>
                    <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600 }}>{locationTypeLabel(location.locationType)}</dd>
                    <dt style={{ color: 'var(--text-secondary)' }}>Risk</dt>
                    <dd style={{ margin: 0, textAlign: 'right' }}><Badge variant={riskVariant(location.riskLevel)}>{riskLabel(location.riskLevel)}</Badge></dd>
                    <dt style={{ color: 'var(--text-secondary)' }}>Audit frequency</dt>
                    <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600 }}>{frequencyLabel(location.auditFrequency)}</dd>
                    <dt style={{ color: 'var(--text-secondary)' }}>Building</dt>
                    <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600 }}>{location.building || '—'}</dd>
                    <dt style={{ color: 'var(--text-secondary)' }}>Floor</dt>
                    <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600 }}>{location.floor || '—'}</dd>
                  </dl>
                </div>
              </Card>

              <Card title="QR tag">
                <div style={{ textAlign: 'center', padding: '10px' }}>
                  <QrCodeImage dataUrl={location.qrPngDataUrl} value={qrPayload} size={180} alt={`QR code for ${location.name}`} style={{ width: '150px', height: '150px', margin: '0 auto', display: 'block' }} />
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '10px', overflowWrap: 'anywhere' }}>
                    Payload: <code>{qrPayload || '—'}</code>
                  </div>
                  <Button size="sm" variant="secondary" icon={<Printer size={14} />} style={{ marginTop: '12px', width: '100%' }} onClick={() => setQrModalOpen(true)}>
                    Print tag
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Before / after evidence */}
        {activeTab === 'evidence' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Card
              title="Before / after photos"
              subtitle="Improvements at this location, and closed corrective actions that have photos"
              actions={
                canMaintainArea ? (
                  <Button size="sm" variant="primary" icon={<Camera size={14} />} onClick={() => { resetEvidenceForm(); setUploadEvidenceModalOpen(true); }}>
                    Add photos
                  </Button>
                ) : undefined
              }
            >
              {insightErrors.evidence ? (
                <ErrorState message={insightErrors.evidence} onRetry={() => loadInsights(location.id)} />
              ) : evidenceList.length === 0 ? (
                <EmptyState
                  icon={<Camera size={28} />}
                  title="No before / after photos yet"
                  description={
                    canMaintainArea
                      ? 'Add a before and an after photo to record an improvement. Closed corrective actions with photos appear here automatically.'
                      : 'Closed corrective actions with before and after photos appear here automatically.'
                  }
                />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(440px, 100%), 1fr))', gap: '16px' }}>
                  {evidenceList.map((item) => (
                    <div key={item.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: 'var(--bg-surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <Badge variant={pillarVariant(item.category)}>{pillarLabel(item.category)}</Badge>
                          {item.source === 'CAPA' && <Badge variant="neutral">{item.actionCode ?? 'Corrective action'}</Badge>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            {formatDate(item.createdAt)}
                            {item.uploadedBy ? ` • ${item.uploadedBy}` : ''}
                          </span>
                          {item.source === 'UPLOAD' && can('AREA_MAINTAINERS') && (item.uploadedById === currentUser?.id || can('LOCATION_EDITORS')) && (
                            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label="Remove these photos" title="Remove" onClick={() => setRemoveEvidenceId(item.id)} />
                          )}
                        </div>
                      </div>

                      <div className="keep-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--bg-surface-subtle)' }}>
                        {([
                          { src: item.beforePhotoUrl, label: 'Before', bg: 'var(--color-danger)', alt: 'Before' },
                          { src: item.afterPhotoUrl, label: item.afterLabel || 'After', bg: 'var(--color-success)', alt: 'After' },
                        ] as const).map((photo, i) => (
                          <div key={photo.alt} style={{ position: 'relative', borderLeft: i ? '1px solid var(--border-subtle)' : undefined }}>
                            <ImageWithFallback src={photo.src} height="185px" allowZoom alt={`${photo.alt}: ${item.description}`} />
                            <span style={{ position: 'absolute', top: '8px', left: '8px', background: photo.bg, color: '#FFFFFF', padding: '2px 8px', borderRadius: 'var(--radius-xs)', fontSize: '12px', fontWeight: 600, zIndex: 2 }}>
                              {photo.label}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{item.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Audits & scores */}
        {activeTab === 'audit' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {insightErrors.scorecard ? (
              <Card><ErrorState message={insightErrors.scorecard} onRetry={() => loadInsights(location.id)} /></Card>
            ) : (
              <div className="grid grid-cols-3 gap-6">
                <Card title="5S score">
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div className="metric-value tabular-nums" style={{ fontSize: '40px', fontWeight: 700, lineHeight: 1.1, color: scorecard?.audits.maturity?.color ?? 'var(--text-tertiary)' }}>
                      {averageScore != null ? pct(averageScore) : '—'}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '8px' }}>{scorecard?.audits.maturity?.name ?? 'Not yet rated'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {scorecard?.audits.countInWindow
                        ? `Average of ${scorecard.audits.countInWindow} audit${scorecard.audits.countInWindow === 1 ? '' : 's'} in the last 12 months`
                        : 'No scored audits in the last 12 months'}
                    </div>
                    {scorecard?.audits.latest && (
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                        Latest: {pct(scorecard.audits.latest.score)} on {formatDate(scorecard.audits.latest.completedAt)}
                        {scorecard.audits.latest.auditorName ? ` by ${scorecard.audits.latest.auditorName}` : ''}
                      </div>
                    )}
                  </div>
                </Card>

                <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
                  <Card title="Score by pillar" subtitle="Average pillar score over the last 12 months">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(scorecard?.audits.pillars ?? []).map((p) => (
                        <div key={p.key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                            <span>{pillarLabel(p.key)}</span>
                            <strong>{p.score != null ? pct(p.score) : '—'}</strong>
                          </div>
                          <ProgressBar value={p.score ?? 0} height={6} ariaLabel={`${pillarLabel(p.key)}: ${p.score != null ? pct(p.score) : 'no score'}`} />
                        </div>
                      ))}
                      {!scorecard?.audits.countInWindow && <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Pillar scores appear after the first submitted audit.</div>}
                    </div>
                  </Card>
                </div>
              </div>
            )}

            <Card
              title="Audit history"
              subtitle="Audits of this location, their scores and the area owner's response"
              actions={
                can('AUDIT_CONDUCTORS') ? (
                  <Button size="sm" variant="primary" icon={<Sparkles size={14} />} onClick={() => navigate(`/mobile-audit?locationId=${location.id}`)}>
                    Start audit
                  </Button>
                ) : undefined
              }
            >
              {auditsError ? (
                <ErrorState message={auditsError} onRetry={() => loadAudits(location.id)} />
              ) : auditExecutions.length === 0 ? (
                <EmptyState icon={<FileCheck size={28} />} title="No audits yet" />
              ) : (
                <div className="enterprise-table-container">
                  <table className="enterprise-table">
                    <thead>
                      <tr>
                        <th>Audit</th>
                        <th>Template</th>
                        <th>Date</th>
                        <th>Auditor</th>
                        <th>Score</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Report</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditExecutions.map((exec) => {
                        const scored = exec.status !== 'IN_PROGRESS';
                        const awaitingSignOff = exec.status === 'SUBMITTED';
                        return (
                          <tr key={exec.id}>
                            <td style={{ whiteSpace: 'nowrap' }}><span className="code-tag">{exec.auditCode}</span></td>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{exec.template?.name ?? '—'}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{humanize(exec.auditType)} audit</div>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(exec.completedAt || exec.startedAt)}</td>
                            <td>{exec.auditorName || '—'}</td>
                            <td>
                              {scored ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <strong className="tabular-nums" style={{ color: exec.isPassed ? 'var(--color-success)' : 'var(--color-danger)' }}>{pct(exec.overallScore)}</strong>
                                  <Badge variant={exec.isPassed ? 'success' : 'danger'}>{exec.isPassed ? 'Pass' : 'Fail'}</Badge>
                                </div>
                              ) : (
                                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Not submitted</span>
                              )}
                            </td>
                            <td>
                              <Badge variant={auditStatusVariant(exec.status)}>{auditStatusLabel(exec.status)}</Badge>
                              {exec.status === 'ACKNOWLEDGED' && exec.acknowledgedByName && (
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>by {exec.acknowledgedByName}</div>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Button
                                size="sm"
                                variant={awaitingSignOff && can('AUDITEES') ? 'primary' : 'secondary'}
                                icon={<FileCheck size={14} />}
                                onClick={() => {
                                  setSelectedReportId(exec.id);
                                  setReportModalOpen(true);
                                }}
                              >
                                {awaitingSignOff && can('AUDITEES') ? 'Review and sign off' : 'View report'}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'standards' && (
          <div className="animate-fade-in">
            <LocationStandardsTab locationId={location.id} />
          </div>
        )}

        {activeTab === 'routine' && (
          <div className="animate-fade-in">
            <DailyRoutinePanel locationId={location.id} ownerId={location.ownerId} backupOwnerId={location.backupOwnerId} manage showHistory />
          </div>
        )}

        {/* Open corrective actions and observations */}
        {activeTab === 'capa' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Card
              title="Open findings"
              subtitle="Open corrective actions with their due dates, and observations still waiting for an action"
              actions={<Link to="/capa" style={{ fontSize: '13px', fontWeight: 600 }}>All corrective actions</Link>}
            >
              {insightErrors.work ? (
                <ErrorState message={insightErrors.work} onRetry={() => loadInsights(location.id)} />
              ) : openWorkCount === 0 ? (
                <EmptyState icon={<CheckCircle2 size={28} />} title="Nothing open" description="No open corrective actions or observations for this location." />
              ) : (
                <div className="enterprise-table-container">
                  <table className="enterprise-table">
                    <thead>
                      <tr>
                        <th>Ref</th>
                        <th>Pillar</th>
                        <th>Details</th>
                        <th>Severity</th>
                        <th>Due</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locationActions.map((a) => (
                        <tr key={a.id}>
                          <td style={{ whiteSpace: 'nowrap' }}><Link to={`/capa?id=${encodeURIComponent(a.id)}`} className="code-tag">{a.actionCode}</Link></td>
                          <td>{a.observation?.category ? <Badge variant={pillarVariant(a.observation.category)}>{pillarLabel(a.observation.category)}</Badge> : '—'}</td>
                          <td><Link to={`/capa?id=${encodeURIComponent(a.id)}`} style={{ color: 'var(--text-primary)' }}>{a.title}</Link></td>
                          <td>{a.observation?.severity ? <Badge variant={severityVariant(a.observation.severity)}>{severityLabel(a.observation.severity)}</Badge> : '—'}</td>
                          <td style={{ whiteSpace: 'nowrap', color: new Date(a.targetDate).getTime() < Date.now() ? 'var(--color-danger)' : undefined }}>{dueText(a.targetDate)}</td>
                          <td><Badge variant={actionStatusVariant(a.status)}>{actionStatusLabel(a.status)}</Badge></td>
                        </tr>
                      ))}
                      {openObservations.map((o) => (
                        <tr key={o.id}>
                          <td style={{ whiteSpace: 'nowrap' }}><Link to={`/observations?id=${encodeURIComponent(o.id)}`} className="code-tag">{o.observationCode}</Link></td>
                          <td><Badge variant={pillarVariant(o.category)}>{pillarLabel(o.category)}</Badge></td>
                          <td><Link to={`/observations?id=${encodeURIComponent(o.id)}`} style={{ color: 'var(--text-primary)' }}>{o.title}</Link></td>
                          <td><Badge variant={severityVariant(o.severity)}>{severityLabel(o.severity)}</Badge></td>
                          <td>—</td>
                          <td><Badge variant="neutral">Awaiting action</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Documents */}
        {activeTab === 'documents' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Card
              title="Documents"
              subtitle="SOPs, cleaning schedules, layout maps and safety guidelines for this location"
              actions={
                canMaintainArea ? (
                  <Button size="sm" variant="primary" icon={<Upload size={14} />} onClick={openDocModal}>
                    Attach document
                  </Button>
                ) : undefined
              }
            >
              {(location.documents ?? []).length === 0 ? (
                <EmptyState icon={<FileText size={28} />} title="No documents yet" />
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {(location.documents ?? []).map((doc, i) => (
                    <li key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '12px 0', borderTop: i === 0 ? undefined : '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div aria-hidden="true" style={{ padding: '8px', borderRadius: 'var(--radius-md)', background: 'var(--bg-pale)', color: 'var(--color-primary)', display: 'flex' }}>
                          <FileText size={18} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{doc.title}</div>
                          <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                            {documentTypeLabel(doc.docType)} • Version {doc.version} • {doc.fileSizeKb > 0 ? `${doc.fileSizeKb} KB` : 'Link'} • {formatDate(doc.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button size="sm" variant="secondary" onClick={() => openDocument(doc)}>Open</Button>
                        {canMaintainArea && (
                          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleteDoc(doc)} aria-label={`Remove ${doc.title}`} />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {/* Activity history */}
        {activeTab === 'history' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Card
              title="Activity history"
              subtitle="Changes to this location's details, milestones, documents and photos"
              actions={
                <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>
                  {logs.length >= 50 ? 'Latest 50 events' : `${logs.length} event${logs.length === 1 ? '' : 's'}`}
                </span>
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
                <div role="group" aria-label="Filter events" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {([
                    { id: 'ALL', label: 'All' },
                    { id: 'MILESTONES', label: 'Milestones' },
                    { id: 'DETAILS', label: 'Details' },
                    { id: 'FILES', label: 'Documents & photos' },
                  ] as Array<{ id: ActivityFilter; label: string }>).map((filter) => {
                    const isActive = activityFilter === filter.id;
                    const count = filter.id === 'ALL' ? logs.length : logs.filter((l) => (ACTIVITY_GROUPS[filter.id as keyof typeof ACTIVITY_GROUPS] as readonly string[]).includes(l.actionType)).length;
                    return (
                      <button
                        key={filter.id}
                        type="button"
                        className={`pillar-tab-pill${isActive ? ' active' : ''}`}
                        aria-pressed={isActive}
                        onClick={() => setActivityFilter(filter.id)}
                        style={{ gap: '6px' }}
                      >
                        <span>{filter.label}</span>
                        <span className="tabular-nums" style={{ fontSize: '12px', fontWeight: 500, color: isActive ? 'var(--color-primary)' : 'var(--text-tertiary)' }}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <SearchInput
                  label="Search activity"
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  style={{ flex: '0 1 260px', minWidth: 0 }}
                />
              </div>

              {filteredLogs.length === 0 ? (
                <EmptyState icon={<Activity size={28} />} title="No events found" description={activityFilter !== 'ALL' || activitySearch ? 'Change the filter or search.' : undefined} />
              ) : (
                <div style={{ position: 'relative' }}>
                <div aria-hidden="true" style={{ position: 'absolute', left: '23px', top: '16px', bottom: '24px', width: '2px', background: 'var(--border-subtle)', zIndex: 1 }} />
                <ol style={{ listStyle: 'none', margin: 0, padding: '0 0 0 8px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {filteredLogs.map((log) => {
                    const meta = activityMeta(log.actionType);
                    const tone = TONE[meta.variant];
                    const userFullName = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System';
                    return (
                      <li key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', position: 'relative', zIndex: 2 }}>
                        <div aria-hidden="true" style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-full)', background: tone.bg, color: tone.fg, border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 0 4px var(--bg-surface)' }}>
                          {meta.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, paddingTop: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{meta.label}</span>
                            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{formatDateTime(log.createdAt)}</span>
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                            By <strong style={{ color: 'var(--text-primary)' }}>{userFullName}</strong>
                            {log.user?.jobTitle ? ` (${log.user.jobTitle})` : ''}
                          </div>
                          <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                            <ActivityDetails details={log.details} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Add / edit milestone */}
      <Modal
        isOpen={milestoneForm !== null}
        onClose={() => !savingMilestone && setMilestoneForm(null)}
        title={milestoneForm?.id ? 'Edit milestone' : 'Add milestone'}
        subtitle={location.name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMilestoneForm(null)} disabled={savingMilestone}>Cancel</Button>
            <Button variant="primary" type="submit" form="milestone-form" loading={savingMilestone}>{milestoneForm?.id ? 'Save' : 'Add milestone'}</Button>
          </>
        }
      >
        {milestoneForm && (
          <form id="milestone-form" onSubmit={handleSaveMilestone} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="ms-name">Name <span className="required">*</span></label>
              <input id="ms-name" type="text" className="form-input" value={milestoneForm.name} onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })} aria-invalid={!!milestoneErrors.name} aria-describedby={milestoneErrors.name ? 'ms-name-error' : undefined} />
              {milestoneErrors.name && <div id="ms-name-error" className="form-error" style={fieldErrorStyle}>{milestoneErrors.name}</div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <label className="form-label" htmlFor="ms-start">Planned start <span className="required">*</span></label>
                <input id="ms-start" type="date" className="form-input" value={milestoneForm.start} onChange={(e) => setMilestoneForm({ ...milestoneForm, start: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="ms-end">Planned end <span className="required">*</span></label>
                <input id="ms-end" type="date" className="form-input" min={milestoneForm.start || undefined} value={milestoneForm.end} onChange={(e) => setMilestoneForm({ ...milestoneForm, end: e.target.value })} aria-invalid={!!milestoneErrors.end} aria-describedby={milestoneErrors.end ? 'ms-end-error' : undefined} />
                {milestoneErrors.end && <div id="ms-end-error" className="form-error" style={fieldErrorStyle}>{milestoneErrors.end}</div>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <label className="form-label" htmlFor="ms-progress">Progress</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input id="ms-progress" type="range" min={0} max={100} step={5} value={milestoneForm.progress} onChange={(e) => setMilestoneProgress(Number(e.target.value))} style={{ flex: 1 }} aria-valuetext={`${milestoneForm.progress}%`} />
                  <input type="number" className="form-input" min={0} max={100} value={milestoneForm.progress} onChange={(e) => setMilestoneProgress(Number(e.target.value))} aria-label="Progress in percent" style={{ width: '88px', flexShrink: 0 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="ms-status">Status</label>
                <select id="ms-status" className="form-select" value={milestoneForm.status} onChange={(e) => setMilestoneForm({ ...milestoneForm, status: e.target.value as TimelineStatus })}>
                  {(Object.keys(TIMELINE_STATUS_LABELS) as TimelineStatus[]).map((s) => <option key={s} value={s}>{TIMELINE_STATUS_LABELS[s]}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ms-notes">Notes</label>
              <textarea id="ms-notes" className="form-textarea" rows={2} value={milestoneForm.notes} onChange={(e) => setMilestoneForm({ ...milestoneForm, notes: e.target.value })} />
            </div>
            {milestoneErrors.form && <p role="alert" className="form-error" style={{ margin: 0 }}>{milestoneErrors.form}</p>}
          </form>
        )}
      </Modal>

      {/* Delete milestone */}
      <ConfirmDialog
        isOpen={deleteMilestone !== null}
        title="Delete milestone?"
        message={<><strong>{deleteMilestone?.milestoneName}</strong> is removed from the roll-out plan.</>}
        confirmLabel="Delete"
        tone="danger"
        busy={savingMilestone}
        onConfirm={handleDeleteMilestone}
        onCancel={() => setDeleteMilestone(null)}
      />

      {/* Attach document */}
      <Modal
        isOpen={docForm !== null}
        onClose={() => !savingDoc && setDocForm(null)}
        title="Attach document"
        subtitle={location.name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDocForm(null)} disabled={savingDoc}>Cancel</Button>
            <Button variant="primary" type="submit" form="document-form" loading={savingDoc}>Attach</Button>
          </>
        }
      >
        {docForm && (
          <form id="document-form" onSubmit={handleAddDocument} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="doc-title">Title <span className="required">*</span></label>
              <input id="doc-title" type="text" className="form-input" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} aria-invalid={!!docErrors.title} aria-describedby={docErrors.title ? 'doc-title-error' : undefined} />
              {docErrors.title && <div id="doc-title-error" className="form-error" style={fieldErrorStyle}>{docErrors.title}</div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <label className="form-label" htmlFor="doc-type">Type</label>
                <select id="doc-type" className="form-select" value={docForm.docType} onChange={(e) => setDocForm({ ...docForm, docType: e.target.value as DocType })}>
                  {(Object.keys(DOCUMENT_TYPE_LABELS) as DocType[]).map((code) => <option key={code} value={code}>{DOCUMENT_TYPE_LABELS[code]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="doc-version">Version</label>
                <input id="doc-version" type="text" className="form-input" value={docForm.version} onChange={(e) => setDocForm({ ...docForm, version: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="doc-file">File</label>
              <input id="doc-file" type="file" className="form-input" accept="application/pdf,image/*" onChange={handleDocFileUpload} aria-describedby="doc-file-hint" />
              <div id="doc-file-hint" className="form-hint">
                {docForm.fileName ? `Selected: ${docForm.fileName}` : 'PDF or image. Or paste a link to a document stored elsewhere.'}
              </div>
              {docForm.fileName && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setDocForm({ ...docForm, fileUrl: '', fileName: '' })}>Remove file</Button>
              )}
            </div>
            {!docForm.fileName && (
              <div className="form-group">
                <label className="form-label" htmlFor="doc-link">Link</label>
                <input id="doc-link" type="url" className="form-input" placeholder="https://" value={docForm.link} onChange={(e) => setDocForm({ ...docForm, link: e.target.value })} />
              </div>
            )}
            {docErrors.file && <div role="alert" className="form-error" style={fieldErrorStyle}>{docErrors.file}</div>}
            {docErrors.form && <p role="alert" className="form-error" style={{ margin: '8px 0 0' }}>{docErrors.form}</p>}
          </form>
        )}
      </Modal>

      {/* Remove document */}
      <ConfirmDialog
        isOpen={deleteDoc !== null}
        title="Remove document?"
        message={<><strong>{deleteDoc?.title}</strong> is no longer listed for this location. The removal is recorded in the activity history.</>}
        confirmLabel="Remove"
        tone="danger"
        busy={removingDoc}
        onConfirm={handleRemoveDocument}
        onCancel={() => setDeleteDoc(null)}
      />

      {/* Remove before / after photos */}
      <ConfirmDialog
        isOpen={removeEvidenceId !== null}
        title="Remove these photos?"
        message="The before / after record is removed from the gallery. It stays in the history."
        confirmLabel="Remove"
        tone="danger"
        busy={removingEvidence}
        onConfirm={handleRemoveEvidence}
        onCancel={() => setRemoveEvidenceId(null)}
      />

      {/* Printable QR tag */}
      <Modal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        title={`QR tag: ${location.areaCode}`}
        subtitle={location.name}
        maxWidth="440px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setQrModalOpen(false)}>Close</Button>
            <Button variant="primary" icon={<Printer size={16} />} onClick={() => window.print()}>Print tag</Button>
          </>
        }
      >
        <div style={{ textAlign: 'center', padding: '16px' }}>
          <div className="printable-station-tag" style={{ border: '2px dashed #CBD5E1', borderRadius: 'var(--radius-lg)', padding: '24px', display: 'inline-block', background: '#FFFFFF', maxWidth: '100%' }}>
            {currentTenant?.name && (
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#003B70', marginBottom: '4px' }}>{currentTenant.name}</div>
            )}
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1D2733', marginBottom: '12px', whiteSpace: 'nowrap' }}>{location.areaCode}</div>
            <QrCodeImage dataUrl={location.qrPngDataUrl} value={qrPayload} size={220} alt={`QR code for ${location.name}`} style={{ width: '200px', height: '200px', margin: '0 auto', display: 'block' }} />
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1D2733', marginTop: '12px' }}>{location.name}</div>
            {place && <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{place}</div>}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '16px' }}>Scanning this tag in the mobile app opens this location.</div>
        </div>
      </Modal>

      {/* Add before / after photos */}
      <Modal
        isOpen={uploadEvidenceModalOpen}
        onClose={() => !savingEvidence && setUploadEvidenceModalOpen(false)}
        title="Add before / after photos"
        subtitle={location.name}
        maxWidth="760px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadEvidenceModalOpen(false)} disabled={savingEvidence}>Cancel</Button>
            <Button variant="primary" type="submit" form="evidence-form" icon={<Camera size={15} />} loading={savingEvidence}>Save photos</Button>
          </>
        }
      >
        <form id="evidence-form" onSubmit={handleSaveEvidence} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="grid grid-cols-3 gap-4">
            <div className="form-group">
              <label className="form-label" htmlFor="ev-category">5S pillar <span className="required">*</span></label>
              <select id="ev-category" className="form-select" value={evidenceCategory} onChange={(e) => setEvidenceCategory(e.target.value as FiveSCategory)}>
                {PILLARS.map((c) => <option key={c} value={c}>{pillarLabel(c)}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label" htmlFor="ev-after-label">Label on the after photo</label>
              <input id="ev-after-label" type="text" className="form-input" maxLength={60} placeholder="After" value={evidenceAfterLabel} onChange={(e) => setEvidenceAfterLabel(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="ev-description">What was improved <span className="required">*</span></label>
            <input id="ev-description" type="text" className="form-input" maxLength={1000} value={evidenceDescription} onChange={(e) => setEvidenceDescription(e.target.value)} aria-invalid={!!evidenceErrors.description} aria-describedby={evidenceErrors.description ? 'ev-description-error' : undefined} />
            {evidenceErrors.description && <div id="ev-description-error" className="form-error" style={fieldErrorStyle}>{evidenceErrors.description}</div>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {([
              { key: 'before', label: 'Before', hint: 'Before the improvement', color: 'var(--color-danger)', value: evidenceBeforePhoto, onChange: (e: React.ChangeEvent<HTMLInputElement>) => readPhoto(e, setEvidenceBeforePhoto) },
              { key: 'after', label: 'After', hint: 'After the improvement', color: 'var(--color-success)', value: evidenceAfterPhoto, onChange: (e: React.ChangeEvent<HTMLInputElement>) => readPhoto(e, setEvidenceAfterPhoto) },
            ] as const).map((slot) => (
              <div key={slot.key} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px', background: 'var(--bg-surface-subtle)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ background: slot.color, color: '#FFFFFF', fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-xs)' }}>{slot.label}</span>
                  <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)' }}>{slot.hint}</span>
                </div>
                <div style={{ height: '150px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px dashed var(--border-strong)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                  {slot.value ? <img src={slot.value} alt={`${slot.hint} (preview)`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'No photo selected'}
                </div>
                <label className="btn btn-secondary" style={{ justifyContent: 'center', cursor: 'pointer' }}>
                  <Upload size={14} aria-hidden="true" /> {slot.value ? 'Replace photo' : 'Choose photo'}
                  <input type="file" accept="image/*" capture="environment" onChange={slot.onChange} style={{ display: 'none' }} aria-label={`${slot.hint} photo`} />
                </label>
              </div>
            ))}
          </div>
          {evidenceErrors.photos && <div role="alert" className="form-error" style={fieldErrorStyle}>{evidenceErrors.photos}</div>}
          {evidenceErrors.form && <p role="alert" className="form-error" style={{ margin: 0 }}>{evidenceErrors.form}</p>}
          <span className="form-hint">Both photos are uploaded from your device and saved with your name.</span>
        </form>
      </Modal>

      {/* Edit details */}
      <LocationFormModal
        isOpen={editOpen && !!editRefs}
        onClose={() => setEditOpen(false)}
        location={location}
        orgNodes={editRefs?.orgNodes ?? []}
        users={editRefs?.users ?? []}
        onSaved={(saved) => {
          setEditOpen(false);
          setLocation(saved);
          addToast({ type: 'success', title: 'Location saved', message: `${saved.name} was updated.` });
        }}
      />

      {/* Delete location */}
      <ConfirmDialog
        isOpen={deleteOpen}
        title={`Delete ${location.name}?`}
        message={
          <>
            Planned audits are cancelled and the location disappears from lists. Its audits, findings and history are kept. A location with open
            corrective actions, active red tags or audits in progress cannot be deleted; set it to Inactive instead.
            {deleteError && <p role="alert" className="form-error" style={{ margin: '12px 0 0' }}>{deleteError}</p>}
          </>
        }
        confirmLabel="Delete location"
        tone="danger"
        busy={deleting}
        onConfirm={handleDeleteLocation}
        onCancel={() => setDeleteOpen(false)}
      />

      <AuditReportModal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setSelectedReportId(null);
        }}
        executionId={selectedReportId}
        onAcknowledged={(updated) => {
          setAuditExecutions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
        }}
      />
    </div>
  );
};

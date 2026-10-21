import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../services/api';
import { capaApi as capaCoreApi, FiveWhyInput, hasRootCauseAndSolution } from '../../services/capaApi';
import { capaApi } from '../../services/api-capa';
import { ACTION_SOURCE_LABELS, ActionSource, CapaRecord, CapaWorkflowStep } from '../../types/capa';
import { useApp } from '../../context/AppContext';
import { useTerminology } from '../../hooks/useTerminology';
import { useI18n } from '../../i18n';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { SummaryCard, SummaryGrid, SummaryTone } from '../../components/ui/SummaryCard';
import { FormField, SearchInput, FilterBar } from '../../components/ui/FormField';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/StateViews';
import { AuditReportModal } from '../../components/common/AuditReportModal';
import { PhotoAnnotationModal } from '../../components/common/PhotoAnnotationModal';
import { PhotoEvidenceField } from './PhotoEvidenceField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { RaiseCapaModal, RaiseCapaOrigin } from './RaiseCapaModal';
import { CapaTimelineModal } from './CapaTimelineModal';
import { ReassignActionModal, ChangeDueDateModal } from './CapaManageModals';
import { ACTION_STATUS_LABELS, actionStatusLabel, actionStatusVariant, humanize, BadgeVariant, SEVERITY_LABELS, severityLabel, severityVariant } from '../../constants/labels';
import { CorrectiveAction } from '../../types';
import {
  Layers,
  Clock,
  ShieldCheck,
  AlertOctagon,
  CheckCircle2,
  Camera,
  RefreshCw,
  Kanban,
  Table as TableIcon,
  UserCheck,
  FileCheck,
  AlertTriangle,
  Lightbulb,
  RotateCcw,
  Lock,
  Plus,
  Trash2,
  Play,
  ArrowRight,
  History,
  UserCog,
  CalendarClock,
  TrendingUp,
} from 'lucide-react';

type ActionStatus = CorrectiveAction['status'];

/** Kanban stages in workflow order (each backend status has its own column). */
const KANBAN_STATUSES: ActionStatus[] = ['PENDING_ACKNOWLEDGEMENT', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED', 'PENDING_VERIFICATION', 'VERIFIED', 'CLOSED'];

const COLUMN_HINTS: Partial<Record<ActionStatus, string>> = {
  PENDING_ACKNOWLEDGEMENT: 'Starts once the audit is acknowledged',
  ASSIGNED: 'Waiting for the assignee to start',
  IN_PROGRESS: 'Fix under way',
  REOPENED: 'Rejected, or the fix did not hold',
  PENDING_VERIFICATION: 'Evidence submitted, waiting for a verifier',
  VERIFIED: 'Effectiveness review due',
  CLOSED: 'Fix confirmed',
};

/** Statuses in which the assignee's SLA clock is running. */
const ASSIGNEE_ACTIVE_STATUSES: ActionStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'REOPENED'];

const ROOT_CAUSE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'METHOD', label: 'Method (procedures, work instructions, SOPs)' },
  { value: 'MACHINE', label: 'Machine (tooling, maintenance, wear)' },
  { value: 'MATERIAL', label: 'Material (supplies, part quality, storage)' },
  { value: 'MANPOWER', label: 'Manpower (training, competency, handover)' },
  { value: 'MEASUREMENT', label: 'Measurement (calibration, inspection limits)' },
  { value: 'ENVIRONMENT', label: 'Environment (lighting, ergonomics, layout)' },
];

const EMPTY_FIVE_WHY: FiveWhyInput = {
  why1: '',
  why2: '',
  why3: '',
  why4: '',
  why5: '',
  rootCauseCategory: 'METHOD',
  rootCauseConclusion: '',
  solution: '',
  preventiveAction: '',
  verificationCriteria: '',
};

type WhyKey = 'why1' | 'why2' | 'why3' | 'why4' | 'why5';
const whyKey = (level: number) => `why${level}` as WhyKey;

/** Escalation tiers set by the escalation scheduler; NORMAL is not shown. */
const ESCALATION_TIER_LABELS: Record<string, string> = {
  DUE_SOON: 'Due soon',
  ESCALATED_L1: 'Escalated: level 1',
  ESCALATED_L2: 'Escalated: level 2',
  ESCALATED_L3: 'Escalated: level 3',
};
const escalationLabel = (tier: string) => ESCALATION_TIER_LABELS[tier] ?? humanize(tier);

/** Filters on the action list; each can be preset from the URL (?status=&severity=&locationId=&assigneeId=&overdue=1&source=). */
interface CapaFilters {
  status: string;
  severity: string;
  locationId: string;
  assigneeId: string;
  tier: string;
  source: string;
  overdue: boolean;
}
const NO_FILTERS: CapaFilters = { status: 'ALL', severity: 'ALL', locationId: 'ALL', assigneeId: 'ALL', tier: 'ALL', source: 'ALL', overdue: false };

const filtersFromParams = (params: URLSearchParams): CapaFilters => {
  const status = params.get('status');
  return {
    // status=OVERDUE is accepted as an alias of overdue=1
    status: status && status !== 'OVERDUE' ? status : 'ALL',
    severity: params.get('severity') || 'ALL',
    locationId: params.get('locationId') || 'ALL',
    assigneeId: params.get('assigneeId') || 'ALL',
    tier: params.get('escalationTier') || 'ALL',
    source: params.get('source') || 'ALL',
    overdue: params.get('overdue') === '1' || params.get('overdue') === 'true' || status === 'OVERDUE',
  };
};

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
const allows = (act: CapaRecord, step: CapaWorkflowStep) => act.allowedActions?.includes(step) ?? false;
const executionIdOf = (act: CapaRecord): string | null => act.observation?.execution?.id ?? act.observation?.executionId ?? null;
const sourceLabel = (source?: string | null) => (source && source in ACTION_SOURCE_LABELS ? ACTION_SOURCE_LABELS[source as ActionSource] : humanize(source));
const assigneeName = (act: CapaRecord): string =>
  act.assignee ? `${act.assignee.firstName ?? ''} ${act.assignee.lastName ?? ''}`.trim() || '—' : 'Unassigned';

const ellipsis: React.CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const lineClamp = (lines: number): React.CSSProperties => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

export const CapaManagementPage: React.FC = () => {
  const { addToast, can, currentUser } = useApp();
  const { relabel } = useTerminology();
  const { formatDate, formatDateTime } = useI18n();

  // Deep links: /capa?id=<actionId> highlights one action; status/severity/locationId/assigneeId/overdue/source preset the filters
  const [searchParams] = useSearchParams();
  const linkedActionId = searchParams.get('id');
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Assigners manage every action; everyone else starts with the actions assigned to them, unless a link filters the list
  const [scope, setScope] = useState<'mine' | 'all'>(() => {
    const preset = filtersFromParams(searchParams);
    const linkFiltered = (Object.keys(NO_FILTERS) as Array<keyof CapaFilters>).some((k) => preset[k] !== NO_FILTERS[k]);
    return can('ACTION_ASSIGNERS') || linkFiltered ? 'all' : 'mine';
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actions, setActions] = useState<CapaRecord[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filters, setFilters] = useState<CapaFilters>(() => filtersFromParams(searchParams));
  const setFilter = <K extends keyof CapaFilters>(key: K, value: CapaFilters[K]) => setFilters((prev) => ({ ...prev, [key]: value }));

  // Raise, reassign, reschedule, history, delete
  const [raiseOrigin, setRaiseOrigin] = useState<RaiseCapaOrigin | null>(null);
  const [reassignTarget, setReassignTarget] = useState<CapaRecord | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<CapaRecord | null>(null);
  const [timelineTarget, setTimelineTarget] = useState<CapaRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CapaRecord | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [allowNoPhoto, setAllowNoPhoto] = useState<boolean>(false);

  const [selectedAction, setSelectedAction] = useState<CapaRecord | null>(null);

  // Audit report (acknowledge, or view only)
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  // 5-Why analysis
  const [fiveWhyOpen, setFiveWhyOpen] = useState<boolean>(false);
  const [fiveWhyReadOnly, setFiveWhyReadOnly] = useState<boolean>(false);
  const [activeWhyCount, setActiveWhyCount] = useState<number>(1);
  const [fiveWhyData, setFiveWhyData] = useState<FiveWhyInput>(EMPTY_FIVE_WHY);
  const [fiveWhyErrors, setFiveWhyErrors] = useState<{ rootCause?: string; solution?: string }>({});
  const [saving5Why, setSaving5Why] = useState<boolean>(false);

  // Closure evidence
  const [closureOpen, setClosureOpen] = useState<boolean>(false);
  const [closureNotes, setClosureNotes] = useState<string>('');
  const [afterPhotoUrl, setAfterPhotoUrl] = useState<string>('');
  const [noPhotoJustification, setNoPhotoJustification] = useState<string>('');
  const [closureErrors, setClosureErrors] = useState<{ photo?: string; notes?: string; justification?: string }>({});
  const [submittingClosure, setSubmittingClosure] = useState<boolean>(false);
  const [annotationOpen, setAnnotationOpen] = useState<boolean>(false);

  // Verification
  const [verificationOpen, setVerificationOpen] = useState<boolean>(false);
  const [verificationNotes, setVerificationNotes] = useState<string>('');
  const [verificationError, setVerificationError] = useState<string>('');
  const [verifying, setVerifying] = useState<'approve' | 'reject' | null>(null);

  // Effectiveness review (VERIFIED -> CLOSED, or REOPENED when the fix did not hold)
  const [effectivenessOpen, setEffectivenessOpen] = useState<boolean>(false);
  const [effectiveChoice, setEffectiveChoice] = useState<boolean | null>(null);
  const [effectivenessReview, setEffectivenessReview] = useState<string>('');
  const [reviewError, setReviewError] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);

  const [startingId, setStartingId] = useState<string | null>(null);

  // Links from dashboards change the query string while the page stays mounted
  const paramKey = searchParams.toString();
  useEffect(() => {
    setFilters(filtersFromParams(new URLSearchParams(paramKey)));
  }, [paramKey]);

  // Whether the organization lets an action be closed without an after photo (with a justification)
  useEffect(() => {
    capaApi
      .closurePolicy()
      .then((p) => setAllowNoPhoto(p.allowClosureWithoutPhoto))
      .catch(() => setAllowNoPhoto(false));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setActions(await capaApi.list(scope === 'mine' ? { assigneeId: 'me' } : undefined));
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Could not load corrective actions.'));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handled once per linked id (reloads after workflow actions must not re-scroll or re-warn)
  const handledLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!linkedActionId) {
      handledLinkRef.current = null;
      setHighlightId(null);
      return;
    }
    if (loading || loadError || handledLinkRef.current === linkedActionId) return;
    const target = actions.find((a) => a.id === linkedActionId);
    if (!target && scope === 'mine') {
      // The linked action may be assigned to someone else: look in all actions before giving up
      setScope('all');
      return;
    }
    handledLinkRef.current = linkedActionId;
    if (!target) {
      setHighlightId(null);
      addToast({ type: 'warning', title: 'Action not found', message: 'The linked corrective action is no longer available to you.' });
      return;
    }
    // Make sure no filter hides it, then bring it into view once rendered
    setFilters(NO_FILTERS);
    setSearchQuery('');
    setHighlightId(target.id);
    window.setTimeout(() => {
      document.getElementById(`capa-action-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedActionId, loading, loadError, scope]);

  const highlightStyle = (id: string): React.CSSProperties =>
    id === highlightId ? { outline: '2px solid var(--color-primary)', outlineOffset: '2px', boxShadow: '0 0 0 6px var(--color-primary-light)' } : {};

  const replaceAction = (updated: CapaRecord) => setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));

  // ---------- 5-Why ----------
  const open5Why = (action: CapaRecord) => {
    const existing = action.fiveWhyAnalysis;
    const deepest = [5, 4, 3, 2].find((n) => existing?.[whyKey(n)]) ?? 1;
    setSelectedAction(action);
    setFiveWhyReadOnly(!allows(action, 'ANALYSE'));
    setActiveWhyCount(deepest);
    setFiveWhyErrors({});
    setFiveWhyData({
      why1: existing?.why1 || '',
      why2: existing?.why2 || '',
      why3: existing?.why3 || '',
      why4: existing?.why4 || '',
      why5: existing?.why5 || '',
      rootCauseCategory: action.rootCauseCategory || 'METHOD',
      rootCauseConclusion: existing?.rootCauseConclusion || '',
      solution: existing?.solution || '',
      preventiveAction: existing?.preventiveAction || '',
      verificationCriteria: existing?.verificationCriteria || '',
    });
    setFiveWhyOpen(true);
  };

  const handleRemoveWhy = (levelToRemove: number) => {
    if (activeWhyCount <= 1) return;
    setFiveWhyData((prev) => {
      const next = { ...prev };
      // Shift deeper answers up so the chain stays contiguous
      for (let i = levelToRemove; i < activeWhyCount; i++) next[whyKey(i)] = next[whyKey(i + 1)];
      next[whyKey(activeWhyCount)] = '';
      return next;
    });
    setActiveWhyCount((prev) => prev - 1);
  };

  const handleSave5Why = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAction || saving5Why) return;
    const errors: { rootCause?: string; solution?: string } = {};
    const whys = [1, 2, 3, 4, 5].map((n) => fiveWhyData[whyKey(n)].trim());
    if (!fiveWhyData.rootCauseConclusion.trim() && !whys.some(Boolean)) errors.rootCause = 'Answer at least Why #1 or state the root cause.';
    if (!fiveWhyData.solution.trim()) errors.solution = 'Describe the solution.';
    setFiveWhyErrors(errors);
    if (errors.rootCause || errors.solution) return;

    setSaving5Why(true);
    try {
      const updated = await capaCoreApi.update5Why(selectedAction.id, fiveWhyData);
      replaceAction(updated);
      setFiveWhyOpen(false);
      addToast({ type: 'success', title: 'Root cause saved', message: `Root cause and solution saved for ${updated.actionCode}.` });
    } catch (err) {
      addToast({ type: 'error', title: 'Save failed', message: getApiErrorMessage(err, 'Could not save the root cause analysis.') });
    } finally {
      setSaving5Why(false);
    }
  };

  // ---------- Start work ----------
  const handleStart = async (action: CapaRecord) => {
    if (startingId) return;
    setStartingId(action.id);
    try {
      await api.updateCorrectiveAction(action.id, { status: 'IN_PROGRESS' });
      // Reload the row so it carries the allowed steps for its new status
      replaceAction(await capaApi.get(action.id));
    } catch (err) {
      addToast({ type: 'error', title: 'Could not start', message: getApiErrorMessage(err, 'Could not mark the action as in progress.') });
    } finally {
      setStartingId(null);
    }
  };

  // ---------- Closure evidence ----------
  const openClosure = (action: CapaRecord) => {
    setSelectedAction(action);
    setClosureNotes(action.closureNotes || '');
    setAfterPhotoUrl(action.afterPhotoUrl || '');
    setNoPhotoJustification('');
    setClosureErrors({});
    setClosureOpen(true);
  };

  const closureReady = !!selectedAction && hasRootCauseAndSolution(selectedAction.fiveWhyAnalysis);

  const handleSubmitClosure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAction || submittingClosure || !closureReady) return;
    const errors: { photo?: string; notes?: string; justification?: string } = {};
    // Without a photo only when the organization allows it, and then with a justification
    if (!afterPhotoUrl && !allowNoPhoto) errors.photo = 'Add a photo of the fixed area.';
    if (!afterPhotoUrl && allowNoPhoto && !noPhotoJustification.trim()) errors.justification = 'Explain why there is no after photo, or add one.';
    if (!closureNotes.trim()) errors.notes = 'Describe what was done.';
    setClosureErrors(errors);
    if (errors.photo || errors.notes || errors.justification) return;

    setSubmittingClosure(true);
    try {
      const updated = await capaApi.submitClosure(
        selectedAction.id,
        afterPhotoUrl
          ? { closureNotes: closureNotes.trim(), afterPhotoUrl }
          : { closureNotes: closureNotes.trim(), noPhotoJustification: noPhotoJustification.trim() },
      );
      replaceAction(updated);
      setClosureOpen(false);
      addToast({ type: 'success', title: 'Sent for verification', message: `${updated.actionCode} is waiting for an independent verifier.` });
    } catch (err) {
      addToast({ type: 'error', title: 'Submission failed', message: getApiErrorMessage(err, 'Could not submit the closure evidence.') });
    } finally {
      setSubmittingClosure(false);
    }
  };

  // ---------- Verification ----------
  const openVerification = (action: CapaRecord) => {
    setSelectedAction(action);
    setVerificationNotes('');
    setVerificationError('');
    setVerificationOpen(true);
  };

  const handleVerify = async (approved: boolean) => {
    if (!selectedAction || verifying) return;
    // The assignee must be told what to fix: a rejection needs the reason
    if (!approved && !verificationNotes.trim()) {
      setVerificationError('Give the reason for rejecting the evidence. The assignee will see it.');
      return;
    }
    setVerificationError('');
    setVerifying(approved ? 'approve' : 'reject');
    try {
      const updated = await capaApi.verify(selectedAction.id, { approved, verificationNotes: verificationNotes.trim() || undefined });
      replaceAction(updated);
      setVerificationOpen(false);
      addToast(
        approved
          ? { type: 'success', title: 'Action verified', message: `${updated.actionCode} is verified. An effectiveness review will close it.` }
          : { type: 'warning', title: 'Action reopened', message: `${updated.actionCode} was sent back to the assignee.` },
      );
    } catch (err) {
      addToast({ type: 'error', title: 'Verification failed', message: getApiErrorMessage(err, 'Could not record the verification.') });
    } finally {
      setVerifying(null);
    }
  };

  // ---------- Effectiveness review ----------
  const openEffectiveness = (action: CapaRecord) => {
    setSelectedAction(action);
    setEffectiveChoice(null);
    setEffectivenessReview('');
    setReviewError('');
    setEffectivenessOpen(true);
  };

  const handleEffectivenessReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAction || submittingReview) return;
    const review = effectivenessReview.trim();
    if (effectiveChoice === null) {
      setReviewError('Choose whether the fix was effective.');
      return;
    }
    if (!review) {
      setReviewError('Describe how the effectiveness of the fix was checked.');
      return;
    }
    setReviewError('');
    setSubmittingReview(true);
    try {
      const updated = await capaCoreApi.close(selectedAction.id, { effective: effectiveChoice, effectivenessReview: review });
      setEffectivenessOpen(false);
      addToast(
        effectiveChoice
          ? { type: 'success', title: 'Action closed', message: `${updated.actionCode} passed its effectiveness review and is closed.` }
          : { type: 'warning', title: 'Action reopened', message: `${updated.actionCode} was reopened because the fix did not hold.` },
      );
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Review failed', message: getApiErrorMessage(err, 'Could not record the effectiveness review.') });
    } finally {
      setSubmittingReview(false);
    }
  };

  // ---------- Delete (programme managers) ----------
  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await capaApi.remove(deleteTarget.id);
      setActions((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      addToast({ type: 'success', title: 'Action deleted', message: `${deleteTarget.actionCode} was deleted.` });
      setDeleteTarget(null);
    } catch (err) {
      addToast({ type: 'error', title: 'Not deleted', message: getApiErrorMessage(err, 'The corrective action could not be deleted.') });
    } finally {
      setDeleting(false);
    }
  };

  // ---------- Rendering helpers ----------
  const renderStatusBadge = (act: CapaRecord) => {
    if (act.status === 'CLOSED') {
      return (
        <Badge variant="neutral" icon={<Lock size={11} />}>
          {actionStatusLabel(act.status)}
        </Badge>
      );
    }
    const variant: BadgeVariant = act.isOverdue ? 'danger' : actionStatusVariant(act.status);
    return <Badge variant={variant}>{actionStatusLabel(act.status)}</Badge>;
  };

  /** Severity of the finding, source of the action and escalation tier (when escalated). */
  const renderTags = (act: CapaRecord) => {
    const severity = act.observation?.severity;
    const tier = act.escalationTier;
    return (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {severity && <Badge variant={severityVariant(severity)}>{severityLabel(severity)}</Badge>}
        {act.source && <Badge variant="neutral">{sourceLabel(act.source)}</Badge>}
        {act.redTagId && (
          <Link to={`/red-tags?id=${act.redTagId}`} style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-primary)' }}>
            View red tag
          </Link>
        )}
        {tier && tier !== 'NORMAL' && (
          <Badge variant={tier === 'DUE_SOON' ? 'warning' : 'danger'} icon={<TrendingUp size={10} />}>
            {escalationLabel(tier)}
          </Badge>
        )}
      </div>
    );
  };

  /** Why the verifier sent the evidence back; shown to the assignee while the action is reopened. */
  const renderRejection = (act: CapaRecord) =>
    act.status === 'REOPENED' && act.verificationNotes && !act.effectivenessReview ? (
      <div role="note" style={{ padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', fontSize: '12.5px' }}>
        <div style={{ fontWeight: 600, color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <RotateCcw size={12} aria-hidden="true" /> Sent back by the verifier
        </div>
        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.35, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{act.verificationNotes}</div>
      </div>
    ) : null;

  /** Countdown for the assignee while the action is with them; a plain state label otherwise. */
  const renderSla = (act: CapaRecord) => {
    const base: React.CSSProperties = { fontSize: '12.5px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' };
    const due = `Due ${formatDateTime(act.targetDate)}`;
    if (act.status === 'PENDING_ACKNOWLEDGEMENT') {
      return (
        <span style={{ ...base, color: 'var(--color-warning)' }}>
          <Lock size={12} aria-hidden="true" /> Starts after audit sign-off
        </span>
      );
    }
    if (act.status === 'PENDING_VERIFICATION') {
      return (
        <span style={{ ...base, color: 'var(--color-purple)' }}>
          <UserCheck size={12} aria-hidden="true" /> Awaiting verification
        </span>
      );
    }
    if (!ASSIGNEE_ACTIVE_STATUSES.includes(act.status)) return null;

    const hoursLeft = (new Date(act.targetDate).getTime() - Date.now()) / 3600000;
    if (act.isOverdue) {
      const over = Math.max(1, Math.round(-hoursLeft));
      return (
        <span title={due} style={{ ...base, color: 'var(--color-danger)' }}>
          <AlertOctagon size={12} aria-hidden="true" /> Overdue by {over >= 24 ? plural(Math.floor(over / 24), 'day') : plural(over, 'hour')}
        </span>
      );
    }
    if (hoursLeft <= 24) {
      return (
        <span title={due} style={{ ...base, color: 'var(--color-warning)' }}>
          <Clock size={12} aria-hidden="true" /> Due in {plural(Math.max(1, Math.round(hoursLeft)), 'hour')}
        </span>
      );
    }
    return (
      <span title={due} style={{ ...base, color: 'var(--text-secondary)' }}>
        <Clock size={12} aria-hidden="true" /> {plural(Math.floor(hoursLeft / 24), 'day')} left
      </span>
    );
  };

  /** Closure details from the effectiveness review (also kept when the action was reopened). */
  const renderEffectivenessDetails = (act: CapaRecord, compact = false) => {
    if (!act.effectivenessReview && !act.closedAt) return null;
    const closed = act.status === 'CLOSED';
    return (
      <div
        style={{
          padding: compact ? '6px 8px' : '8px 10px',
          borderRadius: 'var(--radius-sm)',
          background: closed ? 'var(--bg-surface-subtle)' : 'var(--color-danger-bg)',
          border: `1px solid ${closed ? 'var(--border-subtle)' : 'var(--color-danger-border)'}`,
          fontSize: '12.5px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: closed ? 'var(--text-primary)' : 'var(--color-danger)', flexWrap: 'wrap' }}>
          {closed ? <Lock size={12} aria-hidden="true" /> : <RotateCcw size={12} aria-hidden="true" />}
          <span>{closed ? 'Effectiveness confirmed' : 'Last review: not effective'}</span>
          {closed && act.closedAt && <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>· Closed {formatDate(act.closedAt)}</span>}
        </div>
        {act.effectivenessReview && (
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.35, whiteSpace: 'pre-wrap', ...(compact ? lineClamp(3) : {}) }}>{act.effectivenessReview}</div>
        )}
      </div>
    );
  };

  const openAudit = (act: CapaRecord) => {
    const execId = executionIdOf(act);
    if (execId) setSelectedAuditId(execId);
  };

  /** Workflow buttons for one action: only the steps the server will accept for this user. */
  const renderActionButtons = (act: CapaRecord) => {
    const analysis = act.fiveWhyAnalysis;
    const hasAnalysis = !!analysis && Object.values(analysis).some((v) => typeof v === 'string' && v.trim());
    const execId = executionIdOf(act);
    return (
      <>
        {act.status === 'PENDING_ACKNOWLEDGEMENT' && (
          <Button type="button" size="sm" variant="secondary" icon={<FileCheck size={13} />} onClick={() => openAudit(act)} disabled={!execId} title={execId ? undefined : 'No audit is linked to this action'}>
            {can('AUDITEES') ? 'Review audit findings' : 'View audit report'}
          </Button>
        )}
        {allows(act, 'START') && (
          <Button type="button" size="sm" variant="secondary" icon={<Play size={13} />} onClick={() => handleStart(act)} loading={startingId === act.id} disabled={!!startingId && startingId !== act.id}>
            Start work
          </Button>
        )}
        {allows(act, 'ANALYSE') ? (
          <Button type="button" size="sm" variant="secondary" icon={<Lightbulb size={13} />} onClick={() => open5Why(act)}>
            {hasAnalysis ? 'Edit root cause' : '5-Why & solution'}
          </Button>
        ) : (
          hasAnalysis && (
            <Button type="button" size="sm" variant="ghost" icon={<Lightbulb size={13} />} onClick={() => open5Why(act)}>
              View root cause
            </Button>
          )
        )}
        {allows(act, 'SUBMIT_CLOSURE') && (
          <Button type="button" size="sm" variant="primary" icon={<Camera size={13} />} onClick={() => openClosure(act)}>
            Submit proof
          </Button>
        )}
        {allows(act, 'VERIFY') && (
          <Button type="button" size="sm" variant="primary" icon={<ShieldCheck size={13} />} onClick={() => openVerification(act)}>
            Verify
          </Button>
        )}
        {allows(act, 'CLOSE') && (
          <Button type="button" size="sm" variant="primary" icon={<CheckCircle2 size={13} />} onClick={() => openEffectiveness(act)}>
            Effectiveness review
          </Button>
        )}
        {allows(act, 'REASSIGN') && (
          <Button type="button" size="sm" variant="ghost" icon={<UserCog size={13} />} onClick={() => setReassignTarget(act)}>
            Reassign
          </Button>
        )}
        {allows(act, 'RESCHEDULE') && (
          <Button type="button" size="sm" variant="ghost" icon={<CalendarClock size={13} />} onClick={() => setRescheduleTarget(act)}>
            Change due date
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" icon={<History size={13} />} onClick={() => setTimelineTarget(act)} aria-label={`History of ${act.actionCode}`}>
          History
        </Button>
        {allows(act, 'DELETE') && (
          <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => setDeleteTarget(act)} aria-label={`Delete ${act.actionCode}`}>
            Delete
          </Button>
        )}
      </>
    );
  };

  // ---------- Derived data ----------
  const pendingAckCount = actions.filter((a) => a.status === 'PENDING_ACKNOWLEDGEMENT').length;
  const overdueCount = actions.filter((a) => a.isOverdue).length;
  const pendingVerificationCount = actions.filter((a) => a.status === 'PENDING_VERIFICATION').length;
  const verifiedCount = actions.filter((a) => a.status === 'VERIFIED').length;
  const closedCount = actions.filter((a) => a.status === 'CLOSED').length;

  /** Audits whose acknowledgement is holding actions back (one entry per audit). */
  const pendingAudits = useMemo(() => {
    const byAudit = new Map<string, { id: string; code: string; count: number }>();
    for (const a of actions) {
      if (a.status !== 'PENDING_ACKNOWLEDGEMENT') continue;
      const id = executionIdOf(a);
      if (!id) continue;
      const entry = byAudit.get(id) ?? { id, code: a.observation?.execution?.auditCode ?? 'Audit', count: 0 };
      entry.count++;
      byAudit.set(id, entry);
    }
    return Array.from(byAudit.values());
  }, [actions]);

  /** Locations and assignees present in the loaded actions (filter options). */
  const locationOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of actions) if (a.location) map.set(a.locationId, `${a.location.areaCode} — ${a.location.name}`);
    return Array.from(map.entries()).sort((x, y) => x[1].localeCompare(y[1]));
  }, [actions]);
  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of actions) if (a.assigneeId) map.set(a.assigneeId, assigneeName(a));
    return Array.from(map.entries()).sort((x, y) => x[1].localeCompare(y[1]));
  }, [actions]);

  const filteredActions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const f = filters;
    return actions.filter((a) => {
      if (f.status !== 'ALL' && a.status !== f.status) return false;
      if (f.severity !== 'ALL' && a.observation?.severity !== f.severity) return false;
      if (f.locationId !== 'ALL' && a.locationId !== f.locationId) return false;
      if (f.assigneeId !== 'ALL' && (f.assigneeId === 'me' ? a.assigneeId !== currentUser?.id : a.assigneeId !== f.assigneeId)) return false;
      if (f.tier !== 'ALL' && (a.escalationTier ?? 'NORMAL') !== f.tier) return false;
      if (f.source !== 'ALL' && (a.source ?? 'AUDIT') !== f.source) return false;
      if (f.overdue && !a.isOverdue) return false;
      if (!q) return true;
      const haystack = [
        a.actionCode,
        a.title,
        a.description,
        a.location?.name,
        a.location?.areaCode,
        assigneeName(a),
        a.rootCauseCategory,
        humanize(a.rootCauseCategory),
        a.fiveWhyAnalysis?.rootCauseConclusion,
        a.fiveWhyAnalysis?.solution,
      ];
      return haystack.some((v) => typeof v === 'string' && v.toLowerCase().includes(q));
    });
  }, [actions, searchQuery, filters, currentUser?.id]);

  const kanbanColumns = KANBAN_STATUSES.map((status) => ({
    status,
    items: filteredActions.filter((a) => a.status === status),
  }));

  const filtersActive = (Object.keys(NO_FILTERS) as Array<keyof CapaFilters>).some((k) => filters[k] !== NO_FILTERS[k]);
  // Each KPI tile filters the list to the actions it counts (clicking the active tile clears it)
  const statusTile = (status: string) => ({
    selected: !filters.overdue && filters.status === status,
    onClick: () => setFilters(filters.status === status && !filters.overdue ? NO_FILTERS : { ...NO_FILTERS, status }),
  });
  const kpis: Array<{ label: string; value: number; icon: React.ReactNode; tone: SummaryTone; selected: boolean; onClick: () => void }> = [
    { label: scope === 'mine' ? 'Assigned to me' : 'All actions', value: actions.length, icon: <Layers size={18} />, tone: 'primary', selected: !filtersActive, onClick: () => setFilters(NO_FILTERS) },
    { label: 'Awaiting audit sign-off', value: pendingAckCount, icon: <Lock size={18} />, tone: 'warning', ...statusTile('PENDING_ACKNOWLEDGEMENT') },
    {
      label: 'Overdue',
      value: overdueCount,
      icon: <AlertOctagon size={18} />,
      tone: 'danger',
      selected: filters.overdue,
      onClick: () => setFilters(filters.overdue ? NO_FILTERS : { ...NO_FILTERS, overdue: true }),
    },
    { label: 'Awaiting verification', value: pendingVerificationCount, icon: <UserCheck size={18} />, tone: 'purple', ...statusTile('PENDING_VERIFICATION') },
    { label: 'Verified, review due', value: verifiedCount, icon: <ShieldCheck size={18} />, tone: 'success', ...statusTile('VERIFIED') },
    { label: 'Closed', value: closedCount, icon: <CheckCircle2 size={18} />, tone: 'neutral', ...statusTile('CLOSED') },
  ];

  const emptyDescription =
    actions.length === 0
      ? scope === 'mine'
        ? 'No corrective actions are assigned to you.'
        : 'Corrective actions appear here when audit findings are assigned or actions are raised.'
      : 'No actions match your search or filters.';

  const selectedAnalysis = selectedAction?.fiveWhyAnalysis;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title={relabel('Corrective actions')}
        description="Corrective and preventive actions from audit findings: find the root cause, fix it, then verify the fix held."
        actions={
          <>
            <div role="group" aria-label="Which actions" style={{ display: 'flex', gap: '4px' }}>
              <button type="button" className="pillar-tab-pill" aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>
                Assigned to me
              </button>
              <button type="button" className="pillar-tab-pill" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
                All actions
              </button>
            </div>
            <div role="group" aria-label="Layout" style={{ display: 'flex', gap: '4px' }}>
              <button type="button" className="pillar-tab-pill" aria-pressed={viewMode === 'kanban'} onClick={() => setViewMode('kanban')}>
                <Kanban size={14} aria-hidden="true" /> Board
              </button>
              <button type="button" className="pillar-tab-pill" aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')}>
                <TableIcon size={14} aria-hidden="true" /> Table
              </button>
            </div>
            <Button type="button" variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => loadData()} loading={loading}>
              Refresh
            </Button>
            {can('ACTION_ASSIGNERS') && (
              <Button type="button" variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setRaiseOrigin({ kind: 'standalone', locationId: filters.locationId !== 'ALL' ? filters.locationId : undefined })}>
                New corrective action
              </Button>
            )}
          </>
        }
      />

      {/* Audits waiting for the auditee's acknowledgement */}
      {can('AUDITEES') && pendingAckCount > 0 && (
        <div
          role="status"
          style={{
            background: 'var(--color-warning-bg)',
            border: '1px solid var(--color-warning-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <AlertTriangle size={20} color="var(--color-warning)" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {plural(pendingAckCount, 'action')} {pendingAckCount === 1 ? 'is' : 'are'} waiting for audit sign-off
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Work and the SLA clock start once the audit findings are accepted or disputed.
              </div>
            </div>
          </div>
          {pendingAudits.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {pendingAudits.map((audit) => (
                <Button key={audit.id} type="button" size="sm" variant="secondary" icon={<FileCheck size={13} />} onClick={() => setSelectedAuditId(audit.id)}>
                  Review {audit.code} ({plural(audit.count, 'action')})
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* KPI summary */}
      <SummaryGrid min={170}>
        {kpis.map((k) => (
          <SummaryCard key={k.label} label={k.label} value={loading ? '—' : k.value} icon={k.icon} tone={k.tone} selected={k.selected} onClick={k.onClick} />
        ))}
      </SummaryGrid>

      {/* Search & filter */}
      <FilterBar label="Filter corrective actions">
        <SearchInput
          label="Search corrective actions"
          placeholder="Search by code, title, location, assignee or root cause"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select className="form-select" aria-label="Status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="ALL">All statuses</option>
          {Object.keys(ACTION_STATUS_LABELS).map((s) => (
            <option key={s} value={s}>
              {actionStatusLabel(s)}
            </option>
          ))}
        </select>
        <select className="form-select" aria-label="Severity" value={filters.severity} onChange={(e) => setFilter('severity', e.target.value)}>
          <option value="ALL">All severities</option>
          {Object.entries(SEVERITY_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <select className="form-select" aria-label="Location" value={filters.locationId} onChange={(e) => setFilter('locationId', e.target.value)}>
          <option value="ALL">All locations</option>
          {filters.locationId !== 'ALL' && !locationOptions.some(([id]) => id === filters.locationId) && <option value={filters.locationId}>Linked location</option>}
          {locationOptions.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select className="form-select" aria-label="Assignee" value={filters.assigneeId} onChange={(e) => setFilter('assigneeId', e.target.value)}>
          <option value="ALL">All assignees</option>
          <option value="me">Assigned to me</option>
          {filters.assigneeId !== 'ALL' && filters.assigneeId !== 'me' && !assigneeOptions.some(([id]) => id === filters.assigneeId) && (
            <option value={filters.assigneeId}>Linked assignee</option>
          )}
          {assigneeOptions.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select className="form-select" aria-label="Escalation" value={filters.tier} onChange={(e) => setFilter('tier', e.target.value)}>
          <option value="ALL">Any escalation</option>
          <option value="NORMAL">Not escalated</option>
          {Object.entries(ESCALATION_TIER_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <select className="form-select" aria-label="Source" value={filters.source} onChange={(e) => setFilter('source', e.target.value)}>
          <option value="ALL">All sources</option>
          {(Object.keys(ACTION_SOURCE_LABELS) as ActionSource[]).map((code) => (
            <option key={code} value={code}>
              {ACTION_SOURCE_LABELS[code]}
            </option>
          ))}
        </select>
        <label htmlFor="capa-overdue-only" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', minHeight: '40px', cursor: 'pointer' }}>
          <input id="capa-overdue-only" type="checkbox" checked={filters.overdue} onChange={(e) => setFilter('overdue', e.target.checked)} />
          Overdue only
        </label>
        {filtersActive && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </Button>
        )}
      </FilterBar>

      {loading && actions.length === 0 ? (
        <Card>
          <LoadingState label="Loading corrective actions…" />
        </Card>
      ) : loadError ? (
        <Card>
          <ErrorState message={loadError} onRetry={() => loadData()} />
        </Card>
      ) : filteredActions.length === 0 ? (
        <Card>
          <EmptyState
            title="No corrective actions"
            description={emptyDescription}
            action={
              scope === 'mine' && actions.length === 0 ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => setScope('all')}>
                  Show all actions
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : viewMode === 'kanban' ? (
        /* Board: one column per status; empty columns are narrow, the board scrolls sideways */
        <div>
          <div className="form-hint" style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Scroll sideways to see every stage <ArrowRight size={12} aria-hidden="true" />
          </div>
          <div
            role="list"
            aria-label="Corrective actions by status"
            style={{ display: 'flex', gap: '12px', overflowX: 'auto', alignItems: 'flex-start', paddingBottom: '12px', scrollSnapType: 'x proximity' }}
          >
            {kanbanColumns.map((col) => {
              const empty = col.items.length === 0;
              return (
                <section
                  key={col.status}
                  role="listitem"
                  aria-label={`${actionStatusLabel(col.status)}: ${plural(col.items.length, 'action')}`}
                  style={{
                    flex: empty ? '0 0 168px' : '0 0 min(300px, 85vw)',
                    scrollSnapAlign: 'start',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                  }}
                >
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{actionStatusLabel(col.status)}</h2>
                      <Badge variant="neutral">{col.items.length}</Badge>
                    </div>
                    {!empty && <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>{COLUMN_HINTS[col.status]}</div>}
                  </div>

                  <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {empty ? (
                      <div style={{ textAlign: 'center', padding: '12px 4px', color: 'var(--text-tertiary)', fontSize: '13px' }}>None</div>
                    ) : (
                      col.items.map((act) => (
                        <article
                          key={act.id}
                          id={`capa-action-${act.id}`}
                          style={{
                            ...highlightStyle(act.id),
                            padding: '12px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            minWidth: 0,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span className="code-tag">{act.actionCode}</span>
                            {act.status === 'CLOSED' || act.status === 'VERIFIED' ? renderStatusBadge(act) : renderSla(act)}
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-primary)', lineHeight: 1.35, ...lineClamp(2) }}>{act.title}</h3>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45, ...lineClamp(3) }}>{act.description}</p>
                          </div>

                          {renderTags(act)}
                          {renderRejection(act)}

                          {act.status !== 'PENDING_ACKNOWLEDGEMENT' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <Badge variant="neutral">Cause: {humanize(act.rootCauseCategory)}</Badge>
                                {act.reopenCount > 0 && (
                                  <Badge variant="danger" icon={<RotateCcw size={10} />}>
                                    Reopened {act.reopenCount === 1 ? 'once' : `${act.reopenCount} times`}
                                  </Badge>
                                )}
                              </div>
                              {act.fiveWhyAnalysis?.solution ? (
                                <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '12.5px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: 'var(--color-success)' }}>
                                    <Lightbulb size={12} aria-hidden="true" /> Solution
                                  </div>
                                  <div style={{ color: 'var(--text-primary)', lineHeight: 1.35, ...lineClamp(3) }}>{act.fiveWhyAnalysis.solution}</div>
                                </div>
                              ) : (
                                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <AlertTriangle size={12} color="var(--color-warning)" aria-hidden="true" /> Root cause and solution not recorded yet
                                </div>
                              )}
                            </div>
                          )}

                          {renderEffectivenessDetails(act, true)}

                          <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px', color: 'var(--text-secondary)', minWidth: 0 }}>
                            <span style={ellipsis} title={act.location?.name}>
                              {act.location?.name ?? '—'}
                            </span>
                            <span style={{ ...ellipsis, flexShrink: 0, maxWidth: '50%' }} title={assigneeName(act)}>
                              {assigneeName(act)}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{renderActionButtons(act)}</div>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <Card noPadding>
          <div className="enterprise-table-container">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th scope="col">Action</th>
                  <th scope="col">Finding</th>
                  <th scope="col">Root cause &amp; solution</th>
                  <th scope="col">Assignee</th>
                  <th scope="col">Target date</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredActions.map((act) => (
                  <tr key={act.id} id={`capa-action-${act.id}`} style={highlightStyle(act.id)}>
                    <td>
                      <span className="code-tag">{act.actionCode}</span>
                    </td>
                    <td style={{ maxWidth: '280px' }}>
                      <div style={{ fontWeight: 600, ...lineClamp(2) }}>{act.title}</div>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '4px', ...ellipsis }} title={act.location?.name}>
                        {act.location?.name ?? '—'}
                      </div>
                      {renderTags(act)}
                    </td>
                    <td style={{ maxWidth: '260px' }}>
                      {act.status === 'PENDING_ACKNOWLEDGEMENT' ? (
                        <span style={{ fontSize: '12.5px', color: 'var(--color-warning)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Lock size={12} aria-hidden="true" /> Waiting for audit sign-off
                        </span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          <Badge variant="neutral">{humanize(act.rootCauseCategory)}</Badge>
                          {act.fiveWhyAnalysis?.solution ? (
                            <span style={{ fontSize: '12.5px', color: 'var(--text-primary)', ...lineClamp(2) }} title={act.fiveWhyAnalysis.solution}>
                              {act.fiveWhyAnalysis.solution}
                            </span>
                          ) : (
                            <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>Not recorded yet</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>{assigneeName(act)}</td>
                    <td>
                      <div style={{ whiteSpace: 'nowrap' }}>{formatDate(act.targetDate)}</div>
                      {renderSla(act)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '260px' }}>
                        <div>{renderStatusBadge(act)}</div>
                        {renderRejection(act)}
                        {renderEffectivenessDetails(act, true)}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', minWidth: '180px' }}>{renderActionButtons(act)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal: 5-Why root cause analysis & solution */}
      <Modal
        isOpen={fiveWhyOpen}
        onClose={() => {
          if (!saving5Why) setFiveWhyOpen(false);
        }}
        title={`Root cause & solution: ${selectedAction?.actionCode ?? ''}`}
        subtitle={fiveWhyReadOnly ? 'Read only: this action can no longer be analysed.' : 'Ask "why" until the underlying cause is clear, then record the fix.'}
        maxWidth="680px"
        footer={
          fiveWhyReadOnly ? (
            <Button type="button" variant="secondary" onClick={() => setFiveWhyOpen(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={() => setFiveWhyOpen(false)} disabled={saving5Why}>
                Cancel
              </Button>
              <Button type="submit" form="capa-five-why-form" variant="primary" icon={<CheckCircle2 size={16} />} loading={saving5Why}>
                Save root cause &amp; solution
              </Button>
            </>
          )
        }
      >
        <form id="capa-five-why-form" onSubmit={handleSave5Why} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <fieldset disabled={fiveWhyReadOnly} style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
            <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-pale)', border: '1px solid var(--color-info-border)', fontSize: '13px' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedAction?.title}</div>
              {selectedAction?.description && <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>{selectedAction.description}</div>}
              {selectedAction && (selectedAction.effectivenessReview || selectedAction.closedAt) && <div style={{ marginTop: '8px' }}>{renderEffectivenessDetails(selectedAction)}</div>}
            </div>

            {/* Step 1: 5-Why */}
            <section>
              <h3 className="form-section-title" style={{ marginTop: 0 }}>Step 1: Find the root cause</h3>

              <FormField label="Cause category" required>
                {(p) => (
                  <select {...p} className="form-select" value={fiveWhyData.rootCauseCategory} onChange={(e) => setFiveWhyData({ ...fiveWhyData, rootCauseCategory: e.target.value })}>
                    {ROOT_CAUSE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Array.from({ length: activeWhyCount }, (_, i) => i + 1).map((level) => {
                  const key = whyKey(level);
                  const fieldId = `capa-why-${level}`;
                  return (
                    <div key={level} className="form-group" style={{ margin: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
                        <label className="form-label" htmlFor={fieldId} style={{ margin: 0 }}>
                          Why #{level}
                        </label>
                        {level > 1 && !fiveWhyReadOnly && (
                          <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => handleRemoveWhy(level)} aria-label={`Remove why #${level}`}>
                            Remove
                          </Button>
                        )}
                      </div>
                      <textarea
                        id={fieldId}
                        rows={2}
                        className="form-textarea"
                        placeholder={level === 1 ? 'Why did the problem happen?' : `Why did the answer to #${level - 1} happen?`}
                        value={fiveWhyData[key]}
                        onChange={(e) => setFiveWhyData({ ...fiveWhyData, [key]: e.target.value })}
                      />
                    </div>
                  );
                })}

                {activeWhyCount < 5 && !fiveWhyReadOnly && (
                  <div>
                    <Button type="button" variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => setActiveWhyCount((n) => Math.min(5, n + 1))}>
                      Add why #{activeWhyCount + 1}
                    </Button>
                  </div>
                )}

                <FormField label="Root cause" error={fiveWhyErrors.rootCause} hint="Required: answer at least one why, or state the root cause here." style={{ margin: 0 }}>
                  {(p) => (
                    <textarea
                      {...p}
                      rows={2}
                      className="form-textarea"
                      placeholder="The underlying cause the answers lead to (e.g. no fixed place for the tool)"
                      value={fiveWhyData.rootCauseConclusion}
                      onChange={(e) => setFiveWhyData({ ...fiveWhyData, rootCauseConclusion: e.target.value })}
                    />
                  )}
                </FormField>
              </div>
            </section>

            {/* Step 2: Solution */}
            <section>
              <h3 className="form-section-title" style={{ marginTop: 0 }}>Step 2: Fix it for good</h3>

              <FormField label="Solution" required error={fiveWhyErrors.solution}>
                {(p) => (
                  <textarea
                    {...p}
                    rows={3}
                    className="form-textarea"
                    placeholder="What will be changed so the problem cannot come back?"
                    value={fiveWhyData.solution}
                    onChange={(e) => setFiveWhyData({ ...fiveWhyData, solution: e.target.value })}
                  />
                )}
              </FormField>

              <FormField label="Preventive action">
                {(p) => (
                  <textarea
                    {...p}
                    rows={2}
                    className="form-textarea"
                    placeholder="How the fix is standardised on other stations or shifts (SOP update, training, mistake-proofing)"
                    value={fiveWhyData.preventiveAction}
                    onChange={(e) => setFiveWhyData({ ...fiveWhyData, preventiveAction: e.target.value })}
                  />
                )}
              </FormField>

              <FormField label="How success will be checked" style={{ marginBottom: 0 }}>
                {(p) => (
                  <input
                    {...p}
                    type="text"
                    className="form-input"
                    placeholder="e.g. No repeat finding in the next 3 weekly audits"
                    value={fiveWhyData.verificationCriteria}
                    onChange={(e) => setFiveWhyData({ ...fiveWhyData, verificationCriteria: e.target.value })}
                  />
                )}
              </FormField>
            </section>
          </fieldset>
        </form>
      </Modal>

      {/* Modal: closure evidence */}
      <Modal
        isOpen={closureOpen}
        onClose={() => {
          if (!submittingClosure) setClosureOpen(false);
        }}
        title={`Submit proof: ${selectedAction?.actionCode ?? ''}`}
        subtitle="Show the fixed area and describe what was done. Someone else will verify it."
        maxWidth="640px"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setClosureOpen(false)} disabled={submittingClosure}>
              Cancel
            </Button>
            <Button type="submit" form="capa-closure-form" variant="primary" icon={<CheckCircle2 size={16} />} loading={submittingClosure} disabled={!closureReady}>
              Submit for verification
            </Button>
          </>
        }
      >
        <form id="capa-closure-form" onSubmit={handleSubmitClosure} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-pale)', border: '1px solid var(--color-info-border)', fontSize: '13px' }}>
            <div style={{ fontWeight: 600 }}>{selectedAction?.title}</div>
            {selectedAnalysis?.solution && (
              <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                <strong>Planned solution:</strong> {selectedAnalysis.solution}
              </div>
            )}
          </div>

          {!closureReady && selectedAction && (
            <div role="alert" style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
              <span>Record the root cause and the solution before submitting this action for verification.</span>
              {allows(selectedAction, 'ANALYSE') && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Lightbulb size={13} />}
                  onClick={() => {
                    setClosureOpen(false);
                    open5Why(selectedAction);
                  }}
                >
                  Open 5-Why &amp; solution
                </Button>
              )}
            </div>
          )}

          <PhotoEvidenceField
            id="capa-after-photo"
            label="After photo"
            required={!allowNoPhoto}
            hint={allowNoPhoto ? 'Your organization allows closure without a photo, with a justification.' : undefined}
            value={afterPhotoUrl}
            onChange={(url) => {
              setAfterPhotoUrl(url);
              if (url) setClosureErrors((prev) => ({ ...prev, photo: undefined }));
            }}
            onError={(message) => addToast({ type: 'warning', title: 'Photo not attached', message })}
            error={closureErrors.photo}
            previewAlt={`After photo for ${selectedAction?.actionCode ?? 'this action'}`}
            previewActions={
              <Button type="button" size="sm" variant="secondary" icon={<Camera size={13} />} onClick={() => setAnnotationOpen(true)}>
                Mark up photo
              </Button>
            }
          />

          {allowNoPhoto && !afterPhotoUrl && (
            <FormField label="Why there is no after photo" required error={closureErrors.justification} style={{ marginBottom: 0 }}>
              {(p) => (
                <textarea
                  {...p}
                  rows={2}
                  className="form-textarea"
                  maxLength={1000}
                  placeholder="e.g. Photography is not permitted in this clean room."
                  value={noPhotoJustification}
                  onChange={(e) => setNoPhotoJustification(e.target.value)}
                />
              )}
            </FormField>
          )}

          <FormField label="What was done" required error={closureErrors.notes} style={{ marginBottom: 0 }}>
            {(p) => (
              <textarea
                {...p}
                rows={3}
                className="form-textarea"
                placeholder="Changes made, parts replaced, places marked, people trained…"
                value={closureNotes}
                onChange={(e) => setClosureNotes(e.target.value)}
              />
            )}
          </FormField>

          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Submitted by <strong style={{ color: 'var(--text-primary)' }}>{currentUser?.fullName ?? '—'}</strong>
          </div>
        </form>
      </Modal>

      {/* Modal: verification */}
      <Modal
        isOpen={verificationOpen}
        onClose={() => {
          if (!verifying) setVerificationOpen(false);
        }}
        title={`Verify action ${selectedAction?.actionCode ?? ''}`}
        subtitle="Compare the evidence with the finding, then approve the fix or send it back."
        maxWidth="740px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', width: '100%' }}>
            <Button type="button" variant="danger" icon={<RotateCcw size={16} />} onClick={() => handleVerify(false)} loading={verifying === 'reject'} disabled={!!verifying}>
              Reject and reopen
            </Button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button type="button" variant="secondary" onClick={() => setVerificationOpen(false)} disabled={!!verifying}>
                Cancel
              </Button>
              <Button type="button" variant="primary" icon={<ShieldCheck size={16} />} onClick={() => handleVerify(true)} loading={verifying === 'approve'} disabled={!!verifying}>
                Approve
              </Button>
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {selectedAnalysis?.solution && (
            <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-pale)', border: '1px solid var(--color-info-border)', fontSize: '13px' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>Planned solution</div>
              <div style={{ color: 'var(--text-primary)' }}>{selectedAnalysis.solution}</div>
              {selectedAnalysis.verificationCriteria && (
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  <strong>Success check:</strong> {selectedAnalysis.verificationCriteria}
                </div>
              )}
            </div>
          )}

          <div className="keep-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ minWidth: 0 }}>
              <div className="form-label" style={{ marginBottom: '6px' }}>Before (finding)</div>
              <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                <ImageWithFallback src={selectedAction?.observation?.beforePhotoUrl} emptyText="No photo recorded" alt="Before: the finding" height="180px" allowZoom />
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="form-label" style={{ marginBottom: '6px' }}>After (evidence)</div>
              <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                <ImageWithFallback src={selectedAction?.afterPhotoUrl} emptyText="No photo recorded" alt="After: the fixed area" height="180px" allowZoom />
              </div>
            </div>
          </div>

          <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '13px' }}>
            <strong>What was done</strong>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{selectedAction?.closureNotes || 'No notes recorded.'}</p>
            {selectedAction?.closureSubmittedAt && (
              <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Submitted {formatDateTime(selectedAction.closureSubmittedAt)}</div>
            )}
          </div>

          <FormField label="Verifier comments" error={verificationError || undefined} hint="Required when you reject: the assignee sees the reason." style={{ marginBottom: 0 }}>
            {(p) => (
              <textarea
                {...p}
                rows={2}
                className="form-textarea"
                maxLength={2000}
                placeholder="e.g. Checked on the floor: tool board complete on all shifts."
                value={verificationNotes}
                onChange={(e) => {
                  setVerificationNotes(e.target.value);
                  if (e.target.value.trim()) setVerificationError('');
                }}
              />
            )}
          </FormField>

          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Verifier <strong style={{ color: 'var(--text-primary)' }}>{currentUser?.fullName ?? '—'}</strong>
          </div>
        </div>
      </Modal>

      {/* Modal: effectiveness review (VERIFIED -> CLOSED / REOPENED) */}
      <Modal
        isOpen={effectivenessOpen}
        onClose={() => {
          if (!submittingReview) setEffectivenessOpen(false);
        }}
        title={`Effectiveness review: ${selectedAction?.actionCode ?? ''}`}
        subtitle="Confirm the verified fix has held before the action is closed for good."
        maxWidth="560px"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEffectivenessOpen(false)} disabled={submittingReview}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="capa-effectiveness-form"
              variant={effectiveChoice === false ? 'danger' : 'primary'}
              icon={effectiveChoice === false ? <RotateCcw size={16} /> : <Lock size={16} />}
              loading={submittingReview}
            >
              {effectiveChoice === false ? 'Reopen action' : 'Close action'}
            </Button>
          </>
        }
      >
        <form id="capa-effectiveness-form" onSubmit={handleEffectivenessReview} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-pale)', border: '1px solid var(--color-info-border)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedAction?.title}</div>
            {selectedAnalysis?.solution && (
              <div style={{ color: 'var(--text-secondary)' }}>
                <strong>Solution:</strong> {selectedAnalysis.solution}
              </div>
            )}
            {selectedAction?.verificationNotes && (
              <div style={{ color: 'var(--text-secondary)' }}>
                <strong>Verification notes:</strong> {selectedAction.verificationNotes}
              </div>
            )}
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="form-label">
              Was the fix effective?<span className="required">*</span>
            </legend>
            <div className="keep-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                { value: true, label: 'Yes, close', hint: 'The problem has not come back. The action is closed for good.', color: 'var(--color-primary)', bg: 'var(--bg-pale)' },
                { value: false, label: 'No, reopen', hint: 'The fix did not hold. The action goes back to the assignee.', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
              ].map((opt) => {
                const selected = effectiveChoice === opt.value;
                return (
                  <label
                    key={String(opt.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '12px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${selected ? opt.color : 'var(--border-subtle)'}`,
                      background: selected ? opt.bg : 'var(--bg-surface)',
                      cursor: 'pointer',
                    }}
                  >
                    <input type="radio" name="capa-effective" checked={selected} onChange={() => setEffectiveChoice(opt.value)} style={{ marginTop: '3px' }} />
                    <span>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>{opt.label}</span>
                      <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>{opt.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="capa-effectiveness-review">
              Effectiveness review<span className="required">*</span>
            </label>
            <textarea
              id="capa-effectiveness-review"
              className="form-textarea"
              rows={4}
              maxLength={2000}
              placeholder="e.g. Re-inspected after 30 days: tool board complete on all shifts, no repeat findings."
              value={effectivenessReview}
              onChange={(e) => setEffectivenessReview(e.target.value)}
              aria-describedby="capa-effectiveness-msg"
            />
            <div id="capa-effectiveness-msg" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '4px', fontSize: '12.5px' }}>
              <span role={reviewError ? 'alert' : undefined} style={{ color: 'var(--color-danger)' }}>
                {reviewError}
              </span>
              <span className="form-hint">{effectivenessReview.length} / 2000</span>
            </div>
          </div>
        </form>
      </Modal>

      {annotationOpen && (
        <PhotoAnnotationModal
          isOpen={annotationOpen}
          onClose={() => setAnnotationOpen(false)}
          initialPhotoUrl={afterPhotoUrl}
          title="Mark up the after photo"
          onSave={(annotatedUrl) => {
            setAfterPhotoUrl(annotatedUrl);
            setAnnotationOpen(false);
          }}
        />
      )}

      {/* Raise a standalone action (management review) */}
      <RaiseCapaModal
        isOpen={!!raiseOrigin}
        origin={raiseOrigin}
        onClose={() => setRaiseOrigin(null)}
        onCreated={(created) => {
          setRaiseOrigin(null);
          setActions((prev) => [created, ...prev.filter((a) => a.id !== created.id)]);
        }}
      />

      <ReassignActionModal
        action={reassignTarget}
        onClose={() => setReassignTarget(null)}
        onSaved={(updated) => {
          setReassignTarget(null);
          // Someone else's action leaves the "assigned to me" list
          if (scope === 'mine' && updated.assigneeId !== currentUser?.id) setActions((prev) => prev.filter((a) => a.id !== updated.id));
          else replaceAction(updated);
        }}
      />

      <ChangeDueDateModal
        action={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onSaved={(updated) => {
          setRescheduleTarget(null);
          replaceAction(updated);
        }}
      />

      <CapaTimelineModal action={timelineTarget} onClose={() => setTimelineTarget(null)} />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={`Delete ${deleteTarget?.actionCode ?? 'corrective action'}?`}
        message={
          deleteTarget?.source === 'RED_TAG' || deleteTarget?.source === 'MANAGEMENT_REVIEW'
            ? 'The action is removed from the register together with the finding raised for it.'
            : 'The action is removed from the register and its finding is open again.'
        }
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />

      {/* Audit report: acknowledge (auditees) or view */}
      <AuditReportModal
        isOpen={!!selectedAuditId}
        onClose={() => setSelectedAuditId(null)}
        executionId={selectedAuditId}
        onAcknowledged={() => {
          // The modal confirms the acknowledgement itself; reload so the unlocked actions move on
          void loadData();
        }}
      />
    </div>
  );
};

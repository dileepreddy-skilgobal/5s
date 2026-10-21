import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api, getApiErrorMessage } from '../../services/api';
import { masterDataApi, StandardDetail } from '../../services/masterDataApi';
import { areasApi } from '../../services/api-areas';
import { StandardRevisionDetail } from '../../types/areas';
import { Location, OrgNode, ReferencePhoto, StandardRevision } from '../../types';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs, TabItem } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { PILLARS, humanize, pillarLabel, pillarVariant, severityLabel, severityVariant } from '../../constants/labels';
import { useI18n } from '../../i18n';
import {
  EDITABLE_SCOPES,
  PhotoListField,
  PhotoValue,
  REVISION_STATE_LABELS,
  REVISION_STATE_VARIANT,
  RulesEditor,
  ScopeTargetField,
  SCOPE_LABELS,
  STANDARD_STATUS_LABELS,
  displayedRevision,
  fieldErrorStyle,
  isHttpUrl,
  isRejected,
  nextRevisionNumber,
  pendingRevision,
  photoOf,
  photoValuesOf,
  photosOf,
  revisionState,
  scopeLabel,
  scopeTargetError,
  scopeTargetText,
  standardStatusVariant,
  toReferencePhotos,
} from './standardShared';
import { CheckCircle2, FileText, Video, ExternalLink, Plus, ShieldCheck, History, AlertTriangle, Printer, Camera, Check, FileCheck, MapPin, Edit2, Archive, Trash2, RotateCcw, Eye, XCircle } from 'lucide-react';

interface DraftForm {
  revisionNumber: string;
  description: string;
  rules: string[];
  standardPhotos: PhotoValue[];
  defectPhotos: PhotoValue[];
  videoUrl: string;
  sopDocumentUrl: string;
  revisionComments: string;
}
type DraftErrors = Partial<Record<'revisionNumber' | 'description' | 'rules' | 'sop' | 'video' | 'photo' | 'form', string>>;

interface DetailsForm {
  title: string;
  category: string;
  scopeType: string;
  targetOrgNodeId: string;
  targetLocationId: string;
}

const personName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : null);
const detailOf = (rev: StandardRevision): StandardRevisionDetail => rev as StandardRevisionDetail;

/** All photos of one kind: the selected one large, the others as thumbnails to switch to. */
const PhotoSetCard: React.FC<{ photos: ReferencePhoto[]; kind: 'standard' | 'defect'; title: string }> = ({ photos, kind, title }) => {
  const [index, setIndex] = useState(0);
  const ok = kind === 'standard';
  const photo = photos[Math.min(index, Math.max(0, photos.length - 1))] ?? null;
  return (
    <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>
        <span style={{ display: 'inline-flex', color: ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {ok ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
        </span>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{photo?.label || (ok ? 'Standard condition' : 'Defect example')}</span>
        {photos.length > 1 && <span style={{ marginLeft: 'auto', fontWeight: 500, fontSize: '12px', color: 'var(--text-tertiary)', flexShrink: 0 }}>{photos.length} photos</span>}
      </div>
      <ImageWithFallback src={photo?.photoUrl} alt={photo?.description || (ok ? `Standard condition: ${title}` : `Defect example: ${title}`)} containerStyle={{ height: 'clamp(160px, 28vw, 300px)', borderRadius: 0, border: 'none' }} emptyText="No photo" />
      {photos.length > 1 && (
        <div role="group" aria-label={ok ? 'Standard condition photos' : 'Defect example photos'} style={{ display: 'flex', gap: '6px', padding: '8px 12px 0', overflowX: 'auto' }}>
          {photos.map((p, i) => (
            <button
              key={`${p.photoUrl}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-pressed={i === index}
              style={{ padding: 0, border: `2px solid ${i === index ? 'var(--color-primary)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-sm)', background: 'none', cursor: 'pointer', flexShrink: 0, width: '52px', height: '40px', overflow: 'hidden' }}
            >
              <img src={p.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </button>
          ))}
        </div>
      )}
      {photo?.description && <p style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{photo.description}</p>}
    </div>
  );
};

/** Author's comment, approver's note and rejection reason of a revision, each kept and labelled separately. */
const RevisionNotes: React.FC<{ rev: StandardRevision }> = ({ rev }) => {
  const d = detailOf(rev);
  const notes = [
    d.revisionComments ? { label: 'What changed', text: d.revisionComments, tone: 'var(--text-secondary)' } : null,
    d.approvalComments ? { label: 'Approval note', text: d.approvalComments, tone: 'var(--text-secondary)' } : null,
    d.rejectionReason ? { label: 'Rejected', text: d.rejectionReason, tone: 'var(--color-danger)' } : null,
  ].filter((n): n is { label: string; text: string; tone: string } => n !== null);
  if (!notes.length) return null;
  return (
    <>
      {notes.map((n) => (
        <div key={n.label} style={{ fontSize: '12.5px', color: n.tone, marginTop: '2px', whiteSpace: 'pre-line' }}>
          <strong style={{ fontWeight: 600 }}>{n.label}:</strong> {n.text}
        </div>
      ))}
    </>
  );
};

export const StandardDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTenant, addToast, can } = useApp();
  const { formatDate } = useI18n();
  const canAuthor = can('PROGRAM_MANAGERS');
  const canApprove = can('STANDARD_APPROVERS');

  const [standard, setStandard] = useState<StandardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('benchmark');

  const [draftForm, setDraftForm] = useState<DraftForm | null>(null);
  const [draftErrors, setDraftErrors] = useState<DraftErrors>({});
  const [approveRevision, setApproveRevision] = useState<StandardRevision | null>(null);
  const [approvalComments, setApprovalComments] = useState('');
  const [approveError, setApproveError] = useState<string | null>(null);
  const [rejectRevision, setRejectRevision] = useState<StandardRevision | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [viewRevision, setViewRevision] = useState<StandardRevision | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Details, archive and delete
  const [detailsForm, setDetailsForm] = useState<DetailsForm | null>(null);
  const [detailsErrors, setDetailsErrors] = useState<Partial<Record<'title' | 'target' | 'form', string>>>({});
  const [scopeRefs, setScopeRefs] = useState<{ orgNodes: OrgNode[]; locations: Location[] }>({ orgNodes: [], locations: [] });
  const [confirm, setConfirm] = useState<'archive' | 'restore' | 'delete' | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const loadStandard = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      setStandard(await masterDataApi.getStandardById(id));
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'This standard could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadStandard();
  }, [loadStandard, currentTenant]);

  const openDraft = () => {
    if (!standard) return;
    // The new revision starts from the content in force (real data the author then changes)
    const base = displayedRevision(standard);
    setDraftErrors({});
    setDraftForm({
      revisionNumber: nextRevisionNumber(base?.revisionNumber),
      description: base?.description ?? '',
      rules: base?.rules?.length ? [...base.rules] : [''],
      standardPhotos: photoValuesOf(base, 'STANDARD_CONDITION'),
      defectPhotos: photoValuesOf(base, 'CURRENT_CONDITION'),
      videoUrl: base?.videoUrl ?? '',
      sopDocumentUrl: base?.sopDocumentUrl ?? '',
      revisionComments: '',
    });
  };

  const handleCreateRevisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !draftForm) return;
    const next: DraftErrors = {};
    if (!draftForm.revisionNumber.trim()) next.revisionNumber = 'Enter a revision number.';
    else if (standard?.revisions?.some((r) => r.revisionNumber === draftForm.revisionNumber.trim())) next.revisionNumber = 'This revision number already exists.';
    if (!draftForm.description.trim()) next.description = 'Describe what the standard requires.';
    if (!draftForm.rules.some((r) => r.trim())) next.rules = 'Add at least one rule.';
    if (draftForm.sopDocumentUrl.trim() && !isHttpUrl(draftForm.sopDocumentUrl) && !draftForm.sopDocumentUrl.includes('/api/v1/files/')) next.sop = 'Enter a full link starting with https://.';
    if (draftForm.videoUrl.trim() && !isHttpUrl(draftForm.videoUrl)) next.video = 'Enter a full link starting with https://.';
    setDraftErrors(next);
    if (Object.keys(next).length) return;
    setActionLoading(true);
    try {
      await masterDataApi.createStandardRevision(id, {
        revisionNumber: draftForm.revisionNumber.trim(),
        description: draftForm.description.trim(),
        rules: draftForm.rules.map((r) => r.trim()).filter(Boolean),
        referencePhotos: toReferencePhotos(draftForm.standardPhotos, draftForm.defectPhotos),
        videoUrl: draftForm.videoUrl.trim() || undefined,
        sopDocumentUrl: draftForm.sopDocumentUrl.trim() || undefined,
        revisionComments: draftForm.revisionComments.trim() || undefined,
      });
      addToast({ type: 'success', title: 'Revision saved for approval', message: `Revision ${draftForm.revisionNumber.trim()} applies once a standard approver approves it.` });
      setDraftForm(null);
      await loadStandard();
    } catch (err) {
      setDraftErrors({ form: getApiErrorMessage(err, 'The revision could not be saved.') });
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveRevisionSubmit = async () => {
    if (!id || !approveRevision) return;
    setActionLoading(true);
    setApproveError(null);
    try {
      await areasApi.approveRevision(id, approveRevision.id, approvalComments.trim() || undefined);
      addToast({ type: 'success', title: 'Revision approved', message: `Revision ${approveRevision.revisionNumber} is now in force.` });
      setApproveRevision(null);
      setApprovalComments('');
      await loadStandard();
    } catch (err) {
      setApproveError(getApiErrorMessage(err, 'The revision could not be approved.'));
    } finally {
      setActionLoading(false);
    }
  };

  const openReject = (rev: StandardRevision) => {
    setRejectError(null);
    setRejectReason('');
    setApproveRevision(null);
    setRejectRevision(rev);
  };

  const handleRejectRevisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !rejectRevision) return;
    if (!rejectReason.trim()) {
      setRejectError('Give the reason so the author knows what to change.');
      return;
    }
    setActionLoading(true);
    setRejectError(null);
    try {
      await areasApi.rejectRevision(id, rejectRevision.id, rejectReason.trim());
      addToast({ type: 'success', title: 'Revision rejected', message: `Revision ${rejectRevision.revisionNumber} will not apply. The author can draft a new revision.` });
      setRejectRevision(null);
      await loadStandard();
    } catch (err) {
      setRejectError(getApiErrorMessage(err, 'The revision could not be rejected.'));
    } finally {
      setActionLoading(false);
    }
  };

  const openDetails = async () => {
    if (!standard) return;
    setDetailsErrors({});
    setDetailsForm({
      title: standard.title,
      category: standard.category,
      scopeType: standard.scopeType,
      targetOrgNodeId: standard.targetOrgNodeId ?? '',
      targetLocationId: standard.targetLocationId ?? '',
    });
    if (scopeRefs.orgNodes.length || scopeRefs.locations.length) return;
    try {
      const [orgNodes, locations] = await Promise.all([api.getOrgNodes(), api.getLocations()]);
      setScopeRefs({ orgNodes, locations });
    } catch (err) {
      setDetailsErrors({ form: getApiErrorMessage(err, 'Organization units and locations could not be loaded.') });
    }
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !detailsForm) return;
    const next: typeof detailsErrors = {};
    if (!detailsForm.title.trim()) next.title = 'Enter a title.';
    const targetError = scopeTargetError(detailsForm.scopeType, detailsForm.targetOrgNodeId, detailsForm.targetLocationId);
    if (targetError) next.target = targetError;
    setDetailsErrors(next);
    if (Object.keys(next).length) return;
    setActionLoading(true);
    try {
      await masterDataApi.updateStandard(id, {
        title: detailsForm.title.trim(),
        category: detailsForm.category,
        scopeType: detailsForm.scopeType,
        targetOrgNodeId: detailsForm.targetOrgNodeId || null,
        targetLocationId: detailsForm.targetLocationId || null,
      });
      addToast({ type: 'success', title: 'Standard saved', message: detailsForm.title.trim() });
      setDetailsForm(null);
      await loadStandard();
    } catch (err) {
      setDetailsErrors({ form: getApiErrorMessage(err, 'The standard could not be saved.') });
    } finally {
      setActionLoading(false);
    }
  };

  const runConfirm = async () => {
    if (!id || !standard || !confirm) return;
    setActionLoading(true);
    setConfirmError(null);
    try {
      if (confirm === 'delete') {
        await api.deleteStandard(id);
        addToast({ type: 'success', title: 'Standard deleted', message: `${standard.code} was removed from the library.` });
        navigate('/standards');
        return;
      }
      // A standard that was never approved goes back to awaiting approval rather than to published
      const status = confirm === 'archive' ? 'ARCHIVED' : standard.revisions?.some((r) => r.approvedAt) ? 'PUBLISHED' : 'DRAFT';
      await masterDataApi.updateStandard(id, { status });
      addToast({ type: 'success', title: confirm === 'archive' ? 'Standard archived' : 'Standard restored', message: standard.code });
      setConfirm(null);
      await loadStandard();
    } catch (err) {
      setConfirmError(getApiErrorMessage(err, 'The change could not be saved.'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !standard) return <LoadingState label="Loading standard…" />;
  if (!standard) {
    return (
      <Card>
        <ErrorState message={loadError ?? 'This standard could not be loaded.'} onRetry={loadStandard} />
        <div style={{ textAlign: 'center', paddingBottom: '16px' }}>
          <Link to="/standards">Back to standards</Link>
        </div>
      </Card>
    );
  }

  const currentRev = displayedRevision(standard);
  const pending = pendingRevision(standard);
  const inForce = currentRev && currentRev.approvedAt ? currentRev : null;
  const stdPhoto = photoOf(currentRev, 'STANDARD_CONDITION');
  const defectPhoto = photoOf(currentRev, 'CURRENT_CONDITION');
  // The newest revision was rejected and nothing new awaits approval: tell the author why
  const latest = standard.revisions?.[0] ?? null;
  const latestRejected = latest && isRejected(latest) && !pending ? detailOf(latest) : null;
  const questions = standard.questions ?? [];

  const tabs: TabItem[] = [
    { id: 'benchmark', label: 'Standard', icon: <Camera size={16} /> },
    { id: 'revisions', label: 'Revisions', icon: <History size={16} />, badge: standard.revisions?.length || undefined },
    { id: 'templates', label: 'Linked questions', icon: <FileCheck size={16} />, badge: questions.length || undefined },
    { id: 'scope', label: 'Scope', icon: <MapPin size={16} /> },
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        breadcrumbs={[{ label: 'Standards', to: '/standards' }, { label: standard.code }]}
        title={<span style={{ overflowWrap: 'anywhere' }}>{standard.title}</span>}
        meta={
          <>
            <span className="code-tag" style={{ whiteSpace: 'nowrap' }}>{standard.code}</span>
            <Badge variant={pillarVariant(standard.category)}>{pillarLabel(standard.category)}</Badge>
            <Badge variant={standardStatusVariant(standard.status)}>{STANDARD_STATUS_LABELS[standard.status] ?? standard.status}</Badge>
            {inForce ? <Badge variant="success">Rev {inForce.revisionNumber} in force</Badge> : currentRev && <Badge variant="warning">Rev {currentRev.revisionNumber} awaiting approval</Badge>}
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={<Printer size={16} />} onClick={() => setShowPrintModal(true)}>
              Print one-point lesson
            </Button>
            {canAuthor && (
              <>
                <Button variant="secondary" icon={<Edit2 size={16} />} onClick={openDetails}>Edit details</Button>
                {standard.status === 'ARCHIVED' ? (
                  <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => { setConfirmError(null); setConfirm('restore'); }}>Restore</Button>
                ) : (
                  <Button variant="secondary" icon={<Archive size={16} />} onClick={() => { setConfirmError(null); setConfirm('archive'); }}>Archive</Button>
                )}
                <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => { setConfirmError(null); setConfirm('delete'); }}>Delete</Button>
                {standard.status !== 'ARCHIVED' && (
                  <Button variant="primary" icon={<Plus size={16} />} onClick={openDraft} disabled={!!pending} title={pending ? 'Approve the revision awaiting approval first' : undefined}>
                    New revision
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      {/* Key facts at a glance */}
      <Card noPadding>
        <dl className="keep-cols" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))' }}>
          {([
            { label: 'Applies to', value: scopeTargetText(standard) },
            { label: 'In force since', value: inForce?.approvedAt ? formatDate(inForce.approvedAt) : 'Not approved' },
            { label: 'Author', value: personName(currentRev?.author) ?? '—' },
            { label: 'Approved by', value: personName(inForce?.approver) ?? 'Not approved' },
          ]).map((fact) => (
            <div key={fact.label} style={{ padding: '16px 20px', minWidth: 0, borderRight: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', marginRight: '-1px', marginBottom: '-1px' }}>
              <dt style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 500 }}>{fact.label}</dt>
              <dd style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {pending && (
        <div role="status" className="section-intro-banner" style={{ flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', minWidth: 0, fontSize: '14px', color: 'var(--text-primary)' }}>
            <Badge variant="warning">Awaiting approval</Badge>
            <span style={{ minWidth: 0 }}>
              Revision <strong>{pending.revisionNumber}</strong> is awaiting approval
              {inForce ? `; revision ${inForce.revisionNumber} stays in force until then.` : '. The standard is published once it is approved.'}
            </span>
          </div>
          {canApprove && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button variant="secondary" icon={<XCircle size={16} />} onClick={() => openReject(pending)}>
                Reject
              </Button>
              <Button icon={<Check size={16} />} onClick={() => { setApproveError(null); setApprovalComments(''); setApproveRevision(pending); }}>
                Review and approve
              </Button>
            </div>
          )}
        </div>
      )}

      {latestRejected && (
        <div role="status" className="section-intro-banner" style={{ flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', minWidth: 0, fontSize: '14px', color: 'var(--text-primary)' }}>
            <Badge variant="danger">Rejected</Badge>
            <span style={{ minWidth: 0, flex: '1 1 240px' }}>
              Revision <strong>{latestRejected.revisionNumber}</strong> was rejected
              {latestRejected.rejectedBy ? ` by ${personName(latestRejected.rejectedBy)}` : ''}
              {latestRejected.rejectedAt ? ` on ${formatDate(latestRejected.rejectedAt)}` : ''}.
              {latestRejected.rejectionReason && <span style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>Reason: {latestRejected.rejectionReason}</span>}
            </span>
          </div>
          {canAuthor && standard.status !== 'ARCHIVED' && (
            <Button variant="secondary" icon={<Plus size={16} />} onClick={openDraft}>Draft a new revision</Button>
          )}
        </div>
      )}

      <Tabs tabs={tabs} activeTab={activeTab} onChange={(t) => setActiveTab(t)} ariaLabel="Standard sections" />

      <div className="tab-panels">
        {activeTab === 'benchmark' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Card
              title={inForce ? `Revision ${inForce.revisionNumber}` : currentRev ? `Revision ${currentRev.revisionNumber} (awaiting approval)` : 'No revision'}
              subtitle={currentRev?.description}
            >
              <div className="keep-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
                <PhotoSetCard key={`std-${currentRev?.id}`} photos={photosOf(currentRev, 'STANDARD_CONDITION')} kind="standard" title={standard.title} />
                <PhotoSetCard key={`defect-${currentRev?.id}`} photos={photosOf(currentRev, 'CURRENT_CONDITION')} kind="defect" title={standard.title} />
              </div>
            </Card>

            <div className="grid grid-cols-3 gap-6">
              <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
                <Card title="Rules" subtitle="What auditors and operators check against this standard">
                  {currentRev?.rules?.length ? (
                    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {currentRev.rules.map((rule, idx) => (
                        <li key={idx} style={{ padding: idx === 0 ? '0 0 12px' : '12px 0', borderTop: idx === 0 ? undefined : '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                          <span aria-hidden="true" style={{ width: '24px', height: '24px', flexShrink: 0, borderRadius: 'var(--radius-full)', background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '12px' }}>
                            {idx + 1}
                          </span>
                          <span style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.5, paddingTop: '2px' }}>{rule}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <EmptyState title="No rules" />
                  )}
                </Card>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
                <Card title="SOP and video">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {currentRev?.sopDocumentUrl ? (
                      <a href={currentRev.sopDocumentUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-pale)', color: 'var(--color-primary)', textDecoration: 'none', border: '1px solid var(--color-info-border)', fontWeight: 600, fontSize: '14px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><FileText size={18} aria-hidden="true" /> Open SOP document</span>
                        <ExternalLink size={16} aria-hidden="true" />
                      </a>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '8px 0' }}>No SOP document.</div>
                    )}
                    {currentRev?.videoUrl ? (
                      <a href={currentRev.videoUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', color: 'var(--color-primary)', textDecoration: 'none', border: '1px solid var(--border-subtle)', fontWeight: 600, fontSize: '14px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Video size={18} aria-hidden="true" /> Watch video</span>
                        <ExternalLink size={16} aria-hidden="true" />
                      </a>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '8px 0' }}>No video.</div>
                    )}
                  </div>
                </Card>

                <Card title="Details">
                  <dl className="keep-cols" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 12px', fontSize: '13px', margin: 0 }}>
                    <dt style={{ color: 'var(--text-secondary)' }}>Code</dt>
                    <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600 }}>{standard.code}</dd>
                    <dt style={{ color: 'var(--text-secondary)' }}>Pillar</dt>
                    <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600 }}>{pillarLabel(standard.category)}</dd>
                    <dt style={{ color: 'var(--text-secondary)' }}>Revision in force</dt>
                    <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600 }}>{inForce ? inForce.revisionNumber : '—'}</dd>
                    <dt style={{ color: 'var(--text-secondary)' }}>Applies to</dt>
                    <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600 }}>{scopeLabel(standard.scopeType)}</dd>
                  </dl>
                </Card>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'revisions' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Card
              title="Revisions"
              subtitle="Every version of this standard. A new revision applies once it is approved; earlier ones are kept."
              actions={
                canAuthor && standard.status !== 'ARCHIVED' ? (
                  <Button size="sm" variant="primary" icon={<Plus size={16} />} onClick={openDraft} disabled={!!pending}>
                    New revision
                  </Button>
                ) : undefined
              }
            >
              {(standard.revisions ?? []).length === 0 ? (
                <EmptyState title="No revisions" />
              ) : (
                <div className="enterprise-table-container">
                  <table className="enterprise-table">
                    <thead>
                      <tr>
                        <th>Revision</th>
                        <th>Status</th>
                        <th>Description</th>
                        <th className="num">Rules</th>
                        <th>Author</th>
                        <th>Approved</th>
                        <th style={{ textAlign: 'right' }}><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(standard.revisions ?? []).map((rev) => {
                        const state = revisionState(rev);
                        return (
                          <tr key={rev.id}>
                            <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>Rev {rev.revisionNumber}</td>
                            <td><Badge variant={REVISION_STATE_VARIANT[state]}>{REVISION_STATE_LABELS[state]}</Badge></td>
                            <td style={{ minWidth: '220px' }}>
                              <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{rev.description}</div>
                              <RevisionNotes rev={rev} />
                            </td>
                            <td className="num">{rev.rules?.length ?? 0}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {personName(rev.author) ?? '—'}
                              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{formatDate(rev.createdAt)}</div>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {rev.approvedAt ? (
                                <>
                                  {personName(rev.approver) ?? '—'}
                                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{formatDate(rev.approvedAt)}</div>
                                </>
                              ) : detailOf(rev).rejectedAt ? (
                                <>
                                  <span style={{ color: 'var(--color-danger)' }}>Rejected{detailOf(rev).rejectedBy ? ` by ${personName(detailOf(rev).rejectedBy)}` : ''}</span>
                                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{formatDate(detailOf(rev).rejectedAt ?? rev.createdAt)}</div>
                                </>
                              ) : (
                                <span style={{ color: 'var(--text-tertiary)' }}>Not approved</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <Button size="sm" variant="ghost" icon={<Eye size={16} />} onClick={() => setViewRevision(rev)} aria-label={`View revision ${rev.revisionNumber}`}>
                                  View
                                </Button>
                                {canApprove && state === 'AWAITING' && (
                                  <>
                                    <Button size="sm" variant="secondary" icon={<XCircle size={16} />} onClick={() => openReject(rev)}>
                                      Reject
                                    </Button>
                                    <Button size="sm" variant="primary" icon={<Check size={16} />} onClick={() => { setApproveError(null); setApprovalComments(''); setApproveRevision(rev); }}>
                                      Approve
                                    </Button>
                                  </>
                                )}
                              </div>
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

        {activeTab === 'templates' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Card title="Linked questions" subtitle="Audit-template questions that refer auditors to this standard">
              {questions.length > 0 ? (
                <div className="enterprise-table-container">
                  <table className="enterprise-table">
                    <thead>
                      <tr>
                        <th>Question</th>
                        <th>Template</th>
                        <th>Audit type</th>
                        <th>Severity</th>
                        <th style={{ textAlign: 'right' }}><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map((q) => {
                        const tpl = q.section?.templateVersion?.template;
                        const severity = (q as { severity?: string }).severity;
                        return (
                          <tr key={q.id}>
                            <td style={{ minWidth: '220px' }}>
                              <span className="code-tag" style={{ whiteSpace: 'nowrap' }}>{q.questionCode}</span>
                              <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginTop: '4px' }}>{q.questionText}</div>
                            </td>
                            <td>
                              {tpl ? (
                                <>
                                  <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{tpl.code}</div>
                                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{tpl.name}</div>
                                </>
                              ) : '—'}
                            </td>
                            <td>{tpl?.auditType ? <Badge variant="neutral">{humanize(tpl.auditType)}</Badge> : '—'}</td>
                            <td>{severity ? <Badge variant={severityVariant(severity)}>{severityLabel(severity)}</Badge> : '—'}</td>
                            <td style={{ textAlign: 'right' }}>
                              {canAuthor && tpl?.id && (
                                <Button size="sm" variant="ghost" onClick={() => navigate(`/templates/${tpl.id}/builder`)}>Open template</Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={<FileCheck size={28} />} title="No linked questions" description="Link questions to this standard in the audit-template builder." />
              )}
            </Card>
          </div>
        )}

        {activeTab === 'scope' && (
          <div className="animate-fade-in">
            <Card title="Scope" subtitle="Where this standard applies">
              <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-pale)', border: '1px solid var(--color-info-border)' }}>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>{scopeLabel(standard.scopeType)}</div>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                  {standard.scopeType === 'GLOBAL'
                    ? 'Applies to every location of the organization.'
                    : standard.targetLocation
                      ? <>Applies to <Link to={`/locations/${standard.targetLocation.id}`}>{standard.targetLocation.name} ({standard.targetLocation.areaCode})</Link>.</>
                      : standard.targetOrgNode
                        ? `Applies to the locations of ${standard.targetOrgNode.name}.`
                        : 'No target is set for this scope.'}
                </p>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* New revision */}
      <Modal
        isOpen={draftForm !== null}
        onClose={() => !actionLoading && setDraftForm(null)}
        title={`New revision of ${standard.code}`}
        subtitle="Starts from the current content. It applies once a standard approver approves it."
        maxWidth="680px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraftForm(null)} disabled={actionLoading}>Cancel</Button>
            <Button variant="primary" type="submit" form="revision-form" loading={actionLoading}>Save for approval</Button>
          </>
        }
      >
        {draftForm && (
          <form id="revision-form" onSubmit={handleCreateRevisionSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="rev-number">Revision number <span className="required">*</span></label>
              <input id="rev-number" type="text" value={draftForm.revisionNumber} onChange={(e) => setDraftForm({ ...draftForm, revisionNumber: e.target.value })} className="form-input" aria-invalid={!!draftErrors.revisionNumber} aria-describedby={draftErrors.revisionNumber ? 'rev-number-error' : undefined} style={{ maxWidth: '160px' }} />
              {draftErrors.revisionNumber && <div id="rev-number-error" className="form-error" style={fieldErrorStyle}>{draftErrors.revisionNumber}</div>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="rev-description">Description <span className="required">*</span></label>
              <textarea id="rev-description" rows={3} value={draftForm.description} onChange={(e) => setDraftForm({ ...draftForm, description: e.target.value })} className="form-textarea" aria-invalid={!!draftErrors.description} aria-describedby={draftErrors.description ? 'rev-description-error' : undefined} />
              {draftErrors.description && <div id="rev-description-error" className="form-error" style={fieldErrorStyle}>{draftErrors.description}</div>}
            </div>
            <RulesEditor idPrefix="rev" rules={draftForm.rules} onChange={(rules) => setDraftForm({ ...draftForm, rules })} error={draftErrors.rules} />
            <div className="grid-auto" style={{ ['--min' as string]: '220px', gap: '14px', alignItems: 'start' } as React.CSSProperties}>
              <PhotoListField id="rev-photo-standard" label="Standard condition" tone="success" values={draftForm.standardPhotos} onChange={(v) => setDraftForm((f) => (f ? { ...f, standardPhotos: v } : f))} onError={(m) => setDraftErrors((x) => ({ ...x, photo: m ?? undefined }))} />
              <PhotoListField id="rev-photo-defect" label="Defect example" tone="danger" values={draftForm.defectPhotos} onChange={(v) => setDraftForm((f) => (f ? { ...f, defectPhotos: v } : f))} onError={(m) => setDraftErrors((x) => ({ ...x, photo: m ?? undefined }))} />
            </div>
            {draftErrors.photo && <div role="alert" className="form-error" style={fieldErrorStyle}>{draftErrors.photo}</div>}
            <div className="grid-auto" style={{ ['--min' as string]: '220px', gap: '14px' } as React.CSSProperties}>
              <div className="form-group">
                <label className="form-label" htmlFor="rev-sop">SOP document link</label>
                <input id="rev-sop" type="url" placeholder="https://" value={draftForm.sopDocumentUrl} onChange={(e) => setDraftForm({ ...draftForm, sopDocumentUrl: e.target.value })} className="form-input" aria-invalid={!!draftErrors.sop} aria-describedby={draftErrors.sop ? 'rev-sop-error' : undefined} />
                {draftErrors.sop && <div id="rev-sop-error" className="form-error" style={fieldErrorStyle}>{draftErrors.sop}</div>}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="rev-video">Video link</label>
                <input id="rev-video" type="url" placeholder="https://" value={draftForm.videoUrl} onChange={(e) => setDraftForm({ ...draftForm, videoUrl: e.target.value })} className="form-input" aria-invalid={!!draftErrors.video} aria-describedby={draftErrors.video ? 'rev-video-error' : undefined} />
                {draftErrors.video && <div id="rev-video-error" className="form-error" style={fieldErrorStyle}>{draftErrors.video}</div>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="rev-comments">What changed</label>
              <input id="rev-comments" type="text" value={draftForm.revisionComments} onChange={(e) => setDraftForm({ ...draftForm, revisionComments: e.target.value })} className="form-input" />
            </div>
            {draftErrors.form && <p role="alert" className="form-error" style={{ margin: 0 }}>{draftErrors.form}</p>}
          </form>
        )}
      </Modal>

      {/* Approve revision */}
      <Modal
        isOpen={approveRevision !== null}
        onClose={() => !actionLoading && setApproveRevision(null)}
        title={approveRevision ? `Approve revision ${approveRevision.revisionNumber}?` : 'Approve revision?'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproveRevision(null)} disabled={actionLoading}>Cancel</Button>
            <Button variant="danger" icon={<XCircle size={16} />} onClick={() => approveRevision && openReject(approveRevision)} disabled={actionLoading}>Reject</Button>
            <Button variant="primary" icon={<ShieldCheck size={16} />} loading={actionLoading} onClick={handleApproveRevisionSubmit}>Approve</Button>
          </>
        }
      >
        {approveRevision && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              Revision {approveRevision.revisionNumber} becomes the version in force
              {inForce ? ` and replaces revision ${inForce.revisionNumber}` : standard.status === 'DRAFT' ? ' and the standard is published' : ''}.
            </p>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{approveRevision.description}</strong>
              <div>{approveRevision.rules?.length ?? 0} rules · {approveRevision.referencePhotos?.length ?? 0} photos</div>
            </div>
            {approveRevision.revisionComments && (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>What changed:</strong> {approveRevision.revisionComments}
              </p>
            )}
            <div className="form-group">
              <label className="form-label" htmlFor="approve-comments">Approval note (optional; kept apart from the author's comment)</label>
              <textarea id="approve-comments" rows={3} value={approvalComments} onChange={(e) => setApprovalComments(e.target.value)} className="form-textarea" />
            </div>
            {approveError && <p role="alert" className="form-error" style={{ margin: 0 }}>{approveError}</p>}
          </div>
        )}
      </Modal>

      {/* Reject revision */}
      <Modal
        isOpen={rejectRevision !== null}
        onClose={() => !actionLoading && setRejectRevision(null)}
        title={rejectRevision ? `Reject revision ${rejectRevision.revisionNumber}?` : 'Reject revision?'}
        subtitle={inForce ? `Revision ${inForce.revisionNumber} stays in force.` : 'The standard stays awaiting approval until a new revision is approved.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectRevision(null)} disabled={actionLoading}>Cancel</Button>
            <Button variant="danger" type="submit" form="reject-revision-form" icon={<XCircle size={16} />} loading={actionLoading}>Reject revision</Button>
          </>
        }
      >
        <form id="reject-revision-form" onSubmit={handleRejectRevisionSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="reject-reason">Reason <span className="required">*</span></label>
            <textarea
              id="reject-reason"
              rows={4}
              className="form-textarea"
              value={rejectReason}
              maxLength={2000}
              onChange={(e) => setRejectReason(e.target.value)}
              aria-invalid={!!rejectError}
              aria-describedby={rejectError ? 'reject-reason-error' : 'reject-reason-hint'}
            />
            {rejectError ? (
              <div id="reject-reason-error" role="alert" className="form-error" style={fieldErrorStyle}>{rejectError}</div>
            ) : (
              <div id="reject-reason-hint" className="form-hint">Shown to the author with the revision.</div>
            )}
          </div>
        </form>
      </Modal>

      {/* Read-only view of any revision (history) */}
      <Modal
        isOpen={viewRevision !== null}
        onClose={() => setViewRevision(null)}
        title={viewRevision ? `Revision ${viewRevision.revisionNumber}` : 'Revision'}
        subtitle={viewRevision ? `${REVISION_STATE_LABELS[revisionState(viewRevision)]} · created ${formatDate(viewRevision.createdAt)}${viewRevision.author ? ` by ${personName(viewRevision.author)}` : ''}` : undefined}
        maxWidth="720px"
        footer={<Button variant="secondary" onClick={() => setViewRevision(null)}>Close</Button>}
      >
        {viewRevision && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.55 }}>{viewRevision.description}</p>
            <RevisionNotes rev={viewRevision} />
            {viewRevision.approvedAt && (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                Approved {formatDate(viewRevision.approvedAt)}{viewRevision.approver ? ` by ${personName(viewRevision.approver)}` : ''}.
              </p>
            )}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px', color: 'var(--text-primary)' }}>Rules</h3>
              {viewRevision.rules?.length ? (
                <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: 'var(--text-primary)' }}>
                  {viewRevision.rules.map((r, i) => <li key={i}>{r}</li>)}
                </ol>
              ) : (
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-tertiary)' }}>No rules.</p>
              )}
            </div>
            <div className="keep-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '12px' }}>
              <PhotoSetCard photos={photosOf(viewRevision, 'STANDARD_CONDITION')} kind="standard" title={standard.title} />
              <PhotoSetCard photos={photosOf(viewRevision, 'CURRENT_CONDITION')} kind="defect" title={standard.title} />
            </div>
            {(viewRevision.sopDocumentUrl || viewRevision.videoUrl) && (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '14px' }}>
                {viewRevision.sopDocumentUrl && <a href={viewRevision.sopDocumentUrl} target="_blank" rel="noreferrer">Open SOP document</a>}
                {viewRevision.videoUrl && <a href={viewRevision.videoUrl} target="_blank" rel="noreferrer">Watch video</a>}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Edit details */}
      <Modal
        isOpen={detailsForm !== null}
        onClose={() => !actionLoading && setDetailsForm(null)}
        title="Edit standard details"
        subtitle="Rules, photos and links change through a new revision."
        maxWidth="560px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetailsForm(null)} disabled={actionLoading}>Cancel</Button>
            <Button variant="primary" type="submit" form="standard-details-form" loading={actionLoading}>Save</Button>
          </>
        }
      >
        {detailsForm && (
          <form id="standard-details-form" onSubmit={handleSaveDetails} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="det-title">Title <span className="required">*</span></label>
              <input id="det-title" type="text" className="form-input" value={detailsForm.title} onChange={(e) => setDetailsForm({ ...detailsForm, title: e.target.value })} aria-invalid={!!detailsErrors.title} aria-describedby={detailsErrors.title ? 'det-title-error' : undefined} />
              {detailsErrors.title && <div id="det-title-error" className="form-error" style={fieldErrorStyle}>{detailsErrors.title}</div>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="det-category">Pillar</label>
              <select id="det-category" className="form-select" value={detailsForm.category} onChange={(e) => setDetailsForm({ ...detailsForm, category: e.target.value })}>
                {PILLARS.map((p) => <option key={p} value={p}>{pillarLabel(p)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="det-scope">Applies to</label>
              <select id="det-scope" className="form-select" value={detailsForm.scopeType} onChange={(e) => setDetailsForm({ ...detailsForm, scopeType: e.target.value, targetOrgNodeId: '', targetLocationId: '' })}>
                {EDITABLE_SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
                {!EDITABLE_SCOPES.includes(detailsForm.scopeType) && <option value={detailsForm.scopeType}>{scopeLabel(detailsForm.scopeType)}</option>}
              </select>
            </div>
            <ScopeTargetField
              id="det-target"
              scope={detailsForm.scopeType}
              orgNodes={scopeRefs.orgNodes}
              locations={scopeRefs.locations}
              targetOrgNodeId={detailsForm.targetOrgNodeId}
              targetLocationId={detailsForm.targetLocationId}
              onChange={(t) => setDetailsForm({ ...detailsForm, ...t })}
              error={detailsErrors.target}
            />
            {detailsErrors.form && <p role="alert" className="form-error" style={{ margin: 0 }}>{detailsErrors.form}</p>}
          </form>
        )}
      </Modal>

      {/* Archive / restore / delete */}
      <ConfirmDialog
        isOpen={confirm !== null}
        title={confirm === 'delete' ? `Delete ${standard.code}?` : confirm === 'archive' ? `Archive ${standard.code}?` : `Restore ${standard.code}?`}
        confirmLabel={confirm === 'delete' ? 'Delete' : confirm === 'archive' ? 'Archive' : 'Restore'}
        tone={confirm === 'delete' ? 'danger' : 'primary'}
        busy={actionLoading}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
        message={
          <>
            {confirm === 'delete'
              ? 'The standard is removed from the library. Past audit answers keep the content they were scored against.'
              : confirm === 'archive'
                ? 'An archived standard stays in the library for reference but is no longer in force. It can be restored later.'
                : standard.revisions?.some((r) => r.approvedAt)
                  ? 'The standard is published again with its approved revision.'
                  : 'The standard has no approved revision; it returns to awaiting approval.'}
            {confirmError && <p role="alert" className="form-error" style={{ margin: '12px 0 0' }}>{confirmError}</p>}
          </>
        }
      />

      {/* Printable one-point lesson */}
      <Modal isOpen={showPrintModal} onClose={() => setShowPrintModal(false)} title="One-point lesson" maxWidth="640px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPrintModal(false)}>Close</Button>
            <Button variant="primary" icon={<Printer size={16} />} onClick={() => window.print()}>Print</Button>
          </>
        }
      >
        <div id="printable-opl-sheet" className="printable-standard-poster" style={{ border: '2px solid #000', padding: '20px', borderRadius: 'var(--radius-md)', background: '#FFFFFF', color: '#000000' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '14px' }}>
            <div style={{ minWidth: 0 }}>
              {currentTenant?.name && (
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#003B70' }}>{currentTenant.name} · 5S standard</div>
              )}
              <div style={{ fontSize: '18px', fontWeight: 800, margin: '2px 0', overflowWrap: 'anywhere' }}>{standard.code} — {standard.title}</div>
              <div style={{ fontSize: '11px', color: '#333' }}>{pillarLabel(standard.category)} · {scopeTargetText(standard)}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 800 }}>{currentRev ? `Rev ${currentRev.revisionNumber}` : ''}</div>
              <div style={{ fontSize: '10px', color: '#555' }}>{inForce?.approvedAt ? `In force since ${formatDate(inForce.approvedAt)}` : 'Not approved'}</div>
            </div>
          </div>

          <div className="keep-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            {([
              { photo: stdPhoto, title: 'Standard condition', color: '#047857' },
              { photo: defectPhoto, title: 'Defect example', color: '#B91C1C' },
            ] as const).map(({ photo, title, color }) => (
              <div key={title} style={{ border: `2px solid ${color}`, padding: '6px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color, marginBottom: '4px' }}>{title}</div>
                {photo ? (
                  <img src={photo.photoUrl} alt={photo.description || title} style={{ width: '100%', height: '160px', objectFit: 'cover' }} />
                ) : (
                  <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #999', color: '#555', fontSize: '12px' }}>No photo</div>
                )}
                {photo?.description && <div style={{ fontSize: '10.5px', marginTop: '4px', color: '#222' }}>{photo.description}</div>}
              </div>
            ))}
          </div>

          <div style={{ fontSize: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>Rules</div>
            {currentRev?.rules?.length ? (
              <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {currentRev.rules.map((r, idx) => <li key={idx}><strong>{r}</strong></li>)}
              </ol>
            ) : (
              <div>—</div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

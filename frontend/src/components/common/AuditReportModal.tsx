import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { api, getApiErrorMessage } from '../../services/api';
import { auditExecutionApi } from '../../services/auditExecutionApi';
import { AuditAnswer, AuditExecution, AuditTemplateQuestion, Observation } from '../../types';
import { BadgeVariant, humanize, auditStatusLabel, auditStatusVariant, pillarLabel, PILLARS, severityLabel, severityVariant, actionStatusLabel } from '../../constants/labels';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { ImageWithFallback } from '../ui/ImageWithFallback';
import { LoadingState, ErrorState } from '../ui/StateViews';
import { SignaturePad, SignaturePadHandle } from './SignaturePad';
import { compressPhotoFile } from './evidencePhoto';
import { CheckCircle2, AlertTriangle, Printer, Send, ChevronDown, ChevronRight, Camera, Scale, Trash2 } from 'lucide-react';

interface AuditReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  executionId: string | null;
  onAcknowledged?: (updatedExec: AuditExecution) => void;
}

// Kept local until labels.ts has answer-status and dispute-reason labels
const ANSWER_STATUS_LABELS: Record<string, string> = {
  CONFORMING: 'Conforming',
  MINOR_NC: 'Minor non-conformance',
  MAJOR_NC: 'Major non-conformance',
  CRITICAL_FAIL: 'Critical failure',
  NOT_APPLICABLE: 'Not applicable',
};
const DISPUTE_REASON_LABELS: Record<string, string> = {
  SCHEDULED_CHANGEOVER: 'Scheduled production or tooling changeover in progress',
  OUT_OF_SCOPE: 'Equipment or material outside the area boundary',
  INACCURATE_EVIDENCE: 'Evidence inaccurate or standard misread',
  FORCE_MAJEURE: 'Utility outage or unscheduled maintenance',
  OTHER: 'Other reason',
};
const answerStatusVariant = (status: string): BadgeVariant =>
  status === 'CONFORMING' ? 'success' : status === 'NOT_APPLICABLE' ? 'neutral' : status === 'MINOR_NC' ? 'warning' : 'danger';

const fullName = (u?: { firstName?: string; lastName?: string } | null) => (u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '');

/** A stored signature is either a drawn image (data URL / file URL) or a text attestation from the mobile app. */
const isImageSignature = (sig: string) => sig.startsWith('data:image') || /^https?:\/\//.test(sig) || sig.startsWith('/api/');

const evidenceUrl = (ev: AuditAnswer['evidenceUrls'][number]): string | null => {
  if (typeof ev === 'string') return ev || null;
  if (ev && typeof ev === 'object') {
    const obj = ev as { photoUrl?: unknown; annotatedPhotoUrl?: unknown };
    if (typeof obj.annotatedPhotoUrl === 'string' && obj.annotatedPhotoUrl) return obj.annotatedPhotoUrl;
    if (typeof obj.photoUrl === 'string' && obj.photoUrl) return obj.photoUrl;
  }
  return null;
};

const toList = (value: string | string[] | null | undefined): string[] => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

/**
 * Fixed colours for the printable report sheet. It is a white "paper" in every theme, so it prints the same and
 * keeps its contrast in dark mode; theme tokens are used only for the screen chrome around it.
 */
const PRINT = {
  paper: '#FFFFFF',
  ink: '#1D2733',
  primary: '#004C8F',
  primaryDark: '#003B70',
  muted: '#596579',
  line: '#DCE3EB',
  panel: '#F7F9FC',
  track: '#E2EFFA',
  pass: '#18864B',
  passBg: '#EAF6EF',
  passBorder: '#BFE3CD',
  fail: '#C62828',
  failBg: '#FDEEEE',
  failBorder: '#F4C4C4',
  warn: '#8F5D12',
  warnBg: '#FDF5E7',
  warnBorder: '#F0D9AE',
  info: '#0067B8',
  infoBg: '#EAF4FC',
  infoBorder: '#BCD9F2',
  purple: '#5B3FB5',
  purpleBg: '#F2EFFB',
  purpleBorder: '#D7CDF3',
} as const;

const PRINT_TAG_TONES: Record<BadgeVariant, { color: string; background: string; border: string }> = {
  success: { color: PRINT.pass, background: PRINT.passBg, border: PRINT.passBorder },
  danger: { color: PRINT.fail, background: PRINT.failBg, border: PRINT.failBorder },
  warning: { color: PRINT.warn, background: PRINT.warnBg, border: PRINT.warnBorder },
  info: { color: PRINT.info, background: PRINT.infoBg, border: PRINT.infoBorder },
  purple: { color: PRINT.purple, background: PRINT.purpleBg, border: PRINT.purpleBorder },
  neutral: { color: PRINT.muted, background: PRINT.panel, border: PRINT.line },
};

/** Status pill for the printable sheet (same meaning as Badge, with print-safe colours). */
const PrintTag: React.FC<{ tone: BadgeVariant; children: React.ReactNode }> = ({ tone, children }) => {
  const c = PRINT_TAG_TONES[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        color: c.color,
        background: c.background,
        border: `1px solid ${c.border}`,
      }}
    >
      {children}
    </span>
  );
};

const printHeading: React.CSSProperties = { fontSize: '16px', fontWeight: 600, color: PRINT.ink, margin: '0 0 12px 0' };
const printTable: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: PRINT.ink };
const printTh: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: '12.5px',
  fontWeight: 600,
  color: PRINT.muted,
  borderBottom: `1px solid ${PRINT.line}`,
  background: PRINT.paper,
};
const printTd: React.CSSProperties = { padding: '10px 12px', borderBottom: `1px solid ${PRINT.line}`, verticalAlign: 'top' };
const signOffBlock: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '16px',
  borderRadius: '8px',
  border: `1px solid ${PRINT.line}`,
  breakInside: 'avoid',
};

const signatureBox: React.CSSProperties = {
  minHeight: '70px',
  background: PRINT.paper,
  color: PRINT.ink,
  borderRadius: '6px',
  border: `1px solid ${PRINT.line}`,
  padding: '6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '13px',
  textAlign: 'center',
};

export const AuditReportModal: React.FC<AuditReportModalProps> = ({ isOpen, onClose, executionId, onAcknowledged }) => {
  const { currentUser, currentTenant, addToast, can } = useApp();
  const { formatDate, formatDateTime, formatNumber } = useI18n();

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [execution, setExecution] = useState<AuditExecution | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const [actionView, setActionView] = useState<'view' | 'acknowledge' | 'dispute' | 'resolveDispute'>('view');
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);
  const [formTried, setFormTried] = useState(false);

  // Acknowledgement
  const [ackNotes, setAckNotes] = useState<string>('');
  const [ackTargetDate, setAckTargetDate] = useState<string>('');
  const [ackConfirmed, setAckConfirmed] = useState<boolean>(false);
  const [hasAckSigned, setHasAckSigned] = useState<boolean>(false);
  const ackSignatureRef = useRef<SignaturePadHandle | null>(null);

  // Dispute
  const [disputeReason, setDisputeReason] = useState<string>('SCHEDULED_CHANGEOVER');
  const [disputeNotes, setDisputeNotes] = useState<string>('');
  const [disputedQuestions, setDisputedQuestions] = useState<string[]>([]);
  const [counterEvidence, setCounterEvidence] = useState<string[]>([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const evidenceInputRef = useRef<HTMLInputElement | null>(null);

  // Dispute ruling
  const [resolveDecision, setResolveDecision] = useState<'ACCEPT_DISPUTE' | 'REJECT_DISPUTE'>('ACCEPT_DISPUTE');
  const [resolveNotes, setResolveNotes] = useState<string>('');
  const [adjustedScore, setAdjustedScore] = useState<string>('');

  const resetForms = (data: AuditExecution | null) => {
    setActionView('view');
    setFormTried(false);
    setAckNotes('');
    setAckTargetDate('');
    setAckConfirmed(false);
    setHasAckSigned(false);
    setDisputeReason('SCHEDULED_CHANGEOVER');
    setDisputeNotes('');
    setDisputedQuestions([]);
    setCounterEvidence([]);
    setResolveDecision('ACCEPT_DISPUTE');
    setResolveNotes('');
    setAdjustedScore(data ? String(data.overallScore) : '');
  };

  const loadReport = useCallback(async () => {
    if (!executionId) return;
    try {
      setLoading(true);
      setLoadError(null);
      const data = await api.getAuditReport(executionId);
      setExecution(data);
      setCollapsedSections({});
      resetForms(data);
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'The audit report could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [executionId]);

  useEffect(() => {
    if (isOpen && executionId) loadReport();
  }, [isOpen, executionId, loadReport]);

  if (!isOpen) return null;

  const isOwnAudit = !!execution?.auditorId && execution.auditorId === currentUser?.id;
  const isOwnDispute = !!execution?.disputedById && execution.disputedById === currentUser?.id;
  const canRespond = !!execution && execution.status === 'SUBMITTED' && can('AUDITEES') && !isOwnAudit;
  const canRule = !!execution && execution.status === 'DISPUTED' && can('DISPUTE_RESOLVERS') && !isOwnAudit && !isOwnDispute;
  const signerName = currentUser?.fullName || '—';

  const questions: AuditTemplateQuestion[] = execution?.templateVersion?.sections?.flatMap((s) => s.questions ?? []) ?? [];
  const questionCode = (id: string) => questions.find((q) => q.id === id)?.questionCode ?? id;

  const finish = (updated: AuditExecution, toast: { type: 'success' | 'warning'; title: string; message: string }) => {
    setExecution(updated);
    resetForms(updated);
    onAcknowledged?.(updated);
    addToast(toast);
  };

  const handleSubmitAcknowledgement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormTried(true);
    if (!executionId || !ackNotes.trim() || !hasAckSigned || !ackConfirmed) return;
    const signature = ackSignatureRef.current?.toDataURL();
    if (!signature) {
      setHasAckSigned(false);
      return;
    }
    try {
      setSubmittingAction(true);
      const updated = await auditExecutionApi.acknowledge(executionId, {
        acknowledgementNotes: ackNotes.trim(),
        acknowledgementSignature: signature,
        targetResolutionDate: ackTargetDate || undefined,
      });
      finish(updated, {
        type: 'success',
        title: 'Findings acknowledged',
        message: `Your sign-off for ${updated.location?.name || 'the area'} is recorded and its corrective actions are now open.`,
      });
    } catch (err) {
      addToast({ type: 'error', title: 'Acknowledgement failed', message: getApiErrorMessage(err, 'Your sign-off could not be recorded.') });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSubmitDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormTried(true);
    if (!executionId || !disputeNotes.trim() || uploadingEvidence) return;
    try {
      setSubmittingAction(true);
      const updated = await auditExecutionApi.dispute(executionId, {
        disputeReason,
        disputeNotes: disputeNotes.trim(),
        disputedQuestionIds: disputedQuestions,
        counterEvidenceUrls: counterEvidence,
      });
      finish(updated, { type: 'warning', title: 'Dispute raised', message: 'The audit is marked as disputed and sent to the 5S program lead for a ruling.' });
    } catch (err) {
      addToast({ type: 'error', title: 'Dispute not raised', message: getApiErrorMessage(err, 'The dispute could not be recorded.') });
    } finally {
      setSubmittingAction(false);
    }
  };

  const adjustedValue = adjustedScore === '' ? NaN : Number(adjustedScore);
  const adjustedValid = resolveDecision === 'REJECT_DISPUTE' || (Number.isFinite(adjustedValue) && adjustedValue >= 0 && adjustedValue <= 100);

  const handleSubmitDisputeResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormTried(true);
    if (!executionId || !resolveNotes.trim() || !adjustedValid) return;
    try {
      setSubmittingAction(true);
      const updated = await auditExecutionApi.resolveDispute(executionId, {
        decision: resolveDecision,
        resolutionNotes: resolveNotes.trim(),
        adjustedScore: resolveDecision === 'ACCEPT_DISPUTE' ? adjustedValue : undefined,
      });
      finish(updated, {
        type: 'success',
        title: 'Ruling recorded',
        message: resolveDecision === 'ACCEPT_DISPUTE' ? 'The dispute was accepted and the score adjusted.' : 'The dispute was rejected and the findings stand.',
      });
    } catch (err) {
      addToast({ type: 'error', title: 'Ruling not recorded', message: getApiErrorMessage(err, 'The ruling could not be recorded.') });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleEvidenceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingEvidence(true);
    try {
      const { blob } = await compressPhotoFile(file);
      const stored = await auditExecutionApi.uploadFile(blob, 'counter-evidence.jpg');
      setCounterEvidence((prev) => [...prev, stored.url]);
    } catch (err) {
      addToast({ type: 'error', title: 'Photo not attached', message: getApiErrorMessage(err, 'The photo could not be uploaded. Use a JPEG or PNG image.') });
    } finally {
      setUploadingEvidence(false);
    }
  };

  const actionSla = (obs: Observation): string => {
    const action = obs.correctiveAction;
    if (!action) return '—';
    // Held actions get their due date when the area owner signs off; until then show the SLA itself
    if (action.status === 'PENDING_ACKNOWLEDGEMENT') {
      const hours = action.slaHours;
      if (!hours) return '—';
      const label = hours % 24 === 0 ? `${hours / 24} ${hours === 24 ? 'day' : 'days'}` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
      return `${label} after sign-off`;
    }
    return action.targetDate ? `Due ${formatDate(action.targetDate)}` : '—';
  };

  const footer =
    actionView === 'acknowledge' ? (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
        <Button variant="secondary" type="button" onClick={() => setActionView('view')}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="audit-ack-form" icon={<CheckCircle2 size={16} />} loading={submittingAction}>
          Sign off
        </Button>
      </div>
    ) : actionView === 'dispute' ? (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
        <Button variant="secondary" type="button" onClick={() => setActionView('view')}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="audit-dispute-form" icon={<Send size={16} />} loading={submittingAction} disabled={uploadingEvidence}>
          Raise dispute
        </Button>
      </div>
    ) : actionView === 'resolveDispute' ? (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
        <Button variant="secondary" type="button" onClick={() => setActionView('view')}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="audit-ruling-form" icon={<CheckCircle2 size={16} />} loading={submittingAction}>
          Record ruling
        </Button>
      </div>
    ) : undefined;

  const fieldError = (show: boolean, text: string) =>
    show ? (
      <div role="alert" className="form-error">
        {text}
      </div>
    ) : null;

  const renderBody = () => {
    if (loading) return <LoadingState label="Loading audit report…" />;
    if (loadError || !execution) return <ErrorState message={loadError ?? 'The audit report could not be loaded.'} onRetry={loadReport} />;

    const auditedAt = execution.completedAt || execution.startedAt;
    const ownerName = fullName(execution.location?.owner);
    const auditorName = execution.auditorName || fullName(execution.auditor) || '—';
    const scorePillars = PILLARS.filter(
      (p) => execution.pillarScores?.[p] !== undefined || execution.templateVersion?.sections?.some((s) => s.category === p && (s.questions?.length ?? 0) > 0),
    );
    const disputedIds = toList(execution.disputedQuestionIds);
    const counterUrls = toList(execution.counterEvidenceUrls);
    const ruled = execution.disputeStatus === 'RESOLVED_ACCEPTED' || execution.disputeStatus === 'RESOLVED_REJECTED';

    return (
      <div className="audit-report-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Status and actions */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Badge variant={auditStatusVariant(execution.status)}>{auditStatusLabel(execution.status)}</Badge>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Audited {formatDateTime(auditedAt)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" icon={<Printer size={14} />} onClick={() => window.print()}>
              Print
            </Button>
            {canRespond && actionView === 'view' && (
              <>
                <Button variant="primary" size="sm" icon={<CheckCircle2 size={14} />} onClick={() => setActionView('acknowledge')}>
                  Acknowledge
                </Button>
                <Button variant="secondary" size="sm" icon={<Scale size={14} />} onClick={() => setActionView('dispute')}>
                  Dispute
                </Button>
              </>
            )}
            {canRule && actionView === 'view' && (
              <Button variant="secondary" size="sm" icon={<Scale size={14} />} onClick={() => setActionView('resolveDispute')}>
                Rule on dispute
              </Button>
            )}
          </div>
        </div>

        {actionView === 'acknowledge' && (
          <Card title="Acknowledge findings" subtitle="Your sign-off opens the corrective actions and starts their deadlines.">
            <form id="audit-ack-form" onSubmit={handleSubmitAcknowledgement} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                You accept audit {execution.auditCode} for <strong>{execution.location?.name || '—'}</strong> and its{' '}
                {(execution.observations?.length ?? 0) === 1 ? '1 finding' : `${execution.observations?.length ?? 0} findings`}.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <span className="form-label">Signed by</span>
                  <div style={{ fontWeight: 600, padding: '8px 0' }}>{signerName}</div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="ackTargetDate">Target resolution date (optional)</label>
                  <input id="ackTargetDate" type="date" className="form-input" value={ackTargetDate} onChange={(e) => setAckTargetDate(e.target.value)} />
                  <div className="form-hint" style={{ marginTop: '4px' }}>
                    Leave empty to use each action's SLA.
                  </div>
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="ackNotes">
                  Remarks and action plan <span className="required" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="ackNotes"
                  className="form-textarea"
                  rows={3}
                  value={ackNotes}
                  onChange={(e) => setAckNotes(e.target.value)}
                  aria-invalid={formTried && !ackNotes.trim()}
                  placeholder="What will be done, by whom and when"
                />
                {fieldError(formTried && !ackNotes.trim(), 'Describe your action plan.')}
              </div>
              <SignaturePad ref={ackSignatureRef} label="Your signature" onChange={setHasAckSigned} error={formTried && !hasAckSigned ? 'Sign in the box.' : null} />
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={ackConfirmed} onChange={(e) => setAckConfirmed(e.target.checked)} style={{ marginTop: '3px' }} />
                <span>I am responsible for {execution.location?.name || 'this area'} and accept these findings.</span>
              </label>
              {fieldError(formTried && !ackConfirmed, 'Tick the box to confirm.')}
            </form>
          </Card>
        )}

        {actionView === 'dispute' && (
          <Card title="Dispute this audit" subtitle="A 5S program lead reviews the dispute and rules on it.">
            <form id="audit-dispute-form" onSubmit={handleSubmitDispute} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <span className="form-label">Raised by</span>
                  <div style={{ fontWeight: 600, padding: '8px 0' }}>{signerName}</div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="disputeReason">
                  Reason <span className="required" aria-hidden="true">*</span>
                </label>
                  <select id="disputeReason" className="form-select" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}>
                    {Object.entries(DISPUTE_REASON_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="disputeNotes">
                  Explanation <span className="required" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="disputeNotes"
                  className="form-textarea"
                  rows={4}
                  value={disputeNotes}
                  onChange={(e) => setDisputeNotes(e.target.value)}
                  aria-invalid={formTried && !disputeNotes.trim()}
                  placeholder="Why should the result be reviewed? Refer to changeover logs, work orders or the standard."
                />
                {fieldError(formTried && !disputeNotes.trim(), 'Explain why you dispute the result.')}
              </div>
              {questions.length > 0 && (
                <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 12px', margin: 0 }}>
                  <legend className="form-label" style={{ padding: '0 4px' }}>
                    Questions you dispute (optional)
                  </legend>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                    {questions.map((q) => (
                      <label key={q.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={disputedQuestions.includes(q.id)}
                          onChange={(e) => setDisputedQuestions((prev) => (e.target.checked ? [...prev, q.id] : prev.filter((id) => id !== q.id)))}
                          style={{ marginTop: '3px' }}
                        />
                        <span>
                          <strong>{q.questionCode}</strong> {q.questionText}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <div>
                <div className="form-label">Counter-evidence photos (optional)</div>
                <input ref={evidenceInputRef} type="file" accept="image/*" capture="environment" hidden aria-hidden="true" tabIndex={-1} onChange={handleEvidenceFile} />
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {counterEvidence.map((url, idx) => (
                    <div key={url} style={{ position: 'relative', width: '96px' }}>
                      <ImageWithFallback src={url} alt={`Counter-evidence photo ${idx + 1}`} height="72px" />
                      <button
                        type="button"
                        aria-label={`Remove counter-evidence photo ${idx + 1}`}
                        onClick={() => setCounterEvidence((prev) => prev.filter((u) => u !== url))}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          border: '1px solid var(--border-strong)',
                          background: 'var(--bg-surface)',
                          color: 'var(--color-danger)',
                          boxShadow: 'var(--shadow-xs)',
                          cursor: 'pointer',
                          zIndex: 3,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" size="sm" icon={<Camera size={14} />} loading={uploadingEvidence} onClick={() => evidenceInputRef.current?.click()}>
                    Add photo
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        )}

        {actionView === 'resolveDispute' && (
          <Card title="Rule on the dispute" subtitle="Accept it (and adjust the score) or reject it (the findings stand).">
            <form id="audit-ruling-form" onSubmit={handleSubmitDisputeResolution} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-pale)',
                  border: '1px solid var(--color-info-border)',
                  fontSize: '13px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div>
                  <strong>Raised by:</strong> {execution.disputedByName || '—'}
                </div>
                <div>
                  <strong>Reason:</strong> {DISPUTE_REASON_LABELS[execution.disputeReason ?? ''] ?? execution.disputeReason ?? '—'}
                </div>
                <div>
                  <strong>Explanation:</strong> {execution.disputeNotes || '—'}
                </div>
                {disputedIds.length > 0 && (
                  <div>
                    <strong>Questions:</strong> {disputedIds.map(questionCode).join(', ')}
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="resolveDecision">
                  Decision <span className="required" aria-hidden="true">*</span>
                </label>
                  <select
                    id="resolveDecision"
                    className="form-select"
                    value={resolveDecision}
                    onChange={(e) => setResolveDecision(e.target.value === 'REJECT_DISPUTE' ? 'REJECT_DISPUTE' : 'ACCEPT_DISPUTE')}
                  >
                    <option value="ACCEPT_DISPUTE">Accept the dispute and adjust the score</option>
                    <option value="REJECT_DISPUTE">Reject the dispute; the findings stand</option>
                  </select>
                </div>
                {resolveDecision === 'ACCEPT_DISPUTE' && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" htmlFor="adjustedScore">
                      Adjusted score (%) <span className="required" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="adjustedScore"
                      type="number"
                      inputMode="decimal"
                      className="form-input"
                      min={0}
                      max={100}
                      step={0.1}
                      value={adjustedScore}
                      onChange={(e) => setAdjustedScore(e.target.value)}
                      aria-invalid={formTried && !adjustedValid}
                    />
                    {fieldError(formTried && !adjustedValid, 'Enter a score from 0 to 100.')}
                  </div>
                )}
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="resolveNotes">
                  Reasoning <span className="required" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="resolveNotes"
                  className="form-textarea"
                  rows={3}
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  aria-invalid={formTried && !resolveNotes.trim()}
                />
                {fieldError(formTried && !resolveNotes.trim(), 'Explain the ruling.')}
              </div>
            </form>
          </Card>
        )}

        {/* Printable report: a white sheet with fixed, print-safe colours (it looks the same on paper in any theme) */}
        <div
          id="printable-5s-report"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            padding: '24px',
            borderRadius: 'var(--radius-lg)',
            background: PRINT.paper,
            color: PRINT.ink,
            border: `1px solid ${PRINT.line}`,
          }}
        >
          {/* Report header */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '16px', borderBottom: `2px solid ${PRINT.primary}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: PRINT.primary }}>{currentTenant?.name || '—'}</div>
                <h2 style={{ fontSize: '22px', fontWeight: 700, color: PRINT.ink, margin: '4px 0 0 0' }}>5S audit report</h2>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12.5px', color: PRINT.muted }}>Audit code</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: PRINT.primaryDark, fontVariantNumeric: 'tabular-nums' }}>{execution.auditCode}</div>
              </div>
            </div>
            <dl className="keep-cols" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '12px 24px', fontSize: '13px' }}>
              {[
                ['Location', execution.location ? `${execution.location.name}${execution.location.areaCode ? ` (${execution.location.areaCode})` : ''}` : '—'],
                ['Department', execution.location?.orgNode?.name || '—'],
                ['Area owner', ownerName || 'Not assigned'],
                ['Date', formatDate(auditedAt)],
                ['Auditor', auditorName],
                ['Audit type', humanize(execution.auditType) || '—'],
                ['Template', `${execution.template?.name || '—'}${execution.templateVersion?.versionNumber ? ` v${execution.templateVersion.versionNumber}` : ''}`],
              ].map(([label, value]) => (
                <div key={label} style={{ minWidth: 0 }}>
                  <dt style={{ color: PRINT.muted, marginBottom: '2px' }}>{label}</dt>
                  <dd style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Score summary */}
          <section aria-label="Score summary" className="keep-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: '12px' }}>
            <div
              style={{
                padding: '16px',
                borderRadius: '8px',
                background: execution.isPassed ? PRINT.passBg : PRINT.failBg,
                border: `1px solid ${execution.isPassed ? PRINT.passBorder : PRINT.failBorder}`,
              }}
            >
              <div style={{ fontSize: '13px', color: PRINT.muted }}>Overall score</div>
              <div style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1.15, color: execution.isPassed ? PRINT.pass : PRINT.fail, fontVariantNumeric: 'tabular-nums' }}>
                {formatNumber(execution.overallScore)}%
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: execution.isPassed ? PRINT.pass : PRINT.fail }}>{execution.isPassed ? 'Pass' : 'Fail'}</div>
            </div>
            <div style={{ padding: '16px', borderRadius: '8px', background: PRINT.panel, border: `1px solid ${PRINT.line}` }}>
              <div style={{ fontSize: '13px', color: PRINT.muted }}>Findings</div>
              <div style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{execution.observations?.length ?? 0}</div>
              <div style={{ fontSize: '13px', color: PRINT.muted }}>Sent to the area owner</div>
            </div>
            <div style={{ padding: '16px', borderRadius: '8px', background: PRINT.panel, border: `1px solid ${PRINT.line}` }}>
              <div style={{ fontSize: '13px', color: PRINT.muted }}>Critical failures</div>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  lineHeight: 1.15,
                  color: execution.criticalFailureCount > 0 ? PRINT.fail : PRINT.ink,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {execution.criticalFailureCount ?? 0}
              </div>
              <div style={{ fontSize: '13px', color: PRINT.muted }}>{execution.criticalFailureCount > 0 ? 'Critical questions failed' : 'None'}</div>
            </div>
          </section>

          {scorePillars.length > 0 && (
            <section>
              <h3 style={printHeading}>Score by pillar</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={printTable}>
                  <thead>
                    <tr>
                      <th scope="col" style={printTh}>
                        Pillar
                      </th>
                      <th scope="col" style={{ ...printTh, textAlign: 'right', width: '90px' }}>
                        Score
                      </th>
                      <th scope="col" style={{ ...printTh, width: '45%' }}>
                        <span className="sr-only">Score bar</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorePillars.map((p) => {
                      const score = execution.pillarScores?.[p];
                      return (
                        <tr key={p}>
                          <td style={{ ...printTd, fontWeight: 600 }}>{pillarLabel(p)}</td>
                          <td style={{ ...printTd, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{score === undefined ? '—' : `${formatNumber(score)}%`}</td>
                          <td style={printTd}>
                            <div aria-hidden="true" style={{ height: '8px', borderRadius: '999px', background: PRINT.track, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, Math.max(0, score ?? 0))}%`, height: '100%', background: PRINT.primary }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {execution.observations && execution.observations.length > 0 && (
            <section>
              <h3 style={printHeading}>Findings and corrective actions ({execution.observations.length})</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
                {execution.observations.map((obs, idx) => (
                  <li
                    key={obs.id}
                    style={{
                      padding: '12px 0',
                      borderTop: idx === 0 ? `1px solid ${PRINT.line}` : 'none',
                      borderBottom: `1px solid ${PRINT.line}`,
                      display: 'flex',
                      gap: '16px',
                      flexWrap: 'wrap',
                      breakInside: 'avoid',
                    }}
                  >
                    <div style={{ width: '88px', flexShrink: 0 }}>
                      <ImageWithFallback src={obs.annotatedPhotoUrl || obs.beforePhotoUrl} alt={`Evidence for ${obs.observationCode}`} height="66px" allowZoom />
                    </div>
                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: PRINT.primaryDark, fontVariantNumeric: 'tabular-nums' }}>{obs.observationCode}</span>
                        <PrintTag tone={severityVariant(obs.severity)}>{severityLabel(obs.severity)}</PrintTag>
                        <PrintTag tone="neutral">{pillarLabel(obs.category)}</PrintTag>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 600, overflowWrap: 'anywhere' }}>{obs.title}</div>
                      <div style={{ fontSize: '13px', color: PRINT.muted, marginTop: '2px', overflowWrap: 'anywhere' }}>{obs.description}</div>
                    </div>
                    <div style={{ fontSize: '13px', flex: '0 1 180px', minWidth: '140px' }}>
                      <div style={{ color: PRINT.muted }}>Corrective action</div>
                      <div style={{ fontWeight: 600 }}>{obs.correctiveAction ? `${obs.correctiveAction.actionCode} · ${actionStatusLabel(obs.correctiveAction.status)}` : '—'}</div>
                      <div>{actionSla(obs)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Sign-offs */}
          <section>
            <h3 style={printHeading}>Sign-off</h3>
            <div className="keep-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '16px' }}>
              <div style={signOffBlock}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>1. Auditor</div>
                <div style={{ fontSize: '13px', color: PRINT.muted }}>
                  Audited by <strong style={{ color: PRINT.ink }}>{auditorName}</strong>
                </div>
                {execution.auditorSignature ? (
                  isImageSignature(execution.auditorSignature) ? (
                    <div style={signatureBox}>
                      <img src={execution.auditorSignature} alt={`Signature of ${auditorName}`} style={{ maxHeight: '70px', maxWidth: '100%', objectFit: 'contain' }} />
                    </div>
                  ) : (
                    <div style={signatureBox}>{execution.auditorSignature}</div>
                  )
                ) : (
                  <div style={{ ...signatureBox, borderStyle: 'dashed', color: PRINT.muted }}>No signature captured</div>
                )}
                {execution.completedAt && <div style={{ fontSize: '12.5px', color: PRINT.muted }}>Submitted {formatDateTime(execution.completedAt)}</div>}
              </div>

              <div style={signOffBlock}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>2. Area owner</div>
                {execution.status === 'DISPUTED' || ruled ? (
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      background: PRINT.warnBg,
                      border: `1px solid ${PRINT.warnBorder}`,
                      fontSize: '13px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      color: PRINT.ink,
                    }}
                  >
                    <div>
                      <strong>Disputed by:</strong> {execution.disputedByName || '—'}
                      {execution.disputedAt ? ` · ${formatDateTime(execution.disputedAt)}` : ''}
                    </div>
                    <div>
                      <strong>Reason:</strong> {DISPUTE_REASON_LABELS[execution.disputeReason ?? ''] ?? execution.disputeReason ?? '—'}
                    </div>
                    <div>
                      <strong>Explanation:</strong> {execution.disputeNotes || '—'}
                    </div>
                    {disputedIds.length > 0 && (
                      <div>
                        <strong>Questions:</strong> {disputedIds.map(questionCode).join(', ')}
                      </div>
                    )}
                    {counterUrls.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {counterUrls.map((url, idx) => (
                          <div key={url} style={{ width: '64px' }}>
                            <ImageWithFallback src={url} alt={`Counter-evidence photo ${idx + 1}`} height="48px" allowZoom />
                          </div>
                        ))}
                      </div>
                    )}
                    {ruled ? (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${PRINT.warnBorder}`, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div>
                          <strong>Ruling:</strong>{' '}
                          {execution.disputeStatus === 'RESOLVED_ACCEPTED' ? `Dispute accepted, score adjusted to ${formatNumber(execution.overallScore)}%` : 'Dispute rejected, findings stand'}
                        </div>
                        <div>
                          <strong>By:</strong> {execution.disputeResolvedByName || '—'}
                          {execution.disputeResolvedAt ? ` · ${formatDateTime(execution.disputeResolvedAt)}` : ''}
                        </div>
                        {execution.disputeResolutionNotes && (
                          <div>
                            <strong>Reasoning:</strong> {execution.disputeResolutionNotes}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ marginTop: '4px', fontWeight: 600 }}>Awaiting a ruling</div>
                    )}
                  </div>
                ) : execution.status === 'ACKNOWLEDGED' || execution.acknowledgedAt ? (
                  <>
                    <div style={{ fontSize: '13px', color: PRINT.muted }}>
                      Acknowledged by <strong style={{ color: PRINT.ink }}>{execution.acknowledgedByName || '—'}</strong>
                    </div>
                    {execution.acknowledgementSignature && isImageSignature(execution.acknowledgementSignature) ? (
                      <div style={signatureBox}>
                        <img
                          src={execution.acknowledgementSignature}
                          alt={`Signature of ${execution.acknowledgedByName || 'the area owner'}`}
                          style={{ maxHeight: '70px', maxWidth: '100%', objectFit: 'contain' }}
                        />
                      </div>
                    ) : (
                      <div style={{ ...signatureBox, borderStyle: 'dashed', color: PRINT.muted }}>{execution.acknowledgementSignature || 'No signature captured'}</div>
                    )}
                    {execution.acknowledgementNotes && (
                      <div style={{ fontSize: '13px', color: PRINT.muted }}>
                        <strong style={{ color: PRINT.ink }}>Action plan:</strong> {execution.acknowledgementNotes}
                      </div>
                    )}
                    <div style={{ fontSize: '12.5px', color: PRINT.muted }}>
                      {execution.acknowledgedAt && <span>Signed {formatDateTime(execution.acknowledgedAt)}</span>}
                      {execution.targetResolutionDate && <span> · Target resolution {formatDate(execution.targetResolutionDate)}</span>}
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ ...signatureBox, borderStyle: 'dashed', color: PRINT.warn, fontWeight: 600, gap: '6px' }}>
                      <AlertTriangle size={14} aria-hidden="true" /> Awaiting the area owner's sign-off
                    </div>
                    {canRespond && actionView === 'view' && (
                      <Button variant="primary" size="sm" icon={<CheckCircle2 size={14} />} onClick={() => setActionView('acknowledge')} style={{ alignSelf: 'flex-start' }} className="no-print">
                        Acknowledge findings
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Checklist answers */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ ...printHeading, margin: 0 }}>Checklist answers</h3>
            {execution.templateVersion?.sections?.map((sec) => {
              const collapsed = collapsedSections[sec.id] === true;
              const scored = (execution.answers ?? []).filter((a) => a.sectionId === sec.id && a.status !== 'NOT_APPLICABLE');
              const secScore = scored.reduce((acc, a) => acc + a.score, 0);
              const secMax = scored.reduce((acc, a) => acc + a.maxScore, 0);
              return (
                <div key={sec.id} style={{ borderRadius: '8px', border: `1px solid ${PRINT.line}`, overflow: 'hidden', breakInside: 'avoid-page' }}>
                  <div
                    style={{
                      padding: '8px 12px',
                      background: PRINT.panel,
                      borderBottom: collapsed ? 'none' : `1px solid ${PRINT.line}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px 12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>{sec.title}</span>
                      <PrintTag tone="neutral">{pillarLabel(sec.category)}</PrintTag>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {secMax > 0 ? `${formatNumber(Math.round((secScore / secMax) * 100))}% (${formatNumber(secScore)} / ${formatNumber(secMax)} pts)` : '—'}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="no-print"
                        aria-expanded={!collapsed}
                        aria-label={`${collapsed ? 'Show' : 'Hide'} answers for ${sec.title}`}
                        icon={collapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                        onClick={() => setCollapsedSections((prev) => ({ ...prev, [sec.id]: !collapsed }))}
                      >
                        {collapsed ? 'Show' : 'Hide'}
                      </Button>
                    </span>
                  </div>

                  {!collapsed && (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ ...printTable, minWidth: '560px' }}>
                        <thead>
                          <tr>
                            <th scope="col" style={printTh}>
                              Code
                            </th>
                            <th scope="col" style={printTh}>
                              Question
                            </th>
                            <th scope="col" style={printTh}>
                              Result
                            </th>
                            <th scope="col" style={{ ...printTh, textAlign: 'right' }}>
                              Score
                            </th>
                            <th scope="col" style={printTh}>
                              Notes and evidence
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sec.questions?.map((q) => {
                            const ans = execution.answers?.find((a) => a.questionId === q.id);
                            const photos = (ans?.evidenceUrls ?? []).map(evidenceUrl).filter((u): u is string => !!u);
                            return (
                              <tr key={q.id} style={{ breakInside: 'avoid' }}>
                                <td style={{ ...printTd, whiteSpace: 'nowrap', fontWeight: 600, color: PRINT.primaryDark, fontVariantNumeric: 'tabular-nums' }}>{q.questionCode}</td>
                                <td style={{ ...printTd, minWidth: '200px' }}>
                                  <div style={{ fontWeight: 600 }}>{q.questionText}</div>
                                  {q.guidance && <div style={{ fontSize: '12px', color: PRINT.muted, marginTop: '2px' }}>{q.guidance}</div>}
                                </td>
                                <td style={printTd}>
                                  {ans ? (
                                    <PrintTag tone={answerStatusVariant(ans.status)}>{ANSWER_STATUS_LABELS[ans.status] ?? ans.status}</PrintTag>
                                  ) : (
                                    <PrintTag tone="neutral">Not answered</PrintTag>
                                  )}
                                </td>
                                <td style={{ ...printTd, whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                  {ans && ans.status !== 'NOT_APPLICABLE' ? (
                                    <>
                                      <strong>{formatNumber(ans.score)}</strong> / {formatNumber(q.weightage * 5)}
                                    </>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td style={{ ...printTd, minWidth: '160px' }}>
                                  {ans?.notes && <div style={{ color: PRINT.muted, marginBottom: '4px' }}>{ans.notes}</div>}
                                  {photos.length > 0 && (
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                      {photos.map((url, idx) => (
                                        <div key={`${url}-${idx}`} style={{ width: '44px' }}>
                                          <ImageWithFallback src={url} alt={`Photo ${idx + 1} for ${q.questionCode}`} height="44px" allowZoom />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {!ans?.notes && photos.length === 0 && '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Audit report"
      subtitle={execution ? `${execution.auditCode}${execution.location?.name ? ` · ${execution.location.name}` : ''}` : undefined}
      maxWidth="940px"
      footer={footer}
    >
      {renderBody()}
    </Modal>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { AuditExecution } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { ProgressBar } from '../ui/ProgressBar';
import { ImageWithFallback } from '../ui/ImageWithFallback';
import {
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  User,
  ShieldAlert,
  ShieldCheck,
  Printer,
  RotateCcw,
  Send,
  X,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Award,
  Layers,
  HelpCircle,
  Camera,
  Calendar,
  AlertOctagon,
  Scale,
} from 'lucide-react';

interface AuditReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  executionId: string | null;
  onAcknowledged?: (updatedExec: AuditExecution) => void;
}

export const AuditReportModal: React.FC<AuditReportModalProps> = ({
  isOpen,
  onClose,
  executionId,
  onAcknowledged,
}) => {
  const { currentUser, currentTenant, addToast } = useApp();

  const [loading, setLoading] = useState<boolean>(true);
  const [execution, setExecution] = useState<AuditExecution | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Workflow Action Modes
  const [actionView, setActionView] = useState<'view' | 'acknowledge' | 'dispute' | 'resolveDispute'>('view');
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);

  // Acknowledgement Form State
  const [ackName, setAckName] = useState<string>('');
  const [ackNotes, setAckNotes] = useState<string>('');
  const [ackTargetDate, setAckTargetDate] = useState<string>('');
  const [ackConfirmed, setAckConfirmed] = useState<boolean>(false);
  const ackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasAckSigned, setHasAckSigned] = useState<boolean>(false);

  // Dispute Form State
  const [disputeName, setDisputeName] = useState<string>('');
  const [disputeReason, setDisputeReason] = useState<string>('SCHEDULED_CHANGEOVER');
  const [disputeNotes, setDisputeNotes] = useState<string>('');
  const [disputedQuestions, setDisputedQuestions] = useState<string[]>([]);

  // Dispute Resolution Form State (Lead Auditor)
  const [resolveDecision, setResolveDecision] = useState<'ACCEPT_DISPUTE' | 'REJECT_DISPUTE'>('ACCEPT_DISPUTE');
  const [resolveNotes, setResolveNotes] = useState<string>('');
  const [adjustedScore, setAdjustedScore] = useState<number>(85);

  useEffect(() => {
    if (isOpen && executionId) {
      loadReport();
    }
  }, [isOpen, executionId]);

  const loadReport = async () => {
    if (!executionId) return;
    try {
      setLoading(true);
      const data = await api.getAuditReport(executionId);
      setExecution(data);

      // Pre-fill names
      const ownerName = data.location?.owner
        ? `${data.location.owner.firstName} ${data.location.owner.lastName}`
        : currentUser?.fullName || 'Designated Area Owner';
      setAckName(ownerName);
      setDisputeName(ownerName);

      // Default target date: 7 days from now
      const targetD = new Date();
      targetD.setDate(targetD.getDate() + 7);
      setAckTargetDate(targetD.toISOString().split('T')[0]);

      // Expand all sections by default
      const exp: Record<string, boolean> = {};
      if (data.templateVersion?.sections) {
        data.templateVersion.sections.forEach((s) => {
          exp[s.id] = true;
        });
      }
      setExpandedSections(exp);
      setActionView('view');
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Could Not Load Report',
        message: err.message || 'Unable to retrieve audit execution details.',
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  // Initialize Canvas Signature Pad for Area Owner
  useEffect(() => {
    if (actionView === 'acknowledge') {
      setTimeout(() => {
        initAckSignaturePad();
      }, 150);
    }
  }, [actionView]);

  const initAckSignaturePad = () => {
    const canvas = ackCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#059669'; // Forest green for Area Owner acceptance
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    let drawing = false;
    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    canvas.onmousedown = (e) => {
      drawing = true;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      setHasAckSigned(true);
    };

    canvas.onmousemove = (e) => {
      if (!drawing) return;
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    };

    canvas.onmouseup = () => {
      drawing = false;
    };
  };

  const clearAckSignature = () => {
    const canvas = ackCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasAckSigned(false);
  };

  // Handle Formal Acknowledgement Submission
  const handleSubmitAcknowledgement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!executionId || !ackName || !ackNotes) return;
    try {
      setSubmittingAction(true);
      const canvas = ackCanvasRef.current;
      const signatureData = canvas?.toDataURL('image/png') || '';

      const updated = await api.acknowledgeAuditExecution(executionId, {
        acknowledgedByName: ackName,
        acknowledgedById: currentUser?.id,
        acknowledgementSignature: signatureData,
        acknowledgementNotes: ackNotes,
        targetResolutionDate: ackTargetDate,
      });

      setExecution(updated);
      setActionView('view');
      if (onAcknowledged) onAcknowledged(updated);

      addToast({
        type: 'success',
        title: 'Audit Findings Formally Acknowledged',
        message: `Area Owner sign-off recorded for ${updated.location?.name || 'Area'}. CAPA commitments logged.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Acknowledgement Failed',
        message: err.message || 'Error recording area owner sign-off.',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Dispute Submission
  const handleSubmitDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!executionId || !disputeName || !disputeNotes) return;
    try {
      setSubmittingAction(true);
      const updated = await api.disputeAuditExecution(executionId, {
        disputedByName: disputeName,
        disputedById: currentUser?.id,
        disputeReason,
        disputeNotes,
        disputedQuestionIds: disputedQuestions,
      });

      setExecution(updated);
      setActionView('view');
      if (onAcknowledged) onAcknowledged(updated);

      addToast({
        type: 'warning',
        title: 'Formal Dispute Logged',
        message: 'Audit report marked as DISPUTED. Transferred to Lead Auditor for review.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Dispute Submission Failed',
        message: err.message || 'Error logging audit dispute.',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Dispute Resolution (Lead Auditor)
  const handleSubmitDisputeResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!executionId || !resolveNotes) return;
    try {
      setSubmittingAction(true);
      const updated = await api.resolveAuditDispute(executionId, {
        decision: resolveDecision,
        resolutionNotes: resolveNotes,
        resolvedByName: currentUser?.fullName || '5S Program Lead',
        adjustedScore: resolveDecision === 'ACCEPT_DISPUTE' ? adjustedScore : undefined,
      });

      setExecution(updated);
      setActionView('view');
      if (onAcknowledged) onAcknowledged(updated);

      addToast({
        type: 'success',
        title: 'Dispute Ruling Finalized',
        message: `Dispute marked as ${resolveDecision === 'ACCEPT_DISPUTE' ? 'ACCEPTED' : 'UPHELD'}.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Ruling Failed',
        message: err.message || 'Error recording dispute resolution.',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Official 5S Audit Inspection Report & Sign-Off"
      subtitle={execution ? `Audit Code: ${execution.auditCode} • ${execution.location?.name || ''}` : undefined}
      maxWidth="940px"
    >
      {loading || !execution ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div className="spinner" />
          <p style={{ marginTop: '14px', color: 'var(--text-secondary)' }}>
            Retrieving official audit report and photographic evidence...
          </p>
        </div>
      ) : (
        <div className="audit-report-container" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Top Actions Bar (Print / Acknowledgement Status) */}
          <div
            className="no-print"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Badge
                variant={
                  execution.status === 'ACKNOWLEDGED'
                    ? 'success'
                    : execution.status === 'DISPUTED'
                    ? 'warning'
                    : execution.status === 'SUBMITTED'
                    ? 'info'
                    : 'neutral'
                }
              >
                {execution.status === 'ACKNOWLEDGED'
                  ? 'FORMALLY ACKNOWLEDGED ✓'
                  : execution.status === 'DISPUTED'
                  ? 'FINDINGS CONTESTED / DISPUTED'
                  : execution.status === 'SUBMITTED'
                  ? 'AWAITING AREA OWNER SIGN-OFF'
                  : execution.status}
              </Badge>

              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Audited on {new Date(execution.completedAt || execution.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                variant="secondary"
                size="sm"
                icon={<Printer size={14} />}
                onClick={handlePrint}
                title="Print Official 5S Audit Report"
              >
                Print / Export PDF
              </Button>

              {execution.status === 'SUBMITTED' && actionView === 'view' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<CheckCircle2 size={14} />}
                    onClick={() => setActionView('acknowledge')}
                  >
                    Acknowledge & Sign Off
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Scale size={14} />}
                    onClick={() => setActionView('dispute')}
                    style={{ color: 'var(--color-warning)' }}
                  >
                    Raise Dispute
                  </Button>
                </>
              )}

              {execution.status === 'DISPUTED' && actionView === 'view' && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Scale size={14} />}
                  onClick={() => setActionView('resolveDispute')}
                >
                  Resolve Dispute (Lead Auditor)
                </Button>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* ACTION FORM 1: AREA OWNER FORMAL ACKNOWLEDGEMENT FORM */}
          {/* ========================================================= */}
          {actionView === 'acknowledge' && (
            <Card
              title="Area Owner Formal Acknowledgement & Sign-Off"
              subtitle="Review non-conformances, verify accountability, and establish remediation commitment"
            >
              <form onSubmit={handleSubmitAcknowledgement} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(5, 150, 105, 0.08)',
                    border: '1px solid rgba(5, 150, 105, 0.25)',
                    color: '#065F46',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Acknowledgement Commitment & CAPA Activation:</strong> By signing below, you formally acknowledge and accept the 5S Audit Report ({execution.auditCode}) for <strong>{execution.location?.name}</strong>. This formal sign-off unlocks and activates the {execution.observations?.length || 0} non-conformance Corrective & Preventive Action (CAPA) workflows and begins the committed SLA countdown.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Area Owner Full Name & Title *</label>
                    <input
                      type="text"
                      className="form-control"
                      value={ackName}
                      onChange={(e) => setAckName(e.target.value)}
                      placeholder="e.g. Arun Patel (Line Supervisor)"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Committed Resolution Target Date *</label>
                    <input
                      type="date"
                      className="form-control"
                      value={ackTargetDate}
                      onChange={(e) => setAckTargetDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Area Owner Remarks & Action Plan *</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={ackNotes}
                    onChange={(e) => setAckNotes(e.target.value)}
                    placeholder="Describe scheduled containment, shadow board realignment, or maintenance work orders initiated to rectify findings..."
                    required
                  />
                </div>

                {/* Digital Signature Pad */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      Area Owner Digital Signature Pad *
                    </label>
                    <button
                      type="button"
                      onClick={clearAckSignature}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-primary)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <RotateCcw size={12} /> Clear Signature
                    </button>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '110px',
                      borderRadius: 'var(--radius-md)',
                      background: '#FFFFFF',
                      border: '1px solid var(--border-subtle)',
                      overflow: 'hidden',
                    }}
                  >
                    <canvas ref={ackCanvasRef} width={800} height={110} style={{ width: '100%', height: '100%', cursor: 'crosshair' }} />
                  </div>
                </div>

                {/* Confirmation Checkbox */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    checked={ackConfirmed}
                    onChange={(e) => setAckConfirmed(e.target.checked)}
                    required
                  />
                  <span>
                    I confirm that I am the authorized Area Owner / Designated Supervisor for <strong>{execution.location?.name}</strong> and accept these audit findings.
                  </span>
                </label>

                {/* Form Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                  <Button variant="secondary" type="button" onClick={() => setActionView('view')}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    type="submit"
                    icon={<CheckCircle2 size={16} />}
                    loading={submittingAction}
                    disabled={!ackConfirmed}
                  >
                    Confirm Formal Sign-Off
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* ========================================================= */}
          {/* ACTION FORM 2: RAISE FORMAL DISPUTE FORM */}
          {/* ========================================================= */}
          {actionView === 'dispute' && (
            <Card
              title="Raise Formal Audit Finding Dispute"
              subtitle="Contest specific non-conformances with justification and counter-evidence for Lead Auditor review"
            >
              <form onSubmit={handleSubmitDispute} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    color: '#92400E',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Dispute Policy:</strong> Disputes should be raised when findings are outside the area boundary, occurred during an authorized changeover, or evidence was incorrectly attributed. The Lead 5S Auditor will review your counter-justification.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Contesting Area Owner / Supervisor *</label>
                    <input
                      type="text"
                      className="form-control"
                      value={disputeName}
                      onChange={(e) => setDisputeName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Dispute Category / Reason Code *</label>
                    <select
                      className="form-control"
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      required
                    >
                      <option value="SCHEDULED_CHANGEOVER">Scheduled Production / Tooling Changeover in Progress</option>
                      <option value="OUT_OF_SCOPE">Equipment / Material Out of Designated Area Boundary</option>
                      <option value="INACCURATE_EVIDENCE">Inaccurate Evidence or Misinterpreted Visual Standard</option>
                      <option value="FORCE_MAJEURE">Utility Outage / Unscheduled Facility Maintenance</option>
                      <option value="OTHER">Other Operational Justification</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Detailed Counter-Justification & Factual Proof *</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    value={disputeNotes}
                    onChange={(e) => setDisputeNotes(e.target.value)}
                    placeholder="Provide detailed explanation of why the finding should be revoked or reassessed. Reference changeover work logs, standard operating authorizations, etc..."
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                  <Button variant="secondary" type="button" onClick={() => setActionView('view')}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    type="submit"
                    icon={<Send size={16} />}
                    loading={submittingAction}
                    style={{ background: 'var(--color-warning)', borderColor: 'var(--color-warning)' }}
                  >
                    Submit Formal Dispute
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* ========================================================= */}
          {/* ACTION FORM 3: DISPUTE RESOLUTION (LEAD AUDITOR) */}
          {/* ========================================================= */}
          {actionView === 'resolveDispute' && (
            <Card
              title="Dispute Resolution Ruling (5S Lead / Lead Auditor)"
              subtitle="Review Area Owner dispute submission and record final ruling on audit scores"
            >
              <form onSubmit={handleSubmitDisputeResolution} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '13px' }}>
                  <div><strong>Contested By:</strong> {execution.disputedByName || 'Area Owner'}</div>
                  <div><strong>Reason:</strong> {execution.disputeReason}</div>
                  <div style={{ marginTop: '4px' }}><strong>Owner Remarks:</strong> {execution.disputeNotes}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Ruling Decision *</label>
                    <select
                      className="form-control"
                      value={resolveDecision}
                      onChange={(e) => setResolveDecision(e.target.value as any)}
                      required
                    >
                      <option value="ACCEPT_DISPUTE">Accept Dispute & Adjust Score (Revoke Penalty)</option>
                      <option value="REJECT_DISPUTE">Reject Dispute & Uphold Audit Findings</option>
                    </select>
                  </div>

                  {resolveDecision === 'ACCEPT_DISPUTE' && (
                    <div className="form-group">
                      <label className="form-label">Adjusted 5S Overall Score (%)</label>
                      <input
                        type="number"
                        className="form-control"
                        min="0"
                        max="100"
                        value={adjustedScore}
                        onChange={(e) => setAdjustedScore(Number(e.target.value))}
                      />
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Lead Auditor Ruling Justification *</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={resolveNotes}
                    onChange={(e) => setResolveNotes(e.target.value)}
                    placeholder="Enter formal reasoning for accepting or upholding the findings..."
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <Button variant="secondary" type="button" onClick={() => setActionView('view')}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    type="submit"
                    icon={<CheckCircle2 size={16} />}
                    loading={submittingAction}
                  >
                    Finalize Dispute Ruling
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* ========================================================= */}
          {/* FORMAL AUDIT REPORT DOCUMENT BODY (PRINT-FRIENDLY) */}
          {/* ========================================================= */}
          <div
            id="printable-5s-report"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              padding: '24px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            {/* Header Document Strip */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                borderBottom: '2px solid var(--border-subtle)',
                paddingBottom: '18px',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {currentTenant?.name || 'SKILGLOBAL ENTERPRISE'} • 5S OPERATIONAL EXCELLENCE
                </div>
                <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 6px 0' }}>
                  5S Workplace Organization Audit Report
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  <span><strong>Audit Code:</strong> <code>{execution.auditCode}</code></span>
                  <span>•</span>
                  <span><strong>Type:</strong> {execution.auditType} Audit</span>
                  <span>•</span>
                  <span><strong>Template:</strong> {execution.template?.name || 'Standard 5S Template'}</span>
                </div>
              </div>

              {/* Score & Compliance Stamp */}
              <div
                style={{
                  textAlign: 'right',
                  padding: '12px 18px',
                  borderRadius: 'var(--radius-md)',
                  background: execution.isPassed ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                  border: `2px solid ${execution.isPassed ? '#10B981' : '#EF4444'}`,
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Overall 5S Score
                </div>
                <div style={{ fontSize: '32px', fontWeight: 900, color: execution.isPassed ? '#10B981' : '#EF4444', lineHeight: 1.1 }}>
                  {execution.overallScore}%
                </div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: execution.isPassed ? '#10B981' : '#EF4444', marginTop: '2px' }}>
                  {execution.isPassed ? 'COMPLIANT (PASS)' : 'NON-CONFORMANCE (FAIL)'}
                </div>
              </div>
            </div>

            {/* Location & Auditor Profile Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '18px' }}>
              <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} className="text-primary" /> Target Location Details
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Area Name:</span>
                  <strong>{execution.location?.name} ({execution.location?.areaCode})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Plant / Department:</span>
                  <strong>{execution.location?.orgNode?.name || 'Discrete Production'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Designated Area Owner:</span>
                  <strong>{execution.location?.owner ? `${execution.location.owner.firstName} ${execution.location.owner.lastName}` : 'Arun Patel'}</strong>
                </div>
              </div>

              <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} className="text-primary" /> Inspection Execution Metadata
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Lead Auditor:</span>
                  <strong>{execution.auditorName || (execution.auditor ? `${execution.auditor.firstName} ${execution.auditor.lastName}` : '5S Certified Auditor')}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Inspection Date:</span>
                  <strong>{new Date(execution.completedAt || execution.startedAt).toLocaleDateString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Critical Safety Violations:</span>
                  <strong style={{ color: execution.criticalFailureCount > 0 ? '#EF4444' : '#10B981' }}>
                    {execution.criticalFailureCount} Critical
                  </strong>
                </div>
              </div>
            </div>

            {/* Pillar Performance Radar Cards */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                5S Pillar Performance Breakdown
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                {[
                  { key: 'S1_SORT', label: '1S Sort', defaultScore: 90 },
                  { key: 'S2_SET_IN_ORDER', label: '2S Set in Order', defaultScore: 85 },
                  { key: 'S3_SHINE', label: '3S Shine', defaultScore: 95 },
                  { key: 'S4_STANDARDIZE', label: '4S Standardize', defaultScore: 80 },
                  { key: 'S5_SUSTAIN', label: '5S Sustain', defaultScore: 90 },
                ].map((pillar) => {
                  const score = execution.pillarScores ? (execution.pillarScores[pillar.key] ?? pillar.defaultScore) : pillar.defaultScore;
                  return (
                    <div
                      key={pillar.key}
                      style={{
                        padding: '12px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-surface-subtle)',
                        border: '1px solid var(--border-subtle)',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        {pillar.label}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: score >= 85 ? '#10B981' : score >= 70 ? '#F59E0B' : '#EF4444', margin: '4px 0' }}>
                        {score}%
                      </div>
                      <ProgressBar value={score} height={4} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Non-Conformances & Auto-Generated CAPAs */}
            {execution.observations && execution.observations.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={14} /> Recorded Non-Conformances & Auto-Created CAPAs ({execution.observations.length})
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {execution.observations.map((obs) => (
                    <div
                      key={obs.id}
                      style={{
                        padding: '14px',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(239, 68, 68, 0.04)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        display: 'grid',
                        gridTemplateColumns: '80px 1fr auto',
                        gap: '14px',
                        alignItems: 'center',
                      }}
                    >
                      {/* Photo Thumbnail */}
                      <div style={{ width: '80px', height: '65px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: '#000' }}>
                        {obs.beforePhotoUrl ? (
                          <ImageWithFallback
                            src={obs.beforePhotoUrl}
                            alt="Non-conformance evidence"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' }}>
                            <Camera size={18} />
                          </div>
                        )}
                      </div>

                      {/* Finding Details */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span className="code-tag">{obs.observationCode}</span>
                          <Badge variant={obs.severity === 'CRITICAL' ? 'danger' : 'warning'}>
                            {obs.severity}
                          </Badge>
                          <Badge variant="neutral">{obs.category}</Badge>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {obs.title}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {obs.description}
                        </div>
                      </div>

                      {/* SLA Commitment */}
                      <div style={{ textAlign: 'right', fontSize: '11.5px' }}>
                        <div style={{ color: 'var(--text-tertiary)' }}>Remediation SLA</div>
                        <strong style={{ color: obs.severity === 'CRITICAL' ? '#EF4444' : 'var(--color-primary)' }}>
                          {obs.severity === 'CRITICAL' ? '24 Hours' : obs.severity === 'MAJOR' ? '72 Hours' : '7 Days'}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* DUAL SIGNATURE CERTIFICATE BLOCK */}
            {/* ========================================================= */}
            <div
              style={{
                marginTop: '10px',
                padding: '20px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(to right, rgba(37, 99, 235, 0.04), rgba(5, 150, 105, 0.04))',
                border: '1px solid var(--border-subtle)',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '24px',
              }}
            >
              {/* Left Column: Auditor Sign-off */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderRight: '1px solid var(--border-subtle)', paddingRight: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={18} className="text-primary" />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                    1. Lead Auditor Sign-Off
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Audited & Evaluated by: <strong>{execution.auditorName || 'Certified 5S Auditor'}</strong>
                </div>

                {execution.auditorSignature ? (
                  <div style={{ height: '70px', background: '#FFFFFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={execution.auditorSignature} alt="Auditor Digital Signature" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                  </div>
                ) : (
                  <div style={{ height: '70px', background: '#FFFFFF', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    Digitally Verified on Submission
                  </div>
                )}

                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  Timestamp: {new Date(execution.completedAt || execution.startedAt).toLocaleString()}
                </div>
              </div>

              {/* Right Column: Area Owner Formal Acknowledgement */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Award size={18} style={{ color: execution.status === 'ACKNOWLEDGED' ? '#059669' : '#F59E0B' }} />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                    2. Area Owner Formal Acceptance
                  </span>
                </div>

                {execution.status === 'ACKNOWLEDGED' ? (
                  <>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Acknowledged by: <strong>{execution.acknowledgedByName || 'Designated Area Owner'}</strong>
                    </div>

                    {execution.acknowledgementSignature ? (
                      <div style={{ height: '70px', background: '#FFFFFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={execution.acknowledgementSignature} alt="Area Owner Digital Signature" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                      </div>
                    ) : (
                      <div style={{ height: '70px', background: '#FFFFFF', borderRadius: 'var(--radius-sm)', border: '1px solid #059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#059669', fontWeight: 700 }}>
                        Formal Acceptance Recorded ✓
                      </div>
                    )}

                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <strong>Commitment:</strong> {execution.acknowledgementNotes || 'Findings accepted and actions scheduled.'}
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      Signed on {new Date(execution.acknowledgedAt || Date.now()).toLocaleString()}
                      {execution.targetResolutionDate && (
                        <span> • Target Resolution: {new Date(execution.targetResolutionDate).toLocaleDateString()}</span>
                      )}
                    </div>
                  </>
                ) : execution.status === 'DISPUTED' ? (
                  <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#92400E', fontSize: '12px' }}>
                    <div><strong>Status:</strong> Formally Contested by {execution.disputedByName || 'Area Owner'}</div>
                    <div style={{ marginTop: '4px' }}><strong>Reason:</strong> {execution.disputeReason}</div>
                    <div style={{ marginTop: '4px' }}><strong>Justification:</strong> {execution.disputeNotes}</div>
                    {execution.disputeResolutionNotes && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #D97706', color: '#065F46' }}>
                        <strong>Lead Auditor Ruling:</strong> {execution.disputeResolutionNotes}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center', height: '100%' }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-warning)', fontWeight: 600 }}>
                      ⚠ Pending Area Owner Formal Sign-Off
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<CheckCircle2 size={14} />}
                      onClick={() => setActionView('acknowledge')}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      Acknowledge Findings Now
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* ========================================================= */}
            {/* FULL AUDIT CHECKLIST ANSWERS & GUIDANCE (ACCORDION) */}
            {/* ========================================================= */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Complete Detailed 5S Checklist Breakdown
              </div>

              {execution.templateVersion?.sections?.map((sec) => {
                const isExp = expandedSections[sec.id] !== false;
                const secAnswers = execution.answers?.filter((a) => a.sectionId === sec.id) || [];
                const secScore = secAnswers.reduce((acc, a) => acc + a.score, 0);
                const secMax = secAnswers.reduce((acc, a) => acc + a.maxScore, 0);
                const secPct = secMax > 0 ? Math.round((secScore / secMax) * 100) : 100;

                return (
                  <div
                    key={sec.id}
                    style={{
                      marginBottom: '10px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Section Accordion Header */}
                    <div
                      onClick={() => setExpandedSections((prev) => ({ ...prev, [sec.id]: !isExp }))}
                      style={{
                        padding: '12px 16px',
                        background: 'var(--bg-surface-subtle)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isExp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {sec.title}
                        </span>
                        <Badge variant="neutral">{sec.category}</Badge>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: secPct >= 85 ? '#10B981' : secPct >= 70 ? '#F59E0B' : '#EF4444' }}>
                          {secPct}% ({secScore} / {secMax} pts)
                        </span>
                      </div>
                    </div>

                    {/* Section Questions Table */}
                    {isExp && (
                      <div style={{ padding: '0', background: 'var(--bg-surface)' }}>
                        <table className="enterprise-table" style={{ margin: 0, fontSize: '12px' }}>
                          <thead>
                            <tr>
                              <th style={{ width: '80px' }}>Code</th>
                              <th>Question & Criteria</th>
                              <th style={{ width: '110px' }}>Result</th>
                              <th style={{ width: '90px' }}>Score</th>
                              <th>Notes & Evidence</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sec.questions?.map((q) => {
                              const ans = execution.answers?.find((a) => a.questionId === q.id);
                              const status = ans?.status || 'CONFORMING';
                              const score = ans?.score !== undefined ? ans.score : q.weightage * 5.0;
                              const evidence = ans?.evidenceUrls || [];

                              return (
                                <tr key={q.id}>
                                  <td>
                                    <span className="code-tag">{q.questionCode}</span>
                                  </td>
                                  <td>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                      {q.questionText}
                                    </div>
                                    {q.guidance && (
                                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                        {q.guidance}
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    <Badge
                                      variant={
                                        status === 'CONFORMING'
                                          ? 'success'
                                          : status === 'MINOR_NC'
                                          ? 'warning'
                                          : 'danger'
                                      }
                                    >
                                      {status}
                                    </Badge>
                                  </td>
                                  <td>
                                    <strong>{score}</strong> / {q.weightage * 5.0}
                                  </td>
                                  <td>
                                    {ans?.notes && (
                                      <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                        {ans.notes}
                                      </div>
                                    )}
                                    {evidence.length > 0 && (
                                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                        {evidence.map((ev: any, idx: number) => {
                                          const url = typeof ev === 'string' ? ev : ev.photoUrl;
                                          return (
                                            <div
                                              key={idx}
                                              style={{
                                                width: '36px',
                                                height: '36px',
                                                borderRadius: 'var(--radius-xs)',
                                                overflow: 'hidden',
                                                border: '1px solid var(--border-subtle)',
                                              }}
                                            >
                                              <ImageWithFallback
                                                src={url}
                                                alt="evidence"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
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
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

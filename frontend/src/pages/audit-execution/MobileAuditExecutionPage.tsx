import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../services/api';
import { auditExecutionApi, AnswerPayload, ScorePreview } from '../../services/auditExecutionApi';
import { auditsApi } from '../../services/api-audits';
import { AuditTypeCode, FindingSeverity } from '../../types/audits';
import { SCHEDULABLE_AUDIT_TYPES, auditTypeLabel } from '../templates/templateShared';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { RoleGroups } from '../../constants/roleGroups';
import { roleHomePath } from '../../constants/roles';
import { PILLARS, pillarLabel, scheduledAuditStatusLabel, severityLabel } from '../../constants/labels';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { LoadingState, ErrorState } from '../../components/ui/StateViews';
import { AccessDeniedPage } from '../../components/auth/AccessDeniedPage';
import { PhotoAnnotationModal, AnnotatedPhotoResult } from '../../components/common/PhotoAnnotationModal';
import { AuditReportModal } from '../../components/common/AuditReportModal';
import { SignaturePad, SignaturePadHandle } from '../../components/common/SignaturePad';
import { dataUrlToBlob } from '../../components/common/evidencePhoto';
import { AuditExecution, AuditTemplate, AuditTemplateQuestion, Location, ScheduledAuditInstance } from '../../types';
import {
  AnswerState,
  BINARY_LABELS,
  FINDING_SEVERITIES,
  defaultSeverity,
  effectiveSeverity,
  emptyAnswer,
  hasManualFinding,
  isFailed,
  evidenceKey,
  fromSaved,
  hasOptions,
  isAnswered,
  isBinaryType,
  isMissingPhoto,
  MAX_RATING,
  questionOptions,
  requiresPhoto,
  toPayload,
} from './auditAnswers';
import { Camera, Send, ChevronDown, ChevronRight, HelpCircle, FileCheck, MapPin, Clock, ShieldAlert, Check, X, ArrowLeft, Trash2, AlertTriangle, MessageSquare, Flag } from 'lucide-react';

const DRAFT_SAVE_DELAY_MS = 1500;
const PREVIEW_DELAY_MS = 600;

type SaveStatus = { state: 'idle' } | { state: 'saving' } | { state: 'saved'; at: number } | { state: 'error'; message: string };

const isAuditTypeCode = (value: string | null): value is AuditTypeCode => (SCHEDULABLE_AUDIT_TYPES as readonly string[]).includes(value ?? '');

const formatElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/**
 * Segmented answer button. A conforming / neutral choice is filled with the primary blue when selected;
 * a non-conforming choice gets a danger tint. The label always says what was chosen (never colour alone).
 */
const choiceStyle = (selected: boolean, disabled = false, tone: 'primary' | 'danger' = 'primary'): React.CSSProperties => ({
  minHeight: '48px',
  minWidth: '48px',
  padding: '10px 16px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid',
  borderColor: selected ? `var(--color-${tone})` : 'var(--border-strong)',
  background: selected ? (tone === 'danger' ? 'var(--color-danger-bg)' : 'var(--color-primary)') : 'var(--bg-surface)',
  color: selected ? (tone === 'danger' ? 'var(--color-danger)' : 'var(--text-on-primary)') : 'var(--text-primary)',
  boxShadow: selected && tone === 'danger' ? 'inset 0 0 0 1px var(--color-danger)' : 'none',
  fontWeight: 600,
  fontSize: '14px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  transition: 'background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast)',
});

/** Equal-width row of answer buttons that wraps on narrow screens. */
const segmentGrid = (columns: string): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: columns, gap: '8px' });

export const MobileAuditExecutionPage: React.FC = () => {
  const { instanceId } = useParams<{ instanceId?: string }>();
  const [searchParams] = useSearchParams();
  const locationParam = searchParams.get('locationId');
  const auditTypeParam = searchParams.get('auditType');
  const navigate = useNavigate();
  const { addToast, can, currentUser, activeUserRole } = useApp();
  const { formatDate, formatDateTime, formatNumber } = useI18n();
  // Area owners reach the runner for self-audits of their own areas; the server enforces the same rule
  const canConduct = can('SELF_AUDITORS');
  const selfAuditOnly = canConduct && !can('AUDIT_CONDUCTORS');

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [templates, setTemplates] = useState<AuditTemplate[]>([]);

  // Selected session setup if creating ad-hoc
  const [selectedLocationId, setSelectedLocationId] = useState<string>(locationParam || '');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  // Explicit audit type for an unscheduled audit; null follows the template's own type
  const [auditTypeChoice, setAuditTypeChoice] = useState<AuditTypeCode | null>(isAuditTypeCode(auditTypeParam) ? auditTypeParam : null);
  // Scheduled audit being executed (route /mobile-audit/:instanceId)
  const [scheduledInstance, setScheduledInstance] = useState<ScheduledAuditInstance | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);

  // Active execution
  const [execution, setExecution] = useState<AuditExecution | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [summaryNotes, setSummaryNotes] = useState<string>('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});

  // Photo capture for a question
  const [photoQuestionId, setPhotoQuestionId] = useState<string | null>(null);
  const [guidanceQuestion, setGuidanceQuestion] = useState<AuditTemplateQuestion | null>(null);

  // Server score preview
  const [preview, setPreview] = useState<ScorePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTick, setPreviewTick] = useState(0);
  const previewSeq = useRef(0);

  // Draft autosave
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: 'idle' });
  const [dirty, setDirty] = useState(false);
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const savingRef = useRef(false);
  const resaveRef = useRef(false);
  const hydratedRef = useRef(false);

  // Sign-off
  const [submitModalOpen, setSubmitModalOpen] = useState<boolean>(false);
  const [auditorName, setAuditorName] = useState<string>(currentUser?.fullName ?? '');
  const [hasSigned, setHasSigned] = useState<boolean>(false);
  const [signOffTried, setSignOffTried] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const signatureRef = useRef<SignaturePadHandle | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState<boolean>(false);

  const [now, setNow] = useState<number>(Date.now());

  const homePath = roleHomePath(activeUserRole || currentUser?.primaryRole);

  const loadPrerequisites = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [allLocations, tplRes, scheduled] = await Promise.all([
        api.getLocations(),
        api.getAuditTemplates({ status: 'ACTIVE' }),
        instanceId ? api.getScheduledAuditInstance(instanceId).catch(() => null) : Promise.resolve(null),
      ]);
      // An area owner without an audit role may only self-audit the areas they own or back up
      const userId = currentUser?.id;
      const locRes = selfAuditOnly ? allLocations.filter((l) => !!userId && (l.ownerId === userId || l.backupOwnerId === userId)) : allLocations;
      setLocations(locRes);
      setTemplates(tplRes);

      if (instanceId) {
        const instance: ScheduledAuditInstance | null = scheduled;
        setScheduledInstance(instance);
        if (instance) {
          // A scheduled audit always runs at its planned location with its scheduled template version
          setSelectedLocationId(instance.locationId);
          setSelectedTemplateId(instance.templateVersion?.template?.id || '');
        }
        return;
      }
      if (locationParam && locRes.some((l) => l.id === locationParam)) setSelectedLocationId(locationParam);
      else if (locRes.length > 0) setSelectedLocationId((prev) => prev || locRes[0].id);
      if (tplRes.length > 0) setSelectedTemplateId((prev) => prev || tplRes[0].id);
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Could not load locations and templates.'));
    } finally {
      setLoading(false);
    }
  }, [instanceId, locationParam, selfAuditOnly, currentUser?.id]);

  useEffect(() => {
    if (canConduct) loadPrerequisites();
  }, [canConduct, loadPrerequisites]);

  // Duration since the audit was started (survives resuming)
  useEffect(() => {
    if (!execution || submittedId) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [execution, submittedId]);

  const sections = useMemo(
    () => (execution?.templateVersion?.sections ?? []).filter((s) => (s.questions?.length ?? 0) > 0),
    [execution],
  );
  const questions = useMemo(() => sections.flatMap((s) => s.questions ?? []), [sections]);
  const questionById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const presentPillars = useMemo(() => PILLARS.filter((p) => sections.some((s) => s.category === p)), [sections]);

  const answerFor = useCallback((qId: string) => answers[qId] ?? emptyAnswer(), [answers]);

  const buildPayload = useCallback(
    (state: Record<string, AnswerState>): AnswerPayload[] =>
      questions.map((q) => toPayload(q, state[q.id] ?? emptyAnswer())).filter((p): p is NonNullable<ReturnType<typeof toPayload>> => p !== null),
    [questions],
  );

  // Latest values for the autosave callback
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const summaryRef = useRef(summaryNotes);
  summaryRef.current = summaryNotes;

  const saveDraftNow = useCallback(async (): Promise<boolean> => {
    if (!execution || submittedId) return true;
    if (savingRef.current) {
      resaveRef.current = true;
      return false;
    }
    const version = versionRef.current;
    if (version === savedVersionRef.current) return true;
    savingRef.current = true;
    setSaveStatus({ state: 'saving' });
    try {
      await auditExecutionApi.saveDraft(execution.id, { answers: buildPayload(answersRef.current), summaryNotes: summaryRef.current });
      savedVersionRef.current = version;
      setSaveStatus({ state: 'saved', at: Date.now() });
      if (versionRef.current === version) setDirty(false);
      return versionRef.current === version;
    } catch (err) {
      setSaveStatus({ state: 'error', message: getApiErrorMessage(err, 'Your answers could not be saved.') });
      return false;
    } finally {
      savingRef.current = false;
      // Changes made while this save was running are saved right after it
      if (resaveRef.current) {
        resaveRef.current = false;
        window.setTimeout(() => saveDraftRef.current(), 0);
      }
    }
  }, [execution, submittedId, buildPayload]);
  const saveDraftRef = useRef(saveDraftNow);
  saveDraftRef.current = saveDraftNow;

  // Every change marks the draft dirty; it is saved shortly after the auditor stops changing it
  useEffect(() => {
    if (!execution) return;
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    versionRef.current += 1;
    setDirty(true);
    const timer = setTimeout(() => {
      saveDraftNow();
    }, DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, summaryNotes]);

  // Live score from the server (same rule as submission)
  useEffect(() => {
    if (!execution || submittedId) return;
    const seq = ++previewSeq.current;
    const timer = setTimeout(async () => {
      try {
        const result = await auditExecutionApi.previewScore(execution.id, buildPayload(answersRef.current));
        if (seq !== previewSeq.current) return;
        setPreview(result);
        setPreviewError(null);
      } catch (err) {
        if (seq !== previewSeq.current) return;
        setPreviewError(getApiErrorMessage(err, 'The live score could not be calculated.'));
      }
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [execution, answers, previewTick, submittedId, buildPayload]);

  // Warn before closing the tab with unsaved answers
  useEffect(() => {
    if (!dirty || submittedId) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, submittedId]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  // Area owners only self-audit; otherwise the chosen type, else the template's own type
  const unscheduledAuditType: AuditTypeCode = selfAuditOnly ? 'SELF' : auditTypeChoice ?? selectedTemplate?.auditType ?? 'ROUTINE';

  const handleStartAudit = async () => {
    if (!selectedLocationId || !selectedTemplateId) return;
    setIsStarting(true);
    try {
      const exec = await auditsApi.startAudit({
        locationId: selectedLocationId,
        templateId: selectedTemplateId,
        templateVersionId: scheduledInstance?.templateVersionId,
        auditInstanceId: scheduledInstance?.id,
        // A scheduled audit keeps its planned type (the server enforces it)
        auditType: scheduledInstance ? scheduledInstance.auditType : unscheduledAuditType,
        auditorName: currentUser?.fullName,
      });

      // Resume: rebuild answers saved earlier; everything else starts unanswered
      const restored: Record<string, AnswerState> = {};
      for (const sec of exec.templateVersion?.sections ?? []) {
        for (const q of sec.questions ?? []) {
          const saved = exec.answers?.find((a) => a.questionId === q.id);
          if (saved) restored[q.id] = fromSaved(q, saved);
        }
      }
      hydratedRef.current = false;
      versionRef.current = 0;
      savedVersionRef.current = 0;
      setAnswers(restored);
      setSummaryNotes(exec.summaryNotes ?? '');
      setCollapsedSections({});
      setExecution(exec);
      setNow(Date.now());
    } catch (err) {
      addToast({ type: 'error', title: 'Could not start the audit', message: getApiErrorMessage(err, 'The audit could not be started.') });
    } finally {
      setIsStarting(false);
    }
  };

  const updateAnswer = (q: AuditTemplateQuestion, patch: Partial<AnswerState>) => {
    setAnswers((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] ?? emptyAnswer()), ...patch } }));
  };

  const handlePhotoSaved = async (questionId: string, result: AnnotatedPhotoResult) => {
    const key = evidenceKey();
    const placeholder = { key, photoUrl: '', previewUrl: result.annotatedDataUrl, uploading: true };
    setAnswers((prev) => {
      const current = prev[questionId] ?? emptyAnswer();
      return { ...prev, [questionId]: { ...current, evidence: [...current.evidence, placeholder] } };
    });
    try {
      const original = await auditExecutionApi.uploadFile(dataUrlToBlob(result.originalDataUrl), 'evidence.jpg');
      const annotated = result.annotations.length
        ? await auditExecutionApi.uploadFile(dataUrlToBlob(result.annotatedDataUrl), 'evidence-annotated.jpg')
        : null;
      setAnswers((prev) => {
        const current = prev[questionId] ?? emptyAnswer();
        return {
          ...prev,
          [questionId]: {
            ...current,
            evidence: current.evidence.map((e) =>
              e.key === key
                ? {
                    key,
                    photoUrl: original.url,
                    annotatedPhotoUrl: annotated?.url,
                    annotations: annotated ? result.annotations : undefined,
                  }
                : e,
            ),
          },
        };
      });
    } catch (err) {
      setAnswers((prev) => {
        const current = prev[questionId] ?? emptyAnswer();
        return { ...prev, [questionId]: { ...current, evidence: current.evidence.filter((e) => e.key !== key) } };
      });
      addToast({ type: 'error', title: 'Photo not attached', message: getApiErrorMessage(err, 'The photo could not be uploaded. Try again.') });
    }
  };

  const removeEvidence = (q: AuditTemplateQuestion, key: string) => {
    updateAnswer(q, { evidence: answerFor(q.id).evidence.filter((e) => e.key !== key) });
  };

  // Completeness (the server enforces the same rules on submission)
  const requiredQuestions = questions.filter((q) => q.questionType !== 'NOT_APPLICABLE');
  const unanswered = requiredQuestions.filter((q) => !isAnswered(q, answerFor(q.id)));
  const missingPhotos = requiredQuestions.filter((q) => isAnswered(q, answerFor(q.id)) && isMissingPhoto(q, answerFor(q.id)));
  const uploadsPending = Object.values(answers).some((a) => a.evidence.some((e) => e.uploading));
  const answeredCount = requiredQuestions.length - unanswered.length;
  const checklistComplete = unanswered.length === 0 && missingPhotos.length === 0 && !uploadsPending;
  const findingIds = useMemo(() => new Map((preview?.findings ?? []).map((f) => [f.questionId, f.severity])), [preview]);

  const jumpToQuestion = (q: AuditTemplateQuestion) => {
    setSubmitModalOpen(false);
    setCollapsedSections((prev) => ({ ...prev, [q.sectionId]: false }));
    window.setTimeout(() => {
      const el = document.getElementById(`question-${q.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
    }, 50);
  };

  const leaveAudit = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(homePath);
  };

  const handleExit = async () => {
    if (dirty) {
      const saved = await saveDraftNow();
      // Unsaved answers: ask first; leaving happens only when the auditor confirms
      if (!saved) {
        setLeaveConfirmOpen(true);
        return;
      }
    }
    leaveAudit();
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignOffTried(true);
    if (!execution || !checklistComplete || !hasSigned || !auditorName.trim()) return;
    const signature = signatureRef.current?.toDataURL();
    if (!signature) {
      setHasSigned(false);
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await auditExecutionApi.submit(execution.id, {
        answers: buildPayload(answers),
        summaryNotes: summaryNotes.trim() || undefined,
        auditorSignature: signature,
        auditorName: auditorName.trim(),
      });
      setDirty(false);
      setSubmitModalOpen(false);
      setSubmittedId(res.id);
      const findings = res.observations?.length ?? 0;
      addToast({
        type: 'success',
        title: 'Audit submitted',
        message: `Score ${formatNumber(res.overallScore)}%. ${findings === 1 ? '1 finding' : `${findings} findings`} sent to the area owner for sign-off.`,
      });
    } catch (err) {
      addToast({ type: 'error', title: 'Audit not submitted', message: getApiErrorMessage(err, 'The audit could not be submitted.') });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canConduct) {
    return <AccessDeniedPage resourceName="audit execution" allowedRoles={[...RoleGroups.SELF_AUDITORS]} />;
  }

  if (loading) return <LoadingState label="Loading audit…" />;
  if (loadError) return <ErrorState message={loadError} onRetry={loadPrerequisites} />;

  if (!execution) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '720px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <PageHeader
          title={scheduledInstance ? 'Start scheduled audit' : selfAuditOnly ? 'Start self-audit' : 'Start unscheduled audit'}
          description={
            selfAuditOnly
              ? 'Assess your own area against the checklist. The result goes to your department head for sign-off.'
              : 'Check the scope, then start when you are at the area.'
          }
          actions={
            <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>
              Back
            </Button>
          }
        />
        <Card title="Audit scope">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {scheduledInstance ? (
              <dl className="keep-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px', fontSize: '14px', margin: 0 }}>
                {[
                  ['Audit code', scheduledInstance.auditCode],
                  ['Status', scheduledAuditStatusLabel(scheduledInstance.status)],
                  ['Location', scheduledInstance.location?.name || locations.find((l) => l.id === selectedLocationId)?.name || '—'],
                  ['Template', scheduledInstance.templateVersion?.template?.name || '—'],
                  ['Audit type', auditTypeLabel(scheduledInstance.auditType)],
                  ['Planned', formatDate(scheduledInstance.plannedDate)],
                  ['Due', formatDate(scheduledInstance.dueDate)],
                ].map(([label, value]) => (
                  <div key={label} style={{ minWidth: 0 }}>
                    <dt style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '2px' }}>{label}</dt>
                    <dd style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : instanceId ? (
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>This scheduled audit does not exist or is no longer available to you.</p>
            ) : (
              <>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="auditLocation">Location</label>
                  <select id="auditLocation" className="form-select" value={selectedLocationId} onChange={(e) => setSelectedLocationId(e.target.value)}>
                    {locations.length === 0 && <option value="">No locations available</option>}
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.areaCode} — {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                {selfAuditOnly && locations.length === 0 && (
                  <p role="status" style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                    No areas are assigned to you, so there is nothing to self-audit yet.
                  </p>
                )}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="auditTemplate">Audit template</label>
                  <select id="auditTemplate" className="form-select" value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} aria-describedby="auditTemplate-hint">
                    {templates.length === 0 && <option value="">No active templates</option>}
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} — {t.name}
                      </option>
                    ))}
                  </select>
                  <div id="auditTemplate-hint" className="form-hint">Only templates with a published version are listed.</div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="auditType">Audit type</label>
                  <select
                    id="auditType"
                    className="form-select"
                    value={unscheduledAuditType}
                    disabled={selfAuditOnly}
                    onChange={(e) => {
                      if (isAuditTypeCode(e.target.value)) setAuditTypeChoice(e.target.value);
                    }}
                    aria-describedby="auditType-hint"
                  >
                    {SCHEDULABLE_AUDIT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {auditTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                  <div id="auditType-hint" className="form-hint">
                    {selfAuditOnly
                      ? 'As area owner you can run self-audits of your own areas.'
                      : unscheduledAuditType === 'SURPRISE'
                        ? 'Unannounced: the area is not told in advance.'
                        : 'Defaults to the template’s audit type.'}
                  </div>
                </div>
              </>
            )}
            <Button
              variant="primary"
              size="lg"
              onClick={handleStartAudit}
              loading={isStarting}
              disabled={isStarting || !selectedLocationId || !selectedTemplateId || (!!instanceId && !scheduledInstance)}
            >
              Start audit
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const overall = preview?.overallScore ?? null;
  const passScore = preview?.passScore;
  const scoreTone = overall === null || passScore === undefined ? 'neutral' : preview?.isPassed ? 'success' : 'danger';
  const findingCount = preview?.findings.length ?? 0;
  const versionLabel = execution.templateVersion?.versionNumber;
  const answeredPct = requiredQuestions.length ? (answeredCount / requiredQuestions.length) * 100 : 0;
  const scoreColor = scoreTone === 'success' ? 'var(--color-success)' : scoreTone === 'danger' ? 'var(--color-danger)' : 'var(--text-primary)';
  const passLabel = preview?.isPassed ? 'Passing' : preview && preview.criticalFailureCount > 0 ? 'Fails: critical question' : 'Below pass mark';

  const renderSaveStatus = () => {
    switch (saveStatus.state) {
      case 'saving':
        return <span>Saving…</span>;
      case 'saved':
        return dirty ? <span>Unsaved changes</span> : <span>Saved {formatDateTime(saveStatus.at, { hour: '2-digit', minute: '2-digit' })}</span>;
      case 'error':
        return (
          <span style={{ color: 'var(--color-danger)', display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            Not saved
            <button
              type="button"
              onClick={() => saveDraftNow()}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer', minHeight: '32px' }}
            >
              Retry
            </button>
          </span>
        );
      default:
        return dirty ? <span>Unsaved changes</span> : <span>Draft</span>;
    }
  };

  const renderResponse = (q: AuditTemplateQuestion, a: AnswerState) => {
    const disabled = a.na;
    if (q.questionType === 'NOT_APPLICABLE') {
      return <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>Information only — not scored.</p>;
    }
    if (isBinaryType(q.questionType)) {
      const labels = BINARY_LABELS[q.questionType];
      return (
        <div role="group" aria-label="Answer" style={segmentGrid('repeat(2, minmax(0, 1fr))')}>
          <button type="button" disabled={disabled} aria-pressed={a.value === 'PASS'} onClick={() => updateAnswer(q, { value: 'PASS' })} style={choiceStyle(a.value === 'PASS' && !a.na, disabled)}>
            <Check size={18} aria-hidden="true" /> {labels.pass}
          </button>
          <button type="button" disabled={disabled} aria-pressed={a.value === 'FAIL'} onClick={() => updateAnswer(q, { value: 'FAIL' })} style={choiceStyle(a.value === 'FAIL' && !a.na, disabled, 'danger')}>
            <X size={18} aria-hidden="true" /> {labels.fail}
          </button>
        </div>
      );
    }
    if (q.questionType === 'TEXT') {
      return (
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor={`response-${q.id}`}>
            Response <span className="required" aria-hidden="true">*</span>
          </label>
          <textarea
            id={`response-${q.id}`}
            className="form-textarea"
            rows={3}
            disabled={disabled}
            value={a.notes}
            onChange={(e) => updateAnswer(q, { notes: e.target.value })}
            placeholder="Write what you observed"
          />
        </div>
      );
    }
    if (q.questionType === 'PERCENTAGE') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div role="group" aria-label="Quick values" style={segmentGrid('repeat(5, minmax(0, 1fr))')}>
            {[0, 25, 50, 75, 100].map((v) => (
              <button key={v} type="button" disabled={disabled} aria-pressed={a.value === v} onClick={() => updateAnswer(q, { value: v })} style={choiceStyle(a.value === v && !a.na, disabled)}>
                {v}%
              </button>
            ))}
          </div>
          <label htmlFor={`pct-${q.id}`} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            Exact value
            <input
              id={`pct-${q.id}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              className="form-input"
              disabled={disabled}
              style={{ width: '96px', minHeight: '44px' }}
              value={typeof a.value === 'number' ? a.value : ''}
              onChange={(e) => {
                const raw = e.target.value;
                updateAnswer(q, { value: raw === '' ? null : Math.min(100, Math.max(0, Number(raw))) });
              }}
            />
            %
          </label>
        </div>
      );
    }
    if (q.questionType === 'MULTIPLE_CHOICE' && hasOptions(q)) {
      return (
        <div role="group" aria-label="Answer" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {questionOptions(q).map((opt, idx) => (
            <button
              key={`${opt.label}-${idx}`}
              type="button"
              disabled={disabled}
              aria-pressed={a.value === idx}
              onClick={() => updateAnswer(q, { value: idx })}
              style={{ ...choiceStyle(a.value === idx && !a.na, disabled), justifyContent: 'flex-start', textAlign: 'left' }}
            >
              {a.value === idx && !a.na && <Check size={16} aria-hidden="true" />}
              {opt.label}
            </button>
          ))}
        </div>
      );
    }
    const max = q.questionType === 'NUMERIC_0_10' ? 10 : MAX_RATING;
    return (
      <div role="group" aria-label={`Rating from 0 to ${max}`} style={segmentGrid('repeat(auto-fill, minmax(48px, 1fr))')}>
        {Array.from({ length: max + 1 }, (_, v) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            aria-pressed={a.value === v}
            aria-label={`${v} of ${max}`}
            onClick={() => updateAnswer(q, { value: v })}
            style={choiceStyle(a.value === v && !a.na, disabled)}
          >
            {v}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '960px', margin: '0 auto', width: '100%' }}>
      <PageHeader
        eyebrow={execution.auditCode}
        title={execution.location?.name || 'Audit'}
        meta={
          execution.location?.areaCode ? (
            <Badge variant="neutral" icon={<MapPin size={12} aria-hidden="true" />}>
              {execution.location.areaCode}
            </Badge>
          ) : undefined
        }
        description={`${execution.template?.name || '—'}${versionLabel ? ` · v${versionLabel}` : ''}`}
        actions={
          <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={handleExit}>
            Exit
          </Button>
        }
      />

      {/* Progress and live score (server-calculated) */}
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px 16px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>
                  {answeredCount} of {requiredQuestions.length}
                </strong>{' '}
                answered
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} aria-hidden="true" /> Duration{' '}
                  <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatElapsed(now - Date.parse(execution.startedAt))}</strong>
                </span>
                <span aria-live="polite">{renderSaveStatus()}</span>
              </span>
            </div>
            <ProgressBar value={answeredPct} height={8} color="primary" ariaLabel="Questions answered" />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Live score</div>
              <div aria-live="polite" style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1.15, color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>
                {overall === null ? '—' : `${formatNumber(overall)}%`}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              {overall !== null && passScore !== undefined && <Badge variant={preview?.isPassed ? 'success' : 'danger'}>{passLabel}</Badge>}
              {passScore !== undefined && <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Pass mark {formatNumber(passScore)}%</span>}
              {findingCount > 0 && (
                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{findingCount === 1 ? '1 finding' : `${findingCount} findings`} on submission</span>
              )}
            </div>
          </div>

          {preview?.capApplied != null && (
            <div
              role="status"
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-danger-bg)',
                border: '1px solid var(--color-danger-border)',
                color: 'var(--color-danger)',
                fontSize: '13px',
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
              }}
            >
              <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
              <span>
                {preview.criticalFailureCount === 1 ? '1 critical question failed' : `${preview.criticalFailureCount} critical questions failed`}: the score is capped at{' '}
                {formatNumber(preview.capApplied)}% and the audit cannot pass.
              </span>
            </div>
          )}

          {previewError && (
            <div role="alert" style={{ fontSize: '13px', color: 'var(--color-danger)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {previewError}
              <Button variant="secondary" size="sm" onClick={() => setPreviewTick((t) => t + 1)}>
                Retry
              </Button>
            </div>
          )}

          {presentPillars.length > 0 && (
            <div className="grid-auto" style={{ ['--min' as string]: '128px', gap: '12px 16px' } as React.CSSProperties}>
              {presentPillars.map((p) => {
                const score = preview?.pillarScores[p];
                return (
                  <div key={p} style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', gap: '8px' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{pillarLabel(p)}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{score === undefined ? '—' : `${formatNumber(score)}%`}</span>
                    </div>
                    <ProgressBar
                      value={score ?? 0}
                      height={6}
                      color={score === undefined || passScore === undefined ? 'primary' : score >= passScore ? 'success' : 'danger'}
                      ariaLabel={`${pillarLabel(p)} score`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Checklist */}
      {sections.map((section, sIdx) => {
        const collapsed = collapsedSections[section.id] === true;
        const sectionQuestions = section.questions ?? [];
        const sectionAnswered = sectionQuestions.filter((q) => q.questionType === 'NOT_APPLICABLE' || isAnswered(q, answerFor(q.id))).length;
        return (
          <section key={section.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2 style={{ margin: 0 }}>
              <button
                type="button"
                aria-expanded={!collapsed}
                aria-controls={`section-${section.id}`}
                onClick={() => setCollapsedSections((prev) => ({ ...prev, [section.id]: !collapsed }))}
                style={{
                  width: '100%',
                  padding: '8px 4px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--text-primary)',
                  minHeight: '48px',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: '32px',
                      height: '32px',
                      flexShrink: 0,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-primary-light)',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '14px',
                    }}
                  >
                    {sIdx + 1}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '17px', fontWeight: 600, overflowWrap: 'anywhere' }}>{section.title}</span>
                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 400, color: 'var(--text-secondary)' }}>
                      {pillarLabel(section.category)} · {sectionAnswered} of {sectionQuestions.length} answered
                    </span>
                  </span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', flexShrink: 0 }}>
                  {collapsed ? 'Show' : 'Hide'}
                  {collapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
                </span>
              </button>
            </h2>

            {!collapsed && (
              <div id={`section-${section.id}`} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {section.description && <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>{section.description}</p>}
                {sectionQuestions.map((q) => {
                  const a = answerFor(q.id);
                  const answered = isAnswered(q, a);
                  const finding = findingIds.get(q.id);
                  const photoMissing = answered && isMissingPhoto(q, a);
                  const scored = q.questionType !== 'NOT_APPLICABLE';
                  const failed = isFailed(q, a);
                  // A finding the auditor records here, or one the server will raise because the score is below the threshold
                  const isFinding = scored && !a.na && (hasManualFinding(q, a) || !!finding);
                  const showNotes = q.questionType !== 'TEXT' && (openNotes[q.id] || !!a.notes || isFinding);
                  const severity = effectiveSeverity(q, a);
                  return (
                    <div key={q.id} id={`question-${q.id}`} tabIndex={-1} style={{ outline: 'none', scrollMarginBottom: '120px' }}>
                      <Card style={finding ? { borderColor: 'var(--color-danger-border)' } : undefined}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                <span className="code-tag">{q.questionCode}</span>
                                {q.isCritical && (
                                  <Badge variant="danger" icon={<ShieldAlert size={12} aria-hidden="true" />}>
                                    Critical
                                  </Badge>
                                )}
                                {requiresPhoto(q) && scored && <Badge variant={photoMissing ? 'warning' : 'neutral'}>Photo required</Badge>}
                                {!answered && scored && <Badge variant="neutral">Not answered</Badge>}
                                {a.na && <Badge variant="neutral">Not applicable</Badge>}
                                {finding && <Badge variant="danger">Finding · {severityLabel(finding)}</Badge>}
                              </div>
                              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{q.questionText}</div>
                            </div>
                            {(q.guidance || q.standard || q.description || q.referencePhotoUrl) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<HelpCircle size={16} />}
                                onClick={() => setGuidanceQuestion(q)}
                                aria-label={`Guidance for ${q.questionCode}`}
                                style={{ minHeight: '40px', flexShrink: 0 }}
                              >
                                Guide
                              </Button>
                            )}
                          </div>

                          {renderResponse(q, a)}

                          {scored && (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              {!a.na && (
                                <Button
                                  variant={requiresPhoto(q) && photoMissing ? 'primary' : 'secondary'}
                                  icon={<Camera size={16} />}
                                  onClick={() => setPhotoQuestionId(q.id)}
                                  style={{ minHeight: '44px' }}
                                >
                                  Add photo
                                </Button>
                              )}
                              {!showNotes && q.questionType !== 'TEXT' && (
                                <Button variant="ghost" icon={<MessageSquare size={16} />} onClick={() => setOpenNotes((prev) => ({ ...prev, [q.id]: true }))} style={{ minHeight: '44px' }}>
                                  Add note
                                </Button>
                              )}
                              {/* A manual finding can be withdrawn; a threshold finding cannot */}
                              {answered && !a.na && !failed && (a.raiseFinding || !finding) && (
                                <Button
                                  variant="ghost"
                                  icon={<Flag size={16} />}
                                  aria-pressed={a.raiseFinding}
                                  onClick={() => updateAnswer(q, { raiseFinding: !a.raiseFinding })}
                                  style={{ minHeight: '44px' }}
                                >
                                  {a.raiseFinding ? 'Remove finding' : 'Raise finding'}
                                </Button>
                              )}
                              <button
                                type="button"
                                className="pillar-tab-pill"
                                aria-pressed={a.na}
                                onClick={() => updateAnswer(q, { na: !a.na })}
                                style={{ minHeight: '44px', marginLeft: 'auto' }}
                              >
                                {a.na && <Check size={14} aria-hidden="true" />}
                                Not applicable
                              </button>
                            </div>
                          )}

                          {a.evidence.length > 0 && (
                            <ul aria-label={`Photos for ${q.questionCode}`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: '12px', overflowX: 'auto' }}>
                              {a.evidence.map((ev, idx) => (
                                <li key={ev.key} style={{ position: 'relative', width: '112px', flexShrink: 0 }}>
                                  <div
                                    style={{
                                      width: '112px',
                                      height: '84px',
                                      borderRadius: 'var(--radius-md)',
                                      overflow: 'hidden',
                                      border: '1px solid var(--border-subtle)',
                                      opacity: ev.uploading ? 0.6 : 1,
                                    }}
                                  >
                                    <ImageWithFallback
                                      src={ev.annotatedPhotoUrl || ev.photoUrl || ev.previewUrl}
                                      alt={`Photo ${idx + 1} for ${q.questionCode}${ev.annotatedPhotoUrl ? ' (annotated)' : ''}`}
                                      height="84px"
                                      allowZoom={!ev.uploading}
                                    />
                                  </div>
                                  {ev.uploading ? (
                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Uploading…</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => removeEvidence(q, ev.key)}
                                      aria-label={`Remove photo ${idx + 1} for ${q.questionCode}`}
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
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        zIndex: 3,
                                      }}
                                    >
                                      <Trash2 size={14} aria-hidden="true" />
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}

                          {photoMissing && (
                            <div style={{ fontSize: '13px', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <AlertTriangle size={14} aria-hidden="true" /> Add at least one photo for this question.
                            </div>
                          )}

                          {isFinding && (
                            <div
                              role="group"
                              aria-labelledby={`finding-title-${q.id}`}
                              style={{
                                padding: '12px 14px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--color-danger-bg)',
                                border: '1px solid var(--color-danger-border)',
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'flex-end',
                                gap: '8px 16px',
                              }}
                            >
                              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                                <div id={`finding-title-${q.id}`} style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Flag size={14} aria-hidden="true" /> Finding
                                </div>
                                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.45 }}>
                                  {failed
                                    ? 'Recorded because the answer scored zero.'
                                    : a.raiseFinding
                                      ? 'Recorded by you.'
                                      : 'Recorded because the score is below the finding threshold.'}{' '}
                                  An observation and a corrective action are created when you submit. Describe the problem and add a photo below.
                                </div>
                              </div>
                              <div className="form-group" style={{ margin: 0, flex: '0 1 200px' }}>
                                <label className="form-label" htmlFor={`severity-${q.id}`}>
                                  Severity
                                </label>
                                <select
                                  id={`severity-${q.id}`}
                                  className="form-select"
                                  value={severity}
                                  onChange={(e) => {
                                    const value = FINDING_SEVERITIES.find((s) => s === e.target.value);
                                    if (value) updateAnswer(q, { findingSeverity: value === defaultSeverity(q) ? null : value });
                                  }}
                                >
                                  {FINDING_SEVERITIES.map((s: FindingSeverity) => (
                                    <option key={s} value={s}>
                                      {severityLabel(s)}
                                      {s === defaultSeverity(q) ? ' (default)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )}

                          {showNotes && (
                            <div className="form-group" style={{ margin: 0 }}>
                              <label className="form-label" htmlFor={`notes-${q.id}`}>
                                {isFinding ? 'Describe the problem (used as the finding description)' : 'Notes'}
                              </label>
                              <textarea
                                id={`notes-${q.id}`}
                                className="form-textarea"
                                rows={2}
                                value={a.notes}
                                onChange={(e) => updateAnswer(q, { notes: e.target.value })}
                                placeholder="What did you see, and where?"
                              />
                            </div>
                          )}
                        </div>
                      </Card>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <Card title="Summary">
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="auditSummaryNotes">
            Overall remarks (optional)
          </label>
          <textarea
            id="auditSummaryNotes"
            rows={3}
            className="form-textarea"
            placeholder="General condition of the area, good practices seen, anything the area owner should know"
            value={summaryNotes}
            onChange={(e) => setSummaryNotes(e.target.value)}
          />
        </div>
      </Card>

      {/* Bottom action bar: sticky inside the content column, so it never sits under the sidebar */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 20,
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px)) 16px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Score</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '18px', color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>{overall === null ? '—' : `${formatNumber(overall)}%`}</strong>
              {overall !== null && passScore !== undefined && <Badge variant={preview?.isPassed ? 'success' : 'danger'}>{preview?.isPassed ? 'Pass' : 'Fail'}</Badge>}
            </div>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', minWidth: 0 }}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>
                {answeredCount} of {requiredQuestions.length}
              </strong>{' '}
              answered
            </div>
            <div style={{ fontSize: '12.5px' }}>{renderSaveStatus()}</div>
          </div>
        </div>
        <Button
          variant="primary"
          size="lg"
          icon={<Send size={16} />}
          onClick={() => {
            setSignOffTried(false);
            setHasSigned(false);
            setSubmitModalOpen(true);
          }}
          style={{ flex: '1 1 200px', maxWidth: '320px' }}
        >
          Sign and submit
        </Button>
      </div>

      <PhotoAnnotationModal
        isOpen={photoQuestionId !== null}
        onClose={() => setPhotoQuestionId(null)}
        title={photoQuestionId ? `Photo for ${questionById.get(photoQuestionId)?.questionCode ?? 'question'}` : 'Photo'}
        onSave={(_dataUrl, _shapes, result) => {
          if (photoQuestionId) handlePhotoSaved(photoQuestionId, result);
        }}
      />

      {guidanceQuestion && (
        <Modal isOpen onClose={() => setGuidanceQuestion(null)} title={`Guidance: ${guidanceQuestion.questionCode}`} maxWidth="640px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 6px 0' }}>{guidanceQuestion.questionText}</h3>
              {guidanceQuestion.description && <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>{guidanceQuestion.description}</p>}
            </div>
            {guidanceQuestion.guidance && (
              <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-pale)', border: '1px solid var(--color-info-border)', fontSize: '13px', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>How to assess</div>
                {guidanceQuestion.guidance}
              </div>
            )}
            {guidanceQuestion.referencePhotoUrl && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Reference photo (the standard)</div>
                <ImageWithFallback src={guidanceQuestion.referencePhotoUrl} alt={`Reference standard for ${guidanceQuestion.questionCode}`} height="220px" allowZoom />
              </div>
            )}
            {guidanceQuestion.standard && (
              <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '13px' }}>
                <FileCheck size={14} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Standard: {guidanceQuestion.standard.title} ({guidanceQuestion.standard.code})
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Sign-off */}
      <Modal
        isOpen={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        title="Sign off and submit"
        subtitle={execution.location?.name}
        maxWidth="620px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
            <Button variant="secondary" onClick={() => setSubmitModalOpen(false)}>
              Back to checklist
            </Button>
            <Button variant="primary" type="submit" form="audit-signoff-form" icon={<FileCheck size={16} />} loading={isSubmitting} disabled={isSubmitting || !checklistComplete}>
              Sign and submit
            </Button>
          </div>
        }
      >
        <form id="audit-signoff-form" onSubmit={handleFinalSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-pale)',
              border: '1px solid var(--color-info-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Score</div>
              <div style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1.15, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {overall === null ? '—' : `${formatNumber(overall)}%`}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {findingCount === 1 ? '1 finding' : `${findingCount} findings`} will be sent to the area owner
              </div>
            </div>
            {overall !== null && preview && <Badge variant={preview.isPassed ? 'success' : 'danger'}>{preview.isPassed ? 'Pass' : 'Fail'}</Badge>}
          </div>

          {preview?.capApplied != null && (
            <div role="status" style={{ fontSize: '13px', color: 'var(--color-danger)' }}>
              A critical question failed: the score is capped at {formatNumber(preview.capApplied)}%.
            </div>
          )}

          {!checklistComplete && (
            <div
              role="alert"
              style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', fontSize: '13px' }}
            >
              <strong>Finish the checklist before submitting.</strong>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {uploadsPending && <li>Photos are still uploading.</li>}
                {[...unanswered.map((q) => ({ q, problem: 'not answered' })), ...missingPhotos.map((q) => ({ q, problem: 'needs a photo' }))].slice(0, 8).map(({ q, problem }) => (
                  <li key={`${q.id}-${problem}`}>
                    <button
                      type="button"
                      onClick={() => jumpToQuestion(q)}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer', textAlign: 'left', textDecoration: 'underline' }}
                    >
                      {q.questionCode}
                    </button>{' '}
                    {problem}
                  </li>
                ))}
                {unanswered.length + missingPhotos.length > 8 && <li>and {unanswered.length + missingPhotos.length - 8} more</li>}
              </ul>
            </div>
          )}

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="auditorName">
              Auditor name <span className="required" aria-hidden="true">*</span>
            </label>
            <input
              id="auditorName"
              type="text"
              className="form-input"
              value={auditorName}
              onChange={(e) => setAuditorName(e.target.value)}
              aria-invalid={signOffTried && !auditorName.trim()}
              aria-describedby={signOffTried && !auditorName.trim() ? 'auditorName-error' : undefined}
              autoComplete="name"
              required
            />
            {signOffTried && !auditorName.trim() && (
              <div id="auditorName-error" role="alert" className="form-error">
                Enter your name.
              </div>
            )}
          </div>

          {submitModalOpen && (
            <SignaturePad ref={signatureRef} label="Auditor signature" onChange={setHasSigned} error={signOffTried && !hasSigned ? 'Sign in the box to submit.' : null} />
          )}
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={leaveConfirmOpen}
        title="Leave the audit?"
        message="Some answers are not saved yet. Leave the audit anyway?"
        confirmLabel="Leave audit"
        cancelLabel="Stay"
        tone="danger"
        onConfirm={() => {
          setLeaveConfirmOpen(false);
          leaveAudit();
        }}
        onCancel={() => setLeaveConfirmOpen(false)}
      />

      <AuditReportModal isOpen={submittedId !== null} executionId={submittedId} onClose={() => navigate(homePath)} />
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { PhotoAnnotationModal } from '../../components/common/PhotoAnnotationModal';
import { FIVE_S_IMAGES } from '../../constants/images';
import {
  AuditExecution,
  AuditTemplate,
  AuditTemplateSection,
  AuditTemplateQuestion,
  Location,
  PhotoAnnotation,
} from '../../types';
import {
  CheckCircle2,
  AlertTriangle,
  Camera,
  Save,
  Send,
  Sparkles,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  FileCheck,
  MapPin,
  Clock,
  User,
  ShieldAlert,
  Edit3,
  RotateCcw,
  Check,
  X,
  Layers,
  ArrowLeft,
} from 'lucide-react';

interface QuestionState {
  score: number;
  maxScore: number;
  status: 'CONFORMING' | 'MINOR_NC' | 'MAJOR_NC' | 'CRITICAL_FAIL' | 'NOT_APPLICABLE';
  notes: string;
  evidenceUrls: string[];
  annotations: PhotoAnnotation[];
}

export const MobileAuditExecutionPage: React.FC = () => {
  const { instanceId } = useParams<{ instanceId?: string }>();
  const [searchParams] = useSearchParams();
  const locationParam = searchParams.get('locationId');
  const navigate = useNavigate();
  const { addToast } = useApp();

  const [loading, setLoading] = useState<boolean>(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [templates, setTemplates] = useState<AuditTemplate[]>([]);

  // Selected session setup if creating ad-hoc
  const [selectedLocationId, setSelectedLocationId] = useState<string>(locationParam || '');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Active Execution State
  const [execution, setExecution] = useState<AuditExecution | null>(null);
  const [questionStates, setQuestionStates] = useState<Record<string, QuestionState>>({});
  const [summaryNotes, setSummaryNotes] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Active Photo Annotation Modal
  const [annotatingQuestionId, setAnnotatingQuestionId] = useState<string | null>(null);
  const [annotationModalOpen, setAnnotationModalOpen] = useState<boolean>(false);

  // Standard Guidance Modal
  const [guidanceModalQuestion, setGuidanceModalQuestion] = useState<AuditTemplateQuestion | null>(null);

  // Submission & Signature Modal
  const [submitModalOpen, setSubmitModalOpen] = useState<boolean>(false);
  const [auditorName, setAuditorName] = useState<string>('Lead 5S Auditor');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasSigned, setHasSigned] = useState<boolean>(false);

  // Session Timer
  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);

  useEffect(() => {
    loadPrerequisites();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const loadPrerequisites = async () => {
    try {
      setLoading(true);
      const [locRes, tplRes] = await Promise.all([
        api.getLocations(),
        api.getAuditTemplates({ status: 'ACTIVE' }),
      ]);

      setLocations(locRes);
      setTemplates(tplRes);

      if (locationParam && locRes.find((l) => l.id === locationParam)) {
        setSelectedLocationId(locationParam);
      } else if (locRes.length > 0) {
        setSelectedLocationId(locRes[0].id);
      }

      if (tplRes.length > 0) {
        setSelectedTemplateId(tplRes[0].id);
      }

      // If instanceId exists, or locationId given, attempt to start session automatically
      if (tplRes.length > 0 && locRes.length > 0) {
        const targetLocId = locationParam || locRes[0].id;
        const targetTplId = tplRes[0].id;
        await startAuditSession(targetLocId, targetTplId, instanceId);
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Initialization Failed',
        message: err.message || 'Could not load locations or templates.',
      });
    } finally {
      setLoading(false);
    }
  };

  const startAuditSession = async (locId: string, tplId: string, instId?: string) => {
    try {
      const exec = await api.startAuditExecution({
        locationId: locId,
        templateId: tplId,
        auditInstanceId: instId,
        auditType: 'ROUTINE',
        auditorName: 'Lead 5S Auditor',
      });

      setExecution(exec);

      // Initialize question states & expand all sections by default
      const initialStates: Record<string, QuestionState> = {};
      const expSec: Record<string, boolean> = {};

      if (exec.templateVersion?.sections) {
        for (const sec of exec.templateVersion.sections) {
          expSec[sec.id] = true;
          if (sec.questions) {
            for (const q of sec.questions) {
              const existingAns = exec.answers?.find((a) => a.questionId === q.id);
              initialStates[q.id] = {
                score: existingAns?.score !== undefined ? existingAns.score : q.weightage * 5.0,
                maxScore: q.weightage * 5.0,
                status: existingAns?.status || 'CONFORMING',
                notes: existingAns?.notes || '',
                evidenceUrls: (existingAns?.evidenceUrls as string[]) || [],
                annotations: [],
              };
            }
          }
        }
      }

      setQuestionStates(initialStates);
      setExpandedSections(expSec);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Could Not Start Audit',
        message: err.message || 'Error creating audit session.',
      });
    }
  };

  // Helper to update individual question state
  const handleScoreChange = (
    qId: string,
    score: number,
    status: 'CONFORMING' | 'MINOR_NC' | 'MAJOR_NC' | 'CRITICAL_FAIL' | 'NOT_APPLICABLE'
  ) => {
    setQuestionStates((prev) => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        score,
        status,
      },
    }));
  };

  const handleNotesChange = (qId: string, notes: string) => {
    setQuestionStates((prev) => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        notes,
      },
    }));
  };

  const openAnnotationForQuestion = (qId: string) => {
    setAnnotatingQuestionId(qId);
    setAnnotationModalOpen(true);
  };

  const handleSaveAnnotatedPhoto = (dataUrl: string, annotations: PhotoAnnotation[]) => {
    if (!annotatingQuestionId) return;
    setQuestionStates((prev) => {
      const current = prev[annotatingQuestionId];
      return {
        ...prev,
        [annotatingQuestionId]: {
          ...current,
          evidenceUrls: [...current.evidenceUrls, dataUrl],
          annotations: [...current.annotations, ...annotations],
        },
      };
    });

    addToast({
      type: 'success',
      title: 'Annotated Evidence Saved',
      message: 'Photo evidence and callouts attached to checklist item.',
    });
  };

  // Compute live scores and pillar breakdown
  const computeLiveScores = () => {
    if (!execution?.templateVersion?.sections) {
      return { overall: 100, earned: 0, max: 0, criticalFails: 0, pillarScores: {} as Record<string, number> };
    }

    let earned = 0;
    let max = 0;
    let criticalFails = 0;
    let minCap = 100;
    const pillarEarned: Record<string, number> = {};
    const pillarMax: Record<string, number> = {};

    for (const sec of execution.templateVersion.sections) {
      const cat = sec.category || 'S1_SORT';
      if (!sec.questions) continue;

      for (const q of sec.questions) {
        const state = questionStates[q.id];
        if (!state || state.status === 'NOT_APPLICABLE') continue;

        earned += state.score;
        max += state.maxScore;

        pillarEarned[cat] = (pillarEarned[cat] || 0) + state.score;
        pillarMax[cat] = (pillarMax[cat] || 0) + state.maxScore;

        if (q.isCritical && (state.status === 'CRITICAL_FAIL' || state.score === 0)) {
          criticalFails++;
          if (q.scoreCapOnFail) minCap = Math.min(minCap, q.scoreCapOnFail);
          else minCap = Math.min(minCap, 70);
        }
      }
    }

    const raw = max > 0 ? (earned / max) * 100 : 100;
    const overall = criticalFails > 0 ? Math.min(raw, minCap) : raw;

    const pillarScores: Record<string, number> = {};
    for (const k of Object.keys(pillarMax)) {
      pillarScores[k] = pillarMax[k] > 0 ? Number(((pillarEarned[k] / pillarMax[k]) * 100).toFixed(1)) : 100;
    }

    return {
      overall: Number(overall.toFixed(1)),
      earned: Number(earned.toFixed(1)),
      max,
      criticalFails,
      pillarScores,
    };
  };

  const liveScores = computeLiveScores();

  // Save Draft
  const handleSaveDraft = async () => {
    if (!execution) return;
    try {
      const answersPayload = Object.keys(questionStates).map((qId) => {
        const q = execution.templateVersion?.sections.flatMap((s) => s.questions || []).find((x) => x.id === qId);
        const s = questionStates[qId];
        return {
          questionId: qId,
          sectionId: q?.sectionId || '',
          score: s.score,
          maxScore: s.maxScore,
          status: s.status,
          notes: s.notes,
          evidenceUrls: s.evidenceUrls,
        };
      });

      await api.saveAuditDraft(execution.id, {
        answers: answersPayload,
        summaryNotes,
      });

      addToast({
        type: 'success',
        title: 'Draft Saved',
        message: 'All answers and photo evidence synchronized.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save Draft Failed',
        message: err.message || 'Could not save audit progress.',
      });
    }
  };

  // Submit Audit Confirmation Modal
  const openSubmitModal = () => {
    setSubmitModalOpen(true);
    setTimeout(() => {
      initSignaturePad();
    }, 100);
  };

  const initSignaturePad = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 2;
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
      setHasSigned(true);
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

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  const handleFinalSubmit = async () => {
    if (!execution) return;
    try {
      setIsSubmitting(true);
      const canvas = signatureCanvasRef.current;
      const signatureData = canvas?.toDataURL('image/png') || '';

      const answersPayload = Object.keys(questionStates).map((qId) => {
        const q = execution.templateVersion?.sections.flatMap((s) => s.questions || []).find((x) => x.id === qId);
        const s = questionStates[qId];
        return {
          questionId: qId,
          sectionId: q?.sectionId || '',
          score: s.score,
          maxScore: s.maxScore,
          status: s.status,
          notes: s.notes,
          evidenceUrls: s.evidenceUrls,
        };
      });

      const res = await api.submitAuditExecution(execution.id, {
        answers: answersPayload,
        summaryNotes,
        auditorSignature: signatureData,
        auditorName,
      });

      setSubmitModalOpen(false);
      addToast({
        type: 'success',
        title: 'Audit Submitted Successfully!',
        message: `Final 5S Score: ${res.overallScore}%. Generated ${res.observations?.length || 0} observations & CAPA actions.`,
      });

      // Navigate to Observations / Location record
      navigate('/observations');
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Audit Submission Failed',
        message: err.message || 'Error submitting final audit evaluation.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <div className="spinner" />
        <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>
          Loading Mobile Audit Execution Engine...
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '90px' }}>
      {/* Top Breadcrumb & Live Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '16px 20px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Button variant="secondary" size="sm" icon={<ArrowLeft size={16} />} onClick={() => navigate('/locations')}>
            Exit
          </Button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <Badge variant="purple" icon={<MapPin size={12} />}>
                {execution?.location?.areaCode || 'Workstation'}
              </Badge>
              <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                {execution?.location?.name || '5S Workplace Audit Execution'}
              </h1>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Template: <strong>{execution?.template?.name || 'Standard 5S Template'}</strong> ({execution?.templateVersion?.versionNumber || '1.0'})
            </div>
          </div>
        </div>

        {/* Live Gauges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* Timer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <Clock size={16} style={{ color: 'var(--color-primary)' }} />
            <span>Duration: <strong style={{ color: 'var(--text-primary)' }}>{formatTimer(secondsElapsed)}</strong></span>
          </div>

          {/* Critical Fail Alert */}
          {liveScores.criticalFails > 0 && (
            <Badge variant="danger" icon={<ShieldAlert size={14} />}>
              {liveScores.criticalFails} Critical Safety Fails
            </Badge>
          )}

          {/* Live Score Gauge */}
          <div
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-md)',
              background: liveScores.overall >= 85 ? 'rgba(16, 185, 129, 0.12)' : liveScores.overall >= 70 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${liveScores.overall >= 85 ? 'rgba(16, 185, 129, 0.3)' : liveScores.overall >= 70 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              display: 'flex',
              alignItems: 'baseline',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: liveScores.overall >= 85 ? '#10B981' : liveScores.overall >= 70 ? '#F59E0B' : '#EF4444' }}>
              Live 5S:
            </span>
            <span style={{ fontSize: '20px', fontWeight: 800, color: liveScores.overall >= 85 ? '#10B981' : liveScores.overall >= 70 ? '#F59E0B' : '#EF4444' }}>
              {liveScores.overall}%
            </span>
          </div>
        </div>
      </div>

      {/* 6 Pillars Mini-Radar Bar */}
      <Card noPadding>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            5S Core Pillars Progress Breakdown
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Earned: {liveScores.earned} / {liveScores.max} Max Points
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '12px',
            padding: '14px 20px',
            background: 'var(--bg-surface-subtle)',
          }}
        >
          {[
            { key: 'S1_SORT', label: '1S - Sort', score: liveScores.pillarScores['S1_SORT'] || 100 },
            { key: 'S2_SET_IN_ORDER', label: '2S - Set in Order', score: liveScores.pillarScores['S2_SET_IN_ORDER'] || 100 },
            { key: 'S3_SHINE', label: '3S - Shine', score: liveScores.pillarScores['S3_SHINE'] || 100 },
            { key: 'S4_STANDARDIZE', label: '4S - Standardize', score: liveScores.pillarScores['S4_STANDARDIZE'] || 100 },
            { key: 'S5_SUSTAIN', label: '5S - Sustain', score: liveScores.pillarScores['S5_SUSTAIN'] || 100 },
            { key: 'S6_SAFETY', label: '6S - Safety', score: liveScores.pillarScores['S6_SAFETY'] || 100 },
          ].map((pil) => (
            <div key={pil.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600 }}>
                <span>{pil.label}</span>
                <span style={{ color: pil.score >= 85 ? '#10B981' : pil.score >= 70 ? '#F59E0B' : '#EF4444' }}>
                  {pil.score}%
                </span>
              </div>
              <ProgressBar
                value={pil.score}
                color={pil.score >= 85 ? 'success' : pil.score >= 70 ? 'warning' : 'danger'}
                height={6}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Checklist Sections */}
      {execution?.templateVersion?.sections.map((section: AuditTemplateSection, sIdx: number) => {
        const isExpanded = expandedSections[section.id] !== false;
        const questions = section.questions || [];

        return (
          <div
            key={section.id}
            style={{
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            {/* Section Header Accordion */}
            <div
              onClick={() => setExpandedSections((prev) => ({ ...prev, [section.id]: !isExpanded }))}
              style={{
                padding: '16px 20px',
                background: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-primary-subtle)',
                    color: 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '13px',
                  }}
                >
                  {sIdx + 1}
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    {section.title}
                  </h3>
                  {section.description && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {section.description}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Badge variant="neutral">{questions.length} Items</Badge>
                {isExpanded ? <ChevronDown size={18} color="var(--text-tertiary)" /> : <ChevronRight size={18} color="var(--text-tertiary)" />}
              </div>
            </div>

            {/* Questions List */}
            {isExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {questions.map((q: AuditTemplateQuestion, qIdx: number) => {
                  const state = questionStates[q.id] || {
                    score: q.weightage * 5.0,
                    maxScore: q.weightage * 5.0,
                    status: 'CONFORMING',
                    notes: '',
                    evidenceUrls: [],
                    annotations: [],
                  };

                  const isFailing = state.status === 'CRITICAL_FAIL' || state.status === 'MAJOR_NC' || state.status === 'MINOR_NC' || state.score < state.maxScore * 0.7;

                  return (
                    <div
                      key={q.id}
                      style={{
                        padding: '18px 20px',
                        borderBottom: qIdx < questions.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                        background: isFailing ? 'rgba(239, 68, 68, 0.02)' : 'transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      {/* Question Text & Badges */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)' }}>
                              {q.questionCode}
                            </span>
                            {q.isCritical && (
                              <Badge variant="danger" icon={<ShieldAlert size={10} />}>
                                Critical Safety Item
                              </Badge>
                            )}
                            {q.standard && (
                              <button
                                type="button"
                                onClick={() => setGuidanceModalQuestion(q)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  color: 'var(--color-primary)',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  cursor: 'pointer',
                                }}
                              >
                                <FileCheck size={12} /> Standard: {q.standard.code}
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: '1.4' }}>
                            {q.questionText}
                          </div>
                        </div>

                        {/* Guidance Button */}
                        {q.guidance && (
                          <button
                            type="button"
                            title="View Guidance"
                            onClick={() => setGuidanceModalQuestion(q)}
                            style={{
                              background: 'var(--bg-surface-subtle)',
                              border: '1px solid var(--border-subtle)',
                              padding: '6px 10px',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                            }}
                          >
                            <HelpCircle size={14} /> Guide
                          </button>
                        )}
                      </div>

                      {/* Interactive Evaluation Buttons */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-surface-subtle)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {/* 1-Tap Scoring Controls */}
                        {q.questionType === 'PASS_FAIL' || q.questionType === 'YES_NO' ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => handleScoreChange(q.id, q.weightage * 5.0, 'CONFORMING')}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid',
                                borderColor: state.status === 'CONFORMING' ? '#10B981' : 'var(--border-subtle)',
                                background: state.status === 'CONFORMING' ? '#10B981' : 'var(--bg-surface)',
                                color: state.status === 'CONFORMING' ? '#FFFFFF' : 'var(--text-primary)',
                                fontWeight: 700,
                                fontSize: '13px',
                                cursor: 'pointer',
                              }}
                            >
                              <Check size={16} /> Conforming (100%)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleScoreChange(q.id, 0, q.isCritical ? 'CRITICAL_FAIL' : 'MAJOR_NC')}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid',
                                borderColor: isFailing ? '#EF4444' : 'var(--border-subtle)',
                                background: isFailing ? '#EF4444' : 'var(--bg-surface)',
                                color: isFailing ? '#FFFFFF' : 'var(--text-primary)',
                                fontWeight: 700,
                                fontSize: '13px',
                                cursor: 'pointer',
                              }}
                            >
                              <X size={16} /> Non-Conforming (0%)
                            </button>
                          </div>
                        ) : (
                          /* 0 - 5 Scale Buttons */
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginRight: '4px' }}>
                              Rating:
                            </span>
                            {[0, 1, 2, 3, 4, 5].map((val) => {
                              const calculatedScore = q.weightage * val;
                              const isSelected = state.score === calculatedScore;
                              const isFailVal = val <= 2;

                              return (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => {
                                    const status =
                                      val >= 4 ? 'CONFORMING' : val === 3 ? 'MINOR_NC' : q.isCritical ? 'CRITICAL_FAIL' : 'MAJOR_NC';
                                    handleScoreChange(q.id, calculatedScore, status);
                                  }}
                                  style={{
                                    width: '36px',
                                    height: '34px',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid',
                                    borderColor: isSelected ? (isFailVal ? '#EF4444' : '#10B981') : 'var(--border-subtle)',
                                    background: isSelected ? (isFailVal ? '#EF4444' : '#10B981') : 'var(--bg-surface)',
                                    color: isSelected ? '#FFFFFF' : 'var(--text-primary)',
                                    fontWeight: 700,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {val}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Photo Evidence Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Button
                            variant={state.evidenceUrls.length > 0 ? 'primary' : 'secondary'}
                            size="sm"
                            icon={<Camera size={14} />}
                            onClick={() => openAnnotationForQuestion(q.id)}
                          >
                            {state.evidenceUrls.length > 0 ? `${state.evidenceUrls.length} Evidence Added` : 'Attach & Annotate Photo'}
                          </Button>
                        </div>
                      </div>

                      {/* Evidence Photo Thumbnail Previews */}
                      {state.evidenceUrls.length > 0 && (
                        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '4px 0' }}>
                          {state.evidenceUrls.map((url, imgIdx) => (
                            <div
                              key={imgIdx}
                              style={{
                                position: 'relative',
                                width: '100px',
                                height: '70px',
                                borderRadius: 'var(--radius-sm)',
                                overflow: 'hidden',
                                border: '1px solid var(--border-subtle)',
                              }}
                            >
                              <ImageWithFallback src={url} alt="Evidence" height="70px" allowZoom={true} />
                              <span
                                style={{
                                  position: 'absolute',
                                  bottom: '2px',
                                  right: '2px',
                                  background: 'rgba(0,0,0,0.7)',
                                  color: '#FFFFFF',
                                  fontSize: '9px',
                                  padding: '1px 4px',
                                  borderRadius: '2px',
                                  pointerEvents: 'none',
                                  zIndex: 2,
                                }}
                              >
                                #{imgIdx + 1}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Non-Conformance Notes Input */}
                      {(isFailing || state.notes) && (
                        <div>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Detail non-conformance finding (triggers auto-CAPA observation on submit)..."
                            value={state.notes}
                            onChange={(e) => handleNotesChange(q.id, e.target.value)}
                            style={{ fontSize: '13px' }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Summary Notes Card */}
      <Card title="Overall Auditor Summary & Concluding Remarks">
        <textarea
          rows={3}
          className="form-control"
          placeholder="Record final observations, plant cleanliness condition, operator engagement, or overall remarks..."
          value={summaryNotes}
          onChange={(e) => setSummaryNotes(e.target.value)}
        />
      </Card>

      {/* Bottom Sticky Floating Action Bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 'var(--sidebar-width)',
          right: 0,
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
          padding: '14px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 100,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button variant="secondary" icon={<Save size={16} />} onClick={handleSaveDraft}>
            Save Draft
          </Button>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Session Auto-Syncing: <strong style={{ color: 'var(--text-primary)' }}>{execution?.auditCode}</strong>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button variant="primary" icon={<Send size={16} />} onClick={openSubmitModal}>
            Review & Submit Audit ({liveScores.overall}%)
          </Button>
        </div>
      </div>

      {/* Photo Annotation Modal */}
      <PhotoAnnotationModal
        isOpen={annotationModalOpen}
        onClose={() => setAnnotationModalOpen(false)}
        initialPhotoUrl={FIVE_S_IMAGES.defects.clutteredUnderBench}
        onSave={handleSaveAnnotatedPhoto}
      />

      {/* Standard Reference Guidance Modal */}
      {guidanceModalQuestion && (
        <Modal
          isOpen={Boolean(guidanceModalQuestion)}
          onClose={() => setGuidanceModalQuestion(null)}
          title={`Checklist Guidance: ${guidanceModalQuestion.questionCode}`}
          maxWidth="640px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h4 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0' }}>
                {guidanceModalQuestion.questionText}
              </h4>
              {guidanceModalQuestion.description && (
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  {guidanceModalQuestion.description}
                </p>
              )}
            </div>

            {guidanceModalQuestion.guidance && (
              <div
                style={{
                  padding: '14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '13px',
                  lineHeight: '1.5',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '4px', color: 'var(--color-primary)' }}>
                  Auditor Evaluation Criteria:
                </div>
                {guidanceModalQuestion.guidance}
              </div>
            )}

            {guidanceModalQuestion.standard && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(37, 99, 235, 0.06)',
                  border: '1px solid rgba(37, 99, 235, 0.2)',
                  fontSize: '13px',
                }}
              >
                <strong>Linked Standard:</strong> {guidanceModalQuestion.standard.title} ({guidanceModalQuestion.standard.code})
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <Button variant="secondary" onClick={() => setGuidanceModalQuestion(null)}>
                Close Guidance
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Final Submit & Auditor Sign-Off Modal */}
      <Modal
        isOpen={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        title="Audit Sign-Off & Submission Verification"
        maxWidth="620px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Summary Score Card */}
          <div
            style={{
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              background: liveScores.overall >= 85 ? 'rgba(16, 185, 129, 0.08)' : liveScores.overall >= 70 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${liveScores.overall >= 85 ? 'rgba(16, 185, 129, 0.3)' : liveScores.overall >= 70 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Target: <strong>{execution?.location?.name}</strong>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: liveScores.overall >= 85 ? '#10B981' : liveScores.overall >= 70 ? '#F59E0B' : '#EF4444' }}>
                {liveScores.overall}% 5S Score
              </div>
            </div>
            <Badge variant={liveScores.overall >= 70 && liveScores.criticalFails === 0 ? 'success' : 'danger'}>
              {liveScores.overall >= 70 && liveScores.criticalFails === 0 ? 'COMPLIANT (PASS)' : 'NON-COMPLIANT (FAIL)'}
            </Badge>
          </div>

          {/* Critical Fail Warning Banner */}
          {liveScores.criticalFails > 0 && (
            <div
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#EF4444',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <ShieldAlert size={18} />
              <span>
                <strong>{liveScores.criticalFails} Critical safety criteria failed.</strong> Score is automatically capped at 70% max.
              </span>
            </div>
          )}

          {/* Auditor Name Field */}
          <div className="form-group">
            <label className="form-label">Auditor Full Name *</label>
            <input
              type="text"
              className="form-control"
              value={auditorName}
              onChange={(e) => setAuditorName(e.target.value)}
              required
            />
          </div>

          {/* Digital Signature Pad */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0 }}>
                Auditor Digital Signature Pad *
              </label>
              <button
                type="button"
                onClick={clearSignature}
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
                height: '120px',
                borderRadius: 'var(--radius-md)',
                background: '#FFFFFF',
                border: '1px solid var(--border-subtle)',
                overflow: 'hidden',
              }}
            >
              <canvas ref={signatureCanvasRef} width={560} height={120} style={{ width: '100%', height: '100%', cursor: 'crosshair' }} />
            </div>
          </div>

          {/* Bottom Submit Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <Button variant="secondary" onClick={() => setSubmitModalOpen(false)}>
              Back to Checklist
            </Button>
            <Button
              variant="primary"
              icon={<FileCheck size={16} />}
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Locking Audit...' : 'Sign & Submit Audit'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

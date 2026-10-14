import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import {
  AuditTemplate,
  AuditTemplateVersion,
  AuditTemplateSection,
  AuditTemplateQuestion,
  Standard,
} from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import {
  ArrowLeft,
  FileCheck,
  Plus,
  Trash2,
  Lock,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  HelpCircle,
  Camera,
  ListChecks,
  Percent,
  Sliders,
  ShieldAlert,
  ChevronRight,
  RefreshCw,
  X,
  UploadCloud,
  Eye,
  BookOpen,
  Edit2,
  Check,
} from 'lucide-react';

export const TemplateBuilderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTenant, addToast } = useApp();

  const [template, setTemplate] = useState<AuditTemplate | null>(null);
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  // Modals & Drawers
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [showAddQuestionModal, setShowAddQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<AuditTemplateQuestion | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showSimulatorModal, setShowSimulatorModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // New Section State
  const [newSection, setNewSection] = useState({
    title: '',
    description: '',
    category: 'S1_SORT',
  });

  // Question Form State
  const [questionForm, setQuestionForm] = useState({
    questionCode: '',
    questionText: '',
    description: '',
    guidance: '',
    standardId: '',
    questionType: 'YES_NO' as any,
    options: [
      { label: 'Exceeds Standard (100%)', score: 100 },
      { label: 'Meets Standard (80%)', score: 80 },
      { label: 'Partial Compliance (40%)', score: 40 },
      { label: 'Non-Compliant (0%)', score: 0 },
    ],
    weightage: 5,
    severity: 'MODERATE' as any,
    isCritical: false,
    scoreCapOnFail: 70,
    mandatoryEvidence: false,
    requireEvidenceOnScoreBelow: 50,
    referencePhotoUrl: '',
  });

  // Simulator State
  const [simAnswers, setSimAnswers] = useState<Record<string, any>>({});
  const [simPhotos, setSimPhotos] = useState<Record<string, string>>({});
  const [publishChangeSummary, setPublishChangeSummary] = useState('');

  const loadData = async () => {
    if (!id || !currentTenant) return;
    setLoading(true);
    try {
      const [tplData, stdData] = await Promise.all([
        api.getAuditTemplateById(id),
        api.getStandards(),
      ]);
      setTemplate(tplData);
      setStandards(stdData);

      const activeVer = tplData.currentVersion || tplData.versions?.[0];
      if (activeVer?.sections && activeVer.sections.length > 0) {
        if (!selectedSectionId || !activeVer.sections.find((s) => s.id === selectedSectionId)) {
          setSelectedSectionId(activeVer.sections[0].id);
        }
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error Loading Template',
        message: err?.response?.data?.message || 'Could not load audit template workspace.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id, currentTenant]);

  const activeVersion: AuditTemplateVersion | undefined =
    template?.currentVersion || template?.versions?.[0];

  const selectedSection = activeVersion?.sections?.find((s) => s.id === selectedSectionId);

  const handleAddSectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !activeVersion || !newSection.title) return;
    setActionLoading(true);
    try {
      await api.addTemplateSection(id, activeVersion.id, {
        title: newSection.title.trim(),
        description: newSection.description.trim(),
        category: newSection.category,
        sortOrder: (activeVersion.sections?.length || 0) + 1,
      });

      addToast({
        type: 'success',
        title: 'Section Added',
        message: `Added section '${newSection.title}'.`,
      });

      setShowAddSectionModal(false);
      setNewSection({ title: '', description: '', category: 'S1_SORT' });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Section Error',
        message: err?.response?.data?.message || 'Failed to add section.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenAddQuestion = () => {
    setEditingQuestion(null);
    const secCode = selectedSection?.category?.split('_')[0] || '1S';
    const nextQNum = (selectedSection?.questions?.length || 0) + 1;
    setQuestionForm({
      questionCode: `Q-${secCode}-${String(nextQNum).padStart(2, '0')}`,
      questionText: '',
      description: '',
      guidance: '',
      standardId: '',
      questionType: 'YES_NO',
      options: [
        { label: 'Exceeds Standard', score: 100 },
        { label: 'Meets Standard', score: 80 },
        { label: 'Partial Compliance', score: 40 },
        { label: 'Non-Compliant', score: 0 },
      ],
      weightage: 5,
      severity: 'MODERATE',
      isCritical: false,
      scoreCapOnFail: 70,
      mandatoryEvidence: false,
      requireEvidenceOnScoreBelow: 50,
      referencePhotoUrl: '',
    });
    setShowAddQuestionModal(true);
  };

  const handleSaveQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSectionId || !questionForm.questionCode || !questionForm.questionText) return;
    setActionLoading(true);
    try {
      const payload = {
        questionCode: questionForm.questionCode.trim().toUpperCase(),
        questionText: questionForm.questionText.trim(),
        description: questionForm.description.trim() || undefined,
        guidance: questionForm.guidance.trim() || undefined,
        standardId: questionForm.standardId || undefined,
        questionType: questionForm.questionType,
        options: questionForm.questionType === 'MULTIPLE_CHOICE' ? questionForm.options : undefined,
        weightage: Number(questionForm.weightage),
        severity: questionForm.severity,
        isCritical: questionForm.isCritical,
        scoreCapOnFail: questionForm.isCritical ? Number(questionForm.scoreCapOnFail) : undefined,
        mandatoryEvidence: questionForm.mandatoryEvidence,
        requireEvidenceOnScoreBelow: questionForm.requireEvidenceOnScoreBelow
          ? Number(questionForm.requireEvidenceOnScoreBelow)
          : undefined,
        referencePhotoUrl: questionForm.referencePhotoUrl || undefined,
        sortOrder: editingQuestion ? editingQuestion.sortOrder : (selectedSection?.questions?.length || 0) + 1,
      };

      if (editingQuestion) {
        await api.updateTemplateQuestion(editingQuestion.id, payload);
        addToast({
          type: 'success',
          title: 'Question Updated',
          message: `Question '${payload.questionCode}' updated.`,
        });
      } else {
        await api.addTemplateQuestion(selectedSectionId, payload);
        addToast({
          type: 'success',
          title: 'Question Added',
          message: `Question '${payload.questionCode}' added to ${selectedSection?.title}.`,
        });
      }

      setShowAddQuestionModal(false);
      setEditingQuestion(null);
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save Question Error',
        message: err?.response?.data?.message || 'Failed to save question.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    try {
      await api.deleteTemplateQuestion(questionId);
      addToast({
        type: 'success',
        title: 'Question Deleted',
        message: 'Question removed from section.',
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Delete Failed',
        message: err?.response?.data?.message || 'Failed to delete question.',
      });
    }
  };

  const handlePublishVersionSubmit = async () => {
    if (!id || !activeVersion) return;
    setActionLoading(true);
    try {
      await api.publishTemplateVersion(
        id,
        activeVersion.id,
        publishChangeSummary || 'Published approved production snapshot.',
      );
      addToast({
        type: 'success',
        title: 'Version Published',
        message: `Template snapshot v${activeVersion.versionNumber} is published and locked.`,
      });
      setShowPublishModal(false);
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Publish Failed',
        message: err?.response?.data?.message || 'Failed to publish version.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Mobile Simulator Calculation
  const calculateSimScore = () => {
    if (!activeVersion?.sections) return { rawScore: 0, finalScore: 0, hasCriticalFail: false, minCap: 100 };
    let totalPossibleWeight = 0;
    let earnedWeight = 0;
    let hasCriticalFail = false;
    let minCap = 100;

    activeVersion.sections.forEach((sec) => {
      sec.questions?.forEach((q) => {
        const ans = simAnswers[q.id];
        const weight = q.weightage || 1;

        if (ans === 'N_A' || q.questionType === 'NOT_APPLICABLE') {
          // Automatic denominator adjustment for N/A
          return;
        }

        totalPossibleWeight += weight;

        let pct = 0;
        if (ans !== undefined && ans !== null) {
          if (q.questionType === 'YES_NO' || q.questionType === 'PASS_FAIL') {
            pct = ans === true || ans === 'PASS' ? 100 : 0;
          } else if (q.questionType === 'NUMERIC_0_5') {
            pct = (Number(ans) / 5) * 100;
          } else if (q.questionType === 'NUMERIC_0_10') {
            pct = (Number(ans) / 10) * 100;
          } else if (q.questionType === 'PERCENTAGE') {
            pct = Number(ans);
          } else if (q.questionType === 'MULTIPLE_CHOICE') {
            pct = Number(ans);
          } else {
            pct = 100; // Text/Photo/Checklist
          }
        }

        earnedWeight += (pct / 100) * weight;

        // Critical Failure Score Cap
        if (q.isCritical && pct < 50) {
          hasCriticalFail = true;
          if (q.scoreCapOnFail && q.scoreCapOnFail < minCap) {
            minCap = q.scoreCapOnFail;
          }
        }
      });
    });

    const rawScore = totalPossibleWeight > 0 ? Math.round((earnedWeight / totalPossibleWeight) * 100) : 0;
    const finalScore = hasCriticalFail ? Math.min(rawScore, minCap) : rawScore;

    return { rawScore, finalScore, hasCriticalFail, minCap };
  };

  if (loading || !template) {
    return (
      <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-secondary)' }}>
        <RefreshCw size={28} className="spin-animation" style={{ marginBottom: '12px' }} />
        <div>Loading Template Visual Builder Workspace...</div>
      </div>
    );
  }

  const categoryLabels: Record<string, { label: string; badgeVariant: any }> = {
    S1_SORT: { label: '1S Sort', badgeVariant: 'warning' },
    S2_SET_IN_ORDER: { label: '2S Set In Order', badgeVariant: 'purple' },
    S3_SHINE: { label: '3S Shine', badgeVariant: 'info' },
    S4_STANDARDIZE: { label: '4S Standardize', badgeVariant: 'neutral' },
    S5_SUSTAIN: { label: '5S Sustain', badgeVariant: 'success' },
    S6_SAFETY: { label: '6S Safety', badgeVariant: 'danger' },
  };

  const simResult = calculateSimScore();

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Breadcrumb & Action Bar */}
      <div className="page-top-bar">
        <button
          onClick={() => navigate('/templates')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            cursor: 'pointer',
            padding: '4px 0',
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={16} /> Back to Audit Templates
        </button>

        <div className="page-top-bar-actions">
          <Button
            variant="secondary"
            icon={<Smartphone size={15} />}
            onClick={() => setShowSimulatorModal(true)}
          >
            Auditor Mobile Simulator
          </Button>

          {!activeVersion?.isPublished ? (
            <Button
              variant="primary"
              icon={<Lock size={15} />}
              onClick={() => setShowPublishModal(true)}
            >
              Publish Immutable Version
            </Button>
          ) : (
            <Badge variant="success">
              <Lock size={12} style={{ marginRight: '4px' }} />
              v{activeVersion.versionNumber} Locked Production Snapshot
            </Badge>
          )}
        </div>
      </div>

      {/* Hero Template Banner Card */}
      <Card noPadding>
        <div
          style={{
            padding: '20px 24px',
            background: 'linear-gradient(to right, var(--bg-surface), var(--bg-surface-subtle))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '20px',
                border: '1px solid var(--color-primary)',
              }}
            >
              <FileCheck size={26} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span className="code-tag" style={{ background: 'var(--color-primary)', color: '#FFFFFF', padding: '2px 8px', borderRadius: 'var(--radius-xs)', fontWeight: 800, fontSize: '12px' }}>
                  {template.code}
                </span>
                <Badge variant="neutral">{template.auditType}</Badge>
                <Badge variant={activeVersion?.isPublished ? 'success' : 'warning'}>
                  v{activeVersion?.versionNumber || '1.0'} {activeVersion?.isPublished ? '(Published / Locked)' : '(Draft Mode)'}
                </Badge>
              </div>

              <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 2px 0', letterSpacing: '-0.02em' }}>
                {template.name}
              </h1>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {template.description || 'Configurable 5S inspection template with multi-tier scoring rules.'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Sections</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>{activeVersion?.sections?.length || 0}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Questions</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-primary)' }}>
                {activeVersion?.sections?.reduce((sum, s) => sum + (s.questions?.length || 0), 0) || 0}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Split Visual Builder Workspace */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px', alignItems: 'flex-start' }}>
        {/* Left Sidebar: Audit Sections */}
        <Card
          title="Audit Sections"
          subtitle="1S–6S Pillar Structure"
          actions={
            <Button
              size="sm"
              variant="primary"
              icon={<Plus size={13} />}
              onClick={() => setShowAddSectionModal(true)}
            >
              Add Section
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeVersion?.sections?.map((sec, idx) => {
              const isSelected = sec.id === selectedSectionId;
              const cat = categoryLabels[sec.category] || { label: sec.category, badgeVariant: 'neutral' };
              const qCount = sec.questions?.length || 0;

              return (
                <div
                  key={sec.id}
                  onClick={() => setSelectedSectionId(sec.id)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: isSelected ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                    border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Badge variant={cat.badgeVariant}>{cat.label}</Badge>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                      {qCount} {qCount === 1 ? 'Question' : 'Questions'}
                    </span>
                  </div>

                  <div style={{ fontWeight: 700, fontSize: '13px', color: isSelected ? 'var(--color-primary)' : 'var(--text-primary)' }}>
                    {idx + 1}. {sec.title}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Right Canvas: Section Questions Workspace */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {selectedSection ? (
            <Card
              title={selectedSection.title}
              subtitle={`Category: ${selectedSection.category} • ${selectedSection.questions?.length || 0} Questions configured`}
              actions={
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Plus size={14} />}
                  onClick={handleOpenAddQuestion}
                >
                  Add Question to Section
                </Button>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedSection.questions && selectedSection.questions.length > 0 ? (
                  selectedSection.questions.map((q, qIdx) => {
                    const linkedStd = standards.find((s) => s.id === q.standardId);
                    return (
                      <div
                        key={q.id}
                        style={{
                          padding: '16px 20px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-surface-subtle)',
                          border: q.isCritical ? '1px solid rgba(220, 38, 38, 0.4)' : '1px solid var(--border-subtle)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        {/* Question Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="code-tag" style={{ background: q.isCritical ? 'var(--color-danger)' : undefined, color: q.isCritical ? '#FFFFFF' : undefined }}>
                              {q.questionCode}
                            </span>
                            <Badge variant="neutral">{q.questionType}</Badge>
                            <Badge variant={q.severity === 'CRITICAL' ? 'danger' : q.severity === 'MAJOR' ? 'warning' : 'neutral'}>
                              {q.severity} Severity
                            </Badge>
                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                              Weight: <strong>{q.weightage}x</strong>
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {q.isCritical && (
                              <Badge variant="danger">
                                <ShieldAlert size={12} style={{ marginRight: '4px' }} />
                                Critical Cap: {q.scoreCapOnFail || 70}%
                              </Badge>
                            )}
                            {q.mandatoryEvidence && (
                              <Badge variant="warning">
                                <Camera size={12} style={{ marginRight: '4px' }} />
                                Mandatory Photo
                              </Badge>
                            )}
                            <button
                              onClick={() => {
                                setEditingQuestion(q);
                                setQuestionForm({
                                  questionCode: q.questionCode,
                                  questionText: q.questionText,
                                  description: q.description || '',
                                  guidance: q.guidance || '',
                                  standardId: q.standardId || '',
                                  questionType: q.questionType as any,
                                  options: q.options || [],
                                  weightage: q.weightage,
                                  severity: q.severity as any,
                                  isCritical: q.isCritical,
                                  scoreCapOnFail: q.scoreCapOnFail || 70,
                                  mandatoryEvidence: q.mandatoryEvidence,
                                  requireEvidenceOnScoreBelow: q.requireEvidenceOnScoreBelow || 50,
                                  referencePhotoUrl: q.referencePhotoUrl || '',
                                });
                                setShowAddQuestionModal(true);
                              }}
                              style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: '4px' }}
                              title="Edit Question"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteQuestion(q.id)}
                              style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '4px' }}
                              title="Delete Question"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {/* Question Text */}
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {qIdx + 1}. {q.questionText}
                        </div>

                        {/* Guidance & Linked Standard */}
                        {(q.guidance || linkedStd) && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {q.guidance && (
                              <div style={{ background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: 'var(--radius-xs)', borderLeft: '3px solid var(--color-primary)' }}>
                                <strong>Auditor Guidance:</strong> {q.guidance}
                              </div>
                            )}
                            {linkedStd && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-primary)', fontWeight: 600 }}>
                                <BookOpen size={14} />
                                <span>Linked Standard: {linkedStd.code} — {linkedStd.title}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                    <ListChecks size={32} color="var(--text-tertiary)" style={{ marginBottom: '8px' }} />
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No Questions in this Section</div>
                    <p style={{ fontSize: '12px', maxWidth: '360px', margin: '4px auto 14px auto' }}>
                      Add inspection questions with verification criteria and severity weightings.
                    </p>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Plus size={14} />}
                      onClick={handleOpenAddQuestion}
                    >
                      Add First Question
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card>
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                Select or create an audit section on the left to configure questions.
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Add Section Modal */}
      {showAddSectionModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowAddSectionModal(false)}
          title="Add Audit Template Section"
        >
          <form onSubmit={handleAddSectionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">5S Pillar Category *</label>
              <select
                value={newSection.category}
                onChange={(e) => setNewSection({ ...newSection, category: e.target.value })}
                className="form-control"
                required
              >
                <option value="S1_SORT">1S - Sort</option>
                <option value="S2_SET_IN_ORDER">2S - Set in Order</option>
                <option value="S3_SHINE">3S - Shine</option>
                <option value="S4_STANDARDIZE">4S - Standardize</option>
                <option value="S5_SUSTAIN">5S - Sustain</option>
                <option value="S6_SAFETY">6S - Safety</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Section Title *</label>
              <input
                type="text"
                placeholder="e.g. 1S - Physical Sweep & Red Tag Clearing"
                value={newSection.title}
                onChange={(e) => setNewSection({ ...newSection, title: e.target.value })}
                className="form-control"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Section Description</label>
              <textarea
                rows={2}
                placeholder="Optional scope guidance for this audit section..."
                value={newSection.description}
                onChange={(e) => setNewSection({ ...newSection, description: e.target.value })}
                className="form-control"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <Button variant="secondary" onClick={() => setShowAddSectionModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={actionLoading} icon={<Plus size={14} />}>
                Add Section
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add / Edit Question Modal */}
      <Modal
        isOpen={showAddQuestionModal}
        onClose={() => setShowAddQuestionModal(false)}
        title={editingQuestion ? `Edit Question: ${editingQuestion.questionCode}` : `Add Question to ${selectedSection?.title}`}
        subtitle="Configure question response type, weightage, guidance, and evidence requirements"
        maxWidth="640px"
      >
        <form onSubmit={handleSaveQuestionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Question Code *</label>
              <input
                type="text"
                value={questionForm.questionCode}
                onChange={(e) => setQuestionForm({ ...questionForm, questionCode: e.target.value })}
                className="form-control"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Question Response Type *</label>
              <select
                value={questionForm.questionType}
                onChange={(e) => setQuestionForm({ ...questionForm, questionType: e.target.value as any })}
                className="form-control"
                required
              >
                <option value="YES_NO">Yes / No (Binary)</option>
                <option value="PASS_FAIL">Pass / Fail</option>
                <option value="NUMERIC_0_5">Numeric Scale (0 to 5)</option>
                <option value="NUMERIC_0_10">Numeric Scale (0 to 10)</option>
                <option value="PERCENTAGE">Percentage (0 - 100%)</option>
                <option value="MULTIPLE_CHOICE">Multiple Choice (Weighted)</option>
                <option value="CHECKLIST">Checklist Item</option>
                <option value="PHOTO">Mandatory Photographic Proof</option>
                <option value="TEXT">Qualitative Text Feedback</option>
                <option value="NOT_APPLICABLE">N/A (Exclude Denominator)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Question Text *</label>
            <input
              type="text"
              placeholder="e.g. Are all unnecessary tools, jigs, and obsolete materials removed from the workstation?"
              value={questionForm.questionText}
              onChange={(e) => setQuestionForm({ ...questionForm, questionText: e.target.value })}
              className="form-control"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Rich Auditor Guidance Note</label>
            <textarea
              rows={2}
              placeholder="Explicit instructions for the auditor on where to look and acceptable thresholds..."
              value={questionForm.guidance}
              onChange={(e) => setQuestionForm({ ...questionForm, guidance: e.target.value })}
              className="form-control"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Link to 5S Visual Standard Definition</label>
            <select
              value={questionForm.standardId}
              onChange={(e) => setQuestionForm({ ...questionForm, standardId: e.target.value })}
              className="form-control"
            >
              <option value="">-- No Linked Standard --</option>
              {standards.map((std) => (
                <option key={std.id} value={std.id}>
                  {std.code} — {std.title} ({std.category})
                </option>
              ))}
            </select>
          </div>

          {/* Severity & Weighting */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Question Severity</label>
              <select
                value={questionForm.severity}
                onChange={(e) => setQuestionForm({ ...questionForm, severity: e.target.value as any })}
                className="form-control"
              >
                <option value="MINOR">Minor Finding</option>
                <option value="MODERATE">Moderate Severity</option>
                <option value="MAJOR">Major Violation</option>
                <option value="CRITICAL">Critical Safety Ceiling</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Score Weight Multiplier (1 - 10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={questionForm.weightage}
                onChange={(e) => setQuestionForm({ ...questionForm, weightage: Number(e.target.value) })}
                className="form-control"
              />
            </div>
          </div>

          {/* Critical Question Ceiling Config */}
          <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                  Critical Safety Question Override
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Cap overall audit score if this critical question fails
                </div>
              </div>
              <input
                type="checkbox"
                checked={questionForm.isCritical}
                onChange={(e) => setQuestionForm({ ...questionForm, isCritical: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
            </div>

            {questionForm.isCritical && (
              <div className="form-group" style={{ marginTop: '6px' }}>
                <label className="form-label" style={{ color: 'var(--color-danger)' }}>
                  Maximum Audit Score Cap on Failure (e.g. 70%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={questionForm.scoreCapOnFail}
                  onChange={(e) => setQuestionForm({ ...questionForm, scoreCapOnFail: Number(e.target.value) })}
                  className="form-control"
                />
              </div>
            )}
          </div>

          {/* Mandatory Photo Evidence Config */}
          <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                  Mandatory Photographic Evidence
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Require auditor to take a photo before submitting
                </div>
              </div>
              <input
                type="checkbox"
                checked={questionForm.mandatoryEvidence}
                onChange={(e) => setQuestionForm({ ...questionForm, mandatoryEvidence: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <Button variant="secondary" onClick={() => setShowAddQuestionModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={actionLoading} icon={<Check size={14} />}>
              Save Question
            </Button>
          </div>
        </form>
      </Modal>

      {/* Publish Version Snapshot Modal */}
      {showPublishModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowPublishModal(false)}
          title="Publish Immutable Audit Template Snapshot"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '10px', borderRadius: 'var(--radius-full)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                <Lock size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                  Publish Version v{activeVersion?.versionNumber || '1.0'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Publishing locks this version snapshot for recurring audit execution and scoring integrity.
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Release Change Summary</label>
              <textarea
                rows={3}
                placeholder="e.g. Baseline operational release with 1S-5S check questions."
                value={publishChangeSummary}
                onChange={(e) => setPublishChangeSummary(e.target.value)}
                className="form-control"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setShowPublishModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={actionLoading} onClick={handlePublishVersionSubmit}>
                Lock & Publish Template
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Auditor Mobile Simulator Modal */}
      {showSimulatorModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowSimulatorModal(false)}
          title="Mobile Auditor Execution Simulator"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Simulator Score Header */}
            <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Live Calculated 5S Audit Score
                </div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: simResult.finalScore >= 80 ? 'var(--color-success)' : simResult.finalScore >= 60 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
                  {simResult.finalScore}%
                </div>
              </div>

              {simResult.hasCriticalFail && (
                <Badge variant="danger">
                  <ShieldAlert size={14} style={{ marginRight: '4px' }} />
                  Critical Cap Active: Max {simResult.minCap}%
                </Badge>
              )}
            </div>

            {/* Interactive Questions Simulator List */}
            <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
              {activeVersion?.sections?.map((sec) => (
                <div key={sec.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px', background: 'var(--bg-surface)' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '10px' }}>
                    {sec.title}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {sec.questions?.map((q) => {
                      const ans = simAnswers[q.id];
                      return (
                        <div key={q.id} style={{ padding: '10px 12px', borderRadius: 'var(--radius-xs)', background: 'var(--bg-surface-subtle)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {q.questionCode}: {q.questionText}
                          </div>

                          {/* Controls based on question type */}
                          {q.questionType === 'YES_NO' || q.questionType === 'PASS_FAIL' ? (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                type="button"
                                onClick={() => setSimAnswers({ ...simAnswers, [q.id]: true })}
                                style={{
                                  padding: '4px 12px',
                                  borderRadius: 'var(--radius-xs)',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  border: '1px solid var(--border-subtle)',
                                  background: ans === true ? 'var(--color-success)' : 'var(--bg-surface)',
                                  color: ans === true ? '#FFFFFF' : 'var(--text-secondary)',
                                  cursor: 'pointer',
                                }}
                              >
                                {q.questionType === 'YES_NO' ? 'Yes (Pass)' : 'Pass (100%)'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setSimAnswers({ ...simAnswers, [q.id]: false })}
                                style={{
                                  padding: '4px 12px',
                                  borderRadius: 'var(--radius-xs)',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  border: '1px solid var(--border-subtle)',
                                  background: ans === false ? 'var(--color-danger)' : 'var(--bg-surface)',
                                  color: ans === false ? '#FFFFFF' : 'var(--text-secondary)',
                                  cursor: 'pointer',
                                }}
                              >
                                {q.questionType === 'YES_NO' ? 'No (Fail)' : 'Fail (0%)'}
                              </button>
                            </div>
                          ) : q.questionType === 'NUMERIC_0_5' ? (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {[0, 1, 2, 3, 4, 5].map((num) => (
                                <button
                                  key={num}
                                  type="button"
                                  onClick={() => setSimAnswers({ ...simAnswers, [q.id]: num })}
                                  style={{
                                    padding: '3px 10px',
                                    borderRadius: 'var(--radius-xs)',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    border: '1px solid var(--border-subtle)',
                                    background: ans === num ? 'var(--color-primary)' : 'var(--bg-surface)',
                                    color: ans === num ? '#FFFFFF' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {num}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              max={100}
                              placeholder="Score % (0-100)"
                              value={ans || ''}
                              onChange={(e) => setSimAnswers({ ...simAnswers, [q.id]: e.target.value })}
                              className="form-control"
                              style={{ width: '140px', padding: '4px 8px', fontSize: '12px' }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setShowSimulatorModal(false)}>
                Close Simulator
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

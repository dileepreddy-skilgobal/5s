import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { useCachedSettings } from '../../hooks/useTerminology';
import { api, getApiErrorMessage } from '../../services/api';
import { auditPlanningApi, AuditTemplateDetail, QuestionPayload } from '../../services/auditPlanningApi';
import { auditsApi } from '../../services/api-audits';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { AuditTemplateQuestion, AuditTemplateSection, Standard } from '../../types';
import { pillarLabel, pillarVariant, questionTypeLabel, severityLabel, severityVariant } from '../../constants/labels';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/StateViews';
import { Plus, Trash2, Camera, ListChecks, ShieldAlert, Eye, BookOpen, Pencil, ArrowUp, ArrowDown, Send, CopyPlus, Lock } from 'lucide-react';
import { auditTypeLabel } from './templateShared';
import { SectionFormModal } from './SectionFormModal';
import { QuestionFormModal } from './QuestionFormModal';
import { TemplatePreviewModal } from './TemplatePreviewModal';

const iconButtonStyle = (color: string): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  color,
  cursor: 'pointer',
  width: '32px',
  height: '32px',
  borderRadius: 'var(--radius-sm)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

type ConfirmTarget = { kind: 'question'; item: AuditTemplateQuestion } | { kind: 'section'; item: AuditTemplateSection };

export const TemplateBuilderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentTenant, addToast, can } = useApp();
  // Only 5S programme managers change templates; everyone else gets the read-only view
  const canManage = can('PROGRAM_MANAGERS');
  const { formatDate } = useI18n();
  const settings = useCachedSettings();

  const [template, setTemplate] = useState<AuditTemplateDetail | null>(null);
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  // Modals
  const [sectionModal, setSectionModal] = useState<{ open: boolean; section: AuditTemplateSection | null }>({ open: false, section: null });
  const [questionModal, setQuestionModal] = useState<{ open: boolean; question: AuditTemplateQuestion | null }>({ open: false, question: null });
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [publishChangeSummary, setPublishChangeSummary] = useState('');

  const loadData = useCallback(async () => {
    if (!id || !currentTenant) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [tplData, stdData] = await Promise.all([auditPlanningApi.getTemplate(id), api.getStandards()]);
      setTemplate(tplData);
      setStandards(stdData);
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Could not load this audit template.'));
    } finally {
      setLoading(false);
    }
  }, [id, currentTenant]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const versions = template?.versions ?? [];
  const latestVersion = template?.latestVersion ?? versions[0] ?? null;
  // Default to the newest version (the draft, when one exists)
  const activeVersion = versions.find((v) => v.id === selectedVersionId) ?? latestVersion;
  const sections = activeVersion?.sections ?? [];
  const selectedSection = sections.find((s) => s.id === selectedSectionId) ?? sections[0] ?? null;
  const editable = canManage && !!activeVersion && !activeVersion.isPublished;
  const draftExists = !!latestVersion && !latestVersion.isPublished;
  const questionCount = sections.reduce((sum, s) => sum + (s.questions?.length ?? 0), 0);

  // Runs an action, reloads, and reports errors; returns whether it succeeded
  const run = async (action: () => Promise<unknown>, success: { title: string; message: string }, failure: string) => {
    setActionLoading(true);
    try {
      await action();
      addToast({ type: 'success', ...success });
      await loadData();
      return true;
    } catch (err) {
      addToast({ type: 'error', title: failure, message: getApiErrorMessage(err, failure) });
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleSectionSubmit = async (values: { title: string; description: string; category: AuditTemplateSection['category'] }) => {
    if (!id || !activeVersion) return;
    const editing = sectionModal.section;
    const ok = await run(
      () =>
        editing
          ? auditPlanningApi.updateSection(editing.id, values)
          : auditPlanningApi.addSection(id, activeVersion.id, { ...values, sortOrder: sections.length + 1 }),
      { title: editing ? 'Section saved' : 'Section added', message: values.title },
      editing ? 'Could not save section' : 'Could not add section',
    );
    if (ok) setSectionModal({ open: false, section: null });
  };

  const handleMoveSection = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const ordered = [...sections];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setActionLoading(true);
    try {
      // Rewrite every position so sections with equal sort orders end up distinct
      await Promise.all(
        ordered.map((s, i) => (s.sortOrder !== i + 1 ? auditPlanningApi.updateSection(s.id, { sortOrder: i + 1 }) : Promise.resolve(null))),
      );
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not reorder sections', message: getApiErrorMessage(err, 'Could not reorder sections.') });
    } finally {
      setActionLoading(false);
    }
  };

  const handleMoveQuestion = async (index: number, direction: -1 | 1) => {
    if (!selectedSection) return;
    const ordered = [...(selectedSection.questions ?? [])];
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setActionLoading(true);
    try {
      await auditsApi.reorderQuestions(selectedSection.id, ordered.map((q) => q.id));
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not reorder questions', message: getApiErrorMessage(err, 'Could not reorder questions.') });
    } finally {
      setActionLoading(false);
    }
  };

  const handleQuestionSubmit = async (payload: QuestionPayload) => {
    if (!selectedSection) return;
    const editing = questionModal.question;
    const ok = await run(
      () =>
        editing
          ? auditPlanningApi.updateQuestion(editing.id, payload)
          : // The server appends new questions after the last one
            auditPlanningApi.addQuestion(selectedSection.id, payload),
      { title: editing ? 'Question saved' : 'Question added', message: payload.questionCode ?? '' },
      'Could not save question',
    );
    if (ok) setQuestionModal({ open: false, question: null });
  };

  const handleConfirmDelete = async () => {
    if (!confirmTarget) return;
    const ok =
      confirmTarget.kind === 'question'
        ? await run(
            () => api.deleteTemplateQuestion(confirmTarget.item.id),
            { title: 'Question deleted', message: confirmTarget.item.questionCode },
            'Could not delete question',
          )
        : await run(
            () => auditPlanningApi.deleteSection(confirmTarget.item.id),
            { title: 'Section deleted', message: confirmTarget.item.title },
            'Could not delete section',
          );
    if (ok) setConfirmTarget(null);
  };

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !activeVersion) return;
    const ok = await run(
      () => api.publishTemplateVersion(id, activeVersion.id, publishChangeSummary.trim() || undefined),
      { title: 'Version published', message: `Version ${activeVersion.versionNumber} is now used for new audits.` },
      'Could not publish version',
    );
    if (ok) {
      setShowPublishModal(false);
      setPublishChangeSummary('');
    }
  };

  const handleCreateVersion = async () => {
    if (!id) return;
    const ok = await run(
      () => auditPlanningApi.createVersion(id),
      { title: 'Draft version created', message: 'The new draft is a copy of the latest version. Publish it when ready.' },
      'Could not create a new version',
    );
    // Show the new draft
    if (ok) setSelectedVersionId(null);
  };

  if (loading && !template) {
    return (
      <Card>
        <LoadingState label="Loading template…" />
      </Card>
    );
  }
  if (loadError || !template) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <PageHeader title="Audit template" breadcrumbs={[{ label: 'Audit templates', to: '/templates' }, { label: 'Template' }]} />
        <Card>
          <ErrorState message={loadError ?? 'This template could not be loaded.'} onRetry={loadData} />
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        breadcrumbs={[{ label: 'Audit templates', to: '/templates' }, { label: template.name }]}
        title={template.name}
        description={template.description || undefined}
        meta={
          activeVersion ? (
            editable ? (
              <Badge variant="warning" icon={<Pencil size={12} />}>v{activeVersion.versionNumber} draft — editable</Badge>
            ) : (
              <Badge variant="success" icon={<Lock size={12} />}>v{activeVersion.versionNumber} published (read-only)</Badge>
            )
          ) : undefined
        }
        actions={
          <>
            <Button variant="secondary" icon={<Eye size={16} />} onClick={() => setShowPreview(true)} disabled={!activeVersion}>
              Preview
            </Button>
            {!canManage ? null : editable ? (
              <Button variant="primary" icon={<Send size={16} />} onClick={() => setShowPublishModal(true)} disabled={actionLoading}>
                Publish version
              </Button>
            ) : draftExists ? (
              <Button variant="primary" icon={<Pencil size={16} />} onClick={() => setSelectedVersionId(latestVersion?.id ?? null)}>
                Open draft v{latestVersion?.versionNumber}
              </Button>
            ) : (
              <Button variant="primary" icon={<CopyPlus size={16} />} onClick={handleCreateVersion} loading={actionLoading} disabled={actionLoading}>
                Create new version
              </Button>
            )}
          </>
        }
      />

      {/* Template details: code, type, version selector and version state */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0, flex: '1 1 320px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="code-tag">{template.code}</span>
              <Badge variant="neutral">{auditTypeLabel(template.auditType)} audit</Badge>
            </div>
            {versions.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <label htmlFor="builder-version" className="form-label" style={{ margin: 0 }}>
                  Version
                </label>
                <select
                  id="builder-version"
                  className="form-select"
                  value={activeVersion?.id ?? ''}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  style={{ width: 'auto', maxWidth: '100%' }}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.versionNumber} — {v.isPublished ? `published ${formatDate(v.publishedAt)}` : 'draft'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              {activeVersion ? (
                editable ? (
                  'Audits can use this version once it is published.'
                ) : (
                  <>
                    Published {formatDate(activeVersion.publishedAt)}
                    {activeVersion.publisher ? ` by ${activeVersion.publisher.firstName} ${activeVersion.publisher.lastName}` : ''}.
                    {' '}Published versions back completed audits and cannot be changed; create a new version to make changes.
                  </>
                )
              ) : (
                'This template has no versions.'
              )}
            </p>
          </div>

          <dl className="keep-cols" style={{ display: 'flex', gap: '24px', margin: 0 }}>
            <div>
              <dt style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>Sections</dt>
              <dd className="num" style={{ margin: '2px 0 0', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>{sections.length}</dd>
            </div>
            <div>
              <dt style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>Questions</dt>
              <dd className="num" style={{ margin: '2px 0 0', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>{questionCount}</dd>
            </div>
          </dl>
        </div>
      </Card>

      {/* Sections (left) and questions (right); stacks on narrow screens */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 280px', minWidth: 0, maxWidth: '100%' }}>
          <Card
            title="Sections"
            subtitle="Select a section to see its questions."
            actions={
              editable ? (
                <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setSectionModal({ open: true, section: null })}>
                  Add section
                </Button>
              ) : undefined
            }
          >
            {sections.length === 0 ? (
              <EmptyState title="No sections yet" description={editable ? 'Add a section for each 5S pillar you audit.' : undefined} />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sections.map((sec, idx) => {
                  const isSelected = sec.id === selectedSection?.id;
                  const qCount = sec.questions?.length ?? 0;
                  return (
                    <li
                      key={sec.id}
                      style={{
                        borderRadius: 'var(--radius-md)',
                        background: isSelected ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                        border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
                        boxShadow: isSelected ? 'inset 3px 0 0 var(--color-primary)' : undefined,
                        display: 'flex',
                        alignItems: 'stretch',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedSectionId(sec.id)}
                        aria-pressed={isSelected}
                        style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px' }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%' }}>
                          <Badge variant={pillarVariant(sec.category)}>{pillarLabel(sec.category)}</Badge>
                          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                            {qCount} {qCount === 1 ? 'question' : 'questions'}
                          </span>
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '14px', lineHeight: 1.35, color: isSelected ? 'var(--color-primary)' : 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                          {idx + 1}. {sec.title}
                        </span>
                      </button>
                      {editable && (
                        <span style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4px' }}>
                          <button type="button" style={iconButtonStyle('var(--text-secondary)')} aria-label={`Move ${sec.title} up`} disabled={idx === 0 || actionLoading} onClick={() => handleMoveSection(idx, -1)}>
                            <ArrowUp size={14} />
                          </button>
                          <button type="button" style={iconButtonStyle('var(--text-secondary)')} aria-label={`Move ${sec.title} down`} disabled={idx === sections.length - 1 || actionLoading} onClick={() => handleMoveSection(idx, 1)}>
                            <ArrowDown size={14} />
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div style={{ flex: '999 1 520px', minWidth: 0 }}>
          {selectedSection ? (
            <Card
              title={selectedSection.title}
              subtitle={`${pillarLabel(selectedSection.category)} · ${selectedSection.questions?.length ?? 0} ${selectedSection.questions?.length === 1 ? 'question' : 'questions'}`}
              actions={
                editable ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => setSectionModal({ open: true, section: selectedSection })}>
                      Edit section
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setConfirmTarget({ kind: 'section', item: selectedSection })}>
                      Delete section
                    </Button>
                    <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setQuestionModal({ open: true, question: null })}>
                      Add question
                    </Button>
                  </div>
                ) : undefined
              }
            >
              {selectedSection.description && (
                <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: 1.5 }}>{selectedSection.description}</p>
              )}
              {selectedSection.questions?.length ? (
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selectedSection.questions.map((q, qIdx) => {
                    const linkedStd = q.standard ?? standards.find((s) => s.id === q.standardId);
                    return (
                      <li
                        key={q.id}
                        style={{
                          padding: '16px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-surface)',
                          border: `1px solid ${q.isCritical ? 'var(--color-danger-border)' : 'var(--border-subtle)'}`,
                          borderLeft: q.isCritical ? '3px solid var(--color-danger)' : undefined,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span className="code-tag">{q.questionCode}</span>
                            <Badge variant="neutral">{questionTypeLabel(q.questionType)}</Badge>
                            <Badge variant={severityVariant(q.severity)}>{severityLabel(q.severity)}</Badge>
                            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                              Weight <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{q.weightage}</strong>
                            </span>
                            {q.isCritical && (
                              <Badge variant="danger" icon={<ShieldAlert size={12} />}>
                                Critical{q.scoreCapOnFail != null ? ` · cap ${q.scoreCapOnFail}%` : ''}
                              </Badge>
                            )}
                            {q.mandatoryEvidence && <Badge variant="warning" icon={<Camera size={12} />}>Photo required</Badge>}
                          </div>

                          {editable && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                              <button
                                type="button"
                                style={iconButtonStyle('var(--text-secondary)')}
                                aria-label={`Move question ${q.questionCode} up`}
                                disabled={qIdx === 0 || actionLoading}
                                onClick={() => handleMoveQuestion(qIdx, -1)}
                              >
                                <ArrowUp size={16} />
                              </button>
                              <button
                                type="button"
                                style={iconButtonStyle('var(--text-secondary)')}
                                aria-label={`Move question ${q.questionCode} down`}
                                disabled={qIdx === (selectedSection.questions?.length ?? 0) - 1 || actionLoading}
                                onClick={() => handleMoveQuestion(qIdx, 1)}
                              >
                                <ArrowDown size={16} />
                              </button>
                              <button type="button" onClick={() => setQuestionModal({ open: true, question: q })} style={iconButtonStyle('var(--color-primary)')} aria-label={`Edit question ${q.questionCode}`}>
                                <Pencil size={16} />
                              </button>
                              <button type="button" onClick={() => setConfirmTarget({ kind: 'question', item: q })} style={iconButtonStyle('var(--color-danger)')} aria-label={`Delete question ${q.questionCode}`}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </div>

                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                          {qIdx + 1}. {q.questionText}
                        </div>

                        {q.description && (
                          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{q.description}</p>
                        )}

                        {q.questionType === 'MULTIPLE_CHOICE' && (
                          q.options?.length ? (
                            <ul aria-label={`Choices for ${q.questionCode}`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {q.options.map((o, i) => (
                                <li key={`${o.label}-${i}`}>
                                  <Badge variant="neutral">
                                    {o.label} · {o.score}%
                                  </Badge>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div role="note" style={{ fontSize: '13px', color: 'var(--color-warning)' }}>No choices configured; edit the question to add them.</div>
                          )
                        )}

                        {q.referencePhotoUrl && (
                          <div style={{ width: '160px', maxWidth: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                            <ImageWithFallback src={q.referencePhotoUrl} alt={`Reference photo for ${q.questionCode}`} height="100px" allowZoom />
                          </div>
                        )}

                        {(q.guidance || linkedStd) && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {q.guidance && (
                              <div style={{ background: 'var(--bg-pale)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', lineHeight: 1.5 }}>
                                <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Guidance:</strong> {q.guidance}
                              </div>
                            )}
                            {linkedStd && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-primary)', fontWeight: 500, minWidth: 0 }}>
                                <BookOpen size={14} aria-hidden="true" />
                                <span>Standard: {linkedStd.code} — {linkedStd.title}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <EmptyState
                  icon={<ListChecks size={28} />}
                  title="No questions in this section"
                  action={
                    editable ? (
                      <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setQuestionModal({ open: true, question: null })}>
                        Add question
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </Card>
          ) : (
            <Card>
              <EmptyState title={editable ? 'Add a section to start adding questions' : 'This version has no sections'} />
            </Card>
          )}
        </div>
      </div>

      <SectionFormModal
        isOpen={sectionModal.open}
        section={sectionModal.section}
        saving={actionLoading}
        onClose={() => setSectionModal({ open: false, section: null })}
        onSubmit={handleSectionSubmit}
      />

      <QuestionFormModal
        isOpen={questionModal.open}
        question={questionModal.question}
        section={selectedSection}
        standards={standards}
        defaultCap={settings?.scoring?.criticalFailCap ?? 70}
        saving={actionLoading}
        onClose={() => setQuestionModal({ open: false, question: null })}
        onSubmit={handleQuestionSubmit}
      />

      {confirmTarget && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmTarget(null)}
          title={confirmTarget.kind === 'question' ? `Delete question ${confirmTarget.item.questionCode}?` : `Delete section "${confirmTarget.item.title}"?`}
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setConfirmTarget(null)}>Cancel</Button>
              <Button variant="danger" icon={<Trash2 size={16} />} loading={actionLoading} disabled={actionLoading} onClick={handleConfirmDelete}>
                Delete
              </Button>
            </>
          }
        >
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            {confirmTarget.kind === 'section'
              ? `The section and its ${confirmTarget.item.questions?.length ?? 0} question(s) will be removed from this draft.`
              : 'The question will be removed from this draft.'}
          </p>
        </Modal>
      )}

      {showPublishModal && activeVersion && (
        <Modal
          isOpen={true}
          onClose={() => setShowPublishModal(false)}
          title={`Publish version ${activeVersion.versionNumber}`}
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setShowPublishModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="publish-form" icon={<Send size={16} />} loading={actionLoading} disabled={actionLoading || questionCount === 0}>
                Publish
              </Button>
            </>
          }
        >
          <form id="publish-form" onSubmit={handlePublishSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              New audits and new schedules will use this version; existing schedules keep the version they were created with. After publishing it can no longer be edited; to change it later, create a new version.
            </p>
            {questionCount === 0 && (
              <div role="alert" className="form-error" style={{ marginTop: 0 }}>Add at least one question before publishing.</div>
            )}
            <div className="form-group">
              <label className="form-label" htmlFor="publish-summary">What changed</label>
              <textarea
                id="publish-summary"
                rows={3}
                placeholder="e.g. Added shine questions for the paint booth"
                value={publishChangeSummary}
                onChange={(e) => setPublishChangeSummary(e.target.value)}
                className="form-textarea"
              />
            </div>
          </form>
        </Modal>
      )}

      <TemplatePreviewModal version={showPreview ? activeVersion : null} onClose={() => setShowPreview(false)} />
    </div>
  );
};

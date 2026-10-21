import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { api, getApiErrorMessage } from '../../services/api';
import { auditPlanningApi, AuditTemplateDetail } from '../../services/auditPlanningApi';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { SummaryCard, SummaryGrid } from '../../components/ui/SummaryCard';
import { FilterBar, SearchInput } from '../../components/ui/FormField';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/StateViews';
import { FileCheck, Plus, Copy, Trash2, RefreshCw, LayoutGrid, List, Sliders, CheckCircle2, Pencil, FilePen, Eye } from 'lucide-react';
import {
  AUDIT_TYPE_LABELS,
  FieldError,
  TEMPLATE_STATUS_LABELS,
  WEIGHT_KEYS,
  WEIGHT_LABELS,
  auditTypeLabel,
  templateStatusLabel,
  templateStatusVariant,
  usePillarWeighting,
} from './templateShared';
import { TemplateFormModal, TemplateFormValues } from './TemplateFormModal';
import { TemplatePreviewModal } from './TemplatePreviewModal';

const PILLAR_BAR_COLORS = ['var(--color-warning)', 'var(--color-primary)', 'var(--color-success)', 'var(--color-info)', 'var(--color-purple)'];

/** "v1.0 published", plus the newer draft when one is in progress. */
const VersionBadges: React.FC<{ tpl: AuditTemplateDetail }> = ({ tpl }) => {
  const current = tpl.currentVersion;
  const latest = tpl.latestVersion ?? current;
  if (!current && !latest) return <span>—</span>;
  return (
    <span style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap' }}>
      {current?.isPublished && <Badge variant="success">v{current.versionNumber} published</Badge>}
      {latest && !latest.isPublished && <Badge variant="warning">v{latest.versionNumber} draft</Badge>}
    </span>
  );
};

export const AuditTemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentTenant, addToast, can } = useApp();
  const canManage = can('PROGRAM_MANAGERS');
  const pillarWeighted = usePillarWeighting();

  const [templates, setTemplates] = useState<AuditTemplateDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  // Query the API only after typing pauses, not on every keystroke
  const debouncedSearch = useDebouncedValue(search);
  const [selectedAuditType, setSelectedAuditType] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<AuditTemplateDetail | null>(null);
  const [cloneModalTemplate, setCloneModalTemplate] = useState<AuditTemplateDetail | null>(null);
  const [deleteModalTemplate, setDeleteModalTemplate] = useState<AuditTemplateDetail | null>(null);
  const [saving, setSaving] = useState(false);
  // Read-only checklist preview (every role that can open this page)
  const [previewTemplate, setPreviewTemplate] = useState<AuditTemplateDetail | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  // Clone Form State
  const [cloneCode, setCloneCode] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [cloneError, setCloneError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await auditPlanningApi.getTemplates({
        auditType: selectedAuditType !== 'ALL' ? selectedAuditType : undefined,
        status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
        search: debouncedSearch || undefined,
      });
      setTemplates(data);
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Could not load audit templates.'));
    } finally {
      setLoading(false);
    }
  }, [currentTenant, selectedAuditType, selectedStatus, debouncedSearch]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleCreate = async (values: TemplateFormValues) => {
    setSaving(true);
    try {
      const newTpl = await auditPlanningApi.createTemplate({
        code: values.code,
        name: values.name,
        description: values.description || undefined,
        auditType: values.auditType,
        categoryScoringModel: values.weights,
      });
      addToast({ type: 'success', title: 'Template created', message: `${newTpl.name} was created with a draft version 1.0.` });
      setCreateOpen(false);
      navigate(`/templates/${newTpl.id}/builder`);
    } catch (err) {
      addToast({ type: 'error', title: 'Could not create template', message: getApiErrorMessage(err, 'Could not create template.') });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (values: TemplateFormValues) => {
    if (!editTemplate) return;
    setSaving(true);
    try {
      await auditPlanningApi.updateTemplate(editTemplate.id, {
        name: values.name,
        description: values.description,
        auditType: values.auditType,
        status: values.status,
        categoryScoringModel: values.weights,
      });
      addToast({ type: 'success', title: 'Template updated', message: `${values.name} was saved.` });
      setEditTemplate(null);
      await loadTemplates();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not save template', message: getApiErrorMessage(err, 'Could not save template.') });
    } finally {
      setSaving(false);
    }
  };

  const openClone = (tpl: AuditTemplateDetail) => {
    setCloneCode(`${tpl.code}-COPY`);
    setCloneName(`${tpl.name} (copy)`);
    setCloneError(null);
    setCloneModalTemplate(tpl);
  };

  const handleCloneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneModalTemplate) return;
    if (!cloneCode.trim()) {
      setCloneError('Enter a code for the new template.');
      return;
    }
    setCloneError(null);
    setSaving(true);
    try {
      const cloned = await api.cloneAuditTemplate(cloneModalTemplate.id, cloneCode.trim().toUpperCase(), cloneName.trim() || undefined);
      addToast({ type: 'success', title: 'Template copied', message: `${cloned.name} (${cloned.code}) was created as a draft.` });
      setCloneModalTemplate(null);
      navigate(`/templates/${cloned.id}/builder`);
    } catch (err) {
      addToast({ type: 'error', title: 'Could not copy template', message: getApiErrorMessage(err, 'Could not copy template.') });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModalTemplate) return;
    setSaving(true);
    try {
      await api.deleteAuditTemplate(deleteModalTemplate.id);
      addToast({ type: 'success', title: 'Template deleted', message: `${deleteModalTemplate.code} was deleted.` });
      setDeleteModalTemplate(null);
      await loadTemplates();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not delete template', message: getApiErrorMessage(err, 'Could not delete template.') });
    } finally {
      setSaving(false);
    }
  };

  const totalTemplates = templates.length;
  const activeTemplates = templates.filter((t) => t.status === 'ACTIVE').length;
  const draftTemplates = templates.filter((t) => t.status === 'DRAFT').length;
  const totalQuestionsSum = templates.reduce((acc, t) => acc + (t.totalQuestions ?? 0), 0);

  // The list only carries question counts; the preview loads the full checklist
  const openPreview = async (tpl: AuditTemplateDetail) => {
    setPreviewLoadingId(tpl.id);
    try {
      setPreviewTemplate(await auditPlanningApi.getTemplate(tpl.id));
    } catch (err) {
      addToast({ type: 'error', title: 'Could not open the preview', message: getApiErrorMessage(err, 'Could not load the template.') });
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const renderActions = (tpl: AuditTemplateDetail, compact = false) => (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: compact ? 'flex-end' : 'flex-start' }}>
      <Button
        size="sm"
        variant={canManage ? 'ghost' : 'secondary'}
        icon={<Eye size={14} />}
        loading={previewLoadingId === tpl.id}
        disabled={previewLoadingId === tpl.id}
        onClick={() => openPreview(tpl)}
        aria-label={compact ? `Preview ${tpl.code}` : undefined}
      >
        Preview
      </Button>
      {canManage && (
      <>
        <Button size="sm" variant="outline" icon={<Sliders size={14} />} onClick={() => navigate(`/templates/${tpl.id}/builder`)}>
          Open builder
        </Button>
        <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => setEditTemplate(tpl)}>
          Edit details
        </Button>
        <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => openClone(tpl)}>
          Copy
        </Button>
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleteModalTemplate(tpl)} aria-label={`Delete ${tpl.code}`}>
          {compact ? undefined : 'Delete'}
        </Button>
      </>
      )}
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Audit templates"
        description="Checklists auditors fill in: sections per 5S pillar, questions, critical questions and photo requirements."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => loadTemplates()}>
              Refresh
            </Button>
            {canManage && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
                New template
              </Button>
            )}
          </>
        }
      />

      <SummaryGrid>
        <SummaryCard label="Templates" value={totalTemplates} icon={<FileCheck size={18} />} tone="primary" hint="Matching the filters" />
        <SummaryCard label="Active" value={activeTemplates} icon={<CheckCircle2 size={18} />} tone="success" hint="With a published version" />
        <SummaryCard label="Drafts" value={draftTemplates} icon={<FilePen size={18} />} tone="warning" hint="Not yet published" />
        <SummaryCard label="Questions" value={totalQuestionsSum} icon={<Sliders size={18} />} tone="neutral" hint="In the versions audits use" />
      </SummaryGrid>

      <FilterBar label="Filter templates">
        <SearchInput label="Search templates by code or name" placeholder="Search by code or name" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Filter by audit type" value={selectedAuditType} onChange={(e) => setSelectedAuditType(e.target.value)} className="form-select">
          <option value="ALL">All audit types</option>
          {Object.entries(AUDIT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select aria-label="Filter by status" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="form-select">
          <option value="ALL">All statuses</option>
          {Object.entries(TEMPLATE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }} role="group" aria-label="Layout">
          <button type="button" className="pillar-tab-pill" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'}>
            <LayoutGrid size={16} aria-hidden="true" />
            Cards
          </button>
          <button type="button" className="pillar-tab-pill" onClick={() => setViewMode('table')} aria-pressed={viewMode === 'table'}>
            <List size={16} aria-hidden="true" />
            Table
          </button>
        </div>
      </FilterBar>

      {loading ? (
        <Card>
          <LoadingState label="Loading audit templates…" />
        </Card>
      ) : loadError ? (
        <Card>
          <ErrorState message={loadError} onRetry={loadTemplates} />
        </Card>
      ) : templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileCheck size={28} />}
            title={search || selectedAuditType !== 'ALL' || selectedStatus !== 'ALL' ? 'No templates match these filters' : 'No audit templates yet'}
            description="A template defines the sections and questions auditors answer."
            action={
              canManage ? (
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
                  New template
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: '16px' }}>
          {templates.map((tpl) => {
            const activeVer = tpl.currentVersion;
            const secCount = activeVer?.sections?.length ?? 0;
            const scoring = tpl.categoryScoringModel ?? {};

            return (
              <article key={tpl.id} className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px', minWidth: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="code-tag" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tpl.code}</span>
                    <VersionBadges tpl={tpl} />
                  </div>

                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{tpl.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <Badge variant={templateStatusVariant(tpl.status)}>{templateStatusLabel(tpl.status)}</Badge>
                    <Badge variant="neutral">{auditTypeLabel(tpl.auditType)}</Badge>
                  </div>
                  {tpl.description && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {tpl.description}
                    </p>
                  )}
                </div>

                {pillarWeighted && (
                  <div style={{ background: 'var(--bg-surface-subtle)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>Pillar weights</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      {WEIGHT_KEYS.map((k) => `${WEIGHT_LABELS[k].split(' ')[0]} ${scoring[k] ?? '—'}%`).join(' · ')}
                    </div>
                    <div style={{ display: 'flex', height: '6px', borderRadius: 'var(--radius-full)', overflow: 'hidden', gap: '2px' }} aria-hidden="true">
                      {WEIGHT_KEYS.map((k, i) => (
                        <div key={k} style={{ flex: scoring[k] ?? 0, background: PILLAR_BAR_COLORS[i] }} />
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span><strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{secCount}</strong> {secCount === 1 ? 'section' : 'sections'}</span>
                    <span aria-hidden="true">·</span>
                    <span><strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{tpl.totalQuestions ?? 0}</strong> {tpl.totalQuestions === 1 ? 'question' : 'questions'}</span>
                  </div>
                  {renderActions(tpl)}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Card noPadding>
          <div className="enterprise-table-container">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Audit type</th>
                  <th>Version</th>
                  <th className="num">Sections</th>
                  <th className="num">Questions</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl) => (
                  <tr key={tpl.id}>
                    <td><span className="code-tag">{tpl.code}</span></td>
                    <td style={{ minWidth: '220px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tpl.name}</div>
                      {tpl.description && (
                        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>{tpl.description}</div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{auditTypeLabel(tpl.auditType)}</td>
                    <td><VersionBadges tpl={tpl} /></td>
                    <td className="num">{tpl.currentVersion?.sections?.length ?? 0}</td>
                    <td className="num">{tpl.totalQuestions ?? 0}</td>
                    <td><Badge variant={templateStatusVariant(tpl.status)}>{templateStatusLabel(tpl.status)}</Badge></td>
                    <td style={{ textAlign: 'right' }}>{renderActions(tpl, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <TemplatePreviewModal
        version={previewTemplate ? previewTemplate.currentVersion ?? previewTemplate.latestVersion ?? null : null}
        title={previewTemplate ? `${previewTemplate.code} — ${previewTemplate.name}` : undefined}
        onClose={() => setPreviewTemplate(null)}
      />

      <TemplateFormModal isOpen={createOpen} saving={saving} onClose={() => setCreateOpen(false)} onSubmit={handleCreate} />
      <TemplateFormModal isOpen={!!editTemplate} template={editTemplate} saving={saving} onClose={() => setEditTemplate(null)} onSubmit={handleEdit} />

      {cloneModalTemplate && (
        <Modal
          isOpen={true}
          onClose={() => setCloneModalTemplate(null)}
          title={`Copy ${cloneModalTemplate.code}`}
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setCloneModalTemplate(null)}>Cancel</Button>
              <Button variant="primary" type="submit" form="clone-template-form" loading={saving} disabled={saving} icon={<Copy size={16} />}>
                Copy and open builder
              </Button>
            </>
          }
        >
          <form id="clone-template-form" onSubmit={handleCloneSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              The copy gets the sections and questions of the version audits currently use, as a new draft you can edit.
            </p>
            <div className="form-group">
              <label className="form-label" htmlFor="clone-code">
                New template code<span className="required" aria-hidden="true"> *</span>
              </label>
              <input
                id="clone-code"
                type="text"
                value={cloneCode}
                onChange={(e) => setCloneCode(e.target.value)}
                className="form-input"
                aria-invalid={!!cloneError}
                aria-describedby={cloneError ? 'clone-code-error' : undefined}
              />
              <FieldError id="clone-code-error" message={cloneError} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="clone-name">New template name</label>
              <input id="clone-name" type="text" value={cloneName} onChange={(e) => setCloneName(e.target.value)} className="form-input" />
            </div>
          </form>
        </Modal>
      )}

      {deleteModalTemplate && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteModalTemplate(null)}
          title={`Delete ${deleteModalTemplate.code}?`}
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setDeleteModalTemplate(null)}>Cancel</Button>
              <Button variant="danger" loading={saving} disabled={saving} icon={<Trash2 size={16} />} onClick={handleDeleteConfirm}>
                Delete template
              </Button>
            </>
          }
        >
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            {deleteModalTemplate.name} will no longer be available for new audits. Completed audits keep their results.
            Templates used by an active schedule cannot be deleted; to stop using a template but keep it listed, set its status to Deprecated instead.
          </p>
        </Modal>
      )}
    </div>
  );
};

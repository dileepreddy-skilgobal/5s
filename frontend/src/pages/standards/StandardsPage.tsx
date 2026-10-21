import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useApp } from '../../context/AppContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { api, getApiErrorMessage } from '../../services/api';
import { masterDataApi } from '../../services/masterDataApi';
import { Standard, OrgNode, Location } from '../../types';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { SummaryCard, SummaryGrid } from '../../components/ui/SummaryCard';
import { FilterBar, SearchInput } from '../../components/ui/FormField';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { PILLARS, pillarLabel, pillarVariant } from '../../constants/labels';
import {
  EDITABLE_SCOPES,
  PhotoListField,
  isRejected,
  PhotoValue,
  emptyPhoto,
  RulesEditor,
  ScopeTargetField,
  SCOPE_LABELS,
  STANDARD_STATUS_LABELS,
  displayedRevision,
  fieldErrorStyle,
  isHttpUrl,
  pendingRevision,
  photoOf,
  scopeLabel,
  scopeTargetError,
  scopeTargetText,
  standardStatusVariant,
  toReferencePhotos,
} from './standardShared';
import { FileText, Plus, CheckCircle2, Clock, Layers, BookOpen, Image as ImageIcon, Video, ChevronRight, RefreshCw, LayoutGrid, List } from 'lucide-react';

interface CreateForm {
  code: string;
  title: string;
  category: string;
  scopeType: string;
  targetOrgNodeId: string;
  targetLocationId: string;
  description: string;
  rules: string[];
  standardPhotos: PhotoValue[];
  defectPhotos: PhotoValue[];
  videoUrl: string;
  sopDocumentUrl: string;
}

type CreateErrors = Partial<Record<'code' | 'title' | 'description' | 'rules' | 'target' | 'sop' | 'video' | 'photo' | 'form', string>>;

const emptyForm = (): CreateForm => ({
  code: '',
  title: '',
  category: 'S1_SORT',
  scopeType: 'GLOBAL',
  targetOrgNodeId: '',
  targetLocationId: '',
  description: '',
  rules: [''],
  standardPhotos: [emptyPhoto()],
  defectPhotos: [emptyPhoto()],
  videoUrl: '',
  sopDocumentUrl: '',
});

/** Revision badge used in both views: what is in force, or that the first revision awaits approval. */
const RevisionBadge: React.FC<{ std: Standard }> = ({ std }) => {
  const rev = displayedRevision(std);
  if (!rev) return <Badge variant="neutral">No revision</Badge>;
  // A draft whose latest revision was rejected waits for the author to draft a new one
  if (std.status === 'DRAFT' && isRejected(rev) && !pendingRevision(std)) return <Badge variant="danger">Rev {rev.revisionNumber} rejected</Badge>;
  if (std.status === 'DRAFT') return <Badge variant="warning">Rev {rev.revisionNumber} awaiting approval</Badge>;
  if (std.status === 'ARCHIVED') return <Badge variant="neutral">Rev {rev.revisionNumber} (archived)</Badge>;
  return <Badge variant="success">Rev {rev.revisionNumber}</Badge>;
};

export const StandardsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentTenant, addToast, can } = useApp();
  const canAuthor = can('PROGRAM_MANAGERS');

  const [standards, setStandards] = useState<Standard[]>([]);
  const [orgNodes, setOrgNodes] = useState<OrgNode[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters & Controls
  const [search, setSearch] = useState('');
  // Query the API only after typing pauses, not on every keystroke
  const debouncedSearch = useDebouncedValue(search);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedScope, setSelectedScope] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyForm);
  const [errors, setErrors] = useState<CreateErrors>({});

  const loadData = useCallback(async () => {
    if (!currentTenant) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      setStandards(
        await api.getStandards({
          category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
          status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
          scopeType: selectedScope !== 'ALL' ? selectedScope : undefined,
          search: debouncedSearch || undefined,
        }),
      );
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'The standards could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [currentTenant, selectedCategory, selectedStatus, selectedScope, debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = async () => {
    setForm(emptyForm());
    setErrors({});
    setCreateOpen(true);
    // Scope targets are only needed for authoring
    if (orgNodes.length || locations.length) return;
    try {
      const [nodes, locs] = await Promise.all([api.getOrgNodes(), api.getLocations()]);
      setOrgNodes(nodes);
      setLocations(locs);
    } catch (err) {
      setErrors({ form: getApiErrorMessage(err, 'Organization units and locations could not be loaded; only whole-organization standards can be created.') });
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: CreateErrors = {};
    if (!form.code.trim()) next.code = 'Enter a code.';
    if (!form.title.trim()) next.title = 'Enter a title.';
    if (!form.description.trim()) next.description = 'Describe what the standard requires.';
    if (!form.rules.some((r) => r.trim())) next.rules = 'Add at least one rule.';
    const targetError = scopeTargetError(form.scopeType, form.targetOrgNodeId, form.targetLocationId);
    if (targetError) next.target = targetError;
    if (form.sopDocumentUrl.trim() && !isHttpUrl(form.sopDocumentUrl)) next.sop = 'Enter a full link starting with https://.';
    if (form.videoUrl.trim() && !isHttpUrl(form.videoUrl)) next.video = 'Enter a full link starting with https://.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const created = await masterDataApi.createStandard({
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        category: form.category,
        scopeType: form.scopeType,
        targetOrgNodeId: form.targetOrgNodeId || undefined,
        targetLocationId: form.targetLocationId || undefined,
        description: form.description.trim(),
        rules: form.rules.map((r) => r.trim()).filter(Boolean),
        referencePhotos: toReferencePhotos(form.standardPhotos, form.defectPhotos),
        videoUrl: form.videoUrl.trim() || undefined,
        sopDocumentUrl: form.sopDocumentUrl.trim() || undefined,
      });
      addToast({
        type: 'success',
        title: 'Standard saved for approval',
        message: `${created.code} is a draft until a standard approver approves revision 1.0.`,
      });
      setCreateOpen(false);
      navigate(`/standards/${created.id}`);
    } catch (err) {
      const message = getApiErrorMessage(err, 'The standard could not be saved.');
      if (isAxiosError(err) && err.response?.status === 409) setErrors({ code: message });
      else setErrors({ form: message });
    } finally {
      setSaving(false);
    }
  };

  const publishedStandards = standards.filter((s) => s.status === 'PUBLISHED').length;
  const awaitingApproval = standards.filter((s) => pendingRevision(s)).length;
  const coveredPillars = new Set(standards.filter((s) => s.status === 'PUBLISHED').map((s) => s.category)).size;
  const filtersActive = !!search || selectedCategory !== 'ALL' || selectedStatus !== 'ALL' || selectedScope !== 'ALL';
  const clearFilters = () => {
    setSearch('');
    setSelectedCategory('ALL');
    setSelectedStatus('ALL');
    setSelectedScope('ALL');
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="5S standards"
        description="The agreed condition of each area: rules, a standard photo and a defect example. Audit questions can link to a standard."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={loadData} loading={loading && standards.length > 0}>
              Refresh
            </Button>
            {canAuthor && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={openCreate}>
                New standard
              </Button>
            )}
          </>
        }
      />

      <SummaryGrid>
        <SummaryCard icon={<BookOpen size={18} />} tone="primary" label={filtersActive ? 'Standards (filtered)' : 'Standards'} value={standards.length} hint="In this list" />
        <SummaryCard icon={<CheckCircle2 size={18} />} tone="success" label="Published" value={publishedStandards} hint="Approved and in force" />
        <SummaryCard icon={<Clock size={18} />} tone={awaitingApproval ? 'warning' : 'neutral'} label="Awaiting approval" value={awaitingApproval} hint="New standards or revisions to approve" />
        <SummaryCard
          icon={<Layers size={18} />}
          tone="info"
          label="Pillars covered"
          value={
            <>
              {coveredPillars} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-tertiary)' }}>/ {PILLARS.length}</span>
            </>
          }
          hint="Pillars with a published standard"
        />
      </SummaryGrid>

      <FilterBar label="Filter standards">
        <div role="group" aria-label="Filter by pillar" style={{ flex: '1 1 100%', display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
          {[{ id: 'ALL', label: 'All pillars' }, ...PILLARS.map((p) => ({ id: p, label: pillarLabel(p) }))].map((p) => (
            <button key={p.id} type="button" aria-pressed={selectedCategory === p.id} onClick={() => setSelectedCategory(p.id)} className={`pillar-tab-pill ${selectedCategory === p.id ? 'active' : ''}`}>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        <SearchInput label="Search standards" placeholder="Search by code or title" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Scope" value={selectedScope} onChange={(e) => setSelectedScope(e.target.value)} className="form-select">
          <option value="ALL">All scopes</option>
          {EDITABLE_SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
        </select>
        <select aria-label="Status" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="form-select">
          <option value="ALL">All statuses</option>
          {(Object.keys(STANDARD_STATUS_LABELS) as Standard['status'][]).map((s) => <option key={s} value={s}>{STANDARD_STATUS_LABELS[s]}</option>)}
        </select>
        {filtersActive && <Button variant="ghost" onClick={clearFilters} style={{ flex: '0 0 auto' }}>Clear filters</Button>}
        <div role="group" aria-label="View" style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: '0 0 auto' }}>
          {([
            { id: 'grid', label: 'Cards', icon: <LayoutGrid size={16} /> },
            { id: 'table', label: 'Table', icon: <List size={16} /> },
          ] as const).map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={viewMode === v.id}
              aria-label={`${v.label} view`}
              title={`${v.label} view`}
              onClick={() => setViewMode(v.id)}
              className={`pillar-tab-pill${viewMode === v.id ? ' active' : ''}`}
              style={{ width: '40px', height: '40px', padding: 0, justifyContent: 'center' }}
            >
              {v.icon}
            </button>
          ))}
        </div>
      </FilterBar>

      {loading && standards.length === 0 ? (
        <Card><LoadingState label="Loading standards…" /></Card>
      ) : loadError ? (
        <Card><ErrorState message={loadError} onRetry={loadData} /></Card>
      ) : standards.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen size={28} />}
            title={filtersActive ? 'No standards match these filters' : 'No standards yet'}
            description={filtersActive ? 'Change or clear the filters.' : 'Write down the agreed condition of an area: rules, a standard photo and a defect example.'}
            action={
              filtersActive ? (
                <Button size="sm" variant="secondary" onClick={clearFilters}>Clear filters</Button>
              ) : canAuthor ? (
                <Button size="sm" icon={<Plus size={16} />} onClick={openCreate}>New standard</Button>
              ) : undefined
            }
          />
        </Card>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: '16px' }}>
          {standards.map((std) => {
            const rev = displayedRevision(std);
            const stdPhoto = photoOf(rev, 'STANDARD_CONDITION');
            const defectPhoto = photoOf(rev, 'CURRENT_CONDITION');
            const rulesCount = rev?.rules?.length ?? 0;
            return (
              <Link key={std.id} to={`/standards/${std.id}`} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="code-tag" style={{ whiteSpace: 'nowrap' }}>{std.code}</span>
                      <Badge variant={pillarVariant(std.category)}>{pillarLabel(std.category)}</Badge>
                    </div>
                    <RevisionBadge std={std} />
                  </div>
                  <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '4px 0 2px 0', lineHeight: 1.4 }}>{std.title}</h2>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>{scopeTargetText(std)}</div>
                </div>

                <div className="keep-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '140px', background: 'var(--bg-surface-subtle)' }}>
                  <ImageWithFallback src={stdPhoto?.photoUrl} alt={`Standard condition of ${std.title}`} badgeText={stdPhoto ? 'Standard' : undefined} badgeVariant="success" enableLightbox={false} containerStyle={{ borderRadius: 0, border: 'none', borderRight: '1px solid var(--border-subtle)' }} />
                  <ImageWithFallback src={defectPhoto?.photoUrl} alt={`Defect example for ${std.title}`} badgeText={defectPhoto ? 'Defect' : undefined} badgeVariant="danger" enableLightbox={false} containerStyle={{ borderRadius: 0, border: 'none' }} />
                </div>

                <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: '13px', color: rev?.description ? 'var(--text-secondary)' : 'var(--text-tertiary)', margin: '0 0 12px 0', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {rev?.description || 'No description'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px', color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span><strong>{rulesCount}</strong> {rulesCount === 1 ? 'rule' : 'rules'}</span>
                      {rev?.sopDocumentUrl && <span>• SOP</span>}
                      {rev?.videoUrl && <span>• Video</span>}
                    </div>
                    <span style={{ display: 'flex', alignItems: 'center', color: 'var(--color-primary)', fontWeight: 600 }}>
                      Open <ChevronRight size={14} aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </Link>
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
                  <th>Title</th>
                  <th>Pillar</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Revision</th>
                  <th className="num">Rules</th>
                  <th>Media</th>
                </tr>
              </thead>
              <tbody>
                {standards.map((std) => {
                  const rev = displayedRevision(std);
                  return (
                    <tr key={std.id}>
                      <td style={{ whiteSpace: 'nowrap' }}><span className="code-tag">{std.code}</span></td>
                      <td style={{ minWidth: '200px' }}>
                        <Link to={`/standards/${std.id}`} style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{std.title}</Link>
                        {rev?.description && (
                          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rev.description}</div>
                        )}
                      </td>
                      <td><Badge variant={pillarVariant(std.category)}>{pillarLabel(std.category)}</Badge></td>
                      <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{scopeLabel(std.scopeType)}</td>
                      <td><Badge variant={standardStatusVariant(std.status)}>{STANDARD_STATUS_LABELS[std.status] ?? std.status}</Badge></td>
                      <td><RevisionBadge std={std} /></td>
                      <td className="num">{rev?.rules?.length ?? 0}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', color: 'var(--text-secondary)' }}>
                          {rev?.referencePhotos?.length ? <span title="Photos"><ImageIcon size={16} aria-hidden="true" /><span className="sr-only">Has photos</span></span> : null}
                          {rev?.sopDocumentUrl ? <span title="SOP"><FileText size={16} aria-hidden="true" /><span className="sr-only">Has SOP</span></span> : null}
                          {rev?.videoUrl ? <span title="Video"><Video size={16} aria-hidden="true" /><span className="sr-only">Has video</span></span> : null}
                          {!rev?.referencePhotos?.length && !rev?.sopDocumentUrl && !rev?.videoUrl && <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        isOpen={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="New standard"
        subtitle="The standard is saved as a draft. It is published when a standard approver approves it."
        maxWidth="680px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" type="submit" form="standard-create-form" loading={saving}>Save for approval</Button>
          </>
        }
      >
        <form id="standard-create-form" onSubmit={handleCreateSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="grid-auto" style={{ ['--min' as string]: '220px', gap: '14px' } as React.CSSProperties}>
            <div className="form-group">
              <label className="form-label" htmlFor="std-code">Code <span className="required">*</span></label>
              <input id="std-code" type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="form-input" aria-invalid={!!errors.code} aria-describedby={errors.code ? 'std-code-error' : undefined} />
              {errors.code && <div id="std-code-error" className="form-error" style={fieldErrorStyle}>{errors.code}</div>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="std-category">Pillar <span className="required">*</span></label>
              <select id="std-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="form-select">
                {PILLARS.map((p) => <option key={p} value={p}>{pillarLabel(p)}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="std-title">Title <span className="required">*</span></label>
            <input id="std-title" type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="form-input" aria-invalid={!!errors.title} aria-describedby={errors.title ? 'std-title-error' : undefined} />
            {errors.title && <div id="std-title-error" className="form-error" style={fieldErrorStyle}>{errors.title}</div>}
          </div>

          <div className="grid-auto" style={{ ['--min' as string]: '220px', gap: '14px' } as React.CSSProperties}>
            <div className="form-group">
              <label className="form-label" htmlFor="std-scope">Applies to</label>
              <select id="std-scope" value={form.scopeType} onChange={(e) => setForm({ ...form, scopeType: e.target.value, targetOrgNodeId: '', targetLocationId: '' })} className="form-select">
                {EDITABLE_SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
              </select>
            </div>
            <ScopeTargetField
              id="std-target"
              scope={form.scopeType}
              orgNodes={orgNodes}
              locations={locations}
              targetOrgNodeId={form.targetOrgNodeId}
              targetLocationId={form.targetLocationId}
              onChange={(t) => setForm({ ...form, ...t })}
              error={errors.target}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="std-description">Description <span className="required">*</span></label>
            <textarea id="std-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="form-textarea" aria-invalid={!!errors.description} aria-describedby={errors.description ? 'std-description-error' : undefined} />
            {errors.description && <div id="std-description-error" className="form-error" style={fieldErrorStyle}>{errors.description}</div>}
          </div>

          <RulesEditor idPrefix="std-create" rules={form.rules} onChange={(rules) => setForm({ ...form, rules })} error={errors.rules} />

          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <div className="form-section-title" style={{ margin: '0 0 12px', borderBottom: 'none', paddingBottom: 0 }}>Photos (optional, several per kind)</div>
            <div className="grid-auto" style={{ ['--min' as string]: '220px', gap: '14px', alignItems: 'start' } as React.CSSProperties}>
              <PhotoListField id="std-photo-standard" label="Standard condition" tone="success" values={form.standardPhotos} onChange={(v) => setForm((f) => ({ ...f, standardPhotos: v }))} onError={(m) => setErrors((x) => ({ ...x, photo: m ?? undefined }))} />
              <PhotoListField id="std-photo-defect" label="Defect example" tone="danger" values={form.defectPhotos} onChange={(v) => setForm((f) => ({ ...f, defectPhotos: v }))} onError={(m) => setErrors((x) => ({ ...x, photo: m ?? undefined }))} />
            </div>
            {errors.photo && <div role="alert" className="form-error" style={fieldErrorStyle}>{errors.photo}</div>}
          </div>

          <div className="grid-auto" style={{ ['--min' as string]: '220px', gap: '14px' } as React.CSSProperties}>
            <div className="form-group">
              <label className="form-label" htmlFor="std-sop">SOP document link</label>
              <input id="std-sop" type="url" placeholder="https://" value={form.sopDocumentUrl} onChange={(e) => setForm({ ...form, sopDocumentUrl: e.target.value })} className="form-input" aria-invalid={!!errors.sop} aria-describedby={errors.sop ? 'std-sop-error' : undefined} />
              {errors.sop && <div id="std-sop-error" className="form-error" style={fieldErrorStyle}>{errors.sop}</div>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="std-video">Video link</label>
              <input id="std-video" type="url" placeholder="https://" value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} className="form-input" aria-invalid={!!errors.video} aria-describedby={errors.video ? 'std-video-error' : undefined} />
              {errors.video && <div id="std-video-error" className="form-error" style={fieldErrorStyle}>{errors.video}</div>}
            </div>
          </div>

          {errors.form && <p role="alert" className="form-error" style={{ margin: 0 }}>{errors.form}</p>}
        </form>
      </Modal>
    </div>
  );
};

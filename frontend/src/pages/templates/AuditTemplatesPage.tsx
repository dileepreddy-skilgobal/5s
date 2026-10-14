import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { AuditTemplate } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import {
  FileCheck,
  Plus,
  Search,
  Filter,
  Copy,
  Trash2,
  Lock,
  Layers,
  Sparkles,
  ChevronRight,
  RefreshCw,
  LayoutGrid,
  List,
  AlertTriangle,
  Clock,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

export const AuditTemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentTenant, addToast } = useApp();

  const [templates, setTemplates] = useState<AuditTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedAuditType, setSelectedAuditType] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modals & Drawers
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [cloneModalTemplate, setCloneModalTemplate] = useState<AuditTemplate | null>(null);
  const [deleteModalTemplate, setDeleteModalTemplate] = useState<AuditTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  // Create Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    auditType: 'ROUTINE',
    categoryWeights: {
      S1: 20,
      S2: 20,
      S3: 20,
      S4: 20,
      S5: 20,
    },
  });

  // Clone Form State
  const [cloneCode, setCloneCode] = useState('');
  const [cloneName, setCloneName] = useState('');

  const loadTemplates = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getAuditTemplates({
        auditType: selectedAuditType !== 'ALL' ? selectedAuditType : undefined,
        status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
        search: search || undefined,
      });
      setTemplates(data);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error Loading Templates',
        message: err?.response?.data?.message || 'Could not load audit templates.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [currentTenant, selectedAuditType, selectedStatus, search]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) return;
    setSaving(true);
    try {
      const totalWeight = Object.values(formData.categoryWeights).reduce((a, b) => a + b, 0);
      if (totalWeight !== 100) {
        addToast({
          type: 'warning',
          title: 'Weightage Mismatch',
          message: `Category weightings total ${totalWeight}%. Recommended target is 100%.`,
        });
      }

      const newTpl = await api.createAuditTemplate({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        description: formData.description.trim(),
        auditType: formData.auditType,
        categoryScoringModel: formData.categoryWeights,
      });

      addToast({
        type: 'success',
        title: 'Template Created',
        message: `Template '${newTpl.name}' created with initial v1.0 draft.`,
      });

      setCreateDrawerOpen(false);
      setFormData({
        code: '',
        name: '',
        description: '',
        auditType: 'ROUTINE',
        categoryWeights: { S1: 20, S2: 20, S3: 20, S4: 20, S5: 20 },
      });
      navigate(`/templates/${newTpl.id}/builder`);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Creation Failed',
        message: err?.response?.data?.message || 'Could not create template.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCloneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneModalTemplate || !cloneCode) return;
    setSaving(true);
    try {
      const cloned = await api.cloneAuditTemplate(cloneModalTemplate.id, cloneCode.trim().toUpperCase(), cloneName.trim());
      addToast({
        type: 'success',
        title: 'Template Cloned',
        message: `Cloned into '${cloned.name}' (${cloned.code}) with all sections and questions.`,
      });
      setCloneModalTemplate(null);
      navigate(`/templates/${cloned.id}/builder`);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Clone Failed',
        message: err?.response?.data?.message || 'Could not clone template.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModalTemplate) return;
    try {
      await api.deleteAuditTemplate(deleteModalTemplate.id);
      addToast({
        type: 'success',
        title: 'Template Deleted',
        message: `Audit template '${deleteModalTemplate.code}' deleted.`,
      });
      setDeleteModalTemplate(null);
      await loadTemplates();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Delete Failed',
        message: err?.response?.data?.message || 'Could not delete template.',
      });
    }
  };

  // Metrics
  const totalTemplates = templates.length;
  const activeTemplates = templates.filter((t) => t.status === 'ACTIVE').length;
  const routineTemplates = templates.filter((t) => t.auditType === 'ROUTINE').length;
  const totalQuestionsSum = templates.reduce((acc, t) => acc + (t.totalQuestions || 0), 0);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner & Action Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="code-tag" style={{ background: 'var(--color-primary)', color: '#FFFFFF', padding: '2px 8px', borderRadius: 'var(--radius-xs)', fontSize: '11px', fontWeight: 700 }}>
              Template Engine
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Configurable Inspection Forms & Question Banks
            </span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            5S Audit Templates & Inspection Engine
          </h1>
        </div>

        <div className="page-header-actions">
          <Button
            variant="secondary"
            icon={<RefreshCw size={15} />}
            onClick={() => loadTemplates()}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setCreateDrawerOpen(true)}
          >
            Create Audit Template
          </Button>
        </div>
      </div>

      {/* Friendly Section Explainer Banner */}
      <div className="section-intro-banner">
        <div className="section-intro-content">
          <div className="section-intro-icon">
            <FileCheck size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px 0' }}>
              Standardized 5S Audit Blueprints & Scoring Engine
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
              Build inspection templates with custom 1S–5S category weights, tiered scoring rubrics, photo-evidence verification, and critical safety caps across your facilities.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={14} />}
            onClick={() => setCreateDrawerOpen(true)}
          >
            New Template
          </Button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="metric-card accent-primary">
          <div className="metric-header">
            <div className="metric-label">Total Templates</div>
            <div className="metric-icon primary">
              <FileCheck size={16} />
            </div>
          </div>
          <div className="metric-value">{totalTemplates}</div>
          <div className="metric-subtext">Inspection form blueprints</div>
        </div>

        <div className="metric-card accent-success">
          <div className="metric-header">
            <div className="metric-label">Active in Production</div>
            <div className="metric-icon success">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="metric-value" style={{ color: 'var(--color-success)' }}>
            {activeTemplates}
          </div>
          <div className="metric-subtext">Published snapshot versions</div>
        </div>

        <div className="metric-card accent-info">
          <div className="metric-header">
            <div className="metric-label">Routine 5S Templates</div>
            <div className="metric-icon info">
              <Clock size={16} />
            </div>
          </div>
          <div className="metric-value" style={{ color: 'var(--color-info)' }}>
            {routineTemplates}
          </div>
          <div className="metric-subtext">Operational daily & weekly audits</div>
        </div>

        <div className="metric-card accent-purple">
          <div className="metric-header">
            <div className="metric-label">Configured Question Bank</div>
            <div className="metric-icon purple">
              <Sliders size={16} />
            </div>
          </div>
          <div className="metric-value" style={{ color: 'var(--color-purple)' }}>
            {totalQuestionsSum}
          </div>
          <div className="metric-subtext">Weighted check questions</div>
        </div>
      </div>

      {/* Filter & View Toolbar */}
      <Card noPadding>
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '300px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)',
                }}
              />
              <input
                type="text"
                placeholder="Search template by code (e.g. TPL-5S-DISCRETE) or title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '36px' }}
              />
            </div>

            {/* Audit Type Filter */}
            <select
              value={selectedAuditType}
              onChange={(e) => setSelectedAuditType(e.target.value)}
              className="form-select"
              style={{ width: '180px' }}
            >
              <option value="ALL">All Audit Types</option>
              <option value="ROUTINE">Routine Audit</option>
              <option value="SELF">Self Audit</option>
              <option value="LAYERED">Layered Audit</option>
              <option value="CROSS_FUNCTIONAL">Cross-Functional</option>
              <option value="MANAGEMENT">Management Walk</option>
              <option value="SURPRISE">Surprise Audit</option>
              <option value="CERTIFICATION">Certification</option>
              <option value="CAMPAIGN">Campaign Blitz</option>
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="form-select"
              style={{ width: '140px' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="DEPRECATED">Deprecated</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                padding: '7px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: viewMode === 'grid' ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                color: viewMode === 'grid' ? 'var(--color-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
              title="Grid Cards View"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '7px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: viewMode === 'table' ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                color: viewMode === 'table' ? 'var(--color-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
              title="Detailed Table View"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </Card>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={28} className="spin-animation" style={{ marginBottom: '12px' }} />
          <div>Loading audit templates registry...</div>
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
              }}
            >
              <FileCheck size={30} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              No Audit Templates Configured
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 20px auto' }}>
              Create inspection templates with custom sections, question scoring models, and critical safety caps.
            </p>
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => setCreateDrawerOpen(true)}
            >
              Create First Audit Template
            </Button>
          </div>
        </Card>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {templates.map((tpl) => {
            const activeVer = tpl.currentVersion || tpl.versions?.[0];
            const secCount = activeVer?.sections?.length || 0;
            const scoring = tpl.categoryScoringModel || { S1: 20, S2: 20, S3: 20, S4: 20, S5: 20 };

            return (
              <div
                key={tpl.id}
                className="card"
                style={{
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/templates/${tpl.id}/builder`)}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="code-tag">{tpl.code}</span>
                      <Badge variant="neutral">{tpl.auditType}</Badge>
                    </div>
                    <Badge variant={activeVer?.isPublished ? 'success' : 'warning'}>
                      v{activeVer?.versionNumber || '1.0'} {activeVer?.isPublished ? 'Live' : 'Draft'}
                    </Badge>
                  </div>

                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 6px 0' }}>
                    {tpl.name}
                  </h3>

                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {tpl.description || 'Configurable 5S inspection template with multi-tier scoring rules.'}
                  </p>
                </div>

                {/* Category Weight Mini-Bar */}
                <div style={{ background: 'var(--bg-surface-subtle)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>5S SCORING WEIGHTS</span>
                    <span>1S: {scoring.S1 || 20}% • 2S: {scoring.S2 || 20}% • 3S: {scoring.S3 || 20}% • 4S: {scoring.S4 || 20}% • 5S: {scoring.S5 || 20}%</span>
                  </div>
                  <div style={{ display: 'flex', height: '6px', borderRadius: 'var(--radius-full)', overflow: 'hidden', gap: '2px' }}>
                    <div style={{ flex: scoring.S1 || 20, background: '#D97706' }} title="1S Sort" />
                    <div style={{ flex: scoring.S2 || 20, background: '#2563EB' }} title="2S Set In Order" />
                    <div style={{ flex: scoring.S3 || 20, background: '#0D9488' }} title="3S Shine" />
                    <div style={{ flex: scoring.S4 || 20, background: '#6366F1' }} title="4S Standardize" />
                    <div style={{ flex: scoring.S5 || 20, background: '#8B5CF6' }} title="5S Sustain" />
                  </div>
                </div>

                {/* Footer Strip */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <span><strong>{secCount}</strong> Sections</span>
                    <span>•</span>
                    <span><strong>{tpl.totalQuestions || 0}</strong> Questions</span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Copy size={13} />}
                      onClick={() => {
                        setCloneCode(`${tpl.code}-COPY`);
                        setCloneName(`${tpl.name} (Copy)`);
                        setCloneModalTemplate(tpl);
                      }}
                      title="Clone Template"
                    >
                      Clone
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Sliders size={13} />}
                      onClick={() => navigate(`/templates/${tpl.id}/builder`)}
                    >
                      Visual Builder
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <Card noPadding>
          <div className="enterprise-table-container">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Template Code</th>
                  <th>Template Name & Purpose</th>
                  <th>Audit Type</th>
                  <th>Active Version</th>
                  <th>Sections</th>
                  <th>Questions</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl) => {
                  const activeVer = tpl.currentVersion || tpl.versions?.[0];
                  return (
                    <tr
                      key={tpl.id}
                      onClick={() => navigate(`/templates/${tpl.id}/builder`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td><span className="code-tag">{tpl.code}</span></td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                          {tpl.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {tpl.description || 'Inspection template definition'}
                        </div>
                      </td>
                      <td><Badge variant="neutral">{tpl.auditType}</Badge></td>
                      <td>
                        <Badge variant={activeVer?.isPublished ? 'success' : 'warning'}>
                          v{activeVer?.versionNumber || '1.0'} {activeVer?.isPublished ? '(Live)' : '(Draft)'}
                        </Badge>
                      </td>
                      <td><strong>{activeVer?.sections?.length || 0}</strong></td>
                      <td><strong>{tpl.totalQuestions || 0}</strong></td>
                      <td><Badge variant="success">{tpl.status}</Badge></td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Copy size={13} />}
                            onClick={() => {
                              setCloneCode(`${tpl.code}-COPY`);
                              setCloneName(`${tpl.name} (Copy)`);
                              setCloneModalTemplate(tpl);
                            }}
                          >
                            Clone
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            icon={<Sliders size={13} />}
                            onClick={() => navigate(`/templates/${tpl.id}/builder`)}
                          >
                            Builder
                          </Button>
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

      {/* Create Template Modal */}
      <Modal
        isOpen={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        title="Create 5S Audit Template Blueprint"
        subtitle="Define audit type, name, description, and pillar scoring weight matrix"
        maxWidth="640px"
      >
        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Template Code *</label>
              <input
                type="text"
                placeholder="e.g. TPL-5S-DISCRETE-01"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="form-control"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Audit Type *</label>
              <select
                value={formData.auditType}
                onChange={(e) => setFormData({ ...formData, auditType: e.target.value })}
                className="form-control"
                required
              >
                <option value="ROUTINE">Routine 5S Audit (Weekly / Monthly)</option>
                <option value="SELF">Self-Audit (Daily Operator 5S)</option>
                <option value="LAYERED">Layered Process Audit (LPA)</option>
                <option value="CROSS_FUNCTIONAL">Cross-Functional Audit</option>
                <option value="MANAGEMENT">Management Walk / Gemba</option>
                <option value="SURPRISE">Surprise / Unannounced Audit</option>
                <option value="CERTIFICATION">5S Level Certification</option>
                <option value="CAMPAIGN">Kaizen Campaign Blitz</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Template Name *</label>
            <input
              type="text"
              placeholder="e.g. Precision Machining & Assembly Comprehensive 5S Audit"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="form-control"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Template Purpose & Scope</label>
            <textarea
              rows={3}
              placeholder="Describe what areas this template targets and instructions for auditors..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="form-control"
            />
          </div>

          {/* 5S Category Scoring Weighting Matrix */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              5S Pillar Category Scoring Weights
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
              Define default percentage weight contribution per 5S pillar category (Target sum: 100%).
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
              {(['S1', 'S2', 'S3', 'S4', 'S5'] as const).map((k, idx) => {
                const labels = ['1S Sort', '2S Set In Order', '3S Shine', '4S Standardize', '5S Sustain'];
                return (
                  <div key={k} className="form-group" style={{ textAlign: 'center' }}>
                    <label className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>
                      {labels[idx]}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.categoryWeights[k]}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setFormData({
                          ...formData,
                          categoryWeights: { ...formData.categoryWeights, [k]: val },
                        });
                      }}
                      className="form-control"
                      style={{ textAlign: 'center', fontWeight: 700 }}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>%</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <Button variant="secondary" onClick={() => setCreateDrawerOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving} icon={<Sliders size={15} />}>
              Create & Open Builder
            </Button>
          </div>
        </form>
      </Modal>

      {/* Clone Template Modal */}
      {cloneModalTemplate && (
        <Modal
          isOpen={true}
          onClose={() => setCloneModalTemplate(null)}
          title={`Clone Template: ${cloneModalTemplate.code}`}
        >
          <form onSubmit={handleCloneSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              Duplicating this template will copy all sections, questions, weightings, guidance notes, and critical safety caps into a new editable draft.
            </p>

            <div className="form-group">
              <label className="form-label">New Template Code *</label>
              <input
                type="text"
                value={cloneCode}
                onChange={(e) => setCloneCode(e.target.value)}
                className="form-control"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">New Template Name</label>
              <input
                type="text"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                className="form-control"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <Button variant="secondary" onClick={() => setCloneModalTemplate(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={saving} icon={<Copy size={14} />}>
                Clone & Launch Builder
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

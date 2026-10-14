import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Standard, OrgNode, Location } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import {
  FileText,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  ExternalLink,
  BookOpen,
  Image as ImageIcon,
  Video,
  ChevronRight,
  RefreshCw,
  LayoutGrid,
  List,
  ShieldCheck,
  AlertTriangle,
  Trash2,
  Printer,
  Eye,
} from 'lucide-react';
import { FIVE_S_IMAGES } from '../../constants/images';

export const StandardsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentTenant, addToast } = useApp();

  const [standards, setStandards] = useState<Standard[]>([]);
  const [orgNodes, setOrgNodes] = useState<OrgNode[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Controls
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedScope, setSelectedScope] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modals & Drawers
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [deleteModalStandard, setDeleteModalStandard] = useState<Standard | null>(null);
  const [saving, setSaving] = useState(false);

  // Form State for new standard
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    category: 'S1_SORT',
    scopeType: 'GLOBAL',
    targetOrgNodeId: '',
    targetLocationId: '',
    description: '',
    rules: [
      'Workstations must be cleared of all non-essential tooling and unlabelled materials.',
      'Obsolete parts and unapproved scrap must be moved to the Red Tag holding area.',
    ],
    standardPhotoUrl: '/assets/5s/shadow_board_std.jpg',
    currentPhotoUrl: '/assets/5s/shadow_board_clutter.jpg',
    videoUrl: '',
    sopDocumentUrl: 'https://docs.skilglobal.com/sop-5s-standard.pdf',
    publishDirectly: true,
  });

  const loadData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const [standardsData, orgData, locData] = await Promise.all([
        api.getStandards({
          category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
          status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
          scopeType: selectedScope !== 'ALL' ? selectedScope : undefined,
          search: search || undefined,
        }),
        api.getOrgNodes(),
        api.getLocations(),
      ]);
      setStandards(standardsData);
      setOrgNodes(orgData);
      setLocations(locData);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error Loading Standards',
        message: err?.response?.data?.message || 'Could not load 5S visual standards library.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentTenant, selectedCategory, selectedStatus, selectedScope, search]);

  const handleAddRule = () => {
    setFormData((prev) => ({ ...prev, rules: [...prev.rules, ''] }));
  };

  const handleRuleChange = (index: number, val: string) => {
    const updated = [...formData.rules];
    updated[index] = val;
    setFormData((prev) => ({ ...prev, rules: updated }));
  };

  const handleRemoveRule = (index: number) => {
    if (formData.rules.length <= 1) return;
    const updated = formData.rules.filter((_, i) => i !== index);
    setFormData((prev) => ({ ...prev, rules: updated }));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.title || !formData.description) return;
    setSaving(true);
    try {
      const payload = {
        code: formData.code.trim().toUpperCase(),
        title: formData.title.trim(),
        category: formData.category,
        scopeType: formData.scopeType,
        targetOrgNodeId: formData.targetOrgNodeId || undefined,
        targetLocationId: formData.targetLocationId || undefined,
        description: formData.description,
        rules: formData.rules.filter((r) => r.trim().length > 0),
        referencePhotos: [
          {
            type: 'STANDARD_CONDITION',
            photoUrl: formData.standardPhotoUrl,
            label: 'Standard Target Condition (Compliant)',
            description: 'Clear demarcations, tools arranged on shadow board, clean surface.',
          },
          {
            type: 'CURRENT_CONDITION',
            photoUrl: formData.currentPhotoUrl,
            label: 'Defect Example / Non-compliance',
            description: 'Loose cables, unlabelled containers, and accumulated clutter.',
          },
        ],
        videoUrl: formData.videoUrl || undefined,
        sopDocumentUrl: formData.sopDocumentUrl || undefined,
      };

      const newStd = await api.createStandard(payload);
      addToast({
        type: 'success',
        title: 'Visual Standard Published',
        message: `Standard '${newStd.title}' (${newStd.code}) created with baseline Rev 1.0 snapshot.`,
      });

      setCreateDrawerOpen(false);
      setFormData({
        code: '',
        title: '',
        category: 'S1_SORT',
        scopeType: 'GLOBAL',
        targetOrgNodeId: '',
        targetLocationId: '',
        description: '',
        rules: [
          'Workstations must be cleared of all non-essential tooling and unlabelled materials.',
          'Obsolete parts and unapproved scrap must be moved to the Red Tag holding area.',
        ],
        standardPhotoUrl: FIVE_S_IMAGES.standards.shadowBoardStandard,
        currentPhotoUrl: FIVE_S_IMAGES.standards.shadowBoardClutter,
        videoUrl: '',
        sopDocumentUrl: 'https://docs.skilglobal.com/sop-5s-standard.pdf',
        publishDirectly: true,
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Publication Failed',
        message: err?.response?.data?.message || 'Could not publish standard.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModalStandard) return;
    try {
      await api.deleteStandard(deleteModalStandard.id);
      addToast({
        type: 'success',
        title: 'Standard Removed',
        message: `Standard '${deleteModalStandard.code}' has been removed from library.`,
      });
      setDeleteModalStandard(null);
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Delete Failed',
        message: err?.response?.data?.message || 'Could not remove standard.',
      });
    }
  };

  // 6 Pillars Metadata
  const categoryPillars = [
    { id: 'ALL', label: 'All Pillars', count: standards.length },
    { id: 'S1_SORT', label: '1S - Sort', badgeVariant: 'warning' as const },
    { id: 'S2_SET_IN_ORDER', label: '2S - Set in Order', badgeVariant: 'purple' as const },
    { id: 'S3_SHINE', label: '3S - Shine', badgeVariant: 'info' as const },
    { id: 'S4_STANDARDIZE', label: '4S - Standardize', badgeVariant: 'neutral' as const },
    { id: 'S5_SUSTAIN', label: '5S - Sustain', badgeVariant: 'success' as const },
    { id: 'S6_SAFETY', label: '6S - Safety', badgeVariant: 'danger' as const },
  ];

  const getPillarBadge = (cat: string) => {
    switch (cat) {
      case 'S1_SORT':
        return <Badge variant="warning">1S Sort</Badge>;
      case 'S2_SET_IN_ORDER':
        return <Badge variant="purple">2S Set In Order</Badge>;
      case 'S3_SHINE':
        return <Badge variant="info">3S Shine</Badge>;
      case 'S4_STANDARDIZE':
        return <Badge variant="neutral">4S Standardize</Badge>;
      case 'S5_SUSTAIN':
        return <Badge variant="success">5S Sustain</Badge>;
      case 'S6_SAFETY':
        return <Badge variant="danger">6S Safety</Badge>;
      default:
        return <Badge variant="neutral">{cat}</Badge>;
    }
  };

  // Metrics
  const totalStandards = standards.length;
  const publishedStandards = standards.filter((s) => s.status === 'PUBLISHED').length;
  const activeRevisionsCount = standards.reduce((acc, s) => acc + (s.revisions?.length || 1), 0);
  const coveredPillars = new Set(standards.map((s) => s.category)).size;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner & Action Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="code-tag" style={{ background: 'var(--color-primary)', color: '#FFFFFF', padding: '2px 8px', borderRadius: 'var(--radius-xs)', fontSize: '11px', fontWeight: 700 }}>
              Visual Standards
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Operational Governance & Visual Controls
            </span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            5S Visual Standards Library
          </h1>
        </div>

        <div className="page-header-actions">
          <Button
            variant="secondary"
            icon={<RefreshCw size={15} />}
            onClick={() => loadData()}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setCreateDrawerOpen(true)}
          >
            Author New 5S Standard
          </Button>
        </div>
      </div>

      {/* Friendly Section Explainer Banner */}
      <div className="section-intro-banner">
        <div className="section-intro-content">
          <div className="section-intro-icon">
            <BookOpen size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px 0' }}>
              5S Shopfloor Visual Standards & Benchmark Repository
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
              Define side-by-side photographic target conditions (Golden Standard) vs defect examples across 1S through 6S pillars. These standards dynamically power your audit checklists and SOP documentation.
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
            Author Standard
          </Button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="metric-card accent-primary">
          <div className="metric-header">
            <div className="metric-label">Total Standards</div>
            <div className="metric-icon primary">
              <BookOpen size={16} />
            </div>
          </div>
          <div className="metric-value">{totalStandards}</div>
          <div className="metric-subtext">Active visual guidelines</div>
        </div>

        <div className="metric-card accent-success">
          <div className="metric-header">
            <div className="metric-label">Published Benchmarks</div>
            <div className="metric-icon success">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="metric-value" style={{ color: 'var(--color-success)' }}>
            {publishedStandards}
          </div>
          <div className="metric-subtext">Enforced in audit templates</div>
        </div>

        <div className="metric-card accent-purple">
          <div className="metric-header">
            <div className="metric-label">Approved Revisions</div>
            <div className="metric-icon purple">
              <Layers size={16} />
            </div>
          </div>
          <div className="metric-value" style={{ color: 'var(--color-purple)' }}>
            {activeRevisionsCount}
          </div>
          <div className="metric-subtext">Immutable revision history</div>
        </div>

        <div className="metric-card accent-warning">
          <div className="metric-header">
            <div className="metric-label">6S Pillar Coverage</div>
            <div className="metric-icon warning">
              <Sparkles size={16} />
            </div>
          </div>
          <div className="metric-value" style={{ color: coveredPillars >= 5 ? 'var(--color-success)' : 'var(--color-warning)' }}>
            {coveredPillars} <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-tertiary)' }}>/ 6 Pillars</span>
          </div>
          <div className="metric-subtext">Pillars with active standards</div>
        </div>
      </div>

      {/* Category Tabs Strip */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
        }}
      >
        {categoryPillars.map((p) => {
          const isSelected = selectedCategory === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedCategory(p.id)}
              className={`pillar-tab-pill ${isSelected ? 'active' : ''}`}
            >
              <span>{p.label}</span>
              {p.count !== undefined && (
                <span
                  style={{
                    fontSize: '11px',
                    padding: '1px 7px',
                    borderRadius: 'var(--radius-full)',
                    background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-surface-subtle)',
                    color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                    fontWeight: 700,
                  }}
                >
                  {p.count}
                </span>
              )}
            </button>
          );
        })}
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
                placeholder="Search standard by code (e.g. STD-5S-01) or title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '36px' }}
              />
            </div>

            {/* Scope Filter */}
            <select
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
              className="form-select"
              style={{ width: '180px' }}
            >
              <option value="ALL">All Scopes</option>
              <option value="GLOBAL">Global Enterprise</option>
              <option value="PLANT">Plant Specific</option>
              <option value="DEPARTMENT">Department Specific</option>
              <option value="LOCATION_TYPE">Location Type</option>
              <option value="SPECIFIC_LOCATION">Specific Area</option>
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="form-select"
              style={{ width: '150px' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft Mode</option>
              <option value="ARCHIVED">Archived</option>
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
          <div>Loading visual standards repository...</div>
        </div>
      ) : standards.length === 0 ? (
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
              <BookOpen size={30} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              No 5S Standards Found
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 20px auto' }}>
              {search || selectedCategory !== 'ALL'
                ? 'No visual standards match your active search or pillar filters.'
                : 'Establish baseline visual standards with standard-vs-defect photo pairs and operating rules.'}
            </p>
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => setCreateDrawerOpen(true)}
            >
              Author First 5S Standard
            </Button>
          </div>
        </Card>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {standards.map((std) => {
            const currentRev = std.currentRevision || std.revisions?.[0];
            const stdPhoto = currentRev?.referencePhotos?.find((p: any) => p.type === 'STANDARD_CONDITION')?.photoUrl || FIVE_S_IMAGES.standards.shadowBoardStandard;
            const curPhoto = currentRev?.referencePhotos?.find((p: any) => p.type === 'CURRENT_CONDITION')?.photoUrl || FIVE_S_IMAGES.standards.shadowBoardClutter;
            const rulesCount = currentRev?.rules?.length || 0;

            return (
              <div
                key={std.id}
                className="card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/standards/${std.id}`)}
              >
                {/* Header Strip */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="code-tag">{std.code}</span>
                      {getPillarBadge(std.category)}
                    </div>
                    <Badge variant={std.status === 'PUBLISHED' ? 'success' : 'warning'}>
                      Rev {currentRev?.revisionNumber || '1.0'}
                    </Badge>
                  </div>

                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 2px 0', lineHeight: 1.4 }}>
                    {std.title}
                  </h3>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    Scope: <strong>{std.scopeType}</strong> {std.targetOrgNode ? `(${std.targetOrgNode.name})` : ''}
                  </div>
                </div>

                {/* Paired Photo Thumbnail Strip */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '140px', background: 'var(--bg-surface-subtle)', position: 'relative' }}>
                  <ImageWithFallback
                    src={stdPhoto}
                    alt="Standard Condition"
                    badgeText="STANDARD"
                    badgeVariant="success"
                    enableLightbox={false}
                    containerStyle={{ borderRadius: 0, border: 'none', borderRight: '1px solid var(--border-subtle)' }}
                  />
                  <ImageWithFallback
                    src={curPhoto}
                    alt="Current Condition (Defect)"
                    badgeText="DEFECT"
                    badgeVariant="danger"
                    enableLightbox={false}
                    containerStyle={{ borderRadius: 0, border: 'none' }}
                  />
                </div>

                {/* Body Details */}
                <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {currentRev?.description || 'Operational 5S visual guideline standard.'}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span><strong>{rulesCount}</strong> Check Rules</span>
                      {currentRev?.sopDocumentUrl && <span>• <strong>SOP</strong> Attached</span>}
                      {currentRev?.videoUrl && <span>• <strong>Video</strong> Guide</span>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', color: 'var(--color-primary)', fontWeight: 600 }}>
                      <span>Inspect</span>
                      <ChevronRight size={14} />
                    </div>
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
                  <th>Standard Code</th>
                  <th>Title & Description</th>
                  <th>5S Pillar</th>
                  <th>Scope</th>
                  <th>Active Revision</th>
                  <th>Rules</th>
                  <th>Media</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {standards.map((std) => {
                  const currentRev = std.currentRevision || std.revisions?.[0];
                  return (
                    <tr
                      key={std.id}
                      onClick={() => navigate(`/standards/${std.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <span className="code-tag">{std.code}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                          {std.title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {currentRev?.description || 'Visual standard specification'}
                        </div>
                      </td>
                      <td>{getPillarBadge(std.category)}</td>
                      <td>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {std.scopeType}
                        </span>
                      </td>
                      <td>
                        <Badge variant="success">
                          v{currentRev?.revisionNumber || '1.0'}
                        </Badge>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>
                          {currentRev?.rules?.length || 0}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {currentRev?.referencePhotos?.length ? <span title="Paired Photos"><ImageIcon size={14} color="var(--color-primary)" /></span> : null}
                          {currentRev?.sopDocumentUrl ? <span title="SOP Attached"><FileText size={14} color="var(--color-success)" /></span> : null}
                          {currentRev?.videoUrl ? <span title="Video Available"><Video size={14} color="var(--color-warning)" /></span> : null}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/standards/${std.id}`);
                          }}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Author New Standard Modal */}
      <Modal
        isOpen={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        title="Author New 5S Visual Standard"
        subtitle="Define golden-standard criteria, compliance statements, and side-by-side photos"
        maxWidth="680px"
      >
        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Metadata Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Standard Code *</label>
              <input
                type="text"
                placeholder="e.g. STD-5S-MACH-01"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="form-control"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">5S Pillar Category *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
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
          </div>

          <div className="form-group">
            <label className="form-label">Standard Title *</label>
            <input
              type="text"
              placeholder="e.g. CNC Machine Tooling & Shadow Board Demarcation Standard"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="form-control"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Standard Scope & Enforcement</label>
            <select
              value={formData.scopeType}
              onChange={(e) => setFormData({ ...formData, scopeType: e.target.value })}
              className="form-control"
            >
              <option value="GLOBAL">Global Enterprise (All Plants & Units)</option>
              <option value="PLANT">Plant Specific</option>
              <option value="DEPARTMENT">Department Specific</option>
              <option value="SPECIFIC_LOCATION">Specific Area Only</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Standard Purpose & Qualitative Description *</label>
            <textarea
              rows={3}
              placeholder="Describe the target visual state, cleanliness threshold, and operational sustainment rules..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="form-control"
              required
            />
          </div>

          {/* Rules Configuration */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="form-label" style={{ margin: 0 }}>Specific Compliance Check Statements *</label>
              <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={handleAddRule}>
                Add Rule
              </Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {formData.rules.map((rule, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', width: '20px' }}>
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={rule}
                    onChange={(e) => handleRuleChange(idx, e.target.value)}
                    placeholder={`Rule statement ${idx + 1}...`}
                    className="form-control"
                    required
                  />
                  {formData.rules.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRule(idx)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '4px' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Photo Pair Configuration */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
              Side-by-Side Visual Photo Pair
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label" style={{ color: 'var(--color-success)' }}>
                  ✓ Standard Condition Photo (Compliant)
                </label>
                <input
                  type="text"
                  placeholder="https://.../standard-condition.jpg"
                  value={formData.standardPhotoUrl}
                  onChange={(e) => setFormData({ ...formData, standardPhotoUrl: e.target.value })}
                  className="form-control"
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ color: 'var(--color-danger)' }}>
                  ✗ Defect Example Photo (Non-compliant)
                </label>
                <input
                  type="text"
                  placeholder="https://.../defect-condition.jpg"
                  value={formData.currentPhotoUrl}
                  onChange={(e) => setFormData({ ...formData, currentPhotoUrl: e.target.value })}
                  className="form-control"
                />
              </div>
            </div>
          </div>

          {/* Media Links */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Attached SOP PDF Document Link</label>
              <input
                type="text"
                placeholder="https://docs.corp.com/sop-01.pdf"
                value={formData.sopDocumentUrl}
                onChange={(e) => setFormData({ ...formData, sopDocumentUrl: e.target.value })}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Video Work Instruction URL</label>
              <input
                type="text"
                placeholder="https://youtube.com/watch?v=..."
                value={formData.videoUrl}
                onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                className="form-control"
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <Button variant="secondary" onClick={() => setCreateDrawerOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving} icon={<Sparkles size={15} />}>
              Publish Visual Standard
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      {deleteModalStandard && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteModalStandard(null)}
          title="Delete 5S Standard"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '10px', borderRadius: 'var(--radius-full)', background: 'rgba(220, 38, 38, 0.1)', color: 'var(--color-danger)' }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                  Are you sure you want to delete this standard?
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {deleteModalStandard.code} — {deleteModalStandard.title}
                </div>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              This will remove the standard definition from the library. Historical audit answers referencing previous published snapshots will remain preserved.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setDeleteModalStandard(null)}>
                Cancel
              </Button>
              <Button variant="danger" icon={<Trash2 size={15} />} onClick={handleDeleteConfirm}>
                Delete Standard
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

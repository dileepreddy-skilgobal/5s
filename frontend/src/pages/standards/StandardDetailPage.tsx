import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Standard, StandardRevision } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs, TabItem } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Video,
  ExternalLink,
  Plus,
  ShieldCheck,
  History,
  AlertTriangle,
  RefreshCw,
  X,
  Layers,
  Sparkles,
  Printer,
  Camera,
  Check,
  FileCheck,
  MapPin,
  Maximize2,
  Upload,
} from 'lucide-react';

export const StandardDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTenant, addToast } = useApp();

  const [standard, setStandard] = useState<Standard | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('benchmark');

  // Modals & Drawers
  const [showDraftDrawer, setShowDraftDrawer] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState<StandardRevision | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Draft Revision Form State
  const [draftData, setDraftData] = useState({
    revisionNumber: '2.0',
    description: '',
    rules: [''],
    standardPhotoUrl: '',
    currentPhotoUrl: '',
    videoUrl: '',
    sopDocumentUrl: '',
    revisionComments: 'Revised visual threshold requirements per quarterly review.',
    publishDirectly: false,
  });

  const [approvalComments, setApprovalComments] = useState('');

  const loadStandard = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.getStandardById(id);
      setStandard(data);
      if (data.currentRevision) {
        const rev = data.currentRevision;
        const stdPhoto = rev.referencePhotos?.find((p: any) => p.type === 'STANDARD_CONDITION')?.photoUrl || '';
        const curPhoto = rev.referencePhotos?.find((p: any) => p.type === 'CURRENT_CONDITION')?.photoUrl || '';
        const nextRevNum = (parseFloat(rev.revisionNumber || '1.0') + 1.0).toFixed(1);

        setDraftData({
          revisionNumber: nextRevNum,
          description: rev.description || '',
          rules: rev.rules?.length ? [...rev.rules] : [''],
          standardPhotoUrl: stdPhoto,
          currentPhotoUrl: curPhoto,
          videoUrl: rev.videoUrl || '',
          sopDocumentUrl: rev.sopDocumentUrl || '',
          revisionComments: 'Revised visual threshold requirements.',
          publishDirectly: false,
        });
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Standard Not Found',
        message: err?.response?.data?.message || 'Could not retrieve visual standard record.',
      });
      navigate('/standards');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStandard();
  }, [id, currentTenant]);

  const handleAddDraftRule = () => {
    setDraftData((prev) => ({ ...prev, rules: [...prev.rules, ''] }));
  };

  const handleDraftRuleChange = (index: number, val: string) => {
    const updated = [...draftData.rules];
    updated[index] = val;
    setDraftData((prev) => ({ ...prev, rules: updated }));
  };

  const handleRemoveDraftRule = (index: number) => {
    if (draftData.rules.length <= 1) return;
    const updated = draftData.rules.filter((_, i) => i !== index);
    setDraftData((prev) => ({ ...prev, rules: updated }));
  };

  const handleCreateRevisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setActionLoading(true);
    try {
      const payload = {
        revisionNumber: draftData.revisionNumber,
        description: draftData.description,
        rules: draftData.rules.filter((r) => r.trim().length > 0),
        referencePhotos: [
          {
            type: 'STANDARD_CONDITION',
            photoUrl: draftData.standardPhotoUrl,
            label: 'Standard Target Condition (Compliant)',
            description: 'Target visual state and demarcations.',
          },
          {
            type: 'CURRENT_CONDITION',
            photoUrl: draftData.currentPhotoUrl,
            label: 'Defect / Non-compliance condition',
            description: 'Example of non-compliance.',
          },
        ],
        videoUrl: draftData.videoUrl || undefined,
        sopDocumentUrl: draftData.sopDocumentUrl || undefined,
        revisionComments: draftData.revisionComments,
        publishDirectly: draftData.publishDirectly,
      };

      await api.createStandardRevision(id, payload);
      addToast({
        type: 'success',
        title: 'Revision Created',
        message: `Draft Revision Rev ${draftData.revisionNumber} logged successfully.`,
      });
      setShowDraftDrawer(false);
      await loadStandard();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Revision Failed',
        message: err?.response?.data?.message || 'Could not create revision.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveRevisionSubmit = async () => {
    if (!id || !showApproveModal) return;
    setActionLoading(true);
    try {
      await api.approveStandardRevision(id, showApproveModal.id, approvalComments || 'Approved by EHS authority.');
      addToast({
        type: 'success',
        title: 'Revision Approved & Live',
        message: `Revision Rev ${showApproveModal.revisionNumber} is now the active baseline standard.`,
      });
      setShowApproveModal(null);
      setApprovalComments('');
      await loadStandard();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Approval Failed',
        message: err?.response?.data?.message || 'Could not approve revision.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || !standard) {
    return (
      <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-secondary)' }}>
        <RefreshCw size={28} className="spin-animation" style={{ marginBottom: '12px' }} />
        <div>Loading 5S Visual Standard Record...</div>
      </div>
    );
  }

  const currentRev = standard.currentRevision || standard.revisions?.[0];
  const stdPhoto = currentRev?.referencePhotos?.find((p: any) => p.type === 'STANDARD_CONDITION')?.photoUrl || '/assets/5s/shadow_board_std.jpg';
  const curPhoto = currentRev?.referencePhotos?.find((p: any) => p.type === 'CURRENT_CONDITION')?.photoUrl || '/assets/5s/shadow_board_clutter.jpg';

  const tabs: TabItem[] = [
    { id: 'benchmark', label: 'Visual Benchmark & Photo Pairing', icon: <Camera size={15} /> },
    { id: 'revisions', label: 'Revision Control & Approvals', icon: <History size={15} />, badge: standard.revisions?.length },
    { id: 'templates', label: 'Linked Audit Templates', icon: <FileCheck size={15} />, badge: (standard as any).questions?.length || 0 },
    { id: 'scope', label: 'Enforced Scope & Areas', icon: <MapPin size={15} /> },
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Back Link & Action Bar */}
      <div className="page-top-bar">
        <button
          onClick={() => navigate('/standards')}
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
          <ArrowLeft size={16} /> Back to 5S Standards Library
        </button>

        <div className="page-top-bar-actions">
          <Button
            variant="secondary"
            icon={<Printer size={15} />}
            onClick={() => setShowPrintModal(true)}
          >
            Print One-Point Lesson (OPL)
          </Button>

          <Button
            variant="primary"
            icon={<Plus size={15} />}
            onClick={() => setShowDraftDrawer(true)}
          >
            Draft New Revision
          </Button>
        </div>
      </div>

      {/* Hero Standard Banner Card */}
      <Card noPadding>
        <div
          style={{
            padding: '24px 28px',
            background: 'linear-gradient(to right, var(--bg-surface), var(--bg-surface-subtle))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '24px',
                border: '1px solid var(--color-primary)',
              }}
            >
              <BookOpen size={30} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span className="code-tag" style={{ background: 'var(--color-primary)', color: '#FFFFFF', padding: '3px 10px', borderRadius: 'var(--radius-xs)', fontWeight: 800, fontSize: '13px' }}>
                  {standard.code}
                </span>
                <Badge variant="purple">
                  {standard.category.replace('_', ' ')}
                </Badge>
                <Badge variant={standard.status === 'PUBLISHED' ? 'success' : 'warning'}>
                  {standard.status}
                </Badge>
                <Badge variant="neutral">
                  Rev {currentRev?.revisionNumber || '1.0'} Active
                </Badge>
              </div>

              <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: '6px 0 4px 0', letterSpacing: '-0.02em' }}>
                {standard.title}
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span><strong>Scope:</strong> {standard.scopeType}</span>
                <span>•</span>
                <span><strong>Effective Date:</strong> {new Date(currentRev?.effectiveDate || Date.now()).toLocaleDateString()}</span>
                <span>•</span>
                <span><strong>Author:</strong> {currentRev?.author ? `${currentRev.author.firstName} ${currentRev.author.lastName}` : 'EHS Lead'}</span>
                <span>•</span>
                <span><strong>Approver:</strong> {currentRev?.approver ? `${currentRev.approver.firstName} ${currentRev.approver.lastName}` : 'Plant Director'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4-Tab Navigation Strip */}
        <div style={{ padding: '0 20px', background: 'var(--bg-surface)' }}>
          <Tabs tabs={tabs} activeTab={activeTab} onChange={(t) => setActiveTab(t)} />
        </div>
      </Card>

      {/* Tab Panels */}
      <div className="tab-panels">
        {/* TAB 1: VISUAL BENCHMARK & PHOTO PAIRING */}
        {activeTab === 'benchmark' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Side-by-Side Comparison Container */}
            <Card
              title="Visual Standard Benchmark (Side-by-Side Verification)"
              subtitle="Clear side-by-side photographic contrast between the target conforming condition and defect non-compliance"
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
                {/* Standard Target Condition Card */}
                <div
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    border: '2px solid var(--color-success)',
                    background: 'var(--bg-surface-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 18px',
                      background: 'rgba(5, 150, 105, 0.1)',
                      borderBottom: '1px solid rgba(5, 150, 105, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)', fontWeight: 700, fontSize: '13px' }}>
                      <CheckCircle2 size={16} />
                      <span>STANDARD CONDITION (COMPLIANT 100%)</span>
                    </div>
                    <Badge variant="success">Target Benchmark</Badge>
                  </div>

                  <div style={{ position: 'relative', height: '300px', background: 'var(--bg-surface-subtle)' }}>
                    <ImageWithFallback
                      src={stdPhoto}
                      alt="Compliant Standard Benchmark"
                      badgeText="STANDARD BENCHMARK"
                      badgeVariant="success"
                      containerStyle={{ height: '300px', borderRadius: 0, border: 'none' }}
                    />
                  </div>

                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      Target Conforming Visual State
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      Workstation is 100% compliant. Tools are returned to designated color-coded shadow silhouettes, surfaces are wiped clean with zero oil spills, and parts bins are clearly marked with barcode tags.
                    </p>
                  </div>
                </div>

                {/* Defect Condition Card */}
                <div
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    border: '2px solid var(--color-danger)',
                    background: 'var(--bg-surface-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 18px',
                      background: 'rgba(220, 38, 38, 0.1)',
                      borderBottom: '1px solid rgba(220, 38, 38, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)', fontWeight: 700, fontSize: '13px' }}>
                      <AlertTriangle size={16} />
                      <span>DEFECT EXAMPLE (NON-COMPLIANT 0%)</span>
                    </div>
                    <Badge variant="danger">Non-conforming</Badge>
                  </div>

                  <div style={{ position: 'relative', height: '300px', background: 'var(--bg-surface-subtle)' }}>
                    <ImageWithFallback
                      src={curPhoto}
                      alt="Defect Condition Snapshot"
                      badgeText="DEFECT EXAMPLE"
                      badgeVariant="danger"
                      containerStyle={{ height: '300px', borderRadius: 0, border: 'none' }}
                    />
                  </div>

                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      Common Defect & Non-Compliance Indicators
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      Unlabelled scrap totes left in aisles, obsolete wrenches resting on machine enclosures, oil mist filter overdue for replacement, loose cables dragging on floor creating trip hazards.
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Check Rules & SOP Attachments Grid */}
            <div className="grid grid-cols-3 gap-6">
              {/* Left 2 Cols: Check Rules */}
              <div style={{ gridColumn: 'span 2' }}>
                <Card
                  title="Specific Compliance Check Rules (Revision Requirements)"
                  subtitle="Auditors and operators verify these explicit statements during routine 5S inspections"
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {currentRev?.rules?.map((rule: string, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          padding: '14px 18px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-surface-subtle)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                        }}
                      >
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--color-success)',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '11px',
                            marginTop: '2px',
                          }}
                        >
                          ✓
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                            {rule}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* Right 1 Col: Attached Documents & Video */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <Card title="Operational SOP & Video Guide">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {currentRev?.sopDocumentUrl ? (
                      <a
                        href={currentRev.sopDocumentUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '14px 16px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--color-primary-light)',
                          color: 'var(--color-primary)',
                          textDecoration: 'none',
                          border: '1px solid var(--color-primary)',
                          fontWeight: 600,
                          fontSize: '13px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <FileText size={18} />
                          <span>Download Official SOP Document</span>
                        </div>
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px' }}>
                        No SOP document attached to this revision.
                      </div>
                    )}

                    {currentRev?.videoUrl ? (
                      <a
                        href={currentRev.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '14px 16px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-surface-subtle)',
                          color: 'var(--text-primary)',
                          textDecoration: 'none',
                          border: '1px solid var(--border-strong)',
                          fontWeight: 600,
                          fontSize: '13px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Video size={18} color="var(--color-warning)" />
                          <span>Watch Video Tutorial</span>
                        </div>
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px' }}>
                        No video tutorial attached to this revision.
                      </div>
                    )}
                  </div>
                </Card>

                <Card title="Standard Governance">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Standard Code:</span>
                      <strong>{standard.code}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Category:</span>
                      <strong>{standard.category}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Active Version:</span>
                      <strong>v{currentRev?.revisionNumber || '1.0'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Scope Level:</span>
                      <strong>{standard.scopeType}</strong>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: REVISION CONTROL & GOVERNANCE */}
        {activeTab === 'revisions' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card
              title="Standard Version Control & Approval History"
              subtitle="Immutable change logs preserving historical audit integrity when visual standards evolve"
              actions={
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Plus size={14} />}
                  onClick={() => setShowDraftDrawer(true)}
                >
                  Draft Revision
                </Button>
              }
            >
              <div className="enterprise-table-container">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th>Revision #</th>
                      <th>Effective Date</th>
                      <th>Change Description & Comments</th>
                      <th>Rules Count</th>
                      <th>Author</th>
                      <th>Approved By</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standard.revisions?.map((rev: StandardRevision) => (
                      <tr key={rev.id}>
                        <td>
                          <Badge variant={rev.isCurrent ? 'success' : 'neutral'}>
                            Rev {rev.revisionNumber} {rev.isCurrent ? '(Active)' : ''}
                          </Badge>
                        </td>
                        <td>{new Date(rev.effectiveDate).toLocaleDateString()}</td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                            {rev.description}
                          </div>
                          {rev.revisionComments && (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              Note: {rev.revisionComments}
                            </div>
                          )}
                        </td>
                        <td>{rev.rules?.length || 0} rules</td>
                        <td>
                          {rev.author ? `${rev.author.firstName} ${rev.author.lastName}` : 'System Author'}
                        </td>
                        <td>
                          {rev.approver ? (
                            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                              ✓ {rev.approver.firstName} {rev.approver.lastName}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                              Pending Review
                            </span>
                          )}
                        </td>
                        <td>
                          <Badge variant={rev.isCurrent ? 'success' : rev.approvedById ? 'info' : 'warning'}>
                            {rev.isCurrent ? 'ACTIVE' : rev.approvedById ? 'SUPERSEDED' : 'DRAFT'}
                          </Badge>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {!rev.isCurrent && !rev.approvedById && (
                            <Button
                              size="sm"
                              variant="primary"
                              icon={<Check size={13} />}
                              onClick={() => setShowApproveModal(rev)}
                            >
                              Approve
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 3: LINKED AUDIT TEMPLATES & QUESTIONS */}
        {activeTab === 'templates' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card
              title="Audit Templates Referencing this Visual Standard"
              subtitle="Audit questions linked to this standard definition for automatic auditor guidance and benchmark display"
            >
              {(standard as any).questions && (standard as any).questions.length > 0 ? (
                <div className="enterprise-table-container">
                  <table className="enterprise-table">
                    <thead>
                      <tr>
                        <th>Question Code</th>
                        <th>Question Text</th>
                        <th>Template Code & Name</th>
                        <th>Audit Type</th>
                        <th>Severity</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(standard as any).questions.map((q: any) => {
                        const tpl = q.section?.templateVersion?.template;
                        return (
                          <tr key={q.id}>
                            <td>
                              <span className="code-tag">{q.questionCode}</span>
                            </td>
                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {q.questionText}
                            </td>
                            <td>
                              <div><strong>{tpl?.code}</strong></div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{tpl?.name}</div>
                            </td>
                            <td><Badge variant="neutral">{tpl?.auditType}</Badge></td>
                            <td><Badge variant="warning">{q.severity}</Badge></td>
                            <td style={{ textAlign: 'right' }}>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => navigate(`/templates/${tpl?.id}/builder`)}
                              >
                                View in Builder
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-secondary)' }}>
                  <FileCheck size={36} color="var(--text-tertiary)" style={{ marginBottom: '10px' }} />
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No Audit Templates Currently Link to this Standard</div>
                  <div style={{ fontSize: '12px', marginTop: '4px', maxWidth: '400px', margin: '4px auto 0 auto' }}>
                    Open the Audit Template Builder to link inspection questions to this visual standard.
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 4: ENFORCED SCOPE & AREAS */}
        {activeTab === 'scope' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card
              title="Applicable Workplace Scope & Workstations"
              subtitle="Locations and organizational units governed by this standard benchmark"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    Scope Mode: {standard.scopeType}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                    {standard.scopeType === 'GLOBAL'
                      ? 'This standard is enforced globally across all manufacturing lines, warehouse docks, and office workstations within the organization.'
                      : standard.targetOrgNode
                      ? `Enforced specifically for department / plant: ${standard.targetOrgNode.name}`
                      : standard.targetLocation
                      ? `Enforced specifically for workstation: ${standard.targetLocation.name} (${standard.targetLocation.areaCode})`
                      : 'Configured for specialized scope.'}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Draft Revision Modal */}
      <Modal
        isOpen={showDraftDrawer}
        onClose={() => setShowDraftDrawer(false)}
        title={`Draft New Revision for ${standard.code}`}
        subtitle="Author new guidelines, rules, and visual conditions for this standard"
        maxWidth="640px"
      >
        <form onSubmit={handleCreateRevisionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="form-group">
            <label className="form-label">Revision Number *</label>
            <input
              type="text"
              value={draftData.revisionNumber}
              onChange={(e) => setDraftData({ ...draftData, revisionNumber: e.target.value })}
              className="form-control"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Revision Scope & Summary *</label>
            <textarea
              rows={3}
              placeholder="Explain the changes in this version..."
              value={draftData.description}
              onChange={(e) => setDraftData({ ...draftData, description: e.target.value })}
              className="form-control"
              required
            />
          </div>

          {/* Rules */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="form-label" style={{ margin: 0 }}>Compliance Statements *</label>
              <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={handleAddDraftRule}>
                Add Rule
              </Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {draftData.rules.map((rule, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={rule}
                    onChange={(e) => handleDraftRuleChange(idx, e.target.value)}
                    placeholder={`Rule statement ${idx + 1}...`}
                    className="form-control"
                    required
                  />
                  {draftData.rules.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDraftRule(idx)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer' }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Photo URLs with Direct File Upload */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label className="form-label" style={{ color: 'var(--color-success)', margin: 0 }}>Standard Condition Photo</label>
                <label style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Upload size={12} /> Upload
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => setDraftData({ ...draftData, standardPhotoUrl: ev.target?.result as string });
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              </div>
              <input
                type="text"
                placeholder="Upload file or enter URL..."
                value={draftData.standardPhotoUrl}
                onChange={(e) => setDraftData({ ...draftData, standardPhotoUrl: e.target.value })}
                className="form-control"
              />
            </div>
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label className="form-label" style={{ color: 'var(--color-danger)', margin: 0 }}>Defect Example Photo</label>
                <label style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Upload size={12} /> Upload
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => setDraftData({ ...draftData, currentPhotoUrl: ev.target?.result as string });
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              </div>
              <input
                type="text"
                placeholder="Upload file or enter URL..."
                value={draftData.currentPhotoUrl}
                onChange={(e) => setDraftData({ ...draftData, currentPhotoUrl: e.target.value })}
                className="form-control"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Revision Comments / Approval Notes</label>
            <input
              type="text"
              value={draftData.revisionComments}
              onChange={(e) => setDraftData({ ...draftData, revisionComments: e.target.value })}
              className="form-control"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <Button variant="secondary" onClick={() => setShowDraftDrawer(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={actionLoading}>
              Save Draft Revision
            </Button>
          </div>
        </form>
      </Modal>

      {/* Approve Revision Modal */}
      {showApproveModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowApproveModal(null)}
          title={`Approve Revision Rev ${showApproveModal.revisionNumber}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '10px', borderRadius: 'var(--radius-full)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                <ShieldCheck size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                  Approve and Activate Rev {showApproveModal.revisionNumber}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  This revision will become the active baseline across all future audit executions.
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Approval Sign-off Comments</label>
              <textarea
                rows={3}
                placeholder="e.g. Verified by EHS Plant Safety Committee on inspection."
                value={approvalComments}
                onChange={(e) => setApprovalComments(e.target.value)}
                className="form-control"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setShowApproveModal(null)}>
                Cancel
              </Button>
              <Button variant="primary" loading={actionLoading} onClick={handleApproveRevisionSubmit}>
                Confirm Approval & Publish
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Printable One-Point Lesson (OPL) Modal */}
      {showPrintModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowPrintModal(false)}
          title="Printable 5S One-Point Lesson (OPL) Card"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div
              id="printable-opl-sheet"
              style={{
                border: '2px solid #000',
                padding: '20px',
                borderRadius: 'var(--radius-md)',
                background: '#FFFFFF',
                color: '#000000',
              }}
            >
              {/* OPL Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666' }}>
                    SKILGLOBAL 5S VISUAL WORKSTATION BENCHMARK
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, margin: '2px 0' }}>
                    {standard.code} — {standard.title}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>Rev {currentRev?.revisionNumber || '1.0'}</div>
                  <div style={{ fontSize: '10px', color: '#666' }}>{new Date().toLocaleDateString()}</div>
                </div>
              </div>

              {/* Photos */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div style={{ border: '2px solid green', padding: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'green', marginBottom: '4px' }}>✓ TARGET CONFORMING CONDITION</div>
                  <img src={stdPhoto} alt="Compliant" style={{ width: '100%', height: '160px', objectFit: 'cover' }} />
                </div>

                <div style={{ border: '2px solid red', padding: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'red', marginBottom: '4px' }}>✗ DEFECT / NON-COMPLIANCE</div>
                  <img src={curPhoto} alt="Defect" style={{ width: '100%', height: '160px', objectFit: 'cover' }} />
                </div>
              </div>

              {/* Rules list */}
              <div style={{ fontSize: '12px' }}>
                <div style={{ fontWeight: 800, marginBottom: '6px' }}>MANDATORY CHECKPOINTS:</div>
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {currentRev?.rules?.map((r: string, idx: number) => (
                    <li key={idx}><strong>{r}</strong></li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setShowPrintModal(false)}>
                Close
              </Button>
              <Button
                variant="primary"
                icon={<Printer size={15} />}
                onClick={() => {
                  window.print();
                }}
              >
                Send to Printer
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

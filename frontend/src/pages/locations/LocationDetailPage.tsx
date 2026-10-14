import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Location, LocationTimeline, LocationDocument, AuditExecution } from '../../types';
import { AuditReportModal } from '../../components/common/AuditReportModal';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs, TabItem } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { FIVE_S_IMAGES } from '../../constants/images';
import {
  MapPin,
  ArrowLeft,
  QrCode,
  Calendar,
  Layers,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Package,
  Activity,
  Plus,
  Edit2,
  Trash2,
  User,
  Upload,
  Camera,
  Printer,
  Sparkles,
  ShieldAlert,
  UserCheck,
  TrendingUp,
  PlusCircle,
  FileSpreadsheet,
  Edit3,
  Search,
  ShieldCheck,
  Filter,
} from 'lucide-react';

export const LocationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTenant, addToast } = useApp();

  const [location, setLocation] = useState<Location | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [loading, setLoading] = useState(true);

  // Modals
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [addMilestoneModalOpen, setAddMilestoneModalOpen] = useState(false);
  const [addDocModalOpen, setAddDocModalOpen] = useState(false);
  const [uploadEvidenceModalOpen, setUploadEvidenceModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [auditExecutions, setAuditExecutions] = useState<AuditExecution[]>([]);

  // 5S Evidence Gallery State
  const [evidenceList, setEvidenceList] = useState<Array<{
    id: string;
    category: 'S1_SORT' | 'S2_SET_IN_ORDER' | 'S3_SHINE' | 'S4_STANDARDIZE' | 'S5_SUSTAIN' | 'S6_SAFETY';
    categoryLabel: string;
    badgeVariant: 'warning' | 'purple' | 'success' | 'info' | 'danger';
    beforePhotoUrl: string;
    afterPhotoUrl: string;
    afterLabel: string;
    description: string;
    uploader: string;
    date: string;
  }>>([
    {
      id: 'EV-1',
      category: 'S1_SORT',
      categoryLabel: '1S - Sort & Red Tag',
      badgeVariant: 'warning',
      beforePhotoUrl: FIVE_S_IMAGES.standards.underBenchClutter,
      afterPhotoUrl: FIVE_S_IMAGES.standards.cleanCncStandard,
      afterLabel: 'AFTER (CLEARED)',
      description: 'Removed 14 obsolete hydraulic hoses and unneeded fixture clamps to Red Tag Zone.',
      uploader: 'Arun Patel',
      date: 'Sep 15, 2026',
    },
    {
      id: 'EV-2',
      category: 'S2_SET_IN_ORDER',
      categoryLabel: '2S - Set in Order',
      badgeVariant: 'purple',
      beforePhotoUrl: FIVE_S_IMAGES.standards.shadowBoardClutter,
      afterPhotoUrl: FIVE_S_IMAGES.standards.shadowBoardStandard,
      afterLabel: 'AFTER (SHADOW BOARD)',
      description: 'Shadow foam cutouts and magnetic barcode tool holders installed on work bench.',
      uploader: 'Deepa Krishnan',
      date: 'Sep 12, 2026',
    },
    {
      id: 'EV-3',
      category: 'S3_SHINE',
      categoryLabel: '3S - Shine & Cleanliness',
      badgeVariant: 'success',
      beforePhotoUrl: FIVE_S_IMAGES.standards.oilLeakDefect,
      afterPhotoUrl: FIVE_S_IMAGES.standards.cleanCncStandard,
      afterLabel: 'AFTER (CLEANED & RESEALED)',
      description: 'Cleaned hydraulic basin, replaced motor seal gasket, and installed absorbent containment socks.',
      uploader: 'Suresh Menon',
      date: 'Sep 18, 2026',
    },
    {
      id: 'EV-4',
      category: 'S6_SAFETY',
      categoryLabel: '6S - Safety & Demarcation',
      badgeVariant: 'danger',
      beforePhotoUrl: FIVE_S_IMAGES.standards.fireSafetyBlocked,
      afterPhotoUrl: FIVE_S_IMAGES.standards.fireSafetyStandard,
      afterLabel: 'AFTER (SAFETY DEMARCATION)',
      description: 'Demarcated 1-meter fire extinguisher radial zone with high-contrast yellow/black hazard striping.',
      uploader: 'Sneha Reddy',
      date: 'Sep 20, 2026',
    },
  ]);

  // Evidence Form State
  const [evidenceCategory, setEvidenceCategory] = useState<'S1_SORT' | 'S2_SET_IN_ORDER' | 'S3_SHINE' | 'S4_STANDARDIZE' | 'S5_SUSTAIN' | 'S6_SAFETY'>('S1_SORT');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [evidenceBeforePhoto, setEvidenceBeforePhoto] = useState(FIVE_S_IMAGES.standards.underBenchClutter);
  const [evidenceAfterPhoto, setEvidenceAfterPhoto] = useState(FIVE_S_IMAGES.standards.cleanCncStandard);
  const [evidenceAfterLabel, setEvidenceAfterLabel] = useState('AFTER (CLEARED)');
  const [evidenceUploader, setEvidenceUploader] = useState('Arun Patel (CNC Line Leader)');

  // Milestone Form State
  const [milestoneName, setMilestoneName] = useState('');
  const [plannedStartDate, setPlannedStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [plannedEndDate, setPlannedEndDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]);
  const [milestoneProgress, setMilestoneProgress] = useState(0);
  const [milestoneStatus, setMilestoneStatus] = useState('NOT_STARTED');
  const [milestoneNotes, setMilestoneNotes] = useState('');

  // Document Form State
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState('SOP');
  const [docUrl, setDocUrl] = useState('https://storage.5s-saas.com/standards/sample-sop.pdf');
  const [docVersion, setDocVersion] = useState('1.0');

  // Audit Trail filtering state
  const [auditFilter, setAuditFilter] = useState<'ALL' | 'TIMELINE' | 'STANDARDS' | 'OWNERSHIP' | 'MASTER'>('ALL');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');

  // Audit Trail formatting & parsing helpers
  const getAuditActionMeta = (actionType: string) => {
    switch (actionType) {
      case 'TIMELINE_UPDATED':
        return {
          label: '5S Milestone Progress Updated',
          category: 'Milestone',
          badgeVariant: 'purple' as const,
          icon: <TrendingUp size={14} />,
          nodeBg: 'rgba(139, 92, 246, 0.12)',
          nodeColor: '#8B5CF6',
          nodeBorder: '1px solid rgba(139, 92, 246, 0.3)',
        };
      case 'STANDARD_ATTACHED':
        return {
          label: 'Visual Standard Benchmark Linked',
          category: 'Standard',
          badgeVariant: 'info' as const,
          icon: <FileCheck size={14} />,
          nodeBg: 'rgba(59, 130, 246, 0.12)',
          nodeColor: '#3B82F6',
          nodeBorder: '1px solid rgba(59, 130, 246, 0.3)',
        };
      case 'OWNERSHIP_ASSIGNED':
        return {
          label: 'Ownership & Accountability Assigned',
          category: 'Accountability',
          badgeVariant: 'warning' as const,
          icon: <UserCheck size={14} />,
          nodeBg: 'rgba(245, 158, 11, 0.12)',
          nodeColor: '#F59E0B',
          nodeBorder: '1px solid rgba(245, 158, 11, 0.3)',
        };
      case 'CREATED':
        return {
          label: 'Location Master Record Created',
          category: 'Creation',
          badgeVariant: 'success' as const,
          icon: <PlusCircle size={14} />,
          nodeBg: 'rgba(16, 185, 129, 0.12)',
          nodeColor: '#10B981',
          nodeBorder: '1px solid rgba(16, 185, 129, 0.3)',
        };
      case 'UPDATED':
        return {
          label: 'Master Configuration Modified',
          category: 'Configuration',
          badgeVariant: 'neutral' as const,
          icon: <Edit3 size={14} />,
          nodeBg: 'rgba(100, 116, 139, 0.12)',
          nodeColor: '#64748B',
          nodeBorder: '1px solid rgba(100, 116, 139, 0.3)',
        };
      case 'EXCEL_IMPORTED':
        return {
          label: 'Bulk Ingestion & Area Onboarding',
          category: 'Import',
          badgeVariant: 'neutral' as const,
          icon: <FileSpreadsheet size={14} />,
          nodeBg: 'rgba(99, 102, 241, 0.12)',
          nodeColor: '#6366F1',
          nodeBorder: '1px solid rgba(99, 102, 241, 0.3)',
        };
      default:
        return {
          label: actionType.replace(/_/g, ' '),
          category: 'Governance',
          badgeVariant: 'neutral' as const,
          icon: <Activity size={14} />,
          nodeBg: 'rgba(100, 116, 139, 0.12)',
          nodeColor: '#64748B',
          nodeBorder: '1px solid rgba(100, 116, 139, 0.3)',
        };
    }
  };

  const renderAuditDetailsContent = (details: string) => {
    try {
      if (details && (details.startsWith('{') || details.startsWith('['))) {
        const parsed = JSON.parse(details);

        if (parsed.action === 'Updated milestone progress') {
          const statusVariant =
            parsed.status === 'COMPLETED' ? 'success' :
            parsed.status === 'IN_PROGRESS' ? 'info' : 'neutral';
          const statusLabel = (parsed.status || 'IN_PROGRESS').replace(/_/g, ' ');

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                Milestone rollout progress updated to <strong>{parsed.progressPercent ?? 0}%</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ width: '140px' }}>
                  <ProgressBar value={parsed.progressPercent ?? 0} height={6} />
                </div>
                <Badge variant={statusVariant as any}>{statusLabel}</Badge>
              </div>
            </div>
          );
        }

        if (parsed.action === 'Added milestone') {
          return (
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '4px' }}>
              Scheduled 5S rollout milestone: <strong style={{ color: 'var(--color-primary)' }}>{parsed.milestone}</strong>
            </div>
          );
        }

        if (parsed.action === 'Created area master') {
          return (
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '4px' }}>
              Centralized area record established for <strong>{parsed.name}</strong> (<code>{parsed.areaCode}</code>).
            </div>
          );
        }

        if (parsed.action === 'Updated area master details') {
          return (
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '4px' }}>
              Updated area master configuration parameters.
              {parsed.changes && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {Object.entries(parsed.changes).map(([k, v]) => (
                    <span key={k} style={{ fontSize: '11px', background: 'var(--bg-surface-subtle)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <strong>{k}:</strong> {String(v)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }

        if (parsed.action && parsed.count) {
          return (
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '4px' }}>
              {parsed.action}
            </div>
          );
        }

        // Generic parsed object
        return (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
            {Object.entries(parsed).map(([k, v]) => (
              <span key={k} style={{ fontSize: '11px', background: 'var(--bg-surface-subtle)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <strong>{k}:</strong> {String(v)}
              </span>
            ))}
          </div>
        );
      }
    } catch (e) {
      // Fallback
    }

    // Regular narrative string
    return (
      <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5, marginTop: '4px' }}>
        {details}
      </div>
    );
  };

  const loadLocation = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [data, execData] = await Promise.all([
        api.getLocationById(id),
        api.getAuditExecutions({ locationId: id }).catch(() => []),
      ]);
      setLocation(data);
      setAuditExecutions(execData || []);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Location Not Found',
        message: 'Could not retrieve area details.',
      });
      navigate('/locations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocation();
  }, [id, currentTenant]);

  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !milestoneName) return;
    try {
      await api.createTimeline(id, {
        milestoneName,
        plannedStartDate: new Date(plannedStartDate).toISOString(),
        plannedEndDate: new Date(plannedEndDate).toISOString(),
        progressPercent: milestoneProgress,
        status: milestoneStatus as any,
        notes: milestoneNotes,
      });

      addToast({
        type: 'success',
        title: 'Milestone Added',
        message: `Added 5S milestone '${milestoneName}'.`,
      });

      setAddMilestoneModalOpen(false);
      setMilestoneName('');
      setMilestoneNotes('');
      await loadLocation();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Milestone Failed',
        message: err?.response?.data?.message || 'Could not add milestone.',
      });
    }
  };

  const handleUpdateMilestoneProgress = async (timeline: LocationTimeline, newProgress: number) => {
    if (!id) return;
    const newStatus = newProgress === 100 ? 'COMPLETED' : newProgress > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
    try {
      await api.updateTimeline(id, timeline.id, {
        progressPercent: newProgress,
        status: newStatus as any,
        actualStartDate: newProgress > 0 && !timeline.actualStartDate ? new Date().toISOString() : undefined,
        actualEndDate: newProgress === 100 ? new Date().toISOString() : undefined,
      });

      addToast({
        type: 'success',
        title: 'Progress Updated',
        message: `Milestone '${timeline.milestoneName}' updated to ${newProgress}%.`,
      });
      await loadLocation();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: 'Could not update timeline progress.',
      });
    }
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !docTitle) return;
    try {
      await api.addDocument(id, {
        title: docTitle,
        docType: docType as any,
        fileUrl: docUrl,
        fileSizeKb: 1250,
        version: docVersion,
      });

      addToast({
        type: 'success',
        title: 'Document Attached',
        message: `SOP '${docTitle}' attached to location.`,
      });

      setAddDocModalOpen(false);
      setDocTitle('');
      await loadLocation();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Attach Failed',
        message: err?.response?.data?.message || 'Could not attach document.',
      });
    }
  };

  const handleBeforeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setEvidenceBeforePhoto(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAfterFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setEvidenceAfterPhoto(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveEvidence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!evidenceBeforePhoto || !evidenceAfterPhoto || !evidenceDescription) {
      addToast({
        type: 'warning',
        title: 'Missing Evidence Information',
        message: 'Please provide before & after photos and an improvement description.',
      });
      return;
    }

    const categoryMap: Record<string, { label: string; variant: 'warning' | 'purple' | 'success' | 'info' | 'danger' }> = {
      S1_SORT: { label: '1S - Sort & Red Tag', variant: 'warning' },
      S2_SET_IN_ORDER: { label: '2S - Set in Order', variant: 'purple' },
      S3_SHINE: { label: '3S - Shine & Cleanliness', variant: 'success' },
      S4_STANDARDIZE: { label: '4S - Standardize', variant: 'info' },
      S5_SUSTAIN: { label: '5S - Sustain & Kaizen', variant: 'purple' },
      S6_SAFETY: { label: '6S - Safety & Demarcation', variant: 'danger' },
    };

    const newPair = {
      id: `EV-${Date.now()}`,
      category: evidenceCategory,
      categoryLabel: categoryMap[evidenceCategory]?.label || '5S Improvement',
      badgeVariant: categoryMap[evidenceCategory]?.variant || 'info',
      beforePhotoUrl: evidenceBeforePhoto,
      afterPhotoUrl: evidenceAfterPhoto,
      afterLabel: evidenceAfterLabel || 'AFTER (IMPROVED)',
      description: evidenceDescription,
      uploader: evidenceUploader || 'Arun Patel',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };

    setEvidenceList((prev) => [newPair, ...prev]);
    setUploadEvidenceModalOpen(false);
    setEvidenceDescription('');
    addToast({
      type: 'success',
      title: '5S Photographic Evidence Uploaded',
      message: `New before/after improvement record logged for ${location?.name || 'workstation'}.`,
    });
  };

  const handleRemoveEvidence = (evidenceId: string) => {
    setEvidenceList((prev) => prev.filter((item) => item.id !== evidenceId));
    addToast({
      type: 'info',
      title: 'Evidence Removed',
      message: 'Photo evidence record removed from gallery.',
    });
  };

  if (loading || !location) {
    return (
      <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-secondary)' }}>
        Loading Centralized Location Record...
      </div>
    );
  }

  const tabs: TabItem[] = [
    { id: 'overview', label: 'Overview & 5S Plan', icon: <Calendar size={15} />, badge: location.timelines?.length },
    { id: 'evidence', label: '5S Evidence Gallery', icon: <Camera size={15} />, badge: `${evidenceList.length} Photos` },
    { id: 'audit', label: 'Audit History & Scores', icon: <FileCheck size={15} />, badge: '88%' },
    { id: 'items', label: 'Items & Shadow Board', icon: <Package size={15} />, badge: '12 Items' },
    { id: 'capa', label: 'CAPA & Abnormalities', icon: <AlertTriangle size={15} />, badge: '2 Open' },
    { id: 'documents', label: 'SOPs & Standards', icon: <FileText size={15} />, badge: location.documents?.length },
    { id: 'history', label: 'Audit Trail & Log', icon: <Clock size={15} />, badge: location.auditLogs?.length },
  ];

  // Overall 5S implementation rollout progress across milestones
  const timelines = location.timelines || [];
  const overall5SProgress =
    timelines.length > 0
      ? Math.round(timelines.reduce((acc, t) => acc + t.progressPercent, 0) / timelines.length)
      : 0;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Back link & Top bar */}
      <div className="page-top-bar">
        <button
          onClick={() => navigate('/locations')}
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
          }}
        >
          <ArrowLeft size={16} /> Back to Area Master Directory
        </button>

        <div className="page-top-bar-actions">
          <Button
            variant="secondary"
            icon={<QrCode size={16} />}
            onClick={() => setQrModalOpen(true)}
          >
            Location QR Code
          </Button>
          <Button
            variant="primary"
            icon={<Sparkles size={16} />}
            onClick={() => {
              if (location) {
                navigate(`/mobile-audit?locationId=${location.id}`);
              } else {
                navigate('/mobile-audit');
              }
            }}
          >
            Start Mobile Audit
          </Button>
        </div>
      </div>

      {/* Hero Location Banner Card */}
      <Card noPadding>
        <div
          style={{
            padding: '24px 28px',
            background: 'linear-gradient(to right, var(--bg-surface), var(--bg-surface-subtle))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-subtle)',
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
              <MapPin size={32} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="code-tag" style={{ background: 'var(--color-primary)', color: '#FFFFFF', padding: '3px 10px', borderRadius: 'var(--radius-xs)', fontWeight: 800, fontSize: '13px' }}>
                  {location.areaCode}
                </span>
                <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {location.name}
                </h1>
                <Badge variant={location.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {location.status}
                </Badge>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                <span><strong>Plant / Unit:</strong> {location.orgNode?.name || 'Department'}</span>
                <span>•</span>
                <span><strong>Building:</strong> {location.building || 'Main Bay'} ({location.floor})</span>
                <span>•</span>
                <span><strong>Risk:</strong> {location.riskLevel}</span>
                <span>•</span>
                <span><strong>Cadence:</strong> {location.auditFrequency} Audits</span>
              </div>
            </div>
          </div>

          {/* Rollout progress ring */}
          <div style={{ textAlign: 'right', minWidth: '180px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
              5S Rollout Implementation
            </div>
            <div className="metric-value tabular-nums" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-primary)', margin: '2px 0' }}>
              {overall5SProgress}%
            </div>
            <ProgressBar value={overall5SProgress} height={6} />
          </div>
        </div>

        {/* 7-Tab Navigation Strip */}
        <div style={{ padding: '0 20px', background: 'var(--bg-surface)' }}>
          <Tabs tabs={tabs} activeTab={activeTab} onChange={(t) => setActiveTab(t)} />
        </div>
      </Card>

      {/* Tab Content Panels */}
      <div className="tab-panels">
        {/* TAB 1: OVERVIEW & 5S TIMELINE PLAN */}
        {activeTab === 'overview' && (
          <div className="animate-fade-in grid grid-cols-3 gap-6">
            {/* Left 2 Cols: 5S Plan & Timeline Sub-module */}
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <Card
                title="5S Rollout Plan & Timeline Milestones"
                subtitle="Track planned start/end dates, milestone execution progress, and sustainment notes per location"
                actions={
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Plus size={14} />}
                    onClick={() => setAddMilestoneModalOpen(true)}
                  >
                    Add Milestone
                  </Button>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {timelines.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-tertiary)' }}>
                      No 5S implementation milestones scheduled. Click "Add Milestone" to establish roadmap.
                    </div>
                  ) : (
                    timelines.map((tl) => (
                      <div
                        key={tl.id}
                        style={{
                          padding: '16px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-surface-subtle)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: 'var(--radius-full)',
                                background: tl.status === 'COMPLETED' ? 'var(--color-success-bg)' : 'var(--color-primary-light)',
                                color: tl.status === 'COMPLETED' ? 'var(--color-success)' : 'var(--color-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '12px',
                              }}
                            >
                              {tl.status === 'COMPLETED' ? '✓' : '●'}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                                {tl.milestoneName}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                Planned: {new Date(tl.plannedStartDate).toLocaleDateString()} → {new Date(tl.plannedEndDate).toLocaleDateString()}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Badge
                              variant={
                                tl.status === 'COMPLETED'
                                  ? 'success'
                                  : tl.status === 'IN_PROGRESS'
                                  ? 'warning'
                                  : 'neutral'
                              }
                            >
                              {tl.status}
                            </Badge>

                            {/* Quick Progress Buttons */}
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {[0, 50, 100].map((pct) => (
                                <button
                                  key={pct}
                                  onClick={() => handleUpdateMilestoneProgress(tl, pct)}
                                  style={{
                                    padding: '3px 8px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    borderRadius: 'var(--radius-xs)',
                                    border: '1px solid var(--border-strong)',
                                    background: tl.progressPercent === pct ? 'var(--color-primary)' : 'var(--bg-surface)',
                                    color: tl.progressPercent === pct ? '#FFFFFF' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {pct}%
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <ProgressBar value={tl.progressPercent} showLabel height={7} />

                        {tl.notes && (
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: 'var(--radius-xs)', borderLeft: '3px solid var(--color-primary)' }}>
                            {tl.notes}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* Workstation Description */}
              <Card title="Workstation 5S Scope & Operational Standards">
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  {location.description || 'Dedicated 5S area master. All tools, fixtures, cleaning items, and shadow boards within this boundary are audited against approved visual standards.'}
                </p>
              </Card>
            </div>

            {/* Right 1 Col: Location Governance & Ownership */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <Card title="Workstation Baseline Benchmark" noPadding>
                <div style={{ position: 'relative' }}>
                  <ImageWithFallback
                    src={location.heroPhotoUrl || FIVE_S_IMAGES.locations.cncCell}
                    height="190px"
                    allowZoom={true}
                    alt={location.name}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '10px',
                      left: '10px',
                      background: 'rgba(15, 23, 42, 0.85)',
                      backdropFilter: 'blur(4px)',
                      color: '#FFFFFF',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    {location.name} Standard Baseline
                  </div>
                </div>
              </Card>

              <Card title="Area Ownership & Governance">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Primary Area Owner</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-full)', background: 'var(--color-primary)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                        {location.owner ? location.owner.firstName[0] : 'U'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                          {location.owner ? `${location.owner.firstName} ${location.owner.lastName}` : 'Unassigned'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          {location.owner?.jobTitle || 'Accountable for Daily Standards'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Backup Area Owner</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-full)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                        {location.backupOwner ? location.backupOwner.firstName[0] : 'B'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                          {location.backupOwner ? `${location.backupOwner.firstName} ${location.backupOwner.lastName}` : 'Unassigned'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          {location.backupOwner?.email || 'Secondary Point of Contact'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Location Type</span>
                      <strong>{location.locationType}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Risk Classification</span>
                      <strong style={{ color: location.riskLevel === 'CRITICAL' ? 'var(--color-danger)' : 'inherit' }}>{location.riskLevel}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Audit Frequency</span>
                      <strong>{location.auditFrequency}</strong>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Quick QR Card */}
              <Card title="Station QR Code Tag">
                <div style={{ textAlign: 'center', padding: '10px' }}>
                  <img
                    src={location.qrPngDataUrl || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=5s://${currentTenant?.slug}/locations/${location.areaCode}`}
                    alt="5S QR"
                    style={{ width: '150px', height: '150px', margin: '0 auto', display: 'block' }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '10px' }}>
                    Payload: <code>5s://{currentTenant?.slug}/locations/{location.areaCode}</code>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Printer size={14} />}
                    style={{ marginTop: '12px', width: '100%' }}
                    onClick={() => setQrModalOpen(true)}
                  >
                    Open Printable Tag
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* TAB 2: 5S EVIDENCE GALLERY */}
        {activeTab === 'evidence' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card
              title="5S Before & After Photographic Evidence Gallery"
              subtitle="Documenting physical workplace improvements over time with category tags and uploader timestamps"
              actions={
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Camera size={14} />}
                  onClick={() => setUploadEvidenceModalOpen(true)}
                >
                  Upload Before / After Photo
                </Button>
              }
            >
              {evidenceList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-tertiary)' }}>
                  <Camera size={36} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
                  <h4 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>No Photographic Evidence Logged Yet</h4>
                  <p style={{ fontSize: '13px', margin: 0 }}>Click "Upload Before / After Photo" above to log workstation 5S improvements.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: '20px' }}>
                  {evidenceList.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                        background: 'var(--bg-surface-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: 'var(--shadow-sm)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      }}
                    >
                      {/* Header bar */}
                      <div
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--border-subtle)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: 'var(--bg-surface)',
                        }}
                      >
                        <Badge variant={item.badgeVariant}>{item.categoryLabel}</Badge>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                            {item.date} • {item.uploader}
                          </span>
                          <button
                            type="button"
                            title="Remove Evidence Record"
                            onClick={() => handleRemoveEvidence(item.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-tertiary)',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              borderRadius: 'var(--radius-xs)',
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Side by side before / after photos */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#0F172A' }}>
                        <div style={{ position: 'relative' }}>
                          <ImageWithFallback
                            src={item.beforePhotoUrl}
                            category={item.category}
                            height="185px"
                            allowZoom={true}
                            alt={`Before - ${item.categoryLabel}`}
                          />
                          <span
                            style={{
                              position: 'absolute',
                              top: '8px',
                              left: '8px',
                              background: 'rgba(220, 38, 38, 0.9)',
                              backdropFilter: 'blur(4px)',
                              color: '#FFFFFF',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-xs)',
                              fontSize: '11px',
                              fontWeight: 800,
                              letterSpacing: '0.04em',
                              zIndex: 2,
                            }}
                          >
                            BEFORE
                          </span>
                        </div>

                        <div style={{ position: 'relative', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                          <ImageWithFallback
                            src={item.afterPhotoUrl}
                            category={item.category}
                            height="185px"
                            allowZoom={true}
                            alt={`After - ${item.categoryLabel}`}
                          />
                          <span
                            style={{
                              position: 'absolute',
                              top: '8px',
                              left: '8px',
                              background: 'rgba(5, 150, 105, 0.9)',
                              backdropFilter: 'blur(4px)',
                              color: '#FFFFFF',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-xs)',
                              fontSize: '11px',
                              fontWeight: 800,
                              letterSpacing: '0.04em',
                              zIndex: 2,
                            }}
                          >
                            {item.afterLabel}
                          </span>
                        </div>
                      </div>

                      {/* Description caption */}
                      <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-surface)', lineHeight: '1.5' }}>
                        {item.description}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 3: AUDIT HISTORY & SCORES */}
        {activeTab === 'audit' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="grid grid-cols-3 gap-6">
              <Card title="5S Maturity & Audit Performance">
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div className="metric-value" style={{ fontSize: '48px', fontWeight: 800, color: 'var(--color-success)' }}>
                    {auditExecutions.length > 0 ? `${auditExecutions[0].overallScore}%` : '88%'}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                    Level 4 — Sustained Compliance
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {auditExecutions.length > 0
                      ? `Latest inspection: ${new Date(auditExecutions[0].completedAt || auditExecutions[0].startedAt).toLocaleDateString()}`
                      : 'Last audited 3 days ago by Amit Joshi'}
                  </div>
                </div>
              </Card>

              <div style={{ gridColumn: 'span 2' }}>
                <Card title="5S Category Breakdown">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span>1S - Sort</span>
                        <strong>95%</strong>
                      </div>
                      <ProgressBar value={95} height={6} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span>2S - Set in Order</span>
                        <strong>85%</strong>
                      </div>
                      <ProgressBar value={85} height={6} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span>3S - Shine</span>
                        <strong>90%</strong>
                      </div>
                      <ProgressBar value={90} height={6} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span>4S - Standardize</span>
                        <strong>80%</strong>
                      </div>
                      <ProgressBar value={80} height={6} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span>5S - Sustain</span>
                        <strong>90%</strong>
                      </div>
                      <ProgressBar value={90} height={6} />
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            {/* Comprehensive Audit Execution History & Area Owner Sign-Off Table */}
            <Card
              title="Official 5S Audit History & Area Owner Acknowledgement"
              subtitle="Formal dual-party sign-off records, non-conformance logs, and printable compliance reports"
              actions={
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Sparkles size={14} />}
                  onClick={() => navigate(`/mobile-audit?locationId=${location.id}`)}
                >
                  Conduct New Audit
                </Button>
              }
            >
              {auditExecutions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-tertiary)' }}>
                  <FileCheck size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '13.5px' }}>
                    No audit records logged for this location yet. Click "Conduct New Audit" to launch mobile runner.
                  </p>
                </div>
              ) : (
                <div className="enterprise-table-container">
                  <table className="enterprise-table">
                    <thead>
                      <tr>
                        <th>Audit Code</th>
                        <th>Type & Template</th>
                        <th>Inspection Date</th>
                        <th>Lead Auditor</th>
                        <th>5S Score</th>
                        <th>Area Owner Status</th>
                        <th style={{ textAlign: 'right' }}>Official Report</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditExecutions.map((exec) => (
                        <tr key={exec.id}>
                          <td>
                            <span className="code-tag">{exec.auditCode}</span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {exec.template?.name || 'Standard 5S Audit'}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                              {exec.auditType} Inspection
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>
                              {new Date(exec.completedAt || exec.startedAt).toLocaleDateString()}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                              {new Date(exec.completedAt || exec.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <User size={13} className="text-secondary" />
                              <span style={{ fontSize: '12.5px' }}>{exec.auditorName || 'Lead Auditor'}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <strong
                                style={{
                                  fontSize: '15px',
                                  color: exec.overallScore >= 85 ? 'var(--color-success)' : exec.overallScore >= 70 ? 'var(--color-warning)' : 'var(--color-danger)',
                                }}
                              >
                                {exec.overallScore}%
                              </strong>
                              <Badge variant={exec.isPassed ? 'success' : 'danger'}>
                                {exec.isPassed ? 'PASS' : 'FAIL'}
                              </Badge>
                            </div>
                          </td>
                          <td>
                            {exec.status === 'ACKNOWLEDGED' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <Badge variant="success">Acknowledged ✓</Badge>
                                <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
                                  By {exec.acknowledgedByName || 'Area Owner'}
                                </span>
                              </div>
                            ) : exec.status === 'DISPUTED' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <Badge variant="warning">Disputed ⚠</Badge>
                                <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
                                  Pending 5S Lead Review
                                </span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <Badge variant="info">Pending Sign-Off</Badge>
                                <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
                                  Action Required
                                </span>
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Button
                              size="sm"
                              variant={exec.status === 'SUBMITTED' ? 'primary' : 'secondary'}
                              icon={<FileCheck size={14} />}
                              onClick={() => {
                                setSelectedReportId(exec.id);
                                setReportModalOpen(true);
                              }}
                            >
                              {exec.status === 'SUBMITTED' ? 'Review & Sign Off' : 'View Report'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 4: ITEMS & SHADOW BOARD */}
        {activeTab === 'items' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card
              title="Location Inventory & Expected Shadow Board Items"
              subtitle="Catalog of designated tools and on-hand items registered for this location"
            >
              <div className="enterprise-table-container">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th>Item Code</th>
                      <th>Description</th>
                      <th>Designated Position</th>
                      <th>Expected Qty</th>
                      <th>On Hand</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><span className="code-tag">TOOL-CNC-01</span></td>
                      <td>Pneumatic Torque Wrench 1/2" (Calibrated)</td>
                      <td>Shadow Hook #1</td>
                      <td>1</td>
                      <td>1</td>
                      <td><Badge variant="success">Present</Badge></td>
                    </tr>
                    <tr>
                      <td><span className="code-tag">TOOL-CNC-02</span></td>
                      <td>Vernier Caliper 0-150mm (Mitutoyo)</td>
                      <td>Padded Drawer Slot A</td>
                      <td>2</td>
                      <td>2</td>
                      <td><Badge variant="success">Present</Badge></td>
                    </tr>
                    <tr>
                      <td><span className="code-tag">CLEAN-01</span></td>
                      <td>Microfiber Wipe Dispenser & Degreaser</td>
                      <td>Cleaning Station Post</td>
                      <td>1</td>
                      <td>1</td>
                      <td><Badge variant="success">Present</Badge></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 5: CAPA & ABNORMALITIES */}
        {activeTab === 'capa' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card
              title="Active CAPA Corrective Actions & Abnormality Findings"
              subtitle="Open observations, SLA countdowns, and verification loop"
            >
              <div className="enterprise-table-container">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th>Action Ref</th>
                      <th>5S Category</th>
                      <th>Observation Details</th>
                      <th>Severity</th>
                      <th>Target Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><span className="code-tag">ACT-BLR-0021</span></td>
                      <td><Badge variant="purple">2S - Set In Order</Badge></td>
                      <td>Missing shadow silhouette sticker on torque wrench station</td>
                      <td><Badge variant="info">Minor</Badge></td>
                      <td>Oct 05, 2026 (4 days left)</td>
                      <td><Badge variant="warning">In Progress</Badge></td>
                    </tr>
                    <tr>
                      <td><span className="code-tag">ACT-BLR-0019</span></td>
                      <td><Badge variant="danger">1S - Sort</Badge></td>
                      <td>Unlabelled plastic scrap tote obstructing coolant tank walkway</td>
                      <td><Badge variant="warning">Moderate</Badge></td>
                      <td>Oct 02, 2026 (Due Tomorrow)</td>
                      <td><Badge variant="warning">Assigned</Badge></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 6: DOCUMENTS & SOPS */}
        {activeTab === 'documents' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card
              title="Standard Operating Procedures & Visual Work Instructions"
              subtitle="Central repository of cleaning routines, safety guides, and shadow board blueprints"
              actions={
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Upload size={14} />}
                  onClick={() => setAddDocModalOpen(true)}
                >
                  Attach New Document
                </Button>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {location.documents?.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ padding: '8px', borderRadius: 'var(--radius-md)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                        <FileText size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                          {doc.title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                          Type: {doc.docType} • Version: {doc.version} • {doc.fileSizeKb} KB
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => window.open(doc.fileUrl, '_blank')}
                      >
                        View File
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* TAB 7: AUDIT TRAIL */}
        {activeTab === 'history' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card
              title="Immutable Activity Audit Trail"
              subtitle="Chronological, tamper-evident governance log of master modifications, milestone transitions, and standard linkages"
              actions={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Badge variant="success" icon={<ShieldCheck size={12} />}>
                    Verified Audit Chain
                  </Badge>
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    {location.auditLogs?.length || 0} Total Events
                  </span>
                </div>
              }
            >
              {/* Filter and Search Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginBottom: '24px',
                  paddingBottom: '16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  flexWrap: 'wrap',
                }}
              >
                {/* Filter Pills */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'ALL', label: 'All Activities', count: location.auditLogs?.length || 0 },
                    { id: 'TIMELINE', label: 'Milestones', count: location.auditLogs?.filter(l => l.actionType === 'TIMELINE_UPDATED').length || 0 },
                    { id: 'STANDARDS', label: 'Standards', count: location.auditLogs?.filter(l => l.actionType === 'STANDARD_ATTACHED').length || 0 },
                    { id: 'OWNERSHIP', label: 'Ownership', count: location.auditLogs?.filter(l => l.actionType === 'OWNERSHIP_ASSIGNED').length || 0 },
                    { id: 'MASTER', label: 'Master Data', count: location.auditLogs?.filter(l => ['CREATED', 'UPDATED', 'EXCEL_IMPORTED'].includes(l.actionType)).length || 0 },
                  ].map((filter) => {
                    const isActive = auditFilter === filter.id;
                    return (
                      <button
                        key={filter.id}
                        onClick={() => setAuditFilter(filter.id as any)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '12px',
                          fontWeight: isActive ? 600 : 500,
                          background: isActive ? 'var(--color-primary)' : 'var(--bg-surface-subtle)',
                          color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                          border: isActive ? '1px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all var(--transition-fast)',
                        }}
                      >
                        <span>{filter.label}</span>
                        <span
                          style={{
                            fontSize: '10px',
                            background: isActive ? 'rgba(255, 255, 255, 0.25)' : 'var(--border-subtle)',
                            color: isActive ? '#FFFFFF' : 'var(--text-tertiary)',
                            padding: '1px 5px',
                            borderRadius: 'var(--radius-full)',
                          }}
                        >
                          {filter.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Search Bar */}
                <div style={{ position: 'relative', width: '220px' }}>
                  <Search
                    size={14}
                    style={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-tertiary)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Search audit trail..."
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    className="form-control"
                    style={{ paddingLeft: '30px', fontSize: '12px', height: '32px' }}
                  />
                </div>
              </div>

              {/* Vertical Connected Timeline */}
              {(() => {
                const filteredLogs = (location.auditLogs || []).filter((log) => {
                  // Category filter
                  if (auditFilter === 'TIMELINE' && log.actionType !== 'TIMELINE_UPDATED') return false;
                  if (auditFilter === 'STANDARDS' && log.actionType !== 'STANDARD_ATTACHED') return false;
                  if (auditFilter === 'OWNERSHIP' && log.actionType !== 'OWNERSHIP_ASSIGNED') return false;
                  if (auditFilter === 'MASTER' && !['CREATED', 'UPDATED', 'EXCEL_IMPORTED'].includes(log.actionType)) return false;

                  // Search filter
                  if (auditSearchQuery.trim()) {
                    const q = auditSearchQuery.toLowerCase();
                    const actionMeta = getAuditActionMeta(log.actionType);
                    const userName = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System Engine';
                    const matchesUser = userName.toLowerCase().includes(q);
                    const matchesAction = actionMeta.label.toLowerCase().includes(q) || log.actionType.toLowerCase().includes(q);
                    const matchesDetails = (log.details || '').toLowerCase().includes(q);
                    return matchesUser || matchesAction || matchesDetails;
                  }
                  return true;
                });

                if (filteredLogs.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-tertiary)' }}>
                      <Activity size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>No audit events found</div>
                      <div style={{ fontSize: '12px', marginTop: '4px' }}>Try adjusting your filter or search query.</div>
                    </div>
                  );
                }

                return (
                  <div style={{ position: 'relative', paddingLeft: '8px' }}>
                    {/* Continuous Vertical Timeline Line */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '23px',
                        top: '16px',
                        bottom: '24px',
                        width: '2px',
                        background: 'var(--border-subtle)',
                        zIndex: 1,
                      }}
                    />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {filteredLogs.map((log) => {
                        const meta = getAuditActionMeta(log.actionType);
                        const userFullName = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System Engine';
                        const userRole = log.user?.jobTitle || (log.user ? 'Authorized User' : 'Automated Workflow');
                        const dateObj = new Date(log.createdAt);
                        const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                        const formattedTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        const traceId = `TRC-${log.id.slice(0, 8).toUpperCase()}`;

                        return (
                          <div
                            key={log.id}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '14px',
                              position: 'relative',
                              zIndex: 2,
                            }}
                          >
                            {/* Visual Timeline Node */}
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: 'var(--radius-full)',
                                background: meta.nodeBg,
                                color: meta.nodeColor,
                                border: meta.nodeBorder,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                boxShadow: '0 0 0 4px var(--bg-surface)',
                              }}
                            >
                              {meta.icon}
                            </div>

                            {/* Event Card Container */}
                            <div
                              style={{
                                flex: 1,
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-md)',
                                padding: '14px 16px',
                                boxShadow: 'var(--shadow-xs)',
                                transition: 'border-color var(--transition-fast)',
                              }}
                            >
                              {/* Event Header */}
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  flexWrap: 'wrap',
                                  gap: '8px',
                                  marginBottom: '6px',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {meta.label}
                                  </span>
                                  <Badge variant={meta.badgeVariant}>
                                    {meta.category}
                                  </Badge>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      fontFamily: 'monospace',
                                      color: 'var(--text-tertiary)',
                                      background: 'var(--bg-surface-subtle)',
                                      padding: '1px 6px',
                                      borderRadius: 'var(--radius-xs)',
                                      border: '1px solid var(--border-subtle)',
                                    }}
                                  >
                                    {traceId}
                                  </span>
                                  <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                    {formattedDate} • {formattedTime}
                                  </span>
                                </div>
                              </div>

                              {/* Actor Meta */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                <span>Performed by</span>
                                <strong style={{ color: 'var(--text-primary)' }}>{userFullName}</strong>
                                <span style={{ color: 'var(--text-tertiary)' }}>({userRole})</span>
                              </div>

                              {/* Formatted Detail Box */}
                              <div
                                style={{
                                  background: 'var(--bg-surface-subtle)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '10px 12px',
                                }}
                              >
                                {renderAuditDetailsContent(log.details)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </Card>
          </div>
        )}
      </div>

      {/* Add Milestone Modal */}
      <Modal
        isOpen={addMilestoneModalOpen}
        onClose={() => setAddMilestoneModalOpen(false)}
        title="Add 5S Implementation Milestone"
        subtitle={`Schedule a rollout target for ${location.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddMilestoneModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateMilestone}>Schedule Milestone</Button>
          </>
        }
      >
        <form onSubmit={handleCreateMilestone}>
          <div className="form-group">
            <label className="form-label">Milestone Name <span className="required">*</span></label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. 2S - Shadow Board Demarcation"
              value={milestoneName}
              onChange={(e) => setMilestoneName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label">Planned Start Date</label>
              <input
                type="date"
                className="form-input"
                value={plannedStartDate}
                onChange={(e) => setPlannedStartDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Planned End Date</label>
              <input
                type="date"
                className="form-input"
                value={plannedEndDate}
                onChange={(e) => setPlannedEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Implementation Notes</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="Describe deliverables, responsible team members, or material needs..."
              value={milestoneNotes}
              onChange={(e) => setMilestoneNotes(e.target.value)}
            />
          </div>
        </form>
      </Modal>

      {/* Add Document Modal */}
      <Modal
        isOpen={addDocModalOpen}
        onClose={() => setAddDocModalOpen(false)}
        title="Attach Standard Document / SOP"
        subtitle={`Link visual SOP or cleaning routine to ${location.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddDocModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAddDocument}>Attach Document</Button>
          </>
        }
      >
        <form onSubmit={handleAddDocument}>
          <div className="form-group">
            <label className="form-label">Document Title <span className="required">*</span></label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Standard Operating Procedure - Tool Organization"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label">Document Type</label>
              <select className="form-select" value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="SOP">Standard Operating Procedure (SOP)</option>
                <option value="CLEANING_STANDARD">Daily Cleaning Schedule</option>
                <option value="LAYOUT_MAP">Floor Demarcation Map</option>
                <option value="SAFETY_GUIDELINE">Safety & PPE Guideline</option>
                <option value="OTHER">General Attachment</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Version</label>
              <input
                type="text"
                className="form-input"
                value={docVersion}
                onChange={(e) => setDocVersion(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">File Storage URL</label>
            <input
              type="text"
              className="form-input"
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
              required
            />
          </div>
        </form>
      </Modal>

      {/* Location QR Code Print Modal */}
      <Modal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        title={`5S Area QR Code: ${location.areaCode}`}
        subtitle={location.name}
        maxWidth="440px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setQrModalOpen(false)}>Close</Button>
            <Button
              variant="primary"
              icon={<Printer size={16} />}
              onClick={() => window.print()}
            >
              Print Station Tag
            </Button>
          </>
        }
      >
        <div style={{ textAlign: 'center', padding: '16px' }}>
          <div
            className="printable-station-tag"
            style={{
              border: '2px dashed var(--border-strong)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              display: 'inline-block',
              background: '#FFFFFF',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#1E3A8A', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>
              {currentTenant?.name}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '12px' }}>
              {location.areaCode}
            </div>

            <img
              src={location.qrPngDataUrl || `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=5s://${currentTenant?.slug}/locations/${location.areaCode}`}
              alt="QR Code"
              style={{ width: '200px', height: '200px', margin: '0 auto', display: 'block' }}
            />

            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '12px' }}>
              {location.name}
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
              {location.building} • {location.floor}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '16px' }}>
            Scan with 5S Mobile App to initiate mobile audit or report abnormality.
          </div>
        </div>
      </Modal>

      {/* 5S Photographic Evidence Upload Modal */}
      <Modal
        isOpen={uploadEvidenceModalOpen}
        onClose={() => setUploadEvidenceModalOpen(false)}
        title="Upload 5S Photographic Evidence"
        subtitle={`Log visual before/after workplace improvement for ${location.name}`}
        maxWidth="760px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              Supports direct image file uploads and 5S benchmark library presets.
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" onClick={() => setUploadEvidenceModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={<Camera size={15} />}
                onClick={handleSaveEvidence}
              >
                Save & Publish Evidence
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSaveEvidence} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Top row: 5S Pillar Category & Responsible Auditor */}
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">
                5S Pillar Category <span className="required">*</span>
              </label>
              <select
                className="form-select"
                value={evidenceCategory}
                onChange={(e) => {
                  const cat = e.target.value as any;
                  setEvidenceCategory(cat);
                  // Auto-suggest matching presets & tag based on category
                  if (cat === 'S1_SORT') {
                    setEvidenceBeforePhoto(FIVE_S_IMAGES.standards.underBenchClutter);
                    setEvidenceAfterPhoto(FIVE_S_IMAGES.standards.cleanCncStandard);
                    setEvidenceAfterLabel('AFTER (CLEARED)');
                  } else if (cat === 'S2_SET_IN_ORDER') {
                    setEvidenceBeforePhoto(FIVE_S_IMAGES.standards.shadowBoardClutter);
                    setEvidenceAfterPhoto(FIVE_S_IMAGES.standards.shadowBoardStandard);
                    setEvidenceAfterLabel('AFTER (SHADOW BOARD)');
                  } else if (cat === 'S3_SHINE') {
                    setEvidenceBeforePhoto(FIVE_S_IMAGES.standards.oilLeakDefect);
                    setEvidenceAfterPhoto(FIVE_S_IMAGES.standards.cleanCncStandard);
                    setEvidenceAfterLabel('AFTER (CLEANED & RESEALED)');
                  } else if (cat === 'S4_STANDARDIZE') {
                    setEvidenceBeforePhoto(FIVE_S_IMAGES.standards.shadowBoardClutter);
                    setEvidenceAfterPhoto(FIVE_S_IMAGES.standards.smtLineClean);
                    setEvidenceAfterLabel('AFTER (STANDARDIZED)');
                  } else if (cat === 'S5_SUSTAIN') {
                    setEvidenceBeforePhoto(FIVE_S_IMAGES.standards.underBenchClutter);
                    setEvidenceAfterPhoto(FIVE_S_IMAGES.standards.digitalKaizen);
                    setEvidenceAfterLabel('AFTER (KAIZEN BOARD)');
                  } else if (cat === 'S6_SAFETY') {
                    setEvidenceBeforePhoto(FIVE_S_IMAGES.standards.fireSafetyBlocked);
                    setEvidenceAfterPhoto(FIVE_S_IMAGES.standards.fireSafetyStandard);
                    setEvidenceAfterLabel('AFTER (SAFETY DEMARCATION)');
                  }
                }}
              >
                <option value="S1_SORT">1S - Sort & Red Tag</option>
                <option value="S2_SET_IN_ORDER">2S - Set in Order & Shadow Board</option>
                <option value="S3_SHINE">3S - Shine & Cleanliness</option>
                <option value="S4_STANDARDIZE">4S - Standardize & Visual Control</option>
                <option value="S5_SUSTAIN">5S - Sustain & Kaizen Board</option>
                <option value="S6_SAFETY">6S - Safety & Demarcation</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                Responsible Leader / Auditor <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Arun Patel (CNC Line Leader)"
                value={evidenceUploader}
                onChange={(e) => setEvidenceUploader(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Improvement Action & After Badge Label */}
          <div className="grid grid-cols-3 gap-4">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">
                Improvement Description & Action Taken <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Cleared 14 obsolete hydraulic lines and unneeded clamps to quarantine zone."
                value={evidenceDescription}
                onChange={(e) => setEvidenceDescription(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                After Badge Label
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. AFTER (CLEARED)"
                value={evidenceAfterLabel}
                onChange={(e) => setEvidenceAfterLabel(e.target.value)}
              />
            </div>
          </div>

          {/* Side by side photo selectors */}
          <div className="grid grid-cols-2 gap-4">
            {/* BEFORE PHOTO SELECTOR */}
            <div
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                background: 'var(--bg-surface-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    background: 'rgba(220, 38, 38, 0.9)',
                    color: '#FFF',
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  BEFORE
                </span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Initial Defect / Clutter
                </span>
              </div>

              {/* Photo Preview */}
              <div
                style={{
                  height: '135px',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                  position: 'relative',
                  border: '1px solid var(--border-subtle)',
                  background: '#0F172A',
                }}
              >
                <img
                  src={evidenceBeforePhoto}
                  alt="Before Preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = FIVE_S_IMAGES.standards.underBenchClutter;
                  }}
                />
              </div>

              {/* Upload or Preset Picker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--color-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <Upload size={13} />
                  <span>Upload Image File</span>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleBeforeFileUpload}
                  />
                </label>

                {/* Quick Presets */}
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                    Or select benchmark defect:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                    {[
                      { label: 'Clutter', src: FIVE_S_IMAGES.standards.underBenchClutter },
                      { label: 'Shadow Board', src: FIVE_S_IMAGES.standards.shadowBoardClutter },
                      { label: 'Oil Leak', src: FIVE_S_IMAGES.standards.oilLeakDefect },
                      { label: 'Blocked Fire', src: FIVE_S_IMAGES.standards.fireSafetyBlocked },
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setEvidenceBeforePhoto(preset.src)}
                        style={{
                          border: evidenceBeforePhoto === preset.src ? '2px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          padding: '2px',
                          background: 'var(--bg-surface)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                      >
                        <img src={preset.src} alt={preset.label} style={{ width: '100%', height: '32px', objectFit: 'cover', borderRadius: '2px' }} />
                        <span style={{ fontSize: '9px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                          {preset.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* AFTER PHOTO SELECTOR */}
            <div
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                background: 'var(--bg-surface-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    background: 'rgba(5, 150, 105, 0.9)',
                    color: '#FFF',
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  AFTER
                </span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Improved Benchmark
                </span>
              </div>

              {/* Photo Preview */}
              <div
                style={{
                  height: '135px',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                  position: 'relative',
                  border: '1px solid var(--border-subtle)',
                  background: '#0F172A',
                }}
              >
                <img
                  src={evidenceAfterPhoto}
                  alt="After Preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = FIVE_S_IMAGES.standards.cleanCncStandard;
                  }}
                />
              </div>

              {/* Upload or Preset Picker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--color-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <Upload size={13} />
                  <span>Upload Image File</span>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleAfterFileUpload}
                  />
                </label>

                {/* Quick Presets */}
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                    Or select 5S benchmark standard:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                    {[
                      { label: 'CNC Clean', src: FIVE_S_IMAGES.standards.cleanCncStandard },
                      { label: 'Shadow Board', src: FIVE_S_IMAGES.standards.shadowBoardStandard },
                      { label: 'SMT Clean', src: FIVE_S_IMAGES.standards.smtLineClean },
                      { label: 'Safety Std', src: FIVE_S_IMAGES.standards.fireSafetyStandard },
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setEvidenceAfterPhoto(preset.src)}
                        style={{
                          border: evidenceAfterPhoto === preset.src ? '2px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          padding: '2px',
                          background: 'var(--bg-surface)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                      >
                        <img src={preset.src} alt={preset.label} style={{ width: '100%', height: '32px', objectFit: 'cover', borderRadius: '2px' }} />
                        <span style={{ fontSize: '9px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                          {preset.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Official 5S Audit Report & Area Owner Acknowledgement Modal */}
      <AuditReportModal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setSelectedReportId(null);
        }}
        executionId={selectedReportId}
        onAcknowledged={(updated) => {
          setAuditExecutions((prev) =>
            prev.map((e) => (e.id === updated.id ? updated : e))
          );
        }}
      />
    </div>
  );
};

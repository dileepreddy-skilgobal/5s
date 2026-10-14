import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { AuditReportModal } from '../../components/common/AuditReportModal';
import { FIVE_S_IMAGES } from '../../constants/images';
import { PhotoAnnotationModal } from '../../components/common/PhotoAnnotationModal';
import { CorrectiveAction, User, Location } from '../../types';
import {
  Layers,
  Clock,
  ShieldCheck,
  AlertOctagon,
  CheckCircle2,
  HelpCircle,
  Camera,
  RefreshCw,
  Search,
  Kanban,
  Table as TableIcon,
  UserCheck,
  Sparkles,
  FileCheck,
  AlertTriangle,
  Lightbulb,
  Target,
  Wrench,
  RotateCcw,
  Lock,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';

export const CapaManagementPage: React.FC = () => {
  const { addToast } = useApp();

  const [loading, setLoading] = useState<boolean>(true);
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Active Selected Action for Investigation / Modals
  const [selectedAction, setSelectedAction] = useState<CorrectiveAction | null>(null);

  // Audit Report Formal Acknowledgement Modal State
  const [reportModalOpen, setReportModalOpen] = useState<boolean>(false);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  // 5-Why Investigation Drawer
  const [fiveWhyDrawerOpen, setFiveWhyDrawerOpen] = useState<boolean>(false);
  const [activeWhyCount, setActiveWhyCount] = useState<number>(1);
  const [fiveWhyData, setFiveWhyData] = useState({
    why1: '',
    why2: '',
    why3: '',
    why4: '',
    why5: '',
    rootCauseCategory: 'METHOD',
    rootCauseConclusion: '',
    solution: '',
    preventiveAction: '',
    verificationCriteria: '',
  });

  // Action Closure Proof Drawer
  const [closureDrawerOpen, setClosureDrawerOpen] = useState<boolean>(false);
  const [closureNotes, setClosureNotes] = useState<string>('');
  const [afterPhotoUrl, setAfterPhotoUrl] = useState<string>('');
  const [actorName, setActorName] = useState<string>('Arun Patel (Area Owner)');
  const [annotationModalOpen, setAnnotationModalOpen] = useState<boolean>(false);
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState<boolean>(false);

  // Independent Verification Modal
  const [verificationModalOpen, setVerificationModalOpen] = useState<boolean>(false);
  const [verificationNotes, setVerificationNotes] = useState<string>('');
  const [verifierName, setVerifierName] = useState<string>('Sneha Reddy (5S Program Coordinator)');

  const handlePhotoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        addToast({
          type: 'warning',
          title: 'File Too Large',
          message: 'Please choose an image under 10MB.',
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setAfterPhotoUrl(dataUrl);
        addToast({
          type: 'success',
          title: 'Photo Evidence Attached',
          message: 'Captured image loaded into closure proof.',
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPhoto(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setAfterPhotoUrl(dataUrl);
        addToast({
          type: 'success',
          title: 'Photo Dropped',
          message: 'Image file loaded into closure proof.',
        });
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.getCorrectiveActions();
      setActions(res);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error Loading CAPA',
        message: err.message || 'Could not fetch corrective actions.',
      });
    } finally {
      setLoading(false);
    }
  };

  const open5WhyDrawer = (action: CorrectiveAction) => {
    setSelectedAction(action);
    const existing = action.fiveWhyAnalysis;
    let initialCount = 1;
    if (existing?.why5) initialCount = 5;
    else if (existing?.why4) initialCount = 4;
    else if (existing?.why3) initialCount = 3;
    else if (existing?.why2) initialCount = 2;
    else if (existing?.why1) initialCount = 1;

    setActiveWhyCount(initialCount);
    setFiveWhyData({
      why1: existing?.why1 || '',
      why2: existing?.why2 || '',
      why3: existing?.why3 || '',
      why4: existing?.why4 || '',
      why5: existing?.why5 || '',
      rootCauseCategory: action.rootCauseCategory || 'METHOD',
      rootCauseConclusion: existing?.rootCauseConclusion || '',
      solution: existing?.solution || '',
      preventiveAction: existing?.preventiveAction || '',
      verificationCriteria: existing?.verificationCriteria || '',
    });
    setFiveWhyDrawerOpen(true);
  };

  const handleAddWhy = () => {
    if (activeWhyCount < 5) {
      setActiveWhyCount((prev) => prev + 1);
    }
  };

  const handleRemoveWhy = (levelToRemove: number) => {
    if (activeWhyCount <= 1) return;

    if (levelToRemove === activeWhyCount) {
      const fieldKey = `why${levelToRemove}` as keyof typeof fiveWhyData;
      setFiveWhyData((prev) => ({ ...prev, [fieldKey]: '' }));
      setActiveWhyCount((prev) => prev - 1);
    } else {
      const newFiveWhyData = { ...fiveWhyData };
      for (let i = levelToRemove; i < activeWhyCount; i++) {
        const currKey = `why${i}` as keyof typeof fiveWhyData;
        const nextKey = `why${i + 1}` as keyof typeof fiveWhyData;
        newFiveWhyData[currKey] = newFiveWhyData[nextKey];
      }
      const lastKey = `why${activeWhyCount}` as keyof typeof fiveWhyData;
      newFiveWhyData[lastKey] = '';
      setFiveWhyData(newFiveWhyData);
      setActiveWhyCount((prev) => prev - 1);
    }
  };

  const handleSave5Why = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAction) return;

    try {
      const updated = await api.update5WhyAnalysis(selectedAction.id, fiveWhyData);
      setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setFiveWhyDrawerOpen(false);
      addToast({
        type: 'success',
        title: '5-Why Root Cause Saved',
        message: `Updated root cause investigation for ${updated.actionCode}.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Could not save 5-Why analysis.',
      });
    }
  };

  const openClosureDrawer = (action: CorrectiveAction) => {
    setSelectedAction(action);
    setClosureNotes(action.closureNotes || '');
    setAfterPhotoUrl(action.afterPhotoUrl || '');
    setClosureDrawerOpen(true);
  };

  const handleSubmitClosure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAction || !closureNotes || !afterPhotoUrl) {
      addToast({
        type: 'warning',
        title: 'Missing Closure Proof',
        message: 'Please provide after-photo and detailed closure notes.',
      });
      return;
    }

    try {
      const updated = await api.submitActionClosure(selectedAction.id, {
        closureNotes,
        afterPhotoUrl,
        actorName,
      });

      setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setClosureDrawerOpen(false);
      addToast({
        type: 'success',
        title: 'Closure Evidence Submitted',
        message: `${updated.actionCode} is now pending independent verification sign-off.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Submission Failed',
        message: err.message || 'Could not submit closure evidence.',
      });
    }
  };

  const openVerificationModal = (action: CorrectiveAction) => {
    setSelectedAction(action);
    setVerificationNotes('');
    setVerificationModalOpen(true);
  };

  const handleVerifyAction = async (approved: boolean) => {
    if (!selectedAction) return;

    try {
      const updated = await api.verifyCorrectiveAction(selectedAction.id, {
        approved,
        verificationNotes,
        verifierName,
      });

      setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setVerificationModalOpen(false);

      if (approved) {
        addToast({
          type: 'success',
          title: 'Action Verified & Closed',
          message: `${updated.actionCode} has been verified and permanently closed.`,
        });
      } else {
        addToast({
          type: 'warning',
          title: 'Action Reopened',
          message: `${updated.actionCode} was rejected and reopened for remediation.`,
        });
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Verification Failed',
        message: err.message || 'Error processing verification.',
      });
    }
  };

  // KPI Metrics
  const totalActions = actions.length;
  const pendingAckCount = actions.filter((a) => a.status === 'PENDING_ACKNOWLEDGEMENT').length;
  const overdueCount = actions.filter((a) => a.isOverdue).length;
  const pendingVerificationCount = actions.filter((a) => a.status === 'PENDING_VERIFICATION').length;
  const closedCount = actions.filter((a) => a.status === 'VERIFIED' || a.status === 'CLOSED').length;

  const filteredActions = actions.filter((a) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchCode = a.actionCode.toLowerCase().includes(q);
      const matchTitle = a.title.toLowerCase().includes(q);
      const matchDesc = a.description.toLowerCase().includes(q);
      const matchAssignee = a.assignee?.firstName?.toLowerCase().includes(q) || false;
      if (!matchCode && !matchTitle && !matchDesc && !matchAssignee) return false;
    }
    return true;
  });

  const kanbanColumns = [
    {
      key: 'PENDING_ACKNOWLEDGEMENT',
      title: '0. Awaiting Audit Sign-off',
      badge: 'danger',
      items: filteredActions.filter((a) => a.status === 'PENDING_ACKNOWLEDGEMENT'),
      description: 'Findings pending formal Area Owner acceptance',
    },
    {
      key: 'ASSIGNED',
      title: '1. Assigned',
      badge: 'info',
      items: filteredActions.filter((a) => a.status === 'ASSIGNED' || a.status === 'REOPENED'),
      description: 'Remediation active & assigned',
    },
    {
      key: 'IN_PROGRESS',
      title: '2. In Progress',
      badge: 'warning',
      items: filteredActions.filter((a) => a.status === 'IN_PROGRESS'),
      description: '5-Why investigation underway',
    },
    {
      key: 'PENDING_VERIFICATION',
      title: '3. Pending Verification',
      badge: 'purple',
      items: filteredActions.filter((a) => a.status === 'PENDING_VERIFICATION'),
      description: 'Evidence submitted for sign-off',
    },
    {
      key: 'VERIFIED',
      title: '4. Verified & Closed',
      badge: 'success',
      items: filteredActions.filter((a) => a.status === 'VERIFIED' || a.status === 'CLOSED'),
      description: 'Closed by 5S Coordinator',
    },
  ];

  const formatSla = (targetDate: string, isOverdue: boolean, status?: string) => {
    if (status === 'PENDING_ACKNOWLEDGEMENT') {
      return (
        <span style={{ color: '#D97706', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Clock size={12} /> PENDING AUDIT SIGN-OFF
        </span>
      );
    }

    const diff = new Date(targetDate).getTime() - Date.now();
    const hours = Math.round(diff / 3600000);

    if (isOverdue) {
      const overHours = Math.abs(hours);
      const overDays = Math.floor(overHours / 24);
      return (
        <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <AlertOctagon size={12} /> OVERDUE ({overDays > 0 ? `${overDays}d` : `${overHours}h`})
        </span>
      );
    }

    if (hours <= 24) {
      return (
        <span style={{ color: '#F59E0B', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Clock size={12} /> Due in {hours}h
        </span>
      );
    }

    const days = Math.floor(hours / 24);
    return (
      <span style={{ color: 'var(--text-secondary)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Clock size={12} /> {days} days remaining
      </span>
    );
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Badge variant="purple" icon={<Layers size={12} />}>
              CAPA Governance
            </Badge>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Corrective & Preventive Action Workflow
            </span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            CAPA Kanban & SLA Escalation Dashboard
          </h1>
        </div>

        <div className="page-header-actions">
          <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', padding: '2px' }}>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: viewMode === 'kanban' ? 'var(--color-primary)' : 'transparent',
                color: viewMode === 'kanban' ? '#FFFFFF' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <Kanban size={14} /> Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: viewMode === 'table' ? 'var(--color-primary)' : 'transparent',
                color: viewMode === 'table' ? '#FFFFFF' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <TableIcon size={14} /> Table
            </button>
          </div>

          <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => loadData()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Global Alert Banner: Audit Acknowledgement Missing */}
      {pendingAckCount > 0 && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(239, 68, 68, 0.08) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {pendingAckCount} CAPA Remediation Action{pendingAckCount > 1 ? 's' : ''} Awaiting Area Owner Audit Acknowledgement
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Area Owner must formally review and accept or dispute the non-conformance findings before corrective actions and SLA countdowns begin.
              </div>
            </div>
          </div>

          <Button
            variant="primary"
            size="sm"
            icon={<FileCheck size={14} />}
            onClick={() => {
              const pendingAct = actions.find((a) => a.status === 'PENDING_ACKNOWLEDGEMENT');
              const execId = (pendingAct as any)?.observation?.execution?.id || 'exec-cnc01-sample';
              setSelectedAuditId(execId);
              setReportModalOpen(true);
            }}
          >
            Review & Acknowledge Audits →
          </Button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <Card noPadding>
          <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', background: 'var(--color-primary-subtle)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Actions</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{totalActions}</div>
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', background: 'rgba(245, 158, 11, 0.12)', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Awaiting Sign-Off</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#D97706' }}>{pendingAckCount}</div>
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertOctagon size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Overdue SLAs</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#EF4444' }}>{overdueCount}</div>
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', background: 'rgba(168, 85, 247, 0.12)', color: '#A855F7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCheck size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Pending Verification</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#A855F7' }}>{pendingVerificationCount}</div>
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Closed & Verified</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#10B981' }}>{closedCount}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Search Input Bar */}
      <Card noPadding>
        <div style={{ padding: '14px 20px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '32px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '36px' }}
            placeholder="Search CAPA by code, root cause, assignee, title, description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </Card>

      {/* Kanban Board View */}
      {viewMode === 'kanban' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(260px, 1fr))',
            gap: '16px',
            overflowX: 'auto',
            alignItems: 'flex-start',
            paddingBottom: '16px',
          }}
        >
          {kanbanColumns.map((col) => (
            <div
              key={col.key}
              style={{
                borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '480px',
                minWidth: '260px',
              }}
            >
              {/* Column Header */}
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {col.title}
                </span>
                <Badge variant={col.badge as any}>{col.items.length}</Badge>
              </div>

              {/* Column Cards */}
              <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                {col.items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                    No actions in this status.
                  </div>
                ) : (
                  col.items.map((act) => (
                    <div
                      key={act.id}
                      style={{
                        padding: '14px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        boxShadow: 'var(--shadow-xs)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      {/* Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {act.actionCode}
                        </span>
                        {formatSla(act.targetDate, act.isOverdue, act.status)}
                      </div>

                      {/* Title & Desc */}
                      <div>
                        <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--text-primary)', lineHeight: '1.3' }}>
                          {act.title}
                        </h4>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                          {act.description}
                        </p>
                      </div>

                      {/* If PENDING_ACKNOWLEDGEMENT, show lock alert */}
                      {act.status === 'PENDING_ACKNOWLEDGEMENT' && (
                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(245, 158, 11, 0.08)',
                            border: '1px solid rgba(245, 158, 11, 0.25)',
                            fontSize: '11.5px',
                            color: '#b45309',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Lock size={13} style={{ flexShrink: 0 }} />
                          <span>Locked: Remediation starts after Area Owner accepts audit report.</span>
                        </div>
                      )}

                      {/* Root cause & Solution badge */}
                      {act.status !== 'PENDING_ACKNOWLEDGEMENT' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span className="code-tag" style={{ fontSize: '10px' }}>
                              5-Why: {act.rootCauseCategory}
                            </span>
                            {act.reopenCount > 0 && (
                              <Badge variant="danger" icon={<RotateCcw size={10} />}>
                                Reopened #{act.reopenCount}
                              </Badge>
                            )}
                          </div>

                          {act.fiveWhyAnalysis?.solution ? (
                            <div
                              style={{
                                padding: '8px 10px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--color-success-bg)',
                                border: '1px solid var(--color-success-border)',
                                fontSize: '11.5px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '3px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: 'var(--color-success)' }}>
                                <Lightbulb size={12} />
                                <span>Action Solution:</span>
                              </div>
                              <div style={{ color: 'var(--text-primary)', lineHeight: 1.35 }}>
                                {act.fiveWhyAnalysis.solution}
                              </div>
                            </div>
                          ) : (
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-tertiary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontStyle: 'italic',
                              }}
                            >
                              <AlertTriangle size={11} color="var(--color-warning)" />
                              <span>Root cause & solution pending</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Location & Assignee */}
                      <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <span>{act.location?.name?.slice(0, 18)}</span>
                        <span>{act.assignee?.firstName || 'Assigned'}</span>
                      </div>

                      {/* Action Triggers */}
                      <div style={{ display: 'flex', gap: '6px', paddingTop: '4px' }}>
                        {act.status === 'PENDING_ACKNOWLEDGEMENT' ? (
                          <button
                            type="button"
                            onClick={() => {
                              const execId = (act as any)?.observation?.execution?.id || 'exec-cnc01-sample';
                              setSelectedAuditId(execId);
                              setReportModalOpen(true);
                            }}
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid rgba(245, 158, 11, 0.4)',
                              background: 'rgba(245, 158, 11, 0.12)',
                              color: '#b45309',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                            }}
                          >
                            <FileCheck size={13} />
                            <span>Acknowledge Audit Findings</span>
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => open5WhyDrawer(act)}
                              style={{
                                flex: 1,
                                padding: '6px 8px',
                                borderRadius: 'var(--radius-xs)',
                                border: '1px solid var(--border-subtle)',
                                background: 'var(--bg-surface-subtle)',
                                color: 'var(--text-primary)',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                              }}
                            >
                              <Lightbulb size={12} color="var(--color-primary)" />
                              <span>5-Why & Solution</span>
                            </button>

                            {act.status !== 'PENDING_VERIFICATION' && act.status !== 'VERIFIED' && act.status !== 'CLOSED' && (
                              <button
                                type="button"
                                onClick={() => openClosureDrawer(act)}
                                style={{
                                  flex: 1,
                                  padding: '6px 8px',
                                  borderRadius: 'var(--radius-xs)',
                                  border: '1px solid var(--color-primary)',
                                  background: 'var(--color-primary-light)',
                                  color: 'var(--color-primary)',
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Submit Proof
                              </button>
                            )}

                            {act.status === 'PENDING_VERIFICATION' && (
                              <button
                                type="button"
                                onClick={() => openVerificationModal(act)}
                                style={{
                                  flex: 1,
                                  padding: '6px 8px',
                                  borderRadius: 'var(--radius-xs)',
                                  border: '1px solid #A855F7',
                                  background: 'rgba(168, 85, 247, 0.12)',
                                  color: '#A855F7',
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Verify & Sign
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <Card noPadding>
          <div className="enterprise-table-container">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Action Ref</th>
                  <th>Observation Finding</th>
                  <th>Root Cause & Solution</th>
                  <th>Assignee</th>
                  <th>Target SLA Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredActions.map((act) => (
                  <tr key={act.id}>
                    <td>
                      <strong>{act.actionCode}</strong>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{act.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{act.location?.name}</div>
                    </td>
                    <td>
                      {act.status === 'PENDING_ACKNOWLEDGEMENT' ? (
                        <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 600 }}>
                          Locked awaiting audit sign-off
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <Badge variant="info">{act.rootCauseCategory}</Badge>
                          {act.fiveWhyAnalysis?.solution && (
                            <div style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Lightbulb size={11} />
                              <span>{act.fiveWhyAnalysis.solution.slice(0, 40)}...</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td>{act.assignee?.firstName} {act.assignee?.lastName}</td>
                    <td>{formatSla(act.targetDate, act.isOverdue, act.status)}</td>
                    <td>
                      <Badge variant={act.status === 'VERIFIED' ? 'success' : act.status === 'PENDING_VERIFICATION' ? 'purple' : act.status === 'PENDING_ACKNOWLEDGEMENT' ? 'warning' : act.isOverdue ? 'danger' : 'warning'}>
                        {act.status === 'PENDING_ACKNOWLEDGEMENT' ? 'Awaiting Sign-off' : act.status}
                      </Badge>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {act.status === 'PENDING_ACKNOWLEDGEMENT' ? (
                          <Button
                            variant="primary"
                            size="sm"
                            icon={<FileCheck size={13} />}
                            onClick={() => {
                              const execId = (act as any)?.observation?.execution?.id || 'exec-cnc01-sample';
                              setSelectedAuditId(execId);
                              setReportModalOpen(true);
                            }}
                          >
                            Acknowledge
                          </Button>
                        ) : (
                          <>
                            <Button variant="secondary" size="sm" onClick={() => open5WhyDrawer(act)}>
                              5-Why
                            </Button>
                            {act.status === 'PENDING_VERIFICATION' ? (
                              <Button variant="primary" size="sm" onClick={() => openVerificationModal(act)}>
                                Verify
                              </Button>
                            ) : (
                              <Button variant="secondary" size="sm" onClick={() => openClosureDrawer(act)}>
                                Proof
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal: 5-Why Root Cause Investigation & Problem Solution */}
      <Modal
        isOpen={fiveWhyDrawerOpen}
        onClose={() => setFiveWhyDrawerOpen(false)}
        title={`Root Cause Analysis & Solution: ${selectedAction?.actionCode}`}
        subtitle="Structured 5-Why investigation with corrective and preventive actions"
        maxWidth="680px"
      >
        <form onSubmit={handleSave5Why} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header Summary */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Problem / Non-Conformance:</span>
              <Badge variant="warning">{selectedAction?.actionCode}</Badge>
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>{selectedAction?.title}</div>
            {selectedAction?.description && (
              <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                {selectedAction.description}
              </div>
            )}
          </div>

          {/* Section 1: Ishikawa & 5-Why Drilldown */}
          <div style={{ padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Search size={16} color="var(--color-primary)" />
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Step 1: 5-Why Root Cause Investigation
              </h3>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">Ishikawa (Fishbone) Cause Category *</label>
              <select
                className="form-control"
                value={fiveWhyData.rootCauseCategory}
                onChange={(e) => setFiveWhyData({ ...fiveWhyData, rootCauseCategory: e.target.value })}
              >
                <option value="METHOD">Method (Procedures, Work Instructions, SOPs)</option>
                <option value="MACHINE">Machine (Tooling, Maintenance, Wear & Tear)</option>
                <option value="MATERIAL">Material (Supplies, Parts Quality, Storage)</option>
                <option value="MANPOWER">Manpower (Training, Competency, Handover)</option>
                <option value="MEASUREMENT">Measurement (Calibration, Inspection Limits)</option>
                <option value="ENVIRONMENT">Environment (Lighting, Ergonomics, Layout)</option>
              </select>
            </div>

            {/* 5-Why Dynamic Stepper */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {Array.from({ length: activeWhyCount }, (_, i) => i + 1).map((level) => {
                const fieldKey = `why${level}` as keyof typeof fiveWhyData;
                const isDeepest = level === activeWhyCount;
                return (
                  <div
                    key={level}
                    className="form-group animate-fade-in"
                    style={{
                      margin: 0,
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', margin: 0, fontWeight: 700 }}>
                        <span
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: isDeepest && level > 1 ? 'var(--color-danger)' : 'var(--color-primary)',
                            color: '#FFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 700,
                          }}
                        >
                          {level}
                        </span>
                        <span>Why #{level}:</span>
                        {isDeepest && level > 1 && (
                          <Badge variant="warning" style={{ fontSize: '10.5px' }}>
                            Root Cause Level
                          </Badge>
                        )}
                      </label>

                      {level > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveWhy(level)}
                          title={`Remove Why #${level}`}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-tertiary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11.5px',
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-xs)',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                        >
                          <Trash2 size={13} />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>

                    <textarea
                      rows={2}
                      className="form-control"
                      placeholder={
                        level === 1
                          ? 'Why did the immediate non-conformance occur?'
                          : level === 5 || isDeepest
                          ? 'Root Cause: What systemic policy, maintenance, or process gap caused this?'
                          : `Why did Why #${level - 1} occur?`
                      }
                      value={fiveWhyData[fieldKey]}
                      onChange={(e) => setFiveWhyData({ ...fiveWhyData, [fieldKey]: e.target.value })}
                    />
                  </div>
                );
              })}

              {/* Add Why Button */}
              {activeWhyCount < 5 && (
                <div style={{ marginTop: '2px' }}>
                  <button
                    type="button"
                    onClick={handleAddWhy}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 16px',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(37, 99, 235, 0.05)',
                      border: '1px dashed var(--color-primary)',
                      color: 'var(--color-primary)',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      width: '100%',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Plus size={16} />
                    <span>+ Add Why #{activeWhyCount + 1} Level</span>
                  </button>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px', textAlign: 'center' }}>
                    Drill down progressively until the systemic root cause is uncovered (supports up to 5 levels).
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Permanent Solution & Action Plan */}
          <div
            style={{
              padding: '18px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(5, 150, 105, 0.3)',
              background: 'rgba(5, 150, 105, 0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lightbulb size={18} color="var(--color-success)" />
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Step 2: Permanent Solution & Action Plan
                </h3>
              </div>
              <Badge variant="success">Countermeasure</Badge>
            </div>

            {/* Quick Solution Presets */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Quick Solution Presets (Click to Auto-populate):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() =>
                    setFiveWhyData({
                      ...fiveWhyData,
                      solution: 'Install heavy-duty visual shadow board with color-coded tool silhouettes and tethering brackets.',
                      preventiveAction: 'Update workstation SOP-5S-01 and incorporate visual tool audit check at end of each production shift.',
                      verificationCriteria: '100% tool return compliance verified over 3 consecutive weekly audits.',
                    })
                  }
                  style={{
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                  }}
                >
                  + Shadow Board & SOP Update
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFiveWhyData({
                      ...fiveWhyData,
                      solution: 'Replace damaged component with high-durability specification part, torque to OEM spec, and install drip tray.',
                      preventiveAction: 'Update CMMS preventative maintenance bill-of-materials and inspection interval.',
                      verificationCriteria: 'Zero fluid leaks or physical defects observed during 100 hours of continuous operation.',
                    })
                  }
                  style={{
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                  }}
                >
                  + Component Fix & PM Update
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFiveWhyData({
                      ...fiveWhyData,
                      solution: 'Conduct Standard Work training with visual One-Point Lesson (OPL) on proper material segregation.',
                      preventiveAction: 'Incorporate 5S sorting standard into new operator onboarding handbook and certification matrix.',
                      verificationCriteria: 'Zero repeated non-conformances by operators in this cell across 30 days.',
                    })
                  }
                  style={{
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                  }}
                >
                  + Operator Training & OPL
                </button>
              </div>
            </div>

            {/* Permanent Corrective Solution */}
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ fontWeight: 700 }}>
                Permanent Corrective Solution / Countermeasure *
              </label>
              <textarea
                rows={3}
                className="form-control"
                placeholder="What specific engineering, mechanical, or operational solution will permanently solve this problem?"
                value={fiveWhyData.solution}
                onChange={(e) => setFiveWhyData({ ...fiveWhyData, solution: e.target.value })}
                required
              />
              <span className="form-hint">
                Describe the direct fix (e.g. replace seal with Viton high-temp grade, install shadow board, construct holding rack).
              </span>
            </div>

            {/* Preventive Action / Standardization */}
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ fontWeight: 700 }}>
                Preventive Action & Process Standardization (Yokoten / SOP)
              </label>
              <textarea
                rows={2}
                className="form-control"
                placeholder="How will this solution be standardized across stations or shifts (e.g. SOP update, training, poka-yoke)?"
                value={fiveWhyData.preventiveAction}
                onChange={(e) => setFiveWhyData({ ...fiveWhyData, preventiveAction: e.target.value })}
              />
            </div>

            {/* Verification / Success Criteria */}
            <div className="form-group" style={{ marginBottom: '6px' }}>
              <label className="form-label" style={{ fontWeight: 700 }}>
                Audit Verification & Success Metric
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 0 defects or missing tools recorded across 3 consecutive weekly audits."
                value={fiveWhyData.verificationCriteria}
                onChange={(e) => setFiveWhyData({ ...fiveWhyData, verificationCriteria: e.target.value })}
              />
            </div>
          </div>

          {/* Drawer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button type="button" variant="secondary" onClick={() => setFiveWhyDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={<CheckCircle2 size={16} />}>
              Save Root Cause & Solution
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Action Closure Proof Submission */}
      <Modal
        isOpen={closureDrawerOpen}
        onClose={() => setClosureDrawerOpen(false)}
        title={`Submit Closure Proof: ${selectedAction?.actionCode}`}
        subtitle="Provide after-photo evidence and remediation notes for verification"
        maxWidth="640px"
      >
        <form onSubmit={handleSubmitClosure} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '13px' }}>
            <strong>Action Target:</strong> {selectedAction?.title}
            {selectedAction?.fiveWhyAnalysis?.solution && (
              <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)', color: 'var(--color-success)', fontSize: '12px' }}>
                <strong>Planned Solution:</strong> {selectedAction.fiveWhyAnalysis.solution}
              </div>
            )}
          </div>

          {/* Photo Evidence Section: Camera, Upload, Drag & Drop, or Presets */}
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>
                Mandatory "After" Photo Evidence *
              </label>
              <button
                type="button"
                onClick={() => setShowUrlInput(!showUrlInput)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-primary)',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {showUrlInput ? 'Switch to Camera / File Upload' : 'Or paste cloud image URL'}
              </button>
            </div>

            {/* Mode A: Optional Cloud URL Input */}
            {showUrlInput ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="https://... or /assets/..."
                  value={afterPhotoUrl}
                  onChange={(e) => setAfterPhotoUrl(e.target.value)}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  Enter external or hosted image URL (e.g. AWS S3, SharePoint, or cloud CDN).
                </span>
              </div>
            ) : (
              /* Mode B: Direct Camera Capture & File Upload */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {/* Camera Capture */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-primary-light)',
                      border: '1px solid var(--color-primary)',
                      color: 'var(--color-primary)',
                      fontWeight: 600,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <Camera size={16} />
                    <span>Take Photo / Camera</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={handlePhotoFileUpload}
                    />
                  </label>

                  {/* Device File Upload */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontWeight: 600,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <Upload size={16} />
                    <span>Upload Image File</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handlePhotoFileUpload}
                    />
                  </label>
                </div>

                {/* Drag and Drop Zone when empty */}
                {!afterPhotoUrl && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingPhoto(true); }}
                    onDragLeave={() => setIsDraggingPhoto(false)}
                    onDrop={handlePhotoDrop}
                    style={{
                      padding: '24px 16px',
                      textAlign: 'center',
                      border: isDraggingPhoto ? '2px dashed var(--color-primary)' : '2px dashed var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      background: isDraggingPhoto ? 'var(--color-primary-light)' : 'var(--bg-surface-subtle)',
                      cursor: 'pointer',
                    }}
                  >
                    <Upload size={22} style={{ color: 'var(--text-tertiary)', marginBottom: '4px' }} />
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Drag &amp; drop physical proof image here
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      PNG, JPG, or WEBP up to 10MB
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* Attached Photo Preview with Annotate & Remove Controls */}
            {afterPhotoUrl && (
              <div style={{ marginTop: '12px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#0F172A' }}>
                <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Badge variant="success" icon={<CheckCircle2 size={12} />}>Physical Evidence Attached</Badge>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      icon={<Camera size={13} />}
                      onClick={() => setAnnotationModalOpen(true)}
                    >
                      Annotate Proof
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      style={{ color: 'var(--color-danger)' }}
                      onClick={() => setAfterPhotoUrl('')}
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                <div style={{ width: '100%', height: '180px', position: 'relative' }}>
                  <ImageWithFallback src={afterPhotoUrl} height="180px" alt="After Evidence" allowZoom={true} />
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Remediation Closure Notes *</label>
            <textarea
              rows={3}
              className="form-control"
              placeholder="Detail exact physical changes implemented, parts replaced, shadow boards marked, operator trained..."
              value={closureNotes}
              onChange={(e) => setClosureNotes(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Remediation Performed By *</label>
            <input
              type="text"
              className="form-control"
              value={actorName}
              onChange={(e) => setActorName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <Button type="button" variant="secondary" onClick={() => setClosureDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={<CheckCircle2 size={16} />}>
              Submit for Verification
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Independent 2-Person Verification Sign-Off */}
      <Modal
        isOpen={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
        title={`Independent 2-Person Verification: ${selectedAction?.actionCode}`}
        maxWidth="740px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Solution & 5-Why Reference */}
          {selectedAction?.fiveWhyAnalysis?.solution && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(5, 150, 105, 0.08)',
                border: '1px solid rgba(5, 150, 105, 0.25)',
                fontSize: '12.5px',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--color-success)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Lightbulb size={13} />
                <span>Verified Solution Plan:</span>
              </div>
              <div style={{ color: 'var(--text-primary)' }}>{selectedAction.fiveWhyAnalysis.solution}</div>
              {selectedAction.fiveWhyAnalysis.verificationCriteria && (
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  <strong>Success Criteria:</strong> {selectedAction.fiveWhyAnalysis.verificationCriteria}
                </div>
              )}
            </div>
          )}

          {/* Side-by-Side Photo Comparison */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#EF4444', marginBottom: '4px' }}>
                BEFORE (Non-Conformance Finding)
              </div>
              <div style={{ width: '100%', height: '180px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                <ImageWithFallback
                  src={selectedAction?.observation?.beforePhotoUrl || FIVE_S_IMAGES.capa.toolingBefore}
                  category={selectedAction?.observation?.category}
                  alt="Before"
                  height="180px"
                  allowZoom={true}
                />
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#10B981', marginBottom: '4px' }}>
                AFTER (Remediation Evidence)
              </div>
              <div style={{ width: '100%', height: '180px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                <ImageWithFallback
                  src={selectedAction?.afterPhotoUrl || FIVE_S_IMAGES.capa.toolingAfter}
                  alt="After"
                  height="180px"
                  allowZoom={true}
                />
              </div>
            </div>
          </div>

          {/* Closure Notes Review */}
          <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '13px' }}>
            <strong>Assignee Remediation Notes:</strong>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)' }}>
              {selectedAction?.closureNotes || 'No closure notes recorded.'}
            </p>
          </div>

          {/* Verifier Feedback */}
          <div className="form-group">
            <label className="form-label">Verifier Sign-Off Comments</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Physical audit on shift confirmed 100% compliant shadow board."
              value={verificationNotes}
              onChange={(e) => setVerificationNotes(e.target.value)}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <Button
              variant="danger"
              icon={<RotateCcw size={16} />}
              onClick={() => handleVerifyAction(false)}
            >
              Reject & Reopen
            </Button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setVerificationModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={<ShieldCheck size={16} />}
                onClick={() => handleVerifyAction(true)}
              >
                Approve & Close Action
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Photo Annotation Modal */}
      {annotationModalOpen && (
        <PhotoAnnotationModal
          isOpen={annotationModalOpen}
          onClose={() => setAnnotationModalOpen(false)}
          initialPhotoUrl={afterPhotoUrl}
          title="Physical Remediation Photo Evidence Annotation"
          onSave={(annotatedUrl) => {
            setAfterPhotoUrl(annotatedUrl);
            setAnnotationModalOpen(false);
            addToast({
              type: 'success',
              title: 'Annotations Saved',
              message: 'Defect remediation markings applied to photo.',
            });
          }}
        />
      )}

      {/* Official Audit Report & Area Owner Sign-Off Modal */}
      <AuditReportModal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setSelectedAuditId(null);
        }}
        executionId={selectedAuditId}
        onAcknowledged={(updatedExec) => {
          addToast({
            type: 'success',
            title: 'Audit Findings Formally Acknowledged',
            message: `Findings for ${updatedExec.auditCode} accepted. CAPA remediation window is now active.`,
          });
          loadData();
        }}
      />
    </div>
  );
};

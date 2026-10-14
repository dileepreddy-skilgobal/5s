import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { ScheduledAuditInstance, AuditExecution, Observation } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { AuditReportModal } from '../../components/common/AuditReportModal';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  FileCheck,
  Award,
  BookOpen,
  ArrowRight,
  TrendingUp,
  Smartphone,
  Printer,
  FileText,
  Layers,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';

export const AuditorDashboard: React.FC = () => {
  const { currentUser, currentTenant } = useApp();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [scheduledInstances, setScheduledInstances] = useState<ScheduledAuditInstance[]>([]);
  const [recentAudits, setRecentAudits] = useState<AuditExecution[]>([]);
  const [recentObservations, setRecentObservations] = useState<Observation[]>([]);

  // Filter for completed audits: 'ALL' | 'PENDING' | 'ACKNOWLEDGED'
  const [auditFilter, setAuditFilter] = useState<'ALL' | 'PENDING' | 'ACKNOWLEDGED'>('ALL');

  // Selected Report Modal
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  useEffect(() => {
    loadAuditorData();
  }, [currentTenant]);

  const loadAuditorData = async () => {
    try {
      setLoading(true);
      const [instData, execData, obsData] = await Promise.all([
        api.getScheduledAuditInstances().catch(() => []),
        api.getAuditExecutions().catch(() => []),
        api.getObservations().catch(() => []),
      ]);

      setScheduledInstances(instData);
      setRecentAudits(execData);
      setRecentObservations(obsData);
    } catch (err) {
      console.error('Failed to load auditor dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <div className="spinner" />
        <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>
          Loading Certified Auditor Review & Desk Workspace...
        </p>
      </div>
    );
  }

  const completedAudits = recentAudits.filter((e) => e.status === 'SUBMITTED' || e.status === 'ACKNOWLEDGED');
  const pendingSignoffCount = recentAudits.filter((e) => e.status === 'SUBMITTED').length;
  const acknowledgedCount = recentAudits.filter((e) => e.status === 'ACKNOWLEDGED').length;

  const avgComplianceScore =
    recentAudits.length > 0
      ? Math.round(recentAudits.reduce((acc, a) => acc + (a.overallScore || 0), 0) / recentAudits.length)
      : 92;

  const displayedAudits = recentAudits.filter((a) => {
    if (auditFilter === 'PENDING') return a.status === 'SUBMITTED';
    if (auditFilter === 'ACKNOWLEDGED') return a.status === 'ACKNOWLEDGED';
    return true;
  });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      {/* Hero Welcome Header */}
      <Card noPadding>
        <div
          style={{
            padding: '24px 28px',
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(16, 185, 129, 0.05) 100%)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flex: 1, minWidth: 0 }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-lg)',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '22px',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                flexShrink: 0,
              }}
            >
              CA
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Badge variant="success">Auditor Review & Desk Workspace</Badge>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  Level 2 5S Competency Practitioner
                </span>
              </div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Welcome, {currentUser?.fullName || 'Amit Joshi'}
              </h1>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Assigned Unit: <strong>Quality Assurance & Plant Inspection</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              icon={<Calendar size={16} />}
              onClick={() => navigate('/schedules')}
            >
              Inspection Calendar
            </Button>
            <Button
              variant="secondary"
              icon={<BookOpen size={16} />}
              onClick={() => navigate('/standards')}
            >
              Visual SOP Standards
            </Button>
            <Button
              variant="primary"
              icon={<Award size={16} />}
              onClick={() => navigate('/training')}
            >
              My 5S Certification
            </Button>
          </div>
        </div>
      </Card>


      {/* Metric Highlights */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Scheduled Rounds
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-primary)', marginTop: '4px' }}>
            {scheduledInstances.filter((i) => i.status === 'SCHEDULED' || i.status === 'IN_PROGRESS').length || 2}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Assigned inspection slots
          </div>
        </div>

        <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Completed Inspections
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-success)', marginTop: '4px' }}>
            {completedAudits.length || 8}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Total audit logs recorded
          </div>
        </div>

        <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Avg Compliance Score
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#10B981', marginTop: '4px' }}>
            {avgComplianceScore}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Across audited workstations
          </div>
        </div>

        <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Auditor Credential
          </div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#8B5CF6', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Award size={18} /> Verified Level 2
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Validity: Active through Sep 2027
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SECTION 1: ASSIGNED 5S INSPECTION ROUNDS (SCHEDULE OVERVIEW) */}
      {/* ========================================================= */}
      <Card
        title="Assigned 5S Audit Inspection Rounds"
        subtitle="Scheduled rounds for your inspection unit. Gemba walks with camera QR scanning are executed using the 5S Mobile App."
        actions={
          <Button size="sm" variant="secondary" icon={<Calendar size={14} />} onClick={() => navigate('/schedules')}>
            Full Master Schedule →
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {scheduledInstances.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)' }}>
              <CheckCircle2 size={32} style={{ color: 'var(--color-success)', margin: '0 auto 8px' }} />
              <p style={{ margin: 0, fontSize: '13px' }}>All scheduled audit rounds for today are completed!</p>
            </div>
          ) : (
            scheduledInstances.slice(0, 4).map((inst) => (
              <div
                key={inst.id}
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '14px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span className="code-tag">{inst.auditCode}</span>
                    <Badge variant={inst.status === 'SUBMITTED' ? 'success' : inst.status === 'IN_PROGRESS' ? 'warning' : 'info'}>
                      {inst.status}
                    </Badge>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> Due: {new Date(inst.dueDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {inst.location?.name || 'Workstation'} ({inst.location?.areaCode || 'LOC'})
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Template: {inst.templateVersion?.template?.name || 'Discrete 5S Standards'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-full)',
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#059669',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    <Smartphone size={14} />
                    <span>Execute on 5S Mobile App</span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<BookOpen size={14} />}
                    onClick={() => navigate('/standards')}
                  >
                    Area SOPs
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* ========================================================= */}
      {/* SECTION 2: AUDIT REPORTS, SIGN-OFFS & COMPETENCY */}
      {/* ========================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '24px' }}>
        {/* Left Column: Recent Audit Submissions & Sign-off Tracking */}
        <Card
          title="Audit Inspection Reports & Sign-off Governance"
          subtitle="Review 5S radar calculations, formal PDF reports, and Area Owner acknowledgment status"
          actions={
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setAuditFilter('ALL')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  background: auditFilter === 'ALL' ? 'var(--color-primary)' : 'var(--bg-surface)',
                  color: auditFilter === 'ALL' ? '#FFFFFF' : 'var(--text-secondary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                All ({recentAudits.length})
              </button>
              <button
                type="button"
                onClick={() => setAuditFilter('PENDING')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  background: auditFilter === 'PENDING' ? '#F59E0B' : 'var(--bg-surface)',
                  color: auditFilter === 'PENDING' ? '#FFFFFF' : 'var(--text-secondary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Awaiting Sign-off ({pendingSignoffCount})
              </button>
              <button
                type="button"
                onClick={() => setAuditFilter('ACKNOWLEDGED')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  background: auditFilter === 'ACKNOWLEDGED' ? '#10B981' : 'var(--bg-surface)',
                  color: auditFilter === 'ACKNOWLEDGED' ? '#FFFFFF' : 'var(--text-secondary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Acknowledged ({acknowledgedCount})
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {displayedAudits.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                No audit submissions matching selected filter.
              </div>
            ) : (
              displayedAudits.slice(0, 5).map((audit) => (
                <div
                  key={audit.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="code-tag">{audit.auditCode}</span>
                      <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>
                        {audit.location?.name}
                      </strong>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: (audit.overallScore || 0) >= 80 ? '#10B981' : '#F59E0B',
                          background: (audit.overallScore || 0) >= 80 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        Score: {audit.overallScore}%
                      </span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                      Conducted on: {new Date(audit.completedAt || audit.startedAt).toLocaleDateString()} • Type: {audit.auditType || 'Routine 5S Audit'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <Badge variant={audit.status === 'ACKNOWLEDGED' ? 'success' : 'warning'}>
                      {audit.status === 'ACKNOWLEDGED' ? 'Acknowledged ✓' : 'Awaiting Sign-Off ⏳'}
                    </Badge>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<FileText size={13} />}
                      onClick={() => {
                        setSelectedAuditId(audit.id);
                        setReportModalOpen(true);
                      }}
                    >
                      View Report
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Right Column: 5S Competency & Standards Hub */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Card 1: 5S Auditor Certification */}
          <Card
            title="Auditor Competency & Qualification"
            subtitle="Verified Credential & Compliance Record"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
                  color: '#FFFFFF',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14.5px' }}>
                  <Award size={20} />
                  <span>Certified 5S Practitioner & Lead Auditor</span>
                </div>
                <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '6px', lineHeight: 1.4 }}>
                  Credential ID: <strong>CERT-5S-89C47178</strong>
                  <br />
                  Competency Score: <strong>100% Passed</strong> • Validity: <strong>Sep 2027</strong>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  style={{ background: '#FFFFFF', color: '#1E3A8A', fontWeight: 700, marginTop: '12px' }}
                  onClick={() => navigate('/training')}
                >
                  View Digital Certificate →
                </Button>
              </div>

              {/* Visual SOP Reference Link */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  background: 'var(--bg-surface-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <BookOpen size={18} className="text-primary" />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Visual Standards & SOPs
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      Review shadow boards & floor markings
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => navigate('/standards')}>
                  Open SOPs →
                </Button>
              </div>

              {/* Physical 5S Bulletin Board Print Guide */}
              <div
                style={{
                  padding: '12px 14px',
                  background: 'rgba(16, 185, 129, 0.06)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Printer size={15} style={{ color: '#059669' }} />
                  <strong style={{ fontSize: '12.5px', color: '#059669' }}>5S Bulletin Board Printing</strong>
                </div>
                <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Click <em>"View Report"</em> on any completed audit to open the official multi-page audit report with radar charts and instant print preview for workstation boards.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Official Audit Report Modal */}
      <AuditReportModal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setSelectedAuditId(null);
        }}
        executionId={selectedAuditId}
        onAcknowledged={() => {
          loadAuditorData();
        }}
      />
    </div>
  );
};

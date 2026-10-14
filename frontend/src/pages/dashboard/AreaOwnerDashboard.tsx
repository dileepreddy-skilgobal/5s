import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Location, AuditExecution, CorrectiveAction, Observation } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { AuditReportModal } from '../../components/common/AuditReportModal';
import { FIVE_S_IMAGES } from '../../constants/images';
import {
  MapPin,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Sparkles,
  Camera,
  ArrowRight,
  ShieldCheck,
  Tag,
  BookOpen,
  Calendar,
  AlertOctagon,
  ChevronRight,
  User,
  Package,
} from 'lucide-react';

export const AreaOwnerDashboard: React.FC = () => {
  const { currentUser, currentTenant, addToast } = useApp();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [pendingAudits, setPendingAudits] = useState<AuditExecution[]>([]);
  const [myActions, setMyActions] = useState<CorrectiveAction[]>([]);
  const [recentObservations, setRecentObservations] = useState<Observation[]>([]);

  // Selected Audit for Modal Sign-Off
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  // Kamishibai Daily Flip Card State
  const [kamishibaiCompleted, setKamishibaiCompleted] = useState<Record<string, boolean>>({
    q1: true,
    q2: false,
    q3: false,
  });

  useEffect(() => {
    loadDashboardData();
  }, [currentTenant]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [locData, execData, actionData, obsData] = await Promise.all([
        api.getLocations().catch(() => []),
        api.getAuditExecutions().catch(() => []),
        api.getCorrectiveActions().catch(() => []),
        api.getObservations().catch(() => []),
      ]);

      setLocations(locData);
      
      // Filter pending audits requiring Area Owner Sign-off (SUBMITTED status)
      const submitted = execData.filter((e) => e.status === 'SUBMITTED');
      setPendingAudits(submitted.length > 0 ? submitted : execData.slice(0, 3));

      // Filter actions
      setMyActions(actionData.slice(0, 4));
      setRecentObservations(obsData.slice(0, 4));
    } catch (err) {
      console.error('Failed to load area owner data', err);
    } finally {
      setLoading(false);
    }
  };

  const primaryLocation = locations[0] || {
    id: 'loc-cnc-01',
    name: 'Heavy CNC Milling Cell 01',
    areaCode: 'LOC-BLR-MACH-CNC01',
    building: 'Building A (Machining Bay)',
    floor: 'Ground Floor - Bay 04',
    riskLevel: 'HIGH',
    auditFrequency: 'WEEKLY',
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <div className="spinner" />
        <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>
          Loading Area Owner Workspace & Action Center...
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      {/* Hero Welcome Header */}
      <Card noPadding>
        <div
          style={{
            padding: '24px 28px',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(37, 99, 235, 0.05) 100%)',
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
                background: 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '22px',
                boxShadow: '0 4px 12px rgba(217, 119, 6, 0.3)',
                flexShrink: 0,
              }}
            >
              AO
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Badge variant="warning">Area Owner Workspace</Badge>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  {currentTenant?.name || 'SkilGlobal Manufacturing'}
                </span>
              </div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Welcome, {currentUser?.fullName || 'Arun Patel'}
              </h1>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Primary Workstation: <strong>{primaryLocation.name}</strong> ({primaryLocation.areaCode})
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              icon={<MapPin size={16} />}
              onClick={() => navigate(`/locations/${primaryLocation.id}`)}
            >
              My Workstation Record
            </Button>
            <Button
              variant="primary"
              icon={<Sparkles size={16} />}
              onClick={() => navigate(`/mobile-audit?locationId=${primaryLocation.id}`)}
            >
              Self-Audit Runner
            </Button>
          </div>
        </div>
      </Card>

      {/* ========================================================= */}
      {/* SECTION 1: PENDING AUDIT FINDINGS AWAITING SIGN-OFF */}
      {/* ========================================================= */}
      {pendingAudits.length > 0 && (
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-warning)' }}>
              <AlertTriangle size={18} />
              <span>Audit Reports Awaiting Your Formal Acknowledgement ({pendingAudits.length})</span>
            </div>
          }
          subtitle="Review non-conformance findings from recent inspections. Formal Area Owner acceptance is required before CAPA remediation workflows and SLA timers begin."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pendingAudits.map((audit) => (
              <div
                key={audit.id}
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  background: audit.status === 'SUBMITTED' ? 'rgba(245, 158, 11, 0.05)' : 'var(--bg-surface-subtle)',
                  border: `1px solid ${audit.status === 'SUBMITTED' ? 'rgba(245, 158, 11, 0.3)' : 'var(--border-subtle)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '14px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span className="code-tag">{audit.auditCode}</span>
                    <Badge variant={audit.status === 'SUBMITTED' ? 'warning' : 'success'}>
                      {audit.status === 'SUBMITTED' ? 'Awaiting Your Sign-Off' : 'Acknowledged ✓'}
                    </Badge>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                      Audited by {audit.auditorName || 'Lead Auditor'} on {new Date(audit.completedAt || audit.startedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {audit.location?.name || 'Assigned Area'} • Score: {audit.overallScore}% ({audit.isPassed ? 'Compliant' : 'Non-Conformance Recorded'})
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {audit.summaryNotes || 'Audit inspection completed with photo evidence.'}
                  </div>
                </div>

                <Button
                  variant={audit.status === 'SUBMITTED' ? 'primary' : 'secondary'}
                  icon={<FileCheck size={14} />}
                  onClick={() => {
                    setSelectedAuditId(audit.id);
                    setReportModalOpen(true);
                  }}
                >
                  {audit.status === 'SUBMITTED' ? 'Review & Sign Off Now →' : 'View Signed Report'}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ========================================================= */}
      {/* SECTION 2: 3-COLUMN WORKSPACE GRID */}
      {/* ========================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
        {/* Left Column: My Assigned CAPAs & 5-Why Countermeasures */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Card
            title="My Assigned Corrective Actions (CAPA)"
            subtitle="Eliminate root causes, implement poka-yoke fixes, and upload 'After' photographic proof"
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('/capa')}>
                View All CAPAs →
              </Button>
            }
          >
            {myActions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)' }}>
                <CheckCircle2 size={32} style={{ color: 'var(--color-success)', margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontSize: '13px' }}>Zero pending corrective actions! Your area is 100% compliant.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {myActions.map((action) => (
                  <div
                    key={action.id}
                    style={{
                      padding: '14px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="code-tag">{action.actionCode}</span>
                        <Badge variant={action.status === 'VERIFIED' ? 'success' : action.status === 'IN_PROGRESS' ? 'warning' : 'info'}>
                          {action.status}
                        </Badge>
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} /> Target: {new Date(action.targetDate).toLocaleDateString()}
                      </div>
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {action.title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {action.description}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        Root Cause: <strong>{action.rootCauseCategory || 'Method'}</strong>
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate('/capa')}
                      >
                        Upload After Photo & Close →
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Quick Abnormality Fast-Logger */}
          <Card
            title="Fast Abnormality & Defect Logger"
            subtitle="Spot a shop-floor deviation? Log in 30 seconds with photo proof"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(37, 99, 235, 0.06)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary)' }}>
                  Report an Abnormality (Sub-30 Seconds)
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Snap photo, pick 5S pillar, and trigger instant CAPA assignment.
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={<Camera size={14} />}
                onClick={() => navigate('/observations')}
              >
                Log Defect Now
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column: Daily 5-Minute Kamishibai & Shadow Board */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Daily Kamishibai Shift Routine */}
          <Card
            title="Daily 5-Minute Kamishibai Routine"
            subtitle="Shift handover micro-checks to sustain operational discipline"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { id: 'q1', text: '1. Are all calibrated torque wrenches returned to shadow hooks #1–#4?' },
                { id: 'q2', text: '2. Is hydraulic motor basin dry with zero oil seepage?' },
                { id: 'q3', text: '3. Are yellow pedestrian aisle walkways clear of raw materials?' },
              ].map((item) => (
                <div
                  key={item.id}
                  onClick={() =>
                    setKamishibaiCompleted((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                  }
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: kamishibaiCompleted[item.id] ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-surface-subtle)',
                    border: `1px solid ${kamishibaiCompleted[item.id] ? '#10B981' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {item.text}
                  </span>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: 'var(--radius-full)',
                      background: kamishibaiCompleted[item.id] ? '#10B981' : 'var(--border-subtle)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                    }}
                  >
                    {kamishibaiCompleted[item.id] ? '✓' : '○'}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Shadow Board Inventory Quick Status */}
          <Card
            title="Workstation Shadow Board Tools"
            subtitle="Registered items expected on-hand at this workstation"
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate(`/locations/${primaryLocation.id}`)}>
                Manage Items →
              </Button>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { code: 'TOOL-CNC-01', name: 'Pneumatic Torque Wrench 1/2"', pos: 'Shadow Hook #1', status: 'PRESENT' },
                { code: 'TOOL-CNC-02', name: 'Mitutoyo Vernier Caliper 150mm', pos: 'Drawer Slot A', status: 'PRESENT' },
                { code: 'CLEAN-01', name: 'Degreaser & Microfiber Post', pos: 'Station Post 2', status: 'PRESENT' },
              ].map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                  }}
                >
                  <div>
                    <strong>{t.name}</strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{t.pos} ({t.code})</div>
                  </div>
                  <Badge variant="success">Present ✓</Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick 5S Standards Reference */}
          <Card title="5S Pocket SOP Standards">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <BookOpen size={20} className="text-primary" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Visual Standards Library
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
                    Color codes, floor demarcation, and 30-sec tool retrieval rules
                  </div>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate('/standards')}>
                View SOPs →
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Official Audit Report & Area Owner Sign-Off Modal */}
      <AuditReportModal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setSelectedAuditId(null);
        }}
        executionId={selectedAuditId}
        onAcknowledged={() => {
          loadDashboardData();
        }}
      />
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api, getApiErrorMessage } from '../../services/api';
import { ScheduledAuditInstance, AuditExecution, TrainingCertificate } from '../../types';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { SummaryCard, SummaryGrid } from '../../components/ui/SummaryCard';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ErrorState, LoadingState, EmptyState } from '../../components/ui/StateViews';
import { AuditReportModal } from '../../components/common/AuditReportModal';
import { roleLabel } from '../../constants/roles';
import {
  auditStatusLabel,
  auditStatusVariant,
  humanize,
  scheduledAuditStatusLabel,
  scheduledAuditStatusVariant,
} from '../../constants/labels';
import { useI18n } from '../../i18n';
import { Clock, Calendar, Award, BookOpen, ClipboardCheck, Printer, FileText, CheckCircle2, Zap } from 'lucide-react';

/** Scheduled rounds that still have to be carried out. */
const OPEN_ROUND_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'OVERDUE'];
/** Audits with a submitted result (in-progress drafts have no final score). */
const SCORED_AUDIT_STATUSES = ['SUBMITTED', 'DISPUTED', 'ACKNOWLEDGED', 'VERIFIED'];
const ROUNDS_SHOWN = 4;
const AUDITS_SHOWN = 5;
/** Roles that may open the audit schedules page (see App.tsx). */
const SCHEDULE_PAGE_ROLES = ['SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S', 'AUDITOR', 'PLANT_HEAD', 'DEPT_HEAD'];

type AuditFilter = 'ALL' | 'PENDING' | 'DISPUTED' | 'ACKNOWLEDGED';

export const AuditorDashboard: React.FC = () => {
  const { currentUser, currentTenant, activeUserRole, can } = useApp();
  const { formatDate, formatNumber } = useI18n();
  const navigate = useNavigate();
  const userId = currentUser?.id;
  // Coordinators and admins may look at every auditor's rounds; auditors see their own
  const canSeeAll = can('PROGRAM_MANAGERS');
  const canConduct = can('AUDIT_CONDUCTORS');

  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduledInstances, setScheduledInstances] = useState<ScheduledAuditInstance[]>([]);
  const [recentAudits, setRecentAudits] = useState<AuditExecution[]>([]);
  // The auditor's own training certificates (null = not loaded yet)
  const [certificates, setCertificates] = useState<TrainingCertificate[] | null>(null);
  const [certError, setCertError] = useState<string | null>(null);

  const [auditFilter, setAuditFilter] = useState<AuditFilter>('ALL');

  // Selected Report Modal
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  const loadCertificates = useCallback(async () => {
    setCertError(null);
    setCertificates(null);
    try {
      setCertificates(await api.getMyCertificates());
    } catch (err) {
      setCertError(getApiErrorMessage(err, 'Your certificates could not be loaded.'));
    }
  }, []);

  const loadAuditorData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const auditorId = canSeeAll && showAll ? undefined : userId;
      const [instData, execData] = await Promise.all([
        api.getScheduledAuditInstances({ auditorId }),
        api.getAuditExecutions({ auditorId }),
      ]);
      setScheduledInstances(instData);
      setRecentAudits(execData);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Your audit rounds could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [userId, canSeeAll, showAll]);

  useEffect(() => {
    loadCertificates();
  }, [loadCertificates, currentTenant?.id, userId]);

  useEffect(() => {
    loadAuditorData();
  }, [loadAuditorData, currentTenant?.id]);

  // Most recent valid certificate, or the latest one if none is valid
  const currentCertificate = certificates?.find((c) => c.status === 'VALID') ?? certificates?.[0] ?? null;

  const openRounds = scheduledInstances
    .filter((i) => OPEN_ROUND_STATUSES.includes(i.status))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const overdueCount = openRounds.filter((i) => i.status === 'OVERDUE').length;

  const scoredAudits = recentAudits.filter((a) => SCORED_AUDIT_STATUSES.includes(a.status));
  const pendingSignoffCount = recentAudits.filter((e) => e.status === 'SUBMITTED').length;
  const acknowledgedCount = recentAudits.filter((e) => e.status === 'ACKNOWLEDGED').length;
  const disputedCount = recentAudits.filter((e) => e.status === 'DISPUTED').length;
  const avgComplianceScore =
    scoredAudits.length > 0 ? Math.round(scoredAudits.reduce((acc, a) => acc + (a.overallScore || 0), 0) / scoredAudits.length) : null;

  const displayedAudits = recentAudits.filter((a) => {
    if (auditFilter === 'PENDING') return a.status === 'SUBMITTED';
    if (auditFilter === 'DISPUTED') return a.status === 'DISPUTED';
    if (auditFilter === 'ACKNOWLEDGED') return a.status === 'ACKNOWLEDGED';
    return true;
  });

  const certificateStatusText = (cert: TrainingCertificate) =>
    cert.status === 'VALID'
      ? `Valid until ${formatDate(cert.validUntil)}`
      : cert.status === 'EXPIRED'
        ? `Expired on ${formatDate(cert.validUntil)}`
        : 'Revoked';

  const filterButton = (value: AuditFilter, label: string) => {
    const active = auditFilter === value;
    return (
      <button type="button" className={`pillar-tab-pill${active ? ' active' : ''}`} aria-pressed={active} onClick={() => setAuditFilter(value)}>
        {label}
      </button>
    );
  };

  const certificateHeadline = certError
    ? '—'
    : certificates === null
      ? '…'
      : currentCertificate?.status === 'VALID'
        ? 'Certified'
        : currentCertificate
          ? currentCertificate.status === 'EXPIRED'
            ? 'Expired'
            : 'Revoked'
          : 'Not certified';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        eyebrow={currentCertificate?.status === 'VALID' ? currentCertificate.credentialTitle : undefined}
        title={`Welcome${currentUser?.fullName ? `, ${currentUser.fullName}` : ''}`}
        meta={<Badge variant="info">{roleLabel(activeUserRole)}</Badge>}
        description={
          currentUser?.department ? (
            <>
              Department: <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{currentUser.department}</strong>
            </>
          ) : undefined
        }
        actions={
          <>
            {SCHEDULE_PAGE_ROLES.includes(activeUserRole) && (
              <Button variant="secondary" icon={<Calendar size={16} />} onClick={() => navigate('/schedules')}>
                Audit schedules
              </Button>
            )}
            <Button variant="secondary" icon={<BookOpen size={16} />} onClick={() => navigate('/standards')}>
              Standards
            </Button>
            <Button variant="secondary" icon={<Award size={16} />} onClick={() => navigate('/training')}>
              My certification
            </Button>
            {canConduct && (
              <Button variant="primary" icon={<Zap size={16} />} onClick={() => navigate('/mobile-audit')}>
                Unscheduled audit
              </Button>
            )}
          </>
        }
      />

      {canSeeAll && (
        <div role="group" aria-label="Whose audits to show" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className={`pillar-tab-pill${!showAll ? ' active' : ''}`} aria-pressed={!showAll} onClick={() => setShowAll(false)}>
            My audits
          </button>
          <button type="button" className={`pillar-tab-pill${showAll ? ' active' : ''}`} aria-pressed={showAll} onClick={() => setShowAll(true)}>
            All auditors
          </button>
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading your audit rounds…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadAuditorData} />
      ) : (
        <>
          {/* Metrics */}
          <SummaryGrid>
            <SummaryCard
              label="Open rounds"
              value={formatNumber(openRounds.length)}
              icon={<ClipboardCheck size={18} />}
              tone={overdueCount > 0 ? 'danger' : 'primary'}
              hint={overdueCount > 0 ? `${formatNumber(overdueCount)} overdue` : 'Scheduled or in progress'}
            />
            <SummaryCard
              label="Submitted audits"
              value={formatNumber(scoredAudits.length)}
              icon={<FileText size={18} />}
              tone="primary"
              hint={`${formatNumber(pendingSignoffCount)} awaiting sign-off`}
            />
            <SummaryCard
              label="Average score"
              value={avgComplianceScore === null ? '—' : `${formatNumber(avgComplianceScore)}%`}
              icon={<CheckCircle2 size={18} />}
              tone={avgComplianceScore === null ? 'neutral' : 'success'}
              hint={
                avgComplianceScore === null
                  ? 'No submitted audits yet'
                  : scoredAudits.length === 1
                    ? 'Across 1 submitted audit'
                    : `Across ${formatNumber(scoredAudits.length)} submitted audits`
              }
            />
            <SummaryCard
              label="Auditor certificate"
              value={certificateHeadline}
              icon={<Award size={18} />}
              tone={currentCertificate?.status === 'VALID' ? 'success' : currentCertificate ? 'warning' : 'neutral'}
              hint={
                certError
                  ? 'Could not be loaded'
                  : currentCertificate
                    ? certificateStatusText(currentCertificate)
                    : certificates !== null
                      ? 'Pass the training assessment'
                      : undefined
              }
            />
          </SummaryGrid>

          {/* Open audit rounds */}
          <Card
            title={showAll ? 'Open audit rounds' : 'My open audit rounds'}
            subtitle="Scheduled audits still to be carried out, earliest due first"
            actions={
              SCHEDULE_PAGE_ROLES.includes(activeUserRole) ? (
                <Button size="sm" variant="secondary" icon={<Calendar size={16} />} onClick={() => navigate('/schedules')}>
                  Full schedule
                </Button>
              ) : undefined
            }
            noPadding={openRounds.length > 0}
          >
            {openRounds.length === 0 ? (
              <EmptyState icon={<ClipboardCheck size={28} />} title={showAll ? 'No open audit rounds.' : 'No audit rounds assigned to you.'} />
            ) : (
              <>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {openRounds.slice(0, ROUNDS_SHOWN).map((inst, i) => (
                    <li
                      key={inst.id}
                      style={{
                        padding: '16px 20px',
                        borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px 16px',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span className="code-tag">{inst.auditCode}</span>
                          <Badge variant={scheduledAuditStatusVariant(inst.status)}>{scheduledAuditStatusLabel(inst.status)}</Badge>
                          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={14} aria-hidden="true" /> Due {formatDate(inst.dueDate)}
                          </span>
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                          {inst.location?.name || '—'}
                          {inst.location?.areaCode ? ` (${inst.location.areaCode})` : ''}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Template: {inst.templateVersion?.template?.name || '—'}
                          {showAll && inst.auditor ? ` · ${inst.auditor.firstName} ${inst.auditor.lastName}` : ''}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <Button size="sm" variant="secondary" icon={<BookOpen size={16} />} onClick={() => navigate('/standards')}>
                          Standards library
                        </Button>
                        {canConduct && (!showAll || inst.auditorId === userId) && (
                          <Button size="sm" variant="primary" icon={<ClipboardCheck size={16} />} onClick={() => navigate(`/mobile-audit/${inst.id}`)}>
                            {inst.status === 'IN_PROGRESS' ? 'Continue audit' : 'Start audit'}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {openRounds.length > ROUNDS_SHOWN && (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '12px 20px', borderTop: '1px solid var(--border-subtle)' }}>
                    {openRounds.length - ROUNDS_SHOWN === 1 ? '1 more round' : `${formatNumber(openRounds.length - ROUNDS_SHOWN)} more rounds`} on the
                    schedule.
                  </div>
                )}
              </>
            )}
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '24px', alignItems: 'start' }}>
            {/* Audit reports and sign-off */}
            <Card title="Audit reports" subtitle="Scores, reports and whether the area owner has acknowledged the result">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div role="group" aria-label="Filter audits" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {filterButton('ALL', `All (${formatNumber(recentAudits.length)})`)}
                  {filterButton('PENDING', `Awaiting sign-off (${formatNumber(pendingSignoffCount)})`)}
                  {filterButton('DISPUTED', `Disputed (${formatNumber(disputedCount)})`)}
                  {filterButton('ACKNOWLEDGED', `Acknowledged (${formatNumber(acknowledgedCount)})`)}
                </div>

                {displayedAudits.length === 0 ? (
                  <EmptyState title={auditFilter === 'ALL' ? 'No audits yet.' : 'No audits match this filter.'} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {displayedAudits.slice(0, AUDITS_SHOWN).map((audit) => {
                      const scored = SCORED_AUDIT_STATUSES.includes(audit.status);
                      return (
                        <div
                          key={audit.id}
                          style={{
                            padding: '12px 16px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span className="code-tag">{audit.auditCode}</span>
                              <strong style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                                {audit.location?.name || '—'}
                              </strong>
                              {scored && (
                                <Badge variant={audit.isPassed ? 'success' : 'warning'}>
                                  Score {formatNumber(audit.overallScore)}% · {audit.isPassed ? 'Passed' : 'Below pass score'}
                                </Badge>
                              )}
                            </div>
                            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              {formatDate(audit.completedAt || audit.startedAt)} · {audit.auditType ? humanize(audit.auditType) : '—'}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <Badge variant={auditStatusVariant(audit.status)}>{auditStatusLabel(audit.status)}</Badge>
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<FileText size={16} />}
                              onClick={() => {
                                setSelectedAuditId(audit.id);
                                setReportModalOpen(true);
                              }}
                            >
                              View report
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>

            {/* Certification and references */}
            <Card title="Auditor certificate" subtitle="Your training certificate and reference material">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {certError ? (
                  <ErrorState message={certError} onRetry={loadCertificates} />
                ) : (
                  <div
                    style={{
                      padding: '16px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-pale)',
                      border: '1px solid var(--color-info-border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--color-info-border)',
                          color: 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Award size={18} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                            {certificates === null
                              ? 'Loading your certificate…'
                              : currentCertificate
                                ? currentCertificate.credentialTitle
                                : 'No auditor certificate yet'}
                          </span>
                          {currentCertificate && (
                            <Badge
                              variant={
                                currentCertificate.status === 'VALID' ? 'success' : currentCertificate.status === 'EXPIRED' ? 'warning' : 'danger'
                              }
                            >
                              {certificateHeadline}
                            </Badge>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
                          {currentCertificate ? (
                            <>
                              Certificate ID: <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{currentCertificate.certificateId}</strong>
                              <br />
                              Score: <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatNumber(currentCertificate.scorePercent)}%</strong> ·{' '}
                              {certificateStatusText(currentCertificate)}
                            </>
                          ) : certificates !== null ? (
                            'Pass the 5S assessment in Training to earn your auditor certificate.'
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          style={{ marginTop: '12px' }}
                          onClick={() => navigate(currentCertificate ? `/training?cert=${currentCertificate.certificateId}` : '/training')}
                        >
                          {currentCertificate ? 'View certificate' : 'Go to training'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <BookOpen size={18} aria-hidden="true" style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Standards library</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => navigate('/standards')}>
                    Open standards
                  </Button>
                </div>

                <div className="quick-tip-card" style={{ alignItems: 'flex-start' }}>
                  <Printer size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
                  <p style={{ margin: 0, lineHeight: 1.5 }}>
                    Open a report with <em>View report</em> to print it for the area notice board.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Audit report modal */}
      <AuditReportModal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setSelectedAuditId(null);
        }}
        executionId={selectedAuditId}
        onAcknowledged={loadAuditorData}
      />
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api, getApiErrorMessage } from '../../services/api';
import { Location, AuditExecution, CorrectiveAction, ScheduledAuditInstance } from '../../types';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { SummaryCard, SummaryGrid } from '../../components/ui/SummaryCard';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ErrorState, LoadingState, EmptyState } from '../../components/ui/StateViews';
import { AuditReportModal } from '../../components/common/AuditReportModal';
import { DailyRoutinePanel } from '../../components/routines/DailyRoutinePanel';
import { roleLabel } from '../../constants/roles';
import {
  OPEN_ACTION_STATUSES,
  actionStatusLabel,
  scheduledAuditStatusLabel,
  scheduledAuditStatusVariant,
  actionStatusVariant,
  auditStatusLabel,
  auditStatusVariant,
  humanize,
} from '../../constants/labels';
import { useI18n } from '../../i18n';
import { MapPin, FileCheck, CheckCircle2, AlertTriangle, Clock, ClipboardCheck, Camera, BookOpen } from 'lucide-react';

const ACTIONS_SHOWN = 4;

export const AreaOwnerDashboard: React.FC = () => {
  const { currentUser, currentTenant, activeUserRole, can } = useApp();
  const { formatDate, formatNumber } = useI18n();
  const navigate = useNavigate();
  const userId = currentUser?.id;
  const isAreaOwnerView = activeUserRole === 'AREA_OWNER';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Areas the user owns (or backs up); managers who own none see every area they can open
  const [ownedLocations, setOwnedLocations] = useState<Location[]>([]);
  const [visibleLocations, setVisibleLocations] = useState<Location[]>([]);
  const [pendingAudits, setPendingAudits] = useState<AuditExecution[]>([]);
  const [openActions, setOpenActions] = useState<CorrectiveAction[]>([]);
  // Scheduled audits assigned to the user (self-audits of their areas), still to be done
  const [myScheduled, setMyScheduled] = useState<ScheduledAuditInstance[]>([]);

  // Selected Audit for Modal Sign-Off
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  // Area whose daily routine (Kamishibai checks + shadow board) is shown; defaults to the first area
  const [routineLocationId, setRoutineLocationId] = useState<string>('');

  const loadDashboardData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [locData, execData, actionData, scheduledData] = await Promise.all([
        api.getLocations(),
        api.getAuditExecutions({ status: 'SUBMITTED' }),
        api.getCorrectiveActions({ assigneeId: userId }),
        api.getScheduledAuditInstances({ auditorId: userId }),
      ]);
      setMyScheduled(
        scheduledData
          .filter((i) => ['SCHEDULED', 'IN_PROGRESS', 'OVERDUE'].includes(i.status))
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
      );

      const owned = locData.filter((l) => l.ownerId === userId || l.backupOwnerId === userId);
      setOwnedLocations(owned);
      // An area owner without areas sees none; department heads and admins fall back to every area
      setVisibleLocations(owned.length > 0 ? owned : isAreaOwnerView ? [] : locData);
      const ownedIds = new Set(owned.map((l) => l.id));

      // Audits awaiting sign-off, scoped to the owner's areas when they own any. The user's own audits
      // (e.g. a self-audit) are signed off by someone else, so they are not listed here.
      setPendingAudits(
        execData.filter(
          (e) => e.status === 'SUBMITTED' && e.auditorId !== userId && (ownedIds.size > 0 ? ownedIds.has(e.locationId) : !isAreaOwnerView),
        ),
      );

      // Corrective actions assigned to the signed-in user that are still being worked on
      setOpenActions(actionData.filter((a) => a.assigneeId === userId && OPEN_ACTION_STATUSES.includes(a.status)));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Your action hub could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [userId, isAreaOwnerView]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, currentTenant?.id]);

  if (loading) return <LoadingState label="Loading your action hub…" />;
  if (error) return <ErrorState message={error} onRetry={loadDashboardData} />;

  const ownsAreas = ownedLocations.length > 0;
  const primaryLocation = ownedLocations[0];
  const routineLocation = visibleLocations.find((l) => l.id === routineLocationId) ?? visibleLocations[0];
  const shownActions = openActions.slice(0, ACTIONS_SHOWN);
  // Audit roles start any audit; an area owner runs self-audits of the areas they own
  const canConductAudits = can('AUDIT_CONDUCTORS');
  const canSelfAudit = !canConductAudits && can('SELF_AUDITORS') && ownsAreas;
  const auditStartPath = (() => {
    const params = new URLSearchParams();
    if (primaryLocation) params.set('locationId', primaryLocation.id);
    if (canSelfAudit) params.set('auditType', 'SELF');
    const query = params.toString();
    return query ? `/mobile-audit?${query}` : '/mobile-audit';
  })();
  const moreActions = openActions.length - shownActions.length;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        eyebrow={currentTenant?.name}
        title={`Welcome${currentUser?.fullName ? `, ${currentUser.fullName}` : ''}`}
        meta={<Badge variant="info">{roleLabel(activeUserRole)}</Badge>}
        description={
          ownsAreas ? (
            <>
              {ownedLocations.length === 1 ? 'Your area' : `Your areas (${formatNumber(ownedLocations.length)})`}:{' '}
              <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{primaryLocation.name}</strong> ({primaryLocation.areaCode})
              {ownedLocations.length > 1 ? ` and ${formatNumber(ownedLocations.length - 1)} more` : ''}
            </>
          ) : isAreaOwnerView ? (
            <>No areas are assigned to you yet.</>
          ) : (
            <>Department areas ({formatNumber(visibleLocations.length)})</>
          )
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={<MapPin size={16} />}
              onClick={() => navigate(primaryLocation ? `/locations/${primaryLocation.id}` : '/locations')}
            >
              {primaryLocation ? 'Open my area' : 'View areas'}
            </Button>
            {(canConductAudits || canSelfAudit) && (
              <Button variant="primary" icon={<ClipboardCheck size={16} />} onClick={() => navigate(auditStartPath)}>
                {canSelfAudit ? 'Self-audit' : 'Start audit'}
              </Button>
            )}
          </>
        }
      />

      <SummaryGrid>
        <SummaryCard
          label={ownsAreas ? 'Areas you own' : 'Areas'}
          value={formatNumber(visibleLocations.length)}
          icon={<MapPin size={18} />}
          hint={ownsAreas ? 'As owner or backup owner' : isAreaOwnerView ? 'None assigned yet' : 'In your department'}
        />
        <SummaryCard
          label="Audits awaiting acknowledgement"
          value={formatNumber(pendingAudits.length)}
          icon={<FileCheck size={18} />}
          tone={pendingAudits.length > 0 ? 'warning' : 'neutral'}
          hint={pendingAudits.length > 0 ? 'Review and acknowledge' : 'Nothing to review'}
        />
        <SummaryCard
          label="My open corrective actions"
          value={formatNumber(openActions.length)}
          icon={<CheckCircle2 size={18} />}
          tone={openActions.length > 0 ? 'primary' : 'neutral'}
          hint={openActions.length > 0 ? 'Assigned to you' : 'None assigned to you'}
        />
      </SummaryGrid>

      {/* Scheduled self-audits assigned to the user (audit roles find their rounds on the schedule page) */}
      {myScheduled.length > 0 && (canSelfAudit || isAreaOwnerView) && (
        <Card title="My scheduled self-audits" subtitle="Assess your area against the checklist before the due date." noPadding>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {myScheduled.map((inst, i) => (
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
                </div>
                {can('SELF_AUDITORS') && (
                  <Button variant="primary" size="sm" icon={<ClipboardCheck size={16} />} onClick={() => navigate(`/mobile-audit/${inst.id}`)}>
                    {inst.status === 'IN_PROGRESS' ? 'Continue self-audit' : 'Start self-audit'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Audits awaiting acknowledgement */}
      {pendingAudits.length > 0 && (
        <Card
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              Audits awaiting acknowledgement
              <Badge variant="warning" icon={<AlertTriangle size={12} aria-hidden="true" />}>
                {formatNumber(pendingAudits.length)} to review
              </Badge>
            </span>
          }
          subtitle="Review the findings, then acknowledge the result or raise a dispute."
          noPadding
        >
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {pendingAudits.map((audit, i) => (
              <li
                key={audit.id}
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
                <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span className="code-tag">{audit.auditCode}</span>
                    <Badge variant={auditStatusVariant(audit.status)}>{auditStatusLabel(audit.status)}</Badge>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      {audit.auditorName ? `${audit.auditorName} · ` : ''}
                      {formatDate(audit.completedAt || audit.startedAt)}
                    </span>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                    {audit.location?.name || '—'} · Score {audit.overallScore != null ? `${formatNumber(audit.overallScore)}%` : '—'} (
                    {audit.isPassed ? 'Passed' : 'Below pass score'})
                  </div>
                  {audit.summaryNotes && (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>{audit.summaryNotes}</div>
                  )}
                </div>

                <Button
                  variant="primary"
                  icon={<FileCheck size={16} />}
                  onClick={() => {
                    setSelectedAuditId(audit.id);
                    setReportModalOpen(true);
                  }}
                >
                  Review report
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '24px', alignItems: 'start' }}>
        {/* Left column: corrective actions and abnormality reporting */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
          <Card
            title={`My open corrective actions${openActions.length ? ` (${formatNumber(openActions.length)})` : ''}`}
            subtitle="Find the root cause, fix it and add an after photo as evidence"
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('/capa')}>
                All actions
              </Button>
            }
          >
            {openActions.length === 0 ? (
              <EmptyState icon={<CheckCircle2 size={28} />} title="No corrective actions assigned to you." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {shownActions.map((action) => (
                  <div
                    key={action.id}
                    style={{
                      padding: '16px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="code-tag">{action.actionCode}</span>
                        <Badge variant={actionStatusVariant(action.status)}>{actionStatusLabel(action.status)}</Badge>
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={14} aria-hidden="true" /> Target {formatDate(action.targetDate)}
                      </div>
                    </div>

                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{action.title}</div>
                    {action.description && (
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{action.description}</div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginTop: '4px',
                        borderTop: '1px solid var(--border-subtle)',
                        paddingTop: '12px',
                      }}
                    >
                      <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                        Root cause:{' '}
                        <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                          {action.rootCauseCategory ? humanize(action.rootCauseCategory) : '—'}
                        </strong>
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/capa?id=${action.id}`)}>
                        Open action
                      </Button>
                    </div>
                  </div>
                ))}
                {moreActions > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => navigate('/capa')} style={{ alignSelf: 'flex-start' }}>
                    {moreActions === 1 ? '1 more action' : `${formatNumber(moreActions)} more actions`}
                  </Button>
                )}
              </div>
            )}
          </Card>

          <Card title="Report an abnormality" subtitle="Record a problem in an area, with a photo, so it can be followed up">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', flex: '1 1 200px', lineHeight: 1.5 }}>
                Pick the area and the 5S pillar, describe what you saw and attach a photo.
              </div>
              <Button
                variant="outline"
                icon={<Camera size={16} />}
                onClick={() => navigate(primaryLocation ? `/observations?new=1&locationId=${primaryLocation.id}` : '/observations?new=1')}
              >
                Report abnormality
              </Button>
            </div>
          </Card>
        </div>

        {/* Right column: daily routine and standards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
          {/* Daily Kamishibai checks and shadow-board tools, recorded per area per day */}
          {visibleLocations.length > 1 && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="routine-area">
                Area for the daily routine
              </label>
              <select
                id="routine-area"
                className="form-select"
                value={routineLocation?.id ?? ''}
                onChange={(e) => setRoutineLocationId(e.target.value)}
              >
                {visibleLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.areaCode})
                  </option>
                ))}
              </select>
            </div>
          )}
          {routineLocation ? (
            <DailyRoutinePanel
              key={routineLocation.id}
              locationId={routineLocation.id}
              ownerId={routineLocation.ownerId}
              backupOwnerId={routineLocation.backupOwnerId}
            />
          ) : (
            <Card title="Daily area routine">
              <EmptyState title="No areas yet" description="Areas you own or manage appear here." />
            </Card>
          )}

          <Card title="Standards library">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: '1 1 200px' }}>
                <BookOpen size={20} aria-hidden="true" style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>The 5S standards your areas are audited against.</div>
              </div>
              <Button variant="secondary" onClick={() => navigate('/standards')}>
                Open standards
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Audit report with acknowledgement / dispute */}
      <AuditReportModal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setSelectedAuditId(null);
        }}
        executionId={selectedAuditId}
        onAcknowledged={loadDashboardData}
      />
    </div>
  );
};

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { OnboardingChecklistCard } from '../../components/common/OnboardingChecklistCard';
import { useApp } from '../../context/AppContext';
import { useTerminology } from '../../hooks/useTerminology';
import { useI18n } from '../../i18n';
import { api, getApiErrorMessage } from '../../services/api';
import { auditPlanningApi, CreateSchedulePayload } from '../../services/auditPlanningApi';
import { auditsApi } from '../../services/api-audits';
import { UpdateSchedulePayload } from '../../types/audits';
import { AuditSchedule, ScheduledAuditInstance, AuditTemplate, Location, User, OrgNode } from '../../types';
import { SCHEDULED_AUDIT_STATUS_LABELS } from '../../constants/labels';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { SummaryCard, SummaryGrid } from '../../components/ui/SummaryCard';
import { FilterBar, SearchInput } from '../../components/ui/FormField';
import { Button } from '../../components/ui/Button';
import { Tabs, TabItem } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/StateViews';
import { AuditReportModal } from '../../components/common/AuditReportModal';
import { Calendar as CalendarIcon, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, FileText, List, Plus, RefreshCw, RotateCw, AlertTriangle, Trash2, Zap } from 'lucide-react';
import { CalendarLegend, MonthCalendar, WeekAgenda, weekStart } from './CalendarViews';
import { InstancesTable } from './InstancesTable';
import { ScheduleCard } from './ScheduleCard';
import { CreateScheduleModal } from './CreateScheduleModal';
import { InstanceDetailsModal } from './InstanceDetailsModal';
import { InstanceActionHandlers } from './InstanceActions';
import { dayKey, isAuditConductor, isOverdue, personName } from './scheduleShared';
import { AuditResultsPanel, ResultFilter, isResultFilter } from './AuditResultsPanel';
import { FieldError } from '../templates/templateShared';

type ViewMode = 'month' | 'week' | 'table';
const TAB_IDS = ['instances', 'schedules', 'results'] as const;
type TabId = (typeof TAB_IDS)[number];
const isTabId = (value: string | null): value is TabId => (TAB_IDS as readonly string[]).includes(value ?? '');
/** Same window the server uses when no due date is given (AUDIT_COMPLETION_SLA_DAYS). */
const COMPLETION_WINDOW_DAYS = 3;
const addDays = (key: string, days: number) => {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dayKey(d);
};

const STATUS_FILTERS = ['SCHEDULED', 'IN_PROGRESS', 'OVERDUE', 'SUBMITTED', 'CANCELLED'] as const;

const VIEW_OPTIONS: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
  { id: 'month', label: 'Month', icon: <CalendarDays size={16} aria-hidden="true" /> },
  { id: 'week', label: 'Week', icon: <CalendarIcon size={16} aria-hidden="true" /> },
  { id: 'table', label: 'Table', icon: <List size={16} aria-hidden="true" /> },
];

export const AuditSchedulesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTenant, addToast, can } = useApp();
  const { relabel } = useTerminology();
  const { formatDate } = useI18n();
  const canManage = can('PROGRAM_MANAGERS');
  const canRun = can('AUDIT_CONDUCTORS');

  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [instances, setInstances] = useState<ScheduledAuditInstance[]>([]);
  const [templates, setTemplates] = useState<AuditTemplate[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [orgNodes, setOrgNodes] = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Deep links: /schedules?tab=results&status=DISPUTED&audit=<executionId> (dispute notifications)
  const tabParam = searchParams.get('tab');
  const statusParam = searchParams.get('status');
  const [activeTab, setActiveTab] = useState<TabId>(isTabId(tabParam) ? tabParam : 'instances');
  const [resultFilter, setResultFilter] = useState<ResultFilter>(isResultFilter(statusParam) ? statusParam : 'ALL');
  const [linkedAuditId, setLinkedAuditId] = useState<string | null>(searchParams.get('audit'));
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [activeInstance, setActiveInstance] = useState<ScheduledAuditInstance | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [auditorFilter, setAuditorFilter] = useState('ALL');

  // Modals and per-item busy state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reassignInstance, setReassignInstance] = useState<ScheduledAuditInstance | null>(null);
  const [reassignAuditorId, setReassignAuditorId] = useState('');
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AuditSchedule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<AuditSchedule | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [generatingDue, setGeneratingDue] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<ScheduledAuditInstance | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ plannedDate: '', dueDate: '', reason: '' });
  const [rescheduleErrors, setRescheduleErrors] = useState<Record<string, string>>({});
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ScheduledAuditInstance | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reportLoadingId, setReportLoadingId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [reportExecutionId, setReportExecutionId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [schedulesData, instancesData, templatesData, locationsData, usersData, orgNodesData] = await Promise.all([
        api.getAuditSchedules(),
        api.getScheduledAuditInstances(),
        api.getAuditTemplates({ status: 'ACTIVE' }),
        api.getLocations(),
        api.getUsers(),
        api.getOrgNodes(),
      ]);
      setSchedules(schedulesData);
      setInstances(instancesData);
      setTemplates(templatesData);
      setLocations(locationsData);
      setUsers(usersData);
      setOrgNodes(orgNodesData);
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Could not load audit schedules.'));
    } finally {
      setLoading(false);
    }
  }, [currentTenant]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const auditors = useMemo(() => users.filter(isAuditConductor), [users]);

  const filteredInstances = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return instances.filter((inst) => {
      if (q) {
        const haystack = [inst.auditCode, inst.location?.name, inst.location?.areaCode, personName(inst.auditor)].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter === 'OVERDUE') {
        if (!isOverdue(inst, now)) return false;
      } else if (statusFilter === 'SCHEDULED') {
        if (inst.status !== 'SCHEDULED' || isOverdue(inst, now)) return false;
      } else if (statusFilter !== 'ALL' && inst.status !== statusFilter) {
        return false;
      }
      if (locationFilter !== 'ALL' && inst.locationId !== locationFilter) return false;
      if (auditorFilter !== 'ALL' && inst.auditorId !== auditorFilter) return false;
      return true;
    });
  }, [instances, search, statusFilter, locationFilter, auditorFilter]);

  const instancesByDay = useMemo(() => {
    const map = new Map<string, ScheduledAuditInstance[]>();
    for (const inst of filteredInstances) {
      const key = dayKey(inst.plannedDate);
      const list = map.get(key) ?? [];
      list.push(inst);
      map.set(key, list);
    }
    return map;
  }, [filteredInstances]);

  // Month view steps by month, week view by 7 days
  const stepPeriod = (direction: -1 | 1) => {
    setAnchorDate((d) =>
      viewMode === 'week'
        ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * direction)
        : new Date(d.getFullYear(), d.getMonth() + direction, 1),
    );
  };

  const periodLabel = useMemo(() => {
    if (viewMode === 'week') {
      const start = weekStart(anchorDate);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return `${formatDate(start, { day: 'numeric', month: 'short' })} – ${formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return formatDate(anchorDate, { month: 'long', year: 'numeric' });
  }, [viewMode, anchorDate, formatDate]);

  const handleDownloadIcs = async (instanceId?: string) => {
    setDownloading(true);
    try {
      const icsContent = await api.exportIcsCalendar(instanceId);
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', instanceId ? `5S-audit-${instanceId.slice(0, 8)}.ics` : '5S-audit-schedule.ics');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      addToast({ type: 'success', title: 'Calendar file downloaded', message: 'Open the .ics file to add the audits to Outlook, Google or Apple Calendar.' });
    } catch (err) {
      addToast({ type: 'error', title: 'Export failed', message: getApiErrorMessage(err, 'Could not create the calendar file.') });
    } finally {
      setDownloading(false);
    }
  };

  const handleCreate = async (payload: CreateSchedulePayload) => {
    setCreating(true);
    try {
      const created = await auditPlanningApi.createSchedule(payload);
      addToast({ type: 'success', title: 'Schedule created', message: `${created.scheduleCode}: the first cycle of audits was created.` });
      setCreateOpen(false);
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not create schedule', message: getApiErrorMessage(err, 'Could not create schedule.') });
    } finally {
      setCreating(false);
    }
  };

  const handleGenerate = async (sched: AuditSchedule) => {
    setGeneratingId(sched.id);
    try {
      const res = (await api.generateAuditsForSchedule(sched.id)) as { createdCount?: number } | undefined;
      const n = res?.createdCount ?? 0;
      addToast({
        type: n > 0 ? 'success' : 'info',
        title: n > 0 ? 'Audits created' : 'No new audits',
        message: n > 0 ? `${n} ${n === 1 ? 'audit was' : 'audits were'} created for ${sched.title}.` : `Every location in ${sched.title} already has an audit for this cycle.`,
      });
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not generate audits', message: getApiErrorMessage(err, 'Could not generate audits.') });
    } finally {
      setGeneratingId(null);
    }
  };

  const handleToggle = async (sched: AuditSchedule) => {
    const status = sched.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setTogglingId(sched.id);
    try {
      await auditPlanningApi.updateSchedule(sched.id, { status });
      addToast({ type: 'success', title: status === 'PAUSED' ? 'Schedule paused' : 'Schedule resumed', message: sched.title });
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not update schedule', message: getApiErrorMessage(err, 'Could not update schedule.') });
    } finally {
      setTogglingId(null);
    }
  };

  const handleUpdate = async (sched: AuditSchedule, payload: UpdateSchedulePayload) => {
    if (Object.keys(payload).length === 0) {
      addToast({ type: 'info', title: 'No changes', message: `${sched.title} was not changed.` });
      setEditTarget(null);
      return;
    }
    setSavingEdit(true);
    try {
      await auditsApi.updateSchedule(sched.id, payload);
      addToast({ type: 'success', title: 'Schedule saved', message: `${sched.scheduleCode}: changes apply to the audits it creates from now on.` });
      setEditTarget(null);
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not save schedule', message: getApiErrorMessage(err, 'Could not save the schedule.') });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleGenerateDue = async () => {
    setGeneratingDue(true);
    try {
      const res = await auditsApi.generateDue();
      const failed = res.failures.length;
      addToast({
        type: failed > 0 ? 'warning' : res.createdCount > 0 ? 'success' : 'info',
        title: res.createdCount > 0 ? 'Upcoming audits created' : 'Nothing due',
        message:
          res.createdCount > 0
            ? `${res.createdCount} ${res.createdCount === 1 ? 'audit was' : 'audits were'} created from ${res.schedulesProcessed} ${res.schedulesProcessed === 1 ? 'schedule' : 'schedules'}.${failed ? ` ${failed} could not be generated.` : ''}`
            : failed
              ? `${failed} ${failed === 1 ? 'schedule' : 'schedules'} could not be generated: ${res.failures[0].message}`
              : 'Every active schedule already has its audits within its lead time.',
      });
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not generate audits', message: getApiErrorMessage(err, 'Could not generate the upcoming audits.') });
    } finally {
      setGeneratingDue(false);
    }
  };

  const openReschedule = (inst: ScheduledAuditInstance) => {
    setRescheduleForm({ plannedDate: dayKey(inst.plannedDate), dueDate: dayKey(inst.dueDate), reason: '' });
    setRescheduleErrors({});
    setRescheduleTarget(inst);
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;
    const next: Record<string, string> = {};
    if (!rescheduleForm.plannedDate) next.plannedDate = 'Choose the new planned date.';
    if (rescheduleForm.dueDate && rescheduleForm.plannedDate && rescheduleForm.dueDate < rescheduleForm.plannedDate) next.dueDate = 'The due date cannot be before the planned date.';
    setRescheduleErrors(next);
    if (Object.keys(next).length) return;
    setRescheduling(true);
    try {
      await auditsApi.rescheduleInstance(rescheduleTarget.id, {
        plannedDate: new Date(`${rescheduleForm.plannedDate}T00:00:00`).toISOString(),
        // End of the chosen due day, so the audit is not overdue during that day
        dueDate: rescheduleForm.dueDate ? new Date(`${rescheduleForm.dueDate}T23:59:59`).toISOString() : undefined,
        reason: rescheduleForm.reason.trim() || undefined,
      });
      addToast({ type: 'success', title: 'Audit rescheduled', message: `${rescheduleTarget.auditCode} moved to ${formatDate(new Date(`${rescheduleForm.plannedDate}T00:00:00`))}.` });
      setRescheduleTarget(null);
      setActiveInstance(null);
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not reschedule', message: getApiErrorMessage(err, 'Could not reschedule the audit.') });
    } finally {
      setRescheduling(false);
    }
  };

  const openCancel = (inst: ScheduledAuditInstance) => {
    setCancelReason('');
    setCancelError(null);
    setCancelTarget(inst);
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;
    if (!cancelReason.trim()) {
      setCancelError('Enter why this audit is cancelled.');
      return;
    }
    setCancelling(true);
    try {
      await auditsApi.cancelInstance(cancelTarget.id, cancelReason.trim());
      addToast({ type: 'success', title: 'Audit cancelled', message: `${cancelTarget.auditCode} was cancelled.` });
      setCancelTarget(null);
      setActiveInstance(null);
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not cancel the audit', message: getApiErrorMessage(err, 'Could not cancel the audit.') });
    } finally {
      setCancelling(false);
    }
  };

  const changeTab = (tab: string) => {
    if (!isTabId(tab)) return;
    setActiveTab(tab);
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (tab === 'instances') nextParams.delete('tab');
        else nextParams.set('tab', tab);
        if (tab !== 'results') nextParams.delete('status');
        nextParams.delete('audit');
        return nextParams;
      },
      { replace: true },
    );
  };

  const changeResultFilter = (filter: ResultFilter) => {
    setResultFilter(filter);
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (filter === 'ALL') nextParams.delete('status');
        else nextParams.set('status', filter);
        return nextParams;
      },
      { replace: true },
    );
  };

  const clearLinkedAudit = useCallback(() => {
    setLinkedAuditId(null);
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        nextParams.delete('audit');
        return nextParams;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteAuditSchedule(deleteTarget.id);
      addToast({ type: 'success', title: 'Schedule deleted', message: deleteTarget.title });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not delete schedule', message: getApiErrorMessage(err, 'Could not delete schedule.') });
    } finally {
      setDeleting(false);
    }
  };

  const openReassign = (inst: ScheduledAuditInstance) => {
    setReassignAuditorId(inst.auditorId ?? '');
    setReassignError(null);
    setReassignInstance(inst);
  };

  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignInstance) return;
    if (!reassignAuditorId) {
      setReassignError('Choose an auditor.');
      return;
    }
    setReassigning(true);
    try {
      await auditPlanningApi.reassignInstance(reassignInstance.id, reassignAuditorId);
      addToast({ type: 'success', title: 'Auditor changed', message: `${reassignInstance.auditCode} was reassigned.` });
      setReassignInstance(null);
      setActiveInstance(null);
      await loadData();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not reassign', message: getApiErrorMessage(err, 'Could not reassign the auditor.') });
    } finally {
      setReassigning(false);
    }
  };

  // The report is the execution started from this scheduled audit (not just any audit of the location)
  const handleViewReport = async (inst: ScheduledAuditInstance) => {
    setReportLoadingId(inst.id);
    try {
      const execs = await api.getAuditExecutions({ locationId: inst.locationId });
      const match = execs
        .filter((x) => x.auditInstanceId === inst.id)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
      if (match) {
        setReportExecutionId(match.id);
      } else {
        addToast({ type: 'info', title: 'No report found', message: `No submitted audit is linked to ${inst.auditCode}.` });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Could not load report', message: getApiErrorMessage(err, 'Could not load the audit report.') });
    } finally {
      setReportLoadingId(null);
    }
  };

  const actionHandlers: InstanceActionHandlers = {
    canRun,
    canManage,
    onRun: (inst) => navigate(`/mobile-audit/${inst.id}`),
    onReport: handleViewReport,
    onReassign: openReassign,
    onReschedule: openReschedule,
    onCancel: openCancel,
    reportLoadingId,
  };

  const now = Date.now();
  const activeSchedulesCount = schedules.filter((s) => s.status === 'ACTIVE').length;
  const upcomingCount = instances.filter((i) => i.status === 'SCHEDULED' && !isOverdue(i, now)).length;
  const overdueCount = instances.filter((i) => isOverdue(i, now)).length;
  const submittedCount = instances.filter((i) => i.status === 'SUBMITTED').length;
  const filtersActive = !!search || statusFilter !== 'ALL' || locationFilter !== 'ALL' || auditorFilter !== 'ALL';

  const tabs: TabItem[] = [
    { id: 'instances', label: 'Calendar', icon: <CalendarIcon size={15} />, badge: instances.length },
    { id: 'schedules', label: 'Schedules', icon: <RotateCw size={15} />, badge: schedules.length },
    { id: 'results', label: 'Audit results', icon: <FileText size={15} /> },
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Go-live checklist for org admins / 5S coordinators while setup is incomplete */}
      <OnboardingChecklistCard />

      <PageHeader
        title={relabel('Audit schedules')}
        description="Recurring schedules create audits for each location and assign an auditor."
        actions={
          <>
            <Button variant="secondary" icon={<Download size={16} />} onClick={() => handleDownloadIcs()} loading={downloading && !activeInstance} disabled={downloading}>
              Export .ics
            </Button>
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => loadData()}>
              Refresh
            </Button>
            {canManage && (
              <Button variant="secondary" icon={<Zap size={16} />} onClick={handleGenerateDue} loading={generatingDue} disabled={generatingDue}>
                Generate due audits
              </Button>
            )}
            {canManage && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
                New schedule
              </Button>
            )}
          </>
        }
      />

      {loading && !schedules.length && !instances.length ? (
        <Card>
          <LoadingState label="Loading audit schedules…" />
        </Card>
      ) : loadError ? (
        <Card>
          <ErrorState message={loadError} onRetry={loadData} />
        </Card>
      ) : (
        <>
          <SummaryGrid>
            <SummaryCard label="Active schedules" value={activeSchedulesCount} icon={<RotateCw size={18} />} tone="primary" hint="Creating audits each cycle" />
            <SummaryCard label="Upcoming audits" value={upcomingCount} icon={<Clock size={18} />} tone="info" hint="Scheduled, not yet due" />
            <SummaryCard label="Overdue" value={overdueCount} icon={<AlertTriangle size={18} />} tone={overdueCount > 0 ? 'danger' : 'neutral'} hint="Past the due date, not started" />
            <SummaryCard label="Submitted" value={submittedCount} icon={<CheckCircle2 size={18} />} tone="success" hint="Scheduled audits completed" />
          </SummaryGrid>

          <Tabs tabs={tabs} activeTab={activeTab} onChange={changeTab} ariaLabel="Audit schedule views" />

          {activeTab === 'instances' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                {viewMode !== 'table' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                    <Button variant="secondary" size="sm" icon={<ChevronLeft size={16} />} onClick={() => stepPeriod(-1)} aria-label={viewMode === 'week' ? 'Previous week' : 'Previous month'} />
                    <h2 aria-live="polite" className="section-title" style={{ margin: 0, minWidth: '140px', textAlign: 'center' }}>
                      {periodLabel}
                    </h2>
                    <Button variant="secondary" size="sm" icon={<ChevronRight size={16} />} onClick={() => stepPeriod(1)} aria-label={viewMode === 'week' ? 'Next week' : 'Next month'} />
                    <Button size="sm" variant="ghost" onClick={() => setAnchorDate(new Date())}>
                      Today
                    </Button>
                  </div>
                ) : (
                  <h2 className="section-title" style={{ margin: 0 }}>All scheduled audits</h2>
                )}

                <div role="group" aria-label="Calendar layout" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
                  {VIEW_OPTIONS.map((v) => (
                    <button key={v.id} type="button" className="pillar-tab-pill" onClick={() => setViewMode(v.id)} aria-pressed={viewMode === v.id}>
                      {v.icon}
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <FilterBar label="Filter scheduled audits">
                <SearchInput
                  label="Search by audit code, location or auditor"
                  placeholder="Search audits, locations, auditors"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="form-select">
                  <option value="ALL">All statuses</option>
                  {STATUS_FILTERS.map((s) => (
                    <option key={s} value={s}>{SCHEDULED_AUDIT_STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <select aria-label="Filter by location" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="form-select">
                  <option value="ALL">All locations</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.areaCode} — {l.name}</option>
                  ))}
                </select>
                <select aria-label="Filter by auditor" value={auditorFilter} onChange={(e) => setAuditorFilter(e.target.value)} className="form-select">
                  <option value="ALL">All auditors</option>
                  {auditors.map((u) => (
                    <option key={u.id} value={u.id}>{personName(u)}</option>
                  ))}
                </select>
                <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
                  {filtersActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSearch('');
                        setStatusFilter('ALL');
                        setLocationFilter('ALL');
                        setAuditorFilter('ALL');
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                  <span role="status" style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{filteredInstances.length}</strong> {filteredInstances.length === 1 ? 'audit' : 'audits'}
                  </span>
                </div>
              </FilterBar>

              {viewMode === 'month' && (
                <Card noPadding>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <CalendarLegend />
                  </div>
                  <MonthCalendar anchor={anchorDate} instancesByDay={instancesByDay} onOpen={setActiveInstance} />
                </Card>
              )}
              {viewMode === 'week' && <WeekAgenda anchor={anchorDate} instancesByDay={instancesByDay} onOpen={setActiveInstance} {...actionHandlers} />}
              {viewMode === 'table' && <InstancesTable instances={filteredInstances} onOpen={setActiveInstance} {...actionHandlers} />}
            </div>
          )}

          {activeTab === 'schedules' && (
            <div className="animate-fade-in">
              {schedules.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<RotateCw size={28} />}
                    title="No audit schedules yet"
                    description="A schedule creates audits for its locations every cycle (daily, weekly, monthly…) and assigns auditors."
                    action={
                      canManage ? (
                        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
                          New schedule
                        </Button>
                      ) : undefined
                    }
                  />
                </Card>
              ) : (
                <div className="grid-auto" style={{ ['--min' as string]: '320px', gap: '16px' } as React.CSSProperties}>
                  {schedules.map((sched) => (
                    <ScheduleCard
                      key={sched.id}
                      schedule={sched}
                      orgNodes={orgNodes}
                      locations={locations}
                      canManage={canManage}
                      generating={generatingId === sched.id}
                      toggling={togglingId === sched.id}
                      onGenerate={handleGenerate}
                      onToggle={handleToggle}
                      onDelete={setDeleteTarget}
                      onEdit={setEditTarget}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'results' && (
            <AuditResultsPanel filter={resultFilter} onFilterChange={changeResultFilter} initialAuditId={linkedAuditId} onInitialAuditOpened={clearLinkedAudit} />
          )}
        </>
      )}

      <InstanceDetailsModal
        instance={activeInstance}
        downloading={downloading}
        onClose={() => setActiveInstance(null)}
        onDownloadIcs={handleDownloadIcs}
        {...actionHandlers}
      />

      <CreateScheduleModal
        isOpen={createOpen}
        templates={templates}
        locations={locations}
        orgNodes={orgNodes}
        auditors={auditors}
        saving={creating}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <CreateScheduleModal
        isOpen={!!editTarget}
        schedule={editTarget}
        templates={templates}
        locations={locations}
        orgNodes={orgNodes}
        auditors={auditors}
        saving={savingEdit}
        onClose={() => setEditTarget(null)}
        onSubmit={() => undefined}
        onUpdate={handleUpdate}
      />

      {rescheduleTarget && (
        <Modal
          isOpen={true}
          onClose={() => setRescheduleTarget(null)}
          title={`Reschedule ${rescheduleTarget.auditCode}`}
          subtitle={rescheduleTarget.location ? `${rescheduleTarget.location.name} (${rescheduleTarget.location.areaCode})` : undefined}
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setRescheduleTarget(null)}>Cancel</Button>
              <Button variant="primary" type="submit" form="reschedule-form" loading={rescheduling} disabled={rescheduling}>
                Reschedule
              </Button>
            </>
          }
        >
          <form id="reschedule-form" onSubmit={handleRescheduleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0 }}>
              Currently planned {formatDate(rescheduleTarget.plannedDate)}, due {formatDate(rescheduleTarget.dueDate)}. The auditor is notified of the new date.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="reschedule-planned">New planned date<span className="required" aria-hidden="true"> *</span></label>
                <input
                  id="reschedule-planned"
                  type="date"
                  className="form-control"
                  value={rescheduleForm.plannedDate}
                  onChange={(e) =>
                    setRescheduleForm((f) => ({
                      ...f,
                      plannedDate: e.target.value,
                      // Keep the completion window when the due date was not chosen separately
                      dueDate: e.target.value ? addDays(e.target.value, COMPLETION_WINDOW_DAYS) : f.dueDate,
                    }))
                  }
                  aria-invalid={!!rescheduleErrors.plannedDate}
                  aria-describedby={rescheduleErrors.plannedDate ? 'reschedule-planned-error' : undefined}
                />
                <FieldError id="reschedule-planned-error" message={rescheduleErrors.plannedDate} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="reschedule-due">New due date</label>
                <input
                  id="reschedule-due"
                  type="date"
                  className="form-control"
                  min={rescheduleForm.plannedDate || undefined}
                  value={rescheduleForm.dueDate}
                  onChange={(e) => setRescheduleForm((f) => ({ ...f, dueDate: e.target.value }))}
                  aria-invalid={!!rescheduleErrors.dueDate}
                  aria-describedby={rescheduleErrors.dueDate ? 'reschedule-due-error reschedule-due-hint' : 'reschedule-due-hint'}
                />
                <div id="reschedule-due-hint" className="form-hint">Defaults to {COMPLETION_WINDOW_DAYS} days after the planned date.</div>
                <FieldError id="reschedule-due-error" message={rescheduleErrors.dueDate} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="reschedule-reason">Reason</label>
              <textarea
                id="reschedule-reason"
                rows={2}
                maxLength={500}
                className="form-textarea"
                placeholder="e.g. Line changeover on the original date"
                value={rescheduleForm.reason}
                onChange={(e) => setRescheduleForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </form>
        </Modal>
      )}

      {cancelTarget && (
        <Modal
          isOpen={true}
          onClose={() => setCancelTarget(null)}
          title={`Cancel audit ${cancelTarget.auditCode}?`}
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setCancelTarget(null)}>Keep audit</Button>
              <Button variant="danger" type="submit" form="cancel-audit-form" loading={cancelling} disabled={cancelling}>
                Cancel audit
              </Button>
            </>
          }
        >
          <form id="cancel-audit-form" onSubmit={handleCancelSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              The audit of {cancelTarget.location?.name ?? 'this location'} planned {formatDate(cancelTarget.plannedDate)} will no longer be due. The reason is kept on the audit and sent to the auditor.
            </p>
            <div className="form-group">
              <label className="form-label" htmlFor="cancel-reason">Reason<span className="required" aria-hidden="true"> *</span></label>
              <textarea
                id="cancel-reason"
                rows={3}
                maxLength={500}
                className="form-textarea"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                aria-invalid={!!cancelError}
                aria-describedby={cancelError ? 'cancel-reason-error' : undefined}
              />
              <FieldError id="cancel-reason-error" message={cancelError} />
            </div>
          </form>
        </Modal>
      )}

      {reassignInstance && (
        <Modal
          isOpen={true}
          onClose={() => setReassignInstance(null)}
          title={`Reassign ${reassignInstance.auditCode}`}
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setReassignInstance(null)}>Cancel</Button>
              <Button variant="primary" type="submit" form="reassign-form" loading={reassigning} disabled={reassigning}>
                Reassign
              </Button>
            </>
          }
        >
          <form id="reassign-form" onSubmit={handleReassignSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0 }}>
              Location: <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{reassignInstance.location ? `${reassignInstance.location.name} (${reassignInstance.location.areaCode})` : '—'}</strong>
            </p>
            <div className="form-group">
              <label className="form-label" htmlFor="reassign-auditor">
                Auditor<span className="required" aria-hidden="true"> *</span>
              </label>
              <select
                id="reassign-auditor"
                value={reassignAuditorId}
                onChange={(e) => setReassignAuditorId(e.target.value)}
                className="form-select"
                aria-invalid={!!reassignError}
                aria-describedby={reassignError ? 'reassign-auditor-error' : undefined}
              >
                <option value="">Choose an auditor</option>
                {auditors.map((u) => (
                  <option key={u.id} value={u.id}>
                    {personName(u)}
                    {u.id === reassignInstance.location?.ownerId ? ' (owns this area)' : ''}
                  </option>
                ))}
              </select>
              {reassignError && (
                <div id="reassign-auditor-error" role="alert" className="form-error">
                  {reassignError}
                </div>
              )}
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          title={`Delete schedule ${deleteTarget.scheduleCode}?`}
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" icon={<Trash2 size={16} />} loading={deleting} disabled={deleting} onClick={handleDeleteConfirm}>
                Delete schedule
              </Button>
            </>
          }
        >
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            {deleteTarget.title} will stop creating audits. Its audits that have not started are cancelled; audits in progress or submitted are kept.
          </p>
        </Modal>
      )}

      <AuditReportModal
        isOpen={!!reportExecutionId}
        onClose={() => setReportExecutionId(null)}
        executionId={reportExecutionId}
        onAcknowledged={() => {
          loadData();
        }}
      />
    </div>
  );
};

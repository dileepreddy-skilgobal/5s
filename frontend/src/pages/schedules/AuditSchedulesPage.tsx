import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { AuditSchedule, ScheduledAuditInstance, AuditTemplate, Location, User, OrgNode } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs, TabItem } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { AuditReportModal } from '../../components/common/AuditReportModal';
import {
  Calendar as CalendarIcon,
  Plus,
  Play,
  CheckCircle2,
  Clock,
  RotateCw,
  Users,
  MapPin,
  FileCheck,
  Search,
  Filter,
  RefreshCw,
  X,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  LayoutGrid,
  List,
  UserCheck,
  Pause,
  ExternalLink,
  Download,
  Mail,
  Send,
  CalendarCheck,
  Check,
  Share2,
  Info,
  CalendarDays,
  Smartphone,
} from 'lucide-react';

export const AuditSchedulesPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentTenant, addToast, currentUser } = useApp();

  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [instances, setInstances] = useState<ScheduledAuditInstance[]>([]);
  const [templates, setTemplates] = useState<AuditTemplate[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [orgNodes, setOrgNodes] = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs & Sub-view modes
  const [activeTab, setActiveTab] = useState<string>('instances');
  const [calendarViewMode, setCalendarViewMode] = useState<'month' | 'week' | 'table'>('month');

  // Calendar State (Default to current date or active instances)
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date | null>(null);
  const [activeDrawerInstance, setActiveDrawerInstance] = useState<ScheduledAuditInstance | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedLocationId, setSelectedLocationId] = useState('ALL');
  const [selectedAuditorFilterId, setSelectedAuditorFilterId] = useState('ALL');

  // Modals & Drawers
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [reassignModalInstance, setReassignModalInstance] = useState<ScheduledAuditInstance | null>(null);
  const [selectedAuditorId, setSelectedAuditorId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Google Calendar / Gmail Integration Modal
  const [gmailModalOpen, setGmailModalOpen] = useState(false);
  const [syncSelectedIds, setSyncSelectedIds] = useState<string[]>([]);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [notifyAuditorsEmail, setNotifyAuditorsEmail] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    templateId: '',
    auditType: 'ROUTINE',
    targetType: 'SPECIFIC_LOCATIONS',
    targetOrgNodeId: '',
    targetLocationIds: [] as string[],
    recurrence: 'WEEKLY',
    recurrenceIntervalDays: 7,
    rotationRule: 'DEPT_INDEPENDENCE',
    preferredAuditorId: '',
    startDate: new Date().toISOString().split('T')[0],
    leadTimeDays: 2,
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [schedulesData, instancesData, templatesData, locationsData, usersData, orgNodesData] =
        await Promise.all([
          api.getAuditSchedules().catch(() => []),
          api.getScheduledAuditInstances().catch(() => []),
          api.getAuditTemplates({ status: 'ACTIVE' }).catch(() => []),
          api.getLocations().catch(() => []),
          api.getUsers().catch(() => []),
          api.getOrgNodes().catch(() => []),
        ]);

      setSchedules(schedulesData);
      setInstances(instancesData);
      setTemplates(templatesData);
      setLocations(locationsData);
      setUsers(usersData);
      setOrgNodes(orgNodesData);

      // Pre-populate formData if templates exist
      if (templatesData.length > 0 && !formData.templateId) {
        setFormData((prev) => ({
          ...prev,
          templateId: templatesData[0].id,
          targetLocationIds: locationsData.slice(0, 2).map((l) => l.id),
        }));
      }

      // Pre-select all instances for Gmail sync
      setSyncSelectedIds(instancesData.map((i) => i.id));
    } catch (err: any) {
      console.error('Error loading schedules data:', err);
      addToast({
        type: 'error',
        title: 'Loading Failed',
        message: 'Could not fetch audit schedules and instances.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentTenant]);

  // Helper: Build 1-Click Google Calendar Direct Deep Link
  const buildGoogleCalendarUrl = (instance: ScheduledAuditInstance) => {
    const start = new Date(instance.plannedDate);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1-hour slot
    const startIso = start.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const endIso = end.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const locName = instance.location?.name || '5S Workstation';
    const areaCode = instance.location?.areaCode || 'LOC';
    const bld = instance.location?.building ? `${instance.location.building}, ` : '';
    const plant = instance.location?.orgNode?.name || 'Bangalore Automotive Plant Alpha';
    const auditor = instance.auditor ? `${instance.auditor.firstName} ${instance.auditor.lastName}` : 'Unassigned';
    const tpl = instance.templateVersion?.template?.name || '5S Inspection Routine';

    const title = encodeURIComponent(`[5S Audit] ${areaCode} - ${locName}`);
    const details = encodeURIComponent(
      `5S Visual Workplace Organization Audit\n\n` +
      `📌 Audit Code: ${instance.auditCode}\n` +
      `📍 Workstation: ${locName} (${areaCode})\n` +
      `🏢 Facility: ${bld}${plant}\n` +
      `📋 Template: ${tpl}\n` +
      `👤 Lead Auditor: ${auditor}\n` +
      `⏰ Due Date: ${new Date(instance.dueDate).toLocaleDateString()}`
    );
    const locationStr = encodeURIComponent(`${bld}${plant}`);

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startIso}/${endIso}&details=${details}&location=${locationStr}`;
  };

  // Helper: Download Universal .ICS File
  const handleDownloadIcs = async (instanceId?: string) => {
    try {
      const icsContent = await api.exportIcsCalendar(instanceId);
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.setAttribute('download', instanceId ? `5S-Audit-${instanceId.slice(0, 8)}.ics` : '5S-Audit-Schedules.ics');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      addToast({
        type: 'success',
        title: 'iCalendar Export Ready',
        message: 'Downloaded universal .ICS calendar file for Outlook, Apple, and Gmail Calendar.',
      });
    } catch (err: any) {
      console.error(err);
      addToast({
        type: 'error',
        title: 'Export Failed',
        message: 'Could not generate calendar file.',
      });
    }
  };

  // Helper: Gmail Calendar Sync Handler
  const handleExecuteGmailSync = async () => {
    if (syncSelectedIds.length === 0) {
      addToast({
        type: 'warning',
        title: 'No Audits Selected',
        message: 'Please select at least one audit instance to sync.',
      });
      return;
    }

    setSyncingGmail(true);
    try {
      const res = await api.syncGmailCalendar({
        instanceIds: syncSelectedIds,
        emailToSync: currentUser?.email || 'admin@skilglobal.com',
        notifyAttendees: notifyAuditorsEmail,
      });

      addToast({
        type: 'success',
        title: 'Gmail Calendar Synced',
        message: `Synced ${res.syncedCount} audit schedule(s) with Google Calendar & dispatched email invites.`,
      });
      setGmailModalOpen(false);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Sync Failed',
        message: err?.response?.data?.message || 'Could not complete Gmail calendar sync.',
      });
    } finally {
      setSyncingGmail(false);
    }
  };

  // Filtered Instances
  const filteredInstances = useMemo(() => {
    return instances.filter((inst) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const codeMatch = inst.auditCode?.toLowerCase().includes(q);
        const locMatch = inst.location?.name?.toLowerCase().includes(q) || inst.location?.areaCode?.toLowerCase().includes(q);
        const audMatch = (inst.auditor ? `${inst.auditor.firstName} ${inst.auditor.lastName}` : '').toLowerCase().includes(q);
        if (!codeMatch && !locMatch && !audMatch) return false;
      }

      // Status
      if (statusFilter === 'OVERDUE') {
        const isPastDue = new Date(inst.dueDate) < new Date() && inst.status === 'SCHEDULED';
        if (!isPastDue) return false;
      } else if (statusFilter !== 'ALL' && inst.status !== statusFilter) {
        return false;
      }

      // Location
      if (selectedLocationId !== 'ALL' && inst.locationId !== selectedLocationId) {
        return false;
      }

      // Auditor
      if (selectedAuditorFilterId !== 'ALL' && inst.auditorId !== selectedAuditorFilterId) {
        return false;
      }

      return true;
    });
  }, [instances, search, statusFilter, selectedLocationId, selectedAuditorFilterId]);

  // Calendar Day Map
  const instancesByDateMap = useMemo(() => {
    const map = new Map<string, ScheduledAuditInstance[]>();
    for (const inst of filteredInstances) {
      const dateKey = new Date(inst.plannedDate).toISOString().split('T')[0];
      const existing = map.get(dateKey) || [];
      existing.push(inst);
      map.set(dateKey, existing);
    }
    return map;
  }, [filteredInstances]);

  // Calendar Generation Helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const jumpToToday = () => {
    setCurrentDate(new Date());
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const prevMonthDays = new Date(year, month, 0).getDate();

  // Generate 42 grid cells (6 rows x 7 cols)
  const calendarCells = useMemo(() => {
    const cells: {
      date: Date;
      dateKey: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      dayNum: number;
    }[] = [];

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Previous month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const date = new Date(year, month - 1, d);
      const dateKey = date.toISOString().split('T')[0];
      cells.push({
        date,
        dateKey,
        isCurrentMonth: false,
        isToday: dateKey === todayStr,
        dayNum: d,
      });
    }

    // 2. Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateKey = date.toISOString().split('T')[0];
      cells.push({
        date,
        dateKey,
        isCurrentMonth: true,
        isToday: dateKey === todayStr,
        dayNum: d,
      });
    }

    // 3. Next month leading days to complete 35 or 42
    const totalCells = cells.length > 35 ? 42 : 35;
    const remaining = totalCells - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(year, month + 1, d);
      const dateKey = date.toISOString().split('T')[0];
      cells.push({
        date,
        dateKey,
        isCurrentMonth: false,
        isToday: dateKey === todayStr,
        dayNum: d,
      });
    }

    return cells;
  }, [year, month, daysInMonth, firstDayIndex, prevMonthDays]);

  // Week View Range
  const weekDays = useMemo(() => {
    const curr = new Date(currentDate);
    const dayOfWeek = curr.getDay();
    const sunday = new Date(curr.setDate(curr.getDate() - dayOfWeek));
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate]);

  // Handle Form Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.templateId) {
      addToast({
        type: 'warning',
        title: 'Missing Fields',
        message: 'Please provide a title and select an audit template.',
      });
      return;
    }

    setActionLoading(true);
    try {
      const code = `SCHED-${Date.now().toString().slice(-6)}`;
      await api.createAuditSchedule({
        scheduleCode: code,
        title: formData.title,
        templateId: formData.templateId,
        auditType: formData.auditType,
        targetType: formData.targetType,
        targetOrgNodeId: formData.targetOrgNodeId || undefined,
        targetLocationIds: formData.targetLocationIds,
        recurrence: formData.recurrence,
        recurrenceIntervalDays: formData.recurrenceIntervalDays,
        rotationRule: formData.rotationRule,
        preferredAuditorId: formData.preferredAuditorId || undefined,
        startDate: formData.startDate,
        leadTimeDays: formData.leadTimeDays,
      });

      addToast({
        type: 'success',
        title: 'Schedule Activated',
        message: `Recurring schedule '${formData.title}' created and initial audit cycles generated.`,
      });

      setCreateDrawerOpen(false);
      setFormData({
        title: '',
        templateId: templates[0]?.id || '',
        auditType: 'ROUTINE',
        targetType: 'SPECIFIC_LOCATIONS',
        targetOrgNodeId: '',
        targetLocationIds: locations.slice(0, 2).map((l) => l.id),
        recurrence: 'WEEKLY',
        recurrenceIntervalDays: 7,
        rotationRule: 'DEPT_INDEPENDENCE',
        preferredAuditorId: '',
        startDate: new Date().toISOString().split('T')[0],
        leadTimeDays: 2,
      });

      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Failed to Create Schedule',
        message: err?.response?.data?.message || 'An error occurred.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateNow = async (scheduleId: string) => {
    setActionLoading(true);
    try {
      await api.generateAuditsForSchedule(scheduleId);
      addToast({
        type: 'success',
        title: 'Audit Instances Generated',
        message: 'New audit instances scheduled successfully for the upcoming rotation cycle.',
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Generation Failed',
        message: err?.response?.data?.message || 'Could not generate audit cycle.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleScheduleStatus = async (sched: AuditSchedule) => {
    const newStatus = sched.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await api.updateAuditSchedule(sched.id, { status: newStatus });
      addToast({
        type: 'info',
        title: 'Status Updated',
        message: `Schedule status changed to ${newStatus}.`,
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: 'Could not update status.',
      });
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this schedule policy? Existing completed audits will be preserved.')) return;
    try {
      await api.deleteAuditSchedule(id);
      addToast({
        type: 'info',
        title: 'Schedule Removed',
        message: 'Schedule policy removed from registry.',
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Delete Failed',
        message: 'Could not delete schedule.',
      });
    }
  };

  const handleReassignAuditorSubmit = async () => {
    if (!reassignModalInstance || !selectedAuditorId) return;
    setActionLoading(true);
    try {
      await api.updateScheduledAuditInstance(reassignModalInstance.id, {
        auditorId: selectedAuditorId,
      });
      addToast({
        type: 'success',
        title: 'Auditor Reassigned',
        message: `Audit '${reassignModalInstance.auditCode}' reassigned to selected auditor.`,
      });
      setReassignModalInstance(null);
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Reassign Failed',
        message: err?.response?.data?.message || 'Could not reassign auditor.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewReport = async (inst: ScheduledAuditInstance) => {
    try {
      const execs = await api.getAuditExecutions({ locationId: inst.locationId });
      if (execs && execs.length > 0) {
        setSelectedReportId(execs[0].id);
        setReportModalOpen(true);
      } else {
        addToast({
          type: 'info',
          title: 'No Report Available',
          message: 'An execution session has not been logged for this instance yet.',
        });
      }
    } catch {
      addToast({
        type: 'error',
        title: 'Error',
        message: 'Could not fetch audit report.',
      });
    }
  };

  // Metrics
  const activeSchedulesCount = schedules.filter((s) => s.status === 'ACTIVE').length;
  const totalInstancesCount = instances.length;
  const scheduledUpcoming = instances.filter((i) => i.status === 'SCHEDULED').length;
  const completedCount = instances.filter((i) => i.status === 'SUBMITTED').length;

  const tabs: TabItem[] = [
    { id: 'instances', label: 'Audit Calendar & Execution Schedule', icon: <CalendarIcon size={15} />, badge: instances.length },
    { id: 'schedules', label: 'Recurring Schedules & Policies', icon: <RotateCw size={15} />, badge: schedules.length },
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <Badge variant="info" icon={<CalendarIcon size={12} />}>
              Audit Cadence & Calendar
            </Badge>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Interactive 5S Calendar & Google Workspace Sync Engine
            </span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            Audit Schedules & Execution Calendar
          </h1>
        </div>

        <div className="page-header-actions">
          <Button
            variant="secondary"
            icon={<Share2 size={15} color="#2563eb" />}
            onClick={() => setGmailModalOpen(true)}
            style={{ borderColor: 'rgba(37, 99, 235, 0.3)', background: 'rgba(37, 99, 235, 0.05)', color: 'var(--color-primary)' }}
          >
            Google Calendar Sync
          </Button>
          <Button
            variant="secondary"
            icon={<Download size={15} />}
            onClick={() => handleDownloadIcs()}
            title="Download universal .ICS file for Outlook, Apple, & Gmail"
          >
            Export .ICS
          </Button>
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
            Create Schedule
          </Button>
        </div>
      </div>

      {/* Friendly Section Explainer Banner */}
      <div className="section-intro-banner">
        <div className="section-intro-content">
          <div className="section-intro-icon">
            <CalendarIcon size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px 0' }}>
              Automated 5S Audit Cadence & Calendar Dispatch
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
              Orchestrate recurring audit rotations with auditor independence rules, view upcoming schedules in interactive calendar or week agenda views, and synchronize directly with Google Calendar & Outlook.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            size="sm"
            variant="secondary"
            icon={<Share2 size={14} color="#2563eb" />}
            onClick={() => setGmailModalOpen(true)}
            style={{ borderColor: 'rgba(37, 99, 235, 0.3)', background: 'rgba(37, 99, 235, 0.05)', color: 'var(--color-primary)' }}
          >
            Google Sync
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={14} />}
            onClick={() => setCreateDrawerOpen(true)}
          >
            New Schedule
          </Button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="metric-card accent-primary">
          <div className="metric-header">
            <div className="metric-label">Active Schedules</div>
            <div className="metric-icon primary">
              <RotateCw size={16} />
            </div>
          </div>
          <div className="metric-value">{activeSchedulesCount}</div>
          <div className="metric-subtext">Automatic recurrence cycles</div>
        </div>

        <div className="metric-card accent-warning">
          <div className="metric-header">
            <div className="metric-label">Scheduled Audits</div>
            <div className="metric-icon warning">
              <Clock size={16} />
            </div>
          </div>
          <div className="metric-value" style={{ color: 'var(--color-warning)' }}>
            {scheduledUpcoming}
          </div>
          <div className="metric-subtext">Pending auditor execution</div>
        </div>

        <div className="metric-card accent-success">
          <div className="metric-header">
            <div className="metric-label">Completed Audits</div>
            <div className="metric-icon success">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="metric-value" style={{ color: 'var(--color-success)' }}>
            {completedCount}
          </div>
          <div className="metric-subtext">Submitted & scored cycles</div>
        </div>

        <div className="metric-card accent-info">
          <div className="metric-header">
            <div className="metric-label">Google Workspace</div>
            <div className="metric-icon info">
              <CalendarDays size={16} />
            </div>
          </div>
          <div className="metric-value" style={{ color: '#10b981', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />
            Live Sync
          </div>
          <div className="metric-subtext">Gmail Calendar integration</div>
        </div>
      </div>

      {/* Main Tabs Card */}
      <Card noPadding>
        <div style={{ padding: '0 20px', background: 'var(--bg-surface)' }}>
          <Tabs tabs={tabs} activeTab={activeTab} onChange={(t) => setActiveTab(t)} />
        </div>
      </Card>

      {/* TAB 1: CALENDAR & SCHEDULED INSTANCES */}
      {activeTab === 'instances' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Calendar Controls & Filters Toolbar */}
          {/* Calendar Controls & Filters Toolbar */}
          <Card noPadding>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Row 1: Calendar Navigation (Left) & View Mode Switcher (Top-Right) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                {/* Left: Time Period Navigation */}
                {calendarViewMode !== 'table' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        background: 'var(--bg-surface-subtle)',
                        padding: '3px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <button
                        onClick={prevMonth}
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'transparent',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                        }}
                        title="Previous Month"
                      >
                        <ChevronLeft size={16} />
                      </button>

                      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', minWidth: '150px', textAlign: 'center' }}>
                        {monthNames[month]} {year}
                      </div>

                      <button
                        onClick={nextMonth}
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'transparent',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                        }}
                        title="Next Month"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    <Button size="sm" variant="secondary" onClick={jumpToToday}>
                      Today
                    </Button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Audit Schedule Registry &amp; Ledger
                    </span>
                    <Badge variant="neutral">{filteredInstances.length} Scheduled Runs</Badge>
                  </div>
                )}

                {/* Right: View Mode Switcher (Pinned to Top Right) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'var(--bg-surface-subtle)',
                    padding: '3px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    marginLeft: 'auto',
                  }}
                >
                  <button
                    onClick={() => setCalendarViewMode('month')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12.5px',
                      fontWeight: calendarViewMode === 'month' ? 700 : 500,
                      background: calendarViewMode === 'month' ? 'var(--color-primary)' : 'transparent',
                      color: calendarViewMode === 'month' ? '#FFFFFF' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <CalendarDays size={14} />
                    Month View
                  </button>
                  <button
                    onClick={() => setCalendarViewMode('week')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12.5px',
                      fontWeight: calendarViewMode === 'week' ? 700 : 500,
                      background: calendarViewMode === 'week' ? 'var(--color-primary)' : 'transparent',
                      color: calendarViewMode === 'week' ? '#FFFFFF' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <CalendarIcon size={14} />
                    Week Agenda
                  </button>
                  <button
                    onClick={() => setCalendarViewMode('table')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12.5px',
                      fontWeight: calendarViewMode === 'table' ? 700 : 500,
                      background: calendarViewMode === 'table' ? 'var(--color-primary)' : 'transparent',
                      color: calendarViewMode === 'table' ? '#FFFFFF' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <List size={14} />
                    Table View
                  </button>
                </div>
              </div>

              {/* Row 2: Search & Quick Filters Toolbar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border-subtle)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, flexWrap: 'wrap' }}>
                  {/* Search */}
                  <div style={{ position: 'relative', minWidth: '220px', maxWidth: '320px', flex: 1 }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input
                      type="text"
                      placeholder="Search audits, area..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="form-control"
                      style={{ paddingLeft: '32px', fontSize: '12.5px', height: '34px' }}
                    />
                  </div>

                  {/* Status Filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="form-control"
                    style={{ fontSize: '12.5px', height: '34px', width: '140px' }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="SUBMITTED">Completed</option>
                    <option value="OVERDUE">Past Due</option>
                  </select>

                  {/* Auditor Filter */}
                  <select
                    value={selectedAuditorFilterId}
                    onChange={(e) => setSelectedAuditorFilterId(e.target.value)}
                    className="form-control"
                    style={{ fontSize: '12.5px', height: '34px', width: '160px' }}
                  >
                    <option value="ALL">All Auditors</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </select>

                  {(search || statusFilter !== 'ALL' || selectedAuditorFilterId !== 'ALL') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSearch('');
                        setStatusFilter('ALL');
                        setSelectedAuditorFilterId('ALL');
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>

                {/* Right: Summary Count */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                  <span>Showing <strong style={{ color: 'var(--text-primary)' }}>{filteredInstances.length}</strong> audits</span>
                </div>
              </div>
            </div>
          </Card>

          {/* VIEW 1: MONTHLY INTERACTIVE CALENDAR GRID */}
          {calendarViewMode === 'month' && (
            <Card noPadding>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CalendarDays size={16} color="var(--color-primary)" />
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {monthNames[month]} {year} — Audit Roster & Inspection Slots
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3B82F6' }} />
                    <span>Scheduled</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B' }} />
                    <span>In Progress</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
                    <span>Completed</span>
                  </div>
                </div>
              </div>

              {/* Day of Week Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface-subtle)',
                }}
              >
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, idx) => (
                  <div
                    key={d}
                    style={{
                      padding: '10px 12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: idx === 0 || idx === 6 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      textAlign: 'center',
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar Grid 7x6 */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  background: 'var(--border-subtle)',
                  gap: '1px',
                }}
              >
                {calendarCells.map((cell, idx) => {
                  const dayAudits = instancesByDateMap.get(cell.dateKey) || [];
                  const isSelected = selectedCalendarDay?.toISOString().split('T')[0] === cell.dateKey;

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedCalendarDay(cell.date)}
                      style={{
                        minHeight: '120px',
                        background: cell.isCurrentMonth ? 'var(--bg-surface)' : 'var(--bg-surface-subtle)',
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        cursor: 'pointer',
                        transition: 'background var(--transition-fast)',
                        position: 'relative',
                        opacity: cell.isCurrentMonth ? 1 : 0.5,
                        boxShadow: isSelected ? 'inset 0 0 0 2px var(--color-primary)' : 'none',
                      }}
                    >
                      {/* Day Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: cell.isToday ? 800 : 600,
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: cell.isToday ? 'var(--color-primary)' : 'transparent',
                            color: cell.isToday ? '#FFFFFF' : 'var(--text-primary)',
                          }}
                        >
                          {cell.dayNum}
                        </span>

                        {dayAudits.length > 0 && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 'var(--radius-full)',
                              background: 'var(--color-primary-light)',
                              color: 'var(--color-primary)',
                            }}
                          >
                            {dayAudits.length} {dayAudits.length === 1 ? 'audit' : 'audits'}
                          </span>
                        )}
                      </div>

                      {/* Scheduled Audit Chips */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, overflowY: 'auto' }}>
                        {dayAudits.map((inst) => {
                          const isCompleted = inst.status === 'SUBMITTED';
                          const isInProgress = inst.status === 'IN_PROGRESS';
                          const isOverdue = new Date(inst.dueDate) < new Date() && !isCompleted;

                          const chipBg = isCompleted
                            ? 'rgba(16, 185, 129, 0.12)'
                            : isInProgress
                            ? 'rgba(245, 158, 11, 0.12)'
                            : isOverdue
                            ? 'rgba(239, 68, 68, 0.12)'
                            : 'rgba(37, 99, 235, 0.1)';

                          const chipColor = isCompleted
                            ? '#10B981'
                            : isInProgress
                            ? '#D97706'
                            : isOverdue
                            ? '#EF4444'
                            : '#2563EB';

                          const chipBorder = isCompleted
                            ? '1px solid rgba(16, 185, 129, 0.3)'
                            : isInProgress
                            ? '1px solid rgba(245, 158, 11, 0.3)'
                            : isOverdue
                            ? '1px solid rgba(239, 68, 68, 0.3)'
                            : '1px solid rgba(37, 99, 235, 0.25)';

                          return (
                            <div
                              key={inst.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDrawerInstance(inst);
                              }}
                              style={{
                                padding: '4px 6px',
                                borderRadius: 'var(--radius-xs)',
                                background: chipBg,
                                color: chipColor,
                                border: chipBorder,
                                fontSize: '11px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '4px',
                                transition: 'all 0.15s ease',
                              }}
                              title={`${inst.auditCode}: ${inst.location?.name} (${inst.status})`}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                                {isCompleted ? (
                                  <CheckCircle2 size={11} style={{ flexShrink: 0 }} />
                                ) : isInProgress ? (
                                  <Clock size={11} style={{ flexShrink: 0 }} />
                                ) : (
                                  <CalendarIcon size={11} style={{ flexShrink: 0 }} />
                                )}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {inst.location?.areaCode || inst.auditCode}
                                </span>
                              </div>

                              {inst.auditor && (
                                <div
                                  style={{
                                    width: '14px',
                                    height: '14px',
                                    borderRadius: '50%',
                                    background: chipColor,
                                    color: '#FFFFFF',
                                    fontSize: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}
                                  title={`Auditor: ${inst.auditor.firstName} ${inst.auditor.lastName}`}
                                >
                                  {inst.auditor.firstName[0]}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* VIEW 2: WEEKLY AGENDA VIEW */}
          {calendarViewMode === 'week' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px' }}>
              {weekDays.map((d, idx) => {
                const dateKey = d.toISOString().split('T')[0];
                const dayAudits = instancesByDateMap.get(dateKey) || [];
                const isToday = dateKey === new Date().toISOString().split('T')[0];

                return (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-lg)',
                      border: isToday ? '2px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      boxShadow: 'var(--shadow-xs)',
                    }}
                  >
                    {/* Day Column Header */}
                    <div
                      style={{
                        padding: '12px',
                        background: isToday ? 'var(--color-primary-light)' : 'var(--bg-surface-subtle)',
                        borderBottom: '1px solid var(--border-subtle)',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: isToday ? 'var(--color-primary)' : 'var(--text-primary)', marginTop: '2px' }}>
                        {d.getDate()}
                      </div>
                    </div>

                    {/* Day Content */}
                    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '320px', flex: 1 }}>
                      {dayAudits.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-tertiary)', fontSize: '11px' }}>
                          No audits scheduled
                        </div>
                      ) : (
                        dayAudits.map((inst) => (
                          <div
                            key={inst.id}
                            onClick={() => setActiveDrawerInstance(inst)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 'var(--radius-md)',
                              background: 'var(--bg-surface-subtle)',
                              border: '1px solid var(--border-subtle)',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span className="code-tag" style={{ fontSize: '10px' }}>{inst.auditCode}</span>
                              <Badge variant={inst.status === 'SUBMITTED' ? 'success' : inst.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}>
                                {inst.status}
                              </Badge>
                            </div>

                            <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                              {inst.location?.name}
                            </div>

                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                              Auditor: {inst.auditor ? `${inst.auditor.firstName} ${inst.auditor.lastName}` : 'Unassigned'}
                            </div>

                            {/* Quick Actions */}
                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                              <a
                                href={buildGoogleCalendarUrl(inst)}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  padding: '3px 6px',
                                  borderRadius: 'var(--radius-xs)',
                                  background: 'rgba(37, 99, 235, 0.1)',
                                  color: 'var(--color-primary)',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  textDecoration: 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                              >
                                <CalendarIcon size={10} />
                                Google
                              </a>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/mobile-audit?locationId=${inst.locationId}`);
                                }}
                                style={{
                                  padding: '3px 6px',
                                  borderRadius: 'var(--radius-xs)',
                                  background: 'var(--color-primary)',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                              >
                                <Smartphone size={10} />
                                Run
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 3: COMPREHENSIVE ENTERPRISE TABLE VIEW */}
          {calendarViewMode === 'table' && (
            <Card noPadding>
              <div className="enterprise-table-container">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th>Audit Code</th>
                      <th>Location / Workstation</th>
                      <th>Template</th>
                      <th>Planned Date</th>
                      <th>SLA Due Date</th>
                      <th>Assigned Auditor</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Calendar & Execution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInstances.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                          No scheduled audit instances matching your filters.
                        </td>
                      </tr>
                    ) : (
                      filteredInstances.map((inst) => (
                        <tr key={inst.id}>
                          <td>
                            <span className="code-tag">{inst.auditCode}</span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {inst.location?.name}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {inst.location?.areaCode} • {inst.location?.orgNode?.name || 'Department'}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: '13px', fontWeight: 600 }}>
                              {inst.templateVersion?.template?.name || 'Discrete 5S Audit Checklist'}
                            </div>
                          </td>
                          <td>{new Date(inst.plannedDate).toLocaleDateString()}</td>
                          <td>
                            <span style={{ fontWeight: 600, color: new Date(inst.dueDate) < new Date() && inst.status === 'SCHEDULED' ? 'var(--color-danger)' : 'inherit' }}>
                              {new Date(inst.dueDate).toLocaleDateString()}
                            </span>
                          </td>
                          <td>
                            {inst.auditor ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ width: '22px', height: '22px', borderRadius: 'var(--radius-full)', background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700 }}>
                                  {inst.auditor.firstName[0]}
                                </div>
                                <span style={{ fontSize: '12px' }}>{inst.auditor.firstName} {inst.auditor.lastName}</span>
                              </div>
                            ) : (
                              <Badge variant="warning">Unassigned</Badge>
                            )}
                          </td>
                          <td>
                            <Badge variant={inst.status === 'SUBMITTED' ? 'success' : inst.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}>
                              {inst.status}
                            </Badge>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              <a
                                href={buildGoogleCalendarUrl(inst)}
                                target="_blank"
                                rel="noreferrer"
                                title="Add directly to Google Calendar"
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'rgba(37, 99, 235, 0.08)',
                                  color: 'var(--color-primary)',
                                  border: '1px solid rgba(37, 99, 235, 0.2)',
                                  textDecoration: 'none',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <CalendarIcon size={12} />
                                Google
                              </a>

                              <Button
                                size="sm"
                                variant="secondary"
                                icon={<Smartphone size={13} />}
                                onClick={() => navigate(`/mobile-audit?locationId=${inst.locationId}`)}
                              >
                                Run
                              </Button>

                              {inst.status === 'SUBMITTED' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={<FileCheck size={13} />}
                                  onClick={() => handleViewReport(inst)}
                                >
                                  Report
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<UserCheck size={13} />}
                                onClick={() => {
                                  setSelectedAuditorId(inst.auditorId || '');
                                  setReassignModalInstance(inst);
                                }}
                              >
                                Reassign
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: RECURRING AUDIT SCHEDULES */}
      {activeTab === 'schedules' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <RefreshCw size={28} className="spin-animation" style={{ marginBottom: '12px' }} />
              <div>Loading audit schedules...</div>
            </div>
          ) : schedules.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <RotateCw size={36} color="var(--text-tertiary)" style={{ marginBottom: '12px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  No Recurring Audit Schedules
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 20px auto' }}>
                  Create automated schedules with daily, weekly, or monthly recurrence and auditor rotation rules.
                </p>
                <Button
                  variant="primary"
                  icon={<Plus size={16} />}
                  onClick={() => setCreateDrawerOpen(true)}
                >
                  Create First Schedule
                </Button>
              </div>
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
              {schedules.map((sched) => {
                const targetCount = sched.targetLocationIds?.length || 0;
                return (
                  <div
                    key={sched.id}
                    className="card"
                    style={{
                      padding: '20px 24px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '16px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="code-tag">{sched.scheduleCode}</span>
                          <Badge variant="purple">{sched.recurrence}</Badge>
                        </div>
                        <Badge variant={sched.status === 'ACTIVE' ? 'success' : 'warning'}>
                          {sched.status}
                        </Badge>
                      </div>

                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 6px 0' }}>
                        {sched.title}
                      </h3>

                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        Template: <strong>{sched.template?.name || 'Standard Template'}</strong>
                      </div>

                      <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-tertiary)' }}>Rotation Rule:</span>
                          <strong>{sched.rotationRule === 'DEPT_INDEPENDENCE' ? 'Department Independence Rule' : sched.rotationRule}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-tertiary)' }}>Target Coverage:</span>
                          <strong>{sched.targetType === 'ALL_AREAS' ? 'All Areas' : `${targetCount} Specific Locations`}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-tertiary)' }}>Lead Time:</span>
                          <strong>{sched.leadTimeDays} days before due</strong>
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        Next: {new Date(sched.nextRunAt || Date.now()).toLocaleDateString()}
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Play size={13} />}
                          loading={actionLoading}
                          onClick={() => handleGenerateNow(sched.id)}
                          title="Generate Cycle Now"
                        >
                          Generate Now
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleScheduleStatus(sched)}
                        >
                          {sched.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                        </Button>

                        <button
                          onClick={() => handleDeleteSchedule(sched.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '4px' }}
                          title="Delete Schedule"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: GMAIL & GOOGLE CALENDAR INTEGRATION SUITE */}
      <Modal
        isOpen={gmailModalOpen}
        onClose={() => setGmailModalOpen(false)}
        title="Gmail & Google Calendar Synchronization"
        subtitle="Live two-way integration with Google Workspace, Gmail invitations, and .ICS calendar export"
        maxWidth="620px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Connection Status Banner */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)',
              border: '1px solid rgba(37, 99, 235, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <CalendarCheck size={20} color="#2563EB" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                  Google Workspace / Gmail Account Connected
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                  {currentUser?.email || 'admin@skilglobal.com'} (Enterprise CalDAV Active)
                </div>
              </div>
            </div>
            <Badge variant="success">Connected</Badge>
          </div>

          {/* Sync Options */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Select Scheduled Audits to Synchronize ({syncSelectedIds.length} of {instances.length})
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSyncSelectedIds(instances.map((i) => i.id))}
                  style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Select All
                </button>
                <span style={{ color: 'var(--text-tertiary)' }}>•</span>
                <button
                  type="button"
                  onClick={() => setSyncSelectedIds([])}
                  style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '11px', cursor: 'pointer' }}
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', background: 'var(--bg-surface-subtle)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {instances.map((inst) => {
                const isSelected = syncSelectedIds.includes(inst.id);
                return (
                  <label
                    key={inst.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-xs)',
                      background: isSelected ? 'var(--bg-surface)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSyncSelectedIds((prev) =>
                            isSelected ? prev.filter((id) => id !== inst.id) : [...prev, inst.id]
                          );
                        }}
                      />
                      <span><strong>{inst.auditCode}</strong> — {inst.location?.name}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      {new Date(inst.plannedDate).toLocaleDateString()}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Email Notification Option */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={notifyAuditorsEmail}
              onChange={(e) => setNotifyAuditorsEmail(e.target.checked)}
            />
            <span>
              Dispatch formal Gmail Calendar invitations (with RSVP & meeting links) to assigned auditors and area owners
            </span>
          </label>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <Button
              variant="secondary"
              icon={<Download size={14} />}
              onClick={() => {
                handleDownloadIcs();
                setGmailModalOpen(false);
              }}
            >
              Download Universal .ICS
            </Button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" onClick={() => setGmailModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={<Send size={14} />}
                loading={syncingGmail}
                onClick={handleExecuteGmailSync}
              >
                Sync to Google Calendar
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* MODAL 1: AUDIT INSTANCE DETAILS & 1-CLICK CALENDAR INTEGRATION */}
      {activeDrawerInstance && (
        <Modal
          isOpen={true}
          onClose={() => setActiveDrawerInstance(null)}
          title={`Audit Details: ${activeDrawerInstance.auditCode}`}
          subtitle="Inspection status, location, auditor, and calendar sync"
          maxWidth="560px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Status & Timing Banner */}
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Inspection Status
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <Badge variant={activeDrawerInstance.status === 'SUBMITTED' ? 'success' : activeDrawerInstance.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}>
                    {activeDrawerInstance.status}
                  </Badge>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {activeDrawerInstance.auditType} Cycle
                  </span>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Planned Date</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {new Date(activeDrawerInstance.plannedDate).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Location & Template Information */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Target Workstation & Template
              </div>

              <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Area Name:</span>
                  <strong>{activeDrawerInstance.location?.name} ({activeDrawerInstance.location?.areaCode})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Building / Bay:</span>
                  <span>{activeDrawerInstance.location?.building || 'Main Bay'} ({activeDrawerInstance.location?.floor || 'Ground'})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Template:</span>
                  <strong>{activeDrawerInstance.templateVersion?.template?.name || 'Standard 5S Routine'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>SLA Due Date:</span>
                  <strong style={{ color: 'var(--color-primary)' }}>{new Date(activeDrawerInstance.dueDate).toLocaleDateString()}</strong>
                </div>
              </div>
            </div>

            {/* Assigned Auditor */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Assigned Certified Auditor
              </div>

              <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    {activeDrawerInstance.auditor ? activeDrawerInstance.auditor.firstName[0] : 'U'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                      {activeDrawerInstance.auditor ? `${activeDrawerInstance.auditor.firstName} ${activeDrawerInstance.auditor.lastName}` : 'Unassigned Auditor'}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
                      {activeDrawerInstance.auditor?.email || 'Quality & Safety Assessor'}
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSelectedAuditorId(activeDrawerInstance.auditorId || '');
                    setReassignModalInstance(activeDrawerInstance);
                  }}
                >
                  Change
                </Button>
              </div>
            </div>

            {/* 1-Click Google Calendar & Actions Suite */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Calendar Sync & Execution Actions
              </div>

              <a
                href={buildGoogleCalendarUrl(activeDrawerInstance)}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '11px',
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '13px',
                  textDecoration: 'none',
                  boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <CalendarIcon size={16} />
                Add to Google Calendar (1-Click)
                <ExternalLink size={14} style={{ opacity: 0.8 }} />
              </a>

              <Button
                variant="secondary"
                icon={<Download size={15} />}
                onClick={() => handleDownloadIcs(activeDrawerInstance.id)}
                style={{ width: '100%' }}
              >
                Download .ICS File for this Audit
              </Button>

              {activeDrawerInstance.status === 'SUBMITTED' && (
                <Button
                  variant="secondary"
                  icon={<FileCheck size={16} />}
                  onClick={() => handleViewReport(activeDrawerInstance)}
                  style={{ width: '100%' }}
                >
                  View Official Audit Report
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* CREATE SCHEDULE MODAL */}
      <Modal
        isOpen={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        title="Create Recurring 5S Audit Schedule"
        subtitle="Configure template, recurrence cadence, rotation policy, and target scope"
        maxWidth="640px"
      >
        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="form-group">
            <label className="form-label">Schedule Title *</label>
            <input
              type="text"
              placeholder="e.g. Weekly Operational 5S Routine - Assembly Bay"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="form-control"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Audit Template *</label>
              <select
                value={formData.templateId}
                onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
                className="form-control"
                required
              >
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.code} — {tpl.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Recurrence Cadence *</label>
              <select
                value={formData.recurrence}
                onChange={(e) => {
                  const rec = e.target.value;
                  const interval = rec === 'DAILY' ? 1 : rec === 'MONTHLY' ? 30 : rec === 'FORTNIGHTLY' ? 14 : 7;
                  setFormData({ ...formData, recurrence: rec, recurrenceIntervalDays: interval });
                }}
                className="form-control"
                required
              >
                <option value="DAILY">Daily Inspection (1 Day)</option>
                <option value="WEEKLY">Weekly Routine (7 Days)</option>
                <option value="FORTNIGHTLY">Fortnightly Cycle (14 Days)</option>
                <option value="MONTHLY">Monthly Audit (30 Days)</option>
                <option value="QUARTERLY">Quarterly Assessment (90 Days)</option>
                <option value="ANNUALLY">Annual Certification</option>
              </select>
            </div>
          </div>

          {/* Auditor Rotation Policy */}
          <div className="form-group">
            <label className="form-label">Auditor Rotation Policy</label>
            <select
              value={formData.rotationRule}
              onChange={(e) => setFormData({ ...formData, rotationRule: e.target.value })}
              className="form-control"
            >
              <option value="DEPT_INDEPENDENCE">Department Independence Rule (Auditor cannot audit their own dept)</option>
              <option value="ROUND_ROBIN">Round-Robin Sequential Rotation</option>
              <option value="ASSIGNED_AUDITOR">Fixed Assigned Auditor</option>
              <option value="RANDOM">Random Unbiased Selection</option>
            </select>
          </div>

          {/* Target Workstation Selection */}
          <div className="form-group">
            <label className="form-label">Target Area Scope</label>
            <select
              value={formData.targetType}
              onChange={(e) => setFormData({ ...formData, targetType: e.target.value })}
              className="form-control"
            >
              <option value="SPECIFIC_LOCATIONS">Specific Workstations (Multi-select below)</option>
              <option value="ALL_AREAS">All Areas Across Entire Plant</option>
            </select>
          </div>

          {formData.targetType === 'SPECIFIC_LOCATIONS' && (
            <div className="form-group">
              <label className="form-label">Select Target Workstations ({formData.targetLocationIds.length} selected)</label>
              <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', background: 'var(--bg-surface)' }}>
                {locations.map((loc) => {
                  const checked = formData.targetLocationIds.includes(loc.id);
                  return (
                    <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const updated = checked
                            ? formData.targetLocationIds.filter((id) => id !== loc.id)
                            : [...formData.targetLocationIds, loc.id];
                          setFormData({ ...formData, targetLocationIds: updated });
                        }}
                      />
                      <span><strong>{loc.areaCode}</strong> — {loc.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Start Date *</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="form-control"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Lead Time (Days before Planned Date)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={formData.leadTimeDays}
                onChange={(e) => setFormData({ ...formData, leadTimeDays: Number(e.target.value) })}
                className="form-control"
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <Button variant="secondary" onClick={() => setCreateDrawerOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={actionLoading} icon={<RotateCw size={14} />}>
              Activate Schedule
            </Button>
          </div>
        </form>
      </Modal>

      {/* REASSIGN AUDITOR MODAL */}
      {reassignModalInstance && (
        <Modal
          isOpen={true}
          onClose={() => setReassignModalInstance(null)}
          title={`Reassign Auditor: ${reassignModalInstance.auditCode}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              Location: <strong>{reassignModalInstance.location?.name} ({reassignModalInstance.location?.areaCode})</strong>
            </p>

            <div className="form-group">
              <label className="form-label">Assign Certified Auditor</label>
              <select
                value={selectedAuditorId}
                onChange={(e) => setSelectedAuditorId(e.target.value)}
                className="form-control"
              >
                <option value="">-- Select Auditor --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({u.department || 'Operations'})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="secondary" onClick={() => setReassignModalInstance(null)}>
                Cancel
              </Button>
              <Button variant="primary" loading={actionLoading} onClick={handleReassignAuditorSubmit}>
                Confirm Reassignment
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* OFFICIAL REPORT & ACKNOWLEDGEMENT MODAL */}
      <AuditReportModal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setSelectedReportId(null);
        }}
        executionId={selectedReportId}
        onAcknowledged={() => {
          loadData();
        }}
      />
    </div>
  );
};

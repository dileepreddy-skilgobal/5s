import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Award,
  BarChart3,
  Clock,
  Gauge,
  LineChart,
  Trophy,
  UserCheck,
  ClipboardCheck,
  Calendar,
  Download,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Layers,
  MapPin,
  Play,
  Tag,
  X,
  AlertCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTerminology } from '../../hooks/useTerminology';
import { useI18n } from '../../i18n';
import { api, getApiErrorMessage, getBlobApiErrorMessage, isBlobPlanFeatureRequiredError } from '../../services/api';
import { insightsApi } from '../../services/api-insights';
import { InsightsReportFilterKey, InsightsReportFilterValues, InsightsReportPreview, InsightsReportRegister } from '../../types/insights';
import { PlanUpgradeNotice } from '../../components/common/PlanUpgradeNotice';
import { Lock } from 'lucide-react';
import {
  actionStatusLabel,
  auditStatusLabel,
  certificationLevelLabel,
  humanize,
  locationStatusLabel,
  observationStatusLabel,
  pillarLabel,
  PILLARS,
  redTagCategoryLabel,
  redTagStatusLabel,
  scheduledAuditStatusLabel,
  severityLabel,
} from '../../constants/labels';
import { Location, OrgTreeNode, ReportColumn, ReportExportFormat, User } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PageHeader } from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/StateViews';

// --- Filter option catalogues (mirror backend/src/core/validation/domain-values.ts and schema status comments) ---

const STATUS_OPTIONS: Record<string, string[]> = {
  audits: ['IN_PROGRESS', 'SUBMITTED', 'ACKNOWLEDGED', 'DISPUTED', 'VERIFIED', 'REJECTED'],
  observations: ['OPEN', 'ACTION_ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'RESOLVED', 'CLOSED'],
  actions: ['PENDING_ACKNOWLEDGEMENT', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'VERIFIED', 'CLOSED', 'REOPENED'],
  'red-tags': ['RED_TAGGED', 'IN_HOLDING_AREA', 'PENDING_DISPOSITION', 'DISPOSITION_APPROVED', 'DISPOSED', 'RETURNED', 'CANCELLED'],
  'audit-plan': ['SCHEDULED', 'IN_PROGRESS', 'SUBMITTED', 'OVERDUE', 'CANCELLED'],
  locations: ['ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE'],
  certification: ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'NONE'],
  'action-ageing': ['PENDING_ACKNOWLEDGEMENT', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'REOPENED'],
};

/** Origin of a corrective action (CorrectiveAction.source) and its type. */
const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'AUDIT', label: 'Audit finding' },
  { value: 'OBSERVATION', label: 'Observation' },
  { value: 'RED_TAG', label: 'Red tag' },
  { value: 'MANAGEMENT_REVIEW', label: 'Management review' },
];
const ACTION_TYPE_OPTIONS = ['CORRECTIVE', 'PREVENTIVE', 'KAIZEN'];

/** Management registers (BRD §81), listed after the operational registers. */
const MANAGEMENT_REGISTERS = new Set(['area-ranking', 'department-ranking', 'maturity', 'certification', 'audit-trend', 'auditor-performance', 'action-ageing']);

/** Filters a link may preset through the query string, e.g. /reports?register=observations&repeatOnly=1. */
const URL_FILTERS: InsightsReportFilterKey[] = ['from', 'to', 'locationId', 'orgNodeId', 'status', 'severity', 'category', 'assigneeId', 'auditorId', 'source', 'actionType', 'overdueOnly', 'repeatOnly'];
const BOOLEAN_FILTERS: InsightsReportFilterKey[] = ['overdueOnly', 'repeatOnly'];

const SEVERITY_OPTIONS = ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL', 'KAIZEN_OPPORTUNITY'];

const CATEGORY_OPTIONS: Record<string, string[]> = {
  observations: [...PILLARS],
  'red-tags': [
    'UNNEEDED_TOOL',
    'SURPLUS_INVENTORY',
    'BROKEN_EQUIPMENT',
    'SCRAP_WASTE',
    'UNLABELLED_MATERIAL',
    'EXPIRED_ITEM',
    'OBSOLETE_EQUIPMENT',
    'OTHER',
  ],
};

const REGISTER_ICONS: Record<string, React.ReactNode> = {
  audits: <ClipboardCheck size={18} />,
  observations: <AlertTriangle size={18} />,
  actions: <Layers size={18} />,
  'red-tags': <Tag size={18} />,
  'audit-plan': <Calendar size={18} />,
  locations: <MapPin size={18} />,
  'area-ranking': <Trophy size={18} />,
  'department-ranking': <BarChart3 size={18} />,
  maturity: <Gauge size={18} />,
  certification: <Award size={18} />,
  'audit-trend': <LineChart size={18} />,
  'auditor-performance': <UserCheck size={18} />,
  'action-ageing': <Clock size={18} />,
};

/** Shared display labels for each register's status values. */
const STATUS_LABEL: Record<string, (code: string) => string> = {
  audits: auditStatusLabel,
  observations: observationStatusLabel,
  actions: actionStatusLabel,
  'red-tags': redTagStatusLabel,
  'audit-plan': scheduledAuditStatusLabel,
  locations: locationStatusLabel,
  certification: certificationLevelLabel,
  'action-ageing': actionStatusLabel,
};

const optionLabel = (registerKey: string, field: 'status' | 'severity' | 'category', code: string): string => {
  if (field === 'severity') return severityLabel(code);
  if (field === 'category') return registerKey === 'observations' ? pillarLabel(code) : redTagCategoryLabel(code);
  return (STATUS_LABEL[registerKey] ?? humanize)(code);
};

/** Filter labels use the standard form label (sentence case, above the control). */
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '6px' };

const controlStyle: React.CSSProperties = { width: '100%' };

const EXPORTS: { format: ReportExportFormat; label: string; icon: React.ReactNode }[] = [
  { format: 'csv', label: 'CSV', icon: <FileText size={16} /> },
  { format: 'xlsx', label: 'Excel', icon: <FileSpreadsheet size={16} /> },
  { format: 'pdf', label: 'PDF', icon: <Download size={16} /> },
];

/** Org tree flattened depth-first for an indented <select>. */
const flattenTree = (nodes: OrgTreeNode[] | null | undefined, depth = 0, out: { id: string; label: string }[] = []) => {
  (nodes || []).forEach((n) => {
    out.push({ id: n.id, label: `${'  '.repeat(depth)}${n.name}${n.nodeType ? ` (${humanize(n.nodeType)})` : ''}` });
    if (Array.isArray(n.children) && n.children.length) flattenTree(n.children, depth + 1, out);
  });
  return out;
};

interface CellFormatters {
  date: (value: string) => string;
  dateTime: (value: string) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const formatCell = (value: unknown, column: ReportColumn, fmt: CellFormatters): React.ReactNode => {
  if (value === null || value === undefined || value === '') return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
  switch (column.type) {
    case 'date':
    case 'datetime': {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) return String(value);
      return column.type === 'date' ? fmt.date(String(value)) : fmt.dateTime(String(value));
    }
    case 'percent': {
      const n = Number(value);
      return Number.isFinite(n) ? `${fmt.number(n, { maximumFractionDigits: 1 })}%` : String(value);
    }
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? fmt.number(n) : String(value);
    }
    case 'boolean':
      return value === true || value === 'true' ? 'Yes' : 'No';
    default:
      return String(value);
  }
};

const isNumeric = (c: ReportColumn) => c.type === 'number' || c.type === 'percent';

export const ReportsPage: React.FC = () => {
  const { addToast } = useApp();
  const [searchParams] = useSearchParams();
  /** Register and filters requested by a link (e.g. an analytics tile); applied once the registers are loaded. */
  const linked = useRef<{ key: string; filters: InsightsReportFilterValues } | null>(null);
  if (linked.current === null) {
    const key = searchParams.get('register');
    const preset: InsightsReportFilterValues = {};
    URL_FILTERS.forEach((k) => {
      const v = searchParams.get(k);
      if (!v) return;
      if (BOOLEAN_FILTERS.includes(k)) (preset as Record<string, unknown>)[k] = v === '1' || v === 'true';
      else (preset as Record<string, unknown>)[k] = v;
    });
    linked.current = { key: key ?? '', filters: preset };
  }
  const { relabel } = useTerminology();
  const { formatDate, formatDateTime, formatNumber } = useI18n();
  const cellFormatters: CellFormatters = { date: (v) => formatDate(v), dateTime: (v) => formatDateTime(v), number: (v, o) => formatNumber(v, o) };

  const [registers, setRegisters] = useState<InsightsReportRegister[]>([]);
  const [loadingRegisters, setLoadingRegisters] = useState(true);
  const [registersError, setRegistersError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [filters, setFilters] = useState<InsightsReportFilterValues>(() => linked.current?.filters ?? {});
  const [preview, setPreview] = useState<InsightsReportPreview | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ReportExportFormat | null>(null);
  // File exports (REPORTS_EXPORT) not in the plan: known from the register list, or from a 403 on export
  const [exportLocked, setExportLocked] = useState(false);

  const [locations, setLocations] = useState<Location[]>([]);
  const [orgOptions, setOrgOptions] = useState<{ id: string; label: string }[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const loadRegisters = async () => {
    setLoadingRegisters(true);
    setRegistersError(null);
    try {
      const list = await insightsApi.getReportRegisters();
      const safe = Array.isArray(list) ? list : [];
      setRegisters(safe);
      setExportLocked(safe.some((r) => r.exportAllowed === false));
      const requested = linked.current?.key;
      setSelectedKey((current) =>
        current && safe.some((r) => r.key === current) ? current : requested && safe.some((r) => r.key === requested) ? requested : safe[0]?.key ?? null,
      );
    } catch (err) {
      setRegistersError(getApiErrorMessage(err, 'Could not load the available reports.'));
    } finally {
      setLoadingRegisters(false);
    }
  };

  useEffect(() => {
    loadRegisters();
    // Filter pick-lists are a convenience; a failed lookup just leaves that list empty
    api
      .getLocations()
      .then((l) => setLocations(Array.isArray(l) ? l : []))
      .catch(() => undefined);
    api
      .getOrgTree()
      .then((t) => setOrgOptions(flattenTree(Array.isArray(t) ? t : [])))
      .catch(() => undefined);
    api
      .getUsers()
      .then((u) => setUsers(Array.isArray(u) ? u : []))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const register = useMemo(() => registers.find((r) => r.key === selectedKey) || null, [registers, selectedKey]);
  const has = (key: InsightsReportFilterKey) => !!register && Array.isArray(register.filters) && register.filters.includes(key);

  const sortedLocations = useMemo(
    () => [...locations].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [locations],
  );
  const sortedUsers = useMemo(
    () =>
      [...users]
        .filter((u) => u.status !== 'INACTIVE')
        .sort((a, b) => `${a.firstName || ''} ${a.lastName || ''}`.localeCompare(`${b.firstName || ''} ${b.lastName || ''}`)),
    [users],
  );

  const selectRegister = (key: string) => {
    if (key === selectedKey) return;
    setSelectedKey(key);
    // Status / severity / category values are register specific; dates and scope carry over
    setFilters((f) => ({ from: f.from, to: f.to, locationId: f.locationId, orgNodeId: f.orgNodeId }));
    setPreview(null);
    setRunError(null);
  };

  const setFilter = <K extends keyof InsightsReportFilterValues>(key: K, value: InsightsReportFilterValues[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  /** Only the filters this register supports are sent. */
  const activeFilters = (): InsightsReportFilterValues => {
    const out: InsightsReportFilterValues = {};
    if (!register) return out;
    (register.filters || []).forEach((k) => {
      const v = filters[k];
      if (v !== undefined && v !== '' && v !== false) (out as Record<string, unknown>)[k] = v;
    });
    return out;
  };

  const hasActiveFilters = Object.keys(activeFilters()).length > 0;

  const validate = (): string | null => {
    const f = activeFilters();
    if (f.from && f.to && f.from > f.to) return '"From" date must be on or before the "To" date.';
    return null;
  };

  const run = async () => {
    if (!register) return;
    const invalid = validate();
    if (invalid) {
      addToast({ type: 'warning', title: 'Check the filters', message: invalid });
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const res = await insightsApi.getReportPreview(register.key, activeFilters());
      setPreview(res && Array.isArray(res.rows) ? res : null);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Could not run the report.');
      setRunError(message);
      setPreview(null);
    } finally {
      setRunning(false);
    }
  };

  const exportFile = async (format: ReportExportFormat) => {
    if (!register || exporting) return;
    const invalid = validate();
    if (invalid) {
      addToast({ type: 'warning', title: 'Check the filters', message: invalid });
      return;
    }
    setExporting(format);
    try {
      const { blob, filename } = await insightsApi.downloadReport(register.key, format, activeFilters());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      addToast({ type: 'success', title: 'Export ready', message: `${filename} downloaded.` });
    } catch (err) {
      if (await isBlobPlanFeatureRequiredError(err)) {
        setExportLocked(true);
        return;
      }
      const message = await getBlobApiErrorMessage(err, `Could not export the report as ${format.toUpperCase()}.`);
      addToast({ type: 'error', title: 'Export failed', message });
    } finally {
      setExporting(null);
    }
  };

  const clearFilters = () => {
    setFilters({});
  };

  // A link that names a register runs it straight away with its preset filters
  useEffect(() => {
    if (register && linked.current?.key && register.key === linked.current.key) {
      linked.current = { key: '', filters: {} };
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register]);

  const columns: ReportColumn[] = preview?.columns?.length ? preview.columns : register?.columns || [];
  const statusOptions = register ? STATUS_OPTIONS[register.key] : undefined;
  const categoryOptions = register ? CATEGORY_OPTIONS[register.key] : undefined;

  const renderFreeOrSelect = (
    id: string,
    label: string,
    key: 'status' | 'severity' | 'category',
    options: string[] | undefined,
    allLabel: string,
  ) => (
    <div>
      <label className="form-label" style={labelStyle} htmlFor={id}>
        {label}
      </label>
      {options && options.length ? (
        <select id={id} className="form-select" value={filters[key] || ''} onChange={(e) => setFilter(key, e.target.value)} style={controlStyle}>
          <option value="">{allLabel}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {register ? optionLabel(register.key, key, o) : humanize(o)}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type="text"
          className="form-input"
          placeholder="Exact value"
          value={filters[key] || ''}
          onChange={(e) => setFilter(key, e.target.value)}
          style={controlStyle}
        />
      )}
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Reports & Export"
        description="Filter, preview and export the system of record as CSV, Excel or PDF."
      />

      {/* Register picker */}
      {loadingRegisters ? (
        <Card>
          <LoadingState label="Loading reports…" />
        </Card>
      ) : registersError ? (
        <Card>
          <ErrorState message={registersError} onRetry={loadRegisters} />
        </Card>
      ) : registers.length === 0 ? (
        <Card>
          <EmptyState title="No reports are available." icon={<FileBarChart size={28} />} />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[
            { label: 'Registers', items: registers.filter((r) => !MANAGEMENT_REGISTERS.has(r.key)) },
            { label: 'Management reports', items: registers.filter((r) => MANAGEMENT_REGISTERS.has(r.key)) },
          ]
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <section key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>{group.label}</h2>
                <div role="group" aria-label={group.label} className="grid-auto" style={{ '--min': '240px', gap: '12px' } as React.CSSProperties}>
                  {group.items.map((r) => {
                    const active = r.key === selectedKey;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => selectRegister(r.key)}
                        style={{
                          display: 'flex',
                          gap: '12px',
                          alignItems: 'flex-start',
                          textAlign: 'left',
                          padding: '16px',
                          borderRadius: 'var(--radius-lg)',
                          border: `1px solid ${active ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
                          background: active ? 'var(--bg-pale)' : 'var(--bg-surface)',
                          boxShadow: active ? 'inset 0 0 0 1px var(--color-primary)' : 'none',
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                          font: 'inherit',
                          transition: 'border-color var(--transition-fast), background-color var(--transition-fast)',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: '36px',
                            height: '36px',
                            flexShrink: 0,
                            borderRadius: 'var(--radius-md)',
                            background: active ? 'var(--color-primary-light)' : 'var(--bg-surface-subtle)',
                            color: 'var(--color-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {REGISTER_ICONS[r.key] || <FileBarChart size={18} />}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: active ? 'var(--color-primary)' : 'var(--text-primary)' }}>{relabel(r.title)}</span>
                          <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.45 }}>
                            {relabel(r.description || '')}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      )}

      {register && (
        <>
          {exportLocked && (
            <PlanUpgradeNotice
              compact
              feature="Report export"
              description="Excel, CSV and PDF export is not included in your organization's current plan. On-screen previews remain available."
            />
          )}
          {/* Filters & actions */}
          <Card
            title={relabel(register.title)}
            subtitle={register.dateFilter ? `Date range applies to: ${register.dateFilter}` : 'This register has no date filter'}
            actions={
              exportLocked ? (
                <Badge variant="purple" icon={<Lock size={12} />}>
                  Export not in your plan
                </Badge>
              ) : (
              <div role="group" aria-label="Export" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Export</span>
                {EXPORTS.map((e) => (
                  <Button
                    key={e.format}
                    variant="secondary"
                    size="sm"
                    icon={e.icon}
                    loading={exporting === e.format}
                    disabled={exporting !== null && exporting !== e.format}
                    onClick={() => exportFile(e.format)}
                    title={`Export as ${e.label}${e.format === 'pdf' ? ' (up to 5,000 rows)' : ' (up to 50,000 rows)'}`}
                  >
                    {e.label}
                  </Button>
                ))}
              </div>
              )
            }
          >
            <div role="search" aria-label="Report filters" className="grid-auto" style={{ '--min': '180px', gap: '16px', alignItems: 'end' } as React.CSSProperties}>
              {has('from') && (
                <div>
                  <label className="form-label" style={labelStyle} htmlFor="report-from">
                    From
                  </label>
                  <input
                    id="report-from"
                    type="date"
                    className="form-input"
                    value={filters.from || ''}
                    max={filters.to || undefined}
                    onChange={(e) => setFilter('from', e.target.value)}
                    style={controlStyle}
                  />
                </div>
              )}
              {has('to') && (
                <div>
                  <label className="form-label" style={labelStyle} htmlFor="report-to">
                    To
                  </label>
                  <input
                    id="report-to"
                    type="date"
                    className="form-input"
                    value={filters.to || ''}
                    min={filters.from || undefined}
                    onChange={(e) => setFilter('to', e.target.value)}
                    style={controlStyle}
                  />
                </div>
              )}
              {has('orgNodeId') && (
                <div>
                  <label className="form-label" style={labelStyle} htmlFor="report-org">
                    Organization unit
                  </label>
                  <select id="report-org" className="form-select" value={filters.orgNodeId || ''} onChange={(e) => setFilter('orgNodeId', e.target.value)} style={controlStyle}>
                    <option value="">All units</option>
                    {orgOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {has('locationId') && (
                <div>
                  <label className="form-label" style={labelStyle} htmlFor="report-location">
                    {relabel('Location')}
                  </label>
                  <select
                    id="report-location"
                    className="form-select"
                    value={filters.locationId || ''}
                    onChange={(e) => setFilter('locationId', e.target.value)}
                    style={controlStyle}
                  >
                    <option value="">{relabel('All Locations')}</option>
                    {sortedLocations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                        {l.areaCode ? ` (${l.areaCode})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {has('status') &&
                renderFreeOrSelect(
                  'report-status',
                  register.key === 'certification' ? 'Certification' : 'Status',
                  'status',
                  statusOptions,
                  register.key === 'certification' ? 'All levels' : register.key === 'action-ageing' ? 'All open statuses' : 'All statuses',
                )}
              {has('severity') && renderFreeOrSelect('report-severity', 'Severity', 'severity', SEVERITY_OPTIONS, 'All severities')}
              {has('category') &&
                renderFreeOrSelect('report-category', register.key === 'observations' ? 'Pillar' : 'Category', 'category', categoryOptions, 'All categories')}
              {has('assigneeId') && (
                <div>
                  <label className="form-label" style={labelStyle} htmlFor="report-assignee">
                    Assignee
                  </label>
                  <select
                    id="report-assignee"
                    className="form-select"
                    value={filters.assigneeId || ''}
                    onChange={(e) => setFilter('assigneeId', e.target.value)}
                    style={controlStyle}
                  >
                    <option value="">Anyone</option>
                    {sortedUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {has('auditorId') && (
                <div>
                  <label className="form-label" style={labelStyle} htmlFor="report-auditor">
                    Auditor
                  </label>
                  <select
                    id="report-auditor"
                    className="form-select"
                    value={filters.auditorId || ''}
                    onChange={(e) => setFilter('auditorId', e.target.value)}
                    style={controlStyle}
                  >
                    <option value="">Any auditor</option>
                    {sortedUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {has('source') && (
                <div>
                  <label className="form-label" style={labelStyle} htmlFor="report-source">
                    Source
                  </label>
                  <select id="report-source" className="form-select" value={filters.source || ''} onChange={(e) => setFilter('source', e.target.value)} style={controlStyle}>
                    <option value="">All sources</option>
                    {SOURCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {has('actionType') && (
                <div>
                  <label className="form-label" style={labelStyle} htmlFor="report-action-type">
                    Action type
                  </label>
                  <select
                    id="report-action-type"
                    className="form-select"
                    value={filters.actionType || ''}
                    onChange={(e) => setFilter('actionType', e.target.value)}
                    style={controlStyle}
                  >
                    <option value="">All types</option>
                    {ACTION_TYPE_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {humanize(o)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {has('repeatOnly') && (
                <label
                  htmlFor="report-repeat"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '40px', fontSize: '14px', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  <input id="report-repeat" type="checkbox" checked={filters.repeatOnly === true} onChange={(e) => setFilter('repeatOnly', e.target.checked)} />
                  Repeat observations only
                </label>
              )}
              {has('overdueOnly') && (
                <label
                  htmlFor="report-overdue"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '40px', fontSize: '14px', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  <input id="report-overdue" type="checkbox" checked={filters.overdueOnly === true} onChange={(e) => setFilter('overdueOnly', e.target.checked)} />
                  Overdue only
                </label>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="primary" icon={<Play size={16} />} onClick={run} loading={running}>
                  Run
                </Button>
                <Button variant="ghost" icon={<X size={16} />} onClick={clearFilters} disabled={!hasActiveFilters}>
                  Clear
                </Button>
              </div>
            </div>
          </Card>

          {/* Preview */}
          {runError ? (
            <Card>
              <ErrorState message={runError} onRetry={run} />
            </Card>
          ) : !preview ? (
            <Card>
              <EmptyState
                title="No preview yet"
                description="Set the filters and press Run to preview the register, or export it directly."
                icon={<FileBarChart size={28} />}
              />
            </Card>
          ) : (
            <Card
              title="Preview"
              subtitle={
                <>
                  Showing <strong style={{ color: 'var(--text-primary)' }}>{formatNumber(preview.rows.length)}</strong> of{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{formatNumber(Number(preview.total) || 0)}</strong> rows
                </>
              }
              noPadding
            >
              {preview.summary && preview.summary.length > 0 && (
                <div role="list" aria-label="Summary" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
                  {preview.summary.map((item) => (
                    <span key={item.key} role="listitem" className="pill" style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      {item.label}:{' '}
                      <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>
                        {formatNumber(item.value)}
                      </strong>
                    </span>
                  ))}
                </div>
              )}
              {preview.truncated && (
                <div
                  role="status"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    fontSize: '13px',
                    color: 'var(--color-warning)',
                    background: 'var(--color-warning-bg)',
                    borderBottom: '1px solid var(--color-warning-border)',
                  }}
                >
                  <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
                  Preview is limited to the first {formatNumber(preview.rows.length)} rows{exportLocked ? '.' : ' — export to get every matching row.'}
                </div>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table className="enterprise-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th key={c.key} className={isNumeric(c) ? 'num' : undefined} style={{ whiteSpace: 'nowrap', textAlign: isNumeric(c) ? 'right' : 'left' }}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.length === 0 ? (
                      <tr>
                        <td colSpan={Math.max(1, columns.length)} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                          No rows match these filters.
                        </td>
                      </tr>
                    ) : (
                      preview.rows.map((row, i) => (
                        <tr key={i}>
                          {columns.map((c) => (
                            <td
                              key={c.key}
                              className={isNumeric(c) ? 'num' : undefined}
                              style={{
                                fontSize: '13px',
                                textAlign: isNumeric(c) ? 'right' : 'left',
                                whiteSpace: c.type === 'text' && (c.width || 1) >= 2 ? 'normal' : 'nowrap',
                                minWidth: c.type === 'text' && (c.width || 1) >= 2 ? '220px' : undefined,
                              }}
                            >
                              {formatCell(row ? row[c.key] : null, c, cellFormatters)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

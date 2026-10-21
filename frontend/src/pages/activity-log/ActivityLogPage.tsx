import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, getApiErrorMessage } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useI18n } from '../../i18n';
import { humanize } from '../../constants/labels';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar } from '../../components/ui/FormField';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/StateViews';
import {
  ActivityChainVerification,
  ActivityLogEntry,
  ActivityLogFilters,
  ActivityLogPage as ActivityLogPageData,
  ActivityLogQuery,
  ActivityOutcome,
} from '../../types';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  RefreshCw,
  X,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Inbox,
} from 'lucide-react';

const PAGE_SIZE = 50;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral';

/** LOGIN_FAILED -> "Login failed" */
const humaniseAction = (action: string): string => humanize(action) || action;

/** "CorrectiveAction" -> "Corrective action" */
const entityLabel = (type: string): string => humanize(type.replace(/([a-z0-9])([A-Z])/g, '$1_$2'));

/** Entries written before readable summaries existed carry "POST /api/v1/…" as their summary. */
const RAW_ROUTE_SUMMARY = /^(GET|POST|PUT|PATCH|DELETE) \/\S*/;

/** The readable summary; for older raw-route entries it is rebuilt from the action and entity. */
const readableSummary = (entry: ActivityLogEntry): string => {
  if (!entry.summary) return '—';
  if (!RAW_ROUTE_SUMMARY.test(entry.summary)) return entry.summary;
  const reason = entry.summary.split(' — ').slice(1).join(' — ');
  const text = `${humaniseAction(entry.action)}${entry.entityType ? ` (${entityLabel(entry.entityType).toLowerCase()})` : ''}`;
  return reason ? `${text} — ${reason}` : text;
};

/** The request line ("POST /api/v1/…") behind an entry, for the details row. */
const requestLine = (entry: ActivityLogEntry): string | null => {
  const route = (entry.changes as { route?: unknown } | null)?.route;
  if (typeof route === 'string' && route) return route;
  const legacy = RAW_ROUTE_SUMMARY.exec(entry.summary || '');
  return legacy ? legacy[0] : null;
};

/** Loopback addresses mean the request came from the server itself (or a local proxy). */
const displayIp = (ip: string | null): string => {
  if (!ip) return '—';
  return ['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(ip) ? 'local' : ip;
};

const actionBadgeVariant = (entry: ActivityLogEntry): BadgeVariant => {
  if (entry.outcome === 'FAILURE') return 'danger';
  const action = entry.action.toUpperCase();
  if (action.startsWith('LOGIN')) return 'info';
  if (action.startsWith('DELETE')) return 'warning';
  if (action.startsWith('CREATE')) return 'success';
  return 'neutral';
};

const shortId = (id: string): string => (id.length > 8 ? id.slice(0, 8) : id);

/** Renders a diff value: null -> "—", ISO dates -> local time, objects -> compact JSON, everything else as-is. */
const formatValue = (value: unknown, formatDateTime: (iso: string) => string): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') {
    if (value === '') return '""';
    return ISO_DATE_PATTERN.test(value) ? formatDateTime(value) || value : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const prettyJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

/** Date inputs give local calendar days; the API expects ISO instants covering the whole day. */
const toIsoStartOfDay = (day: string): string | undefined => {
  if (!day) return undefined;
  const date = new Date(`${day}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const toIsoEndOfDay = (day: string): string | undefined => {
  if (!day) return undefined;
  const date = new Date(`${day}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

/** Small field label in the entry details (sentence case). */
const labelStyle: React.CSSProperties = {
  fontSize: '12.5px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '4px',
  display: 'block',
};

const controlStyle: React.CSSProperties = { width: '100%' };

const codeBlockStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  background: 'var(--bg-surface-subtle)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: '10px 12px',
  margin: '8px 0 0',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: '320px',
  overflow: 'auto',
  color: 'var(--text-primary)',
};

const ActivityDetail: React.FC<{ entry: ActivityLogEntry }> = ({ entry }) => {
  const { formatDateTime } = useI18n();
  const changes = entry.changes;
  const request = requestLine(entry);
  const diffRows = changes?.diff ? Object.entries(changes.diff) : [];
  const hasRequest = changes !== null && changes.request !== undefined && changes.request !== null;

  const metaItems: { label: string; value: string }[] = [
    { label: 'Sequence', value: `#${entry.sequence}` },
    { label: 'Outcome', value: entry.statusCode !== null ? `${entry.outcome} (${entry.statusCode})` : entry.outcome },
  ];
  if (entry.entityId) metaItems.push({ label: 'Entity ID', value: entry.entityId });
  if (entry.actorId) metaItems.push({ label: 'Actor ID', value: entry.actorId });
  if (request) metaItems.push({ label: 'Request', value: request });
  if (changes?.method) metaItems.push({ label: 'Method', value: changes.method });
  if (entry.ipAddress) metaItems.push({ label: 'IP address', value: entry.ipAddress });
  if (changes?.identifier) metaItems.push({ label: 'Identifier', value: changes.identifier });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 4px 8px 32px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
        {metaItems.map((item) => (
          <div key={item.label} style={{ minWidth: 0 }}>
            <span style={labelStyle}>{item.label}</span>
            <span style={{ fontSize: '12.5px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {diffRows.length > 0 && (
        <div>
          <span style={labelStyle}>Field changes</span>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflowX: 'auto', background: 'var(--bg-surface)' }}>
            <table className="enterprise-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Field</th>
                  <th style={{ width: '39%' }}>Before</th>
                  <th style={{ width: '39%' }}>After</th>
                </tr>
              </thead>
              <tbody>
                {diffRows.map(([field, change]) => (
                  <tr key={field}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, fontSize: '12.5px' }}>{field}</td>
                    <td style={{ padding: '8px 12px', fontSize: '12.5px', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                      {formatValue(change?.from, formatDateTime)}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '12.5px', wordBreak: 'break-word' }}>{formatValue(change?.to, formatDateTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasRequest && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Request payload (sanitized)
          </summary>
          <pre style={codeBlockStyle}>{prettyJson(changes?.request)}</pre>
        </details>
      )}

      {diffRows.length === 0 && !hasRequest && (
        <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>No field changes or request payload recorded for this entry.</span>
      )}

      <div>
        <span style={labelStyle}>User agent</span>
        <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{entry.userAgent || '—'}</span>
      </div>
    </div>
  );
};

export const ActivityLogPage: React.FC = () => {
  const { addToast } = useApp();
  const { formatDateTime, formatNumber } = useI18n();

  // Filters
  const [search, setSearch] = useState<string>('');
  const debouncedSearch = useDebouncedValue(search.trim(), 400);
  const [action, setAction] = useState<string>('');
  const [entityType, setEntityType] = useState<string>('');
  const [outcome, setOutcome] = useState<ActivityOutcome | ''>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const [filterOptions, setFilterOptions] = useState<ActivityLogFilters>({ actions: [], entityTypes: [] });

  // Data
  const [data, setData] = useState<ActivityLogPageData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Integrity verification
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verification, setVerification] = useState<ActivityChainVerification | null>(null);

  // Ignore responses from superseded requests (fast filter changes)
  const requestIdRef = useRef(0);

  const hasActiveFilters = Boolean(search || action || entityType || outcome || fromDate || toDate);

  useEffect(() => {
    api
      .getActivityLogFilters()
      .then((res) => {
        setFilterOptions({
          actions: Array.isArray(res?.actions) ? res.actions : [],
          entityTypes: Array.isArray(res?.entityTypes) ? res.entityTypes : [],
        });
      })
      .catch((err) => {
        addToast({ type: 'error', title: 'Filters unavailable', message: getApiErrorMessage(err, 'Could not load filter options.') });
      });
  }, [addToast]);

  // Any filter change returns to the first page
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, action, entityType, outcome, fromDate, toDate]);

  const loadLogs = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const params: ActivityLogQuery = { page, pageSize: PAGE_SIZE };
    if (debouncedSearch) params.q = debouncedSearch;
    if (action) params.action = action;
    if (entityType) params.entityType = entityType;
    if (outcome) params.outcome = outcome;
    const from = toIsoStartOfDay(fromDate);
    const to = toIsoEndOfDay(toDate);
    if (from) params.from = from;
    if (to) params.to = to;

    setLoading(true);
    setError(null);
    try {
      const res = await api.getActivityLogs(params);
      if (requestId !== requestIdRef.current) return;
      setData({
        items: Array.isArray(res?.items) ? res.items : [],
        total: typeof res?.total === 'number' ? res.total : 0,
        page: typeof res?.page === 'number' ? res.page : page,
        pageSize: typeof res?.pageSize === 'number' ? res.pageSize : PAGE_SIZE,
      });
      setExpanded(new Set());
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const message = getApiErrorMessage(err, 'Could not load the activity log.');
      setError(message);
      addToast({ type: 'error', title: 'Activity log', message });
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [page, debouncedSearch, action, entityType, outcome, fromDate, toDate, addToast]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await api.verifyActivityLog();
      setVerification(res);
    } catch (err) {
      setVerification(null);
      addToast({ type: 'error', title: 'Verification failed', message: getApiErrorMessage(err, 'Could not verify the activity log.') });
    } finally {
      setVerifying(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setAction('');
    setEntityType('');
    setOutcome('');
    setFromDate('');
    setToDate('');
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, (page - 1) * pageSize + items.length);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Activity log"
        description="Tamper-evident record of sign-ins, configuration and data changes."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => loadLogs()} disabled={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon={<ShieldCheck size={16} />} onClick={handleVerify} loading={verifying}>
              Verify integrity
            </Button>
          </>
        }
      />

      {/* Verification result */}
      {verification && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '16px 20px',
            borderRadius: 'var(--radius-lg)',
            border: `1px solid ${verification.valid ? 'var(--color-success-border)' : 'var(--color-danger-border)'}`,
            background: verification.valid ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
            color: verification.valid ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          {verification.valid ? <ShieldCheck size={20} aria-hidden="true" style={{ flexShrink: 0 }} /> : <ShieldAlert size={20} aria-hidden="true" style={{ flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>
              {verification.valid
                ? `Chain intact — ${formatNumber(verification.entriesChecked)} ${verification.entriesChecked === 1 ? 'entry' : 'entries'} verified`
                : 'Integrity check failed — the activity log may have been tampered with'}
            </div>
            {!verification.valid && (
              <div style={{ fontSize: '13px', marginTop: '4px' }}>
                {verification.problem || 'The hash chain does not match.'}
                {verification.brokenAtSequence !== null && ` (broken at sequence #${verification.brokenAtSequence})`}
                {` · ${formatNumber(verification.entriesChecked)} ${verification.entriesChecked === 1 ? 'entry' : 'entries'} checked`}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss verification result"
            onClick={() => setVerification(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Filters */}
      <FilterBar label="Activity filters">
        <div className="form-group" style={{ flex: '2 1 260px' }}>
          <label className="form-label" htmlFor="activity-search">
            Search
          </label>
          <div className="search-input">
            <Search size={16} aria-hidden="true" />
            <input
              id="activity-search"
              type="search"
              className="form-input"
              placeholder="Summary, actor email or entity ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={controlStyle}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="activity-action">Action</label>
          <select id="activity-action" className="form-select" value={action} onChange={(e) => setAction(e.target.value)} style={controlStyle}>
            <option value="">All actions</option>
            {filterOptions.actions.map((a) => (
              <option key={a} value={a}>
                {humaniseAction(a)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="activity-entity">Entity type</label>
          <select id="activity-entity" className="form-select" value={entityType} onChange={(e) => setEntityType(e.target.value)} style={controlStyle}>
            <option value="">All entities</option>
            {filterOptions.entityTypes.map((t) => (
              <option key={t} value={t}>
                {entityLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="activity-outcome">Outcome</label>
          <select
            id="activity-outcome"
            className="form-select"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as ActivityOutcome | '')}
            style={controlStyle}
          >
            <option value="">All outcomes</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILURE">Failure</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="activity-from">From</label>
          <input
            id="activity-from"
            type="date"
            className="form-input"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
            style={controlStyle}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="activity-to">To</label>
          <input
            id="activity-to"
            type="date"
            className="form-input"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
            style={controlStyle}
          />
        </div>
        <div style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
          <Button variant="ghost" icon={<X size={16} />} onClick={clearFilters} disabled={!hasActiveFilters}>
            Clear filters
          </Button>
        </div>
      </FilterBar>

      {/* Results */}
      {error && !loading ? (
        <Card>
          <ErrorState message={`Could not load the activity log. ${error}`} onRetry={() => loadLogs()} />
        </Card>
      ) : (
        <Card noPadding>
          <div style={{ overflowX: 'auto' }}>
          <table className="enterprise-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: '36px' }} aria-label="Expand" />
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Summary</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <LoadingState label="Loading activity…" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<Inbox size={28} />}
                      title="No activity matches these filters"
                      action={
                        hasActiveFilters ? (
                          <Button variant="secondary" size="sm" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                items.map((entry) => {
                  const isOpen = expanded.has(entry.id);
                  const actor = entry.actorEmail ? entry.actorEmail : entry.actorId ? 'Unknown' : 'System';
                  return (
                    <React.Fragment key={entry.id}>
                      <tr style={{ opacity: loading ? 0.6 : 1, background: isOpen ? 'var(--bg-surface-subtle)' : undefined }}>
                        <td style={{ padding: '6px 4px 6px 12px' }}>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? 'Hide details' : 'Show details'}
                            onClick={() => toggleExpanded(entry.id)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0, width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}
                          >
                            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '13px' }}>{formatDateTime(entry.createdAt) || entry.createdAt}</td>
                        <td
                          title={actor}
                          style={{
                            fontSize: '12.5px',
                            color: entry.actorEmail ? 'var(--text-primary)' : 'var(--text-secondary)',
                            maxWidth: '220px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {actor}
                        </td>
                        <td>
                          <Badge variant={actionBadgeVariant(entry)} style={{ whiteSpace: 'nowrap' }}>
                            {humaniseAction(entry.action)}
                          </Badge>
                        </td>
                        <td style={{ fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                          {entry.entityType || entry.entityId ? (
                            <>
                              <span>{entry.entityType ? entityLabel(entry.entityType) : 'Record'}</span>
                              {entry.entityId && (
                                <span title={entry.entityId} className="code-tag" style={{ marginLeft: '6px' }}>
                                  {shortId(entry.entityId)}
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                          )}
                        </td>
                        <td style={{ fontSize: '12.5px', maxWidth: '360px', overflowWrap: 'anywhere' }}>{readableSummary(entry)}</td>
                        <td
                          title={entry.ipAddress || undefined}
                          style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                        >
                          {displayIp(entry.ipAddress)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr style={{ background: 'var(--bg-surface-subtle)' }}>
                          <td colSpan={7} style={{ padding: '8px 16px 16px' }}>
                            <ActivityDetail entry={entry} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
                padding: '12px 16px',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Showing {formatNumber(rangeStart)}–{formatNumber(rangeEnd)} of {formatNumber(total)}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ChevronLeft size={16} />}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={loading || page <= 1}
                >
                  Previous
                </Button>
                <span aria-live="polite" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={loading || page >= totalPages}
                >
                  Next <ChevronRight size={16} aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

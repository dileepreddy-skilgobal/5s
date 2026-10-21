import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AuditExecution } from '../../types';
import { auditsApi } from '../../services/api-audits';
import { getApiErrorMessage } from '../../services/api';
import { auditStatusLabel, auditStatusVariant } from '../../constants/labels';
import { useI18n } from '../../i18n';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { FilterBar, SearchInput } from '../../components/ui/FormField';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { AuditReportModal } from '../../components/common/AuditReportModal';
import { FileText, Scale } from 'lucide-react';
import { auditTypeLabel } from '../templates/templateShared';

/** Result filters; DISPUTED lists audits waiting for a ruling. */
export const RESULT_FILTERS = [
  { id: 'ALL', label: 'All results' },
  { id: 'SUBMITTED', label: 'Awaiting sign-off' },
  { id: 'DISPUTED', label: 'Disputed' },
  { id: 'ACKNOWLEDGED', label: 'Acknowledged' },
] as const;
export type ResultFilter = (typeof RESULT_FILTERS)[number]['id'];
export const isResultFilter = (value: string | null): value is ResultFilter => RESULT_FILTERS.some((f) => f.id === value);

/** Audits with a result: everything except drafts still being filled in. */
const RESULT_STATUSES = ['SUBMITTED', 'DISPUTED', 'ACKNOWLEDGED', 'VERIFIED', 'REJECTED'];

interface AuditResultsPanelProps {
  filter: ResultFilter;
  onFilterChange: (filter: ResultFilter) => void;
  /** Report to open on arrival (from a notification link). */
  initialAuditId?: string | null;
  onInitialAuditOpened?: () => void;
}

/**
 * Submitted audits with their sign-off state. Dispute resolvers (coordinator, plant head) open disputed
 * audits here and rule on them in the report.
 */
export const AuditResultsPanel: React.FC<AuditResultsPanelProps> = ({ filter, onFilterChange, initialAuditId, onInitialAuditOpened }) => {
  const { formatDate, formatNumber } = useI18n();
  const [audits, setAudits] = useState<AuditExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [reportId, setReportId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditsApi.getExecutions(filter === 'ALL' ? undefined : { status: filter });
      setAudits(data.filter((a) => RESULT_STATUSES.includes(a.status)));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Audit results could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (initialAuditId) {
      setReportId(initialAuditId);
      onInitialAuditOpened?.();
    }
  }, [initialAuditId, onInitialAuditOpened]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return audits;
    return audits.filter((a) => [a.auditCode, a.location?.name, a.location?.areaCode, a.auditorName].join(' ').toLowerCase().includes(q));
  }, [audits, search]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div role="group" aria-label="Filter audit results" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {RESULT_FILTERS.map((f) => (
          <button key={f.id} type="button" className={`pillar-tab-pill${filter === f.id ? ' active' : ''}`} aria-pressed={filter === f.id} onClick={() => onFilterChange(f.id)}>
            {f.id === 'DISPUTED' && <Scale size={14} aria-hidden="true" />}
            {f.label}
          </button>
        ))}
      </div>

      <FilterBar label="Search audit results">
        <SearchInput
          label="Search by audit code, location or auditor"
          placeholder="Search audits, locations, auditors"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span role="status" style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{shown.length}</strong> {shown.length === 1 ? 'audit' : 'audits'}
        </span>
      </FilterBar>

      {loading ? (
        <Card>
          <LoadingState label="Loading audit results…" />
        </Card>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText size={28} />}
            title={filter === 'DISPUTED' ? 'No disputed audits' : 'No audit results match'}
            description={filter === 'DISPUTED' ? 'Audits that an area owner disputes appear here for a ruling.' : undefined}
          />
        </Card>
      ) : (
        <Card noPadding>
          <div className="enterprise-table-container">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Audit</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Completed</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Report</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="code-tag">{a.auditCode}</span>
                      {a.auditorName && <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>{a.auditorName}</div>}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.location?.name ?? '—'}</div>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{a.location?.areaCode ?? ''}</div>
                    </td>
                    <td>{auditTypeLabel(a.auditType)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(a.completedAt || a.startedAt)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Badge variant={a.isPassed ? 'success' : 'warning'}>
                        {formatNumber(a.overallScore)}% · {a.isPassed ? 'Passed' : 'Below pass score'}
                      </Badge>
                    </td>
                    <td>
                      <Badge variant={auditStatusVariant(a.status)}>{auditStatusLabel(a.status)}</Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button size="sm" variant={a.status === 'DISPUTED' ? 'primary' : 'secondary'} icon={a.status === 'DISPUTED' ? <Scale size={14} /> : <FileText size={14} />} onClick={() => setReportId(a.id)}>
                        {a.status === 'DISPUTED' ? 'Review dispute' : 'View report'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AuditReportModal isOpen={!!reportId} executionId={reportId} onClose={() => setReportId(null)} onAcknowledged={load} />
    </div>
  );
};

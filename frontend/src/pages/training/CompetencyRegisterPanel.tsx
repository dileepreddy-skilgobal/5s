import React, { useState } from 'react';
import { Ban, RotateCcw } from 'lucide-react';
import { SearchInput } from '../../components/ui/FormField';
import { TrainingCertificate, TrainingCertificateStatus } from '../../types';
import { useI18n } from '../../i18n';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ErrorState, LoadingState } from '../../components/ui/StateViews';
import { certStatusBadge } from './certificateStatus';

interface CompetencyRegisterPanelProps {
  certificates: TrainingCertificate[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onView: (c: TrainingCertificate) => void;
  /** Only org admins may revoke (backend: ORG_ADMINS). */
  onRevoke?: (c: TrainingCertificate) => void;
}

/** Every certificate in the organization (program managers). */
export const CompetencyRegisterPanel: React.FC<CompetencyRegisterPanelProps> = ({ certificates, loading, error, onReload, onView, onRevoke }) => {
  const { formatDate } = useI18n();
  const date = (iso?: string | null) => formatDate(iso) || '—';
  const [status, setStatus] = useState<'ALL' | TrainingCertificateStatus>('ALL');
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const filtered = certificates.filter((c) => {
    if (status !== 'ALL' && c.status !== status) return false;
    if (!q) return true;
    return (
      (c.traineeName || '').toLowerCase().includes(q) ||
      (c.traineeEmail || '').toLowerCase().includes(q) ||
      (c.certificateId || '').toLowerCase().includes(q)
    );
  });

  let body: React.ReactNode;
  if (loading && certificates.length === 0) body = <LoadingState label="Loading register…" />;
  else if (error) body = <ErrorState message={error} onRetry={onReload} />;
  else
    body = (
      <div className="enterprise-table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
        <table className="enterprise-table">
          <thead>
            <tr>
              <th>Trainee</th>
              <th>Certificate</th>
              <th>Status</th>
              <th>Score</th>
              <th>Issued</th>
              <th>Valid until</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-secondary)' }}>
                  {certificates.length === 0 ? 'No certificates have been issued yet.' : 'No certificates match the filters.'}
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const badge = certStatusBadge(c.status);
                return (
                  <tr key={c.certificateId}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.traineeName}</div>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{c.traineeEmail}</div>
                    </td>
                    <td>
                      <span className="code-tag">{c.certificateId}</span>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>{c.credentialTitle}</div>
                    </td>
                    <td>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                    <td className="num">{c.scorePercent}%</td>
                    <td>{date(c.issueDate)}</td>
                    <td>{date(c.validUntil)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <Button variant="secondary" size="sm" onClick={() => onView(c)}>
                          View
                        </Button>
                        {onRevoke && c.status !== 'REVOKED' && (
                          <Button variant="danger" size="sm" icon={<Ban size={14} />} onClick={() => onRevoke(c)}>
                            Revoke
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );

  return (
    <Card
      noPadding
      title="Auditor competency register"
      subtitle="Every training certificate issued in your organization. Revoking a certificate removes audit eligibility when certified auditors are required."
      actions={
        <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={onReload} loading={loading}>
          Refresh
        </Button>
      }
    >
      <div role="search" aria-label="Filter certificates" style={{ padding: '16px 20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
        <SearchInput
          label="Search certificates"
          placeholder="Search by name, email or certificate ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '2 1 240px', minWidth: 0 }}
        />
        <select
          className="form-select"
          aria-label="Filter by status"
          style={{ flex: '1 1 180px', minWidth: 0 }}
          value={status}
          onChange={(e) => setStatus(e.target.value as 'ALL' | TrainingCertificateStatus)}
        >
          <option value="ALL">All statuses</option>
          <option value="VALID">Valid</option>
          <option value="EXPIRED">Expired</option>
          <option value="REVOKED">Revoked</option>
        </select>
      </div>
      {body}
    </Card>
  );
};

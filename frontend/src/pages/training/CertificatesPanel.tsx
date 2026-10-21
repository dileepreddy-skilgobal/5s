import React from 'react';
import { AlertTriangle, Award, HelpCircle, Printer, RotateCcw, Share2, ShieldCheck } from 'lucide-react';
import { Tenant, TrainingCertificate } from '../../types';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { certStatusBadge } from './certificateStatus';
import { CertificateSheet } from './CertificateSheet';

interface CertificatesPanelProps {
  certificates: TrainingCertificate[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  /** The certificate rendered below the list (may come from a verification link or the register). */
  shown: TrainingCertificate | null;
  onShow: (c: TrainingCertificate) => void;
  onTakeAssessment: () => void;
  passPercent: number | null;
  tenant: Tenant | null;
}

export const printCertificate = () => {
  document.body.classList.add('print-certificate-only');
  window.print();
  setTimeout(() => document.body.classList.remove('print-certificate-only'), 1000);
};

export const CertificatesPanel: React.FC<CertificatesPanelProps> = ({
  certificates,
  loading,
  error,
  onReload,
  shown,
  onShow,
  onTakeAssessment,
  passPercent,
  tenant,
}) => {
  const { addToast } = useApp();
  const { formatDate } = useI18n();
  const date = (iso?: string | null) => formatDate(iso) || '—';

  const copyLink = (c: TrainingCertificate) => {
    const url = c.verificationUrl || window.location.href;
    if (!navigator.clipboard) {
      addToast({ type: 'info', title: 'Verification link', message: url });
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => addToast({ type: 'success', title: 'Link copied', message: 'Verification link copied to the clipboard.' }))
      .catch(() => addToast({ type: 'info', title: 'Verification link', message: url }));
  };

  let list: React.ReactNode;
  if (loading && certificates.length === 0) list = <LoadingState label="Loading certificates…" />;
  else if (error) list = <ErrorState message={error} onRetry={onReload} />;
  else if (certificates.length === 0)
    list = (
      <EmptyState
        icon={<Award size={28} />}
        title="No certificates yet"
        description="Pass the competency assessment to earn one."
        action={
          <Button variant="primary" size="sm" icon={<HelpCircle size={14} />} onClick={onTakeAssessment}>
            Take the assessment
          </Button>
        }
      />
    );
  else
    list = (
      <div className="enterprise-table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
        <table className="enterprise-table">
          <thead>
            <tr>
              <th>Certificate</th>
              <th>Status</th>
              <th>Score</th>
              <th>Issued</th>
              <th>Valid until</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {certificates.map((c) => {
              const badge = certStatusBadge(c.status);
              const isOpen = shown?.certificateId === c.certificateId;
              return (
                <tr key={c.certificateId} style={isOpen ? { background: 'var(--bg-pale)' } : undefined}>
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
                      <Button variant={isOpen ? 'outline' : 'secondary'} size="sm" aria-pressed={isOpen} onClick={() => onShow(c)}>
                        {isOpen ? 'Shown' : 'Show'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Printer size={14} />}
                        onClick={() => {
                          onShow(c);
                          // Let the selected certificate render before printing
                          setTimeout(printCertificate, 50);
                        }}
                      >
                        Print
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center' }}>
      <Card
        noPadding
        className="no-print"
        style={{ width: '100%', maxWidth: '860px' }}
        title="My certificates"
        subtitle={`Issued when you pass the competency assessment${passPercent !== null ? ` (pass mark ${passPercent}%)` : ''}. Passing again renews your valid certificate.`}
        actions={
          <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={onReload} loading={loading}>
            Refresh
          </Button>
        }
      >
        {list}
      </Card>

      {shown && (
        <>
          <div
            className="no-print"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '860px', flexWrap: 'wrap', gap: '12px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              {shown.status === 'VALID' ? (
                <ShieldCheck size={18} color="var(--color-success)" aria-hidden="true" />
              ) : (
                <AlertTriangle size={18} color={shown.status === 'REVOKED' ? 'var(--color-danger)' : 'var(--color-warning)'} aria-hidden="true" />
              )}
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {shown.status === 'VALID'
                  ? 'This certificate is valid.'
                  : shown.status === 'REVOKED'
                    ? 'This certificate has been revoked and is no longer valid.'
                    : `This certificate expired on ${date(shown.validUntil)}.`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button variant="secondary" size="sm" icon={<Share2 size={14} />} onClick={() => copyLink(shown)}>
                Copy verification link
              </Button>
              <Button variant="primary" size="sm" icon={<Printer size={14} />} onClick={printCertificate}>
                Print / save PDF
              </Button>
            </div>
          </div>
          <CertificateSheet certificate={shown} tenant={tenant} />
        </>
      )}
    </div>
  );
};

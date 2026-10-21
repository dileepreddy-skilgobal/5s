import React from 'react';
import { Award } from 'lucide-react';
import { Tenant, TrainingCertificate } from '../../types';
import { useI18n } from '../../i18n';
import { certStatusBadge, validityLabel } from './certificateStatus';

/**
 * The printable certificate. It stays white with dark text in both themes because it is a paper document.
 * The issuing organization is the tenant; nothing is shown when its name is unknown.
 */
export const CertificateSheet: React.FC<{ certificate: TrainingCertificate; tenant: Tenant | null }> = ({ certificate, tenant }) => {
  const { formatDate } = useI18n();
  const date = (iso?: string | null) => formatDate(iso) || '—';
  const validity = validityLabel(certificate.issueDate, certificate.validUntil);
  const signatures = certificate.authorizedSignatures?.length ? certificate.authorizedSignatures : [null, null];

  return (
    <div
      id="printable-5s-certificate"
      style={{
        width: '100%',
        maxWidth: '860px',
        background: '#FFFFFF',
        color: '#1D2733',
        borderRadius: '12px',
        border: '8px double #D97706',
        padding: 'clamp(20px, 6vw, 48px) clamp(16px, 7vw, 56px)',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
        boxSizing: 'border-box',
      }}
    >
      {certificate.status !== 'VALID' && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-18deg)',
            fontSize: 'clamp(36px, 10vw, 72px)',
            fontWeight: 900,
            letterSpacing: '8px',
            color: certificate.status === 'REVOKED' ? 'rgba(220, 38, 38, 0.16)' : 'rgba(100, 116, 139, 0.18)',
            border: `6px solid ${certificate.status === 'REVOKED' ? 'rgba(220, 38, 38, 0.16)' : 'rgba(100, 116, 139, 0.18)'}`,
            padding: '4px 24px',
            pointerEvents: 'none',
            zIndex: 3,
          }}
        >
          {certStatusBadge(certificate.status).label}
        </div>
      )}

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
        {tenant?.logoUrl ? (
          <img src={tenant.logoUrl} alt={tenant.name} style={{ height: '48px', maxWidth: '100%', objectFit: 'contain', margin: '0 auto 10px auto', display: 'block' }} />
        ) : tenant?.name ? (
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#004C8F', marginBottom: '8px' }}>{tenant.name}</div>
        ) : null}

        <h2 style={{ fontSize: 'clamp(20px, 5vw, 28px)', fontWeight: 700, color: '#1D2733', margin: '12px 0 4px 0' }}>Certificate of 5S competency</h2>

        <div style={{ fontSize: '13px', color: '#5B6878', fontStyle: 'italic' }}>This certifies that</div>

        <div
          style={{
            fontSize: 'clamp(20px, 5vw, 26px)',
            fontWeight: 700,
            color: '#004C8F',
            margin: '16px auto',
            padding: '8px 0',
            borderBottom: '2px solid #E2E8F0',
            display: 'inline-block',
            minWidth: 'min(380px, 100%)',
            overflowWrap: 'anywhere',
          }}
        >
          {certificate.traineeName}
        </div>

        <div style={{ fontSize: '13px', color: '#334155', maxWidth: '580px', margin: '0 auto', lineHeight: 1.6 }}>
          has passed the 5S competency assessment covering Sort, Set in Order, Shine, Standardize and Sustain, auditing, and root cause
          analysis{certificate.credentialTitle ? ', and is recognised as' : '.'}
        </div>
        {certificate.credentialTitle && (
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1D2733', marginTop: '8px' }}>{certificate.credentialTitle}</div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginTop: '40px',
          paddingTop: '24px',
          borderTop: '1px solid #E2E8F0',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <dl style={{ margin: 0, textAlign: 'left', fontSize: '11px', color: '#64748B', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '6px', rowGap: '3px' }} className="keep-cols">
          <dt style={{ fontWeight: 700 }}>Certificate ID:</dt>
          <dd style={{ margin: 0 }}>{certificate.certificateId}</dd>
          <dt style={{ fontWeight: 700 }}>Date awarded:</dt>
          <dd style={{ margin: 0 }}>{date(certificate.issueDate)}</dd>
          <dt style={{ fontWeight: 700 }}>Valid until:</dt>
          <dd style={{ margin: 0 }}>
            {date(certificate.validUntil)}
            {validity ? ` (${validity})` : ''}
          </dd>
          <dt style={{ fontWeight: 700 }}>Assessment score:</dt>
          <dd style={{ margin: 0 }}>{certificate.scorePercent}%</dd>
          <dt style={{ fontWeight: 700 }}>Status:</dt>
          <dd style={{ margin: 0 }}>{certStatusBadge(certificate.status).label}</dd>
        </dl>

        <div
          aria-hidden="true"
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: '#D97706',
            border: '3px solid #FDE7C2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            flexShrink: 0,
          }}
        >
          <Award size={28} />
        </div>

        {/* Signatories come from organization settings; with none configured, blank lines are left for wet signatures */}
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 'min(200px, 100%)' }}>
          {signatures.map((sig, idx) => (
            <div key={idx}>
              <div style={{ height: '22px', borderBottom: '1px solid #94A3B8', marginBottom: '4px' }} />
              <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#334155', minHeight: '13px' }}>{sig?.name || ''}</div>
              <div style={{ fontSize: '9.5px', color: '#64748B' }}>{sig?.title || 'Authorized signatory'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';

/** Where "Contact sales" links point (there is no payment gateway). */
export const SALES_EMAIL: string = (import.meta.env.VITE_SALES_EMAIL as string | undefined) || 'sales@skilglobal.com';

export const salesMailto = (subject: string, body = '') =>
  `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;

interface PlanUpgradeNoticeProps {
  /** What is locked, e.g. "Management KPIs". */
  feature: string;
  description?: string;
  compact?: boolean;
}

/**
 * Empty state shown in place of a premium feature when the API answers 403 PLAN_FEATURE_REQUIRED.
 * Organization administrators get a link to their subscription page; everyone else is told to ask them.
 */
export const PlanUpgradeNotice: React.FC<PlanUpgradeNoticeProps> = ({ feature, description, compact = false }) => {
  const { can, currentUser } = useApp();
  const { t } = useI18n();
  const isOrgAdmin = can('ORG_ADMINS') && !currentUser?.isSuperAdmin;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '12px',
        padding: compact ? '20px 16px' : '48px 24px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <div
        style={{
          width: '44px',
          height: '44px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--bg-pale)',
          border: '1px solid var(--color-info-border)',
          color: 'var(--color-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Lock size={20} aria-hidden="true" />
      </div>
      <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{t('plan.lockedTitle')}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '460px', lineHeight: 1.5 }}>
        {description || t('plan.notIncluded', { feature })} {isOrgAdmin ? t('plan.adminHint') : t('plan.memberHint')}
      </div>
      {isOrgAdmin && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' }}>
          <Link to="/subscription" className="btn btn-secondary">
            {t('plan.viewSubscription')}
          </Link>
          <a href={salesMailto(`Upgrade enquiry: ${feature}`)} className="btn btn-primary">
            {t('plan.contactSales')}
          </a>
        </div>
      )}
    </div>
  );
};

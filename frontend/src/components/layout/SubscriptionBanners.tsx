import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Lock, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';

const TRIAL_WARNING_DAYS = 7;

const bannerStyle = (tone: 'warning' | 'danger'): React.CSSProperties => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '10px',
  padding: '10px clamp(16px, 3vw, 32px)',
  fontSize: '13px',
  lineHeight: 1.45,
  background: tone === 'danger' ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
  color: 'var(--text-primary)',
  borderBottom: `1px solid ${tone === 'danger' ? 'var(--color-danger-border)' : 'var(--color-warning-border)'}`,
});

/**
 * Organization-wide subscription notices under the top bar:
 * - read-only mode (trial ended / subscription lapsed) for everyone, persistent;
 * - trial ending within 7 days for organization administrators, dismissible.
 */
export const SubscriptionBanners: React.FC = () => {
  const { readOnlyReason, subscription, can, currentUser } = useApp();
  const { t } = useI18n();
  const [trialDismissed, setTrialDismissed] = useState(false);
  const isOrgAdmin = can('ORG_ADMINS') && !currentUser?.isSuperAdmin;

  if (currentUser?.isSuperAdmin) return null;

  if (readOnlyReason) {
    return (
      <div role="alert" className="no-print" style={bannerStyle('danger')}>
        <Lock size={16} color="var(--color-danger)" style={{ flexShrink: 0 }} aria-hidden="true" />
        <span style={{ flex: '1 1 240px', minWidth: 0 }}>
          <strong>{t('plan.readOnlyTitle')}</strong> {readOnlyReason === 'TRIAL_EXPIRED' ? t('plan.readOnlyTrial') : t('plan.readOnlyLapsed')}{' '}
          {isOrgAdmin ? t('plan.readOnlyAdmin') : t('plan.readOnlyMember')}
        </span>
        {isOrgAdmin && (
          <Link to="/subscription" className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>
            {t('plan.viewSubscription')}
          </Link>
        )}
      </div>
    );
  }

  const daysLeft = subscription?.trialDaysLeft;
  if (
    isOrgAdmin &&
    !trialDismissed &&
    subscription?.status === 'TRIAL' &&
    typeof daysLeft === 'number' &&
    daysLeft >= 0 &&
    daysLeft <= TRIAL_WARNING_DAYS
  ) {
    const ends = daysLeft <= 0 ? t('plan.trialEndsToday') : daysLeft === 1 ? t('plan.trialEndsTomorrow') : t('plan.trialEndsIn', { count: daysLeft });
    return (
      <div role="status" className="no-print" style={bannerStyle('warning')}>
        <Clock size={16} color="var(--color-warning)" style={{ flexShrink: 0 }} aria-hidden="true" />
        <span style={{ flex: '1 1 240px', minWidth: 0 }}>
          <strong>{ends}</strong> {t('plan.trialAfter')}
        </span>
        <Link to="/subscription" className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>
          {t('nav.planUsage')}
        </Link>
        <button
          type="button"
          aria-label={t('plan.dismiss')}
          onClick={() => setTrialDismissed(true)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px', display: 'flex' }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return null;
};

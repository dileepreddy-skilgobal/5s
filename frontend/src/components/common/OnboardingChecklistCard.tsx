import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Rocket, X, ArrowRight } from 'lucide-react';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { ProgressBar } from '../ui/ProgressBar';
import { Button } from '../ui/Button';
import { OnboardingChecklist, OnboardingStep } from '../../types';
import { useI18n } from '../../i18n';

/** Steps on administrator-only pages come without a link for other roles (adminOnly). */
type ChecklistStep = Omit<OnboardingStep, 'link' | 'actionLabel'> & { link: string | null; actionLabel: string | null; adminOnly?: boolean };

const DISMISS_KEY = '5s_onboarding_checklist_dismissed';
/** Roles whose landing page shows the go-live checklist (GET /onboarding/checklist is PROGRAM_MANAGERS). */
const CHECKLIST_ROLES = ['ORG_ADMIN', 'COORDINATOR_5S'];

const readDismissed = (scope: string): boolean => {
  try {
    return sessionStorage.getItem(`${DISMISS_KEY}:${scope}`) === '1';
  } catch {
    return false;
  }
};

const writeDismissed = (scope: string) => {
  try {
    sessionStorage.setItem(`${DISMISS_KEY}:${scope}`, '1');
  } catch {
    // Storage unavailable: the card is simply hidden until the page reloads
  }
};

/**
 * "Get started" card for organization administrators and 5S coordinators while setup is incomplete.
 * Dismissible for the browser session. Renders nothing for other roles, on errors, or once complete.
 */
export const OnboardingChecklistCard: React.FC<{ force?: boolean }> = ({ force = false }) => {
  const { activeUserRole, currentUser, currentTenant } = useApp();
  const { t } = useI18n();
  const scope = `${currentUser?.id ?? 'anon'}:${currentTenant?.id ?? ''}`;
  const eligible = !!currentUser && !currentUser.isSuperAdmin && (force || CHECKLIST_ROLES.includes(activeUserRole));
  const [data, setData] = useState<OnboardingChecklist | null>(null);
  const [dismissed, setDismissed] = useState(() => readDismissed(scope));

  useEffect(() => {
    setDismissed(readDismissed(scope));
  }, [scope]);

  useEffect(() => {
    if (!eligible || dismissed) return;
    let cancelled = false;
    api
      .getOnboardingChecklist()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [eligible, dismissed, scope]);

  if (!eligible || dismissed || !data || (data.percent ?? 0) >= 100) return null;

  const steps: ChecklistStep[] = Array.isArray(data.steps) ? data.steps : [];
  const nextStep = steps.find((s) => !s.done);

  return (
    <section
      aria-label={t('onboarding.checklistLabel')}
      className="card"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-pale)',
            border: '1px solid var(--color-info-border)',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Rocket size={18} aria-hidden="true" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflowWrap: 'anywhere' }}>
            {data.organization ? t('onboarding.titleWithOrg', { name: data.organization }) : t('onboarding.title')}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.5 }}>
            {t('onboarding.progress', { completed: data.completed, total: data.total })}
            {nextStep ? ` · ${t('onboarding.next', { step: nextStep.title })}` : ''}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('onboarding.hideLabel')}
          title={t('onboarding.hide')}
          icon={<X size={16} aria-hidden="true" />}
          onClick={() => {
            writeDismissed(scope);
            setDismissed(true);
          }}
        />
      </div>

      <ProgressBar value={data.percent ?? 0} showLabel color="primary" ariaLabel={t('onboarding.progressLabel')} />

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '8px' }}>
        {steps.map((step) => (
          <li
            key={step.key}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              flexWrap: 'wrap',
              background: step.done ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)',
            }}
          >
            {step.done ? (
              <CheckCircle2 size={18} color="var(--color-success)" style={{ flexShrink: 0, marginTop: '1px' }} role="img" aria-label={t('onboarding.done')} />
            ) : (
              <Circle size={18} color="var(--text-tertiary)" style={{ flexShrink: 0, marginTop: '1px' }} role="img" aria-label={t('onboarding.todo')} />
            )}
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: step.done ? 'var(--text-secondary)' : 'var(--text-primary)',
                  textDecoration: step.done ? 'line-through' : 'none',
                }}
              >
                {step.title}
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: '2px' }}>{step.description}</div>
              {!step.done && typeof step.progress === 'number' && step.progress > 0 && (
                <div style={{ marginTop: '6px' }}>
                  <ProgressBar value={step.progress} height={5} showLabel ariaLabel={step.title} />
                </div>
              )}
            </div>
            {!step.done && step.link && (
              <Link to={step.link} className="btn btn-secondary btn-sm" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                {step.actionLabel || t('common.open')} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
            {!step.done && !step.link && step.adminOnly && (
              <span style={{ flexShrink: 0, fontSize: '12.5px', color: 'var(--text-secondary)', alignSelf: 'center' }}>{t('onboarding.askAdmin')}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
};

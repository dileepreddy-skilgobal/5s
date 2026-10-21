import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, KeyRound, Mail } from 'lucide-react';
import { api, getApiErrorMessage } from '../../services/api';
import { getLastOrganizationSlug } from '../../context/AppContext';
import { Button } from '../../components/ui/Button';
import { PasswordInput, PasswordPolicyChecklist, isPasswordPolicyMet } from '../../components/auth/PasswordPolicy';
import { useI18n } from '../../i18n';
import { LanguageSelect } from '../../components/common/LanguageSelect';
import { AuthShell, AuthCardHeading, authCardStyle } from './AuthShell';

/** Centered card used by the public password-recovery pages (same frame and card as sign-in). */
const RecoveryLayout: React.FC<{ icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }> = ({
  icon,
  title,
  subtitle,
  children,
}) => (
  <AuthShell maxWidth="460px">
    <section className="animate-fade-in" style={authCardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
        <div
          aria-hidden="true"
          style={{
            width: '40px',
            height: '40px',
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
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AuthCardHeading title={title} subtitle={subtitle} spaceBelow="0" />
        </div>
        <LanguageSelect compact />
      </div>
      {children}
    </section>
  </AuthShell>
);

const Notice: React.FC<{ tone: 'success' | 'danger'; children: React.ReactNode }> = ({ tone, children }) => (
  <div
    role={tone === 'danger' ? 'alert' : 'status'}
    style={{
      display: 'flex',
      gap: '10px',
      padding: '12px 14px',
      borderRadius: 'var(--radius-md)',
      border: `1px solid var(--color-${tone}-border)`,
      background: `var(--color-${tone}-bg)`,
      color: `var(--color-${tone})`,
      fontSize: '13px',
      lineHeight: 1.5,
    }}
  >
    {tone === 'success' ? (
      <CheckCircle2 size={17} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
    ) : (
      <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
    )}
    <div>{children}</div>
  </div>
);

/**
 * An unknown, used or expired reset token is rejected with a 400 whose message is a single string
 * (request-validation 400s carry a list of field messages instead); 404/410 are treated the same way.
 */
const isInvalidResetToken = (error: unknown): boolean => {
  const response = (error as { response?: { status?: number; data?: { message?: unknown } } })?.response;
  if (!response) return false;
  if (response.status === 404 || response.status === 410) return true;
  return response.status === 400 && typeof response.data?.message === 'string';
};

const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  color: 'var(--color-link)',
  fontSize: '13px',
  fontWeight: 600,
  textDecoration: 'none',
  alignSelf: 'flex-start',
};

export const ForgotPasswordPage: React.FC = () => {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [orgCode, setOrgCode] = useState(params.get('org') || getLastOrganizationSlug());
  const [submitting, setSubmitting] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.forgotPassword({ email: email.trim(), tenantSlug: orgCode.trim().toLowerCase() || undefined });
      // The server's wording is generic and English; show the same notice in the active language
      setSentMessage(t('auth.forgot.sent'));
    } catch (err) {
      setError(getApiErrorMessage(err, t('auth.forgot.failed')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RecoveryLayout icon={<Mail size={20} />} title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')}>
      {sentMessage ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <Notice tone="success">
            {sentMessage}
            <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
              {t('auth.forgot.sentHint')}
            </div>
          </Notice>
          <Link to="/login" style={backLinkStyle}>
            <ArrowLeft size={14} aria-hidden="true" /> {t('auth.forgot.backToSignIn')}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="forgot-email">{t('auth.forgot.email')}</label>
            <input
              id="forgot-email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="form-input"
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="forgot-org">{t('auth.forgot.orgCode')}</label>
            <input
              id="forgot-org"
              type="text"
              autoComplete="organization"
              value={orgCode}
              onChange={(e) => setOrgCode(e.target.value)}
              placeholder={t('auth.orgCodePlaceholder')}
              aria-describedby="forgot-org-hint"
              className="form-input"
            />
            <div id="forgot-org-hint" className="form-hint">
              {t('auth.forgot.orgCodeHint')}
            </div>
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" variant="primary" size="lg" loading={submitting} disabled={submitting || !email.trim()} style={{ width: '100%' }}>
            {submitting ? t('auth.forgot.sending') : t('auth.forgot.send')}
          </Button>
          <Link to="/login" style={backLinkStyle}>
            <ArrowLeft size={14} aria-hidden="true" /> {t('auth.forgot.backToSignIn')}
          </Link>
        </form>
      )}
    </RecoveryLayout>
  );
};

export const ResetPasswordPage: React.FC = () => {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = (params.get('token') || '').trim();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenInvalid, setTokenInvalid] = useState(!token);

  const canSubmit = isPasswordPolicyMet(password) && password === confirm && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.resetPassword({ token, newPassword: password });
      setDoneMessage(t('auth.reset.done'));
      setPassword('');
      setConfirm('');
    } catch (err) {
      if (isInvalidResetToken(err)) setTokenInvalid(true);
      else setError(getApiErrorMessage(err, t('auth.reset.failed')));
    } finally {
      setSubmitting(false);
    }
  };

  if (doneMessage) {
    return (
      <RecoveryLayout icon={<CheckCircle2 size={20} />} title={t('auth.reset.doneTitle')} subtitle={t('auth.reset.doneSubtitle')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <Notice tone="success">{doneMessage}</Notice>
          <Link to="/login" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>
            {t('auth.reset.signIn')}
          </Link>
        </div>
      </RecoveryLayout>
    );
  }

  if (tokenInvalid) {
    return (
      <RecoveryLayout icon={<AlertTriangle size={20} />} title={t('auth.reset.invalidTitle')} subtitle={t('auth.reset.invalidSubtitle')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <Notice tone="danger">{t('auth.reset.invalid')}</Notice>
          <Link to="/forgot-password" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>
            {t('auth.reset.requestNew')}
          </Link>
          <Link to="/login" style={backLinkStyle}>
            <ArrowLeft size={14} aria-hidden="true" /> {t('auth.forgot.backToSignIn')}
          </Link>
        </div>
      </RecoveryLayout>
    );
  }

  return (
    <RecoveryLayout icon={<KeyRound size={20} />} title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="reset-password">{t('auth.reset.newPassword')}</label>
          <PasswordInput id="reset-password" value={password} onChange={setPassword} autoFocus autoComplete="new-password" maxLength={128} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="reset-confirm">{t('auth.reset.confirmPassword')}</label>
          <PasswordInput id="reset-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" maxLength={128} />
        </div>
        <PasswordPolicyChecklist password={password} confirm={confirm} showConfirm />
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" loading={submitting} disabled={!canSubmit} style={{ width: '100%' }}>
          {submitting ? t('auth.reset.saving') : t('auth.reset.submit')}
        </Button>
        <Link to="/login" style={backLinkStyle}>
          <ArrowLeft size={14} aria-hidden="true" /> {t('auth.forgot.backToSignIn')}
        </Link>
      </form>
    </RecoveryLayout>
  );
};

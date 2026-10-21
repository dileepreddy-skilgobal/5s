import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, getLastOrganizationSlug } from '../../context/AppContext';
import { getApiErrorMessage, isMfaChallenge } from '../../services/api';
import { MfaChallengeStep, PendingMfaChallenge } from './MfaChallengeStep';
import { useI18n } from '../../i18n';
import { roleMeta } from '../../constants/roles';
import { LanguageSelect } from '../../components/common/LanguageSelect';
import { PasswordInput } from '../../components/auth/PasswordPolicy';
import { Button } from '../../components/ui/Button';
import { Tabs, TabItem } from '../../components/ui/Tabs';
import { AuthShell, AuthCardHeading, authCardStyle } from './AuthShell';
import {
  ShieldCheck,
  Lock,
  Mail,
  KeyRound,
  Building,
  Smartphone,
  Globe,
  Hash,
  ChevronDown,
  LayoutDashboard,
  ClipboardCheck,
  Factory,
  CalendarCheck,
  Briefcase,
  BarChart3,
} from 'lucide-react';

const SHOW_DEMO_PORTALS = import.meta.env.VITE_SHOW_DEMO_PORTALS !== 'false';
const SSO_ENABLED = import.meta.env.VITE_SSO_ENABLED === 'true';

type AuthMode = 'PASSWORD' | 'SSO' | 'PIN';

/** Demo accounts created by the seed (backend/prisma/seed.ts); a card only fills in the email. */
const DEMO_ACCOUNTS: Array<{ roleCode: string; name: string; email: string; icon: React.ReactNode }> = [
  { roleCode: 'SUPER_ADMIN', name: 'Vikram Malhotra', email: 'superadmin@skilglobal.com', icon: <ShieldCheck size={16} /> },
  { roleCode: 'ORG_ADMIN', name: 'Pooja Sharma', email: 'admin@skilglobal.com', icon: <Building size={16} /> },
  { roleCode: 'PLANT_HEAD', name: 'Rajesh Kumar', email: 'planthead.blr@skilglobal.com', icon: <Factory size={16} /> },
  { roleCode: 'COORDINATOR_5S', name: 'Sneha Reddy', email: 'coordinator.5s@skilglobal.com', icon: <CalendarCheck size={16} /> },
  { roleCode: 'DEPT_HEAD', name: 'Suresh Menon', email: 'depthead.machining@skilglobal.com', icon: <Briefcase size={16} /> },
  { roleCode: 'AREA_OWNER', name: 'Arun Patel', email: 'owner.cnc01@skilglobal.com', icon: <LayoutDashboard size={16} /> },
  { roleCode: 'AUDITOR', name: 'Amit Joshi', email: 'auditor.lead@skilglobal.com', icon: <ClipboardCheck size={16} /> },
  { roleCode: 'EXECUTIVE', name: 'Kavita Iyer', email: 'executive@skilglobal.com', icon: <BarChart3 size={16} /> },
];

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, loginWithSso, loginWithPin, addToast } = useApp();
  const { t } = useI18n();

  // Password sign-in opens by default with the demo accounts listed under it; a build can hide them with
  // VITE_SHOW_DEMO_PORTALS=false. SSO is offered only when it is configured on the backend (VITE_SSO_ENABLED=true).
  const [authMode, setAuthMode] = useState<AuthMode>('PASSWORD');

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Optional organization code; only needed when an email/badge exists in more than one organization
  const [orgCode, setOrgCode] = useState(getLastOrganizationSlug);
  // Most people never need the organization code, so it stays folded away unless one was used before
  const [showOrgCode, setShowOrgCode] = useState(() => !!getLastOrganizationSlug());
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  // Shopfloor PIN State
  const [pin, setPin] = useState('');
  const [badgeId, setBadgeId] = useState('');

  // Second sign-in step when the account has two-factor authentication
  const [mfaChallenge, setMfaChallenge] = useState<PendingMfaChallenge | null>(null);

  const organizationSlug = () => orgCode.trim().toLowerCase() || undefined;

  // Demo accounts pre-fill the email; a password is always required, so the cursor moves to it.
  const handlePortalLogin = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(account.email);
    setPassword('');
    setAuthMode('PASSWORD');
    window.requestAnimationFrame(() => document.getElementById('login-password')?.focus());
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      const res = await login({
        email: email.trim(),
        password,
        tenantSlug: organizationSlug(),
        rememberMe,
      });
      if (isMfaChallenge(res)) {
        setPassword('');
        setMfaChallenge({
          mfaToken: res.mfaToken,
          expiresAt: Date.now() + (Number(res.expiresInSeconds) || 300) * 1000,
          persist: rememberMe,
        });
        return;
      }
      // The router sends the authenticated user to the home page for their role
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setPassword('');
      addToast({
        type: 'error',
        title: t('auth.signInFailed'),
        message: getApiErrorMessage(err, t('auth.invalidCredentials')),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSsoSubmit = async (provider: string) => {
    setLoading(true);
    try {
      await loginWithSso(provider, organizationSlug());
      navigate('/', { replace: true });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: t('auth.ssoFailed'),
        message: getApiErrorMessage(err, t('auth.ssoFailedMessage')),
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || !badgeId) return;
    setLoading(true);
    try {
      const res = await loginWithPin(pin, badgeId.trim(), undefined, organizationSlug());
      if (isMfaChallenge(res)) {
        setPin('');
        // Shop-floor sessions are never persisted beyond the browser session
        setMfaChallenge({
          mfaToken: res.mfaToken,
          expiresAt: Date.now() + (Number(res.expiresInSeconds) || 300) * 1000,
          persist: false,
        });
        return;
      }
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setPin('');
      addToast({
        type: 'error',
        title: t('auth.pinFailed'),
        message: getApiErrorMessage(err, t('auth.pinFailedMessage')),
      });
    } finally {
      setLoading(false);
    }
  };

  const openForgotPassword = () => {
    const params = new URLSearchParams();
    if (email.trim()) params.set('email', email.trim());
    if (organizationSlug()) params.set('org', organizationSlug() as string);
    const qs = params.toString();
    navigate(`/forgot-password${qs ? `?${qs}` : ''}`);
  };


  const authTabs: TabItem[] = [
    { id: 'PASSWORD', label: t('auth.tabs.password'), icon: <Lock size={15} aria-hidden="true" /> },
    ...(SSO_ENABLED ? [{ id: 'SSO', label: t('auth.tabs.sso'), icon: <Globe size={15} aria-hidden="true" /> }] : []),
    { id: 'PIN', label: t('auth.tabs.pin'), icon: <Hash size={15} aria-hidden="true" /> },
  ];

  return (
    <AuthShell aside={<LanguageSelect compact />}>
      <section style={authCardStyle} aria-label={t('auth.heading')}>
        <AuthCardHeading title={mfaChallenge ? t('auth.heading') : t('auth.welcome')} subtitle={mfaChallenge ? undefined : t('auth.subheading')} spaceBelow="24px" />

        {mfaChallenge ? (
          <MfaChallengeStep
            challenge={mfaChallenge}
            onBack={() => setMfaChallenge(null)}
            onSuccess={() => navigate('/', { replace: true })}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Tabs tabs={authTabs} activeTab={authMode} onChange={(id) => setAuthMode(id as AuthMode)} ariaLabel={t('auth.heading')} />

            {/* Optional organization code; only needed when an email or badge exists in more than one organization */}
            {!showOrgCode && (
              <button type="button" className="auth-org-toggle" onClick={() => setShowOrgCode(true)} aria-expanded={false} aria-controls="orgCode">
                <Building size={14} aria-hidden="true" />
                {t('auth.orgToggle')}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            )}
            {showOrgCode && (
              <div className="form-group animate-fade-in" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="orgCode">
                  {t('auth.orgCode')}
                </label>
                <div style={{ position: 'relative' }}>
                  <Building size={16} aria-hidden="true" style={leadingIconStyle} />
                  <input
                    id="orgCode"
                    type="text"
                    className="form-input"
                    value={orgCode}
                    onChange={(e) => setOrgCode(e.target.value)}
                    placeholder={t('auth.orgCodePlaceholder')}
                    autoComplete="organization"
                    aria-describedby="orgCode-hint"
                    style={{ paddingLeft: '36px' }}
                  />
                </div>
                <div id="orgCode-hint" className="form-hint">
                  {t('auth.forgot.orgCodeHint')}
                </div>
              </div>
            )}

            {/* TAB 2: EMAIL & PASSWORD */}
            {authMode === 'PASSWORD' && (
              <form onSubmit={handlePasswordSubmit} className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="login-email">
                    {t('auth.email')}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} aria-hidden="true" style={leadingIconStyle} />
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('auth.emailPlaceholder')}
                      className="form-input"
                      style={{ paddingLeft: '36px' }}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '6px' }}>
                    <label className="form-label" htmlFor="login-password" style={{ margin: 0 }}>
                      {t('auth.password')}
                    </label>
                    <button type="button" onClick={openForgotPassword} style={linkButtonStyle}>
                      {t('auth.forgotPassword')}
                    </button>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <KeyRound size={16} aria-hidden="true" style={{ ...leadingIconStyle, zIndex: 1 }} />
                    <PasswordInput
                      id="login-password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={setPassword}
                      style={{ paddingLeft: '36px' }}
                    />
                  </div>
                </div>

                <label
                  htmlFor="rememberMe"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    id="rememberMe"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px', flexShrink: 0, accentColor: 'var(--color-primary)' }}
                  />
                  {t('auth.rememberMe')}
                </label>

                <Button type="submit" variant="primary" size="lg" loading={loading} disabled={loading} style={{ width: '100%', marginTop: '4px' }}>
                  {loading ? t('auth.authenticating') : t('auth.submit')}
                </Button>
              </form>
            )}

            {/* Demo accounts from the sample data (seeded); picking one fills in its email */}
            {SHOW_DEMO_PORTALS && authMode === 'PASSWORD' && (
              <section aria-labelledby="demo-accounts-title" className="animate-fade-in">
                <div className="auth-divider" id="demo-accounts-title">
                  {t('auth.demoTitle')}
                </div>
                <p className="auth-demo-hint">{t('auth.portalsIntro')}</p>
                <div className="auth-demo-grid">
                  {DEMO_ACCOUNTS.map((account) => {
                    const role = roleMeta(account.roleCode);
                    const selected = email.trim().toLowerCase() === account.email;
                    return (
                      <button
                        key={account.email}
                        type="button"
                        className="login-portal-card auth-demo-btn"
                        aria-pressed={selected}
                        disabled={loading}
                        title={`${account.name} · ${account.email}`}
                        onClick={() => handlePortalLogin(account)}
                      >
                        <span className="auth-demo-icon" aria-hidden="true">
                          {account.icon}
                        </span>
                        <span className="auth-demo-text">
                          <span className="auth-demo-role">{role?.label ?? account.roleCode}</span>
                          <span className="auth-demo-name">{account.name}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* TAB 3: ENTERPRISE SSO */}
            {SSO_ENABLED && authMode === 'SSO' && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{t('auth.ssoIntro')}</p>

                {/* Microsoft Azure AD (brand logo colours stay literal) */}
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => handleSsoSubmit('MICROSOFT_AZURE_AD')}
                  disabled={loading}
                  style={{ width: '100%' }}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
                      <path fill="#f35325" d="M1 1h10v10H1z" />
                      <path fill="#81bc06" d="M12 1h10v10H12z" />
                      <path fill="#05a6f0" d="M1 12h10v10H1z" />
                      <path fill="#ffba08" d="M12 12h10v10H12z" />
                    </svg>
                  }
                >
                  {t('auth.ssoMicrosoft')}
                </Button>

                {/* Google Workspace */}
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => handleSsoSubmit('GOOGLE_WORKSPACE')}
                  disabled={loading}
                  style={{ width: '100%' }}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.4 8.9 5 12 5z" />
                      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z" />
                      <path fill="#FBBC05" d="M5.3 14.7c-.2-.7-.4-1.4-.4-2.2 0-.8.1-1.5.4-2.2L1.6 7.4C.6 9.4 0 11.6 0 14c0 2.4.6 4.6 1.6 6.6l3.7-2.9z" />
                      <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.4-6.7-5.3L1.6 16c1.9 3.8 5.8 7 10.4 7z" />
                    </svg>
                  }
                >
                  {t('auth.ssoGoogle')}
                </Button>

                {/* Okta / SAML 2.0 */}
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => handleSsoSubmit('OKTA_SAML')}
                  disabled={loading}
                  style={{ width: '100%' }}
                  icon={<ShieldCheck size={16} aria-hidden="true" />}
                >
                  {t('auth.ssoOkta')}
                </Button>
              </div>
            )}

            {/* TAB 4: SHOPFLOOR QUICK PIN */}
            {authMode === 'PIN' && (
              <form onSubmit={handlePinSubmit} className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{t('auth.pinIntro')}</p>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="login-pin">
                    {t('auth.pinLabel')}
                  </label>
                  <input
                    id="login-pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4,8}"
                    maxLength={8}
                    autoComplete="off"
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="••••"
                    className="form-input"
                    style={{ fontSize: '18px', textAlign: 'center', letterSpacing: '0.4em', fontWeight: 700, height: 'var(--control-lg)' }}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="login-badge">
                    {t('auth.badgeLabel')}
                  </label>
                  <input
                    id="login-badge"
                    type="text"
                    required
                    value={badgeId}
                    onChange={(e) => setBadgeId(e.target.value)}
                    placeholder={t('auth.badgePlaceholder')}
                    className="form-input"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={loading}
                  disabled={loading}
                  icon={<Smartphone size={16} aria-hidden="true" />}
                  style={{ width: '100%', marginTop: '4px' }}
                >
                  {loading ? t('auth.validatingPin') : t('auth.startShopfloor')}
                </Button>
              </form>
            )}
          </div>
        )}

      </section>
    </AuthShell>
  );
};

const leadingIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '12px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'var(--text-tertiary)',
  pointerEvents: 'none',
};

const linkButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--color-link)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
};

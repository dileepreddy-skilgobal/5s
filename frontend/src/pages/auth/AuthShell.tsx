import React from 'react';
import { CheckCircle2, ShieldCheck, Smartphone } from 'lucide-react';
import { useI18n } from '../../i18n';

/** Logo mark and product name, white on the brand panel or brand-coloured on the light sign-in side. */
const AuthLogo: React.FC<{ onBrand?: boolean }> = ({ onBrand = false }) => {
  const { t } = useI18n();
  return (
    <div className={`auth-logo${onBrand ? ' auth-logo-on-brand' : ''}`}>
      <span className="auth-logo-mark" aria-hidden="true">
        5S
      </span>
      <span className="auth-logo-name">{t('auth.brandName')}</span>
    </div>
  );
};

/**
 * Brand panel on the left of the public auth pages (wide screens only): what the product does, the six pillars
 * and plain product facts. No unverifiable uptime or certification claims.
 */
const AuthBrandPanel: React.FC = () => {
  const { t } = useI18n();
  const valuePoints = [
    { title: t('auth.slides.auditsTitle'), desc: t('auth.slides.auditsDesc') },
    { title: t('auth.slides.redTagsTitle'), desc: t('auth.slides.redTagsDesc') },
    { title: t('auth.slides.resultsTitle'), desc: t('auth.slides.resultsDesc') },
  ];
  const pillars = ['1S Sort', '2S Set in order', '3S Shine', '4S Standardize', '5S Sustain', '6S Safety'];
  const facts = [
    { icon: <Smartphone size={16} aria-hidden="true" />, label: t('auth.factShopFloorLabel'), value: t('auth.factShopFloor') },
    { icon: <ShieldCheck size={16} aria-hidden="true" />, label: t('auth.factSignInLabel'), value: t('auth.factSignIn') },
  ];

  return (
    <aside className="auth-brand" aria-labelledby="auth-brand-title">
      <AuthLogo onBrand />

      <div className="auth-brand-body">
        <div className="auth-brand-eyebrow">{t('auth.brandEyebrow')}</div>
        <h2 id="auth-brand-title" className="auth-brand-title">
          {t('auth.brandTagline')}
        </h2>
        <p className="auth-brand-intro">{t('auth.brandIntro')}</p>

        <ul className="auth-brand-points">
          {valuePoints.map((point) => (
            <li key={point.title}>
              <CheckCircle2 size={20} aria-hidden="true" className="auth-brand-check" />
              <div>
                <div className="auth-brand-point-title">{point.title}</div>
                <div className="auth-brand-point-desc">{point.desc}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="auth-brand-foot">
        <ul className="auth-brand-pillars" aria-label={t('auth.pillarsLabel')}>
          {pillars.map((pillar) => (
            <li key={pillar}>{pillar}</li>
          ))}
        </ul>
        <div className="auth-brand-facts">
          {facts.map((fact) => (
            <div key={fact.label} className="auth-brand-fact">
              <span className="auth-brand-fact-icon">{fact.icon}</span>
              <span>
                <span className="auth-brand-fact-label">{fact.label}</span>
                <span className="auth-brand-fact-value">{fact.value}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};

/**
 * Page frame for the public auth pages: brand panel on the left (from 960px), the form centred on the right.
 * `aside` (e.g. the language picker) sits in the top-right corner; `maxWidth` limits the form column.
 */
export const AuthShell: React.FC<{ children: React.ReactNode; maxWidth?: string; aside?: React.ReactNode }> = ({
  children,
  maxWidth = '420px',
  aside,
}) => {
  const { t } = useI18n();
  return (
    <div className="auth-layout">
      <AuthBrandPanel />
      <div className="auth-main">
        <div className="auth-main-top">
          {/* The brand panel is hidden on narrow screens, so the logo moves here */}
          <div className="auth-mobile-logo">
            <AuthLogo />
          </div>
          <div style={{ marginLeft: 'auto' }}>{aside}</div>
        </div>
        <main className="auth-main-body">
          <div className="auth-main-inner" style={{ maxWidth }}>
            {children}
          </div>
        </main>
        <footer className="auth-footer">
          <span>{t('auth.copyright', { year: String(new Date().getFullYear()) })}</span>
          <span>
            {t('auth.needHelpShort')}{' '}
            <a href="mailto:support@skilglobal.com">{t('auth.helpdesk')}</a>
          </span>
        </footer>
      </div>
    </div>
  );
};

/** The form sits directly on the page (no boxed card); kept as a style hook for the auth pages. */
export const authCardStyle: React.CSSProperties = {
  minWidth: 0,
};

/** Heading block used by the sign-in and recovery pages: title, short description and an optional aside. */
export const AuthCardHeading: React.FC<{ title: string; subtitle?: React.ReactNode; aside?: React.ReactNode; as?: 'h1' | 'h2'; spaceBelow?: string }> = ({
  title,
  subtitle,
  aside,
  as: Heading = 'h1',
  spaceBelow = '28px',
}) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: spaceBelow }}>
    <div style={{ minWidth: 0 }}>
      <Heading className="auth-heading">{title}</Heading>
      {subtitle && <p className="auth-subheading">{subtitle}</p>}
    </div>
    {aside}
  </div>
);

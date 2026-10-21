import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock, KeyRound, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getApiErrorMessage } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { OtpCodeInput } from '../../components/auth/PasswordPolicy';
import { useI18n } from '../../i18n';

export interface PendingMfaChallenge {
  mfaToken: string;
  /** Epoch ms when the challenge token stops being accepted. */
  expiresAt: number;
  /** Keep the resulting session beyond the browser session ("remember me"). */
  persist: boolean;
}

const formatRemaining = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/** Second sign-in step: authenticator code, or a one-time recovery code. */
export const MfaChallengeStep: React.FC<{
  challenge: PendingMfaChallenge;
  onBack: () => void;
  onSuccess: () => void;
}> = ({ challenge, onBack, onSuccess }) => {
  const { verifyMfa } = useApp();
  const { t } = useI18n();
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const submittingRef = useRef(false);
  const recoveryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (useRecovery) recoveryRef.current?.focus();
  }, [useRecovery]);

  const remaining = challenge.expiresAt - now;
  const expired = remaining <= 0;

  const submit = async (override?: string) => {
    if (submittingRef.current || expired) return;
    const totp = override ?? code;
    const recovery = recoveryCode.trim();
    if (useRecovery ? !recovery : !/^\d{6}$/.test(totp)) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await verifyMfa(
        useRecovery ? { mfaToken: challenge.mfaToken, recoveryCode: recovery } : { mfaToken: challenge.mfaToken, code: totp },
        challenge.persist,
      );
      onSuccess();
    } catch (err) {
      setError(getApiErrorMessage(err, t('auth.mfa.invalidCode')));
      setCode('');
      setRecoveryCode('');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form
      className="animate-fade-in"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div
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
          <ShieldCheck size={20} aria-hidden="true" />
        </div>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{t('auth.mfa.title')}</h2>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '2px' }}>
            {useRecovery
              ? t('auth.mfa.recoveryIntro')
              : t('auth.mfa.codeIntro')}
          </div>
        </div>
      </div>

      {/* Not a live region: it ticks every second; only expiry is announced */}
      <div
        role={expired ? 'alert' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          borderRadius: 'var(--radius-md)',
          fontSize: '13px',
          lineHeight: 1.45,
          border: `1px solid ${expired ? 'var(--color-danger-border)' : 'var(--color-info-border)'}`,
          background: expired ? 'var(--color-danger-bg)' : 'var(--color-info-bg)',
          color: expired ? 'var(--color-danger)' : 'var(--color-info)',
        }}
      >
        <Clock size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
        {expired ? (
          <span>{t('auth.mfa.expired')}</span>
        ) : (
          <span>{t('auth.mfa.expiresIn', { time: formatRemaining(remaining) })}</span>
        )}
      </div>

      {useRecovery ? (
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="mfa-recovery">{t('auth.mfa.recoveryCode')}</label>
          <input
            id="mfa-recovery"
            ref={recoveryRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            value={recoveryCode}
            disabled={expired}
            onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
            placeholder="XXXXX-XXXXX"
            className="form-input"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textAlign: 'center', letterSpacing: '0.1em' }}
          />
        </div>
      ) : (
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="mfa-code">{t('auth.mfa.authCode')}</label>
          <OtpCodeInput id="mfa-code" value={code} onChange={setCode} autoFocus disabled={expired} onComplete={(c) => submit(c)} />
        </div>
      )}

      {error && (
        <div role="alert" className="form-error" style={{ margin: 0 }}>
          {error}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={submitting}
        disabled={submitting || expired || (useRecovery ? !recoveryCode.trim() : code.length !== 6)}
        style={{ width: '100%' }}
      >
        {submitting ? t('auth.mfa.verifying') : t('auth.mfa.verify')}
      </Button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onBack} style={linkButtonStyle}>
          <ArrowLeft size={14} aria-hidden="true" /> {t('auth.mfa.back')}
        </button>
        <button
          type="button"
          onClick={() => {
            setUseRecovery((v) => !v);
            setError(null);
            setCode('');
            setRecoveryCode('');
          }}
          style={linkButtonStyle}
        >
          <KeyRound size={14} aria-hidden="true" /> {useRecovery ? t('auth.mfa.useAuthenticator') : t('auth.mfa.useRecovery')}
        </button>
      </div>
    </form>
  );
};

const linkButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  background: 'transparent',
  border: 'none',
  color: 'var(--color-link)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  padding: '4px 0',
  minHeight: '32px',
};

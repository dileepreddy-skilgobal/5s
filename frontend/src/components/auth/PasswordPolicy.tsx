import React, { useState } from 'react';
import { CheckCircle2, Circle, Eye, EyeOff } from 'lucide-react';
import { useI18n } from '../../i18n';

/** Client-side mirror of backend PASSWORD_POLICY_REGEX (core/auth/credentials.ts). The server stays the authority. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordPolicyChecks = (password: string) => {
  const pw = password || '';
  return [
    { id: 'length', label: `${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`, met: pw.length >= PASSWORD_MIN_LENGTH && pw.length <= PASSWORD_MAX_LENGTH },
    { id: 'upper', label: 'An upper-case letter', met: /[A-Z]/.test(pw) },
    { id: 'lower', label: 'A lower-case letter', met: /[a-z]/.test(pw) },
    { id: 'digit', label: 'A digit', met: /\d/.test(pw) },
    { id: 'symbol', label: 'A symbol (e.g. ! @ # -)', met: /[^A-Za-z0-9]/.test(pw) },
  ];
};

export const isPasswordPolicyMet = (password: string): boolean => passwordPolicyChecks(password).every((c) => c.met);

export const PasswordPolicyChecklist: React.FC<{ password: string; confirm?: string; showConfirm?: boolean }> = ({ password, confirm, showConfirm }) => {
  const { t } = useI18n();
  const labels: Record<string, string> = {
    length: t('auth.policy.length', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }),
    upper: t('auth.policy.upper'),
    lower: t('auth.policy.lower'),
    digit: t('auth.policy.digit'),
    symbol: t('auth.policy.symbol'),
  };
  const checks = passwordPolicyChecks(password).map((c) => ({ ...c, label: labels[c.id] ?? c.label }));
  if (showConfirm) {
    checks.push({ id: 'match', label: t('auth.policy.match'), met: !!password && password === (confirm ?? '') });
  }
  return (
    <ul
      aria-label={t('auth.policy.label')}
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '4px 12px' }}
    >
      {checks.map((c) => (
        <li
          key={c.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: c.met ? 'var(--color-success)' : 'var(--text-tertiary)',
            fontWeight: c.met ? 600 : 400,
          }}
        >
          {c.met ? <CheckCircle2 size={13} /> : <Circle size={13} />}
          <span>{c.label}</span>
        </li>
      ))}
    </ul>
  );
};

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
}

/** Password field with a show/hide toggle. */
export const PasswordInput: React.FC<PasswordInputProps> = ({ value, onChange, style, ...rest }) => {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();
  return (
    <div style={{ position: 'relative' }}>
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="form-control"
        style={{ paddingRight: '38px', ...style }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('auth.policy.hide') : t('auth.policy.show')}
        style={{
          position: 'absolute',
          right: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-tertiary)',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
        }}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
};

/** Six-digit authenticator code input: numeric keypad, one-time-code autofill, tolerant of pasted spaces/dashes. */
export const OtpCodeInput: React.FC<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  onComplete?: (code: string) => void;
}> = ({ id, value, onChange, autoFocus, disabled, onComplete }) => (
  <input
    id={id}
    type="text"
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern="[0-9]{6}"
    maxLength={12}
    autoFocus={autoFocus}
    disabled={disabled}
    value={value}
    placeholder="000000"
    aria-label="6-digit verification code"
    onChange={(e) => {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
      onChange(digits);
      if (digits.length === 6 && digits !== value) onComplete?.(digits);
    }}
    className="form-control"
    style={{ fontSize: '24px', textAlign: 'center', letterSpacing: '0.45em', fontWeight: 800, fontFamily: 'var(--font-mono)' }}
  />
);

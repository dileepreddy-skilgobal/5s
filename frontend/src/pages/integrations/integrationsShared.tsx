import React, { useState } from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from '../../components/ui/Button';

/** Copies text, falling back to a hidden textarea where the async clipboard API is unavailable (http, old browsers). */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
};

/** Copy button with a short "Copied" confirmation. */
export const CopyButton: React.FC<{ text: string; label?: string; size?: 'sm' | 'md' }> = ({ text, label = 'Copy', size = 'sm' }) => {
  const { addToast } = useApp();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      icon={copied ? <Check size={16} /> : <Copy size={16} />}
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } else {
          addToast({ type: 'warning', title: 'Copy failed', message: 'Select the text and copy it manually.' });
        }
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
};

/** Display labels for API-key and webhook-delivery status codes. */
export const API_KEY_STATUS_LABELS: Record<string, string> = { ACTIVE: 'Active', REVOKED: 'Revoked', EXPIRED: 'Expired' };
export const DELIVERY_STATUS_LABELS: Record<string, string> = { SUCCESS: 'Delivered', PENDING: 'Pending', FAILED: 'Failed' };

export const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
};

/** Preformatted snippet with a copy button. */
export const CodeBlock: React.FC<{ code: string; label?: string }> = ({ code, label }) => (
  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '6px 12px',
        background: 'var(--bg-surface-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: '12.5px',
        fontWeight: 600,
        color: 'var(--text-secondary)',
      }}
    >
      <span>{label}</span>
      <CopyButton text={code} />
    </div>
    <pre
      style={{
        ...monoStyle,
        margin: 0,
        padding: '12px',
        fontSize: '12px',
        lineHeight: 1.55,
        whiteSpace: 'pre',
        overflowX: 'auto',
        background: 'var(--bg-surface)',
        color: 'var(--text-primary)',
      }}
    >
      {code}
    </pre>
  </div>
);

/** A secret shown exactly once (API key, webhook signing secret). */
export const SecretReveal: React.FC<{ label: string; value: string; warning: React.ReactNode }> = ({ label, value, warning }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <div
      role="alert"
      style={{
        display: 'flex',
        gap: '10px',
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-warning-border)',
        background: 'var(--color-warning-bg)',
        color: 'var(--color-warning)',
        fontSize: '13px',
        lineHeight: 1.5,
      }}
    >
      <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
      <div>{warning}</div>
    </div>
    <div>
      <div className="form-label" style={{ marginBottom: '6px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '8px' }}>
        <input
          readOnly
          value={value}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          className="form-input"
          style={{ ...monoStyle, flex: 1, minWidth: 0, fontSize: '12.5px' }}
        />
        <CopyButton text={value} size="md" />
      </div>
    </div>
  </div>
);

/** Inline error box used inside forms (server validation messages such as a rejected webhook URL). */
export const FormError: React.FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <div
      role="alert"
      style={{
        display: 'flex',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-danger-border)',
        background: 'var(--color-danger-bg)',
        color: 'var(--color-danger)',
        fontSize: '13px',
        lineHeight: 1.45,
      }}
    >
      <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
      <span>{message}</span>
    </div>
  ) : null;

export const sectionHintStyle: React.CSSProperties = { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 };

export const emptyStateStyle: React.CSSProperties = {
  padding: '40px 16px',
  textAlign: 'center',
  color: 'var(--text-secondary)',
  fontSize: '13px',
};

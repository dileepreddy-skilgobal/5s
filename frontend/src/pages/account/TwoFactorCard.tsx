import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, Download, KeyRound, RefreshCw, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { api, getApiErrorMessage } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { MfaSetupResponse, MfaStatus } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { OtpCodeInput, PasswordInput } from '../../components/auth/PasswordPolicy';
import { useI18n } from '../../i18n';

const errorTextStyle: React.CSSProperties = { fontSize: '12.5px', color: 'var(--color-danger)', fontWeight: 500 };
const hintStyle: React.CSSProperties = { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 };

/** Shows freshly issued recovery codes once, with copy / download and an explicit "I saved them" confirmation. */
const RecoveryCodesPanel: React.FC<{ codes: string[]; accountLabel: string; onDone: () => void }> = ({ codes, accountLabel, onDone }) => {
  const { addToast } = useApp();
  const [saved, setSaved] = useState(false);
  const text = codes.join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      addToast({ type: 'success', title: 'Copied', message: 'Recovery codes copied to the clipboard.' });
    } catch {
      addToast({ type: 'warning', title: 'Copy unavailable', message: 'Select the codes and copy them manually, or download them.' });
    }
  };

  const download = () => {
    const body = [
      '5S Platform - two-factor recovery codes',
      `Account: ${accountLabel}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      'Each code can be used once to sign in if you lose access to your authenticator app.',
      '',
      ...codes,
      '',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = '5s-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div
        role="alert"
        style={{
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-warning-border)',
          background: 'var(--color-warning-bg)',
          color: 'var(--color-warning)',
          fontSize: '12.5px',
          lineHeight: 1.5,
        }}
      >
        <strong>Save these recovery codes now.</strong> They are shown only once. Each code signs you in a single time if you lose your
        phone. Store them somewhere safe, such as a password manager.
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '8px',
          padding: '14px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface-subtle)',
          border: '1px solid var(--border-subtle)',
          fontFamily: 'var(--font-mono)',
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          textAlign: 'center',
          userSelect: 'all',
        }}
      >
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Button type="button" variant="secondary" size="sm" icon={<Copy size={16} />} onClick={copy}>
          Copy
        </Button>
        <Button type="button" variant="secondary" size="sm" icon={<Download size={16} />} onClick={download}>
          Download .txt
        </Button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} style={{ width: '16px', height: '16px', flexShrink: 0, accentColor: 'var(--color-primary)' }} />
        I have saved my recovery codes somewhere safe
      </label>
      <div>
        <Button type="button" variant="primary" disabled={!saved} onClick={onDone} icon={<CheckCircle2 size={16} />}>
          Done
        </Button>
      </div>
    </div>
  );
};

type WizardStep = 'idle' | 'scan' | 'codes';

/** Two-factor authentication status, enrolment wizard, disable and recovery-code regeneration. */
export const TwoFactorCard: React.FC<{ autoStart?: boolean }> = ({ autoStart }) => {
  const { addToast, currentUser, refreshSession } = useApp();
  const { formatDateTime } = useI18n();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<WizardStep>('idle');
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issuedCodes, setIssuedCodes] = useState<string[] | null>(null);
  const [autoStarted, setAutoStarted] = useState(false);

  // Disable / regenerate dialogs
  const [dialog, setDialog] = useState<'disable' | 'regenerate' | null>(null);
  const [dialogPassword, setDialogPassword] = useState('');
  const [dialogCode, setDialogCode] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [regeneratedCodes, setRegeneratedCodes] = useState<string[] | null>(null);

  const accountLabel = currentUser?.email || 'your account';

  const loadStatus = useCallback(async () => {
    setLoadError(null);
    try {
      setStatus(await api.getMfaStatus());
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Could not load two-factor status.'));
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const startSetup = useCallback(async () => {
    setSetupLoading(true);
    setError(null);
    setCode('');
    try {
      const res = await api.setupMfa();
      setSetup(res);
      setStep('scan');
    } catch (err) {
      addToast({ type: 'error', title: 'Two-factor setup', message: getApiErrorMessage(err, 'Could not start two-factor setup.') });
    } finally {
      setSetupLoading(false);
    }
  }, [addToast]);

  // Mandatory enrolment: open the wizard straight away
  useEffect(() => {
    if (autoStart && !autoStarted && status && !status.enabled && step === 'idle') {
      setAutoStarted(true);
      startSetup();
    }
  }, [autoStart, autoStarted, status, step, startSetup]);

  const confirmEnable = async (override?: string) => {
    const value = override ?? code;
    if (busy || !/^\d{6}$/.test(value)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.enableMfa(value);
      setIssuedCodes(Array.isArray(res?.recoveryCodes) ? res.recoveryCodes : []);
      setStep('codes');
      setSetup(null);
      setCode('');
      // Lifts a mandatory-enrolment block straight away; this page stays mounted
      refreshSession().catch(() => undefined);
      loadStatus();
      addToast({ type: 'success', title: 'Two-factor enabled', message: 'Your account is now protected with two-factor authentication.' });
    } catch (err) {
      setError(getApiErrorMessage(err, 'That code is not valid. Check the time on your phone and try again.'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const finishCodes = () => {
    setIssuedCodes(null);
    setStep('idle');
    refreshSession().catch(() => undefined);
  };

  const openDialog = (kind: 'disable' | 'regenerate') => {
    setDialog(kind);
    setDialogPassword('');
    setDialogCode('');
    setDialogError(null);
    setRegeneratedCodes(null);
  };

  const closeDialog = () => {
    if (dialogBusy) return;
    // Recovery codes are only shown once; closing the dialog means the user is done with them
    setDialog(null);
    setRegeneratedCodes(null);
  };

  const submitDialog = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (dialogBusy || !/^\d{6}$/.test(dialogCode)) return;
    if (dialog === 'disable' && !dialogPassword) return;
    setDialogBusy(true);
    setDialogError(null);
    try {
      if (dialog === 'disable') {
        await api.disableMfa({ password: dialogPassword, code: dialogCode });
        setDialog(null);
        addToast({ type: 'info', title: 'Two-factor disabled', message: 'Two-factor authentication is now off for your account.' });
        refreshSession().catch(() => undefined);
      } else {
        const res = await api.regenerateRecoveryCodes(dialogCode);
        setRegeneratedCodes(Array.isArray(res?.recoveryCodes) ? res.recoveryCodes : []);
      }
      loadStatus();
    } catch (err) {
      setDialogError(getApiErrorMessage(err, 'That code is not valid.'));
      setDialogCode('');
    } finally {
      setDialogBusy(false);
      setDialogPassword('');
    }
  };

  const enabled = status?.enabled === true;
  const required = status?.required === true;

  return (
    <Card
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          Two-factor authentication
          {status && (enabled ? <Badge variant="success">On</Badge> : <Badge variant={required ? 'danger' : 'neutral'}>Off</Badge>)}
          {required && <Badge variant="info">Required by your organization</Badge>}
        </span>
      }
      subtitle="Protect your account with a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…)."
    >
      {loadError ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={errorTextStyle}>{loadError}</span>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={16} />} onClick={loadStatus}>
            Retry
          </Button>
        </div>
      ) : !status ? (
        <p style={hintStyle}>Loading…</p>
      ) : step === 'codes' && issuedCodes ? (
        <RecoveryCodesPanel codes={issuedCodes} accountLabel={accountLabel} onDone={finishCodes} />
      ) : step === 'scan' && setup ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirmEnable();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <li>Open your authenticator app and add a new account.</li>
            <li>Scan the QR code, or type the setup key manually.</li>
            <li>Enter the 6-digit code the app shows to finish.</li>
          </ol>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {setup.qrCodeDataUrl ? (
              <img
                src={setup.qrCodeDataUrl}
                alt="QR code for your authenticator app"
                width={180}
                height={180}
                style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: '#FFFFFF', padding: '6px' }}
              />
            ) : null}
            <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <div className="form-label" style={{ marginBottom: '4px' }}>Setup key (manual entry)</div>
                <code
                  style={{
                    display: 'block',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-subtle)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    wordBreak: 'break-all',
                    userSelect: 'all',
                    color: 'var(--text-primary)',
                  }}
                >
                  {(setup.secret || '').replace(/(.{4})/g, '$1 ').trim()}
                </code>
                <div className="form-hint">Time-based (TOTP), 6 digits, 30 seconds.</div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="mfa-enable-code">Code from the app</label>
                <OtpCodeInput id="mfa-enable-code" value={code} onChange={setCode} autoFocus disabled={busy} onComplete={(c) => confirmEnable(c)} />
              </div>
              {error && <div role="alert" style={errorTextStyle}>{error}</div>}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button type="submit" variant="primary" loading={busy} disabled={busy || code.length !== 6} icon={<ShieldCheck size={16} />}>
                  Turn on two-factor
                </Button>
                {!required && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setStep('idle');
                      setSetup(null);
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      ) : enabled ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-primary)' }}>
            <ShieldCheck size={18} style={{ color: 'var(--color-success)', flexShrink: 0 }} aria-hidden="true" />
            <span>
              Enabled {status.enabledAt ? `on ${formatDateTime(status.enabledAt)}` : ''} ·{' '}
              <strong style={{ color: status.recoveryCodesRemaining <= 2 ? 'var(--color-danger)' : 'inherit' }}>
                {status.recoveryCodesRemaining} recovery code{status.recoveryCodesRemaining === 1 ? '' : 's'} left
              </strong>
            </span>
          </div>
          {status.recoveryCodesRemaining <= 2 && (
            <p style={{ ...hintStyle, color: 'var(--color-warning)' }}>You are running low on recovery codes. Generate a new set.</p>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" icon={<KeyRound size={16} />} onClick={() => openDialog('regenerate')}>
              Regenerate recovery codes
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<ShieldOff size={16} />}
              onClick={() => openDialog('disable')}
              disabled={required}
              title={required ? 'Your organization requires administrators to keep two-factor authentication on.' : undefined}
            >
              Turn off
            </Button>
          </div>
          {required && <p style={hintStyle}>Your organization requires administrators to use two-factor authentication, so it cannot be turned off.</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={hintStyle}>
            Two-factor authentication is off. When it is on, signing in also needs a code from your phone, so a stolen password alone
            is not enough.
          </p>
          <div>
            <Button variant="primary" icon={<Smartphone size={16} />} loading={setupLoading} onClick={startSetup}>
              Set up two-factor authentication
            </Button>
          </div>
        </div>
      )}

      <Modal
        isOpen={dialog !== null}
        onClose={closeDialog}
        title={dialog === 'disable' ? 'Turn off two-factor authentication' : 'Regenerate recovery codes'}
        subtitle={
          dialog === 'disable'
            ? 'Confirm with your password and a current code from your authenticator app.'
            : regeneratedCodes
              ? 'Your previous recovery codes no longer work.'
              : 'Your current recovery codes will stop working.'
        }
        maxWidth="460px"
      >
        {dialog === 'regenerate' && regeneratedCodes ? (
          <RecoveryCodesPanel codes={regeneratedCodes} accountLabel={accountLabel} onDone={closeDialog} />
        ) : (
          <form onSubmit={submitDialog} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {dialog === 'disable' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="mfa-disable-password">Password</label>
                <PasswordInput id="mfa-disable-password" value={dialogPassword} onChange={setDialogPassword} autoComplete="current-password" autoFocus />
              </div>
            )}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="mfa-dialog-code">Authenticator code</label>
              <OtpCodeInput id="mfa-dialog-code" value={dialogCode} onChange={setDialogCode} autoFocus={dialog === 'regenerate'} disabled={dialogBusy} />
            </div>
            {dialogError && <div role="alert" style={errorTextStyle}>{dialogError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button type="button" variant="secondary" onClick={closeDialog} disabled={dialogBusy}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={dialog === 'disable' ? 'danger' : 'primary'}
                loading={dialogBusy}
                disabled={dialogBusy || dialogCode.length !== 6 || (dialog === 'disable' && !dialogPassword)}
              >
                {dialog === 'disable' ? 'Turn off two-factor' : 'Generate new codes'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  );
};

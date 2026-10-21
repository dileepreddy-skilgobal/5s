import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, LogOut, Monitor, RefreshCw, Shield, ShieldAlert, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { AuthSession } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, LoadingState, EmptyState } from '../../components/ui/StateViews';
import { useI18n } from '../../i18n';
import { PasswordInput, PasswordPolicyChecklist, isPasswordPolicyMet } from '../../components/auth/PasswordPolicy';
import { TwoFactorCard } from './TwoFactorCard';
import { describeAuthMethod, describeUserAgent } from './securityFormat';

/** What the confirm dialog is about to sign out. */
type PendingSignOut = { kind: 'one'; session: AuthSession } | { kind: 'others' };

const ChangePasswordCard: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const { addToast } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!current && isPasswordPolicyMet(next) && next === confirm && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.changePassword({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      addToast({ type: 'success', title: 'Password changed', message: res?.message || 'Your password has been changed.' });
      onChanged();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not change your password.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Change password" subtitle="Changing your password signs out your other devices.">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '520px' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="cp-current">Current password</label>
          <PasswordInput id="cp-current" value={current} onChange={setCurrent} autoComplete="current-password" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="cp-new">New password</label>
          <PasswordInput id="cp-new" value={next} onChange={setNext} autoComplete="new-password" maxLength={128} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="cp-confirm">Confirm new password</label>
          <PasswordInput id="cp-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" maxLength={128} />
        </div>
        {(next || confirm) && <PasswordPolicyChecklist password={next} confirm={confirm} showConfirm />}
        {error && (
          <div role="alert" className="form-error" style={{ margin: 0 }}>
            {error}
          </div>
        )}
        <div>
          <Button type="submit" variant="primary" icon={<KeyRound size={16} />} loading={saving} disabled={!canSubmit}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
};

const SessionsCard: React.FC<{ reloadKey: number }> = ({ reloadKey }) => {
  const { addToast, logout } = useApp();
  const { formatDateTime, formatRelative } = useI18n();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<AuthSession[] | null>(null);
  const [pending, setPending] = useState<PendingSignOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await api.getSessions();
      // Current device first, then most recently active
      list.sort((a, b) => {
        if (a.current !== b.current) return a.current ? -1 : 1;
        const ta = new Date(a.lastSeenAt || a.createdAt).getTime() || 0;
        const tb = new Date(b.lastSeenAt || b.createdAt).getTime() || 0;
        return tb - ta;
      });
      setSessions(list);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load your signed-in devices.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const revoke = async (s: AuthSession) => {
    setPending(null);
    setBusyId(s.id);
    try {
      await api.revokeSession(s.id);
      addToast({ type: 'success', title: 'Device signed out', message: 'That device will need to sign in again.' });
      await load();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not sign out device', message: getApiErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  const revokeOthers = async () => {
    setPending(null);
    setRevokingOthers(true);
    try {
      const res = await api.revokeOtherSessions();
      const n = Number(res?.revoked) || 0;
      addToast({ type: 'success', title: 'Other devices signed out', message: `${n} other session${n === 1 ? '' : 's'} signed out.` });
      await load();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not sign out other devices', message: getApiErrorMessage(err) });
    } finally {
      setRevokingOthers(false);
    }
  };

  const others = (sessions || []).filter((s) => !s.current).length;

  return (
    <Card
      title="Signed-in devices"
      subtitle="Where your account is signed in right now. Sign out anything you don't recognise."
      actions={
        <>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={16} />} onClick={load}>
            Refresh
          </Button>
          <Button variant="danger" size="sm" icon={<LogOut size={16} />} loading={revokingOthers} disabled={revokingOthers || others === 0} onClick={() => setPending({ kind: 'others' })}>
            Sign out all other devices
          </Button>
        </>
      }
    >
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !sessions ? (
        <LoadingState label="Loading signed-in devices…" compact />
      ) : sessions.length === 0 ? (
        <EmptyState title="No active sessions." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sessions.map((s) => {
            const device = describeUserAgent(s.userAgent);
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${s.current ? 'var(--color-info-border)' : 'var(--border-subtle)'}`,
                  background: s.current ? 'var(--bg-pale)' : 'var(--bg-surface)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ color: s.current ? 'var(--color-primary)' : 'var(--text-secondary)', display: 'flex' }} aria-hidden="true">
                  {device.mobile ? <Smartphone size={20} /> : <Monitor size={20} />}
                </div>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', overflowWrap: 'anywhere' }} title={s.userAgent || undefined}>
                      {device.label}
                    </span>
                    {s.current && <Badge variant="info">This device</Badge>}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px', overflowWrap: 'anywhere' }}>
                    {s.ipAddress || 'Unknown IP'} · {describeAuthMethod(s.authMethod)} · Last active {formatRelative(s.lastSeenAt || s.createdAt)}
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                    Signed in {formatDateTime(s.createdAt)} · Expires {formatDateTime(s.expiresAt)}
                  </div>
                </div>
                {s.current ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<LogOut size={16} />}
                    onClick={() => {
                      logout();
                      navigate('/login');
                    }}
                  >
                    Sign out
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" icon={<LogOut size={16} />} loading={busyId === s.id} disabled={busyId !== null} onClick={() => setPending({ kind: 'one', session: s })}>
                    Sign out
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={pending !== null}
        onCancel={() => setPending(null)}
        title={pending?.kind === 'others' ? 'Sign out other devices?' : 'Sign out this device?'}
        tone="danger"
        confirmLabel="Sign out"
        onConfirm={() => {
          if (pending?.kind === 'one') revoke(pending.session);
          else if (pending?.kind === 'others') revokeOthers();
        }}
        message={
          pending?.kind === 'one'
            ? `${describeUserAgent(pending.session.userAgent).label}${pending.session.ipAddress ? ` (${pending.session.ipAddress})` : ''} will have to sign in again.`
            : 'Every other device signed in to your account will have to sign in again. You stay signed in here.'
        }
      />
    </Card>
  );
};

/** Personal account security: password, two-factor authentication and signed-in devices. */
export const AccountSecurityPage: React.FC = () => {
  const { mfaEnrollmentRequired, logout } = useApp();
  const navigate = useNavigate();
  const [sessionsReloadKey, setSessionsReloadKey] = useState(0);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '960px', width: '100%' }}>
      <PageHeader
        title="Account security"
        meta={<Badge variant="neutral" icon={<Shield size={12} aria-hidden="true" />}>Your account</Badge>}
        description="Manage your password, two-factor authentication and the devices signed in to your account."
      />

      {mfaEnrollmentRequired && (
        <div
          role="alert"
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            padding: '16px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-warning-border)',
            background: 'var(--color-warning-bg)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            lineHeight: 1.55,
          }}
        >
          <ShieldAlert size={20} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <strong>Two-factor authentication is required.</strong> Your organization requires administrators to use two-factor
            authentication. Set it up below to continue — the rest of the platform is unavailable until you do. Have an authenticator app
            (Google Authenticator, Microsoft Authenticator, 1Password…) ready on your phone.
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<LogOut size={16} />}
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Sign out
          </Button>
        </div>
      )}

      <TwoFactorCard autoStart={mfaEnrollmentRequired} />
      {!mfaEnrollmentRequired && <ChangePasswordCard onChanged={() => setSessionsReloadKey((k) => k + 1)} />}
      <SessionsCard reloadKey={sessionsReloadKey} />
    </div>
  );
};

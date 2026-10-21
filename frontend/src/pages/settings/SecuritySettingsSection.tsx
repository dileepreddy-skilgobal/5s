import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SectionBodyProps } from './SettingsSections';
import { Toggle, hintStyle } from './SettingsFields';

const callout = (tone: 'warning' | 'info'): React.CSSProperties => ({
  display: 'flex',
  gap: '10px',
  padding: '12px 16px',
  borderRadius: 'var(--radius-md)',
  border: `1px solid var(--color-${tone}-border)`,
  background: `var(--color-${tone}-bg)`,
  color: 'var(--text-primary)',
  fontSize: '13px',
  lineHeight: 1.55,
});

// --- Security ---
export const SecuritySection: React.FC<SectionBodyProps> = ({ draft, update }) => {
  const { mfaEnabled } = useApp();
  const required = draft.security?.requireMfaForAdmins === true;
  const [confirmOwnEnrolment, setConfirmOwnEnrolment] = useState(false);

  const applyRequired = (next: boolean) => {
    update((d) => {
      d.security = { ...(d.security || { requireMfaForAdmins: false }), requireMfaForAdmins: next };
    });
  };

  const setRequired = (next: boolean) => {
    if (next && !mfaEnabled) {
      setConfirmOwnEnrolment(true);
      return;
    }
    applyRequired(next);
  };

  return (
    <>
      <Toggle
        id="security-require-mfa"
        checked={required}
        onChange={setRequired}
        label="Require two-factor authentication for administrators"
        description="Organization administrators must sign in with an authenticator-app code in addition to their password."
      />
      <div style={callout('info')}>
        <ShieldCheck size={16} color="var(--color-info)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          When this is on, any administrator without two-factor authentication is stopped at their next request and taken to set it up
          before they can continue. Administrators who already use two-factor are not affected, and they cannot turn it off while the
          policy is on. Other roles are not affected. We recommend enrolling yourself first on{' '}
          <Link to="/account/security" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
            Account security
          </Link>
          .
        </div>
      </div>
      {!mfaEnabled && (
        <div role="alert" style={callout('warning')}>
          <AlertTriangle size={16} color="var(--color-warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>You have not set up two-factor authentication.</strong>{' '}
            {required
              ? 'After saving, you will have to enrol before you can use the rest of the platform.'
              : 'Set it up on Account security before requiring it for every administrator.'}
          </div>
        </div>
      )}
      <p style={hintStyle}>
        Lost-phone recovery: an administrator can reset a user's two-factor on the{' '}
        <Link to="/roles-permissions" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          Roles &amp; permissions
        </Link>{' '}
        page, under Users &amp; Sessions.
      </p>
      <ConfirmDialog
        isOpen={confirmOwnEnrolment}
        title="Turn on required two-factor?"
        message="You have not set up two-factor authentication yourself. Once this policy is saved you will be asked to enrol before you can do anything else. Turn it on anyway?"
        confirmLabel="Turn it on"
        onConfirm={() => {
          setConfirmOwnEnrolment(false);
          applyRequired(true);
        }}
        onCancel={() => setConfirmOwnEnrolment(false)}
      />
    </>
  );
};

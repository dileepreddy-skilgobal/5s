import React, { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../services/api';
import { areasApi } from '../../services/api-areas';
import { OrgNode, Role } from '../../types';
import { CreatedUser, ManagedUser } from '../../types/areas';
import { Modal } from '../../components/ui/Modal';
import { FormField } from '../../components/ui/FormField';
import { Button } from '../../components/ui/Button';
import { OrgNodeOptions, TIME_BOUND_ROLE_CODES, dayKey, endOfDayIso } from './AssignRoleModal';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN = /^\d{4,8}$/;

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  phone: string;
  roleCode: string;
  orgNodeId: string;
  roleValidUntil: string;
  badgeId: string;
  pin: string;
}

type FormErrors = Partial<Record<keyof FormState | 'form', string>>;

const emptyForm = (): FormState => ({
  firstName: '',
  lastName: '',
  email: '',
  jobTitle: '',
  department: '',
  phone: '',
  roleCode: '',
  orgNodeId: '',
  roleValidUntil: '',
  badgeId: '',
  pin: '',
});

const formFrom = (u: ManagedUser): FormState => ({
  ...emptyForm(),
  firstName: u.firstName ?? '',
  lastName: u.lastName ?? '',
  email: u.email,
  jobTitle: u.jobTitle ?? '',
  department: u.department ?? '',
  phone: u.phone ?? '',
  badgeId: u.badgeId ?? '',
});

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  roles: Role[];
  /** Edits this user; creates a new one when absent. */
  user?: ManagedUser | null;
  onCreated: (user: CreatedUser) => void;
  onUpdated: (user: ManagedUser) => void;
}

/**
 * Create a user (profile, initial role with optional unit scope and end date, optional badge and PIN) or edit a
 * user's profile and badge. Roles of existing users are managed with "Add role"; PINs with "Reset PIN".
 */
export const UserFormModal: React.FC<UserFormModalProps> = ({ isOpen, onClose, roles, user, onCreated, onUpdated }) => {
  const editing = !!user;
  const [form, setForm] = useState<FormState>(emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [orgNodes, setOrgNodes] = useState<OrgNode[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(user ? formFrom(user) : emptyForm());
    setErrors({});
    if (user) return;
    let cancelled = false;
    // Units for the initial role's scope; without them the role is organization-wide
    api.getOrgNodes().then((nodes) => !cancelled && setOrgNodes(nodes)).catch(() => !cancelled && setOrgNodes([]));
    return () => {
      cancelled = true;
    };
  }, [isOpen, user]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const assignableRoles = roles.filter((r) => r.code !== 'SUPER_ADMIN');
  const timeBound = TIME_BOUND_ROLE_CODES.includes(form.roleCode);

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!form.firstName.trim()) next.firstName = 'Enter the first name.';
    if (!form.lastName.trim()) next.lastName = 'Enter the last name.';
    if (!editing) {
      if (!form.email.trim()) next.email = 'Enter the email address.';
      else if (!EMAIL.test(form.email.trim())) next.email = 'Enter a valid email address.';
      if (timeBound && !form.roleValidUntil) next.roleValidUntil = 'External auditors need an end date.';
      else if (form.roleValidUntil && form.roleValidUntil < dayKey()) next.roleValidUntil = 'Choose today or a later date.';
      if (form.pin && !PIN.test(form.pin)) next.pin = 'The PIN must be 4 to 8 digits.';
      if (form.pin && !form.badgeId.trim()) next.badgeId = 'A PIN needs a badge ID.';
    }
    return next;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      if (user) {
        const updated = await areasApi.updateUser(user.id, {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          jobTitle: form.jobTitle.trim(),
          department: form.department.trim(),
          phone: form.phone.trim(),
          // An empty badge removes it (and with it PIN sign-in)
          badgeId: form.badgeId.trim(),
        });
        onUpdated(updated);
      } else {
        const created = await areasApi.createUser({
          email: form.email.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          jobTitle: form.jobTitle.trim() || undefined,
          department: form.department.trim() || undefined,
          phone: form.phone.trim() || undefined,
          roleCode: form.roleCode || undefined,
          orgNodeId: form.roleCode && form.orgNodeId ? form.orgNodeId : undefined,
          roleValidUntil: form.roleCode && form.roleValidUntil ? endOfDayIso(form.roleValidUntil) : undefined,
          badgeId: form.badgeId.trim() || undefined,
          pin: form.pin || undefined,
        });
        onCreated(created);
      }
    } catch (err) {
      setErrors({ form: getApiErrorMessage(err, editing ? 'The user could not be saved.' : 'The user could not be created.') });
    } finally {
      setBusy(false);
    }
  };

  const text = (key: keyof FormState, label: string, opts: { required?: boolean; type?: string; hint?: string; autoComplete?: string; disabled?: boolean } = {}) => (
    <FormField label={label} required={opts.required} error={errors[key]} hint={opts.hint} style={{ marginBottom: 0 }}>
      {(p) => (
        <input
          {...p}
          type={opts.type ?? 'text'}
          className="form-input"
          value={form[key]}
          autoComplete={opts.autoComplete ?? 'off'}
          disabled={opts.disabled}
          onChange={(e) => set(key, e.target.value)}
        />
      )}
    </FormField>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !busy && onClose()}
      title={editing ? 'Edit user' : 'New user'}
      subtitle={editing ? user?.email : 'The person gets a one-time password to sign in with; it is shown once after saving.'}
      maxWidth="640px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="submit" form="user-form" loading={busy}>{editing ? 'Save' : 'Create user'}</Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="grid-auto" style={{ ['--min' as string]: '200px', gap: '16px' } as React.CSSProperties}>
          {text('firstName', 'First name', { required: true, autoComplete: 'given-name' })}
          {text('lastName', 'Last name', { required: true, autoComplete: 'family-name' })}
        </div>
        {text('email', 'Email', { required: !editing, type: 'email', disabled: editing, hint: editing ? 'The sign-in email cannot be changed.' : undefined })}
        <div className="grid-auto" style={{ ['--min' as string]: '200px', gap: '16px' } as React.CSSProperties}>
          {text('jobTitle', 'Job title')}
          {text('department', 'Department')}
        </div>
        {text('phone', 'Phone', { type: 'tel', autoComplete: 'tel' })}

        {!editing && (
          <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 16px 16px', margin: 0, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
            <legend style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', padding: '0 4px' }}>Initial role</legend>
            <FormField label="Role" hint="More roles can be added later." style={{ marginBottom: 0 }}>
              {(p) => (
                <select {...p} className="form-select" value={form.roleCode} onChange={(e) => set('roleCode', e.target.value)}>
                  <option value="">No role yet</option>
                  {assignableRoles.map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}
                </select>
              )}
            </FormField>
            {form.roleCode && (
              <div className="grid-auto" style={{ ['--min' as string]: '200px', gap: '16px' } as React.CSSProperties}>
                <FormField label="Applies to" hint="Limit the role to one unit and everything under it." style={{ marginBottom: 0 }}>
                  {(p) => (
                    <select {...p} className="form-select" value={form.orgNodeId} onChange={(e) => set('orgNodeId', e.target.value)}>
                      <option value="">Whole organization</option>
                      <OrgNodeOptions nodes={orgNodes} />
                    </select>
                  )}
                </FormField>
                <FormField label="Valid until" required={timeBound} error={errors.roleValidUntil} hint={timeBound ? 'Required for external auditors.' : 'Optional.'} style={{ marginBottom: 0 }}>
                  {(p) => <input {...p} type="date" className="form-input" min={dayKey()} value={form.roleValidUntil} onChange={(e) => set('roleValidUntil', e.target.value)} />}
                </FormField>
              </div>
            )}
          </fieldset>
        )}

        <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 16px 16px', margin: 0, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <legend style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', padding: '0 4px' }}>Shop-floor sign-in (optional)</legend>
          <div className="grid-auto" style={{ ['--min' as string]: '200px', gap: '16px' } as React.CSSProperties}>
            {text('badgeId', 'Badge ID', { hint: editing ? 'Clear it to turn off PIN sign-in.' : 'Operators sign in with their badge and a PIN.' })}
            {!editing && (
              <FormField label="PIN" error={errors.pin} hint="4 to 8 digits. Stored encrypted and never shown again." style={{ marginBottom: 0 }}>
                {(p) => (
                  <input
                    {...p}
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    className="form-input"
                    value={form.pin}
                    maxLength={8}
                    onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))}
                  />
                )}
              </FormField>
            )}
          </div>
        </fieldset>

        {errors.form && <p role="alert" className="form-error" style={{ margin: 0 }}>{errors.form}</p>}
      </form>
    </Modal>
  );
};

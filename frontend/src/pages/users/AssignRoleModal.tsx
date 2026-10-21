import React, { useEffect, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../../services/api';
import { areasApi } from '../../services/api-areas';
import { OrgNode, Role } from '../../types';
import { ManagedUser } from '../../types/areas';
import { Modal } from '../../components/ui/Modal';
import { FormField } from '../../components/ui/FormField';
import { Button } from '../../components/ui/Button';

/** Roles that must always end on a date (external assessors get temporary access). */
export const TIME_BOUND_ROLE_CODES = ['EXTERNAL_AUDITOR'];

/** Local YYYY-MM-DD of today + offset days (for date inputs). */
export const dayKey = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** End of the chosen local day as an ISO timestamp, so "valid until 31 Dec" includes 31 Dec. */
export const endOfDayIso = (key: string) => new Date(`${key}T23:59:59`).toISOString();

export const userDisplayName = (u: Pick<ManagedUser, 'firstName' | 'lastName' | 'email'>) => `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;

/** Organization units indented by depth, for scope selects. */
export const OrgNodeOptions: React.FC<{ nodes: OrgNode[] }> = ({ nodes }) => (
  <>
    {[...nodes]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((n) => (
        <option key={n.id} value={n.id}>
          {'  '.repeat(Math.max(0, n.depth))}
          {n.name} ({n.code})
        </option>
      ))}
  </>
);

interface AssignRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: ManagedUser[];
  roles: Role[];
  /** Pre-selects (and keeps) this user. */
  initialUserId?: string;
  onAssigned: (message: string) => void;
}

/**
 * Grants a role, optionally limited to one organization unit (and everything under it) and with an end date.
 * The end date is required for external auditors; an expired role grants nothing.
 */
export const AssignRoleModal: React.FC<AssignRoleModalProps> = ({ isOpen, onClose, users, roles, initialUserId = '', onAssigned }) => {
  const [userId, setUserId] = useState(initialUserId);
  const [roleId, setRoleId] = useState('');
  const [orgNodeId, setOrgNodeId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [orgNodes, setOrgNodes] = useState<OrgNode[]>([]);
  const [nodesError, setNodesError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ user?: string; role?: string; validUntil?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setUserId(initialUserId);
    setRoleId('');
    setOrgNodeId('');
    setValidUntil('');
    setErrors({});
    let cancelled = false;
    api
      .getOrgNodes()
      .then((nodes) => {
        if (!cancelled) {
          setOrgNodes(nodes);
          setNodesError(null);
        }
      })
      .catch((err) => !cancelled && setNodesError(getApiErrorMessage(err, 'Organization units could not be loaded; the role can still apply to the whole organization.')));
    return () => {
      cancelled = true;
    };
  }, [isOpen, initialUserId]);

  // The platform super-admin role cannot be granted inside an organization
  const assignableRoles = useMemo(() => roles.filter((r) => r.code !== 'SUPER_ADMIN'), [roles]);
  const user = users.find((u) => u.id === userId);
  const role = roles.find((r) => r.id === roleId);
  const timeBound = !!role && TIME_BOUND_ROLE_CODES.includes(role.code);
  // Same role and same scope renews the existing assignment (its end date is replaced)
  const existing = user?.assignments.find((a) => a.roleId === roleId && (a.orgNodeId ?? '') === orgNodeId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!userId) next.user = 'Choose a user.';
    if (!roleId) next.role = 'Choose a role.';
    if (timeBound && !validUntil) next.validUntil = 'External auditors need an end date.';
    else if (validUntil && validUntil < dayKey()) next.validUntil = 'Choose today or a later date.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await areasApi.assignRole(userId, { roleId, orgNodeId: orgNodeId || undefined, validUntil: validUntil ? endOfDayIso(validUntil) : undefined });
      const scope = orgNodes.find((n) => n.id === orgNodeId);
      onAssigned(
        `${user ? userDisplayName(user) : 'The user'} ${existing ? 'keeps' : 'now has'} the ${role?.name ?? 'selected'} role${scope ? ` for ${scope.name}` : ''}${validUntil ? ` until ${validUntil}` : ''}.`,
      );
    } catch (err) {
      setErrors({ form: getApiErrorMessage(err, 'The role could not be assigned.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !busy && onClose()}
      title="Assign a role"
      subtitle="A person can hold several roles; their access is the combination."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="submit" form="assign-scoped-role-form" loading={busy}>{existing ? 'Update role' : 'Assign role'}</Button>
        </>
      }
    >
      <form id="assign-scoped-role-form" onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <FormField
          label="User"
          required
          error={errors.user}
          hint={user ? `Current roles: ${user.assignments.map((a) => a.role?.name).filter(Boolean).join(', ') || 'none'}` : undefined}
          style={{ marginBottom: 0 }}
        >
          {(p) => (
            <select {...p} className="form-select" value={userId} onChange={(e) => setUserId(e.target.value)} disabled={!!initialUserId}>
              <option value="">Choose a user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {userDisplayName(u)} ({u.email})
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField label="Role" required error={errors.role} style={{ marginBottom: 0 }}>
          {(p) => (
            <select {...p} className="form-select" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">Choose a role</option>
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}
        </FormField>

        <FormField
          label="Applies to"
          hint={nodesError ?? 'Limit the role to one plant, department or area and everything under it, or leave it organization-wide.'}
          style={{ marginBottom: 0 }}
        >
          {(p) => (
            <select {...p} className="form-select" value={orgNodeId} onChange={(e) => setOrgNodeId(e.target.value)}>
              <option value="">Whole organization</option>
              <OrgNodeOptions nodes={orgNodes} />
            </select>
          )}
        </FormField>

        <FormField
          label="Valid until"
          required={timeBound}
          error={errors.validUntil}
          hint={timeBound ? 'External auditors always get time-bound access.' : 'Optional. The role stops granting access after this day.'}
          style={{ marginBottom: 0 }}
        >
          {(p) => <input {...p} type="date" className="form-input" min={dayKey()} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} style={{ maxWidth: '220px' }} />}
        </FormField>

        {existing && (
          <p className="form-hint" style={{ margin: 0 }}>
            {user ? userDisplayName(user) : 'This user'} already has this role for this scope; saving replaces its end date.
          </p>
        )}
        {errors.form && <p role="alert" className="form-error" style={{ margin: 0 }}>{errors.form}</p>}
      </form>
    </Modal>
  );
};

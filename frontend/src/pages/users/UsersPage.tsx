import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { api, getApiErrorMessage } from '../../services/api';
import { areasApi } from '../../services/api-areas';
import { masterDataApi } from '../../services/masterDataApi';
import { Role, User } from '../../types';
import { CreatedUser, ManagedUser, ScopedAssignment } from '../../types/areas';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { FilterBar, FormField, SearchInput } from '../../components/ui/FormField';
import { SummaryCard, SummaryGrid } from '../../components/ui/SummaryCard';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { AssignRoleModal, userDisplayName } from './AssignRoleModal';
import { UserFormModal } from './UserFormModal';
import { RoleChip } from './RoleChip';
import { RowActionsMenu } from '../../components/ui/RowActionsMenu';
import { Users, UserPlus, UserCheck, UserX, Edit2, KeyRound, Trash2, Power, ShieldPlus, Copy } from 'lucide-react';

const STATUS_LABELS: Record<User['status'], string> = { ACTIVE: 'Active', INACTIVE: 'Inactive', INVITED: 'Invited' };
const statusVariant = (s: User['status']) => (s === 'ACTIVE' ? 'success' : s === 'INVITED' ? 'info' : 'neutral');
const PIN = /^\d{4,8}$/;

type PendingAction = { kind: 'deactivate' | 'reactivate' | 'delete'; user: ManagedUser };

/** User management for organization administrators: people, their roles (scoped and time-bound) and badge sign-in. */
export const UsersPage: React.FC = () => {
  const { currentTenant, currentUser, addToast, can } = useApp();
  const { formatDateTime } = useI18n();
  const canManage = can('ORG_ADMINS');

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | User['status']>('');

  const [formOpen, setFormOpen] = useState(false);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [created, setCreated] = useState<CreatedUser | null>(null);
  const [assignFor, setAssignFor] = useState<ManagedUser | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ user: ManagedUser; assignment: ScopedAssignment } | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [pinUser, setPinUser] = useState<ManagedUser | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [userList, roleList] = await Promise.all([areasApi.getUsers(), api.getRoles()]);
      setUsers(userList);
      setRoles(roleList);
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Users could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [currentTenant]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter && u.status !== statusFilter) return false;
      if (roleFilter && !u.assignments.some((a) => a.role?.code === roleFilter)) return false;
      if (!q) return true;
      return [u.firstName, u.lastName, u.email, u.jobTitle, u.department, u.badgeId].some((v) => v && v.toLowerCase().includes(q));
    });
  }, [users, search, roleFilter, statusFilter]);

  const counts = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.status === 'ACTIVE').length,
      inactive: users.filter((u) => u.status === 'INACTIVE').length,
      noRole: users.filter((u) => !u.assignments.some((a) => !a.expired && a.role?.code !== 'SUPER_ADMIN')).length,
    }),
    [users],
  );

  const filtersActive = !!(search || roleFilter || statusFilter);
  const clearFilters = () => {
    setSearch('');
    setRoleFilter('');
    setStatusFilter('');
  };

  const runPending = async () => {
    if (!pending) return;
    const { kind, user } = pending;
    setActionBusy(true);
    setActionError(null);
    try {
      if (kind === 'delete') {
        await areasApi.deleteUser(user.id);
        addToast({ type: 'success', title: 'User deleted', message: `${userDisplayName(user)} was removed. Records they created are kept.` });
      } else {
        await areasApi.updateUser(user.id, { status: kind === 'deactivate' ? 'INACTIVE' : 'ACTIVE' });
        addToast({
          type: 'success',
          title: kind === 'deactivate' ? 'User deactivated' : 'User reactivated',
          message: kind === 'deactivate' ? `${userDisplayName(user)} can no longer sign in.` : `${userDisplayName(user)} can sign in again.`,
        });
      }
      setPending(null);
      await load();
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'The change could not be saved.'));
    } finally {
      setActionBusy(false);
    }
  };

  const removeRole = async () => {
    if (!removeTarget) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await masterDataApi.removeUserRole(removeTarget.user.id, removeTarget.assignment.id);
      addToast({ type: 'success', title: 'Role removed', message: `${userDisplayName(removeTarget.user)} no longer has the ${removeTarget.assignment.role?.name ?? ''} role.` });
      setRemoveTarget(null);
      await load();
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'The role could not be removed.'));
    } finally {
      setActionBusy(false);
    }
  };

  const savePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinUser) return;
    if (!PIN.test(pin)) {
      setPinError('The PIN must be 4 to 8 digits.');
      return;
    }
    setActionBusy(true);
    setPinError(null);
    try {
      await areasApi.resetPin(pinUser.id, pin);
      addToast({ type: 'success', title: 'PIN reset', message: `Give ${userDisplayName(pinUser)} the new PIN in person.` });
      setPinUser(null);
      setPin('');
      await load();
    } catch (err) {
      setPinError(getApiErrorMessage(err, 'The PIN could not be reset.'));
    } finally {
      setActionBusy(false);
    }
  };

  const copyPassword = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast({ type: 'info', title: 'Copied', message: 'The one-time password is on the clipboard.' });
    } catch {
      addToast({ type: 'warning', title: 'Copy not available', message: 'Select the password and copy it manually.' });
    }
  };

  const roleOptions = roles.filter((r) => r.code !== 'SUPER_ADMIN');

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Users"
        description="People in this organization, their roles and shop-floor sign-in."
        actions={
          canManage ? (
            <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => { setEditUser(null); setFormOpen(true); }}>
              New user
            </Button>
          ) : undefined
        }
      />

      <SummaryGrid>
        <SummaryCard icon={<Users size={18} />} tone="primary" label="All users" value={counts.total} onClick={() => setStatusFilter('')} selected={!statusFilter} />
        <SummaryCard icon={<UserCheck size={18} />} tone="success" label="Active" value={counts.active} onClick={() => setStatusFilter('ACTIVE')} selected={statusFilter === 'ACTIVE'} />
        <SummaryCard icon={<UserX size={18} />} tone="neutral" label="Inactive" value={counts.inactive} onClick={() => setStatusFilter('INACTIVE')} selected={statusFilter === 'INACTIVE'} />
        <SummaryCard icon={<ShieldPlus size={18} />} tone="warning" label="Without a current role" value={counts.noRole} hint="No role, or only expired ones" />
      </SummaryGrid>

      <FilterBar label="Filter users">
        <SearchInput label="Search users" placeholder="Search by name, email, department or badge" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="form-select" aria-label="Role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {roleOptions.map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}
        </select>
        <select className="form-select" aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | User['status'])}>
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABELS) as User['status'][]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        {filtersActive && <Button variant="ghost" onClick={clearFilters} style={{ flex: '0 0 auto' }}>Clear filters</Button>}
      </FilterBar>

      <Card noPadding>
        {loading && users.length === 0 ? (
          <LoadingState label="Loading users…" />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title={filtersActive ? 'No users match these filters' : 'No users yet'}
            description={filtersActive ? 'Change or clear the filters.' : undefined}
            action={filtersActive ? <Button size="sm" variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        ) : (
          <div className="enterprise-table-container" aria-busy={loading}>
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Job title</th>
                  <th>Roles</th>
                  <th>Badge sign-in</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                  {canManage && <th style={{ textAlign: 'right', width: '1%' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const name = userDisplayName(u);
                  const assignments = u.assignments.filter((a) => a.role && a.role.code !== 'SUPER_ADMIN');
                  // Platform super admin accounts are managed only from the platform console
                  const manageable = canManage && (!u.isSuperAdmin || !!currentUser?.isSuperAdmin);
                  return (
                    <tr key={u.id}>
                      <td style={{ minWidth: '220px', maxWidth: '280px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {name}
                          {isSelf && <span style={{ marginLeft: '6px', fontSize: '12px', fontWeight: 400, color: 'var(--text-tertiary)' }}>(you)</span>}
                        </div>
                        <div title={u.email} style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                      </td>
                      <td style={{ minWidth: '180px' }}>
                        <div style={{ color: 'var(--text-primary)' }}>{u.jobTitle || '—'}</div>
                        {u.department && <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>{u.department}</div>}
                      </td>
                      <td style={{ minWidth: '240px' }}>
                        {assignments.length === 0 ? (
                          <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No role</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {assignments.map((a) => (
                              <RoleChip
                                key={a.id}
                                assignment={a}
                                userName={name}
                                onRemove={manageable ? () => { setActionError(null); setRemoveTarget({ user: u, assignment: a }); } : undefined}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {u.badgeId ? (
                          <>
                            <span className="code-tag">{u.badgeId}</span>
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{u.hasPin ? 'PIN set' : 'No PIN yet'}</div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td><Badge variant={statusVariant(u.status)}>{STATUS_LABELS[u.status] ?? u.status}</Badge></td>
                      <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</td>
                      {canManage && (
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {manageable ? (
                            <div className="row-actions">
                              <Button size="sm" variant="secondary" icon={<Edit2 size={16} />} onClick={() => { setEditUser(u); setFormOpen(true); }}>Edit</Button>
                              <RowActionsMenu
                                label={`More actions for ${name}`}
                                actions={[
                                  { label: 'Add role', icon: <ShieldPlus size={16} />, onSelect: () => setAssignFor(u) },
                                  ...(u.badgeId ? [{ label: 'Reset PIN', icon: <KeyRound size={16} />, onSelect: () => { setPin(''); setPinError(null); setPinUser(u); } }] : []),
                                  ...(!isSelf
                                    ? [
                                        {
                                          label: u.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate',
                                          icon: <Power size={16} />,
                                          onSelect: () => { setActionError(null); setPending({ kind: u.status === 'ACTIVE' ? 'deactivate' : 'reactivate', user: u }); },
                                        },
                                        { label: 'Delete user', icon: <Trash2 size={16} />, danger: true, separated: true, onSelect: () => { setActionError(null); setPending({ kind: 'delete', user: u }); } },
                                      ]
                                    : []),
                                ]}
                              />
                            </div>
                          ) : (
                            <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>Platform account</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <UserFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        roles={roles}
        user={editUser}
        onCreated={(u) => {
          setFormOpen(false);
          addToast({ type: 'success', title: 'User created', message: `${userDisplayName(u)} was added.` });
          if (u.temporaryPassword) setCreated(u);
          load();
        }}
        onUpdated={(u) => {
          setFormOpen(false);
          addToast({ type: 'success', title: 'User saved', message: userDisplayName(u) });
          load();
        }}
      />

      <AssignRoleModal
        isOpen={assignFor !== null}
        onClose={() => setAssignFor(null)}
        users={users}
        roles={roles}
        initialUserId={assignFor?.id}
        onAssigned={(message) => {
          setAssignFor(null);
          addToast({ type: 'success', title: 'Role assigned', message });
          load();
        }}
      />

      {/* One-time password of a new user: shown once, never stored in the browser */}
      <Modal
        isOpen={created !== null}
        onClose={() => setCreated(null)}
        title="One-time password"
        subtitle={created ? `${userDisplayName(created)} · ${created.email}` : undefined}
        footer={<Button variant="primary" onClick={() => setCreated(null)}>Done</Button>}
      >
        {created?.temporaryPassword && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Give this password to the person securely. It is shown only now; they should change it after signing in.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '15px', overflowWrap: 'anywhere', color: 'var(--text-primary)' }}>
                {created.temporaryPassword}
              </code>
              <Button size="sm" variant="secondary" icon={<Copy size={16} />} onClick={() => copyPassword(created.temporaryPassword ?? '')}>Copy</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reset PIN */}
      <Modal
        isOpen={pinUser !== null}
        onClose={() => !actionBusy && setPinUser(null)}
        title="Reset PIN"
        subtitle={pinUser ? `${userDisplayName(pinUser)} · badge ${pinUser.badgeId}` : undefined}
        maxWidth="440px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPinUser(null)} disabled={actionBusy}>Cancel</Button>
            <Button variant="primary" type="submit" form="reset-pin-form" loading={actionBusy}>Set PIN</Button>
          </>
        }
      >
        <form id="reset-pin-form" onSubmit={savePin} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <FormField label="New PIN" required error={pinError} hint="4 to 8 digits. Any sign-in lockout is cleared." style={{ marginBottom: 0 }}>
            {(p) => (
              <input
                {...p}
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                className="form-input"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                style={{ maxWidth: '200px' }}
              />
            )}
          </FormField>
        </form>
      </Modal>

      {/* Deactivate / reactivate / delete */}
      <ConfirmDialog
        isOpen={pending !== null}
        title={pending?.kind === 'delete' ? 'Delete user?' : pending?.kind === 'deactivate' ? 'Deactivate user?' : 'Reactivate user?'}
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : pending?.kind === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        tone={pending?.kind === 'reactivate' ? 'primary' : 'danger'}
        busy={actionBusy}
        onConfirm={runPending}
        onCancel={() => setPending(null)}
        message={
          <>
            {pending && <p style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontWeight: 600 }}>{userDisplayName(pending.user)} · <span style={{ fontWeight: 400 }}>{pending.user.email}</span></p>}
            {pending?.kind === 'delete'
              ? 'The account is removed and its email and badge can be reused. Audits, findings and actions the person recorded are kept; open actions assigned to them become unassigned and their areas lose this owner.'
              : pending?.kind === 'deactivate'
                ? 'The person is signed out everywhere and cannot sign in until reactivated. Their roles and records are kept.'
                : 'The person can sign in again with their existing roles.'}
            {actionError && <p role="alert" className="form-error" style={{ margin: '12px 0 0' }}>{actionError}</p>}
          </>
        }
      />

      {/* Remove role */}
      <ConfirmDialog
        isOpen={removeTarget !== null}
        title="Remove role?"
        confirmLabel="Remove role"
        tone="danger"
        busy={actionBusy}
        onConfirm={removeRole}
        onCancel={() => setRemoveTarget(null)}
        message={
          <>
            {removeTarget && (
              <p style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>
                <strong>{removeTarget.assignment.role?.name ?? ''}</strong>
                {removeTarget.assignment.orgNode ? ` (${removeTarget.assignment.orgNode.name})` : ''} for {userDisplayName(removeTarget.user)}
              </p>
            )}
            The change takes effect on the person's next request. Records they created stay unchanged.
            {actionError && <p role="alert" className="form-error" style={{ margin: '12px 0 0' }}>{actionError}</p>}
          </>
        }
      />
    </div>
  );
};

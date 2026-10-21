import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api, getApiErrorMessage } from '../../services/api';
import { masterDataApi, AccessMatrix } from '../../services/masterDataApi';
import { areasApi } from '../../services/api-areas';
import { Role, User } from '../../types';
import { ManagedUser, ScopedAssignment } from '../../types/areas';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { roleLabel } from '../../constants/roles';
import { useI18n } from '../../i18n';
import { AssignRoleModal } from '../users/AssignRoleModal';
import { RoleChip } from '../users/RoleChip';
import { Users, Shield, Check, UserPlus, AlertCircle, LogOut, ShieldOff, ShieldCheck as ShieldCheckIcon, Eye } from 'lucide-react';

/** First column of the access matrix stays in view while the role columns scroll sideways. */
const stickyCell: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-surface)', boxShadow: 'inset -1px 0 0 var(--border-subtle)' };

const initialsOf = (u: Pick<User, 'firstName' | 'lastName' | 'email'>) =>
  (`${(u.firstName || '').charAt(0)}${(u.lastName || '').charAt(0)}` || (u.email || '?').charAt(0)).toUpperCase();

const userName = (u: Pick<User, 'firstName' | 'lastName' | 'email'>) => `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;

export const RolesPermissionsPage: React.FC = () => {
  const { currentTenant, addToast, can, currentUser, logout } = useApp();
  const { formatDateTime } = useI18n();
  const navigate = useNavigate();
  const canManageUsers = can('ORG_ADMINS');

  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [matrix, setMatrix] = useState<AccessMatrix | null>(null);
  const [activeTab, setActiveTab] = useState<'matrix' | 'users'>('matrix');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Optional single-role view of the matrix; kept across reloads. */
  const [focusRole, setFocusRole] = useState('');

  // Per-user security actions (sign out everywhere / reset two-factor)
  const [pendingAction, setPendingAction] = useState<{ kind: 'revoke' | 'reset-mfa'; user: ManagedUser } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Assign (optionally scoped to a unit and time-bound) / remove roles
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [removeTarget, setRemoveTarget] = useState<{ user: ManagedUser; assignment: ScopedAssignment } | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [rolesData, usersData, matrixData] = await Promise.all([api.getRoles(), areasApi.getUsers(), masterDataApi.getAccessMatrix()]);
      setRoles(rolesData);
      setUsers(usersData);
      setMatrix(matrixData);
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Roles and users could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [currentTenant]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const matrixRoles = useMemo(
    () => (matrix?.roles ?? []).filter((r) => !focusRole || r.code === focusRole),
    [matrix, focusRole],
  );
  const modules = useMemo(() => {
    const byModule = new Map<string, AccessMatrix['rules']>();
    for (const rule of matrix?.rules ?? []) {
      byModule.set(rule.module, [...(byModule.get(rule.module) ?? []), rule]);
    }
    return Array.from(byModule.entries());
  }, [matrix]);

  const openAssign = (userId = '') => {
    setAssignUserId(userId);
    setAssignOpen(true);
  };

  const handleRemoveRole = async () => {
    if (!removeTarget) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await masterDataApi.removeUserRole(removeTarget.user.id, removeTarget.assignment.id);
      addToast({ type: 'success', title: 'Role removed', message: `${userName(removeTarget.user)} no longer has the ${removeTarget.assignment.role?.name ?? ''} role.` });
      setRemoveTarget(null);
      await loadData();
    } catch (err) {
      setRemoveError(getApiErrorMessage(err, 'The role could not be removed.'));
    } finally {
      setRemoveBusy(false);
    }
  };

  const runSecurityAction = async () => {
    if (!pendingAction) return;
    const { kind, user } = pendingAction;
    const name = userName(user);
    setActionBusy(true);
    try {
      if (kind === 'revoke') {
        const res = await api.revokeUserSessions(user.id);
        const n = Number(res?.sessionsRevoked) || 0;
        addToast({ type: 'success', title: 'Signed out everywhere', message: `${name}: ${n} session${n === 1 ? '' : 's'} signed out.` });
      } else {
        const res = await api.resetUserMfa(user.id);
        const n = Number(res?.sessionsRevoked) || 0;
        setUsers((prev) => prev.map((x) => (x.id === user.id ? { ...x, mfaEnabled: false } : x)));
        addToast({
          type: 'success',
          title: 'Two-factor reset',
          message: `${name} can sign in with their password and set up two-factor again. ${n} session${n === 1 ? '' : 's'} signed out.`,
        });
      }
      setPendingAction(null);
      // Both actions end every session of that user, including this one when acting on yourself
      if (user.id === currentUser?.id) {
        logout();
        navigate('/login');
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Action failed', message: getApiErrorMessage(err, 'Could not complete the action.') });
    } finally {
      setActionBusy(false);
    }
  };

  const statusVariant = (status?: User['status'] | string) => (status === 'ACTIVE' ? 'success' : status === 'INVITED' ? 'info' : 'neutral');
  const statusLabel = (status?: string) => (status === 'ACTIVE' ? 'Active' : status === 'INVITED' ? 'Invited' : status === 'INACTIVE' ? 'Inactive' : '—');

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Roles and access"
        description="What each role can do in this organization, and which roles each person has."
        actions={
          canManageUsers ? (
            <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => openAssign()} disabled={loading && users.length === 0}>
              Assign a role
            </Button>
          ) : undefined
        }
      />

      {!canManageUsers && (
        <div role="note" className="section-intro-banner" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
          <Eye size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span><strong style={{ color: 'var(--text-primary)' }}>View only.</strong> Organization administrators assign and remove roles.</span>
        </div>
      )}

      <Tabs
        tabs={[
          { id: 'matrix', label: 'Access by role', icon: <Shield size={16} /> },
          { id: 'users', label: 'People and roles', icon: <Users size={16} />, badge: users.length || undefined },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as 'matrix' | 'users')}
        ariaLabel="Roles and access sections"
      />

      {loading && !matrix ? (
        <Card><LoadingState label="Loading roles…" /></Card>
      ) : loadError ? (
        <Card><ErrorState message={loadError} onRetry={loadData} /></Card>
      ) : activeTab === 'matrix' ? (
        <Card
          title="Access by role"
          subtitle="Generated from the rules the system enforces. Access follows from a person's roles and cannot be edited here."
          actions={
            <select className="form-select" aria-label="Show role" value={focusRole} onChange={(e) => setFocusRole(e.target.value)} style={{ width: '220px', maxWidth: '100%' }}>
              <option value="">All roles</option>
              {(matrix?.roles ?? []).map((r) => (
                <option key={r.code} value={r.code}>{r.name || roleLabel(r.code)}</option>
              ))}
            </select>
          }
        >
          {matrix && matrix.notes.length > 0 && (
            <div className="quick-tip-card" style={{ marginBottom: '16px', display: 'block' }}>
              <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.6 }}>
                {matrix.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </div>
          )}
          {modules.length === 0 ? (
            <EmptyState title="No access rules found" />
          ) : (
            <div className="enterprise-table-container">
              <table className="enterprise-table">
                <caption className="sr-only">Actions each role may perform</caption>
                <thead>
                  <tr>
                    <th scope="col" style={{ ...stickyCell, background: 'var(--bg-surface-subtle)', zIndex: 2, minWidth: '220px' }}>Action</th>
                    {matrixRoles.map((r) => (
                      <th key={r.code} scope="col" style={{ textAlign: 'center', whiteSpace: 'nowrap', minWidth: '110px' }}>{r.name || roleLabel(r.code)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modules.map(([module, rules]) => (
                    <React.Fragment key={module}>
                      <tr>
                        <th scope="colgroup" colSpan={matrixRoles.length + 1} style={{ background: 'var(--bg-pale)', fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', textAlign: 'left', padding: 0 }}>
                          {/* Kept in view while the role columns scroll sideways */}
                          <span style={{ position: 'sticky', left: 0, display: 'inline-block', padding: '8px 16px' }}>{module}</span>
                        </th>
                      </tr>
                      {rules.map((rule) => (
                        <tr key={rule.group}>
                          <th scope="row" style={{ ...stickyCell, fontWeight: 500, fontSize: '14px', color: 'var(--text-primary)', textAlign: 'left', whiteSpace: 'normal', minWidth: '220px' }}>{rule.action}</th>
                          {matrixRoles.map((r) => {
                            const allowed = rule.roles.includes(r.code);
                            return (
                              <td key={r.code} style={{ textAlign: 'center' }}>
                                {allowed ? (
                                  <span
                                    title="Allowed"
                                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: 'var(--radius-full)', background: 'var(--color-success-bg)', color: 'var(--color-success)' }}
                                  >
                                    <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                                    <span className="sr-only">Allowed</span>
                                  </span>
                                ) : (
                                  <span title="Not allowed" style={{ color: 'var(--text-tertiary)' }}>
                                    <span aria-hidden="true">–</span>
                                    <span className="sr-only">Not allowed</span>
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card
          title="People and roles"
          subtitle={canManageUsers ? 'Assign or remove roles, sign a person out of every device, or reset their two-factor enrolment.' : 'People in this organization and their roles.'}
        >
          {users.length === 0 ? (
            <EmptyState title="No users found" />
          ) : (
            <div className="enterprise-table-container">
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th>2FA</th>
                    <th>Last sign-in</th>
                    {canManageUsers && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const assignments = (u.assignments ?? []).filter((a) => a?.role && a.role.code !== 'SUPER_ADMIN');
                    return (
                      <tr key={u.id}>
                        <td style={{ minWidth: '220px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <span
                              aria-hidden="true"
                              style={{ width: '32px', height: '32px', flexShrink: 0, borderRadius: 'var(--radius-full)', background: 'var(--color-primary)', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600 }}
                            >
                              {initialsOf(u)}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {u.firstName} {u.lastName}
                                {u.id === currentUser?.id && <span style={{ marginLeft: '6px', fontSize: '12px', fontWeight: 400, color: 'var(--text-tertiary)' }}>(you)</span>}
                              </div>
                              <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', overflowWrap: 'anywhere' }}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {assignments.length === 0 ? (
                            <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No role</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {assignments.map((a) => (
                                <RoleChip
                                  key={a.id}
                                  assignment={a}
                                  userName={userName(u)}
                                  onRemove={canManageUsers ? () => { setRemoveError(null); setRemoveTarget({ user: u, assignment: a }); } : undefined}
                                />
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          <Badge variant={statusVariant(u.status)}>{statusLabel(u.status)}</Badge>
                        </td>
                        <td>
                          {u.mfaEnabled === true ? (
                            <Badge variant="success" icon={<ShieldCheckIcon size={12} />}>On</Badge>
                          ) : u.mfaEnabled === false ? (
                            <Badge variant="neutral">Off</Badge>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                          )}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                        </td>
                        {canManageUsers && (
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <Button variant="secondary" size="sm" icon={<UserPlus size={16} />} onClick={() => openAssign(u.id)}>
                                Add role
                              </Button>
                              <Button variant="secondary" size="sm" icon={<LogOut size={16} />} onClick={() => setPendingAction({ kind: 'revoke', user: u })}>
                                Sign out everywhere
                              </Button>
                              {/* Only meaningful when the user has two-factor on (GET /users reports mfaEnabled) */}
                              {u.mfaEnabled === true && (
                                <Button variant="secondary" size="sm" icon={<ShieldOff size={16} />} onClick={() => setPendingAction({ kind: 'reset-mfa', user: u })}>
                                  Reset two-factor
                                </Button>
                              )}
                            </div>
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
      )}

      {/* Confirm per-user security action */}
      <ConfirmDialog
        isOpen={pendingAction !== null}
        title={pendingAction?.kind === 'reset-mfa' ? 'Reset two-factor authentication?' : 'Sign out everywhere?'}
        confirmLabel={pendingAction?.kind === 'reset-mfa' ? 'Reset two-factor' : 'Sign out everywhere'}
        tone="danger"
        busy={actionBusy}
        onConfirm={runSecurityAction}
        onCancel={() => setPendingAction(null)}
        message={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pendingAction && (
              <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 600 }}>
                {userName(pendingAction.user)} · <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>{pendingAction.user.email}</span>
              </p>
            )}
            {pendingAction?.kind === 'reset-mfa' ? (
              <p style={{ margin: 0 }}>
                This removes the user's authenticator enrolment and recovery codes and signs them out of every device. Use it when they have
                lost their phone. They can then sign in with their password only and set up two-factor again (administrators are asked to
                re-enrol straight away if your organization requires it).
              </p>
            ) : (
              <p style={{ margin: 0 }}>
                Every device and browser where this user is signed in will be signed out immediately. Their password and two-factor settings
                are not changed.
              </p>
            )}
            {pendingAction?.user.id === currentUser?.id && (
              <div
                role="alert"
                style={{ display: 'flex', gap: '8px', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-warning-border)', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600 }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
                This is your own account — you will be signed out of this browser too.
              </div>
            )}
          </div>
        }
      />

      {/* Remove role */}
      <ConfirmDialog
        isOpen={removeTarget !== null}
        title="Remove role?"
        confirmLabel="Remove role"
        tone="danger"
        busy={removeBusy}
        onConfirm={handleRemoveRole}
        onCancel={() => setRemoveTarget(null)}
        message={
          <>
            {removeTarget && (
              <p style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>
                <strong>{removeTarget.assignment.role?.name ?? ''}</strong>
                {removeTarget.assignment.orgNode ? ` (${removeTarget.assignment.orgNode.name})` : ''} for {userName(removeTarget.user)}
              </p>
            )}
            The change takes effect on the person's next request. Records they created stay unchanged.
            {removeError && <p role="alert" className="form-error" style={{ margin: '12px 0 0' }}>{removeError}</p>}
          </>
        }
      />

      {/* Assign role (optionally limited to a unit and with an end date) */}
      <AssignRoleModal
        isOpen={assignOpen}
        onClose={() => setAssignOpen(false)}
        users={users}
        roles={roles}
        initialUserId={assignUserId || undefined}
        onAssigned={async (message) => {
          setAssignOpen(false);
          addToast({ type: 'success', title: 'Role assigned', message });
          await loadData();
        }}
      />
    </div>
  );
};

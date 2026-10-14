import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Role, User } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import {
  Users,
  Shield,
  Check,
  Save,
  UserPlus,
  Lock,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';

export const RolesPermissionsPage: React.FC = () => {
  const { currentTenant, addToast } = useApp();
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [activeTab, setActiveTab] = useState<'matrix' | 'users'>('matrix');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modals
  const [assignUserModalOpen, setAssignUserModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assignRoleId, setAssignRoleId] = useState('');

  // Permission Matrix state for selected role: Map<module, Set<action>>
  const [permissionMap, setPermissionMap] = useState<{ [module: string]: string[] }>({});

  const modules = [
    { key: 'TENANTS', label: 'Tenant Administration', desc: 'Manage organization settings and subscriptions' },
    { key: 'USERS', label: 'User & RBAC Governance', desc: 'Create users, assign roles and permissions' },
    { key: 'ORGANIZATION', label: 'Organization Hierarchy', desc: 'Maintain plant, department and workstation nodes' },
    { key: 'LOCATIONS', label: 'Location & Area Master', desc: 'Manage 5S areas, QR codes, and timelines' },
    { key: 'STANDARDS', label: '5S Standards & SOPs', desc: 'Author visual standards, photos and procedures' },
    { key: 'AUDITS', label: 'Audit Execution & Scoring', desc: 'Schedule, conduct, and score mobile 5S audits' },
    { key: 'OBSERVATIONS', label: 'Abnormalities & Findings', desc: 'Log non-conformances with photographic evidence' },
    { key: 'ACTIONS', label: 'CAPA Corrective Actions', desc: 'Workflow progression, SLA resolution and verification' },
    { key: 'RED_TAGS', label: 'Red Tag Management', desc: 'Quarantine sorting, appraisal and disposition' },
    { key: 'REPORTS', label: 'Reporting & Export', desc: 'Export PDF, Excel and compliance registers' },
    { key: 'ANALYTICS', label: 'Dashboards & Heat Maps', desc: 'Access plant heat maps, trends and maturity grading' },
  ];

  const actions = [
    { key: 'CREATE', label: 'Create' },
    { key: 'READ', label: 'Read' },
    { key: 'UPDATE', label: 'Update' },
    { key: 'DELETE', label: 'Delete' },
    { key: 'APPROVE', label: 'Approve' },
    { key: 'CLOSE', label: 'Close' },
    { key: 'EXPORT', label: 'Export' },
  ];

  const loadData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const [rolesData, usersData] = await Promise.all([
        api.getRoles(),
        api.getUsers(),
      ]);
      setRoles(rolesData);
      setUsers(usersData);
      if (rolesData.length > 0) {
        const initial = rolesData.find((r) => r.code === 'ORG_ADMIN') || rolesData[0];
        handleSelectRole(initial);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentTenant]);

  const handleSelectRole = (role: Role) => {
    setSelectedRole(role);
    const map: { [module: string]: string[] } = {};

    if (role.permissions) {
      for (const p of role.permissions) {
        try {
          map[p.module] = JSON.parse(p.actions);
        } catch (e) {
          map[p.module] = [];
        }
      }
    }
    setPermissionMap(map);
  };

  const togglePermission = (moduleKey: string, actionKey: string) => {
    const currentActions = permissionMap[moduleKey] || [];
    let updated: string[];
    if (currentActions.includes(actionKey)) {
      updated = currentActions.filter((a) => a !== actionKey);
    } else {
      updated = [...currentActions, actionKey];
    }
    setPermissionMap({
      ...permissionMap,
      [moduleKey]: updated,
    });
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      const payload = Object.entries(permissionMap).map(([module, actList]) => ({
        module,
        actions: actList,
        scope: selectedRole.code === 'SUPER_ADMIN' || selectedRole.code === 'ORG_ADMIN' ? 'TENANT' : 'PLANT',
      }));

      await api.updateRolePermissions(selectedRole.id, payload);
      addToast({
        type: 'success',
        title: 'Permissions Saved',
        message: `RBAC permission matrix updated for role '${selectedRole.name}'.`,
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: err?.response?.data?.message || 'Could not update role permissions.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAssignRole = async () => {
    if (!selectedUserId || !assignRoleId) return;
    try {
      await api.assignRole(selectedUserId, assignRoleId);
      addToast({
        type: 'success',
        title: 'Role Assigned',
        message: 'User role assignment updated successfully.',
      });
      setAssignUserModalOpen(false);
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Assignment Failed',
        message: err?.response?.data?.message || 'Could not assign role.',
      });
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="page-title">Roles & Access Control (RBAC) Matrix</h1>
            <Badge variant="purple" icon={<Shield size={12} />}>Security & Governance</Badge>
          </div>
          <p className="page-subtitle">
            Configure granular permissions across transactions, modules, and geographic scopes for enterprise roles.
          </p>
        </div>
        <div className="page-header-actions">
          <Button
            variant="secondary"
            icon={<UserPlus size={16} />}
            onClick={() => setAssignUserModalOpen(true)}
          >
            Assign Role to User
          </Button>
          <Button
            variant="primary"
            icon={<Save size={16} />}
            loading={saving}
            onClick={handleSavePermissions}
          >
            Save Permission Matrix
          </Button>
        </div>
      </div>

      {/* Main Grid: Role Selector + Permission Matrix */}
      <div className="grid grid-cols-4 gap-6">
        {/* Left 1 Col: Role Cards */}
        <div>
          <Card title="Enterprise Roles" subtitle="9 Standard 5S Personas">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {roles.map((r) => {
                const isSelected = selectedRole?.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => handleSelectRole(r)}
                    style={{
                      padding: '12px',
                      borderRadius: 'var(--radius-md)',
                      background: isSelected ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                      border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: isSelected ? 700 : 600, fontSize: '13px', color: isSelected ? 'var(--color-primary)' : 'var(--text-primary)' }}>
                        {r.name}
                      </span>
                      {r.isSystemDefault && (
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>System</span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
                      {r.description}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right 3 Cols: Interactive Matrix Grid */}
        <div style={{ gridColumn: 'span 3' }}>
          <Card
            title={`Permission Matrix: ${selectedRole?.name || 'Select a Role'}`}
            subtitle="Grant or restrict Create, Read, Update, Delete, Approve, and Export operations per module"
          >
            <div className="enterprise-table-container">
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th style={{ width: '280px' }}>Module & Functional Scope</th>
                    {actions.map((act) => (
                      <th key={act.key} style={{ textAlign: 'center' }}>{act.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modules.map((mod) => {
                    const grantedActions = permissionMap[mod.key] || [];

                    return (
                      <tr key={mod.key}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{mod.label}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{mod.desc}</div>
                        </td>

                        {actions.map((act) => {
                          const isChecked = grantedActions.includes(act.key);
                          const isSuperAdminRole = selectedRole?.code === 'SUPER_ADMIN';

                          return (
                            <td key={act.key} style={{ textAlign: 'center' }}>
                              <button
                                onClick={() => !isSuperAdminRole && togglePermission(mod.key, act.key)}
                                disabled={isSuperAdminRole}
                                style={{
                                  background: isChecked ? 'var(--color-primary)' : 'var(--bg-surface-subtle)',
                                  border: isChecked ? '1px solid var(--color-primary)' : '1px solid var(--border-strong)',
                                  borderRadius: 'var(--radius-xs)',
                                  width: '20px',
                                  height: '20px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: isSuperAdminRole ? 'not-allowed' : 'pointer',
                                  color: '#FFFFFF',
                                  transition: 'all var(--transition-fast)',
                                }}
                              >
                                {isChecked && <Check size={14} strokeWidth={3} />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {/* Assign Role Modal */}
      <Modal
        isOpen={assignUserModalOpen}
        onClose={() => setAssignUserModalOpen(false)}
        title="Assign Enterprise Role to User"
        subtitle="Grants functional privileges to a member within the active organization"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignUserModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAssignRole}>Assign Role</Button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Select User <span className="required">*</span></label>
          <select
            className="form-select"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">-- Choose User --</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName} ({u.email}) - {u.jobTitle || 'Team Member'}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Select Target Role <span className="required">*</span></label>
          <select
            className="form-select"
            value={assignRoleId}
            onChange={(e) => setAssignRoleId(e.target.value)}
          >
            <option value="">-- Choose Role --</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        </div>
      </Modal>
    </div>
  );
};

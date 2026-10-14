import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  Building2,
  ChevronDown,
  Sun,
  Moon,
  Shield,
  Bell,
  Search,
  Check,
  UserCheck,
  LogOut,
  User as UserIcon,
  BadgeCheck,
} from 'lucide-react';

export const TopNavbar: React.FC = () => {
  const {
    currentTenant,
    tenants,
    setCurrentTenant,
    theme,
    toggleTheme,
    activeUserRole,
    setActiveUserRole,
    currentUser,
    logout,
  } = useApp();

  const navigate = useNavigate();
  const [tenantDropdownOpen, setTenantDropdownOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const roles = [
    { code: 'SUPER_ADMIN', label: 'Super Admin (Vikram Malhotra)', color: '#ef4444', path: '/super-admin', subtitle: 'Platform Governance & Tenants' },
    { code: 'ORG_ADMIN', label: 'Org Admin (Pooja Sharma)', color: '#6366f1', path: '/organization', subtitle: 'Full Organization & Masters' },
    { code: 'PLANT_HEAD', label: 'Plant Head (Rajesh Kumar)', color: '#3b82f6', path: '/analytics', subtitle: 'Plant KPIs & Heatmaps' },
    { code: 'COORDINATOR_5S', label: '5S Coordinator (Sneha Reddy)', color: '#8b5cf6', path: '/schedules', subtitle: 'Schedules & Red Tag Hub' },
    { code: 'AREA_OWNER', label: 'Area Owner (Arun Patel)', color: '#f59e0b', path: '/area-owner-hub', subtitle: 'Workstation Hub & Defect Rectification' },
    { code: 'AUDITOR', label: 'Auditor (Amit Joshi)', color: '#10b981', path: '/auditor-hub', subtitle: 'Auditor Review & Desk Workspace' },
    { code: 'DEPT_HEAD', label: 'Dept Head (Suresh Menon)', color: '#a855f7', path: '/locations', subtitle: 'RCA & CAPA Approvals' },
  ];

  const availableRoles = roles;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getInitials = (name?: string) => {
    if (!name) return '5S';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const activeRoleObj = availableRoles.find((r) => r.code === activeUserRole) || availableRoles[0];

  const handleRoleChange = (roleItem: typeof roles[0]) => {
    setActiveUserRole(roleItem.code);
    setRoleDropdownOpen(false);
    navigate(roleItem.path);
  };


  return (
    <header
      className="app-topbar"
      style={{
        height: 'var(--navbar-height)',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Left: Tenant Switcher & Global Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setTenantDropdownOpen(!tenantDropdownOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 12px',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >
            {currentTenant?.logoUrl ? (
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: 'var(--radius-sm)',
                  background: '#FFFFFF',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <img
                  src={currentTenant.logoUrl}
                  alt={currentTenant.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
            ) : (
              <Building2 size={16} color="var(--color-primary)" />
            )}
            <div style={{ textAlign: 'left' }}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  maxWidth: '200px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {currentTenant?.name || 'Select Tenant'}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                {currentTenant?.status || 'Tenant'}
              </div>
            </div>
            <ChevronDown size={14} color="var(--text-tertiary)" />
          </button>

          {tenantDropdownOpen && (
            <div
              className="animate-fade-in"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '6px',
                width: '300px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 200,
                padding: '6px',
              }}
            >
              <div
                style={{
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                }}
              >
                Switch Organization Tenant
              </div>
              {tenants.map((t) => (
                <div
                  key={t.id}
                  onClick={() => {
                    setCurrentTenant(t);
                    setTenantDropdownOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: currentTenant?.id === t.id ? 'var(--color-primary-light)' : 'transparent',
                    color: currentTenant?.id === t.id ? 'var(--color-primary)' : 'var(--text-primary)',
                    fontSize: '13px',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    {t.logoUrl ? (
                      <div
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: 'var(--radius-sm)',
                          background: '#FFFFFF',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '2px',
                          overflow: 'hidden',
                          flexShrink: 0,
                        }}
                      >
                        <img
                          src={t.logoUrl}
                          alt={t.name}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      </div>
                    ) : (
                      <Building2 size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                    )}
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{t.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{t.industry}</div>
                    </div>
                  </div>
                  {currentTenant?.id === t.id && <Check size={14} style={{ flexShrink: 0 }} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Search Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 12px',
            width: '280px',
          }}
        >
          <Search size={14} color="var(--text-tertiary)" />
          <input
            type="text"
            placeholder="Search areas, SOPs, users (Ctrl + K)..."
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '12px',
              color: 'var(--text-primary)',
              width: '100%',
            }}
          />
        </div>
      </div>

      {/* Right: Role Persona Switcher, Theme Toggle, Profile Menu, Logout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Persona Switcher */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: '12px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: activeRoleObj.color,
                boxShadow: `0 0 6px ${activeRoleObj.color}`,
              }}
            />
            <UserCheck size={14} color={activeRoleObj.color} />
            <span>
              Role: <strong>{activeRoleObj.label.split(' ')[0]}</strong>
            </span>
            <ChevronDown size={12} color="var(--text-tertiary)" />
          </button>

          {roleDropdownOpen && (
            <div
              className="animate-fade-in"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '6px',
                width: '280px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 200,
                padding: '6px',
              }}
            >
              <div
                style={{
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid var(--border-subtle)',
                  marginBottom: '4px',
                }}
              >
                Switch Role View & Workspace
              </div>
              {availableRoles.map((r) => (
                <div
                  key={r.code}
                  onClick={() => handleRoleChange(r)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: activeUserRole === r.code ? 600 : 400,
                    background: activeUserRole === r.code ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    if (activeUserRole !== r.code) e.currentTarget.style.background = 'var(--bg-surface-subtle)';
                  }}
                  onMouseLeave={(e) => {
                    if (activeUserRole !== r.code) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: r.color,
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.label}</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>{r.subtitle}</div>
                    </div>
                  </div>
                  {activeUserRole === r.code && <Check size={14} color="var(--color-primary)" />}
                </div>
              ))}
            </div>
          )}
        </div>


        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title="Toggle Light/Dark Theme"
          style={{
            background: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '8px',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        {/* User Badge & Profile Menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 8px',
              background: userMenuOpen ? 'var(--bg-surface-subtle)' : 'transparent',
              border: '1px solid',
              borderColor: userMenuOpen ? 'var(--border-subtle)' : 'transparent',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-full)',
                background: 'linear-gradient(135deg, var(--color-primary) 0%, #1d4ed8 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '12px',
                boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
              }}
            >
              {getInitials(currentUser?.fullName)}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {currentUser?.fullName || 'Pooja Sharma'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.2 }}>
                {currentUser?.jobTitle || 'Administrator'}
              </div>
            </div>
            <ChevronDown size={14} color="var(--text-tertiary)" />
          </button>

          {userMenuOpen && (
            <div
              className="animate-fade-in"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '8px',
                width: '260px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-xl)',
                zIndex: 200,
                padding: '12px',
              }}
            >
              <div style={{ paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                    {currentUser?.fullName || 'Pooja Sharma'}
                  </span>
                  <BadgeCheck size={16} color="var(--color-primary)" />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {currentUser?.email || 'admin@skilglobal.com'}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'var(--color-primary-light)',
                      color: 'var(--color-primary)',
                      fontWeight: 600,
                    }}
                  >
                    {currentUser?.roleCode || activeUserRole}
                  </span>
                  {currentUser?.employeeId && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'var(--bg-surface-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      ID: {currentUser.employeeId}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Organization: <strong style={{ color: 'var(--text-primary)' }}>{currentTenant?.name}</strong>
                </div>

                <button
                  onClick={handleLogout}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '9px 12px',
                    marginTop: '6px',
                    border: '1px solid var(--color-danger-border, #fecaca)',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(239, 68, 68, 0.06)',
                    color: 'var(--color-danger, #ef4444)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.14)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.06)';
                  }}
                >
                  <LogOut size={15} />
                  <span>Sign Out Session</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};


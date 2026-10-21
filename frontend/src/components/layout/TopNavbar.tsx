import React, { useEffect, useRef, useState } from 'react';
import { ROLES } from '../../constants/roles';
import { useNavigate } from 'react-router-dom';
import { useApp, getAvailableRoles } from '../../context/AppContext';
import {
  Building2,
  ChevronDown,
  Sun,
  Moon,
  Check,
  LogOut,
  BadgeCheck,
  ShieldCheck,
  ShieldAlert,
  Languages,
  Menu,
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { GlobalSearch } from './GlobalSearch';
import { LOCALE_OPTIONS, useI18n } from '../../i18n';

/** Closes a dropdown on outside click or Escape (Escape also returns focus to its trigger). */
const useDismiss = (
  open: boolean,
  close: () => void,
  wrapperRef: React.RefObject<HTMLDivElement>,
  triggerRef: React.RefObject<HTMLButtonElement>,
) => {
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, wrapperRef, triggerRef]);
};

/** True while the viewport is at most `px` wide (re-evaluated on resize). */
const useMaxWidth = (px: number) => {
  const query = `(max-width: ${px}px)`;
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
  width: '100%',
  padding: '8px 10px',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontSize: '13px',
  textAlign: 'left',
  fontFamily: 'inherit',
};

export const TopNavbar: React.FC<{ onMenuClick?: () => void }> = ({ onMenuClick }) => {
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
    mfaEnabled,
    mfaEnrollmentRequired,
  } = useApp();

  const { t, locale, userLocale, setLocale, savingLocale } = useI18n();
  const navigate = useNavigate();
  const [tenantDropdownOpen, setTenantDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const tenantRef = useRef<HTMLDivElement>(null);
  const tenantTriggerRef = useRef<HTMLButtonElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const userTriggerRef = useRef<HTMLButtonElement>(null);
  // Stable closers so the dismiss listeners are not re-registered on every render
  const [closeTenant] = useState(() => () => setTenantDropdownOpen(false));
  const [closeUser] = useState(() => () => setUserMenuOpen(false));
  useDismiss(tenantDropdownOpen, closeTenant, tenantRef, tenantTriggerRef);
  useDismiss(userMenuOpen, closeUser, userRef, userTriggerRef);

  const roles = ROLES.map((r) => ({ ...r, path: r.homePath }));

  // Only roles the signed-in user actually holds can be selected as a workspace view
  const ownRoleCodes = currentUser ? getAvailableRoles(currentUser) : [];
  const availableRoles = roles.filter((r) => ownRoleCodes.includes(r.code));
  const canSwitchRole = availableRoles.length > 1;
  const canSwitchTenant = currentUser?.isSuperAdmin === true && tenants.length > 0;
  // The top-bar organization switcher is hidden on phones (styles: .topbar-tenant at 480px), so the profile menu offers it there
  const tenantSwitchInProfileMenu = useMaxWidth(480) && canSwitchTenant;

  const handleLogout = () => {
    setUserMenuOpen(false);
    logout();
    navigate('/login');
  };

  // "SkilGlobal Precision Manufacturing Ltd" → "SP" (company suffixes ignored)
  const orgInitials = (name?: string) => {
    const words = (name || '').split(/\s+/).filter((w) => w && !/^(ltd|limited|inc|llc|pvt|plc|co|corp)\.?$/i.test(w));
    return words.length ? words.slice(0, 2).map((w) => w[0]).join('').toUpperCase() : '5S';
  };
  const sentence = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

  const getInitials = (name?: string) => {
    if (!name) return '5S';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const activeRoleObj =
    roles.find((r) => r.code === activeUserRole) ||
    { code: activeUserRole, label: activeUserRole || t('topbar.user'), color: '#64748b', path: '/', subtitle: '' };

  const handleRoleChange = (roleItem: typeof roles[0]) => {
    setActiveUserRole(roleItem.code);
    setUserMenuOpen(false);
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
      {/* Left: menu button (narrow screens), Tenant Switcher & Global Search */}
      <div className="topbar-group" style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
        <button type="button" className="app-menu-button btn btn-ghost btn-sm" onClick={onMenuClick} aria-label={t('common.openMenu')}>
          <Menu size={20} />
        </button>
        <div ref={tenantRef} className="topbar-tenant" style={{ position: 'relative', minWidth: 0 }}>
          <button
            ref={tenantTriggerRef}
            type="button"
            onClick={() => canSwitchTenant && setTenantDropdownOpen(!tenantDropdownOpen)}
            disabled={!canSwitchTenant}
            title={currentTenant?.name}
            aria-label={canSwitchTenant ? `${t('topbar.switchTenant')}: ${currentTenant?.name ?? t('topbar.selectTenant')}` : undefined}
            aria-haspopup={canSwitchTenant ? 'menu' : undefined}
            aria-expanded={canSwitchTenant ? tenantDropdownOpen : undefined}
            className="topbar-org"
            style={{ cursor: canSwitchTenant ? 'pointer' : 'default' }}
          >
            {/* Organization mark: its logo, or its initials on a white tile */}
            <span className="topbar-org-mark" aria-hidden="true">
              {currentTenant?.logoUrl ? (
                <img src={currentTenant.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                orgInitials(currentTenant?.name)
              )}
            </span>
            <span className="topbar-collapsible topbar-org-text">
              <span className="topbar-org-name">{currentTenant?.name || t('topbar.selectTenant')}</span>
              {/* Status only when it needs attention; an active organization is the normal case */}
              {currentTenant?.status && currentTenant.status !== 'ACTIVE' && (
                <span className={`topbar-org-status topbar-org-status-${currentTenant.status.toLowerCase()}`}>{sentence(currentTenant.status)}</span>
              )}
            </span>
            {canSwitchTenant && <ChevronDown size={16} className="topbar-org-chevron" aria-hidden="true" />}
          </button>

          {canSwitchTenant && tenantDropdownOpen && (
            <div
              className="animate-fade-in"
              role="menu"
              aria-label={t('topbar.switchTenant')}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '6px',
                width: '300px',
                maxWidth: 'calc(100vw - 32px)',
                maxHeight: '60vh',
                overflowY: 'auto',
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
                {t('topbar.switchTenant')}
              </div>
              {tenants.map((tenant) => {
                const selected = currentTenant?.id === tenant.id;
                return (
                  <button
                    key={tenant.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      setCurrentTenant(tenant);
                      setTenantDropdownOpen(false);
                    }}
                    style={{
                      ...menuItemStyle,
                      background: selected ? 'var(--color-primary-light)' : 'transparent',
                      color: selected ? 'var(--color-primary)' : 'var(--text-primary)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', minWidth: 0 }}>
                      {tenant.logoUrl ? (
                        <span
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
                          <img src={tenant.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </span>
                      ) : (
                        <Building2 size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} aria-hidden="true" />
                      )}
                      <span style={{ overflow: 'hidden', minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={tenant.name}>
                          {tenant.name}
                        </span>
                        {tenant.industry && <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-tertiary)' }}>{tenant.industry}</span>}
                      </span>
                    </span>
                    {selected && <Check size={14} style={{ flexShrink: 0 }} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Global search / command bar (Ctrl/Cmd+K) */}
        <GlobalSearch />
      </div>

      {/* Right: notifications, theme toggle, profile menu (role switching lives in the profile menu) */}
      <div className="topbar-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {/* Notifications */}
        <NotificationBell />

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          title={t('topbar.toggleTheme')}
          aria-label={t('topbar.toggleTheme')}
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
        <div ref={userRef} style={{ position: 'relative' }}>
          <button
            ref={userTriggerRef}
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-label={currentUser?.fullName || t('topbar.user')}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
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
                // On the blue band: white disc with brand-blue initials
                background: '#FFFFFF',
                color: 'var(--c-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '12px',
                flexShrink: 0,
              }}
            >
              {getInitials(currentUser?.fullName)}
            </div>
            <div className="topbar-collapsible">
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {currentUser?.fullName}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.2 }}>
                {currentUser?.jobTitle || activeRoleObj.label}
              </div>
            </div>
            <ChevronDown size={14} color="var(--text-tertiary)" />
          </button>

          {userMenuOpen && (
            <div
              className="animate-fade-in"
              role="menu"
              aria-label={currentUser?.fullName || t('topbar.user')}
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '8px',
                width: '260px',
                maxWidth: 'calc(100vw - 32px)',
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
                    {currentUser?.fullName}
                  </span>
                  <BadgeCheck size={16} color="var(--color-primary)" aria-hidden="true" />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {currentUser?.email}
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
                    {activeRoleObj.label}
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
                      {t('topbar.employeeId', { id: currentUser.employeeId })}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {tenantSwitchInProfileMenu ? (
                  <div role="group" aria-label={t('topbar.switchTenant')} style={{ padding: '4px 0 8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '4px' }}>
                    <div style={{ padding: '4px 10px 6px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                      {t('topbar.switchTenant')}
                    </div>
                    <div style={{ maxHeight: '40vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {tenants.map((tenant) => {
                        const selected = currentTenant?.id === tenant.id;
                        return (
                          <button
                            key={tenant.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={selected}
                            onClick={() => {
                              setCurrentTenant(tenant);
                              setUserMenuOpen(false);
                            }}
                            style={{
                              ...menuItemStyle,
                              minHeight: '40px',
                              background: selected ? 'var(--color-primary-light)' : 'transparent',
                              color: selected ? 'var(--color-primary)' : 'var(--text-primary)',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', minWidth: 0 }}>
                              <Building2 size={15} color="var(--text-tertiary)" style={{ flexShrink: 0 }} aria-hidden="true" />
                              <span style={{ fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={tenant.name}>
                                {tenant.name}
                              </span>
                            </span>
                            {selected && <Check size={14} style={{ flexShrink: 0 }} aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    {t('topbar.organization')} <strong style={{ color: 'var(--text-primary)' }}>{currentTenant?.name}</strong>
                  </div>
                )}

                {/* People with more than one role choose which role's view they work in */}
                {canSwitchRole && (
                  <div role="group" aria-label={t('topbar.switchView')} style={{ padding: '4px 0 8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '4px' }}>
                    <div style={{ padding: '4px 10px 6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)' }}>{t('topbar.switchView')}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {availableRoles.map((r) => {
                        const selected = activeUserRole === r.code;
                        return (
                          <button
                            key={r.code}
                            type="button"
                            role="menuitemradio"
                            aria-checked={selected}
                            onClick={() => handleRoleChange(r)}
                            style={{
                              ...menuItemStyle,
                              minHeight: '40px',
                              background: selected ? 'var(--color-primary-light)' : 'transparent',
                              color: selected ? 'var(--color-primary)' : 'var(--text-primary)',
                            }}
                          >
                            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left' }}>
                              <span style={{ fontWeight: selected ? 600 : 500 }}>{r.label}</span>
                              <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{r.subtitle}</span>
                            </span>
                            {selected && <Check size={14} style={{ flexShrink: 0 }} aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Language: saved to the user's profile (PATCH /auth/me/preferences); hidden while only one language is offered */}
                {LOCALE_OPTIONS.length > 1 && (
                <div style={{ padding: '4px 10px 8px' }}>
                  <div
                    id="topbar-language-label"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '6px' }}
                  >
                    <Languages size={13} /> {t('language.label')}
                  </div>
                  <div role="radiogroup" aria-labelledby="topbar-language-label" style={{ display: 'flex', gap: '6px' }}>
                    {LOCALE_OPTIONS.map((opt) => {
                      const active = locale === opt.code;
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          lang={opt.code}
                          disabled={savingLocale}
                          onClick={() => {
                            if (userLocale !== opt.code) setLocale(opt.code);
                          }}
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            padding: '6px 8px',
                            borderRadius: 'var(--radius-sm)',
                            border: `1px solid ${active ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
                            background: active ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                            color: active ? 'var(--color-primary)' : 'var(--text-primary)',
                            fontSize: '12.5px',
                            fontWeight: active ? 700 : 500,
                            cursor: savingLocale ? 'wait' : 'pointer',
                          }}
                        >
                          {active && <Check size={12} />}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {userLocale && (
                    <button
                      type="button"
                      disabled={savingLocale}
                      onClick={() => setLocale(null)}
                      style={{
                        marginTop: '6px',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        fontSize: '11.5px',
                        color: 'var(--color-primary)',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {t('language.orgDefault')}
                    </button>
                  )}
                </div>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate('/account/security');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '9px 12px',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-surface-subtle)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--bg-surface)';
                  }}
                >
                  {mfaEnrollmentRequired ? (
                    <ShieldAlert size={15} color="var(--color-warning)" />
                  ) : (
                    <ShieldCheck size={15} color={mfaEnabled ? 'var(--color-success)' : 'var(--text-secondary)'} />
                  )}
                  <span style={{ flex: 1 }}>{t('topbar.accountSecurity')}</span>
                  <span style={{ fontSize: '10.5px', fontWeight: 600, color: mfaEnabled ? 'var(--color-success)' : 'var(--text-tertiary)' }}>
                    {mfaEnrollmentRequired ? t('topbar.mfaRequired') : mfaEnabled ? t('topbar.mfaOn') : t('topbar.mfaOff')}
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
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
                  <span>{t('topbar.signOut')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};


import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Tenant, AuthUser, AuthResponse, LoginResult, MfaVerifyPayload, ReadOnlyReason, SubscriptionSummary } from '../types';
import {
  api,
  getAuthToken,
  setAuthToken,
  setApiTenantOverride,
  onUnauthorized,
  onMfaEnrollmentRequired,
  onReadOnlyMode,
  isMfaChallenge,
} from '../services/api';
import { RoleGroups, RoleGroup } from '../constants/roleGroups';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  title?: string;
}

type AuthStatus = 'checking' | 'authenticated' | 'anonymous';

interface AppContextType {
  currentTenant: Tenant | null;
  /** Switches the tenant being administered. Only available to platform super admins. */
  setCurrentTenant: (tenant: Tenant) => void;
  tenants: Tenant[];
  refreshTenants: () => Promise<void>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  /** Workspace view currently shown. Always one of the signed-in user's own roles. */
  activeUserRole: string;
  setActiveUserRole: (role: string) => void;
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  /** True while a stored session is being validated with the server on startup. */
  isSessionLoading: boolean;
  /** Resolves with a session, or with an MFA challenge that must be completed with verifyMfa. */
  login: (payload: { email: string; password: string; tenantSlug?: string; rememberMe?: boolean }) => Promise<LoginResult>;
  loginWithSso: (provider: string, tenantSlug?: string) => Promise<AuthResponse>;
  loginWithPin: (pin: string, badgeId: string, workstationCode?: string, tenantSlug?: string) => Promise<LoginResult>;
  /** Second sign-in step after an MFA challenge. `persist` keeps the session beyond the browser session. */
  verifyMfa: (payload: MfaVerifyPayload, persist: boolean) => Promise<AuthResponse>;
  /** Re-reads the signed-in user's session (roles, MFA state) from the server. */
  refreshSession: () => Promise<void>;
  /** Signs out locally at once and revokes the session on the server (best effort). */
  logout: () => void;
  /** Whether two-factor authentication is on for the signed-in user. */
  mfaEnabled: boolean;
  /** Organization policy requires this administrator to enrol in MFA before using anything else. */
  mfaEnrollmentRequired: boolean;
  /**
   * Whether the signed-in user may perform actions of the given role group.
   * Evaluated against all roles the user holds (not only the current workspace view).
   */
  can: (group: RoleGroup) => boolean;
  /**
   * Set when the organization is read-only (trial ended or subscription lapsed): detected from a 402
   * on any API call, or from the subscription summary loaded for organization administrators.
   */
  readOnlyReason: ReadOnlyReason | null;
  /** Organization subscription summary (loaded once per session for organization administrators only). */
  subscription: SubscriptionSummary | null;
  /** Re-reads the subscription summary (organization administrators only). */
  refreshSubscription: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const ACTIVE_TENANT_KEY = '5s_active_tenant';
const LAST_ORG_SLUG_KEY = '5s_last_org_slug';
// Holds only a theme the user picked with the toggle; light is the default
const THEME_STORAGE_KEY = '5s_theme_choice';
// Earlier builds saved the system preference here on every visit, so it is not a real choice; removed on startup
const LEGACY_THEME_KEY = '5s_theme';
// Keys written by earlier builds that trusted client-side identity; removed on startup.
const LEGACY_KEYS = ['5s_user_session', '5s_active_user_role'];

const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage unavailable — non-critical convenience data only
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

const readSavedTenant = (): Tenant | null => {
  const raw = safeStorage.get(ACTIVE_TENANT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tenant;
  } catch {
    return null;
  }
};

/** Roles the user may present as their workspace view. */
const getAvailableRoles = (user: AuthUser): string[] => {
  const codes = user.roles.map((r) => r.code);
  return user.isSuperAdmin ? Array.from(new Set(['SUPER_ADMIN', ...codes])) : codes;
};

/** Organization slug of the most recent successful sign-in on this device (used to pre-fill the login form). */
export const getLastOrganizationSlug = (): string => safeStorage.get(LAST_ORG_SLUG_KEY) || '';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenant, setCurrentTenantState] = useState<Tenant | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => (getAuthToken() ? 'checking' : 'anonymous'));
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      localStorage.removeItem(LEGACY_THEME_KEY);
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      // Storage unavailable: fall through to the default
    }
    // Light is the primary theme regardless of the system preference; dark only when chosen with the toggle
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeUserRole, setActiveUserRoleState] = useState<string>('');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaEnrollmentRequired, setMfaEnrollmentRequired] = useState(false);
  const [readOnlyReason, setReadOnlyReason] = useState<ReadOnlyReason | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const currentUserRef = useRef<AuthUser | null>(null);

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { ...t, id };
    setToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Not persisted (private window); the theme still applies for this visit
      }
      return next;
    });
  };

  const clearSession = useCallback(() => {
    setAuthToken(null);
    setApiTenantOverride(null);
    safeStorage.remove(ACTIVE_TENANT_KEY);
    currentUserRef.current = null;
    setCurrentUser(null);
    setCurrentTenantState(null);
    setTenants([]);
    setActiveUserRoleState('');
    setMfaEnabled(false);
    setMfaEnrollmentRequired(false);
    setReadOnlyReason(null);
    setSubscription(null);
    setAuthStatus('anonymous');
  }, []);

  const refreshTenants = useCallback(async () => {
    // The tenant directory is a platform-administration resource
    if (!currentUserRef.current?.isSuperAdmin) {
      setTenants([]);
      return;
    }
    try {
      const data = await api.getTenants();
      setTenants(data);
    } catch (err) {
      console.error('Failed to load tenants', err);
    }
  }, []);

  /** Applies a server-verified session to client state. */
  const applySession = useCallback(
    (res: AuthResponse) => {
      currentUserRef.current = res.user;
      setCurrentUser(res.user);
      setCurrentTenantState(res.tenant);
      setActiveUserRoleState((prev) => (prev && getAvailableRoles(res.user).includes(prev) ? prev : res.user.primaryRole));
      setMfaEnabled(res.mfaEnabled === true);
      setMfaEnrollmentRequired(res.mfaEnrollmentRequired === true);
      setAuthStatus('authenticated');

      if (res.user.isSuperAdmin) {
        setApiTenantOverride(res.tenant.id);
        safeStorage.set(ACTIVE_TENANT_KEY, JSON.stringify(res.tenant));
        refreshTenants();
      } else {
        setApiTenantOverride(null);
        safeStorage.remove(ACTIVE_TENANT_KEY);
      }
    },
    [refreshTenants],
  );

  const completeSignIn = (res: AuthResponse, persist: boolean) => {
    setAuthToken(res.accessToken, persist);
    safeStorage.set(LAST_ORG_SLUG_KEY, res.tenant.slug);
    applySession(res);
    addToast({
      type: 'success',
      title: 'Signed in',
      message: `Signed in as ${res.user.fullName}${res.user.jobTitle ? ` (${res.user.jobTitle})` : ''}`,
    });
  };

  const login = async (payload: { email: string; password: string; tenantSlug?: string; rememberMe?: boolean }) => {
    // A new sign-in always starts from the user's own tenant
    setApiTenantOverride(null);
    const res = await api.login(payload);
    // With two-factor on, the session is only issued after verifyMfa
    if (!isMfaChallenge(res)) completeSignIn(res, payload.rememberMe === true);
    return res;
  };

  const verifyMfa = async (payload: MfaVerifyPayload, persist: boolean) => {
    setApiTenantOverride(null);
    const res = await api.verifyMfa(payload);
    completeSignIn(res, persist);
    return res;
  };

  const refreshSession = useCallback(async () => {
    if (!getAuthToken()) return;
    const res = await api.getCurrentSession();
    applySession(res);
  }, [applySession]);

  const loginWithSso = async (provider: string, tenantSlug?: string) => {
    setApiTenantOverride(null);
    const res = await api.ssoLogin({ provider, tenantSlug });
    completeSignIn(res, false);
    return res;
  };

  const loginWithPin = async (pin: string, badgeId: string, workstationCode?: string, tenantSlug?: string) => {
    setApiTenantOverride(null);
    const res = await api.pinLogin({ pin, badgeId, workstationCode, tenantSlug });
    // Shop-floor terminals are shared devices: never persist PIN sessions beyond the browser session
    if (!isMfaChallenge(res)) completeSignIn(res, false);
    return res;
  };

  const logout = () => {
    const token = getAuthToken();
    clearSession();
    // Revoke the session server-side; local sign-out never waits for or depends on it
    api.logout(token).catch(() => undefined);
    addToast({
      type: 'info',
      title: 'Signed Out',
      message: 'You have been safely signed out of the 5S platform.',
    });
  };

  const setCurrentTenant = (tenant: Tenant) => {
    if (!currentUserRef.current?.isSuperAdmin) {
      return;
    }
    setCurrentTenantState(tenant);
    setApiTenantOverride(tenant.id);
    safeStorage.set(ACTIVE_TENANT_KEY, JSON.stringify(tenant));
    addToast({
      type: 'info',
      title: 'Organization switched',
      message: `Now working in ${tenant.name}`,
    });
  };

  const setActiveUserRole = (role: string) => {
    const user = currentUserRef.current;
    // The workspace view can only be switched between roles the user actually holds.
    // Authorization itself is always enforced by the server from the verified token.
    if (!user || !getAvailableRoles(user).includes(role)) {
      return;
    }
    setActiveUserRoleState(role);
  };

  // Startup: drop legacy client-side identity and validate any stored token with the server
  useEffect(() => {
    LEGACY_KEYS.forEach((key) => safeStorage.remove(key));
    onUnauthorized(() => {
      clearSession();
      addToast({ type: 'warning', title: 'Session Expired', message: 'Please sign in again to continue.' });
    });
    onMfaEnrollmentRequired(() => setMfaEnrollmentRequired(true));
    onReadOnlyMode((reason) => setReadOnlyReason(reason));

    if (getAuthToken()) {
      // Restore a super admin's previously selected tenant; the server ignores this for other users
      setApiTenantOverride(readSavedTenant()?.id ?? null);
      api
        .getCurrentSession()
        .then((res) => applySession(res))
        .catch(() => clearSession());
    }

    return () => {
      onUnauthorized(null);
      onMfaEnrollmentRequired(null);
      onReadOnlyMode(null);
    };
  }, [applySession, clearSession, addToast]);

  const can = useCallback(
    (group: RoleGroup): boolean => {
      if (!currentUser) return false;
      if (currentUser.isSuperAdmin) return true;
      const allowed: readonly string[] = RoleGroups[group];
      return currentUser.roles.some((r) => allowed.includes(r.code));
    },
    [currentUser],
  );

  // The subscription summary is an org-admin resource; platform super admins are exempt from plan limits
  const isOrgAdminUser = !!currentUser && !currentUser.isSuperAdmin && currentUser.roles.some((r) => r.code === 'ORG_ADMIN');
  const subscriptionUserId = isOrgAdminUser ? currentUser?.id ?? null : null;

  const refreshSubscription = useCallback(async () => {
    if (!subscriptionUserId) {
      setSubscription(null);
      return;
    }
    try {
      const summary = await api.getSubscription();
      setSubscription(summary);
      setReadOnlyReason(summary?.readOnly ? summary.readOnlyReason ?? 'TRIAL_EXPIRED' : null);
    } catch {
      // Non-critical: banners simply do not show
    }
  }, [subscriptionUserId]);

  // Once per session (per signed-in org admin)
  useEffect(() => {
    if (subscriptionUserId && !mfaEnrollmentRequired) refreshSubscription();
  }, [subscriptionUserId, mfaEnrollmentRequired, refreshSubscription]);

  return (
    <AppContext.Provider
      value={{
        currentTenant,
        setCurrentTenant,
        tenants,
        refreshTenants,
        theme,
        toggleTheme,
        toasts,
        addToast,
        removeToast,
        activeUserRole,
        setActiveUserRole,
        currentUser,
        isAuthenticated: authStatus === 'authenticated',
        isSessionLoading: authStatus === 'checking',
        login,
        loginWithSso,
        loginWithPin,
        verifyMfa,
        refreshSession,
        logout,
        mfaEnabled,
        mfaEnrollmentRequired,
        can,
        readOnlyReason,
        subscription,
        refreshSubscription,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export { getAvailableRoles };

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Tenant, AuthUser, AuthResponse } from '../types';
import { api, setApiTenantContext, setAuthToken, setApiUserRole } from '../services/api';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  title?: string;
}

interface AppContextType {
  currentTenant: Tenant | null;
  setCurrentTenant: (tenant: Tenant) => void;
  tenants: Tenant[];
  refreshTenants: () => Promise<void>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  activeUserRole: string;
  setActiveUserRole: (role: string) => void;
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  login: (payload: { email: string; password: string; tenantSlug?: string; rememberMe?: boolean }) => Promise<AuthResponse>;
  loginWithSso: (provider: string, tenantSlug?: string) => Promise<AuthResponse>;
  loginWithPin: (pin: string, badgeId?: string, workstationCode?: string, tenantSlug?: string) => Promise<AuthResponse>;
  logout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Personas matching seeded corporate identities in PostgreSQL
export const ROLE_PERSONAS: Record<string, AuthUser> = {
  SUPER_ADMIN: {
    id: '4a901d76-488f-4769-bf23-d3b339c2ab4d',
    email: 'superadmin@skilglobal.com',
    firstName: 'Vikram',
    lastName: 'Malhotra',
    fullName: 'Vikram Malhotra',
    jobTitle: 'Principal SaaS Administrator',
    department: 'Platform Governance & Architecture',
    isSuperAdmin: true,
    primaryRole: 'SUPER_ADMIN',
    roles: [{ code: 'SUPER_ADMIN', name: 'SaaS Super Administrator', permissions: [] }],
  },
  ORG_ADMIN: {
    id: 'd63510a8-6020-4e9b-b613-71e3b710dc51',
    email: 'admin@skilglobal.com',
    firstName: 'Pooja',
    lastName: 'Sharma',
    fullName: 'Pooja Sharma',
    jobTitle: 'VP of Manufacturing & Operational Excellence',
    department: 'Operations & Quality',
    isSuperAdmin: false,
    primaryRole: 'ORG_ADMIN',
    roles: [{ code: 'ORG_ADMIN', name: 'Organization Administrator', permissions: [] }],
  },
  PLANT_HEAD: {
    id: '04eb2344-f5a4-40ca-bc85-aa7d4c861be2',
    email: 'planthead.blr@skilglobal.com',
    firstName: 'Rajesh',
    lastName: 'Kumar',
    fullName: 'Rajesh Kumar',
    jobTitle: 'General Manager & Plant Head',
    department: 'Plant Operations',
    isSuperAdmin: false,
    primaryRole: 'PLANT_HEAD',
    roles: [{ code: 'PLANT_HEAD', name: 'Plant Head', permissions: [] }],
  },
  COORDINATOR_5S: {
    id: '6c4bdee2-e15f-4b14-963d-1255265b5c47',
    email: 'coordinator.5s@skilglobal.com',
    firstName: 'Sneha',
    lastName: 'Reddy',
    fullName: 'Sneha Reddy',
    jobTitle: 'Plant Quality & 5S Champion',
    department: 'Continuous Improvement',
    isSuperAdmin: false,
    primaryRole: 'COORDINATOR_5S',
    roles: [{ code: 'COORDINATOR_5S', name: '5S Coordinator', permissions: [] }],
  },
  DEPT_HEAD: {
    id: '1bcd996b-f88c-408f-970d-d73fc1c46b1c',
    email: 'depthead.machining@skilglobal.com',
    firstName: 'Suresh',
    lastName: 'Menon',
    fullName: 'Suresh Menon',
    jobTitle: 'Machining Department Head',
    department: 'Machining & Fabrication',
    isSuperAdmin: false,
    primaryRole: 'DEPT_HEAD',
    roles: [{ code: 'DEPT_HEAD', name: 'Department Head', permissions: [] }],
  },
  AREA_OWNER: {
    id: '5c78a499-43c7-4922-9e94-5042380fc112',
    email: 'owner.cnc01@skilglobal.com',
    firstName: 'Arun',
    lastName: 'Patel',
    fullName: 'Arun Patel',
    jobTitle: 'CNC Bay Lead & Area Owner',
    department: 'CNC Machining Bay A',
    isSuperAdmin: false,
    primaryRole: 'AREA_OWNER',
    roles: [{ code: 'AREA_OWNER', name: 'Area Owner', permissions: [] }],
  },
  AUDITOR: {
    id: 'a4f9fceb-c11e-4cfd-ac2d-0cb421689c3d',
    email: 'auditor.lead@skilglobal.com',
    firstName: 'Amit',
    lastName: 'Joshi',
    fullName: 'Amit Joshi',
    jobTitle: 'Lead Certified 5S Auditor',
    department: 'Quality Assurance & Standards',
    isSuperAdmin: false,
    primaryRole: 'AUDITOR',
    roles: [{ code: 'AUDITOR', name: 'Auditor', permissions: [] }],
  },
};

const DEFAULT_DEMO_USER: AuthUser = ROLE_PERSONAS.ORG_ADMIN;

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenant, setCurrentTenantState] = useState<Tenant | null>(() => {
    const savedTenant = localStorage.getItem('5s_active_tenant');
    return savedTenant ? JSON.parse(savedTenant) : null;
  });

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const savedUser = localStorage.getItem('5s_user_session');
    return savedUser ? JSON.parse(savedUser) : DEFAULT_DEMO_USER;
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(localStorage.getItem('5s_user_session') || localStorage.getItem('5s_access_token'));
  });

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeUserRole, setActiveUserRoleState] = useState<string>(() => {
    return currentUser?.primaryRole || 'ORG_ADMIN';
  });

  const addToast = (t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { ...t, id };
    setToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const refreshTenants = async () => {
    try {
      const data = await api.getTenants();
      setTenants(data);
      if (data.length > 0 && !currentTenant) {
        const defaultTenant = data.find((t) => t.slug === 'skilglobal-mfg') || data[0];
        setCurrentTenantState(defaultTenant);
        setApiTenantContext(defaultTenant.id, currentUser?.id);
        localStorage.setItem('5s_active_tenant', JSON.stringify(defaultTenant));
      }
    } catch (err) {
      console.error('Failed to load tenants', err);
    }
  };

  const setCurrentTenant = (tenant: Tenant) => {
    setCurrentTenantState(tenant);
    setApiTenantContext(tenant.id, currentUser?.id);
    localStorage.setItem('5s_active_tenant', JSON.stringify(tenant));
    addToast({
      type: 'info',
      title: 'Tenant Switched',
      message: `Active organization switched to: ${tenant.name}`,
    });
  };

  const setActiveUserRole = (role: string) => {
    setActiveUserRoleState(role);
    setApiUserRole(role);
    const persona = ROLE_PERSONAS[role];
    if (persona) {
      setCurrentUser(persona);
      localStorage.setItem('5s_user_session', JSON.stringify(persona));
      setApiTenantContext(currentTenant?.id || '39aa6fa6-fb16-44f6-81cf-05f3670f1df6', persona.id, role);
    } else if (currentUser) {
      const updatedUser = { ...currentUser, primaryRole: role };
      setCurrentUser(updatedUser);
      localStorage.setItem('5s_user_session', JSON.stringify(updatedUser));
      setApiTenantContext(currentTenant?.id || '39aa6fa6-fb16-44f6-81cf-05f3670f1df6', currentUser.id, role);
    }
  };

  const handleAuthSuccess = (res: AuthResponse) => {
    const isSuper = res.user.isSuperAdmin === true || res.user.email === 'superadmin@skilglobal.com' || res.user.primaryRole === 'SUPER_ADMIN';
    const effectiveRole = res.user.primaryRole || (isSuper ? 'SUPER_ADMIN' : 'ORG_ADMIN');

    setCurrentUser(res.user);
    setIsAuthenticated(true);
    setActiveUserRoleState(effectiveRole);
    setApiUserRole(effectiveRole);
    setAuthToken(res.accessToken);
    localStorage.setItem('5s_user_session', JSON.stringify(res.user));

    if (res.tenant) {
      setCurrentTenantState(res.tenant);
      setApiTenantContext(res.tenant.id, res.user.id, effectiveRole);
      localStorage.setItem('5s_active_tenant', JSON.stringify(res.tenant));
    }

    addToast({
      type: 'success',
      title: 'Welcome Back',
      message: `Signed in as ${res.user.fullName} (${res.user.jobTitle})`,
    });
  };

  const login = async (payload: { email: string; password: string; tenantSlug?: string; rememberMe?: boolean }) => {
    try {
      const res = await api.login(payload);
      handleAuthSuccess(res);
      return res;
    } catch (err: any) {
      // Fallback for offline or direct demo sign-in
      const isSuperEmail = payload.email.toLowerCase().includes('superadmin') || payload.email.toLowerCase().includes('super_admin');
      const demoUser: AuthUser = {
        id: 'user-demo-' + Math.random().toString(36).substring(2, 6),
        email: payload.email,
        firstName: payload.email.split('@')[0].split('.')[0] || 'Enterprise',
        lastName: payload.email.split('@')[0].split('.')[1] || 'User',
        fullName: payload.email.split('@')[0].replace('.', ' ').toUpperCase(),
        jobTitle: isSuperEmail ? 'Platform Governance Architect' : '5S Operations Leader',
        department: isSuperEmail ? 'Platform Administration' : 'Manufacturing',
        isSuperAdmin: isSuperEmail,
        primaryRole: isSuperEmail ? 'SUPER_ADMIN' : 'ORG_ADMIN',
        roles: [{ code: isSuperEmail ? 'SUPER_ADMIN' : 'ORG_ADMIN', name: isSuperEmail ? 'SaaS Super Administrator' : 'Organization Administrator', permissions: [] }],
      };

      const fallbackRes: AuthResponse = {
        success: true,
        authMethod: 'PASSWORD_FALLBACK',
        accessToken: '5s_demo_token_xyz',
        user: demoUser,
        tenant: currentTenant || {
          id: 'tenant-1',
          name: 'SkilGlobal Precision Manufacturing Ltd',
          slug: 'skilglobal-mfg',
          industry: 'Precision Manufacturing',
          subscriptionTier: 'ENTERPRISE',

          status: 'ACTIVE',
          storageUsedMb: 420,
          storageQuotaMb: 50000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        expiresInSeconds: 86400,
      };

      handleAuthSuccess(fallbackRes);
      return fallbackRes;
    }
  };

  const loginWithSso = async (provider: string, tenantSlug?: string) => {
    try {
      const res = await api.ssoLogin({ provider, tenantSlug });
      handleAuthSuccess(res);
      return res;
    } catch (err) {
      const ssoUser: AuthUser = {
        id: 'user-sso-01',
        email: 'coordinator.5s@skilglobal.com',
        firstName: 'Sneha',
        lastName: 'Reddy',
        fullName: 'Sneha Reddy',
        jobTitle: 'Plant Quality & 5S Coordinator',
        department: 'Quality & Continuous Improvement',
        isSuperAdmin: false,
        primaryRole: 'COORDINATOR_5S',
        roles: [{ code: 'COORDINATOR_5S', name: '5S Coordinator', permissions: [] }],
      };
      const fallbackRes: AuthResponse = {
        success: true,
        authMethod: `SSO_${provider}`,
        accessToken: '5s_sso_token_abc',
        user: ssoUser,
        tenant: currentTenant || (tenants[0] as any),
        expiresInSeconds: 86400,
      };
      handleAuthSuccess(fallbackRes);
      return fallbackRes;
    }
  };

  const loginWithPin = async (pin: string, badgeId?: string, workstationCode?: string, tenantSlug?: string) => {
    try {
      const res = await api.pinLogin({ pin, badgeId, workstationCode, tenantSlug });
      handleAuthSuccess(res);
      return res;
    } catch (err) {
      const pinUser: AuthUser = {
        id: 'user-arun-01',
        email: 'owner.cnc01@skilglobal.com',
        firstName: 'Arun',
        lastName: 'Patel',
        fullName: 'Arun Patel',
        jobTitle: 'CNC Line Team Leader & Area Owner',
        department: 'Machining Bay A',
        isSuperAdmin: false,
        primaryRole: 'AREA_OWNER',
        roles: [{ code: 'AREA_OWNER', name: 'Area Owner', permissions: [] }],
      };
      const fallbackRes: AuthResponse = {
        success: true,
        authMethod: 'PIN_BADGE',
        accessToken: '5s_pin_token_123',
        user: pinUser,
        tenant: currentTenant || (tenants[0] as any),
        expiresInSeconds: 86400,
      };
      handleAuthSuccess(fallbackRes);
      return fallbackRes;
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setIsAuthenticated(false);
    setAuthToken(null);
    localStorage.removeItem('5s_user_session');
    localStorage.removeItem('5s_access_token');
    addToast({
      type: 'info',
      title: 'Signed Out',
      message: 'You have been safely signed out of the 5S platform.',
    });
  };

  useEffect(() => {
    if (currentTenant?.id) {
      setApiTenantContext(currentTenant.id, currentUser?.id);
    }
  }, [currentTenant, currentUser]);

  useEffect(() => {
    refreshTenants();
  }, []);

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
        isAuthenticated,
        login,
        loginWithSso,
        loginWithPin,
        logout,
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


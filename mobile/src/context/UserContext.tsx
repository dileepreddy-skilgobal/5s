import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { UserProfile, TenantProfile, AuditExecution } from '../types';
import { AuthService, AuthSession, LoginOutcome, MfaChallenge } from '../services/authService';
import { ApiError, onUnauthorized } from '../services/http';
import { PushService } from '../services/pushService';
import { OfflineStorage } from '../services/offlineStorage';
import { RoleGroups, RoleGroup } from '../constants/roleGroups';

type AuthStatus = 'checking' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  /** False when the session was restored from cache while offline (not yet re-confirmed by the server). */
  isSessionVerified: boolean;
  /** Set when the session ended because the server rejected it (shown on the login screen). */
  sessionEndedReason: string | null;
  /** Resolves with an MFA challenge when the account uses two-factor authentication, otherwise null (signed in). */
  signIn: (email: string, password: string, tenantSlug?: string) => Promise<MfaChallenge | null>;
  signInWithPin: (badgeId: string, pin: string, tenantSlug?: string) => Promise<MfaChallenge | null>;
  /** Completes a two-factor sign-in with an authenticator code or a recovery code. */
  verifyMfa: (challenge: MfaChallenge, proof: { code: string } | { recoveryCode: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isSessionVerified, setIsSessionVerified] = useState(false);
  const [sessionEndedReason, setSessionEndedReason] = useState<string | null>(null);

  const endSession = useCallback(async (reason: string | null, revokeOnServer = false) => {
    await AuthService.logout({ revokeOnServer });
    setSession(null);
    setIsSessionVerified(false);
    setSessionEndedReason(reason);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    let mounted = true;
    onUnauthorized(() => {
      endSession('Your session has expired. Please sign in again.');
    });

    AuthService.restoreSession().then((restored) => {
      if (!mounted) return;
      if (restored) {
        setSession(restored.session);
        setIsSessionVerified(restored.verified);
        setStatus('signedIn');
      } else {
        setStatus('signedOut');
      }
    });

    return () => {
      mounted = false;
      onUnauthorized(null);
    };
  }, [endSession]);

  const applySession = (next: AuthSession) => {
    setSession(next);
    setIsSessionVerified(true);
    setSessionEndedReason(null);
    setStatus('signedIn');
  };

  /** Applies a session, or hands the MFA challenge back to the sign-in screen. */
  const applyOutcome = (outcome: LoginOutcome): MfaChallenge | null => {
    if (outcome.kind === 'mfa') return outcome.challenge;
    applySession(outcome.session);
    return null;
  };

  const value: AuthContextValue = {
    status,
    session,
    isSessionVerified,
    sessionEndedReason,
    signIn: async (email, password, tenantSlug) => applyOutcome(await AuthService.loginWithPassword(email, password, tenantSlug)),
    signInWithPin: async (badgeId, pin, tenantSlug) => applyOutcome(await AuthService.loginWithPin(badgeId, pin, tenantSlug)),
    verifyMfa: async (challenge, proof) => {
      if (Date.now() > challenge.expiresAt) {
        throw new ApiError(400, 'The verification step expired. Sign in again to get a new code request.');
      }
      applySession(await AuthService.verifyMfa(challenge.mfaToken, proof));
    },
    // User-initiated sign-out: drop this device's push registration while the token still works, then revoke the session
    signOut: async () => {
      await PushService.unregister();
      await endSession(null, true);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

// ---------------------------------------------------------------------------
// Signed-in user context (available only inside the authenticated part of the app)
// ---------------------------------------------------------------------------

interface UserStats {
  auditsCompleted: number;
  avgScore: number;
  findingsLogged: number;
}

interface UserContextValue {
  currentUser: UserProfile;
  tenant: TenantProfile;
  /** All role codes the user holds (SUPER_ADMIN only via the platform flag). */
  roles: string[];
  /** Whether the user may perform actions of the given role group. */
  can: (group: RoleGroup) => boolean;
  userStats: UserStats;
  refreshStats: (audits: AuditExecution[]) => void;
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

const toUserProfile = (session: AuthSession): UserProfile => {
  const { user, tenant } = session;
  const primary = user.roles.find((r) => r.code === user.primaryRole);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    jobTitle: user.jobTitle,
    department: user.department,
    roleName: primary?.name ?? user.primaryRole,
    tenantId: tenant.id,
    tenantName: tenant.name,
    plantName: tenant.name,
  };
};

const toTenantProfile = (session: AuthSession): TenantProfile => ({
  id: session.tenant.id,
  name: session.tenant.name,
  slug: session.tenant.slug,
  industry: session.tenant.industry,
  status: session.tenant.status,
  plantName: session.tenant.name,
  defaultAuditFrequency: '',
});

export const UserProvider: React.FC<{ session: AuthSession; children: React.ReactNode }> = ({ session, children }) => {
  const { signOut: endSession, isSessionVerified } = useAuth();
  const [userStats, setUserStats] = useState<UserStats>({ auditsCompleted: 0, avgScore: 0, findingsLogged: 0 });

  const currentUser = useMemo(() => toUserProfile(session), [session]);
  const tenant = useMemo(() => toTenantProfile(session), [session]);
  const roles = useMemo(() => {
    const codes = session.user.roles.map((r) => r.code);
    return session.user.isSuperAdmin ? Array.from(new Set(['SUPER_ADMIN', ...codes])) : codes;
  }, [session]);

  const can = useCallback(
    (group: RoleGroup) => {
      if (session.user.isSuperAdmin) return true;
      const allowed: readonly string[] = RoleGroups[group];
      return roles.some((r) => allowed.includes(r));
    },
    [roles, session],
  );

  // Statistics are derived only from the signed-in user's own audits; no placeholder figures
  const refreshStats = useCallback(
    (audits: AuditExecution[]) => {
      const mine = audits.filter((a) => a.auditorId === currentUser.id);
      const completed = mine.filter((a) => a.status === 'COMPLETED');
      const avg = completed.length
        ? Math.round((completed.reduce((acc, a) => acc + (a.overallScore || 0), 0) / completed.length) * 10) / 10
        : 0;
      const findings = mine.reduce((acc, a) => acc + (a.findingsCount || 0), 0);
      setUserStats({ auditsCompleted: completed.length, avgScore: avg, findingsLogged: findings });
    },
    [currentUser.id],
  );

  // Push registration once the server has confirmed the session (physical devices only; never blocks the app)
  useEffect(() => {
    if (isSessionVerified) PushService.register();
  }, [isSessionVerified, session.user.id]);

  // Cached master data is removed on sign-out; drafts and unsent submissions stay for the same user's next sign-in
  const signOut = useCallback(async () => {
    await OfflineStorage.clearUserCaches(currentUser.id);
    await endSession();
  }, [currentUser.id, endSession]);

  return (
    <UserContext.Provider value={{ currentUser, tenant, roles, can, userStats, refreshStats, signOut }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextValue => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within a signed-in UserProvider');
  return ctx;
};

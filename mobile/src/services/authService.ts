import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, apiRequest, clearAccessNotice, emitAccessNotice, MFA_ENROLLMENT_MESSAGE, resetUnauthorizedState } from './http';
import { TokenStore } from './tokenStore';

export interface AuthRole {
  code: string;
  name: string;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string;
  department: string;
  isSuperAdmin: boolean;
  primaryRole: string;
  roles: AuthRole[];
}

export interface AuthTenant {
  id: string;
  name: string;
  slug: string;
  industry: string;
  status: string;
}

export interface AuthSession {
  user: AuthUser;
  tenant: AuthTenant;
}

interface LoginResponse extends AuthSession {
  accessToken: string;
  expiresInSeconds: number;
  mfaEnabled?: boolean;
  /** The organization requires 2FA for this account but it is not set up yet (most endpoints answer 403). */
  mfaEnrollmentRequired?: boolean;
}

/** First sign-in step when two-factor authentication is enabled for the account. */
interface MfaChallengeResponse {
  mfaRequired: true;
  mfaToken: string;
  expiresInSeconds: number;
}

/** Pending second sign-in step: the token is valid for a few minutes only. */
export interface MfaChallenge {
  mfaToken: string;
  /** Epoch milliseconds after which the challenge must be restarted. */
  expiresAt: number;
}

export type LoginOutcome = { kind: 'session'; session: AuthSession } | { kind: 'mfa'; challenge: MfaChallenge };

/** Time allowed for the best-effort server sign-out (the local session ends regardless). */
const LOGOUT_TIMEOUT_MS = 5000;

/** Last server-verified profile (no secrets), used to keep working when the device is offline. */
const SESSION_PROFILE_KEY = '@5s_session_profile_v2';
// Profile keys written by earlier builds that let users pick an identity client-side
const LEGACY_KEYS = ['@5s_session_user_v1'];

const cacheProfile = async (session: AuthSession) => {
  await AsyncStorage.setItem(SESSION_PROFILE_KEY, JSON.stringify(session));
};

const readCachedProfile = async (): Promise<AuthSession | null> => {
  try {
    const raw = await AsyncStorage.getItem(SESSION_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
};

const startSession = async (res: LoginResponse): Promise<AuthSession> => {
  await TokenStore.set(res.accessToken);
  resetUnauthorizedState();
  clearAccessNotice();
  const session = { user: res.user, tenant: res.tenant };
  await cacheProfile(session);
  if (res.mfaEnrollmentRequired) {
    emitAccessNotice({ kind: 'MFA_ENROLLMENT', message: MFA_ENROLLMENT_MESSAGE });
  }
  return session;
};

const toOutcome = async (res: LoginResponse | MfaChallengeResponse): Promise<LoginOutcome> => {
  if ('mfaRequired' in res && res.mfaRequired) {
    return {
      kind: 'mfa',
      challenge: { mfaToken: res.mfaToken, expiresAt: Date.now() + (res.expiresInSeconds || 300) * 1000 },
    };
  }
  return { kind: 'session', session: await startSession(res as LoginResponse) };
};

export const AuthService = {
  /** Password sign-in; returns a session, or an MFA challenge to complete with verifyMfa. */
  async loginWithPassword(email: string, password: string, tenantSlug?: string): Promise<LoginOutcome> {
    const res = await apiRequest<LoginResponse | MfaChallengeResponse>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email: email.trim(), password, tenantSlug: tenantSlug?.trim() || undefined },
    });
    return toOutcome(res);
  },

  /** Badge + PIN sign-in; returns a session, or an MFA challenge to complete with verifyMfa. */
  async loginWithPin(badgeId: string, pin: string, tenantSlug?: string): Promise<LoginOutcome> {
    const res = await apiRequest<LoginResponse | MfaChallengeResponse>('/auth/pin-login', {
      method: 'POST',
      auth: false,
      body: { badgeId: badgeId.trim(), pin, tenantSlug: tenantSlug?.trim() || undefined },
    });
    return toOutcome(res);
  },

  /** Second sign-in step with a 6-digit authenticator code or a one-time recovery code. */
  async verifyMfa(mfaToken: string, proof: { code: string } | { recoveryCode: string }): Promise<AuthSession> {
    const body = 'code' in proof ? { mfaToken, code: proof.code.trim() } : { mfaToken, recoveryCode: proof.recoveryCode.trim() };
    const res = await apiRequest<LoginResponse>('/auth/mfa/verify', { method: 'POST', auth: false, body });
    return startSession(res);
  },

  /**
   * Restores the session at startup.
   * - Online: the stored token is verified with the server (revoked/expired → signed out).
   * - Offline: the last verified profile is reused so field work can continue; the server re-checks
   *   the token on the next request.
   */
  async restoreSession(): Promise<{ session: AuthSession; verified: boolean } | null> {
    await AsyncStorage.multiRemove(LEGACY_KEYS);
    const token = await TokenStore.get();
    if (!token) return null;

    try {
      resetUnauthorizedState();
      clearAccessNotice();
      const me = await apiRequest<AuthSession & { mfaEnrollmentRequired?: boolean }>('/auth/me');
      const session: AuthSession = { user: me.user, tenant: me.tenant };
      await cacheProfile(session);
      if (me.mfaEnrollmentRequired) {
        emitAccessNotice({ kind: 'MFA_ENROLLMENT', message: MFA_ENROLLMENT_MESSAGE });
      }
      return { session, verified: true };
    } catch (err) {
      if (err instanceof ApiError && err.isNetworkError) {
        const cached = await readCachedProfile();
        if (cached) return { session: cached, verified: false };
      }
      await this.logout();
      return null;
    }
  },

  /**
   * Ends the session on this device. With `revokeOnServer`, the access token is first revoked with
   * POST /auth/logout (best effort: offline or failing calls never block signing out).
   */
  async logout(options: { revokeOnServer?: boolean } = {}): Promise<void> {
    if (options.revokeOnServer && (await TokenStore.get())) {
      try {
        await apiRequest('/auth/logout', { method: 'POST', timeoutMs: LOGOUT_TIMEOUT_MS });
      } catch {
        // Offline or already revoked: the token is discarded locally below
      }
    }
    await TokenStore.clear();
    await AsyncStorage.removeItem(SESSION_PROFILE_KEY);
  },
};

/**
 * Claims carried inside the signed access token.
 * Kept intentionally minimal — roles and status are re-loaded from the
 * database on every request so revocations take effect immediately.
 */
export interface JwtPayload {
  sub: string; // user id
  tid: string; // home tenant id
  sid: string; // server-side session id (revocable)
  typ: 'access';
}

/** Short-lived token proving the password step passed while the MFA code is still pending. */
export interface MfaChallengePayload {
  sub: string;
  tid: string;
  typ: 'mfa_challenge';
  method: 'PASSWORD' | 'PIN_BADGE';
  rememberMe: boolean;
}

/**
 * Verified identity attached to `request.user` by the JWT strategy.
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  /** Tenant the user belongs to. */
  homeTenantId: string;
  /** Tenant the request operates on (differs from home only for platform super admins). */
  tenantId: string;
  roles: string[];
  isSuperAdmin: boolean;
  /** Session this request belongs to. */
  sessionId: string;
  /** Administrator who must enrol MFA before using anything else (tenant policy). */
  mfaEnrollmentRequired: boolean;
  /** Plan features and read-only state of the organization the request operates on. */
  subscription: { planCode: string | null; features: string[]; readOnly: boolean; readOnlyReason: string | null } | null;
  /** Set when the request was authenticated with an organization API key instead of a user session. */
  apiKeyId?: string;
}

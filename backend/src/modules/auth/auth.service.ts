import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  NotImplementedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { LoginDto, SsoLoginDto, PinLoginDto, ForgotPasswordDto, MfaVerifyDto, ResetPasswordDto, ChangePasswordDto } from './dto/auth.dto';
import { AuthenticatedUser, JwtPayload, MfaChallengePayload } from '../../core/auth/auth.types';
import { SessionService } from '../../core/auth/session.service';
import { MailService } from '../../core/notifications/mail.service';
import { getFrontendUrl } from '../../core/config/app-url';
import { readTenantSettings } from '../../core/config/tenant-settings';
import { hashSecret } from '../../core/auth/credentials';
import { decryptSecret, hashToken, verifyTotp } from '../../core/auth/totp';
import { randomBytes } from 'crypto';
import { ACCESS_TOKEN_TTL_SECONDS, REMEMBER_ME_TOKEN_TTL_SECONDS } from '../../core/auth/jwt.config';
import * as bcrypt from 'bcryptjs';
import { ActivityLogService } from '../../core/activity/activity-log.service';
import { activeAssignmentWhere } from '../../core/auth/active-assignment';

/** Who is attempting to sign in, for the activity trail. */
export interface SignInContext {
  method: 'PASSWORD' | 'PIN_BADGE';
  identifier: string;
  ipAddress: string | null;
  userAgent: string | null;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const BLOCKED_TENANT_STATUSES = ['SUSPENDED', 'CANCELLED'];
const INVALID_PASSWORD_MESSAGE = 'Invalid corporate email or password.';
const INVALID_PIN_MESSAGE = 'Invalid badge ID or PIN.';
const MFA_CHALLENGE_TTL_SECONDS = 300;
const RESET_TOKEN_TTL_MINUTES = 30;
const MAX_RESET_REQUESTS_PER_HOUR = 3;

type RequestMeta = { ipAddress: string | null; userAgent: string | null };
const NO_META: RequestMeta = { ipAddress: null, userAgent: null };

// Compared against when no account matches, so response timing does not reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync('5s-timing-equalizer', 10);

// A function so the expiry cut-off is evaluated per query; expired time-bound assignments grant nothing
const userWithAccessInclude = () => ({
  tenant: true,
  assignments: {
    where: activeAssignmentWhere(),
    include: {
      role: {
        include: {
          permissions: true,
        },
      },
    },
  },
}) satisfies Prisma.UserInclude;

type UserWithAccess = Prisma.UserGetPayload<{ include: ReturnType<typeof userWithAccessInclude> }>;
type TenantRecord = UserWithAccess['tenant'];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly activity: ActivityLogService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
  ) {}

  async login(dto: LoginDto, meta: RequestMeta = NO_META) {
    const user = await this.findUserForLogin(
      { email: { equals: dto.email.trim(), mode: 'insensitive' } },
      dto.tenantSlug,
      true,
    );
    const ctx: SignInContext = { method: 'PASSWORD', identifier: dto.email.trim().toLowerCase(), ...meta };
    const verified = await this.verifyCredential(user, dto.password, user?.passwordHash, INVALID_PASSWORD_MESSAGE, ctx);
    return this.completeSignIn(verified, 'PASSWORD', !!dto.rememberMe, meta);
  }

  async ssoLogin(_dto: SsoLoginDto): Promise<never> {
    // No identity provider is integrated yet. Never fabricate a session for an unverified SSO assertion.
    throw new NotImplementedException(
      'Single sign-on is not configured for this organization. Please sign in with your email and password.',
    );
  }

  async pinLogin(dto: PinLoginDto, meta: RequestMeta = NO_META) {
    const user = await this.findUserForLogin({ badgeId: dto.badgeId.trim() }, dto.tenantSlug, false);
    const ctx: SignInContext = { method: 'PIN_BADGE', identifier: `badge:${dto.badgeId.trim()}`, ...meta };
    const verified = await this.verifyCredential(user, dto.pin, user?.pinHash, INVALID_PIN_MESSAGE, ctx);
    return this.completeSignIn(verified, 'PIN_BADGE', false, meta);
  }

  /**
   * Emails a single-use reset link (valid 30 minutes). The response is identical whether or not the
   * account exists, so the endpoint cannot be used to discover email addresses.
   */
  async forgotPassword(dto: ForgotPasswordDto, meta: RequestMeta = NO_META) {
    const response = {
      success: true,
      message: 'If an account exists for that email, a password reset link has been sent. The link expires in 30 minutes.',
    };
    const user = await this.findUserForLogin({ email: { equals: dto.email.trim(), mode: 'insensitive' } }, dto.tenantSlug, true).catch(() => null);
    if (!user || user.status !== 'ACTIVE') return response;

    const recent = await this.prisma.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3600000) } },
    });
    if (recent >= MAX_RESET_REQUESTS_PER_HOUR) return response;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60000), ipAddress: meta.ipAddress },
    });
    const link = `${getFrontendUrl()}/reset-password?token=${token}`;
    await this.mail.send({
      to: user.email,
      subject: 'Reset your 5S platform password',
      text: `Hello ${user.firstName},\n\nA password reset was requested for your account. Open this link within ${RESET_TOKEN_TTL_MINUTES} minutes to choose a new password:\n\n${link}\n\nIf you did not request this, you can ignore this email; your password stays unchanged.\n`,
      html: `<p>Hello ${user.firstName},</p><p>A password reset was requested for your account. This link is valid for ${RESET_TOKEN_TTL_MINUTES} minutes:</p><p><a href="${link}">Choose a new password</a></p><p>If you did not request this, ignore this email; your password stays unchanged.</p>`,
    });
    await this.activity.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorEmail: user.email,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'User',
      entityId: user.id,
      outcome: 'SUCCESS',
      statusCode: 200,
      summary: 'Password reset link emailed',
      ...meta,
    });
    return response;
  }

  /** Completes a reset: sets the new password, consumes the token and signs out every device. */
  async resetPassword(dto: ResetPasswordDto, meta: RequestMeta = NO_META) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
      include: { user: { select: { id: true, tenantId: true, email: true, status: true } } },
    });
    if (!record || record.usedAt || record.expiresAt < new Date() || record.user.status !== 'ACTIVE') {
      throw new BadRequestException('This reset link is invalid or has expired. Request a new one.');
    }
    const passwordHash = await hashSecret(dto.newPassword);
    await this.prisma.$transaction([
      // Claim the token atomically so a link cannot be used twice concurrently
      this.prisma.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null, NOT: { id: record.id } }, data: { usedAt: new Date() } }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
      }),
    ]);
    const revoked = await this.sessions.revokeAll(record.userId, 'PASSWORD_RESET');
    await this.activity.record({
      tenantId: record.user.tenantId,
      actorId: record.user.id,
      actorEmail: record.user.email,
      action: 'PASSWORD_RESET',
      entityType: 'User',
      entityId: record.user.id,
      outcome: 'SUCCESS',
      statusCode: 200,
      summary: `Password reset via emailed link; ${revoked} session(s) signed out`,
      ...meta,
    });
    return { success: true, message: 'Your password has been changed. Sign in with your new password.' };
  }

  /** Signed-in password change; other devices are signed out, this one stays signed in. */
  async changePassword(authUser: AuthenticatedUser, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: authUser.userId }, select: { passwordHash: true } });
    if (!user || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect.');
    }
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('Choose a password different from the current one.');
    await this.prisma.user.update({
      where: { id: authUser.userId },
      data: { passwordHash: await hashSecret(dto.newPassword), passwordChangedAt: new Date() },
    });
    const revoked = await this.sessions.revokeAll(authUser.userId, 'PASSWORD_CHANGED', authUser.sessionId);
    return { success: true, message: `Password changed. ${revoked} other session(s) were signed out.` };
  }

  /** Second step of sign-in for MFA-enrolled users: TOTP code or a one-time recovery code. */
  async verifyMfa(dto: MfaVerifyDto, meta: RequestMeta = NO_META) {
    let challenge: MfaChallengePayload;
    try {
      challenge = await this.jwtService.verifyAsync<MfaChallengePayload>(dto.mfaToken);
    } catch {
      throw new UnauthorizedException('The sign-in attempt expired. Please sign in again.');
    }
    if (challenge.typ !== 'mfa_challenge') throw new UnauthorizedException('Invalid sign-in attempt.');
    const user = await this.prisma.user.findFirst({ where: { id: challenge.sub, tenantId: challenge.tid }, include: userWithAccessInclude() });
    if (!user || user.status !== 'ACTIVE' || !user.mfaEnabled || !user.mfaSecret) throw new UnauthorizedException('Invalid sign-in attempt.');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked after repeated failed sign-in attempts. Try again later.');
    }

    let ok = false;
    if (dto.code) {
      const step = verifyTotp(decryptSecret(user.mfaSecret), dto.code);
      // A code is accepted once: replaying an observed code within its validity window fails
      if (step !== null && (user.mfaLastUsedStep ?? -1) < step) {
        const claimed = await this.prisma.user.updateMany({
          where: { id: user.id, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] },
          data: { mfaLastUsedStep: step },
        });
        ok = claimed.count === 1;
      }
    } else if (dto.recoveryCode) {
      const codes: string[] = JSON.parse(user.mfaRecoveryCodes ?? '[]');
      const hash = hashToken(dto.recoveryCode.trim().toUpperCase());
      if (codes.includes(hash)) {
        await this.prisma.user.update({ where: { id: user.id }, data: { mfaRecoveryCodes: JSON.stringify(codes.filter((c) => c !== hash)) } });
        ok = true;
      }
    }
    if (!ok) {
      await this.recordFailedAttempt(user);
      await this.activity.record({
        tenantId: user.tenantId,
        actorId: user.id,
        actorEmail: user.email,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        outcome: 'FAILURE',
        statusCode: 401,
        summary: `Two-factor sign-in failed (${dto.code ? 'authenticator code' : 'recovery code'})`,
        ...meta,
      });
      throw new UnauthorizedException('Invalid verification code.');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    return this.issueSession(user, user.tenant, `${challenge.method}+MFA`, challenge.rememberMe, meta);
  }

  async updatePreferences(authUser: AuthenticatedUser, locale: string | null) {
    await this.prisma.user.update({ where: { id: authUser.userId }, data: { locale } });
    return { locale };
  }

  async listSessions(authUser: AuthenticatedUser) {
    const sessions = await this.sessions.list(authUser.userId);
    return sessions.map((s) => ({ ...s, current: s.id === authUser.sessionId }));
  }

  async revokeSession(authUser: AuthenticatedUser, sessionId: string) {
    if (!(await this.sessions.revoke(sessionId, authUser.userId, 'SIGNED_OUT_BY_USER'))) {
      throw new NotFoundException('Session not found');
    }
    return { success: true };
  }

  async logout(authUser: AuthenticatedUser) {
    await this.sessions.revoke(authUser.sessionId, authUser.userId, 'LOGOUT');
    return { success: true };
  }

  async revokeOtherSessions(authUser: AuthenticatedUser) {
    return { success: true, revoked: await this.sessions.revokeAll(authUser.userId, 'SIGNED_OUT_OTHER_DEVICES', authUser.sessionId) };
  }

  async getCurrentSession(authUser: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.userId },
      include: userWithAccessInclude(),
    });
    if (!user) {
      throw new UnauthorizedException('Session expired or user not found');
    }

    // Platform super admins may be operating on a tenant other than their home tenant
    const tenant =
      authUser.tenantId === user.tenantId
        ? user.tenant
        : await this.prisma.tenant.findUnique({ where: { id: authUser.tenantId } });
    if (!tenant) {
      throw new NotFoundException('Organization tenant not found');
    }

    return {
      success: true,
      authMethod: 'SESSION_CHECK',
      ...this.buildProfile(user, tenant),
      mfaEnabled: user.mfaEnabled,
      mfaEnrollmentRequired: authUser.mfaEnrollmentRequired,
    };
  }

  /**
   * Finds the account a credential belongs to.
   * - With a tenant slug, the lookup is restricted to that tenant (platform super admins may sign in from any tenant portal).
   * - Without one, the identifier must match exactly one account across all tenants.
   */
  private async findUserForLogin(
    identity: Prisma.UserWhereInput,
    tenantSlug: string | undefined,
    allowSuperAdminFromAnyTenant: boolean,
  ): Promise<UserWithAccess | null> {
    if (tenantSlug) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { OR: [{ id: tenantSlug }, { slug: tenantSlug }] },
        select: { id: true },
      });
      if (tenant) {
        const user = await this.prisma.user.findFirst({
          where: { ...identity, tenantId: tenant.id },
          include: userWithAccessInclude(),
        });
        if (user) return user;
      }
      if (!allowSuperAdminFromAnyTenant) return null;
      return this.prisma.user.findFirst({
        where: { ...identity, isSuperAdmin: true },
        include: userWithAccessInclude(),
      });
    }

    const matches = await this.prisma.user.findMany({
      where: identity,
      include: userWithAccessInclude(),
      take: 2,
    });
    if (matches.length > 1) {
      throw new BadRequestException(
        'This account exists in more than one organization. Please sign in through your organization login page.',
      );
    }
    return matches[0] ?? null;
  }

  private async verifyCredential(
    user: UserWithAccess | null,
    secret: string,
    secretHash: string | null | undefined,
    invalidMessage: string,
    ctx: SignInContext,
  ): Promise<UserWithAccess> {
    const audit = (action: string, outcome: 'SUCCESS' | 'FAILURE', reason: string) =>
      this.activity.record({
        tenantId: user?.tenantId ?? null,
        actorId: user?.id ?? null,
        actorEmail: user?.email ?? ctx.identifier,
        action,
        entityType: 'User',
        entityId: user?.id ?? null,
        outcome,
        statusCode: outcome === 'SUCCESS' ? 200 : 401,
        summary: `${ctx.method === 'PIN_BADGE' ? 'Badge/PIN' : 'Password'} sign-in: ${reason}`,
        changes: { method: ctx.method, identifier: ctx.identifier },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      await audit('LOGIN_FAILED', 'FAILURE', 'account is locked');
      throw new UnauthorizedException(
        `Account temporarily locked after repeated failed sign-in attempts. Try again in ${minutes} minute(s).`,
      );
    }

    const valid = await bcrypt.compare(secret, secretHash || DUMMY_HASH);
    if (!user || !secretHash || !valid) {
      if (user) {
        await this.recordFailedAttempt(user);
      }
      await audit('LOGIN_FAILED', 'FAILURE', user ? 'wrong credentials' : 'unknown account');
      throw new UnauthorizedException(invalidMessage);
    }

    if (user.status !== 'ACTIVE') {
      await audit('LOGIN_FAILED', 'FAILURE', `account status ${user.status}`);
      throw new UnauthorizedException('Your corporate user account is inactive or pending approval.');
    }
    if (!user.isSuperAdmin && BLOCKED_TENANT_STATUSES.includes(user.tenant.status)) {
      await audit('LOGIN_FAILED', 'FAILURE', `organization ${user.tenant.status}`);
      throw new ForbiddenException('Your organization account is not active. Contact your administrator.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    return user;
  }

  private async recordFailedAttempt(user: UserWithAccess) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : user.lockedUntil,
      },
    });
    if (shouldLock) {
      await this.activity.record({
        tenantId: user.tenantId,
        actorId: user.id,
        actorEmail: user.email,
        action: 'ACCOUNT_LOCKED',
        entityType: 'User',
        entityId: user.id,
        outcome: 'FAILURE',
        statusCode: 401,
        summary: `Account locked for ${LOCKOUT_MINUTES} minutes after ${MAX_FAILED_ATTEMPTS} failed sign-in attempts`,
      });
      this.logger.warn(`User ${user.id} locked for ${LOCKOUT_MINUTES} minutes after ${MAX_FAILED_ATTEMPTS} failed sign-in attempts`);
    }
  }

  /** Password / PIN accepted: finish sign-in, or ask for the second factor when MFA is enrolled. */
  private async completeSignIn(user: UserWithAccess, method: 'PASSWORD' | 'PIN_BADGE', rememberMe: boolean, meta: RequestMeta) {
    if (user.mfaEnabled && user.mfaSecret) {
      const payload: MfaChallengePayload = { sub: user.id, tid: user.tenantId, typ: 'mfa_challenge', method, rememberMe };
      const mfaToken = await this.jwtService.signAsync(payload, { expiresIn: MFA_CHALLENGE_TTL_SECONDS });
      return { success: true, mfaRequired: true, mfaToken, expiresInSeconds: MFA_CHALLENGE_TTL_SECONDS };
    }
    return this.issueSession(user, user.tenant, method, rememberMe, meta);
  }

  private async issueSession(user: UserWithAccess, tenant: TenantRecord, authMethod: string, rememberMe: boolean | undefined, meta: RequestMeta) {
    const expiresInSeconds = rememberMe ? REMEMBER_ME_TOKEN_TTL_SECONDS : ACCESS_TOKEN_TTL_SECONDS;
    const session = await this.sessions.create({
      tenantId: user.tenantId,
      userId: user.id,
      authMethod,
      ttlSeconds: expiresInSeconds,
      ...meta,
    });
    const payload: JwtPayload = { sub: user.id, tid: user.tenantId, sid: session.id, typ: 'access' };
    const accessToken = await this.jwtService.signAsync(payload, { expiresIn: expiresInSeconds });
    const isAdmin = user.isSuperAdmin || user.assignments.some((a) => a.role.code === 'ORG_ADMIN');
    const mfaEnrollmentRequired = isAdmin && !user.mfaEnabled && readTenantSettings(user.tenant.settings).security.requireMfaForAdmins;

    await this.activity.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorEmail: user.email,
      action: 'LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      outcome: 'SUCCESS',
      statusCode: 200,
      summary: `Signed in (${authMethod})`,
      changes: { method: authMethod, sessionId: session.id },
      ...meta,
    });

    return {
      success: true,
      authMethod,
      accessToken,
      ...this.buildProfile(user, tenant),
      expiresInSeconds,
      mfaEnabled: user.mfaEnabled,
      mfaEnrollmentRequired,
    };
  }

  private parseActions(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === 'string') : [];
    } catch {
      return [];
    }
  }

  private buildProfile(user: UserWithAccess, tenant: TenantRecord) {
    // SUPER_ADMIN is granted only by the platform isSuperAdmin flag, never by a tenant role assignment
    const uniqueRoles = new Map(user.assignments.map((a) => [a.role.code, a.role]));
    const roles = Array.from(uniqueRoles.values())
      .filter((role) => user.isSuperAdmin || role.code !== 'SUPER_ADMIN')
      .map((role) => ({
        code: role.code,
        name: role.name,
        description: role.description,
        permissions: role.permissions.map((p) => ({
          module: p.module,
          actions: this.parseActions(p.actions),
          scope: p.scope,
        })),
      }));

    const primaryRole = user.isSuperAdmin ? 'SUPER_ADMIN' : roles[0]?.code ?? 'EMPLOYEE';

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        jobTitle: user.jobTitle || 'Enterprise User',
        department: user.department || 'Operations',
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        isSuperAdmin: user.isSuperAdmin,
        locale: user.locale,
        primaryRole,
        roles,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        industry: tenant.industry,
        status: tenant.status,
        logoUrl: tenant.logoUrl,
        settings: tenant.settings,
      },
    };
  }
}

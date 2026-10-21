import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser, JwtPayload } from './auth.types';
import { getJwtSecret } from './jwt.config';
import { SessionService } from './session.service';
import { readTenantSettings } from '../config/tenant-settings';
import { subscriptionState } from '../subscription/plans';
import { activeAssignmentWhere } from './active-assignment';

const TENANT_OVERRIDE_HEADER = 'x-tenant-id';
const BLOCKED_TENANT_STATUSES = ['SUSPENDED', 'CANCELLED'];

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<AuthenticatedUser> {
    // Only access tokens bound to a live server-side session are accepted (not MFA challenge tokens)
    if (payload.typ !== 'access' || !payload.sid || !(await this.sessions.isActive(payload.sid, payload.sub))) {
      throw new UnauthorizedException('Session is no longer valid. Please sign in again.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        tenantId: true,
        status: true,
        isSuperAdmin: true,
        mfaEnabled: true,
        tenant: { select: { status: true, settings: true } },
        // Expired time-bound assignments grant nothing
        assignments: { where: activeAssignmentWhere(), select: { role: { select: { code: true } } } },
      },
    });

    if (!user || user.tenantId !== payload.tid || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Session is no longer valid. Please sign in again.');
    }

    if (!user.isSuperAdmin && BLOCKED_TENANT_STATUSES.includes(user.tenant.status)) {
      throw new ForbiddenException('Your organization account is not active. Contact your administrator.');
    }

    // SUPER_ADMIN is a platform privilege granted only by the isSuperAdmin flag,
    // never by a tenant-level role assignment.
    const assignedRoles = user.assignments.map((a) => a.role.code).filter((code) => code !== 'SUPER_ADMIN');
    const roles = user.isSuperAdmin ? ['SUPER_ADMIN', ...assignedRoles] : assignedRoles;

    const tenantId = user.isSuperAdmin
      ? await this.resolveSuperAdminTenant(req, user.tenantId)
      : user.tenantId;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true, trialEndsAt: true, currentPeriodEnd: true, plan: { select: { code: true, features: true } } },
    });

    return {
      userId: user.id,
      email: user.email,
      homeTenantId: user.tenantId,
      tenantId,
      roles: Array.from(new Set(roles)),
      isSuperAdmin: user.isSuperAdmin,
      sessionId: payload.sid,
      subscription: tenant ? subscriptionState(tenant) : null,
      mfaEnrollmentRequired:
        !user.mfaEnabled &&
        (user.isSuperAdmin || roles.includes('ORG_ADMIN')) &&
        readTenantSettings(user.tenant.settings).security.requireMfaForAdmins,
    };
  }

  /**
   * Platform super admins may operate on any tenant by sending `x-tenant-id` (id or slug).
   * Regular users are always pinned to their own tenant and the header is ignored.
   */
  private async resolveSuperAdminTenant(req: Request, homeTenantId: string): Promise<string> {
    const requested = (req.headers[TENANT_OVERRIDE_HEADER] as string | undefined)?.trim();
    if (!requested || requested === homeTenantId) {
      return homeTenantId;
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { OR: [{ id: requested }, { slug: requested }] },
      select: { id: true },
    });
    if (!tenant) {
      throw new ForbiddenException(`Tenant '${requested}' does not exist.`);
    }
    return tenant.id;
  }
}

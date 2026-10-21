import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { SubscriptionService } from '../../core/subscription/subscription.service';
import { SessionService } from '../../core/auth/session.service';
import { TenantReferenceService } from '../../core/database/tenant-reference.service';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { CreateUserDto, UpdateUserDto, AssignRoleDto, UserListQueryDto } from './dto/user.dto';
import { publicUserSelect } from '../../core/database/user-select';
import { generateTemporaryPassword, hashSecret } from '../../core/auth/credentials';
import { accessRules } from './access-matrix';

const userWithRolesSelect = {
  ...publicUserSelect,
  assignments: {
    include: {
      role: true,
    },
  },
} as const;

type UserWithRoles = Prisma.UserGetPayload<{ select: typeof userWithRolesSelect }>;

/** Roles whose access must always be time-bound (BRD: external assessors get temporary access). */
const TIME_BOUND_ROLES = ['EXTERNAL_AUDITOR'];

/** An assignment with a `validUntil` in the past grants nothing (it is ignored at sign-in and role switch). */
export const isAssignmentActive = (a: { validUntil: Date | null }, now = new Date()) => !a.validUntil || a.validUntil > now;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscription: SubscriptionService,
    private readonly tenantRefs: TenantReferenceService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Adds, per role assignment, the organization unit it is limited to and whether it has expired.
   * UserRoleAssignment.orgNodeId has no relation in the schema, so the units are looked up in one query.
   */
  private async decorateAssignments<T extends Pick<UserWithRoles, 'assignments'>>(tenantId: string, users: T[]) {
    const nodeIds = [...new Set(users.flatMap((u) => u.assignments.map((a) => a.orgNodeId)).filter((id): id is string => !!id))];
    const nodes = nodeIds.length
      ? await this.prisma.orgNode.findMany({ where: { tenantId, id: { in: nodeIds } }, select: { id: true, name: true, code: true, nodeType: true } })
      : [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const now = new Date();
    return users.map((u) => ({
      ...u,
      assignments: u.assignments.map((a) => ({
        ...a,
        orgNode: a.orgNodeId ? byId.get(a.orgNodeId) ?? null : null,
        expired: !isAssignmentActive(a, now),
      })),
    }));
  }

  async getUsersByTenant(tenantId: string, filters: UserListQueryDto = {}) {
    const where: Prisma.UserWhereInput = { tenantId };
    const search = filters.search?.trim();
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { badgeId: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (filters.status) where.status = filters.status;
    if (filters.role) where.assignments = { some: { role: { code: filters.role } } };

    const users = await this.prisma.user.findMany({
      where,
      // pinHash is read only to report whether a PIN is set; it is stripped below and never returned
      select: { ...userWithRolesSelect, pinHash: true },
      orderBy: { createdAt: 'desc' },
    });
    const safe = users.map(({ pinHash, ...u }) => ({ ...u, hasPin: !!pinHash }));
    return this.decorateAssignments(tenantId, safe);
  }

  async getUserById(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: userWithRolesSelect,
    });
    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }
    const [decorated] = await this.decorateAssignments(tenantId, [user]);
    return decorated;
  }

  /** Validates the optional scope and expiry of a role assignment (shared by create-user and assign-role). */
  private async assertAssignmentTerms(tenantId: string, roleCode: string, orgNodeId: string | undefined, validUntil: string | undefined) {
    await this.tenantRefs.assertOptional(tenantId, 'orgNode', orgNodeId, 'Org node');
    if (TIME_BOUND_ROLES.includes(roleCode) && !validUntil) {
      throw new BadRequestException('An external auditor role needs an end date (valid until).');
    }
    if (validUntil) {
      const until = new Date(validUntil);
      if (Number.isNaN(until.getTime()) || until <= new Date()) {
        throw new BadRequestException('The end date of a role must be in the future.');
      }
      return until;
    }
    return null;
  }

  /** Throws when the change would leave the organization without an active administrator. */
  private async assertNotLastAdmin(tenantId: string, userId: string, message: string) {
    const isAdmin = await this.prisma.userRoleAssignment.count({ where: { tenantId, userId, role: { code: 'ORG_ADMIN' } } });
    if (!isAdmin) return;
    const otherAdmins = await this.prisma.userRoleAssignment.count({
      where: { tenantId, role: { code: 'ORG_ADMIN' }, userId: { not: userId }, user: { deletedAt: null, status: 'ACTIVE' } },
    });
    if (otherAdmins === 0) throw new BadRequestException(message);
  }

  async createUser(tenantId: string, dto: CreateUserDto) {
    if (dto.roleCode === 'SUPER_ADMIN') {
      throw new ForbiddenException('The SUPER_ADMIN role cannot be assigned to tenant users.');
    }
    // The initial role and its terms are checked before anything is written
    const role = dto.roleCode ? await this.prisma.role.findFirst({ where: { tenantId, code: dto.roleCode } }) : null;
    if (dto.roleCode && !role) {
      throw new BadRequestException(`Unknown role '${dto.roleCode}'.`);
    }
    const roleValidUntil = role ? await this.assertAssignmentTerms(tenantId, role.code, dto.orgNodeId, dto.roleValidUntil) : null;

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: { equals: email, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException(`User with email '${email}' already exists in this tenant`);
    }

    // Without an explicit password, a one-time temporary password is generated and returned once
    const temporaryPassword = dto.password ? undefined : generateTemporaryPassword();
    const credentials = await this.buildCredentialData(tenantId, null, {
      password: dto.password ?? temporaryPassword,
      badgeId: dto.badgeId,
      pin: dto.pin,
    });
    await this.subscription.assertWithinLimit(tenantId, 'users');
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email,
        passwordHash: credentials.passwordHash,
        badgeId: credentials.badgeId,
        pinHash: credentials.pinHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        jobTitle: dto.jobTitle,
        department: dto.department,
        phone: dto.phone,
        status: 'ACTIVE',
      },
    });

    // Assign the initial role, optionally limited to an organization unit and time-bound
    if (role) {
      await this.prisma.userRoleAssignment.create({
        data: {
          tenantId,
          userId: user.id,
          roleId: role.id,
          orgNodeId: dto.orgNodeId || null,
          validUntil: roleValidUntil,
        },
      });
    }

    const created = await this.getUserById(tenantId, user.id);
    return { ...created, temporaryPassword };
  }

  /**
   * Platform super admin accounts live inside a tenant but may only be managed by another
   * super admin; otherwise a tenant admin could reset their credentials and take over the platform.
   */
  private assertCanManage(target: { isSuperAdmin: boolean }, actor: AuthenticatedUser) {
    if (target.isSuperAdmin && !actor.isSuperAdmin) {
      throw new ForbiddenException('Platform super administrator accounts can only be managed by a super administrator.');
    }
  }

  async updateUser(tenantId: string, id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
    this.assertCanManage(await this.getUserById(tenantId, id), actor);
    if (dto.status && dto.status !== 'ACTIVE') {
      if (id === actor.userId) throw new BadRequestException('You cannot deactivate your own account.');
      await this.assertNotLastAdmin(tenantId, id, 'This is the last active administrator of the organization; assign the role to someone else first.');
    }
    const { password, badgeId, pin, ...profile } = dto;
    const credentials = await this.buildCredentialData(tenantId, id, { password, badgeId, pin });
    await this.prisma.user.update({
      where: { id },
      data: {
        ...profile,
        ...credentials,
        // An administrator password reset also clears any sign-in lockout
        ...(credentials.passwordHash ? { failedLoginAttempts: 0, lockedUntil: null, passwordChangedAt: new Date() } : {}),
      },
    });
    // A password set by an administrator ends the user's existing sessions; so does deactivation
    if (credentials.passwordHash) await this.sessions.revokeAll(id, 'PASSWORD_RESET_BY_ADMIN');
    else if (dto.status && dto.status !== 'ACTIVE') await this.sessions.revokeAll(id, 'USER_DEACTIVATED');
    return this.getUserById(tenantId, id);
  }

  /** Sets a new operator PIN (badge sign-in) and clears any sign-in lockout. The PIN is never returned. */
  async resetPin(tenantId: string, id: string, pin: string, actor: AuthenticatedUser) {
    const user = await this.getUserById(tenantId, id);
    this.assertCanManage(user, actor);
    if (!user.badgeId) {
      throw new BadRequestException('A badge ID is required before a PIN can be set');
    }
    await this.prisma.user.update({
      where: { id },
      data: { pinHash: await hashSecret(pin), failedLoginAttempts: 0, lockedUntil: null },
    });
    return { id, pinSet: true };
  }

  async deleteUser(tenantId: string, id: string, actor: AuthenticatedUser) {
    this.assertCanManage(await this.getUserById(tenantId, id), actor);
    if (id === actor.userId) {
      throw new BadRequestException('You cannot delete your own account.');
    }
    await this.assertNotLastAdmin(tenantId, id, 'This is the last active administrator of the organization; assign the role to someone else first.');
    const user = await this.prisma.user.findFirst({ where: { id, tenantId }, select: { email: true, badgeId: true } });
    // Soft delete: the person stays attached to the audits, findings and actions they recorded.
    // Unique sign-in identifiers are released so the same email / badge can be reused later.
    const tombstone = `deleted-${Date.now()}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.location.updateMany({ where: { tenantId, ownerId: id }, data: { ownerId: null } });
      await tx.location.updateMany({ where: { tenantId, backupOwnerId: id }, data: { backupOwnerId: null } });
      await tx.correctiveAction.updateMany({
        where: { tenantId, assigneeId: id, status: { notIn: ['VERIFIED', 'CLOSED'] } },
        data: { assigneeId: null },
      });
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'USER_DELETED' } });
      return tx.user.update({
        where: { id },
        data: {
          status: 'INACTIVE',
          email: `${tombstone}+${user?.email ?? id}`,
          badgeId: user?.badgeId ? `${tombstone}+${user.badgeId}` : null,
          pinHash: null,
          deletedAt: new Date(),
          deletedById: actor.userId,
        },
        select: publicUserSelect,
      });
    });
  }

  /**
   * Hashes any supplied password / PIN and validates badge uniqueness within the tenant.
   * Only fields that were supplied are returned, so callers can spread the result into an update.
   */
  private async buildCredentialData(
    tenantId: string,
    userId: string | null,
    input: { password?: string; badgeId?: string; pin?: string },
  ): Promise<{ passwordHash?: string; badgeId?: string; pinHash?: string }> {
    const data: { passwordHash?: string; badgeId?: string; pinHash?: string } = {};

    if (input.password) {
      data.passwordHash = await hashSecret(input.password);
    }

    if (input.badgeId !== undefined) {
      const badgeId = input.badgeId.trim().toUpperCase();
      if (badgeId) {
        const clash = await this.prisma.user.findFirst({
          where: { tenantId, badgeId, ...(userId ? { NOT: { id: userId } } : {}) },
          select: { id: true },
        });
        if (clash) {
          throw new ConflictException(`Badge ID '${badgeId}' is already assigned to another user`);
        }
      }
      data.badgeId = badgeId || null;
    }

    if (input.pin) {
      const hasBadge = data.badgeId ?? (userId
        ? (await this.prisma.user.findUnique({ where: { id: userId }, select: { badgeId: true } }))?.badgeId
        : null);
      if (!hasBadge) {
        throw new BadRequestException('A badge ID is required before a PIN can be set');
      }
      data.pinHash = await hashSecret(input.pin);
    }

    return data;
  }

  // --- Roles & Permissions (RBAC Engine) ---

  async getRolesByTenant(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      include: {
        permissions: true,
        _count: {
          select: { assignments: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getRoleById(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId },
      include: {
        permissions: true,
        assignments: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, jobTitle: true },
            },
          },
        },
      },
    });
    if (!role) {
      throw new NotFoundException(`Role with ID '${id}' not found`);
    }
    return role;
  }


  /** The enforced role rules (RoleGroups) with this tenant's role names; SUPER_ADMIN is a platform flag, not listed. */
  async getAccessMatrix(tenantId: string) {
    const roles = await this.prisma.role.findMany({
      where: { tenantId, code: { not: 'SUPER_ADMIN' } },
      select: { code: true, name: true, description: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      roles,
      rules: accessRules(),
      notes: [
        'Every signed-in member of the organization can view its data; the rules below cover creating, changing and approving.',
        'Platform super administrators pass every rule.',
        'External auditors have read-only access.',
      ],
    };
  }

  async removeRole(tenantId: string, userId: string, assignmentId: string, actor: AuthenticatedUser) {
    this.assertCanManage(await this.getUserById(tenantId, userId), actor);
    const assignment = await this.prisma.userRoleAssignment.findFirst({
      where: { id: assignmentId, tenantId, userId },
      include: { role: { select: { code: true, name: true } } },
    });
    if (!assignment) throw new NotFoundException('Role assignment not found');
    if (assignment.role.code === 'ORG_ADMIN') {
      if (userId === actor.userId) {
        throw new BadRequestException('You cannot remove your own administrator role. Ask another administrator.');
      }
      const otherAdmins = await this.prisma.userRoleAssignment.count({
        where: { tenantId, role: { code: 'ORG_ADMIN' }, userId: { not: userId }, user: { deletedAt: null, status: 'ACTIVE' } },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException('This is the last active administrator of the organization; assign the role to someone else first.');
      }
    }
    await this.prisma.userRoleAssignment.delete({ where: { id: assignment.id } });
    return { id: assignment.id, removed: true };
  }

  async assignRole(tenantId: string, userId: string, dto: AssignRoleDto, actor: AuthenticatedUser) {
    this.assertCanManage(await this.getUserById(tenantId, userId), actor);
    const role = await this.getRoleById(tenantId, dto.roleId);
    if (role.code === 'SUPER_ADMIN') {
      // Platform super admin is a SaaS-operator privilege and cannot be granted from within a tenant
      throw new ForbiddenException('The SUPER_ADMIN role cannot be assigned to tenant users.');
    }
    const validUntil = await this.assertAssignmentTerms(tenantId, role.code, dto.orgNodeId, dto.validUntil);

    const existing = await this.prisma.userRoleAssignment.findFirst({
      where: { tenantId, userId, roleId: dto.roleId, orgNodeId: dto.orgNodeId || null },
    });
    if (existing) {
      // Re-assigning the same role and scope renews (or removes) its end date instead of duplicating it
      return this.prisma.userRoleAssignment.update({ where: { id: existing.id }, data: { validUntil } });
    }

    return this.prisma.userRoleAssignment.create({
      data: {
        tenantId,
        userId,
        roleId: dto.roleId,
        orgNodeId: dto.orgNodeId || null,
        validUntil,
      },
    });
  }
}

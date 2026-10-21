import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthenticatedUser } from '../../core/auth/auth.types';

/**
 * Org sub-trees whose locations a caller may see in analytics and reports.
 * `null` means the whole organization.
 */
export type LocationScope = { paths: string[] } | null;

/** Roles that see the whole organization in management reporting whenever they hold the endpoint's access. */
const FULL_VIEW_ROLES = ['ORG_ADMIN', 'COORDINATOR_5S', 'EXECUTIVE', 'AUDITOR'];
/** Line-management roles whose view follows the org node of their role assignment (none = whole organization). */
const NODE_SCOPED_ROLES = ['PLANT_HEAD', 'DEPT_HEAD'];

export interface ScopeSummary {
  restricted: boolean;
  /** The org units the caller is limited to (empty when not restricted). */
  nodes: { id: string; name: string; nodeType: string }[];
}

/**
 * Resolves the data scope of plant and department heads (BRD §9: a plant head sees their plant, a department head
 * their department). Executives, administrators, 5S coordinators and auditors see every area; a line manager whose
 * role assignment carries no org node keeps the organization-wide view.
 */
@Injectable()
export class DataScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param accessRoles roles that may call the endpoint (its RoleGroup); only these assignments widen or narrow the view.
   */
  async resolve(user: AuthenticatedUser, tenantId: string, accessRoles: readonly string[]): Promise<LocationScope> {
    if (user.isSuperAdmin || user.apiKeyId) return null;
    const now = new Date();
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { tenantId, userId: user.userId, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
      select: { orgNodeId: true, role: { select: { code: true } } },
    });
    const relevant = assignments.filter((a) => accessRoles.includes(a.role.code));
    if (relevant.some((a) => FULL_VIEW_ROLES.includes(a.role.code))) return null;

    const scoped = relevant.filter((a) => NODE_SCOPED_ROLES.includes(a.role.code));
    if (scoped.some((a) => !a.orgNodeId)) return null;
    const nodeIds = Array.from(new Set(scoped.map((a) => a.orgNodeId as string)));
    if (nodeIds.length === 0) return { paths: [] };
    const nodes = await this.prisma.orgNode.findMany({ where: { tenantId, id: { in: nodeIds } }, select: { path: true } });
    // A sub-tree inside another one adds nothing
    const paths = nodes.map((n) => n.path).sort((a, b) => a.length - b.length);
    return { paths: paths.filter((p, i) => !paths.slice(0, i).some((q) => p.startsWith(q))) };
  }

  /** Describes the caller's scope for the UI ("Showing data for …"). */
  async describe(user: AuthenticatedUser, tenantId: string, accessRoles: readonly string[]): Promise<ScopeSummary> {
    const scope = await this.resolve(user, tenantId, accessRoles);
    if (!scope) return { restricted: false, nodes: [] };
    if (scope.paths.length === 0) return { restricted: true, nodes: [] };
    const nodes = await this.prisma.orgNode.findMany({
      where: { tenantId, path: { in: scope.paths } },
      select: { id: true, name: true, nodeType: true },
      orderBy: { name: 'asc' },
    });
    return { restricted: true, nodes };
  }

  /**
   * Rejects an org-node filter that lies entirely outside the caller's scope. A node above the scope (e.g. the plant
   * of a department head) is allowed: results are the intersection of the node's sub-tree and the scope.
   */
  async assertNodeVisible(tenantId: string, orgNodeId: string | undefined, scope: LocationScope): Promise<void> {
    if (!orgNodeId) return;
    const node = await this.prisma.orgNode.findFirst({ where: { id: orgNodeId, tenantId }, select: { path: true } });
    if (!node) throw new NotFoundException(`Org node '${orgNodeId}' not found`);
    if (scope && !scope.paths.some((p) => node.path.startsWith(p) || p.startsWith(node.path))) {
      throw new ForbiddenException('This organization unit is outside your reporting scope.');
    }
  }

  /** Rejects a single location outside the caller's scope (404 rather than 403 so ids do not leak). */
  async assertLocationVisible(tenantId: string, locationId: string, scope: LocationScope): Promise<void> {
    if (!scope) return;
    const visible = await this.prisma.location.count({
      where: { id: locationId, tenantId, AND: [scopeWhere(scope) as Prisma.LocationWhereInput] },
    });
    if (!visible) throw new NotFoundException(`Location '${locationId}' not found`);
  }
}

/** Prisma location filter for a scope (undefined = no restriction). An empty scope matches nothing. */
export function scopeWhere(scope: LocationScope): Prisma.LocationWhereInput | undefined {
  if (!scope) return undefined;
  if (scope.paths.length === 0) return { id: { in: [] } };
  return { OR: scope.paths.map((p) => ({ orgNode: { path: { startsWith: p } } })) };
}

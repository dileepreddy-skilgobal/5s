import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SubscriptionService } from '../../core/subscription/subscription.service';
import { TenantReferenceService } from '../../core/database/tenant-reference.service';
import { CreateOrgNodeDto, UpdateOrgNodeDto, MoveOrgNodeDto } from './dto/organization.dto';
import { OrgNode } from '@prisma/client';
import { buildLocationQrPayload, defaultMilestoneRows } from '../locations/location-qr';
import { NodeTypeOption, isAllowedNodeType, nodeTypeOptions } from './node-types';

export interface OrgTreeNode {
  id: string;
  name: string;
  code: string;
  nodeType: string;
  path: string;
  depth: number;
  sortOrder: number;
  status: string;
  parentId: string | null;
  children: OrgTreeNode[];
  locationCount: number;
}

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscription: SubscriptionService,
    private readonly tenantRefs: TenantReferenceService,
  ) {}

  /** Node types this organization may use: its configured hierarchy levels first, then the built-in types. */
  async getNodeTypes(tenantId: string): Promise<NodeTypeOption[]> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { hierarchyConfig: true } });
    return nodeTypeOptions(tenant?.hierarchyConfig);
  }

  private async assertNodeType(tenantId: string, nodeType: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { hierarchyConfig: true } });
    if (!isAllowedNodeType(tenant?.hierarchyConfig, nodeType)) {
      throw new BadRequestException(`'${nodeType}' is not one of this organization's hierarchy levels. Add it under Settings → Hierarchy levels first.`);
    }
  }

  async getTreeByTenant(tenantId: string): Promise<OrgTreeNode[]> {
    const nodes = await this.prisma.orgNode.findMany({
      where: { tenantId },
      orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { locations: { where: { deletedAt: null } } },
        },
      },
    });

    const nodeMap = new Map<string, OrgTreeNode>();
    const roots: OrgTreeNode[] = [];

    // Map all nodes. Org units have no QR tag: the scanner only opens locations.
    for (const n of nodes) {
      nodeMap.set(n.id, {
        id: n.id,
        name: n.name,
        code: n.code,
        nodeType: n.nodeType,
        path: n.path,
        depth: n.depth,
        sortOrder: n.sortOrder,
        status: n.status,
        parentId: n.parentId,
        children: [],
        locationCount: n._count.locations,
      });
    }

    // Build tree hierarchy
    nodes.forEach((n) => {
      const current = nodeMap.get(n.id)!;
      if (n.parentId && nodeMap.has(n.parentId)) {
        nodeMap.get(n.parentId)!.children.push(current);
      } else {
        roots.push(current);
      }
    });

    return roots;
  }

  async getAllNodesFlat(tenantId: string) {
    const nodes = await this.prisma.orgNode.findMany({
      where: { tenantId },
      orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }],
      include: {
        parent: { select: { id: true, name: true, code: true, nodeType: true } },
        _count: { select: { locations: { where: { deletedAt: null } }, children: { where: { deletedAt: null } } } },
      },
    });

    return nodes;
  }

  async getNodeById(tenantId: string, id: string) {
    const node = await this.prisma.orgNode.findFirst({
      where: { id, tenantId },
      include: {
        parent: true,
        children: {
          where: { deletedAt: null },
          include: {
            _count: { select: { locations: { where: { deletedAt: null } } } },
          },
        },
        locations: {
          where: { deletedAt: null },
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!node) {
      throw new NotFoundException(`Organizational node with ID '${id}' not found`);
    }

    return node;
  }

  async generateNextOrgNodeCode(tenantId: string, nodeType: string, parentId?: string): Promise<string> {

    const prefixMap: Record<string, string> = {
      ENTERPRISE: 'ENT',
      PLANT: 'PLT',
      DIVISION: 'DIV',
      DEPARTMENT: 'DPT',
      SUB_DEPARTMENT: 'SDP',
      PRODUCTION_LINE: 'LIN',
      WORK_CELL: 'CEL',
      BAY_STATION: 'BAY',
      STORAGE_RACK: 'RCK',
      WORKBENCH: 'WKB',
      QUARANTINE_ZONE: 'QZ',
      SUB_SECTION: 'SEC',
    };

    // Configured levels without a mapped prefix use their first letters (COUNTRY → COU)
    const typePrefix = prefixMap[nodeType] || nodeType.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase() || 'NOD';

    let parentPrefix = '';
    if (parentId) {
      const parent = await this.prisma.orgNode.findFirst({
        where: { id: parentId, tenantId },
      });
      if (parent) {
        parentPrefix = `${parent.code}-`;
      }
    }

    const basePrefix = `${parentPrefix}${typePrefix}`;

    const existing = await this.prisma.orgNode.findMany({
      where: {
        tenantId,
        code: { startsWith: basePrefix },
        deletedAt: undefined, // soft-deleted codes stay reserved
      },
      select: { code: true },
    });

    let maxNum = 0;
    const regex = new RegExp(`^${basePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-?(\\d+)$`, 'i');
    for (const item of existing) {
      const match = item.code.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    const nextNum = maxNum + 1;
    const formattedNum = nextNum.toString().padStart(2, '0');
    return `${basePrefix}-${formattedNum}`;
  }

  async createNode(tenantId: string, dto: CreateOrgNodeDto, actorId?: string) {
    await this.tenantRefs.assertOptional(tenantId, 'user', dto.ownerId, 'Owner');
    await this.assertNodeType(tenantId, dto.nodeType);

    let code = dto.code ? dto.code.trim().toUpperCase().replace(/\s+/g, '-') : '';
    if (!code) {
      code = await this.generateNextOrgNodeCode(tenantId, dto.nodeType, dto.parentId);
    }

    // Codes are unique within the tenant; a typed code is reported, never silently replaced
    const existing = await this.prisma.orgNode.findFirst({
      where: { tenantId, code, deletedAt: undefined },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Org node code '${code}' is already in use`);
    }

    let parentPath = `/${tenantId}/`;
    let depth = 0;
    let parentNode: OrgNode | null = null;

    if (dto.parentId) {
      parentNode = await this.prisma.orgNode.findFirst({
        where: { id: dto.parentId, tenantId },
      });
      if (!parentNode) {
        throw new NotFoundException(`Parent node with ID '${dto.parentId}' not found`);
      }
      parentPath = parentNode.path;
      depth = parentNode.depth + 1;
    }

    const path = `${parentPath}${code}/`;

    const createdNode = await this.prisma.orgNode.create({
      data: {
        tenantId,
        parentId: dto.parentId,
        name: dto.name,
        code,
        nodeType: dto.nodeType,
        path,
        depth,
        sortOrder: dto.sortOrder || 0,
      },
    });

    // Auto-create Location in Location & Area Master Directory if requested
    if (dto.autoCreateLocation) {
      let areaCode = `LOC-${code}`;
      while (await this.prisma.location.findFirst({ where: { tenantId, areaCode } })) {
        areaCode = `LOC-${code}-${Math.floor(100 + Math.random() * 900)}`;
      }

      // An explicit location type always wins; the node type only suggests one when none was chosen
      const suggestedType: Record<string, string> = {
        STORAGE_RACK: 'WAREHOUSE_BAY',
        QUARANTINE_ZONE: 'RED_TAG_ZONE',
        WORKBENCH: 'WORKSHOP',
      };
      const locationType = dto.locationType || suggestedType[dto.nodeType] || 'PRODUCTION_LINE';

      await this.subscription.assertWithinLimit(tenantId, 'locations');
      const location = await this.prisma.location.create({
        data: {
          tenantId,
          orgNodeId: createdNode.id,
          areaCode,
          name: dto.name,
          locationType,
          riskLevel: dto.riskLevel || 'MEDIUM',
          auditFrequency: dto.auditFrequency || 'WEEKLY',
          building: dto.building?.trim() || null,
          floor: dto.floor?.trim() || null,
          description: dto.description?.trim() || null,
          ownerId: dto.ownerId || null,
          qrCodeData: buildLocationQrPayload(tenantId, areaCode),
          status: 'ACTIVE',
        },
      });
      await this.prisma.locationTimeline.createMany({
        data: defaultMilestoneRows(tenantId, location.id, 'Standard 5S Implementation Roadmap'),
      });
      await this.prisma.locationAuditLog.create({
        data: {
          tenantId,
          locationId: location.id,
          userId: actorId ?? null,
          actionType: 'CREATED',
          details: JSON.stringify({ action: 'Created with organization unit', areaCode, name: location.name, orgNode: code }),
        },
      });
    }

    return this.getNodeById(tenantId, createdNode.id);
  }

  async updateNode(tenantId: string, id: string, dto: UpdateOrgNodeDto) {
    const node = await this.getNodeById(tenantId, id);
    // A unit keeps its current type even if that level was later removed from the settings
    if (dto.nodeType && dto.nodeType !== node.nodeType) await this.assertNodeType(tenantId, dto.nodeType);

    const newCode = dto.code ? dto.code.trim().toUpperCase().replace(/\s+/g, '-') : undefined;

    // If code changed, update current and all descendant paths
    let newPath = node.path;
    const codeChanged = !!newCode && newCode !== node.code;
    if (codeChanged) {
      const clash = await this.prisma.orgNode.findFirst({
        where: { tenantId, code: newCode, NOT: { id } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(`Org node code '${newCode}' is already in use`);
      }
      // Paths end with "<code>/"; replace only that trailing segment (plain string ops, no regex on user input)
      const oldSegment = `${node.code}/`;
      newPath = node.path.endsWith(oldSegment) ? `${node.path.slice(0, -oldSegment.length)}${newCode}/` : node.path;
    }

    const descendants = codeChanged
      ? await this.prisma.orgNode.findMany({
          where: { tenantId, path: { startsWith: node.path }, NOT: { id } },
          select: { id: true, path: true },
        })
      : [];

    // Node and descendant paths change together or not at all
    const updates = descendants.map((child) =>
      this.prisma.orgNode.update({
        where: { id: child.id },
        data: { path: newPath + child.path.slice(node.path.length) },
      }),
    );
    const results = await this.prisma.$transaction([
      ...updates,
      this.prisma.orgNode.update({
        where: { id },
        data: {
          name: dto.name,
          code: codeChanged ? newCode : undefined,
          nodeType: dto.nodeType,
          sortOrder: dto.sortOrder,
          status: dto.status,
          path: newPath,
        },
      }),
    ]);
    return results[results.length - 1];
  }

  /** Moves a node (with its sub-tree) under another node, or to the top level when no new parent is given. */
  async moveNode(tenantId: string, id: string, dto: MoveOrgNodeDto) {
    const node = await this.getNodeById(tenantId, id);
    const newParent = dto.newParentId ? await this.getNodeById(tenantId, dto.newParentId) : null;

    if (newParent && (newParent.id === node.id || newParent.path.startsWith(node.path))) {
      throw new BadRequestException('Cannot move a node inside itself or one of its own descendants.');
    }

    const newDepth = newParent ? newParent.depth + 1 : 0;
    const oldPath = node.path;
    const newPath = `${newParent ? newParent.path : `/${tenantId}/`}${node.code}/`;

    const descendants = await this.prisma.orgNode.findMany({
      where: { tenantId, path: { startsWith: oldPath }, NOT: { id } },
      select: { id: true, path: true, depth: true },
    });

    // The node and its whole sub-tree move together or not at all
    await this.prisma.$transaction([
      this.prisma.orgNode.update({
        where: { id },
        data: {
          parentId: newParent ? newParent.id : null,
          depth: newDepth,
          path: newPath,
        },
      }),
      ...descendants.map((d) =>
        this.prisma.orgNode.update({
          where: { id: d.id },
          data: {
            path: newPath + d.path.slice(oldPath.length),
            depth: newDepth + (d.depth - node.depth),
          },
        }),
      ),
    ]);

    return this.getNodeById(tenantId, id);
  }

  async deleteNode(tenantId: string, id: string, actorId: string) {
    const node = await this.getNodeById(tenantId, id);
    const childNodes = await this.prisma.orgNode.count({ where: { tenantId, parentId: id } });
    if (childNodes > 0) {
      throw new BadRequestException(`Cannot delete node '${node.name}' because it has ${childNodes} child node(s). Delete or move them first.`);
    }
    const childLocations = await this.prisma.location.count({
      where: { tenantId, orgNodeId: id },
    });
    if (childLocations > 0) {
      throw new BadRequestException(`Cannot delete node '${node.name}' because it contains ${childLocations} active locations. Reassign locations first.`);
    }

    return this.prisma.orgNode.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });
  }
}

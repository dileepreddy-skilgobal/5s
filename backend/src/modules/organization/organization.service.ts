import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateOrgNodeDto, UpdateOrgNodeDto, MoveOrgNodeDto } from './dto/organization.dto';
import * as QRCode from 'qrcode';

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
  qrCodeData?: string | null;
}

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveTenantId(tenantIdOrSlug: string): Promise<string> {
    if (!tenantIdOrSlug) return '39aa6fa6-fb16-44f6-81cf-05f3670f1df6';
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdOrSlug);
    if (isUuid) {
      return tenantIdOrSlug;
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantIdOrSlug },
    });
    return tenant ? tenant.id : tenantIdOrSlug;
  }

  async getTreeByTenant(rawTenantId: string): Promise<OrgTreeNode[]> {
    const tenantId = await this.resolveTenantId(rawTenantId);
    const nodes = await this.prisma.orgNode.findMany({
      where: { tenantId },
      orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { locations: true },
        },
      },
    });

    const nodeMap = new Map<string, OrgTreeNode>();
    const roots: OrgTreeNode[] = [];

    // Map all nodes
    for (const n of nodes) {
      const qrPayload = JSON.stringify({
        type: '5S_ORG_NODE',
        tenantId,
        nodeId: n.id,
        code: n.code,
        name: n.name,
        nodeType: n.nodeType,
      });
      let qrCodeData: string | null = null;
      try {
        qrCodeData = await QRCode.toDataURL(qrPayload, { width: 300, margin: 2 });
      } catch (e) {
        qrCodeData = null;
      }

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
        qrCodeData,
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

  async getAllNodesFlat(rawTenantId: string) {
    const tenantId = await this.resolveTenantId(rawTenantId);
    const nodes = await this.prisma.orgNode.findMany({
      where: { tenantId },
      orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }],
      include: {
        parent: { select: { id: true, name: true, code: true, nodeType: true } },
        _count: { select: { locations: true, children: true } },
      },
    });

    return Promise.all(
      nodes.map(async (n) => {
        const qrPayload = JSON.stringify({
          type: '5S_ORG_NODE',
          tenantId,
          nodeId: n.id,
          code: n.code,
          name: n.name,
          nodeType: n.nodeType,
        });
        let qrCodeData: string | null = null;
        try {
          qrCodeData = await QRCode.toDataURL(qrPayload, { width: 300, margin: 2 });
        } catch (e) {
          qrCodeData = null;
        }
        return {
          ...n,
          qrCodeData,
        };
      }),
    );
  }

  async getNodeById(rawTenantId: string, id: string) {
    const tenantId = await this.resolveTenantId(rawTenantId);
    const node = await this.prisma.orgNode.findFirst({
      where: { id, tenantId },
      include: {
        parent: true,
        children: {
          include: {
            _count: { select: { locations: true } },
          },
        },
        locations: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!node) {
      throw new NotFoundException(`Organizational node with ID '${id}' not found`);
    }

    const qrPayload = JSON.stringify({
      type: '5S_ORG_NODE',
      tenantId,
      nodeId: node.id,
      code: node.code,
      name: node.name,
      nodeType: node.nodeType,
    });
    let qrCodeData: string | null = null;
    try {
      qrCodeData = await QRCode.toDataURL(qrPayload, { width: 300, margin: 2 });
    } catch (e) {
      qrCodeData = null;
    }

    return {
      ...node,
      qrCodeData,
    };
  }

  async generateNextOrgNodeCode(rawTenantId: string, nodeType: string, parentId?: string): Promise<string> {
    const tenantId = await this.resolveTenantId(rawTenantId);

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

    const typePrefix = prefixMap[nodeType] || 'NOD';

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

  async createNode(rawTenantId: string, dto: CreateOrgNodeDto) {
    const tenantId = await this.resolveTenantId(rawTenantId);

    let code = dto.code ? dto.code.trim().toUpperCase().replace(/\s+/g, '-') : '';
    if (!code) {
      code = await this.generateNextOrgNodeCode(tenantId, dto.nodeType, dto.parentId);
    }

    // Ensure uniqueness within tenant
    let existing = await this.prisma.orgNode.findFirst({
      where: { tenantId, code },
    });
    if (existing) {
      code = await this.generateNextOrgNodeCode(tenantId, dto.nodeType, dto.parentId);
    }

    let parentPath = `/${tenantId}/`;
    let depth = 0;
    let parentNode: any = null;

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
      let areaCode = `LOC-${dto.code}`;
      while (await this.prisma.location.findFirst({ where: { tenantId, areaCode } })) {
        areaCode = `LOC-${dto.code}-${Math.floor(100 + Math.random() * 900)}`;
      }

      const qrPayload = JSON.stringify({
        type: '5S_LOCATION_AUDIT',
        tenantId,
        areaCode,
        locationName: dto.name,
        nodeType: dto.nodeType,
        orgNodeId: createdNode.id,
      });
      const locQrCodeData = await QRCode.toDataURL(qrPayload, { width: 300, margin: 2 });

      let mappedLocType = dto.locationType || 'PRODUCTION_LINE';
      if (dto.nodeType === 'STORAGE_RACK') mappedLocType = 'WAREHOUSE_BAY';
      else if (dto.nodeType === 'QUARANTINE_ZONE') mappedLocType = 'RED_TAG_ZONE';
      else if (dto.nodeType === 'WORKBENCH') mappedLocType = 'WORKSHOP';

      await this.prisma.location.create({
        data: {
          tenantId,
          orgNodeId: createdNode.id,
          areaCode,
          name: dto.name,
          locationType: mappedLocType,
          riskLevel: dto.riskLevel || 'MEDIUM',
          auditFrequency: dto.auditFrequency || 'WEEKLY',
          building: dto.building || (parentNode?.name ? `${parentNode.name}` : 'Main Plant'),
          floor: dto.floor || 'Ground Floor',
          description: dto.description || `${dto.nodeType.replace(/_/g, ' ')} registered under ${parentNode?.name || 'Enterprise'}`,
          ownerId: dto.ownerId || null,
          qrCodeData: locQrCodeData,
          status: 'ACTIVE',
        },
      });
    }

    return this.getNodeById(tenantId, createdNode.id);
  }

  async updateNode(rawTenantId: string, id: string, dto: UpdateOrgNodeDto) {
    const tenantId = await this.resolveTenantId(rawTenantId);
    const node = await this.getNodeById(tenantId, id);

    // If code changed, update current and all child paths
    let newPath = node.path;
    if (dto.code && dto.code !== node.code) {
      const oldCodeSegment = `${node.code}/`;
      const newCodeSegment = `${dto.code}/`;
      newPath = node.path.replace(new RegExp(`${oldCodeSegment}$`), newCodeSegment);

      // Update descendants
      const children = await this.prisma.orgNode.findMany({
        where: { tenantId, path: { startsWith: node.path } },
      });

      for (const child of children) {
        if (child.id !== node.id) {
          const updatedChildPath = child.path.replace(node.path, newPath);
          await this.prisma.orgNode.update({
            where: { id: child.id },
            data: { path: updatedChildPath },
          });
        }
      }
    }

    return this.prisma.orgNode.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        nodeType: dto.nodeType,
        sortOrder: dto.sortOrder,
        status: dto.status,
        path: newPath,
      },
    });
  }

  async moveNode(rawTenantId: string, id: string, dto: MoveOrgNodeDto) {
    const tenantId = await this.resolveTenantId(rawTenantId);
    const node = await this.getNodeById(tenantId, id);
    const newParent = await this.getNodeById(tenantId, dto.newParentId);

    if (newParent.path.startsWith(node.path)) {
      throw new BadRequestException('Cannot move a node inside one of its own descendants.');
    }

    const newDepth = newParent.depth + 1;
    const oldPath = node.path;
    const newPath = `${newParent.path}${node.code}/`;

    // Update node
    await this.prisma.orgNode.update({
      where: { id },
      data: {
        parentId: newParent.id,
        depth: newDepth,
        path: newPath,
      },
    });

    // Update all descendants
    const descendants = await this.prisma.orgNode.findMany({
      where: { tenantId, path: { startsWith: oldPath } },
    });

    for (const d of descendants) {
      if (d.id !== id) {
        const depthDiff = d.depth - node.depth;
        const updatedPath = d.path.replace(oldPath, newPath);
        await this.prisma.orgNode.update({
          where: { id: d.id },
          data: {
            path: updatedPath,
            depth: newDepth + depthDiff,
          },
        });
      }
    }

    return this.getNodeById(tenantId, id);
  }

  async deleteNode(rawTenantId: string, id: string) {
    const tenantId = await this.resolveTenantId(rawTenantId);
    const node = await this.getNodeById(tenantId, id);
    const childLocations = await this.prisma.location.count({
      where: { tenantId, orgNodeId: id },
    });
    if (childLocations > 0) {
      throw new BadRequestException(`Cannot delete node '${node.name}' because it contains ${childLocations} active locations. Reassign locations first.`);
    }

    return this.prisma.orgNode.delete({
      where: { id },
    });
  }
}

import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateTenantDto, UpdateTenantDto, OnboardingWizardDto } from './dto/tenant.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertSuperAdmin(userId?: string) {
    if (!userId) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true, email: true },
    });
    if (user && !user.isSuperAdmin && user.email !== 'superadmin@skilglobal.com') {
      throw new ForbiddenException('Access Restricted: Only SaaS Platform Super Administrators can manage tenant organizations.');
    }
  }

  async createTenant(dto: CreateTenantDto, userId?: string) {
    await this.assertSuperAdmin(userId);
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(`Tenant with slug '${dto.slug}' already exists`);
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        industry: dto.industry || 'Manufacturing',
        logoUrl: dto.logoUrl,
        storageQuotaMb: dto.storageQuotaMb || 5120,
      },
    });

    // Seed default RBAC roles for this new tenant
    await this.seedDefaultRoles(tenant.id);

    return tenant;
  }

  async getAllTenants() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            locations: true,
            orgNodes: true,
          },
        },
      },
    });
    return tenants;
  }

  async getTenantById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            locations: true,
            orgNodes: true,
          },
        },
      },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${id}' not found`);
    }
    return tenant;
  }

  async updateTenant(id: string, dto: UpdateTenantDto, userId?: string) {
    await this.assertSuperAdmin(userId);
    await this.getTenantById(id);
    return this.prisma.tenant.update({
      where: { id },
      data: dto,
    });
  }

  async toggleStatus(id: string, status: string, userId?: string) {
    await this.assertSuperAdmin(userId);
    await this.getTenantById(id);
    return this.prisma.tenant.update({
      where: { id },
      data: { status },
    });
  }

  async executeOnboarding(dto: OnboardingWizardDto, userId?: string) {
    await this.assertSuperAdmin(userId);
    // 1. Create or retrieve Tenant
    let tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.orgSlug },
    });

    if (!tenant) {
      tenant = await this.prisma.tenant.create({
        data: {
          name: dto.orgName,
          slug: dto.orgSlug,
          industry: dto.industry || 'Manufacturing',
          logoUrl: dto.logoUrl,
        },
      });
      await this.seedDefaultRoles(tenant.id);
    } else if (dto.logoUrl) {
      tenant = await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { logoUrl: dto.logoUrl },
      });
    }

    const tenantId = tenant.id;

    // 2. Create Root Org Node
    const rootCode = `${dto.orgSlug.toUpperCase()}-ROOT`;
    let rootNode = await this.prisma.orgNode.findFirst({
      where: { tenantId, depth: 0 },
    });

    if (!rootNode) {
      rootNode = await this.prisma.orgNode.create({
        data: {
          tenantId,
          name: dto.orgName,
          code: rootCode,
          nodeType: 'ENTERPRISE',
          path: `/${tenantId}/`,
          depth: 0,
        },
      });
    }

    // 3. Create Admin User
    const adminEmail = dto.adminEmail || `admin@${dto.orgSlug}.com`;
    const passwordHash = await bcrypt.hash('Admin@123456', 10);
    const adminUser = await this.prisma.user.upsert({
      where: { tenantId_email: { tenantId, email: adminEmail } },
      update: {},
      create: {
        tenantId,
        email: adminEmail,
        passwordHash,
        firstName: dto.adminName ? dto.adminName.split(' ')[0] : 'Organization',
        lastName: dto.adminName ? dto.adminName.split(' ').slice(1).join(' ') || 'Admin' : 'Admin',
        jobTitle: '5S Operations Director',
        department: 'Operations & Quality',
        isSuperAdmin: false,
      },
    });

    // Assign ORG_ADMIN role
    const orgAdminRole = await this.prisma.role.findFirst({
      where: { tenantId, code: 'ORG_ADMIN' },
    });
    if (orgAdminRole) {
      const existingAssignment = await this.prisma.userRoleAssignment.findFirst({
        where: { tenantId, userId: adminUser.id, roleId: orgAdminRole.id },
      });
      if (!existingAssignment) {
        await this.prisma.userRoleAssignment.create({
          data: {
            tenantId,
            userId: adminUser.id,
            roleId: orgAdminRole.id,
          },
        });
      }
    }

    // 4. Create Sample Plants & Departments
    const sites = dto.sites && dto.sites.length > 0 ? dto.sites : ['Main Plant Alpha', 'Plant Beta Logistics'];
    const departments = dto.departments && dto.departments.length > 0 ? dto.departments : ['Machining & Fabrication', 'Assembly Line 1', 'Quality Assurance', 'Warehouse & Stores'];

    for (let i = 0; i < sites.length; i++) {
      const siteName = sites[i];
      const siteCode = `${dto.orgSlug.toUpperCase()}-PLANT-${i + 1}`;

      const plantNode = await this.prisma.orgNode.upsert({
        where: { tenantId_code: { tenantId, code: siteCode } },
        update: {},
        create: {
          tenantId,
          parentId: rootNode.id,
          name: siteName,
          code: siteCode,
          nodeType: 'PLANT',
          path: `${rootNode.path}${siteCode}/`,
          depth: 1,
          sortOrder: i + 1,
        },
      });

      // Create Departments under first plant
      if (i === 0) {
        for (let j = 0; j < departments.length; j++) {
          const deptName = departments[j];
          const deptCode = `${siteCode}-DEPT-${j + 1}`;

          const deptNode = await this.prisma.orgNode.upsert({
            where: { tenantId_code: { tenantId, code: deptCode } },
            update: {},
            create: {
              tenantId,
              parentId: plantNode.id,
              name: deptName,
              code: deptCode,
              nodeType: 'DEPARTMENT',
              path: `${plantNode.path}${deptCode}/`,
              depth: 2,
              sortOrder: j + 1,
            },
          });

          // Create Sample Location under first department
          if (j === 0) {
            const areaCode = `LOC-${siteCode.slice(-4)}-${deptCode.slice(-4)}-01`;
            const sampleLocation = await this.prisma.location.upsert({
              where: { tenantId_areaCode: { tenantId, areaCode } },
              update: {},
              create: {
                tenantId,
                orgNodeId: deptNode.id,
                areaCode,
                name: `${deptName} - Primary Cell 01`,
                locationType: 'PRODUCTION_LINE',
                riskLevel: 'MEDIUM',
                auditFrequency: 'WEEKLY',
                building: 'Building A',
                floor: 'Ground Floor',
                description: 'Primary machining & CNC cell with shadow tool boards and designated scrap area.',
                ownerId: adminUser.id,
                qrCodeData: `5s://${dto.orgSlug}/locations/${areaCode}`,
              },
            });

            // Create initial Location Timeline milestones
            const now = new Date();
            const milestones = [
              { name: '1S Sort & Red Tag Sorting Campaign', offsetDays: 7, status: 'COMPLETED', progress: 100 },
              { name: '2S Set-In-Order Shadow Boards & Floor Markings', offsetDays: 14, status: 'IN_PROGRESS', progress: 65 },
              { name: '3S Shine Cleaning Schedule & Inspection Routine', offsetDays: 21, status: 'NOT_STARTED', progress: 0 },
              { name: '4S Standard Operating Procedures Rollout', offsetDays: 28, status: 'NOT_STARTED', progress: 0 },
              { name: '5S Sustain Audit Launch & Leaderboards', offsetDays: 35, status: 'NOT_STARTED', progress: 0 },
            ];

            for (const m of milestones) {
              const plannedEnd = new Date(now.getTime() + m.offsetDays * 86400000);
              await this.prisma.locationTimeline.create({
                data: {
                  tenantId,
                  locationId: sampleLocation.id,
                  milestoneName: m.name,
                  plannedStartDate: now,
                  plannedEndDate: plannedEnd,
                  progressPercent: m.progress,
                  status: m.status,
                  notes: `Automated onboarding milestone for ${m.name}`,
                },
              });
            }
          }
        }
      }
    }

    return {
      message: 'Onboarding completed successfully',
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      adminEmail,
    };
  }

  private async seedDefaultRoles(tenantId: string) {
    const roles = [
      { code: 'SUPER_ADMIN', name: 'SaaS Super Administrator', desc: 'Platform-level administrator with full tenant governance access.' },
      { code: 'ORG_ADMIN', name: 'Organisation Administrator', desc: 'Full administrative access across all sites, templates, and workflows.' },
      { code: 'PLANT_HEAD', name: 'Plant Head / Site Director', desc: 'Visibility of plant scores, overdue actions, and cross-department rankings.' },
      { code: 'COORDINATOR_5S', name: '5S Program Coordinator', desc: 'Governance, audit planning, standard authoring, and escalation monitoring.' },
      { code: 'DEPT_HEAD', name: 'Department Head', desc: 'Management of department-level 5S compliance and action assignments.' },
      { code: 'AREA_OWNER', name: 'Area / Zone Owner', desc: 'Accountable for maintaining daily 5S standards within assigned workstation.' },
      { code: 'AUDITOR', name: 'Certified 5S Auditor', desc: 'Conducts mobile audits, records observations, and captures photographic evidence.' },
      { code: 'EMPLOYEE', name: 'General Shop-floor Employee', desc: 'View visual standards, report abnormalities, and access Red Tag campaigns.' },
      { code: 'EXTERNAL_AUDITOR', name: 'External Consultant / Auditor', desc: 'Time-bound read-only assessment access.' },
    ];

    for (const r of roles) {
      await this.prisma.role.upsert({
        where: { tenantId_code: { tenantId, code: r.code } },
        update: {},
        create: {
          tenantId,
          code: r.code,
          name: r.name,
          description: r.desc,
          isSystemDefault: true,
        },
      });
    }
  }
}

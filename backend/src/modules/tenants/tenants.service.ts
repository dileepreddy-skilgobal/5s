import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SubscriptionService } from '../../core/subscription/subscription.service';
import { FilesService } from '../../core/storage/files.service';
import { CreateTenantDto, UpdateTenantDto, OnboardingWizardDto } from './dto/tenant.dto';
import { generateTemporaryPassword, hashSecret } from '../../core/auth/credentials';
import { resolveTenantLogo } from './tenant-logo';
import { createStarterStandards, createStarterTemplate } from './starter-content';

/** Who is acting and in which tenant context the request runs (inline uploads are stored there first). */
export interface TenantActor {
  userId: string;
  tenantId: string;
}

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'active', TRIAL: 'trial', SUSPENDED: 'suspended', CANCELLED: 'cancelled' };

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscription: SubscriptionService,
    private readonly files: FilesService,
  ) {}

  async assertSuperAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Access Restricted: Only SaaS Platform Super Administrators can manage tenant organizations.');
    }
  }

  async createTenant(dto: CreateTenantDto, actor: TenantActor) {
    const userId = actor.userId;
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
        storageQuotaMb: dto.storageQuotaMb || 5120,
      },
    });
    // New organizations start on the default plan's free trial; an explicit quota overrides the plan's
    const trial = await this.subscription.trialDefaults();
    const logoUrl = await resolveTenantLogo(this.prisma, this.files, { callerTenantId: actor.tenantId, targetTenantId: tenant.id, uploadedById: userId, value: dto.logoUrl });
    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { ...trial, ...(dto.storageQuotaMb ? { storageQuotaMb: dto.storageQuotaMb } : {}), ...(logoUrl ? { logoUrl } : {}) },
    });

    // Seed default RBAC roles for this new tenant
    await this.seedDefaultRoles(tenant.id);

    return this.prisma.tenant.findUnique({ where: { id: tenant.id } });
  }

  async getAllTenants() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: { where: { deletedAt: null } },
            locations: { where: { deletedAt: null } },
            orgNodes: { where: { deletedAt: null } },
          },
        },
      },
    });
    // Each logo lives in its own tenant's storage, so it is signed for that tenant, not the operator's
    return tenants.map((t) => ({ ...t, logoUrl: t.logoUrl ? this.files.signString(t.logoUrl, t.id) : t.logoUrl }));
  }

  async getTenantById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: { where: { deletedAt: null } },
            locations: { where: { deletedAt: null } },
            orgNodes: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${id}' not found`);
    }
    return tenant;
  }

  async updateTenant(id: string, dto: UpdateTenantDto, actor: TenantActor) {
    await this.assertSuperAdmin(actor.userId);
    const tenant = await this.getTenantById(id);
    const logoUrl = await resolveTenantLogo(this.prisma, this.files, { callerTenantId: actor.tenantId, targetTenantId: id, uploadedById: actor.userId, value: dto.logoUrl });
    const status = dto.status !== undefined ? await this.nextStatus(tenant, dto.status) : undefined;
    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.industry !== undefined ? { industry: dto.industry.trim() } : {}),
        ...(dto.storageQuotaMb !== undefined ? { storageQuotaMb: dto.storageQuotaMb } : {}),
        ...(dto.hierarchyConfig !== undefined ? { hierarchyConfig: dto.hierarchyConfig } : {}),
        ...(dto.settings !== undefined ? { settings: dto.settings } : {}),
        ...(logoUrl !== undefined ? { logoUrl } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });
  }

  /** Suspends an ACTIVE / TRIAL organization or reactivates a suspended one (see nextStatus). */
  async toggleStatus(id: string, status: string, userId: string) {
    await this.assertSuperAdmin(userId);
    const tenant = await this.getTenantById(id);
    return this.prisma.tenant.update({
      where: { id },
      data: { status: await this.nextStatus(tenant, status) },
    });
  }

  /**
   * Status changes allowed outside the subscription editor: suspend (ACTIVE / TRIAL -> SUSPENDED) and
   * reactivate (SUSPENDED -> the status it had before). A trial or cancelled organization is never turned
   * into a paying ACTIVE one here; that is a plan decision made in the subscription editor.
   */
  private async nextStatus(tenant: { id: string; status: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null }, requested: string) {
    if (requested === tenant.status) return requested;
    if (requested === 'SUSPENDED') {
      if (tenant.status !== 'ACTIVE' && tenant.status !== 'TRIAL') {
        throw new BadRequestException(`A ${STATUS_LABEL[tenant.status] ?? tenant.status} organization cannot be suspended.`);
      }
      return 'SUSPENDED';
    }
    if (requested === 'ACTIVE' || requested === 'TRIAL') {
      if (tenant.status !== 'SUSPENDED') {
        throw new BadRequestException('Only a suspended organization can be reactivated here. Change the plan or status in the subscription editor.');
      }
      return this.statusBeforeSuspension(tenant);
    }
    throw new BadRequestException('Cancel an organization from the subscription editor.');
  }

  /** The status recorded just before the last suspension, else the one its subscription dates imply. */
  private async statusBeforeSuspension(tenant: { id: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null }): Promise<string> {
    const entries = await this.prisma.activityLog.findMany({
      where: { entityType: 'Tenant', entityId: tenant.id, outcome: 'SUCCESS', changes: { contains: '"status"' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { changes: true },
    });
    for (const entry of entries) {
      try {
        const change = JSON.parse(entry.changes ?? '{}')?.diff?.status as { from?: unknown; to?: unknown } | undefined;
        if (change?.to === 'SUSPENDED' && (change.from === 'ACTIVE' || change.from === 'TRIAL')) return change.from;
      } catch {
        // unreadable entry: keep looking
      }
    }
    if (tenant.currentPeriodEnd) return 'ACTIVE';
    return tenant.trialEndsAt ? 'TRIAL' : 'ACTIVE';
  }

  async executeOnboarding(dto: OnboardingWizardDto, actor: TenantActor) {
    const userId = actor.userId;
    await this.assertSuperAdmin(userId);
    // 1. Create the organization (an existing code is refused rather than silently reused)
    if (await this.prisma.tenant.findUnique({ where: { slug: dto.orgSlug }, select: { id: true } })) {
      throw new ConflictException(`An organization with the code '${dto.orgSlug}' already exists. Choose another code.`);
    }
    let tenant = await this.prisma.tenant.create({
      data: {
        name: dto.orgName,
        slug: dto.orgSlug,
        ...(dto.industry ? { industry: dto.industry } : {}),
        ...(await this.subscription.trialDefaults()),
      },
    });
    await this.seedDefaultRoles(tenant.id);
    // The wizard's upload was stored in the operator's tenant context; it is copied into the new organization
    const logoUrl = dto.logoUrl
      ? await resolveTenantLogo(this.prisma, this.files, { callerTenantId: actor.tenantId, targetTenantId: tenant.id, uploadedById: userId, value: dto.logoUrl })
      : undefined;
    if (logoUrl) {
      tenant = await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { logoUrl },
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
    const adminEmail = (dto.adminEmail || `admin@${dto.orgSlug}.com`).toLowerCase();
    const existingAdmin = await this.prisma.user.findFirst({
      where: { tenantId, email: { equals: adminEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    // A one-time password is generated only for a newly provisioned admin and returned once
    const adminTemporaryPassword = existingAdmin ? undefined : generateTemporaryPassword();
    const adminUser = existingAdmin ?? await this.prisma.user.create({
      data: {
        tenantId,
        email: adminEmail,
        passwordHash: await hashSecret(adminTemporaryPassword),
        firstName: dto.adminName ? dto.adminName.split(' ')[0] : 'Organization',
        lastName: dto.adminName ? dto.adminName.split(' ').slice(1).join(' ') || 'Admin' : 'Admin',
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

    // 4. Sites and departments exactly as entered (departments go under the first site); areas are added later
    const sites = (dto.sites ?? []).map((n) => n.trim()).filter(Boolean);
    const departments = (dto.departments ?? []).map((n) => n.trim()).filter(Boolean);
    let departmentsCreated = 0;

    for (let i = 0; i < sites.length; i++) {
      const siteCode = `${dto.orgSlug.toUpperCase()}-PLANT-${i + 1}`;
      const plantNode = await this.prisma.orgNode.create({
        data: {
          tenantId,
          parentId: rootNode.id,
          name: sites[i],
          code: siteCode,
          nodeType: 'PLANT',
          path: `${rootNode.path}${siteCode}/`,
          depth: 1,
          sortOrder: i + 1,
        },
      });
      if (i === 0) {
        for (let j = 0; j < departments.length; j++) {
          const deptCode = `${siteCode}-DEPT-${j + 1}`;
          await this.prisma.orgNode.create({
            data: {
              tenantId,
              parentId: plantNode.id,
              name: departments[j],
              code: deptCode,
              nodeType: 'DEPARTMENT',
              path: `${plantNode.path}${deptCode}/`,
              depth: 2,
              sortOrder: j + 1,
            },
          });
          departmentsCreated++;
        }
      }
    }

    // 5. Optional starter content, all or nothing
    const starter = await this.prisma.$transaction(async (tx) => ({
      templateId: dto.starterTemplate ? await createStarterTemplate(tx, tenantId) : null,
      standardsCreated: dto.starterStandards ? await createStarterStandards(tx, tenantId, adminUser.id) : 0,
    }));

    return {
      message: 'Onboarding completed successfully',
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      adminEmail,
      adminTemporaryPassword,
      sitesCreated: sites.length,
      departmentsCreated,
      starterTemplateCreated: starter.templateId !== null,
      starterStandardsCreated: starter.standardsCreated,
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
      { code: 'EXECUTIVE', name: 'Executive Management', desc: 'Read-only dashboards, summaries, trends and comparisons across the organization.' },
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

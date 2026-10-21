// Ensures the second organization the tenant-isolation checks attack: "Apex Aerospace (test)" (slug apex-aero) with an
// organization admin, admin@apex-aero.com / Admin@123456. The demo seed has one company only, so this fixture belongs to the
// e2e suite, not the seed. Idempotent; run from the backend dir: node test/e2e/support/second-tenant.cjs <backend dir>
const path = require('path');
const backend = process.argv[2] || process.cwd();
const { PrismaClient } = require(path.join(backend, 'node_modules/@prisma/client'));
const bcrypt = require(path.join(backend, 'node_modules/bcryptjs'));

const SLUG = 'apex-aero';
const ADMIN_EMAIL = 'admin@apex-aero.com';
// Same system roles as prisma/seed.ts creates for every organization
const ROLES = [
  ['SUPER_ADMIN', 'SaaS Super Administrator', 'Full multi-tenant governance.'],
  ['ORG_ADMIN', 'Organisation Administrator', 'Full administrative control.'],
  ['PLANT_HEAD', 'Plant Head / Site Director', 'Site-level visibility.'],
  ['COORDINATOR_5S', '5S Program Coordinator', 'Governance and standard authoring.'],
  ['DEPT_HEAD', 'Department Head', 'Department compliance management.'],
  ['AREA_OWNER', 'Area / Zone Owner', 'Accountable for daily 5S standards.'],
  ['AUDITOR', 'Certified 5S Auditor', 'Conducts mobile audits and logs findings.'],
  ['EMPLOYEE', 'Shop-Floor Employee', 'Report abnormalities.'],
  ['EXTERNAL_AUDITOR', 'External Consultant', 'Read-only assessment.'],
  ['EXECUTIVE', 'Executive Management', 'Read-only dashboards, summaries and comparisons.'],
];

const p = new PrismaClient();
(async () => {
  const plan = await p.plan.findUnique({ where: { code: 'ENTERPRISE' } });
  let tenant = await p.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) {
    tenant = await p.tenant.create({
      data: {
        name: 'Apex Aerospace (test)',
        slug: SLUG,
        status: 'ACTIVE',
        industry: 'Aerospace',
        planId: plan?.id ?? null,
        ...(plan ? { storageQuotaMb: plan.storageQuotaMb } : {}),
      },
    });
  }
  for (const [code, name, description] of ROLES) {
    const existing = await p.role.findFirst({ where: { tenantId: tenant.id, code } });
    if (!existing) await p.role.create({ data: { tenantId: tenant.id, code, name, description, isSystemDefault: true } });
  }
  if (!(await p.orgNode.findFirst({ where: { tenantId: tenant.id } }))) {
    await p.orgNode.create({ data: { tenantId: tenant.id, name: 'Apex Aerospace', code: 'APEX', nodeType: 'ENTERPRISE', path: `/${tenant.id}/APEX/`, depth: 0 } });
  }
  let admin = await p.user.findFirst({ where: { email: ADMIN_EMAIL } });
  if (!admin) {
    admin = await p.user.create({
      data: {
        tenantId: tenant.id,
        email: ADMIN_EMAIL,
        passwordHash: await bcrypt.hash('Admin@123456', 10),
        firstName: 'Apex',
        lastName: 'Admin',
        jobTitle: 'Quality Manager',
        department: 'Quality',
        status: 'ACTIVE',
      },
    });
  }
  const orgAdmin = await p.role.findFirst({ where: { tenantId: tenant.id, code: 'ORG_ADMIN' } });
  if (!(await p.userRoleAssignment.findFirst({ where: { userId: admin.id, roleId: orgAdmin.id } }))) {
    await p.userRoleAssignment.create({ data: { tenantId: tenant.id, userId: admin.id, roleId: orgAdmin.id } });
  }
  await p.$disconnect();
})().catch(async (err) => {
  console.error('Could not prepare the second test organization:', err);
  await p.$disconnect();
  process.exit(1);
});

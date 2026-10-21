// R8: plans, limits, feature gates, trial / lapsed read-only mode, platform metrics. Run from backend dir.
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body, tenant } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(tenant ? { 'x-tenant-id': tenant } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data ?? json, json };
};
const msg = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? '')}`;
const login = async (email, password = 'Admin@123456', tenantSlug) => (await req('POST', '/auth/login', { body: { email, password, ...(tenantSlug ? { tenantSlug } : {}) } })).data;
const SUPER = (await login('superadmin@skilglobal.com')).accessToken;
const ADMIN = (await login('admin@skilglobal.com')).accessToken;
const COORD = (await login('coordinator.5s@skilglobal.com')).accessToken;

// ---------- Catalogue & grandfathering ----------
let r = await req('GET', '/platform/plans', { token: SUPER });
check('default plans created', r.status === 200 && ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].every((c) => r.data.plans.some((p) => p.code === c)), r.data?.plans?.map((p) => p.code).join(','));
check('plan catalogue restricted to platform admins', (await req('GET', '/platform/plans', { token: ADMIN })).status === 403);
r = await req('GET', '/subscription', { token: ADMIN });
check('existing tenant grandfathered on Enterprise', r.status === 200 && r.data.plan?.code === 'ENTERPRISE' && r.data.readOnly === false, msg(r));
check('usage reported', typeof r.data.usage.users.used === 'number' && r.data.usage.users.limit === null && r.data.usage.storageMb.limit > 0, JSON.stringify(r.data.usage));
check('subscription view restricted to org admins', (await req('GET', '/subscription', { token: COORD })).status === 403);

// ---------- New organization starts on a trial ----------
const slug = `iso-sub-${Date.now()}`;
r = await req('POST', '/tenants', { token: SUPER, body: { name: 'ISO Subscription Org', slug } });
const tenant = r.data;
check('tenant created', r.status === 201, msg(r));
const t0 = await db.tenant.findUnique({ where: { id: tenant.id }, include: { plan: true } });
const trialDays = Math.round((t0.trialEndsAt - Date.now()) / 86400000);
check('new tenant on Professional trial (14 days)', t0.status === 'TRIAL' && t0.plan?.code === 'PROFESSIONAL' && trialDays === 14, `${t0.status} ${t0.plan?.code} ${trialDays}`);

const adminEmail = `iso-softdel-subadmin-${Date.now()}@example.com`;
r = await req('POST', '/users', { token: SUPER, tenant: tenant.id, body: { email: adminEmail, firstName: 'Iso', lastName: 'Owner', roleCode: 'ORG_ADMIN', password: 'IsoPass@12345' } });
check('org admin created in trial tenant', r.status === 201, msg(r));
let T = (await login(adminEmail, 'IsoPass@12345', slug)).accessToken;
r = await req('POST', '/organization/nodes', { token: T, body: { name: 'ISO Plant', code: 'ISO-PLANT', nodeType: 'PLANT' } });
const node = r.data;
check('trial tenant can work', r.status === 201, msg(r));
check('Professional trial has advanced analytics', (await req('GET', '/analytics/kpis', { token: T })).status === 200);

// ---------- Limits & feature gates on a small plan ----------
r = await req('POST', '/platform/plans', { token: SUPER, body: { code: 'ISO_TINY', name: 'ISO Tiny', priceMonthly: 10, maxUsers: 2, maxLocations: 1, storageQuotaMb: 100, features: [] } });
check('plan created', r.status === 201, msg(r));
check('duplicate plan code -> 409', (await req('POST', '/platform/plans', { token: SUPER, body: { code: 'ISO_TINY', name: 'Dup', priceMonthly: 1, maxUsers: null, maxLocations: null, storageQuotaMb: 100, features: [] } })).status === 409);
check('unknown feature rejected', (await req('POST', '/platform/plans', { token: SUPER, body: { code: 'ISO_BAD', name: 'x', priceMonthly: 1, maxUsers: null, maxLocations: null, storageQuotaMb: 100, features: ['TELEPORT'] } })).status === 400);
r = await req('PATCH', `/platform/tenants/${tenant.id}/subscription`, { token: SUPER, body: { planCode: 'ISO_TINY', status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(), billingEmail: 'billing@example.com' } });
check('super admin assigns plan & paid-through date', r.status === 200 && r.data.plan.code === 'ISO_TINY' && r.data.storageQuotaMb === 100 && r.data.readOnly === false, msg(r));
r = await req('POST', '/locations', { token: T, body: { name: 'ISO L1', areaCode: 'iso-sub-l1', orgNodeId: node.id, locationType: 'PRODUCTION_LINE' } });
check('first location allowed', r.status === 201, msg(r));
r = await req('POST', '/locations', { token: T, body: { name: 'ISO L2', areaCode: 'iso-sub-l2', orgNodeId: node.id, locationType: 'PRODUCTION_LINE' } });
check('location limit enforced', r.status === 403 && /PLAN_LIMIT_REACHED/.test(r.json?.message), msg(r));
r = await req('POST', '/users', { token: T, body: { email: `iso-softdel-sub2-${Date.now()}@example.com`, firstName: 'A', lastName: 'B', roleCode: 'EMPLOYEE', password: 'IsoPass@12345' } });
check('second user allowed (limit 2)', r.status === 201, msg(r));
r = await req('POST', '/users', { token: T, body: { email: `iso-softdel-sub3-${Date.now()}@example.com`, firstName: 'A', lastName: 'B', roleCode: 'EMPLOYEE', password: 'IsoPass@12345' } });
check('user limit enforced', r.status === 403 && /PLAN_LIMIT_REACHED/.test(r.json?.message), msg(r));
r = await req('GET', '/analytics/kpis', { token: T });
check('advanced analytics gated by plan', r.status === 403 && /PLAN_FEATURE_REQUIRED/.test(r.json?.message), msg(r));
check('basic dashboard still available', (await req('GET', '/analytics/maturity', { token: T })).status === 200);
check('recognition gated by plan', (await req('GET', '/analytics/gamification/overview', { token: T })).status === 403);
check('register preview available', (await req('GET', '/reports/locations', { token: T })).status === 200);
r = await fetch(`${B}/reports/locations?format=csv`, { headers: { Authorization: `Bearer ${T}` } });
check('file export gated by plan', r.status === 403);
r = await req('GET', '/subscription', { token: T });
check('summary shows limits and features', r.data.usage.locations.used === 1 && r.data.usage.locations.limit === 1 && r.data.features.every((f) => f.included === false), JSON.stringify(r.data.usage));
check('super admin is not limited by tenant plan', (await req('GET', '/analytics/kpis', { token: SUPER, tenant: tenant.id })).status === 200);

// ---------- Read-only after trial ends / subscription lapses ----------
await req('PATCH', `/platform/tenants/${tenant.id}/subscription`, { token: SUPER, body: { planCode: 'PROFESSIONAL', status: 'TRIAL', trialEndsAt: new Date(Date.now() - 86400000).toISOString() } });
T = (await login(adminEmail, 'IsoPass@12345', slug)).accessToken;
check('expired trial can still sign in and read', !!T && (await req('GET', '/locations', { token: T })).status === 200);
r = await req('POST', '/organization/nodes', { token: T, body: { name: 'ISO Dept', code: 'ISO-DEPT', nodeType: 'DEPARTMENT', parentId: node.id } });
check('expired trial is read-only (402)', r.status === 402 && /TRIAL_EXPIRED/.test(r.json?.message), msg(r));
check('notifications still usable', (await req('POST', '/notifications/read-all', { token: T })).status === 200);
r = await req('GET', '/subscription', { token: T });
check('summary explains read-only state', r.data.readOnly === true && r.data.readOnlyReason === 'TRIAL_EXPIRED');
check('super admin can still fix data', (await req('POST', '/organization/nodes', { token: SUPER, tenant: tenant.id, body: { name: 'ISO Dept SA', code: 'ISO-DEPT-SA', nodeType: 'DEPARTMENT', parentId: node.id } })).status === 201);

await req('PATCH', `/platform/tenants/${tenant.id}/subscription`, { token: SUPER, body: { status: 'ACTIVE', trialEndsAt: null, currentPeriodEnd: new Date(Date.now() - 3 * 86400000).toISOString() } });
check('within grace period writes allowed', (await req('POST', '/organization/nodes', { token: T, body: { name: 'ISO Grace', code: 'ISO-GRACE', nodeType: 'DEPARTMENT', parentId: node.id } })).status === 201);
await req('PATCH', `/platform/tenants/${tenant.id}/subscription`, { token: SUPER, body: { currentPeriodEnd: new Date(Date.now() - 10 * 86400000).toISOString() } });
r = await req('POST', '/organization/nodes', { token: T, body: { name: 'ISO Lapsed', code: 'ISO-LAPSED', nodeType: 'DEPARTMENT', parentId: node.id } });
check('lapsed subscription is read-only', r.status === 402 && /SUBSCRIPTION_LAPSED/.test(r.json?.message), msg(r));
r = await req('POST', '/auth/logout', { token: T });
check('sign-out works while read-only', r.status === 200, msg(r));

// ---------- Platform metrics ----------
r = await req('GET', '/platform/metrics', { token: SUPER });
const row = r.data.tenants.find((x) => x.id === tenant.id);
check('metrics include tenants, MRR and statuses', r.status === 200 && r.data.totals.tenants === r.data.tenants.length && r.data.tenants.length >= 2 && typeof r.data.totals.mrr === 'number', JSON.stringify(r.data.totals));
check('lapsed tenant flagged and excluded from MRR', row?.readOnly === true && row?.mrr === 0 && r.data.readOnlyTenants.some((x) => x.id === tenant.id));
check('metrics restricted', (await req('GET', '/platform/metrics', { token: ADMIN })).status === 403);

// ---------- Cleanup ----------
await db.tenant.delete({ where: { id: tenant.id } });
await db.plan.delete({ where: { code: 'ISO_TINY' } });
await db.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

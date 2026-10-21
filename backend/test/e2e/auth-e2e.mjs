const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body, headers = {} } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
const login = (email, password, extra = {}) => req('POST', '/auth/login', { body: { email, password, ...extra } });

let r = await req('GET', '/locations');
check('no token -> 401', r.status === 401, r.status);
const forged = '5s_jwt_' + Buffer.from(JSON.stringify({ sub: 'x', tenantId: 'y', role: 'SUPER_ADMIN' })).toString('base64');
r = await req('GET', '/locations', { token: forged });
check('legacy forged token -> 401', r.status === 401, r.status);
r = await req('GET', '/locations', { headers: { 'x-tenant-id': 'skilglobal-mfg', 'x-user-role': 'SUPER_ADMIN', 'x-super-admin': 'true' } });
check('spoofed identity headers without token -> 401', r.status === 401, r.status);

r = await login('admin@skilglobal.com', 'password');
check('demo password "password" rejected', r.status === 401, r.status);
r = await login('superadmin@skilglobal.com', 'wrong-Password1!', { tenantSlug: 'apex-aero' });
check('super admin wrong password rejected', r.status === 401, r.status);

r = await login('admin@skilglobal.com', 'Admin@123456');
check('org admin real login -> 200', r.status === 200, r.status);
const adminToken = r.json?.data?.accessToken;
check('token is a signed JWT', typeof adminToken === 'string' && adminToken.split('.').length === 3);
check('primaryRole ORG_ADMIN, roles de-duplicated', r.json?.data?.user?.primaryRole === 'ORG_ADMIN' && r.json?.data?.user?.roles?.length === 1, JSON.stringify(r.json?.data?.user?.roles?.map(x => x.code)));

r = await req('GET', '/auth/me', { token: adminToken });
check('/auth/me returns token owner', r.status === 200 && r.json?.data?.user?.email === 'admin@skilglobal.com', r.status);

r = await req('GET', '/locations', { token: adminToken, headers: { 'x-tenant-id': 'apex-aero' } });
const tenants = new Set((r.json?.data || []).map(l => l.tenantId));
check('org admin cannot switch tenant via header', r.status === 200 && tenants.size === 1, [...tenants].join(','));
const skilTenantId = [...tenants][0];

r = await req('GET', '/tenants', { token: adminToken, headers: { 'x-user-role': 'SUPER_ADMIN', 'x-super-admin': 'true' } });
check('org admin + spoofed role headers -> 403 on /tenants', r.status === 403, r.status);

r = await req('GET', '/users', { token: adminToken });
const leaked = JSON.stringify(r.json).match(/passwordHash|pinHash|failedLoginAttempts/);
check('GET /users does not leak credentials', r.status === 200 && !leaked, leaked?.[0] || '');

r = await login('superadmin@skilglobal.com', 'Admin@123456');
const saToken = r.json?.data?.accessToken;
check('super admin login -> 200', r.status === 200 && r.json?.data?.user?.isSuperAdmin === true, r.status);
r = await req('GET', '/tenants', { token: saToken });
check('super admin GET /tenants -> 200', r.status === 200 && Array.isArray(r.json?.data), r.status);
r = await req('GET', '/locations', { token: saToken, headers: { 'x-tenant-id': 'apex-aero' } });
const saTenants = new Set((r.json?.data || []).map(l => l.tenantId));
check('super admin can act on another tenant', r.status === 200 && !saTenants.has(skilTenantId), [...saTenants].join(',') || '(no locations)');
r = await req('GET', '/locations', { token: saToken, headers: { 'x-tenant-id': 'does-not-exist' } });
check('super admin unknown tenant -> 403', r.status === 403, r.status);

r = await req('POST', '/auth/pin-login', { body: { badgeId: 'BADGE-OP-049', pin: '5544' } });
check('PIN login correct -> 200 as Arun', r.status === 200 && r.json?.data?.user?.email === 'owner.cnc01@skilglobal.com', r.status);
r = await req('POST', '/auth/pin-login', { body: { badgeId: 'BADGE-OP-049', pin: '0000' } });
check('PIN login wrong PIN -> 401', r.status === 401, r.status);
r = await req('POST', '/auth/pin-login', { body: { pin: '5544' } });
check('PIN login without badge -> 400', r.status === 400, r.status);
r = await req('POST', '/auth/sso', { body: { provider: 'GOOGLE_WORKSPACE' } });
check('SSO -> 501 not configured', r.status === 501, r.status);

for (let i = 0; i < 5; i++) await login('planthead.blr@skilglobal.com', 'Wrong-pass1!');
r = await login('planthead.blr@skilglobal.com', 'Admin@123456');
check('lockout after 5 failures blocks correct password', r.status === 401 && /locked/i.test(JSON.stringify(r.json)), JSON.stringify(r.json?.message));

console.log(`\n${pass} passed, ${fail} failed`);

// R2: tamper-evident activity trail + soft delete. Run from the backend directory (needs @prisma/client).
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body, headers } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data ?? json, json };
};
const msg = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? '')}`;
const login = async (email, password = 'Admin@123456') => (await req('POST', '/auth/login', { body: { email, password } })).data?.accessToken;
const ADMIN = await login('admin@skilglobal.com');
const COORD = await login('coordinator.5s@skilglobal.com');
const OWNER = await login('owner.cnc01@skilglobal.com');
const latest = async (filter) => (await req('GET', `/activity-logs?pageSize=5&${new URLSearchParams(filter)}`, { token: ADMIN })).data.items[0];

// ---------- Access ----------
check('admin can read the trail', (await req('GET', '/activity-logs', { token: ADMIN })).status === 200);
check('coordinator blocked', (await req('GET', '/activity-logs', { token: COORD })).status === 403);
check('area owner blocked', (await req('GET', '/activity-logs/verify', { token: OWNER })).status === 403);

// ---------- Sign-in events ----------
await req('POST', '/auth/login', { body: { email: 'coordinator.5s@skilglobal.com', password: 'wrong-password' }, headers: { 'User-Agent': 'iso-e2e-agent', 'X-Forwarded-For': '203.0.113.7' } });
let e = await latest({ action: 'LOGIN_FAILED' });
check('failed sign-in recorded', e && e.actorEmail === 'coordinator.5s@skilglobal.com' && e.outcome === 'FAILURE', JSON.stringify(e && { a: e.action, who: e.actorEmail }));
check('client IP and agent captured', e?.ipAddress === '203.0.113.7' && e?.userAgent === 'iso-e2e-agent', `${e?.ipAddress} ${e?.userAgent}`);
check('password never stored', !JSON.stringify(e).includes('wrong-password'));
await login('coordinator.5s@skilglobal.com');
e = await latest({ action: 'LOGIN_SUCCESS' });
check('successful sign-in recorded', e?.actorEmail === 'coordinator.5s@skilglobal.com');

// ---------- Change diff ----------
const users = (await req('GET', '/users', { token: ADMIN })).data;
const owner = users.find((u) => u.email === 'owner.cnc01@skilglobal.com');
const node = (await req('GET', '/organization/nodes', { token: COORD })).data[0];
let r = await req('POST', '/locations', { token: COORD, body: { name: 'ISO Activity Cell', areaCode: 'iso-act-loc', orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId: owner.id } });
const loc = r.data;
check('fixture location created', r.status === 201, msg(r));
e = await latest({ entityType: 'Location', action: 'CREATE_LOCATION' });
check('create recorded with new id', e?.entityId === loc.id, e?.entityId);
r = await req('PATCH', `/locations/${loc.id}`, { token: COORD, body: { riskLevel: 'HIGH', description: 'ISO changed' } });
check('location updated', r.status === 200, msg(r));
e = await latest({ entityType: 'Location', entityId: loc.id, action: 'UPDATE_LOCATION' });
check('update has before/after diff', e?.changes?.diff?.riskLevel?.from === 'LOW' && e.changes.diff.riskLevel.to === 'HIGH', JSON.stringify(e?.changes?.diff));
check('actor recorded', e?.actorEmail === 'coordinator.5s@skilglobal.com');
check('unchanged fields not in diff', e && !('name' in e.changes.diff));

// ---------- Soft delete ----------
r = await req('DELETE', `/locations/${loc.id}`, { token: COORD });
check('location deleted', r.status === 200, msg(r));
check('deleted location hidden (404)', (await req('GET', `/locations/${loc.id}`, { token: COORD })).status === 404);
const list = (await req('GET', '/locations', { token: COORD })).data;
check('deleted location not listed', !(Array.isArray(list) ? list : list.items).some((l) => l.id === loc.id));
const row = await db.location.findFirst({ where: { id: loc.id, deletedAt: { not: null } } });
check('row kept with deletedAt / deletedById', !!row && !!row.deletedById, row?.deletedAt);
e = await latest({ entityType: 'Location', entityId: loc.id, action: 'DELETE_LOCATION' });
check('delete recorded with deletedAt diff', !!e?.changes?.diff?.deletedAt, JSON.stringify(e?.changes?.diff));
check('cannot update a deleted record', (await req('PATCH', `/locations/${loc.id}`, { token: COORD, body: { riskLevel: 'LOW' } })).status === 404);

// User soft delete: identifiers are released, history kept, sign-in impossible
const email = `iso-softdel-${Date.now()}@example.com`;
r = await req('POST', '/users', { token: ADMIN, body: { email, firstName: 'Iso', lastName: 'Deleted', roleCode: 'EMPLOYEE', password: 'IsoPass@12345' } });
check('fixture user created', r.status === 201, msg(r));
const uid = r.data.id;
check('fixture user can sign in', !!(await login(email, 'IsoPass@12345')));
r = await req('DELETE', `/users/${uid}`, { token: ADMIN });
check('user deleted', r.status === 200, msg(r));
check('deleted user cannot sign in', !(await login(email, 'IsoPass@12345')));
check('deleted user hidden', (await req('GET', `/users/${uid}`, { token: ADMIN })).status === 404);
r = await req('POST', '/users', { token: ADMIN, body: { email, firstName: 'Iso', lastName: 'Rehired', roleCode: 'EMPLOYEE', password: 'IsoPass@12345' } });
check('email reusable after delete', r.status === 201, msg(r));
if (r.data?.id) await req('DELETE', `/users/${r.data.id}`, { token: ADMIN });

// ---------- Immutability ----------
const any = await db.activityLog.findFirst({ orderBy: { createdAt: 'desc' } });
let blocked = false;
try { await db.activityLog.update({ where: { id: any.id }, data: { summary: 'tampered' } }); } catch { blocked = true; }
check('database rejects UPDATE', blocked);
blocked = false;
try { await db.activityLog.delete({ where: { id: any.id } }); } catch { blocked = true; }
check('database rejects DELETE', blocked);
blocked = false;
try { await db.$executeRawUnsafe('TRUNCATE "ActivityLog"'); } catch { blocked = true; }
check('database rejects TRUNCATE', blocked);

r = await req('GET', '/activity-logs/verify', { token: ADMIN });
check('hash chain verifies', r.data?.valid === true && r.data.entriesChecked > 0, JSON.stringify(r.data));

// Forged insert into a throw-away chain is detected (inserts cannot be prevented, only detected)
const chain = `ISO-CHAIN-${Date.now()}`;
const { ActivityLogService } = require(process.cwd() + '/dist/core/activity/activity-log.service.js');
const svc = new ActivityLogService(db);
await svc.record({ tenantId: chain, action: 'ISO_ONE', outcome: 'SUCCESS', summary: 'first' });
await svc.record({ tenantId: chain, action: 'ISO_TWO', outcome: 'SUCCESS', summary: 'second' });
let v = await svc.verify(chain);
check('fresh chain valid', v.valid && v.entriesChecked === 2, JSON.stringify(v));
const last = await db.activityLog.findFirst({ where: { chainKey: chain }, orderBy: { sequence: 'desc' } });
await db.activityLog.create({ data: { chainKey: chain, sequence: 3, action: 'FORGED', outcome: 'SUCCESS', summary: 'forged', prevHash: last.hash, hash: 'f'.repeat(64) } });
v = await svc.verify(chain);
check('forged entry detected', !v.valid && v.brokenAtSequence === 3, JSON.stringify(v));

await db.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

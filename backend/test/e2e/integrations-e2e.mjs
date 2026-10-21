// R11: API keys, webhooks (SSRF guard, signed delivery, retries), locale preference.
// Usage (from backend dir): node integrations-e2e.mjs ssrf   (server WITHOUT WEBHOOK_ALLOW_PRIVATE)
//                           node integrations-e2e.mjs        (server WITH WEBHOOK_ALLOW_PRIVATE=true, WEBHOOK_DISPATCH_SECONDS=1)
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
const require = createRequire(process.cwd() + '/');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
const PHASE_SSRF = process.argv[2] === 'ssrf';
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body, key, tenant } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'X-API-Key': key } : {}), ...(tenant ? { 'x-tenant-id': tenant } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data ?? json, json };
};
const msg = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? '')}`;
const login = async (email, password = 'Admin@123456', tenantSlug) => (await req('POST', '/auth/login', { body: { email, password, ...(tenantSlug ? { tenantSlug } : {}) } })).data?.accessToken;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ADMIN = await login('admin@skilglobal.com');
const COORD = await login('coordinator.5s@skilglobal.com');

if (PHASE_SSRF) {
  for (const url of ['https://127.0.0.1/hook', 'https://10.1.2.3/x', 'https://169.254.169.254/latest/meta-data', 'https://localhost/x', 'http://example.com/hook', 'https://user:pw@example.com/x']) {
    const r = await req('POST', '/webhooks', { token: ADMIN, body: { url, events: ['observation.created'] } });
    check(`webhook to ${url} refused`, r.status === 400, msg(r));
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
}

// ---------- API keys ----------
let r = await req('POST', '/api-keys', { token: ADMIN, body: { name: 'ISO-READ', roleCode: 'COORDINATOR_5S', readOnly: true } });
const readKey = r.data?.key;
check('API key created and shown once', r.status === 201 && /^fsk_[A-Za-z0-9]{10}_/.test(readKey ?? ''), msg(r));
check('key not stored in clear', !(await db.apiKey.findFirst({ where: { id: r.data.id } })).keyHash.includes(readKey));
r = await req('GET', '/api-keys', { token: ADMIN });
check('list never returns the secret', r.data.every((k) => !('key' in k)) && r.data.some((k) => k.name === 'ISO-READ'));
check('super-admin role not allowed for keys', (await req('POST', '/api-keys', { token: ADMIN, body: { name: 'ISO-X', roleCode: 'SUPER_ADMIN', readOnly: true } })).status === 400);
check('key management restricted to org admins', (await req('GET', '/api-keys', { token: COORD })).status === 403);
check('read-only key can read', (await req('GET', '/locations', { key: readKey })).status === 200);
check('read-only key cannot write', (await req('POST', '/observations', { key: readKey, body: {} })).status === 403);
check('keys cannot reach identity endpoints', (await req('GET', '/auth/me', { key: readKey })).status === 403);
check('keys cannot manage keys', (await req('GET', '/api-keys', { key: readKey })).status === 403);
check('unknown key -> 401', (await req('GET', '/locations', { key: 'fsk_doesnotexist_xyz' })).status === 401);

r = await req('POST', '/api-keys', { token: ADMIN, body: { name: 'ISO-WRITE', roleCode: 'COORDINATOR_5S', readOnly: false } });
const writeKey = r.data.key;
const writeId = r.data.id;
const owner = (await req('GET', '/users', { token: ADMIN })).data.find((u) => u.email === 'owner.cnc01@skilglobal.com');
const node = (await req('GET', '/organization/nodes', { token: COORD })).data[0];
r = await req('POST', '/locations', { key: writeKey, body: { name: 'ISO Integration Cell', areaCode: 'iso-int-loc', orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId: owner.id } });
check('write key can create within its role', r.status === 201, msg(r));
const loc = r.data;
const log = (await req('GET', '/activity-logs?action=CREATE_LOCATION&pageSize=1', { token: ADMIN })).data.items[0];
check('API key activity attributed to the key', log?.actorEmail === 'api-key:ISO-WRITE', log?.actorEmail);
check('key usage time recorded', !!(await db.apiKey.findUnique({ where: { id: writeId } })).lastUsedAt);
await req('DELETE', `/api-keys/${writeId}`, { token: ADMIN });
check('revoked key stops working', (await req('GET', '/locations', { key: writeKey })).status === 401);

// ---------- Webhooks: signed delivery ----------
const received = [];
let failMode = false;
const server = createServer((rq, rs) => {
  let body = '';
  rq.on('data', (c) => (body += c));
  rq.on('end', () => {
    received.push({ headers: rq.headers, body, path: rq.url });
    rs.statusCode = failMode && rq.url === '/fail' ? 500 : 200;
    rs.end('ok');
  });
});
await new Promise((res) => server.listen(3999, res));
check('unknown event rejected', (await req('POST', '/webhooks', { token: ADMIN, body: { url: 'http://127.0.0.1:3999/hook', events: ['spaceship.launched'] } })).status === 400);
r = await req('GET', '/webhooks/events', { token: ADMIN });
check('event catalogue', r.data.events.includes('observation.created') && r.data.events.includes('action.closed'));
r = await req('POST', '/webhooks', { token: ADMIN, body: { url: 'http://127.0.0.1:3999/hook', description: 'ISO-HOOK', events: ['observation.created', 'location.updated'] } });
check('webhook created with signing secret', r.status === 201 && r.data.secret?.startsWith('whsec_'), msg(r));
const hook = r.data;
r = await req('POST', '/observations', { token: COORD, body: { locationId: loc.id, title: 'ISO webhook finding', description: 'x', category: 'S1_SORT', severity: 'MINOR' } });
const obsId = r.data.id;
for (let i = 0; i < 20 && !received.some((x) => x.headers['x-5s-event'] === 'observation.created'); i++) await sleep(250);
const delivery = received.find((x) => x.headers['x-5s-event'] === 'observation.created');
check('event delivered by the dispatcher', !!delivery);
const expected = createHmac('sha256', hook.secret).update(`${delivery?.headers['x-5s-timestamp']}.${delivery?.body}`).digest('hex');
check('signature verifies with the secret', delivery?.headers['x-5s-signature'] === `sha256=${expected}`);
const body = JSON.parse(delivery?.body ?? '{}');
check('payload carries event, tenant and record id', body.event === 'observation.created' && body.data?.id === obsId && !!body.tenantId);
check('unsubscribed events are not sent', !received.some((x) => x.headers['x-5s-event'] === 'location.created'));
r = await req('POST', `/webhooks/${hook.id}/test`, { token: ADMIN });
check('test ping delivered', r.data?.status === 'SUCCESS' && r.data.responseStatus === 200, JSON.stringify(r.data));

// ---------- Webhooks: failures & retries ----------
failMode = true;
r = await req('POST', '/webhooks', { token: ADMIN, body: { url: 'http://127.0.0.1:3999/fail', description: 'ISO-FAIL', events: ['location.updated'] } });
const failing = r.data;
await req('PATCH', `/locations/${loc.id}`, { token: COORD, body: { description: 'ISO changed' } });
await sleep(2500);
r = await req('GET', `/webhooks/${failing.id}/deliveries`, { token: ADMIN });
const fd = r.data[0];
check('failed delivery scheduled for retry with backoff', fd?.status === 'PENDING' && fd.attempts === 1 && fd.responseStatus === 500 && new Date(fd.nextAttemptAt) > new Date(Date.now() + 30000), JSON.stringify(fd));
await db.webhookDelivery.update({ where: { id: fd.id }, data: { status: 'FAILED' } });
r = await req('POST', `/webhooks/deliveries/${fd.id}/retry`, { token: ADMIN });
check('manual retry re-queues a failed delivery', r.data?.status === 'PENDING', msg(r));
r = await req('PATCH', `/webhooks/${failing.id}`, { token: ADMIN, body: { isActive: false } });
check('endpoint can be disabled', r.data?.isActive === false);
r = await req('POST', `/webhooks/${hook.id}/rotate-secret`, { token: ADMIN });
check('secret rotation returns a new secret', r.data?.secret?.startsWith('whsec_') && r.data.secret !== hook.secret);
check('webhooks restricted to org admins', (await req('GET', '/webhooks', { token: COORD })).status === 403);
server.close();

// ---------- Locale ----------
r = await req('PATCH', '/auth/me/preferences', { token: COORD, body: { locale: 'hi' } });
check('language preference saved', r.data?.locale === 'hi', msg(r));
check('profile returns the language', (await req('GET', '/auth/me', { token: COORD })).data.user.locale === 'hi');
check('invalid language code -> 400', (await req('PATCH', '/auth/me/preferences', { token: COORD, body: { locale: 'klingon!' } })).status === 400);
await req('PATCH', '/auth/me/preferences', { token: COORD, body: { locale: null } });

// ---------- Cleanup ----------
for (const id of [hook.id, failing.id]) await req('DELETE', `/webhooks/${id}`, { token: ADMIN });
await db.apiKey.deleteMany({ where: { name: { startsWith: 'ISO-' } } });
await db.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

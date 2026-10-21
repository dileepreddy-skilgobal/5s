// R6: file storage, signed URLs, inline media ingest, quota, migration. Run from backend dir.
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
const require = createRequire(process.cwd() + '/');
const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp');
const db = new PrismaClient();
const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data ?? json, json };
};
const upload = async (token, buf, name, type = 'application/octet-stream') => {
  const form = new FormData();
  form.append('file', new Blob([buf], { type }), name);
  const r = await fetch(B + '/files', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data ?? json, json };
};
const msg = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? '')}`;
const login = async (email) => (await req('POST', '/auth/login', { body: { email, password: 'Admin@123456' } })).data.accessToken;
const ADMIN = await login('admin@skilglobal.com');
const COORD = await login('coordinator.5s@skilglobal.com');
const OWNER = await login('owner.cnc01@skilglobal.com');

const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#3366cc' } }).png().toBuffer();
const jpgDataUrl = 'data:image/jpeg;base64,' + (await sharp({ create: { width: 64, height: 48, channels: 3, background: '#cc3333' } }).jpeg().toBuffer()).toString('base64');

// ---------- Upload ----------
let r = await upload(OWNER, png, 'evidence.png', 'image/png');
check('multipart upload', r.status === 201 && r.data.contentType === 'image/png' && r.data.width === 800, msg(r));
const file = r.data;
check('url is signed and absolute', /^https?:\/\/.+\/api\/v1\/files\/[0-9a-f-]+\?t=.+&exp=\d+&sig=/.test(file.url), file.url);
check('thumbnail generated', !!file.thumbnailUrl);

let d = await fetch(file.url);
let body = Buffer.from(await d.arrayBuffer());
check('signed download works without login', d.status === 200 && d.headers.get('content-type') === 'image/png' && body.equals(png), d.status);
check('integrity header matches', d.headers.get('x-content-sha256') === createHash('sha256').update(png).digest('hex'));
check('nosniff + sandbox headers', d.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(d.headers.get('content-security-policy') ?? ''));
d = await fetch(file.thumbnailUrl);
const thumbMeta = await sharp(Buffer.from(await d.arrayBuffer())).metadata();
check('thumbnail is a 320px webp', d.headers.get('content-type') === 'image/webp' && thumbMeta.width === 320, `${d.headers.get('content-type')} ${thumbMeta.width}`);

const u = new URL(file.url);
const tampered = new URL(file.url); tampered.searchParams.set('sig', 'x' + u.searchParams.get('sig').slice(1));
check('tampered signature -> 404', (await fetch(tampered)).status === 404);
const otherTenant = new URL(file.url); otherTenant.searchParams.set('t', '00000000-0000-0000-0000-000000000000');
check('signature bound to tenant -> 404', (await fetch(otherTenant)).status === 404);
const longer = new URL(file.url); longer.searchParams.set('exp', String(Number(u.searchParams.get('exp')) + 86400));
check('extending expiry invalidates signature', (await fetch(longer)).status === 404);
check('unsigned access -> 404', (await fetch(`${u.origin}${u.pathname}`)).status === 404);

// ---------- Type validation ----------
check('SVG rejected', (await upload(OWNER, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml')).status === 400);
check('HTML disguised as PNG rejected', (await upload(OWNER, Buffer.from('<html><script>alert(1)</script></html>'), 'x.png', 'image/png')).status === 400);
check('corrupt image rejected', (await upload(OWNER, Buffer.concat([png.subarray(0, 40), randomBytes(200)]), 'bad.png', 'image/png')).status === 400);
check('PDF accepted', (await upload(OWNER, Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'), 'doc.pdf', 'application/pdf')).status === 201);

// ---------- Inline media ingest ----------
const users = (await req('GET', '/users', { token: ADMIN })).data;
const owner = users.find((x) => x.email === 'owner.cnc01@skilglobal.com');
const node = (await req('GET', '/organization/nodes', { token: COORD })).data[0];
const loc = (await req('POST', '/locations', { token: COORD, body: { name: 'ISO Files Cell', areaCode: 'iso-fil-loc', orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId: owner.id } })).data;
r = await req('POST', '/observations', { token: OWNER, body: { locationId: loc.id, title: 'ISO photo finding', description: 'x', category: 'S1_SORT', severity: 'MINOR', beforePhotoUrl: jpgDataUrl } });
check('observation with inline photo created', r.status === 201, msg(r));
const obs = r.data;
const stored = await db.observation.findUnique({ where: { id: obs.id }, select: { beforePhotoUrl: true } });
check('database holds a file reference, not base64', /^\/api\/v1\/files\/[0-9a-f-]{36}$/.test(stored.beforePhotoUrl), stored.beforePhotoUrl?.slice(0, 60));
check('response carries a signed URL', /\?t=.+&sig=/.test(obs.beforePhotoUrl ?? ''), obs.beforePhotoUrl?.slice(0, 80));
d = await fetch(obs.beforePhotoUrl);
check('signed photo downloads as JPEG', d.status === 200 && d.headers.get('content-type') === 'image/jpeg');
r = await req('PATCH', `/observations/${obs.id}`, { token: COORD, body: { annotatedPhotoUrl: obs.beforePhotoUrl } });
const afterEcho = await db.observation.findUnique({ where: { id: obs.id }, select: { annotatedPhotoUrl: true } });
check('echoed signed URL stored canonically', afterEcho.annotatedPhotoUrl === stored.beforePhotoUrl, afterEcho.annotatedPhotoUrl);
r = await req('POST', '/observations', { token: OWNER, body: { locationId: loc.id, title: 'ISO bad photo', description: 'x', category: 'S1_SORT', severity: 'MINOR', beforePhotoUrl: 'data:image/png;base64,PHN2Zz48L3N2Zz4=' } });
check('inline non-image rejected', r.status === 400, msg(r));
const log = (await req('GET', `/activity-logs?entityType=Observation&action=CREATE_OBSERVATION&pageSize=3`, { token: ADMIN })).data.items;
const rawLog = await db.activityLog.findFirst({ where: { entityType: 'Observation', action: 'CREATE_OBSERVATION' }, orderBy: { sequence: 'desc' }, select: { changes: true } });
check('activity log stores the file reference, not base64', /\/api\/v1\/files\/[0-9a-f-]{36}/.test(rawLog?.changes ?? '') && !(rawLog?.changes ?? '').includes('base64'), rawLog?.changes?.slice(0, 120));
check('trail API returns a clickable signed link', /\/api\/v1\/files\/.+sig=/.test(log[0]?.changes?.request?.beforePhotoUrl ?? ''));

// ---------- Quota ----------
const tenantId = owner.tenantId;
const before = await db.tenant.findUnique({ where: { id: tenantId }, select: { storageQuotaMb: true } });
r = await req('GET', '/files/usage', { token: COORD });
check('usage reported', r.status === 200 && r.data.usedBytes > 0 && r.data.files > 0, JSON.stringify(r.data));
const usedMb = Math.ceil(r.data.usedBytes / 1048576);
await db.tenant.update({ where: { id: tenantId }, data: { storageQuotaMb: usedMb } });
const big = await sharp(randomBytes(900 * 900 * 3), { raw: { width: 900, height: 900, channels: 3 } }).png().toBuffer();
r = await upload(OWNER, big, 'big.png', 'image/png');
check('upload over quota -> 413', r.status === 413, `${msg(r)} (${big.length} bytes)`);
await db.tenant.update({ where: { id: tenantId }, data: { storageQuotaMb: before.storageQuotaMb } });
check('usage restricted', (await req('GET', '/files/usage', { token: OWNER })).status === 403);

// ---------- Migration of existing inline media ----------
await db.observation.update({ where: { id: obs.id }, data: { beforePhotoUrl: jpgDataUrl } });
r = await req('POST', '/files/migrate-inline', { token: ADMIN });
check('migration endpoint', r.status === 200 && r.data['Observation.beforePhotoUrl'] >= 1, JSON.stringify(r.data));
const migrated = await db.observation.findUnique({ where: { id: obs.id }, select: { beforePhotoUrl: true } });
check('inline photo migrated to storage', /^\/api\/v1\/files\//.test(migrated.beforePhotoUrl));
r = await req('POST', '/files/migrate-inline', { token: ADMIN });
check('migration is idempotent', r.data['Observation.beforePhotoUrl'] === 0, JSON.stringify(r.data));
check('migration restricted to admins', (await req('POST', '/files/migrate-inline', { token: COORD })).status === 403);

await db.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

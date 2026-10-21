// R10 backend: burned-in annotations, observation media / voice / GPS, offline idempotency. Run from backend dir.
import { createRequire } from 'node:module';
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
const msg = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? '')}`;
const login = async (email) => (await req('POST', '/auth/login', { body: { email, password: 'Admin@123456' } })).data.accessToken;
const COORD = await login('coordinator.5s@skilglobal.com');
const OWNER = await login('owner.cnc01@skilglobal.com');
const ADMIN = await login('admin@skilglobal.com');
const owner = (await req('GET', '/users', { token: ADMIN })).data.find((u) => u.email === 'owner.cnc01@skilglobal.com');
const node = (await req('GET', '/organization/nodes', { token: COORD })).data[0];
const loc = (await req('POST', '/locations', { token: COORD, body: { name: 'ISO Evidence Cell', areaCode: 'iso-evd-loc', orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId: owner.id } })).data;

const white = 'data:image/jpeg;base64,' + (await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ffffff' } }).jpeg().toBuffer()).toString('base64');
const shapes = [
  { type: 'box', unit: 'pct', x: 10, y: 10, width: 30, height: 30, color: '#FF0000', text: 'Oil' },
  { type: 'circle', unit: 'pct', x: 70, y: 50, radius: 10, color: '#0000FF' },
  { type: 'arrow', unit: 'pct', fromX: 50, fromY: 90, toX: 70, toY: 60, color: '#00AA00' },
  { type: 'box', x: 1, y: 1, width: 300, height: 300, color: '#000000' }, // legacy pixel units: ignored
];
const clientRequestId = `iso-${Date.now()}-abcdef`;
const payload = {
  locationId: loc.id, title: 'ISO annotated leak', description: 'x', category: 'S3_SHINE', severity: 'MAJOR',
  beforePhotoUrl: white, annotationData: shapes,
  gpsLatitude: 12.9716, gpsLongitude: 77.5946, gpsAccuracyM: 8.5, clientRequestId,
  mediaUrls: [{ url: white, kind: 'PHOTO', capturedAt: new Date().toISOString(), latitude: 12.97, longitude: 77.59 }],
};
let r = await req('POST', '/observations', { token: OWNER, body: payload });
check('observation with shapes, media and GPS created', r.status === 201, msg(r));
const obs = r.data;
const row = await db.observation.findUnique({ where: { id: obs.id } });
check('annotated copy differs from the original', !!row.annotatedPhotoUrl && row.annotatedPhotoUrl !== row.beforePhotoUrl, `${row.beforePhotoUrl} | ${row.annotatedPhotoUrl}`);
const orig = await sharp(Buffer.from(await (await fetch(obs.beforePhotoUrl)).arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
const ann = await sharp(Buffer.from(await (await fetch(obs.annotatedPhotoUrl)).arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
const pixel = (img, xPct, yPct) => { const x = Math.round(img.info.width * xPct / 100), y = Math.round(img.info.height * yPct / 100); const i = (y * img.info.width + x) * img.info.channels; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const red = pixel(ann, 10, 25), blue = pixel(ann, 60, 50), plain = pixel(ann, 90, 10), legacy = pixel(ann, 0.5, 90);
check('original kept clean (white)', pixel(orig, 10, 25).every((c) => c > 240));
check('box drawn in red at its percentage position', red[0] > 200 && red[1] < 80 && red[2] < 80, red.join(','));
check('circle drawn in blue', blue[2] > 200 && blue[0] < 80, blue.join(','));
check('untouched area stays white', plain.every((c) => c > 235), plain.join(','));
check('pixel-unit legacy shape ignored', legacy.every((c) => c > 235), legacy.join(','));
check('GPS stored', row.gpsLatitude === 12.9716 && row.gpsLongitude === 77.5946 && row.gpsAccuracyM === 8.5);
check('media list stored as file references', /\/api\/v1\/files\//.test(row.mediaUrls) && !row.mediaUrls.includes('base64'), row.mediaUrls.slice(0, 100));
check('media returned parsed with signed links', Array.isArray(obs.mediaUrls) && /sig=/.test(obs.mediaUrls[0].url));

r = await req('POST', '/observations', { token: OWNER, body: payload });
check('retried offline submission returns the same observation', r.status === 201 && r.data.id === obs.id, `${r.data?.id} vs ${obs.id}`);
check('no duplicate created', (await db.observation.count({ where: { locationId: loc.id } })) === 1);
const before = await db.storedFile.count();
await req('POST', '/observations', { token: OWNER, body: { ...payload, clientRequestId: undefined, beforePhotoUrl: obs.beforePhotoUrl, mediaUrls: [] } });
check('same photo + same drawing reuses the annotated file', (await db.storedFile.count()) === before, `${before} -> ${await db.storedFile.count()}`);
check('bad GPS rejected', (await req('POST', '/observations', { token: OWNER, body: { ...payload, clientRequestId: undefined, gpsLatitude: 123 } })).status === 400);
check('bad media kind rejected', (await req('POST', '/observations', { token: OWNER, body: { ...payload, clientRequestId: undefined, mediaUrls: [{ url: 'x', kind: 'HOLOGRAM' }] } })).status === 400);

await db.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

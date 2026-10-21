// Location page data: scorecard (scores, maturity band, pillar breakdown, open work), before / after
// evidence (uploads + closed CAPA photo pairs) and document attachments. Run from backend dir.
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
const AUDITOR = await login('auditor.lead@skilglobal.com');
const ADMIN = await login('admin@skilglobal.com');
const users = (await req('GET', '/users', { token: ADMIN })).data;
const owner = users.find((u) => u.email === 'owner.cnc01@skilglobal.com');
const coord = users.find((u) => u.email === 'coordinator.5s@skilglobal.com');
const node = (await req('GET', '/organization/nodes', { token: COORD })).data[0];
const mkLoc = async (name, code, ownerId) =>
  (await req('POST', '/locations', { token: COORD, body: { name, areaCode: code, orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId } })).data;
const loc = await mkLoc('ISO Insights Cell', 'iso-ins-own', owner.id);
const other = await mkLoc('ISO Insights Other', 'iso-ins-oth', coord.id);
const L = (id = loc.id) => `/locations/${id}`;
const photo = async (color) => 'data:image/jpeg;base64,' + (await sharp({ create: { width: 64, height: 48, channels: 3, background: color } }).jpeg().toBuffer()).toString('base64');
const red = await photo('#cc2222'), green = await photo('#22aa44'), blue = await photo('#2244cc');
const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' + 'x'.repeat(3000)).toString('base64');

// --- Scorecard on a new area ---
let r = await req('GET', `${L()}/scorecard`, { token: OWNER });
check('new area: no score, no band', r.status === 200 && r.data.audits.averageScore === null && r.data.audits.maturity === null && r.data.audits.latest === null, msg(r));
check('six pillars, all empty', r.data?.audits?.pillars?.length === 6 && r.data.audits.pillars.every((p) => p.score === null));
check('no open work, no evidence', r.data?.work?.openActions === 0 && r.data.work.openObservations === 0 && r.data.evidence.count === 0);

// --- Scorecard on the seeded CNC cell matches the audit records ---
const cnc = await db.location.findFirst({ where: { areaCode: 'LOC-BLR-MACH-CNC01' } });
const since = new Date(Date.now() - 365 * 86400000);
const scored = await db.auditExecution.findMany({ where: { locationId: cnc.id, status: { in: ['SUBMITTED', 'DISPUTED', 'ACKNOWLEDGED'] }, completedAt: { gte: since }, deletedAt: null } });
r = await req('GET', `${L(cnc.id)}/scorecard`, { token: OWNER });
const expected = scored.length ? Math.round((scored.reduce((a, e) => a + e.overallScore, 0) / scored.length) * 10) / 10 : null;
check('average equals the 12-month mean of scored audits', r.status === 200 && r.data.audits.averageScore === expected && r.data.audits.countInWindow === scored.length, `${r.data?.audits?.averageScore} vs ${expected} (${scored.length})`);
check('maturity band comes from the tenant bands', expected === null ? r.data.audits.maturity === null : !!r.data.audits.maturity?.name && typeof r.data.audits.maturity.level === 'number', JSON.stringify(r.data?.audits?.maturity));
const s1 = scored.map((e) => JSON.parse(e.pillarScores || '{}').S1_SORT).filter((v) => Number.isFinite(Number(v))).map(Number);
const expS1 = s1.length ? Math.round((s1.reduce((a, b) => a + b, 0) / s1.length) * 10) / 10 : null;
check('pillar score equals the mean of stored pillar scores', r.data?.audits?.pillars?.find((p) => p.key === 'S1_SORT')?.score === expS1, `${r.data?.audits?.pillars?.[0]?.score} vs ${expS1}`);
const openCnc = await db.correctiveAction.count({ where: { locationId: cnc.id, status: { notIn: ['VERIFIED', 'CLOSED'] }, deletedAt: null } });
check('open action count matches', r.data?.work?.openActions === openCnc, `${r.data?.work?.openActions} vs ${openCnc}`);
check('auditor can read a scorecard', (await req('GET', `${L(cnc.id)}/scorecard`, { token: AUDITOR })).status === 200);
check('unknown area 404', (await req('GET', `${L('00000000-0000-4000-8000-000000000000')}/scorecard`, { token: OWNER })).status === 404);

// --- Evidence uploads ---
r = await req('POST', `${L()}/evidence`, { token: OWNER, body: { category: 'S1_SORT', description: 'ISO cleared unneeded clamps', beforePhotoUrl: red, afterPhotoUrl: green, afterLabel: 'AFTER (CLEARED)' } });
check('owner adds a before/after pair', r.status === 201 && r.data.source === 'UPLOAD' && r.data.uploadedBy === `${owner.firstName} ${owner.lastName}`, msg(r));
check('photos returned as signed stored-file links', /\/api\/v1\/files\/.+sig=/.test(r.data?.beforePhotoUrl ?? '') && /sig=/.test(r.data?.afterPhotoUrl ?? ''));
const ev1 = r.data;
const row = await db.locationEvidence.findUnique({ where: { id: ev1.id } });
check('stored as file references, not base64', /^\/api\/v1\/files\/[0-9a-f-]{36}$/.test(row.beforePhotoUrl) && row.uploadedById === owner.id, row.beforePhotoUrl);
check('external photo link rejected', (await req('POST', `${L()}/evidence`, { token: OWNER, body: { category: 'S1_SORT', description: 'ISO stock photo', beforePhotoUrl: 'https://example.com/a.jpg', afterPhotoUrl: green } })).status === 400);
check('same photo for before and after rejected', (await req('POST', `${L()}/evidence`, { token: OWNER, body: { category: 'S1_SORT', description: 'ISO same photo', beforePhotoUrl: row.beforePhotoUrl, afterPhotoUrl: row.beforePhotoUrl } })).status === 400);
check('a PDF is not accepted as a photo', (await req('POST', `${L()}/evidence`, { token: OWNER, body: { category: 'S1_SORT', description: 'ISO pdf photo', beforePhotoUrl: pdf, afterPhotoUrl: green } })).status === 400);
check('short description rejected', (await req('POST', `${L()}/evidence`, { token: OWNER, body: { category: 'S1_SORT', description: 'x', beforePhotoUrl: red, afterPhotoUrl: blue } })).status === 400);
check('unknown pillar rejected', (await req('POST', `${L()}/evidence`, { token: OWNER, body: { category: 'S9', description: 'ISO bad pillar', beforePhotoUrl: red, afterPhotoUrl: blue } })).status === 400);
check('auditor cannot add evidence', (await req('POST', `${L()}/evidence`, { token: AUDITOR, body: { category: 'S1_SORT', description: 'ISO auditor', beforePhotoUrl: red, afterPhotoUrl: blue } })).status === 403);
check('owner cannot add to an area they do not own', (await req('POST', `${L(other.id)}/evidence`, { token: OWNER, body: { category: 'S1_SORT', description: 'ISO not mine', beforePhotoUrl: red, afterPhotoUrl: blue } })).status === 403);
r = await req('POST', `${L()}/evidence`, { token: COORD, body: { category: 'S3_SHINE', description: 'ISO coordinator cleaned the coolant tray', beforePhotoUrl: blue, afterPhotoUrl: green } });
check('coordinator adds evidence to any area', r.status === 201, msg(r));
const ev2 = r.data;

// --- CAPA photo pairs appear automatically ---
const year = new Date().getFullYear();
const obs = await db.observation.create({ data: { tenantId: loc.tenantId, observationCode: `ISO-OBS-${Date.now()}`, locationId: loc.id, category: 'S2_SET_IN_ORDER', severity: 'MINOR', title: 'ISO-tool not returned', description: 'x', beforePhotoUrl: row.beforePhotoUrl, status: 'RESOLVED' } });
await db.correctiveAction.create({ data: { tenantId: loc.tenantId, actionCode: `ISO-CAPA-${year}-${Date.now()}`, observationId: obs.id, locationId: loc.id, title: 'ISO-shadow outline added', description: 'x', targetDate: new Date(), status: 'VERIFIED', afterPhotoUrl: row.afterPhotoUrl, closureNotes: 'Outline painted', verifiedAt: new Date(), assigneeId: owner.id } });
const obsOpen = await db.observation.create({ data: { tenantId: loc.tenantId, observationCode: `ISO-OBS2-${Date.now()}`, locationId: loc.id, category: 'S3_SHINE', severity: 'MODERATE', title: 'ISO-oil drip', description: 'x', status: 'OPEN' } });
r = await req('GET', `${L()}/evidence`, { token: AUDITOR });
const capa = r.data?.find((e) => e.source === 'CAPA');
check('gallery lists uploads and the closed CAPA pair', r.status === 200 && r.data.length === 3 && !!capa, `${r.data?.length} items`);
check('CAPA pair carries its action, pillar and closure note', capa?.category === 'S2_SET_IN_ORDER' && capa.actionCode?.startsWith('ISO-CAPA') && capa.description.includes('Outline painted'), JSON.stringify(capa ?? {}).slice(0, 160));
check('newest first', r.data && new Date(r.data[0].createdAt) >= new Date(r.data[r.data.length - 1].createdAt));
r = await req('GET', `${L()}/scorecard`, { token: OWNER });
check('scorecard counts evidence and the unassigned observation', r.data?.evidence?.count === 3 && r.data.work.openObservations === 1 && r.data.work.openActions === 0, JSON.stringify(r.data?.work) + ' ' + r.data?.evidence?.count);

// --- Removing evidence ---
check('owner cannot remove the coordinator\'s evidence', (await req('DELETE', `${L()}/evidence/${ev2.id}`, { token: OWNER })).status === 403);
r = await req('DELETE', `${L()}/evidence/${ev1.id}`, { token: OWNER });
check('uploader removes their own evidence', r.status === 200 && r.data.removed === true, msg(r));
check('coordinator removes any evidence', (await req('DELETE', `${L()}/evidence/${ev2.id}`, { token: COORD })).status === 200);
check('removed evidence hidden but kept', (await req('GET', `${L()}/evidence`, { token: OWNER })).data.length === 1 && !!(await db.locationEvidence.findFirst({ where: { id: ev1.id, deletedAt: { not: null } } })));
check('removing twice returns 404', (await req('DELETE', `${L()}/evidence/${ev1.id}`, { token: COORD })).status === 404);
check('CAPA pairs cannot be removed here', (await req('DELETE', `${L()}/evidence/${capa?.id}`, { token: COORD })).status === 404);

// --- Documents: real size and uploader ---
r = await req('POST', `${L()}/documents`, { token: OWNER, body: { title: 'ISO SOP', docType: 'SOP', fileUrl: pdf, fileSizeKb: 1250 } });
const doc = r.data?.data ?? r.data;
const docRow = doc?.id ? await db.locationDocument.findUnique({ where: { id: doc.id } }) : null;
const stored = docRow ? await db.storedFile.findUnique({ where: { id: docRow.fileUrl.split('/').pop() } }) : null;
check('uploaded document stored as a file', r.status === 201 && /^\/api\/v1\/files\//.test(docRow?.fileUrl ?? ''), msg(r));
check('size comes from storage, not the client', !!stored && docRow.fileSizeKb === Math.max(1, Math.round(stored.sizeBytes / 1024)) && docRow.fileSizeKb !== 1250, `${docRow?.fileSizeKb} KB`);
check('uploader recorded', docRow?.uploadedById === owner.id);
r = await req('POST', `${L()}/documents`, { token: OWNER, body: { title: 'ISO external SOP', docType: 'SOP', fileUrl: 'https://intranet.example.com/sop.pdf', fileSizeKb: 1250 } });
const extRow = await db.locationDocument.findUnique({ where: { id: (r.data?.data ?? r.data)?.id } });
check('external link stored with no size', r.status === 201 && extRow?.fileSizeKb === 0, msg(r));

await db.observation.deleteMany({ where: { id: { in: [obs.id, obsOpen.id] } } });
await db.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

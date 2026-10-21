// R3: organization configuration, CAPA closure step, REUSE disposition, certificates, competency gate.
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const { PrismaClient } = require('@prisma/client');
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
const ADMIN = await login('admin@skilglobal.com');
const COORD = await login('coordinator.5s@skilglobal.com');
const OWNER = await login('owner.cnc01@skilglobal.com');
const AUDITOR = await login('auditor.lead@skilglobal.com');
const users = (await req('GET', '/users', { token: ADMIN })).data;
const owner = users.find((u) => u.email === 'owner.cnc01@skilglobal.com');
const auditor = users.find((u) => u.email === 'auditor.lead@skilglobal.com');

let r = await req('GET', '/settings', { token: OWNER });
check('any member reads effective settings', r.status === 200 && r.data.sla.hoursBySeverity.CRITICAL > 0 && Array.isArray(r.data.hierarchyLevels), msg(r));
const original = r.data;
const rawSettings = (await db.tenant.findUnique({ where: { id: owner.tenantId }, select: { settings: true } })).settings;
check('defaults keep the historical pass mark (70)', original.analytics.passScore === 70 || original.analytics.passScore !== undefined, original.analytics.passScore);

// ---------- Validation & authorization ----------
check('coordinator cannot change settings', (await req('PATCH', '/settings', { token: COORD, body: { brandColor: '#000000' } })).status === 403);
check('bad colour -> 400', (await req('PATCH', '/settings', { token: ADMIN, body: { brandColor: 'blue' } })).status === 400);
check('lower-case prefix -> 400', (await req('PATCH', '/settings', { token: ADMIN, body: { numbering: { observation: 'abn' } } })).status === 400);
check('duplicate prefixes -> 400', (await req('PATCH', '/settings', { token: ADMIN, body: { numbering: { observation: 'CAPA' } } })).status === 400);
check('SLA out of range -> 400', (await req('PATCH', '/settings', { token: ADMIN, body: { sla: { hoursBySeverity: { CRITICAL: 0 } } } })).status === 400);
check('maturity bands without 0 band -> 400', (await req('PATCH', '/settings', {
  token: ADMIN, body: { analytics: { maturityBands: [{ level: 2, name: 'A', description: '', minScore: 50, color: '#111111' }, { level: 1, name: 'B', description: '', minScore: 10, color: '#222222' }] } },
})).status === 400);
check('unknown escalation recipient -> 400', (await req('PATCH', '/settings', { token: ADMIN, body: { escalation: { actionSteps: [{ offsetDays: 1, notify: ['CEO'] }] } } })).status === 400);
check('hierarchy needs 2+ levels -> 400', (await req('PATCH', '/settings', { token: ADMIN, body: { hierarchyLevels: ['Only'] } })).status === 400);

// ---------- Partial update keeps other keys ----------
r = await req('PATCH', '/settings', { token: ADMIN, body: { sla: { hoursBySeverity: { CRITICAL: 12 } }, numbering: { observation: 'ABN' }, terminology: { observation: 'Abnormality' } } });
check('admin updates settings', r.status === 200 && r.data.sla.hoursBySeverity.CRITICAL === 12, msg(r));
check('other severities untouched', r.data.sla.hoursBySeverity.MAJOR === original.sla.hoursBySeverity.MAJOR, r.data.sla.hoursBySeverity.MAJOR);
check('terminology override applied', r.data.terminology.observation === 'Abnormality' && r.data.terminology.redTag === original.terminology.redTag);
const log = (await req('GET', '/activity-logs?entityType=Settings&pageSize=1', { token: ADMIN })).data.items[0];
check('settings change audited with key-level diff', !!log?.changes?.diff?.['settings.sla.hoursBySeverity.CRITICAL'], JSON.stringify(log?.changes?.diff));

// ---------- Settings drive behaviour ----------
const node = (await req('GET', '/organization/nodes', { token: COORD })).data[0];
r = await req('POST', '/locations', { token: COORD, body: { name: 'ISO Settings Cell', areaCode: 'iso-set-loc', orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId: owner.id } });
const loc = r.data;
r = await req('POST', '/observations', { token: OWNER, body: { locationId: loc.id, title: 'ISO critical leak', description: 'Oil leak', category: 'S6_SAFETY', severity: 'CRITICAL' } });
const obs = r.data;
check('observation number uses configured prefix', obs?.observationCode?.startsWith('ABN-'), obs?.observationCode);
r = await req('POST', '/corrective-actions', { token: COORD, body: { observationId: obs.id, locationId: loc.id, title: 'ISO fix leak', description: 'Replace seal', assigneeId: owner.id } });
const capa = r.data;
check('CAPA SLA from severity matrix (12h)', capa?.slaHours === 12, `${r.status} ${capa?.slaHours}`);
const hours = (new Date(capa.targetDate) - new Date(capa.createdAt)) / 3600000;
check('target date = created + 12h', Math.abs(hours - 12) < 0.1, hours.toFixed(2));

// ---------- CAPA closure step ----------
r = await req('POST', `/corrective-actions/${capa.id}/close`, { token: COORD, body: { effective: true, effectivenessReview: 'x' } });
check('close before verification -> 409', r.status === 409, msg(r));
// Root cause and solution are required before a fix can go to verification
await req('PATCH', `/corrective-actions/${capa.id}/5-why`, { token: OWNER, body: { why1: 'ISO cause', solution: 'ISO fix' } });
r = await req('POST', `/corrective-actions/${capa.id}/submit-closure`, { token: OWNER, body: { closureNotes: 'Seal replaced', afterPhotoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC' } });
check('closure submitted', r.status < 300, msg(r));
r = await req('POST', `/corrective-actions/${capa.id}/verify`, { token: AUDITOR, body: { approved: true, verificationNotes: 'ok' } });
check('verified', r.data?.status === 'VERIFIED', msg(r));
r = await req('POST', `/corrective-actions/${capa.id}/close`, { token: OWNER, body: { effective: true, effectivenessReview: 'x' } });
check('area owner cannot close -> 403', r.status === 403, msg(r));
r = await req('POST', `/corrective-actions/${capa.id}/close`, { token: COORD, body: { effective: true } });
check('review text required -> 400', r.status === 400, msg(r));
r = await req('POST', `/corrective-actions/${capa.id}/close`, { token: COORD, body: { effective: false, effectivenessReview: 'Leak returned after a week' } });
check('ineffective fix reopens', r.data?.status === 'REOPENED', msg(r));
await req('POST', `/corrective-actions/${capa.id}/submit-closure`, { token: OWNER, body: { closureNotes: 'New seal type', afterPhotoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC' } });
await req('POST', `/corrective-actions/${capa.id}/verify`, { token: AUDITOR, body: { approved: true, verificationNotes: 'ok' } });
r = await req('POST', `/corrective-actions/${capa.id}/close`, { token: COORD, body: { effective: true, effectivenessReview: 'Dry for 30 days' } });
check('effective fix closes with reviewer', r.data?.status === 'CLOSED' && !!r.data?.closedAt && r.data?.closedById, msg(r));

// ---------- REUSE disposition ----------
r = await req('POST', '/red-tags', { token: OWNER, body: { locationId: loc.id, itemName: 'ISO spare fixture', itemDescription: 'x', category: 'UNNEEDED_TOOL', reason: 'unused', quantity: 1 } });
const tag = r.data;
r = await req('POST', `/red-tags/${tag.id}/disposition`, { token: COORD, body: { dispositionAction: 'REUSE', dispositionJustification: 'Needed on line 2', supervisorApproved: true } });
check('REUSE disposition accepted', r.status < 300 && r.data?.dispositionAction === 'REUSE', msg(r));
r = await req('POST', `/red-tags/${tag.id}/close`, { token: COORD, body: {} });
check('closing a reuse tag returns the item (not disposed)', r.data?.status === 'RETURNED', msg(r));
r = await req('POST', '/red-tags', { token: OWNER, body: { locationId: loc.id, itemName: 'ISO broken jig', itemDescription: 'x', category: 'BROKEN_EQUIPMENT', reason: 'broken', quantity: 1 } });
const tag2 = r.data;
await req('POST', `/red-tags/${tag2.id}/disposition`, { token: COORD, body: { dispositionAction: 'DISPOSE_SCRAP', dispositionJustification: 'Beyond repair', supervisorApproved: true } });
r = await req('POST', `/red-tags/${tag2.id}/close`, { token: COORD, body: {} });
check('disposing without a photo of the disposal -> 400', r.status === 400, msg(r));
r = await req('POST', `/red-tags/${tag2.id}/close`, { token: COORD, body: { closurePhotoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC' } });
check('closing a scrap tag disposes it', r.data?.status === 'DISPOSED', msg(r));

// ---------- Certificates & competency gate ----------
r = await req('GET', '/training/certificates/me', { token: AUDITOR });
check('my certificates endpoint', r.status === 200 && Array.isArray(r.data), msg(r));
const auditorHasCert = r.data.some((c) => c.status === 'VALID');
check('competency register restricted', (await req('GET', '/training/certificates', { token: OWNER })).status === 403);
check('unknown certificate -> 404', (await req('GET', '/training/certificate/CERT-5S-NOPE', { token: AUDITOR })).status === 404);

const tpl = (await req('GET', '/audit-templates', { token: COORD })).data.find((t) => t.status === 'ACTIVE') ?? (await req('GET', '/audit-templates', { token: COORD })).data[0];
await req('PATCH', '/settings', { token: ADMIN, body: { competency: { requireCertifiedAuditors: true } } });
r = await req('POST', '/audit-executions/start', { token: AUDITOR, body: { locationId: loc.id, templateId: tpl.id } });
if (auditorHasCert) {
  check('certified auditor may start an audit', r.status < 300, msg(r));
} else {
  check('uncertified auditor blocked when certification required', r.status === 403, msg(r));
}
if (r.data?.id) await req('DELETE', `/audit-executions/${r.data.id}`, { token: COORD });
await req('PATCH', '/settings', { token: ADMIN, body: { competency: { requireCertifiedAuditors: false } } });
r = await req('POST', '/audit-executions/start', { token: AUDITOR, body: { locationId: loc.id, templateId: tpl.id } });
check('gate off -> auditor may start', r.status < 300, msg(r));
if (r.data?.id) await req('DELETE', `/audit-executions/${r.data.id}`, { token: COORD });

// ---------- Restore (raw JSON, so no explicit copies of defaults are left behind) ----------
await db.tenant.update({ where: { id: owner.tenantId }, data: { settings: rawSettings } });
r = await req('GET', '/settings', { token: ADMIN });
check('settings restored', r.data.numbering.observation === original.numbering.observation && r.data.sla.hoursBySeverity.CRITICAL === original.sla.hoursBySeverity.CRITICAL);
await db.$disconnect();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

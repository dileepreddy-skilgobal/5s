// Daily area routine: Kamishibai checks + shadow-board tools per location, daily results, observations
// raised from failures, access rules and history. Run from backend dir.
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
const loc = await mkLoc('ISO Routine Cell', 'iso-rtn-own', owner.id);
const other = await mkLoc('ISO Routine Other', 'iso-rtn-oth', coord.id);
const R = (id = loc.id) => `/locations/${id}/routine`;

// --- Set-up ---
let r = await req('GET', R(), { token: OWNER });
check('empty routine for a new area', r.status === 200 && r.data.kamishibai.length === 0 && r.data.tools.length === 0 && r.data.isToday === true, msg(r));
r = await req('POST', `${R()}/items/defaults`, { token: OWNER });
check('owner loads the 5 standard checks', r.status === 200 && r.data.length === 5 && r.data.every((i) => i.kind === 'KAMISHIBAI'), msg(r));
check('standard checks cover the pillars', new Set(r.data.map((i) => i.category)).size === 5, r.data.map((i) => i.category).join(','));
r = await req('POST', `${R()}/items/defaults`, { token: OWNER });
check('standard checks cannot be loaded twice', r.status === 409, msg(r));
r = await req('POST', `${R()}/items`, { token: OWNER, body: { kind: 'SHADOW_TOOL', text: 'ISO torque wrench', position: 'A1' } });
check('owner adds a shadow-board tool', r.status === 201 && r.data.category === 'S2_SET_IN_ORDER' && r.data.position === 'A1', msg(r));
const tool = r.data;
r = await req('POST', `${R()}/items`, { token: COORD, body: { kind: 'SHADOW_TOOL', text: 'ISO caliper', position: 'A2' } });
check('coordinator adds a tool to any area', r.status === 201, msg(r));
const tool2 = r.data;
check('too-short text rejected', (await req('POST', `${R()}/items`, { token: OWNER, body: { kind: 'KAMISHIBAI', text: 'x' } })).status === 400);
check('unknown kind rejected', (await req('POST', `${R()}/items`, { token: OWNER, body: { kind: 'CHECKLIST', text: 'Something' } })).status === 400);
r = await req('POST', `${R(other.id)}/items`, { token: OWNER, body: { kind: 'KAMISHIBAI', text: 'Not my area' } });
check('area owner cannot configure an area they do not own', r.status === 403, msg(r));
r = await req('PATCH', `${R()}/items/${tool.id}`, { token: OWNER, body: { text: 'ISO torque wrench 20-100 Nm', position: 'A3' } });
check('item edited', r.status === 200 && r.data.text === 'ISO torque wrench 20-100 Nm' && r.data.position === 'A3', msg(r));

// --- Daily results ---
r = await req('GET', R(), { token: OWNER });
const [c1, c2] = r.data.kamishibai;
check('day lists checks and tools, none done', r.data.kamishibai.length === 5 && r.data.tools.length === 2 && r.data.summary.kamishibai.done === 0 && r.data.kamishibai.every((i) => i.check === null));
r = await req('PUT', `${R()}/checks`, { token: OWNER, body: { itemId: c1.id, status: 'OK' } });
check('owner records OK', r.status === 200 && r.data.summary.kamishibai.done === 1 && r.data.kamishibai[0].check.status === 'OK' && !!r.data.kamishibai[0].check.checkedBy, msg(r));
check('wrong status for a check rejected', (await req('PUT', `${R()}/checks`, { token: OWNER, body: { itemId: c2.id, status: 'PRESENT' } })).status === 400);
check('observation for an OK result rejected', (await req('PUT', `${R()}/checks`, { token: OWNER, body: { itemId: c2.id, status: 'OK', raiseObservation: true } })).status === 400);
r = await req('PUT', `${R()}/checks`, { token: OWNER, body: { itemId: c2.id, status: 'NOT_OK', note: 'ISO coolant on the floor', raiseObservation: true } });
const failedRow = r.data?.kamishibai?.find((i) => i.id === c2.id);
check('failed check raises an observation', r.status === 200 && !!failedRow?.check?.observationId && r.data.summary.kamishibai.issues === 1, msg(r));
const obs = failedRow?.check?.observationId ? await db.observation.findUnique({ where: { id: failedRow.check.observationId } }) : null;
check('observation carries the check, area, pillar and note', !!obs && obs.locationId === loc.id && obs.category === c2.category && obs.severity === 'MINOR' && obs.title.includes(c2.text) && obs.description === 'ISO coolant on the floor', obs ? `${obs.title} | ${obs.category} | ${obs.severity}` : 'none');
r = await req('PUT', `${R()}/checks`, { token: OWNER, body: { itemId: c2.id, status: 'NOT_OK', note: 'ISO still wet', raiseObservation: true } });
check('re-recording does not raise a second observation', r.data?.kamishibai?.find((i) => i.id === c2.id)?.check?.observationId === obs?.id && (await db.observation.count({ where: { locationId: loc.id } })) === 1);
r = await req('PUT', `${R()}/checks`, { token: OWNER, body: { itemId: c1.id, status: 'NOT_OK' } });
check('a result can be corrected the same day', r.data?.kamishibai?.[0]?.check?.status === 'NOT_OK' && !r.data.kamishibai[0].check.observationId);
check('one result per item per day', (await db.routineCheck.count({ where: { itemId: c1.id } })) === 1);
r = await req('PUT', `${R()}/checks`, { token: OWNER, body: { itemId: tool.id, status: 'MISSING', raiseObservation: true } });
const toolObsId = r.data?.tools?.find((i) => i.id === tool.id)?.check?.observationId;
const toolObs = toolObsId ? await db.observation.findUnique({ where: { id: toolObsId } }) : null;
check('missing tool raises a Set-in-Order observation', !!toolObs && toolObs.category === 'S2_SET_IN_ORDER' && /missing/.test(toolObs.title) && toolObs.title.includes('A3'), toolObs?.title ?? msg(r));
r = await req('PUT', `${R()}/checks`, { token: OWNER, body: { itemId: tool2.id, status: 'PRESENT' } });
check('tool marked present', r.data?.summary?.tools?.done === 2 && r.data.summary.tools.issues === 1, JSON.stringify(r.data?.summary));
check('tool cannot be marked OK', (await req('PUT', `${R()}/checks`, { token: OWNER, body: { itemId: tool2.id, status: 'OK' } })).status === 400);

// --- Access ---
check('auditor can read the routine', (await req('GET', R(), { token: AUDITOR })).status === 200);
check('auditor cannot record results', (await req('PUT', `${R()}/checks`, { token: AUDITOR, body: { itemId: c1.id, status: 'OK' } })).status === 403);
const otherItem = (await req('POST', `${R(other.id)}/items`, { token: COORD, body: { kind: 'KAMISHIBAI', text: 'ISO other check' } })).data;
r = await req('PUT', `${R(other.id)}/checks`, { token: OWNER, body: { itemId: otherItem.id, status: 'OK' } });
check('area owner cannot record for an area they do not own', r.status === 403, msg(r));
check('item from another area rejected', (await req('PUT', `${R()}/checks`, { token: OWNER, body: { itemId: otherItem.id, status: 'OK' } })).status === 404);
check('unknown area returns 404', (await req('GET', R('00000000-0000-4000-8000-000000000000'), { token: OWNER })).status === 404);

// --- Past days and history ---
const yesterday = (() => { const d = new Date(Date.now() - 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
r = await req('GET', `${R()}?date=${yesterday}`, { token: OWNER });
check('a past day is read-only and empty', r.status === 200 && r.data.isToday === false && r.data.summary.kamishibai.done === 0, msg(r));
check('bad date rejected', (await req('GET', `${R()}?date=16-10-2026`, { token: OWNER })).status === 400);
r = await req('GET', `${R()}/history?days=30`, { token: OWNER });
check('history covers 30 days with today first', r.status === 200 && r.data.days.length === 30 && r.data.days[0].kamishibai.done === 2 && r.data.days[0].tools.done === 2 && r.data.days[1].kamishibai.done === 0, msg(r));
check('history counts issues', r.data?.days?.[0]?.kamishibai?.issues === 2 && r.data.days[0].tools.issues === 1, JSON.stringify(r.data?.days?.[0]));

// --- Retire ---
r = await req('DELETE', `${R()}/items/${c2.id}`, { token: OWNER });
check('item retired', r.status === 200 && r.data.retired === true, msg(r));
r = await req('GET', R(), { token: OWNER });
check('retired item no longer listed', r.data.kamishibai.length === 4 && !r.data.kamishibai.some((i) => i.id === c2.id));
check('its past result is kept', (await db.routineCheck.count({ where: { itemId: c2.id } })) === 1);
check('retiring twice returns 404', (await req('DELETE', `${R()}/items/${c2.id}`, { token: OWNER })).status === 404);
check('retired item cannot be recorded', (await req('PUT', `${R()}/checks`, { token: OWNER, body: { itemId: c2.id, status: 'OK' } })).status === 404);

// --- Audit trail ---
await new Promise((res) => setTimeout(res, 300));
const logged = await db.activityLog.findFirst({ where: { action: 'RECORD_ROUTINE_CHECK', actorId: owner.id }, orderBy: { createdAt: 'desc' } });
check('results are written to the activity trail', !!logged && logged.entityType === 'Location', logged ? `${logged.action} ${logged.entityType}` : 'none');

await db.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

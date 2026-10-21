// R4: notifications, escalation scheduler, preferences, push devices. Run from backend dir.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ADMIN = await login('admin@skilglobal.com');
const COORD = await login('coordinator.5s@skilglobal.com');
const OWNER = await login('owner.cnc01@skilglobal.com');
const AUDITOR = await login('auditor.lead@skilglobal.com');
const users = (await req('GET', '/users', { token: ADMIN })).data;
const owner = users.find((u) => u.email === 'owner.cnc01@skilglobal.com');
const auditor = users.find((u) => u.email === 'auditor.lead@skilglobal.com');
const tenantId = owner.tenantId;
const mine = async (token, q = '') => (await req('GET', `/notifications?pageSize=50${q}`, { token })).data;

// Clean slate for the test users' unread state (only read flags; nothing deleted)
await req('POST', '/notifications/read-all', { token: OWNER });
await req('POST', '/notifications/read-all', { token: AUDITOR });
check('unread count resets', (await req('GET', '/notifications/unread-count', { token: OWNER })).data.unread === 0);
check('unauthenticated -> 401', (await req('GET', '/notifications')).status === 401);

// ---------- Event: action assigned ----------
const node = (await req('GET', '/organization/nodes', { token: COORD })).data[0];
const loc = (await req('POST', '/locations', { token: COORD, body: { name: 'ISO Notify Cell', areaCode: 'iso-ntf-loc', orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId: owner.id } })).data;
const obs = (await req('POST', '/observations', { token: AUDITOR, body: { locationId: loc.id, title: 'ISO notify finding', description: 'x', category: 'S3_SHINE', severity: 'MAJOR' } })).data;
const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
let r = await req('POST', '/corrective-actions', { token: COORD, body: { observationId: obs.id, locationId: loc.id, title: 'ISO clean spill', description: 'x', assigneeId: owner.id, targetDate: threeDaysAgo } });
const capa = r.data;
check('fixture CAPA (3 days overdue)', r.status === 201, msg(r));
let list = await mine(OWNER);
const assigned = list.items.find((n) => n.type === 'ACTION_ASSIGNED' && n.entityId === capa.id);
check('assignee notified of assignment', !!assigned, JSON.stringify(list.items.slice(0, 2).map((n) => n.type)));
check('notification links to the action', assigned?.link === `/capa?id=${capa.id}`, assigned?.link);
check('unread badge counts it', (await req('GET', '/notifications/unread-count', { token: OWNER })).data.unread >= 1);

// ---------- Delivery (no SMTP configured -> logged; push off) ----------
await sleep(1500);
const row = await db.notification.findFirst({ where: { id: assigned?.id } });
check('email delivery recorded (LOGGED without SMTP)', row?.emailStatus === 'LOGGED', row?.emailStatus);
check('push skipped (disabled / no device)', row?.pushStatus === 'SKIPPED', row?.pushStatus);

// ---------- Scheduler escalation ----------
check('scheduler restricted to admins', (await req('POST', '/notifications/run-scheduler', { token: COORD })).status === 403);
r = await req('POST', '/notifications/run-scheduler', { token: ADMIN });
check('scheduler runs', r.status === 200 && r.data.notificationsCreated >= 1, msg(r) + ' ' + JSON.stringify(r.data));
list = await mine(OWNER);
const overdue = list.items.find((n) => n.type === 'ACTION_OVERDUE' && n.entityId === capa.id);
check('+2 step escalates to assignee/area owner', !!overdue && /overdue/.test(overdue.title), overdue?.title);
const before = await db.notification.count({ where: { tenantId, entityId: capa.id } });
await req('POST', '/notifications/run-scheduler', { token: ADMIN });
const after = await db.notification.count({ where: { tenantId, entityId: capa.id } });
check('re-running the scan does not duplicate reminders', before === after, `${before} -> ${after}`);
// Re-planning is a manager step (POST /due-date); the assignee cannot move their own deadline
await req('POST', `/corrective-actions/${capa.id}/due-date`, { token: ADMIN, body: { targetDate: new Date(Date.now() + 86400000).toISOString(), reason: 'ISO re-plan' } });
await req('POST', '/notifications/run-scheduler', { token: ADMIN });
list = await mine(OWNER);
check('re-planned due date re-arms reminders (T-2 "due in")', list.items.some((n) => n.type === 'ACTION_DUE_SOON' && n.entityId === capa.id), list.items.filter((n) => n.entityId === capa.id).map((n) => n.type).join(','));

// Overdue scheduled audit -> marked OVERDUE + auditor notified
const tv = await db.auditTemplateVersion.findFirst({ where: { tenantId }, select: { id: true } });
const inst = await db.scheduledAuditInstance.create({ data: { tenantId, auditCode: `ISO-NTF-${Date.now()}`, templateVersionId: tv.id, locationId: loc.id, auditorId: auditor.id, plannedDate: new Date(Date.now() - 5 * 86400000), dueDate: new Date(Date.now() - 2 * 86400000), status: 'SCHEDULED' } });
await req('POST', '/notifications/run-scheduler', { token: ADMIN });
const instAfter = await db.scheduledAuditInstance.findUnique({ where: { id: inst.id } });
check('overdue audit marked OVERDUE', instAfter.status === 'OVERDUE', instAfter.status);
check('auditor notified of overdue audit', (await mine(AUDITOR)).items.some((n) => n.type === 'AUDIT_OVERDUE' && n.entityId === inst.id));
await db.scheduledAuditInstance.delete({ where: { id: inst.id } });

// ---------- Workflow events ----------
// Root cause and solution are required before a fix can go to verification
await req('PATCH', `/corrective-actions/${capa.id}/5-why`, { token: OWNER, body: { why1: 'ISO cause', solution: 'ISO fix' } });
await req('POST', `/corrective-actions/${capa.id}/submit-closure`, { token: OWNER, body: { closureNotes: 'Cleaned', afterPhotoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC' } });
const coordUser = users.find((u) => u.email === 'coordinator.5s@skilglobal.com');
const coordToken = COORD;
check('assigner told the action awaits verification', (await mine(coordToken)).items.some((n) => n.type === 'ACTION_SUBMITTED' && n.entityId === capa.id));
await req('POST', `/corrective-actions/${capa.id}/verify`, { token: AUDITOR, body: { approved: false, verificationNotes: 'Still dirty' } });
check('assignee told the action was reopened', (await mine(OWNER)).items.some((n) => n.type === 'ACTION_REOPENED' && n.entityId === capa.id));
check('actor is not notified of own action', !(await mine(AUDITOR)).items.some((n) => n.type === 'ACTION_REOPENED' && n.entityId === capa.id));

// Kudos
r = await req('POST', '/analytics/gamification/kudos', { token: AUDITOR, body: { toUserId: owner.id, category: 'TEAMWORK', message: 'ISO-NOTIFY thanks' } });
check('kudos recipient notified', (await mine(OWNER)).items.some((n) => n.type === 'KUDOS_RECEIVED' && n.body === 'ISO-NOTIFY thanks'));

// ---------- Read state & isolation ----------
list = await mine(OWNER, '&unreadOnly=true');
const one = list.items[0];
check('unread filter', list.items.every((n) => n.readAt === null));
check('cannot mark another user\'s notification', (await req('POST', `/notifications/${one.id}/read`, { token: AUDITOR })).status === 404);
r = await req('POST', `/notifications/${one.id}/read`, { token: OWNER });
check('mark one read', r.status === 200);
r = await req('POST', '/notifications/read-all', { token: OWNER });
check('mark all read', r.status === 200 && (await req('GET', '/notifications/unread-count', { token: OWNER })).data.unread === 0);

// ---------- Preferences ----------
r = await req('PATCH', '/notifications/preferences', { token: OWNER, body: { emailNotifications: false } });
check('email opt-out saved', r.data?.emailNotifications === false, msg(r));
await req('POST', '/analytics/gamification/kudos', { token: AUDITOR, body: { toUserId: owner.id, category: 'TEAMWORK', message: 'ISO-NOTIFY again' } });
await sleep(1000);
const n2 = await db.notification.findFirst({ where: { userId: owner.id, body: 'ISO-NOTIFY again' } });
check('opted-out email skipped, in-app kept', n2?.emailStatus === 'SKIPPED', n2?.emailStatus);
await req('PATCH', '/notifications/preferences', { token: OWNER, body: { emailNotifications: true } });
check('bad preference type -> 400', (await req('PATCH', '/notifications/preferences', { token: OWNER, body: { emailNotifications: 'yes' } })).status === 400);

// ---------- Push devices ----------
check('invalid push token -> 400', (await req('POST', '/notifications/devices', { token: OWNER, body: { token: 'abc', platform: 'android' } })).status === 400);
const tok = `ExponentPushToken[ISO${Date.now()}]`;
r = await req('POST', '/notifications/devices', { token: OWNER, body: { token: tok, platform: 'android' } });
check('device registered', r.status === 201, msg(r));
r = await req('DELETE', `/notifications/devices/${encodeURIComponent(tok)}`, { token: OWNER });
check('device unregistered', r.data?.removed === 1, msg(r));

await db.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

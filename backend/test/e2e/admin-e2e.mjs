// W5: organization settings (BRD defaults, digest schedule, closure-evidence exception, recognition switch),
// "Run reminders now", scheduler scans (escalation tier, action.overdue webhook, critical observation, red-tag ageing,
// certificate expiry, audit due soon, manager digest), onboarding starter content and checklist. Run from backend dir.
// Needs the test server with WEBHOOK_ALLOW_PRIVATE=true and WEBHOOK_DISPATCH_SECONDS=1 (see run.mjs).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
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
const login = async (email) => (await req('POST', '/auth/login', { body: { email, password: 'Admin@123456' } })).data?.accessToken;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400000;
const STAMP = Date.now();

const ADMIN = await login('admin@skilglobal.com');
const COORD = await login('coordinator.5s@skilglobal.com');
const OWNER = await login('owner.cnc01@skilglobal.com');
const AUDITOR = await login('auditor.lead@skilglobal.com');
const EXEC = await login('executive@skilglobal.com');
const SA = await login('superadmin@skilglobal.com');
const APEX = await login('admin@apex-aero.com');
const users = (await req('GET', '/users', { token: ADMIN })).data;
const userId = (email) => users.find((u) => u.email === email)?.id;
const owner = users.find((u) => u.email === 'owner.cnc01@skilglobal.com');
const tenantId = owner.tenantId;
const mine = async (token) => (await req('GET', '/notifications?pageSize=100', { token })).data?.items ?? [];

// Restored in finally: the stored settings JSON (exactly as it was) and every fixture created below
const rawSettings = (await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })).settings;
const created = { locationId: null, redTagId: null, certificateId: null, instanceId: null, webhookId: null, onboardTenantId: null };
const received = [];
const server = createServer((rq, rs) => {
  let body = '';
  rq.on('data', (c) => (body += c));
  rq.on('end', () => {
    received.push({ event: rq.headers['x-5s-event'], body });
    rs.statusCode = 200;
    rs.end('ok');
  });
});
await new Promise((res) => server.listen(3998, res));

try {
  // ---------- BRD defaults ----------
  let r = await req('GET', '/settings/defaults', { token: OWNER });
  const d = r.data;
  check('defaults readable by any member', r.status === 200, msg(r));
  check('BRD SLA: Minor = 360 h (15 days)', d?.sla?.hoursBySeverity?.MINOR === 360, d?.sla?.hoursBySeverity?.MINOR);
  const ladder = (d?.escalation?.actionSteps ?? []).map((s) => `${s.offsetDays}:${[...s.notify].sort().join('+')}`).join(' ');
  check(
    'BRD ladder: T-2 reminder, due-date owner alert, +2 dept head, +5 plant head, +10 coordinator',
    ladder === '-2:ASSIGNEE 0:AREA_OWNER+ASSIGNEE 2:ASSIGNEE+DEPT_HEAD 5:ASSIGNEE+PLANT_HEAD 10:ASSIGNEE+COORDINATOR_5S',
    ladder,
  );
  check('digest defaults (08:00, time zone, manager digest on)', d?.escalation?.digestHour === 8 && typeof d?.escalation?.timeZone === 'string' && d?.escalation?.managerDigest === true);
  check('closure without photo is off by default', d?.capa?.allowClosureWithoutPhoto === false);
  check('recognition on by default', d?.gamification?.enabled === true && d?.gamification?.showIndividualLeaderboard === true);

  r = await req('GET', '/settings', { token: OWNER });
  check('effective settings carry the new sections', r.status === 200 && typeof r.data?.capa?.allowClosureWithoutPhoto === 'boolean' && typeof r.data?.gamification?.enabled === 'boolean' && Number.isInteger(r.data?.escalation?.digestHour), msg(r));

  // ---------- Settings: validation, roles, tenant scoping ----------
  check('coordinator cannot change CAPA settings -> 403', (await req('PATCH', '/settings', { token: COORD, body: { capa: { allowClosureWithoutPhoto: true } } })).status === 403);
  check('executive cannot change recognition -> 403', (await req('PATCH', '/settings', { token: EXEC, body: { gamification: { enabled: false } } })).status === 403);
  check('digest hour 24 -> 400', (await req('PATCH', '/settings', { token: ADMIN, body: { escalation: { digestHour: 24 } } })).status === 400);
  check('digest hour not an integer -> 400', (await req('PATCH', '/settings', { token: ADMIN, body: { escalation: { digestHour: 7.5 } } })).status === 400);
  check('unknown time zone -> 400', (await req('PATCH', '/settings', { token: ADMIN, body: { escalation: { timeZone: 'Mars/Olympus_Mons' } } })).status === 400);
  check('closure exception must be boolean -> 400', (await req('PATCH', '/settings', { token: ADMIN, body: { capa: { allowClosureWithoutPhoto: 'yes' } } })).status === 400);
  check('recognition switch must be boolean -> 400', (await req('PATCH', '/settings', { token: ADMIN, body: { gamification: { enabled: 'off' } } })).status === 400);

  const apexBefore = (await req('GET', '/settings', { token: APEX })).data;
  r = await req('PATCH', '/settings', {
    token: ADMIN,
    body: {
      capa: { allowClosureWithoutPhoto: true },
      // Digest window always open for the scan below; BRD ladder pinned so the tier assertions do not depend on earlier suites
      escalation: {
        digestHour: 0,
        timeZone: 'UTC',
        managerDigest: true,
        dailyDigest: true,
        actionSteps: d.escalation.actionSteps,
      },
    },
  });
  check('admin saves closure exception and digest schedule', r.status === 200 && r.data?.capa?.allowClosureWithoutPhoto === true && r.data?.escalation?.digestHour === 0 && r.data?.escalation?.timeZone === 'UTC', msg(r));
  check('other sections keep their values (merge, not replace)', r.data?.escalation?.overdueAuditNotify?.length > 0 && r.data?.sla?.hoursBySeverity?.CRITICAL > 0);
  const apexAfter = (await req('GET', '/settings', { token: APEX })).data;
  check(
    'another organization is not affected',
    apexAfter?.capa?.allowClosureWithoutPhoto === apexBefore?.capa?.allowClosureWithoutPhoto && apexAfter?.escalation?.digestHour === apexBefore?.escalation?.digestHour,
    `${apexBefore?.escalation?.digestHour} -> ${apexAfter?.escalation?.digestHour}`,
  );

  // ---------- Recognition switch ----------
  const node = (await req('GET', '/organization/nodes', { token: COORD })).data[0];
  r = await req('POST', '/locations', { token: COORD, body: { name: 'ISO Admin Cell', areaCode: `ISO-ADM-${STAMP}`, orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId: owner.id } });
  const loc = r.data;
  created.locationId = loc?.id ?? null;
  check('fixture location', r.status === 201, msg(r));

  r = await req('PATCH', '/settings', { token: ADMIN, body: { gamification: { enabled: false } } });
  check('admin turns recognition off', r.status === 200 && r.data?.gamification?.enabled === false, msg(r));
  r = await req('POST', '/analytics/gamification/kudos', { token: AUDITOR, body: { toUserId: owner.id, category: 'TEAMWORK', message: 'ISO-ADM kudos while off' } });
  check('kudos refused while recognition is off -> 403', r.status === 403, msg(r));
  r = await req('POST', '/analytics/gamification/award-trophy', { token: ADMIN, body: { trophyId: 'GOLDEN_BROOM', newLocationId: loc.id, citation: 'ISO-ADM award while off' } });
  check('trophy award refused while recognition is off -> 403', r.status === 403, msg(r));
  r = await req('PATCH', '/settings', { token: ADMIN, body: { gamification: { enabled: true, showIndividualLeaderboard: false } } });
  check('admin turns recognition back on, individual ranking hidden', r.status === 200 && r.data?.gamification?.enabled === true && r.data?.gamification?.showIndividualLeaderboard === false, msg(r));
  r = await req('GET', '/analytics/gamification/leaderboards', { token: COORD });
  check('individual leaderboard hidden', r.status === 200 && r.data?.individualLeaderboardHidden === true && r.data?.individualChampions?.length === 0, msg(r));
  check('area leaderboard still shown', Array.isArray(r.data?.workstationsLeaderboard));
  await req('PATCH', '/settings', { token: ADMIN, body: { gamification: { showIndividualLeaderboard: true } } });
  r = await req('GET', '/analytics/gamification/leaderboards', { token: COORD });
  check('individual leaderboard shown again', r.data?.individualLeaderboardHidden === false, msg(r));

  // ---------- Scheduler fixtures ----------
  r = await req('POST', '/webhooks', { token: ADMIN, body: { url: 'http://127.0.0.1:3998/hook', description: 'ISO-ADM-HOOK', events: ['action.overdue'] } });
  created.webhookId = r.data?.id ?? null;
  check('webhook can subscribe to action.overdue', r.status === 201, msg(r));
  check('action.overdue is in the event catalogue', (await req('GET', '/webhooks/events', { token: ADMIN })).data?.events?.includes('action.overdue'));

  const obs = (await req('POST', '/observations', { token: AUDITOR, body: { locationId: loc.id, title: 'ISO-ADM finding', description: 'x', category: 'S3_SHINE', severity: 'MAJOR' } })).data;
  r = await req('POST', '/corrective-actions', { token: COORD, body: { observationId: obs.id, locationId: loc.id, title: 'ISO-ADM clean spill', description: 'x', assigneeId: owner.id, targetDate: new Date(Date.now() - 3 * DAY).toISOString() } });
  const capa = r.data;
  check('fixture CAPA (3 days overdue)', r.status === 201, msg(r));
  r = await req('POST', '/observations', { token: AUDITOR, body: { locationId: loc.id, title: 'ISO-ADM blocked extinguisher', description: 'x', category: 'S6_SAFETY', severity: 'CRITICAL' } });
  const critical = r.data;
  check('fixture critical observation', r.status === 201, msg(r));

  const tag = await db.redTag.create({
    data: { tenantId, tagNumber: `ISO-RT-${STAMP}`, locationId: loc.id, itemName: 'ISO-ADM pallet', reason: 'x', taggedById: userId('auditor.lead@skilglobal.com'), status: 'IN_HOLDING_AREA', targetDispositionDate: new Date(Date.now() - 2 * DAY) },
  });
  created.redTagId = tag.id;

  const certUserId = userId('owner.asm01@skilglobal.com');
  const certUserToken = await login('owner.asm01@skilglobal.com');
  const laterCert = await db.trainingCertificate.count({ where: { tenantId, userId: certUserId, revokedAt: null, validUntil: { gt: new Date(Date.now() + 30 * DAY) } } });
  const cert = await db.trainingCertificate.create({
    data: { tenantId, certificateCode: `ISO-CERT-${STAMP}`, userId: certUserId, traineeName: 'ISO-ADM trainee', traineeEmail: 'owner.asm01@skilglobal.com', credentialTitle: 'ISO-ADM credential', scorePercent: 90, validUntil: new Date(Date.now() + 10 * DAY) },
  });
  created.certificateId = cert.id;

  const tv = await db.auditTemplateVersion.findFirst({ where: { tenantId, isPublished: true }, select: { id: true } });
  const inst = await db.scheduledAuditInstance.create({
    data: { tenantId, auditCode: `ISO-ADM-${STAMP}`, templateVersionId: tv.id, locationId: loc.id, auditorId: userId('auditor.lead@skilglobal.com'), plannedDate: new Date(Date.now() + DAY), dueDate: new Date(Date.now() + 3 * DAY), status: 'SCHEDULED' },
  });
  created.instanceId = inst.id;

  // ---------- Run reminders now ----------
  check('run reminders: coordinator -> 403', (await req('POST', '/notifications/run-scheduler', { token: COORD })).status === 403);
  check('run reminders: executive -> 403', (await req('POST', '/notifications/run-scheduler', { token: EXEC })).status === 403);
  r = await req('POST', '/notifications/run-scheduler', { token: ADMIN });
  const summary = r.data;
  check('run reminders: admin gets a per-check summary', r.status === 200 && summary.notificationsCreated >= 1 && typeof summary.byCheck === 'object' && typeof summary.escalationTiersUpdated === 'number', msg(r) + ' ' + JSON.stringify(summary));
  check('digest window open at digest hour 0 UTC', summary?.digestWindowOpen === true, JSON.stringify(summary));
  check('the overdue action was flagged in this scan', summary?.actionsBecameOverdue >= 1, JSON.stringify(summary));

  const capaRow = await db.correctiveAction.findUnique({ where: { id: capa.id }, select: { escalationTier: true, isOverdue: true } });
  check('3 days overdue -> escalation tier ESCALATED_L1 (+2 step)', capaRow?.escalationTier === 'ESCALATED_L1', capaRow?.escalationTier);
  check('overdue flag stored on the action', capaRow?.isOverdue === true);
  const ownerInbox = await mine(OWNER);
  check('assignee told the action is overdue', ownerInbox.some((n) => n.type === 'ACTION_OVERDUE' && n.entityId === capa.id));
  check('area owner told about the critical observation', ownerInbox.some((n) => n.type === 'OBSERVATION_CRITICAL' && n.entityId === critical.id && n.link === `/observations?id=${critical.id}`));
  check('reporter not notified of own critical observation', !(await mine(AUDITOR)).some((n) => n.type === 'OBSERVATION_CRITICAL' && n.entityId === critical.id));
  check('area owner told the red tag is past its disposition date', ownerInbox.some((n) => n.type === 'RED_TAG_OVERDUE' && n.entityId === tag.id));
  const auditorInbox = await mine(AUDITOR);
  check('tagger told the red tag is ageing', auditorInbox.some((n) => n.type === 'RED_TAG_OVERDUE' && n.entityId === tag.id));
  check('assigned auditor told the audit is due soon', auditorInbox.some((n) => n.type === 'AUDIT_DUE_SOON' && n.entityId === inst.id));
  const certNotified = (await mine(certUserToken)).some((n) => n.type === 'CERTIFICATE_EXPIRING' && n.entityId === cert.id);
  check(laterCert ? 'holder of a later certificate is not warned' : 'holder warned 30 days before certificate expiry', laterCert ? !certNotified : certNotified);
  const today = new Date().toISOString().slice(0, 10);
  const managerDigest = await db.notification.findFirst({ where: { tenantId, userId: userId('coordinator.5s@skilglobal.com'), type: 'MANAGER_DIGEST', dedupeKey: `manager-digest:${today}` } });
  check('5S coordinator receives the manager digest', !!managerDigest && /Open corrective actions: \d+/.test(managerDigest.body), managerDigest?.body);
  check('area owner does not receive the manager digest', !(await db.notification.findFirst({ where: { tenantId, userId: owner.id, type: 'MANAGER_DIGEST', dedupeKey: `manager-digest:${today}` } })));

  await sleep(3000);
  const overdueEvents = received.filter((x) => x.event === 'action.overdue').map((x) => JSON.parse(x.body));
  check('action.overdue webhook delivered for the action', overdueEvents.some((e) => e.data?.id === capa.id && e.data?.escalationTier === 'ESCALATED_L1'), JSON.stringify(overdueEvents.map((e) => e.data?.actionCode)));

  // ---------- Idempotency ----------
  const entityIds = [capa.id, critical.id, tag.id, inst.id, cert.id];
  const before = await db.notification.count({ where: { tenantId, entityId: { in: entityIds } } });
  const deliveriesBefore = await db.webhookDelivery.count({ where: { endpointId: created.webhookId, event: 'action.overdue' } });
  r = await req('POST', '/notifications/run-scheduler', { token: ADMIN });
  const after = await db.notification.count({ where: { tenantId, entityId: { in: entityIds } } });
  const deliveriesAfter = await db.webhookDelivery.count({ where: { endpointId: created.webhookId, event: 'action.overdue' } });
  check('re-running the scan sends nothing twice', r.status === 200 && before === after, `${before} -> ${after}`);
  check('action.overdue queued once per action', deliveriesBefore >= 1 && deliveriesBefore === deliveriesAfter, `${deliveriesBefore} -> ${deliveriesAfter}`);
  check('manager digest sent once per day', (await db.notification.count({ where: { tenantId, userId: userId('coordinator.5s@skilglobal.com'), dedupeKey: `manager-digest:${today}` } })) === 1);

  // Re-planning the due date resets the tier and the overdue flag
  // Only managers may move the due date (an assignee's PATCH of targetDate is refused)
  await req('POST', `/corrective-actions/${capa.id}/due-date`, { token: ADMIN, body: { targetDate: new Date(Date.now() + DAY).toISOString(), reason: 'ISO re-plan' } });
  await db.correctiveAction.update({ where: { id: capa.id }, data: { targetDate: new Date(Date.now() + DAY) } });
  await req('POST', '/notifications/run-scheduler', { token: ADMIN });
  const replanned = await db.correctiveAction.findUnique({ where: { id: capa.id }, select: { escalationTier: true, isOverdue: true } });
  check('re-planned action: overdue flag cleared, tier back to due soon', replanned?.isOverdue === false && replanned?.escalationTier === 'DUE_SOON', JSON.stringify(replanned));

  // ---------- Tenant scoping of the scan ----------
  const beforeOtherScan = await db.notification.count({ where: { tenantId, entityId: { in: entityIds } } });
  r = await req('POST', '/notifications/run-scheduler', { token: APEX });
  check('another organization runs its own scan', r.status === 200, msg(r));
  check('its scan does not touch this organization', (await db.notification.count({ where: { tenantId, entityId: { in: entityIds } } })) === beforeOtherScan);

  // ---------- Go-live checklist ----------
  r = await req('GET', '/onboarding/checklist', { token: ADMIN });
  const step = (key) => r.data?.steps?.find((s) => s.key === key);
  check('checklist has scoring and escalation steps', r.status === 200 && step('scoring')?.link === '/settings?section=scoring' && step('escalation')?.link === '/settings?section=escalation', msg(r));
  check('saved escalation settings complete the escalation step', step('escalation')?.done === true);
  r = await req('GET', '/onboarding/checklist', { token: COORD });
  check('coordinator sees the settings steps without a link', r.data?.steps?.find((s) => s.key === 'scoring')?.link === null);
  check('checklist closed to executives -> 403', (await req('GET', '/onboarding/checklist', { token: EXEC })).status === 403);

  // ---------- Onboarding starter content ----------
  const slug = `iso-adm-${STAMP}`;
  const onboard = { orgName: 'ISO-ADM Onboarding Org', orgSlug: slug, sites: ['ISO-ADM Plant'], departments: ['ISO-ADM Assembly'], adminName: 'Iso Admin', adminEmail: `iso-adm-${STAMP}@example.com`, starterTemplate: true, starterStandards: true };
  check('onboarding restricted to platform admins -> 403', (await req('POST', '/tenants/onboard', { token: ADMIN, body: onboard })).status === 403);
  check('starter flag must be boolean -> 400', (await req('POST', '/tenants/onboard', { token: SA, body: { ...onboard, starterTemplate: 'yes' } })).status === 400);
  r = await req('POST', '/tenants/onboard', { token: SA, body: onboard });
  created.onboardTenantId = r.data?.tenantId ?? null;
  check('onboarding with starter content', r.status === 201 && r.data?.starterTemplateCreated === true && r.data?.starterStandardsCreated === 3, msg(r) + ' ' + JSON.stringify(r.data));
  if (created.onboardTenantId) {
    const tpl = await db.auditTemplate.findFirst({
      where: { tenantId: created.onboardTenantId, code: 'TPL-6S-STARTER' },
      include: { versions: { include: { sections: { include: { questions: true } } } } },
    });
    const version = tpl?.versions[0];
    const categories = (version?.sections ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.category).join(',');
    check('starter checklist: published, 1S–6S sections', version?.isPublished === true && categories === 'S1_SORT,S2_SET_IN_ORDER,S3_SHINE,S4_STANDARDIZE,S5_SUSTAIN,S6_SAFETY', categories);
    const questions = (version?.sections ?? []).flatMap((s) => s.questions);
    check('starter checklist: real questions incl. a critical safety cap', questions.length === 12 && questions.some((q) => q.isCritical && q.scoreCapOnFail === 70));
    const standards = await db.standard.findMany({ where: { tenantId: created.onboardTenantId }, include: { revisions: true } });
    check('starter standards created as drafts awaiting approval', standards.length === 3 && standards.every((s) => s.status === 'DRAFT' && s.revisions.length === 1 && s.revisions[0].approvedAt === null));
    check('starter content stays in the new organization', (await db.auditTemplate.count({ where: { tenantId, code: 'TPL-6S-STARTER' } })) === 0);
  }
  r = await req('POST', '/tenants/onboard', { token: SA, body: { ...onboard, orgSlug: `${slug}-plain`, adminEmail: `iso-adm-plain-${STAMP}@example.com`, starterTemplate: false, starterStandards: false } });
  const plainId = r.data?.tenantId;
  check('onboarding without starter content creates none', r.status === 201 && r.data?.starterTemplateCreated === false && r.data?.starterStandardsCreated === 0, msg(r));
  if (plainId) await db.tenant.delete({ where: { id: plainId } });
} finally {
  // Fixtures and settings are removed / restored even when a check throws
  await db.tenant.update({ where: { id: tenantId }, data: { settings: rawSettings } });
  if (created.webhookId) await req('DELETE', `/webhooks/${created.webhookId}`, { token: ADMIN });
  if (created.redTagId) await db.redTag.deleteMany({ where: { id: created.redTagId } });
  if (created.certificateId) await db.trainingCertificate.deleteMany({ where: { id: created.certificateId } });
  if (created.instanceId) await db.scheduledAuditInstance.deleteMany({ where: { id: created.instanceId } });
  await db.notification.deleteMany({ where: { tenantId, entityId: { in: [created.redTagId, created.certificateId, created.instanceId].filter(Boolean) } } });
  if (created.locationId) {
    const actions = await db.correctiveAction.findMany({ where: { locationId: created.locationId }, select: { id: true } });
    const actionIds = actions.map((a) => a.id);
    const obsIds = (await db.observation.findMany({ where: { locationId: created.locationId }, select: { id: true } })).map((o) => o.id);
    await db.notification.deleteMany({ where: { tenantId, entityId: { in: [...actionIds, ...obsIds, created.locationId] } } });
    await db.actionHistoryLog.deleteMany({ where: { actionId: { in: actionIds } } });
    await db.correctiveAction.deleteMany({ where: { id: { in: actionIds } } });
    await db.observation.deleteMany({ where: { id: { in: obsIds } } });
    await db.locationAuditLog.deleteMany({ where: { locationId: created.locationId } });
    await db.location.deleteMany({ where: { id: created.locationId } });
  }
  if (created.onboardTenantId) await db.tenant.deleteMany({ where: { id: created.onboardTenantId } });
  server.close();
  await db.$disconnect();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Integrity rules added in the frontend/UX quality pass: template version locking, server-side schedule
// codes and auditor checks, training progress and quiz shuffling, role-scoped search and checklist, the
// enforced-rules access matrix, standards approval, organization logo and status rules, QR payloads,
// red-tag photo/cancel rules and CAPA allowed actions. Run from backend dir.
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data ?? json, json };
};
const msg = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? '')}`;
const login = async (email) => (await req('POST', '/auth/login', { body: { email, password: 'Admin@123456' } })).data.accessToken;
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const ADMIN = await login('admin@skilglobal.com');
const COORD = await login('coordinator.5s@skilglobal.com');
const OWNER = await login('owner.cnc01@skilglobal.com');
const AUDITOR = await login('auditor.lead@skilglobal.com');
const SUPER = await login('superadmin@skilglobal.com');
const users = (await req('GET', '/users', { token: ADMIN })).data;
const owner = users.find((u) => u.email === 'owner.cnc01@skilglobal.com');
const node = (await req('GET', '/organization/nodes', { token: COORD })).data[0];
const loc = (await req('POST', '/locations', { token: COORD, body: { name: 'ISO Quality Cell', areaCode: 'iso-qa-loc', orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId: owner.id } })).data;
const createdScheduleIds = [];
let isoTenantId = null;
const demoTenant = await db.tenant.findFirst({ where: { users: { some: { email: 'admin@skilglobal.com' } } }, select: { id: true, logoUrl: true } });

try {
  // ---------- Template versions ----------
  let r = await req('POST', '/audit-templates', { token: COORD, body: { code: 'ISO-QA-TPL', name: 'ISO quality template', auditType: 'ROUTINE' } });
  const tpl = r.data;
  check('new template starts as a draft', r.status === 201 && tpl.status === 'DRAFT' && tpl.currentVersion?.isPublished === false, msg(r));
  const v1 = tpl.currentVersion.id;
  r = await req('POST', `/audit-templates/${tpl.id}/versions/${v1}/publish`, { token: COORD });
  check('publishing an empty draft -> 400', r.status === 400, msg(r));
  const sec = (await req('POST', `/audit-templates/${tpl.id}/versions/${v1}/sections`, { token: COORD, body: { title: 'ISO section', category: 'S1_SORT' } })).data;
  const q = (await req('POST', `/audit-templates/sections/${sec.id}/questions`, { token: COORD, body: { questionCode: 'ISO-QA-Q1', questionText: 'Aisles clear?', questionType: 'NUMERIC_0_5' } })).data;
  check('draft accepts sections and questions', !!sec?.id && !!q?.id);
  r = await req('POST', '/audit-executions/start', { token: AUDITOR, body: { locationId: loc.id, templateId: tpl.id } });
  check('cannot audit with a template that has no published version -> 400', r.status === 400, msg(r));
  r = await req('POST', `/audit-templates/${tpl.id}/versions/${v1}/publish`, { token: COORD });
  check('draft published; template becomes active', r.status < 300, msg(r));
  check('template now ACTIVE', (await req('GET', `/audit-templates/${tpl.id}`, { token: COORD })).data?.status === 'ACTIVE');
  r = await req('PATCH', `/audit-templates/questions/${q.id}`, { token: COORD, body: { questionText: 'Changed after publishing' } });
  check('editing a published version -> 409', r.status === 409, msg(r));
  r = await req('POST', `/audit-templates/sections/${sec.id}/questions`, { token: COORD, body: { questionCode: 'ISO-QA-Q2', questionText: 'x', questionType: 'YES_NO' } });
  check('adding to a published version -> 409', r.status === 409, msg(r));
  r = await req('POST', `/audit-templates/${tpl.id}/versions`, { token: COORD });
  const v2 = r.data?.latestVersion;
  check('new draft version copies the published one', r.status < 300 && v2 && !v2.isPublished && v2.id !== v1 && v2.sections?.[0]?.questions?.length === 1, msg(r));
  check('a second draft is refused while one exists -> 409', (await req('POST', `/audit-templates/${tpl.id}/versions`, { token: COORD })).status === 409);
  r = await req('POST', '/audit-executions/start', { token: AUDITOR, body: { locationId: loc.id, templateId: tpl.id, templateVersionId: v2?.id } });
  check('starting on an explicit draft version -> 400', r.status === 400, msg(r));
  check('auditor cannot create versions -> 403', (await req('POST', `/audit-templates/${tpl.id}/versions`, { token: AUDITOR })).status === 403);

  // ---------- Schedules ----------
  r = await req('POST', '/audit-schedules', { token: COORD, body: { title: 'ISO quality schedule', templateId: tpl.id, targetType: 'SPECIFIC_LOCATIONS', targetLocationIds: [loc.id], recurrence: 'WEEKLY' } });
  if (r.data?.id) createdScheduleIds.push(r.data.id);
  check('schedule code generated by the server', r.status === 201 && /^SCHED-\d{4}-\d{4,}$/.test(r.data?.scheduleCode ?? ''), r.data?.scheduleCode ?? msg(r));
  r = await req('POST', '/audit-schedules', { token: COORD, body: { scheduleCode: 'ISO-QA-SCH2', title: 'x', templateId: tpl.id, targetType: 'SPECIFIC_LOCATIONS', targetLocationIds: [loc.id], recurrence: 'WEEKLY', rotationRule: 'ASSIGNED_AUDITOR' } });
  check('fixed-auditor rule without an auditor -> 400', r.status === 400, msg(r));
  r = await req('POST', '/audit-schedules', { token: COORD, body: { scheduleCode: 'ISO-QA-SCH3', title: 'x', templateId: tpl.id, targetType: 'SPECIFIC_LOCATIONS', targetLocationIds: [loc.id], recurrence: 'WEEKLY', rotationRule: 'ASSIGNED_AUDITOR', preferredAuditorId: owner.id } });
  check('fixed auditor must be able to conduct audits -> 400', r.status === 400, msg(r));
  r = await req('POST', '/audit-schedules', { token: COORD, body: { scheduleCode: 'ISO-QA-SCH4', title: 'x', templateId: tpl.id, targetType: 'DEPARTMENT', recurrence: 'WEEKLY' } });
  check('department target needs an org unit -> 400', r.status === 400, msg(r));
  const anyInstance = (await req('GET', '/audit-schedules/instances', { token: COORD })).data?.[0];
  if (anyInstance) {
    r = await req('GET', `/audit-schedules/instances/${anyInstance.id}`, { token: AUDITOR });
    check('one scheduled audit by id', r.status === 200 && r.data?.id === anyInstance.id && !!r.data?.location, msg(r));
  }
  check('unknown scheduled audit -> 404', (await req('GET', '/audit-schedules/instances/00000000-0000-4000-8000-000000000000', { token: AUDITOR })).status === 404);

  // ---------- Training ----------
  r = await req('GET', '/training/progress', { token: OWNER });
  check('training progress per course', r.status === 200 && Array.isArray(r.data) && r.data.length > 0 && r.data.every((c) => typeof c.percent === 'number'), msg(r));
  const course = (await req('GET', '/training/courses', { token: OWNER })).data?.[0];
  const lesson = course?.lessons?.[0];
  r = await req('POST', '/training/progress', { token: OWNER, body: { courseId: course?.id, lessonId: lesson?.id, completed: true } });
  check('lesson marked done is saved', r.status < 300 && r.data?.completedLessonIds?.includes(lesson?.id), msg(r));
  check('unknown lesson -> 400', (await req('POST', '/training/progress', { token: OWNER, body: { courseId: course?.id, lessonId: 'iso-nope', completed: true } })).status === 400);
  await req('POST', '/training/progress', { token: OWNER, body: { courseId: course?.id, lessonId: lesson?.id, completed: false } });
  check('no course plays a sample film', ((await req('GET', '/training/courses', { token: OWNER })).data ?? []).every((c) => !c.videoUrl || !/gtv-videos-bucket|BigBuckBunny|ElephantsDream/i.test(c.videoUrl)));
  const orders = [];
  for (let i = 0; i < 4; i++) orders.push(((await req('GET', '/training/quiz', { token: OWNER })).data ?? []).map((x) => x.options.join('|')).join('#'));
  check('quiz options are shuffled between attempts', new Set(orders).size > 1);
  const quiz = (await req('GET', '/training/quiz', { token: OWNER })).data ?? [];
  r = await req('POST', '/training/quiz/submit', { token: OWNER, body: { answers: Object.fromEntries(quiz.map((x) => [x.id, x.options[1]])) } });
  check('always picking option B no longer passes', r.status < 300 && r.data?.passed === false, `${r.data?.percentage}%`);
  check('results show the chosen and the correct answer', r.data?.results?.every((x) => typeof x.correctAnswer === 'string' && 'selectedAnswer' in x));

  // ---------- Search, checklist, access matrix ----------
  r = await req('GET', '/search?q=skilglobal', { token: OWNER });
  check('area owner search has no people, org units or templates', r.status === 200 && !r.data.results.some((h) => ['users', 'orgUnits', 'templates'].includes(h.type)), JSON.stringify([...new Set(r.data?.results?.map((h) => h.type))]));
  r = await req('GET', '/search?q=skilglobal', { token: ADMIN });
  check('admin search can find people', r.status === 200 && r.data.results.some((h) => h.type === 'users'));
  r = await req('GET', '/onboarding/checklist', { token: COORD });
  const team = r.data?.steps?.find((s) => s.key === 'team');
  check('admin-only checklist steps are marked for coordinators', !!team && team.adminOnly === true && team.link === null, JSON.stringify(team ?? {}));
  r = await req('GET', '/users/roles/access-matrix', { token: COORD });
  check('access matrix lists the enforced rules', r.status === 200 && r.data.rules.length > 10 && r.data.rules.every((x) => Array.isArray(x.roles)), msg(r));
  check('area owner cannot read the access matrix -> 403', (await req('GET', '/users/roles/access-matrix', { token: OWNER })).status === 403);
  check('editable permissions endpoint is gone', [404, 405].includes((await req('PATCH', `/users/roles/${users[0]?.id}/permissions`, { token: ADMIN, body: [] })).status));
  const me = users.find((u) => u.email === 'admin@skilglobal.com');
  const myAdmin = (await req('GET', `/users/${me.id}`, { token: ADMIN })).data?.roleAssignments?.find((a) => a.role?.code === 'ORG_ADMIN');
  if (myAdmin) check('cannot remove your own admin role -> 400', (await req('DELETE', `/users/${me.id}/roles/${myAdmin.id}`, { token: ADMIN })).status === 400);

  // ---------- Standards approval ----------
  r = await req('POST', '/standards', { token: COORD, body: { code: 'iso-qa-std', title: 'ISO standard', category: 'S2_SET_IN_ORDER', description: 'ISO description', rules: ['Tools on the board'] } });
  const std = r.data;
  check('new standard is a draft', r.status === 201 && std.status === 'DRAFT', msg(r));
  const rev = (await req('GET', `/standards/${std.id}`, { token: COORD })).data?.revisions?.[0];
  r = await req('POST', `/standards/${std.id}/revisions/${rev?.id}/approve`, { token: COORD, body: {} });
  check('approving the first revision publishes it', r.status < 300 && (await req('GET', `/standards/${std.id}`, { token: COORD })).data?.status === 'PUBLISHED', msg(r));
  check('approving twice -> 409', (await req('POST', `/standards/${std.id}/revisions/${rev?.id}/approve`, { token: COORD, body: {} })).status === 409);

  // ---------- QR payloads ----------
  r = await req('GET', '/locations/qr-batch', { token: COORD });
  check('every printable QR holds a scannable 5s:// payload', r.status === 200 && r.data.length > 0 && r.data.every((x) => x.error || (x.qrPayload?.startsWith('5s://') && /\/locations\//.test(x.qrPayload))), msg(r));

  // ---------- Red tags ----------
  r = await req('POST', '/red-tags', { token: OWNER, body: { locationId: loc.id, itemName: 'ISO QA spare', itemDescription: 'x', category: 'OTHER', reason: 'unused', quantity: 1 } });
  const tag = r.data;
  const detail = (await req('GET', `/red-tags/${tag.id}`, { token: OWNER })).data;
  check('red-tag QR opens the tag in the app', typeof detail?.qrCodeData === 'string' ? /\/red-tags\?id=/.test(detail.qrCodeData) || !!detail.qrCodeDataUrl : true, String(detail?.qrCodeData).slice(0, 80));
  r = await req('PATCH', `/red-tags/${tag.id}`, { token: COORD, body: { status: 'CANCELLED' } });
  check('reviewer can cancel a tag', r.status < 300 && r.data?.status === 'CANCELLED', msg(r));

  // ---------- CAPA allowed actions ----------
  r = await req('GET', '/corrective-actions?assigneeId=me', { token: OWNER });
  check('"assigned to me" filter', r.status === 200 && r.data.every((a) => a.assigneeId === owner.id), r.data?.length);
  const withActions = r.data.find((a) => Array.isArray(a.allowedActions));
  check('actions carry the steps the user may take', !withActions || !withActions.allowedActions.includes('VERIFY'), JSON.stringify(withActions?.allowedActions));

  // ---------- Observations ----------
  r = await req('GET', '/observations/summary', { token: OWNER });
  check('observation summary counts', r.status === 200 && ['total', 'critical', 'open', 'kaizen'].every((k) => typeof r.data?.[k] === 'number'), msg(r));
  r = await req('GET', '/observations?limit=2&offset=0', { token: OWNER });
  check('observations can be paged', r.status === 200 && r.data.length <= 2, r.data?.length);

  // ---------- Organization logo ----------
  r = await req('PUT', '/settings/logo', { token: ADMIN, body: { logo: TINY_PNG } });
  check('org admin uploads a logo (stored as a file)', r.status < 300 && /\/api\/v1\/files\/[0-9a-f-]{36}/.test(r.data?.logoUrl ?? ''), msg(r));
  check('tenant row holds a file reference, not base64', /^\/api\/v1\/files\//.test((await db.tenant.findUnique({ where: { id: demoTenant.id }, select: { logoUrl: true } })).logoUrl ?? ''));
  check('non-image logo -> 400', (await req('PUT', '/settings/logo', { token: ADMIN, body: { logo: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%%EOF').toString('base64') } })).status === 400);
  check('coordinator cannot change the logo -> 403', (await req('PUT', '/settings/logo', { token: COORD, body: { logo: null } })).status === 403);

  // ---------- Organization status rules (platform) ----------
  r = await req('POST', '/tenants', { token: SUPER, body: { name: 'ISO Quality Org', slug: 'iso-qa-org' } });
  isoTenantId = r.data?.id ?? null;
  check('super admin creates an organization', r.status < 300 && !!isoTenantId, msg(r));
  if (isoTenantId) {
    const startStatus = (await db.tenant.findUnique({ where: { id: isoTenantId }, select: { status: true } })).status;
    r = await req('PATCH', `/tenants/${isoTenantId}/status`, { token: SUPER, body: { status: 'SUSPENDED' } });
    check('organization suspended', r.status < 300, msg(r));
    r = await req('PATCH', `/tenants/${isoTenantId}/status`, { token: SUPER, body: { status: 'ACTIVE' } });
    const after = (await db.tenant.findUnique({ where: { id: isoTenantId }, select: { status: true } })).status;
    check('reactivation restores the previous status (a trial stays a trial)', r.status < 300 && after === startStatus, `${startStatus} -> ${after}`);
    r = await req('PATCH', `/tenants/${isoTenantId}`, { token: SUPER, body: { industry: 'ISO Testing' } });
    check('industry is saved', r.status < 300 && (await db.tenant.findUnique({ where: { id: isoTenantId }, select: { industry: true } })).industry === 'ISO Testing', msg(r));
  }
  r = await req('POST', '/tenants/onboard', { token: SUPER, body: { orgName: 'Dup', orgSlug: 'iso-qa-org', adminName: 'ISO Admin', adminEmail: 'iso-qa@example.com', sites: ['ISO site'], departments: [] } });
  check('onboarding refuses an organization code already in use -> 409', r.status === 409, msg(r));

  // ---------- Analytics & activity ----------
  r = await req('GET', '/analytics/leaderboard', { token: ADMIN });
  const champions = r.data?.champions ?? r.data?.plantChampions ?? [];
  check('top areas all reach the pass score', r.status === 200 && champions.every((c) => (c.score ?? c.overallScore ?? 0) >= (r.data?.passScore ?? 0)), JSON.stringify(champions.map((c) => c.score ?? c.overallScore)));
  const lastLog = await db.activityLog.findFirst({ where: { tenantId: demoTenant.id, action: { not: { startsWith: 'LOGIN' } } }, orderBy: { createdAt: 'desc' } });
  check('activity summaries read as sentences, not request lines', !!lastLog && !/^(POST|PATCH|PUT|DELETE) \//.test(lastLog.summary), lastLog?.summary);
} finally {
  await db.tenant.update({ where: { id: demoTenant.id }, data: { logoUrl: demoTenant.logoUrl } });
  if (createdScheduleIds.length) {
    await db.scheduledAuditInstance.deleteMany({ where: { scheduleId: { in: createdScheduleIds } } });
    await db.auditSchedule.deleteMany({ where: { id: { in: createdScheduleIds } } });
  }
  if (isoTenantId) await db.tenant.delete({ where: { id: isoTenantId } }).catch(() => undefined);
  await db.trainingProgress.deleteMany({ where: { userId: owner.id } });
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

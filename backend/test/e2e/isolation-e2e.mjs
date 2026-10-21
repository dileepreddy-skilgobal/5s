const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body, tenant } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(tenant ? { 'x-tenant-id': tenant } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data, json };
};
const login = async (email) => (await req('POST', '/auth/login', { body: { email, password: 'Admin@123456' } })).data.accessToken;

const A = await login('admin@skilglobal.com');
const SA = await login('superadmin@skilglobal.com');
const apex = (method, path, body) => req(method, path, { token: SA, body, tenant: 'apex-aero' });
const cleanup = [];

// ---- Remove leftovers from an interrupted earlier run ----
for (const [scope, list] of [[(m, p) => apex(m, p), 'apex'], [(m, p) => req(m, p, { token: A }), 'own']]) {
  const tpls = (await scope('GET', '/audit-templates')).data || [];
  for (const t of tpls.filter((t) => t.code?.startsWith('ISO-'))) await scope('DELETE', `/audit-templates/${t.id}`);
  const locs = (await scope('GET', '/locations')).data || [];
  for (const l of locs.filter((l) => l.areaCode?.startsWith('ISO-'))) await scope('DELETE', `/locations/${l.id}`);
}

// ---- Arrange: records in tenant apex-aero (via super admin) ----
let apexNode = (await apex('GET', '/organization/nodes')).data?.[0];
if (!apexNode) apexNode = (await apex('POST', '/organization/nodes', { name: 'Apex Root', code: 'APEX-ISO-ROOT', nodeType: 'ENTERPRISE' })).data;
const apexUser = (await apex('GET', '/users')).data[0];
const apexRoles = (await apex('GET', '/users/roles/all')).data;
const apexLocRes = await apex('POST', '/locations', { name: 'ISO Test Apex Cell', areaCode: 'ISO-APEX-LOC', orgNodeId: apexNode.id, locationType: 'PRODUCTION_LINE' });
const apexLoc = apexLocRes.data;
cleanup.push(() => apex('DELETE', `/locations/${apexLoc.id}`));
const apexTimeline = apexLoc?.timelines?.[0];
const apexTpl = (await apex('POST', '/audit-templates', { code: 'ISO-APEX-TPL', name: 'Iso Apex', auditType: 'ROUTINE' })).data;
cleanup.push(() => apex('DELETE', `/audit-templates/${apexTpl.id}`));
const apexVersionId = apexTpl.currentVersion.id;
const apexSection = (await apex('POST', `/audit-templates/${apexTpl.id}/versions/${apexVersionId}/sections`, { title: 'Sort', category: 'S1_SORT' })).data;
const apexQRes = await apex('POST', `/audit-templates/sections/${apexSection.id}/questions`, { questionCode: 'ISO-Q1', questionText: 'Is it sorted?', questionType: 'NUMERIC_0_5' });
const apexQuestion = apexQRes.data;
check('arrange: apex records created', !!(apexLoc?.id && apexTimeline?.id && apexSection?.id && apexQuestion?.id && apexRoles?.length),
  JSON.stringify({ loc: apexLocRes.status, q: apexQRes.status, qmsg: apexQRes.json?.message }));

// ---- Arrange: own records in skilglobal ----
const ownNodes = (await req('GET', '/organization/nodes', { token: A })).data;
const ownTpl = (await req('POST', '/audit-templates', { token: A, body: { code: 'ISO-OWN-TPL', name: 'Iso Own', auditType: 'ROUTINE' } })).data;
cleanup.push(() => req('DELETE', `/audit-templates/${ownTpl.id}`, { token: A }));
const ownLoc = (await req('GET', '/locations', { token: A })).data[0];
const ownUsers = (await req('GET', '/users', { token: A })).data;
const superAdminUser = ownUsers.find((u) => u.isSuperAdmin);
const plainUser = ownUsers.find((u) => !u.isSuperAdmin && u.email !== 'admin@skilglobal.com');

// ---- Attacks by skilglobal ORG_ADMIN against apex-aero ids ----
let r;
r = await req('POST', '/locations', { token: A, body: { name: 'X', areaCode: 'ISO-X1', orgNodeId: apexNode.id, locationType: 'PRODUCTION_LINE' } });
check('create location under other tenant org node -> 404', r.status === 404, r.status);
r = await req('POST', '/locations', { token: A, body: { name: 'X', areaCode: 'ISO-X2', orgNodeId: ownNodes[0].id, locationType: 'PRODUCTION_LINE', ownerId: apexUser.id } });
check('create location with other tenant owner -> 404', r.status === 404, r.status);
r = await req('PATCH', `/locations/${ownLoc.id}/timelines/${apexTimeline.id}`, { token: A, body: { progressPercent: 99 } });
check('update other tenant timeline via own location -> 404', r.status === 404, r.status);
r = await req('DELETE', `/locations/${ownLoc.id}/timelines/${apexTimeline.id}`, { token: A });
check('delete other tenant timeline via own location -> 404', r.status === 404, r.status);
r = await req('POST', `/audit-templates/${ownTpl.id}/versions/${apexVersionId}/sections`, { token: A, body: { title: 'Hijack', category: 'S1_SORT' } });
check('add section to other tenant version -> 404', r.status === 404, r.status);
r = await req('POST', `/audit-templates/sections/${apexSection.id}/questions`, { token: A, body: { questionCode: 'HJ', questionText: 'x', questionType: 'NUMERIC_0_5' } });
check('add question to other tenant section -> 404', r.status === 404, r.status);
r = await req('PATCH', `/audit-templates/sections/${apexSection.id}`, { token: A, body: { title: 'pwned' } });
check('update other tenant section -> 404', r.status === 404, r.status);
r = await req('PATCH', `/audit-templates/questions/${apexQuestion.id}`, { token: A, body: { questionText: 'pwned' } });
check('update other tenant question -> 404', r.status === 404, r.status);
r = await req('DELETE', `/audit-templates/questions/${apexQuestion.id}`, { token: A });
check('delete other tenant question -> 404', r.status === 404, r.status);
r = await req('POST', `/audit-templates/${ownTpl.id}/versions/${apexVersionId}/publish`, { token: A, body: {} });
check('publish other tenant version via own template -> 404', r.status === 404, r.status);
r = await req('POST', `/users/${plainUser.id}/roles`, { token: A, body: { roleId: apexRoles[0].id } });
check('assign other tenant role -> 404', r.status === 404, r.status);
r = await req('POST', '/audit-schedules', { token: A, body: { scheduleCode: 'ISO-SCH', title: 'x', templateId: apexTpl.id, templateVersionId: apexVersionId, targetType: 'ALL_AREAS', recurrence: 'WEEKLY' } });
check('schedule with other tenant template -> 404', r.status === 404, r.status);
r = await req('POST', '/red-tags', { token: A, body: { locationId: ownLoc.id, itemName: 'x', itemDescription: 'x', category: 'UNNEEDED_TOOL', reason: 'x', quantity: 1, targetHoldingAreaId: apexLoc.id } });
check('red tag with other tenant holding area -> 404', r.status === 404, r.status + ' ' + JSON.stringify(r.json?.message));
r = await req('POST', '/analytics/gamification/award-trophy', { token: A, body: { trophyId: 'GOLDEN_BROOM', newLocationId: apexLoc.id, citation: 'ISO-x' } });
check('award trophy to other tenant location -> 404', r.status === 404, r.status);

// ---- Super admin account protection ----
r = await req('PATCH', `/users/${superAdminUser.id}`, { token: A, body: { password: 'Hijack@12345' } });
check('org admin cannot reset super admin password -> 403', r.status === 403, r.status);
r = await req('DELETE', `/users/${superAdminUser.id}`, { token: A });
check('org admin cannot delete super admin -> 403', r.status === 403, r.status);
const superRole = (await req('GET', '/users/roles/all', { token: A })).data.find((x) => x.code === 'SUPER_ADMIN');
r = await req('POST', `/users/${plainUser.id}/roles`, { token: A, body: { roleId: superRole.id } });
check('cannot assign SUPER_ADMIN role -> 403', r.status === 403, r.status);

// ---- Gamification isolation ----
r = await req('POST', '/analytics/gamification/award-trophy', { token: A, body: { trophyId: 'GOLDEN_BROOM', newLocationId: ownLoc.id, citation: 'ISO-iso test' } });
check('award trophy to own location -> 2xx', r.status < 300, r.status);
const apexBroom = (await apex('GET', '/analytics/gamification/trophies')).data.floatingTrophies.find((t) => t.id === 'GOLDEN_BROOM');
check('other tenant trophy unaffected', apexBroom.currentHolder?.locationId !== ownLoc.id, apexBroom.currentHolder?.locationName ?? 'no holder');

// ---- Positive regression: legit own-tenant writes still work ----
r = await req('POST', `/audit-templates/${ownTpl.id}/versions/${ownTpl.currentVersion.id}/sections`, { token: A, body: { title: 'Own section', category: 'S1_SORT' } });
check('add section to own template version -> 2xx', r.status < 300, r.status);
r = await req('POST', `/audit-templates/sections/${r.data.id}/questions`, { token: A, body: { questionCode: 'OWN-Q1', questionText: 'Own?', questionType: 'NUMERIC_0_5' } });
check('add question to own section -> 2xx', r.status < 300, r.status + ' ' + JSON.stringify(r.json?.message));
r = await req('POST', '/locations', { token: A, body: { name: 'ISO Own Cell', areaCode: 'ISO-OWN-LOC', orgNodeId: ownNodes[0].id, locationType: 'PRODUCTION_LINE', ownerId: plainUser.id } });
check('create location with own org node + owner -> 2xx', r.status < 300, r.status);
const ownNewLoc = r.data;
cleanup.push(() => req('DELETE', `/locations/${ownNewLoc.id}`, { token: A }));
const ownTimeline = ownNewLoc.timelines[0];
r = await req('PATCH', `/locations/${ownNewLoc.id}/timelines/${ownTimeline.id}`, { token: A, body: { progressPercent: 10 } });
check('update own timeline -> 2xx', r.status < 300, r.status);

for (const c of cleanup.reverse()) await c();
process.on('exit', () => {});
console.log(`\n${pass} passed, ${fail} failed`);

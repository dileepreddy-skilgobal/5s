const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data, json };
};
const login = async (email) => (await req('POST', '/auth/login', { body: { email, password: 'Admin@123456' } })).data.accessToken;

const T = {
  ORG_ADMIN: await login('admin@skilglobal.com'),
  COORD: await login('coordinator.5s@skilglobal.com'),
  PLANT: await login('planthead.blr@skilglobal.com'),
  DEPT: await login('depthead.machining@skilglobal.com'),
  OWNER: await login('owner.cnc01@skilglobal.com'),
  AUDITOR: await login('auditor.lead@skilglobal.com'),
};
const is403 = (r) => r.status === 403;
const ok = (r) => r.status < 300;

// Test fixtures created by the coordinator, removed at the end
const node = (await req('GET', '/organization/nodes', { token: T.COORD })).data[0];
for (const l of ((await req('GET', '/locations', { token: T.COORD })).data || []).filter((l) => l.areaCode?.startsWith('ISO-'))) await req('DELETE', `/locations/${l.id}`, { token: T.COORD });
const loc = (await req('POST', '/locations', { token: T.COORD, body: { name: 'ISO Roles Cell', areaCode: 'ISO-ROLE-LOC', orgNodeId: node.id, locationType: 'PRODUCTION_LINE' } })).data;
check('coordinator creates location', !!loc?.id);
const tpl = (await req('GET', '/audit-templates', { token: T.COORD })).data.find((t) => t.status === 'ACTIVE');

// ---- Reads open to every tenant member ----
for (const [role, tok] of Object.entries(T)) {
  const r1 = await req('GET', '/locations', { token: tok });
  const r2 = await req('GET', '/users', { token: tok });
  check(`${role} can read locations + user directory`, ok(r1) && ok(r2), `${r1.status}/${r2.status}`);
}

// ---- Area owner ----
check('AREA_OWNER cannot create org node', is403(await req('POST', '/organization/nodes', { token: T.OWNER, body: { name: 'x', nodeType: 'PLANT' } })));
check('AREA_OWNER cannot create location', is403(await req('POST', '/locations', { token: T.OWNER, body: { name: 'x', areaCode: 'ISO-NO', orgNodeId: node.id, locationType: 'PRODUCTION_LINE' } })));
check('AREA_OWNER cannot author standard', is403(await req('POST', '/standards', { token: T.OWNER, body: { code: 'ISO-STD', title: 'x', category: 'S1_SORT' } })));
check('AREA_OWNER cannot start audit', is403(await req('POST', '/audit-executions/start', { token: T.OWNER, body: { locationId: loc.id, templateId: tpl.id } })));
check('AREA_OWNER cannot view maturity analytics', is403(await req('GET', '/analytics/maturity', { token: T.OWNER })));
check('AREA_OWNER cannot list role definitions', is403(await req('GET', '/users/roles/all', { token: T.OWNER })));
let r = await req('POST', `/locations/${loc.id}/timelines`, { token: T.OWNER, body: { milestoneName: 'ISO milestone', plannedStartDate: new Date().toISOString(), plannedEndDate: new Date(Date.now() + 86400000).toISOString() } });
check('AREA_OWNER can add timeline milestone', ok(r), r.status);
r = await req('POST', '/observations', { token: T.OWNER, body: { locationId: loc.id, title: 'ISO obs', description: 'x', category: 'S1_SORT', severity: 'MINOR' } });
check('AREA_OWNER can log observation', ok(r), r.status + ' ' + JSON.stringify(r.json?.message));
const obs = r.data;
if (obs?.id) {
  check('AREA_OWNER cannot delete observation', is403(await req('DELETE', `/observations/${obs.id}`, { token: T.OWNER })));
  check('COORDINATOR can delete observation', ok(await req('DELETE', `/observations/${obs.id}`, { token: T.COORD })));
}

// ---- Auditor ----
r = await req('POST', '/audit-executions/start', { token: T.AUDITOR, body: { locationId: loc.id, templateId: tpl.id, auditorName: 'ISO' } });
check('AUDITOR can start audit', ok(r), r.status + ' ' + JSON.stringify(r.json?.message));
const exec = r.data;
check('AUDITOR cannot acknowledge audit', is403(await req('POST', `/audit-executions/${exec.id}/acknowledge`, { token: T.AUDITOR, body: { acknowledgedBy: 'x' } })));
check('AUDITOR cannot delete audit', is403(await req('DELETE', `/audit-executions/${exec.id}`, { token: T.AUDITOR })));
check('AUDITOR cannot award trophy', is403(await req('POST', '/analytics/gamification/award-trophy', { token: T.AUDITOR, body: { trophyId: 'trophy-golden-broom', newLocationId: loc.id, citation: 'x' } })));
check('AUDITOR cannot create schedule', is403(await req('POST', '/audit-schedules', { token: T.AUDITOR, body: { scheduleCode: 'ISO-S', title: 'x', templateId: tpl.id, templateVersionId: 'x', targetType: 'ALL_AREAS', recurrence: 'WEEKLY' } })));
check('COORDINATOR can delete audit', ok(await req('DELETE', `/audit-executions/${exec.id}`, { token: T.COORD })));

// ---- Dept head / plant head ----
check('DEPT_HEAD can view maturity analytics', ok(await req('GET', '/analytics/maturity', { token: T.DEPT })));
r = await req('PATCH', `/locations/${loc.id}`, { token: T.DEPT, body: { description: 'ISO edit' } });
check('DEPT_HEAD can edit location', ok(r), r.status);
check('DEPT_HEAD cannot delete location', is403(await req('DELETE', `/locations/${loc.id}`, { token: T.DEPT })));
check('PLANT_HEAD cannot create users', is403(await req('POST', '/users', { token: T.PLANT, body: { email: 'iso@x.com', firstName: 'a', lastName: 'b' } })));
check('PLANT_HEAD cannot onboard tenants', is403(await req('POST', '/tenants/onboard', { token: T.PLANT, body: { orgName: 'x', orgSlug: 'iso-x' } })));

// ---- Org admin ----
check('ORG_ADMIN cannot list tenants', is403(await req('GET', '/tenants', { token: T.ORG_ADMIN })));
check('COORDINATOR can delete location', ok(await req('DELETE', `/locations/${loc.id}`, { token: T.COORD })));

console.log(`\n${pass} passed, ${fail} failed`);

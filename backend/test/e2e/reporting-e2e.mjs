// W4: management registers, report filters, analytics executive summary / area maturity / custom periods and the
// plant / department data scope of analytics and reports. Run from backend dir.
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const XLSX = require('xlsx');
const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data ?? json, json };
};
const raw = async (path, token) => {
  const r = await fetch(B + path, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, type: r.headers.get('content-type'), buf: Buffer.from(await r.arrayBuffer()) };
};
const msg = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? '')}`;
const PASSWORD = 'Admin@123456';
const login = async (email) => (await req('POST', '/auth/login', { body: { email, password: PASSWORD } })).data?.accessToken;
const isNumOrNull = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));

const ADMIN = await login('admin@skilglobal.com');
const COORD = await login('coordinator.5s@skilglobal.com');
const EXEC = await login('executive@skilglobal.com');
const OWNER = await login('owner.cnc01@skilglobal.com');
const AUDITOR = await login('auditor.lead@skilglobal.com');
const APEX = await login('admin@apex-aero.com');

const NEW_REGISTERS = ['area-ranking', 'department-ranking', 'maturity', 'certification', 'audit-trend', 'auditor-performance', 'action-ageing'];

let loc = null;
let scopedUser = null;
try {
  // ---------- Fixtures ----------
  const nodes = (await req('GET', '/organization/nodes', { token: ADMIN })).data;
  const byCode = (c) => nodes.find((n) => n.code === c);
  const plant = byCode('BLR-PLANT-01');
  const mach = byCode('BLR-DEPT-MACH');
  const asm = byCode('BLR-DEPT-ASM');
  check('seed org nodes present', !!plant && !!mach && !!asm);
  const users = (await req('GET', '/users', { token: ADMIN })).data;
  const owner = users.find((u) => u.email === 'owner.cnc01@skilglobal.com');
  const auditorUser = users.find((u) => u.email === 'auditor.lead@skilglobal.com');
  let r = await req('POST', '/locations', { token: COORD, body: { name: 'ISO Reporting Cell', areaCode: 'iso-rep-loc', orgNodeId: mach.id, locationType: 'PRODUCTION_LINE', ownerId: owner.id } });
  loc = r.data;
  check('fixture location created', r.status < 300 && !!loc?.id, msg(r));

  // ---------- Report catalogue & access ----------
  r = await req('GET', '/reports', { token: COORD });
  const keys = (r.data ?? []).map((x) => x.key);
  check('catalogue lists the management registers', r.status === 200 && NEW_REGISTERS.every((k) => keys.includes(k)), keys.join(','));
  check('executive can open reports', (await req('GET', '/reports/area-ranking', { token: EXEC })).status === 200);
  check('area owner blocked from management registers -> 403', (await req('GET', '/reports/area-ranking', { token: OWNER })).status === 403);
  check('unauthenticated -> 401', (await req('GET', '/reports/maturity')).status === 401);

  // ---------- New registers: previews ----------
  const previews = {};
  for (const key of NEW_REGISTERS) {
    const reg = r.data.find((x) => x.key === key);
    const p = await req('GET', `/reports/${key}`, { token: COORD });
    previews[key] = p.data;
    const cols = reg.columns.map((c) => c.key);
    check(`${key}: preview rows have every column`, p.status === 200 && p.data.rows.every((row) => cols.every((c) => c in row)), `${p.status} total=${p.data?.total}`);
  }

  const ranking = previews['area-ranking'].rows;
  const ranked = ranking.filter((x) => x.rank !== null);
  check('area ranking: ranks are 1..n in score order', ranked.every((x, i) => x.rank === i + 1 && (i === 0 || ranked[i - 1].score >= x.score)));
  check('area ranking: unscored areas have no rank', ranking.filter((x) => x.rank === null).every((x) => x.score === null));
  check('area ranking: new unaudited ISO area listed without a rank', ranking.some((x) => x.areaCode === 'ISO-REP-LOC' && x.rank === null && x.audits === 0));

  const depts = previews['department-ranking'].rows;
  check('department ranking: scores numeric or null and sorted', depts.every((d, i) => isNumOrNull(d.score) && (i === 0 || d.score === null || (depts[i - 1].score ?? -1) >= d.score)));

  const maturity = previews.maturity;
  const levelSum = (maturity.summary ?? []).reduce((s, x) => s + x.value, 0);
  check('maturity: summary counts add up to the areas', levelSum === maturity.total, `${levelSum} vs ${maturity.total}`);
  check('maturity: a level only with an average score', maturity.rows.every((x) => (x.level === null) === (x.averageScore === null)));

  const cert = previews.certification;
  check('certification: summary per level', Array.isArray(cert.summary) && cert.summary.some((x) => x.key === 'NONE'));
  r = await req('GET', '/reports/certification?status=NONE', { token: COORD });
  check('certification: level filter', r.status === 200 && r.data.rows.every((x) => x.certification === 'Not certified'), r.data?.total);

  check('audit trend: 12 monthly rows by default', previews['audit-trend'].rows.length === 12, previews['audit-trend'].rows.length);
  r = await req('GET', '/reports/audit-trend?from=2026-01-15&to=2026-03-15', { token: COORD });
  check('audit trend: custom range gives its months', r.status === 200 && r.data.rows.length === 3, r.data?.rows?.length);

  r = await req('GET', `/reports/auditor-performance?auditorId=${auditorUser.id}`, { token: COORD });
  check('auditor performance: auditor filter', r.status === 200 && r.data.rows.length <= 1, r.data?.rows?.length);
  check('auditor performance: on-time % consistent', previews['auditor-performance'].rows.every((x) => x.completedOnTime <= x.assignedDue && (x.assignedDue === 0) === (x.onTimePercent === null)));

  const ageing = previews['action-ageing'];
  const bucketSum = (ageing.summary ?? []).reduce((s, x) => s + x.value, 0);
  check('action ageing: four buckets', ageing.summary?.length === 4 && ageing.summary.map((x) => x.label).join('|') === '0–7 days|8–15 days|16–30 days|Over 30 days', JSON.stringify(ageing.summary));
  check('action ageing: buckets add up to the open actions', bucketSum === ageing.total, `${bucketSum} vs ${ageing.total}`);
  const band = (d) => (d <= 7 ? '0–7 days' : d <= 15 ? '8–15 days' : d <= 30 ? '16–30 days' : 'Over 30 days');
  check('action ageing: each row in its band, oldest first', ageing.rows.every((x, i) => x.ageBucket === band(x.ageDays) && (i === 0 || ageing.rows[i - 1].ageDays >= x.ageDays)));
  check('action ageing: only open actions', ageing.rows.every((x) => !['VERIFIED', 'CLOSED'].includes(x.status)));

  // ---------- New filters ----------
  r = await req('GET', '/reports/observations?repeatOnly=true', { token: COORD });
  check('observations: repeat-only filter', r.status === 200 && r.data.rows.every((x) => x.repeat === true), r.data?.total);
  const auditorName = `${auditorUser.firstName} ${auditorUser.lastName}`.trim();
  r = await req('GET', `/reports/audits?auditorId=${auditorUser.id}`, { token: COORD });
  check('audits: auditor filter', r.status === 200 && r.data.rows.every((x) => x.auditor === auditorName), r.data?.rows?.map((x) => x.auditor).join(','));
  r = await req('GET', '/reports/actions?source=RED_TAG', { token: COORD });
  check('actions: source filter', r.status === 200 && r.data.rows.every((x) => x.source === 'RED_TAG'), r.data?.total);
  r = await req('GET', '/reports/actions?actionType=corrective', { token: COORD });
  check('actions: action type filter (case-insensitive)', r.status === 200 && r.data.rows.every((x) => x.actionType === 'CORRECTIVE'), r.data?.total);
  check('bad source -> 400', (await req('GET', '/reports/actions?source=GOSSIP', { token: COORD })).status === 400);
  check('bad action type -> 400', (await req('GET', '/reports/action-ageing?actionType=MAGIC', { token: COORD })).status === 400);
  check('unknown org node -> 400', (await req('GET', '/reports/area-ranking?orgNodeId=00000000-0000-0000-0000-000000000000', { token: COORD })).status === 400);
  check('reversed custom range -> 400', (await req('GET', '/reports/maturity?from=2026-05-01&to=2026-01-01', { token: COORD })).status === 400);

  // ---------- Exports of the new registers ----------
  let f = await raw('/reports/action-ageing?format=xlsx', COORD);
  check('action ageing exports to Excel', f.status === 200 && f.buf.slice(0, 2).toString() === 'PK', `${f.status} ${f.type}`);
  if (f.status === 200) {
    const info = XLSX.utils.sheet_to_json(XLSX.read(f.buf, { type: 'buffer' }).Sheets['Report info'], { header: 1 });
    check('Excel info sheet carries the ageing summary', info.some((row) => row[0] === 'Summary' && /0–7 days: \d+/.test(String(row[1]))), JSON.stringify(info));
  }
  f = await raw('/reports/area-ranking?format=csv', COORD);
  check('area ranking exports to CSV', f.status === 200 && f.buf.toString('utf8').slice(1).startsWith('Rank,Area code,'), f.buf.toString('utf8').slice(0, 40));
  f = await raw('/reports/maturity?format=pdf', COORD);
  check('maturity exports to PDF', f.status === 200 && f.buf.slice(0, 5).toString() === '%PDF-', `${f.status}`);

  // ---------- Analytics: executive summary, area maturity, custom periods ----------
  r = await req('GET', '/analytics/summary?timeframe=12M', { token: COORD });
  const sum = r.data;
  check('executive summary 200', r.status === 200, msg(r));
  const k = (await req('GET', '/analytics/kpis?timeframe=12M', { token: COORD })).data;
  check('summary score equals the KPI score', sum.overallScore === k.fiveSScore, `${sum.overallScore} vs ${k.fiveSScore}`);
  check('summary actions equal the KPIs', sum.actions.open === k.actions.open && sum.actions.overdue === k.actions.overdue);
  check('summary audits done vs planned', sum.audits.planned === k.audits.scheduledDue && sum.audits.plannedCompleted === k.audits.scheduledCompleted);
  check('summary best / weakest areas (max 3, no overlap)', sum.topAreas.length <= 3 && sum.bottomAreas.length <= 3 && !sum.bottomAreas.some((b) => sum.topAreas.some((t) => t.locationId === b.locationId)));
  check('summary best areas sorted by score', sum.topAreas.every((a, i) => i === 0 || sum.topAreas[i - 1].averageScore >= a.averageScore));
  check('executive (read-only role) sees the summary', (await req('GET', '/analytics/summary', { token: EXEC })).status === 200);
  check('area owner blocked from the summary -> 403', (await req('GET', '/analytics/summary', { token: OWNER })).status === 403);
  check('summary reversed custom range -> 400', (await req('GET', '/analytics/summary?from=2026-05-01&to=2026-01-01', { token: COORD })).status === 400);

  r = await req('GET', '/analytics/area-maturity?timeframe=12M', { token: COORD });
  const am = r.data;
  check('area maturity 200', r.status === 200, msg(r));
  check('area maturity: level counts + not assessed = areas', am.levels.reduce((s, l) => s + l.count, 0) + am.notAssessed === am.locations.length);
  check('area maturity: no level without audits', am.locations.every((l) => (l.maturity === null) === (l.averageScore === null)));
  r = await req('GET', '/analytics/area-maturity?from=2000-01-01&to=2000-01-31', { token: COORD });
  check('area maturity: empty custom period -> everything not assessed', r.status === 200 && r.data.notAssessed === r.data.locations.length);

  r = await req('GET', '/analytics/kpis?from=2026-01-01&to=2026-01-31', { token: COORD });
  check('custom period: a bare "to" date covers the whole day', r.status === 200 && r.data.period.to.startsWith('2026-01-31T23:59:59'), r.data?.period?.to);
  r = await req('GET', `/analytics/benchmark?level=AREA&timeframe=12M&orgNodeId=${mach.id}`, { token: COORD });
  const machHeat = (await req('GET', `/analytics/heatmap?orgNodeId=${mach.id}`, { token: COORD })).data.rows;
  const machIds = new Set(machHeat.map((x) => x.id));
  check('benchmark limited to an org unit', r.status === 200 && r.data.every((x) => machIds.has(x.key)), `${r.status} ${r.data?.length}`);
  r = await req('GET', `/analytics/certification?orgNodeId=${mach.id}`, { token: COORD });
  check('certification limited to an org unit', r.status === 200 && r.data.locations.every((x) => machIds.has(x.locationId)), msg(r));
  r = await req('GET', `/analytics/drilldown/locations/${loc.id}?from=2026-01-01&to=2026-12-31`, { token: COORD });
  check('area audits with a custom period', r.status === 200 && Array.isArray(r.data.audits), msg(r));
  r = await req('GET', '/analytics/heatmap', { token: COORD });
  check('heat map rows carry the plant id', r.status === 200 && r.data.rows.every((x) => 'plantId' in x), msg(r));
  check('unscoped roles: scope not restricted', (await req('GET', '/analytics/scope', { token: COORD })).data?.restricted === false && (await req('GET', '/analytics/scope', { token: EXEC })).data?.restricted === false);
  r = await req('POST', '/analytics/gamification/award-trophy', { token: EXEC, body: { trophyId: 'GOLDEN_BROOM', newLocationId: loc.id, citation: 'ISO-exec' } });
  check('executive cannot award (read-only) -> 403', r.status === 403, msg(r));

  // ---------- Data scope: a department head scoped to Machining ----------
  const roles = (await req('GET', '/users/roles/all', { token: ADMIN })).data;
  const deptRole = roles.find((x) => x.code === 'DEPT_HEAD');
  const email = `iso-rpt-${Date.now()}@skilglobal.com`;
  r = await req('POST', '/users', { token: ADMIN, body: { email, firstName: 'ISO-Scoped', lastName: 'Dept head', password: PASSWORD } });
  scopedUser = r.data;
  check('fixture scoped user created', r.status < 300 && !!scopedUser?.id, msg(r));
  r = await req('POST', `/users/${scopedUser.id}/roles`, { token: ADMIN, body: { roleId: deptRole.id, orgNodeId: mach.id } });
  check('DEPT_HEAD assigned with an org node', r.status < 300, msg(r));
  const SCOPED = await login(email);
  check('scoped user signs in', !!SCOPED);

  r = await req('GET', '/analytics/scope', { token: SCOPED });
  check('scope endpoint names the department', r.status === 200 && r.data.restricted === true && r.data.nodes.some((n) => n.id === mach.id), JSON.stringify(r.data));
  const allHeat = (await req('GET', '/analytics/heatmap', { token: COORD })).data.rows;
  r = await req('GET', '/analytics/heatmap', { token: SCOPED });
  check('heat map limited to the department', r.status === 200 && r.data.rows.length === machHeat.length && r.data.rows.every((x) => machIds.has(x.id)), `${r.data?.rows?.length} vs ${machHeat.length}`);
  check('scoped view is smaller than the whole organization', machHeat.length < allHeat.length, `${machHeat.length} vs ${allHeat.length}`);
  check('org unit outside the scope -> 403', (await req('GET', `/analytics/heatmap?orgNodeId=${asm.id}`, { token: SCOPED })).status === 403);
  r = await req('GET', `/analytics/leaderboard?orgNodeId=${plant.id}`, { token: SCOPED });
  check('parent plant allowed, intersected with the scope', r.status === 200 && [...r.data.champions, ...r.data.attentionRequired].every((x) => machIds.has(x.id)), msg(r));
  r = await req('GET', '/analytics/kpis?timeframe=12M', { token: SCOPED });
  check('KPIs count only the department areas', r.status === 200 && r.data.locations.total === machHeat.length, `${r.data?.locations?.total} vs ${machHeat.length}`);
  r = await req('GET', '/analytics/summary?timeframe=12M', { token: SCOPED });
  check('summary areas within the scope', r.status === 200 && [...r.data.topAreas, ...r.data.bottomAreas].every((x) => machIds.has(x.locationId)), msg(r));
  const asmLoc = allHeat.find((x) => x.orgNodeId === asm.id);
  if (asmLoc) {
    r = await req('GET', `/analytics/drilldown/locations/${asmLoc.id}`, { token: SCOPED });
    check('area outside the scope -> 404', r.status === 404, msg(r));
  }
  r = await req('GET', '/analytics/drilldown', { token: SCOPED });
  check('drill-down shows only units with scoped areas', r.status === 200 && r.data.children.every((c) => c.locationCount <= machHeat.length), msg(r));
  r = await req('GET', '/reports/locations', { token: SCOPED });
  check('reports limited to the department', r.status === 200 && r.data.total > 0 && r.data.rows.every((x) => x.department === mach.name), `${r.data?.total} ${[...new Set(r.data?.rows?.map((x) => x.department))].join(',')}`);
  r = await req('GET', '/reports/area-ranking', { token: SCOPED });
  check('management register limited to the department', r.status === 200 && r.data.rows.every((x) => x.department === mach.name), r.data?.total);
  check('report org unit outside the scope -> 403', (await req('GET', `/reports/actions?orgNodeId=${asm.id}`, { token: SCOPED })).status === 403);
  if (asmLoc) {
    r = await req('GET', `/reports/observations?locationId=${asmLoc.id}`, { token: SCOPED });
    check('report for a location outside the scope is empty', r.status === 200 && r.data.total === 0, r.data?.total);
  }

  // ---------- Tenant isolation ----------
  r = await req('GET', '/reports/area-ranking', { token: APEX });
  check('other tenant: ranking excludes this tenant\'s areas', r.status === 200 && !r.data.rows.some((x) => x.areaCode === 'ISO-REP-LOC'), msg(r));
  check('other tenant: foreign org node in a report -> 400', (await req('GET', `/reports/actions?orgNodeId=${mach.id}`, { token: APEX })).status === 400);
  check('other tenant: foreign org node in analytics -> 404', (await req('GET', `/analytics/heatmap?orgNodeId=${mach.id}`, { token: APEX })).status === 404);
  check('other tenant: foreign area audits -> 404', [403, 404].includes((await req('GET', `/analytics/drilldown/locations/${loc.id}`, { token: APEX })).status));
  r = await req('GET', '/analytics/summary', { token: APEX });
  check('other tenant: summary never lists this tenant\'s areas', r.status === 200 && ![...r.data.topAreas, ...r.data.bottomAreas].some((x) => x.locationId === loc.id), msg(r));
} finally {
  if (scopedUser?.id) await req('DELETE', `/users/${scopedUser.id}`, { token: ADMIN });
  if (loc?.id) await req('DELETE', `/locations/${loc.id}`, { token: COORD });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

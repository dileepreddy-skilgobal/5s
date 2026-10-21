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
const isNumOrNull = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));
const pct = (v) => v === null || (v >= 0 && v <= 100);

// ---------- Role gating ----------
for (const ep of ['/analytics/kpis', '/analytics/trend', '/analytics/drilldown', '/analytics/benchmark', '/analytics/certification', '/analytics/maturity', '/analytics/heatmap']) {
  const r = await req('GET', ep, { token: OWNER });
  check(`area owner blocked from ${ep}`, r.status === 403, msg(r));
}
check('unauthenticated -> 401', (await req('GET', '/analytics/kpis')).status === 401);

// ---------- KPIs ----------
let r = await req('GET', '/analytics/kpis?timeframe=12M', { token: COORD });
check('kpis 200', r.status === 200, msg(r));
const k = r.data;
check('5S score numeric or null', isNumOrNull(k.fiveSScore), k.fiveSScore);
check('percentages within 0..100', [k.audits.adherencePercent, k.actions.overduePercent, k.actions.onTimeClosurePercent, k.observations.repeatPercent].every(pct),
  JSON.stringify([k.audits.adherencePercent, k.actions.overduePercent, k.actions.onTimeClosurePercent, k.observations.repeatPercent]));
check('pillar scores numeric or null', Object.values(k.pillarScores).every(isNumOrNull));
check('maturity consistent with score', (k.fiveSScore === null) === (k.maturity === null));
check('repeat <= total observations', k.observations.repeat <= k.observations.total);
check('overdue <= open actions', k.actions.overdue <= k.actions.open);
check('audited locations <= total', k.locations.audited <= k.locations.total);
const ageSum = Object.values(k.redTags.ageing).reduce((a, b) => a + b, 0);
check('red-tag ageing buckets sum to pending', ageSum === k.redTags.pending, `${ageSum} vs ${k.redTags.pending}`);

// Independent recomputation: open CAPA count from the actions register
const capas = (await req('GET', '/corrective-actions', { token: COORD })).data;
const capaList = Array.isArray(capas) ? capas : capas?.items ?? [];
const closedStatuses = new Set(['VERIFIED', 'CLOSED']);
const openIndep = capaList.filter((c) => !closedStatuses.has(c.status)).length;
check('open actions match the CAPA register', openIndep === k.actions.open, `${openIndep} vs ${k.actions.open}`);

r = await req('GET', '/analytics/kpis?timeframe=custom&from=2020-01-01&to=2020-01-31', { token: COORD });
check('empty custom period -> null score, no crash', r.status === 200 && r.data.fiveSScore === null && r.data.audits.completed === 0, msg(r));
r = await req('GET', '/analytics/kpis?timeframe=custom&from=bad&to=2020-01-31', { token: COORD });
check('invalid custom date -> 400', r.status === 400, msg(r));

// ---------- Trend ----------
r = await req('GET', '/analytics/trend?timeframe=6M', { token: COORD });
check('trend has 6 monthly buckets', r.status === 200 && r.data.length === 6, `${r.status} ${r.data?.length}`);
check('trend months without audits are null, not invented', r.data.every((m) => (m.audits === 0) === (m.overall === null)));
r = await req('GET', '/analytics/trend?timeframe=12M', { token: COORD });
check('12M trend has 12 buckets', r.data.length === 12, r.data?.length);

// ---------- Maturity overview (legacy shape) ----------
r = await req('GET', '/analytics/maturity?timeframe=12M', { token: COORD });
check('maturity overview 200', r.status === 200, msg(r));
check('overview score equals KPI score', r.data.overallScore === k.fiveSScore, `${r.data.overallScore} vs ${k.fiveSScore}`);
check('no hardcoded 87.4', r.data.overallScore !== 87.4);
check('pillarBreakdown has 6 pillars', r.data.pillarBreakdown.length === 6);

// ---------- Heatmap / leaderboard ----------
r = await req('GET', '/analytics/heatmap', { token: COORD });
check('heatmap 200', r.status === 200, msg(r));
const rows = r.data.rows;
const locs = (await req('GET', '/locations', { token: COORD })).data;
const locList = Array.isArray(locs) ? locs : locs?.items ?? [];
check('heatmap has one row per location', rows.length === locList.length, `${rows.length} vs ${locList.length}`);
check('heatmap rows have no fake pillar values', rows.every((x) => Object.values(x.pillars).every(isNumOrNull)));
r = await req('GET', '/analytics/leaderboard', { token: COORD });
check('leaderboard 200', r.status === 200, msg(r));
const champs = r.data.champions;
check('champions sorted by score desc', champs.every((c, i) => i === 0 || champs[i - 1].overallScore >= c.overallScore));
check('champions only scored areas', champs.every((c) => typeof c.overallScore === 'number'));

// ---------- Drill-down ----------
r = await req('GET', '/analytics/drilldown', { token: COORD });
check('drilldown root 200', r.status === 200, msg(r));
const child = r.data.children?.[0];
if (child) {
  const r2 = await req('GET', `/analytics/drilldown?orgNodeId=${child.id}`, { token: COORD });
  check('drilldown into child', r2.status === 200 && r2.data.breadcrumb.length >= 1, msg(r2));
}
r = await req('GET', '/analytics/drilldown?orgNodeId=00000000-0000-0000-0000-000000000000', { token: COORD });
check('unknown org node -> 404', r.status === 404, msg(r));
if (locList[0]) {
  r = await req('GET', `/analytics/drilldown/locations/${locList[0].id}`, { token: COORD });
  check('location audit drill-down 200', r.status === 200, msg(r));
}
r = await req('GET', '/analytics/drilldown/locations/00000000-0000-0000-0000-000000000000', { token: COORD });
check('unknown location -> 404', r.status === 404, msg(r));

// ---------- Benchmark / certification ----------
for (const lvl of ['PLANT', 'DEPARTMENT', 'AREA']) {
  r = await req('GET', `/analytics/benchmark?level=${lvl}&timeframe=12M`, { token: COORD });
  check(`benchmark ${lvl} 200`, r.status === 200, msg(r));
}
check('benchmark bad level -> 400', (await req('GET', '/analytics/benchmark?level=GALAXY', { token: COORD })).status === 400);
r = await req('GET', '/analytics/certification', { token: COORD });
check('certification 200', r.status === 200, msg(r));
const certs = r.data.locations ?? [];
check('certification levels valid', certs.every((c) => c.certification === null || ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'].includes(c.certification)));

// ---------- Auditor (read via SITE_LEADERS?) ----------
r = await req('GET', '/analytics/kpis', { token: AUDITOR });
console.log(`info: auditor kpis -> ${r.status}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

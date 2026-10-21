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

// Own template with at least one question
const templates = (await req('GET', '/audit-templates', { token: A })).data;
let tpl = null;
for (const t of templates) {
  const full = (await req('GET', `/audit-templates/${t.id}`, { token: A })).data;
  if (full.currentVersion?.sections?.some((s) => s.questions?.length)) { tpl = full; break; }
}
const section = tpl.currentVersion.sections.find((s) => s.questions.length);
const question = section.questions[0];
// A dedicated location guarantees a fresh execution (start re-uses any in-progress audit for the same location)
const node = (await req('GET', '/organization/nodes', { token: A })).data[0];
for (const l of ((await req('GET', '/locations', { token: A })).data || []).filter((l) => l.areaCode?.startsWith('ISO-'))) await req('DELETE', `/locations/${l.id}`, { token: A });
const loc = (await req('POST', '/locations', { token: A, body: { name: 'ISO Answers Cell', areaCode: 'ISO-ANS-LOC', orgNodeId: node.id, locationType: 'PRODUCTION_LINE' } })).data;

// Foreign question: create a throwaway template in apex-aero
const apex = (m, p, b) => req(m, p, { token: SA, body: b, tenant: 'apex-aero' });
for (const t of ((await apex('GET', '/audit-templates')).data || []).filter((t) => t.code?.startsWith('ISO-'))) await apex('DELETE', `/audit-templates/${t.id}`);
const apexTpl = (await apex('POST', '/audit-templates', { code: 'ISO-ANS-TPL', name: 'Iso Ans', auditType: 'ROUTINE' })).data;
const apexSec = (await apex('POST', `/audit-templates/${apexTpl.id}/versions/${apexTpl.currentVersion.id}/sections`, { title: 'S', category: 'S1_SORT' })).data;
const apexQ = (await apex('POST', `/audit-templates/sections/${apexSec.id}/questions`, { questionCode: 'ISO-AQ', questionText: 'q', questionType: 'NUMERIC_0_5' })).data;

const exec = (await req('POST', '/audit-executions/start', { token: A, body: { locationId: loc.id, templateId: tpl.id, auditorName: 'Iso Test' } })).data;
check('start own audit -> ok', !!exec?.id);
check('auditor recorded from token', !!exec?.auditorId, exec?.auditorId);

let r = await req('POST', `/audit-executions/${exec.id}/draft`, { token: A, body: { answers: [{ questionId: apexQ.id, sectionId: apexSec.id, score: 1 }] } });
check('draft answer with other tenant question -> 400', r.status === 400, r.status);
const otherSection = tpl.currentVersion.sections.find((s) => s.id !== section.id);
if (otherSection) {
  r = await req('POST', `/audit-executions/${exec.id}/draft`, { token: A, body: { answers: [{ questionId: question.id, sectionId: otherSection.id, score: 1 }] } });
  check('draft answer with mismatched section -> 400', r.status === 400, r.status);
}
r = await req('POST', `/audit-executions/${exec.id}/draft`, { token: A, body: { answers: [{ questionId: question.id, sectionId: section.id, score: 4 }] } });
check('draft answer with own question -> 2xx', r.status < 300, r.status + ' ' + JSON.stringify(r.json?.message));
r = await req('POST', '/audit-executions/start', { token: A, body: { locationId: loc.id, templateId: tpl.id, templateVersionId: apexTpl.currentVersion.id } });
check('start audit with other tenant version -> 404', r.status === 404, r.status);

await req('DELETE', `/audit-executions/${exec.id}`, { token: A });
await req('DELETE', `/locations/${loc.id}`, { token: A });
await apex('DELETE', `/audit-templates/${apexTpl.id}`);
console.log(`\n${pass} passed, ${fail} failed`);

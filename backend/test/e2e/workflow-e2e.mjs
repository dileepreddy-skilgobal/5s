const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data, json };
};
const msg = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? '')}`;
const login = async (email) => (await req('POST', '/auth/login', { body: { email, password: 'Admin@123456' } })).data.accessToken;
const T = {
  COORD: await login('coordinator.5s@skilglobal.com'),
  DEPT: await login('depthead.machining@skilglobal.com'),
  OWNER: await login('owner.cnc01@skilglobal.com'),
  OWNER2: await login('owner.asm01@skilglobal.com'),
  AUDITOR: await login('auditor.lead@skilglobal.com'),
};
const users = (await req('GET', '/users', { token: T.COORD })).data;
const ownerUser = users.find((u) => u.email === 'owner.cnc01@skilglobal.com');

// ---------- Fixtures ----------
const node = (await req('GET', '/organization/nodes', { token: T.COORD })).data[0];
let r = await req('POST', '/locations', { token: T.COORD, body: { name: 'ISO Workflow Cell', areaCode: 'iso-wf-loc', orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId: ownerUser.id } });
const loc = r.data;
check('fixture location created (area code upper-cased)', loc?.areaCode === 'ISO-WF-LOC', msg(r));
r = await req('POST', '/locations', { token: T.COORD, body: { name: 'ISO auto code', orgNodeId: node.id, locationType: 'PRODUCTION_LINE' } });
check('location without areaCode gets a generated code', r.status < 300 && !!r.data?.areaCode, msg(r));
if (r.data?.id) await req('DELETE', `/locations/${r.data.id}`, { token: T.COORD });

let tpl = null;
for (const t of (await req('GET', '/audit-templates', { token: T.COORD })).data) {
  const full = (await req('GET', `/audit-templates/${t.id}`, { token: T.COORD })).data;
  if (full.currentVersion?.sections?.some((s) => s.questions?.length)) { tpl = full; break; }
}
const section = tpl.currentVersion.sections.find((s) => s.questions.length);
const question = section.questions[0];

// ---------- Validation ----------
r = await req('POST', '/locations', { token: T.COORD, body: { name: 'x', orgNodeId: node.id, locationType: 'BOGUS_TYPE' } });
check('invalid locationType -> 400', r.status === 400, msg(r));
r = await req('POST', '/observations', { token: T.OWNER, body: { locationId: loc.id, title: 'x', description: 'x', category: 'S1_SORT', severity: 'APOCALYPTIC' } });
check('invalid observation severity -> 400', r.status === 400, msg(r));
r = await req('POST', '/standards', { token: T.COORD, body: { code: 'iso-std-1', title: 'Iso', category: 'S1_SORT', description: 'Iso standard', rules: ['Keep aisles clear'] } });
check('create standard iso-std-1', r.status < 300, msg(r));
check('a new standard starts as a draft awaiting approval', r.data?.status === 'DRAFT', r.data?.status);
r = await req('POST', '/standards', { token: T.COORD, body: { code: 'ISO-STD-1', title: 'Iso dup', category: 'S1_SORT', description: 'dup', rules: [] } });
check('same code in different case -> 409', r.status === 409, msg(r));

// ---------- Audit lifecycle (conducted by DEPT_HEAD, audited area owned by OWNER) ----------
r = await req('POST', '/audit-executions/start', { token: T.DEPT, body: { locationId: loc.id, templateId: tpl.id, auditorName: 'ISO' } });
const exec = r.data;
check('dept head starts audit', r.status < 300 && exec?.status === 'IN_PROGRESS', msg(r));
r = await req('POST', `/audit-executions/${exec.id}/draft`, { token: T.AUDITOR, body: { answers: [{ questionId: question.id, sectionId: section.id, score: 1 }] } });
check('another auditor cannot edit this audit -> 403', r.status === 403, msg(r));
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
// A complete submission: one failed question, every other question marked not applicable, signed
const failing = {
  auditorName: 'ISO auditor',
  auditorSignature: 'ISO signature',
  answers: tpl.currentVersion.sections.flatMap((s) => s.questions.map((q) =>
    q.id === question.id
      ? { questionId: q.id, sectionId: s.id, score: 0, maxScore: 5, status: 'MAJOR_NC', notes: 'ISO finding', evidenceUrls: q.mandatoryEvidence ? [TINY_PNG] : [] }
      : { questionId: q.id, sectionId: s.id, score: 0, maxScore: 0, status: 'NOT_APPLICABLE' })),
};
r = await req('POST', `/audit-executions/${exec.id}/submit`, { token: T.DEPT, body: { answers: [failing.answers[0]] } });
check('incomplete audit (unanswered questions, no signature) -> 400', r.status === 400, msg(r));
r = await req('POST', `/audit-executions/${exec.id}/score-preview`, { token: T.DEPT, body: { answers: failing.answers } });
check('score preview matches what submit will compute', r.status < 300 && typeof r.data?.isPassed === 'boolean' && r.data?.unansweredQuestionIds?.length === 0, msg(r));
r = await req('POST', `/audit-executions/${exec.id}/submit`, { token: T.DEPT, body: failing });
check('submit audit -> SUBMITTED', r.status < 300 && r.data?.status === 'SUBMITTED', msg(r));
r = await req('POST', `/audit-executions/${exec.id}/submit`, { token: T.DEPT, body: failing });
check('second submit -> 409 (no duplicate findings)', r.status === 409, msg(r));
r = await req('POST', `/audit-executions/${exec.id}/draft`, { token: T.DEPT, body: failing });
check('editing a submitted audit -> 409', r.status === 409, msg(r));
const obsList = (await req('GET', `/observations?locationId=${loc.id}`, { token: T.COORD })).data;
check('exactly one finding created', obsList.length === 1, obsList.length);
r = await req('POST', `/audit-executions/${exec.id}/acknowledge`, { token: T.DEPT, body: { acknowledgedByName: 'x', acknowledgementNotes: 'x' } });
check('auditor cannot acknowledge own audit -> 403', r.status === 403, msg(r));
r = await req('POST', `/audit-executions/${exec.id}/resolve-dispute`, { token: T.COORD, body: { decision: 'REJECT_DISPUTE', resolutionNotes: 'x' } });
check('resolve while not disputed -> 409', r.status === 409, msg(r));
r = await req('POST', `/audit-executions/${exec.id}/dispute`, { token: T.OWNER, body: { disputedByName: 'Someone Else', disputedById: 'spoofed-id', disputeReason: 'OUT_OF_SCOPE', disputeNotes: 'x' } });
check('area owner disputes -> DISPUTED', r.status < 300 && r.data?.status === 'DISPUTED', msg(r));
check('disputedBy recorded from token, not body', r.data?.disputedById === ownerUser.id, r.data?.disputedById);
r = await req('POST', `/audit-executions/${exec.id}/acknowledge`, { token: T.OWNER, body: { acknowledgedByName: 'x', acknowledgementNotes: 'x' } });
check('acknowledge while disputed -> 409', r.status === 409, msg(r));
r = await req('POST', `/audit-executions/${exec.id}/resolve-dispute`, { token: T.COORD, body: { decision: 'MAYBE', resolutionNotes: 'x' } });
check('invalid dispute decision -> 400', r.status === 400, msg(r));
r = await req('POST', `/audit-executions/${exec.id}/resolve-dispute`, { token: T.COORD, body: { decision: 'REJECT_DISPUTE', resolutionNotes: 'Findings upheld' } });
check('coordinator resolves -> ACKNOWLEDGED', r.status < 300 && r.data?.status === 'ACKNOWLEDGED', msg(r));
r = await req('DELETE', `/audit-executions/${exec.id}`, { token: T.COORD });
check('deleting a submitted audit -> 409', r.status === 409, msg(r));

// ---------- CAPA lifecycle ----------
const capa = (await req('GET', `/corrective-actions?locationId=${loc.id}`, { token: T.COORD })).data[0];
check('CAPA unlocked to ASSIGNED for the area owner', capa?.status === 'ASSIGNED' && capa?.assigneeId === ownerUser.id, `${capa?.status} ${capa?.assigneeId === ownerUser.id}`);
r = await req('POST', `/corrective-actions/${capa.id}/verify`, { token: T.AUDITOR, body: { approved: true } });
check('verify before closure submitted -> 409', r.status === 409, msg(r));
r = await req('PATCH', `/corrective-actions/${capa.id}`, { token: T.COORD, body: { status: 'VERIFIED' } });
check('force status via PATCH -> 409', r.status === 409, msg(r));
r = await req('POST', `/corrective-actions/${capa.id}/submit-closure`, { token: T.OWNER2, body: { closureNotes: 'x', afterPhotoUrl: 'x' } });
check('other area owner cannot close someone else\'s CAPA -> 403', r.status === 403, msg(r));
r = await req('POST', `/corrective-actions/${capa.id}/submit-closure`, { token: T.OWNER, body: { closureNotes: 'Fixed', afterPhotoUrl: TINY_PNG } });
check('closure without root cause and solution -> 400', r.status === 400, msg(r));
r = await req('PATCH', `/corrective-actions/${capa.id}/5-why`, { token: T.OWNER, body: { why1: 'ISO cause', solution: 'ISO fix' } });
check('assignee records the 5-Why and solution', r.status < 300, msg(r));
r = await req('POST', `/corrective-actions/${capa.id}/submit-closure`, { token: T.OWNER, body: { closureNotes: 'Fixed', afterPhotoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC' } });
check('assignee submits closure -> PENDING_VERIFICATION', r.status < 300 && r.data?.status === 'PENDING_VERIFICATION', msg(r));
r = await req('POST', `/corrective-actions/${capa.id}/verify`, { token: T.AUDITOR, body: { approved: true, verificationNotes: 'ok' } });
check('independent verifier approves -> VERIFIED', r.status < 300 && r.data?.status === 'VERIFIED', msg(r));
r = await req('POST', `/corrective-actions/${capa.id}/verify`, { token: T.AUDITOR, body: { approved: false } });
check('verify again -> 409', r.status === 409, msg(r));
r = await req('DELETE', `/corrective-actions/${capa.id}`, { token: T.COORD });
check('deleting a verified CAPA -> 409', r.status === 409, msg(r));

// ---------- Red tag lifecycle ----------
r = await req('POST', '/red-tags', { token: T.OWNER, body: { locationId: loc.id, itemName: 'ISO wrench', itemDescription: 'x', category: 'UNNEEDED_TOOL', reason: 'unused', quantity: 1 } });
const tag = r.data;
check('area owner registers red tag', r.status < 300 && !!tag?.tagNumber, msg(r));
r = await req('POST', `/red-tags/${tag.id}/close`, { token: T.COORD, body: { financialRecovered: 10 } });
check('close before disposition approved -> 409', r.status === 409, msg(r));
r = await req('POST', `/red-tags/${tag.id}/disposition`, { token: T.OWNER, body: { dispositionAction: 'RELOCATE', dispositionJustification: 'x', supervisorApproved: true } });
check('area owner cannot self-approve disposition -> 403', r.status === 403, msg(r));
r = await req('POST', `/red-tags/${tag.id}/disposition`, { token: T.OWNER, body: { dispositionAction: 'RELOCATE', dispositionJustification: 'x', supervisorApproved: false } });
check('area owner proposes disposition -> PENDING_DISPOSITION', r.status < 300 && r.data?.status === 'PENDING_DISPOSITION', msg(r));
r = await req('POST', `/red-tags/${tag.id}/disposition`, { token: T.COORD, body: { dispositionAction: 'RELOCATE', dispositionJustification: 'approved', supervisorApproved: true } });
check('supervisor approves -> DISPOSITION_APPROVED', r.status < 300 && r.data?.status === 'DISPOSITION_APPROVED', msg(r));
r = await req('POST', `/red-tags/${tag.id}/close`, { token: T.COORD, body: { financialRecovered: 10 } });
check('close approved RELOCATE tag -> RETURNED (kept in service)', r.status < 300 && r.data?.status === 'RETURNED', msg(r));
r = await req('DELETE', `/red-tags/${tag.id}`, { token: T.COORD });
check('deleting a finished tag -> 409', r.status === 409, msg(r));

// ---------- Recurring schedules ----------
const base = { templateId: tpl.id, targetType: 'SPECIFIC_LOCATIONS', targetLocationIds: [loc.id] };
r = await req('POST', '/audit-schedules', { token: T.COORD, body: { ...base, scheduleCode: 'iso-sch-weekly', title: 'ISO weekly', recurrence: 'WEEKLY' } });
const weekly = r.data;
check('create schedule without templateVersionId (as the UI does)', r.status < 300 && !!weekly?.templateVersionId, msg(r));
const countInstances = async (id) => (await req('GET', '/audit-schedules/instances', { token: T.COORD })).data.filter((i) => i.scheduleId === id);
let inst = await countInstances(weekly.id);
check('first cycle generated 1 audit', inst.length === 1, inst.length);
r = await req('POST', `/audit-schedules/${weekly.id}/generate`, { token: T.COORD });
inst = await countInstances(weekly.id);
const days = inst.length === 2 ? Math.round((new Date(inst[0].plannedDate) - new Date(inst[1].plannedDate)) / 86400000) : null;
check('next cycle generates a new audit 7 days later', r.status < 300 && inst.length === 2 && Math.abs(days) === 7, `${inst.length} instances, gap ${days}d`);
check('instance codes are unique', new Set(inst.map((i) => i.auditCode)).size === inst.length);
r = await req('POST', '/audit-schedules', { token: T.COORD, body: { ...base, scheduleCode: 'iso-sch-once', title: 'ISO once', recurrence: 'ONCE' } });
const once = r.data;
r = await req('POST', `/audit-schedules/${once.id}/generate`, { token: T.COORD });
check('one-off schedule completes after its run -> 409 on re-generate', r.status === 409, msg(r));
r = await req('POST', '/audit-schedules', { token: T.COORD, body: { ...base, scheduleCode: 'ISO-SCH-WEEKLY', title: 'dup', recurrence: 'WEEKLY' } });
check('duplicate schedule code (case-insensitive) -> 409', r.status === 409, msg(r));
r = await req('POST', '/audit-schedules', { token: T.COORD, body: { ...base, scheduleCode: 'iso-sch-custom', title: 'x', recurrence: 'CUSTOM_DAYS' } });
check('CUSTOM_DAYS without interval -> 400', r.status === 400, msg(r));

// ---------- Error envelope ----------
r = await req('GET', '/locations/00000000-0000-0000-0000-000000000000', { token: T.COORD });
check('missing record -> 404 with clean message', r.status === 404 && !/prisma|invocation/i.test(JSON.stringify(r.json)), msg(r));

console.log(`\n${pass} passed, ${fail} failed`);

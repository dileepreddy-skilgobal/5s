// Audit workstream: templates (multiple choice, reorder, view-only preview), schedules (audit type, lead time,
// edit, reschedule, cancel, due generation), execution (self-audits, unscheduled / surprise audits, finding
// severity) and the dispute results list. Test data uses the ISO- prefix and is removed at the end.
const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data, json };
};
const msg = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? '')}`;
const login = async (email) => (await req('POST', '/auth/login', { body: { email, password: 'Admin@123456' } })).data?.accessToken;
const DAY = 86400000;
const T = {
  COORD: await login('coordinator.5s@skilglobal.com'),
  PLANT: await login('planthead.blr@skilglobal.com'),
  OWNER: await login('owner.cnc01@skilglobal.com'),
  OWNER2: await login('owner.asm01@skilglobal.com'),
  AUDITOR: await login('auditor.lead@skilglobal.com'),
  APEX: await login('admin@apex-aero.com'),
};
const users = (await req('GET', '/users', { token: T.COORD })).data;
const ownerUser = users.find((u) => u.email === 'owner.cnc01@skilglobal.com');

const created = { executions: [], schedules: [], templates: [], locations: [] };

try {
  // ---------- Fixtures: two ISO locations (A owned by owner.cnc01, B not) ----------
  const node = (await req('GET', '/organization/nodes', { token: T.COORD })).data[0];
  let r = await req('POST', '/locations', { token: T.COORD, body: { name: 'ISO Audits Cell A', areaCode: 'ISO-AUD-A', orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId: ownerUser.id } });
  const locA = r.data;
  check('fixture location A (owned by the area owner)', r.status < 300 && locA?.ownerId === ownerUser.id, msg(r));
  r = await req('POST', '/locations', { token: T.COORD, body: { name: 'ISO Audits Cell B', areaCode: 'ISO-AUD-B', orgNodeId: node.id, locationType: 'PRODUCTION_LINE' } });
  const locB = r.data;
  check('fixture location B (no owner)', r.status < 300 && !!locB?.id, msg(r));
  created.locations.push(locA?.id, locB?.id);

  // ---------- Templates: multiple choice, description, reference photo, reorder ----------
  r = await req('POST', '/audit-templates', { token: T.COORD, body: { code: 'ISO-AUD-TPL', name: 'ISO audits template', auditType: 'ROUTINE' } });
  const tpl = r.data;
  created.templates.push(tpl?.id);
  check('create template', r.status === 201 && !!tpl?.currentVersion?.id, msg(r));
  const v1 = tpl.currentVersion.id;
  const sec = (await req('POST', `/audit-templates/${tpl.id}/versions/${v1}/sections`, { token: T.COORD, body: { title: 'ISO sort', category: 'S1_SORT' } })).data;
  r = await req('POST', `/audit-templates/sections/${sec.id}/questions`, {
    token: T.COORD,
    body: { questionCode: 'ISO-AUD-Q1', questionText: 'Only needed tools at the bench?', questionType: 'NUMERIC_0_5', severity: 'MAJOR', description: 'ISO description', guidance: 'Look under the bench', referencePhotoUrl: 'https://example.com/iso-reference.jpg' },
  });
  const q1 = r.data;
  check('question stores description, guidance and reference photo', r.status === 201 && q1?.description === 'ISO description' && q1?.referencePhotoUrl === 'https://example.com/iso-reference.jpg', msg(r));
  r = await req('POST', `/audit-templates/sections/${sec.id}/questions`, { token: T.COORD, body: { questionCode: 'ISO-AUD-MC0', questionText: 'x', questionType: 'MULTIPLE_CHOICE' } });
  check('multiple choice without choices -> 400', r.status === 400, msg(r));
  r = await req('POST', `/audit-templates/sections/${sec.id}/questions`, { token: T.COORD, body: { questionCode: 'ISO-AUD-MC1', questionText: 'x', questionType: 'MULTIPLE_CHOICE', options: [{ label: 'Only', score: 100 }] } });
  check('multiple choice with one choice -> 400', r.status === 400, msg(r));
  r = await req('POST', `/audit-templates/sections/${sec.id}/questions`, { token: T.COORD, body: { questionCode: 'ISO-AUD-MC2', questionText: 'x', questionType: 'MULTIPLE_CHOICE', options: [{ label: 'Same', score: 100 }, { label: 'same', score: 0 }] } });
  check('multiple choice with duplicate labels -> 400', r.status === 400, msg(r));
  r = await req('POST', `/audit-templates/sections/${sec.id}/questions`, { token: T.COORD, body: { questionCode: 'ISO-AUD-MC3', questionText: 'x', questionType: 'MULTIPLE_CHOICE', options: [{ label: 'A', score: 150 }, { label: 'B', score: 0 }] } });
  check('choice score above 100 -> 400', r.status === 400, msg(r));
  const choices = [{ label: 'Fully meets', score: 100 }, { label: 'Partly meets', score: 50 }, { label: 'Does not meet', score: 0 }];
  r = await req('POST', `/audit-templates/sections/${sec.id}/questions`, { token: T.COORD, body: { questionCode: 'ISO-AUD-Q2', questionText: 'Labels in place?', questionType: 'MULTIPLE_CHOICE', options: choices } });
  const q2 = r.data;
  check('multiple choice with three choices -> 201', r.status === 201 && !!q2?.id, msg(r));
  r = await req('POST', `/audit-templates/sections/${sec.id}/questions`, { token: T.COORD, body: { questionCode: 'ISO-AUD-Q3', questionText: 'Temporary', questionType: 'MULTIPLE_CHOICE', options: choices } });
  const q3 = r.data;
  check('new questions are appended after the last one', r.status === 201 && q3?.sortOrder > q2?.sortOrder && q2?.sortOrder > q1?.sortOrder, `${q1?.sortOrder}/${q2?.sortOrder}/${q3?.sortOrder}`);
  r = await req('PATCH', `/audit-templates/questions/${q3.id}`, { token: T.COORD, body: { questionType: 'NUMERIC_0_5' } });
  check('changing away from multiple choice clears the choices', r.status < 300 && r.data?.options === null, msg(r));
  r = await req('PATCH', `/audit-templates/questions/${q3.id}`, { token: T.COORD, body: { questionType: 'MULTIPLE_CHOICE' } });
  check('changing to multiple choice without choices -> 400', r.status === 400, msg(r));

  r = await req('POST', `/audit-templates/sections/${sec.id}/questions/reorder`, { token: T.AUDITOR, body: { questionIds: [q2.id, q1.id, q3.id] } });
  check('auditor cannot reorder questions -> 403', r.status === 403, msg(r));
  r = await req('POST', `/audit-templates/sections/${sec.id}/questions/reorder`, { token: T.COORD, body: { questionIds: [q2.id, q1.id] } });
  check('reorder with a missing question -> 400', r.status === 400, msg(r));
  r = await req('POST', `/audit-templates/sections/${sec.id}/questions/reorder`, { token: T.COORD, body: { questionIds: ['not-a-uuid'] } });
  check('reorder with invalid ids -> 400', r.status === 400, msg(r));
  r = await req('POST', `/audit-templates/sections/${sec.id}/questions/reorder`, { token: T.COORD, body: { questionIds: [q3.id, q2.id, q1.id] } });
  check('coordinator reorders questions', r.status === 200 && r.data?.map((q) => q.id).join() === [q3.id, q2.id, q1.id].join(), msg(r));
  r = await req('POST', `/audit-templates/sections/${sec.id}/questions/reorder`, { token: T.APEX, body: { questionIds: [q3.id, q2.id, q1.id] } });
  check('other organization cannot reorder this section -> 404', r.status === 404, msg(r));
  await req('DELETE', `/audit-templates/questions/${q3.id}`, { token: T.COORD });
  r = await req('POST', `/audit-templates/${tpl.id}/versions/${v1}/publish`, { token: T.COORD });
  check('publish template', r.status < 300, msg(r));
  r = await req('POST', `/audit-templates/sections/${sec.id}/questions/reorder`, { token: T.COORD, body: { questionIds: [q1.id, q2.id] } });
  check('reordering a published version -> 409', r.status === 409, msg(r));
  r = await req('GET', `/audit-templates/${tpl.id}`, { token: T.AUDITOR });
  const preview = r.data?.currentVersion?.sections?.[0]?.questions ?? [];
  check('view-only auditor reads the full checklist for the preview', r.status === 200 && preview.length === 2 && Array.isArray(preview.find((q) => q.id === q2.id)?.options), msg(r));
  r = await req('GET', `/audit-templates/${tpl.id}`, { token: T.APEX });
  check('other organization cannot read the template -> 404', r.status === 404, msg(r));

  // A retired template cannot be used for an unscheduled audit
  r = await req('POST', '/audit-templates', { token: T.COORD, body: { code: 'ISO-AUD-OLD', name: 'ISO retired template', auditType: 'ROUTINE' } });
  const oldTpl = r.data;
  created.templates.push(oldTpl?.id);
  const oldSec = (await req('POST', `/audit-templates/${oldTpl.id}/versions/${oldTpl.currentVersion.id}/sections`, { token: T.COORD, body: { title: 'ISO', category: 'S1_SORT' } })).data;
  await req('POST', `/audit-templates/sections/${oldSec.id}/questions`, { token: T.COORD, body: { questionCode: 'ISO-AUD-OLDQ', questionText: 'x', questionType: 'YES_NO' } });
  await req('POST', `/audit-templates/${oldTpl.id}/versions/${oldTpl.currentVersion.id}/publish`, { token: T.COORD });
  await req('PATCH', `/audit-templates/${oldTpl.id}`, { token: T.COORD, body: { status: 'DEPRECATED' } });
  r = await req('POST', '/audit-executions/start', { token: T.AUDITOR, body: { locationId: locB.id, templateId: oldTpl.id } });
  check('unscheduled audit with a deprecated template -> 400', r.status === 400, msg(r));

  // ---------- Unscheduled / surprise audit by an auditor ----------
  r = await req('POST', '/audit-executions/start', { token: T.AUDITOR, body: { locationId: locB.id, templateId: tpl.id, auditType: 'BOGUS' } });
  check('invalid audit type -> 400', r.status === 400, msg(r));
  r = await req('POST', '/audit-executions/start', { token: T.AUDITOR, body: { locationId: locB.id, templateId: tpl.id, auditType: 'SURPRISE' } });
  check('auditor starts a surprise audit', r.status < 300 && r.data?.auditType === 'SURPRISE' && !r.data?.auditInstanceId, msg(r));
  if (r.data?.id) created.executions.push(r.data.id);
  r = await req('POST', '/audit-executions/start', { token: T.APEX, body: { locationId: locB.id, templateId: tpl.id, auditType: 'SURPRISE' } });
  check('other organization cannot start an audit here -> 404', r.status === 404, msg(r));

  // ---------- Self-audits by the area owner ----------
  r = await req('POST', '/audit-executions/start', { token: T.OWNER, body: { locationId: locA.id, templateId: tpl.id, auditType: 'ROUTINE' } });
  check('area owner cannot start a routine audit -> 403', r.status === 403, msg(r));
  r = await req('POST', '/audit-executions/start', { token: T.OWNER, body: { locationId: locB.id, templateId: tpl.id, auditType: 'SELF' } });
  check('area owner cannot self-audit an area they do not own -> 403', r.status === 403, msg(r));
  r = await req('POST', '/audit-executions/start', { token: T.OWNER, body: { locationId: locA.id, templateId: tpl.id, auditType: 'SELF' } });
  const selfExec = r.data;
  check('area owner starts a self-audit of their own area', r.status < 300 && selfExec?.auditType === 'SELF' && selfExec?.auditorId === ownerUser.id, msg(r));
  if (selfExec?.id) created.executions.push(selfExec.id);
  r = await req('POST', `/audit-executions/${selfExec.id}/draft`, { token: T.OWNER, body: { answers: [{ questionId: q1.id, sectionId: sec.id, score: 4 }] } });
  check('area owner saves answers of their self-audit', r.status < 300, msg(r));
  r = await req('POST', `/audit-executions/${selfExec.id}/draft`, { token: T.OWNER2, body: { answers: [{ questionId: q1.id, sectionId: sec.id, score: 1 }] } });
  check('another area owner cannot change that self-audit -> 403', r.status === 403, msg(r));
  r = await req('DELETE', `/audit-executions/${selfExec.id}`, { token: T.COORD });
  check('coordinator removes the in-progress self-audit', r.status < 300, msg(r));

  // ---------- Finding severity: question default and auditor override ----------
  r = await req('POST', '/audit-executions/start', { token: T.COORD, body: { locationId: locA.id, templateId: tpl.id } });
  const exec = r.data;
  check('coordinator starts an unscheduled audit (template type)', r.status < 300 && exec?.auditType === 'ROUTINE', msg(r));
  if (exec?.id) created.executions.push(exec.id);
  const answers = (q1Extra) => [
    { questionId: q1.id, sectionId: sec.id, score: 0, maxScore: 5, status: 'MINOR_NC', notes: 'ISO-finding: tools left on bench', ...q1Extra },
    { questionId: q2.id, sectionId: sec.id, score: 5, maxScore: 5, status: 'CONFORMING' },
  ];
  r = await req('POST', `/audit-executions/${exec.id}/score-preview`, { token: T.COORD, body: { answers: answers({}) } });
  check('a finding takes the question default severity (MAJOR)', r.status === 200 && r.data?.findings?.find((f) => f.questionId === q1.id)?.severity === 'MAJOR', JSON.stringify(r.data?.findings));
  r = await req('POST', `/audit-executions/${exec.id}/score-preview`, { token: T.COORD, body: { answers: answers({ findingSeverity: 'CRITICAL' }) } });
  check('the auditor can override the severity', r.status === 200 && r.data?.findings?.find((f) => f.questionId === q1.id)?.severity === 'CRITICAL', JSON.stringify(r.data?.findings));
  r = await req('POST', `/audit-executions/${exec.id}/draft`, { token: T.COORD, body: { answers: answers({ findingSeverity: 'APOCALYPTIC' }) } });
  check('invalid finding severity -> 400', r.status === 400, msg(r));
  r = await req('POST', `/audit-executions/${exec.id}/submit`, { token: T.COORD, body: { answers: answers({ findingSeverity: 'MINOR' }), auditorName: 'ISO coordinator', auditorSignature: 'ISO signature' } });
  check('submit with an overridden severity', r.status < 300 && r.data?.status === 'SUBMITTED', msg(r));
  const obs = (await req('GET', `/observations?locationId=${locA.id}`, { token: T.COORD })).data?.filter((o) => o.executionId === exec.id) ?? [];
  check('the finding is recorded with the chosen severity', obs.length === 1 && obs[0].severity === 'MINOR', JSON.stringify(obs.map((o) => o.severity)));

  // ---------- Dispute results list and resolution by the plant head ----------
  r = await req('POST', `/audit-executions/${exec.id}/dispute`, { token: T.OWNER, body: { disputeReason: 'INACCURATE_EVIDENCE', disputeNotes: 'ISO dispute' } });
  check('area owner disputes the audit', r.status < 300 && r.data?.status === 'DISPUTED', msg(r));
  r = await req('GET', `/audit-executions?disputeStatus=DISPUTED&locationId=${locA.id}`, { token: T.PLANT });
  check('disputed filter lists the audit (plant head)', r.status === 200 && r.data?.some((e) => e.id === exec.id), msg(r));
  r = await req('GET', `/audit-executions?status=DISPUTED&locationId=${locB.id}`, { token: T.PLANT });
  check('disputed filter excludes other locations', r.status === 200 && !r.data?.some((e) => e.id === exec.id), msg(r));
  r = await req('GET', '/audit-executions?disputeStatus=DISPUTED', { token: T.APEX });
  check('other organization does not see the dispute', r.status === 200 && !r.data?.some((e) => e.id === exec.id), msg(r));
  const note = (await req('GET', '/notifications?pageSize=100', { token: T.COORD })).data?.items?.find((n) => n.entityId === exec.id && n.type === 'AUDIT_DISPUTED');
  check('dispute notification links to the audit results (not the auditor hub)', !note || note.link.startsWith('/schedules?tab=results'), note?.link ?? 'no notification (preferences)');
  r = await req('POST', `/audit-executions/${exec.id}/resolve-dispute`, { token: T.AUDITOR, body: { decision: 'REJECT_DISPUTE', resolutionNotes: 'x' } });
  check('auditor cannot rule on a dispute -> 403', r.status === 403, msg(r));
  r = await req('POST', `/audit-executions/${exec.id}/resolve-dispute`, { token: T.PLANT, body: { decision: 'REJECT_DISPUTE', resolutionNotes: 'ISO findings upheld' } });
  check('plant head rules on the dispute', r.status < 300 && r.data?.status === 'ACKNOWLEDGED' && r.data?.disputeStatus === 'RESOLVED_REJECTED', msg(r));

  // ---------- Schedules: audit type and lead time ----------
  const baseSchedule = { templateId: tpl.id, targetType: 'SPECIFIC_LOCATIONS', targetLocationIds: [locA.id], recurrence: 'WEEKLY' };
  r = await req('POST', '/audit-schedules', { token: T.COORD, body: { ...baseSchedule, scheduleCode: 'ISO-AUD-BAD', title: 'ISO bad', auditType: 'BOGUS' } });
  check('schedule with invalid audit type -> 400', r.status === 400, msg(r));
  r = await req('POST', '/audit-schedules', { token: T.COORD, body: { ...baseSchedule, scheduleCode: 'ISO-AUD-BAD2', title: 'ISO bad', leadTimeDays: 500 } });
  check('schedule with lead time above 90 days -> 400', r.status === 400, msg(r));
  r = await req('POST', '/audit-schedules', { token: T.AUDITOR, body: { ...baseSchedule, scheduleCode: 'ISO-AUD-BAD3', title: 'ISO bad' } });
  check('auditor cannot create a schedule -> 403', r.status === 403, msg(r));
  r = await req('POST', '/audit-schedules', { token: T.COORD, body: { ...baseSchedule, scheduleCode: 'ISO-AUD-SCH', title: 'ISO surprise weekly', auditType: 'SURPRISE', leadTimeDays: 5 } });
  const weekly = r.data;
  if (weekly?.id) created.schedules.push(weekly.id);
  check('schedule keeps its audit type and lead time', r.status < 300 && weekly?.auditType === 'SURPRISE' && weekly?.leadTimeDays === 5, msg(r));
  const instancesOf = async (id) => (await req('GET', '/audit-schedules/instances', { token: T.COORD })).data.filter((i) => i.scheduleId === id);
  let inst = (await instancesOf(weekly.id))[0];
  check('generated audit carries the schedule audit type', inst?.auditType === 'SURPRISE', inst?.auditType);

  r = await req('PATCH', `/audit-schedules/${weekly.id}`, { token: T.COORD, body: { auditType: 'LAYERED', leadTimeDays: 3, title: 'ISO layered weekly' } });
  check('edit schedule: audit type, lead time and title', r.status < 300 && r.data?.auditType === 'LAYERED' && r.data?.leadTimeDays === 3, msg(r));
  r = await req('PATCH', `/audit-schedules/${weekly.id}`, { token: T.COORD, body: { leadTimeDays: -1 } });
  check('negative lead time -> 400', r.status === 400, msg(r));
  r = await req('PATCH', `/audit-schedules/${weekly.id}`, { token: T.COORD, body: { rotationRule: 'ASSIGNED_AUDITOR' } });
  check('assigned-auditor rotation without an auditor -> 400', r.status === 400, msg(r));
  r = await req('PATCH', `/audit-schedules/${weekly.id}`, { token: T.AUDITOR, body: { title: 'x' } });
  check('auditor cannot edit a schedule -> 403', r.status === 403, msg(r));
  r = await req('PATCH', `/audit-schedules/${weekly.id}`, { token: T.APEX, body: { title: 'x' } });
  check('other organization cannot edit the schedule -> 404', r.status === 404, msg(r));
  r = await req('PATCH', `/audit-schedules/${weekly.id}`, { token: T.COORD, body: { status: 'PAUSED' } });
  check('pause schedule', r.status < 300 && r.data?.status === 'PAUSED', msg(r));
  r = await req('POST', `/audit-schedules/${weekly.id}/generate`, { token: T.COORD });
  check('a paused schedule does not generate -> 409', r.status === 409, msg(r));
  r = await req('PATCH', `/audit-schedules/${weekly.id}`, { token: T.COORD, body: { status: 'ACTIVE' } });
  check('resume schedule', r.status < 300 && r.data?.status === 'ACTIVE', msg(r));

  // ---------- One scheduled audit: start rules, reschedule, cancel ----------
  r = await req('POST', '/audit-executions/start', { token: T.AUDITOR, body: { locationId: locB.id, templateId: tpl.id, auditInstanceId: inst.id } });
  check('starting a scheduled audit at another location -> 400', r.status === 400, msg(r));
  const planned = new Date(Date.now() + 10 * DAY);
  r = await req('POST', `/audit-schedules/instances/${inst.id}/reschedule`, { token: T.COORD, body: { plannedDate: planned.toISOString(), dueDate: new Date(planned.getTime() - DAY).toISOString() } });
  check('due date before planned date -> 400', r.status === 400, msg(r));
  r = await req('POST', `/audit-schedules/instances/${inst.id}/reschedule`, { token: T.COORD, body: { reason: 'no date' } });
  check('reschedule without a date -> 400', r.status === 400, msg(r));
  r = await req('POST', `/audit-schedules/instances/${inst.id}/reschedule`, { token: T.AUDITOR, body: { plannedDate: planned.toISOString() } });
  check('auditor cannot reschedule -> 403', r.status === 403, msg(r));
  r = await req('POST', `/audit-schedules/instances/${inst.id}/reschedule`, { token: T.APEX, body: { plannedDate: planned.toISOString() } });
  check('other organization cannot reschedule -> 404', r.status === 404, msg(r));
  r = await req('POST', `/audit-schedules/instances/${inst.id}/reschedule`, { token: T.COORD, body: { plannedDate: planned.toISOString(), reason: 'ISO line changeover' } });
  const dueGap = r.data ? Math.round((new Date(r.data.dueDate) - new Date(r.data.plannedDate)) / DAY) : null;
  check('reschedule moves the audit and keeps the reason', r.status === 200 && r.data?.status === 'SCHEDULED' && new Date(r.data.plannedDate).getTime() === planned.getTime() && /ISO line changeover/.test(r.data?.notes ?? ''), msg(r));
  check('due date defaults to the completion window', dueGap === 3, dueGap);
  r = await req('POST', `/audit-schedules/instances/${inst.id}/cancel`, { token: T.COORD, body: {} });
  check('cancel without a reason -> 400', r.status === 400, msg(r));
  r = await req('POST', `/audit-schedules/instances/${inst.id}/cancel`, { token: T.AUDITOR, body: { reason: 'x' } });
  check('auditor cannot cancel -> 403', r.status === 403, msg(r));
  r = await req('POST', `/audit-schedules/instances/${inst.id}/cancel`, { token: T.COORD, body: { reason: 'ISO area shut down' } });
  check('cancel keeps the reason', r.status === 200 && r.data?.status === 'CANCELLED' && /ISO area shut down/.test(r.data?.notes ?? ''), msg(r));
  r = await req('POST', `/audit-schedules/instances/${inst.id}/reschedule`, { token: T.COORD, body: { plannedDate: planned.toISOString() } });
  check('a cancelled audit cannot be rescheduled -> 409', r.status === 409, msg(r));
  r = await req('POST', '/audit-executions/start', { token: T.AUDITOR, body: { locationId: locA.id, templateId: tpl.id, auditInstanceId: inst.id } });
  check('a cancelled audit cannot be started -> 409', r.status === 409, msg(r));

  // ---------- Scheduled self-audit goes to the area owner ----------
  r = await req('POST', '/audit-schedules', { token: T.COORD, body: { ...baseSchedule, recurrence: 'ONCE', scheduleCode: 'ISO-AUD-SELF', title: 'ISO self-audit', auditType: 'SELF' } });
  const selfSchedule = r.data;
  if (selfSchedule?.id) created.schedules.push(selfSchedule.id);
  const selfInst = (await instancesOf(selfSchedule.id))[0];
  check('a self-audit schedule assigns the area owner', selfInst?.auditType === 'SELF' && selfInst?.auditorId === ownerUser.id, `${selfInst?.auditType} ${selfInst?.auditorId === ownerUser.id}`);
  r = await req('POST', '/audit-executions/start', { token: T.OWNER, body: { locationId: locA.id, templateId: tpl.id, auditInstanceId: selfInst.id, auditType: 'ROUTINE' } });
  check('owner starts the scheduled self-audit (planned type wins)', r.status < 300 && r.data?.auditType === 'SELF' && r.data?.auditInstanceId === selfInst.id, msg(r));
  if (r.data?.id) created.executions.push(r.data.id);
  r = await req('PATCH', `/audit-schedules/${selfSchedule.id}`, { token: T.COORD, body: { status: 'ACTIVE' } });
  check('a completed one-off schedule cannot be resumed -> 409', r.status === 409, msg(r));

  // ---------- Due generation (lead time) ----------
  r = await req('POST', '/audit-schedules', { token: T.COORD, body: { ...baseSchedule, targetLocationIds: [locB.id], recurrence: 'DAILY', leadTimeDays: 2, scheduleCode: 'ISO-AUD-DAILY', title: 'ISO daily' } });
  const daily = r.data;
  if (daily?.id) created.schedules.push(daily.id);
  check('daily schedule creates today’s audit', r.status < 300 && (await instancesOf(daily.id)).length === 1, msg(r));
  r = await req('POST', '/audit-schedules/generate-due', { token: T.AUDITOR });
  check('auditor cannot run due generation -> 403', r.status === 403, msg(r));
  r = await req('POST', '/audit-schedules/generate-due', { token: T.COORD });
  const dailyCount = (await instancesOf(daily.id)).length;
  check('due generation fills the lead-time window', r.status === 200 && typeof r.data?.createdCount === 'number' && dailyCount === 3, `${msg(r)} ${dailyCount} audits`);
  const dates = (await instancesOf(daily.id)).map((i) => new Date(i.plannedDate).toISOString().slice(0, 10));
  check('one audit per day (no duplicates)', new Set(dates).size === dates.length, dates.join(','));
  r = await req('POST', '/audit-schedules/generate-due', { token: T.COORD });
  check('due generation is idempotent', r.status === 200 && (await instancesOf(daily.id)).length === dailyCount, `${(await instancesOf(daily.id)).length}`);
  const apexBefore = (await req('GET', '/audit-schedules/instances', { token: T.APEX })).data?.length;
  await req('POST', '/audit-schedules/generate-due', { token: T.COORD });
  check('due generation stays inside the organization', (await req('GET', '/audit-schedules/instances', { token: T.APEX })).data?.length === apexBefore);
} catch (err) {
  check('suite ran without an exception', false, err?.stack ?? String(err));
} finally {
  // ---------- Cleanup (submitted audits and their findings are removed by support/cleanup.cjs) ----------
  for (const id of created.executions) await req('DELETE', `/audit-executions/${id}`, { token: T.COORD });
  for (const id of created.schedules) await req('DELETE', `/audit-schedules/${id}`, { token: T.COORD });
  for (const id of created.templates.filter(Boolean)) await req('DELETE', `/audit-templates/${id}`, { token: T.COORD });
  for (const id of created.locations.filter(Boolean)) await req('DELETE', `/locations/${id}`, { token: T.COORD });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

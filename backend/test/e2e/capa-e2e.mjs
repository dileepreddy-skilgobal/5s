// W2: corrective actions (raise from observation / red tag / standalone, reassign, due date, timeline, verification
// rejection reason, closure without photo, list filters, delete), observations (repeat flag, deleted action) and red tags
// (holding area, approve / reject decision, actual disposition, past decide-by date, holding-area summary).
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
const STAMP = Date.now();
const DAY = 86400000;
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';

const T = {
  ADMIN: await login('admin@skilglobal.com'),
  COORD: await login('coordinator.5s@skilglobal.com'),
  DEPT: await login('depthead.machining@skilglobal.com'),
  OWNER: await login('owner.cnc01@skilglobal.com'),
  OWNER2: await login('owner.asm01@skilglobal.com'),
  AUDITOR: await login('auditor.lead@skilglobal.com'),
  EXEC: await login('executive@skilglobal.com'),
  APEX: await login('admin@apex-aero.com'),
};
const users = (await req('GET', '/users', { token: T.COORD })).data;
const userId = (email) => users.find((u) => u.email === email)?.id;
const OWNER_ID = userId('owner.cnc01@skilglobal.com');
const OWNER2_ID = userId('owner.asm01@skilglobal.com');

// Everything created here; removed in finally (the runner's cleanup also hard-deletes ISO- locations and their records)
const created = { locations: [], actions: [], observations: [], redTags: [] };
const initialPolicy = (await req('GET', '/corrective-actions/closure-policy', { token: T.COORD })).data;
let r;

try {
  // ---------- Fixtures ----------
  const node = (await req('GET', '/organization/nodes', { token: T.COORD })).data[0];
  r = await req('POST', '/locations', { token: T.COORD, body: { name: `ISO CAPA Cell ${STAMP}`, areaCode: `ISO-CAPA-${STAMP}`, orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId: OWNER_ID } });
  const loc = r.data;
  if (loc?.id) created.locations.push(loc.id);
  check('fixture location', r.status < 300 && !!loc?.id, msg(r));
  r = await req('POST', '/locations', { token: T.COORD, body: { name: `ISO CAPA Holding ${STAMP}`, areaCode: `ISO-CAPH-${STAMP}`, orgNodeId: node.id, locationType: 'RED_TAG_ZONE' } });
  const holding = r.data;
  if (holding?.id) created.locations.push(holding.id);
  check('fixture holding area', r.status < 300 && !!holding?.id, msg(r));

  // ================= Corrective actions: raise =================
  const standaloneBody = { locationId: loc.id, source: 'MANAGEMENT_REVIEW', severity: 'MAJOR', category: 'S2_SET_IN_ORDER', title: `ISO-capa standalone ${STAMP}`, description: 'ISO management review finding' };
  r = await req('POST', '/corrective-actions', { token: T.COORD, body: { ...standaloneBody, locationId: undefined } });
  check('standalone action without a location -> 400', r.status === 400, msg(r));
  r = await req('POST', '/corrective-actions', { token: T.COORD, body: { ...standaloneBody, severity: 'APOCALYPTIC' } });
  check('invalid severity -> 400', r.status === 400, msg(r));
  r = await req('POST', '/corrective-actions', { token: T.COORD, body: { ...standaloneBody, source: 'AUDIT' } });
  check('source other than MANAGEMENT_REVIEW cannot be chosen -> 400', r.status === 400, msg(r));
  r = await req('POST', '/corrective-actions', { token: T.COORD, body: { ...standaloneBody, title: '' } });
  check('empty title -> 400', r.status === 400, msg(r));
  r = await req('POST', '/corrective-actions', { token: T.OWNER, body: standaloneBody });
  check('area owner cannot raise an action -> 403', r.status === 403, msg(r));
  r = await req('POST', '/corrective-actions', { token: T.EXEC, body: standaloneBody });
  check('executive cannot raise an action -> 403', r.status === 403, msg(r));
  r = await req('POST', '/corrective-actions', { token: T.APEX, body: standaloneBody });
  check('other tenant cannot raise an action on our location -> 404', r.status === 404, msg(r));

  r = await req('POST', '/corrective-actions', { token: T.COORD, body: standaloneBody });
  const standalone = r.data;
  if (standalone?.id) created.actions.push(standalone.id);
  check('coordinator raises a standalone action', r.status < 300 && standalone?.status === 'ASSIGNED', msg(r));
  check('standalone action has source MANAGEMENT_REVIEW', standalone?.source === 'MANAGEMENT_REVIEW', standalone?.source);
  check('standalone action defaults to the area owner', standalone?.assigneeId === OWNER_ID, standalone?.assigneeId);
  check('a finding was created for it with the chosen severity and pillar', standalone?.observation?.severity === 'MAJOR' && standalone?.observation?.category === 'S2_SET_IN_ORDER', JSON.stringify(standalone?.observation?.severity));
  check('coordinator may reassign and reschedule it', ['REASSIGN', 'RESCHEDULE', 'DELETE'].every((s) => standalone?.allowedActions?.includes(s)), JSON.stringify(standalone?.allowedActions));

  // From an observation
  r = await req('POST', '/observations', { token: T.OWNER, body: { locationId: loc.id, category: 'S3_SHINE', severity: 'MINOR', title: `ISO-oil leak under press ${STAMP}`, description: 'ISO oil on floor' } });
  const obs = r.data;
  if (obs?.id) created.observations.push(obs.id);
  check('area owner logs an observation', r.status < 300 && !!obs?.id, msg(r));
  r = await req('POST', '/corrective-actions', { token: T.DEPT, body: { observationId: obs.id, locationId: loc.id, title: 'ISO-fix oil leak', description: 'Replace the seal' } });
  const fromObs = r.data;
  if (fromObs?.id) created.actions.push(fromObs.id);
  check('dept head raises an action from the observation', r.status < 300 && fromObs?.observationId === obs.id, msg(r));
  check('action from a shop-floor observation has source OBSERVATION', fromObs?.source === 'OBSERVATION', fromObs?.source);
  r = await req('POST', '/corrective-actions', { token: T.DEPT, body: { observationId: obs.id, title: 'ISO-dup', description: 'dup' } });
  check('second action for the same observation -> 409', r.status === 409, msg(r));
  r = await req('GET', `/observations/${obs.id}`, { token: T.OWNER });
  check('observation shows the action and ACTION_ASSIGNED', r.data?.correctiveAction?.id === fromObs?.id && r.data?.status === 'ACTION_ASSIGNED', `${r.data?.status}`);

  // From a red tag
  r = await req('POST', '/red-tags', { token: T.OWNER, body: { locationId: loc.id, itemName: `ISO-broken trolley ${STAMP}`, category: 'BROKEN_EQUIPMENT', reason: 'ISO keeps coming back', quantity: 1 } });
  const tag = r.data;
  if (tag?.id) created.redTags.push(tag.id);
  check('area owner raises a red tag', r.status < 300 && !!tag?.id, msg(r));
  r = await req('POST', '/corrective-actions', { token: T.COORD, body: { redTagId: tag.id, severity: 'MODERATE', title: 'ISO-stop broken trolleys reaching the line', description: 'ISO root cause of the red tag' } });
  const fromTag = r.data;
  if (fromTag?.id) created.actions.push(fromTag.id);
  check('coordinator raises an action from the red tag', r.status < 300 && fromTag?.source === 'RED_TAG' && fromTag?.redTagId === tag.id, msg(r));
  check('red-tag action is at the tag location and links back to the tag', fromTag?.locationId === loc.id && fromTag?.redTag?.id === tag.id, `${fromTag?.locationId === loc.id} ${fromTag?.redTag?.tagNumber}`);
  r = await req('POST', '/corrective-actions', { token: T.COORD, body: { redTagId: tag.id, title: 'ISO-dup', description: 'dup' } });
  check('second open action for the same red tag -> 409', r.status === 409, msg(r));
  r = await req('GET', `/red-tags/${tag.id}`, { token: T.OWNER });
  check('red tag shows its corrective action', r.data?.correctiveAction?.id === fromTag?.id, JSON.stringify(r.data?.correctiveAction));
  r = await req('POST', '/corrective-actions', { token: T.APEX, body: { redTagId: tag.id, title: 'x', description: 'x' } });
  check('other tenant cannot raise an action from our red tag -> 404', r.status === 404, msg(r));

  // ================= List filters =================
  r = await req('GET', `/corrective-actions?locationId=${loc.id}&source=RED_TAG`, { token: T.COORD });
  check('source filter', r.status === 200 && r.data.length === 1 && r.data[0].id === fromTag?.id, r.data?.map((a) => a.source).join(','));
  r = await req('GET', `/corrective-actions?locationId=${loc.id}&severity=MAJOR`, { token: T.COORD });
  check('severity filter (finding severity)', r.status === 200 && r.data.length === 1 && r.data[0].id === standalone?.id, r.data?.length);
  r = await req('GET', `/corrective-actions?locationId=${loc.id}&isOverdue=1`, { token: T.COORD });
  check('overdue filter (none of the new actions is overdue)', r.status === 200 && r.data.length === 0, r.data?.length);
  r = await req('GET', `/corrective-actions?locationId=${loc.id}&escalationTier=NORMAL`, { token: T.COORD });
  check('escalation tier filter', r.status === 200 && r.data.length === 3, r.data?.length);
  r = await req('GET', `/corrective-actions?locationId=${loc.id}`, { token: T.APEX });
  check('other tenant sees none of our actions', r.status === 200 && r.data.length === 0, r.data?.length);

  // ================= Reassign =================
  r = await req('POST', `/corrective-actions/${standalone.id}/reassign`, { token: T.OWNER, body: { assigneeId: OWNER2_ID } });
  check('assignee cannot reassign -> 403', r.status === 403, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/reassign`, { token: T.COORD, body: {} });
  check('reassign without assignee -> 400', r.status === 400, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/reassign`, { token: T.COORD, body: { assigneeId: '00000000-0000-0000-0000-000000000000' } });
  check('reassign to an unknown user -> 404', r.status === 404, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/reassign`, { token: T.APEX, body: { assigneeId: OWNER2_ID } });
  check('other tenant cannot reassign -> 404', r.status === 404, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/reassign`, { token: T.COORD, body: { assigneeId: OWNER2_ID, reason: 'ISO handover' } });
  check('coordinator reassigns to another owner', r.status < 300 && r.data?.assigneeId === OWNER2_ID, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/reassign`, { token: T.COORD, body: { assigneeId: OWNER2_ID } });
  check('reassign to the current assignee -> 409', r.status === 409, msg(r));
  r = await req('PATCH', `/corrective-actions/${standalone.id}`, { token: T.OWNER2, body: { assigneeId: OWNER_ID } });
  check('assignee cannot reassign through PATCH -> 403', r.status === 403, msg(r));

  // ================= Due date =================
  const newDue = new Date(Date.now() + 20 * DAY).toISOString();
  r = await req('POST', `/corrective-actions/${standalone.id}/due-date`, { token: T.COORD, body: { targetDate: newDue } });
  check('due date change without a reason -> 400', r.status === 400, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/due-date`, { token: T.COORD, body: { targetDate: new Date(Date.now() - DAY).toISOString(), reason: 'ISO' } });
  check('due date in the past -> 400', r.status === 400, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/due-date`, { token: T.OWNER2, body: { targetDate: newDue, reason: 'ISO' } });
  check('assignee cannot move the due date -> 403', r.status === 403, msg(r));
  r = await req('PATCH', `/corrective-actions/${standalone.id}`, { token: T.OWNER2, body: { targetDate: newDue } });
  check('assignee cannot move the due date through PATCH -> 403', r.status === 403, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/due-date`, { token: T.COORD, body: { targetDate: newDue, reason: 'ISO spare part late' } });
  check('coordinator moves the due date', r.status < 300 && new Date(r.data?.targetDate).toISOString() === newDue, msg(r));

  // ================= Timeline =================
  r = await req('GET', `/corrective-actions/${standalone.id}/timeline`, { token: T.OWNER2 });
  const kinds = (r.data ?? []).map((e) => e.kind);
  check('timeline lists creation, reassignment and due-date change in order', r.status === 200 && kinds[0] === 'CREATED' && kinds.indexOf('REASSIGNED') > 0 && kinds.indexOf('DUE_DATE_CHANGED') > kinds.indexOf('REASSIGNED'), kinds.join(','));
  const move = (r.data ?? []).find((e) => e.kind === 'REASSIGNED');
  check('reassignment entry records from / to and the reason', move?.fromAssigneeId === OWNER_ID && move?.toAssigneeId === OWNER2_ID && move?.reason === 'ISO handover', JSON.stringify(move));
  const due = (r.data ?? []).find((e) => e.kind === 'DUE_DATE_CHANGED');
  check('due-date entry records the new date and the reason', due?.toTargetDate === newDue && due?.reason === 'ISO spare part late', JSON.stringify(due));
  r = await req('GET', `/corrective-actions/${standalone.id}/timeline`, { token: T.APEX });
  check('other tenant cannot read the timeline -> 404', r.status === 404, msg(r));

  // ================= Closure evidence & verification rejection =================
  r = await req('PATCH', `/corrective-actions/${standalone.id}/5-why`, { token: T.OWNER2, body: { why1: 'ISO no fixed place', solution: 'ISO shadow board' } });
  check('assignee records root cause and solution', r.status < 300, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/submit-closure`, { token: T.OWNER2, body: { closureNotes: 'ISO shadow board installed' } });
  check('closure without an after photo (not allowed by default) -> 400', initialPolicy?.allowClosureWithoutPhoto === true || r.status === 400, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/submit-closure`, { token: T.OWNER2, body: { closureNotes: 'ISO shadow board installed', afterPhotoUrl: TINY_PNG } });
  check('assignee submits closure evidence', r.status < 300 && r.data?.status === 'PENDING_VERIFICATION', msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/verify`, { token: T.AUDITOR, body: { approved: false } });
  check('rejection without a reason -> 400', r.status === 400, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/verify`, { token: T.AUDITOR, body: { approved: false, verificationNotes: '   ' } });
  check('rejection with a blank reason -> 400', r.status === 400, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/verify`, { token: T.EXEC, body: { approved: false, verificationNotes: 'x' } });
  check('executive cannot verify -> 403', r.status === 403, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/verify`, { token: T.AUDITOR, body: { approved: false, verificationNotes: 'ISO board missing two tools' } });
  check('verifier rejects with a reason -> REOPENED', r.status < 300 && r.data?.status === 'REOPENED', msg(r));
  r = await req('GET', `/corrective-actions/${standalone.id}`, { token: T.OWNER2 });
  check('assignee sees the rejection reason', r.data?.verificationNotes === 'ISO board missing two tools', r.data?.verificationNotes);
  r = await req('GET', `/corrective-actions/${standalone.id}/timeline`, { token: T.OWNER2 });
  const rejection = (r.data ?? []).find((e) => e.kind === 'VERIFICATION_REJECTED');
  check('timeline records the rejection and its reason', rejection?.reason === 'ISO board missing two tools', JSON.stringify(rejection));

  // Closure without photo, when the organization allows it
  r = await req('PATCH', '/settings', { token: T.ADMIN, body: { capa: { allowClosureWithoutPhoto: true } } });
  const policy = (await req('GET', '/corrective-actions/closure-policy', { token: T.OWNER2 })).data;
  check('closure policy reflects the organization setting', r.status < 300 && policy?.allowClosureWithoutPhoto === true, `${msg(r)} ${JSON.stringify(policy)}`);
  r = await req('POST', `/corrective-actions/${standalone.id}/submit-closure`, { token: T.OWNER2, body: { closureNotes: 'ISO tools added' } });
  check('closure without photo and without a justification -> 400', r.status === 400, msg(r));
  r = await req('POST', `/corrective-actions/${standalone.id}/submit-closure`, { token: T.OWNER2, body: { closureNotes: 'ISO tools added', noPhotoJustification: 'ISO camera not allowed in clean room' } });
  check('closure without photo with a justification is accepted', r.status < 300 && r.data?.status === 'PENDING_VERIFICATION' && !r.data?.afterPhotoUrl && /ISO camera not allowed/.test(r.data?.closureNotes ?? ''), msg(r));
  await req('PATCH', '/settings', { token: T.ADMIN, body: { capa: { allowClosureWithoutPhoto: initialPolicy?.allowClosureWithoutPhoto === true } } });
  r = await req('POST', `/corrective-actions/${standalone.id}/reassign`, { token: T.COORD, body: { assigneeId: OWNER_ID } });
  check('reassign after evidence was submitted -> 409', r.status === 409, msg(r));

  // ================= Delete =================
  r = await req('DELETE', `/corrective-actions/${fromObs.id}`, { token: T.AUDITOR });
  check('auditor cannot delete an action -> 403', r.status === 403, msg(r));
  r = await req('DELETE', `/corrective-actions/${fromObs.id}`, { token: T.APEX });
  check('other tenant cannot delete our action -> 404', r.status === 404, msg(r));
  r = await req('DELETE', `/corrective-actions/${fromObs.id}`, { token: T.COORD });
  check('coordinator deletes the observation action', r.status < 300 && r.data?.deleted === true, msg(r));
  r = await req('GET', `/corrective-actions/${fromObs.id}`, { token: T.COORD });
  check('deleted action is gone -> 404', r.status === 404, msg(r));
  r = await req('GET', `/observations/${obs.id}`, { token: T.COORD });
  check('observation is open again and reports the deleted action', r.data?.status === 'OPEN' && r.data?.correctiveAction === null && r.data?.hasDeletedAction === true, `${r.data?.status} ${r.data?.hasDeletedAction}`);
  r = await req('POST', '/corrective-actions', { token: T.COORD, body: { observationId: obs.id, title: 'ISO-again', description: 'again' } });
  check('raising again on an observation held by a deleted action -> 409', r.status === 409, msg(r));
  const tagFinding = fromTag?.observationId;
  r = await req('DELETE', `/corrective-actions/${fromTag.id}`, { token: T.COORD });
  check('coordinator deletes the red-tag action', r.status < 300, msg(r));
  r = await req('GET', `/observations/${tagFinding}`, { token: T.COORD });
  check('the finding created for the red-tag action goes with it -> 404', r.status === 404, msg(r));

  // ================= Observations: repeat flag =================
  r = await req('POST', '/observations', { token: T.OWNER, body: { locationId: loc.id, category: 'S3_SHINE', severity: 'MINOR', title: `ISO-oil leak under press ${STAMP}`, description: 'ISO oil again' } });
  const repeat = r.data;
  if (repeat?.id) created.observations.push(repeat.id);
  check('same issue again is flagged as a repeat', r.status < 300 && repeat?.isRepeat === true && repeat?.repeatOf?.id === obs.id, `${repeat?.isRepeat} ${repeat?.repeatOf?.id === obs.id}`);
  r = await req('GET', `/observations?locationId=${loc.id}&repeat=1`, { token: T.EXEC });
  check('repeat filter returns only repeats', r.status === 200 && r.data.length >= 1 && r.data.every((o) => o.isRepeat), r.data?.length);
  r = await req('GET', `/observations?repeat=1&locationId=${loc.id}`, { token: T.APEX });
  check('other tenant sees none of our repeats', r.status === 200 && r.data.length === 0, r.data?.length);

  // ================= Red tags =================
  r = await req('POST', `/red-tags/${tag.id}/move-to-holding`, { token: T.OWNER, body: {} });
  check('move without a holding area -> 400', r.status === 400, msg(r));
  r = await req('POST', `/red-tags/${tag.id}/move-to-holding`, { token: T.AUDITOR, body: { holdingAreaId: holding.id } });
  check('auditor cannot move a tag -> 403', r.status === 403, msg(r));
  r = await req('POST', `/red-tags/${tag.id}/move-to-holding`, { token: T.EXEC, body: { holdingAreaId: holding.id } });
  check('executive cannot move a tag -> 403', r.status === 403, msg(r));
  r = await req('POST', `/red-tags/${tag.id}/move-to-holding`, { token: T.APEX, body: { holdingAreaId: holding.id } });
  check('other tenant cannot move our tag -> 404', r.status === 404, msg(r));
  r = await req('POST', `/red-tags/${tag.id}/move-to-holding`, { token: T.OWNER, body: { holdingAreaId: '00000000-0000-0000-0000-000000000000' } });
  check('unknown holding area -> 404', r.status === 404, msg(r));
  r = await req('POST', `/red-tags/${tag.id}/move-to-holding`, { token: T.OWNER, body: { holdingAreaId: holding.id } });
  check('area owner moves the tag to the holding area', r.status < 300 && r.data?.status === 'IN_HOLDING_AREA' && r.data?.holdingArea?.id === holding.id, msg(r));
  r = await req('GET', '/red-tags/metrics', { token: T.EXEC });
  const hold = (r.data?.holdingAreaBreakdown ?? []).find((h) => h.holdingAreaId === holding.id);
  check('metrics break open tags down by holding area', r.status === 200 && hold?.openTags === 1, JSON.stringify(hold));

  r = await req('POST', `/red-tags/${tag.id}/disposition/approve`, { token: T.DEPT });
  check('approve when no decision is pending -> 409', r.status === 409, msg(r));
  r = await req('POST', `/red-tags/${tag.id}/disposition`, { token: T.OWNER, body: { dispositionAction: 'AUCTION_SELL', dispositionJustification: 'ISO sell it', supervisorApproved: false } });
  check('area owner proposes a decision', r.status < 300 && r.data?.status === 'PENDING_DISPOSITION', msg(r));
  r = await req('POST', `/red-tags/${tag.id}/disposition/approve`, { token: T.OWNER });
  check('area owner cannot approve -> 403', r.status === 403, msg(r));
  r = await req('POST', `/red-tags/${tag.id}/disposition/reject`, { token: T.DEPT, body: {} });
  check('reject without a reason -> 400', r.status === 400, msg(r));
  r = await req('POST', `/red-tags/${tag.id}/disposition/reject`, { token: T.APEX, body: { reason: 'x' } });
  check('other tenant cannot reject -> 404', r.status === 404, msg(r));
  r = await req('POST', `/red-tags/${tag.id}/disposition/reject`, { token: T.DEPT, body: { reason: 'ISO repair is cheaper' } });
  check('dept head rejects with a reason; tag waits in the holding area', r.status < 300 && r.data?.status === 'IN_HOLDING_AREA' && r.data?.dispositionRejectionReason === 'ISO repair is cheaper', msg(r));
  r = await req('POST', `/red-tags/${tag.id}/disposition`, { token: T.OWNER, body: { dispositionAction: 'SCRAP_RECYCLE', dispositionJustification: 'ISO scrap it', supervisorApproved: false } });
  check('a new decision (scrap) can be proposed', r.status < 300 && r.data?.status === 'PENDING_DISPOSITION' && r.data?.dispositionAction === 'SCRAP_RECYCLE', msg(r));
  r = await req('POST', `/red-tags/${tag.id}/disposition/approve`, { token: T.DEPT });
  check('dept head approves; approver recorded and rejection cleared', r.status < 300 && r.data?.status === 'DISPOSITION_APPROVED' && !!r.data?.supervisorApprovedBy && r.data?.dispositionRejectionReason === null, msg(r));
  r = await req('POST', `/red-tags/${tag.id}/close`, { token: T.DEPT, body: { actualDispositionAction: 'BURN_IT' } });
  check('unknown actual disposition -> 400', r.status === 400, msg(r));
  r = await req('POST', `/red-tags/${tag.id}/close`, { token: T.DEPT, body: {} });
  check('closing a scrap decision without a photo -> 400', r.status === 400, msg(r));
  r = await req('POST', `/red-tags/${tag.id}/close`, { token: T.DEPT, body: { actualDispositionAction: 'REPAIR_RESTORE' } });
  check('actual disposition (repaired instead) closes as returned', r.status < 300 && r.data?.status === 'RETURNED' && r.data?.actualDispositionAction === 'REPAIR_RESTORE' && !!r.data?.actualDispositionDate, msg(r));

  // Past the decide-by date
  r = await req('POST', '/red-tags', { token: T.OWNER, body: { locationId: loc.id, itemName: `ISO-old pallet ${STAMP}`, category: 'SURPLUS_INVENTORY', reason: 'ISO surplus', quantity: 2, targetDispositionDate: new Date(Date.now() - 3 * DAY).toISOString() } });
  const late = r.data;
  if (late?.id) created.redTags.push(late.id);
  check('tag with a past decide-by date is flagged', r.status < 300 && late?.isPastTarget === true && late?.daysPastTarget >= 3, `${late?.isPastTarget} ${late?.daysPastTarget}`);
  r = await req('GET', '/red-tags?overdue=1', { token: T.EXEC });
  check('overdue filter returns only tags past their decide-by date', r.status === 200 && r.data.some((t) => t.id === late?.id) && r.data.every((t) => t.isPastTarget), r.data?.length);
  r = await req('GET', '/red-tags/metrics', { token: T.COORD });
  check('metrics count tags past their decide-by date', r.status === 200 && r.data?.pastTargetCount >= 1, r.data?.pastTargetCount);
  r = await req('GET', '/red-tags?overdue=1', { token: T.APEX });
  check('other tenant does not see our late tag', r.status === 200 && !r.data.some((t) => t.id === late?.id), r.data?.length);
} catch (err) {
  check('suite ran without throwing', false, err?.stack ?? String(err));
} finally {
  // Best-effort API cleanup; the runner's cleanup script hard-deletes the ISO- locations and everything at them
  await req('PATCH', '/settings', { token: T.ADMIN, body: { capa: { allowClosureWithoutPhoto: initialPolicy?.allowClosureWithoutPhoto === true } } });
  for (const id of created.actions) await req('DELETE', `/corrective-actions/${id}`, { token: T.COORD });
  for (const id of created.redTags) await req('DELETE', `/red-tags/${id}`, { token: T.COORD });
  for (const id of created.observations) await req('DELETE', `/observations/${id}`, { token: T.COORD });
  for (const id of created.locations) await req('DELETE', `/locations/${id}`, { token: T.COORD });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

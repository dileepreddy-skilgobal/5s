// Exercises the mobile app's real scoring/payload/QR modules against the live backend.
const path = require('path');
// Compiled mobile services (the runner builds them into test/e2e/.mobile-lib)
const lib = path.join(process.env.MOBILE_LIB_DIR || path.join(__dirname, '.mobile-lib'), 'services');
const { computeScores, buildSubmission } = require(path.join(lib, 'auditScoring.js'));
const { matchLocationQr, parseLocationQr } = require(path.join(lib, 'qrPayload.js'));

const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, p, { token, body } = {}) => {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data, json };
};
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

(async () => {
  // Sign in exactly as the app does
  const pin = await req('POST', '/auth/pin-login', { body: { badgeId: 'BADGE-AUD-001', pin: '7766' } });
  const AUD = pin.data.accessToken;
  const tenant = pin.data.tenant;
  check('PIN sign-in returns session', !!AUD && tenant.slug === 'skilglobal-mfg');
  const COORD = (await req('POST', '/auth/login', { body: { email: 'coordinator.5s@skilglobal.com', password: 'Admin@123456' } })).data.accessToken;
  const OWNER = (await req('POST', '/auth/pin-login', { body: { badgeId: 'BADGE-OP-049', pin: '5544' } })).data.accessToken;

  // Same endpoints the app uses for its workspace
  for (const p of ['/locations?status=ACTIVE', '/audit-executions', '/audit-schedules/instances?status=SCHEDULED', '/audit-templates?status=ACTIVE']) {
    const r = await req('GET', p, { token: AUD });
    check(`workspace load ${p}`, r.status === 200 && Array.isArray(r.data), r.status);
  }

  // Template snapshot (same mapping as api.ts toSnapshot)
  const list = (await req('GET', '/audit-templates?status=ACTIVE', { token: AUD })).data;
  let tpl = null;
  for (const t of list) {
    const d = (await req('GET', `/audit-templates/${t.id}`, { token: AUD })).data;
    if (d.currentVersion?.sections?.filter((s) => s.questions.length).length >= 1 && d.currentVersion.sections.flatMap((s) => s.questions).length >= 3) { tpl = d; break; }
  }
  const snapshot = {
    templateId: tpl.id, templateVersionId: tpl.currentVersion.id, code: tpl.code, name: tpl.name, versionNumber: tpl.currentVersion.versionNumber,
    sections: tpl.currentVersion.sections.map((s) => ({ id: s.id, title: s.title, category: s.category, questions: s.questions.map((q) => ({
      id: q.id, sectionId: s.id, category: s.category, code: q.questionCode, text: q.questionText, weightage: q.weightage, isCritical: q.isCritical,
      scoreCapOnFail: q.scoreCapOnFail ?? null, mandatoryEvidence: q.mandatoryEvidence })) })),
  };
  const questions = snapshot.sections.flatMap((s) => s.questions);
  check('template snapshot has questions', questions.length >= 3, questions.length);

  // Fixture area
  const node = (await req('GET', '/organization/nodes', { token: COORD })).data[0];
  const loc = (await req('POST', '/locations', { token: COORD, body: { name: 'ISO Mobile Cell', areaCode: 'ISO-MOB-LOC', orgNodeId: node.id, locationType: 'PRODUCTION_LINE' } })).data;

  // QR matching with the app's parser
  const locations = [{ id: loc.id, code: loc.areaCode }];
  check('QR 5s://tenant/locations/CODE matches', matchLocationQr(`5s://${tenant.slug}/locations/ISO-MOB-LOC`, locations, tenant).kind === 'MATCH');
  check('QR batch format (singular) matches', matchLocationQr(`5s://${tenant.id}/location/iso-mob-loc`, locations, tenant).kind === 'MATCH');
  check('QR JSON payload matches', matchLocationQr(JSON.stringify({ type: '5S_LOCATION_AUDIT', areaCode: 'ISO-MOB-LOC' }), locations, tenant).kind === 'MATCH');
  check('QR other tenant rejected', matchLocationQr('5s://apex-aero/locations/ISO-MOB-LOC', locations, tenant).kind === 'OTHER_TENANT');
  check('QR unknown code not invented', matchLocationQr('ISO-NOPE', locations, tenant).kind === 'UNKNOWN');
  check('QR substring no longer matches', matchLocationQr('ISO-MOB', locations, tenant).kind === 'UNKNOWN');
  check('QR garbage invalid', parseLocationQr('hello world') === null);

  // Start (as the sync engine does) with the exact template version
  const started = await req('POST', '/audit-executions/start', { token: AUD, body: { locationId: loc.id, templateId: snapshot.templateId, templateVersionId: snapshot.templateVersionId, auditorName: 'Amit Joshi' } });
  check('start execution', started.status < 300, started.status + ' ' + JSON.stringify(started.json?.message ?? ''));
  const execId = started.data.id;

  // Answers: Q1 N/A, Q2 rated 4 with a MAJOR finding + photo, rest rated 5
  const answers = {};
  questions.forEach((q, i) => {
    answers[q.id] = { questionId: q.id, sectionId: q.sectionId, category: q.category, score: 5, isNa: false, comment: '', evidence: q.mandatoryEvidence ? [{ id: 'e', uri: 'x', dataUrl: TINY_JPEG, timestamp: '', annotations: [] }] : [] };
  });
  answers[questions[0].id] = { ...answers[questions[0].id], isNa: true, evidence: [] };
  answers[questions[1].id] = { ...answers[questions[1].id], score: 4, finding: { severity: 'MAJOR', description: 'ISO oil leak under press' }, evidence: [{ id: 'e2', uri: 'x', dataUrl: TINY_JPEG, timestamp: '', annotations: [] }] };
  const local = computeScores(snapshot, answers);
  const payload = buildSubmission(snapshot, answers, { name: 'Amit Joshi' }, 'ISO mobile test');
  check('payload sends every question with sectionId', payload.answers.length === questions.length && payload.answers.every((a) => a.sectionId));
  check('N/A answer has zero weight', payload.answers[0].maxScore === 0 && payload.answers[0].status === 'NOT_APPLICABLE');

  const submitted = await req('POST', `/audit-executions/${execId}/submit`, { token: AUD, body: payload });
  check('submit accepted by server', submitted.status < 300, submitted.status + ' ' + JSON.stringify(submitted.json?.message ?? ''));
  const detail = (await req('GET', `/audit-executions/${execId}`, { token: AUD })).data;
  check('server score matches phone score', Math.abs(detail.overallScore - local.percentage) < 0.15, `server ${detail.overallScore} / phone ${local.percentage}`);
  check('only the raised finding became an observation (N/A ignored)', detail.observations.length === 1, detail.observations.length);
  check('finding description reached the server', /ISO oil leak/.test(detail.observations[0]?.description || ''));
  const evidenceUrl = (JSON.stringify(detail.answers).match(/https?:\/\/[^"]*?\/api\/v1\/files\/[0-9a-f-]{36}[^"]*/) || [])[0];
  check('photo evidence moved to file storage (signed link, no base64)', !!evidenceUrl && !JSON.stringify(detail.answers).includes('data:image'), evidenceUrl);
  const evidence = evidenceUrl ? await fetch(evidenceUrl) : null;
  check('evidence link serves the JPEG', evidence?.status === 200 && evidence.headers.get('content-type') === 'image/jpeg', evidence?.status);

  const again = await req('POST', `/audit-executions/${execId}/submit`, { token: AUD, body: payload });
  check('resubmit -> 409 (sync engine treats as done)', again.status === 409, again.status);

  // Red tag as the app sends it (area owner proposes a disposition)
  const rt = await req('POST', '/red-tags', { token: OWNER, body: { locationId: loc.id, itemName: 'ISO spare bracket', category: 'SURPLUS_INVENTORY', quantity: 2, unitOfMeasure: 'PCS', estimatedValue: 0, reason: 'Not used', photoUrl: TINY_JPEG } });
  check('red tag created with photo and value 0 kept', rt.status < 300 && rt.data?.estimatedValue === 0, rt.status + ' ' + JSON.stringify(rt.json?.message ?? ''));
  const disp = await req('POST', `/red-tags/${rt.data.id}/disposition`, { token: OWNER, body: { dispositionAction: 'RELOCATE', dispositionJustification: 'Move to stores', supervisorApproved: false } });
  check('area owner disposition proposal accepted', disp.status < 300 && disp.data?.status === 'PENDING_DISPOSITION', disp.status);

  console.log(`\n${pass} passed, ${fail} failed`);
})().catch((e) => { console.error(e); process.exit(1); });

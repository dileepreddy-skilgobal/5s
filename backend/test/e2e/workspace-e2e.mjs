// R9: global search, duplicate checks, onboarding checklist, bulk imports. Run from backend dir.
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const db = new PrismaClient();
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
const ADMIN = await login('admin@skilglobal.com');
const COORD = await login('coordinator.5s@skilglobal.com');
const OWNER = await login('owner.cnc01@skilglobal.com');
const stamp = Date.now();

// ---------- Search ----------
let r = await req('GET', '/search?q=CNC', { token: OWNER });
check('search finds locations by name', r.status === 200 && r.data.results.some((x) => x.type === 'locations' && /CNC/i.test(x.title)), msg(r));
check('every hit has a link', r.data.results.every((x) => x.link?.startsWith('/')));
check('short query -> 400', (await req('GET', '/search?q=a', { token: OWNER })).status === 400);
r = await req('GET', '/search?q=CNC&types=actions', { token: OWNER });
check('type filter', r.data.results.every((x) => x.type === 'actions'));
r = await req('GET', '/search?q=Titan', { token: OWNER });
check('other tenants are never searched', !r.data.results.some((x) => /Titan/i.test(x.title)), r.data.results.map((x) => x.title).join(','));

// ---------- Duplicates ----------
const users = (await req('GET', '/users', { token: ADMIN })).data;
const owner = users.find((u) => u.email === 'owner.cnc01@skilglobal.com');
const node = (await req('GET', '/organization/nodes', { token: COORD })).data[0];
const loc = (await req('POST', '/locations', { token: COORD, body: { name: 'ISO Workspace Cell', areaCode: `iso-ws-${stamp % 100000}`, orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId: owner.id } })).data;
await req('POST', '/observations', { token: OWNER, body: { locationId: loc.id, title: 'Oil leak under hydraulic press', description: 'x', category: 'S3_SHINE', severity: 'MAJOR' } });
r = await req('GET', `/duplicates/observations?locationId=${loc.id}&title=${encodeURIComponent('Hydraulic press oil leak')}`, { token: OWNER });
check('similar open observation found', r.status === 200 && r.data.length === 1 && r.data[0].similarity >= 0.5, JSON.stringify(r.data));
r = await req('GET', `/duplicates/observations?locationId=${loc.id}&title=${encodeURIComponent('Missing floor marking near exit')}`, { token: OWNER });
check('unrelated title -> no duplicate', r.data.length === 0);
await req('POST', '/red-tags', { token: OWNER, body: { locationId: loc.id, itemName: 'Spare torque wrench', itemDescription: 'x', category: 'UNNEEDED_TOOL', reason: 'unused', quantity: 1 } });
r = await req('GET', `/duplicates/red-tags?locationId=${loc.id}&itemName=${encodeURIComponent('torque wrench spare')}`, { token: OWNER });
check('similar active red tag found', r.data.length === 1, JSON.stringify(r.data));
r = await req('GET', `/duplicates/locations?name=${encodeURIComponent('ISO Workspace Cell')}`, { token: COORD });
check('same-name location found', r.data.some((x) => x.id === loc.id));

// ---------- Onboarding checklist ----------
r = await req('GET', '/onboarding/checklist', { token: COORD });
check('checklist computed from data', r.status === 200 && r.data.total === 13 && r.data.steps.find((s) => s.key === 'locations').done === true, `${r.data?.completed}/${r.data?.total}`);
check('checklist restricted', (await req('GET', '/onboarding/checklist', { token: OWNER })).status === 403);

// ---------- Imports: catalogue & templates ----------
r = await req('GET', '/imports/catalogue', { token: ADMIN });
check('import catalogue', r.data.map((x) => x.kind).join(',') === 'org-nodes,locations,users,questions,standards,actions', r.data?.map?.((x) => x.kind).join(','));
const tplRes = await fetch(`${B}/imports/template/users`, { headers: { Authorization: `Bearer ${ADMIN}` } });
const wb = XLSX.read(Buffer.from(await tplRes.arrayBuffer()), { type: 'buffer' });
check('template workbook with instructions', wb.SheetNames.includes('Instructions') && XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0][0] === 'Email', wb.SheetNames.join(','));
check('imports restricted to admins', (await req('GET', '/imports/catalogue', { token: COORD })).status === 403);
check('unknown import kind -> 404', (await req('POST', '/imports/salaries/dry-run', { token: ADMIN, body: { rows: [{}] } })).status === 404);

// ---------- Users ----------
const goodEmail = `iso-softdel-imp1-${stamp}@example.com`;
const goodEmail2 = `iso-softdel-imp2-${stamp}@example.com`;
const sheet = XLSX.utils.aoa_to_sheet([
  ['Email', 'First Name', 'LastName', 'RoleCode', 'BadgeId'],
  [goodEmail, 'Iso', 'One', 'AUDITOR', `ISO-B-${stamp}`],
  ['not-an-email', 'Bad', 'Row', 'AUDITOR', ''],
  ['admin@skilglobal.com', 'Dup', 'Existing', 'EMPLOYEE', ''],
  [goodEmail, 'Dup', 'InFile', 'EMPLOYEE', ''],
  [goodEmail2, 'Iso', 'Two', 'WIZARD', ''],
]);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, 'Users');
const form = new FormData();
form.append('file', new Blob([XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })]), 'users.xlsx');
r = await fetch(`${B}/imports/users/dry-run`, { method: 'POST', headers: { Authorization: `Bearer ${ADMIN}` }, body: form }).then(async (x) => ({ status: x.status, data: (await x.json()).data }));
const fields = r.data.errors.map((e) => `${e.rowNumber}:${e.field}`).sort().join(' ');
check('spreadsheet parsed (flexible headers)', r.status === 201 && r.data.totalRows === 5 && r.data.parsedData[0].firstName === 'Iso', `${r.status} ${r.data?.totalRows}`);
check('row-level errors reported', fields === '3:Email 4:Email 5:Email 6:RoleCode', fields);
r = await req('POST', '/imports/users/commit', { token: ADMIN, body: { rows: r.data.parsedData } });
check('commit refuses invalid rows with per-row errors (nothing written)', r.status === 400 && r.json?.errors?.length === 4 && (await db.user.count({ where: { email: goodEmail } })) === 0, msg(r));
r = await req('POST', '/imports/users/commit', { token: ADMIN, body: { rows: [{ email: goodEmail, firstName: 'Iso', lastName: 'One', roleCode: 'AUDITOR' }, { email: goodEmail2, firstName: 'Iso', lastName: 'Two', roleCode: 'EMPLOYEE' }] } });
check('valid users imported and invited', r.status === 201 && r.data.created === 2 && r.data.invitationsSent === 2, msg(r) + JSON.stringify(r.data));
const imported = await db.user.findFirst({ where: { email: goodEmail }, include: { assignments: { include: { role: true } }, passwordResets: true } });
check('role assigned and 72h invitation token issued', imported.assignments[0]?.role.code === 'AUDITOR' && imported.passwordResets.length === 1 && Math.round((imported.passwordResets[0].expiresAt - Date.now()) / 3600000) === 72);
check('imported user cannot sign in before choosing a password', (await req('POST', '/auth/login', { body: { email: goodEmail, password: 'IsoPass@12345' } })).status === 401);

// ---------- Questions ----------
const tpl = (await req('POST', '/audit-templates', { token: COORD, body: { code: `ISO-TPL-${stamp}`, name: 'ISO Import Template', auditType: 'ROUTINE' } })).data;
r = await req('POST', '/imports/questions/dry-run', { token: ADMIN, body: { rows: [
  { templateCode: tpl.code, sectionTitle: 'Sort – unneeded items', pillar: 'S1_SORT', questionCode: 'iso-q1', questionText: 'Only required tools at the station?', weightage: '2', isCritical: 'Y' },
  { templateCode: tpl.code, sectionTitle: 'Sort – unneeded items', pillar: 'S1_SORT', questionCode: 'ISO-Q1', questionText: 'Duplicate code' },
  { templateCode: 'NO-SUCH-TPL', sectionTitle: 'x', pillar: 'S9_FLY', questionCode: 'Q', questionText: 'x', weightage: '50' },
] } });
check('question validation (duplicate code, unknown template, bad pillar, weight)', r.data.errorCount === 4, r.data.errors.map((e) => `${e.rowNumber}:${e.field}`).join(' '));
r = await req('POST', '/imports/questions/commit', { token: ADMIN, body: { rows: [
  { templateCode: tpl.code, sectionTitle: 'Sort – unneeded items', pillar: 'S1_SORT', questionCode: 'iso-q1', questionText: 'Only required tools at the station?', weightage: '2', isCritical: 'Y' },
  { templateCode: tpl.code, sectionTitle: 'Shine – cleanliness', pillar: 'S3_SHINE', questionCode: 'iso-q2', questionText: 'Floor free of oil and swarf?' },
] } });
check('questions imported', r.data?.created === 2, msg(r));
const full = (await req('GET', `/audit-templates/${tpl.id}`, { token: COORD })).data;
const qs = full.currentVersion.sections.flatMap((s) => s.questions);
check('sections created per title with typed questions', full.currentVersion.sections.length === 2 && qs.find((q) => q.questionCode === 'ISO-Q1')?.weightage === 2 && qs.find((q) => q.questionCode === 'ISO-Q1')?.isCritical === true);

// ---------- Standards ----------
r = await req('POST', '/imports/standards/commit', { token: ADMIN, body: { rows: [{ code: `iso-std-${stamp}`, title: 'Shadow boards', pillar: 'S2_SET_IN_ORDER', description: 'Every tool outlined', rules: 'Outline tools; Label positions' }] } });
check('standard imported', r.data?.created === 1, msg(r));
const std = await db.standard.findFirst({ where: { code: `ISO-STD-${stamp}` }, include: { revisions: true } });
check('published with approved revision and rules', std?.status === 'PUBLISHED' && JSON.parse(std.revisions[0].rules).length === 2);
check('existing standard code rejected', (await req('POST', '/imports/standards/dry-run', { token: ADMIN, body: { rows: [{ code: `iso-std-${stamp}`, title: 't', pillar: 'S1_SORT', description: 'd' }] } })).data.errorCount === 1);

// ---------- Legacy actions ----------
r = await req('POST', '/imports/actions/commit', { token: ADMIN, body: { rows: [
  { areaCode: loc.areaCode, title: 'ISO legacy: repaint aisle lines', description: 'Faded markings', pillar: 'S2_SET_IN_ORDER', severity: 'MINOR', targetDate: '2026-12-31' },
  { areaCode: loc.areaCode, title: 'ISO legacy: fix guard', description: 'Loose machine guard', pillar: 'S6_SAFETY', severity: 'CRITICAL', status: 'IN_PROGRESS' },
] } });
check('legacy actions imported', r.data?.created === 2, msg(r));
const acts = await db.correctiveAction.findMany({ where: { locationId: loc.id, title: { startsWith: 'ISO legacy' } }, include: { observation: true }, orderBy: { title: 'asc' } });
check('each action has its observation and owner as assignee', acts.length === 2 && acts.every((a) => a.observation && a.assigneeId === owner.id));
check('target date from file or severity SLA', acts.find((a) => a.title.includes('guard')).slaHours === 24 && acts.find((a) => a.title.includes('repaint')).targetDate.toISOString().startsWith('2026-12-31'));
r = await req('POST', '/imports/actions/dry-run', { token: ADMIN, body: { rows: [{ areaCode: 'NOPE', title: 't', description: 'd', pillar: 'S1_SORT', severity: 'URGENT', targetDate: '31/12/2026' }] } });
check('action validation (area, severity, date format)', r.data.errorCount === 3, r.data.errors.map((e) => e.field).join(','));

await db.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

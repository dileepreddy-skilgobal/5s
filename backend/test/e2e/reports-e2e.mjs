// R5: registers, filters and CSV / Excel / PDF export. Run from backend dir.
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
  return { status: r.status, type: r.headers.get('content-type'), disposition: r.headers.get('content-disposition'), buf: Buffer.from(await r.arrayBuffer()) };
};
const msg = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? '')}`;
const login = async (email) => (await req('POST', '/auth/login', { body: { email, password: 'Admin@123456' } })).data.accessToken;
const ADMIN = await login('admin@skilglobal.com');
const COORD = await login('coordinator.5s@skilglobal.com');
const OWNER = await login('owner.cnc01@skilglobal.com');
const AUDITOR = await login('auditor.lead@skilglobal.com');

// ---------- Catalogue & access ----------
let r = await req('GET', '/reports', { token: COORD });
check('register catalogue', r.status === 200 && r.data.length === 13, r.data?.map?.((x) => x.key).join(','));
const registers = r.data;
check('area owner blocked', (await req('GET', '/reports', { token: OWNER })).status === 403);
check('auditor allowed', (await req('GET', '/reports/audits', { token: AUDITOR })).status === 200);
check('unknown register -> 404', (await req('GET', '/reports/salaries', { token: COORD })).status === 404);
check('bad format -> 400', (await req('GET', '/reports/audits?format=docx', { token: COORD })).status === 400);
check('bad date -> 400', (await req('GET', '/reports/audits?from=yesterday', { token: COORD })).status === 400);
check('from after to -> 400', (await req('GET', '/reports/audits?from=2026-05-01&to=2026-01-01', { token: COORD })).status === 400);

// ---------- Previews ----------
for (const reg of registers) {
  r = await req('GET', `/reports/${reg.key}`, { token: COORD });
  const keys = reg.columns.map((c) => c.key);
  check(`${reg.key}: preview rows have every column`, r.status === 200 && r.data.rows.every((row) => keys.every((k) => k in row)), `${r.status} total=${r.data?.total}`);
}

// ---------- Filters ----------
r = await req('GET', '/reports/actions?status=ASSIGNED', { token: COORD });
check('status filter applied', r.data.rows.every((x) => x.status === 'ASSIGNED'), r.data.rows.map((x) => x.status).join(','));
r = await req('GET', '/reports/actions?overdueOnly=true', { token: COORD });
check('overdue-only filter', r.data.rows.every((x) => x.daysOverdue !== null && x.daysOverdue >= 0), r.data.total);
r = await req('GET', '/reports/audits?from=2000-01-01&to=2000-12-31', { token: COORD });
check('date range with no data -> empty', r.data.total === 0 && r.data.rows.length === 0);

// ---------- Formula injection guard ----------
const users = (await req('GET', '/users', { token: ADMIN })).data;
const owner = users.find((u) => u.email === 'owner.cnc01@skilglobal.com');
const node = (await req('GET', '/organization/nodes', { token: COORD })).data[0];
const loc = (await req('POST', '/locations', { token: COORD, body: { name: 'ISO Report Cell', areaCode: 'iso-rpt-loc', orgNodeId: node.id, locationType: 'PRODUCTION_LINE', ownerId: owner.id } })).data;
await req('POST', '/observations', { token: OWNER, body: { locationId: loc.id, title: '=HYPERLINK("http://evil","x")', description: 'ISO-RPT', category: 'S1_SORT', severity: 'MINOR' } });

// ---------- Exports ----------
let f = await raw(`/reports/observations?format=csv&locationId=${loc.id}`, COORD);
const csv = f.buf.toString('utf8');
check('CSV content type + attachment', f.status === 200 && f.type?.startsWith('text/csv') && /attachment; filename="observations-\d{4}-\d{2}-\d{2}\.csv"/.test(f.disposition ?? ''), `${f.status} ${f.type} ${f.disposition}`);
check('CSV starts with BOM + header', csv.charCodeAt(0) === 0xfeff && csv.slice(1).startsWith('Observation,Reported,'), csv.slice(0, 40));
check('CSV neutralises formulas', csv.includes(`"'=HYPERLINK(""http://evil"",""x"")"`), csv.split('\r\n')[1]);

f = await raw(`/reports/actions?format=xlsx`, COORD);
check('XLSX is a zip workbook', f.status === 200 && f.buf.slice(0, 2).toString() === 'PK', `${f.status} ${f.type}`);
const wb = XLSX.read(f.buf, { type: 'buffer' });
const preview = (await req('GET', '/reports/actions', { token: COORD })).data;
const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
check('XLSX has data + info sheets', wb.SheetNames.length === 2 && wb.SheetNames[1] === 'Report info', wb.SheetNames.join(','));
check('XLSX row count matches register total', sheetRows.length === preview.total, `${sheetRows.length} vs ${preview.total}`);

f = await raw(`/reports/audits?format=pdf`, COORD);
check('PDF generated', f.status === 200 && f.type === 'application/pdf' && f.buf.slice(0, 5).toString() === '%PDF-', `${f.status} ${f.type} ${f.buf.length}b`);
f = await raw(`/reports/locations?format=pdf&from=2000-01-01&to=2000-01-02`, COORD);
check('PDF with filters renders', f.status === 200 && f.buf.length > 1000);
f = await raw(`/reports/red-tags?format=pdf&status=NO_SUCH_STATUS`, COORD);
check('empty PDF still valid', f.status === 200 && f.buf.slice(0, 5).toString() === '%PDF-');

// ---------- Audit trail ----------
const log = (await req('GET', '/activity-logs?action=EXPORT_REPORT&pageSize=3', { token: ADMIN })).data.items;
check('exports recorded in activity log', log.length >= 3 && log.some((l) => /Red Tag Register as PDF/.test(l.summary)), log.map((l) => l.summary).join(' | '));
check('previews are not logged as exports', !log.some((l) => /JSON/.test(l.summary)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

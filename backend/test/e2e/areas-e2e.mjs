// Areas workstream: user management (badge / PIN, scoped and time-bound roles), organization unit types and the
// org-unit importer, "my areas" filters, area standards, and standard revision review (reject / approval note).
const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body, tenant } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(tenant ? { 'x-tenant-id': tenant } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data, json };
};
const msg = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? '')}`;
const login = async (email) => (await req('POST', '/auth/login', { body: { email, password: 'Admin@123456' } })).data.accessToken;

const T = {
  ADMIN: await login('admin@skilglobal.com'),
  SA: await login('superadmin@skilglobal.com'),
  COORD: await login('coordinator.5s@skilglobal.com'),
  PLANT: await login('planthead.blr@skilglobal.com'),
  DEPT: await login('depthead.machining@skilglobal.com'),
  OWNER: await login('owner.cnc01@skilglobal.com'),
  EXEC: await login('executive@skilglobal.com'),
};
const apex = (method, path, body) => req(method, path, { token: T.SA, body, tenant: 'apex-aero' });
const STAMP = Date.now().toString(36).toUpperCase();
const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const cleanup = [];

try {
  // ---------- Fixtures ----------
  const roles = (await req('GET', '/users/roles/all', { token: T.ADMIN })).data;
  const roleId = (code) => roles.find((r) => r.code === code)?.id;
  const nodes = (await req('GET', '/organization/nodes', { token: T.ADMIN })).data;
  const someNode = nodes[0];
  const users = (await req('GET', '/users', { token: T.ADMIN })).data;
  const owner = users.find((u) => u.email === 'owner.cnc01@skilglobal.com');
  const adminUser = users.find((u) => u.email === 'admin@skilglobal.com');
  check('fixtures: roles, nodes and users loaded', !!(roles?.length && someNode && owner && adminUser));

  // Foreign records (tenant apex-aero) for tenant-scoping checks
  let apexNode = (await apex('GET', '/organization/nodes')).data?.[0];
  if (!apexNode) {
    apexNode = (await apex('POST', '/organization/nodes', { name: `ISO-W3 Apex root ${STAMP}`, code: `ISO-W3-APX-${STAMP}`, nodeType: 'ENTERPRISE' })).data;
    cleanup.push(() => apex('DELETE', `/organization/nodes/${apexNode.id}`));
  }
  const apexUser = (await apex('GET', '/users')).data?.[0];
  const apexLoc = (await apex('POST', '/locations', { name: `ISO-W3 apex cell ${STAMP}`, areaCode: `ISO-W3-APXLOC-${STAMP}`, orgNodeId: apexNode.id, locationType: 'PRODUCTION_LINE' })).data;
  if (apexLoc?.id) cleanup.push(() => apex('DELETE', `/locations/${apexLoc.id}`));
  check('fixtures: foreign tenant records available', !!(apexNode?.id && apexUser?.id && apexLoc?.id));

  // ---------- Users: list, filters, no credential leaks ----------
  let r = await req('GET', '/users?role=AUDITOR', { token: T.ADMIN });
  check('GET /users?role=AUDITOR returns only auditors', r.status === 200 && r.data.length > 0 && r.data.every((u) => u.assignments.some((a) => a.role.code === 'AUDITOR')), msg(r));
  r = await req('GET', '/users?status=BOGUS', { token: T.ADMIN });
  check('GET /users?status=BOGUS -> 400', r.status === 400, msg(r));
  r = await req('GET', '/users', { token: T.EXEC });
  check('user list readable by any member (executive)', r.status === 200 && Array.isArray(r.data), msg(r));
  check('user list never returns password or PIN hashes', !JSON.stringify(r.json).match(/passwordHash|pinHash/), '');
  check('user list reports hasPin and assignment scope fields', r.data.every((u) => typeof u.hasPin === 'boolean' && u.assignments.every((a) => 'orgNode' in a && 'expired' in a)));

  // ---------- Users: create (validation, role denial, scoped role, badge + PIN) ----------
  const email = `iso-w3-${STAMP.toLowerCase()}@skilglobal.test`;
  const base = { email, firstName: 'ISO-W3', lastName: `User ${STAMP}` };
  r = await req('POST', '/users', { token: T.COORD, body: base });
  check('coordinator cannot create users -> 403', r.status === 403, msg(r));
  r = await req('POST', '/users', { token: T.ADMIN, body: { ...base, email: 'not-an-email' } });
  check('invalid email -> 400', r.status === 400, msg(r));
  r = await req('POST', '/users', { token: T.ADMIN, body: { ...base, roleCode: 'NO_SUCH_ROLE' } });
  check('unknown initial role -> 400 (nothing created)', r.status === 400, msg(r));
  r = await req('POST', '/users', { token: T.ADMIN, body: { ...base, roleCode: 'EXTERNAL_AUDITOR' } });
  check('external auditor without end date -> 400', r.status === 400, msg(r));
  r = await req('POST', '/users', { token: T.ADMIN, body: { ...base, roleCode: 'AUDITOR', roleValidUntil: '2001-01-01' } });
  check('role end date in the past -> 400', r.status === 400, msg(r));
  r = await req('POST', '/users', { token: T.ADMIN, body: { ...base, pin: '12' } });
  check('PIN with fewer than 4 digits -> 400', r.status === 400, msg(r));
  r = await req('POST', '/users', { token: T.ADMIN, body: { ...base, roleCode: 'AUDITOR', orgNodeId: apexNode.id } });
  check('initial role scoped to another tenant\'s unit -> 404', r.status === 404, msg(r));
  r = await req('POST', '/users', { token: T.ADMIN, body: { ...base, jobTitle: 'ISO tester', roleCode: 'AUDITOR', orgNodeId: someNode.id, badgeId: `iso-w3-${STAMP}`, pin: '4826' } });
  const created = r.data;
  if (created?.id) cleanup.push(() => req('DELETE', `/users/${created.id}`, { token: T.ADMIN }));
  check('admin creates user with scoped role, badge and PIN', r.status < 300 && created?.assignments?.[0]?.orgNodeId === someNode.id && created?.badgeId === `ISO-W3-${STAMP}`, msg(r));
  check('one-time password returned once; no PIN or hashes returned', !!created?.temporaryPassword && !JSON.stringify(r.json).match(/pinHash|passwordHash|"pin"/));
  const listed = (await req('GET', `/users?search=${encodeURIComponent(email)}`, { token: T.ADMIN })).data?.[0];
  check('search finds the new user; hasPin true; scope resolved', listed?.id === created?.id && listed?.hasPin === true && listed?.assignments?.[0]?.orgNode?.id === someNode.id);

  // ---------- Users: deactivate / reactivate / self-protection ----------
  r = await req('PATCH', `/users/${created.id}`, { token: T.ADMIN, body: { status: 'INACTIVE' } });
  check('deactivate user', r.status < 300 && r.data?.status === 'INACTIVE', msg(r));
  r = await req('PATCH', `/users/${created.id}`, { token: T.ADMIN, body: { status: 'ACTIVE' } });
  check('reactivate user', r.status < 300 && r.data?.status === 'ACTIVE', msg(r));
  r = await req('PATCH', `/users/${adminUser.id}`, { token: T.ADMIN, body: { status: 'INACTIVE' } });
  check('admin cannot deactivate own account -> 400', r.status === 400, msg(r));
  r = await req('PATCH', `/users/${created.id}`, { token: T.COORD, body: { status: 'INACTIVE' } });
  check('coordinator cannot change users -> 403', r.status === 403, msg(r));

  // ---------- Users: reset PIN ----------
  r = await req('POST', `/users/${created.id}/reset-pin`, { token: T.ADMIN, body: { pin: 'abcd' } });
  check('reset PIN with letters -> 400', r.status === 400, msg(r));
  r = await req('POST', `/users/${created.id}/reset-pin`, { token: T.COORD, body: { pin: '7391' } });
  check('coordinator cannot reset PINs -> 403', r.status === 403, msg(r));
  r = await req('POST', `/users/${created.id}/reset-pin`, { token: T.ADMIN, body: { pin: '7391' } });
  check('admin resets PIN', r.status === 200 && r.data?.pinSet === true && !('pin' in (r.data ?? {})), msg(r));
  r = await req('POST', `/users/${apexUser.id}/reset-pin`, { token: T.ADMIN, body: { pin: '7391' } });
  check('reset PIN of another tenant\'s user -> 404', r.status === 404, msg(r));
  r = await req('POST', '/auth/pin-login', { body: { badgeId: `ISO-W3-${STAMP}`, pin: '7391', tenantSlug: 'skilglobal-mfg' } });
  check('badge + new PIN signs in', r.status < 300 && !!(r.data?.accessToken || r.data?.mfaRequired), msg(r));
  const noBadge = (await req('POST', '/users', { token: T.ADMIN, body: { email: `iso-w3-nobadge-${STAMP.toLowerCase()}@skilglobal.test`, firstName: 'ISO-W3', lastName: 'No badge' } })).data;
  if (noBadge?.id) cleanup.push(() => req('DELETE', `/users/${noBadge.id}`, { token: T.ADMIN }));
  r = await req('POST', `/users/${noBadge?.id}/reset-pin`, { token: T.ADMIN, body: { pin: '7391' } });
  check('reset PIN without a badge -> 400', r.status === 400, msg(r));

  // ---------- Role assignment: scope and end date ----------
  r = await req('POST', `/users/${created.id}/roles`, { token: T.ADMIN, body: { roleId: roleId('EXTERNAL_AUDITOR') } });
  check('external auditor role without end date -> 400', r.status === 400, msg(r));
  r = await req('POST', `/users/${created.id}/roles`, { token: T.ADMIN, body: { roleId: roleId('AUDITOR'), validUntil: 'next week' } });
  check('malformed end date -> 400', r.status === 400, msg(r));
  r = await req('POST', `/users/${created.id}/roles`, { token: T.ADMIN, body: { roleId: roleId('AUDITOR'), orgNodeId: apexNode.id } });
  check('role scoped to another tenant\'s unit -> 404', r.status === 404, msg(r));
  r = await req('POST', `/users/${created.id}/roles`, { token: T.COORD, body: { roleId: roleId('AUDITOR') } });
  check('coordinator cannot assign roles -> 403', r.status === 403, msg(r));
  const until = future(30);
  r = await req('POST', `/users/${created.id}/roles`, { token: T.ADMIN, body: { roleId: roleId('EXTERNAL_AUDITOR'), validUntil: until } });
  const ext = r.data;
  check('time-bound external auditor role assigned', r.status < 300 && !!ext?.validUntil && new Date(ext.validUntil).getTime() === new Date(until).getTime(), msg(r));
  r = await req('POST', `/users/${created.id}/roles`, { token: T.ADMIN, body: { roleId: roleId('EXTERNAL_AUDITOR'), validUntil: future(60) } });
  check('re-assigning the same role and scope renews it (no duplicate)', r.status < 300 && r.data?.id === ext?.id && new Date(r.data.validUntil) > new Date(until), msg(r));
  const after = (await req('GET', `/users/${created.id}`, { token: T.ADMIN })).data;
  check('user shows the time-bound role as not expired', after?.assignments?.some((a) => a.id === ext?.id && a.expired === false));

  // ---------- Organization: unit types from the hierarchy levels ----------
  r = await req('GET', '/organization/node-types', { token: T.DEPT });
  const types = r.data ?? [];
  const configured = types.filter((t) => t.configured);
  check('node types: configured hierarchy levels first, readable by any member', r.status === 200 && configured.length > 0 && types[0].configured === true, msg(r));
  const levelType = (configured.find((t) => t.code === 'AREA') ?? configured[configured.length - 1])?.code;
  r = await req('POST', '/organization/nodes', { token: T.ADMIN, body: { name: 'ISO-W3 bogus', code: `ISO-W3-BOG-${STAMP}`, nodeType: 'GALAXY' } });
  check('unit type outside the hierarchy levels -> 400', r.status === 400, msg(r));
  r = await req('POST', '/organization/nodes', { token: T.ADMIN, body: { name: 'ISO-W3 bad', code: `ISO-W3-BAD-${STAMP}`, nodeType: 'not a code' } });
  check('malformed unit type -> 400', r.status === 400, msg(r));
  r = await req('POST', '/organization/nodes', { token: T.COORD, body: { name: 'ISO-W3 x', code: `ISO-W3-X-${STAMP}`, nodeType: levelType } });
  check('coordinator cannot create units -> 403', r.status === 403, msg(r));
  r = await req('POST', '/organization/nodes', { token: T.ADMIN, body: { parentId: someNode.id, name: 'ISO-W3 level unit', code: `ISO-W3-LVL-${STAMP}`, nodeType: levelType } });
  const levelNode = r.data;
  if (levelNode?.id) cleanup.push(() => req('DELETE', `/organization/nodes/${levelNode.id}`, { token: T.ADMIN }));
  check(`create unit with configured level ${levelType}`, r.status < 300 && levelNode?.nodeType === levelType, msg(r));

  // ---------- Imports: organization units (dry run + commit) ----------
  const P = `ISO-W3-IMP-${STAMP}`;
  const goodRows = [
    { code: `${P}-B`, name: 'ISO-W3 child', nodeType: configured[configured.length - 1].label, parentCode: `${P}-A` }, // parent later in the file
    { code: `${P}-A`, name: 'ISO-W3 parent', nodeType: levelType, parentCode: someNode.code, sortOrder: '2' },
  ];
  r = await req('GET', '/imports/catalogue', { token: T.ADMIN });
  check('import catalogue lists organization units first', r.status === 200 && r.data?.[0]?.kind === 'org-nodes', msg(r));
  r = await req('POST', '/imports/org-nodes/dry-run', { token: T.COORD, body: { rows: goodRows } });
  check('coordinator cannot import -> 403', r.status === 403, msg(r));
  r = await req('POST', '/imports/org-nodes/dry-run', { token: T.ADMIN, body: { rows: goodRows } });
  check('dry run: valid rows (parent later in the file, level given by name)', r.status < 300 && r.data?.errorCount === 0 && r.data?.validCount === 2, msg(r) + JSON.stringify(r.data?.errors ?? []));
  r = await req('POST', '/imports/org-nodes/dry-run', {
    token: T.ADMIN,
    body: { rows: [
      { code: `${P}-L1`, name: 'ISO-W3 loop 1', nodeType: levelType, parentCode: `${P}-L2` },
      { code: `${P}-L2`, name: 'ISO-W3 loop 2', nodeType: levelType, parentCode: `${P}-L1` },
      { code: `${P}-T`, name: 'ISO-W3 bad type', nodeType: 'Galaxy' },
      { code: `${P}-M`, name: 'ISO-W3 missing parent', nodeType: levelType, parentCode: 'ISO-W3-NOWHERE' },
      { code: someNode.code, name: 'ISO-W3 taken code', nodeType: levelType },
    ] },
  });
  const fields = (r.data?.errors ?? []).map((e) => `${e.rowNumber}:${e.field}`);
  check('dry run reports loop, unknown level, missing parent and taken code', r.status < 300 && ['2:ParentCode', '3:ParentCode', '4:NodeType', '5:ParentCode', '6:Code'].every((f) => fields.includes(f)), fields.join(','));
  r = await req('POST', '/imports/org-nodes/dry-run', { token: T.ADMIN, body: { rows: 'nope' } });
  check('dry run with non-array rows -> 400', r.status === 400, msg(r));
  r = await req('POST', '/imports/org-nodes/commit', { token: T.ADMIN, body: { rows: goodRows } });
  check('commit creates the units', r.status < 300 && r.data?.created === 2, msg(r));
  const imported = (await req('GET', '/organization/nodes', { token: T.ADMIN })).data.filter((n) => n.code.startsWith(P));
  const impA = imported.find((n) => n.code === `${P}-A`);
  const impB = imported.find((n) => n.code === `${P}-B`);
  // Cleanup runs in reverse: the child is removed before its parent
  if (impA) cleanup.push(() => req('DELETE', `/organization/nodes/${impA.id}`, { token: T.ADMIN }));
  if (impB) cleanup.push(() => req('DELETE', `/organization/nodes/${impB.id}`, { token: T.ADMIN }));
  check('imported child sits under the imported parent, parent under the existing unit', impB?.parentId === impA?.id && impA?.parentId === someNode.id && impB?.depth === impA?.depth + 1 && impB?.path?.startsWith(impA?.path ?? '-'));
  r = await req('POST', '/imports/org-nodes/commit', { token: T.ADMIN, body: { rows: goodRows } });
  check('re-importing the same codes -> 400 (nothing written)', r.status === 400, msg(r));

  // ---------- Locations: owner filter and "my areas" ----------
  r = await req('GET', `/locations?ownerId=${owner.id}`, { token: T.COORD });
  check('owner filter returns only that owner\'s (or backup\'s) areas', r.status === 200 && r.data.length > 0 && r.data.every((l) => l.ownerId === owner.id || l.backupOwnerId === owner.id), msg(r));
  r = await req('GET', '/locations?mine=1', { token: T.OWNER });
  check('"my areas" for an area owner = owned or backed-up areas', r.status === 200 && r.data.length > 0 && r.data.every((l) => l.ownerId === owner.id || l.backupOwnerId === owner.id), msg(r));
  r = await req('GET', '/locations/qr-batch?mine=1', { token: T.OWNER });
  check('QR tags limited to my areas', r.status === 200 && r.data.length > 0 && r.data.every((t) => typeof t.qrPayload === 'string'), msg(r));
  r = await req('GET', '/locations/qr-batch', { token: T.DEPT });
  check('department head can load printable QR tags', r.status === 200 && r.data.length > 0 && r.data.some((t) => t.qrDataUrl), msg(r));
  r = await req('GET', '/locations?mine=1', { token: T.ADMIN });
  const adminMine = r.data ?? [];
  check('"my areas" for a user owning nothing is a subset (no tenant-wide leak)', r.status === 200 && adminMine.every((l) => l.ownerId === adminUser.id || l.backupOwnerId === adminUser.id), `${adminMine.length}`);

  // ---------- Standards: reject with reason, approval note kept apart, multiple photos ----------
  const stdCode = `ISO-W3-STD-${STAMP}`;
  r = await req('POST', '/standards', {
    token: T.COORD,
    body: {
      code: stdCode, title: 'ISO-W3 standard', category: 'S2_SET_IN_ORDER', description: 'ISO-W3 description', rules: ['Keep aisles clear'],
      referencePhotos: [
        { type: 'STANDARD_CONDITION', photoUrl: TINY_PNG, label: 'Standard condition 1' },
        { type: 'STANDARD_CONDITION', photoUrl: TINY_PNG, label: 'Standard condition 2' },
        { type: 'CURRENT_CONDITION', photoUrl: TINY_PNG, label: 'Defect example' },
      ],
    },
  });
  const std = r.data;
  if (std?.id) cleanup.push(() => req('DELETE', `/standards/${std.id}`, { token: T.COORD }));
  const rev1 = std?.revisions?.[0];
  check('standard with several photos per kind keeps them all', r.status < 300 && rev1?.referencePhotos?.filter((p) => p.type === 'STANDARD_CONDITION').length === 2, msg(r));
  r = await req('POST', `/standards/${std.id}/revisions/${rev1.id}/reject`, { token: T.PLANT, body: { reason: '   ' } });
  check('reject without a reason -> 400', r.status === 400, msg(r));
  r = await req('POST', `/standards/${std.id}/revisions/${rev1.id}/reject`, { token: T.OWNER, body: { reason: 'x' } });
  check('area owner cannot reject revisions -> 403', r.status === 403, msg(r));
  r = await req('POST', `/standards/${std.id}/revisions/${rev1.id}/reject`, { token: T.PLANT, body: { reason: 'ISO-W3: photo does not show the shadow board' } });
  const rejected = r.data?.revisions?.find((x) => x.id === rev1.id);
  check('plant head rejects revision with reason (who / when recorded)', r.status < 300 && !!rejected?.rejectedAt && rejected?.rejectionReason?.startsWith('ISO-W3') && !!rejected?.rejectedBy?.id && r.data?.status === 'DRAFT', msg(r));
  r = await req('POST', `/standards/${std.id}/revisions/${rev1.id}/approve`, { token: T.PLANT, body: {} });
  check('approving a rejected revision -> 409', r.status === 409, msg(r));
  r = await req('POST', `/standards/${std.id}/revisions/${rev1.id}/reject`, { token: T.PLANT, body: { reason: 'again' } });
  check('rejecting twice -> 409', r.status === 409, msg(r));
  r = await req('POST', `/standards/${std.id}/revisions`, { token: T.COORD, body: { revisionNumber: '1.1', description: 'ISO-W3 fixed', rules: ['Keep aisles clear'], revisionComments: 'Author: replaced the photo' } });
  const rev2 = r.data?.revisions?.find((x) => x.revisionNumber === '1.1');
  check('author drafts a new revision after rejection', r.status < 300 && !!rev2, msg(r));
  r = await req('POST', `/standards/${std.id}/revisions/${rev2.id}/approve`, { token: T.PLANT, body: { comments: 'Approver: looks right' } });
  const approved = r.data?.revisions?.find((x) => x.id === rev2.id);
  check('approval note stored apart; author comment unchanged', r.status < 300 && approved?.approvalComments === 'Approver: looks right' && approved?.revisionComments === 'Author: replaced the photo', msg(r));
  check('approving publishes the standard', r.data?.status === 'PUBLISHED', r.data?.status);
  r = await req('GET', `/standards/${std.id}`, { token: T.EXEC });
  check('revision history (incl. rejected) readable by view-only roles', r.status === 200 && r.data?.revisions?.length === 2 && r.data.revisions.some((x) => x.rejectionReason), msg(r));

  // ---------- Area standards ----------
  const ownerLoc = (await req('GET', `/locations?ownerId=${owner.id}`, { token: T.COORD })).data[0];
  r = await req('GET', `/standards/for-location/${ownerLoc.id}`, { token: T.OWNER });
  const mine = r.data?.find((s) => s.id === std.id);
  check('organization-wide standard applies to the area, with the revision in force', r.status === 200 && mine?.appliesVia === 'ORGANIZATION' && mine?.currentRevision?.revisionNumber === '1.1', msg(r));
  check('area standards only list published standards with an approved revision', (r.data ?? []).every((s) => s.status === 'PUBLISHED' && s.currentRevision?.approvedAt));
  r = await req('GET', `/standards/for-location/${apexLoc.id}`, { token: T.OWNER });
  check('standards for another tenant\'s location -> 404', r.status === 404, msg(r));

  // ---------- Users: delete (soft) ----------
  r = await req('DELETE', `/users/${created.id}`, { token: T.COORD });
  check('coordinator cannot delete users -> 403', r.status === 403, msg(r));
  r = await req('DELETE', `/users/${created.id}`, { token: T.ADMIN });
  check('admin deletes (soft) the user', r.status < 300 && r.data?.status === 'INACTIVE', msg(r));
  r = await req('GET', `/users/${created.id}`, { token: T.ADMIN });
  check('deleted user is hidden', r.status === 404, msg(r));
  r = await req('DELETE', `/users/${adminUser.id}`, { token: T.ADMIN });
  check('admin cannot delete own account -> 400', r.status === 400, msg(r));
} catch (err) {
  check('suite ran without crashing', false, err?.stack ?? String(err));
} finally {
  // Children before parents; failures here (already deleted) are ignored
  for (const undo of cleanup.reverse()) {
    try { await undo(); } catch {}
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

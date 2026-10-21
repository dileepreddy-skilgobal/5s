// R7: sessions & revocation, password change / reset, TOTP MFA, admin MFA policy, rate limiting, headers.
// Run from the backend directory (uses @prisma/client, dist/ and .env).
import { createRequire } from 'node:module';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
const require = createRequire(process.cwd() + '/');
const { PrismaClient } = require('@prisma/client');
const totp = require(process.cwd() + '/dist/core/auth/totp.js');
const db = new PrismaClient();
const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data ?? json, json, headers: r.headers };
};
const msg = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? '')}`;
const login = async (email, password = 'Admin@123456') => (await req('POST', '/auth/login', { body: { email, password } })).data;
const me = async (token) => (await req('GET', '/auth/me', { token })).status;
const sha = (v) => createHash('sha256').update(v).digest('hex');
const codeNow = (secret, offsetSteps = 0) => totp.totpAt(secret, totp.currentStep() + offsetSteps);

// ---------- TOTP correctness (RFC 6238 test vector, SHA-1, T=59s -> 287082) ----------
check('RFC 6238 vector', totp.totpAt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1) === '287082', totp.totpAt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1));

const ADMIN = (await login('admin@skilglobal.com')).accessToken;
const tenantId = (await req('GET', '/auth/me', { token: ADMIN })).data.tenant.id;
const rawSettings = (await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })).settings;
const stamp = Date.now();
const mkUser = async (email, roleCode) => (await req('POST', '/users', { token: ADMIN, body: { email, firstName: 'Iso', lastName: 'Security', roleCode, password: 'IsoPass@12345' } })).data;
const plain = await mkUser(`iso-softdel-sec-${stamp}@example.com`, 'EMPLOYEE');
const admin2 = await mkUser(`iso-softdel-mfa-${stamp}@example.com`, 'ORG_ADMIN');
check('fixture users', !!plain?.id && !!admin2?.id);

// ---------- Sessions ----------
const s1 = (await login(plain.email, 'IsoPass@12345')).accessToken;
const s2 = (await login(plain.email, 'IsoPass@12345')).accessToken;
let r = await req('GET', '/auth/sessions', { token: s1 });
check('sessions listed with current flag', r.data.length >= 2 && r.data.filter((s) => s.current).length === 1, r.data.length);
check('session records device info', !!r.data[0].userAgent && !!r.data[0].ipAddress);
r = await req('POST', '/auth/sessions/revoke-others', { token: s1 });
check('sign out other devices', r.data.revoked >= 1 && (await me(s2)) === 401 && (await me(s1)) === 200, JSON.stringify(r.data));
const s3 = (await login(plain.email, 'IsoPass@12345')).accessToken;
const s3id = (await req('GET', '/auth/sessions', { token: s3 })).data.find((s) => s.current).id;
r = await req('DELETE', `/auth/sessions/${s3id}`, { token: s1 });
check('revoke a specific device', r.status === 200 && (await me(s3)) === 401);
check('cannot revoke someone else\'s session', (await req('DELETE', `/auth/sessions/${(await req('GET', '/auth/sessions', { token: ADMIN })).data[0].id}`, { token: s1 })).status === 404);
r = await req('POST', '/auth/logout', { token: s1 });
check('logout ends the token immediately', r.status === 200 && (await me(s1)) === 401);

// Tokens without a session (e.g. issued before sessions existed, or forged with a stolen secret but no session) are refused
const secret = process.env.JWT_SECRET ?? /JWT_SECRET\s*=\s*"?([^"\n\r]+)"?/.exec(readFileSync('.env', 'utf8'))[1];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const legacy = (() => {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ sub: plain.id, tid: tenantId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 });
  return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
})();
check('session-less token rejected', (await me(legacy)) === 401);

const s4 = (await login(plain.email, 'IsoPass@12345')).accessToken;
r = await req('POST', `/users/${plain.id}/revoke-sessions`, { token: ADMIN });
check('admin signs a user out everywhere', r.data.sessionsRevoked >= 1 && (await me(s4)) === 401, JSON.stringify(r.data));

// ---------- Password change ----------
const p1 = (await login(plain.email, 'IsoPass@12345')).accessToken;
const p2 = (await login(plain.email, 'IsoPass@12345')).accessToken;
check('wrong current password -> 400', (await req('POST', '/auth/change-password', { token: p1, body: { currentPassword: 'nope', newPassword: 'Chang3d!Pass' } })).status === 400);
check('weak new password -> 400', (await req('POST', '/auth/change-password', { token: p1, body: { currentPassword: 'IsoPass@12345', newPassword: 'weak' } })).status === 400);
r = await req('POST', '/auth/change-password', { token: p1, body: { currentPassword: 'IsoPass@12345', newPassword: 'Chang3d!Pass' } });
check('password changed; other devices out, this one stays', r.status === 200 && (await me(p2)) === 401 && (await me(p1)) === 200, msg(r));
check('new password works', !!(await login(plain.email, 'Chang3d!Pass'))?.accessToken);

// ---------- Forgot / reset password ----------
const forgot = (email) => req('POST', '/auth/forgot-password', { body: { email } });
const a = await forgot(`nobody-${stamp}@example.com`);
const b = await forgot(plain.email);
check('same response for unknown and known accounts', a.status === 200 && b.status === 200 && a.data.message === b.data.message, a.data.message);
check('reset token stored hashed', (await db.passwordResetToken.count({ where: { userId: plain.id } })) === 1);
const rawToken = randomBytes(32).toString('base64url');
await db.passwordResetToken.create({ data: { userId: plain.id, tokenHash: sha(rawToken), expiresAt: new Date(Date.now() + 600000) } });
const expired = randomBytes(32).toString('base64url');
await db.passwordResetToken.create({ data: { userId: plain.id, tokenHash: sha(expired), expiresAt: new Date(Date.now() - 1000) } });
const live = (await login(plain.email, 'Chang3d!Pass')).accessToken;
check('expired link -> 400', (await req('POST', '/auth/reset-password', { body: { token: expired, newPassword: 'Res3t!Pass99' } })).status === 400);
check('weak password on reset -> 400', (await req('POST', '/auth/reset-password', { body: { token: rawToken, newPassword: 'short' } })).status === 400);
r = await req('POST', '/auth/reset-password', { body: { token: rawToken, newPassword: 'Res3t!Pass99' } });
check('reset succeeds', r.status === 200, msg(r));
check('reset signs out every device', (await me(live)) === 401);
check('link cannot be reused', (await req('POST', '/auth/reset-password', { body: { token: rawToken, newPassword: 'An0ther!Pass9' } })).status === 400);
check('sign in with the reset password', !!(await login(plain.email, 'Res3t!Pass99'))?.accessToken);
check('reset recorded in activity trail', (await db.activityLog.count({ where: { entityId: plain.id, action: 'PASSWORD_RESET' } })) === 1);

// ---------- MFA enrolment & sign-in ----------
let t = (await login(admin2.email, 'IsoPass@12345')).accessToken;
r = await req('POST', '/auth/mfa/setup', { token: t });
const mfaSecret = r.data.secret;
check('setup returns secret, otpauth URI and QR image', /^[A-Z2-7]{32}$/.test(mfaSecret) && r.data.otpauthUri.startsWith('otpauth://totp/') && r.data.qrCodeDataUrl.startsWith('data:image/png'), msg(r));
check('wrong code does not enable', (await req('POST', '/auth/mfa/enable', { token: t, body: { code: '000000' } })).status === 400);
r = await req('POST', '/auth/mfa/enable', { token: t, body: { code: codeNow(mfaSecret) } });
const recovery = r.data.recoveryCodes;
check('MFA enabled with 10 recovery codes', r.status === 200 && recovery?.length === 10, msg(r));
const dbUser = await db.user.findUnique({ where: { id: admin2.id }, select: { mfaSecret: true, mfaRecoveryCodes: true } });
check('secret encrypted and codes hashed at rest', dbUser.mfaSecret.startsWith('v1:') && !dbUser.mfaSecret.includes(mfaSecret) && !dbUser.mfaRecoveryCodes.includes(recovery[0]));

r = await req('POST', '/auth/login', { body: { email: admin2.email, password: 'IsoPass@12345' } });
check('password step returns MFA challenge, no session', r.data.mfaRequired === true && !r.data.accessToken && !!r.data.mfaToken, JSON.stringify(Object.keys(r.data)));
const challenge = r.data.mfaToken;
check('challenge token is not an access token', (await me(challenge)) === 401);
check('wrong code -> 401', (await req('POST', '/auth/mfa/verify', { body: { mfaToken: challenge, code: '123456' } })).status === 401);
// Wait for a fresh time step so the code was not already consumed during enable
const enabledStep = totp.currentStep();
while (totp.currentStep() === enabledStep) await new Promise((res) => setTimeout(res, 500));
const fresh = codeNow(mfaSecret);
r = await req('POST', '/auth/mfa/verify', { body: { mfaToken: challenge, code: fresh } });
check('valid code issues the session', !!r.data.accessToken && r.data.authMethod === 'PASSWORD+MFA', msg(r));
const challenge2 = (await req('POST', '/auth/login', { body: { email: admin2.email, password: 'IsoPass@12345' } })).data.mfaToken;
check('a code cannot be replayed', (await req('POST', '/auth/mfa/verify', { body: { mfaToken: challenge2, code: fresh } })).status === 401);
r = await req('POST', '/auth/mfa/verify', { body: { mfaToken: challenge2, recoveryCode: recovery[0].toLowerCase() } });
check('recovery code signs in', !!r.data.accessToken, msg(r));
const challenge3 = (await req('POST', '/auth/login', { body: { email: admin2.email, password: 'IsoPass@12345' } })).data.mfaToken;
check('recovery code works only once', (await req('POST', '/auth/mfa/verify', { body: { mfaToken: challenge3, recoveryCode: recovery[0] } })).status === 401);
t = r.data.accessToken;
r = await req('GET', '/auth/mfa', { token: t });
check('status shows 9 codes left', r.data.enabled && r.data.recoveryCodesRemaining === 9, JSON.stringify(r.data));

// ---------- Admin policy ----------
const policy = async (on) => {
  const stored = JSON.parse(rawSettings || '{}');
  await db.tenant.update({ where: { id: tenantId }, data: { settings: JSON.stringify(on ? { ...stored, security: { requireMfaForAdmins: true } } : stored) } });
};
await policy(true);
check('cannot disable MFA while policy requires it', (await req('POST', '/auth/mfa/disable', { token: t, body: { password: 'IsoPass@12345', code: codeNow(mfaSecret) } })).status === 409);
r = await req('GET', '/users', { token: ADMIN });
check('policy blocks an existing admin session without MFA', r.status === 403 && /MFA_ENROLLMENT_REQUIRED/.test(r.json?.message), msg(r));
check('enrolled admin keeps working under the policy', (await req('GET', '/users', { token: t })).status === 200);
await policy(false);
r = await req('POST', `/users/${admin2.id}/reset-mfa`, { token: ADMIN });
check('admin resets a lost device (MFA cleared, sessions ended)', r.data.mfaEnabled === false && r.data.sessionsRevoked >= 1 && (await me(t)) === 401, JSON.stringify(r.data));
await policy(true);
const enrolLogin = await login(admin2.email, 'IsoPass@12345');
check('un-enrolled admin is told to enrol at sign-in', enrolLogin.mfaEnrollmentRequired === true && !!enrolLogin.accessToken, JSON.stringify(Object.keys(enrolLogin ?? {})));
const et = enrolLogin.accessToken;
r = await req('GET', '/users', { token: et });
check('other endpoints blocked until enrolment', r.status === 403 && /MFA_ENROLLMENT_REQUIRED/.test(r.json?.message), msg(r));
check('profile and MFA setup still reachable', (await me(et)) === 200 && (await req('POST', '/auth/mfa/setup', { token: et })).status === 200);
check('non-admins are not affected by the admin policy', (await req('GET', '/locations', { token: (await login(plain.email, 'Res3t!Pass99')).accessToken })).status === 200);
await db.tenant.update({ where: { id: tenantId }, data: { settings: rawSettings } });
check('policy off again -> admin unblocked', (await req('GET', '/users', { token: et })).status === 200);

// ---------- Headers ----------
r = await fetch(B + '/auth/me', { headers: { Origin: 'http://localhost:5173' } });
check('security headers present', r.headers.get('x-content-type-options') === 'nosniff' && !!r.headers.get('strict-transport-security'));
r = await fetch(B + '/reports', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' } });
const exposed = (await fetch(B + '/auth/me', { headers: { Origin: 'http://localhost:5173' } })).headers.get('access-control-expose-headers');
check('CORS exposes Content-Disposition for downloads', /content-disposition/i.test(exposed ?? ''), exposed);

// ---------- Rate limiting (last: it exhausts this client's reset budget for a minute) ----------
const codes = [];
for (let i = 0; i < 8; i++) codes.push((await forgot(`flood-${i}@example.com`)).status);
check('password-reset endpoint rate limited (429)', codes.includes(429), codes.join(','));

// ---------- Cleanup ----------
for (const u of [plain, admin2]) await req('DELETE', `/users/${u.id}`, { token: ADMIN });
await db.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

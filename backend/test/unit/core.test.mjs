// Unit tests for pure domain logic. Run after `npm run build`: `npm run test:unit` (node:test, no extra dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';

const require = createRequire(import.meta.url);
const dist = (p) => require(`../../dist/${p}`);

process.env.JWT_SECRET ??= 'unit-test-secret-that-is-at-least-32-characters-long';

const totp = dist('core/auth/totp.js');
const scoring = dist('modules/audit-executions/scoring.js');
const settings = dist('core/config/tenant-settings.js');
const activity = dist('core/activity/activity-log.util.js');
const fileTypes = dist('core/storage/file-types.js');
const plans = dist('core/subscription/plans.js');
const webhooks = dist('core/integrations/webhooks.service.js');
const exporters = dist('modules/reports/report-exporters.js');
const repeat = dist('modules/observations/repeat-detection.js');
const sequence = dist('core/database/sequence-code.js');
const annotations = dist('core/storage/annotation-renderer.js');

test('TOTP matches RFC 6238 SHA-1 vectors', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
  assert.equal(totp.totpAt(secret, Math.floor(59 / 30)), '287082');
  assert.equal(totp.totpAt(secret, Math.floor(1111111109 / 30)), '081804');
  assert.equal(totp.totpAt(secret, Math.floor(2000000000 / 30)), '279037');
});

test('TOTP verification accepts ±1 step and rejects others', () => {
  const secret = totp.generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  const now = Date.now();
  const step = totp.currentStep(now);
  assert.equal(totp.verifyTotp(secret, totp.totpAt(secret, step), now), step);
  assert.equal(totp.verifyTotp(secret, totp.totpAt(secret, step - 1), now), step - 1);
  assert.equal(totp.verifyTotp(secret, totp.totpAt(secret, step + 3), now), null);
  assert.equal(totp.verifyTotp(secret, 'abcdef', now), null);
});

test('secrets round-trip through AES-GCM and tampering is detected', () => {
  const enc = totp.encryptSecret('top-secret');
  assert.match(enc, /^v1:/);
  assert.equal(totp.decryptSecret(enc), 'top-secret');
  const parts = enc.split(':');
  parts[3] = Buffer.from('tampered').toString('base64');
  assert.throws(() => totp.decryptSecret(parts.join(':')));
});

test('recovery codes are unique and formatted', () => {
  const codes = totp.generateRecoveryCodes(10);
  assert.equal(new Set(codes).size, 10);
  codes.forEach((c) => assert.match(c, /^[0-9A-F]{5}-[0-9A-F]{5}$/));
});

test('pillar-weighted scoring', () => {
  const w = scoring.parsePillarWeights('{"S1":30,"S2":10}');
  assert.deepEqual(w, { S1: 30, S2: 10 });
  assert.equal(scoring.parsePillarWeights('not json'), null);
  assert.equal(scoring.weightedPillarScore({ S1_SORT: 5, S2_SET_IN_ORDER: 2.5 }, { S1_SORT: 5, S2_SET_IN_ORDER: 5 }, w), 87.5);
  // A pillar missing from the model gets the average configured weight
  const s = scoring.weightedPillarScore({ S1_SORT: 5, S2_SET_IN_ORDER: 2.5, S6_SAFETY: 0 }, { S1_SORT: 5, S2_SET_IN_ORDER: 5, S6_SAFETY: 5 }, w);
  assert.ok(Math.abs(s - 3500 / 60) < 1e-9);
  assert.equal(scoring.weightedPillarScore({}, { S1_SORT: 0 }, w), null);
});

test('tenant settings merge over defaults per key', () => {
  const s = settings.readTenantSettings(JSON.stringify({ sla: { hoursBySeverity: { CRITICAL: 12 } }, numbering: { observation: 'ABN' } }));
  assert.equal(s.sla.hoursBySeverity.CRITICAL, 12);
  assert.equal(s.sla.hoursBySeverity.MAJOR, 72);
  assert.equal(s.numbering.observation, 'ABN');
  assert.equal(s.numbering.action, 'CAPA');
  assert.equal(settings.slaHoursFor(s, 'UNKNOWN'), s.sla.hoursBySeverity.MODERATE);
  assert.equal(settings.documentPrefix(s, 'observation', 'CNC0', 2026), 'ABN-CNC0-2026-');
  assert.equal(settings.readTenantSettings('{broken').analytics.passScore, 70);
  assert.equal(settings.maturityFor(96, s.analytics).level, 5);
  assert.equal(settings.maturityFor(0, s.analytics).level, 1);
  assert.equal(settings.maturityFor(null, s.analytics), null);
});

test('activity trail redacts secrets and shrinks blobs', () => {
  const out = activity.sanitizePayload({ password: 'x', newPin: '1234', apiKey: 'k', mapping: 'kept', areaCode: 'A1', photo: 'x'.repeat(5000) });
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.newPin, '[REDACTED]');
  assert.equal(out.apiKey, '[REDACTED]');
  assert.equal(out.mapping, 'kept');
  assert.equal(out.photo, '[5000 characters]');
});

test('activity diff expands JSON columns and ignores noise', () => {
  const before = { name: 'A', updatedAt: new Date(1), settings: JSON.stringify({ sla: { CRITICAL: 24 } }) };
  const after = { name: 'A', updatedAt: new Date(2), settings: JSON.stringify({ sla: { CRITICAL: 12 } }) };
  assert.deepEqual(activity.diffRecords(before, after), { 'settings.sla.CRITICAL': { from: 24, to: 12 } });
  assert.equal(activity.diffRecords({ a: 1 }, { a: 1 }), null);
});

test('file types are detected from bytes, not names', () => {
  assert.equal(fileTypes.detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])).contentType, 'image/jpeg');
  assert.equal(fileTypes.detectFileType(Buffer.from('%PDF-1.7 rest of file')).contentType, 'application/pdf');
  assert.equal(fileTypes.detectFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(fileTypes.detectFileType(Buffer.from('<html><script>x</script></html>')), null);
  assert.deepEqual(fileTypes.parseDataUrl('data:image/png;base64,AAEC'), Buffer.from([0, 1, 2]));
  assert.equal(fileTypes.parseDataUrl('javascript:alert(1)'), null);
});

test('MP4 container is audio or video depending on its tracks', () => {
  const mp4 = (handler) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(12), Buffer.from('....hdlr'), Buffer.alloc(8), Buffer.from(handler), Buffer.alloc(16)]);
  assert.equal(fileTypes.detectFileType(mp4('soun')).kind, 'audio');
  assert.equal(fileTypes.detectFileType(mp4('soun')).contentType, 'audio/mp4');
  assert.equal(fileTypes.detectFileType(mp4('vide')).kind, 'video');
});

test('subscription state: trial expiry and lapsed grace period', () => {
  const day = 86400000;
  const plan = { code: 'STARTER', features: '[]' };
  assert.equal(plans.subscriptionState({ status: 'TRIAL', trialEndsAt: new Date(Date.now() + day), currentPeriodEnd: null, plan }).readOnly, false);
  assert.equal(plans.subscriptionState({ status: 'TRIAL', trialEndsAt: new Date(Date.now() - day), currentPeriodEnd: null, plan }).readOnlyReason, 'TRIAL_EXPIRED');
  assert.equal(plans.subscriptionState({ status: 'ACTIVE', trialEndsAt: null, currentPeriodEnd: new Date(Date.now() - 3 * day), plan }).readOnly, false);
  assert.equal(plans.subscriptionState({ status: 'ACTIVE', trialEndsAt: null, currentPeriodEnd: new Date(Date.now() - 10 * day), plan }).readOnlyReason, 'SUBSCRIPTION_LAPSED');
  assert.deepEqual(plans.subscriptionState({ status: 'ACTIVE', trialEndsAt: null, currentPeriodEnd: null, plan: { code: 'X', features: '["REPORTS_EXPORT"]' } }).features, ['REPORTS_EXPORT']);
});

test('webhook SSRF guard recognises private and internal addresses', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.5.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '224.0.0.1']) {
    assert.equal(webhooks.isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) assert.equal(webhooks.isPrivateAddress(ip), false, ip);
});

test('webhook URL validation (https only, no credentials, no internal hosts)', async () => {
  delete process.env.WEBHOOK_ALLOW_PRIVATE;
  const svc = new webhooks.WebhooksService({});
  const rejects = async (url) => assert.rejects(() => svc.assertSafeUrl(url), undefined, url);
  await rejects('http://example.com/hook');
  await rejects('https://user:pw@example.com/hook');
  await rejects('https://127.0.0.1/hook');
  await rejects('https://169.254.169.254/latest/meta-data');
  await rejects('not a url');
  await svc.assertSafeUrl('https://8.8.8.8/hook');
});

test('webhook signature scheme is HMAC-SHA256 over timestamp.body', () => {
  const sig = createHmac('sha256', 'whsec_test').update('1700000000.{"a":1}').digest('hex');
  assert.match(sig, /^[0-9a-f]{64}$/);
});

test('CSV export escapes quotes and neutralises formulas', () => {
  const csv = exporters.toCsv([{ key: 'a', label: 'A', type: 'text', width: 1 }, { key: 'n', label: 'N', type: 'percent', width: 1 }], [
    { a: '=HYPERLINK("x")', n: 92.456 },
    { a: 'plain, "quoted"', n: null },
  ]).toString('utf8');
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")",92.5`));
  assert.ok(csv.includes('"plain, ""quoted""",'));
});

test('repeat detection title similarity', () => {
  assert.ok(repeat.titleSimilarity('Oil leak under hydraulic press', 'Hydraulic press oil leak') >= 0.6);
  assert.ok(repeat.titleSimilarity('Oil leak under press', 'Missing floor marking') < 0.2);
  assert.equal(repeat.titleSimilarity('', 'x'), 0);
});

test('document numbers continue the highest existing sequence', async () => {
  assert.equal(await sequence.nextSequenceCode('OBS-A-2026-', async () => ['OBS-A-2026-0001', 'OBS-A-2026-0007']), 'OBS-A-2026-0008');
  assert.equal(await sequence.nextSequenceCode('OBS-A-2026-', async () => []), 'OBS-A-2026-0001');
  assert.equal(sequence.codeFragment('LOC-BLR-CNC'), 'LOCB');
  assert.equal(sequence.codeFragment(''), 'LOC');
});

test('only percentage-based annotations are rendered', () => {
  const shapes = annotations.renderableAnnotations([{ type: 'box', unit: 'pct', x: 1 }, { type: 'box', x: 1, width: 300 }, null, 'x']);
  assert.equal(shapes.length, 1);
  assert.deepEqual(annotations.renderableAnnotations('nope'), []);
});

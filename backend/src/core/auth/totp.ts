import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getJwtSecret } from './jwt.config';

/**
 * RFC 6238 time-based one-time passwords (Google Authenticator, Microsoft Authenticator, 1Password...).
 * SHA-1, 6 digits, 30-second step, ±1 step tolerance for clock drift.
 */
const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = '';
  bytes.forEach((b) => (bits += b.toString(2).padStart(8, '0')));
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (const c of clean) {
    const v = BASE32.indexOf(c);
    if (v < 0) throw new Error('Invalid base32 secret');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS).toString();
  return code.padStart(DIGITS, '0');
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

/** Returns the matching time step (for replay protection) or null. */
export function verifyTotp(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = currentStep(now);
  for (const s of [step, step - 1, step + 1]) {
    const expected = Buffer.from(totpAt(secret, s));
    if (timingSafeEqual(expected, Buffer.from(code))) return s;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ---------------------------------------------------------------------------
// Secret encryption at rest (AES-256-GCM). MFA_ENCRYPTION_KEY (32+ chars) or derived from JWT_SECRET.
// ---------------------------------------------------------------------------

const encryptionKey = () =>
  createHash('sha256')
    .update(process.env.MFA_ENCRYPTION_KEY && process.env.MFA_ENCRYPTION_KEY.length >= 32 ? process.env.MFA_ENCRYPTION_KEY : `mfa:${getJwtSecret()}`)
    .digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1') throw new Error('Unknown secret format');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// ---------------------------------------------------------------------------
// Recovery codes: shown once, stored hashed, each usable once.
// ---------------------------------------------------------------------------

export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

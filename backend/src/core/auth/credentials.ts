import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';

export const BCRYPT_COST = 10;

/** Password policy shared by DTO validation: 8+ chars with upper, lower, digit and symbol. */
export const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/;
export const PASSWORD_POLICY_MESSAGE =
  'Password must be 8–128 characters and include upper-case, lower-case, a digit and a symbol';

export const PIN_POLICY_REGEX = /^\d{4,8}$/;
export const PIN_POLICY_MESSAGE = 'PIN must be 4 to 8 digits';

export function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, BCRYPT_COST);
}

/**
 * One-time password handed to an administrator when an account is provisioned
 * without an explicit password. Satisfies PASSWORD_POLICY_REGEX.
 */
export function generateTemporaryPassword(): string {
  return `Tmp-${randomBytes(9).toString('base64url')}7a!`;
}

const MIN_SECRET_LENGTH = 32;

/** Session lifetimes, in seconds. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 hours
export const REMEMBER_ME_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Reads the signing secret and refuses to start with a missing or weak one,
 * so the API can never run with forgeable tokens.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters long.`);
  }
  return secret;
}

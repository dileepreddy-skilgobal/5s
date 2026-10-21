import { Prisma } from '@prisma/client';

/**
 * User fields that are safe to return from the API.
 * Credentials (passwordHash, pinHash) and lockout counters must never leave the server.
 */
export const publicUserSelect = {
  id: true,
  tenantId: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  phone: true,
  jobTitle: true,
  department: true,
  status: true,
  isSuperAdmin: true,
  badgeId: true,
  lastLoginAt: true,
  // Whether two-factor is on (never the secret itself)
  mfaEnabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

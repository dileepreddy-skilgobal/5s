import { Prisma } from '@prisma/client';

/** Role assignments still in force: no end date, or an end date in the future (time-bound access, BRD external auditors). */
export const activeAssignmentWhere = (now: Date = new Date()): Prisma.UserRoleAssignmentWhereInput => ({
  OR: [{ validUntil: null }, { validUntil: { gt: now } }],
});

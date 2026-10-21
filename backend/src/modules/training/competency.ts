import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantSettings } from '../../core/config/tenant-settings';

/**
 * Auditor competency gate (BRD auditor qualification): when the tenant requires certified auditors,
 * a user may only conduct an audit while holding a valid, unrevoked training certificate.
 * Platform super admins are exempt.
 */
export async function assertCertifiedAuditor(
  db: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  settings: TenantSettings,
): Promise<void> {
  if (!settings.competency.requireCertifiedAuditors) return;
  const user = await db.user.findFirst({ where: { id: userId, tenantId }, select: { isSuperAdmin: true } });
  if (user?.isSuperAdmin) return;
  const valid = await db.trainingCertificate.count({
    where: { tenantId, userId, revokedAt: null, validUntil: { gt: new Date() } },
  });
  if (valid === 0) {
    throw new ForbiddenException(
      'Your organization requires a valid 5S auditor certificate to conduct audits. Complete the training assessment in the Training Academy first.',
    );
  }
}

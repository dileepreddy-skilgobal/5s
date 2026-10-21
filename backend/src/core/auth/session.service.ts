import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/** Refresh `lastSeenAt` at most this often, so validation stays one read per request. */
const TOUCH_INTERVAL_MS = 5 * 60000;

/**
 * Server-side record of each signed-in device. Access tokens carry the session id, so signing out,
 * "sign out other devices", password changes and administrator actions take effect immediately.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: { tenantId: string; userId: string; authMethod: string; ttlSeconds: number; ipAddress?: string | null; userAgent?: string | null }) {
    return this.prisma.authSession.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        authMethod: input.authMethod,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
        expiresAt: new Date(Date.now() + input.ttlSeconds * 1000),
      },
      select: { id: true, expiresAt: true },
    });
  }

  /** True when the session exists for this user, is not revoked and not expired. */
  async isActive(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.prisma.authSession.findFirst({
      where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { lastSeenAt: true },
    });
    if (!session) return false;
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.authSession.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } });
    }
    return true;
  }

  list(userId: string) {
    return this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, authMethod: true, ipAddress: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true },
    });
  }

  async revoke(sessionId: string, userId: string, reason: string): Promise<boolean> {
    const { count } = await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return count > 0;
  }

  async revokeAll(userId: string, reason: string, exceptSessionId?: string): Promise<number> {
    const { count } = await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return count;
  }
}

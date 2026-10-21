import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { subscriptionState } from '../subscription/plans';

const KEY_PREFIX = 'fsk_';
const TOUCH_INTERVAL_MS = 5 * 60000;
/** Roles an integration key may act as (platform super-admin power is never delegated to a key). */
export const API_KEY_ROLES = ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AUDITOR', 'EXTERNAL_AUDITOR'];
/** Areas an API key can never reach: identity, credentials, key management and platform administration. */
const BLOCKED_PATHS = ['/api/v1/auth', '/api/v1/api-keys', '/api/v1/platform', '/api/v1/notifications', '/api/v1/settings', '/api/v1/webhooks'];

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const base62 = (bytes: number) => randomBytes(bytes).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, bytes);

/** Integration credentials sent as `X-API-Key`. Only a hash is stored; the key is shown once. */
@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, createdById: string, input: { name: string; roleCode: string; readOnly: boolean; expiresAt?: string | null }) {
    if (!API_KEY_ROLES.includes(input.roleCode)) throw new BadRequestException(`roleCode must be one of ${API_KEY_ROLES.join(', ')}`);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) throw new BadRequestException('expiresAt must be in the future');
    const prefix = `${KEY_PREFIX}${base62(10)}`;
    const key = `${prefix}_${randomBytes(32).toString('base64url')}`;
    const record = await this.prisma.apiKey.create({
      data: { tenantId, name: input.name.trim(), prefix, keyHash: sha256(key), roleCode: input.roleCode, readOnly: input.readOnly, createdById, expiresAt },
    });
    return { ...this.view(record), key, notice: 'Copy this key now. For security it cannot be shown again.' };
  }

  async list(tenantId: string) {
    const keys = await this.prisma.apiKey.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    return keys.map((k) => this.view(k));
  }

  async revoke(tenantId: string, id: string) {
    const { count } = await this.prisma.apiKey.updateMany({ where: { id, tenantId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (count === 0) throw new NotFoundException('Active API key not found');
    return { id, revoked: true };
  }

  private view(k: { id: string; name: string; prefix: string; roleCode: string; readOnly: boolean; lastUsedAt: Date | null; expiresAt: Date | null; revokedAt: Date | null; createdAt: Date }) {
    const status = k.revokedAt ? 'REVOKED' : k.expiresAt && k.expiresAt < new Date() ? 'EXPIRED' : 'ACTIVE';
    return { id: k.id, name: k.name, prefix: k.prefix, roleCode: k.roleCode, readOnly: k.readOnly, status, lastUsedAt: k.lastUsedAt, expiresAt: k.expiresAt, createdAt: k.createdAt };
  }

  /** Resolves a presented key to a request identity, or throws. */
  async authenticate(rawKey: string, method: string, path: string): Promise<AuthenticatedUser | null> {
    if (!rawKey.startsWith(KEY_PREFIX)) return null;
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: sha256(rawKey) },
      include: { tenant: { select: { status: true, trialEndsAt: true, currentPeriodEnd: true, plan: { select: { code: true, features: true } } } } },
    });
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) return null;
    if (['SUSPENDED', 'CANCELLED'].includes(key.tenant.status)) throw new ForbiddenException('Your organization account is not active.');
    const subscription = subscriptionState(key.tenant);
    if (!subscription.features.includes('API_ACCESS')) {
      throw new ForbiddenException("PLAN_FEATURE_REQUIRED: API_ACCESS is not included in your organization's plan.");
    }
    if (BLOCKED_PATHS.some((p) => path.startsWith(p))) throw new ForbiddenException('This endpoint is not available to API keys.');
    if (key.readOnly && !['GET', 'HEAD', 'OPTIONS'].includes(method)) throw new ForbiddenException('This API key is read-only.');
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    }
    return {
      userId: key.createdById,
      email: `api-key:${key.name}`,
      homeTenantId: key.tenantId,
      tenantId: key.tenantId,
      roles: [key.roleCode],
      isSuperAdmin: false,
      sessionId: `api-key:${key.id}`,
      mfaEnrollmentRequired: false,
      subscription,
      apiKeyId: key.id,
    };
  }
}

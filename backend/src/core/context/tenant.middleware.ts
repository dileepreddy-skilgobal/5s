import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantContext } from './tenant-context';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private slugCache = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const rawTenantHeader = (req.headers['x-tenant-id'] as string) || (req.query.tenantId as string) || '';
    const userId = (req.headers['x-user-id'] as string) || undefined;
    const isSuperAdmin = req.headers['x-super-admin'] === 'true';

    let resolvedTenantId = rawTenantHeader;

    if (rawTenantHeader) {
      if (this.slugCache.has(rawTenantHeader)) {
        resolvedTenantId = this.slugCache.get(rawTenantHeader)!;
      } else {
        try {
          const tenant = await this.prisma.tenant.findFirst({
            where: {
              OR: [
                { id: rawTenantHeader },
                { slug: rawTenantHeader },
              ],
            },
            select: { id: true, slug: true },
          });

          if (tenant) {
            resolvedTenantId = tenant.id;
            this.slugCache.set(rawTenantHeader, tenant.id);
            this.slugCache.set(tenant.slug, tenant.id);
            this.slugCache.set(tenant.id, tenant.id);
          }
        } catch (err) {
          // Keep raw header if DB lookup fails
        }
      }
    }

    if (!resolvedTenantId) {
      try {
        const firstTenant = await this.prisma.tenant.findFirst({ select: { id: true } });
        resolvedTenantId = firstTenant?.id || 'default-tenant-skilglobal';
      } catch {
        resolvedTenantId = 'default-tenant-skilglobal';
      }
    }

    req.headers['x-tenant-id'] = resolvedTenantId;
    (req as any).tenantId = resolvedTenantId;

    TenantContext.run(
      {
        tenantId: resolvedTenantId,
        userId,
        isSuperAdmin,
      },
      () => {
        next();
      },
    );
  }
}


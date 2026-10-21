import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantSettings, parseStoredSettings, readTenantSettings } from './tenant-settings';

type Db = PrismaService | Prisma.TransactionClient;

/** Reads and writes the per-tenant configuration (Tenant.settings JSON + hierarchy levels). */
@Injectable()
export class TenantSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenantId: string, db: Db = this.prisma): Promise<TenantSettings> {
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    return readTenantSettings(tenant?.settings);
  }

  async getWithHierarchy(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true, hierarchyConfig: true } });
    if (!tenant) throw new NotFoundException('Organization not found');
    let hierarchyLevels: string[] = [];
    try {
      hierarchyLevels = JSON.parse(tenant.hierarchyConfig);
    } catch {
      hierarchyLevels = [];
    }
    return { ...readTenantSettings(tenant.settings), hierarchyLevels };
  }

  /** Applies a partial update; sections and keys not supplied keep their stored values. */
  async update(tenantId: string, patch: Partial<Record<keyof TenantSettings, unknown>> & { hierarchyLevels?: string[] }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    if (!tenant) throw new NotFoundException('Organization not found');
    const stored = parseStoredSettings(tenant.settings) as Record<string, unknown>;
    const { hierarchyLevels, ...sections } = patch;
    const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    // Objects merge key by key at every level; arrays and scalars replace what was stored
    const merge = (current: unknown, value: unknown): unknown => {
      if (!isPlainObject(value) || !isPlainObject(current)) return value;
      const out: Record<string, unknown> = { ...current };
      for (const [k, v] of Object.entries(value)) {
        if (v !== undefined) out[k] = merge(current[k], v);
      }
      return out;
    };
    for (const [key, value] of Object.entries(sections)) {
      if (value === undefined) continue;
      stored[key] = merge(stored[key], value);
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: JSON.stringify(stored),
        ...(hierarchyLevels ? { hierarchyConfig: JSON.stringify(hierarchyLevels) } : {}),
      },
    });
    return this.getWithHierarchy(tenantId);
  }
}

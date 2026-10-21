import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Prisma models that carry a `tenantId` column and can be referenced by id from client payloads. */
export type TenantScopedModel =
  | 'user'
  | 'role'
  | 'orgNode'
  | 'location'
  | 'locationTimeline'
  | 'locationDocument'
  | 'standard'
  | 'standardRevision'
  | 'auditTemplate'
  | 'auditTemplateVersion'
  | 'auditTemplateSection'
  | 'auditTemplateQuestion'
  | 'auditSchedule'
  | 'scheduledAuditInstance'
  | 'auditExecution'
  | 'observation'
  | 'correctiveAction'
  | 'redTag';

type CountDelegate = { count(args: { where: Record<string, unknown> }): Promise<number> };

/**
 * Guards against cross-tenant references (IDOR): every id supplied by a client must be
 * verified to belong to the caller's tenant before it is read, linked or mutated.
 */
@Injectable()
export class TenantReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  private delegate(model: TenantScopedModel): CountDelegate {
    // Every TenantScopedModel delegate exposes `count`; the cast only narrows the union of delegate types.
    return this.prisma[model] as unknown as CountDelegate;
  }

  /**
   * Throws 404 unless the record exists in the tenant (and matches any extra constraints,
   * e.g. a parent id). A 404 is used deliberately so other tenants' ids are indistinguishable from missing ones.
   */
  async assertExists(
    tenantId: string,
    model: TenantScopedModel,
    id: string,
    label: string,
    extraWhere: Record<string, unknown> = {},
  ): Promise<void> {
    const count = await this.delegate(model).count({ where: { ...extraWhere, id, tenantId } });
    if (count === 0) {
      throw new NotFoundException(`${label} '${id}' not found`);
    }
  }

  /** Same as assertExists, but skips null/undefined/empty values (optional references). */
  async assertOptional(
    tenantId: string,
    model: TenantScopedModel,
    id: string | null | undefined,
    label: string,
    extraWhere: Record<string, unknown> = {},
  ): Promise<void> {
    if (id) {
      await this.assertExists(tenantId, model, id, label, extraWhere);
    }
  }

  /** Verifies that every id in the list belongs to the tenant. */
  async assertAll(
    tenantId: string,
    model: TenantScopedModel,
    ids: Array<string | null | undefined>,
    label: string,
    extraWhere: Record<string, unknown> = {},
  ): Promise<void> {
    const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
    if (unique.length === 0) return;
    const count = await this.delegate(model).count({ where: { ...extraWhere, id: { in: unique }, tenantId } });
    if (count !== unique.length) {
      throw new NotFoundException(`One or more ${label} references were not found`);
    }
  }
}

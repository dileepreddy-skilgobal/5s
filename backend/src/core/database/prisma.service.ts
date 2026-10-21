import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Models with a `deletedAt` column. Deleting one of these marks it deleted instead of removing it. */
export const SOFT_DELETE_MODELS = new Set<Prisma.ModelName>([
  'User',
  'OrgNode',
  'Location',
  'Standard',
  'AuditTemplate',
  'AuditSchedule',
  'AuditExecution',
  'Observation',
  'CorrectiveAction',
  'RedTag',
  'LocationEvidence',
]);

/** Operations whose `where` gets `deletedAt: null` so soft-deleted rows are invisible by default. */
const FILTERED_ACTIONS = new Set<Prisma.PrismaAction>([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

    // Soft delete: top-level reads and updates skip deleted rows unless the query names `deletedAt`
    // itself (e.g. an administrator listing deleted records). Nested includes are not covered by
    // middleware; services filter those explicitly.
    this.$use(async (params, next) => {
      if (params.model && SOFT_DELETE_MODELS.has(params.model) && FILTERED_ACTIONS.has(params.action)) {
        const args = (params.args ??= {});
        const where = (args.where ??= {});
        if (!Object.prototype.hasOwnProperty.call(where, 'deletedAt')) {
          where.deletedAt = null;
        }
      }
      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

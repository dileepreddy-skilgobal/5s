import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getJwtSecret } from '../auth/jwt.config';

/** Chain used for events that cannot be tied to a tenant (e.g. sign-in attempts for unknown accounts). */
export const PLATFORM_CHAIN = 'PLATFORM';
const GENESIS_HASH = '0'.repeat(64);
const MAX_CHANGES_LENGTH = 20000;

export interface ActivityEntry {
  tenantId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  outcome: 'SUCCESS' | 'FAILURE';
  statusCode?: number | null;
  summary: string;
  changes?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

type StoredFields = Omit<Prisma.ActivityLogUncheckedCreateInput, 'id' | 'hash'> & { createdAt: Date };

/**
 * Append-only activity trail (BRD audit-trail requirement).
 *
 * Tamper evidence: every row stores an HMAC over its content and the previous row's hash, forming a
 * chain per tenant. Editing, deleting or re-ordering any row breaks verification. The HMAC key lives
 * outside the database, so someone with only database access cannot re-forge the chain. A database
 * trigger additionally rejects UPDATE / DELETE / TRUNCATE on the table.
 */
@Injectable()
export class ActivityLogService implements OnModuleInit {
  private readonly logger = new Logger(ActivityLogService.name);
  private readonly key: string;

  constructor(private readonly prisma: PrismaService) {
    const explicit = process.env.ACTIVITY_LOG_KEY;
    if (explicit && explicit.length >= 32) {
      this.key = explicit;
    } else {
      // Derived key keeps development setups working; production should set ACTIVITY_LOG_KEY so
      // rotating JWT_SECRET does not invalidate verification of existing history.
      this.key = createHash('sha256').update(`activity-log:${getJwtSecret()}`).digest('hex');
      if (process.env.NODE_ENV === 'production') {
        this.logger.warn('ACTIVITY_LOG_KEY is not set; deriving the activity-log key from JWT_SECRET.');
      }
    }
  }

  async onModuleInit() {
    // Idempotent: makes the table append-only at the database level
    await this.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION activity_log_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'ActivityLog is append-only (% rejected)', TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await this.prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'activity_log_no_modify') THEN
          CREATE TRIGGER activity_log_no_modify BEFORE UPDATE OR DELETE ON "ActivityLog"
            FOR EACH ROW EXECUTE FUNCTION activity_log_append_only();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'activity_log_no_truncate') THEN
          CREATE TRIGGER activity_log_no_truncate BEFORE TRUNCATE ON "ActivityLog"
            FOR EACH STATEMENT EXECUTE FUNCTION activity_log_append_only();
        END IF;
      END $$;
    `);
  }

  private digest(row: StoredFields): string {
    const canonical = JSON.stringify([
      row.chainKey,
      row.sequence,
      row.prevHash,
      row.createdAt.toISOString(),
      row.tenantId ?? null,
      row.actorId ?? null,
      row.actorEmail ?? null,
      row.action,
      row.entityType ?? null,
      row.entityId ?? null,
      row.outcome,
      row.statusCode ?? null,
      row.summary,
      row.changes ?? null,
      row.ipAddress ?? null,
      row.userAgent ?? null,
    ]);
    return createHmac('sha256', this.key).update(canonical).digest('hex');
  }

  /** Appends an entry. Never throws: a logging failure must not fail the business operation. */
  async record(entry: ActivityEntry): Promise<void> {
    const chainKey = entry.tenantId || PLATFORM_CHAIN;
    let changes: string | null = null;
    if (entry.changes !== undefined && entry.changes !== null) {
      changes = JSON.stringify(entry.changes);
      if (changes.length > MAX_CHANGES_LENGTH) {
        changes = JSON.stringify({ truncated: true, preview: changes.slice(0, MAX_CHANGES_LENGTH) });
      }
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        // Serialise appends per chain so concurrent requests cannot fork it
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chainKey}))`;
        const last = await tx.activityLog.findFirst({
          where: { chainKey },
          orderBy: { sequence: 'desc' },
          select: { sequence: true, hash: true },
        });
        const row: StoredFields = {
          chainKey,
          sequence: (last?.sequence ?? 0) + 1,
          prevHash: last?.hash ?? GENESIS_HASH,
          createdAt: new Date(),
          tenantId: entry.tenantId ?? null,
          actorId: entry.actorId ?? null,
          actorEmail: entry.actorEmail ?? null,
          action: entry.action,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          outcome: entry.outcome,
          statusCode: entry.statusCode ?? null,
          summary: entry.summary.slice(0, 1000),
          changes,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent?.slice(0, 500) ?? null,
        };
        await tx.activityLog.create({ data: { ...row, hash: this.digest(row) } });
      });
    } catch (err) {
      this.logger.error(`Failed to record activity ${entry.action}: ${(err as Error).message}`);
    }
  }

  /** Recomputes the whole chain for a tenant and reports the first broken link, if any. */
  async verify(tenantId: string) {
    const pageSize = 1000;
    let expectedPrev = GENESIS_HASH;
    let expectedSeq = 1;
    let checked = 0;
    for (let cursor = 0; ; ) {
      const rows = await this.prisma.activityLog.findMany({
        where: { chainKey: tenantId, sequence: { gt: cursor } },
        orderBy: { sequence: 'asc' },
        take: pageSize,
      });
      for (const r of rows) {
        const problem =
          r.sequence !== expectedSeq
            ? `entry #${expectedSeq} is missing`
            : r.prevHash !== expectedPrev
              ? `entry #${r.sequence} does not link to the previous entry`
              : this.digest(r) !== r.hash
                ? `entry #${r.sequence} was modified after it was written`
                : null;
        if (problem) {
          return { valid: false, entriesChecked: checked, brokenAtSequence: r.sequence, problem };
        }
        expectedPrev = r.hash;
        expectedSeq++;
        checked++;
      }
      if (rows.length < pageSize) break;
      cursor = rows[rows.length - 1].sequence;
    }
    return { valid: true, entriesChecked: checked, brokenAtSequence: null, problem: null };
  }
}

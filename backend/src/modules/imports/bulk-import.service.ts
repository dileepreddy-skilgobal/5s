import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../core/database/prisma.service';
import { TenantSettingsService } from '../../core/config/tenant-settings.service';
import { SubscriptionService } from '../../core/subscription/subscription.service';
import { MailService } from '../../core/notifications/mail.service';
import { getFrontendUrl } from '../../core/config/app-url';
import { IMPORTERS, IMPORT_KINDS, ImportContext, ImportKind, ImportRow, INVITE_TTL_HOURS, RowError } from './importers';

const MAX_IMPORT_ROWS = 2000;

/** Spreadsheet imports for locations, users, checklist questions, standards and legacy corrective actions. */
@Injectable()
export class BulkImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: TenantSettingsService,
    private readonly subscription: SubscriptionService,
    private readonly mail: MailService,
  ) {}

  definition(kind: string) {
    if (!IMPORT_KINDS.includes(kind as ImportKind)) throw new NotFoundException(`Unknown import '${kind}'. Available: ${IMPORT_KINDS.join(', ')}`);
    return IMPORTERS[kind as ImportKind];
  }

  catalogue() {
    return IMPORT_KINDS.map((k) => ({ kind: k, title: IMPORTERS[k].title, columns: IMPORTERS[k].columns }));
  }

  /** Template workbook: header + example row, and an instructions sheet describing each column. */
  template(kind: string): Buffer {
    const def = this.definition(kind);
    const sheet = XLSX.utils.aoa_to_sheet([def.columns.map((c) => c.header), def.columns.map((c) => c.example)]);
    sheet['!cols'] = def.columns.map((c) => ({ wch: Math.max(14, c.header.length + 4, Math.min(40, c.example.length + 2)) }));
    const help = XLSX.utils.aoa_to_sheet([['Column', 'Required', 'Description'], ...def.columns.map((c) => [c.header, c.required ? 'Yes' : 'No', c.description])]);
    help['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 90 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, def.title.slice(0, 31));
    XLSX.utils.book_append_sheet(book, help, 'Instructions');
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** Reads the first sheet; headers are matched case-insensitively to the importer's columns. */
  parse(kind: string, buffer: Buffer): ImportRow[] {
    const def = this.definition(kind);
    const book = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' });
    const byHeader = new Map(def.columns.map((c) => [c.header.toLowerCase().replace(/[\s_]/g, ''), c.key]));
    return raw
      .map((r) => {
        const row: ImportRow = {};
        for (const [header, value] of Object.entries(r)) {
          const key = byHeader.get(header.toLowerCase().replace(/[\s_]/g, ''));
          if (!key) continue;
          row[key] = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').trim();
        }
        return row;
      })
      .filter((row) => Object.values(row).some((v) => v !== ''));
  }

  private async context(tenantId: string, userId: string): Promise<ImportContext> {
    return { prisma: this.prisma, tenantId, userId, settings: await this.settings.get(tenantId) };
  }

  private normalise(rows: unknown): ImportRow[] {
    if (!Array.isArray(rows)) throw new BadRequestException('rows must be an array');
    if (rows.length === 0) throw new BadRequestException('The file has no data rows');
    if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`A single import may contain at most ${MAX_IMPORT_ROWS} rows (received ${rows.length}).`);
    return rows.map((r) => {
      const row: ImportRow = {};
      if (r && typeof r === 'object') for (const [k, v] of Object.entries(r as Record<string, unknown>)) row[k] = v === null || v === undefined ? '' : String(v).trim();
      return row;
    });
  }

  async dryRun(kind: string, tenantId: string, userId: string, rawRows: unknown) {
    const def = this.definition(kind);
    const rows = this.normalise(rawRows);
    const errors = await def.validate(await this.context(tenantId, userId), rows);
    const limitWarning = kind === 'users' || kind === 'locations' ? await this.limitMessage(tenantId, kind, rows.length) : null;
    const badRows = new Set(errors.map((e) => e.rowNumber));
    return {
      kind,
      totalRows: rows.length,
      validCount: rows.length - badRows.size,
      errorCount: errors.length,
      errors,
      ...(limitWarning ? { limitWarning } : {}),
      parsedData: rows,
    };
  }

  private async limitMessage(tenantId: string, kind: 'users' | 'locations', adding: number): Promise<string | null> {
    try {
      await this.subscription.assertWithinLimit(tenantId, kind, adding);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }

  /** Re-validates server-side (never trusting an earlier dry run) and writes everything or nothing. */
  async commit(kind: string, tenantId: string, userId: string, rawRows: unknown) {
    const def = this.definition(kind);
    const rows = this.normalise(rawRows);
    const ctx = await this.context(tenantId, userId);
    const errors: RowError[] = await def.validate(ctx, rows);
    if (errors.length) {
      throw new BadRequestException({ message: `${errors.length} problem(s) found. Fix them and run the check again.`, errors });
    }
    // The whole batch must fit within the plan
    if (kind === 'users' || kind === 'locations') await this.subscription.assertWithinLimit(tenantId, kind, rows.length);

    const result = await this.prisma.$transaction((tx) => def.commit(ctx, rows, tx), { timeout: 60000 });

    let invitationsSent = 0;
    if (kind === 'users') {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
      const invites = (result.details?.invites ?? []) as Array<{ email: string; firstName: string; token: string }>;
      for (const invite of invites) {
        const link = `${getFrontendUrl()}/reset-password?token=${invite.token}&welcome=1`;
        const status = await this.mail.send({
          to: invite.email,
          subject: `You have been invited to ${tenant?.name ?? 'the 5S platform'}`,
          text: `Hello ${invite.firstName},\n\nAn account has been created for you on the ${tenant?.name ?? ''} 5S platform. Choose your password within ${INVITE_TTL_HOURS} hours using this link:\n\n${link}\n`,
          html: `<p>Hello ${invite.firstName},</p><p>An account has been created for you on the ${tenant?.name ?? ''} 5S platform.</p><p><a href="${link}">Choose your password</a> (valid ${INVITE_TTL_HOURS} hours).</p>`,
        });
        if (status !== 'FAILED') invitationsSent++;
      }
    }
    return { kind, created: result.created, ...(kind === 'users' ? { invitationsSent } : {}) };
  }
}

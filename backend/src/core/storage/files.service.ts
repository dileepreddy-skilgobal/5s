import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import sharp = require('./sharp');
import { PrismaService } from '../database/prisma.service';
import { getJwtSecret } from '../auth/jwt.config';
import { createStorageDriver, StorageDriver } from './storage.driver';
import { detectFileType, MAX_BYTES, parseDataUrl } from './file-types';
import { burnAnnotations as burnAnnotationsIntoImage, renderableAnnotations } from './annotation-renderer';

/** Canonical reference stored in records: `/api/v1/files/<uuid>` (no host, no signature). */
export const FILE_PATH = '/api/v1/files/';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** Matches canonical, absolute and already-signed forms of our file URLs. */
export const FILE_URL_PATTERN = new RegExp(`(?:https?://[^\\s"'/]+(?::\\d+)?)?${FILE_PATH.replace(/\//g, '\\/')}(${UUID})(?:\\?[^\\s"']*)?`, 'gi');
const THUMB_WIDTH = 320;
const DEFAULT_TTL_SECONDS = 6 * 3600;

export interface StoredFileView {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

/**
 * Stores evidence files outside the database (disk or S3), enforces type, size and tenant storage
 * quota, keeps a SHA-256 for integrity, generates thumbnails for images, and issues short-lived
 * signed download URLs bound to the tenant.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly driver: StorageDriver = createStorageDriver();
  private readonly signingKey: string;

  constructor(private readonly prisma: PrismaService) {
    this.signingKey = process.env.FILE_URL_SECRET && process.env.FILE_URL_SECRET.length >= 32
      ? process.env.FILE_URL_SECRET
      : createHash('sha256').update(`file-urls:${getJwtSecret()}`).digest('hex');
  }

  get driverName() {
    return this.driver.name;
  }

  // ---------------------------------------------------------------------------
  // Storing
  // ---------------------------------------------------------------------------

  async store(input: { tenantId: string; uploadedById?: string | null; buffer: Buffer; originalName?: string | null; source?: string }): Promise<StoredFileView> {
    const type = detectFileType(input.buffer);
    if (!type) {
      throw new BadRequestException('Unsupported file type. Allowed: JPEG, PNG, WebP, GIF, HEIC images; PDF; MP3/M4A/AAC/WAV audio; MP4/MOV/WebM/3GP video.');
    }
    if (input.buffer.length > MAX_BYTES[type.kind]) {
      throw new HttpException(`File too large: ${type.kind} files are limited to ${Math.round(MAX_BYTES[type.kind] / 1048576)} MB.`, HttpStatus.PAYLOAD_TOO_LARGE);
    }
    await this.assertQuota(input.tenantId, input.buffer.length);

    const id = randomUUID();
    const now = new Date();
    const key = `${input.tenantId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${type.extension}`;
    let width: number | null = null;
    let height: number | null = null;
    let thumbnailKey: string | null = null;

    if (type.kind === 'image') {
      try {
        const meta = await sharp(input.buffer).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
        // Thumbnails are re-encoded, which also strips EXIF (location, device) from what lists display
        const thumb = await sharp(input.buffer).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
        thumbnailKey = `${key}.thumb.webp`;
        await this.driver.put(thumbnailKey, thumb, 'image/webp');
      } catch (err) {
        // A file that only claims to be an image (valid header, corrupt body) is rejected
        throw new BadRequestException(`The image could not be read: ${(err as Error).message}`);
      }
    }

    await this.driver.put(key, input.buffer, type.contentType);
    await this.prisma.storedFile.create({
      data: {
        id,
        tenantId: input.tenantId,
        storageKey: key,
        thumbnailKey,
        originalName: input.originalName?.slice(0, 200) ?? null,
        contentType: type.contentType,
        sizeBytes: input.buffer.length,
        sha256: createHash('sha256').update(input.buffer).digest('hex'),
        width,
        height,
        uploadedById: input.uploadedById ?? null,
        source: input.source,
      },
    });
    await this.refreshUsage(input.tenantId);
    return this.view({ id, contentType: type.contentType, sizeBytes: input.buffer.length, width, height, thumbnailKey }, input.tenantId);
  }

  /** Stores a `data:` URL and returns the canonical reference to put in the record. */
  async storeDataUrl(tenantId: string, uploadedById: string | null, dataUrl: string, source: string): Promise<string> {
    const buffer = parseDataUrl(dataUrl);
    if (!buffer) throw new BadRequestException(`${source}: malformed data URL`);
    const file = await this.store({ tenantId, uploadedById, buffer, source });
    return `${FILE_PATH}${file.id}`;
  }

  private async assertQuota(tenantId: string, incoming: number) {
    const [tenant, used] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { storageQuotaMb: true } }),
      this.prisma.storedFile.aggregate({ where: { tenantId }, _sum: { sizeBytes: true } }),
    ]);
    const quotaBytes = (tenant?.storageQuotaMb ?? 0) * 1048576;
    if (quotaBytes > 0 && (used._sum.sizeBytes ?? 0) + incoming > quotaBytes) {
      throw new HttpException(
        `Your organization has reached its storage quota of ${tenant?.storageQuotaMb} MB. Contact your administrator to increase it.`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
  }

  /** Keeps Tenant.storageUsedMb (shown in admin screens) in line with what is actually stored. */
  private async refreshUsage(tenantId: string) {
    const used = await this.prisma.storedFile.aggregate({ where: { tenantId }, _sum: { sizeBytes: true } });
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { storageUsedMb: Math.ceil((used._sum.sizeBytes ?? 0) / 1048576) } });
  }

  async usage(tenantId: string) {
    const [tenant, agg] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { storageQuotaMb: true } }),
      this.prisma.storedFile.aggregate({ where: { tenantId }, _sum: { sizeBytes: true }, _count: { _all: true } }),
    ]);
    const usedBytes = agg._sum.sizeBytes ?? 0;
    const quotaBytes = (tenant?.storageQuotaMb ?? 0) * 1048576;
    return {
      driver: this.driver.name,
      files: agg._count._all,
      usedBytes,
      quotaBytes,
      usedPercent: quotaBytes ? Math.round((usedBytes / quotaBytes) * 1000) / 10 : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Signed URLs
  // ---------------------------------------------------------------------------

  private signature(id: string, tenantId: string, exp: number, variant: string) {
    return createHmac('sha256', this.signingKey).update(`${id}:${tenantId}:${exp}:${variant}`).digest('base64url');
  }

  private publicBase() {
    return (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
  }

  signedUrl(id: string, tenantId: string, variant: 'original' | 'thumb' = 'original', ttlSeconds = DEFAULT_TTL_SECONDS): string {
    // Expiry is rounded to the hour so the same file keeps the same URL for a while (browser cache)
    const exp = Math.ceil((Date.now() / 1000 + ttlSeconds) / 3600) * 3600;
    const params = new URLSearchParams({ t: tenantId, exp: String(exp), ...(variant === 'thumb' ? { v: 'thumb' } : {}), sig: this.signature(id, tenantId, exp, variant) });
    return `${this.publicBase()}${FILE_PATH}${id}?${params.toString()}`;
  }

  /** Replaces every file reference inside a string with a signed URL for the given tenant (keeping the thumbnail variant). */
  signString(value: string, tenantId: string): string {
    // A link a service already signed (e.g. another organization's logo in the platform console) is kept as is
    return value.replace(FILE_URL_PATTERN, (match, id: string) =>
      /[?&]sig=/.test(match) ? match : this.signedUrl(id.toLowerCase(), tenantId, /[?&]v=thumb(?:&|$)/.test(match) ? 'thumb' : 'original'),
    );
  }

  /** Turns any form of our file URL (signed / absolute) back into the canonical stored reference. */
  canonicalize(value: string): string {
    return value.replace(FILE_URL_PATTERN, (_m, id: string) => `${FILE_PATH}${id.toLowerCase()}`);
  }

  private view(f: { id: string; contentType: string; sizeBytes: number; width: number | null; height: number | null; thumbnailKey: string | null }, tenantId: string): StoredFileView {
    return {
      id: f.id,
      url: this.signedUrl(f.id, tenantId),
      thumbnailUrl: f.thumbnailKey ? this.signedUrl(f.id, tenantId, 'thumb') : null,
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      width: f.width,
      height: f.height,
    };
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  /** Validates a signed URL and returns the bytes to serve. */
  async readSigned(id: string, q: { t?: string; exp?: string; sig?: string; v?: string }) {
    const variant = q.v === 'thumb' ? 'thumb' : 'original';
    const exp = Number(q.exp);
    if (!q.t || !q.sig || !Number.isFinite(exp)) throw new NotFoundException('File not found');
    if (exp < Date.now() / 1000) throw new HttpException('This link has expired. Reload the page to get a new one.', HttpStatus.GONE);
    const expected = Buffer.from(this.signature(id, q.t, exp, variant));
    const given = Buffer.from(q.sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new NotFoundException('File not found');

    const file = await this.prisma.storedFile.findFirst({ where: { id, tenantId: q.t } });
    if (!file) throw new NotFoundException('File not found');
    const key = variant === 'thumb' && file.thumbnailKey ? file.thumbnailKey : file.storageKey;
    const body = await this.driver.get(key);
    return {
      body,
      contentType: key === file.thumbnailKey ? 'image/webp' : file.contentType,
      fileName: file.originalName,
      maxAge: Math.max(0, Math.floor(exp - Date.now() / 1000)),
      sha256: key === file.storageKey ? file.sha256 : null,
    };
  }

  /** Server-side read of a tenant's file by its canonical reference (`/api/v1/files/<id>`). */
  async readReference(tenantId: string, reference: string): Promise<{ id: string; body: Buffer; contentType: string } | null> {
    const id = /^\/api\/v1\/files\/([0-9a-f-]{36})$/i.exec(this.canonicalize(reference))?.[1];
    if (!id) return null;
    const file = await this.prisma.storedFile.findFirst({ where: { id: id.toLowerCase(), tenantId } });
    if (!file) return null;
    return { id: file.id, body: await this.driver.get(file.storageKey), contentType: file.contentType };
  }

  /**
   * Burns percentage-based annotations into a stored photo and returns the reference of the new,
   * annotated copy (the original stays untouched as evidence). Returns null when there is nothing to draw.
   */
  async burnAnnotations(tenantId: string, userId: string | null, photoRef: string | null | undefined, annotations: unknown, source: string): Promise<string | null> {
    const shapes = renderableAnnotations(annotations);
    if (!photoRef || shapes.length === 0) return null;
    // Same photo + same drawing => same annotated file (clients resend evidence on every draft save)
    const key = `annotated:${createHash('sha256').update(this.canonicalize(photoRef) + JSON.stringify(shapes)).digest('hex')}`;
    const existing = await this.prisma.storedFile.findFirst({ where: { tenantId, source: key }, select: { id: true } });
    if (existing) return `${FILE_PATH}${existing.id}`;
    const photo = await this.readReference(tenantId, photoRef);
    if (!photo || !photo.contentType.startsWith('image/')) return null;
    try {
      const burned = await burnAnnotationsIntoImage(photo.body, shapes);
      const stored = await this.store({ tenantId, uploadedById: userId, buffer: burned, source: key });
      return `${FILE_PATH}${stored.id}`;
    } catch (err) {
      this.logger.warn(`Could not render annotations for ${source}: ${(err as Error).message}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Migration of inline (base64) media already in the database
  // ---------------------------------------------------------------------------

  /**
   * Moves base64 `data:` media stored inside records into file storage. Idempotent; signatures stay
   * inline because they are part of the signed record. Returns per-field counts.
   */
  async migrateInline(tenantId: string): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    const scalar: Array<{ model: string; table: string; column: string }> = [
      { model: 'observation', table: 'Observation', column: 'beforePhotoUrl' },
      { model: 'observation', table: 'Observation', column: 'annotatedPhotoUrl' },
      { model: 'correctiveAction', table: 'CorrectiveAction', column: 'afterPhotoUrl' },
      { model: 'redTag', table: 'RedTag', column: 'photoUrl' },
      { model: 'redTag', table: 'RedTag', column: 'closurePhotoUrl' },
      { model: 'auditAnswer', table: 'AuditAnswer', column: 'voiceNoteUrl' },
      { model: 'location', table: 'Location', column: 'heroPhotoUrl' },
      { model: 'locationDocument', table: 'LocationDocument', column: 'fileUrl' },
      { model: 'auditTemplateQuestion', table: 'AuditTemplateQuestion', column: 'referencePhotoUrl' },
    ];
    for (const { table, column } of scalar) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; value: string }>>(
        `SELECT id, "${column}" AS value FROM "${table}" WHERE "tenantId" = $1 AND "${column}" LIKE 'data:%'`,
        tenantId,
      );
      let n = 0;
      for (const row of rows) {
        try {
          const ref = await this.storeDataUrl(tenantId, null, row.value, `${table}.${column}`);
          await this.prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${column}" = $1 WHERE id = $2`, ref, row.id);
          n++;
        } catch (err) {
          this.logger.warn(`Could not migrate ${table}.${column} ${row.id}: ${(err as Error).message}`);
        }
      }
      result[`${table}.${column}`] = n;
    }
    // JSON columns holding arrays of URLs or { photoUrl, annotatedPhotoUrl } objects
    for (const { table, column } of [
      { table: 'AuditAnswer', column: 'evidenceUrls' },
      { table: 'AuditExecution', column: 'counterEvidenceUrls' },
    ]) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; value: string }>>(
        `SELECT id, "${column}" AS value FROM "${table}" WHERE "tenantId" = $1 AND "${column}" LIKE '%data:%'`,
        tenantId,
      );
      let n = 0;
      for (const row of rows) {
        try {
          const converted = await this.convertDeep(JSON.parse(row.value), tenantId, null, `${table}.${column}`);
          await this.prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${column}" = $1 WHERE id = $2`, JSON.stringify(converted), row.id);
          n++;
        } catch (err) {
          this.logger.warn(`Could not migrate ${table}.${column} ${row.id}: ${(err as Error).message}`);
        }
      }
      result[`${table}.${column}`] = n;
    }
    return result;
  }

  /** Replaces every data URL inside a JSON value with a stored-file reference. */
  async convertDeep(value: unknown, tenantId: string, userId: string | null, source: string): Promise<unknown> {
    if (typeof value === 'string') {
      return value.startsWith('data:') ? this.storeDataUrl(tenantId, userId, value, source) : this.canonicalize(value);
    }
    if (Array.isArray(value)) return Promise.all(value.map((v) => this.convertDeep(v, tenantId, userId, source)));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = await this.convertDeep(v, tenantId, userId, `${source}.${k}`);
      return out;
    }
    return value;
  }
}

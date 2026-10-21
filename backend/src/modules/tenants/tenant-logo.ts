import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { FILE_PATH, FilesService } from '../../core/storage/files.service';

/** Logos are shown small (headers, reports, certificates); anything larger is a mistake, not a better logo. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const FILE_REF = /^\/api\/v1\/files\/([0-9a-f-]{36})$/i;

interface ResolveLogoInput {
  /** Tenant the request runs in: inline uploads (data URLs) have already been stored there by MediaIngestInterceptor. */
  callerTenantId: string;
  /** Tenant whose logo is being set. */
  targetTenantId: string;
  uploadedById?: string | null;
  /** Stored-file reference (after ingest), an https URL, or '' / null to remove the logo. */
  value: string | null | undefined;
}

/**
 * Turns a submitted logo into what Tenant.logoUrl stores: a canonical `/api/v1/files/<id>` reference to an
 * image owned by the target tenant (never a base64 blob). An upload made while acting in another tenant
 * (a platform administrator editing a customer) is copied into the customer's storage so it can be served
 * with that customer's signed URLs. Returns undefined when no logo change was requested.
 */
export async function resolveTenantLogo(prisma: PrismaService, files: FilesService, input: ResolveLogoInput): Promise<string | null | undefined> {
  if (input.value === undefined) return undefined;
  const raw = (input.value ?? '').trim();
  if (!raw) return null;

  const id = FILE_REF.exec(files.canonicalize(raw))?.[1]?.toLowerCase();
  if (!id) {
    if (/^https?:\/\/\S+$/i.test(raw) && raw.length <= 2048) return raw;
    throw new BadRequestException('The logo must be an uploaded image (PNG, JPG, WebP or GIF).');
  }

  const own = await prisma.storedFile.findFirst({ where: { id, tenantId: input.targetTenantId }, select: { contentType: true, sizeBytes: true } });
  if (own) {
    assertLogo(own.contentType, own.sizeBytes);
    return `${FILE_PATH}${id}`;
  }
  if (input.callerTenantId === input.targetTenantId) throw new BadRequestException('The logo file was not found.');

  const uploaded = await files.readReference(input.callerTenantId, `${FILE_PATH}${id}`);
  if (!uploaded) throw new BadRequestException('The logo file was not found.');
  assertLogo(uploaded.contentType, uploaded.body.length);
  const stored = await files.store({
    tenantId: input.targetTenantId,
    uploadedById: input.uploadedById ?? null,
    buffer: uploaded.body,
    source: 'tenants.logoUrl',
  });
  return `${FILE_PATH}${stored.id}`;
}

function assertLogo(contentType: string, sizeBytes: number) {
  if (!contentType.startsWith('image/')) throw new BadRequestException('The logo must be an image (PNG, JPG, WebP or GIF).');
  if (sizeBytes > MAX_LOGO_BYTES) throw new BadRequestException('The logo must be 2 MB or smaller.');
}

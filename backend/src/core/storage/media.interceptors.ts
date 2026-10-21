import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Request } from 'express';
import { from, Observable } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { AuthenticatedUser } from '../auth/auth.types';
import { FILE_PATH, FilesService } from './files.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH']);
/** Signatures stay inline: they are small and part of the signed record itself. */
const KEEP_INLINE_KEY = /signature/i;
const MAX_DEPTH = 8;

/**
 * Inbound: media sent inline as base64 `data:` URLs (web and mobile clients do this for photos,
 * annotated evidence and voice notes) is moved into file storage before validation, and the record
 * stores the canonical `/api/v1/files/<id>` reference. Signed URLs echoed back by clients are
 * normalised to that canonical form as well.
 */
@Injectable()
export class MediaIngestInterceptor implements NestInterceptor {
  constructor(private readonly files: FilesService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!MUTATING.has(req.method) || !req.user || !req.body || typeof req.body !== 'object') return next.handle();
    const { tenantId, userId } = req.user;
    const segment = (req.route?.path ?? req.path).replace(/^\/api\/v1\//, '').split('/')[0];

    const walk = async (value: unknown, key: string, depth: number): Promise<unknown> => {
      if (typeof value === 'string') {
        if (value.startsWith('data:') && !KEEP_INLINE_KEY.test(key)) {
          return this.files.storeDataUrl(tenantId, userId, value, `${segment}.${key}`);
        }
        return value.includes(FILE_PATH) ? this.files.canonicalize(value) : value;
      }
      if (depth >= MAX_DEPTH || !value || typeof value !== 'object') return value;
      if (Array.isArray(value)) return Promise.all(value.map((v) => walk(v, key, depth + 1)));
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = await walk(v, k, depth + 1);
      return out;
    };

    return from(walk(req.body, 'body', 0)).pipe(
      mergeMap((body) => {
        req.body = body;
        return next.handle();
      }),
    );
  }
}

/**
 * Outbound: every stored-file reference in a response becomes a short-lived signed URL for the
 * caller's tenant, so `<img src>` works without exposing files to anyone holding only the id.
 */
@Injectable()
export class SignedUrlInterceptor implements NestInterceptor {
  constructor(private readonly files: FilesService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const tenantId = req.user?.tenantId;
    if (!tenantId) return next.handle();

    const sign = (value: unknown, depth: number): unknown => {
      if (typeof value === 'string') return value.includes(FILE_PATH) ? this.files.signString(value, tenantId) : value;
      if (depth >= 12 || !value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
      if (Array.isArray(value)) return value.map((v) => sign(v, depth + 1));
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sign(v, depth + 1);
      return out;
    };

    return next.handle().pipe(map((data) => (data instanceof StreamableFile ? data : sign(data, 0))));
  }
}

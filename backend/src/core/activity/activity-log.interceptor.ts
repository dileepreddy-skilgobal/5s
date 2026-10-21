import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, from, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { ActivityLogService } from './activity-log.service';
import { sanitizePayload, diffRecords, requestMeta, activitySummary, recordLabel } from './activity-log.util';
import { WEBHOOK_EVENTS, WebhooksService } from '../integrations/webhooks.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Routes that log their own, more specific events (sign-in outcomes). */
const SELF_LOGGED_ROUTES = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/pin-login',
  '/api/v1/auth/sso',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/mfa/verify',
]);

type SnapshotModel =
  | 'user'
  | 'role'
  | 'orgNode'
  | 'location'
  | 'standard'
  | 'auditTemplate'
  | 'auditSchedule'
  | 'auditExecution'
  | 'observation'
  | 'correctiveAction'
  | 'redTag'
  | 'tenant';

/** Route patterns whose `:id` addresses a record we can snapshot before and after the change. */
const ENTITY_ROUTES: Array<{ pattern: RegExp; model: SnapshotModel; entityType: string; idFromTenant?: boolean }> = [
  { pattern: /^\/api\/v1\/settings$/, model: 'tenant', entityType: 'Settings', idFromTenant: true },
  { pattern: /^\/api\/v1\/users\/roles\/:id/, model: 'role', entityType: 'Role' },
  { pattern: /^\/api\/v1\/users\/:id/, model: 'user', entityType: 'User' },
  { pattern: /^\/api\/v1\/organization\/nodes\/:id/, model: 'orgNode', entityType: 'OrgNode' },
  { pattern: /^\/api\/v1\/locations\/:id/, model: 'location', entityType: 'Location' },
  { pattern: /^\/api\/v1\/standards\/:id/, model: 'standard', entityType: 'Standard' },
  { pattern: /^\/api\/v1\/audit-templates\/:id/, model: 'auditTemplate', entityType: 'AuditTemplate' },
  { pattern: /^\/api\/v1\/audit-schedules\/:id/, model: 'auditSchedule', entityType: 'AuditSchedule' },
  { pattern: /^\/api\/v1\/audit-executions\/:id/, model: 'auditExecution', entityType: 'AuditExecution' },
  { pattern: /^\/api\/v1\/observations\/:id/, model: 'observation', entityType: 'Observation' },
  { pattern: /^\/api\/v1\/corrective-actions\/:id/, model: 'correctiveAction', entityType: 'CorrectiveAction' },
  { pattern: /^\/api\/v1\/red-tags\/:id/, model: 'redTag', entityType: 'RedTag' },
  { pattern: /^\/api\/v1\/tenants\/:id/, model: 'tenant', entityType: 'Tenant' },
];

/** Entity names for routes without an `:id` (creates, bulk operations). */
const SEGMENT_ENTITY: Record<string, string> = {
  users: 'User',
  organization: 'OrgNode',
  locations: 'Location',
  standards: 'Standard',
  'audit-templates': 'AuditTemplate',
  'audit-schedules': 'AuditSchedule',
  'audit-executions': 'AuditExecution',
  observations: 'Observation',
  'corrective-actions': 'CorrectiveAction',
  'red-tags': 'RedTag',
  tenants: 'Tenant',
  imports: 'Import',
  analytics: 'Recognition',
  training: 'Training',
};

const GENERIC_HANDLERS = new Set(['create', 'update', 'delete', 'remove', 'patch', 'upsert']);

const toAction = (handler: string) => handler.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

/**
 * Records every state-changing request in the activity trail: who, what, when, from where, the
 * outcome, the sanitized payload and — for routes addressing a known record — the field-level
 * before/after difference. Read requests are not logged.
 */
@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(
    private readonly activity: ActivityLogService,
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
  ) {}

  private async snapshot(model: SnapshotModel, id: string, tenantId: string): Promise<Record<string, unknown> | null> {
    // `deletedAt: undefined` opts out of the soft-delete filter so a just-deleted record can be read back
    const where = model === 'tenant' ? { id } : { id, tenantId, ...(model === 'role' ? {} : { deletedAt: undefined }) };
    const delegate = this.prisma[model] as unknown as { findFirst(args: { where: object }): Promise<Record<string, unknown> | null> };
    try {
      return await delegate.findFirst({ where });
    } catch {
      return null;
    }
  }

  /** Names the parent record of nested routes such as /locations/:locationId/routine/items. */
  private async parentLabel(params: Record<string, string> | undefined, tenantId: string | null): Promise<string | null> {
    const locationId = params?.locationId;
    if (!locationId || !tenantId) return null;
    try {
      return recordLabel(await this.prisma.location.findFirst({ where: { id: locationId, tenantId }, select: { areaCode: true, name: true } }));
    } catch {
      return null;
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const routePath: string = req.route?.path ?? req.path;
    if (!MUTATING_METHODS.has(req.method) || SELF_LOGGED_ROUTES.has(routePath)) return next.handle();

    const user = req.user;
    const tenantId = user?.tenantId ?? null;
    const entityRoute = ENTITY_ROUTES.find((r) => r.pattern.test(routePath));
    const paramId: string | undefined = req.params?.id;
    // Routes that act on the caller's organization (e.g. /settings) are snapshotted by tenant id
    const targetId: string | undefined = entityRoute?.idFromTenant ? tenantId ?? undefined : paramId;
    const segment = routePath.replace(/^\/api\/v1\//, '').split('/')[0];
    const entityType = entityRoute?.entityType ?? SEGMENT_ENTITY[segment] ?? segment;
    // Generic handler names (create, update, delete...) get the entity appended: CREATE_OBSERVATION
    const handler = context.getHandler().name;
    const action = GENERIC_HANDLERS.has(handler) ? `${toAction(handler)}_${toAction(entityType)}` : toAction(handler);
    const payload = sanitizePayload(req.body);
    const meta = requestMeta(req);

    const route = `${req.method} ${routePath}`;
    const write = (outcome: 'SUCCESS' | 'FAILURE', statusCode: number, entityId: string | null, diff: unknown, label: string | null, error?: string) =>
      this.activity.record({
        tenantId,
        actorId: user?.userId ?? null,
        actorEmail: user?.email ?? null,
        action,
        entityType,
        entityId,
        outcome,
        statusCode,
        summary: activitySummary({ action, entityType, label, outcome, statusCode, error }),
        // The raw method and route stay available in the entry's details
        changes: { route, ...(diff ? { diff } : {}), ...(payload !== undefined ? { request: payload } : {}) },
        ...meta,
      });

    const before$ =
      entityRoute && targetId && tenantId ? from(this.snapshot(entityRoute.model, targetId, tenantId)) : from(Promise.resolve(null));

    return before$.pipe(
      mergeMap((before) =>
        next.handle().pipe(
          mergeMap(async (result) => {
            const res = context.switchToHttp().getResponse<{ statusCode: number }>();
            const created = result as { id?: unknown; data?: { id?: unknown } } | null;
            const resultId = typeof created?.id === 'string' ? created.id : typeof created?.data?.id === 'string' ? created.data.id : null;
            const entityId = targetId ?? resultId;
            let diff: unknown = null;
            let after: Record<string, unknown> | null = null;
            if (entityRoute && targetId && tenantId) {
              after = await this.snapshot(entityRoute.model, targetId, tenantId);
              diff = diffRecords(before, after);
            }
            // Organization-wide routes (/settings) need no record name
            const label = entityRoute?.idFromTenant
              ? null
              : recordLabel(after) ?? recordLabel(before) ?? (await this.parentLabel(req.params, tenantId)) ?? recordLabel(created?.data ?? created);
            await write('SUCCESS', res.statusCode, entityId, diff, label);
            // Integration events for subscribed webhooks (written to the outbox, delivered in the background)
            const event = WEBHOOK_EVENTS[`${entityType}:${handler}`];
            if (event && tenantId) {
              await this.webhooks.emit(tenantId, event, { id: entityId, entityType, actor: user?.email ?? null, changes: diff, record: sanitizePayload(result) ?? null });
            }
            return result;
          }),
          catchError((err: unknown) => {
            const status = err instanceof HttpException ? err.getStatus() : 500;
            // Denied and failed operations are security-relevant; validation / not-found noise is not
            const record = status === 403 || status >= 500 ? write('FAILURE', status, paramId ?? null, null, null, (err as Error).message) : Promise.resolve();
            return from(record).pipe(mergeMap(() => throwError(() => err)));
          }),
        ),
      ),
    );
  }
}

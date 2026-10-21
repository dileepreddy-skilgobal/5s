import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { PrismaService } from '../database/prisma.service';
import { decryptSecret, encryptSecret } from '../auth/totp';

/** Events integrations can subscribe to, keyed by `<entityType>:<controller handler>`. */
export const WEBHOOK_EVENTS: Record<string, string> = {
  'Observation:create': 'observation.created',
  'Observation:update': 'observation.updated',
  'Observation:delete': 'observation.deleted',
  'CorrectiveAction:create': 'action.created',
  'CorrectiveAction:update': 'action.updated',
  'CorrectiveAction:submitClosure': 'action.closure_submitted',
  'CorrectiveAction:verify': 'action.verified',
  'CorrectiveAction:close': 'action.closed',
  'CorrectiveAction:delete': 'action.deleted',
  'AuditExecution:start': 'audit.started',
  'AuditExecution:submit': 'audit.submitted',
  'AuditExecution:acknowledge': 'audit.acknowledged',
  'AuditExecution:dispute': 'audit.disputed',
  'AuditExecution:resolveDispute': 'audit.dispute_resolved',
  'RedTag:create': 'red_tag.created',
  'RedTag:submitDisposition': 'red_tag.disposition_submitted',
  'RedTag:closeRedTag': 'red_tag.closed',
  'Location:createLocation': 'location.created',
  'Location:updateLocation': 'location.updated',
  'Location:deleteLocation': 'location.deleted',
  'AuditSchedule:generateAudits': 'audit_plan.generated',
};
/** Events raised by the background scheduler rather than by an API call. */
export const SCHEDULED_WEBHOOK_EVENTS = ['action.overdue'] as const;
export const EVENT_NAMES = [...new Set([...Object.values(WEBHOOK_EVENTS), ...SCHEDULED_WEBHOOK_EVENTS])].sort();

/** Retry schedule after a failed attempt (minutes); after the last one the delivery is FAILED. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 720];
const DISABLE_AFTER_FAILURES = 20;
const TIMEOUT_MS = 10000;
/** A claimed delivery that was not finished within this time (crashed instance) becomes due again. */
const CLAIM_LEASE_MS = 5 * 60000;

/**
 * Outbound webhooks with an outbox: events are written as deliveries in the request, then a
 * background dispatcher POSTs them, signs each body (HMAC-SHA256 over `timestamp.body`), retries with
 * backoff and disables endpoints that keep failing. Private / internal addresses are refused (SSRF).
 * Rows are claimed with FOR UPDATE SKIP LOCKED, so several API instances can dispatch concurrently.
 */
@Injectable()
export class WebhooksService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WebhooksService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    const seconds = Number(process.env.WEBHOOK_DISPATCH_SECONDS ?? 10);
    if (seconds > 0) this.timer = setInterval(() => void this.dispatchDue(), seconds * 1000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------------------------------------------------------------------------
  // Endpoint management
  // ---------------------------------------------------------------------------

  private async assertSafeUrl(raw: string) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('Invalid URL');
    }
    const allowPrivate = process.env.WEBHOOK_ALLOW_PRIVATE === 'true';
    if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) throw new BadRequestException('Webhook URLs must use https');
    if (url.username || url.password) throw new BadRequestException('Credentials in the URL are not allowed; verify the signature instead');
    if (allowPrivate) return;
    const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true }).catch(() => []);
    if (addresses.length === 0) throw new BadRequestException(`Cannot resolve ${url.hostname}`);
    if (addresses.some((a) => isPrivateAddress(a.address))) throw new BadRequestException('Webhook URLs may not point to private or internal network addresses');
  }

  async create(tenantId: string, createdById: string, input: { url: string; description?: string; events: string[] }) {
    await this.assertSafeUrl(input.url);
    const events = this.validEvents(input.events);
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: { tenantId, url: input.url, description: input.description, events: JSON.stringify(events), secretEncrypted: encryptSecret(secret), createdById },
    });
    return { ...this.view(endpoint), secret, notice: 'Store this signing secret now; it is shown only once.' };
  }

  private validEvents(events: string[]) {
    const unknown = events.filter((e) => e !== '*' && !EVENT_NAMES.includes(e));
    if (unknown.length) throw new BadRequestException(`Unknown event(s): ${unknown.join(', ')}`);
    if (events.length === 0) throw new BadRequestException('Subscribe to at least one event (or "*")');
    return [...new Set(events)];
  }

  async update(tenantId: string, id: string, input: { url?: string; description?: string; events?: string[]; isActive?: boolean }) {
    await this.get(tenantId, id);
    if (input.url) await this.assertSafeUrl(input.url);
    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(input.url ? { url: input.url } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.events ? { events: JSON.stringify(this.validEvents(input.events)) } : {}),
        // Re-enabling clears the failure streak
        ...(input.isActive !== undefined ? { isActive: input.isActive, ...(input.isActive ? { consecutiveFailures: 0, disabledReason: null } : {}) } : {}),
      },
    });
    return this.view(endpoint);
  }

  async rotateSecret(tenantId: string, id: string) {
    await this.get(tenantId, id);
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    await this.prisma.webhookEndpoint.update({ where: { id }, data: { secretEncrypted: encryptSecret(secret) } });
    return { id, secret, notice: 'Store this signing secret now; it is shown only once.' };
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    return { id, deleted: true };
  }

  async list(tenantId: string) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    return endpoints.map((e) => this.view(e));
  }

  private async get(tenantId: string, id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id, tenantId } });
    if (!endpoint) throw new NotFoundException('Webhook not found');
    return endpoint;
  }

  private view(e: { id: string; url: string; description: string | null; events: string; isActive: boolean; consecutiveFailures: number; disabledReason: string | null; lastDeliveryAt: Date | null; createdAt: Date }) {
    return { id: e.id, url: e.url, description: e.description, events: JSON.parse(e.events) as string[], isActive: e.isActive, consecutiveFailures: e.consecutiveFailures, disabledReason: e.disabledReason, lastDeliveryAt: e.lastDeliveryAt, createdAt: e.createdAt };
  }

  async deliveries(tenantId: string, endpointId: string) {
    await this.get(tenantId, endpointId);
    return this.prisma.webhookDelivery.findMany({
      where: { tenantId, endpointId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, event: true, status: true, attempts: true, nextAttemptAt: true, responseStatus: true, error: true, deliveredAt: true, createdAt: true },
    });
  }

  async retry(tenantId: string, deliveryId: string) {
    const { count } = await this.prisma.webhookDelivery.updateMany({ where: { id: deliveryId, tenantId, status: 'FAILED' }, data: { status: 'PENDING', nextAttemptAt: new Date() } });
    if (count === 0) throw new NotFoundException('Failed delivery not found');
    return { id: deliveryId, status: 'PENDING' };
  }

  /** Queues a `ping` to one endpoint and delivers it immediately. */
  async test(tenantId: string, endpointId: string) {
    const endpoint = await this.get(tenantId, endpointId);
    const delivery = await this.prisma.webhookDelivery.create({
      // Leased up front so the background dispatcher does not send it a second time
      data: { tenantId, endpointId: endpoint.id, event: 'ping', nextAttemptAt: new Date(Date.now() + CLAIM_LEASE_MS), payload: JSON.stringify(this.envelope('ping', tenantId, { message: 'Test delivery from the 5S platform' })) },
    });
    await this.deliver(delivery.id);
    return this.prisma.webhookDelivery.findUnique({ where: { id: delivery.id }, select: { id: true, status: true, responseStatus: true, error: true } });
  }

  // ---------------------------------------------------------------------------
  // Emitting & delivering
  // ---------------------------------------------------------------------------

  private envelope(event: string, tenantId: string, data: unknown) {
    return { id: randomBytes(12).toString('hex'), event, occurredAt: new Date().toISOString(), tenantId, data };
  }

  /** Writes an outbox row per subscribed endpoint. Never throws into the caller. */
  async emit(tenantId: string, event: string, data: unknown): Promise<void> {
    try {
      const endpoints = await this.prisma.webhookEndpoint.findMany({ where: { tenantId, isActive: true }, select: { id: true, events: true } });
      const targets = endpoints.filter((e) => {
        const events = JSON.parse(e.events) as string[];
        return events.includes('*') || events.includes(event);
      });
      if (!targets.length) return;
      const payload = JSON.stringify(this.envelope(event, tenantId, data));
      await this.prisma.webhookDelivery.createMany({ data: targets.map((t) => ({ tenantId, endpointId: t.id, event, payload })) });
    } catch (err) {
      this.logger.error(`Could not queue webhook ${event}: ${(err as Error).message}`);
    }
  }

  async dispatchDue(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      // Claim due rows atomically (safe with several API instances): pushing nextAttemptAt forward by a
      // lease hides them from other dispatchers until this one records the outcome.
      // Prisma stores DateTime as UTC in "timestamp without time zone": compare in UTC on the database
      // side rather than passing JS dates (which Postgres would shift by the session time zone).
      const leaseSeconds = CLAIM_LEASE_MS / 1000;
      const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
        UPDATE "WebhookDelivery"
        SET "nextAttemptAt" = (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ${leaseSeconds})
        WHERE id IN (
          SELECT id FROM "WebhookDelivery"
          WHERE status = 'PENDING' AND "nextAttemptAt" <= (NOW() AT TIME ZONE 'UTC')
          ORDER BY "nextAttemptAt" ASC LIMIT 50
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id`;
      for (const d of claimed) await this.deliver(d.id);
      return claimed.length;
    } catch (err) {
      this.logger.error(`Webhook dispatch failed: ${(err as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async deliver(deliveryId: string) {
    const d = await this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { endpoint: true } });
    if (!d || d.status !== 'PENDING') return;
    if (!d.endpoint.isActive) {
      await this.prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'FAILED', error: 'Endpoint disabled' } });
      return;
    }
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', decryptSecret(d.endpoint.secretEncrypted)).update(`${timestamp}.${d.payload}`).digest('hex');
    let status: number | null = null;
    let body = '';
    let error: string | null = null;
    try {
      // Re-check the address at send time (DNS may have changed since the endpoint was saved)
      await this.assertSafeUrl(d.endpoint.url);
      const res = await fetch(d.endpoint.url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': '5S-Platform-Webhooks/1.0',
          'X-5S-Event': d.event,
          'X-5S-Delivery': d.id,
          'X-5S-Timestamp': timestamp,
          'X-5S-Signature': `sha256=${signature}`,
        },
        body: d.payload,
      });
      status = res.status;
      body = (await res.text()).slice(0, 1000);
    } catch (err) {
      error = (err as Error).message.slice(0, 500);
    }
    const ok = status !== null && status >= 200 && status < 300;
    const attempts = d.attempts + 1;
    const exhausted = attempts > BACKOFF_MINUTES.length;
    await this.prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        attempts,
        responseStatus: status,
        responseBody: body || null,
        error: ok ? null : error ?? `HTTP ${status}`,
        status: ok ? 'SUCCESS' : exhausted ? 'FAILED' : 'PENDING',
        deliveredAt: ok ? new Date() : null,
        nextAttemptAt: ok || exhausted ? d.nextAttemptAt : new Date(Date.now() + BACKOFF_MINUTES[attempts - 1] * 60000),
      },
    });
    const failures = ok ? 0 : d.endpoint.consecutiveFailures + 1;
    await this.prisma.webhookEndpoint.update({
      where: { id: d.endpoint.id },
      data: {
        lastDeliveryAt: new Date(),
        consecutiveFailures: failures,
        ...(failures >= DISABLE_AFTER_FAILURES ? { isActive: false, disabledReason: `Disabled after ${failures} consecutive failed deliveries` } : {}),
      },
    });
  }
}

/** Loopback, private (RFC 1918 / ULA), link-local, CGNAT, metadata and unspecified addresses. */
export function isPrivateAddress(address: string): boolean {
  if (address.includes(':')) {
    const a = address.toLowerCase();
    if (a.startsWith('::ffff:')) return isPrivateAddress(a.slice(7));
    return a === '::1' || a === '::' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80');
  }
  const [a, b] = address.split('.').map(Number);
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

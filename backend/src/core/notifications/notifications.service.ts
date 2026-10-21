import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getFrontendUrl } from '../config/app-url';
import { EscalationRecipient } from '../config/tenant-settings';
import { MailService } from './mail.service';
import { PushService } from './push.service';

export interface NotifyInput {
  tenantId: string;
  userIds: Array<string | null | undefined>;
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  /** App path, e.g. `/capa?id=...` */
  link?: string;
  /** Same key + user is delivered only once (scheduler reminders). */
  dedupeKey?: string;
  /** Do not notify the person who caused the event. */
  excludeUserId?: string | null;
}

/** Context used to resolve escalation recipients for a record. */
export interface RecipientContext {
  tenantId: string;
  assigneeId?: string | null;
  auditorId?: string | null;
  location?: { ownerId: string | null; backupOwnerId: string | null; orgNodePath: string | null } | null;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/**
 * Single entry point for user notifications: stores the in-app notification, then delivers it by
 * email and mobile push according to each user's preferences. Delivery happens after the caller
 * returns, so a slow mail server never slows down or fails a business operation.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly push: PushService,
  ) {}

  /** Returns the number of notifications created (duplicates are skipped). Never throws. */
  async notify(input: NotifyInput): Promise<number> {
    try {
      return await this.store(input);
    } catch (err) {
      this.logger.error(`Notification ${input.type} failed: ${(err as Error).message}`);
      return 0;
    }
  }

  private async store(input: NotifyInput): Promise<number> {
    const ids = [...new Set(input.userIds.filter((id): id is string => !!id && id !== input.excludeUserId))];
    if (ids.length === 0) return 0;
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, tenantId: input.tenantId, status: 'ACTIVE' },
      select: { id: true, email: true, firstName: true, emailNotifications: true, pushNotifications: true },
    });

    // Reminders already sent are skipped up front: relying on the unique-constraint error alone works, but
    // Prisma logs every rejected insert at error level, flooding the log on each scheduler run
    const alreadySent = input.dedupeKey
      ? new Set(
          (
            await this.prisma.notification.findMany({
              where: { tenantId: input.tenantId, dedupeKey: input.dedupeKey, userId: { in: users.map((u) => u.id) } },
              select: { userId: true },
            })
          ).map((n) => n.userId),
        )
      : new Set<string>();

    const created: Array<{ id: string; user: (typeof users)[number] }> = [];
    for (const user of users.filter((u) => !alreadySent.has(u.id))) {
      try {
        const row = await this.prisma.notification.create({
          data: {
            tenantId: input.tenantId,
            userId: user.id,
            type: input.type,
            title: input.title.slice(0, 200),
            body: input.body.slice(0, 2000),
            entityType: input.entityType,
            entityId: input.entityId,
            link: input.link,
            dedupeKey: input.dedupeKey,
            emailStatus: user.emailNotifications ? 'PENDING' : 'SKIPPED',
            pushStatus: user.pushNotifications ? 'PENDING' : 'SKIPPED',
          },
          select: { id: true },
        });
        created.push({ id: row.id, user });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue; // sent concurrently by another instance
        this.logger.error(`Could not store notification ${input.type}: ${(err as Error).message}`);
      }
    }

    if (created.length) {
      setImmediate(() => {
        this.deliver(input, created).catch((err) => this.logger.error(`Delivery failed: ${(err as Error).message}`));
      });
    }
    return created.length;
  }

  private async deliver(input: NotifyInput, rows: Array<{ id: string; user: { id: string; email: string; firstName: string; emailNotifications: boolean; pushNotifications: boolean } }>) {
    const url = input.link ? `${getFrontendUrl()}${input.link}` : getFrontendUrl();
    for (const { id, user } of rows) {
      const emailStatus = user.emailNotifications
        ? await this.mail.send({
            to: user.email,
            subject: input.title,
            text: `Hello ${user.firstName},\n\n${input.body}\n\nOpen: ${url}\n`,
            html: `<p>Hello ${escapeHtml(user.firstName)},</p><p>${escapeHtml(input.body).replace(/\n/g, '<br>')}</p><p><a href="${escapeHtml(url)}">Open in 5S</a></p>`,
          })
        : 'SKIPPED';
      const pushStatus = user.pushNotifications
        ? await this.push.sendToUser(input.tenantId, user.id, input.title, input.body, { link: input.link ?? '', type: input.type, entityId: input.entityId ?? '' })
        : 'SKIPPED';
      await this.prisma.notification.update({ where: { id }, data: { emailStatus, pushStatus } });
    }
  }

  /**
   * Resolves escalation recipients. Relationship recipients come from the record; role recipients
   * are users holding that role either organization-wide or scoped to an ancestor of the location.
   */
  async resolveRecipients(ctx: RecipientContext, recipients: readonly EscalationRecipient[]): Promise<string[]> {
    const ids = new Set<string>();
    const roleCodes: string[] = [];
    for (const r of recipients) {
      if (r === 'ASSIGNEE' && ctx.assigneeId) ids.add(ctx.assigneeId);
      else if (r === 'AREA_OWNER' && ctx.location?.ownerId) ids.add(ctx.location.ownerId);
      else if (r === 'BACKUP_OWNER' && ctx.location?.backupOwnerId) ids.add(ctx.location.backupOwnerId);
      else if (r === 'AUDITOR' && ctx.auditorId) ids.add(ctx.auditorId);
      else if (!['ASSIGNEE', 'AREA_OWNER', 'BACKUP_OWNER', 'AUDITOR'].includes(r)) roleCodes.push(r);
    }
    if (roleCodes.length) {
      const assignments = await this.prisma.userRoleAssignment.findMany({
        // Time-bound assignments (e.g. external auditors) stop receiving escalations once they expire
        where: { tenantId: ctx.tenantId, role: { code: { in: roleCodes } }, OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] },
        select: { userId: true, orgNodeId: true },
      });
      const nodeIds = [...new Set(assignments.map((a) => a.orgNodeId).filter((id): id is string => !!id))];
      const paths = new Map(
        (await this.prisma.orgNode.findMany({ where: { id: { in: nodeIds } }, select: { id: true, path: true } })).map((n) => [n.id, n.path]),
      );
      for (const a of assignments) {
        const scoped = a.orgNodeId ? paths.get(a.orgNodeId) : undefined;
        if (!scoped || !ctx.location?.orgNodePath || ctx.location.orgNodePath.startsWith(scoped)) ids.add(a.userId);
      }
    }
    return [...ids];
  }
}

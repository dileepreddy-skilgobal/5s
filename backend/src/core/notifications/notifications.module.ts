import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { PushService } from './push.service';
import { NotificationsService } from './notifications.service';
import { EscalationScheduler } from './escalation.scheduler';

/** Notification delivery (in-app, email, push) and the reminder / escalation scheduler. */
@Global()
@Module({
  providers: [MailService, PushService, NotificationsService, EscalationScheduler],
  exports: [NotificationsService, MailService, EscalationScheduler],
})
export class NotificationsCoreModule {}

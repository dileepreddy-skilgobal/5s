import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export type DeliveryStatus = 'SENT' | 'FAILED' | 'SKIPPED' | 'LOGGED';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Outbound email over SMTP (any provider: SES, SendGrid, Office 365, Postfix...).
 * Configure SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / MAIL_FROM.
 * Without SMTP_HOST, messages are written to the server log instead (development).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    this.from = process.env.MAIL_FROM || '5S Platform <no-reply@localhost>';
    if (host) {
      const port = Number(process.env.SMTP_PORT || 587);
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
    } else {
      this.transporter = null;
      this.logger.log('SMTP_HOST not set: emails are written to the log instead of being sent.');
    }
  }

  get enabled(): boolean {
    return this.transporter !== null;
  }

  async send(message: MailMessage): Promise<DeliveryStatus> {
    if (!this.transporter) {
      this.logger.log(`[email:log] to=${message.to} subject="${message.subject}"`);
      return 'LOGGED';
    }
    try {
      await this.transporter.sendMail({ from: this.from, ...message });
      return 'SENT';
    } catch (err) {
      this.logger.error(`Email to ${message.to} failed: ${(err as Error).message}`);
      return 'FAILED';
    }
  }
}

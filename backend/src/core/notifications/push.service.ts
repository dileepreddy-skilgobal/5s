import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { DeliveryStatus } from './mail.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
  message?: string;
}

/**
 * Mobile push through the Expo push service. Tokens are registered by the mobile app after sign-in.
 * Set PUSH_NOTIFICATIONS=off to disable (e.g. in CI); EXPO_ACCESS_TOKEN is used when push security is enabled.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  get enabled(): boolean {
    return process.env.PUSH_NOTIFICATIONS !== 'off';
  }

  async sendToUser(tenantId: string, userId: string, title: string, body: string, data: Record<string, string>): Promise<DeliveryStatus> {
    if (!this.enabled) return 'SKIPPED';
    const devices = await this.prisma.pushDevice.findMany({ where: { tenantId, userId }, select: { token: true } });
    if (devices.length === 0) return 'SKIPPED';

    let anyOk = false;
    for (let i = 0; i < devices.length; i += CHUNK) {
      const batch = devices.slice(i, i + CHUNK);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
          },
          body: JSON.stringify(batch.map((d) => ({ to: d.token, title, body, data, sound: 'default' }))),
        });
        const json = (await res.json()) as { data?: ExpoTicket[] };
        const tickets = json.data ?? [];
        for (let j = 0; j < tickets.length; j++) {
          if (tickets[j].status === 'ok') {
            anyOk = true;
          } else if (tickets[j].details?.error === 'DeviceNotRegistered') {
            // The app was uninstalled or the token rotated: forget it
            await this.prisma.pushDevice.deleteMany({ where: { token: batch[j].token } });
          }
        }
      } catch (err) {
        this.logger.warn(`Push delivery failed: ${(err as Error).message}`);
      }
    }
    return anyOk ? 'SENT' : 'FAILED';
  }
}

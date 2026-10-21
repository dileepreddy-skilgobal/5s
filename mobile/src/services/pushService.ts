import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsModule from 'expo-notifications';
import { apiRequest } from './http';

/** Expo push token registered for the signed-in user on this device (removed on sign-out). */
const REGISTERED_TOKEN_KEY = '@5s_v2:push_token';
const ANDROID_CHANNEL_ID = 'default';
const UNREGISTER_TIMEOUT_MS = 5000;

export type NotificationTarget = 'audits' | 'locations' | 'inbox';

/**
 * Screen for a notification (push tap or inbox item). The app has no corrective-action or red-tag
 * screens, so those (and anything unknown) open the notification inbox.
 */
export function notificationTarget(n: { type?: string | null; link?: string | null }): NotificationTarget {
  const type = n.type ?? '';
  const link = n.link ?? '';
  if (type.startsWith('AUDIT_') || /^\/(auditor-hub|area-owner-hub|schedules|audits)/.test(link)) return 'audits';
  if (/^\/locations/.test(link)) return 'locations';
  return 'inbox';
}

/** Payload the server puts in every push notification. */
export interface PushData {
  link?: string;
  type?: string;
  entityId?: string;
}

/**
 * Push notifications exist only on iOS / Android builds: never in the web preview, and not in Expo Go
 * (since SDK 53 Expo Go has no remote push, and merely loading expo-notifications there raises an error
 * on Android). In Expo Go the rest of the app works normally; the in-app notification inbox still works.
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const pushSupported = (Platform.OS === 'ios' || Platform.OS === 'android') && !isExpoGo;

let notificationsModule: typeof NotificationsModule | null = null;
/** Loads expo-notifications on first use, so Expo Go never loads it. Only called when pushSupported. */
const notifications = (): typeof NotificationsModule => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  notificationsModule ??= require('expo-notifications') as typeof NotificationsModule;
  return notificationsModule;
};

let configured = false;
let missingProjectIdLogged = false;

const projectId = (): string | undefined => {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id ? id : undefined;
};

const readData = (raw: unknown): PushData => {
  const d = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return { link: str(d.link), type: str(d.type), entityId: str(d.entityId) };
};

export const PushService = {
  /** Foreground presentation (banner + list) and the Android channel. Safe to call repeatedly. */
  configure(): void {
    if (!pushSupported || configured) return;
    configured = true;
    const Notifications = notifications();
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: '5S alerts',
        importance: Notifications.AndroidImportance.HIGH,
      }).catch(() => undefined);
    }
  },

  /**
   * Registers this device for the signed-in user (physical devices only). Never throws: push is an
   * optional convenience and must not affect sign-in.
   */
  async register(): Promise<void> {
    if (!pushSupported || !Device.isDevice) return;
    try {
      this.configure();
      const id = projectId();
      if (!id) {
        if (!missingProjectIdLogged) {
          missingProjectIdLogged = true;
          console.info('Push notifications disabled: no EAS projectId in app config (extra.eas.projectId).');
        }
        return;
      }

      const Notifications = notifications();
      let perm = await Notifications.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
      if (!perm.granted) return;

      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
      await apiRequest('/notifications/devices', {
        method: 'POST',
        body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
      });
      await AsyncStorage.setItem(REGISTERED_TOKEN_KEY, token);
    } catch (err) {
      console.warn('Push registration failed:', err instanceof Error ? err.message : err);
    }
  },

  /** Removes this device's registration; call while the session is still valid (before /auth/logout). */
  async unregister(): Promise<void> {
    if (!pushSupported) return;
    try {
      const token = await AsyncStorage.getItem(REGISTERED_TOKEN_KEY);
      if (!token) return;
      await AsyncStorage.removeItem(REGISTERED_TOKEN_KEY);
      await apiRequest(`/notifications/devices/${encodeURIComponent(token)}`, { method: 'DELETE', timeoutMs: UNREGISTER_TIMEOUT_MS });
    } catch {
      // Offline: the server drops the device when the token is re-registered or rejected by Expo
    }
  },

  /** Calls `handler` when a notification arrives while the app is open. Returns the unsubscribe function. */
  subscribeToReceived(handler: () => void): () => void {
    if (!pushSupported) return () => undefined;
    const sub = notifications().addNotificationReceivedListener(() => handler());
    return () => sub.remove();
  },

  /**
   * Calls `handler` for notification taps (including the tap that launched the app).
   * Returns the unsubscribe function.
   */
  subscribeToTaps(handler: (data: PushData) => void): () => void {
    if (!pushSupported) return () => undefined;
    const Notifications = notifications();
    let active = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active && response) {
          handler(readData(response.notification.request.content.data));
          try {
            // Handled once: do not navigate again on the next sign-in
            Notifications.clearLastNotificationResponse();
          } catch {
            // Not available on this platform
          }
        }
      })
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handler(readData(response.notification.request.content.data));
    });
    return () => {
      active = false;
      sub.remove();
    };
  },
};

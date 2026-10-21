import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuditExecution, AuditTemplateSnapshot, LocationMaster, RedTagRecord, SyncItem } from '../types';

const VERSION = 'v2';
const userKey = (userId: string, name: string) => `@5s_${VERSION}:${userId}:${name}`;
const QUEUE_KEY = `@5s_${VERSION}:sync_queue`;

/** Keys written by earlier builds (mock-seeded caches and the simulated offline flag). */
const LEGACY_KEYS = [
  '@5s_mobile_audits_v1',
  '@5s_mobile_locations_v1',
  '@5s_mobile_red_tags_v1',
  '@5s_mobile_sync_queue_v1',
  '@5s_mobile_is_offline_simulated_v1',
];

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

/**
 * Device persistence. Master-data caches and drafts are scoped per user so nothing leaks between
 * people sharing a shop-floor device. Nothing is ever seeded with sample data.
 */
export const OfflineStorage = {
  async removeLegacyData(): Promise<void> {
    await AsyncStorage.multiRemove(LEGACY_KEYS);
  },

  // ----- Master data caches (last successful server response) -----
  getLocations: (userId: string) => readJson<LocationMaster[]>(userKey(userId, 'locations'), []),
  saveLocations: (userId: string, list: LocationMaster[]) => writeJson(userKey(userId, 'locations'), list),

  getAudits: (userId: string) => readJson<AuditExecution[]>(userKey(userId, 'audits'), []),
  saveAudits: (userId: string, list: AuditExecution[]) => writeJson(userKey(userId, 'audits'), list),

  getTemplates: (userId: string) => readJson<AuditTemplateSnapshot[]>(userKey(userId, 'templates'), []),
  saveTemplates: (userId: string, list: AuditTemplateSnapshot[]) => writeJson(userKey(userId, 'templates'), list),

  getLastSyncedAt: (userId: string) => readJson<string | null>(userKey(userId, 'last_synced_at'), null),
  saveLastSyncedAt: (userId: string, iso: string) => writeJson(userKey(userId, 'last_synced_at'), iso),

  // ----- Audit drafts (answers in progress, keyed by audit id) -----
  async getDrafts(userId: string): Promise<Record<string, AuditExecution>> {
    return readJson<Record<string, AuditExecution>>(userKey(userId, 'drafts'), {});
  },

  async saveDraft(userId: string, audit: AuditExecution): Promise<void> {
    const drafts = await this.getDrafts(userId);
    drafts[audit.id] = audit;
    await writeJson(userKey(userId, 'drafts'), drafts);
  },

  async removeDraft(userId: string, auditId: string): Promise<void> {
    const drafts = await this.getDrafts(userId);
    if (drafts[auditId]) {
      delete drafts[auditId];
      await writeJson(userKey(userId, 'drafts'), drafts);
    }
  },

  // ----- Red tags registered from this device (shown until the server list refreshes) -----
  getLocalRedTags: (userId: string) => readJson<RedTagRecord[]>(userKey(userId, 'red_tags'), []),
  saveLocalRedTags: (userId: string, list: RedTagRecord[]) => writeJson(userKey(userId, 'red_tags'), list),

  /** Clears the user's cached master data on sign-out; drafts and the sync queue are kept so no work is lost. */
  async clearUserCaches(userId: string): Promise<void> {
    await AsyncStorage.multiRemove(['locations', 'audits', 'templates', 'last_synced_at'].map((n) => userKey(userId, n)));
  },

  // ----- Sync queue (shared, but every item carries the user who created it) -----
  getQueue: () => readJson<SyncItem[]>(QUEUE_KEY, []),
  saveQueue: (items: SyncItem[]) => writeJson(QUEUE_KEY, items),
};

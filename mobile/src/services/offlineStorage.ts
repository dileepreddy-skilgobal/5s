import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuditExecution, LocationMaster, RedTagRecord } from '../types';
import { MOCK_ACTIVE_AUDITS, MOCK_LOCATIONS, MOCK_RED_TAGS } from '../constants/mockData';

const KEYS = {
  AUDITS: '@5s_mobile_audits_v1',
  LOCATIONS: '@5s_mobile_locations_v1',
  RED_TAGS: '@5s_mobile_red_tags_v1',
  OFFLINE_QUEUE: '@5s_mobile_sync_queue_v1',
  IS_OFFLINE_FORCED: '@5s_mobile_is_offline_simulated_v1',
};

export const OfflineStorage = {
  async getAudits(): Promise<AuditExecution[]> {
    try {
      const data = await AsyncStorage.getItem(KEYS.AUDITS);
      if (data) {
        return JSON.parse(data);
      }
      // Seed initial data if first launch
      await AsyncStorage.setItem(KEYS.AUDITS, JSON.stringify(MOCK_ACTIVE_AUDITS));
      return MOCK_ACTIVE_AUDITS;
    } catch {
      return MOCK_ACTIVE_AUDITS;
    }
  },

  async saveAudits(audits: AuditExecution[]): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.AUDITS, JSON.stringify(audits));
    } catch (e) {
      console.info('Failed to save audits locally:', e);
    }
  },

  async saveAuditDraft(audit: AuditExecution): Promise<void> {
    const list = await this.getAudits();
    const index = list.findIndex((a) => a.id === audit.id);
    let updated: AuditExecution[];
    if (index >= 0) {
      updated = [...list];
      updated[index] = audit;
    } else {
      updated = [audit, ...list];
    }
    await this.saveAudits(updated);
  },

  async getLocations(): Promise<LocationMaster[]> {
    try {
      const data = await AsyncStorage.getItem(KEYS.LOCATIONS);
      if (data) return JSON.parse(data);
      await AsyncStorage.setItem(KEYS.LOCATIONS, JSON.stringify(MOCK_LOCATIONS));
      return MOCK_LOCATIONS;
    } catch {
      return MOCK_LOCATIONS;
    }
  },

  async saveLocations(locations: LocationMaster[]): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.LOCATIONS, JSON.stringify(locations));
    } catch (e) {
      console.info('Failed to save locations locally:', e);
    }
  },

  async getRedTags(): Promise<RedTagRecord[]> {
    try {
      const data = await AsyncStorage.getItem(KEYS.RED_TAGS);
      if (data) return JSON.parse(data);
      await AsyncStorage.setItem(KEYS.RED_TAGS, JSON.stringify(MOCK_RED_TAGS));
      return MOCK_RED_TAGS;
    } catch {
      return MOCK_RED_TAGS;
    }
  },

  async saveRedTags(redTags: RedTagRecord[]): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.RED_TAGS, JSON.stringify(redTags));
    } catch (e) {
      console.warn('Failed to save red tags locally', e);
    }
  },

  async addRedTag(tag: RedTagRecord): Promise<void> {
    const list = await this.getRedTags();
    const updated = [tag, ...list];
    await AsyncStorage.setItem(KEYS.RED_TAGS, JSON.stringify(updated));
  },

  async getOfflineQueue(): Promise<AuditExecution[]> {
    try {
      const data = await AsyncStorage.getItem(KEYS.OFFLINE_QUEUE);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  async enqueueOfflineSync(audit: AuditExecution): Promise<void> {
    try {
      const queue = await this.getOfflineQueue();
      const filtered = queue.filter((item) => item.id !== audit.id);
      const updated = [...filtered, { ...audit, isOfflineSyncPending: true }];
      await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to enqueue offline item', e);
    }
  },

  async clearOfflineQueue(): Promise<void> {
    try {
      await AsyncStorage.removeItem(KEYS.OFFLINE_QUEUE);
    } catch (e) {
      console.warn('Failed to clear queue', e);
    }
  },

  async isOfflineMode(): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem(KEYS.IS_OFFLINE_FORCED);
      return val === 'true';
    } catch {
      return false;
    }
  },

  async setOfflineMode(enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.IS_OFFLINE_FORCED, enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('Failed to set offline state', e);
    }
  },
};

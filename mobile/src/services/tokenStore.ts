import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'fives_access_token_v1';

/**
 * Access-token storage.
 * - iOS / Android: OS keychain / keystore via expo-secure-store (encrypted at rest).
 * - Web (development preview only): sessionStorage, cleared when the tab closes.
 */
export const TokenStore = {
  async get(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;
      }
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async set(token: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(TOKEN_KEY, token);
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },

  async clear(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(TOKEN_KEY);
        return;
      }
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // Nothing stored — nothing to clear
    }
  },
};

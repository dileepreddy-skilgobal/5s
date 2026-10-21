import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { GpsFix } from '../types';

/** Longest wait for a fresh position before falling back to the last known one. */
const FIX_TIMEOUT_MS = 12000;

export type LocationOutcome =
  | { status: 'ok'; fix: GpsFix }
  | { status: 'denied' }
  | { status: 'unavailable'; message: string };

const toFix = (p: Location.LocationObject): GpsFix => ({
  latitude: Math.round(p.coords.latitude * 1e6) / 1e6,
  longitude: Math.round(p.coords.longitude * 1e6) / 1e6,
  accuracyM: p.coords.accuracy !== null && p.coords.accuracy !== undefined ? Math.round(p.coords.accuracy) : undefined,
});

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

/**
 * Foreground GPS position for tagging a report. Never throws: location is optional and must not
 * block the report when permission is denied or no fix is available.
 */
export const DeviceLocation = {
  /** True when foreground permission was already granted (no prompt is shown). */
  async isPermitted(): Promise<boolean> {
    try {
      return (await Location.getForegroundPermissionsAsync()).granted;
    } catch {
      return false;
    }
  },

  /** Asks for permission when needed (`prompt`), then reads the current position. */
  async getFix(prompt: boolean): Promise<LocationOutcome> {
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && prompt && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return { status: 'denied' };

      const fresh = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), FIX_TIMEOUT_MS).catch(
        () => null,
      );
      if (fresh) return { status: 'ok', fix: toFix(fresh) };

      if (Platform.OS !== 'web') {
        const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);
        if (last) return { status: 'ok', fix: toFix(last) };
      }
      return { status: 'unavailable', message: 'No GPS fix — move closer to a window or try again.' };
    } catch {
      return { status: 'unavailable', message: 'Location services are turned off or unavailable.' };
    }
  },
};

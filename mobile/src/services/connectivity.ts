import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

/** Online when the device has a connection and the internet is not known to be unreachable. */
const toOnline = (state: NetInfoState): boolean => state.isConnected === true && state.isInternetReachable !== false;

export const Connectivity = {
  async isOnline(): Promise<boolean> {
    try {
      return toOnline(await NetInfo.fetch());
    } catch {
      return true; // Unknown: attempt requests and let them fail fast
    }
  },

  /** Subscribes to connectivity changes; returns the unsubscribe function. */
  subscribe(listener: (online: boolean) => void): () => void {
    return NetInfo.addEventListener((state) => listener(toOnline(state)));
  },
};

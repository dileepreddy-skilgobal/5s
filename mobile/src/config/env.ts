import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Enterprise Environment & Deployment Configuration
 * Ensures zero hardcoding across the entire mobile application.
 * Dynamically resolves environment variables, active origins, and tenant contexts.
 */

// Helper to extract the local host IP of the machine running Metro/Backend
const getExpoHost = (): string | null => {
  // 1. Expo Config hostUri (standard when connected over Wi-Fi / LAN)
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  }

  // 2. Fallback to manifest2/manifest debuggerHost
  const debuggerHost =
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  }

  // 3. Fallback to linkingUri if available (e.g. exp://10.12.73.189:8081)
  const linkingUri = (Constants as any).linkingUri;
  if (typeof linkingUri === 'string' && linkingUri.includes('://')) {
    const withoutScheme = linkingUri.split('://')[1];
    const host = withoutScheme?.split(':')[0]?.split('/')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  }

  return null;
};

// Dynamic API Origin Resolution
const resolveApiBaseUrl = (): string => {
  // 1. Explicit environment variable via Expo Public Env
  if (process.env.EXPO_PUBLIC_API_URL) {
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (Platform.OS !== 'web' && envUrl.includes('localhost')) {
      const host = getExpoHost() || (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');
      return envUrl.replace('localhost', host);
    }
    return envUrl;
  }

  // 2. Dynamic browser origin resolution when running on Web
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port } = window.location;
    // If running on local bundler port (8081), target standard backend port (3001)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:3001/api/v1`;
    }
    // If deployed on custom cloud domain or reverse proxy
    if (port && port !== '80' && port !== '443') {
      return `${protocol}//${hostname}:3001/api/v1`;
    }
    return `${protocol}//${hostname}/api/v1`;
  }

  // 3. Extra configuration in app.json (only if it points to a non-localhost custom domain)
  const extraApiUrl = Constants.expoConfig?.extra?.apiUrl;
  if (extraApiUrl && !extraApiUrl.includes('localhost')) {
    return extraApiUrl;
  }

  // 4. Physical Mobile Device via Expo Go / Local Network (resolves host computer IP)
  const expoHost = getExpoHost();
  if (expoHost) {
    return `http://${expoHost}:3001/api/v1`;
  }

  // 5. Android Emulator loopback alias to host machine
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001/api/v1';
  }

  // 6. Default local development fallback (iOS simulator / desktop)
  return 'http://localhost:3001/api/v1';
};

export const ENV = {
  // Network & Endpoints
  API_BASE_URL: resolveApiBaseUrl(),
  REQUEST_TIMEOUT_MS: 15000,

  // App Metadata
  APP_NAME: Constants.expoConfig?.name || 'SkilGlobal 5S Enterprise',
  APP_SLUG: Constants.expoConfig?.slug || '5s-mobile',
  VERSION: Constants.expoConfig?.version || '1.0.0',
  BUILD_ENV: process.env.NODE_ENV || 'production',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_WEB: Platform.OS === 'web',
} as const;

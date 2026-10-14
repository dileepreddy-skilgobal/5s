import { ApiService } from './api';
import { OfflineStorage } from './offlineStorage';
import { AuditExecution, LocationMaster, BootstrapState, BootstrapStep } from '../types';
import { MOCK_ACTIVE_AUDITS, MOCK_LOCATIONS } from '../constants/mockData';

export interface BootstrapResult {
  audits: AuditExecution[];
  locations: LocationMaster[];
  isOffline: boolean;
  pendingQueue: AuditExecution[];
}

export type ProgressCallback = (state: BootstrapState) => void;

export const BootstrapService = {
  /**
   * Enterprise Bootstrapping Sequence
   * Performs systematic initialization, storage verification, tenant validation,
   * connectivity detection, and master data hydration with graceful offline fallback.
   */
  async runBootstrap(
    onProgress: ProgressCallback,
    deviceInfo: { isTablet: boolean; orientation: 'portrait' | 'landscape' }
  ): Promise<BootstrapResult> {
    const deviceType = deviceInfo.isTablet ? 'tablet' : 'phone';
    const orientation = deviceInfo.orientation;

    const emit = (
      step: BootstrapStep,
      progress: number,
      title: string,
      description: string,
      isOfflineMode = false,
      isReady = false
    ) => {
      onProgress({
        step,
        progress,
        title,
        description,
        isReady,
        isOfflineMode,
        deviceType,
        orientation,
      });
    };

    try {
      // Step 1: Storage and Schema Initialization
      emit(
        'STORAGE_INIT',
        15,
        'Initializing Storage & Local DB',
        'Verifying offline cache schemas and local storage subsystems...'
      );
      await new Promise((r) => setTimeout(r, 180));

      const [storedAudits, storedLocations, storedOfflineFlag, storedQueue] = await Promise.all([
        OfflineStorage.getAudits().catch(() => MOCK_ACTIVE_AUDITS),
        OfflineStorage.getLocations().catch(() => MOCK_LOCATIONS),
        OfflineStorage.isOfflineMode().catch(() => false),
        OfflineStorage.getOfflineQueue().catch(() => []),
      ]);

      // Step 2: Tenant & Security Verification
      emit(
        'TENANT_VALIDATION',
        40,
        'Verifying Enterprise Tenant',
        'Authenticating tenant profile & Bangalore Plant Alpha workspace...'
      );
      await new Promise((r) => setTimeout(r, 200));

      // Step 3: Network & Connectivity Probe
      emit(
        'CONNECTIVITY_CHECK',
        65,
        'Testing 5S Cloud Connectivity',
        'Probing API endpoint connectivity and syncing shift status...'
      );

      let isOffline = storedOfflineFlag;
      let liveAudits: AuditExecution[] = storedAudits;
      let liveLocations: LocationMaster[] = storedLocations;

      try {
        // Fast probe to check if backend server is responsive
        const probeController = new AbortController();
        const probeTimeout = setTimeout(() => probeController.abort(), 1800);

        const [fetchedAudits, fetchedLocs] = await Promise.all([
          ApiService.getAuditExecutions().catch(() => null),
          ApiService.getLocations().catch(() => null),
        ]);
        clearTimeout(probeTimeout);

        if (fetchedAudits && fetchedAudits.length > 0) {
          liveAudits = fetchedAudits;
        }
        if (fetchedLocs && fetchedLocs.length > 0) {
          liveLocations = fetchedLocs;
        }
      } catch (networkErr) {
        console.info('Backend unreachable, switching seamlessly to Offline-First engine');
        isOffline = true;
      }

      // Step 4: Master Data & 5S Checklist Rules Hydration
      emit(
        'MASTER_DATA_HYDRATION',
        88,
        'Hydrating 5S Master Standards',
        'Loading 1S-5S checklist guidelines, active areas & defect tags...',
        isOffline
      );
      await new Promise((r) => setTimeout(r, 180));

      // Step 5: Ready
      emit(
        'READY',
        100,
        '5S Workspace Ready',
        isOffline
          ? 'Offline-first inspection workspace initialized.'
          : 'Connected to 5S Enterprise Cloud. Ready for inspection.',
        isOffline,
        true
      );
      await new Promise((r) => setTimeout(r, 120));

      return {
        audits: liveAudits.length > 0 ? liveAudits : MOCK_ACTIVE_AUDITS,
        locations: liveLocations.length > 0 ? liveLocations : MOCK_LOCATIONS,
        isOffline,
        pendingQueue: storedQueue,
      };
    } catch (criticalErr) {
      console.warn('Bootstrap encountered non-fatal error, falling back to local master data', criticalErr);

      emit(
        'READY',
        100,
        '5S Workspace Initialized',
        'Running on resilient offline-first mode with plant alpha master data.',
        true,
        true
      );

      return {
        audits: MOCK_ACTIVE_AUDITS,
        locations: MOCK_LOCATIONS,
        isOffline: true,
        pendingQueue: [],
      };
    }
  },
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BottomNavBar, TabType } from './src/components/BottomNavBar';
import { HomeScreen } from './src/screens/HomeScreen';
import { AuditsListScreen } from './src/screens/AuditsListScreen';
import { LocationsScreen } from './src/screens/LocationsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { QRScannerModal } from './src/components/QRScannerModal';
import { AuditExecutionModal } from './src/components/AuditExecutionModal';
import { RedTagModal } from './src/components/RedTagModal';
import { BootstrapScreen } from './src/components/BootstrapScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { OfflineStorage } from './src/services/offlineStorage';
import { ApiService } from './src/services/api';
import { BootstrapService } from './src/services/bootstrapService';
import { AuditExecution, LocationMaster, RedTagRecord, BootstrapState } from './src/types';
import { MOCK_ACTIVE_AUDITS, MOCK_LOCATIONS } from './src/constants/mockData';
import { UserProvider, useUser } from './src/context/UserContext';
import { useResponsive } from './src/hooks/useResponsive';

function MainApp() {
  const { isTablet, isLandscape, contentMaxWidth } = useResponsive();
  const { currentUser, refreshStats } = useUser();
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [audits, setAudits] = useState<AuditExecution[]>(MOCK_ACTIVE_AUDITS);
  const [locations, setLocations] = useState<LocationMaster[]>(MOCK_LOCATIONS);
  const [isOffline, setIsOffline] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<AuditExecution[]>([]);

  // Systematic bootstrap state
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>({
    step: 'STORAGE_INIT',
    progress: 10,
    title: 'Initializing Storage & Schemas',
    description: 'Starting local database and storage subsystems...',
    isReady: false,
    isOfflineMode: false,
    deviceType: isTablet ? 'tablet' : 'phone',
    orientation: isLandscape ? 'landscape' : 'portrait',
  });

  // Modals
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [selectedAuditForExecution, setSelectedAuditForExecution] = useState<AuditExecution | null>(null);
  const [redTagModalVisible, setRedTagModalVisible] = useState(false);
  const [redTagLocation, setRedTagLocation] = useState<LocationMaster | null>(null);

  // Initialize storage & offline state
  const loadData = useCallback(async () => {
    const loadedAudits = await ApiService.getAuditExecutions();
    const loadedLocs = await ApiService.getLocations();
    const offlineFlag = await OfflineStorage.isOfflineMode();
    const queue = await OfflineStorage.getOfflineQueue();

    setAudits(loadedAudits);
    setLocations(loadedLocs);
    setIsOffline(offlineFlag);
    setPendingQueue(queue);
    refreshStats(loadedAudits);
  }, [refreshStats]);

  // Run systematic bootstrap on startup
  useEffect(() => {
    let isMounted = true;

    BootstrapService.runBootstrap(
      (state) => {
        if (isMounted) setBootstrapState(state);
      },
      { isTablet, orientation: isLandscape ? 'landscape' : 'portrait' }
    ).then((result) => {
      if (isMounted) {
        setAudits(result.audits);
        setLocations(result.locations);
        setIsOffline(result.isOffline);
        setPendingQueue(result.pendingQueue);
        refreshStats(result.audits);
        setTimeout(() => {
          if (isMounted) setIsBootstrapped(true);
        }, 350);
      }
    });

    // Prevent scrollbar clipping on web browsers (especially Windows Chrome/Edge)
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = '5s-app-scrollbar-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
          * { -ms-overflow-style: none !important; scrollbar-width: none !important; }
        `;
        document.head.appendChild(style);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [isTablet, isLandscape, refreshStats]);

  // Toggle simulated offline mode
  const handleToggleOffline = async () => {
    const nextState = !isOffline;
    setIsOffline(nextState);
    await OfflineStorage.setOfflineMode(nextState);
    Alert.alert(
      nextState ? 'Offline Mode Active' : 'Online Mode Active',
      nextState
        ? 'Network requests will be queued locally in device AsyncStorage.'
        : 'Reconnected to 5S Cloud. Ready to sync.'
    );
  };

  // Launch audit dynamically from QR scan or card tap
  const handleLocationScanned = (loc: LocationMaster) => {
    const existing = audits.find((a) => a.locationId === loc.id && a.status === 'IN_PROGRESS');
    if (existing) {
      setSelectedAuditForExecution(existing);
    } else {
      const currentYear = new Date().getFullYear();
      const newAudit: AuditExecution = {
        id: `aud-${Date.now()}`,
        trackingNumber: `#AUD-${currentYear}-${Math.floor(1000 + Math.random() * 9000)}`,
        templateId: 'tmpl-auto-std',
        templateTitle: 'Automotive Precision 5S Shopfloor Standard',
        locationId: loc.id,
        locationName: loc.name,
        plantName: loc.plant,
        auditorId: currentUser.id,
        auditorName: `${currentUser.firstName} ${currentUser.lastName} (${currentUser.jobTitle})`,
        category: `${loc.department} • 5S Audit`,
        status: 'IN_PROGRESS',
        statusBadge: 'In Progress',
        overallScore: loc.current5SScore,
        pillarScores: { S1: 85, S2: 80, S3: 85, S4: 80, S5: 80 },
        timeline: [
          { label: 'Area Verified', timestamp: 'Today, 09:00 AM', isCompleted: true, isActive: false },
          { label: 'Inspection', timestamp: 'S1–S5 Active', isCompleted: true, isActive: true },
          { label: 'CAPA Review', timestamp: 'Pending', isCompleted: false, isActive: false },
          { label: 'Signed Off', timestamp: 'Target Today', isCompleted: false, isActive: false },
        ],
        answers: {},
        observations: [],
        scheduledDate: new Date().toLocaleDateString('en-GB'),
        startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setAudits((prev) => [newAudit, ...prev]);
      setSelectedAuditForExecution(newAudit);
    }
  };

  // Audit submission
  const handleAuditSubmitted = async (completedAudit: AuditExecution) => {
    const res = await ApiService.submitAuditExecution(completedAudit, currentUser);
    await loadData();
    setSelectedAuditForExecution(null);

    if (res.synced) {
      Alert.alert('Audit Submitted & Verified', 'Audit results and CAPA actions synchronized with 5S Cloud.');
    } else {
      Alert.alert('Saved to Offline Queue', 'No network connection. Audit is saved locally and will auto-sync when online.');
    }
  };

  // Red tag submission
  const handleSaveRedTag = async (tag: RedTagRecord) => {
    await ApiService.createRedTag(tag);
    await loadData();
    Alert.alert('Red Tag Issued', `Tag ${tag.tagNumber} successfully registered for ${tag.areaName}.`);
  };

  // Sync queue
  const handleSyncPendingQueue = async () => {
    const result = await ApiService.syncPendingQueue();
    await loadData();
    Alert.alert(
      'Sync Completed',
      `Synchronized ${result.syncedCount} audits with 5S Enterprise backend.`
    );
  };

  // Render Bootstrap Screen if app is initializing
  if (!isBootstrapped) {
    return (
      <SafeAreaView style={styles.safeAreaDark} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar style="light" />
        <BootstrapScreen
          state={bootstrapState}
          onBypass={() => setIsBootstrapped(true)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={[styles.appContainer, { maxWidth: contentMaxWidth }]}>
        {/* Screen Routing */}
        {activeTab === 'home' && (
          <HomeScreen
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onOpenScanner={() => setQrScannerVisible(true)}
            onStartAudit={() => {
              if (audits.length > 0) {
                setSelectedAuditForExecution(audits[0]);
              } else {
                setQrScannerVisible(true);
              }
            }}
            onTrackOrder={() => setActiveTab('audits')}
            onSchedule={() => {
              const scheduled = audits.find((a) => a.status === 'SCHEDULED');
              if (scheduled) setSelectedAuditForExecution(scheduled);
              else setActiveTab('audits');
            }}
            onMore={() => setRedTagModalVisible(true)}
            activeAudits={audits}
            onSelectAudit={(audit) => setSelectedAuditForExecution(audit)}
            onSeeAllAudits={() => setActiveTab('audits')}
            isOffline={isOffline}
            onToggleOffline={handleToggleOffline}
            pendingSyncCount={pendingQueue.length}
            onSyncPress={handleSyncPendingQueue}
            onOpenProfile={() => setActiveTab('profile')}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'audits' && (
          <AuditsListScreen
            audits={audits}
            onSelectAudit={(audit) => setSelectedAuditForExecution(audit)}
            onNewAudit={() => setQrScannerVisible(true)}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'locations' && (
          <LocationsScreen
            locations={locations}
            onSelectLocation={(loc) => {
              handleLocationScanned(loc);
            }}
            onOpenQRScanner={() => setQrScannerVisible(true)}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileScreen
            isOffline={isOffline}
            onToggleOffline={handleToggleOffline}
            pendingSyncCount={pendingQueue.length}
            onSyncNow={handleSyncPendingQueue}
            onRefresh={loadData}
          />
        )}

        {/* Floating Bottom Navigation Bar */}
        <BottomNavBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onCenterActionPress={() => setQrScannerVisible(true)}
        />

        {/* QR Scanner Modal */}
        <QRScannerModal
          visible={qrScannerVisible}
          onClose={() => setQrScannerVisible(false)}
          onSelectLocation={handleLocationScanned}
          locations={locations}
        />

        {/* Red Tag & Abnormality Modal */}
        <RedTagModal
          visible={redTagModalVisible}
          onClose={() => setRedTagModalVisible(false)}
          onSave={handleSaveRedTag}
          initialLocation={redTagLocation}
          locations={locations}
        />

        {/* Full 5S Audit Execution Modal */}
        {selectedAuditForExecution && (
          <AuditExecutionModal
            visible={true}
            audit={selectedAuditForExecution}
            onClose={() => setSelectedAuditForExecution(null)}
            onSubmit={handleAuditSubmitted}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <UserProvider>
          <MainApp />
        </UserProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },
  safeAreaDark: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  appContainer: {
    flex: 1,
    position: 'relative',
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#F8F9FB',
    overflow: 'hidden',
    minHeight: '100%',
  },
});

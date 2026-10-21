import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { TemplatePickerModal } from './src/components/TemplatePickerModal';
import { ReportObservationModal } from './src/components/ReportObservationModal';
import { NotificationsInboxModal } from './src/components/NotificationsInboxModal';
import { AccessNoticeBanner } from './src/components/AccessNoticeBanner';
import {
  AuditExecution,
  AuditSubmissionPayload,
  AuditTemplateSnapshot,
  LocationMaster,
  ObservationDraft,
  QuestionAnswer,
  RedTagRecord,
} from './src/types';
import { AuthProvider, UserProvider, useAuth, useUser } from './src/context/UserContext';
import { WorkspaceProvider, useWorkspace } from './src/context/WorkspaceContext';
import { NotificationsProvider, useNotifications } from './src/context/NotificationsContext';
import { notificationTarget, NotificationTarget, PushService } from './src/services/pushService';
import { LoginScreen } from './src/screens/LoginScreen';
import { useResponsive } from './src/hooks/useResponsive';
import { getErrorMessage } from './src/services/http';
import { COLORS } from './src/constants/theme';
import { SyncResult } from './src/services/syncService';

/** User-facing summary of a sync attempt after a submission. */
function describeSubmission(what: string, result: SyncResult | null): { title: string; message: string } {
  if (!result || result.interrupted) {
    return { title: 'Saved on this device', message: `${what} is saved on this device and will sync automatically when the connection returns.` };
  }
  if (result.errors.length > 0) {
    return { title: 'Not accepted by the server', message: `${result.errors.join('\n')}\n\nReview it under Profile → Sync.` };
  }
  return { title: 'Submitted', message: `${what} was sent to the 5S server.` };
}

function MainApp() {
  const { contentMaxWidth } = useResponsive();
  const insets = useSafeAreaInsets();
  const { currentUser, can } = useUser();
  const workspace = useWorkspace();
  const { audits, locations, templates, isOnline, isLoading, syncItems } = workspace;
  const notifications = useNotifications();

  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Modals
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [activeExecution, setActiveExecution] = useState<{ audit: AuditExecution; template: AuditTemplateSnapshot } | null>(null);
  const [templatePickerLocation, setTemplatePickerLocation] = useState<LocationMaster | null>(null);
  const [redTagModalVisible, setRedTagModalVisible] = useState(false);
  const [redTagLocation, setRedTagLocation] = useState<LocationMaster | null>(null);
  const [isOpeningAudit, setIsOpeningAudit] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportLocation, setReportLocation] = useState<LocationMaster | null>(null);
  const canReport = can('SHOPFLOOR_REPORTERS');

  const pendingSyncCount = syncItems.filter((i) => i.state === 'PENDING').length;

  useEffect(() => {
    if (!isLoading) setHasLoadedOnce(true);
  }, [isLoading]);

  // Prevent scrollbar clipping on web browsers (especially Windows Chrome/Edge)
  useEffect(() => {
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
  }, []);

  // Notification taps (push) open the matching screen; arriving notifications refresh the bell badge
  const { openInbox, refreshUnread } = notifications;
  useEffect(() => {
    const openTarget = (target: NotificationTarget) => {
      if (target === 'audits') setActiveTab('audits');
      else if (target === 'locations') setActiveTab('locations');
      else openInbox();
      refreshUnread();
    };
    const unsubscribeTaps = PushService.subscribeToTaps((data) => openTarget(notificationTarget(data)));
    const unsubscribeReceived = PushService.subscribeToReceived(refreshUnread);
    return () => {
      unsubscribeTaps();
      unsubscribeReceived();
    };
  }, [openInbox, refreshUnread]);

  const openReport = (loc: LocationMaster | null) => {
    setQrScannerVisible(false);
    setReportLocation(loc);
    setReportVisible(true);
  };

  /** Runs an async "open audit" step with a busy guard and a clear error message. */
  const runOpen = async (task: () => Promise<{ audit: AuditExecution; template: AuditTemplateSnapshot }>) => {
    if (isOpeningAudit) return;
    setIsOpeningAudit(true);
    try {
      setActiveExecution(await task());
    } catch (err) {
      Alert.alert('Cannot open audit', getErrorMessage(err, 'The audit could not be opened. Please try again.'));
    } finally {
      setIsOpeningAudit(false);
    }
  };

  const startAdHocAudit = (location: LocationMaster, template: AuditTemplateSnapshot) => {
    setTemplatePickerLocation(null);
    runOpen(() => workspace.startAudit({ location, template }));
  };

  // Area chosen from the scanner or the locations list
  const handleLocationSelected = (loc: LocationMaster) => {
    setQrScannerVisible(false);
    if (!can('AUDIT_CONDUCTORS')) {
      // Roles that do not conduct audits can still report abnormalities or red-tag items at the area
      const openRedTag = () => {
        setRedTagLocation(loc);
        setRedTagModalVisible(true);
      };
      if (!canReport) {
        openRedTag();
      } else if (Platform.OS === 'web') {
        // Choice dialogs are not available in the web preview
        openReport(loc);
      } else {
        Alert.alert(loc.name, 'What would you like to do at this area?', [
          { text: 'Report an abnormality', onPress: () => openReport(loc) },
          { text: 'Red tag an item', onPress: openRedTag },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
      return;
    }
    const inProgress = audits.find((a) => a.locationId === loc.id && a.status === 'IN_PROGRESS' && a.auditorId === currentUser.id);
    if (inProgress) {
      runOpen(() => workspace.openAudit(inProgress));
      return;
    }
    if (templates.length === 0) {
      Alert.alert('No audit templates', isOnline ? 'No active audit templates are published.' : 'Templates are not available offline yet. Connect once to download them.');
      return;
    }
    if (templates.length === 1) {
      startAdHocAudit(loc, templates[0]);
    } else {
      setTemplatePickerLocation(loc);
    }
  };

  const handleSelectAudit = (audit: AuditExecution) => {
    if (audit.status === 'SCHEDULED') {
      if (!can('AUDIT_CONDUCTORS')) return;
      runOpen(() => workspace.startAudit({ scheduled: audit }));
      return;
    }
    if (audit.status === 'IN_PROGRESS' && audit.auditorId === currentUser.id && !audit.isOfflineSyncPending) {
      runOpen(() => workspace.openAudit(audit));
      return;
    }
    const score = audit.overallScore === null ? 'not scored yet' : `${Math.round(audit.overallScore)}%`;
    Alert.alert(
      audit.trackingNumber,
      `${audit.locationName}\nStatus: ${audit.statusBadge}\nScore: ${score}\nFindings: ${audit.findingsCount}` +
        (audit.status === 'PENDING_REVIEW' ? '\n\nAwaiting the area owner’s sign-off.' : ''),
    );
  };

  const handleStartAudit = () => {
    const mine = audits.find((a) => a.status === 'IN_PROGRESS' && a.auditorId === currentUser.id && !a.isOfflineSyncPending);
    if (mine) return handleSelectAudit(mine);
    const scheduled = audits.find((a) => a.status === 'SCHEDULED');
    if (scheduled) return handleSelectAudit(scheduled);
    setQrScannerVisible(true);
  };

  const handleCloseAudit = async (answers: Record<string, QuestionAnswer>) => {
    if (activeExecution) {
      await workspace.saveDraft(activeExecution.audit, answers);
    }
    setActiveExecution(null);
  };

  const handleAuditSubmitted = async (audit: AuditExecution, payload: AuditSubmissionPayload) => {
    const result = await workspace.submitAudit(audit, payload);
    setActiveExecution(null);
    const { title, message } = describeSubmission(`Audit ${audit.trackingNumber}`, result);
    Alert.alert(title, message);
  };

  const handleSaveRedTag = async (tag: RedTagRecord) => {
    const result = await workspace.registerRedTag(tag);
    const { title, message } = describeSubmission(`Red tag for "${tag.itemName}"`, result);
    Alert.alert(title, message);
  };

  const handleSubmitObservation = async (draft: ObservationDraft, clientRequestId: string) => {
    const result = await workspace.reportObservation(draft, clientRequestId);
    const { title, message } = describeSubmission(`Report "${draft.title}"`, result);
    Alert.alert(title, message);
  };

  const handleSyncPendingQueue = async () => {
    const result = await workspace.syncNow();
    if (!result) {
      Alert.alert('Offline', 'No network connection. Items will sync automatically when the device is back online.');
    } else if (result.errors.length > 0) {
      Alert.alert('Some items were rejected', result.errors.join('\n'));
    } else {
      Alert.alert('Sync complete', result.synced > 0 ? `${result.synced} item(s) synced.` : 'Nothing to sync.');
    }
  };

  // First load: branded start-up screen until data (server or device cache) is available
  if (!hasLoadedOnce) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar style="dark" />
        <BootstrapScreen
          message={isOnline ? 'Loading your workspace…' : 'Loading data saved on this device…'}
          isOffline={!isOnline}
        />
      </SafeAreaView>
    );
  }

  return (
    // The bottom safe area is drawn below the shell (white, matching the tab bar) so the bar never sits under
    // the home indicator and BOTTOM_NAV_CLEARANCE only has to cover the bar itself
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={[styles.appContainer, { maxWidth: contentMaxWidth }]}>
        {/* Read-only organization / 2FA enrolment notices from the server */}
        <AccessNoticeBanner />

        {/* Screen Routing */}
        {activeTab === 'home' && (
          <HomeScreen
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onOpenScanner={() => setQrScannerVisible(true)}
            onStartAudit={handleStartAudit}
            onRedTag={() => {
              setRedTagLocation(null);
              setRedTagModalVisible(true);
            }}
            onReport={canReport ? () => openReport(null) : undefined}
            onOpenAreas={() => setActiveTab('locations')}
            activeAudits={audits}
            onSelectAudit={handleSelectAudit}
            onSeeAllAudits={() => setActiveTab('audits')}
            isOffline={!isOnline}
            onStatusPress={workspace.refresh}
            pendingSyncCount={pendingSyncCount}
            onSyncPress={handleSyncPendingQueue}
            onOpenProfile={() => setActiveTab('profile')}
            onRefresh={workspace.refresh}
          />
        )}

        {activeTab === 'audits' && (
          <AuditsListScreen
            audits={audits}
            onSelectAudit={handleSelectAudit}
            onNewAudit={() => setQrScannerVisible(true)}
            onRefresh={workspace.refresh}
          />
        )}

        {activeTab === 'locations' && (
          <LocationsScreen
            locations={locations}
            onSelectLocation={handleLocationSelected}
            onOpenQRScanner={() => setQrScannerVisible(true)}
            onReportAbnormality={canReport ? openReport : undefined}
            onRefresh={workspace.refresh}
          />
        )}

        {activeTab === 'profile' && <ProfileScreen onRefresh={workspace.refresh} />}

        {/* Floating Bottom Navigation Bar */}
        <BottomNavBar activeTab={activeTab} onTabChange={setActiveTab} onCenterActionPress={() => setQrScannerVisible(true)} />

        <QRScannerModal
          visible={qrScannerVisible}
          onClose={() => setQrScannerVisible(false)}
          onSelectLocation={handleLocationSelected}
          locations={locations}
        />

        <TemplatePickerModal
          location={templatePickerLocation}
          templates={templates}
          onSelect={(t) => templatePickerLocation && startAdHocAudit(templatePickerLocation, t)}
          onClose={() => setTemplatePickerLocation(null)}
        />

        <RedTagModal
          visible={redTagModalVisible}
          onClose={() => setRedTagModalVisible(false)}
          onSave={handleSaveRedTag}
          initialLocation={redTagLocation}
          locations={locations}
        />

        <ReportObservationModal
          visible={reportVisible}
          onClose={() => setReportVisible(false)}
          onSubmit={handleSubmitObservation}
          initialLocation={reportLocation}
          locations={locations}
        />

        <NotificationsInboxModal onOpenTarget={(target) => setActiveTab(target)} />

        {activeExecution && (
          <AuditExecutionModal
            visible={true}
            audit={activeExecution.audit}
            template={activeExecution.template}
            onClose={handleCloseAudit}
            onDraftChange={(answers) => workspace.saveDraft(activeExecution.audit, answers)}
            onSubmit={handleAuditSubmitted}
          />
        )}

        {isOpeningAudit && (
          <View style={styles.busyOverlay} pointerEvents="auto">
            <ActivityIndicator size="large" color={COLORS.primary} accessibilityLabel="Opening audit" />
          </View>
        )}
      </View>
      <View style={[styles.bottomInset, { height: insets.bottom }]} />
    </SafeAreaView>
  );
}

/** Shows the sign-in screen until a server-verified session exists. */
function AuthGate() {
  const { status, session } = useAuth();

  if (status === 'checking') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar style="dark" />
        <BootstrapScreen message="Checking your sign-in…" />
      </SafeAreaView>
    );
  }

  if (status === 'signedOut' || !session) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar style="dark" />
        <LoginScreen />
      </SafeAreaView>
    );
  }

  // Remount the signed-in app per user so no state leaks between sessions on shared devices
  return (
    <UserProvider session={session} key={session.user.id}>
      <WorkspaceProvider>
        <NotificationsProvider>
          <MainApp />
        </NotificationsProvider>
      </WorkspaceProvider>
    </UserProvider>
  );
}

// Foreground notification banners and the Android channel (no-op on web)
PushService.configure();

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  appContainer: {
    flex: 1,
    position: 'relative',
    width: '100%',
    alignSelf: 'center',
    backgroundColor: COLORS.background,
    overflow: 'hidden',
  },
  bottomInset: {
    backgroundColor: COLORS.card,
  },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(245,247,250,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

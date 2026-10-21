import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { COLORS, RADIUS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';
import { matchLocationQr } from '../services/qrPayload';
import { useUser } from '../context/UserContext';
import { LocationMaster } from '../types';
import { Badge, Button, Card, FormField, TextField } from './ui';
import { InlineMessage, Sheet, areaScoreTone } from './SheetLayout';
import jsQR from 'jsqr';

interface QRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectLocation: (loc: LocationMaster) => void;
  locations?: LocationMaster[];
}

/** Areas listed below the scanner before the user searches. */
const AREA_LIST_LIMIT = 8;

/** Styles for the web-only file input label (rendered as a DOM element in the web preview). */
const webUploadLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  height: TOUCH_TARGET,
  marginTop: SPACING.md,
  paddingLeft: 16,
  paddingRight: 16,
  borderRadius: RADIUS.md,
  border: `1px solid ${COLORS.borderDark}`,
  backgroundColor: COLORS.card,
  color: COLORS.primary,
  fontSize: 15,
  fontWeight: 600,
  // A raw <label> does not inherit React Native Web's font, so set the same system stack
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  cursor: 'pointer',
};

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  visible,
  onClose,
  onSelectLocation,
  locations = [],
}) => {
  const { tenant, can } = useUser();
  const activeLocations = locations;
  const canConduct = can('AUDIT_CONDUCTORS');
  const canReport = can('SHOPFLOOR_REPORTERS');

  const [selectedLoc, setSelectedLoc] = useState<LocationMaster | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [areaQuery, setAreaQuery] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);

  // Native camera permissions hook from expo-camera
  const [permission, requestPermission] = useCameraPermissions();

  // Web camera refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Continuous frame analysis with jsQR for Web
  const startScanLoop = () => {
    if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    const scan = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const video = videoRef.current;
        let canvas = canvasRef.current;
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvasRef.current = canvas;
        }

        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data) {
            animFrameIdRef.current = null;
            handleCodeDetected(code.data);
            return;
          }
        }
      }
      animFrameIdRef.current = requestAnimationFrame(scan);
    };

    animFrameIdRef.current = requestAnimationFrame(scan);
  };

  // Handle scanned/parsed string from either Native Camera or Web Video
  const handleCodeDetected = (rawValue: string) => {
    if (!rawValue) return;
    setScannedCode(rawValue);

    // Exact match against this organization's areas; unknown codes are never turned into locations
    const result = matchLocationQr(rawValue, activeLocations, tenant);
    if (result.kind === 'MATCH') {
      setSelectedLoc(result.location);
      setScanError(null);
      return;
    }
    setSelectedLoc(null);
    // Shown inline (alerts do not appear in the web preview)
    setScanError(
      result.kind === 'OTHER_TENANT'
        ? 'This QR code belongs to a different organization.'
        : result.kind === 'UNKNOWN'
          ? `No area with code "${result.areaCode}" exists in ${tenant.name}. If it was added recently, refresh while online.`
          : 'This is not a 5S area QR code.',
    );
  };

  const startWebCamera = async () => {
    setCameraError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser has no camera access.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });

      streamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play();
        startScanLoop();
      }
    } catch (err: unknown) {
      console.warn('Web camera stream error:', err);
      setCameraActive(false);
      setCameraError('The camera is not available here.');
    }
  };

  const stopWebCamera = () => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Request permissions & start camera when modal opens
  useEffect(() => {
    if (visible) {
      setScannedCode(null);
      setSelectedLoc(null);
      setScanError(null);

      if (Platform.OS === 'web') {
        startWebCamera();
      } else {
        // Automatically request camera permission on mobile if not yet granted
        if (!permission?.granted) {
          requestPermission();
        }
      }
    } else {
      if (Platform.OS === 'web') {
        stopWebCamera();
      }
      setTorchOn(false);
      setAreaQuery('');
      setManualCode('');
    }

    return () => {
      if (Platform.OS === 'web') {
        stopWebCamera();
      }
    };
    // Only when the sheet opens or closes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /** Clears the result and resumes scanning. */
  const scanAgain = () => {
    setScannedCode(null);
    setSelectedLoc(null);
    setScanError(null);
    if (Platform.OS === 'web' && streamRef.current) startScanLoop();
  };

  // Scan from uploaded image file on Web
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            handleCodeDetected(code.data);
          } else {
            setSelectedLoc(null);
            setScanError('No QR code was found in that image. Try a clearer, closer photo.');
          }
        }
      };
      img.src = typeof e.target?.result === 'string' ? e.target.result : '';
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    if (selectedLoc) {
      if (Platform.OS === 'web') {
        stopWebCamera();
      }
      onSelectLocation(selectedLoc);
      setSelectedLoc(null);
      setScannedCode(null);
      onClose();
    }
  };

  const submitManualCode = () => {
    if (manualCode.trim()) handleCodeDetected(manualCode);
  };

  const visibleAreas = useMemo(() => {
    const q = areaQuery.trim().toLowerCase();
    const matches = q
      ? activeLocations.filter(
          (l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q) || l.department.toLowerCase().includes(q),
        )
      : activeLocations;
    return matches.slice(0, q ? matches.length : AREA_LIST_LIMIT);
  }, [activeLocations, areaQuery]);

  // What the confirm button does is decided by App: conductors open an audit, others report / red tag
  const confirmLabel = canConduct ? 'Audit this area' : canReport ? 'Report or red tag here' : 'Red tag an item here';
  const confirmIcon = canConduct ? 'clipboard-outline' : canReport ? 'alert-circle-outline' : 'pricetag-outline';

  const isNative = Platform.OS !== 'web';
  const cameraLive = isNative ? !!permission?.granted : cameraActive;

  const renderCameraState = () => {
    if (isNative) {
      if (permission?.granted) {
        return (
          /* Active Native Camera View with hardware QR scanning */
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchOn}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onBarcodeScanned={
              scannedCode
                ? undefined
                : (result: BarcodeScanningResult) => {
                    if (result?.data) {
                      handleCodeDetected(result.data);
                    }
                  }
            }
          />
        );
      }
      if (!permission) {
        return (
          <View style={styles.cameraMessage}>
            <ActivityIndicator size="large" color={COLORS.textInverse} />
            <Text style={styles.cameraMessageText}>Starting camera…</Text>
          </View>
        );
      }
      return (
        /* Permission not granted: ask again, or send the user to the settings when the system will not ask */
        <View style={styles.cameraMessage}>
          <Ionicons name="camera-outline" size={32} color={COLORS.textInverse} />
          <Text style={styles.cameraMessageTitle}>Camera access is off</Text>
          <Text style={styles.cameraMessageText}>
            {permission.canAskAgain
              ? 'Allow camera access to scan the QR code on the area sign.'
              : 'Turn on camera access for this app in your device settings, or enter the code below.'}
          </Text>
          {permission.canAskAgain ? (
            <Button label="Allow camera" icon="camera" onPress={requestPermission} style={styles.cameraMessageButton} />
          ) : (
            <Button label="Open settings" icon="settings-outline" onPress={() => Linking.openSettings()} style={styles.cameraMessageButton} />
          )}
        </View>
      );
    }

    /* Web browser camera stream */
    return (
      <>
        <video
          ref={(ref) => {
            videoRef.current = ref;
            if (ref && streamRef.current && ref.srcObject !== streamRef.current) {
              ref.srcObject = streamRef.current;
              ref.play().catch(() => {});
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
          autoPlay
          playsInline
          muted
        />
        {!cameraActive && (
          <View style={styles.cameraMessage}>
            {cameraError ? (
              <>
                <Ionicons name="videocam-off-outline" size={32} color={COLORS.textInverse} />
                <Text style={styles.cameraMessageTitle}>{cameraError}</Text>
                <Text style={styles.cameraMessageText}>Upload a photo of the QR code, enter the code, or choose the area below.</Text>
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color={COLORS.textInverse} />
                <Text style={styles.cameraMessageText}>Starting camera…</Text>
              </>
            )}
          </View>
        )}
      </>
    );
  };

  return (
    <Sheet
      visible={visible}
      onRequestClose={onClose}
      title="Scan area QR code"
      subtitle="Point the camera at the QR code on the area sign."
      closeLabel="Close scanner"
    >
      {/* Viewfinder */}
      <View style={styles.viewfinder}>
        {renderCameraState()}

        {cameraLive && (
          <>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </>
        )}

        {/* Torch Button for Native Mobile */}
        {isNative && permission?.granted && (
          <Pressable
            style={[styles.torchBtn, torchOn && styles.torchBtnActive]}
            onPress={() => setTorchOn(!torchOn)}
            accessibilityRole="switch"
            accessibilityState={{ checked: torchOn }}
            accessibilityLabel="Flashlight"
          >
            <Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={20} color={COLORS.textInverse} />
          </Pressable>
        )}

        {scannedCode && cameraLive && (
          <View style={styles.pausedOverlay}>
            <Text style={styles.pausedText}>Scanning paused</Text>
          </View>
        )}
      </View>

      {/* Quick upload of a QR code image on Web */}
      {Platform.OS === 'web' && (
        <label style={webUploadLabelStyle}>
          <Ionicons name="image-outline" size={18} color={COLORS.primary} />
          <span>Upload a photo of the QR code</span>
          <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
        </label>
      )}

      {/* Result */}
      <View style={styles.result} accessibilityLiveRegion="polite">
        {scanError ? (
          <InlineMessage tone="danger" title="Area not recognised" message={scanError}>
            <Button label="Scan again" icon="refresh" variant="secondary" size="sm" onPress={scanAgain} style={styles.resultAction} />
          </InlineMessage>
        ) : null}

        {selectedLoc && (
          <Card style={styles.previewCard}>
            <View style={styles.previewTop}>
              <View style={styles.previewIcon}>
                <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
              </View>
              <View style={styles.previewText}>
                <Text style={styles.previewEyebrow}>Area found</Text>
                <Text style={styles.previewName} numberOfLines={2}>
                  {selectedLoc.name}
                </Text>
                <Text style={styles.previewMeta}>{[selectedLoc.code, selectedLoc.department].filter(Boolean).join(' · ')}</Text>
              </View>
              {selectedLoc.current5SScore !== null && (
                <Badge label={`${selectedLoc.current5SScore}%`} tone={areaScoreTone(selectedLoc.status)} />
              )}
            </View>
            <Button label={confirmLabel} icon={confirmIcon} size="lg" onPress={handleConfirm} fullWidth />
            <Button label="Scan a different code" variant="ghost" onPress={scanAgain} fullWidth style={styles.resultAction} />
          </Card>
        )}
      </View>

      {/* Manual input fallback */}
      <FormField label="Enter the area code" hint="The code is printed under the QR code, e.g. LOC-BLR-ASM-LINE01.">
        <View style={styles.manualRow}>
          <TextField
            style={styles.flex}
            placeholder="Area code"
            value={manualCode}
            onChangeText={setManualCode}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={submitManualCode}
            accessibilityLabel="Area code"
          />
          <Button label="Find" variant="secondary" onPress={submitManualCode} disabled={!manualCode.trim()} accessibilityLabel="Find area by code" />
        </View>
      </FormField>

      {/* Area list fallback */}
      <Text style={styles.listTitle} accessibilityRole="header">
        Or choose an area
      </Text>
      {activeLocations.length === 0 ? (
        <InlineMessage tone="warning" message="No areas are available. Connect to the internet and refresh to load your areas." />
      ) : (
        <>
          {activeLocations.length > AREA_LIST_LIMIT && (
            <TextField
              placeholder="Search by area name or code"
              value={areaQuery}
              onChangeText={setAreaQuery}
              autoCorrect={false}
              returnKeyType="search"
              style={styles.areaSearch}
              accessibilityLabel="Search areas"
            />
          )}
          {visibleAreas.length === 0 ? (
            <Text style={styles.listEmpty}>No area matches “{areaQuery.trim()}”.</Text>
          ) : (
            visibleAreas.map((loc) => {
              const active = selectedLoc?.id === loc.id;
              return (
                <Pressable
                  key={loc.id}
                  style={({ pressed }) => [styles.areaRow, active && styles.areaRowActive, pressed && { opacity: 0.85 }]}
                  onPress={() => handleCodeDetected(loc.qrCode || loc.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${loc.name}, ${loc.code}`}
                >
                  <Ionicons name="location-outline" size={20} color={COLORS.primary} />
                  <View style={styles.flex}>
                    <Text style={styles.areaName} numberOfLines={2}>
                      {loc.name}
                    </Text>
                    <Text style={styles.areaMeta}>{[loc.code, loc.department].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Ionicons name={active ? 'checkmark' : 'chevron-forward'} size={18} color={active ? COLORS.primary : COLORS.textMuted} />
                </Pressable>
              );
            })
          )}
          {!areaQuery.trim() && activeLocations.length > AREA_LIST_LIMIT && (
            <Text style={styles.listEmpty}>
              Showing {AREA_LIST_LIMIT} of {activeLocations.length} areas. Search to find others.
            </Text>
          )}
        </>
      )}
    </Sheet>
  );
};

const CORNER = 28;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  viewfinder: {
    width: '100%',
    maxWidth: 420,
    aspectRatio: 4 / 3,
    alignSelf: 'center',
    backgroundColor: COLORS.textDark,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cameraMessage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  cameraMessageTitle: { ...TYPE.subheading, color: COLORS.textInverse, textAlign: 'center' },
  cameraMessageText: { ...TYPE.caption, fontSize: 13, lineHeight: 18, color: COLORS.border, textAlign: 'center' },
  cameraMessageButton: { marginTop: SPACING.sm },
  torchBtn: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: 'rgba(29, 39, 51, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchBtnActive: { backgroundColor: COLORS.primary },
  pausedOverlay: {
    position: 'absolute',
    bottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(29, 39, 51, 0.75)',
  },
  pausedText: { ...TYPE.captionStrong, color: COLORS.textInverse },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: COLORS.textInverse,
  },
  cornerTL: { top: 24, left: 24, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  cornerTR: { top: 24, right: 24, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  cornerBL: { bottom: 24, left: 24, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 24, right: 24, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
  result: { marginTop: SPACING.lg },
  resultAction: { marginTop: SPACING.sm },
  previewCard: { marginBottom: SPACING.lg, borderColor: COLORS.successBorder },
  previewTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, marginBottom: SPACING.lg },
  previewIcon: { paddingTop: 2 },
  previewText: { flex: 1 },
  previewEyebrow: { ...TYPE.captionStrong, color: COLORS.success },
  previewName: { ...TYPE.heading, color: COLORS.textDark, marginTop: 2 },
  previewMeta: { ...TYPE.caption, color: COLORS.textMedium, marginTop: 2 },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  listTitle: { ...TYPE.heading, color: COLORS.textDark, marginBottom: SPACING.sm },
  areaSearch: { marginBottom: SPACING.sm },
  listEmpty: { ...TYPE.caption, color: COLORS.textMedium, paddingVertical: SPACING.sm },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 56,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  areaRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  areaName: { ...TYPE.bodyStrong, color: COLORS.textDark },
  areaMeta: { ...TYPE.caption, color: COLORS.textMuted, marginTop: 2 },
});

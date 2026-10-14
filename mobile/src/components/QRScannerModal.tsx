import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { COLORS, SHADOWS } from '../constants/theme';
import { MOCK_LOCATIONS } from '../constants/mockData';
import { LocationMaster } from '../types';
import jsQR from 'jsqr';
import QRCode from 'qrcode';

interface QRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectLocation: (loc: LocationMaster) => void;
  locations?: LocationMaster[];
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  visible,
  onClose,
  onSelectLocation,
  locations = [],
}) => {
  const activeLocations = locations.length > 0 ? locations : MOCK_LOCATIONS;

  const [selectedLoc, setSelectedLoc] = useState<LocationMaster | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [qrPreviewDataUrls, setQrPreviewDataUrls] = useState<Record<string, string>>({});
  const [showTestQRs, setShowTestQRs] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Native camera permissions hook from expo-camera
  const [permission, requestPermission] = useCameraPermissions();

  // Web camera refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Pre-generate real QR code image data URLs for quick testing
  useEffect(() => {
    async function generateQRs() {
      const urls: Record<string, string> = {};
      if (Platform.OS === 'web') {
        for (const loc of activeLocations.slice(0, 4)) {
          try {
            const url = await QRCode.toDataURL(loc.qrCode || loc.code, {
              width: 140,
              margin: 1,
              color: { dark: '#111827', light: '#FFFFFF' },
            });
            urls[loc.id] = url;
          } catch (e) {
            console.warn('Failed to generate test QR on web', e);
          }
        }
      } else {
        // Native mobile fallback using standard lightweight QR image endpoint
        for (const loc of activeLocations.slice(0, 4)) {
          urls[loc.id] = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
            loc.qrCode || loc.code
          )}`;
        }
      }
      setQrPreviewDataUrls(urls);
    }
    generateQRs();
  }, [activeLocations]);

  // Request permissions & start camera when modal opens
  useEffect(() => {
    if (visible) {
      setScannedCode(null);
      setSelectedLoc(null);

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
    }

    return () => {
      if (Platform.OS === 'web') {
        stopWebCamera();
      }
    };
  }, [visible]);

  const startWebCamera = async () => {
    setCameraError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera API is not supported in this environment.');
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
    } catch (err: any) {
      console.warn('Web camera stream error:', err);
      setCameraActive(false);
      setCameraError('Camera access unavailable. You can upload an image or choose a workstation below.');
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

  // Continuous frame analysis with jsQR for Web
  const startScanLoop = () => {
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

    // Match against registered shopfloor locations
    const cleanVal = rawValue.trim().toLowerCase();
    const matched = activeLocations.find(
      (l) =>
        l.code.toLowerCase().includes(cleanVal) ||
        cleanVal.includes(l.code.toLowerCase()) ||
        l.id.toLowerCase() === cleanVal ||
        (l.qrCode && l.qrCode.toLowerCase().includes(cleanVal)) ||
        l.name.toLowerCase().includes(cleanVal)
    );

    if (matched) {
      setSelectedLoc(matched);
    } else {
      // Create ad-hoc location record from scanned QR tag
      const adHoc: LocationMaster = {
        id: `scanned-${Date.now()}`,
        code: rawValue.substring(0, 24).toUpperCase(),
        name: `Scanned Area: ${rawValue}`,
        plant: 'Bangalore Automotive Plant Alpha',
        department: 'Shopfloor Inspection Bay',
        workstation: rawValue,
        qrCode: rawValue,
        current5SScore: 85,
        champion: 'Area Supervisor',
        lastAuditDate: new Date().toLocaleDateString('en-GB'),
        status: 'OPTIMAL',
        expectedItems: [],
      };
      setSelectedLoc(adHoc);
    }
  };

  // Scan from uploaded image file on Web
  const handleFileUpload = (event: any) => {
    const file = event.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new (window as any).Image();
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
            Alert.alert('Scan Result', 'No QR code detected in the selected image. Please try a clearer photo.');
          }
        }
      };
      img.src = e.target?.result as string;
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

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Scan Area QR Code</Text>
              <Text style={styles.sheetSubtitle}>Align viewfinder with shopfloor QR plate</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.textDark} />
            </TouchableOpacity>
          </View>

          {/* Viewfinder Container */}
          <View style={styles.viewfinderContainer}>
            <View style={styles.viewfinder}>
              {/* 1. NATIVE MOBILE CAMERA (iOS / Android Expo) */}
              {Platform.OS !== 'web' ? (
                permission?.granted ? (
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
                ) : permission === null ? (
                  /* Permission loading state */
                  <View style={styles.permissionBox}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={styles.permissionSub}>Connecting to camera...</Text>
                  </View>
                ) : (
                  /* Explicit Permission Request Prompt on Mobile */
                  <View style={styles.permissionBox}>
                    <View style={styles.permissionIconCircle}>
                      <Ionicons name="camera-outline" size={32} color={COLORS.primary} />
                    </View>
                    <Text style={styles.permissionTitle}>Camera Permission Required</Text>
                    <Text style={styles.permissionSub}>
                      Allow camera access to scan physical QR plates on shopfloor workstations.
                    </Text>
                    <TouchableOpacity
                      style={styles.permissionBtn}
                      onPress={requestPermission}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="shield-checkmark" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.permissionBtnText}>Grant Camera Access</Text>
                    </TouchableOpacity>
                  </View>
                )
              ) : (
                /* 2. WEB BROWSER CAMERA STREAM */
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
                      borderRadius: 18,
                    }}
                    autoPlay
                    playsInline
                    muted
                  />
                  {!cameraActive && (
                    <View style={styles.cameraPlaceholder}>
                      <Ionicons name="qr-code-outline" size={48} color={COLORS.primary} />
                      <Text style={styles.scanInstruction}>
                        {cameraError ? cameraError : 'Web camera initialising...'}
                      </Text>
                    </View>
                  )}
                </>
              )}

              {/* Viewfinder Reticle Overlay Corners */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />

              {/* Animated Laser Line (active while scanning) */}
              {!scannedCode && (Platform.OS === 'web' ? cameraActive : permission?.granted) && (
                <View style={styles.laserLine} />
              )}

              {/* Torch Button for Native Mobile */}
              {Platform.OS !== 'web' && permission?.granted && (
                <TouchableOpacity
                  style={[styles.torchBtn, torchOn && styles.torchBtnActive]}
                  onPress={() => setTorchOn(!torchOn)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={torchOn ? 'flash' : 'flash-outline'}
                    size={18}
                    color={torchOn ? '#FBBF24' : '#FFFFFF'}
                  />
                </TouchableOpacity>
              )}

              {/* Rescan Button if already scanned */}
              {scannedCode && (
                <TouchableOpacity
                  style={styles.rescanBtn}
                  onPress={() => {
                    setScannedCode(null);
                    setSelectedLoc(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.rescanText}>Scan Again</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Upload Button for QR Code Images on Web */}
            {Platform.OS === 'web' && (
              <label style={styles.uploadLabel as any}>
                <Ionicons name="image-outline" size={16} color={COLORS.primary} />
                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.primary, marginLeft: 6 }}>
                  Upload QR Code Image
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
            )}
          </View>

          {/* Success Banner when QR Code is Detected */}
          {scannedCode && (
            <View style={styles.detectedBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#059669" />
              <View style={styles.detectedTextWrap}>
                <Text style={styles.detectedTitle}>QR Code Successfully Scanned</Text>
                <Text style={styles.detectedCode} numberOfLines={1}>
                  {scannedCode}
                </Text>
              </View>
            </View>
          )}

          {/* Selected / Scanned Location Card */}
          {selectedLoc && (
            <View style={[styles.previewCard, SHADOWS.card]}>
              <View style={styles.previewTop}>
                <View style={styles.previewLeft}>
                  <Text style={styles.previewCode}>{selectedLoc.code}</Text>
                  <Text style={styles.previewName}>{selectedLoc.name}</Text>
                  <Text style={styles.previewDept}>
                    {selectedLoc.plant} • {selectedLoc.department}
                  </Text>
                </View>
                <View style={styles.scoreCircle}>
                  <Text style={styles.scoreNumber}>{selectedLoc.current5SScore}%</Text>
                  <Text style={styles.scoreLabel}>5S Score</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.launchBtn} onPress={handleConfirm} activeOpacity={0.85}>
                <Ionicons name="clipboard-outline" size={18} color="#FFFFFF" />
                <Text style={styles.launchBtnText}>Start 5S Audit for this Area</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}

          {/* Nearby Registered Workstations & Real Test QR Codes */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Registered Shopfloor Locations</Text>
            <TouchableOpacity onPress={() => setShowTestQRs(!showTestQRs)}>
              <Text style={styles.toggleTestText}>
                {showTestQRs ? 'Hide Printable QRs' : 'View Printable QRs'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* If Test QRs expanded: render real scannable QR images */}
          {showTestQRs ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.qrCodeGallery}>
              {activeLocations.map((loc) => (
                <TouchableOpacity
                  key={loc.id}
                  style={styles.qrCardItem}
                  onPress={() => handleCodeDetected(loc.qrCode || loc.code)}
                >
                  {qrPreviewDataUrls[loc.id] ? (
                    <Image
                      source={{ uri: qrPreviewDataUrls[loc.id] }}
                      style={styles.qrImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.qrLoadingBox}>
                      <Ionicons name="qr-code" size={36} color={COLORS.primary} />
                    </View>
                  )}
                  <Text style={styles.qrCardCode} numberOfLines={1}>{loc.code}</Text>
                  <Text style={styles.qrCardName} numberOfLines={1}>{loc.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
              {activeLocations.map((loc) => (
                <TouchableOpacity
                  key={loc.id}
                  style={[
                    styles.locationPill,
                    selectedLoc?.id === loc.id && styles.locationPillActive,
                  ]}
                  onPress={() => handleCodeDetected(loc.qrCode || loc.code)}
                >
                  <Ionicons
                    name="location"
                    size={16}
                    color={selectedLoc?.id === loc.id ? '#FFFFFF' : COLORS.primary}
                  />
                  <Text
                    style={[
                      styles.locationPillText,
                      selectedLoc?.id === loc.id && styles.locationPillTextActive,
                    ]}
                  >
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Manual input fallback */}
          <View style={styles.manualRow}>
            <TextInput
              style={styles.manualInput}
              placeholder="Or enter location / barcode code manually..."
              placeholderTextColor={COLORS.textMuted}
              value={manualCode}
              onChangeText={setManualCode}
            />
            <TouchableOpacity
              style={styles.manualSubmit}
              onPress={() => {
                if (manualCode.trim()) {
                  handleCodeDetected(manualCode);
                }
              }}
            >
              <Text style={styles.manualSubmitText}>Find Area</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    maxHeight: '92%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  viewfinderContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  viewfinder: {
    width: 270,
    height: 200,
    backgroundColor: '#0F172A',
    borderRadius: 18,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  permissionBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    zIndex: 10,
  },
  permissionIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFF2EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  permissionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  permissionSub: {
    fontSize: 10.5,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 15,
    marginBottom: 12,
  },
  permissionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  torchBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
  },
  torchBtnActive: {
    backgroundColor: 'rgba(251, 191, 36, 0.3)',
    borderWidth: 1,
    borderColor: '#FBBF24',
  },
  rescanBtn: {
    position: 'absolute',
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    zIndex: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  rescanText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: COLORS.primary,
    zIndex: 5,
  },
  cornerTL: { top: 10, left: 10, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 10, right: 10, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 10, left: 10, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 10, right: 10, borderBottomWidth: 3, borderRightWidth: 3 },
  laserLine: {
    position: 'absolute',
    top: '50%',
    width: '90%',
    height: 2,
    backgroundColor: COLORS.primary,
    zIndex: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  cameraPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  scanInstruction: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 8,
    fontWeight: '500',
    textAlign: 'center',
  },
  uploadLabel: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    cursor: 'pointer',
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  detectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    gap: 10,
  },
  detectedTextWrap: {
    flex: 1,
  },
  detectedTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  detectedCode: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  toggleTestText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  pillScroll: {
    marginBottom: 12,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    gap: 6,
  },
  locationPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  locationPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  locationPillTextActive: {
    color: '#FFFFFF',
  },
  qrCodeGallery: {
    marginBottom: 14,
  },
  qrCardItem: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 8,
    alignItems: 'center',
    marginRight: 10,
    width: 115,
  },
  qrImage: {
    width: 90,
    height: 90,
    borderRadius: 6,
  },
  qrLoadingBox: {
    width: 90,
    height: 90,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  qrCardCode: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 4,
  },
  qrCardName: {
    fontSize: 9,
    color: COLORS.textMedium,
    marginTop: 2,
    textAlign: 'center',
  },
  previewCard: {
    backgroundColor: '#FFF9F5',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFE4D6',
    marginBottom: 12,
  },
  previewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  previewLeft: {
    flex: 1,
    paddingRight: 8,
  },
  previewCode: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
  },
  previewName: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textDark,
    marginTop: 2,
  },
  previewDept: {
    fontSize: 11,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  scoreCircle: {
    backgroundColor: '#FFFFFF',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  scoreNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  scoreLabel: {
    fontSize: 8,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  launchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 11,
    borderRadius: 12,
    gap: 8,
  },
  launchBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manualInput: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: COLORS.textDark,
  },
  manualSubmit: {
    backgroundColor: COLORS.textDark,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  manualSubmitText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});

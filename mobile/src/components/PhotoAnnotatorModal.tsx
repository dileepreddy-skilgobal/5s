import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  Alert,
  Platform,
  LayoutChangeEvent,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SHADOWS } from '../constants/theme';
import { PhotoAnnotation } from '../types';
import { useResponsive } from '../hooks/useResponsive';

interface PhotoAnnotatorModalProps {
  visible: boolean;
  photoUri: string | null;
  onClose: () => void;
  onSave: (annotations: PhotoAnnotation[], updatedPhotoUri?: string) => void;
  initialAnnotations?: PhotoAnnotation[];
  title?: string;
}

const COLOR_PALETTE = [
  { label: 'Critical Red', color: '#EF4444' },
  { label: 'Warning Amber', color: '#F59E0B' },
  { label: 'Caution Yellow', color: '#EAB308' },
  { label: 'Good Practice Green', color: '#10B981' },
  { label: 'Highlight Blue', color: '#2563EB' },
  { label: 'Annotation White', color: '#FFFFFF' },
];

const PRESET_TAGS = [
  'Non-Conformance',
  'Oil Leak',
  'Unsorted Item',
  'Missing Label',
  'Safety Hazard',
  'Clean Standard',
];

// High-resolution realistic shopfloor backdrop fallback if no photo is taken yet
const DEFAULT_SHOPFLOOR_SAMPLE =
  'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop&q=80';

export const PhotoAnnotatorModal: React.FC<PhotoAnnotatorModalProps> = ({
  visible,
  photoUri,
  onClose,
  onSave,
  initialAnnotations = [],
  title = 'Photo Evidence & Defect Canvas',
}) => {
  const { isTablet } = useResponsive();
  const [currentPhotoUri, setCurrentPhotoUri] = useState<string | null>(photoUri);
  const [annotations, setAnnotations] = useState<PhotoAnnotation[]>(initialAnnotations);
  const [activeTool, setActiveTool] = useState<'circle' | 'arrow' | 'box' | 'text'>('circle');
  const [activeColor, setActiveColor] = useState<string>('#EF4444');
  const [annotationText, setAnnotationText] = useState<string>('Non-Conformance');
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({
    width: 340,
    height: isTablet ? 380 : 240,
  });

  // Touch drawing state for live drag gestures
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchCurrent, setTouchCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Sync photoUri when opened
  useEffect(() => {
    if (visible) {
      if (photoUri && photoUri !== 'mock-evidence-camera') {
        setCurrentPhotoUri(photoUri);
      } else if (!currentPhotoUri) {
        setCurrentPhotoUri(DEFAULT_SHOPFLOOR_SAMPLE);
      }
      setAnnotations(initialAnnotations);
      setTouchStart(null);
      setTouchCurrent(null);
      setIsDrawing(false);
    }
  }, [visible, photoUri]);

  // Launch Mobile Camera to capture live evidence
  const handleLaunchCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Camera Permission Needed',
          'Please allow camera access in device settings to take defect photos.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        setCurrentPhotoUri(result.assets[0].uri);
      }
    } catch (err) {
      console.warn('Camera capture error:', err);
      Alert.alert('Camera Error', 'Could not open camera.');
    }
  };

  // Pick existing photo from mobile gallery
  const handlePickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photo Library Permission Needed',
          'Please allow photo library access to choose inspection photos.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        setCurrentPhotoUri(result.assets[0].uri);
      }
    } catch (err) {
      console.warn('Gallery pick error:', err);
      Alert.alert('Gallery Error', 'Could not open photo library.');
    }
  };

  const handleCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setCanvasSize({ width, height });
    }
  };

  // Touch responder handlers
  const handleTouchStart = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    setTouchStart({ x: locationX, y: locationY });
    setTouchCurrent({ x: locationX, y: locationY });
    setIsDrawing(true);
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    if (!isDrawing) return;
    const { locationX, locationY } = e.nativeEvent;
    setTouchCurrent({ x: locationX, y: locationY });
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    if (!touchStart) {
      setIsDrawing(false);
      return;
    }

    const endX = touchCurrent ? touchCurrent.x : e.nativeEvent.locationX;
    const endY = touchCurrent ? touchCurrent.y : e.nativeEvent.locationY;
    const dist = Math.hypot(endX - touchStart.x, endY - touchStart.y);

    const safeW = Math.max(canvasSize.width, 100);
    const safeH = Math.max(canvasSize.height, 100);

    let newAnnotation: PhotoAnnotation;

    if (dist < 10) {
      // Tap placement
      const xPct = Math.round((touchStart.x / safeW) * 100);
      const yPct = Math.round((touchStart.y / safeH) * 100);
      newAnnotation = {
        id: `ann-${Date.now()}`,
        type: activeTool,
        x: Math.min(Math.max(xPct, 5), 95),
        y: Math.min(Math.max(yPct, 5), 95),
        color: activeColor,
        text: annotationText.trim() || undefined,
      };
    } else {
      // Drag placement with dynamic dimensions
      if (activeTool === 'circle') {
        const radius = Math.round(dist);
        const xPct = Math.round((touchStart.x / safeW) * 100);
        const yPct = Math.round((touchStart.y / safeH) * 100);
        newAnnotation = {
          id: `ann-${Date.now()}`,
          type: 'circle',
          x: Math.min(Math.max(xPct, 5), 95),
          y: Math.min(Math.max(yPct, 5), 95),
          radius: Math.min(radius, 120),
          color: activeColor,
          text: annotationText.trim() || undefined,
        };
      } else if (activeTool === 'box') {
        const minX = Math.min(touchStart.x, endX);
        const minY = Math.min(touchStart.y, endY);
        const w = Math.abs(endX - touchStart.x);
        const h = Math.abs(endY - touchStart.y);
        const xPct = Math.round((minX / safeW) * 100);
        const yPct = Math.round((minY / safeH) * 100);
        newAnnotation = {
          id: `ann-${Date.now()}`,
          type: 'box',
          x: Math.min(Math.max(xPct, 5), 95),
          y: Math.min(Math.max(yPct, 5), 95),
          width: Math.round(w),
          height: Math.round(h),
          color: activeColor,
          text: annotationText.trim() || undefined,
        };
      } else if (activeTool === 'arrow') {
        const fromXPct = Math.round((touchStart.x / safeW) * 100);
        const fromYPct = Math.round((touchStart.y / safeH) * 100);
        const toXPct = Math.round((endX / safeW) * 100);
        const toYPct = Math.round((endY / safeH) * 100);
        newAnnotation = {
          id: `ann-${Date.now()}`,
          type: 'arrow',
          x: fromXPct,
          y: fromYPct,
          fromX: fromXPct,
          fromY: fromYPct,
          toX: toXPct,
          toY: toYPct,
          color: activeColor,
          text: annotationText.trim() || undefined,
        };
      } else {
        // Text tag
        const xPct = Math.round((touchStart.x / safeW) * 100);
        const yPct = Math.round((touchStart.y / safeH) * 100);
        newAnnotation = {
          id: `ann-${Date.now()}`,
          type: 'text',
          x: Math.min(Math.max(xPct, 5), 95),
          y: Math.min(Math.max(yPct, 5), 95),
          color: activeColor,
          text: annotationText.trim() || undefined,
        };
      }
    }

    setAnnotations((prev) => [...prev, newAnnotation]);
    setTouchStart(null);
    setTouchCurrent(null);
    setIsDrawing(false);
  };

  // Undo last placed annotation
  const handleUndo = () => {
    setAnnotations((prev) => prev.slice(0, -1));
  };

  // Clear all annotations
  const handleClear = () => {
    setAnnotations([]);
  };

  // Delete individual annotation
  const handleDeleteAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  // Save evidence photo & annotations
  const handleSave = () => {
    onSave(annotations, currentPhotoUri || undefined);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={[styles.sheetContainer, isTablet && styles.tabletSheetContainer]}>
          {/* Header Bar */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>Tap or drag to highlight 5S defect or standard</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={COLORS.textDark} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
            {/* 1. Photo Source Action Bar (Camera & Upload) */}
            <View style={styles.sourceBar}>
              <TouchableOpacity
                style={styles.sourceBtn}
                onPress={handleLaunchCamera}
                activeOpacity={0.8}
              >
                <Ionicons name="camera" size={16} color={COLORS.primary} />
                <Text style={styles.sourceBtnText}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sourceBtn}
                onPress={handlePickFromGallery}
                activeOpacity={0.8}
              >
                <Ionicons name="images-outline" size={16} color={COLORS.primary} />
                <Text style={styles.sourceBtnText}>Choose from Gallery</Text>
              </TouchableOpacity>
            </View>

            {/* 2. Interactive Tool Selector Bar (Circle, Arrow, Box, Text Tag) */}
            <View style={styles.toolBar}>
              <TouchableOpacity
                style={[styles.toolBtn, activeTool === 'circle' && styles.toolBtnActive]}
                onPress={() => setActiveTool('circle')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="radio-button-on"
                  size={16}
                  color={activeTool === 'circle' ? '#FFFFFF' : COLORS.textDark}
                />
                <Text style={[styles.toolText, activeTool === 'circle' && styles.toolTextActive]}>
                  Circle
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toolBtn, activeTool === 'arrow' && styles.toolBtnActive]}
                onPress={() => setActiveTool('arrow')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="arrow-up-circle"
                  size={16}
                  color={activeTool === 'arrow' ? '#FFFFFF' : COLORS.textDark}
                />
                <Text style={[styles.toolText, activeTool === 'arrow' && styles.toolTextActive]}>
                  Arrow
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toolBtn, activeTool === 'box' && styles.toolBtnActive]}
                onPress={() => setActiveTool('box')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="square-outline"
                  size={16}
                  color={activeTool === 'box' ? '#FFFFFF' : COLORS.textDark}
                />
                <Text style={[styles.toolText, activeTool === 'box' && styles.toolTextActive]}>
                  Box
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toolBtn, activeTool === 'text' && styles.toolBtnActive]}
                onPress={() => setActiveTool('text')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="text"
                  size={16}
                  color={activeTool === 'text' ? '#FFFFFF' : COLORS.textDark}
                />
                <Text style={[styles.toolText, activeTool === 'text' && styles.toolTextActive]}>
                  Text Tag
                </Text>
              </TouchableOpacity>
            </View>

            {/* 3. 6-Enterprise Color Palette Bar */}
            <View style={styles.paletteRow}>
              <Text style={styles.paletteLabel}>Color:</Text>
              <View style={styles.paletteList}>
                {COLOR_PALETTE.map((p) => {
                  const isSelected = activeColor === p.color;
                  return (
                    <TouchableOpacity
                      key={p.color}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: p.color },
                        isSelected && styles.colorCircleActive,
                      ]}
                      onPress={() => setActiveColor(p.color)}
                      activeOpacity={0.8}
                    />
                  );
                })}
              </View>

              {/* Undo & Clear Buttons */}
              <View style={styles.editActions}>
                <TouchableOpacity
                  style={[styles.editBtn, annotations.length === 0 && styles.editBtnDisabled]}
                  onPress={handleUndo}
                  disabled={annotations.length === 0}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="arrow-undo"
                    size={15}
                    color={annotations.length > 0 ? COLORS.textDark : '#CBD5E1'}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.editBtn, annotations.length === 0 && styles.editBtnDisabled]}
                  onPress={handleClear}
                  disabled={annotations.length === 0}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="trash-outline"
                    size={15}
                    color={annotations.length > 0 ? '#DC2626' : '#CBD5E1'}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* 4. Quick Tag Preset Chips */}
            <View style={styles.tagSection}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScroll}>
                {PRESET_TAGS.map((tag) => {
                  const isSelected = annotationText === tag;
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[styles.tagChip, isSelected && styles.tagChipActive]}
                      onPress={() => setAnnotationText(tag)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.tagChipText, isSelected && styles.tagChipTextActive]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TextInput
                style={styles.customTagInput}
                value={annotationText}
                onChangeText={setAnnotationText}
                placeholder="Or type custom defect note..."
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* 5. Interactive Canvas Board */}
            <View style={styles.canvasContainer}>
              <View
                onLayout={handleCanvasLayout}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={handleTouchStart}
                onResponderMove={handleTouchMove}
                onResponderRelease={handleTouchEnd}
                onResponderTerminate={() => setIsDrawing(false)}
                style={[styles.canvasSurface, isTablet && styles.tabletCanvasSurface]}
              >
                {/* Background Photo */}
                <Image
                  source={{ uri: currentPhotoUri || DEFAULT_SHOPFLOOR_SAMPLE }}
                  style={styles.canvasImage}
                  resizeMode="cover"
                />

                {/* Grid Overlay Guide */}
                <View style={styles.gridOverlay} pointerEvents="none" />

                {/* Rendered Annotations Layer */}
                {annotations.map((ann) => {
                  const hasCustomSize = Boolean(
                    (ann.type === 'circle' && ann.radius) ||
                    (ann.type === 'box' && ann.width && ann.height)
                  );

                  return (
                    <View
                      key={ann.id}
                      style={[
                        styles.annotationBox,
                        {
                          left: `${ann.x}%`,
                          top: `${ann.y}%`,
                        },
                        hasCustomSize ? { transform: [] } : undefined,
                      ]}
                      pointerEvents="none"
                    >
                      {/* Circle Tool Marker */}
                      {ann.type === 'circle' && (
                        <View
                          style={[
                            styles.markerCircle,
                            ann.radius
                              ? {
                                  width: Math.max(ann.radius * 2, 38),
                                  height: Math.max(ann.radius * 2, 38),
                                  borderRadius: Math.max(ann.radius, 19),
                                }
                              : {},
                            { borderColor: ann.color || activeColor },
                          ]}
                        >
                          {ann.text && (
                            <View
                              style={[
                                styles.tagBadge,
                                { backgroundColor: ann.color || activeColor },
                              ]}
                            >
                              <Text style={styles.tagBadgeText} numberOfLines={1}>
                                {ann.text}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Box Tool Marker */}
                      {ann.type === 'box' && (
                        <View
                          style={[
                            styles.markerBox,
                            ann.width && ann.height
                              ? {
                                  width: Math.max(ann.width, 36),
                                  height: Math.max(ann.height, 26),
                                }
                              : {},
                            { borderColor: ann.color || activeColor },
                          ]}
                        >
                          {ann.text && (
                            <View
                              style={[
                                styles.tagBadge,
                                { backgroundColor: ann.color || activeColor },
                              ]}
                            >
                              <Text style={styles.tagBadgeText} numberOfLines={1}>
                                {ann.text}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Arrow Tool Marker */}
                      {ann.type === 'arrow' && (
                        <View
                          style={[
                            styles.arrowMarkerWrap,
                            ann.fromX !== undefined && ann.toX !== undefined
                              ? {
                                  transform: [
                                    {
                                      rotate: `${
                                        Math.atan2(
                                          (ann.toY! - ann.fromY!) * (canvasSize.height / 100),
                                          (ann.toX! - ann.fromX!) * (canvasSize.width / 100)
                                        ) *
                                          (180 / Math.PI) -
                                        90
                                      }deg`,
                                    },
                                  ],
                                }
                              : {},
                          ]}
                        >
                          <Ionicons
                            name="arrow-up"
                            size={28}
                            color={ann.color || activeColor}
                            style={styles.arrowDropShadow}
                          />
                          {ann.text && (
                            <View
                              style={[
                                styles.tagBadge,
                                { backgroundColor: ann.color || activeColor },
                              ]}
                            >
                              <Text style={styles.tagBadgeText} numberOfLines={1}>
                                {ann.text}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Text Tag Marker */}
                      {ann.type === 'text' && (
                        <View
                          style={[
                            styles.textMarkerPill,
                            { borderColor: ann.color || activeColor },
                          ]}
                        >
                          <View
                            style={[
                              styles.colorDot,
                              { backgroundColor: ann.color || activeColor },
                            ]}
                          />
                          <Text style={styles.textMarkerLabel} numberOfLines={1}>
                            {ann.text || 'Defect'}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Live Drawing Preview Ghost */}
                {isDrawing && touchStart && touchCurrent && (
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    {activeTool === 'circle' && (
                      <View
                        style={{
                          position: 'absolute',
                          left:
                            touchStart.x -
                            Math.hypot(
                              touchCurrent.x - touchStart.x,
                              touchCurrent.y - touchStart.y
                            ),
                          top:
                            touchStart.y -
                            Math.hypot(
                              touchCurrent.x - touchStart.x,
                              touchCurrent.y - touchStart.y
                            ),
                          width:
                            Math.hypot(
                              touchCurrent.x - touchStart.x,
                              touchCurrent.y - touchStart.y
                            ) * 2,
                          height:
                            Math.hypot(
                              touchCurrent.x - touchStart.x,
                              touchCurrent.y - touchStart.y
                            ) * 2,
                          borderRadius: Math.hypot(
                            touchCurrent.x - touchStart.x,
                            touchCurrent.y - touchStart.y
                          ),
                          borderWidth: 2,
                          borderColor: activeColor,
                          borderStyle: 'dashed',
                          backgroundColor: 'rgba(255,255,255,0.1)',
                        }}
                      />
                    )}
                    {activeTool === 'box' && (
                      <View
                        style={{
                          position: 'absolute',
                          left: Math.min(touchStart.x, touchCurrent.x),
                          top: Math.min(touchStart.y, touchCurrent.y),
                          width: Math.abs(touchCurrent.x - touchStart.x),
                          height: Math.abs(touchCurrent.y - touchStart.y),
                          borderWidth: 2,
                          borderColor: activeColor,
                          borderStyle: 'dashed',
                          borderRadius: 6,
                          backgroundColor: 'rgba(255,255,255,0.1)',
                        }}
                      />
                    )}
                    {activeTool === 'arrow' && (
                      <View
                        style={{
                          position: 'absolute',
                          left: touchStart.x - 14,
                          top: touchStart.y - 14,
                          transform: [
                            {
                              rotate: `${
                                Math.atan2(
                                  touchCurrent.y - touchStart.y,
                                  touchCurrent.x - touchStart.x
                                ) *
                                  (180 / Math.PI) -
                                90
                              }deg`,
                            },
                          ],
                          alignItems: 'center',
                        }}
                      >
                        <Ionicons name="arrow-up" size={28} color={activeColor} />
                      </View>
                    )}
                  </View>
                )}
              </View>

              <Text style={styles.canvasHint}>
                {annotations.length === 0
                  ? 'Tap or drag anywhere on the photo to draw markups'
                  : `${annotations.length} defect markup(s) placed`}
              </Text>
            </View>

            {/* 6. Active Markups Breakdown with Quick Remove */}
            {annotations.length > 0 && (
              <View style={styles.activeMarkupsSection}>
                <Text style={styles.activeMarkupsTitle}>Placed Markups ({annotations.length})</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.activeMarkupsScroll}
                >
                  {annotations.map((ann, idx) => (
                    <View key={ann.id || idx} style={styles.activeMarkupPill}>
                      <View
                        style={[styles.markupDot, { backgroundColor: ann.color || activeColor }]}
                      />
                      <Text style={styles.activeMarkupText} numberOfLines={1}>
                        {ann.type.toUpperCase()}: {ann.text || 'Defect'}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleDeleteAnnotation(ann.id)}
                        style={styles.markupDeleteBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close" size={12} color="#64748B" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 7. Footer Actions: Cancel & Save Evidence */}
            <View style={styles.footerRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>
                  Save Evidence ({annotations.length})
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    paddingTop: 12,
  },
  sourceBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  sourceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF4EE',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingVertical: 9,
    borderRadius: 12,
  },
  sourceBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  toolBar: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  toolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  toolBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  toolText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  toolTextActive: {
    color: '#FFFFFF',
  },
  paletteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  paletteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  paletteList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  colorCircleActive: {
    transform: [{ scale: 1.25 }],
    borderColor: COLORS.textDark,
    borderWidth: 2.5,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  editBtnDisabled: {
    opacity: 0.4,
  },
  tagSection: {
    marginBottom: 10,
  },
  tagScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  tagChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tagChipActive: {
    backgroundColor: '#FFF2EB',
    borderColor: COLORS.primary,
  },
  tagChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMedium,
  },
  tagChipTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  customTagInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    color: COLORS.textDark,
  },
  canvasContainer: {
    alignItems: 'center',
    marginVertical: 4,
  },
  canvasSurface: {
    width: '100%',
    height: 240,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
    borderWidth: 2,
    borderColor: '#CBD5E1',
  },
  canvasImage: {
    width: '100%',
    height: '100%',
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  annotationBox: {
    position: 'absolute',
    transform: [{ translateX: -20 }, { translateY: -20 }],
  },
  markerCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerBox: {
    width: 50,
    height: 38,
    borderRadius: 6,
    borderWidth: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowMarkerWrap: {
    alignItems: 'center',
  },
  arrowDropShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
  },
  tagBadge: {
    position: 'absolute',
    top: -16,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagBadgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '800',
  },
  textMarkerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 4,
  },
  colorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  textMarkerLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  canvasHint: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    marginTop: 6,
    fontWeight: '500',
  },
  activeMarkupsSection: {
    marginTop: 8,
    marginBottom: 4,
  },
  activeMarkupsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMedium,
    marginBottom: 4,
  },
  activeMarkupsScroll: {
    flexDirection: 'row',
  },
  activeMarkupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  markupDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  activeMarkupText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textDark,
    maxWidth: 120,
  },
  markupDeleteBtn: {
    padding: 1,
    marginLeft: 2,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMedium,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 14,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tabletSheetContainer: {
    maxWidth: 840,
    width: '92%',
    alignSelf: 'center',
    borderRadius: 24,
    marginBottom: 20,
  },
  tabletCanvasSurface: {
    height: 380,
  },
});

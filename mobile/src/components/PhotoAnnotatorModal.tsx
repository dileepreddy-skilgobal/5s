import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  Alert,
  LayoutChangeEvent,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';
import { PhotoAnnotation } from '../types';
import { useResponsive } from '../hooks/useResponsive';
import { clampPct, DEFAULT_BOX_PCT, DEFAULT_CIRCLE_RADIUS_PCT, roundPct, toPercentAnnotations } from '../services/annotations';
import { Button, TextField } from './ui';

interface PhotoAnnotatorModalProps {
  visible: boolean;
  photoUri: string | null;
  onClose: () => void;
  /**
   * Called with the shapes and, when the photo was replaced inside the annotator, the new photo's URI and
   * pixel size (so the caller can downscale it correctly).
   */
  onSave: (annotations: PhotoAnnotation[], updatedPhotoUri?: string, updatedPhotoSize?: { width: number; height: number }) => void;
  initialAnnotations?: PhotoAnnotation[];
  title?: string;
}

type Tool = PhotoAnnotation['type'];

/** Markup colours are drawn onto the photo itself, so they are fixed high-contrast colours, not theme tokens. */
const COLOR_PALETTE = [
  { label: 'Red', color: '#EF4444' },
  { label: 'Amber', color: '#F59E0B' },
  { label: 'Yellow', color: '#EAB308' },
  { label: 'Green', color: '#10B981' },
  { label: 'Blue', color: '#2563EB' },
  { label: 'White', color: '#FFFFFF' },
];

const PRESET_TAGS = ['Non-conformance', 'Oil leak', 'Unsorted item', 'Missing label', 'Safety hazard', 'Clean standard'];

const TOOLS: { key: Tool; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'circle', label: 'Circle', icon: 'ellipse-outline' },
  { key: 'arrow', label: 'Arrow', icon: 'arrow-forward' },
  { key: 'box', label: 'Box', icon: 'square-outline' },
  { key: 'text', label: 'Label', icon: 'text' },
];

const TOOL_NAMES: Record<Tool, string> = { circle: 'Circle', arrow: 'Arrow', box: 'Box', text: 'Label' };

/** Fallback aspect ratio (width / height) until the photo's real size is known. */
const DEFAULT_ASPECT = 4 / 3;

/** A straight line between two points (px), drawn as a rotated bar. */
const Segment: React.FC<{ x1: number; y1: number; x2: number; y2: number; thickness: number; color: string }> = ({
  x1,
  y1,
  x2,
  y2,
  thickness,
  color,
}) => {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (x1 + x2) / 2 - length / 2,
        top: (y1 + y2) / 2 - thickness / 2,
        width: length,
        height: thickness,
        borderRadius: thickness / 2,
        backgroundColor: color,
        transform: [{ rotate: `${angle}rad` }],
      }}
    />
  );
};

/**
 * Draws percent-based annotations over a photo rendered at `width` x `height` px with the photo's own
 * aspect ratio — the same geometry, stroke and label placement the server uses when it burns the
 * shapes into the image, so the preview matches the stored annotated photo.
 */
export const AnnotationLayer: React.FC<{ annotations: PhotoAnnotation[]; width: number; height: number }> = ({
  annotations,
  width: W,
  height: H,
}) => {
  const px = (p?: number) => ((p ?? 0) / 100) * W;
  const py = (p?: number) => ((p ?? 0) / 100) * H;
  const stroke = Math.max(2, W * 0.006);
  const font = Math.max(8, W * 0.03);

  const label = (x: number, y: number, text: string, color: string, key: string) => (
    <View
      key={key}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: Math.max(0, Math.min(x, W - font * 2)),
        top: Math.max(0, Math.min(y, H - font * 1.5)),
        height: font * 1.5,
        paddingHorizontal: font * 0.4,
        borderRadius: (font * 1.5) / 4,
        backgroundColor: color,
        opacity: 0.9,
        justifyContent: 'center',
        maxWidth: W,
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: font, fontWeight: '700' }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {toPercentAnnotations(annotations).map((a) => {
        const color = a.color || '#EF4444';
        const text = a.text?.trim();
        if (a.type === 'box') {
          const x = px(a.x);
          const y = py(a.y);
          const w = px(a.width ?? DEFAULT_BOX_PCT.width);
          const h = py(a.height ?? DEFAULT_BOX_PCT.height);
          return (
            <React.Fragment key={a.id}>
              <View style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderWidth: stroke, borderColor: color }} />
              {text ? label(x, y - font * 1.6, text, color, `${a.id}-l`) : null}
            </React.Fragment>
          );
        }
        if (a.type === 'circle') {
          const cx = px(a.x);
          const cy = py(a.y);
          const r = px(a.radius ?? DEFAULT_CIRCLE_RADIUS_PCT);
          return (
            <React.Fragment key={a.id}>
              <View
                style={{ position: 'absolute', left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: r, borderWidth: stroke, borderColor: color }}
              />
              {text ? label(cx - r, cy - r - font * 1.6, text, color, `${a.id}-l`) : null}
            </React.Fragment>
          );
        }
        if (a.type === 'arrow') {
          const x1 = px(a.fromX ?? a.x);
          const y1 = py(a.fromY ?? a.y);
          const x2 = px(a.toX ?? a.x);
          const y2 = py(a.toY ?? a.y);
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const head = stroke * 5;
          const hx1 = x2 - head * Math.cos(angle - Math.PI / 7);
          const hy1 = y2 - head * Math.sin(angle - Math.PI / 7);
          const hx2 = x2 - head * Math.cos(angle + Math.PI / 7);
          const hy2 = y2 - head * Math.sin(angle + Math.PI / 7);
          return (
            <React.Fragment key={a.id}>
              <Segment x1={x1} y1={y1} x2={x2} y2={y2} thickness={stroke} color={color} />
              <Segment x1={x2} y1={y2} x2={hx1} y2={hy1} thickness={stroke} color={color} />
              <Segment x1={x2} y1={y2} x2={hx2} y2={hy2} thickness={stroke} color={color} />
              {text ? label(x1, y1 + font * 0.4, text, color, `${a.id}-l`) : null}
            </React.Fragment>
          );
        }
        return text ? label(px(a.x), py(a.y), text, color, a.id) : null;
      })}
    </View>
  );
};

export const PhotoAnnotatorModal: React.FC<PhotoAnnotatorModalProps> = ({
  visible,
  photoUri,
  onClose,
  onSave,
  initialAnnotations = [],
  title = 'Mark up photo',
}) => {
  const { isTablet } = useResponsive();
  const [currentPhotoUri, setCurrentPhotoUri] = useState<string | null>(photoUri);
  /** Pixel size of a photo taken or picked inside the annotator (replacing the one passed in). */
  const [replacedSize, setReplacedSize] = useState<{ width: number; height: number } | undefined>(undefined);
  const [annotations, setAnnotations] = useState<PhotoAnnotation[]>(initialAnnotations);
  const [activeTool, setActiveTool] = useState<Tool>('circle');
  const [activeColor, setActiveColor] = useState<string>('#EF4444');
  const [annotationText, setAnnotationText] = useState<string>('Non-conformance');
  // The canvas always has the photo's aspect ratio so percent geometry maps 1:1 onto the photo
  const [photoAspect, setPhotoAspect] = useState<number>(DEFAULT_ASPECT);
  const [containerWidth, setContainerWidth] = useState<number>(340);
  const maxCanvasHeight = isTablet ? 520 : 420;
  const canvasSize = (() => {
    let width = Math.max(containerWidth, 100);
    let height = width / photoAspect;
    if (height > maxCanvasHeight) {
      height = maxCanvasHeight;
      width = height * photoAspect;
    }
    return { width: Math.round(width), height: Math.round(height) };
  })();

  // Touch drawing state for live drag gestures
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchCurrent, setTouchCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Sync photoUri when opened
  useEffect(() => {
    if (visible) {
      if (photoUri) setCurrentPhotoUri(photoUri);
      setReplacedSize(undefined);
      setAnnotations(toPercentAnnotations(initialAnnotations));
      setTouchStart(null);
      setTouchCurrent(null);
      setIsDrawing(false);
    }
  }, [visible, photoUri]);

  // Real photo size → canvas aspect ratio
  useEffect(() => {
    if (!currentPhotoUri) {
      setPhotoAspect(DEFAULT_ASPECT);
      return;
    }
    let cancelled = false;
    Image.getSize(
      currentPhotoUri,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) setPhotoAspect(w / h);
      },
      () => {
        if (!cancelled) setPhotoAspect(DEFAULT_ASPECT);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [currentPhotoUri]);

  const applyPickedAsset = (asset?: ImagePicker.ImagePickerAsset) => {
    if (!asset?.uri) return;
    setCurrentPhotoUri(asset.uri);
    setReplacedSize(asset.width && asset.height ? { width: asset.width, height: asset.height } : undefined);
  };

  // Launch Mobile Camera to capture live evidence
  const handleLaunchCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera access needed', 'Allow camera access in your device settings to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });

      if (!result.canceled) applyPickedAsset(result.assets?.[0]);
    } catch (err) {
      console.warn('Camera capture error:', err);
      Alert.alert('Camera unavailable', 'The camera could not be opened.');
    }
  };

  // Pick existing photo from mobile gallery
  const handlePickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photo access needed', 'Allow photo library access in your device settings to choose a photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });

      if (!result.canceled) applyPickedAsset(result.assets?.[0]);
    } catch (err) {
      console.warn('Gallery pick error:', err);
      Alert.alert('Gallery unavailable', 'The photo library could not be opened.');
    }
  };

  const handleContainerLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0 && Math.abs(width - containerWidth) > 1) {
      setContainerWidth(width);
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

    const safeW = Math.max(canvasSize.width, 1);
    const safeH = Math.max(canvasSize.height, 1);
    // All geometry is stored as a percentage of the photo (`unit: 'pct'`); radius is a percentage of the width
    const pctX = (v: number) => roundPct(clampPct((v / safeW) * 100));
    const pctY = (v: number) => roundPct(clampPct((v / safeH) * 100));
    const sx = pctX(touchStart.x);
    const sy = pctY(touchStart.y);
    const common = {
      id: `ann-${Date.now()}`,
      unit: 'pct' as const,
      color: activeColor,
      text: annotationText.trim() || undefined,
    };

    let newAnnotation: PhotoAnnotation;

    if (dist < 10) {
      // Tap placement: default-sized shape centred on the tap
      if (activeTool === 'circle') {
        newAnnotation = { ...common, type: 'circle', x: sx, y: sy, radius: DEFAULT_CIRCLE_RADIUS_PCT };
      } else if (activeTool === 'box') {
        const x = roundPct(clampPct(Math.min(sx - DEFAULT_BOX_PCT.width / 2, 100 - DEFAULT_BOX_PCT.width)));
        const y = roundPct(clampPct(Math.min(sy - DEFAULT_BOX_PCT.height / 2, 100 - DEFAULT_BOX_PCT.height)));
        newAnnotation = { ...common, type: 'box', x, y, width: DEFAULT_BOX_PCT.width, height: DEFAULT_BOX_PCT.height };
      } else if (activeTool === 'arrow') {
        // Arrow pointing at the tapped spot from the upper left
        const fromX = roundPct(clampPct(sx - 12));
        const fromY = roundPct(clampPct(sy - 12 * (safeW / safeH)));
        newAnnotation = { ...common, type: 'arrow', x: fromX, y: fromY, fromX, fromY, toX: sx, toY: sy };
      } else {
        newAnnotation = { ...common, type: 'text', x: sx, y: sy };
      }
    } else if (activeTool === 'circle') {
      // Drag from the centre outwards
      newAnnotation = { ...common, type: 'circle', x: sx, y: sy, radius: roundPct((dist / safeW) * 100) };
    } else if (activeTool === 'box') {
      const x1 = pctX(Math.min(touchStart.x, endX));
      const y1 = pctY(Math.min(touchStart.y, endY));
      const x2 = pctX(Math.max(touchStart.x, endX));
      const y2 = pctY(Math.max(touchStart.y, endY));
      newAnnotation = { ...common, type: 'box', x: x1, y: y1, width: roundPct(x2 - x1), height: roundPct(y2 - y1) };
    } else if (activeTool === 'arrow') {
      const toX = pctX(endX);
      const toY = pctY(endY);
      newAnnotation = { ...common, type: 'arrow', x: sx, y: sy, fromX: sx, fromY: sy, toX, toY };
    } else {
      // Text tag anchored where the drag started
      newAnnotation = { ...common, type: 'text', x: sx, y: sy };
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
    if (!currentPhotoUri) return;
    const replaced = currentPhotoUri !== photoUri;
    onSave(annotations, currentPhotoUri, replaced ? replacedSize : undefined);
    onClose();
  };

  const radius = touchStart && touchCurrent ? Math.hypot(touchCurrent.x - touchStart.x, touchCurrent.y - touchStart.y) : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={[styles.container, isTablet && styles.tabletContainer]}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close without saving">
              <Ionicons name="close" size={24} color={COLORS.textDark} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                Tap or drag on the photo to mark the problem
              </Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
            {/* Canvas (same aspect ratio as the photo) */}
            <View style={styles.canvasContainer} onLayout={handleContainerLayout}>
              {currentPhotoUri ? (
                <View
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={handleTouchStart}
                  onResponderMove={handleTouchMove}
                  onResponderRelease={handleTouchEnd}
                  onResponderTerminate={() => setIsDrawing(false)}
                  style={[styles.canvasSurface, { width: canvasSize.width, height: canvasSize.height }]}
                  accessibilityLabel="Photo drawing area"
                >
                  {/* Background Photo */}
                  <Image source={{ uri: currentPhotoUri }} style={styles.canvasImage} resizeMode="stretch" />

                  {/* Rendered Annotations Layer (percent geometry, as burned by the server) */}
                  <AnnotationLayer annotations={annotations} width={canvasSize.width} height={canvasSize.height} />

                  {/* Live Drawing Preview Ghost */}
                  {isDrawing && touchStart && touchCurrent && (
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                      {activeTool === 'circle' && (
                        <View
                          style={[
                            styles.ghost,
                            {
                              left: touchStart.x - radius,
                              top: touchStart.y - radius,
                              width: radius * 2,
                              height: radius * 2,
                              borderRadius: radius,
                              borderColor: activeColor,
                            },
                          ]}
                        />
                      )}
                      {activeTool === 'box' && (
                        <View
                          style={[
                            styles.ghost,
                            {
                              left: Math.min(touchStart.x, touchCurrent.x),
                              top: Math.min(touchStart.y, touchCurrent.y),
                              width: Math.abs(touchCurrent.x - touchStart.x),
                              height: Math.abs(touchCurrent.y - touchStart.y),
                              borderColor: activeColor,
                            },
                          ]}
                        />
                      )}
                      {activeTool === 'arrow' && (
                        <Segment x1={touchStart.x} y1={touchStart.y} x2={touchCurrent.x} y2={touchCurrent.y} thickness={2} color={activeColor} />
                      )}
                    </View>
                  )}
                </View>
              ) : (
                <View style={[styles.canvasEmpty, { width: canvasSize.width, height: canvasSize.height }]}>
                  <Ionicons name="image-outline" size={28} color={COLORS.textMuted} />
                  <Text style={styles.canvasEmptyText}>Take or choose a photo to mark it up</Text>
                </View>
              )}
            </View>

            {/* Replace photo */}
            <View style={styles.sourceBar}>
              <Button
                label={currentPhotoUri ? 'Retake' : 'Take photo'}
                icon="camera-outline"
                variant="secondary"
                size="sm"
                onPress={handleLaunchCamera}
                style={styles.flex}
              />
              <Button label="Choose from gallery" icon="images-outline" variant="secondary" size="sm" onPress={handlePickFromGallery} style={styles.flex} />
            </View>

            {/* Tool selector */}
            <Text style={styles.sectionLabel}>Shape</Text>
            <View style={styles.toolBar}>
              {TOOLS.map((t) => {
                const selected = activeTool === t.key;
                return (
                  <Pressable
                    key={t.key}
                    style={({ pressed }) => [styles.toolBtn, selected && styles.toolBtnActive, pressed && !selected && styles.pressed]}
                    onPress={() => setActiveTool(t.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.label} tool`}
                    accessibilityState={{ selected }}
                  >
                    <Ionicons name={t.icon} size={18} color={selected ? COLORS.textInverse : COLORS.textDark} />
                    <Text style={[styles.toolText, selected && styles.toolTextActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Colour + undo / clear */}
            <View style={styles.paletteRow}>
              <View style={styles.paletteList}>
                {COLOR_PALETTE.map((p) => {
                  const isSelected = activeColor === p.color;
                  return (
                    <Pressable
                      key={p.color}
                      onPress={() => setActiveColor(p.color)}
                      hitSlop={4}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.label} colour`}
                      accessibilityState={{ selected: isSelected }}
                      style={[styles.colorRing, isSelected && styles.colorRingActive]}
                    >
                      <View style={[styles.colorCircle, { backgroundColor: p.color }]} />
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.editActions}>
                <Pressable
                  style={[styles.editBtn, annotations.length === 0 && styles.editBtnDisabled]}
                  onPress={handleUndo}
                  disabled={annotations.length === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Undo last mark"
                  accessibilityState={{ disabled: annotations.length === 0 }}
                >
                  <Ionicons name="arrow-undo" size={18} color={COLORS.textDark} />
                </Pressable>
                <Pressable
                  style={[styles.editBtn, annotations.length === 0 && styles.editBtnDisabled]}
                  onPress={handleClear}
                  disabled={annotations.length === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Remove all marks"
                  accessibilityState={{ disabled: annotations.length === 0 }}
                >
                  <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                </Pressable>
              </View>
            </View>

            {/* Label text for new marks */}
            <Text style={styles.sectionLabel}>Label for new marks</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagScroll}>
              {PRESET_TAGS.map((tag) => {
                const isSelected = annotationText === tag;
                return (
                  <Pressable
                    key={tag}
                    style={[styles.tagChip, isSelected && styles.tagChipActive]}
                    onPress={() => setAnnotationText(tag)}
                    hitSlop={{ top: 4, bottom: 4 }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={[styles.tagChipText, isSelected && styles.tagChipTextActive]}>{tag}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <TextField
              value={annotationText}
              onChangeText={setAnnotationText}
              placeholder="Or type your own label (optional)"
              accessibilityLabel="Label for new marks"
              returnKeyType="done"
            />

            {/* Placed marks with quick remove */}
            {annotations.length > 0 && (
              <View>
                <Text style={styles.sectionLabel}>Marks on this photo ({annotations.length})</Text>
                <View style={styles.markupWrap}>
                  {annotations.map((ann, idx) => (
                    <View key={ann.id || idx} style={styles.activeMarkupPill}>
                      <View style={[styles.markupDot, { backgroundColor: ann.color || activeColor }]} />
                      <Text style={styles.activeMarkupText} numberOfLines={1}>
                        {TOOL_NAMES[ann.type]}
                        {ann.text ? `: ${ann.text}` : ''}
                      </Text>
                      <Pressable
                        onPress={() => handleDeleteAnnotation(ann.id)}
                        style={styles.markupDeleteBtn}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove mark ${idx + 1}`}
                      >
                        <Ionicons name="close" size={16} color={COLORS.textMedium} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer actions */}
          <View style={styles.footerRow}>
            <Button label="Cancel" variant="secondary" onPress={onClose} />
            <Button
              label={annotations.length > 0 ? `Save photo (${annotations.length} mark${annotations.length === 1 ? '' : 's'})` : 'Save photo'}
              icon="checkmark"
              onPress={handleSave}
              disabled={!currentPhotoUri}
              style={styles.flex}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.card },
  container: { flex: 1 },
  tabletContainer: { width: '100%', maxWidth: 840, alignSelf: 'center' },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  iconBtn: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', borderRadius: TOUCH_TARGET / 2 },
  headerText: { flex: 1, minWidth: 0 },
  title: { ...TYPE.heading, color: COLORS.textDark },
  subtitle: { ...TYPE.caption, color: COLORS.textMedium, marginTop: 2 },
  scrollBody: { padding: SPACING.screen, paddingBottom: SPACING.xxl },
  canvasContainer: { alignItems: 'center', width: '100%' },
  canvasSurface: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORS.textDark,
  },
  canvasImage: { width: '100%', height: '100%' },
  canvasEmpty: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.borderDark,
    backgroundColor: COLORS.cardSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    padding: SPACING.lg,
  },
  canvasEmptyText: { ...TYPE.label, color: COLORS.textMedium, textAlign: 'center' },
  ghost: { position: 'absolute', borderWidth: 2, borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.1)' },
  sourceBar: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  sectionLabel: { ...TYPE.label, color: COLORS.textDark, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  toolBar: { flexDirection: 'row', gap: SPACING.sm },
  toolBtn: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  toolBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  toolText: { ...TYPE.captionStrong, color: COLORS.textDark },
  toolTextActive: { color: COLORS.textInverse },
  paletteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  paletteList: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACING.xs, flex: 1 },
  colorRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorRingActive: { borderColor: COLORS.primary },
  colorCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: COLORS.borderDark },
  editActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  editBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  editBtnDisabled: { opacity: 0.4 },
  tagScroll: { gap: SPACING.sm, paddingRight: SPACING.screen, marginBottom: SPACING.sm },
  tagChip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagChipActive: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
  tagChipText: { ...TYPE.label, fontWeight: '500', color: COLORS.textMedium },
  tagChipTextActive: { color: COLORS.primary, fontWeight: '600' },
  markupWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  activeMarkupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.cardSecondary,
    borderRadius: RADIUS.sm,
    paddingLeft: SPACING.sm,
    minHeight: 40,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: '100%',
  },
  markupDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: COLORS.borderDark },
  activeMarkupText: { ...TYPE.caption, color: COLORS.textDark, flexShrink: 1 },
  markupDeleteBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  footerRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.screen,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
});

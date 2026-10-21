import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, RADIUS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';
import { PILLARS } from '../constants/pillars';
import { FiveSCategory, GpsFix, LocalMedia, LocationMaster, ObservationDraft, ObservationSeverity, PhotoAnnotation } from '../types';
import { AnnotationLayer, PhotoAnnotatorModal } from './PhotoAnnotatorModal';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';
import { prepareEvidencePhoto } from '../services/imageEvidence';
import { MediaStore } from '../services/mediaStore';
import { DeviceLocation } from '../services/deviceLocation';
import { ApiService, DuplicateCandidate } from '../services/api';
import { Connectivity } from '../services/connectivity';
import { SyncService } from '../services/syncService';
import { Button, Chip, FormField, TextField } from './ui';
import { AreaPicker, ChipGroup, IconButton, InlineMessage, Sheet } from './SheetLayout';

interface ReportObservationModalProps {
  visible: boolean;
  onClose: () => void;
  /** Queues the report (sent now when online) — media files now belong to the queue item. */
  onSubmit: (draft: ObservationDraft, clientRequestId: string) => Promise<void>;
  initialLocation?: LocationMaster | null;
  locations: LocationMaster[];
}

const SEVERITIES: { key: ObservationSeverity; label: string }[] = [
  { key: 'MINOR', label: 'Minor' },
  { key: 'MODERATE', label: 'Moderate' },
  { key: 'MAJOR', label: 'Major' },
  { key: 'CRITICAL', label: 'Critical' },
  { key: 'KAIZEN_OPPORTUNITY', label: 'Kaizen idea' },
];

type FieldErrors = { area?: string; title?: string; description?: string };

/** Server limit for supporting media per observation. */
const MAX_MEDIA = 10;
const MAX_VIDEO_SEC = 30;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const DUPLICATE_CHECK_DELAY_MS = 800;

type GpsState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ok'; fix: GpsFix }
  | { status: 'denied' }
  | { status: 'unavailable'; message: string };

type PhotoMedia = LocalMedia & { annotations: PhotoAnnotation[] };

/** Report an abnormality (observation) with photo + markup, extra media, voice note and GPS; works offline. */
export const ReportObservationModal: React.FC<ReportObservationModalProps> = ({ visible, onClose, onSubmit, initialLocation, locations }) => {
  const [locationId, setLocationId] = useState('');
  const [category, setCategory] = useState<FiveSCategory>('S1_SORT');
  const [severity, setSeverity] = useState<ObservationSeverity>('MODERATE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<PhotoMedia | undefined>(undefined);
  const [photoAspect, setPhotoAspect] = useState(4 / 3);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [media, setMedia] = useState<LocalMedia[]>([]);
  const [voiceNote, setVoiceNote] = useState<LocalMedia | undefined>(undefined);
  const [gps, setGps] = useState<GpsState>({ status: 'idle' });
  const [processing, setProcessing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  /** Problems with photos / videos, shown in the media section (alerts are not shown in the web preview). */
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Annotator: a newly captured photo, or the current photo for editing its markup
  const [annotatorUri, setAnnotatorUri] = useState<string | null>(null);
  const [annotatorInitial, setAnnotatorInitial] = useState<PhotoAnnotation[]>([]);
  const pendingPhotoSize = useRef<{ width?: number; height?: number } | undefined>(undefined);

  // Advisory duplicate check (online only)
  const [duplicates, setDuplicates] = useState<{ key: string; items: DuplicateCandidate[] } | null>(null);
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null);

  const selectedLocation = locations.find((l) => l.id === locationId) ?? null;
  const duplicateKey = `${locationId}|${category}|${title.trim().toLowerCase()}`;
  const visibleDuplicates = duplicates && duplicates.key === duplicateKey ? duplicates.items : [];
  const isDirty = !!(title.trim() || description.trim() || photo || media.length || voiceNote);

  const gpsFix = gps.status === 'ok' ? gps.fix : undefined;

  const captureGps = useCallback(async (prompt: boolean) => {
    setGps({ status: 'locating' });
    const outcome = await DeviceLocation.getFix(prompt);
    setGps(outcome.status === 'ok' ? { status: 'ok', fix: outcome.fix } : outcome.status === 'denied' ? { status: 'denied' } : outcome);
  }, []);

  // Each time the sheet opens: preselect the area and take the GPS position when already permitted
  useEffect(() => {
    if (!visible) return;
    setLocationId((prev) => initialLocation?.id ?? (prev || locations[0]?.id || ''));
    setFormError(null);
    setFieldErrors({});
    let cancelled = false;
    DeviceLocation.isPermitted().then((permitted) => {
      if (!cancelled && permitted) captureGps(false);
    });
    return () => {
      cancelled = true;
    };
    // Only when the sheet opens or the preselected area changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialLocation]);

  // Real aspect ratio of the main photo for the annotated preview
  useEffect(() => {
    if (!photo) return;
    Image.getSize(
      photo.localUri,
      (w, h) => w > 0 && h > 0 && setPhotoAspect(w / h),
      () => setPhotoAspect(4 / 3),
    );
  }, [photo]);

  // Debounced advisory duplicate lookup while the title is typed
  useEffect(() => {
    if (!visible || !locationId || title.trim().length < 3) return;
    const key = duplicateKey;
    const timer = setTimeout(async () => {
      try {
        if (!(await Connectivity.isOnline())) return;
        const items = await ApiService.findDuplicateObservations({ locationId, title: title.trim(), category });
        setDuplicates({ key, items });
      } catch {
        // Advisory only
      }
    }, DUPLICATE_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [visible, locationId, title, category, duplicateKey]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCategory('S1_SORT');
    setSeverity('MODERATE');
    setPhoto(undefined);
    setMedia([]);
    setVoiceNote(undefined);
    setDuplicates(null);
    setAcknowledgedKey(null);
    setFormError(null);
    setFieldErrors({});
    setMediaError(null);
  };

  /** Deletes files captured for a report that is abandoned. */
  const discardDraft = () => {
    MediaStore.remove([photo?.localUri, voiceNote?.localUri, ...media.map((m) => m.localUri)]);
    resetForm();
  };

  const handleClose = () => {
    if (!isDirty || Platform.OS === 'web') {
      onClose();
      return;
    }
    Alert.alert('Leave report?', 'Keep this report as a draft to finish later, or discard it.', [
      { text: 'Keep draft', onPress: onClose },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discardDraft();
          onClose();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ----- Main photo (with markup) -----

  const pickMainPhoto = async (source: 'camera' | 'library') => {
    setMediaError(null);
    try {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setMediaError(source === 'camera' ? 'Allow camera access to photograph the abnormality.' : 'Allow photo library access to choose a photo.');
        return;
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 0.9 };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset?.uri) return;
      pendingPhotoSize.current = { width: asset.width, height: asset.height };
      setAnnotatorInitial([]);
      setAnnotatorUri(asset.uri);
    } catch {
      setMediaError('Could not open the camera or photo library.');
    }
  };

  const editMarkup = () => {
    if (!photo) return;
    pendingPhotoSize.current = undefined;
    setAnnotatorInitial(photo.annotations);
    setAnnotatorUri(photo.localUri);
  };

  const handleAnnotatorSave = async (annotations: PhotoAnnotation[], updatedPhotoUri?: string) => {
    const sourceUri = updatedPhotoUri || annotatorUri;
    setAnnotatorUri(null);
    if (!sourceUri) return;

    // Only the markup changed on the photo already prepared
    if (photo && sourceUri === photo.localUri) {
      setPhoto({ ...photo, annotations });
      return;
    }

    setProcessing('Preparing photo…');
    try {
      // Same compression as audit evidence; annotations are percentages so they survive the resize
      const prepared = await prepareEvidencePhoto(sourceUri, sourceUri === annotatorUri ? pendingPhotoSize.current : undefined);
      const stored = await MediaStore.persist(prepared.uri, 'PHOTO', {
        mimeType: 'image/jpeg',
        latitude: gpsFix?.latitude,
        longitude: gpsFix?.longitude,
      });
      if (photo) MediaStore.remove([photo.localUri]);
      setPhoto({ ...stored, annotations });
    } catch {
      setMediaError('The photo could not be processed. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  const removeMainPhoto = () => {
    if (photo) MediaStore.remove([photo.localUri]);
    setPhoto(undefined);
  };

  // ----- Extra photos / videos -----

  const addMedia = async (kind: 'PHOTO' | 'VIDEO', source: 'camera' | 'library') => {
    setMediaError(null);
    if (media.length >= MAX_MEDIA) {
      setMediaError(`A report can have up to ${MAX_MEDIA} extra photos or videos.`);
      return;
    }
    try {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setMediaError('Allow camera or photo library access in your device settings.');
        return;
      }
      const options: ImagePicker.ImagePickerOptions =
        kind === 'VIDEO'
          ? {
              mediaTypes: ['videos'],
              videoMaxDuration: MAX_VIDEO_SEC,
              videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
              quality: 0.5,
            }
          : { mediaTypes: ['images'], quality: 0.9 };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset?.uri) return;

      if (kind === 'VIDEO') {
        const durationSec = asset.duration ? asset.duration / 1000 : undefined;
        if (durationSec !== undefined && durationSec > MAX_VIDEO_SEC + 1) {
          setMediaError(`Keep videos to ${MAX_VIDEO_SEC} seconds or less.`);
          return;
        }
        if (asset.fileSize && asset.fileSize > MAX_VIDEO_BYTES) {
          setMediaError('Videos must be smaller than 50 MB. Record a shorter clip.');
          return;
        }
        setProcessing('Saving video…');
        const stored = await MediaStore.persist(asset.uri, 'VIDEO', {
          mimeType: asset.mimeType || undefined,
          durationSec: durationSec !== undefined ? Math.round(durationSec) : undefined,
          latitude: gpsFix?.latitude,
          longitude: gpsFix?.longitude,
        });
        const size = MediaStore.sizeOf(stored.localUri);
        if (size !== null && size > MAX_VIDEO_BYTES) {
          MediaStore.remove([stored.localUri]);
          setMediaError('Videos must be smaller than 50 MB. Record a shorter clip.');
          return;
        }
        setMedia((prev) => [...prev, stored]);
      } else {
        setProcessing('Preparing photo…');
        const prepared = await prepareEvidencePhoto(asset.uri, { width: asset.width, height: asset.height });
        const stored = await MediaStore.persist(prepared.uri, 'PHOTO', {
          mimeType: 'image/jpeg',
          latitude: gpsFix?.latitude,
          longitude: gpsFix?.longitude,
        });
        setMedia((prev) => [...prev, stored]);
      }
    } catch {
      setMediaError('The file could not be attached. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  const removeMedia = (id: string) => {
    const item = media.find((m) => m.id === id);
    if (item) MediaStore.remove([item.localUri]);
    setMedia((prev) => prev.filter((m) => m.id !== id));
  };

  // ----- Submit -----

  const handleSubmit = async () => {
    setFormError(null);
    // All field problems are shown at once, next to the fields
    const errors: FieldErrors = {};
    if (!selectedLocation) errors.area = 'Choose the area where you found the problem.';
    if (title.trim().length < 3) errors.title = 'Enter a short title (at least 3 characters).';
    if (!description.trim()) errors.description = 'Describe what is wrong so the area owner can act on it.';
    setFieldErrors(errors);
    if (!selectedLocation || errors.title || errors.description) {
      setFormError('Check the highlighted fields.');
      return;
    }

    // Generated when the user taps Submit and kept in the queue item: retries never create duplicates
    const clientRequestId = SyncService.newRequestId();
    setSubmitting(true);
    try {
      // Advisory duplicate warning: shown once per title / area / category, then "Submit anyway"
      if (acknowledgedKey !== duplicateKey && (await Connectivity.isOnline())) {
        let items = duplicates?.key === duplicateKey ? duplicates.items : null;
        if (!items) {
          items = await ApiService.findDuplicateObservations({ locationId, title: title.trim(), category }).catch(() => []);
          setDuplicates({ key: duplicateKey, items });
        }
        if (items.length > 0) {
          setAcknowledgedKey(duplicateKey);
          setFormError('Similar open reports exist at this area (see above). Tap "Submit anyway" to report it again.');
          return;
        }
      }

      const draft: ObservationDraft = {
        locationId: selectedLocation.id,
        locationName: selectedLocation.name,
        category,
        severity,
        title: title.trim(),
        description: description.trim(),
        photo,
        media,
        voiceNote,
        gps: gpsFix,
      };
      await onSubmit(draft, clientRequestId);
      resetForm();
      onClose();
    } catch {
      setFormError('The report could not be saved on this device. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const previewSize = useMemo(() => {
    const width = Math.max(previewWidth, 1);
    let height = width / photoAspect;
    let w = width;
    if (height > 260) {
      height = 260;
      w = height * photoAspect;
    }
    return { width: Math.round(w), height: Math.round(height) };
  }, [previewWidth, photoAspect]);

  const gpsText = (() => {
    switch (gps.status) {
      case 'locating':
        return 'Getting your location…';
      case 'ok':
        return `${gps.fix.latitude.toFixed(5)}, ${gps.fix.longitude.toFixed(5)}${gps.fix.accuracyM !== undefined ? `  (±${gps.fix.accuracyM} m)` : ''}`;
      case 'denied':
        return 'Location permission denied — the report is sent without GPS.';
      case 'unavailable':
        return `${gps.message} The report can still be sent.`;
      default:
        return 'Not captured (optional)';
    }
  })();


  const busy = submitting || !!processing;
  const submitLabel = submitting ? 'Saving…' : acknowledgedKey === duplicateKey && visibleDuplicates.length > 0 ? 'Submit anyway' : 'Submit report';

  return (
    <Sheet
      visible={visible}
      onRequestClose={handleClose}
      title="Report an abnormality"
      subtitle="Saved on this device and sent when you are online."
      closeLabel="Close report"
      headerAction={
        isDirty ? <Button label="Clear" variant="ghost" size="sm" onPress={discardDraft} accessibilityLabel="Clear the report" /> : null
      }
      footer={
        <Button
          label={submitLabel}
          icon="send"
          size="lg"
          onPress={handleSubmit}
          loading={submitting}
          disabled={busy || !selectedLocation}
          fullWidth
        />
      }
      overlay={
        <PhotoAnnotatorModal
          visible={!!annotatorUri}
          photoUri={annotatorUri}
          initialAnnotations={annotatorInitial}
          title="Mark the abnormality"
          onClose={() => setAnnotatorUri(null)}
          onSave={handleAnnotatorSave}
        />
      }
    >
      {/* Area */}
      <FormField label="Area" required error={fieldErrors.area}>
        <AreaPicker
          locations={locations}
          selectedId={locationId}
          onSelect={(id) => {
            setLocationId(id);
            setFieldErrors((e) => ({ ...e, area: undefined }));
          }}
          invalid={!!fieldErrors.area}
        />
      </FormField>

      {/* Category */}
      <FormField label="5S category">
        <ChipGroup>
          {PILLARS.map((p) => (
            <Chip key={p.key} label={p.label} selected={category === p.key} onPress={() => setCategory(p.key)} />
          ))}
        </ChipGroup>
      </FormField>

      {/* Severity */}
      <FormField label="Severity">
        <ChipGroup>
          {SEVERITIES.map((sv) => (
            <Chip key={sv.key} label={sv.label} selected={severity === sv.key} onPress={() => setSeverity(sv.key)} />
          ))}
        </ChipGroup>
      </FormField>

      {/* Title & description */}
      <FormField label="Title" required error={fieldErrors.title}>
        <TextField
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            if (fieldErrors.title) setFieldErrors((e) => ({ ...e, title: undefined }));
          }}
          placeholder="e.g. Oil leak under CNC-01 spindle"
          maxLength={160}
          invalid={!!fieldErrors.title}
          accessibilityLabel="Title"
        />
      </FormField>

      {visibleDuplicates.length > 0 && (
        <InlineMessage
          tone="warning"
          icon="copy-outline"
          title="Similar open reports at this area"
          message="Check whether it has already been reported. You can still submit a new report."
        >
          {visibleDuplicates.map((d) => (
            <Text key={d.id} style={styles.dupItem} numberOfLines={2}>
              {d.observationCode} · {d.title} ({d.status.replace(/_/g, ' ').toLowerCase()}, {Math.round(d.similarity * 100)}% similar)
            </Text>
          ))}
        </InlineMessage>
      )}

      <FormField label="What is wrong?" required error={fieldErrors.description}>
        <TextField
          value={description}
          onChangeText={(v) => {
            setDescription(v);
            if (fieldErrors.description) setFieldErrors((e) => ({ ...e, description: undefined }));
          }}
          placeholder="Describe the problem, where it is and any risk"
          multiline
          invalid={!!fieldErrors.description}
          accessibilityLabel="What is wrong?"
        />
      </FormField>

      {/* Photos and video: one main photo with markup, then optional extra media */}
      <FormField label="Photos and video" hint={photo ? undefined : 'A photo helps the area owner find and fix the problem.'}>
        {photo ? (
          <View style={styles.previewWrap} onLayout={(e) => setPreviewWidth(e.nativeEvent.layout.width)}>
            <View style={{ width: previewSize.width, height: previewSize.height, borderRadius: RADIUS.md, overflow: 'hidden' }}>
              <Image
                source={{ uri: photo.localUri }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="stretch"
                accessibilityLabel="Photo of the abnormality"
              />
              <AnnotationLayer annotations={photo.annotations} width={previewSize.width} height={previewSize.height} />
            </View>
            <View style={styles.previewActions}>
              <Button
                label={photo.annotations.length > 0 ? `Edit markup (${photo.annotations.length})` : 'Mark up'}
                icon="brush-outline"
                variant="secondary"
                size="sm"
                onPress={editMarkup}
                disabled={busy}
              />
              <Button label="Retake" icon="camera-outline" variant="secondary" size="sm" onPress={() => pickMainPhoto('camera')} disabled={busy} />
              <IconButton icon="trash-outline" color={COLORS.danger} size={20} onPress={removeMainPhoto} accessibilityLabel="Remove photo" disabled={busy} />
            </View>
          </View>
        ) : (
          <View style={styles.row}>
            <Button label="Take photo" icon="camera" onPress={() => pickMainPhoto('camera')} disabled={busy} style={styles.flex} />
            <Button
              label="From gallery"
              icon="images-outline"
              variant="secondary"
              onPress={() => pickMainPhoto('library')}
              disabled={busy}
              style={styles.flex}
            />
          </View>
        )}

        <Text style={styles.subLabel}>
          More photos or video{media.length > 0 ? ` (${media.length} of ${MAX_MEDIA})` : ` (up to ${MAX_MEDIA})`}
        </Text>
        {media.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaStrip} contentContainerStyle={styles.mediaStripContent}>
            {media.map((m, index) => (
              <View key={m.id} style={styles.mediaTile}>
                {m.kind === 'PHOTO' ? (
                  <Image source={{ uri: m.localUri }} style={styles.mediaImage} accessibilityLabel={`Attachment ${index + 1}: photo`} />
                ) : (
                  <View style={[styles.mediaImage, styles.videoTile]} accessibilityLabel={`Attachment ${index + 1}: video`}>
                    <Ionicons name="videocam" size={22} color={COLORS.textInverse} />
                    <Text style={styles.videoText}>{m.durationSec ? `${m.durationSec} s` : 'Video'}</Text>
                  </View>
                )}
                <Pressable
                  style={styles.mediaDelete}
                  onPress={() => removeMedia(m.id)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove attachment ${index + 1}`}
                >
                  <Ionicons name="close" size={14} color={COLORS.textInverse} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
        <View style={styles.mediaGrid}>
          <Button
            label="Take photo"
            icon="camera-outline"
            variant="secondary"
            size="sm"
            onPress={() => addMedia('PHOTO', 'camera')}
            disabled={busy}
            style={styles.gridButton}
            accessibilityLabel="Take another photo"
          />
          <Button
            label={`Record video (${MAX_VIDEO_SEC} s)`}
            icon="videocam-outline"
            variant="secondary"
            size="sm"
            onPress={() => addMedia('VIDEO', 'camera')}
            disabled={busy}
            style={styles.gridButton}
            accessibilityLabel={`Record a video of up to ${MAX_VIDEO_SEC} seconds`}
          />
          <Button
            label="Gallery photo"
            icon="images-outline"
            variant="secondary"
            size="sm"
            onPress={() => addMedia('PHOTO', 'library')}
            disabled={busy}
            style={styles.gridButton}
            accessibilityLabel="Add a photo from the gallery"
          />
          <Button
            label="Gallery video"
            icon="film-outline"
            variant="secondary"
            size="sm"
            onPress={() => addMedia('VIDEO', 'library')}
            disabled={busy}
            style={styles.gridButton}
            accessibilityLabel="Add a video from the gallery"
          />
        </View>

        {processing && (
          <View style={styles.processing}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.hint}>{processing}</Text>
          </View>
        )}
        {mediaError ? (
          <Text style={styles.inlineError} accessibilityRole="alert">
            {mediaError}
          </Text>
        ) : null}
      </FormField>

      {/* Voice note */}
      <FormField label="Voice note" hint="Optional">
        <VoiceNoteRecorder value={voiceNote} onChange={setVoiceNote} disabled={submitting} />
      </FormField>

      {/* GPS */}
      <FormField label="GPS location">
        <View style={styles.gpsBox}>
          <Ionicons
            name={gps.status === 'ok' ? 'location' : 'location-outline'}
            size={20}
            color={gps.status === 'ok' ? COLORS.success : COLORS.textMedium}
          />
          <Text style={styles.gpsText}>{gpsText}</Text>
          {gps.status === 'locating' ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginRight: SPACING.md }} />
          ) : (
            <Button label={gps.status === 'ok' ? 'Update' : 'Use my location'} variant="ghost" size="sm" onPress={() => captureGps(true)} />
          )}
        </View>
      </FormField>

      {formError ? <InlineMessage tone="danger" message={formError} /> : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: SPACING.md },
  hint: { ...TYPE.caption, color: COLORS.textMedium },
  subLabel: { ...TYPE.label, color: COLORS.textMedium, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  dupItem: { ...TYPE.caption, color: COLORS.textDark, marginTop: SPACING.xs },
  previewWrap: { alignItems: 'center', width: '100%' },
  previewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  mediaStrip: { marginBottom: SPACING.sm },
  mediaStripContent: { paddingTop: SPACING.xs, paddingRight: SPACING.lg },
  mediaTile: { width: 76, height: 76, borderRadius: RADIUS.md, overflow: 'hidden', marginRight: SPACING.sm, backgroundColor: COLORS.cardSecondary },
  mediaImage: { width: '100%', height: '100%' },
  videoTile: { backgroundColor: COLORS.textDark, alignItems: 'center', justifyContent: 'center' },
  videoText: { ...TYPE.captionStrong, color: COLORS.textInverse, marginTop: 2 },
  mediaDelete: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(29, 39, 51, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  gridButton: { flexGrow: 1, flexBasis: '45%', height: TOUCH_TARGET },
  gpsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.xs,
    paddingVertical: SPACING.xs,
    minHeight: 52,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardSecondary,
  },
  gpsText: { ...TYPE.caption, fontSize: 13, lineHeight: 18, flex: 1, color: COLORS.textDark },
  processing: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md },
  inlineError: { ...TYPE.caption, color: COLORS.danger, marginTop: SPACING.sm },
});

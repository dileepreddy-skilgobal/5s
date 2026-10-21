import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, RADIUS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';
import { DispositionType, LocationMaster, RedTagCategory, RedTagRecord } from '../types';
import { useUser } from '../context/UserContext';
import { prepareEvidencePhoto } from '../services/imageEvidence';
import { Button, Chip, FormField, TextField } from './ui';
import { AreaPicker, ChipGroup, IconButton, InlineMessage, Sheet } from './SheetLayout';

interface RedTagModalProps {
  visible: boolean;
  onClose: () => void;
  /** Persists the tag (sent now, or queued while offline). */
  onSave: (record: RedTagRecord) => Promise<void>;
  initialLocation?: LocationMaster | null;
  locations?: LocationMaster[];
}

const CATEGORIES: { type: RedTagCategory; label: string }[] = [
  { type: 'UNNEEDED_TOOL', label: 'Unneeded tool' },
  { type: 'SURPLUS_INVENTORY', label: 'Surplus stock' },
  { type: 'BROKEN_EQUIPMENT', label: 'Broken equipment' },
  { type: 'SCRAP_WASTE', label: 'Scrap or waste' },
  { type: 'UNLABELLED_MATERIAL', label: 'Unlabelled material' },
  { type: 'EXPIRED_ITEM', label: 'Expired item' },
  { type: 'OTHER', label: 'Other' },
];

const DISPOSITIONS: { type: DispositionType; label: string }[] = [
  { type: 'DISPOSE_SCRAP', label: 'Scrap and dispose' },
  { type: 'RELOCATE', label: 'Move elsewhere' },
  { type: 'REUSE', label: 'Reuse elsewhere' },
  { type: 'REPAIR_RESTORE', label: 'Repair' },
  { type: 'RETURN_TO_VENDOR', label: 'Return to supplier' },
  { type: 'AUCTION_SELL', label: 'Sell surplus' },
  { type: 'KEEP_JUSTIFIED', label: 'Keep (justified)' },
];

type FieldErrors = { area?: string; item?: string; quantity?: string; value?: string; reason?: string };

export const RedTagModal: React.FC<RedTagModalProps> = ({
  visible,
  onClose,
  onSave,
  initialLocation,
  locations = [],
}) => {
  const { currentUser, can } = useUser();
  const canProposeDisposition = can('RED_TAG_REVIEWERS');
  const canApproveDisposition = can('RED_TAG_CLOSERS');

  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState<RedTagCategory>('UNNEEDED_TOOL');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [disposition, setDisposition] = useState<DispositionType | null>(null);
  const [approveNow, setApproveNow] = useState(false);
  const [estValue, setEstValue] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; dataUrl: string } | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  /** Shown inline: alerts do not appear in the web preview. */
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Pre-select the scanned/selected area each time the sheet opens
  useEffect(() => {
    if (visible) {
      setSelectedLocationId(initialLocation?.id ?? locations[0]?.id ?? '');
      setFieldErrors({});
      setFormError(null);
      setPhotoError(null);
    }
  }, [visible, initialLocation, locations]);

  const selectedLocation = locations.find((l) => l.id === selectedLocationId) ?? null;

  const resetForm = () => {
    setItemName('');
    setCategory('UNNEEDED_TOOL');
    setQuantity('1');
    setReason('');
    setDisposition(null);
    setApproveNow(false);
    setEstValue('');
    setPhoto(null);
    setFieldErrors({});
    setFormError(null);
    setPhotoError(null);
  };

  const clearFieldError = (key: keyof FieldErrors) => {
    if (fieldErrors[key]) setFieldErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleCapturePhoto = async (source: 'camera' | 'library') => {
    setPhotoError(null);
    try {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setPhotoError(
          source === 'camera'
            ? 'Allow camera access in your device settings to attach a photo.'
            : 'Allow photo library access in your device settings to choose a photo.',
        );
        return;
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset?.uri) return;
      setProcessingPhoto(true);
      setPhoto(await prepareEvidencePhoto(asset.uri, { width: asset.width, height: asset.height }));
    } catch {
      setPhotoError('Could not attach the photo. Please try again.');
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handleSubmit = async () => {
    const qty = Number.parseInt(quantity, 10);
    const value = estValue.trim() === '' ? undefined : Number.parseFloat(estValue);

    // All field problems are shown at once, next to the fields
    const errors: FieldErrors = {};
    if (!selectedLocation) errors.area = 'Choose the area where the item was found.';
    if (!itemName.trim()) errors.item = 'Enter the item you are tagging.';
    if (!Number.isInteger(qty) || qty < 1 || !/^\d+$/.test(quantity.trim())) errors.quantity = 'Enter a whole number of 1 or more.';
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) errors.value = 'Enter zero or a positive number.';
    if (!reason.trim()) errors.reason = 'Enter why the item is tagged.';
    setFieldErrors(errors);
    setFormError(null);
    if (!selectedLocation || Object.values(errors).some(Boolean)) {
      setFormError('Check the highlighted fields.');
      return;
    }

    const record: RedTagRecord = {
      id: `local-rt-${Date.now()}`,
      tagNumber: 'Pending',
      areaId: selectedLocation.id,
      areaName: selectedLocation.name,
      itemName: itemName.trim(),
      category,
      quantity: qty,
      reason: reason.trim(),
      taggedBy: `${currentUser.firstName} ${currentUser.lastName}`,
      tagDate: new Date().toLocaleDateString('en-GB'),
      disposition: canProposeDisposition && disposition ? disposition : undefined,
      approveDisposition: canApproveDisposition && approveNow,
      estimatedValue: value,
      photoUri: photo?.uri,
      photoDataUrl: photo?.dataUrl,
      status: 'PENDING_SYNC',
    };

    setSubmitting(true);
    try {
      await onSave(record);
      resetForm();
      onClose();
    } catch {
      setFormError('The red tag could not be saved on this device. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onRequestClose={onClose}
      title="Red tag an item"
      subtitle="Tag items that are not needed or out of place (1S Sort)."
      closeLabel="Close red tag"
      footer={
        <Button
          label={submitting ? 'Saving…' : 'Save red tag'}
          icon="pricetag"
          variant="danger"
          size="lg"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting || processingPhoto || !selectedLocation}
          fullWidth
        />
      }
    >
      {/* Area */}
      <FormField label="Area" required error={fieldErrors.area}>
        <AreaPicker
          locations={locations}
          selectedId={selectedLocationId}
          onSelect={(id) => {
            setSelectedLocationId(id);
            clearFieldError('area');
          }}
          invalid={!!fieldErrors.area}
        />
      </FormField>

      {/* Item */}
      <FormField label="Item" required error={fieldErrors.item}>
        <TextField
          placeholder="e.g. Unmarked chemical container"
          value={itemName}
          onChangeText={(v) => {
            setItemName(v);
            clearFieldError('item');
          }}
          invalid={!!fieldErrors.item}
          accessibilityLabel="Item"
        />
      </FormField>

      {/* Category */}
      <FormField label="Category">
        <ChipGroup>
          {CATEGORIES.map((c) => (
            <Chip key={c.type} label={c.label} selected={category === c.type} onPress={() => setCategory(c.type)} />
          ))}
        </ChipGroup>
      </FormField>

      {/* Quantity & estimated value */}
      <View style={styles.rowTwo}>
        <View style={styles.flexOne}>
          <FormField label="Quantity" required error={fieldErrors.quantity}>
            <TextField
              keyboardType="number-pad"
              inputMode="numeric"
              value={quantity}
              onChangeText={(v) => {
                setQuantity(v.replace(/[^0-9]/g, ''));
                clearFieldError('quantity');
              }}
              invalid={!!fieldErrors.quantity}
              accessibilityLabel="Quantity"
              maxLength={6}
            />
          </FormField>
        </View>
        <View style={styles.flexOne}>
          <FormField label="Estimated value" hint="Optional" error={fieldErrors.value}>
            <TextField
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={estValue}
              onChangeText={(v) => {
                setEstValue(v.replace(',', '.'));
                clearFieldError('value');
              }}
              placeholder="0"
              invalid={!!fieldErrors.value}
              accessibilityLabel="Estimated value, optional"
            />
          </FormField>
        </View>
      </View>

      {/* Reason */}
      <FormField label="Why is it tagged?" required error={fieldErrors.reason}>
        <TextField
          placeholder="e.g. Not used in this area for months"
          multiline
          value={reason}
          onChangeText={(v) => {
            setReason(v);
            clearFieldError('reason');
          }}
          invalid={!!fieldErrors.reason}
          accessibilityLabel="Why is it tagged?"
        />
      </FormField>

      {/* Disposition (roles allowed to review red tags) */}
      {canProposeDisposition && (
        <FormField label="Proposed action" hint="Optional. Tap again to clear.">
          <ChipGroup>
            {DISPOSITIONS.map((d) => (
              <Chip
                key={d.type}
                label={d.label}
                selected={disposition === d.type}
                onPress={() => {
                  const next = disposition === d.type ? null : d.type;
                  setDisposition(next);
                  if (!next) setApproveNow(false);
                }}
              />
            ))}
          </ChipGroup>
          {canApproveDisposition && disposition && (
            <Pressable
              style={({ pressed }) => [styles.checkRow, pressed && { opacity: 0.8 }]}
              onPress={() => setApproveNow(!approveNow)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: approveNow }}
              accessibilityLabel="Approve this action now"
            >
              <Ionicons name={approveNow ? 'checkbox' : 'square-outline'} size={24} color={COLORS.primary} />
              <Text style={styles.checkText}>Approve this action now</Text>
            </Pressable>
          )}
        </FormField>
      )}

      {/* Photo evidence */}
      <FormField label="Photo" hint={photo ? undefined : 'Optional, but helps others find the item.'}>
        {photo ? (
          <View style={styles.photoRow}>
            <Image source={{ uri: photo.uri }} style={styles.photoThumb} accessibilityLabel="Photo of the item" />
            <Text style={[styles.photoText, styles.flexOne]}>Photo attached</Text>
            <IconButton icon="trash-outline" color={COLORS.danger} size={20} onPress={() => setPhoto(null)} accessibilityLabel="Remove photo" />
          </View>
        ) : processingPhoto ? (
          <View style={styles.photoRow}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.photoText}>Preparing photo…</Text>
          </View>
        ) : (
          <View style={styles.rowTwo}>
            <Button label="Take photo" icon="camera-outline" variant="secondary" onPress={() => handleCapturePhoto('camera')} style={styles.flexOne} />
            <Button label="From gallery" icon="images-outline" variant="secondary" onPress={() => handleCapturePhoto('library')} style={styles.flexOne} />
          </View>
        )}
        {photoError ? (
          <Text style={styles.inlineError} accessibilityRole="alert">
            {photoError}
          </Text>
        ) : null}
      </FormField>

      {formError ? <InlineMessage tone="danger" message={formError} /> : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  rowTwo: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  flexOne: {
    flex: 1,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: TOUCH_TARGET,
    marginTop: SPACING.sm,
  },
  checkText: {
    ...TYPE.body,
    color: COLORS.textDark,
    flex: 1,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.sm,
    minHeight: 64,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardSecondary,
  },
  photoThumb: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
  },
  photoText: {
    ...TYPE.bodyStrong,
    color: COLORS.textDark,
  },
  inlineError: {
    ...TYPE.caption,
    color: COLORS.danger,
    marginTop: SPACING.sm,
  },
});

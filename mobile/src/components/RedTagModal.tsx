import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';
import { DispositionType, LocationMaster, RedTagRecord } from '../types';
import { MOCK_LOCATIONS } from '../constants/mockData';
import { useUser } from '../context/UserContext';

interface RedTagModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (record: RedTagRecord) => void;
  initialLocation?: LocationMaster | null;
  locations?: LocationMaster[];
}

const DISPOSITIONS: { type: DispositionType; label: string; icon: string }[] = [
  { type: 'SCRAP', label: 'Scrap & Recycle', icon: 'trash-outline' },
  { type: 'RELOCATE', label: 'Relocate', icon: 'swap-horizontal-outline' },
  { type: 'REPAIR', label: 'Repair & Calibrate', icon: 'construct-outline' },
  { type: 'RETURN', label: 'Return to Vendor', icon: 'return-up-back-outline' },
  { type: 'SELL', label: 'Surplus Sale', icon: 'pricetag-outline' },
  { type: 'KEEP', label: 'Retain & Re-standardize', icon: 'shield-checkmark-outline' },
];

export const RedTagModal: React.FC<RedTagModalProps> = ({
  visible,
  onClose,
  onSave,
  initialLocation,
  locations = [],
}) => {
  const { currentUser } = useUser();
  const availableLocations = locations.length > 0 ? locations : MOCK_LOCATIONS;
  const [selectedLocation, setSelectedLocation] = useState<LocationMaster>(
    initialLocation || availableLocations[0]
  );
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [disposition, setDisposition] = useState<DispositionType>('SCRAP');
  const [estValue, setEstValue] = useState('50');
  const [hasPhoto, setHasPhoto] = useState(false);

  const handleQuickSubmit = () => {
    if (!itemName.trim()) {
      Alert.alert('Required Field', 'Please enter the item name or abnormality description.');
      return;
    }

    const currentYear = new Date().getFullYear();
    const tagNumber = `RT-${currentYear}-${Math.floor(1000 + Math.random() * 9000)}`;
    const targetDateObj = new Date(Date.now() + 14 * 86400000);
    const targetDateStr = targetDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const tagDateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const newRecord: RedTagRecord = {
      id: `rt-${Date.now()}`,
      tagNumber,
      areaId: selectedLocation.id,
      areaName: selectedLocation.name,
      itemName,
      quantity: parseInt(quantity, 10) || 1,
      reason: reason || 'Unneeded item identified during 5S Sort inspection',
      taggedBy: `${currentUser.firstName} ${currentUser.lastName} (${currentUser.jobTitle})`,
      tagDate: tagDateStr,
      disposition,
      estimatedValue: parseFloat(estValue) || 0,
      targetDate: targetDateStr,
      status: 'ACTIVE',
      photoUri: hasPhoto ? 'mock-evidence-photo' : undefined,
    };

    onSave(newRecord);
    // Reset
    setItemName('');
    setReason('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.tagBadge}>
                <Ionicons name="pricetag" size={16} color="#DC2626" />
                <Text style={styles.tagBadgeText}>RED TAG / ABNORMALITY</Text>
              </View>
              <Text style={styles.title}>Rapid 30-Sec Report</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.textDark} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Area Selector */}
            <Text style={styles.inputLabel}>Workstation / Area</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.areaScroll}>
              {MOCK_LOCATIONS.map((loc) => (
                <TouchableOpacity
                  key={loc.id}
                  style={[
                    styles.areaChip,
                    selectedLocation.id === loc.id && styles.areaChipActive,
                  ]}
                  onPress={() => setSelectedLocation(loc)}
                >
                  <Text
                    style={[
                      styles.areaChipText,
                      selectedLocation.id === loc.id && styles.areaChipTextActive,
                    ]}
                  >
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Item Name */}
            <Text style={styles.inputLabel}>Item Description / Non-Conformance</Text>
            <TextInput
              style={styles.inputField}
              placeholder="e.g. Unmarked chemical container, surplus pallets..."
              placeholderTextColor={COLORS.textMuted}
              value={itemName}
              onChangeText={setItemName}
            />

            {/* Quantity & Estimated Value Row */}
            <View style={styles.rowTwo}>
              <View style={styles.flexOne}>
                <Text style={styles.inputLabel}>Quantity</Text>
                <TextInput
                  style={styles.inputField}
                  keyboardType="numeric"
                  value={quantity}
                  onChangeText={setQuantity}
                />
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.inputLabel}>Est. Value ($)</Text>
                <TextInput
                  style={styles.inputField}
                  keyboardType="numeric"
                  value={estValue}
                  onChangeText={setEstValue}
                />
              </View>
            </View>

            {/* Reason */}
            <Text style={styles.inputLabel}>Reason for Tagging</Text>
            <TextInput
              style={[styles.inputField, styles.textArea]}
              placeholder="Why is this item unneeded or abnormal? (S1 Sort violation)"
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={2}
              value={reason}
              onChangeText={setReason}
            />

            {/* Disposition recommendation chips */}
            <Text style={styles.inputLabel}>Proposed Disposition Action</Text>
            <View style={styles.dispositionGrid}>
              {DISPOSITIONS.map((d) => (
                <TouchableOpacity
                  key={d.type}
                  style={[
                    styles.dispChip,
                    disposition === d.type && styles.dispChipActive,
                  ]}
                  onPress={() => setDisposition(d.type)}
                >
                  <Ionicons
                    name={d.icon as any}
                    size={16}
                    color={disposition === d.type ? '#FFFFFF' : COLORS.textDark}
                  />
                  <Text
                    style={[
                      styles.dispChipText,
                      disposition === d.type && styles.dispChipTextActive,
                    ]}
                  >
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Photo Capture quick toggle */}
            <TouchableOpacity
              style={[styles.photoBox, hasPhoto && styles.photoBoxActive]}
              onPress={() => setHasPhoto(!hasPhoto)}
            >
              <Ionicons
                name={hasPhoto ? 'checkmark-circle' : 'camera-outline'}
                size={22}
                color={hasPhoto ? '#0E9F6E' : COLORS.primary}
              />
              <Text style={styles.photoBoxText}>
                {hasPhoto ? 'Evidence Photo Attached (Tap to remove)' : 'Tap to Attach Photographic Proof'}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.submitBtn} onPress={handleQuickSubmit} activeOpacity={0.85}>
              <Ionicons name="pricetag" size={18} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>Print & Apply Red Tag (30s)</Text>
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
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: 4,
  },
  tagBadgeText: {
    color: '#DC2626',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 6,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  areaScroll: {
    marginBottom: 10,
  },
  areaChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  areaChipActive: {
    backgroundColor: COLORS.textDark,
  },
  areaChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMedium,
  },
  areaChipTextActive: {
    color: '#FFFFFF',
  },
  inputField: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textDark,
    marginBottom: 8,
  },
  textArea: {
    height: 60,
    textAlignVertical: 'top',
  },
  rowTwo: {
    flexDirection: 'row',
    gap: 12,
  },
  flexOne: {
    flex: 1,
  },
  dispositionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  dispChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  dispChipActive: {
    backgroundColor: COLORS.primary,
  },
  dispChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  dispChipTextActive: {
    color: '#FFFFFF',
  },
  photoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
    backgroundColor: '#FFF7ED',
    gap: 8,
    marginTop: 6,
  },
  photoBoxActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  photoBoxText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  footer: {
    marginTop: 10,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626', // Red Tag theme
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

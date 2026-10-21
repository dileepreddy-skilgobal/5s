import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';
import { AuditTemplateSnapshot, LocationMaster } from '../types';
import { EmptyState } from './ui';

interface TemplatePickerModalProps {
  location: LocationMaster | null;
  templates: AuditTemplateSnapshot[];
  onSelect: (template: AuditTemplateSnapshot) => void;
  onClose: () => void;
}

/** Lets the auditor choose which active audit template to run at an area. */
export const TemplatePickerModal: React.FC<TemplatePickerModalProps> = ({ location, templates, onSelect, onClose }) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!location} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SPACING.lg) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.title} accessibilityRole="header">
                Choose an audit template
              </Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                {[location?.name, location?.code].filter(Boolean).join(' • ')}
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.textDark} />
            </Pressable>
          </View>
          <ScrollView>
            {templates.length === 0 ? (
              <EmptyState title="No audit templates available" message="No active audit templates are published for your organization." />
            ) : (
              templates.map((t) => {
                const questionCount = t.sections.reduce((n, s) => n + s.questions.length, 0);
                return (
                  <Pressable
                    key={t.templateVersionId}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => onSelect(t)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.name}, ${questionCount} questions`}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name="clipboard-outline" size={20} color={COLORS.primary} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {t.name}
                      </Text>
                      <Text style={styles.rowSub}>
                        {t.code} • Version {t.versionNumber} • {questionCount} question{questionCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(29,39,51,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.screen,
    paddingTop: SPACING.sm,
    maxHeight: '80%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.borderDark, marginBottom: SPACING.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm, gap: SPACING.md },
  flex: { flex: 1, minWidth: 0 },
  title: { ...TYPE.heading, color: COLORS.textDark },
  subtitle: { ...TYPE.caption, color: COLORS.textMedium, marginTop: 2 },
  closeBtn: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', marginTop: -10, marginRight: -10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 64,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rowPressed: { backgroundColor: COLORS.primarySoft },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { ...TYPE.bodyStrong, color: COLORS.textDark },
  rowSub: { ...TYPE.caption, color: COLORS.textMedium, marginTop: 2 },
});

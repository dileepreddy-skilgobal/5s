import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

interface HeroCardProps {
  onPressAction: () => void;
  title?: string;
  subtitle?: string;
  description?: string;
  buttonText?: string;
}

export const HeroCard: React.FC<HeroCardProps> = ({
  onPressAction,
  title = 'Sustaining\nWorkplace\nExcellence.',
  subtitle = '1S SORT • 2S ORDER • 3S SHINE • 4S STD • 5S SUSTAIN',
  description = 'Audit shopfloors. Verify visual standards.\nEliminate waste across all plant lines.',
  buttonText = 'Start Inspection',
}) => {
  return (
    <View style={styles.outerContainer}>
      <View style={styles.cardContainer}>
        {/* Left Content */}
        <View style={styles.contentLeft}>
          <Text style={styles.eyebrow}>{subtitle}</Text>
          <Text style={styles.headline}>{title}</Text>
          <Text style={styles.body}>{description}</Text>

          {/* Dark Charcoal Pill Button */}
          <TouchableOpacity style={styles.pillButton} onPress={onPressAction} activeOpacity={0.85}>
            <Text style={styles.buttonText}>{buttonText}</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={styles.arrowIcon} />
          </TouchableOpacity>
        </View>

        {/* Right 5S Illustration Visual matching layout */}
        <View style={styles.illustrationRight}>
          {/* Top Verification Medal Pin */}
          <View style={styles.badgePin}>
            <Ionicons name="shield-checkmark" size={18} color="#FF6433" />
          </View>

          {/* 3D Clipboard & Workstation Audit Graphic */}
          <View style={styles.auditBoardMain}>
            <View style={styles.auditClipTop} />
            <View style={styles.sheetContent}>
              <View style={styles.checkLineRow}>
                <Ionicons name="checkmark-circle" size={12} color="#059669" />
                <View style={styles.sheetLine} />
              </View>
              <View style={styles.checkLineRow}>
                <Ionicons name="checkmark-circle" size={12} color="#059669" />
                <View style={[styles.sheetLine, { width: 22 }]} />
              </View>
              <View style={styles.checkLineRow}>
                <Ionicons name="ellipse-outline" size={12} color="#94A3B8" />
                <View style={[styles.sheetLine, { width: 16 }]} />
              </View>
            </View>
          </View>

          {/* Supporting Shadow Element */}
          <View style={styles.auditBoardSmall}>
            <Ionicons name="sparkles" size={16} color="#FFFFFF" />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    paddingHorizontal: 20,
    marginBottom: 26,
  },
  cardContainer: {
    backgroundColor: '#FFF2EA', // Exact warm peach tone from reference screenshot
    borderRadius: 24,
    padding: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FFE3D3',
  },
  contentLeft: {
    flex: 1,
    paddingRight: 10,
    zIndex: 2,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  headline: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textDark,
    lineHeight: 25,
    marginBottom: 6,
  },
  body: {
    fontSize: 11,
    color: COLORS.textMedium,
    lineHeight: 16,
    marginBottom: 16,
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121826', // Charcoal dark pill button
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    gap: 6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  arrowIcon: {
    marginLeft: 2,
  },
  illustrationRight: {
    width: 105,
    height: 100,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePin: {
    position: 'absolute',
    top: 0,
    right: 14,
    zIndex: 4,
    backgroundColor: '#FFFFFF',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6433',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  auditBoardMain: {
    position: 'absolute',
    bottom: 2,
    right: 4,
    width: 72,
    height: 64,
    backgroundColor: '#D7A779', // Warm clipboard oak tone
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#BE8C5E',
    shadowColor: '#8C5A2B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  auditClipTop: {
    position: 'absolute',
    top: -4,
    width: 26,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#475569',
  },
  sheetContent: {
    width: '100%',
    height: '84%',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 4,
    justifyContent: 'center',
    gap: 4,
  },
  checkLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sheetLine: {
    height: 2.5,
    width: 28,
    backgroundColor: '#CBD5E1',
    borderRadius: 1,
  },
  auditBoardSmall: {
    position: 'absolute',
    bottom: 0,
    left: 2,
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});

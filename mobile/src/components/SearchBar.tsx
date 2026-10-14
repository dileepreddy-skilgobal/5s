import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onScanPress: () => void;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  onScanPress,
  placeholder = 'Search workstation or QR code...',
}) => {
  return (
    <View style={styles.outerContainer}>
      <View style={[styles.searchBox, SHADOWS.soft]}>
        <Ionicons name="search-outline" size={20} color={COLORS.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          value={value}
          onChangeText={onChangeText}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChangeText('')} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.scanButton}
          onPress={onScanPress}
          activeOpacity={0.7}
          accessibilityLabel="Scan QR Code"
        >
          <Ionicons name="scan-outline" size={22} color={COLORS.textDark} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 24,
    height: 54,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#F0F2F5',
  },
  searchIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textDark,
    height: '100%',
  },
  clearBtn: {
    padding: 4,
    marginRight: 6,
  },
  scanButton: {
    padding: 6,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

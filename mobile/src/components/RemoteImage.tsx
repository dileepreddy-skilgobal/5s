import React, { useEffect, useState } from 'react';
import { Image, ImageResizeMode, StyleProp, StyleSheet, Text, View, ViewStyle, ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPE } from '../constants/theme';

interface RemoteImageProps {
  uri: string | null | undefined;
  style: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  /** Called once when the image cannot be shown (e.g. its signed link expired). */
  onLoadError?: () => void;
}

/**
 * Image from the server. File links are signed and expire after a few hours, so cached records can
 * hold dead links: instead of a blank or broken image a placeholder is shown and the caller is told
 * (to refresh its data when online).
 */
export const RemoteImage: React.FC<RemoteImageProps> = ({ uri, style, resizeMode = 'cover', onLoadError }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (!uri || failed) {
    return (
      <View
        style={[style as StyleProp<ViewStyle>, styles.placeholder]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={uri ? 'Image unavailable' : 'No image'}
      >
        <Ionicons name="image-outline" size={22} color={COLORS.textMuted} />
        <Text style={styles.placeholderText}>Image unavailable</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      accessibilityIgnoresInvertColors
      onError={() => {
        setFailed(true);
        onLoadError?.();
      }}
    />
  );
};

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cardSecondary,
  },
  placeholderText: {
    ...TYPE.caption,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
});

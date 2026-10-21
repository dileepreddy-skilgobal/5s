import { DimensionValue, useWindowDimensions, Platform } from 'react-native';

export interface ResponsiveLayout {
  width: number;
  height: number;
  isPhone: boolean;
  isTablet: boolean;
  isLargeTablet: boolean;
  isLandscape: boolean;
  isPortrait: boolean;
  deviceType: 'phone' | 'tablet' | 'desktop';
  numColumns: number;
  contentMaxWidth: number | undefined;
  containerPadding: number;
  gutter: number;
  cardWidth: (customCols?: number) => DimensionValue;
}

/**
 * Responsive layout values for the SkilGlobal 5S app.
 * Supports Mobile Phones (iOS / Android), Tablets (iPad, Galaxy Tab, Foldables) and Web
 */
export function useResponsive(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();

  const isLandscape = width > height;
  const isPortrait = !isLandscape;

  // Breakpoints:
  // Phones: < 768px (e.g., iPhone 13-16, Samsung Galaxy S21-S24)
  // Standard Tablets: 768px - 1023px (e.g., iPad Mini, iPad 10.2", iPad Air, Galaxy Tab S9)
  // Large Tablets & Desktop: >= 1024px (e.g., iPad Pro 11"/12.9", Landscape Tablets, Web)
  const isTablet = width >= 768;
  const isLargeTablet = width >= 1024;
  const isPhone = !isTablet;

  const deviceType: 'phone' | 'tablet' | 'desktop' =
    Platform.OS === 'web' && width >= 1200
      ? 'desktop'
      : isTablet
      ? 'tablet'
      : 'phone';

  const numColumns = isLargeTablet ? 3 : isTablet ? 2 : 1;

  // Max width constraint so UI never looks stretched across ultra-wide displays
  const contentMaxWidth =
    isLargeTablet ? 1200 : isTablet ? 960 : Platform.OS === 'web' ? 480 : undefined;

  const containerPadding = isLargeTablet ? 24 : isTablet ? 20 : 16;
  const gutter = isTablet ? 16 : 12;

  const cardWidth = (customCols?: number): DimensionValue => {
    const cols = customCols ?? numColumns;
    if (cols === 1) return '100%';
    if (cols === 2) return '48.5%';
    if (cols === 3) return '31.8%';
    return '100%';
  };

  return {
    width,
    height,
    isPhone,
    isTablet,
    isLargeTablet,
    isLandscape,
    isPortrait,
    deviceType,
    numColumns,
    contentMaxWidth,
    containerPadding,
    gutter,
    cardWidth,
  };
}

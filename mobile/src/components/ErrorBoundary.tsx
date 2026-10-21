import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPE } from '../constants/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('5S Mobile Uncaught Runtime Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card} accessibilityRole="alert">
            <View style={styles.iconCircle}>
              <Ionicons name="warning-outline" size={28} color={COLORS.danger} />
            </View>
            <Text style={styles.title} accessibilityRole="header">
              Something went wrong
            </Text>
            <Text style={styles.subtitle}>
              This screen could not be shown. Audits, reports and red tags saved on this device are not lost.
            </Text>
            {this.state.error?.message ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorLabel}>Error details</Text>
                <Text style={styles.errorText} numberOfLines={4}>
                  {this.state.error.message}
                </Text>
              </View>
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.retryBtn, pressed && { backgroundColor: COLORS.primaryDark }]}
              onPress={this.handleReset}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Ionicons name="refresh" size={18} color={COLORS.textInverse} />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.screen,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xxl,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: { ...TYPE.title, color: COLORS.textDark, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { ...TYPE.body, color: COLORS.textMedium, textAlign: 'center', marginBottom: SPACING.lg },
  errorBox: {
    width: '100%',
    backgroundColor: COLORS.cardSecondary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  errorLabel: { ...TYPE.captionStrong, color: COLORS.textMedium, marginBottom: 2 },
  errorText: { ...TYPE.caption, color: COLORS.danger },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 48,
    alignSelf: 'stretch',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xl,
  },
  retryText: { ...TYPE.bodyStrong, color: COLORS.textInverse },
});

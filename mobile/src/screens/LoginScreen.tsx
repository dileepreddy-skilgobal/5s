import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOWS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';
import { FormField, TextField } from '../components/ui';
import { BrandMark } from '../components/BootstrapScreen';
import { useAuth } from '../context/UserContext';
import { getErrorMessage } from '../services/http';
import { MfaChallenge } from '../services/authService';

type Mode = 'PASSWORD' | 'PIN';

/** Seconds left before the MFA challenge expires (re-evaluated every second while it is shown). */
const useSecondsLeft = (expiresAt: number | null): number => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
};

/** Full-width primary action. The disabled state is grey with dark text so it stays readable. */
const SubmitButton: React.FC<{ label: string; onPress: () => void; disabled: boolean; loading: boolean }> = ({
  label,
  onPress,
  disabled,
  loading,
}) => {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.submit,
        disabled && !loading ? styles.submitDisabled : null,
        pressed && !inactive ? styles.submitPressed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.textInverse} />
      ) : (
        <Text style={[styles.submitText, disabled && styles.submitTextDisabled]}>{label}</Text>
      )}
    </Pressable>
  );
};

/** Small text button (links such as "Use a recovery code instead"). */
const LinkButton: React.FC<{ label: string; onPress: () => void; center?: boolean }> = ({ label, onPress, center }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    hitSlop={8}
    style={({ pressed }) => [styles.link, center && { alignSelf: 'center' }, pressed && { opacity: 0.7 }]}
  >
    <Text style={styles.linkText}>{label}</Text>
  </Pressable>
);

export const LoginScreen: React.FC = () => {
  const { signIn, signInWithPin, verifyMfa, sessionEndedReason } = useAuth();

  const [mode, setMode] = useState<Mode>('PASSWORD');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [badgeId, setBadgeId] = useState('');
  const [pin, setPin] = useState('');
  const [orgCode, setOrgCode] = useState('');
  const [showOrgCode, setShowOrgCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const pinRef = useRef<TextInput>(null);

  // Second sign-in step (two-factor authentication)
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const secondsLeft = useSecondsLeft(challenge?.expiresAt ?? null);
  const challengeExpired = !!challenge && secondsLeft === 0;

  const canSubmit =
    mode === 'PASSWORD' ? email.trim().length > 0 && password.length > 0 : badgeId.trim().length > 0 && /^\d{4,8}$/.test(pin);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const next = mode === 'PASSWORD' ? await signIn(email, password, orgCode) : await signInWithPin(badgeId, pin, orgCode);
      if (next) {
        // Two-factor authentication: ask for the code (the credentials are not needed any more)
        setChallenge(next);
        setUseRecoveryCode(false);
        setMfaCode('');
        setRecoveryCode('');
        setPassword('');
        setPin('');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Sign in failed. Please try again.'));
      if (mode === 'PASSWORD') setPassword('');
      else setPin('');
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const canVerify = !!challenge && !challengeExpired && (useRecoveryCode ? recoveryCode.trim().length >= 6 : /^\d{6}$/.test(mfaCode));

  const handleVerify = async () => {
    if (!challenge || !canVerify || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await verifyMfa(challenge, useRecoveryCode ? { recoveryCode } : { code: mfaCode });
    } catch (err) {
      setError(getErrorMessage(err, 'Verification failed. Please try again.'));
      setMfaCode('');
      setRecoveryCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelChallenge = () => {
    setChallenge(null);
    setError(null);
  };

  const formatSeconds = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  const mfaStep = challenge && (
    <>
      <View style={styles.mfaHeader}>
        <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
        <Text style={styles.mfaTitle} accessibilityRole="header">
          Two-factor verification
        </Text>
      </View>
      <Text style={styles.mfaHint}>
        {useRecoveryCode
          ? 'Enter one of the recovery codes you saved when you set up two-factor authentication. Each code works once.'
          : 'Enter the 6-digit code from your authenticator app.'}
      </Text>
      {useRecoveryCode ? (
        <FormField label="Recovery code">
          <TextField
            value={recoveryCode}
            onChangeText={(v) => setRecoveryCode(v.slice(0, 20))}
            placeholder="e.g. A1B2C-3D4E5"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleVerify}
            editable={!challengeExpired}
            accessibilityLabel="Recovery code"
          />
        </FormField>
      ) : (
        <FormField label="Verification code">
          <TextField
            style={styles.codeInput}
            value={mfaCode}
            onChangeText={(v) => setMfaCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            returnKeyType="go"
            onSubmitEditing={handleVerify}
            editable={!challengeExpired}
            autoFocus
            accessibilityLabel="6-digit verification code"
          />
        </FormField>
      )}
      <Text style={[styles.mfaExpiry, challengeExpired && { color: COLORS.danger }]} accessibilityLiveRegion="polite">
        {challengeExpired
          ? 'This verification step expired after 5 minutes. Go back and sign in again.'
          : `Expires in ${formatSeconds(secondsLeft)}. Enter the code within 5 minutes of signing in.`}
      </Text>
      <LinkButton
        label={useRecoveryCode ? 'Use authenticator code instead' : 'Use a recovery code instead'}
        onPress={() => setUseRecoveryCode((v) => !v)}
      />
      <SubmitButton label="Verify and sign in" onPress={handleVerify} disabled={!canVerify} loading={submitting} />
      <LinkButton label="Back to sign in" onPress={cancelChallenge} center />
    </>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <BrandMark size={56} />
          <Text style={styles.title} accessibilityRole="header">
            SkilGlobal 5S
          </Text>
          <Text style={styles.subtitle}>Sign in to run audits and report problems on the shop floor.</Text>
        </View>

        <View style={styles.card}>
          {sessionEndedReason && !error && (
            <View style={[styles.banner, styles.bannerInfo]}>
              <Ionicons name="time-outline" size={16} color={COLORS.info} />
              <Text style={[styles.bannerText, { color: COLORS.info }]}>{sessionEndedReason}</Text>
            </View>
          )}
          {error && (
            <View style={[styles.banner, styles.bannerError]} accessibilityLiveRegion="polite" accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} />
              <Text style={[styles.bannerText, { color: COLORS.danger }]}>{error}</Text>
            </View>
          )}

          {mfaStep || (
            <>
              <View style={styles.tabs} accessibilityRole="tablist">
                {(['PASSWORD', 'PIN'] as Mode[]).map((m) => {
                  const active = mode === m;
                  const label = m === 'PASSWORD' ? 'Email & password' : 'Badge & PIN';
                  return (
                    <Pressable
                      key={m}
                      style={[styles.tab, active && styles.tabActive]}
                      onPress={() => switchMode(m)}
                      accessibilityRole="tab"
                      accessibilityLabel={label}
                      accessibilityState={{ selected: active }}
                    >
                      <Ionicons
                        name={m === 'PASSWORD' ? 'mail-outline' : 'keypad-outline'}
                        size={16}
                        color={active ? COLORS.primary : COLORS.textMedium}
                      />
                      <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {mode === 'PASSWORD' ? (
                <>
                  <FormField label="Work email">
                    <TextField
                      value={email}
                      onChangeText={setEmail}
                      placeholder="name@company.com"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="username"
                      autoComplete="email"
                      returnKeyType="next"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      submitBehavior="submit"
                      accessibilityLabel="Work email"
                    />
                  </FormField>
                  <FormField label="Password">
                    <View>
                      <TextField
                        ref={passwordRef}
                        style={styles.passwordInput}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Password"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        textContentType="password"
                        autoComplete="password"
                        returnKeyType="go"
                        onSubmitEditing={handleSubmit}
                        accessibilityLabel="Password"
                      />
                      <Pressable
                        style={styles.eye}
                        onPress={() => setShowPassword((v) => !v)}
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textMedium} />
                      </Pressable>
                    </View>
                  </FormField>
                </>
              ) : (
                <>
                  <FormField label="Badge ID">
                    <TextField
                      value={badgeId}
                      onChangeText={setBadgeId}
                      placeholder="e.g. BADGE-OP-049"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      returnKeyType="next"
                      onSubmitEditing={() => pinRef.current?.focus()}
                      submitBehavior="submit"
                      accessibilityLabel="Badge ID"
                    />
                  </FormField>
                  <FormField label="PIN" hint="4 to 8 digits">
                    <TextField
                      ref={pinRef}
                      style={styles.codeInput}
                      value={pin}
                      onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 8))}
                      placeholder="••••"
                      secureTextEntry
                      keyboardType="number-pad"
                      maxLength={8}
                      returnKeyType="go"
                      onSubmitEditing={handleSubmit}
                      accessibilityLabel="PIN, 4 to 8 digits"
                    />
                  </FormField>
                </>
              )}

              <LinkButton
                label={showOrgCode ? 'Hide organization code' : 'Signing in to a specific organization?'}
                onPress={() => setShowOrgCode((v) => !v)}
              />
              {showOrgCode && (
                <FormField label="Organization code" hint="Ask your 5S administrator if you are not sure.">
                  <TextField
                    value={orgCode}
                    onChangeText={setOrgCode}
                    placeholder="e.g. skilglobal-mfg"
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Organization code"
                  />
                </FormField>
              )}

              <SubmitButton label="Sign in" onPress={handleSubmit} disabled={!canSubmit} loading={submitting} />
            </>
          )}
        </View>

        <Text style={styles.footer}>Forgot your password or PIN? Contact your organization's 5S administrator.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.screen,
    paddingVertical: SPACING.xxl,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  brand: { alignItems: 'center', marginBottom: SPACING.xxl },
  title: { ...TYPE.display, color: COLORS.textDark, marginTop: SPACING.md },
  subtitle: { ...TYPE.body, color: COLORS.textMedium, marginTop: SPACING.xs, textAlign: 'center' },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    ...SHADOWS.card,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.lg,
    borderWidth: 1,
  },
  bannerInfo: { backgroundColor: COLORS.infoSoft, borderColor: COLORS.infoBorder },
  bannerError: { backgroundColor: COLORS.dangerSoft, borderColor: COLORS.dangerBorder },
  bannerText: { ...TYPE.label, fontWeight: '400', flex: 1 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardSecondary,
    borderRadius: RADIUS.md,
    padding: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  tabActive: { backgroundColor: COLORS.card, ...SHADOWS.soft },
  tabText: { ...TYPE.label, color: COLORS.textMedium, flexShrink: 1 },
  tabTextActive: { color: COLORS.primary },
  passwordInput: { paddingRight: TOUCH_TARGET + 4 },
  eye: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeInput: { fontSize: 20, lineHeight: 26, letterSpacing: 4, textAlign: 'center' },
  link: { alignSelf: 'flex-start', minHeight: TOUCH_TARGET, justifyContent: 'center' },
  linkText: { ...TYPE.label, color: COLORS.primaryLight },
  submit: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
    minHeight: 52,
    paddingHorizontal: SPACING.lg,
  },
  submitPressed: { backgroundColor: COLORS.primaryDark, borderColor: COLORS.primaryDark },
  submitDisabled: { backgroundColor: COLORS.cardSecondary, borderColor: COLORS.border },
  submitText: { ...TYPE.bodyStrong, fontSize: 16, color: COLORS.textInverse },
  submitTextDisabled: { color: COLORS.textMedium },
  footer: { ...TYPE.caption, textAlign: 'center', color: COLORS.textMedium, marginTop: SPACING.xl },
  mfaHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  mfaTitle: { ...TYPE.heading, color: COLORS.textDark },
  mfaHint: { ...TYPE.label, fontWeight: '400', color: COLORS.textMedium, marginBottom: SPACING.lg },
  mfaExpiry: { ...TYPE.caption, color: COLORS.textMedium, marginTop: -SPACING.sm },
});

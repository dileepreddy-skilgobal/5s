import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  RecordingOptions,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { COLORS, RADIUS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';
import { LocalMedia } from '../types';
import { MediaStore } from '../services/mediaStore';

/** Longest voice note (seconds). */
export const MAX_VOICE_NOTE_SEC = 120;

/** Mono AAC at 64 kbps: about 1 MB for a two-minute note (server limit for audio is 15 MB). */
const VOICE_NOTE_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
};

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

interface VoiceNoteRecorderProps {
  value: LocalMedia | undefined;
  onChange: (note: LocalMedia | undefined) => void;
  disabled?: boolean;
}

/** Native-only voice note: record (max 2 min), play back, re-record or delete. */
const NativeVoiceNoteRecorder: React.FC<VoiceNoteRecorderProps> = ({ value, onChange, disabled }) => {
  const recorder = useAudioRecorder(VOICE_NOTE_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 250);
  const player = useAudioPlayer(value ? { uri: value.localUri } : null);
  const playerStatus = useAudioPlayerStatus(player);
  const [busy, setBusy] = useState(false);
  const recordingRef = useRef(false);
  /** Set once the native recorder reported that it is recording (to detect it stopping on its own). */
  const sawRecordingRef = useRef(false);

  const finishRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    sawRecordingRef.current = false;
    setBusy(true);
    try {
      const durationSec = Math.min(MAX_VOICE_NOTE_SEC, Math.round(recorder.currentTime || recorderState.durationMillis / 1000));
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      const uri = recorder.uri;
      if (!uri) throw new Error('No recording');
      const note = await MediaStore.persist(uri, 'AUDIO', { mimeType: 'audio/mp4', durationSec });
      if (value) MediaStore.remove([value.localUri]);
      onChange(note);
    } catch {
      Alert.alert('Voice note', 'The recording could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [onChange, recorder, recorderState.durationMillis, value]);

  // Stop automatically at the time limit (also enforced natively with forDuration)
  useEffect(() => {
    if (recordingRef.current && recorderState.durationMillis >= MAX_VOICE_NOTE_SEC * 1000) finishRecording();
  }, [finishRecording, recorderState.durationMillis]);

  // The native recorder stopped on its own (time limit reached)
  useEffect(() => {
    if (recorderState.isRecording) {
      sawRecordingRef.current = true;
    } else if (recordingRef.current && sawRecordingRef.current && !busy) {
      finishRecording();
    }
  }, [busy, finishRecording, recorderState.isRecording]);

  // Rewind after playback ends so Play starts from the beginning
  useEffect(() => {
    if (playerStatus.didJustFinish) player.seekTo(0).catch(() => undefined);
  }, [player, playerStatus.didJustFinish]);

  const startRecording = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone access needed', 'Allow microphone access in device settings to record a voice note.');
        return;
      }
      if (playerStatus.playing) player.pause();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      sawRecordingRef.current = false;
      recordingRef.current = true;
      recorder.record({ forDuration: MAX_VOICE_NOTE_SEC });
    } catch {
      recordingRef.current = false;
      Alert.alert('Voice note', 'Recording could not be started on this device.');
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete voice note?', 'The recording will be removed from this report.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (playerStatus.playing) player.pause();
          if (value) MediaStore.remove([value.localUri]);
          onChange(undefined);
        },
      },
    ]);
  };

  const isRecording = recordingRef.current || recorderState.isRecording;
  const elapsedSec = recorderState.durationMillis / 1000;

  if (isRecording) {
    return (
      <View style={[styles.box, styles.boxRecording]} accessibilityLiveRegion="polite">
        <View style={styles.recDot} />
        <Text style={styles.recText}>
          Recording {fmt(elapsedSec)} of {fmt(MAX_VOICE_NOTE_SEC)}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.btnStop, pressed && styles.pressed]}
          onPress={finishRecording}
          accessibilityRole="button"
          accessibilityLabel="Stop recording"
        >
          <Ionicons name="stop" size={16} color={COLORS.textInverse} />
          <Text style={styles.btnStopText}>Stop</Text>
        </Pressable>
      </View>
    );
  }

  if (busy) {
    return (
      <View style={styles.box}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.label}>Saving recording…</Text>
      </View>
    );
  }

  if (value) {
    const total = value.durationSec ?? playerStatus.duration;
    return (
      <View style={[styles.box, styles.boxDone]}>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          onPress={() => (playerStatus.playing ? player.pause() : player.play())}
          accessibilityRole="button"
          accessibilityLabel={playerStatus.playing ? 'Pause voice note' : 'Play voice note'}
        >
          <Ionicons name={playerStatus.playing ? 'pause' : 'play'} size={18} color={COLORS.primary} />
        </Pressable>
        <Text style={[styles.label, { flex: 1 }]}>
          Voice note {playerStatus.playing ? `${fmt(playerStatus.currentTime)} / ` : ''}
          {fmt(total || 0)}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, disabled && styles.disabled, pressed && styles.pressed]}
          onPress={startRecording}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Record again"
          accessibilityState={{ disabled: !!disabled }}
        >
          <Ionicons name="refresh" size={18} color={COLORS.textDark} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, disabled && styles.disabled, pressed && styles.pressed]}
          onPress={confirmDelete}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Delete voice note"
          accessibilityState={{ disabled: !!disabled }}
        >
          <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.box, disabled && styles.disabled, pressed && styles.pressed]}
      onPress={startRecording}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Record a voice note, up to 2 minutes"
      accessibilityState={{ disabled: !!disabled }}
    >
      <Ionicons name="mic-outline" size={20} color={COLORS.primary} />
      <Text style={[styles.label, styles.labelAction]}>Record a voice note</Text>
      <Text style={styles.hint}>Up to 2 min</Text>
    </Pressable>
  );
};

/** Voice notes need the device microphone; the web preview shows a hint instead. */
export const VoiceNoteRecorder: React.FC<VoiceNoteRecorderProps> = (props) => {
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.box, styles.boxMuted]}>
        <Ionicons name="mic-off-outline" size={18} color={COLORS.textMuted} />
        <Text style={[styles.label, { color: COLORS.textMedium, flex: 1 }]}>Voice notes can be recorded in the mobile app.</Text>
      </View>
    );
  }
  return <NativeVoiceNoteRecorder {...props} />;
};

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    backgroundColor: COLORS.primarySoft,
    minHeight: 52,
  },
  boxRecording: { borderColor: COLORS.dangerBorder, backgroundColor: COLORS.dangerSoft },
  boxDone: { borderColor: COLORS.successBorder, backgroundColor: COLORS.successSoft },
  boxMuted: { borderColor: COLORS.border, backgroundColor: COLORS.cardSecondary },
  label: { ...TYPE.label, color: COLORS.textDark },
  labelAction: { flex: 1, color: COLORS.primary },
  hint: { ...TYPE.caption, color: COLORS.textMedium },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.danger },
  recText: { flex: 1, ...TYPE.label, color: COLORS.danger },
  btnStop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    minHeight: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.danger,
  },
  btnStopText: { ...TYPE.label, color: COLORS.textInverse },
  iconBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SHADOWS, SPACING, TOUCH_TARGET, TYPE } from '../constants/theme';
import {
  AuditExecution,
  AuditSubmissionPayload,
  AuditTemplateSnapshot,
  FiveSCategory,
  PhotoAnnotation,
  QuestionAnswer,
  SeverityLevel,
  TemplateQuestion,
} from '../types';
import { PILLARS } from '../constants/pillars';
import { PhotoAnnotatorModal } from './PhotoAnnotatorModal';
import { useUser } from '../context/UserContext';
import { useResponsive } from '../hooks/useResponsive';
import { allQuestions, buildSubmission, computeScores, MAX_RATING } from '../services/auditScoring';
import { prepareEvidencePhoto } from '../services/imageEvidence';
import { RemoteImage } from './RemoteImage';
import { useWorkspace } from '../context/WorkspaceContext';
import { Badge, Button, Chip, FormField, TextField } from './ui';

interface AuditExecutionModalProps {
  visible: boolean;
  audit: AuditExecution;
  /** Exact template version this audit runs on. */
  template: AuditTemplateSnapshot;
  /** Called with the current answers when the auditor leaves the audit (answers are kept as a draft). */
  onClose: (answers: Record<string, QuestionAnswer>) => void;
  /** Persists in-progress answers (debounced) so nothing is lost if the app is closed. */
  onDraftChange: (answers: Record<string, QuestionAnswer>) => void;
  onSubmit: (audit: AuditExecution, payload: AuditSubmissionPayload) => Promise<void>;
}

const DRAFT_SAVE_DELAY_MS = 800;

const RATINGS = Array.from({ length: MAX_RATING + 1 }, (_, i) => i);

/**
 * Answer buttons for a question. Yes/no and pass/fail questions get two buttons scored as full marks or zero
 * (the server reads the answer as score / max score); every other type is rated 0–5.
 */
const answerOptions = (questionType: string | null | undefined): Array<{ value: number; label: string; a11y: string }> => {
  if (questionType === 'YES_NO') return [{ value: MAX_RATING, label: 'Yes', a11y: 'Yes' }, { value: 0, label: 'No', a11y: 'No' }];
  if (questionType === 'PASS_FAIL') return [{ value: MAX_RATING, label: 'Pass', a11y: 'Pass' }, { value: 0, label: 'Fail', a11y: 'Fail' }];
  return RATINGS.map((val) => ({ value: val, label: String(val), a11y: `Rating ${val} of ${MAX_RATING}` }));
};

const SEVERITIES: { key: SeverityLevel; label: string }[] = [
  { key: 'MINOR', label: 'Minor' },
  { key: 'MODERATE', label: 'Moderate' },
  { key: 'MAJOR', label: 'Major' },
  { key: 'CRITICAL', label: 'Critical' },
];
const SEVERITY_LABEL: Record<SeverityLevel, string> = { MINOR: 'Minor', MODERATE: 'Moderate', MAJOR: 'Major', CRITICAL: 'Critical' };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const AuditExecutionModal: React.FC<AuditExecutionModalProps> = ({
  visible,
  audit,
  template,
  onClose,
  onDraftChange,
  onSubmit,
}) => {
  const { currentUser } = useUser();
  const { isTablet } = useResponsive();
  const { reportBrokenImage } = useWorkspace();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  // Only pillars that actually have questions in this template version
  const categories = useMemo(
    () => PILLARS.filter((p) => template.sections.some((s) => s.category === p.key && s.questions.length > 0)),
    [template],
  );
  const [activeCategory, setActiveCategory] = useState<FiveSCategory>(categories[0]?.key ?? 'S1_SORT');
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>(audit.answers || {});
  const [expandedGuidance, setExpandedGuidance] = useState<Record<string, boolean>>({});
  const [showStandardImage, setShowStandardImage] = useState<Record<string, boolean>>({});
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});

  // Finding (non-conformance) editor state
  const [findingQuestion, setFindingQuestion] = useState<TemplateQuestion | null>(null);
  const [findingSeverity, setFindingSeverity] = useState<SeverityLevel>('MODERATE');
  const [findingDesc, setFindingDesc] = useState('');
  const [findingError, setFindingError] = useState<string | undefined>(undefined);

  // Photo annotator modal state
  const [annotatorVisible, setAnnotatorVisible] = useState(false);
  const [currentAnnotatingQuestionId, setCurrentAnnotatingQuestionId] = useState<string | null>(null);
  const [currentPhoto, setCurrentPhoto] = useState<{ uri: string; width?: number; height?: number } | null>(null);
  const [photoSourceModalVisible, setPhotoSourceModalVisible] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);

  // Sign-off modal state
  const [showSignOffModal, setShowSignOffModal] = useState(false);
  const [auditorSigned, setAuditorSigned] = useState(false);
  const [summaryNotes, setSummaryNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const questionById = useMemo(() => new Map(allQuestions(template).map((q) => [q.id, q])), [template]);

  const currentQuestions = useMemo(
    () => template.sections.filter((s) => s.category === activeCategory).flatMap((s) => s.questions),
    [template, activeCategory],
  );

  const scoreStats = useMemo(() => computeScores(template, answers), [template, answers]);
  const findingsCount = useMemo(() => Object.values(answers).filter((a) => a.finding).length, [answers]);
  const scoreLabel = scoreStats.percentage === null ? '—' : `${Math.round(scoreStats.percentage)}%`;

  // Answered / total per pillar for the section tabs
  const categoryProgress = useMemo(() => {
    const out: Partial<Record<FiveSCategory, { answered: number; total: number }>> = {};
    template.sections.forEach((s) => {
      const entry = out[s.category] ?? { answered: 0, total: 0 };
      s.questions.forEach((q) => {
        entry.total += 1;
        if (answers[q.id]) entry.answered += 1;
      });
      out[s.category] = entry;
    });
    return out;
  }, [template, answers]);

  const activeIndex = categories.findIndex((c) => c.key === activeCategory);
  const nextCategory = activeIndex >= 0 ? categories[activeIndex + 1] : undefined;

  // Each section starts at its first question
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeCategory]);

  // Debounced draft persistence
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => onDraftChange(answers), DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [answers, onDraftChange]);

  const baseAnswer = (q: TemplateQuestion, prev?: QuestionAnswer): QuestionAnswer => ({
    questionId: q.id,
    sectionId: q.sectionId,
    category: q.category,
    score: prev?.score ?? 0,
    isNa: prev?.isNa ?? false,
    comment: prev?.comment ?? '',
    evidence: prev?.evidence ?? [],
    finding: prev?.finding,
  });

  const handleScoreChange = (q: TemplateQuestion, score: number) => {
    setAnswers((prev) => ({ ...prev, [q.id]: { ...baseAnswer(q, prev[q.id]), score, isNa: false } }));
  };

  const handleToggleNa = (q: TemplateQuestion) => {
    setAnswers((prev) => {
      const current = baseAnswer(q, prev[q.id]);
      return { ...prev, [q.id]: { ...current, isNa: !(prev[q.id]?.isNa ?? false), finding: undefined } };
    });
  };

  /** Notes only attach to an existing answer, so typing a note never counts as rating the question. */
  const handleCommentChange = (questionId: string, comment: string) => {
    setAnswers((prev) => (prev[questionId] ? { ...prev, [questionId]: { ...prev[questionId], comment } } : prev));
  };

  const handleAddEvidencePhoto = (questionId: string) => {
    setCurrentAnnotatingQuestionId(questionId);
    setPhotoSourceModalVisible(true);
  };

  const handlePickedAsset = (asset?: ImagePicker.ImagePickerAsset) => {
    if (!asset?.uri) return;
    setCurrentPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
    setPhotoSourceModalVisible(false);
    setAnnotatorVisible(true);
  };

  const handleLaunchCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera access needed', 'Allow camera access in your device settings to take photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.9 });
      if (!result.canceled) handlePickedAsset(result.assets?.[0]);
    } catch {
      Alert.alert('Camera unavailable', 'The camera could not be opened.');
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photo access needed', 'Allow photo library access in your device settings to choose a photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.9 });
      if (!result.canceled) handlePickedAsset(result.assets?.[0]);
    } catch {
      Alert.alert('Gallery unavailable', 'The photo library could not be opened.');
    }
  };

  const handleDeleteEvidence = (questionId: string, photoId: string) => {
    setAnswers((prev) => {
      const existing = prev[questionId];
      if (!existing) return prev;
      return { ...prev, [questionId]: { ...existing, evidence: existing.evidence.filter((e) => e.id !== photoId) } };
    });
  };

  const handleSaveAnnotation = async (
    annotations: PhotoAnnotation[],
    updatedPhotoUri?: string,
    updatedPhotoSize?: { width: number; height: number },
  ) => {
    const questionId = currentAnnotatingQuestionId;
    const q = questionId ? questionById.get(questionId) : undefined;
    const sourceUri = updatedPhotoUri || currentPhoto?.uri;
    setAnnotatorVisible(false);
    if (!q || !sourceUri) return;

    // A photo replaced inside the annotator has its own size; the original size would resize it wrongly
    const replaced = sourceUri !== currentPhoto?.uri;
    const size = replaced ? updatedPhotoSize : { width: currentPhoto?.width, height: currentPhoto?.height };

    setProcessingPhoto(true);
    try {
      // Downscale + compress before storing: the API keeps evidence inline with the audit.
      // Annotations are percentages of the photo, so they stay valid after resizing; the server burns them in.
      const prepared = await prepareEvidencePhoto(sourceUri, size);
      const photo = {
        id: `ev-${Date.now()}`,
        uri: prepared.uri,
        dataUrl: prepared.dataUrl,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        annotations,
      };
      setAnswers((prev) => {
        const existing = baseAnswer(q, prev[q.id]);
        return { ...prev, [q.id]: { ...existing, evidence: [...existing.evidence, photo] } };
      });
    } catch {
      Alert.alert('Photo not added', 'The photo could not be processed. Please try again.');
    } finally {
      setProcessingPhoto(false);
      setCurrentPhoto(null);
    }
  };

  const handleOpenFindingModal = (q: TemplateQuestion) => {
    const existing = answers[q.id]?.finding;
    setFindingQuestion(q);
    setFindingError(undefined);
    setFindingDesc(existing?.description ?? '');
    setFindingSeverity(existing?.severity ?? (q.isCritical ? 'MAJOR' : 'MODERATE'));
  };

  const handleSaveFinding = () => {
    if (!findingQuestion) return;
    if (!findingDesc.trim()) {
      setFindingError('Describe the problem so the area owner can act on it.');
      return;
    }
    const q = findingQuestion;
    setAnswers((prev) => ({
      ...prev,
      [q.id]: { ...baseAnswer(q, prev[q.id]), isNa: false, finding: { severity: findingSeverity, description: findingDesc.trim() } },
    }));
    setFindingQuestion(null);
  };

  const handleRemoveFinding = () => {
    if (!findingQuestion) return;
    const q = findingQuestion;
    setAnswers((prev) => (prev[q.id] ? { ...prev, [q.id]: { ...prev[q.id], finding: undefined } } : prev));
    setFindingQuestion(null);
  };

  const auditorDisplayName = `${currentUser.firstName} ${currentUser.lastName}`;
  const unanswered = scoreStats.unansweredIds.length;
  const missingPhotos = scoreStats.missingEvidenceIds.length;
  const blockers = [
    unanswered > 0 ? `${plural(unanswered, 'question', 'questions')} not answered` : null,
    missingPhotos > 0 ? `${plural(missingPhotos, 'question needs', 'questions need')} a photo` : null,
  ].filter((b): b is string => !!b);
  const canSubmit = blockers.length === 0 && auditorSigned && !submitting;

  const jumpToFirstBlocker = () => {
    const firstId = scoreStats.unansweredIds[0] ?? scoreStats.missingEvidenceIds[0];
    const q = firstId ? questionById.get(firstId) : undefined;
    if (q) setActiveCategory(q.category);
    setShowSignOffModal(false);
  };

  const handleFinalSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload = buildSubmission(template, answers, { name: auditorDisplayName }, summaryNotes);
      const completed: AuditExecution = {
        ...audit,
        answers,
        overallScore: scoreStats.percentage,
        pillarScores: scoreStats.pillarScores,
        findingsCount,
        auditorSignature: payload.auditorSignature,
        completedAt: payload.completedAt,
      };
      setShowSignOffModal(false);
      await onSubmit(completed, payload);
    } finally {
      setSubmitting(false);
    }
  };

  const progressPct = scoreStats.totalCount > 0 ? (scoreStats.answeredCount / scoreStats.totalCount) * 100 : 0;
  const sheetBottom = Math.max(insets.bottom, SPACING.lg);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => onClose(answers)}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={[styles.modalContainer, isTablet && styles.tabletModalContainer]}>
          {/* Header: area, audit code and progress */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Pressable
                onPress={() => onClose(answers)}
                style={styles.backButton}
                accessibilityRole="button"
                accessibilityLabel="Save and close audit"
                hitSlop={4}
              >
                <Ionicons name="arrow-back" size={24} color={COLORS.textDark} />
              </Pressable>
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle} numberOfLines={2} accessibilityRole="header">
                  {audit.locationName || 'Audit'}
                </Text>
                <Text style={styles.headerSub} numberOfLines={1}>
                  {[audit.trackingNumber, template.name].filter(Boolean).join(' • ')}
                </Text>
              </View>
            </View>
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                {scoreStats.answeredCount} of {scoreStats.totalCount} answered
              </Text>
              {findingsCount > 0 && <Text style={styles.progressFindings}>{plural(findingsCount, 'finding', 'findings')}</Text>}
            </View>
            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityLabel="Questions answered"
              accessibilityValue={{ min: 0, max: scoreStats.totalCount, now: scoreStats.answeredCount }}
            >
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
          </View>

          {/* Section tabs (only pillars present in this template) */}
          <View style={styles.tabsBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
              {categories.map((cat) => {
                const selected = activeCategory === cat.key;
                const prog = categoryProgress[cat.key] ?? { answered: 0, total: 0 };
                const done = prog.total > 0 && prog.answered === prog.total;
                return (
                  <Pressable
                    key={cat.key}
                    style={({ pressed }) => [styles.tab, selected && styles.tabActive, pressed && !selected && styles.pressed]}
                    onPress={() => setActiveCategory(cat.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${cat.label}, ${prog.answered} of ${prog.total} answered`}
                  >
                    {done && <Ionicons name="checkmark-circle" size={16} color={selected ? COLORS.textInverse : COLORS.success} />}
                    <Text style={[styles.tabText, selected && styles.tabTextActive]}>{cat.label}</Text>
                    <Text style={[styles.tabCount, selected && styles.tabTextActive]}>
                      {prog.answered}/{prog.total}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Critical score cap warning if triggered */}
          {scoreStats.criticalFailures > 0 && (
            <View style={[styles.banner, styles.bannerDanger]}>
              <Ionicons name="warning-outline" size={18} color={COLORS.danger} />
              <Text style={[styles.bannerText, { color: COLORS.danger }]}>
                A critical question failed. The overall score is capped at {scoreStats.capApplied}%.
              </Text>
            </View>
          )}

          {processingPhoto && (
            <View style={[styles.banner, styles.bannerInfo]}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={[styles.bannerText, { color: COLORS.info }]}>Preparing photo…</Text>
            </View>
          )}

          {/* Question checklist */}
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.checklistContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {currentQuestions.map((q, idx) => {
                const currentAns = answers[q.id];
                const currentScore = currentAns ? currentAns.score : 0;
                const isAnswered = !!currentAns && !currentAns.isNa;
                const isNa = !!currentAns?.isNa;
                const needsPhoto = q.mandatoryEvidence && !isNa && (currentAns?.evidence.length ?? 0) === 0;
                const hasGuidance = expandedGuidance[q.id];
                const hasStdImage = showStandardImage[q.id];
                const evidence = currentAns?.evidence ?? [];
                const showNote = !!currentAns && (noteOpen[q.id] || !!currentAns.comment);

                return (
                  <View key={q.id} style={[styles.questionCard, q.isCritical && styles.questionCardCritical]}>
                    {/* Question header */}
                    <View style={styles.qHeader}>
                      <Text style={styles.qNumber} numberOfLines={1}>
                        Question {idx + 1} of {currentQuestions.length}
                        {q.code ? ` • ${q.code}` : ''}
                      </Text>
                      {q.isCritical && <Badge label="Critical" tone="danger" icon="alert-circle" />}
                    </View>

                    <Text style={styles.qText}>{q.text}</Text>

                    {q.mandatoryEvidence && !isNa && (
                      <View style={styles.qTags}>
                        <Badge
                          label={needsPhoto ? 'Photo required' : 'Photo added'}
                          tone={needsPhoto ? 'warning' : 'success'}
                          icon={needsPhoto ? 'camera-outline' : 'checkmark'}
                        />
                      </View>
                    )}

                    {/* Guidance and reference photo toggles (only when the template provides them) */}
                    {(!!q.guidance || !!q.referencePhotoUrl) && (
                      <View style={styles.guidanceRow}>
                        {!!q.guidance && (
                          <Pressable
                            style={styles.linkBtn}
                            onPress={() => setExpandedGuidance((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: !!hasGuidance }}
                          >
                            <Ionicons name="information-circle-outline" size={18} color={COLORS.primaryLight} />
                            <Text style={styles.linkText}>{hasGuidance ? 'Hide guidance' : 'Show guidance'}</Text>
                          </Pressable>
                        )}
                        {!!q.referencePhotoUrl && (
                          <Pressable
                            style={styles.linkBtn}
                            onPress={() => setShowStandardImage((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: !!hasStdImage }}
                          >
                            <Ionicons name="image-outline" size={18} color={COLORS.primaryLight} />
                            <Text style={styles.linkText}>{hasStdImage ? 'Hide reference photo' : 'Reference photo'}</Text>
                          </Pressable>
                        )}
                      </View>
                    )}

                    {hasGuidance && !!q.guidance && (
                      <View style={styles.guidanceBox}>
                        <Text style={styles.guidanceText}>{q.guidance}</Text>
                      </View>
                    )}

                    {/* Reference photo: what the area should look like */}
                    {hasStdImage && !!q.referencePhotoUrl && (
                      <View style={styles.referenceBox}>
                        <Text style={styles.referenceLabel}>How it should look</Text>
                        <RemoteImage uri={q.referencePhotoUrl} style={styles.referenceImage} resizeMode="cover" onLoadError={reportBrokenImage} />
                      </View>
                    )}

                    {/* Answer (yes/no, pass/fail or rating 0–5) and not applicable */}
                    <View style={styles.ratingHeader}>
                      {answerOptions(q.questionType).length === 2 ? (
                        <Text style={styles.ratingLabel}>Answer</Text>
                      ) : (
                        <Text style={styles.ratingLabel}>
                          Rating <Text style={styles.ratingHint}>0 = not met, {MAX_RATING} = fully met</Text>
                        </Text>
                      )}
                    </View>
                    <View style={styles.ratingRow} accessibilityRole="radiogroup">
                      {answerOptions(q.questionType).map((opt) => {
                        const active = isAnswered && currentScore === opt.value;
                        return (
                          <Pressable
                            key={opt.label}
                            style={({ pressed }) => [styles.ratingButton, active && styles.ratingButtonActive, pressed && !active && styles.pressed]}
                            onPress={() => handleScoreChange(q, opt.value)}
                            accessibilityRole="radio"
                            accessibilityLabel={opt.a11y}
                            accessibilityState={{ selected: active, checked: active }}
                          >
                            <Text style={[styles.ratingButtonText, active && styles.ratingButtonTextActive]}>{opt.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.naButton, isNa && styles.naButtonActive, pressed && styles.pressed]}
                      onPress={() => handleToggleNa(q)}
                      accessibilityRole="checkbox"
                      accessibilityLabel="Not applicable"
                      accessibilityState={{ checked: isNa }}
                    >
                      <Ionicons name={isNa ? 'checkbox' : 'square-outline'} size={20} color={isNa ? COLORS.primary : COLORS.textMedium} />
                      <Text style={[styles.naText, isNa && { color: COLORS.primary }]}>Not applicable</Text>
                    </Pressable>

                    {/* Photo and finding actions */}
                    <View style={styles.cardActionsRow}>
                      <Button
                        label={evidence.length > 0 ? `Add photo (${evidence.length})` : 'Add photo'}
                        icon="camera-outline"
                        variant="secondary"
                        onPress={() => handleAddEvidencePhoto(q.id)}
                        style={styles.flex}
                      />
                      <Button
                        label={currentAns?.finding ? 'Edit finding' : 'Raise finding'}
                        icon="flag-outline"
                        variant="secondary"
                        onPress={() => handleOpenFindingModal(q)}
                        disabled={isNa}
                        style={styles.flex}
                        accessibilityLabel={isNa ? 'Raise finding, not available for not applicable questions' : undefined}
                      />
                    </View>

                    {currentAns?.finding && (
                      <Pressable
                        style={styles.findingBox}
                        onPress={() => handleOpenFindingModal(q)}
                        accessibilityRole="button"
                        accessibilityLabel={`Finding, ${SEVERITY_LABEL[currentAns.finding.severity]}: ${currentAns.finding.description}. Tap to edit.`}
                      >
                        <Ionicons name="flag" size={16} color={COLORS.danger} />
                        <View style={styles.flex}>
                          <Text style={styles.findingTitle}>Finding • {SEVERITY_LABEL[currentAns.finding.severity]}</Text>
                          <Text style={styles.findingText}>{currentAns.finding.description}</Text>
                        </View>
                      </Pressable>
                    )}

                    {/* Evidence photo thumbnails */}
                    {evidence.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.evidenceThumbRow}>
                        {evidence.map((ev, evIdx) => (
                          <View key={ev.id || evIdx} style={styles.evidenceThumbCard}>
                            <Image source={{ uri: ev.uri }} style={styles.evidenceThumbImage} accessibilityLabel={`Photo ${evIdx + 1}`} />
                            {(ev.annotations?.length ?? 0) > 0 && (
                              <View style={styles.evidenceThumbBadge}>
                                <Text style={styles.evidenceThumbBadgeText}>{plural(ev.annotations.length, 'mark', 'marks')}</Text>
                              </View>
                            )}
                            <Pressable
                              style={styles.evidenceThumbDeleteBtn}
                              onPress={() => handleDeleteEvidence(q.id, ev.id)}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove photo ${evIdx + 1}`}
                            >
                              <Ionicons name="close" size={14} color={COLORS.textInverse} />
                            </Pressable>
                          </View>
                        ))}
                      </ScrollView>
                    )}

                    {/* Optional note, sent with the answer */}
                    {showNote ? (
                      <View style={styles.noteBox}>
                        <TextField
                          value={currentAns?.comment ?? ''}
                          onChangeText={(t) => handleCommentChange(q.id, t)}
                          placeholder="Note for this question (optional)"
                          accessibilityLabel={`Note for question ${idx + 1}`}
                          multiline
                          style={styles.noteInput}
                        />
                      </View>
                    ) : currentAns ? (
                      <Pressable
                        style={styles.linkBtn}
                        onPress={() => setNoteOpen((prev) => ({ ...prev, [q.id]: true }))}
                        accessibilityRole="button"
                      >
                        <Ionicons name="create-outline" size={18} color={COLORS.primaryLight} />
                        <Text style={styles.linkText}>Add note</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}

              {/* Step to the next section, or to review at the end */}
              {nextCategory ? (
                <Button
                  label={`Next: ${nextCategory.label}`}
                  icon="arrow-forward"
                  variant="secondary"
                  size="lg"
                  onPress={() => setActiveCategory(nextCategory.key)}
                />
              ) : (
                <Button label="Review and submit" icon="checkmark-done" variant="secondary" size="lg" onPress={() => setShowSignOffModal(true)} />
              )}
            </ScrollView>
          </KeyboardAvoidingView>

          {/* Bottom review and submit bar */}
          <View style={styles.bottomBar}>
            <View style={styles.bottomBarInfo}>
              <Text style={styles.bottomBarLabel}>Score so far</Text>
              <Text style={styles.bottomBarScore}>{scoreLabel}</Text>
            </View>
            <Button label="Review and submit" icon="checkmark-done" size="lg" onPress={() => setShowSignOffModal(true)} style={styles.flex} />
          </View>
        </View>

        {/* Photo Annotation Modal */}
        <PhotoAnnotatorModal
          visible={annotatorVisible}
          photoUri={currentPhoto?.uri ?? null}
          title="Mark up photo"
          onClose={() => setAnnotatorVisible(false)}
          onSave={handleSaveAnnotation}
        />

        {/* Photo source picker */}
        <Modal visible={photoSourceModalVisible} transparent animationType="fade" onRequestClose={() => setPhotoSourceModalVisible(false)}>
          <View style={styles.sheetBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPhotoSourceModalVisible(false)} accessibilityLabel="Close" />
            <View style={[styles.sheet, { paddingBottom: sheetBottom }]}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle} accessibilityRole="header">
                  Add a photo
                </Text>
                <Pressable
                  onPress={() => setPhotoSourceModalVisible(false)}
                  style={styles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={22} color={COLORS.textDark} />
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [styles.sourceItem, pressed && styles.sourceItemPressed]}
                onPress={handleLaunchCamera}
                accessibilityRole="button"
                accessibilityLabel="Take photo"
              >
                <View style={styles.sourceIcon}>
                  <Ionicons name="camera-outline" size={22} color={COLORS.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.sourceTitle}>Take photo</Text>
                  <Text style={styles.sourceDesc}>Use the camera</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.sourceItem, pressed && styles.sourceItemPressed]}
                onPress={handlePickFromGallery}
                accessibilityRole="button"
                accessibilityLabel="Choose from gallery"
              >
                <View style={styles.sourceIcon}>
                  <Ionicons name="images-outline" size={22} color={COLORS.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.sourceTitle}>Choose from gallery</Text>
                  <Text style={styles.sourceDesc}>Use a photo already on this device</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </Pressable>

              <Button label="Cancel" variant="secondary" onPress={() => setPhotoSourceModalVisible(false)} style={styles.sheetCancel} />
            </View>
          </View>
        </Modal>

        {/* Finding editor: the server creates the observation and corrective action on submit */}
        {findingQuestion && (
          <Modal visible={true} transparent animationType="fade" onRequestClose={() => setFindingQuestion(null)}>
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
              <View style={styles.sheetBackdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setFindingQuestion(null)} accessibilityLabel="Close" />
                <View style={[styles.sheet, { paddingBottom: sheetBottom }]}>
                  <View style={styles.sheetHandle} />
                  <View style={styles.sheetHeader}>
                    <View style={styles.flex}>
                      <Text style={styles.sheetTitle} accessibilityRole="header">
                        {answers[findingQuestion.id]?.finding ? 'Edit finding' : 'Raise finding'}
                      </Text>
                      <Text style={styles.sheetSubtitle} numberOfLines={2}>
                        {findingQuestion.text}
                      </Text>
                    </View>
                    <Pressable onPress={() => setFindingQuestion(null)} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
                      <Ionicons name="close" size={22} color={COLORS.textDark} />
                    </Pressable>
                  </View>

                  <ScrollView keyboardShouldPersistTaps="handled">
                    <FormField label="Severity">
                      <View style={styles.severityRow}>
                        {SEVERITIES.map((s) => (
                          <Chip key={s.key} label={s.label} selected={findingSeverity === s.key} onPress={() => setFindingSeverity(s.key)} />
                        ))}
                      </View>
                    </FormField>

                    <FormField label="What is wrong?" required error={findingError}>
                      <TextField
                        value={findingDesc}
                        onChangeText={(t) => {
                          setFindingDesc(t);
                          if (findingError && t.trim()) setFindingError(undefined);
                        }}
                        placeholder="Describe the problem and where it is"
                        multiline
                        invalid={!!findingError}
                        accessibilityLabel="What is wrong?"
                      />
                    </FormField>

                    <Button label="Save finding" onPress={handleSaveFinding} size="lg" />
                    {answers[findingQuestion.id]?.finding && (
                      <Button label="Remove finding" variant="ghost" onPress={handleRemoveFinding} style={styles.removeFindingBtn} />
                    )}
                  </ScrollView>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        )}

        {/* Review and sign-off */}
        <Modal visible={showSignOffModal} transparent animationType="slide" onRequestClose={() => setShowSignOffModal(false)}>
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
            <View style={styles.sheetBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSignOffModal(false)} accessibilityLabel="Close" />
              <View style={[styles.sheet, styles.sheetTall, { paddingBottom: sheetBottom }]}>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetHeader}>
                  <View style={styles.flex}>
                    <Text style={styles.sheetTitle} accessibilityRole="header">
                      Review and submit
                    </Text>
                    <Text style={styles.sheetSubtitle}>The area owner reviews and signs off the findings after you submit.</Text>
                  </View>
                  <Pressable onPress={() => setShowSignOffModal(false)} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
                    <Ionicons name="close" size={22} color={COLORS.textDark} />
                  </Pressable>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <View style={styles.scoreSummaryCard}>
                    <Text style={styles.scoreSummaryLabel}>Overall score</Text>
                    <Text style={styles.scoreSummaryNumber}>{scoreStats.percentage === null ? 'Not scored' : scoreLabel}</Text>
                    <Text style={styles.scoreSummaryMeta}>
                      {scoreStats.answeredCount} of {scoreStats.totalCount} answered • {plural(findingsCount, 'finding', 'findings')}
                    </Text>
                    {scoreStats.capApplied !== null && (
                      <Text style={styles.scoreSummaryCap}>Capped at {scoreStats.capApplied}% because a critical question failed.</Text>
                    )}
                  </View>

                  {blockers.length > 0 && (
                    <Pressable
                      style={styles.blockerBox}
                      onPress={jumpToFirstBlocker}
                      accessibilityRole="button"
                      accessibilityLabel={`${blockers.join(', ')}. Go to the first one.`}
                    >
                      <Ionicons name="alert-circle-outline" size={20} color={COLORS.warning} />
                      <View style={styles.flex}>
                        <Text style={styles.blockerTitle}>Before you can submit</Text>
                        {blockers.map((b) => (
                          <Text key={b} style={styles.blockerText}>
                            • {b}
                          </Text>
                        ))}
                      </View>
                      <Text style={styles.blockerAction}>Go to it</Text>
                    </Pressable>
                  )}

                  {/* Auditor sign-off */}
                  <Pressable
                    style={styles.signatureRow}
                    onPress={() => setAuditorSigned(!auditorSigned)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: auditorSigned }}
                    accessibilityLabel={`I, ${auditorDisplayName}, confirm these results are accurate`}
                  >
                    <Ionicons name={auditorSigned ? 'checkbox' : 'square-outline'} size={24} color={COLORS.primary} />
                    <View style={styles.flex}>
                      <Text style={styles.signName}>I confirm these results are accurate</Text>
                      <Text style={styles.signRole}>Signed as {auditorDisplayName}</Text>
                    </View>
                  </Pressable>

                  <FormField label="Summary notes (optional)">
                    <TextField
                      value={summaryNotes}
                      onChangeText={setSummaryNotes}
                      placeholder="Overall notes for the area owner"
                      multiline
                      accessibilityLabel="Summary notes"
                    />
                  </FormField>
                </ScrollView>

                <View style={styles.signOffActions}>
                  <Button label="Back" variant="secondary" size="lg" onPress={() => setShowSignOffModal(false)} />
                  <Button
                    label="Submit audit"
                    size="lg"
                    onPress={handleFinalSubmit}
                    disabled={!canSubmit}
                    loading={submitting}
                    style={styles.flex}
                  />
                </View>
                {!canSubmit && !submitting && blockers.length === 0 && !auditorSigned && (
                  <Text style={styles.submitHint}>Tick the confirmation to submit.</Text>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  safe: { flex: 1, backgroundColor: COLORS.card },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  tabletModalContainer: {
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },

  // Header
  header: {
    backgroundColor: COLORS.card,
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  backButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, minWidth: 0, paddingRight: SPACING.sm },
  headerTitle: { ...TYPE.heading, color: COLORS.textDark },
  headerSub: { ...TYPE.caption, color: COLORS.textMedium, marginTop: 2 },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  progressText: { ...TYPE.label, color: COLORS.textDark },
  progressFindings: { ...TYPE.captionStrong, color: COLORS.danger },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.cardSecondary,
    overflow: 'hidden',
    marginTop: 6,
    marginHorizontal: SPACING.sm,
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: COLORS.primary },

  // Section tabs
  tabsBar: {
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabsContent: { paddingHorizontal: SPACING.screen, paddingBottom: SPACING.md, gap: SPACING.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { ...TYPE.label, color: COLORS.textDark },
  tabCount: { ...TYPE.caption, color: COLORS.textMedium },
  tabTextActive: { color: COLORS.textInverse },

  // Banners
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.screen,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    borderBottomWidth: 1,
  },
  bannerDanger: { backgroundColor: COLORS.dangerSoft, borderBottomColor: COLORS.dangerBorder },
  bannerInfo: { backgroundColor: COLORS.infoSoft, borderBottomColor: COLORS.infoBorder },
  bannerText: { ...TYPE.label, flex: 1 },

  // Question cards
  checklistContent: {
    padding: SPACING.screen,
    paddingBottom: SPACING.xxl,
  },
  questionCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
  },
  questionCardCritical: { borderLeftWidth: 4, borderLeftColor: COLORS.danger },
  qHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  qNumber: { ...TYPE.captionStrong, color: COLORS.textMedium, flexShrink: 1 },
  qText: { ...TYPE.bodyStrong, color: COLORS.textDark },
  qTags: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  guidanceRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACING.lg, marginTop: SPACING.xs },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TOUCH_TARGET, alignSelf: 'flex-start' },
  linkText: { ...TYPE.label, color: COLORS.primaryLight },
  guidanceBox: {
    backgroundColor: COLORS.infoSoft,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.infoBorder,
    marginBottom: SPACING.sm,
  },
  guidanceText: { ...TYPE.body, color: COLORS.textDark },
  referenceBox: { marginBottom: SPACING.sm },
  referenceLabel: { ...TYPE.captionStrong, color: COLORS.textMedium, marginBottom: SPACING.xs },
  referenceImage: { width: '100%', height: 180, borderRadius: RADIUS.md, backgroundColor: COLORS.cardSecondary },
  ratingHeader: { marginTop: SPACING.md, marginBottom: SPACING.sm },
  ratingLabel: { ...TYPE.label, color: COLORS.textDark },
  ratingHint: { ...TYPE.caption, color: COLORS.textMedium },
  ratingRow: { flexDirection: 'row', gap: 6 },
  ratingButton: {
    flex: 1,
    height: TOUCH_TARGET,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  ratingButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  ratingButtonText: { ...TYPE.subheading, color: COLORS.textDark },
  ratingButtonTextActive: { color: COLORS.textInverse },
  naButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: TOUCH_TARGET,
    alignSelf: 'flex-start',
    paddingRight: SPACING.md,
    marginTop: SPACING.xs,
  },
  naButtonActive: {},
  naText: { ...TYPE.label, color: COLORS.textMedium },
  cardActionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
  },
  findingBox: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
  },
  findingTitle: { ...TYPE.captionStrong, color: COLORS.danger },
  findingText: { ...TYPE.body, color: COLORS.textDark, marginTop: 2 },
  noteBox: { marginTop: SPACING.md },
  noteInput: { minHeight: 72 },

  // Evidence thumbnails
  evidenceThumbRow: { gap: SPACING.sm, paddingTop: SPACING.md },
  evidenceThumbCard: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardSecondary,
  },
  evidenceThumbImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  evidenceThumbBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(29,39,51,0.75)',
    borderRadius: RADIUS.xs,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  evidenceThumbBadgeText: { ...TYPE.caption, color: COLORS.textInverse },
  evidenceThumbDeleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(29,39,51,0.75)',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    backgroundColor: COLORS.card,
    paddingHorizontal: SPACING.screen,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    ...SHADOWS.nav,
  },
  bottomBarInfo: { justifyContent: 'center' },
  bottomBarLabel: { ...TYPE.caption, color: COLORS.textMedium },
  bottomBarScore: { ...TYPE.title, color: COLORS.textDark },

  // Bottom sheets
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(29,39,51,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.screen,
    paddingTop: SPACING.sm,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  sheetTall: { maxHeight: '94%' },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.borderDark,
    marginBottom: SPACING.md,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, marginBottom: SPACING.lg },
  sheetTitle: { ...TYPE.heading, color: COLORS.textDark, flex: 1 },
  sheetSubtitle: { ...TYPE.caption, color: COLORS.textMedium, marginTop: 2 },
  closeBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -10,
    marginRight: -10,
  },
  sheetCancel: { marginTop: SPACING.md },

  // Photo source items
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 64,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  sourceItemPressed: { backgroundColor: COLORS.primarySoft },
  sourceIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceTitle: { ...TYPE.bodyStrong, color: COLORS.textDark },
  sourceDesc: { ...TYPE.caption, color: COLORS.textMedium, marginTop: 2 },

  // Finding editor
  severityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  removeFindingBtn: { marginTop: SPACING.sm },

  // Review and sign-off
  scoreSummaryCard: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    marginBottom: SPACING.lg,
  },
  scoreSummaryLabel: { ...TYPE.label, color: COLORS.textMedium },
  scoreSummaryNumber: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: COLORS.primary, marginTop: 2 },
  scoreSummaryMeta: { ...TYPE.caption, color: COLORS.textMedium, marginTop: 2, textAlign: 'center' },
  scoreSummaryCap: { ...TYPE.captionStrong, color: COLORS.danger, marginTop: SPACING.sm, textAlign: 'center' },
  blockerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    marginBottom: SPACING.lg,
  },
  blockerTitle: { ...TYPE.label, color: COLORS.warning },
  blockerText: { ...TYPE.caption, color: COLORS.textDark, marginTop: 2 },
  blockerAction: { ...TYPE.label, color: COLORS.primaryLight, alignSelf: 'center' },
  signatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 56,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  signName: { ...TYPE.bodyStrong, color: COLORS.textDark },
  signRole: { ...TYPE.caption, color: COLORS.textMedium, marginTop: 2 },
  signOffActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  submitHint: { ...TYPE.caption, color: COLORS.textMedium, textAlign: 'center', marginTop: SPACING.sm },
});

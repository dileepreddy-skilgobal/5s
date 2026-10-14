import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SHADOWS } from '../constants/theme';
import {
  AuditExecution,
  FiveSCategory,
  FiveSQuestion,
  Observation,
  PhotoAnnotation,
  QuestionAnswer,
  SeverityLevel,
} from '../types';
import { MOCK_QUESTIONS } from '../constants/mockData';
import { PhotoAnnotatorModal } from './PhotoAnnotatorModal';
import { useUser } from '../context/UserContext';
import { useResponsive } from '../hooks/useResponsive';

interface AuditExecutionModalProps {
  visible: boolean;
  audit: AuditExecution;
  onClose: () => void;
  onSubmit: (completedAudit: AuditExecution) => void;
}

const CATEGORIES: { key: FiveSCategory; label: string; full: string }[] = [
  { key: 'S1', label: '1S Sort', full: '1S — Sort (Seiri)' },
  { key: 'S2', label: '2S Order', full: '2S — Set In Order (Seiton)' },
  { key: 'S3', label: '3S Shine', full: '3S — Shine (Seiso)' },
  { key: 'S4', label: '4S Standard', full: '4S — Standardize (Seiketsu)' },
  { key: 'S5', label: '5S Sustain', full: '5S — Sustain (Shitsuke)' },
];

export const AuditExecutionModal: React.FC<AuditExecutionModalProps> = ({
  visible,
  audit,
  onClose,
  onSubmit,
}) => {
  const { currentUser } = useUser();
  const { isTablet } = useResponsive();
  const [activeCategory, setActiveCategory] = useState<FiveSCategory>('S1');
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>(audit.answers || {});
  const [observations, setObservations] = useState<Observation[]>(audit.observations || []);
  const [expandedGuidance, setExpandedGuidance] = useState<Record<string, boolean>>({});
  const [showStandardImage, setShowStandardImage] = useState<Record<string, boolean>>({});

  // Observation creation modal state
  const [observationModalQuestion, setObservationModalQuestion] = useState<FiveSQuestion | null>(null);
  const [obsSeverity, setObsSeverity] = useState<SeverityLevel>('MODERATE');
  const [obsDesc, setObsDesc] = useState('');
  const [obsRootCause, setObsRootCause] = useState('Machine / Equipment');

  // Photo annotator modal state
  const [annotatorVisible, setAnnotatorVisible] = useState(false);
  const [currentAnnotatingQuestionId, setCurrentAnnotatingQuestionId] = useState<string | null>(null);
  const [currentPhotoUri, setCurrentPhotoUri] = useState<string | null>(null);
  const [photoSourceModalVisible, setPhotoSourceModalVisible] = useState(false);

  // Sign-off modal state
  const [showSignOffModal, setShowSignOffModal] = useState(false);
  const [auditorSigned, setAuditorSigned] = useState(true);
  const [areaOwnerSigned, setAreaOwnerSigned] = useState(true);

  // Filter questions for the active category
  const currentQuestions = useMemo(() => {
    return MOCK_QUESTIONS.filter((q) => q.category === activeCategory);
  }, [activeCategory]);

  // Dynamic Live Score Calculation Engine
  const scoreStats = useMemo(() => {
    let totalScoreObtained = 0;
    let totalMaxScore = 0;
    let hasCriticalZero = false;

    MOCK_QUESTIONS.forEach((q) => {
      const ans = answers[q.id];
      if (ans && !ans.isNa) {
        totalScoreObtained += ans.score * q.weightage;
        totalMaxScore += 5 * q.weightage;
        if (q.isCritical && ans.score <= 1) {
          hasCriticalZero = true;
        }
      }
    });

    const rawScore = totalMaxScore > 0 ? Math.round((totalScoreObtained / totalMaxScore) * 100) : 85;
    // Cap score at 75% if a critical question failed
    const finalScore = hasCriticalZero ? Math.min(rawScore, 75) : rawScore;

    return {
      percentage: finalScore,
      hasCriticalZero,
      answeredCount: Object.keys(answers).length,
      totalCount: MOCK_QUESTIONS.length,
    };
  }, [answers]);

  const handleScoreChange = (questionId: string, score: number, category: FiveSCategory) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        questionId,
        category,
        score,
        maxScore: 5,
        isNa: false,
        comment: prev[questionId]?.comment || '',
        evidence: prev[questionId]?.evidence || [],
      },
    }));
  };

  const handleAddEvidencePhoto = (questionId: string) => {
    setCurrentAnnotatingQuestionId(questionId);
    setPhotoSourceModalVisible(true);
  };

  const handleLaunchCamera = async (questionId?: string) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Camera Permission Needed',
          'Please allow camera permissions in device settings to take defect photos.'
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        if (questionId) setCurrentAnnotatingQuestionId(questionId);
        setCurrentPhotoUri(result.assets[0].uri);
        setPhotoSourceModalVisible(false);
        setAnnotatorVisible(true);
      }
    } catch (err) {
      console.warn('Camera capture error:', err);
      Alert.alert('Camera Error', 'Could not open device camera.');
    }
  };

  const handlePickFromGallery = async (questionId?: string) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photo Library Permission Needed',
          'Please allow photo library access in device settings to pick photos.'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        if (questionId) setCurrentAnnotatingQuestionId(questionId);
        setCurrentPhotoUri(result.assets[0].uri);
        setPhotoSourceModalVisible(false);
        setAnnotatorVisible(true);
      }
    } catch (err) {
      console.warn('Gallery pick error:', err);
      Alert.alert('Gallery Error', 'Could not open photo library.');
    }
  };

  const handleDeleteEvidence = (questionId: string, photoId: string) => {
    setAnswers((prev) => {
      const existing = prev[questionId];
      if (!existing) return prev;
      return {
        ...prev,
        [questionId]: {
          ...existing,
          evidence: existing.evidence.filter((e) => e.id !== photoId),
        },
      };
    });
  };

  const handleSaveAnnotation = (annotations: PhotoAnnotation[], updatedPhotoUri?: string) => {
    if (!currentAnnotatingQuestionId) return;

    setAnswers((prev) => {
      const existing = prev[currentAnnotatingQuestionId] || {
        questionId: currentAnnotatingQuestionId,
        category: activeCategory,
        score: 3,
        maxScore: 5,
        isNa: false,
        comment: '',
        evidence: [],
      };

      const newPhoto = {
        id: `ev-${Date.now()}`,
        uri:
          updatedPhotoUri ||
          currentPhotoUri ||
          'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        annotations,
      };

      return {
        ...prev,
        [currentAnnotatingQuestionId]: {
          ...existing,
          evidence: [...existing.evidence, newPhoto],
        },
      };
    });
    setAnnotatorVisible(false);
  };

  const handleOpenObservationModal = (q: FiveSQuestion) => {
    setObservationModalQuestion(q);
    setObsDesc(`Non-conformance observed in ${q.title}`);
    setObsSeverity(q.isCritical ? 'MAJOR' : 'MODERATE');
  };

  const handleSaveObservation = () => {
    if (!observationModalQuestion) return;

    // SLA target calculation based on severity
    let targetDays = 7;
    if (obsSeverity === 'CRITICAL') targetDays = 1;
    if (obsSeverity === 'MAJOR') targetDays = 3;
    if (obsSeverity === 'MINOR') targetDays = 15;

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + targetDays);

    const newObs: Observation = {
      id: `obs-${Date.now()}`,
      auditId: audit.id,
      questionId: observationModalQuestion.id,
      category: observationModalQuestion.category,
      areaId: audit.locationId,
      areaName: audit.locationName,
      description: obsDesc,
      severity: obsSeverity,
      risk: obsSeverity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
      assignedTo: 'Area Supervisor',
      targetDate: targetDate.toLocaleDateString('en-GB'),
      rootCauseCategory: obsRootCause,
      status: 'OPEN',
      evidencePhotos: ['mock-photo-uri'],
    };

    setObservations((prev) => [...prev, newObs]);
    setObservationModalQuestion(null);
    Alert.alert('Observation Created', `Observation raised with ${targetDays}-day SLA target closure.`);
  };

  const auditorDisplayName = `${currentUser.firstName} ${currentUser.lastName} (${currentUser.jobTitle})`;
  const areaOwnerDisplayName = `${audit.locationName} Supervisor`;

  const computePillarScore = (cat: FiveSCategory): number => {
    const catQuestions = MOCK_QUESTIONS.filter((q) => q.category === cat);
    if (catQuestions.length === 0) return 80;
    let earned = 0;
    let max = 0;
    catQuestions.forEach((q) => {
      const a = answers[q.id];
      if (a && !a.isNa) {
        earned += a.score * q.weightage;
        max += 5 * q.weightage;
      } else if (!a) {
        earned += 4 * q.weightage;
        max += 5 * q.weightage;
      }
    });
    return max > 0 ? Math.round((earned / max) * 100) : 80;
  };

  const handleFinalSubmit = () => {
    const todayFormatted = new Date().toLocaleDateString('en-GB');
    const completedAudit: AuditExecution = {
      ...audit,
      status: 'COMPLETED',
      statusBadge: 'Completed',
      overallScore: scoreStats.percentage,
      pillarScores: {
        S1: computePillarScore('S1'),
        S2: computePillarScore('S2'),
        S3: computePillarScore('S3'),
        S4: computePillarScore('S4'),
        S5: computePillarScore('S5'),
      },
      answers,
      observations,
      auditorSignature: `Signed by ${auditorDisplayName} on ${todayFormatted}`,
      areaOwnerSignature: `Signed by ${areaOwnerDisplayName} on ${todayFormatted}`,
      completedAt: new Date().toISOString(),
      timeline: [
        { label: 'Area Verified', timestamp: '09:15 AM', isCompleted: true, isActive: false },
        { label: 'Inspection', timestamp: 'S1–S5 Completed', isCompleted: true, isActive: false },
        { label: 'CAPA Review', timestamp: '10:00 AM', isCompleted: true, isActive: false },
        { label: 'Signed Off', timestamp: '10:30 AM', isCompleted: true, isActive: true },
      ],
    };

    setShowSignOffModal(false);
    onSubmit(completedAudit);
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View style={[styles.modalContainer, isTablet && styles.tabletModalContainer]}>
        {/* Top Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={COLORS.textDark} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTracking}>{audit.trackingNumber}</Text>
            <Text style={styles.headerLocation}>{audit.locationName}</Text>
          </View>
          <View style={styles.liveScoreBadge}>
            <Text style={styles.liveScoreText}>{scoreStats.percentage}%</Text>
          </View>
        </View>

        {/* 5S Pillar Tabs (S1 to S5) */}
        <View style={styles.pillarTabs}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.pillarTabItem,
                activeCategory === cat.key && styles.pillarTabItemActive,
              ]}
              onPress={() => setActiveCategory(cat.key)}
            >
              <Text
                style={[
                  styles.pillarTabText,
                  activeCategory === cat.key && styles.pillarTabTextActive,
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Critical score cap warning if triggered */}
        {scoreStats.hasCriticalZero && (
          <View style={styles.criticalBanner}>
            <Ionicons name="warning" size={16} color="#DC2626" />
            <Text style={styles.criticalBannerText}>
              Critical question failed: Score capped at 75% max per standard.
            </Text>
          </View>
        )}

        {/* Question Checklist */}
        <ScrollView contentContainerStyle={styles.checklistContent} showsVerticalScrollIndicator={false}>
          {currentQuestions.map((q, idx) => {
            const currentAns = answers[q.id];
            const currentScore = currentAns ? currentAns.score : 0;
            const hasGuidance = expandedGuidance[q.id];
            const hasStdImage = showStandardImage[q.id];

            return (
              <View key={q.id} style={[styles.questionCard, SHADOWS.card]}>
                {/* Question Header */}
                <View style={styles.qHeader}>
                  <View style={styles.qHeaderLeft}>
                    <View style={styles.qNumberBadge}>
                      <Text style={styles.qNumberText}>#{idx + 1}</Text>
                    </View>
                    <Text style={styles.qTitle}>{q.title}</Text>
                  </View>
                  {q.isCritical && (
                    <View style={styles.criticalPill}>
                      <Text style={styles.criticalPillText}>CRITICAL</Text>
                    </View>
                  )}
                </View>

                {/* Question Text */}
                <Text style={styles.qText}>{q.question}</Text>

                {/* SOP Standard guidance toggle */}
                <View style={styles.guidanceRow}>
                  <TouchableOpacity
                    style={styles.guidanceToggle}
                    onPress={() =>
                      setExpandedGuidance((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                    }
                  >
                    <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.guidanceToggleText}>
                      {hasGuidance ? 'Hide SOP Guidance' : 'View SOP Guidance'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.guidanceToggle}
                    onPress={() =>
                      setShowStandardImage((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                    }
                  >
                    <Ionicons name="image-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.guidanceToggleText}>
                      {hasStdImage ? 'Hide Visual Std' : 'Standard vs Current'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Guidance Expanded Content */}
                {hasGuidance && (
                  <View style={styles.guidanceBox}>
                    <Text style={styles.guidanceText}>{q.guidance}</Text>
                  </View>
                )}

                {/* Standard vs Current Visual Comparator */}
                {hasStdImage && (
                  <View style={styles.comparatorBox}>
                    <View style={styles.compareCol}>
                      <View style={styles.compareHeaderGood}>
                        <Ionicons name="checkmark-circle" size={14} color="#059669" />
                        <Text style={styles.compareHeaderTextGood}>Approved Standard</Text>
                      </View>
                      <View style={styles.comparePlaceholderGood}>
                        <Ionicons name="sparkles" size={28} color="#059669" />
                        <Text style={styles.compareSub}>Clean Shadow Board & Yellow Floor Tape</Text>
                      </View>
                    </View>
                    <View style={styles.compareCol}>
                      <View style={styles.compareHeaderBad}>
                        <Ionicons name="camera" size={14} color={COLORS.primary} />
                        <Text style={styles.compareHeaderTextBad}>Shopfloor Current</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.comparePlaceholderBad}
                        onPress={() => handleAddEvidencePhoto(q.id)}
                      >
                        <Ionicons name="add-circle" size={28} color={COLORS.primary} />
                        <Text style={styles.compareSub}>Tap to capture shopfloor photo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Score Selector (0 to 5 Star Rating) */}
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreRowLabel}>Score Rating (0 - 5):</Text>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((val) => (
                      <TouchableOpacity
                        key={val}
                        style={[
                          styles.starButton,
                          currentScore >= val && styles.starButtonActive,
                        ]}
                        onPress={() => handleScoreChange(q.id, val, q.category)}
                      >
                        <Text
                          style={[
                            styles.starButtonText,
                            currentScore >= val && styles.starButtonTextActive,
                          ]}
                        >
                          {val}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Evidence and Observation Action Bar */}
                <View style={styles.cardActionsRow}>
                  <TouchableOpacity
                    style={styles.evidenceBtn}
                    onPress={() => handleAddEvidencePhoto(q.id)}
                  >
                    <Ionicons name="camera" size={16} color={COLORS.primary} />
                    <Text style={styles.evidenceBtnText}>
                      Evidence Photo ({currentAns?.evidence?.length || 0})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.observationBtn}
                    onPress={() => handleOpenObservationModal(q)}
                  >
                    <Ionicons name="warning-outline" size={16} color="#DC2626" />
                    <Text style={styles.observationBtnText}>Raise Observation</Text>
                  </TouchableOpacity>
                </View>

                {/* Evidence Photo Thumbnails Strip */}
                {currentAns?.evidence && currentAns.evidence.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.evidenceThumbScroll}
                  >
                    {currentAns.evidence.map((ev, evIdx) => (
                      <View key={ev.id || evIdx} style={styles.evidenceThumbCard}>
                        <Image source={{ uri: ev.uri }} style={styles.evidenceThumbImage} />
                        <View style={styles.evidenceThumbBadge}>
                          <Ionicons name="brush" size={10} color="#FFFFFF" />
                          <Text style={styles.evidenceThumbBadgeText}>
                            {ev.annotations?.length || 0} marks
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.evidenceThumbDeleteBtn}
                          onPress={() => handleDeleteEvidence(q.id, ev.id)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="close" size={11} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Bottom Review & Submit Bar */}
        <View style={styles.bottomBar}>
          <View style={styles.bottomBarInfo}>
            <Text style={styles.bottomBarLabel}>Overall 5S Score</Text>
            <Text style={styles.bottomBarScore}>{scoreStats.percentage}%</Text>
          </View>
          <TouchableOpacity
            style={styles.submitAuditBtn}
            onPress={() => setShowSignOffModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-done" size={20} color="#FFFFFF" />
            <Text style={styles.submitAuditBtnText}>Review &amp; Sign Off</Text>
          </TouchableOpacity>
        </View>

        {/* Photo Annotation Modal */}
        <PhotoAnnotatorModal
          visible={annotatorVisible}
          photoUri={currentPhotoUri}
          onClose={() => setAnnotatorVisible(false)}
          onSave={handleSaveAnnotation}
        />

        {/* Photo Source Selector Action Sheet */}
        <Modal visible={photoSourceModalVisible} transparent animationType="fade">
          <View style={styles.photoSourceBackdrop}>
            <View style={[styles.photoSourceCard, SHADOWS.card]}>
              <View style={styles.photoSourceHeader}>
                <View>
                  <Text style={styles.photoSourceTitle}>Capture 5S Evidence</Text>
                  <Text style={styles.photoSourceSubtitle}>Document shopfloor abnormality or standard</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setPhotoSourceModalVisible(false)}
                  style={styles.photoSourceCloseBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color={COLORS.textDark} />
                </TouchableOpacity>
              </View>

              <View style={styles.photoSourceOptions}>
                {/* 1. Camera */}
                <TouchableOpacity
                  style={styles.photoSourceItem}
                  onPress={() => handleLaunchCamera()}
                  activeOpacity={0.8}
                >
                  <View style={[styles.photoSourceIconBox, { backgroundColor: '#FFF2EB' }]}>
                    <Ionicons name="camera" size={22} color={COLORS.primary} />
                  </View>
                  <View style={styles.photoSourceTextWrap}>
                    <Text style={styles.photoSourceItemTitle}>Take Photo with Camera</Text>
                    <Text style={styles.photoSourceItemDesc}>Snap live photo of workstation with camera</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>

                {/* 2. Photo Gallery */}
                <TouchableOpacity
                  style={styles.photoSourceItem}
                  onPress={() => handlePickFromGallery()}
                  activeOpacity={0.8}
                >
                  <View style={[styles.photoSourceIconBox, { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="images" size={22} color="#2563EB" />
                  </View>
                  <View style={styles.photoSourceTextWrap}>
                    <Text style={styles.photoSourceItemTitle}>Choose from Photo Gallery</Text>
                    <Text style={styles.photoSourceItemDesc}>Pick existing shopfloor photo from library</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.photoSourceCancelBtn}
                onPress={() => setPhotoSourceModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.photoSourceCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Observation Creation Modal */}
        {observationModalQuestion && (
          <Modal visible={true} transparent animationType="fade">
            <View style={styles.innerModalBackdrop}>
              <View style={styles.obsModalBox}>
                <View style={styles.obsModalHeader}>
                  <Text style={styles.obsModalTitle}>Raise Observation / CAPA</Text>
                  <TouchableOpacity onPress={() => setObservationModalQuestion(null)}>
                    <Ionicons name="close" size={22} color={COLORS.textDark} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.obsFieldLabel}>Severity Level</Text>
                <View style={styles.severityRow}>
                  {(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] as SeverityLevel[]).map((lvl) => (
                    <TouchableOpacity
                      key={lvl}
                      style={[
                        styles.severityPill,
                        obsSeverity === lvl && styles.severityPillActive,
                      ]}
                      onPress={() => setObsSeverity(lvl)}
                    >
                      <Text
                        style={[
                          styles.severityText,
                          obsSeverity === lvl && styles.severityTextActive,
                        ]}
                      >
                        {lvl}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.obsFieldLabel}>Description</Text>
                <TextInput
                  style={styles.obsInput}
                  value={obsDesc}
                  onChangeText={setObsDesc}
                  multiline
                />

                <Text style={styles.obsFieldLabel}>Root Cause Analysis Category</Text>
                <TextInput
                  style={styles.obsInputSingle}
                  value={obsRootCause}
                  onChangeText={setObsRootCause}
                />

                <TouchableOpacity style={styles.obsSubmitBtn} onPress={handleSaveObservation}>
                  <Text style={styles.obsSubmitBtnText}>Create Action &amp; Set SLA</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

        {/* Dual Sign-off & Submission Modal */}
        <Modal visible={showSignOffModal} transparent animationType="slide">
          <View style={styles.innerModalBackdrop}>
            <View style={styles.signOffBox}>
              <Text style={styles.signOffTitle}>Audit Completion &amp; Dual Sign-Off</Text>
              <Text style={styles.signOffSubtitle}>
                Formal dual verification sign-off between Senior Auditor and Area Champion
              </Text>

              <View style={styles.scoreSummaryCard}>
                <Text style={styles.scoreSummaryNumber}>{scoreStats.percentage}%</Text>
                <Text style={styles.scoreSummaryLabel}>
                  {scoreStats.percentage >= 80 ? 'CONFORMANT (PASS)' : 'NEEDS ACTION (FAIL)'}
                </Text>
                <Text style={styles.scoreSummaryObservations}>
                  {observations.length} Observations • {Object.keys(answers).length} Questions Checked
                </Text>
              </View>

              {/* Auditor Sign-off */}
              <TouchableOpacity
                style={styles.signatureRow}
                onPress={() => setAuditorSigned(!auditorSigned)}
              >
                <Ionicons
                  name={auditorSigned ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={COLORS.primary}
                />
                <View style={styles.signInfo}>
                  <Text style={styles.signName}>{auditorDisplayName}</Text>
                  <Text style={styles.signRole}>Digital Sign-off Verified</Text>
                </View>
              </TouchableOpacity>

              {/* Area Owner Sign-off */}
              <TouchableOpacity
                style={styles.signatureRow}
                onPress={() => setAreaOwnerSigned(!areaOwnerSigned)}
              >
                <Ionicons
                  name={areaOwnerSigned ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={COLORS.primary}
                />
                <View style={styles.signInfo}>
                  <Text style={styles.signName}>{areaOwnerDisplayName}</Text>
                  <Text style={styles.signRole}>Acknowledged Findings &amp; SLA</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.signOffActions}>
                <TouchableOpacity
                  style={styles.cancelSignBtn}
                  onPress={() => setShowSignOffModal(false)}
                >
                  <Text style={styles.cancelSignBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmSignBtn}
                  onPress={handleFinalSubmit}
                >
                  <Text style={styles.confirmSignBtnText}>Submit &amp; Sync Audit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },
  tabletModalContainer: {
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  backButton: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTracking: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  headerLocation: {
    fontSize: 12,
    color: COLORS.textMedium,
  },
  liveScoreBadge: {
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  liveScoreText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  pillarTabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  pillarTabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  pillarTabItemActive: {
    backgroundColor: COLORS.primary,
  },
  pillarTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMedium,
  },
  pillarTabTextActive: {
    color: '#FFFFFF',
  },
  criticalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  criticalBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    flex: 1,
  },
  checklistContent: {
    padding: 16,
    paddingBottom: 90,
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F2F4F7',
  },
  qHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  qHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  qNumberBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  qNumberText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  qTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textDark,
    flex: 1,
  },
  criticalPill: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  criticalPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#DC2626',
  },
  qText: {
    fontSize: 13,
    color: COLORS.textMedium,
    lineHeight: 18,
    marginBottom: 12,
  },
  guidanceRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  guidanceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  guidanceToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  guidanceBox: {
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FFEDD5',
    marginBottom: 12,
  },
  guidanceText: {
    fontSize: 11,
    color: '#9A3412',
    lineHeight: 15,
  },
  comparatorBox: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  compareCol: {
    flex: 1,
  },
  compareHeaderGood: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  compareHeaderTextGood: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  comparePlaceholderGood: {
    height: 80,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  compareHeaderBad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  compareHeaderTextBad: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },
  comparePlaceholderBad: {
    height: 80,
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  compareSub: {
    fontSize: 9,
    color: COLORS.textMedium,
    textAlign: 'center',
    marginTop: 4,
  },
  scoreRow: {
    marginBottom: 14,
  },
  scoreRowLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 6,
  },
  starRow: {
    flexDirection: 'row',
    gap: 8,
  },
  starButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  starButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  starButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  starButtonTextActive: {
    color: '#FFFFFF',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  evidenceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  evidenceBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  observationBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  observationBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0F2F5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 8,
  },
  bottomBarInfo: {
    justifyContent: 'center',
  },
  bottomBarLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  bottomBarScore: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
  },
  submitAuditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    gap: 8,
  },
  submitAuditBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  innerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  obsModalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
  },
  obsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  obsModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  obsFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textDark,
    marginTop: 10,
    marginBottom: 6,
  },
  severityRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  severityPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  severityPillActive: {
    backgroundColor: '#DC2626',
  },
  severityText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  severityTextActive: {
    color: '#FFFFFF',
  },
  obsInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    height: 60,
    textAlignVertical: 'top',
  },
  obsInputSingle: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
  },
  obsSubmitBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  obsSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  signOffBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
  },
  signOffTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  signOffSubtitle: {
    fontSize: 11,
    color: COLORS.textMedium,
    marginTop: 4,
    marginBottom: 14,
  },
  scoreSummaryCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginBottom: 16,
  },
  scoreSummaryNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.primary,
  },
  scoreSummaryLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9A3412',
    marginTop: 2,
  },
  scoreSummaryObservations: {
    fontSize: 11,
    color: COLORS.textMedium,
    marginTop: 4,
  },
  signatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  signInfo: {
    flex: 1,
  },
  signName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  signRole: {
    fontSize: 11,
    color: '#059669',
  },
  signOffActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  cancelSignBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
  },
  cancelSignBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMedium,
  },
  confirmSignBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  confirmSignBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // Evidence thumbnail strip styles
  evidenceThumbScroll: {
    marginTop: 10,
    flexDirection: 'row',
  },
  evidenceThumbCard: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
  },
  evidenceThumbImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  evidenceThumbBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  evidenceThumbBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  evidenceThumbDeleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#EF4444',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Photo Source Picker Action Sheet styles
  photoSourceBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  photoSourceCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  photoSourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  photoSourceTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  photoSourceSubtitle: {
    fontSize: 12,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  photoSourceCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoSourceOptions: {
    gap: 10,
    marginBottom: 16,
  },
  photoSourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  photoSourceIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  photoSourceTextWrap: {
    flex: 1,
  },
  photoSourceItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  photoSourceItemDesc: {
    fontSize: 11,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  photoSourceCancelBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoSourceCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMedium,
  },
});

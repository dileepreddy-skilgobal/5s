import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { TrainingCourse, QuizQuestion, QuizSubmissionResult, TrainingCertificate } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { OnboardingVideoModal } from '../../components/common/OnboardingVideoModal';
import {
  GraduationCap,
  PlayCircle,
  CheckCircle2,
  FileText,
  Clock,
  Award,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Printer,
  Download,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  AlertTriangle,
  FileCheck,
  Video,
  Layers,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Info,
  Check,
  Share2,
  Bookmark,
  Volume2,
  Maximize2,
  Building,
  Target,
  UserCheck,
  FileSpreadsheet,
} from 'lucide-react';

// Professional Lean Manufacturing Standard Operating Procedures (SOPs)
const COURSE_READING_GUIDES: Record<string, { docNo: string; rev: string; title: string; effectiveDate: string; readTime: string; sections: Array<{ heading: string; points: string[]; note?: string }> }> = {
  'course-5s-foundations': {
    docNo: 'SOP-5S-101',
    rev: 'Rev 3.2',
    title: 'Workplace Organization & Visual Controls Standard (1S - 5S)',
    effectiveDate: 'Jan 2026',
    readTime: '4 min read',
    sections: [
      {
        heading: '1. Seiri (Sort) — 30-Day Material Classification',
        points: [
          'All workstation tooling, raw stock, and work-in-progress must be classified by usage frequency.',
          'Items not utilized in the prior 30 days cannot remain on the active workbench and must be moved to the Red Tag holding area.',
          'Quarantine items receive a standardized tag recording the item description, reason for tagging, and owner within 24 hours.',
        ],
        note: 'Operational Benchmark: If an item is not required for today’s production run, remove it from the immediate reach zone.',
      },
      {
        heading: '2. Seiton (Set in Order) — 30-Second Retrieval Benchmark',
        points: [
          'Workstations must utilize high-density two-color shadow foam cutouts for all standard hand tools.',
          'Workstation travel zones and floor boundaries must adhere to standard colors: Yellow for transit aisles, Green for approved material, and Red for quarantine/scrap.',
          'Tool retrieval and replacement must take under 30 seconds for any standard operation.',
        ],
        note: 'Target: A designated place for everything, and everything in its place—instantly verifiable at a glance.',
      },
      {
        heading: '3. Seiso (Shine) — Autonomous Daily Cleaning Rhythms',
        points: [
          'Cleaning is fundamentally an inspection procedure, not routine janitorial work.',
          'The final 5 minutes of each shift are dedicated to wiping down machine ways, pneumatic couplings, and inspecting for micro-leaks or loose fasteners.',
          'All leaks and abnormal thermal patterns must be logged as 5S abnormalities immediately.',
        ],
      },
      {
        heading: '4. Seiketsu (Standardize) & Shitsuke (Sustain)',
        points: [
          'Visual Kamishibai boards must be posted at each line entrance showing daily audit assignments and rotation schedules.',
          'Shift handover checklists must be signed by both outgoing and incoming area supervisors.',
        ],
      },
    ],
  },
  'course-mobile-auditing': {
    docNo: 'SOP-5S-102',
    rev: 'Rev 2.8',
    title: 'Mobile Gemba Audit Execution & Defect Evidence Protocol',
    effectiveDate: 'Feb 2026',
    readTime: '5 min read',
    sections: [
      {
        heading: '1. Physical Gemba Verification (QR Station Check-in)',
        points: [
          'Auditors must physically scan the QR code affixed to the audit zone pillar before the inspection runner unlocks.',
          'Timestamped verification ensures audits are conducted at the actual workplace (Gemba) rather than remotely.',
        ],
        note: 'Requirement: Verification confirms the physical presence of the auditor on the shop floor.',
      },
      {
        heading: '2. Standardized Scoring Scale (0 to 4 Rubric)',
        points: [
          'Score 4 (Benchmark): Fully compliant with visual controls; zero deviations found.',
          'Score 3 (Compliant): Minor deviation identified and immediately corrected during the audit.',
          'Score 2 (Needs Corrective Action): Recurring clutter, missing labels, or oil seepage requiring formal CAPA.',
          'Score 1 (Critical Deficiency): Obvious safety hazard, blocked exit, or unlabelled chemical container.',
          'Score 0 (Non-Existent): No 5S standard implemented; chaotic condition.',
        ],
      },
      {
        heading: '3. Photographic Evidence Standards',
        points: [
          'Any rating of Score 2 or below requires mandatory photo evidence.',
          'Capture one wide-angle context photo showing the overall workstation, followed by an annotated detail shot.',
          'Use device annotation tools (circle or arrow) to clearly pinpoint the abnormality.',
        ],
      },
    ],
  },
  'course-rca-capa': {
    docNo: 'SOP-5S-103',
    rev: 'Rev 4.0',
    title: 'Ishikawa 6M & 5-Why Corrective Action Protocol (CAPA)',
    effectiveDate: 'Mar 2026',
    readTime: '4 min read',
    sections: [
      {
        heading: '1. Systematic Root Cause Analysis (No "Human Error" Default)',
        points: [
          'Corrective actions that conclude with "re-trained the operator" are rejected by the CI Council.',
          'If an operator performed a step incorrectly, the analysis must uncover why the process or tooling lacked error-proofing (Poka-Yoke).',
        ],
        note: 'Core Principle: Focus on process capability and mechanical safeguards, not individual blame.',
      },
      {
        heading: '2. 5-Why Drill-Down Chain',
        points: [
          'Step 1 (Symptom): Hydraulic oil pooled on machine base.',
          'Step 2: Fitting coupling had a split O-ring.',
          'Step 3: High-pressure vibration degraded standard nitrile material.',
          'Step 4: Maintenance bill-of-materials lacked high-temperature fluorocarbon spec.',
          'Step 5 (Root Cause): Procurement vendor catalogue lacked vibration-resistant engineering classification.',
        ],
      },
      {
        heading: '3. Independent Verification Sign-Off',
        points: [
          'Area Owners complete physical countermeasures and upload verification photos.',
          'Closure requires independent sign-off by a certified 5S auditor after a 7-day observation period.',
        ],
      },
    ],
  },
  'course-red-tag-program': {
    docNo: 'SOP-5S-104',
    rev: 'Rev 2.1',
    title: 'Red Tag Quarantine Holding & Capital Recovery Governance',
    effectiveDate: 'Jan 2026',
    readTime: '3 min read',
    sections: [
      {
        heading: '1. Quarantine Zone Boundaries',
        points: [
          'Red Tag areas must be physically demarcated with heavy-duty red floor tape and a clearly posted inventory tracking board.',
          'Items must be tagged with a physical barcode matching the digital record in the 5S system.',
        ],
      },
      {
        heading: '2. 14-Day Disposition Countdown',
        points: [
          'All quarantined items are subject to a strict 14-calendar-day disposition window.',
          'The weekly plant CI committee evaluates all items for the 8 standard disposition paths: Keep, Relocate, Repair, Return to Supplier, Sell, Scrap, Dispose, or Archive.',
        ],
        note: 'Objective: Free up valuable manufacturing square footage and recover tied-up working capital.',
      },
    ],
  },
};

// Lecture Transcripts with Timestamp Seekers
const COURSE_TRANSCRIPTS: Record<string, Array<{ seconds: number; timestamp: string; speaker: string; text: string }>> = {
  'course-5s-foundations': [
    { seconds: 0, timestamp: '00:00', speaker: 'Sneha Reddy (OpEx Lead)', text: 'Welcome to 5S Foundations. In lean manufacturing, workplace disorder directly impacts throughput, cycle times, and machine reliability.' },
    { seconds: 95, timestamp: '01:35', speaker: 'Sneha Reddy', text: '5S originated within the Toyota Production System as five interdependent principles: Seiri, Seiton, Seiso, Seiketsu, and Shitsuke.' },
    { seconds: 165, timestamp: '02:45', speaker: 'Sneha Reddy', text: 'Let us examine 1S: Sort. The standard guideline is the 30-Day Rule. Any tool, fixture, or material not required in 30 days must be red-tagged and removed.' },
    { seconds: 240, timestamp: '04:00', speaker: 'Sneha Reddy', text: 'Moving unused items to physical quarantine frees up prime operator reach zones and eliminates confusion.' },
    { seconds: 330, timestamp: '05:30', speaker: 'Sneha Reddy', text: 'Now 2S: Set in Order. We adhere to the 30-Second Rule. Every tool must be locatable and returnable in under 30 seconds via custom shadow boards.' },
    { seconds: 420, timestamp: '07:00', speaker: 'Sneha Reddy', text: 'Contrasting dual-color foam boards make missing equipment immediately visible at the close of every shift.' },
    { seconds: 495, timestamp: '08:15', speaker: 'Sneha Reddy', text: '3S: Shine. In lean practice, cleaning is inspection. As you wipe guideways and seals, you identify leaks and loose bolts before machine downtime occurs.' },
    { seconds: 590, timestamp: '09:50', speaker: 'Sneha Reddy', text: '4S: Standardize. Establish standardized color demarcation: yellow for walkways, green for parts, red for scrap, and blue for work-in-progress.' },
    { seconds: 660, timestamp: '11:00', speaker: 'Sneha Reddy', text: 'And 5S: Sustain. Daily 5-minute routines and visual audit schedules ensure standards become natural operational habits.' },
  ],
  'course-mobile-auditing': [
    { seconds: 0, timestamp: '00:00', speaker: 'Vikram Malhotra (Lead Auditor)', text: 'Welcome to Certified Mobile Auditing. 5S audits must be objective, timestamped, and backed by clear photographic evidence.' },
    { seconds: 135, timestamp: '02:15', speaker: 'Vikram Malhotra', text: 'Step one is physical QR check-in. Scanning the station QR code verifies that the audit is conducted on the plant floor at Gemba.' },
    { seconds: 300, timestamp: '05:00', speaker: 'Vikram Malhotra', text: 'When evaluating questions, use the 0 to 4 rubric. Score against the published visual standard rather than subjective perception.' },
    { seconds: 465, timestamp: '07:45', speaker: 'Vikram Malhotra', text: 'Any critical safety hazard—such as a blocked fire exit or exposed electrical cabinet—triggers an immediate zero-tolerance escalation.' },
    { seconds: 570, timestamp: '09:30', speaker: 'Vikram Malhotra', text: 'Upon submission, non-conformances are automatically routed to the designated area owner with clear remediation timelines.' },
  ],
  'course-rca-capa': [
    { seconds: 0, timestamp: '00:00', speaker: 'Dr. Arun Patel (Quality Director)', text: 'Fixing symptoms without addressing root causes leads to recurring abnormalities. We apply the Ishikawa 5-Why methodology.' },
    { seconds: 190, timestamp: '03:10', speaker: 'Dr. Arun Patel', text: 'We evaluate contributing factors across the 6Ms: Machine, Method, Material, Manpower, Measurement, and Milieu.' },
    { seconds: 360, timestamp: '06:00', speaker: 'Dr. Arun Patel', text: 'When drilling down with 5-Why, ensure each step forms a direct causal link. Stop only at a systemic or mechanical root cause.' },
    { seconds: 525, timestamp: '08:45', speaker: 'Dr. Arun Patel', text: 'Permanent countermeasures require Poka-Yoke error-proofing or engineering updates, followed by revision of the active SOP.' },
  ],
  'course-red-tag-program': [
    { seconds: 0, timestamp: '00:00', speaker: 'Pooja Sharma (Plant Coordinator)', text: 'Red Tagging is not a disciplinary measure; it is a mechanism to reclaim valuable plant space and recover idle capital.' },
    { seconds: 120, timestamp: '02:00', speaker: 'Pooja Sharma', text: 'Each item receives a digital tag documenting item description, estimated cost, and the operational reason for quarantine.' },
    { seconds: 255, timestamp: '04:15', speaker: 'Pooja Sharma', text: 'Quarantine zones maintain a 14-day aging clock where cross-functional teams decide the final disposition path.' },
    { seconds: 390, timestamp: '06:30', speaker: 'Pooja Sharma', text: 'Through scrap recovery and tooling reallocation, plants regularly unlock valuable floor space and working capital.' },
  ],
};

export const TrainingAcademyPage: React.FC = () => {
  const { currentTenant, currentUser, addToast } = useApp();

  // Navigation Tabs: Curriculum, Video Lecture Player, Competency Assessment, Verified Certificate
  const [activeTab, setActiveTab] = useState<'syllabus' | 'player' | 'exam' | 'certificate'>('syllabus');

  // Courses & Lesson State
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<TrainingCourse | null>(null);
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number>(0);
  const [selectedLessonType, setSelectedLessonType] = useState<'video' | 'reading'>('video');

  // Progress Tracking
  const [completedCourseIds, setCompletedCourseIds] = useState<string[]>(['course-5s-foundations']);
  const [completedLessonKeys, setCompletedLessonKeys] = useState<Record<string, boolean>>({
    'course-5s-foundations-ch-0': true,
    'course-5s-foundations-ch-1': true,
    'course-5s-foundations-reading': true,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [tourModalOpen, setTourModalOpen] = useState<boolean>(false);

  // Video State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [playerTab, setPlayerTab] = useState<'overview' | 'transcript' | 'resources' | 'notes'>('overview');

  // Personal Study Notes
  const [notes, setNotes] = useState<string>(() => {
    return localStorage.getItem('5s_training_personal_notes') || '• 1S sort rule: 30-day unused tools moved to Red Tag area.\n• 2S retrieval benchmark: 30 seconds max using dual-color shadow boards.\n• 3S shine: Cleaning is autonomous inspection for early leak/bolt detection.';
  });
  const [isNotesSaved, setIsNotesSaved] = useState<boolean>(false);

  // Assessment State
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);
  const [quizResult, setQuizResult] = useState<QuizSubmissionResult | null>(null);
  const [submittingQuiz, setSubmittingQuiz] = useState<boolean>(false);

  // Certificate State
  const [certificate, setCertificate] = useState<TrainingCertificate | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [coursesData, questionsData] = await Promise.all([
        api.getTrainingCourses(),
        api.getQuizQuestions(),
      ]);
      setCourses(coursesData);
      if (coursesData.length > 0) {
        setSelectedCourse(coursesData[0]);
      }
      setQuizQuestions(questionsData);
    } catch (err) {
      console.error('Failed to load training data', err);
      addToast({
        type: 'error',
        title: 'Training Load Failed',
        message: 'Could not fetch training modules and quiz questions.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSeekVideo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleChangePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleSelectLesson = (course: TrainingCourse, chapterIdx: number, type: 'video' | 'reading' = 'video') => {
    setSelectedCourse(course);
    setSelectedChapterIdx(chapterIdx);
    setSelectedLessonType(type);
    setActiveTab('player');
    setIsPlaying(false);
  };

  const handleMarkLessonComplete = (lessonKey: string) => {
    setCompletedLessonKeys((prev) => ({
      ...prev,
      [lessonKey]: true,
    }));
    addToast({
      type: 'success',
      title: 'Progress Saved',
      message: 'Lesson marked as completed.',
    });
  };

  const handleMarkCourseComplete = (courseId: string) => {
    if (!completedCourseIds.includes(courseId)) {
      setCompletedCourseIds((prev) => [...prev, courseId]);
      addToast({
        type: 'success',
        title: 'Module Completed',
        message: 'Course module recorded. Continue to next module or take the assessment.',
      });
    }
  };

  const handleSaveNotes = () => {
    localStorage.setItem('5s_training_personal_notes', notes);
    setIsNotesSaved(true);
    setTimeout(() => setIsNotesSaved(false), 2000);
    addToast({
      type: 'info',
      title: 'Notes Saved',
      message: 'Study notes saved to local workspace.',
    });
  };

  const handleSelectAnswer = (questionId: string, optionIdx: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionIdx,
    }));
  };

  const handleSubmitQuiz = async () => {
    const unansweredCount = quizQuestions.filter((q) => answers[q.id] === undefined).length;
    if (unansweredCount > 0) {
      addToast({
        type: 'warning',
        title: 'Incomplete Assessment',
        message: `Please complete all questions before submitting (${unansweredCount} remaining).`,
      });
      return;
    }

    setSubmittingQuiz(true);
    try {
      const result = await api.submitQuiz({
        answers,
        traineeName: currentUser?.fullName || 'Pooja Sharma',
        traineeEmail: currentUser?.email || 'admin@skilglobal.com',
      });
      setQuizResult(result);
      setQuizSubmitted(true);

      if (result.passed) {
        setCertificate(result.certificate || null);
        addToast({
          type: 'success',
          title: 'Assessment Passed',
          message: `Score: ${result.percentage}%. Your 5S Practitioner Certificate has been issued.`,
        });
      } else {
        addToast({
          type: 'error',
          title: 'Passing Score Not Met',
          message: `Score: ${result.percentage}%. 80% is required to pass. Please review explanations and retake.`,
        });
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Submission Failed',
        message: err?.response?.data?.message || 'Could not grade assessment.',
      });
    } finally {
      setSubmittingQuiz(false);
    }
  };

  const handleResetQuiz = () => {
    setAnswers({});
    setQuizSubmitted(false);
    setQuizResult(null);
    setCurrentQuestionIdx(0);
  };

  const handlePrintCertificate = () => {
    document.body.classList.add('print-certificate-only');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('print-certificate-only');
    }, 1000);
  };

  const progressPercentage = Math.round((completedCourseIds.length / (courses.length || 4)) * 100);
  const activeTranscript = selectedCourse ? (COURSE_TRANSCRIPTS[selectedCourse.id] || []) : [];
  const activeReading = selectedCourse ? (COURSE_READING_GUIDES[selectedCourse.id] || null) : null;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ========================================================================= */}
      {/* PROFESSIONAL EXECUTIVE PROGRAM HEADER (CLEAN ENTERPRISE LIGHT DESIGN) */}
      {/* ========================================================================= */}
      <Card noPadding>
        <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
            
            {/* Title & Organization Details */}
            <div style={{ flex: 1, minWidth: 0, maxWidth: '780px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.5px', background: 'var(--color-primary-light)', padding: '3px 8px', borderRadius: 'var(--radius-xs)' }}>
                  Continuous Improvement Academy
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>•</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Building size={13} /> {currentTenant?.name || 'SkilGlobal Precision Manufacturing'}
                </span>
              </div>

              <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px 0', lineHeight: 1.3 }}>
                5S Lean Practitioner Competency &amp; Certification Program
              </h1>

              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Mandatory operational training curriculum covering Sort, Set in Order, Shine, Standardize, and Sustain. Includes mobile Gemba inspection rubrics, non-conformance photo capture, and 5-Why root cause remediation.
              </p>

              {/* Key Program Metadata Badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', marginTop: '14px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Target size={14} color="var(--color-primary)" />
                  <span>Target: <strong>Operators, Area Owners &amp; Auditors</strong></span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} color="var(--color-primary)" />
                  <span>Total Duration: <strong>46 Minutes (4 Modules)</strong></span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Award size={14} color="var(--color-success)" />
                  <span>Passing Standard: <strong>≥ 80% on Final Exam</strong></span>
                </div>
              </div>
            </div>

            {/* Quick Actions & Progress Widget */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px', minWidth: '240px', flexShrink: 0, marginLeft: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Video size={14} />}
                  onClick={() => setTourModalOpen(true)}
                >
                  Quick Tour
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<PlayCircle size={15} />}
                  onClick={() => {
                    if (selectedCourse) {
                      setActiveTab('player');
                    } else if (courses.length > 0) {
                      setSelectedCourse(courses[0]);
                      setActiveTab('player');
                    }
                  }}
                >
                  {completedCourseIds.length > 0 ? 'Resume Training' : 'Start Course 1'}
                </Button>
              </div>

              {/* Program Progress Indicator */}
              <div style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  <span>Program Completion</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{progressPercentage}%</strong>
                </div>
                <ProgressBar value={progressPercentage} height={6} />
                <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', marginTop: '4px', textAlign: 'right' }}>
                  {completedCourseIds.length} of {courses.length || 4} Modules Completed
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* TABS NAVIGATION */}
      {/* ========================================================================= */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', gap: '8px' }}>
        <button
          onClick={() => setActiveTab('syllabus')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '13.5px',
            fontWeight: activeTab === 'syllabus' ? 700 : 500,
            color: activeTab === 'syllabus' ? 'var(--color-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'syllabus' ? '2px solid var(--color-primary)' : '2px solid transparent',
          }}
        >
          <BookOpen size={15} />
          <span>Curriculum &amp; Modules</span>
          <span className="code-tag" style={{ fontSize: '11px' }}>{courses.length || 4}</span>
        </button>

        <button
          onClick={() => {
            if (!selectedCourse && courses.length > 0) {
              setSelectedCourse(courses[0]);
            }
            setActiveTab('player');
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '13.5px',
            fontWeight: activeTab === 'player' ? 700 : 500,
            color: activeTab === 'player' ? 'var(--color-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'player' ? '2px solid var(--color-primary)' : '2px solid transparent',
          }}
        >
          <PlayCircle size={15} />
          <span>Training Player</span>
          {selectedCourse && (
            <Badge variant="info">Module {courses.findIndex((c) => c.id === selectedCourse.id) + 1}</Badge>
          )}
        </button>

        <button
          onClick={() => setActiveTab('exam')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '13.5px',
            fontWeight: activeTab === 'exam' ? 700 : 500,
            color: activeTab === 'exam' ? 'var(--color-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'exam' ? '2px solid var(--color-primary)' : '2px solid transparent',
          }}
        >
          <HelpCircle size={15} />
          <span>Competency Assessment</span>
          {quizResult && (
            <Badge variant={quizResult.passed ? 'success' : 'danger'}>
              {quizResult.percentage}%
            </Badge>
          )}
        </button>

        <button
          onClick={() => setActiveTab('certificate')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '13.5px',
            fontWeight: activeTab === 'certificate' ? 700 : 500,
            color: activeTab === 'certificate' ? 'var(--color-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'certificate' ? '2px solid var(--color-primary)' : '2px solid transparent',
          }}
        >
          <Award size={15} />
          <span>Certification Credential</span>
          {certificate ? (
            <Badge variant="purple">Issued</Badge>
          ) : quizResult?.passed ? (
            <Badge variant="success">Unlocked</Badge>
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>(Locked)</span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CURRICULUM & MODULE CARDS */}
      {/* ========================================================================= */}
      {activeTab === 'syllabus' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {courses.map((course, idx) => {
            const isCompleted = completedCourseIds.includes(course.id);
            const reading = COURSE_READING_GUIDES[course.id];

            return (
              <Card key={course.id} noPadding>
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                    
                    <div style={{ flex: 1, minWidth: '300px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase' }}>
                          Module {idx + 1}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>•</span>
                        <Badge variant={isCompleted ? 'success' : 'neutral'}>
                          {isCompleted ? 'Completed ✓' : course.badgeText}
                        </Badge>
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} /> {course.durationMinutes} min
                        </span>
                      </div>

                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                        {course.title}
                      </h3>

                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                        {course.description}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Button
                        variant={isCompleted ? 'secondary' : 'primary'}
                        size="sm"
                        icon={<PlayCircle size={15} />}
                        onClick={() => handleSelectLesson(course, 0, 'video')}
                      >
                        {isCompleted ? 'Review Module' : 'Launch Module →'}
                      </Button>
                    </div>
                  </div>

                  <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border-subtle)' }} />

                  {/* Module Lessons Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                    {course.chapters.map((ch, chIdx) => {
                      const lessonKey = `${course.id}-ch-${chIdx}`;
                      const isDone = completedLessonKeys[lessonKey] || isCompleted;

                      return (
                        <div
                          key={chIdx}
                          onClick={() => handleSelectLesson(course, chIdx, 'video')}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-surface-subtle)',
                            border: '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <div style={{ color: isDone ? 'var(--color-success)' : 'var(--text-tertiary)', flexShrink: 0 }}>
                              {isDone ? <CheckCircle2 size={15} /> : <PlayCircle size={15} />}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {ch.title}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                Video • {ch.time}
                              </div>
                            </div>
                          </div>
                          <ChevronRight size={13} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                        </div>
                      );
                    })}

                    {reading && (
                      <div
                        onClick={() => handleSelectLesson(course, 0, 'reading')}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-surface-subtle)',
                          border: '1px solid var(--border-subtle)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <div style={{ color: '#8B5CF6', flexShrink: 0 }}>
                            <FileText size={15} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              Standard Operating Procedure
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                              Document • {reading.readTime}
                            </div>
                          </div>
                        </div>
                        <ChevronRight size={13} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {/* Assessment Gate Callout */}
          <Card noPadding>
            <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', background: 'var(--color-primary-light)', borderLeft: '4px solid var(--color-primary)' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Certification Verification Gate
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                  Ready to complete your 5S Practitioner Certification?
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Answer 10 scenario-based assessment questions covering sort criteria, shadow boards, autonomous cleaning, and 5-Why root cause analysis.
                </div>
              </div>

              <Button
                variant="primary"
                icon={<Award size={15} />}
                onClick={() => setActiveTab('exam')}
              >
                Launch Assessment Exam →
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TRAINING PLAYER (2-COLUMN VIDEO / SOP PLAYER) */}
      {/* ========================================================================= */}
      {activeTab === 'player' && selectedCourse && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', alignItems: 'start' }}>
          
          {/* Left Column: Lesson Playlist & Modules */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Card noPadding>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => setActiveTab('syllabus')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 0,
                    marginBottom: '6px',
                  }}
                >
                  <ArrowLeft size={13} /> Back to Modules
                </button>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Active Module
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', lineHeight: 1.3 }}>
                  {selectedCourse.title}
                </div>
              </div>

              {/* Lessons List */}
              <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', padding: '6px 8px' }}>
                  Video Lectures ({selectedCourse.chapters.length})
                </div>

                {selectedCourse.chapters.map((ch, idx) => {
                  const lessonKey = `${selectedCourse.id}-ch-${idx}`;
                  const isCurrent = selectedLessonType === 'video' && selectedChapterIdx === idx;
                  const isDone = completedLessonKeys[lessonKey];

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedChapterIdx(idx);
                        setSelectedLessonType('video');
                        const seconds = parseTimeToSeconds(ch.time);
                        handleSeekVideo(seconds);
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: isCurrent ? 'var(--color-primary-light)' : 'transparent',
                        border: `1px solid ${isCurrent ? 'var(--color-primary)' : 'transparent'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div style={{ color: isDone ? 'var(--color-success)' : isCurrent ? 'var(--color-primary)' : 'var(--text-tertiary)', flexShrink: 0 }}>
                          {isDone ? <CheckCircle2 size={14} /> : <PlayCircle size={14} />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--color-primary)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ch.title}
                          </div>
                          <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
                            {ch.time}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', padding: '10px 8px 4px 8px' }}>
                  Standard Operating Procedure
                </div>

                <div
                  onClick={() => setSelectedLessonType('reading')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: selectedLessonType === 'reading' ? 'var(--color-primary-light)' : 'transparent',
                    border: `1px solid ${selectedLessonType === 'reading' ? 'var(--color-primary)' : 'transparent'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <FileText size={14} color="#8B5CF6" />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: selectedLessonType === 'reading' ? 700 : 500, color: selectedLessonType === 'reading' ? 'var(--color-primary)' : 'var(--text-primary)' }}>
                      Operating SOP Document
                    </div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
                      Standard Guide • 4 min
                    </div>
                  </div>
                </div>

                {/* Other Modules List */}
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', padding: '4px 8px' }}>
                    Switch Module
                  </div>
                  {courses
                    .filter((c) => c.id !== selectedCourse.id)
                    .map((otherCourse) => (
                      <div
                        key={otherCourse.id}
                        onClick={() => {
                          setSelectedCourse(otherCourse);
                          setSelectedChapterIdx(0);
                          setSelectedLessonType('video');
                        }}
                        style={{
                          padding: '7px 8px',
                          borderRadius: 'var(--radius-xs)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11.5px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {otherCourse.title.split(':')[0]}
                        </span>
                        <ChevronRight size={12} />
                      </div>
                    ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column: Player Stage (Video or Reading) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* STAGE 1: VIDEO MODE */}
            {selectedLessonType === 'video' && (
              <Card noPadding>
                {/* 16:9 Video Canvas */}
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '420px',
                    background: '#0F172A',
                    borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <video
                    ref={videoRef}
                    src={selectedCourse.videoUrl}
                    poster={selectedCourse.thumbnailUrl}
                    controls
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => {
                      const lessonKey = `${selectedCourse.id}-ch-${selectedChapterIdx}`;
                      handleMarkLessonComplete(lessonKey);
                      if (selectedChapterIdx === selectedCourse.chapters.length - 1) {
                        handleMarkCourseComplete(selectedCourse.id);
                      }
                    }}
                  />
                </div>

                {/* Sub-bar: Speed & Controls */}
                <div
                  style={{
                    padding: '8px 18px',
                    background: 'var(--bg-surface-subtle)',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                      Speed:
                    </span>
                    {[0.75, 1, 1.25, 1.5].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => handleChangePlaybackRate(rate)}
                        style={{
                          border: 'none',
                          background: playbackRate === rate ? 'var(--color-primary)' : 'transparent',
                          color: playbackRate === rate ? '#FFFFFF' : 'var(--text-secondary)',
                          borderRadius: 'var(--radius-xs)',
                          padding: '2px 6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<CheckCircle2 size={13} />}
                      onClick={() => {
                        const lessonKey = `${selectedCourse.id}-ch-${selectedChapterIdx}`;
                        handleMarkLessonComplete(lessonKey);
                      }}
                    >
                      {completedLessonKeys[`${selectedCourse.id}-ch-${selectedChapterIdx}`] ? 'Completed ✓' : 'Mark Watched'}
                    </Button>

                    {selectedChapterIdx < selectedCourse.chapters.length - 1 ? (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<ArrowRight size={13} />}
                        onClick={() => {
                          const nextIdx = selectedChapterIdx + 1;
                          setSelectedChapterIdx(nextIdx);
                          const seconds = parseTimeToSeconds(selectedCourse.chapters[nextIdx].time);
                          handleSeekVideo(seconds);
                        }}
                      >
                        Next Chapter →
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<FileText size={13} />}
                        onClick={() => setSelectedLessonType('reading')}
                      >
                        Review SOP Document →
                      </Button>
                    )}
                  </div>
                </div>

                {/* Video Info Section */}
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span className="code-tag" style={{ fontSize: '11px', fontWeight: 700 }}>
                      Chapter {selectedChapterIdx + 1}
                    </span>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
                      Timestamp: {selectedCourse.chapters[selectedChapterIdx]?.time}
                    </span>
                  </div>

                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
                    {selectedCourse.chapters[selectedChapterIdx]?.title}
                  </h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    {selectedCourse.chapters[selectedChapterIdx]?.description}
                  </p>

                  {/* Player Tabs: Overview, Transcript, Job Aid, Notes */}
                  <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', gap: '10px', marginTop: '18px' }}>
                    <button
                      onClick={() => setPlayerTab('overview')}
                      style={{
                        padding: '8px 12px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: '12.5px',
                        fontWeight: playerTab === 'overview' ? 700 : 500,
                        color: playerTab === 'overview' ? 'var(--color-primary)' : 'var(--text-secondary)',
                        borderBottom: playerTab === 'overview' ? '2px solid var(--color-primary)' : '2px solid transparent',
                      }}
                    >
                      Operational Takeaways
                    </button>

                    <button
                      onClick={() => setPlayerTab('transcript')}
                      style={{
                        padding: '8px 12px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: '12.5px',
                        fontWeight: playerTab === 'transcript' ? 700 : 500,
                        color: playerTab === 'transcript' ? 'var(--color-primary)' : 'var(--text-secondary)',
                        borderBottom: playerTab === 'transcript' ? '2px solid var(--color-primary)' : '2px solid transparent',
                      }}
                    >
                      Interactive Transcript ({activeTranscript.length})
                    </button>

                    <button
                      onClick={() => setPlayerTab('resources')}
                      style={{
                        padding: '8px 12px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: '12.5px',
                        fontWeight: playerTab === 'resources' ? 700 : 500,
                        color: playerTab === 'resources' ? 'var(--color-primary)' : 'var(--text-secondary)',
                        borderBottom: playerTab === 'resources' ? '2px solid var(--color-primary)' : '2px solid transparent',
                      }}
                    >
                      Standard Job Aid (PDF)
                    </button>

                    <button
                      onClick={() => setPlayerTab('notes')}
                      style={{
                        padding: '8px 12px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: '12.5px',
                        fontWeight: playerTab === 'notes' ? 700 : 500,
                        color: playerTab === 'notes' ? 'var(--color-primary)' : 'var(--text-secondary)',
                        borderBottom: playerTab === 'notes' ? '2px solid var(--color-primary)' : '2px solid transparent',
                      }}
                    >
                      Personal Notes {isNotesSaved && '✓'}
                    </button>
                  </div>

                  {/* Sub-Tab 1: Overview */}
                  {playerTab === 'overview' && (
                    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedCourse.keyTakeaways.map((takeaway, i) => (
                        <div
                          key={i}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--color-success-bg)',
                            border: '1px solid var(--color-success-border)',
                            fontSize: '12.5px',
                            color: 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px',
                            lineHeight: 1.4,
                          }}
                        >
                          <CheckCircle2 size={15} color="var(--color-success)" style={{ flexShrink: 0, marginTop: '2px' }} />
                          <span>{takeaway}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sub-Tab 2: Transcript with Click-to-Seek */}
                  {playerTab === 'transcript' && (
                    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                        Click any timestamp to seek video directly:
                      </div>

                      {activeTranscript.map((line, i) => (
                        <div
                          key={i}
                          onClick={() => handleSeekVideo(line.seconds)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-surface-subtle)',
                            border: '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            display: 'flex',
                            gap: '10px',
                          }}
                        >
                          <span className="code-tag" style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '11px', height: 'fit-content' }}>
                            {line.timestamp}
                          </span>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)' }}>
                              {line.speaker}
                            </div>
                            <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.45, marginTop: '2px' }}>
                              {line.text}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sub-Tab 3: Resources */}
                  {playerTab === 'resources' && (
                    <div style={{ marginTop: '14px' }}>
                      <div
                        style={{
                          padding: '14px 18px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-surface-subtle)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '16px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <FileText size={20} color="var(--color-primary)" />
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {selectedCourse.jobAidTitle}
                            </div>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
                              Official Standard Reference Document
                            </div>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Download size={13} />}
                          onClick={() => {
                            addToast({
                              type: 'info',
                              title: 'Resource Downloaded',
                              message: `Downloaded: ${selectedCourse.jobAidTitle}`,
                            });
                          }}
                        >
                          Download
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 4: Notes */}
                  {playerTab === 'notes' && (
                    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
                          Personal notes saved in your workspace:
                        </span>
                        <Button size="sm" variant="primary" onClick={handleSaveNotes}>
                          Save Notes
                        </Button>
                      </div>

                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={5}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-surface-subtle)',
                          color: 'var(--text-primary)',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          lineHeight: 1.45,
                        }}
                      />
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* STAGE 2: READING SOP MODE */}
            {selectedLessonType === 'reading' && activeReading && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="code-tag" style={{ fontSize: '11px', fontWeight: 700 }}>
                        {activeReading.docNo}
                      </span>
                      <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
                        {activeReading.rev} • Effective {activeReading.effectiveDate}
                      </span>
                    </div>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 0 0' }}>
                      {activeReading.title}
                    </h2>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    icon={<CheckCircle2 size={14} />}
                    onClick={() => {
                      const lessonKey = `${selectedCourse.id}-reading`;
                      handleMarkLessonComplete(lessonKey);
                      handleMarkCourseComplete(selectedCourse.id);
                    }}
                  >
                    Mark SOP Read ✓
                  </Button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {activeReading.sections.map((sec, secIdx) => (
                    <div key={secIdx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        {sec.heading}
                      </h4>

                      <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.55 }}>
                        {sec.points.map((p, pIdx) => (
                          <li key={pIdx} style={{ marginBottom: '3px' }}>{p}</li>
                        ))}
                      </ul>

                      {sec.note && (
                        <div
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-xs)',
                            background: 'var(--color-primary-light)',
                            borderLeft: '3px solid var(--color-primary)',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--color-primary)',
                          }}
                        >
                          {sec.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ArrowLeft size={13} />}
                    onClick={() => setSelectedLessonType('video')}
                  >
                    ← Return to Lecture Video
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Award size={13} />}
                    onClick={() => setActiveTab('exam')}
                  >
                    Proceed to Assessment Exam →
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: COMPETENCY ASSESSMENT EXAM */}
      {/* ========================================================================= */}
      {activeTab === 'exam' && (
        <div style={{ maxWidth: '820px', margin: '0 auto', width: '100%' }}>
          {!quizSubmitted ? (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div>
                  <Badge variant="purple">5S Competency Assessment</Badge>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginLeft: '8px' }}>
                    Question {currentQuestionIdx + 1} of {quizQuestions.length}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  Passing Threshold: <strong>80% (8 / 10 correct)</strong>
                </div>
              </div>

              <ProgressBar
                value={Math.round(((currentQuestionIdx + 1) / (quizQuestions.length || 10)) * 100)}
                height={6}
              />

              {quizQuestions.length > 0 && (
                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <span className="code-tag" style={{ fontSize: '11px', fontWeight: 700 }}>
                      Section: {quizQuestions[currentQuestionIdx].category}
                    </span>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.45, marginTop: '6px' }}>
                      {quizQuestions[currentQuestionIdx].question}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {quizQuestions[currentQuestionIdx].options.map((option, optIdx) => {
                      const currentQId = quizQuestions[currentQuestionIdx].id;
                      const isSelected = answers[currentQId] === optIdx;

                      return (
                        <div
                          key={optIdx}
                          onClick={() => handleSelectAnswer(currentQId, optIdx)}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 'var(--radius-md)',
                            background: isSelected ? 'var(--color-primary-light)' : 'var(--bg-surface-subtle)',
                            border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--text-tertiary)'}`,
                              background: isSelected ? 'var(--color-primary)' : 'transparent',
                              color: isSelected ? '#FFFFFF' : 'var(--text-tertiary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px',
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {String.fromCharCode(65 + optIdx)}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: isSelected ? 600 : 400, lineHeight: 1.4 }}>
                            {option}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '10px' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={currentQuestionIdx === 0}
                      icon={<ArrowLeft size={14} />}
                      onClick={() => setCurrentQuestionIdx((prev) => Math.max(0, prev - 1))}
                    >
                      Previous
                    </Button>

                    <div style={{ display: 'flex', gap: '5px' }}>
                      {quizQuestions.map((q, idx) => {
                        const isAnswered = answers[q.id] !== undefined;
                        const isCurrent = currentQuestionIdx === idx;
                        return (
                          <button
                            key={q.id}
                            onClick={() => setCurrentQuestionIdx(idx)}
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: 'var(--radius-xs)',
                              border: isCurrent ? '2px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                              background: isAnswered ? 'var(--color-primary)' : 'var(--bg-surface-subtle)',
                              color: isAnswered ? '#FFFFFF' : 'var(--text-secondary)',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 700,
                            }}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>

                    {currentQuestionIdx < quizQuestions.length - 1 ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setCurrentQuestionIdx((prev) => Math.min(quizQuestions.length - 1, prev + 1))}
                      >
                        Next <ArrowRight size={14} />
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={submittingQuiz}
                        icon={<CheckCircle2 size={14} />}
                        onClick={handleSubmitQuiz}
                      >
                        Submit Assessment
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ) : (
            /* Results Screen */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Card>
                <div style={{ textAlign: 'center', padding: '20px 16px' }}>
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      background: quizResult?.passed ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                      color: quizResult?.passed ? 'var(--color-success)' : 'var(--color-danger)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '12px',
                    }}
                  >
                    {quizResult?.passed ? <Award size={36} /> : <AlertTriangle size={36} />}
                  </div>

                  <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    {quizResult?.passed ? '5S Competency Certification Passed!' : 'Passing Standard Not Achieved'}
                  </h2>

                  <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '6px auto 0 auto', maxWidth: '580px' }}>
                    {quizResult?.passed
                      ? 'You demonstrated comprehensive technical mastery of the 5S continuous improvement system and Gemba audit methodology.'
                      : 'You scored below the required 80% passing threshold. Review the engineering explanations below and retake the assessment.'}
                  </p>

                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '24px',
                      marginTop: '16px',
                      padding: '12px 24px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Final Score</div>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: quizResult?.passed ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {quizResult?.percentage}%
                      </div>
                    </div>
                    <div style={{ width: '1px', height: '36px', background: 'var(--border-subtle)' }} />
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Questions Correct</div>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {quizResult?.correctCount} / {quizResult?.totalQuestions}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
                    <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={handleResetQuiz}>
                      Retake Exam
                    </Button>
                    {quizResult?.passed && (
                      <Button variant="primary" size="sm" icon={<Award size={14} />} onClick={() => setActiveTab('certificate')}>
                        View Official Credential →
                      </Button>
                    )}
                  </div>
                </div>
              </Card>

              {/* Review Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', paddingLeft: '2px' }}>
                  Question-by-Question Review &amp; Explanations
                </h3>

                {quizResult?.results.map((res, idx) => (
                  <Card key={idx} noPadding>
                    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-tertiary)' }}>
                          Question {idx + 1}
                        </span>
                        <Badge variant={res.isCorrect ? 'success' : 'danger'}>
                          {res.isCorrect ? 'Correct ✓' : 'Incorrect ✗'}
                        </Badge>
                      </div>

                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {res.question}
                      </div>

                      <div style={{ fontSize: '12px', padding: '8px 12px', borderRadius: 'var(--radius-xs)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', lineHeight: 1.45 }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: '2px' }}>
                          Engineering Rationale:
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          {res.explanation}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: OFFICIAL CERTIFICATE */}
      {/* ========================================================================= */}
      {activeTab === 'certificate' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
          
          <div
            className="no-print"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '860px', flexWrap: 'wrap', gap: '12px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="var(--color-success)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Authenticated Certificate Verified by {currentTenant?.name || 'SkilGlobal OpEx Council'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                size="sm"
                icon={<Share2 size={14} />}
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  addToast({
                    type: 'success',
                    title: 'Link Copied',
                    message: 'Verification URL copied to clipboard.',
                  });
                }}
              >
                Share
              </Button>
              <Button variant="primary" size="sm" icon={<Printer size={14} />} onClick={handlePrintCertificate}>
                Print / Save PDF
              </Button>
            </div>
          </div>

          {/* Certificate View Card */}
          <div
            id="printable-5s-certificate"
            style={{
              width: '100%',
              maxWidth: '860px',
              background: '#FFFFFF',
              color: '#0F172A',
              borderRadius: 'var(--radius-xl)',
              border: '8px double #D97706',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              padding: '48px 56px',
              position: 'relative',
              overflow: 'hidden',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '380px',
                height: '380px',
                borderRadius: '50%',
                border: '20px dashed rgba(217, 119, 6, 0.04)',
                pointerEvents: 'none',
              }}
            />

            <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
              {currentTenant?.logoUrl ? (
                <img
                  src={currentTenant.logoUrl}
                  alt={currentTenant.name}
                  style={{ height: '48px', objectFit: 'contain', margin: '0 auto 10px auto', display: 'block' }}
                />
              ) : (
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E3A8A', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                  {currentTenant?.name || 'SKILGLOBAL PRECISION MANUFACTURING'}
                </div>
              )}

              <div style={{ fontSize: '11px', fontWeight: 700, color: '#D97706', letterSpacing: '3px', textTransform: 'uppercase' }}>
                CONTINUOUS IMPROVEMENT &amp; OPERATIONAL EXCELLENCE COUNCIL
              </div>

              <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', margin: '12px 0 4px 0', letterSpacing: '0.5px' }}>
                Certificate of 5S Competency
              </h1>

              <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>
                This is to officially certify that
              </div>

              <div
                style={{
                  fontSize: '26px',
                  fontWeight: 800,
                  color: '#1E3A8A',
                  margin: '16px 0',
                  padding: '8px 0',
                  borderBottom: '2px solid #E2E8F0',
                  display: 'inline-block',
                  minWidth: '380px',
                }}
              >
                {certificate?.traineeName || currentUser?.fullName || 'Pooja Sharma'}
              </div>

              <div style={{ fontSize: '13px', color: '#334155', maxWidth: '580px', margin: '0 auto', lineHeight: 1.6 }}>
                has successfully completed the comprehensive curriculum on <strong>5S Workplace Organization (Sort, Set in Order, Shine, Standardize, Sustain)</strong>, Mobile Audit Execution, Non-Conformance Logging, and 5-Why Root Cause Remediation.
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                marginTop: '40px',
                paddingTop: '24px',
                borderTop: '1px solid #E2E8F0',
                position: 'relative',
                zIndex: 2,
              }}
            >
              <div style={{ textAlign: 'left', fontSize: '11px', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div><strong>Certificate ID:</strong> {certificate?.certificateId || 'CERT-5S-8A4F-2026'}</div>
                <div><strong>Date Awarded:</strong> {new Date().toLocaleDateString()}</div>
                <div><strong>Valid Until:</strong> {new Date(Date.now() + 365 * 86400000).toLocaleDateString()} (1 Year)</div>
                <div><strong>Assessment Score:</strong> {certificate?.scorePercent || quizResult?.percentage || 90}% (Distinction)</div>
              </div>

              <div
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 50%, #B45309 100%)',
                  boxShadow: '0 4px 6px -1px rgba(217, 119, 6, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  textAlign: 'center',
                  padding: '6px',
                }}
              >
                <Award size={22} />
                <span style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                  CERTIFIED
                </span>
              </div>

              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <div style={{ fontFamily: 'cursive', fontSize: '18px', color: '#1E3A8A' }}>Sneha Reddy</div>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#334155' }}>Sneha Reddy</div>
                  <div style={{ fontSize: '9.5px', color: '#64748B' }}>Lead 5S Program Champion</div>
                </div>

                <div>
                  <div style={{ fontFamily: 'cursive', fontSize: '18px', color: '#1E3A8A' }}>Rajesh Kumar</div>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#334155' }}>Rajesh Kumar</div>
                  <div style={{ fontSize: '9.5px', color: '#64748B' }}>Plant Operations Director</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Quick Video Tour Modal */}
      <OnboardingVideoModal
        isOpen={tourModalOpen}
        onClose={() => setTourModalOpen(false)}
      />
    </div>
  );
};

// Helper: Convert MM:SS to seconds for video seeking
function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map((p) => parseInt(p, 10));
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

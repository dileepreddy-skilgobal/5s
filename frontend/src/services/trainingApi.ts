import { apiClient } from './api';
import type { TrainingCertificate } from '../types';

/**
 * Training Academy endpoints whose shapes changed with server-side progress and shuffled quiz options.
 * Certificate endpoints are unchanged and stay on `api` in services/api.ts.
 */

export type TrainingCourseCategory = 'FOUNDATIONS' | 'AUDITING' | 'RCA_CAPA' | 'RED_TAG';

export interface TrainingLesson {
  id: string;
  title: string;
  summary: string;
  /** Start position (mm:ss) inside the course video; only present when the course has a video. */
  videoStart?: string;
}

export interface TrainingCourse {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: TrainingCourseCategory;
  badgeText: string;
  /** Null until a recorded lesson exists; the lessons are then shown as reading material. */
  videoUrl: string | null;
  /** WebVTT captions for the video. */
  captionsUrl: string | null;
  lessons: TrainingLesson[];
  keyTakeaways: string[];
  jobAidTitle: string | null;
  jobAidUrl: string | null;
}

export interface CourseProgress {
  courseId: string;
  completedLessonIds: string[];
  totalLessons: number;
  percent: number;
  completed: boolean;
  completedAt: string | null;
}

export type QuizCategory = '1S' | '2S' | '3S' | '4S' | '5S' | 'AUDIT' | 'CAPA' | 'SAFETY' | 'RED_TAG';

export interface QuizQuestion {
  id: string;
  category: QuizCategory;
  question: string;
  /** Shuffled by the server on every fetch. */
  options: string[];
  points: number;
}

export interface QuizQuestionResult {
  questionId: string;
  question: string;
  /** Text of the option the trainee chose; null when unanswered. */
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
}

export interface QuizSubmissionResult {
  passed: boolean;
  percentage: number;
  score: number;
  maxScore: number;
  passPercent: number;
  correctCount: number;
  totalQuestions: number;
  results: QuizQuestionResult[];
  certificate: TrainingCertificate | null;
  /** True when a passing retake extended the existing valid certificate instead of issuing a new one. */
  certificateRenewed: boolean;
}

// apiClient's response interceptor already unwraps the server's { success, data } envelope
export const trainingApi = {
  getCourses: async (): Promise<TrainingCourse[]> => (await apiClient.get<TrainingCourse[]>('/training/courses')).data,
  getProgress: async (): Promise<CourseProgress[]> => (await apiClient.get<CourseProgress[]>('/training/progress')).data,
  setLessonCompleted: async (payload: { courseId: string; lessonId: string; completed: boolean }): Promise<CourseProgress> =>
    (await apiClient.post<CourseProgress>('/training/progress', payload)).data,
  getQuiz: async (): Promise<QuizQuestion[]> => (await apiClient.get<QuizQuestion[]>('/training/quiz')).data,
  /** `answers` maps question id to the text of the chosen option (the server shuffles option order per fetch). */
  submitQuiz: async (answers: Record<string, string>): Promise<QuizSubmissionResult> =>
    (await apiClient.post<QuizSubmissionResult>('/training/quiz/submit', { answers })).data,
};

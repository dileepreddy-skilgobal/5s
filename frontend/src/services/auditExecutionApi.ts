import { apiClient } from './api';
import { AuditExecution, PhotoAnnotation } from '../types';

/**
 * Audit execution calls used by the audit runner that are not (yet) in services/api.ts:
 * the live score preview, typed draft/submit payloads and evidence uploads.
 */

export type AnswerStatus = 'CONFORMING' | 'MINOR_NC' | 'MAJOR_NC' | 'CRITICAL_FAIL' | 'NOT_APPLICABLE';

/** Annotation geometry as a percentage of the photo's width/height (the server renders these). */
export type PercentAnnotation = PhotoAnnotation & { unit: 'pct' };

/** An annotated photo: the original, the copy with the markings drawn in, and the markings themselves. */
export interface EvidenceObject {
  photoUrl: string;
  annotatedPhotoUrl?: string;
  annotations?: PercentAnnotation[];
}

/** Evidence as stored on an answer: a plain photo URL or an annotated photo. */
export type EvidenceReference = string | EvidenceObject;

export interface AnswerPayload {
  questionId: string;
  sectionId: string;
  /** Weighted points earned (0 .. weightage x 5). */
  score: number;
  maxScore: number;
  status: AnswerStatus;
  notes?: string;
  evidenceUrls: EvidenceReference[];
}

export interface SubmitAuditPayload {
  answers: AnswerPayload[];
  summaryNotes?: string;
  auditorSignature: string;
  auditorName: string;
  completedAt?: string;
}

export interface FindingPreview {
  questionId: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MODERATE';
}

/** POST /audit-executions/:id/score-preview — the submission scoring rule applied to unsaved answers. */
export interface ScorePreview {
  overallScore: number | null;
  rawScore: number | null;
  earnedScore: number;
  maxPossibleScore: number;
  pillarScores: Record<string, number>;
  isPassed: boolean;
  criticalFailureCount: number;
  capApplied: number | null;
  findings: FindingPreview[];
  passScore: number;
  findingThresholdPercent: number;
  method: 'POOLED' | 'PILLAR_WEIGHTED';
  answeredCount: number;
  requiredCount: number;
  unansweredQuestionIds: string[];
  missingEvidenceQuestionIds: string[];
}

/** POST /files response. */
export interface StoredFile {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

export const auditExecutionApi = {
  previewScore: async (executionId: string, answers: AnswerPayload[]): Promise<ScorePreview> => {
    const res = await apiClient.post<ScorePreview>(`/audit-executions/${executionId}/score-preview`, { answers });
    return res.data;
  },
  saveDraft: async (executionId: string, data: { answers: AnswerPayload[]; summaryNotes?: string }): Promise<AuditExecution> => {
    const res = await apiClient.post<AuditExecution>(`/audit-executions/${executionId}/draft`, data);
    return res.data;
  },
  submit: async (executionId: string, data: SubmitAuditPayload): Promise<AuditExecution> => {
    const res = await apiClient.post<AuditExecution>(`/audit-executions/${executionId}/submit`, data);
    return res.data;
  },
  /** The signatory is always the signed-in user, so no name is sent. */
  acknowledge: async (
    executionId: string,
    data: { acknowledgementNotes: string; acknowledgementSignature: string; targetResolutionDate?: string },
  ): Promise<AuditExecution> => {
    const res = await apiClient.post<AuditExecution>(`/audit-executions/${executionId}/acknowledge`, data);
    return res.data;
  },
  dispute: async (
    executionId: string,
    data: { disputeReason: string; disputeNotes: string; disputedQuestionIds?: string[]; counterEvidenceUrls?: string[] },
  ): Promise<AuditExecution> => {
    const res = await apiClient.post<AuditExecution>(`/audit-executions/${executionId}/dispute`, data);
    return res.data;
  },
  resolveDispute: async (
    executionId: string,
    data: { decision: 'ACCEPT_DISPUTE' | 'REJECT_DISPUTE'; resolutionNotes: string; adjustedScore?: number },
  ): Promise<AuditExecution> => {
    const res = await apiClient.post<AuditExecution>(`/audit-executions/${executionId}/resolve-dispute`, data);
    return res.data;
  },
  /** Uploads one evidence file; put the returned `url` in the record. */
  uploadFile: async (file: Blob, fileName: string): Promise<StoredFile> => {
    const form = new FormData();
    form.append('file', file, fileName);
    const res = await apiClient.post<StoredFile>('/files', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data;
  },
};

import {
  AnswerStatus,
  EvidencePhoto,
  EvidenceSubmission,
  AuditSubmissionPayload,
  AuditTemplateSnapshot,
  FiveSCategory,
  QuestionAnswer,
  TemplateQuestion,
} from '../types';
import { forServer } from './annotations';

/** Rating scale used on the device (0–5); the server receives weighted points. */
export const MAX_RATING = 5;
/** Score cap applied by the server when a critical question fails and the question defines no cap. */
const DEFAULT_CRITICAL_CAP = 70;

export const allQuestions = (template: AuditTemplateSnapshot): TemplateQuestion[] =>
  template.sections.flatMap((s) => s.questions);

/** A critical question rated 0–1 counts as a critical failure (mirrors the server rule). */
const isCriticalFailure = (q: TemplateQuestion, a: QuestionAnswer) =>
  q.isCritical && !a.isNa && (a.finding?.severity === 'CRITICAL' || a.score <= 1);

/** Server answer status for an answer. A raised finding always makes the answer non-conforming. */
export function answerStatus(q: TemplateQuestion, a: QuestionAnswer): AnswerStatus {
  if (a.isNa) return 'NOT_APPLICABLE';
  if (isCriticalFailure(q, a)) return 'CRITICAL_FAIL';
  if (a.finding) {
    if (a.finding.severity === 'CRITICAL') return 'CRITICAL_FAIL';
    if (a.finding.severity === 'MAJOR') return 'MAJOR_NC';
    return 'MINOR_NC';
  }
  const ratio = a.score / MAX_RATING;
  if (ratio >= 0.8) return 'CONFORMING';
  if (ratio >= 0.4) return 'MINOR_NC';
  return 'MAJOR_NC';
}

export interface ScoreSummary {
  /** Overall percentage (after any critical cap); null until at least one scorable answer exists. */
  percentage: number | null;
  pillarScores: Partial<Record<FiveSCategory, number>>;
  criticalFailures: number;
  capApplied: number | null;
  answeredCount: number;
  totalCount: number;
  /** Questions that still need a rating or N/A. */
  unansweredIds: string[];
  /** Questions that require photo evidence but have none. */
  missingEvidenceIds: string[];
}

/** Live score calculation, identical to the server's weighted model. */
export function computeScores(template: AuditTemplateSnapshot, answers: Record<string, QuestionAnswer>): ScoreSummary {
  let earned = 0;
  let max = 0;
  let criticalFailures = 0;
  let cap = 100;
  const pillarEarned: Partial<Record<FiveSCategory, number>> = {};
  const pillarMax: Partial<Record<FiveSCategory, number>> = {};
  const unansweredIds: string[] = [];
  const missingEvidenceIds: string[] = [];

  for (const q of allQuestions(template)) {
    const a = answers[q.id];
    if (!a) {
      unansweredIds.push(q.id);
      continue;
    }
    if (q.mandatoryEvidence && !a.isNa && a.evidence.length === 0) {
      missingEvidenceIds.push(q.id);
    }
    if (a.isNa) continue;

    const points = a.score * q.weightage;
    const possible = MAX_RATING * q.weightage;
    earned += points;
    max += possible;
    pillarEarned[q.category] = (pillarEarned[q.category] ?? 0) + points;
    pillarMax[q.category] = (pillarMax[q.category] ?? 0) + possible;

    if (isCriticalFailure(q, a)) {
      criticalFailures++;
      cap = Math.min(cap, q.scoreCapOnFail ?? DEFAULT_CRITICAL_CAP);
    }
  }

  const raw = max > 0 ? (earned / max) * 100 : null;
  const percentage = raw === null ? null : Math.round((criticalFailures > 0 ? Math.min(raw, cap) : raw) * 10) / 10;

  const pillarScores: Partial<Record<FiveSCategory, number>> = {};
  (Object.keys(pillarMax) as FiveSCategory[]).forEach((k) => {
    const m = pillarMax[k] ?? 0;
    if (m > 0) pillarScores[k] = Math.round(((pillarEarned[k] ?? 0) / m) * 100);
  });

  const totalCount = allQuestions(template).length;
  return {
    percentage,
    pillarScores,
    criticalFailures,
    capApplied: criticalFailures > 0 ? cap : null,
    answeredCount: totalCount - unansweredIds.length,
    totalCount,
    unansweredIds,
    missingEvidenceIds,
  };
}

/**
 * Evidence as sent to the server: the photo data URL, plus its shapes in the percent model when it
 * was annotated (the server burns them into an annotated copy and adds `annotatedPhotoUrl`).
 */
function evidenceForSubmission(e: EvidencePhoto): EvidenceSubmission | null {
  if (!e.dataUrl) return null;
  const annotations = forServer(e.annotations);
  return annotations.length > 0 ? { photoUrl: e.dataUrl, annotations } : e.dataUrl;
}

/** Builds the server submission payload. N/A answers are sent with zero weight so they never affect the score. */
export function buildSubmission(
  template: AuditTemplateSnapshot,
  answers: Record<string, QuestionAnswer>,
  auditor: { name: string },
  summaryNotes?: string,
): AuditSubmissionPayload {
  const payloadAnswers = allQuestions(template)
    .filter((q) => answers[q.id])
    .map((q) => {
      const a = answers[q.id];
      const notes = [a.comment?.trim(), a.finding ? `Finding (${a.finding.severity}): ${a.finding.description.trim()}` : '']
        .filter(Boolean)
        .join('\n');
      return {
        questionId: q.id,
        sectionId: q.sectionId,
        score: a.isNa ? 0 : a.score * q.weightage,
        maxScore: a.isNa ? 0 : MAX_RATING * q.weightage,
        status: answerStatus(q, a),
        notes: notes || undefined,
        evidenceUrls: a.isNa ? [] : a.evidence.map(evidenceForSubmission).filter((u): u is EvidenceSubmission => u !== null),
      };
    });

  const completedAt = new Date().toISOString();
  return {
    answers: payloadAnswers,
    summaryNotes: summaryNotes?.trim() || undefined,
    auditorSignature: `Digitally signed by ${auditor.name} on ${completedAt}`,
    auditorName: auditor.name,
    completedAt,
  };
}

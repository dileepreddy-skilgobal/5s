import { AuditAnswer, AuditTemplateQuestion, QuestionOption } from '../../types';
import { AnswerPayload, AnswerStatus, EvidenceReference, PercentAnnotation } from '../../services/auditExecutionApi';
import { FindingSeverity } from '../../types/audits';

/**
 * How each question type is answered in the runner and turned into the API's answer payload.
 * The server stores weighted points (0 .. weightage x 5) and does all scoring; this module only
 * translates the auditor's response into points.
 */

export const MAX_RATING = 5;

export type BinaryValue = 'PASS' | 'FAIL';

export interface EvidenceItem {
  key: string;
  photoUrl: string;
  annotatedPhotoUrl?: string;
  annotations?: PercentAnnotation[];
  /** Local preview while the upload is running. */
  previewUrl?: string;
  uploading?: boolean;
}

export interface AnswerState {
  /** Binary types: PASS/FAIL. Numeric types: the value on the question's scale. Multiple choice: option index. */
  value: number | BinaryValue | null;
  na: boolean;
  /** Notes, or the written response of a TEXT question (also the finding description). */
  notes: string;
  evidence: EvidenceItem[];
  /** Severity the auditor chose for this answer's finding; null uses the question's default. */
  findingSeverity: FindingSeverity | null;
  /** The auditor records a finding although the answer scored points (manual finding). */
  raiseFinding: boolean;
}

/** The answer payload plus the auditor's finding severity (optional on the API; older clients omit it). */
export type RunnerAnswerPayload = AnswerPayload & { findingSeverity?: FindingSeverity };

export const emptyAnswer = (): AnswerState => ({ value: null, na: false, notes: '', evidence: [], findingSeverity: null, raiseFinding: false });

export const FINDING_SEVERITIES: FindingSeverity[] = ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'];

/** Severity a finding on this question gets unless the auditor changes it (same rule as the server). */
export const defaultSeverity = (q: AuditTemplateQuestion): FindingSeverity => (q.isCritical ? 'CRITICAL' : q.severity ?? 'MODERATE');

export const effectiveSeverity = (q: AuditTemplateQuestion, a: AnswerState): FindingSeverity => a.findingSeverity ?? defaultSeverity(q);

const BINARY_TYPES = ['YES_NO', 'PASS_FAIL', 'CHECKLIST', 'PHOTO'];
export const isBinaryType = (type: string) => BINARY_TYPES.includes(type);

export const BINARY_LABELS: Record<string, { pass: string; fail: string }> = {
  YES_NO: { pass: 'Yes', fail: 'No' },
  PASS_FAIL: { pass: 'Pass', fail: 'Fail' },
  CHECKLIST: { pass: 'Done', fail: 'Not done' },
  PHOTO: { pass: 'Conforms', fail: 'Does not conform' },
};

/** Configured choices of a multiple-choice question (tolerates options still serialised as JSON). */
export function questionOptions(q: AuditTemplateQuestion): QuestionOption[] {
  const raw: unknown = q.options;
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.filter((o): o is QuestionOption => !!o && typeof o === 'object' && typeof (o as QuestionOption).label === 'string');
}

/** Multiple choice without configured options is rated 0–5 like a numeric question. */
export const hasOptions = (q: AuditTemplateQuestion) => questionOptions(q).length > 0;

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

/** The response as a percentage of the question's points, or null when not answered (or N/A). */
export function percentFor(q: AuditTemplateQuestion, a: AnswerState): number | null {
  if (a.na || q.questionType === 'NOT_APPLICABLE') return null;
  if (q.questionType === 'TEXT') return a.notes.trim() ? 100 : null;
  if (a.value === null) return null;
  if (isBinaryType(q.questionType)) return a.value === 'PASS' ? 100 : a.value === 'FAIL' ? 0 : null;
  if (typeof a.value !== 'number') return null;
  switch (q.questionType) {
    case 'NUMERIC_0_10':
      return clampPct(a.value * 10);
    case 'PERCENTAGE':
      return clampPct(a.value);
    case 'MULTIPLE_CHOICE':
      if (hasOptions(q)) {
        const option = questionOptions(q)[a.value];
        return option ? clampPct(Number(option.score)) : null;
      }
      return clampPct((a.value / MAX_RATING) * 100);
    default:
      return clampPct((a.value / MAX_RATING) * 100);
  }
}

export const isAnswered = (q: AuditTemplateQuestion, a: AnswerState) =>
  q.questionType === 'NOT_APPLICABLE' || a.na || percentFor(q, a) !== null;

/** Photo questions always need a photo; other questions when the template marks evidence as mandatory. */
export const requiresPhoto = (q: AuditTemplateQuestion) => q.mandatoryEvidence || q.questionType === 'PHOTO';

export const uploadedEvidence = (a: AnswerState) => a.evidence.filter((e) => !e.uploading && e.photoUrl);

export const isMissingPhoto = (q: AuditTemplateQuestion, a: AnswerState) =>
  requiresPhoto(q) && q.questionType !== 'NOT_APPLICABLE' && !a.na && uploadedEvidence(a).length === 0;

const toReference = (e: EvidenceItem): EvidenceReference =>
  e.annotatedPhotoUrl ? { photoUrl: e.photoUrl, annotatedPhotoUrl: e.annotatedPhotoUrl, annotations: e.annotations ?? [] } : e.photoUrl;

/** A zero result always raises a finding; the auditor may also raise one manually. */
export const isFailed = (q: AuditTemplateQuestion, a: AnswerState) => !a.na && q.questionType !== 'NOT_APPLICABLE' && percentFor(q, a) === 0;
export const hasManualFinding = (q: AuditTemplateQuestion, a: AnswerState) => isFailed(q, a) || (a.raiseFinding && isAnswered(q, a) && !a.na);

/**
 * Status of a non-conforming answer. The status carries the severity band for clients that do not send
 * findingSeverity (mobile): CRITICAL_FAIL is reserved for a failed critical question, because it triggers
 * the score cap.
 */
function nonConformingStatus(q: AuditTemplateQuestion, a: AnswerState): AnswerStatus {
  if (q.isCritical && isFailed(q, a)) return 'CRITICAL_FAIL';
  const severity = effectiveSeverity(q, a);
  return severity === 'MAJOR' || severity === 'CRITICAL' ? 'MAJOR_NC' : 'MINOR_NC';
}

/** API payload for an answered question; null while it is unanswered. */
export function toPayload(q: AuditTemplateQuestion, a: AnswerState): RunnerAnswerPayload | null {
  const maxScore = q.weightage * MAX_RATING;
  const notes = a.notes.trim() || undefined;
  if (a.na || q.questionType === 'NOT_APPLICABLE') {
    return { questionId: q.id, sectionId: q.sectionId, score: 0, maxScore, status: 'NOT_APPLICABLE', notes, evidenceUrls: [] };
  }
  const pct = percentFor(q, a);
  if (pct === null) return null;
  // A zero result or a manually raised finding is a non-conformance; anything else is judged by the server
  // against the tenant's finding threshold
  const finding = hasManualFinding(q, a);
  const status: AnswerStatus = finding ? nonConformingStatus(q, a) : 'CONFORMING';
  // The severity is explicit for findings recorded here; for other answers the auditor's choice only applies
  // if the server finds the score below the finding threshold
  const findingSeverity = finding ? effectiveSeverity(q, a) : a.findingSeverity ?? undefined;
  return {
    questionId: q.id,
    sectionId: q.sectionId,
    score: Math.round(maxScore * pct) / 100,
    maxScore,
    status,
    notes,
    evidenceUrls: uploadedEvidence(a).map(toReference),
    ...(findingSeverity ? { findingSeverity } : {}),
  };
}

let evidenceSeq = 0;
export const evidenceKey = () => `ev-${Date.now()}-${++evidenceSeq}`;

function parseEvidence(raw: AuditAnswer['evidenceUrls'] | unknown): EvidenceItem[] {
  if (!Array.isArray(raw)) return [];
  const items: EvidenceItem[] = [];
  for (const entry of raw as unknown[]) {
    if (typeof entry === 'string' && entry) {
      items.push({ key: evidenceKey(), photoUrl: entry });
    } else if (entry && typeof entry === 'object') {
      const ev = entry as { photoUrl?: unknown; annotatedPhotoUrl?: unknown; annotations?: unknown };
      if (typeof ev.photoUrl !== 'string' || !ev.photoUrl) continue;
      items.push({
        key: evidenceKey(),
        photoUrl: ev.photoUrl,
        annotatedPhotoUrl: typeof ev.annotatedPhotoUrl === 'string' ? ev.annotatedPhotoUrl : undefined,
        annotations: Array.isArray(ev.annotations) ? (ev.annotations as PercentAnnotation[]) : undefined,
      });
    }
  }
  return items;
}

/** Rebuilds the runner state from an answer saved earlier (resuming a draft). */
export function fromSaved(q: AuditTemplateQuestion, saved: AuditAnswer): AnswerState {
  const evidence = parseEvidence(saved.evidenceUrls);
  const notes = saved.notes ?? '';
  if (saved.status === 'NOT_APPLICABLE') return { ...emptyAnswer(), na: true, notes, evidence };
  const max = q.weightage * MAX_RATING;
  const pct = max > 0 ? clampPct((saved.score / max) * 100) : 0;
  let value: AnswerState['value'] = null;
  if (isBinaryType(q.questionType)) value = pct >= 50 ? 'PASS' : 'FAIL';
  else if (q.questionType === 'NUMERIC_0_10') value = Math.round(pct / 10);
  else if (q.questionType === 'PERCENTAGE') value = Math.round(pct);
  else if (q.questionType === 'MULTIPLE_CHOICE' && hasOptions(q)) {
    const options = questionOptions(q);
    let best = 0;
    options.forEach((o, i) => {
      if (Math.abs(Number(o.score) - pct) < Math.abs(Number(options[best].score) - pct)) best = i;
    });
    value = best;
  } else if (q.questionType !== 'TEXT') value = Math.round(pct / 20);
  return { value, na: false, notes, evidence, ...restoreFinding(q, saved.status, pct, saved.findingSeverity) };
}

const isFindingSeverity = (value: string | null | undefined): value is FindingSeverity =>
  !!value && (FINDING_SEVERITIES as readonly string[]).includes(value);

/**
 * Finding choices recovered from a saved draft. The draft keeps the severity the auditor chose; older drafts
 * store only the answer status, so the severity is recovered at the status's band: MAJOR_NC means major (or
 * critical), MINOR_NC minor or moderate.
 */
function restoreFinding(
  q: AuditTemplateQuestion,
  status: AuditAnswer['status'],
  pct: number,
  savedSeverity?: string | null,
): Pick<AnswerState, 'findingSeverity' | 'raiseFinding'> {
  const nonConforming = status === 'MINOR_NC' || status === 'MAJOR_NC' || status === 'CRITICAL_FAIL';
  if (!nonConforming) return { findingSeverity: null, raiseFinding: false };
  const fallback = defaultSeverity(q);
  if (isFindingSeverity(savedSeverity)) return { findingSeverity: savedSeverity === fallback ? null : savedSeverity, raiseFinding: pct > 0 };
  const majorBand = fallback === 'MAJOR' || fallback === 'CRITICAL';
  let findingSeverity: FindingSeverity | null = null;
  if (status === 'MAJOR_NC' && !majorBand) findingSeverity = 'MAJOR';
  if (status === 'MINOR_NC' && majorBand) findingSeverity = 'MINOR';
  return { findingSeverity, raiseFinding: pct > 0 };
}

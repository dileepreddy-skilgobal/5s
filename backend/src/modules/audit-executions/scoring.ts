/**
 * Pillar-weighted scoring helpers (used when a tenant selects scoring.method = PILLAR_WEIGHTED).
 * The template's `categoryScoringModel` holds weights keyed by pillar, either short ("S1") or full
 * ("S1_SORT") keys, e.g. {"S1":20,"S2":20,"S3":20,"S4":20,"S5":20}.
 */
/** Every question is rated on a 0–5 scale and multiplied by its weightage (same rule as the web and mobile clients). */
export const MAX_RATING = 5;

export type PillarWeights = Record<string, number>;

export function parsePillarWeights(raw: string | null | undefined): PillarWeights | null {
  try {
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    const weights: PillarWeights = {};
    for (const [key, value] of Object.entries(parsed)) {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) weights[key] = n;
    }
    return Object.keys(weights).length ? weights : null;
  } catch {
    return null;
  }
}

/** Weight for a pillar such as "S3_SHINE", matching full or short keys. */
function weightFor(category: string, weights: PillarWeights, fallback: number): number {
  if (weights[category] !== undefined) return weights[category];
  const short = category.split('_')[0];
  return weights[short] ?? fallback;
}

/**
 * Combines per-pillar percentages with the template weights. Pillars the model does not mention
 * (e.g. 6S Safety on a classic 5S model) get the average configured weight rather than being ignored.
 * Returns null when no pillar has any applicable points.
 */
export function weightedPillarScore(
  earned: Record<string, number>,
  possible: Record<string, number>,
  weights: PillarWeights,
): number | null {
  const configured = Object.values(weights);
  const fallback = configured.reduce((a, b) => a + b, 0) / configured.length;
  let weighted = 0;
  let totalWeight = 0;
  for (const category of Object.keys(possible)) {
    if (possible[category] <= 0) continue;
    const w = weightFor(category, weights, fallback);
    weighted += w * ((earned[category] ?? 0) / possible[category]) * 100;
    totalWeight += w;
  }
  return totalWeight > 0 ? weighted / totalWeight : null;
}

/** Answer statuses that always raise a finding, whatever the score. */
const NON_CONFORMING_STATUSES = ['CRITICAL_FAIL', 'MAJOR_NC', 'MINOR_NC'];

export const FINDING_SEVERITIES = ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

const isFindingSeverity = (value: unknown): value is FindingSeverity =>
  typeof value === 'string' && (FINDING_SEVERITIES as readonly string[]).includes(value);

export interface ScoringQuestion {
  id: string;
  weightage: number;
  isCritical: boolean;
  scoreCapOnFail: number | null;
  /** The template's default severity for a finding on this question. */
  severity?: string | null;
}

export interface ScoringAnswer {
  questionId: string;
  sectionId: string;
  /** Weighted points earned (clamped to 0..weightage x MAX_RATING). */
  score: number;
  status: string | null | undefined;
  /** Severity chosen by the auditor for this finding; overrides the derived severity. */
  findingSeverity?: string | null;
}

export interface ScoringRules {
  passScore: number;
  /** Cap applied when a critical question fails and the question defines no cap of its own. */
  criticalFailCap: number;
  /** An answer scoring below this percent of its maximum raises a finding. */
  findingThresholdPercent: number;
  /** Template pillar weights when the tenant uses PILLAR_WEIGHTED scoring, otherwise null (pooled). */
  pillarWeights: PillarWeights | null;
}

export interface FindingPreview {
  questionId: string;
  severity: FindingSeverity;
}

/**
 * Severity of the finding an answer raises: the auditor's explicit choice wins; otherwise a critical
 * failure is CRITICAL, a major non-conformance MAJOR, and anything else takes the question's default
 * severity (MODERATE when the question has none). Mobile clients that only send a status keep working.
 */
export function findingSeverityFor(question: ScoringQuestion | undefined, answer: Pick<ScoringAnswer, 'status' | 'findingSeverity'>): FindingSeverity {
  if (isFindingSeverity(answer.findingSeverity)) return answer.findingSeverity;
  if (answer.status === 'CRITICAL_FAIL' || question?.isCritical) return 'CRITICAL';
  if (answer.status === 'MAJOR_NC') return 'MAJOR';
  return isFindingSeverity(question?.severity) ? question.severity : 'MODERATE';
}

export interface AuditScoreResult {
  /** Final score after any critical cap; null when no answer carries points (nothing answered, or all N/A). */
  overallScore: number | null;
  /** Score before the critical cap. */
  rawScore: number | null;
  earnedScore: number;
  maxPossibleScore: number;
  /** Percent per pillar, only for pillars that have scorable answers. */
  pillarScores: Record<string, number>;
  isPassed: boolean;
  criticalFailureCount: number;
  /** The cap that applies (lowest of the failed critical questions' caps), or null when none failed. */
  capApplied: number | null;
  /** Answers that become findings (observation + corrective action) on submission. */
  findings: FindingPreview[];
}

const round1 = (n: number) => Number(n.toFixed(1));

/**
 * The single scoring rule for an audit: used by submission and by the live score preview, so the
 * runner never computes scores itself. Not-applicable answers neither earn nor lose points.
 */
export function scoreAudit(
  questions: Map<string, ScoringQuestion>,
  sectionCategories: Map<string, string>,
  answers: ScoringAnswer[],
  rules: ScoringRules,
): AuditScoreResult {
  let totalEarned = 0;
  let totalMax = 0;
  let criticalFailCount = 0;
  let minScoreCap = 100;
  const pillarEarned: Record<string, number> = {};
  const pillarMax: Record<string, number> = {};
  const findings: FindingPreview[] = [];

  for (const ans of answers) {
    if (ans.status === 'NOT_APPLICABLE') continue;
    const question = questions.get(ans.questionId);
    const cat = sectionCategories.get(ans.sectionId) || 'S1_SORT';
    // Points available come from the question (weightage x rating scale), not from the client;
    // the submitted score is clamped into that range
    const possible = (question?.weightage ?? 1) * MAX_RATING;
    const earned = Math.min(Math.max(ans.score, 0), possible);

    pillarEarned[cat] = (pillarEarned[cat] || 0) + earned;
    pillarMax[cat] = (pillarMax[cat] || 0) + possible;
    totalEarned += earned;
    totalMax += possible;

    const criticalFail = !!question?.isCritical && (ans.status === 'CRITICAL_FAIL' || earned === 0);
    if (criticalFail) {
      criticalFailCount++;
      minScoreCap = Math.min(minScoreCap, question?.scoreCapOnFail || rules.criticalFailCap);
    }

    const nonConforming = NON_CONFORMING_STATUSES.includes(ans.status ?? '');
    if (nonConforming || earned < possible * (rules.findingThresholdPercent / 100)) {
      findings.push({ questionId: ans.questionId, severity: findingSeverityFor(question, ans) });
    }
  }

  const pooled = totalMax > 0 ? (totalEarned / totalMax) * 100 : null;
  const raw = pooled === null ? null : rules.pillarWeights ? weightedPillarScore(pillarEarned, pillarMax, rules.pillarWeights) ?? pooled : pooled;
  const final = raw === null ? null : criticalFailCount > 0 ? Math.min(raw, minScoreCap) : raw;

  const pillarScores: Record<string, number> = {};
  for (const cat of Object.keys(pillarMax)) {
    if (pillarMax[cat] > 0) pillarScores[cat] = round1((pillarEarned[cat] / pillarMax[cat]) * 100);
  }

  return {
    overallScore: final === null ? null : round1(final),
    rawScore: raw === null ? null : round1(raw),
    earnedScore: round1(totalEarned),
    maxPossibleScore: totalMax,
    pillarScores,
    isPassed: criticalFailCount === 0 && final !== null && final >= rules.passScore,
    criticalFailureCount: criticalFailCount,
    capApplied: criticalFailCount > 0 ? minScoreCap : null,
    findings,
  };
}

/** Number of evidence items in an answer's evidence (array, or the JSON string stored in the database). */
export function evidenceCount(evidence: unknown): number {
  let list: unknown = evidence;
  if (typeof evidence === 'string') {
    try {
      list = JSON.parse(evidence || '[]');
    } catch {
      return 0;
    }
  }
  return Array.isArray(list) ? list.filter((item) => !!item).length : 0;
}

/** Shortens text to at most `max` characters on a word boundary, adding an ellipsis when cut. */
export function truncateWords(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

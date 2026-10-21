/**
 * Tenant configuration stored in `Tenant.settings` (JSON).
 * Every value has a default that reproduces the platform's standard behaviour, so a new tenant
 * works without setup; administrators override individual sections (BRD §5.5 "configuration
 * before customisation"). Read it with `readTenantSettings`, never by parsing the JSON ad hoc.
 */
export interface MaturityBand {
  level: number;
  name: string;
  description: string;
  /** Minimum average audit score (percent) for this level. */
  minScore: number;
  color: string;
}

export interface CertificationRule {
  name: 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE';
  minAverageScore: number;
  /** Maximum repeat-observation rate (percent); null = not assessed. */
  maxRepeatRate: number | null;
  /** Minimum on-time action closure (percent); null = not assessed. */
  minOnTimeClosure: number | null;
  /** Minimum audit adherence (percent); null = not assessed. */
  minAdherence: number | null;
  /** Every one of the last N audits must reach minAverageScore (sustained performance). */
  sustainedAudits: number;
}

export interface AnalyticsSettings {
  targetScore: number;
  /** Score at or above which an audit counts as passed (also stored on each audit as isPassed). */
  passScore: number;
  /** Days back used to flag an observation as a repeat. */
  repeatLookbackDays: number;
  /** Months of history evaluated for certification. */
  certificationWindowMonths: number;
  maturityBands: MaturityBand[];
  certificationRules: CertificationRule[];
}

export interface ScoringSettings {
  /**
   * POOLED: earned points / possible points across all questions (question weightage applies).
   * PILLAR_WEIGHTED: each 5S pillar is scored on its own and combined using the template's pillar weights.
   */
  method: 'POOLED' | 'PILLAR_WEIGHTED';
  /** Score cap (percent) applied when a critical question fails and the question sets no cap of its own. */
  criticalFailCap: number;
  /** An answer scoring below this percent of its maximum raises a finding. */
  findingThresholdPercent: number;
}

export type Severity = 'CRITICAL' | 'MAJOR' | 'MODERATE' | 'MINOR' | 'KAIZEN_OPPORTUNITY';

export interface SlaSettings {
  /** Default corrective-action target, in hours from creation (or acknowledgement), per severity. */
  hoursBySeverity: Record<Severity, number>;
}

/** Who a notification goes to: a relationship to the record, or a role code. */
export type EscalationRecipient = 'ASSIGNEE' | 'AREA_OWNER' | 'BACKUP_OWNER' | 'AUDITOR' | 'COORDINATOR_5S' | 'DEPT_HEAD' | 'PLANT_HEAD' | 'ORG_ADMIN';

export interface EscalationStep {
  /** Days relative to the due date: negative = before, 0 = on the day, positive = overdue by. */
  offsetDays: number;
  notify: EscalationRecipient[];
}

export interface EscalationSettings {
  actionSteps: EscalationStep[];
  /** Notified when a scheduled audit passes its due date without being completed. */
  overdueAuditNotify: EscalationRecipient[];
  /** Daily digest of open work to each user who has some. */
  dailyDigest: boolean;
  /** Daily summary for managers (plant / department heads, 5S coordinators, executives) of everything in their scope (BRD §62). */
  managerDigest: boolean;
  /** Local hour (0–23, in `timeZone`) from which the daily digests are sent. */
  digestHour: number;
  /** IANA time zone the digest hour and digest day are evaluated in, e.g. Asia/Kolkata. */
  timeZone: string;
}

export interface CapaSettings {
  /**
   * BRD §33 closure-evidence exception: when true, a corrective action may be submitted for closure without an
   * after photograph, provided the submitter records a justification note. Closure comments are always required.
   */
  allowClosureWithoutPhoto: boolean;
}

export interface GamificationSettings {
  /** BRD §55 "gamification shall be optional": when false, recognition (XP, badges, trophies, kudos) is switched off. */
  enabled: boolean;
  /** Show the ranking of individual people; area and department leaderboards are always shown while enabled. */
  showIndividualLeaderboard: boolean;
}

export interface NumberingSettings {
  audit: string;
  scheduledAudit: string;
  observation: string;
  action: string;
  redTag: string;
}

export const TERM_KEYS = ['location', 'observation', 'correctiveAction', 'redTag', 'audit', 'auditor', 'areaOwner'] as const;
export type TermKey = (typeof TERM_KEYS)[number];

export interface CompetencySettings {
  /** When true, only users with a valid training certificate may conduct audits. */
  requireCertifiedAuditors: boolean;
  quizPassPercent: number;
  certificateValidityMonths: number;
  certificateTitle: string;
  signatories: Array<{ name: string; title: string }>;
}

export interface SecuritySettings {
  /** Organization administrators must use TOTP multi-factor authentication. */
  requireMfaForAdmins: boolean;
}

export interface TenantSettings {
  brandColor: string;
  /** Default UI language for users who have not chosen one (BCP 47, e.g. en, hi). */
  defaultLocale: string;
  defaultAuditFrequency: string;
  analytics: AnalyticsSettings;
  scoring: ScoringSettings;
  sla: SlaSettings;
  escalation: EscalationSettings;
  numbering: NumberingSettings;
  terminology: Record<TermKey, string>;
  competency: CompetencySettings;
  security: SecuritySettings;
  capa: CapaSettings;
  gamification: GamificationSettings;
}

export const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
  targetScore: 85,
  // Matches the pass mark audits have always been judged against
  passScore: 70,
  repeatLookbackDays: 90,
  certificationWindowMonths: 6,
  // BRD §45 maturity model
  maturityBands: [
    { level: 5, name: 'Level 5 — Excellence', description: 'Self-sustaining improvement culture.', minScore: 95, color: '#8B5CF6' },
    { level: 4, name: 'Level 4 — Sustained', description: 'Consistent adherence demonstrated.', minScore: 85, color: '#10B981' },
    { level: 3, name: 'Level 3 — Standardised', description: 'Standards are documented and followed.', minScore: 70, color: '#3B82F6' },
    { level: 2, name: 'Level 2 — Implemented', description: 'Basic workplace organisation exists.', minScore: 50, color: '#F59E0B' },
    { level: 1, name: 'Level 1 — Initial', description: 'Basic awareness.', minScore: 0, color: '#EF4444' },
  ],
  // BRD §46 internal certification
  certificationRules: [
    { name: 'PLATINUM', minAverageScore: 95, maxRepeatRate: 2, minOnTimeClosure: 95, minAdherence: 95, sustainedAudits: 3 },
    { name: 'GOLD', minAverageScore: 90, maxRepeatRate: 5, minOnTimeClosure: 90, minAdherence: 90, sustainedAudits: 3 },
    { name: 'SILVER', minAverageScore: 80, maxRepeatRate: 10, minOnTimeClosure: 80, minAdherence: 80, sustainedAudits: 2 },
    { name: 'BRONZE', minAverageScore: 70, maxRepeatRate: null, minOnTimeClosure: null, minAdherence: null, sustainedAudits: 1 },
  ],
};

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  brandColor: '#2563EB',
  defaultLocale: 'en',
  defaultAuditFrequency: 'WEEKLY',
  analytics: DEFAULT_ANALYTICS_SETTINGS,
  scoring: { method: 'POOLED', criticalFailCap: 70, findingThresholdPercent: 60 },
  // BRD §31: Critical 24 h, Major 3 days, Moderate 7 days, Minor 15 days
  sla: { hoursBySeverity: { CRITICAL: 24, MAJOR: 72, MODERATE: 168, MINOR: 360, KAIZEN_OPPORTUNITY: 336 } },
  // BRD §32 escalation: reminder T-2, owner alert on the due date, then +2 department head, +5 plant head,
  // +10 5S coordinator. The assignee stays on every step so the person who must act always hears about it.
  escalation: {
    actionSteps: [
      { offsetDays: -2, notify: ['ASSIGNEE'] },
      { offsetDays: 0, notify: ['ASSIGNEE', 'AREA_OWNER'] },
      { offsetDays: 2, notify: ['ASSIGNEE', 'DEPT_HEAD'] },
      { offsetDays: 5, notify: ['ASSIGNEE', 'PLANT_HEAD'] },
      { offsetDays: 10, notify: ['ASSIGNEE', 'COORDINATOR_5S'] },
    ],
    overdueAuditNotify: ['AUDITOR', 'COORDINATOR_5S'],
    dailyDigest: true,
    managerDigest: true,
    digestHour: 8,
    timeZone: 'Asia/Kolkata',
  },
  numbering: { audit: 'EXEC', scheduledAudit: 'AUD', observation: 'OBS', action: 'CAPA', redTag: 'RT' },
  terminology: {
    location: 'Location',
    observation: 'Observation',
    correctiveAction: 'Corrective Action',
    redTag: 'Red Tag',
    audit: 'Audit',
    auditor: 'Auditor',
    areaOwner: 'Area Owner',
  },
  competency: {
    requireCertifiedAuditors: false,
    quizPassPercent: 80,
    certificateValidityMonths: 12,
    certificateTitle: 'Certified 5S Practitioner & Operational Discipline Auditor',
    signatories: [],
  },
  // Opt-in so existing administrators are not locked out before they enrol
  security: { requireMfaForAdmins: false },
  // BRD §33: an after photograph is required unless the organization configures the exception
  capa: { allowClosureWithoutPhoto: false },
  gamification: { enabled: true, showIndividualLeaderboard: true },
};

type StoredSettings = Partial<{ [K in keyof TenantSettings]: TenantSettings[K] extends object ? Partial<TenantSettings[K]> : TenantSettings[K] }>;

export function parseStoredSettings(settingsJson: string | null | undefined): StoredSettings {
  try {
    const parsed = settingsJson ? JSON.parse(settingsJson) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Parses the tenant settings JSON and merges each section over the defaults. */
export function readTenantSettings(settingsJson: string | null | undefined): TenantSettings {
  const stored = parseStoredSettings(settingsJson);
  const d = DEFAULT_TENANT_SETTINGS;
  const analyticsOverrides = stored.analytics ?? {};
  const analytics: AnalyticsSettings = { ...d.analytics, ...analyticsOverrides };
  analytics.maturityBands = [...(analyticsOverrides.maturityBands ?? d.analytics.maturityBands)].sort((a, b) => b.minScore - a.minScore);
  analytics.certificationRules = analyticsOverrides.certificationRules ?? d.analytics.certificationRules;
  return {
    brandColor: (stored.brandColor as string | undefined) ?? d.brandColor,
    defaultAuditFrequency: (stored.defaultAuditFrequency as string | undefined) ?? d.defaultAuditFrequency,
    defaultLocale: (stored.defaultLocale as string | undefined) ?? d.defaultLocale,
    analytics,
    scoring: { ...d.scoring, ...stored.scoring },
    sla: { hoursBySeverity: { ...d.sla.hoursBySeverity, ...stored.sla?.hoursBySeverity } },
    escalation: { ...d.escalation, ...stored.escalation },
    numbering: { ...d.numbering, ...stored.numbering },
    terminology: { ...d.terminology, ...stored.terminology },
    competency: { ...d.competency, ...stored.competency },
    security: { ...d.security, ...stored.security },
    capa: { ...d.capa, ...stored.capa },
    gamification: { ...d.gamification, ...stored.gamification },
  };
}

/** Kept for analytics callers: the analytics section of the tenant settings. */
export function readAnalyticsSettings(settingsJson: string | null | undefined): AnalyticsSettings {
  return readTenantSettings(settingsJson).analytics;
}

export function maturityFor(score: number | null, settings: AnalyticsSettings): MaturityBand | null {
  if (score === null) return null;
  return settings.maturityBands.find((b) => score >= b.minScore) ?? settings.maturityBands[settings.maturityBands.length - 1];
}

/** True when `timeZone` is an IANA zone this runtime knows (used to validate the digest time zone). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Calendar day (YYYY-MM-DD) and hour (0–23) of `at` in `timeZone`; falls back to UTC for an unknown zone. */
export function localDayAndHour(at: Date, timeZone: string): { day: string; hour: number } {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00';
  return { day: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) % 24 };
}

/** SLA hours for a severity (unknown severities use MODERATE). */
export function slaHoursFor(settings: TenantSettings, severity: string): number {
  return settings.sla.hoursBySeverity[severity as Severity] ?? settings.sla.hoursBySeverity.MODERATE;
}

/** Document number prefix, e.g. `OBS-CNC01-2026-`, using the tenant's configured prefix. */
export function documentPrefix(settings: TenantSettings, kind: keyof NumberingSettings, areaFragment: string, year: number): string {
  return `${settings.numbering[kind]}-${areaFragment}-${year}-`;
}

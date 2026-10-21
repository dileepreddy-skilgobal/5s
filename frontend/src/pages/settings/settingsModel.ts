import { AuditFrequency, CertificationLevel, EscalationRecipient, NumberingKey, SettingsSeverity, TermKey } from '../../types';
import { AdminOrganizationSettings as OrganizationSettings, AdminTenantSettings as TenantSettings, AdminUpdateSettingsPayload as UpdateSettingsPayload } from '../../types/admin';

/** Client-side mirror of backend/src/modules/settings/dto/settings.dto.ts. The server stays the authority. */

export type SectionId =
  | 'general'
  | 'scoring'
  | 'sla'
  | 'escalation'
  | 'capa'
  | 'numbering'
  | 'terminology'
  | 'competency'
  | 'analytics'
  | 'recognition'
  | 'security';

export const SECTION_LABELS: Record<SectionId, string> = {
  general: 'General',
  scoring: 'Scoring',
  sla: 'SLA',
  escalation: 'Escalation',
  capa: 'Corrective actions',
  numbering: 'Numbering',
  terminology: 'Terminology',
  competency: 'Competency',
  analytics: 'Analytics',
  recognition: 'Recognition',
  security: 'Security',
};

export const SECTION_ORDER: SectionId[] = [
  'general',
  'scoring',
  'sla',
  'escalation',
  'capa',
  'numbering',
  'terminology',
  'competency',
  'analytics',
  'recognition',
  'security',
];

export const isSectionId = (value: string | null | undefined): value is SectionId => !!value && (SECTION_ORDER as string[]).includes(value);

/** Common IANA zones offered as suggestions; any zone the browser knows is accepted. */
export const TIME_ZONE_SUGGESTIONS = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

/** True when the browser recognises `zone` as an IANA time zone (the server performs the same check). */
export const isValidTimeZone = (zone: string): boolean => {
  if (!zone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
};

/** "08:00" for an hour of the day. */
export const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

export const AUDIT_FREQUENCIES: Array<{ value: AuditFrequency; label: string }> = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'FORTNIGHTLY', label: 'Fortnightly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
];

export const SEVERITIES: Array<{ value: SettingsSeverity; label: string }> = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'MINOR', label: 'Minor' },
  { value: 'KAIZEN_OPPORTUNITY', label: 'Kaizen opportunity' },
];

export const RECIPIENTS: Array<{ value: EscalationRecipient; label: string }> = [
  { value: 'ASSIGNEE', label: 'Assignee' },
  { value: 'AREA_OWNER', label: 'Area owner' },
  { value: 'BACKUP_OWNER', label: 'Backup owner' },
  { value: 'AUDITOR', label: 'Auditor' },
  { value: 'COORDINATOR_5S', label: '5S coordinator' },
  { value: 'DEPT_HEAD', label: 'Department head' },
  { value: 'PLANT_HEAD', label: 'Plant head' },
  { value: 'ORG_ADMIN', label: 'Org admin' },
];

export const NUMBERING_KINDS: Array<{ key: NumberingKey; label: string }> = [
  { key: 'audit', label: 'Audit execution' },
  { key: 'scheduledAudit', label: 'Scheduled audit' },
  { key: 'observation', label: 'Observation' },
  { key: 'action', label: 'Corrective action' },
  { key: 'redTag', label: 'Red tag' },
];

export const TERM_FIELDS: Array<{ key: TermKey; label: string; hint: string }> = [
  { key: 'location', label: 'Location', hint: 'An audited area or workstation' },
  { key: 'observation', label: 'Observation', hint: 'A finding or abnormality' },
  { key: 'correctiveAction', label: 'Corrective action', hint: 'CAPA raised to fix a finding' },
  { key: 'redTag', label: 'Red tag', hint: 'An item tagged during Sort (1S)' },
  { key: 'audit', label: 'Audit', hint: 'A 5S inspection' },
  { key: 'auditor', label: 'Auditor', hint: 'Person conducting audits' },
  { key: 'areaOwner', label: 'Area owner', hint: 'Person accountable for an area' },
];

export const CERTIFICATION_LEVELS: CertificationLevel[] = ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'];

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
/** BCP 47 language code as accepted by the backend (en, hi, hi-IN). */
export const LOCALE_CODE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
export const PREFIX_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

export const escalationOffsetLabel = (offset: number): string => {
  if (!Number.isFinite(offset)) return '—';
  if (offset === 0) return 'On due date';
  const days = Math.abs(offset);
  const unit = days === 1 ? 'day' : 'days';
  return offset < 0 ? `${days} ${unit} before due` : `${days} ${unit} overdue`;
};

export const hoursAsDays = (hours: number): string => {
  if (!Number.isFinite(hours)) return '—';
  const days = hours / 24;
  const rounded = Math.round(days * 10) / 10;
  return `≈ ${rounded} ${rounded === 1 ? 'day' : 'days'}`;
};

export const numberingExample = (prefix: string): string => `${prefix || '???'}-CNC01-${new Date().getFullYear()}-0001`;

/** Number input value -> state (empty stays NaN so validation can flag it). */
export const parseNumberInput = (raw: string): number => (raw.trim() === '' ? NaN : Number(raw));
export const numberInputValue = (value: number | null | undefined): string | number =>
  typeof value === 'number' && Number.isFinite(value) ? value : '';

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export const cloneSettings = (s: OrganizationSettings): OrganizationSettings => deepClone(s);

const trimList = (list: string[]) => list.map((v) => v.trim());

/** The PATCH body for one section, built from a full settings object. */
export const buildSectionPayload = (
  id: SectionId,
  s: TenantSettings & { hierarchyLevels?: string[] },
  options: { includeHierarchy?: boolean } = {},
): UpdateSettingsPayload => {
  switch (id) {
    case 'general':
      // brandColor is still accepted by the API but nothing uses it, so it is no longer edited here
      return {
        defaultAuditFrequency: s.defaultAuditFrequency,
        ...(s.defaultLocale ? { defaultLocale: s.defaultLocale } : {}),
        ...(options.includeHierarchy !== false && s.hierarchyLevels ? { hierarchyLevels: trimList(s.hierarchyLevels) } : {}),
      };
    case 'scoring':
      return {
        scoring: { ...s.scoring },
        analytics: { passScore: s.analytics.passScore, targetScore: s.analytics.targetScore },
      };
    case 'sla':
      return { sla: { hoursBySeverity: { ...s.sla.hoursBySeverity } } };
    case 'escalation':
      return {
        escalation: {
          actionSteps: [...s.escalation.actionSteps]
            .map((step) => ({ offsetDays: step.offsetDays, notify: [...step.notify] }))
            .sort((a, b) => a.offsetDays - b.offsetDays),
          overdueAuditNotify: [...s.escalation.overdueAuditNotify],
          dailyDigest: s.escalation.dailyDigest,
          managerDigest: s.escalation.managerDigest,
          digestHour: s.escalation.digestHour,
          timeZone: s.escalation.timeZone.trim(),
        },
      };
    case 'capa':
      return { capa: { allowClosureWithoutPhoto: s.capa.allowClosureWithoutPhoto } };
    case 'recognition':
      return { gamification: { enabled: s.gamification.enabled, showIndividualLeaderboard: s.gamification.showIndividualLeaderboard } };
    case 'numbering':
      return { numbering: { ...s.numbering } };
    case 'terminology': {
      const terminology = { ...s.terminology };
      (Object.keys(terminology) as TermKey[]).forEach((k) => {
        terminology[k] = (terminology[k] ?? '').trim();
      });
      return { terminology };
    }
    case 'competency':
      return {
        competency: {
          ...s.competency,
          certificateTitle: s.competency.certificateTitle.trim(),
          signatories: s.competency.signatories.map((sig) => ({ name: sig.name.trim(), title: sig.title.trim() })),
        },
      };
    case 'analytics':
      return {
        analytics: {
          repeatLookbackDays: s.analytics.repeatLookbackDays,
          certificationWindowMonths: s.analytics.certificationWindowMonths,
          maturityBands: s.analytics.maturityBands.map((b) => ({
            ...b,
            name: b.name.trim(),
            description: b.description.trim(),
          })),
          certificationRules: s.analytics.certificationRules.map((r) => ({ ...r })),
        },
      };
    case 'security':
      return { security: { requireMfaForAdmins: s.security?.requireMfaForAdmins === true } };
    default:
      return {};
  }
};

/** Copies one section's values from `source` into a copy of `target` (keeps other sections' unsaved edits). */
export const applySection = (id: SectionId, target: OrganizationSettings, source: OrganizationSettings): OrganizationSettings => {
  const next = cloneSettings(target);
  const src = cloneSettings(source);
  switch (id) {
    case 'general':
      next.defaultAuditFrequency = src.defaultAuditFrequency;
      next.defaultLocale = src.defaultLocale;
      next.hierarchyLevels = src.hierarchyLevels;
      break;
    case 'scoring':
      next.scoring = src.scoring;
      next.analytics.passScore = src.analytics.passScore;
      next.analytics.targetScore = src.analytics.targetScore;
      break;
    case 'analytics':
      next.analytics = { ...src.analytics, passScore: next.analytics.passScore, targetScore: next.analytics.targetScore };
      break;
    case 'security':
      next.security = { requireMfaForAdmins: src.security?.requireMfaForAdmins === true };
      break;
    case 'recognition':
      next.gamification = src.gamification;
      break;
    default:
      (next as unknown as Record<string, unknown>)[id] = (src as unknown as Record<string, unknown>)[id];
  }
  return next;
};

export const isSectionDirty = (id: SectionId, draft: OrganizationSettings, saved: OrganizationSettings): boolean =>
  JSON.stringify(buildSectionPayload(id, draft)) !== JSON.stringify(buildSectionPayload(id, saved));

// --- Validation ---
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const inRange = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const intInRange = (v: unknown, min: number, max: number) => isInt(v) && v >= min && v <= max;

/** Human-readable problems with one section of the draft; empty when it can be saved. */
export const validateSection = (id: SectionId, s: OrganizationSettings): string[] => {
  const errors: string[] = [];
  switch (id) {
    case 'general': {
      if (!AUDIT_FREQUENCIES.some((f) => f.value === s.defaultAuditFrequency)) errors.push('Choose a default audit frequency.');
      if (s.defaultLocale !== undefined && !LOCALE_CODE.test(s.defaultLocale)) errors.push('Choose a default language.');
      const levels = s.hierarchyLevels ?? [];
      if (levels.length < 2 || levels.length > 8) errors.push('The hierarchy needs between 2 and 8 levels.');
      levels.forEach((l, i) => {
        const v = l.trim();
        if (!v) errors.push(`Hierarchy level ${i + 1} needs a name.`);
        else if (v.length > 30) errors.push(`Hierarchy level ${i + 1} must be 30 characters or fewer.`);
      });
      break;
    }
    case 'scoring':
      if (!['POOLED', 'PILLAR_WEIGHTED'].includes(s.scoring.method)) errors.push('Choose a scoring method.');
      if (!inRange(s.scoring.criticalFailCap, 0, 100)) errors.push('Critical-fail cap must be between 0 and 100.');
      if (!inRange(s.scoring.findingThresholdPercent, 1, 100)) errors.push('Finding threshold must be between 1 and 100.');
      if (!inRange(s.analytics.passScore, 0, 100)) errors.push('Pass mark must be between 0 and 100.');
      if (!inRange(s.analytics.targetScore, 0, 100)) errors.push('Target score must be between 0 and 100.');
      break;
    case 'sla':
      SEVERITIES.forEach(({ value, label }) => {
        if (!intInRange(s.sla.hoursBySeverity[value], 1, 8760)) errors.push(`${label}: SLA must be a whole number of hours between 1 and 8760.`);
      });
      break;
    case 'escalation': {
      const steps = s.escalation.actionSteps;
      if (steps.length > 10) errors.push('At most 10 escalation steps are allowed.');
      steps.forEach((step, i) => {
        if (!intInRange(step.offsetDays, -30, 90)) errors.push(`Step ${i + 1}: day offset must be a whole number between -30 and 90.`);
        if (step.notify.length === 0) errors.push(`Step ${i + 1}: choose at least one recipient.`);
      });
      const offsets = steps.map((st) => st.offsetDays);
      if (new Set(offsets).size !== offsets.length) errors.push('Escalation steps must have distinct day offsets.');
      if (!intInRange(s.escalation.digestHour, 0, 23)) errors.push('Digest time must be a whole hour between 0 and 23.');
      if (!isValidTimeZone(s.escalation.timeZone)) errors.push('Choose a valid time zone, for example Asia/Kolkata.');
      break;
    }
    case 'numbering': {
      const values = NUMBERING_KINDS.map(({ key }) => s.numbering[key] ?? '');
      NUMBERING_KINDS.forEach(({ key, label }) => {
        if (!PREFIX_PATTERN.test(s.numbering[key] ?? '')) errors.push(`${label}: prefixes are 2–10 upper-case letters or digits, starting with a letter.`);
      });
      if (new Set(values).size !== values.length) errors.push('Document number prefixes must be distinct.');
      break;
    }
    case 'terminology':
      TERM_FIELDS.forEach(({ key, label }) => {
        const v = (s.terminology[key] ?? '').trim();
        if (v.length < 1 || v.length > 40) errors.push(`${label}: label must be 1–40 characters.`);
      });
      break;
    case 'competency': {
      const c = s.competency;
      if (!intInRange(c.quizPassPercent, 50, 100)) errors.push('Quiz pass mark must be a whole number between 50 and 100.');
      if (!intInRange(c.certificateValidityMonths, 1, 60)) errors.push('Certificate validity must be a whole number of months between 1 and 60.');
      const title = c.certificateTitle.trim();
      if (title.length < 1 || title.length > 120) errors.push('Certificate title must be 1–120 characters.');
      if (c.signatories.length > 3) errors.push('At most 3 signatories are allowed.');
      c.signatories.forEach((sig, i) => {
        const name = sig.name.trim();
        const t = sig.title.trim();
        if (name.length < 1 || name.length > 80) errors.push(`Signatory ${i + 1}: name must be 1–80 characters.`);
        if (t.length < 1 || t.length > 80) errors.push(`Signatory ${i + 1}: title must be 1–80 characters.`);
      });
      break;
    }
    case 'analytics': {
      const a = s.analytics;
      if (!intInRange(a.repeatLookbackDays, 1, 730)) errors.push('Repeat look-back must be a whole number of days between 1 and 730.');
      if (!intInRange(a.certificationWindowMonths, 1, 36)) errors.push('Certification window must be a whole number of months between 1 and 36.');
      const bands = a.maturityBands;
      if (bands.length < 2 || bands.length > 10) errors.push('Define between 2 and 10 maturity bands.');
      bands.forEach((b, i) => {
        const n = `Band ${i + 1}`;
        if (!intInRange(b.level, 1, 10)) errors.push(`${n}: level must be a whole number between 1 and 10.`);
        const name = b.name.trim();
        if (name.length < 1 || name.length > 60) errors.push(`${n}: name must be 1–60 characters.`);
        if (b.description.trim().length > 200) errors.push(`${n}: description must be 200 characters or fewer.`);
        if (!inRange(b.minScore, 0, 100)) errors.push(`${n}: minimum score must be between 0 and 100.`);
        if (!HEX_COLOR.test(b.color)) errors.push(`${n}: colour must be a hex colour like #10B981.`);
      });
      if (!bands.some((b) => b.minScore === 0)) errors.push('Maturity bands must include a band starting at 0 so every score has a level.');
      const levels = bands.map((b) => b.level);
      if (new Set(levels).size !== levels.length) errors.push('Maturity band levels must be unique.');
      const rules = a.certificationRules;
      if (rules.length < 1 || rules.length > 4) errors.push('Define between 1 and 4 certification levels.');
      const names = rules.map((r) => r.name);
      if (new Set(names).size !== names.length) errors.push('Each certification level may be defined only once.');
      rules.forEach((r) => {
        if (!inRange(r.minAverageScore, 0, 100)) errors.push(`${r.name}: minimum average score must be between 0 and 100.`);
        (['maxRepeatRate', 'minOnTimeClosure', 'minAdherence'] as const).forEach((field) => {
          const v = r[field];
          if (v !== null && !inRange(v, 0, 100)) errors.push(`${r.name}: ${field === 'maxRepeatRate' ? 'max repeat rate' : field === 'minOnTimeClosure' ? 'min on-time closure' : 'min adherence'} must be between 0 and 100, or not assessed.`);
        });
        if (!intInRange(r.sustainedAudits, 1, 20)) errors.push(`${r.name}: sustained audits must be a whole number between 1 and 20.`);
      });
      break;
    }
    default:
      break;
  }
  return errors;
};

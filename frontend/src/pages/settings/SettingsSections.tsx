import React, { useState } from 'react';
import { ArrowDown, ArrowUp, BellRing, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { EscalationRecipient, ScoringMethod } from '../../types';
import { AdminOrganizationSettings as OrganizationSettings, SchedulerCheck, SchedulerRunSummary } from '../../types/admin';
import { adminApi } from '../../services/api-admin';
import { getApiErrorMessage } from '../../services/api';
import { useApp } from '../../context/AppContext';
import {
  AUDIT_FREQUENCIES,
  NUMBERING_KINDS,
  PREFIX_PATTERN,
  SEVERITIES,
  TERM_FIELDS,
  TIME_ZONE_SUGGESTIONS,
  escalationOffsetLabel,
  hourLabel,
  hoursAsDays,
  numberingExample,
} from './settingsModel';
import { Field, NumberInput, RecipientPicker, Toggle, gridStyle, hintStyle } from './SettingsFields';
import { LOCALE_OPTIONS, useI18n } from '../../i18n';

export interface SectionBodyProps {
  draft: OrganizationSettings;
  /** Applies a mutation to a copy of the draft. */
  update: (mutate: (d: OrganizationSettings) => void) => void;
}

const iconButtonStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  width: '36px',
  height: '36px',
  flexShrink: 0,
  padding: 0,
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface)',
};

// --- General ---
export const GeneralSection: React.FC<SectionBodyProps> = ({ draft, update }) => {
  const { t } = useI18n();
  const localeValue = draft.defaultLocale || 'en';
  // Keep a stored code the UI has no catalog for selectable, so saving the section does not silently change it
  const localeChoices = LOCALE_OPTIONS.some((o) => o.code === localeValue)
    ? LOCALE_OPTIONS
    : [...LOCALE_OPTIONS, { code: localeValue, label: localeValue }];
  const levels = draft.hierarchyLevels ?? [];

  const moveLevel = (from: number, to: number) =>
    update((d) => {
      const list = [...(d.hierarchyLevels ?? [])];
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      d.hierarchyLevels = list;
    });

  return (
    <>
      <div style={gridStyle}>
        <Field label="Default audit frequency" htmlFor="settings-frequency" hint="Pre-selected when a new audit schedule is created.">
          <select
            id="settings-frequency"
            className="form-select"
            value={draft.defaultAuditFrequency}
            onChange={(e) => update((d) => { d.defaultAuditFrequency = e.target.value; })}
          >
            {AUDIT_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </Field>
        <Field label={t('settings.defaultLanguage')} htmlFor="settings-default-locale" hint={t('settings.defaultLanguageHint')}>
          <select
            id="settings-default-locale"
            className="form-select"
            value={localeValue}
            onChange={(e) => update((d) => { d.defaultLocale = e.target.value; })}
          >
            {localeChoices.map((o) => (
              <option key={o.code} value={o.code} lang={o.code}>{o.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Hierarchy levels</h4>
        <div style={{ ...hintStyle, marginBottom: '10px' }}>
          Names of the organization levels from top to bottom (2–8 levels, up to 30 characters each). Not part of the platform defaults, so "Reset section" leaves them unchanged.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {levels.map((level, i) => (
            <div key={i} style={rowStyle}>
              <span style={{ width: '24px', flexShrink: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>{i + 1}.</span>
              <input
                type="text"
                className="form-input"
                aria-label={`Hierarchy level ${i + 1}`}
                value={level}
                maxLength={30}
                onChange={(e) => update((d) => { (d.hierarchyLevels ?? [])[i] = e.target.value; })}
              />
              <button type="button" style={iconButtonStyle} aria-label="Move level up" disabled={i === 0} onClick={() => moveLevel(i, i - 1)}>
                <ArrowUp size={14} />
              </button>
              <button type="button" style={iconButtonStyle} aria-label="Move level down" disabled={i === levels.length - 1} onClick={() => moveLevel(i, i + 1)}>
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                style={iconButtonStyle}
                aria-label="Remove level"
                disabled={levels.length <= 2}
                onClick={() => update((d) => { d.hierarchyLevels = (d.hierarchyLevels ?? []).filter((_, idx) => idx !== i); })}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '8px' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus size={14} />}
            disabled={levels.length >= 8}
            onClick={() => update((d) => { d.hierarchyLevels = [...(d.hierarchyLevels ?? []), '']; })}
          >
            Add level
          </Button>
        </div>
      </div>
    </>
  );
};

// --- Scoring ---
const SCORING_METHODS: Array<{ value: ScoringMethod; label: string; description: string }> = [
  {
    value: 'POOLED',
    label: 'Pooled',
    description: 'All question points are added together: earned points ÷ possible points across the whole checklist (question weightage applies).',
  },
  {
    value: 'PILLAR_WEIGHTED',
    label: 'Pillar-weighted',
    description: "Each 5S pillar is scored as its own percentage, then the pillar percentages are combined using the template's pillar weights.",
  },
];

export const ScoringSection: React.FC<SectionBodyProps> = ({ draft, update }) => (
  <>
    <div role="radiogroup" aria-label="Scoring method" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
      {SCORING_METHODS.map((m) => {
        const selected = draft.scoring.method === m.value;
        return (
          <label
            key={m.value}
            style={{
              ...rowStyle,
              alignItems: 'flex-start',
              cursor: 'pointer',
              borderColor: selected ? 'var(--color-primary)' : 'var(--border-subtle)',
              background: selected ? 'var(--bg-pale)' : 'var(--bg-surface)',
            }}
          >
            <input
              type="radio"
              name="scoring-method"
              checked={selected}
              onChange={() => update((d) => { d.scoring.method = m.value; })}
              style={{ marginTop: '3px' }}
            />
            <span>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</span>
              <span style={{ display: 'block', ...hintStyle, marginTop: '2px' }}>{m.description}</span>
            </span>
          </label>
        );
      })}
    </div>

    <div style={gridStyle}>
      <Field label="Pass mark" htmlFor="settings-pass-score" hint="An audit at or above this score counts as passed.">
        <NumberInput id="settings-pass-score" value={draft.analytics.passScore} min={0} max={100} step={0.5} suffix="%" onChange={(v) => update((d) => { d.analytics.passScore = v; })} />
      </Field>
      <Field label="Target score" htmlFor="settings-target-score" hint="Goal line shown on dashboards and trends.">
        <NumberInput id="settings-target-score" value={draft.analytics.targetScore} min={0} max={100} step={0.5} suffix="%" onChange={(v) => update((d) => { d.analytics.targetScore = v; })} />
      </Field>
      <Field label="Critical-fail cap" htmlFor="settings-critical-cap" hint="Score ceiling when a critical question fails and the question sets no cap of its own.">
        <NumberInput id="settings-critical-cap" value={draft.scoring.criticalFailCap} min={0} max={100} step={0.5} suffix="%" onChange={(v) => update((d) => { d.scoring.criticalFailCap = v; })} />
      </Field>
      <Field label="Finding threshold" htmlFor="settings-finding-threshold" hint="An answer scoring below this share of its maximum raises a finding.">
        <NumberInput id="settings-finding-threshold" value={draft.scoring.findingThresholdPercent} min={1} max={100} step={0.5} suffix="%" onChange={(v) => update((d) => { d.scoring.findingThresholdPercent = v; })} />
      </Field>
    </div>
  </>
);

// --- SLA ---
export const SlaSection: React.FC<SectionBodyProps> = ({ draft, update }) => (
  <>
    <div style={hintStyle}>Default corrective-action target, in hours from creation (or acknowledgement), per finding severity. 1–8760 hours (one year).</div>
    <div style={gridStyle}>
      {SEVERITIES.map((s) => {
        const hours = draft.sla.hoursBySeverity[s.value];
        return (
          <Field key={s.value} label={s.label} htmlFor={`settings-sla-${s.value}`} hint={hoursAsDays(hours)}>
            <NumberInput
              id={`settings-sla-${s.value}`}
              value={hours}
              min={1}
              max={8760}
              suffix="hours"
              onChange={(v) => update((d) => { d.sla.hoursBySeverity[s.value] = v; })}
            />
          </Field>
        );
      })}
    </div>
  </>
);

// --- Escalation ---
export const EscalationSection: React.FC<SectionBodyProps> = ({ draft, update }) => {
  const steps = draft.escalation.actionSteps;
  const nextOffset = () => {
    const used = new Set(steps.map((s) => s.offsetDays));
    let candidate = steps.length ? Math.max(...steps.filter((s) => Number.isFinite(s.offsetDays)).map((s) => s.offsetDays), 0) + 1 : 0;
    while (used.has(candidate) && candidate < 90) candidate++;
    return Math.min(candidate, 90);
  };

  return (
    <>
      <div>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Corrective-action escalation ladder</h4>
        <div style={{ ...hintStyle, marginBottom: '10px' }}>
          Day offsets are relative to the action's due date: negative = reminder before due, 0 = on the due date, positive = days overdue. Up to 10 steps, each with a distinct offset.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {steps.map((step, i) => (
            <div key={i} style={{ ...rowStyle, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ width: '170px', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <NumberInput
                  ariaLabel={`Step ${i + 1} day offset`}
                  value={step.offsetDays}
                  min={-30}
                  max={90}
                  suffix="days"
                  onChange={(v) => update((d) => { d.escalation.actionSteps[i].offsetDays = v; })}
                />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}>{escalationOffsetLabel(step.offsetDays)}</span>
              </div>
              <div style={{ flex: 1, minWidth: 'min(240px, 100%)' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Notify</div>
                <RecipientPicker
                  label={`Step ${i + 1} recipients`}
                  value={step.notify}
                  onChange={(v: EscalationRecipient[]) => update((d) => { d.escalation.actionSteps[i].notify = v; })}
                />
              </div>
              <button
                type="button"
                style={iconButtonStyle}
                aria-label={`Remove step ${i + 1}`}
                onClick={() => update((d) => { d.escalation.actionSteps = d.escalation.actionSteps.filter((_, idx) => idx !== i); })}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {steps.length === 0 && <div style={hintStyle}>No escalation steps: overdue actions will not trigger reminders.</div>}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus size={14} />}
            disabled={steps.length >= 10}
            onClick={() => update((d) => { d.escalation.actionSteps = [...d.escalation.actionSteps, { offsetDays: nextOffset(), notify: ['ASSIGNEE'] }]; })}
          >
            Add step
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={steps.length < 2}
            onClick={() => update((d) => { d.escalation.actionSteps = [...d.escalation.actionSteps].sort((a, b) => a.offsetDays - b.offsetDays); })}
          >
            Sort by day
          </Button>
        </div>
      </div>

      <Field label="Overdue audit notifications" hint="Notified when a scheduled audit passes its due date without being completed.">
        <RecipientPicker
          label="Overdue audit recipients"
          value={draft.escalation.overdueAuditNotify}
          onChange={(v) => update((d) => { d.escalation.overdueAuditNotify = v; })}
        />
      </Field>

      <Toggle
        id="settings-daily-digest"
        checked={draft.escalation.dailyDigest}
        onChange={(v) => update((d) => { d.escalation.dailyDigest = v; })}
        label="Daily digest"
        description="Each user with open work receives one daily summary of it."
      />
      <Toggle
        id="settings-manager-digest"
        checked={draft.escalation.managerDigest}
        onChange={(v) => update((d) => { d.escalation.managerDigest = v; })}
        label="Manager digest"
        description="Plant heads, department heads, 5S coordinators and executives receive one daily summary of their scope: audits due, overdue actions, new critical observations, ageing red tags and the last day's verified actions."
      />

      <div style={gridStyle}>
        <Field label="Digest time" htmlFor="settings-digest-hour" hint="Digests go out at the first reminder run after this hour, once per day.">
          <select
            id="settings-digest-hour"
            className="form-select"
            value={Number.isInteger(draft.escalation.digestHour) ? draft.escalation.digestHour : 8}
            onChange={(e) => update((d) => { d.escalation.digestHour = Number(e.target.value); })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Time zone"
          htmlFor="settings-time-zone"
          hint="The digest time and the digest day are read in this time zone, not the server's. Use an IANA name such as Asia/Kolkata."
        >
          <input
            id="settings-time-zone"
            type="text"
            className="form-input"
            list="settings-time-zone-options"
            value={draft.escalation.timeZone}
            maxLength={64}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => update((d) => { d.escalation.timeZone = e.target.value; })}
          />
          <datalist id="settings-time-zone-options">
            {TIME_ZONE_SUGGESTIONS.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </Field>
      </div>

      <RunRemindersPanel />
    </>
  );
};

const CHECK_LABELS: Record<SchedulerCheck, string> = {
  actionEscalation: 'Corrective-action reminders and escalations',
  auditOverdue: 'Overdue audits',
  auditDueSoon: 'Audits due soon',
  criticalObservation: 'Critical observations',
  redTagAgeing: 'Red tags past their disposition date',
  certificateExpiring: 'Expiring auditor certificates',
  trialEnding: 'Trial ending',
  dailyDigest: 'Daily digests',
  managerDigest: 'Manager digests',
};

/** Runs one reminder / escalation pass for this organization now (organization administrators only). */
const RunRemindersPanel: React.FC = () => {
  const { can, addToast } = useApp();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SchedulerRunSummary | null>(null);
  if (!can('ORG_ADMINS')) return null;

  const run = async () => {
    setRunning(true);
    try {
      const summary = await adminApi.runReminders();
      setResult(summary);
      addToast({
        type: 'success',
        title: 'Reminders run',
        message: summary.notificationsCreated
          ? `${summary.notificationsCreated} notification(s) sent.`
          : 'Nothing new to send. Reminders already sent are not repeated.',
      });
    } catch (err) {
      addToast({ type: 'error', title: 'Reminders not run', message: getApiErrorMessage(err, 'Could not run the reminder scan.') });
    } finally {
      setRunning(false);
    }
  };

  const checks = result ? (Object.entries(result.byCheck) as Array<[SchedulerCheck, number]>).filter(([, n]) => n > 0) : [];
  return (
    <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Run reminders now</div>
          <div style={hintStyle}>
            Reminders, escalations and digests normally run every 15 minutes. This runs one pass for this organization now with the saved settings. Nothing is sent twice.
          </div>
        </div>
        <Button variant="secondary" icon={<BellRing size={16} />} loading={running} onClick={run}>
          Run reminders now
        </Button>
      </div>
      {result && (
        <div role="status" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{result.notificationsCreated} notification(s) sent.</strong>{' '}
          {result.escalationTiersUpdated} escalation level change(s), {result.actionsBecameOverdue} action(s) newly overdue.
          {!result.digestWindowOpen && ' Digests are not due yet (before the digest time).'}
          {checks.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
              {checks.map(([key, n]) => (
                <li key={key}>
                  {CHECK_LABELS[key] ?? key}: {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

// --- Corrective actions ---
export const CapaSection: React.FC<SectionBodyProps> = ({ draft, update }) => (
  <>
    <div style={hintStyle}>
      Corrective actions are normally closed only with closure comments and an after photograph. Closure comments stay mandatory whatever is chosen here.
    </div>
    <Toggle
      id="settings-capa-closure-without-photo"
      checked={draft.capa.allowClosureWithoutPhoto}
      onChange={(v) => update((d) => { d.capa.allowClosureWithoutPhoto = v; })}
      label="Allow closure without an after photo"
      description="When on, the person closing an action may skip the after photograph by recording a justification, for example where photography is not permitted. The justification is kept with the action."
    />
  </>
);

// --- Recognition ---
export const RecognitionSection: React.FC<SectionBodyProps> = ({ draft, update }) => (
  <>
    <Toggle
      id="settings-gamification-enabled"
      checked={draft.gamification.enabled}
      onChange={(v) => update((d) => { d.gamification.enabled = v; })}
      label="Recognition and points"
      description="XP, levels, badges, floating trophies, kudos and leaderboards. When off, the recognition page shows no content and no trophies or kudos can be given. Past awards are kept."
    />
    <Toggle
      id="settings-gamification-individual"
      checked={draft.gamification.showIndividualLeaderboard}
      onChange={(v) => update((d) => { d.gamification.showIndividualLeaderboard = v; })}
      label="Show the individual leaderboard"
      description="Ranks people by points. Turn off to show only area and department rankings."
    />
  </>
);

// --- Numbering ---
export const NumberingSection: React.FC<SectionBodyProps> = ({ draft, update }) => (
  <>
    <div style={hintStyle}>
      Prefixes for new document numbers: 2–10 upper-case letters or digits, starting with a letter, and distinct from each other. Existing numbers are not renamed.
    </div>
    <div style={gridStyle}>
      {NUMBERING_KINDS.map(({ key, label }) => {
        const value = draft.numbering[key] ?? '';
        const valid = PREFIX_PATTERN.test(value);
        return (
          <Field
            key={key}
            label={label}
            htmlFor={`settings-prefix-${key}`}
            hint={
              <span>
                Example:{' '}
                <code className="code-tag" style={{ color: valid ? undefined : 'var(--color-danger)' }}>
                  {numberingExample(value)}
                </code>
              </span>
            }
          >
            <input
              id={`settings-prefix-${key}`}
              type="text"
              className="form-input"
              value={value}
              maxLength={10}
              onChange={(e) => update((d) => { d.numbering[key] = e.target.value.toUpperCase().replace(/\s/g, ''); })}
              style={{ fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase' }}
            />
          </Field>
        );
      })}
    </div>
  </>
);

// --- Terminology ---
export const TerminologySection: React.FC<SectionBodyProps> = ({ draft, update }) => (
  <>
    <div style={hintStyle}>Rename core concepts to match your organization's vocabulary (singular form, 1–40 characters). Navigation and page titles follow these labels.</div>
    <div style={gridStyle}>
      {TERM_FIELDS.map(({ key, label, hint }) => (
        <Field key={key} label={label} htmlFor={`settings-term-${key}`} hint={hint}>
          <input
            id={`settings-term-${key}`}
            type="text"
            className="form-input"
            value={draft.terminology[key] ?? ''}
            maxLength={40}
            onChange={(e) => update((d) => { d.terminology[key] = e.target.value; })}
          />
        </Field>
      ))}
    </div>
  </>
);

// --- Competency ---
export const CompetencySection: React.FC<SectionBodyProps> = ({ draft, update }) => {
  const c = draft.competency;
  return (
    <>
      <Toggle
        id="settings-require-certified"
        checked={c.requireCertifiedAuditors}
        onChange={(v) => update((d) => { d.competency.requireCertifiedAuditors = v; })}
        label="Require certified auditors"
        description="When on, only users holding a valid (not expired or revoked) training certificate can start or conduct audits. Turn on once your auditors have passed the competency quiz."
      />
      <div style={gridStyle}>
        <Field label="Quiz pass mark" htmlFor="settings-quiz-pass" hint="Minimum score to pass the competency quiz (50–100%).">
          <NumberInput id="settings-quiz-pass" value={c.quizPassPercent} min={50} max={100} suffix="%" onChange={(v) => update((d) => { d.competency.quizPassPercent = v; })} />
        </Field>
        <Field label="Certificate validity" htmlFor="settings-cert-validity" hint="How long a new certificate stays valid (1–60 months).">
          <NumberInput id="settings-cert-validity" value={c.certificateValidityMonths} min={1} max={60} suffix="months" onChange={(v) => update((d) => { d.competency.certificateValidityMonths = v; })} />
        </Field>
      </div>
      <Field label="Certificate title" htmlFor="settings-cert-title" hint="Printed on newly issued certificates (up to 120 characters).">
        <input
          id="settings-cert-title"
          type="text"
          className="form-input"
          value={c.certificateTitle}
          maxLength={120}
          onChange={(e) => update((d) => { d.competency.certificateTitle = e.target.value; })}
        />
      </Field>

      <div>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Signatories</h4>
        <div style={{ ...hintStyle, marginBottom: '10px' }}>Up to 3 people whose names and titles appear on certificates. With none, certificates show blank signature lines.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {c.signatories.map((sig, i) => (
            <div key={i} style={{ ...rowStyle, flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-input"
                aria-label={`Signatory ${i + 1} name`}
                placeholder="Name"
                value={sig.name}
                maxLength={80}
                onChange={(e) => update((d) => { d.competency.signatories[i].name = e.target.value; })}
                style={{ flex: 1, minWidth: '160px' }}
              />
              <input
                type="text"
                className="form-input"
                aria-label={`Signatory ${i + 1} title`}
                placeholder="Title, e.g. Plant Head"
                value={sig.title}
                maxLength={80}
                onChange={(e) => update((d) => { d.competency.signatories[i].title = e.target.value; })}
                style={{ flex: 1, minWidth: '160px' }}
              />
              <button
                type="button"
                style={iconButtonStyle}
                aria-label={`Remove signatory ${i + 1}`}
                onClick={() => update((d) => { d.competency.signatories = d.competency.signatories.filter((_, idx) => idx !== i); })}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '8px' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus size={14} />}
            disabled={c.signatories.length >= 3}
            onClick={() => update((d) => { d.competency.signatories = [...d.competency.signatories, { name: '', title: '' }]; })}
          >
            Add signatory
          </Button>
        </div>
      </div>
    </>
  );
};

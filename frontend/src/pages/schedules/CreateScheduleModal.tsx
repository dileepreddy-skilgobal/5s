import React, { useEffect, useState } from 'react';
import { AuditSchedule, AuditTemplate, Location, OrgNode, User } from '../../types';
import { AuditTypeCode, UpdateSchedulePayload } from '../../types/audits';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { CreateSchedulePayload } from '../../services/auditPlanningApi';
import { FieldError, SCHEDULABLE_AUDIT_TYPES, auditTypeLabel } from '../templates/templateShared';
import { RECURRENCE_LABELS, ROTATION_LABELS, TARGET_TYPE_LABELS, dayKey, personName } from './scheduleShared';

/** Same bound as the server (MAX_LEAD_TIME_DAYS). */
const MAX_LEAD_TIME_DAYS = 90;
const DEFAULT_LEAD_TIME_DAYS = 2;

interface CreateScheduleModalProps {
  isOpen: boolean;
  /** Schedule being edited; omitted when creating. */
  schedule?: AuditSchedule | null;
  templates: AuditTemplate[];
  locations: Location[];
  orgNodes: OrgNode[];
  auditors: User[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateSchedulePayload) => void;
  /** Called instead of onSubmit when editing; only changed fields are sent. */
  onUpdate?: (schedule: AuditSchedule, payload: UpdateSchedulePayload) => void;
}

interface FormState {
  title: string;
  templateId: string;
  auditType: AuditTypeCode;
  targetType: AuditSchedule['targetType'];
  targetOrgNodeId: string;
  targetLocationIds: string[];
  recurrence: AuditSchedule['recurrence'];
  customDays: string;
  rotationRule: AuditSchedule['rotationRule'];
  preferredAuditorId: string;
  /** Create: first audit date. Edit: next cycle date. */
  startDate: string;
  leadTimeDays: string;
}

const isAuditTypeCode = (value: string): value is AuditTypeCode => (SCHEDULABLE_AUDIT_TYPES as readonly string[]).includes(value);

const emptyForm = (): FormState => ({
  title: '',
  templateId: '',
  auditType: 'ROUTINE',
  targetType: 'SPECIFIC_LOCATIONS',
  targetOrgNodeId: '',
  targetLocationIds: [],
  recurrence: 'WEEKLY',
  customDays: '',
  rotationRule: 'DEPT_INDEPENDENCE',
  preferredAuditorId: '',
  startDate: dayKey(new Date()),
  leadTimeDays: String(DEFAULT_LEAD_TIME_DAYS),
});

const formFromSchedule = (s: AuditSchedule): FormState => ({
  title: s.title,
  templateId: s.templateId,
  auditType: isAuditTypeCode(s.auditType) ? s.auditType : 'ROUTINE',
  targetType: s.targetType,
  targetOrgNodeId: s.targetOrgNodeId ?? '',
  targetLocationIds: s.targetLocationIds ?? [],
  recurrence: s.recurrence,
  customDays: s.recurrence === 'CUSTOM_DAYS' ? String(s.recurrenceIntervalDays) : '',
  rotationRule: s.rotationRule,
  preferredAuditorId: s.preferredAuditorId ?? '',
  startDate: dayKey(s.nextRunAt ?? s.startDate),
  leadTimeDays: String(s.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS),
});

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

export const CreateScheduleModal: React.FC<CreateScheduleModalProps> = ({
  isOpen,
  schedule,
  templates,
  locations,
  orgNodes,
  auditors,
  saving,
  onClose,
  onSubmit,
  onUpdate,
}) => {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editing = !!schedule;

  useEffect(() => {
    if (isOpen) {
      setForm(schedule ? formFromSchedule(schedule) : emptyForm());
      setErrors({});
    }
  }, [isOpen, schedule]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const nodeTypeFor = form.targetType === 'PLANT' ? 'PLANT' : 'DEPARTMENT';
  const nodeOptions = orgNodes.filter((n) => n.nodeType === nodeTypeFor);
  // The template of an existing schedule cannot change; show it even if it is no longer active
  const templateOptions =
    schedule && schedule.template && !templates.some((t) => t.id === schedule.templateId) ? [...templates, schedule.template] : templates;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const customDays = Number(form.customDays);
    const leadTime = Number(form.leadTimeDays);
    if (!form.title.trim()) next.title = 'Enter a title.';
    if (!form.templateId) next.templateId = 'Choose a template.';
    if ((form.targetType === 'PLANT' || form.targetType === 'DEPARTMENT') && !form.targetOrgNodeId) next.target = `Choose a ${form.targetType === 'PLANT' ? 'plant' : 'department'}.`;
    if (form.targetType === 'SPECIFIC_LOCATIONS' && form.targetLocationIds.length === 0) next.target = 'Select at least one location.';
    if (form.recurrence === 'CUSTOM_DAYS' && (!Number.isInteger(customDays) || customDays < 1)) next.customDays = 'Enter a whole number of days (1 or more).';
    if (form.rotationRule === 'ASSIGNED_AUDITOR' && !form.preferredAuditorId) next.auditor = 'Choose the auditor.';
    if (!form.startDate) next.startDate = editing ? 'Choose the date of the next audit.' : 'Choose a start date.';
    if (form.leadTimeDays.trim() === '' || !Number.isInteger(leadTime) || leadTime < 0 || leadTime > MAX_LEAD_TIME_DAYS)
      next.leadTimeDays = `Enter a whole number of days from 0 to ${MAX_LEAD_TIME_DAYS}.`;
    setErrors(next);
    if (Object.keys(next).length) return;

    const usesNode = form.targetType === 'PLANT' || form.targetType === 'DEPARTMENT';
    // Local midnight of the chosen day, sent as an instant
    const dateInstant = new Date(`${form.startDate}T00:00:00`).toISOString();

    if (schedule && onUpdate) {
      const original = formFromSchedule(schedule);
      const payload: UpdateSchedulePayload = {};
      if (form.title.trim() !== schedule.title) payload.title = form.title.trim();
      if (form.auditType !== original.auditType) payload.auditType = form.auditType;
      if (form.recurrence !== schedule.recurrence || (form.recurrence === 'CUSTOM_DAYS' && customDays !== schedule.recurrenceIntervalDays)) {
        payload.recurrence = form.recurrence;
        if (form.recurrence === 'CUSTOM_DAYS') payload.recurrenceIntervalDays = customDays;
      }
      if (form.rotationRule !== schedule.rotationRule) payload.rotationRule = form.rotationRule;
      const auditorId = form.rotationRule === 'ASSIGNED_AUDITOR' ? form.preferredAuditorId : null;
      if (auditorId !== (schedule.preferredAuditorId ?? null)) payload.preferredAuditorId = auditorId;
      if (
        form.targetType !== schedule.targetType ||
        (usesNode && form.targetOrgNodeId !== (schedule.targetOrgNodeId ?? '')) ||
        (form.targetType === 'SPECIFIC_LOCATIONS' && !sameIds(form.targetLocationIds, schedule.targetLocationIds ?? []))
      ) {
        payload.targetType = form.targetType;
        payload.targetOrgNodeId = usesNode ? form.targetOrgNodeId : null;
        payload.targetLocationIds = form.targetType === 'SPECIFIC_LOCATIONS' ? form.targetLocationIds : [];
      }
      if (leadTime !== schedule.leadTimeDays) payload.leadTimeDays = leadTime;
      if (form.startDate !== original.startDate) payload.nextRunAt = dateInstant;
      onUpdate(schedule, payload);
      return;
    }

    onSubmit({
      title: form.title.trim(),
      templateId: form.templateId,
      auditType: form.auditType,
      targetType: form.targetType,
      targetOrgNodeId: usesNode ? form.targetOrgNodeId : undefined,
      targetLocationIds: form.targetType === 'SPECIFIC_LOCATIONS' ? form.targetLocationIds : undefined,
      recurrence: form.recurrence,
      // Named recurrences use the server's fixed interval
      recurrenceIntervalDays: form.recurrence === 'CUSTOM_DAYS' ? customDays : undefined,
      rotationRule: form.rotationRule,
      preferredAuditorId: form.rotationRule === 'ASSIGNED_AUDITOR' ? form.preferredAuditorId : undefined,
      startDate: dateInstant,
      leadTimeDays: leadTime,
    });
  };

  const describedBy = (key: string) => (errors[key] ? `sched-${key}-error` : undefined);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={schedule ? `Edit schedule ${schedule.scheduleCode}` : 'New audit schedule'}
      subtitle={
        schedule
          ? 'Changes apply to audits created from now on; audits already planned keep their date and auditor.'
          : 'Audits for the first cycle are created as soon as you save.'
      }
      maxWidth="640px"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="schedule-form" loading={saving} disabled={saving}>
            {schedule ? 'Save changes' : 'Create schedule'}
          </Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="form-section-title" style={{ marginTop: 0, marginBottom: 0 }}>Schedule</div>
        <div className="form-group">
          <label className="form-label" htmlFor="sched-title">Title<span className="required" aria-hidden="true"> *</span></label>
          <input
            id="sched-title"
            type="text"
            placeholder="e.g. Weekly 5S audit – assembly"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            className="form-control"
            aria-invalid={!!errors.title}
            aria-describedby={describedBy('title')}
          />
          <FieldError id="sched-title-error" message={errors.title} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="sched-template">Template<span className="required" aria-hidden="true"> *</span></label>
            <select
              id="sched-template"
              value={form.templateId}
              onChange={(e) => set('templateId', e.target.value)}
              className="form-control"
              disabled={editing}
              aria-invalid={!!errors.templateId}
              aria-describedby={editing ? 'sched-template-hint' : describedBy('templateId')}
            >
              <option value="">Choose a template</option>
              {templateOptions.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.code} — {tpl.name}
                </option>
              ))}
            </select>
            {editing ? (
              <div id="sched-template-hint" className="form-hint">The template of a schedule cannot change. Create a new schedule to use another template.</div>
            ) : (
              templates.length === 0 && <div className="form-hint">No active templates. Publish a template version first.</div>
            )}
            <FieldError id="sched-templateId-error" message={errors.templateId} />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="sched-audit-type">Audit type<span className="required" aria-hidden="true"> *</span></label>
            <select
              id="sched-audit-type"
              value={form.auditType}
              onChange={(e) => {
                if (isAuditTypeCode(e.target.value)) set('auditType', e.target.value);
              }}
              className="form-control"
              aria-describedby="sched-audit-type-hint"
            >
              {SCHEDULABLE_AUDIT_TYPES.map((t) => (
                <option key={t} value={t}>{auditTypeLabel(t)}</option>
              ))}
            </select>
            <div id="sched-audit-type-hint" className="form-hint">
              {form.auditType === 'SELF' ? 'Self-audits are assigned to each area’s owner.' : 'Shown on every audit this schedule creates.'}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="sched-recurrence">Repeats<span className="required" aria-hidden="true"> *</span></label>
            <select id="sched-recurrence" value={form.recurrence} onChange={(e) => set('recurrence', e.target.value as AuditSchedule['recurrence'])} className="form-control">
              {(Object.keys(RECURRENCE_LABELS) as AuditSchedule['recurrence'][]).map((r) => (
                <option key={r} value={r}>{RECURRENCE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          {form.recurrence === 'CUSTOM_DAYS' && (
            <div className="form-group">
              <label className="form-label" htmlFor="sched-days">Every how many days<span className="required" aria-hidden="true"> *</span></label>
              <input
                id="sched-days"
                type="number"
                min={1}
                step={1}
                value={form.customDays}
                onChange={(e) => set('customDays', e.target.value)}
                className="form-control"
                aria-invalid={!!errors.customDays}
                aria-describedby={describedBy('customDays')}
              />
              <FieldError id="sched-customDays-error" message={errors.customDays} />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="sched-start">
              {editing ? 'Next audit on' : 'First audit on'}
              <span className="required" aria-hidden="true"> *</span>
            </label>
            <input
              id="sched-start"
              type="date"
              value={form.startDate}
              onChange={(e) => set('startDate', e.target.value)}
              className="form-control"
              aria-invalid={!!errors.startDate}
              aria-describedby={describedBy('startDate')}
            />
            <FieldError id="sched-startDate-error" message={errors.startDate} />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="sched-lead">Create audits (days ahead)<span className="required" aria-hidden="true"> *</span></label>
            <input
              id="sched-lead"
              type="number"
              min={0}
              max={MAX_LEAD_TIME_DAYS}
              step={1}
              value={form.leadTimeDays}
              onChange={(e) => set('leadTimeDays', e.target.value)}
              className="form-control"
              aria-invalid={!!errors.leadTimeDays}
              aria-describedby={errors.leadTimeDays ? 'sched-leadTimeDays-error sched-lead-hint' : 'sched-lead-hint'}
            />
            <div id="sched-lead-hint" className="form-hint">Each cycle’s audits are created and assigned this many days before their planned date.</div>
            <FieldError id="sched-leadTimeDays-error" message={errors.leadTimeDays} />
          </div>
        </div>

        <div className="form-section-title" style={{ marginBottom: 0 }}>Auditor</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="sched-rotation">Who audits</label>
            <select id="sched-rotation" value={form.rotationRule} onChange={(e) => set('rotationRule', e.target.value as AuditSchedule['rotationRule'])} className="form-control">
              {(Object.keys(ROTATION_LABELS) as AuditSchedule['rotationRule'][]).map((r) => (
                <option key={r} value={r}>{ROTATION_LABELS[r]}</option>
              ))}
            </select>
          </div>
          {form.rotationRule === 'ASSIGNED_AUDITOR' && (
            <div className="form-group">
              <label className="form-label" htmlFor="sched-auditor">Auditor<span className="required" aria-hidden="true"> *</span></label>
              <select
                id="sched-auditor"
                value={form.preferredAuditorId}
                onChange={(e) => set('preferredAuditorId', e.target.value)}
                className="form-control"
                aria-invalid={!!errors.auditor}
                aria-describedby={describedBy('auditor')}
              >
                <option value="">Choose an auditor</option>
                {auditors.map((u) => (
                  <option key={u.id} value={u.id}>{personName(u)}</option>
                ))}
              </select>
              <FieldError id="sched-auditor-error" message={errors.auditor} />
            </div>
          )}
        </div>

        <div className="form-section-title" style={{ marginBottom: 0 }}>Coverage</div>
        <div className="form-group">
          <label className="form-label" htmlFor="sched-target">Locations covered</label>
          <select
            id="sched-target"
            value={form.targetType}
            onChange={(e) => setForm((f) => ({ ...f, targetType: e.target.value as AuditSchedule['targetType'], targetOrgNodeId: '' }))}
            className="form-control"
          >
            {(Object.keys(TARGET_TYPE_LABELS) as AuditSchedule['targetType'][]).map((t) => (
              <option key={t} value={t}>{TARGET_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {(form.targetType === 'PLANT' || form.targetType === 'DEPARTMENT') && (
          <div className="form-group">
            <label className="form-label" htmlFor="sched-node">{form.targetType === 'PLANT' ? 'Plant' : 'Department'}<span className="required" aria-hidden="true"> *</span></label>
            <select
              id="sched-node"
              value={form.targetOrgNodeId}
              onChange={(e) => set('targetOrgNodeId', e.target.value)}
              className="form-control"
              aria-invalid={!!errors.target}
              aria-describedby={describedBy('target')}
            >
              <option value="">Choose…</option>
              {nodeOptions.map((n) => (
                <option key={n.id} value={n.id}>{n.code} — {n.name}</option>
              ))}
            </select>
            {nodeOptions.length === 0 && <div className="form-hint">No {form.targetType === 'PLANT' ? 'plants' : 'departments'} in the organization structure.</div>}
            <FieldError id="sched-target-error" message={errors.target} />
          </div>
        )}

        {form.targetType === 'SPECIFIC_LOCATIONS' && (
          <fieldset className="form-group" style={{ border: 'none', padding: 0, margin: 0 }} aria-describedby={describedBy('target')}>
            <legend className="form-label">
              Locations<span className="required" aria-hidden="true"> *</span>{' '}
              <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>({form.targetLocationIds.length} selected)</span>
            </legend>
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', padding: '4px 12px', background: 'var(--bg-surface)' }}>
              {locations.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '8px 0' }}>No locations yet.</div>
              ) : (
                locations.map((loc) => {
                  const checked = form.targetLocationIds.includes(loc.id);
                  return (
                    <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '40px', fontSize: '13.5px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          set('targetLocationIds', checked ? form.targetLocationIds.filter((x) => x !== loc.id) : [...form.targetLocationIds, loc.id])
                        }
                      />
                      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                        <span className="code-tag">{loc.areaCode}</span> {loc.name}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <FieldError id="sched-target-error" message={errors.target} />
          </fieldset>
        )}
      </form>
    </Modal>
  );
};

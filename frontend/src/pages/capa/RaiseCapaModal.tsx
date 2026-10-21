import React, { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../services/api';
import { capaApi } from '../../services/api-capa';
import { useApp } from '../../context/AppContext';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { PILLAR_LABELS, PILLARS, SEVERITY_LABELS } from '../../constants/labels';
import type { Location, User } from '../../types';
import type { CapaRecord, CreateCapaInput } from '../../types/capa';
import { Plus } from 'lucide-react';

/** What the corrective action is raised from. */
export type RaiseCapaOrigin =
  | { kind: 'observation'; observationId: string; code: string; title: string; description?: string | null; locationId: string }
  | { kind: 'redTag'; redTagId: string; code: string; itemName: string; reason?: string | null; locationName?: string | null }
  | { kind: 'standalone'; locationId?: string };

interface RaiseCapaModalProps {
  isOpen: boolean;
  origin: RaiseCapaOrigin | null;
  onClose: () => void;
  onCreated: (action: CapaRecord) => void;
}

const ACTION_TYPES: Array<{ value: string; label: string }> = [
  { value: 'CORRECTIVE', label: 'Corrective (fix the problem)' },
  { value: 'PREVENTIVE', label: 'Preventive (stop it happening elsewhere)' },
  { value: 'KAIZEN', label: 'Kaizen (improvement)' },
];

/** Local calendar date as YYYY-MM-DD. */
const localDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fullName = (u: Pick<User, 'firstName' | 'lastName'>) => `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();

interface FormState {
  title: string;
  description: string;
  locationId: string;
  severity: string;
  category: string;
  actionType: string;
  assigneeId: string;
  dueDate: string;
}

type FormErrors = Partial<Record<'title' | 'description' | 'locationId' | 'dueDate', string>>;

const initialForm = (origin: RaiseCapaOrigin | null): FormState => ({
  title: origin?.kind === 'observation' ? origin.title : origin?.kind === 'redTag' ? `Remove the cause of red tag ${origin.code}` : '',
  description:
    origin?.kind === 'observation'
      ? origin.description ?? ''
      : origin?.kind === 'redTag'
      ? `${origin.itemName}${origin.reason ? `: ${origin.reason}` : ''}`
      : '',
  locationId: origin?.kind === 'standalone' ? origin.locationId ?? '' : origin?.kind === 'observation' ? origin.locationId : '',
  severity: 'MODERATE',
  category: 'S5_SUSTAIN',
  actionType: 'CORRECTIVE',
  assigneeId: '',
  dueDate: '',
});

/**
 * Raise a corrective action from an observation, from a red tag, or standalone (e.g. after a management review).
 * Used by the CAPA, observation and red-tag pages; only shown to action assigners.
 */
export const RaiseCapaModal: React.FC<RaiseCapaModalProps> = ({ isOpen, origin, onClose, onCreated }) => {
  const { addToast } = useApp();
  const [form, setForm] = useState<FormState>(() => initialForm(origin));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  const standalone = origin?.kind === 'standalone';

  useEffect(() => {
    if (!isOpen) return;
    setForm(initialForm(origin));
    setErrors({});
    api
      .getUsers()
      .then((list) => setUsers(list.filter((u) => u.status === 'ACTIVE').sort((a, b) => fullName(a).localeCompare(fullName(b)))))
      .catch((err) => addToast({ type: 'warning', title: 'People not loaded', message: getApiErrorMessage(err, 'The list of people could not be loaded.') }));
    if (origin?.kind === 'standalone') {
      api
        .getLocations()
        .then(setLocations)
        .catch((err) => addToast({ type: 'warning', title: 'Locations not loaded', message: getApiErrorMessage(err, 'The location list could not be loaded.') }));
    }
  }, [isOpen, origin, addToast]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin || saving) return;
    const next: FormErrors = {};
    if (!form.title.trim()) next.title = 'Enter a title.';
    if (!form.description.trim()) next.description = 'Describe what needs to be done.';
    if (standalone && !form.locationId) next.locationId = 'Choose the location.';
    if (form.dueDate && form.dueDate <= localDateKey(new Date())) next.dueDate = 'Choose a date after today.';
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload: CreateCapaInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      actionType: form.actionType,
      assigneeId: form.assigneeId || undefined,
      // End of the chosen day, local time
      targetDate: form.dueDate ? new Date(`${form.dueDate}T23:59:00`).toISOString() : undefined,
    };
    if (origin.kind === 'observation') payload.observationId = origin.observationId;
    if (origin.kind === 'redTag') {
      payload.redTagId = origin.redTagId;
      payload.severity = form.severity;
    }
    if (origin.kind === 'standalone') {
      payload.source = 'MANAGEMENT_REVIEW';
      payload.locationId = form.locationId;
      payload.severity = form.severity;
      payload.category = form.category;
    }

    setSaving(true);
    try {
      const created = await capaApi.create(payload);
      addToast({ type: 'success', title: 'Corrective action raised', message: `${created.actionCode} was assigned.` });
      onCreated(created);
    } catch (err) {
      addToast({ type: 'error', title: 'Not raised', message: getApiErrorMessage(err, 'The corrective action could not be raised.') });
    } finally {
      setSaving(false);
    }
  };

  const subtitle =
    origin?.kind === 'observation'
      ? `From observation ${origin.code}`
      : origin?.kind === 'redTag'
      ? `From red tag ${origin.code}${origin.locationName ? ` at ${origin.locationName}` : ''}`
      : 'Standalone action, for example from a management review';

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Raise corrective action"
      subtitle={subtitle}
      maxWidth="640px"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="raise-capa-form" variant="primary" icon={<Plus size={16} />} loading={saving}>
            Raise action
          </Button>
        </>
      }
    >
      <form id="raise-capa-form" onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column' }}>
        {standalone && (
          <FormField label="Location" required error={errors.locationId}>
            {(p) => (
              <select {...p} className="form-select" value={form.locationId} onChange={(e) => set('locationId', e.target.value)}>
                <option value="">Choose a location</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.areaCode} — {l.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        )}

        <FormField label="Title" required error={errors.title}>
          {(p) => <input {...p} type="text" className="form-input" maxLength={300} value={form.title} onChange={(e) => set('title', e.target.value)} />}
        </FormField>

        <FormField label="What needs to be done" required error={errors.description}>
          {(p) => (
            <textarea {...p} rows={3} className="form-textarea" maxLength={4000} value={form.description} onChange={(e) => set('description', e.target.value)} />
          )}
        </FormField>

        <div className="grid-auto" style={{ ['--min' as string]: '200px', gap: '0 16px' } as React.CSSProperties}>
          {(origin?.kind === 'redTag' || standalone) && (
            <FormField label="Severity" hint="Sets the default due date (SLA).">
              {(p) => (
                <select {...p} className="form-select" value={form.severity} onChange={(e) => set('severity', e.target.value)}>
                  {Object.entries(SEVERITY_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          )}
          {standalone && (
            <FormField label="Pillar">
              {(p) => (
                <select {...p} className="form-select" value={form.category} onChange={(e) => set('category', e.target.value)}>
                  {PILLARS.map((pillar) => (
                    <option key={pillar} value={pillar}>
                      {PILLAR_LABELS[pillar]}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          )}
          <FormField label="Action type">
            {(p) => (
              <select {...p} className="form-select" value={form.actionType} onChange={(e) => set('actionType', e.target.value)}>
                {ACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>

        <div className="grid-auto" style={{ ['--min' as string]: '200px', gap: '0 16px' } as React.CSSProperties}>
          <FormField label="Assignee" hint="Leave empty to assign the area owner.">
            {(p) => (
              <select {...p} className="form-select" value={form.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
                <option value="">Area owner</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {fullName(u)}
                    {u.jobTitle ? ` — ${u.jobTitle}` : ''}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Due date" error={errors.dueDate} hint="Leave empty to use the SLA for the severity.">
            {(p) => (
              <input
                {...p}
                type="date"
                className="form-input"
                min={localDateKey(new Date(Date.now() + 86400000))}
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
              />
            )}
          </FormField>
        </div>
      </form>
    </Modal>
  );
};

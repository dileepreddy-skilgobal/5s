import React, { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '../../services/api';
import { capaApi } from '../../services/api-capa';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import type { User } from '../../types';
import type { CapaRecord } from '../../types/capa';
import { CalendarClock, UserCog } from 'lucide-react';

const fullName = (u: Pick<User, 'firstName' | 'lastName'> | null | undefined) => (u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '');
/** Local calendar date as YYYY-MM-DD. */
const localDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface ManageModalProps {
  /** The action to change; the modal is open while it is set. */
  action: CapaRecord | null;
  onClose: () => void;
  onSaved: (updated: CapaRecord) => void;
}

/** Hand an action to someone else (manager step; recorded in the action's history and the new assignee is told). */
export const ReassignActionModal: React.FC<ManageModalProps> = ({ action, onClose, onSaved }) => {
  const { addToast } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!action) return;
    setAssigneeId('');
    setReason('');
    setError('');
    api
      .getUsers()
      .then((list) => setUsers(list.filter((u) => u.status === 'ACTIVE').sort((a, b) => fullName(a).localeCompare(fullName(b)))))
      .catch((err) => addToast({ type: 'warning', title: 'People not loaded', message: getApiErrorMessage(err, 'The list of people could not be loaded.') }));
  }, [action, addToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!action || saving) return;
    if (!assigneeId) {
      setError('Choose the new assignee.');
      return;
    }
    setSaving(true);
    try {
      const updated = await capaApi.reassign(action.id, { assigneeId, reason: reason.trim() || undefined });
      addToast({ type: 'success', title: 'Action reassigned', message: `${updated.actionCode} is now assigned to ${fullName(updated.assignee) || 'the new assignee'}.` });
      onSaved(updated);
    } catch (err) {
      addToast({ type: 'error', title: 'Not reassigned', message: getApiErrorMessage(err, 'The action could not be reassigned.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!action}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={`Reassign ${action?.actionCode ?? ''}`}
      subtitle={action ? `Currently assigned to ${fullName(action.assignee) || 'nobody'}` : undefined}
      maxWidth="520px"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="capa-reassign-form" variant="primary" icon={<UserCog size={16} />} loading={saving}>
            Reassign
          </Button>
        </>
      }
    >
      <form id="capa-reassign-form" onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column' }}>
        <FormField label="New assignee" required error={error || undefined}>
          {(p) => (
            <select
              {...p}
              className="form-select"
              value={assigneeId}
              onChange={(e) => {
                setAssigneeId(e.target.value);
                if (e.target.value) setError('');
              }}
            >
              <option value="">Choose a person</option>
              {users
                .filter((u) => u.id !== action?.assigneeId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {fullName(u)}
                    {u.jobTitle ? ` — ${u.jobTitle}` : ''}
                  </option>
                ))}
            </select>
          )}
        </FormField>
        <FormField label="Reason" hint="Kept in the action's history." style={{ marginBottom: 0 }}>
          {(p) => (
            <textarea
              {...p}
              rows={2}
              className="form-textarea"
              maxLength={1000}
              placeholder="e.g. Area handed over to the night-shift lead"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
};

/** Move an action's due date with a reason (manager step; resets escalation and is recorded in the history). */
export const ChangeDueDateModal: React.FC<ManageModalProps> = ({ action, onClose, onSaved }) => {
  const { addToast } = useApp();
  const { formatDate } = useI18n();
  const [dueDate, setDueDate] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ dueDate?: string; reason?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!action) return;
    setDueDate('');
    setReason('');
    setErrors({});
  }, [action]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!action || saving) return;
    const next: { dueDate?: string; reason?: string } = {};
    if (!dueDate) next.dueDate = 'Choose the new due date.';
    else if (dueDate <= localDateKey(new Date())) next.dueDate = 'Choose a date after today.';
    if (!reason.trim()) next.reason = 'Say why the due date changes.';
    setErrors(next);
    if (next.dueDate || next.reason) return;
    setSaving(true);
    try {
      // End of the chosen day, local time
      const updated = await capaApi.changeDueDate(action.id, { targetDate: new Date(`${dueDate}T23:59:00`).toISOString(), reason: reason.trim() });
      addToast({ type: 'success', title: 'Due date changed', message: `${updated.actionCode} is now due ${formatDate(updated.targetDate)}.` });
      onSaved(updated);
    } catch (err) {
      addToast({ type: 'error', title: 'Due date not changed', message: getApiErrorMessage(err, 'The due date could not be changed.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!action}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={`Change due date: ${action?.actionCode ?? ''}`}
      subtitle={action ? `Currently due ${formatDate(action.targetDate)}` : undefined}
      maxWidth="520px"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="capa-due-date-form" variant="primary" icon={<CalendarClock size={16} />} loading={saving}>
            Change due date
          </Button>
        </>
      }
    >
      <form id="capa-due-date-form" onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column' }}>
        <FormField label="New due date" required error={errors.dueDate}>
          {(p) => (
            <input
              {...p}
              type="date"
              className="form-input"
              min={localDateKey(new Date(Date.now() + 86400000))}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="Reason" required error={errors.reason} hint="Kept in the action's history; the assignee is told about the new date." style={{ marginBottom: 0 }}>
          {(p) => (
            <textarea
              {...p}
              rows={2}
              className="form-textarea"
              maxLength={1000}
              placeholder="e.g. Spare part arrives on the 20th"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
};

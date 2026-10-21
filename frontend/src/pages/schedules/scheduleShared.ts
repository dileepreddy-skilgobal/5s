import React from 'react';
import { AuditSchedule, ScheduledAuditInstance, User } from '../../types';
import { BadgeVariant } from '../../constants/labels';
import { RoleGroups } from '../../constants/roleGroups';

/** Local-calendar day key (YYYY-MM-DD). toISOString() would shift days for timezones ahead of UTC (e.g. IST). */
export const dayKey = (value: Date | string): string => {
  const d = typeof value === 'string' ? new Date(value) : value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const RECURRENCE_LABELS: Record<AuditSchedule['recurrence'], string> = {
  ONCE: 'Once',
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  FORTNIGHTLY: 'Fortnightly',
  MONTHLY: 'Monthly (every 30 days)',
  QUARTERLY: 'Quarterly (every 91 days)',
  ANNUALLY: 'Yearly',
  CUSTOM_DAYS: 'Every N days',
};

export const ROTATION_LABELS: Record<AuditSchedule['rotationRule'], string> = {
  DEPT_INDEPENDENCE: 'Rotate, never the area owner',
  ROUND_ROBIN: 'Rotate in turn',
  RANDOM: 'Random auditor',
  ASSIGNED_AUDITOR: 'Always the same auditor',
};

export const TARGET_TYPE_LABELS: Record<AuditSchedule['targetType'], string> = {
  ALL_AREAS: 'All active locations',
  PLANT: 'Every location in a plant',
  DEPARTMENT: 'Every location in a department',
  SPECIFIC_LOCATIONS: 'Selected locations',
};

export const SCHEDULE_STATUS_LABELS: Record<AuditSchedule['status'], string> = { ACTIVE: 'Active', PAUSED: 'Paused', COMPLETED: 'Completed' };
export const scheduleStatusVariant = (s: AuditSchedule['status']): BadgeVariant => (s === 'ACTIVE' ? 'success' : s === 'PAUSED' ? 'warning' : 'neutral');

/** Statuses from which an auditor can start (or continue) the audit. */
export const isRunnable = (status: ScheduledAuditInstance['status']) => status === 'SCHEDULED' || status === 'IN_PROGRESS' || status === 'OVERDUE';
/** The server only reschedules or reassigns audits that have not started. */
export const isReassignable = (status: ScheduledAuditInstance['status']) => status === 'SCHEDULED' || status === 'OVERDUE';

/** Past its due date without being started counts as overdue even before the server flags it. */
export const isOverdue = (inst: ScheduledAuditInstance, now = Date.now()) =>
  inst.status === 'OVERDUE' || (inst.status === 'SCHEDULED' && new Date(inst.dueDate).getTime() < now);

/** Effective status used for colour and labels in the calendar. */
export const displayStatus = (inst: ScheduledAuditInstance): ScheduledAuditInstance['status'] => (isOverdue(inst) ? 'OVERDUE' : inst.status);

export const personName = (u?: Pick<User, 'firstName' | 'lastName'> | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

/** Active users holding a role that may conduct audits (same rule the server uses for rotation). */
export const isAuditConductor = (u: User) =>
  u.status === 'ACTIVE' && (u.assignments ?? []).some((a) => (RoleGroups.AUDIT_CONDUCTORS as readonly string[]).includes(a.role.code));

/** Link to Google Calendar's "new event" page pre-filled with this audit (nothing is synced). */
export const buildGoogleCalendarUrl = (instance: ScheduledAuditInstance) => {
  const start = new Date(instance.plannedDate);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const loc = instance.location;
  const place = [loc?.building, loc?.orgNode?.name].filter(Boolean).join(', ');
  const lines = [
    `Audit code: ${instance.auditCode}`,
    loc ? `Location: ${loc.name}${loc.areaCode ? ` (${loc.areaCode})` : ''}` : null,
    instance.templateVersion?.template?.name ? `Template: ${instance.templateVersion.template.name}` : null,
    `Auditor: ${personName(instance.auditor) || 'Unassigned'}`,
    `Due: ${new Date(instance.dueDate).toLocaleDateString()}`,
  ].filter(Boolean);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `5S audit – ${loc?.areaCode || loc?.name || instance.auditCode}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: lines.join('\n'),
  });
  if (place) params.set('location', place);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

export const STATUS_TONE: Record<string, { bg: string; fg: string; border: string }> = {
  SUBMITTED: { bg: 'var(--color-success-bg)', fg: 'var(--color-success)', border: 'var(--color-success-border)' },
  IN_PROGRESS: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning)', border: 'var(--color-warning-border)' },
  OVERDUE: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger)', border: 'var(--color-danger-border)' },
  CANCELLED: { bg: 'var(--bg-surface-subtle)', fg: 'var(--text-tertiary)', border: 'var(--border-subtle)' },
  SCHEDULED: { bg: 'var(--color-info-bg)', fg: 'var(--color-info)', border: 'var(--color-info-border)' },
};

export const panelStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface-subtle)',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  fontSize: '13.5px',
};

export const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' };

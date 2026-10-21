import React from 'react';
import { ScheduledAuditInstance } from '../../types';
import { Button } from '../../components/ui/Button';
import { CalendarClock, CalendarPlus, FileCheck, Smartphone, UserCheck, XCircle } from 'lucide-react';
import { buildGoogleCalendarUrl, isReassignable, isRunnable } from './scheduleShared';

export interface InstanceActionHandlers {
  canRun: boolean;
  canManage: boolean;
  onRun: (inst: ScheduledAuditInstance) => void;
  onReport: (inst: ScheduledAuditInstance) => void;
  onReassign: (inst: ScheduledAuditInstance) => void;
  onReschedule: (inst: ScheduledAuditInstance) => void;
  onCancel: (inst: ScheduledAuditInstance) => void;
  /** Instance whose report is being looked up. */
  reportLoadingId?: string | null;
}

/** Row of actions for one scheduled audit: calendar link, run, report, reassign. */
export const InstanceActions: React.FC<InstanceActionHandlers & { inst: ScheduledAuditInstance; justify?: 'flex-start' | 'flex-end' }> = ({
  inst,
  canRun,
  canManage,
  onRun,
  onReport,
  onReassign,
  onReschedule,
  onCancel,
  reportLoadingId,
  justify = 'flex-start',
}) => (
  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: justify, alignItems: 'center' }}>
    <a
      href={buildGoogleCalendarUrl(inst)}
      target="_blank"
      rel="noreferrer"
      className="btn btn-ghost btn-sm"
      aria-label={`Add ${inst.auditCode} to Google Calendar (opens in a new tab)`}
    >
      <CalendarPlus size={14} aria-hidden="true" />
      Google Calendar
    </a>
    {canRun && isRunnable(inst.status) && (
      <Button size="sm" variant="secondary" icon={<Smartphone size={14} />} onClick={() => onRun(inst)}>
        {inst.status === 'IN_PROGRESS' ? 'Continue' : 'Run'}
      </Button>
    )}
    {inst.status === 'SUBMITTED' && (
      <Button size="sm" variant="secondary" icon={<FileCheck size={14} />} loading={reportLoadingId === inst.id} onClick={() => onReport(inst)}>
        Report
      </Button>
    )}
    {canManage && isReassignable(inst.status) && (
      <Button size="sm" variant="ghost" icon={<UserCheck size={14} />} onClick={() => onReassign(inst)}>
        Reassign
      </Button>
    )}
    {canManage && isReassignable(inst.status) && (
      <Button size="sm" variant="ghost" icon={<CalendarClock size={14} />} onClick={() => onReschedule(inst)}>
        Reschedule
      </Button>
    )}
    {canManage && isReassignable(inst.status) && (
      <Button size="sm" variant="ghost" icon={<XCircle size={14} />} onClick={() => onCancel(inst)}>
        Cancel audit
      </Button>
    )}
  </div>
);

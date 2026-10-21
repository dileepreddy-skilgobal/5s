import React, { useMemo } from 'react';
import { ScheduledAuditInstance } from '../../types';
import { Badge } from '../../components/ui/Badge';
import { scheduledAuditStatusLabel, scheduledAuditStatusVariant } from '../../constants/labels';
import { STATUS_TONE, WEEKDAY_SHORT, dayKey, displayStatus, personName } from './scheduleShared';
import { InstanceActions, InstanceActionHandlers } from './InstanceActions';

interface CalendarProps {
  /** Any date inside the month (month view) or week (week view) to show. */
  anchor: Date;
  instancesByDay: Map<string, ScheduledAuditInstance[]>;
  onOpen: (inst: ScheduledAuditInstance) => void;
}

const LEGEND: Array<ScheduledAuditInstance['status']> = ['SCHEDULED', 'IN_PROGRESS', 'SUBMITTED', 'OVERDUE'];

/** Sunday-first week containing `d`. */
export const weekStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());

const ellipsis: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' };

/** Date number: today is a solid blue chip, other days plain. */
const DateChip: React.FC<{ date: Date; isToday: boolean; muted?: boolean }> = ({ date, isToday, muted }) => (
  <span
    aria-current={isToday ? 'date' : undefined}
    style={{
      minWidth: '26px',
      height: '26px',
      padding: '0 4px',
      borderRadius: 'var(--radius-sm)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '13px',
      fontWeight: 600,
      background: isToday ? 'var(--color-primary)' : 'transparent',
      color: isToday ? 'var(--text-on-primary)' : muted ? 'var(--text-tertiary)' : 'var(--text-primary)',
    }}
  >
    {date.getDate()}
    {isToday && <span className="sr-only"> (today)</span>}
  </span>
);

const AuditChip: React.FC<{ inst: ScheduledAuditInstance; onOpen: (inst: ScheduledAuditInstance) => void }> = ({ inst, onOpen }) => {
  const status = displayStatus(inst);
  const tone = STATUS_TONE[status] ?? STATUS_TONE.SCHEDULED;
  const auditor = personName(inst.auditor);
  return (
    <button
      type="button"
      onClick={() => onOpen(inst)}
      title={`${inst.auditCode}: ${inst.location?.name ?? '—'} (${scheduledAuditStatusLabel(status)})`}
      aria-label={`${inst.auditCode}, ${inst.location?.name ?? 'location unknown'}, ${scheduledAuditStatusLabel(status)}${auditor ? `, ${auditor}` : ''}`}
      style={{
        width: '100%',
        minWidth: 0,
        padding: '4px 8px',
        borderRadius: 'var(--radius-sm)',
        background: tone.bg,
        color: 'var(--text-primary)',
        border: `1px solid ${tone.border}`,
        borderLeft: `3px solid ${tone.fg}`,
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '1px',
      }}
    >
      <span style={{ ...ellipsis, fontSize: '12px', fontWeight: 600 }}>{inst.location?.areaCode || inst.auditCode}</span>
      <span style={{ ...ellipsis, fontSize: '11px', fontWeight: 500, color: tone.fg }}>{scheduledAuditStatusLabel(status)}</span>
    </button>
  );
};

export const CalendarLegend: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
    {LEGEND.map((s) => (
      <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <span
          aria-hidden="true"
          style={{
            width: '12px',
            height: '12px',
            borderRadius: 'var(--radius-xs)',
            background: STATUS_TONE[s].bg,
            border: `1px solid ${STATUS_TONE[s].border}`,
            borderLeft: `3px solid ${STATUS_TONE[s].fg}`,
          }}
        />
        {scheduledAuditStatusLabel(s)}
      </span>
    ))}
  </div>
);

export const MonthCalendar: React.FC<CalendarProps> = ({ anchor, instancesByDay, onOpen }) => {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  // 5 or 6 full weeks covering the month
  const cells = useMemo(() => {
    const first = weekStart(new Date(year, month, 1));
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = new Date(year, month, 1).getDay();
    const total = leading + daysInMonth > 35 ? 42 : 35;
    return Array.from({ length: total }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  }, [year, month]);
  const todayKey = dayKey(new Date());

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: '640px' }}>
        <div className="keep-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface-subtle)' }}>
          {WEEKDAY_SHORT.map((d) => (
            <div key={d} style={{ padding: '10px 12px', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {d}
            </div>
          ))}
        </div>
        <div className="keep-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: 'var(--border-subtle)', gap: '1px' }}>
          {cells.map((date) => {
            const key = dayKey(date);
            const inMonth = date.getMonth() === month;
            const isToday = key === todayKey;
            const audits = instancesByDay.get(key) ?? [];
            return (
              <div
                key={key}
                style={{
                  minHeight: '112px',
                  minWidth: 0,
                  background: isToday ? 'var(--bg-pale)' : inMonth ? 'var(--bg-surface)' : 'var(--bg-surface-subtle)',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                  <DateChip date={date} isToday={isToday} muted={!inMonth} />
                  {audits.length > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)' }}>
                      {audits.length} {audits.length === 1 ? 'audit' : 'audits'}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '124px', overflowY: 'auto' }}>
                  {audits.map((inst) => (
                    <AuditChip key={inst.id} inst={inst} onOpen={onOpen} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const WeekAgenda: React.FC<CalendarProps & InstanceActionHandlers> = ({ anchor, instancesByDay, onOpen, ...actions }) => {
  const start = weekStart(anchor);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const todayKey = dayKey(new Date());

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: '16px' }}>
      {days.map((d) => {
        const key = dayKey(d);
        const isToday = key === todayKey;
        const audits = instancesByDay.get(key) ?? [];
        return (
          <section
            key={key}
            aria-label={d.toDateString()}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: `1px solid ${isToday ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            <div
              style={{
                padding: '10px 12px',
                background: isToday ? 'var(--bg-pale)' : 'var(--bg-surface-subtle)',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <DateChip date={d} isToday={isToday} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>{WEEKDAY_SHORT[d.getDay()]}</span>
              {isToday && (
                <span aria-hidden="true" style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}>
                  Today
                </span>
              )}
            </div>
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
              {audits.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 8px', color: 'var(--text-tertiary)', fontSize: '12.5px' }}>No audits</div>
              ) : (
                audits.map((inst) => {
                  const status = displayStatus(inst);
                  return (
                    <div
                      key={inst.id}
                      style={{
                        padding: '12px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => onOpen(inst)}
                          className="code-tag"
                          style={{ cursor: 'pointer' }}
                          aria-label={`Open details for ${inst.auditCode}`}
                        >
                          {inst.auditCode}
                        </button>
                        <Badge variant={scheduledAuditStatusVariant(status)}>{scheduledAuditStatusLabel(status)}</Badge>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                        {inst.location?.name ?? '—'}
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Auditor: {personName(inst.auditor) || 'Unassigned'}</div>
                      <InstanceActions inst={inst} {...actions} />
                    </div>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};

import React from 'react';
import { AuditSchedule, Location, OrgNode } from '../../types';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n';
import { Pause, Pencil, Play, RotateCw, Trash2 } from 'lucide-react';
import { auditTypeLabel } from '../templates/templateShared';
import { RECURRENCE_LABELS, ROTATION_LABELS, SCHEDULE_STATUS_LABELS, TARGET_TYPE_LABELS, personName, rowStyle, scheduleStatusVariant } from './scheduleShared';

interface ScheduleCardProps {
  schedule: AuditSchedule;
  orgNodes: OrgNode[];
  locations: Location[];
  canManage: boolean;
  generating: boolean;
  toggling: boolean;
  onGenerate: (s: AuditSchedule) => void;
  onToggle: (s: AuditSchedule) => void;
  onDelete: (s: AuditSchedule) => void;
  onEdit: (s: AuditSchedule) => void;
}

const coverage = (s: AuditSchedule, orgNodes: OrgNode[], locations: Location[]) => {
  if (s.targetType === 'SPECIFIC_LOCATIONS') {
    const n = s.targetLocationIds?.length ?? 0;
    if (n === 1) return locations.find((l) => l.id === s.targetLocationIds[0])?.name ?? '1 location';
    return `${n} locations`;
  }
  if (s.targetType === 'PLANT' || s.targetType === 'DEPARTMENT') {
    const node = orgNodes.find((o) => o.id === s.targetOrgNodeId);
    return node ? `${TARGET_TYPE_LABELS[s.targetType]}: ${node.name}` : TARGET_TYPE_LABELS[s.targetType];
  }
  return TARGET_TYPE_LABELS[s.targetType] ?? '—';
};

export const ScheduleCard: React.FC<ScheduleCardProps> = ({ schedule: s, orgNodes, locations, canManage, generating, toggling, onGenerate, onToggle, onDelete, onEdit }) => {
  const { formatDate } = useI18n();
  const recurrence = s.recurrence === 'CUSTOM_DAYS' ? `Every ${s.recurrenceIntervalDays} ${s.recurrenceIntervalDays === 1 ? 'day' : 'days'}` : RECURRENCE_LABELS[s.recurrence] ?? s.recurrence;
  const generated = s._count?.generatedInstances ?? 0;

  return (
    <article className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px', minWidth: 0 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="code-tag">{s.scheduleCode}</span>
            <Badge variant="info">{recurrence}</Badge>
          </div>
          <Badge variant={scheduleStatusVariant(s.status)}>{SCHEDULE_STATUS_LABELS[s.status] ?? s.status}</Badge>
        </div>

        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '4px 0 4px 0', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{s.title}</h3>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Template: <strong style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.template?.name ?? '—'}</strong>
          {s.templateVersion?.versionNumber ? ` (v${s.templateVersion.versionNumber})` : ''}
        </div>

        <dl style={{ margin: 0, padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={rowStyle}>
            <dt style={{ color: 'var(--text-secondary)' }}>Audit type</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{auditTypeLabel(s.auditType)}</dd>
          </div>
          <div style={rowStyle}>
            <dt style={{ color: 'var(--text-secondary)' }}>Auditor</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>
              {s.preferredAuditor ? personName(s.preferredAuditor) : ROTATION_LABELS[s.rotationRule] ?? s.rotationRule}
            </dd>
          </div>
          <div style={rowStyle}>
            <dt style={{ color: 'var(--text-secondary)' }}>Covers</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{coverage(s, orgNodes, locations)}</dd>
          </div>
          <div style={rowStyle}>
            <dt style={{ color: 'var(--text-secondary)' }}>Audits generated</dt>
            <dd className="num" style={{ margin: 0, fontWeight: 600 }}>{generated}</dd>
          </div>
          <div style={rowStyle}>
            <dt style={{ color: 'var(--text-secondary)' }}>Created ahead</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>
              {s.leadTimeDays === 0 ? 'On the day' : `${s.leadTimeDays} ${s.leadTimeDays === 1 ? 'day' : 'days'} before`}
            </dd>
          </div>
        </dl>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
          Next cycle: {s.status === 'ACTIVE' && s.nextRunAt ? formatDate(s.nextRunAt) : '—'}
        </div>

        {canManage && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {s.status === 'ACTIVE' && (
              <Button size="sm" variant="secondary" icon={<RotateCw size={14} />} loading={generating} disabled={generating} onClick={() => onGenerate(s)}>
                Generate next cycle
              </Button>
            )}
            {s.status !== 'COMPLETED' && (
              <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => onEdit(s)}>
                Edit
              </Button>
            )}
            {s.status !== 'COMPLETED' && (
            <Button
              size="sm"
              variant="ghost"
              icon={s.status === 'ACTIVE' ? <Pause size={14} /> : <Play size={14} />}
              loading={toggling}
              disabled={toggling}
              onClick={() => onToggle(s)}
            >
              {s.status === 'ACTIVE' ? 'Pause' : 'Resume'}
            </Button>
            )}
            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => onDelete(s)} aria-label={`Delete schedule ${s.title}`} />
          </div>
        )}
      </div>
    </article>
  );
};

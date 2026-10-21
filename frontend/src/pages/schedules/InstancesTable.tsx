import React from 'react';
import { ScheduledAuditInstance } from '../../types';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/StateViews';
import { scheduledAuditStatusLabel, scheduledAuditStatusVariant } from '../../constants/labels';
import { useI18n } from '../../i18n';
import { displayStatus, isOverdue, personName } from './scheduleShared';
import { InstanceActions, InstanceActionHandlers } from './InstanceActions';

export const InstancesTable: React.FC<InstanceActionHandlers & { instances: ScheduledAuditInstance[]; onOpen: (inst: ScheduledAuditInstance) => void }> = ({
  instances,
  onOpen,
  ...actions
}) => {
  const { formatDate } = useI18n();

  if (instances.length === 0) {
    return (
      <Card>
        <EmptyState title="No scheduled audits match these filters" />
      </Card>
    );
  }

  return (
    <Card noPadding>
      <div className="enterprise-table-container">
        <table className="enterprise-table">
          <thead>
            <tr>
              <th>Audit code</th>
              <th>Location</th>
              <th>Template</th>
              <th>Planned</th>
              <th>Due</th>
              <th>Auditor</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst) => {
              const status = displayStatus(inst);
              return (
                <tr key={inst.id}>
                  <td>
                    <button type="button" className="code-tag" style={{ cursor: 'pointer' }} onClick={() => onOpen(inst)} aria-label={`Open details for ${inst.auditCode}`}>
                      {inst.auditCode}
                    </button>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{inst.location?.name ?? '—'}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      {[inst.location?.areaCode, inst.location?.orgNode?.name].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </td>
                  <td>{inst.templateVersion?.template?.name ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(inst.plannedDate)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: isOverdue(inst) ? 600 : 400, color: isOverdue(inst) ? 'var(--color-danger)' : 'inherit' }}>{formatDate(inst.dueDate)}</span>
                  </td>
                  <td>{inst.auditor ? personName(inst.auditor) : <Badge variant="warning">Unassigned</Badge>}</td>
                  <td>
                    <Badge variant={scheduledAuditStatusVariant(status)}>{scheduledAuditStatusLabel(status)}</Badge>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <InstanceActions inst={inst} justify="flex-end" {...actions} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

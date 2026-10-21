import React from 'react';
import { ScheduledAuditInstance } from '../../types';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { scheduledAuditStatusLabel, scheduledAuditStatusVariant } from '../../constants/labels';
import { useI18n } from '../../i18n';
import { Download } from 'lucide-react';
import { auditTypeLabel } from '../templates/templateShared';
import { displayStatus, panelStyle, personName, rowStyle } from './scheduleShared';
import { InstanceActions, InstanceActionHandlers } from './InstanceActions';

interface InstanceDetailsModalProps extends InstanceActionHandlers {
  instance: ScheduledAuditInstance | null;
  downloading: boolean;
  onClose: () => void;
  onDownloadIcs: (instanceId: string) => void;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={rowStyle}>
    <dt style={{ color: 'var(--text-secondary)' }}>{label}</dt>
    <dd style={{ margin: 0, fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{children}</dd>
  </div>
);

export const InstanceDetailsModal: React.FC<InstanceDetailsModalProps> = ({ instance, downloading, onClose, onDownloadIcs, ...actions }) => {
  const { formatDate } = useI18n();
  if (!instance) return null;
  const status = displayStatus(instance);
  const loc = instance.location;
  const place = [loc?.building, loc?.floor].filter(Boolean).join(', ');

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Audit ${instance.auditCode}`}
      maxWidth="560px"
      footer={
        <Button variant="secondary" icon={<Download size={15} />} loading={downloading} disabled={downloading} onClick={() => onDownloadIcs(instance.id)}>
          Download .ics
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Badge variant={scheduledAuditStatusVariant(status)}>{scheduledAuditStatusLabel(status)}</Badge>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{auditTypeLabel(instance.auditType)} audit</span>
        </div>

        <dl style={{ ...panelStyle, margin: 0 }}>
          <Row label="Location">{loc ? `${loc.name}${loc.areaCode ? ` (${loc.areaCode})` : ''}` : '—'}</Row>
          <Row label="Building / floor">{place || '—'}</Row>
          <Row label="Template">{instance.templateVersion?.template?.name ?? '—'}</Row>
          <Row label="Planned">{formatDate(instance.plannedDate)}</Row>
          <Row label="Due">{formatDate(instance.dueDate)}</Row>
          <Row label="Auditor">
            {instance.auditor ? (
              <>
                {personName(instance.auditor)}
                {instance.auditor.email && <span style={{ display: 'block', fontWeight: 400, fontSize: '12.5px', color: 'var(--text-secondary)' }}>{instance.auditor.email}</span>}
              </>
            ) : (
              'Unassigned'
            )}
          </Row>
        </dl>

        {instance.notes && (
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>History and notes</h3>
            <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.5 }}>
              {instance.notes}
            </p>
          </div>
        )}

        <div style={{ paddingTop: '4px' }}>
          <InstanceActions inst={instance} {...actions} />
        </div>
      </div>
    </Modal>
  );
};

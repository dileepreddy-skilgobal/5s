import React from 'react';
import { X } from 'lucide-react';
import { ScopedAssignment } from '../../types/areas';
import { useI18n } from '../../i18n';

interface RoleChipProps {
  assignment: ScopedAssignment;
  /** Shows a remove button when given. */
  onRemove?: () => void;
  /** Used in the remove button's accessible name. */
  userName: string;
}

/** One role a person holds, with the unit it is limited to and its end date; expired roles are struck through. */
export const RoleChip: React.FC<RoleChipProps> = ({ assignment: a, onRemove, userName }) => {
  const { formatDate } = useI18n();
  const details = [a.orgNode ? a.orgNode.name : null, a.validUntil ? `${a.expired ? 'expired' : 'until'} ${formatDate(a.validUntil)}` : null].filter(Boolean).join(' · ');
  return (
    <span
      title={a.expired ? 'This role has expired and grants no access' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        padding: onRemove ? '2px 2px 2px 10px' : '3px 10px',
        borderRadius: 'var(--radius-full)',
        border: `1px solid ${a.expired ? 'var(--border-subtle)' : 'var(--color-info-border)'}`,
        background: a.expired ? 'var(--bg-surface-subtle)' : 'var(--color-primary-light)',
        fontSize: '12.5px',
        fontWeight: 500,
        color: a.expired ? 'var(--text-tertiary)' : 'var(--color-primary)',
        maxWidth: '100%',
      }}
    >
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        <span style={{ textDecoration: a.expired ? 'line-through' : undefined }}>{a.role?.name}</span>
        {details && <span style={{ fontWeight: 400, color: a.expired ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}> · {details}</span>}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove the ${a.role?.name ?? ''} role from ${userName}`}
          title="Remove role"
          style={{ background: 'none', border: 'none', width: '22px', height: '22px', flexShrink: 0, borderRadius: 'var(--radius-full)', cursor: 'pointer', color: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </span>
  );
};

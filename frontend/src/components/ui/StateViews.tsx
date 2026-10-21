import React from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { Button } from './Button';

/**
 * Standard loading, error and empty views. A failed request must look like a failure (with Retry),
 * never like an empty list or a "100% compliant" success message.
 */
const boxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '32px 16px',
  textAlign: 'center',
  color: 'var(--text-secondary)',
  fontSize: '13px',
};

export const LoadingState: React.FC<{ label?: string; compact?: boolean }> = ({ label = 'Loading…', compact = false }) => (
  <div role="status" aria-live="polite" style={{ ...boxStyle, padding: compact ? '16px' : boxStyle.padding }}>
    <div className="spinner" style={{ width: '22px', height: '22px' }} aria-hidden="true" />
    <span>{label}</span>
  </div>
);

export const ErrorState: React.FC<{ message?: string; onRetry?: () => void }> = ({ message = 'This could not be loaded.', onRetry }) => (
  <div role="alert" style={boxStyle}>
    <AlertTriangle size={24} color="var(--color-danger)" aria-hidden="true" />
    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{message}</span>
    {onRetry && (
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
);

export const EmptyState: React.FC<{ title: string; description?: string; icon?: React.ReactNode; action?: React.ReactNode }> = ({
  title,
  description,
  icon,
  action,
}) => (
  <div style={boxStyle}>
    <span style={{ color: 'var(--text-tertiary)' }} aria-hidden="true">
      {icon ?? <Inbox size={28} />}
    </span>
    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{title}</span>
    {description && <span style={{ maxWidth: '420px' }}>{description}</span>}
    {action}
  </div>
);

import React from 'react';

interface ProgressBarProps {
  value: number; // 0 to 100
  showLabel?: boolean;
  height?: number;
  color?: 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  showLabel = false,
  height = 8,
  color,
  className = '',
}) => {
  const clampedValue = Math.min(100, Math.max(0, value));

  // Determine dynamic color based on progress if not explicitly passed
  let fillColor = 'var(--color-primary)';
  if (color === 'success' || (!color && clampedValue === 100)) {
    fillColor = 'var(--color-success)';
  } else if (color === 'warning' || (!color && clampedValue >= 40 && clampedValue < 80)) {
    fillColor = 'var(--color-warning)';
  } else if (color === 'danger' || (!color && clampedValue < 40)) {
    fillColor = 'var(--color-danger)';
  } else if (color === 'primary' || (!color && clampedValue >= 80)) {
    fillColor = 'var(--color-primary)';
  }

  return (
    <div className={`flex items-center gap-2 ${className}`} style={{ width: '100%' }}>
      <div
        style={{
          flex: 1,
          height: `${height}px`,
          background: 'var(--bg-surface-subtle)',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            width: `${clampedValue}%`,
            height: '100%',
            background: fillColor,
            borderRadius: 'var(--radius-full)',
            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>
      {showLabel && (
        <span
          className="tabular-nums"
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            minWidth: '36px',
            textAlign: 'right',
          }}
        >
          {clampedValue}%
        </span>
      )}
    </div>
  );
};

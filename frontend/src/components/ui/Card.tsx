import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  header?: React.ReactNode;
  actions?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  noPadding?: boolean;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  header,
  actions,
  title,
  subtitle,
  noPadding = false,
  style,
}) => {
  return (
    <div
      className={`card ${className}`}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {(header || title || actions) && (
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          {header ? (
            <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
          ) : (
            <div style={{ flex: 1, minWidth: 0 }}>
              {title && <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>}
              {subtitle && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{subtitle}</p>}
            </div>
          )}
          {actions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: 'auto' }}>
              {actions}
            </div>
          )}
        </div>
      )}
      <div style={{ padding: noPadding ? '0' : '20px' }}>{children}</div>
    </div>
  );
};

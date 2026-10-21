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

/** Content container: optional header (title, subtitle, actions) above a padded body. */
export const Card: React.FC<CardProps> = ({ children, className = '', header, actions, title, subtitle, noPadding = false, style }) => (
  <div className={`card ${className}`} style={{ overflow: 'hidden', ...style }}>
    {(header || title || actions) && (
      <div className="card-header">
        {header ? (
          <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
        )}
        {actions && <div className="card-actions">{actions}</div>}
      </div>
    )}
    <div className={`card-body${noPadding ? ' no-padding' : ''}`}>{children}</div>
  </div>
);

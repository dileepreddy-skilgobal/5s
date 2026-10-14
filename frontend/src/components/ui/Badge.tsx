import React from 'react';

interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral';
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  icon,
  className = '',
  style,
}) => {
  const variantClass = `badge-${variant}`;
  return (
    <span className={`badge ${variantClass} ${className}`} style={style}>
      {icon}
      {children}
    </span>
  );
};

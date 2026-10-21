import React from 'react';

export type SummaryTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral';

interface SummaryCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  /** Colours the icon tile and the value; status meaning must also be in the label or hint. */
  tone?: SummaryTone;
  hint?: React.ReactNode;
  /** Makes the card a button (e.g. to filter the list below by this figure). */
  onClick?: () => void;
  selected?: boolean;
}

/** One headline figure (KPI) with its label, optional icon and a short explanation. */
export const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, icon, tone = 'primary', hint, onClick, selected }) => {
  const body = (
    <>
      <div className="summary-card-top">
        <span className="summary-card-label">{label}</span>
        {icon && (
          <span className={`summary-card-icon tone-${tone}`} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <div className={`summary-card-value tone-${tone}`}>{value}</div>
      {hint && <div className="summary-card-hint">{hint}</div>}
    </>
  );
  return onClick ? (
    <button type="button" className={`summary-card is-clickable${selected ? ' is-selected' : ''}`} onClick={onClick} aria-pressed={selected}>
      {body}
    </button>
  ) : (
    <div className="summary-card">{body}</div>
  );
};

/** Responsive row of summary cards. */
export const SummaryGrid: React.FC<{ children: React.ReactNode; min?: number }> = ({ children, min = 160 }) => (
  <div className="grid-auto summary-grid" style={{ ['--min' as string]: `${min}px`, gap: '16px' } as React.CSSProperties}>
    {children}
  </div>
);

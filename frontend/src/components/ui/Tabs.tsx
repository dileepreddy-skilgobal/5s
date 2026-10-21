import React, { useRef } from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
  /** Accessible name of the tab list. */
  ariaLabel?: string;
}

/** Horizontal tab bar (scrolls sideways when the tabs do not fit; arrow keys move between tabs). */
export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, className = '', ariaLabel }) => {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const keys: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`tabs-bar ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        borderBottom: '1px solid var(--border-subtle)',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'thin',
      }}
    >
      {tabs.map((t, i) => {
        const isActive = activeTab === t.id;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              // Inset underline: no negative margin, so the bar never shows a stray vertical scrollbar
              boxShadow: isActive ? 'inset 0 -2px 0 var(--color-primary)' : 'none',
              cursor: 'pointer',
              transition: 'color var(--transition-fast), box-shadow var(--transition-fast)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {t.icon}
            {t.label}
            {t.badge !== undefined && t.badge !== '' && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)',
                  background: isActive ? 'var(--color-primary-light)' : 'var(--bg-surface-subtle)',
                  color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

import React from 'react';
import { ErrorState } from '../../components/ui/StateViews';
import { Card } from '../../components/ui/Card';

/** Loading placeholder shaped like a grid of cards, so the layout does not jump when data arrives. */
export const SectionSkeleton: React.FC<{ cards?: number; label: string }> = ({ cards = 3, label }) => (
  <div role="status" aria-live="polite" aria-label={label} className="grid-auto" style={{ '--min': '260px' } as React.CSSProperties}>
    {Array.from({ length: cards }, (_, i) => (
      <div
        key={i}
        aria-hidden="true"
        style={{
          height: '140px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-surface-subtle)',
          border: '1px solid var(--border-subtle)',
        }}
      />
    ))}
  </div>
);

/** Shows a loading skeleton, an error with retry, or the section content. */
export function SectionState<T>({
  state,
  label,
  onRetry,
  children,
}: {
  state: { data: T | null; loading: boolean; error: string | null };
  label: string;
  onRetry: () => void;
  children: (data: T) => React.ReactNode;
}) {
  if (state.loading && !state.data) return <SectionSkeleton label={`Loading ${label}…`} />;
  if (state.error && !state.data) {
    return (
      <Card>
        <ErrorState message={state.error} onRetry={onRetry} />
      </Card>
    );
  }
  if (!state.data) return null;
  return <>{children(state.data)}</>;
}

/** Rank number in a small circle; the top three are gold, silver and bronze medals, the rest are neutral. */
export const RankMedal: React.FC<{ rank: number; size?: number }> = ({ rank, size = 28 }) => (
  <span
    aria-label={`Rank ${rank}`}
    className={`rc-rank${rank >= 1 && rank <= 3 ? ` r${rank}` : ''}`}
    style={{ width: size, height: size, minWidth: size, fontSize: size >= 40 ? '16px' : '12.5px' }}
  >
    {rank}
  </span>
);

/** Small segmented toggle group (aria-pressed buttons). */
export function SegmentedFilter<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ id: K; label: string }>;
  value: K;
  onChange: (id: K) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px' }}>
      {options.map((o) => (
        <button key={o.id} type="button" className="pillar-tab-pill" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

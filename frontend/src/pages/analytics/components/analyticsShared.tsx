import React from 'react';
import { LoadingState, ErrorState } from '../../../components/ui/StateViews';

/** Pillar / observation-category labels come from the shared catalogue. */
export { pillarLabel } from '../../../constants/labels';

export const isNum = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);

/** Percent value or em dash when null. */
export const fmtPct = (v: number | null | undefined): string => (isNum(v) ? `${v}%` : '—');

export const fmtNum = (v: number | null | undefined, suffix = ''): string => (isNum(v) ? `${v}${suffix}` : '—');

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

export type ScoreTone = 'success' | 'info' | 'warning' | 'danger';

/** Score bands used by every analytics view: >= 90 / >= 75 / >= 60 / below 60. */
export const SCORE_BANDS: Array<{ min: number; tone: ScoreTone; label: string }> = [
  { min: 90, tone: 'success', label: 'World class' },
  { min: 75, tone: 'info', label: 'Standard' },
  { min: 60, tone: 'warning', label: 'Developing' },
  { min: 0, tone: 'danger', label: 'Critical' },
];

export const scoreTone = (score: number | null | undefined): ScoreTone | null => {
  if (!isNum(score)) return null;
  return (SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1]).tone;
};

/** Text colour for a score (theme variables, so it works in dark mode). Null → muted. */
export const scoreColor = (score: number | null | undefined): string => {
  const tone = scoreTone(score);
  return tone ? `var(--color-${tone})` : 'var(--text-tertiary)';
};

export const scoreBg = (score: number | null | undefined): string => {
  const tone = scoreTone(score);
  return tone ? `var(--color-${tone}-bg)` : 'var(--bg-surface-subtle)';
};

export const scoreBorder = (score: number | null | undefined): string => {
  const tone = scoreTone(score);
  return tone ? `1px solid var(--color-${tone}-border)` : '1px dashed var(--border-subtle)';
};

/** Compact score pill; null renders a grey "—". */
export const ScorePill: React.FC<{ score: number | null | undefined; title?: string }> = ({ score, title }) => (
  <span
    title={title || (isNum(score) ? undefined : 'No audits')}
    style={{
      display: 'inline-block',
      minWidth: '52px',
      textAlign: 'center',
      padding: '3px 10px',
      borderRadius: 'var(--radius-sm)',
      fontSize: '12.5px',
      fontWeight: 600,
      fontVariantNumeric: 'tabular-nums',
      background: scoreBg(score),
      color: scoreColor(score),
      border: scoreBorder(score),
    }}
  >
    {fmtPct(score)}
  </span>
);

/** Muted hint shown under a null metric. */
export const NoDataHint: React.FC<{ text?: string }> = ({ text = 'No data in period' }) => (
  <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>{text}</span>
);

/** Loading / error placeholder for lazily loaded analytics panels (the shared state views). */
export const PanelStatus: React.FC<{ loading: boolean; error: string | null; onRetry: () => void; loadingText?: string }> = ({
  loading,
  error,
  onRetry,
  loadingText = 'Loading analytics...',
}) => {
  if (loading) return <LoadingState label={loadingText} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  return null;
};

export const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ textAlign: 'center', padding: '32px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>{text}</div>
);

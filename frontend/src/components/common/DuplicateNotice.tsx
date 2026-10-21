import React, { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { humanize } from '../../constants/labels';
import { useI18n } from '../../i18n';

export interface DuplicateMatch {
  id: string;
  code?: string | null;
  title: string;
  status?: string | null;
  similarity?: number | null;
  /** In-app path of the existing record (opened in a new tab so the form being filled is kept). */
  link: string;
}

/**
 * Debounced advisory duplicate lookup. `key` describes the current inputs (empty = do not check);
 * whenever it settles, `fetcher` runs and its matches are returned. Failures are silent: the check never blocks.
 */
export function useDuplicateCheck(key: string, fetcher: () => Promise<DuplicateMatch[]>, delayMs = 400) {
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedKey = useDebouncedValue(key, delayMs);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!debouncedKey) {
      setMatches([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetcherRef
      .current()
      .then((res) => {
        if (!cancelled) setMatches(Array.isArray(res) ? res : []);
      })
      .catch(() => {
        if (!cancelled) setMatches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedKey]);

  // Inputs changed since the last check: hide stale matches until the new check settles
  const stale = key !== debouncedKey;
  return { matches: key && !stale ? matches : [], loading: !!key && (loading || stale) && !!debouncedKey };
}

interface DuplicateNoticeProps {
  matches: DuplicateMatch[];
  /** e.g. "open observations at this location" */
  description: string;
}

/** Non-blocking "Possible duplicates" notice listing similar existing records. */
export const DuplicateNotice: React.FC<DuplicateNoticeProps> = ({ matches, description }) => {
  const { t } = useI18n();
  if (!matches.length) return null;
  return (
    <div
      role="status"
      style={{
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-warning-bg)',
        border: '1px solid var(--color-warning-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
        <Copy size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} aria-hidden="true" />
        {t('duplicates.title')}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {t('duplicates.intro', { description })}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {matches.map((m) => (
          <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', flexWrap: 'wrap', minWidth: 0 }}>
            <a
              href={m.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-link)', fontWeight: 600, minWidth: 0, maxWidth: '100%', textDecoration: 'none' }}
            >
              {m.code && <span className="code-tag">{m.code}</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
              <ExternalLink size={14} style={{ flexShrink: 0 }} aria-label={t('duplicates.opensInNewTab')} />
            </a>
            {m.status && (
              <span className="badge badge-neutral">
                {humanize(m.status)}
              </span>
            )}
            {typeof m.similarity === 'number' && (
              <span style={{ marginLeft: 'auto', fontSize: '12.5px', color: 'var(--text-secondary)' }} className="tabular-nums">
                {t('duplicates.match', { percent: Math.round(m.similarity * 100) })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Small inline indicator while a duplicate check runs. */
export const DuplicateChecking: React.FC<{ active: boolean }> = ({ active }) => {
  const { t } = useI18n();
  return active ? (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
      <Loader2 size={14} className="animate-spin" aria-hidden="true" /> {t('duplicates.checking')}
    </div>
  ) : null;
};

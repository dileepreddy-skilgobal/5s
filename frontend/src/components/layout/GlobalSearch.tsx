import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building,
  ClipboardCheck,
  CornerDownLeft,
  FileCheck,
  FileText,
  Layers,
  Loader2,
  MapPin,
  Search,
  Tag,
  User as UserIcon,
} from 'lucide-react';
import { api, getApiErrorMessage } from '../../services/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { SearchResult, SearchResultType } from '../../types';
import { MessageKey, useI18n } from '../../i18n';
import { humanize } from '../../constants/labels';

const TYPE_META: Record<SearchResultType, { labelKey: MessageKey; icon: React.ReactNode }> = {
  locations: { labelKey: 'search.types.locations', icon: <MapPin size={15} /> },
  observations: { labelKey: 'search.types.observations', icon: <AlertTriangle size={15} /> },
  actions: { labelKey: 'search.types.actions', icon: <Layers size={15} /> },
  audits: { labelKey: 'search.types.audits', icon: <ClipboardCheck size={15} /> },
  redTags: { labelKey: 'search.types.redTags', icon: <Tag size={15} /> },
  standards: { labelKey: 'search.types.standards', icon: <FileText size={15} /> },
  templates: { labelKey: 'search.types.templates', icon: <FileCheck size={15} /> },
  users: { labelKey: 'search.types.users', icon: <UserIcon size={15} /> },
  orgUnits: { labelKey: 'search.types.orgUnits', icon: <Building size={15} /> },
};
const TYPE_ORDER: SearchResultType[] = ['locations', 'observations', 'actions', 'audits', 'redTags', 'standards', 'templates', 'users', 'orgUnits'];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '');

/** Command bar in the top navbar: Ctrl/Cmd+K opens it; results across modules, keyboard navigable. */
export const GlobalSearch: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const typeLabel = (type: SearchResultType) => (TYPE_META[type] ? t(TYPE_META[type].labelKey) : type);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounced = useDebouncedValue(query.trim(), 250);

  // Ctrl/Cmd+K anywhere opens the palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || debounced.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .search(debounced)
      .then((res) => {
        if (cancelled) return;
        setResults(Array.isArray(res?.results) ? res.results : []);
        setActiveIndex(0);
      })
      .catch((err) => {
        if (cancelled) return;
        setResults([]);
        setError(getApiErrorMessage(err, t('search.unavailable')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open, t]);

  // Results in display order (grouped by type) so arrow keys follow what is on screen
  const grouped = useMemo(() => {
    const groups: { type: SearchResultType; items: SearchResult[] }[] = [];
    TYPE_ORDER.forEach((type) => {
      const items = results.filter((r) => r.type === type);
      if (items.length) groups.push({ type, items });
    });
    return groups;
  }, [results]);
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setError(null);
  };

  const go = (result: SearchResult | undefined) => {
    if (!result?.link) return;
    close();
    navigate(result.link);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length) setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flat[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const shortcut = isMac ? '⌘K' : 'Ctrl K';
  const trimmed = query.trim();
  let index = -1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('common.search')}
        className="topbar-search"
      >
        <Search size={16} aria-hidden="true" className="topbar-search-icon" />
        <span className="topbar-collapsible topbar-search-placeholder">{t('search.button')}</span>
        <span className="topbar-collapsible topbar-kbd-group" aria-hidden="true">
          {shortcut.split(' ').length > 1 ? (
            shortcut.split(' ').map((key) => (
              <kbd key={key} className="topbar-kbd">
                {key}
              </kbd>
            ))
          ) : (
            <kbd className="topbar-kbd">{shortcut}</kbd>
          )}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            className="modal-overlay"
            onClick={close}
            style={{ alignItems: 'flex-start', paddingTop: '10vh' }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('common.search')}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(640px, calc(100vw - 32px))',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-xl)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '70vh',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                {loading ? <Loader2 size={18} className="animate-spin" color="var(--text-tertiary)" /> : <Search size={18} color="var(--text-tertiary)" />}
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder={t('search.placeholder')}
                  role="combobox"
                  aria-expanded={flat.length > 0}
                  aria-controls="global-search-results"
                  aria-activedescendant={flat.length ? `global-search-${activeIndex}` : undefined}
                  maxLength={100}
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '15px', color: 'var(--text-primary)' }}
                />
                <kbd style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>Esc</kbd>
              </div>

              <div id="global-search-results" role="listbox" ref={listRef} style={{ overflowY: 'auto', padding: '6px 0' }}>
                {trimmed.length < 2 ? (
                  <div style={{ padding: '24px 16px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>{t('search.minChars')}</div>
                ) : error ? (
                  <div style={{ padding: '24px 16px', fontSize: '13px', color: 'var(--color-danger)', textAlign: 'center' }}>{error}</div>
                ) : !loading && debounced === trimmed && flat.length === 0 ? (
                  <div style={{ padding: '24px 16px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>{t('search.noResults', { query: trimmed })}</div>
                ) : (
                  grouped.map((group) => (
                    <div key={group.type} role="group" aria-label={typeLabel(group.type)}>
                      <div
                        style={{
                          padding: '8px 16px 4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        {typeLabel(group.type)}
                      </div>
                      {group.items.map((item) => {
                        index += 1;
                        const i = index;
                        const active = i === activeIndex;
                        return (
                          <div
                            key={`${item.type}-${item.id}`}
                            id={`global-search-${i}`}
                            data-index={i}
                            role="option"
                            aria-selected={active}
                            onMouseEnter={() => setActiveIndex(i)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => go(item)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 16px',
                              cursor: 'pointer',
                              background: active ? 'var(--color-primary-light)' : 'transparent',
                            }}
                          >
                            <span style={{ color: active ? 'var(--color-primary)' : 'var(--text-tertiary)', display: 'flex' }}>
                              {TYPE_META[item.type]?.icon || <Search size={15} />}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {item.title}
                              </div>
                              {item.subtitle && (
                                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {item.subtitle}
                                </div>
                              )}
                            </div>
                            {item.status && (
                              <span className="badge badge-neutral" style={{ fontSize: '10px', flexShrink: 0 }}>
                                {humanize(item.status)}
                              </span>
                            )}
                            {active && <CornerDownLeft size={14} color="var(--color-primary)" style={{ flexShrink: 0 }} />}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '14px',
                  padding: '8px 16px',
                  borderTop: '1px solid var(--border-subtle)',
                  fontSize: '11px',
                  color: 'var(--text-tertiary)',
                  background: 'var(--bg-surface-subtle)',
                }}
              >
                <span>{t('search.hintMove')}</span>
                <span>{t('search.hintOpen')}</span>
                <span>{t('search.hintClose')}</span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

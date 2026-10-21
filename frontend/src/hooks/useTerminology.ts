import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { OrganizationSettings, TermKey, TerminologySettings } from '../types';

/** Platform default labels; used while settings load and whenever the call fails. */
export const DEFAULT_TERMS: TerminologySettings = {
  location: 'Location',
  observation: 'Observation',
  correctiveAction: 'Corrective Action',
  redTag: 'Red Tag',
  audit: 'Audit',
  auditor: 'Auditor',
  areaOwner: 'Area Owner',
};

/** Naive English plural, good enough for UI labels ("Red Tag" -> "Red Tags", "Activity" -> "Activities"). */
export const pluralize = (word: string): string => {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
};

// --- Session cache (module scope): settings are fetched once per signed-in organization ---
interface SettingsCache {
  key: string;
  settings: OrganizationSettings | null;
  requested: boolean;
}

let cache: SettingsCache = { key: '', settings: null, requested: false };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const ensureLoaded = (key: string) => {
  if (cache.key === key && cache.requested) return;
  cache = { key, settings: null, requested: true };
  api
    .getSettings()
    .then((settings) => {
      if (cache.key !== key) return;
      cache = { ...cache, settings };
      notify();
    })
    .catch(() => {
      // Defaults stay in place; not retried for this session
    });
};

/** Replaces the cached settings (call after a successful PATCH /settings so labels update immediately). */
export const primeSettingsCache = (settings: OrganizationSettings) => {
  if (!cache.key) return;
  cache = { ...cache, settings, requested: true };
  notify();
};

/** Shared subscription to the cached organization settings (null until loaded or if loading failed). */
export const useCachedSettings = (): OrganizationSettings | null => {
  const { isAuthenticated, currentTenant } = useApp();
  const key = isAuthenticated ? currentTenant?.id || 'self' : '';
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);

  useEffect(() => {
    if (key) ensureLoaded(key);
  }, [key]);

  return key && cache.key === key ? cache.settings : null;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Keys whose default words are rewritten by `relabel` in navigation and page titles. */
const RELABEL_KEYS: TermKey[] = ['location', 'observation', 'correctiveAction', 'redTag', 'audit'];

/**
 * Organization terminology. `term('redTag')` returns the configured label (default English while loading);
 * `relabel(text)` rewrites the default words in a fixed UI label, e.g. "Red Tag Register" -> "Quarantine Tag Register".
 */
export const useTerminology = () => {
  const settings = useCachedSettings();
  const configured = settings?.terminology;

  const terms = useMemo<TerminologySettings>(() => {
    const merged = { ...DEFAULT_TERMS };
    if (configured) {
      (Object.keys(DEFAULT_TERMS) as TermKey[]).forEach((k) => {
        const value = configured[k];
        if (typeof value === 'string' && value.trim()) merged[k] = value.trim();
      });
    }
    return merged;
  }, [configured]);

  const term = useCallback((key: TermKey): string => terms[key] || DEFAULT_TERMS[key], [terms]);
  const termPlural = useCallback((key: TermKey): string => pluralize(term(key)), [term]);

  // One regex over every customised word so replacements never feed into each other
  const replacements = useMemo(() => {
    const map = new Map<string, string>();
    RELABEL_KEYS.forEach((k) => {
      const def = DEFAULT_TERMS[k];
      const custom = terms[k];
      if (custom === def) return;
      map.set(pluralize(def), pluralize(custom));
      map.set(def, custom);
      if (k === 'correctiveAction') {
        map.set('CAPAs', pluralize(custom));
        map.set('CAPA', custom);
      }
    });
    if (map.size === 0) return null;
    const words = Array.from(map.keys()).sort((a, b) => b.length - a.length).map(escapeRegExp);
    return { map, pattern: new RegExp(`\\b(${words.join('|')})\\b`, 'g') };
  }, [terms]);

  const relabel = useCallback(
    (text: string): string => (replacements ? text.replace(replacements.pattern, (m) => replacements.map.get(m) ?? m) : text),
    [replacements],
  );

  return { term, termPlural, relabel, terms };
};

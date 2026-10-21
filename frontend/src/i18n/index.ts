/**
 * Lightweight internationalisation (no library).
 *
 * Using it
 *   const { t, formatDate, formatNumber } = useI18n();
 *   t('nav.orgSettings');                         // plain key
 *   t('common.showingOf', { shown, total });       // {name} interpolation (numbers are locale-formatted)
 *   t('notifications.markedCount', { count });     // picks markedCount_one / _other via Intl.PluralRules
 *   formatDate(iso), formatNumber(1234), formatPercent(87.5), formatRelative(iso)
 *
 * Adding a key
 *   1. Add it to messages/en.ts (the source of truth, nested by area: common, nav, auth, …).
 *   2. Add the translation to messages/hi.ts. Keys that are not in en.ts fail to compile; keys missing
 *      from hi.ts fall back to English at runtime.
 *   Configurable nouns: write {term:location} / {terms:location} (singular / plural; see `terms` in en.ts)
 *   instead of the word. When the organization customised that term in Settings → Terminology the custom
 *   word is shown as-is; otherwise the active language's own word is used.
 *
 * Adding a locale
 *   1. Create messages/<code>.ts typed as DeepPartial<Messages> (copy hi.ts).
 *   2. Register it in CATALOGS and LOCALE_OPTIONS below, and add language.<code> to en.ts.
 *   The backend accepts any BCP 47 code (e.g. "mr" or "ta-IN") for user and organization preferences.
 *
 * Locale resolution: the signed-in user's preference (user.locale) → the organization default
 * (GET /settings → defaultLocale, from the shared settings cache in useTerminology) → the language last
 * chosen on this browser (localStorage, mainly for the login page) → browser language → English.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useCachedSettings, DEFAULT_TERMS, pluralize } from '../hooks/useTerminology';
import { api, getApiErrorMessage } from '../services/api';
import { TermKey, TerminologySettings } from '../types';
import en, { Messages } from './messages/en';
import hi from './messages/hi';
import type { DeepPartial, MessageKey, TranslateFn, TranslateParams } from './types';

export type { MessageKey, TranslateFn, TranslateParams, DeepPartial } from './types';
export type { Messages } from './messages/en';

export type Locale = 'en' | 'hi';

const CATALOGS: Record<Locale, DeepPartial<Messages>> = { en, hi };

/** Every language with a catalog; labels are each language's own name. */
const ALL_LOCALE_OPTIONS: Array<{ code: Locale; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
];

/**
 * Languages offered to users. A language is offered only once every page is translated, so nobody
 * gets a half-translated screen; Hindi currently covers the shell, sign-in and notifications only.
 * Add 'hi' here when its catalog is complete.
 */
const OFFERED_LOCALES: Locale[] = ['en'];

/** Languages offered in the switchers (a switcher hides itself when there is only one). */
export const LOCALE_OPTIONS = ALL_LOCALE_OPTIONS.filter((opt) => OFFERED_LOCALES.includes(opt.code));

export const DEFAULT_LOCALE: Locale = 'en';
const STORAGE_KEY = '5s_locale';

/** Maps any BCP 47 code ("hi-IN", "en-GB") to a supported locale, or null. */
export const normalizeLocale = (code: string | null | undefined): Locale | null => {
  if (!code || typeof code !== 'string') return null;
  const base = code.trim().toLowerCase().split(/[-_]/)[0];
  // A stored or organization preference for a language that is not offered falls back to the default
  return OFFERED_LOCALES.includes(base as Locale) ? (base as Locale) : null;
};

const readStoredLocale = (): Locale | null => {
  try {
    return normalizeLocale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
};

const storeLocale = (locale: Locale | null) => {
  try {
    if (locale) localStorage.setItem(STORAGE_KEY, locale);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the choice still applies for this page view
  }
};

const browserLocale = (): Locale | null => {
  if (typeof navigator === 'undefined') return null;
  const list = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];
  for (const code of list) {
    const match = normalizeLocale(code);
    if (match) return match;
  }
  return null;
};

// --- Lookup -----------------------------------------------------------------------------------------

const lookup = (catalog: DeepPartial<Messages> | undefined, path: string): string | undefined => {
  let node: unknown = catalog;
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
};

const pluralRulesCache = new Map<Locale, Intl.PluralRules>();
const pluralCategory = (locale: Locale, count: number): string => {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, rules);
  }
  return rules.select(count);
};

/** The raw message for a key in one catalog, honouring plural suffixes when a numeric count is given. */
const findMessage = (locale: Locale, key: string, count: number | null): string | undefined => {
  const catalog = CATALOGS[locale];
  if (count !== null) {
    const form = lookup(catalog, `${key}_${pluralCategory(locale, count)}`) ?? lookup(catalog, `${key}_other`);
    if (form !== undefined) return form;
  }
  return lookup(catalog, key);
};

/** Catalog key in `terms` → organization terminology field it follows. */
const TERM_SOURCES: Record<string, { key: TermKey; plural: boolean }> = {
  location: { key: 'location', plural: false },
  locations: { key: 'location', plural: true },
  observation: { key: 'observation', plural: false },
  observations: { key: 'observation', plural: true },
  correctiveAction: { key: 'correctiveAction', plural: false },
  correctiveActions: { key: 'correctiveAction', plural: true },
  capa: { key: 'correctiveAction', plural: false },
  capas: { key: 'correctiveAction', plural: true },
  redTag: { key: 'redTag', plural: false },
  redTags: { key: 'redTag', plural: true },
  audit: { key: 'audit', plural: false },
  audits: { key: 'audit', plural: true },
};

export interface TranslatorContext {
  locale: Locale;
  terms: TerminologySettings | null;
  formatNumber: (value: number) => string;
}

/** Text for a {term:x} / {terms:x} placeholder: the organization's custom word, else the catalog's own word. */
const resolveTerm = (ctx: TranslatorContext, name: string, plural: boolean): string => {
  const catalogKey = plural ? (name.endsWith('s') ? name : `${name}s`) : name;
  const source = TERM_SOURCES[catalogKey] ?? TERM_SOURCES[name];
  if (source && ctx.terms) {
    const custom = (ctx.terms[source.key] || '').trim();
    if (custom && custom !== DEFAULT_TERMS[source.key]) {
      // Customised: shown as the organization wrote it (English UI keeps its usual naive plural)
      return source.plural && ctx.locale === 'en' ? pluralize(custom) : custom;
    }
  }
  return lookup(CATALOGS[ctx.locale], `terms.${catalogKey}`) ?? lookup(en, `terms.${catalogKey}`) ?? catalogKey;
};

const PLACEHOLDER = /\{(terms?):([A-Za-z]+)\}|\{([A-Za-z0-9_]+)\}/g;

const interpolate = (ctx: TranslatorContext, template: string, params: TranslateParams | undefined): string =>
  template.replace(PLACEHOLDER, (match, termKind: string | undefined, termName: string | undefined, param: string | undefined) => {
    if (termKind && termName) return resolveTerm(ctx, termName, termKind === 'terms');
    if (param && params && Object.prototype.hasOwnProperty.call(params, param)) {
      const value = params[param];
      if (value === null || value === undefined) return '';
      return typeof value === 'number' ? ctx.formatNumber(value) : String(value);
    }
    return match;
  });

/** Builds a t() for a fixed locale and terminology (used by the provider; handy in tests). */
export const createTranslator = (ctx: TranslatorContext): TranslateFn => (key, params) => {
  const rawCount = params?.count;
  const count = typeof rawCount === 'number' && Number.isFinite(rawCount) ? rawCount : null;
  const message = findMessage(ctx.locale, key, count) ?? (ctx.locale !== 'en' ? findMessage('en', key, count) : undefined);
  if (message === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] Missing message: ${key}`);
    return key;
  }
  return interpolate(ctx, message, params);
};

// --- Formatting ---------------------------------------------------------------------------------------

type DateInput = Date | string | number | null | undefined;

const toDate = (value: DateInput): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const intlLocale = (locale: Locale) => (locale === 'hi' ? 'hi-IN' : 'en-IN');

// --- Module-level access for non-React code (toasts raised from plain functions, etc.) ----------------

let activeTranslator: TranslateFn = createTranslator({
  locale: DEFAULT_LOCALE,
  terms: null,
  formatNumber: (n) => new Intl.NumberFormat(intlLocale(DEFAULT_LOCALE)).format(n),
});

/** Translates with the currently active locale outside React components. Prefer useI18n() in components. */
export const translate: TranslateFn = (key, params) => activeTranslator(key, params);

// --- Provider ------------------------------------------------------------------------------------------

export interface I18nContextValue {
  locale: Locale;
  /** Saves the signed-in user's language (null = follow the organization default); before sign-in only this browser remembers it. */
  setLocale: (locale: Locale | null) => Promise<void>;
  /** True while a language change is being saved. */
  savingLocale: boolean;
  /** The user's own saved preference (null = organization default), when signed in. */
  userLocale: Locale | null;
  t: TranslateFn;
  formatDate: (value: DateInput, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: DateInput, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number | null | undefined, options?: Intl.NumberFormatOptions) => string;
  /** `value` is a percentage on a 0–100 scale (as scores are stored), e.g. 87.5 → "87.5%". */
  formatPercent: (value: number | null | undefined, fractionDigits?: number) => string;
  /** "just now", "5 minutes ago", "yesterday"… then a short date after a week. */
  formatRelative: (value: DateInput, now?: number) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isAuthenticated, refreshSession, addToast } = useApp();
  const settings = useCachedSettings();

  // A choice made in this session wins until the server profile catches up (undefined = none)
  const [override, setOverride] = useState<{ userId: string | null; locale: Locale | null } | undefined>(undefined);
  const [stored, setStored] = useState<Locale | null>(readStoredLocale);
  const [savingLocale, setSavingLocale] = useState(false);
  const userId = isAuthenticated ? currentUser?.id ?? null : null;

  // A different user signing in starts from their own profile
  const lastUserRef = useRef(userId);
  useEffect(() => {
    if (lastUserRef.current !== userId) {
      lastUserRef.current = userId;
      setOverride(undefined);
    }
  }, [userId]);

  const userLocale: Locale | null =
    override && override.userId === userId ? override.locale : isAuthenticated ? normalizeLocale(currentUser?.locale) : null;

  const locale: Locale = useMemo(() => {
    if (isAuthenticated) {
      if (userLocale) return userLocale;
      const orgDefault = normalizeLocale(settings?.defaultLocale);
      if (orgDefault) return orgDefault;
      // Settings not loaded yet (or unavailable): keep the last language used on this browser
      return stored ?? browserLocale() ?? DEFAULT_LOCALE;
    }
    return stored ?? browserLocale() ?? DEFAULT_LOCALE;
  }, [isAuthenticated, userLocale, settings?.defaultLocale, stored]);

  // Remember the effective language for the next visit to the login page
  useEffect(() => {
    if (isAuthenticated && locale !== stored) {
      storeLocale(locale);
      setStored(locale);
    }
  }, [isAuthenticated, locale, stored]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const configuredTerms = settings?.terminology ?? null;

  const value = useMemo<I18nContextValue>(() => {
    const tag = intlLocale(locale);
    const numberFormat = new Intl.NumberFormat(tag);
    const formatNumber = (n: number | null | undefined, options?: Intl.NumberFormatOptions) => {
      if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
      return options ? new Intl.NumberFormat(tag, options).format(n) : numberFormat.format(n);
    };
    const t = createTranslator({ locale, terms: configuredTerms, formatNumber: (n) => numberFormat.format(n) });

    const formatDate = (input: DateInput, options?: Intl.DateTimeFormatOptions) => {
      const d = toDate(input);
      return d ? new Intl.DateTimeFormat(tag, options ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(d) : '';
    };
    const formatDateTime = (input: DateInput, options?: Intl.DateTimeFormatOptions) => {
      const d = toDate(input);
      return d
        ? new Intl.DateTimeFormat(tag, options ?? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d)
        : '';
    };
    const formatPercent = (n: number | null | undefined, fractionDigits = 0) => {
      if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
      return new Intl.NumberFormat(tag, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: fractionDigits }).format(n / 100);
    };
    const relative = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
    const formatRelative = (input: DateInput, now: number = Date.now()) => {
      const d = toDate(input);
      if (!d) return '';
      const diffSec = Math.round((d.getTime() - now) / 1000);
      const abs = Math.abs(diffSec);
      if (abs < 60) return t('common.justNow');
      if (abs < 3600) return relative.format(Math.round(diffSec / 60), 'minute');
      if (abs < 86400) return relative.format(Math.round(diffSec / 3600), 'hour');
      if (abs < 7 * 86400) return relative.format(Math.round(diffSec / 86400), 'day');
      return formatDate(d, { day: 'numeric', month: 'short', year: abs > 300 * 86400 ? 'numeric' : undefined });
    };

    const setLocale = async (next: Locale | null) => {
      if (!isAuthenticated || !userId) {
        // Before sign-in: remembered on this browser only
        const chosen = next ?? browserLocale() ?? DEFAULT_LOCALE;
        storeLocale(chosen);
        setStored(chosen);
        return;
      }
      const previous = override;
      setOverride({ userId, locale: next });
      if (next) {
        storeLocale(next);
        setStored(next);
      }
      setSavingLocale(true);
      try {
        await api.updateMyPreferences({ locale: next });
        // Bring user.locale in the session up to date (the override keeps the UI steady meanwhile)
        refreshSession().catch(() => undefined);
      } catch (err) {
        setOverride(previous);
        addToast({ type: 'error', title: t('language.label'), message: getApiErrorMessage(err, t('language.notSaved')) });
      } finally {
        setSavingLocale(false);
      }
    };

    return { locale, setLocale, savingLocale, userLocale, t, formatDate, formatDateTime, formatNumber, formatPercent, formatRelative };
  }, [locale, configuredTerms, isAuthenticated, userId, override, savingLocale, userLocale, refreshSession, addToast]);

  activeTranslator = value.t;

  return React.createElement(I18nContext.Provider, { value }, children);
};

export const useI18n = (): I18nContextValue => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
};

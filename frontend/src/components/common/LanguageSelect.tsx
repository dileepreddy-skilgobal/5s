import React from 'react';
import { Languages } from 'lucide-react';
import { LOCALE_OPTIONS, normalizeLocale, useI18n } from '../../i18n';

/**
 * Language picker for pages without the profile menu (sign-in, password recovery).
 * Before sign-in the choice is remembered on this browser; once signed in it is saved to the profile.
 */
export const LanguageSelect: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { t, locale, setLocale, savingLocale } = useI18n();
  if (LOCALE_OPTIONS.length < 2) return null;
  return (
    <label
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', flexShrink: 0 }}
      title={t('language.label')}
    >
      <Languages size={14} aria-hidden="true" />
      {!compact && <span>{t('language.label')}</span>}
      <select
        aria-label={t('language.label')}
        className="form-select"
        value={locale}
        disabled={savingLocale}
        onChange={(e) => {
          const next = normalizeLocale(e.target.value);
          if (next) setLocale(next);
        }}
        style={{ width: 'auto', height: '30px', padding: '2px 28px 2px 8px', fontSize: '12px' }}
      >
        {LOCALE_OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code} lang={opt.code}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
};

import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';
import { certificationLevelLabel } from '../../constants/labels';
import { CertificationLevel, SettingsCertificationRule } from '../../types';
import { CERTIFICATION_LEVELS, HEX_COLOR } from './settingsModel';
import { Field, NumberInput, gridStyle, hintStyle } from './SettingsFields';
import { SectionBodyProps } from './SettingsSections';

const cellInput: React.CSSProperties = { padding: '6px 8px', fontSize: '13px' };

const LEVEL_DEFAULT_COLORS = ['#EF4444', '#F59E0B', '#3B82F6', '#10B981', '#8B5CF6'];

type NullableRuleField = 'maxRepeatRate' | 'minOnTimeClosure' | 'minAdherence';

const NULLABLE_FIELDS: Array<{ key: NullableRuleField; label: string; hint: string }> = [
  { key: 'maxRepeatRate', label: 'Max repeat rate', hint: '% of observations that are repeats' },
  { key: 'minOnTimeClosure', label: 'Min on-time closure', hint: '% of actions closed by due date' },
  { key: 'minAdherence', label: 'Min adherence', hint: '% of scheduled audits completed' },
];

export const AnalyticsSettingsSection: React.FC<SectionBodyProps> = ({ draft, update }) => {
  const a = draft.analytics;
  const bands = a.maturityBands;
  const rules = a.certificationRules;
  const missingLevels = CERTIFICATION_LEVELS.filter((l) => !rules.some((r) => r.name === l));

  // Platform defaults (GET /settings/defaults) seed a re-enabled criterion or a re-added level
  const [defaultRules, setDefaultRules] = useState<SettingsCertificationRule[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .getDefaultSettings()
      .then((d) => {
        if (!cancelled) setDefaultRules(d?.analytics?.certificationRules ?? []);
      })
      // Without defaults the add / re-enable controls stay disabled; editing still works
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const defaultRule = (level: CertificationLevel) => defaultRules?.find((r) => r.name === level) ?? null;
  /** The level's default for a criterion, else the closest level that has one. */
  const defaultValue = (level: CertificationLevel, key: NullableRuleField): number | null =>
    defaultRule(level)?.[key] ?? defaultRules?.map((r) => r[key]).find((v): v is number => typeof v === 'number') ?? null;

  const addBand = () =>
    update((d) => {
      const used = new Set(d.analytics.maturityBands.map((b) => b.level));
      let level = 1;
      while (used.has(level) && level < 10) level++;
      d.analytics.maturityBands = [
        ...d.analytics.maturityBands,
        { level, name: `Level ${level}`, description: '', minScore: 0, color: LEVEL_DEFAULT_COLORS[(level - 1) % LEVEL_DEFAULT_COLORS.length] },
      ];
    });

  return (
    <>
      <div style={gridStyle}>
        <Field label="Repeat look-back" htmlFor="settings-repeat-days" hint="An observation counts as a repeat if the same finding occurred within this many days (1–730).">
          <NumberInput id="settings-repeat-days" value={a.repeatLookbackDays} min={1} max={730} suffix="days" onChange={(v) => update((d) => { d.analytics.repeatLookbackDays = v; })} />
        </Field>
        <Field label="Certification window" htmlFor="settings-cert-window" hint="Months of history evaluated for internal certification (1–36).">
          <NumberInput id="settings-cert-window" value={a.certificationWindowMonths} min={1} max={36} suffix="months" onChange={(v) => update((d) => { d.analytics.certificationWindowMonths = v; })} />
        </Field>
      </div>

      {/* Maturity bands */}
      <div>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Maturity bands</h4>
        <div style={{ ...hintStyle, marginBottom: '10px' }}>
          A location's maturity level is the highest band whose minimum score its average reaches. 2–10 bands, unique levels, and one band must start at 0.
        </div>
        <div className="enterprise-table-container">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>Level</th>
                <th>Name</th>
                <th>Description</th>
                <th style={{ width: '110px' }}>Min score %</th>
                <th style={{ width: '150px' }}>Colour</th>
                <th style={{ width: '48px' }} aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {bands.map((b, i) => (
                <tr key={i}>
                  <td>
                    <NumberInput ariaLabel={`Band ${i + 1} level`} value={b.level} min={1} max={10} onChange={(v) => update((d) => { d.analytics.maturityBands[i].level = v; })} />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="form-input"
                      style={cellInput}
                      aria-label={`Band ${i + 1} name`}
                      value={b.name}
                      maxLength={60}
                      onChange={(e) => update((d) => { d.analytics.maturityBands[i].name = e.target.value; })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="form-input"
                      style={cellInput}
                      aria-label={`Band ${i + 1} description`}
                      value={b.description}
                      maxLength={200}
                      onChange={(e) => update((d) => { d.analytics.maturityBands[i].description = e.target.value; })}
                    />
                  </td>
                  <td>
                    <NumberInput ariaLabel={`Band ${i + 1} minimum score`} value={b.minScore} min={0} max={100} step={0.5} onChange={(v) => update((d) => { d.analytics.maturityBands[i].minScore = v; })} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="color"
                        aria-label={`Band ${i + 1} colour picker`}
                        value={HEX_COLOR.test(b.color) ? b.color : '#000000'}
                        onChange={(e) => update((d) => { d.analytics.maturityBands[i].color = e.target.value.toUpperCase(); })}
                        style={{ width: '32px', height: '30px', padding: '1px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        style={{ ...cellInput, fontFamily: 'var(--font-mono, monospace)' }}
                        aria-label={`Band ${i + 1} colour`}
                        value={b.color}
                        maxLength={7}
                        onChange={(e) => update((d) => { d.analytics.maturityBands[i].color = e.target.value.trim(); })}
                      />
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label={`Remove band ${i + 1}`}
                      disabled={bands.length <= 2}
                      onClick={() => update((d) => { d.analytics.maturityBands = d.analytics.maturityBands.filter((_, idx) => idx !== i); })}
                      style={{ background: 'transparent', border: 'none', cursor: bands.length <= 2 ? 'not-allowed' : 'pointer', color: 'var(--text-tertiary)', padding: '4px' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <Button variant="secondary" size="sm" icon={<Plus size={14} />} disabled={bands.length >= 10} onClick={addBand}>
            Add band
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={bands.length < 2}
            onClick={() => update((d) => { d.analytics.maturityBands = [...d.analytics.maturityBands].sort((x, y) => y.minScore - x.minScore); })}
          >
            Sort by score
          </Button>
        </div>
      </div>

      {/* Certification rules */}
      <div>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Internal certification levels</h4>
        <div style={{ ...hintStyle, marginBottom: '10px' }}>
          A location earns a level when every criterion is met over the certification window. Tick "No requirement" to drop a criterion for that level; areas without data for a criterion (for example no corrective actions) pass it. Each of the last N audits must reach the minimum average score.
        </div>
        <div className="enterprise-table-container">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Level</th>
                <th style={{ width: '120px' }}>Min avg score %</th>
                {NULLABLE_FIELDS.map((f) => (
                  <th key={f.key} title={f.hint}>{f.label} %</th>
                ))}
                <th style={{ width: '120px' }}>Sustained audits</th>
                <th style={{ width: '48px' }} aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={r.name}>
                  <td>
                    <strong>{certificationLevelLabel(r.name)}</strong>
                  </td>
                  <td>
                    <NumberInput ariaLabel={`${certificationLevelLabel(r.name)} minimum average score`} value={r.minAverageScore} min={0} max={100} step={0.5} onChange={(v) => update((d) => { d.analytics.certificationRules[i].minAverageScore = v; })} />
                  </td>
                  {NULLABLE_FIELDS.map((f) => {
                    const value = r[f.key];
                    const noRequirement = value === null;
                    const fallback = defaultValue(r.name, f.key);
                    return (
                      <td key={f.key}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '110px' }}>
                          <NumberInput
                            ariaLabel={`${certificationLevelLabel(r.name)} ${f.label}`}
                            value={value}
                            min={0}
                            max={100}
                            step={0.5}
                            disabled={noRequirement}
                            onChange={(v) => update((d) => { d.analytics.certificationRules[i][f.key] = v; })}
                          />
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={noRequirement}
                              disabled={noRequirement && fallback === null}
                              onChange={(e) =>
                                update((d) => {
                                  d.analytics.certificationRules[i][f.key] = e.target.checked ? null : fallback;
                                })
                              }
                            />
                            No requirement
                          </label>
                        </div>
                      </td>
                    );
                  })}
                  <td>
                    <NumberInput ariaLabel={`${certificationLevelLabel(r.name)} sustained audits`} value={r.sustainedAudits} min={1} max={20} onChange={(v) => update((d) => { d.analytics.certificationRules[i].sustainedAudits = v; })} />
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label={`Remove ${certificationLevelLabel(r.name)}`}
                      disabled={rules.length <= 1}
                      onClick={() => update((d) => { d.analytics.certificationRules = d.analytics.certificationRules.filter((_, idx) => idx !== i); })}
                      style={{ background: 'transparent', border: 'none', cursor: rules.length <= 1 ? 'not-allowed' : 'pointer', color: 'var(--text-tertiary)', padding: '4px' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {missingLevels.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            {missingLevels.map((level) => {
              const template = defaultRule(level);
              return (
                <Button
                  key={level}
                  variant="secondary"
                  size="sm"
                  icon={<Plus size={14} />}
                  disabled={!template}
                  onClick={() =>
                    template &&
                    update((d) => {
                      const next = [...d.analytics.certificationRules, { ...template }];
                      d.analytics.certificationRules = next.sort((x, y) => CERTIFICATION_LEVELS.indexOf(x.name) - CERTIFICATION_LEVELS.indexOf(y.name));
                    })
                  }
                >
                  Add {certificationLevelLabel(level)}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

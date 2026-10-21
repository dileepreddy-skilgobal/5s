import React from 'react';
import { AlertTriangle, RotateCcw, Save } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EscalationRecipient } from '../../types';
import { RECIPIENTS, numberInputValue, parseNumberInput } from './settingsModel';

export const hintStyle: React.CSSProperties = { fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.45 };
export const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' };

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const Field: React.FC<FieldProps> = ({ label, htmlFor, hint, children, style }) => (
  <div className="form-group" style={{ marginBottom: 0, ...style }}>
    <label className="form-label" htmlFor={htmlFor}>
      {label}
    </label>
    {children}
    {hint && <div className="form-hint">{hint}</div>}
  </div>
);

interface NumberInputProps {
  id?: string;
  value: number | null | undefined;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  suffix?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}

export const NumberInput: React.FC<NumberInputProps> = ({ id, value, onChange, min, max, step = 1, disabled, suffix, style, ariaLabel }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', ...style }}>
    <input
      id={id}
      type="number"
      className="form-input"
      value={numberInputValue(value)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(parseNumberInput(e.target.value))}
      style={{ minWidth: 0 }}
    />
    {suffix && <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{suffix}</span>}
  </div>
);

interface ToggleProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: React.ReactNode;
}

export const Toggle: React.FC<ToggleProps> = ({ id, checked, onChange, label, description }) => (
  <label
    htmlFor={id}
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      padding: '12px 16px',
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${checked ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
      background: checked ? 'var(--bg-pale)' : 'var(--bg-surface)',
      cursor: 'pointer',
    }}
  >
    <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: 'var(--color-primary)', flexShrink: 0 }} />
    <span>
      <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
      {description && <span style={{ display: 'block', ...hintStyle, marginTop: '2px' }}>{description}</span>}
    </span>
  </label>
);

interface RecipientPickerProps {
  value: EscalationRecipient[];
  onChange: (value: EscalationRecipient[]) => void;
  label?: string;
}

/** Multi-select of notification recipients, rendered as toggle chips. */
export const RecipientPicker: React.FC<RecipientPickerProps> = ({ value, onChange, label }) => (
  <div role="group" aria-label={label || 'Recipients'} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
    {RECIPIENTS.map((r) => {
      const selected = value.includes(r.value);
      return (
        <button
          key={r.value}
          type="button"
          aria-pressed={selected}
          onClick={() => onChange(selected ? value.filter((v) => v !== r.value) : [...value, r.value])}
          className="pillar-tab-pill"
                >
          {r.label}
        </button>
      );
    })}
  </div>
);

interface SectionCardProps {
  title: string;
  subtitle?: string;
  dirty: boolean;
  errors: string[];
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  /** Hidden for sections without platform defaults. */
  resetDisabled?: boolean;
  children: React.ReactNode;
}

/** Card for one settings section, followed by a sticky save bar (Reset / Save) and the validation summary. */
export const SectionCard: React.FC<SectionCardProps> = ({ title, subtitle, dirty, errors, saving, onSave, onReset, resetDisabled, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
    <Card
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {title}
          {dirty && <Badge variant="warning">Unsaved changes</Badge>}
        </span>
      }
      subtitle={subtitle}
      style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {children}
        {errors.length > 0 && (
          <div
            role="alert"
            style={{
              display: 'flex',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-danger-border)',
              background: 'var(--color-danger-bg)',
              color: 'var(--color-danger)',
              fontSize: '13px',
            }}
          >
            <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }} />
            <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
    {/* Save bar: stays in view at the bottom of the screen while the section is scrolled */}
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
        padding: '12px 20px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderTop: 'none',
        borderBottomLeftRadius: 'var(--radius-lg)',
        borderBottomRightRadius: 'var(--radius-lg)',
        boxShadow: dirty ? 'var(--shadow-sm)' : 'none',
      }}
    >
      <span role="status" style={{ fontSize: '13px', color: dirty ? 'var(--color-warning)' : 'var(--text-secondary)', fontWeight: dirty ? 600 : 400 }}>
        {errors.length > 0 ? 'Fix the highlighted values to save' : dirty ? 'You have unsaved changes in this section' : 'All changes saved'}
      </span>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
        <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={onReset} disabled={saving || resetDisabled}>
          Reset to default
        </Button>
        <Button variant="primary" icon={<Save size={16} />} onClick={onSave} loading={saving} disabled={!dirty || errors.length > 0}>
          Save changes
        </Button>
      </div>
    </div>
  </div>
);

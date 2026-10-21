import React, { useId } from 'react';
import { Search } from 'lucide-react';

interface FormFieldProps {
  label: React.ReactNode;
  /** Render prop receives the id/aria props to spread on the control, so label and messages are associated. */
  children: (control: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; required?: boolean }) => React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** Label above the control, then hint or error. Required fields are marked with an asterisk. */
export const FormField: React.FC<FormFieldProps> = ({ label, children, required, hint, error, className = '', style }) => {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`form-group ${className}`} style={style}>
      <label className="form-label" htmlFor={id}>
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, required })}
      {error ? (
        <div id={errorId} className="form-error" role="alert">
          {error}
        </div>
      ) : (
        hint && (
          <div id={hintId} className="form-hint">
            {hint}
          </div>
        )
      )}
    </div>
  );
};

/** Search box with a leading icon and an accessible name. */
export const SearchInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, className = '', style, ...props }) => (
  <div className="search-input" style={style}>
    <Search size={16} aria-hidden="true" />
    <input type="search" aria-label={label} placeholder={props.placeholder ?? label} className={`form-input ${className}`} {...props} />
  </div>
);

/** Row of search and filter controls that wraps on narrow screens. */
export const FilterBar: React.FC<{ children: React.ReactNode; label?: string }> = ({ children, label = 'Filters' }) => (
  <div className="filter-bar" role="search" aria-label={label}>
    {children}
  </div>
);

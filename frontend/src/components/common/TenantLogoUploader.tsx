import React, { useId, useRef, useState } from 'react';
import { Upload, X, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';

interface TenantLogoUploaderProps {
  /** Current logo: a stored (signed) URL, or the data URL of a newly picked file. */
  value?: string;
  /** Receives the picked image as a data URL ('' when removed); the server stores it as a file. */
  onChange: (url: string) => void;
  label?: string;
  helperText?: string;
  disabled?: boolean;
}

/** Mirrors the server's logo rule (backend/src/modules/tenants/tenant-logo.ts) and the file types it can store. */
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_RULE = 'PNG, JPG, WebP or GIF, up to 2 MB. A square image of at least 200 × 200 px looks best.';

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const TenantLogoUploader: React.FC<TenantLogoUploaderProps> = ({
  value,
  onChange,
  label = 'Organization logo',
  helperText = 'Shown in the app header, on reports and on certificates.',
  disabled = false,
}) => {
  const uid = useId();
  const inputId = `${uid}-logo-file`;
  const hintId = `${uid}-logo-hint`;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set only when a new file was picked here, so an already saved logo is not presented as "ready to save"
  const [pickedFile, setPicked] = useState<{ name: string; size: string; dimensions?: string; dataUrl: string } | null>(null);
  const picked = pickedFile && pickedFile.dataUrl === value ? pickedFile : null;

  const openPicker = () => {
    if (!disabled) fileInputRef.current?.click();
  };

  const processFile = (file: File) => {
    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('This file type is not supported. Choose a PNG, JPG, WebP or GIF image.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(`The file is ${formatFileSize(file.size)}; logos can be up to 2 MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = typeof e.target?.result === 'string' ? e.target.result : '';
      if (!dataUrl) {
        setError('The image could not be read. Try another file.');
        return;
      }
      const img = new Image();
      img.onload = () => {
        setPicked({ name: file.name, size: formatFileSize(file.size), dimensions: `${img.naturalWidth} × ${img.naturalHeight} px`, dataUrl });
        onChange(dataUrl);
      };
      img.onerror = () => setError('The image could not be read. Try another file.');
      img.src = dataUrl;
    };
    reader.onerror = () => setError('The image could not be read. Try another file.');
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Picking the same file again after removing it should still trigger a change
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleRemove = () => {
    setPicked(null);
    setError(null);
    onChange('');
  };

  return (
    <div className="form-group" style={{ marginBottom: '16px' }}>
      <div className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontWeight: 600 }}>
        <label htmlFor={inputId}>{label}</label>
        {picked && (
          <span role="status" style={{ fontSize: '12.5px', color: 'var(--color-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Check size={14} aria-hidden="true" /> New logo selected — save to apply
          </span>
        )}
      </div>

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        aria-describedby={hintId}
        disabled={disabled}
        style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
        tabIndex={-1}
        onChange={handleFileChange}
      />

      {value ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            padding: '16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-subtle)',
            gap: '12px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            {/* Logos are designed for light backgrounds, so the preview tile stays white in dark mode too */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: 'var(--radius-md)',
                background: '#FFFFFF',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                padding: '4px',
                flexShrink: 0,
              }}
            >
              <img src={value} alt={`${label} preview`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={picked?.name}>
                {picked?.name || 'Current logo'}
              </div>
              {picked && (
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {picked.dimensions && <span>{picked.dimensions}</span>}
                  <span>{picked.size}</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
            <Button type="button" size="sm" variant="secondary" icon={<RefreshCw size={16} />} onClick={openPicker} disabled={disabled}>
              Replace
            </Button>
            <Button type="button" size="sm" variant="ghost" icon={<X size={16} color="var(--color-danger)" aria-hidden="true" />} onClick={handleRemove} disabled={disabled}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          disabled={disabled}
          aria-describedby={hintId}
          style={{
            width: '100%',
            padding: '24px 16px',
            border: `1px dashed ${dragOver ? 'var(--color-primary)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--radius-md)',
            background: dragOver ? 'var(--color-primary-light)' : 'var(--bg-pale)',
            color: 'var(--text-primary)',
            textAlign: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
            font: 'inherit',
          }}
        >
          <span
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'var(--bg-surface)',
              color: 'var(--color-primary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '10px',
              border: '1px solid var(--color-info-border)',
            }}
            aria-hidden="true"
          >
            <Upload size={20} />
          </span>
          <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>Choose a logo file, or drag and drop it here</span>
        </button>
      )}

      {error && (
        <div role="alert" className="form-error" style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertCircle size={14} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <span id={hintId} className="form-hint" style={{ marginTop: '6px', display: 'block' }}>
        {helperText} {LOGO_RULE}
      </span>
    </div>
  );
};

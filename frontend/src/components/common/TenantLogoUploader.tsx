import React, { useRef, useState } from 'react';
import { Upload, X, Check, RefreshCw, AlertCircle, FileText } from 'lucide-react';
import { Button } from '../ui/Button';

interface TenantLogoUploaderProps {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  helperText?: string;
}

export const TenantLogoUploader: React.FC<TenantLogoUploaderProps> = ({
  value,
  onChange,
  label = 'Organization Brand Logo',
  helperText = 'Square or horizontal corporate logo with transparent or solid background.',
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; sizeFormatted: string; dimensions?: string } | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const processFile = (file: File) => {
    setError(null);
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid format. Only PNG, JPG, SVG, or WebP images are allowed.');
      return;
    }

    const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE_BYTES) {
      setError(`File size is ${formatFileSize(file.size)}, which exceeds the maximum allowed limit of 5.0 MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        // Measure natural image dimensions
        const img = new Image();
        img.onload = () => {
          setFileMeta({
            name: file.name,
            sizeFormatted: formatFileSize(file.size),
            dimensions: `${img.naturalWidth} × ${img.naturalHeight} px`,
          });
          onChange(dataUrl);
        };
        img.onerror = () => {
          setFileMeta({
            name: file.name,
            sizeFormatted: formatFileSize(file.size),
          });
          onChange(dataUrl);
        };
        img.src = dataUrl;
      }
    };
    reader.onerror = () => {
      setError('Failed to process the selected image file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleRemove = () => {
    setFileMeta(null);
    setError(null);
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="form-group" style={{ marginBottom: '16px' }}>
      <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600 }}>
        <span>{label}</span>
        {value && (
          <span style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Check size={12} /> Ready to Save
          </span>
        )}
      </label>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {value ? (
        /* Active Logo Preview Box */
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-subtle)',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', overflow: 'hidden' }}>
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
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                flexShrink: 0,
              }}
            >
              <img
                src={value}
                alt="Organization Logo"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'hidden' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {fileMeta?.name || 'Selected Logo'}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {fileMeta?.dimensions && (
                  <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                    {fileMeta.dimensions}
                  </span>
                )}
                {fileMeta?.sizeFormatted && (
                  <span>Size: {fileMeta.sizeFormatted}</span>
                )}
                <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>• Valid format</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<RefreshCw size={13} />}
              onClick={() => fileInputRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={<X size={14} color="#EF4444" />}
              onClick={handleRemove}
              title="Remove Logo"
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        /* Drag & Drop Upload Zone */
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '22px 18px',
            border: `2px dashed ${dragOver ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-md)',
            background: dragOver ? 'var(--color-primary-light)' : 'var(--bg-surface-subtle)',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div
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
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Upload size={22} />
          </div>

          <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Click to browse logo file, or drag and drop here
          </div>

          {/* Explicit Image Size & Format Specifications */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              marginTop: '10px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              flexWrap: 'wrap',
            }}
          >
            <span>
              <strong>Dimensions:</strong> 400 × 400 px (Recommended 1:1)
            </span>
            <span style={{ color: 'var(--border-subtle)' }}>|</span>
            <span>
              <strong>Max Size:</strong> 5 MB
            </span>
            <span style={{ color: 'var(--border-subtle)' }}>|</span>
            <span>
              <strong>Formats:</strong> PNG, JPG, SVG, WebP
            </span>
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '12px', color: '#EF4444', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <span className="form-hint" style={{ marginTop: '6px', display: 'block', fontSize: '11.5px' }}>
        {helperText}
      </span>
    </div>
  );
};

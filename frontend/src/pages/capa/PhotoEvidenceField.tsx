import React, { useState } from 'react';
import { Camera, Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_DIMENSION = 1600;

/** Keeps the native input focusable (keyboard users tab to it) while the styled label is what is seen. */
const hiddenInputStyle: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  opacity: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
};

const pickerStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  minHeight: '40px',
  padding: '8px 14px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface-subtle)',
  color: 'var(--text-primary)',
  fontWeight: 600,
  fontSize: '12.5px',
  cursor: 'pointer',
};

/**
 * Downscales a photo to at most 1600px on its longest side and re-encodes it as JPEG, so phone photos
 * upload quickly. The server moves the resulting data URL into file storage.
 */
export const compressImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Image processing is not available in this browser.'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file could not be read as an image.'));
    };
    img.src = url;
  });

interface PhotoEvidenceFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (dataUrl: string) => void;
  /** Called with a user-facing message when a file is rejected. */
  onError: (message: string) => void;
  required?: boolean;
  /** Inline validation message. */
  error?: string;
  hint?: string;
  previewAlt: string;
  /** Extra controls shown next to "Remove" once a photo is attached (e.g. annotate). */
  previewActions?: React.ReactNode;
}

/** Take a photo with the device camera, pick a file, or drop one; shows a preview with a remove control. */
export const PhotoEvidenceField: React.FC<PhotoEvidenceFieldProps> = ({
  id,
  label,
  value,
  onChange,
  onError,
  required = false,
  error,
  hint,
  previewAlt,
  previewActions,
}) => {
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const uploadId = `${id}-upload`;

  const accept = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onError('Choose an image file (JPG, PNG or WEBP).');
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      onError('Choose an image under 10 MB.');
      return;
    }
    setProcessing(true);
    try {
      onChange(await compressImage(file));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'This image could not be attached.');
    } finally {
      setProcessing(false);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void accept(e.target.files?.[0]);
    // Allow choosing the same file again after removing it
    e.target.value = '';
  };

  return (
    <div className="form-group">
      <span className="form-label" id={`${id}-label`}>
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </span>

      {value ? (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <ImageWithFallback src={value} height="180px" alt={previewAlt} allowZoom />
          <div style={{ padding: '8px 10px', display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
            {previewActions}
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange('')}>
              Remove photo
            </Button>
          </div>
        </div>
      ) : (
        <div role="group" aria-labelledby={`${id}-label`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="keep-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <label htmlFor={`${id}-camera`} style={{ ...pickerStyle, borderColor: 'var(--color-primary)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
              <Camera size={16} aria-hidden="true" />
              <span>Take photo</span>
              <input id={`${id}-camera`} type="file" accept="image/*" capture="environment" style={hiddenInputStyle} onChange={onInputChange} disabled={processing} />
            </label>
            <label htmlFor={uploadId} style={pickerStyle}>
              <Upload size={16} aria-hidden="true" />
              <span>Choose file</span>
              <input id={uploadId} type="file" accept="image/*" style={hiddenInputStyle} onChange={onInputChange} disabled={processing} />
            </label>
          </div>
          {/* The drop zone also opens the file picker when clicked */}
          <label
            htmlFor={uploadId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void accept(e.dataTransfer.files?.[0]);
            }}
            style={{
              padding: '18px 16px',
              textAlign: 'center',
              border: `1px dashed ${dragging ? 'var(--color-primary)' : error ? 'var(--color-danger)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-md)',
              background: dragging ? 'var(--bg-pale)' : 'var(--bg-surface-subtle)',
              cursor: 'pointer',
              fontSize: '12.5px',
              color: 'var(--text-secondary)',
            }}
          >
            {processing ? 'Preparing photo…' : 'Or drop an image here (JPG, PNG or WEBP, up to 10 MB)'}
          </label>
        </div>
      )}
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : (
        hint && <div className="form-hint">{hint}</div>
      )}
    </div>
  );
};

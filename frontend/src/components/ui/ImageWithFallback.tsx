import React, { useEffect, useState } from 'react';
import { ExternalLink, ImageOff, ZoomIn } from 'lucide-react';
import { Modal } from './Modal';

export interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string | null;
  alt?: string;
  /** Accepted for compatibility with existing callers; a missing photo is never replaced by a stock image. */
  category?: string;
  fallbackCategory?: string;
  allowZoom?: boolean;
  enableLightbox?: boolean;
  aspectRatio?: string;
  height?: string | number;
  width?: string | number;
  containerStyle?: React.CSSProperties;
  badgeText?: string;
  badgeVariant?: 'success' | 'danger' | 'warning' | 'info' | 'purple';
  /** Text shown when there is no photo (default "No photo"). */
  emptyText?: string;
}

const BADGE_STYLE: Record<NonNullable<ImageWithFallbackProps['badgeVariant']>, React.CSSProperties> = {
  success: { background: 'rgba(5, 150, 105, 0.9)', color: '#FFFFFF' },
  danger: { background: 'rgba(220, 38, 38, 0.9)', color: '#FFFFFF' },
  warning: { background: 'rgba(217, 119, 6, 0.9)', color: '#FFFFFF' },
  purple: { background: 'rgba(139, 92, 246, 0.9)', color: '#FFFFFF' },
  info: { background: 'rgba(0, 76, 143, 0.9)', color: '#FFFFFF' },
};

/**
 * Photo with loading, missing and broken states, and an optional zoom view (a dialog over the page). A missing or broken
 * photo is shown as such: evidence is never substituted with an illustration.
 */
export const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({
  src,
  alt = 'Photo',
  category: _category,
  fallbackCategory: _fallbackCategory,
  allowZoom,
  enableLightbox,
  aspectRatio,
  height,
  width,
  containerStyle,
  badgeText,
  badgeVariant = 'info',
  emptyText = 'No photo',
  className = '',
  style,
  ...props
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(src));
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // A new source starts loading again
  useEffect(() => {
    setHasError(false);
    setIsLoading(Boolean(src));
  }, [src]);

  const hasPhoto = Boolean(src) && !hasError;
  const canZoom = (allowZoom ?? enableLightbox ?? true) && hasPhoto;
  // The photo often sits inside a clickable card: zooming must not also trigger the card
  const openLightbox = (e: React.SyntheticEvent) => {
    if (!canZoom) return;
    e.stopPropagation();
    setLightboxOpen(true);
  };

  return (
    <>
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface-subtle)',
          border: '1px solid var(--border-subtle)',
          aspectRatio,
          height: height || '100%',
          width: width || '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: canZoom ? 'zoom-in' : 'default',
          ...containerStyle,
        }}
        onClick={openLightbox}
        {...(canZoom
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': `${alt} (enlarge)`,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openLightbox(e);
                }
              },
            }
          : {})}
      >
        {badgeText && (
          <span
            style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              zIndex: 10,
              padding: '3px 8px',
              borderRadius: 'var(--radius-xs)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.03em',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              ...BADGE_STYLE[badgeVariant],
            }}
          >
            {badgeText}
          </span>
        )}

        {canZoom && !isLoading && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              bottom: '8px',
              right: '8px',
              zIndex: 10,
              background: 'rgba(15, 23, 42, 0.7)',
              color: '#FFFFFF',
              borderRadius: 'var(--radius-xs)',
              padding: '4px 6px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 600,
              opacity: 0.85,
            }}
          >
            <ZoomIn size={12} />
            <span>Zoom</span>
          </div>
        )}

        {isLoading && hasPhoto && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface-subtle)', zIndex: 5 }}>
            <div className="spinner" style={{ width: '24px', height: '24px' }} />
          </div>
        )}

        {hasPhoto ? (
          <img
            src={src as string}
            alt={alt}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setHasError(true);
              setIsLoading(false);
            }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...style }}
            className={className}
            {...props}
          />
        ) : (
          <div
            role="img"
            aria-label={src ? `${alt}: photo unavailable` : `${alt}: ${emptyText.toLowerCase()}`}
            style={{
              width: '100%',
              height: '100%',
              minHeight: '120px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              color: 'var(--text-tertiary)',
              fontSize: '12px',
              padding: '12px',
              textAlign: 'center',
            }}
          >
            <ImageOff size={22} aria-hidden="true" />
            <span>{src ? 'Photo unavailable' : emptyText}</span>
          </div>
        )}
      </div>

      {/* Zoom view: the app's standard dialog, so the page stays in view behind it. Clicks inside are kept
          from reaching a clickable card that contains the photo (React events bubble through portals). */}
      {canZoom && (
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'contents' }}>
          <Modal
            isOpen={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            title={alt}
            subtitle={badgeText}
            maxWidth="960px"
            footer={
              <a href={src as string} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
                <ExternalLink size={16} aria-hidden="true" />
                Open original
              </a>
            }
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-surface-subtle)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
              }}
            >
              <img src={src as string} alt={alt} style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', display: 'block' }} />
            </div>
          </Modal>
        </div>
      )}
    </>
  );
};

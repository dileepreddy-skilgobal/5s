import React, { useState } from 'react';
import { Camera, ZoomIn, X } from 'lucide-react';

export interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string | null;
  alt?: string;
  category?: string;
  fallbackCategory?: '1S' | '2S' | '3S' | '4S' | '5S' | '6S' | 'GENERAL' | string;
  allowZoom?: boolean;
  enableLightbox?: boolean;
  aspectRatio?: string;
  height?: string | number;
  width?: string | number;
  containerStyle?: React.CSSProperties;
  badgeText?: string;
  badgeVariant?: 'success' | 'danger' | 'warning' | 'info' | 'purple';
}

export const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({
  src,
  alt = '5S Visual Benchmark & Evidence Photo',
  category,
  fallbackCategory,
  allowZoom,
  enableLightbox,
  aspectRatio,
  height,
  width,
  containerStyle,
  badgeText,
  badgeVariant = 'info',
  className = '',
  style,
  ...props
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Normalize zoom configuration
  const canZoom = allowZoom !== undefined ? allowZoom : (enableLightbox !== undefined ? enableLightbox : true);

  // Normalize category
  const rawCat = (category || fallbackCategory || 'GENERAL').toUpperCase();
  const normalizedCategory =
    rawCat.includes('SORT') || rawCat.includes('1S')
      ? '1S'
      : rawCat.includes('ORDER') || rawCat.includes('2S')
      ? '2S'
      : rawCat.includes('SHINE') || rawCat.includes('3S')
      ? '3S'
      : rawCat.includes('STANDARDIZE') || rawCat.includes('4S')
      ? '4S'
      : rawCat.includes('SUSTAIN') || rawCat.includes('5S')
      ? '5S'
      : rawCat.includes('SAFETY') || rawCat.includes('6S')
      ? '6S'
      : 'GENERAL';

  // Safe source resolution
  const resolvedSrc = src || '/assets/5s/cnc_workstation_clean.jpg';

  const getFallbackGradient = () => {
    switch (normalizedCategory) {
      case '1S':
        return 'linear-gradient(135deg, #EF444415 0%, #DC262625 100%)';
      case '2S':
        return 'linear-gradient(135deg, #8B5CF615 0%, #7C3AED25 100%)';
      case '3S':
        return 'linear-gradient(135deg, #10B98115 0%, #05966925 100%)';
      case '4S':
        return 'linear-gradient(135deg, #3B82F615 0%, #2563EB25 100%)';
      case '5S':
        return 'linear-gradient(135deg, #EC489915 0%, #DB277725 100%)';
      case '6S':
        return 'linear-gradient(135deg, #F59E0B15 0%, #D9770625 100%)';
      default:
        return 'linear-gradient(135deg, #64748B15 0%, #47556925 100%)';
    }
  };

  const getBadgeStyle = () => {
    switch (badgeVariant) {
      case 'success':
        return { background: 'rgba(5, 150, 105, 0.9)', color: '#FFFFFF' };
      case 'danger':
        return { background: 'rgba(220, 38, 38, 0.9)', color: '#FFFFFF' };
      case 'warning':
        return { background: 'rgba(217, 119, 6, 0.9)', color: '#FFFFFF' };
      case 'purple':
        return { background: 'rgba(139, 92, 246, 0.9)', color: '#FFFFFF' };
      default:
        return { background: 'rgba(37, 99, 235, 0.9)', color: '#FFFFFF' };
    }
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
          cursor: canZoom && !hasError ? 'pointer' : 'default',
          ...containerStyle,
        }}
        onClick={() => {
          if (canZoom && !hasError) {
            setLightboxOpen(true);
          }
        }}
        className="group"
      >
        {/* Badge Overlay */}
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
              backdropFilter: 'blur(4px)',
              ...getBadgeStyle(),
            }}
          >
            {badgeText}
          </span>
        )}

        {/* Zoom Hint Icon on Hover */}
        {canZoom && !hasError && !isLoading && (
          <div
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
              backdropFilter: 'blur(4px)',
              opacity: 0.85,
              transition: 'opacity 0.2s',
            }}
          >
            <ZoomIn size={12} />
            <span>Zoom</span>
          </div>
        )}

        {/* Loading Spinner */}
        {isLoading && !hasError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-surface-subtle)',
              zIndex: 5,
            }}
          >
            <div className="spinner" style={{ width: '24px', height: '24px' }} />
          </div>
        )}

        {/* Actual Image */}
        {!hasError ? (
          <img
            src={resolvedSrc}
            alt={alt}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setHasError(true);
              setIsLoading(false);
            }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              ...style,
            }}
            className={className}
            {...props}
          />
        ) : (
          /* Error Fallback Card */
          <div
            style={{
              width: '100%',
              height: '100%',
              minHeight: '140px',
              background: getFallbackGradient(),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              textAlign: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Camera size={20} />
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {alt || '5S Photographic Evidence'}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
              {normalizedCategory} Visual Workplace Benchmark
            </span>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(10, 15, 30, 0.92)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={() => setLightboxOpen(false)}
        >
          {/* Top Bar */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '24px',
              right: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#FFFFFF',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {badgeText && (
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '12px',
                    fontWeight: 700,
                    ...getBadgeStyle(),
                  }}
                >
                  {badgeText}
                </span>
              )}
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                {alt}
              </h3>
            </div>

            <button
              onClick={() => setLightboxOpen(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                border: 'none',
                color: '#FFFFFF',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Large Image Container */}
          <div
            style={{
              maxWidth: '90vw',
              maxHeight: '80vh',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={resolvedSrc}
              alt={alt}
              style={{
                maxWidth: '90vw',
                maxHeight: '80vh',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};

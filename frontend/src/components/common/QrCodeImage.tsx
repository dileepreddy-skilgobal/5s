import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeImageProps {
  /** Pre-rendered PNG data URL from the API; rendered as-is when present. */
  dataUrl?: string | null;
  /** Payload to encode locally when no pre-rendered image is available. */
  value: string;
  size?: number;
  alt: string;
  style?: React.CSSProperties;
}

/**
 * Renders a QR code entirely in the browser. Payloads (tenant ids, area codes) are never sent
 * to a third-party QR service.
 */
export const QrCodeImage: React.FC<QrCodeImageProps> = ({ dataUrl, value, size = 200, alt, style }) => {
  const [generated, setGenerated] = useState<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (dataUrl) return;
    if (!value) {
      setGenerated('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setGenerated(url);
      })
      .catch(() => {
        if (!cancelled) {
          setGenerated('');
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dataUrl, value, size]);

  const src = dataUrl || generated;
  if (!src) {
    return (
      <div
        role="img"
        aria-label={failed ? `${alt} (could not be generated)` : alt}
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--text-tertiary)',
          border: '1px dashed var(--border-color)',
          borderRadius: '6px',
          ...style,
        }}
      >
        {failed ? 'QR code could not be generated' : ''}
      </div>
    );
  }
  return <img src={src} alt={alt} style={style} />;
};

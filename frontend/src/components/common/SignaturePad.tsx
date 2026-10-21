import React, { forwardRef, useId, useImperativeHandle, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';

export interface SignaturePadHandle {
  /** PNG data URL of the signature, or null when nothing has been drawn. */
  toDataURL: () => string | null;
  clear: () => void;
}

interface SignaturePadProps {
  /** Accessible name of the pad, e.g. "Auditor signature". */
  label: string;
  onChange: (hasSignature: boolean) => void;
  /** Shown under the pad (e.g. a validation message). */
  error?: string | null;
}

// 3:1 bitmap shown at the same ratio, so strokes are never stretched
const BITMAP_WIDTH = 900;
const BITMAP_HEIGHT = 300;

/**
 * Signature capture with pointer events (mouse, touch and stylus). The bitmap has a fixed size and ratio, and
 * pointer positions are scaled to it, so the drawing lines up at any displayed width.
 * The pad is always white with dark ink: it is printed on the report.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(({ label, onChange, error }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef<number | null>(null);
  const hasInk = useRef(false);
  const baseId = useId();

  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    onChange(false);
  };

  useImperativeHandle(ref, () => ({
    toDataURL: () => (hasInk.current && canvasRef.current ? canvasRef.current.toDataURL('image/png') : null),
    clear,
  }));

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) * canvas.width) / rect.width, y: ((e.clientY - rect.top) * canvas.height) / rect.height };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = e.pointerId;
    ctx.strokeStyle = '#1D2733';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawing.current !== e.pointerId) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasInk.current) {
      hasInk.current = true;
      onChange(true);
    }
  };

  const handleUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawing.current !== e.pointerId) return;
    drawing.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const errorId = error ? `${baseId}-error` : undefined;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span className="form-label" style={{ margin: 0 }}>
          {label}{' '}
          <span className="required" aria-hidden="true">
            *
          </span>
        </span>
        <Button type="button" variant="ghost" size="sm" icon={<RotateCcw size={14} aria-hidden="true" />} onClick={clear} aria-label={`Clear ${label.toLowerCase()}`}>
          Clear
        </Button>
      </div>
      <div
        style={{
          width: '100%',
          aspectRatio: '3 / 1',
          borderRadius: 'var(--radius-md)',
          // Always white: the signature is printed on the report
          background: '#FFFFFF',
          border: `1px solid ${error ? 'var(--color-danger)' : 'var(--border-strong)'}`,
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          width={BITMAP_WIDTH}
          height={BITMAP_HEIGHT}
          role="img"
          aria-label={`${label} pad: draw your signature with a finger, stylus or mouse`}
          aria-describedby={errorId}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
        />
      </div>
      {error ? (
        <div id={errorId} role="alert" className="form-error">
          {error}
        </div>
      ) : (
        <div className="form-hint" style={{ marginTop: '4px' }}>Sign inside the box with a finger, stylus or mouse.</div>
      )}
    </div>
  );
});

SignaturePad.displayName = 'SignaturePad';

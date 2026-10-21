import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { PhotoAnnotation } from '../../types';
import { PercentAnnotation } from '../../services/auditExecutionApi';
import { EVIDENCE_JPEG_QUALITY, fitWithin, loadImage, loadImageFile } from './evidencePhoto';
import { Circle, MoveRight, Square, Type, Undo2, Trash2, Check, Upload, Camera, ImagePlus } from 'lucide-react';

/** Everything produced by one annotation session. */
export interface AnnotatedPhotoResult {
  /** JPEG with the markings drawn in. */
  annotatedDataUrl: string;
  /** The same photo without markings (JPEG, same size). */
  originalDataUrl: string;
  /** Markings as percentages of the photo size, so they stay valid at any resolution. */
  annotations: PercentAnnotation[];
}

interface PhotoAnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** A real photo to annotate (e.g. one already attached). Without it the user takes or picks one. */
  initialPhotoUrl?: string | null;
  onSave: (annotatedDataUrl: string, annotations: PhotoAnnotation[], result: AnnotatedPhotoResult) => void;
  title?: string;
}

type Tool = 'circle' | 'arrow' | 'box' | 'text';

const TOOLS: Array<{ key: Tool; label: string; icon: React.ReactNode }> = [
  { key: 'circle', label: 'Circle', icon: <Circle size={15} /> },
  { key: 'arrow', label: 'Arrow', icon: <MoveRight size={15} /> },
  { key: 'box', label: 'Box', icon: <Square size={15} /> },
  { key: 'text', label: 'Text', icon: <Type size={15} /> },
];

// Marking colours are drawn into the photo itself, so they are fixed values rather than theme tokens
const COLORS = [
  { label: 'Red', color: '#EF4444' },
  { label: 'Amber', color: '#F59E0B' },
  { label: 'Yellow', color: '#EAB308' },
  { label: 'Green', color: '#10B981' },
  { label: 'Blue', color: '#2563EB' },
  { label: 'White', color: '#FFFFFF' },
];

const toPercent = (a: PhotoAnnotation, w: number, h: number): PercentAnnotation => {
  const px = (v?: number) => (v === undefined ? undefined : Number(((v / w) * 100).toFixed(2)));
  const py = (v?: number) => (v === undefined ? undefined : Number(((v / h) * 100).toFixed(2)));
  return {
    type: a.type,
    unit: 'pct',
    color: a.color,
    text: a.text || undefined,
    x: px(a.x),
    y: py(a.y),
    width: px(a.width),
    height: py(a.height),
    radius: px(a.radius),
    fromX: px(a.fromX),
    fromY: py(a.fromY),
    toX: px(a.toX),
    toY: py(a.toY),
  };
};

export const PhotoAnnotationModal: React.FC<PhotoAnnotationModalProps> = ({
  isOpen,
  onClose,
  initialPhotoUrl,
  onSave,
  title = 'Annotate photo',
}) => {
  const labelId = useId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTool, setActiveTool] = useState<Tool>('circle');
  const [activeColor, setActiveColor] = useState<string>(COLORS[0].color);
  const [annotationText, setAnnotationText] = useState<string>('');
  const [annotations, setAnnotations] = useState<PhotoAnnotation[]>([]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const drawStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  // Every opening starts clean: no markings from the last photo, and only a real photo (if one was passed)
  useEffect(() => {
    if (!isOpen) return;
    setAnnotations([]);
    setPhotoError(null);
    setImage(null);
    setActiveTool('circle');
    if (!initialPhotoUrl) return;
    let cancelled = false;
    setLoadingPhoto(true);
    loadImage(initialPhotoUrl, !initialPhotoUrl.startsWith('data:'))
      .then((img) => {
        if (!cancelled) setImage(img);
      })
      .catch(() => {
        if (!cancelled) setPhotoError('This photo could not be opened for annotation. Take or choose another photo.');
      })
      .finally(() => {
        if (!cancelled) setLoadingPhoto(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, initialPhotoUrl]);

  const strokeWidth = (canvas: HTMLCanvasElement) => Math.max(3, Math.round(canvas.width * 0.004));
  const fontSize = (canvas: HTMLCanvasElement) => Math.max(14, Math.round(canvas.width * 0.022));

  const redraw = useCallback(
    (items: PhotoAnnotation[], temp?: PhotoAnnotation, withMarkings = true) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !image) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (!withMarkings) return;

      const lw = strokeWidth(canvas);
      const fs = fontSize(canvas);
      for (const ann of temp ? [...items, temp] : items) {
        ctx.strokeStyle = ann.color;
        ctx.fillStyle = ann.color;
        ctx.lineWidth = lw;
        ctx.font = `bold ${fs}px Inter, Arial, sans-serif`;
        if (ann.type === 'circle' && ann.x !== undefined && ann.y !== undefined && ann.radius !== undefined) {
          ctx.beginPath();
          ctx.arc(ann.x, ann.y, Math.max(lw * 3, ann.radius), 0, 2 * Math.PI);
          ctx.stroke();
          if (ann.text) ctx.fillText(ann.text, ann.x - ann.radius, ann.y - ann.radius - fs * 0.5);
        } else if (ann.type === 'box' && ann.x !== undefined && ann.y !== undefined && ann.width && ann.height) {
          ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
          if (ann.text) ctx.fillText(ann.text, ann.x, ann.y - fs * 0.5);
        } else if (ann.type === 'arrow' && ann.fromX !== undefined && ann.fromY !== undefined && ann.toX !== undefined && ann.toY !== undefined) {
          ctx.beginPath();
          ctx.moveTo(ann.fromX, ann.fromY);
          ctx.lineTo(ann.toX, ann.toY);
          ctx.stroke();
          const angle = Math.atan2(ann.toY - ann.fromY, ann.toX - ann.fromX);
          const head = lw * 5;
          ctx.beginPath();
          ctx.moveTo(ann.toX, ann.toY);
          ctx.lineTo(ann.toX - head * Math.cos(angle - Math.PI / 6), ann.toY - head * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(ann.toX - head * Math.cos(angle + Math.PI / 6), ann.toY - head * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
          if (ann.text) ctx.fillText(ann.text, ann.fromX, ann.fromY - fs * 0.5);
        } else if (ann.type === 'text' && ann.x !== undefined && ann.y !== undefined && ann.text) {
          const w = ctx.measureText(ann.text).width;
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.fillRect(ann.x - fs * 0.3, ann.y - fs, w + fs * 0.6, fs * 1.4);
          ctx.fillStyle = ann.color;
          ctx.fillText(ann.text, ann.x, ann.y);
        }
      }
    },
    [image],
  );

  // Size the canvas to the photo (aspect ratio kept, downscaled to the evidence size), then draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight);
    canvas.width = width;
    canvas.height = height;
    redraw(annotations);
    // Only when the photo changes; annotation changes redraw directly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLoadingPhoto(true);
    setPhotoError(null);
    try {
      const img = await loadImageFile(file);
      setAnnotations([]);
      setImage(img);
    } catch {
      setPhotoError('This file could not be read as a photo. Use a JPEG or PNG image.');
    } finally {
      setLoadingPhoto(false);
    }
  };

  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const shapeFrom = (start: { x: number; y: number }, end: { x: number; y: number }): PhotoAnnotation | undefined => {
    const text = annotationText.trim() || undefined;
    if (activeTool === 'circle') {
      return { type: 'circle', x: start.x, y: start.y, radius: Math.hypot(end.x - start.x, end.y - start.y), color: activeColor, text };
    }
    if (activeTool === 'box') {
      return {
        type: 'box',
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
        color: activeColor,
        text,
      };
    }
    if (activeTool === 'arrow') {
      return { type: 'arrow', fromX: start.x, fromY: start.y, toX: end.x, toY: end.y, color: activeColor, text };
    }
    return undefined;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image) return;
    const pos = toCanvas(e);
    if (activeTool === 'text') {
      const text = annotationText.trim();
      if (!text) return;
      const updated = [...annotations, { type: 'text' as const, x: pos.x, y: pos.y, color: activeColor, text }];
      setAnnotations(updated);
      redraw(updated);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawStart.current = { ...pos, pointerId: e.pointerId };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = drawStart.current;
    if (!start || start.pointerId !== e.pointerId) return;
    redraw(annotations, shapeFrom(start, toCanvas(e)));
  };

  const finishShape = (e: React.PointerEvent<HTMLCanvasElement>, commit: boolean) => {
    const start = drawStart.current;
    if (!start || start.pointerId !== e.pointerId) return;
    drawStart.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const end = toCanvas(e);
    const minSize = Math.max(6, (canvasRef.current?.width ?? 800) * 0.01);
    const shape = commit && Math.hypot(end.x - start.x, end.y - start.y) > minSize ? shapeFrom(start, end) : undefined;
    const updated = shape ? [...annotations, shape] : annotations;
    if (shape) setAnnotations(updated);
    redraw(updated);
  };

  const handleUndo = () => {
    const updated = annotations.slice(0, -1);
    setAnnotations(updated);
    redraw(updated);
  };

  const handleClear = () => {
    setAnnotations([]);
    redraw([]);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    setSaving(true);
    try {
      redraw(annotations, undefined, false);
      const originalDataUrl = canvas.toDataURL('image/jpeg', EVIDENCE_JPEG_QUALITY);
      redraw(annotations);
      const annotatedDataUrl = annotations.length ? canvas.toDataURL('image/jpeg', EVIDENCE_JPEG_QUALITY) : originalDataUrl;
      const percent = annotations.map((a) => toPercent(a, canvas.width, canvas.height));
      onSave(annotatedDataUrl, annotations, { annotatedDataUrl, originalDataUrl, annotations: percent });
      onClose();
    } catch {
      // A photo served without CORS headers taints the canvas and cannot be exported
      setPhotoError('This photo cannot be saved from here. Take or choose the photo again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle="Take or choose a photo, then mark the problem on it."
      maxWidth="860px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {image ? `${annotations.length} ${annotations.length === 1 ? 'marking' : 'markings'}` : 'No photo yet'}
          </span>
          <div style={{ display: 'flex', gap: '12px', marginLeft: 'auto' }}>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Check size={16} />} onClick={handleSave} disabled={!image || loadingPhoto} loading={saving}>
              Save photo
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <input type="file" ref={cameraInputRef} onChange={handleFile} accept="image/*" capture="environment" hidden aria-hidden="true" tabIndex={-1} />
        <input type="file" ref={fileInputRef} onChange={handleFile} accept="image/*" hidden aria-hidden="true" tabIndex={-1} />

        {image && (
          <>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 16px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div role="group" aria-label="Marking tool" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {TOOLS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      className="pillar-tab-pill"
                      aria-pressed={activeTool === t.key}
                      onClick={() => setActiveTool(t.key)}
                      style={{ minHeight: '40px' }}
                    >
                      <span aria-hidden="true" style={{ display: 'inline-flex' }}>
                        {t.icon}
                      </span>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div role="group" aria-label="Marking colour" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  {COLORS.map((c) => (
                    <button
                      key={c.color}
                      type="button"
                      aria-label={c.label}
                      aria-pressed={activeColor === c.color}
                      title={c.label}
                      onClick={() => setActiveColor(c.color)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: c.color,
                        border: activeColor === c.color ? '3px solid var(--bg-surface)' : '1px solid var(--border-strong)',
                        boxShadow: activeColor === c.color ? '0 0 0 2px var(--color-primary)' : 'none',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                <Button variant="secondary" size="sm" icon={<Undo2 size={14} />} onClick={handleUndo} disabled={annotations.length === 0}>
                  Undo
                </Button>
                <Button variant="secondary" size="sm" icon={<Trash2 size={14} />} onClick={handleClear} disabled={annotations.length === 0}>
                  Clear markings
                </Button>
                <Button variant="ghost" size="sm" icon={<Camera size={14} />} onClick={() => cameraInputRef.current?.click()} style={{ marginLeft: 'auto' }}>
                  Retake
                </Button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor={labelId} className="form-label" style={{ margin: 0 }}>
                Label {activeTool === 'text' ? '(required for text)' : '(optional)'}
              </label>
              <input
                id={labelId}
                type="text"
                className="form-input"
                value={annotationText}
                onChange={(e) => setAnnotationText(e.target.value)}
                placeholder="e.g. Oil leak, missing label, blocked aisle"
                maxLength={80}
              />
              {activeTool === 'text' && !annotationText.trim() && (
                <span className="form-hint">Type a label, then tap the photo where it should go.</span>
              )}
            </div>
          </>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '220px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface-subtle)',
            border: image ? '1px solid var(--border-subtle)' : '2px dashed var(--border-strong)',
            overflow: 'hidden',
          }}
        >
          {image ? (
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`Photo being annotated, ${annotations.length} ${annotations.length === 1 ? 'marking' : 'markings'}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => finishShape(e, true)}
              onPointerCancel={(e) => finishShape(e, false)}
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: '60vh',
                width: 'auto',
                height: 'auto',
                touchAction: 'none',
                cursor: activeTool === 'text' ? 'text' : 'crosshair',
              }}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <ImagePlus size={32} color="var(--text-tertiary)" aria-hidden="true" />
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                {loadingPhoto ? 'Opening photo…' : 'Add a photo of what you see.'}
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" icon={<Camera size={16} />} onClick={() => cameraInputRef.current?.click()} disabled={loadingPhoto}>
                  Take photo
                </Button>
                <Button variant="secondary" icon={<Upload size={16} />} onClick={() => fileInputRef.current?.click()} disabled={loadingPhoto}>
                  Choose photo
                </Button>
              </div>
            </div>
          )}
        </div>

        {photoError && (
          <div
            role="alert"
            style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', fontSize: '13px', color: 'var(--color-danger)' }}
          >
            {photoError}
          </div>
        )}
      </div>
    </Modal>
  );
};

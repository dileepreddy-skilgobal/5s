import React, { useRef, useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { PhotoAnnotation } from '../../types';
import {
  Circle,
  MoveRight,
  Square,
  Type,
  Undo2,
  Trash2,
  Check,
  Upload,
  Camera,
} from 'lucide-react';

interface PhotoAnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPhotoUrl?: string;
  onSave: (annotatedDataUrl: string, annotations: PhotoAnnotation[]) => void;
  title?: string;
}

export const PhotoAnnotationModal: React.FC<PhotoAnnotationModalProps> = ({
  isOpen,
  onClose,
  initialPhotoUrl,
  onSave,
  title = 'Photo Evidence & Defect Annotation Canvas',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTool, setActiveTool] = useState<'circle' | 'arrow' | 'box' | 'text'>('circle');
  const [activeColor, setActiveColor] = useState<string>('#EF4444'); // Red default
  const [annotationText, setAnnotationText] = useState<string>('Non-Conformance');
  const [annotations, setAnnotations] = useState<PhotoAnnotation[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string>(initialPhotoUrl || '');

  const colorPalette = [
    { label: 'Critical Red', color: '#EF4444' },
    { label: 'Warning Amber', color: '#F59E0B' },
    { label: 'Caution Yellow', color: '#EAB308' },
    { label: 'Good Practice Green', color: '#10B981' },
    { label: 'Highlight Blue', color: '#2563EB' },
    { label: 'Annotation White', color: '#FFFFFF' },
  ];

  // Load image when initialPhotoUrl changes
  useEffect(() => {
    if (initialPhotoUrl) {
      setCurrentPhotoUrl(initialPhotoUrl);
      loadImage(initialPhotoUrl);
    } else {
      // Default blank canvas with subtle grid
      setLoadedImage(null);
    }
  }, [initialPhotoUrl, isOpen]);

  const loadImage = (url: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setLoadedImage(img);
      redrawCanvas(img, annotations);
    };
    img.src = url;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setCurrentPhotoUrl(url);
        loadImage(url);
      };
      reader.readAsDataURL(file);
    }
  };

  const redrawCanvas = (img: HTMLImageElement | null, items: PhotoAnnotation[], tempShape?: PhotoAnnotation) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background photo or placeholder
    if (img) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#64748B';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Upload or capture photo evidence to annotate', canvas.width / 2, canvas.height / 2);
    }

    // Render all confirmed annotations
    const allItems = tempShape ? [...items, tempShape] : items;

    for (const ann of allItems) {
      ctx.strokeStyle = ann.color;
      ctx.fillStyle = ann.color;
      ctx.lineWidth = 3;

      if (ann.type === 'circle' && ann.x !== undefined && ann.y !== undefined && ann.radius !== undefined) {
        ctx.beginPath();
        ctx.arc(ann.x, ann.y, Math.max(10, ann.radius), 0, 2 * Math.PI);
        ctx.stroke();

        if (ann.text) {
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.fillStyle = ann.color;
          ctx.fillText(ann.text, ann.x, ann.y - (ann.radius + 8));
        }
      } else if (ann.type === 'box' && ann.x !== undefined && ann.y !== undefined && ann.width && ann.height) {
        ctx.beginPath();
        ctx.rect(ann.x, ann.y, ann.width, ann.height);
        ctx.stroke();

        if (ann.text) {
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.fillText(ann.text, ann.x, ann.y - 8);
        }
      } else if (ann.type === 'arrow' && ann.fromX !== undefined && ann.fromY !== undefined && ann.toX !== undefined && ann.toY !== undefined) {
        // Draw line
        ctx.beginPath();
        ctx.moveTo(ann.fromX, ann.fromY);
        ctx.lineTo(ann.toX, ann.toY);
        ctx.stroke();

        // Draw arrowhead
        const angle = Math.atan2(ann.toY - ann.fromY, ann.toX - ann.fromX);
        const headlen = 15;
        ctx.beginPath();
        ctx.moveTo(ann.toX, ann.toY);
        ctx.lineTo(ann.toX - headlen * Math.cos(angle - Math.PI / 6), ann.toY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ann.toX - headlen * Math.cos(angle + Math.PI / 6), ann.toY - headlen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        if (ann.text) {
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.fillText(ann.text, ann.fromX, ann.fromY - 8);
        }
      } else if (ann.type === 'text' && ann.x !== undefined && ann.y !== undefined && ann.text) {
        ctx.font = 'bold 14px Inter, sans-serif';
        // Text background pill
        const textWidth = ctx.measureText(ann.text).width;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(ann.x - 4, ann.y - 14, textWidth + 8, 20);
        ctx.fillStyle = ann.color;
        ctx.fillText(ann.text, ann.x, ann.y);
      }
    }
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasCoords(e);
    setIsDrawing(true);
    setStartPos(pos);

    if (activeTool === 'text') {
      const newAnn: PhotoAnnotation = {
        type: 'text',
        x: pos.x,
        y: pos.y,
        color: activeColor,
        text: annotationText || 'Defect Note',
      };
      const updated = [...annotations, newAnn];
      setAnnotations(updated);
      redrawCanvas(loadedImage, updated);
      setIsDrawing(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos || activeTool === 'text') return;
    const current = getCanvasCoords(e);

    let tempShape: PhotoAnnotation | undefined;
    if (activeTool === 'circle') {
      const radius = Math.sqrt(Math.pow(current.x - startPos.x, 2) + Math.pow(current.y - startPos.y, 2));
      tempShape = {
        type: 'circle',
        x: startPos.x,
        y: startPos.y,
        radius,
        color: activeColor,
        text: annotationText,
      };
    } else if (activeTool === 'box') {
      tempShape = {
        type: 'box',
        x: Math.min(startPos.x, current.x),
        y: Math.min(startPos.y, current.y),
        width: Math.abs(current.x - startPos.x),
        height: Math.abs(current.y - startPos.y),
        color: activeColor,
        text: annotationText,
      };
    } else if (activeTool === 'arrow') {
      tempShape = {
        type: 'arrow',
        fromX: startPos.x,
        fromY: startPos.y,
        toX: current.x,
        toY: current.y,
        color: activeColor,
        text: annotationText,
      };
    }

    redrawCanvas(loadedImage, annotations, tempShape);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos || activeTool === 'text') return;
    const current = getCanvasCoords(e);
    setIsDrawing(false);

    let finalShape: PhotoAnnotation | undefined;
    if (activeTool === 'circle') {
      const radius = Math.sqrt(Math.pow(current.x - startPos.x, 2) + Math.pow(current.y - startPos.y, 2));
      if (radius > 5) {
        finalShape = {
          type: 'circle',
          x: startPos.x,
          y: startPos.y,
          radius,
          color: activeColor,
          text: annotationText,
        };
      }
    } else if (activeTool === 'box') {
      const width = Math.abs(current.x - startPos.x);
      const height = Math.abs(current.y - startPos.y);
      if (width > 5 && height > 5) {
        finalShape = {
          type: 'box',
          x: Math.min(startPos.x, current.x),
          y: Math.min(startPos.y, current.y),
          width,
          height,
          color: activeColor,
          text: annotationText,
        };
      }
    } else if (activeTool === 'arrow') {
      const dist = Math.sqrt(Math.pow(current.x - startPos.x, 2) + Math.pow(current.y - startPos.y, 2));
      if (dist > 10) {
        finalShape = {
          type: 'arrow',
          fromX: startPos.x,
          fromY: startPos.y,
          toX: current.x,
          toY: current.y,
          color: activeColor,
          text: annotationText,
        };
      }
    }

    if (finalShape) {
      const updated = [...annotations, finalShape];
      setAnnotations(updated);
      redrawCanvas(loadedImage, updated);
    }
  };

  const handleUndo = () => {
    const updated = annotations.slice(0, -1);
    setAnnotations(updated);
    redrawCanvas(loadedImage, updated);
  };

  const handleClear = () => {
    setAnnotations([]);
    redrawCanvas(loadedImage, []);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl, annotations);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="820px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {/* Tool selectors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setActiveTool('circle')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: activeTool === 'circle' ? 'var(--color-primary)' : 'var(--border-subtle)',
                background: activeTool === 'circle' ? 'var(--color-primary-subtle)' : 'var(--bg-surface)',
                color: activeTool === 'circle' ? 'var(--color-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: activeTool === 'circle' ? 600 : 500,
                fontSize: '13px',
              }}
            >
              <Circle size={15} /> Circle
            </button>
            <button
              type="button"
              onClick={() => setActiveTool('arrow')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: activeTool === 'arrow' ? 'var(--color-primary)' : 'var(--border-subtle)',
                background: activeTool === 'arrow' ? 'var(--color-primary-subtle)' : 'var(--bg-surface)',
                color: activeTool === 'arrow' ? 'var(--color-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: activeTool === 'arrow' ? 600 : 500,
                fontSize: '13px',
              }}
            >
              <MoveRight size={15} /> Arrow
            </button>
            <button
              type="button"
              onClick={() => setActiveTool('box')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: activeTool === 'box' ? 'var(--color-primary)' : 'var(--border-subtle)',
                background: activeTool === 'box' ? 'var(--color-primary-subtle)' : 'var(--bg-surface)',
                color: activeTool === 'box' ? 'var(--color-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: activeTool === 'box' ? 600 : 500,
                fontSize: '13px',
              }}
            >
              <Square size={15} /> Box
            </button>
            <button
              type="button"
              onClick={() => setActiveTool('text')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: activeTool === 'text' ? 'var(--color-primary)' : 'var(--border-subtle)',
                background: activeTool === 'text' ? 'var(--color-primary-subtle)' : 'var(--bg-surface)',
                color: activeTool === 'text' ? 'var(--color-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: activeTool === 'text' ? 600 : 500,
                fontSize: '13px',
              }}
            >
              <Type size={15} /> Text Tag
            </button>
          </div>

          {/* Color Palette */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {colorPalette.map((p) => (
              <button
                key={p.color}
                type="button"
                title={p.label}
                onClick={() => setActiveColor(p.color)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: p.color,
                  border: activeColor === p.color ? '3px solid #FFFFFF' : '1px solid rgba(0,0,0,0.2)',
                  boxShadow: activeColor === p.color ? '0 0 0 2px var(--color-primary)' : 'none',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button variant="secondary" size="sm" icon={<Undo2 size={14} />} onClick={handleUndo} disabled={annotations.length === 0}>
              Undo
            </Button>
            <Button variant="secondary" size="sm" icon={<Trash2 size={14} />} onClick={handleClear} disabled={annotations.length === 0}>
              Clear
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Upload size={14} />}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Photo
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* Text tag caption input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Annotation Label:
          </span>
          <input
            type="text"
            className="form-control"
            value={annotationText}
            onChange={(e) => setAnnotationText(e.target.value)}
            placeholder="e.g. Obsolete Fixture, Oil Leak, Broken Guard..."
            style={{ flex: 1, padding: '6px 12px', fontSize: '13px' }}
          />
        </div>

        {/* Canvas Area */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '420px',
            background: '#0F172A',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            border: '2px dashed var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <canvas
            ref={canvasRef}
            width={760}
            height={420}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{
              cursor: activeTool === 'text' ? 'text' : 'crosshair',
              maxWidth: '100%',
              maxHeight: '100%',
              display: 'block',
            }}
          />
        </div>

        {/* Bottom Modal Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            {annotations.length} annotation markers applied directly to evidence photo.
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Check size={16} />} onClick={handleSave}>
              Save Annotated Evidence
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

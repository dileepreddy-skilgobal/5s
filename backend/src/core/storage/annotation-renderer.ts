import sharp = require('./sharp');

/**
 * Photo annotation as drawn on a device. Only annotations whose geometry is relative to the photo
 * (`unit: 'pct'`: every coordinate and size is a percentage of the image width / height) are
 * rendered; pixel-based shapes from older clients are ignored rather than drawn in the wrong place.
 */
export interface PercentAnnotation {
  type: 'arrow' | 'box' | 'circle' | 'text';
  unit?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Percentage of the image width. */
  radius?: number;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  text?: string;
  color?: string;
}

const SAFE_COLOR = /^#[0-9a-f]{3,8}$|^[a-z]{3,20}$/i;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, -10), 110) : fallback);

export function renderableAnnotations(raw: unknown): PercentAnnotation[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is PercentAnnotation => !!a && typeof a === 'object' && (a as PercentAnnotation).unit === 'pct').slice(0, 50);
}

/** Burns the annotations into the photo (JPEG). The original photo is kept separately as evidence. */
export async function burnAnnotations(photo: Buffer, annotations: PercentAnnotation[]): Promise<Buffer> {
  const base = sharp(photo).rotate();
  const meta = await base.metadata();
  // `rotate()` applies EXIF orientation, so swap dimensions for 90° orientations
  const swap = (meta.orientation ?? 1) >= 5;
  const W = (swap ? meta.height : meta.width) ?? 1000;
  const H = (swap ? meta.width : meta.height) ?? 1000;
  const px = (p: unknown) => (num(p) / 100) * W;
  const py = (p: unknown) => (num(p) / 100) * H;
  const stroke = Math.max(3, Math.round(W * 0.006));
  const font = Math.max(14, Math.round(W * 0.03));

  const label = (x: number, y: number, text: string, color: string) => {
    const t = esc(text.slice(0, 80));
    const w = Math.round(t.length * font * 0.58 + font * 0.8);
    const h = Math.round(font * 1.5);
    const lx = Math.min(Math.max(0, x), W - w);
    const ly = Math.min(Math.max(0, y), H - h);
    return `<rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="${Math.round(h / 4)}" fill="${color}" fill-opacity="0.85"/>` +
      `<text x="${lx + font * 0.4}" y="${ly + h * 0.72}" font-family="Arial, Helvetica, sans-serif" font-size="${font}" font-weight="bold" fill="#FFFFFF">${t}</text>`;
  };

  const shapes = annotations.map((a) => {
    const color = a.color && SAFE_COLOR.test(a.color) ? a.color : '#EF4444';
    const text = a.text?.trim();
    if (a.type === 'box') {
      const x = px(a.x), y = py(a.y), w = px(a.width ?? 15), h = py(a.height ?? 10);
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="${stroke}"/>` + (text ? label(x, y - font * 1.6, text, color) : '');
    }
    if (a.type === 'circle') {
      const cx = px(a.x), cy = py(a.y), r = px(a.radius ?? 6);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"/>` + (text ? label(cx - r, cy - r - font * 1.6, text, color) : '');
    }
    if (a.type === 'arrow') {
      const x1 = px(a.fromX ?? a.x), y1 = py(a.fromY ?? a.y), x2 = px(a.toX), y2 = py(a.toY);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = stroke * 5;
      const p1 = `${x2 - head * Math.cos(angle - Math.PI / 7)},${y2 - head * Math.sin(angle - Math.PI / 7)}`;
      const p2 = `${x2 - head * Math.cos(angle + Math.PI / 7)},${y2 - head * Math.sin(angle + Math.PI / 7)}`;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>` +
        `<polygon points="${x2},${y2} ${p1} ${p2}" fill="${color}"/>` + (text ? label(x1, y1 + font * 0.4, text, color) : '');
    }
    return text ? label(px(a.x), py(a.y), text, color) : '';
  });

  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${shapes.join('')}</svg>`);
  return sharp(await base.toBuffer()).composite([{ input: svg, top: 0, left: 0 }]).jpeg({ quality: 85 }).toBuffer();
}

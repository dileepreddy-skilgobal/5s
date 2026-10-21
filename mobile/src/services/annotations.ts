import { AnnotationShape, PhotoAnnotation } from '../types';

/** Default sizes (percent) for shapes placed with a tap; the same defaults the server uses. */
export const DEFAULT_BOX_PCT = { width: 15, height: 10 };
export const DEFAULT_CIRCLE_RADIUS_PCT = 6;

const clampPct = (v: number) => Math.min(100, Math.max(0, v));
const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Returns the annotation in the percent model the server burns (`unit: 'pct'`).
 * Shapes saved by earlier builds stored box size / circle radius in canvas pixels; their position was
 * already a percentage, so they keep it and get the default size (pixel sizes cannot be converted
 * without the canvas they were drawn on).
 */
export function toPercentAnnotation(a: PhotoAnnotation): PhotoAnnotation {
  if (a.unit === 'pct') return a;
  const base: PhotoAnnotation = { ...a, unit: 'pct', x: round(clampPct(a.x)), y: round(clampPct(a.y)) };
  if (a.type === 'box') return { ...base, width: DEFAULT_BOX_PCT.width, height: DEFAULT_BOX_PCT.height };
  if (a.type === 'circle') return { ...base, radius: DEFAULT_CIRCLE_RADIUS_PCT };
  return base;
}

export const toPercentAnnotations = (list: PhotoAnnotation[] | undefined): PhotoAnnotation[] => (list ?? []).map(toPercentAnnotation);

/** Shape as sent to the server: only the drawing fields (no local id). */
export function forServer(list: PhotoAnnotation[] | undefined): AnnotationShape[] {
  return toPercentAnnotations(list).map(({ id: _id, ...shape }) => shape);
}

export { clampPct, round as roundPct };

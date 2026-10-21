import { FiveSCategory } from '../types';

export interface PillarInfo {
  key: FiveSCategory;
  short: string;
  label: string;
  full: string;
  color: string;
}

/** Display metadata for the 5S + Safety pillars (codes match the backend). */
export const PILLARS: PillarInfo[] = [
  { key: 'S1_SORT', short: 'S1', label: '1S Sort', full: '1S — Sort (Seiri)', color: '#EF4444' },
  { key: 'S2_SET_IN_ORDER', short: 'S2', label: '2S Order', full: '2S — Set In Order (Seiton)', color: '#F97316' },
  { key: 'S3_SHINE', short: 'S3', label: '3S Shine', full: '3S — Shine (Seiso)', color: '#EAB308' },
  { key: 'S4_STANDARDIZE', short: 'S4', label: '4S Standard', full: '4S — Standardize (Seiketsu)', color: '#3B82F6' },
  { key: 'S5_SUSTAIN', short: 'S5', label: '5S Sustain', full: '5S — Sustain (Shitsuke)', color: '#10B981' },
  { key: 'S6_SAFETY', short: 'S6', label: '6S Safety', full: '6S — Safety', color: '#8B5CF6' },
];

export const PILLAR_BY_KEY: Record<FiveSCategory, PillarInfo> = Object.fromEntries(
  PILLARS.map((p) => [p.key, p]),
) as Record<FiveSCategory, PillarInfo>;

const PILLAR_KEYS = new Set<string>(PILLARS.map((p) => p.key));

export const isPillar = (value: unknown): value is FiveSCategory => typeof value === 'string' && PILLAR_KEYS.has(value);

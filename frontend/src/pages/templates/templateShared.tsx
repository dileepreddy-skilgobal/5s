import React from 'react';
import { BadgeVariant } from '../../constants/labels';
import { useCachedSettings } from '../../hooks/useTerminology';
import { AuditTypeCode } from '../../types/audits';

// No shared helper exists for these codes yet; keep one list for the template pages.
export const AUDIT_TYPE_LABELS: Record<string, string> = {
  ROUTINE: 'Routine',
  SELF: 'Self-audit',
  LAYERED: 'Layered',
  CROSS_FUNCTIONAL: 'Cross-functional',
  MANAGEMENT: 'Management walk',
  SURPRISE: 'Surprise (unannounced)',
  CERTIFICATION: 'Certification',
  CAMPAIGN: 'Campaign',
};
/** Legacy code on older ad-hoc audits; shown but never offered for new audits. */
const LEGACY_AUDIT_TYPE_LABELS: Record<string, string> = { AD_HOC: 'Ad hoc' };
export const auditTypeLabel = (code: string | null | undefined) =>
  code ? AUDIT_TYPE_LABELS[code] ?? LEGACY_AUDIT_TYPE_LABELS[code] ?? code : '—';

/** Audit types offered for schedules and unscheduled audits (the server's AUDIT_TYPES without the legacy AD_HOC). */
export const SCHEDULABLE_AUDIT_TYPES: readonly AuditTypeCode[] = [
  'ROUTINE',
  'SELF',
  'LAYERED',
  'CROSS_FUNCTIONAL',
  'MANAGEMENT',
  'SURPRISE',
  'CERTIFICATION',
  'CAMPAIGN',
];

export const TEMPLATE_STATUS_LABELS: Record<string, string> = { DRAFT: 'Draft', ACTIVE: 'Active', DEPRECATED: 'Deprecated' };
export const templateStatusLabel = (code: string | null | undefined) => (code ? TEMPLATE_STATUS_LABELS[code] ?? code : '—');
export const templateStatusVariant = (code: string | null | undefined): BadgeVariant =>
  code === 'ACTIVE' ? 'success' : code === 'DRAFT' ? 'warning' : 'neutral';

/** Keys of the template's pillar weight model, in display order. */
export const WEIGHT_KEYS = ['S1', 'S2', 'S3', 'S4', 'S5'] as const;
export const WEIGHT_LABELS: Record<(typeof WEIGHT_KEYS)[number], string> = {
  S1: '1S Sort',
  S2: '2S Set in order',
  S3: '3S Shine',
  S4: '4S Standardize',
  S5: '5S Sustain',
};
export const DEFAULT_WEIGHTS: Record<(typeof WEIGHT_KEYS)[number], number> = { S1: 20, S2: 20, S3: 20, S4: 20, S5: 20 };

/**
 * Template pillar weights only affect scores when the organization uses pillar-weighted scoring
 * (settings.scoring.method). Returns null while settings are loading.
 */
export const usePillarWeighting = (): boolean | null => {
  const settings = useCachedSettings();
  return settings ? settings.scoring?.method === 'PILLAR_WEIGHTED' : null;
};

export const FieldError: React.FC<{ id?: string; message?: string | null }> = ({ id, message }) =>
  message ? (
    <div id={id} role="alert" className="form-error">
      {message}
    </div>
  ) : null;

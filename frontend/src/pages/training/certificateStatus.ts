import { TrainingCertificateStatus } from '../../types';

export const CERT_STATUS_BADGE: Record<TrainingCertificateStatus, { variant: 'success' | 'warning' | 'danger'; label: string }> = {
  VALID: { variant: 'success', label: 'Valid' },
  EXPIRED: { variant: 'warning', label: 'Expired' },
  REVOKED: { variant: 'danger', label: 'Revoked' },
};

export const certStatusBadge = (status: TrainingCertificateStatus) =>
  CERT_STATUS_BADGE[status] ?? { variant: 'warning' as const, label: status };

/** Whole months between issue and expiry, e.g. "12 months" or "2 years". */
export const validityLabel = (issueIso?: string | null, untilIso?: string | null): string | null => {
  if (!issueIso || !untilIso) return null;
  const a = new Date(issueIso);
  const b = new Date(untilIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (months <= 0) return null;
  if (months % 12 === 0) return months === 12 ? '1 year' : `${months / 12} years`;
  return months === 1 ? '1 month' : `${months} months`;
};

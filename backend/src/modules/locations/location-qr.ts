import { Prisma } from '@prisma/client';

/**
 * The text encoded in a location's QR tag. The mobile scanner (mobile/src/services/qrPayload.ts) accepts
 * `5s://<tenant slug or id>/location(s)/<AREA-CODE>`; the tenant id is used because it never changes, so
 * printed tags stay valid if the organization is renamed.
 */
export function buildLocationQrPayload(tenantId: string, areaCode: string): string {
  return `5s://${encodeURIComponent(tenantId)}/locations/${encodeURIComponent(areaCode)}`;
}

/**
 * Older records hold payloads the scanner cannot use (a PNG data URL stored by the org-hierarchy flow, or
 * JSON blobs too long to encode). Anything that is not a `5s://` link is replaced with a fresh payload.
 */
export function isUsableQrPayload(value: string | null | undefined): value is string {
  return !!value && /^5s:\/\/[^/]+\/locations?\/[^/?#]+$/i.test(value);
}

/** Default 5S roll-out milestones every new location starts with (UI, org hierarchy and spreadsheet imports). */
const DEFAULT_MILESTONES: Array<{ name: string; days: number }> = [
  { name: '1S - Sort & Red Tag Initial Sweep', days: 7 },
  { name: '2S - Set In Order & Visual Shadow Boards', days: 14 },
  { name: '3S - Shine & Cleaning Responsibilities', days: 21 },
  { name: '4S - Standardize & SOP Displays', days: 28 },
  { name: '5S - Sustain & Scheduled Audit Initiation', days: 35 },
];

export function defaultMilestoneRows(
  tenantId: string,
  locationId: string,
  notes: string,
  now = new Date(),
): Prisma.LocationTimelineCreateManyInput[] {
  return DEFAULT_MILESTONES.map((m) => ({
    tenantId,
    locationId,
    milestoneName: m.name,
    plannedStartDate: now,
    plannedEndDate: new Date(now.getTime() + m.days * 86400000),
    progressPercent: 0,
    status: 'NOT_STARTED',
    notes,
  }));
}

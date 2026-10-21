import { LocationMaster } from '../types';

export interface ParsedLocationQr {
  areaCode: string;
  /** Tenant slug or id embedded in the payload, when present. */
  tenantRef?: string;
}

/**
 * Parses every location QR format the platform produces:
 *  - `5s://<tenant>/locations/<AREA-CODE>` (location master) and `5s://<tenant>/location/<AREA-CODE>` (batch print)
 *  - JSON payloads such as `{"type":"5S_LOCATION_AUDIT","areaCode":"..."}` (org-hierarchy generated)
 *  - a bare area code (manual entry)
 */
export function parseLocationQr(raw: string): ParsedLocationQr | null {
  const value = raw.trim();
  if (!value) return null;

  const uri = /^5s:\/\/([^/]+)\/locations?\/([^/?#]+)/i.exec(value);
  if (uri) {
    return { tenantRef: decodeURIComponent(uri[1]), areaCode: decodeURIComponent(uri[2]) };
  }

  if (value.startsWith('{')) {
    try {
      const json = JSON.parse(value) as { areaCode?: unknown; tenantId?: unknown };
      if (typeof json.areaCode === 'string' && json.areaCode) {
        return { areaCode: json.areaCode, tenantRef: typeof json.tenantId === 'string' ? json.tenantId : undefined };
      }
    } catch {
      return null;
    }
    return null;
  }

  // Bare area codes contain no spaces or URL syntax
  return /^[A-Za-z0-9._-]+$/.test(value) ? { areaCode: value } : null;
}

export type QrMatch =
  | { kind: 'MATCH'; location: LocationMaster }
  | { kind: 'OTHER_TENANT' }
  | { kind: 'UNKNOWN'; areaCode?: string }
  | { kind: 'INVALID' };

/** Exact (case-insensitive) area-code match within the signed-in tenant. */
export function matchLocationQr(
  raw: string,
  locations: LocationMaster[],
  tenant: { id: string; slug: string },
): QrMatch {
  const parsed = parseLocationQr(raw);
  if (!parsed) return { kind: 'INVALID' };
  if (parsed.tenantRef && parsed.tenantRef !== tenant.slug && parsed.tenantRef !== tenant.id) {
    return { kind: 'OTHER_TENANT' };
  }
  const code = parsed.areaCode.toUpperCase();
  const location = locations.find((l) => l.code.toUpperCase() === code);
  return location ? { kind: 'MATCH', location } : { kind: 'UNKNOWN', areaCode: parsed.areaCode };
}

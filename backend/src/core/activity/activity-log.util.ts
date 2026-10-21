import { Request } from 'express';

const SECRET_KEY = /password|secret|token|authorization|api_?key|hash$|^(pin|newpin|currentpin|otp|totp|mfacode)$/i;
const MAX_STRING = 300;
const MAX_ARRAY = 20;
const MAX_DEPTH = 4;
/** Columns never worth recording in a diff. */
const IGNORED_FIELDS = new Set(['updatedAt', 'passwordHash', 'pinHash', 'failedLoginAttempts', 'lockedUntil', 'lastLoginAt']);

/** Removes secrets and shrinks large values (e.g. inline base64 photos, import rows) before logging. */
export function sanitizePayload(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? undefined;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `[${value.length} characters]` : value;
  }
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[nested]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((v) => sanitizePayload(v, depth + 1));
    return value.length > MAX_ARRAY ? [...items, `[+${value.length - MAX_ARRAY} more]`] : items;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? '[REDACTED]' : sanitizePayload(v, depth + 1);
  }
  return Object.keys(out).length ? out : undefined;
}

const comparable = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : v);

/** JSON stored in text columns is expanded so a diff shows the individual keys that changed. */
function expand(record: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (prefix: string, value: unknown, depth: number) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && depth < 4) {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) out[prefix] = {};
      entries.forEach(([k, v]) => walk(`${prefix}.${k}`, v, depth + 1));
    } else {
      out[prefix] = value;
    }
  };
  Object.entries(record ?? {}).forEach(([key, value]) => {
    if (typeof value === 'string' && /^\s*[[{]/.test(value)) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          walk(key, parsed, 0);
          return;
        }
      } catch {
        // not JSON: compare as text
      }
    }
    out[key] = value;
  });
  return out;
}

/** Field-level difference of two snapshots of one record: `{ field: { from, to } }`, or null. */
export function diffRecords(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Record<string, { from: unknown; to: unknown }> | null {
  if (!before && !after) return null;
  const b = expand(before);
  const a = expand(after);
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  keys.forEach((key) => {
    if (IGNORED_FIELDS.has(key.split('.')[0])) return;
    const from = comparable(b[key] ?? null);
    const to = comparable(a[key] ?? null);
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      diff[key] = { from: sanitizePayload(from) ?? null, to: sanitizePayload(to) ?? null };
    }
  });
  return Object.keys(diff).length ? diff : null;
}

/**
 * Client address and agent. X-Forwarded-For is honoured only through Express' "trust proxy"
 * setting (TRUST_PROXY), so clients cannot spoof their address when the API is not behind a proxy.
 */
export function requestMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return { ipAddress: req.ip ?? null, userAgent: (req.headers['user-agent'] as string | undefined) ?? null };
}

// ---------------------------------------------------------------------------
// Readable summaries ("Added routine item to location LOC-001")
// ---------------------------------------------------------------------------

/** Past-tense verbs for the first word of an action code. */
const VERBS: Record<string, string> = {
  CREATE: 'Created', UPDATE: 'Updated', PATCH: 'Updated', UPSERT: 'Saved', DELETE: 'Deleted', REMOVE: 'Removed', ADD: 'Added',
  SUBMIT: 'Submitted', APPROVE: 'Approved', REJECT: 'Rejected', ASSIGN: 'Assigned', REASSIGN: 'Reassigned', CLOSE: 'Closed',
  REOPEN: 'Reopened', VERIFY: 'Verified', START: 'Started', COMPLETE: 'Completed', CANCEL: 'Cancelled', UPLOAD: 'Uploaded',
  IMPORT: 'Imported', EXPORT: 'Exported', TOGGLE: 'Changed', SET: 'Set', RESET: 'Reset', REVOKE: 'Revoked', SEND: 'Sent',
  GIVE: 'Gave', AWARD: 'Awarded', ACKNOWLEDGE: 'Acknowledged', DISPUTE: 'Disputed', ESCALATE: 'Escalated', RECORD: 'Recorded',
  MARK: 'Marked', ENROL: 'Enrolled', ENROLL: 'Enrolled', DISABLE: 'Disabled', ENABLE: 'Enabled', RETRY: 'Retried', TEST: 'Tested',
  ROTATE: 'Rotated', CHANGE: 'Changed', GENERATE: 'Generated', DUPLICATE: 'Duplicated', CLONE: 'Copied', PUBLISH: 'Published',
  ARCHIVE: 'Archived', RESTORE: 'Restored', MOVE: 'Moved', LINK: 'Linked', UNLINK: 'Unlinked', EXECUTE: 'Ran', RUN: 'Ran',
  RETIRE: 'Retired', SCHEDULE: 'Scheduled', DISPOSE: 'Disposed of', RETURN: 'Returned', RESOLVE: 'Resolved', CONFIRM: 'Confirmed',
  ACCEPT: 'Accepted', DECLINE: 'Declined', REGISTER: 'Registered', UNREGISTER: 'Unregistered', MIGRATE: 'Migrated', SYNC: 'Synchronised',
  ONBOARD: 'Onboarded', INVITE: 'Invited', LOCK: 'Locked', UNLOCK: 'Unlocked', SIGN: 'Signed', TRANSITION: 'Moved',
};

const PREPOSITIONS: Record<string, string> = { ADD: 'to', REMOVE: 'from', IMPORT: 'into', UPLOAD: 'to' };

/** Entity names that do not read well split from their type name. */
const ENTITY_WORDS: Record<string, string> = { OrgNode: 'organization unit', AuditExecution: 'audit' };

/** "CorrectiveAction" / "ROUTINE_ITEM" -> "corrective action" / "routine item" */
const toWords = (value: string): string =>
  value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();

/** Human identifiers preferred over ids when naming a record. */
const LABEL_KEYS = ['areaCode', 'observationCode', 'actionCode', 'tagNumber', 'auditCode', 'scheduleCode', 'questionCode', 'certificateCode', 'code', 'email', 'name', 'title'];

/** The most recognisable identifier of a record (area code, document number, e-mail, name), or null. */
export function recordLabel(record: unknown): string | null {
  if (!record || typeof record !== 'object') return null;
  const r = record as Record<string, unknown>;
  for (const key of LABEL_KEYS) {
    const v = r[key];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 120);
  }
  return null;
}

export interface SummaryInput {
  action: string;
  entityType?: string | null;
  /** Identifier of the record acted on (see recordLabel). */
  label?: string | null;
  outcome?: 'SUCCESS' | 'FAILURE';
  statusCode?: number | null;
  error?: string | null;
}

/**
 * One-line, readable description of a request for the activity trail, built from the action and entity:
 * ADD_ROUTINE_ITEM on Location LOC-001 -> "Added routine item to location LOC-001".
 */
export function activitySummary(input: SummaryInput): string {
  const tokens = input.action.split('_').filter(Boolean);
  const known = VERBS[tokens[0]?.toUpperCase() ?? ''];
  const failed = input.outcome === 'FAILURE';
  // A failed request did not happen, so it reads as an attempt ("Denied: delete user …")
  const verb = known && failed ? tokens[0].toLowerCase() : known;
  const rawEntity = input.entityType ? toWords(input.entityType) : '';
  const entity = input.entityType ? ENTITY_WORDS[input.entityType] ?? rawEntity : '';
  let object = verb ? toWords(tokens.slice(1).join('_')) : '';
  if (object === rawEntity) object = entity;

  let text: string;
  if (!verb) {
    text = toWords(input.action);
    if (input.label) text += entity ? ` (${entity} ${input.label})` : ` (${input.label})`;
  } else if (!object || object === entity) {
    text = `${verb} ${entity || 'record'}${input.label ? ` ${input.label}` : ''}`;
  } else {
    text = `${verb} ${object}`;
    if (input.label && entity) text += ` ${PREPOSITIONS[tokens[0].toUpperCase()] ?? 'on'} ${entity} ${input.label}`;
    else if (input.label) text += ` ${input.label}`;
  }
  text = text.charAt(0).toUpperCase() + text.slice(1);

  if (failed) {
    const reason = input.error ? ` — ${input.error}` : '';
    const attempt = text.charAt(0).toLowerCase() + text.slice(1);
    return input.statusCode === 403 ? `Denied: ${attempt}${reason}` : `Failed: ${attempt}${reason}`;
  }
  return text;
}

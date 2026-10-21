import { Platform } from 'react-native';
import { ENV } from '../config/env';
import { TokenStore } from './tokenStore';

/** Error raised for any failed API call; `status` is 0 for network failures and timeouts. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Seconds the server asked us to wait (429 Retry-After), when given. */
    public readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** 402: the organization's trial ended or subscription lapsed — data is read-only. */
  get isReadOnly(): boolean {
    return this.status === 402;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

let unauthorizedHandler: (() => void) | null = null;
/** Set once a 401 has been reported for the current token, so parallel requests end the session only once. */
let unauthorizedReported = false;

/** Registers the callback invoked when the server rejects the session (expired or revoked token). */
export const onUnauthorized = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

/** Call after a new access token is stored so a later 401 ends that session again. */
export const resetUnauthorizedState = () => {
  unauthorizedReported = false;
};

const reportUnauthorized = () => {
  if (unauthorizedReported) return;
  unauthorizedReported = true;
  unauthorizedHandler?.();
};

// ---------------------------------------------------------------------------
// Organization-level notices (read-only subscription, 2FA enrolment required)
// ---------------------------------------------------------------------------

export type AccessNotice =
  | { kind: 'READ_ONLY'; reason: 'TRIAL_EXPIRED' | 'SUBSCRIPTION_LAPSED' | 'UNKNOWN'; message: string }
  | { kind: 'MFA_ENROLLMENT'; message: string };

type AccessNoticeListener = (notice: AccessNotice | null) => void;
const noticeListeners = new Set<AccessNoticeListener>();
/** Latest notice, kept so screens mounted later (e.g. right after sign-in) can still show it. */
let lastNotice: AccessNotice | null = null;

export const getAccessNotice = (): AccessNotice | null => lastNotice;

/** Subscribes to organization-level access notices; returns the unsubscribe function. */
export const onAccessNotice = (listener: AccessNoticeListener): (() => void) => {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
};

export const emitAccessNotice = (notice: AccessNotice) => {
  lastNotice = notice;
  noticeListeners.forEach((l) => l(notice));
};

/** Clears the current notice (new session, or dismissed by the user). */
export const clearAccessNotice = () => {
  lastNotice = null;
  noticeListeners.forEach((l) => l(null));
};

/** Strips the machine-readable `CODE:` prefix the server puts in front of some messages. */
const withoutCode = (message: string, code: string) => message.slice(code.length).replace(/^[:\s]+/, '');

export const MFA_ENROLLMENT_MESSAGE =
  'Your organization requires two-factor authentication for your account. Set it up on the 5S web app (Account → Security), then sign in here again.';

const extractMessage = (body: unknown, fallback: string): string => {
  const message = (body as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) return message.join('. ');
  if (typeof message === 'string' && message) return message;
  return fallback;
};

/** Turns a non-OK response into an ApiError (and raises the matching session / organization notices). */
function toApiError(response: Response, json: unknown, signedRequest: boolean): ApiError {
  const raw = extractMessage(json, `Request failed (HTTP ${response.status}).`);

  if (response.status === 401 && signedRequest) {
    reportUnauthorized();
    return new ApiError(401, raw);
  }
  if (response.status === 402) {
    const reason = raw.startsWith('TRIAL_EXPIRED') ? 'TRIAL_EXPIRED' : raw.startsWith('SUBSCRIPTION_LAPSED') ? 'SUBSCRIPTION_LAPSED' : 'UNKNOWN';
    const message =
      reason === 'UNKNOWN'
        ? 'Your organization is read-only. Changes cannot be saved until the subscription is active.'
        : withoutCode(raw, reason);
    emitAccessNotice({ kind: 'READ_ONLY', reason, message });
    return new ApiError(402, message);
  }
  if (response.status === 403 && raw.startsWith('MFA_ENROLLMENT_REQUIRED')) {
    emitAccessNotice({ kind: 'MFA_ENROLLMENT', message: MFA_ENROLLMENT_MESSAGE });
    return new ApiError(403, MFA_ENROLLMENT_MESSAGE);
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
    return new ApiError(
      429,
      `Too many requests. Please wait ${wait ? `${Math.ceil(wait)} seconds` : 'a moment'} and try again.`,
      wait,
    );
  }
  if (response.status === 413) {
    return new ApiError(413, raw.startsWith('Request failed') ? 'The file is too large or the storage quota is full.' : raw);
  }
  return new ApiError(response.status, raw);
}

/** Reads the body, throws ApiError for failures and unwraps the `{ success, data }` envelope. */
async function handleResponse<T>(response: Response, signedRequest: boolean): Promise<T> {
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Empty or non-JSON body
  }

  if (!response.ok) {
    throw toApiError(response, json, signedRequest);
  }

  const envelope = json as { success?: unknown; data?: unknown } | null;
  if (envelope && envelope.success !== undefined && envelope.data !== undefined) {
    return envelope.data as T;
  }
  return json as T;
}

/** fetch with a timeout; network failures and timeouts become ApiError(0). */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError';
    throw new ApiError(
      0,
      aborted ? 'The server did not respond in time.' : 'Unable to reach the 5S server. Check your network connection.',
    );
  } finally {
    clearTimeout(timer);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Sign the request with the stored access token (default true). */
  auth?: boolean;
  timeoutMs?: number;
}

/**
 * JSON request against the 5S API. Adds the bearer token, enforces a timeout, unwraps the
 * `{ success, data }` envelope and throws ApiError with the server's message on failure.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = ENV.REQUEST_TIMEOUT_MS } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let signed = false;
  if (auth) {
    const token = await TokenStore.get();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      signed = true;
    }
  }

  const response = await fetchWithTimeout(
    `${ENV.API_BASE_URL}${path}`,
    { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
    timeoutMs,
  );
  return handleResponse<T>(response, signed);
}

/** Stored file as returned by POST /files (URLs are signed and expire after a few hours). */
export interface UploadedFile {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  contentType: string;
  sizeBytes: number;
}

/** Uploads a local file (multipart field `file`) and returns the stored file. */
export async function uploadFile(file: { uri: string; name: string; type: string }, timeoutMs = 120000): Promise<UploadedFile> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    // Web preview: picker / recorder URIs are blob: or data: URLs
    let blob: Blob;
    try {
      blob = await (await fetch(file.uri)).blob();
    } catch {
      throw new ApiError(400, 'The attached file is no longer available on this device.');
    }
    form.append('file', blob, file.name);
  } else {
    // React Native streams the file from disk when given { uri, name, type }
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = await TokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchWithTimeout(`${ENV.API_BASE_URL}/files`, { method: 'POST', headers, body: form }, timeoutMs);
  return handleResponse<UploadedFile>(response, !!token);
}

/**
 * Authorized `fetch` for call sites that still handle the raw Response themselves.
 * Adds the bearer token and ends the session on 401.
 */
export async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await TokenStore.get();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${ENV.API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401 && token) {
    reportUnauthorized();
  }
  return response;
}

/** User-facing message for any thrown value. */
export const getErrorMessage = (err: unknown, fallback = 'Something went wrong. Please try again.'): string =>
  err instanceof ApiError ? err.message : fallback;

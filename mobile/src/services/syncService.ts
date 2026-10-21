import { LocalMedia, ObservationDraft, SyncItem } from '../types';
import { ApiService } from './api';
import { ApiError } from './http';
import { OfflineStorage } from './offlineStorage';
import { MediaStore } from './mediaStore';
import { forServer } from './annotations';

export interface SyncResult {
  synced: number;
  failed: number;
  pending: number;
  /** Messages for items the server rejected during this run. */
  errors: string[];
  /** True when the run stopped early because the network or session is unavailable. */
  interrupted: boolean;
}

let running: Promise<SyncResult> | null = null;
/** After a 429 the queue is not processed again before this time (epoch ms). */
let backoffUntil = 0;
const DEFAULT_BACKOFF_MS = 60000;

/** Message stored on items the server refuses because the organization is read-only (402). */
const READ_ONLY_MESSAGE =
  'Not sent: your organization is read-only (trial ended or subscription lapsed). Retry once the subscription is active.';

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

async function updateItem(item: SyncItem): Promise<void> {
  const queue = await OfflineStorage.getQueue();
  await OfflineStorage.saveQueue(queue.map((q) => (q.id === item.id ? item : q)));
}

async function removeItem(id: string): Promise<void> {
  const queue = await OfflineStorage.getQueue();
  await OfflineStorage.saveQueue(queue.filter((q) => q.id !== id));
}

/** Every local file referenced by an observation report (deleted once it is on the server or discarded). */
const observationFiles = (o: ObservationDraft): string[] =>
  [o.photo?.localUri, o.voiceNote?.localUri, ...o.media.map((m) => m.localUri)].filter((u): u is string => !!u);

/** Uploads one media file unless an earlier attempt already did; returns the server URL. */
async function ensureUploaded(media: LocalMedia): Promise<string> {
  if (media.uploadedUrl) return media.uploadedUrl;
  if (!MediaStore.exists(media.localUri)) {
    throw new ApiError(400, `The ${media.kind.toLowerCase()} attached to this report is no longer on the device.`);
  }
  const uploaded = await ApiService.uploadMedia({ uri: media.localUri, name: media.fileName, type: media.mimeType });
  return uploaded.url;
}

/**
 * Observation report: uploads the photo, extra media and voice note (persisting each server URL so a
 * retry never uploads twice), then creates the observation with the item's clientRequestId.
 */
async function processObservation(item: Extract<SyncItem, { type: 'OBSERVATION_CREATE' }>): Promise<void> {
  let current = item;
  const save = async (observation: ObservationDraft) => {
    current = { ...current, observation };
    await updateItem(current);
  };

  const o = current.observation;
  if (o.photo && !o.photo.uploadedUrl) {
    const url = await ensureUploaded(o.photo);
    await save({ ...current.observation, photo: { ...o.photo, uploadedUrl: url } });
  }
  for (const m of o.media) {
    if (m.uploadedUrl) continue;
    const url = await ensureUploaded(m);
    await save({ ...current.observation, media: current.observation.media.map((x) => (x.id === m.id ? { ...x, uploadedUrl: url } : x)) });
  }
  if (o.voiceNote && !o.voiceNote.uploadedUrl) {
    const url = await ensureUploaded(o.voiceNote);
    await save({ ...current.observation, voiceNote: { ...o.voiceNote, uploadedUrl: url } });
  }

  const done = current.observation;
  const annotations = forServer(done.photo?.annotations);
  try {
    await ApiService.createObservation({
      locationId: done.locationId,
      category: done.category,
      severity: done.severity,
      title: done.title,
      description: done.description,
      beforePhotoUrl: done.photo?.uploadedUrl,
      // The server burns pct shapes onto a copy of the photo (no annotatedPhotoUrl is sent)
      annotationData: done.photo && annotations.length > 0 ? annotations : undefined,
      mediaUrls: done.media.length
        ? done.media.map((m) => ({
            url: m.uploadedUrl as string,
            kind: m.kind,
            capturedAt: m.capturedAt,
            latitude: m.latitude,
            longitude: m.longitude,
          }))
        : undefined,
      voiceNoteUrl: done.voiceNote?.uploadedUrl,
      gpsLatitude: done.gps?.latitude,
      gpsLongitude: done.gps?.longitude,
      gpsAccuracyM: done.gps?.accuracyM !== undefined ? Math.min(100000, Math.round(done.gps.accuracyM)) : undefined,
      clientRequestId: current.clientRequestId,
    });
  } catch (err) {
    // 409: already created by an earlier attempt whose response was lost
    if (!(err instanceof ApiError && err.status === 409)) throw err;
  }
  MediaStore.remove(observationFiles(done));
}

/** Executes one queue item; throws ApiError on failure. Progress is persisted after each server step. */
async function processItem(item: SyncItem): Promise<void> {
  if (item.type === 'OBSERVATION_CREATE') {
    await processObservation(item);
    return;
  }

  if (item.type === 'AUDIT_SUBMIT') {
    let executionId = item.serverExecutionId;
    if (!executionId) {
      const started = await ApiService.startExecution({ ...item.start, auditorName: item.submit.auditorName });
      executionId = started.id;
      await updateItem({ ...item, serverExecutionId: executionId });
    }
    try {
      await ApiService.submitExecution(executionId, item.submit);
    } catch (err) {
      // 409: the audit was already submitted (e.g. an earlier attempt succeeded but the response was lost)
      if (!(err instanceof ApiError && err.status === 409)) throw err;
    }
    await OfflineStorage.removeDraft(item.userId, item.localAuditId);
    return;
  }

  // RED_TAG_CREATE
  let redTagId = item.serverRedTagId;
  if (!redTagId) {
    const created = await ApiService.createRedTag(item.tag);
    redTagId = created.id;
    await updateItem({ ...item, serverRedTagId: redTagId });
  }
  if (item.tag.disposition) {
    await ApiService.submitRedTagDisposition(redTagId, item.tag);
  }
  const local = await OfflineStorage.getLocalRedTags(item.userId);
  await OfflineStorage.saveLocalRedTags(
    item.userId,
    local.map((t) => (t.id === item.tag.id ? { ...t, status: 'ACTIVE' } : t)),
  );
}

async function run(userId: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, pending: 0, errors: [], interrupted: false };
  if (Date.now() < backoffUntil) {
    // Rate limited recently: keep everything pending until the back-off has passed
    result.interrupted = true;
    result.pending = (await OfflineStorage.getQueue()).filter((i) => i.userId === userId && i.state === 'PENDING').length;
    return result;
  }
  const items = (await OfflineStorage.getQueue()).filter((i) => i.userId === userId && i.state === 'PENDING');

  for (const original of items) {
    // Re-read to pick up progress persisted by a previous attempt (e.g. server execution id)
    const item = (await OfflineStorage.getQueue()).find((q) => q.id === original.id);
    if (!item) continue;
    try {
      await processItem(item);
      await removeItem(item.id);
      result.synced++;
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(0, 'Unexpected error while syncing.');
      const latest = (await OfflineStorage.getQueue()).find((q) => q.id === item.id) ?? item;
      if (apiErr.isNetworkError || apiErr.status === 401) {
        // Device offline or session ended: keep everything pending and stop this run
        await updateItem({ ...latest, attempts: latest.attempts + 1, lastError: apiErr.message });
        result.interrupted = true;
        break;
      }
      if (apiErr.isRateLimited) {
        // Too many requests: keep everything pending and back off before the next run
        backoffUntil = Date.now() + (apiErr.retryAfterSec ? apiErr.retryAfterSec * 1000 : DEFAULT_BACKOFF_MS);
        await updateItem({ ...latest, attempts: latest.attempts + 1, lastError: apiErr.message });
        result.interrupted = true;
        break;
      }
      if (apiErr.isReadOnly) {
        // Organization is read-only: not retried automatically (it would be refused every time)
        await updateItem({ ...latest, state: 'FAILED', attempts: latest.attempts + 1, lastError: READ_ONLY_MESSAGE });
        result.failed++;
        result.errors.push(`${item.label}: ${READ_ONLY_MESSAGE}`);
        continue;
      }
      if (apiErr.status >= 500) {
        // Server-side problem: retry on the next run
        await updateItem({ ...latest, attempts: latest.attempts + 1, lastError: apiErr.message });
        continue;
      }
      // Rejected by the server (validation, permission, conflict): needs the user's attention
      await updateItem({ ...latest, state: 'FAILED', attempts: latest.attempts + 1, lastError: apiErr.message });
      result.failed++;
      result.errors.push(`${item.label}: ${apiErr.message}`);
    }
  }

  result.pending = (await OfflineStorage.getQueue()).filter((i) => i.userId === userId && i.state === 'PENDING').length;
  return result;
}

/** RFC 4122 v4 UUID used as an idempotency key (`clientRequestId`, 36 chars of [0-9a-f-]). */
function newRequestId(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const SyncService = {
  newId,
  newRequestId,

  async enqueue(item: SyncItem): Promise<void> {
    const queue = await OfflineStorage.getQueue();
    // One pending submission per audit: a newer submission replaces an unsent older one
    const filtered =
      item.type === 'AUDIT_SUBMIT'
        ? queue.filter((q) => !(q.type === 'AUDIT_SUBMIT' && q.localAuditId === item.localAuditId))
        : queue;
    await OfflineStorage.saveQueue([...filtered, item]);
  },

  async getItems(userId: string): Promise<SyncItem[]> {
    return (await OfflineStorage.getQueue()).filter((i) => i.userId === userId);
  },

  /** Processes the signed-in user's pending items. Concurrent calls share the same run. */
  process(userId: string): Promise<SyncResult> {
    if (!running) {
      running = run(userId).finally(() => {
        running = null;
      });
    }
    return running;
  },

  /** Moves a failed item back to pending so it is retried on the next sync. */
  async retry(itemId: string): Promise<void> {
    const queue = await OfflineStorage.getQueue();
    await OfflineStorage.saveQueue(queue.map((q) => (q.id === itemId ? { ...q, state: 'PENDING' as const, lastError: undefined } : q)));
  },

  async discard(itemId: string): Promise<void> {
    const item = (await OfflineStorage.getQueue()).find((q) => q.id === itemId);
    await removeItem(itemId);
    // Media kept on the device for this report is no longer needed
    if (item?.type === 'OBSERVATION_CREATE') MediaStore.remove(observationFiles(item.observation));
  },
};

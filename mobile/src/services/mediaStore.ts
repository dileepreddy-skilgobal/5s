import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { LocalMedia, MediaKind } from '../types';

/**
 * Keeps media for offline reports in the app's document directory (camera / picker / recorder files
 * live in caches the OS may clear before the device is back online). The web preview cannot persist
 * files, so URIs are used as they are there.
 */
const MEDIA_DIR = 'offline-media';

const persistent = Platform.OS !== 'web';

const mediaDirectory = (): Directory => {
  const dir = new Directory(Paths.document, MEDIA_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
};

export const newMediaId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

/** Best-effort MIME type from a file name / URI when the picker does not report one. */
export function guessMimeType(uri: string, kind: MediaKind): string {
  const ext = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(uri)?.[1]?.toLowerCase();
  const byExt: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: kind === 'AUDIO' ? 'audio/webm' : 'video/webm',
    '3gp': 'video/3gpp',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
  };
  if (ext && byExt[ext]) return byExt[ext];
  return kind === 'PHOTO' ? 'image/jpeg' : kind === 'VIDEO' ? 'video/mp4' : kind === 'AUDIO' ? 'audio/mp4' : 'application/octet-stream';
}

export const MediaStore = {
  /**
   * Copies a captured file into durable storage and describes it as LocalMedia.
   * Throws when the source file cannot be read.
   */
  async persist(
    sourceUri: string,
    kind: MediaKind,
    extra: Partial<Pick<LocalMedia, 'mimeType' | 'capturedAt' | 'durationSec' | 'latitude' | 'longitude'>> = {},
  ): Promise<LocalMedia> {
    const id = newMediaId();
    const mimeType = extra.mimeType || guessMimeType(sourceUri, kind);
    const fileName = `${kind.toLowerCase()}-${id}.${EXTENSIONS[mimeType] ?? 'bin'}`;
    let localUri = sourceUri;
    if (persistent) {
      const target = new File(mediaDirectory(), fileName);
      await new File(sourceUri).copy(target);
      localUri = target.uri;
    }
    return { ...extra, id, kind, localUri, mimeType, fileName, capturedAt: extra.capturedAt ?? new Date().toISOString() };
  },

  /** Size in bytes of a local file, or null when unknown. */
  sizeOf(uri: string): number | null {
    if (!persistent) return null;
    try {
      const f = new File(uri);
      return f.exists ? f.size : null;
    } catch {
      return null;
    }
  },

  /** True when the file is still on the device (always true on web, where it cannot be checked). */
  exists(uri: string): boolean {
    if (!persistent) return true;
    try {
      return new File(uri).exists;
    } catch {
      return false;
    }
  },

  /** Deletes files stored by `persist` (ignores anything outside the media directory). */
  remove(uris: Array<string | undefined>): void {
    if (!persistent) return;
    for (const uri of uris) {
      if (!uri || !uri.includes(`/${MEDIA_DIR}/`)) continue;
      try {
        const f = new File(uri);
        if (f.exists) f.delete();
      } catch {
        // Already gone
      }
    }
  },
};

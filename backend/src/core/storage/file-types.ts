/**
 * File type detection from the bytes themselves (never trusting the client's declared type or
 * file name). Only formats with a legitimate use in the product are accepted; SVG and HTML are
 * deliberately excluded because browsers can execute script inside them.
 */
export type FileKind = 'image' | 'document' | 'audio' | 'video';

export interface DetectedType {
  contentType: string;
  extension: string;
  kind: FileKind;
}

/** Maximum size per kind, in bytes. */
export const MAX_BYTES: Record<FileKind, number> = {
  image: 15 * 1024 * 1024,
  document: 20 * 1024 * 1024,
  audio: 15 * 1024 * 1024,
  video: 50 * 1024 * 1024,
};

const starts = (b: Buffer, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Buffer, start: number, end: number) => b.subarray(start, end).toString('latin1');

/** True when an MP4 declares a video track (`hdlr` box with handler type `vide`), or when unsure. */
function mp4HasVideoTrack(b: Buffer): boolean {
  let sawHandler = false;
  for (let i = b.indexOf('hdlr', 0, 'latin1'); i !== -1; i = b.indexOf('hdlr', i + 4, 'latin1')) {
    // hdlr box: 'hdlr' + version/flags (4) + pre_defined (4) + handler_type (4)
    const handler = ascii(b, i + 12, i + 16);
    if (handler === 'vide') return true;
    if (handler === 'soun') sawHandler = true;
  }
  return !sawHandler;
}

export function detectFileType(b: Buffer): DetectedType | null {
  if (b.length < 12) return null;
  if (starts(b, [0xff, 0xd8, 0xff])) return { contentType: 'image/jpeg', extension: 'jpg', kind: 'image' };
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { contentType: 'image/png', extension: 'png', kind: 'image' };
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return { contentType: 'image/gif', extension: 'gif', kind: 'image' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return { contentType: 'image/webp', extension: 'webp', kind: 'image' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE') return { contentType: 'audio/wav', extension: 'wav', kind: 'audio' };
  if (ascii(b, 0, 5) === '%PDF-') return { contentType: 'application/pdf', extension: 'pdf', kind: 'document' };
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0)) {
    return { contentType: 'audio/mpeg', extension: 'mp3', kind: 'audio' };
  }
  if (b[0] === 0xff && (b[1] === 0xf1 || b[1] === 0xf9)) return { contentType: 'audio/aac', extension: 'aac', kind: 'audio' };
  if (ascii(b, 4, 8) === 'ftyp') {
    const brand = ascii(b, 8, 12);
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1') return { contentType: 'image/heic', extension: 'heic', kind: 'image' };
    if (brand === 'M4A ' || brand === 'M4B ') return { contentType: 'audio/mp4', extension: 'm4a', kind: 'audio' };
    if (brand === 'qt  ') return { contentType: 'video/quicktime', extension: 'mov', kind: 'video' };
    if (brand.startsWith('3g')) return { contentType: 'video/3gpp', extension: '3gp', kind: 'video' };
    // Generic MP4 brands carry either video or audio only (e.g. Android voice recordings): decide by tracks
    return mp4HasVideoTrack(b) ? { contentType: 'video/mp4', extension: 'mp4', kind: 'video' } : { contentType: 'audio/mp4', extension: 'm4a', kind: 'audio' };
  }
  if (starts(b, [0x1a, 0x45, 0xdf, 0xa3])) return { contentType: 'video/webm', extension: 'webm', kind: 'video' };
  return null;
}

/** Parses `data:<mime>;base64,<payload>`; returns null for anything else. */
export function parseDataUrl(value: string): Buffer | null {
  const m = /^data:([a-z0-9.+/-]+)?(?:;[a-z0-9=-]+)*;base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
  if (!m) return null;
  return Buffer.from(m[2].replace(/\s/g, ''), 'base64');
}

/** Longest edge of evidence photos kept by the web client (keeps uploads small without losing detail). */
export const MAX_EVIDENCE_EDGE = 1600;
export const EVIDENCE_JPEG_QUALITY = 0.8;

/** Size that fits inside `max` x `max` while keeping the aspect ratio (never upscales). */
export const fitWithin = (width: number, height: number, max = MAX_EVIDENCE_EDGE): { width: number; height: number } => {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

export const loadImage = (src: string, crossOrigin = false): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The image could not be loaded.'));
    img.src = src;
  });

/** Loads a picked or captured file as an image (the object URL is released once decoded). */
export const loadImageFile = async (file: File): Promise<HTMLImageElement> => {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    // Keep the decoded pixels after the object URL is revoked
    await img.decode().catch(() => undefined);
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** JPEG data URL of the image, downscaled to the evidence size. */
export const imageToJpegDataUrl = (img: HTMLImageElement): string => {
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', EVIDENCE_JPEG_QUALITY);
};

export const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, base64] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'application/octet-stream';
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type: mime });
};

/** A picked or captured photo, downscaled and re-encoded as JPEG for upload. */
export const compressPhotoFile = async (file: File): Promise<{ blob: Blob; dataUrl: string }> => {
  const dataUrl = imageToJpegDataUrl(await loadImageFile(file));
  return { blob: dataUrlToBlob(dataUrl), dataUrl };
};

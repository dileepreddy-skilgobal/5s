import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Longest edge for evidence photos sent to the server; keeps each photo around 150–300 KB. */
const MAX_EDGE_PX = 1280;
const JPEG_QUALITY = 0.6;

/**
 * Downscales and re-encodes a captured photo, returning a local URI for display and a JPEG data URL
 * for upload (the API stores evidence inline, so raw camera images would exceed request limits).
 */
export async function prepareEvidencePhoto(
  uri: string,
  size?: { width?: number; height?: number },
): Promise<{ uri: string; dataUrl: string }> {
  const context = ImageManipulator.manipulate(uri);
  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  if (width > MAX_EDGE_PX || height > MAX_EDGE_PX || (!width && !height)) {
    context.resize(width >= height ? { width: MAX_EDGE_PX } : { height: MAX_EDGE_PX });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG, base64: true });
  return { uri: saved.uri, dataUrl: `data:image/jpeg;base64,${saved.base64}` };
}

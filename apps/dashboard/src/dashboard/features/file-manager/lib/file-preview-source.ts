import { base64ToBytes } from "./file-content";

export function createFilePreviewBlob(
  base64Content: string,
  mediaType: string,
): Blob {
  const bytes = Uint8Array.from(base64ToBytes(base64Content));
  return new Blob([bytes], { type: mediaType });
}

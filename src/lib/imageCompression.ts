import imageCompression from 'browser-image-compression';

export interface CompressionResult {
  compressedFile: File;
  originalSize: number;
  compressedSize: number;
  previewUrl: string;
}

/**
 * Photos are stored as base64 inside a Firestore document (hard limit 1MB, rules cap the
 * data URL at 800,000 chars). Base64 adds ~33%, so the JPEG must stay under ~550KB;
 * we aim far lower (~150-250KB) and step down if needed.
 */
export const MAX_COMPRESSED_BYTES = 500 * 1024;

const ATTEMPTS = [
  { maxSizeMB: 0.2, maxWidthOrHeight: 1280 },
  { maxSizeMB: 0.12, maxWidthOrHeight: 1024 },
  { maxSizeMB: 0.07, maxWidthOrHeight: 800 },
];

export async function compressIncidentImage(file: File): Promise<CompressionResult> {
  let lastBlob: Blob | null = null;

  for (const attempt of ATTEMPTS) {
    const blob = await imageCompression(file, {
      ...attempt,
      useWebWorker: true,
      fileType: 'image/jpeg',
    });
    lastBlob = blob;
    if (blob.size <= MAX_COMPRESSED_BYTES) break;
  }

  if (!lastBlob || lastBlob.size > MAX_COMPRESSED_BYTES) {
    throw new Error('Image is too large even after compression.');
  }

  const compressedFile = new File([lastBlob], `report_${Date.now()}.jpg`, { type: 'image/jpeg' });
  return {
    compressedFile,
    originalSize: file.size,
    compressedSize: compressedFile.size,
    previewUrl: URL.createObjectURL(compressedFile),
  };
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

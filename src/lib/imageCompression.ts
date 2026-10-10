import imageCompression from 'browser-image-compression';

export interface CompressionResult {
  compressedFile: File;
  originalSize: number;
  compressedSize: number;
  previewUrl: string;
}

export async function compressIncidentImage(file: File): Promise<CompressionResult> {
  const options = {
    maxSizeMB: 0.5, // Target ~500KB
    maxWidthOrHeight: 1600, // Max 1600px
    useWebWorker: true,
    fileType: 'image/jpeg',
  };

  try {
    const compressedBlob = await imageCompression(file, options);
    const compressedFile = new File([compressedBlob], `report_${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });
    const previewUrl = URL.createObjectURL(compressedFile);

    return {
      compressedFile,
      originalSize: file.size,
      compressedSize: compressedFile.size,
      previewUrl,
    };
  } catch (error) {
    console.warn('Image compression fallback used:', error);
    return {
      compressedFile: file,
      originalSize: file.size,
      compressedSize: file.size,
      previewUrl: URL.createObjectURL(file),
    };
  }
}

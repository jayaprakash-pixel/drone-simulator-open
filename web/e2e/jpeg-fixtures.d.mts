export function withExif(jpeg: Uint8Array, exif?: { lat?: number; lon?: number; heading?: number; taken?: string }): Uint8Array;
export function jpegHeader(width: number, height: number): Uint8Array;

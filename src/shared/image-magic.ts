export type ImageKind = 'jpeg' | 'png' | 'gif' | 'webp';

export interface SniffedImage {
  type: ImageKind;
  width?: number;
  height?: number;
}

const ascii = (bytes: Uint8Array, start: number, text: string) =>
  [...text].every((char, index) => bytes[start + index] === char.charCodeAt(0));

/** Identifies an image by its leading bytes; the declared MIME is not trusted. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { type: 'jpeg' };
  if (bytes.length >= 24 && ascii(bytes, 0, '\x89PNG\r\n\x1a\n')) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    return {
      type: 'png',
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  }
  if (
    bytes.length >= 10 &&
    (ascii(bytes, 0, 'GIF87a') || ascii(bytes, 0, 'GIF89a'))
  )
    return {
      type: 'gif',
      width: bytes[6] | (bytes[7] << 8),
      height: bytes[8] | (bytes[9] << 8),
    };
  if (
    bytes.length >= 30 &&
    ascii(bytes, 0, 'RIFF') &&
    ascii(bytes, 8, 'WEBP')
  ) {
    if (ascii(bytes, 12, 'VP8X'))
      return {
        type: 'webp',
        width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
        height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
      };
    if (ascii(bytes, 12, 'VP8L'))
      return {
        type: 'webp',
        width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]),
        height:
          1 +
          (((bytes[24] & 0x0f) << 10) |
            (bytes[23] << 2) |
            ((bytes[22] & 0xc0) >> 6)),
      };
    if (ascii(bytes, 12, 'VP8 '))
      return {
        type: 'webp',
        width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
        height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
      };
    return { type: 'webp' };
  }
  return null;
}

/** Decodes only the first bytes of a base64 string (enough to sniff). */
export function decodeBase64Prefix(base64: string, bytes = 48): Uint8Array {
  const length = Math.min(base64.length, Math.ceil(bytes / 3) * 4);
  const binary = atob(base64.slice(0, length - (length % 4)));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

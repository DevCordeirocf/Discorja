import {
  AVATAR_MAX,
  LEGACY_AVATAR_MAX,
  profileAvatar,
} from '../../../shared/validation';

/** Re-encodes a square JPEG, shrinking until it fits `maxLength`. */
async function compactJpeg(photo: string, maxLength: number): Promise<string> {
  const base64 = photo.slice(photo.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  // A GIF decodes to its first frame here, which is the fallback for old rooms.
  const bitmap = await createImageBitmap(new Blob([bytes]));
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return '';
    const side = Math.min(bitmap.width, bitmap.height);
    for (const size of [256, 192, 160, 144, 128, 112, 96]) {
      canvas.width = size;
      canvas.height = size;
      context.fillStyle = '#22232d';
      context.fillRect(0, 0, size, size);
      context.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        size,
        size,
      );
      for (const quality of [0.86, 0.82, 0.72, 0.62, 0.52]) {
        const compact = canvas.toDataURL('image/jpeg', quality);
        if (compact.length <= maxLength) return compact;
      }
    }
    return '';
  } finally {
    bitmap.close();
  }
}

/**
 * Prepares the avatar for the negotiated protocol. Protocol 5 sends the saved
 * photo (animated GIFs included) when it already fits; protocol 4 needs a small
 * JPEG inside every room snapshot.
 */
export async function compactProfileAvatar(
  photo: string,
  protocol = 4,
): Promise<string> {
  if (!photo.startsWith('data:image/')) return '';
  try {
    if (protocol >= 5) {
      if (profileAvatar(photo)) return photo;
      return await compactJpeg(photo, AVATAR_MAX);
    }
    return await compactJpeg(photo, LEGACY_AVATAR_MAX);
  } catch {
    return '';
  }
}

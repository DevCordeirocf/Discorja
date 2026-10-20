const MAX_ROOM_AVATAR_LENGTH = 9_000;

/** Create a small image that can safely travel inside a room-state message. */
export async function compactProfileAvatar(photo: string): Promise<string> {
  if (!photo.startsWith('data:image/')) return '';
  try {
    const base64 = photo.slice(photo.indexOf(',') + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
      bytes[index] = binary.charCodeAt(index);
    const bitmap = await createImageBitmap(new Blob([bytes.buffer]));
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return '';
      const side = Math.min(bitmap.width, bitmap.height);
      for (const size of [192, 160, 144, 128, 112, 96]) {
        canvas.width = size;
        canvas.height = size;
        context.clearRect(0, 0, size, size);
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
        for (const quality of [0.82, 0.72, 0.62, 0.52]) {
          const compact = canvas.toDataURL('image/jpeg', quality);
          if (compact.length <= MAX_ROOM_AVATAR_LENGTH) return compact;
        }
      }
      return '';
    } finally {
      bitmap.close();
    }
  } catch {
    return '';
  }
}

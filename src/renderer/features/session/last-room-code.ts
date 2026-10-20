import { ROOM_CODE_ALPHABET } from '../../../shared/validation';

const LAST_ROOM_CODE_KEY = 'discorja:last-created-room-code';

export function saveLastRoomCode(value: string): void {
  const code = value.toUpperCase();
  if (
    code.length !== 8 ||
    [...code].some((character) => !ROOM_CODE_ALPHABET.includes(character))
  )
    return;
  try {
    localStorage.setItem(LAST_ROOM_CODE_KEY, code);
  } catch {
    // Remembering the code is optional; room connection must still succeed.
  }
}

export function getLastRoomCode(): string {
  try {
    const code = localStorage.getItem(LAST_ROOM_CODE_KEY) ?? '';
    if (
      code.length === 8 &&
      [...code].every((character) => ROOM_CODE_ALPHABET.includes(character))
    )
      return code;
  } catch {
    // Treat unavailable storage as if no previous code was saved.
  }
  return '';
}

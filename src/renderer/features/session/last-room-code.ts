import { roomCode } from '../../../shared/validation';

const LAST_ROOM_CODE_KEY = 'discorja:last-created-room-code';

export function saveLastRoomCode(value: string): void {
  if (!roomCode(value)) return;
  try {
    localStorage.setItem(LAST_ROOM_CODE_KEY, value);
  } catch {
    // Remembering the code is optional; room connection must still succeed.
  }
}

export function getLastRoomCode(): string {
  try {
    const code = localStorage.getItem(LAST_ROOM_CODE_KEY) ?? '';
    if (roomCode(code)) return code;
  } catch {
    // Treat unavailable storage as if no previous code was saved.
  }
  return '';
}

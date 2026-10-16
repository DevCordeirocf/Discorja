export interface KnownRoom {
  code: string;
  name: string;
  server: string;
}
const valid = (entry: unknown): entry is KnownRoom => {
  if (!entry || typeof entry !== 'object') return false;
  const value = entry as KnownRoom;
  return (
    typeof value.code === 'string' &&
    /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(value.code) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.name.length <= 40 &&
    typeof value.server === 'string' &&
    value.server.length <= 2048
  );
};
export function knownRooms(value: unknown): KnownRoom[] {
  if (!Array.isArray(value)) return [];
  const result: KnownRoom[] = [];
  for (const entry of value.slice(0, 100))
    if (
      valid(entry) &&
      !result.some(
        (room) => room.code === entry.code && room.server === entry.server,
      )
    ) {
      result.push({ code: entry.code, name: entry.name, server: entry.server });
      if (result.length === 12) break;
    }
  return result;
}
export function rememberRoom(
  previous: KnownRoom[],
  room: KnownRoom,
): KnownRoom[] {
  return knownRooms([
    room,
    ...previous.filter(
      (entry) => entry.code !== room.code || entry.server !== room.server,
    ),
  ]);
}

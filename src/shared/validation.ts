import type { IceCandidate, ServerMessage, SignalPayload } from './protocol.js';

export const MAX_MESSAGE_BYTES = 64 * 1024;
export const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export const keys = (
  v: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) =>
  required.every((key) => Object.hasOwn(v, key)) &&
  Object.keys(v).every(
    (key) => required.includes(key) || optional.includes(key),
  );
export const text = (v: unknown, max: number, min = 1): v is string =>
  typeof v === 'string' && v.length >= min && v.length <= max;
export const peerId = (v: unknown): v is string =>
  text(v, 64) && /^[a-zA-Z0-9-]+$/.test(v);
export const roomCode = (v: unknown): v is string =>
  text(v, 8, 8) && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(v);
export const token = (v: unknown): v is string =>
  text(v, 64, 64) && /^[a-f0-9]{64}$/.test(v);
const name = (v: unknown) =>
  text(v, 40) && !!v.trim() && !/[\u0000-\u001f\u007f]/u.test(v);
export function candidate(v: unknown): v is IceCandidate {
  return (
    object(v) &&
    keys(v, ['candidate'], ['sdpMid', 'sdpMLineIndex', 'usernameFragment']) &&
    text(v.candidate, 4096, 0) &&
    (v.sdpMid == null || text(v.sdpMid, 128, 0)) &&
    (v.usernameFragment == null || text(v.usernameFragment, 256, 0)) &&
    (v.sdpMLineIndex == null ||
      (Number.isInteger(v.sdpMLineIndex) &&
        Number(v.sdpMLineIndex) >= 0 &&
        Number(v.sdpMLineIndex) <= 65535))
  );
}
export function signal(v: unknown): v is SignalPayload {
  if (!object(v)) return false;
  return v.type === 'offer' || v.type === 'answer'
    ? keys(v, ['type', 'sdp']) && text(v.sdp, 56000)
    : v.type === 'ice' &&
        keys(v, ['type', 'candidate']) &&
        candidate(v.candidate);
}
export function isServerMessage(v: unknown): v is ServerMessage {
  if (!object(v)) return false;
  const identity = () => roomCode(v.code) && peerId(v.selfId);
  const session = () => v.resumeToken === undefined || token(v.resumeToken);
  switch (v.type) {
    case 'hello':
      return keys(v, ['type', 'protocol']) && v.protocol === 2;
    case 'room-state': {
      if (
        !keys(v, [
          'type',
          'reason',
          'protocol',
          'code',
          'name',
          'selfId',
          'ownerId',
          'publisherId',
          'maxParticipants',
          'participants',
          'sharing',
          'resumeToken',
        ]) ||
        v.protocol !== 2 ||
        !['created', 'joined', 'resumed', 'updated'].includes(
          String(v.reason),
        ) ||
        !identity() ||
        !name(v.name) ||
        !peerId(v.ownerId) ||
        !peerId(v.publisherId) ||
        !Number.isInteger(v.maxParticipants) ||
        Number(v.maxParticipants) < 2 ||
        Number(v.maxParticipants) > 101 ||
        !Array.isArray(v.participants) ||
        v.participants.length < 1 ||
        v.participants.length > Number(v.maxParticipants) ||
        typeof v.sharing !== 'boolean' ||
        !token(v.resumeToken)
      )
        return false;
      if (
        !v.participants.every(
          (entry) =>
            object(entry) &&
            keys(entry, ['peerId', 'name', 'role', 'connected']) &&
            peerId(entry.peerId) &&
            name(entry.name) &&
            ['owner', 'moderator', 'participant'].includes(
              String(entry.role),
            ) &&
            typeof entry.connected === 'boolean',
        )
      )
        return false;
      const members = v.participants as { peerId: string; role: string }[];
      return (
        new Set(members.map((entry) => entry.peerId)).size === members.length &&
        members.some((entry) => entry.peerId === v.selfId) &&
        members.some((entry) => entry.peerId === v.publisherId) &&
        members.filter((entry) => entry.role === 'owner').length === 1 &&
        members.some(
          (entry) => entry.peerId === v.ownerId && entry.role === 'owner',
        )
      );
    }
    case 'room-created':
      return (
        keys(v, ['type', 'code', 'selfId', 'maxViewers'], ['resumeToken']) &&
        identity() &&
        Number.isInteger(v.maxViewers) &&
        Number(v.maxViewers) > 0 &&
        Number(v.maxViewers) <= 100 &&
        session()
      );
    case 'room-joined':
      return (
        keys(
          v,
          ['type', 'code', 'selfId', 'hostId', 'hostName', 'sharing'],
          ['resumeToken'],
        ) &&
        identity() &&
        peerId(v.hostId) &&
        name(v.hostName) &&
        typeof v.sharing === 'boolean' &&
        session()
      );
    case 'room-resumed':
      return (
        keys(v, [
          'type',
          'code',
          'selfId',
          'hostId',
          'hostName',
          'sharing',
          'role',
          'maxViewers',
          'viewers',
          'resumeToken',
        ]) &&
        identity() &&
        peerId(v.hostId) &&
        name(v.hostName) &&
        typeof v.sharing === 'boolean' &&
        ['host', 'viewer'].includes(String(v.role)) &&
        Number.isInteger(v.maxViewers) &&
        Number(v.maxViewers) > 0 &&
        Number(v.maxViewers) <= 100 &&
        token(v.resumeToken) &&
        Array.isArray(v.viewers) &&
        v.viewers.length <= 100 &&
        v.viewers.every(
          (entry) =>
            object(entry) &&
            keys(entry, ['peerId', 'name']) &&
            peerId(entry.peerId) &&
            name(entry.name),
        )
      );
    case 'viewer-joined':
      return (
        keys(v, ['type', 'peerId', 'name']) && peerId(v.peerId) && name(v.name)
      );
    case 'viewer-left':
      return keys(v, ['type', 'peerId']) && peerId(v.peerId);
    case 'signal':
      return (
        keys(v, ['type', 'peerId', 'signal']) &&
        peerId(v.peerId) &&
        signal(v.signal)
      );
    case 'host-state':
      return keys(v, ['type', 'sharing']) && typeof v.sharing === 'boolean';
    case 'room-closed':
      return (
        keys(v, ['type', 'reason']) &&
        ['host-left', 'host-closed', 'expired'].includes(String(v.reason))
      );
    case 'kicked':
      return keys(v, ['type']);
    case 'error':
      return (
        keys(v, ['type', 'code', 'message']) &&
        text(v.code, 64) &&
        text(v.message, 512)
      );
    default:
      return false;
  }
}

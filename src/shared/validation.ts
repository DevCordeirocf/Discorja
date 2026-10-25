import type { IceCandidate, ServerMessage, SignalPayload } from './protocol.js';
import { decodeBase64Prefix, sniffImage } from './image-magic.js';

export const MAX_MESSAGE_BYTES = 128 * 1024;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
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
  text(v, 8, 8) && v.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(v);
export const token = (v: unknown): v is string =>
  text(v, 64, 64) && /^[a-f0-9]{64}$/.test(v);
/** Names typed in this app; the protocol keeps accepting 40 for older clients. */
export const DISPLAY_NAME_MAX = 32;
export const NAME_MAX = 40;
export const displayName = (v: unknown): v is string =>
  text(v, NAME_MAX) && !!v.trim() && !/[\u0000-\u001f\u007f]/u.test(v);
const name = displayName;
/** Protocol 4 avatars travel inside every room-state, so they stay small JPEGs. */
export const LEGACY_AVATAR_MAX = 9_000;
export const legacyAvatar = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length <= LEGACY_AVATAR_MAX &&
  (v === '' || /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/u.test(v));
const avatar = legacyAvatar;

/** Protocol 5 avatars travel alone (get-avatar), so animated images fit. */
export const AVATAR_MAX = 98_304;
export const AVATAR_MAX_SIDE = 256;
export const avatarId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{16}$/.test(v);
export const groupKey = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);

/**
 * Checks the data URL shape and that its leading bytes match the declared
 * type; animated formats must also be small enough to decode safely.
 */
export function profileAvatar(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > AVATAR_MAX) return false;
  if (v === '') return true;
  const match =
    /^data:image\/(jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(v);
  if (!match || match[2].length % 4) return false;
  try {
    const image = sniffImage(decodeBase64Prefix(match[2]));
    if (!image || image.type !== match[1]) return false;
    return (
      image.type === 'jpeg' ||
      (!!image.width &&
        !!image.height &&
        image.width <= AVATAR_MAX_SIDE &&
        image.height <= AVATAR_MAX_SIDE)
    );
  } catch {
    return false;
  }
}
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
      return (
        keys(v, ['type', 'protocol']) &&
        [2, 3, 4, 5].includes(Number(v.protocol))
      );
    case 'participant-avatar':
      return (
        keys(v, ['type', 'peerId', 'avatarId', 'avatar']) &&
        peerId(v.peerId) &&
        avatarId(v.avatarId) &&
        profileAvatar(v.avatar) &&
        v.avatar !== ''
      );
    case 'group-state':
      return (
        keys(v, ['type', 'groupKey', 'rooms', 'online']) &&
        groupKey(v.groupKey) &&
        Array.isArray(v.online) &&
        v.online.length <= 32 &&
        v.online.every((entry) => name(entry)) &&
        Array.isArray(v.rooms) &&
        v.rooms.length <= 20 &&
        v.rooms.every(
          (entry) =>
            object(entry) &&
            keys(entry, [
              'code',
              'name',
              'ownerName',
              'participants',
              'maxParticipants',
              'publications',
              'members',
            ]) &&
            roomCode(entry.code) &&
            name(entry.name) &&
            name(entry.ownerName) &&
            Number.isInteger(entry.maxParticipants) &&
            Number(entry.maxParticipants) >= 2 &&
            Number(entry.maxParticipants) <= 10 &&
            Number.isInteger(entry.participants) &&
            Number(entry.participants) >= 1 &&
            Number(entry.participants) <= Number(entry.maxParticipants) &&
            Number.isInteger(entry.publications) &&
            Number(entry.publications) >= 0 &&
            Number(entry.publications) <= 10 &&
            Array.isArray(entry.members) &&
            entry.members.length <= 10 &&
            entry.members.every((member) => name(member)),
        )
      );
    case 'room-state': {
      if (
        !keys(
          v,
          [
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
          ],
          v.protocol === 3 || v.protocol === 4 || v.protocol === 5
            ? [
                'publications',
                'maxPublishers',
                'watching',
                'watchRequestId',
                'subscribers',
              ]
            : [],
        ) ||
        ![2, 3, 4, 5].includes(Number(v.protocol)) ||
        !['created', 'joined', 'resumed', 'updated'].includes(
          String(v.reason),
        ) ||
        !identity() ||
        !name(v.name) ||
        !peerId(v.ownerId) ||
        !peerId(v.publisherId) ||
        !Number.isInteger(v.maxParticipants) ||
        Number(v.maxParticipants) < 2 ||
        Number(v.maxParticipants) > 10 ||
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
            keys(
              entry,
              ['peerId', 'name', 'role', 'connected'],
              v.protocol === 4
                ? ['avatar']
                : v.protocol === 5
                  ? ['avatarId']
                  : [],
            ) &&
            peerId(entry.peerId) &&
            name(entry.name) &&
            (!Object.hasOwn(entry, 'avatar') || avatar(entry.avatar)) &&
            (!Object.hasOwn(entry, 'avatarId') || avatarId(entry.avatarId)) &&
            ['owner', 'moderator', 'participant'].includes(
              String(entry.role),
            ) &&
            typeof entry.connected === 'boolean',
        )
      )
        return false;
      const members = v.participants as { peerId: string; role: string }[];
      if (v.protocol !== 2) {
        if (
          !Number.isInteger(v.maxPublishers) ||
          Number(v.maxPublishers) < 1 ||
          Number(v.maxPublishers) > 10 ||
          Number(v.maxPublishers) > Number(v.maxParticipants) ||
          !Array.isArray(v.publications) ||
          v.publications.length > Number(v.maxPublishers) ||
          !Array.isArray(v.subscribers) ||
          v.subscribers.length > Number(v.maxParticipants) - 1 ||
          !v.subscribers.every(
            (id) =>
              peerId(id) &&
              id !== v.selfId &&
              members.some((member) => member.peerId === id),
          ) ||
          new Set(v.subscribers).size !== v.subscribers.length ||
          (v.watchRequestId !== null && !peerId(v.watchRequestId))
        )
          return false;
        if (
          !v.publications.every(
            (entry) =>
              object(entry) &&
              keys(entry, [
                'publicationId',
                'publisherId',
                'audio',
                'connected',
                'watchers',
              ]) &&
              peerId(entry.publicationId) &&
              peerId(entry.publisherId) &&
              members.some((member) => member.peerId === entry.publisherId) &&
              typeof entry.audio === 'boolean' &&
              typeof entry.connected === 'boolean' &&
              Number.isInteger(entry.watchers) &&
              Number(entry.watchers) >= 0 &&
              Number(entry.watchers) < Number(v.maxParticipants),
          )
        )
          return false;
        const publications = v.publications as {
          publicationId: string;
          publisherId: string;
        }[];
        if (
          new Set(publications.map((entry) => entry.publicationId)).size !==
            publications.length ||
          new Set(publications.map((entry) => entry.publisherId)).size !==
            publications.length ||
          (v.watching !== null &&
            !publications.some(
              (entry) =>
                entry.publicationId === v.watching &&
                entry.publisherId !== v.selfId,
            )) ||
          (v.subscribers.length > 0 &&
            !publications.some((entry) => entry.publisherId === v.selfId))
        )
          return false;
      }
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
        Number(v.maxViewers) <= 9 &&
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
        Number(v.maxViewers) <= 9 &&
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
    case 'stream-signal':
      return (
        keys(v, ['type', 'publicationId', 'peerId', 'signal']) &&
        peerId(v.publicationId) &&
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

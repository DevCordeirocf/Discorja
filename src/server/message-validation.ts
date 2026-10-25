import {
  ROOM_CODE_ALPHABET,
  avatarId as validAvatarId,
  displayName as validName,
  groupKey as validGroupKey,
  keys as exactKeys,
  legacyAvatar,
  profileAvatar,
  object as plainObject,
  peerId as validPeerId,
  roomCode as validRoomCode,
  signal as validSignal,
  token as validToken,
} from '../shared/validation.js';
import type { ClientMessage } from '../shared/protocol.js';

export { ROOM_CODE_ALPHABET };

/** Older apps send small JPEGs; protocol 5 also accepts checked GIF/WebP. */
const validAvatar = (value: unknown): value is string =>
  legacyAvatar(value) || profileAvatar(value);

/** Validate and normalize an untrusted WebSocket message from a client. */
export function parseClientMessage(value: unknown): ClientMessage | undefined {
  if (!plainObject(value)) return;
  switch (value.type) {
    case 'publish-state':
      if (
        exactKeys(value, ['type', 'publicationId', 'sharing', 'audio']) &&
        validPeerId(value.publicationId) &&
        typeof value.sharing === 'boolean' &&
        typeof value.audio === 'boolean'
      )
        return value as ClientMessage;
      break;
    case 'watch-publication':
      if (
        exactKeys(value, ['type', 'publicationId', 'requestId']) &&
        (value.publicationId === null || validPeerId(value.publicationId)) &&
        validPeerId(value.requestId)
      )
        return value as ClientMessage;
      break;
    case 'stop-publication':
      if (exactKeys(value, ['type', 'peerId']) && validPeerId(value.peerId))
        return { type: 'stop-publication', peerId: value.peerId };
      break;
    case 'stream-signal':
      if (
        exactKeys(value, ['type', 'publicationId', 'peerId', 'signal']) &&
        validPeerId(value.publicationId) &&
        validPeerId(value.peerId) &&
        validSignal(value.signal)
      )
        return value as ClientMessage;
      break;
    case 'hello':
      if (
        exactKeys(value, ['type', 'protocol']) &&
        Number.isInteger(value.protocol)
      )
        return { type: 'hello', protocol: Number(value.protocol) };
      break;
    case 'set-publisher':
      if (exactKeys(value, ['type', 'peerId']) && validPeerId(value.peerId))
        return { type: 'set-publisher', peerId: value.peerId };
      break;
    case 'set-moderator':
      if (
        exactKeys(value, ['type', 'peerId', 'enabled']) &&
        validPeerId(value.peerId) &&
        typeof value.enabled === 'boolean'
      )
        return {
          type: 'set-moderator',
          peerId: value.peerId,
          enabled: value.enabled,
        };
      break;
    case 'resume-room':
      if (exactKeys(value, ['type', 'token']) && validToken(value.token))
        return { type: 'resume-room', token: value.token };
      break;
    case 'update-profile':
      if (
        exactKeys(value, ['type', 'name', 'avatar']) &&
        validName(value.name) &&
        validAvatar(value.avatar)
      )
        return {
          type: 'update-profile',
          name: value.name.trim(),
          avatar: value.avatar,
        };
      break;
    case 'get-avatar':
      if (
        exactKeys(value, ['type', 'peerId', 'avatarId']) &&
        validPeerId(value.peerId) &&
        validAvatarId(value.avatarId)
      )
        return {
          type: 'get-avatar',
          peerId: value.peerId,
          avatarId: value.avatarId,
        };
      break;
    case 'subscribe-group':
      if (
        exactKeys(value, ['type', 'groupKey', 'name']) &&
        validGroupKey(value.groupKey) &&
        validName(value.name)
      )
        return {
          type: 'subscribe-group',
          groupKey: value.groupKey,
          name: value.name.trim(),
        };
      break;
    case 'unsubscribe-group':
      if (
        exactKeys(value, ['type', 'groupKey']) &&
        validGroupKey(value.groupKey)
      )
        return { type: 'unsubscribe-group', groupKey: value.groupKey };
      break;
    case 'set-group-profile':
      if (exactKeys(value, ['type', 'avatar']) && profileAvatar(value.avatar))
        return { type: 'set-group-profile', avatar: value.avatar };
      break;
    case 'get-group-avatar':
      if (
        exactKeys(value, ['type', 'groupKey', 'avatarId']) &&
        validGroupKey(value.groupKey) &&
        validAvatarId(value.avatarId)
      )
        return {
          type: 'get-group-avatar',
          groupKey: value.groupKey,
          avatarId: value.avatarId,
        };
      break;
    case 'create-room':
      if (
        exactKeys(
          value,
          ['type', 'name'],
          ['roomName', 'avatar', 'code', 'groupKey'],
        ) &&
        validName(value.name) &&
        (value.roomName === undefined || validName(value.roomName)) &&
        (value.avatar === undefined || validAvatar(value.avatar)) &&
        (value.code === undefined || validRoomCode(value.code)) &&
        (value.groupKey === undefined || validGroupKey(value.groupKey))
      ) {
        const code = typeof value.code === 'string' ? value.code : '';
        return {
          type: value.type,
          name: value.name.trim(),
          ...(typeof value.avatar === 'string' ? { avatar: value.avatar } : {}),
          ...(typeof value.roomName === 'string'
            ? { roomName: value.roomName.trim() }
            : {}),
          ...(code ? { code } : {}),
          ...(typeof value.groupKey === 'string'
            ? { groupKey: value.groupKey }
            : {}),
        };
      }
      break;
    case 'join-room': {
      if (
        !exactKeys(value, ['type', 'code', 'name'], ['avatar']) ||
        !validName(value.name) ||
        !validRoomCode(value.code) ||
        (value.avatar !== undefined && !validAvatar(value.avatar))
      )
        return;
      return {
        type: value.type,
        name: value.name.trim(),
        code: value.code,
        ...(typeof value.avatar === 'string' ? { avatar: value.avatar } : {}),
      };
    }
    case 'signal':
      if (
        exactKeys(value, ['type', 'peerId', 'signal']) &&
        validPeerId(value.peerId) &&
        validSignal(value.signal)
      )
        return value as ClientMessage;
      break;
    case 'kick':
      if (exactKeys(value, ['type', 'peerId']) && validPeerId(value.peerId))
        return { type: value.type, peerId: value.peerId };
      break;
    case 'host-state':
      if (
        exactKeys(value, ['type', 'sharing']) &&
        typeof value.sharing === 'boolean'
      )
        return { type: value.type, sharing: value.sharing };
      break;
    case 'close-room':
    case 'leave-room':
      if (exactKeys(value, ['type'])) return { type: value.type };
      break;
  }
}

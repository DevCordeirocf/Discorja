import { token as validToken } from '../shared/validation.js';
import type {
  ClientMessage,
  IceCandidate,
  SignalPayload,
} from '../shared/protocol.js';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const plainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const exactKeys = (
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): boolean =>
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => required.includes(key) || optional.includes(key),
  );

const boundedString = (value: unknown, max: number, min = 1): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max;

const validName = (value: unknown): value is string =>
  boundedString(value, 40) &&
  value.trim().length > 0 &&
  !/[\u0000-\u001f\u007f]/u.test(value);

const validAvatar = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 9_000 &&
  (value === '' || /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/u.test(value));

const validPeerId = (value: unknown): value is string =>
  boundedString(value, 64) && /^[a-zA-Z0-9-]+$/u.test(value);

function validCandidate(value: unknown): value is IceCandidate {
  if (
    !plainObject(value) ||
    !exactKeys(
      value,
      ['candidate'],
      ['sdpMid', 'sdpMLineIndex', 'usernameFragment'],
    )
  )
    return false;
  if (!boundedString(value.candidate, 4096, 0)) return false;
  if (
    Object.hasOwn(value, 'sdpMid') &&
    value.sdpMid !== null &&
    !boundedString(value.sdpMid, 128, 0)
  )
    return false;
  if (
    Object.hasOwn(value, 'usernameFragment') &&
    value.usernameFragment !== null &&
    !boundedString(value.usernameFragment, 256, 0)
  )
    return false;
  return (
    !Object.hasOwn(value, 'sdpMLineIndex') ||
    value.sdpMLineIndex === null ||
    (Number.isInteger(value.sdpMLineIndex) &&
      Number(value.sdpMLineIndex) >= 0 &&
      Number(value.sdpMLineIndex) <= 65535)
  );
}

function validSignal(value: unknown): value is SignalPayload {
  if (!plainObject(value)) return false;
  if (value.type === 'offer' || value.type === 'answer')
    return (
      exactKeys(value, ['type', 'sdp']) && boundedString(value.sdp, 56_000)
    );
  return (
    value.type === 'ice' &&
    exactKeys(value, ['type', 'candidate']) &&
    validCandidate(value.candidate)
  );
}

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
    case 'create-room':
      if (
        exactKeys(value, ['type', 'name'], ['roomName', 'avatar']) &&
        validName(value.name) &&
        (value.roomName === undefined || validName(value.roomName)) &&
        (value.avatar === undefined || validAvatar(value.avatar))
      )
        return {
          type: value.type,
          name: value.name.trim(),
          ...(typeof value.avatar === 'string' ? { avatar: value.avatar } : {}),
          ...(typeof value.roomName === 'string'
            ? { roomName: value.roomName.trim() }
            : {}),
        };
      break;
    case 'join-room': {
      if (
        !exactKeys(value, ['type', 'code', 'name'], ['avatar']) ||
        !validName(value.name) ||
        !boundedString(value.code, 40) ||
        (value.avatar !== undefined && !validAvatar(value.avatar))
      )
        return;
      const code = value.code.replace(/[- ]/gu, '').toUpperCase();
      if (
        code.length === 8 &&
        [...code].every((character) => ROOM_CODE_ALPHABET.includes(character))
      )
        return {
          type: value.type,
          name: value.name.trim(),
          code,
          ...(typeof value.avatar === 'string' ? { avatar: value.avatar } : {}),
        };
      break;
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

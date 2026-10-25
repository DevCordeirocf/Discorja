import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/server/message-validation';
import { isServerMessage } from '../src/shared/validation';

describe('validação das mensagens recebidas pelo servidor', () => {
  it('preserva o código livre e normaliza o nome antes de entregar a mensagem', () => {
    expect(
      parseClientMessage({
        type: 'join-room',
        code: 'a!c 1?Zx',
        name: '  Ana  ',
      }),
    ).toEqual({ type: 'join-room', code: 'a!c 1?Zx', name: 'Ana' });
  });

  it('recusa campos extras e valores que não cabem no contrato', () => {
    expect(
      parseClientMessage({ type: 'leave-room', admin: true }),
    ).toBeUndefined();
    expect(
      parseClientMessage({ type: 'join-room', code: 'ABC1234', name: 'Ana' }),
    ).toBeUndefined();
    expect(
      parseClientMessage({
        type: 'join-room',
        code: 'ABC\u00001234',
        name: 'Ana',
      }),
    ).toBeUndefined();
    expect(
      parseClientMessage({
        type: 'signal',
        peerId: 'peer-1',
        signal: { type: 'offer', sdp: 'x'.repeat(56_001) },
      }),
    ).toBeUndefined();
  });

  it('valida a foto e o pedido de foto de "Online agora"', () => {
    const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB';
    expect(
      parseClientMessage({ type: 'set-group-profile', avatar: jpeg }),
    ).toEqual({ type: 'set-group-profile', avatar: jpeg });
    expect(
      parseClientMessage({ type: 'set-group-profile', avatar: '' }),
    ).toEqual({ type: 'set-group-profile', avatar: '' });
    for (const avatar of ['data:image/png;base64,AAAA', 5, 'x'])
      expect(
        parseClientMessage({ type: 'set-group-profile', avatar }),
      ).toBeUndefined();
    const request = {
      type: 'get-group-avatar',
      groupKey: 'c'.repeat(64),
      avatarId: '0123456789abcdef',
    };
    expect(parseClientMessage(request)).toEqual(request);
    expect(parseClientMessage({ ...request, avatarId: 'XYZ' })).toBeUndefined();
    expect(parseClientMessage({ ...request, peerId: 'p' })).toBeUndefined();
  });

  it('o app só aceita a lista de fotos alinhada com os nomes', () => {
    const listing = {
      type: 'group-state',
      groupKey: 'c'.repeat(64),
      rooms: [],
      online: ['Ana', 'Bia'],
    };
    expect(isServerMessage(listing)).toBe(true);
    expect(
      isServerMessage({ ...listing, avatars: ['0123456789abcdef', ''] }),
    ).toBe(true);
    expect(isServerMessage({ ...listing, avatars: [''] })).toBe(false);
    expect(isServerMessage({ ...listing, avatars: ['nope', ''] })).toBe(false);
    expect(
      isServerMessage({
        type: 'group-avatar',
        groupKey: 'c'.repeat(64),
        avatarId: '0123456789abcdef',
        avatar: '',
      }),
    ).toBe(false);
  });

  it('valida os campos opcionais do candidato ICE sem permitir extras', () => {
    expect(
      parseClientMessage({
        type: 'signal',
        peerId: 'peer-1',
        signal: {
          type: 'ice',
          candidate: { candidate: 'candidate:1', sdpMLineIndex: 0 },
        },
      }),
    ).toMatchObject({ type: 'signal', peerId: 'peer-1' });
    expect(
      parseClientMessage({
        type: 'signal',
        peerId: 'peer-1',
        signal: {
          type: 'ice',
          candidate: { candidate: 'candidate:1', isAdmin: true },
        },
      }),
    ).toBeUndefined();
  });
});

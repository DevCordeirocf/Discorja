import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/server/message-validation';

describe('validação das mensagens recebidas pelo servidor', () => {
  it('normaliza código e nome antes de entregar a mensagem ao servidor', () => {
    expect(
      parseClientMessage({
        type: 'join-room',
        code: 'abcd- efgh',
        name: '  Ana  ',
      }),
    ).toEqual({ type: 'join-room', code: 'ABCDEFGH', name: 'Ana' });
  });

  it('recusa campos extras e valores que não cabem no contrato', () => {
    expect(
      parseClientMessage({ type: 'leave-room', admin: true }),
    ).toBeUndefined();
    expect(
      parseClientMessage({ type: 'join-room', code: 'ABCDEFGI', name: 'Ana' }),
    ).toBeUndefined();
    expect(
      parseClientMessage({
        type: 'signal',
        peerId: 'peer-1',
        signal: { type: 'offer', sdp: 'x'.repeat(56_001) },
      }),
    ).toBeUndefined();
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

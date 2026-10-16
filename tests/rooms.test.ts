import { describe, expect, it } from 'vitest';
import { knownRooms, rememberRoom } from '../src/renderer/rooms';
import { isServerMessage } from '../src/shared/validation';

describe('Salas conhecidas e snapshots', () => {
  it('limita convites, separa servidores e não conserva credenciais de sessão', () => {
    const room = {
      code: 'ABCDEFGH',
      name: 'Turma',
      server: 'wss://server.example',
    };
    const values = knownRooms([
      { ...room, resumeToken: 'secret' },
      room,
      null,
      { ...room, code: '../oops' },
    ]);
    expect(values).toEqual([room]);
    expect(
      rememberRoom(values, { ...room, server: 'wss://other.example' }),
    ).toHaveLength(2);
    expect(rememberRoom(values, { ...room, name: 'Renomeada' })[0].name).toBe(
      'Renomeada',
    );
    const codes = Array.from({ length: 20 }, (_, index) => ({
      ...room,
      code: `AAAAAAA${'ABCDEFGHJKMNPQRSTUVW'[index]}`,
    }));
    expect(knownRooms(codes)).toHaveLength(12);
    expect(knownRooms({})).toEqual([]);
  });
  it('valida papéis, limites, identidade e unicidade do snapshot antes de usar na interface', () => {
    const snapshot = {
      type: 'room-state',
      protocol: 2,
      reason: 'joined',
      code: 'ABCDEFGH',
      name: 'Turma',
      selfId: 'member',
      ownerId: 'owner',
      publisherId: 'member',
      maxParticipants: 5,
      sharing: false,
      resumeToken: 'a'.repeat(64),
      participants: [
        { peerId: 'owner', name: 'Dono', role: 'owner', connected: true },
        {
          peerId: 'member',
          name: 'Amigo',
          role: 'participant',
          connected: true,
        },
      ],
    };
    expect(isServerMessage(snapshot)).toBe(true);
    for (const changes of [
      { protocol: 3 },
      { ownerId: 'absent' },
      { publisherId: 'absent' },
      { selfId: 'absent' },
      { maxParticipants: 1 },
      { resumeToken: 'secret' },
      { participants: [...snapshot.participants, snapshot.participants[0]] },
      {
        participants: snapshot.participants.map((member) => ({
          ...member,
          role: 'owner',
        })),
      },
    ])
      expect(isServerMessage({ ...snapshot, ...changes })).toBe(false);
  });
});

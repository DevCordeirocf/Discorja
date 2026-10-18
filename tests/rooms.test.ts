import { describe, expect, it } from 'vitest';
import { isServerMessage } from '../src/shared/validation';

describe('snapshots de sala', () => {
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

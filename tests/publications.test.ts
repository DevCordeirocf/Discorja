import { describe, expect, it } from 'vitest';
import { isServerMessage } from '../src/shared/validation';

const snapshot = {
  type: 'room-state',
  protocol: 3,
  reason: 'updated',
  code: 'ABCDEFGH',
  name: 'Turma',
  selfId: 'member',
  ownerId: 'owner',
  publisherId: 'owner',
  maxParticipants: 5,
  sharing: true,
  resumeToken: 'a'.repeat(64),
  maxPublishers: 2,
  participants: [
    { peerId: 'owner', name: 'Dono', role: 'owner', connected: true },
    { peerId: 'member', name: 'Amigo', role: 'participant', connected: true },
  ],
  publications: [
    {
      publicationId: 'screen-owner',
      publisherId: 'owner',
      audio: true,
      connected: true,
      watchers: 1,
    },
    {
      publicationId: 'screen-member',
      publisherId: 'member',
      audio: false,
      connected: true,
      watchers: 1,
    },
  ],
  watching: 'screen-owner',
  watchRequestId: 'selection-1',
  subscribers: ['owner'],
};

describe('Validação das publicações antes de usar dados remotos', () => {
  it('aceita publicação e recepção independentes e recusa campos não previstos', () => {
    expect(isServerMessage(snapshot)).toBe(true);
    expect(isServerMessage({ ...snapshot, command: 'execute' })).toBe(false);
  });
  it.each([
    { maxPublishers: 0 },
    { maxPublishers: 5 },
    { maxPublishers: 1 },
    { publications: undefined },
    { publications: [snapshot.publications[0], snapshot.publications[0]] },
    {
      publications: snapshot.publications.map((entry) => ({
        ...entry,
        publisherId: 'owner',
      })),
    },
    {
      publications: [{ ...snapshot.publications[0], publisherId: 'outsider' }],
    },
    { publications: [{ ...snapshot.publications[0], watchers: 5 }] },
    { watching: 'screen-member' },
    { watching: 'obsolete-screen' },
    { subscribers: ['outsider'] },
    { subscribers: ['member'] },
    { subscribers: ['owner', 'owner'] },
    { publications: [snapshot.publications[0]], subscribers: ['owner'] },
    { watchRequestId: '../command' },
    { watchRequestId: undefined },
  ])('recusa limite, identidade ou assinatura inválidos: %j', (changes) => {
    expect(isServerMessage({ ...snapshot, ...changes })).toBe(false);
  });
  it('valida identificador e conteúdo de sinal antes da negociação WebRTC', () => {
    const message = {
      type: 'stream-signal',
      peerId: 'owner',
      publicationId: 'screen-owner',
      signal: { type: 'offer', sdp: 'v=0' },
    };
    expect(isServerMessage(message)).toBe(true);
    for (const changes of [
      { publicationId: '../path' },
      { peerId: 'a'.repeat(65) },
      { signal: { type: 'offer', sdp: 'x'.repeat(56001) } },
      {
        signal: {
          type: 'ice',
          candidate: { candidate: '', sdpMLineIndex: -1 },
        },
      },
      { command: 'execute' },
    ])
      expect(isServerMessage({ ...message, ...changes })).toBe(false);
  });
});

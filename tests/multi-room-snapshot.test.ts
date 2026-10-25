import { describe, expect, it, vi } from 'vitest';
import type { MultiRoomState } from '../src/shared/protocol';
import {
  applyMultiRoomSnapshot,
  type MultiRoomSnapshotContext,
} from '../src/renderer/features/session/room-state/multi-room-snapshot';

const token = 'a'.repeat(64);
function snapshot(
  patch: Partial<MultiRoomState> & { connected?: boolean } = {},
): MultiRoomState {
  const { connected = true, ...rest } = patch;
  return {
    type: 'room-state',
    protocol: 4,
    reason: 'updated',
    code: 'ABCDEFGH',
    name: 'Sala',
    selfId: 'viewer',
    ownerId: 'owner',
    publisherId: 'owner',
    sharing: false,
    maxParticipants: 10,
    resumeToken: token,
    participants: [
      { peerId: 'owner', name: 'Dono', role: 'owner', connected },
      { peerId: 'viewer', name: 'Bia', role: 'participant', connected: true },
    ],
    maxPublishers: 10,
    publications: [
      {
        publicationId: 'pub',
        publisherId: 'owner',
        audio: false,
        connected,
        watchers: 1,
      },
    ],
    watching: 'pub',
    watchRequestId: null,
    subscribers: [],
    ...rest,
  } as MultiRoomState;
}

function context(
  patch: Partial<MultiRoomSnapshotContext> = {},
): MultiRoomSnapshotContext {
  return {
    roomCode: 'ABCDEFGH',
    selfId: 'viewer',
    signalRecovering: false,
    localPublicationId: '',
    publicationConfirmed: false,
    sharing: false,
    hasLocalStream: false,
    watchRequest: null,
    watching: {
      publicationId: 'pub',
      publisherId: 'owner',
      audio: false,
      connected: true,
      watchers: 1,
    },
    hasPeers: true,
    connectedSubscribers: new Set(),
    watchHealthy: true,
    ...patch,
  };
}

function effects() {
  return {
    activateRoom: vi.fn(),
    finishInitialConnection: vi.fn(),
    finishRecovery: vi.fn(),
    saveSnapshot: vi.fn(),
    confirmPublication: vi.fn(),
    stopUnconfirmedPublication: vi.fn(),
    syncSubscribers: vi.fn(() => new Set<string>(['friend'])),
    createPeers: vi.fn(),
    offerSubscriber: vi.fn(),
    setWatching: vi.fn(),
    clearWatchMedia: vi.fn(),
    clearWatchRequest: vi.fn(),
    createWatchPeers: vi.fn(),
    requestPublication: vi.fn(),
    notifyRecovered: vi.fn(),
    render: vi.fn(),
  };
}

describe('quedas curtas da sinalização', () => {
  it('mantém a transmissão assistida quando o publicador oscila', () => {
    const fx = effects();
    applyMultiRoomSnapshot(snapshot({ connected: false }), context(), fx);
    applyMultiRoomSnapshot(snapshot(), context(), fx);
    expect(fx.clearWatchMedia).not.toHaveBeenCalled();
    expect(fx.createWatchPeers).not.toHaveBeenCalled();
  });

  it('refaz a transmissão quando o vídeo também caiu', () => {
    const fx = effects();
    applyMultiRoomSnapshot(
      snapshot(),
      context({
        watchHealthy: false,
        watching: { ...context().watching!, connected: false },
      }),
      fx,
    );
    expect(fx.clearWatchMedia).toHaveBeenCalled();
    expect(fx.createWatchPeers).toHaveBeenCalled();
  });

  it('ao retomar, reoferece somente espectadores sem conexão', () => {
    const fx = effects();
    applyMultiRoomSnapshot(
      snapshot({
        reason: 'resumed',
        selfId: 'owner',
        watching: null,
        subscribers: ['friend', 'other'],
        participants: [
          { peerId: 'owner', name: 'Dono', role: 'owner', connected: true },
          {
            peerId: 'friend',
            name: 'Bia',
            role: 'participant',
            connected: true,
          },
          {
            peerId: 'other',
            name: 'Caio',
            role: 'participant',
            connected: true,
          },
        ],
      }),
      context({
        selfId: 'owner',
        signalRecovering: true,
        sharing: true,
        hasLocalStream: true,
        localPublicationId: 'pub',
        publicationConfirmed: true,
        watching: null,
        connectedSubscribers: new Set(['friend']),
      }),
      fx,
    );
    expect(fx.createPeers).not.toHaveBeenCalled();
    expect(fx.offerSubscriber).toHaveBeenCalledTimes(1);
    expect(fx.offerSubscriber).toHaveBeenCalledWith('other');
  });
});

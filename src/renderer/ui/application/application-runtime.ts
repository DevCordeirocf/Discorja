import type {
  AppConfig,
  DiscorjaAPI,
  RoomState,
  UpdateState,
} from '../../../shared/protocol';
import type { RoomPeers } from '../../media/rtc';
import type { SignalConnection } from '../../transport/signal';
import { roomCloseType, type PublicationWatcher } from '../../features/session';
import { bindRuntimeLifecycle } from '../runtime/runtime-lifecycle';
import { bootstrapDesktopApp } from './app-bootstrap';

export interface ApplicationRuntimeState {
  api: DiscorjaAPI | undefined;
  deferredRender: boolean;
  sharing: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  room: { selfId: string } | null;
  roomState: RoomState | null;
  sessionEpoch: number;
  nativeForeground: boolean;
  config: AppConfig;
  settingUrl: string;
  loaded: boolean;
  update: UpdateState;
  peers: RoomPeers | null;
  socket: SignalConnection | null;
}

export type ApplicationRuntimeUpdate = Partial<{
  sessionEpoch: number;
  nativeForeground: boolean;
  config: AppConfig;
  settingUrl: string;
  loaded: boolean;
  update: UpdateState;
}>;

export function startApplicationRuntime(options: {
  getState(): ApplicationRuntimeState;
  updateState(patch: ApplicationRuntimeUpdate): void;
  render(): void;
  syncPreviews(): void;
  patchMetrics(): void;
  publicationWatcher: PublicationWatcher;
  hasLiveAudio(stream: MediaStream | null): boolean;
  stopTracks(stream: MediaStream | null): void;
  notify(message: string, kind: 'error' | 'info'): void;
}): void {
  const state = options.getState;
  const update = options.updateState;
  const render = options.render;

  bindRuntimeLifecycle({
    isDeferredRender: () => state().deferredRender,
    render,
    syncPreviews: options.syncPreviews,
    patchMetrics: options.patchMetrics,
    onDeviceChange: () => {
      const current = state();
      if (!current.sharing || !options.hasLiveAudio(current.localStream))
        return;
      options.notify(
        'Os dispositivos de áudio mudaram. Confira o som recebido; se ficou em silêncio, reinicie o compartilhamento.',
        'info',
      );
    },
    getHasRoom: () => !!state().room,
    sendRoomClose: () => {
      const current = state();
      if (current.room)
        current.socket?.send({
          type: roomCloseType(current.roomState, current.room.selfId),
        });
    },
    incrementSession: () => update({ sessionEpoch: state().sessionEpoch + 1 }),
    stopLocalTracks: () => options.stopTracks(state().localStream),
    stopRemoteTracks: () => options.stopTracks(state().remoteStream),
    publicationWatcher: options.publicationWatcher,
    getPeers: () => state().peers,
    getSocket: () => state().socket,
    setSharingFalse: () => {
      void state()
        .api?.setSharing(false)
        .catch(() => undefined);
    },
  });

  render();
  const current = state();
  if (current.api)
    bootstrapDesktopApp({
      api: current.api,
      render,
      setForeground: (value) => {
        update({ nativeForeground: value });
        options.syncPreviews();
      },
      setConfig: (value) => update({ config: value }),
      setSettingUrl: (value) => update({ settingUrl: value }),
      setLoaded: (value) => update({ loaded: value }),
      setUpdate: (value) => update({ update: value }),
      notifyConfigError: () =>
        options.notify(
          'Não foi possível carregar as configurações. Reinicie o aplicativo.',
          'error',
        ),
    });
}

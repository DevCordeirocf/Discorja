import type {
  AppConfig,
  CaptureSource,
  DiscorjaAPI,
  ServerMessage,
  UpdateState,
  RoomState,
  MultiRoomState,
  Publication,
} from '../shared/protocol';
import { SignalConnection } from './signal';
import { errorFields, type LogEventName } from '../shared/logs';
import { RoomPeers } from './rtc';
import { SYSTEM_AUDIO_CONSTRAINTS } from '../shared/audio';
import {
  createFilteredAudioPipeline,
  type FilteredAudioPipeline,
} from './audio-capture';
import { knownRooms, rememberRoom, type KnownRoom } from './rooms';
import { renderStage } from './views/stage';
import { syncLocalPreview } from './preview';
import { renderSidebar, type AppPage } from './views/design';
import { renderSettingsView } from './views/settings-view';
import { escapeHtml as escape } from './html';
import { icon } from './icons';
import {
  focusable,
  rememberInteraction,
  restoreInteraction,
  trapDialogTab,
} from './accessibility';
import {
  QUALITY_PRESETS,
  DEFAULT_STREAM_PREFERENCES,
  normalizePreferences,
  captureConstraints,
  type StreamPreferences,
  type PeerMetrics,
} from '../shared/quality';

declare global {
  interface Window {
    discorja?: DiscorjaAPI;
  }
}

const root = document.querySelector<HTMLDivElement>('#app')!;
const announcements = document.createElement('div');
announcements.id = 'session-announcement';
announcements.className = 'sr-only';
announcements.setAttribute('role', 'status');
announcements.setAttribute('aria-live', 'polite');
announcements.setAttribute('aria-atomic', 'true');
document.body.append(announcements);
let sessionEpoch = 0;
const api = window.discorja;
function recordLog(
  event: LogEventName,
  details: Record<string, unknown> = {},
): void {
  void api
    ?.recordLog({ event, details: { session: sessionEpoch, ...details } })
    .catch(() => undefined);
}
window.addEventListener('error', (event) =>
  recordLog('renderer.error', {
    ...errorFields(event.error),
    line: event.lineno,
    column: event.colno,
  }),
);
window.addEventListener('unhandledrejection', (event) =>
  recordLog('renderer.rejection', errorFields(event.reason)),
);
let nativeForeground = !api;
let config: AppConfig = {
  signalingUrl: 'ws://127.0.0.1:8787',
  iceServers: [],
  version: 'prévia',
  updatesConfigured: false,
  systemAudioSupported: false,
};
let loaded = !api;
let displayName = '';
try {
  displayName = localStorage.getItem('discorja.name') ?? '';
} catch {
  /* Storage can be disabled. */
}
let joinCode = '';
let settingUrl = config.signalingUrl;
let activePage: AppPage = 'home';
let previousPage: AppPage = 'home';
let sidebarCollapsed = false;
let editingName = false;
let testingConnection = false;
let connectionCheck = '';
let filteredAudioPipeline: FilteredAudioPipeline | null = null;
let removeFilteredAudioErrorListener: (() => void) | null = null;
try {
  sidebarCollapsed =
    localStorage.getItem('discorja.sidebar-collapsed') === 'true';
  localStorage.removeItem('discorja.preview-economy');
} catch {
  /* The interface also works without local storage. */
}
let modal:
  | 'settings'
  | 'sources'
  | 'update'
  | 'rooms'
  | 'switch'
  | 'diagnostics'
  | null = null;
let roomName = '';
let savedRooms: KnownRoom[] = [];
try {
  savedRooms = knownRooms(
    JSON.parse(localStorage.getItem('discorja.rooms') ?? '[]'),
  );
} catch {
  /* Optional local history. */
}
let switchTarget: {
  kind: 'create' | 'join';
  code?: string;
  name?: string;
} | null = null;

function saveKnownRooms(): void {
  try {
    localStorage.setItem('discorja.rooms', JSON.stringify(savedRooms));
  } catch {
    /* Session still works. */
  }
}

function requestRoomSwitch(target: NonNullable<typeof switchTarget>): void {
  if (busy || applyingPreferences || signalRecovering) return;
  if (!displayName.trim()) {
    modal = null;
    notify('Informe seu nome antes de entrar em uma sala.');
    return;
  }
  if (target.kind === 'join' && target.code === room?.code) {
    modal = null;
    render();
    return;
  }
  switchTarget = target;
  if (room) {
    modal = 'switch';
    render();
  } else void confirmRoomSwitch();
}

async function confirmRoomSwitch(): Promise<void> {
  const target = switchTarget;
  if (!target) return;
  switchTarget = null;
  // Release tracks, sockets and peers synchronously before any new connection.
  leaveRoom();
  roomName = target.name ?? '';
  if (target.code) joinCode = target.code;
  await connectRoom(target.kind);
}
let updateDismissed = false;
let updatePrompted = false;
let resumeToken = '';
let signalRecovering = false;
let resumeTimer: ReturnType<typeof setTimeout> | undefined;
let resumeDeadline: ReturnType<typeof setTimeout> | undefined;
let returnFocusAction = 'settings';
let busy: 'room' | 'sources' | 'capture' | 'settings' | null = null;
let notice: { text: string; kind: 'error' | 'info' | 'success' } | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let update: UpdateState = { status: 'disabled' };
let socket: SignalConnection | null = null;
let peers: RoomPeers | null = null;
let captureEpoch = 0;
let remoteTimer: ReturnType<typeof setTimeout> | undefined;
let pending: {
  kind: 'create' | 'join';
  timer: ReturnType<typeof setTimeout>;
} | null = null;
let room: {
  role: 'host' | 'viewer';
  code: string;
  selfId: string;
  hostId?: string;
  hostName: string;
  maxViewers: number;
} | null = null;
const viewers = new Map<
  string,
  { name: string; connected: boolean; failed: boolean; reconnecting: boolean }
>();
let preferences: StreamPreferences = { ...DEFAULT_STREAM_PREFERENCES };
try {
  const savedPreferences = localStorage.getItem('discorja.stream-preferences');
  if (savedPreferences)
    preferences = normalizePreferences(JSON.parse(savedPreferences));
} catch {
  /* Invalid or unavailable storage falls back to validated defaults. */
}
let pendingPreferences: StreamPreferences | null = null;
let applyingPreferences = false;
let qualityEpoch = 0;
let qualityStatus = '';
let latestMetrics: PeerMetrics[] = [];
let metricsStartedAt = 0;
let connectionReconnecting = false;
let deferredRender = false;
let sources: CaptureSource[] = [];
let sourcePage: 'screen' | 'window' = 'screen';
let selectedSource = '';
let sharedSourceName = '';
let localStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
let sharing = false;
let remoteSharing = false;
let connectionIssue = '';
let roomState: RoomState | null = null;
let watching: Publication | null = null;
let watchRequest: string | null = null;
let watchPeers: RoomPeers | null = null;
let watchEpoch = 0;
let localPublicationId = '';
let publicationConfirmed = false;
let incomingMetrics: PeerMetrics[] = [];
let incomingMetricsStartedAt = 0;
const multiState = (): MultiRoomState | null =>
  roomState?.protocol === 3 ? roomState : null;

function clearWatchMedia(): void {
  watchEpoch++;
  watchPeers?.dispose();
  watchPeers = null;
  stopTracks(remoteStream);
  remoteStream = null;
  incomingMetrics = [];
  incomingMetricsStartedAt = 0;
  remoteSharing = false;
  connectionIssue = '';
  connectionReconnecting = false;
  clearTimeout(remoteTimer);
}

function createWatchPeers(): void {
  if (!watching || !watching.connected) return;
  incomingMetricsStartedAt = Date.now();
  const publication = watching;
  const epoch = sessionEpoch;
  const generation = watchEpoch;
  const current = () =>
    epoch === sessionEpoch &&
    generation === watchEpoch &&
    watching?.publicationId === publication.publicationId;
  watchPeers = new RoomPeers(
    config.iceServers,
    (peerId, signal) => {
      if (current())
        send({
          type: 'stream-signal',
          publicationId: publication.publicationId,
          peerId,
          signal,
        });
    },
    (stream) => {
      if (!current()) {
        stopTracks(stream);
        return;
      }
      if (remoteStream && remoteStream !== stream) stopTracks(remoteStream);
      remoteStream = stream;
      connectionIssue = '';
      connectionReconnecting = false;
      clearTimeout(remoteTimer);
      for (const track of stream.getVideoTracks())
        track.onended = () => {
          if (current()) {
            stopTracks(remoteStream);
            remoteStream = null;
            render();
          }
        };
      for (const track of stream.getAudioTracks())
        track.onended = () => {
          if (current()) render();
        };
      render();
    },
    (_peerId, state) => {
      if (!current()) return;
      connectionReconnecting = state === 'reconnecting';
      if (state === 'failed') {
        recordLog('rtc.failed');
        stopTracks(remoteStream);
        remoteStream = null;
        connectionIssue =
          'Não foi possível receber esta tela. Tente novamente ou escolha outra transmissão.';
      }
      render();
    },
    {
      preferences,
      onMetrics: (metrics) => {
        if (current()) {
          incomingMetrics = metrics;
          patchMetrics();
        }
      },
    },
  );
  remoteSharing = true;
  waitForVideo();
}

function selectPublication(id: string | null): void {
  const state = multiState();
  if (!state || signalRecovering) return;
  const publication = state.publications.find(
    (entry) => entry.publicationId === id && entry.publisherId !== state.selfId,
  );
  if (id !== null && !publication) return;
  clearWatchMedia();
  watching = publication ?? null;
  receiveMuted = true;
  watchRequest = crypto.randomUUID();
  createWatchPeers();
  send({
    type: 'watch-publication',
    publicationId: id,
    requestId: watchRequest,
  });
  render();
}

function refreshAudioPublication(): void {
  if (multiState() && sharing && localPublicationId)
    send({
      type: 'publish-state',
      publicationId: localPublicationId,
      sharing: true,
      audio: liveAudio(localStream).length > 0,
    });
}

function syncPreviews(): void {
  if (!localStream) return;
  const foreground =
    activePage === 'room' &&
    nativeForeground &&
    document.visibilityState === 'visible' &&
    (api ? true : document.hasFocus());
  const main = root.querySelector<HTMLVideoElement>('#stream-video');
  if (main && (multiState() ? !watching : room?.role === 'host'))
    syncLocalPreview(main, localStream, foreground);
  const small = root.querySelector<HTMLVideoElement>('#local-preview');
  if (small) syncLocalPreview(small, localStream, foreground);
}
let includeSystemAudio = false;
let excludeDiscordAudio = false;
let receiveMuted = true;
let receiveVolume = 1;

const liveAudio = (stream: MediaStream | null): MediaStreamTrack[] =>
  stream?.getAudioTracks().filter((track) => track.readyState === 'live') ?? [];

function updatePlayback(): void {
  const video = root.querySelector<HTMLVideoElement>('#stream-video');
  if (!video) return;
  video.volume = receiveVolume;
  video.muted = multiState()
    ? !watching ||
      receiveMuted ||
      (liveAudio(localStream).length > 0 && !filteredAudioPipeline)
    : room?.role !== 'viewer' || receiveMuted;
}

function renderAudioToggleButton(): string {
  if (room?.role === 'host' && sharing) {
    const tracks = liveAudio(localStream);
    if (!tracks.length) return '';
    const silenced = tracks.every((track) => !track.enabled);
    return `<button class="button subtle stage-audio-toggle" data-action="toggle-send-audio" aria-pressed="${silenced}" title="${silenced ? 'Reativar o áudio enviado' : 'Silenciar o áudio enviado'}">${silenced ? 'Ativar áudio' : 'Silenciar áudio'}</button>`;
  }

  return '';
}

function renderReceiveAudioControls(): string {
  if (!remoteStream || !liveAudio(remoteStream).length) return '';
  const blocked =
    multiState() && liveAudio(localStream).length > 0 && !filteredAudioPipeline;
  const muted = receiveMuted || blocked || receiveVolume === 0;
  const muteLabel = muted
    ? 'Ativar o áudio da transmissão'
    : 'Silenciar o áudio da transmissão';
  const blockedLabel =
    'A reprodução está bloqueada enquanto o áudio geral do computador é capturado';
  const volumePercent = Math.round(receiveVolume * 100);
  return `<div class="player-audio-controls" role="group" aria-label="Controles de áudio da transmissão"><button class="player-audio-mute" data-action="toggle-receive-audio" aria-pressed="${!muted}" aria-label="${blocked ? blockedLabel : muteLabel}" title="${blocked ? blockedLabel : muteLabel}" ${blocked ? 'disabled' : ''}>${icon(muted ? 'volume-muted' : 'volume')}</button><label class="player-volume-control"><span class="sr-only">Volume da transmissão</span><input id="receive-volume" type="range" min="0" max="100" step="1" value="${volumePercent}" aria-label="Volume da transmissão" ${blocked ? 'disabled' : ''}><output id="receive-volume-value" for="receive-volume">${volumePercent}%</output></label></div>`;
}

function diagnosticsTrigger(): string {
  return `<button class="diagnostics-trigger" data-action="show-diagnostics" aria-label="Abrir diagnóstico da conexão" title="Diagnóstico">${icon('network')}</button>`;
}

function stopFilteredAudioPipeline(): void {
  removeFilteredAudioErrorListener?.();
  removeFilteredAudioErrorListener = null;
  const pipeline = filteredAudioPipeline;
  filteredAudioPipeline = null;
  if (pipeline) {
    pipeline.track.onended = null;
    void pipeline.dispose();
  } else void api?.stopDiscordAudioCapture().catch(() => undefined);
}

function notify(
  text: string,
  kind: 'error' | 'info' | 'success' = 'info',
  temporary = false,
): void {
  clearTimeout(toastTimer);
  notice = { text, kind };
  render();
  if (temporary)
    toastTimer = setTimeout(() => {
      notice = null;
      render();
    }, 3500);
}

function clearPending(): void {
  if (pending) clearTimeout(pending.timer);
  pending = null;
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
}

function stopSharing(announce = true): void {
  const stoppedPublication = localPublicationId;
  localPublicationId = '';
  publicationConfirmed = false;
  captureEpoch++;
  qualityEpoch++;
  applyingPreferences = false;
  pendingPreferences = null;
  qualityStatus = '';
  latestMetrics = [];
  metricsStartedAt = 0;
  stopFilteredAudioPipeline();
  stopTracks(localStream);
  localStream = null;
  sharing = false;
  sharedSourceName = '';
  peers?.clear();
  void peers?.configure(preferences).catch(() => undefined);
  if (busy === 'capture' || busy === 'sources') busy = null;
  if (modal === 'sources') modal = null;
  void api?.cancelCapture().catch(() => undefined);
  void api?.setSharing(false).catch(() => undefined);
  if (announce && room?.role === 'host') {
    if (multiState()) {
      if (stoppedPublication)
        send({
          type: 'publish-state',
          publicationId: stoppedPublication,
          sharing: false,
          audio: false,
        });
    } else send({ type: 'host-state', sharing: false });
  }
}

function leaveRoom(
  message?: string,
  kind: 'error' | 'info' = 'info',
  tellServer = true,
): void {
  if (room) recordLog('room.left', { reason: tellServer ? 'user' : 'unknown' });
  clearTimeout(toastTimer);
  clearTimeout(resumeTimer);
  clearTimeout(resumeDeadline);
  resumeToken = '';
  signalRecovering = false;
  if (tellServer && room) {
    try {
      socket?.send({
        type: roomState?.ownerId === room.selfId ? 'close-room' : 'leave-room',
      });
    } catch {
      /* Already disconnected. */
    }
  }
  sessionEpoch++;
  clearPending();
  clearTimeout(remoteTimer);
  stopSharing(false);
  clearWatchMedia();
  watching = null;
  watchRequest = null;
  peers?.dispose();
  peers = null;
  socket?.disconnect();
  socket = null;
  stopTracks(remoteStream);
  remoteStream = null;
  room = null;
  activePage = 'home';
  roomState = null;
  receiveMuted = true;
  viewers.clear();
  remoteSharing = false;
  connectionIssue = '';
  connectionReconnecting = false;
  busy = null;
  modal = null;
  notice = message ? { text: message, kind } : null;
  render();
}

function send(message: Parameters<SignalConnection['send']>[0]): boolean {
  try {
    socket?.send(message);
    return !!socket;
  } catch {
    leaveRoom(
      'A conexão com o servidor foi perdida. A transmissão foi encerrada.',
      'error',
      false,
    );
    return false;
  }
}

function waitForVideo(): void {
  clearTimeout(remoteTimer);
  remoteTimer = setTimeout(() => {
    if (
      (room?.role === 'viewer' || watching) &&
      remoteSharing &&
      !remoteStream
    ) {
      connectionIssue =
        'O vídeo não chegou. Entre novamente na sala. Algumas redes precisam de um servidor TURN configurado pelo administrador.';
      render();
    }
  }, 20_000);
}

function createPeers(): void {
  peers?.dispose();
  const epoch = sessionEpoch;
  peers = new RoomPeers(
    config.iceServers,
    (peerId, signal) => {
      if (epoch === sessionEpoch) {
        if (multiState()) {
          if (localPublicationId)
            send({
              type: 'stream-signal',
              publicationId: localPublicationId,
              peerId,
              signal,
            });
        } else send({ type: 'signal', peerId, signal });
      }
    },
    (stream) => {
      if (epoch !== sessionEpoch || room?.role !== 'viewer' || !remoteSharing) {
        stopTracks(stream);
        return;
      }
      clearTimeout(remoteTimer);
      if (remoteStream && remoteStream !== stream) stopTracks(remoteStream);
      remoteStream = stream;
      connectionReconnecting = false;
      connectionIssue = '';
      for (const track of stream.getVideoTracks())
        track.onended = () => {
          if (remoteStream === stream) {
            stopTracks(stream);
            remoteStream = null;
            render();
          }
        };
      for (const track of stream.getAudioTracks())
        track.onended = () => {
          if (remoteStream === stream) render();
        };
      render();
    },
    (peerId, state) => {
      if (epoch !== sessionEpoch) return;
      if (state === 'failed') recordLog('rtc.failed');
      const viewer = viewers.get(peerId);
      if (viewer) {
        viewer.connected = state === 'connected';
        viewer.failed = state === 'failed';
        viewer.reconnecting = state === 'reconnecting';
      }
      if (room?.role === 'viewer') {
        connectionReconnecting = state === 'reconnecting';
        if (state === 'failed') {
          clearTimeout(remoteTimer);
          stopTracks(remoteStream);
          remoteStream = null;
          connectionIssue =
            'Não foi possível manter a conexão de vídeo. Entre novamente; se persistir, a rede pode precisar de um servidor TURN.';
        } else connectionIssue = '';
      }
      render();
    },
    {
      preferences,
      onMetrics: (metrics) => {
        if (epoch !== sessionEpoch) return;
        latestMetrics = metrics;
        patchMetrics();
      },
    },
  );
}

function applyMultiRoomState(message: MultiRoomState): void {
  const initial = message.reason === 'created' || message.reason === 'joined';
  if (
    initial &&
    pending?.kind !== (message.reason === 'created' ? 'create' : 'join')
  )
    return;
  if (
    !initial &&
    (!room || room.code !== message.code || room.selfId !== message.selfId)
  )
    return;
  const resumed = message.reason === 'resumed';
  if (resumed && !signalRecovering) return;
  socket?.setRoomActive(true);
  if (initial) {
    clearPending();
    busy = null;
  }
  if (resumed) {
    clearTimeout(resumeTimer);
    clearTimeout(resumeDeadline);
    signalRecovering = false;
    connectionReconnecting = false;
  }
  roomState = message;
  resumeToken = message.resumeToken;
  const owner = message.participants.find(
    (entry) => entry.peerId === message.ownerId,
  )!;
  room = {
    role: 'host',
    code: message.code,
    selfId: message.selfId,
    hostId: message.ownerId,
    hostName: owner.name,
    maxViewers: message.maxParticipants - 1,
  };
  savedRooms = rememberRoom(savedRooms, {
    code: message.code,
    name: message.name,
    server: config.signalingUrl,
  });
  saveKnownRooms();
  const own = message.publications.find(
    (entry) => entry.publisherId === message.selfId,
  );
  if (own?.publicationId === localPublicationId) publicationConfirmed = true;
  else if (sharing && publicationConfirmed) {
    stopSharing(false);
    notice = {
      text: 'Sua transmissão foi encerrada. As outras telas continuam na sala.',
      kind: 'info',
    };
  }
  const oldSubscribers = new Set(viewers.keys());
  for (const id of viewers.keys())
    if (!message.subscribers.includes(id)) {
      peers?.remove(id);
      viewers.delete(id);
    }
  for (const id of message.subscribers)
    if (!viewers.has(id))
      viewers.set(id, {
        name: message.participants.find((person) => person.peerId === id)!.name,
        connected: false,
        failed: false,
        reconnecting: false,
      });
  if (initial || resumed || !peers) createPeers();
  if (sharing && localStream && own?.publicationId === localPublicationId)
    for (const id of message.subscribers)
      if (resumed || !oldSubscribers.has(id))
        void peers?.offer(id, localStream);

  if (!watchRequest || watchRequest === message.watchRequestId) {
    watchRequest = null;
    const selected =
      message.publications.find(
        (entry) => entry.publicationId === message.watching,
      ) ?? null;
    if (
      selected?.publicationId !== watching?.publicationId ||
      selected?.connected !== watching?.connected ||
      resumed
    ) {
      clearWatchMedia();
      watching = selected;
      if (watching) createWatchPeers();
    } else watching = selected;
  } else if (resumed) {
    const selected =
      message.publications.find(
        (entry) => entry.publicationId === watching?.publicationId,
      ) ?? null;
    clearWatchMedia();
    watching = selected;
    createWatchPeers();
    send({
      type: 'watch-publication',
      publicationId: selected?.publicationId ?? null,
      requestId: watchRequest,
    });
  }
  if (resumed) notify('Conexão com a sala recuperada.', 'success', true);
  else render();
}

function applyRoomState(message: RoomState): void {
  if (message.protocol === 3) {
    applyMultiRoomState(message);
    return;
  }
  const initial = message.reason === 'created' || message.reason === 'joined';
  if (
    initial &&
    pending?.kind !== (message.reason === 'created' ? 'create' : 'join')
  )
    return;
  if (
    !initial &&
    (!room || room.code !== message.code || room.selfId !== message.selfId)
  )
    return;
  if (message.reason === 'resumed' && !signalRecovering) return;
  socket?.setRoomActive(true);
  const previousPublisher = roomState?.publisherId;
  const nextHost = message.publisherId === message.selfId;
  const changed = !initial && previousPublisher !== message.publisherId;
  const resumed = message.reason === 'resumed';
  const oldViewers = new Set(viewers.keys());
  if (changed) {
    stopSharing(false);
    peers?.dispose();
    peers = null;
    stopTracks(remoteStream);
    remoteStream = null;
    receiveMuted = true;
    latestMetrics = [];
    clearTimeout(remoteTimer);
  }
  if (initial) {
    clearPending();
    busy = null;
  }
  if (resumed) {
    clearTimeout(resumeTimer);
    clearTimeout(resumeDeadline);
    signalRecovering = false;
    connectionReconnecting = false;
  }
  resumeToken = message.resumeToken;
  roomState = message;
  savedRooms = rememberRoom(savedRooms, {
    code: message.code,
    name: message.name,
    server: config.signalingUrl,
  });
  saveKnownRooms();
  const publisher = message.participants.find(
    (member) => member.peerId === message.publisherId,
  )!;
  room = {
    role: nextHost ? 'host' : 'viewer',
    code: message.code,
    selfId: message.selfId,
    hostId: message.publisherId,
    hostName: publisher.name,
    maxViewers: message.maxParticipants - 1,
  };
  const activeViewers = message.participants.filter(
    (member) => member.peerId !== message.publisherId && member.connected,
  );
  for (const id of viewers.keys())
    if (!activeViewers.some((member) => member.peerId === id)) {
      peers?.remove(id);
      viewers.delete(id);
    }
  for (const member of activeViewers)
    if (!viewers.has(member.peerId))
      viewers.set(member.peerId, {
        name: member.name,
        connected: false,
        failed: false,
        reconnecting: false,
      });
  if (initial || changed || resumed || !peers) createPeers();
  if (nextHost) {
    if (resumed)
      send({ type: 'host-state', sharing: sharing && !!localStream });
    if (sharing && localStream)
      for (const member of activeViewers)
        if (initial || changed || resumed || !oldViewers.has(member.peerId))
          void peers?.offer(member.peerId, localStream);
  } else {
    const previouslySharing = remoteSharing;
    remoteSharing = message.sharing;
    if (!remoteSharing) {
      peers?.clear();
      stopTracks(remoteStream);
      remoteStream = null;
      latestMetrics = [];
      metricsStartedAt = 0;
      clearTimeout(remoteTimer);
    } else if (!previouslySharing || initial || changed || resumed) {
      metricsStartedAt = Date.now();
      waitForVideo();
    }
  }
  if (resumed) notify('Conexão com a sala recuperada.', 'success', true);
  else render();
}

function onMessage(message: ServerMessage): void {
  if (message.type === 'room-state' && message.reason !== 'updated')
    recordLog(
      message.reason === 'resumed'
        ? 'signal.resumed'
        : `room.${message.reason}`,
      { protocol: message.protocol },
    );
  switch (message.type) {
    case 'stream-signal':
      if (!multiState()) return;
      if (
        sharing &&
        message.publicationId === localPublicationId &&
        viewers.has(message.peerId)
      )
        void peers
          ?.receive(message.peerId, message.signal, false)
          .catch(() => undefined);
      else if (
        !watchRequest &&
        watching?.publicationId === message.publicationId &&
        watching.publisherId === message.peerId
      )
        void watchPeers
          ?.receive(message.peerId, message.signal, true)
          .catch(() => undefined);
      break;
    case 'room-state':
      applyRoomState(message);
      break;
    case 'room-resumed': {
      if (
        !signalRecovering ||
        !room ||
        room.selfId !== message.selfId ||
        room.code !== message.code ||
        room.role !== message.role
      )
        return;
      socket?.setRoomActive(true);
      clearTimeout(resumeTimer);
      clearTimeout(resumeDeadline);
      resumeToken = message.resumeToken;
      signalRecovering = false;
      connectionReconnecting = false;
      viewers.clear();
      createPeers();
      if (room.role === 'host') {
        for (const viewer of message.viewers) {
          viewers.set(viewer.peerId, {
            name: viewer.name,
            connected: false,
            failed: false,
            reconnecting: false,
          });
          if (sharing && localStream)
            void peers?.offer(viewer.peerId, localStream);
        }
        send({ type: 'host-state', sharing });
      } else {
        remoteSharing = message.sharing;
        if (remoteSharing) waitForVideo();
      }
      notify('Conexão com a sala recuperada.', 'success', true);
      break;
    }
    case 'room-created': {
      if (pending?.kind !== 'create') return;
      socket?.setRoomActive(true);
      clearPending();
      resumeToken = message.resumeToken ?? '';
      room = {
        role: 'host',
        code: message.code,
        selfId: message.selfId,
        hostName: displayName.trim(),
        maxViewers: message.maxViewers,
      };
      busy = null;
      createPeers();
      render();
      break;
    }
    case 'room-joined': {
      if (pending?.kind !== 'join') return;
      socket?.setRoomActive(true);
      clearPending();
      resumeToken = message.resumeToken ?? '';
      room = {
        role: 'viewer',
        code: message.code,
        selfId: message.selfId,
        hostId: message.hostId,
        hostName: message.hostName,
        maxViewers: 9,
      };
      busy = null;
      remoteSharing = message.sharing;
      metricsStartedAt = remoteSharing ? Date.now() : 0;
      createPeers();
      if (remoteSharing) waitForVideo();
      render();
      break;
    }
    case 'viewer-joined': {
      if (room?.role !== 'host') return;
      if (!viewers.has(message.peerId) && viewers.size >= room.maxViewers)
        return;
      viewers.set(message.peerId, {
        name: message.name,
        connected: false,
        failed: false,
        reconnecting: false,
      });
      if (sharing && localStream)
        void peers?.offer(message.peerId, localStream);
      render();
      break;
    }
    case 'viewer-left':
      peers?.remove(message.peerId);
      viewers.delete(message.peerId);
      render();
      break;
    case 'signal': {
      if (!room) return;
      if (room.role === 'host' && (!sharing || !viewers.has(message.peerId)))
        return;
      if (
        room.role === 'viewer' &&
        (message.peerId !== room.hostId || !remoteSharing)
      )
        return;
      void peers
        ?.receive(message.peerId, message.signal, room.role === 'viewer')
        .catch(() => undefined);
      break;
    }
    case 'host-state': {
      if (room?.role !== 'viewer') return;
      remoteSharing = message.sharing;
      connectionIssue = '';
      connectionReconnecting = false;
      if (!remoteSharing) {
        latestMetrics = [];
        metricsStartedAt = 0;
        clearTimeout(remoteTimer);
        peers?.clear();
        stopTracks(remoteStream);
        remoteStream = null;
      } else if (!remoteStream) {
        metricsStartedAt = Date.now();
        waitForVideo();
      }
      render();
      break;
    }
    case 'room-closed':
      recordLog('room.closed', { reason: message.reason });
      leaveRoom(
        message.reason === 'expired'
          ? 'A sala expirou. Crie ou entre em uma nova sala.'
          : message.reason === 'host-left'
            ? 'A sala foi encerrada porque o dono saiu ou perdeu a conexão.'
            : 'A sala foi encerrada pelo dono.',
        'info',
        false,
      );
      break;
    case 'kicked':
      leaveRoom('Você foi removido da sala.', 'info', false);
      break;
    case 'error': {
      recordLog('room.rejected', { serverCode: message.code });
      if (multiState() && !signalRecovering) {
        if (
          [
            'PUBLICATION_LIMIT',
            'STALE_PUBLICATION',
            'INVALID_PUBLICATION',
          ].includes(message.code)
        )
          stopSharing(false);
        if (message.code === 'PUBLICATION_NOT_FOUND') {
          clearWatchMedia();
          watching = null;
          watchRequest = null;
        }
      }
      if (signalRecovering) {
        leaveRoom(message.message, 'error', false);
        break;
      }
      if (pending || !room) leaveRoom(message.message, 'error', false);
      else notify(message.message, 'error');
      break;
    }
  }
}

function recoverSignaling(): void {
  if (signalRecovering) return;
  if (!room || !resumeToken) {
    leaveRoom(
      'A conexão foi encerrada. Entre novamente na sala.',
      'error',
      false,
    );
    return;
  }
  signalRecovering = true;
  recordLog('signal.recovery-started');
  connectionReconnecting = true;
  latestMetrics = [];
  peers?.dispose();
  peers = null;
  clearWatchMedia();
  stopTracks(remoteStream);
  remoteStream = null;
  socket?.disconnect();
  const epoch = sessionEpoch;
  let attempt = 0;
  resumeDeadline = setTimeout(() => {
    if (epoch === sessionEpoch && signalRecovering) {
      recordLog('signal.recovery-failed', { reason: 'deadline' });
      leaveRoom(
        'Não foi possível retomar a sala. A transmissão foi encerrada.',
        'error',
        false,
      );
    }
  }, 18_000);
  const retry = async () => {
    if (epoch !== sessionEpoch || !signalRecovering) return;
    recordLog('signal.retry', { attempt: ++attempt });
    let opened = false;
    const connection = new SignalConnection(
      config.signalingUrl,
      (message) => {
        if (epoch === sessionEpoch) onMessage(message);
      },
      (details) => {
        if (epoch !== sessionEpoch) return;
        recordLog('signal.closed', details);
        if (!signalRecovering) recoverSignaling();
        else if (opened) resumeTimer = setTimeout(() => void retry(), 1000);
      },
    );
    socket = connection;
    try {
      await connection.connect(4000);
      opened = true;
      if (epoch !== sessionEpoch || !signalRecovering) {
        connection.disconnect();
        return;
      }
      connection.send({ type: 'resume-room', token: resumeToken });
    } catch (error) {
      recordLog('signal.connect-failed', errorFields(error));
      connection.disconnect();
      if (epoch === sessionEpoch && signalRecovering)
        resumeTimer = setTimeout(
          () => void retry(),
          Math.min(3000, 500 * 2 ** (attempt - 1)),
        );
    }
  };
  notify('Reconectando à sala…');
  resumeTimer = setTimeout(() => void retry(), 500);
}

async function connectRoom(kind: 'create' | 'join'): Promise<void> {
  if (!api || !loaded || busy || room) return;
  const name = displayName.trim();
  if (!name || name.length > 32) {
    notify('Digite seu nome com até 32 caracteres.');
    document.querySelector<HTMLInputElement>('#display-name')?.focus();
    return;
  }
  if (kind === 'join' && !/^[A-Z0-9]{8}$/.test(joinCode)) {
    notify('Digite os 8 caracteres do código da sala.', 'error');
    document.querySelector<HTMLInputElement>('#room-code')?.focus();
    return;
  }
  try {
    localStorage.setItem('discorja.name', name);
  } catch {
    /* Saving the name is optional. */
  }
  notice = null;
  activePage = 'room';
  busy = 'room';
  const epoch = ++sessionEpoch;
  recordLog('signal.connecting');
  const connection = new SignalConnection(
    config.signalingUrl,
    (message) => {
      if (epoch === sessionEpoch) onMessage(message);
    },
    (details) => {
      if (epoch === sessionEpoch) {
        recordLog('signal.closed', details);
        recoverSignaling();
      }
    },
  );
  socket = connection;
  render();
  try {
    await connection.connect();
    recordLog('signal.connected');
    if (epoch !== sessionEpoch) {
      connection.disconnect();
      return;
    }
    pending = {
      kind,
      timer: setTimeout(() => {
        if (epoch === sessionEpoch)
          leaveRoom(
            'O servidor não confirmou a sala a tempo. Tente novamente.',
            'error',
            false,
          );
      }, 10_000),
    };
    connection.send(
      kind === 'create'
        ? {
            type: 'create-room',
            name,
            ...(roomName.trim()
              ? { roomName: roomName.trim().slice(0, 40) }
              : {}),
          }
        : { type: 'join-room', name, code: joinCode },
    );
  } catch (error) {
    recordLog('signal.connect-failed', errorFields(error));
    if (epoch === sessionEpoch)
      leaveRoom(
        error instanceof Error
          ? error.message
          : 'Não foi possível entrar na sala.',
        'error',
        false,
      );
  }
}

async function openSources(): Promise<void> {
  if (!api || room?.role !== 'host' || sharing || busy || applyingPreferences)
    return;
  const epoch = sessionEpoch;
  const attempt = ++captureEpoch;
  busy = 'sources';
  returnFocusAction = 'choose-source';
  sources = [];
  sourcePage = 'screen';
  selectedSource = '';
  includeSystemAudio = false;
  excludeDiscordAudio = false;
  modal = 'sources';
  notice = null;
  render();
  try {
    const available = await api.getSources();
    if (
      epoch !== sessionEpoch ||
      attempt !== captureEpoch ||
      modal !== 'sources'
    )
      return;
    sources = available;
    sourcePage = sources.some((source) => source.kind === 'screen')
      ? 'screen'
      : 'window';
    busy = null;
    render();
  } catch {
    if (epoch !== sessionEpoch || attempt !== captureEpoch) return;
    modal = null;
    busy = null;
    notify(
      'Não foi possível listar as telas e janelas. Tente novamente.',
      'error',
    );
  }
}

function cancelSources(): void {
  captureEpoch++;
  modal = null;
  if (busy === 'capture' || busy === 'sources') busy = null;
  void api?.cancelCapture().catch(() => undefined);
  render();
}

async function startSharing(): Promise<void> {
  if (
    !api ||
    busy ||
    applyingPreferences ||
    room?.role !== 'host' ||
    sharing ||
    !selectedSource
  )
    return;
  const epoch = sessionEpoch;
  const attempt = ++captureEpoch;
  const selectedPreferences = { ...preferences };
  const source = sources.find((item) => item.id === selectedSource);
  if (!source) return;
  const captureAudio = includeSystemAudio && config.systemAudioSupported;
  const captureWithoutDiscord = captureAudio && excludeDiscordAudio;
  const multi = multiState();
  if (multi && multi.publications.length >= multi.maxPublishers) {
    cancelSources();
    notify('Os espaços de transmissão estão ocupados.', 'info');
    return;
  }
  if (multi && captureAudio && !captureWithoutDiscord) {
    receiveMuted = true;
    updatePlayback();
  }
  const current = (): boolean =>
    epoch === sessionEpoch && attempt === captureEpoch && room?.role === 'host';
  busy = 'capture';
  render();
  let stream: MediaStream | null = null;
  let audioPipeline: FilteredAudioPipeline | null = null;
  let filteredAudioRuntimeError = '';
  try {
    if (captureWithoutDiscord) {
      try {
        audioPipeline = await createFilteredAudioPipeline(api);
      } catch (error) {
        const reason =
          error instanceof Error
            ? error.message
            : 'Não foi possível preparar o áudio filtrado.';
        notify(
          `O áudio filtrado não pôde ser preparado; o vídeo continuará sem áudio. ${reason}`,
          'error',
        );
      }
    }
    if (!current()) {
      await audioPipeline?.dispose();
      return;
    }
    await api.selectSource(source.id, captureAudio && !captureWithoutDiscord);
    if (!current()) {
      await audioPipeline?.dispose();
      return;
    }
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: captureConstraints(selectedPreferences.preset),
      audio:
        captureAudio && !captureWithoutDiscord
          ? SYSTEM_AUDIO_CONSTRAINTS
          : false,
    });
    for (const track of captureAudio && !captureWithoutDiscord
      ? []
      : stream.getAudioTracks()) {
      stream.removeTrack(track);
      track.stop();
    }
    if (!current()) {
      stopTracks(stream);
      return;
    }
    if (!stream.getVideoTracks().some((track) => track.readyState === 'live'))
      throw new Error('A captura foi encerrada antes de iniciar.');
    for (const track of stream.getVideoTracks())
      track.contentHint = selectedPreferences.content;
    if (audioPipeline) {
      const pipeline = audioPipeline;
      filteredAudioPipeline = pipeline;
      removeFilteredAudioErrorListener = api.onFilteredAudioError((message) => {
        if (filteredAudioPipeline !== pipeline) return;
        filteredAudioRuntimeError = message;
        stopFilteredAudioPipeline();
        if (localStream === stream) {
          void peers?.stopAudio().catch(() => undefined);
          refreshAudioPublication();
          render();
        }
        notify(message, 'error');
      });
      try {
        await pipeline.start();
        if (!current()) {
          if (filteredAudioPipeline === pipeline) stopFilteredAudioPipeline();
          else await pipeline.dispose();
          stopTracks(stream);
          return;
        }
        if (filteredAudioRuntimeError || pipeline.track.readyState !== 'live') {
          if (filteredAudioPipeline === pipeline) stopFilteredAudioPipeline();
          else await pipeline.dispose();
          audioPipeline = null;
        } else {
          stream.addTrack(pipeline.track);
        }
      } catch (error) {
        if (filteredAudioPipeline === pipeline) stopFilteredAudioPipeline();
        else await pipeline.dispose();
        audioPipeline = null;
        const reason =
          error instanceof Error
            ? error.message
            : 'Não foi possível excluir o Discord do áudio.';
        notify(`Vídeo iniciado sem áudio: ${reason}`, 'error');
      }
    }
    await peers?.configure(selectedPreferences);
    if (!current()) {
      stopFilteredAudioPipeline();
      stopTracks(stream);
      return;
    }
    await api.setSharing(true);
    if (!current()) {
      stopFilteredAudioPipeline();
      stopTracks(stream);
      void api.setSharing(false).catch(() => undefined);
      return;
    }
    localStream = stream;
    sharing = true;
    metricsStartedAt = Date.now();
    latestMetrics = [];
    sharedSourceName = source.name;
    modal = null;
    busy = null;
    connectionIssue = '';
    for (const track of stream.getVideoTracks())
      track.onended = () => {
        if (localStream === stream) {
          stopSharing();
          notify(
            'O compartilhamento foi interrompido. A sala continua aberta.',
          );
        }
      };
    for (const track of stream.getAudioTracks()) {
      track.contentHint = 'music';
      track.onended = () => {
        if (localStream !== stream) return;
        if (track === filteredAudioPipeline?.track) {
          stopFilteredAudioPipeline();
          notify(
            'A captura que exclui o Discord foi interrompida. O vídeo continua sem áudio.',
            'error',
          );
        } else {
          notify(
            'A captura de som foi interrompida. O vídeo continua; reinicie o compartilhamento para tentar novamente.',
            'error',
          );
        }
        void peers?.stopAudio().catch(() => undefined);
        refreshAudioPublication();
        render();
      };
    }
    if (captureAudio && !liveAudio(stream).length)
      notify(
        'O Windows não forneceu som. O vídeo continua; confira a saída de áudio e reinicie para tentar novamente.',
        'error',
      );
    if (multiState()) {
      localPublicationId = crypto.randomUUID();
      publicationConfirmed = false;
      send({
        type: 'publish-state',
        publicationId: localPublicationId,
        sharing: true,
        audio: liveAudio(stream).length > 0,
      });
      render();
      return;
    }
    if (!send({ type: 'host-state', sharing: true })) return;
    for (const [peerId, viewer] of viewers) {
      viewer.connected = false;
      viewer.failed = false;
      viewer.reconnecting = false;
      void peers?.offer(peerId, stream);
    }
    render();
  } catch (error) {
    await audioPipeline?.dispose();
    if (filteredAudioPipeline === audioPipeline) stopFilteredAudioPipeline();
    stopTracks(stream);
    recordLog('capture.failed', errorFields(error));
    if (!current()) return;
    busy = null;
    modal = null;
    void api.setSharing(false).catch(() => undefined);
    const cancelled =
      error instanceof DOMException &&
      (error.name === 'NotAllowedError' || error.name === 'AbortError');
    notify(
      cancelled
        ? 'O compartilhamento foi cancelado. Você pode escolher uma tela novamente.'
        : error instanceof Error
          ? `Não foi possível compartilhar: ${error.message}`
          : 'Não foi possível iniciar a captura.',
      cancelled ? 'info' : 'error',
    );
  } finally {
    // The main process consumes each selection once; clear any unused selection on failure.
    if (current()) void api.cancelCapture().catch(() => undefined);
  }
}

async function saveSettings(): Promise<void> {
  if (!api || busy || room) return;
  let url: URL;
  try {
    url = new URL(settingUrl.trim());
    const loopback = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (
      !['wss:', 'ws:'].includes(url.protocol) ||
      (url.protocol === 'ws:' && !loopback) ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new Error();
  } catch {
    notify(
      'Use wss:// para servidores públicos ou ws://127.0.0.1:8787 para o servidor local.',
      'error',
    );
    return;
  }
  busy = 'settings';
  render();
  try {
    await api.saveConfig({ signalingUrl: url.toString() });
    config = await api.getConfig();
    settingUrl = config.signalingUrl;
    modal = null;
    notify(
      'Servidor salvo. As próximas salas usarão esse endereço.',
      'success',
      true,
    );
  } catch (error) {
    notify(
      error instanceof Error
        ? error.message
        : 'Não foi possível salvar as configurações.',
      'error',
    );
  } finally {
    busy = null;
    render();
  }
}

function persistPreferences(): void {
  try {
    localStorage.setItem(
      'discorja.stream-preferences',
      JSON.stringify(preferences),
    );
  } catch {
    /* The current session can still use the selected quality. */
  }
}

async function applyPreferences(next: StreamPreferences): Promise<void> {
  if (busy || applyingPreferences || (room && room.role !== 'host')) {
    render();
    return;
  }
  const candidate = normalizePreferences(next);
  if (!room) {
    preferences = candidate;
    persistPreferences();
    render();
    return;
  }
  if (JSON.stringify(candidate) === JSON.stringify(preferences)) {
    render();
    return;
  }
  const previous = { ...preferences };
  const epoch = sessionEpoch;
  const capture = captureEpoch;
  const attempt = ++qualityEpoch;
  const stream = localStream;
  const track = stream?.getVideoTracks()[0];
  const manager = peers;
  const current = (): boolean =>
    epoch === sessionEpoch &&
    capture === captureEpoch &&
    attempt === qualityEpoch &&
    room?.role === 'host' &&
    localStream === stream;
  pendingPreferences = candidate;
  applyingPreferences = true;
  qualityStatus = track ? 'Aplicando à transmissão…' : 'Salvando perfil…';
  render();
  try {
    if (track) {
      if (candidate.preset !== previous.preset)
        await track.applyConstraints(captureConstraints(candidate.preset));
      if (!current()) return;
      track.contentHint = candidate.content;
    }
    await manager?.configure(candidate);
    if (!current()) return;
    preferences = candidate;
    persistPreferences();
    qualityStatus = track
      ? 'Perfil aplicado. Confira nas medições o envio para cada amigo.'
      : 'Perfil salvo para o próximo compartilhamento.';
  } catch {
    if (!current()) return;
    let rolledBack = true;
    try {
      if (track) {
        await track.applyConstraints(captureConstraints(previous.preset));
        if (!current()) return;
        track.contentHint = previous.content;
      }
      await manager?.configure(previous);
    } catch {
      rolledBack = false;
    }
    if (!current()) return;
    preferences = previous;
    qualityStatus = rolledBack
      ? 'O perfil anterior foi mantido.'
      : 'Confira a captura informada pelo sistema abaixo.';
    notify(
      rolledBack
        ? 'O sistema não aceitou a mudança de qualidade. Mantivemos o perfil anterior e a sala continua aberta.'
        : 'O sistema não confirmou a mudança nem a restauração do perfil. A transmissão continua; confira as medidas reais antes de tentar novamente.',
      'error',
    );
  } finally {
    if (current()) {
      pendingPreferences = null;
      applyingPreferences = false;
      render();
    }
  }
}

function readQualityControls(
  bitrateChanged = false,
  prefix = '',
): StreamPreferences {
  const preset = document.querySelector<HTMLSelectElement>(
    `#${prefix}quality-preset`,
  )?.value;
  const requestedBitrate = bitrateChanged
    ? Number(
        root.querySelector<HTMLInputElement>(`#${prefix}video-bitrate`)?.value,
      )
    : undefined;
  const presetBitrate = preset
    ? QUALITY_PRESETS[preset as keyof typeof QUALITY_PRESETS].bitrate /
      1_000_000
    : undefined;
  return normalizePreferences({
    videoBitrateMbps:
      bitrateChanged && requestedBitrate === presetBitrate
        ? undefined
        : (requestedBitrate ?? preferences.videoBitrateMbps),
    preferredCodec: document.querySelector<HTMLSelectElement>(
      `#${prefix}preferred-codec`,
    )?.value,
    preset,
    content: document.querySelector<HTMLSelectElement>(`#${prefix}content-mode`)
      ?.value,
    adaptive: document.querySelector<HTMLInputElement>(
      `#${prefix}adaptive-quality`,
    )?.checked,
    maxUploadMbps: Number(
      document.querySelector<HTMLInputElement>(`#${prefix}upload-budget`)
        ?.value,
    ),
  });
}

function renderQualityPanel(): string {
  const selected = pendingPreferences ?? preferences;
  const disabled = !!busy || applyingPreferences;
  return `<section class="quality-panel" aria-labelledby="quality-heading"><div class="quality-heading"><div><h2 id="quality-heading">Qualidade da transmissão</h2><p>Escolha o perfil desejado. A entrega real aparece nas medições.</p></div><span class="quality-state">${applyingPreferences ? '<span class="spinner"></span> Aplicando' : sharing ? 'Ajuste sem parar' : 'Antes de começar'}</span></div>
  <div class="quality-controls"><div class="quality-field"><label for="quality-preset">Perfil desejado</label><select id="quality-preset" ${disabled ? 'disabled' : ''}>${Object.entries(
    QUALITY_PRESETS,
  )
    .map(
      ([id, profile]) =>
        `<option value="${id}" ${id === selected.preset ? 'selected' : ''}>${escape(profile.label)}</option>`,
    )
    .join(
      '',
    )}</select></div><div class="quality-field"><label for="content-mode">O que vai aparecer?</label><select id="content-mode" ${disabled ? 'disabled' : ''}><option value="detail" ${selected.content === 'detail' ? 'selected' : ''}>Textos e detalhes</option><option value="motion" ${selected.content === 'motion' ? 'selected' : ''}>Vídeos e jogos</option></select></div><div class="quality-field"><label for="preferred-codec">Formato na próxima transmissão</label><select id="preferred-codec" ${disabled ? 'disabled' : ''}>${['auto', 'H264', 'VP8', 'VP9', 'AV1'].map((codec) => `<option value="${codec}" ${(selected.preferredCodec ?? 'auto') === codec ? 'selected' : ''}>${codec === 'auto' ? 'Automático' : codec}</option>`).join('')}</select></div><label class="adaptive-control" for="adaptive-quality"><input id="adaptive-quality" type="checkbox" ${selected.adaptive ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>Ajustar à conexão</strong><small>Reduz quando necessário e recupera aos poucos.</small></span></label><div class="quality-field budget-field"><label for="upload-budget">Limite total de envio · até 500 Mbps</label><div class="budget-input"><input id="upload-budget" type="number" min="4" max="500" step="1" inputmode="numeric" value="${selected.maxUploadMbps}" aria-describedby="upload-budget-help" ${disabled ? 'disabled' : ''}><span>Mbps</span></div></div><div class="quality-field bitrate-field"><label for="video-bitrate">Teto por espectador · até 100 Mbps</label><div class="budget-input"><input id="video-bitrate" type="number" min="1" max="100" step="1" value="${selected.videoBitrateMbps ?? QUALITY_PRESETS[selected.preset].bitrate / 1_000_000}" aria-describedby="video-bitrate-help" ${disabled ? 'disabled' : ''}><span>Mbps</span></div><small id="video-bitrate-help">${selected.videoBitrateMbps ? 'Personalizado' : 'Padrão do perfil'} · ${((selected.videoBitrateMbps ?? QUALITY_PRESETS[selected.preset].bitrate / 1_000_000) / 8).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB/s por espectador, no máximo.</small></div></div>
  <p id="upload-budget-help" class="quality-help">O limite total é dividido entre espectadores. O FPS real depende da tela, do computador e da rede.</p><p class="quality-status" role="status">${escape(qualityStatus)}</p></section>`;
}

function metricPeer(
  peerId: string,
  name: string,
  direction?: 'inbound' | 'outbound',
): string {
  return `<article class="metric-peer" data-peer-metrics="${escape(peerId)}" ${direction ? `data-direction="${direction}"` : ''}><header><strong>${escape(name)}</strong><span data-value="status">Aguardando medição</span></header><dl class="metric-values"><div><dt>Resolução</dt><dd data-value="resolution">—</dd></div><div><dt>Quadros/s</dt><dd data-value="fps">—</dd></div><div><dt>Vídeo</dt><dd data-value="bitrate">— Mbps</dd></div><div><dt>Resposta</dt><dd data-value="rtt">— ms</dd></div><div><dt>Perda</dt><dd data-value="loss">—</dd></div><div><dt>Conexão</dt><dd data-value="route">—</dd></div></dl><p class="metric-detail" data-value="detail">Os dados aparecem quando a conexão de vídeo é estabelecida.</p></article>`;
}

function renderDiagnostics(): string {
  if (!room) return '';
  const multi = multiState();
  if (multi) {
    const rows = [...viewers]
      .map(([id, person]) =>
        metricPeer(id, `Enviando para ${person.name}`, 'outbound'),
      )
      .join('');
    const selected = multi.participants.find(
      (person) => person.peerId === watching?.publisherId,
    );
    return `<section class="stream-diagnostics" aria-label="Diagnóstico de envio e recepção"><div class="diagnostics-heading"><h2>Conexões desta sala</h2><button class="button subtle" data-action="export-diagnostics">Salvar diagnóstico</button></div>${rows}${watching ? metricPeer(watching.publisherId, `Recebendo de ${selected?.name ?? 'participante'}`, 'inbound') : ''}${!rows && !watching ? '<p>Escolha uma transmissão ou aguarde alguém assistir à sua tela.</p>' : ''}<p class="metrics-footnote">Somente as conexões ativas aparecem aqui. O perfil de vídeo é um objetivo, sujeito à fonte, ao computador e à rede.</p></section>`;
  }
  const host = room.role === 'host';
  return `<section class="stream-diagnostics" aria-labelledby="diagnostics-heading"><div class="diagnostics-heading"><h2 id="diagnostics-heading">${host ? 'Vídeo enviado em tempo real' : 'Vídeo recebido'}</h2><button class="button subtle" data-action="export-diagnostics">Salvar diagnóstico</button><span>Atualizado a cada 2 s</span></div>${host ? `<div class="capture-summary"><div><span>Captura no computador</span><strong data-stat="capture">—</strong><small>Formato informado pelo sistema.</small></div><div><span>Envio de vídeo total</span><strong data-stat="upload-total">— Mbps</strong><small data-stat="upload-detail">Aguardando conexões.</small></div></div>` : ''}<div class="metric-peer-list">${host ? (viewers.size ? [...viewers].map(([id, viewer]) => metricPeer(id, viewer.name)).join('') : '<p class="metrics-empty">As medições de cada amigo aparecem quando ele entrar e a transmissão começar.</p>') : metricPeer(room.hostId!, room.hostName)}</div><p class="metrics-footnote">Medições podem variar ou ficar indisponíveis. O perfil selecionado é um objetivo, e os FPS ${host ? 'enviados' : 'recebidos'} dependem também do conteúdo exibido.</p></section>`;
}

function finiteMetric(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function measured(value: number, decimals = 1): string {
  return value.toLocaleString('pt-BR', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

/** Updates telemetry text only: no video elements, focus, media playback, or live regions. */
function patchMetrics(): void {
  if (!room) return;
  const now = Date.now();
  const live = multiState()
    ? sharing || remoteSharing
    : room.role === 'host'
      ? sharing
      : remoteSharing;
  const fresh = [...latestMetrics, ...incomingMetrics].filter(
    (metric) => now - metric.timestamp >= 0 && now - metric.timestamp <= 8_000,
  );
  const captureNode = root.querySelector<HTMLElement>('[data-stat="capture"]');
  if (captureNode) {
    const settings = localStream?.getVideoTracks()[0]?.getSettings();
    captureNode.textContent =
      settings?.width && settings.height
        ? `${settings.width} × ${settings.height}${finiteMetric(settings.frameRate) ? ` · até ${measured(settings.frameRate, 0)} FPS` : ''}`
        : 'Sem captura ativa';
  }
  const outbound = fresh.filter(
    (metric) =>
      metric.direction === 'outbound' &&
      viewers.has(metric.peerId) &&
      finiteMetric(metric.bitrateMbps),
  );
  const total = root.querySelector<HTMLElement>('[data-stat="upload-total"]');
  if (total)
    total.textContent =
      sharing && outbound.length
        ? `${measured(outbound.reduce((sum, metric) => sum + metric.bitrateMbps!, 0))} Mbps`
        : '— Mbps';
  const totalDetail = root.querySelector<HTMLElement>(
    '[data-stat="upload-detail"]',
  );
  if (totalDetail)
    totalDetail.textContent = !sharing
      ? 'Inicie o compartilhamento para medir.'
      : !viewers.size
        ? 'Nenhum espectador conectado.'
        : outbound.length < viewers.size
          ? `Medição parcial · ${outbound.length} de ${viewers.size} conexões.`
          : `Vídeo enviado a ${outbound.length} ${outbound.length === 1 ? 'espectador' : 'espectadores'}.`;
  for (const row of root.querySelectorAll<HTMLElement>('[data-peer-metrics]')) {
    const peerId = row.dataset.peerMetrics;
    const direction =
      row.dataset.direction ?? (room.role === 'host' ? 'outbound' : 'inbound');
    const rowLive = multiState()
      ? direction === 'outbound'
        ? sharing
        : remoteSharing
      : live;
    const metric = rowLive
      ? fresh.find(
          (entry) => entry.peerId === peerId && entry.direction === direction,
        )
      : undefined;
    const write = (key: string, text: string): void => {
      const node = row.querySelector<HTMLElement>(`[data-value="${key}"]`);
      if (node && node.textContent !== text) node.textContent = text;
    };
    const viewer =
      peerId && direction === 'outbound' ? viewers.get(peerId) : undefined;
    const reconnecting =
      metric?.recovering ||
      viewer?.reconnecting ||
      (direction === 'inbound' && connectionReconnecting);
    write(
      'status',
      reconnecting
        ? 'Reconectando…'
        : !rowLive
          ? 'Sem transmissão'
          : viewer?.failed || (direction === 'inbound' && connectionIssue)
            ? 'Conexão interrompida'
            : metric
              ? 'Medição recebida'
              : (direction === 'inbound' && multiState()
                    ? incomingMetricsStartedAt
                    : metricsStartedAt) &&
                  now -
                    (direction === 'inbound' && multiState()
                      ? incomingMetricsStartedAt
                      : metricsStartedAt) >
                    10_000
                ? 'Medição indisponível'
                : 'Aguardando medição',
    );
    write(
      'resolution',
      metric?.width && metric.height
        ? `${metric.width} × ${metric.height}`
        : '—',
    );
    write('fps', finiteMetric(metric?.fps) ? measured(metric.fps, 0) : '—');
    write(
      'bitrate',
      finiteMetric(metric?.bitrateMbps)
        ? `${measured(metric.bitrateMbps)} Mbps`
        : '— Mbps',
    );
    write(
      'rtt',
      finiteMetric(metric?.rttMs) ? `${measured(metric.rttMs, 0)} ms` : '— ms',
    );
    write(
      'loss',
      finiteMetric(metric?.packetLossPercent)
        ? `${measured(metric.packetLossPercent)}%`
        : '—',
    );
    write(
      'route',
      metric?.route === 'direct'
        ? 'Direta'
        : metric?.route === 'relay'
          ? 'Retransmitida'
          : '—',
    );
    const detail: string[] = [];
    if (metric?.parameterError)
      detail.push(
        'O navegador não confirmou um limite de envio; confira as medições.',
      );
    if (metric?.levelLabel) detail.push(metric.levelLabel);
    if (metric?.limitation === 'cpu')
      detail.push('O computador está limitando o vídeo.');
    if (metric?.limitation === 'bandwidth')
      detail.push('A conexão está limitando o vídeo.');
    if (metric?.limitation === 'other')
      detail.push('O navegador está limitando o vídeo.');
    if (metric?.codec) detail.push(`Formato ${metric.codec}.`);
    if (metric?.audioCodec)
      detail.push(
        `Som: ${metric.audioCodec}${finiteMetric(metric.audioBitrateKbps) ? ` · ${measured(metric.audioBitrateKbps, 0)} kbps` : ''}.`,
      );
    if (finiteMetric(metric?.audioJitterMs))
      detail.push(`Variação do som: ${measured(metric.audioJitterMs)} ms.`);
    if (finiteMetric(metric?.audioPacketLossPercent))
      detail.push(
        `Perda de áudio: ${measured(metric.audioPacketLossPercent)}%.`,
      );
    if (finiteMetric(metric?.audioBufferMs))
      detail.push(
        `Buffer de áudio médio: ${measured(metric.audioBufferMs)} ms.`,
      );
    if (metric?.encoderImplementation)
      detail.push(`Codificador ${metric.encoderImplementation}.`);
    if (metric?.decoderImplementation)
      detail.push(`Decodificador ${metric.decoderImplementation}.`);
    if (metric?.direction === 'outbound')
      detail.push(
        metric.powerEfficientEncoder === undefined
          ? 'Aceleração: não informada.'
          : metric.powerEfficientEncoder
            ? 'Codificador eficiente informado pelo navegador.'
            : 'Codificador eficiente não informado como ativo.',
      );
    if (finiteMetric(metric?.jitterMs))
      detail.push(`Jitter ${measured(metric.jitterMs)} ms.`);
    if (finiteMetric(metric?.framesDropped))
      detail.push(`Quadros descartados: ${metric.framesDropped}.`);
    if (finiteMetric(metric?.freezeCount))
      detail.push(`Congelamentos: ${metric.freezeCount}.`);
    write(
      'detail',
      detail.join(' ') ||
        (metric
          ? 'A qualidade pode variar com a tela, o computador e a conexão.'
          : live
            ? 'Aguardando dados disponíveis desta conexão.'
            : 'As medições aparecem durante o compartilhamento.'),
    );
  }
}

function renderHome(): string {
  const disabled = !api || !loaded || !!busy;
  return `<section class="home-content" aria-label="Início"><div class="home-copy"><h1>Censura? Aqui não</h1><h2>A tecnologia é apenas uma ferramenta.</h2><p>o problema não é a criação, mas o uso que se faz dela.</p><p class="home-invitation">Crie uma sala e convide alguem</p></div>${!displayName.trim() || editingName ? `<form id="profile-form" class="identity-field"><label for="display-name">Seu nome</label><input id="display-name" class="text-input" autocomplete="nickname" maxlength="32" required placeholder="Seu nome" value="${escape(displayName)}" ${busy ? 'disabled' : ''}>${editingName ? '<button class="button secondary" type="submit">Salvar nome</button>' : ''}</form>` : ''}<div class="start-grid"><article class="start-card create-card"><h2>Criar sala</h2><p>Escolha uma janela ou tela para compartilhar.</p><button class="button primary wide" data-action="create" ${disabled ? 'disabled' : ''}>${busy === 'room' ? '<span class="spinner"></span> Conectando…' : '+  Criar sala'}</button></article><article class="start-card join-card"><h2>Entrar com código</h2><form id="join-form"><label class="sr-only" for="room-code">Código da sala com 8 caracteres</label><div class="join-input join-form"><input class="text-input" id="room-code" aria-label="Código da sala com 8 caracteres" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" placeholder="Código da sala" value="${escape(joinCode)}" ${busy ? 'disabled' : ''}><button type="submit" class="join-button button secondary" aria-label="Entrar na sala" ${disabled ? 'disabled' : ''}>→</button></div></form><span class="field-help">8 caracteres</span></article></div><footer class="home-credit"><span>Criado por Pretágoras</span><span>Sem Janja, apenas transmissão.</span></footer></section>`;
}

function renderSettingsPage(): string {
  const qualityControls = renderQualityPanel().replace(
    /(id|for|aria-labelledby|aria-describedby)="(quality-heading|quality-preset|content-mode|preferred-codec|adaptive-quality|upload-budget(?:-help)?|video-bitrate(?:-help)?)/g,
    (_, attribute: string, id: string) => `${attribute}="settings-${id}`,
  );
  return renderSettingsView({
    config,
    update,
    serverUrl: settingUrl,
    connected: !!room,
    disabled:
      !api ||
      !loaded ||
      !!busy ||
      applyingPreferences ||
      (!!room && room.role !== 'host'),
    saving: busy === 'settings',
    testing: testingConnection,
    connectionStatus: room
      ? signalRecovering
        ? 'Reconectando'
        : 'Conectado à sala'
      : connectionCheck || 'Não testado',
    qualityControls,
  });
}

function toggleSidebar(): void {
  sidebarCollapsed = !sidebarCollapsed;
  try {
    localStorage.setItem(
      'discorja.sidebar-collapsed',
      String(sidebarCollapsed),
    );
  } catch {
    /* Session preference only. */
  }
  // Resize the shell without rebuilding or detaching either media player.
  root
    .querySelector('.app-shell')
    ?.classList.toggle('is-collapsed', sidebarCollapsed);
  const brand = root.querySelector<HTMLButtonElement>('.brand-logo');
  if (brand) {
    brand.dataset.action = sidebarCollapsed ? 'toggle-sidebar' : 'home';
    brand.setAttribute(
      'aria-label',
      sidebarCollapsed ? 'Expandir menu' : 'Discorja · Início',
    );
    brand.title = sidebarCollapsed ? 'Expandir menu' : 'Início';
    if (sidebarCollapsed) {
      brand.setAttribute('aria-expanded', 'false');
      brand.setAttribute('aria-controls', 'main-navigation');
    } else {
      brand.removeAttribute('aria-expanded');
      brand.removeAttribute('aria-controls');
    }
  }
  root
    .querySelector<HTMLButtonElement>(
      sidebarCollapsed ? '.brand-logo' : '.sidebar-toggle',
    )
    ?.focus();
}

async function testConnection(): Promise<void> {
  if (!api || busy || room || testingConnection) return;
  let candidate: URL;
  try {
    candidate = new URL(settingUrl.trim());
    if (
      !['ws:', 'wss:'].includes(candidate.protocol) ||
      (candidate.protocol === 'ws:' &&
        !['127.0.0.1', 'localhost'].includes(candidate.hostname)) ||
      candidate.username ||
      candidate.password ||
      candidate.hash
    )
      throw Error();
  } catch {
    notify(
      'Use wss:// para servidores públicos ou ws://127.0.0.1:8787 para o servidor local.',
      'error',
    );
    return;
  }
  const testedUrl = settingUrl;
  testingConnection = true;
  connectionCheck = 'Testando…';
  render();
  const probe = new SignalConnection(
    candidate.toString(),
    () => undefined,
    () => undefined,
  );
  try {
    await probe.connect(5000);
    if (settingUrl === testedUrl) connectionCheck = 'Servidor disponível';
  } catch {
    if (settingUrl === testedUrl) connectionCheck = 'Conexão falhou';
  } finally {
    probe.disconnect();
    testingConnection = false;
    render();
  }
}

function renderRoomV2(): string {
  if (!room || !roomState) return '';
  const publisher = room.role === 'host';
  const owner = roomState.ownerId === room.selfId;
  const self = roomState.participants.find(
    (member) => member.peerId === room!.selfId,
  )!;
  const moderate = owner || self.role === 'moderator';
  const stream = publisher ? localStream : remoteStream;
  const isLive = publisher ? sharing : remoteSharing;
  const people = roomState.participants
    .map((member) => {
      const canRemove =
        moderate &&
        member.peerId !== room!.selfId &&
        member.role !== 'owner' &&
        (owner || member.role !== 'moderator');
      return `<div class="person"><span class="avatar">${escape(member.name.charAt(0).toUpperCase())}</span><div><strong>${escape(member.name)}${member.peerId === room!.selfId ? ' <span>(você)</span>' : ''}</strong><small>${member.role === 'owner' ? 'Dono da sala' : member.role === 'moderator' ? 'Moderador' : 'Participante'}${member.peerId === roomState!.publisherId ? ' · Pode transmitir' : ''}${!member.connected ? ' · Reconectando' : ''}</small></div><div class="participant-actions">${moderate && member.connected && member.peerId !== roomState!.publisherId ? `<button class="button subtle" data-action="set-publisher" data-peer="${escape(member.peerId)}" aria-label="Permitir transmissão de ${escape(member.name)}">Permitir tela</button>` : ''}${owner && member.role !== 'owner' ? `<button class="button subtle" data-action="set-moderator" data-peer="${escape(member.peerId)}" data-enabled="${member.role !== 'moderator'}" aria-label="${member.role === 'moderator' ? 'Retirar moderação de' : 'Tornar moderador'} ${escape(member.name)}">${member.role === 'moderator' ? 'Retirar moderação' : 'Moderar'}</button>` : ''}${canRemove ? `<button class="icon-button remove-button" data-action="kick" data-peer="${escape(member.peerId)}" aria-label="Remover ${escape(member.name)} da sala">${icon('close')}</button>` : ''}</div></div>`;
    })
    .join('');
  return `<section class="room-header"><div><span class="eyebrow">${owner ? 'SUA SALA' : 'SALA POR CONVITE'}</span><h1>${escape(roomState.name)}</h1><p>${publisher ? 'Você pode escolher uma tela para compartilhar.' : `${escape(room.hostName)} pode iniciar a transmissão.`}</p></div><div class="audio-actions"><button class="button subtle" data-action="rooms">${icon('users')} Salas</button><button class="button subtle danger-text" data-action="leave">${icon('exit')}${owner ? 'Encerrar sala' : 'Sair da sala'}</button></div></section>
  <div class="room-grid"><section class="broadcast-panel" aria-label="${publisher ? 'Compartilhamento de tela' : 'Transmissão'}"><div class="broadcast-heading"><div class="host-label"><span class="avatar">${escape(room.hostName.charAt(0).toUpperCase())}</span><div><strong>${publisher ? 'Sua transmissão' : escape(room.hostName)}</strong><small>${publisher ? 'Permissão para transmitir' : 'Transmissor da sala'}</small></div></div><span class="status-pill ${isLive ? 'live' : ''}"><i></i>${isLive ? 'AO VIVO' : 'EM ESPERA'}</span></div><div class="video-stage ${stream ? 'has-video' : ''}">${stream ? '<video id="stream-video" autoplay playsinline muted aria-label="Vídeo da tela compartilhada"></video>' : `<div class="empty-stream"><div class="empty-screen-icon">${icon('screen')}</div><h2>${publisher ? 'Tudo pronto para compartilhar.' : 'Aguardando a transmissão.'}</h2><p>${publisher ? 'A captura só começa quando você escolhe e inicia.' : 'Uma pessoa transmite por vez nesta versão.'}</p>${publisher ? `<button class="button primary" data-action="choose-source" ${busy ? 'disabled' : ''}>${icon('screen')} Escolher o que compartilhar</button>` : ''}</div>`}</div><div class="broadcast-controls"><span>${icon('screen')}<span>${escape(publisher && sharing ? sharedSourceName : 'Tela compartilhada')}</span></span>${publisher && sharing ? `<button class="button stop-button" data-action="stop">${icon('stop')} Parar de compartilhar</button>` : !publisher && stream ? `<button class="button subtle" data-action="fullscreen">${icon('expand')} Tela cheia</button>` : ''}</div></section>
  <aside class="room-sidebar"><section class="invite-card"><div class="mini-heading">${icon('lock')} SALA POR CONVITE</div><h2>Chame sua turma.</h2><div class="room-code" aria-label="Código da sala">${escape(room.code.slice(0, 4))}<span></span>${escape(room.code.slice(4))}</div><button class="button secondary wide" data-action="copy">${icon('copy')} Copiar código</button><small>Todos devem usar o mesmo servidor e uma versão compatível.</small></section><section class="people-card"><div class="section-heading"><h2>Na sala</h2><span>${roomState.participants.length}/${roomState.maxParticipants}</span></div>${people}</section><div class="room-note">${icon('shield')}<p>O dono administra a sala. Autorizar uma tela não inicia a captura. Ao sair, o dono encerra esta sala.</p></div></aside></div>
  ${connectionIssue ? `<div class="connection-alert" role="alert"><p>${escape(connectionIssue)}</p><button class="button subtle" data-action="rejoin">Entrar novamente</button></div>` : ''}${publisher && sharing ? '<div class="sharing-reminder">Sua tela está sendo transmitida.</div>' : ''}`;
}

function renderRoom(): string {
  if (!room) return '';
  const multi = multiState();
  if (multi)
    return renderStage({
      state: multi,
      watching: watching?.publicationId ?? null,
      sharing,
      hasRemote: !!remoteStream,
      hasLocal: !!localStream,
      busy: !!busy || applyingPreferences || signalRecovering,
      issue: connectionIssue,
      recovering: connectionReconnecting || signalRecovering,
      audioControl: renderAudioToggleButton(),
      playerAudioControl: renderReceiveAudioControls(),
    });
  if (roomState) return renderRoomV2();
  const host = room.role === 'host';
  const hasVideo = host ? !!localStream : !!remoteStream;
  const isLive = host ? sharing : remoteSharing;
  const initial = room.hostName.charAt(0).toLocaleUpperCase('pt-BR') || '?';
  return `<section class="room-header"><div><span class="eyebrow">${host ? 'SUA SALA, SEU MOMENTO' : 'BOM TER VOCÊ POR AQUI'}</span><h1>${host ? 'A turma tem um lugar.' : `Sala de ${escape(room.hostName)}`}</h1><p>${host ? 'Convide seus amigos. O resto acontece junto.' : 'Sente, acompanhe e aproveite a companhia.'}</p></div><button class="button subtle danger-text" data-action="leave">${icon('exit')}${host ? 'Encerrar sala' : 'Sair da sala'}</button></section>
  <div class="room-grid"><section class="broadcast-panel" aria-label="${host ? 'Compartilhamento de tela' : 'Transmissão'}"><div class="broadcast-heading"><div class="host-label"><span class="avatar">${escape(initial)}</span><div><strong>${host ? 'Sua transmissão' : escape(room.hostName)}</strong><small>${host ? 'Você é o anfitrião' : 'Anfitrião da sala'}</small></div></div><span class="status-pill ${isLive ? 'live' : ''}"><i></i>${isLive ? (host ? 'TRANSMITINDO' : hasVideo ? 'AO VIVO' : 'CONECTANDO') : 'EM ESPERA'}</span></div>
  <div class="video-stage ${hasVideo ? 'has-video' : ''}">${hasVideo ? '<video id="stream-video" autoplay playsinline muted aria-label="Vídeo da tela compartilhada"></video>' : `<div class="empty-stream"><div class="empty-screen-icon">${icon(connectionIssue ? 'network' : 'screen')}<span>${icon(host ? 'plus' : 'users')}</span></div><h2>${host ? 'Tudo pronto para compartilhar.' : connectionIssue ? 'Vamos tentar de novo?' : remoteSharing ? 'Preparando a conexão…' : 'O encontro já começou.'}</h2><p>${host ? 'Escolha uma janela ou uma tela.<br>Seus amigos verão apenas o que você selecionar.' : connectionIssue ? 'A conexão entre os computadores precisa de atenção.' : remoteSharing ? 'Conectando você à tela do anfitrião.' : `${escape(room.hostName)} ainda não está transmitindo.<br>Assim que começar, a tela aparece aqui.`}</p>${host ? `<button class="button primary" data-action="choose-source" ${busy ? 'disabled' : ''}>${icon('screen')} Escolher o que compartilhar</button>` : `<span class="waiting-label">${connectionIssue ? icon('alert') : '<span class="pulse-dot"></span>'}${connectionIssue ? 'Conexão interrompida' : remoteSharing ? 'Estabelecendo conexão direta' : 'Aguardando o anfitrião'}</span>`}</div>`}</div>
  <div class="broadcast-controls"><span>${icon('screen')}<span>${hasVideo ? escape(host ? sharedSourceName : 'Tela compartilhada') : 'Vídeo compartilhado · sem áudio'}</span></span>${host && sharing ? `<button class="button stop-button" data-action="stop">${icon('stop')} Parar de compartilhar</button>` : !host && hasVideo ? `<button class="button subtle" data-action="fullscreen">${icon('expand')} Tela cheia</button>` : `<span class="quiet-label">${host ? 'A captura só começa com você.' : 'A sala continua aberta.'}</span>`}</div></section>
  <aside class="room-sidebar"><section class="invite-card"><div class="mini-heading">${icon('lock')} SALA PRIVADA</div><h2>${host ? 'Chame quem importa.' : 'Você está na sala.'}</h2><p>${host ? 'Envie o código para seus amigos.' : 'Este é o código do seu encontro.'}</p><div class="room-code" aria-label="Código da sala">${escape(room.code.slice(0, 4))}<span></span>${escape(room.code.slice(4))}</div><button class="button secondary wide" data-action="copy">${icon('copy')} Copiar código</button><small>Todos devem usar o mesmo servidor.</small></section>
  <section class="people-card"><div class="section-heading"><h2>Na sala</h2><span>${host ? `${viewers.size + 1}/${room.maxViewers + 1}` : 'Você + anfitrião'}</span></div><div class="person"><span class="avatar">${escape(initial)}</span><div><strong>${escape(room.hostName)}${host ? ' <span>(você)</span>' : ''}</strong><small><span class="online-dot"></span>Anfitrião</small></div><span class="host-crown" aria-label="Anfitrião">✦</span></div>${host ? [...viewers].map(([id, viewer]) => `<div class="person"><span class="avatar viewer-avatar">${escape(viewer.name.charAt(0).toLocaleUpperCase('pt-BR'))}</span><div><strong>${escape(viewer.name)}</strong><small class="${viewer.failed ? 'failed-text' : ''}">${viewer.failed ? 'Falha de vídeo · reinicie a transmissão' : !sharing ? 'Na sala' : viewer.connected ? 'Assistindo agora' : 'Conectando ao vídeo…'}</small></div><button class="icon-button remove-button" data-action="kick" data-peer="${escape(id)}" title="Remover ${escape(viewer.name)}" aria-label="Remover ${escape(viewer.name)} da sala">${icon('close')}</button></div>`).join('') : `<div class="person"><span class="avatar viewer-avatar">${escape(displayName.charAt(0).toLocaleUpperCase('pt-BR'))}</span><div><strong>${escape(displayName)} <span>(você)</span></strong><small>Espectador</small></div></div>`}${host && !viewers.size ? `<div class="empty-people">${icon('users')}<p>Tem espaço para a sua turma.<br>Compartilhe o código para começar.</p></div>` : ''}</section><div class="room-note">${icon('shield')}<p>${host ? `Até ${room.maxViewers} amigos podem assistir. Cada conexão usa a internet do seu computador.` : 'O anfitrião controla a transmissão e pode encerrá-la a qualquer momento.'}</p></div></aside></div>
  ${connectionIssue ? `<div class="connection-alert" role="alert">${icon('alert')}<p>${escape(connectionIssue)}</p><button class="button subtle" data-action="rejoin">${icon('refresh')} Entrar novamente</button></div>` : ''}
  ${host && sharing ? `<div class="sharing-reminder">${icon('screen')} Sua tela está sendo transmitida. Tudo que aparecer na área escolhida poderá ser visto.</div>` : ''}`;
}

function renderModal(): string {
  if (!modal) return '';
  if (modal === 'switch')
    return `<div class="modal-overlay"><section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">Trocar de sala?</h2><p class="modal-description">A transmissão e a reprodução atuais serão encerradas antes de conectar à próxima sala.${roomState?.ownerId === room?.selfId ? ' Como você é o dono, a sala atual será encerrada para todos.' : ''} A próxima conexão pode falhar; nenhuma captura será reiniciada automaticamente.</p><div class="modal-footer"><button class="button subtle" data-action="cancel-switch">Continuar nesta sala</button><button class="button primary" data-action="confirm-switch">Trocar de sala</button></div></section></div>`;
  if (modal === 'rooms')
    return `<div class="modal-overlay"><section class="modal settings-modal rooms-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">Suas salas</h2><button class="icon-button" data-action="close-modal" aria-label="Fechar salas">${icon('close')}</button></div><p class="modal-description">Uma sala ativa por vez. Os convites salvos não recebem vídeo, áudio ou atualizações em segundo plano.</p><form id="new-room-form"><label class="field-label" for="new-room-name">Nome da nova sala</label><input class="text-input" id="new-room-name" maxlength="40" value="${escape(roomName)}" placeholder="Sala da turma"><button class="button primary" type="submit">Criar outra sala</button></form><form id="switch-room-form"><label class="field-label" for="switch-room-code">Entrar por código</label><input class="text-input" id="switch-room-code" maxlength="9" value="${escape(joinCode)}" autocomplete="off"><button class="button secondary" type="submit">Entrar nesta sala</button></form><h3>Convites recentes neste servidor</h3><div class="known-rooms">${
      savedRooms
        .filter((entry) => entry.server === config.signalingUrl)
        .map(
          (entry) =>
            `<div class="known-room"><div><strong>${escape(entry.name)}</strong><small>${escape(entry.code)}${room?.code === entry.code ? ' · Ativa' : ' · Disponibilidade não verificada'}</small></div><button class="button subtle" data-action="open-known-room" data-code="${entry.code}">${room?.code === entry.code ? 'Voltar à sala' : 'Entrar'}</button><button class="icon-button" data-action="forget-room" data-code="${entry.code}" aria-label="Esquecer ${escape(entry.name)}">${icon('close')}</button></div>`,
        )
        .join('') || '<p>Nenhum convite salvo neste servidor.</p>'
    }</div></section></div>`;
  if (modal === 'update')
    return `<div class="modal-overlay"><section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">${update.status === 'downloaded' ? 'Atualização pronta' : 'Atualização disponível'}</h2></div><p class="modal-description">Versão instalada: ${escape(config.version)}. Nova versão: ${escape(update.version ?? 'disponível')}.</p><p role="status">${update.status === 'downloading' ? `Baixando… ${Math.round(update.percent ?? 0)}%` : update.status === 'error' ? escape(update.message ?? 'Falha ao atualizar. Tente novamente nas configurações.') : update.status === 'downloaded' ? 'O aplicativo será reiniciado para instalar.' : 'Uma nova versão do Discorja está disponível.'}</p>${room ? '<p class="settings-warning">Reiniciar encerrará sua participação e qualquer transmissão ativa.</p>' : ''}<div class="modal-footer"><button class="button subtle" data-action="defer-update">Depois</button>${update.status === 'downloaded' ? '<button class="button primary" data-action="confirm-install-update">Reiniciar e atualizar</button>' : update.status === 'available' ? '<button class="button primary" data-action="download-update">Atualizar agora</button>' : ''}</div></section></div>`;
  if (modal === 'diagnostics')
    return `<div class="modal-overlay diagnostics-overlay"><section class="modal diagnostics-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">Diagnóstico da conexão</h2><button class="icon-button" data-action="close-modal" aria-label="Fechar diagnóstico">${icon('close')}</button></div><div class="diagnostics-modal-content">${renderDiagnostics()}</div></section></div>`;
  if (modal === 'sources') {
    const renderSource = (source: CaptureSource, index: number) =>
      `<button id="source-${index}" class="source-option ${selectedSource === source.id ? 'selected' : ''}" data-action="select-source" data-source="${escape(source.id)}" aria-pressed="${selectedSource === source.id}" ${busy === 'capture' ? 'disabled' : ''}><div class="source-thumbnail">${source.thumbnail ? `<img src="${escape(source.thumbnail)}" alt="Prévia de ${escape(source.name)}">` : icon(source.kind === 'screen' ? 'screen' : 'window')}<span class="source-check">${icon('check')}</span></div><span class="source-name">${icon(source.kind === 'screen' ? 'screen' : 'window')}<span>${escape(source.name)}</span></span></button>`;
    const screens = sources
      .map((source, index) => ({ source, index }))
      .filter(({ source }) => source.kind === 'screen');
    const windows = sources
      .map((source, index) => ({ source, index }))
      .filter(({ source }) => source.kind === 'window');
    const visibleSources = sourcePage === 'screen' ? screens : windows;
    const tabId =
      sourcePage === 'screen' ? 'source-tab-screen' : 'source-tab-guides';
    const sourceItems = visibleSources.length
      ? `<div class="source-grid">${visibleSources.map(({ source, index }) => renderSource(source, index)).join('')}</div>`
      : `<div class="source-empty">Nenhuma ${sourcePage === 'screen' ? 'tela' : 'guia'} disponível.</div>`;
    return `<div class="modal-overlay" data-scroll-preserve="source-overlay"><section class="modal source-modal" data-scroll-preserve="source-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">Compartilhar</h2><button class="icon-button" data-action="cancel-sources" aria-label="Fechar">${icon('close')}</button></div><div class="source-tabs" role="tablist" aria-label="Tipo de compartilhamento"><button id="source-tab-screen" class="source-tab" role="tab" aria-selected="${sourcePage === 'screen'}" aria-controls="source-panel" tabindex="${sourcePage === 'screen' ? '0' : '-1'}" data-action="source-tab" data-source-kind="screen" ${busy ? 'disabled' : ''}>Tela</button><button id="source-tab-guides" class="source-tab" role="tab" aria-selected="${sourcePage === 'window'}" aria-controls="source-panel" tabindex="${sourcePage === 'window' ? '0' : '-1'}" data-action="source-tab" data-source-kind="window" ${busy ? 'disabled' : ''}>Guias</button></div>${busy === 'sources' ? '<div class="source-loading"><span class="spinner"></span> Carregando…</div>' : `<div id="source-panel" class="source-groups" data-scroll-preserve="source-groups" role="tabpanel" aria-labelledby="${tabId}">${sourceItems}</div>`}<div class="source-audio-slot"></div><div class="modal-footer"><button class="button subtle" data-action="refresh-sources" ${busy ? 'disabled' : ''}>Atualizar</button><button class="button primary" data-action="start-share" ${!selectedSource || busy ? 'disabled' : ''}>${busy === 'capture' ? '<span class="spinner"></span> Iniciando…' : 'Iniciar'}</button></div></section></div>`;
  }
  return '';
}

function render(): void {
  if (
    loaded &&
    !modal &&
    !busy &&
    !updateDismissed &&
    !updatePrompted &&
    ['available', 'downloaded'].includes(update.status)
  ) {
    modal = 'update';
    updatePrompted = true;
  }
  const oldVideo = root.querySelector<HTMLVideoElement>('#stream-video');
  const oldPreview = root.querySelector<HTMLVideoElement>('#local-preview');
  const nextStream = multiState()
    ? watching
      ? remoteStream
      : localStream
    : room?.role === 'host'
      ? localStream
      : remoteStream;
  const keepVideo =
    !!oldVideo && !!nextStream && oldVideo.srcObject === nextStream;
  // Detaching a fullscreen element exits fullscreen. Defer structural updates until the user exits.
  if (keepVideo && document.fullscreenElement === oldVideo) {
    deferredRender = true;
    patchMetrics();
    return;
  }
  deferredRender = false;
  const interaction = rememberInteraction(root);
  const scrollPositions = new Map(
    [...root.querySelectorAll<HTMLElement>('[data-scroll-preserve]')].map(
      (element) => [
        element.dataset.scrollPreserve!,
        [element.scrollTop, element.scrollLeft] as const,
      ],
    ),
  );
  const hadModal = !!root.querySelector('[role="dialog"]');
  const currentPage = activePage === 'room' && !room ? 'home' : activePage;
  const title = currentPage === 'settings' ? 'Configurações' : 'Início';
  const connection = room
    ? signalRecovering
      ? 'Reconectando'
      : 'Conectado'
    : 'Pronto para conectar';
  root.innerHTML = `<div class="app-shell ${sidebarCollapsed ? 'is-collapsed' : ''}"><a class="skip-link" href="#main-content">Ir para o conteúdo</a>${renderSidebar(currentPage, sidebarCollapsed, displayName, config.version)}<div class="main-shell"><main id="main-content" class="app-main ${currentPage}-main" tabindex="-1">${currentPage !== 'room' ? `<header class="page-heading"><h1>${title}</h1><span class="connection-badge ${room && !signalRecovering ? 'connected' : ''}">${connection}</span></header>` : ''}${!api ? '<div class="preview-notice">Prévia da interface. Abra o aplicativo desktop para compartilhar sua tela.</div>' : ''}${notice ? `<div class="notice ${notice.kind}" role="${notice.kind === 'error' ? 'alert' : 'status'}" aria-live="${notice.kind === 'error' ? 'assertive' : 'polite'}">${icon(notice.kind === 'error' ? 'alert' : notice.kind === 'success' ? 'check' : 'network')}<span>${escape(notice.text)}</span><button class="icon-button" data-action="dismiss" aria-label="Dispensar aviso">${icon('close')}</button></div>` : ''}<section class="home-page" ${currentPage !== 'home' ? 'hidden' : ''}>${renderHome()}</section>${currentPage === 'settings' ? renderSettingsPage() : ''}<section id="room-view" ${currentPage !== 'room' ? 'hidden' : ''}>${room ? renderRoom() : ''}</section></main></div></div>${renderModal()}`;
  const panel = root.querySelector<HTMLElement>('.broadcast-panel');
  if (panel && room) {
    if (!multiState()) {
      panel
        .querySelector('.video-stage')
        ?.insertAdjacentHTML('beforeend', diagnosticsTrigger());
      panel
        .querySelector('.video-stage')
        ?.insertAdjacentHTML('beforeend', renderReceiveAudioControls());
      panel
        .querySelector('.broadcast-controls')
        ?.insertAdjacentHTML('beforeend', renderAudioToggleButton());
    }
    const chooseButton = panel.querySelector<HTMLButtonElement>(
      '[data-action="choose-source"]',
    );
    const publicationState = multiState();
    if (chooseButton)
      chooseButton.disabled =
        !!busy ||
        applyingPreferences ||
        signalRecovering ||
        (!!publicationState &&
          !sharing &&
          publicationState.publications.length >=
            publicationState.maxPublishers);
    if (connectionReconnecting && room.role === 'viewer' && remoteStream) {
      const banner = document.createElement('div');
      banner.className = 'video-reconnecting';
      banner.textContent = 'Reconectando ao vídeo…';
      panel.querySelector('.video-stage')?.append(banner);
      const status = panel.querySelector<HTMLElement>('.status-pill');
      if (status?.lastChild) status.lastChild.textContent = 'RECONECTANDO';
    }
    if (!nextStream && !multiState()) {
      const sourceLabel = panel.querySelector(
        '.broadcast-controls > span:first-child > span',
      );
      if (sourceLabel)
        sourceLabel.textContent =
          room.role === 'host'
            ? `Perfil ${QUALITY_PRESETS[preferences.preset].label} · sem áudio`
            : 'Vídeo compartilhado · sem áudio';
    }
  }
  if (modal === 'sources') {
    const options = document.createElement('div');
    options.className = 'audio-capture-options';
    options.innerHTML = `<label><input id="include-system-audio" type="checkbox" ${includeSystemAudio ? 'checked' : ''} ${!config.systemAudioSupported || busy ? 'disabled' : ''}> Áudio do computador</label>${!config.systemAudioSupported ? '<small>Disponível no Windows.</small>' : ''}${includeSystemAudio ? `<label><input id="exclude-discord-audio" type="checkbox" ${excludeDiscordAudio ? 'checked' : ''} ${busy ? 'disabled' : ''}> Excluir o Discord</label>${excludeDiscordAudio ? '<small>Você continuará ouvindo a call.</small>' : '<p class="settings-warning">O áudio inclui o Discord e outros aplicativos.</p>'}` : ''}`;
    root.querySelector('.source-audio-slot')?.replaceWith(options);
  }
  const shell = root.querySelector<HTMLElement>('.app-shell');
  if (shell) shell.inert = !!modal;
  const placeholder = root.querySelector<HTMLVideoElement>('#stream-video');
  if (keepVideo && oldVideo && placeholder) {
    placeholder.replaceWith(oldVideo);
  } else if (placeholder && nextStream) {
    placeholder.srcObject = nextStream;
    void placeholder.play().catch(() => undefined);
  }
  if (!keepVideo && oldVideo) oldVideo.srcObject = null;
  const previewPlaceholder =
    root.querySelector<HTMLVideoElement>('#local-preview');
  if (previewPlaceholder && oldPreview && oldPreview.srcObject === localStream)
    previewPlaceholder.replaceWith(oldPreview);
  if (oldPreview && !root.contains(oldPreview)) {
    oldPreview.pause();
    oldPreview.srcObject = null;
  }
  updatePlayback();
  syncPreviews();
  patchMetrics();
  restoreInteraction(root, interaction, !!modal);
  if (modal && !document.activeElement?.closest('[role="dialog"]'))
    focusable(root.querySelector<HTMLElement>('[role="dialog"]')!)[0]?.focus();
  if (!modal && hadModal)
    root
      .querySelector<HTMLElement>(
        `[data-action="${returnFocusAction}"], [data-action="settings"]`,
      )
      ?.focus();
  for (const element of root.querySelectorAll<HTMLElement>(
    '[data-scroll-preserve]',
  )) {
    const position = scrollPositions.get(element.dataset.scrollPreserve ?? '');
    if (position) {
      element.scrollTop = position[0];
      element.scrollLeft = position[1];
    }
  }
  const message =
    connectionIssue && watching
      ? connectionIssue
      : (notice?.text ??
        (signalRecovering
          ? 'Reconectando à sala.'
          : room
            ? `${sharing ? 'Você está compartilhando sua tela. ' : ''}${watching ? (connectionReconnecting ? 'Recuperando a transmissão escolhida.' : remoteStream ? 'Recebendo a transmissão escolhida.' : 'Conectando à transmissão escolhida.') : 'Nenhuma transmissão selecionada.'}`
            : 'Pronto para entrar ou criar uma sala.'));
  if (announcements.textContent !== message)
    announcements.textContent = message;
}

root.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id === 'display-name') displayName = target.value;
  if (target.id === 'room-code') {
    joinCode = target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8);
    target.value = joinCode;
  }
  if (target.id === 'signaling-url') {
    settingUrl = target.value;
    connectionCheck = '';
  }
  if (target.id === 'new-room-name') roomName = target.value;
  if (target.id === 'receive-volume') {
    receiveVolume = Number(target.value) / 100;
    receiveMuted = receiveVolume === 0;
    const output = root.querySelector<HTMLOutputElement>(
      '#receive-volume-value',
    );
    if (output) output.value = `${target.value}%`;
    updatePlayback();
    const muteButton = root.querySelector<HTMLButtonElement>(
      '[data-action="toggle-receive-audio"]',
    );
    if (muteButton) {
      const muted = receiveMuted;
      muteButton.setAttribute('aria-pressed', String(!muted));
      muteButton.setAttribute(
        'aria-label',
        muted
          ? 'Ativar o áudio da transmissão'
          : 'Silenciar o áudio da transmissão',
      );
      muteButton.title = muted
        ? 'Ativar o áudio da transmissão'
        : 'Silenciar o áudio da transmissão';
      muteButton.innerHTML = icon(muted ? 'volume-muted' : 'volume');
    }
  }
  if (target.id === 'switch-room-code') {
    joinCode = target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8);
    target.value = joinCode;
  }
});

root.addEventListener('submit', (event) => {
  event.preventDefault();
  if ((event.target as HTMLElement).id === 'profile-form') {
    const name = displayName.trim();
    if (!name || name.length > 32) {
      notify('Digite seu nome com até 32 caracteres.', 'error');
      root.querySelector<HTMLInputElement>('#display-name')?.focus();
      return;
    }
    try {
      localStorage.setItem('discorja.name', name);
    } catch {
      /* Session still uses this name. */
    }
    editingName = false;
    render();
    notify('Nome atualizado.', 'success', true);
    return;
  }
  if ((event.target as HTMLElement).id === 'join-form') {
    if (room) requestRoomSwitch({ kind: 'join', code: joinCode });
    else void connectRoom('join');
  }
  if ((event.target as HTMLElement).id === 'settings-form') void saveSettings();
  if ((event.target as HTMLElement).id === 'new-room-form')
    requestRoomSwitch({ kind: 'create', name: roomName });
  if ((event.target as HTMLElement).id === 'switch-room-form') {
    if (!/^[A-Z0-9]{8}$/.test(joinCode)) {
      notify('Digite os oito caracteres do convite.', 'error');
      return;
    }
    requestRoomSwitch({ kind: 'join', code: joinCode });
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  if (!(
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement
  ))
    return;
  if (target.id.startsWith('settings-')) {
    void applyPreferences(
      readQualityControls(target.id === 'settings-video-bitrate', 'settings-'),
    );
    return;
  }
  if (
    target instanceof HTMLInputElement &&
    target.id === 'include-system-audio'
  ) {
    includeSystemAudio = target.checked && config.systemAudioSupported;
    excludeDiscordAudio = false;
    render();
  }
  if (
    target instanceof HTMLInputElement &&
    target.id === 'exclude-discord-audio'
  ) {
    excludeDiscordAudio = target.checked;
    render();
  }
  if (
    [
      'quality-preset',
      'content-mode',
      'preferred-codec',
      'adaptive-quality',
      'upload-budget',
      'video-bitrate',
    ].includes(target.id)
  )
    void applyPreferences(readQualityControls(target.id === 'video-bitrate'));
});

root.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    'button[data-action]',
  );
  if (!button || button.disabled) return;
  switch (button.dataset.action) {
    case 'watch-screen':
      if (button.dataset.publication)
        selectPublication(
          button.dataset.publication === watching?.publicationId
            ? null
            : button.dataset.publication,
        );
      break;
    case 'preview-own':
    case 'stop-watching':
      selectPublication(null);
      break;
    case 'retry-watching':
      if (watching) selectPublication(watching.publicationId);
      break;
    case 'stop-publication':
      if (button.dataset.peer)
        send({ type: 'stop-publication', peerId: button.dataset.peer });
      break;
    case 'rooms':
      if (room && activePage !== 'room') {
        activePage = 'room';
        modal = null;
        render();
        break;
      }
    case 'manage-rooms':
      returnFocusAction = 'rooms';
      if (!busy && !signalRecovering) {
        modal = 'rooms';
        render();
      }
      break;
    case 'show-diagnostics':
      returnFocusAction = 'show-diagnostics';
      modal = 'diagnostics';
      render();
      break;
    case 'cancel-switch':
      switchTarget = null;
      modal = 'rooms';
      render();
      break;
    case 'confirm-switch':
      void confirmRoomSwitch();
      break;
    case 'open-known-room':
      requestRoomSwitch({ kind: 'join', code: button.dataset.code });
      break;
    case 'forget-room':
      savedRooms = savedRooms.filter(
        (entry) =>
          entry.server !== config.signalingUrl ||
          entry.code !== button.dataset.code,
      );
      saveKnownRooms();
      render();
      break;
    case 'set-publisher':
      if (button.dataset.peer)
        send({ type: 'set-publisher', peerId: button.dataset.peer });
      break;
    case 'set-moderator':
      if (button.dataset.peer)
        send({
          type: 'set-moderator',
          peerId: button.dataset.peer,
          enabled: button.dataset.enabled === 'true',
        });
      break;
    case 'toggle-send-audio': {
      if (room?.role !== 'host' || !sharing) break;
      const tracks = liveAudio(localStream);
      const enable = tracks.every((track) => !track.enabled);
      for (const track of tracks) track.enabled = enable;
      render();
      break;
    }
    case 'toggle-receive-audio': {
      if (
        multiState()
          ? !watching ||
            (liveAudio(localStream).length > 0 && !filteredAudioPipeline)
          : room?.role !== 'viewer'
      )
        break;
      receiveMuted = !receiveMuted;
      if (!receiveMuted && receiveVolume === 0) receiveVolume = 0.8;
      render();
      const video = root.querySelector<HTMLVideoElement>('#stream-video');
      if (video && !receiveMuted)
        void video.play().catch(() => {
          receiveMuted = true;
          notify(
            'Não foi possível reproduzir o som. Clique em ouvir para tentar novamente.',
            'error',
          );
        });
      break;
    }
    case 'export-diagnostics':
      void api
        ?.exportDiagnostics({
          preferences,
          metrics: [...latestMetrics, ...incomingMetrics]
            .filter((metric) => Date.now() - metric.timestamp <= 8000)
            .map((metric) => ({
              ...metric,
              ageMs: Math.max(0, Date.now() - metric.timestamp),
            })),
          session: {
            signaling: signalRecovering
              ? 'recovering'
              : room
                ? 'connected'
                : busy === 'room'
                  ? 'connecting'
                  : 'idle',
            publishing: sharing,
            watching: Boolean(watching),
            publications:
              multiState()?.publications.length ?? (sharing ? 1 : 0),
            participants: roomState?.participants.length ?? 0,
          },
        })
        .catch(() => notify('Não foi possível salvar o diagnóstico.', 'error'));
      break;
    case 'export-logs':
      void api
        ?.exportLogs()
        .then((saved) => {
          if (saved)
            notify(
              'Logs salvos. Eles incluem os eventos anteriores à queda.',
              'success',
            );
        })
        .catch(() =>
          notify(
            'Não foi possível salvar os logs. Confira o espaço em disco e tente novamente.',
            'error',
          ),
        );
      break;
    case 'defer-update':
      updateDismissed = true;
      modal = null;
      render();
      break;
    case 'download-update':
      void api
        ?.downloadUpdate()
        .catch(() => notify('Falha ao baixar a atualização.', 'error'));
      break;
    case 'confirm-install-update':
      leaveRoom();
      void api
        ?.setSharing(false)
        .then(() => api.installUpdate())
        .catch(() =>
          notify('Não foi possível instalar a atualização.', 'error'),
        );
      break;
    case 'create':
      if (room) requestRoomSwitch({ kind: 'create', name: roomName });
      else void connectRoom('create');
      break;
    case 'toggle-sidebar':
      toggleSidebar();
      break;
    case 'test-connection':
      void testConnection();
      break;
    case 'edit-name':
      activePage = 'home';
      editingName = true;
      modal = null;
      render();
      root.querySelector<HTMLInputElement>('#display-name')?.focus();
      break;
    case 'home':
      activePage = 'home';
      modal = null;
      render();
      break;
    case 'settings':
      if (!busy) {
        if (activePage !== 'settings') previousPage = activePage;
        activePage = 'settings';
        modal = null;
        returnFocusAction = 'settings';
        notice = null;
        settingUrl = config.signalingUrl;
        connectionCheck = '';
        render();
      }
      break;
    case 'close-settings':
      if (!busy) {
        activePage = previousPage === 'room' && !room ? 'home' : previousPage;
        render();
        root
          .querySelector<HTMLButtonElement>('[data-action=settings]')
          ?.focus();
      }
      break;
    case 'close-modal':
      if (!busy) {
        modal = null;
        render();
      }
      break;
    case 'dismiss':
      notice = null;
      render();
      break;
    case 'choose-source':
    case 'refresh-sources':
      void openSources();
      break;
    case 'cancel-sources':
      cancelSources();
      break;
    case 'source-tab': {
      const nextPage =
        button.dataset.sourceKind === 'window' ? 'window' : 'screen';
      if (sourcePage !== nextPage) {
        sourcePage = nextPage;
        if (
          selectedSource &&
          sources.find((source) => source.id === selectedSource)?.kind !==
            sourcePage
        )
          selectedSource = '';
        render();
      }
      break;
    }
    case 'select-source':
      selectedSource = button.dataset.source ?? '';
      render();
      break;
    case 'start-share':
      void startSharing();
      break;
    case 'stop':
      stopSharing();
      notify('O compartilhamento parou. Sua sala continua aberta.');
      break;
    case 'leave':
      leaveRoom();
      break;
    case 'kick':
      if (room && button.dataset.peer) {
        const peerId = button.dataset.peer;
        if (send({ type: 'kick', peerId })) {
          // Membership changes arrive from the server after authorization.
        }
      }
      break;
    case 'copy':
      if (room && api)
        void api
          .copyCode(room.code)
          .then(() =>
            notify('Código copiado. Agora é só convidar.', 'success', true),
          )
          .catch(() =>
            notify(
              'Não foi possível copiar. Selecione o código para compartilhá-lo.',
              'error',
            ),
          );
      break;
    case 'fullscreen':
      void document
        .querySelector<HTMLVideoElement>('#stream-video')
        ?.requestFullscreen()
        .catch(() => notify('Não foi possível abrir a tela cheia.', 'error'));
      break;
    case 'rejoin': {
      if (room?.role === 'viewer') {
        const code = room.code;
        leaveRoom();
        joinCode = code;
        void connectRoom('join');
      }
      break;
    }
    case 'check-update':
      void api
        ?.checkUpdates()
        .catch(() =>
          notify('Não foi possível verificar atualizações.', 'error'),
        );
      break;
    case 'install-update':
      modal = 'update';
      render();
      break;
  }
});

document.addEventListener('keydown', (event) => {
  if (
    modal === 'sources' &&
    event.target instanceof HTMLElement &&
    event.target.matches('[role="tab"]') &&
    (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
  ) {
    event.preventDefault();
    const nextPage = sourcePage === 'screen' ? 'window' : 'screen';
    root
      .querySelector<HTMLButtonElement>(
        `[data-action="source-tab"][data-source-kind="${nextPage}"]`,
      )
      ?.click();
    return;
  }
  if (!modal && activePage === 'settings' && event.key === 'Escape' && !busy) {
    activePage = previousPage === 'room' && !room ? 'home' : previousPage;
    render();
    root.querySelector<HTMLButtonElement>('[data-action=settings]')?.focus();
    return;
  }
  if (!modal) {
    if (event.key === 'Escape') {
      const menu =
        document.activeElement?.closest<HTMLDetailsElement>(
          '.member-menu[open]',
        );
      if (menu) {
        event.preventDefault();
        menu.open = false;
        menu.querySelector<HTMLElement>('summary')?.focus();
      }
    }
    return;
  }
  if (event.key === 'Escape') {
    if (modal === 'sources') cancelSources();
    else if (!busy) {
      if (modal === 'update') updateDismissed = true;
      modal = null;
      render();
    }
  }
  if (event.key === 'Tab') {
    const dialog = root.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) trapDialogTab(event, dialog);
  }
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && deferredRender) render();
});
window.addEventListener('blur', syncPreviews);
window.addEventListener('focus', syncPreviews);
document.addEventListener('visibilitychange', syncPreviews);
const metricsTimer = setInterval(patchMetrics, 2_000);

navigator.mediaDevices?.addEventListener('devicechange', () => {
  if (!sharing || !liveAudio(localStream).length) return;
  notify(
    'Os dispositivos de áudio mudaram. Confira o som recebido; se ficou em silêncio, reinicie o compartilhamento.',
    'info',
  );
});

window.addEventListener('beforeunload', () => {
  clearInterval(metricsTimer);
  if (room) {
    try {
      socket?.send({
        type: roomState?.ownerId === room.selfId ? 'close-room' : 'leave-room',
      });
    } catch {
      /* Window is closing. */
    }
  }
  sessionEpoch++;
  stopTracks(localStream);
  stopTracks(remoteStream);
  watchPeers?.dispose();
  peers?.dispose();
  socket?.disconnect();
  void api?.setSharing(false).catch(() => undefined);
});

render();
if (api) {
  api.onForeground((value) => {
    nativeForeground = value;
    syncPreviews();
  });
  void api
    .getForeground()
    .then((value) => {
      nativeForeground = value;
      syncPreviews();
    })
    .catch(() => undefined);
  api.onUpdate((state) => {
    update = state;
    render();
  });
  void api
    .getConfig()
    .then((value) => {
      config = value;
      settingUrl = value.signalingUrl;
      loaded = true;
      void api
        .getUpdateState()
        .then((state) => {
          update = state;
          render();
        })
        .catch(() => undefined);
      render();
    })
    .catch(() =>
      notify(
        'Não foi possível carregar as configurações. Reinicie o aplicativo.',
        'error',
      ),
    );
}

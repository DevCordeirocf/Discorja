import type {
  AppConfig,
  CaptureSource,
  DiscorjaAPI,
  ServerMessage,
  UpdateState,
} from '../shared/protocol';
import { SignalConnection } from './signal';
import { RoomPeers } from './rtc';
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

const icons: Record<string, string> = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  screen:
    '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings:
    '<path d="m9.5 3-.7 2.2-2 .9-2.2-.5-2.5 4.3 1.5 1.7v2.3l-1.5 1.7 2.5 4.3 2.2-.5 2 .9.7 2.2h5l.7-2.2 2-.9 2.2.5 2.5-4.3-1.5-1.7v-2.3l1.5-1.7-2.5-4.3-2.2.5-2-.9L14.5 3Z"/><circle cx="12" cy="12.7" r="3"/>',
  shield:
    '<path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7Z"/><path d="m8 12 3 3 5-5"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  exit: '<path d="M9 21H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5m6 5 5 4-5 4m5-4H9"/>',
  window:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-14-2h.01M10 7h.01"/>',
  alert: '<path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3h.01"/>',
  network:
    '<path d="M5 8a11 11 0 0 1 14 0M2 5a16 16 0 0 1 20 0M8 12a6 6 0 0 1 8 0m-5 4a2 2 0 0 1 2 0"/><circle cx="12" cy="20" r=".5"/>',
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
};
const icon = (name: string, className = ''): string =>
  `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.screen}</svg>`;
const logo = `<svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M7 9a5 5 0 0 1 5-5h17v18a5 5 0 0 1-5 5h-5l-8 5v-8H7V9Z" fill="currentColor"/><path d="M14 12h9m-9 6h6" stroke="#17151f" stroke-width="3" stroke-linecap="round"/></svg>`;
const escape = (value: unknown): string =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
const root = document.querySelector<HTMLDivElement>('#app')!;
const api = window.discorja;
let config: AppConfig = {
  signalingUrl: 'ws://127.0.0.1:8787',
  iceServers: [],
  version: 'prévia',
  updatesConfigured: false,
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
let modal: 'settings' | 'sources' | 'update' | null = null;
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
let sessionEpoch = 0;
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
let selectedSource = '';
let sharedSourceName = '';
let localStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
let sharing = false;
let remoteSharing = false;
let connectionIssue = '';

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
  captureEpoch++;
  qualityEpoch++;
  applyingPreferences = false;
  pendingPreferences = null;
  qualityStatus = '';
  latestMetrics = [];
  metricsStartedAt = 0;
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
  if (announce && room?.role === 'host')
    send({ type: 'host-state', sharing: false });
}

function leaveRoom(
  message?: string,
  kind: 'error' | 'info' = 'info',
  tellServer = true,
): void {
  clearTimeout(toastTimer);
  clearTimeout(resumeTimer);
  clearTimeout(resumeDeadline);
  resumeToken = '';
  signalRecovering = false;
  if (tellServer && room) {
    try {
      socket?.send({
        type: room.role === 'host' ? 'close-room' : 'leave-room',
      });
    } catch {
      /* Already disconnected. */
    }
  }
  sessionEpoch++;
  clearPending();
  clearTimeout(remoteTimer);
  stopSharing(false);
  peers?.dispose();
  peers = null;
  socket?.disconnect();
  socket = null;
  stopTracks(remoteStream);
  remoteStream = null;
  room = null;
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
    if (room?.role === 'viewer' && remoteSharing && !remoteStream) {
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
      if (epoch === sessionEpoch) send({ type: 'signal', peerId, signal });
    },
    (stream) => {
      if (epoch !== sessionEpoch || room?.role !== 'viewer' || !remoteSharing) {
        stopTracks(stream);
        return;
      }
      clearTimeout(remoteTimer);
      remoteStream = stream;
      connectionReconnecting = false;
      connectionIssue = '';
      for (const track of stream.getVideoTracks())
        track.onended = () => {
          if (remoteStream === stream) {
            remoteStream = null;
            render();
          }
        };
      render();
    },
    (peerId, state) => {
      if (epoch !== sessionEpoch) return;
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

function onMessage(message: ServerMessage): void {
  switch (message.type) {
    case 'room-resumed': {
      if (
        !signalRecovering ||
        !room ||
        room.selfId !== message.selfId ||
        room.code !== message.code ||
        room.role !== message.role
      )
        return;
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
      clearPending();
      resumeToken = message.resumeToken ?? '';
      room = {
        role: 'viewer',
        code: message.code,
        selfId: message.selfId,
        hostId: message.hostId,
        hostName: message.hostName,
        maxViewers: 4,
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
      leaveRoom(
        message.reason === 'expired'
          ? 'A sala expirou. Crie ou entre em uma nova sala.'
          : 'O anfitrião encerrou a sala.',
        'info',
        false,
      );
      break;
    case 'kicked':
      leaveRoom('O anfitrião removeu você da sala.', 'info', false);
      break;
    case 'error': {
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
  connectionReconnecting = true;
  latestMetrics = [];
  peers?.dispose();
  peers = null;
  stopTracks(remoteStream);
  remoteStream = null;
  socket?.disconnect();
  const epoch = sessionEpoch;
  let attempt = 0;
  resumeDeadline = setTimeout(() => {
    if (epoch === sessionEpoch && signalRecovering)
      leaveRoom(
        'Não foi possível retomar a sala. A transmissão foi encerrada.',
        'error',
        false,
      );
  }, 18_000);
  const retry = async () => {
    if (epoch !== sessionEpoch || !signalRecovering) return;
    let opened = false;
    const connection = new SignalConnection(
      config.signalingUrl,
      (message) => {
        if (epoch === sessionEpoch) onMessage(message);
      },
      () => {
        if (epoch !== sessionEpoch) return;
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
    } catch {
      connection.disconnect();
      if (epoch === sessionEpoch && signalRecovering)
        resumeTimer = setTimeout(
          () => void retry(),
          Math.min(3000, 500 * 2 ** attempt++),
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
  busy = 'room';
  const epoch = ++sessionEpoch;
  const connection = new SignalConnection(
    config.signalingUrl,
    (message) => {
      if (epoch === sessionEpoch) onMessage(message);
    },
    () => {
      if (epoch === sessionEpoch) recoverSignaling();
    },
  );
  socket = connection;
  render();
  try {
    await connection.connect();
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
        ? { type: 'create-room', name }
        : { type: 'join-room', name, code: joinCode },
    );
  } catch (error) {
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
  selectedSource = '';
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
  const current = (): boolean =>
    epoch === sessionEpoch && attempt === captureEpoch && room?.role === 'host';
  busy = 'capture';
  render();
  let stream: MediaStream | null = null;
  try {
    await api.selectSource(source.id);
    if (!current()) return;
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: captureConstraints(selectedPreferences.preset),
      audio: false,
    });
    for (const track of stream.getAudioTracks()) {
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
    await peers?.configure(selectedPreferences);
    if (!current()) {
      stopTracks(stream);
      return;
    }
    await api.setSharing(true);
    if (!current()) {
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
    if (!send({ type: 'host-state', sharing: true })) return;
    for (const [peerId, viewer] of viewers) {
      viewer.connected = false;
      viewer.failed = false;
      viewer.reconnecting = false;
      void peers?.offer(peerId, stream);
    }
    render();
  } catch (error) {
    stopTracks(stream);
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

function endpointLabel(): string {
  try {
    const url = new URL(config.signalingUrl);
    return ['localhost', '127.0.0.1'].includes(url.hostname)
      ? 'Servidor local'
      : url.hostname;
  } catch {
    return 'Servidor não configurado';
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
  if (room?.role !== 'host' || busy || applyingPreferences) {
    render();
    return;
  }
  const candidate = normalizePreferences(next);
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

function readQualityControls(): StreamPreferences {
  return normalizePreferences({
    preferredCodec:
      document.querySelector<HTMLSelectElement>('#preferred-codec')?.value,
    preset: document.querySelector<HTMLSelectElement>('#quality-preset')?.value,
    content: document.querySelector<HTMLSelectElement>('#content-mode')?.value,
    adaptive:
      document.querySelector<HTMLInputElement>('#adaptive-quality')?.checked,
    maxUploadMbps: Number(
      document.querySelector<HTMLInputElement>('#upload-budget')?.value,
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
    )}</select></div><div class="quality-field"><label for="content-mode">O que vai aparecer?</label><select id="content-mode" ${disabled ? 'disabled' : ''}><option value="detail" ${selected.content === 'detail' ? 'selected' : ''}>Textos e detalhes</option><option value="motion" ${selected.content === 'motion' ? 'selected' : ''}>Vídeos e jogos</option></select></div><div class="quality-field"><label for="preferred-codec">Formato na próxima transmissão</label><select id="preferred-codec" ${disabled ? 'disabled' : ''}>${['auto', 'H264', 'VP8', 'VP9', 'AV1'].map((codec) => `<option value="${codec}" ${(selected.preferredCodec ?? 'auto') === codec ? 'selected' : ''}>${codec === 'auto' ? 'Automático' : codec}</option>`).join('')}</select></div><label class="adaptive-control" for="adaptive-quality"><input id="adaptive-quality" type="checkbox" ${selected.adaptive ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>Ajustar à conexão</strong><small>Reduz quando necessário e recupera aos poucos.</small></span></label><div class="quality-field budget-field"><label for="upload-budget">Limite total de envio</label><div class="budget-input"><input id="upload-budget" type="number" min="4" max="100" step="1" inputmode="numeric" value="${selected.maxUploadMbps}" aria-describedby="upload-budget-help" ${disabled ? 'disabled' : ''}><span>Mbps</span></div></div></div>
  <p id="upload-budget-help" class="quality-help">O orçamento reserva 15% de folga e é dividido entre todos os espectadores. A tela, o computador e a rede podem entregar menos resolução, quadros ou velocidade que o perfil escolhido.</p><p class="quality-status" role="status">${escape(qualityStatus)}</p></section>`;
}

function metricPeer(peerId: string, name: string): string {
  return `<article class="metric-peer" data-peer-metrics="${escape(peerId)}"><header><strong>${escape(name)}</strong><span data-value="status">Aguardando medição</span></header><dl class="metric-values"><div><dt>Resolução</dt><dd data-value="resolution">—</dd></div><div><dt>Quadros/s</dt><dd data-value="fps">—</dd></div><div><dt>Vídeo</dt><dd data-value="bitrate">— Mbps</dd></div><div><dt>Resposta</dt><dd data-value="rtt">— ms</dd></div><div><dt>Perda</dt><dd data-value="loss">—</dd></div><div><dt>Conexão</dt><dd data-value="route">—</dd></div></dl><p class="metric-detail" data-value="detail">Os dados aparecem quando a conexão de vídeo é estabelecida.</p></article>`;
}

function renderDiagnostics(): string {
  if (!room) return '';
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
  const live = room.role === 'host' ? sharing : remoteSharing;
  const fresh = latestMetrics.filter(
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
    const direction = room.role === 'host' ? 'outbound' : 'inbound';
    const metric = live
      ? fresh.find(
          (entry) => entry.peerId === peerId && entry.direction === direction,
        )
      : undefined;
    const write = (key: string, text: string): void => {
      const node = row.querySelector<HTMLElement>(`[data-value="${key}"]`);
      if (node && node.textContent !== text) node.textContent = text;
    };
    const viewer = peerId ? viewers.get(peerId) : undefined;
    const reconnecting =
      metric?.recovering ||
      viewer?.reconnecting ||
      (room.role === 'viewer' && connectionReconnecting);
    write(
      'status',
      reconnecting
        ? 'Reconectando…'
        : !live
          ? 'Sem transmissão'
          : viewer?.failed || connectionIssue
            ? 'Conexão interrompida'
            : metric
              ? 'Medição recebida'
              : metricsStartedAt && now - metricsStartedAt > 10_000
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
  return `<section class="welcome">
    <div class="hero-copy"><span class="eyebrow"><span class="tiny-spark">✦</span> PERTO, MESMO DE LONGE</span><h1>Sua tela.<br>Uma boa <span>companhia.</span></h1><p>Mostre uma ideia, acompanhe um jogo ou só fique junto.<br>Crie uma sala e convide quem faz parte do momento.</p></div>
    <div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-spark spark-one">✧</span><span class="art-spark spark-two">✦</span><div class="art-window art-back"><div class="art-dots"><i></i><i></i><i></i></div><div class="art-landscape"><span></span><i></i></div></div><div class="art-window art-front"><div class="art-dots"><i></i><i></i><i></i></div><div class="art-play">${icon('screen')}</div><div class="art-line"></div><div class="art-line short"></div><div class="art-avatars"><i>M</i><i>A</i><i>+</i></div><span class="art-live"><i></i> juntos agora</span></div></div>
  </section>
  <section class="start-section" aria-labelledby="start-heading"><div class="section-heading"><h2 id="start-heading">Onde a gente se encontra?</h2><span>Sem complicar. É só chegar.</span></div>
    <div class="identity-field"><label for="display-name">Como você quer ser chamado?</label><div class="name-input">${icon('users')}<input id="display-name" autocomplete="nickname" maxlength="32" placeholder="Seu nome" value="${escape(displayName)}" ${busy ? 'disabled' : ''}></div></div>
    <div class="start-grid"><article class="start-card create-card"><div class="card-symbol purple">${icon('screen')}</div><h3>O momento é seu</h3><p>Abra uma sala privada e compartilhe<br>uma janela ou sua tela inteira.</p><button class="button primary wide" data-action="create" ${disabled ? 'disabled' : ''}>${busy === 'room' ? '<span class="spinner"></span> Conectando…' : `${icon('plus')} Criar uma sala`}</button><span class="card-footnote">Você escolhe o que mostrar.</span></article>
    <article class="start-card join-card"><div class="card-symbol mint">${icon('users')}</div><h3>Tem alguém esperando?</h3><p>Recebeu um convite? Digite o código<br>e entre para acompanhar.</p><form id="join-form"><label class="sr-only" for="room-code">Código da sala com 8 caracteres</label><div class="join-input"><span>#</span><input id="room-code" aria-label="Código da sala com 8 caracteres" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" placeholder="CÓDIGO DA SALA" value="${escape(joinCode)}" ${busy ? 'disabled' : ''}><button type="submit" class="join-button" aria-label="Entrar na sala" ${disabled ? 'disabled' : ''}>${icon('arrow')}</button></div></form><span class="card-footnote">8 caracteres, um lugar para estar.</span></article></div>
  </section>
  <section class="principles" aria-label="Como funciona"><div>${icon('lock')}<span><strong>Só quem você convida</strong><small>Entre com o código da sala.</small></span></div><div>${icon('screen')}<span><strong>Você no controle</strong><small>Comece e pare quando quiser.</small></span></div><div>${icon('shield')}<span><strong>O momento fica no momento</strong><small>Sem gravação automática.</small></span></div></section>`;
}

function renderRoom(): string {
  if (!room) return '';
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
  if (modal === 'update')
    return `<div class="modal-overlay"><section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">${update.status === 'downloaded' ? 'Atualização pronta' : 'Atualização disponível'}</h2></div><p class="modal-description">Versão instalada: ${escape(config.version)}. Nova versão: ${escape(update.version ?? 'disponível')}.</p><p role="status">${update.status === 'downloading' ? `Baixando… ${Math.round(update.percent ?? 0)}%` : update.status === 'error' ? escape(update.message ?? 'Falha ao atualizar. Tente novamente nas configurações.') : update.status === 'downloaded' ? 'O aplicativo será reiniciado para instalar.' : 'Uma nova versão do Discorja está disponível.'}</p>${room ? '<p class="settings-warning">Reiniciar encerrará sua participação e qualquer transmissão ativa.</p>' : ''}<div class="modal-footer"><button class="button subtle" data-action="defer-update">Depois</button>${update.status === 'downloaded' ? '<button class="button primary" data-action="confirm-install-update">Reiniciar e atualizar</button>' : update.status === 'available' ? '<button class="button primary" data-action="download-update">Atualizar agora</button>' : ''}</div></section></div>`;
  if (modal === 'sources')
    return `<div class="modal-overlay"><section class="modal source-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><div><span class="eyebrow">O CONTROLE É SEU</span><h2 id="modal-title">O que vamos compartilhar?</h2></div><button class="icon-button" data-action="cancel-sources" aria-label="Cancelar escolha">${icon('close')}</button></div><p class="modal-description">Selecione uma tela ou janela. A transmissão começa ao clicar em iniciar.</p>${busy === 'sources' ? '<div class="source-loading"><span class="spinner"></span> Buscando telas e janelas…</div>' : sources.length ? `<div class="source-grid">${sources.map((source, index) => `<button id="source-${index}" class="source-option ${selectedSource === source.id ? 'selected' : ''}" data-action="select-source" data-source="${escape(source.id)}" aria-pressed="${selectedSource === source.id}" ${busy === 'capture' ? 'disabled' : ''}><div class="source-thumbnail">${source.thumbnail ? `<img src="${escape(source.thumbnail)}" alt="Prévia de ${escape(source.name)}">` : icon(source.kind === 'screen' ? 'screen' : 'window')}<span class="source-check">${icon('check')}</span></div><span class="source-name">${icon(source.kind === 'screen' ? 'screen' : 'window')}<span>${escape(source.name)}</span></span></button>`).join('')}</div>` : `<div class="source-loading">${icon('window')} Nenhuma tela disponível. Confira as permissões de captura do sistema.</div>`}<div class="source-privacy">${icon('shield')} Compartilhe só o necessário. Evite janelas com informações pessoais.</div><div class="modal-footer"><button class="button subtle" data-action="cancel-sources">Cancelar</button><button class="button primary" data-action="start-share" ${!selectedSource || busy ? 'disabled' : ''}>${busy === 'capture' ? '<span class="spinner"></span> Iniciando…' : `${icon('screen')} Iniciar compartilhamento`}</button></div></section></div>`;
  const updateText: Record<UpdateState['status'], string> = {
    disabled: 'As atualizações estarão disponíveis nas versões publicadas.',
    idle: 'Confira se existe uma nova versão.',
    checking: 'Procurando uma nova versão…',
    available: `Versão ${update.version ?? ''} disponível.`,
    downloading: `Baixando atualização${typeof update.percent === 'number' ? ` · ${Math.round(update.percent)}%` : ''}…`,
    downloaded: 'Atualização pronta. Reinicie para instalar.',
    error: update.message ?? 'Não foi possível consultar atualizações.',
    current: 'Você está na versão mais recente.',
  };
  return `<div class="modal-overlay"><section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><div><span class="eyebrow">DO SEU JEITO</span><h2 id="modal-title">Configurações</h2></div><button class="icon-button" data-action="close-modal" aria-label="Fechar configurações" ${busy === 'settings' ? 'disabled' : ''}>${icon('close')}</button></div><form id="settings-form"><label class="field-label" for="signaling-url">Servidor de sinalização</label><p class="field-help">O servidor conecta as pessoas da sala. Todos precisam usar o mesmo endereço.</p><input id="signaling-url" class="text-input" type="url" required spellcheck="false" autocomplete="off" placeholder="wss://seu-servidor.exemplo" value="${escape(settingUrl)}" ${room || busy ? 'disabled' : ''}><span class="field-hint">Use wss:// para servidores públicos. O endereço local serve para desenvolvimento.</span>${room ? '<p class="settings-warning">Encerre ou saia da sala para alterar o servidor.</p>' : ''}<div class="settings-divider"></div><div class="settings-update"><div class="settings-app-icon">${logo}</div><div><strong>Discorja <span>v${escape(config.version)}</span></strong><p>${escape(updateText[update.status])}</p></div></div><div class="update-actions">${update.status === 'available' ? '<button type="button" class="button secondary" data-action="download-update">Baixar atualização</button>' : update.status === 'downloaded' ? `<button type="button" class="button secondary" data-action="install-update" >Reiniciar e instalar</button>` : `<button type="button" class="button subtle" data-action="check-update" ${!api || !config.updatesConfigured || ['checking', 'downloading', 'available'].includes(update.status) ? 'disabled' : ''}>${icon('refresh')} Verificar atualizações</button>`}</div><div class="modal-footer"><button type="button" class="button subtle" data-action="close-modal" ${busy === 'settings' ? 'disabled' : ''}>Fechar</button><button type="submit" class="button primary" ${!api || !!room || !!busy ? 'disabled' : ''}>${busy === 'settings' ? '<span class="spinner"></span>' : ''}Salvar configurações</button></div></form></section></div>`;
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
  const nextStream = room?.role === 'host' ? localStream : remoteStream;
  const keepVideo =
    !!oldVideo && !!nextStream && oldVideo.srcObject === nextStream;
  // Detaching a fullscreen element exits fullscreen. Defer structural updates until the user exits.
  if (keepVideo && document.fullscreenElement === oldVideo) {
    deferredRender = true;
    patchMetrics();
    return;
  }
  deferredRender = false;
  const focused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.id
      : '';
  const focusedAction = document.activeElement?.closest('[role="dialog"]')
    ? document.activeElement.getAttribute('data-action')
    : null;
  const hadModal = !!root.querySelector('[role="dialog"]');
  const stage = room ? 'Sua sala' : 'Início';
  root.innerHTML = `<div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">${logo}</span><span>discorja<span class="brand-period">.</span></span></div><div class="sidebar-caption">SEU PONTO DE ENCONTRO</div><nav aria-label="Navegação principal"><button class="nav-item ${!room ? 'active' : ''}" data-action="home">${icon('home')} Início${!room ? '<span></span>' : ''}</button>${room ? `<button class="nav-item active" data-action="room">${icon('screen')} Sua sala <span></span></button>` : ''}</nav><div class="sidebar-bottom"><div class="little-note"><span>Um código.<br>Um momento.<br><strong>Todo mundo perto.</strong></span><i>✳</i></div><button class="nav-item" data-action="settings">${icon('settings')} Configurações</button><div class="version-label">DISCORJA <span>v${escape(config.version)}</span></div></div></aside><div class="main-shell"><header class="topbar"><div class="breadcrumb">Seu espaço <span>/</span> <strong>${stage}</strong></div><div class="topbar-status"><span class="${sharing ? 'live-dot' : 'online-dot'}"></span>${sharing ? 'Você está transmitindo' : room ? 'Conectado à sala' : 'Pronto para conectar'}<span class="topbar-separator"></span><span class="private-label">${icon('lock')} Feito para a sua turma</span></div></header><main id="main-content">${!api ? `<div class="preview-notice">${icon('screen')} Prévia da interface. Abra o aplicativo desktop para criar salas e compartilhar sua tela.</div>` : ''}${notice ? `<div class="notice ${notice.kind}" role="${notice.kind === 'error' ? 'alert' : 'status'}">${icon(notice.kind === 'error' ? 'alert' : notice.kind === 'success' ? 'check' : 'network')}<span>${escape(notice.text)}</span><button class="icon-button" data-action="dismiss" aria-label="Dispensar aviso">${icon('close')}</button></div>` : ''}${room ? renderRoom() : renderHome()}</main><footer class="app-footer"><span><i class="${socket && room ? 'online-dot' : 'server-dot'}"></i>${escape(endpointLabel())}${socket && room ? ' · conectado' : ''}</span><span>${icon('shield')} Captura por sua escolha. Sempre.</span></footer></div></div>${renderModal()}`;
  const panel = root.querySelector<HTMLElement>('.broadcast-panel');
  if (panel && room) {
    const column = document.createElement('div');
    column.className = 'stream-column';
    panel.replaceWith(column);
    column.append(panel);
    const chooseButton = panel.querySelector<HTMLButtonElement>(
      '[data-action="choose-source"]',
    );
    if (chooseButton) chooseButton.disabled = !!busy || applyingPreferences;
    column.insertAdjacentHTML(
      'beforeend',
      `${room.role === 'host' ? renderQualityPanel() : ''}${renderDiagnostics()}`,
    );
    if (connectionReconnecting && room.role === 'viewer' && remoteStream) {
      const banner = document.createElement('div');
      banner.className = 'video-reconnecting';
      banner.textContent = 'Reconectando ao vídeo…';
      panel.querySelector('.video-stage')?.append(banner);
      const status = panel.querySelector<HTMLElement>('.status-pill');
      if (status?.lastChild) status.lastChild.textContent = 'RECONECTANDO';
    }
    if (!nextStream) {
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
    const profile = document.createElement('div');
    profile.className = 'source-profile';
    profile.textContent = `Perfil desejado: ${QUALITY_PRESETS[preferences.preset].label} · ${preferences.content === 'motion' ? 'Vídeos e jogos' : 'Textos e detalhes'}${preferences.adaptive ? ' · Ajuste à conexão ativo' : ''}.`;
    root.querySelector('.source-modal .modal-description')?.after(profile);
  }
  const shell = root.querySelector<HTMLElement>('.app-shell');
  if (shell) shell.inert = !!modal;
  if (modal === 'settings' && notice) {
    root.querySelector('main .notice')?.remove();
    const alert = document.createElement('div');
    alert.className = `notice ${notice.kind}`;
    alert.setAttribute('role', notice.kind === 'error' ? 'alert' : 'status');
    alert.textContent = notice.text;
    root.querySelector('.modal-heading')?.after(alert);
  }
  const placeholder = root.querySelector<HTMLVideoElement>('#stream-video');
  if (keepVideo && oldVideo && placeholder) {
    placeholder.replaceWith(oldVideo);
  } else if (placeholder && nextStream) {
    placeholder.srcObject = nextStream;
    void placeholder.play().catch(() => undefined);
  }
  if (!keepVideo && oldVideo) oldVideo.srcObject = null;
  patchMetrics();
  if (focused) document.getElementById(focused)?.focus();
  if (focusedAction && modal)
    root
      .querySelector<HTMLElement>(
        `[role="dialog"] [data-action="${focusedAction}"]`,
      )
      ?.focus();
  if (modal && !document.activeElement?.closest('[role="dialog"]'))
    document
      .querySelector<HTMLElement>(
        '[role="dialog"] button:not(:disabled), [role="dialog"] input:not(:disabled)',
      )
      ?.focus();
  if (!modal && hadModal)
    root
      .querySelector<HTMLElement>(
        `[data-action="${returnFocusAction}"], [data-action="settings"]`,
      )
      ?.focus();
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
  if (target.id === 'signaling-url') settingUrl = target.value;
});

root.addEventListener('submit', (event) => {
  event.preventDefault();
  if ((event.target as HTMLElement).id === 'join-form')
    void connectRoom('join');
  if ((event.target as HTMLElement).id === 'settings-form') void saveSettings();
});

root.addEventListener('change', (event) => {
  const target = event.target;
  if (!(
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement
  ))
    return;
  if (
    [
      'quality-preset',
      'content-mode',
      'preferred-codec',
      'adaptive-quality',
      'upload-budget',
    ].includes(target.id)
  )
    void applyPreferences(readQualityControls());
});

root.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    'button[data-action]',
  );
  if (!button || button.disabled) return;
  switch (button.dataset.action) {
    case 'export-diagnostics':
      void api
        ?.exportDiagnostics({ preferences, metrics: latestMetrics })
        .catch(() => notify('Não foi possível salvar o diagnóstico.', 'error'));
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
      void connectRoom('create');
      break;
    case 'home':
      if (!room) {
        modal = null;
        render();
      }
      break;
    case 'settings':
      if (!busy) {
        modal = 'settings';
        returnFocusAction = 'settings';
        notice = null;
        settingUrl = config.signalingUrl;
        render();
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
      void openSources();
      break;
    case 'cancel-sources':
      cancelSources();
      break;
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
      if (room?.role === 'host' && button.dataset.peer) {
        const peerId = button.dataset.peer;
        if (send({ type: 'kick', peerId })) {
          peers?.remove(peerId);
          viewers.delete(peerId);
          render();
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
  if (!modal) return;
  if (event.key === 'Escape') {
    if (modal === 'sources') cancelSources();
    else if (!busy) {
      if (modal === 'update') updateDismissed = true;
      modal = null;
      render();
    }
  }
  if (event.key === 'Tab') {
    const elements = [
      ...document.querySelectorAll<HTMLElement>(
        '[role="dialog"] button:not(:disabled), [role="dialog"] input:not(:disabled)',
      ),
    ];
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && deferredRender) render();
});

const metricsTimer = setInterval(patchMetrics, 2_000);

window.addEventListener('beforeunload', () => {
  clearInterval(metricsTimer);
  if (room) {
    try {
      socket?.send({
        type: room.role === 'host' ? 'close-room' : 'leave-room',
      });
    } catch {
      /* Window is closing. */
    }
  }
  sessionEpoch++;
  stopTracks(localStream);
  stopTracks(remoteStream);
  peers?.dispose();
  socket?.disconnect();
  void api?.setSharing(false).catch(() => undefined);
});

render();
if (api) {
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

import type {
  AppConfig,
  CaptureSource,
  DiscorjaAPI,
  UpdateState,
  RoomState,
  MultiRoomState,
} from '../shared/protocol';
import { errorFields } from '../shared/logs';
import { SignalConnection } from './transport/signal';
import { initializeBackgroundEffect } from './ui/media/background-effect';
import { RoomPeers } from './media/rtc';
import { type FilteredAudioPipeline } from './media/audio-capture';
import { createPreferenceStore } from './state/preference-store';
import { type AppPage } from './views/design';
import { type AppModal } from './views/modals';
import { createAppSettingsController } from './features/settings/app-controller';
import { liveAudioTracks as liveAudio, stopTracks } from './features/capture';
import { createAppCaptureController } from './features/capture/app-controller';
import { createFilteredAudioStopper } from './features/capture/pipeline-controller';
import {
  clearPendingRoom as clearPending,
  getPendingRoomKind,
  hasPendingRoom,
  setPendingRoom,
} from './features/session/room-state/pending-room';
import { createNotifier } from './ui/feedback/notifications';
import { syncRoomMembers, createRoomMemberState } from './features/session';
import { createAppRoomTransport } from './features/session/connection/app-room-transport';
import { createSessionTerminationController } from './features/session/lifecycle/termination-controller';
import { createApplicationMessages } from './features/session/messaging/application-messages';
import { createApplicationPeerRuntime } from './features/session/peers/application-peer-runtime';
import { createConnectionController } from './features/session/connection/connection-controller';
import { createAppSnapshotController } from './features/session/room-state/app-snapshot-controller';
import { createApplicationViewBindings } from './ui/application/application-view-bindings';
import { startApplicationRuntime } from './ui/application/application-runtime';
import { createAppMedia } from './ui/application/app-media';
import {
  bindRendererErrorLogging,
  createRendererLogger,
} from './ui/feedback/renderer-logging';
import { createInterfaceActions } from './ui/actions/interface-actions';
import { bindAppActionRouter } from './ui/application/app-action-bindings';
import { bindApplicationInputEvents } from './ui/application/application-input-bindings';
import { bindParticipantPhotoPreview } from './ui/application/participant-photo-preview';
import { createRoomSwitchActions } from './ui/actions/room-switch';
import { compactProfileAvatar } from './features/profile/profile-avatar';
import { type StreamPreferences, type PeerMetrics } from '../shared/quality';

declare global {
  interface Window {
    discorja?: DiscorjaAPI;
  }
}

const root = document.querySelector<HTMLDivElement>('#app')!;
bindParticipantPhotoPreview(root);
initializeBackgroundEffect();
const announcements = document.createElement('div');
announcements.id = 'session-announcement';
announcements.className = 'sr-only';
announcements.setAttribute('role', 'status');
announcements.setAttribute('aria-live', 'polite');
announcements.setAttribute('aria-atomic', 'true');
document.body.append(announcements);
let sessionEpoch = 0;
const api = window.discorja;
let persistentStorage: Storage | undefined;
try {
  persistentStorage = localStorage;
} catch {
  /* The interface still works without browser storage. */
}
const preferenceStore = createPreferenceStore(persistentStorage);
const recordLog = createRendererLogger(api, () => sessionEpoch);
bindRendererErrorLogging(recordLog);
let nativeForeground = !api;
let config: AppConfig = {
  signalingUrl: 'ws://127.0.0.1:8787',
  iceServers: [],
  version: 'prévia',
  updatesConfigured: false,
  systemAudioSupported: false,
};
let loaded = !api;
let displayName = preferenceStore.displayName();
let profilePhoto = preferenceStore.profilePhoto();
let joinCode = '';
let settingUrl = config.signalingUrl;
let activePage: AppPage = 'home';
let previousPage: AppPage = 'home';
let sidebarCollapsed = preferenceStore.sidebarCollapsed();
let editingName = false;
let testingConnection = false;
let connectionCheck = '';
let filteredAudioPipeline: FilteredAudioPipeline | null = null;
let removeFilteredAudioErrorListener: (() => void) | null = null;
preferenceStore.clearObsoletePreferences();
let modal: AppModal = null;
let switchTarget: {
  kind: 'create' | 'join';
  code?: string;
} | null = null;

let requestRoomSwitch: (target: NonNullable<typeof switchTarget>) => void;
let confirmRoomSwitch: () => Promise<void>;
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
let preferences: StreamPreferences = preferenceStore.streamPreferences();
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
let localPublicationId = '';
let publicationConfirmed = false;
const isLocalSharing = () => sharing || !!localStream || !!localPublicationId;
const multiState = (): MultiRoomState | null =>
  roomState?.protocol === 3 || roomState?.protocol === 4 ? roomState : null;
const { publicationWatcher, createPeers, clearWatchMedia, createWatchPeers } =
  createApplicationPeerRuntime({
    getIceServers: () => config.iceServers,
    getPreferences: () => preferences,
    getSessionEpoch: () => sessionEpoch,
    getEpoch: () => sessionEpoch,
    getMultiState: multiState,
    getMultiRoom: multiState,
    isRecovering: () => signalRecovering,
    send,
    getRemoteStream: () => remoteStream,
    setRemoteStream: (stream) => {
      remoteStream = stream;
    },
    setReceiveMuted: (muted) => {
      receiveMuted = muted;
    },
    setRemoteSharing: (value) => {
      remoteSharing = value;
    },
    setConnectionReconnecting: (value) => {
      connectionReconnecting = value;
    },
    setConnectionIssue: (value) => {
      connectionIssue = value;
    },
    clearRemoteTimer: () => clearTimeout(remoteTimer),
    waitForVideo,
    render,
    logFailure: (details) => recordLog('rtc.failed', details),
    patchWatcherMetrics: () => patchMetrics(),
    patchPeerMetrics: () => patchMetrics(),
    getCurrent: () => peers,
    setCurrent: (value) => {
      peers = value;
    },
    getPublicationId: () => localPublicationId,
    getRoomRole: () => room?.role,
    getRemoteSharing: () => remoteSharing,
    getViewers: () => viewers,
    setReconnecting: (value) => {
      connectionReconnecting = value;
    },
    setMetrics: (value) => {
      latestMetrics = value;
    },
  });
const roomTransport = createAppRoomTransport({
  getSocket: () => socket,
  getRoom: () => room,
  getWatcher: () => publicationWatcher,
  getRemoteSharing: () => remoteSharing,
  getRemoteStream: () => remoteStream,
  getRemoteTimer: () => remoteTimer,
  setRemoteTimer: (value) => {
    remoteTimer = value;
  },
  setConnectionIssue: (value) => {
    connectionIssue = value;
  },
  sendFailure: () =>
    leaveRoom(
      'A conexão com o servidor foi perdida. A transmissão foi encerrada.',
      'error',
      false,
    ),
  render,
});
({ requestRoomSwitch, confirmRoomSwitch } = createRoomSwitchActions({
  isBusy: () => !!busy,
  isApplyingPreferences: () => applyingPreferences,
  isRecovering: () => signalRecovering,
  getDisplayName: () => displayName,
  getCurrentRoomCode: () => room?.code,
  getSwitchTarget: () => switchTarget,
  setSwitchTarget: (value) => {
    switchTarget = value;
  },
  setJoinCode: (value) => {
    joinCode = value;
  },
  setModal: (value) => {
    modal = value;
  },
  setActivePage: (value) => {
    activePage = value;
  },
  render,
  notify: (message) => notify(message),
  leaveRoom: () => leaveRoom(),
  connectRoom: (kind) => connectRoom(kind),
}));
function refreshAudioPublication(): void {
  if (multiState() && isLocalSharing() && localPublicationId)
    send({
      type: 'publish-state',
      publicationId: localPublicationId,
      sharing: true,
      audio: liveAudio(localStream).length > 0,
    });
}

let includeSystemAudio = false;
let excludeDiscordAudio = false;
let receiveMuted = true;
let receiveVolume = 1;
const appMedia = createAppMedia({
  root,
  getLocalStream: () => localStream,
  getRemoteStream: () => remoteStream,
  getActivePage: () => activePage,
  getNativeForeground: () => nativeForeground,
  hasDesktopApi: !!api,
  getMultiRoom: () => !!multiState(),
  getWatching: () => !!publicationWatcher.watching,
  getRoomRole: () => room?.role,
  getSharing: isLocalSharing,
  getReceiveMuted: () => receiveMuted,
  getReceiveVolume: () => receiveVolume,
  getFilteredAudioAvailable: () => !!filteredAudioPipeline,
});
const {
  syncPreviews,
  updatePlayback,
  renderAudioToggleButton,
  renderReceiveAudioControls,
  diagnosticsTrigger,
} = appMedia;

const stopFilteredAudioPipeline = createFilteredAudioStopper({
  api,
  getPipeline: () => filteredAudioPipeline,
  setPipeline: (value) => {
    filteredAudioPipeline = value;
  },
  getRemoveErrorListener: () => removeFilteredAudioErrorListener,
  setRemoveErrorListener: (value) => {
    removeFilteredAudioErrorListener = value;
  },
});
const notify = createNotifier({
  getTimer: () => toastTimer,
  setTimer: (value) => {
    toastTimer = value;
  },
  setNotice: (value) => {
    notice = value;
  },
  render,
});

let stopCaptureSession: (announce?: boolean) => void = () => undefined;
const { stopSharing, leaveRoom } = createSessionTerminationController(
  () => ({
    room,
    ownerId: roomState?.ownerId,
  }),
  {
    stopSharing: (announce) => stopCaptureSession(announce),
    logLeft: (reason) => recordLog('room.left', { reason }),
    clearSessionTimers: () => {
      clearTimeout(toastTimer);
      clearTimeout(resumeTimer);
      clearTimeout(resumeDeadline);
    },
    clearResumeState: () => {
      resumeToken = '';
      signalRecovering = false;
    },
    sendRoomClose: (type) => socket?.send({ type }),
    advanceSession: () => {
      sessionEpoch++;
    },
    clearPending,
    clearRemoteTimer: () => clearTimeout(remoteTimer),
    clearWatchMedia,
    resetWatchSelection: () => {
      publicationWatcher.setWatching(null);
      publicationWatcher.clearWatchRequest();
    },
    disposePeers: () => {
      peers?.dispose();
      peers = null;
    },
    disconnectSocket: () => {
      socket?.disconnect();
      socket = null;
    },
    stopRemoteMedia: () => {
      stopTracks(remoteStream);
      remoteStream = null;
    },
    resetRoomState: (nextNotice) => {
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
      notice = nextNotice;
    },
    render,
  },
);

function send(message: Parameters<SignalConnection['send']>[0]): boolean {
  return roomTransport.send(message);
}

function waitForVideo(): void {
  roomTransport.waitForVideo();
}

const { applyRoomState } = createAppSnapshotController({
  getMultiContext: () => ({
    roomCode: room?.code,
    selfId: room?.selfId,
    pendingKind: getPendingRoomKind(),
    signalRecovering,
    localPublicationId,
    publicationConfirmed,
    sharing: isLocalSharing(),
    hasLocalStream: !!localStream,
    watchRequest: publicationWatcher.watchRequest,
    watching: publicationWatcher.watching,
    hasPeers: !!peers,
  }),
  getLegacyContext: () => ({
    roomCode: room?.code,
    selfId: room?.selfId,
    pendingKind: getPendingRoomKind(),
    signalRecovering,
    previousPublisherId: roomState?.publisherId,
    hasPeers: !!peers,
    sharing: isLocalSharing(),
    hasLocalStream: !!localStream,
    remoteSharing,
  }),
  activateRoom: () => socket?.setRoomActive(true),
  finishInitialConnection: () => {
    clearPending();
    busy = null;
  },
  finishRecovery: () => {
    clearTimeout(resumeTimer);
    clearTimeout(resumeDeadline);
    signalRecovering = false;
    connectionReconnecting = false;
  },
  saveMultiSnapshot: (snapshot, nextRoom) => {
    roomState = snapshot;
    resumeToken = snapshot.resumeToken;
    room = nextRoom;
  },
  confirmPublication: () => {
    publicationConfirmed = true;
  },
  stopUnconfirmedPublication: () => {
    stopSharing(false);
    notice = {
      text: 'Sua transmissão foi encerrada. As outras telas continuam na sala.',
      kind: 'info',
    };
  },
  syncSubscribers: (members) =>
    syncRoomMembers(members, viewers, (id) => peers?.remove(id)),
  createPeers,
  offerSubscriber: (id) => {
    if (localStream) void peers?.offer(id, localStream);
  },
  setWatching: (selected) => publicationWatcher.setWatching(selected),
  clearWatchMedia,
  clearWatchRequest: () => publicationWatcher.clearWatchRequest(),
  createWatchPeers,
  requestPublication: (publicationId, requestId) =>
    send({ type: 'watch-publication', publicationId, requestId }),
  resetChangedPublisher: () => {
    stopSharing(false);
    peers?.dispose();
    peers = null;
    stopTracks(remoteStream);
    remoteStream = null;
    receiveMuted = true;
    latestMetrics = [];
    clearTimeout(remoteTimer);
  },
  saveLegacySnapshot: (snapshot, nextRoom) => {
    resumeToken = snapshot.resumeToken;
    roomState = snapshot;
    room = nextRoom;
  },
  syncViewers: (members) =>
    syncRoomMembers(members, viewers, (id) => peers?.remove(id)),
  sendHostState: (value) => send({ type: 'host-state', sharing: value }),
  offerViewer: (peerId) => {
    if (localStream) void peers?.offer(peerId, localStream);
  },
  setRemoteSharing: (value) => {
    remoteSharing = value;
  },
  stopRemotePlayback: () => {
    peers?.clear();
    stopTracks(remoteStream);
    remoteStream = null;
    latestMetrics = [];
    metricsStartedAt = 0;
    clearTimeout(remoteTimer);
  },
  startRemotePlayback: () => {
    metricsStartedAt = Date.now();
    waitForVideo();
  },
  notifyRecovered: () =>
    notify('Conexão com a sala recuperada.', 'success', true),
  render,
});

const onMessage = createApplicationMessages({
  getState: () => ({
    room,
    signalRecovering,
    sharing: isLocalSharing(),
    hasLocalStream: !!localStream,
    pendingKind: getPendingRoomKind(),
    displayName,
    viewers,
    remoteStream,
    connectionIssue,
    connectionReconnecting,
    latestMetrics,
    metricsStartedAt,
    multiRoom: !!multiState(),
    hasPendingRequest: hasPendingRoom(),
    hasRoom: !!room,
    localPublicationId,
    watchRequest: publicationWatcher.watchRequest,
    watching: publicationWatcher.watching,
    peers,
    watchPeers: publicationWatcher.watchPeers,
    remoteSharing,
    resumeToken,
  }),
  updateState: (patch) => {
    if (patch.room !== undefined) room = patch.room;
    if (patch.signalRecovering !== undefined)
      signalRecovering = patch.signalRecovering;
    if (patch.remoteStream !== undefined) remoteStream = patch.remoteStream;
    if (patch.connectionIssue !== undefined)
      connectionIssue = patch.connectionIssue;
    if (patch.connectionReconnecting !== undefined)
      connectionReconnecting = patch.connectionReconnecting;
    if (patch.latestMetrics !== undefined) latestMetrics = patch.latestMetrics;
    if (patch.metricsStartedAt !== undefined)
      metricsStartedAt = patch.metricsStartedAt;
    if (patch.remoteSharing !== undefined) remoteSharing = patch.remoteSharing;
    if (patch.resumeToken !== undefined) resumeToken = patch.resumeToken;
  },
  effects: {
    activateRoom: () => socket?.setRoomActive(true),
    clearResumeTimers: () => {
      clearTimeout(resumeTimer);
      clearTimeout(resumeDeadline);
    },
    clearPending,
    createPeers,
    clearViewers: () => viewers.clear(),
    addViewer: (viewer) => {
      viewers.set(viewer.peerId, createRoomMemberState(viewer.name));
    },
    offerViewer: (peerId) => {
      if (localStream) void peers?.offer(peerId, localStream);
    },
    sendHostState: (value) => send({ type: 'host-state', sharing: value }),
    waitForVideo,
    notifyRecovered: () =>
      notify('Conexão com a sala recuperada.', 'success', true),
    render,
    setReady: () => {
      busy = null;
    },
    removePeer: (peerId) => peers?.remove(peerId),
    log: recordLog,
    leaveRoomClosed: (text, kind, tellServer) =>
      leaveRoom(text, kind, tellServer),
    leaveRoomError: (text, kind, tellServer) =>
      leaveRoom(text, kind, tellServer),
    stopSharing,
    clearWatchMedia,
    clearWatchSelection: () => {
      publicationWatcher.setWatching(null);
      publicationWatcher.clearWatchRequest();
    },
    notifyError: (text, kind) => notify(text, kind),
    applyRoomState,
    stopRemotePlayback: (stream) => {
      latestMetrics = [];
      metricsStartedAt = 0;
      clearTimeout(remoteTimer);
      peers?.clear();
      stopTracks(stream);
    },
  },
});
const { connectRoom } = createConnectionController({
  getState: () => ({
    api,
    loaded,
    busy: !!busy,
    hasRoom: !!room,
    displayName,
    profilePhoto,
    joinCode,
    signalingUrl: config.signalingUrl,
    sessionEpoch,
    resumeToken,
    signalRecovering,
  }),
  setSocket: (connection) => {
    socket = connection;
  },
  setPending: setPendingRoom,
  setBusy: (value) => {
    busy = value;
  },
  setActivePage: (value) => {
    activePage = value;
  },
  setNotice: (value) => {
    notice = value;
  },
  saveDisplayName: (value) => preferenceStore.saveDisplayName(value),
  beginSession: () => ++sessionEpoch,
  isCurrentSession: (epoch) => epoch === sessionEpoch,
  onMessage,
  recordLog,
  render,
  notify,
  leaveRoom: (message, kind, tellServer) =>
    leaveRoom(message, kind, tellServer),
  disconnectCurrentSocket: () => socket?.disconnect(),
  stopPeers: () => {
    peers?.dispose();
    peers = null;
  },
  clearWatchMedia,
  stopRemoteMedia: () => {
    stopTracks(remoteStream);
    remoteStream = null;
  },
  clearMetrics: () => {
    latestMetrics = [];
  },
  setConnectionReconnecting: (value) => {
    connectionReconnecting = value;
  },
  setRecovering: (value) => {
    signalRecovering = value;
  },
  setResumeTimer: (timer) => {
    resumeTimer = timer;
  },
  setResumeDeadline: (timer) => {
    resumeDeadline = timer;
  },
  focusDisplayName: () =>
    (
      document.querySelector<HTMLInputElement>('#profile-name') ??
      document.querySelector<HTMLInputElement>('#display-name')
    )?.focus(),
  focusJoinCode: () =>
    document.querySelector<HTMLInputElement>('#room-code')?.focus(),
});

const captureActions = createAppCaptureController({
  getState: () => ({
    api,
    role: room?.role,
    sharing: isLocalSharing(),
    busy,
    applyingPreferences,
    pendingPreferences,
    qualityStatus,
    sessionEpoch,
    captureEpoch,
    qualityEpoch,
    modal,
    returnFocusAction,
    sources,
    sourcePage,
    selectedSource,
    preferences,
    captureSystemAudio: includeSystemAudio,
    excludeAppAudio: excludeDiscordAudio,
    config,
    multiRoom: !!multiState(),
    publicationCount: multiState()?.publications.length ?? 0,
    maxPublishers: multiState()?.maxPublishers ?? 0,
    localStream,
    filteredAudioPipeline,
    peers,
    viewers,
    receiveMuted,
    metricsStartedAt,
    latestMetrics,
    sharedSourceName,
    connectionIssue,
    localPublicationId,
    publicationConfirmed,
    removeRuntimeErrorListener: removeFilteredAudioErrorListener,
  }),
  setters: {
    busy: (value) => (busy = value),
    applyingPreferences: (value) => (applyingPreferences = value),
    pendingPreferences: (value) => (pendingPreferences = value),
    qualityStatus: (value) => (qualityStatus = value),
    captureEpoch: (value) => (captureEpoch = value),
    qualityEpoch: (value) => (qualityEpoch = value),
    modal: (value) => (modal = value),
    returnFocusAction: (value) => (returnFocusAction = value),
    sources: (value) => (sources = value),
    sourcePage: (value) => (sourcePage = value),
    selectedSource: (value) => (selectedSource = value),
    captureSystemAudio: (value) => (includeSystemAudio = value),
    excludeAppAudio: (value) => (excludeDiscordAudio = value),
    localStream: (value) => (localStream = value),
    filteredAudioPipeline: (value) => (filteredAudioPipeline = value),
    receiveMuted: (value) => (receiveMuted = value),
    metricsStartedAt: (value) => (metricsStartedAt = value),
    latestMetrics: (value) => (latestMetrics = value),
    sharedSourceName: (value) => (sharedSourceName = value),
    connectionIssue: (value) => (connectionIssue = value),
    localPublicationId: (value) => (localPublicationId = value),
    publicationConfirmed: (value) => (publicationConfirmed = value),
    removeRuntimeErrorListener: (value) =>
      (removeFilteredAudioErrorListener = value),
  },
  effects: {
    render,
    notify,
    send,
    updatePlayback,
    stopFilteredAudioPipeline,
    refreshAudioPublication,
    recordCaptureFailure: (error) =>
      recordLog('capture.failed', errorFields(error)),
    clearNotice: () => {
      notice = null;
    },
  },
});
const {
  openSources,
  cancelSources,
  startSharing,
  stopSharing: stopCaptureAction,
} = captureActions;
stopCaptureSession = stopCaptureAction;

const settingsController = createAppSettingsController({
  getState: () => ({
    api,
    busy: !!busy,
    inRoom: !!room,
    settingUrl,
    role: room?.role,
    preferences,
    applying: applyingPreferences,
    sessionEpoch,
    captureEpoch,
    qualityEpoch,
    localStream,
    peers,
  }),
  setters: {
    busy: (value) => (busy = value ? 'settings' : null),
    config: (value) => (config = value),
    settingUrl: (value) => (settingUrl = value),
    closeModal: () => (modal = null),
    qualityEpoch: (value) => (qualityEpoch = value),
    preferences: (value) => (preferences = value),
    savePreferences: (value) => preferenceStore.saveStreamPreferences(value),
    pendingPreferences: (value) => (pendingPreferences = value),
    applying: (value) => (applyingPreferences = value),
    status: (value) => (qualityStatus = value),
  },
  document,
  root,
  render,
  notify,
});
const { saveSettings, applyPreferences, readQualityControls } =
  settingsController;

const appViewController = createApplicationViewBindings({
  root,
  announcements,
  getState: () => ({
    preferences,
    pendingPreferences,
    applyingPreferences,
    sharing: isLocalSharing(),
    qualityStatus,
    room,
    roomState,
    multi: multiState(),
    viewers,
    watchingPublisherId: publicationWatcher.watching?.publisherId,
    watchingRemote: !!publicationWatcher.watching,
    remoteStream,
    localStream,
    sharedSourceName,
    remoteSharing,
    busy,
    connectionIssue,
    connectionReconnecting,
    signalRecovering,
    metrics: latestMetrics,
    incomingMetrics: publicationWatcher.incomingMetrics,
    metricsStartedAt,
    incomingMetricsStartedAt: publicationWatcher.incomingMetricsStartedAt,
    update,
    config,
    serverUrl: settingUrl,
    apiAvailable: !!api,
    loaded,
    testingConnection,
    connectionCheck,
    displayName,
    profilePhoto,
    editingName,
    joinCode,
    modal,
    isRoomOwner: roomState?.ownerId === room?.selfId,
    sources,
    selectedSource,
    sourcePage,
    page: activePage,
    sidebarCollapsed,
    notice,
    updateDismissed,
    updatePrompted,
    includeSystemAudio,
    excludeDiscordAudio,
    returnFocusAction,
  }),
  renderReceiveAudioControls,
  renderAudioToggleButton,
  setModal: (value) => {
    modal = value;
  },
  setUpdatePrompted: (value) => {
    updatePrompted = value;
  },
  setDeferredRender: (value) => {
    deferredRender = value;
  },
  renderDiagnosticsTrigger: diagnosticsTrigger,
  updatePlayback,
  syncPreviews,
});
const patchMetrics = appViewController.patchMetrics;

const { toggleSidebar, testConnection } = createInterfaceActions({
  root,
  sidebarCollapsed: () => sidebarCollapsed,
  setSidebarCollapsed: (value) => {
    sidebarCollapsed = value;
  },
  saveSidebarCollapsed: (value) => preferenceStore.saveSidebarCollapsed(value),
  connection: () => ({
    api,
    settingUrl,
    busy: !!busy,
    inRoom: !!room,
    testing: testingConnection,
    setTesting: (value) => {
      testingConnection = value;
    },
    setConnectionCheck: (value) => {
      connectionCheck = value;
    },
    getSettingUrl: () => settingUrl,
    render,
    notify: (message, kind) => notify(message, kind),
  }),
});

function render(): void {
  appViewController.render();
}

bindAppActionRouter({
  root,
  getState: () => ({
    api,
    room,
    roomState,
    multi: multiState(),
    busy,
    sharing: isLocalSharing(),
    localStream,
    filteredAudioAvailable: !!filteredAudioPipeline,
    watching: publicationWatcher.watching,
    sourcePage,
    selectedSource,
    sources,
    activePage,
    previousPage,
    configUrl: config.signalingUrl,
    receiveMuted,
    receiveVolume,
    preferences,
    latestMetrics,
    incomingMetrics: publicationWatcher.incomingMetrics,
    signalRecovering,
  }),
  send,
  selectPublication:
    publicationWatcher.selectPublication.bind(publicationWatcher),
  cancelSources,
  openSources,
  startSharing,
  stopSharing,
  notify,
  leaveRoom,
  connectRoom,
  confirmRoomSwitch: () => void confirmRoomSwitch(),
  requestCreate: () => requestRoomSwitch({ kind: 'create' }),
  toggleSidebar,
  testConnection: () => void testConnection(),
  render,
  updateState: (patch) => {
    if ('sourcePage' in patch) sourcePage = patch.sourcePage!;
    if ('selectedSource' in patch) selectedSource = patch.selectedSource!;
    if ('activePage' in patch) activePage = patch.activePage!;
    if ('previousPage' in patch) previousPage = patch.previousPage!;
    if ('modal' in patch) modal = patch.modal!;
    if ('switchTarget' in patch) switchTarget = patch.switchTarget!;
    if ('returnFocusAction' in patch)
      returnFocusAction = patch.returnFocusAction!;
    if ('editingName' in patch) editingName = patch.editingName!;
    if ('notice' in patch) notice = patch.notice!;
    if ('settingUrl' in patch) settingUrl = patch.settingUrl!;
    if ('connectionCheck' in patch) connectionCheck = patch.connectionCheck!;
    if ('updateDismissed' in patch) updateDismissed = patch.updateDismissed!;
    if ('joinCode' in patch) joinCode = patch.joinCode!;
    if ('receiveMuted' in patch) receiveMuted = patch.receiveMuted!;
    if ('receiveVolume' in patch) receiveVolume = patch.receiveVolume!;
  },
});

bindApplicationInputEvents({
  document,
  root,
  getState: () => ({
    displayName,
    profilePhoto,
    joinCode,
    room,
    systemAudioSupported: config.systemAudioSupported,
    modal,
    activePage,
    previousPage,
    busy: !!busy,
    sourcePage,
  }),
  updateState: (patch) => {
    if ('displayName' in patch) displayName = patch.displayName!;
    if ('profilePhoto' in patch) profilePhoto = patch.profilePhoto!;
    if ('joinCode' in patch) joinCode = patch.joinCode!;
    if ('settingUrl' in patch) {
      settingUrl = patch.settingUrl!;
      connectionCheck = '';
    }
    if ('receiveVolume' in patch) receiveVolume = patch.receiveVolume!;
    if ('receiveMuted' in patch) receiveMuted = patch.receiveMuted!;
    if ('editingName' in patch) editingName = patch.editingName!;
    if ('includeSystemAudio' in patch)
      includeSystemAudio = patch.includeSystemAudio!;
    if ('excludeDiscordAudio' in patch)
      excludeDiscordAudio = patch.excludeDiscordAudio!;
    if ('activePage' in patch) activePage = patch.activePage!;
    if ('modal' in patch) modal = patch.modal!;
    if ('updateDismissed' in patch) updateDismissed = patch.updateDismissed!;
  },
  updatePlayback,
  saveDisplayName: (name) => preferenceStore.saveDisplayName(name),
  saveProfilePhoto: (photo) => preferenceStore.saveProfilePhoto(photo),
  updateRoomProfile: (name, photo) => {
    if (!room) return;
    const epoch = sessionEpoch;
    void compactProfileAvatar(photo).then((avatar) => {
      if (room && sessionEpoch === epoch)
        send({ type: 'update-profile', name, avatar });
    });
  },
  render,
  notify,
  requestRoomSwitch,
  connectRoom,
  saveSettings,
  changeQuality: (isVideoBitrate, prefix) =>
    void applyPreferences(readQualityControls(isVideoBitrate, prefix)),
  cancelSources,
});

startApplicationRuntime({
  getState: () => ({
    api,
    deferredRender,
    sharing: isLocalSharing(),
    localStream,
    remoteStream,
    room,
    roomState,
    sessionEpoch,
    nativeForeground,
    config,
    settingUrl,
    loaded,
    update,
    peers,
    socket,
  }),
  updateState: (patch) => {
    if ('sessionEpoch' in patch) sessionEpoch = patch.sessionEpoch!;
    if ('nativeForeground' in patch) nativeForeground = patch.nativeForeground!;
    if ('config' in patch) config = patch.config!;
    if ('settingUrl' in patch) settingUrl = patch.settingUrl!;
    if ('loaded' in patch) loaded = patch.loaded!;
    if ('update' in patch) update = patch.update!;
  },
  render,
  syncPreviews,
  patchMetrics,
  publicationWatcher,
  hasLiveAudio: (stream) => liveAudio(stream).length > 0,
  stopTracks,
  notify: (message, kind) => notify(message, kind),
});

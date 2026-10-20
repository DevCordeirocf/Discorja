import type { CaptureSource, DiscorjaAPI } from '../../../shared/protocol';
import type { StreamPreferences } from '../../../shared/quality';
import type { FilteredAudioPipeline } from '../../media/audio-capture';
import { RoomPeers } from '../../media/rtc';
import {
  bindCaptureTrackEvents,
  liveAudioTracks,
  stopTracks,
} from './media-tracks';
import { prepareShareCapture } from './prepare-share';
import { publishStartedCapture } from './publish-share';
import { activateShareCapture } from './activate-share';

export async function startSharing(deps: {
  api: DiscorjaAPI | undefined;
  busy: boolean;
  applyingPreferences: boolean;
  getRoomRole(): 'host' | 'viewer' | undefined;
  sharing: boolean;
  selectedSource: string;
  sources: CaptureSource[];
  getSessionEpoch(): number;
  getCaptureEpoch(): number;
  preferences: StreamPreferences;
  captureSystemAudio: boolean;
  excludeAppAudio: boolean;
  systemAudioSupported: boolean;
  multiRoom: boolean;
  publicationCount: number;
  maxPublishers: number;
  getLocalStream(): MediaStream | null;
  getFilteredAudioPipeline(): FilteredAudioPipeline | null;
  getPeers(): RoomPeers | null;
  viewers: Map<
    string,
    { connected: boolean; failed: boolean; reconnecting: boolean }
  >;
  send(message: import('../../../shared/protocol').ClientMessage): boolean;
  setCaptureEpoch(value: number): void;
  setReceiveMuted(value: boolean): void;
  updatePlayback(): void;
  setBusy(value: boolean): void;
  setModal(value: null): void;
  setActivePipeline(pipeline: FilteredAudioPipeline | null): void;
  isActivePipeline(pipeline: FilteredAudioPipeline): boolean;
  setRemoveRuntimeErrorListener(remove: (() => void) | null): void;
  setLocalStream(stream: MediaStream | null): void;
  setSharing(value: boolean): void;
  setMetricsStartedAt(value: number): void;
  clearMetrics(): void;
  setSharedSourceName(value: string): void;
  setConnectionIssue(value: string): void;
  setPublicationId(value: string): void;
  setPublicationConfirmed(value: boolean): void;
  render(): void;
  notify(message: string, kind?: 'error' | 'info' | 'success'): void;
  logFailure(error: unknown): void;
  stopSharing(): void;
  stopFilteredAudioPipeline(): void;
  refreshAudioPublication(): void;
}): Promise<void> {
  const { api, getRoomRole, sources, selectedSource, preferences } = deps;
  if (
    !api ||
    deps.busy ||
    deps.applyingPreferences ||
    getRoomRole() !== 'host' ||
    deps.sharing ||
    !selectedSource
  )
    return;

  const sessionEpoch = deps.getSessionEpoch();
  const attempt = deps.getCaptureEpoch() + 1;
  deps.setCaptureEpoch(attempt);
  const selectedPreferences = { ...preferences };
  const source = sources.find((item) => item.id === selectedSource);
  if (!source) return;
  const captureAudio = deps.captureSystemAudio && deps.systemAudioSupported;
  const captureWithoutAppAudio = captureAudio && deps.excludeAppAudio;
  if (deps.multiRoom && deps.publicationCount >= deps.maxPublishers) {
    deps.setModal(null);
    deps.notify('Os espaços de transmissão estão ocupados.', 'info');
    return;
  }
  if (deps.multiRoom && captureAudio && !captureWithoutAppAudio) {
    deps.setReceiveMuted(true);
    deps.updatePlayback();
  }
  const current = () =>
    sessionEpoch === deps.getSessionEpoch() &&
    attempt === deps.getCaptureEpoch() &&
    getRoomRole() === 'host';
  deps.setBusy(true);
  deps.render();
  let stream: MediaStream | null = null;
  let audioPipeline: FilteredAudioPipeline | null = null;
  try {
    const prepared = await prepareShareCapture({
      api,
      source,
      preferences: selectedPreferences,
      captureSystemAudio: captureAudio,
      excludeDiscorjaAudio: deps.excludeAppAudio,
      isCurrent: current,
      notify: (message, kind) => deps.notify(message, kind),
      setActivePipeline: deps.setActivePipeline,
      isActivePipeline: deps.isActivePipeline,
      registerRuntimeError: (handler) => api.onFilteredAudioError(handler),
      setRemoveRuntimeErrorListener: deps.setRemoveRuntimeErrorListener,
      onRuntimeError: (pipeline, message) => {
        if (!deps.isActivePipeline(pipeline)) return;
        deps.stopFilteredAudioPipeline();
        if (deps.getLocalStream() === stream) {
          void deps
            .getPeers()
            ?.stopAudio()
            .catch(() => undefined);
          deps.refreshAudioPublication();
          deps.render();
        }
        deps.notify(message, 'error');
      },
      stopActivePipeline: deps.stopFilteredAudioPipeline,
    });
    if (prepared.status === 'stale') return;
    stream = prepared.stream;
    audioPipeline = prepared.audioPipeline;
    if (
      !(await activateShareCapture({
        api,
        stream,
        preferences: selectedPreferences,
        configurePeers: async (next) => {
          await deps.getPeers()?.configure(next);
        },
        isCurrent: current,
        stopAudioPipeline: deps.stopFilteredAudioPipeline,
      }))
    )
      return;

    deps.setLocalStream(stream);
    deps.setSharing(true);
    deps.setMetricsStartedAt(Date.now());
    deps.clearMetrics();
    deps.setSharedSourceName(source.name);
    deps.setModal(null);
    deps.setBusy(false);
    deps.setConnectionIssue('');
    bindCaptureTrackEvents(stream!, {
      onVideoEnded: () => {
        if (deps.getLocalStream() !== stream) return;
        deps.stopSharing();
        deps.notify(
          'O compartilhamento foi interrompido. A sala continua aberta.',
        );
      },
      onAudioEnded: (track) => {
        if (deps.getLocalStream() !== stream) return;
        if (track === deps.getFilteredAudioPipeline()?.track) {
          deps.stopFilteredAudioPipeline();
          deps.notify(
            'A captura que exclui o Discord foi interrompida. O vídeo continua sem áudio.',
            'error',
          );
        } else {
          deps.notify(
            'A captura de som foi interrompida. O vídeo continua; reinicie o compartilhamento para tentar novamente.',
            'error',
          );
        }
        void deps
          .getPeers()
          ?.stopAudio()
          .catch(() => undefined);
        deps.refreshAudioPublication();
        deps.render();
      },
    });
    if (captureAudio && !liveAudioTracks(stream).length)
      deps.notify(
        'O Windows não forneceu som. O vídeo continua; confira a saída de áudio e reinicie para tentar novamente.',
        'error',
      );
    publishStartedCapture({
      stream: stream!,
      multiRoom: deps.multiRoom,
      send: deps.send,
      viewers: deps.viewers,
      offerViewer: (peerId, mediaStream) => {
        void deps.getPeers()?.offer(peerId, mediaStream);
      },
      setPublicationId: deps.setPublicationId,
      setPublicationConfirmed: deps.setPublicationConfirmed,
      render: deps.render,
    });
  } catch (error) {
    await audioPipeline?.dispose();
    if (deps.getFilteredAudioPipeline() === audioPipeline)
      deps.stopFilteredAudioPipeline();
    stopTracks(stream);
    deps.logFailure(error);
    if (!current()) return;
    deps.setBusy(false);
    deps.setModal(null);
    void api.setSharing(false).catch(() => undefined);
    const cancelled =
      error instanceof DOMException &&
      (error.name === 'NotAllowedError' || error.name === 'AbortError');
    deps.notify(
      cancelled
        ? 'O compartilhamento foi cancelado. Você pode escolher uma tela novamente.'
        : error instanceof Error
          ? `Não foi possível compartilhar: ${error.message}`
          : 'Não foi possível iniciar a captura.',
      cancelled ? 'info' : 'error',
    );
  } finally {
    if (current()) void api.cancelCapture().catch(() => undefined);
  }
}

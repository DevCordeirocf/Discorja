import { liveAudioTracks } from '../features/capture';
import { icon } from '../ui/components/icons';

export interface SendAudioControlState {
  role?: 'host' | 'viewer';
  sharing: boolean;
  localStream: MediaStream | null;
}

export interface ReceiveAudioControlState {
  remoteStream: MediaStream | null;
  multiRoom: boolean;
  localStream: MediaStream | null;
  receiveMuted: boolean;
  receiveVolume: number;
  filteredAudioAvailable: boolean;
}

export function renderAudioToggleButton(state: SendAudioControlState): string {
  if (state.role !== 'host' || !state.sharing) return '';
  const tracks = liveAudioTracks(state.localStream);
  if (!tracks.length) return '';
  const silenced = tracks.every((track) => !track.enabled);
  return `<button class="button subtle stage-audio-toggle" data-action="toggle-send-audio" aria-pressed="${silenced}" title="${silenced ? 'Reativar o áudio enviado' : 'Silenciar o áudio enviado'}">${silenced ? 'Ativar áudio' : 'Silenciar áudio'}</button>`;
}

export function renderReceiveAudioControls(
  state: ReceiveAudioControlState,
): string {
  if (!state.remoteStream || !liveAudioTracks(state.remoteStream).length)
    return '';
  const blocked =
    state.multiRoom &&
    liveAudioTracks(state.localStream).length > 0 &&
    !state.filteredAudioAvailable;
  const muted = state.receiveMuted || blocked || state.receiveVolume === 0;
  const muteLabel = muted
    ? 'Ativar o áudio da transmissão'
    : 'Silenciar o áudio da transmissão';
  const blockedLabel =
    'A reprodução está bloqueada enquanto o áudio geral do computador é capturado';
  const volumePercent = Math.round(state.receiveVolume * 100);
  return `<div class="player-audio-controls" role="group" aria-label="Controles de áudio da transmissão"><button class="player-audio-mute" data-action="toggle-receive-audio" aria-pressed="${!muted}" aria-label="${blocked ? blockedLabel : muteLabel}" title="${blocked ? blockedLabel : muteLabel}" ${blocked ? 'disabled' : ''}>${icon(muted ? 'volume-muted' : 'volume')}</button><label class="player-volume-control"><span class="sr-only">Volume da transmissão</span><input id="receive-volume" type="range" min="0" max="100" step="1" value="${volumePercent}" aria-label="Volume da transmissão" ${blocked ? 'disabled' : ''}><output id="receive-volume-value" for="receive-volume">${volumePercent}%</output></label></div>`;
}

import { icon } from '../components/icons';
import { renderAudioToggleButton } from '../../views/audio-controls';
import { renderReceiveAudioControls } from '../../views/audio-controls';
import { updateRoomPlayback, syncRoomPreviews } from '../media/media-playback';

type AppMediaOptions = {
  root: HTMLElement;
  getLocalStream: () => MediaStream | null;
  getRemoteStream: () => MediaStream | null;
  getActivePage: () => string;
  getNativeForeground: () => boolean;
  hasDesktopApi: boolean;
  getMultiRoom: () => boolean;
  getWatching: () => boolean;
  getRoomRole: () => 'host' | 'viewer' | undefined;
  getSharing: () => boolean;
  getReceiveMuted: () => boolean;
  getReceiveVolume: () => number;
  getFilteredAudioAvailable: () => boolean;
};

export function createAppMedia(options: AppMediaOptions) {
  return {
    syncPreviews: () =>
      syncRoomPreviews({
        root: options.root,
        document,
        localStream: options.getLocalStream(),
        page: options.getActivePage(),
        nativeForeground: options.getNativeForeground(),
        hasDesktopApi: options.hasDesktopApi,
        multiRoom: options.getMultiRoom(),
        watching: options.getWatching(),
        roomRole: options.getRoomRole(),
      }),
    updatePlayback: () =>
      updateRoomPlayback(options.root, {
        volume: options.getReceiveVolume(),
        muted: options.getReceiveMuted(),
        multiRoom: options.getMultiRoom(),
        watching: options.getWatching(),
        localStream: options.getLocalStream(),
        filteredAudioAvailable: options.getFilteredAudioAvailable(),
        roomRole: options.getRoomRole(),
      }),
    renderAudioToggleButton: () =>
      renderAudioToggleButton({
        role: options.getRoomRole(),
        sharing: options.getSharing(),
        localStream: options.getLocalStream(),
      }),
    renderReceiveAudioControls: () =>
      renderReceiveAudioControls({
        remoteStream: options.getRemoteStream(),
        localStream: options.getLocalStream(),
        multiRoom: options.getMultiRoom(),
        receiveMuted: options.getReceiveMuted(),
        receiveVolume: options.getReceiveVolume(),
        filteredAudioAvailable: options.getFilteredAudioAvailable(),
      }),
    diagnosticsTrigger: () =>
      `<button class="diagnostics-trigger" data-action="show-diagnostics" aria-label="Abrir diagnóstico da conexão" title="Diagnóstico">${icon('network')}</button>`,
  };
}

import { liveAudioTracks } from '../../features/capture';
import { syncLocalPreview } from './preview';

export interface PlaybackState {
  volume: number;
  muted: boolean;
  multiRoom: boolean;
  watching: boolean;
  localStream: MediaStream | null;
  filteredAudioAvailable: boolean;
  roomRole?: 'host' | 'viewer';
}

export function updateRoomPlayback(
  root: HTMLElement,
  state: PlaybackState,
): void {
  const video = root.querySelector<HTMLVideoElement>('#stream-video');
  if (!video) return;
  video.controls = false;
  video.volume = state.volume;
  video.muted = state.multiRoom
    ? !state.watching ||
      state.muted ||
      (liveAudioTracks(state.localStream).length > 0 &&
        !state.filteredAudioAvailable)
    : state.roomRole !== 'viewer' || state.muted;
}

export function syncRoomPreviews(options: {
  root: HTMLElement;
  document: Document;
  localStream: MediaStream | null;
  page: string;
  nativeForeground: boolean;
  hasDesktopApi: boolean;
  multiRoom: boolean;
  watching: boolean;
  roomRole?: 'host' | 'viewer';
}): void {
  const { localStream, root, document } = options;
  if (!localStream) return;
  const foreground =
    options.page === 'room' &&
    options.nativeForeground &&
    document.visibilityState === 'visible' &&
    (options.hasDesktopApi || document.hasFocus());
  const main = root.querySelector<HTMLVideoElement>('#stream-video');
  if (
    main &&
    (options.multiRoom ? !options.watching : options.roomRole === 'host')
  )
    syncLocalPreview(main, localStream, foreground);
  const small = root.querySelector<HTMLVideoElement>('#local-preview');
  if (small) syncLocalPreview(small, localStream, foreground);
}

export async function enterRoomFullscreen(
  root: HTMLElement,
  notifyError: () => void,
): Promise<void> {
  try {
    await root
      .querySelector<HTMLVideoElement>('#stream-video')
      ?.requestFullscreen();
  } catch {
    notifyError();
  }
}

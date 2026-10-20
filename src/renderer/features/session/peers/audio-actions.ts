import { liveAudioTracks } from '../../capture';

export function toggleOutgoingAudio(options: {
  role?: 'host' | 'viewer';
  sharing: boolean;
  stream: MediaStream | null;
  render: () => void;
}): boolean {
  if (options.role !== 'host' || !options.sharing) return false;
  const tracks = liveAudioTracks(options.stream);
  const enable = tracks.every((track) => !track.enabled);
  for (const track of tracks) track.enabled = enable;
  options.render();
  return true;
}

export function toggleIncomingAudio(options: {
  multiRoom: boolean;
  watching: boolean;
  role?: 'host' | 'viewer';
  localStream: MediaStream | null;
  filteredAudioAvailable: boolean;
  muted: boolean;
  volume: number;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  render: () => void;
  video: HTMLVideoElement | null;
  notifyError: (message: string) => void;
}): boolean {
  if (
    options.multiRoom
      ? !options.watching ||
        (liveAudioTracks(options.localStream).length > 0 &&
          !options.filteredAudioAvailable)
      : options.role !== 'viewer'
  )
    return false;
  const muted = !options.muted;
  options.setMuted(muted);
  if (!muted && options.volume === 0) options.setVolume(0.8);
  options.render();
  if (options.video && !muted)
    void options.video.play().catch(() => {
      options.setMuted(true);
      options.notifyError(
        'Não foi possível reproduzir o som. Clique em ouvir para tentar novamente.',
      );
    });
  return true;
}

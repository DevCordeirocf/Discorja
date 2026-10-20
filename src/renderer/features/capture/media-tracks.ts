export function liveAudioTracks(
  stream: MediaStream | null,
): MediaStreamTrack[] {
  return (
    stream?.getAudioTracks().filter((track) => track.readyState === 'live') ??
    []
  );
}

export function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
}

export function prepareCapturedTracks(
  stream: MediaStream,
  contentHint: string,
): void {
  if (!stream.getVideoTracks().some((track) => track.readyState === 'live'))
    throw new Error('A captura foi encerrada antes de iniciar.');
  for (const track of stream.getVideoTracks()) track.contentHint = contentHint;
}

export function bindCaptureTrackEvents(
  stream: MediaStream,
  handlers: {
    onVideoEnded: () => void;
    onAudioEnded: (track: MediaStreamTrack) => void;
  },
): void {
  for (const track of stream.getVideoTracks())
    track.onended = handlers.onVideoEnded;
  for (const track of stream.getAudioTracks()) {
    track.contentHint = 'music';
    track.onended = () => handlers.onAudioEnded(track);
  }
}

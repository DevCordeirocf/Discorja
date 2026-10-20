export async function captureDisplay(
  video: MediaTrackConstraints,
  audio: MediaTrackConstraints | false,
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video, audio });
  if (!audio) {
    stream.getAudioTracks().forEach((track) => {
      stream.removeTrack(track);
      track.stop();
    });
  }
  return stream;
}

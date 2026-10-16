/** Suspend only the local player. Never clone, constrain, disable or stop capture tracks. */
export function syncLocalPreview(
  video: HTMLVideoElement,
  stream: MediaStream,
  foreground: boolean,
): void {
  video.muted = true;
  if (!foreground) {
    video.pause();
    video.srcObject = null;
    video.dataset.previewSuspended = 'true';
    return;
  }
  delete video.dataset.previewSuspended;
  if (video.srcObject !== stream) video.srcObject = stream;
  if (video.paused) void video.play().catch(() => undefined);
}

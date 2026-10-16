/** Keep audio separate from video controls and reserve transport overhead per viewer. */
export const AUDIO_MAX_BITRATE = 128_000;
export const AUDIO_UPLOAD_RESERVE = 160_000;

export const SYSTEM_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: 2 },
  sampleRate: { ideal: 48000 },
};

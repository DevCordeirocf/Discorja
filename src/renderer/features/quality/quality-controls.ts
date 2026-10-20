import {
  QUALITY_PRESETS,
  normalizePreferences,
  type StreamPreferences,
} from '../../../shared/quality';

export function readQualityControls(
  document: Document,
  root: ParentNode,
  current: StreamPreferences,
  bitrateChanged = false,
  prefix = '',
): StreamPreferences {
  const preset = document.querySelector<HTMLSelectElement>(
    `#${prefix}quality-preset`,
  )?.value;
  const requestedBitrate = bitrateChanged
    ? Number(
        root.querySelector<HTMLInputElement>(`#${prefix}video-bitrate`)?.value,
      )
    : undefined;
  const presetBitrate = preset
    ? QUALITY_PRESETS[preset as keyof typeof QUALITY_PRESETS].bitrate /
      1_000_000
    : undefined;
  return normalizePreferences({
    videoBitrateMbps:
      bitrateChanged && requestedBitrate === presetBitrate
        ? undefined
        : (requestedBitrate ?? current.videoBitrateMbps),
    preferredCodec: document.querySelector<HTMLSelectElement>(
      `#${prefix}preferred-codec`,
    )?.value,
    preset,
    content: document.querySelector<HTMLSelectElement>(`#${prefix}content-mode`)
      ?.value,
    adaptive: document.querySelector<HTMLInputElement>(
      `#${prefix}adaptive-quality`,
    )?.checked,
    maxUploadMbps: Number(
      document.querySelector<HTMLInputElement>(`#${prefix}upload-budget`)
        ?.value,
    ),
  });
}

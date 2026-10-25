import {
  QUALITY_PRESETS,
  normalizePreferences,
  type StreamPreferences,
} from '../../../shared/quality';

/** Reads a select by id or the checked radio of the group with that name. */
function choice(document: Document, id: string): string | undefined {
  return (
    document.querySelector<HTMLSelectElement>(`select#${id}`)?.value ??
    document.querySelector<HTMLInputElement>(`input[name="${id}"]:checked`)
      ?.value
  );
}

export function readQualityControls(
  document: Document,
  root: ParentNode,
  current: StreamPreferences,
  bitrateChanged = false,
  prefix = '',
): StreamPreferences {
  const preset = choice(document, `${prefix}quality-preset`);
  const fps = choice(document, `${prefix}fps`);
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
    preferredCodec: choice(document, `${prefix}preferred-codec`),
    preset,
    fps: fps ? Number(fps) : current.fps,
    content: choice(document, `${prefix}content-mode`),
    adaptive: document.querySelector<HTMLInputElement>(
      `#${prefix}adaptive-quality`,
    )?.checked,
    maxUploadMbps: Number(
      document.querySelector<HTMLInputElement>(`#${prefix}upload-budget`)
        ?.value,
    ),
  });
}

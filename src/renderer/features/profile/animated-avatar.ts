import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { sniffImage } from '../../../shared/image-magic';
import { AVATAR_MAX, AVATAR_MAX_SIDE } from '../../../shared/validation';

export interface GifBudget {
  size: number;
  frames: number;
  colors: number;
}

/** Tried in order until the encoded GIF fits one avatar message. */
export const GIF_BUDGETS: readonly GifBudget[] = [
  { size: 128, frames: 48, colors: 128 },
  { size: 128, frames: 32, colors: 64 },
  { size: 112, frames: 24, colors: 64 },
  { size: 96, frames: 24, colors: 32 },
  { size: 80, frames: 16, colors: 32 },
];
export const MAX_ANIMATION_MS = 6_000;
const MAX_SOURCE_FRAMES = 300;
const BACKGROUND = '#22232d';

/**
 * Chooses which source frames to keep: those inside the first MAX_ANIMATION_MS,
 * sampled evenly to at most `maxFrames`, each lasting until the next kept one.
 */
export function planFrames(
  durationsMs: readonly number[],
  maxFrames: number,
  maxDurationMs = MAX_ANIMATION_MS,
): { index: number; delay: number }[] {
  const starts: number[] = [];
  let elapsed = 0;
  for (const duration of durationsMs) {
    if (elapsed >= maxDurationMs) break;
    starts.push(elapsed);
    elapsed += Math.max(20, duration || 100);
  }
  const total = Math.min(elapsed, maxDurationMs);
  if (!starts.length) return [];
  const step = Math.max(1, starts.length / maxFrames);
  const picked: number[] = [];
  for (let position = 0; position < starts.length; position += step)
    picked.push(Math.floor(position));
  return [...new Set(picked)].map((index, order, list) => {
    const next = order + 1 < list.length ? starts[list[order + 1]] : total;
    return { index, delay: Math.max(20, Math.round(next - starts[index])) };
  });
}

function toDataUrl(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return `data:image/gif;base64,${btoa(binary)}`;
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve));

/**
 * Turns an animated GIF or WebP into a small square GIF that fits a protocol 5
 * avatar. Small square GIFs are kept as they are.
 */
export async function processAnimatedFile(
  file: Blob,
  type: 'image/gif' | 'image/webp',
): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const original = sniffImage(data);
  if (
    type === 'image/gif' &&
    original?.type === 'gif' &&
    original.width &&
    original.height &&
    original.width <= AVATAR_MAX_SIDE &&
    original.height <= AVATAR_MAX_SIDE &&
    Math.abs(original.width - original.height) <= 2
  ) {
    const kept = toDataUrl(data);
    if (kept.length <= AVATAR_MAX) return kept;
  }
  if (typeof ImageDecoder === 'undefined')
    throw new Error('Este computador não consegue ler GIFs animados.');
  const decoder = new ImageDecoder({ data, type });
  try {
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    const count = Math.min(track?.frameCount ?? 1, MAX_SOURCE_FRAMES);
    const largest = GIF_BUDGETS[0];
    const crop = new OffscreenCanvas(largest.size, largest.size);
    const context = crop.getContext('2d');
    if (!context) throw new Error('Não foi possível processar o GIF.');
    const frames: { bitmap: ImageBitmap; duration: number }[] = [];
    let elapsed = 0;
    for (let index = 0; index < count && elapsed < MAX_ANIMATION_MS; index++) {
      const { image } = await decoder.decode({ frameIndex: index });
      try {
        const side = Math.min(image.displayWidth, image.displayHeight);
        context.fillStyle = BACKGROUND;
        context.fillRect(0, 0, largest.size, largest.size);
        context.drawImage(
          image,
          (image.displayWidth - side) / 2,
          (image.displayHeight - side) / 2,
          side,
          side,
          0,
          0,
          largest.size,
          largest.size,
        );
        const duration = (image.duration ?? 100_000) / 1000;
        frames.push({ bitmap: await createImageBitmap(crop), duration });
        elapsed += Math.max(20, duration);
      } finally {
        image.close();
      }
      if (index % 8 === 7) await pause();
    }
    try {
      for (const budget of GIF_BUDGETS) {
        const plan = planFrames(
          frames.map((frame) => frame.duration),
          budget.frames,
        );
        const canvas = new OffscreenCanvas(budget.size, budget.size);
        const target = canvas.getContext('2d', { willReadFrequently: true });
        if (!target) break;
        const gif = GIFEncoder();
        for (const [order, step] of plan.entries()) {
          target.drawImage(
            frames[step.index].bitmap,
            0,
            0,
            budget.size,
            budget.size,
          );
          const rgba = target.getImageData(0, 0, budget.size, budget.size).data;
          const palette = quantize(rgba, budget.colors);
          gif.writeFrame(
            applyPalette(rgba, palette),
            budget.size,
            budget.size,
            {
              palette,
              delay: step.delay,
              ...(order === 0 ? { repeat: 0 } : {}),
            },
          );
          if (order % 6 === 5) await pause();
        }
        gif.finish();
        const result = toDataUrl(gif.bytes());
        if (result.length <= AVATAR_MAX) return result;
      }
    } finally {
      for (const frame of frames) frame.bitmap.close();
    }
    throw new Error('Esse GIF é grande demais. Tente um mais curto.');
  } finally {
    decoder.close();
  }
}

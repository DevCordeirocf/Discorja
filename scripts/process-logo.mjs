import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const input = new URL(
  '../assets/brand/discorja-grafite-lilas.png',
  import.meta.url,
);
const output = new URL('../src/renderer/assets/logo.png', import.meta.url);
const png = readFileSync(input);
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
const bitDepth = png[24];
const colorType = png[25];

if (bitDepth !== 8 || colorType !== 2 || png[28] !== 0) {
  throw new Error(
    'A logo de origem precisa ser PNG RGB de 8 bits sem entrelaçamento.',
  );
}

const chunks = [];
for (let offset = 8; offset < png.length;) {
  const length = png.readUInt32BE(offset);
  const type = png.toString('ascii', offset + 4, offset + 8);
  if (type === 'IDAT')
    chunks.push(png.subarray(offset + 8, offset + 8 + length));
  offset += length + 12;
}

const bytesPerPixel = 3;
const stride = width * bytesPerPixel;
const filtered = inflateSync(Buffer.concat(chunks));
const rgb = Buffer.alloc(stride * height);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

for (let y = 0; y < height; y++) {
  const filter = filtered[y * (stride + 1)];
  const row = y * stride;
  const previous = row - stride;
  for (let x = 0; x < stride; x++) {
    const raw = filtered[y * (stride + 1) + 1 + x];
    const left = x >= bytesPerPixel ? rgb[row + x - bytesPerPixel] : 0;
    const above = y > 0 ? rgb[previous + x] : 0;
    const upperLeft =
      y > 0 && x >= bytesPerPixel ? rgb[previous + x - bytesPerPixel] : 0;
    const predictor =
      filter === 0
        ? 0
        : filter === 1
          ? left
          : filter === 2
            ? above
            : filter === 3
              ? Math.floor((left + above) / 2)
              : filter === 4
                ? paeth(left, above, upperLeft)
                : (() => {
                    throw new Error(`Filtro PNG desconhecido: ${filter}`);
                  })();
    rgb[row + x] = (raw + predictor) & 0xff;
  }
}

const rgba = Buffer.alloc(width * height * 4);
let left = width;
let top = height;
let right = 0;
let bottom = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const source = (y * width + x) * 3;
    const target = (y * width + x) * 4;
    const red = rgb[source];
    const green = rgb[source + 1];
    const blue = rgb[source + 2];
    const intensity = Math.max(red, green, blue);
    const alpha = Math.round(
      Math.max(0, Math.min(1, (intensity - 100) / 60)) * 255,
    );
    rgba[target] = red;
    rgba[target + 1] = green;
    rgba[target + 2] = blue;
    rgba[target + 3] = alpha;
    if (alpha > 8) {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
}

const size = 1024;
const padding = Math.round(size * 0.035);
const scale = (size - padding * 2) / (right - left + 1);
const drawWidth = (right - left + 1) * scale;
const drawHeight = (bottom - top + 1) * scale;
const originX = (size - drawWidth) / 2;
const originY = (size - drawHeight) / 2;
const canvas = Buffer.alloc(size * size * 4);

for (let y = 0; y < size; y++) {
  const sourceY = top + (y - originY) / scale;
  if (sourceY < top || sourceY > bottom) continue;
  const y0 = Math.floor(sourceY);
  const y1 = Math.min(bottom, y0 + 1);
  const fy = sourceY - y0;
  for (let x = 0; x < size; x++) {
    const sourceX = left + (x - originX) / scale;
    if (sourceX < left || sourceX > right) continue;
    const x0 = Math.floor(sourceX);
    const x1 = Math.min(right, x0 + 1);
    const fx = sourceX - x0;
    const weights = [
      (1 - fx) * (1 - fy),
      fx * (1 - fy),
      (1 - fx) * fy,
      fx * fy,
    ];
    const indices = [
      (y0 * width + x0) * 4,
      (y0 * width + x1) * 4,
      (y1 * width + x0) * 4,
      (y1 * width + x1) * 4,
    ];
    let alpha = 0;
    const color = [0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const weightedAlpha = rgba[indices[i] + 3] * weights[i];
      alpha += weightedAlpha;
      for (let channel = 0; channel < 3; channel++) {
        color[channel] += rgba[indices[i] + channel] * weightedAlpha;
      }
    }
    const target = (y * size + x) * 4;
    if (alpha > 0) {
      for (let channel = 0; channel < 3; channel++) {
        canvas[target + channel] = Math.round(color[channel] / alpha);
      }
      canvas[target + 3] = Math.round(alpha);
    }
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const scanlines = Buffer.alloc(size * (size * 4 + 1));
for (let y = 0; y < size; y++) {
  const row = y * (size * 4 + 1);
  scanlines[row] = 0;
  canvas.copy(scanlines, row + 1, y * size * 4, (y + 1) * size * 4);
}

writeFileSync(
  output,
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);

console.log(
  `Logo sem fundo gerada: ${size}×${size}, objeto ampliado para ${Math.round((drawWidth / size) * 100)}% da largura.`,
);

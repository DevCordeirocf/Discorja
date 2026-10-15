import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

// Rasterize the app's own geometric logo. No external fonts or image services.
const outline = [
  [7, 9],
  [7.38, 7.09],
  [8.46, 5.46],
  [10.09, 4.38],
  [12, 4],
  [29, 4],
  [29, 22],
  [28.62, 23.91],
  [27.54, 25.54],
  [25.91, 26.62],
  [24, 27],
  [19, 27],
  [11, 32],
  [11, 24],
  [7, 24],
];
function inside(x, y) {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i],
      [xj, yj] = outline[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      hit = !hit;
  }
  return hit;
}
function color(x, y) {
  const cx = Math.max(50, Math.min(206, x)),
    cy = Math.max(50, Math.min(206, y));
  if ((x - cx) ** 2 + (y - cy) ** 2 > 50 ** 2) return [0, 0, 0, 0];
  const lx = (x - 20) / 6,
    ly = (y - 20) / 6;
  if (!inside(lx, ly)) return [21, 22, 28, 255];
  const line = (right, height) =>
    (lx - Math.max(14, Math.min(right, lx))) ** 2 + (ly - height) ** 2 <= 2.25;
  return line(23, 12) || line(20, 18)
    ? [23, 21, 31, 255]
    : [184, 160, 255, 255];
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const content = Buffer.concat([Buffer.from(type), data]);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(content));
  return Buffer.concat([header, content, checksum]);
}
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const total = [0, 0, 0, 0];
      for (const dy of [0.125, 0.375, 0.625, 0.875])
        for (const dx of [0.125, 0.375, 0.625, 0.875]) {
          const c = color(((x + dx) * 256) / size, ((y + dy) * 256) / size);
          for (let channel = 0; channel < 4; channel++)
            total[channel] += c[channel];
        }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      total.forEach((value, channel) => {
        raw[offset + channel] = Math.round(value / 16);
      });
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
await mkdir('build', { recursive: true });
const sizes = [16, 32, 48, 64, 128, 256];
const images = sizes.map(png);
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const directory = images.map((data, index) => {
  const entry = Buffer.alloc(16);
  entry[0] = sizes[index] % 256;
  entry[1] = sizes[index] % 256;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(data.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += data.length;
  return entry;
});
await writeFile(
  'build/icon.ico',
  Buffer.concat([header, ...directory, ...images]),
);
await writeFile('build/icon.png', images.at(-1));
await writeFile(
  'build/icon.svg',
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="50" fill="#15161c"/><g transform="translate(20 20) scale(6)"><path d="M7 9a5 5 0 0 1 5-5h17v18a5 5 0 0 1-5 5h-5l-8 5v-8H7V9Z" fill="#b8a0ff"/><path d="M14 12h9m-9 6h6" stroke="#17151f" stroke-width="3" stroke-linecap="round"/></g></svg>\n',
);

// Generates the PWA icons (public/icon-*.png) with zero dependencies:
// a minimal PNG encoder over node:zlib, drawing the game's chunky pixel
// golden egg (same ellipse the in-game egg textures use) on field green.
//
//   node scripts/make-icons.mjs
//
// Icons are checked in; re-run only if the design changes.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// --- drawing ------------------------------------------------------------
const BG = [0x4a, 0x7c, 0x2f]; // page/field green
const EGG = [0xff, 0xd2, 0x4a]; // golden egg
const HI = [0xff, 0xff, 0xff]; // highlight pixel

// Hand-authored pixel egg, same table style as the in-game textures.
// "X" = golden shell, "o" = white highlight, "." = background.
const EGG_PIXELS = [
  "..XX..",
  ".XoXX.",
  ".XXXX.",
  "XXXXXX",
  "XXXXXX",
  "XXXXXX",
  ".XXXX.",
];
const GRID_W = EGG_PIXELS[0].length;
const GRID_H = EGG_PIXELS.length;

function makeIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = BG[0];
    rgba[i * 4 + 1] = BG[1];
    rgba[i * 4 + 2] = BG[2];
    rgba[i * 4 + 3] = 255;
  }
  const s = Math.floor((size * 0.8) / GRID_H); // chunky cell size
  const ox = (size - s * GRID_W) >> 1;
  const oy = (size - s * GRID_H) >> 1;
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const cell = EGG_PIXELS[cy][cx];
      const color = cell === "o" ? HI : cell === "X" ? EGG : null;
      if (!color) continue;
      for (let y = oy + cy * s; y < oy + (cy + 1) * s; y++) {
        for (let x = ox + cx * s; x < ox + (cx + 1) * s; x++) {
          const i = (y * size + x) * 4;
          rgba[i] = color[0];
          rgba[i + 1] = color[1];
          rgba[i + 2] = color[2];
        }
      }
    }
  }
  return encodePng(size, rgba);
}

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(out, { recursive: true });
for (const size of [180, 192, 512]) {
  writeFileSync(join(out, `icon-${size}.png`), makeIcon(size));
  console.log(`wrote public/icon-${size}.png`);
}

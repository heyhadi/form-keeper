// Draws the toolbar icons (coloured = active, grey = inactive) as PNGs with no image tooling:
// a supersampled RGBA canvas encoded by hand. Run: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public');
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor for anti-aliased edges

const THEMES = {
  icon: { bg: [79, 70, 229], fg: [255, 255, 255], accent: [52, 211, 153] },
  'icon-inactive': { bg: [156, 163, 175], fg: [243, 244, 246], accent: [209, 213, 219] },
};

/** Signed distance to a rounded rectangle, in units of the 1x1 icon. */
function roundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return Math.hypot(x - cx, y - cy) - r;
}

/** Shapes in unit coordinates: background tile, two input boxes, a check mark. */
function colourAt(x, y, theme) {
  if (roundRect(x, y, 0, 0, 1, 1, 0.22) > 0) return null;
  // Check mark: two thick segments.
  const seg = (ax, ay, bx, by) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
  };
  if (Math.min(seg(0.56, 0.72, 0.66, 0.82), seg(0.66, 0.82, 0.84, 0.6)) < 0.055) return theme.accent;
  if (roundRect(x, y, 0.18, 0.2, 0.82, 0.38, 0.06) <= 0) return theme.fg;
  if (roundRect(x, y, 0.18, 0.46, 0.82, 0.54, 0.04) <= 0) return theme.fg;
  if (roundRect(x, y, 0.18, 0.62, 0.46, 0.7, 0.04) <= 0) return theme.fg;
  return theme.bg;
}

function render(size, theme) {
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colourAt((pxi + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, theme);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a++;
        }
      }
      const i = (py * size + pxi) * 4;
      if (a) {
        px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a;
        px[i + 3] = Math.round((a / (SS * SS)) * 255);
      }
    }
  }
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = [];
  for (let y = 0; y < size; y++) rows.push(Buffer.from([0]), rgba.subarray(y * size * 4, (y + 1) * size * 4));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [dir, theme] of Object.entries(THEMES)) {
  mkdirSync(join(OUT, dir), { recursive: true });
  for (const size of SIZES) writeFileSync(join(OUT, dir, `${size}.png`), encodePng(size, render(size, theme)));
}
console.log(`icons written to ${OUT}`);

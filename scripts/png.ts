/**
 * A PNG encoder for the map's bake and its check (`build-maps.ts`,
 * `check-maps.ts`): RGBA or, where an image has few enough colours, an
 * indexed palette, with each row's filter chosen by the smallest sum, and
 * zlib from Node. No dependency: the format is a signature and four chunk
 * types.
 *
 * Indexed is what makes the bake small. A map tile is flat fills under a
 * stepped light, so a whole level has a few thousand colours where a photo
 * has a million; quantised to 256 by `quantise` (each channel's low bits
 * dropped until the colours fit, then the nearest kept colour for the rest),
 * a level's PNG is a third of its RGBA one, and the eye cannot find the step.
 */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data.buffer, data.byteOffset, data.length).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Each row filtered by whichever of the five filters leaves the smallest sum of magnitudes. */
function filtered(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array((stride + 1) * height);
  const trial = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = raw.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? raw.subarray((y - 1) * stride, y * stride) : null;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? row[x - bpp]! : 0;
        const b = up !== null ? up[x]! : 0;
        const c = up !== null && x >= bpp ? up[x - bpp]! : 0;
        let predicted = 0;
        if (f === 1) predicted = a;
        else if (f === 2) predicted = b;
        else if (f === 3) predicted = (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (row[x]! - predicted) & 0xff;
        trial[x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        out[y * (stride + 1)] = f;
        out.set(trial, y * (stride + 1) + 1);
      }
    }
  }
  return out;
}

/** An opaque RGBA image as a PNG: indexed when `palette` is given (from `quantise`), else RGB. */
export function encodePng(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, indexed?: { palette: Uint8Array; indices: Uint8Array }): Buffer {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = indexed === undefined ? 2 : 3;
  const parts: Buffer[] = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header)];
  let raw: Uint8Array;
  let bpp: number;
  if (indexed === undefined) {
    raw = new Uint8Array(width * height * 3);
    for (let k = 0, o = 0; k < width * height * 4; k += 4, o += 3) {
      raw[o] = rgba[k]!;
      raw[o + 1] = rgba[k + 1]!;
      raw[o + 2] = rgba[k + 2]!;
    }
    bpp = 3;
  } else {
    parts.push(chunk('PLTE', indexed.palette));
    raw = indexed.indices;
    bpp = 1;
  }
  parts.push(chunk('IDAT', deflateSync(filtered(raw, width, height, bpp), { level: 9 })));
  parts.push(chunk('IEND', new Uint8Array(0)));
  return Buffer.concat(parts);
}

/**
 * At most 256 colours for an opaque RGBA image: each channel's lowest bits
 * dropped until the distinct colours fit, the most common 256 kept, every
 * pixel the nearest of them. Deterministic: ties go to the lower colour.
 */
export function quantise(rgba: Uint8Array | Uint8ClampedArray): { palette: Uint8Array; indices: Uint8Array } {
  const n = rgba.length / 4;
  let shift = 0;
  let counts = new Map<number, number>();
  for (;;) {
    counts = new Map();
    const mask = (0xff << shift) & 0xff;
    for (let k = 0; k < n; k++) {
      const c = ((rgba[k * 4]! & mask) << 16) | ((rgba[k * 4 + 1]! & mask) << 8) | (rgba[k * 4 + 2]! & mask);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    if (counts.size <= 4096 || shift >= 4) break;
    shift++;
  }
  const kept = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 256).map(([c]) => c);
  const palette = new Uint8Array(kept.length * 3);
  kept.forEach((c, i) => {
    palette[i * 3] = (c >> 16) & 0xff;
    palette[i * 3 + 1] = (c >> 8) & 0xff;
    palette[i * 3 + 2] = c & 0xff;
  });
  const nearest = new Map<number, number>();
  const indices = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const r = rgba[k * 4]!;
    const g = rgba[k * 4 + 1]!;
    const b = rgba[k * 4 + 2]!;
    const key = (r << 16) | (g << 8) | b;
    let index = nearest.get(key);
    if (index === undefined) {
      let best = Infinity;
      index = 0;
      for (let i = 0; i < kept.length; i++) {
        const dr = palette[i * 3]! - r;
        const dg = palette[i * 3 + 1]! - g;
        const db = palette[i * 3 + 2]! - b;
        const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (d < best) {
          best = d;
          index = i;
        }
      }
      nearest.set(key, index);
    }
    indices[k] = index;
  }
  return { palette, indices };
}

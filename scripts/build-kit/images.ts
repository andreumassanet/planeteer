/**
 * Image decoders for the kit bake, which runs in Node without a DOM: PNG for
 * the packs' palette atlases, and a minimal baseline JPEG reader.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import * as THREE from 'three';


export interface Pixels {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** An 8-bit, non-interlaced PNG (greyscale, RGB, palette or RGBA) to RGBA. */
export function decodePng(file: string, bytes: Buffer = readFileSync(file)): Pixels {
  let offset = 8;
  let width = 0;
  let height = 0;
  let type = 0;
  let palette: Buffer | null = null;
  let alpha: Buffer | null = null;
  const data: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (kind === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      if (chunk[8] !== 8 || chunk[12] !== 0) throw new Error(`${file}: only 8-bit, non-interlaced PNG`);
      type = chunk[9]!;
    } else if (kind === 'PLTE') palette = chunk;
    else if (kind === 'tRNS') alpha = chunk;
    else if (kind === 'IDAT') data.push(chunk);
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type as 0 | 2 | 3 | 4 | 6];
  if (channels === undefined) throw new Error(`${file}: PNG colour type ${type}`);
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const out = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x]!;
      const left = x >= channels ? out[row + x - channels]! : 0;
      const up = y > 0 ? out[row - stride + x]! : 0;
      const corner = y > 0 && x >= channels ? out[row - stride + x - channels]! : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - corner);
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      out[row + x] = (value + predicted) & 255;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (type === 6) rgba.set(out.subarray(i * 4, i * 4 + 4), i * 4);
    else if (type === 2) rgba.set([out[i * 3]!, out[i * 3 + 1]!, out[i * 3 + 2]!, 255], i * 4);
    else if (type === 3) {
      const p = out[i]!;
      rgba.set([palette![p * 3]!, palette![p * 3 + 1]!, palette![p * 3 + 2]!, alpha?.[p] ?? 255], i * 4);
    } else {
      const v = out[i * channels]!;
      rgba.set([v, v, v, 255], i * 4);
    }
  }
  return { width, height, rgba };
}

/** The sRGB colour at `(u, v)` of a texture carrying decoded `pixels`; false if it has none. */
export function pngSwatch(texture: THREE.Texture, u: number, v: number, into: THREE.Color): boolean {
  const pixels = texture.userData.pixels as Pixels | undefined;
  if (pixels === undefined) return false;
  const wrap = (t: number) => t - Math.floor(t);
  const x = Math.min(pixels.width - 1, Math.floor(wrap(u) * pixels.width));
  const y = Math.min(pixels.height - 1, Math.floor(wrap(v) * pixels.height));
  const i = (y * pixels.width + x) * 4;
  into.setRGB(pixels.rgba[i]! / 255, pixels.rgba[i + 1]! / 255, pixels.rgba[i + 2]! / 255, THREE.SRGBColorSpace);
  return true;
}

interface JpegComponent {
  id: number;
  h: number;
  v: number;
  tq: number;
  td: number;
  ta: number;
  dc: Float32Array;
  columns: number;
}

interface JpegHeader {
  quant: number[];
  tables: Map<number, Map<number, number>>;
  width: number;
  height: number;
  restart: number;
  components: JpegComponent[];
  /** Offset of the entropy-coded scan data. */
  scan: number;
}

/** Reads a baseline JPEG's segments up to the start of its scan. */
function readJpegHeader(label: string, bytes: Uint8Array): JpegHeader {
  const quant: number[] = [];
  const tables = new Map<number, Map<number, number>>();
  let width = 0;
  let height = 0;
  let restart = 0;
  let components: JpegComponent[] = [];
  let offset = 2;
  let scan = -1;
  while (offset < bytes.length && scan < 0) {
    if (bytes[offset] !== 0xff) throw new Error(`${label}: JPEG marker expected at ${offset}`);
    const marker = bytes[offset + 1]!;
    offset += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    const segment = bytes.subarray(offset + 2, offset + length);
    if (marker === 0xdb) {
      for (let i = 0; i < segment.length; ) {
        const wide = segment[i]! >> 4;
        quant[segment[i]! & 15] = wide ? (segment[i + 1]! << 8) | segment[i + 2]! : segment[i + 1]!;
        i += 1 + 64 * (wide ? 2 : 1);
      }
    } else if (marker === 0xc4) {
      for (let i = 0; i < segment.length; ) {
        const key = segment[i]!;
        const counts = segment.subarray(i + 1, i + 17);
        const codes = new Map<number, number>();
        let code = 0;
        let at = i + 17;
        for (let length = 1; length <= 16; length++) {
          for (let k = 0; k < counts[length - 1]!; k++) codes.set((length << 16) | code++, segment[at++]!);
          code <<= 1;
        }
        tables.set(key, codes);
        i = at;
      }
    } else if (marker === 0xc0 || marker === 0xc1) {
      height = (segment[1]! << 8) | segment[2]!;
      width = (segment[3]! << 8) | segment[4]!;
      components = Array.from({ length: segment[5]! }, (_, k) => ({
        id: segment[6 + k * 3]!,
        h: segment[7 + k * 3]! >> 4,
        v: segment[7 + k * 3]! & 15,
        tq: segment[8 + k * 3]!,
        td: 0,
        ta: 0,
        dc: new Float32Array(0),
        columns: 0,
      }));
    } else if (marker === 0xc2 || marker === 0xc3 || marker >= 0xc5 && marker <= 0xcf && marker !== 0xc8 && marker !== 0xcc) {
      throw new Error(`${label}: only baseline JPEG (marker ${marker.toString(16)})`);
    } else if (marker === 0xdd) {
      restart = (segment[0]! << 8) | segment[1]!;
    } else if (marker === 0xda) {
      for (let k = 0; k < segment[0]!; k++) {
        const component = components.find((entry) => entry.id === segment[1 + k * 2])!;
        component.td = segment[2 + k * 2]! >> 4;
        component.ta = segment[2 + k * 2]! & 15;
      }
      scan = offset + length;
    }
    offset += length;
  }
  return { quant, tables, width, height, restart, components, scan };
}

/** Decodes every block's DC coefficient into its component's `dc` grid; AC coefficients are skipped. */
function decodeJpegDc(label: string, bytes: Uint8Array, header: JpegHeader, mcuColumns: number, mcuRows: number): void {
  const { quant, tables, restart, components, scan } = header;
  let at = scan;
  let buffer = 0;
  let bits = 0;
  const bit = (): number => {
    if (bits === 0) {
      let byte = bytes[at++] ?? 0;
      if (byte === 0xff) {
        const next = bytes[at] ?? 0;
        if (next === 0) at++;
        else byte = 0;
      }
      buffer = byte;
      bits = 8;
    }
    bits--;
    return (buffer >> bits) & 1;
  };
  const receive = (count: number): number => {
    let value = 0;
    for (let k = 0; k < count; k++) value = (value << 1) | bit();
    return value;
  };
  const extend = (value: number, count: number): number => (count === 0 ? 0 : value < 1 << (count - 1) ? value - (1 << count) + 1 : value);
  const decode = (codes: Map<number, number>): number => {
    let code = 0;
    for (let length = 1; length <= 16; length++) {
      code = (code << 1) | bit();
      const symbol = codes.get((length << 16) | code);
      if (symbol !== undefined) return symbol;
    }
    throw new Error(`${label}: bad Huffman code at ${at}`);
  };

  const predictors = components.map(() => 0);
  for (let mcu = 0; mcu < mcuColumns * mcuRows; mcu++) {
    if (restart > 0 && mcu > 0 && mcu % restart === 0) {
      bits = 0;
      while (at < bytes.length && !(bytes[at] === 0xff && bytes[at + 1]! >= 0xd0 && bytes[at + 1]! <= 0xd7)) at++;
      at += 2;
      predictors.fill(0);
    }
    const mx = mcu % mcuColumns;
    const my = Math.floor(mcu / mcuColumns);
    components.forEach((c, index) => {
      for (let v = 0; v < c.v; v++) {
        for (let h = 0; h < c.h; h++) {
          const size = decode(tables.get(c.td)!);
          predictors[index]! += extend(receive(size), size);
          c.dc[(my * c.v + v) * c.columns + mx * c.h + h] = (predictors[index]! * quant[c.tq]!) / 8 + 128;
          for (let k = 1; k < 64; ) {
            const rs = decode(tables.get(0x10 | c.ta)!);
            const run = rs >> 4;
            const magnitude = rs & 15;
            if (magnitude === 0) {
              if (run !== 15) break;
              k += 16;
              continue;
            }
            k += run;
            receive(magnitude);
            k++;
          }
        }
      }
    });
  }

}

/**
 * A baseline JPEG reduced to the average colour of each 8-by-8 block (DC
 * coefficients only). Enough for a palette atlas of flat swatches much larger
 * than a block. Chroma is read at its own sampling. No progressive or
 * arithmetic-coded JPEG.
 */
export function decodeJpeg(label: string, bytes: Uint8Array): Pixels {
  const header = readJpegHeader(label, bytes);
  const { width, height, components } = header;
  const hMax = Math.max(...components.map((c) => c.h));
  const vMax = Math.max(...components.map((c) => c.v));
  const mcuColumns = Math.ceil(width / (8 * hMax));
  const mcuRows = Math.ceil(height / (8 * vMax));
  for (const c of components) {
    c.columns = mcuColumns * c.h;
    c.dc = new Float32Array(c.columns * mcuRows * c.v);
  }

  decodeJpegDc(label, bytes, header, mcuColumns, mcuRows);

  const rgba = new Uint8Array(width * height * 4);
  const sample = (c: (typeof components)[number], x: number, y: number) =>
    c.dc[Math.floor((y * c.v) / vMax / 8) * c.columns + Math.floor((x * c.h) / hMax / 8)]!;
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const Y = sample(components[0]!, x, y);
      const i = (y * width + x) * 4;
      if (components.length === 1) {
        rgba.set([clamp(Y), clamp(Y), clamp(Y), 255], i);
        continue;
      }
      const cb = sample(components[1]!, x, y) - 128;
      const cr = sample(components[2]!, x, y) - 128;
      rgba.set([clamp(Y + 1.402 * cr), clamp(Y - 0.344136 * cb - 0.714136 * cr), clamp(Y + 1.772 * cb), 255], i);
    }
  }
  return { width, height, rgba };
}

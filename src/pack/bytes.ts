// The byte-level pieces of the wire format: a growing writer, a bounds-checked
// reader, transposed integer columns, text blobs and the file header.

/** Bumped when the layout changes, so a stale file fails loudly rather than oddly. */
const VERSION = 1;

/**
 * A growing byte buffer with the two integer codings the format uses.
 *
 * LEB128 for anything whose magnitude varies (a coastline step is one byte, a
 * jump between rings three) and zigzag on top of it for anything signed, so a
 * small negative does not cost five bytes of leading ones.
 */
export class Writer {
  private data = new Uint8Array(1 << 16);
  private at = 0;

  private room(bytes: number): void {
    if (this.at + bytes <= this.data.length) return;
    let size = this.data.length * 2;
    while (size < this.at + bytes) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.data.subarray(0, this.at));
    this.data = grown;
  }

  u8(value: number): void {
    this.room(1);
    this.data[this.at++] = value & 255;
  }

  raw(bytes: Uint8Array): void {
    this.room(bytes.length);
    this.data.set(bytes, this.at);
    this.at += bytes.length;
  }

  /** Unsigned LEB128. Guarded, because a value past 2^31 would silently truncate. */
  varint(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0x7fffffff) {
      throw new Error(`varint out of range: ${value}`);
    }
    this.room(5);
    let v = value;
    while (v >= 0x80) {
      this.data[this.at++] = (v & 0x7f) | 0x80;
      v >>>= 7;
    }
    this.data[this.at++] = v;
  }

  /** Zigzag then LEB128: -1 is one byte, not five. */
  zigzag(value: number): void {
    this.varint(value < 0 ? -2 * value - 1 : 2 * value);
  }

  done(): Uint8Array {
    return this.data.slice(0, this.at);
  }
}

/**
 * Reading past the end throws: a `Uint8Array` answers `undefined` past its
 * length, which `& 0x7f` turns into 0 and a varint ends on, so a truncated file
 * would otherwise decode into rows of zeros. Every decoder also ends on
 * `finish`, which rejects a file with bytes left over.
 */
export class Reader {
  private at = 0;
  private readonly data: Uint8Array;
  private readonly what: string;

  constructor(data: Uint8Array, what: string) {
    this.data = data;
    this.what = what;
  }

  private short(): never {
    throw new Error(`${this.what} ends early, at byte ${this.data.length} — re-bake it`);
  }

  u8(): number {
    if (this.at >= this.data.length) this.short();
    return this.data[this.at++]!;
  }

  raw(length: number): Uint8Array {
    if (this.at + length > this.data.length) this.short();
    const slice = this.data.subarray(this.at, this.at + length);
    this.at += length;
    return slice;
  }

  varint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = this.u8();
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
      if (shift > 35) throw new Error(`${this.what}: a varint runs past 32 bits at byte ${this.at}`);
    }
  }

  zigzag(): number {
    const v = this.varint();
    return v & 1 ? -(v + 1) / 2 : v / 2;
  }

  /** Bytes not yet read, so a reader can tell a short file from a stale one. */
  left(): number {
    return this.data.length - this.at;
  }

  /** The whole file was read, and nothing after it is a layout this reader skipped. */
  finish(): void {
    if (this.left() !== 0) {
      throw new Error(`${this.what} has ${this.left()} bytes this reader does not know — re-bake it`);
    }
  }
}

/**
 * A fixed-width integer column, stored as one plane of low bytes followed by one
 * plane of the next, and so on. A place's latitude is 18 bits of which the top
 * two are almost always the same, but interleaved with the noisy low bytes gzip
 * never sees the run; split into planes it crushes that plane and leaves the
 * random one at its own size.
 */
export function writePlanes(out: Writer, values: readonly number[] | Int32Array, bytes: number, bias = 0): void {
  const n = values.length;
  const plane = new Uint8Array(n);
  for (let b = 0; b < bytes; b++) {
    const shift = b * 8;
    for (let i = 0; i < n; i++) plane[i] = ((values[i]! + bias) >>> shift) & 255;
    out.raw(plane);
  }
}

export function readPlanes(reader: Reader, n: number, bytes: number, bias = 0): Int32Array {
  const values = new Int32Array(n);
  for (let b = 0; b < bytes; b++) {
    const plane = reader.raw(n);
    const shift = b * 8;
    for (let i = 0; i < n; i++) values[i]! |= plane[i]! << shift;
  }
  if (bias !== 0) for (let i = 0; i < n; i++) values[i]! -= bias;
  return values;
}

export const utf8 = new TextEncoder();
export const decoder = new TextDecoder();

/**
 * Names as one blob with newline separators and no length table. No name
 * contains a newline; the writer asserts it, because one would silently split a row.
 */
export function writeText(out: Writer, parts: readonly string[]): void {
  for (const part of parts) {
    if (part.includes('\n')) throw new Error(`a newline in "${part}" would split the blob`);
  }
  writeBlob(out, parts);
}

/** Rows of fields joined by tabs, so a tab inside a field would shift the row: asserted. */
export function writeFields(out: Writer, rows: readonly (readonly string[])[]): void {
  for (const row of rows) {
    for (const field of row) {
      if (field.includes('\t')) throw new Error(`a tab in "${field}" would split its row`);
    }
  }
  writeText(out, rows.map((row) => row.join('\t')));
}

function writeBlob(out: Writer, parts: readonly string[]): void {
  const blob = utf8.encode(parts.join('\n'));
  out.varint(blob.length);
  out.raw(blob);
}

export function readText(reader: Reader, count: number): string[] {
  const blob = reader.raw(reader.varint());
  const parts = count === 0 ? [] : decoder.decode(blob).split('\n');
  if (parts.length !== count) throw new Error(`expected ${count} strings, got ${parts.length}`);
  return parts;
}

/** The file header: four magic bytes and the format version. */
export function magic(out: Writer, value: number): void {
  out.u8(value);
  out.u8(value >>> 8);
  out.u8(value >>> 16);
  out.u8(value >>> 24);
  out.u8(VERSION);
}

export function expect(reader: Reader, value: number, what: string): void {
  const found = reader.u8() | (reader.u8() << 8) | (reader.u8() << 16) | (reader.u8() << 24);
  const version = reader.u8();
  if (found !== value || version !== VERSION) {
    throw new Error(`${what} is not an atlas v${VERSION} file — re-bake it`);
  }
}

/**
 * Inflate a baked file. The same call works in Node and in the browser, because
 * `DecompressionStream` is the platform's own zlib in both. The compressing half
 * is not here: the bakes use `zlib.gzipSync` at level 9, which
 * `CompressionStream` cannot ask for, and each bake round-trips its output
 * through this function before writing.
 */
export async function inflate(data: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const body = data instanceof Uint8Array ? data : new Uint8Array(data);
  const stream = new Response(body as BodyInit).body!.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

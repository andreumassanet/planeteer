/**
 * Downloads the bakes' data sources into `../.cache` and says whether each is
 * the copy `scripts/sources.json` recorded.
 *
 *   node scripts/fetch-sources.mjs            fetch whatever is missing, verify all
 *   node scripts/fetch-sources.mjs --check    verify what is there, fetch nothing
 *   node scripts/fetch-sources.mjs --force    fetch everything again
 *   node scripts/fetch-sources.mjs cities5000.txt ...   only the files named
 *
 * **A hash that differs is a warning, not a failure.** GeoNames rebuilds its
 * dumps every day and Natural Earth publishes new releases, so a fresh download
 * is expected to differ from the copy the committed bakes were made from; what
 * matters is knowing that it does, because re-baking from it is then a data
 * change and `pnpm check` is what has to say whether the world still holds.
 * A missing file after a fetch, or a download that failed, is the failure.
 *
 * The asset packs under `../.cache/assets` are not fetched here; see the
 * `assets` note in `sources.json`.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(here, 'sources.json'), 'utf8'));
const CACHE = resolve(here, '../../.cache');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const force = args.includes('--force');
const named = args.filter((a) => !a.startsWith('--'));
const wanted = manifest.sources.filter((s) => named.length === 0 || named.includes(s.file));
for (const name of named) {
  if (!manifest.sources.some((s) => s.file === name)) throw new Error(`${name} is not in sources.json`);
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * One member of a zip archive. GeoNames ships its dumps zipped and Node has
 * deflate but no zip reader, so this is the forty lines of one: the end record,
 * the central directory, the local header, and a raw inflate. No zip64 — the
 * largest archive here is a few megabytes.
 */
function unzip(archive, member) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let end = -1;
  for (let i = archive.length - 22; i >= Math.max(0, archive.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip archive: no end of central directory');
  const entries = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  for (let k = 0; k < entries; k++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('zip central directory is corrupt');
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(archive.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (name !== member) continue;
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error(`zip local header for ${member} is corrupt`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = archive.subarray(start, start + compressed);
    if (method === 0) return data;
    if (method === 8) return inflateRawSync(data);
    throw new Error(`${member} is compressed with method ${method}, which this reader does not know`);
  }
  throw new Error(`${member} is not in the archive`);
}

if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });

let failed = 0;
let drifted = 0;
for (const source of wanted) {
  const path = resolve(CACHE, source.file);
  if (!checkOnly && (force || !existsSync(path))) {
    process.stdout.write(`  fetch ${source.url} ... `);
    try {
      const response = await fetch(source.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let bytes = new Uint8Array(await response.arrayBuffer());
      if (source.unzip) bytes = unzip(bytes, source.unzip);
      writeFileSync(path, bytes);
      console.log(`${(bytes.length / 1048576).toFixed(1)} MB`);
    } catch (error) {
      console.log(`failed: ${error.message}`);
      failed++;
      continue;
    }
  }
  if (!existsSync(path)) {
    console.log(`  MISSING ${source.file}${checkOnly ? ' (run without --check to fetch it)' : ''}`);
    failed++;
    continue;
  }
  const bytes = readFileSync(path);
  const hash = sha256(bytes);
  if (hash === source.sha256) {
    console.log(`  ok   ${source.file}  the copy recorded on ${manifest.recorded}`);
  } else {
    drifted++;
    console.log(
      `  WARN ${source.file}  is not the copy recorded on ${manifest.recorded}: ` +
        `${bytes.length.toLocaleString('en')} bytes against ${source.bytes.toLocaleString('en')}, sha256 ${hash.slice(0, 12)}… — ` +
        `baking from it is a data change; re-bake in order and run \`pnpm check\``,
    );
  }
}

console.log(
  failed > 0
    ? `\n${failed} source(s) missing or not fetched`
    : `\n${wanted.length} source(s) present${drifted > 0 ? `, ${drifted} differing from the recorded copy` : ', all as recorded'}`,
);
process.exit(failed > 0 ? 1 : 0);

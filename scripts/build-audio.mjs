#!/usr/bin/env node
// The world's recorded sounds: a handful of CC0 one-shots from Kenney's audio
// packs, trimmed, levelled and re-encoded into public/audio/.
//
//   node scripts/build-audio.mjs
//
// **Only the one-shots are recordings.** The wind, the sea, the two engines,
// the birds and the crickets are synthesised in `src/audio.ts`, because they
// are loops that have to follow a number — altitude, speed, the distance to
// the coast, the hour — and a recorded loop either repeats audibly or costs
// megabytes to hide that it does. What a recording is better at is the thing
// synthesis is worst at: a footstep, a click.
//
// The sources are Kenney's CC0 packs, downloaded on 2026-09-21 into
// ../.cache/assets/kenney-audio/ from
//   https://kenney.nl/assets/impact-sounds     (footsteps, the landing thud)
//   https://kenney.nl/assets/interface-sounds  (the cards, the map, the toggles)
//   https://kenney.nl/assets/rpg-audio         (footsteps on dirt and sand; the passport's
//                                              book opening and closing, its pages, a stamp)
// Each zip unpacks to its own `kenney_<name>/` folder with a License.txt.
//
// **MP3, not the packs' Ogg Vorbis**, because `decodeAudioData` has to decode
// it on every browser the world runs in and Safari's Vorbis support is recent.
// Mono at 64 kb/s: these are short, quiet and positional in nothing, and a
// stereo image on a footstep is only the microphone's.
//
// **Every file is levelled to the same peak** (-1 dBFS) and the mix lives in
// `src/audio.ts` as a gain per cue, so re-baking never moves the balance.
// Silence is trimmed off both ends: a click with 200 ms of air in front of it
// arrives 200 ms after the card it opens. (Two jingles, a landmark's and a
// frontier's from Kenney's Music Jingles, went with their cards on 2026-10-01.)

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = '../.cache/assets/kenney-audio';
const OUT = 'public/audio';

const impact = (name) => `kenney_impact-sounds/Audio/${name}.ogg`;
const ui = (name) => `kenney_interface-sounds/Audio/${name}.ogg`;
const rpg = (name) => `kenney_rpg-audio/Audio/${name}.ogg`;

/**
 * Published name -> source. A cue with variants is `<cue>-<n>`; `src/audio.ts`
 * picks one at random so a walk is not the same step forty times.
 */
const FILES = {
  'step-grass-0': impact('footstep_grass_000'),
  'step-grass-1': impact('footstep_grass_001'),
  'step-grass-2': impact('footstep_grass_002'),
  'step-grass-3': impact('footstep_grass_003'),
  'step-paving-0': impact('footstep_concrete_000'),
  'step-paving-1': impact('footstep_concrete_001'),
  'step-paving-2': impact('footstep_concrete_002'),
  'step-paving-3': impact('footstep_concrete_003'),
  'step-snow-0': impact('footstep_snow_000'),
  'step-snow-1': impact('footstep_snow_001'),
  'step-snow-2': impact('footstep_snow_002'),
  'step-snow-3': impact('footstep_snow_003'),
  'step-dirt-0': rpg('footstep00'),
  'step-dirt-1': rpg('footstep02'),
  'step-dirt-2': rpg('footstep04'),
  'step-dirt-3': rpg('footstep06'),
  'land-0': impact('impactSoft_medium_000'),
  'land-1': impact('impactSoft_medium_001'),
  'ui-click': ui('click_002'),
  'ui-open': ui('maximize_006'),
  'ui-close': ui('minimize_006'),
  'ui-toggle': ui('toggle_002'),
  'ui-error': ui('error_006'),
  'ui-confirm': ui('confirmation_002'),
  // The passport is a book, and sounds like one: a page a turn (three, picked
  // at random and pitched a little each time), its covers, and the stamp's
  // thump as it lands, which is a book put down on a desk.
  'book-open': rpg('bookOpen'),
  'book-close': rpg('bookClose'),
  'page-0': rpg('bookFlip1'),
  'page-1': rpg('bookFlip2'),
  'page-2': rpg('bookFlip3'),
  stamp: rpg('bookPlace1'),
};

/** Where every file peaks, so the mix is `src/audio.ts`'s alone. */
const PEAK_DB = -1;
/** Anything under this, at either end, is air. */
const SILENCE_DB = -55;

if (!existsSync(SOURCE)) {
  console.error(`missing ${SOURCE}: download the three packs listed at the top of this file`);
  process.exit(1);
}

/** ffmpeg, failing loudly; its meters write to stderr, so that is what comes back. */
function ffmpeg(args) {
  const run = spawnSync('ffmpeg', ['-hide_banner', ...args], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${run.stderr}`);
  return run.stderr;
}

const trim =
  `silenceremove=start_periods=1:start_threshold=${SILENCE_DB}dB,` +
  `areverse,silenceremove=start_periods=1:start_threshold=${SILENCE_DB}dB,areverse`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let total = 0;
for (const [name, relative] of Object.entries(FILES)) {
  const input = join(SOURCE, relative);
  if (!existsSync(input)) throw new Error(`missing ${input}`);
  // Measured after the trim, so the level is the sound's and not the air's.
  const meter = ffmpeg(['-i', input, '-af', `${trim},volumedetect`, '-f', 'null', '-']);
  const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(meter)?.[1]);
  if (!Number.isFinite(peak)) throw new Error(`no peak for ${input}`);
  const output = join(OUT, `${name}.mp3`);
  ffmpeg(['-v', 'error', '-y', '-i', input, '-af', `${trim},volume=${(PEAK_DB - peak).toFixed(2)}dB`, '-ac', '1', '-ar', '44100', '-b:a', '64k', output]);
  total += statSync(output).size;
}

writeFileSync(
  join(OUT, 'LICENSE.txt'),
  [
    'The sounds in this directory, rebuilt by scripts/build-audio.mjs.',
    'Trimmed, levelled to one peak and re-encoded as mono MP3; otherwise unchanged.',
    '',
    'Kenney (https://kenney.nl) — Impact Sounds, Interface Sounds, RPG Audio.',
    'License: CC0 1.0 Universal (http://creativecommons.org/publicdomain/zero/1.0/).',
    '',
  ].join('\n'),
);

const files = readdirSync(OUT).filter((f) => f.endsWith('.mp3'));
console.log(`${files.length} sounds, ${(total / 1024).toFixed(1)} KB in ${OUT}`);

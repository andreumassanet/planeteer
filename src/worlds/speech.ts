/**
 * What an alien says, how it is written and how it sounds: the pure half of
 * talking to one, which `index.ts` puts in a bubble and `check-worlds.ts`
 * holds to its rules.
 *
 * A conversation runs the phrasebook round — a greeting, then their world,
 * then you, then goodbye — and which line of each is a function of who is
 * speaking and how many times you have spoken to them this visit, so the same
 * alien never opens twice with the same line and two aliens side by side say
 * different things. The English is the translation under the glyphs; the
 * glyphs are `glyphs.ts`'s `writeLine` of that English, and the voice says the
 * glyphs' syllables (`Written.said`), so what is heard has the length of what
 * is written.
 */

import type { Civilisation, Phrasebook, VoiceRange } from './contract.ts';
import type { Script, Written } from './glyphs.ts';
import { writeLine } from './glyphs.ts';
import type { Voice } from '../voice.ts';
import { rngFrom, seedOf } from '../scenery/random.ts';

/** What fills a line's blanks. */
export interface Where {
  place: string;
  nation: string;
  body: string;
  species: string;
  /** To the nearest other town, already formatted ("1,240 km"). */
  distance: string;
}

const ORDER: readonly (keyof Phrasebook)[] = ['greet', 'world', 'visitor', 'farewell'];

export interface Line {
  english: string;
  written: Written;
}

/** The `turn`th line `speaker` says. */
export function lineOf(civ: Civilisation, script: Script, speaker: string, turn: number, where: Where): Line {
  const part = ORDER[turn % ORDER.length]!;
  const lines = civ.phrases[part];
  const round = Math.floor(turn / ORDER.length);
  const start = Math.abs(seedOf('worlds', 'talk', speaker, part)) % Math.max(1, lines.length);
  const template = lines.length === 0 ? '...' : lines[(start + round) % lines.length]!;
  const english = template.replace(/\{(place|nation|body|species|distance)\}/g, (_, key: keyof Where) => where[key]);
  return { english, written: writeLine(script, english) };
}

/** A member's voice, inside the species' range and the same every visit. */
export function voiceFor(range: VoiceRange, speaker: string): Voice {
  const rng = rngFrom('worlds', 'voice', speaker);
  return {
    pitch: rng.range(range.pitch[0], range.pitch[1]),
    pace: rng.range(range.pace[0], range.pace[1]),
    tract: rng.range(range.tract[0], range.tract[1]),
    wander: range.wander,
  };
}

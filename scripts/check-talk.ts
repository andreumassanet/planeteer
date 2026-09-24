/**
 * The townsfolk's words, held to their contract: `pnpm people` runs all of it
 * over every language, and `node scripts/check-talk.ts es fr` runs it over a
 * few, in a fraction of a second, for whoever is writing them.
 *
 * A language has every key with at least `MIN_VARIANTS` of it, each variant a
 * said line and its English meaning naming the same placeholders, and only
 * those its key may name; every country spoken to in it has its facts, each a
 * pair too; and no line, filled with the longest values it can meet, runs
 * longer than the bubble holds.
 *
 * `node scripts/check-talk.ts --sample` prints a few conversations in five
 * places instead, to be read.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ENGLISH_COMPASS,
  FACTS,
  LINE_KEYS,
  LINE_MAX,
  LOADERS,
  MIN_VARIANTS,
  NAMES_OF,
  PLACEHOLDERS,
  PLACEHOLDER_PATTERN,
  SPOKEN,
  languageOf,
  WITHOUT_FACTS,
  fill,
  meantOf,
  saidOf,
} from '../src/phrases.ts';
import type { Language, LineKey, Placeholder, Said } from '../src/phrases.ts';
import { compose, createMemory } from '../src/talk.ts';
import type { Where } from '../src/talk.ts';

/** How many of the most populous countries must have facts, whatever they are spoken to in. */
export const POPULOUS = 80;
/** The fewest facts a country's entry may have. */
export const FEWEST_FACTS = 4;

/** Writing that runs right to left: Hebrew, Arabic and its extensions. */
const RTL_SCRIPT = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/** The longest of each value a line can meet, for the length check: a long town, a long landmark. */
const LONG: Partial<Record<Placeholder, string>> = {
  town: 'Villanueva de la Serena',
  capital: 'Sri Jayawardenepura Kotte',
  landmark: 'Christ the Redeemer',
  km: '2,999',
};

const namesIn = (template: string): string[] => [...template.matchAll(PLACEHOLDER_PATTERN)].map((m) => m[1]!).sort();

/** The countries each language speaks to, and English the rest. */
export function countriesOf(code: string): string[] {
  return Object.entries(SPOKEN)
    .filter(([, [spoken]]) => spoken === code)
    .map(([iso]) => iso);
}

/**
 * The countries that must have facts: every country spoken to in its own
 * language and the `POPULOUS` most populous by GeoNames, less `WITHOUT_FACTS`.
 */
export function requiredCountries(): Set<string> {
  const info = JSON.parse(readFileSync(resolve(import.meta.dirname, '../public/data/countries-info.json'), 'utf8')) as {
    countries: Record<string, { population: number }>;
  };
  const populous = Object.entries(info.countries)
    .sort((a, b) => b[1].population - a[1].population)
    .slice(0, POPULOUS)
    .map(([iso]) => iso);
  return new Set([...Object.keys(SPOKEN), ...populous].filter((iso) => !WITHOUT_FACTS.has(iso)));
}

export interface LanguageReport {
  templates: number;
  countries: number;
  facts: number;
}

/** Everything about one language that can be held without composing a conversation. */
export function checkLanguage(code: string, language: Language, fail: (what: string) => void): LanguageReport {
  const english = code === 'en';
  const report: LanguageReport = { templates: 0, countries: 0, facts: 0 };
  const where = `${code}`;
  if (language.compass.length !== 8 || language.compass.some((phrase) => phrase.trim() === '')) {
    fail(`${where}: the compass wants eight phrases`);
  }
  const pairOk = (said: Said, what: string): boolean => {
    if (typeof said === 'string') {
      if (!english) fail(`${what}: a bare string, where every language but English writes [said, meant]`);
      return true;
    }
    if (!Array.isArray(said) || said.length !== 2 || typeof said[0] !== 'string' || typeof said[1] !== 'string') {
      fail(`${what}: not a [said, meant] pair`);
      return false;
    }
    return true;
  };
  const textOk = (text: string, what: string): void => {
    if (text.trim() !== text || text === '') fail(`${what}: empty or padded: "${text}"`);
    if (/[{}]/.test(text.replace(PLACEHOLDER_PATTERN, ''))) fail(`${what}: a stray brace in "${text}"`);
    if (/\s{2,}/.test(text)) fail(`${what}: a double space in "${text}"`);
  };

  // The longest value of each placeholder this language's lines can meet.
  const longNative: Partial<Record<Placeholder, string>> = { ...LONG };
  const longGloss: Partial<Record<Placeholder, string>> = { ...LONG };
  const longest = (values: readonly string[]): string => values.reduce((a, b) => (b.length > a.length ? b : a), '');
  longNative.dir = longest(language.compass);
  longGloss.dir = longest(ENGLISH_COMPASS);
  const speaks = english ? [] : countriesOf(code);
  const countryNames = speaks
    .map((iso) => SPOKEN[iso]![1])
    .filter((alpha2) => alpha2 !== '')
    .map((alpha2) => new Intl.DisplayNames([language.locale], { type: 'region' }).of(alpha2) ?? alpha2);
  longNative.country = longest([...countryNames, 'Bosnia and Herzegovina']);
  longGloss.country = 'Bosnia and Herzegovina';

  for (const key of LINE_KEYS) {
    const lines = language.lines[key];
    if (lines === undefined) {
      fail(`${where}.${key}: missing`);
      continue;
    }
    if (lines.length < MIN_VARIANTS[key]) fail(`${where}.${key}: ${lines.length} variants, fewer than ${MIN_VARIANTS[key]}`);
    const may = new Set<string>(['town', ...(NAMES_OF[key]?.may ?? [])]);
    const must = NAMES_OF[key]?.must ?? [];
    const seen = new Set<string>();
    lines.forEach((template, i) => {
      const what = `${where}.${key}[${i}]`;
      report.templates++;
      if (!pairOk(template, what)) return;
      const said = saidOf(template);
      const meant = meantOf(template);
      textOk(said, what);
      textOk(meant, `${what} (meant)`);
      if (seen.has(said)) fail(`${what}: said twice under one key: "${said}"`);
      seen.add(said);
      const names = namesIn(said);
      if (names.join() !== namesIn(meant).join()) {
        fail(`${what}: said names {${names.join('}, {')}} where its meaning names {${namesIn(meant).join('}, {')}}`);
      }
      for (const name of names) {
        if (!(PLACEHOLDERS as readonly string[]).includes(name)) fail(`${what}: unknown placeholder {${name}}`);
        else if (!may.has(name)) fail(`${what}: {${name}} is not something ${key} can know`);
      }
      for (const name of must) if (!names.includes(name)) fail(`${what}: ${key} must name {${name}}`);
      if (language.rtl === true && !RTL_SCRIPT.test(said)) fail(`${what}: a right-to-left language written left to right: "${said}"`);
    });
  }
  if (language.rtl !== true && Object.values(language.lines).flat().some((line) => RTL_SCRIPT.test(saidOf(line)))) {
    fail(`${where}: right-to-left writing in a language not marked rtl`);
  }

  // The facts: the countries this language is spoken in, and only those.
  const required = requiredCountries();
  for (const [iso, facts] of Object.entries(language.countries)) {
    const what = `${where}.countries.${iso}`;
    report.countries++;
    if (!/^[A-Z]{3}$/.test(iso)) fail(`${what}: not an outline code`);
    const spokenIn = SPOKEN[iso]?.[0] ?? 'en';
    if (spokenIn !== code) fail(`${what}: that country is spoken to in ${spokenIn}, so its facts go in that file`);
    const count = FACTS.filter((fact) => facts[fact] !== undefined).length;
    if (count < FEWEST_FACTS) fail(`${what}: ${count} facts, fewer than ${FEWEST_FACTS}`);
    for (const fact of FACTS) {
      const value = facts[fact];
      if (value === undefined) continue;
      report.facts++;
      const at = `${what}.${fact}`;
      if (!pairOk(value, at)) continue;
      for (const text of [saidOf(value), meantOf(value)]) {
        textOk(text, at);
        if (/[{}]/.test(text)) fail(`${at}: a brace in a fact`);
        if (/^[“"«„「『]|[”"»“」』]$/.test(text)) fail(`${at}: quoted, where the templates do the quoting: "${text}"`);
        if (fact !== 'proverb' && /[.!。！]$/.test(text)) fail(`${at}: a fact ends in a full stop, which the template supplies: "${text}"`);
      }
      if (fact === 'proverb' && language.rtl === true && !RTL_SCRIPT.test(saidOf(value))) {
        fail(`${at}: a proverb in a right-to-left language written left to right`);
      }
    }
    // Every line a fact goes into, filled with this country's values, fits the bubble.
    const native: Partial<Record<Placeholder, string>> = { ...longNative };
    const gloss: Partial<Record<Placeholder, string>> = { ...longGloss };
    for (const fact of FACTS) {
      const value = facts[fact];
      if (value === undefined) continue;
      native[fact] = saidOf(value);
      gloss[fact] = meantOf(value);
      for (const template of language.lines[fact] ?? []) {
        const said = fill(saidOf(template), native, false, language.locale);
        const meant = fill(meantOf(template), gloss, false);
        if (said.length > LINE_MAX) fail(`${what}.${fact}: ${said.length} characters said: "${said}"`);
        if (meant.length > LINE_MAX) fail(`${what}.${fact}: ${meant.length} characters meant: "${meant}"`);
      }
    }
  }
  for (const iso of english ? [...required].filter((iso) => SPOKEN[iso] === undefined) : speaks) {
    if (required.has(iso) && language.countries[iso] === undefined) fail(`${where}: no facts for ${iso}`);
  }

  // Every other line, filled with the longest values, and the opening pair
  // said together, fit the bubble.
  const fits = (keys: readonly LineKey[]): void => {
    for (const key of keys) {
      if (FACTS.includes(key as never)) continue;
      for (const template of language.lines[key] ?? []) {
        const said = fill(saidOf(template), longNative, false, language.locale);
        const meant = fill(meantOf(template), longGloss, false);
        if (said.length > LINE_MAX) fail(`${where}.${key}: ${said.length} characters said: "${said}"`);
        if (meant.length > LINE_MAX) fail(`${where}.${key}: ${meant.length} characters meant: "${meant}"`);
      }
    }
  };
  fits(LINE_KEYS);
  const welcome = language.lines.welcome ?? [];
  for (const hello of ['morning', 'afternoon', 'evening', 'night'] as const) {
    const longestOf = (lines: readonly Said[], half: (s: Said) => string, values: Partial<Record<Placeholder, string>>): string =>
      longest(lines.map((line) => fill(half(line), values, false)));
    const said = longestOf(language.lines[hello] ?? [], saidOf, longNative) + language.join + longestOf(welcome, saidOf, longNative);
    const meant = longestOf(language.lines[hello] ?? [], meantOf, longGloss) + ' ' + longestOf(welcome, meantOf, longGloss);
    if (said.length > LINE_MAX) fail(`${where}.${hello} + welcome: ${said.length} characters said: "${said}"`);
    if (meant.length > LINE_MAX) fail(`${where}.${hello} + welcome: ${meant.length} characters meant: "${meant}"`);
  }
  return report;
}

/** Loads and checks `codes`, or every language; what `node scripts/check-talk.ts` runs. */
export async function checkLanguages(
  codes: readonly string[],
  fail: (what: string) => void,
): Promise<{ languages: Map<string, Language>; report: LanguageReport }> {
  const languages = new Map<string, Language>();
  const report: LanguageReport = { templates: 0, countries: 0, facts: 0 };
  for (const code of codes) {
    const loader = LOADERS[code];
    if (loader === undefined) {
      fail(`${code}: no such language`);
      continue;
    }
    let language: Language;
    try {
      language = (await loader()).default;
    } catch (error) {
      fail(`${code}: does not load: ${String(error)}`);
      continue;
    }
    languages.set(code, language);
    const one = checkLanguage(code, language, fail);
    report.templates += one.templates;
    report.countries += one.countries;
    report.facts += one.facts;
  }
  return { languages, report };
}

/**
 * Five places, a few people each, one session: what `--sample` prints. The
 * places' size, height, ground and hour are set by hand to what the world has
 * there; the landmark is the nearest in `monuments.json`, by the great circle.
 */
const SAMPLES: readonly (Omit<Where, 'landmark' | 'countryName'> & { lat: number; lon: number })[] = [
  { iso: 'ESP', town: 'Madrid', lat: 40.42, lon: -3.7, population: 3_255_944, capital: true, coastal: false, warmth: 0.62, biome: 'steppe', elevation: 150, hour: 11, craft: [{ kind: 'plane', bearing: 0.4 }], young: false },
  { iso: 'JPN', town: 'Tokyo', lat: 35.69, lon: 139.69, population: 8_336_599, capital: true, coastal: true, warmth: 0.6, biome: 'temperate', elevation: 20, hour: 19, craft: [{ kind: 'boat', bearing: 2.6 }], young: false },
  { iso: 'EGY', town: 'Cairo', lat: 30.06, lon: 31.25, population: 7_734_614, capital: true, coastal: false, warmth: 0.92, biome: 'desert', elevation: 30, hour: 15, craft: [], young: false },
  { iso: 'BRA', town: 'Rio de Janeiro', lat: -22.91, lon: -43.18, population: 6_023_699, capital: false, coastal: true, warmth: 0.88, biome: 'tropical', elevation: 40, hour: 9, craft: [{ kind: 'boat', bearing: 1.9 }, { kind: 'balloon', bearing: -0.8 }], young: false },
  { iso: 'NOR', town: 'Lom', lat: 61.84, lon: 8.57, population: 2_300, capital: false, coastal: false, warmth: 0.22, biome: 'boreal', elevation: 300, hour: 7, craft: [{ kind: 'balloon', bearing: 3.9 }], young: false },
];

async function printSamples(): Promise<void> {
  const info = JSON.parse(readFileSync(resolve(import.meta.dirname, '../public/data/countries-info.json'), 'utf8')) as {
    countries: Record<string, { name: string; capital?: string }>;
  };
  const monuments = (
    JSON.parse(readFileSync(resolve(import.meta.dirname, '../public/data/monuments.json'), 'utf8')) as {
      monuments: { name: string; lat: number; lon: number }[];
    }
  ).monuments;
  const rad = Math.PI / 180;
  const memory = createMemory();
  for (const sample of SAMPLES) {
    const { lat, lon, ...rest } = sample;
    let landmark: Where['landmark'] = null;
    for (const m of monuments) {
      const [p1, p2, dl] = [lat * rad, m.lat * rad, (m.lon - lon) * rad];
      const angle = Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl)));
      const km = angle * 6371;
      if (landmark !== null && km >= landmark.km) continue;
      const bearing = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
      landmark = { name: m.name, km, bearing };
    }
    const country = info.countries[sample.iso];
    const where: Where = { ...rest, countryName: country?.name ?? '', landmark };
    const language = (await LOADERS[languageOf(sample.iso).code]!()).default;
    console.log(`\n=== ${sample.town}, ${where.countryName} (${language.name}; nearest landmark ${landmark?.name}, ${Math.round(landmark?.km ?? 0)} km) ===`);
    // Four strangers, one of them a child, and the first of them a second time.
    const people: [string, boolean][] = [[`${sample.town}|a`, false], [`${sample.town}|b`, false], [`${sample.town}|c`, true], [`${sample.town}|d`, false], [`${sample.town}|a`, false]];
    for (const [key, young] of people) {
      const script = compose(language, country?.capital, key, { ...where, young }, memory);
      console.log(`\n  -- ${key} (${script.persona}; ${script.topics.join(', ')})`);
      for (const line of script.lines) {
        console.log(`  ${line.said.replace(/[\u2068\u2069]/g, '')}`);
        if (line.meant !== line.said) console.log(`    (${line.meant})`);
      }
    }
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename) && process.argv[2] === '--sample') {
  await printSamples();
} else if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const codes = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(LOADERS);
  let failures = 0;
  const { report } = await checkLanguages(codes, (what) => {
    failures++;
    console.log(`  FAIL ${what}`);
  });
  console.log(`${codes.join(' ')}: ${report.templates} templates, ${report.countries} countries, ${report.facts} facts; ${failures} failures`);
  process.exit(failures === 0 ? 0 : 1);
}

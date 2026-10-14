/**
 * Bakes a few facts about each drawn country out of GeoNames' `countryInfo.txt`
 * (CC BY 4.0, the same source and credit as the places) into
 * `public/data/countries-info.json`, for what the townsfolk say about their
 * country (`talk.ts`).
 *
 *   node scripts/build-country-info.mjs [countryInfo.txt]
 *
 * Keyed by the code the outlines use: `ISO_A3` where Natural Earth gives one,
 * `ADM0_A3` otherwise (see `build-countries.mjs`). GeoNames keys by ISO 3166,
 * and the two disagree for twelve of the drawn features. Kosovo (`KOS`, GeoNames'
 * `XK`) is joined by hand. The rest are not countries (Somaliland, Northern
 * Cyprus, the Sovereign Base Areas, Guantanamo Bay, Baikonur, the Cyprus buffer
 * zone, Bir Tawil, the Siachen Glacier, the Southern Patagonian Ice Field, the
 * Indian Ocean Territories) and get no facts rather than a neighbour's. The
 * bake prints the list, and `pnpm check` asserts every drawn country GeoNames
 * has a row for has facts.
 *
 * Languages are names, not codes: GeoNames lists BCP 47 tags in order of use
 * (`es-ES,ca,gl`) and `Intl.DisplayNames` turns each into its English name at
 * bake time, region dropped and duplicates folded. A tag the platform cannot
 * name (family codes such as `sit`, `inc`) is dropped; the bake prints how many.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { decodeCountries, inflate } from '../src/pack.ts';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = process.argv[2] ?? resolve(here, '../../.cache/countryInfo.txt');
const OUT = resolve(here, '../public/data/countries-info.json');

/** An outline code GeoNames files under another, by its ISO alpha-2. */
const JOIN = { KOS: 'XK' };

const CONTINENTS = {
  AF: 'Africa',
  AN: 'Antarctica',
  AS: 'Asia',
  EU: 'Europe',
  NA: 'North America',
  OC: 'Oceania',
  SA: 'South America',
};

const byAlpha3 = new Map();
const byAlpha2 = new Map();
for (const line of readFileSync(SOURCE, 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const f = line.split('\t');
  if (f.length < 16) continue;
  const field = (k) => (f[k] ?? '').trim();
  const row = {
    iso2: field(0),
    iso3: field(1),
    name: field(4),
    capital: field(5),
    area: Number(field(6)),
    population: Number(field(7)),
    continent: field(8),
    currencyCode: field(10),
    currency: field(11),
    languages: field(15),
  };
  byAlpha3.set(row.iso3, row);
  byAlpha2.set(row.iso2, row);
}

const names = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
let unnamed = 0;
function languagesOf(tags) {
  const out = [];
  for (const tag of tags.split(',').map((t) => t.trim()).filter(Boolean)) {
    let name;
    try {
      name = names.of(tag.split('-')[0]);
    } catch {
      name = undefined;
    }
    if (name === undefined) {
      unnamed++;
      continue;
    }
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

const countries = decodeCountries(await inflate(readFileSync(resolve(here, '../public/data/countries.bin'))));
const facts = {};
const missing = [];
for (const country of countries) {
  const row = JOIN[country.iso] !== undefined ? byAlpha2.get(JOIN[country.iso]) : byAlpha3.get(country.iso);
  if (row === undefined) {
    missing.push(`${country.iso} ${country.name}`);
    continue;
  }
  facts[country.iso] = {
    name: row.name,
    ...(row.capital ? { capital: row.capital } : {}),
    population: row.population,
    areaKm2: row.area,
    languages: languagesOf(row.languages),
    ...(row.currency ? { currency: row.currency, currencyCode: row.currencyCode } : {}),
    continent: CONTINENTS[row.continent] ?? row.continent,
  };
}

// `without` is written into the file so that `pnpm check`, which runs where
// `countryInfo.txt` is not, can still tell a drawn country nobody baked facts
// for from one GeoNames has no row for.
const json = JSON.stringify(
  {
    source: 'GeoNames countryInfo.txt (https://www.geonames.org), CC BY 4.0',
    without: missing.map((row) => row.split(' ')[0]),
    countries: facts,
  },
  null,
  1,
);
writeFileSync(OUT, `${json}\n`);

console.log(
  `${Object.keys(facts).length} of ${countries.length} drawn countries have facts -> ` +
    `${(Buffer.byteLength(json) / 1024).toFixed(1)} KB`,
);
console.log(`  none in GeoNames (${missing.length}): ${missing.join(', ')}`);
console.log(`  ${unnamed} language tags the platform cannot name, dropped`);

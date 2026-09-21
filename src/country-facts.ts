/**
 * What a person would say about a country, for the card that names it as you
 * cross in: its capital, how many live there, how big it is, what they speak,
 * what they pay with and which continent it is on.
 *
 * Baked by `scripts/build-country-info.mjs` from GeoNames' `countryInfo.txt`
 * (CC BY 4.0, credited with the places) into `public/data/countries-info.json`,
 * keyed by the same `iso` the outlines, the flags and the clock use. 228 of the
 * 239 drawn features have a row; the eleven that do not are not countries —
 * bases, buffer zones, unclaimed or unrecognised ground — and answer `null`
 * rather than a neighbour's facts.
 *
 * **Not in the first load.** It is 10 KB gzipped of something nothing needs
 * until the first frontier, so it is fetched once the HUD exists — early
 * enough that the first card has its line — and kept: every call after the
 * first resolves from the same promise.
 */
import { DATA_URL } from './pack.ts';

export interface CountryFacts {
  /** GeoNames' English name, which is not always Natural Earth's. */
  name: string;
  /** Absent for Antarctica and the few territories with none. */
  capital?: string;
  population: number;
  areaKm2: number;
  /** English names in GeoNames' order of use, most spoken first; may be empty. */
  languages: string[];
  /** GeoNames' short name for it — "Euro", "Dollar", "Yuan Renminbi". */
  currency?: string;
  /** ISO 4217, beside `currency`: "EUR", "USD", "CNY". */
  currencyCode?: string;
  /** "Europe", "North America", ... "Antarctica". */
  continent: string;
}

let facts: Promise<Record<string, CountryFacts>> | null = null;

/** Every country's facts, fetched once. A failed fetch is retried on the next call. */
export function loadCountryFacts(url = `${DATA_URL}countries-info.json`): Promise<Record<string, CountryFacts>> {
  facts ??= fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
      return response.json() as Promise<{ countries: Record<string, CountryFacts> }>;
    })
    .then((file) => file.countries)
    .catch((error: unknown) => {
      facts = null;
      throw error;
    });
  return facts;
}

/** One country's facts by its outline code, or null for ground that has none. */
export async function countryFacts(iso: string): Promise<CountryFacts | null> {
  return (await loadCountryFacts())[iso] ?? null;
}

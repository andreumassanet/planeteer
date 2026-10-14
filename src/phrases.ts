/**
 * What the townsfolk say, in the language of the country they live in: the
 * line keys, the shape of a language file, and which language a country
 * speaks. The lines themselves are one lazily loaded module per language under
 * `phrases/`.
 *
 * Every line is a pair: what is said, and what it means in English. English
 * writes a bare string, which is its own meaning. `check-people.ts` holds each
 * language to `MIN_VARIANTS` per key and both halves to the same placeholders.
 *
 * Templates never inflect a name: a placeholder stands where the language
 * leaves it as spelled (the subject of a nominal sentence, in apposition to a
 * common noun that takes the case, before an invariant particle, or after a
 * colon or comma). Facts are written in the form every template for them can
 * take unchanged, as they would stand mid-sentence; `fill` capitalises one
 * that opens a sentence. No line agrees with the speaker's or listener's sex.
 */

/** Every line a person can say, by what it is about. */
export const LINE_KEYS = [
  // Hello, by the hour, and to somebody met before.
  'morning',
  'afternoon',
  'evening',
  'night',
  'again',
  'welcome',
  // The town.
  'capitalHere',
  'capitalThere',
  'big',
  'middling',
  'small',
  'coast',
  'inland',
  'high',
  // The ground it stands on.
  'snowy',
  'forest',
  'desert',
  'plains',
  'tropical',
  // What there is to go and see, or to take.
  'landmark',
  'landmarkNear',
  'plane',
  'balloon',
  'boat',
  // The weather and the hour.
  'hot',
  'cold',
  'mild',
  'late',
  'early',
  // The country, and what its people would tell you about it.
  'country',
  'dish',
  'drink',
  'festival',
  'sport',
  'wonder',
  'pride',
  'proverb',
  // Small talk, and who is making it.
  'chat',
  'childGreet',
  'childChat',
  'childBye',
  'grumpyGreet',
  'grumpyChat',
  'grumpyBye',
  'elderChat',
  'chattyChat',
  'bye',
] as const;
export type LineKey = (typeof LINE_KEYS)[number];

/** Keys every conversation of its kind reaches for, and so wants the most variants. */
const MOST: readonly LineKey[] = ['chat', 'childChat'];
const MORE: readonly LineKey[] = ['welcome', 'bye', 'hot', 'cold', 'mild', 'grumpyChat', 'elderChat', 'chattyChat'];

/**
 * The fewest variants a language may have under a key, so that people in one
 * square rarely repeat each other: six for small talk, five for the welcome,
 * weather and goodbye, four for the rest.
 */
export const MIN_VARIANTS: Readonly<Record<LineKey, number>> = Object.fromEntries(
  LINE_KEYS.map((key) => [key, MOST.includes(key) ? 6 : MORE.includes(key) ? 5 : 4]),
) as Record<LineKey, number>;

/** The longest a filled line may be, said or meant, and still sit in the bubble in a few lines. */
export const LINE_MAX = 140;

/** What a country's people would tell a stranger about it, each a placeholder of the same name. */
export const FACTS = ['dish', 'drink', 'festival', 'sport', 'wonder', 'pride', 'proverb'] as const;
export type Fact = (typeof FACTS)[number];

/** What a template may ask to have filled in, as `{name}`. */
export const PLACEHOLDERS = ['town', 'country', 'capital', 'landmark', 'km', 'dir', ...FACTS] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

/**
 * What each key may name besides `{town}`, which every line may, and which of
 * those every variant must: a conversation reaches for a key only when what it
 * names is known, so a template naming anything else could go out unfilled.
 */
export const NAMES_OF: Readonly<Partial<Record<LineKey, { may: readonly Placeholder[]; must: readonly Placeholder[] }>>> = {
  capitalHere: { may: ['country'], must: [] },
  capitalThere: { may: ['capital', 'country'], must: ['capital'] },
  landmark: { may: ['landmark', 'km', 'dir'], must: ['landmark'] },
  landmarkNear: { may: ['landmark'], must: ['landmark'] },
  plane: { may: ['dir'], must: [] },
  balloon: { may: ['dir'], must: [] },
  boat: { may: ['dir'], must: [] },
  country: { may: ['country'], must: ['country'] },
  ...Object.fromEntries(FACTS.map((fact) => [fact, { may: [fact, 'country'], must: [fact] }])),
};

/**
 * A line or a fact: what is said and what it means in English. A bare string
 * is its own meaning, which only English, and a fact English shares, may use.
 */
export type Said = string | readonly [said: string, meant: string];

/** A country's facts, in the language it is spoken to in; any may be left out. */
export type CountryLines = Readonly<Partial<Record<Fact, Said>>>;

export interface Language {
  /** Its BCP 47 tag, for `Intl` and for the page's `lang`. */
  locale: string;
  /** Its name in English, for the bubble's foot. */
  name: string;
  /** Written right to left. */
  rtl?: boolean;
  /** Between two sentences said together: a space, or nothing in scripts that do not space them. */
  join: string;
  /**
   * Where a place lies, as the phrase each template puts after a distance:
   * north first and then clockwise by eighths.
   */
  compass: readonly [string, string, string, string, string, string, string, string];
  lines: Readonly<Record<LineKey, readonly Said[]>>;
  /** The facts of every country spoken to in this language, by outline code. */
  countries: Readonly<Record<string, CountryLines>>;
}

/** The compass in English, for the meaning under a line in any language. */
export const ENGLISH_COMPASS: Language['compass'] = [
  'to the north', 'to the northeast', 'to the east', 'to the southeast',
  'to the south', 'to the southwest', 'to the west', 'to the northwest',
];

/**
 * Every language, English first. One literal `import()` per language so the
 * bundler gives each its own chunk and Node's checks load them the same way.
 */
export const LOADERS: Readonly<Record<string, () => Promise<{ default: Language }>>> = {
  en: () => import('./phrases/en.ts'),
  es: () => import('./phrases/es.ts'),
  fr: () => import('./phrases/fr.ts'),
  de: () => import('./phrases/de.ts'),
  it: () => import('./phrases/it.ts'),
  pt: () => import('./phrases/pt.ts'),
  nl: () => import('./phrases/nl.ts'),
  sv: () => import('./phrases/sv.ts'),
  pl: () => import('./phrases/pl.ts'),
  ru: () => import('./phrases/ru.ts'),
  uk: () => import('./phrases/uk.ts'),
  tr: () => import('./phrases/tr.ts'),
  el: () => import('./phrases/el.ts'),
  ro: () => import('./phrases/ro.ts'),
  cs: () => import('./phrases/cs.ts'),
  ja: () => import('./phrases/ja.ts'),
  zh: () => import('./phrases/zh.ts'),
  'zh-Hant': () => import('./phrases/zh-hant.ts'),
  ko: () => import('./phrases/ko.ts'),
  ar: () => import('./phrases/ar.ts'),
  fa: () => import('./phrases/fa.ts'),
  he: () => import('./phrases/he.ts'),
  hi: () => import('./phrases/hi.ts'),
  bn: () => import('./phrases/bn.ts'),
  ur: () => import('./phrases/ur.ts'),
  th: () => import('./phrases/th.ts'),
  vi: () => import('./phrases/vi.ts'),
  id: () => import('./phrases/id.ts'),
  ms: () => import('./phrases/ms.ts'),
  sw: () => import('./phrases/sw.ts'),
  tl: () => import('./phrases/tl.ts'),
};

const loaded = new Map<string, Promise<Language>>();

/** A language by its code, fetched on the first ask and kept; an unknown code is English. */
export function loadLanguage(code: string): Promise<Language> {
  let language = loaded.get(code);
  if (language === undefined) {
    const loader = LOADERS[code] ?? LOADERS.en!;
    language = loader().then((module) => module.default);
    // A failed fetch is not kept, so the next conversation tries again.
    language.catch(() => loaded.delete(code));
    loaded.set(code, language);
  }
  return language;
}

/**
 * The language each country speaks to a stranger, by outline code, as
 * `[language, ISO 3166 alpha-2]` (the alpha-2 is for `Intl.DisplayNames`).
 * Mostly GeoNames' first language, overridden where people in the street would
 * greet you in another (Hindi in India, Swahili in Kenya, Russian in Belarus,
 * Kazakhstan and Kyrgyzstan, French in Cameroon, Haiti and Luxembourg).
 * Unlisted countries get English, with facts in `phrases/en.ts`.
 */
export const SPOKEN: Readonly<Record<string, readonly [string, string]>> = {
  // Spanish
  ARG: ['es', 'AR'], BOL: ['es', 'BO'], CHL: ['es', 'CL'], COL: ['es', 'CO'], CRI: ['es', 'CR'], CUB: ['es', 'CU'],
  DOM: ['es', 'DO'], ECU: ['es', 'EC'], SLV: ['es', 'SV'], GNQ: ['es', 'GQ'], GTM: ['es', 'GT'], HND: ['es', 'HN'],
  MEX: ['es', 'MX'], NIC: ['es', 'NI'], PAN: ['es', 'PA'], PRY: ['es', 'PY'], PER: ['es', 'PE'], ESP: ['es', 'ES'],
  URY: ['es', 'UY'], VEN: ['es', 'VE'], PRI: ['es', 'PR'],
  // French
  BEN: ['fr', 'BJ'], BFA: ['fr', 'BF'], BDI: ['fr', 'BI'], CAF: ['fr', 'CF'], TCD: ['fr', 'TD'], CIV: ['fr', 'CI'],
  COD: ['fr', 'CD'], DJI: ['fr', 'DJ'], FRA: ['fr', 'FR'], PYF: ['fr', 'PF'], ATF: ['fr', 'TF'], GAB: ['fr', 'GA'],
  GIN: ['fr', 'GN'], MDG: ['fr', 'MG'], MLI: ['fr', 'ML'], NCL: ['fr', 'NC'], NER: ['fr', 'NE'], COG: ['fr', 'CG'],
  SPM: ['fr', 'PM'], MAF: ['fr', 'MF'], SEN: ['fr', 'SN'], TGO: ['fr', 'TG'], WLF: ['fr', 'WF'], CMR: ['fr', 'CM'],
  HTI: ['fr', 'HT'], LUX: ['fr', 'LU'], MCO: ['fr', 'MC'],
  // Arabic
  DZA: ['ar', 'DZ'], BHR: ['ar', 'BH'], COM: ['ar', 'KM'], EGY: ['ar', 'EG'], IRQ: ['ar', 'IQ'], JOR: ['ar', 'JO'],
  KWT: ['ar', 'KW'], LBN: ['ar', 'LB'], LBY: ['ar', 'LY'], MRT: ['ar', 'MR'], MAR: ['ar', 'MA'], OMN: ['ar', 'OM'],
  PSE: ['ar', 'PS'], QAT: ['ar', 'QA'], SAU: ['ar', 'SA'], SDN: ['ar', 'SD'], SYR: ['ar', 'SY'], TUN: ['ar', 'TN'],
  ARE: ['ar', 'AE'], ESH: ['ar', 'EH'], YEM: ['ar', 'YE'],
  // Portuguese
  AGO: ['pt', 'AO'], BRA: ['pt', 'BR'], GNB: ['pt', 'GW'], MOZ: ['pt', 'MZ'], PRT: ['pt', 'PT'], CPV: ['pt', 'CV'],
  STP: ['pt', 'ST'], TLS: ['pt', 'TL'],
  // Dutch, German, Italian, Swedish
  ABW: ['nl', 'AW'], BEL: ['nl', 'BE'], CUW: ['nl', 'CW'], NLD: ['nl', 'NL'], SUR: ['nl', 'SR'],
  AUT: ['de', 'AT'], DEU: ['de', 'DE'], LIE: ['de', 'LI'], CHE: ['de', 'CH'],
  ITA: ['it', 'IT'], SMR: ['it', 'SM'], VAT: ['it', 'VA'],
  ALA: ['sv', 'AX'], SWE: ['sv', 'SE'],
  // Chinese
  CHN: ['zh', 'CN'], SGP: ['zh', 'SG'], HKG: ['zh-Hant', 'HK'], MAC: ['zh-Hant', 'MO'], TWN: ['zh-Hant', 'TW'],
  // The rest, one or a few countries each
  AFG: ['fa', 'AF'], IRN: ['fa', 'IR'],
  BRN: ['ms', 'BN'], MYS: ['ms', 'MY'],
  CYP: ['el', 'CY'], GRC: ['el', 'GR'],
  PRK: ['ko', 'KP'], KOR: ['ko', 'KR'],
  MDA: ['ro', 'MD'], ROU: ['ro', 'RO'],
  RUS: ['ru', 'RU'], BLR: ['ru', 'BY'], KAZ: ['ru', 'KZ'], KGZ: ['ru', 'KG'],
  TZA: ['sw', 'TZ'], KEN: ['sw', 'KE'],
  TUR: ['tr', 'TR'], CYN: ['tr', ''],
  PHL: ['tl', 'PH'], BGD: ['bn', 'BD'], CZE: ['cs', 'CZ'], ISR: ['he', 'IL'], IND: ['hi', 'IN'],
  IDN: ['id', 'ID'], JPN: ['ja', 'JP'], POL: ['pl', 'PL'], THA: ['th', 'TH'], UKR: ['uk', 'UA'],
  PAK: ['ur', 'PK'], VNM: ['vi', 'VN'],
};

/**
 * Countries with no facts: the French Southern Territories are uninhabited,
 * and Northern Cyprus and Western Sahara are disputed, where a line about
 * national pride would take a side.
 */
export const WITHOUT_FACTS: ReadonlySet<string> = new Set(['ATF', 'CYN', 'ESH']);

/** The language code a country's people speak to a stranger, and its alpha-2 code ('' if it has none). */
export function languageOf(iso: string): { code: string; alpha2: string } {
  const spoken = SPOKEN[iso];
  return spoken === undefined || LOADERS[spoken[0]] === undefined ? { code: 'en', alpha2: '' } : { code: spoken[0], alpha2: spoken[1] };
}

/** The said half of a line or a fact. */
export const saidOf = (line: Said): string => (typeof line === 'string' ? line : line[0]);
/** The meant half: what it is in English. */
export const meantOf = (line: Said): string => (typeof line === 'string' ? line : line[1]);

/** `{name}` in a template, and the names a template uses. */
export const PLACEHOLDER_PATTERN = /\{([a-zA-Z]+)\}/g;

/** What, just before a placeholder, means the placeholder opens a sentence. */
const SENTENCE_OPENS = /(?:^|[.!?。！？]\s+|[¡¿]|(?:^|[.!?:]\s+)[“"«„「『]\s*)$/u;

/**
 * A template with its placeholders filled in. Each value is wrapped in
 * first-strong isolates so a Latin name in a right-to-left sentence keeps its
 * own direction. A value that opens a sentence is capitalised by `locale`.
 */
export function fill(
  template: string,
  values: Readonly<Partial<Record<Placeholder, string>>>,
  isolate = true,
  locale = 'en',
): string {
  return template.replace(PLACEHOLDER_PATTERN, (whole, name: string, offset: number) => {
    let value = values[name as Placeholder];
    if (value === undefined) return whole;
    if (value !== '' && SENTENCE_OPENS.test(template.slice(0, offset))) {
      const first = String.fromCodePoint(value.codePointAt(0)!);
      value = first.toLocaleUpperCase(locale) + value.slice(first.length);
    }
    return isolate ? `⁨${value}⁩` : value;
  });
}

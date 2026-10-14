import './appearance.ts';
import { checkLanguages, requiredCountries } from '../check-talk.ts';
import { LOADERS, languageOf, SPOKEN, LINE_MAX, fill, saidOf, type LineKey } from '../../src/phrases.ts';
import { fail } from './setup.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Where, compose, createMemory } from '../../src/talk.ts';

// ---------------------------------------------------------------------------
// What they say
// ---------------------------------------------------------------------------

console.log('\n=== what they say ===');
{
  // Every language against its contract (`check-talk.ts`), and every country
  // that must have facts has them in the language it is spoken to in.
  const { languages, report } = await checkLanguages(Object.keys(LOADERS), fail);
  for (const iso of requiredCountries()) {
    const { code } = languageOf(iso);
    if (languages.get(code)?.countries[iso] === undefined) fail(`${iso}: no facts in ${code}`);
  }
  // Every country's language exists and `Intl` can name the country in it.
  let named = 0;
  for (const [iso, [code, alpha2]] of Object.entries(SPOKEN)) {
    const language = languages.get(code);
    if (!/^[A-Z]{3}$/.test(iso)) fail(`SPOKEN: ${iso} is not an outline code`);
    if (language === undefined) {
      fail(`SPOKEN.${iso}: no language ${code}`);
      continue;
    }
    if (alpha2 === '') continue;
    if (!/^[A-Z]{2}$/.test(alpha2)) fail(`SPOKEN.${iso}: ${alpha2} is not an alpha-2 code`);
    const name = new Intl.DisplayNames([language.locale], { type: 'region' }).of(alpha2);
    if (name === undefined || name === alpha2) fail(`SPOKEN.${iso}: Intl has no ${language.name} name for ${alpha2}`);
    else named++;
  }
  // The words stay out of the first load: nothing imports a language file but
  // `phrases.ts`'s loaders, and `main.ts` reaches `talk.ts` only by a dynamic import.
  const source = (path: string): string => readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8');
  if (/^import[^;]*from '\.\/phrases\//m.test(source('src/phrases.ts'))) fail('phrases.ts imports a language statically');
  if (/^import(?! type)[^;]*from '\.\/(talk|phrases)\.ts'/m.test(source('src/main.ts'))) fail('main.ts imports talk.ts or phrases.ts statically');
  if (/^import(?! type)[^;]*from '\.\/phrases\//m.test(source('src/talk.ts'))) fail('talk.ts imports a language statically');

  // A conversation in every country spoken to, by a dozen people, in a full
  // place and a bare one: the same twice from a fresh memory, nothing left
  // unfilled, nothing longer than the bubble, written the way its language runs.
  const full: Where = {
    iso: '', countryName: 'Testland', town: 'Testville', population: 2e6, capital: false, coastal: true,
    warmth: 0.5, biome: 'desert', elevation: 400, hour: 10, landmark: { name: 'Test Tower', km: 812.4, bearing: -2.9 },
    craft: [{ kind: 'plane', bearing: 1 }, { kind: 'boat', bearing: -1 }], young: false,
  };
  const bare: Where = { ...full, countryName: '', population: 900, coastal: false, biome: 'temperate', elevation: 0, hour: 23, landmark: null, craft: [] };
  const personas = new Map<string, number>();
  let spoken = 0;
  let conversations = 0;
  const countries = [...Object.keys(SPOKEN), ...Object.keys(languages.get('en')?.countries ?? {}), 'XXX'];
  for (const iso of countries) {
    const language = languages.get(languageOf(iso).code);
    if (language === undefined) continue;
    for (const [where, capital] of [[full, 'Capitol'], [bare, undefined]] as const) {
      for (let person = 0; person < 12; person++) {
        const at: Where = { ...where, iso, young: person % 5 === 0 };
        const a = compose(language, capital, `check|${person}`, at);
        const b = compose(language, capital, `check|${person}`, at);
        conversations++;
        personas.set(a.persona, (personas.get(a.persona) ?? 0) + 1);
        if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${iso}: a conversation that differs from itself`);
        if (a.lines.length < 3) fail(`${iso}: a conversation of ${a.lines.length} lines`);
        if (a.rtl !== (language.rtl === true)) fail(`${iso}: a conversation that runs the wrong way`);
        if (new Set(a.topics).size !== a.topics.length) fail(`${iso}: one topic twice in a conversation`);
        for (const line of a.lines) {
          spoken++;
          if (/[{}]/.test(line.said + line.meant)) fail(`${iso}: unfilled in "${line.said}" / "${line.meant}"`);
          const said = line.said.replace(/[\u2068\u2069]/g, '');
          if (said.length > LINE_MAX) fail(`${iso}: ${said.length} characters said: "${said}"`);
          if (line.meant.length > LINE_MAX) fail(`${iso}: ${line.meant.length} characters meant: "${line.meant}"`);
        }
      }
    }
  }
  for (const persona of ['child', 'elder', 'grumpy', 'chatty', 'plain']) {
    if ((personas.get(persona) ?? 0) === 0) fail(`nobody in ${conversations} conversations is ${persona}`);
  }
  // A session: a second word with somebody is an "again", and two
  // conversations in a row are about different things while there is
  // anything else to say.
  {
    const language = languages.get('es')!;
    const memory = createMemory();
    const at: Where = { ...full, iso: 'ESP', countryName: 'Spain' };
    const again = new Set(language.lines.again.map((line) => fill(saidOf(line), { town: at.town }, true, language.locale)));
    compose(language, 'Madrid', 'check|again', at, memory);
    const second = compose(language, 'Madrid', 'check|again', at, memory);
    if (!again.has(second.lines[0]!.said)) fail(`a second word with somebody does not open with "again": "${second.lines[0]!.said}"`);
    let previous: LineKey[] = [];
    for (let person = 0; person < 40; person++) {
      const next = compose(language, 'Madrid', `check|row|${person}`, at, memory);
      const repeated = next.topics.filter((topic) => previous.includes(topic));
      if (repeated.length > 0) fail(`two conversations in a row about ${repeated.join(', ')}`);
      previous = next.topics;
    }
    // And the variants of a key go round before any is said twice.
    const fresh = createMemory();
    const byes: string[] = [];
    for (let person = 0; byes.length < language.lines.bye.length && person < 200; person++) {
      const said = compose(language, 'Madrid', `check|bye|${person}`, at, fresh);
      if (said.persona !== 'child' && said.persona !== 'grumpy') byes.push(said.lines.at(-1)!.said);
    }
    if (new Set(byes).size !== byes.length) fail(`a goodbye heard twice before the others: ${byes.join(' / ')}`);
  }
  console.log(
    `${languages.size} languages, ${report.templates} templates, ${report.countries} countries with ${report.facts} facts; ` +
      `${Object.keys(SPOKEN).length} countries spoken to in their own, ${named} named by Intl; ` +
      `${conversations} conversations, ${spoken} lines composed; personas ${[...personas].map(([p, n]) => `${p} ${n}`).join(', ')}`,
  );
}

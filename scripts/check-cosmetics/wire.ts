/** The look code with what is earned on it: round trips, old codes, and new codes read by an old build. */
import {
  CLOTH,
  DEFAULT_APPEARANCE,
  LOOK_LENGTH,
  LOOK_MAX,
  LOOK_MIN,
  decodeAppearance,
  encodeAppearance,
  fitAppearance,
  randomAppearance,
  type Appearance,
} from '../../src/appearance.ts';
import { BY_SLOT, COSMETIC_SLOTS, SLOT_FIELD, cosmeticsOf, unlockedOf, withoutLocked, wornItems } from '../../src/cosmetics.ts';
import { rngFrom } from '../../src/scenery/random.ts';
import { LOOK_PATTERN, cleanLook } from '../../server/src/limits.ts';
import { fail } from './setup.ts';

/**
 * The reader as it was before anything was earned, kept word for word: a
 * build from then must still read what this one writes.
 */
const LEGACY_FIELDS = ['body', 'skin', 'head', 'hair', 'top', 'topColour', 'bottom', 'bottomColour', 'feet', 'feetColour', 'pack', 'packColour'] as const;
function legacyDecode(code: unknown): Record<string, number | string | boolean> | null {
  if (typeof code !== 'string' || code.length > 24 || code.length < LEGACY_FIELDS.length + 1) return null;
  if (!/^[0-9a-z]+$/.test(code) || code[0] !== 'a') return null;
  const digit = (i: number): number => parseInt(code[i + 1]!, 36);
  const value = (field: (typeof LEGACY_FIELDS)[number]): number => digit(LEGACY_FIELDS.indexOf(field));
  return {
    body: value('body') === 1 ? 'woman' : 'man',
    skin: value('skin'), head: value('head'), hair: value('hair'),
    top: value('top'), topColour: value('topColour'), bottom: value('bottom'), bottomColour: value('bottomColour'),
    feet: value('feet'), feetColour: value('feetColour'), pack: value('pack') === 1, packColour: value('packColour'),
  };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const base = (a: Appearance): Record<string, unknown> => Object.fromEntries(LEGACY_FIELDS.map((field) => [field, a[field]]));

console.log('\nthe look code:');
{
  if (LOOK_LENGTH > LOOK_MAX) fail(`a code is ${LOOK_LENGTH} long and the longest read is ${LOOK_MAX}`);
  if (LOOK_MIN !== 13) fail(`the shortest code is ${LOOK_MIN}, not the 13 every build has written`);
  let written = 0;
  const check = (look: Appearance, what: string): void => {
    const code = encodeAppearance(look);
    written++;
    if (code.length !== LOOK_LENGTH) fail(`${what}: ${code} is ${code.length} long`);
    if (!LOOK_PATTERN.test(code) || cleanLook(code) !== code) fail(`${what}: the relay does not pass ${code} on`);
    if (!same(decodeAppearance(code), fitAppearance(look))) fail(`${what}: ${code} does not read back`);
    const old = legacyDecode(code);
    if (old === null || !same(old, base(fitAppearance(look)))) fail(`${what}: an older build reads ${code} as ${JSON.stringify(old)}`);
  };
  check(DEFAULT_APPEARANCE, 'the default');
  for (const slot of COSMETIC_SLOTS) {
    const field = SLOT_FIELD[slot];
    for (let i = 0; i <= BY_SLOT[slot].length; i++) {
      for (const body of ['man', 'woman'] as const) check({ ...DEFAULT_APPEARANCE, body, [field]: i }, `${body} ${slot} ${i}`);
    }
  }
  for (let i = 0; i < CLOTH.length; i++) check({ ...DEFAULT_APPEARANCE, hat: 2, hatColour: i }, `hat colour ${i}`);
  const everything: Appearance = { ...DEFAULT_APPEARANCE, hat: BY_SLOT.hat.length, hatColour: CLOTH.length - 1, back: BY_SLOT.back.length, trail: BY_SLOT.trail.length, title: BY_SLOT.title.length, canopy: BY_SLOT.canopy.length, pet: BY_SLOT.pet.length };
  check(everything, 'the last of everything');
  for (let i = 0; i < 500; i++) {
    const r = rngFrom('check-cosmetics-wire', i);
    check({ ...randomAppearance(r), hat: r.int(BY_SLOT.hat.length + 1), hatColour: r.int(CLOTH.length), back: r.int(BY_SLOT.back.length + 1), trail: r.int(BY_SLOT.trail.length + 1), title: r.int(BY_SLOT.title.length + 1), canopy: r.int(BY_SLOT.canopy.length + 1), pet: r.int(BY_SLOT.pet.length + 1) }, `random ${i}`);
  }
  // A code written before anything was earned: as before, and nothing worn.
  for (let i = 0; i < 300; i++) {
    const look = randomAppearance(rngFrom('check-cosmetics-old', i));
    const old = encodeAppearance(look).slice(0, 13);
    const read = decodeAppearance(old);
    if (read === null) fail(`an old code ${old} is refused`);
    else {
      if (!same(base(read), base(fitAppearance(look)))) fail(`an old code ${old} reads as another traveller`);
      if (wornItems(read).length > 0 || read.hatColour !== DEFAULT_APPEARANCE.hatColour) fail(`an old code ${old} wears something`);
    }
  }
  // A code cut anywhere inside the new fields wears nothing it cannot read whole.
  const code = encodeAppearance(everything);
  for (let n = 13; n < code.length; n++) {
    const read = decodeAppearance(code.slice(0, n));
    if (read === null) fail(`a code cut to ${n} is refused`);
  }
  const cut = decodeAppearance(code.slice(0, 18));
  if (cut === null || cut.title !== 0 || cut.hat !== everything.hat) fail('a code cut through the title reads a title');
  // A newer build's: fields appended and indices past these tables.
  const newer = decodeAppearance(`${encodeAppearance(everything)}zz`);
  if (!same(newer, fitAppearance(everything))) fail('a code with fields appended does not read as its first part');
  const past = decodeAppearance(`${encodeAppearance(DEFAULT_APPEARANCE).slice(0, 13)}zzzzzzzz`);
  if (past === null || wornItems(past).length > 0) fail('indices past the tables are worn');
  // The crowd wears none of it, and neither does the traveller before choosing.
  for (let i = 0; i < 300; i++) if (wornItems(randomAppearance(rngFrom('check-cosmetics-crowd', i))).length > 0) fail('a random traveller wears something earned');
  if (wornItems(DEFAULT_APPEARANCE).length > 0) fail('the default traveller wears something earned');
  // Taking off what is not earned, and keeping what is worn across a change.
  const stripped = withoutLocked(everything, unlockedOf());
  if (wornItems(stripped).some((item) => item.unlock.kind !== 'free')) fail('withoutLocked leaves something unearned on');
  if (!same(cosmeticsOf({ ...randomAppearance(rngFrom('x', 1)), ...cosmeticsOf(everything) }), cosmeticsOf(everything))) fail('cosmeticsOf does not carry the earned part');
  console.log(`  ${written} codes of ${LOOK_LENGTH} characters written, read back, passed by the relay and read by the old reader; 300 old codes wear nothing`);
}

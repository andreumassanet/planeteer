import { resolve } from 'node:path';
import { AVATAR_HEIGHT } from '../../src/stature.ts';
import { registerModelsFromDisk } from '../kit-node.ts';
import { readFileSync } from 'node:fs';

export const PUBLIC = resolve(import.meta.dirname, '../../public');
export const H = AVATAR_HEIGHT;

export let failures = 0;
export const fail = (message: string): void => {
  failures++;
  console.log(`  FAIL  ${message}`);
};
export const f = (value: number, digits = 2): string => value.toFixed(digits);

// kit-node supplies the globals GLTFLoader reaches for in Node, so everything
// that reaches the loader is imported after it.
await registerModelsFromDisk();
const { modelsFrom, rigFrom } = await import('../../src/kit.ts');
const { CRAFT_IDS, craftFrom } = await import('../../src/craft/index.ts');
const { horseMaterial } = await import('../../src/craft/horse.ts');
export const { AVATAR_HIP, HERO } = await import('../../src/craft/body.ts');
export const { reviewCraft } = await import('../../src/craft/review.ts');
export type CraftReview = import('../../src/craft/review.ts').CraftReview;
export const kit = await modelsFrom(readFileSync(resolve(PUBLIC, 'models/traffic/kit.bin')));
export const horseRig = await rigFrom(readFileSync(resolve(PUBLIC, 'models/fauna/horse.bin')), 'horse', horseMaterial());
if (!horseRig.clips.some((clip) => clip.name === 'Gallop')) fail("the horse's rig has no Gallop: re-bake it (`pnpm kit`)");
export const craft = craftFrom(kit, horseRig);

/** Triangles a craft may spend, all its parts together. */
export const BUDGET: Record<string, number> = {
  hatchback: 3000,
  van: 3000,
  jeep: 3000,
  pickup: 3000,
  tractor: 3000,
  saloon: 3000,
  minibus: 3500,
  // Four rows in a lined, furnished cabin, with its glass.
  bus: 3500,
  scooter: 1500,
  'tuk-tuk': 1500,
  bicycle: 2000,
  motorbike: 2000,
  launch: 3000,
  'jet-ski': 2000,
  sailboat: 2000,
  'light-plane': 6000,
  helicopter: 3000,
  balloon: 5000,
  horse: 3000,
  submarine: 2000,
};
/** How near a headlamp is to the drawn surface, in bodies: on the model, not in the air before it. */
export const LAMP_ON = 0.02;
/** Seats a craft must have at least. */
export const SEATS_AT_LEAST: Record<string, number> = {
  hatchback: 4, van: 2, launch: 4, 'light-plane': 4, balloon: 4,
  bus: 8, minibus: 4, saloon: 2, helicopter: 4, 'tuk-tuk': 3, motorbike: 2, 'jet-ski': 2, sailboat: 2, jeep: 2, pickup: 2, submarine: 2,
};

// --- the ids -------------------------------------------------------------

for (const id of CRAFT_IDS) if (!craft.has(id)) fail(`no craft '${id}', which the fleet places`);
console.log(`craft: ${[...craft.keys()].join(', ')}\n`);

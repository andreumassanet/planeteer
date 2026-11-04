/**
 * The handbook: everything the guild's people explain and the Field Guide
 * holds, as data. A topic belongs to one role, who explains it in the square;
 * the Field Guide lists them all. Page text is plain, with a key as `{action}`
 * (an `Action` of `controls.ts`, drawn as the player's own key cap) and
 * paragraphs split by a blank line; `touch` is the page again for a finger,
 * where it differs.
 *
 * The topics live in `lore/`, a file a few roles; `scripts/check-lore.ts`
 * holds every key to a real action and every page to its length.
 */
import { BASICS } from './lore/basics.ts';
import { FLYING } from './lore/flying.ts';
import { MAPS } from './lore/maps.ts';
import { RECORDS } from './lore/records.ts';
import type { LoreTopic } from './lore/types.ts';
import { VEHICLES } from './lore/vehicles.ts';
import { WORK } from './lore/work.ts';
import { WORLD } from './lore/world.ts';

export type { Greetings, LorePage, LoreTopic } from './lore/types.ts';
export { GREETINGS, NAMES, TIPS } from './lore/voices.ts';

/** Every topic, the Guide's first and then each role's, each role's in the order a new traveller wants them. */
export const TOPICS: readonly LoreTopic[] = [...BASICS, ...VEHICLES, ...FLYING, ...WORLD, ...WORK, ...RECORDS, ...MAPS];

/** A topic by its id. */
export const topicOf = (id: string): LoreTopic | undefined => TOPICS.find((topic) => topic.id === id);

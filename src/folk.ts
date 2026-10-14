/**
 * The people of the world, dressed and set moving: the cast (`cast.ts`) worn
 * the way each region dresses, standing in its towns and walking its verges.
 *
 * Who someone is comes from `scenery/dress.ts`: a `Look` names a skin, a hair
 * colour, a top, a bottom, shoes and one bright thing, and every surface of
 * every outfit has a role (`roleOf` in `cast.ts`) that the look's colours go
 * onto. `createFolk` (`folk/dressing.ts`) is that dressing.
 *
 * Standing people are skinned meshes playing a relaxed idle and now and then
 * a gesture. That costs a draw call each, so they are streamed: only the
 * nearest `TOWNSFOLK_CAP`, only inside `TOWNSFOLK_RADIUS`.
 *
 * The town publishes, with each spot, the stretch of its own street a person
 * there may walk (`Ground.folk` in `settlements.ts`). Most who have one
 * stroll it end to end and back, easing off and pausing at each end, on the
 * hero's own stride (`WALK_STRIDE`); some stand in pairs turned to each other,
 * talking by turns; the rest stand in one of three idles and glance at the
 * player as he passes. Everything that decides who does which is seeded by the
 * person's key. They are solid (`collide`, a body `PERSON_RADIUS` wide), and
 * one at a time can be held in conversation (`engage`), which stops them,
 * turns them to face the player, and has them wave and then talk; `talk.ts`
 * says the words.
 */
import { createState } from './folk/standing.ts';
import type { FolkSource, Talker, Townsfolk } from './folk/standing.ts';
import type { Folk } from './folk/dressing.ts';
import { update } from './folk/frame.ts';
import { collide, crownOf, engage, nearest } from './folk/queries.ts';

export { createFolk, isWoman, isYoung } from './folk/dressing.ts';
export type { Folk, SeatPose } from './folk/dressing.ts';
export { PERSON_RADIUS } from './folk/standing.ts';
export type { FolkAnchor, FolkSource, Talker, Townsfolk } from './folk/standing.ts';

/** Streams the standing people round the viewer from the settlements' anchors. */
export function createTownsfolk(folk: Folk, source: FolkSource): Townsfolk {
  const st = createState(folk, source);
  return {
    group: st.group,
    stats: st.stats,
    update: (viewer, dt, clock, frame) => update(st, viewer, dt, clock, frame),
    collide: (point, radius, push) => collide(st, point, radius, push),
    nearest: (point, reach): Talker | null => nearest(st, point, reach),
    engage: (key, towards) => engage(st, key, towards),
    crownOf: (key, out) => crownOf(st, key, out),
  };
}

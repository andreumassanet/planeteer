/**
 * The body every seat in `src/craft/` is built round: the hero's own, seated and
 * standing, as a box about the hip.
 *
 * **Measured off the cast, not derived from `FIGURE` or `SEATED`.** Both of
 * those describe the code-built body of the 6.8-unit era, multiplied down by
 * `BODY_SCALE`, and the body that actually sits in these seats is the CC0
 * hero at about seven heads, folded by `avatar.ts`'s `sit` (`SEAT_THIGH`,
 * `SEAT_SHIN`) with its hips put on `FIGURE.hipY`. Measured in Node on
 * 2026-09-24 with the skeleton updated before the box was read — a skinned
 * body's precise box is read through its bone matrices, which only a render
 * or `skeleton.update()` refreshes — and again the same day, once the hero
 * wore the pack's own rucksack and the cast was scaled sole to crown in its
 * bind pose (`BODY_HEIGHT` in `cast.ts`), which made him 2% smaller and the
 * rucksack 0.07 shallower; the knee's two rows are the first measurement's:
 *
 * ```
 *                     seated, about the hip     standing, about the soles
 *   crown             +1.96  (0.520 H)          3.75   (0.995 H)
 *   sole              -1.05  (0.279 H)             0
 *   toe, ahead        +1.37  (0.363 H)          +0.58  (0.154 H, the pack's
 *   knee, ahead       +0.98  (0.260 H)                  depth either way)
 *   knee, above       +0.25  (0.066 H)
 *   back, behind      -0.64  (0.170 H, the pack)
 *   half-width         0.55  (0.146 H)           0.55  (0.146 H)
 * ```
 *
 * The crowd's `SEATED` would put the sole 0.97 under the hip, the toe 1.09
 * ahead and the back 0.40 behind: every one of them short of the hero, and the
 * back by the whole rucksack. **A seat built to it puts the pack through the
 * backrest.** Written as shares of `AVATAR_HEIGHT` so that the day a person is
 * resized every seat in every craft moves with him; `pnpm craft` re-measures
 * the cast when it can load it and fails on a drift, which is the only way a
 * measured table stays true.
 *
 * **Where a body goes on a seat.** A `Seat` is a hip point, for both poses,
 * so the rule is one line: the avatar's group goes at the seat less
 * `AVATAR_HIP` in y. Seated, `sit` puts the cast's own hips at `FIGURE.hipY`
 * over the group's origin, so the hip lands on the seat surface; standing, the
 * soles are at the group's origin, so they land on the floor `AVATAR_HIP`
 * under the seat point. `bodyFrame` below is that rule, and the sheet uses it.
 */
import { AVATAR_HEIGHT } from '../stature.ts';
import { FIGURE } from '../avatar.ts';
import type { Seat } from './contract.ts';

const H = AVATAR_HEIGHT;

/** The hero seated, about the hip, and standing, about the soles. See above. */
export const HERO = {
  crown: 0.52 * H,
  sole: 0.279 * H,
  toe: 0.363 * H,
  knee: 0.26 * H,
  kneeTop: 0.066 * H,
  back: 0.17 * H,
  half: 0.146 * H,
  standing: 0.995 * H,
  depth: 0.154 * H,
} as const;

/**
 * The height of the hip above the body's own origin, which is what a seat's y
 * is measured against. Re-exported so nothing in `src/craft/` restates it.
 */
export const AVATAR_HIP = FIGURE.hipY;

/**
 * How far apart two bodies side by side are put, hip to hip: two half-widths
 * and a gap between the elbows. The gap is a fifth of the half-width; closer
 * and two ink outlines meet and read as one wide person.
 */
export const ABREAST = 2 * HERO.half * 1.2;

/** Where the avatar's group goes for a seat, in the model's frame. */
export function bodyFrame(seat: Seat): { x: number; y: number; z: number; yaw: number } {
  return { x: seat.x, y: seat.y - AVATAR_HIP, z: seat.z, yaw: seat.yaw };
}

/**
 * The boxes a body on this seat fills, in the model's frame, for the checks:
 * a seated body is a trunk (hip to crown, pack to chest), a lap (hip to knee),
 * shins under the knee and feet on to the toe; a standing one is a single column. A seat facing anywhere but
 * +Z is rotated by its yaw's quarter turns, which is all any craft here uses.
 */
export interface Envelope {
  min: [number, number, number];
  max: [number, number, number];
  name: string;
}

export function envelopeOf(seat: Seat): Envelope[] {
  const local: Envelope[] =
    seat.pose === 'sit'
      ? [
          // The trunk, stopped short of the hip so the seat pan it rests on is
          // not counted as inside it.
          { name: 'trunk', min: [-HERO.half, 0.02 * H, -HERO.back], max: [HERO.half, HERO.crown, 0.1 * H] },
          // The lap, stopped short of the seat surface and ahead of the hip.
          { name: 'lap', min: [-HERO.half * 0.8, 0.02 * H, 0.12 * H], max: [HERO.half * 0.8, HERO.kneeTop, HERO.knee] },
          // The shins hang almost straight down from the knee, so they are a
          // column under it; only the feet reach on to the toe.
          { name: 'shins', min: [-HERO.half * 0.8, -HERO.sole + 0.12 * H, HERO.knee - 0.06 * H], max: [HERO.half * 0.8, 0, HERO.knee + 0.01 * H] },
          { name: 'feet', min: [-HERO.half * 0.8, -HERO.sole + 0.02 * H, HERO.knee - 0.06 * H], max: [HERO.half * 0.8, -HERO.sole + 0.12 * H, HERO.toe] },
        ]
      : [
          {
            name: 'body',
            min: [-HERO.half, -AVATAR_HIP + 0.02 * H, -HERO.depth],
            max: [HERO.half, HERO.standing - AVATAR_HIP, HERO.depth],
          },
        ];
  const turns = Math.round(seat.yaw / (Math.PI / 2)) & 3;
  return local.map((box) => {
    let [x0, y0, z0] = box.min;
    let [x1, y1, z1] = box.max;
    for (let i = 0; i < turns; i++) {
      // A quarter turn about +Y: (x, z) -> (z, -x).
      [x0, z0, x1, z1] = [Math.min(z0, z1), Math.min(-x0, -x1), Math.max(z0, z1), Math.max(-x0, -x1)];
    }
    return {
      name: box.name,
      min: [seat.x + x0, seat.y + y0, seat.z + z0],
      max: [seat.x + x1, seat.y + y1, seat.z + z1],
    };
  });
}

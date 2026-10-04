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
  /**
   * Astride: how far a hand and a foot reach, which only bounds where a grip
   * and a footrest may be put (`review.ts`) and is not measured off the cast
   * the way the rows above are — the shoulders over the hip, an arm from
   * them, and a leg from the hip to the sole, each a little short of the
   * cast's own so a pose that meets them is not locked straight.
   */
  shoulder: 0.33 * H,
  arm: 0.4 * H,
  legs: 0.46 * H,
  /**
   * Seated at the wheel of a car (`Seat.legs` of `drive`, `DRIVE_THIGH` in
   * `avatar.ts`), about the hip, measured off the cast on 2026-10-04 as the
   * rows above were: the soles 0.13 of a body under the hip where a chair's
   * are 0.28, the toes 0.56 ahead, the knee joint 0.22 ahead and 0.065 up,
   * the ankle 0.44 ahead and 0.105 down; the knee's top is the joint and a
   * leg's half-thickness over it.
   */
  drive: {
    sole: 0.129 * H,
    toe: 0.557 * H,
    knee: 0.223 * H,
    kneeY: 0.065 * H,
    kneeTop: 0.115 * H,
    ankle: 0.436 * H,
    ankleY: -0.105 * H,
  },
  /**
   * The arms, as a wheel is reached with them (`holdWheel` in `cast.ts`):
   * the left shoulder joint about the hip, seated, and the cast's own length
   * from it to the wrist. Short for the body's height — 0.22 of it, where
   * life gives 0.33 — so a wheel is held near the chest. Measured off the
   * cast on 2026-10-04.
   */
  reachFrom: [0.083 * H, 0.288 * H, 0.003 * H],
  reach: 0.221 * H,
} as const;

/**
 * The eye in a seat, over the hip, in the seat's frame: seated, half a head
 * under the crown (a seven-head body's eyes) and a little ahead, the face
 * being ahead of the spine; astride, about as far: the rider leans into the
 * bars, but an eye further ahead put the bars and the hands under it, out of
 * the view (it was 0.12 of a body until 2026-10-04). What first person in a seat looks from (`Player.seatEye`), and what
 * every cabin's roof and wheel are held clear of (`pnpm craft`).
 */
export const SEAT_EYE = {
  up: HERO.crown - H / 14,
  /**
   * In a car (`Seat.legs` of `drive`), the eye a little lower, at the
   * middle of the head rather than its eyes. The pack's cars are toys: a
   * deep roof over a windscreen that is a band, its header no higher than a
   * seated body's eyes, so from the anatomical eye the roof's lining was the
   * top half of the view and the road a strip under it. A twentieth of a
   * body lower puts the header near the top of the frame; the head is not
   * drawn in first person, so nothing shows the eye is not quite in it.
   */
  inCar: HERO.crown - H / 14 - 0.055 * H,
  ahead: 0.05 * H,
  rideAhead: 0.05 * H,
} as const;

/**
 * The near plane first person in a seat is drawn with, in units: under the
 * roof's lining over a seated eye (a third of a unit in the hatchback) and
 * the wheel's rim before it, so neither is cut open. `main.ts` sets it, and
 * `pnpm craft` holds every cabin's roof and wheel further from the eye.
 */
export const COCKPIT_NEAR = 0.15;

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
 * shins under the knee and feet on to the toe; a standing one is a single
 * column; a body astride is its trunk alone. A seat facing anywhere but
 * +Z is rotated by its yaw's quarter turns, which is all any craft here uses.
 */
export interface Envelope {
  min: [number, number, number];
  max: [number, number, number];
  name: string;
}

export function envelopeOf(seat: Seat): Envelope[] {
  const local: Envelope[] =
    seat.pose === 'ride'
      ? [
          // Astride, the legs go down either side of whatever is ridden — a
          // frame, a tank, a horse's barrel — which is the point of the pose,
          // so only the trunk is held clear: from a tenth of a body over the
          // saddle, where the thighs have parted, to the crown.
          { name: 'trunk', min: [-HERO.half, 0.1 * H, -HERO.back], max: [HERO.half, HERO.crown, 0.1 * H] },
        ]
      : seat.pose === 'sit' && seat.legs === 'drive'
      ? [
          // At the wheel: the same trunk; the lap rising a little to the
          // knee; the shins sloping forward and down from it to the ankle,
          // held as the box between the two less a leg's half-thickness at
          // each end; and the feet on to the toe, low over the floor.
          { name: 'trunk', min: [-HERO.half, 0.02 * H, -HERO.back], max: [HERO.half, HERO.crown, 0.1 * H] },
          { name: 'lap', min: [-HERO.half * 0.8, 0.02 * H, 0.12 * H], max: [HERO.half * 0.8, HERO.drive.kneeTop, HERO.drive.knee] },
          // The shin in two boxes, its upper half and its lower, so a box
          // round the whole slope does not take in the dashboard over its
          // lower end: each a leg's half-thickness about the line from the
          // knee to the ankle over its half.
          {
            name: 'shins',
            min: [-HERO.half * 0.8, (HERO.drive.kneeY + HERO.drive.ankleY) / 2 - 0.04 * H, HERO.drive.knee + 0.03 * H],
            max: [HERO.half * 0.8, HERO.drive.kneeY + 0.01 * H, (HERO.drive.knee + HERO.drive.ankle) / 2],
          },
          {
            name: 'lower shins',
            min: [-HERO.half * 0.8, HERO.drive.ankleY + 0.01 * H, (HERO.drive.knee + HERO.drive.ankle) / 2],
            max: [HERO.half * 0.8, (HERO.drive.kneeY + HERO.drive.ankleY) / 2 + 0.04 * H, HERO.drive.ankle - 0.03 * H],
          },
          { name: 'feet', min: [-HERO.half * 0.8, -HERO.drive.sole + 0.02 * H, HERO.drive.ankle - 0.04 * H], max: [HERO.half * 0.8, HERO.drive.ankleY + 0.04 * H, HERO.drive.toe] },
        ]
      : seat.pose === 'sit'
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

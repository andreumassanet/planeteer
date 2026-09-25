/**
 * The jet ski: a hull a little longer than a body, a saddle along its back, a
 * steering pod ahead of it, and two people astride.
 *
 * **Built from the rider out.** A jet ski is ridden like a motorbike on the
 * water — astride a long saddle, the feet in a well either side of it, the
 * hands on bars at the top of a pod — so the saddle's top is the hip, the
 * wells' floor is where the soles rest, and the bars are where an arm reaches.
 * Everything else is hull: a vee under the water that rises into the bow, the
 * deck the wells are cut into, a rubbing strake in a second colour, the pod,
 * and the nozzle astern where the jet comes out, which is what the wake and
 * the rooster tail of spray leave from (`effects.ts`).
 *
 * **Waterline at y = 0**, the keel `draft` under it; one metre is the body's
 * own, `AVATAR_HEIGHT / 1.75`.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import type { CraftModel, Seat } from './contract.ts';
import { PROUD, assemble, craftContext, finish, loft, octagon, soupOf } from './build.ts';
import type { Station } from './build.ts';

const H = AVATAR_HEIGHT;
const M = H / 1.75;
const V = THREE.Vector3;

/** The hull's half-beam, the keel under the waterline, the deck and the wells' floor over it. */
const HALF = 0.56 * M;
const KEEL = -0.2 * M;
const DECK = 0.3 * M;
const WELL = 0.24 * M;
/** The saddle's top, which is the rider's hip, and where the two hips are along it. */
const HIP = 0.66 * M;
const FRONT = 0.05 * M;
const BACK = -0.62 * M;
/** The bars. */
const BARS = { y: 1.02 * M, z: 0.62 * M };
const STERN = -1.5 * M;
const BOW = 1.55 * M;

/**
 * A section of the hull at `z`: the keel, the chine, the gunwale at the deck,
 * and a rounded shoulder into it — seven points, the same seven at every
 * station, so the loft closes into the bow.
 */
function section(z: number, half: number, keel: number, deck: number): Station {
  return {
    z,
    ring: [
      [0, keel],
      [half * 0.72, keel * 0.35],
      [half, deck * 0.45],
      [half * 0.86, deck],
      [-half * 0.86, deck],
      [-half, deck * 0.45],
      [-half * 0.72, keel * 0.35],
    ],
  };
}

/** Hull colour, then the strake and the saddle's trim. */
const PAINTS: readonly [number, number][] = [
  [PALETTE.white, PALETTE.skyBlue],
  [PALETTE.gold, PALETTE.ink],
  [PALETTE.red, PALETTE.white],
  [PALETTE.skyBlue, PALETTE.white],
  [PALETTE.green, PALETTE.ink],
  [PALETTE.ink, PALETTE.orange],
];

function buildJetSki(variant: number): THREE.Group {
  const ctx = craftContext();
  const { box, strut, column, tone } = ctx;
  const [hull, trim] = PAINTS[((variant % PAINTS.length) + PAINTS.length) % PAINTS.length]!;
  const group = new THREE.Group();

  group.add(
    loft(
      [
        section(STERN, HALF * 0.9, KEEL * 0.8, DECK),
        section(-0.9 * M, HALF, KEEL, DECK),
        section(0.3 * M, HALF, KEEL, DECK + 0.04 * M),
        section(0.9 * M, HALF * 0.82, KEEL * 0.7, DECK + 0.14 * M),
        section(1.3 * M, HALF * 0.46, KEEL * 0.15, DECK + 0.22 * M),
        section(BOW, HALF * 0.08, 0.1 * M, DECK + 0.26 * M),
      ],
      hull,
    ),
  );
  // A strake a side, proud of the skin at the widest.
  for (const side of [-1, 1]) {
    const strake = box(PROUD * 1.5, 0.05 * M, 1.9 * M, trim);
    strake.position.set(side * (HALF + PROUD * 0.4), DECK * 0.3, -0.4 * M);
    group.add(strake);
  }
  // The wells' floor either side of the saddle, a mat proud of the deck's line.
  for (const side of [-1, 1]) {
    const mat = box(0.3 * M, PROUD, 1.3 * M, tone(PALETTE.steel, 1.2));
    mat.position.set(side * 0.32 * M, WELL, -0.35 * M);
    group.add(mat);
  }
  // The saddle, whose top is both hips, over a plinth off the deck.
  const plinth = loft(
    [
      { z: STERN + 0.2 * M, ring: octagon(0.2 * M, DECK - 0.02 * M, HIP - 0.08 * M, 0.4) },
      { z: FRONT + 0.25 * M, ring: octagon(0.22 * M, DECK - 0.02 * M, HIP - 0.06 * M, 0.4) },
    ],
    hull,
  );
  group.add(plinth);
  const saddle = loft(
    [
      { z: BACK - 0.45 * M, ring: octagon(0.2 * M, HIP - 0.1 * M, HIP - 0.02 * M, 0.5) },
      { z: BACK, ring: octagon(0.21 * M, HIP - 0.1 * M, HIP, 0.5) },
      { z: FRONT, ring: octagon(0.21 * M, HIP - 0.1 * M, HIP, 0.5) },
      { z: FRONT + 0.2 * M, ring: octagon(0.19 * M, HIP - 0.1 * M, HIP + 0.04 * M, 0.5) },
    ],
    trim === PALETTE.white ? PALETTE.ink : trim,
  );
  group.add(saddle);
  // The pod, raked forward off the deck up to the bars.
  const pod = loft(
    [
      { z: 0.35 * M, ring: octagon(0.3 * M, DECK, 0.62 * M, 0.45) },
      { z: 0.62 * M, ring: octagon(0.26 * M, DECK + 0.04 * M, 0.9 * M, 0.45) },
      { z: 0.95 * M, ring: octagon(0.2 * M, DECK + 0.1 * M, 0.66 * M, 0.45) },
    ],
    hull,
  );
  group.add(pod);
  // The screen over the pod, and the bars on a riser.
  const screen = box(0.36 * M, 0.14 * M, PROUD, tone(PALETTE.slate, 0.72));
  screen.position.set(0, 0.86 * M, 0.78 * M);
  screen.rotation.x = -0.6;
  group.add(screen);
  const riser = new V(0, BARS.y - 0.04 * M, BARS.z + 0.02 * M);
  group.add(strut(new V(0, 0.88 * M, 0.6 * M), riser, 0.06 * M, PALETTE.steel));
  const barHalf = 0.34 * M;
  for (const side of [-1, 1]) {
    group.add(strut(riser, new V(side * barHalf, BARS.y, BARS.z), 0.04 * M, PALETTE.steel));
    group.add(strut(new V(side * barHalf, BARS.y, BARS.z), new V(side * (barHalf + 0.1 * M), BARS.y, BARS.z - 0.02 * M), 0.055 * M, PALETTE.ink));
  }
  // The nozzle, out of the transom at the waterline.
  const nozzle = column(0.08 * M, 0.16 * M, PALETTE.steel, 8);
  nozzle.rotation.x = -Math.PI / 2;
  nozzle.position.set(0, 0.02 * M, STERN + 0.04 * M);
  group.add(nozzle);
  // A grab handle behind the saddle.
  group.add(strut(new V(-0.14 * M, HIP - 0.06 * M, BACK - 0.5 * M), new V(0.14 * M, HIP - 0.06 * M, BACK - 0.5 * M), 0.04 * M, PALETTE.steel));

  return assemble('jet-ski', [soupOf(group)]);
}

const SEATS: readonly Seat[] = [
  {
    x: 0,
    y: HIP,
    z: FRONT,
    yaw: 0,
    pose: 'ride',
    shown: true,
    grip: [0, BARS.y - HIP, BARS.z - FRONT],
    feet: [0.3 * M, WELL + PROUD - HIP, 0.12 * M],
  },
  {
    x: 0,
    y: HIP,
    z: BACK,
    yaw: 0,
    pose: 'ride',
    shown: true,
    // Hands at the rider's waist, feet in the wells behind his.
    grip: [0, 0.14 * H, 0.2 * H],
    feet: [0.3 * M, WELL + PROUD - HIP, 0.08 * M],
  },
];

export function jetSkiModel(): CraftModel {
  return finish({
    id: 'jet-ski',
    kind: 'jetski',
    medium: 'water',
    seats: SEATS,
    draft: -KEEL,
    variants: PAINTS.length,
    build: buildJetSki,
  });
}

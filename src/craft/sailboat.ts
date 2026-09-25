/**
 * The sailboat: a day-sailer for two, a mainsail and a jib on one mast.
 *
 * **The launch's recipe with a different boat on it** (`launch.ts`): a hull
 * lofted from the seats outwards with the cockpit cut into the same loft, so
 * the gunwales, the bulkheads and the transom are one piece and one ink line;
 * seats a sole-to-hip over the cockpit floor; a sheer waist-deep on a seated
 * body. What makes it a sailboat is over it: a mast a little ahead of the
 * cockpit, a boom a head clear of the seated crew, and two sails, each a thin
 * slab so the pen draws round it, the main from the boom to the masthead and
 * the jib from the stem to two thirds up the mast. A fin keel under the hull
 * is what it stands on in the check and what `draft` is.
 *
 * The two sit in line on the centreline — the helm aft at the tiller and the
 * crew forward — because a day-sailer is narrower than a runabout and two
 * abreast would put an elbow through a gunwale.
 *
 * **Waterline at y = 0**, the keel's fin `draft` under it.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import type { CraftModel, Seat } from './contract.ts';
import { HERO } from './body.ts';
import { PROUD, assemble, craftContext, finish, loft, soupOf, well } from './build.ts';
import type { Station, WellSection } from './build.ts';

const H = AVATAR_HEIGHT;
const M = H / 1.75;
const V = THREE.Vector3;

const SOLE = 0.06 * H;
const HIP = SOLE + HERO.sole;
const SHEER = HIP + 0.1 * H;
const WALL = 0.04 * H;
/** One body's width, an elbow's room either side, and the wall. */
const HALF = HERO.half + 0.14 * H + WALL;
/** The two hips, the helm aft. */
const CREW = 0.1 * H;
const HELM = CREW - (HERO.back + 0.04 * H + HERO.knee + 0.04 * H);
const WELL_AFT = HELM - HERO.back - 0.1 * H;
const WELL_FORE = CREW + HERO.toe + 0.04 * H;
const TRANSOM = WELL_AFT - 0.1 * H;
const STEM = WELL_FORE + 1.3 * H;
const KEEL = -0.12 * H;
/** The fin under the hull, and its depth under the waterline. */
const FIN = -0.5 * M;
/** The mast's foot, just ahead of the cockpit, and its head; the boom a head clear of the crew. */
const MAST_Z = WELL_FORE + 0.25 * H;
const MAST_TOP = 6.2 * M;
const BOOM = HIP + HERO.crown + 0.12 * H;
const BOOM_END = TRANSOM + 0.1 * H;

const HULL: readonly (Omit<WellSection, 'floor' | 'wall'> & { z: number })[] = [
  { z: TRANSOM, keel: KEEL * 0.6, chineHalf: HALF * 0.7, chineY: 0, sheerHalf: HALF * 0.85, sheerY: SHEER - 0.02 * H, decked: true },
  { z: WELL_AFT, keel: KEEL * 0.75, chineHalf: HALF * 0.74, chineY: -0.01 * H, sheerHalf: HALF * 0.92, sheerY: SHEER - 0.015 * H },
  { z: (WELL_AFT + CREW) / 2, keel: KEEL, chineHalf: HALF * 0.78, chineY: -0.02 * H, sheerHalf: HALF, sheerY: SHEER },
  { z: WELL_FORE - 0.02 * H, keel: KEEL, chineHalf: HALF * 0.72, chineY: -0.01 * H, sheerHalf: HALF * 0.98, sheerY: SHEER + 0.02 * H },
  { z: WELL_FORE, keel: KEEL * 0.95, chineHalf: HALF * 0.71, chineY: -0.01 * H, sheerHalf: HALF * 0.97, sheerY: SHEER + 0.025 * H, decked: true },
  { z: WELL_FORE + 0.5 * H, keel: KEEL * 0.7, chineHalf: HALF * 0.5, chineY: 0.04 * H, sheerHalf: HALF * 0.78, sheerY: SHEER + 0.08 * H, decked: true },
  { z: WELL_FORE + 0.95 * H, keel: 0.02 * H, chineHalf: HALF * 0.2, chineY: 0.12 * H, sheerHalf: HALF * 0.42, sheerY: SHEER + 0.13 * H, decked: true },
  { z: STEM, keel: 0.22 * H, chineHalf: HALF * 0.02, chineY: 0.25 * H, sheerHalf: HALF * 0.04, sheerY: SHEER + 0.16 * H, decked: true },
];

const sheerAt = (z: number): number => {
  for (let i = 0; i + 1 < HULL.length; i++) {
    const a = HULL[i]!;
    const b = HULL[i + 1]!;
    if (z <= b.z) return a.sheerY + (b.sheerY - a.sheerY) * THREE.MathUtils.clamp((z - a.z) / (b.z - a.z), 0, 1);
  }
  return HULL[HULL.length - 1]!.sheerY;
};

/**
 * A sail: a flat polygon given in (z, y), extruded `thick` across X and
 * centred on x = 0, so it has two faces and an edge the pen can draw round.
 */
function sail(points: readonly (readonly [number, number])[], thick: number, colour: number): THREE.Mesh {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, steps: 1 });
  // The shape's x is the boat's z: a quarter turn about Y takes x to -z, so
  // it is turned the other way, and the extrusion lands across X.
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(thick / 2, 0, 0);
  const faceted = geometry.index !== null ? geometry.toNonIndexed() : geometry;
  if (faceted !== geometry) geometry.dispose();
  faceted.computeVertexNormals();
  return new THREE.Mesh(faceted, craftContext().toon(colour));
}

/** Hull, then the sails' colour and the boot stripe's. */
const PAINTS: readonly [number, number, number][] = [
  [PALETTE.white, PALETTE.cream, PALETTE.skyBlue],
  [PALETTE.skyBlue, PALETTE.white, PALETTE.white],
  [PALETTE.crimson, PALETTE.cream, PALETTE.white],
  [PALETTE.green, PALETTE.white, PALETTE.cream],
  [PALETTE.white, PALETTE.apricot, PALETTE.red],
  [PALETTE.ink, PALETTE.white, PALETTE.gold],
];

function buildSailboat(variant: number): THREE.Group {
  const ctx = craftContext();
  const { box, strut, column, tone } = ctx;
  const [hull, canvas, stripe] = PAINTS[((variant % PAINTS.length) + PAINTS.length) % PAINTS.length]!;
  const group = new THREE.Group();

  const stations: Station[] = HULL.map((s) => ({ z: s.z, ring: well({ ...s, floor: SOLE, wall: WALL }) }));
  group.add(loft(stations, hull));
  // The fin and a bulb on its foot.
  const fin = box(0.08 * M, KEEL * 0.9 - FIN, 0.9 * M, tone(PALETTE.steel, 0.9));
  fin.position.set(0, FIN, (HELM + CREW) / 2);
  group.add(fin);
  const bulb = box(0.2 * M, 0.14 * M, 1.1 * M, PALETTE.steel);
  bulb.position.set(0, FIN, (HELM + CREW) / 2);
  group.add(bulb);
  // The rudder astern, and the tiller from a yoke on its head forward along
  // the helm's side, clear of his elbow, to his hand.
  const rudder = box(0.06 * M, SHEER - FIN * 0.6, 0.4 * M, tone(PALETTE.steel, 0.9));
  rudder.position.set(0, FIN * 0.6, TRANSOM - 0.2 * M);
  group.add(rudder);
  const side = HERO.half + 0.1 * H;
  group.add(strut(new V(0, SHEER + 0.02 * H, TRANSOM - 0.08 * M), new V(side, SHEER + 0.03 * H, TRANSOM + 0.02 * M), 0.03 * H, PALETTE.brown));
  group.add(strut(new V(side, SHEER + 0.03 * H, TRANSOM + 0.02 * M), new V(side, HIP + 0.12 * H, HELM + 0.3 * H), 0.03 * H, PALETTE.brown));
  // The sole, and a thwart under each hip.
  const sole = box(HALF * 1.1, PROUD, WELL_FORE - WELL_AFT - 0.04 * H, PALETTE.brown);
  sole.position.set(0, SOLE, (WELL_AFT + WELL_FORE) / 2);
  group.add(sole);
  for (const z of [HELM, CREW]) {
    const thwart = box(HALF * 1.5, HIP - SOLE, 0.18 * H, tone(PALETTE.cream, 0.85));
    thwart.position.set(0, SOLE, z - 0.04 * H);
    group.add(thwart);
  }
  // A boot stripe under the sheer, each side.
  for (const side of [-1, 1]) {
    const run: Station[] = [];
    for (const s of HULL.slice(0, -1)) {
      const y = sheerAt(s.z);
      const x = side * (s.sheerHalf + PROUD * 0.5);
      run.push({ z: s.z, ring: [[x - PROUD, y - 0.07 * H], [x + PROUD, y - 0.07 * H], [x + PROUD, y - 0.03 * H], [x - PROUD, y - 0.03 * H]] });
    }
    group.add(loft(run, stripe));
  }

  // The mast, the boom and the forestay.
  const deck = sheerAt(MAST_Z);
  const mast = column(0.05 * M, MAST_TOP - deck, PALETTE.bone, 8);
  mast.position.set(0, deck, MAST_Z);
  group.add(mast);
  group.add(strut(new V(0, BOOM, MAST_Z - 0.04 * M), new V(0, BOOM + 0.02 * M, BOOM_END), 0.06 * M, PALETTE.bone));
  group.add(strut(new V(0, MAST_TOP * 0.72, MAST_Z + 0.03 * M), new V(0, sheerAt(STEM - 0.1 * M), STEM - 0.1 * M), 0.02 * M, PALETTE.steel));
  // The main, from the boom to the masthead with a little roach, and the jib.
  const thick = 0.025 * M;
  group.add(
    sail(
      [
        [MAST_Z - 0.08 * M, BOOM + 0.06 * M],
        [BOOM_END + 0.05 * M, BOOM + 0.08 * M],
        [MAST_Z - 0.9 * M, MAST_TOP * 0.55],
        [MAST_Z - 0.12 * M, MAST_TOP - 0.1 * M],
      ],
      thick,
      canvas,
    ),
  );
  const jibFoot = sheerAt(STEM - 0.5 * M) + 0.12 * M;
  const jib = sail(
    [
      [STEM - 0.35 * M, jibFoot],
      [MAST_Z + 0.2 * M, jibFoot + 0.25 * M],
      [MAST_Z + 0.12 * M, MAST_TOP * 0.7],
    ],
    thick,
    canvas,
  );
  // Sheeted a little to one side, where the wind has it.
  jib.rotation.y = 0.12;
  group.add(jib);

  return assemble('sailboat', [soupOf(group)]);
}

const SEATS: readonly Seat[] = [
  { x: 0, y: HIP, z: HELM, yaw: 0, pose: 'sit', shown: true },
  { x: 0, y: HIP, z: CREW, yaw: 0, pose: 'sit', shown: true },
];

export function sailboatModel(): CraftModel {
  return finish({
    id: 'sailboat',
    kind: 'sailboat',
    medium: 'water',
    seats: SEATS,
    draft: -FIN,
    variants: PAINTS.length,
    build: buildSailboat,
  });
}

/**
 * The airliner and the airship: the two things in the sky nobody can take.
 *
 * Both fly overhead on `air-traffic.ts`'s timetable and are never boarded, so
 * neither is a `CraftModel` — there is no seat to size them round, and no
 * `CraftKind` to handle them. They are built the way every craft is (the
 * monument context's pieces, lofted shells, one merged buffer and one turning
 * part a propeller) and handed back as a plain group facing +Z with +Y up,
 * centred on the middle of the fuselage or the envelope.
 *
 * **The scale is the traffic's, not the body's.** A vehicle in this world is
 * `SCENERY_SCALE` times `PLACED_SECTION` a metre (1.71 units), and so are
 * these: a narrow-body 38 m long is 65 units from nose to tail cone, and a
 * 58 m airship is 99. Up at the airliner's cruise (`air-traffic.ts`) that is
 * two or three degrees of the lens straight overhead, which is what a real one
 * is at ten kilometres; the light plane, built round four seated heroes, is a
 * toy against it, as it is against a real one.
 *
 * **Opaque and inked**, like every other craft: the windows are a band of
 * slate toned down, never black, and every trim laid on the skin stands
 * `PROUD` of it.
 */
import * as THREE from 'three';
import { SCENERY_SCALE } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import { PLACED_SECTION } from '../traffic/contract.ts';
import { PROUD, assemble, craftContext, lathe, loft, octagon, soupOf } from './build.ts';
import type { Station } from './build.ts';

/** One metre of a vehicle, in world units. */
const M = SCENERY_SCALE * PLACED_SECTION;
const V = THREE.Vector3;

/** The fuselage: its length, its radius, and where its nose and tail cone are. */
const HALF_LENGTH = 19 * M;
const BODY = 2 * M;

/** Tail and trim colours: six liveries on one white fuselage. */
const LIVERIES: readonly [number, number][] = [
  [PALETTE.red, PALETTE.gold],
  [PALETTE.skyBlue, PALETTE.slate],
  [PALETTE.crimson, PALETTE.red],
  [PALETTE.gold, PALETTE.orange],
  [PALETTE.violet, PALETTE.skyBlue],
  [PALETTE.green, PALETTE.gold],
];

export const AIRLINER_LIVERIES = LIVERIES.length;

/** Where the engines are across the span, from the centre line: the contrails leave from here. */
export const AIRLINER_ENGINE_X = 5.7 * M;
/** And under the fuselage's middle, in units. */
export const AIRLINER_ENGINE_Y = -1.9 * M;
/** From nose to tail cone, in units. */
export const AIRLINER_LENGTH = HALF_LENGTH * 2;

/** A fuselage section: an octagon round the centre line at `y`, radius `r`. */
const round = (z: number, r: number, y = 0, chamfer = 0.42): Station => ({ z, ring: octagon(r, y - r, y + r, chamfer) });

/**
 * A swept panel — a wing, a tailplane, the fin — lofted along its own +Z from
 * root to tip and turned onto the span afterwards, as the light plane's wing
 * is (`wingPanel` there): `side` +1 lays it along +X, which facing +Z is the
 * left. `sweep` is how far aft the tip's leading edge sits behind the root's,
 * `rise` how far up it is.
 */
function sweptPanel(side: 1 | -1, root: number, tip: number, thick: number, span: number, sweep: number, rise: number, colour: number): THREE.Mesh {
  const section = (c: number, t: number, aft: number, y: number): [number, number][] => {
    const lead = -aft;
    const trail = lead - c;
    const pts: [number, number][] = [
      [trail, y + t * 0.1],
      [trail + c * 0.25, y - t * 0.3],
      [lead - c * 0.1, y - t * 0.45],
      [lead, y],
      [lead - c * 0.12, y + t * 0.5],
      [trail + c * 0.35, y + t * 0.35],
    ];
    return pts.map(([f, h]) => [side > 0 ? -f : f, h] as [number, number]);
  };
  const stations: Station[] = [
    { z: 0, ring: section(root, thick, 0, 0) },
    { z: span, ring: section(tip, thick * 0.4, sweep, rise) },
  ];
  const mesh = loft(stations, colour);
  mesh.rotation.y = side * (Math.PI / 2);
  return mesh;
}

/** The narrow-body airliner, livery `variant`. Facing +Z, centred on the fuselage. */
export function buildAirliner(variant: number): THREE.Group {
  const ctx = craftContext();
  const { box, tone } = ctx;
  const [tail, trim] = LIVERIES[((variant % LIVERIES.length) + LIVERIES.length) % LIVERIES.length]!;
  const skin = PALETTE.white;
  const belly = tone(PALETTE.bone, 1.1);
  const group = new THREE.Group();

  // The fuselage, tail cone swept up and nose drooped, with a belly fairing.
  group.add(
    loft(
      [
        round(-HALF_LENGTH, 0.25 * M, 1.3 * M),
        round(-HALF_LENGTH + 5 * M, 1.3 * M, 0.6 * M),
        round(-HALF_LENGTH + 10 * M, BODY),
        round(HALF_LENGTH - 5 * M, BODY),
        round(HALF_LENGTH - 2.2 * M, 1.6 * M, -0.15 * M),
        round(HALF_LENGTH - 0.6 * M, 0.8 * M, -0.35 * M),
        round(HALF_LENGTH, 0.2 * M, -0.4 * M),
      ],
      skin,
    ),
  );
  group.add(
    loft(
      [
        { z: -4 * M, ring: octagon(1.2 * M, -BODY - 0.35 * M, -BODY + 0.6 * M, 0.5) },
        { z: 5 * M, ring: octagon(1.5 * M, -BODY - 0.45 * M, -BODY + 0.6 * M, 0.5) },
      ],
      belly,
    ),
  );
  // The windows: a band of slate each side, and a cheatline in the trim under it.
  for (const side of [-1, 1]) {
    const windows = box(PROUD, 0.35 * M, HALF_LENGTH * 2 - 17 * M, tone(PALETTE.slate, 0.72));
    windows.position.set(side * (BODY + PROUD * 0.5), 0.45 * M, 1.5 * M);
    const cheat = box(PROUD, 0.3 * M, HALF_LENGTH * 2 - 14 * M, trim);
    cheat.position.set(side * (BODY + PROUD * 0.5), -0.25 * M, 1 * M);
    group.add(windows, cheat);
  }
  // The windscreen, raked on the nose.
  const screen = box(2 * M, 0.5 * M, PROUD, tone(PALETTE.slate, 0.72));
  screen.position.set(0, 0.75 * M, HALF_LENGTH - 2.6 * M);
  screen.rotation.x = -0.9;
  group.add(screen);

  // The wings, swept and with dihedral, low on the fuselage; each carries an
  // engine slung ahead of it on a pylon.
  const wingZ = 2.5 * M;
  const wingY = -1.1 * M;
  for (const side of [1, -1] as const) {
    const wing = sweptPanel(side, 6.5 * M, 1.6 * M, 0.7 * M, 16.5 * M, 7 * M, 1.3 * M, skin);
    wing.position.set(0, wingY, wingZ);
    group.add(wing);
    const winglet = box(0.15 * M, 1.8 * M, 1.1 * M, tail);
    winglet.position.set(side * 16.4 * M, wingY + 1.3 * M, wingZ - 7.4 * M);
    winglet.rotation.x = -0.35;
    group.add(winglet);

    const x = side * AIRLINER_ENGINE_X;
    group.add(
      loft(
        [
          round(wingZ - 1.2 * M, 0.75 * M, AIRLINER_ENGINE_Y + 0.05 * M, 0.45),
          round(wingZ + 1.5 * M, 1.05 * M, AIRLINER_ENGINE_Y, 0.45),
          round(wingZ + 3.4 * M, 1.1 * M, AIRLINER_ENGINE_Y, 0.45),
        ].map((s) => ({ z: s.z, ring: s.ring.map(([u, v]) => [u + x, v] as [number, number]) })),
        tone(PALETTE.bone, 1.2),
      ),
    );
    const intake = box(1.5 * M, 1.5 * M, PROUD, PALETTE.steel);
    intake.position.set(x, AIRLINER_ENGINE_Y - 0.75 * M, wingZ + 3.4 * M + PROUD * 0.5);
    group.add(intake);
    const pylon = box(0.25 * M, 1 * M, 3 * M, skin);
    pylon.position.set(x, AIRLINER_ENGINE_Y + 0.7 * M, wingZ + 0.8 * M);
    group.add(pylon);
  }

  // The tailplanes, and the fin in the livery.
  for (const side of [1, -1] as const) {
    const plane = sweptPanel(side, 3.4 * M, 1.2 * M, 0.35 * M, 6 * M, 3.2 * M, 0.5 * M, skin);
    plane.position.set(0, 0.9 * M, -HALF_LENGTH + 4 * M);
    group.add(plane);
  }
  const fin = sweptPanel(1, 5.5 * M, 2 * M, 0.45 * M, 6.5 * M, 4.5 * M, 0, tail);
  // The panel lofts along +Z and the turn lays it along +X; a further quarter
  // turn about Z stands it up, a rotation throughout.
  const stand = new THREE.Group();
  stand.rotation.z = Math.PI / 2;
  stand.position.set(0, 1.3 * M, -HALF_LENGTH + 5.4 * M);
  stand.add(fin);
  group.add(stand);

  return assemble('airliner', [soupOf(group)]);
}

/** The airship's envelope: its half-length and its greatest radius. */
const ENVELOPE_HALF = 29 * M;
const ENVELOPE_R = 7 * M;

/** Envelope, then fins and gondola: three looks. */
const AIRSHIP_PAINTS: readonly [number, number][] = [
  [PALETTE.white, PALETTE.skyBlue],
  [PALETTE.gold, PALETTE.ink],
  [PALETTE.cream, PALETTE.red],
];

export const AIRSHIP_PAINTS_COUNT = AIRSHIP_PAINTS.length;
/** From nose to tail, in units. */
export const AIRSHIP_LENGTH = ENVELOPE_HALF * 2;

/**
 * The airship, `variant`: a faceted envelope laid along +Z, four fins in a
 * cross at its tail, a gondola under its middle and two propellers on
 * outriggers either side of it. Centred on the envelope.
 */
export function buildAirship(variant: number): THREE.Group {
  const ctx = craftContext();
  const { box, strut, column, tone } = ctx;
  const [envelope, accent] = AIRSHIP_PAINTS[((variant % AIRSHIP_PAINTS.length) + AIRSHIP_PAINTS.length) % AIRSHIP_PAINTS.length]!;
  const group = new THREE.Group();

  // A lathe about +Y from the tail up to the nose, laid over onto +Z by a
  // quarter turn about X: the tail is fuller than a sphere and the nose
  // blunter than the tail, which is the shape an airship is.
  const profile = (
    [
      [0, -1],
      [0.25, -0.93],
      [0.55, -0.72],
      [0.82, -0.45],
      [0.97, -0.15],
      [1, 0.1],
      [0.95, 0.4],
      [0.8, 0.65],
      [0.52, 0.86],
      [0, 1],
    ] as const
  ).map(([r, y]) => [r * ENVELOPE_R, y * ENVELOPE_HALF] as [number, number]);
  const hull = lathe(profile, envelope, 12);
  const lay = new THREE.Group();
  lay.rotation.x = Math.PI / 2;
  lay.add(hull);
  group.add(lay);
  // A band round the middle in the accent, proud of the skin.
  const band = lathe(
    [
      [0, -0.2 * M],
      [ENVELOPE_R * 1.0 + PROUD, -0.2 * M],
      [ENVELOPE_R * 1.0 + PROUD, 1.6 * M],
      [0, 1.6 * M],
    ],
    accent,
    12,
  );
  const bandLay = new THREE.Group();
  bandLay.rotation.x = Math.PI / 2;
  bandLay.position.z = 1.5 * M;
  bandLay.add(band);
  group.add(bandLay);

  // Four fins in a cross at the tail.
  for (let i = 0; i < 4; i++) {
    const holder = new THREE.Group();
    holder.rotation.z = (i * Math.PI) / 2 + Math.PI / 4;
    const fin = box(0.35 * M, 5.5 * M, 7 * M, accent);
    fin.position.set(0, ENVELOPE_R * 0.35, -ENVELOPE_HALF * 0.78);
    holder.add(fin);
    group.add(holder);
  }

  // The gondola under the middle: a cabin with a band of windows.
  const gondolaY = -ENVELOPE_R - 1.4 * M;
  const cabin = box(2.6 * M, 2.2 * M, 10 * M, tone(PALETTE.white, 0.95));
  cabin.position.set(0, gondolaY, 2 * M);
  group.add(cabin);
  const windows = box(2.6 * M + PROUD * 2, 0.7 * M, 8.5 * M, tone(PALETTE.slate, 0.72));
  windows.position.set(0, gondolaY + 1.1 * M, 2.4 * M);
  group.add(windows);

  // Outriggers and their propellers, turning about +Z.
  const turning: { name: 'prop'; at: THREE.Vector3; soup: ReturnType<typeof soupOf> }[] = [];
  for (const side of [-1, 1]) {
    const x = side * 3.6 * M;
    group.add(strut(new V(side * 1.2 * M, gondolaY + 0.8 * M, -1 * M), new V(x, gondolaY + 0.8 * M, -1 * M), 0.25 * M, PALETTE.steel));
    const pod = column(0.55 * M, 2.2 * M, accent, 8);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(x, gondolaY + 0.8 * M, 0.1 * M);
    group.add(pod);
    const prop = new THREE.Group();
    for (const turn of [0, Math.PI]) {
      const arm = new THREE.Group();
      arm.rotation.z = turn;
      const blade = box(0.35 * M, 1.7 * M, 0.12 * M, PALETTE.bark);
      arm.add(blade);
      prop.add(arm);
    }
    turning.push({ name: 'prop', at: new V(x, gondolaY + 0.8 * M, -1.35 * M), soup: soupOf(prop) });
  }
  return assemble('airship', [soupOf(group)], turning);
}

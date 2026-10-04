import { PROUD } from './contract.ts';
import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * The Hungarian Parliament Building — Országház, Budapest, Hungary.
 *
 * Imre Steindl's Gothic Revival parliament, built 1885-1904 along the Pest bank
 * of the Danube: 268 m long, 123 m deep, the dome 96 m high. Seen from the
 * river or from Buda it is a **long white front under red roofs, a ribbed dome
 * in the middle and a crowd of spires everywhere else**, and the model is those
 * three things in that order of cost:
 *
 * - **The dome**, on a sixteen-sided drum with eight tall windows and a ring of
 *   pinnacles round its foot, ribbed in white, two stages of ogive and a
 *   lantern with its spire. It is the only curve and the only thing that
 *   reaches the tier's ceiling.
 * - **The two chamber halls** either side of it, each a steep gabled roof with
 *   a spire at every corner and a rose window in the gable that looks at the
 *   river. They are what make the skyline a skyline rather than a dome on a
 *   bar.
 * - **The river front**: a long range broken by a central projection, two
 *   pavilions and two end pavilions under pyramid roofs, each with four
 *   pinnacles; between them buttresses rising past the eaves into pinnacles,
 *   with tall windows in the bays. One rhythm per surface — buttress, window,
 *   buttress — and no storey bands across it.
 *
 * ---------------------------------------------------------------------------
 * The crop
 * ---------------------------------------------------------------------------
 *
 * At the `building` tier's 40 units the dome's 96 m is 0.42 units a metre,
 * which makes the true plan 112 by 51 and its half-diagonal 61.6: past the
 * tier's 55-unit footprint. The length is kept nearly true — the length of the
 * front against the dome's height is what the building is known by, and it is
 * 2.5 here against 2.8 in life — and the depth is squeezed to about 35 of 51,
 * because the back half of the building is behind the front from every view
 * but straight down. Measured on this layout the half-diagonal is about 52.6,
 * set by the plinth's corners, and the model 2,072 triangles of 2,600.
 *
 * The roofs of the ranges are pitched at 0.6 of an equilateral gable (a parent
 * carrying the scale over a child carrying the turn, so the pitch is a true
 * vertical scale); at full pitch they stood higher than the pavilions meant to
 * break them. The chamber halls keep the full pitch, which is what they look
 * like.
 *
 * The front (+Z) is the Danube front. The river is not modelled: the building
 * stands in a paved square of its own (the source's `plazas`), which is
 * Kossuth Square on the land side and stands in for the embankment here.
 */

// --- levels ---
const PLINTH_TOP = 1.2;
/** The ranges' eaves. */
const EAVE = 12;
/** Pavilions and the domed core: one storey and a half over the ranges. */
const PAVILION_TOP = 17.5;
const HALL_TOP = 18.5;

// --- plan: x along the river, z towards it ---
const FRONT_Z0 = 6;
const FRONT_Z1 = 16;
const REAR_Z0 = -16;
const REAR_Z1 = -6;
const FRONT_FACE = 17.5;
const CORE_HALF = 10;
const PROJECTION_HALF = 9;
const WING_X = 24;
const WING_HALF = 4;
/** The wing pavilions start in front of the halls, so the two never meet. */
const WING_Z0 = 7.5;
const END_X = 44;
const END_HALF = 4.5;
const HALL_X = 16;
const HALL_HALF = 6.2;
const HALL_DEPTH = 7;
/** How far a roof's eaves overhang the wall under it. */
const OVERHANG = 0.3;
const RANGE_PITCH = 0.6;

// --- the dome ---
const DRUM_R = 8.5;
const DRUM_TOP = 24;
const DOME_CORNICE = 24.8;
const DOME_LOW_R = 8.6;
const DOME_MID = 29;
const DOME_MID_R = 6.6;
const DOME_TOP = 34;
const LANTERN_R = 1.9;
const LANTERN_TOP = 35.8;
const SPIRE_TOP = 39.7;

export const hungarianParliament: Monument = {
  id: 'hungarian-parliament',
  name: 'Hungarian Parliament Building',
  iso: 'HUN',
  lat: 47.5071,
  lon: 19.0456,
  realHeight: 96,
  tier: 'building',
  // Set by the plinth's corners, about 52.6 out.
  footprint: 53,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper, strut, around } = ctx;

    const wall = palette.white; // the limestone fronts
    const trim = palette.sand; // cornices, the projection's terrace, the lantern
    const tile = palette.clay; // the red roofs and the dome
    const glass = ctx.tone(palette.slate, 0.8); // windows: dark, never black
    const base = palette.tan;

    const draft = new THREE.Group();

    /** A block given by its two opposite corners and its two levels. */
    const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number): Mesh => {
      const mesh = box(x1 - x0, y1 - y0, z1 - z0, color);
      mesh.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
      draft.add(mesh);
      return mesh;
    };

    /**
     * A gabled roof: a three-sided prism with its ridge along x or z, its eaves
     * at `eave`, `halfSpan` from the ridge to the eaves and `pitch` times an
     * equilateral gable high.
     */
    const roof = (cx: number, cz: number, length: number, halfSpan: number, eave: number, alongX: boolean, pitch: number): void => {
      const r = halfSpan / Math.sqrt(3);
      const prism = column(r, length, tile, 3);
      // A quarter turn about x lays the prism's axis along +z with its flat
      // face down at -r and its apex up.
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, r, -length / 2);
      const turn = new THREE.Group();
      if (alongX) turn.rotation.y = Math.PI / 2;
      turn.add(prism);
      const pitched = new THREE.Group();
      pitched.position.set(cx, eave, cz);
      pitched.scale.y = pitch;
      pitched.add(turn);
      draft.add(pitched);
    };

    /** A pyramid roof over a pavilion `halfX` by `halfZ`, overhanging all round. */
    const pyramid = (cx: number, cz: number, halfX: number, halfZ: number, height: number): void => {
      const cap = taper(halfX + OVERHANG, 0.25, height, tile, 4);
      cap.scale.z = (halfZ + OVERHANG) / (halfX + OVERHANG);
      cap.position.set(cx, PAVILION_TOP, cz);
      draft.add(cap);
    };

    /** A stone pinnacle standing at (x, z) from `y`, sunk a little into what holds it. */
    const pinnacle = (x: number, z: number, y: number, height: number, radius: number): void => {
      const spike = taper(radius, 0.05, height, wall, 4);
      spike.position.set(x, y - 0.3, z);
      draft.add(spike);
    };

    /** A window on a face looking at +Z whose wall is at `face`. */
    const glazing = (x: number, face: number, y0: number, y1: number, width: number): void => {
      const pane = box(width, y1 - y0, 0.5, glass);
      pane.position.set(x, y0, face);
      draft.add(pane);
    };

    // --- plinth and the bodies ---
    block(-49.3, 49.3, 0, PLINTH_TOP, -16.8, 18.3, base);

    block(-END_X, END_X, PLINTH_TOP, EAVE, FRONT_Z0, FRONT_Z1, wall);
    block(-42, 42, PLINTH_TOP, EAVE, REAR_Z0, REAR_Z1, wall);
    block(-CORE_HALF, CORE_HALF, PLINTH_TOP, PAVILION_TOP, -CORE_HALF, CORE_HALF, wall);
    block(-PROJECTION_HALF, PROJECTION_HALF, PLINTH_TOP, PAVILION_TOP, CORE_HALF, FRONT_FACE, wall);

    for (const side of [1, -1]) {
      // The wing pavilion, the end pavilion and the end range behind it.
      block(side * WING_X - WING_HALF, side * WING_X + WING_HALF, PLINTH_TOP, PAVILION_TOP, WING_Z0, FRONT_FACE, wall);
      block(side * END_X - END_HALF, side * END_X + END_HALF, PLINTH_TOP, PAVILION_TOP, FRONT_Z0, FRONT_FACE, wall);
      block(side * END_X - 3.5, side * END_X + 3.5, PLINTH_TOP, EAVE, REAR_Z0, FRONT_Z0, wall);
      // The chamber hall.
      block(side * HALL_X - HALL_HALF, side * HALL_X + HALL_HALF, PLINTH_TOP, HALL_TOP, -HALL_DEPTH, HALL_DEPTH, wall);
    }

    // --- roofs ---
    const frontZ = (FRONT_Z0 + FRONT_Z1) / 2;
    const rangeSpan = (FRONT_Z1 - FRONT_Z0) / 2 + OVERHANG;
    for (const side of [1, -1]) {
      // The front range between the pavilions, in two runs a side.
      for (const [x0, x1] of [[PROJECTION_HALF, WING_X - WING_HALF], [WING_X + WING_HALF, END_X - END_HALF]] as const) {
        roof((side * (x0 + x1)) / 2, frontZ, x1 - x0, rangeSpan, EAVE, true, RANGE_PITCH);
      }
      roof(side * END_X, (REAR_Z0 - OVERHANG + FRONT_Z0) / 2, FRONT_Z0 - REAR_Z0 + OVERHANG, 3.5 + OVERHANG, EAVE, false, RANGE_PITCH);
      roof(side * HALL_X, 0, HALL_DEPTH * 2 + OVERHANG * 2, HALL_HALF + OVERHANG, HALL_TOP, false, 1);
      pyramid(side * WING_X, (WING_Z0 + FRONT_FACE) / 2, WING_HALF, (FRONT_FACE - WING_Z0) / 2, 7.5);
      pyramid(side * END_X, (FRONT_Z0 + FRONT_FACE) / 2, END_HALF, (FRONT_FACE - FRONT_Z0) / 2, 8);
    }
    roof(0, (REAR_Z0 + REAR_Z1) / 2, 2 * (END_X - 3.5), rangeSpan, EAVE, true, RANGE_PITCH);

    // The central projection carries a terrace, so the drum shows over it.
    block(-PROJECTION_HALF - 0.2, PROJECTION_HALF + 0.2, PAVILION_TOP, PAVILION_TOP + 0.8, CORE_HALF, FRONT_FACE + 0.25, trim);

    // --- the river front's spires ---
    for (const side of [1, -1]) {
      for (const [cx, halfX, z0] of [[WING_X, WING_HALF, WING_Z0], [END_X, END_HALF, FRONT_Z0]] as const) {
        for (const ex of [-1, 1]) {
          for (const z of [z0 + 0.4, FRONT_FACE - 0.4]) {
            pinnacle(side * cx + ex * (halfX - 0.4), z, PAVILION_TOP, 6.5, 0.55);
          }
        }
      }

      // The hall's four corner spires.
      for (const ex of [-1, 1]) {
        for (const ez of [-1, 1]) {
          pinnacle(side * HALL_X + ex * (HALL_HALF - 0.3), ez * (HALL_DEPTH - 0.3), HALL_TOP, 9, 0.8);
        }
      }

      // Turrets at the projection's front corners.
      const turret = column(1, 22.5 - PLINTH_TOP, wall, 6);
      turret.position.set(side * (PROJECTION_HALF - 0.6), PLINTH_TOP, FRONT_FACE - 0.6);
      draft.add(turret);
      const turretRoof = taper(1.15, 0.05, 5, tile, 6);
      turretRoof.position.set(side * (PROJECTION_HALF - 0.6), 22.5, FRONT_FACE - 0.6);
      draft.add(turretRoof);

      // Buttress, window, buttress along each run of the front range.
      for (const [x0, x1] of [[PROJECTION_HALF, WING_X - WING_HALF], [WING_X + WING_HALF, END_X - END_HALF]] as const) {
        const bay = (x1 - x0) / 3;
        for (const k of [1, 2]) {
          const x = side * (x0 + bay * k);
          block(x - 0.45, x + 0.45, PLINTH_TOP, 13.5, FRONT_Z1 - 0.2, FRONT_Z1 + 0.9, wall);
          pinnacle(x, FRONT_Z1 + 0.35, 13.5, 4.5, 0.55);
        }
        for (const k of [0.5, 1.5, 2.5]) glazing(side * (x0 + bay * k), FRONT_Z1, 3.5, 10.5, 1.6);
      }

      // A tall window in each pavilion's front, and a rose in each hall's gable.
      glazing(side * WING_X, FRONT_FACE, 4, 14, 1.8);
      glazing(side * END_X, FRONT_FACE, 4, 14, 2);
      const rose = column(2, 0.5, glass, 8);
      rose.rotation.x = Math.PI / 2;
      // On the gable, which overhangs the hall's front by `OVERHANG`.
      rose.position.set(side * HALL_X, 23, HALL_DEPTH + OVERHANG - 0.25);
      draft.add(rose);
    }
    for (const x of [-4.5, 0, 4.5]) glazing(x, FRONT_FACE, 4, 14, 2);

    // --- the dome ---
    const drum = column(DRUM_R, DRUM_TOP - PAVILION_TOP, wall, 16);
    drum.position.y = PAVILION_TOP;
    draft.add(drum);

    // Eight tall windows on the drum's faces, standing off it.
    draft.add(
      around(8, () => {
        const pane = box(1.5, 4.6, 0.6, glass);
        pane.position.set(0, PAVILION_TOP + 0.9, DRUM_R);
        return pane;
      }),
    );

    // A ring of pinnacles round the drum's foot, on the core's roof.
    draft.add(
      around(8, () => {
        const spike = taper(0.6, 0.05, 6, wall, 4);
        spike.position.set(0, PAVILION_TOP - 0.3, 9.4);
        return spike;
      }),
    );

    const cornice = column(9, DOME_CORNICE - DRUM_TOP, trim, 16);
    cornice.position.y = DRUM_TOP;
    draft.add(cornice);

    const low = taper(DOME_LOW_R, DOME_MID_R, DOME_MID - DOME_CORNICE, tile, 16);
    low.position.y = DOME_CORNICE;
    draft.add(low);

    const high = taper(DOME_MID_R, LANTERN_R, DOME_TOP - DOME_MID, tile, 16);
    high.position.y = DOME_MID;
    draft.add(high);

    // White ribs up every other edge of the sixteen. A prism's vertices sit
    // half a segment off +Z, at the circumradius.
    const toVertex = 1 / Math.cos(Math.PI / 16);
    for (let i = 0; i < 16; i += 2) {
      const angle = Math.PI / 16 + (i * Math.PI) / 8;
      const at = (radius: number, y: number) =>
        new THREE.Vector3(Math.sin(angle) * radius * toVertex, y, Math.cos(angle) * radius * toVertex);
      draft.add(strut(at(DOME_LOW_R, DOME_CORNICE), at(DOME_MID_R, DOME_MID), 0.5, wall));
      draft.add(strut(at(DOME_MID_R, DOME_MID), at(LANTERN_R, DOME_TOP), 0.5, wall));
    }

    const lantern = column(LANTERN_R, LANTERN_TOP - DOME_TOP, trim, 8);
    lantern.position.y = DOME_TOP;
    draft.add(lantern);

    // The spire starts `PROUD` inside the lantern's edge.
    const spire = taper(LANTERN_R - PROUD, 0.05, SPIRE_TOP - LANTERN_TOP, tile, 8);
    spire.position.y = LANTERN_TOP;
    draft.add(spire);

    return ctx.merge(draft);
  },
};

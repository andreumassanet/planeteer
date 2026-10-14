import type { Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Perito Moreno Glacier.
 *
 * A glacier seen from above is a white field that reads as snow, so the
 * monument is the terminal face: a wall of ice standing straight out of a lake,
 * its top sawn into teeth, with vertical fracture down its face, calved bergs in
 * the lake at its foot, and a broken ice field behind so the wall is the end of
 * something. The lake proves the wall is a wall.
 *
 * Design findings:
 *
 * - The fracture blue is `slate`, not `skyBlue`. The sky behind is nearly
 *   `skyBlue`, so a narrow `skyBlue` shape reads as a hole with sky showing
 *   through. `skyBlue` appears only as a broad, low waterline plate bounded by
 *   white above and dark water below.
 * - The fracture must not reach the top: the face cut into full-height columns
 *   reads as organ pipes. Ribs are applied to the face (sixteen, 0.2 to 1.5
 *   proud, each stopping 55% to 95% of the way up) instead of cut through it.
 * - A solid wall with a level top is a fortress. The crest is twenty-six teeth
 *   on the wall's top course (five fall in a fissure, so twenty-one are drawn),
 *   each irregular in width (1.2 to 4.4), height (1.0 to 8.6), depth, taper,
 *   yaw (up to 0.4 rad), lean (up to 0.2 rad) and forward tilt. They are short
 *   against the 29-unit face so the skyline stays level, and they shrink with
 *   the mass they stand on. The field behind uses the same generator one size
 *   smaller.
 * - The top course is about four units deep. The quarter camera sits 13.4
 *   degrees up, so a level surface hides everything behind it that does not
 *   rise 0.238 per unit of depth, measured from its front top corner; a deep
 *   course would force the field above the crest and make it an upper storey.
 *   The field is one band one to two units above the crest, not benches. The plan
 *   is bowed into a lobe and the east end descends in three steps.
 * - Rib relief comes from depth (a rib 1.2 proud shows 0.6 units of side face),
 *   yaw (a face turned more than 5.7 degrees toward -X crosses `dotNL = 0.5`),
 *   and scattered tops. Yaw is anchored at the rib's front face so a rib can
 *   only get narrower in x as it turns.
 *
 * Colour: ice is `white` throughout (the warm white; top faces land on the
 * ramp's brightest texel and verticals a texel below, so every tooth draws its
 * own top edge). The lake is `steel`, not `skyBlue`, so the ice has something to
 * be bright against, and a horizontal face is the most sky-lit surface, so the
 * cool lake against warm vertical ice says water. `slate` is the fracture.
 * `skyBlue` is the waterline, a plate three units deep in five broken lengths.
 * `bark` and `green` are the Peninsula de Magallanes headland on the left, where
 * the sun comes from; the wall runs off the right-hand edge, descending, as a
 * crop of something six times longer. The lake is a channel of five reaches
 * (12, 22, 33, 31, 26 wide), not a rectangle, which would be a plinth.
 *
 * Scale: the plan is cropped 5.9x (85 units of face at 10 m to the unit, about a
 * sixth of the front) and the vertical is stretched 4.4x (1 unit is 2.27 m; the
 * crest sits about 31.9 over a waterline at 1.0). Half-diagonal over height is
 * 1.46. The stretch lets the field behind stand above the crest despite a real
 * grade near 9%, and bergs take the same stretch (freeboard 0.6 to 2.1 against
 * 3.5 to 8 of beam, about four to one, the flattest a thumbnail can show). Eleven
 * bergs along 850 m of face give the face its length. Tier `building`.
 *
 * Left out: the rupture arch (an event, and strong enough to rename the card),
 * the walkways (a horizontal line in front of the one element that must read),
 * spray, and crevasses drawn as recesses (the camera annihilates horizontal
 * features); one survives as a narrow `slate` step down in the field.
 */

// --- The plan. 1 unit = 10 m across, 1 unit = 2.27 m up. ---

const WEST = -47;
const EAST = 47;

/** Where the ice starts: the headland has everything west of it. */
const WALL_W = -38;

/** The ice field behind, and the back of the model. */
const FIELD_W = -41;
const FIELD_N = -26;

/** Far edge of the lake, tucked under the ice so no water is ever seen behind it. */
const LAKE_N = -12;

/** Surface of Lago Argentino. The lake is a thin plate from y = 0 to here. */
const WATER = 1.0;

// --- The face ---

/**
 * The face, as seven continuous masses. The plan is bowed: `front` follows the
 * arc `3.5 - 9 * ((x + 10) / 57)^2` plus half a unit of jitter, so the snout
 * stands 3.5 out into the lake and falls back to -4.8 at the far east; the
 * waterline and brash ride the same arc through `faceAt`. The east shoulder
 * descends: masses four to seven step down 25.8, 20.5, 15.2, 10.8 and lean back,
 * and the teeth shrink with them; the rest stay level at 28 to 29.5. `back`
 * bows with `front`, so the top course stays four units deep the whole way.
 */
const CORE: ReadonlyArray<{ x0: number; x1: number; front: number; back: number; top: number }> = [
  { x0: WALL_W, x1: -22.6, front: 2.4, back: -1.8, top: 29.0 },
  { x0: -20.6, x1: -3.4, front: 3.1, back: -1.3, top: 28.0 },
  { x0: -1.4, x1: 14.6, front: 3.2, back: -1.0, top: 29.5 },
  { x0: 16.6, x1: 26.0, front: 0.8, back: -3.4, top: 25.8 },
  { x0: 26.0, x1: 34.5, front: -1.1, back: -5.2, top: 20.5 },
  { x0: 34.5, x1: 41.0, front: -2.6, back: -6.6, top: 15.2 },
  { x0: 41.0, x1: EAST, front: -4.8, back: -8.6, top: 10.8 },
];

/**
 * The three fissures parting the first four masses, and how high the `slate`
 * reaches inside each. Every top is below the ice field behind (24.5 at its
 * lowest), so a fissure is filled with white above the blue and the wall never
 * shows sky below its crest. Teeth whose centre falls in a gap are dropped.
 */
const FISSURES: ReadonlyArray<{ x0: number; x1: number; top: number }> = [
  { x0: -22.6, x1: -20.6, top: 26.8 },
  { x0: -3.4, x1: -1.4, top: 24.8 },
  { x0: 14.6, x1: 16.6, top: 23.8 },
];

/** Nominal rib width: 49 m of face, wide enough that the gap between two is a line. */
const RIB_PITCH = 4.9;

/** Teeth along the crest. Five of them fall in a fissure and are dropped. */
const CREST_TEETH = 26;

/**
 * The waterline: `skyBlue`, in five lengths with bare wall between them, plates
 * three units deep lying on the lake against the foot of the face, standing `h`
 * above the water. Each sits inside a single mass and is placed off that mass's
 * bowed `front`.
 */
const WATERLINE: ReadonlyArray<{ x0: number; x1: number; h: number }> = [
  { x0: -35.0, x1: -25.0, h: 0.8 },
  { x0: -17.5, x1: -6.0, h: 1.1 },
  { x0: 1.0, x1: 11.5, h: 0.6 },
  { x0: 18.0, x1: 25.0, h: 1.0 },
  { x0: 27.5, x1: 33.0, h: 0.7 },
];

/**
 * Brash: calved blocks jammed against the foot. `out0` and `out1` are distances
 * in front of the local face, so the raft follows the bow. They sit in the
 * stretches of x the waterline leaves bare, so the cyan band and the white brash
 * alternate. `h` is freeboard.
 */
const BRASH: ReadonlyArray<{ x0: number; x1: number; out0: number; out1: number; h: number }> = [
  { x0: -24.0, x1: -18.5, out0: 1.2, out1: 4.4, h: 2.0 },
  { x0: -5.5, x1: 0.5, out0: 1.1, out1: 4.8, h: 2.6 },
  { x0: 12.5, x1: 17.5, out0: 1.3, out1: 4.6, h: 1.9 },
  { x0: 34.0, x1: 40.0, out0: 1.0, out1: 5.0, h: 2.4 },
];

// --- The lake ---

/**
 * Lago Argentino as the Canal de los Tempanos: five reaches from a far edge
 * tucked under the ice, opening 12, 22, 33 and turning back to 31, 26 at the far
 * corner. At x = 47 a circle of radius 54 leaves only 26 units of z, and the
 * water still has to reach the far end of the ice arm.
 */
const LAKE: ReadonlyArray<{ x0: number; x1: number; shore: number }> = [
  { x0: WEST, x1: -27, shore: 12 },
  { x0: -27, x1: -6, shore: 22 },
  { x0: -6, x1: 20, shore: 33 },
  { x0: 20, x1: 38, shore: 31 },
  { x0: 38, x1: EAST, shore: 26 },
];

/**
 * The bergs. `w` and `d` are true metres at 10 m to the unit; `h` takes the
 * model's 4.4x vertical stretch. `cap` puts a small tilted block on two of the
 * eleven (a rolled berg has a peak, the rest are rafts). Every one is clear of
 * the bowed face and inside the channel.
 */
const BERGS: ReadonlyArray<{
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  yaw: number;
  cap: boolean;
}> = [
  { x: -34, z: 6.0, w: 5.0, d: 3.4, h: 1.0, yaw: 0.22, cap: false },
  { x: -24, z: 17.0, w: 4.0, d: 3.0, h: 0.7, yaw: -0.35, cap: false },
  { x: -19, z: 7.5, w: 7.0, d: 4.5, h: 1.5, yaw: 0.12, cap: true },
  { x: -12, z: 13.5, w: 4.5, d: 3.2, h: 0.9, yaw: 0.48, cap: false },
  // 1.2, not 1.1: at 1.1 its deck is in the plane of the melt band's top beside it.
  { x: -4, z: 9.0, w: 6.0, d: 4.0, h: 1.2, yaw: -0.18, cap: false },
  { x: 3, z: 22.0, w: 3.5, d: 2.6, h: 0.6, yaw: 0.3, cap: false },
  { x: 10, z: 10.5, w: 8.0, d: 5.0, h: 1.8, yaw: -0.1, cap: true },
  { x: 14, z: 26.5, w: 4.5, d: 3.4, h: 1.2, yaw: 0.4, cap: false },
  { x: 24, z: 14.5, w: 5.0, d: 3.6, h: 0.8, yaw: -0.28, cap: false },
  { x: 30, z: 23.0, w: 6.5, d: 4.2, h: 2.1, yaw: 0.15, cap: false },
  { x: 40, z: 8.0, w: 6.0, d: 4.4, h: 1.0, yaw: -0.2, cap: false },
];

// --- The ice field behind ---

/**
 * The field, as one deep band from `z0` forward to `z1`, set about a unit and a
 * half in front of the frontmost `back` under each step, so the ice is
 * continuous from the crest to the back with no slot for the ground. The eastern
 * steps stop short of `FIELD_N`. The tops step down across the width with the
 * shoulder (30.7, 31.2, 24.5, 19.5, 11.5), one to two units above the mass in
 * front and under the teeth. One step is dropped 2 units and painted `slate`: a
 * transverse crevasse drawn as a gap in the profile.
 */
const FIELD: ReadonlyArray<{
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  fracture?: boolean;
  teeth: number;
}> = [
  { x0: FIELD_W, x1: -13, z0: FIELD_N, z1: -0.1, top: 30.7, teeth: 4 },
  { x0: -13, x1: -3, z0: FIELD_N, z1: -0.1, top: 28.7, fracture: true, teeth: 0 },
  { x0: -3, x1: 16, z0: FIELD_N, z1: 0.2, top: 31.2, teeth: 4 },
  { x0: 16, x1: 27, z0: -24, z1: -2.2, top: 24.5, teeth: 3 },
  { x0: 27, x1: 36, z0: -19, z1: -4.0, top: 19.5, teeth: 2 },
  { x0: 36, x1: EAST, z0: -14, z1: -5.4, top: 11.5, teeth: 1 },
];

// --- Noise ---

/**
 * Deterministic pseudo-noise in [-1, 1]. A hash rather than a sum of sines,
 * which beat against each other over a couple of dozen samples and come out
 * evenly spaced.
 */
function grain(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return 2 * (x - Math.floor(x)) - 1;
}

export const peritoMoreno: Monument = {
  id: 'perito-moreno',
  name: 'Perito Moreno Glacier',
  iso: 'ARG',
  lat: -50.496,
  lon: -73.138,
  // No `realHeight`: 70 m stands above the lake, about 170 m more below it.
  tier: 'building',
  footprint: 54,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;
    const ice = palette.white; //      all of it: face, ribs, teeth, bergs, brash
    const fracture = palette.slate; // the fissures, and the crevasses in the field
    const melt = palette.skyBlue; //   the waterline glow, and nothing else
    const lake = palette.steel; //     Lago Argentino. See the colour note.
    const rock = palette.bark; //      the Península de Magallanes
    const forest = palette.green; //   the southern beech on top of it

    const group = new THREE.Group();

    /** Every rectangular mass is given as the box it occupies, so the tables above read as a map. */
    const slab = (
      x0: number,
      x1: number,
      z0: number,
      z1: number,
      y0: number,
      y1: number,
      color: number,
    ) => {
      const mesh = box(x1 - x0, y1 - y0, z1 - z0, color);
      mesh.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
      group.add(mesh);
      return mesh;
    };

    /** The hash, folded to [0, 1]. */
    const unit = (i: number, seed: number) => grain(i, seed) * 0.5 + 0.5;

    /**
     * One tooth. Every dimension and all three rotations come off the same
     * index, so no two are alike. Built on its own depth and stretched in x,
     * because `taper` is square in plan. It is sunk 0.4 into what it stands on
     * so the lean never lifts a corner clear.
     */
    const tooth = (i: number, centre: number, width: number, z: number, base: number, tall: number) => {
      const depth = 1.6 + 1.7 * unit(i, 2.7);
      const half = depth / 2;
      const height = 1.0 + tall * Math.pow(unit(i, 5.3), 1.35);
      const wedge = taper(half, half * (0.3 + 0.45 * unit(i, 9.7)), height, ice, 4);
      wedge.scale.x = width / depth;
      wedge.rotation.set(-0.13 * unit(i, 6.9), 0.4 * grain(i, 8.3), 0.2 * grain(i, 1.7));
      wedge.position.set(centre, base - 0.4, z);
      group.add(wedge);
    };

    /**
     * The bowed face at x: the front of the mass that owns it, or of the nearest
     * mass when x falls in a fissure. Everything sitting on the face is placed off this.
     */
    const faceAt = (x: number): number => {
      let nearest = CORE[0]!;
      let gap = Infinity;
      for (const mass of CORE) {
        const d = Math.max(mass.x0 - x, 0, x - mass.x1);
        if (d < gap) {
          gap = d;
          nearest = mass;
        }
      }
      return nearest.front;
    };

    // --- the lake: a channel (see LAKE), with the green ground left showing past
    // the near shore on the left. The water stops `PROUD` inside the model's west
    // and east ends, and the first reach `PROUD` short of the headland's south face. ---
    for (const reach of LAKE) {
      const x0 = reach.x0 === WEST ? WEST + PROUD : reach.x0;
      const x1 = reach.x1 === EAST ? EAST - PROUD : reach.x1;
      const shore = reach.x0 === WEST ? reach.shore - PROUD : reach.shore;
      slab(x0, x1, LAKE_N, shore, 0, WATER, lake);
    }

    // --- the headland: two masses stepping back and up, capped with beech, held
    // to 20.2 of the wall's 32. The lower one runs south past the shore so the
    // peninsula joins the ground the viewer stands on. ---
    slab(WEST, WALL_W, -13, 12, 0, 8.8, rock);
    slab(WEST, WALL_W, -13, 12, 8.8, 10.8, forest);
    slab(-46, -39.5, -22, -12, 0, 18.1, rock);
    slab(-46, -39.5, -22, -12, 18.1, 20.2, forest);

    // --- the ice field behind ---
    FIELD.forEach((step, s) => {
      slab(step.x0, step.x1, step.z0, step.z1, 0, step.top, step.fracture ? fracture : ice);

      // The field's own teeth, smaller than the crest's and kept to the front of
      // the band, since the wall hides the rest. None on the `slate` step.
      for (let k = 0; k < step.teeth; k++) {
        const i = 400 + s * 20 + k;
        const span = step.x1 - step.x0;
        const centre = step.x0 + span * ((k + 0.5) / step.teeth + 0.3 * grain(i, 1.1) / step.teeth);
        const width = 2.2 + 2.6 * unit(i, 3.3);
        tooth(i, centre, width, step.z1 - 1.2 - 4.0 * unit(i, 7.1), step.top, 4.0);
      }
    });

    // --- the face: seven masses, three fissures ---
    for (const mass of CORE) {
      slab(mass.x0, mass.x1, mass.back, mass.front, 0, mass.top, ice);
    }

    for (const fissure of FISSURES) {
      // Set behind whichever neighbouring mass stands further back, so the blue is never in front of the ice.
      const back = Math.min(faceAt(fissure.x0 - 0.5), faceAt(fissure.x1 + 0.5)) - 0.7;
      slab(fissure.x0 - 0.4, fissure.x1 + 0.4, back - 1.4, back, 0, fissure.top, fracture);
    }

    // --- the ribs: fracture relief applied to the face, not cut through it ---
    CORE.forEach((mass, m) => {
      const count = Math.max(1, Math.round((mass.x1 - mass.x0) / RIB_PITCH));
      const pitch = (mass.x1 - mass.x0) / count;
      for (let k = 0; k < count; k++) {
        const i = m * 17 + k;
        // Nearly the full slot: the gap between two ribs has to be a line.
        const width = pitch - (0.25 + 0.55 * unit(i, 4.1));
        const slide = (pitch - width) * unit(i, 7.7);
        const centre = mass.x0 + pitch * k + slide + width / 2;
        const front = mass.front + 0.2 + 1.3 * unit(i, 2.3);
        const depth = front - (mass.front - 0.6);
        const yaw = 0.3 * grain(i, 8.3);
        const top = mass.top * (0.55 + 0.4 * unit(i, 5.9));

        const rib = box(width, top, depth, ice);
        rib.rotation.y = yaw;
        // Anchored at the front face, not at the rib's centre.
        rib.position.set(
          centre - Math.sin(yaw) * (depth / 2),
          0,
          front - Math.cos(yaw) * (depth / 2),
        );
        group.add(rib);
      }
    });

    // --- the crest: the teeth ---
    const pitch = (EAST - WALL_W) / CREST_TEETH;
    for (let k = 0; k < CREST_TEETH; k++) {
      const centre = WALL_W + pitch * (k + 0.5) + 0.34 * pitch * grain(k, 4.3);
      const mass = CORE.find((m) => centre >= m.x0 && centre <= m.x1);
      // A tooth whose centre lands in a fissure is dropped, notching the crest there.
      if (!mass) continue;
      const width = 1.2 + 3.2 * unit(k, 3.3);
      const z = mass.front - 0.7 - 1.3 * unit(k, 7.1);
      // Teeth shrink with the mass they stand on, so the shoulder's crest recedes with it.
      tooth(k, centre, width, z, mass.top, 7.6 * Math.min(1, mass.top / 28));
    }

    // --- the waterline, and the brash at the foot ---
    for (const glow of WATERLINE) {
      // It starts under the ribs and runs three units out onto the water, so it
      // reads as one broken band rather than cyan in the gaps between ribs.
      const face = faceAt((glow.x0 + glow.x1) / 2);
      slab(glow.x0, glow.x1, face + 1.2, face + 4.6, 0.3, WATER + glow.h, melt);
    }

    for (const block of BRASH) {
      const face = faceAt((block.x0 + block.x1) / 2);
      slab(block.x0, block.x1, face + block.out0, face + block.out1, 0, WATER + block.h, ice);
    }

    // --- the bergs ---
    for (const berg of BERGS) {
      const raft = box(berg.w, WATER + berg.h, berg.d, ice);
      raft.rotation.y = berg.yaw;
      raft.position.set(berg.x, 0, berg.z);
      group.add(raft);

      if (berg.cap) {
        const peak = taper(berg.d * 0.3, berg.d * 0.14, berg.h * 1.2, ice, 4);
        peak.rotation.y = berg.yaw + 0.4;
        peak.position.set(berg.x - berg.w * 0.18, WATER + berg.h, berg.z);
        group.add(peak);
      }
    }

    return group;
  },
};

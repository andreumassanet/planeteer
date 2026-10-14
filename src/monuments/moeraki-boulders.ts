import type { Group, Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Moeraki Boulders, Koekohe Beach, Otago.
 *
 * A boulder is a grey ball on a grey beach, so the monument is a stretch of tide
 * line under the bank the boulders erode out of. The beach carries the width,
 * the mudstone bank the height, and the boulders carry the recognition: spheres
 * that look manufactured, a scattered line of them in a range of sizes along the
 * tide line, two split open with a dark hollow inside, and wet flat sand reading
 * as a different surface from the dry beach behind it.
 *
 * Built at true scale and proportion (a metre is 3.78 units): the largest
 * boulder is 8 units across (2.1 m), the bank is 15.4 units (4.1 m), and the
 * crop is 42 by 32 units of beach. Tier `building` because `monument` caps the
 * footprint at 14 units, only three boulder-diameters wide. The crop is not
 * centred on the Y axis (17 units back, 15 forward), so the half-diagonal is
 * 27.0 and the aspect 1.75 against the cap of 2.
 *
 * A ball is a stack of frusta, one mesh and about `4 * sides` triangles a band.
 * Facets go where they matter: the two biggest get five bands of twelve sides,
 * half-buried ones two or three bands of six or eight. Bands share one `sides`
 * count per boulder so their edges line up. A buried ball reads as a dome, so
 * the heroes are buried only 7% and 9% and the profile turns back under itself.
 * The boulders are perfect spheres, varying only in size and depth, because
 * "these look machined" is the content of the monument.
 *
 * Wet sand is `slate`, a cool mid-grey, rather than a darker `tan` (which reads
 * as shadow on the dry beach); the hemisphere light makes horizontal faces the
 * coolest surface in the scene. Dry sand at 1.8, wet at 1.2 and sea at 0.7 each
 * slide under the one behind, and a `white` foam ridge stands 0.3 proud between
 * the last two. The hollow in a cracked boulder is `bark`, a warm recess colour.
 *
 * The bank is a slope: courses step back from the foot to the crest, each bed is
 * two overlapping pieces spanning the crop with joins at a different x on every
 * course (the ink hulls every mesh, so a regular row of masses draws party
 * walls), every mass is yawed and every bed rolled so nothing is parallel, the
 * crest masses are rolled harder so the skyline slopes, and every mass starts
 * under the beach so no bottom edge shows. Four lobes break the face. The
 * strata are `brown` mudstone (two beds), a thin `bark` band, `darkOlive`
 * topsoil and a `green` crest.
 *
 * A cracked boulder is a sphere opened, not a bowl: from the quarter camera a
 * recessed floor is hidden. The bottom two thirds are solid, a `bark` disc
 * stands a third of a unit proud of the break (0.80 of the rim, leaving a pale
 * ring that reads as shell thickness), and a rind of unequal plates (wide enough
 * to fuse with their neighbours) stands behind it, leaning in. The two slots
 * facing the camera are empty. `tilt` leans each shell toward +Z, so the shell
 * sits deeper by the lift, and the sand must be deeper than the low edge or the
 * model sinks below y = 0.
 *
 * Left out: the septarian veins, boulders out in the water, and the real beach's
 * length.
 */

// --- The crop. +Z is seaward: the viewer stands in the surf and looks at the bank. ---

const HALF_WIDTH = 21;
/** The seaward edge and the back of the bank. The corners of this rectangle are the footprint. */
const SEA_EDGE = 15;
const BANK_EDGE = -17;

/** Flat tops. Every slab stands on y = 0, so its height is its top. */
const DRY_TOP = 1.8;
const WET_TOP = 1.2;
const FOAM_TOP = 1.5;
const SEA_TOP = 0.7;

/** Flat edges. Each runs under the one behind it, so no two faces are coplanar. */
const DRY_FRONT = -1.0;
const WET_BACK = -2.2;
const WET_FRONT = 9.6;
const FOAM_BACK = 8.6;
const FOAM_FRONT = 11.4;
const SEA_BACK = 10.4;

/** Behind this a boulder stands on the dry beach; in front of it, on the tide flat. */
const TIDE_LINE = -1.6;
/** How far a boulder sinks into the flat it stands on. Small, but never zero: coplanar faces z-fight. */
const BED = 0.25;

// --- The bank ---

/**
 * One mass of the bank. `stratum` indexes the four colours in `build`: 0
 * mudstone, 1 the dark band, 2 topsoil, 3 turf. `batter` is the top width as a
 * fraction of the bottom (under 1 the mass leans back). `yaw` turns it about its
 * vertical axis and `roll` tips it sideways; no two masses share either.
 */
interface Mass {
  x: number;
  width: number;
  /** Bottom. `BANK_FOOT` for anything standing on the beach. */
  base: number;
  height: number;
  /** The z of the face. The mass runs back from here by `depth`. */
  front: number;
  depth: number;
  batter: number;
  yaw: number;
  roll: number;
  stratum: 0 | 1 | 2 | 3;
}

/**
 * Under the beach, so no mass at the foot of the bank shows a bottom edge. 1.0
 * and not lower because a rolled mass dips `width * sin(roll)` below its base.
 */
const BANK_FOOT = 1.0;

/**
 * The bank. Read down the `front` column and it is a slope: the face recedes
 * from -9.4 at the foot to -12.4 at the topsoil over 12 units of rise. Each bed
 * is two overlapping pieces with the join at a different x on every course, and
 * no two joins stack. Every mass extends about a unit below its bed's floor, so
 * a rolled mass's sloping bottom edge never shows daylight.
 */
const BANK: readonly Mass[] = [
  // --- the beds, each rolled a couple of degrees so the strata dip to the right ---
  { x: -9.7, width: 22.0, base: BANK_FOOT, height: 4.1, front: -9.4, depth: 7.0, batter: 0.99, yaw: 0.035, roll: -0.028, stratum: 0 },
  { x: 8.8, width: 23.2, base: BANK_FOOT, height: 3.8, front: -9.2, depth: 7.2, batter: 0.99, yaw: -0.05, roll: -0.032, stratum: 0 },
  { x: -11.0, width: 20.0, base: 3.4, height: 5.0, front: -10.5, depth: 5.9, batter: 0.985, yaw: -0.06, roll: -0.045, stratum: 0 },
  { x: 7.4, width: 27.2, base: 3.4, height: 4.7, front: -10.3, depth: 6.1, batter: 0.985, yaw: 0.045, roll: -0.05, stratum: 0 },
  { x: -6.6, width: 28.8, base: 6.0, height: 4.6, front: -11.4, depth: 5.0, batter: 0.98, yaw: 0.05, roll: -0.04, stratum: 1 },
  { x: 12.0, width: 17.2, base: 6.0, height: 4.2, front: -11.2, depth: 5.2, batter: 0.98, yaw: -0.09, roll: -0.048, stratum: 1 },
  { x: -8.6, width: 24.2, base: 8.4, height: 4.3, front: -12.4, depth: 4.0, batter: 0.97, yaw: 0.05, roll: -0.03, stratum: 2 },
  { x: 9.0, width: 23.6, base: 8.4, height: 4.0, front: -12.1, depth: 4.3, batter: 0.97, yaw: -0.038, roll: -0.038, stratum: 2 },

  // --- lobes standing out of the face: two of fallen mudstone at the foot, two
  // --- ribs of harder rock rising out of the beach, wide at the bottom and narrow at the top ---
  { x: -12.0, width: 6.8, base: BANK_FOOT, height: 5.0, front: -7.9, depth: 3.4, batter: 0.4, yaw: 0.2, roll: 0.05, stratum: 0 },
  { x: 4.6, width: 5.6, base: BANK_FOOT, height: 4.2, front: -8.3, depth: 3.0, batter: 0.36, yaw: -0.26, roll: -0.07, stratum: 0 },
  { x: -6.6, width: 5.0, base: BANK_FOOT, height: 8.0, front: -9.5, depth: 2.8, batter: 0.62, yaw: -0.16, roll: 0.06, stratum: 0 },
  { x: 9.8, width: 5.8, base: BANK_FOOT, height: 7.4, front: -9.7, depth: 3.0, batter: 0.66, yaw: 0.21, roll: -0.05, stratum: 0 },

  // --- the crest: seven turf lumps and one patch of bare earth, running down
  // --- from 15.4 at the far left to 12.6 at the near right. They overlap in x
  // --- so no gap is a slot of sky; their fronts overhang the face, as an eroding bank does ---
  { x: -16.5, width: 8.2, base: 11.3, height: 4.35, front: -12.6, depth: 3.6, batter: 0.82, yaw: 0.1, roll: 0.12, stratum: 3 },
  { x: -10.4, width: 7.6, base: 11.3, height: 3.7, front: -13.4, depth: 3.2, batter: 0.86, yaw: -0.15, roll: -0.15, stratum: 3 },
  { x: -4.8, width: 7.2, base: 11.3, height: 3.4, front: -12.2, depth: 3.8, batter: 0.8, yaw: 0.07, roll: 0.09, stratum: 3 },
  { x: 0.6, width: 6.0, base: 11.3, height: 2.7, front: -13.8, depth: 2.9, batter: 0.88, yaw: -0.09, roll: -0.17, stratum: 2 },
  { x: 5.6, width: 7.4, base: 11.3, height: 2.9, front: -12.5, depth: 3.5, batter: 0.84, yaw: 0.17, roll: 0.13, stratum: 3 },
  { x: 11.2, width: 6.6, base: 11.3, height: 2.2, front: -13.6, depth: 3.0, batter: 0.9, yaw: -0.06, roll: -0.1, stratum: 3 },
  { x: 16.2, width: 6.4, base: 11.3, height: 1.9, front: -12.3, depth: 3.7, batter: 0.83, yaw: 0.13, roll: 0.15, stratum: 3 },
  { x: 18.3, width: 4.8, base: 11.3, height: 1.5, front: -13.5, depth: 3.1, batter: 0.92, yaw: -0.11, roll: -0.11, stratum: 3 },
];

/** Sand slumped against the foot of the bank, so it does not meet the beach on a hard line. */
const SAND_FOOT = DRY_TOP - BED;
const SLUMPS: ReadonlyArray<{ x: number; z: number; r: number; h: number }> = [
  { x: -17.0, z: -8.6, r: 3.6, h: 2.4 },
  { x: -2.6, z: -8.2, r: 3.2, h: 1.8 },
  { x: 12.6, z: -8.8, r: 3.4, h: 1.6 },
];

/** The boulder still in the bank, just above the mudstone ledge it will fall from. */
const IN_BANK = { x: -13.2, y: 7.7, z: -11.9, r: 2.2, buried: 0.42, bands: 3, sides: 8 };

// --- The boulders ---

interface Stone {
  x: number;
  z: number;
  /** Sphere radius. 4.0 is a 2.1 m boulder, the largest at Moeraki. */
  r: number;
  /** Fraction of the diameter under the sand. Under 0.15 the profile visibly undercuts. */
  buried: number;
  /** Frusta stacked above the sand line. */
  bands: number;
  sides: number;
}

/**
 * Placed by hand, because the composition is the monument. Nothing overlaps; the
 * two biggest stand clear; nothing sits in the 1.2-unit band around the step
 * between the dry sand and the tide flat; and sizes thin out toward the back.
 */
const BOULDERS: readonly Stone[] = [
  // --- on the tide flat, standing all but clear ---
  { x: -5.0, z: 3.4, r: 4.0, buried: 0.07, bands: 5, sides: 12 },
  { x: 12.6, z: 5.6, r: 3.3, buried: 0.09, bands: 5, sides: 12 },
  { x: -13.4, z: 2.6, r: 2.9, buried: 0.12, bands: 5, sides: 10 },
  { x: -18.4, z: 6.2, r: 2.0, buried: 0.22, bands: 4, sides: 10 },
  { x: 18.2, z: 8.6, r: 1.7, buried: 0.18, bands: 3, sides: 8 },

  // --- in the foam ---
  { x: 8.4, z: 9.8, r: 1.6, buried: 0.45, bands: 3, sides: 8 },
  // Half buried: at 0.58 its first band's top came within a hundredth of the foam's top face.
  { x: -9.0, z: 9.6, r: 1.3, buried: 0.5, bands: 3, sides: 8 },
  { x: 0.0, z: 9.2, r: 0.75, buried: 0.55, bands: 2, sides: 6 },

  // --- up the dry beach, smaller and deeper in the sand ---
  { x: -4.0, z: -4.6, r: 2.6, buried: 0.15, bands: 4, sides: 10 },
  { x: 7.0, z: -4.2, r: 1.85, buried: 0.3, bands: 4, sides: 8 },
  { x: 16.4, z: -5.0, r: 1.45, buried: 0.52, bands: 3, sides: 8 },
  { x: -11.0, z: -6.6, r: 1.15, buried: 0.62, bands: 3, sides: 6 },

  // --- pebbles: the bottom of the size range, and what keeps the dry sand from being empty ---
  { x: 2.0, z: -8.0, r: 0.62, buried: 0.6, bands: 2, sides: 6 },
  { x: 12.4, z: -7.8, r: 0.55, buried: 0.5, bands: 2, sides: 6 },
];

/**
 * The two split open: one on the wet sand near the middle, one up on the dry
 * beach. `tilt` leans each toward +Z.
 */
const CRACKED: ReadonlyArray<{
  x: number;
  z: number;
  r: number;
  buried: number;
  yaw: number;
  tilt: number;
}> = [
  { x: 4.6, z: 2.0, r: 3.0, buried: 0.18, yaw: -0.24, tilt: 0.14 },
  { x: -15.0, z: -5.2, r: 2.5, buried: 0.22, yaw: 0.36, tilt: 0.18 },
];

/** Facets for a cracked one: ten reads as a rim round the dark disc, eight as a nut. */
const CRACKED_SIDES = 10;

/** Where a cracked boulder is opened, as a fraction of its diameter from the bottom. */
const BREAK = 0.62;

/**
 * The dark interior, as a fraction of the break's half-width, and how far it
 * stands proud of the break. The remainder is the pale ring of shell thickness.
 */
const HOLLOW = 0.8;
const HOLLOW_RISE = 0.32;

/**
 * The rind, as heights in units of the sphere's radius, one per slot round the
 * break. `around` puts slot 0 on +Z, so the two zeroes are the near side and let
 * the camera see the hollow. The five that stand are unequal and asymmetric (an
 * even arc is a crown). The cap is 0.76: a taller plate would stand above the sphere.
 */
const RIND: readonly number[] = [0, 0, 0.44, 0.72, 0.3, 0.62, 0.24];
/** How far a plate leans in over the hollow, in radians. It is a shell, so it curves back. */
const RIND_LEAN = 0.34;

/**
 * Deterministic yaw in [-1, 1]. A sphere is symmetric, so this only turns the
 * facets. The step is the golden angle.
 */
const wobble = (index: number, salt: number): number => Math.sin(index * 2.39996 + salt);

export const moerakiBoulders: Monument = {
  id: 'moeraki-boulders',
  name: 'Moeraki Boulders',
  iso: 'NZL',
  lat: -45.346,
  lon: 170.826,
  // No `realHeight`: no height belongs to the group.
  tier: 'building',
  footprint: 28,

  build(ctx) {
    const { THREE, palette, box, column, taper, around } = ctx;

    const stone = palette.bone; //      the boulders
    const drySand = palette.sand; //    the beach above the tide
    const wetSand = palette.slate; //   the tide flat. See the note at the top of the file.
    const foam = palette.white; //      the surf line, and the brightest thing here
    const sea = palette.steel; //       the water, which must be the dark
    const hollow = palette.bark; //     inside a cracked one: a recess, so warm
    /** The bank, bottom to top: mudstone, the dark band, topsoil, turf. Two beds share the mudstone. */
    const STRATA = [palette.brown, palette.bark, palette.darkOlive, palette.green];

    const group = new THREE.Group();

    // --- the four flats ---

    // `inset` pulls a flat's two ends in from the crop's sides, and the tide flat
    // and the sea stop `PROUD` short of the sand and foam that overlap them.
    const flat = (back: number, front: number, top: number, color: number, inset = 0): void => {
      const slab = box((HALF_WIDTH - inset) * 2, top, front - back, color);
      slab.position.z = (back + front) / 2;
      group.add(slab);
    };

    flat(BANK_EDGE, DRY_FRONT, DRY_TOP, drySand);
    flat(WET_BACK, WET_FRONT, WET_TOP, wetSand, PROUD);
    // The foam stands 0.3 proud of the tide flat and 0.75 above the sea, bridging the seam between them.
    flat(FOAM_BACK, FOAM_FRONT, FOAM_TOP, foam);
    flat(SEA_BACK, SEA_EDGE, SEA_TOP, sea, PROUD);

    /** The top of whichever flat a thing at this z stands on. */
    const sandTop = (z: number): number => (z < TIDE_LINE ? DRY_TOP : WET_TOP);

    // --- boulders ---

    /**
     * A sphere of `radius`, cut off level at `buried` of its diameter and built
     * as `bands` stacked frusta above the cut, walking the polar angle in equal
     * steps from the sand line to the top pole. Its base is its own y = 0, the
     * sand line, so the buried part does not exist.
     */
    const sphere = (radius: number, buried: number, bands: number, sides: number): Group => {
      const shell = new THREE.Group();
      const cut = Math.acos(1 - 2 * buried);
      const step = (Math.PI - cut) / bands;
      for (let i = 0; i < bands; i++) {
        const a = cut + i * step;
        const b = a + step;
        // The last band closes on the pole as an exact zero: sin(PI) is 1.2e-16,
        // enough for CylinderGeometry to build a cap of degenerate triangles.
        const top = i === bands - 1 ? 0 : radius * Math.sin(b);
        const band = taper(
          radius * Math.sin(a),
          top,
          radius * (Math.cos(a) - Math.cos(b)),
          stone,
          sides,
        );
        band.position.y = radius * (Math.cos(cut) - Math.cos(a));
        shell.add(band);
      }
      return shell;
    };

    for (let index = 0; index < BOULDERS.length; index++) {
      const it = BOULDERS[index]!;
      const shell = sphere(it.r, it.buried, it.bands, it.sides);
      shell.position.set(it.x, sandTop(it.z) - BED, it.z);
      shell.rotation.y = 0.5 * wobble(index, 0);
      group.add(shell);
    }

    // --- the cracked ones ---

    /**
     * A sphere opened at `BREAK`: two solid bands below, a dark disc on the cut,
     * and a rind of segments standing round it with the near two missing.
     */
    const cracked = (radius: number, buried: number, sides: number): Group => {
      const shell = new THREE.Group();
      const cut = Math.acos(1 - 2 * buried);
      const brink = Math.acos(1 - 2 * BREAK);
      const step = (brink - cut) / 2;

      let lip = 0;
      for (let i = 0; i < 2; i++) {
        const a = cut + i * step;
        const b = a + step;
        const height = radius * (Math.cos(a) - Math.cos(b));
        const band = taper(radius * Math.sin(a), radius * Math.sin(b), height, stone, sides);
        band.position.y = lip;
        shell.add(band);
        lip += height;
      }

      /** Half-width of the break, just under the sphere's own. */
      const rim = radius * Math.sin(brink);

      // The hollow: a disc standing proud of the cut, so it keeps its own ink edge
      // and a low camera cannot hide it, inset to leave a ring of pale shell.
      const inside = column(rim * HOLLOW, HOLLOW_RISE, hollow, sides);
      inside.position.y = lip;
      shell.add(inside);

      shell.add(
        around(RIND.length, (index) => {
          const rise = RIND[index]!;
          if (rise === 0) return null;
          // 4 sides gives a square of half-width `rim * 0.4`; squashing z makes a
          // slab that follows the curve. Wider than the 0.76 slot pitch, so
          // neighbours fuse into one broken wall.
          const plate = taper(rim * 0.4, rim * 0.3, radius * rise, stone, 4);
          plate.scale.z = 0.44;
          // Far enough out to clear the dark disc, close enough to sit on the sphere's silhouette.
          plate.position.set(0, lip - 0.15, rim * 0.88);
          plate.rotation.x = -RIND_LEAN;
          return plate;
        }),
      );

      return shell;
    };

    for (const it of CRACKED) {
      const shell = cracked(it.r, it.buried, CRACKED_SIDES);
      // The tilt turns the opening into the light and is paid for twice: tipping
      // the flat underside drops one side and lifts the other, so the shell sinks
      // by the lift, and its low edge then sits `2 * edge * sin(tilt) + BED` under
      // the surface. That must stay under the sand's depth (0.93 against 1.2) or
      // the model reaches below y = 0.
      const edge =
        (it.r * Math.sin(Math.acos(1 - 2 * it.buried))) / Math.cos(Math.PI / CRACKED_SIDES);
      shell.position.set(it.x, sandTop(it.z) - BED - edge * Math.sin(it.tilt), it.z);
      shell.rotation.set(it.tilt, it.yaw, 0);
      group.add(shell);
    }

    // One plate off the larger cracked boulder, lying where it fell.
    const fallen = new THREE.Group();
    const shard = taper(1.05, 0.6, 2.6, stone, 4);
    shard.scale.z = 0.42;
    // Tipped just past flat, so the ink finds a wedge of shadow under it.
    shard.rotation.x = Math.PI / 2 - 0.16;
    fallen.add(shard);
    fallen.rotation.y = 1.5;
    fallen.position.set(8.9, WET_TOP - BED + 0.44, -0.2);
    group.add(fallen);

    // --- the bank ---

    /**
     * One mass of the bank: `taper` makes a battered square prism, `scale.z`
     * gives it a depth, `yaw` turns it and `roll` tips it so its top edge slopes.
     * A rolled mass lifts one bottom corner, so it is sunk by that much and a
     * whisker more; the low corner is then `width * sin(roll)` deeper, which must
     * stay inside the bed at the crest and above y = 0 at `BANK_FOOT`.
     */
    const mass = (spec: Mass, color: number): Group => {
      const slab = new THREE.Group();
      const mesh = taper(spec.width / 2, (spec.width * spec.batter) / 2, spec.height, color, 4);
      mesh.scale.z = spec.depth / spec.width;
      slab.add(mesh);
      const sink = spec.roll === 0 ? 0 : (Math.abs(Math.sin(spec.roll)) * spec.width) / 2 + 0.1;
      slab.position.set(spec.x, spec.base - sink, spec.front - spec.depth / 2);
      slab.rotation.set(0, spec.yaw, spec.roll);
      return slab;
    };

    for (const spec of BANK) group.add(mass(spec, STRATA[spec.stratum]!));

    for (const slump of SLUMPS) {
      const mound = taper(slump.r, slump.r * 0.45, slump.h, drySand, 6);
      mound.scale.z = 0.45;
      mound.position.set(slump.x, SAND_FOOT, slump.z);
      group.add(mound);
    }

    // A quarter turn about X sends the stack's axis down +Z, so the flat cut faces into the bank.
    const emerging = sphere(IN_BANK.r, IN_BANK.buried, IN_BANK.bands, IN_BANK.sides);
    emerging.rotation.x = Math.PI / 2;
    emerging.position.set(IN_BANK.x, IN_BANK.y, IN_BANK.z);
    group.add(emerging);

    return group;
  },
};

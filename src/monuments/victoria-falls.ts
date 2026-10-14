import type { Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Victoria Falls.
 *
 * Falling water has no silhouette and the toolkit draws neither texture nor
 * motion, so the monument is a shape of land: a flat river, a single straight
 * chasm cut across it, and the water dropping into a slot barely wider than it
 * is deep. In order of importance: the long straight lip (84 of the model's 98
 * units, drawn as a geometric edge and as the boundary between `skyBlue` river
 * and `white` water); the slot (6.8 units against a 27-unit drop, closed at the
 * west end and open at one corner); the facing wall at lip height; five broad
 * water sheets divided by four rock islets; and the spray.
 *
 * Cutaway: from the quarter camera (13.4 degrees up) a near rim of equal height
 * hides the far wall down to 1.9 of its 27 units, and no scaling fixes that. So
 * the land south of the gorge is kept at full lip height at the two ends (the
 * west bluff and Danger Point) and cut between them to a bench an eighth of that
 * height, opening a 68-unit window. Rock faces are two courses, `bark` under
 * `brown`, so the cut reads as a section through basalt. The gorge floor is the
 * ground and the plateau is 27 units above it.
 *
 * Spray: two billows over Main Falls and Rainbow Falls (about a quarter of the
 * brink, since puffs along all of it hid the river), each nine small
 * twelve-sided prisms closed by a `taper` so it reads as a cloud and not a
 * dome, based above 28.2 so none crosses the lip, all `white`. At the foot, five
 * white blocks break the dead horizontal where the curtain meets the bench.
 *
 * Scale: the plan is true (1,708 m of lip, 1 unit to 20.3 m) and the vertical is
 * exaggerated 5.08x (27 units for 108 m), which lands the land at exactly the
 * `MAX_ASPECT` cap (53.88 / 27 = 2.00). The gorge is 6.8 units (about 138 m
 * against 60-120 m) so the walls' outlines do not touch, and Devil's Cataract
 * is 3.4 units wide with its lip 5 units down (really about 38 m). Tier
 * `building`.
 *
 * The curtain's grain is a second normal, not a second colour: each slab is
 * yawed up to 15 degrees so neighbouring panels land on different bands of the
 * same white. `green` marks the spray-fed rainforest on the south rim and
 * `darkOlive` the dry banks.
 */

// --- the block ---

/** East-west extent. The lip runs almost all of it; see `LIP_W` / `LIP_E`. */
const WEST = -49;
const EAST = 49;

/**
 * North edge of the block, and the deeper lobe of river in the middle of it.
 *
 * A horizontal plane seen from 13.4 degrees collapses to `depth * sin(13.4deg)`
 * on screen, so the river is a cyan line along the top of a white curtain and
 * gets everything the footprint will give. A rectangular block runs out of room
 * at its corners (`hypot(49, 22.4) = 53.9` against the 54-unit circle, which is
 * `RIVER_N`), but the middle 60 units step a further 6.6 north to `LOBE_N`,
 * where `hypot(32, 29) = 43.2` has room to spare. That buys 38% more river
 * across the part of the lip that matters.
 */
const RIVER_N = -22.4;
const LOBE_N = -29;
const LOBE_W = -32;
const LOBE_E = 28;

/** The lip: the north wall of the gorge and the line the whole model serves. */
const LIP_Z = -8;

/** Nominal south wall of the gorge. Individual pieces vary either side of it. */
const RIM_Z = -1.2;

/** South edge of the cut bench, and of the promontories that flank it. */
const BENCH_S = 6;
const SOUTH = 16;

/** Plateau top = lip = the height of the facing wall. 27 units for 108 m. */
const LIP_Y = 27;

/** Where the basalt changes course. Every cut face shows this line. */
const COURSE = 12;

/**
 * Top of the water in the gorge, and the lower course of the cut bench. The
 * bench finishes between 3.3 and 3.9, an eighth of the wall it replaces: a tall
 * bench draws a hard horizontal and turns the model into a wall on a plinth.
 */
const FLOOR = 1.4;
const BENCH_Y = 2.2;

/** Top of the rock under the river; the `skyBlue` plate is the 1.8 above it. */
const RIVER_Y = 25.2;

/** Devil's Cataract: its channel and its lip, 5 units down. */
const DEVIL_ROCK = 20.2;
const DEVIL_Y = 22;

/**
 * How far the upper course steps back from the lower one on the model's outer
 * faces (never a gorge wall, which stays sheer), turning four blank cliffs into
 * a stepped escarpment at no extra mesh.
 */
const BATTER = 1.1;

/** The lip's own span. 84 units for 1,708 m: 1 unit to 20.3 m. */
const LIP_W = -46;
const LIP_E = 38;

/**
 * The falls, west to east, in the commonly quoted proportions.
 *
 * `lip` is where this cataract's water leaves the rock; the 0.2-0.4 wobble on
 * the others stops the brink reading as a machined edge. `slabs` is how many
 * vertical pieces the sheet is cut into. Each is yawed a few degrees about its
 * own axis and overlaps its neighbours, so the seam is an edge for the outline
 * and a step in the toon ramp. The counts are low: too many and the curtain stops
 * being one falling mass.
 */
const CATARACTS: ReadonlyArray<{ x0: number; x1: number; lip: number; slabs: number }> = [
  { x0: -46.0, x1: -42.6, lip: DEVIL_Y, slabs: 2 }, // Devil's Cataract
  { x0: -38.0, x1: 2.0, lip: 27.0, slabs: 5 }, //     Main Falls
  { x0: 7.6, x1: 11.0, lip: 26.8, slabs: 2 }, //      Horseshoe Falls
  { x0: 12.8, x1: 32.4, lip: 27.0, slabs: 3 }, //     Rainbow Falls
  { x0: 33.8, x1: 38.0, lip: 26.6, slabs: 2 }, //     Eastern Cataract
];

/**
 * The islands that divide them. `rise` is how far the rock stands above the
 * river; they notch the skyline and their downstream spurs stand proud of every
 * sheet. Only the wooded Cataract Island and Livingstone Island carry their spur
 * the full height (four dark ribs across a white curtain is a colonnade, two is
 * a divided waterfall); the other two spurs stop at 58%.
 */
const ISLETS: ReadonlyArray<{ x0: number; x1: number; rise: number; wooded: boolean }> = [
  { x0: -42.6, x1: -38.0, rise: 2.6, wooded: true }, //  Cataract Island
  { x0: 2.0, x1: 7.6, rise: 3.0, wooded: true }, //      Livingstone Island
  { x0: 11.0, x1: 12.8, rise: 1.6, wooded: false },
  { x0: 32.4, x1: 33.8, rise: 1.4, wooded: false },
];

/**
 * No buttresses stand out of the falls' wall: dark full-height ribs plus island
 * spurs plus slab seams turned the curtain into a colonnade. Nothing that puts
 * a dark vertical stripe on it belongs here.
 */

/**
 * The bench: the cut. Four segments with different north edges, so the near rim
 * of the gorge is ragged where the lip opposite is straight (one is a fault
 * line, the other eroded), and the two edges do not read as parallel rules. The
 * slot survives the fixed cameras only as its width in plan.
 */
const BENCH: ReadonlyArray<{ x0: number; x1: number; z: number; top: number }> = [
  { x0: -42, x1: -24, z: -2.2, top: 3.6 },
  { x0: -24, x1: -8, z: -0.4, top: 3.3 },
  { x0: -8, x1: 8, z: -2.4, top: 3.9 },
  { x0: 8, x1: 26, z: -1.0, top: 3.5 },
];

/**
 * The smoke that thunders, as two billows, each a cluster of small overlapping
 * lumps closed by a `taper`. `base` clears every crest shelf (26.7) so no puff
 * crosses the lip. `r` is the half-width across the flats of a twelve-sided
 * prism, so a puff reaches about 3% further at its corners.
 */
interface Puff {
  x: number;
  z: number;
  r: number;
  base: number;
  h: number;
  /** Closes a stack with a `taper` instead of a `column`, so it does not end flat. */
  cap: boolean;
}

const PLUME: ReadonlyArray<Puff> = [
  { x: -25, z: -3.4, r: 3.6, base: 28.2, h: 3.4, cap: false }, // the billow over Main Falls
  { x: -19, z: -2.4, r: 4.2, base: 28.4, h: 4.0, cap: false },
  { x: -14, z: -3.6, r: 3.0, base: 28.3, h: 3.0, cap: false },
  { x: -23, z: -2.6, r: 3.8, base: 31.2, h: 3.6, cap: false },
  { x: -17, z: -3.2, r: 3.2, base: 31.8, h: 3.2, cap: false },
  { x: -21, z: -2.8, r: 2.8, base: 34.4, h: 3.2, cap: true },
  { x: 18, z: -3.0, r: 2.8, base: 28.4, h: 2.8, cap: false }, //  the lesser one over Rainbow
  { x: 23, z: -2.2, r: 3.2, base: 28.4, h: 3.2, cap: false },
  { x: 20, z: -2.6, r: 2.6, base: 31.0, h: 2.8, cap: true },
];

/** Rocks in the river above the falls, and bush on the ground below the bench. */
const RIVER_ROCKS: ReadonlyArray<{ x: number; z: number; w: number; d: number; h: number }> = [
  { x: -28, z: -13.5, w: 3.6, d: 3.0, h: 1.3 },
  { x: -6.5, z: -16.0, w: 3.0, d: 2.8, h: 1.1 },
  { x: 17.5, z: -12.5, w: 3.2, d: 3.2, h: 1.5 },
];

const BUSH: ReadonlyArray<{ x: number; z: number; w: number; d: number; h: number }> = [
  { x: -36, z: 9.5, w: 7.0, d: 5.0, h: 2.6 },
  { x: -20, z: 12.0, w: 5.0, d: 4.0, h: 3.0 },
  { x: -4, z: 8.5, w: 8.0, d: 5.5, h: 2.2 },
  { x: 12, z: 11.0, w: 6.0, d: 4.5, h: 2.8 },
  { x: 21, z: 13.5, w: 5.0, d: 4.0, h: 2.4 },
];

/**
 * Deterministic pseudo-noise in about [-1, 1], the three-incommensurate-sines
 * trick Uluru uses: the slab widths must vary or the curtain is a comb. Never
 * `Math.random`: the loader builds twice and compares.
 */
function grain(i: number, seed: number): number {
  return (
    Math.sin(i * 1.7 + seed) * 0.55 +
    Math.sin(i * 0.61 + seed * 2.3) * 0.3 +
    Math.sin(i * 3.13 + seed * 0.7) * 0.15
  );
}

export const victoriaFalls: Monument = {
  id: 'victoria-falls',
  name: 'Victoria Falls',
  iso: 'ZWE',
  lat: -17.925,
  lon: 25.858,
  // No `realHeight`: the falls have no single height (108 m at Rainbow Falls, 70 at Devil's Cataract).
  tier: 'building',
  footprint: 54,

  build(ctx) {
    const { THREE, palette, box, column, taper } = ctx;
    const rockLow = palette.bark; //     the shadowed lower course, and the islet spurs
    const rockHigh = palette.brown; //   the sunlit upper course and the cut bench
    const river = palette.skyBlue; //    flat water, above the lip only
    const foam = palette.white; //       aerated water: the sheets, the crests, the plume
    const forest = palette.green; //     the spray-fed rainforest on the south rim
    const bush = palette.darkOlive; //   dry mopane everywhere else

    const group = new THREE.Group();

    /**
     * Every rectangular mass, given as the box it occupies rather than a size and
     * a position, since almost nothing here is centred on anything.
     */
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

    // --- the north block: the river, the lip, and the wall the falls hang on ---
    // One lower course across the whole width and an upper course stepped back by
    // `BATTER` at the two ends. The falls' wall stays sheer top to bottom.
    slab(WEST, EAST, RIVER_N, LIP_Z, 0, COURSE, rockLow);

    // West bank: the plateau closing the gorge's blind end.
    slab(WEST + BATTER, LIP_W, RIVER_N, LIP_Z, COURSE, LIP_Y - 1.0, rockHigh);
    slab(WEST + BATTER, LIP_W, RIVER_N, LIP_Z, LIP_Y - 1.0, LIP_Y + 0.6, bush);
    // Devil's Cataract's channel, cut 5 units into the plateau.
    slab(LIP_W, -42.6, RIVER_N, LIP_Z, COURSE, DEVIL_ROCK, rockHigh);
    slab(LIP_W, -42.6, RIVER_N, LIP_Z, DEVIL_ROCK, DEVIL_Y, river);
    // The Zambezi.
    slab(-42.6, LIP_E, RIVER_N, LIP_Z, COURSE, RIVER_Y, rockHigh);
    slab(-42.6, LIP_E, RIVER_N, LIP_Z, RIVER_Y, LIP_Y, river);
    // East bank, above the Boiling Pot.
    slab(LIP_E, EAST - BATTER, RIVER_N, LIP_Z, COURSE, LIP_Y - 1.0, rockHigh);
    slab(LIP_E, EAST - BATTER, RIVER_N, LIP_Z, LIP_Y - 1.0, LIP_Y + 0.6, bush);
    // The lobe: the same three layers again, stepped north. See `LOBE_N`.
    slab(LOBE_W, LOBE_E, LOBE_N, RIVER_N, 0, COURSE, rockLow);
    slab(LOBE_W, LOBE_E, LOBE_N, RIVER_N, COURSE, RIVER_Y, rockHigh);
    slab(LOBE_W, LOBE_E, LOBE_N, RIVER_N, RIVER_Y, LIP_Y, river);

    for (const rock of RIVER_ROCKS) {
      slab(
        rock.x - rock.w / 2,
        rock.x + rock.w / 2,
        rock.z - rock.d / 2,
        rock.z + rock.d / 2,
        RIVER_Y,
        LIP_Y + rock.h,
        rockHigh,
      );
    }

    // --- the two gorges: the first runs the length of the lip and is closed at both
    // ends; the second leaves it at the east corner at right angles and runs off the model ---
    slab(LIP_W, 42, LIP_Z, RIM_Z, 0, FLOOR, foam);
    slab(36, 42, RIM_Z, SOUTH - BATTER, 0, FLOOR, foam);

    // --- the west end: the blind end of the trough, and the bluff above it ---
    slab(WEST, LIP_W, LIP_Z, RIM_Z, 0, COURSE, rockLow);
    slab(WEST + BATTER, LIP_W, LIP_Z, RIM_Z, COURSE, LIP_Y, rockHigh);
    slab(WEST, -42, -2.4, SOUTH, 0, COURSE, rockLow);
    slab(WEST + BATTER, -42, -2.4, 9, COURSE, LIP_Y, rockHigh);
    slab(WEST + BATTER, -42, -2.4, 9, LIP_Y, LIP_Y + 1.2, forest);
    // A shoulder falling away from the rim, so the promontory is a landform and not a box.
    slab(WEST + BATTER, -42, 9, SOUTH - BATTER, COURSE, 19, rockHigh);
    slab(WEST + BATTER, -42, 9, SOUTH - BATTER, 19, 20.2, bush);

    // --- the bench: the cut ---
    for (const seg of BENCH) {
      slab(seg.x0, seg.x1, seg.z, BENCH_S, 0, BENCH_Y, rockLow);
      slab(seg.x0, seg.x1, seg.z, BENCH_S, BENCH_Y, seg.top, rockHigh);
    }

    // --- Danger Point: the promontory between the two gorges ---
    slab(26, 36, -3.2, SOUTH, 0, COURSE, rockLow);
    slab(26, 36, -3.2, 8.5, COURSE, LIP_Y, rockHigh);
    slab(26, 36, -3.2, 8.5, LIP_Y, LIP_Y + 1.2, forest);
    slab(26, 36, 8.5, SOUTH - BATTER, COURSE, 20, rockHigh);
    slab(26, 36, 8.5, SOUTH - BATTER, 20, 21.2, bush);

    // --- the land beyond the second gorge, closing the trough's east end ---
    slab(42, EAST, LIP_Z, SOUTH, 0, COURSE, rockLow);
    // Full height where it dams the trough's east end, then falling away south of the bend.
    slab(42, EAST - BATTER, LIP_Z, RIM_Z, COURSE, LIP_Y - 1.0, rockHigh);
    slab(42, EAST - BATTER, LIP_Z, RIM_Z, LIP_Y - 1.0, LIP_Y + 0.6, bush);
    slab(42, EAST - BATTER, RIM_Z, SOUTH - BATTER, COURSE, 22, rockHigh);
    slab(42, EAST - BATTER, RIM_Z, SOUTH - BATTER, 22, 23.4, bush);

    // --- the water ---
    for (const [index, fall] of CATARACTS.entries()) {
      // The crest: a shelf of white breaking over the brink and overhanging the
      // curtain, which draws the lip as a line. Its top sits 0.3 below the river:
      // anything standing above the water occludes `height / tan(13.4deg)` of river
      // behind it. It projects 3.4 into the gorge against the sheets' 2.0, so its
      // top face catches the sun as a band brighter than the curtain. It runs
      // `PROUD` into the rock at either end so flush faces of two colours do not flicker.
      slab(fall.x0 - PROUD, fall.x1 + PROUD, LIP_Z - 0.6, LIP_Z + 3.4, fall.lip - 2.0, fall.lip - 0.3, foam);

      // The sheet, cut into overlapping slabs of alternating depth and yawed a few
      // degrees each; widths are drifted off the even division so the streaks are
      // not a picket fence.
      const span = fall.x1 - fall.x0;
      const edges: number[] = [fall.x0];
      for (let j = 1; j < fall.slabs; j++) {
        const even = fall.x0 + (span * j) / fall.slabs;
        edges.push(even + grain(index * 7 + j, 2.6) * (span / fall.slabs) * 0.5);
      }
      edges.push(fall.x1);

      for (let j = 0; j < fall.slabs; j++) {
        const wobble = grain(index * 5 + j, 8.2);
        const sheet = slab(
          // Half a unit of overlap each side: yawing a slab opens a hairline that shows the black wall behind.
          edges[j]! - 0.5,
          edges[j + 1]! + 0.5,
          LIP_Z,
          LIP_Z + 1.5 + (j % 2) * 0.5,
          0.9,
          // `PROUD` under the lip, or the yawed top lies in the plane of the river's surface.
          fall.lip - PROUD,
          foam,
        );
        sheet.rotation.y = wobble * 0.26;
      }
    }

    // The churn where the water lands: five blocks 1 to 2 units proud of the cut
    // bench, whose tops break the dead horizontal the curtain would meet it in.
    slab(-38, -18, LIP_Z + 1.4, -2.6, 0, 6.0, foam);
    slab(-18, 2, LIP_Z + 1.4, -2.2, 0, 5.2, foam);
    slab(12.8, 23, LIP_Z + 1.4, -2.6, 0, 5.6, foam);
    slab(23, 32.4, LIP_Z + 1.4, -2.2, 0, 4.6, foam);
    slab(-46, -42.6, LIP_Z + 1.4, -3.2, 0, 4.4, foam);

    // --- the islands, and the spurs they trail into the gorge ---
    for (const islet of ISLETS) {
      // The spur stands proud of every sheet, so the ink separates one cataract
      // from the next all the way down. Only the two real islands get a full-height one.
      const spur = islet.wooded ? LIP_Y : LIP_Y * 0.58;
      slab(islet.x0, islet.x1, LIP_Z, LIP_Z + 2.7, 0, spur, rockLow);
      // The island itself, standing out of the river and notching the skyline.
      const top = LIP_Y + islet.rise;
      const [a, b] = [islet.x0 - 0.3, islet.x1 + 0.3];
      slab(a, b, LIP_Z - 6.5, LIP_Z + 0.6, RIVER_Y - 1.4, top, rockLow);
      if (islet.wooded) {
        slab(a, b, LIP_Z - 6.5, LIP_Z + 0.6, top, top + 1.3, forest);
      }
    }

    // --- the spray ---
    for (const puff of PLUME) {
      const cloud = puff.cap
        ? taper(puff.r, puff.r * 0.5, puff.h, foam, 12)
        : column(puff.r, puff.h, foam, 12);
      cloud.position.set(puff.x, puff.base, puff.z);
      group.add(cloud);
    }

    // --- bush on the flat below the cut, which is what gives the cliff a scale ---
    for (const clump of BUSH) {
      slab(
        clump.x - clump.w / 2,
        clump.x + clump.w / 2,
        clump.z - clump.d / 2,
        clump.z + clump.d / 2,
        0,
        clump.h,
        clump.x > 0 ? forest : bush,
      );
    }

    return group;
  },
};

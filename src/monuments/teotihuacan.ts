import { PROUD } from './contract.ts';
import type { Group, Monument, MonumentContext } from './contract.ts';

/**
 * Teotihuacan, the Pyramid of the Sun on the Avenue of the Dead.
 *
 * The Sun pyramid keeps its proportions and the avenue is cropped by the
 * footprint circle at both ends, rather than dropping the Pyramid of the Moon
 * into a shrunken token. `MAX_ASPECT` is measured on the half-diagonal, so a
 * square pyramid alone can be at best 2.83:1 (base to height); the real one is
 * 225 m by 65 m (3.46), unbuildable at true proportions in any tier. With an
 * avenue the best it can hold is 1.93, the shape of El Castillo
 * (`chichen-itza.ts`, 1.75), which it must not be confused with.
 *
 * Plan scale is true, 0.302 units/m (68-unit base, the avenue 12.5 units wide
 * for a real ~40 m). Vertical is 0.431 units/m, 1.43x exaggerated, forced by the
 * aspect rule: the model measures 54.2 of radius, so the summit must reach
 * 27.1 (base:height 2.43). The faces run at 47 degrees against about 39 in
 * life, which is bought back with five tiers rather than nine, so every
 * shoulder reads as a shoulder, and a bare 18-unit summit (no temple stands on
 * either pyramid, and none is invented).
 *
 * Colour separates it from El Castillo: the pyramid is `bark` (dark volcanic
 * rock) and the lime (`sand`) is spent only on the stairway, the cornices and
 * the street's floor.
 *
 * No `realHeight`: the site is a city of twenty square kilometres.
 *
 * Left out: the Pyramid of the Moon and the avenue's far end, the Ciudadela, the
 * forecourt (squeezed to about 12 units) and the carved relief on the tableros.
 */

// --- the Pyramid of the Sun ---

/** Half-width across the flats at the ground. 68 units of base for 225 m. */
const BASE = 34;
/** The truncated summit: 17 units, about 56 m, and nothing standing on it. */
const SUMMIT = 8.5;
/** Top of the summit slab. Set by the aspect rule, not by the pyramid. */
const HEIGHT = 28;
const CAP = 0.8;
const BODY = HEIGHT - CAP;

/**
 * Five sloping bodies, each capped by a vertical band of plaster. Fewer, deeper
 * steps read as shoulders instead of stairs.
 */
const TALUD = [5.9, 5.25, 4.75, 4.2, 3.6];
const LEDGE = 0.7;
/** How far a band stands proud of the body above it: the ledge the ink catches. */
const LIP = 0.55;

// --- the one stairway, on the west face ---
/**
 * Ten steps, not the real flight's hundred and some. A unit is about two pixels
 * on a card, and fourteen steps left under two pixels of visible tread; at 2.7
 * the flight reads as stairs.
 */
const STEPS = 10;
const STEP_RISE = BODY / STEPS;
const STEP_RUN = 5.2;
const STAIR_HALF = 4.8;
const STAIR_PROUD = 1.6;
const RAIL = 1.9;
const RAIL_Z = STAIR_HALF + RAIL / 2;
const RAIL_FOOT = 1.9;

/** The face as a straight line, for hanging the stair and its alfardas off. */
const SLOPE = (BASE - SUMMIT) / BODY;
const faceX = (y: number): number => -(BASE - SLOPE * y);

// --- the Adosada, the low platform built against the foot of that stair ---
const ADOSADA_OUT = 3.5;
const ADOSADA_WING = 7.4;
const ADOSADA_TALUD = 5.2;

// --- the Avenue of the Dead ---

/**
 * The pyramid sits east of the street, so the model is shifted east until its
 * two farthest points (the pyramid's far corner and the outer edge of the near
 * terrace) reach the same radius. That balance holds the measured radius at 54.2.
 */
const PYRAMID_X = 8.2;
const AVENUE_X = -35.55;
const AVENUE_WIDE = 12.5;
const AVENUE_LONG = 69;
/**
 * Past the last cross-wall the street narrows to a tongue and the far wall runs
 * on alone to 84: the circle is 54.2 across the middle of the avenue and 45 at
 * its inner edge, so length out there can only be bought with width.
 */
const AVENUE_TAIL = 5.5;
const TAIL_WIDE = 6;
const FAR_KERB_LONG = 84;
const PAVING = 0.5;

/**
 * Kerbs down both edges of the paving, and cross-walls across it. The fixed
 * cameras sit 13 degrees above the ground, so flat paving is foreshortened to
 * 0.23 of its width and vanishes; the street is drawn by its edges (two kerb
 * lines, a rank outside each, the cross-walls of the sunken courts between) and
 * the paving is only the colour they enclose.
 */
const KERB = 0.9;
const FAR_KERB = 2.2;
/** The avenue climbs north through a chain of sunken courts. */
const CROSS_Z = [-25, -8.5, 8.5, 25];

/**
 * The two ranks are unequal because of the camera. A platform of height `h`
 * covers `h / tan(13.5 deg)` = 4h of ground behind it, so the west side, between
 * the lens and the street, is one long 1.9-unit terrace, and the height goes to
 * the far rank against the pyramid's foot. The standard photograph is taken from
 * the west side of the avenue, looking east.
 */
const ROW_X = -43.6;
const ROW_DEEP = 4;
/**
 * The near terrace is one unbroken run, and short: at 1.95 units it hides eight
 * of the 12.5-unit street. Its length is set by the circle (at 46 units out in
 * x there are only 28.6 left in z).
 */
const ROW_LONG = 55;
const ROW_STAIR_Z = [-19, 0, 19];

/** The east rank, in the Plaza of the Sun, so the street is lined on both sides. */
const PLAZA_X = -27.5;
const PLAZA_DEEP = 3.5;
const PLAZA_Z = [-31, -23.5, -16, 16, 23.5, 31];

/**
 * How far the site is turned inside the group; the avenue chooses the angle.
 * The quarter camera stands 32 degrees right of +Z, so a street at azimuth
 * `TURN` shows `sin(TURN - 32)` of its length across the frame. At 72 degrees
 * that is 0.64, with 0.77 of the length still in depth. The stair face follows
 * at 18 degrees left of +Z (0.65 of full-on to the quarter camera, 0.95 to the
 * front one). The turn lives on a child group; the monument's own transform
 * stays identity, as the contract requires.
 */
const TURN = (72 * Math.PI) / 180;

export const teotihuacan: Monument = {
  id: 'teotihuacan',
  name: 'Teotihuacan',
  iso: 'MEX',
  lat: 19.692,
  lon: -98.844,
  // No realHeight: a city has no height.
  tier: 'building',
  footprint: 54.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, taper, strut } = ctx;
    // The material story: dark volcanic rock and tezontle, with lime reserved for the stairway, the cornices and the street.
    const stone = palette.bark; // bare volcanic rock, and the pyramid alone
    const weathered = palette.tan; // terrace bands, summit, kerbs, cross-walls
    const plaster = palette.sand; // lime: the stair, the cornices, the paving
    const painted = palette.clay; // the red the tableros and alfardas carried
    const built = palette.brown; // the taluds of every platform but the pyramid
    const shade = palette.darkOlive; // the step down into each sunken court

    const group = new THREE.Group();
    const site = new THREE.Group();
    site.rotation.y = TURN;
    group.add(site);

    /**
     * One talud-tablero platform: a sloping batter, a vertical panel above it and
     * an overhanging cornice, which puts a hard ink line and a band of shadow
     * across every low building. The talud is a unit square prism stretched by
     * the wrapper. Its colour is `brown`, not the pyramid's `bark`, since the east
     * rank stands against the pyramid's foot.
     */
    const platform = (
      width: number,
      depth: number,
      talud: number,
      panel: number,
    ): Group => {
      const batter = 0.16;
      const made = new THREE.Group();

      const wrap = new THREE.Group();
      wrap.add(taper(1, 1 - batter, talud, built, 4));
      wrap.scale.set(width / 2, 1, depth / 2);
      made.add(wrap);

      const px = width * (1 - batter);
      const pz = depth * (1 - batter);
      const face = box(px, panel, pz, painted);
      face.position.y = talud;
      made.add(face);

      const cornice = box(px + 0.9, 0.45, pz + 0.9, plaster);
      cornice.position.y = talud + panel;
      made.add(cornice);

      return made;
    };

    // --- the pyramid: five bodies, each closed by a plaster band ---
    const pyramid = new THREE.Group();
    pyramid.position.x = PYRAMID_X;
    site.add(pyramid);

    let y = 0;
    let half = BASE;
    for (let i = 0; i < TALUD.length; i++) {
      const tier = TALUD[i]! + LEDGE;
      const top = half - ((BASE - SUMMIT) * tier) / BODY;

      const body = taper(half, top, TALUD[i]!, stone, 4);
      body.position.y = y;
      pyramid.add(body);

      // Wider than the body it caps and the one above, so every tier ends on a ledge.
      const band = box((top + LIP) * 2, LEDGE, (top + LIP) * 2, weathered);
      band.position.y = y + TALUD[i]!;
      pyramid.add(band);

      y += tier;
      half = top;
    }

    // The summit: flat, generous and empty.
    const crown = box((SUMMIT + 0.6) * 2, CAP, (SUMMIT + 0.6) * 2, weathered);
    crown.position.y = BODY;
    pyramid.add(crown);

    // --- the stairway ---
    for (let i = 0; i < STEPS; i++) {
      const at = i * STEP_RISE;
      const front = faceX(at) - STAIR_PROUD;
      // Deep enough to bury itself in the bodies behind, so only the tread and riser show.
      const step = box(STEP_RUN, STEP_RISE, STAIR_HALF * 2, plaster);
      step.position.set(front + STEP_RUN / 2, at, 0);
      pyramid.add(step);
    }

    for (const side of [1, -1]) {
      const foot = faceX(RAIL_FOOT) - STAIR_PROUD + 0.6;
      const head = faceX(BODY) - STAIR_PROUD + 0.6;
      pyramid.add(
        strut(
          new THREE.Vector3(foot, RAIL_FOOT, side * RAIL_Z),
          new THREE.Vector3(head, BODY, side * RAIL_Z),
          RAIL,
          painted,
        ),
      );
      // The alfarda is a beam centred on its own axis, so its lower end hangs below
      // y = 0; this block covers it, as the real balustrades end squared off.
      const block = box(4.6, RAIL_FOOT + 0.4, RAIL + 0.8, weathered);
      block.position.set(foot + 0.65, 0, side * RAIL_Z);
      pyramid.add(block);
    }

    // --- the Adosada, split by the stair into two wings ---
    for (const side of [1, -1]) {
      const wing = platform(ADOSADA_OUT, ADOSADA_WING, ADOSADA_TALUD, 1.6);
      wing.position.set(
        -BASE - ADOSADA_OUT / 2,
        0,
        side * (RAIL_Z + RAIL / 2 + ADOSADA_WING / 2),
      );
      pyramid.add(wing);
    }

    // --- the street ---
    const paving = box(AVENUE_WIDE, PAVING, AVENUE_LONG, plaster);
    paving.position.set(AVENUE_X, 0, 0);
    site.add(paving);

    // The two lines that actually draw the avenue, inside the paving's edge (which sets the model's radius).
    for (const side of [1, -1]) {
      // Unequal like the ranks: the far wall is a wall and the near one a kerb; the far one is the longest thing in the model.
      const far = side > 0;
      const kerb = box(0.9, far ? FAR_KERB : KERB, far ? FAR_KERB_LONG : AVENUE_LONG, weathered);
      kerb.position.set(AVENUE_X + side * (AVENUE_WIDE / 2 - 0.45), PAVING, 0);
      site.add(kerb);
    }

    for (const end of [1, -1]) {
      const tail = box(TAIL_WIDE, PAVING, AVENUE_TAIL, plaster);
      tail.position.set(
        AVENUE_X + AVENUE_WIDE / 2 - TAIL_WIDE / 2,
        0,
        end * (AVENUE_LONG / 2 + AVENUE_TAIL / 2),
      );
      site.add(tail);
    }

    for (const z of CROSS_Z) {
      const wall = box(AVENUE_WIDE, 1.8, 1.6, weathered);
      wall.position.set(AVENUE_X, PAVING, z);
      site.add(wall);
      // The floor on the far side of each wall, a step lower and darker, so the avenue
      // climbs through enclosed courts. Its far edge stops `PROUD` short so two colours do not share a plane.
      const sill = box(AVENUE_WIDE - 2.2, 0.35, 2.4 - PROUD, shade);
      sill.position.set(AVENUE_X, PAVING, z - 2 + PROUD / 2);
      site.add(sill);
    }

    // An altar in the middle of each court, so the paving is not one empty slab.
    for (const z of [-16.75, 0, 16.75]) {
      const altar = box(3.2, 1, 3.2, built);
      altar.position.set(AVENUE_X, PAVING, z);
      site.add(altar);
      const top = box(3.9, 0.4, 3.9, plaster);
      top.position.set(AVENUE_X, PAVING + 1, z);
      site.add(top);
    }

    // --- the near side: one long low terrace, and three stairs off the street ---
    const terrace = platform(ROW_DEEP, ROW_LONG, 0.9, 0.6);
    terrace.position.set(ROW_X, 0, 0);
    site.add(terrace);

    for (const z of ROW_STAIR_Z) {
      const steps = box(2.2, 0.9, 3.4, plaster);
      steps.position.set(ROW_X + ROW_DEEP / 2 + 1.1, 0, z);
      site.add(steps);
    }

    // --- the far rank, standing against the pyramid's foot ---
    for (const z of PLAZA_Z) {
      const court = platform(PLAZA_DEEP, 6.4, 3.4, 2.2);
      court.position.set(PLAZA_X, 0, z);
      site.add(court);

      // Each fronts the street with a stair; six give the avenue its beat.
      const steps = box(2.4, 2.2, 3.4, plaster);
      steps.position.set(PLAZA_X - PLAZA_DEEP / 2 - 1.2, 0, z);
      site.add(steps);
    }

    return group;
  },
};

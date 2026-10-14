import { PROUD } from './contract.ts';
import type { Monument, Mesh } from './contract.ts';

/**
 * The Alhambra, Granada.
 *
 * Modelled as the fortress line seen from Granada, not the Court of the Lions
 * (a room, invisible from outside): the red curtain wall on the Sabika ridge
 * with square crenellated towers, and three low palace blocks whose hipped
 * `orange` roofs show over the parapet. Six towers, no two alike in width or
 * height (the irregularity is the identity); Torre de la Vela at the west end
 * and Torre de Comares (33.2, the tallest) near the east are the two anchors.
 * The ridge is six stepped `darkOlive` plinths; wall and parapet step in
 * different places.
 *
 * Three scales: along the ridge 1 unit is 3.5 m (330 m become 93 units), up
 * 1 unit is 1.5 m, across a building about 1.6 m. The distance between
 * buildings is compressed 2.4x so the aspect rule holds (half-diagonal 47.3
 * against 33.2 high). The crenellation is oversize on purpose (1.7 units of
 * merlon on a 2.7 pitch); nearer life it smears grey at thumbnail size.
 *
 * All masonry is one `clay`; the other colours are other materials (`darkOlive`
 * rock, `orange` tile, `ink` openings, `green` cypresses). The rock is
 * `darkOlive` because neutrals go cold in the hemisphere light and `brown` is
 * too close to `clay`. Tier `building`: the only one whose footprint holds a
 * 93-unit run. Left out: Charles V's palace, the Puerta de la Justicia, the
 * scarp's woods.
 */

// --- the ridge -------------------------------------------------------------

/** The front is +Z: the north face, the one Granada looks at from the Albaicín. */
const WALL_Z = 1.2;
/** Half-thickness of the curtain wall. */
const WALL_D = 2.0;
/** How far the rock terrace stands out in front of the wall's foot. */
const ROCK_FRONT = 4.6;

/**
 * A step of the ridge: rock from y = 0 to `top`. West (+X) is on the right of
 * the front view. The end faces are vertical cuts of a longer ridge.
 */
interface Step {
  x0: number;
  x1: number;
  top: number;
  /** How far back the terrace runs. Only the palace stretch is deep. */
  back: number;
}

const STEPS: Step[] = [
  { x0: 36.0, x1: 46.6, top: 5.4, back: -4.0 }, // the western prow, under the Vela
  { x0: 16.0, x1: 36.0, top: 4.8, back: -5.0 }, // the Alcazaba's rock
  { x0: 8.0, x1: 16.0, top: 2.4, back: -5.0 }, // the ravine at the Plaza de los Aljibes
  { x0: -31.0, x1: 8.0, top: 4.0, back: -11.0 }, // the palace terrace, the deep one
  { x0: -40.0, x1: -31.0, top: 2.6, back: -8.0 }, // the Partal
  { x0: -46.6, x1: -40.0, top: 1.0, back: -4.0 }, // falling away east
];

/**
 * The two anchor towers stand on spurs of rock in front of the terrace line.
 * Each spur's face stands `PROUD` in front of its tower's, or they would share a
 * plane.
 */
const SPURS: { x: number; w: number; h: number; z: number; d: number }[] = [
  { x: 42.0, w: 9.6, h: 5.4, z: 4.5 + PROUD / 2, d: 1.8 + PROUD }, // Torre de la Vela
  { x: -24.0, w: 11.6, h: 4.0, z: 4.6 + PROUD / 2, d: 2.4 + PROUD }, // Torre de Comares
];

// --- the towers ------------------------------------------------------------

interface Tower {
  /** For the reader. Nothing in the model uses it. */
  name: string;
  x: number;
  /** Half-width along the ridge, and half-depth across it. */
  hw: number;
  hd: number;
  /** Foot, always buried in the step below it, and the top of the masonry. */
  base: number;
  shaft: number;
  /** Top of the merlons. */
  crown: number;
  /** Apex of the tiled roof inside the crenellations, or 0 for none. */
  roof: number;
  /** A string course under the merlons: one extra ink line across the tower. */
  cornice: boolean;
  /** Merlons on the two flanks as well, so the quarter view is not a bare box. */
  flanks: boolean;
}

/**
 * Six towers, west to east. No two share a width or a height, and the intervals
 * are as uneven: three bunched inside 29 units at the Alcazaba end, then 21
 * units of low wall over the ravine, then the palace end.
 */
const TOWERS: Tower[] = [
  // The Alcazaba: three towers bunched on the western prow.
  {
    name: 'Torre de la Vela',
    x: 42.0, hw: 4.4, hd: 4.2, base: 4.5, shaft: 22.5, crown: 24.8,
    roof: 0, cornice: true, flanks: true,
  },
  {
    name: 'Torre Quebrada',
    x: 31.0, hw: 2.8, hd: 2.8, base: 4.0, shaft: 16.4, crown: 18.2,
    roof: 0, cornice: false, flanks: false,
  },
  {
    name: 'Torre del Homenaje',
    // 3.3 deep, not 3.4, so its face stands 0.1 behind the rock's at 4.6
    // rather than sharing that plane in another colour.
    x: 21.5, hw: 3.6, hd: 3.3, base: 4.0, shaft: 18.6, crown: 20.8,
    roof: 0, cornice: true, flanks: true,
  },
  // Then twenty-one units of low wall over the ravine, and the palaces begin.
  {
    name: 'Torre de Machuca',
    x: -6.0, hw: 2.4, hd: 2.6, base: 3.4, shaft: 16.8, crown: 18.4,
    roof: 0, cornice: false, flanks: false,
  },
  {
    name: 'Torre de Comares',
    x: -24.0, hw: 5.2, hd: 4.6, base: 3.4, shaft: 29.5, crown: 32.4,
    roof: 33.2, cornice: true, flanks: true,
  },
  {
    name: 'Torre de las Damas',
    x: -35.0, hw: 2.6, hd: 2.9, base: 2.0, shaft: 14.4, crown: 16.0,
    roof: 18.2, cornice: false, flanks: false,
  },
];

// --- the curtain between them ---------------------------------------------

/** A stretch of wall. `base` is always under the rock it stands on, so it buries. */
interface Curtain {
  x0: number;
  x1: number;
  base: number;
  top: number;
}

/**
 * Eight stretches. The parapet steps down into the ravine (8.4) and along the
 * eastern tail (8.6); the rock steps in other places.
 */
const CURTAINS: Curtain[] = [
  { x0: 33.6, x1: 37.6, base: 4.2, top: 11.6 },
  { x0: 25.0, x1: 28.4, base: 4.0, top: 11.0 },
  { x0: 12.0, x1: 18.1, base: 3.0, top: 10.2 },
  { x0: 3.8, x1: 12.2, base: 1.6, top: 8.4 }, // over the ravine
  { x0: -3.8, x1: 4.0, base: 3.0, top: 10.8 },
  { x0: -19.0, x1: -8.2, base: 3.2, top: 11.4 }, // the palace stretch
  { x0: -32.6, x1: -28.6, base: 2.4, top: 10.6 },
  // The tail, trailing off east; it stops `PROUD` short of the rock's end,
  // whose end face it shared.
  { x0: -46.6 + PROUD, x1: -37.2, base: 0.4, top: 8.6 },
];

// --- crenellation ----------------------------------------------------------

/**
 * Merlon pitch, width and height: about four pixels of tooth and two and a half
 * of gap in a 260-pixel thumbnail, the smallest that still reads as crenellation.
 */
const MERLON_PITCH = 2.7;
const MERLON_W = 1.7;
const MERLON_H = 1.5;
/** Merlons sit on the outer edge of the wall walk, not across its whole width. */
const MERLON_D = 2.2;

// --- what shows behind the parapet -----------------------------------------

/**
 * The palace blocks and their roofs. `top` is the block; `apex` is the ridge of
 * the hipped roof, which clears the curtain in front of it (all but the smallest).
 */
interface Palace {
  x: number;
  z: number;
  w: number;
  d: number;
  base: number;
  top: number;
  apex: number;
  /** Ridge length as a fraction of the eave. 1 would be a flat lid, 0 a pyramid. */
  ridge: number;
}

const PALACES: Palace[] = [
  // The Comares palace, round the Court of the Myrtles: sited to show in the
  // ten-unit gap between the Comares tower and Machuca, not behind the tower.
  { x: -13.5, z: -5.4, w: 15.0, d: 8.4, base: 3.0, top: 11.0, apex: 14.8, ridge: 0.55 },
  // The Court of the Lions block, at the palaces' western edge.
  { x: 0.0, z: -4.8, w: 11.0, d: 7.4, base: 3.0, top: 9.6, apex: 13.4, ridge: 0.55 },
  // The Partal, lower and further east.
  { x: -31.5, z: -3.6, w: 8.0, d: 5.2, base: 2.2, top: 8.6, apex: 12.0, ridge: 0.5 },
];

// --- openings --------------------------------------------------------------

/** A dark opening on a front face: x, sill, half-width, height, and the face's z. */
interface Opening {
  x: number;
  y: number;
  hw: number;
  h: number;
  z: number;
}

/**
 * Twelve windows, few on purpose: the north face is almost blind. They give the
 * Comares tower its scale.
 */
const OPENINGS: Opening[] = [
  // Torre de Comares: two storeys of paired windows on the north face.
  { x: -26.4, y: 17.5, hw: 0.7, h: 3.0, z: 5.8 },
  { x: -21.6, y: 17.5, hw: 0.7, h: 3.0, z: 5.8 },
  { x: -26.4, y: 23.5, hw: 0.7, h: 3.0, z: 5.8 },
  { x: -21.6, y: 23.5, hw: 0.7, h: 3.0, z: 5.8 },
  // Torre de la Vela.
  { x: 40.8, y: 14.0, hw: 0.55, h: 2.2, z: 5.4 },
  { x: 43.2, y: 14.0, hw: 0.55, h: 2.2, z: 5.4 },
  { x: 42.0, y: 18.6, hw: 0.6, h: 2.4, z: 5.4 },
  // Torre del Homenaje.
  { x: 21.5, y: 12.0, hw: 0.6, h: 2.4, z: 4.5 },
  // The Partal loggia, under its own tiled roof.
  { x: -35.9, y: 9.6, hw: 0.55, h: 2.2, z: 4.1 },
  { x: -34.1, y: 9.6, hw: 0.55, h: 2.2, z: 4.1 },
  // Two slits in the curtain, one either side of the ravine.
  { x: 15.0, y: 7.0, hw: 0.4, h: 1.8, z: 3.2 },
  { x: -12.0, y: 8.0, hw: 0.4, h: 1.8, z: 3.2 },
];

// --- the Vela's bell-cote --------------------------------------------------

/**
 * The espadaña on the Torre de la Vela. Drawn at the building scale (3.4 across
 * by 4.1 tall, roughly 5.5 m by 6) so it still notches the skyline.
 */
const BELL_X = 42.0;
const BELL_BASE = 24.8;

// --- planting --------------------------------------------------------------

/** The elm woods and the Generalife's cypresses, reduced to five cones. */
const CYPRESSES: { x: number; z: number; r: number; h: number }[] = [
  { x: -41.0, z: 5.2, r: 1.0, h: 6.4 },
  { x: -29.5, z: 5.6, r: 1.1, h: 7.2 },
  { x: -16.5, z: 5.4, r: 0.95, h: 6.0 },
  { x: 19.0, z: 5.2, r: 1.0, h: 6.4 },
  { x: 24.5, z: 5.8, r: 0.85, h: 5.2 },
];

export const alhambra: Monument = {
  id: 'alhambra',
  name: 'Alhambra',
  iso: 'ESP',
  lat: 37.176,
  lon: -3.588,
  // No `realHeight`: the source list gives none (the towers differ, 45 m and 27 m).
  tier: 'building',
  footprint: 48,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;
    const tapia = palette.clay; // every piece of masonry, without exception
    const rock = palette.darkOlive; // the ridge
    const tile = palette.orange; // the roofs, and only the roofs
    const dark = palette.ink; // openings
    const cypress = palette.green;

    const group = new THREE.Group();
    const put = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };

    // --- the ridge ---
    for (const step of STEPS) {
      const depth = ROCK_FRONT - step.back;
      put(
        box(step.x1 - step.x0, step.top, depth, rock),
        (step.x0 + step.x1) / 2,
        0,
        ROCK_FRONT - depth / 2,
      );
    }
    for (const spur of SPURS) put(box(spur.w, spur.h, spur.d, rock), spur.x, 0, spur.z);

    /** A run of merlons along X, spaced to fit the span so no stretch ends in a half tooth. */
    const crenellate = (x0: number, x1: number, y: number, z: number, depth: number): void => {
      const span = x1 - x0;
      const count = Math.max(1, Math.round(span / MERLON_PITCH));
      const pitch = span / count;
      for (let index = 0; index < count; index++) {
        put(box(MERLON_W, MERLON_H, depth, tapia), x0 + pitch * (index + 0.5), y, z);
      }
    };

    // --- the curtain, and its parapet ---
    for (const curtain of CURTAINS) {
      const width = curtain.x1 - curtain.x0;
      const mid = (curtain.x0 + curtain.x1) / 2;
      put(box(width, curtain.top - curtain.base, WALL_D * 2, tapia), mid, curtain.base, WALL_Z);
      crenellate(
        curtain.x0,
        curtain.x1,
        curtain.top,
        WALL_Z + WALL_D - MERLON_D / 2,
        MERLON_D,
      );
    }

    // --- the towers ---
    for (const tower of TOWERS) {
      put(box(tower.hw * 2, tower.shaft - tower.base, tower.hd * 2, tapia), tower.x, tower.base, WALL_Z);

      // A string course just under the merlons, so a tall box does not read as a chimney.
      if (tower.cornice) {
        put(
          box(tower.hw * 2 + 1.1, 1.0, tower.hd * 2 + 1.1, tapia),
          tower.x,
          tower.shaft - 1.6,
          WALL_Z,
        );
      }

      crenellate(
        tower.x - tower.hw,
        tower.x + tower.hw,
        tower.shaft,
        WALL_Z + tower.hd - MERLON_D / 2,
        MERLON_D,
      );

      if (tower.flanks) {
        // One merlon on each flank, set back from the front row; the box is built the other way round rather than rotated.
        for (const side of [-1, 1]) {
          put(
            box(MERLON_D, MERLON_H, MERLON_W, tapia),
            tower.x + side * (tower.hw - MERLON_D / 2),
            tower.shaft,
            WALL_Z - tower.hd + MERLON_W / 2 + 0.6,
          );
        }
      }

      // A hipped tile roof rising out of the crenellations (the Hall of the Ambassadors).
      if (tower.roof > 0) {
        const pitch = new THREE.Group();
        pitch.add(taper(1, 0.3, tower.roof - (tower.shaft - 0.1), tile, 4));
        pitch.scale.set(tower.hw - 0.2, 1, tower.hd - 0.2);
        pitch.position.set(tower.x, tower.shaft - 0.1, WALL_Z);
        group.add(pitch);
      }
    }

    // --- the palaces behind the parapet ---
    for (const palace of PALACES) {
      put(box(palace.w, palace.top - palace.base, palace.d, tapia), palace.x, palace.base, palace.z);
      const roof = new THREE.Group();
      roof.add(taper(1, palace.ridge, palace.apex - (palace.top - 0.2), tile, 4));
      roof.scale.set(palace.w / 2 + 0.6, 1, palace.d / 2 + 0.6);
      roof.position.set(palace.x, palace.top - 0.2, palace.z);
      group.add(roof);
    }

    // --- openings ---
    // Each sits half inside the wall and pokes 0.15 proud, enough for the ink to frame it.
    for (const opening of OPENINGS) {
      put(box(opening.hw * 2, opening.h, 0.7, dark), opening.x, opening.y, opening.z - 0.2);
    }

    // --- the Vela's bell-cote ---
    for (const side of [-1, 1]) {
      put(box(0.9, 3.0, 1.0, tapia), BELL_X + side * 1.25, BELL_BASE, WALL_Z);
    }
    put(box(3.4, 1.1, 1.0, tapia), BELL_X, BELL_BASE + 3.0, WALL_Z);
    // The bell, dark in the opening, so it reads as an arch with something in it.
    put(box(0.9, 1.1, 0.7, dark), BELL_X, BELL_BASE + 1.5, WALL_Z + 0.2);

    // --- the wooded scarp ---
    for (const tree of CYPRESSES) {
      put(taper(tree.r, 0.14, tree.h, cypress, 6), tree.x, 0, tree.z);
    }

    return group;
  },
};

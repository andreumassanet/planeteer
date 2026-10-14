import { PROUD } from './contract.ts';
import type { Mesh, Monument, Vector3 } from './contract.ts';

/**
 * Chichen Itza — El Castillo, the pyramid of Kukulcan.
 *
 * A staircase of terraces, not a ramp:
 * 1. Nine terraces, each a steep panelled wall (leaning in 19 degrees; the whole
 *    rises at about 55) under a moulding, with a tread two units deep.
 * 2. Recessed panels either side of each stair, darker than their frames,
 *    standing just proud of the wall and tilted to its slope: two per half-face
 *    on the lower four terraces, one above, fifty-two in all.
 * 3. Four stairways running out beyond the foot, gentler than the faces, between
 *    balustrades. 18 steps on the restored faces (two a terrace, riser 1.75), 9
 *    on the others; the real 91 would be a grey smear.
 * 4. The feathered serpent: the north stair's balustrades end in two serpent
 *    heads with open jaws, and two serpent columns split the north portico into
 *    three doorways. They say which way is north.
 * 5. Two faces restored (north and west, which are +Z and +X since
 *    `placement.ts` turns +Z north and +X west), two as found: those get a coarse
 *    stair, broken balustrades, fallen stone and grass on the ledges.
 * 6. The temple on a plinth: a doorway a face, a three-bay portico on the north,
 *    a medial moulding, a frieze with two masks a face, and a cornice.
 *
 * Tier `building`: the real ratio (55 m across, 30 m tall) at 120 units would
 * need a radius past the landmark footprint ceiling. At 40 tall and 70 across it
 * keeps its proportions.
 *
 * Colour: `tan` lifted to a grey-beige (not yellow `sand`); mouldings and stairs
 * a tone lighter, panels a tone darker; `bark` for the temple interior and the
 * serpents' mouths; `green` and `darkOlive` for the grass. Built as pieces and
 * drawn with `ctx.merge`, one mesh per colour, so only the triangle cap binds.
 */

// --- the body -------------------------------------------------------------
const TERRACES = 9;
const TALUD = 2.6;
const MOULDING = 0.9;
const TERRACE = TALUD + MOULDING;
const BODY = TERRACES * TERRACE;
const TOP = 40;

/** Half-width across the flats at the ground. A 4-gon, so the corners reach x1.41. */
const BASE = 35;
/** Each terrace starts this much further in than the one below. */
const INSET = 2.5;
/** How far a terrace wall leans in over its own height. 0.9 in 2.6 is 19 degrees. */
const LEAN = 0.9;
/** The moulding stands this far proud of the top of the wall under it. */
const LIP = 0.45;
const WALL_SLOPE = Math.atan(LEAN / TALUD);

const bottomOf = (terrace: number): number => BASE - INSET * terrace;

// --- the panels -------------------------------------------------------------
const PANEL_FROM = 0.45;
const PANEL_HEIGHT = 1.7;
const PANEL_DEPTH = 0.3;
const PANEL_GAP = 0.9;
/** Panels are about this long; each half-face gets as many as fit. */
const PANEL_LENGTH = 11;
/**
 * How far a panel's face stands off the wall: 0.22, not the 0.08 minimum the pen
 * can draw, because the wall is a slope inside its own bounding box; at 0.22 the
 * panel's foot clears that box and the burial probe sees a relief.
 */
const PANEL_PROUD = 0.22;

// --- the stairways --------------------------------------------------------
const STAIR_HALF = 4.5;
/** Where the stair's nose line starts at the ground, and where it arrives at the top. */
const STAIR_FOOT = BASE + 3;
const STAIR_HEAD = bottomOf(TERRACES - 1) - LEAN + LIP + 0.6;
const stairZ = (y: number): number => STAIR_FOOT - ((STAIR_FOOT - STAIR_HEAD) * y) / BODY;
const STEP_DEPTH = 6.5;

const RAIL = 2.2;
const RAIL_X = STAIR_HALF + RAIL / 2;
/** The rail rides the stair's slope, lifted clear of the noses. */
const RAIL_LIFT = 0.8;
const RAIL_FOOT = 2.2;
const railZ = (y: number): number => stairZ(y - RAIL_LIFT);

// --- the temple -----------------------------------------------------------
const TEMPLE_HALF = 9.6;
const TEMPLE_WALL = 3;
const PLINTH = 0.6;
const WALL_TOP = 5.0;
const DOOR_HEIGHT = 4.2;
const DOOR_HALF = 2.2;
/** The north portico: an opening this wide, split in three by two serpent columns. */
const PORTICO_HALF = 5.6;
const SERPENT_X = 2.0;
const SERPENT_RADIUS = 0.85;

/** The frieze band between the medial moulding and the cornice, in the temple's own frame. */
const FRIEZE_BASE = PLINTH + WALL_TOP + 0.7;
const FRIEZE_TOP = FRIEZE_BASE + 1.7;
const FRIEZE_HALF = TEMPLE_HALF + 0.2;

/** Which faces were restored: `around` puts 0 on +Z (north) and 1 on +X (west). */
const RESTORED = new Set([0, 1]);

export const chichenItza: Monument = {
  id: 'chichen-itza',
  name: 'Chichen Itza',
  iso: 'MEX',
  lat: 20.683,
  lon: -88.569,
  realHeight: 30,
  tier: 'building',
  footprint: 50,

  build(ctx) {
    const { THREE, palette, tone, box, column, taper, strut, around } = ctx;
    const stone = tone(palette.tan, 1.2);
    const lip = tone(palette.tan, 1.32);
    const panel = tone(palette.tan, 0.8);
    const stair = tone(palette.tan, 1.28);
    const rail = tone(palette.tan, 1.12);
    const rubble = tone(palette.tan, 0.94);
    const dark = palette.bark;
    const grass = [palette.green, palette.darkOlive];

    const draft = new THREE.Group();
    const at = (x: number, y: number, z: number): Vector3 => new THREE.Vector3(x, y, z);
    const placed = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      return mesh;
    };

    // --- nine terraces ---
    for (let i = 0; i < TERRACES; i++) {
      const bottom = bottomOf(i);
      draft.add(placed(taper(bottom, bottom - LEAN, TALUD, stone, 4), 0, i * TERRACE, 0));
      // Wider than the wall it caps and than the wall above, so every terrace
      // ends on a ledge with an ink line under it rather than on a crease.
      const width = (bottom - LEAN + LIP) * 2;
      draft.add(placed(box(width, MOULDING, width, lip), 0, i * TERRACE + TALUD, 0));
    }

    // --- the four faces: stairs, balustrades, and what each face is now ---
    draft.add(
      around(4, (side) => {
        const face = new THREE.Group();
        const restored = RESTORED.has(side);

        // The stair: fine and whole where restored, coarse where not.
        const steps = restored ? 2 * TERRACES : TERRACES;
        const rise = BODY / steps;
        for (let k = 0; k < steps; k++) {
          const nose = stairZ(k * rise);
          // Deep enough to bury itself behind the moulding above. The last one
          // stops `PROUD` under the summit so its tread does not share a plane
          // with the top moulding.
          const height = k === steps - 1 ? rise - PROUD : rise;
          face.add(placed(box(STAIR_HALF * 2, height, STEP_DEPTH, stair), 0, k * rise, nose - STEP_DEPTH / 2));
        }

        for (const x of [1, -1]) {
          // The balustrade, broken off two thirds up on the unrestored faces.
          const top = restored ? BODY + RAIL_LIFT : BODY * 0.62;
          face.add(strut(at(x * RAIL_X, RAIL_FOOT, railZ(RAIL_FOOT)), at(x * RAIL_X, top, railZ(top)), RAIL, rail));

          // The rail is a beam centred on its own axis, so its lower end is cut
          // on the diagonal and hangs below y = 0. The foot block covers it.
          const footZ = railZ(RAIL_FOOT) - 0.65;
          face.add(placed(box(RAIL + 0.8, RAIL_FOOT + 0.4, 4.6, rail), x * RAIL_X, 0, footZ));

          // Kukulcan: the north stair's balustrades end in serpent heads facing out
          // over the plaza. Five blocks: head, upper jaw and brow, lower jaw, the
          // dark of the mouth.
          if (side === 0) {
            const snout = footZ + 2.3;
            face.add(placed(box(3.2, 2.9, 3.0, rail), x * RAIL_X, 0, snout + 1.1));
            face.add(placed(box(3.4, 1.1, 2.0, rail), x * RAIL_X, 1.8, snout + 3.4));
            face.add(placed(box(3.6, 0.6, 1.6, rail), x * RAIL_X, 2.9, snout + 2.2));
            face.add(placed(box(2.8, 0.7, 1.7, rail), x * RAIL_X, 0, snout + 3.3));
            face.add(placed(box(2.6, 1.1, 1.4, dark), x * RAIL_X, 0.7, snout + 2.9));
          }
        }

        if (restored) {
          // The panels, either side of the stair on every terrace, tilted to lie
          // on the wall. The front of each stands `PROUD` off the wall's plane.
          for (let i = 0; i < TERRACES; i++) {
            const bottom = bottomOf(i);
            const y0 = i * TERRACE;
            const inner = RAIL_X + RAIL / 2 + 0.8;
            const outer = bottom - LEAN * ((PANEL_FROM + PANEL_HEIGHT / 2) / TALUD) - 1.2;
            const count = Math.max(1, Math.round((outer - inner) / PANEL_LENGTH));
            const length = (outer - inner - (count - 1) * PANEL_GAP) / count;
            const baseY = y0 + PANEL_FROM;
            const sin = Math.sin(WALL_SLOPE);
            const cos = Math.cos(WALL_SLOPE);
            const baseZ = bottom + (PANEL_PROUD - PANEL_DEPTH / 2 - sin * PANEL_FROM) / cos;
            for (let n = 0; n < count; n++) {
              const x = inner + length / 2 + n * (length + PANEL_GAP);
              for (const s of [1, -1]) {
                const slab = box(length, PANEL_HEIGHT / cos, PANEL_DEPTH, panel);
                slab.rotation.x = -WALL_SLOPE;
                face.add(placed(slab, s * x, baseY, baseZ));
              }
            }
          }
        } else {
          // As found: fallen stone heaped at the foot, and grass on the ledges.
          for (const x of [-22, -12.5, 17]) {
            const heap = taper(5.5, 2.4, 4.2, rubble, 5);
            heap.rotation.y = x;
            face.add(placed(heap, x, 0, BASE + 1.2));
          }
          const tufts: [number, number][] = [[1, -15], [2, 11], [3, -8], [4, 18], [5, -12], [7, -9]];
          tufts.forEach(([terrace, x], index) => {
            const tuft = taper(1.3, 0.8, 1.2, grass[index % 2]!, 5);
            face.add(placed(tuft, x, terrace * TERRACE, bottomOf(terrace - 1) - LEAN + LIP - 1.4));
          });
        }
        return face;
      }),
    );

    // --- the temple ---
    const temple = new THREE.Group();
    temple.position.y = BODY;
    draft.add(temple);
    const add = (mesh: Mesh, x: number, y: number, z: number): void => {
      temple.add(placed(mesh, x, y, z));
    };

    add(box((TEMPLE_HALF + 0.8) * 2, PLINTH, (TEMPLE_HALF + 0.8) * 2, lip), 0, 0, 0);
    // Dark, and set back a wall's thickness, so each doorway reads as a hole
    // into shadow. A hole is cheaper as a recess than as geometry.
    const hollow = (TEMPLE_HALF - TEMPLE_WALL) * 2;
    add(box(hollow, WALL_TOP, hollow, dark), 0, PLINTH, 0);

    temple.add(
      around(4, (side) => {
        const wall = new THREE.Group();
        const z = TEMPLE_HALF - TEMPLE_WALL / 2;
        const opening = side === 0 ? PORTICO_HALF : DOOR_HALF;
        const pier = TEMPLE_HALF - opening;
        for (const x of [1, -1]) {
          wall.add(placed(box(pier, DOOR_HEIGHT, TEMPLE_WALL, stone), x * (opening + pier / 2), PLINTH, z));
        }
        wall.add(placed(box(TEMPLE_HALF * 2, WALL_TOP - DOOR_HEIGHT, TEMPLE_WALL, stone), 0, PLINTH + DOOR_HEIGHT, z));

        if (side === 0) {
          // The serpent columns: the head on the floor, jaws out; the body is
          // the shaft; the rattle at the top turns out under the lintel.
          for (const x of [1, -1]) {
            wall.add(placed(column(SERPENT_RADIUS, DOOR_HEIGHT, rail, 6), x * SERPENT_X, PLINTH, TEMPLE_HALF - 0.9));
            wall.add(placed(box(1.9, 1.3, 2.4, rail), x * SERPENT_X, PLINTH, TEMPLE_HALF + 0.3));
            wall.add(placed(box(1.9, 0.7, 1.6, rail), x * SERPENT_X, PLINTH + DOOR_HEIGHT - 0.7, TEMPLE_HALF - 0.2));
          }
        }

        // The frieze's masks: two panels a face, standing `PROUD` off it.
        for (const x of [-4.8, 4.8]) {
          wall.add(placed(box(3.0, 1.1, 0.3, panel), x, FRIEZE_BASE + 0.25, FRIEZE_HALF + 0.08 - 0.15));
        }
        return wall;
      }),
    );

    // Medial moulding, frieze, cornice.
    add(box((TEMPLE_HALF + 0.45) * 2, FRIEZE_BASE - PLINTH - WALL_TOP, (TEMPLE_HALF + 0.45) * 2, lip), 0, PLINTH + WALL_TOP, 0);
    add(box(FRIEZE_HALF * 2, FRIEZE_TOP - FRIEZE_BASE, FRIEZE_HALF * 2, stone), 0, FRIEZE_BASE, 0);
    add(box((TEMPLE_HALF + 0.5) * 2, TOP - BODY - FRIEZE_TOP, (TEMPLE_HALF + 0.5) * 2, lip), 0, FRIEZE_TOP, 0);

    return ctx.merge(draft);
  },
};

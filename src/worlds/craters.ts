/**
 * Craters, as a field: how high the ground is lifted or dug at a point, by
 * every crater whose reach covers it.
 *
 * A crater generator that *placed* craters — a list, sorted, indexed — would
 * be a second data structure the tiles, the foot and the check all had to
 * agree about. This is the other shape: **a pure function of the point**. Each
 * face of the cube-sphere (`cube.ts`) is cut into square cells about `cell`
 * units on a side (one lattice a size class); each cell holds at most one
 * crater, and its centre, radius, depth and age are a hash of the face and
 * the cell. A point asks the 3 x 3 cells round its own, on every face it
 * faces, and sums what they say. Two tiles that share an edge ask the same
 * cells about the same points, so the seam is exact; the foot asks the same
 * cells as the mesh it stands on; and nothing is stored.
 *
 * It was a lattice of cubes in space first, 27 of them a class a point, and
 * a third of a tile's build went on hashing cubes that held nothing; the faces
 * are nine a class, and on a face's edge eighteen.
 *
 * ## The profile
 *
 * In units of the crater's own radius `x = d / r`:
 *
 * ```
 *   x < 1      the bowl: -depth (1 - x^2), lifted to the rim's height as x -> 1
 *   1 <= x < 2 the ejecta: the rim's height falling away as (2 - x)^2
 * ```
 *
 * which is continuous at the rim by construction and flat at both ends, so a
 * crater never draws a crease the light would step across where it ends. A
 * crater past `complexAbove` keeps a flat floor at 70% of its depth and grows a
 * central peak, which is what a big fresh crater on any rocky body has.
 *
 * Every crater also carries an **age** from its hash: an old one is shallower
 * and its rim softer, so a field of them reads as a history rather than as a
 * stamp repeated. Overlapping craters sum, which is what overprinting looks
 * like from the ground.
 */

import type { CraterClass, CraterRecipe } from './contract.ts';
import { seedOf } from '../scenery/random.ts';
import { latOf, lonOf } from '../sphere.ts';
import { FACES, faceDir } from './cube.ts';

/** What one query found, beside the height: for the ground's colour. */
export interface CraterHit {
  /** 0 to 1: how deep inside a bowl the point is (1 at the floor's centre). */
  bowl: number;
  /** 0 to 1: how much fresh ejecta lies here. */
  ejecta: number;
}

function scramble(n: number): number {
  let h = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) | 0;
}

/** A hash of a cell to [0, 1). `k` picks which of the cell's numbers. */
function cellUnit(seed: number, face: number, x: number, y: number, k: number): number {
  let h = seed ^ Math.imul(k + 1, 0x632be5ab);
  h = scramble(h ^ Math.imul(face + 1, 0x27d4eb2f));
  h = scramble(h ^ Math.imul(x, 0x9e3779b1));
  h = scramble(h ^ Math.imul(y, 0x85ebca6b));
  return (h >>> 0) / 4294967296;
}

/** One class, made ready to be asked: its seed and how many cells a face edge holds. */
interface Prepared {
  spec: CraterClass;
  seed: number;
  cells: number;
}

export interface CraterField {
  /**
   * Height in units at the point `dir * radius` (`dir` a unit vector), and
   * the bowl and ejecta it lies in written into `hit`.
   */
  at(x: number, y: number, z: number, hit: CraterHit): number;
  /** The deepest any crater can dig and the highest any rim stands, units. */
  readonly low: number;
  readonly high: number;
}

const QUARTER = Math.PI / 4;
/**
 * The shortest a cell's side gets on the warped cube, as a share of the
 * average: along a face's edge the equal-angle grid is squeezed by `1/sqrt 2`.
 * The face is cut so that even the squeezed cells are `cell` units across,
 * which is what lets a crater's reach (at most `0.9 cell`) stay inside the
 * 3 x 3 cells round the point asking.
 */
const SQUEEZE = Math.SQRT1_2;

/** A field over a sphere of `radius` units. `null` recipes give a field that is always 0. */
export function createCraters(recipe: CraterRecipe | null, radius: number): CraterField {
  if (recipe === null || recipe.classes.length === 0) {
    return {
      at(_x, _y, _z, hit) {
        hit.bowl = 0;
        hit.ejecta = 0;
        return 0;
      },
      low: 0,
      high: 0,
    };
  }
  const faceEdge = radius * (Math.PI / 2);
  const classes: Prepared[] = recipe.classes.map((spec, index) => ({
    spec,
    seed: seedOf('crater', recipe.seed, index),
    cells: Math.max(1, Math.floor((faceEdge * SQUEEZE) / spec.cell)),
  }));
  let low = 0;
  let high = 0;
  for (const { spec } of classes) {
    // Overlap can add two craters' worth; the bound is for the check and the
    // tiles' bounding spheres, so it is generous rather than exact.
    low -= spec.radius[1] * 2 * spec.depth * 2;
    high += spec.radius[1] * 2 * spec.rim * 2 + (spec.complexAbove !== undefined ? spec.radius[1] * 0.12 : 0);
  }
  const density = recipe.density;
  const centre = { x: 0, y: 0, z: 0 };

  return {
    low,
    high,
    at(x, y, z, hit) {
      hit.bowl = 0;
      hit.ejecta = 0;
      const px = x * radius;
      const py = y * radius;
      const pz = z * radius;
      let total = 0;
      // Every crater belongs to one face, in the face's own coordinates. A
      // point asks every face it is in front of — one in the middle of a face,
      // two or three near an edge or a corner — projected onto that face's
      // plane, past its edge if need be, so a crater just over the edge is
      // found from both sides and the ground does not tear along it.
      for (let face = 0; face < 6; face++) {
        const f = FACES[face]!;
        const along = x * f.axis[0] + y * f.axis[1] + z * f.axis[2];
        if (along < 0.2) continue;
        const U = Math.atan((x * f.u[0] + y * f.u[1] + z * f.u[2]) / along) / QUARTER;
        const V = Math.atan((x * f.v[0] + y * f.v[1] + z * f.v[2]) / along) / QUARTER;
        for (const { spec, seed, cells } of classes) {
          const gu = ((U + 1) / 2) * cells;
          const gv = ((V + 1) / 2) * cells;
          const cu = Math.floor(gu);
          const cv = Math.floor(gv);
          for (let du = -1; du <= 1; du++) {
            const iu = cu + du;
            if (iu < 0 || iu >= cells) continue;
            for (let dv = -1; dv <= 1; dv++) {
              const iv = cv + dv;
              if (iv < 0 || iv >= cells) continue;
              const roll = cellUnit(seed, face, iu, iv, 0);
              if (roll >= spec.chance) continue;
              faceDir(face, -1 + ((iu + cellUnit(seed, face, iu, iv, 1)) * 2) / cells, -1 + ((iv + cellUnit(seed, face, iu, iv, 2)) * 2) / cells, centre);
              const r = spec.radius[0] + (spec.radius[1] - spec.radius[0]) * Math.pow(cellUnit(seed, face, iu, iv, 4), 2.2);
              const ddx = px - centre.x * radius;
              const ddy = py - centre.y * radius;
              const ddz = pz - centre.z * radius;
              const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
              if (d2 >= 4 * r * r) continue;
              // The density field thins craters by where the *crater* is and
              // never by where the point asking is: asked at the point, one
              // crater would be there for one vertex and gone for the next,
              // and the ground would tear along the line between them.
              if (density !== undefined && roll >= spec.chance * density(latOf(centre.y), lonOf(centre.x, centre.z))) continue;
              const t = Math.sqrt(d2) / r;
              // Age: an old crater is shallower and its rim lower.
              const fresh = 0.35 + 0.65 * cellUnit(seed, face, iu, iv, 5);
              const depth = spec.depth * 2 * r * fresh;
              const rim = spec.rim * 2 * r * fresh;
              let h: number;
              if (t < 1) {
                // The bowl, and the rim rising out of it over the last fifth.
                const bowl = -depth * (1 - t * t);
                const lip = rim * smooth(0.55, 1, t);
                h = bowl + lip;
                if (spec.complexAbove !== undefined && r > spec.complexAbove) {
                  // Flat floor and a central peak.
                  h = Math.max(h, -depth * 0.7 + lip);
                  const peak = Math.max(0, 1 - t / 0.2);
                  h += depth * 0.45 * peak * peak;
                }
                hit.bowl = Math.max(hit.bowl, (1 - t) * fresh);
              } else {
                const fall = 2 - t;
                h = rim * fall * fall;
                hit.ejecta = Math.max(hit.ejecta, fall * fall * fresh);
              }
              total += h;
            }
          }
        }
      }
      return total;
    },
  };
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = x <= e0 ? 0 : x >= e1 ? 1 : (x - e0) / (e1 - e0);
  return t * t * (3 - 2 * t);
};

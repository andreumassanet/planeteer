import { PROUD } from './contract.ts';
import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Belém Tower — Torre de São Vicente, Lisbon, Portugal.
 *
 * A Manueline fort of 1514-1519: a low bastion running out to a prow in the
 * river, and a square tower at its landward end, four storeys over the
 * bastion's terrace. Carrying the silhouette: round garitas under ribbed
 * cupolas (four on the bastion, four on the tower top); merlon shields with the
 * Order of Christ cross (`sand` on `white`, carved not painted); the loggia, a
 * dark band behind six colonnettes; a rope course on bastion and tower; and the
 * royal balcony with its armillary spheres.
 *
 * The front (+Z) is the river. The bastion is a hexagon drawn out 1.2x towards
 * the prow (a parent carries the scale and a child the turn, so it composes
 * S * R); its parapet and rope course sit in the same stretched frame. The plan
 * is squeezed to about 0.8 of the height (the `tower` footprint cap is 28):
 * 56 units high, 24.9 out, 1,776 triangles of 1,800.
 *
 * No water is modelled; a `skyBlue` plate is inked into a hard ring. The tower
 * is on the source's `shore` list, so the world's water comes up to the `tan`
 * plinth.
 */

// --- the bastion: a hexagon with a vertex at +Z, stretched along z ---
/** Circumradius of the bastion's walls before the stretch. */
const BASTION_R = 16;
const STRETCH = 1.2;
/** Where the hexagon's centre stands: forward of the origin, the tower behind it. */
const BASTION_Z = 2;
const PLINTH_R = 17;
const PLINTH_TOP = 1.6;
const TERRACE = 15;
/** The parapet corbels out past the wall, so it gets its own line. */
const PARAPET_IN = 15;
const PARAPET_OUT = 16.35;
const PARAPET_TOP = 17.2;
const MERLON_TOP = 19.4;
/** Where a merlon stands: the middle of the parapet wall. */
const MERLON_R = (PARAPET_IN + PARAPET_OUT) / 2;
const BASTION_ROPE = 12.5;
const GUNPORT_Y = 7;

// --- the tower ---
const TOWER_HALF = 9.5;
const TOWER_Z = -11;
const TOWER_TOP = 48;
const CORNICE_HALF = 10.2;
const CORNICE_TOP = 48.6;
const TOWER_MERLON_TOP = 51;
const TOWER_ROPE = 30;

// --- the loggia, on the tower's river face, over the terrace ---
const LOGGIA_FLOOR = 19.2;
const LOGGIA_DECK = 20;
const LOGGIA_TOP = 25.6;
const LOGGIA_ROOF = 26.3;
const LOGGIA_DEPTH = 3.2;

// --- a garita: corbel, drum, cupola, finial ---
const GARITA_R = 1.5;
const CORBEL = 2.4;
const DRUM = 4;
const CUPOLA = 3.4;

export const belemTower: Monument = {
  id: 'belem-tower',
  name: 'Belém Tower',
  iso: 'PRT',
  lat: 38.6916,
  lon: -9.216,
  realHeight: 30,
  tier: 'tower',
  // Set by the tower-top garitas at the back corners, 24.9 out.
  footprint: 25,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper, ringWall, around } = ctx;

    const wall = palette.white; // lioz limestone, a warm white
    const stone = palette.sand; // carved trim: shields, ropes, cupolas, cornices
    const base = palette.tan; // the plinth the river washes
    const dark = palette.bark; // gunports, windows, the loggia's shade

    const draft = new THREE.Group();

    /** A point on the stretched hexagon of circumradius `rho`, at vertex `k` (0 is the prow). */
    const corner = (k: number, rho: number): { x: number; z: number } => {
      const angle = (k * Math.PI) / 3;
      return { x: rho * Math.sin(angle), z: BASTION_Z + STRETCH * rho * Math.cos(angle) };
    };

    /** Puts a piece built round the origin into the bastion's stretched frame. */
    const stretched = (piece: Mesh): Group => {
      const frame = new THREE.Group();
      frame.position.z = BASTION_Z;
      frame.scale.z = STRETCH;
      frame.add(piece);
      return frame;
    };

    /** A six-sided prism turned so a vertex, not a face, points at the prow. */
    const hexPrism = (circumradius: number, height: number, color: number): Mesh => {
      const prism = column(circumradius * Math.cos(Math.PI / 6), height, color, 6);
      prism.rotation.y = -Math.PI / 6;
      return prism;
    };

    // --- bastion ---
    draft.add(stretched(hexPrism(PLINTH_R, PLINTH_TOP, base)));

    const body = hexPrism(BASTION_R, TERRACE - PLINTH_TOP, wall);
    body.position.y = PLINTH_TOP;
    draft.add(stretched(body));

    // A lathe puts its first vertex on +Z, so the rings need no turn.
    const parapet = ringWall(PARAPET_IN, PARAPET_OUT, PARAPET_TOP - TERRACE, wall, 6);
    parapet.position.y = TERRACE;
    draft.add(stretched(parapet));

    const rope = ringWall(BASTION_R - 0.4, BASTION_R + 0.3, 0.8, stone, 6);
    rope.position.y = BASTION_ROPE;
    draft.add(stretched(rope));

    /** Lays a piece along edge `k` (vertex k to k + 1) at fraction `t`, pushed `out` past the line. */
    const onEdge = (k: number, rho: number, t: number, out: number, piece: Mesh, y: number): Mesh => {
      const a = corner(k, rho);
      const b = corner(k + 1, rho);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      // The hexagon runs clockwise seen from above (+Z towards +X), so the
      // outward normal of an edge is its direction turned a quarter to the left.
      const nx = -dz / length;
      const nz = dx / length;
      piece.position.set(a.x + dx * t + nx * out, y, a.z + dz * t + nz * out);
      piece.rotation.y = Math.atan2(-dz, dx);
      return piece;
    };

    const garitas: { x: number; z: number }[] = [1, 2, 4, 5].map((k) => corner(k, BASTION_R + 0.6));
    const towerFace = TOWER_Z + TOWER_HALF;
    const underTower = (x: number, z: number): boolean => Math.abs(x) < TOWER_HALF + 1 && z < towerFace + 1;

    // Merlons with their carved shields, spaced along each edge and left out
    // where a garita stands or where the edge runs under the tower.
    for (let k = 0; k < 6; k++) {
      const a = corner(k, MERLON_R);
      const b = corner(k + 1, MERLON_R);
      const count = Math.floor(Math.hypot(b.x - a.x, b.z - a.z) / 2.6);
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        if (underTower(x, z) || garitas.some((g) => Math.hypot(g.x - x, g.z - z) < 2.8)) continue;
        draft.add(onEdge(k, MERLON_R, t, 0, box(1.3, MERLON_TOP - PARAPET_TOP + 0.2, 0.9, wall), PARAPET_TOP - 0.2));
        draft.add(onEdge(k, MERLON_R, t, 0.45 + 0.1, box(0.7, 1.1, 0.3, stone), PARAPET_TOP + 0.4));
      }
    }

    // Gunports: two on each face of the prow.
    for (const k of [0, 5]) {
      for (const t of [0.3, 0.7]) {
        draft.add(onEdge(k, BASTION_R, t, 0.1, box(1.1, 1.1, 0.6, dark), GUNPORT_Y));
      }
    }

    /** A garita whose drum starts at `drumBase`, turned to face the way (dx, dz). */
    const garita = (x: number, z: number, dx: number, dz: number, drumBase: number): Group => {
      const turret = new THREE.Group();
      turret.position.set(x, 0, z);
      turret.rotation.y = Math.atan2(dx, dz);

      const corbel = taper(0.5, GARITA_R, CORBEL, stone, 6);
      corbel.position.y = drumBase - CORBEL;
      turret.add(corbel);

      const drum = column(GARITA_R, DRUM, wall, 6);
      drum.position.y = drumBase;
      turret.add(drum);

      // Six facets read as the cupola's ribs; a finial and lookout slit cost 112
      // triangles a turret, and eight turrets are most of the tier's budget.
      const cupola = taper(GARITA_R + 0.15, 0.05, CUPOLA, stone, 6);
      cupola.position.y = drumBase + DRUM;
      turret.add(cupola);
      return turret;
    };

    const bastionDrum = PARAPET_TOP - 0.8;
    for (const g of garitas) draft.add(garita(g.x, g.z, g.x, g.z - BASTION_Z, bastionDrum));

    // --- tower: built round its own centre, so `around` spins its four faces ---
    const tower = new THREE.Group();
    tower.position.z = TOWER_Z;
    draft.add(tower);

    tower.add(box(TOWER_HALF * 2, TOWER_TOP, TOWER_HALF * 2, wall));

    const cornice = box(CORNICE_HALF * 2, CORNICE_TOP - (TOWER_TOP - 0.6), CORNICE_HALF * 2, stone);
    cornice.position.y = TOWER_TOP - 0.6;
    tower.add(cornice);

    const towerRope = box(TOWER_HALF * 2 + 0.6, 0.7, TOWER_HALF * 2 + 0.6, stone);
    towerRope.position.y = TOWER_ROPE;
    tower.add(towerRope);

    // Three merlons a side; the corners belong to the garitas.
    tower.add(
      around(4, () => {
        const side = new THREE.Group();
        for (const along of [-4.5, 0, 4.5]) {
          const merlon = box(1.6, TOWER_MERLON_TOP - CORNICE_TOP + 0.2, 0.9, wall);
          merlon.position.set(along, CORNICE_TOP - 0.2, TOWER_HALF + 0.1);
          side.add(merlon);
        }
        return side;
      }),
    );

    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const at = TOWER_HALF + 0.3;
        tower.add(garita(sx * at, sz * at, sx, sz, CORNICE_TOP));
      }
    }

    /** A dark opening on a face of the tower, standing proud of it. */
    const opening = (width: number, height: number, y: number, x = 0): Mesh => {
      const pane = box(width, height, 0.5, dark);
      pane.position.set(x, y, TOWER_HALF);
      return pane;
    };

    /** A stone balcony slab under an opening. */
    const balcony = (width: number, y: number): Mesh => {
      const slab = box(width, 0.5, 1.6, stone);
      slab.position.set(0, y, TOWER_HALF + 0.6);
      return slab;
    };

    tower.add(
      around(4, (index) => {
        const face = new THREE.Group();
        // The top storey's window, on every face.
        face.add(opening(1.4, 2.6, 42.5));
        if (index === 0) {
          // The river face: the royal balcony, and the arms between two
          // armillary spheres over it.
          face.add(balcony(5.2, 32.4));
          face.add(opening(2.4, 4.4, 32.9));
          const arms = box(2.4, 2.8, 0.6, stone);
          arms.position.set(0, 38.6, TOWER_HALF);
          face.add(arms);
          for (const x of [-2.6, 2.6]) {
            const sphere = column(0.8, 1.6, stone, 6);
            sphere.position.set(x, 39.2, TOWER_HALF + 0.2);
            face.add(sphere);
          }
        } else {
          // The other three: a balcony window.
          face.add(balcony(4.2, 32.4));
          face.add(opening(2.2, 4, 32.9));
        }
        return face;
      }),
    );

    // --- the loggia ---
    const loggiaZ = TOWER_HALF + LOGGIA_DEPTH / 2 - 0.1;
    const floor = box(13, LOGGIA_DECK - LOGGIA_FLOOR, LOGGIA_DEPTH + 0.2, stone);
    floor.position.set(0, LOGGIA_FLOOR, loggiaZ);
    tower.add(floor);

    const roof = box(13, LOGGIA_ROOF - LOGGIA_TOP, LOGGIA_DEPTH + 0.2, stone);
    roof.position.set(0, LOGGIA_TOP, loggiaZ);
    tower.add(roof);

    // The shade behind the arcade, standing off the wall.
    const shade = box(11.6, LOGGIA_TOP - LOGGIA_DECK, 0.5, dark);
    shade.position.set(0, LOGGIA_DECK, TOWER_HALF + 0.05);
    tower.add(shade);

    const balustrade = box(12.4, 1.3, 0.4, wall);
    balustrade.position.set(0, LOGGIA_DECK, TOWER_HALF + LOGGIA_DEPTH - 1.1);
    tower.add(balustrade);

    // Front faces `PROUD` and more behind the slabs' edge, so the stone and
    // the white never share a plane.
    const colonnetteZ = TOWER_HALF + LOGGIA_DEPTH - 0.35 - 0.1 - PROUD;
    for (let i = 0; i < 6; i++) {
      const colonnette = column(0.35, LOGGIA_TOP - LOGGIA_DECK, wall, 4);
      colonnette.position.set(-5.5 + i * 2.2, LOGGIA_DECK, colonnetteZ);
      tower.add(colonnette);
    }

    return ctx.merge(draft);
  },
};

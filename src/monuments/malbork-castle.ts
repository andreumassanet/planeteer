import type { Monument, Mesh } from './contract.ts';

/**
 * Malbork Castle, Poland.
 *
 * The Teutonic Order's capital on the Nogat, and the largest brick castle
 * there is. It is not one building but three run together — the High Castle,
 * the Middle Castle with the Grand Master's Palace, and the Lower Castle — and
 * what names it from a distance is a **long, low, dark red mass of brick under
 * steep red roofs, broken by stepped gables and one tall square tower**. No
 * white wall and no grey slate anywhere: that is what keeps it from reading as
 * Neuschwanstein or as any of the other white castles.
 *
 * What has to survive at thumbnail size, in the order the eye finds it:
 *
 * - **The High Castle's main tower.** A square brick shaft to 31, a corbelled
 *   parapet and a steep pyramid roof to 39.5, with a gilt finial on top. It is
 *   the one vertical, standing 13.5 units over the next-highest ridge.
 * - **The stepped gables.** The High Castle is a quadrangle, and from outside
 *   its north and south wings read as two parallel ridges — an M in section —
 *   each ended east and west by a brick gable in five steps with white
 *   plastered blind niches on its face. Four of those on the High Castle and
 *   one on the Middle Castle's east end: the gables, not the walls, are what
 *   say *Baltic brick Gothic*.
 * - **The Grand Master's Palace**, at the east corner of the front: taller than
 *   the curtain beside it, buttressed with pilasters between tall windows, a
 *   crenellated parapet, slender corbelled turrets on three corners and a
 *   steep hipped roof inside the battlements.
 * - **The Gdanisko tower**, the latrine tower on its arched bridge west of the
 *   High Castle. It is the oddest thing in the plan and the most recognisable
 *   outline from the river side, so the crop keeps it.
 * - **The front curtain**, crenellated, with a corner tower, a gate tower and a
 *   mid tower. It runs along the near face because a wall round a thing is
 *   worth less than a detail on the front of it (*Monuments* in the traps).
 *
 * ## Colour
 *
 * `clay` is every wall, and a tone of it under it for the corbels and string
 * courses. Roofs are `red` toned down to 0.8, the deep tile red against the
 * orange-brown brick. `white` is only the plaster in the gables' blind niches
 * and the frieze on the main tower, which is where Malbork has it. `tan` is the
 * fieldstone footing, `bark` the windows and arches, `gold` the finial.
 *
 * ## Departures, in numbers
 *
 * - **Cropped.** The real complex runs about 600 m north to south; this keeps
 *   the High Castle, the Middle Castle's north wing and the Palace, and drops
 *   the Lower Castle and the outer baileys entirely. The plan is about 76 by
 *   28 units under a 40-unit tower, where the tower really stands near 46 m
 *   against a 250 m front: the vertical is exaggerated about 2.3x against the
 *   plan, because at true proportion the tower is a stub on a long shed.
 * - **The courtyards are solid.** Open courtyards show the back of the far
 *   wing through the gap from the quarter view and read as ruins.
 * - **No moat and no river.** The pad is flat by contract.
 * - **Everything still is merged by colour** (`ctx.merge`): about two hundred
 *   pieces, a handful of meshes.
 */

/** Height of the High Castle's eaves; its two ridges stand 9 over it. */
const HC_EAVES = 17;
/** The Middle Castle's north wing, lower and longer than the High Castle. */
const MW_EAVES = 12;
/** How far a stepped gable's first step starts down inside its wall. */
const SINK = 0.5;
/** The main tower's shaft top, its parapet, and the tier ceiling at its finial. */
const TOWER_TOP = 31;
const TOP = 39.95;

export const malborkCastle: Monument = {
  id: 'malbork-castle',
  name: 'Malbork Castle',
  iso: 'POL',
  lat: 54.0397,
  lon: 19.0281,
  tier: 'building',
  footprint: 41,

  build(ctx) {
    const { THREE, palette, tone, box, column, taper } = ctx;

    const brick = palette.clay;
    const course = tone(palette.clay, 0.8); // corbels, string courses, parapets
    const roof = tone(palette.red, 0.8); // tile
    const plaster = palette.white; // blind niches, the tower's frieze
    const footing = palette.tan; // fieldstone
    const glass = palette.bark; // windows and arches
    const gilt = palette.gold;

    // The plan is laid out in its own frame and the draft is moved so the
    // model straddles the Y axis; `merge` bakes the move into the vertices
    // and hands back a group with an identity transform.
    const draft = new THREE.Group();
    draft.position.set(7.9, 0, -1.25);

    const put = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      draft.add(mesh);
      return mesh;
    };

    /**
     * A gable roof: a three-sided prism at unit size, scaled on the mesh and
     * turned on a pivot, as in `neuschwanstein.ts`. The mesh carries rotation
     * about X and a scale in its own axes (local y is the length, local z the
     * height), so `T * R * S` puts each number on the axis it names; the pivot
     * carries only the yaw.
     */
    const gable = (
      cx: number,
      cz: number,
      length: number,
      halfWidth: number,
      eaves: number,
      rise: number,
      alongX = true,
    ): void => {
      const prism = column(1, length, roof, 3);
      prism.scale.set(halfWidth / Math.sqrt(3), 1, rise / 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, rise / 3, -length / 2);
      const pivot = new THREE.Group();
      pivot.add(prism);
      if (alongX) pivot.rotation.y = Math.PI / 2;
      pivot.position.set(cx, eaves, cz);
      draft.add(pivot);
    };

    /**
     * A stepped gable closing the end of a roof that runs along X. Five brick
     * steps, 1.2 thick and centred on the wall's end plane, climbing 12% past
     * the ridge so the end of the block silhouettes in brick and not in tile;
     * the roof stops 0.3 inside the gable, never in its plane. Three plaster
     * niches stand on the outer face, 0.3 proud of it.
     */
    const steppedGable = (
      xFace: number,
      outward: 1 | -1,
      cz: number,
      halfWidth: number,
      eaves: number,
      rise: number,
    ): void => {
      const steps = 5;
      const stepHeight = (rise * 1.12) / steps;
      const base = halfWidth + 0.25;
      for (let k = 0; k < steps; k++) {
        const width = 2 * base * (1 - k / steps);
        // The first step starts `SINK` down inside the wall, so its underside
        // never shares the roof's plane at the eaves.
        const sink = k === 0 ? SINK : 0;
        put(box(1.2, stepHeight + sink, width, brick), xFace, eaves + k * stepHeight - sink, cz);
      }
      // Pinnacles on the crown and on the ends of the first step: the
      // budget's share, and where the eye reads a stepped gable's corners.
      put(box(0.7, 1.1, 0.7, brick), xFace, eaves + rise * 1.12, cz);
      for (const side of [-1, 1]) {
        put(box(0.7, 1.1, 0.7, brick), xFace, eaves + stepHeight, cz + side * (base - 0.35));
      }
      const face = xFace + outward * 0.75;
      put(box(0.3, rise * 0.72, 1.3, plaster), face, eaves + 0.6, cz);
      put(box(0.3, rise * 0.48, 1.1, plaster), face, eaves + 0.6, cz - 2.2);
      put(box(0.3, rise * 0.48, 1.1, plaster), face, eaves + 0.6, cz + 2.2);
    };

    /** A window slit 0.25 proud of a wall facing ±Z (`facing` 'z') or ±X. */
    const slit = (x: number, y: number, z: number, width: number, height: number, facing: 'x' | 'z'): void => {
      put(facing === 'z' ? box(width, height, 0.5, glass) : box(0.5, height, width, glass), x, y, z);
    };

    // -----------------------------------------------------------------------
    // The High Castle: x -30..-10, z -10..10. Fieldstone footing half a unit
    // proud all round, brick to the eaves, two ridges along X.
    // -----------------------------------------------------------------------
    put(box(21, 2, 21, footing), -20, 0, 0);
    put(box(20, HC_EAVES - 2, 20, brick), -20, 2, 0);
    put(box(20.6, 0.6, 20.6, course), -20, 12.2, 0);
    gable(-20, -5, 20.6, 5.4, HC_EAVES, 9);
    gable(-20, 5, 20.6, 5.4, HC_EAVES, 9);
    for (const cz of [-5, 5]) {
      steppedGable(-30, -1, cz, 5.4, HC_EAVES, 9);
      steppedGable(-10, 1, cz, 5.4, HC_EAVES, 9);
    }
    for (const x of [-27, -23, -17, -13]) {
      slit(x, 8.6, 10, 1.2, 3.0, 'z');
      slit(x, 13.6, 10, 1.2, 2.6, 'z');
    }
    for (const z of [-5, 5]) slit(-30, 13.6, z, 1.2, 2.6, 'x');

    // -----------------------------------------------------------------------
    // The main tower, on the High Castle's north-east corner.
    // -----------------------------------------------------------------------
    const TX = -10;
    const TZ = -9;
    put(box(7, TOWER_TOP, 7, brick), TX, 0, TZ);
    put(box(7.3, 1.4, 7.3, plaster), TX, 24, TZ);
    put(box(7.8, 1, 7.8, course), TX, TOWER_TOP, TZ);
    for (const side of [-1, 1]) {
      for (const along of [-2.6, 0, 2.6]) {
        put(box(1, 1.2, 1, brick), TX + along, TOWER_TOP + 1, TZ + side * 3.4);
        if (along !== 0) put(box(1, 1.2, 1, brick), TX + side * 3.4, TOWER_TOP + 1, TZ + along);
      }
      put(box(1, 1.2, 1, brick), TX + side * 3.4, TOWER_TOP + 1, TZ);
    }
    put(taper(3.4, 0, 7.5, roof, 4), TX, TOWER_TOP + 1, TZ); // apex 39.5
    put(column(0.2, TOP - 39.5, gilt, 4), TX, 39.5, TZ);
    for (const side of [-1, 1]) {
      slit(TX, 27, TZ + side * 3.5, 1.0, 3.0, 'z');
      slit(TX + side * 3.5, 27, TZ, 1.2, 3.0, 'x');
    }

    // -----------------------------------------------------------------------
    // The Middle Castle's north wing: x -10..20, z -11..-3, its east end
    // stepped. Its courtyard face shows over the curtain.
    // -----------------------------------------------------------------------
    put(box(31, 1.5, 9, footing), 5, 0, -7);
    put(box(30, MW_EAVES - 1.5, 8, brick), 5, 1.5, -7);
    gable(5.15, -7, 30.3, 4.4, MW_EAVES, 7);
    steppedGable(20, 1, -7, 4.4, MW_EAVES, 7);
    for (const x of [-3, 3.5, 10, 16.5]) slit(x, 8.6, -3, 1.2, 2.4, 'z');
    // Two dormers on the south slope break twenty units of tile.
    for (const x of [0, 10]) {
      put(box(1.8, 2.2, 1.6, brick), x, MW_EAVES + 0.4, -3.6);
      put(taper(1.3, 0, 1.6, roof, 4), x, MW_EAVES + 2.6, -3.6);
    }

    // -----------------------------------------------------------------------
    // The Grand Master's Palace: x 19..29, z -3.5..13.8, the front-east corner.
    // -----------------------------------------------------------------------
    const PX = 24;
    const PZ = 5.15;
    const PHX = 5;
    const PHZ = 8.65;
    const P_TOP = 16;
    put(box(2 * PHX + 1, 2, 2 * PHZ + 1, footing), PX, 0, PZ);
    put(box(2 * PHX, P_TOP - 2, 2 * PHZ, brick), PX, 2, PZ);
    put(box(2 * PHX + 0.6, 1, 2 * PHZ + 0.6, course), PX, P_TOP, PZ);
    // Battlements on the band's rim, stopping 0.1 inside its faces.
    for (let x = PX - 4.4; x <= PX + 4.41; x += 1.76) {
      put(box(0.9, 1.4, 0.6, brick), x, P_TOP + 1, PZ + PHZ + 0.3 - 0.4);
    }
    for (let z = PZ - 7.8; z <= PZ + 7.81; z += 2.6) {
      put(box(0.6, 1.4, 0.9, brick), PX + PHX + 0.3 - 0.4, P_TOP + 1, z);
      put(box(0.6, 1.4, 0.9, brick), PX - PHX - 0.3 + 0.4, P_TOP + 1, z);
    }
    const hip = taper(1, 0.15, 7, roof, 4);
    hip.scale.set(PHX - 0.5, 1, PHZ - 0.5); // scale only: no rotation to compose with
    put(hip, PX, P_TOP + 1, PZ);
    // Pilasters and tall windows on the river front and the west flank.
    const front = PZ + PHZ;
    for (const x of [PX - 4.2, PX - 1.4, PX + 1.4, PX + 4.2]) {
      put(box(0.8, P_TOP - 2.6, 0.6, brick), x, 2.3, front + 0.3);
    }
    for (const x of [PX - 2.8, PX, PX + 2.8]) {
      slit(x, 4.5, front, 1.4, 3.2, 'z');
      slit(x, 9.6, front, 1.4, 4.6, 'z');
    }
    for (const z of [PZ - 5, PZ - 1.7, PZ + 1.7, PZ + 5]) slit(PX + PHX, 9.6, z, 1.4, 4.6, 'x');
    // Corbelled turrets on three corners.
    for (const [x, z] of [[PX - PHX, front], [PX + PHX, front], [PX + PHX, PZ - PHZ]] as const) {
      put(taper(0.4, 1.1, 2, brick, 8), x, 9, z);
      put(column(1.1, 8, brick, 8), x, 11, z);
      put(column(1.4, 0.5, course, 8), x, 19, z);
      put(taper(1.3, 0, 3.6, roof, 8), x, 19.5, z);
    }

    // -----------------------------------------------------------------------
    // The front curtain along z 12.2..13.8, from the High Castle's corner to
    // the Palace, with three towers.
    // -----------------------------------------------------------------------
    const CZ = 13;
    put(box(49.6, 1.2, 2.2, footing), -5.2, 0, CZ);
    put(box(49.5, 8, 1.6, brick), -5.25, 0, CZ);
    const towers: [number, number, number][] = [
      // x, half-width, height
      [-30, 2.2, 12],
      [-6, 3, 14],
      [10, 1.8, 11],
    ];
    for (let x = -26.6; x <= 18.4; x += 2.8) {
      if (towers.some(([tx, half]) => Math.abs(x - tx) < half + 0.7)) continue;
      put(box(1.2, 1.3, 1.6, brick), x, 8, CZ);
    }
    for (const [tx, half, height] of towers) {
      put(box(2 * half, height, 2 * half, brick), tx, 0, CZ);
      put(box(2 * half + 0.5, 0.7, 2 * half + 0.5, course), tx, height - 0.7, CZ);
      put(taper(half + 0.4, 0, half * 1.9, roof, 4), tx, height, CZ);
      slit(tx, height - 4, CZ + half, 0.9, 2.0, 'z');
    }
    // The gate under the gate tower.
    put(box(2.8, 4.6, 0.4, glass), -6, 0, CZ + 3 + 0.1);
    put(box(3.6, 0.6, 0.5, course), -6, 4.6, CZ + 3 + 0.2);

    // -----------------------------------------------------------------------
    // The Gdanisko tower on its bridge, west of the High Castle.
    // -----------------------------------------------------------------------
    const GX = -43;
    const GZ = 4;
    put(box(11, 9, 3, brick), -35.5, 0, GZ);
    gable(-35.5, GZ, 11, 1.9, 9, 2.5);
    for (const x of [-38.5, -33.3]) put(box(3, 5.5, 0.4, glass), x, 0, GZ + 1.5 + 0.1);
    put(box(5.5, 22, 5.5, brick), GX, 0, GZ);
    put(box(5.9, 0.8, 5.9, course), GX, 15, GZ);
    put(box(6.3, 1, 6.3, course), GX, 22, GZ);
    for (const side of [-1, 1]) {
      for (const a of [-2.4, 0, 2.4]) put(box(0.9, 1.1, 0.9, brick), GX + a, 23, GZ + side * 2.7);
      put(box(0.9, 1.1, 0.9, brick), GX + side * 2.7, 23, GZ);
    }
    put(taper(2.9, 0, 5.5, roof, 4), GX, 23, GZ);
    for (const y of [10, 17.5]) {
      slit(GX, y, GZ + 2.75, 1.0, 2.6, 'z');
      slit(GX - 2.75, y, GZ, 1.0, 2.6, 'x');
    }

    return ctx.merge(draft);
  },
};

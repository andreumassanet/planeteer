import { PROUD } from './contract.ts';
import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * The Château Frontenac — Quebec City, Quebec.
 *
 * A railway hotel of 1893 built as a castle: a mass of `clay` brick under a
 * forest of steep `green` copper roofs (pitches 45 to 55 degrees), one tower
 * twice as high as anything around it, turrets, dormers and chimneys. Half-
 * diagonal over height is 0.76 (radius 30.2, height 39.9): no vertical stretch;
 * the plan is squeezed about 10% (46 by 41) so the roofs read as a crowd.
 *
 * The central tower is pulled into the plane of the riverfront (0.6 units of
 * projection past it). Left at z = 0 it would need to clear 24.5 + 0.238 x 13 =
 * 27.6 at the 13.4-degree camera, and its 29.0 shaft would show only 1.4 units.
 *
 * `green`, not `olive`: halved (a surface turned from the sun), `green` is
 * still a roof (72,86,60) and `olive` a murky yellow (85,87,21). Five colours:
 * `clay` brick, `tan` stone, `green` copper, `bark` windows, `gold` on two
 * finials. There is one repeating feature per surface so nothing forms a grid:
 * a row of tall uneven `bark` slots on the walls, no storey bands, and eight
 * dormers of different widths over four slopes plus two cross-gables. Every
 * drum and cone is eight-sided (a copper roof should look manufactured).
 *
 * Modelled: the Dufferin Terrace (a boardwalk with a balustrade) and a two-step
 * `tan` base course. Not modelled: the cliff (the pad is flat) and the river (an
 * opaque coaster inked into a rim). Budget: 1,456 triangles, 92 of 110 meshes.
 * `realHeight` is the central tower, 79 m.
 */

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/** Top of the stone base and of the terrace deck: where the brick starts. */
const BASE = 2.4;

/** Tower plan: half-width, and the z its centre sits at. */
const TOWER_HALF = 6.0;
const TOWER_Z = 13.6;

/**
 * The eight dormers, as a table because the irregularity is the feature: six
 * widths over four roofs, no two gaps equal. `roof` says which slope, `at` is
 * the position along it.
 */
const DORMERS: { roof: 'frontLeft' | 'frontRight' | 'leftWing' | 'rightWing'; at: number; width: number }[] = [
  { roof: 'frontLeft', at: -10.2, width: 2.6 },
  { roof: 'frontLeft', at: -7.2, width: 2.0 },
  { roof: 'frontRight', at: 8.8, width: 2.9 },
  { roof: 'leftWing', at: -12.5, width: 2.6 },
  { roof: 'leftWing', at: -3.5, width: 2.2 },
  { roof: 'leftWing', at: 3.5, width: 2.4 },
  { roof: 'rightWing', at: -9.0, width: 2.3 },
  { roof: 'rightWing', at: 0.5, width: 1.9 },
];

export const chateauFrontenac: Monument = {
  id: 'chateau-frontenac',
  name: 'Château Frontenac',
  iso: 'CAN',
  lat: 46.8124,
  lon: -71.205,
  realHeight: 79,
  tier: 'building',
  surface: 'brick',
  // Set by the big corner turret's cone at 30.2. The terrace corner reaches
  // 29.5 and the riverfront's own corners only 27.6.
  footprint: 32,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper } = ctx;

    const brick = palette.clay; // the walls: Glenboig brick, red-brown
    const stone = palette.tan; // base, cornices, quoins, turret rings, chimney caps
    const copper = palette.green; // every roof, cone, dormer and gable
    const glass = palette.bark; // the windows and the loggia's recess
    const gilt = palette.gold; // two finials

    const group = new THREE.Group();

    /** A block given by its two opposite corners. */
    const block = (
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      z0: number,
      z1: number,
      color: number,
    ): Mesh => {
      const mesh = box(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), color);
      mesh.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
      group.add(mesh);
      return mesh;
    };

    /**
     * A pitched roof: eaves at `eaves`, ridge `rise` above them, running along Z
     * or along X with `alongX`. A three-sided `column` on its side is the
     * cheapest gable (12 triangles) but fixed at 60 degrees, so the prism is
     * built at unit size and the mesh carries the scale while the pivot carries
     * the yaw (T * R * S applies scale first, in the prism's axes). After the
     * quarter turn about X: local x is world x, local y is the run, local z is
     * the height spanning -1 to +2, hence `scale.set(_, 1, _)`.
     */
    const gable = (
      cx: number,
      cz: number,
      length: number,
      halfWidth: number,
      eaves: number,
      rise: number,
      color: number,
      alongX = false,
    ): void => {
      const prism = column(1, length, color, 3);
      prism.scale.set(halfWidth / Math.sqrt(3), 1, rise / 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, rise / 3, -length / 2);

      const pivot = new THREE.Group();
      pivot.add(prism);
      if (alongX) pivot.rotation.y = Math.PI / 2;
      pivot.position.set(cx, eaves, cz);
      group.add(pivot);
    };

    // -----------------------------------------------------------------------
    // 1. The Dufferin Terrace and the stone base under the brick, the two things
    //    here that own their ground.
    // -----------------------------------------------------------------------
    block(-18.0, 18.0, 0, BASE, 18.6, 23.4, stone);
    // The balustrade in three runs with two gaps, not one 36-unit rail: a rail
    // that long is a blank slab, and the gaps are where the stairs come up.
    for (const [x0, x1] of [[-18.0, -7.0], [-3.2, 3.2], [7.0, 18.0]] as const) {
      block(x0, x1, BASE, BASE + 1.4, 22.6, 23.4, stone);
    }

    block(-20.8, 20.8, 0, 1.0, -17.8, 20.0, stone);
    block(-20.4, 20.4, 1.0, BASE, -17.4, 19.6, stone);

    // -----------------------------------------------------------------------
    // 2. The riverfront, in two unequal halves either side of the tower (the left
    //    a unit taller, a pile that grew).
    // -----------------------------------------------------------------------
    // Both halves run under the tower to x = 5 rather than stopping at its face
    // at 6: a face flush with its neighbour's draws no ink. Everything that meets
    // another mass overlaps it or stands clear by half a unit.
    //
    // [x0, x1, eaves, rise]
    const FRONT = [
      [-20.0, -5.0, 17.5, 7.0], // ridge 24.5, pitch 48 degrees
      [5.0, 20.0, 16.5, 6.5], // ridge 23.0, pitch 45 degrees
    ] as const;
    for (const [x0, x1, eaves, rise] of FRONT) {
      block(x0, x1, BASE, eaves, 7.0, 19.0, brick);
      // Each cornice stops `PROUD` under its eaves: flush, its top shared the
      // brick's plane in another colour.
      block(x0 - 0.4, x1 + 0.4, eaves - 0.8 - PROUD, eaves - PROUD, 6.6, 19.4, stone);
      gable((x0 + x1) / 2, 13.0, x1 - x0 + 0.8, 6.4, eaves, rise, copper, true);
    }

    // -----------------------------------------------------------------------
    // 3. The wings and the back range closing a courtyard, each shorter than the
    //    one in front (24.5, 22.5, 21.0, 19.5) so the pile steps down from the river.
    // -----------------------------------------------------------------------
    block(-20.0, -9.0, BASE, 16.0, -17.0, 8.0, brick);
    // Its cornice also ends `PROUD` short of the brick's end, both buried in
    // the riverfront block, rather than sharing that end's plane.
    block(-20.4, -8.6, 15.2 - PROUD, 16.0 - PROUD, -17.4, 8.0 - PROUD, stone);
    gable(-14.5, -4.5, 25.8, 5.9, 16.0, 6.5, copper); // ridge 22.5, pitch 48 degrees

    block(9.0, 20.0, BASE, 15.0, -17.0, 8.0, brick);
    block(8.6, 20.4, 14.2 - PROUD, 15.0 - PROUD, -17.4, 8.0 - PROUD, stone);
    gable(14.5, -4.5, 25.8, 5.9, 15.0, 6.0, copper); // ridge 21.0

    block(-9.5, 9.5, BASE, 14.0, -17.0, -8.0, brick);
    gable(0, -12.5, 19.8, 5.0, 14.0, 5.5, copper, true); // ridge 19.5

    // -----------------------------------------------------------------------
    // 4. The central tower: square, `tan` quoins at the corners, a corbelled
    //    cornice and the steepest roof in the model (55 degrees).
    // -----------------------------------------------------------------------
    block(-TOWER_HALF, TOWER_HALF, BASE, 29.0, TOWER_Z - TOWER_HALF, TOWER_Z + TOWER_HALF, brick);

    // Quoins: four vertical strips 0.25 proud in both axes (vertical, so they do
    // not make a grid with the window slots).
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        block(sx * 5.45, sx * 6.25, BASE, 29.0, TOWER_Z + sz * 5.45, TOWER_Z + sz * 6.25, stone);
      }
    }

    block(-6.9, 6.9, 29.0, 30.2, TOWER_Z - 6.9, TOWER_Z + 6.9, stone);

    const spire = taper(6.3, 0.55, 8.2, copper, 4);
    spire.position.set(0, 30.2, TOWER_Z);
    group.add(spire);

    const lantern = column(1.0, 0.8, stone, 8);
    lantern.position.set(0, 38.4, TOWER_Z);
    group.add(lantern);

    const finial = taper(0.55, 0.1, 0.7, gilt, 8);
    finial.position.set(0, 39.2, TOWER_Z);
    group.add(finial);

    // The four bartizans at the tower's corners, corbelled out over the cornice;
    // at 5.8 from the axis their shafts stand just outside the roof's 5.32 half-width.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const bx = sx * 5.8;
        const bz = TOWER_Z + sz * 5.2;

        const corbel = taper(0.7, 1.6, 1.4, stone, 8);
        corbel.position.set(bx, 30.2, bz);
        group.add(corbel);

        const shaft = column(1.6, 2.6, brick, 8);
        shaft.position.set(bx, 31.6, bz);
        group.add(shaft);

        const cone = taper(1.75, 0, 2.8, copper, 8);
        cone.position.set(bx, 34.2, bz);
        group.add(cone);
      }
    }

    // -----------------------------------------------------------------------
    // 5. The two round corner turrets, deliberately not a pair: the big one
    //    closes the north end at 32.5 (33.7 with its finial); the small one is
    //    5.2 shorter, a unit further forward and has no finial.
    // -----------------------------------------------------------------------
    // [x, z, apothem, top of drum, ring height, cone height, finial]
    const TURRETS = [
      { x: -20.0, z: 16.0, r: 4.0, drum: 22.0, cone: 9.6, gilt: true },
      { x: 19.5, z: 17.0, r: 2.8, drum: 19.0, cone: 7.4, gilt: false },
    ];
    for (const t of TURRETS) {
      // The stone foot runs to the ground: the turrets stand outside the plinth.
      const foot = column(t.r + 0.3, BASE, stone, 8);
      foot.position.set(t.x, 0, t.z);
      group.add(foot);

      const drum = column(t.r, t.drum - BASE, brick, 8);
      drum.position.set(t.x, BASE, t.z);
      group.add(drum);

      const ring = column(t.r + 0.35, 0.9, stone, 8);
      ring.position.set(t.x, t.drum, t.z);
      group.add(ring);

      const cone = taper(t.r + 0.35, 0, t.cone, copper, 8);
      cone.position.set(t.x, t.drum + 0.9, t.z);
      group.add(cone);

      if (t.gilt) {
        const tip = column(0.24, 1.2, gilt, 4);
        tip.position.set(t.x, t.drum + 0.9 + t.cone, t.z);
        group.add(tip);
      }
    }

    // -----------------------------------------------------------------------
    // 6. The two cross-gables: projecting bays that break the eaves line from the
    //    ground up. Both stop just under the ridge behind them (24.2 against
    //    24.5, 22.8 against 23.0).
    // -----------------------------------------------------------------------
    block(-15.2, -11.6, BASE, 19.6, 13.0, 20.3, brick);
    gable(-13.4, 16.8, 7.0, 2.4, 19.6, 4.6, copper);
    block(11.6, 15.4, BASE, 18.4, 13.0, 20.2, brick);
    gable(13.5, 16.6, 7.2, 2.2, 18.4, 4.4, copper);

    // -----------------------------------------------------------------------
    // 7. The dormers: a brick cheek pushed through the slope with a copper gable
    //    facing out, its back buried in the roof.
    // -----------------------------------------------------------------------
    for (const d of DORMERS) {
      const half = d.width / 2;
      const rise = d.width * 0.55;
      if (d.roof === 'frontLeft' || d.roof === 'frontRight') {
        const sill = d.roof === 'frontLeft' ? 18.0 : 17.0;
        const top = sill + 3.4;
        block(d.at - half, d.at + half, sill, top, 15.5, 17.8, brick);
        gable(d.at, 16.65, 2.7, half + 0.3, top, rise, copper);
      } else if (d.roof === 'leftWing') {
        block(-20.6, -18.5, 16.5, 19.6, d.at - half, d.at + half, brick);
        gable(-19.55, d.at, 2.5, half + 0.3, 19.6, rise, copper, true);
      } else {
        block(18.5, 20.6, 15.5, 18.4, d.at - half, d.at + half, brick);
        gable(19.55, d.at, 2.5, half + 0.3, 18.4, rise, copper, true);
      }
    }

    // -----------------------------------------------------------------------
    // 8. Three chimneys, through three ridges at three heights (six meshes).
    // -----------------------------------------------------------------------
    for (const [x, z, foot, height] of [
      [-14.5, -9.0, 21.0, 5.6],
      [-9.0, 13.0, 23.0, 5.4],
      [14.5, -6.0, 19.5, 5.1],
    ] as const) {
      block(x - 0.8, x + 0.8, foot, foot + height, z - 1.3, z + 1.3, brick);
      block(x - 1.0, x + 1.0, foot + height, foot + height + 0.8, z - 1.5, z + 1.5, stone);
    }

    // -----------------------------------------------------------------------
    // 9. The windows: one row per face, two storeys tall, never at an even pitch.
    // -----------------------------------------------------------------------
    // The riverfront wall is mostly taken by the turrets and bays; what is left
    // either side of the tower carries two slots each.
    for (const x of [-10.4, -8.0]) {
      block(x - 0.7, x + 0.7, 5.0, 15.0, 19.0, 19.45, glass);
    }
    for (const x of [7.6, 9.8]) {
      block(x - 0.7, x + 0.7, 5.0, 14.2, 19.0, 19.45, glass);
    }
    for (const x of [-3.2, 0, 3.2]) {
      block(x - 0.7, x + 0.7, 11.0, 27.0, TOWER_Z + 6.0, TOWER_Z + 6.45, glass);
    }
    for (const z of [-14.0, -6.0]) {
      block(-20.45, -20.0, 5.0, 13.5, z - 0.7, z + 0.7, glass);
    }
    for (const z of [-13.0, -4.0]) {
      block(20.0, 20.45, 5.0, 12.6, z - 0.7, z + 0.7, glass);
    }

    // -----------------------------------------------------------------------
    // 10. The loggia at the tower's foot: a `bark` recess (a neutral void behind
    //     columns reads as a hole) with three stone piers in front and a cornice.
    // -----------------------------------------------------------------------
    block(-5.2, 5.2, BASE, 8.2, 20.0, 20.5, glass);
    for (const x of [-3.6, 0, 3.6]) {
      block(x - 0.7, x + 0.7, BASE, 8.2, 20.4, 21.4, stone);
    }
    block(-5.4, 5.4, 8.2, 9.4, 19.9, 21.5, stone);

    return group;
  },
};

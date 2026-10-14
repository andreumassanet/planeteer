import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Gergeti Trinity Church — Kazbegi, Georgia.
 *
 * Tsminda Sameba at 2,170 m: the shape the other domes (hemispheres) lack. A
 * Georgian drum is a tall narrow polygonal tower on the crossing capped by a
 * cone, with four gabled arms leaning against its foot: a spike, not a bubble.
 * The group is the church, a free-standing bell tower (33 units of vertical
 * whose open third stage, four posts and a cap, is the only transparency) and
 * the enclosure wall. Kazbek is not modelled.
 *
 * Gables: a gable is a triangular prism on its side. `ctx.column(r, len, c, 3)`
 * is equilateral (60 degrees, an alpine chalet), and squashing it needs a scale
 * after the rotation, which T * R * S does not give. So each gable is a yaw
 * group, a scale group inside it and the rotated prism inside that
 * (`Ry * Sy * (T * Rx)`). An equilateral triangle of apothem `r` is 3r tall and
 * 3.4641r wide, so a gable of width `W` and ridge `H` wants `r = W / 3.4641` and
 * `scale.y = H / (3r)`. The arms ship at a pitch of 53 degrees.
 *
 * The model owns its wall and not its ground: inside is grass and loose rock,
 * which the biome draws. The wall has a gap in front (a 3-unit wall hides about
 * twelve units of ground behind it at 13.4 degrees).
 *
 * 39.6 tall on a 31.8 half-diagonal (0.80). No `realHeight`: the quoted figure is
 * the ridge's altitude.
 */

/** The crossing block: half-width, and the top it carries the drum on. */
const CROSSING = 6.5;
const CROSSING_TOP = 17.5;

/** The four arms: how far they reach from the centre, their half-width, their eaves. */
const ARM_REACH = 14.0;
const ARM_HALF = 4.4;
const ARM_EAVES = 10.5;
const ARM_RIDGE = 17.0;

/** The drum, its cornice and its cone. */
const DRUM_R = 4.6;
const DRUM_TOP = 29.0;
const EAVES_R = 5.5;
const CONE_TOP = 37.0;

/** Where the bell tower stands, and how big it is. */
const TOWER_X = -18.5;
const TOWER_Z = 4.0;
const TOWER_R = 2.9;

/** The enclosure. Half-width in x, half-depth in z, and how tall. */
const YARD_X = 24;
const YARD_Z = 20;
const YARD_H = 3.0;

export const gergetiTrinity: Monument = {
  id: 'gergeti-trinity',
  name: 'Gergeti Trinity Church',
  iso: 'GEO',
  lat: 42.6624,
  lon: 44.6203,
  tier: 'building',
  footprint: 34,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper, ringWall, around } = ctx;

    const wall = palette.tan; // undressed Caucasus stone: warm grey-buff, and lit all day
    const roof = palette.slate; // stone slab roofing, the one cool colour in the model
    const dark = palette.bark; // window slits and the belfry's shade, both of which need hue
    const dry = palette.brown; // the enclosure wall, laid dry and browner than the church
    const metal = palette.gold; // the two crosses, and the only bright mark on the card

    const group = new THREE.Group();

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
     * A pitched gable, ridge along +Z before the yaw. An equilateral prism is 3r
     * tall and 3.4641r wide, so the width picks `r` and the ridge height picks
     * the scale.
     */
    const gable = (
      width: number,
      ridge: number,
      length: number,
      x: number,
      y: number,
      z: number,
      yaw: number,
      color: number,
    ): void => {
      const r = width / 3.4641;
      const yawed = new THREE.Group();
      yawed.position.set(x, y, z);
      yawed.rotation.y = yaw;
      const squash = new THREE.Group();
      squash.scale.y = ridge / (3 * r);
      const prism = column(r, length, color, 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, r, -length / 2);
      squash.add(prism);
      yawed.add(squash);
      group.add(yawed);
    };

    // -----------------------------------------------------------------------
    // 1. The plinth and the cross plan: a crossing block with four arms, taller
    //    than all four so the gables lean against the drum's base.
    // -----------------------------------------------------------------------
    block(-13.6, 13.6, 0, 1.2, -13.6, 13.6, dry);
    block(-CROSSING, CROSSING, 1.2, CROSSING_TOP, -CROSSING, CROSSING, wall);
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      block(
        dx === 0 ? -ARM_HALF : dx * CROSSING,
        dx === 0 ? ARM_HALF : dx * ARM_REACH,
        1.2,
        ARM_EAVES,
        dz === 0 ? -ARM_HALF : dz * CROSSING,
        dz === 0 ? ARM_HALF : dz * ARM_REACH,
        wall,
      );
    }

    // The four gables. Each runs the whole way from the middle of the crossing out
    // to its arm's end (the helper wants the run's midpoint), so the ridge is 12.1
    // long against a 10.1 span. The arms reach 14.0 and the eaves drop from 12.5
    // to 10.5, leaving 8.1 units of ridge clear of the crossing and a 53-degree
    // pitch (at 42 degrees and 5 units of ridge they read as small domes).
    const armLength = ARM_REACH + 0.6;
    const gableWidth = ARM_HALF * 2 + 1.0; // eaves overhang, which is what casts the shade
    const ridge = ARM_RIDGE - ARM_EAVES;
    const half = armLength / 2;
    gable(gableWidth, ridge, armLength, 0, ARM_EAVES, half, 0, roof);
    gable(gableWidth, ridge, armLength, 0, ARM_EAVES, -half, Math.PI, roof);
    gable(gableWidth, ridge, armLength, half, ARM_EAVES, 0, Math.PI / 2, roof);
    gable(gableWidth, ridge, armLength, -half, ARM_EAVES, 0, -Math.PI / 2, roof);

    // A blind arch on each arm's gable end, stepped 0.3 proud so it takes its own
    // ink line (one relief cross on the south wall; a row of windows would make a grid).
    for (const [x, z, yaw] of [
      [0, ARM_REACH, 0],
      [ARM_REACH, 0, Math.PI / 2],
      [-ARM_REACH, 0, -Math.PI / 2],
    ] as const) {
      const face = new THREE.Group();
      face.position.set(x, 0, z);
      face.rotation.y = yaw;
      const slit = box(1.1, 4.2, 0.35, dark);
      slit.position.set(0, 4.4, 0.18);
      const head = box(2.3, 0.6, 0.3, wall);
      head.position.set(0, 8.6, 0.15);
      face.add(slit, head);
      group.add(face);
    }

    // -----------------------------------------------------------------------
    // 2. The drum. Twelve sides, a cornice that steps out over them, and a cone
    //    (also twelve: six reads as a tent, 24 as a smooth spike; twelve gives a
    //    sunlit half three bands wide).
    // -----------------------------------------------------------------------
    const drum = column(DRUM_R, DRUM_TOP - CROSSING_TOP - 1.1, wall, 12);
    drum.position.y = CROSSING_TOP + 1.1;
    group.add(drum);
    const base = ringWall(DRUM_R - 0.9, DRUM_R + 0.9, 1.1, wall, 12);
    base.position.y = CROSSING_TOP;
    group.add(base);

    // Six windows round the drum, each a surround proud of the wall with a dark
    // slit proud of that (0.55 units of surround). Nothing can cut a hole, and a
    // recessed dark box is buried. `around` builds at angle 0 (+Z) and returns a
    // group, which has to be added.
    group.add(
      around(6, () => {
        const frame = new THREE.Group();
        const surround = box(1.9, 6.0, 0.9, wall);
        surround.position.set(0, CROSSING_TOP + 3.2, DRUM_R + 0.15);
        const light = box(0.9, 4.4, 0.5, dark);
        light.position.set(0, CROSSING_TOP + 3.8, DRUM_R + 0.5);
        frame.add(surround, light);
        return frame;
      }),
    );

    const cornice = ringWall(DRUM_R - 0.4, EAVES_R, 1.2, roof, 12);
    cornice.position.y = DRUM_TOP - 1.2;
    group.add(cornice);
    const cone = taper(EAVES_R, 0.35, CONE_TOP - DRUM_TOP, roof, 12);
    cone.position.y = DRUM_TOP;
    group.add(cone);

    // The cross. Two thin boxes, and the only gold in the model — a small bright
    // mark at the highest point is where the eye goes first.
    block(-0.22, 0.22, CONE_TOP, CONE_TOP + 2.6, -0.22, 0.22, metal);
    block(-1.0, 1.0, CONE_TOP + 1.5, CONE_TOP + 1.9, -0.18, 0.18, metal);

    // -----------------------------------------------------------------------
    // 3. The bell tower: three stages, the third open (four posts and a cap).
    // -----------------------------------------------------------------------
    const tower = new THREE.Group();
    tower.position.set(TOWER_X, 0, TOWER_Z);
    group.add(tower);

    const plinth = box(TOWER_R * 2 + 1.4, 1.6, TOWER_R * 2 + 1.4, dry);
    tower.add(plinth);
    const shaft = box(TOWER_R * 2, 17.4, TOWER_R * 2, wall);
    shaft.position.y = 1.6;
    tower.add(shaft);
    const slit = box(0.8, 3.4, 0.35, dark);
    slit.position.set(0, 10.0, TOWER_R - 0.1);
    tower.add(slit);
    // The belfry floor, stepped out, so the open stage has a visible sill.
    const sill = box(TOWER_R * 2 + 1.2, 0.9, TOWER_R * 2 + 1.2, wall);
    sill.position.y = 19.0;
    tower.add(sill);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = box(1.1, 5.2, 1.1, wall);
        post.position.set(sx * (TOWER_R - 0.55), 19.9, sz * (TOWER_R - 0.55));
        tower.add(post);
      }
    }
    // The bell, hanging in the opening: dark inside light stone says belfry from a
    // distance. It flares downward, so the wide end of the `taper` is the first
    // argument. It hangs from a yoke (one box) or `findFlaws` calls it floating.
    const yoke = box(TOWER_R * 1.5, 0.7, 0.9, dark);
    yoke.position.y = 24.5;
    tower.add(yoke);
    const bell = taper(1.05, 0.5, 2.6, dark, 8);
    bell.position.y = 22.0;
    tower.add(bell);
    const lintel = box(TOWER_R * 2 + 0.8, 1.0, TOWER_R * 2 + 0.8, wall);
    lintel.position.y = 25.1;
    tower.add(lintel);
    const cap = taper(TOWER_R + 0.6, 0.3, 5.0, roof, 8);
    cap.position.y = 26.1;
    tower.add(cap);
    const spike = box(0.18, 1.5, 0.18, metal);
    spike.position.y = 31.1;
    tower.add(spike);

    // -----------------------------------------------------------------------
    // 4. The enclosure: three runs and two stubs, the gate left open in front.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      block(side * YARD_X, side * (YARD_X - 1.5), 0, YARD_H, -YARD_Z, YARD_Z, dry);
      block(side * (YARD_X + 0.4), side * (YARD_X - 1.9), YARD_H, YARD_H + 0.5, -YARD_Z - 0.4, YARD_Z + 0.4, wall);
      // The front run, stopping short of the middle to leave the gate.
      block(side * YARD_X, side * 5.0, 0, YARD_H, YARD_Z - 1.5, YARD_Z, dry);
      block(side * (YARD_X + 0.4), side * 4.6, YARD_H, YARD_H + 0.5, YARD_Z - 1.9, YARD_Z + 0.4, wall);
      // A gate pier either side of the opening, taller than the wall so the gap
      // reads as a doorway rather than as a hole where a wall fell down.
      block(side * 5.0, side * 3.6, 0, YARD_H + 2.2, YARD_Z - 1.7, YARD_Z + 0.2, wall);
    }
    block(-YARD_X, YARD_X, 0, YARD_H, -YARD_Z, -YARD_Z + 1.5, dry);
    block(-YARD_X - 0.4, YARD_X + 0.4, YARD_H, YARD_H + 0.5, -YARD_Z - 0.4, -YARD_Z + 1.9, wall);

    return group;
  },
};

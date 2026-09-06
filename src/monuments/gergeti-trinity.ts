import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Gergeti Trinity Church — Kazbegi, Georgia.
 *
 * **Why Georgia:** the Caucasus had nothing. Armenia, Azerbaijan and Georgia are
 * three countries, three alphabets and two of the oldest Christian states on
 * Earth, sitting in the gap between Turkey and Russia, and the world's landmark
 * list stepped straight over them. Tsminda Sameba stands alone at 2,170 m under
 * Kazbek, fourteenth century, and it is the picture everybody has of the country.
 *
 * **And the shape is one this world does not own.** There are three domes in the
 * list — St Peter's, Hagia Sophia and the Taj — and all three are hemispheres.
 * A Georgian drum is not: it is a tall narrow polygonal tower standing on the
 * crossing, capped by a **cone**, with the four gabled arms of the cross leaning
 * against its foot. The silhouette is a spike, not a bubble, and it is shared by
 * every church from Mtskheta to Ani and by nothing else here.
 *
 * ---------------------------------------------------------------------------
 * The gables, and the one transform this contract cannot express directly
 * ---------------------------------------------------------------------------
 *
 * Each arm of the cross is roofed by a pitched gable, and a gable is a
 * triangular prism lying on its side. `ctx.column(r, len, c, 3)` is an
 * equilateral prism extruded along Y, so a quarter turn about X lays it down —
 * and equilateral means a 60-degree pitch, which is an alpine chalet and not a
 * Georgian church. Squashing it wants a scale applied **after** the rotation, and
 * Three composes `T * R * S`, which is the wrong way round: `scale.y` on the
 * rotated prism would flatten it along an axis that is now horizontal.
 *
 * So each gable is three objects — a yaw group, a scale group inside it, and the
 * rotated prism inside that. `Ry * Sy * (T * Rx)` is `S * R` where it matters,
 * `validate` forbids a transform only on the root group, and every determinant
 * is positive. The arithmetic that falls out is worth writing down because it is
 * not obvious: an equilateral triangle of apothem `r` is **3r tall and 3.4641r
 * wide**, so a gable of width `W` and ridge `H` wants `r = W / 3.4641` and
 * `scale.y = H / (3r)`. The four arms ship at a pitch of 53 degrees.
 *
 * ---------------------------------------------------------------------------
 * What is here, what is not, and why the bell tower is
 * ---------------------------------------------------------------------------
 *
 * The church, the free-standing bell tower and the enclosure wall. Nothing else
 * is at Gergeti and nothing else should be.
 *
 * The **bell tower** is not decoration. It is what makes the group read as a
 * monastery rather than as a chapel, it is 33 units of vertical standing well
 * clear of the church, and its top stage is *open* — four posts and a cap, with
 * sky through it — which is the only transparent thing in the model and the
 * cheapest possible contrast against the solid drum beside it.
 *
 * **Kazbek is not modelled.** The mountain behind the church is 5,054 m and 5 km
 * away, and this world already holds Everest, Fuji, Kilimanjaro and Table
 * Mountain. A peak crammed into a 33-unit footprint would be a lump behind a
 * church, and the landmark is the church.
 *
 * ---------------------------------------------------------------------------
 * It owns its wall and not its ground
 * ---------------------------------------------------------------------------
 *
 * `biomeAt` calls the ridge `boreal` and `groundColorAt` paints it `#665c45`, a
 * dark olive-brown. The enclosure wall is here and **the ground inside it is
 * not**: there is no paved court, no plinth apron and no green pad, because
 * there is no paved court at Gergeti — it is grass and loose rock inside a dry
 * stone wall, and the biome already draws grass and loose rock. A model that
 * laid its own floor here would be the Avenue of the Baobabs' green rectangle
 * with a wall round it.
 *
 * The wall has a gap in the front for the same reason the Ziggurat of Ur's
 * temenos does. The contact sheet looks from 13.4 degrees, so a 3-unit wall
 * hides about twelve units of ground behind it; leaving the gate open is both
 * true and the only way anything at the church's foot is ever seen.
 *
 * Proportion: 39.6 tall on a 31.8 half-diagonal, **0.80** against the 2.00 cap.
 * No `realHeight` — the source list carries none, and the number people quote is
 * the altitude of the ridge rather than the height of the church.
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
     * A pitched gable, ridge running along +Z before the yaw. See the note
     * above: an equilateral prism is 3r tall and 3.4641r wide, so the width
     * picks `r` and the ridge height picks the scale.
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
    // 1. The plinth and the cross plan. A crossing block with four arms, and the
    //    crossing is taller than all four so the drum has something to stand on
    //    that the gables lean against rather than cover.
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

    // The four gables. Each runs the **whole** way from the middle of the
    // crossing out to its own arm's end, so the ridge is 12.1 units long against
    // a 10.1-unit span and reads as a ridge.
    //
    // The first build passed the arm's *tip* where the helper wants the run's
    // *midpoint*, and every gable came out 7 units long, floating 3.5 units past
    // the end of the wall it was meant to roof with a 1.5-unit gap behind it.
    // Nothing complained: `validate` measures a bounding box, the gables were
    // inside it, and a stubby wedge wider than it is long still looks broadly
    // like a roof. What it actually rendered as was four little pyramids.
    //
    // Fixing the length was not enough on its own and the second measurement is
    // the more useful one. With the arms reaching 11.5 and the crossing half
    // 6.5, only **5.0 units of ridge stood clear of the crossing block against a
    // 10.1-unit span** — a wedge wider than it is long is a hip roof whatever
    // its cross-section is. The arms reach 14.0 now and the eaves dropped from
    // 12.5 to 10.5, which takes the exposed ridge to 8.1 and the pitch from 42
    // degrees to 53. The gables read as gables at 260 pixels; at 42 degrees and
    // 5 units of ridge they read as four small domes round a big one.
    const armLength = ARM_REACH + 0.6;
    const gableWidth = ARM_HALF * 2 + 1.0; // eaves overhang, which is what casts the shade
    const ridge = ARM_RIDGE - ARM_EAVES;
    const half = armLength / 2;
    gable(gableWidth, ridge, armLength, 0, ARM_EAVES, half, 0, roof);
    gable(gableWidth, ridge, armLength, 0, ARM_EAVES, -half, Math.PI, roof);
    gable(gableWidth, ridge, armLength, half, ARM_EAVES, 0, Math.PI / 2, roof);
    gable(gableWidth, ridge, armLength, -half, ARM_EAVES, 0, -Math.PI / 2, roof);

    // A blind arch on each arm's gable end, stepped 0.3 proud so it takes its
    // own ink line. Georgian churches carve one relief cross on the south wall
    // and nothing else; a row of windows here would be the second regular
    // subdivision over the first and the walls would read as brick.
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
    // 2. The drum. Twelve sides, a cornice that steps out over them, and a cone.
    //
    //    Twelve for the drum and twelve for the cone, and it is a choice about
    //    ink rather than about geometry: a cone at 6 sides reads as a tent and at
    //    24 as a smooth spike with no facet the cel ramp can step across. Twelve
    //    is where the sunlit half is three bands wide, which is what makes a
    //    small cone read as clad stone.
    // -----------------------------------------------------------------------
    const drum = column(DRUM_R, DRUM_TOP - CROSSING_TOP - 1.1, wall, 12);
    drum.position.y = CROSSING_TOP + 1.1;
    group.add(drum);
    const base = ringWall(DRUM_R - 0.9, DRUM_R + 0.9, 1.1, wall, 12);
    base.position.y = CROSSING_TOP;
    group.add(base);

    // Six windows round the drum, each a surround standing proud of the wall
    // with a dark slit standing proud of that. `around` builds at angle 0, which
    // is +Z, and spins the copies — and it returns a group, which has to be
    // added or the whole row is built and thrown away in silence.
    //
    // **Proud and not recessed, and the reason is that nothing here can cut a
    // hole.** A dark box sunk into the drum is invisible, and `findFlaws` is
    // right to call it buried. A Georgian drum carries its lights in projecting
    // carved frames, so the honest version is also the one that renders: 0.55
    // units of surround, which at this size is a frame you can see the shadow
    // of.
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
    // 3. The bell tower. Three stages, and the third is open: four posts and a
    //    cap with sky between them. It is the only transparency in the model and
    //    it is what stops a second stone box beside the church from reading as
    //    a buttress.
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
    // The bell itself, hanging in the opening. A patch of dark inside a frame of
    // light stone is what says *belfry* from a distance where the four posts are
    // two pixels apart — and it flares downward, so the wide end of the `taper`
    // is the first argument.
    //
    // It hangs from a yoke rather than from nothing. A bell suspended in mid-air
    // is exactly what `findFlaws` calls floating, and it is right: the beam is
    // one box and the alternative is a model with something hovering in it.
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
    // 4. The enclosure. Three runs and two stubs, with the gate left open in the
    //    front — see the note above on why the wall is not closed there.
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

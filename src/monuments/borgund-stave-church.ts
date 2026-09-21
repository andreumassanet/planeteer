import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Borgund Stave Church — Lærdal, Norway.
 *
 * **Why Norway, and why this rather than a fjord:** Scandinavia had nothing.
 * From Copenhagen's Little Mermaid to Moscow's Saint Basil's the map behind `M`
 * was blank across Norway, Sweden, Finland, Iceland and the whole Arctic, and a
 * fjord is a shape the terrain already makes — `reliefAt` and the shore ramp
 * draw better ones than a monument file could. What the planet cannot generate
 * is a **building made entirely of roofs**, which is what a stave church is:
 * about 1,180, all timber, no nails in the frame, and standing.
 *
 * ---------------------------------------------------------------------------
 * What has to read: the pile
 * ---------------------------------------------------------------------------
 *
 * Nobody names Borgund by a detail. It is a *stack of steeply pitched shingled
 * roofs*, each smaller than the one under it, five deep, with dragon heads
 * pointing off the corners and a spired turret on top — and every one of those
 * words is a silhouette. So the model is built as five stages and each stage is
 * a wall and a roof:
 *
 *   ambulatory  1.0 -> 10.4   eave 15.9   the open gallery round the foot
 *   nave        1.0 -> 21.0   eave 12.4
 *   second     21.0 -> 28.4   eave  9.0
 *   clerestory 28.4 -> 33.2   eave  6.0
 *   turret     33.2 -> 39.6   eave  3.4
 *
 * The roofs are `taper`s with **four sides**, which puts a flat face at +Z and
 * the corners on the diagonals — which is where the dragon heads have to go.
 *
 * **Each big roof is two courses, not one.** A roof of one taper is one clean
 * cone and reads as a tent; split at 40% of its rise, `OutlineEffect` draws a
 * line right round it and it reads as *shingled*, which is the whole surface of
 * this building. This is the joint-count rule (few ink lines read as natural,
 * many as manufactured) used in the direction it usually is not: a hand-laid
 * shingle roof is manufactured, so more joints is more true, and the geometric
 * cost is that the pitch breaks by about a degree in the middle.
 *
 * ---------------------------------------------------------------------------
 * Colour: a dark building that still has to have a range
 * ---------------------------------------------------------------------------
 *
 * Borgund is coated in pine tar and is nearly black. Painting it that way gives
 * a 260-pixel cell with one value in it, so the model is laddered across the
 * three warm darks the palette has: `bark` for the shingles, `darkOlive` for the
 * ambulatory's own roof — the one plane the eye needs separated from the rest —
 * and `brown` for the staves, the wall planking and the dragons. All three are
 * on the warm side, which matters more here than anywhere: an ambulatory is a
 * covered walkway and everything inside it is in permanent shade, and the note
 * beside `ctx.palette` says what a neutral does there. The only cool colour in
 * the model is the `slate` stone sill, which is the one part of it that is not
 * wood.
 *
 * The dragons are `brown` against `bark` roofs rather than a bright colour they
 * never had. On the upper stages they are read against the sky, where the ink
 * does the drawing; on the lower ones the value step is what finds them.
 *
 * Proportion: 39.9 tall on a 23.2 half-diagonal, so 0.58 against the 2.0 cap.
 * No stretch — a stave church is genuinely taller than it is wide, which is most
 * of why it looks the way it does. No `realHeight`: the source list carries
 * none, and the figure usually quoted is for the turret of a building that is
 * mostly roof.
 */

/** The stone sill the whole frame stands on. */
const SILL = 16.4;
const SILL_TOP = 1.0;

/** The ambulatory: its wall, its posts and its lean-to roof. */
const AMBULATORY = 14.8;
const AMBULATORY_TOP = 4.4;
const EAVE = 15.9;

export const borgundStaveChurch: Monument = {
  id: 'borgund-stave-church',
  name: 'Borgund Stave Church',
  iso: 'NOR',
  lat: 61.0472,
  lon: 7.8125,
  tier: 'building',
  footprint: 24,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, taper, strut, around } = ctx;

    const shingle = palette.bark; // pine tar, on every roof but one
    const skirt = palette.darkOlive; // the ambulatory's roof, so it separates
    const timber = palette.brown; // staves, planking, dragons
    const stone = palette.slate; // the sill, and the only thing here that is not wood
    const shade = palette.tan; // inside the gallery arcade: warm, because it never sees the sun

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

    /** A roof, laid in two shingle courses so the ink finds the middle of it. */
    const roof = (
      bottom: number,
      top: number,
      y0: number,
      y1: number,
      color: number,
      split = 0.42,
    ): void => {
      const rise = y1 - y0;
      const middle = bottom + (top - bottom) * split;
      const lower = taper(bottom, middle, rise * split, color, 4);
      lower.position.y = y0;
      group.add(lower);
      const upper = taper(middle, top, rise * (1 - split), color, 4);
      upper.position.y = y0 + rise * split;
      group.add(upper);
    };

    // -----------------------------------------------------------------------
    // 1. The sill. A stave church has no foundation to speak of — it stands on
    //    a low stone footing, and without one the timber grows out of the grass.
    // -----------------------------------------------------------------------
    block(-SILL, SILL, 0, SILL_TOP, -SILL, SILL, stone);

    // -----------------------------------------------------------------------
    // 2. The ambulatory. A dark walled walk with an arcade of posts standing
    //    proud of it, open on the front and the two sides, closed at the back.
    //    The arcade is what tells you the building has a skin you can walk
    //    inside of, which is what the svalgang is for.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      block(side * AMBULATORY, side * EAVE, SILL_TOP, AMBULATORY_TOP, -EAVE, EAVE, shade);
      block(-EAVE, EAVE, SILL_TOP, AMBULATORY_TOP, side * AMBULATORY, side * EAVE, shade);
    }
    // The back is boarded to the eave; the other three sides are open above the
    // waist rail, which is the whole difference between a gallery and a wall.
    block(-EAVE, EAVE, AMBULATORY_TOP, 7.0, -EAVE, -AMBULATORY, timber);

    // Corner posts, then three more along the front and two down each side.
    const posts: [number, number][] = [
      [-EAVE + 0.7, -EAVE + 0.7],
      [EAVE - 0.7, -EAVE + 0.7],
      [-EAVE + 0.7, EAVE - 0.7],
      [EAVE - 0.7, EAVE - 0.7],
      [-8.4, EAVE - 0.7],
      [0, EAVE - 0.7],
      [8.4, EAVE - 0.7],
      [-EAVE + 0.7, -6.2],
      [-EAVE + 0.7, 6.2],
      [EAVE - 0.7, -6.2],
      [EAVE - 0.7, 6.2],
    ];
    for (const [x, z] of posts) {
      block(x - 0.72, x + 0.72, SILL_TOP, 7.0, z - 0.72, z + 0.72, timber);
    }

    // The lean-to roof over the gallery. It is the widest thing in the model and
    // the only roof that is not `bark`.
    roof(EAVE, 11.8, 7.0, 10.4, skirt, 0.4);

    // -----------------------------------------------------------------------
    // 3. The nave. Its wall is only visible in the band between the gallery's
    //    eave and its own roof — from the sheet's 13.4-degree camera the skirt
    //    hides everything under about 5.6 — so the planking and the staves are
    //    spent where they can be seen.
    // -----------------------------------------------------------------------
    block(-11.0, 11.0, SILL_TOP, 14.6, -11.0, 11.0, timber);
    // Vertical staves standing proud of the wall: this is the construction the
    // building is named for, and four to a face is enough for the ink to say so.
    for (const at of [-7.2, -2.4, 2.4, 7.2]) {
      block(at - 0.6, at + 0.6, 9.6, 14.6, 11.0, 11.55, shingle);
      block(at - 0.6, at + 0.6, 9.6, 14.6, -11.55, -11.0, shingle);
      block(11.0, 11.55, 9.6, 14.6, at - 0.6, at + 0.6, shingle);
      block(-11.55, -11.0, 9.6, 14.6, at - 0.6, at + 0.6, shingle);
    }
    roof(12.4, 8.6, 14.6, 21.0, shingle);

    // -----------------------------------------------------------------------
    // 4. Second stage, clerestory, turret. Each is a short wall and a steeper
    //    roof than the one below it, which is what makes the pile accelerate
    //    upward instead of tapering to a cone.
    // -----------------------------------------------------------------------
    block(-8.0, 8.0, 21.0, 23.6, -8.0, 8.0, timber);
    roof(9.0, 5.8, 23.6, 28.4, shingle);

    block(-5.2, 5.2, 28.4, 30.6, -5.2, 5.2, timber);
    // The clerestory openings: small dark quatrefoil lights, one to a face.
    for (const side of [-1, 1]) {
      block(-1.5, 1.5, 29.0, 30.2, side * 5.2, side * 5.55, shade);
      block(side * 5.2, side * 5.55, 29.0, 30.2, -1.5, 1.5, shade);
    }
    roof(6.0, 3.4, 30.6, 33.2, shingle);

    block(-2.9, 2.9, 33.2, 35.0, -2.9, 2.9, timber);
    for (const side of [-1, 1]) {
      block(-1.0, 1.0, 33.5, 34.7, side * 2.9, side * 3.2, shade);
      block(side * 2.9, side * 3.2, 33.5, 34.7, -1.0, 1.0, shade);
    }

    // The spire. One taper, not two: at this size a second course on a 4-unit
    // cone is a ring the eye reads as a fault rather than as a shingle line.
    // The turret spire: 4.6 tall on a 6.8 base. A stave church's top is a
    // needle and a blunt cap on it reads as a hat, which is what 3.4 gave.
    const spire = taper(3.4, 0.28, 4.6, shingle, 4);
    spire.position.y = 35.0;
    group.add(spire);
    const finial = box(0.34, 1.8, 0.34, timber);
    finial.position.y = 38.1;
    group.add(finial);
    const arm = box(1.5, 0.34, 0.34, timber);
    arm.position.set(0, 38.7, 0);
    group.add(arm);

    // -----------------------------------------------------------------------
    // 5. The dragons. Eight of them, on the diagonals — the roofs are four-sided
    //    tapers, so their corners *are* the diagonals — sweeping up and out from
    //    the ridge ends of the nave roof and the second-stage roof.
    //
    //    The pivot carries a rotation and no scale of its own. `T * R * S` puts
    //    scale first, and a neck scaled in the axes it would have had after its
    //    yaw is the fault that buried ten of Charles Bridge's piers.
    // -----------------------------------------------------------------------
    const dragons = new THREE.Group();
    dragons.rotation.y = Math.PI / 4;
    group.add(dragons);

    /** One beast: a neck off the corner, a head, and a jaw under it. */
    const dragon = (base: number, y0: number, reach: number, rise: number, size: number): Group => {
      const beast = new THREE.Group();
      const from = new THREE.Vector3(0, y0, base);
      const to = new THREE.Vector3(0, y0 + rise, base + reach);
      beast.add(strut(from, to, size * 0.62, timber));

      const head = box(size * 0.9, size * 0.8, size * 1.5, timber);
      head.position.set(0, to.y - size * 0.1, to.z + size * 0.5);
      beast.add(head);

      // The jaw, dropped and thrown forward. It is what stops a head reading as
      // the end of a stick.
      const jaw = box(size * 0.55, size * 0.42, size * 1.1, timber);
      jaw.position.set(0, to.y - size * 0.5, to.z + size * 0.95);
      beast.add(jaw);
      return beast;
    };

    // The four big ones, off the nave roof's corners.
    dragons.add(around(4, () => dragon(11.4, 15.4, 4.6, 5.4, 1.5)));
    // The four small ones, off the second stage.
    dragons.add(around(4, () => dragon(8.2, 24.2, 3.2, 3.8, 1.05)));

    // -----------------------------------------------------------------------
    // 6. The west door. Borgund's portal is the most carved thing in Norway and
    //    none of that survives at 260 pixels; what does is a tall dark opening
    //    with a heavy frame, under the gallery roof.
    // -----------------------------------------------------------------------
    block(-1.9, 1.9, SILL_TOP, 6.2, EAVE - 0.4, EAVE + 0.05, palette.bark);
    for (const side of [-1, 1]) {
      block(side * 1.9, side * 2.8, SILL_TOP, 7.0, EAVE - 0.2, EAVE + 0.45, timber);
    }
    block(-2.8, 2.8, 6.2, 7.0, EAVE - 0.2, EAVE + 0.45, timber);

    return group;
  },
};

import type { Monument } from './contract.ts';

/**
 * St Peter's Basilica.
 *
 * Three things have to survive at thumbnail size, and every trade below was made
 * to protect one of them:
 *
 * 1. **Michelangelo's dome** — ribbed, on a tall colonnaded drum, under a
 *    lantern. It is the tallest dome in the world and it is the whole read.
 * 2. **Maderno's façade** — wide, comparatively low, a giant order across it and
 *    an attic with statues above. It is what makes the dome look like it is
 *    receding behind the building, and that famous problem is worth keeping.
 * 3. **Bernini's colonnade** — two curved arms of columns embracing an oval
 *    piazza.
 *
 * **The colonnade is what chose the tier.** Its oval is 240 m across, so it needs
 * the widest footprint the contract offers, and only `building` and `landmark`
 * have 55. `building` caps the model at 40 units, which would make the tallest
 * dome in the world shorter than the Colosseum's outer wall, so: `landmark`, at
 * 55 and 120. Nothing under a 55-unit footprint can hold the colonnade and a
 * 118-unit dome at once, which is why the plan is squeezed rather than the
 * height.
 *
 * **The numbers of the squeeze.** Heights run at 0.86 units per metre — the
 * cross tip is 136.6 m and lands at 117.6. The basilica's *plan* runs at 0.59
 * (the 114.7 m façade is 68 units, the 58.9 m drum is 34.8), so the plan is
 * compressed **1.45:1** against the heights. The piazza is compressed harder,
 * **1.85:1** (the 120 m semi-axis of the oval is 48 units, and the drum's own
 * scale would have made it 71), because at the basilica's scale the arms would
 * reach 71 units out and there is no tier that wide. The consequence is
 * deliberate: the arms clear the façade's edge by 14 units a side instead of the
 * 63 m they clear in life. They still read as arms, and the alternative — one
 * honest scale everywhere — puts the whole complex at 63 units tall, which is
 * half a landmark.
 *
 * **What was cropped, and by how much.**
 *
 * - **The far half of the colonnade, and both corridors.** In life the arms sweep
 *   round the oval and are joined to the façade by two straight converging
 *   corridors across the *piazza retta*. Here the arms run 22°–158° of the oval
 *   and simply die where the corridors would start, a few units in front of the
 *   façade. What is cut is the trapezoid between oval and church, which is
 *   invisible in every photograph anyway because you are standing in it.
 * - **Four rows of columns became one.** 284 Doric columns become 24 — twelve an
 *   arm, spaced by arc length so the rhythm stays even where the oval turns. Four
 *   rows deep would be 4x the mesh count for a depth the outline flattens.
 * - **The 140 statues over the colonnade are gone.** 140 boxes is the whole tier.
 *   The 13 on the façade balustrade stayed, at 7 of 13, because that skyline is
 *   part of what makes the façade read as low and horizontal.
 * - **The nave, the transepts and the apse are one block.** The basilica is 220 m
 *   long; at any scale that keeps the dome fat, its length leaves the footprint
 *   circle. The block is 33 units deep against the 78 the plan scale would want,
 *   so the *depth* is cropped 2.4:1 on top of the plan squeeze. This is the one
 *   crop that costs something real — it pulls the dome forward — so it was held
 *   to the point where the dome's drum still clears the façade's attic with the
 *   nave roof visible between them. The dome recedes; it does not hide. A
 *   monument you cannot see the dome of is not a monument.
 * - **The lantern's own sixteen columns** are one octagonal drum. At 6 units tall
 *   and 110 units up, nothing else survives.
 *
 * **Two departures that are not crops.**
 *
 * - **Twelve ribs where life has sixteen.** Each rib is two struts, because a
 *   single chord under a convex dome sinks inside the shell at mid-height — the
 *   shell bulges 1.5 units above the chord, more than a rib is thick. Twelve
 *   ribs at two struts each is 24 meshes; sixteen would be 32, and the tier has
 *   130. Nobody counts ribs at thumbnail size; they count *ribbed*.
 * - **The shell is twelve-sided and the ribs sit on its twelve creases.** Flat
 *   shading gives each facet its own cel band and the rib inks the join, so the
 *   facet count and the rib count are the same decision.
 *
 * **Colour.** The shell is `slate` and the ribs are `white`, which is not a
 * stylisation: the shell is lead and the ribs are travertine, and that contrast
 * is most of what you recognise the dome by. `slate` is the one cool entry in
 * the model and it is used deliberately, on a large convex sunlit mass rather
 * than in a recess — but the note on `palette` says it loses to blue in shade,
 * so the ribs went from `cream` to `white` to keep drawing the dome's shape
 * across the half of it that turns away from the sun.
 */

// --- the piazza floor, an oval slightly wider than the colonnade stands on ---
const PAVING = { a: 50, b: 23, z: 13, height: 0.9 };

// --- Bernini's oval: semi-axes of the line the columns stand on ---
const OVAL = { a: 48, b: 21, z: 13 };
/** Degrees around the oval, measured from its front. The gap is the piazza's mouth. */
const ARM = { from: 22, to: 158, columns: 12, bays: 6 };
const COLONNADE = { radius: 1.4, height: 16.4, cornice: 2.8, depth: 5.4 };
const COLONNADE_TOP = PAVING.height + COLONNADE.height;

// --- the obelisk, on the oval's centre ---
const OBELISK = { shaft: 20, tip: 2 };

// --- Maderno's façade ---
const FACADE = { half: 34, front: -8, back: -14 };
const PEDESTAL_TOP = 5;
const ORDER_TOP = 31;
const ENTABLATURE_TOP = 34;
const ATTIC_TOP = 38.5;
const BALUSTRADE_TOP = 40;
const STATUE_HEIGHT = 4;
/** Half the giant order: eight columns across the front, mirrored. */
const GIANT_ORDER = [5.6, 14.2, 22.4, 30.6];
const STATUES = [0, 10, 20, 30];
const PORTALS = [0, 9.9];

// --- the body. Nave, transepts and apse in one block; see the crop note above ---
const BODY = { half: 25, top: 44, centre: -30, depth: 33 };
const BODY_CORNICE = { half: 26, top: 48, depth: 34 };

// --- Michelangelo's dome ---
const DOME_Z = BODY.centre;
const TRANSITION = { radius: 15, top: 54 };
const DRUM = { radius: 14.2, top: 72, ring: 15.6, column: 1.05, count: 16 };
const DRUM_CORNICE = { inner: 14.2, outer: 17.2, top: 73.7 };
const DRUM_ATTIC = { radius: 14.6, top: 79 };

/**
 * Half-widths up the shell, from the springing to the lantern. Michelangelo's
 * dome is ogival — the slope steepens all the way, which is what separates it
 * from a hemisphere and from the Pantheon.
 */
const SHELL = [
  { y: 79, r: 14.6 },
  { y: 85.5, r: 13.6 },
  { y: 91.5, r: 11.2 },
  { y: 96.5, r: 7.6 },
  { y: 101, r: 3.6 },
];
const SHELL_SIDES = 12;
/** How far a rib stands off the shell's creases. Enough to clear the bulge. */
const RIB = { count: 12, out: 1.3, thickness: 1.1, from: 80, waist: 91.5, to: 100.3 };

const LANTERN = { base: 101, drum: 103, cap: 109, ball: 112.5, cross: 114.3 };

// --- Vignola's two small domes, flanking the great one ---
const MINOR = { x: 19, z: -27, base: 48 };

export const stPetersBasilica: Monument = {
  id: 'st-peters-basilica',
  name: "St Peter's Basilica",
  iso: 'ITA',
  lat: 41.902,
  lon: 12.454,
  realHeight: 136,
  tier: 'landmark',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut, ringWall, around } = ctx;
    // Every entry here is warm, and one of them was chosen twice. The colonnade
    // is the exact case the note on `palette` describes — a picket of columns
    // with cyan sky in every gap — so its shafts are `sand` and its cornice
    // `brown`, not the `bone` a photograph of travertine suggests. `bone` loses
    // its hue in shade and the arms would have read as a gap in the ground.
    const travertine = palette.cream;
    const marble = palette.white;
    const trim = palette.tan;
    const doric = palette.sand;
    const cornice = palette.brown;
    const lead = palette.slate;
    const paving = palette.tan;
    const granite = palette.clay;
    const shadow = palette.bark;
    const gilt = palette.gold;

    const group = new THREE.Group();

    // -----------------------------------------------------------------------
    // The piazza
    // -----------------------------------------------------------------------

    // One disc scaled into an oval: every radius in this file stays an honest
    // number and the ink still gets a single clean edge round the whole piazza.
    const floor = column(1, PAVING.height, paving, 20);
    floor.scale.set(PAVING.a, 1, PAVING.b);
    floor.position.z = PAVING.z;
    group.add(floor);

    const obelisk = taper(1.6, 1, OBELISK.shaft, granite, 4);
    obelisk.position.set(0, PAVING.height, OVAL.z);
    group.add(obelisk);

    const pyramidion = taper(1, 0.12, OBELISK.tip, gilt, 4);
    pyramidion.position.set(0, PAVING.height + OBELISK.shaft, OVAL.z);
    group.add(pyramidion);

    // -----------------------------------------------------------------------
    // Bernini's colonnade
    // -----------------------------------------------------------------------

    const from = (ARM.from * Math.PI) / 180;
    const to = (ARM.to * Math.PI) / 180;
    const at = (phi: number) => ({
      x: OVAL.a * Math.sin(phi),
      z: OVAL.z + OVAL.b * Math.cos(phi),
    });

    // Spacing an ellipse by angle bunches the columns at the ends — the arc
    // element runs from 22 units per radian at the flank to 47 at the mouth, so
    // by angle the mouth would be twice as open as the flank. Walk the arc once
    // and place by length instead.
    const STEPS = 120;
    const table: number[] = [0];
    let previous = at(from);
    for (let i = 1; i <= STEPS; i++) {
      const point = at(from + ((to - from) * i) / STEPS);
      table.push(table[i - 1]! + Math.hypot(point.x - previous.x, point.z - previous.z));
      previous = point;
    }
    const length = table[STEPS]!;

    const alongArc = (t: number) => {
      const target = t * length;
      let i = 1;
      while (i < STEPS && table[i]! < target) i++;
      const lo = table[i - 1]!;
      const hi = table[i]!;
      const fraction = hi > lo ? (target - lo) / (hi - lo) : 0;
      return at(from + ((to - from) * (i - 1 + fraction)) / STEPS);
    };

    for (const side of [1, -1]) {
      for (let i = 0; i < ARM.columns; i++) {
        const point = alongArc((i + 0.5) / ARM.columns);
        const shaft = column(COLONNADE.radius, COLONNADE.height, doric, 8);
        shaft.position.set(side * point.x, PAVING.height, point.z);
        group.add(shaft);
      }

      // The entablature is chorded two columns at a time. Across a sixth of the
      // arc the chord falls under a unit short of the curve, which the cornice's
      // own depth swallows.
      for (let bay = 0; bay < ARM.bays; bay++) {
        const a = alongArc(bay / ARM.bays);
        const b = alongArc((bay + 1) / ARM.bays);
        const dx = side * (b.x - a.x);
        const dz = b.z - a.z;
        const span = Math.hypot(dx, dz);
        const beam = box(span * 1.04, COLONNADE.cornice, COLONNADE.depth, cornice);
        beam.position.set((side * (a.x + b.x)) / 2, COLONNADE_TOP, (a.z + b.z) / 2);
        beam.rotation.y = Math.atan2(-dz, dx);
        group.add(beam);
      }
    }

    // -----------------------------------------------------------------------
    // Maderno's façade
    // -----------------------------------------------------------------------

    const facadeDepth = FACADE.front - FACADE.back;
    const facadeZ = (FACADE.front + FACADE.back) / 2;

    const steps = box(52, 3.2, 9, trim);
    steps.position.z = FACADE.front + 4.5;
    group.add(steps);

    const wall = box(FACADE.half * 2, ORDER_TOP, facadeDepth, travertine);
    wall.position.z = facadeZ;
    group.add(wall);

    const pedestal = box(FACADE.half * 2 + 1, PEDESTAL_TOP, facadeDepth + 1, trim);
    pedestal.position.z = facadeZ + 0.5;
    group.add(pedestal);

    // The giant order. Free-standing in front of the wall rather than engaged in
    // it: the ink needs daylight down each side or the eight of them merge into
    // the marble behind.
    for (const offset of GIANT_ORDER) {
      for (const side of [1, -1]) {
        const shaft = column(1.6, ORDER_TOP - PEDESTAL_TOP, travertine, 6);
        shaft.position.set(side * offset, PEDESTAL_TOP, FACADE.front + 1.4);
        group.add(shaft);
      }
    }

    const entablature = box(FACADE.half * 2 + 2, ENTABLATURE_TOP - ORDER_TOP, facadeDepth + 2, trim);
    entablature.position.set(0, ORDER_TOP, facadeZ + 0.5);
    group.add(entablature);

    const attic = box(FACADE.half * 2, ATTIC_TOP - ENTABLATURE_TOP, facadeDepth + 0.5, travertine);
    attic.position.set(0, ENTABLATURE_TOP, facadeZ + 0.25);
    group.add(attic);

    const balustrade = box(FACADE.half * 2 + 1, BALUSTRADE_TOP - ATTIC_TOP, facadeDepth + 1, trim);
    balustrade.position.set(0, ATTIC_TOP, facadeZ + 0.5);
    group.add(balustrade);

    for (const offset of STATUES) {
      for (const side of offset === 0 ? [1] : [1, -1]) {
        const statue = box(1.5, STATUE_HEIGHT, 1.5, marble);
        statue.position.set(side * offset, BALUSTRADE_TOP, FACADE.front - 1.5);
        group.add(statue);
      }
    }

    // The central pediment, standing in front of the attic rather than cut into
    // it. A four-sided taper is a pyramid; squashed in z it is the triangle, and
    // the triangle is the whole of what reaches the eye.
    const pediment = taper(9, 0.5, 5, travertine, 4);
    pediment.scale.z = 3 / 18;
    pediment.position.set(0, ENTABLATURE_TOP, FACADE.front + 2);
    group.add(pediment);

    // The portals: dark panels standing proud of the wall, which the outline
    // turns into shadowed openings for one mesh each.
    for (const offset of PORTALS) {
      for (const side of offset === 0 ? [1] : [1, -1]) {
        const portal = box(4.5, 10, 1.2, shadow);
        portal.position.set(side * offset, PEDESTAL_TOP, FACADE.front + 0.6);
        group.add(portal);
      }
    }

    // -----------------------------------------------------------------------
    // The body, and the dome above it
    // -----------------------------------------------------------------------

    const body = box(BODY.half * 2, BODY.top, BODY.depth, travertine);
    body.position.z = BODY.centre;
    group.add(body);

    const bodyCornice = box(BODY_CORNICE.half * 2, BODY_CORNICE.top - BODY.top, BODY_CORNICE.depth, trim);
    bodyCornice.position.set(0, BODY.top, BODY.centre);
    group.add(bodyCornice);

    for (const side of [1, -1]) {
      const minorDrum = column(4.2, 5, travertine, 8);
      minorDrum.position.set(side * MINOR.x, MINOR.base, MINOR.z);
      group.add(minorDrum);

      const minorCap = taper(4.2, 0.6, 6, lead, 8);
      minorCap.position.set(side * MINOR.x, MINOR.base + 5, MINOR.z);
      group.add(minorCap);
    }

    // The octagon that carries the drum off the square crossing.
    const transition = column(TRANSITION.radius, TRANSITION.top - BODY_CORNICE.top, travertine, 8);
    transition.position.set(0, BODY_CORNICE.top, DOME_Z);
    group.add(transition);

    const drum = column(DRUM.radius, DRUM.top - TRANSITION.top, travertine, 16);
    drum.position.set(0, TRANSITION.top, DOME_Z);
    group.add(drum);

    // Sixteen buttress columns round the drum. This ring is the second half of
    // the dome's read: without it the drum is a chimney.
    const buttresses = around(DRUM.count, () => {
      const shaft = column(DRUM.column, DRUM_CORNICE.top - TRANSITION.top - 0.5, travertine, 8);
      shaft.position.set(0, TRANSITION.top + 0.5, DRUM.ring);
      return shaft;
    });
    buttresses.position.z = DOME_Z;
    group.add(buttresses);

    const drumCornice = ringWall(
      DRUM_CORNICE.inner,
      DRUM_CORNICE.outer,
      DRUM_CORNICE.top - DRUM.top,
      trim,
      16,
    );
    drumCornice.position.set(0, DRUM.top, DOME_Z);
    group.add(drumCornice);

    const drumAttic = column(DRUM_ATTIC.radius, DRUM_ATTIC.top - DRUM_CORNICE.top, travertine, 16);
    drumAttic.position.set(0, DRUM_CORNICE.top, DOME_Z);
    group.add(drumAttic);

    for (let i = 0; i + 1 < SHELL.length; i++) {
      const a = SHELL[i]!;
      const b = SHELL[i + 1]!;
      const section = taper(a.r, b.r, b.y - a.y, lead, SHELL_SIDES);
      section.position.set(0, a.y, DOME_Z);
      group.add(section);
    }

    // The ribs. Two struts apiece, because a single chord from springing to
    // lantern passes a unit and a half *inside* the shell at mid-height.
    const creaseFactor = 1 / Math.cos(Math.PI / SHELL_SIDES);
    const shellAt = (y: number) => {
      for (let i = 0; i + 1 < SHELL.length; i++) {
        const a = SHELL[i]!;
        const b = SHELL[i + 1]!;
        if (y <= b.y || i === SHELL.length - 2) {
          return (a.r + ((b.r - a.r) * (y - a.y)) / (b.y - a.y)) * creaseFactor;
        }
      }
      return SHELL[0]!.r * creaseFactor;
    };

    const ribs = around(RIB.count, () => {
      const rib = new THREE.Group();
      const knots = [RIB.from, RIB.waist, RIB.to];
      for (let i = 0; i + 1 < knots.length; i++) {
        const y0 = knots[i]!;
        const y1 = knots[i + 1]!;
        rib.add(
          strut(
            new THREE.Vector3(0, y0, shellAt(y0) + RIB.out),
            new THREE.Vector3(0, y1, shellAt(y1) + RIB.out),
            RIB.thickness,
            marble,
          ),
        );
      }
      return rib;
    });
    // Half a segment, so the ribs land on the shell's creases rather than the
    // middle of its facets.
    ribs.rotation.y = Math.PI / SHELL_SIDES;
    ribs.position.z = DOME_Z;
    group.add(ribs);

    // -----------------------------------------------------------------------
    // The lantern
    // -----------------------------------------------------------------------

    const lanternBase = column(4.4, LANTERN.drum - LANTERN.base, trim, 12);
    lanternBase.position.set(0, LANTERN.base, DOME_Z);
    group.add(lanternBase);

    const lanternDrum = column(3.2, LANTERN.cap - LANTERN.drum, travertine, 8);
    lanternDrum.position.set(0, LANTERN.drum, DOME_Z);
    group.add(lanternDrum);

    const lanternCap = taper(3.6, 0.9, LANTERN.ball - LANTERN.cap, travertine, 8);
    lanternCap.position.set(0, LANTERN.cap, DOME_Z);
    group.add(lanternCap);

    const ball = column(1, LANTERN.cross - LANTERN.ball, gilt, 6);
    ball.position.set(0, LANTERN.ball, DOME_Z);
    group.add(ball);

    const upright = box(0.5, 3.3, 0.5, gilt);
    upright.position.set(0, LANTERN.cross, DOME_Z);
    group.add(upright);

    const crossbar = box(2.2, 0.5, 0.5, gilt);
    crossbar.position.set(0, LANTERN.cross + 1.6, DOME_Z);
    group.add(crossbar);

    return group;
  },
};

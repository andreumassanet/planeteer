import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * St Peter's Basilica.
 *
 * Three things carry it: Michelangelo's ribbed dome on a colonnaded drum under
 * a lantern, Maderno's wide low façade (giant order, attic with statues), and
 * Bernini's colonnade of two curved arms round an oval piazza.
 *
 * Tier `landmark`: the colonnade needs the 55-unit footprint and the dome the
 * 120-unit height, which only `landmark` offers together. Heights run at 0.86
 * units per metre (the cross tip is 136.6 m, 117.6 units) but the basilica's
 * plan at 0.59, and the piazza is compressed harder (1.85:1 against the
 * heights), so the arms clear the façade by 14 units a side instead of 63 m.
 *
 * Cropped:
 * - The arms run 22 to 158 degrees of the oval and end where the corridors to
 *   the façade would start.
 * - 284 Doric columns become 24, twelve an arm, spaced by arc length.
 * - The 140 statues over the colonnade are gone; 7 of the 13 on the façade
 *   balustrade stay, as that skyline makes the façade read low and horizontal.
 * - Nave, transepts and apse are one block 33 units deep (the plan scale would
 *   want 78), held to where the drum still clears the attic.
 * - The lantern's sixteen columns are one octagonal drum.
 *
 * The dome has twelve ribs where life has sixteen, each of two struts (a single
 * chord sinks inside the convex shell by 1.5 units), sitting on the twelve
 * creases of a twelve-sided shell. The shell is `slate` (lead) and the ribs
 * `white` (travertine); `white` keeps drawing the dome's shape on its shaded
 * side.
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
    // Every entry is warm: a colonnade is a picket of columns with sky in every
    // gap, so its shafts are `sand` and its cornice `brown`, not `bone`, which
    // loses its hue in shade.
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

    // --- the piazza ---

    // One disc scaled into an oval, so every radius stays an honest number.
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

    // --- Bernini's colonnade ---

    const from = (ARM.from * Math.PI) / 180;
    const to = (ARM.to * Math.PI) / 180;
    const at = (phi: number) => ({
      x: OVAL.a * Math.sin(phi),
      z: OVAL.z + OVAL.b * Math.cos(phi),
    });

    // Spacing an ellipse by angle bunches the columns at the ends (the arc
    // element runs from 22 units per radian at the flank to 47 at the mouth), so
    // walk the arc once and place by length.
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

      // The entablature is chorded two columns at a time; the chord falls under a
      // unit short of the curve, which the cornice's depth hides.
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

    // --- Maderno's façade ---

    const facadeDepth = FACADE.front - FACADE.back;
    const facadeZ = (FACADE.front + FACADE.back) / 2;

    const steps = box(52, 3.2, 9, trim);
    steps.position.z = FACADE.front + 4.5;
    group.add(steps);

    const wall = box(FACADE.half * 2, ORDER_TOP, facadeDepth, travertine);
    wall.position.z = facadeZ;
    group.add(wall);

    // Its back stops `PROUD` inside the wall's so the two colours do not share a plane.
    const pedestal = box(FACADE.half * 2 + 1, PEDESTAL_TOP, facadeDepth + 1 - PROUD, trim);
    pedestal.position.z = facadeZ + 0.5 + PROUD / 2;
    group.add(pedestal);

    // The giant order stands in front of the wall so the ink has daylight down each side.
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

    // The central pediment: a four-sided taper squashed in z is the triangle.
    const pediment = taper(9, 0.5, 5, travertine, 4);
    pediment.scale.z = 3 / 18;
    pediment.position.set(0, ENTABLATURE_TOP, FACADE.front + 2);
    group.add(pediment);

    // The portals: dark panels standing proud of the wall.
    for (const offset of PORTALS) {
      for (const side of offset === 0 ? [1] : [1, -1]) {
        const portal = box(4.5, 10, 1.2, shadow);
        portal.position.set(side * offset, PEDESTAL_TOP, FACADE.front + 0.6);
        group.add(portal);
      }
    }

    // --- the body, and the dome above it ---

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

    // Sixteen buttress columns round the drum, so it is not a chimney. Each stops
    // `PROUD` inside the cornice it runs up into.
    const buttresses = around(DRUM.count, () => {
      const shaft = column(DRUM.column, DRUM_CORNICE.top - TRANSITION.top - 0.5 - PROUD, travertine, 8);
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

    // The ribs, two struts apiece (see the header).
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
    // Half a segment, so the ribs land on the shell's creases.
    ribs.rotation.y = Math.PI / SHELL_SIDES;
    ribs.position.z = DOME_Z;
    group.add(ribs);

    // --- the lantern ---

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

import { PROUD } from './contract.ts';
import type { Mesh, Monument } from './contract.ts';

/**
 * El Capitolio, Havana — the capitol on the Paseo del Prado.
 *
 * What has to survive at thumbnail size, in order:
 *
 * 1. **The dome on its colonnaded drum**, a ring of columns under a cornice,
 *    an attic, a ribbed stone shell and a lantern. It is Havana's skyline and
 *    the reason the building is named from across the city.
 * 2. **The length.** Two long wings, the Senate's and the House's, run out
 *    either side of the central block, each fronted by a colonnade between a
 *    plain end pavilion and the centre, all on one rusticated podium. A dome
 *    on a short block is any capitol; a dome over a long low front with its
 *    columns marching the whole way is this one.
 * 3. **The portico and the stair**: a row of columns across the centre (twelve
 *    here), under a flat entablature and attic with no pediment, reached by the broad flight
 *    up the podium, with Zanelli's two bronze groups on pedestals either side
 *    of it.
 *
 * **Scale.** One scale throughout and no squeeze: 0.435 units a metre, so the
 * 92 m to the lantern's tip is the `building` tier's 40, and the 207 m front is
 * 88.6 units. That half-length against the wings' depth is a half-diagonal of
 * 45.5, under the 55-unit footprint cap and well inside `MAX_ASPECT` (it is
 * 1.14 of the height, against 2 allowed). `landmark` was weighed and refused:
 * its 120 units would want a 135-unit half-length, so the plan would have had
 * to be squeezed 2.7:1, and the long front is half of what is recognised.
 *
 * **What was cut.** The podium's rustication is one block; the wings'
 * colonnades are seven columns each, not the full count; the lantern's own
 * columns are one drum; the dome's ribs are eight, each two struts so the rib
 * clears the shell's bulge at mid-height (see `st-peters-basilica.ts`).
 *
 * **Orientation.** The front faces east onto the Prado. `placement.ts` turns
 * +Z north and +X west, so the model is drawn front-on to +Z and turned a
 * quarter the other way (`rotation.y = -PI / 2`) before it is merged; the
 * contact sheet's front view sees its south end and the quarter view the
 * front.
 *
 * **Colour.** The stone is a pale limestone: walls `cream`, columns and dome
 * `white`, cornices and podium `tan` toned light. Everything behind a
 * colonnade is faced in `sand`, the warm recess the note on `palette` asks for,
 * with `bark` windows and doors standing proud of it; the bronzes `darkOlive`
 * for their patina; the finial `gold`.
 *
 * Drawn through `ctx.merge` as one mesh a colour.
 */

// --- the podium, the ground storey everything stands on -----------------------
const FLOOR = 4;

// --- the wings ----------------------------------------------------------------
/** Inner and outer ends of a wing in x, its back and its front wall in z. */
const WING = { inner: 14, outer: 44, back: -10, face: 3.3, top: 12 };
/** The end pavilion, standing forward of the colonnade. */
const PAVILION = { from: 36, front: 6 };
/** The colonnade's columns and the beam they carry. */
const WING_ROW = { z: 4.9, radius: 0.42, from: 15.6, to: 34.4, count: 7, beam: 11 };
const CORNICE = 0.9;
const BALUSTRADE = 0.9;

// --- the central block and its portico -------------------------------------------
const CENTRE = { half: 14, back: -18, face: 7, top: 14 };
/** The two solid bays either side of the portico. */
const BAY = { half: 11, front: 8.6 };
const PORTICO = { z: 9.6, half: 10.2, count: 12, radius: 0.45, beam: 11, attic: 13.6, front: 10.4 };

// --- the stair and the bronzes -------------------------------------------------
const STEPS = 10;
const TREAD = 1.16;
const STAIR_HALF = 10;
const PEDESTAL = { x: 12.4, z: 16, width: 2.6, height: 2.4, depth: 3.4 };

// --- the dome ---------------------------------------------------------------------
const DOME_Z = -5.5;
const DRUM_BASE = { half: 9.5, from: CENTRE.top + CORNICE, top: 17.5 };
const DRUM = { radius: 7, top: 24.5 };
const PERISTYLE = { ring: 8, radius: 0.42, count: 16, top: 24 };
const DRUM_CORNICE = { inner: 6.9, outer: 9, top: 25 };
const ATTIC = { radius: 7.4, top: 27 };
/** Half-widths up the shell, from its springing to the lantern's foot. */
const SHELL = [
  { y: 27, r: 7.0 },
  { y: 30, r: 6.3 },
  { y: 32.4, r: 4.8 },
  { y: 34, r: 2.6 },
];
const SHELL_SIDES = 16;
const RIB = { count: 8, out: 0.7, thickness: 0.7, from: 27.4, waist: 30.6, to: 33.8 };
const LANTERN = { radius: 2.1, from: 34, cap: 36.6, finial: 38.6, top: 40 };

export const elCapitolio: Monument = {
  id: 'el-capitolio',
  name: 'El Capitolio',
  iso: 'CUB',
  lat: 23.1352,
  lon: -82.3597,
  realHeight: 92,
  tier: 'building',
  footprint: 46,

  build(ctx) {
    const { THREE, palette, tone, box, column, taper, strut, ringWall, around } = ctx;
    const wall = palette.cream;
    const marble = palette.white;
    const trim = tone(palette.tan, 1.3);
    const podium = tone(palette.tan, 1.15);
    const recess = palette.sand;
    const dark = palette.bark;
    const bronze = palette.darkOlive;
    const gilt = palette.gold;

    const draft = new THREE.Group();
    // Drawn facing +Z and turned to face east; see above.
    const site = new THREE.Group();
    site.rotation.y = -Math.PI / 2;
    draft.add(site);
    const placed = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      site.add(mesh);
      return mesh;
    };
    /** A box spanning x0..x1 and z0..z1, standing on y. */
    const span = (x0: number, x1: number, y: number, height: number, z0: number, z1: number, color: number): Mesh =>
      placed(box(x1 - x0, height, z1 - z0, color), (x0 + x1) / 2, y, (z0 + z1) / 2);

    // --- the podium: the wings' length, and deeper under the centre ---
    span(-WING.outer - 0.3, WING.outer + 0.3, 0, FLOOR, WING.back - 0.3, PAVILION.front + 0.3, podium);
    span(-CENTRE.half - 0.3, CENTRE.half + 0.3, 0, FLOOR, CENTRE.back - 0.3, PORTICO.front, podium);

    // --- the two wings ---
    for (const side of [1, -1]) {
      const x = (a: number, b: number): [number, number] => (side > 0 ? [a, b] : [-b, -a]);
      const [w0, w1] = x(WING.inner, PAVILION.from);
      span(w0, w1, FLOOR, WING.top - FLOOR, WING.back, WING.face, wall);
      // The face behind the colonnade, in the warm recess colour.
      span(w0, w1, FLOOR, WING_ROW.beam - FLOOR, WING.face, WING.face + 0.3, recess);
      // The beam over the columns, back over the recess face so its top is hidden.
      span(w0, w1, WING_ROW.beam, WING.top - WING_ROW.beam, WING.face, WING_ROW.z + 0.7, trim);

      const pitch = (WING_ROW.to - WING_ROW.from) / (WING_ROW.count - 1);
      for (let i = 0; i < WING_ROW.count; i++) {
        placed(column(WING_ROW.radius, WING_ROW.beam - FLOOR, marble, 6), side * (WING_ROW.from + i * pitch), FLOOR, WING_ROW.z);
        // A tall window in every bay, proud of the recess face.
        if (i < WING_ROW.count - 1) {
          placed(box(1.4, 4.4, 0.2, dark), side * (WING_ROW.from + (i + 0.5) * pitch), FLOOR + 1.2, WING.face + 0.4);
        }
      }

      // The end pavilion, standing forward of the colonnade: two pilasters
      // and a window between them on its front.
      const [p0, p1] = x(PAVILION.from, WING.outer);
      span(p0, p1, FLOOR, WING.top - FLOOR, WING.back, PAVILION.front, wall);
      const mid = side * (PAVILION.from + WING.outer) / 2;
      for (const dx of [-3, 3]) placed(box(1.1, WING.top - FLOOR - PROUD, 0.4, marble), mid + dx, FLOOR, PAVILION.front + 0.2);
      placed(box(2.2, 5.2, 0.2, dark), mid, FLOOR + 1.4, PAVILION.front + 0.1);

      // One cornice over the whole wing and a balustrade set back on it.
      const [c0, c1] = x(WING.inner, WING.outer + 0.3);
      span(c0, c1, WING.top, CORNICE, WING.back - 0.3, PAVILION.front + 0.3, trim);
      const [b0, b1] = x(WING.inner, WING.outer - 0.1);
      span(b0, b1, WING.top + CORNICE, BALUSTRADE, WING.back + 0.1, PAVILION.front - 0.1, wall);
    }

    // --- the central block, its bays and the portico ---
    span(-CENTRE.half, CENTRE.half, FLOOR, CENTRE.top - FLOOR, CENTRE.back, CENTRE.face, wall);
    for (const side of [1, -1]) {
      const [a, b] = side > 0 ? [BAY.half, CENTRE.half] : [-CENTRE.half, -BAY.half];
      span(a, b, FLOOR, CENTRE.top - FLOOR, CENTRE.face, BAY.front, wall);
      placed(box(1.6, 4.6, 0.2, dark), (a + b) / 2, FLOOR + 1.6, BAY.front + 0.1);
    }
    span(-BAY.half, BAY.half, FLOOR, PORTICO.beam - FLOOR, CENTRE.face, CENTRE.face + 0.3, recess);
    // The bronze doors.
    placed(box(3.4, 5.0, 0.2, dark), 0, FLOOR, CENTRE.face + 0.4);
    for (const x of [-6.2, 6.2]) placed(box(1.6, 4.2, 0.2, dark), x, FLOOR + 1.2, CENTRE.face + 0.4);

    const pitch = (PORTICO.half * 2) / (PORTICO.count - 1);
    for (let i = 0; i < PORTICO.count; i++) {
      placed(column(PORTICO.radius, PORTICO.beam - FLOOR, marble, 6), -PORTICO.half + i * pitch, FLOOR, PORTICO.z);
    }
    // The flat entablature and the attic over it, with no pediment.
    span(-BAY.half, BAY.half, PORTICO.beam, 1.6, CENTRE.face, PORTICO.front, trim);
    span(-BAY.half + 0.3, BAY.half - 0.3, PORTICO.beam + 1.6, PORTICO.attic - PORTICO.beam - 1.6, CENTRE.face, PORTICO.front - 0.3, wall);

    span(-CENTRE.half - 0.3, CENTRE.half + 0.3, CENTRE.top, CORNICE, CENTRE.back - 0.3, BAY.front + 0.3, trim);

    // --- the stair up the podium ---
    const rise = FLOOR / STEPS;
    for (let k = 0; k < STEPS; k++) {
      // Stacked from the podium's face outwards, the top one `PROUD` short of
      // the floor it arrives at.
      const height = k === STEPS - 1 ? FLOOR - PROUD : rise * (k + 1);
      span(-STAIR_HALF, STAIR_HALF, 0, height, PORTICO.front, PORTICO.front + (STEPS - k) * TREAD, trim);
    }

    // --- Zanelli's two bronzes, on pedestals either side of the stair ---
    for (const side of [1, -1]) {
      const x = side * PEDESTAL.x;
      placed(box(PEDESTAL.width, PEDESTAL.height, PEDESTAL.depth, podium), x, 0, PEDESTAL.z);
      placed(box(PEDESTAL.width - 0.6, 0.5, PEDESTAL.depth - 0.8, bronze), x, PEDESTAL.height, PEDESTAL.z);
      placed(taper(0.75, 0.45, 2.6, bronze, 6), x, PEDESTAL.height + 0.5, PEDESTAL.z);
      placed(box(0.6, 0.7, 0.6, bronze), x, PEDESTAL.height + 3.1, PEDESTAL.z);
    }

    // --- the dome ---
    const dome = new THREE.Group();
    dome.position.z = DOME_Z;
    site.add(dome);
    const up = (mesh: Mesh, y: number): Mesh => {
      mesh.position.y = y;
      dome.add(mesh);
      return mesh;
    };

    up(box(DRUM_BASE.half * 2, DRUM_BASE.top - DRUM_BASE.from, DRUM_BASE.half * 2, wall), DRUM_BASE.from);
    up(column(DRUM.radius, DRUM.top - DRUM_BASE.top, recess, SHELL_SIDES), DRUM_BASE.top);
    dome.add(
      around(PERISTYLE.count, () => {
        const shaft = column(PERISTYLE.radius, PERISTYLE.top - DRUM_BASE.top, marble, 6);
        shaft.position.set(0, DRUM_BASE.top, PERISTYLE.ring);
        return shaft;
      }),
    );
    up(ringWall(DRUM_CORNICE.inner, DRUM_CORNICE.outer, DRUM_CORNICE.top - PERISTYLE.top, trim, SHELL_SIDES), PERISTYLE.top);
    up(column(ATTIC.radius, ATTIC.top - DRUM_CORNICE.top, wall, SHELL_SIDES), DRUM_CORNICE.top);

    for (let i = 0; i + 1 < SHELL.length; i++) {
      const a = SHELL[i]!;
      const b = SHELL[i + 1]!;
      up(taper(a.r, b.r, b.y - a.y, marble, SHELL_SIDES), a.y);
    }

    // The ribs, two struts each, on the shell's creases.
    const crease = 1 / Math.cos(Math.PI / SHELL_SIDES);
    const shellAt = (y: number): number => {
      for (let i = 0; i + 1 < SHELL.length; i++) {
        const a = SHELL[i]!;
        const b = SHELL[i + 1]!;
        if (y <= b.y || i === SHELL.length - 2) return (a.r + ((b.r - a.r) * (y - a.y)) / (b.y - a.y)) * crease;
      }
      return SHELL[0]!.r * crease;
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
            wall,
          ),
        );
      }
      return rib;
    });
    ribs.rotation.y = Math.PI / SHELL_SIDES;
    dome.add(ribs);

    up(column(LANTERN.radius, LANTERN.cap - LANTERN.from, wall, 8), LANTERN.from);
    up(taper(LANTERN.radius + 0.3, 0.6, LANTERN.finial - LANTERN.cap, marble, 8), LANTERN.cap);
    up(taper(0.5, 0.15, LANTERN.top - LANTERN.finial, gilt, 6), LANTERN.finial);

    return ctx.merge(draft);
  },
};

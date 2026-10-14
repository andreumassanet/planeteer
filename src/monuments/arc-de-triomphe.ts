import type { Monument } from './contract.ts';

/**
 * Arc de Triomphe.
 *
 * Tier `building` (40 tall). The Eiffel Tower is 4.36 world units away on this
 * planet, inside its 35-unit footprint, so a taller tier would make the arch as
 * tall as the tower; at 1:3 the parapet (39.8) sits under the tower's second
 * platform. The footprint is declared tight, 21 (measured reach 20.84, the
 * crowning cornice's corners).
 *
 * Proportions follow life: width/height 0.90 (36 by 39.8) and depth/width 0.49.
 * The opening is wider than life (0.48 of the block, 0.64 of the height) so the
 * piers do not swell into a wall; any more leaves no masonry between the
 * keystone and the entablature. The head is a true semicircle on the 8.6
 * half-span. Seen through the 17.6-deep vault the sky is narrower (0.38).
 *
 * Pieces: the great arch (eleven pieces a side and a keystone); the transverse
 * vault (6.6 wide, 14.9 to its crown) crossing it below the springing; the deep
 * attic with fourteen shield medallions (five a long face, two a short one);
 * four sculptural groups of four blocks each, up to the springing; and a roof
 * terrace with a parapet 0.3 inside the wall line. Left out: archivolt
 * mouldings, coffering and attic pilasters (the Arc is astylar). The four upper
 * bas-reliefs are a `tan` field with a `brown` panel proud of it.
 *
 * Colour: `sand` limestone, `tan` mouldings, `brown` sculpture, shields and
 * terrace floor. `bone` would go cold in the blue hemisphere light.
 * Budget: 97 of 110 meshes, 1,332 triangles, aspect 1.05; the two vaults take 47
 * meshes.
 */

// --- plan, in world units. X across the front, Z through the depth. ---
const WIDTH = 36.0;
const DEPTH = 17.6;
const HALF_W = WIDTH / 2;
const HALF_D = DEPTH / 2;

/** Half-span of the great arch, and half-width of the transverse vault. */
const ARCH_HALF = 8.6;
const CROSS_HALF = 3.3;

/** The piers, either side of the great opening. */
const PIER_INNER = ARCH_HALF;
const PIER_WIDTH = HALF_W - PIER_INNER;
const PIER_X = (PIER_INNER + HALF_W) / 2;

// --- elevation. Every level is absolute above y = 0. ---
const STEP_LOW = 0.55;
const BLOCK_BASE = 1.4;
const CROSS_SPRING = 11.6;
const CROSS_CROWN = CROSS_SPRING + CROSS_HALF; // 14.9
const ARCH_SPRING = 16.85; // the head is a true semicircle, so the crown is 25.45
const SPANDREL_TOP = 26.9;
const CORNICE_A_TOP = 27.6;
const FRIEZE_TOP = 30.0;
const CORNICE_B_TOP = 30.8;
const ATTIC_TOP = 37.4;
const ROOF = 38.4;
const PARAPET_TOP = 39.8;

/** How far each moulding stands proud of the wall line, per side. */
const OUT_STEP_LOW = 0.55;
const OUT_STEP_HIGH = 0.3;
const OUT_CORNICE = 0.45;
const OUT_FRIEZE = 0.22;
const OUT_CROWN = 0.6; // the widest thing on the building: reach 20.84
const PARAPET_IN = 0.3;
const PARAPET_THICK = 0.9;

/** Attic medallions. `radius` is the hexagon's half-width across the flats. */
const SHIELD_R = 1.7;
const SHIELD_OUT = 0.35;
const SHIELD_Y = 34.1;
const SHIELD_LONG = [-13.6, -6.8, 0, 6.8, 13.6];
const SHIELD_SHORT = [-4.3, 4.3];

interface Band {
  /** Half-width of the opening across this band: masonry runs from here outward. */
  inner: number;
  bottom: number;
  top: number;
}

/**
 * A semicircular head cut into horizontal courses of equal angle. Stepping by
 * angle spends the courses where the curve turns, and each course takes its
 * opening at its mid angle so the staircase stays centred on the arc.
 */
function archBands(halfSpan: number, springing: number, count: number): Band[] {
  const step = Math.PI / 2 / count;
  const bands: Band[] = [];
  for (let i = 0; i < count; i++) {
    bands.push({
      inner: halfSpan * Math.cos((i + 0.5) * step),
      bottom: springing + halfSpan * Math.sin(i * step),
      top: springing + halfSpan * Math.sin((i + 1) * step),
    });
  }
  return bands;
}

/**
 * The great arch changes stonework halfway up. Horizontal courses all the way
 * would draw a ladder across the top, where the circle is nearly flat, so the
 * head is cut along whichever axis the curve is not moving in:
 *
 * - 0 to 45 degrees: horizontal courses (joints at most 2.5 units long).
 * - 45 to 90 degrees: vertical voussoirs from the arc up to the spandrel top,
 *   plus a keystone across the middle.
 *
 * The step is 7.5 degrees (twelve pieces a side): at 15 the far face's head,
 * seen through the vault from the quarter view, reads as a corbel.
 */
const ARCH_STEPS = 12; // over the quarter circle: 7.5 degrees each
const ARCH_STEP = Math.PI / 2 / ARCH_STEPS;
const ARCH_TURN = ARCH_HALF * Math.cos(Math.PI / 4); // 6.081: courses give way to voussoirs
const ARCH_TURN_Y = ARCH_SPRING + ARCH_HALF * Math.sin(Math.PI / 4);

const GREAT_ARCH = archBands(ARCH_HALF, ARCH_SPRING, ARCH_STEPS).slice(0, ARCH_STEPS / 2);
/**
 * The transverse head stays plain horizontal courses (it is seen through a
 * 6.6-unit tunnel). Five steps; the first is a 0.04-unit sliver and is dropped.
 */
const CROSS_ARCH = archBands(CROSS_HALF, CROSS_SPRING, 5);

export const arcDeTriomphe: Monument = {
  id: 'arc-de-triomphe',
  name: 'Arc de Triomphe',
  iso: 'FRA',
  lat: 48.874,
  lon: 2.295,
  realHeight: 50,
  tier: 'building',
  footprint: 21,

  build(ctx) {
    const { THREE, palette, box, column, around } = ctx;
    const stone = palette.sand;
    const trim = palette.tan;
    const sculpt = palette.brown;

    const group = new THREE.Group();

    /** A slab of the full block, optionally proud of the wall line. */
    const slab = (base: number, top: number, out: number, color: number) => {
      const mesh = box(WIDTH + out * 2, top - base, DEPTH + out * 2, color);
      mesh.position.y = base;
      group.add(mesh);
      return mesh;
    };

    const SIDES = [-1, 1] as const;

    // --- the stepped stylobate ---
    slab(0, STEP_LOW, OUT_STEP_LOW, trim);
    slab(STEP_LOW, BLOCK_BASE, OUT_STEP_HIGH, trim);

    // --- the piers: one unbroken box a side of the transverse tunnel, all the
    //     way from the stylobate to the great arch's springing ---
    for (const sx of SIDES) {
      for (const sz of SIDES) {
        const leg = box(PIER_WIDTH, ARCH_SPRING - BLOCK_BASE, HALF_D - CROSS_HALF, stone);
        leg.position.set(sx * PIER_X, BLOCK_BASE, (sz * (CROSS_HALF + HALF_D)) / 2);
        group.add(leg);
      }
    }

    // --- the transverse vault's head, stepped *inside* the tunnel ---
    for (const band of CROSS_ARCH) {
      const depth = CROSS_HALF - band.inner;
      if (depth < 0.1) continue;
      for (const sx of SIDES) {
        for (const sz of SIDES) {
          const voussoir = box(PIER_WIDTH, band.top - band.bottom, depth, stone);
          voussoir.position.set(sx * PIER_X, band.bottom, sz * (band.inner + depth / 2));
          group.add(voussoir);
        }
      }
    }

    // --- the pier's core, plugging the tunnel above the transverse crown ---
    for (const sx of SIDES) {
      const core = box(PIER_WIDTH, ARCH_SPRING - CROSS_CROWN, CROSS_HALF * 2, stone);
      core.position.set(sx * PIER_X, CROSS_CROWN, 0);
      group.add(core);
    }

    // --- the pier above the springing, carrying the spandrel with it ---
    for (const sx of SIDES) {
      const upper = box(PIER_WIDTH, SPANDREL_TOP - ARCH_SPRING, DEPTH, stone);
      upper.position.set(sx * PIER_X, ARCH_SPRING, 0);
      group.add(upper);
    }

    // --- the arch head: courses to 45 degrees, then vertical voussoirs ---
    for (const band of GREAT_ARCH) {
      const width = PIER_INNER - band.inner;
      if (width < 0.1) continue;
      for (const sx of SIDES) {
        const course = box(width, band.top - band.bottom, DEPTH, stone);
        course.position.set(sx * (band.inner + width / 2), band.bottom, 0);
        group.add(course);
      }
    }
    for (const sx of SIDES) {
      const haunch = box(PIER_INNER - ARCH_TURN, SPANDREL_TOP - ARCH_TURN_Y, DEPTH, stone);
      haunch.position.set(sx * ((ARCH_TURN + PIER_INNER) / 2), ARCH_TURN_Y, 0);
      group.add(haunch);
    }
    for (let j = 0; j < ARCH_STEPS / 2; j++) {
      const angle = Math.PI / 4 + j * ARCH_STEP;
      const outer = ARCH_HALF * Math.cos(angle);
      const inner = ARCH_HALF * Math.cos(angle + ARCH_STEP);
      const soffit = ARCH_SPRING + ARCH_HALF * Math.sin(angle + ARCH_STEP / 2);
      if (inner < 0.05) {
        // The keystone spans the crown, so it is one block, not a mirrored pair.
        const keystone = box(outer * 2, SPANDREL_TOP - soffit, DEPTH, stone);
        keystone.position.y = soffit;
        group.add(keystone);
        break;
      }
      for (const sx of SIDES) {
        const voussoir = box(outer - inner, SPANDREL_TOP - soffit, DEPTH, stone);
        voussoir.position.set(sx * ((inner + outer) / 2), soffit, 0);
        group.add(voussoir);
      }
    }

    // --- the entablature and the attic ---
    slab(SPANDREL_TOP, CORNICE_A_TOP, OUT_CORNICE, trim);
    slab(CORNICE_A_TOP, FRIEZE_TOP, OUT_FRIEZE, stone);
    slab(FRIEZE_TOP, CORNICE_B_TOP, OUT_CORNICE, trim);
    slab(CORNICE_B_TOP, ATTIC_TOP, 0, stone);
    slab(ATTIC_TOP, ROOF, OUT_CROWN, trim);

    // --- the terrace: four rails standing on the roof, floor recessed between ---
    const railOuterX = HALF_W - PARAPET_IN;
    const railOuterZ = HALF_D - PARAPET_IN;
    for (const sz of SIDES) {
      const rail = box(railOuterX * 2, PARAPET_TOP - ROOF, PARAPET_THICK, trim);
      rail.position.set(0, ROOF, sz * (railOuterZ - PARAPET_THICK / 2));
      group.add(rail);
    }
    for (const sx of SIDES) {
      const rail = box(
        PARAPET_THICK,
        PARAPET_TOP - ROOF,
        (railOuterZ - PARAPET_THICK) * 2,
        trim,
      );
      rail.position.set(sx * (railOuterX - PARAPET_THICK / 2), ROOF, 0);
      group.add(rail);
    }
    const terrace = box(
      (railOuterX - PARAPET_THICK) * 2,
      0.15,
      (railOuterZ - PARAPET_THICK) * 2,
      sculpt,
    );
    terrace.position.y = ROOF;
    group.add(terrace);

    // --- shield medallions: the hexagon is rolled 30 degrees about its axis so a
    //     point sits at the bottom, then tipped a quarter turn to face its wall.
    //     Euler order 'XYZ' applies the roll first. ---
    const medallion = (along: number, face: number) => {
      const disc = column(SHIELD_R, SHIELD_OUT, sculpt, 6);
      disc.rotation.set(Math.PI / 2, Math.PI / 6, 0);
      disc.position.set(along, SHIELD_Y, face);
      return disc;
    };
    group.add(around(2, () => {
      const bank = new THREE.Group();
      for (const x of SHIELD_LONG) bank.add(medallion(x, HALF_D));
      return bank;
    }));
    const shortShields = around(2, () => {
      const bank = new THREE.Group();
      for (const z of SHIELD_SHORT) bank.add(medallion(z, HALF_W));
      return bank;
    });
    shortShields.rotation.y = Math.PI / 2;
    group.add(shortShields);

    // --- the four sculptural groups, and the relief panel above each ---
    group.add(around(2, (index) => {
      const face = new THREE.Group();
      // The two pairs differ (a taller figure on one face, a broader crowd on the
      // other) so the four do not read as one block stamped four times.
      const tall = index === 0 ? 0.6 : -0.6;

      for (const sx of SIDES) {
        const pedestal = box(7.2, 1.1, 0.9, trim);
        pedestal.position.set(sx * PIER_X, 3.2, HALF_D + 0.45);
        face.add(pedestal);

        const crowd = box(6.6 - tall * 0.5, 5.6 - tall, 1.15, sculpt);
        crowd.position.set(sx * PIER_X, 4.3, HALF_D + 0.575);
        face.add(crowd);

        const figure = box(4.0, 6.2 + tall, 0.95, sculpt);
        figure.position.set(sx * (PIER_X + 0.9), 9.9 - tall, HALF_D + 0.475);
        face.add(figure);

        const wing = box(2.4, 4.8, 0.7, sculpt);
        wing.position.set(sx * (PIER_X - 2.2), 10.5, HALF_D + 0.35);
        face.add(wing);

        // The bas-relief on the upper pier, between the arch head and the frieze.
        const frame = box(7.0, 5.0, 0.18, trim);
        frame.position.set(sx * PIER_X, 18.1, HALF_D + 0.09);
        face.add(frame);

        const relief = box(5.9, 4.0, 0.32, sculpt);
        relief.position.set(sx * PIER_X, 18.6, HALF_D + 0.16);
        face.add(relief);
      }
      return face;
    }));

    return group;
  },
};

import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * The Potala Palace, Lhasa.
 *
 * Four things are the building. The battered walls: every wall leans inward as
 * it rises, which is what makes Tibetan architecture unmistakable (plumb walls
 * give a white barracks with a red block on it), so every mass is a `taper` and
 * the batter is exaggerated. The two-colour composition: a deep red block
 * standing inside a larger white one that continues far below it, so the Red
 * Palace starts at y = 12 and stands five units behind the White Palace's front
 * face and emerges from the white mass instead of sitting on it like a hat. Flat
 * roofs with gold pavilions: nothing comes to a point except the five gilded
 * roofs over the Red Palace, and every parapet stops a quarter-unit short of the
 * wall top so the whitewashed deck shows. Rows of small dark windows: 72 of the
 * 104 meshes are `ink` trapezoids, wider at the bottom and tilted onto the
 * sloping wall, and a regular grid of them says how big the wall is.
 *
 * Tier `building`: the visible mass is about 300 m across and 117 m tall, which
 * at `landmark` would need a plan squeezed nearly 3x. At `building` the true
 * ratio fits (40 tall, 97 across, aspect 2.58 against 4).
 *
 * Exaggerated: the batter (podium 19 degrees, White Palace 17, Red Palace 10,
 * 2 to 2.5x life, since an honest 8 degrees is three pixels). A mass is one
 * square frustum scaled to a rectangle, so its z faces batter by `atan(tan(deg)
 * * depth / width)`, 7.5 degrees on the podium and 5.9 on the Red Palace, near
 * life. Windows are 2.6 units tall where scale asks for 0.5 (about 5x). Two
 * window rows on the White Palace and three on the Red stand in for thirteen
 * storeys.
 *
 * The switchback stair belongs to the palace. It is painted the same white as
 * the wall, and the ink outline and a dark rail along its top edge draw it (a
 * 3-unit `bone` stair read as scaffolding). Marpo Ri, the Snow Village and the
 * outer walls are not modelled; the seven gold roofs are cut to five; the gold
 * medallions on the benma frieze are smaller than their ink outline; and the
 * White Palace's asymmetry is reduced to an east wing 1.1 units taller and
 * slightly wider than the west.
 */

const RAD = Math.PI / 180;

/** A rectangular battered mass: where it stands, how big at the foot, how far it leans. */
interface Mass {
  x: number;
  z: number;
  /** Half-width across the flats at the foot. */
  w: number;
  /** Half-depth at the foot. */
  d: number;
  y: number;
  h: number;
  /** Lean of the wide (x) faces off vertical, in degrees. */
  deg: number;
}

/**
 * Top over bottom. A mass is one `taper` built on a unit square and scaled to a
 * rectangle, so its two axes share one shrink factor: with `w` much larger than
 * `d`, the front gets the exaggerated lean and the flanks a gentle one near life.
 */
const shrinkOf = (m: Mass): number => 1 - (Math.tan(m.deg * RAD) * m.h) / m.w;

/** The shrink factor part-way up, clamped so a band above the mass still lands on it. */
const shrinkAt = (m: Mass, y: number): number =>
  1 + (shrinkOf(m) - 1) * Math.min(Math.max((y - m.y) / m.h, 0), 1);

/** Where the front face stands at height `y`, and where the right face stands. */
const faceZ = (m: Mass, y: number): number => m.z + m.d * shrinkAt(m, y);
const faceX = (m: Mass, y: number): number => m.x + m.w * shrinkAt(m, y);

/** How far a face leans back, in radians, so a window can lie flat on it. */
const tiltZ = (m: Mass): number => Math.atan((Math.tan(m.deg * RAD) * m.d) / m.w);
const tiltX = (m: Mass): number => m.deg * RAD;

// --- the masses ---

/** The great white podium: the widest thing here, and what sets the footprint. */
const PODIUM: Mass = { x: 0, z: 0, w: 48.5, d: 17.5, y: 0, h: 8, deg: 19 };
/**
 * The White Palace proper. It starts at 7.5, half a unit inside the podium,
 * because stacked frusta meeting exactly would put two caps in one plane. Every
 * mass is seated the same way, and every band is sunk into the mass it caps.
 */
const BODY: Mass = { x: 0, z: 0, w: 44, d: 16, y: 7.5, h: 11, deg: 17 };
/** The Red Palace: buried in the white to y = 18.5, and set back 5 behind its face. */
const RED: Mass = { x: 0, z: -2, w: 18, d: 10.5, y: 12, h: 23, deg: 10 };
/** The two white wings flanking it. East is the taller and wider one. */
const WEST: Mass = { x: -27, z: -1.5, w: 12.8, d: 11, y: 17.8, h: 9.5, deg: 9 };
const EAST: Mass = { x: 27.4, z: -1.5, w: 13.2, d: 11.5, y: 17.8, h: 10.6, deg: 9 };

/** How far below a mass's own top a parapet band stops, leaving the deck visible. */
const DECK_LIP = 0.25;
const BAND_PROUD = 0.75;

// --- the gilded roofs ---

/** The Red Palace's roof, and the level the pavilions are seated just under. */
const DECK = RED.y + RED.h;

interface Pavilion {
  x: number;
  z: number;
  /** Half-width and half-depth of the little red chapel under the roof. */
  w: number;
  d: number;
  wall: number;
  /** How far the gilt roof oversails the walls, and how tall it is. */
  eave: number;
  roof: number;
  /** 0 for no finial. */
  finial: number;
}

const PAVILIONS: Pavilion[] = [
  { x: 0, z: -1, w: 4.6, d: 4, wall: 1.4, eave: 1.1, roof: 3.2, finial: 0.75 },
  { x: -10.3, z: 0.4, w: 2.9, d: 2.7, wall: 1.1, eave: 0.75, roof: 2.4, finial: 0.6 },
  { x: 10.3, z: 0.4, w: 2.9, d: 2.7, wall: 1.1, eave: 0.75, roof: 2.4, finial: 0.6 },
  { x: -4.9, z: -6.5, w: 2.4, d: 2.2, wall: 0.9, eave: 0.8, roof: 2, finial: 0 },
  { x: 4.9, z: -6.5, w: 2.4, d: 2.2, wall: 0.9, eave: 0.8, roof: 2, finial: 0 },
];

/** Every roof and finial is seated this far into the thing below it, never on it. */
const SEAT = 0.15;

// --- windows ---

/** Top half-width over bottom: this ratio is the Tibetan window. */
const WIN_TAPER = 0.68;
/** How far the surround stands off the wall — enough for the ink line, no more. */
const WIN_PROUD = 0.3;
const WIN_THICK = 0.42;

/** Window positions, as offsets along the wall from the mass's own centre line. */
const BODY_XS = [-37.2, -31, -24.8, -18.6, -12.4, -6.2, 0, 6.2, 12.4, 18.6, 24.8, 31, 37.2];
const BODY_ZS = [-8, 0, 8];
const PODIUM_XS = [-39, -30, 30, 39];
/** The wings differ in width, so theirs are fractions of it rather than units. */
const WING_FRACTIONS = [-0.72, -0.27, 0.27, 0.72];
const RED_XS = [-10.8, -5.4, 0, 5.4, 10.8];

// --- the zigzag stair ---
/** Lower flight climbing left, upper flight climbing back right off the landing. */
const FLIGHT_A = { x0: 26, y0: 1.6, x1: -6, y1: 7.2 };
const FLIGHT_B = { x0: -9, y0: 7.4, x1: 16, y1: 12.8 };
const RAMP = 2.6;
const RAMP_PROUD = 1.1;
/** The dark rail rides the ramp's top edge. It is what actually draws the zigzag. */
const RAIL = 0.8;
/** The porch the stair arrives at, and the one window it stands in front of. */
const PORCH_X = 19;

export const potalaPalace: Monument = {
  id: 'potala-palace',
  name: 'Potala Palace',
  iso: 'CHN',
  lat: 29.658,
  lon: 91.117,
  tier: 'building',
  footprint: 52,

  build(ctx) {
    const { THREE, palette, box, taper, column, strut } = ctx;
    const lime = palette.white; // every whitewashed wall
    const red = palette.crimson; // the Red Palace, and only the Red Palace
    const benma = palette.bark; // the dark frieze along every parapet
    const gild = palette.gold; // the five roofs and the cornice under them
    const dark = palette.ink; // window surrounds and the one doorway
    // The ramps are whitewashed like the rest; the ink outline and the dark rail draw them.
    const stair = lime;

    const group = new THREE.Group();

    /** One battered mass: a square frustum scaled to its rectangle (see `shrinkOf`). */
    const mass = (m: Mass, color: number): void => {
      const wrap = new THREE.Group();
      wrap.add(taper(1, shrinkOf(m), m.h, color, 4));
      wrap.scale.set(m.w, 1, m.d);
      wrap.position.set(m.x, m.y, m.z);
      group.add(wrap);
    };

    /**
     * A parapet band round a mass, standing proud of the wall and stopping below
     * its top so the pale deck behind it shows; flush, every roof would be dark.
     */
    const band = (m: Mass, top: number, height: number, color: number, proud: number): void => {
      const y = top - height;
      const slab = box(
        (faceX(m, y) - m.x + proud) * 2,
        height,
        (faceZ(m, y) - m.z + proud) * 2,
        color,
      );
      slab.position.set(m.x, y, m.z);
      group.add(slab);
    };

    /** The band that caps a mass, placed off the mass's own height. */
    const capBand = (m: Mass, height: number, color: number, proud = BAND_PROUD): void =>
      band(m, m.y + m.h - DECK_LIP, height, color, proud);

    /**
     * One window: an `ink` trapezoid, wider at the bottom, tilted into the plane
     * of the wall it belongs to.
     */
    const opening = (
      x: number,
      y: number,
      z: number,
      half: number,
      height: number,
      yaw: number,
      tilt: number,
    ): void => {
      const leaf = new THREE.Group();
      leaf.add(taper(1, WIN_TAPER, height, dark, 4));
      leaf.scale.set(half, 1, WIN_THICK);
      leaf.rotation.x = -tilt;
      const wrap = new THREE.Group();
      wrap.add(leaf);
      wrap.rotation.y = yaw;
      wrap.position.set(x, y, z);
      group.add(wrap);
    };

    /** A row across the front (+Z) face of a mass. */
    const frontRow = (m: Mass, y: number, half: number, height: number, xs: number[]): void => {
      const z = faceZ(m, y) + WIN_PROUD;
      const tilt = tiltZ(m);
      for (const x of xs) opening(m.x + x, y, z, half, height, 0, tilt);
    };

    /** The same on both end walls, so the quarter view is not a blank flank. */
    const sideRow = (m: Mass, y: number, half: number, height: number, zs: number[]): void => {
      const tilt = tiltX(m);
      const reach = faceX(m, y) - m.x + WIN_PROUD;
      for (const z of zs) {
        opening(m.x + reach, y, m.z + z, half, height, Math.PI / 2, tilt);
        opening(m.x - reach, y, m.z + z, half, height, -Math.PI / 2, tilt);
      }
    };

    // --- the white palace, bottom to top ---
    mass(PODIUM, lime);
    capBand(PODIUM, 1.3, benma);
    mass(BODY, lime);
    capBand(BODY, 1.4, benma);

    // --- the red palace ---
    mass(RED, red);
    band(RED, 34, 1.2, benma, 0.65);
    // The gilt cornice. Its top stops below the Red Palace's cap, which stays the deck the pavilions stand on.
    band(RED, 34.9, 0.9, gild, 0.45);

    // --- the two wings ---
    mass(WEST, lime);
    capBand(WEST, 1.1, benma, 0.6);
    mass(EAST, lime);
    capBand(EAST, 1.1, benma, 0.6);

    // --- five gilded roofs ---
    for (const p of PAVILIONS) {
      const walls = box(p.w * 2, p.wall, p.d * 2, red);
      walls.position.set(p.x, DECK - SEAT, p.z);
      group.add(walls);

      const eaveY = DECK + p.wall - 2 * SEAT;
      const roof = new THREE.Group();
      roof.add(taper(1, 0.26, p.roof, gild, 4));
      roof.scale.set(p.w + p.eave, 1, p.d + p.eave);
      roof.position.set(p.x, eaveY, p.z);
      group.add(roof);

      if (p.finial === 0) continue;
      const spike = column(0.45, p.finial, gild, 4);
      spike.position.set(p.x, eaveY + p.roof - SEAT, p.z);
      group.add(spike);
    }

    // --- windows: the texture that gives the walls their size ---
    frontRow(PODIUM, 3.2, 0.85, 2.2, PODIUM_XS);
    frontRow(BODY, 9.8, 0.95, 2.6, BODY_XS);
    // The porch stands where one window of the upper row would be.
    frontRow(BODY, 13.9, 0.95, 2.6, BODY_XS.filter((x) => Math.abs(x - PORCH_X) > 4.5));
    sideRow(BODY, 9.8, 0.95, 2.6, BODY_ZS);
    sideRow(BODY, 13.9, 0.95, 2.6, BODY_ZS);
    for (const wing of [WEST, EAST]) {
      const xs = WING_FRACTIONS.map((f) => f * wing.w);
      frontRow(wing, 20.4, 0.9, 2.4, xs);
      frontRow(wing, 23.2, 0.9, 2.4, xs);
    }
    frontRow(RED, 21.3, 1.05, 2.9, RED_XS);
    frontRow(RED, 25.5, 1.05, 2.9, RED_XS);
    frontRow(RED, 29.6, 1.05, 2.9, RED_XS);

    // --- the great zigzag ---
    /** The stair rides whichever wall it is against at that height. */
    const rampZ = (y: number): number =>
      (y <= PODIUM.h ? faceZ(PODIUM, y) : faceZ(BODY, y)) + RAMP_PROUD;

    for (const flight of [FLIGHT_A, FLIGHT_B]) {
      const foot = new THREE.Vector3(flight.x0, flight.y0, rampZ(flight.y0));
      const head = new THREE.Vector3(flight.x1, flight.y1, rampZ(flight.y1));
      group.add(strut(foot, head, RAMP, stair));
      // Riding the ramp's top edge: a rail below it would hang its mitred end under y = 0.
      const lift = new THREE.Vector3(0, RAMP / 2, 0.15);
      group.add(strut(foot.clone().add(lift), head.clone().add(lift), RAIL, benma));
    }

    // A flight is cut on the diagonal at the bottom and needs something to land on.
    const kerb = box(3.6, 1.6, 4.2, stair);
    kerb.position.set(FLIGHT_A.x0 + 0.4, 0, rampZ(0) - 0.5);
    group.add(kerb);

    // The switchback platform, small so the two flights do not weld into one wedge.
    const landing = box(5.4, 2.6, 3.2, stair);
    landing.position.set(-9.5, 5.8, rampZ(7.3) - 0.3);
    group.add(landing);

    // The entrance the zigzag climbs to, under the White Palace's parapet.
    const porch = box(6, 2.8, 2.6, stair);
    porch.position.set(PORCH_X, 12.8, faceZ(BODY, 12.8) + 1.3);
    group.add(porch);
    // On a sill `PROUD` over the porch's foot, off the porch's underside plane.
    const doorway = box(2.2, 2.1, 0.8, dark);
    doorway.position.set(PORCH_X, 12.8 + PROUD, faceZ(BODY, 12.8) + 2.5);
    group.add(doorway);

    return group;
  },
};

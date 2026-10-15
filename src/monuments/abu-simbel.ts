import { PROUD } from './contract.ts';
import type { Group, Mesh, Monument, Object3D } from './contract.ts';

/**
 * Abu Simbel — the Great Temple of Ramesses II.
 *
 * Four seated colossi in a row across a rock-cut sandstone façade, with a small
 * doorway between the middle two. The wall plane sits only six units behind the
 * figures' faces so the row reads as one wall in high relief, not figurines on a
 * shelf. Above y 49 the wall is a single box tilted 6.6 degrees back; the rock
 * over the cornice is three irregular wedges.
 *
 * The second colossus is broken at the waist, with its head and torso lying at
 * its feet. The crowns are the plumed modius, not the pschent bulb, which does
 * not hold a skyline at this scale. Nine baboons stand in for the frieze's 22.
 *
 * Colour is a four-step ramp by how much rock was cut away: `brown` raw cliff,
 * `tan` dressed façade, `sand` figures, `cream` crowns. Tier `landmark`. No
 * `realHeight`: the source list gives none.
 */

// ---------------------------------------------------------------------------
// The cliff
// ---------------------------------------------------------------------------

const CLIFF_HALF = 51;
/**
/**
 * The back of the model. With `CLIFF_HALF` it fixes the footprint: the jamb's
 * bottom corners at (±51, -16) reach 53.45 from the axis (`footprint: 54`).
 */
const SLAB_BACK = -16;
/**
/**
 * The dressed wall planes. `WALL` is the face the colossi are carved from, six
 * units behind their faces; `WALL_BACK` is the plane the doorway and niche are
 * recessed to.
 */
const WALL = 1;
const WALL_BACK = -4;

/** The untouched rock left standing either side of the row: five units, as thin as it is in life. */
const JAMB_HALF = 2.5;
const JAMB_X = CLIFF_HALF - JAMB_HALF;

/**
/**
 * The batter: one box tilted back about its base, carrying the wall from y 49 to
 * the cornice. 6.6 degrees puts the face 4.2 units further back at the cornice.
 */
const BATTER = 0.115;
const BATTER_Y = 49;

/**
/** The cornice is thin and `tan`: a pale thick slab reads as a mantelpiece. */
const CORNICE_Y = 86;
const CORNICE_TOP = 89.5;

/**
/**
 * The rock above the cornice. Each wedge narrows as it rises and leans its own
 * way; no two share a width, depth or top, so the skyline steps down like a
 * hillside. None clears the cornice by more than 18 units.
 */
const MASSES: Array<
  [bottom: number, top: number, height: number, depth: number, x: number, z: number, lean: number]
> = [
  [22, 12, 18, 15, -37, -10, 0.15],
  [19, 8, 14, 26, -14, -17, -0.11],
  [23, 10, 11, 13, 39, -10.5, -0.17],
];

// --- the terrace ---
const TERRACE_TOP = 5;
/** Narrower than the cliff, so the rock overhangs the ground it stands on. */
const TERRACE_HALF = 47;
const TERRACE_FRONT = 17;

// --- the base the four sit on: two halves, so the doorway reaches the terrace ---
const PLINTH_TOP = 10;
const PLINTH_BACK = -13;
const PLINTH_FRONT = 14;

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

/**
 * Centres. The outer pair all but touch the inner pair — half a unit of
 * daylight, as the real thrones do — and the doorway is the seven-unit gap in
 * the middle.
 */
const FIGURE_X = [-35.5, -14, 14, 35.5];
/**
 * The one that fell. Second from the viewer's left, immediately left of the
 * doorway: the camera looks down -Z so its right is +X, which puts -14 second
 * from the left of the picture, and that is where the break is.
 */
const FALLEN = 1;

const THRONE_HALF = 10.5;
const THRONE_BACK = -8.5;
const THRONE_FRONT = 4.5;

// --- the seated figure, in local y from the top of the plinth ---
/** Hips, and the top of the thighs: a third of the way up, as a seated figure is. */
const SEAT = 22;
const SHIN_TOP = 17;
const KNEE_Z = 11.5;
const SHOULDER = 43;
const NEMES_BOTTOM = 41;
const NEMES_TOP = 56;
const CROWN_TOP = 62.5;
const PLUME_TOP = 70;

// ---------------------------------------------------------------------------
// The frieze
// ---------------------------------------------------------------------------

/** Nine, against 22 in life, and odd so one sits on the axis over the doorway. */
const BABOONS = 9;
const BABOON_PITCH = 7;

export const abuSimbel: Monument = {
  id: 'abu-simbel',
  name: 'Abu Simbel',
  iso: 'EGY',
  lat: 22.337,
  lon: 31.626,
  tier: 'landmark',
  surface: 'none',
  footprint: 54,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;

    // Four tones of one sandstone, ordered by how much of it was cut away.
    const rock = palette.brown; // the raw hillside: jambs, the masses, the ground
    const wall = palette.tan; // the dressed façade the figures stand out of
    const carved = palette.sand; // the figures themselves, their base, the frieze
    const regalia = palette.cream; // crowns and plumes, the top of the silhouette
    const dark = palette.bark; // doorway, niche, eyes — the only shadows in the file

    const group = new THREE.Group();

    /**
     * A block spanning `y0..y1` and `z0..z1` (a façade is read in elevations).
     */
    const slab = (
      width: number,
      y0: number,
      y1: number,
      z0: number,
      z1: number,
      color: number,
      x = 0,
    ): Mesh => {
      const mesh = box(width, y1 - y0, z1 - z0, color);
      mesh.position.set(x, y0, (z0 + z1) / 2);
      return mesh;
    };

    /**
     * A hewn block that flares or narrows: a four-sided `taper` with `scale.z`
     * setting the depth afterwards (the torso, nemes and cavetto cornice).
     */
    const wedge = (
      bottom: number,
      top: number,
      height: number,
      depth: number,
      color: number,
    ): Mesh => {
      const mesh = taper(bottom / 2, top / 2, height, color, 4);
      mesh.scale.z = depth / bottom;
      return mesh;
    };

    /**
     * Sets a piece down so its lowest point rests on `floor`, whatever its
     * rotation; used for the tumbled debris.
     */
    const restOn = (object: Object3D, floor: number): void => {
      object.updateMatrixWorld(true);
      object.position.y += floor - new THREE.Box3().setFromObject(object).min.y;
    };

    // -----------------------------------------------------------------------
    // 1. The terrace, in the cliff's own `brown` so no pale band crosses the foot.
    // -----------------------------------------------------------------------
    group.add(slab(TERRACE_HALF * 2, 0, TERRACE_TOP, SLAB_BACK, TERRACE_FRONT, rock));

    // -----------------------------------------------------------------------
    // 2. The cliff: a deep back slab, two front panels with the doorway slot
    //    left between them, one tilted face carrying the wall to the cornice,
    //    two jamb wedges, and the rock that spreads over the top.
    // -----------------------------------------------------------------------
    // The back slab stops short of the jambs so the jamb wedges form the outline;
    // the two front panels leave the seven-unit doorway slot between them.
    group.add(slab(96, 0, CORNICE_Y, SLAB_BACK, WALL_BACK, rock));
    // Each panel's inner end stands 0.2 into the slot, at 3.3: the nearest plane
    // clear by `PROUD` of the inner throne's side and its carved pieces (3.4, 3.6).
    const PANEL_IN = 0.2;
    for (const side of [-1, 1]) {
      group.add(slab(44.5 + PANEL_IN, 0, 52, WALL_BACK, WALL, wall, side * (25.75 - PANEL_IN / 2)));
    }

    // A jamb is one wedge: it narrows 5.4 to 3.6 and shallows 20 to 13 over 88 units.
    for (const side of [-1, 1]) {
      const jamb = wedge(5.4, 3.6, CORNICE_Y, 20, rock);
      jamb.position.set(side * (CLIFF_HALF - 2.7), 0, -6);
      group.add(jamb);
    }

    // The batter. `box` stands on its base, so rotating about X tips the top back.
    // It starts three units below the wall panels' top (no seam) and stops 1.4
    // short of the cornice's top edge (the cornice hides the end). It also closes
    // the doorway slot above the niche.
    const face = box(JAMB_X * 2 - JAMB_HALF * 2, 39, 6, wall);
    face.position.set(0, BATTER_Y, -2);
    face.rotation.x = -BATTER;
    group.add(face);

    // The cavetto cornice: one wedge flaring outward as it rises, narrower than
    // the cliff so the jambs pass it at the ends.
    const cornice = wedge(90, 96, CORNICE_TOP - CORNICE_Y, 6, wall);
    cornice.position.set(0, CORNICE_Y, 0);
    group.add(cornice);

    for (const [bottom, top, height, depth, x, z, lean] of MASSES) {
      const mass = wedge(bottom, top, height, depth, rock);
      mass.position.set(x, CORNICE_TOP - 3, z);
      mass.rotation.z = lean;
      group.add(mass);
    }

    // -----------------------------------------------------------------------
    // 3. The plinth, in two halves. A continuous one would floor the doorway.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      group.add(slab(43, TERRACE_TOP, PLINTH_TOP, PLINTH_BACK, PLINTH_FRONT, carved, side * 24.5));
    }

    // -----------------------------------------------------------------------
    // -----------------------------------------------------------------------
    // 4. The doorway, and Ra-Horakhty in his niche above it: the inner thrones
    //    are the jambs, the lintel the head, and a dark panel stands between.
    // -----------------------------------------------------------------------
    group.add(slab(6, TERRACE_TOP, 28, WALL_BACK, WALL_BACK + 1.5, dark));
    // The lintel stands `PROUD` out of the panels' faces, front and back.
    group.add(slab(9, 28, 32.5, WALL_BACK - PROUD, WALL + PROUD, carved));

    // Three meshes, and they are what stops the strip between the middle two
    // colossi from being blank for forty units.
    group.add(slab(5.6, 34, 50, WALL_BACK, WALL_BACK + 1.6, dark));
    const godBody = wedge(3.4, 2.6, 10, 2.8, carved);
    godBody.position.set(0, 36, -1.6);
    group.add(godBody);
    group.add(slab(2.4, 45.5, 48.7, -2.8, 0, carved));

    // -----------------------------------------------------------------------
    // 5. The frieze of baboons along the skyline: two meshes each, a hunched
    //    six-sided body and a forward head.
    // -----------------------------------------------------------------------
    for (let i = 0; i < BABOONS; i++) {
      const baboon = new THREE.Group();
      const body = taper(3.4, 2.5, 3.8, carved, 6);
      body.position.z = 0.4;
      baboon.add(body);
      baboon.add(slab(3.2, 3.8, 7.2, 0.2, 3.8, carved));
      // The step is the golden angle so neighbours never land at similar heights
      // (no `Math.random`: the loader builds twice and compares).
      baboon.scale.y = 1 + 0.11 * Math.sin(i * 2.39996);
      baboon.rotation.y = 0.09 * Math.sin(i * 2.39996 + 1.7);
      baboon.position.set((i - (BABOONS - 1) / 2) * BABOON_PITCH, CORNICE_TOP, 0);
      group.add(baboon);
    }

    // -----------------------------------------------------------------------
    // 6. The colossus, built once and placed four times (no per-figure wobble).
    // -----------------------------------------------------------------------
    const colossus = (fallen: boolean): Group => {
      const figure = new THREE.Group();

      // Throne, thighs, shins, forearms, hands. All of this survived the fall.
      figure.add(slab(THRONE_HALF * 2, 0, SEAT, THRONE_BACK, THRONE_FRONT, carved));
      figure.add(slab(19, SEAT - 5, SEAT, -3, KNEE_Z, carved));
      for (const side of [-1, 1]) {
        figure.add(slab(7.2, 0, SHIN_TOP, 4.5, KNEE_Z, carved, side * 4.2));
        // Forearm along the thigh; the hand is wider than the arm so it reads as a hand.
        figure.add(slab(3.6, SEAT, SEAT + 3.8, -1, KNEE_Z, carved, side * 8.8));
        figure.add(slab(4.8, SEAT, SEAT + 2.8, KNEE_Z - 5, KNEE_Z + 0.3, carved, side * 8.2));
      }

      if (fallen) {
        // The stump, and a smaller block tipped off its top: the break is
        // ragged, and a flat sawn top would read as unfinished, not broken.
        figure.add(slab(14, SEAT, 30, -6.5, 3.5, carved));
        const shear = slab(9.5, 30, 34, -5, 1.5, carved, 1.3);
        shear.rotation.z = -0.1;
        figure.add(shear);

        // --- what is lying at its feet, on its own base ---
        // The head in its nemes, one group, leaning back against the shins face up.
        const head = new THREE.Group();
        head.add(wedge(17, 13, 14, 10, carved));
        head.add(slab(7, 3, 13.5, 3.6, 7, carved));
        head.rotation.set(-0.95, 0.3, 0.22);
        head.position.set(-8.5, 0, 11);
        restOn(head, 0);
        figure.add(head);

        // The crown, off the head and lying beside it: the only pale thing on
        // the ground, and the piece that names the pile.
        const crown = taper(6.4, 5.6, 6.5, regalia, 8);
        crown.rotation.set(1.45, 0.3, 0.3);
        crown.position.set(4, 0, 9);
        restOn(crown, 0);
        figure.add(crown);

        const torso = box(15, 9, 11, carved);
        torso.rotation.set(0.22, 0.6, 0.2);
        torso.position.set(-14, 0, 3);
        restOn(torso, 0);
        figure.add(torso);

        const shoulder = box(9, 6, 7, carved);
        shoulder.rotation.set(-0.3, -0.45, 0.24);
        shoulder.position.set(4, 0, 1);
        restOn(shoulder, 0);
        figure.add(shoulder);

        return figure;
      }

      // The feet, projecting past the plinth's face. Only the standing three get
      // them; on the fallen one they would be buried under its own head.
      for (const side of [-1, 1]) {
        figure.add(slab(7.2, 0, 3.8, KNEE_Z - 2, PLINTH_FRONT, carved, side * 4.2));
      }

      // Torso: 13 wide at the waist, 18 at the shoulders and 9.5 deep, so the
      // back sits three units inside the wall plane and is never seen.
      const torso = wedge(13, 18, SHOULDER - SEAT, 9.5, carved);
      torso.position.set(0, SEAT, -1.5);
      figure.add(torso);

      for (const side of [-1, 1]) {
        figure.add(slab(3.6, SEAT, SHOULDER, -2, 4.5, carved, side * 8.6));
      }

      // The nemes is one wedge (headcloth and lappets), 17 wide over 18-wide
      // shoulders, narrowing only to 13 so the head does not read as a cone.
      const nemes = wedge(17, 13, NEMES_TOP - NEMES_BOTTOM, 10, carved);
      nemes.position.set(0, NEMES_BOTTOM, 0);
      figure.add(nemes);

      // Face proud of the cloth, beard proud of the face, eyes proud of that: the
      // depth cascade from `moai-rapa-nui.ts`. The eye is a bar, not a socket.
      figure.add(slab(7, 43.5, 55, 3.4, 7, carved));
      figure.add(slab(2.6, 36.5, 44, 4.6, 7.6, carved));
      // The headcloth's two lappets fall onto the chest either side of the beard.
      for (const side of [-1, 1]) {
        figure.add(slab(3.4, 36, 47, 3.5, 6.5, carved, side * 5.5));
      }
      for (const side of [-1, 1]) {
        figure.add(slab(1.8, 49.5, 51, 6.5, 7.4, dark, side * 2.1));
      }

      // A broad modius almost as wide as the nemes (12.8 across).
      const crown = taper(6.4, 5.6, CROWN_TOP - NEMES_TOP, regalia, 8);
      crown.position.set(0, NEMES_TOP, 0);
      figure.add(crown);
      for (const side of [-1, 1]) {
        const plume = slab(4.6, CROWN_TOP, PLUME_TOP, -1.5, 1.5, regalia, side * 2.5);
        // Splayed four degrees: two parallel posts read as an aerial, two
        // leaning blades read as feathers.
        plume.rotation.z = -side * 0.07;
        figure.add(plume);
      }

      return figure;
    };

    for (let i = 0; i < FIGURE_X.length; i++) {
      const figure = colossus(i === FALLEN);
      figure.position.set(FIGURE_X[i]!, PLINTH_TOP, 0);
      group.add(figure);
    }

    return group;
  },
};

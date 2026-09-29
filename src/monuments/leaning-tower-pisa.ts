import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * The Leaning Tower of Pisa — the campanile of the cathedral, and the only
 * building in the world whose defining feature is a construction fault.
 *
 * Four things have to survive at thumbnail size, and everything in this file
 * serves one of them:
 *
 * - **The lean.** Not a detail, the whole subject. See `LEAN` below for the
 *   angle and why it is not the real one.
 * - **Six open arcaded galleries**, stacked. Each is a ring of slender columns
 *   standing clear of a dark drum, so the gap behind them is a real gap and the
 *   shaft is banded light/dark/light/dark all the way up. This is the tower's
 *   texture and the entire difference between a campanile and a chimney: take
 *   the galleries away and what is left is a factory flue that fell over.
 * - **A blind arcade at the ground storey**, 13.4 units against a gallery's
 *   6.95 — nearly twice the pitch of anything above it. Its arches are *solid*
 *   recesses, not voids, which is what "blind" means and what stops the base
 *   reading as a seventh gallery.
 * - **The belfry**, smaller and set back: its columns stand at 6.3 where the
 *   shaft's stand at 8.0, on a cornice that overhangs them by 2.3. The step is
 *   what makes it a bell chamber rather than the last gallery.
 *
 * The proportions are the real ones. 57 m maps to 68.8 of the `tower` tier's
 * 70, and the shaft is 18.6 wide against that — 0.27, which is exactly the real
 * 15.5 m over 57 m. Nothing here is stretched. The single exaggeration in the
 * file is the angle, and it is declared in one constant.
 *
 * Traded away, and why:
 *
 * - **No arches.** The galleries are square-headed voids with square posts. A
 *   real arcaded head is an extruded shape with a hole, ~130 triangles a bay,
 *   and there are 54 bays here — three times the whole tier's budget for
 *   something two pixels tall. The rhythm of post-gap-post is what the eye gets
 *   at any size, and the outline draws it for free.
 * - **Eight columns a gallery, not thirty.** Thirty is life; six galleries of
 *   thirty is 180 meshes before the ground storey exists, against a cap of 80.
 *   Eight is also the right *rendering* count: across the front of the thumbnail
 *   it puts a post every 11 px, where thirty would be a grey smear.
 * - **The shaft is straight.** The real one is bent — the builders corrected
 *   the tilt twice mid-construction, so it is faintly banana-shaped. A curve
 *   that subtle only muddies the one line that has to be unmistakable.
 */

const DEG = Math.PI / 180;

/**
 * **The lean: 10 degrees, against the real 3.97. An exaggeration of 2.5x.**
 *
 * At the true angle the top of a 69-unit tower moves 4.5 units sideways — about
 * a quarter of the tower's own width. On a photograph that is plenty, because a
 * photograph has a horizon, a cathedral and a plumb-straight world to measure it
 * against. In a 260-pixel thumbnail on a sky-blue field it reads as a model
 * somebody glued together carelessly, which is the one thing this monument
 * cannot afford to look like.
 *
 * At 10 degrees the top travels 11.3 units on a 9.3-unit base radius: the
 * belfry's centre clears the edge of the foundation, so the tower is visibly
 * *overhanging* rather than merely crooked. That is the threshold worth hitting
 * — past it no viewer can read it as anything but deliberate, and it is still
 * standing rather than toppling.
 */
const LEAN = 10 * DEG;

/**
 * **Which way it leans, and why it is not the true bearing.**
 *
 * In life the portal is on the north face and the tower leans south: the door
 * and the lean are on opposite sides of the shaft, near enough 180 degrees
 * apart. The contract pins the front to +Z and the contact sheet checks it with
 * a fixed front camera at (0, 0.12, 1), so a faithful model would tip straight
 * away from that camera — and a tilt along Z projects to *nothing at all* head
 * on. The one feature that must survive would be the one feature the checking
 * view cannot show.
 *
 * So the lean is rotated a quarter turn onto the model's X axis while the portal
 * stays on +Z. +X and not -X because screen-right is +X in both of the sheet's
 * views, and the tower falls to the right in every photograph ever taken of the
 * piazza: those are shot from the west end, looking east, where south is on the
 * right hand.
 *
 * A rotation of -LEAN about Z tips +Y toward +X, which is that lean.
 */

// --- elevations, in tower-local units: 0 is the top of the stone platform ---

/** How far the shaft is sunk into the platform. Its tilted foot hides in there. */
const BURIED = -1.8;
const GROUND_TOP = 13.4;
const CORNICE = 1.35;
const GALLERY = 5.6;
const PITCH = GALLERY + CORNICE;
const GALLERIES = 6;
const BELFRY_BASE = GROUND_TOP + CORNICE + GALLERIES * PITCH;
const BELFRY = 6.4;
const ROOF_BASE = BELFRY_BASE + BELFRY + 1.3;
const ROOF = 1.1;

// --- the platform, which does not tilt ---
const APRON_R = 11;
const APRON_H = 2.2;
const STYLOBATE_R = 10.2;
const STYLOBATE_H = 1.4;
const PLATFORM = APRON_H + STYLOBATE_H;

/**
 * **How a leaning tower obeys "base at y = 0, centred on the Y axis".**
 *
 * Tilt the whole thing about its foot and two contract rules break at once: the
 * base disc rolls onto its downhill rim, so the model both dips below the ground
 * and balances on an edge, and the bounding box drifts 5.7 units off the Y axis.
 *
 * Both are fixed here rather than fudged:
 *
 * 1. **The platform does not tilt.** An apron and a stylobate sit flat on the
 *    ground and the shaft is sunk 1.8 units into them, so the tilted foot is
 *    swallowed whole and what meets the ground is a level stone disc. This is
 *    also what Pisa does: the ground storey stands in a sunken basin, deeper on
 *    the side it leans towards.
 * 2. **The whole assembly slides back along -X by `CENTRE_SHIFT`,** so the
 *    bounding box straddles the axis. The foundation ends up uphill of the
 *    placement point and the belfry downhill of it, which is the honest answer
 *    for a building whose top overhangs its own foot by 11 units — there is no
 *    single "where it is" to be more faithful to.
 *
 * The value is measured, not derived: before the shift the model runs from
 * -11.0 (the apron's uphill rim) to +18.25 in x (the belfry cornice's downhill
 * rim), so its centre sits at 3.63. The bounding box does the work rather than
 * the axis of the shaft, which is why this is not simply half the top's travel.
 */
const CENTRE_SHIFT = 3.63;

// --- radii, as half-widths across the flats ---

/** Outer face of the shaft at the platform, and at the belfry floor. 15.5 m to 12.7 m in life. */
const SHELL_BASE = 9.3;
const SHELL_TOP = 8;
/** How far a cornice oversails the shell. Every storey ends on a ledge with its own ink line. */
const CORNICE_OUT = 0.55;
/** How far the dark drum is set back behind a colonnade. The gap is the whole point. */
const VOID = 1.9;

const COLUMNS = 8;
const COLUMN_W = 1.5;
const COLUMN_D = 1.15;

const BLIND_BAYS = 8;
const BLIND_BASE = 3;
const BLIND_H = 8.4;
const BLIND_W = 3.4;
const BLIND_D = 0.5;
/** The portal, and the shortened blind arch that sits above it on the same bay. */
const DOOR_BASE = 0.4;
const DOOR_H = 6;
const DOOR_W = 2.6;
const LUNETTE_BASE = 7.2;
const LUNETTE_H = 4.2;

const BELFRY_R = 6.3;
const BELFRY_VOID = 1.5;
const BELFRY_COLUMNS = 6;
const BELFRY_CAP_R = 6.9;
const BELFRY_CAP_H = 1.3;

/** The shaft tapers over its height, so every radius in the file is read off it. */
const shellAt = (y: number): number =>
  SHELL_BASE + (SHELL_TOP - SHELL_BASE) * (y / BELFRY_BASE);

export const leaningTowerPisa: Monument = {
  id: 'leaning-tower-pisa',
  name: 'Leaning Tower of Pisa',
  iso: 'ITA',
  lat: 43.723,
  lon: 10.396,
  realHeight: 57,
  tier: 'tower',
  footprint: 15,

  build(ctx) {
    const { THREE, palette, box, column, taper, around } = ctx;
    const marble = palette.cream;
    const stone = palette.bone;
    const shade = palette.bark;

    const group = new THREE.Group();

    // The returned group must keep an identity transform, so the centring slide
    // lives on a child — the same trick the Colosseum uses for its oval.
    const model = new THREE.Group();
    model.position.x = -CENTRE_SHIFT;
    group.add(model);

    // --- the platform: flat on the ground, and the only part that is ---
    model.add(column(APRON_R, APRON_H, stone, 20));

    const stylobate = column(STYLOBATE_R, STYLOBATE_H, stone, 20);
    stylobate.position.y = APRON_H;
    model.add(stylobate);

    // --- everything above this line leans ---
    const tower = new THREE.Group();
    tower.position.y = PLATFORM;
    tower.rotation.z = -LEAN;
    model.add(tower);

    // --- ground storey ---
    const drum = taper(shellAt(BURIED), shellAt(GROUND_TOP), GROUND_TOP - BURIED, marble, 16);
    drum.position.y = BURIED;
    tower.add(drum);

    // The blind arcade. The recesses stand a little proud of the wall rather
    // than sinking into it: a shallow recess vanishes under a cel ramp, while a
    // raised dark panel gets its own ink line for free. The bay on +Z carries
    // the portal instead, with its blind arch lifted above the door — which is
    // both the real elevation and the thing that marks the front.
    tower.add(
      around(BLIND_BAYS, (index) => {
        const bay = new THREE.Group();
        const front = index === 0;

        const base = front ? LUNETTE_BASE : BLIND_BASE;
        const height = front ? LUNETTE_H : BLIND_H;
        const arch = box(BLIND_W, height, BLIND_D, shade);
        arch.position.set(0, base, shellAt(base + height / 2));
        bay.add(arch);

        if (front) {
          const door = box(DOOR_W, DOOR_H, BLIND_D, shade);
          door.position.set(0, DOOR_BASE, shellAt(DOOR_BASE + DOOR_H / 2));
          bay.add(door);
        }
        return bay;
      }),
    );

    const cornice = (y: number): void => {
      const ledge = column(shellAt(y) + CORNICE_OUT, CORNICE, marble, 16);
      ledge.position.y = y;
      tower.add(ledge);
    };
    cornice(GROUND_TOP);

    // --- the galleries ---

    // One tapered drum behind all six colonnades, dark, so every gap between
    // every column has something to be a gap *in front of*. Six separate drums
    // would cost five meshes for a difference nobody can see; the cornices are
    // wider than it and hide it everywhere else.
    // Its ends stop `PROUD` inside the first and the last cornice: level with
    // them, its floor and its top shared their planes and flickered.
    const coreFoot = GROUND_TOP + PROUD;
    const coreHead = BELFRY_BASE - PROUD;
    const core = taper(
      shellAt(coreFoot) - VOID,
      shellAt(coreHead) - VOID,
      coreHead - coreFoot,
      shade,
      12,
    );
    core.position.y = coreFoot;
    tower.add(core);

    for (let storey = 0; storey < GALLERIES; storey++) {
      const base = GROUND_TOP + CORNICE + storey * PITCH;
      const shell = shellAt(base + GALLERY / 2);
      tower.add(
        around(COLUMNS, () => {
          const post = box(COLUMN_W, GALLERY, COLUMN_D, marble);
          post.position.set(0, base, shell - COLUMN_D / 2);
          return post;
        }),
      );
      cornice(base + GALLERY);
    }

    // --- the belfry, set back on the top cornice ---
    const bells = taper(
      BELFRY_R - BELFRY_VOID,
      BELFRY_R - BELFRY_VOID - 0.3,
      ROOF_BASE - BELFRY_BASE,
      shade,
      12,
    );
    bells.position.y = BELFRY_BASE;
    tower.add(bells);

    tower.add(
      around(BELFRY_COLUMNS, () => {
        const post = box(COLUMN_W, BELFRY, COLUMN_D, marble);
        post.position.set(0, BELFRY_BASE, BELFRY_R - COLUMN_D / 2);
        return post;
      }),
    );

    const cap = column(BELFRY_CAP_R, BELFRY_CAP_H, marble, 16);
    cap.position.y = BELFRY_BASE + BELFRY;
    tower.add(cap);

    const roof = taper(BELFRY_CAP_R - 0.5, BELFRY_CAP_R - 1.7, ROOF, stone, 12);
    roof.position.y = ROOF_BASE;
    tower.add(roof);

    return group;
  },
};

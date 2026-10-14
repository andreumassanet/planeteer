import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * The Leaning Tower of Pisa, the cathedral's campanile.
 *
 * Four things survive at thumbnail size: the lean, six open arcaded galleries
 * (rings of slender columns clear of a dark drum, so the shaft is banded
 * light/dark all the way up), a blind arcade at the ground storey (solid
 * recesses at nearly twice the pitch of the galleries above), and a belfry set
 * back on an overhanging cornice. The proportions are the real ones (shaft
 * width 0.27 of the height); the only exaggeration is the angle, in `LEAN`.
 *
 * To stay inside the mesh budget the galleries have square-headed voids with
 * square posts instead of arches, eight columns a gallery instead of thirty,
 * and a straight shaft.
 */

const DEG = Math.PI / 180;

/**
 * The lean: 10 degrees, 2.5x the real 3.97. At the true angle the top moves
 * only 4.5 units, which reads as carelessly glued in a thumbnail. At 10 degrees
 * the belfry's centre clears the edge of the foundation, so the tower visibly
 * overhangs.
 */
const LEAN = 10 * DEG;

/**
 * Which way it leans. In life the tower leans away from the portal, which would
 * project to nothing from the front camera, so the lean is turned a quarter
 * onto the X axis while the portal stays on +Z. It falls toward +X, screen
 * right in the front and quarter views. A rotation of -LEAN about Z tips +Y
 * toward +X.
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
 * Keeping "base at y = 0, centred on the Y axis" for a leaning tower.
 *
 * The platform does not tilt: an apron and a stylobate sit flat on the ground
 * and the shaft is sunk 1.8 units into them, so the tilted foot is hidden and a
 * level disc meets the ground. The whole assembly then slides back along -X by
 * `CENTRE_SHIFT` so the bounding box straddles the axis. The value is measured:
 * before the shift the model spans x = -11.0 (the apron's uphill rim) to +18.25
 * (the belfry cornice), so its centre sits at 3.63.
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

    // The returned group keeps an identity transform, so the centring slide lives on a child.
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

    // The blind arcade. The recesses stand a little proud of the wall (a shallow
    // recess vanishes under the cel ramp). The bay on +Z carries the portal, with
    // its blind arch lifted above the door.
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

    // One tapered drum behind all six colonnades, dark, so every gap has
    // something behind it. Its ends stop `PROUD` inside the first and last cornice.
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

import { PROUD, STOREY, TONES } from '../contract.ts';
import type { Mesh, ScenicPart } from '../contract.ts';

/**
 * Tower block — the tallest thing the kit is allowed to build.
 *
 * Capped at seven storeys and about 31 units, which is deliberate and is the one
 * rule in this file worth stating twice: **nothing generated may reach the
 * `building` monument tier's 40 units.** A city here is a mat of fabric with a
 * modelled landmark standing out of it, and the moment a procedural slab can
 * out-top the Colosseum, the tier system that keeps sixty-five monuments
 * coherent has been repealed by accident. The Empire State is a monument. This
 * is the block next to it.
 *
 * **This part is the reason the kit was re-authored.** It was a box with a
 * `ctx.rim` of glazing round it a floor — a real ring, one mesh, closing at the
 * corners — and the arithmetic was right and the picture was wrong: at Palma,
 * from the ground, six towers read as *orange slabs with black stripes on
 * them*. A band a floor is a stripe. A stripe is not a window, and in a world
 * whose ink is black, a dark horizontal band is read as ink before it is read
 * as glass.
 *
 * Five things replaced it, and only one of them is geometry:
 *
 * - **The glass is panes, not a band**, and it is `slate` toned down rather
 *   than a warm dark — a window is the sky reflected. Four panes a face, one
 *   mesh a face, six triangles.
 * - **The floors are marked by a band of the wall's own colour**, a shade
 *   darker and standing `PROUD`, wrapping all four faces. That is the
 *   horizontal the eye was reading in the glazing, given back as a *building*
 *   line instead of a hole.
 * - **The ground floor is darker and taller**, in the wall's own shade, glazed
 *   between piers and under a canopy in the trim colour. A tower that meets the
 *   ground in the same colour it meets the sky in has no bottom — and one that
 *   meets it in a whole storey of saturated trim is a paint job, which is what
 *   the note beside `podium` is about.
 * - **A service core runs the full height in a darker tone**, off-centre, so
 *   the facade is two masses and not one. It is one box.
 * - **Balconies**, three thin plates on the sunny side, merged into one mesh.
 *   They are the only thing on the model that breaks the prism, and they are
 *   what tells you people live in it.
 */

/**
 * The tallest the kit may build, well under the `building` tier's 40 — and it
 * is a cap on the *mast tip*, not on the roof. The plant, its cap and the mast
 * are 5.6 units above the parapet, so the body is capped at `CEILING - 5.6`;
 * capping the body at `CEILING` instead put a seven-storey tower's aerial at
 * 32.7, which is a number nothing in this file claimed.
 */
const CEILING = 31;
const PLANT = 5.6;

export const towerBlock: ScenicPart = {
  id: 'tower-block',
  name: 'Tower block',
  kind: 'block',
  footprint: 8.2,
  note: 'Five to seven storeys of panes and floor bands over a dark ground floor, with balconies and a core.',

  build(ctx, rng, style) {
    const { THREE, box, panes, tone, lit, rim, column, windows } = ctx;
    const group = new THREE.Group();

    const wall = rng.pick(style.walls);
    const trim = rng.pick(style.trim);
    const plant = rng.pick(style.roofs);

    const course = tone(wall, TONES.course);
    const band = tone(wall, TONES.cap);
    const core = tone(wall, TONES.eave);
    const light = tone(wall, TONES.light);
    // The lobby storey is the largest single area on the model — 4.4 to 5.1
    // units of it, wrapped round all four faces — so it is a *tone of the wall*
    // and not the trim colour. Built out of `style.trim` it was a band of
    // Mediterranean `skyBlue` five units tall at the foot of every tower in
    // Palma: the loudest thing in the frame, on the fabric rather than on the
    // landmark, which is the one thing scenery may not be. The trim keeps the
    // canopy and the entrance surround, where it is an accent the size of a
    // door and reads as one.
    const podium = tone(wall, TONES.eave);
    const accent = tone(trim, TONES.cap);

    const width = rng.range(8, 10.6);
    const depth = width * rng.range(0.75, 1);
    const storeys = rng.between(5, 7);
    // The ground floor is a shade taller than the ones over it, which is what a
    // building with a lobby in it does, and it is also the only floor an avatar
    // walking past can see into.
    const podiumHeight = STOREY * rng.range(1.15, 1.35);
    const body = Math.min(podiumHeight + (storeys - 1) * STOREY, CEILING - PLANT);
    const upper = body - podiumHeight;

    group.add(box(width + 0.3, 0.4, depth + 0.3, course));
    const lobby = box(width, podiumHeight, depth, podium);
    lobby.position.y = 0.4;
    group.add(lobby);
    const shell = box(width, upper, depth, wall);
    shell.position.y = 0.4 + podiumHeight;
    group.add(shell);

    // The service core: a slab of stair and lift standing proud of the facade
    // and running the whole height, off-centre. One box, and the facade stops
    // being one mass.
    const coreWidth = width * rng.range(0.2, 0.3);
    const coreX = (width / 2 - coreWidth / 2 - 0.2) * rng.sign();
    const stack = box(coreWidth, body - 0.2, depth + PROUD * 4, core);
    stack.position.set(coreX, 0.4, 0);
    group.add(stack);

    // --- the lobby: a glazed front under a canopy ---
    const front = depth / 2;
    const jambs = panes(5, width * 0.035, podiumHeight * 0.6, width * 0.145, accent, PROUD * 2);
    jambs.position.set(0, 0.4 + podiumHeight * 0.14, front + PROUD);
    group.add(jambs);
    const entrance = lit(panes(4, width * 0.15, podiumHeight * 0.55, width * 0.03, ctx.glass), 0.9);
    entrance.position.set(0, 0.4 + podiumHeight * 0.16, front + PROUD * 2);
    group.add(entrance);
    const canopy = box(width * 0.66, 0.24, 1.5, accent);
    canopy.position.set(0, 0.4 + podiumHeight * 0.78, front + 0.75);
    group.add(canopy);

    // --- the floors: four panes a face, and a band of wall between them ---
    // The glazing is laid in the facade the core leaves, not across it: the
    // core stands 0.16 proud of the wall and the glass 0.08, so a pane behind
    // it would simply be inside it, and the outermost window of every floor
    // would be missing without anything measuring it.
    const away = -Math.sign(coreX);
    const far = away * (width / 2 - 0.6);
    const near = coreX - away * (coreWidth / 2 + 0.25);
    const glassMid = (far + near) / 2;
    const paneWidth = Math.abs(far - near) / 4.96;
    const floors = Math.max(1, Math.round(upper / STOREY));
    for (let floor = 0; floor < floors; floor++) {
      const sill = 0.4 + podiumHeight + floor * (upper / floors) + STOREY * 0.24;
      for (const side of [1, -1]) {
        const glass = lit(panes(4, paneWidth, STOREY * 0.44, paneWidth * 0.32, ctx.glass));
        glass.rotation.y = side > 0 ? 0 : Math.PI;
        glass.position.set(side * glassMid, sill, side * (front + PROUD));
        group.add(glass);
      }
      // The floor line, wrapping all four faces. This is the horizontal the eye
      // was reading in the old glazing bands, moved onto the building.
      const line = box(width + PROUD * 2, 0.26, depth + PROUD * 2, band);
      line.position.y = sill - 0.5;
      group.add(line);
    }

    // A framed pair on one flank, so the tower is not blank from the alley.
    const flank = windows({
      count: 2,
      width: 1.2,
      height: STOREY * 0.44,
      frame: light,
      spread: depth * 0.34,
      reveal: 0,
    });
    flank.rotation.y = (away * Math.PI) / 2;
    flank.position.set((away * width) / 2 + away * PROUD, 0.4 + podiumHeight + upper * 0.5, 0);
    group.add(flank);

    // --- balconies: three plates on one side, one mesh ---
    if (floors >= 3) {
      const trays: Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const tray = box(width * 0.34, 0.22, 1.5, light);
        tray.position.set(glassMid, 0.4 + podiumHeight + (i + 0.4) * (upper / floors), front + 0.6);
        trays.push(tray);
      }
      group.add(ctx.merged(trays));
    }

    // --- the top: a parapet, plant, and on some of them a mast ---
    const parapet = rim(width + 0.5, depth + 0.5, 0.45, rng.range(0.8, 1.3), band);
    parapet.position.y = 0.4 + body;
    group.add(parapet);

    const head = box(width * rng.range(0.3, 0.45), 1.7, depth * rng.range(0.3, 0.45), plant);
    head.position.set(coreX, 0.4 + body, depth * rng.jitter() * 0.22);
    group.add(head);
    const headCap = box(width * 0.5, 0.22, depth * 0.5, tone(plant, TONES.cap));
    headCap.position.set(coreX, 0.4 + body + 1.7, head.position.z);
    group.add(headCap);

    if (rng.chance(0.5)) {
      const mast = column(0.18, rng.range(2, 3.2), plant, 4);
      mast.position.set(-coreX * 0.6, 0.4 + body + 1.92, -head.position.z * 0.6);
      group.add(mast);
    }

    return group;
  },
};

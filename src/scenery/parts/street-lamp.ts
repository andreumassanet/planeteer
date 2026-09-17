import { STOREY, rolePaint, sceneryModel } from '../contract.ts';
import type { ScenicPart } from '../contract.ts';
import type { Paint } from '../../models.ts';
import { PALETTE } from '../../theme.ts';

/**
 * Street lamp.
 *
 * **The one part in the kit whose reason for existing is what it looks like at
 * night, and it is deliberately not a window.** A lit window is interior light
 * escaping a building, so it is on the *houses* — and a village is mostly not
 * houses. Measured on the floor `settlements.ts` lays: a median town is nine
 * parts on a core of eleven paved cells, so most of what a night town shows you
 * is street, yard and square, and with windows alone all of it is dark. The lamp
 * is what puts light in the gaps, which is what a settlement seen from a
 * thousand units up actually is.
 *
 * It is `scatter` rather than a kind of its own because the kind table prices a
 * part by what it costs, and this is the cheapest thing in the kit after a grass
 * tuft: **52 triangles at the worst variant, three meshes, two colours**, against
 * the kind's caps of 90, 8 and 3. What it is *not* is a thing a region's
 * `scatter` list may hand to a plot — see the note on placement below.
 *
 * **Three numbers, and each is a read rather than a measurement of a real lamp.**
 *
 * - **Height 4.8 to 5.8 units** — 1.25 to 1.47 storeys, which is 3.8 to 4.4 m of
 *   real column, written in `STOREY`s because the contract asks parts to be
 *   authored in them rather than converted from metres. It has to stay under the
 *   `scatter` kind's 6-unit cap, and the tallest build measures 5.83. Against
 *   the kit's 7.6-unit two-storey eaves that is a lamp that clears a doorway and
 *   stands below a roof, which is the relation the eye checks. See `LOW`.
 * - **A head 0.52 to 0.72 across.** At 40 units that is 15 pixels and at 120 it is 5,
 *   which is the range `LEGIBLE_AT` gives for anything this small — so the lamp
 *   is a *bright dot* at conversational distance and gone by the far end of a
 *   street. That is the correct falloff: past 120 units what carries a town at
 *   night is the mass of its windows, and past 4,000 it is `lights.ts`'s point
 *   field. Three scales, three pieces of geometry, and none of them is asked to
 *   do another's job.
 * - **Six sides on the column and four on the head.** The column's chord error
 *   at six sides is 0.02 units on a 0.16 radius — a fiftieth of the pen — so the
 *   count is chosen for ink and not for geometry, which is the rule the Space
 *   Needle's legs established. Four on the head because a lantern is a box.
 *
 * **Nothing in `regions.ts` names it and nothing should.** `settlements.ts`
 * places it directly, on the street lattice it has already cut, because a lamp
 * belongs to a *carriageway* and the region tables place things on *plots* —
 * exactly the distinction `Vehicle.size` had to be invented for over in
 * `src/traffic/`. It is the fourth table that can build a part, after
 * `regions.ts`, `BIOMES[id].plants` and `CROWD_MIX`, and `sheets/scenery.ts`
 * knows about it so the orphan banner does not call it unbuildable.
 */

/**
 * How tall a column is, in storeys, both ends included.
 *
 * **A range and not a number, because the review sheet caught it as one.** With
 * a fixed height the only thing the seed could change was which of two caps went
 * on top, and `sheets/scenery.ts` measured the result exactly right: *only 2
 * distinct silhouettes across 6 variants — the seed is barely doing anything*.
 * A lamp is three shapes stacked, so the variety has to come from their
 * proportions; there is nothing else to vary. 1.25 to 1.47 storeys is 3.8 to 4.4
 * m, and the top of the range plus the tallest cap is 5.83 against the `scatter`
 * kind's 6-unit ceiling.
 */
const LOW = STOREY * 1.25;
const HIGH = STOREY * 1.47;

/**
 * **A town built from the City Kits gets the kit's own lamps** (2026-09-17):
 * Kenney's curved and square standards from City Kit (Roads), 92 and 60
 * triangles, their columns in the region's trim and their bulbs lit, where
 * the kit builds a region's houses or towers. Elsewhere the lantern below
 * stays, which suits a medina and a stilt village better than a highway light. The arm reaches `ARM` from the
 * column over the street — `settlements.ts` turns each lamp to face its street
 * (`Ground.lampYaws`) — so the footprint is the arm's and not the column's.
 * Quaternius's Victorian standards were the prettier and are 1,028 and 2,486
 * triangles, a town's thirty lamps as heavy as its buildings.
 */
const KIT_LAMPS = ['lamp-curved', 'lamp-square'];
const ARM = 1.9;

export const streetLamp: ScenicPart = {
  id: 'street-lamp',
  name: 'Street lamp',
  kind: 'scatter',
  footprint: ARM,
  note: 'A column and a lantern, or a City Kit standard in a kit-built region. Built for the dark, and placed on the street, not on a plot.',

  build(ctx, rng, style) {
    const { THREE, box, lit, taper } = ctx;
    // A standard where the kit builds houses or towers: a region that only
    // swaps its terraces keeps its lantern, which suits its old streets.
    if (style.assets?.['gabled-house'] !== undefined || style.assets?.['tower-block'] !== undefined) {
      const id = rng.pick(KIT_LAMPS);
      const post = rng.pick(style.trim);
      const model = sceneryModel(id);
      const column = rolePaint(model, [[/./, post]]);
      const bulb = (slot: string) => slot.endsWith('#ffffff');
      const paint: Paint = (slot, original) => (bulb(slot) ? PALETTE.white : column(slot, original));
      return ctx.fitted(id, { height: rng.range(LOW, HIGH), radius: ARM - 0.02, windows: bulb }, paint);
    }
    const group = new THREE.Group();

    // Out of `trim` and not `stone`: a lamp column is a made, painted thing
    // standing on a street, and the region's own trim is already the colour of
    // its shutters and its posts.
    const post = rng.pick(style.trim);
    // The lantern's own body is the glass colour it will be lit through, so by
    // day it is a dark head on a pale column and by night it is the same head
    // emitting. One mesh either way.
    const lantern = rng.pick(style.glass);

    // A taper and not a column, for nothing: a `taper` and a `column` are the
    // same 24 triangles out of the same helper, and a standard that is wider at
    // its foot is a lamp where a parallel stick is a pole. It also deletes the
    // collar that would otherwise be needed to stop it reading as something
    // pushed into the paving, which is 24 triangles saved.
    const height = rng.range(LOW, HIGH);
    const head = rng.range(0.52, 0.72);
    const lamp = rng.range(0.42, 0.6);

    const shaft = taper(rng.range(0.22, 0.3), 0.13, height - lamp, post, 6);
    group.add(shaft);

    // The head is set on the axis rather than on an arm. An arm is the shape a
    // street lamp actually has and at 5 pixels it is a lamp that looks broken —
    // the outline hulls the whole town as one mesh, so a 0.4-unit cantilever is
    // a smudge on one side of the dot rather than a bracket.
    const box_ = lit(box(head, lamp, head, lantern));
    box_.position.y = height - lamp;
    group.add(box_);

    // A cap, so the lantern is a lamp and not a cube on a stick. Seeded because
    // it is the only silhouette choice available here and a street of identical
    // lamps is the thing `VARIANTS` exists to prevent.
    // Three, not two: a flat plate, a pitched cap, and none at all — and the
    // third is what a plain bollard lamp is. Sized off the head so the footprint
    // holds however wide the seed drew it.
    const shape = rng.int(3);
    if (shape > 0) {
      const cap = shape === 1
        ? box(head * 1.26, 0.16, head * 1.26, post)
        : taper(head * 0.66, 0.06, 0.24, post, 4);
      cap.position.y = height;
      group.add(cap);
    }

    return group;
  },
};

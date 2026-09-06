import { PROUD, STOREY, TONES } from '../contract.ts';
import type { ScenicPart } from '../contract.ts';

/**
 * Gabled house — the workhorse of the kit.
 *
 * A box, a pitched roof, a chimney. Eight of the fourteen regions build most of
 * their fabric out of this one part, and they do not look alike, which is the
 * whole argument for a style table: what changes between Bergen and Brisbane is
 * the roof pitch, the wall colour and whether the roof is hipped, not the
 * building. Falu red under a 0.95 pitch is Nordic; cream under 0.45, hipped, is
 * an Australian bungalow; the geometry is identical.
 *
 * **What this part used to be is the argument for what it is now.** It was one
 * box, one roof, one chimney and *one black window band a floor* — and a black
 * band a floor is a stripe, so a street of them read as slabs with stripes on.
 * The fix was not triangles. It was that every element carries two or three
 * tones of its own colour and every join steps `PROUD` so the pen finds it:
 *
 * - a **base course** a shade darker than the wall and standing proud of it, so
 *   the house sits on the ground instead of ending at it;
 * - a **shadow band under the eaves**, the darkest tone on the building,
 *   because the overhang's own shadow is the thing that says *overhang*;
 * - a **ridge cap** in a darker tile, which is both a real roof detail and one
 *   more ink line along the single most useful edge a small building has;
 * - **windows with frames and panes** instead of a band — a lighter rendered
 *   surround, two slate panes, shutters on about half of them;
 * - a **door with a lintel and a step**, and a **chimney with a cap**.
 *
 * Four masses still carry it at the distance it is actually seen (see
 * `LEGIBLE_AT`): the pitch of the roof, the overhang of the eaves, the chimney
 * breaking the ridge line, and the annex — a lean-to, a porch or an L-wing —
 * that stops a row of these reading as one extruded shape. The tones are what
 * it is under 120 units and the masses are what it is over.
 *
 * **The L-wing is cut out of the plan rather than added to it**, which is the
 * one thing in this file that is not obvious. A wing bolted onto the back of a
 * full-depth house reached 8.7 units against a 7.4 footprint, and widening the
 * declaration would hand the layout a house a fifth bigger than the plot it
 * reserves — the trap `Vehicle.size` already paid for in `src/traffic/`. So a
 * wing shortens the main block by its own depth: same bounding box, an L in
 * plan, and a stepped silhouette that the full-depth variants do not have.
 *
 * What varies between variants: storeys, plan, which way the ridge runs, hipped
 * or gabled, the annex, whether the top storey is a lighter tone, a chimney or
 * not, shutters or not, and four colours out of the style. What is left to the
 * instance: position, yaw, and under a tenth of scale. The line between those
 * two is not taste — see `VARIANTS`.
 */

/** How far the roof projects past the wall on every side. */
const EAVES = 0.9;
/** The darker course at the foot of the wall. Half a metre of it, in life. */
const COURSE = 0.62;
/** The shadow the overhang casts on the wall, drawn rather than lit. */
const EAVE_BAND = 0.34;
/** Leaves the chimney room under the `dwelling` kind's 16-unit cap. */
const CEILING = 13.6;
/**
 * The shortest a house may come out, against the kind's 5-unit floor.
 *
 * A one-storey house under a Maghreb roof — pitch 0.15, so 0.66 of rise on a
 * 7-unit span — measured 4.9 and failed the floor, which is the check saying
 * that a box with a lid on it is a shed and not a dwelling. The storey count is
 * derived from this rather than clamped after the fact, so a house that would
 * have been too short is built with a second floor instead of being stretched.
 */
const FLOOR = 5.6;
/**
 * Framed windows this many floors up, and painted ones above.
 *
 * A reveal is ten triangles and a painted frame is two. Two floors of reveals
 * and a shuttered ground floor is 100 of the part's 264, which is what the
 * budget will carry; a third floor of them is not, and at the height of a third
 * floor nobody is close enough to see into it anyway.
 */
const FRAMED_FLOORS = 2;

export const gabledHouse: ScenicPart = {
  id: 'gabled-house',
  name: 'Gabled house',
  kind: 'dwelling',
  footprint: 7.4,
  note: 'One to three storeys under a pitched roof, with a base course, an eave band and framed windows.',

  build(ctx, rng, style) {
    const { THREE, box, panes, tone, lit, roof, windows } = ctx;
    const group = new THREE.Group();

    const wall = rng.pick(style.walls);
    const tile = rng.pick(style.roofs);
    const trim = rng.pick(style.trim);

    const course = tone(wall, TONES.course);
    const shade = tone(wall, TONES.eave);
    const surround = tone(wall, TONES.light);
    const ridgeTile = tone(tile, TONES.cap);
    const woodwork = tone(trim, TONES.cap);

    const width = rng.range(6, 7.2);
    const plan = width * rng.range(0.85, 1.05);

    // The annex is drawn before anything is sized, because an L-wing takes its
    // depth out of the main block rather than adding to it. See the note above.
    const annex = rng.between(0, 3);
    const wingDepth = annex === 3 ? plan * 0.34 : 0;
    const depth = plan - wingDepth * 0.72;

    // Which way the ridge runs. Half the houses on a street show you a gable and
    // half show you a slope, and that alternation is most of what stops a row
    // reading as one extruded shape.
    const gableToFront = rng.chance(0.45);
    const run = gableToFront ? width : depth;
    const span = gableToFront ? depth : width;
    const roofHeight = Math.min(style.pitch * (span / 2 + EAVES), 5);

    const room = Math.max(1, Math.floor((CEILING - roofHeight - COURSE) / STOREY));
    const storeys = Math.min(
      room,
      Math.max(
        rng.between(style.storeys[0], style.storeys[1]),
        // See `FLOOR`: under a shallow roof the walls have to carry the height.
        Math.ceil((FLOOR - COURSE - roofHeight) / STOREY),
      ),
    );
    const body = storeys * STOREY;

    // --- the wall, in three tones of one colour ---
    group.add(box(width + PROUD * 2, COURSE, depth + PROUD * 2, course));

    // On some of them the top storey is rendered a shade lighter than the rest,
    // which is a real thing a house does when it grows a floor and is the
    // cheapest storey line there is: one box and no extra colour.
    const lightTop = storeys > 1 && rng.chance(0.4);
    const lower = lightTop ? body - STOREY : body;
    const shell = box(width, lower, depth, wall);
    shell.position.y = COURSE;
    group.add(shell);
    if (lightTop) {
      const attic = box(width + PROUD, STOREY, depth + PROUD, surround);
      attic.position.y = COURSE + lower;
      group.add(attic);
    }

    const eaveBand = box(width + PROUD * 2, EAVE_BAND, depth + PROUD * 2, shade);
    eaveBand.position.y = COURSE + body - EAVE_BAND;
    group.add(eaveBand);

    // --- the roof, its ridge and its chimney, all turning together ---
    const cap = new THREE.Group();
    const hipped = rng.chance(style.hipped);
    const eaved = run + EAVES * 2;
    const ridge = hipped ? run * 0.45 : eaved;
    cap.add(roof(eaved, span + EAVES * 2, roofHeight, ridge, tile));
    // The ridge cap: a darker tile laid along the top. It is a real detail and
    // it is also one more ink line on the edge that names the shape. Held
    // inside the roof it caps, so it cannot be what pushes the footprint out.
    const ridgeCap = box(Math.min(ridge + 0.3, eaved), 0.3, 0.42, ridgeTile);
    ridgeCap.position.y = roofHeight - 0.1;
    cap.add(ridgeCap);
    if (rng.chance(0.72)) {
      const stack = box(0.82, 1.9, 0.82, course);
      stack.position.set(rng.jitter() * run * 0.3, roofHeight - 0.7, 0);
      cap.add(stack);
      const pot = box(1.04, 0.3, 1.04, ridgeTile);
      pot.position.set(stack.position.x, stack.position.y + 1.9, 0);
      cap.add(pot);
    }
    cap.position.y = COURSE + body;
    if (gableToFront) cap.rotation.y = Math.PI / 2;
    group.add(cap);

    // --- the door: a leaf, a lintel over it, a step under it ---
    const front = depth / 2;
    const doorWidth = 1.45;
    const doorX = -width * 0.24;
    const leaf = panes(1, doorWidth, 2.45, 0, woodwork, PROUD * 2);
    leaf.position.set(doorX, COURSE, front + PROUD);
    group.add(leaf);
    const lintel = panes(1, doorWidth + 0.55, 0.26, 0, surround, PROUD * 3);
    lintel.position.set(doorX, COURSE + 2.45, front + PROUD * 1.5);
    group.add(lintel);
    const step = box(doorWidth + 0.75, COURSE, 0.55, course);
    step.position.set(doorX, 0, front + 0.27);
    group.add(step);

    // --- the windows ---
    // `windows` merges the frames of a row into one mesh and the shutters into
    // another, and leaves the glass one mesh a window, so the town lights this
    // house's rooms one at a time. The back gets a bare pane row: one mesh, one
    // room, four triangles, and nobody stands behind a house.
    const shutters = rng.chance(0.45) ? woodwork : undefined;
    const windowWidth = 1.35;
    const windowHeight = 1.5;
    // Which wall the second row of a floor goes on, stepped by floor. A house
    // with all its glazing on the front and the back has two blank flanks, and
    // a street of them is a corridor of blank walls — but a fourth row costs
    // four triangles the part does not have at 260 of 264. Stepping the one
    // row it does have round the building is free: a one-storey house shows a
    // flank or a back, and a three-storey house shows all three.
    const firstSide = rng.between(0, 2);
    for (let floor = 0; floor < storeys; floor++) {
      const sill = COURSE + floor * STOREY + STOREY * 0.38;
      const framed = floor < FRAMED_FLOORS;
      // The ground floor shares its frontage with the door, so its pair sits to
      // one side; the floors above run the middle of the wall.
      const count = 2;
      const row = windows({
        count,
        width: windowWidth,
        height: windowHeight,
        frame: surround,
        spread: width / (count + 0.6),
        shutters: floor === 0 ? shutters : undefined,
        reveal: framed ? undefined : 0,
      });
      row.position.set(floor === 0 ? width * 0.2 : 0, sill, front);
      group.add(row);

      const side = (firstSide + floor) % 3;
      const away = lit(panes(2, windowWidth, windowHeight, windowWidth * 0.8, ctx.glass));
      if (side === 0) {
        away.rotation.y = Math.PI;
        away.position.set(0, sill, -front - PROUD);
      } else {
        const face = side === 1 ? 1 : -1;
        away.rotation.y = (face * Math.PI) / 2;
        away.position.set((face * width) / 2 + face * PROUD, sill, 0);
      }
      group.add(away);
    }

    // --- the annex, which is what the silhouette is actually made of ---
    if (annex === 1) {
      // A lean-to against one flank.
      const side = rng.sign();
      const leanWidth = 1.9;
      const leanDepth = depth * rng.range(0.42, 0.55);
      const leanHeight = STOREY * 0.85;
      const lean = box(leanWidth, leanHeight, leanDepth, wall);
      lean.position.set(side * (width / 2 + leanWidth / 2), COURSE, rng.jitter() * depth * 0.1);
      group.add(lean);

      const leanRoof = roof(leanDepth + 0.5, leanWidth + 0.5, 0.85, leanDepth + 0.5, tile);
      leanRoof.rotation.y = Math.PI / 2;
      leanRoof.position.set(lean.position.x, COURSE + leanHeight, lean.position.z);
      group.add(leanRoof);
    } else if (annex === 2) {
      // A porch over the door: two posts and a pent roof. It is the one annex
      // that reads from the front, which is the side a street sees.
      const porchDepth = 1.5;
      const porchHeight = 2.9;
      const posts = panes(2, 0.24, porchHeight, doorWidth + 0.9, woodwork, 0.24);
      posts.position.set(doorX, 0, front + porchDepth - 0.12);
      group.add(posts);
      const canopy = roof(doorWidth + 1.5, porchDepth + 0.5, 0.55, doorWidth + 1.5, tile);
      canopy.position.set(doorX, porchHeight, front + porchDepth * 0.5);
      group.add(canopy);
    } else if (annex === 3) {
      // The L-wing: a lower mass at right angles across the back, taken out of
      // the main block's depth rather than added behind it.
      const wingWidth = width * rng.range(0.5, 0.62);
      const wingHeight = STOREY * (storeys > 1 ? 1.55 : 1) + COURSE - 0.2;
      const side = rng.sign();
      const at = side * (width / 2 - wingWidth / 2);
      const behind = -depth / 2 - wingDepth / 2 + 0.2;
      const wing = box(wingWidth, wingHeight, wingDepth + 0.4, wall);
      wing.position.set(at, 0, behind);
      group.add(wing);
      const wingRise = Math.min(style.pitch * (wingWidth / 2 + 0.5), 2.6);
      const wingRoof = roof(wingDepth + 1.4, wingWidth + 1, wingRise, wingDepth + 1.4, tile);
      wingRoof.rotation.y = Math.PI / 2;
      wingRoof.position.set(at, wingHeight, behind);
      group.add(wingRoof);
    }

    return group;
  },
};

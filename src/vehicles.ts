/**
 * The two vehicles: a launch for the water and a floatplane for the air.
 *
 * They exist for different reasons. The boat is what makes the sea a surface —
 * until it existed, walking into the ocean dropped you to sea level and you
 * carried on as if the water were a floor. The plane is the map: `rig.view`
 * already frames the player and the fog already opens with altitude, so
 * climbing until the globe fits the lens is a flight, not a screen.
 *
 * This file owns their shape and their numbers. `player.ts` owns the state
 * machine that rides them, because it owns `position`.
 *
 * ## Both of them are sized against the body, and neither used to be
 *
 * They are two of the three things the player looks at all session and the
 * third — `src/avatar.ts` — was rebuilt to the monument contract first. What
 * the rebuild made visible is that these two were built to numbers that had
 * never been checked against a person: the launch's console topped out at 1.30
 * units, which is **below the knee** of a 6.80 body (`FIGURE.kneeY` 1.66), so
 * the helmsman could not reach his own wheel; and the fuselage was a capsule
 * 4.40 across, so there was no height at which a 6.80 pilot could sit in it and
 * the model was simply dropped 0.9 into the hull.
 *
 * Every dimension below is now derived from one of two published records and
 * the derivation is written next to it:
 *
 * - **`FIGURE` in `src/avatar.ts`** — every height above the sole and every
 *   segment length of the body that rides these.
 * - **`SEATED` in `src/traffic/contract.ts`** — the same body sitting down,
 *   measured off built geometry by the crowd kit: origin at the seat surface,
 *   hip at y = 0, sole −1.75, crown +3.84, knee z +1.34, toe z +1.97,
 *   shoulder joint y +1.42, and **4.30 of clear width, which is the envelope
 *   and not the 2.60 across the shoulders**.
 *
 * Where the two disagree the player's own body wins, because it is the one that
 * is actually in the seat, and it is measured here rather than assumed: in the
 * `sit` pose it is 1.85 from hip to sole, 3.81 to the crown, 2.38 to the toe and
 * **1.21 behind the hip, because of the rucksack** — half a unit deeper than the
 * crowd's 0.72, which is the number a seat back would have been built to.
 *
 * ## They are built through the monument contract now
 *
 * They used to carry their own `craftMaterial`, their own 3-band ramp and their
 * own 0.006 pen, and their masses were a sphere, two capsules and a cone —
 * **smooth-shaded, which is the one thing this world's style cannot use.** It is
 * the same fault `avatar.ts` found and wrote down: `MeshToonMaterial` steps a
 * four-band ramp across a normal, and a smooth normal sweeps it continuously
 * instead. `createContext()` facets everything through `toNonIndexed`, hands out
 * the world's 24 colours and the world's 0.005 pen, and it made the plane
 * *cheaper* rather than dearer — a `CapsuleGeometry(2.2, 9, 4, 16)` is 512
 * triangles of subdivision the ramp cannot use.
 */
import * as THREE from 'three';
import { FIGURE } from './avatar.ts';
import { PLANET_RADIUS } from './globe.ts';
import { createContext } from './monuments/contract.ts';

/**
 * One context, made at import, exactly as `avatar.ts` does it. `createContext`
 * registers its ramp with `theme.ts` so the moods repaint it, so it must be
 * made once and not once per craft.
 */
const ctx = createContext();
const P = ctx.palette;
const V = THREE.Vector3;

/**
 * Anything within this of sea level is water.
 *
 * Not zero: `elevationAt` returns land heights that terrain relief will start
 * varying, and a comparison against an exact radius would flicker between land
 * and sea on the shoreline. The lowest ground on the planet is `SHORE_LIP`,
 * four units, which is eight times this.
 */
const SEA_LEVEL_EPSILON = 0.5;

export function isWater(ground: number): boolean {
  return ground <= PLANET_RADIUS + SEA_LEVEL_EPSILON;
}

// ---------------------------------------------------------------------------
// A lofted shell
// ---------------------------------------------------------------------------

/**
 * One section of a lofted shell, in the shell's own frame.
 *
 * `z` runs aft to forward and must strictly increase; the section is a
 * rectangle `[x - half, x + half]` by `[bottom, top]`. A hull, a float, a
 * fuselage and a wing panel are all this shape and nothing else in the monument
 * contract makes it: `box` cannot taper, `taper` is square in section, and
 * `column` is a prism about Y.
 */
interface Station {
  z: number;
  /** Centre of the section in x. Non-zero draws one side of something. */
  x?: number;
  /** Half-width. Small rather than zero at a stem, or the end cap is degenerate. */
  half: number;
  bottom: number;
  top: number;
}

/**
 * A closed box-section loft: four runs of quads between the stations and a cap
 * at each end.
 *
 * **The winding is the whole of it**, and it is the trap `CLAUDE.md` writes up
 * twice over: a shell wound inside out has every face pointing into itself, so
 * `OutlineEffect`'s `BackSide` hull becomes front-facing and the mesh renders as
 * a solid ink blob. Nothing about the geometry says which way round it is, so
 * the check is arithmetic — the signed volume of the closed shell, by the
 * divergence theorem, must come out **positive**. `assertOutward` below is that
 * check and it runs on every shell this file builds.
 *
 * Written non-indexed on purpose, which is what `computeVertexNormals` needs to
 * give one normal per face — the same reason the land mesh is non-indexed and
 * the same reason `createContext` calls `toNonIndexed` on everything.
 */
function shell(stations: readonly Station[], color: number): THREE.Mesh {
  const p: number[] = [];
  const corners = (s: Station): number[][] => {
    const x = s.x ?? 0;
    return [
      [x - s.half, s.bottom, s.z],
      [x + s.half, s.bottom, s.z],
      [x + s.half, s.top, s.z],
      [x - s.half, s.top, s.z],
    ];
  };
  // Counter-clockwise seen from outside, so the normal points away.
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    p.push(...a, ...b, ...c, ...a, ...c, ...d);
  };

  for (let i = 0; i + 1 < stations.length; i++) {
    const A = corners(stations[i]!);
    const B = corners(stations[i + 1]!);
    quad(A[1]!, A[2]!, B[2]!, B[1]!); // starboard, +x
    quad(A[3]!, A[0]!, B[0]!, B[3]!); // port, -x
    quad(A[0]!, A[1]!, B[1]!, B[0]!); // bottom, -y
    quad(A[2]!, A[3]!, B[3]!, B[2]!); // top, +y
  }
  const first = corners(stations[0]!);
  quad(first[3]!, first[2]!, first[1]!, first[0]!); // aft cap, -z
  const last = corners(stations[stations.length - 1]!);
  quad(last[0]!, last[1]!, last[2]!, last[3]!); // forward cap, +z

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.computeVertexNormals();
  assertOutward(p, stations);
  return new THREE.Mesh(geometry, ctx.toon(color));
}

/**
 * Six times the signed volume of a closed triangle soup. Positive is outward.
 *
 * Thrown rather than warned, because a reversed shell is not a subtle fault:
 * the whole mesh draws in the outline colour, and the last time this project
 * met it, it cost a full round of accusing `src/outline.ts` of a bug it did not
 * have.
 */
function assertOutward(p: readonly number[], stations: readonly Station[]): void {
  let volume = 0;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i]!, ay = p[i + 1]!, az = p[i + 2]!;
    const bx = p[i + 3]!, by = p[i + 4]!, bz = p[i + 5]!;
    const cx = p[i + 6]!, cy = p[i + 7]!, cz = p[i + 8]!;
    volume +=
      ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (volume <= 0) {
    throw new Error(
      `shell is wound inside out (6V = ${volume.toFixed(2)}): stations must run aft to forward ` +
        `with strictly increasing z. First station z = ${stations[0]!.z}, last = ${stations[stations.length - 1]!.z}.`,
    );
  }
}

/** Linear interpolation along a table keyed on `z`. */
function alongZ<K extends string>(
  table: readonly ({ z: number } & Record<K, number>)[],
  key: K,
  z: number,
): number {
  if (z <= table[0]!.z) return table[0]![key];
  for (let i = 0; i + 1 < table.length; i++) {
    const a = table[i]!;
    const b = table[i + 1]!;
    if (z <= b.z) return a[key] + ((b[key] - a[key]) * (z - a.z)) / (b.z - a.z);
  }
  return table[table.length - 1]![key];
}

// ---------------------------------------------------------------------------
// The launch
// ---------------------------------------------------------------------------

/**
 * Where the player stands in the boat: the deck, above the waterline.
 *
 * It is also the launch's own datum — `y = 0` in `buildBoat` is the cockpit
 * sole, so the waterline is at `-BOAT_DECK` and a review sheet has to put its
 * water disc there. That is what the boat cell in `/avatar-sheet.html` does.
 */
export const BOAT_DECK = 2;
/** Cruise and full ahead. Between a walk and a run, so the coast still reads. */
export const BOAT_SPEED = 115;
export const BOAT_BOOST = 250;
/** Rudder, radians per second. A half turn in 2.7 s. */
export const BOAT_TURN = 1.15;
export const BOAT_ACCELERATION_TIME = 1.1;

/**
 * The launch's plan, aft to forward: half-beam at the sheer and the keel under
 * it. Everything else about the hull is interpolated off this one table, so the
 * topsides, the rubbing strake, the sole and the foredeck cannot disagree with
 * the underbody about where the side of the boat is.
 *
 * **The beam is the pilot's, not a boat's.** The hull it replaced was **4.80
 * wide overall** against a pilot who measured **4.84 across** with his hands
 * out: his knuckles hung over both gunwales. 7.00 of beam less 0.34 of topside
 * each side is 6.32 of clear cockpit.
 *
 * **The 4.84 is a pose that no longer exists and the beam is right anyway**,
 * which is worth stating rather than quietly restating the new number. That
 * measurement was `brace`, arms out against nothing, because the launch had
 * nothing to hold; `avatar.ts` gives this craft `steer` now and a man with both
 * hands on a wheel measures **3.82**. Re-derived from 3.82 the hull would want
 * about 5.5, and it stays at 7.00 for the reason the paragraph below already
 * gives — the length follows from the beam, and 17.80 by 5.50 is L/B 3.24,
 * outside what an open launch is. The beam is now the *hull's* number, checked
 * against the pilot rather than derived from him, and the pilot clears it by
 * 1.25 either side instead of 0.74.
 *
 * Length follows from the beam and not from taste: 17.80 by 7.00 is L/B 2.54,
 * where a real open launch runs 2.5 to 3.0. Against the avatar it is 2.6 body
 * heights, which is a 1.75 m man in a 4.6 m boat — the old hull was 11.26, or
 * **1.66 body heights, a man in a 2.9 m dinghy**.
 */
const HULL = [
  { z: -8.9, half: 3.05, keel: -2.55 },
  { z: -5.2, half: 3.46, keel: -3.14 },
  { z: -0.6, half: 3.5, keel: -3.2 },
  { z: 3.2, half: 3.16, keel: -2.92 },
  { z: 6.4, half: 2.1, keel: -2.1 },
  { z: 8.9, half: 0.34, keel: -0.85 },
] as const;

const TRANSOM = HULL[0].z;
const STEM = HULL[HULL.length - 1]!.z;
/** Thickness of the topsides, and how far the sole is inset from the skin. */
const TOPSIDE = 0.34;
/** Sole to sheer. 2.10 is 31% of `FIGURE.height` — a gunwale under `hipY` (3.00). */
const SHEER = 2.1;
/** Where the foredeck begins, which is the forward face of the console. */
const FOREDECK = 2.2;

const halfAt = (z: number) => alongZ(HULL, 'half', z);
const keelAt = (z: number) => alongZ(HULL, 'keel', z);

/**
 * Half the hull plus a margin: how far ahead of the origin land stops the boat.
 *
 * **Re-derived, not nudged.** The helm is amidships, so one constant serves
 * both ends, and the end it has to serve is the *longer* one — which is the
 * stern, because the outboard hangs 1.0 off a transom at 8.90. The old 9 was
 * `5.51 + 3.49` on a hull 11.26 long; this is `9.90 + 3.60` on one that measures
 * 18.79 from skeg to stem. **The margin is what did not change**, and it should not:
 * what it absorbs is a coast lying between the three bearings `HULL_PROBES`
 * samples, which is a fact about the sampling and not about the hull.
 *
 * What it spends is `SHORE_REACH`: see there.
 */
export const BOAT_BOW = 13.5;

/**
 * How far inland stepping ashore puts you.
 *
 * **It has to exceed `BOAT_BOW`**, because the hull is stopped by land found at
 * `BOAT_BOW` ahead — step short of that and you disembark into the water you
 * were floating on. It used to also have to clear a 20-unit coastal cliff, and
 * that job is gone: the shore ramps now, so there is no lip to land on.
 *
 * 22 against a `BOAT_BOW` of 13.5 lands you 8.5 units past the first land the
 * probe found. **Measured in the live world rather than derived**: driving at
 * fifteen real coasts until the hull stopped, land was 14.5 ahead — `BOAT_BOW`
 * plus a frame of travel — and `E` put the player on ground **4.0 to 14.2 units
 * above sea level**, every one of them over `SHORE_LIP` and an order of
 * magnitude over `SEA_LEVEL_EPSILON`, which is the test that decides whether
 * you are back in the boat. No case stranded.
 */
export const SHORE_REACH = 22;

/**
 * Every mesh in a craft casts the sun's shadow and stands in everything
 * else's. Three reads the flags per mesh and not per group, hence the walk;
 * called once per build, after the last part is added.
 */
function castShadows(group: THREE.Object3D): void {
  group.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
}

/**
 * A small open launch, facing +Z, with the cockpit sole at `y = 0` so the
 * avatar stands on it with no offset, and the helm amidships at `z = 0`.
 *
 * **The console is the point of this model, and it is two boxes because the
 * pose has two heights in it.** It used to be one box 1.30 tall — knee height
 * on a body whose knee is at 1.66 — and `avatar.ts` says so in `brace`'s own
 * comment: *he cannot reach the wheel without kneeling on it*. Measured off the
 * braced pose, the two heights are:
 *
 * - **The hands are at y 2.14 to 2.67, z 0.56 to 0.97, x 1.92 to 2.41.** So the
 *   console's after ledge is 5.0 wide with its top at 2.19 and it runs from
 *   z 0.50 to 1.35: both palms come down on it, 0.05 in, which is a hand
 *   resting on something rather than hovering over it.
 * - **The wheel is what he has to be able to take**, and its hub is at
 *   (0, 3.72, 1.15) on a binnacle whose top is at 3.10. Each hand's own side of
 *   the rim is **1.48 from that shoulder joint against an arm of 2.48 — 60% of
 *   full reach**, and the furthest point of the rim, which is the far side he
 *   would never use, is 93%. The old console's top edge was 155%.
 *
 * What is still owed is a pose: `brace` puts the hands on the ledge and not on
 * the wheel, because it was written for a boat that had nothing to hold. That
 * is `avatar.ts`, and the geometry it would need is now there.
 */
export function buildBoat(): THREE.Group {
  const group = new THREE.Group();

  // The underbody, keel to just under the sole. Its top is at -0.16 rather than
  // at 0 so the sole plate can sit in the recess instead of standing on it: two
  // coplanar faces get no ink between them, and a 0.16 step gets one.
  group.add(
    shell(
      HULL.map((s) => ({ z: s.z, half: s.half, bottom: s.keel, top: -0.16 })),
      P.cream,
    ),
  );

  // The cockpit sole, inset by the topsides so it meets them rather than
  // crossing them.
  const soleStations = [TRANSOM, -5.2, -0.6, FOREDECK].map((z) => ({
    z,
    half: halfAt(z) - TOPSIDE,
    bottom: -0.16,
    top: 0,
  }));
  group.add(shell(soleStations, P.bark));

  // Topsides and rubbing strake, one loft a side. They start at -0.20, below
  // the underbody's top, so there is no gap in the skin at the sole line.
  for (const side of [-1, 1]) {
    group.add(
      shell(
        HULL.map((s) => ({
          z: s.z,
          x: side * (s.half - TOPSIDE / 2),
          half: TOPSIDE / 2,
          bottom: -0.2,
          top: SHEER,
        })),
        P.cream,
      ),
    );
    // Proud of the skin by 0.16, so it is a strake and not a stripe painted on
    // one: a flush band would be coplanar and would draw no ink of its own.
    group.add(
      shell(
        HULL.map((s) => ({ z: s.z, x: side * s.half, half: 0.16, bottom: 1.46, top: 1.86 })),
        P.red,
      ),
    );
  }

  // The foredeck: a plate at the sheer, from the console forward to the stem.
  group.add(
    shell(
      [FOREDECK, 3.2, 6.4, STEM].map((z) => ({
        z,
        half: halfAt(z) - 0.02,
        bottom: 1.76,
        top: SHEER,
      })),
      P.cream,
    ),
  );

  const transom = ctx.box(halfAt(TRANSOM) * 2 - TOPSIDE * 2, SHEER, 0.36, P.cream);
  transom.position.set(0, -0.2, TRANSOM + 0.18);
  group.add(transom);

  // A hatch, proud by 0.1. The foredeck is 6.7 units of unbroken pale plate and
  // the largest flat area on the boat; the same argument as Niagara's curtain.
  const hatch = ctx.box(2.2, 0.1, 2.4, P.tan);
  hatch.position.set(0, SHEER, 5.1);
  group.add(hatch);

  // ---- the helm -----------------------------------------------------------

  // The after ledge, at the height of the braced hands. 5.0 wide because the
  // hands are 4.82 apart; the pose splays the arms and that is what sets it.
  const ledge = ctx.box(5.0, 2.19, 0.85, P.tan);
  ledge.position.set(0, 0, 0.925);
  group.add(ledge);

  // The binnacle, stepped 0.06 forward of the ledge's own face so the two do
  // not share a plane, and narrow enough that the hands pass outside it.
  const binnacle = ctx.box(3.4, 3.1, FOREDECK - 1.41, P.tan);
  binnacle.position.set(0, 0, (1.41 + FOREDECK) / 2);
  group.add(binnacle);

  // Instruments, standing 0.18 proud of the binnacle's aft face rather than
  // flush with it, and above the ledge so they are not hidden by it.
  const instruments = ctx.box(2.8, 0.62, 0.18, P.steel);
  instruments.position.set(0, 2.32, 1.32);
  group.add(instruments);

  const H = BOAT_HELM;
  const hub = new V(H.hub[0], H.hub[1], H.hub[2]);
  const column = ctx.strut(new V(0, 2.95, 1.72), hub.clone(), 0.17, P.steel);
  group.add(column);

  // The wheel. Ten sides rather than eight: at the boat framing, 46 units back,
  // the rim is about 20 px across, and this is the one feature on the craft
  // that says the player is steering it.
  const rim = ctx.ringWall(H.inner, H.outer, H.thickness, P.ink, 10);
  rim.position.copy(hub);
  // The wheel's axis is the column's: raked back 25 degrees off horizontal, so
  // the face is turned towards the helmsman and not laid flat like a bus.
  rim.rotation.x = H.rake;
  group.add(rim);
  group.add(ctx.strut(new V(-0.5, H.hub[1], H.hub[2]), new V(0.5, H.hub[1], H.hub[2]), H.thickness, P.ink));
  const boss = ctx.column(0.19, 0.2, P.gold, 6);
  boss.position.set(0, H.hub[1] - 0.04, H.hub[2] + 0.09);
  boss.rotation.x = H.rake;
  group.add(boss);

  // The screen rakes back off the binnacle to a top edge at 5.11 — **above the
  // helmsman's shoulders at 4.78**, and that is a visibility measurement rather
  // than a boat one. Raycast from the player's own camera at 784x388: the wheel,
  // its column, its spoke and its boss are **0 px** and the binnacle is 18,
  // because from dead astern the man is standing in front of his own helm, which
  // is what a helmsman does. The screen is the one part of it that can be seen
  // past him, and only because it clears his shoulders — at 4.72 it was 20 px
  // and at 5.11 it is 124.
  const screen = ctx.box(3.4, 2.1, 0.16, P.skyBlue);
  screen.position.set(0, 3.1, 2.24);
  screen.rotation.x = -0.3;
  group.add(screen);

  // ---- the after cockpit --------------------------------------------------

  // A bench whose top is at 1.66, which is `FIGURE.shin + FIGURE.ankleY` — the
  // height that puts a seated hip on the seat surface rather than above it.
  const bench = ctx.box(4.8, 0.36, 1.5, P.bark);
  bench.position.set(0, 1.3, -4.2);
  group.add(bench);
  const back = ctx.box(4.8, 0.95, 0.28, P.bark);
  back.position.set(0, 1.66, -4.95);
  group.add(back);

  // The outboard is what makes the stern the longer end: it reaches 9.90, one
  // unit past the transom, and `BOAT_BOW` is measured off *it* and not off the
  // stem.
  const cowling = ctx.box(1.4, 1.75, 1.05, P.steel);
  cowling.position.set(0, 1.1, -9.37);
  group.add(cowling);
  const leg = ctx.box(0.58, 2.3, 0.72, P.ink);
  leg.position.set(0, -1.2, -9.37);
  group.add(leg);

  group.name = 'boat';
  castShadows(group);
  return group;
}

// ---------------------------------------------------------------------------
// The floatplane
// ---------------------------------------------------------------------------

/**
 * How far the floats hang below the plane's datum.
 *
 * The old model's floats hung **4.45** — a 3.4 strut plus a 1.05 pontoon radius
 * — against a `PLANE_CLEARANCE` of 4 whose own comment said *enough for the
 * floats, which hang 3.4 down*. So the floats went 0.45 into the ground on
 * every approach. `PLANE_CLEARANCE` is derived from this now rather than
 * asserted beside it.
 */
const FLOAT_KEEL = 3.4;

/**
 * Lowest and highest the plane will hold.
 *
 * The ceiling is what makes the plane the map, and it is a lens calculation
 * rather than a taste: from 1.45 radii up the camera sits 2.47 radii from the
 * centre, the globe subtends 47.8 degrees, and the chase camera looks at it 2
 * degrees off its centre — 25.9 of the 27.5 the 55 degree lens has. Lower and
 * the planet does not fit; much higher and it is a marble in an empty frame.
 */
export const PLANE_FLOOR = 60;
export const PLANE_CEILING = PLANET_RADIUS * 1.45;
/** Clearance kept above the ground: the floats, and 0.6 under them. */
export const PLANE_CLEARANCE = FLOAT_KEEL + 0.6;
/** Altitude a take-off climbs to on its own: above the cliffs, below the haze. */
export const PLANE_CIRCUIT = 320;

/**
 * Cruise at the floor and at the ceiling.
 *
 * Speed rides altitude, and that is the whole travel design. Low, 380 crosses
 * Spain in eight seconds and you can see what you are crossing. High, 3400 at
 * 2.25 radii is 0.094 rad/s: the Pacific in half a minute. Flying low is
 * scenic, climbing is how you cover an ocean, and the loss of precision that
 * comes with the speed is exactly the loss of precision that comes with zooming
 * a map out.
 */
export const PLANE_CRUISE_LOW = 380;
export const PLANE_CRUISE_HIGH = 3400;
export const PLANE_BOOST = 1.6;
/** A wide arc rather than a turn on the spot: a half turn takes 5.7 s. */
export const PLANE_TURN = 0.55;
export const PLANE_ACCELERATION_TIME = 2.6;
/** And the throttle closes faster than it opens, so a landing is aimable. */
export const PLANE_LANDING_TIME = 1.2;

/**
 * Climb is exponential, not linear: holding the key multiplies the target
 * altitude. 1.15 per second takes the circuit height to the ceiling in 5.1 s,
 * and the same gesture reads as a zoom out of the map, which is what it is.
 */
export const CLIMB_RATE = 1.15;
/** How fast the plane actually reaches the altitude it is asked for. */
export const ALTITUDE_RATE = 1.1;

/**
 * Where the pilot's hip goes, in the plane's own frame — the seat surface, in
 * the crowd kit's convention, and the number `player.ts` puts the body on.
 *
 * **1.90 is the footwell, not a taste.** The player's own seated figure is 1.85
 * from hip to sole, measured off the built mesh in the `sit` pose; 1.90 leaves
 * the boot 0.05 clear of the cockpit floor at `y = 0`. The crowd's published
 * `SEATED.sole` is 1.75 and would have buried it.
 *
 * Everything else in the cockpit falls out of this one number:
 *
 * ```
 *   cockpit floor      0.00     the plane's own datum
 *   seat surface       1.90     hip
 *   coaming            2.95     seat + 1.05, between the seated waist (+0.78)
 *                               and chest (+1.44): head and shoulders proud
 *   shoulder joint     3.32     seat + FIGURE.shoulderJointY - FIGURE.hipY
 *   eyes               4.78     and the windscreen's top edge is 4.79
 *   crown              5.71     seat + 3.81 measured; the fin clears it at 5.90
 * ```
 */
/**
 * The launch's wheel, in the boat's own frame.
 *
 * **Published for the same reason `PLANE_SEAT` is**: `avatar.ts` has to put two
 * hands on this rim, and until this existed it restated the hub, the radii, the
 * thickness and the rake out of the comments in this file. Four numbers copied
 * across a boundary that nothing checks — move the wheel and the hands stay
 * where it used to be, with no error and no assertion, and from the one camera
 * the player actually uses the helmsman's own back hides the gap.
 *
 * The rake is the column's: 25 degrees off horizontal, so the face turns towards
 * the helmsman instead of lying flat like a bus.
 */
export const BOAT_HELM = {
  hub: [0, 3.72, 1.15] as const,
  /** The rim is an annulus and a hand wraps the middle of it. */
  inner: 0.42,
  outer: 0.62,
  thickness: 0.14,
  rake: -1.14,
} as const;

export const PLANE_SEAT = { y: 1.9, z: 0 } as const;

/**
 * Clear width across the cockpit.
 *
 * **4.30 is the crowd's seated envelope over 400 bodies, and it is the number
 * to build to** — not the 2.60 across the shoulders, which is what a cab sized
 * off the wrong measurement gets, and not the player's own 3.30, which would
 * fit him and nobody else. It costs a fuselage 5.10 wide against a 24.0 span:
 * fatter in proportion than a real light floatplane, and exactly as much fatter
 * as this model is shorter than one.
 */
const CABIN = 4.3;
/** Fuselage skin either side of the cabin. */
const SKIN = 0.4;
const FUSELAGE_HALF = CABIN / 2 + SKIN;
/** The cockpit opening, fore and aft of the seat. */
const COAMING = 2.95;
const COCKPIT_AFT = -1.55;
const COCKPIT_FWD = 2.6;

/** The fuselage's plan and profile, aft to forward. */
const BODY = [
  { z: -7.0, half: 0.45, belly: -0.1, deck: 0.9 },
  { z: -4.0, half: 1.3, belly: -0.65, deck: 1.9 },
  { z: COCKPIT_AFT, half: FUSELAGE_HALF, belly: -1.05, deck: COAMING },
  { z: COCKPIT_FWD, half: FUSELAGE_HALF, belly: -1.05, deck: COAMING },
  { z: 4.6, half: 2.25, belly: -0.8, deck: 2.6 },
  { z: 6.2, half: 1.55, belly: -0.2, deck: 1.9 },
] as const;

/**
 * A floatplane, facing +Z, with the **cockpit floor** at `y = 0` and the pilot's
 * hip on `PLANE_SEAT`.
 *
 * Floats rather than wheels, and not for decoration: the plane has to be able
 * to come down over water without leaving the player standing on the sea, and a
 * plane that lands on floats hands them straight to the boat. The wing is low
 * so it does not sit between the camera and the pilot — from the map altitude
 * you are looking straight down at him, and a high wing would hide the one part
 * of this model that has a face on it.
 *
 * **The cockpit is a well now, not an offset.** The fuselage used to be a
 * capsule 4.40 across and there was no height at which a 6.80 body could sit in
 * it: at the seat's own height his head was inside the hull, at standing height
 * he rode on its back, and the model was dropped 0.9 in as a compromise between
 * the two. It is a floor at 0, sides 4.30 apart, a seat at 1.90 and a coaming at
 * 2.95, and the pilot sits in it at his own height.
 */
export function buildPlane(): { group: THREE.Group; propeller: THREE.Object3D } {
  const group = new THREE.Group();

  // Lower body: keel to just under the cockpit floor, the whole length.
  group.add(
    shell(
      BODY.map((s) => ({ z: s.z, half: s.half, bottom: s.belly, top: -0.14 })),
      P.red,
    ),
  );
  // The cockpit floor, inset the way the launch's sole is.
  group.add(
    shell(
      [
        { z: COCKPIT_AFT, half: CABIN / 2, bottom: -0.14, top: 0 },
        { z: COCKPIT_FWD, half: CABIN / 2, bottom: -0.14, top: 0 },
      ],
      P.bark,
    ),
  );
  // Turtledeck aft of the cockpit, and the cowl forward of it.
  group.add(
    shell(
      BODY.slice(0, 3).map((s) => ({ z: s.z, half: s.half, bottom: -0.2, top: s.deck })),
      P.red,
    ),
  );
  group.add(
    shell(
      BODY.slice(3).map((s) => ({ z: s.z, half: s.half, bottom: -0.2, top: s.deck })),
      P.red,
    ),
  );
  // The cockpit sides: what makes it a well rather than a hole in a capsule.
  for (const side of [-1, 1]) {
    group.add(
      shell(
        [COCKPIT_AFT, COCKPIT_FWD].map((z) => ({
          z,
          x: side * (CABIN / 2 + SKIN / 2),
          half: SKIN / 2,
          bottom: -0.2,
          top: COAMING,
        })),
        P.red,
      ),
    );
  }

  // ---- the cockpit --------------------------------------------------------

  const pan = ctx.box(2.6, 0.3, 1.5, P.bark);
  pan.position.set(0, PLANE_SEAT.y - 0.3, PLANE_SEAT.z - 0.1);
  group.add(pan);
  // 1.45 behind the hip, not the crowd's 0.72: the player wears a rucksack and
  // it reaches 1.21 back. A seat back at the published figure goes through it.
  const backrest = ctx.box(2.6, 1.5, 0.28, P.bark);
  backrest.position.set(0, PLANE_SEAT.y, PLANE_SEAT.z - 1.45);
  group.add(backrest);

  // The instrument panel stands forward of the toes, which reach 2.38 ahead of
  // the hip. Anything nearer is a shin through a dashboard.
  const panel = ctx.box(CABIN - 0.1, COAMING - 1.55, 0.3, P.tan);
  panel.position.set(0, 1.55, 2.6);
  group.add(panel);

  // A yoke rather than a stick, and it is the pose that decides it: `sit` puts
  // the hands at x ±1.34, y hip + 0.3, z hip + 1.9, which is two hands a metre
  // apart and not one on a centreline. The old cockpit had them closed on
  // nothing at all — the file's own comment called it *a stick that is out of
  // sight below the coaming*.
  group.add(ctx.strut(new V(0, 2.15, 1.95), new V(0, 2.15, 2.55), 0.2, P.ink));
  group.add(ctx.strut(new V(-1.5, 2.15, 1.95), new V(1.5, 2.15, 1.95), 0.16, P.ink));

  // The screen's top edge lands at 4.79 against eyes at 4.78: he looks through
  // it, and his head and shoulders are still out in the air above it.
  const screen = ctx.box(CABIN, 1.95, 0.16, P.skyBlue);
  screen.position.set(0, COAMING, 2.45);
  screen.rotation.x = -0.34;
  group.add(screen);

  // ---- flying surfaces ----------------------------------------------------

  // Wing panels are lofted along their own +Z and yawed onto the span, which is
  // a rotation and not a scale: `T * R * S` puts the scale in the *local* axes,
  // and that is what buried Charles Bridge's piers inside their own wall.
  for (const side of [-1, 1]) {
    const wing = shell(
      [
        { z: 0, half: 2.2, bottom: -0.325, top: 0.325 },
        { z: 6, half: 1.9, bottom: -0.26, top: 0.26 },
        { z: 12, half: 1.25, bottom: -0.16, top: 0.16 },
      ],
      P.cream,
    );
    wing.rotation.y = (side * Math.PI) / 2;
    wing.position.set(0, -0.625, 0.7);
    group.add(wing);

    const tail = shell(
      [
        { z: 0, half: 1.3, bottom: -0.16, top: 0.16 },
        { z: 4.5, half: 0.85, bottom: -0.11, top: 0.11 },
      ],
      P.cream,
    );
    tail.rotation.y = (side * Math.PI) / 2;
    tail.position.set(0, 1.43, -5.9);
    group.add(tail);
  }

  // The fin in two courses rather than one, so the taper draws an ink line
  // across it. It tops out at 5.90, over the pilot's crown at 5.71.
  const fin = ctx.box(0.34, 3.9, 2.6, P.red);
  fin.position.set(0, 1.2, -5.9);
  group.add(fin);
  const finTip = ctx.box(0.34, 0.8, 1.7, P.red);
  finTip.position.set(0, 5.1, -6.25);
  group.add(finTip);

  // ---- floats -------------------------------------------------------------

  for (const side of [-1, 1]) {
    const x = side * 4.6;
    group.add(
      shell(
        [
          { z: -3.4, x, half: 0.55, bottom: -3.3, top: -2.05 },
          { z: -1.5, x, half: 0.75, bottom: -FLOAT_KEEL, top: -2.05 },
          { z: 2.6, x, half: 0.75, bottom: -FLOAT_KEEL, top: -2.05 },
          { z: 4.4, x, half: 0.62, bottom: -3.1, top: -2.0 },
          { z: 5.6, x, half: 0.22, bottom: -2.55, top: -1.95 },
        ],
        P.bone,
      ),
    );
    // The struts run up to the wing's underside, which is where a low-wing
    // floatplane actually carries them.
    for (const z of [-0.9, 2.2]) {
      const strut = ctx.box(0.28, 1.1, 0.55, P.bone);
      strut.position.set(x, -2.05, z);
      group.add(strut);
      group.add(ctx.strut(new V(x, -2.05, z), new V(side * 1.6, -1.0, z * 0.4), 0.16, P.bone));
    }
  }

  // ---- the propeller ------------------------------------------------------

  // Its own object so the throttle can spin it: at these speeds it is the only
  // moving part, and without it the plane reads as parked. The blade is 6.6
  // across so its tip stops at -2.00, just clear of the float decks at -2.05.
  const propeller = new THREE.Group();
  propeller.position.set(0, 1.3, 6.55);
  const blade = ctx.box(0.42, 6.6, 0.2, P.ink);
  blade.position.y = -3.3;
  propeller.add(blade);
  const spinner = ctx.taper(0.55, 0.1, 0.9, P.gold, 8);
  spinner.rotation.x = Math.PI / 2;
  propeller.add(spinner);
  group.add(propeller);

  group.name = 'plane';
  castShadows(group);
  return { group, propeller };
}

/**
 * Published so `player.ts` can put the avatar's hip on the seat without either
 * file restating the other's numbers. `FIGURE.hipY` is where the body's own
 * origin puts the hip; the pose then shifts the whole body, and the seat has to
 * cancel that shift rather than guess it.
 */
export const AVATAR_HIP = FIGURE.hipY;

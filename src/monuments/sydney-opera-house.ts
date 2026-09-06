import type { Monument } from './contract.ts';

/**
 * Sydney Opera House.
 *
 * Three things carry it: a **broad low podium**, a **cascade of shells of
 * stepping height all leaning the same way**, and a **second, smaller cascade
 * beside it**. It is the repetition and the stagger that read, never any one
 * shell — a single sail on its own is a tent, and sails without the podium are
 * litter on a lawn.
 *
 * **The reduction.** The toolkit has no curved surface, so a shell is a chain of
 * eight tapers, each leaning a little further than the one below and each
 * narrower, hung off the top of its predecessor. Two things fall out of that
 * chain at once, and they are exactly the two edges the real shell has: the
 * lean pushes the centre forward at about the rate the taper pulls the width
 * in, so the trailing edge comes out near-vertical, while the leading edge —
 * where the two effects add instead of cancelling — sweeps a long convex curve
 * down to a low point. That is the sail in profile, and it costs eight boxes.
 *
 * Two approaches were tried and dropped before this one. A **fan of flat
 * plates** hinged at the base gives the radiating ribs, but the gaps between
 * them read at thumbnail size as a roof that has lost its tiles, and the Opera
 * House's whole force is solid white against the sky. **Nested arches** would
 * be the honest vault, but the only helper that makes a hole is `ringWall`, and
 * a ring is closed: half of it always ends up below y = 0.
 *
 * What was traded away, and why:
 *
 * - **The vaults are solid.** A real shell is open at its north end, over a
 *   pointed glass wall. Solid wedges leave nowhere to put the glass, so the
 *   glass is gone. It is invisible from anywhere the model is read from, and
 *   the alternative — prising the shells apart to show it — would cost the
 *   overlap, which is the thing that reads.
 * - **No tile pattern, no ribs.** At this size they are noise. The joints
 *   between the chain's blocks already lay a band across each shell, which is
 *   as much surface as the ink can carry.
 * - **The podium is a rectangle in plan**, stepped in three courses rather than
 *   drawn out into Bennelong Point's taper, and it has no monumental stair. The
 *   stepped courses stand in for both.
 *
 * **Which way is the front.** The building has no façade; it was set on a
 * headland to be read from the water, side-on, and that is the view every
 * photograph of it takes. So +Z is the harbour: the long axis runs along X, the
 * shells show their profiles, and the smaller Opera Theatre cascade sits nearer
 * the camera with the taller Concert Hall rising behind it — the overlap that
 * makes the postcard.
 */

/**
 * The shell chain. `SWEEP` is the total lean from vertical at the apex; the
 * blocks share it out evenly, so the first stands square on the podium and each
 * one after tips a further `SWEEP / (SEGMENTS - 1)`.
 */
const SEGMENTS = 8;
const SWEEP = (58 * Math.PI) / 180;

/** Width falls as `(1 - t)^WIDTH_EXP`. Above 1 the apex sharpens to a spike; below it blunts. */
const WIDTH_EXP = 1.2;

/**
 * Base half-length as a fraction of how far forward the chain's spine travels.
 * At 1 the trailing edge comes out exactly plumb; a little under, and the whole
 * sail leans with the lean, which is what the building does.
 */
const BASE_RATIO = 0.86;

/**
 * How far each block reaches back past its joint. The kink at a joint opens a
 * notch on the outside of the bend, and this closes it: `tan(kink)` of the
 * local half-width is the width of the notch.
 */
const LAP = 0.16;

/** Centre-to-centre spacing along a cascade, as a fraction of the two half-lengths. Under 1, so they overlap. */
const GAP = 0.7;

const TILT = Array.from({ length: SEGMENTS }, (_, i) => (SWEEP * i) / (SEGMENTS - 1));
/** Rise and forward reach of a chain of unit-length blocks — the two sums that scale a shell. */
const RISE = TILT.reduce((sum, angle) => sum + Math.cos(angle), 0);
const REACH = TILT.reduce((sum, angle) => sum + Math.sin(angle), 0);

/** Podium courses: bottom plinth, a recessed course the deck overhangs, and the deck itself. */
const PLINTH = { length: 78, width: 44, height: 3.4 };
const RECESS = { length: 70, width: 36, height: 2.6 };
const DECK = { length: 72, width: 40, height: 3.4 };
const DECK_TOP = PLINTH.height + RECESS.height + DECK.height;

interface Shell {
  /** Apex above the deck. */
  height: number;
  /** Half the hall it spans, across the cascade. A shell is longer than it is wide. */
  halfWidth: number;
}

/** Concert Hall: the tall cascade, set back from the water. */
const CONCERT: Shell[] = [
  { height: 30, halfWidth: 10.5 },
  { height: 23, halfWidth: 9.5 },
  { height: 17.5, halfWidth: 8.5 },
  { height: 11.5, halfWidth: 7 },
];

/** Opera Theatre: shorter, nearer the water, and shifted along so the crests interleave. */
const THEATRE: Shell[] = [
  { height: 20, halfWidth: 8 },
  { height: 15, halfWidth: 7 },
  { height: 10, halfWidth: 6 },
];

/** Where each cascade's tallest shell stands. Chosen so the two together straddle the deck. */
const CONCERT_AT = { x: -14.9, z: -9 };
const THEATRE_AT = { x: -4.9, z: 10.5 };

/** Half the base length of a shell of this height, which also sets the spacing to the next one. */
const halfLength = (height: number): number => (height / RISE) * REACH * BASE_RATIO;

export const sydneyOperaHouse: Monument = {
  id: 'sydney-opera-house',
  name: 'Sydney Opera House',
  iso: 'AUS',
  lat: -33.857,
  lon: 151.215,
  // No `realHeight`: the source list carries none for this one.
  tier: 'building',
  footprint: 45,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;
    const group = new THREE.Group();

    // --- the podium ---
    // Sandstone, a course of shadow where the deck oversails, then the deck. The
    // dark band is what stops a white building on a pale platform reading as one
    // mass from far off.
    group.add(box(PLINTH.length, PLINTH.height, PLINTH.width, palette.tan));

    const recess = box(RECESS.length, RECESS.height, RECESS.width, palette.steel);
    recess.position.y = PLINTH.height;
    group.add(recess);

    const deck = box(DECK.length, DECK.height, DECK.width, palette.bone);
    deck.position.y = PLINTH.height + RECESS.height;
    group.add(deck);

    // --- one shell ---
    // No return annotation and no `THREE.Group` on `node`: the namespace is not
    // imported here, only the instance on `ctx`, so both are inferred.
    const shell = ({ height, halfWidth }: Shell) => {
      const sail = new THREE.Group();
      const segment = height / RISE;
      const half = halfLength(height);
      // The vault spans its hall, which is narrower than the shell is long. One
      // scale on the whole chain is exact rather than approximate, because every
      // joint below turns about Z and so leaves the Z axis alone.
      sail.scale.z = halfWidth / half;

      let node = sail;
      for (let i = 0; i < SEGMENTS; i++) {
        const joint = new THREE.Group();
        joint.rotation.z = TILT[i]! - (i === 0 ? 0 : TILT[i - 1]!);
        node.add(joint);

        const bottom = half * Math.pow(1 - i / SEGMENTS, WIDTH_EXP);
        const top = half * Math.pow(1 - (i + 1) / SEGMENTS, WIDTH_EXP);
        const lap = i === 0 ? 0 : bottom * LAP;
        // Widened by the same amount it was dropped, so the block still measures
        // `bottom` where the joint actually is.
        const foot = bottom + ((bottom - top) * lap) / segment;
        // Eight sides: an octagon's half-width across the flats is the same in X
        // and in Z, so the profile above stays true, and its bevels give the cel
        // ramp something to step across on a white surface that would otherwise
        // come out as one flat band.
        const block = taper(foot, top, segment + lap, palette.white, 8);
        block.position.y = -lap;
        joint.add(block);

        const next = new THREE.Group();
        next.position.y = segment;
        joint.add(next);
        node = next;
      }
      return sail;
    };

    // --- the two cascades ---
    const cascade = (shells: Shell[], at: { x: number; z: number }) => {
      let x = at.x;
      let previous = 0;
      for (const spec of shells) {
        const half = halfLength(spec.height);
        if (previous > 0) x += (previous + half) * GAP;
        const sail = shell(spec);
        sail.position.set(x, DECK_TOP, at.z);
        group.add(sail);
        previous = half;
      }
    };
    cascade(CONCERT, CONCERT_AT);
    cascade(THEATRE, THEATRE_AT);

    return group;
  },
};

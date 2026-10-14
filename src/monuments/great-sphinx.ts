import type { Group, Mesh, Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * The Great Sphinx of Giza.
 *
 * A creature built from the silhouette outwards, since every helper makes regular
 * solids: the body is nine transverse slices along Z, each a stack of blocks of
 * its own half-width and height. The `halfWidth` curve (swelling at the haunch,
 * pinching at the shoulder) and the `top` curve (rising over the haunch, dipping
 * behind the withers, climbing to the shoulders, falling at the rump) are the
 * lion. Adjacent slices overlap and step, so the ink draws a line every 5 units
 * down the flank, like the eroded, patched courses of the real thing.
 *
 * What must survive at thumbnail size:
 * 1. Long, low, with the forelegs far out in front: legs are 30.6 of the 71 units
 *    and run 22.6 clear of a chest ending at z = 14.5; the back never rises above
 *    13.1 of 27.1.
 * 2. A small head held high: the face is 5.6 wide against a body 18 wide, five
 *    units of neck above the shoulders (sitting on the withers made a bump).
 * 3. The nemes in `cream` against the body's `sand`, 12.4 wide against the face's
 *    5.6: a pale trapezoid is the identification.
 * 4. The missing nose (below).
 *
 * Tier `building`: the Sphinx is read from across the site and cannot pass 27
 * units tall without becoming another animal; it also stays below the Pyramids
 * (33.6). The vertical is exaggerated 1.4x (71 long by 27.1 tall, 2.6:1 against
 * 3.65:1), spent on the neck and head; the body keeps its true lowness (71 long
 * against a 12.4 back). Nothing is cropped.
 *
 * The quarry: a cut floor under the whole site, and a U of walls open to the front
 * (the valley temple side; a front wall would cut the forelegs out). Floor and
 * walls are `tan`, the Pyramids' plateau colour, so the `sand` creature reads as
 * limestone left standing. The walls step down from 6 at the back to 3 at the
 * front so the near wall never covers the flank. The Sphinx Temple is left out.
 *
 * The depth cascade, inverted (after `moai-rapa-nui.ts`): each feature stands proud
 * of the one below, except the nose scar, which sinks behind all of them.
 *
 *     brow 4.20 | nose root 4.05 | lip 4.00 | lower lip 3.85 | ears 3.85
 *     chin 3.70 | cheeks 3.60 (flank the break) | nose scar 3.30 (`tan`)
 *     eyes 3.20 (a unit behind the brow) | face 3.00
 *
 * Palette is the Pyramids': `tan` bedrock, `sand` limestone, `clay` granite for
 * the Dream Stele, plus `cream` for the nemes and `ink` for the eye sockets.
 */

// ---------------------------------------------------------------------------
// The body: a plan curve and a profile curve, sampled nine times
// ---------------------------------------------------------------------------

interface Slice {
  /** Centre of the slice along the length. +Z is the way the Sphinx looks. */
  z: number;
  /** Half-width of the body here. Swells at the haunch, pinches at the shoulder. */
  halfWidth: number;
  /** The back line. Never above 12.4, or the creature stops being low. */
  top: number;
}

/**
 * Rear to front. The third column is the profile: the rump falling to 7.8, up over
 * the haunch to 11.2, dipping to 10.7 behind the withers, then climbing to 12.4 at
 * the shoulders where the neck comes out.
 */
const BODY: Slice[] = [
  { z: -31.4, halfWidth: 6.6, top: 7.8 },
  { z: -26.4, halfWidth: 8.4, top: 10.2 },
  { z: -21.4, halfWidth: 9.0, top: 11.2 },
  { z: -16.4, halfWidth: 8.8, top: 11.0 },
  { z: -11.4, halfWidth: 8.4, top: 10.7 },
  { z: -6.4, halfWidth: 8.0, top: 10.8 },
  { z: -1.4, halfWidth: 7.6, top: 11.2 },
  { z: 3.6, halfWidth: 7.4, top: 11.8 },
  { z: 8.6, halfWidth: 7.2, top: 12.4 },
];

/**
 * Slices are 5.8 deep on a 5.0 pitch, and their depth never varies (tapering the
 * depth with the width terraced the spine into a staircase). The flank gets an ink
 * line wherever two neighbours differ in width.
 */
const SLICE_DEPTH = 5.8;

/**
 * Three courses to a slice: a `tan` plinth a little proud of the rest, the flank at
 * full width, and a top course inset 14% that rounds the back off.
 */
const PLINTH_HEIGHT = 2.2;
const PLINTH_OVERHANG = 0.35;
const BACK_COURSE_HEIGHT = 3.2;
const BACK_COURSE_INSET = 0.86;

/** Thigh mass on the flank, standing 0.9 proud of the widest slice so it gets an outline. */
const HAUNCH_X = 7.3;
const HAUNCH_HALF_WIDTH = 2.6;
const HAUNCH_HEIGHT = 8.4;
const HAUNCH_Z = -20.0;
const HAUNCH_DEPTH = 12.0;

/** Hind paws tucked at the rear, the fold that says the legs are gathered under it. */
const HIND_PAW_X = 7.2;
const HIND_PAW_WIDTH = 5.2;
const HIND_PAW_HEIGHT = 3.8;
const HIND_PAW_Z = -28.0;
const HIND_PAW_DEPTH = 5.0;

/**
 * The tail, curling up the creature's right haunch, which is -X (facing +Z with +Y
 * up), the far flank from the quarter view.
 */
const TAIL_THICKNESS = 1.3;

// ---------------------------------------------------------------------------
// Chest and forelegs: the front two fifths
// ---------------------------------------------------------------------------

/** The breast, dropping between the forelegs. Narrower and lower than the shoulders behind it. */
const CHEST_HALF_WIDTH = 5.8;
const CHEST_HEIGHT = 10.0;
const CHEST_Z = 11.25;
const CHEST_DEPTH = 6.5;

/** The throat under the chin, between the two nemes lappets. Where the lost beard hung. */
const THROAT_WIDTH = 5.0;
const THROAT_HEIGHT = 5.4;
const THROAT_DEPTH = 3.0;
const THROAT_Y = 10.0;
const THROAT_Z = 12.8;

const LEG_X = 5.3;

/**
 * Four courses per leg, each shorter than the last, so the leg tapers to the paw in
 * steps and every join is a horizontal ink line (like the restoration blockwork).
 * `{ from, to }` are along Z; the paw is the last entry.
 */
interface LegSegment {
  from: number;
  to: number;
  halfWidth: number;
  height: number;
}

const LEG: LegSegment[] = [
  { from: 6.5, to: 17.0, halfWidth: 2.5, height: 5.6 },
  { from: 17.0, to: 26.0, halfWidth: 2.5, height: 4.9 },
  { from: 26.0, to: 32.5, halfWidth: 2.6, height: 4.4 },
  { from: 32.2, to: 36.2, halfWidth: 2.9, height: 4.2 },
];

/** Three toes on each paw, standing 0.8 proud of it. The front-most points of the model. */
const TOE_COUNT = 3;
const TOE_PITCH = 1.7;
const TOE_WIDTH = 1.35;
const TOE_HEIGHT = 2.6;
const TOE_DEPTH = 2.6;
const TOE_Z = 35.8;

/**
 * The Dream Stele, against the breast at the back of the slot between the paws. Red
 * Aswan granite, so `clay`: one warm accent at the centre of the front.
 */
const STELE_WIDTH = 3.8;
const STELE_HEIGHT = 8.0;
const STELE_DEPTH = 1.3;
const STELE_Z = 19.0;

// ---------------------------------------------------------------------------
// Neck and head
// ---------------------------------------------------------------------------

const NECK_WIDTH = 8.0;
const NECK_HEIGHT = 5.0;
const NECK_DEPTH = 6.8;
const NECK_Y = 11.0;
const NECK_Z = 8.5;

/**
 * Where the head sits. Y is the jaw line and every feature is written against it. Z
 * is 3 units forward of the neck, so the head overhangs the throat.
 */
const HEAD_Y = 16.0;
const HEAD_Z = 12.0;

const FACE_WIDTH = 5.6;
const FACE_HEIGHT = 7.0;
const FACE_DEPTH = 6.0;
/** Wider at the temples than at the jaw: a face narrows downward. */
const FACE_FLARE = 1.07;

// The cascade. Every `_Z` here is the block's centre; the front of each is
// `_Z + depth / 2`, and those fronts are the ladder in the header comment.
const BROW_WIDTH = 5.2;
const BROW_HEIGHT = 1.1;
const BROW_DEPTH = 2.6;
const BROW_Y = 5.5;
const BROW_Z = 2.9;

const EYE_X = 1.6;
const EYE_WIDTH = 1.6;
const EYE_HEIGHT = 1.15;
const EYE_DEPTH = 1.3;
const EYE_Y = 4.4;
const EYE_Z = 2.55;

/** The bridge, still there under the brow. It has to exist for the break to be a break. */
const NOSE_ROOT_WIDTH = 1.4;
const NOSE_ROOT_HEIGHT = 1.3;
const NOSE_ROOT_DEPTH = 1.6;
const NOSE_ROOT_Y = 4.35;
const NOSE_ROOT_Z = 3.25;

/** The break itself: set back from the brow, the lip and the cheeks, and in a duller stone. */
const SCAR_WIDTH = 2.2;
const SCAR_HEIGHT = 2.5;
const SCAR_DEPTH = 1.1;
const SCAR_Y = 2.2;
const SCAR_Z = 2.75;

/** Walls either side of the break. Without them the scar is a slot, not a scar. */
const CHEEK_X = 1.9;
const CHEEK_WIDTH = 1.6;
const CHEEK_HEIGHT = 2.9;
const CHEEK_DEPTH = 2.2;
const CHEEK_Y = 2.0;
const CHEEK_Z = 2.5;

/** Two lips, the lower set back 0.15 from the upper. That step is the mouth line. */
const LIP_WIDTH = 3.2;
const LIP_HEIGHT = 1.1;
const LIP_DEPTH = 2.5;
const LIP_Y = 1.25;
const LIP_Z = 2.75;

const LOWER_LIP_WIDTH = 3.0;
const LOWER_LIP_HEIGHT = 1.0;
const LOWER_LIP_DEPTH = 2.3;
const LOWER_LIP_Y = 0.35;
const LOWER_LIP_Z = 2.7;

const CHIN_WIDTH = 3.6;
const CHIN_HEIGHT = 1.3;
const CHIN_DEPTH = 2.2;
const CHIN_Y = -0.7;
const CHIN_Z = 2.6;

/** Ears pushed forward so they clear the lappets, which is where they really sit. */
const EAR_X = 3.2;
const EAR_WIDTH = 1.1;
const EAR_HEIGHT = 3.0;
const EAR_DEPTH = 2.9;
const EAR_Y = 2.9;
const EAR_Z = 2.4;

/**
 * The nemes: three pieces a side plus the crown. Crown 9.6, upper lappet out to 5.3,
 * lower lappet out to 6.28 (a trapezoid widening downward); the face inside is 5.6.
 */
const CROWN_WIDTH = 9.6;
const CROWN_HEIGHT = 3.4;
const CROWN_DEPTH = 8.0;
const CROWN_FLARE = 0.9;
/** Pushed back so the crown's rear reaches the queue; it still overhangs the face in front. */
const CROWN_Z = -0.5;

const UPPER_LAPPET_X = 4.0;
const UPPER_LAPPET_WIDTH = 2.6;
const UPPER_LAPPET_HEIGHT = 4.6;
const UPPER_LAPPET_DEPTH = 5.2;
const UPPER_LAPPET_Y = 2.4;
const UPPER_LAPPET_Z = 1.0;

/**
 * Wider and shallower than the upper, so the pair steps outward on the way down. Set
 * `PROUD` further out than 4.6: there its outer face lay 0.008 off the body's front
 * slice flank, in one plane.
 */
const LOWER_LAPPET_X = 4.6 + PROUD;
const LOWER_LAPPET_WIDTH = 3.2;
const LOWER_LAPPET_HEIGHT = 8.6;
const LOWER_LAPPET_DEPTH = 4.2;
const LOWER_LAPPET_Y = -6.2;
const LOWER_LAPPET_Z = 1.2;

/** The queue: the cloth gathered into a tail down the back of the neck. */
const QUEUE_WIDTH = 3.4;
const QUEUE_HEIGHT = 7.6;
const QUEUE_DEPTH = 3.0;
const QUEUE_FLARE = 1.22;
const QUEUE_Y = -0.6;
const QUEUE_Z = -5.0;

/** The uraeus, broken off above its base — so a stub, in body stone against the cream. */
const URAEUS_WIDTH = 0.9;
const URAEUS_HEIGHT = 1.3;
const URAEUS_DEPTH = 1.0;
const URAEUS_Y = 6.2;
const URAEUS_Z = 3.5;

// ---------------------------------------------------------------------------
// The enclosure
// ---------------------------------------------------------------------------

/**
 * The quarry floor. Everything else stands on it, which turns a wall behind a statue
 * into a creature in a pit.
 */
const FLOOR_HEIGHT = 0.7;
const FLOOR_HALF_WIDTH = 13.5;
const FLOOR_FROM = -36.5;
const FLOOR_TO = 37.2;

/** Inner and outer faces of the side walls. The floor between wall and flank is 3.6 wide. */
const WALL_INNER = 12.0;
const WALL_OUTER = 14.0;

/**
 * Three sections a side, stepping up toward the back (the quarry is shallow where it
 * opens east): at the front the wall is 4.6 against a 13-unit back.
 */
interface WallSection {
  from: number;
  to: number;
  height: number;
}

const WALLS: WallSection[] = [
  { from: -8.0, to: 5.0, height: 3.0 },
  { from: -19.0, to: -8.0, height: 4.4 },
  { from: -34.4, to: -19.0, height: 6.0 },
];

/** A cut step along the foot of each wall. Two meshes for two more ink lines. */
const BENCH_X = 10.9;
const BENCH_WIDTH = 2.2;
const BENCH_HEIGHT = 1.8;
const BENCH_Z = -15.0;
const BENCH_DEPTH = 30.0;

/** The west face, in two courses so it reads as quarried rather than built. */
const BACK_WALL_HALF_WIDTH = 14.0;
const BACK_WALL_FROM = -37.0;
const BACK_WALL_TO = -34.4;
const BACK_WALL_LOWER = 4.2;
const BACK_WALL_UPPER = 2.4;
/** The upper course is set back off the face below it, which is what makes the ledge. */
const BACK_WALL_SETBACK = 0.8;

export const greatSphinx: Monument = {
  id: 'great-sphinx',
  name: 'Great Sphinx',
  iso: 'EGY',
  lat: 29.975,
  lon: 31.138,
  // No `realHeight`: the source list gives none. The usual 20 m is measured from
  // the quarry floor, and the quoted figure for the Sphinx is its 73 m length.
  tier: 'building',
  footprint: 40,

  build(ctx) {
    const { THREE, palette, box, taper, strut } = ctx;
    const limestone = palette.sand;
    const bedrock = palette.tan;
    const cloth = palette.cream;
    const granite = palette.clay;
    const socket = palette.ink;

    const group = new THREE.Group();

    const floor = box(
      FLOOR_HALF_WIDTH * 2,
      FLOOR_HEIGHT,
      FLOOR_TO - FLOOR_FROM,
      bedrock,
    );
    floor.position.z = (FLOOR_FROM + FLOOR_TO) / 2;
    group.add(floor);

    /**
     * Everything above the floor. Only the monument's own `Group` transform is
     * reserved, so the site rides on a child and every Y stays measured from the
     * quarry floor.
     */
    const site: Group = new THREE.Group();
    site.position.y = FLOOR_HEIGHT;
    group.add(site);

    /**
     * A hewn block whose top is `flare` times its base (the moai's helper):
     * `taper` makes square prisms, so the depth arrives afterwards as `scale.z`.
     * The flare pulls the depth in with the width, wanted on the neck, haunch and
     * crown but not on the body's slices.
     */
    const slab = (
      width: number,
      height: number,
      depth: number,
      color: number,
      flare = 1,
    ): Mesh => {
      const mesh = taper(width / 2, (width * flare) / 2, height, color, 4);
      mesh.scale.z = depth / width;
      return mesh;
    };

    /** A block placed by its span along Z rather than by its centre. */
    const spanZ = (
      width: number,
      height: number,
      from: number,
      to: number,
      color: number,
    ): Mesh => {
      const mesh = box(width, height, to - from, color);
      mesh.position.z = (from + to) / 2;
      return mesh;
    };

    // --- the enclosure, first, so the creature is read as standing in it ---
    for (const side of [-1, 1]) {
      for (const section of WALLS) {
        const wall = spanZ(
          WALL_OUTER - WALL_INNER,
          section.height,
          section.from,
          section.to,
          bedrock,
        );
        wall.position.x = (side * (WALL_INNER + WALL_OUTER)) / 2;
        site.add(wall);
      }

      const bench = box(BENCH_WIDTH, BENCH_HEIGHT, BENCH_DEPTH, bedrock);
      bench.position.set(side * BENCH_X, 0, BENCH_Z);
      site.add(bench);
    }

    const backLower = spanZ(
      BACK_WALL_HALF_WIDTH * 2,
      BACK_WALL_LOWER,
      BACK_WALL_FROM,
      BACK_WALL_TO,
      bedrock,
    );
    site.add(backLower);

    const backUpper = spanZ(
      BACK_WALL_HALF_WIDTH * 2 - 1.2,
      BACK_WALL_UPPER,
      BACK_WALL_FROM,
      BACK_WALL_TO - BACK_WALL_SETBACK,
      bedrock,
    );
    backUpper.position.y = BACK_WALL_LOWER;
    site.add(backUpper);

    // --- the body: eight slices of the plan and the profile ---
    for (const slice of BODY) {
      const plinth = box(
        (slice.halfWidth + PLINTH_OVERHANG) * 2,
        PLINTH_HEIGHT,
        SLICE_DEPTH,
        bedrock,
      );
      plinth.position.z = slice.z;
      site.add(plinth);

      const flank = box(
        slice.halfWidth * 2,
        slice.top - PLINTH_HEIGHT - BACK_COURSE_HEIGHT,
        SLICE_DEPTH,
        limestone,
      );
      flank.position.set(0, PLINTH_HEIGHT, slice.z);
      site.add(flank);

      const back = box(
        slice.halfWidth * 2 * BACK_COURSE_INSET,
        BACK_COURSE_HEIGHT,
        SLICE_DEPTH,
        limestone,
      );
      back.position.set(0, slice.top - BACK_COURSE_HEIGHT, slice.z);
      site.add(back);
    }

    for (const side of [-1, 1]) {
      const haunch = slab(
        HAUNCH_HALF_WIDTH * 2,
        HAUNCH_HEIGHT,
        HAUNCH_DEPTH,
        limestone,
        0.72,
      );
      haunch.position.set(side * HAUNCH_X, 0, HAUNCH_Z);
      site.add(haunch);

      const hindPaw = box(HIND_PAW_WIDTH, HIND_PAW_HEIGHT, HIND_PAW_DEPTH, limestone);
      hindPaw.position.set(side * HIND_PAW_X, 0, HIND_PAW_Z);
      site.add(hindPaw);
    }

    // The tail, lying along the right flank and hooking in over the rump.
    const tailKnee = new THREE.Vector3(-9.7, 4.6, -29.5);
    site.add(strut(new THREE.Vector3(-9.0, 8.4, -23.0), tailKnee, TAIL_THICKNESS, limestone));
    site.add(strut(tailKnee, new THREE.Vector3(-5.0, 2.4, -33.4), TAIL_THICKNESS, limestone));

    // --- chest, throat, neck ---
    const chest = box(CHEST_HALF_WIDTH * 2, CHEST_HEIGHT, CHEST_DEPTH, limestone);
    chest.position.z = CHEST_Z;
    site.add(chest);

    const throat = box(THROAT_WIDTH, THROAT_HEIGHT, THROAT_DEPTH, limestone);
    throat.position.set(0, THROAT_Y, THROAT_Z);
    site.add(throat);

    const neck = slab(NECK_WIDTH, NECK_HEIGHT, NECK_DEPTH, limestone, 0.88);
    neck.position.set(0, NECK_Y, NECK_Z);
    site.add(neck);

    // --- the forelegs, and the stele between them ---
    for (const side of [-1, 1]) {
      for (const segment of LEG) {
        const bone = spanZ(
          segment.halfWidth * 2,
          segment.height,
          segment.from,
          segment.to,
          limestone,
        );
        bone.position.x = side * LEG_X;
        site.add(bone);
      }

      for (let toe = 0; toe < TOE_COUNT; toe++) {
        const claw = box(TOE_WIDTH, TOE_HEIGHT, TOE_DEPTH, limestone);
        claw.position.set(side * LEG_X + (toe - (TOE_COUNT - 1) / 2) * TOE_PITCH, 0, TOE_Z);
        site.add(claw);
      }
    }

    const stele = box(STELE_WIDTH, STELE_HEIGHT, STELE_DEPTH, granite);
    stele.position.z = STELE_Z;
    site.add(stele);

    // The stele's rounded lunette, in one taper. It is the only curve on the
    // model and it lands dead centre in the front view.
    const lunette = taper(STELE_WIDTH / 2, STELE_WIDTH / 5, 1.4, granite, 6);
    lunette.scale.z = STELE_DEPTH / STELE_WIDTH;
    lunette.position.set(0, STELE_HEIGHT, STELE_Z);
    site.add(lunette);

    // --- the head. Its own group, so every feature is written against the jaw
    //     line and the depth cascade in the header can be read off the Z's. ---
    const head: Group = new THREE.Group();
    head.position.set(0, HEAD_Y, HEAD_Z);
    site.add(head);

    head.add(slab(FACE_WIDTH, FACE_HEIGHT, FACE_DEPTH, limestone, FACE_FLARE));

    const brow = box(BROW_WIDTH, BROW_HEIGHT, BROW_DEPTH, limestone);
    brow.position.set(0, BROW_Y, BROW_Z);
    head.add(brow);

    for (const side of [-1, 1]) {
      const eye = box(EYE_WIDTH, EYE_HEIGHT, EYE_DEPTH, socket);
      eye.position.set(side * EYE_X, EYE_Y, EYE_Z);
      head.add(eye);

      const cheek = box(CHEEK_WIDTH, CHEEK_HEIGHT, CHEEK_DEPTH, limestone);
      cheek.position.set(side * CHEEK_X, CHEEK_Y, CHEEK_Z);
      head.add(cheek);

      const ear = box(EAR_WIDTH, EAR_HEIGHT, EAR_DEPTH, limestone);
      ear.position.set(side * EAR_X, EAR_Y, EAR_Z);
      head.add(ear);
    }

    const noseRoot = box(NOSE_ROOT_WIDTH, NOSE_ROOT_HEIGHT, NOSE_ROOT_DEPTH, limestone);
    noseRoot.position.set(0, NOSE_ROOT_Y, NOSE_ROOT_Z);
    head.add(noseRoot);

    const scar = box(SCAR_WIDTH, SCAR_HEIGHT, SCAR_DEPTH, bedrock);
    scar.position.set(0, SCAR_Y, SCAR_Z);
    head.add(scar);

    const lip = box(LIP_WIDTH, LIP_HEIGHT, LIP_DEPTH, limestone);
    lip.position.set(0, LIP_Y, LIP_Z);
    head.add(lip);

    const lowerLip = box(LOWER_LIP_WIDTH, LOWER_LIP_HEIGHT, LOWER_LIP_DEPTH, limestone);
    lowerLip.position.set(0, LOWER_LIP_Y, LOWER_LIP_Z);
    head.add(lowerLip);

    const chin = box(CHIN_WIDTH, CHIN_HEIGHT, CHIN_DEPTH, limestone);
    chin.position.set(0, CHIN_Y, CHIN_Z);
    head.add(chin);

    // --- the nemes, which is more of the head's outline than the face is ---
    for (const side of [-1, 1]) {
      const upper = box(UPPER_LAPPET_WIDTH, UPPER_LAPPET_HEIGHT, UPPER_LAPPET_DEPTH, cloth);
      upper.position.set(side * UPPER_LAPPET_X, UPPER_LAPPET_Y, UPPER_LAPPET_Z);
      head.add(upper);

      const lower = box(LOWER_LAPPET_WIDTH, LOWER_LAPPET_HEIGHT, LOWER_LAPPET_DEPTH, cloth);
      lower.position.set(side * LOWER_LAPPET_X, LOWER_LAPPET_Y, LOWER_LAPPET_Z);
      head.add(lower);
    }

    const crown = slab(CROWN_WIDTH, CROWN_HEIGHT, CROWN_DEPTH, cloth, CROWN_FLARE);
    crown.position.set(0, FACE_HEIGHT, CROWN_Z);
    head.add(crown);

    const queue = slab(QUEUE_WIDTH, QUEUE_HEIGHT, QUEUE_DEPTH, cloth, QUEUE_FLARE);
    queue.position.set(0, QUEUE_Y, QUEUE_Z);
    head.add(queue);

    const uraeus = box(URAEUS_WIDTH, URAEUS_HEIGHT, URAEUS_DEPTH, limestone);
    uraeus.position.set(0, URAEUS_Y, URAEUS_Z);
    head.add(uraeus);

    return group;
  },
};

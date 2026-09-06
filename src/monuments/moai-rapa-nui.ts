import type { Group, Mesh, Monument } from './contract.ts';

/**
 * Moai of Rapa Nui.
 *
 * **One moai is a statue; a row of them is Rapa Nui.** The model is an ahu — the
 * stone platform — carrying six figures shoulder to shoulder, all facing the
 * same way, as at Ahu Tongariki. A single giant head would be a bigger model and
 * a worse one: nothing about one moai says *island*, and the thing every
 * photograph of Rapa Nui frames is the line.
 *
 * The proportion that has to survive at any size is **the head at two fifths of
 * the figure**. It is the whole disguise: at a human 1/7 these read as men in
 * blankets, at 2/5 they can only be moai. Everything else on the face is there
 * to hold that up — a heavy straight brow shelf with the eye sockets sunk in its
 * shadow, a long nose that stands out further than the brow does, thin lips set low,
 * a chin that juts out over the chest, and the long ears running from the crown
 * to the jaw. The bodies are legless torsos ending at the hips, arms flat down
 * the flanks, hands turning in to meet over the belly.
 *
 * Two figures wear a `pukao`, the cylinder of red scoria quarried at Puna Pau
 * and set on the crown. It is the only element that is not grey, so it carries
 * more of the thumbnail than its size deserves — which is why two, not one.
 *
 * **Tier: `building`.** Not `monument`, for two reasons. Mechanically, a face
 * costs nine parts and a body five, so six figures are 84 meshes against the
 * `monument` tier's 40 — the tier cannot hold a row at all, and a row is the
 * subject. And by the tier's own question, an ahu is not something you discover
 * by walking into it: it is a line of standing figures on a bare coast, read
 * from a long way off, which is exactly what `building` is for.
 *
 * **No crop and no stretch.** At 57 units wide and 37 tall the row is 1.5x wider
 * than tall, comfortably inside `MAX_ASPECT`, so unlike the Golden Gate or
 * Stonehenge nothing here is distorted to fit: the figures are 29 units on a
 * 3.8-unit platform, which is close to the real 1:8 of a Tongariki moai to its
 * ahu. What was traded is **count**: Tongariki lines up fifteen, and fifteen
 * would be 210 meshes and figures too narrow to carry a face. Six keeps the
 * rhythm of the row and keeps the faces legible.
 *
 * The other departure is the eyes. The restored moai have inlaid white coral
 * with a scoria pupil; here the socket is a dark block set back under the brow,
 * because at this size the coral would be two white dots and the shadow is what
 * the eye actually reads.
 */

// --- the row ---
const COUNT = 6;
/** Centre to centre. Shoulders are 8.2 wide, so the figures nearly touch. */
const PITCH = 8.7;
/** Figures set back from the middle of the ahu, so an apron of platform shows in front. */
const ROW_Z = -0.7;
/** Which figures kept their topknot. Spread apart, so neither reads as an accident. */
const TOPKNOTS = [1, 4];

/** Per-figure variation, as a fraction either side of nominal. */
const HEIGHT_RANGE = 0.075;
const WIDTH_RANGE = 0.06;
/** Lean and yaw, in radians. Small: they were raised by eye, not knocked about. */
const LEAN = 0.02;
const YAW = 0.03;

// --- the ahu ---
const AHU_WIDTH = 56;
const AHU_DEPTH = 12;
const AHU_BASE_HEIGHT = 2.2;
const AHU_TOP_HEIGHT = 1.6;
const AHU_HEIGHT = AHU_BASE_HEIGHT + AHU_TOP_HEIGHT;

// --- the figure, at nominal size: platform top to crown ---
const FIGURE_HEIGHT = 29;
/** The proportion that names a moai. Change nothing else in this file before this. */
const HEAD_FRACTION = 0.4;
const HEAD_HEIGHT = FIGURE_HEIGHT * HEAD_FRACTION;
const TORSO_HEIGHT = FIGURE_HEIGHT - HEAD_HEIGHT;

/** Torso: widths are at the hips, `FLARE` times that at the shoulders. */
const TORSO_WIDTH = 7.4;
const TORSO_DEPTH = 5.05;
const TORSO_FLARE = 1.108;

/** Head: widths are at the jaw, `FLARE` times that at the crown — a moai narrows downward. */
const HEAD_WIDTH = 5.9;
const HEAD_DEPTH = 5.55;
const HEAD_FLARE = 1.08;

/** Upper arms, flat down the flanks: proud of the torso by a third of a unit, no more. */
const ARM_X = 3.6;
const ARM_WIDTH = 1;
const ARM_HEIGHT = 10.6;
const ARM_DEPTH = 2.2;
const ARM_Y = 5.2;
const ARM_Z = 2.15;

/** Forearms and hands, meeting over the belly. Tilted so the pair makes a shallow V. */
const HAND_X = 1.75;
const HAND_WIDTH = 3.6;
const HAND_HEIGHT = 2;
const HAND_DEPTH = 1.1;
const HAND_Y = 3.4;
const HAND_Z = 2.55;
const HAND_TILT = 0.14;

// --- the face. Y is measured from the jaw line, Z from the figure's axis. ---
/** The brow is the furthest-forward thing on the head; the sockets live in its shadow. */
const BROW_WIDTH = 6;
const BROW_HEIGHT = 1.7;
const BROW_DEPTH = 2.8;
const BROW_Y = 7;
const BROW_Z = 2.55;

const EYE_X = 1.65;
const EYE_WIDTH = 1.5;
const EYE_HEIGHT = 1.05;
const EYE_DEPTH = 1.2;
const EYE_Y = 5.8;
/** Clear of the face, but 0.75 behind the brow front — that gap is the deep set. */
const EYE_Z = 2.35;

/** Narrower at the bridge than at the nostrils, so the nose runs back up under the brow. */
const NOSE_WIDTH = 2.3;
const NOSE_HEIGHT = 5.3;
const NOSE_FLARE = 0.6;
const NOSE_Y = 2.5;
const NOSE_Z = 3;

const LIP_WIDTH = 3.2;
const LIP_HEIGHT = 0.6;
const LIP_DEPTH = 1.4;
/** An eighth of the way up the head. Set the mouth any higher and the face turns human. */
const LIP_Y = 1.55;
const LIP_Z = 3.05;

/**
 * The whole lower face is one block standing out of the head, and the nose lands
 * on top of it. Everything is the same stone, so a feature only reads by the
 * shadow under its own ledge — a mouth cut into a flat panel reads as nothing at
 * all, and a mouth on a jaw that juts reads from across the sheet.
 */
const CHIN_WIDTH = 4.6;
const CHIN_HEIGHT = 3;
const CHIN_DEPTH = 2.3;
/** Starts below the jaw line, dipping into the chest: a moai has no neck to show. */
const CHIN_Y = -0.4;
const CHIN_Z = 2.45;

/** Ears: crown to jaw, standing proud of the head's sides and buried in them. */
const EAR_X = 3.4;
const EAR_WIDTH = 1.1;
const EAR_HEIGHT = 8.7;
const EAR_DEPTH = 3;
const EAR_Y = 2.3;
const EAR_Z = 0.9;

/**
 * The head tips back a few degrees about the jaw line. It is what the moai on
 * the ahu do — they were raised looking out over the settlement, not down at it
 * — and it is worth the two lines because a face tilted up reads as carved
 * while a face square to the front reads as stacked.
 */
const HEAD_TILT = -0.06;

/** The pukao overhangs the crown a little and sits forward on it. */
const PUKAO_RADIUS = 3.5;
const PUKAO_HEIGHT = 2.6;
const PUKAO_Z = 0.3;

/**
 * Deterministic variation in [-1, 1]. The step is the golden angle, so no two
 * neighbours in a row of six land near the same value and the line never falls
 * into a pattern. `Math.random()` is out — the loader builds twice and compares.
 */
const wobble = (index: number, salt: number): number => Math.sin(index * 2.39996 + salt);

export const moaiRapaNui: Monument = {
  id: 'moai-rapa-nui',
  name: 'Moai of Rapa Nui',
  iso: 'CHL',
  lat: -27.125,
  lon: -109.277,
  // No `realHeight`, matching the source list. There are nearly a thousand moai
  // and no height belongs to all of them: the ahu figures run 4 to 10 m, and the
  // one still lying in the quarry is 21. Picking one would be inventing a fact.
  tier: 'building',
  footprint: 29,

  build(ctx) {
    const { THREE, palette, box, column, taper } = ctx;
    const stone = palette.bone;
    const basalt = palette.steel;
    const paving = palette.slate;
    const socket = palette.ink;
    const scoria = palette.clay;

    const group = new THREE.Group();

    /**
     * A hewn block. `width` and `depth` are at the base and `flare` times that
     * at the top: a square prism carries the flare, and `scale.z` sets the depth
     * afterwards, which is the only way to get a slab that is not square in plan
     * out of a helper that only makes regular prisms.
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

    // --- the ahu: two courses, the upper one lighter, so the row stands on a
    //     ledge instead of growing out of one dark block ---
    group.add(box(AHU_WIDTH, AHU_BASE_HEIGHT, AHU_DEPTH, basalt));
    const terrace = box(AHU_WIDTH - 3, AHU_TOP_HEIGHT, AHU_DEPTH - 1, paving);
    terrace.position.y = AHU_BASE_HEIGHT;
    group.add(terrace);

    /** One moai at nominal size, standing on y = 0 and facing +Z. */
    const moai = (topknot: boolean): Group => {
      const figure = new THREE.Group();

      figure.add(slab(TORSO_WIDTH, TORSO_HEIGHT, TORSO_DEPTH, stone, TORSO_FLARE));

      for (const side of [-1, 1]) {
        const arm = box(ARM_WIDTH, ARM_HEIGHT, ARM_DEPTH, stone);
        arm.position.set(side * ARM_X, ARM_Y, ARM_Z);
        figure.add(arm);

        // The outer end rides up to meet the arm, the inner end drops to the
        // navel, and the two long hands close on each other over the belly.
        const hand = box(HAND_WIDTH, HAND_HEIGHT, HAND_DEPTH, stone);
        hand.position.set(side * HAND_X, HAND_Y, HAND_Z);
        hand.rotation.z = side * HAND_TILT;
        figure.add(hand);
      }

      // The head is its own group so every feature below is written against the
      // jaw line, which is where the proportions are actually reasoned about.
      const head = new THREE.Group();
      head.position.y = TORSO_HEIGHT;
      head.rotation.x = HEAD_TILT;
      figure.add(head);

      head.add(slab(HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH, stone, HEAD_FLARE));

      const brow = box(BROW_WIDTH, BROW_HEIGHT, BROW_DEPTH, stone);
      brow.position.set(0, BROW_Y, BROW_Z);
      head.add(brow);

      for (const side of [-1, 1]) {
        const eye = box(EYE_WIDTH, EYE_HEIGHT, EYE_DEPTH, socket);
        eye.position.set(side * EYE_X, EYE_Y, EYE_Z);
        head.add(eye);

        const ear = box(EAR_WIDTH, EAR_HEIGHT, EAR_DEPTH, stone);
        ear.position.set(side * EAR_X, EAR_Y, EAR_Z);
        head.add(ear);
      }

      const nose = slab(NOSE_WIDTH, NOSE_HEIGHT, NOSE_WIDTH, stone, NOSE_FLARE);
      nose.position.set(0, NOSE_Y, NOSE_Z);
      head.add(nose);

      const lips = box(LIP_WIDTH, LIP_HEIGHT, LIP_DEPTH, stone);
      lips.position.set(0, LIP_Y, LIP_Z);
      head.add(lips);

      const chin = box(CHIN_WIDTH, CHIN_HEIGHT, CHIN_DEPTH, stone);
      chin.position.set(0, CHIN_Y, CHIN_Z);
      head.add(chin);

      if (topknot) {
        const pukao = column(PUKAO_RADIUS, PUKAO_HEIGHT, scoria, 8);
        pukao.position.set(0, HEAD_HEIGHT, PUKAO_Z);
        head.add(pukao);
      }

      return figure;
    };

    // --- the row ---
    for (let index = 0; index < COUNT; index++) {
      const figure = moai(TOPKNOTS.includes(index));
      // Scaling the figure rather than rebuilding it keeps the head at two
      // fifths whatever the variation does, and scales x and z together so a
      // wide moai is a thick one and not a flattened one.
      const height = 1 + HEIGHT_RANGE * wobble(index, 0);
      const width = 1 + WIDTH_RANGE * wobble(index, 1);
      figure.scale.set(width, height, width);
      figure.position.set((index - (COUNT - 1) / 2) * PITCH, AHU_HEIGHT, ROW_Z);
      // Yaw stays a degree or two: the line facing one way is half the subject.
      figure.rotation.y = YAW * wobble(index, 4);
      figure.rotation.z = LEAN * wobble(index, 2);
      figure.rotation.x = LEAN * 0.8 * wobble(index, 3);
      group.add(figure);
    }

    return group;
  },
};

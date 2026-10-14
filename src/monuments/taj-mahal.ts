import type { Monument } from './contract.ts';

/**
 * Taj Mahal.
 *
 * Four things carry it: the onion dome on its drum, the four minarets standing
 * clear of the building, the iwan (the tall pointed arch) on every face, and
 * the plinth it floats on.
 *
 * Deliberate departures:
 * - The dome is fat (0.44 of the block's width against 0.31 in life), or the
 *   crown would be a knob.
 * - The chamfered corners are engaged octagonal towers, each crowned by its
 *   chattri, because nothing in the contract subtracts.
 * - Recesses are dark panels standing proud of the wall: one mesh instead of the
 *   three a truly enclosing frame costs, over twenty openings.
 * - The flanking niches are plain slots, not arches.
 *
 * The minarets stand as far out on the plinth as they fit (four units clear),
 * so daylight shows between them and the corner towers.
 */

// --- the terrace: three steps, so the ink catches each one ---
const TERRACE = { half: 27.4, height: 1.8 };
const STEP = { half: 26.7, height: 0.8 };
const PLINTH = { half: 26, height: 2.4 };
const PLINTH_TOP = TERRACE.height + STEP.height + PLINTH.height;

// --- the mausoleum block. 29 units on a 52-unit plinth, as in life (57/100) ---
const BLOCK = { half: 14.5, height: 12.5 };
const BLOCK_TOP = PLINTH_TOP + BLOCK.height;
const CORNICE = { half: 15.2, height: 1 };
const CORNICE_TOP = BLOCK_TOP + CORNICE.height;
const ROOF = { half: 13.5, height: 0.8 };
const ROOF_TOP = CORNICE_TOP + ROOF.height;

/** Diagonal distance of the corner towers and the chattris that crown them. */
const CORNER = 17.8;

const DRUM = { radius: 5.5, height: 4.2 };
const DRUM_CAP = { radius: 6, height: 0.7 };
const DOME_BASE = ROOF_TOP + DRUM.height + DRUM_CAP.height;

/**
 * Half-widths up the onion, from the springing. It swells past the drum below
 * before it closes (the difference between an onion and a helmet), which is why
 * the profile is a list rather than one `taper`.
 */
const DOME = [
  { y: 0, r: 5.3 },
  { y: 1.85, r: 6.35 },
  { y: 4.05, r: 6.05 },
  { y: 6, r: 4.8 },
  { y: 7.85, r: 3 },
  { y: 9.6, r: 1.1 },
];
const DOME_TOP = DOME_BASE + DOME[DOME.length - 1]!.y;

const NECK = { radius: 1.05, height: 0.8 };
const FINIAL_BASE = DOME_TOP + NECK.height;

/** The iwan, and the frame it is cut into. Repeated on all four faces. */
const PISHTAQ = { width: 13, height: 15, depth: 1.9 };
const ARCH = { half: 3.9, waist: 2.9, jamb: 8.4, shoulder: 1.9, head: 3.4 };

/** Where the minarets stand, on the diagonal. */
const MINARET = 32.9;

export const tajMahal: Monument = {
  id: 'taj-mahal',
  name: 'Taj Mahal',
  iso: 'IND',
  lat: 27.175,
  lon: 78.042,
  realHeight: 73,
  tier: 'building',
  footprint: 39,

  build(ctx) {
    const { THREE, palette, box, column, taper, around } = ctx;
    const marble = palette.white;
    const trim = palette.bone;
    const sandstone = palette.clay;
    const shadow = palette.slate;
    const gilt = palette.gold;

    const group = new THREE.Group();

    // --- terrace and plinth ---
    group.add(box(TERRACE.half * 2, TERRACE.height, TERRACE.half * 2, sandstone));
    const step = box(STEP.half * 2, STEP.height, STEP.half * 2, trim);
    step.position.y = TERRACE.height;
    group.add(step);
    const plinth = box(PLINTH.half * 2, PLINTH.height, PLINTH.half * 2, marble);
    plinth.position.y = TERRACE.height + STEP.height;
    group.add(plinth);

    // --- the block, its cornice and the roof terrace the dome stands on ---
    const walls = box(BLOCK.half * 2, BLOCK.height, BLOCK.half * 2, marble);
    walls.position.y = PLINTH_TOP;
    group.add(walls);

    const cornice = box(CORNICE.half * 2, CORNICE.height, CORNICE.half * 2, trim);
    cornice.position.y = BLOCK_TOP;
    group.add(cornice);

    const roof = box(ROOF.half * 2, ROOF.height, ROOF.half * 2, marble);
    roof.position.y = CORNICE_TOP;
    group.add(roof);

    // --- corner towers, standing in for the chamfered corners ---
    const towers = around(4, () => {
      const corner = new THREE.Group();

      // Fat, and set well inside the corner it replaces: a slender one reads as a fifth minaret.
      const shaft = column(3.3, CORNICE_TOP - PLINTH_TOP, marble, 8);
      shaft.position.set(0, PLINTH_TOP, CORNER);
      corner.add(shaft);

      // The small blind arch each chamfer carries: one dark rectangle.
      const blind = box(3, 8.5, 0.5, shadow);
      blind.position.set(0, PLINTH_TOP + 1, CORNER + 3.4);
      corner.add(blind);

      return corner;
    });
    towers.rotation.y = Math.PI / 4;
    group.add(towers);

    // --- the four chattris that crown them ---
    const kiosks = around(4, () => {
      const kiosk = new THREE.Group();
      let y = CORNICE_TOP;

      const deck = column(3, 0.7, trim, 6);
      deck.position.set(0, y, CORNER);
      kiosk.add(deck);
      y += 0.7;

      const posts = column(2.3, 1.2, marble, 6);
      posts.position.set(0, y, CORNER);
      kiosk.add(posts);
      y += 1.2;

      const belly = taper(1.9, 2.3, 0.9, marble, 6);
      belly.position.set(0, y, CORNER);
      kiosk.add(belly);
      y += 0.9;

      const cap = taper(2.3, 0.3, 1.7, marble, 6);
      cap.position.set(0, y, CORNER);
      kiosk.add(cap);
      y += 1.7;

      const spike = column(0.25, 0.8, gilt, 4);
      spike.position.set(0, y, CORNER);
      kiosk.add(spike);

      return kiosk;
    });
    kiosks.rotation.y = Math.PI / 4;
    group.add(kiosks);

    // --- drum and dome ---
    const drum = column(DRUM.radius, DRUM.height, marble, 12);
    drum.position.y = ROOF_TOP;
    group.add(drum);

    const drumCap = column(DRUM_CAP.radius, DRUM_CAP.height, trim, 12);
    drumCap.position.y = ROOF_TOP + DRUM.height;
    group.add(drumCap);

    for (let i = 0; i + 1 < DOME.length; i++) {
      const a = DOME[i]!;
      const b = DOME[i + 1]!;
      const section = taper(a.r, b.r, b.y - a.y, marble, 12);
      section.position.y = DOME_BASE + a.y;
      group.add(section);
    }

    const neck = column(NECK.radius, NECK.height, trim, 8);
    neck.position.y = DOME_TOP;
    group.add(neck);

    // --- the gilded finial: five units of the forty, held to a fifth of the dome's height (longer reads as an aerial) ---
    const lotus = taper(1.45, 0.75, 1.2, gilt, 8);
    lotus.position.y = FINIAL_BASE;
    group.add(lotus);

    const spire = column(0.3, 2, gilt, 6);
    spire.position.y = FINIAL_BASE + 1.2;
    group.add(spire);

    const collar = column(0.85, 0.3, gilt, 8);
    collar.position.y = FINIAL_BASE + 2;
    group.add(collar);

    const tip = taper(0.42, 0, 1.8, gilt, 6);
    tip.position.y = FINIAL_BASE + 3.2;
    group.add(tip);

    // --- the iwan, on each of the four faces ---
    const portals = around(4, () => {
      const face = new THREE.Group();
      const front = BLOCK.half + PISHTAQ.depth / 2;

      const frame = box(PISHTAQ.width, PISHTAQ.height, PISHTAQ.depth, marble);
      frame.position.set(0, PLINTH_TOP, front);
      face.add(frame);

      // The arch is drawn on the frame rather than through it: a jamb panel and two
      // tapering courses, all in shadow. The tapers are flattened in z, or the
      // pointed head becomes a pyramid buried in the tomb.
      const mouth = front + PISHTAQ.depth / 2 + 0.25;

      const jamb = box(ARCH.half * 2, ARCH.jamb, 0.6, shadow);
      jamb.position.set(0, PLINTH_TOP, mouth);
      face.add(jamb);

      const shoulder = taper(ARCH.half, ARCH.waist, ARCH.shoulder, shadow);
      shoulder.scale.z = 0.6 / (ARCH.half * 2);
      shoulder.position.set(0, PLINTH_TOP + ARCH.jamb, mouth);
      face.add(shoulder);

      const head = taper(ARCH.waist, 0.35, ARCH.head, shadow);
      head.scale.z = 0.6 / (ARCH.waist * 2);
      head.position.set(0, PLINTH_TOP + ARCH.jamb + ARCH.shoulder, mouth);
      face.add(head);

      // The blind niches either side, so eight units of marble do not read as a blank wall.
      for (const side of [1, -1]) {
        const niche = box(3.2, 8.6, 0.6, shadow);
        niche.position.set(side * 10.5, PLINTH_TOP + 0.6, BLOCK.half + 0.35);
        face.add(niche);
      }

      return face;
    });
    group.add(portals);

    // --- the minarets ---
    const minarets = around(4, () => {
      const tower = new THREE.Group();
      let y = PLINTH_TOP;

      // Base, three storeys pinched by two balconies, and a chattri. Six sides, not eight.
      const stack: Array<[number, number, number, number]> = [
        [2.35, 2.35, 1.7, marble], // base
        [1.75, 1.6, 7, marble],
        [2.35, 2.35, 0.75, trim], // lower balcony
        [1.55, 1.4, 5.6, marble],
        [2.1, 2.1, 0.75, trim], // upper balcony
        [1.35, 1.25, 3, marble],
        [1.9, 1.9, 0.6, trim], // chattri deck
        [1.45, 1.7, 1, marble], // chattri dome
        [1.7, 0.25, 1.9, marble],
      ];

      for (const [bottom, top, height, color] of stack) {
        const piece = taper(bottom, top, height, color, 6);
        piece.position.set(0, y, MINARET);
        tower.add(piece);
        y += height;
      }

      return tower;
    });
    minarets.rotation.y = Math.PI / 4;
    group.add(minarets);

    return group;
  },
};

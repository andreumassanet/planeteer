import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Charles Bridge, Prague.
 *
 * A 14th-century masonry causeway, unlike the other bridges among the monuments
 * (steel spans): nine short round arches on cutwatered piers, nothing hanging
 * and nothing open, low (roadway at y = 9.1 on piers 5.2 tall), asymmetric with
 * one tower at one end, all-warm masonry (`tan`, `sand`, `brown`, `bark`,
 * `darkOlive`; `bark` keeps its hue in the arch voids where `steel` would go
 * black) and populated with thirty statues.
 *
 * The crop: the west half of the arcade (nine of sixteen arches, 267.5 m of
 * 516, at 0.400 u/m horizontally) and the Old Town Bridge Tower at the east end,
 * the roadway running 2.6 units past it. The west edge is cut through a pier,
 * since nothing clips a solid; the first statue stands over it. One tower, not
 * two, so it is not the Golden Gate's tower-span-tower frame.
 *
 * Vertical scale is 1.75x (0.700 u/m): tower 33.0 units, 107.3 wide, aspect
 * 3.25 against the cap of 4 (5.7 at true proportion). A semicircle stretched
 * that way becomes a lancet, so the arch rise alone is drawn at the horizontal
 * scale (3.34 on a 6.68 span; sixteen facets bulge 2% outside it) while the
 * springing and deck take the full stretch. The lost rise lands in the
 * spandrel, a plain band of 2.4 units of solid wall between crown and road. The
 * tower plan (10.0 square) and deck (7.2 wide, so two statue rows read) are
 * drawn at the vertical scale.
 *
 * Statues: thirty at true count, spaced two thirds of a bay so every third
 * stands over a pier (five of fifteen do); height and yaw vary
 * deterministically. Piers project 1.2 units further in z than the wall and 1.0
 * further than the openings, so each throws its own cutwater and ink line.
 * Arch openings are dark solids (z +/-3.4) enclosing the arcade wall (+/-3.2),
 * since nothing cuts a hole; their order is load-bearing, see `opening`. The
 * bridge arches are round and the tower's gateway a pointed gable (a 1357
 * bridge under a 1380 tower).
 *
 * Left out: cobbles, statue detail, the Lesser Town towers, the camber. Budget:
 * 116 of 130 meshes and 2,508 triangles; meshes bind (statues are sixty), so
 * each pier is one scaled hexagonal prism carrying both cutwaters. Tier
 * `landmark` for footprint and mesh budget, not height.
 */

// ---------------------------------------------------------------------------
// The arcade. Horizontal 0.400 u/m, vertical 0.700 u/m.
// ---------------------------------------------------------------------------

/** Half the frame. 107 units = 267.5 m, about half the bridge. */
const DECK_END = 53.5;

/** Clear span, 6.68 u = 16.7 m — the bridge's own narrowest arch. */
const ARCH_SPAN = 6.68;
const ARCH_R = ARCH_SPAN / 2;
/** Pier thickness along the bridge, 3.2 u = 8.0 m. The real piers are 8-11 m. */
const PIER_HALF_X = 1.6;
const BAY = ARCH_SPAN + PIER_HALF_X * 2;

/**
 * Ten piers carrying nine arches, pier 0's outer face flush with the west end of
 * the deck, so the arcade is cut through a pier and not an arch. The pier's extra
 * 0.05 of half-length leaves it 0.05 proud of the wall's end face (no two solids
 * share a plane).
 */
const PIERS = 10;
const PIER_X0 = -DECK_END + PIER_HALF_X;
const pierX = (index: number): number => PIER_X0 + index * BAY;

/**
 * Across the bridge. The wall sits behind the openings and the openings behind
 * the piers, so each gets its own ink line.
 */
const WALL_HALF_Z = 3.2;
const VOID_HALF_Z = 3.4;
const PIER_HALF_Z = 4.4;
const PARAPET_FACE_Z = 3.6;
const CORNICE_HALF_Z = 3.85;

/**
 * Springing line, 3.34 u = 4.8 m above the water, equal to `ARCH_R`, so the arch
 * head's polygon reaches y = 0 at its bottom.
 */
const SPRING_Y = 3.34;
/**
 * Facets drawing the arch head. Sixteen is a multiple of four, so `column`'s
 * across-the-flats radius gives an opening exactly `ARCH_SPAN` wide rising
 * exactly `ARCH_R` (facets bulge at most 2% on the diagonals), with a flat 1.33
 * units wide at the crown as the keystone course.
 */
const ARCH_SIDES = 16;

const PIER_TOP = 5.2;
const WALL_TOP = 8.2;
const CORNICE_TOP = 8.7;
const ROAD_TOP = 9.1;
const PARAPET_TOP = 10.3;

// ---------------------------------------------------------------------------
// The statues: fifteen a side, two thirds of a bay apart, ending over pier 9.
// ---------------------------------------------------------------------------

const STATUES_PER_SIDE = 15;
const STATUE_SPACING = (BAY * 2) / 3;
/**
 * Anchored on the west pier, so the run starts over the pier the frame cuts and
 * ends at 40.3, 0.09 clear of the tower shaft's west face.
 */
const STATUE_FIRST_X = pierX(0);
const PLINTH_HALF = 0.5;
const PLINTH_TOP = PARAPET_TOP + 0.9;
const STATUE_Z = (PARAPET_FACE_Z + WALL_HALF_Z) / 2;

// ---------------------------------------------------------------------------
// The Old Town Bridge Tower. Plan drawn at the vertical scale: 47 m tall on a
// 14 m square is 33.0 on 10.0 here, its own true 1:3.3.
// ---------------------------------------------------------------------------

const TOWER_X = 45.9;
const TOWER_HALF_X = 5.0;
const TOWER_HALF_Z = 5.2;
const TOWER_PLINTH_TOP = 2.0;
const TOWER_SHAFT_TOP = 22.0;
const GALLERY_TOP = 23.6;
const ROOF_TOP = 31.2;
const TOWER_TOP = 33.0;

/**
 * The gateway: pointed, where every arch below it is round. `GATE_SPRING` puts
 * the 6.24-unit gable's apex at 21.0, 0.2 under the corbel course at 21.2, and
 * leaves the lower band as the impost the arch rises from.
 */
const GATE_HALF_Z = 3.0;
const GATE_SPRING = 14.8;
/**
 * Half-width across the flats of the gable's three-sided head, which spans
 * +/-1.732a across and 3a tall unstretched; `GATE_HALF_Z / sqrt(3)` makes the
 * head as wide as the gateway under it.
 */
const GABLE_A = GATE_HALF_Z / Math.sqrt(3);
/** Stretches the gable head to 1.2x, which is what makes it read as Gothic and not as a hip. */
const GABLE_RISE = 1.2;

const PINNACLE_X = 4.5;
const PINNACLE_Z = 4.7;
const PINNACLE_TOP = 27.2;
const PINNACLE_CAP_TOP = 29.8;

export const charlesBridge: Monument = {
  id: 'charles-bridge',
  name: 'Charles Bridge',
  iso: 'CZE',
  lat: 50.086,
  lon: 14.411,
  tier: 'landmark',
  footprint: 54,

  build(ctx) {
    const { THREE, palette, box, column, taper } = ctx;
    const stone = palette.tan;
    const dressing = palette.sand;
    const shadow = palette.bark;
    const figure = palette.darkOlive;
    const paving = palette.brown;

    const group = new THREE.Group();

    // -----------------------------------------------------------------------
    // The arcade wall
    // -----------------------------------------------------------------------
    // One box the whole length. Everything else is a hole punched into it (the
    // openings, which stand proud in z so they enclose it) or a mass off it.
    const wall = box(DECK_END * 2, WALL_TOP, WALL_HALF_Z * 2, stone);
    group.add(wall);

    // -----------------------------------------------------------------------
    // Piers with cutwaters — one mesh each
    // -----------------------------------------------------------------------
    // A hexagonal prism turned a quarter so its two points face up- and
    // downstream: a flat-sided body with a triangular cutwater at each end out of
    // one `taper` (the taper is the batter). The scale is written in the prism's
    // own axes, before the rotation (T * R * S): an unrotated 6-gon has its flats
    // on +/-Z and its points on +/-X, so the z argument is the half-length along
    // the bridge and the x argument reaches the cutwater tips. Swapping them is
    // silent: the piers vanish inside the 6.4-deep wall.
    for (let i = 0; i < PIERS; i++) {
      const pier = taper(1, 0.86, PIER_TOP, stone, 6);
      pier.rotation.y = Math.PI / 2;
      // `PIER_HALF_Z * cos(30 deg)` is the apothem that puts the hexagon's point
      // at PIER_HALF_Z. The extra 0.05 buries the flat face inside the opening.
      pier.scale.set(PIER_HALF_Z * Math.cos(Math.PI / 6), 1, PIER_HALF_X + 0.05);
      pier.position.x = pierX(i);
      group.add(pier);
    }

    // -----------------------------------------------------------------------
    // The openings
    // -----------------------------------------------------------------------
    // Each is a dark rectangle up to the springing line with a dark polygon above
    // it; both are ~6.8 deep against the wall's 6.4, so the opening is a tunnel-
    // shaped mass with pale masonry round it.
    const opening = (centre: number) => {
      const jamb = box(ARCH_SPAN, SPRING_Y, VOID_HALF_Z * 2, shadow);
      jamb.position.x = centre;
      group.add(jamb);

      // The jamb stands 0.03 proud of the head on each face, and the order
      // matters: `column` makes a whole prism, so with the head in front the hull
      // inks the head's bottom half across the opening (nine wheels). Behind the
      // jamb only the semicircle survives, and the jamb's top edge draws the impost.
      const head = column(ARCH_R, VOID_HALF_Z * 2 - 0.06, shadow, ARCH_SIDES);
      head.rotation.x = Math.PI / 2;
      head.position.set(centre, SPRING_Y, -(VOID_HALF_Z - 0.03));
      group.add(head);
    };

    for (let i = 0; i < PIERS - 1; i++) {
      opening(pierX(i) + BAY / 2);
    }

    // -----------------------------------------------------------------------
    // Deck: cornice, roadway, parapets
    // -----------------------------------------------------------------------
    // The cornice is the strongest horizontal: it projects past the parapet and
    // the wall, so one ink line runs the 107 units.
    const cornice = box(DECK_END * 2, CORNICE_TOP - WALL_TOP, CORNICE_HALF_Z * 2, dressing);
    cornice.position.y = WALL_TOP;
    group.add(cornice);

    // 0.05 under each parapet's inner face and `PROUD` short of the deck's ends,
    // so no faces are coplanar.
    const road = box(DECK_END * 2 - PROUD * 2, ROAD_TOP - CORNICE_TOP, (PARAPET_FACE_Z - 0.45) * 2, paving);
    road.position.y = CORNICE_TOP;
    group.add(road);

    for (const side of [1, -1]) {
      const parapet = box(DECK_END * 2, PARAPET_TOP - CORNICE_TOP, 0.5, dressing);
      parapet.position.set(0, CORNICE_TOP, side * (PARAPET_FACE_Z - 0.25));
      group.add(parapet);
    }

    // -----------------------------------------------------------------------
    // Thirty statues
    // -----------------------------------------------------------------------
    for (let i = 0; i < STATUES_PER_SIDE; i++) {
      const x = STATUE_FIRST_X + i * STATUE_SPACING;
      // Golden-angle wobble: deterministic, and no two neighbours match. Without
      // it fifteen identical posts read as railings rather than as sculpture.
      const wobble = Math.sin(i * 2.39996);

      for (const side of [1, -1]) {
        const z = side * STATUE_Z;

        const plinth = box(PLINTH_HALF * 2, PLINTH_TOP - PARAPET_TOP, PLINTH_HALF * 2, dressing);
        plinth.position.set(x, PARAPET_TOP, z);
        group.add(plinth);

        // Six sides and a shallow taper: a lump with shoulders, not a spindle.
        const saint = taper(0.40 + 0.04 * wobble, 0.25, 2.0 + 0.3 * wobble, figure, 6);
        saint.rotation.y = 0.5 * wobble * side;
        saint.position.set(x, PLINTH_TOP, z);
        group.add(saint);
      }
    }

    // -----------------------------------------------------------------------
    // The Old Town Bridge Tower
    // -----------------------------------------------------------------------
    const plinth = box(TOWER_HALF_X * 2 + 1.0, TOWER_PLINTH_TOP, TOWER_HALF_Z * 2 + 1.0, stone);
    plinth.position.x = TOWER_X;
    group.add(plinth);

    const shaft = box(
      TOWER_HALF_X * 2,
      TOWER_SHAFT_TOP - TOWER_PLINTH_TOP,
      TOWER_HALF_Z * 2,
      stone,
    );
    shaft.position.set(TOWER_X, TOWER_PLINTH_TOP, 0);
    group.add(shaft);

    // String courses, proud of the shaft. The lower one is the gateway's impost
    // (its top stops 0.1 under the springing); the upper corbels under the
    // gallery, 0.2 clear of the gable's apex.
    for (const base of [14.0, 21.2]) {
      const band = box(TOWER_HALF_X * 2 + 0.6, 0.7, TOWER_HALF_Z * 2 + 0.6, dressing);
      band.position.set(TOWER_X, base, 0);
      group.add(band);
    }

    // Tall window slots, raised rather than recessed: a shallow recess vanishes
    // under a four-step ramp, a proud dark strip gets its own outline.
    for (const side of [1, -1]) {
      for (const offset of [-2.5, 2.5]) {
        const window = box(1.3, 3.8, 0.7, shadow);
        window.position.set(TOWER_X + offset, 17.0, side * TOWER_HALF_Z);
        group.add(window);
      }
    }

    // --- the gateway, on both end faces ---
    // A dark reveal with a pointed head; the roadway runs through hidden inside.
    for (const face of [1, -1]) {
      const reveal = box(0.8, GATE_SPRING - ROAD_TOP, GATE_HALF_Z * 2, shadow);
      reveal.position.set(TOWER_X + face * TOWER_HALF_X, ROAD_TOP, 0);
      group.add(reveal);

      // A three-sided `column` on its side is a gable: apex up, 1.732a across and
      // 3a tall, stretched 1.2x on its rise so it is pointed. It is built across z
      // and swung a quarter turn to lie across x, which takes a wrapper group
      // because the two rotations do not compose in one Euler.
      const head = new THREE.Group();
      head.rotation.y = face * (Math.PI / 2);
      const gable = column(GABLE_A, 0.8, shadow, 3);
      gable.rotation.x = Math.PI / 2;
      gable.scale.z = GABLE_RISE;
      gable.position.y = GATE_SPRING + GABLE_A * GABLE_RISE;
      head.add(gable);
      head.position.x = TOWER_X + face * (TOWER_HALF_X - 0.4);
      group.add(head);
    }

    // --- gallery, roof, pinnacles ---
    const gallery = box(TOWER_HALF_X * 2 + 1.6, GALLERY_TOP - TOWER_SHAFT_TOP, TOWER_HALF_Z * 2 + 1.6, dressing);
    gallery.position.set(TOWER_X, TOWER_SHAFT_TOP, 0);
    group.add(gallery);

    const roof = taper(TOWER_HALF_X, 0.35, ROOF_TOP - GALLERY_TOP, shadow, 4);
    roof.position.set(TOWER_X, GALLERY_TOP, 0);
    group.add(roof);

    const finial = taper(0.35, 0.06, TOWER_TOP - ROOF_TOP, shadow, 4);
    finial.position.set(TOWER_X, ROOF_TOP, 0);
    group.add(finial);

    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const px = TOWER_X + sx * PINNACLE_X;
        const pz = sz * PINNACLE_Z;

        const pinnacle = column(0.5, PINNACLE_TOP - GALLERY_TOP, dressing, 8);
        pinnacle.position.set(px, GALLERY_TOP, pz);
        group.add(pinnacle);

        const cap = taper(0.58, 0.05, PINNACLE_CAP_TOP - PINNACLE_TOP, shadow, 8);
        cap.position.set(px, PINNACLE_TOP, pz);
        group.add(cap);
      }
    }

    return group;
  },
};

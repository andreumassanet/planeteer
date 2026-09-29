import { PROUD } from './contract.ts';
import type { Monument, Mesh } from './contract.ts';

/**
 * The Alhambra, Granada.
 *
 * **What the monument is: the fortress line, not the Court of the Lions.**
 *
 * The Alhambra is a walled city, and the two things it is famous for cannot be
 * modelled by the same object. The Court of the Lions is the picture everyone
 * carries — the twelve marble lions, the forest of paired colonnettes, the
 * muqarnas. It is also a *room*: a rectangle of open sky in the middle of a
 * roofed block, invisible from anywhere except standing inside it. A monument in
 * this world is a solid seen from outside, from a long way off, usually from
 * below, and often at 260 pixels on a contact sheet. Model the Court of the
 * Lions and what a player walks up to is the outside of the block containing it,
 * which is a plain wall — the monument would be a beautiful thing you can never
 * see. Worse, the courtyard's entire read is *fine detail*: colonnettes 20 cm
 * thick, which at this model's scale are a third of the ink line that would
 * draw them. The style here is heavy black outlines and flat cel fills; it eats
 * filigree alive.
 *
 * So the monument is the other Alhambra: **the long red curtain wall on the
 * Sabika ridge, studded with square crenellated towers** — what Granada looks up
 * at, what the name means (*al-qal'a al-hamra*, the red fort), and a silhouette
 * that survives being 260 pixels wide because it is made of nothing but big
 * rectangles at different heights. The palaces are not abandoned; they are put
 * where they actually are from outside, which is *behind the parapet*: three low
 * blocks whose tiled roofs show over the wall. That is the whole difference
 * between a castle and a palace-city at this distance, and it is the cheapest
 * detail in the file.
 *
 * **The five things that had to survive the thumbnail**, and what pays for each:
 *
 * 1. *A long horizontal run of red-ochre wall.* Eight wall segments, one
 *    colour, `clay` — the rammed earth (tapia) the Alhambra is built of, and the
 *    colour the name is about.
 * 2. *Square crenellated towers at intervals, all of different heights and
 *    widths.* Six towers, no two alike in either dimension: half-widths 2.4,
 *    2.6, 2.8, 3.6, 4.4, 5.2 and tops 18.2, 18.2, 18.4, 20.8, 24.8, 33.2. An
 *    evenly-toothed wall is every castle ever drawn; the Alhambra's irregularity
 *    is the identity, so it is the first thing to protect if these numbers are
 *    ever touched. The Alcazaba's three are bunched on the western prow and the
 *    rest are strung out east, which is where they stand.
 * 3. *Two anchors, sixty-six units apart on a ninety-three-unit run.* The Torre
 *    de la Vela at the far west (masonry to 24.8, bell-cote to 28.9) and the
 *    Torre de Comares (33.2, the tallest thing here) three-quarters of the way
 *    east. Nothing between them passes 20.8, so the line reads as a span between
 *    two posts rather than as a fence.
 * 4. *Stepped ground.* The ridge is six stepped plinths of `darkOlive` rock: 5.4
 *    at the western prow, 4.8 under the Alcazaba, down to 2.4 for the ravine at
 *    the Plaza de los Aljibes — the real break between fortress and palaces, and
 *    where the wall dips lowest — up to the 4.0 palace terrace, away to 1.0 at
 *    the east end. The wall's foot and its parapet both step, and they step in
 *    different places; a level wall would be a viaduct.
 * 5. *Low red-tiled hipped roofs behind the parapet.* Five `orange` roofs —
 *    three on palace blocks standing behind the wall, two on towers — each
 *    clearing the parapet in front of it by 2 to 4 units. This is the one thing
 *    that says palace rather than fort, and it costs five meshes. The palace
 *    blocks are sited by where the *gaps between the towers* fall rather than by
 *    their true plan: a roof behind a tower is a roof nobody sees.
 *
 * **The crop, and the distortion, in numbers.** The complex is about 740 m of
 * ridge; the crop is the western 330 m, Torre de la Vela to Torre de Comares
 * with the Partal and a low tail beyond it — the half you see from the Albaicín,
 * and the half with both anchors in it. Dropped: the long eastern run of
 * north-wall towers (Picos, Cautiva, Infantas, Cabo de la Carrera) and the
 * Generalife on the hill behind, because more of the same wall buys nothing and
 * costs every tower its size.
 *
 * There are **three scales in this file, not two**, and saying which is which is
 * the whole account of the distortion:
 *
 * - *Along the ridge*: 330 m becomes 93 units, so **1 unit is 3.5 m**.
 * - *Up*: the Comares tower's real 45 m becomes 29.8 units above its terrace, so
 *   **1 unit is 1.5 m**.
 * - *Across a building* — every tower's plan, the wall's thickness, the merlons,
 *   the bell-cote — **1 unit is about 1.6 m**, within a tenth of the height
 *   scale. The Comares tower is 10.4 units square here for a real 17 m, the
 *   Torre de la Vela 8.8 for a real 16.
 *
 * So each building keeps very nearly its true elevation proportions, and what
 * got compressed — by **2.4x** — is the *distance between* them. That is the
 * trade `MAX_ASPECT` forced on the Golden Gate at 2.3x, and the one a long lens
 * makes of this exact view from across the Darro. The other way round — true
 * spacing, stretched buildings — gives six chimneys, and a stocky square tower
 * is the shape you would name the Alhambra by.
 *
 * `MAX_ASPECT` measures the half-diagonal, so the model's 47.3 out and 33.2 up
 * come to 2.85x wider than tall, against the cap of 4. Comfortable, but only
 * because of the compression: drawn at the building scale throughout, the same
 * crop would be 206 units long and 6.2x over.
 *
 * The crenellation is the one thing knowingly drawn oversize — 1.7 units of
 * merlon on a 2.7 pitch, so at the building scale 2.7 m of tooth every 4.3 m
 * against a real 1 to 1.5 m every 2. Half as many teeth, twice the size: on the
 * contact sheet's 260-pixel cell that is four pixels of merlon and two and a
 * half of gap, and anything nearer life smears the whole parapet grey.
 *
 * **Why `building`.** The tier question is how far off you should be able to
 * name it, and for the Alhambra the answer is *from the other side of Granada*,
 * which is that tier's own example ("a palace"). It is also the only tier whose
 * 55-unit footprint can hold a 93-unit run at all — `tower` stops at 28. The
 * model comes in at 33.2 of the tier's 40 deliberately: the last 7 units could
 * only be bought by stretching the vertical past 2.4x, and the towers are what
 * would pay for them.
 *
 * **One colour for all the masonry, and the Potala's lesson for why.** Wall,
 * towers, merlons, palace blocks and bell-cote are one `clay`. The Potala's
 * great zigzag stair was first drawn in a contrasting `bone` so it would be
 * legible, and it read as grey scaffolding bolted to the facade. Nothing here
 * gets a colour to make it visible; the ink outline does that. The four other
 * colours are all things that are genuinely another material in life:
 * `darkOlive` rock, `orange` roof tile, `ink` openings, `green` cypresses.
 *
 * The rock took two wrong answers to settle. `tan` and `bone` are what a dry
 * outcrop looks like and both are neutrals — the hemisphere light's sky colour
 * is blue, so a neutral in shadow here goes cold, and a cold-grey shelf under a
 * red wall reads as a concrete plinth. `brown` fixed the temperature and lost
 * the contrast: against `clay` it sits about one cel band away, so on the
 * contact sheet the ridge merged into the foot of the wall and the stepped
 * ground stopped existing. `darkOlive` is warm *and* several steps darker, which
 * is what the wooded scarp under the Alhambra looks like from Granada anyway,
 * and it is dark enough that the `green` cypresses in front of it stop
 * vanishing into the grass pad they are standing on.
 *
 * Also traded away: Charles V's palace, which really does stand in the middle of
 * this crop but is a grey Renaissance block round a circular courtyard — it says
 * Italy, it is a room again, and from the Albaicín it sits mostly behind the
 * Nasrid roofs; the horseshoe arch of the Puerta de la Justicia, which is on the
 * south side and invisible from the front; and the elm woods of the scarp,
 * reduced to five cypresses at the foot.
 */

// --- the ridge -------------------------------------------------------------

/** The front is +Z: the north face, the one Granada looks at from the Albaicín. */
const WALL_Z = 1.2;
/** Half-thickness of the curtain wall. */
const WALL_D = 2.0;
/** How far the rock terrace stands out in front of the wall's foot. */
const ROCK_FRONT = 4.6;

/**
 * A step of the ridge: rock, running from y = 0 to `top`.
 *
 * West (+X) is on the right of the front view, which is where the Alcazaba sits
 * when you look at this from Granada. The two end faces are vertical cuts,
 * because this is a crop of a longer ridge and pretending otherwise would be a
 * lie about the shape.
 */
interface Step {
  x0: number;
  x1: number;
  top: number;
  /** How far back the terrace runs. Only the palace stretch is deep. */
  back: number;
}

const STEPS: Step[] = [
  { x0: 36.0, x1: 46.6, top: 5.4, back: -4.0 }, // the western prow, under the Vela
  { x0: 16.0, x1: 36.0, top: 4.8, back: -5.0 }, // the Alcazaba's rock
  { x0: 8.0, x1: 16.0, top: 2.4, back: -5.0 }, // the ravine at the Plaza de los Aljibes
  { x0: -31.0, x1: 8.0, top: 4.0, back: -11.0 }, // the palace terrace, the deep one
  { x0: -40.0, x1: -31.0, top: 2.6, back: -8.0 }, // the Partal
  { x0: -46.6, x1: -40.0, top: 1.0, back: -4.0 }, // falling away east
];

/**
 * The two anchor towers are built out on spurs of rock in front of the terrace
 * line, as they are in life. Without these their front faces overhang thin air.
 * Each spur's face stands `PROUD` in front of its tower's: flush, the rock and
 * the masonry shared a plane and flickered.
 */
const SPURS: { x: number; w: number; h: number; z: number; d: number }[] = [
  { x: 42.0, w: 9.6, h: 5.4, z: 4.5 + PROUD / 2, d: 1.8 + PROUD }, // Torre de la Vela
  { x: -24.0, w: 11.6, h: 4.0, z: 4.6 + PROUD / 2, d: 2.4 + PROUD }, // Torre de Comares
];

// --- the towers ------------------------------------------------------------

interface Tower {
  /** For the reader. Nothing in the model uses it. */
  name: string;
  x: number;
  /** Half-width along the ridge, and half-depth across it. */
  hw: number;
  hd: number;
  /** Foot, always buried in the step below it, and the top of the masonry. */
  base: number;
  shaft: number;
  /** Top of the merlons. */
  crown: number;
  /** Apex of the tiled roof inside the crenellations, or 0 for none. */
  roof: number;
  /** A string course under the merlons: one extra ink line across the tower. */
  cornice: boolean;
  /** Merlons on the two flanks as well, so the quarter view is not a bare box. */
  flanks: boolean;
}

/**
 * Six towers, west to east. No two share a width or a height — that irregularity
 * is the single thing separating this from a generic castle wall.
 *
 * The intervals are as uneven as the towers: three bunched inside twenty-nine units
 * at the Alcazaba end, then twenty-one units of low wall over the ravine with
 * nothing on it at all, then the palace end. A tower every nine units would be
 * the same six boxes and a completely different building.
 */
const TOWERS: Tower[] = [
  // The Alcazaba: three towers bunched on the western prow.
  {
    name: 'Torre de la Vela',
    x: 42.0, hw: 4.4, hd: 4.2, base: 4.5, shaft: 22.5, crown: 24.8,
    roof: 0, cornice: true, flanks: true,
  },
  {
    name: 'Torre Quebrada',
    x: 31.0, hw: 2.8, hd: 2.8, base: 4.0, shaft: 16.4, crown: 18.2,
    roof: 0, cornice: false, flanks: false,
  },
  {
    name: 'Torre del Homenaje',
    // 3.3 deep, not 3.4, so its face stands 0.1 behind the rock's at 4.6
    // rather than sharing that plane in another colour.
    x: 21.5, hw: 3.6, hd: 3.3, base: 4.0, shaft: 18.6, crown: 20.8,
    roof: 0, cornice: true, flanks: true,
  },
  // Then twenty-one units of low wall over the ravine, and the palaces begin.
  {
    name: 'Torre de Machuca',
    x: -6.0, hw: 2.4, hd: 2.6, base: 3.4, shaft: 16.8, crown: 18.4,
    roof: 0, cornice: false, flanks: false,
  },
  {
    name: 'Torre de Comares',
    x: -24.0, hw: 5.2, hd: 4.6, base: 3.4, shaft: 29.5, crown: 32.4,
    roof: 33.2, cornice: true, flanks: true,
  },
  {
    name: 'Torre de las Damas',
    x: -35.0, hw: 2.6, hd: 2.9, base: 2.0, shaft: 14.4, crown: 16.0,
    roof: 18.2, cornice: false, flanks: false,
  },
];

// --- the curtain between them ---------------------------------------------

/** A stretch of wall. `base` is always under the rock it stands on, so it buries. */
interface Curtain {
  x0: number;
  x1: number;
  base: number;
  top: number;
}

/**
 * Eight stretches. The parapet steps down into the ravine (8.4, the lowest) and
 * again along the eastern tail (8.6), which is half of how the ridge is drawn;
 * the other half is the rock stepping under it, and the two steps deliberately
 * do not line up.
 */
const CURTAINS: Curtain[] = [
  { x0: 33.6, x1: 37.6, base: 4.2, top: 11.6 },
  { x0: 25.0, x1: 28.4, base: 4.0, top: 11.0 },
  { x0: 12.0, x1: 18.1, base: 3.0, top: 10.2 },
  { x0: 3.8, x1: 12.2, base: 1.6, top: 8.4 }, // over the ravine
  { x0: -3.8, x1: 4.0, base: 3.0, top: 10.8 },
  { x0: -19.0, x1: -8.2, base: 3.2, top: 11.4 }, // the palace stretch
  { x0: -32.6, x1: -28.6, base: 2.4, top: 10.6 },
  // The tail, trailing off east; it stops `PROUD` short of the rock's end,
  // whose end face it shared.
  { x0: -46.6 + PROUD, x1: -37.2, base: 0.4, top: 8.6 },
];

// --- crenellation ----------------------------------------------------------

/**
 * Merlon pitch, width and height.
 *
 * At the contact sheet's 260-pixel cell a 94-unit model gets about 2.7 pixels
 * per unit, so a merlon is four pixels of tooth and a gap is two and a half.
 * That is the smallest a crenellation can be and still read as one; halving the
 * pitch to something nearer life turns the whole parapet into a grey smear, and
 * doubling it makes seven blocks sitting on a wall.
 */
const MERLON_PITCH = 2.7;
const MERLON_W = 1.7;
const MERLON_H = 1.5;
/** Merlons sit on the outer edge of the wall walk, not across its whole width. */
const MERLON_D = 2.2;

// --- what shows behind the parapet -----------------------------------------

/**
 * The palace blocks and their roofs. `top` is the block; `apex` is the ridge of
 * the hipped tile roof over it, and every apex but the smallest clears the
 * curtain in front of it.
 */
interface Palace {
  x: number;
  z: number;
  w: number;
  d: number;
  base: number;
  top: number;
  apex: number;
  /** Ridge length as a fraction of the eave. 1 would be a flat lid, 0 a pyramid. */
  ridge: number;
}

const PALACES: Palace[] = [
  // The Comares palace, round the Court of the Myrtles: sited to show in the
  // ten-unit gap between the Comares tower and Machuca, not behind the tower.
  { x: -13.5, z: -5.4, w: 15.0, d: 8.4, base: 3.0, top: 11.0, apex: 14.8, ridge: 0.55 },
  // The Court of the Lions block, at the palaces' western edge.
  { x: 0.0, z: -4.8, w: 11.0, d: 7.4, base: 3.0, top: 9.6, apex: 13.4, ridge: 0.55 },
  // The Partal, lower and further east.
  { x: -31.5, z: -3.6, w: 8.0, d: 5.2, base: 2.2, top: 8.6, apex: 12.0, ridge: 0.5 },
];

// --- openings --------------------------------------------------------------

/** A dark opening on a front face: x, sill, half-width, height, and the face's z. */
interface Opening {
  x: number;
  y: number;
  hw: number;
  h: number;
  z: number;
}

/**
 * Twelve is not many for a wall this long, and that is deliberate: the Alhambra
 * turns an almost blind face to the north, which is what a fortified curtain is.
 * They are here for scale rather than for texture — the paired windows of the
 * Hall of the Ambassadors are most of why the Comares tower reads as forty-five
 * metres rather than as a chimney.
 */
const OPENINGS: Opening[] = [
  // Torre de Comares: two storeys of paired windows on the north face.
  { x: -26.4, y: 17.5, hw: 0.7, h: 3.0, z: 5.8 },
  { x: -21.6, y: 17.5, hw: 0.7, h: 3.0, z: 5.8 },
  { x: -26.4, y: 23.5, hw: 0.7, h: 3.0, z: 5.8 },
  { x: -21.6, y: 23.5, hw: 0.7, h: 3.0, z: 5.8 },
  // Torre de la Vela.
  { x: 40.8, y: 14.0, hw: 0.55, h: 2.2, z: 5.4 },
  { x: 43.2, y: 14.0, hw: 0.55, h: 2.2, z: 5.4 },
  { x: 42.0, y: 18.6, hw: 0.6, h: 2.4, z: 5.4 },
  // Torre del Homenaje.
  { x: 21.5, y: 12.0, hw: 0.6, h: 2.4, z: 4.5 },
  // The Partal loggia, under its own tiled roof.
  { x: -35.9, y: 9.6, hw: 0.55, h: 2.2, z: 4.1 },
  { x: -34.1, y: 9.6, hw: 0.55, h: 2.2, z: 4.1 },
  // Two slits in the curtain, one either side of the ravine.
  { x: 15.0, y: 7.0, hw: 0.4, h: 1.8, z: 3.2 },
  { x: -12.0, y: 8.0, hw: 0.4, h: 1.8, z: 3.2 },
];

// --- the Vela's bell-cote --------------------------------------------------

/**
 * The espadaña on the Torre de la Vela, whose bell is rung every 2 January and
 * gives the tower its name. It is the only thing distinguishing the Vela from a
 * plain keep, and it survives only because it is drawn at the building scale and
 * not at the ridge's: 3.4 units across by 4.1 tall is about 5.5 m by 6, which is
 * roughly life. At 3.5 m per unit it would be one unit wide — a third of an ink
 * line — and there would be no notch in the skyline at all.
 */
const BELL_X = 42.0;
const BELL_BASE = 24.8;

// --- planting --------------------------------------------------------------

/** The elm woods and the Generalife's cypresses, reduced to five cones. */
const CYPRESSES: { x: number; z: number; r: number; h: number }[] = [
  { x: -41.0, z: 5.2, r: 1.0, h: 6.4 },
  { x: -29.5, z: 5.6, r: 1.1, h: 7.2 },
  { x: -16.5, z: 5.4, r: 0.95, h: 6.0 },
  { x: 19.0, z: 5.2, r: 1.0, h: 6.4 },
  { x: 24.5, z: 5.8, r: 0.85, h: 5.2 },
];

export const alhambra: Monument = {
  id: 'alhambra',
  name: 'Alhambra',
  iso: 'ESP',
  lat: 37.176,
  lon: -3.588,
  // No `realHeight`: the source list asserts none, and it is right not to. The
  // Alhambra is a walled town on a ridge — the Comares tower is 45 m, the
  // Torre de la Vela about 27, the curtain between them 11, and none of those
  // is *the* height of the thing.
  tier: 'building',
  footprint: 48,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;
    const tapia = palette.clay; // every piece of masonry, without exception
    const rock = palette.darkOlive; // the ridge
    const tile = palette.orange; // the roofs, and only the roofs
    const dark = palette.ink; // openings
    const cypress = palette.green;

    const group = new THREE.Group();
    const put = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };

    // --- the ridge ---
    for (const step of STEPS) {
      const depth = ROCK_FRONT - step.back;
      put(
        box(step.x1 - step.x0, step.top, depth, rock),
        (step.x0 + step.x1) / 2,
        0,
        ROCK_FRONT - depth / 2,
      );
    }
    for (const spur of SPURS) put(box(spur.w, spur.h, spur.d, rock), spur.x, 0, spur.z);

    /**
     * A run of merlons along X, spaced to fit the span rather than to a fixed
     * grid: a fixed pitch leaves a half tooth at one end of every stretch, and
     * on a wall broken into fourteen of them that is fourteen small mistakes.
     */
    const crenellate = (x0: number, x1: number, y: number, z: number, depth: number): void => {
      const span = x1 - x0;
      const count = Math.max(1, Math.round(span / MERLON_PITCH));
      const pitch = span / count;
      for (let index = 0; index < count; index++) {
        put(box(MERLON_W, MERLON_H, depth, tapia), x0 + pitch * (index + 0.5), y, z);
      }
    };

    // --- the curtain, and its parapet ---
    for (const curtain of CURTAINS) {
      const width = curtain.x1 - curtain.x0;
      const mid = (curtain.x0 + curtain.x1) / 2;
      put(box(width, curtain.top - curtain.base, WALL_D * 2, tapia), mid, curtain.base, WALL_Z);
      crenellate(
        curtain.x0,
        curtain.x1,
        curtain.top,
        WALL_Z + WALL_D - MERLON_D / 2,
        MERLON_D,
      );
    }

    // --- the towers ---
    for (const tower of TOWERS) {
      put(box(tower.hw * 2, tower.shaft - tower.base, tower.hd * 2, tapia), tower.x, tower.base, WALL_Z);

      // A string course a little proud of the shaft, just under the merlons. It
      // is one ink line straight across the tower, and it is what stops a tall
      // box from reading as a chimney.
      if (tower.cornice) {
        put(
          box(tower.hw * 2 + 1.1, 1.0, tower.hd * 2 + 1.1, tapia),
          tower.x,
          tower.shaft - 1.6,
          WALL_Z,
        );
      }

      crenellate(
        tower.x - tower.hw,
        tower.x + tower.hw,
        tower.shaft,
        WALL_Z + tower.hd - MERLON_D / 2,
        MERLON_D,
      );

      if (tower.flanks) {
        // One merlon on each flank, set back from the front row so the corner is
        // not a solid block. Rotated by building the box the other way round
        // rather than by turning a group: it is a rectangle either way.
        for (const side of [-1, 1]) {
          put(
            box(MERLON_D, MERLON_H, MERLON_W, tapia),
            tower.x + side * (tower.hw - MERLON_D / 2),
            tower.shaft,
            WALL_Z - tower.hd + MERLON_W / 2 + 0.6,
          );
        }
      }

      // A hipped tile roof rising out of the crenellations. On the Comares
      // tower this is what the Hall of the Ambassadors is under, and it is the
      // one pointed thing on the whole ridge.
      if (tower.roof > 0) {
        const pitch = new THREE.Group();
        pitch.add(taper(1, 0.3, tower.roof - (tower.shaft - 0.1), tile, 4));
        pitch.scale.set(tower.hw - 0.2, 1, tower.hd - 0.2);
        pitch.position.set(tower.x, tower.shaft - 0.1, WALL_Z);
        group.add(pitch);
      }
    }

    // --- the palaces behind the parapet ---
    for (const palace of PALACES) {
      put(box(palace.w, palace.top - palace.base, palace.d, tapia), palace.x, palace.base, palace.z);
      const roof = new THREE.Group();
      roof.add(taper(1, palace.ridge, palace.apex - (palace.top - 0.2), tile, 4));
      roof.scale.set(palace.w / 2 + 0.6, 1, palace.d / 2 + 0.6);
      roof.position.set(palace.x, palace.top - 0.2, palace.z);
      group.add(roof);
    }

    // --- openings ---
    // Each sits half inside the wall and pokes 0.15 proud, which is all the ink
    // outline needs to draw a frame round it.
    for (const opening of OPENINGS) {
      put(box(opening.hw * 2, opening.h, 0.7, dark), opening.x, opening.y, opening.z - 0.2);
    }

    // --- the Vela's bell-cote ---
    for (const side of [-1, 1]) {
      put(box(0.9, 3.0, 1.0, tapia), BELL_X + side * 1.25, BELL_BASE, WALL_Z);
    }
    put(box(3.4, 1.1, 1.0, tapia), BELL_X, BELL_BASE + 3.0, WALL_Z);
    // The bell itself, dark in the opening: without it the two posts and the
    // lintel read as a gap in a parapet rather than as an arch with something
    // hanging in it.
    put(box(0.9, 1.1, 0.7, dark), BELL_X, BELL_BASE + 1.5, WALL_Z + 0.2);

    // --- the wooded scarp ---
    for (const tree of CYPRESSES) {
      put(taper(tree.r, 0.14, tree.h, cypress, 6), tree.x, 0, tree.z);
    }

    return group;
  },
};

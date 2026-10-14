import type { Mesh, Monument, Object3D } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Colosseum.
 *
 * Read from across Rome by:
 * 1. Four storeys, the top one blind: three tiers of arches (Doric, Ionic,
 *    Corinthian) under a solid attic pierced by small square windows, a quarter
 *    of the wall's height (10.8 of 38.9). The piers run up it as pilasters.
 * 2. One side gone: the outer ring stands for 13 bays of 32 across the north
 *    (146 degrees); elsewhere the inner ring, two storeys of arcade, steps up
 *    toward the two ends where the outer wall breaks off.
 * 3. Two `clay` brick buttresses at the break: Stern's (east) a single sloping
 *    wedge, Valadier's (west) stepping down over three bays.
 * 4. Inside, a bowl of seats round an open hypogeum: the arena floor over the
 *    whole oval, a timber deck over the east end, over the rest a sunken grid of
 *    pale stone corridors (a long central gallery, two more either side, cross
 *    walls, and the curved service corridor), then the podium wall with its
 *    terrace and the cavea in steps (two ranks of the first maenianum, the
 *    balteus, the second maenianum) under the tall brick back wall, with
 *    vomitoria as dark doorways in the balteus and a gate at each end.
 *
 * A bay is two and a half real ones (32 round the ring, 13 standing): 80 arches
 * on three tiers would be 2,880 triangles of piers alone. At 32 bays an opening
 * is 5.6 wide by 7.8 (1.4 : 1 against 1.7 : 1). An arch head is a diamond: a
 * box turned 45 degrees about its depth, centred on the pier, whose lower flanks
 * chamfer the openings either side; the band above cuts it off 1.5 up, leaving
 * a flat 2.5 crown. 12 triangles a head, and no buried arc drawn across the
 * opening. The diamond's face is flush with the pier's, so only its flanks are
 * inked.
 *
 * Everything is built as ordinary pieces and drawn with `ctx.merge`, one mesh
 * per colour (the 56 arcade piers and heads are one draw call).
 *
 * Scale: built as a circle and squashed once (`OVAL`), an ellipse 100 by 83 at
 * the outer piers and 38.9 to the attic top, vertical 1.5x the plan. The long
 * axis is X; `placement.ts` turns +Z to north and +X to west, so the standing
 * arc is on +Z, Stern's buttress at -X and Valadier's at +X.
 *
 * Colour: `sand` travertine, toned down for the entablatures and further for the
 * attic; `clay` brick (buttresses, blocked arches, the cavea's back wall);
 * `bark` attic windows, vomitoria and gates. Arches look into brick core at 0.6
 * (a neutral reads as sky). The cavea alternates travertine and brick by rank;
 * the hypogeum is travertine walls over the same stone in shade (`sand` 0.74),
 * never brick; the deck is `apricot` toned down.
 *
 * Triangles: the outside costs 1,896 of 2,600, leaving 704: five `ringWall`s (the
 * podium and three ranks at 12 sides, the back wall at 16) and 16 boxes. Each
 * ring runs out under the next taller one (`LAP`), so only its tread and riser
 * show and no slit opens between differently sided polygons. The arena floor
 * and deck are boxes whose corners run in under the cavea.
 */

const TAU = Math.PI * 2;

/** Bays round the ring. See the header: set by the triangle cap and the arch proportion. */
const BAYS = 32;
const BAY = TAU / BAYS;
/** Bays of the outer ring still standing, centred on +Z (north). 13 of 32 is the real 31 of 80. */
const INTACT = 13;
const HALF_INTACT = (INTACT - 1) / 2;

/** Short axis against long: 156 m against 188. Applied as `scale.z` on the whole ring. */
const OVAL = 0.83;

// --- the outer wall, in the frame of one pier: z out, x along the ring ---
const FACE = 50;
const PIER_BACK = 47.2;
const PIER_WIDTH = 4.2;
/** Opening half-width at the face: half of the bay chord less a pier. 2.8. */
const ARCH_HALF = FACE * Math.sin(BAY / 2) - PIER_WIDTH / 2;
/** How far the diamond's flank climbs before the band cuts it off. */
const CHAMFER = 0.55 * ARCH_HALF;
/** Half-diagonal of the diamond: from the pier's corner to the band's underside, at 45 degrees. */
const HEAD = PIER_WIDTH / 2 + CHAMFER;

/** Entablature bands stand this far proud of the piers, so each storey ends on an ink line. */
const BAND_FACE = 50.35;
const BAND_BACK = 47.4;
const BAND = 2.0;

interface Storey {
  floor: number;
  /** Top of the straight jamb, where the head's chamfer starts. */
  spring: number;
}

/**
 * Doric, Ionic, Corinthian. Each storey is its jamb, `CHAMFER` of head, and a
 * `BAND` of entablature; the ground storey's jamb is the tallest, as in life.
 */
const STOREYS: Storey[] = [
  { floor: 0, spring: 6.3 },
  { floor: 9.84, spring: 15.6 },
  { floor: 19.14, spring: 24.6 },
];
const bandBottom = (storey: Storey): number => storey.spring + CHAMFER;
const storeyTop = (storey: Storey): number => bandBottom(storey) + BAND;

const ATTIC_BASE = storeyTop(STOREYS[2]!);
/** The piers stop here, and the attic runs on above them as a plain top course. */
const PIER_TOP = 38.2;
const ATTIC_TOP = 38.9;
/** The attic is set back from the pier line, so the piers run up it as pilasters. */
const ATTIC_FACE = 49.72;
const WINDOW_WIDTH = 1.5;
const WINDOW_HEIGHT = 2.4;
const WINDOW_Y = 31.8;

// --- the inner ring, which is the outside of the building wherever the outer one fell ---
const INNER_FACE = 46.6;
const INNER_BACK = 43.8;
const INNER_PIER = 3.8;
/** The ground-storey vault over the ambulatory: the inner ring's band, and the outer ring's ceiling. */
const VAULT_INNER = INNER_BACK;
const VAULT_OUTER = 47.6;
const VAULT_SIDES = 16;

/** The brick core behind the inner arcade: what the arches look into, and the cavea's back wall. */
const CORE_INNER = 36.8;
const CORE_HEIGHT = 23;

/** Arena radius in the circle frame; squashed it is 44 by 36.5, the real 86 by 54 m made rounder. */
const ARENA = 22;
/**
 * The arena floor: the hypogeum's floor, and the least height any of the arena
 * stands at. Over a unit, because the land inside the plan stands up to about
 * that much over the model's bedding (`placement.ts`); at 0.3 the ground showed
 * green through the bowl.
 */
const PIT_FLOOR = 1.3;
/** The restored timber deck, over the east end up to this x (the circle frame's -X is east). */
const DECK_TOP = 3.6;
const DECK_EDGE = -10;
/** The hypogeum's walls stop under the deck's top, so the deck's edge is its own ink line. */
const WALL_TOP = 3.3;
const WALL = 1.0;
/** Where the walls end: the curved service corridor runs between here and the podium. */
const WALL_REACH = 20;
/** The long walls, either side of the axis: the central gallery is the pair at 2.4. */
const GALLERIES = [2.4, 7.6, 12.8];
/** Cross walls, each spanning both galleries on its side, cutting them into cells. */
const CROSS = [-2, 8];

/** The podium wall and its terrace, round the arena. */
const PODIUM = { inner: ARENA, top: 5.6 };
/**
 * The cavea, arena outward: two ranks of the first maenianum, then the balteus
 * and the second. Each ring runs `LAP` out under the next.
 */
const CAVEA = [
  { inner: 24.4, top: 8.0 },
  { inner: 28.4, top: 10.6 },
  { inner: 32.6, top: 14.6 },
];
const LAP = 1.6;
const RING_SIDES = 16;
/** The podium and the cavea: 12 sides, which is what the budget leaves (see the header). */
const SEAT_SIDES = 12;
/** Half a side, which puts a flat on each axis: the gate and the vomitoria stand on them. */
const FLAT_ON_AXES = Math.PI / SEAT_SIDES;

export const colosseum: Monument = {
  id: 'colosseum',
  name: 'Colosseum',
  iso: 'ITA',
  lat: 41.8902,
  lon: 12.4922,
  realHeight: 48,
  tier: 'building',
  footprint: 52,

  build(ctx) {
    const { THREE, palette, tone, box, taper, ringWall } = ctx;
    const travertine = palette.sand;
    const entablature = tone(palette.sand, 0.9);
    const attic = tone(palette.sand, 0.86);
    const inner = tone(palette.sand, 0.95);
    const unlit = palette.bark;
    const brick = tone(palette.clay, 0.88);
    const core = tone(palette.clay, 0.6);
    const vaulting = tone(palette.tan, 1.08);
    const seats = [tone(palette.sand, 0.86), tone(palette.clay, 0.8), tone(palette.sand, 0.8)];
    const stone = tone(palette.sand, 0.97);
    const pit = tone(palette.sand, 0.74);
    const timber = tone(palette.apricot, 0.82);

    const draft = new THREE.Group();
    // Built as a circle and squashed once. The scale sits on a group with no
    // rotation and every piece turns inside its own pivot (S * R).
    const oval = new THREE.Group();
    oval.scale.z = OVAL;
    draft.add(oval);

    /** Pieces stood in the frame of a bay or a pier, turned round to `angle`. */
    const radial = (angle: number, ...pieces: Object3D[]): void => {
      const pivot = new THREE.Group();
      pivot.rotation.y = angle;
      pivot.add(...pieces);
      oval.add(pivot);
    };
    /** A box standing on `base`, spanning `back` to `face` out from the axis. */
    const slab = (width: number, base: number, top: number, back: number, face: number, color: number): Mesh => {
      const mesh = box(width, top - base, face - back, color);
      mesh.position.set(0, base, (face + back) / 2);
      return mesh;
    };
    /** Chord of one bay at radius `r`: how wide a straight piece has to be to span it. */
    const chord = (r: number): number => 2 * r * Math.sin(BAY / 2);

    // Pier j stands between bay j and bay j+1, so its angle is a half bay off
    // the bays'. Bay 0 is centred on +Z.
    const pierAngle = (j: number): number => (j + 0.5) * BAY;
    const bayAngle = (k: number): number => k * BAY;

    // --- the outer wall: 14 piers, 13 bays -----------------------------------
    for (let j = -HALF_INTACT - 1; j <= HALF_INTACT; j++) {
      const pieces: Object3D[] = [slab(PIER_WIDTH, 0, PIER_TOP, PIER_BACK, FACE, travertine)];

      // One head a storey over this pier: a box in a group turned 45 degrees
      // about the radial axis, standing on its own centre.
      for (const storey of STOREYS) {
        const side = HEAD * Math.SQRT2;
        const diamond = box(side, side, FACE - PIER_BACK, travertine);
        diamond.position.y = -side / 2;
        const turn = new THREE.Group();
        turn.rotation.z = Math.PI / 4;
        turn.position.set(0, bandBottom(storey), (FACE + PIER_BACK) / 2);
        turn.add(diamond);
        pieces.push(turn);
      }
      radial(pierAngle(j), ...pieces);
    }

    for (let k = -HALF_INTACT; k <= HALF_INTACT; k++) {
      const pieces: Object3D[] = [];
      for (const storey of STOREYS) {
        pieces.push(
          slab(chord(BAND_FACE) + 0.05, bandBottom(storey), storeyTop(storey), BAND_BACK, BAND_FACE, entablature),
        );
      }
      pieces.push(slab(chord(ATTIC_FACE), ATTIC_BASE, ATTIC_TOP, BAND_BACK, ATTIC_FACE, attic));

      // One window a bay: the real attic has one every other bay, and a bay
      // here is two and a half real ones.
      const opening = box(WINDOW_WIDTH, WINDOW_HEIGHT, 0.3, unlit);
      opening.position.set(0, WINDOW_Y, ATTIC_FACE - 0.07);
      pieces.push(opening);
      radial(bayAngle(k), ...pieces);
    }

    // --- where the outer wall breaks off -------------------------------------
    // In a pier's own frame +X is the way the angle grows, so past the east end
    // (negative angles) is local -X and past the west end local +X. The brick
    // infill starts `PROUD` in front of the piers' back face and stops `PROUD`
    // under the attic's base.
    const blockedBack = PIER_BACK + PROUD;
    const blockedTop = ATTIC_BASE - PROUD;
    const blockedWidth = chord(FACE) - PIER_WIDTH + 0.2;
    const blockedAt = ARCH_HALF + PIER_WIDTH / 2;

    // Stern's buttress: one wedge of brick on the east end, a four-sided taper
    // thinned through the wall by a parent carrying only scale (S * R). The last
    // standing bay has its arches bricked up.
    {
      const thin = new THREE.Group();
      thin.scale.z = 0.42;
      thin.position.set(-3.6, 0, 48.2);
      thin.add(taper(6.4, 1.1, 33, brick, 4));
      const blocked = slab(blockedWidth, 0, blockedTop, blockedBack, FACE - 0.3, brick);
      blocked.position.x = blockedAt;
      radial(pierAngle(-HALF_INTACT - 1), thin, blocked);
    }

    // Valadier's buttress: the arcade carried on in brick, cut down in steps,
    // with the last travertine bay's arches filled.
    {
      const blocked = slab(blockedWidth, 0, blockedTop, blockedBack, FACE - 0.3, brick);
      blocked.position.x = -blockedAt;
      const upper = slab(5.2, 0, storeyTop(STOREYS[2]!) + 0.8, blockedBack, FACE - 0.1, brick);
      upper.position.x = 4.5;
      const lower = slab(4.4, 0, storeyTop(STOREYS[1]!), PIER_BACK - 0.4, FACE - 0.5, brick);
      lower.position.x = 9.2;
      const foot = slab(3.6, 0, storeyTop(STOREYS[0]!) - 1.5, PIER_BACK - 0.8, FACE - 1.1, brick);
      foot.position.x = 12.9;
      radial(pierAngle(HALF_INTACT), blocked, upper, lower, foot);
    }

    // --- the inner ring: the outside of the south half ------------------------
    // Piers where the outer ring is gone, with a ragged top that climbs toward the ends.
    const brokenPiers = BAYS - INTACT + 1;
    for (let n = 0; n < brokenPiers; n++) {
      // 0 at either end of the broken arc, 1 in the middle.
      const middle = Math.sin((Math.PI * n) / (brokenPiers - 1));
      const ragged = [0, 2.6, 0.8, 4.1, 1.5, 0.2, 3.2][n % 7]!;
      const top = 19.4 + (1 - middle) * 7.5 + ragged;
      radial(pierAngle(HALF_INTACT + n), slab(INNER_PIER, 0, top, INNER_BACK, INNER_FACE, inner));
    }

    // The ground-storey vault over the ambulatory, one full ring: on the south the
    // inner ring's band, proud of its piers; on the north the ceiling seen through
    // the arches. Its twin a storey up was cut for the triangles. `PROUD` inside
    // the band at top and bottom, so it shares no plane with the outer bands.
    const vault = ringWall(VAULT_INNER, VAULT_OUTER, BAND - 2 * PROUD, vaulting, VAULT_SIDES);
    vault.position.y = bandBottom(STOREYS[0]!) + PROUD;
    oval.add(vault);

    // What the arches look into: on the south the ruined upper cavea behind the
    // arcade; inside, the brick back wall over the top rank. Dark and warm.
    oval.add(ringWall(CORE_INNER, INNER_BACK, CORE_HEIGHT, core, RING_SIDES));

    // --- the podium and the cavea ---------------------------------------------
    // The podium and every other rank are turned half a side, so a flat faces each
    // axis; the ranks between are not, so no two corners line up.
    {
      const podium = ringWall(PODIUM.inner, CAVEA[0]!.inner + LAP, PODIUM.top, travertine, SEAT_SIDES);
      podium.rotation.y = FLAT_ON_AXES;
      oval.add(podium);
    }
    CAVEA.forEach((rank, index) => {
      const outer = (CAVEA[index + 1]?.inner ?? CORE_INNER) + LAP;
      const ring = ringWall(rank.inner, outer, rank.top, seats[index]!, SEAT_SIDES);
      ring.rotation.y = index % 2 === 0 ? FLAT_ON_AXES : 0;
      oval.add(ring);
    });

    // The vomitoria: two dark doorways in the balteus, the riser of the second
    // maenianum, at the ends of the short axis, proud of the riser with the foot buried.
    {
      const balteus = CAVEA[2]!;
      const below = CAVEA[1]!.top;
      const flat = balteus.inner * Math.cos(FLAT_ON_AXES);
      for (const turn of [0, Math.PI]) {
        const door = box(2.6, balteus.top - 1.0 - (below - 0.5), 0.5, unlit);
        door.position.set(0, below - 0.5, flat - 0.25 + 2 * PROUD);
        const pivot = new THREE.Group();
        pivot.rotation.y = turn;
        pivot.add(door);
        oval.add(pivot);
      }
    }

    // --- the arena ------------------------------------------------------------
    // One box under the whole oval, corners running in under the cavea.
    oval.add(box(2 * ARENA + 2, PIT_FLOOR, 2 * ARENA + 2, pit));

    // The restored deck over the east end, its far edge under the podium.
    {
      const width = DECK_EDGE + ARENA + 1.5;
      const deck = box(width, DECK_TOP, 2 * ARENA + 3, timber);
      deck.position.x = DECK_EDGE - width / 2;
      oval.add(deck);
    }

    // The hypogeum: long walls either side of the axis, from under the deck to
    // the curved corridor at `WALL_REACH`, and cross walls through both galleries.
    const reach = (z: number): number => Math.sqrt(WALL_REACH * WALL_REACH - z * z);
    for (const z of GALLERIES) {
      const from = DECK_EDGE - 1;
      const to = reach(z + WALL / 2);
      for (const side of [-1, 1]) {
        const wall = box(to - from, WALL_TOP, WALL, stone);
        wall.position.set((from + to) / 2, 0, side * z);
        oval.add(wall);
      }
    }
    for (const x of CROSS) {
      const near = GALLERIES[0]!;
      const far = GALLERIES[GALLERIES.length - 1]!;
      for (const side of [-1, 1]) {
        const wall = box(WALL, WALL_TOP, far - near, stone);
        wall.position.set(x, 0, (side * (near + far)) / 2);
        oval.add(wall);
      }
    }

    // The two gates at the ends of the long axis: dark doorways standing proud
    // of the podium's flats. The east one rises out of the deck.
    for (const side of [-1, 1]) {
      const flat = PODIUM.inner * Math.cos(FLAT_ON_AXES);
      const gate = box(0.5, PODIUM.top - 1.0, 4.2, unlit);
      gate.position.x = side * (flat - 0.25 + 2 * PROUD);
      oval.add(gate);
    }

    return ctx.merge(draft);
  },
};

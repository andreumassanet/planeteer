import * as THREE from 'three';
import { PROUD, TONES, rolePaint, sceneryModel } from './scenery/contract.ts';
import type { RegionStyle, SceneryContext } from './scenery/contract.ts';
import { rngFrom } from './scenery/random.ts';
import type { Rng } from './scenery/random.ts';
import type { BodyKind } from './scenery/occupancy.ts';
import { solidTree, treeForm } from './scenery/tree-forms.ts';
import type { TreeForm } from './scenery/tree-forms.ts';
import { bodyPaint, isGlass } from './models.ts';
import { AVATAR_HEIGHT } from './stature.ts';
import { buildBench } from './bench.ts';
import { parkedModel } from './craft/parked.ts';
import { PALETTE } from './theme.ts';

/**
 * What stands in the country between the towns, as models: the barn and the
 * silo of a farmstead, the mills and the turbines, a lighthouse, the wayside
 * cross and its cousins round the world, a camp, a jetty, a cairn.
 *
 * **Not scenic parts, and the difference is the contract.** A part in
 * `scenery/parts/` is a thing a town builds dozens of, so it is held to six
 * variants a region that must not share a silhouette, and to its kind's caps.
 * Nothing here is built more than a handful of times in view: a lighthouse is
 * one on a headland, a wayside cross one at a bend. So a piece is built once a
 * region and a variant (`VARIANTS` below, three) and the rules that matter are
 * the ones that are about the *world* rather than about a street of copies:
 * the palette through `ctx.toon`, tones rather than flat boxes, `PROUD`
 * between two colours that would share a plane, standing on y = 0 and facing
 * +Z, and a triangle cap a piece (`PIECE_TRIANGLES`), which `pnpm country`
 * holds every build to.
 *
 * The farmhouse is not here: it is the region's own dwelling out of the scenic
 * kit (`countryside.ts` asks for one), which is what makes a farm in Japan a
 * machiya and one in Mali a round hut without a line of code saying so.
 *
 * **A rotor is not part of its tower.** Sails, blades and a windpump's wheel
 * turn, and a merged tile cannot move (see `countryside-motion.ts`), so a part
 * with a rotor says where its hub is (`rotor`) and draws none; `buildRotor`
 * makes the wheel on its own, facing +Z with its hub at the origin, for the
 * tile to merge standing still far away and for the moving mesh to turn near.
 */

/** Variants built of each piece a region: position, yaw and scale do the rest. */
export const COUNTRY_VARIANTS = 3;

/** The seed a variant is built from: the piece, the region, the variant, and nothing else. */
export function pieceRng(part: string, region: string, variant: number): Rng {
  return rngFrom('country-piece', part, region, variant);
}

/** The most triangles one piece may be. The heaviest is the lighthouse. */
export const PIECE_TRIANGLES = 420;

/** What turns. */
export type RotorKind = 'sails' | 'blades' | 'vanes';

/** How far each rotor reaches from its hub, in world units. */
export const ROTOR_RADIUS: Record<RotorKind, number> = {
  sails: 11,
  blades: 21,
  vanes: 1.9,
};

/** Turns a second, as a comic's wind blows: a mill slowly, a turbine a little faster, a windpump in a whirl. */
export const ROTOR_SPEED: Record<RotorKind, number> = {
  sails: 0.55,
  blades: 0.9,
  vanes: 2.6,
};

export interface CountryPart {
  id: string;
  /** Ground it takes, as a radius from its own axis: what plants and other pieces keep off. */
  footprint: number;
  /** A turning rotor's hub in the part's own frame (it faces +Z), and which rotor. */
  rotor?: { kind: RotorKind; x: number; y: number; z: number };
  /** A lighthouse's lamp, over the part's base. */
  beacon?: { y: number };
  /** Where a fire smokes, over the part's base. */
  smoke?: { y: number };
  /** Stands over water: a jetty's far end, a moored boat. Its base is not the ground's. */
  afloat?: boolean;
  /**
   * What it is to a body walking into it (`scenery/occupancy.ts`): walls
   * measured off its triangles unless it says otherwise. A tree is its trunk;
   * what floats is walked onto from the land, and is nothing.
   */
  body?: BodyKind;
  /** A triangle cap of its own, over `PIECE_TRIANGLES`: a baked model that is only ever near. */
  cap?: number;
  build(ctx: SceneryContext, rng: Rng, style: RegionStyle): THREE.Group;
  /** A tree's whole form (`tree-forms.ts`), when `build` is its `solidTree`: a near tile draws its cards. */
  form?(rng: Rng, style: RegionStyle): TreeForm;
}

// ---------------------------------------------------------------------------
// A few shapes the context does not have
// ---------------------------------------------------------------------------

/** A mesh placed, for building a draft in one expression. */
function at<T extends THREE.Object3D>(object: T, x: number, y: number, z: number, yaw = 0): T {
  object.position.set(x, y, z);
  object.rotation.y = yaw;
  return object;
}

/**
 * A cylinder lying along X, its lowest line on y = 0: a hay bale, a log.
 * The column is stood up and turned a quarter about Z, which is a rotation and
 * so keeps its winding.
 */
function lying(ctx: SceneryContext, radius: number, length: number, color: number, sides = 8): THREE.Group {
  const mesh = ctx.column(radius, length, color, sides);
  mesh.rotation.z = -Math.PI / 2;
  mesh.position.set(-length / 2, radius, 0);
  const group = new ctx.THREE.Group();
  group.add(mesh);
  return group;
}

/** The first of a list that is not one of `avoid`, so a trim is never the wall it trims. */
function other(rng: Rng, list: readonly number[], avoid: readonly number[]): number {
  const choices = list.filter((c) => !avoid.includes(c));
  return rng.pick(choices.length > 0 ? choices : list);
}

// ---------------------------------------------------------------------------
// The farmstead
// ---------------------------------------------------------------------------

/**
 * A barn: a long shed with its gable to the front and a big door in it. In
 * North America it is red with white trim, which is the one barn everybody can
 * name; elsewhere it is the region's own timber or render under its own roof.
 */
const barn: CountryPart = {
  id: 'barn',
  footprint: 8.2,
  build(ctx, rng, style) {
    const { THREE, box, roof, tone, strut } = ctx;
    const group = new THREE.Group();
    const american = style.id === 'north-america';
    // Timber or render, but never the white its trim is picked out in.
    const timbers = [...style.trim, ...style.walls].filter((c) => c !== PALETTE.white && c !== PALETTE.cream);
    const wall = american ? PALETTE.red : rng.pick(timbers.length > 0 ? timbers : style.walls);
    const tile = rng.pick(style.roofs);
    const trim = american ? PALETTE.white : other(rng, [PALETTE.white, PALETTE.cream, ...style.trim], [wall]);
    const width = rng.range(8.2, 9.6);
    const depth = rng.range(11.5, 13.5);
    const height = rng.range(4.6, 5.8);
    const pitch = Math.max(0.55, Math.min(1.05, style.pitch + 0.2));
    const rise = pitch * (width / 2 + 0.6);

    group.add(box(width + PROUD * 2, 0.6, depth + PROUD * 2, tone(wall, TONES.course)));
    group.add(box(width, height, depth, wall));
    group.add(at(box(width + PROUD * 2, 0.36, depth + PROUD * 2, tone(wall, TONES.eave)), 0, height - 0.36, 0));
    // The roof's ridge runs front to back, so the gable is the front.
    const lid = roof(depth + 1.2, width + 1.2, rise, depth + 1.2, tile);
    lid.rotation.y = Math.PI / 2;
    lid.position.y = height;
    group.add(lid);
    // The big door, proud of the wall, with its white brace across it.
    const doorWidth = width * 0.46;
    const doorHeight = Math.min(height * 0.82, 4.4);
    const face = depth / 2;
    group.add(at(box(doorWidth, doorHeight, 0.16, tone(wall, TONES.cap)), 0, 0, face + 0.08));
    const brace = trim;
    group.add(strut(new THREE.Vector3(-doorWidth / 2, 0.2, face + 0.2), new THREE.Vector3(doorWidth / 2, doorHeight - 0.2, face + 0.2), 0.18, brace));
    group.add(strut(new THREE.Vector3(doorWidth / 2, 0.2, face + 0.24), new THREE.Vector3(-doorWidth / 2, doorHeight - 0.2, face + 0.24), 0.18, brace));
    group.add(at(box(doorWidth + 0.4, 0.22, 0.2, brace), 0, doorHeight, face + 0.1));
    // The loft hatch in the gable.
    if (rng.chance(0.7)) group.add(at(box(1.4, 1.3, 0.14, tone(wall, TONES.eave)), 0, height + 0.3, face + 0.07));
    // A lean-to down one side, on some.
    if (rng.chance(0.45)) {
      const side = rng.sign();
      const lean = box(3.2, height * 0.62, depth * 0.7, tone(wall, TONES.light));
      group.add(at(lean, side * (width / 2 + 1.6), 0, -depth * 0.1));
      const shed = roof(depth * 0.7 + 0.6, 3.8, 0.9, depth * 0.7 + 0.6, tone(tile, TONES.cap));
      shed.rotation.y = Math.PI / 2;
      shed.position.set(side * (width / 2 + 1.6), height * 0.62, -depth * 0.1);
      group.add(shed);
    }
    return group;
  },
};

/** A silo: a steel or render drum with bands round it and a cap. */
const silo: CountryPart = {
  id: 'silo',
  footprint: 2.6,
  build(ctx, rng, style) {
    const { THREE, column, dome, tone } = ctx;
    const group = new THREE.Group();
    const drum = rng.pick([PALETTE.white, PALETTE.cream, PALETTE.slate, ...style.walls.filter((c) => c !== PALETTE.red)]);
    const radius = rng.range(1.7, 2.3);
    const height = rng.range(9, 13);
    group.add(column(radius, height, drum, 10));
    for (const share of [0.3, 0.7]) group.add(at(column(radius + PROUD, 0.45, tone(drum, TONES.cap), 10), 0, height * share, 0));
    group.add(at(dome(radius + 0.1, radius * 0.8, rng.pick([PALETTE.steel, PALETTE.slate, ...style.roofs]), 10, 2), 0, height, 0));
    return group;
  },
};

/** A round bale of hay, lying on its side. */
const hayBale: CountryPart = {
  id: 'hay-bale',
  footprint: 1.2,
  build(ctx, rng) {
    const { THREE, column, tone } = ctx;
    const group = new THREE.Group();
    const straw = rng.pick([PALETTE.gold, PALETTE.apricot, PALETTE.sand]);
    const radius = rng.range(0.8, 1);
    const length = rng.range(1.2, 1.5);
    group.add(lying(ctx, radius, length, tone(straw, 0.92), 10));
    // The two faces a shade lighter, standing proud of the drum's ends.
    const face = (x: number): THREE.Mesh => {
      const disc = column(radius * 0.86, PROUD, tone(straw, TONES.light), 10);
      disc.rotation.z = -Math.PI / 2;
      disc.position.set(x, radius, 0);
      return disc;
    };
    group.add(face(length / 2), face(-length / 2 - PROUD));
    return group;
  },
};

/**
 * A tractor, parked in its yard: **the fleet's own** (`craft/cars.ts`,
 * Kenney's, Car Kit, CC0), which anybody can drive off, and **at the fleet's
 * own size**. It stood at the traffic's width (0.70 of the craft) until
 * 2026-10-01, and the one taken grew by half again under the driver as the
 * fleet built it. A tile merges the look its id decides
 * (`countryside-tile.ts`, `craft/parked.ts`) and the fleet takes it from
 * there; this build, a look off `rng`, is for the kit's own checks and sheets.
 * The craft is 6.6 long and 4.1 wide, so the yard it takes is its half
 * diagonal.
 */
const tractor: CountryPart = {
  id: 'tractor',
  footprint: 3.9,
  // Kenney's is 908, and it is under the legibility floor of every tile but the finest.
  cap: 910,
  build(_ctx, rng) {
    const model = parkedModel('tractor');
    if (model === null) throw new Error("countryside: the fleet's tractor needs the traffic kit registered");
    const holder = new THREE.Group();
    holder.add(model.build(rng.int(model.variants)));
    return holder;
  },
};

/**
 * A windpump: a lattice tower with a wheel of vanes and a tail, over a round
 * tank. The farm's own mill in Australia, the prairies, the pampas and the Karoo.
 */
const windpump: CountryPart = {
  id: 'windpump',
  footprint: 3.2,
  rotor: { kind: 'vanes', x: 0, y: 11.4, z: 1.3 },
  build(ctx, rng) {
    const { THREE, box, strut, ringWall, column, tone } = ctx;
    const group = new THREE.Group();
    const steel = PALETTE.steel;
    const top = 10.6;
    const legs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [x, z] of legs) {
      group.add(strut(new THREE.Vector3(x * 1.5, 0, z * 1.5), new THREE.Vector3(x * 0.35, top, z * 0.35), 0.16, steel));
    }
    // Two rings of bracing.
    for (const y of [3.2, 7]) {
      const r = 1.5 - (1.15 * y) / top;
      for (let i = 0; i < 4; i++) {
        const [x0, z0] = legs[i]!;
        const [x1, z1] = legs[(i + 1) % 4]!;
        group.add(strut(new THREE.Vector3(x0 * r, y, z0 * r), new THREE.Vector3(x1 * r, y, z1 * r), 0.12, tone(steel, TONES.light)));
      }
    }
    group.add(at(box(0.8, 0.8, 1.6, tone(steel, TONES.cap)), 0, top, 0.2));
    // The tail vane that turns it into the wind, off the back.
    group.add(at(box(0.1, 1.5, 2.6, PALETTE.white), 0, top + 0.1, -1.9));
    // The tank beside it.
    const tank = rng.pick([PALETTE.slate, PALETTE.steel, PALETTE.tan]);
    const side = rng.sign() * 3.4;
    group.add(at(ringWall(2, 2.3, 1.1, tank, 12), side, 0, 0.6));
    group.add(at(column(2, 0.9, tone(PALETTE.skyBlue, 0.8), 12), side, 0, 0.6));
    return group;
  },
};

// ---------------------------------------------------------------------------
// Landmarks of the land
// ---------------------------------------------------------------------------

/**
 * A tower mill: a tapering body, a gallery round it where the miller turns the
 * cap, and the cap with the sails' hub out of its front. Dark thatch and white
 * sails in the Low Countries; a white drum and a dark cap in La Mancha and on
 * the Greek islands; weathered timber in the east.
 */
const windmill: CountryPart = {
  id: 'windmill',
  footprint: 6.5,
  rotor: { kind: 'sails', x: 0, y: 15.6, z: 3.8 },
  build(ctx, rng, style) {
    const { THREE, taper, ringWall, box, tone, column } = ctx;
    const group = new THREE.Group();
    const low = style.id === 'atlantic-europe' || style.id === 'nordic';
    const east = style.id === 'east-europe';
    const body = low ? rng.pick([PALETTE.darkOlive, PALETTE.bark, PALETTE.brown]) : east ? PALETTE.brown : PALETTE.white;
    const cap = low ? PALETTE.darkOlive : east ? PALETTE.bark : rng.pick([PALETTE.steel, PALETTE.bark, PALETTE.slate]);
    const trim = low ? PALETTE.white : east ? PALETTE.cream : rng.pick([PALETTE.skyBlue, PALETTE.bark, PALETTE.clay]);
    const sides = low ? 8 : 12;
    const height = 13.6;
    // A stone base for the smock mills, a plinth course for the drums.
    if (low) group.add(taper(3.9, 3.6, 3, tone(PALETTE.brown, TONES.course), sides));
    else group.add(taper(3.4 + PROUD, 3.3 + PROUD, 0.7, tone(body, TONES.course), sides));
    group.add(at(taper(low ? 3.55 : 3.3, 2.35, height - (low ? 3 : 0), body, sides), 0, low ? 3 : 0, 0));
    if (low) group.add(at(ringWall(3.5, 5.2, 0.35, tone(PALETTE.bark, TONES.cap), sides), 0, 3.4, 0));
    // Cap: a cone or an onion of a hood, and the windshaft's box out front.
    group.add(at(taper(2.6, low ? 0.9 : 0.4, 3.2, cap, sides), 0, height, 0));
    group.add(at(box(1.2, 1.2, 2.6, tone(cap, TONES.cap)), 0, height + 1.4, 2.4));
    // A door and two windows up the front: the door in the stone base of a
    // smock mill, and each window on the face of the taper at its own height.
    const foot = low ? 3 : 0;
    const bottom = low ? 3.55 : 3.3;
    const faceAt = (y: number): number => bottom - ((bottom - 2.35) * (y - foot)) / (height - foot);
    group.add(at(box(1.3, 2.3, 0.2, trim), 0, 0, (low ? 3.9 : 3.3) + 0.02));
    for (const y of [5.6, 9.4]) group.add(at(box(0.8, 1.1, 0.16, tone(trim, TONES.cap)), 0, y, faceAt(y + 1.1) + 0.02));
    if (rng.chance(0.4)) group.add(at(column(0.3, 1, trim, 6), 0, height + 3.2, 0));
    return group;
  },
};

/** A wind turbine: a white tower, the nacelle, and the three blades on their own (`buildRotor`). */
const turbine: CountryPart = {
  id: 'turbine',
  footprint: 4,
  rotor: { kind: 'blades', x: 0, y: 49.2, z: 3.4 },
  build(ctx) {
    const { THREE, taper, box, tone } = ctx;
    const group = new THREE.Group();
    const white = PALETTE.white;
    group.add(taper(2.3, 2.3, 1.2, tone(PALETTE.bone, TONES.course), 8));
    group.add(at(taper(1.45, 0.75, 47.6, white, 10), 0, 1.2, 0));
    group.add(at(box(2, 2, 5.2, tone(white, TONES.light)), 0, 48.2, 0.3));
    return group;
  },
};

/**
 * A lighthouse: a tower in bands, a gallery, the lantern, and a keeper's house
 * at its foot. Red and white round the Atlantic and the Pacific, all white on
 * the Mediterranean, black and white in the north.
 */
const lighthouse: CountryPart = {
  id: 'lighthouse',
  footprint: 7,
  beacon: { y: 19.9 },
  build(ctx, rng, style) {
    const { THREE, taper, ringWall, column, box, roof, dome, tone, lit } = ctx;
    const group = new THREE.Group();
    const band =
      style.id === 'mediterranean' || style.id === 'maghreb' || style.id === 'middle-east'
        ? PALETTE.white
        : style.id === 'nordic'
          ? PALETTE.steel
          : rng.pick([PALETTE.red, PALETTE.crimson]);
    const white = PALETTE.white;
    const sides = 10;
    const height = 18.4;
    const bands = 4;
    for (let i = 0; i < bands; i++) {
      const y0 = (height * i) / bands;
      const y1 = (height * (i + 1)) / bands;
      const r0 = 2.7 - (0.9 * y0) / height;
      const r1 = 2.7 - (0.9 * y1) / height;
      group.add(at(taper(r0, r1, y1 - y0, i % 2 === 0 ? white : band, sides), 0, y0, 0));
    }
    group.add(taper(2.9, 2.9, 0.8, tone(PALETTE.bone, TONES.course), sides));
    group.add(at(ringWall(1.6, 2.6, 0.35, PALETTE.steel, sides), 0, height, 0));
    group.add(at(lit(column(1.25, 2.3, tone(PALETTE.gold, 1.2), sides)), 0, height + 0.35, 0));
    group.add(at(dome(1.55, 1.4, band === PALETTE.white ? PALETTE.red : band, sides, 2), 0, height + 2.65, 0));
    // The keeper's house, against the tower's foot.
    const house = rng.pick(style.walls);
    group.add(at(box(5.2, 3.4, 4.4, house), 0, 0, -4.3));
    const lid = roof(5.8, 5, 1.8, 5.8, rng.pick(style.roofs));
    lid.position.set(0, 3.4, -4.3);
    group.add(lid);
    group.add(at(box(1, 2.2, 0.16, tone(house, TONES.cap)), 2, 0, -2.02));
    return group;
  },
};

// ---------------------------------------------------------------------------
// Wayside shrines, one per region's way of keeping one
// ---------------------------------------------------------------------------

/** A wayside cross on a stepped stone base: Europe and Latin America. */
const waysideCross: CountryPart = {
  id: 'wayside-cross',
  footprint: 1.6,
  build(ctx, rng, style) {
    const { THREE, box, tone } = ctx;
    const group = new THREE.Group();
    const stone = rng.pick(style.stone);
    const wood = rng.chance(0.5);
    const shaft = wood ? PALETTE.bark : tone(stone, TONES.light);
    group.add(box(1.5, 0.45, 1.5, tone(stone, TONES.course)));
    group.add(at(box(1.1, 0.5, 1.1, stone), 0, 0.45, 0));
    group.add(at(box(0.26, 3.4, 0.26, shaft), 0, 0.95, 0));
    group.add(at(box(1.5, 0.26, 0.26, shaft), 0, 3.3, 0));
    if (wood) {
      // A little gable over the arms, as the Alpine ones have.
      group.add(at(ctx.roof(1.9, 0.7, 0.4, 1.9, tone(PALETTE.bark, TONES.cap)), 0, 4.35, 0));
    }
    return group;
  },
};

/** A hermitage: a whitewashed chapel with a bell gable over its door. */
const chapel: CountryPart = {
  id: 'chapel',
  footprint: 5.2,
  build(ctx, rng, style) {
    const { THREE, box, roof, tone } = ctx;
    const group = new THREE.Group();
    const wall = rng.pick([PALETTE.white, PALETTE.cream, ...style.walls.filter((c) => c === PALETTE.sand || c === PALETTE.blush)]);
    const tile = rng.pick(style.roofs);
    const width = rng.range(4.6, 5.4);
    const depth = rng.range(6.6, 8);
    const height = rng.range(4, 4.8);
    group.add(box(width + PROUD * 2, 0.5, depth + PROUD * 2, tone(wall, TONES.course)));
    group.add(box(width, height, depth, wall));
    const lid = roof(depth + 0.6, width + 0.6, width * 0.35, depth + 0.6, tile);
    lid.rotation.y = Math.PI / 2;
    lid.position.y = height;
    group.add(lid);
    // The bell gable: a slab on the front, with its arch dark.
    group.add(at(box(width * 0.42, 2.2, 0.5, tone(wall, TONES.light)), 0, height + width * 0.2, depth / 2 - 0.25));
    group.add(at(box(0.7, 0.9, 0.12, rng.pick(style.glass)), 0, height + width * 0.2 + 0.8, depth / 2 + 0.06));
    group.add(at(box(1.3, 2.4, 0.16, rng.pick(style.trim)), 0, 0, depth / 2 + 0.08));
    return group;
  },
};

/** A torii and a stone lantern: the gate of a shrine that is not there, as in half of rural Japan. */
const torii: CountryPart = {
  id: 'torii',
  footprint: 3.6,
  build(ctx, rng) {
    const { THREE, column, box, tone } = ctx;
    const group = new THREE.Group();
    const red = rng.pick([PALETTE.red, PALETTE.orange, PALETTE.crimson]);
    const span = rng.range(4, 4.8);
    const height = rng.range(5, 5.8);
    for (const x of [-span / 2, span / 2]) {
      group.add(at(column(0.34, height, red, 8), x, 0, 0));
      group.add(at(column(0.44, 0.6, tone(PALETTE.bark, TONES.cap), 8), x, 0, 0));
    }
    // Nuki through the pillars, shimaki and the kasagi over them, which is the one mark it is known by.
    group.add(at(box(span + 1.2, 0.32, 0.32, red), 0, height * 0.72, 0));
    group.add(at(box(span + 2.2, 0.38, 0.62, red), 0, height, 0));
    group.add(at(box(span + 2.8, 0.34, 0.78, PALETTE.bark), 0, height + 0.38, 0));
    // A lantern beside the path.
    const stone = PALETTE.slate;
    const lx = span / 2 + 1.7;
    group.add(at(box(0.8, 0.3, 0.8, tone(stone, TONES.course)), lx, 0, 1.2));
    group.add(at(box(0.32, 1.2, 0.32, stone), lx, 0.3, 1.2));
    group.add(at(box(0.8, 0.6, 0.8, tone(stone, TONES.light)), lx, 1.5, 1.2));
    group.add(at(ctx.taper(0.62, 0.1, 0.5, tone(stone, TONES.cap), 4), lx, 2.1, 1.2));
    return group;
  },
};

/** A roadside shrine of China and Korea: a little tiled house on a plinth. */
const roadShrine: CountryPart = {
  id: 'road-shrine',
  footprint: 1.8,
  build(ctx, rng, style) {
    const { THREE, box, roof, tone } = ctx;
    const group = new THREE.Group();
    const stone = rng.pick(style.stone);
    const wall = rng.pick([PALETTE.red, PALETTE.crimson, ...style.walls]);
    group.add(box(2.2, 0.8, 1.8, tone(stone, TONES.course)));
    group.add(at(box(1.6, 1.5, 1.3, wall), 0, 0.8, 0));
    group.add(at(box(0.8, 0.9, 0.1, rng.pick(style.glass)), 0, 1, 0.7));
    group.add(at(roof(2.4, 2, 0.9, 1.2, rng.pick(style.roofs)), 0, 2.3, 0));
    return group;
  },
};

/** A chorten: the stepped base, the dome, the spire, in white and gold, where the Himalaya is. */
const chorten: CountryPart = {
  id: 'chorten',
  footprint: 3.2,
  build(ctx, rng) {
    const { THREE, box, dome, taper, blob, tone } = ctx;
    const group = new THREE.Group();
    const white = PALETTE.white;
    const gold = PALETTE.gold;
    const base = rng.range(4.2, 5);
    group.add(box(base, 0.9, base, tone(white, TONES.course)));
    group.add(at(box(base * 0.82, 0.8, base * 0.82, white), 0, 0.9, 0));
    group.add(at(box(base * 0.66, 0.6, base * 0.66, tone(white, TONES.light)), 0, 1.7, 0));
    group.add(at(dome(base * 0.34, base * 0.4, white, 10, 3), 0, 2.3, 0));
    const top = 2.3 + base * 0.4;
    group.add(at(box(0.9, 0.55, 0.9, tone(PALETTE.red, TONES.cap)), 0, top - 0.1, 0));
    group.add(at(taper(0.5, 0.12, 2.4, gold, 8), 0, top + 0.45, 0));
    group.add(at(blob(0.28, 0.5, tone(gold, TONES.light), 0), 0, top + 2.8, 0));
    return group;
  },
};

/**
 * Prayer flags: a line of them between two poles, in the five colours, the
 * way they hang off every pass and cairn from Ladakh to Bhutan.
 */
const prayerFlags: CountryPart = {
  id: 'prayer-flags',
  footprint: 5.5,
  build(ctx, rng) {
    const { THREE, column, box } = ctx;
    const group = new THREE.Group();
    const span = rng.range(8, 10);
    const high = rng.range(4, 5);
    group.add(at(column(0.12, high, PALETTE.bark, 6), -span / 2, 0, 0));
    group.add(at(column(0.12, high * 0.8, PALETTE.bark, 6), span / 2, 0, 0));
    const colours = [PALETTE.skyBlue, PALETTE.white, PALETTE.red, PALETTE.green, PALETTE.gold];
    const count = 10;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const x = -span / 2 + span * t;
      // The line sags: a parabola between the two tops.
      const y = high + (high * 0.8 - high) * t - Math.sin(Math.PI * t) * 0.8;
      group.add(at(box(0.55, 0.6, 0.05, colours[i % colours.length]!), x, y - 0.65, 0));
    }
    return group;
  },
};

/** A spirit house on its post: Thailand, Laos, Cambodia, Myanmar. */
const spiritHouse: CountryPart = {
  id: 'spirit-house',
  footprint: 1.4,
  build(ctx, rng, style) {
    const { THREE, box, column, roof, tone } = ctx;
    const group = new THREE.Group();
    const body = rng.pick([PALETTE.gold, PALETTE.red, PALETTE.white, PALETTE.cream]);
    const tile = rng.pick([PALETTE.red, PALETTE.crimson, PALETTE.gold, ...style.roofs]);
    group.add(column(0.2, 2.1, tone(PALETTE.white, TONES.course), 6));
    group.add(at(box(1.8, 0.2, 1.6, tone(body, TONES.cap)), 0, 2.1, 0));
    group.add(at(box(1.1, 0.9, 0.9, body), 0, 2.3, 0));
    group.add(at(box(0.5, 0.6, 0.08, PALETTE.bark), 0, 2.35, 0.49));
    group.add(at(roof(1.5, 1.3, 1, 0.9, tile), 0, 3.2, 0));
    return group;
  },
};

/** A marabout: a whitewashed cube under a dome, a saint's tomb in the Maghreb and the Middle East. */
const marabout: CountryPart = {
  id: 'marabout',
  footprint: 3.2,
  build(ctx, rng, style) {
    const { THREE, box, dome, tone } = ctx;
    const group = new THREE.Group();
    const wall = rng.pick([PALETTE.white, PALETTE.cream, PALETTE.sand]);
    const side = rng.range(3.8, 4.4);
    const height = rng.range(3.2, 3.8);
    group.add(box(side + PROUD * 2, 0.4, side + PROUD * 2, tone(wall, TONES.course)));
    group.add(box(side, height, side, wall));
    // Proud on top as well as round the sides, so the band's top is the roof and not a second colour in its plane.
    group.add(at(box(side + PROUD * 2, 0.35, side + PROUD * 2, tone(wall, TONES.light)), 0, height - 0.35 + PROUD, 0));
    group.add(at(dome(side * 0.42, side * 0.5, tone(wall, TONES.light), 10, 3), 0, height, 0));
    group.add(at(box(1.1, 2, 0.14, rng.pick(style.glass)), 0, 0, side / 2 + 0.07));
    return group;
  },
};

/** A small Hindu shrine: a plinth, a little shikhara in saffron, a pennant. */
const hinduShrine: CountryPart = {
  id: 'hindu-shrine',
  footprint: 1.8,
  build(ctx, rng) {
    const { THREE, box, taper, column, tone } = ctx;
    const group = new THREE.Group();
    const body = rng.pick([PALETTE.orange, PALETTE.salmon, PALETTE.red, PALETTE.white]);
    group.add(box(2.4, 0.5, 2.4, tone(PALETTE.bone, TONES.course)));
    group.add(at(box(1.5, 1.5, 1.5, body), 0, 0.5, 0));
    group.add(at(box(0.6, 1, 0.08, PALETTE.bark), 0, 0.5, 0.79));
    group.add(at(taper(0.9, 0.2, 1.8, tone(body, TONES.light), 4), 0, 2, 0));
    group.add(at(column(0.05, 1.3, PALETTE.bark, 4), 0.5, 2, 0.5));
    group.add(at(box(0.5, 0.35, 0.04, PALETTE.orange), 0.75, 2.9, 0.5));
    return group;
  },
};

// ---------------------------------------------------------------------------
// Old stones
// ---------------------------------------------------------------------------

/** One of a ring of standing stones: a slab, leaning a little. */
const standingStone: CountryPart = {
  id: 'standing-stone',
  footprint: 1,
  build(ctx, rng, style) {
    const { THREE, taper } = ctx;
    const group = new THREE.Group();
    const stone = rng.pick(style.stone);
    const slab = taper(rng.range(0.6, 0.8), rng.range(0.35, 0.5), rng.range(2.4, 3.8), stone, 4);
    slab.scale.set(1, 1, 0.55);
    const lean = new THREE.Group();
    lean.rotation.z = rng.range(-0.09, 0.09);
    lean.add(slab);
    group.add(lean);
    return group;
  },
};

/** A column of a ruined temple, broken off, with a drum of it lying beside. */
const ruinColumn: CountryPart = {
  id: 'ruin-column',
  footprint: 2.6,
  build(ctx, rng) {
    const { THREE, column, box, tone } = ctx;
    const group = new THREE.Group();
    const stone = rng.pick([PALETTE.sand, PALETTE.cream, PALETTE.tan]);
    group.add(box(2.2, 0.5, 2.2, tone(stone, TONES.course)));
    const height = rng.range(2.4, 6.4);
    group.add(at(column(0.62, height, stone, 10), 0, 0.5, 0));
    if (height > 5) group.add(at(box(1.8, 0.5, 1.8, tone(stone, TONES.light)), 0, height + 0.5, 0));
    const drum = lying(ctx, 0.6, 1.1, tone(stone, 0.92), 10);
    drum.position.set(1.8, 0, rng.range(-0.5, 0.5));
    drum.rotation.y = rng.range(0, Math.PI);
    group.add(drum);
    return group;
  },
};

/** A stretch of fallen wall, stepped down where it broke. */
const ruinWall: CountryPart = {
  id: 'ruin-wall',
  footprint: 4.4,
  build(ctx, rng, style) {
    const { THREE, box, tone } = ctx;
    const group = new THREE.Group();
    const stone = rng.pick(style.stone.length > 0 ? style.stone : [PALETTE.tan]);
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const height = Math.max(0.8, rng.range(1.2, 3.6) * (1 - Math.abs(i - 1.2) * 0.18));
      group.add(at(box(2.05, height, 0.9, i % 2 === 0 ? stone : tone(stone, 0.9)), -3 + i * 2, 0, (i % 2) * 0.04));
    }
    group.add(at(box(1.2, 0.5, 0.8, tone(stone, TONES.cap)), rng.range(-2, 2), 0, 1.4, rng.range(0, 1)));
    return group;
  },
};

// ---------------------------------------------------------------------------
// Camps, the shore, the hills
// ---------------------------------------------------------------------------

/** A ridge tent, sized to the people who sleep in it rather than to the buildings. */
const tent: CountryPart = {
  id: 'tent',
  footprint: 2.9,
  build(ctx, rng) {
    const { THREE, roof, box, tone } = ctx;
    const group = new THREE.Group();
    const cloth = rng.pick([PALETTE.orange, PALETTE.red, PALETTE.skyBlue, PALETTE.green, PALETTE.gold]);
    const length = AVATAR_HEIGHT * rng.range(1.1, 1.3);
    const width = AVATAR_HEIGHT * rng.range(0.72, 0.82);
    // A ridge tent is a gable: the ridge along its length, which is Z.
    const ridge = roof(length, width, AVATAR_HEIGHT * rng.range(0.52, 0.6), length, cloth);
    ridge.rotation.y = Math.PI / 2;
    group.add(ridge);
    group.add(at(box(width * 0.36, AVATAR_HEIGHT * 0.34, 0.06, tone(cloth, TONES.eave)), 0, 0, length / 2 + 0.03));
    return group;
  },
};

/** A ger: a round felt tent with its low cone of a roof and a painted door. */
const ger: CountryPart = {
  id: 'ger',
  footprint: 3.6,
  build(ctx, rng) {
    const { THREE, column, taper, box, tone } = ctx;
    const group = new THREE.Group();
    const felt = PALETTE.white;
    const radius = rng.range(3, 3.4);
    const wall = 2.4;
    group.add(column(radius, wall, felt, 12));
    group.add(at(column(radius + PROUD, 0.35, tone(PALETTE.skyBlue, 0.9), 12), 0, wall * 0.68, 0));
    group.add(at(taper(radius + 0.25, 0.5, 1.6, tone(felt, TONES.light), 12), 0, wall, 0));
    group.add(at(box(1.1, 1.9, 0.12, rng.pick([PALETTE.orange, PALETTE.red])), 0, 0, radius + 0.04));
    return group;
  },
};

/** A nomad's tent: a long low black canopy, open at the front. */
const nomadTent: CountryPart = {
  id: 'nomad-tent',
  footprint: 4.2,
  build(ctx, rng) {
    const { THREE, roof, column, box } = ctx;
    const group = new THREE.Group();
    const cloth = rng.pick([PALETTE.bark, PALETTE.darkOlive, PALETTE.brown]);
    const width = rng.range(6.5, 7.6);
    const depth = rng.range(4.2, 5);
    const posts = 1.9;
    for (const x of [-width / 2 + 0.3, width / 2 - 0.3]) {
      for (const z of [-depth / 2 + 0.3, depth / 2 - 0.3]) group.add(at(column(0.1, posts, PALETTE.tan, 5), x, 0, z));
    }
    group.add(at(roof(width, depth, 0.9, width * 0.7, cloth), 0, posts, 0));
    // The back and sides let down to the ground.
    group.add(at(box(width, posts, 0.12, cloth), 0, 0, -depth / 2 + 0.06));
    return group;
  },
};

/** A campfire: a ring of stones, the logs, and the flame; `smoke` is where the smoke rises from. */
const campfire: CountryPart = {
  id: 'campfire',
  footprint: 1.4,
  smoke: { y: 0.7 },
  build(ctx, rng) {
    const { THREE, box, taper, tone } = ctx;
    const group = new THREE.Group();
    const stone = PALETTE.slate;
    group.add(
      ctx.around(7, (i) => {
        const s = box(0.4, 0.3, 0.3, i % 2 === 0 ? stone : tone(stone, TONES.light));
        s.position.z = 0.95;
        return s;
      }),
    );
    for (let i = 0; i < 3; i++) {
      const log = lying(ctx, 0.12, 1.3, PALETTE.bark, 5);
      log.rotation.y = (i / 3) * Math.PI + rng.range(-0.2, 0.2);
      log.position.y = i * 0.05;
      group.add(log);
    }
    group.add(at(taper(0.32, 0.02, 0.8, PALETTE.orange, 4), 0, 0.1, 0));
    group.add(at(taper(0.2, 0.02, 0.55, PALETTE.gold, 4), 0.05, 0.12, 0.05, 0.6));
    return group;
  },
};

/** A fishing hut: a timber shed with a net drying on a rack beside it. */
const fishingHut: CountryPart = {
  id: 'fishing-hut',
  footprint: 3.8,
  build(ctx, rng, style) {
    const { THREE, box, roof, column, tone } = ctx;
    const group = new THREE.Group();
    const wood = rng.pick([PALETTE.brown, PALETTE.bark, PALETTE.red, PALETTE.skyBlue, ...style.walls.slice(0, 2)]);
    const width = rng.range(3.6, 4.2);
    const depth = rng.range(4.2, 5);
    const height = rng.range(2.6, 3);
    group.add(box(width + PROUD * 2, 0.4, depth + PROUD * 2, tone(wood, TONES.course)));
    group.add(box(width, height, depth, wood));
    group.add(at(roof(width + 0.8, depth + 0.6, 1.4, width + 0.8, rng.pick(style.roofs)), 0, height, 0));
    group.add(at(box(1, 2, 0.14, tone(wood, TONES.cap)), 0, 0, depth / 2 + 0.07));
    // The net rack.
    const rack = width / 2 + 1.4;
    group.add(at(column(0.08, 1.7, PALETTE.bark, 4), rack, 0, -1), at(column(0.08, 1.7, PALETTE.bark, 4), rack, 0, 1.2));
    group.add(at(box(0.08, 1.1, 2.3, tone(PALETTE.tan, 0.9)), rack, 0.55, 0.1));
    return group;
  },
};

/**
 * A jetty: a plank deck on posts, running out along +Z over the water. Its
 * base is the land end's ground, and the deck stays level out to the end.
 */
const jetty: CountryPart = {
  id: 'jetty',
  footprint: 1.6,
  afloat: true,
  build(ctx, rng) {
    const { THREE, box, column, tone } = ctx;
    const group = new THREE.Group();
    const deck = rng.pick([PALETTE.brown, PALETTE.tan]);
    const length = 16;
    const width = rng.range(2, 2.6);
    group.add(at(box(width, 0.3, length, deck), 0, 0.3, length / 2 - 1));
    for (let i = 0; i < 4; i++) {
      const z = -0.5 + (i * (length - 1.5)) / 3;
      // Down past the sea's own level, which is the land end's step below it.
      for (const x of [-width / 2 - 0.1, width / 2 + 0.1]) group.add(at(column(0.16, 6.4, tone(PALETTE.bark, 1.1), 6), x, -5.8, z));
    }
    return group;
  },
};

/** A rowing boat moored off the jetty: Kenney's (Watercraft Kit, CC0). */
const rowboat: CountryPart = {
  id: 'rowboat',
  footprint: 1.8,
  afloat: true,
  build(ctx, rng) {
    const body = rng.pick([PALETTE.white, PALETTE.skyBlue, PALETTE.red, PALETTE.green]);
    // A little longer than the person who rows it.
    return ctx.fitted('boat-row-small', { radius: AVATAR_HEIGHT * 0.58, sink: 0.35 }, bodyPaint(sceneryModel('boat-row-small'), body, isGlass));
  },
};

/** A cairn: stones stacked by walkers, smaller up the pile. */
const cairn: CountryPart = {
  id: 'cairn',
  footprint: 1.4,
  build(ctx, rng, style) {
    const { THREE, blob, tone } = ctx;
    const group = new THREE.Group();
    const stone = rng.pick(style.stone);
    let y = 0;
    const count = rng.between(4, 5);
    for (let i = 0; i < count; i++) {
      const r = 1.15 * (1 - i * 0.18) * rng.range(0.9, 1.05);
      const h = r * rng.range(0.75, 0.95);
      const piece = blob(r, h, i % 2 === 0 ? stone : tone(stone, TONES.light), 0);
      piece.position.set(rng.range(-0.1, 0.1), y, rng.range(-0.1, 0.1));
      piece.rotation.y = rng.range(0, Math.PI);
      group.add(piece);
      y += h * 0.78;
    }
    return group;
  },
};

// ---------------------------------------------------------------------------
// Small things
// ---------------------------------------------------------------------------

/**
 * A bench, sized to the people who sit on it: `bench.ts`'s, whose seat is the
 * sitting clip's, so `E` beside it sits you down on the plank rather than on
 * the air over it.
 */
const bench: CountryPart = {
  id: 'bench',
  footprint: 1.6,
  build(ctx, rng) {
    const wood = rng.pick([PALETTE.brown, PALETTE.bark, PALETTE.green]);
    return buildBench(ctx, wood, PALETTE.steel, AVATAR_HEIGHT * 0.72, AVATAR_HEIGHT * rng.range(0.24, 0.3));
  },
};

/** A fingerpost at the roadside: the boards point along the road both ways. */
const signpost: CountryPart = {
  id: 'signpost',
  footprint: 1.2,
  build(ctx, rng) {
    const { THREE, column, box, tone } = ctx;
    const group = new THREE.Group();
    const post = rng.pick([PALETTE.white, PALETTE.bark, PALETTE.steel]);
    const board = rng.pick([PALETTE.white, PALETTE.cream, PALETTE.gold]);
    const height = AVATAR_HEIGHT * 0.95;
    group.add(column(0.12, height, post, 6));
    const boards = rng.between(2, 3);
    for (let i = 0; i < boards; i++) {
      const arm = box(1.9, 0.38, 0.08, i === 1 ? tone(board, TONES.light) : board);
      // Each board sticks out one way along X, and they point up and down the road.
      arm.position.set(i % 2 === 0 ? 0.95 : -0.95, height - 0.55 - i * 0.5, 0.1 * (i % 2 === 0 ? 1 : -1));
      const holder = new THREE.Group();
      holder.rotation.y = i === 2 ? Math.PI / 2 : 0;
      holder.add(arm);
      group.add(holder);
    }
    group.add(at(box(0.3, 0.14, 0.3, tone(post, TONES.cap)), 0, height, 0));
    return group;
  },
};

/** A few of Kenney's stones (Nature Kit, CC0) in the region's own rock. */
const rocks: CountryPart = {
  id: 'rocks',
  footprint: 3,
  build(ctx, rng, style) {
    const { THREE } = ctx;
    const group = new THREE.Group();
    const models = ['stone-largeA', 'stone-largeB', 'stone-largeC', 'stone-largeD'];
    const count = rng.between(3, 4);
    for (let i = 0; i < count; i++) {
      const id = rng.pick(models);
      const paint = rolePaint(sceneryModel(id), [[/stone|dirt|default/i, rng.pick(style.stone)], [/grass/i, rng.pick(style.foliage)]]);
      const stone = ctx.fitted(id, { height: rng.range(0.7, 1.9) * (i === 0 ? 1.3 : 1), radius: 1.5, yaw: rng.range(0, Math.PI * 2) }, paint);
      const angle = (i / count) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const reach = i === 0 ? 0 : rng.range(1.2, 1.6);
      stone.position.set(Math.cos(angle) * reach, -0.1, Math.sin(angle) * reach);
      group.add(stone);
    }
    return group;
  },
};

/** A date palm at an oasis (`tree-forms.ts`): fronds in the region's green on a brown trunk. */
const palmForm = (rng: Rng, style: RegionStyle): TreeForm =>
  treeForm('palm', rng, { height: rng.range(4.8, 6.2), reach: 1.95, leaf: rng.pick(style.foliage), leaf2: rng.pick(style.foliage), bark: PALETTE.brown });
const palm: CountryPart = {
  id: 'palm',
  footprint: 2,
  body: 'trunk',
  build: (ctx, rng, style) => solidTree(ctx, palmForm(rng, style)),
  form: palmForm,
};

/** An olive tree of a grove: a low, round crown in dusty green on a short trunk (`tree-forms.ts`). */
const oliveForm = (rng: Rng): TreeForm =>
  treeForm('broadleaf', rng, { height: rng.range(3.6, 4.6), reach: 2.15, leaf: rng.pick([PALETTE.olive, PALETTE.darkOlive]), leaf2: PALETTE.darkOlive, bark: PALETTE.bark });
const olive: CountryPart = {
  id: 'olive',
  footprint: 2.2,
  body: 'trunk',
  build: (ctx, rng) => solidTree(ctx, oliveForm(rng)),
  form: (rng) => oliveForm(rng),
};

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const COUNTRY_PARTS: Readonly<Record<string, CountryPart>> = Object.fromEntries(
  [
    barn, silo, hayBale, tractor, windpump,
    windmill, turbine, lighthouse,
    waysideCross, chapel, torii, roadShrine, chorten, prayerFlags, spiritHouse, marabout, hinduShrine,
    standingStone, ruinColumn, ruinWall,
    tent, ger, nomadTent, campfire, fishingHut, jetty, rowboat, cairn,
    bench, signpost, rocks, palm, olive,
  ].map((part) => [part.id, part]),
);

/**
 * A rotor on its own: hub at the origin, the wheel in the XY plane, facing
 * +Z. The tile merges it standing still far off; `countryside-motion.ts` turns
 * it near.
 */
export function buildRotor(ctx: Pick<SceneryContext, 'THREE' | 'box' | 'column' | 'taper' | 'tone'>, kind: RotorKind): THREE.Group {
  const { THREE, box, column, taper, tone } = ctx;
  const group = new THREE.Group();
  const radius = ROTOR_RADIUS[kind];
  const arm = (angle: number, piece: THREE.Object3D): void => {
    const holder = new THREE.Group();
    holder.rotation.z = angle;
    holder.add(piece);
    group.add(holder);
  };
  if (kind === 'sails') {
    // Four sails: the stock out from the hub and a lattice frame of canvas on it.
    for (let i = 0; i < 4; i++) {
      const sail = new THREE.Group();
      sail.add(at(box(0.32, radius, 0.3, PALETTE.bark), 0, 0, 0));
      sail.add(at(box(2.2, radius * 0.78, 0.14, PALETTE.white), 1.26, radius * 0.2, 0.08));
      sail.add(at(box(0.14, radius * 0.78, 0.2, tone(PALETTE.bark, TONES.light)), 2.3, radius * 0.2, 0.1));
      arm((i * Math.PI) / 2, sail);
    }
    const hub = column(0.6, 0.8, PALETTE.bark, 8);
    hub.rotation.x = Math.PI / 2;
    group.add(hub);
  } else if (kind === 'blades') {
    for (let i = 0; i < 3; i++) {
      const blade = taper(0.75, 0.18, radius, PALETTE.white, 4);
      blade.scale.set(1, 1, 0.32);
      blade.position.y = 0.4;
      arm((i * Math.PI * 2) / 3, blade);
    }
    const hub = taper(0.95, 0.2, 1.8, tone(PALETTE.white, TONES.light), 8);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = -0.5;
    group.add(hub);
  } else {
    // A windpump's wheel: eight vanes on a ring.
    for (let i = 0; i < 8; i++) {
      const vane = box(0.5, radius * 0.72, 0.06, i % 2 === 0 ? PALETTE.steel : tone(PALETTE.steel, TONES.light));
      vane.position.y = radius * 0.26;
      vane.rotation.y = 0.5;
      arm((i * Math.PI * 2) / 8, vane);
    }
    const hub = column(0.22, 0.5, PALETTE.steel, 6);
    hub.rotation.x = Math.PI / 2;
    group.add(hub);
  }
  return group;
}

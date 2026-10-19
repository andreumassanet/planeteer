/**
 * The boats a harbour keeps that nobody takes, each built in its own frame:
 * the bow along +z, the waterline at y = 0, the middle at the origin. Few
 * pieces each, so a port of a dozen stays a few thousand triangles; the
 * streamer bobs them in the shader (`material.ts`), the hull and its ink alike.
 *
 * Each also says where its bow and stern lines are made fast (`cleats`), for
 * the ropes to the bollards.
 */
import * as THREE from 'three';
import type { MonumentContext } from '../monuments/contract.ts';
import { PROUD } from '../scenery/contract/tones.ts';
import type { Rng } from '../scenery/random.ts';
import type { BoatKind } from './types.ts';
import type { HarbourStyle } from './style.ts';

export interface BoatModel {
  group: THREE.Group;
  /** Bow and stern cleats, in the boat's frame. */
  cleats: [THREE.Vector3, THREE.Vector3];
}

const put = <T extends THREE.Object3D>(object: T, x: number, y: number, z: number): T => {
  object.position.set(x, y, z);
  return object;
};

/**
 * A hull: a box for the stern and the waist, a squashed pyramid for the bow,
 * a stripe proud along both sides under the gunwale, and a floor of boards
 * inset on top. `draft` of it is under the water.
 */
function hull(ctx: MonumentContext, group: THREE.Group, length: number, beam: number, depth: number, draft: number, colour: number, stripe: number, floor: number): void {
  const { box, taper } = ctx;
  const body = length * 0.7;
  const tail = -length / 2 + body / 2;
  group.add(put(box(beam, depth, body, colour), 0, -draft, tail));
  const bow = taper(beam / 2, 0.05, length - body, colour, 4);
  bow.rotation.x = Math.PI / 2;
  bow.scale.set(1, 1, depth / beam);
  group.add(put(bow, 0, -draft + depth / 2, tail + body / 2));
  group.add(put(box(beam + PROUD * 2, Math.min(0.22, depth * 0.25), body - 0.2, stripe), 0, -draft + depth * 0.62, tail + 0.05));
  group.add(put(box(beam * 0.78, 0.06, body * 0.9, floor), 0, -draft + depth, tail + 0.1));
}

export function buildBoat(ctx: MonumentContext, kind: BoatKind, length: number, beam: number, style: HarbourStyle, rng: Rng): BoatModel {
  const { box, column, strut, tone, palette } = ctx;
  const group = new THREE.Group();
  const colour = rng.pick(style.hulls);
  let stripe = rng.pick(style.stripes);
  if (stripe === colour) stripe = tone(colour, 0.7);
  const wood = tone(palette.brown, 1.1);
  let freeboard = 0.5;

  switch (kind) {
    case 'rowboat': {
      const depth = 0.5;
      hull(ctx, group, length, beam, depth, 0.15, colour, stripe, wood);
      freeboard = depth - 0.15;
      group.add(put(box(beam * 0.84, 0.1, 0.3, tone(palette.brown, 0.9)), 0, freeboard, 0.1));
      group.add(strut(new THREE.Vector3(-0.2, freeboard + 0.12, -length * 0.3), new THREE.Vector3(-0.25, freeboard + 0.12, length * 0.25), 0.07, palette.tan));
      group.add(strut(new THREE.Vector3(0.2, freeboard + 0.12, -length * 0.3), new THREE.Vector3(0.25, freeboard + 0.12, length * 0.25), 0.07, palette.tan));
      break;
    }
    case 'fishing': {
      const depth = 1.5;
      hull(ctx, group, length, beam, depth, 0.5, colour, stripe, tone(palette.tan, 0.9));
      freeboard = depth - 0.5;
      // The wheelhouse aft of the middle, its windows a band proud of the front and sides, a roof over it.
      const house = rng.pick([palette.white, palette.cream, tone(colour, 1.2)]);
      const hw = beam * 0.62;
      const hl = length * 0.22;
      const hz = -length * 0.12;
      group.add(put(box(hw, 1.7, hl, house), 0, freeboard, hz));
      group.add(put(box(hw + PROUD * 2, 0.45, hl + PROUD * 2, tone(palette.slate, 0.9)), 0, freeboard + 1.0, hz));
      group.add(put(box(hw + 0.3, 0.14, hl + 0.3, rng.pick([palette.red, palette.steel, palette.skyBlue])), 0, freeboard + 1.7, hz));
      // The mast forward with its boom, a gallows aft, a net drum and a stack of fish boxes.
      group.add(put(column(0.08, 4.2, palette.bark, 6), 0, freeboard, length * 0.18));
      group.add(strut(new THREE.Vector3(0, freeboard + 2.6, length * 0.18), new THREE.Vector3(0, freeboard + 1.2, -length * 0.02), 0.08, palette.bark));
      group.add(strut(new THREE.Vector3(0, freeboard + 4.1, length * 0.18), new THREE.Vector3(0, freeboard + 0.1, length * 0.42), 0.03, palette.ink));
      group.add(put(box(beam * 0.7, 1.4, 0.18, palette.steel), 0, freeboard, -length * 0.42));
      const drum = column(0.38, beam * 0.5, palette.olive, 8);
      drum.rotation.z = Math.PI / 2;
      group.add(put(drum, beam * 0.25, freeboard + 0.42, -length * 0.3));
      group.add(put(box(0.7, 0.3, 0.5, rng.pick([palette.skyBlue, palette.red, palette.olive])), -beam * 0.18, freeboard, length * 0.06));
      group.add(put(box(0.7, 0.3, 0.5, rng.pick([palette.skyBlue, palette.red, palette.olive])), -beam * 0.18, freeboard + 0.3, length * 0.06 + 0.05));
      break;
    }
    case 'sailboat': {
      const depth = 1.1;
      hull(ctx, group, length, beam, depth, 0.4, rng.chance(0.7) ? palette.white : colour, stripe, tone(palette.tan, 1.1));
      freeboard = depth - 0.4;
      group.add(put(box(beam * 0.6, 0.55, length * 0.3, palette.white), 0, freeboard, -length * 0.02));
      group.add(put(box(beam * 0.6 + PROUD * 2, 0.18, length * 0.24, tone(palette.slate, 0.9)), 0, freeboard + 0.25, -length * 0.02));
      const mast = length * 1.25;
      group.add(put(column(0.07, mast, palette.bone, 6), 0, freeboard + 0.55, length * 0.1));
      // The boom aft with the mainsail furled along it under a cover.
      const boomY = freeboard + 1.6;
      group.add(strut(new THREE.Vector3(0, boomY, length * 0.1), new THREE.Vector3(0, boomY + 0.1, -length * 0.4), 0.08, palette.bone));
      group.add(strut(new THREE.Vector3(0, boomY + 0.2, length * 0.08), new THREE.Vector3(0, boomY + 0.25, -length * 0.36), 0.3, rng.pick([palette.skyBlue, palette.cream, palette.crimson])));
      // The forestay and the backstay.
      group.add(strut(new THREE.Vector3(0, freeboard + 0.55 + mast, length * 0.1), new THREE.Vector3(0, freeboard, length * 0.5), 0.03, palette.ink));
      group.add(strut(new THREE.Vector3(0, freeboard + 0.55 + mast, length * 0.1), new THREE.Vector3(0, freeboard, -length * 0.48), 0.03, palette.ink));
      break;
    }
    case 'yacht': {
      const depth = 1.6;
      hull(ctx, group, length, beam, depth, 0.5, palette.white, rng.pick([palette.skyBlue, palette.steel, palette.gold]), tone(palette.tan, 1.15));
      freeboard = depth - 0.5;
      const lower = length * 0.45;
      group.add(put(box(beam * 0.8, 1.2, lower, palette.white), 0, freeboard, -length * 0.08));
      group.add(put(box(beam * 0.8 + PROUD * 2, 0.4, lower - 0.6, tone(palette.slate, 0.85)), 0, freeboard + 0.55, -length * 0.06));
      group.add(put(box(beam * 0.6, 0.9, lower * 0.6, palette.white), 0, freeboard + 1.2, -length * 0.12));
      group.add(put(box(beam * 0.6 + PROUD * 2, 0.32, lower * 0.6 - 0.4, tone(palette.slate, 0.85)), 0, freeboard + 1.55, -length * 0.1));
      group.add(put(box(beam * 0.7, 0.12, lower * 0.5, palette.bone), 0, freeboard + 2.1, -length * 0.16));
      group.add(put(column(0.06, 1.6, palette.bone, 6), 0, freeboard + 2.22, -length * 0.16));
      break;
    }
    case 'sampan': {
      const depth = 0.6;
      hull(ctx, group, length, beam, depth, 0.2, tone(palette.brown, rng.range(0.85, 1.1)), stripe, tone(palette.brown, 1.2));
      freeboard = depth - 0.2;
      // The arched canopy of matting over the waist, its lower half inside the hull.
      const canopy = column(beam * 0.48, length * 0.34, rng.pick([palette.tan, palette.bark, palette.sand]), 8);
      canopy.rotation.x = Math.PI / 2;
      group.add(put(canopy, 0, freeboard - 0.05, -length * 0.2));
      group.add(strut(new THREE.Vector3(0.15, freeboard + 0.4, -length * 0.42), new THREE.Vector3(0.3, -0.3, -length * 0.75), 0.07, palette.tan));
      break;
    }
    case 'outrigger': {
      const canoe = beam * 0.32;
      hull(ctx, group, length, canoe, 0.55, 0.2, colour, stripe, wood);
      freeboard = 0.35;
      // The float out to one side and the two booms across to it.
      const side = beam / 2 - 0.15;
      const float = column(0.14, length * 0.55, tone(palette.brown, 0.9), 6);
      float.rotation.x = Math.PI / 2;
      group.add(put(float, side, 0, -length * 0.27));
      for (const z of [-length * 0.15, length * 0.12]) {
        group.add(strut(new THREE.Vector3(-canoe / 2, freeboard + 0.08, z), new THREE.Vector3(side, 0.08, z), 0.08, palette.tan));
      }
      break;
    }
  }
  const cleats: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(0, freeboard + 0.1, length * 0.42), new THREE.Vector3(0, freeboard + 0.1, -length * 0.46)];
  return { group, cleats };
}

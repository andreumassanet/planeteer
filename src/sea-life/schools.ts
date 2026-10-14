// The schools of fish and the lone cruisers (shark, ray, turtle) of one tile.

import type * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { PALETTE } from '../theme.ts';
import { seaDepthAt } from '../sea-floor.ts';
import type { Cruiser, School, TileLife } from '../sea-floor.ts';
import { hash3 } from '../weather.ts';
import type { SwimContext } from './context.ts';
import type { SwimmerMeshes } from './swimmers.ts';

/** How far a school or a cruiser is seen from, in units from the camera. */
const FISH_RANGE = 110;
const CRUISER_RANGE = 170;
/** Caps. */
export const MAX_FISH = 180;
export const MAX_CRUISERS = 6;


/** A school's colours by where it lives: the reef is bright, the cold water silver. */
const SCHOOL_COLOURS: Readonly<Record<School['zone'], readonly number[]>> = {
  reef: [PALETTE.gold, PALETTE.skyBlue, PALETTE.orange, PALETTE.violet, 0x4fd1c5, PALETTE.pink, PALETTE.apricot],
  meadow: [PALETTE.bone, 0xa9b4b8, PALETTE.olive, 0x8fa7b3],
  kelp: [PALETTE.bone, 0x9aa7ad, PALETTE.orange, 0x7b8a8f],
  barren: [PALETTE.bone, 0x8f9aa0],
};

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

export interface Schools {
  /** Starts a frame. */
  reset(): void;
  visitTile(tile: TileLife): void;
  fishCount(): number;
  schoolCount(): number;
}

export function createSchools(ctx: SwimContext, meshes: SwimmerMeshes): Schools {
  const { fish } = meshes;
  const cruiserMeshes = meshes.cruisers;
  const { home, at, ahead, forward, up, side, centre, heading, eye, colour, bigCount, clock, saw, frameAt, place, onRound } = ctx;
  let fishCount = 0;
  let schoolCount = 0;

  /** One tile's schools and big swimmers, as they are at the frame's time from `eye`. */
  function visitTile(tile: TileLife): void {
    const t = clock.now;
    const camera = eye;
    for (const school of tile.schools) {
      home.set(school.x, school.y, school.z);
      at.copy(home).multiplyScalar(PLANET_RADIUS - school.swim);
      if (at.distanceTo(camera) > FISH_RANGE + school.roam) continue;
      if (fishCount + 1 > MAX_FISH) break;
      schoolCount++;
      frameAt(home);
      onRound(school.seed, school.roam, school.speed, t, school.swim, Math.min(1.5, school.swim * 0.2));
      // The floor where the school is now, not where it lives: a round
      // that crosses a rise keeps over it.
      const local = seaDepthAt(at);
      at.setLength(clamp(at.length(), PLANET_RADIUS - local + 0.9, PLANET_RADIUS - 0.8));
      centre.copy(at);
      heading.copy(forward);
      const palette = SCHOOL_COLOURS[school.zone];
      colour.setHex(palette[Math.floor(school.tone * palette.length) % palette.length]!);
      const spread = 1.2 + school.count * 0.09;
      up.copy(centre).normalize();
      side.crossVectors(up, heading).normalize();
      for (let k = 0; k < school.count && fishCount < MAX_FISH; k++) {
        // A place in the school: a flattened ball about the centre, each
        // fish wobbling on its own and turned a little off the school's
        // heading as it does.
        const a = hash3(school.seed, k, 1) * Math.PI * 2;
        const r = spread * Math.sqrt(hash3(school.seed, k, 2));
        const wob = t * (1.3 + hash3(school.seed, k, 3)) + a;
        const lateral = Math.cos(a) * r + Math.sin(wob) * 0.25;
        const along = Math.sin(a) * r + Math.cos(wob * 0.7) * 0.25;
        const high = (hash3(school.seed, k, 4) - 0.5) * spread * 0.5 + Math.sin(wob * 1.1) * 0.15;
        ahead.copy(centre).addScaledVector(side, lateral).addScaledVector(heading, along).addScaledVector(up, high);
        // Kept in the water: under the surface and over the floor.
        const radius = ahead.length();
        const ceiling = PLANET_RADIUS - 0.5;
        const floor = PLANET_RADIUS - local + 0.4;
        ahead.setLength(clamp(radius, floor, ceiling));
        forward.copy(heading).addScaledVector(side, Math.sin(wob) * 0.25).normalize();
        place(fish, fishCount, ahead, forward, up, 1 + 0.35 * hash3(school.seed, k, 5));
        fish.setColorAt(fishCount, colour);
        fishCount++;
      }
      saw('school', centre);
    }
    for (const cruiser of tile.cruisers) swimCruiser(cruiser, camera, t);
  }

  function swimCruiser(cruiser: Cruiser, camera: THREE.Vector3, t: number): void {
    const mesh = cruiserMeshes[cruiser.kind];
    const index = bigCount[cruiser.kind]!;
    if (index >= MAX_CRUISERS) return;
    home.set(cruiser.x, cruiser.y, cruiser.z);
    at.copy(home).multiplyScalar(PLANET_RADIUS - cruiser.swim);
    if (at.distanceTo(camera) > CRUISER_RANGE + cruiser.roam) return;
    frameAt(home);
    onRound(cruiser.seed, cruiser.roam, cruiser.speed, t, cruiser.swim, cruiser.kind === 'ray' ? 0.3 : 1.2);
    // Kept over the floor it swims over, and under the surface.
    const floor = PLANET_RADIUS - seaDepthAt(at) + (cruiser.kind === 'ray' ? 0.35 : 1.2);
    at.setLength(clamp(at.length(), floor, PLANET_RADIUS - 1.2));
    up.copy(at).normalize();
    place(mesh, index, at, forward, up, 1);
    bigCount[cruiser.kind] = index + 1;
    saw(cruiser.kind, at);
  }


  return {
    reset() {
      fishCount = 0;
      schoolCount = 0;
    },
    visitTile,
    fishCount: () => fishCount,
    schoolCount: () => schoolCount,
  };
}

/**
 * A carriage's inside, for the car a player rides: floor, walls, ends and
 * ceiling as one lining facing in, windows of glass between the pillars, a
 * row of seats each side of the aisle, and townsfolk on some of them.
 *
 * The baked car is a closed shell with its windows painted on, so from inside
 * there is nothing to see through. While the eye is in the carriage the car's
 * own mesh is hidden and this stands in its place (`railway.ts`); from outside
 * the shell is drawn and this is not. That is the cabin contract's lining
 * (`craft/cabin.ts`): what the eye inside meets first is the lining's front or
 * the glass, never the back of a shell, and the glass writes no depth, takes
 * no ink and casts no shadow (`glassMaterial`). Built in the car's frame
 * (`rails/ride.ts`), so it rides the car's holder.
 */
import * as THREE from 'three';
import { craftContext, craftMaterial, geometryOf, glassMaterial, GLASS_TINT, soupOf } from '../craft/build.ts';
import { painted } from '../craft/cabin.ts';
import { tone } from '../monuments/contract.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import { CARRIAGE, SEAT_BACK, SEAT_DEPTH, SEAT_ROWS, SEAT_TOP, SEATS_PER_CAR, seatMiddle } from '../rails/ride.ts';

/** The lining's thickness, and a seat's. */
const SKIN = 0.15;
const CUSHION = 0.14;
const SEAT_WIDTH = 1;
const BACK_TALL = AVATAR_HEIGHT * 0.42;

/** The seat colours a consist's carriages are upholstered in, by the line's own roll. */
const UPHOLSTERY = [PALETTE.crimson, PALETTE.slate, PALETTE.green, PALETTE.clay] as const;

export interface Carriage {
  /** The lining, the glass, the seats and the passengers, in the car's frame. */
  group: THREE.Group;
  /** Over the floor, to the ceiling's lining. */
  readonly height: number;
  dispose(): void;
}

/** Where along a side the windows stand: one a row of seats, as `[from, to]` in `z`. */
export function windowRuns(): [number, number][] {
  return SEAT_ROWS.map((z) => [z + 0.3 - CARRIAGE.pane / 2, z + 0.3 + CARRIAGE.pane / 2]);
}

/**
 * A carriage `height` tall over its floor, upholstered by `roll` (0 to 1),
 * with `sitter(seat)` asked for whoever sits on each seat (null for nobody).
 */
export function buildCarriage(height: number, roll: number, sitter: (seat: number) => THREE.Object3D | null): Carriage {
  const { box } = craftContext();
  const lining = new THREE.Group();
  const panes = new THREE.Group();
  const { floor, half, end, sill, lintel } = CARRIAGE;
  const wall = PALETTE.cream;
  const trim = tone(PALETTE.bone, 0.85);
  const seatColour = UPHOLSTERY[Math.floor(roll * UPHOLSTERY.length) % UPHOLSTERY.length]!;
  const add = (into: THREE.Group, w: number, h: number, d: number, colour: number, x: number, y: number, z: number): void => {
    const piece = box(w, h, d, colour);
    piece.position.set(x, y, z);
    into.add(piece);
  };

  // The floor, the ceiling and the two ends, each a slab whose inner face is the lining.
  add(lining, 2 * (half + SKIN), SKIN, 2 * (end + SKIN), tone(PALETTE.bark, 1.25), 0, floor - SKIN, 0);
  add(lining, 2 * (half + SKIN), SKIN, 2 * (end + SKIN), tone(wall, 0.92), 0, floor + height, 0);
  for (const side of [1, -1]) add(lining, 2 * half, height, SKIN, trim, 0, floor, side * (end + SKIN / 2));
  // A lamp strip down the ceiling, standing proud of it.
  add(lining, 0.5, 0.08, 2 * end - 1, PALETTE.white, 0, floor + height - 0.08 - 0.02, 0);

  // The sides: a band under the windows, one over them, and the pillars between.
  const runs = windowRuns();
  for (const side of [1, -1]) {
    const x = side * (half + SKIN / 2);
    add(lining, SKIN, sill, 2 * (end + SKIN), wall, x, floor, 0);
    add(lining, SKIN, height - lintel, 2 * (end + SKIN), wall, x, floor + lintel, 0);
    // The sides run to the ends' outer faces, so the corners are closed.
    let from = -end - SKIN;
    for (const [a, b] of [...runs, [end + SKIN, end + SKIN] as [number, number]]) {
      if (a - from > 0.01) add(lining, SKIN, lintel - sill, a - from, trim, x, floor + sill, (from + a) / 2);
      if (b > a) add(panes, SKIN * 0.4, lintel - sill, b - a, GLASS_TINT, x, floor + sill, (a + b) / 2);
      from = b;
    }
    // A luggage rack over each side, proud of the wall.
    add(lining, 0.7, 0.08, 2 * end - 0.6, tone(PALETTE.steel, 1.3), side * (half - 0.35 - 0.02), floor + lintel + 0.25, 0);
  }

  // The seats: a cushion whose top is the sitting clip's thighs, a pedestal, a back.
  const middle = new THREE.Vector3();
  for (let seat = 0; seat < SEATS_PER_CAR; seat++) {
    seatMiddle(seat, middle);
    add(lining, SEAT_WIDTH, CUSHION, SEAT_DEPTH, seatColour, middle.x, middle.y - CUSHION, middle.z);
    add(lining, SEAT_WIDTH * 0.5, SEAT_TOP - CUSHION, 0.3, tone(PALETTE.steel, 1.1), middle.x, floor, middle.z);
    add(lining, SEAT_WIDTH, BACK_TALL, 0.14, tone(seatColour, 0.85), middle.x, middle.y - CUSHION, middle.z - SEAT_BACK - 0.07);
  }

  // Whoever rides with you: a seated townsperson, hips on the cushion, back to the
  // seat, merged into the lining so they are lit by the cabin's material.
  for (let seat = 0; seat < SEATS_PER_CAR; seat++) {
    const person = sitter(seat);
    if (person === null) continue;
    seatMiddle(seat, middle);
    person.position.set(middle.x, middle.y + 0.04, middle.z - SEAT_DEPTH * 0.15);
    lining.add(person);
  }

  const group = new THREE.Group();
  group.name = 'carriage';
  const inside = new THREE.Mesh(geometryOf([soupOf(lining)]), craftMaterial());
  inside.name = 'cabin';
  const glass = new THREE.Mesh(geometryOf([painted(soupOf(panes), GLASS_TINT)]), glassMaterial());
  glass.name = 'glass';
  for (const part of [inside, glass]) {
    part.castShadow = false;
    part.receiveShadow = false;
    group.add(part);
  }
  disposeBoxes(lining);
  disposeBoxes(panes);

  return {
    group,
    height,
    dispose() {
      inside.geometry.dispose();
      glass.geometry.dispose();
      group.removeFromParent();
    },
  };
}

/** The pieces' own geometries, once merged; the context's materials are shared and stay. */
function disposeBoxes(group: THREE.Group): void {
  group.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).geometry.dispose();
  });
}

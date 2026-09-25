/**
 * The parachute a body opens after jumping out of an aircraft in flight
 * (`player.ts`): a ram-air canopy of seven cells on an arc over the head, in
 * alternating colours so the cells read, on four lines to the harness.
 *
 * **Built like a craft and drawn like one**: the monument context's boxes and
 * struts, merged into one soup with the colour on the vertices and the ink's
 * normal beside the fill's (`build.ts`), so the canopy is one draw call and
 * one hull. It hangs in the player's own frame, soles at the origin, +Z the
 * way the body faces, and its chord runs along it: a canopy flies forward.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import { assemble, craftContext, soupOf } from './build.ts';

const H = AVATAR_HEIGHT;
/** How many cells the canopy is, and the arc they lie on: its radius, and its half-angle. */
const CELLS = 7;
const ARC = 2.2 * H;
const SPAN = 0.9;
/** The canopy's crown over the soles, its chord, and its thickness. */
const CROWN = 3.6 * H;
const CHORD = 1.3 * H;
const THICK = 0.16 * H;
/** Where the lines meet the harness: the shoulders, over the soles. */
const HARNESS = 0.78 * H;
const LINE = 0.012 * H;
const COLOURS = [PALETTE.red, PALETTE.cream, PALETTE.gold, PALETTE.cream] as const;

/** A fresh canopy, with its lines, in the player's frame. */
export function buildParachute(): THREE.Group {
  const ctx = craftContext();
  const draft = new THREE.Group();
  const centre = new THREE.Vector3(0, CROWN - ARC, 0);
  const cellWidth = 2 * ARC * Math.sin(SPAN / CELLS) * 1.04;
  const ends: THREE.Vector3[] = [];
  for (let i = 0; i < CELLS; i++) {
    const angle = -SPAN + (2 * SPAN * (i + 0.5)) / CELLS;
    // A box stands on y = 0: a holder centres it on its own middle, then
    // lays it on the arc, turned so its top faces out from the centre.
    const cell = ctx.box(cellWidth, THICK, CHORD, COLOURS[i % COLOURS.length]!);
    cell.position.y = -THICK / 2;
    const holder = new THREE.Group();
    holder.add(cell);
    holder.position.set(centre.x + Math.sin(angle) * ARC, centre.y + Math.cos(angle) * ARC, 0);
    holder.rotation.z = -angle;
    draft.add(holder);
    if (i === 0 || i === CELLS - 1) {
      // The outer cells' undersides, fore and aft: where the lines go.
      const under = ARC - THICK / 2;
      for (const z of [CHORD * 0.3, -CHORD * 0.3]) ends.push(new THREE.Vector3(centre.x + Math.sin(angle) * under, centre.y + Math.cos(angle) * under, z));
    }
  }
  for (const end of ends) {
    const shoulder = new THREE.Vector3(Math.sign(end.x) * 0.22 * H, HARNESS, 0);
    draft.add(ctx.strut(shoulder, end, LINE, PALETTE.ink));
  }
  return assemble('parachute', [soupOf(draft)]);
}

/** Seconds the canopy takes to open out. */
export const CANOPY_OPENING = 0.6;

/**
 * A canopy `seconds` after it began to open, swung `lean` radians: width
 * first, as a canopy fills from the middle out. The player's own and a
 * peer's are opened by this one law.
 */
export function openCanopy(canopy: THREE.Object3D, seconds: number, lean: number): void {
  const opened = Math.min(1, Math.max(0.15, seconds / CANOPY_OPENING));
  canopy.scale.set(opened, Math.sqrt(opened), opened);
  canopy.rotation.set(0, 0, lean);
}

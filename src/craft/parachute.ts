/**
 * The parachute a body opens after jumping out of an aircraft in flight
 * (`player.ts`): a ram-air canopy over the head, its cells a gradient from a
 * gold centre to crimson tips, on fans of lines to the two hands.
 *
 * **A wing, not a row of boxes.** Each cell is a closed shell through three
 * ribs that stand on radii of the arc the span is bent round, so neighbours
 * share a rib exactly and leave no wedge between them; the section is an
 * airfoil, thick and blunt at the nose and thin at the tail, and the rib in
 * the middle of a cell is a little deeper than the two at its ends, which is
 * the pillow every ram-air cell blows up into and gives the pen one line a
 * rib. Each shell's winding is checked by its signed volume (`signedVolume`),
 * as every lofted shell in this world is.
 *
 * **The lines end in the hands.** The body under it holds the toggles at
 * `CHUTE_GRIP` (`avatar.ts`'s `skydive` puts each hand there), so the canopy,
 * its lines and the hands are one figure; the whole hangs from the grip, and
 * opening it out and swinging it in a turn are both about that point
 * (`openCanopy`), as `player.ts` swings the body.
 *
 * **Built like a craft and drawn like one**: merged into one soup with the
 * colour on the vertices (`build.ts`), so the canopy is one draw call and one
 * hull. It hangs in the player's own frame, soles at the origin, +Z the way
 * the body faces, and its chord runs along it: a canopy flies forward.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import { assemble, craftContext, signedVolume, soupOf } from './build.ts';

const H = AVATAR_HEIGHT;
/**
 * Where each hand holds its toggle, in the player's frame, the left hand's
 * (+X is the body's left; the right is mirrored): at the height of the
 * brow, a little ahead of the face and outside the shoulders, which the
 * cast's arm reaches with the elbow bent (`pnpm craft` holds both wrists on
 * it). At 1.04 of the height, the first guess, the arm was straight and still
 * 0.24 short.
 */
export const CHUTE_GRIP: readonly [number, number, number] = [0.13 * H, 0.95 * H, 0.04 * H];
/**
 * How far a toggle comes down at a full turn: the hand on the turn's side
 * pulls its steering line from the brow to the chest, and a little forward
 * (a quarter of it). `avatar.ts`'s `skydive` moves the hand and
 * `openCanopy` the line, by this one number.
 */
export const CHUTE_PULL = 0.22 * H;
/** How many cells the canopy is, and the arc they lie on: its radius, and its half-angle. */
const CELLS = 9;
const ARC = 2.4 * H;
const SPAN = 0.62;
/** The canopy's crown over the soles, its chord at the centre, and its depth. */
const CROWN = 3.5 * H;
const CHORD = 1.35 * H;
const THICK = 0.2 * H;
/** How much shorter the chord is at the tips, and how much deeper a cell's middle rib is than its ends. */
const TIP_CHORD = 0.78;
const PILLOW = 1.18;
const LINE = 0.014 * H;
/** Where along the chord the lines meet the canopy's underside, fore to aft, as shares of the chord. */
const LINE_ROWS = [0.32, 0.02, -0.3] as const;
/** Centre to tip: gold, apricot, orange, red, crimson. */
const COLOURS = [PALETTE.gold, PALETTE.apricot, PALETTE.orange, PALETTE.red, PALETTE.crimson] as const;

/**
 * The section, nose at +t: (along the chord, over the arc) in shares of the
 * chord and of the depth. The underside is nearly flat and the top is the
 * curve, thickest a quarter back from the nose.
 */
const AIRFOIL: readonly (readonly [number, number])[] = [
  [0.5, 0.18],
  [0.42, 0.72],
  [0.22, 1.0],
  [-0.02, 0.92],
  [-0.24, 0.66],
  [-0.4, 0.34],
  [-0.5, 0.06],
  [-0.3, -0.02],
  [0, -0.06],
  [0.3, -0.05],
  [0.46, 0.0],
];

/** The arc's centre: the crown is its top. */
const CENTRE_Y = CROWN - ARC;

/** A point of the canopy: at span angle `phi`, `t` along the chord and `h` over the arc. */
function canopyPoint(phi: number, t: number, h: number, out: THREE.Vector3): THREE.Vector3 {
  const r = ARC + h;
  return out.set(Math.sin(phi) * r, CENTRE_Y + Math.cos(phi) * r, t);
}

/** The chord at span angle `phi`: full at the centre, `TIP_CHORD` of it at the tips. */
const chordAt = (phi: number): number => CHORD * (1 - (1 - TIP_CHORD) * (phi / SPAN) ** 2);

/** One cell between span angles `a` and `b`, as a closed, outward-wound shell. */
function cell(a: number, b: number, color: number): THREE.Mesh {
  const ribs = [a, (a + b) / 2, b].map((phi, i) => {
    const chord = chordAt(phi);
    const depth = THICK * (i === 1 ? PILLOW : 1) * (chord / CHORD);
    return AIRFOIL.map(([t, h]) => canopyPoint(phi, t * chord, h * depth - THICK * 0.1, new THREE.Vector3()));
  });
  const n = AIRFOIL.length;
  const p: number[] = [];
  const tri = (u: THREE.Vector3, v: THREE.Vector3, w: THREE.Vector3): void => {
    p.push(u.x, u.y, u.z, v.x, v.y, v.z, w.x, w.y, w.z);
  };
  for (let r = 0; r + 1 < ribs.length; r++) {
    const A = ribs[r]!;
    const B = ribs[r + 1]!;
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      tri(A[j]!, A[k]!, B[k]!);
      tri(A[j]!, B[k]!, B[j]!);
    }
  }
  // The end ribs, fanned from their middle: the section is convex enough for it.
  for (const [ring, facing] of [[ribs[0]!, -1], [ribs[2]!, 1]] as const) {
    const middle = ring.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(n);
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      if (facing > 0) tri(middle, ring[j]!, ring[k]!);
      else tri(middle, ring[k]!, ring[j]!);
    }
  }
  // Wound whichever way the section and the span made it: turned out if it came in.
  if (signedVolume(p) < 0) {
    for (let i = 0; i < p.length; i += 9) {
      for (let c = 0; c < 3; c++) {
        const swap = p[i + 3 + c]!;
        p[i + 3 + c] = p[i + 6 + c]!;
        p[i + 6 + c] = swap;
      }
    }
  }
  if (!(signedVolume(p) > 0)) throw new Error('parachute: a cell is wound inside out');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, craftContext().toon(color));
}

/**
 * A fresh canopy, with its lines, in the player's frame: a holder at the
 * grip's height with the canopy hung under it in its place, so that
 * `openCanopy` opens and swings it about the hands.
 */
export function buildParachute(): THREE.Group {
  const ctx = craftContext();
  const draft = new THREE.Group();
  const half = Math.floor(CELLS / 2);
  const step = (2 * SPAN) / CELLS;
  for (let i = 0; i < CELLS; i++) {
    const colour = COLOURS[Math.min(COLOURS.length - 1, Math.abs(i - half))]!;
    draft.add(cell(-SPAN + i * step, -SPAN + (i + 1) * step, colour));
  }
  // The lines: from every rib's underside, three rows along the chord, to the
  // hand on its side.
  const under = new THREE.Vector3();
  const left = new THREE.Vector3(...CHUTE_GRIP);
  const right = new THREE.Vector3(-CHUTE_GRIP[0], CHUTE_GRIP[1], CHUTE_GRIP[2]);
  for (let r = 0; r <= CELLS; r++) {
    const phi = -SPAN + r * step;
    const chord = chordAt(phi);
    for (const row of LINE_ROWS) {
      canopyPoint(phi, row * chord, -THICK * 0.12, under);
      draft.add(ctx.strut((phi >= 0 ? left : right).clone(), under.clone(), LINE, PALETTE.ink));
    }
  }
  const shell = assemble('parachute', [soupOf(draft)]);
  // The steering lines, from each tip's trailing edge to its hand: what a
  // pull turns. Each its own mesh on a pivot at the canopy, laid down its -Y
  // and turned and stretched to wherever the hand has pulled it
  // (`openCanopy`).
  const toggles: Toggle[] = [];
  for (const side of [1, -1] as const) {
    canopyPoint(side * SPAN, -0.5 * chordAt(SPAN), 0, under);
    const length = under.distanceTo(side > 0 ? left : right);
    const line = new THREE.Group();
    line.add(ctx.strut(new THREE.Vector3(), new THREE.Vector3(0, -length, 0), LINE, PALETTE.white));
    const pivot = new THREE.Group();
    pivot.name = 'toggle';
    pivot.position.copy(under);
    pivot.add(assemble('toggle-line', [soupOf(line)]));
    shell.add(pivot);
    toggles.push({ pivot, side, length });
  }
  shell.userData.toggles = toggles;
  // Hung under a holder at the grip, so the canopy opens and swings about the hands.
  const holder = new THREE.Group();
  holder.name = 'parachute';
  holder.position.y = CHUTE_GRIP[1];
  shell.position.y = -CHUTE_GRIP[1];
  holder.add(shell);
  return holder;
}

/** A steering line: its pivot at the canopy, which side's hand it ends in, and its length at rest. */
interface Toggle {
  pivot: THREE.Group;
  side: 1 | -1;
  length: number;
}

/** Seconds the canopy takes to open out. */
export const CANOPY_OPENING = 0.6;
/**
 * The canopy breathing in flight: its span and its depth swell and ease by
 * these shares, out of step, at `BREATH_RATE` Hz; a ram-air wing is a bag
 * of air the wind keeps topping up, never a rigid shell.
 */
const BREATH_SPAN = 0.012;
const BREATH_DEPTH = 0.03;
const BREATH_RATE = 0.45;

const DOWN = new THREE.Vector3(0, -1, 0);
const toHand = new THREE.Vector3();

/**
 * A canopy `seconds` after it began to open, swung `lean` radians about the
 * hands and pitched `pitch` about them: width first, as a canopy fills from
 * the middle out, and breathing once it has. `turn`, -1 to 1 and positive to
 * the right, is how far a toggle is pulled — the right one for a right turn —
 * and its line follows the hand down (`CHUTE_PULL`). The player's own and a
 * peer's are opened by this one law.
 */
export function openCanopy(canopy: THREE.Object3D, seconds: number, lean: number, turn = 0, pitch = 0): void {
  const opened = Math.min(1, Math.max(0.15, seconds / CANOPY_OPENING));
  const filled = Math.max(0, Math.min(1, (seconds - CANOPY_OPENING) / CANOPY_OPENING));
  const breath = seconds * BREATH_RATE * Math.PI * 2;
  const span = 1 + Math.sin(breath) * BREATH_SPAN * filled;
  const depth = 1 + Math.sin(breath * 1.3 + 1.2) * BREATH_DEPTH * filled;
  canopy.scale.set(opened * span, Math.sqrt(opened) * depth, opened);
  canopy.rotation.set(pitch, 0, lean);
  const shell = canopy.children[0];
  const toggles = shell?.userData.toggles as Toggle[] | undefined;
  if (shell === undefined || toggles === undefined) return;
  for (const toggle of toggles) {
    // The hand in the shell's frame, the player's own: the grip, pulled.
    const pulled = Math.max(0, toggle.side < 0 ? turn : -turn) * CHUTE_PULL;
    toHand.set(toggle.side * CHUTE_GRIP[0], CHUTE_GRIP[1] - pulled, CHUTE_GRIP[2] + pulled * 0.25).sub(toggle.pivot.position);
    const length = toHand.length();
    toggle.pivot.quaternion.setFromUnitVectors(DOWN, toHand.divideScalar(length));
    // Stretched along its own length, under the turn: `T * R * S`.
    toggle.pivot.scale.set(1, length / toggle.length, 1);
  }
}

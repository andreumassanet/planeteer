import * as THREE from 'three';
import { mergeMeshes } from './merge.ts';
import { ROOM_METRE, retone } from './interior-plan.ts';
import type { InteriorPlan, Item, ItemKind, Opening } from './interior-plan.ts';
import type { SceneryContext } from './scenery/contract.ts';
import { rngFrom } from './scenery/random.ts';
import type { Rng } from './scenery/random.ts';
import { PALETTE } from './theme.ts';

/**
 * A plan (`interior-plan.ts`) as geometry: one merged buffer for the room and
 * everything in it, and one small buffer of glass.
 *
 * **Built from the kit's own helpers, in the world's own pen.** Every piece is
 * boxes, prisms and blobs off `SceneryContext`, coloured only from the
 * palette and its tones, faceted, and merged by colour into vertex bytes by
 * `mergeMeshes` — the path a town and a monument take — so a room is one draw
 * call with its ink and the glass a second with none. Nothing is scaled and
 * every turn is a rotation about +Y, so no matrix here is a reflection, and
 * `mergeMeshes`' rewinding never has to fire (`build` asserts it).
 *
 * **Coplanar faces of two colours are a z-fight in one merged mesh**, so a
 * pattern on a floor or a wall stands proud of it — boards, tiles and a dado
 * are all a hair of height over what they cover — and that is also what gives
 * a board its ink line.
 *
 * **The glass is separate because it is not lit.** A window shows the hour
 * outside: its vertices carry white for clear glass, cream for paper and a
 * pane's own colour for stained glass, and the material's colour is set each
 * frame from the daylight (`interiors.ts`). It draws no ink.
 */

const M = ROOM_METRE;
/** How far a pattern stands proud of what it covers: enough for depth, and for the pen. */
const PROUD = 0.03;
/** The walls' thickness, which only the doorway and the window reveals show. */
export const WALL = 0.5;

type Builder = (k: SceneryContext, item: Item, g: THREE.Group, rng: Rng) => void;

function put<T extends THREE.Object3D>(g: THREE.Object3D, mesh: T, x: number, y: number, z: number, ry = 0): T {
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  g.add(mesh);
  return mesh;
}

/** A box whose centre is at `(x, z)` and whose base is at `y`. */
const box = (k: SceneryContext, g: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, ry = 0): THREE.Mesh =>
  put(g, k.box(Math.max(0.01, w), Math.max(0.01, h), Math.max(0.01, d), color), x, y, z, ry);

const col = (k: SceneryContext, g: THREE.Object3D, r: number, h: number, color: number, x: number, y: number, z: number, sides = 8): THREE.Mesh =>
  put(g, k.column(Math.max(0.01, r), Math.max(0.01, h), color, sides), x, y, z);

/** Four legs under a top `w` by `d`, `h` tall, `t` thick, inset `inset`. */
function legs(k: SceneryContext, g: THREE.Object3D, w: number, d: number, h: number, t: number, color: number, inset = t): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(k, g, t, h, t, color, sx * (w / 2 - inset), 0, sz * (d / 2 - inset));
}

/** A row of little things of the given colours along X on a shelf at `y`, `z` deep. */
function row(k: SceneryContext, g: THREE.Object3D, rng: Rng, from: number, to: number, y: number, z: number, depth: number, tall: number, colors: readonly number[], blobs = false): void {
  let x = from;
  while (x < to - 0.05) {
    const w = Math.min(to - x, rng.range(0.07, 0.16) * M);
    const h = tall * rng.range(0.65, 1);
    const c = colors[rng.int(colors.length)]!;
    if (blobs) put(g, k.blob(w * 0.6, h, c), x + w / 2, y, z);
    else box(k, g, w * 0.9, h, depth * rng.range(0.7, 1), c, x + w / 2, y, z);
    x += w + (rng.chance(0.15) ? rng.range(0.05, 0.2) * M : 0.01);
  }
}

const c = (item: Item, i: number, fallback: number = PALETTE.bark): number => item.colors[i] ?? item.colors[0] ?? fallback;

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

const BUILD: Record<ItemKind, Builder> = {
  table(k, it, g) {
    const t = 0.05 * M;
    if (it.n === 2) {
      // A cloth to the floor's middle.
      box(k, g, it.w + 0.1 * M, 0.35 * M, it.d + 0.1 * M, c(it, 0), 0, it.h - 0.35 * M, 0);
      box(k, g, it.w, t, it.d, c(it, 1), 0, it.h - t + PROUD, 0);
    } else box(k, g, it.w, t, it.d, c(it, 0), 0, it.h - t, 0);
    legs(k, g, it.w, it.d, it.h - t, 0.07 * M, c(it, 0), 0.08 * M);
    if (it.n === 1) {
      // Stacks of books on it.
      const rng = rngFrom(it.x, it.z);
      for (let i = 0; i < 3; i++) {
        let y = it.h;
        const x = (i - 1) * it.w * 0.3;
        for (let j = 0; j < rng.between(1, 4); j++) {
          box(k, g, 0.3 * M, 0.05 * M, 0.22 * M, it.colors[1 + rng.int(it.colors.length - 1)] ?? PALETTE.red, x, y, rng.jitter() * 0.1);
          y += 0.05 * M;
        }
      }
    }
  },
  'round-table'(k, it, g) {
    const r = Math.min(it.w, it.d) / 2;
    col(k, g, r, 0.05 * M, c(it, 0), 0, it.h - 0.05 * M, 0, 12);
    col(k, g, 0.05 * M, it.h - 0.05 * M, c(it, 1), 0, 0, 0, 6);
    col(k, g, r * 0.45, 0.04 * M, c(it, 1), 0, 0, 0, 8);
  },
  'low-table'(k, it, g) {
    if (it.n === 3) {
      // A brass tray on a stand.
      col(k, g, it.w / 2, 0.04 * M, c(it, 0), 0, it.h - 0.04 * M, 0, 12);
      col(k, g, it.w * 0.3, it.h - 0.04 * M, c(it, 1), 0, 0, 0, 6);
      return;
    }
    box(k, g, it.w, 0.05 * M, it.d, c(it, 0), 0, it.h - 0.05 * M, 0);
    legs(k, g, it.w, it.d, it.h - 0.05 * M, 0.06 * M, it.n === 1 ? c(it, 0) : retone(c(it, 0), 0.85));
  },
  chair(k, it, g) {
    const seat = 0.46 * M;
    if (it.n === 3) {
      // An office chair: a column, a star of feet, a seat and a back.
      col(k, g, 0.03 * M, seat, c(it, 0), 0, 0, 0, 6);
      for (let i = 0; i < 4; i++) box(k, g, it.w, 0.04 * M, 0.06 * M, c(it, 0), 0, 0, 0, (i * Math.PI) / 4);
      box(k, g, it.w, 0.08 * M, it.d, c(it, 1), 0, seat, 0);
      box(k, g, it.w * 0.9, it.h - seat - 0.08 * M, 0.07 * M, c(it, 1), 0, seat + 0.08 * M, -it.d / 2 + 0.05 * M);
      return;
    }
    box(k, g, it.w, 0.05 * M, it.d, c(it, 1), 0, seat - 0.05 * M, 0);
    legs(k, g, it.w, it.d, seat - 0.05 * M, 0.05 * M, c(it, 0));
    box(k, g, it.w, it.h - seat, 0.05 * M, c(it, 0), 0, seat, -it.d / 2 + 0.025 * M);
  },
  stool(k, it, g) {
    col(k, g, it.w / 2, 0.06 * M, c(it, 1), 0, it.h - 0.06 * M, 0, 10);
    col(k, g, 0.04 * M, it.h - 0.06 * M, c(it, 0), 0, 0, 0, 6);
    col(k, g, it.w * 0.35, 0.03 * M, c(it, 0), 0, 0, 0, 8);
  },
  sofa(k, it, g) {
    const seat = 0.42 * M;
    const arm = 0.18 * M;
    box(k, g, it.w, seat - 0.12 * M, it.d, retone(c(it, 1), 0.9), 0, 0.05 * M, 0);
    box(k, g, it.w - 2 * arm, 0.14 * M, it.d * 0.75, c(it, 0), 0, seat - 0.1 * M, it.d * 0.12);
    box(k, g, it.w, it.h - 0.05 * M, it.d * 0.25, c(it, 1), 0, 0.05 * M, -it.d * 0.375);
    for (const sx of [-1, 1]) box(k, g, arm, 0.62 * M, it.d, c(it, 1), sx * (it.w / 2 - arm / 2), 0.05 * M, 0);
    box(k, g, it.w, 0.05 * M, it.d * 0.9, PALETTE.bark, 0, 0, 0);
  },
  armchair(k, it, g) {
    BUILD.sofa(k, it, g, rngFrom(0));
  },
  bed(k, it, g) {
    box(k, g, it.w, 0.3 * M, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w * 0.96, 0.2 * M, it.d * 0.96, c(it, 1), 0, 0.3 * M, 0);
    box(k, g, it.w * 0.98, 0.08 * M, it.d * 0.62, c(it, 2), 0, 0.5 * M - 0.02 * M, it.d * 0.18);
    for (const sx of [-1, 1]) box(k, g, it.w * 0.38, 0.12 * M, 0.4 * M, PALETTE.white, sx * it.w * 0.22, 0.5 * M, -it.d / 2 + 0.3 * M);
    box(k, g, it.w, 1.0 * M, 0.08 * M, c(it, 0), 0, 0, -it.d / 2 + 0.04 * M);
  },
  'mat-bed'(k, it, g) {
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w * 0.9, 0.08 * M, it.d * 0.6, c(it, 1), 0, it.h, it.d * 0.15);
    box(k, g, it.w * 0.5, 0.1 * M, 0.35 * M, PALETTE.white, 0, it.h, -it.d / 2 + 0.25 * M);
  },
  wardrobe(k, it, g) {
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
    const door = retone(c(it, 0), 1.12);
    for (const sx of [-1, 1]) {
      box(k, g, it.w / 2 - 0.06 * M, it.h - 0.2 * M, PROUD, door, sx * it.w / 4, 0.1 * M, it.d / 2 + PROUD / 2);
      box(k, g, 0.04 * M, 0.2 * M, 0.05 * M, c(it, 1), sx * 0.06 * M, it.h * 0.5, it.d / 2 + 0.03 * M);
    }
  },
  chest(k, it, g) {
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
    const drawers = it.n === 2 ? 4 : 2;
    for (let i = 0; i < drawers; i++) {
      const y = (i + 0.5) * (it.h / drawers);
      box(k, g, it.w * 0.9, it.h / drawers - 0.05 * M, PROUD, retone(c(it, 0), 1.12), 0, y - (it.h / drawers - 0.05 * M) / 2, it.d / 2 + PROUD / 2);
      box(k, g, 0.12 * M, 0.03 * M, 0.04 * M, c(it, 1), 0, y, it.d / 2 + 0.03 * M);
    }
  },
  bookshelf(k, it, g, rng) {
    const t = 0.04 * M;
    box(k, g, it.w, it.h, t, c(it, 0), 0, 0, -it.d / 2 + t / 2);
    for (const sx of [-1, 1]) box(k, g, t, it.h, it.d, c(it, 0), sx * (it.w / 2 - t / 2), 0, 0);
    const shelves = Math.max(2, Math.round(it.h / (0.4 * M)));
    const step = it.h / shelves;
    const books = it.colors.slice(1);
    for (let i = 0; i < shelves; i++) {
      const y = i * step;
      box(k, g, it.w - 2 * t, t, it.d, c(it, 0), 0, y, 0);
      if (i < shelves && books.length > 0) row(k, g, rng, -it.w / 2 + t, it.w / 2 - t, y + t, 0, it.d * 0.8, step * 0.72, books);
    }
    box(k, g, it.w, t, it.d, c(it, 0), 0, it.h - t, 0);
  },
  bookcase(k, it, g, rng) {
    const t = 0.04 * M;
    box(k, g, it.w, it.h, t, c(it, 0), 0, 0, 0);
    for (const sx of [-1, 1]) box(k, g, t, it.h, it.d, c(it, 0), sx * (it.w / 2 - t / 2), 0, 0);
    const step = it.h / 3;
    for (let i = 0; i < 3; i++) {
      box(k, g, it.w - 2 * t, t, it.d, c(it, 0), 0, i * step, 0);
      for (const sz of [-1, 1]) row(k, g, rng, -it.w / 2 + t, it.w / 2 - t, i * step + t, sz * it.d / 4, it.d * 0.4, step * 0.7, it.colors.slice(1));
    }
    box(k, g, it.w, t, it.d, c(it, 0), 0, it.h - t, 0);
  },
  counter(k, it, g, rng) {
    box(k, g, it.w, it.h - 0.05 * M, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w + 0.08 * M, 0.05 * M, it.d + 0.1 * M, c(it, 1), 0, it.h - 0.05 * M, 0.02 * M);
    // Panels on the customer's side, which faces the door: the piece's +Z.
    const panels = Math.max(1, Math.round(it.w / (0.9 * M)));
    for (let i = 0; i < panels; i++) {
      const x = -it.w / 2 + (i + 0.5) * (it.w / panels);
      box(k, g, it.w / panels - 0.12 * M, it.h - 0.35 * M, PROUD, retone(c(it, 0), 0.88), x, 0.15 * M, it.d / 2 + PROUD / 2);
    }
    if (it.n === 1) {
      // A glass case of cakes and loaves at one end.
      const w = Math.min(1.4 * M, it.w * 0.5);
      box(k, g, w, 0.04 * M, it.d * 0.8, PALETTE.white, -it.w / 2 + w / 2 + 0.1 * M, it.h, 0);
      row(k, g, rng, -it.w / 2 + 0.15 * M, -it.w / 2 + w, it.h + 0.04 * M, 0, it.d * 0.5, 0.18 * M, [PALETTE.apricot, PALETTE.gold, PALETTE.brown, PALETTE.pink], true);
      for (const sx of [-1, 1]) box(k, g, 0.03 * M, 0.4 * M, 0.03 * M, c(it, 2), -it.w / 2 + w / 2 + 0.1 * M + sx * w / 2, it.h, it.d * 0.35);
      box(k, g, w, 0.03 * M, it.d * 0.8, c(it, 2), -it.w / 2 + w / 2 + 0.1 * M, it.h + 0.4 * M, 0);
    }
    // A till near the other end.
    const tx = it.w / 2 - 0.45 * M;
    box(k, g, 0.4 * M, 0.2 * M, 0.35 * M, c(it, 2), tx, it.h, -0.05 * M);
    box(k, g, 0.3 * M, 0.18 * M, 0.04 * M, PALETTE.ink, tx, it.h + 0.2 * M, -0.15 * M);
    if (it.n === 0 || it.n === 3) {
      // Cups, or glasses, along the top.
      for (let i = 0; i < 4; i++) col(k, g, 0.04 * M, 0.1 * M, i % 2 === 0 ? PALETTE.white : c(it, 3), -it.w / 2 + 0.4 * M + i * 0.25 * M, it.h, 0.05 * M, 6);
    }
    if (it.n === 3) box(k, g, it.w, 0.04 * M, 0.04 * M, c(it, 3), 0, 0.2 * M, it.d / 2 + 0.2 * M);
  },
  kitchen(k, it, g) {
    const top = 0.05 * M;
    box(k, g, it.w, it.h - top, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w + 0.04 * M, top, it.d + 0.04 * M, c(it, 1), 0, it.h - top, 0);
    const doors = Math.max(2, Math.round(it.w / (0.6 * M)));
    for (let i = 0; i < doors; i++) {
      const x = -it.w / 2 + (i + 0.5) * (it.w / doors);
      box(k, g, it.w / doors - 0.05 * M, it.h - top - 0.2 * M, PROUD, retone(c(it, 0), 1.1), x, 0.1 * M, it.d / 2 + PROUD / 2);
    }
    // The hob and the sink.
    const hob = it.w / 2 - 0.45 * M;
    box(k, g, 0.6 * M, 0.02 * M, 0.5 * M, PALETTE.ink, hob, it.h, 0);
    for (const [dx, dz] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]] as const) col(k, g, 0.08 * M, 0.02 * M, c(it, 2), hob + dx * M, it.h + 0.02 * M, dz * M, 8);
    box(k, g, 0.55 * M, 0.02 * M, 0.4 * M, PALETTE.steel, -it.w / 2 + 0.5 * M, it.h, 0);
    col(k, g, 0.025 * M, 0.3 * M, PALETTE.steel, -it.w / 2 + 0.5 * M, it.h, -it.d / 2 + 0.1 * M, 6);
    // The cupboards on the wall over it, unless it is a restaurant's pass.
    if (it.n !== 1) box(k, g, it.w, 0.7 * M, it.d * 0.55, c(it, 0), 0, it.h + 0.55 * M, -it.d * 0.225);
  },
  fridge(k, it, g, rng) {
    if (it.n === 1) {
      // A chilled wall: frames, glass and what is behind it.
      box(k, g, it.w, it.h, it.d, PALETTE.white, 0, 0, 0);
      const doors = Math.max(2, Math.round(it.w / (0.8 * M)));
      for (let i = 0; i < doors; i++) {
        const x = -it.w / 2 + (i + 0.5) * (it.w / doors);
        box(k, g, it.w / doors - 0.08 * M, it.h - 0.3 * M, PROUD, retone(PALETTE.skyBlue, 1.2), x, 0.2 * M, it.d / 2 + PROUD / 2);
        for (let s = 0; s < 3; s++) row(k, g, rng, x - it.w / doors / 2 + 0.1 * M, x + it.w / doors / 2 - 0.1 * M, 0.4 * M + s * 0.5 * M, it.d / 2 + PROUD + 0.04 * M, 0.06 * M, 0.3 * M, [PALETTE.white, PALETTE.red, PALETTE.gold, PALETTE.green]);
      }
      return;
    }
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w - 0.04 * M, 0.02 * M, PROUD, retone(c(it, 0), 0.8), 0, it.h * 0.62, it.d / 2 + PROUD / 2);
    box(k, g, 0.04 * M, 0.5 * M, 0.05 * M, PALETTE.steel, it.w / 2 - 0.12 * M, it.h * 0.7, it.d / 2 + 0.03 * M);
    box(k, g, 0.04 * M, 0.4 * M, 0.05 * M, PALETTE.steel, it.w / 2 - 0.12 * M, it.h * 0.3, it.d / 2 + 0.03 * M);
  },
  stove(k, it, g) {
    if (it.n === 1) {
      // A fireplace: the breast, the mouth and a fire in it.
      box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
      box(k, g, it.w * 0.55, it.h * 0.5, PROUD, PALETTE.ink, 0, 0.1 * M, it.d / 2 + PROUD / 2);
      put(g, k.blob(0.18 * M, 0.3 * M, c(it, 1)), 0, 0.12 * M, it.d / 2 - 0.05 * M);
      box(k, g, it.w + 0.15 * M, 0.08 * M, it.d + 0.1 * M, retone(c(it, 0), 1.2), 0, it.h, 0);
      box(k, g, it.w * 0.5, 1.4 * M, it.d * 0.6, c(it, 0), 0, it.h + 0.08 * M, -it.d * 0.2);
      return;
    }
    // A wood stove on legs, its pipe up to the ceiling.
    box(k, g, it.w * 0.8, it.h * 0.65, it.d * 0.8, c(it, 0), 0, 0.15 * M, 0);
    legs(k, g, it.w * 0.8, it.d * 0.8, 0.15 * M, 0.05 * M, c(it, 0));
    box(k, g, it.w * 0.4, it.h * 0.3, PROUD, PALETTE.ink, 0, 0.3 * M, it.d * 0.4 + PROUD / 2);
    col(k, g, 0.08 * M, 1.6 * M, c(it, 0), 0, it.h * 0.65 + 0.15 * M, -it.d * 0.15, 8);
  },
  oven(k, it, g) {
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
    if (it.n === 1) {
      for (let i = 0; i < 2; i++) box(k, g, it.w * 0.8, it.h * 0.3, PROUD, c(it, 1), 0, 0.2 * M + i * it.h * 0.4, it.d / 2 + PROUD / 2);
      return;
    }
    // A bread oven's arch, dark, and the glow at the back of it.
    box(k, g, it.w * 0.5, it.h * 0.3, PROUD, c(it, 1), 0, it.h * 0.3, it.d / 2 + PROUD / 2);
    box(k, g, it.w * 0.3, it.h * 0.12, PROUD, c(it, 2), 0, it.h * 0.32, it.d / 2 + PROUD * 1.5);
    box(k, g, it.w + 0.1 * M, 0.08 * M, it.d + 0.1 * M, retone(c(it, 0), 0.8), 0, it.h * 0.25, 0);
  },
  shelves(k, it, g, rng) {
    const t = 0.04 * M;
    const both = it.d > 0.6 * M;
    box(k, g, it.w, it.h, both ? 0.06 * M : t, c(it, 0), 0, 0, both ? 0 : -it.d / 2 + t / 2);
    box(k, g, it.w, 0.12 * M, it.d, retone(c(it, 0), 0.85), 0, 0, 0);
    const levels = 4;
    for (let i = 1; i < levels; i++) {
      const y = i * (it.h / levels);
      box(k, g, it.w, t, it.d, c(it, 0), 0, y, 0);
      const zs = both ? [-it.d / 4, it.d / 4] : [0];
      for (const z of zs) row(k, g, rng, -it.w / 2 + 0.05 * M, it.w / 2 - 0.05 * M, y + t, z, it.d * (both ? 0.35 : 0.7), it.h / levels * 0.6, it.colors.slice(1));
    }
    for (const z of both ? [-it.d / 4, it.d / 4] : [0]) row(k, g, rng, -it.w / 2 + 0.05 * M, it.w / 2 - 0.05 * M, 0.12 * M, z, it.d * (both ? 0.35 : 0.7), it.h / levels * 0.6, it.colors.slice(1));
  },
  'bread-rack'(k, it, g, rng) {
    const t = 0.04 * M;
    for (const sx of [-1, 1]) box(k, g, t, it.h, it.d, c(it, 0), sx * (it.w / 2 - t / 2), 0, 0);
    box(k, g, it.w, it.h, t, c(it, 0), 0, 0, -it.d / 2 + t / 2);
    for (let i = 0; i < 4; i++) {
      const y = 0.2 * M + i * (it.h - 0.3 * M) / 4;
      box(k, g, it.w - 2 * t, t, it.d, c(it, 0), 0, y, 0);
      row(k, g, rng, -it.w / 2 + t + 0.05 * M, it.w / 2 - t - 0.05 * M, y + t, 0, it.d * 0.6, 0.16 * M, it.colors.slice(1), true);
    }
  },
  crates(k, it, g, rng) {
    box(k, g, it.w, it.h * 0.55, it.d, retone(c(it, 0), 0.8), 0, 0, 0);
    const n = 2;
    for (let i = 0; i < n; i++) {
      const x = -it.w / 2 + (i + 0.5) * (it.w / n);
      const y = it.h * 0.55;
      box(k, g, it.w / n - 0.06 * M, 0.18 * M, it.d * 0.9, c(it, 0), x, y, 0);
      const fruit = it.colors[1 + rng.int(Math.max(1, it.colors.length - 1))] ?? PALETTE.red;
      for (let j = 0; j < 5; j++) put(g, k.blob(0.07 * M, 0.13 * M, fruit), x + rng.jitter() * it.w / n * 0.3, y + 0.14 * M, rng.jitter() * it.d * 0.3);
    }
  },
  display(k, it, g) {
    box(k, g, it.w, it.h * 0.6, it.d, c(it, 0), 0, 0, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(k, g, 0.03 * M, it.h * 0.4, 0.03 * M, PALETTE.steel, sx * (it.w / 2 - 0.02 * M), it.h * 0.6, sz * (it.d / 2 - 0.02 * M));
    box(k, g, it.w, 0.03 * M, it.d, PALETTE.steel, 0, it.h - 0.03 * M, 0);
  },
  coffee(k, it, g) {
    box(k, g, it.w, 0.9 * M, it.d, c(it, 0), 0, 0, 0);
    box(k, g, 0.6 * M, 0.45 * M, 0.45 * M, c(it, 1), -it.w * 0.2, 0.9 * M, 0);
    box(k, g, 0.5 * M, 0.08 * M, 0.1 * M, c(it, 2), -it.w * 0.2, 1.15 * M, 0.25 * M);
    for (let i = 0; i < 5; i++) col(k, g, 0.04 * M, 0.09 * M, PALETTE.white, it.w * 0.05 + i * 0.12 * M, 0.9 * M, 0, 6);
  },
  rack(k, it, g) {
    for (const sx of [-1, 1]) {
      box(k, g, 0.04 * M, it.h, 0.04 * M, c(it, 0), sx * it.w / 2, 0, 0);
      box(k, g, 0.04 * M, 0.03 * M, it.d, c(it, 0), sx * it.w / 2, 0, 0);
    }
    box(k, g, it.w, 0.04 * M, 0.04 * M, c(it, 0), 0, it.h - 0.04 * M, 0);
    const n = Math.max(3, Math.round(it.w / (0.14 * M)));
    for (let i = 0; i < n; i++) {
      const x = -it.w / 2 + (i + 0.5) * (it.w / n);
      const drop = (0.7 + (i % 3) * 0.12) * M;
      box(k, g, 0.05 * M, drop, it.d * 0.8, it.colors[1 + (i % Math.max(1, it.colors.length - 1))] ?? PALETTE.red, x, it.h - 0.06 * M - drop, 0);
    }
  },
  mannequin(k, it, g) {
    col(k, g, 0.18 * M, 0.04 * M, PALETTE.steel, 0, 0, 0, 8);
    col(k, g, 0.02 * M, 0.9 * M, PALETTE.steel, 0, 0.04 * M, 0, 6);
    put(g, k.taper(0.14 * M, 0.2 * M, 0.55 * M, c(it, 1), 6), 0, 0.9 * M, 0);
    put(g, k.taper(0.22 * M, 0.14 * M, 0.3 * M, c(it, 2), 6), 0, 0.6 * M, 0);
    put(g, k.blob(0.1 * M, 0.24 * M, c(it, 0)), 0, 1.5 * M, 0);
  },
  booth(k, it, g) {
    const t = 0.05 * M;
    box(k, g, it.w, it.h, t, c(it, 1), 0, 0, -it.d / 2 + t / 2);
    for (const sx of [-1, 1]) box(k, g, t, it.h, it.d, c(it, 1), sx * (it.w / 2 - t / 2), 0, 0);
    box(k, g, it.w, 0.04 * M, 0.04 * M, PALETTE.steel, 0, it.h - 0.1 * M, it.d / 2 - 0.05 * M);
    box(k, g, it.w * 0.7, it.h - 0.25 * M, 0.04 * M, c(it, 0), -it.w * 0.15, 0.1 * M, it.d / 2 - 0.05 * M);
  },
  desk(k, it, g) {
    box(k, g, it.w, 0.04 * M, it.d, c(it, 0), 0, it.h - 0.04 * M, 0);
    for (const sx of [-1, 1]) box(k, g, 0.04 * M, it.h - 0.04 * M, it.d, c(it, 1), sx * (it.w / 2 - 0.05 * M), 0, 0);
    box(k, g, it.w - 0.1 * M, 0.35 * M, 0.02 * M, c(it, 1), 0, it.h - 0.4 * M, -it.d / 2 + 0.03 * M);
    // The screen faces the chair, which is on the -Z side.
    col(k, g, 0.03 * M, 0.15 * M, c(it, 1), 0, it.h, it.d * 0.2, 6);
    box(k, g, 0.6 * M, 0.36 * M, 0.04 * M, c(it, 2), 0, it.h + 0.12 * M, it.d * 0.2);
    box(k, g, 0.45 * M, 0.02 * M, 0.15 * M, c(it, 1), 0, it.h, -it.d * 0.15);
  },
  monitor(k, it, g) {
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
  },
  plant(k, it, g) {
    const pot = Math.min(0.45 * M, it.h * 0.35);
    put(g, k.taper(it.w * 0.32, it.w * 0.4, pot, c(it, 0), 8), 0, 0, 0);
    put(g, k.blob(it.w * 0.5, it.h - pot, c(it, 1)), 0, pot, 0);
  },
  tree(k, it, g, rng) {
    put(g, k.taper(it.w * 0.4, it.w * 0.5, 0.5 * M, c(it, 0), 8), 0, 0, 0);
    col(k, g, 0.06 * M, it.h * 0.5, PALETTE.bark, 0, 0.5 * M, 0, 6);
    put(g, k.blob(it.w * 0.8, it.h * 0.5, c(it, 1)), 0, it.h * 0.45, 0);
    for (let i = 0; i < 5; i++) put(g, k.blob(0.07 * M, 0.12 * M, c(it, 2)), rng.jitter() * it.w * 0.55, it.h * rng.range(0.55, 0.8), rng.jitter() * it.w * 0.55);
  },
  rug(k, it, g) {
    if (it.n === 1) {
      // A prayer row: a band of the carpet's second colour with a border.
      box(k, g, it.w, 0.015 * M, it.d, c(it, 0), 0, 0, 0);
      const arches = Math.max(1, Math.floor(it.w / (1.0 * M)));
      for (let i = 0; i < arches; i++) {
        const x = -it.w / 2 + (i + 0.5) * (it.w / arches);
        box(k, g, it.w / arches - 0.2 * M, 0.025 * M, it.d * 0.7, c(it, 1), x, 0, 0);
      }
      return;
    }
    box(k, g, it.w, 0.02 * M, it.d, c(it, 1), 0, 0, 0);
    box(k, g, it.w - 0.25 * M, 0.035 * M, it.d - 0.25 * M, c(it, 0), 0, 0, 0);
  },
  lamp(k, it, g) {
    col(k, g, 0.16 * M, 0.04 * M, c(it, 0), 0, 0, 0, 8);
    col(k, g, 0.025 * M, it.h - 0.35 * M, c(it, 0), 0, 0.04 * M, 0, 6);
    put(g, k.taper(it.w * 0.55, it.w * 0.35, 0.35 * M, c(it, 1), 8), 0, it.h - 0.35 * M, 0);
  },
  'hanging-lamp'(k, it, g) {
    box(k, g, 0.02 * M, it.h - 0.25 * M, 0.02 * M, PALETTE.ink, 0, 0.25 * M, 0);
    put(g, k.taper(it.w * 0.5, it.w * 0.12, 0.25 * M, c(it, 0), 8), 0, 0, 0);
    put(g, k.blob(0.07 * M, 0.1 * M, PALETTE.cream), 0, -0.02 * M, 0);
  },
  chandelier(k, it, g) {
    box(k, g, 0.03 * M, it.h - 0.3 * M, 0.03 * M, PALETTE.ink, 0, 0.3 * M, 0);
    put(g, k.ringWall(it.w * 0.4, it.w * 0.46, 0.06 * M, c(it, 0), 12), 0, 0.1 * M, 0);
    col(k, g, 0.08 * M, 0.35 * M, c(it, 0), 0, 0, 0, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.sin(a) * it.w * 0.43;
      const z = Math.cos(a) * it.w * 0.43;
      col(k, g, 0.025 * M, 0.12 * M, PALETTE.cream, x, 0.16 * M, z, 6);
      put(g, k.blob(0.035 * M, 0.07 * M, PALETTE.gold), x, 0.28 * M, z);
    }
  },
  lantern(k, it, g) {
    const hung = it.y > 0;
    const body = hung ? Math.min(0.55 * M, it.h * 0.6) : it.h;
    if (hung) box(k, g, 0.02 * M, it.h - body, 0.02 * M, PALETTE.ink, 0, body, 0);
    put(g, k.taper(it.w * 0.45, it.w * 0.45, body * 0.8, c(it, 0), 6), 0, body * 0.1, 0);
    put(g, k.taper(it.w * 0.32, it.w * 0.2, body * 0.1, PALETTE.ink, 6), 0, body * 0.9, 0);
    put(g, k.taper(it.w * 0.2, it.w * 0.32, body * 0.1, PALETTE.ink, 6), 0, 0, 0);
  },
  painting(k, it, g, rng) {
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w - 0.1 * M, it.h - 0.1 * M, PROUD, c(it, 1), 0, 0.05 * M, it.d / 2 + PROUD / 2);
    // Two shapes on the canvas: a landscape, a still life, anything.
    box(k, g, (it.w - 0.1 * M) * rng.range(0.4, 0.95), (it.h - 0.1 * M) * rng.range(0.25, 0.5), PROUD, c(it, 2), rng.jitter() * 0.05 * it.w, 0.05 * M, it.d / 2 + PROUD * 1.5);
    put(g, k.blob(it.w * 0.12, it.h * 0.25, c(it, 3)), rng.jitter() * it.w * 0.25, it.h * 0.45, it.d / 2 + PROUD * 2);
  },
  mirror(k, it, g) {
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w - 0.12 * M, it.h - 0.12 * M, PROUD, retone(PALETTE.skyBlue, 1.25), 0, 0.06 * M, it.d / 2 + PROUD / 2);
  },
  cross(k, it, g) {
    if (it.n === 1) {
      box(k, g, it.w, it.h / 3, it.d, c(it, 0), 0, it.h / 3, 0);
      box(k, g, it.w / 3, it.h, it.d, c(it, 0), 0, 0, 0);
      return;
    }
    box(k, g, it.w * 0.18, it.h, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w, it.w * 0.18, it.d, c(it, 0), 0, it.h * 0.62, 0);
  },
  sign(k, it, g) {
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
    for (let i = 0; i < 5; i++) box(k, g, it.w * 0.12, it.h * 0.45, PROUD, i % 2 === 0 ? c(it, 1) : c(it, 2), -it.w * 0.36 + i * it.w * 0.18, it.h * 0.27, it.d / 2 + PROUD / 2);
  },
  tv(k, it, g) {
    box(k, g, it.w, 0.5 * M, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w * 0.8, 0.5 * M, 0.06 * M, c(it, 1), 0, 0.62 * M, -it.d * 0.1);
    box(k, g, 0.25 * M, 0.12 * M, 0.2 * M, c(it, 1), 0, 0.5 * M, -it.d * 0.1);
  },
  pew(k, it, g) {
    box(k, g, it.w, 0.06 * M, it.d * 0.7, c(it, 0), 0, 0.42 * M, it.d * 0.1);
    box(k, g, it.w, it.h - 0.42 * M, 0.06 * M, c(it, 0), 0, 0.42 * M, -it.d / 2 + 0.03 * M);
    for (const sx of [-1, 1]) box(k, g, 0.07 * M, it.h, it.d, retone(c(it, 0), 0.85), sx * (it.w / 2 - 0.035 * M), 0, 0);
    // The kneeler along the back, for the pew behind.
    box(k, g, it.w - 0.2 * M, 0.12 * M, 0.15 * M, retone(c(it, 0), 0.8), 0, 0.08 * M, -it.d / 2 + 0.12 * M);
  },
  altar(k, it, g, rng) {
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w + 0.1 * M, 0.04 * M, it.d + 0.1 * M, c(it, 1), 0, it.h, 0);
    box(k, g, it.w * 0.4, it.h * 0.7, PROUD, c(it, 2), 0, it.h * 0.15, it.d / 2 + PROUD / 2);
    if (it.n === 1) {
      for (let i = 0; i < 5; i++) put(g, k.blob(0.1 * M, 0.18 * M, rng.pick([PALETTE.orange, PALETTE.gold, PALETTE.red])), (i - 2) * it.w * 0.18, it.h + 0.04 * M, 0);
      return;
    }
    for (const sx of [-1, 1]) {
      col(k, g, 0.04 * M, 0.35 * M, PALETTE.cream, sx * it.w * 0.35, it.h + 0.04 * M, 0, 6);
      put(g, k.blob(0.03 * M, 0.07 * M, PALETTE.gold), sx * it.w * 0.35, it.h + 0.39 * M, 0);
    }
    box(k, g, 0.35 * M, 0.06 * M, 0.25 * M, PALETTE.crimson, 0, it.h + 0.04 * M, 0);
  },
  candles(k, it, g) {
    col(k, g, it.w * 0.4, 0.04 * M, c(it, 0), 0, 0, 0, 8);
    col(k, g, 0.025 * M, it.h - 0.3 * M, c(it, 0), 0, 0.04 * M, 0, 6);
    box(k, g, it.w, 0.03 * M, 0.04 * M, c(it, 0), 0, it.h - 0.3 * M, 0);
    for (const x of [-it.w * 0.45, 0, it.w * 0.45]) {
      col(k, g, 0.025 * M, 0.2 * M, c(it, 1), x, it.h - 0.27 * M, 0, 6);
      put(g, k.blob(0.025 * M, 0.06 * M, c(it, 2)), x, it.h - 0.07 * M, 0);
    }
  },
  lectern(k, it, g) {
    col(k, g, it.w * 0.35, 0.05 * M, c(it, 0), 0, 0, 0, 8);
    box(k, g, 0.12 * M, it.h - 0.1 * M, 0.12 * M, c(it, 0), 0, 0.05 * M, 0);
    const top = box(k, g, it.w, 0.05 * M, it.d, c(it, 0), 0, it.h - 0.05 * M, 0);
    top.rotation.x = 0.3;
    box(k, g, it.w * 0.7, 0.03 * M, it.d * 0.6, c(it, 1), 0, it.h + 0.02 * M, 0).rotation.x = 0.3;
  },
  organ(k, it, g) {
    box(k, g, it.w, it.h * 0.35, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w * 0.8, 0.05 * M, it.d * 0.4, PALETTE.white, 0, it.h * 0.3, it.d * 0.35);
    const pipes = 7;
    for (let i = 0; i < pipes; i++) {
      const x = -it.w / 2 + (i + 0.5) * (it.w / pipes);
      const tall = it.h * (0.45 + 0.35 * (1 - Math.abs(i - (pipes - 1) / 2) / pipes));
      col(k, g, 0.07 * M, tall, i % 2 === 0 ? c(it, 1) : c(it, 2), x, it.h * 0.35, -it.d * 0.2, 8);
    }
  },
  mihrab(k, it, g) {
    // The niche's frame on the qibla wall: two pillars, an arch of steps, a darker back.
    box(k, g, it.w, it.h, 0.06 * M, c(it, 0), 0, 0, -it.d / 2 + 0.03 * M);
    box(k, g, it.w * 0.6, it.h * 0.72, PROUD, c(it, 3), 0, 0, -it.d / 2 + 0.06 * M + PROUD / 2);
    for (const sx of [-1, 1]) {
      col(k, g, 0.12 * M, it.h * 0.72, c(it, 1), sx * it.w * 0.36, 0, -it.d / 2 + 0.2 * M, 8);
    }
    for (let i = 0; i < 4; i++) {
      box(k, g, it.w * (0.8 - i * 0.16), 0.14 * M, 0.3 * M, i % 2 === 0 ? c(it, 1) : c(it, 2), 0, it.h * 0.72 + i * 0.14 * M, -it.d / 2 + 0.15 * M);
    }
  },
  minbar(k, it, g) {
    // Steps rising from the room's side (+Z) to a seat under a little canopy.
    const steps = 7;
    const run = it.d * 0.65 / steps;
    for (let i = 0; i < steps; i++) {
      box(k, g, it.w * 0.7, (i + 1) * (it.h * 0.45 / steps), run, c(it, 0), 0, 0, it.d / 2 - (i + 0.5) * run);
    }
    box(k, g, it.w * 0.7, it.h * 0.45, it.d * 0.35, c(it, 0), 0, 0, -it.d / 2 + it.d * 0.175);
    for (const sx of [-1, 1]) box(k, g, 0.08 * M, it.h * 0.6, it.d, retone(c(it, 0), 1.15), sx * it.w / 2, 0, 0);
    for (const sx of [-1, 1]) col(k, g, 0.05 * M, it.h * 0.35, c(it, 0), sx * it.w * 0.3, it.h * 0.45, -it.d * 0.3, 6);
    put(g, k.taper(it.w * 0.5, 0.05 * M, it.h * 0.2, c(it, 1), 8), 0, it.h * 0.8, -it.d * 0.3);
  },
  rehal(k, it, g) {
    for (const s of [-1, 1]) box(k, g, it.w, 0.03 * M, it.d * 0.7, c(it, 0), 0, it.h * 0.4, 0).rotation.x = s * 0.7;
    box(k, g, it.w * 0.8, 0.06 * M, it.d * 0.5, c(it, 1), 0, it.h * 0.75, 0);
  },
  column(k, it, g) {
    col(k, g, it.w * 0.62, 0.25 * M, c(it, 1), 0, 0, 0, 8);
    col(k, g, it.w / 2, it.h - 0.5 * M, c(it, 0), 0, 0.25 * M, 0, 8);
    col(k, g, it.w * 0.62, 0.25 * M, c(it, 1), 0, it.h - 0.25 * M, 0, 8);
  },
  buddha(k, it, g) {
    put(g, k.taper(it.w * 0.5, it.w * 0.42, it.h * 0.2, c(it, 1), 8), 0, 0, 0);
    put(g, k.taper(it.w * 0.46, it.w * 0.5, it.h * 0.06, c(it, 2), 8), 0, it.h * 0.2, 0);
    // Seated: the crossed legs, the body, the head, the knot of hair.
    put(g, k.blob(it.w * 0.4, it.h * 0.16, c(it, 0)), 0, it.h * 0.25, it.d * 0.08);
    put(g, k.taper(it.w * 0.28, it.w * 0.18, it.h * 0.34, c(it, 0), 8), 0, it.h * 0.36, 0);
    put(g, k.blob(it.w * 0.14, it.h * 0.18, c(it, 0)), 0, it.h * 0.68, 0);
    put(g, k.blob(it.w * 0.06, it.h * 0.07, c(it, 0)), 0, it.h * 0.84, 0);
    // The halo behind.
    const halo = col(k, g, it.w * 0.38, 0.05 * M, c(it, 2), 0, it.h * 0.72, -it.d * 0.35, 16);
    halo.rotation.x = Math.PI / 2;
  },
  incense(k, it, g) {
    col(k, g, 0.06 * M, it.h * 0.6, c(it, 0), 0, 0, 0, 6);
    put(g, k.taper(it.w * 0.25, it.w * 0.45, it.h * 0.25, c(it, 1), 8), 0, it.h * 0.6, 0);
    for (const x of [-0.05, 0, 0.05]) box(k, g, 0.01 * M, it.h * 0.2, 0.01 * M, c(it, 2), x * M, it.h * 0.8, 0);
  },
  cushion(k, it, g) {
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
  },
  gong(k, it, g) {
    for (const sx of [-1, 1]) box(k, g, 0.08 * M, it.h, 0.08 * M, c(it, 0), sx * it.w / 2, 0, 0);
    box(k, g, it.w + 0.2 * M, 0.1 * M, 0.1 * M, c(it, 0), 0, it.h - 0.1 * M, 0);
    const disc = col(k, g, it.w * 0.36, 0.05 * M, c(it, 1), 0, it.h * 0.5, 0, 16);
    disc.rotation.x = Math.PI / 2;
  },
  tokonoma(k, it, g) {
    box(k, g, it.w, 0.2 * M, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w, it.h, 0.05 * M, c(it, 1), 0, 0, -it.d / 2 + 0.025 * M);
    // A hanging scroll, and a vase with a branch in it.
    box(k, g, 0.5 * M, 1.1 * M, PROUD, PALETTE.white, 0, 0.8 * M, -it.d / 2 + 0.05 * M + PROUD / 2);
    box(k, g, 0.3 * M, 0.6 * M, PROUD, c(it, 3), 0, 1.05 * M, -it.d / 2 + 0.05 * M + PROUD * 1.5);
    put(g, k.taper(0.08 * M, 0.12 * M, 0.3 * M, PALETTE.steel, 6), it.w * 0.3, 0.2 * M, 0);
    put(g, k.blob(0.2 * M, 0.35 * M, c(it, 2)), it.w * 0.3, 0.5 * M, 0);
    box(k, g, it.w, 0.1 * M, it.d, c(it, 0), 0, it.h - 0.1 * M, 0);
  },
  hay(k, it, g) {
    const bales = Math.max(1, Math.round(it.h / (0.55 * M)));
    const bh = it.h / bales;
    for (let i = 0; i < bales; i++) {
      const b = box(k, g, it.w * (i % 2 === 0 ? 1 : 0.95), bh * 0.97, it.d, retone(c(it, 0), i % 2 === 0 ? 1 : 0.92), 0, i * bh, 0);
      b.rotation.y = (i % 2) * 0.08;
      for (const sx of [-0.25, 0.25]) box(k, g, 0.04 * M, bh * 0.97 + 0.01, it.d + 0.02, c(it, 1), sx * it.w, i * bh, 0);
    }
  },
  stall(k, it, g) {
    // Three sides of rails; the front, +Z, is a gate across half of it.
    const post = 0.1 * M;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) box(k, g, post, it.h, post, c(it, 0), x * (it.w / 2 - post / 2), 0, z * (it.d / 2 - post / 2));
    for (const y of [0.45, 0.95]) {
      box(k, g, it.w, 0.08 * M, 0.06 * M, c(it, 0), 0, y * M, -it.d / 2 + 0.03 * M);
      for (const sx of [-1, 1]) box(k, g, 0.06 * M, 0.08 * M, it.d, c(it, 0), sx * (it.w / 2 - 0.03 * M), y * M, 0);
      box(k, g, it.w * 0.5, 0.08 * M, 0.06 * M, retone(c(it, 0), 1.15), -it.w * 0.25, y * M, it.d / 2 - 0.03 * M);
    }
  },
  cow(k, it, g) {
    // A body, four legs, a head; patches for a cow, a mane for a horse.
    const horse = it.colors[1] === PALETTE.ink && it.colors[0] !== PALETTE.white;
    const leg = it.h * 0.45;
    box(k, g, it.w, it.h * 0.42, it.d * 0.7, c(it, 0), 0, leg, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(k, g, 0.14 * M, leg, 0.14 * M, c(it, 0), sx * it.w * 0.32, 0, sz * it.d * 0.27);
    const neck = box(k, g, it.w * 0.45, it.h * 0.45, 0.3 * M, c(it, 0), 0, leg + it.h * 0.2, it.d * 0.36);
    neck.rotation.x = -0.5;
    box(k, g, it.w * 0.45, it.h * 0.24, 0.5 * M, c(it, 0), 0, leg + it.h * 0.42, it.d * 0.47);
    box(k, g, it.w * 0.35, it.h * 0.14, 0.14 * M, horse ? c(it, 2) : c(it, 2), 0, leg + it.h * 0.42, it.d * 0.47 + 0.3 * M);
    if (!horse) {
      box(k, g, it.w * 0.5, it.h * 0.2, it.d * 0.25, c(it, 1), 0, leg + it.h * 0.1, -it.d * 0.1).position.y = leg + it.h * 0.25;
      box(k, g, it.w + 0.02, it.h * 0.18, it.d * 0.18, c(it, 1), 0, leg + it.h * 0.15, it.d * 0.12);
    } else box(k, g, 0.1 * M, it.h * 0.35, 0.35 * M, c(it, 2), 0, leg + it.h * 0.42, it.d * 0.3);
    box(k, g, 0.06 * M, it.h * 0.45, 0.06 * M, horse ? c(it, 2) : c(it, 0), 0, leg * 0.6, -it.d * 0.36);
  },
  horse(k, it, g, rng) {
    BUILD.cow(k, it, g, rng);
  },
  cart(k, it, g) {
    box(k, g, it.w, 0.3 * M, it.d * 0.75, c(it, 0), 0, 0.55 * M, -it.d * 0.1);
    for (const sx of [-1, 1]) {
      box(k, g, 0.05 * M, 0.35 * M, it.d * 0.75, c(it, 0), sx * it.w / 2, 0.85 * M, -it.d * 0.1);
      const wheel = col(k, g, 0.4 * M, 0.08 * M, c(it, 1), sx * (it.w / 2 + 0.06 * M), 0.4 * M, -it.d * 0.1, 10);
      wheel.rotation.z = Math.PI / 2;
      box(k, g, 0.06 * M, 0.06 * M, it.d * 0.5, c(it, 0), sx * it.w * 0.3, 0.6 * M, it.d * 0.4);
    }
  },
  tools(k, it, g) {
    box(k, g, it.w, it.h, it.d * 0.5, c(it, 0), 0, 0, -it.d * 0.25);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = -it.w / 2 + (i + 0.5) * (it.w / n);
      box(k, g, 0.05 * M, it.h * 0.85, 0.05 * M, c(it, 0), x, it.h * 0.05, it.d * 0.1);
      box(k, g, i % 2 === 0 ? 0.3 * M : 0.12 * M, 0.12 * M, 0.04 * M, c(it, 1), x, i % 2 === 0 ? it.h * 0.05 : it.h * 0.8, it.d * 0.15);
    }
  },
  trough(k, it, g) {
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w * 0.9, 0.02 * M, it.d * 0.8, c(it, 1), 0, it.h - 0.1 * M + PROUD, 0);
  },
  sacks(k, it, g) {
    for (let i = 0; i < 3; i++) {
      put(g, k.blob(it.w * 0.28, it.h * (i === 2 ? 0.5 : 0.55), i % 2 === 0 ? c(it, 0) : c(it, 1)), (i - 1) * it.w * 0.3, i === 2 ? it.h * 0.45 : 0, i === 2 ? 0 : (i - 0.5) * it.d * 0.2);
    }
  },
  millstone(k, it, g) {
    col(k, g, it.w * 0.5, 0.45 * M, c(it, 1), 0, 0, 0, 12);
    col(k, g, it.w * 0.42, 0.25 * M, c(it, 0), 0, 0.45 * M, 0, 12);
    col(k, g, 0.12 * M, it.h, c(it, 1), 0, 0, 0, 8);
    put(g, k.taper(0.15 * M, 0.45 * M, 0.5 * M, c(it, 1), 4), it.w * 0.2, 1.1 * M, 0);
  },
  gear(k, it, g) {
    const wheel = put(g, k.ringWall(it.w * 0.4, it.w * 0.5, it.d, c(it, 0), 16), 0, it.h / 2, 0);
    wheel.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const spoke = box(k, g, it.w * 0.85, 0.08 * M, it.d * 0.8, c(it, 1), 0, it.h / 2 - 0.04 * M, 0);
      spoke.rotation.z = (i * Math.PI) / 4;
    }
  },
  lens(k, it, g) {
    col(k, g, it.w * 0.4, 0.6 * M, c(it, 0), 0, 0, 0, 8);
    const bands = 5;
    for (let i = 0; i < bands; i++) {
      const y = 0.6 * M + (i * (it.h - 0.6 * M)) / bands;
      const r = it.w * (0.3 + 0.2 * Math.sin(((i + 0.5) / bands) * Math.PI));
      put(g, k.taper(r, r * 0.95, (it.h - 0.6 * M) / bands, i % 2 === 0 ? c(it, 2) : c(it, 1), 12), 0, y, 0);
    }
    col(k, g, it.w * 0.2, 0.1 * M, c(it, 0), 0, it.h, 0, 8);
  },
  plinth(k, it, g) {
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w + 0.08 * M, 0.06 * M, it.d + 0.08 * M, c(it, 1), 0, it.h - 0.06 * M, 0);
    box(k, g, it.w + 0.08 * M, 0.08 * M, it.d + 0.08 * M, c(it, 1), 0, 0, 0);
    if (it.n === 1) {
      // An artefact: an urn, a head, a stone.
      put(g, k.taper(0.1 * M, 0.2 * M, 0.25 * M, c(it, 1), 8), 0, it.h, 0);
      put(g, k.blob(0.2 * M, 0.3 * M, c(it, 1)), 0, it.h + 0.2 * M, 0);
    }
  },
  model() {
    // The landmark's miniature is put here by the caller, when there is one.
  },
  vitrine(k, it, g) {
    // The edges of a glass case: the glass itself is left out, so the model shows.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(k, g, 0.04 * M, it.h, 0.04 * M, c(it, 1), sx * (it.w / 2 - 0.02 * M), 0, sz * (it.d / 2 - 0.02 * M));
    for (const sz of [-1, 1]) box(k, g, it.w, 0.04 * M, 0.04 * M, c(it, 1), 0, it.h - 0.04 * M, sz * (it.d / 2 - 0.02 * M));
    for (const sx of [-1, 1]) box(k, g, 0.04 * M, 0.04 * M, it.d, c(it, 1), sx * (it.w / 2 - 0.02 * M), it.h - 0.04 * M, 0);
  },
  bench(k, it, g) {
    box(k, g, it.w, 0.06 * M, it.d, c(it, 0), 0, it.h - 0.06 * M, 0);
    for (const sx of [-1, 1]) box(k, g, 0.06 * M, it.h - 0.06 * M, it.d * 0.8, c(it, 1), sx * (it.w / 2 - 0.15 * M), 0, 0);
  },
  placard(k, it, g) {
    box(k, g, 0.08 * M, it.h * 0.85, 0.08 * M, c(it, 0), 0, 0, 0);
    const board = box(k, g, it.w, it.w * 0.65, 0.04 * M, c(it, 1), 0, it.h * 0.8, 0.05 * M);
    board.rotation.x = -0.5;
    for (let i = 0; i < 4; i++) {
      const line = box(k, g, it.w * (0.8 - (i % 2) * 0.2), 0.025 * M, PROUD, PALETTE.ink, 0, it.h * 0.8 + (0.35 - i * 0.1) * it.w * 0.65 * Math.cos(0.5), 0.05 * M + 0.02 * M + (0.35 - i * 0.1) * it.w * 0.65 * Math.sin(0.5) + 0.01 * M);
      line.rotation.x = -0.5;
    }
  },
  fountain(k, it, g) {
    const r = it.w / 2;
    put(g, k.ringWall(r * 0.85, r, it.h * 0.6, c(it, 0), 8), 0, 0, 0);
    col(k, g, r * 0.86, it.h * 0.45, c(it, 1), 0, 0, 0, 8);
    col(k, g, 0.12 * M, it.h, c(it, 2), 0, 0, 0, 8);
    put(g, k.taper(0.1 * M, r * 0.35, 0.15 * M, c(it, 2), 8), 0, it.h, 0);
    put(g, k.blob(0.1 * M, 0.25 * M, c(it, 1)), 0, it.h + 0.15 * M, 0);
  },
  majlis(k, it, g) {
    box(k, g, it.w, 0.25 * M, it.d, c(it, 1), 0, 0, 0);
    box(k, g, it.w - 0.1 * M, 0.15 * M, it.d * 0.7, c(it, 0), 0, 0.25 * M, it.d * 0.12);
    const n = Math.max(2, Math.round(it.w / (0.7 * M)));
    for (let i = 0; i < n; i++) {
      const x = -it.w / 2 + (i + 0.5) * (it.w / n);
      box(k, g, it.w / n - 0.08 * M, 0.45 * M, 0.2 * M, i % 2 === 0 ? c(it, 0) : c(it, 2), x, 0.3 * M, -it.d / 2 + 0.12 * M);
    }
  },
  hearth(k, it, g, rng) {
    put(g, k.ringWall(it.w * 0.32, it.w * 0.5, it.h, c(it, 0), 8), 0, 0, 0);
    for (let i = 0; i < 3; i++) {
      const log = box(k, g, it.w * 0.55, 0.08 * M, 0.1 * M, PALETTE.bark, 0, 0.05 * M, 0);
      log.rotation.y = (i * Math.PI) / 3;
    }
    put(g, k.blob(0.2 * M, 0.45 * M, c(it, 1)), rng.jitter() * 0.02, 0.1 * M, 0);
    put(g, k.blob(0.12 * M, 0.3 * M, c(it, 2)), 0.05 * M, 0.12 * M, 0.05 * M);
  },
  pots(k, it, g) {
    put(g, k.taper(it.w * 0.2, it.w * 0.28, it.h, c(it, 0), 8), -it.w * 0.2, 0, 0);
    put(g, k.taper(it.w * 0.26, it.w * 0.18, it.h * 0.55, retone(c(it, 0), 0.85), 8), it.w * 0.22, 0, it.d * 0.1);
    col(k, g, it.w * 0.18, it.h * 0.08, c(it, 1), -it.w * 0.2, it.h, 0, 8);
  },
  barrel(k, it, g) {
    col(k, g, it.w / 2, it.h, c(it, 0), 0, 0, 0, 10);
    for (const y of [0.15, 0.8]) put(g, k.ringWall(it.w / 2, it.w / 2 + 0.03 * M, 0.06 * M, c(it, 1), 10), 0, y * it.h, 0);
  },
  bottles(k, it, g, rng) {
    box(k, g, it.w, it.h, 0.05 * M, c(it, 0), 0, 0, -it.d / 2 + 0.025 * M);
    box(k, g, it.w, 0.9 * M, it.d, retone(c(it, 0), 0.85), 0, 0, 0);
    for (let s = 0; s < 3; s++) {
      const y = 1.0 * M + s * 0.35 * M;
      box(k, g, it.w, 0.04 * M, it.d * 0.8, c(it, 0), 0, y, -it.d * 0.1);
      for (let x = -it.w / 2 + 0.1 * M; x < it.w / 2 - 0.1 * M; x += 0.16 * M) {
        col(k, g, 0.04 * M, rng.range(0.18, 0.28) * M, it.colors[1 + rng.int(Math.max(1, it.colors.length - 1))] ?? PALETTE.green, x, y + 0.04 * M, -it.d * 0.1, 6);
      }
    }
  },
  elevator(k, it, g) {
    box(k, g, it.w + 0.3 * M, it.h + 0.2 * M, it.d, c(it, 1), 0, 0, 0);
    for (const sx of [-1, 1]) box(k, g, it.w / 2 - 0.02 * M, it.h, PROUD, c(it, 0), sx * it.w / 4, 0, it.d / 2 + PROUD / 2);
    box(k, g, 0.3 * M, 0.08 * M, PROUD, c(it, 2), 0, it.h + 0.05 * M, it.d / 2 + PROUD / 2);
  },
  reception(k, it, g) {
    box(k, g, it.w, it.h, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w + 0.1 * M, 0.05 * M, it.d + 0.1 * M, c(it, 1), 0, it.h, 0);
    box(k, g, it.w * 0.3, 0.3 * M, PROUD, c(it, 1), 0, it.h * 0.45, it.d / 2 + PROUD / 2);
    box(k, g, 0.5 * M, 0.32 * M, 0.04 * M, c(it, 2), -it.w * 0.25, it.h + 0.05 * M, -it.d * 0.2);
  },
  cooler(k, it, g) {
    box(k, g, it.w, it.h * 0.7, it.d, c(it, 0), 0, 0, 0);
    col(k, g, it.w * 0.4, it.h * 0.3, c(it, 1), 0, it.h * 0.7, 0, 8);
  },
  printer(k, it, g) {
    box(k, g, it.w, it.h * 0.6, it.d, c(it, 0), 0, 0, 0);
    box(k, g, it.w * 0.9, it.h * 0.4, it.d * 0.9, retone(c(it, 0), 0.9), 0, it.h * 0.6, 0);
    box(k, g, it.w * 0.5, 0.03 * M, it.d * 0.3, PALETTE.white, 0, it.h * 0.75, it.d * 0.5);
    box(k, g, it.w * 0.3, 0.05 * M, PROUD, c(it, 1), -it.w * 0.2, it.h * 0.85, it.d * 0.45 + PROUD / 2);
  },
  drum(k, it, g) {
    if (it.n === 1) {
      // A temple drum lying in a frame.
      for (const sx of [-1, 1]) box(k, g, 0.1 * M, it.h * 0.7, it.d * 0.6, c(it, 0), sx * it.w * 0.45, 0, 0);
      const body = col(k, g, it.h * 0.35, it.w * 0.8, c(it, 0), -it.w * 0.4, it.h * 0.55, 0, 12);
      body.rotation.z = -Math.PI / 2;
      for (const sx of [-1, 1]) {
        const skin = col(k, g, it.h * 0.33, 0.03 * M, c(it, 1), sx * it.w * 0.4 + (sx < 0 ? -0.03 * M : 0), it.h * 0.55, 0, 12);
        skin.rotation.z = -Math.PI / 2;
      }
      return;
    }
    put(g, k.taper(it.w * 0.35, it.w * 0.5, it.h * 0.95, c(it, 0), 10), 0, 0, 0);
    col(k, g, it.w * 0.5, it.h * 0.05, c(it, 1), 0, it.h * 0.95, 0, 10);
  },
};

// ---------------------------------------------------------------------------
// The shell
// ---------------------------------------------------------------------------

/** A wall's frame: its inner face's middle on the floor, the way along it, and which way is in. */
interface WallFrame {
  x: number;
  z: number;
  /** Turn about +Y that takes a piece's +Z to this wall's inward normal. */
  yaw: number;
  length: number;
}

/** The frame of a box room's wall, or of a round room's segment at angle `at`. */
function wallFrame(plan: InteriorPlan, wall: Opening['wall'], at = 0): WallFrame {
  if (plan.shape === 'round') {
    const R = plan.width / 2;
    const step = (Math.PI * 2) / plan.sides;
    // The polygon is drawn round the circle the plan keeps to, never inside it.
    return { x: Math.sin(at) * R, z: plan.depth / 2 - Math.cos(at) * R, yaw: -at, length: 2 * R * Math.tan(step / 2) };
  }
  const W = plan.width;
  const D = plan.depth;
  if (wall === 'back') return { x: 0, z: D, yaw: Math.PI, length: W };
  if (wall === 'left') return { x: -W / 2, z: D / 2, yaw: Math.PI / 2, length: D };
  if (wall === 'right') return { x: W / 2, z: D / 2, yaw: -Math.PI / 2, length: D };
  return { x: 0, z: 0, yaw: 0, length: W };
}

/** A group standing on a wall's frame, `along` from its middle: its +Z is into the room. */
function onWall(parent: THREE.Group, frame: WallFrame, along: number): THREE.Group {
  const g = new THREE.Group();
  // Local +X is the wall's own direction: `(cos yaw, -sin yaw)` in `(x, z)`.
  g.position.set(frame.x + Math.cos(frame.yaw) * along, 0, frame.z - Math.sin(frame.yaw) * along);
  g.rotation.y = frame.yaw;
  parent.add(g);
  return g;
}

/**
 * A wall along a frame with a hole cut for each opening: pieces of box round
 * every opening, from `-length / 2` to `length / 2`, `WALL` thick behind the
 * inner face. `holes` are `[along, y, w, h]`.
 */
function wallWithHoles(k: SceneryContext, g: THREE.Group, length: number, height: number, color: number, holes: readonly (readonly [number, number, number, number])[]): void {
  const sorted = [...holes].sort((a, b) => a[0] - b[0]);
  let from = -length / 2 - WALL;
  const back = -WALL / 2;
  for (const [along, y, w, h] of sorted) {
    const left = along - w / 2;
    const right = along + w / 2;
    if (left > from) box(k, g, left - from, height + 0.4, WALL, color, (from + left) / 2, -0.2, back);
    if (y > 0) box(k, g, w, y + 0.2, WALL, color, along, -0.2, back);
    if (y + h < height) box(k, g, w, height + 0.2 - (y + h), WALL, color, along, y + h, back);
    from = right;
  }
  const end = length / 2 + WALL;
  if (end > from) box(k, g, end - from, height + 0.4, WALL, color, (from + end) / 2, -0.2, back);
}

/** A window's frame, sill and glazing bars, on its wall's group; the glass is `glass`'s. */
function windowFrame(k: SceneryContext, g: THREE.Group, o: Opening, trim: number): void {
  const t = 0.07 * M;
  const depth = 0.1 * M;
  box(k, g, o.w + 2 * t, t, depth + 0.05 * M, trim, o.at, o.y - t, depth / 2);
  box(k, g, o.w + 2 * t, t, depth, trim, o.at, o.y + o.h, depth / 2 - 0.02);
  for (const sx of [-1, 1]) box(k, g, t, o.h, depth, trim, o.at + sx * (o.w / 2 + t / 2), o.y, depth / 2 - 0.02);
  // Glazing bars: a cross, or a paper screen's lattice.
  const bars = o.paper ? 3 : o.stained !== null ? 2 : o.w > 1.3 * M ? 1 : 0;
  for (let i = 1; i <= bars; i++) {
    box(k, g, 0.03 * M, o.h, 0.03 * M, trim, o.at - o.w / 2 + (i * o.w) / (bars + 1), o.y, 0.03 * M);
  }
  const rows = o.paper ? 4 : o.stained !== null ? 3 : 1;
  for (let i = 1; i <= rows; i++) {
    box(k, g, o.w, 0.03 * M, 0.03 * M, trim, o.at, o.y + (i * o.h) / (rows + 1), 0.03 * M);
  }
}

/** The glass: quads with a colour each, in the room's frame. */
class Glass {
  readonly position: number[] = [];
  readonly color: number[] = [];
  private readonly tint = new THREE.Color();
  private readonly p = new THREE.Vector3();

  /** A quad `w` by `h` at `along` on a wall frame, `y` up, `inset` in front of the inner face. */
  pane(frame: WallFrame, along: number, y: number, w: number, h: number, inset: number, color: number): void {
    const cos = Math.cos(frame.yaw);
    const sin = Math.sin(frame.yaw);
    // In the wall's frame: x along, z in. Out to the room: rotate by yaw.
    const corner = (lx: number, ly: number): void => {
      this.p.set(frame.x + cos * lx + sin * inset, ly, frame.z - sin * lx + cos * inset);
      this.position.push(this.p.x, this.p.y, this.p.z);
      this.tint.set(color);
      this.color.push(this.tint.r, this.tint.g, this.tint.b);
    };
    const x0 = along - w / 2;
    const x1 = along + w / 2;
    // Facing into the room, counter-clockwise seen from inside.
    corner(x0, y);
    corner(x1, y);
    corner(x1, y + h);
    corner(x0, y);
    corner(x1, y + h);
    corner(x0, y + h);
  }

  /** A horizontal quad at height `y` facing down: the sky over a courtyard. */
  sky(x0: number, x1: number, z0: number, z1: number, y: number): void {
    const corner = (x: number, z: number): void => {
      this.position.push(x, y, z);
      this.color.push(1, 1, 1);
    };
    corner(x0, z0);
    corner(x1, z0);
    corner(x1, z1);
    corner(x0, z0);
    corner(x1, z1);
    corner(x0, z1);
  }
}

/** White glass shows the hour outside as it is; the rest is the tint it is, under that light. */
const CLEAR = 0xffffff;
const PAPER = 0xfde6e1;
/** A lighthouse's doorway is the stair going down, and it is dark. */
const STAIR = 0x2a1a14;

function floorPattern(k: SceneryContext, g: THREE.Group, plan: InteriorPlan, rng: Rng): void {
  const W = plan.width;
  const D = plan.depth;
  const round = plan.shape === 'round';
  const R = W / 2 - 0.05;
  const cz = D / 2;
  const insideRound = (x: number, z: number, half: number): boolean =>
    !round || Math.hypot(Math.abs(x) + half, Math.abs(z - cz) + half) <= R;
  const { floor, floorAlt } = plan.colors;
  switch (plan.floor) {
    case 'boards': {
      const bw = 0.28 * M;
      for (let x = -W / 2, i = 0; x < W / 2 - 0.01; x += bw, i++) {
        const mid = x + bw / 2;
        const half = round ? Math.sqrt(Math.max(0, R * R - mid * mid)) : D / 2;
        if (half < 0.2) continue;
        const color = i % 3 === 1 ? floorAlt : i % 3 === 2 ? retone(floor, 0.94) : floor;
        box(k, g, bw - 0.02, PROUD, half * 2, color, mid, 0, round ? cz : D / 2);
      }
      return;
    }
    case 'tiles':
    case 'stone': {
      const size = plan.floor === 'tiles' ? 0.5 * M : 1.1 * M;
      for (let x = -W / 2 + size / 2, i = 0; x < W / 2; x += size, i++) {
        for (let z = size / 2, j = 0; z < D; z += size, j++) {
          if ((i + j) % 2 === 1 && plan.floor === 'tiles') continue;
          if (!insideRound(x, z, size / 2)) continue;
          const color = plan.floor === 'tiles' ? floorAlt : rng.chance(0.5) ? floorAlt : retone(floor, rng.range(0.9, 1.05));
          box(k, g, size - 0.03 * M, PROUD, size - 0.03 * M, color, x, 0, z);
        }
      }
      return;
    }
    case 'tatami': {
      const mw = 0.9 * M;
      for (let x = -W / 2 + 0.05; x + mw <= W / 2; x += mw) {
        for (let z = 0.05, j = 0; z + mw <= D; j++) {
          const long = (Math.round(x / mw) + j) % 2 === 0 && z + 2 * mw <= D;
          const len = long ? 2 * mw : mw;
          box(k, g, mw - 0.06 * M, PROUD, len - 0.06 * M, floor, x + mw / 2, 0, z + len / 2);
          z += len;
        }
      }
      return;
    }
    case 'carpet': {
      const band = 0.4 * M;
      if (round) {
        put(g, k.ringWall(R - band, R, PROUD, floorAlt, plan.sides), 0, 0, cz);
        return;
      }
      box(k, g, W - 0.2, PROUD, band, floorAlt, 0, 0, band / 2 + 0.1);
      box(k, g, W - 0.2, PROUD, band, floorAlt, 0, 0, D - band / 2 - 0.1);
      for (const sx of [-1, 1]) box(k, g, band, PROUD, D - 2 * band - 0.2, floorAlt, sx * (W / 2 - band / 2 - 0.1), 0, D / 2);
      return;
    }
    case 'straw': {
      for (let i = 0; i < Math.round((W * D) / (M * M)); i++) {
        const x = rng.range(-W / 2 + 0.3, W / 2 - 0.3);
        const z = rng.range(0.3, D - 0.3);
        if (!insideRound(x, z, 0.3)) continue;
        box(k, g, 0.5 * M, 0.02 * M, 0.04 * M, i % 2 === 0 ? floorAlt : retone(floor, 1.1), x, 0, z, rng.range(0, Math.PI));
      }
      return;
    }
    default:
  }
}

export interface BuiltRoom {
  /** The room and every piece in it: position, normal, colour and the ink's normals. */
  room: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  triangles: number;
}

/**
 * Builds a plan. `miniature`, when given, is the landmark a museum keeps under
 * glass: any group, standing on y = 0 and facing +Z, which is fitted onto the
 * `model` piece's footprint and height and merged with the rest.
 */
export function buildRoom(plan: InteriorPlan, k: SceneryContext, miniature?: THREE.Object3D | null): BuiltRoom {
  const root = new THREE.Group();
  const glass = new Glass();
  const rng = rngFrom(plan.key, 'kit');
  const W = plan.width;
  const D = plan.depth;
  const H = plan.height;
  const { wall, dado, ceiling, trim, floor } = plan.colors;
  const round = plan.shape === 'round';
  const cz = D / 2;

  // The floor slab, and its pattern over it.
  if (round) put(root, k.column(W / 2 + WALL, 0.2, floor, plan.sides), 0, -0.2, cz);
  else box(k, root, W + 2 * WALL, 0.2, D + 2 * WALL, floor, 0, -0.2, D / 2);
  floorPattern(k, root, plan, rng);

  // The walls, each with its openings cut, a dado below the lowest sill and a skirting.
  const doorHole = [0, 0, plan.door.w, plan.door.h] as const;
  const sills = (openings: readonly Opening[]): number => openings.reduce((low, o) => Math.min(low, o.y), Infinity);
  if (round) {
    const step = (Math.PI * 2) / plan.sides;
    for (let i = 0; i < plan.sides; i++) {
      const at = i * step;
      const frame = wallFrame(plan, 'front', at);
      const g = onWall(root, frame, 0);
      const mine = plan.openings.filter((o) => Math.abs(Math.atan2(Math.sin(o.at - at), Math.cos(o.at - at))) < step / 2);
      const holes = mine.map((o) => [0, o.y, Math.min(o.w, frame.length - 0.4), o.h] as const);
      if (i === 0) holes.push(doorHole);
      wallWithHoles(k, g, frame.length, H, wall, holes);
      const low = Math.min(i === 0 ? 0 : Infinity, sills(mine));
      const band = Math.min(0.9 * M, low - 0.05 * M);
      if (band > 0.3 * M && i !== 0) box(k, g, frame.length, band, 0.05 * M, dado, 0, 0, 0.025 * M);
      for (const o of mine) {
        windowFrame(k, g, { ...o, at: 0, w: Math.min(o.w, frame.length - 0.4) }, trim);
        glass.pane(frame, 0, o.y, Math.min(o.w, frame.length - 0.4), o.h, -0.05, CLEAR);
      }
      if (i === 0) {
        doorFrame(k, g, plan);
        glass.pane(frame, 0, 0, plan.door.w, plan.door.h, -WALL * 0.6, plan.type === 'lighthouse' ? STAIR : CLEAR);
      }
    }
  } else {
    for (const side of ['front', 'back', 'left', 'right'] as const) {
      const frame = wallFrame(plan, side);
      const g = onWall(root, frame, 0);
      const mine = plan.openings.filter((o) => o.wall === side);
      const alongOf = (o: Opening): number =>
        side === 'left' ? D / 2 - o.at : side === 'right' ? o.at - D / 2 : side === 'back' ? -o.at : o.at;
      const holes = mine.map((o) => [alongOf(o), o.y, o.w, o.h] as const);
      if (side === 'front') holes.push(doorHole);
      wallWithHoles(k, g, frame.length, H, wall, holes);
      // The dado: runs between the openings that come down below it.
      const band = Math.min(0.95 * M, sills(mine) - 0.05 * M);
      if (band > 0.3 * M) {
        if (side === 'front') {
          const run = (frame.length - plan.door.w) / 2 - 0.15 * M;
          for (const sx of [-1, 1]) box(k, g, run, band, 0.05 * M, dado, sx * (plan.door.w / 2 + 0.15 * M + run / 2), 0, 0.025 * M);
        } else box(k, g, frame.length, band, 0.05 * M, dado, 0, 0, 0.025 * M);
      } else if (side !== 'front') box(k, g, frame.length, 0.12 * M, 0.04 * M, trim, 0, 0, 0.02 * M);
      for (const o of mine) {
        const along = alongOf(o);
        windowFrame(k, g, { ...o, at: along }, trim);
        const panes = o.stained;
        if (panes === null) glass.pane(frame, along, o.y, o.w, o.h, -0.05, o.paper ? PAPER : CLEAR);
        else {
          // Stained glass: a colour a pane, two across and three up.
          for (let r = 0; r < 3; r++) {
            for (let cc = 0; cc < 2; cc++) {
              glass.pane(frame, along - o.w / 4 + (cc * o.w) / 2, o.y + (r * o.h) / 3, o.w / 2, o.h / 3, -0.05, panes[(r * 2 + cc) % panes.length]!);
            }
          }
        }
      }
      if (side === 'front') {
        doorFrame(k, g, plan);
        glass.pane(frame, 0, 0, plan.door.w, plan.door.h, -WALL * 0.6, CLEAR);
      }
    }
  }

  // The ceiling: whole, or round a courtyard open to the sky.
  if (round) put(root, k.column(W / 2 + WALL, 0.2, ceiling, plan.sides), 0, H, cz);
  else if (plan.courtyard) {
    const hole = Math.min(W, D) * 0.42;
    box(k, root, W + 2 * WALL, 0.2, (D - hole) / 2 + WALL, ceiling, 0, H, (D - hole) / 4 - WALL / 2);
    box(k, root, W + 2 * WALL, 0.2, (D - hole) / 2 + WALL, ceiling, 0, H, D - (D - hole) / 4 + WALL / 2);
    for (const sx of [-1, 1]) box(k, root, (W - hole) / 2 + WALL, 0.2, hole, ceiling, sx * (W / 2 - (W - hole) / 4 + WALL / 2), H, D / 2);
    glass.sky(-hole / 2, hole / 2, D / 2 - hole / 2, D / 2 + hole / 2, H + 0.2);
    // An eave round the opening.
    for (const sz of [-1, 1]) box(k, root, hole + 0.3 * M, 0.25 * M, 0.15 * M, trim, 0, H - 0.1 * M, D / 2 + sz * hole / 2);
    for (const sx of [-1, 1]) box(k, root, 0.15 * M, 0.25 * M, hole, trim, sx * hole / 2, H - 0.1 * M, D / 2);
  } else box(k, root, W + 2 * WALL, 0.2, D + 2 * WALL, ceiling, 0, H, D / 2);
  if (plan.beams) {
    if (round) {
      for (let i = 0; i < plan.sides / 2; i++) box(k, root, W - 0.2, 0.2 * M, 0.15 * M, trim, 0, H - 0.2 * M, cz, (i * Math.PI * 2) / plan.sides);
    } else {
      const span = W < D ? W : D;
      const across = W < D;
      const count = Math.max(2, Math.floor((across ? D : W) / (1.6 * M)));
      for (let i = 1; i < count; i++) {
        const t = (i / count) * (across ? D : W);
        if (across) box(k, root, span, 0.22 * M, 0.18 * M, trim, 0, H - 0.22 * M, t);
        else box(k, root, 0.18 * M, 0.22 * M, span, trim, -W / 2 + t, H - 0.22 * M, D / 2);
      }
    }
  }

  // The pieces.
  for (const item of plan.items) {
    const g = new THREE.Group();
    g.position.set(item.x, item.y, item.z);
    g.rotation.y = (item.q * Math.PI) / 2;
    root.add(g);
    BUILD[item.kind](k, item, g, rngFrom(plan.key, item.kind, item.x, item.z));
    if (item.kind === 'model') placeMiniature(g, item, miniature ?? null, k);
  }

  const pieces: import('./merge.ts').MergePiece[] = [];
  const merged = mergeMeshes(root, pieces);
  for (const piece of pieces) {
    if (piece.mirrored) throw new Error(`interior ${plan.type}: a piece is reflected`);
  }
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
  const outline = new Int8Array(merged.outline.length);
  for (let i = 0; i < outline.length; i++) outline[i] = Math.round(merged.outline[i]! * 127);
  const room = new THREE.BufferGeometry();
  room.setAttribute('position', new THREE.BufferAttribute(merged.position, 3));
  room.setAttribute('normal', new THREE.BufferAttribute(merged.normal, 3));
  room.setAttribute('color', new THREE.BufferAttribute(merged.color, 3));
  room.setAttribute('outlineNormal', new THREE.BufferAttribute(outline, 3, true));
  room.computeBoundingSphere();

  const glassGeometry = new THREE.BufferGeometry();
  glassGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glass.position, 3));
  glassGeometry.setAttribute('color', new THREE.Float32BufferAttribute(glass.color, 3));
  glassGeometry.computeBoundingSphere();
  return { room, glass: glassGeometry, triangles: merged.triangles + glass.position.length / 9 };
}

/** The doorway's frame: two jambs and a lintel standing proud of the wall's inner face. */
function doorFrame(k: SceneryContext, g: THREE.Group, plan: InteriorPlan): void {
  const t = 0.12 * M;
  const { w, h } = plan.door;
  const color = plan.colors.trim;
  for (const sx of [-1, 1]) box(k, g, t, h + t, 0.12 * M, color, sx * (w / 2 + t / 2), 0, 0.02);
  box(k, g, w + 2 * t, t, 0.12 * M, color, 0, h, 0.02);
  // The reveal: the wall's thickness lined, so the doorway reads as a hole in something.
  for (const sx of [-1, 1]) box(k, g, 0.04, h, WALL, retone(color, 0.8), sx * (w / 2 - 0.02), 0, -WALL / 2);
}

/** Fits a landmark's miniature onto the `model` piece, or a plain obelisk when there is none. */
function placeMiniature(g: THREE.Group, item: Item, miniature: THREE.Object3D | null, k: SceneryContext): void {
  if (miniature === null) {
    put(g, k.taper(item.w * 0.15, item.w * 0.06, item.h * 0.9, PALETTE.bone, 4), 0, 0, 0);
    put(g, k.taper(item.w * 0.06, 0.01, item.h * 0.1, PALETTE.gold, 4), 0, item.h * 0.9, 0);
    return;
  }
  miniature.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(miniature);
  const size = bounds.getSize(new THREE.Vector3());
  const scale = Math.min(item.w / Math.max(1e-3, size.x, size.z), item.h / Math.max(1e-3, size.y));
  // A uniform scale on a parent of its own: T * R * S is then exactly a scale.
  const holder = new THREE.Group();
  holder.scale.setScalar(scale);
  holder.position.set(-(bounds.min.x + bounds.max.x) / 2 * scale, -bounds.min.y * scale, -(bounds.min.z + bounds.max.z) / 2 * scale);
  holder.add(miniature);
  g.add(holder);
}

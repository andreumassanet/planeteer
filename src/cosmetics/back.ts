/**
 * What hangs on the traveller's back, built to the back it hangs on.
 *
 * In the rig's frame (`fit.ts`), behind the furthest point of the torso
 * between the shoulder blades (`BackFit.backZ`, the rucksack's own back when
 * one is worn): nothing here passes through a jacket, a hood or a pack.
 * Hung on the `Chest` bone, a piece turns with the shoulders and stays out
 * of the arms' way, which swing at the sides; it is stowed while its wearer
 * sits (`stowCosmetics`), since a seat's back and a cab's roof are where it
 * would be.
 *
 * Every piece is still: wings that do not flap, a jetpack that does not
 * burn. A pennant flies the look's own colours.
 */
import * as THREE from 'three';
import { craftContext } from '../craft/build.ts';
import { PALETTE } from '../theme.ts';
import type { BackFit } from './fit.ts';
import { FINISH, ball, disc, domeProfile, ellipse, ringProfile, slab, turned, type Finish } from './shapes.ts';

/** The look's colours a back piece may wear: its top's, its bottom's and its rucksack's. */
export interface BackColours {
  top: number;
  bottom: number;
  pack: number;
}

export interface BackModel {
  build(fit: BackFit, colours: BackColours): [THREE.Object3D, Finish][];
}

const tone = (color: number, factor: number): number => craftContext().tone(color, factor);
const V = THREE.Vector3;
const UP = new V(0, 1, 0);
const BACKWARD = new V(0, 0, -1);
const RIGHT = new V(-1, 0, 0);

function group(...pieces: THREE.Object3D[]): THREE.Object3D {
  const out = new THREE.Group();
  for (const piece of pieces) out.add(piece);
  return out;
}

/** Every back piece, by catalogue id. */
export const BACK_MODELS: Readonly<Record<string, BackModel>> = {
  'back-pennant': {
    build(fit, colours) {
      const ctx = craftContext();
      const z = fit.backZ - 0.035;
      const mount = ctx.box(0.08, 0.1, 0.03, PALETTE.bark);
      mount.position.set(0.06, 1.28, fit.backZ - 0.018);
      const pole = ctx.column(0.011, 1.25, PALETTE.brown, 6);
      pole.position.set(0.1, 1.1, z);
      const finial = ball(0.022, PALETTE.gold);
      finial.position.set(0.1, 2.37, z);
      // Three stripes tapering to the tip, flown back from the pole's head.
      const stripes = [colours.top, PALETTE.white, colours.pack];
      const flag = group();
      const top = 0.0;
      const drop = 0.24;
      const length = 0.46;
      for (let i = 0; i < 3; i++) {
        const y0 = top - (drop * i) / 3;
        const y1 = top - (drop * (i + 1)) / 3;
        const tip = -drop / 2;
        // Each band's edges run to the tip: its far end is where they meet the band's own lines.
        const at = (y: number, t: number): number => y + (tip - y) * t;
        const band = slab(
          [
            [0, y1],
            [length * 0.98, at(y1, 0.98)],
            [length * 0.98, at(y0, 0.98)],
            [0, y0],
          ],
          0.008,
          stripes[i]!,
        );
        flag.add(band);
      }
      flag.rotation.y = Math.PI / 2;
      flag.position.set(0.1, 2.32, z - 0.01);
      return [
        [group(mount, pole, finial), FINISH.none],
        [flag, FINISH.cloth],
      ];
    },
  },
  'back-guitar': {
    build(fit) {
      const ctx = craftContext();
      const depth = 0.1;
      const z = fit.backZ - 0.012 - depth;
      const shell = PALETTE.bark;
      const lower = disc(0.19, 0.17, depth, shell, 12);
      lower.position.set(0, -0.2, 0);
      const upper = disc(0.15, 0.13, depth * 0.96, tone(shell, 1.06), 12);
      upper.position.set(0, 0.06, 0.002);
      const neck = ctx.box(0.1, 0.44, depth * 0.8, shell);
      neck.position.set(0, 0.12, depth * 0.5);
      const head = ctx.box(0.13, 0.16, depth * 0.85, tone(shell, 0.9));
      head.position.set(0, 0.54, depth * 0.5);
      const handle = ctx.box(0.12, 0.025, 0.03, PALETTE.tan);
      handle.position.set(0, -0.02, -0.012);
      const buckle = ctx.box(0.04, 0.04, 0.012, PALETTE.gold);
      buckle.position.set(0.12, -0.2, -0.004);
      const caseGroup = group(lower, upper, neck, head);
      const fittings = group(handle, buckle);
      const holder = group(caseGroup, fittings);
      holder.rotation.z = -0.42;
      holder.position.set(0, 1.25, z);
      return [[holder, FINISH.pack]];
    },
  },
  'back-surfboard': {
    build(fit) {
      const length = 1.28;
      const half = 0.19;
      const outline: [number, number][] = [];
      // A pointed nose and a round tail, from the tail round the right edge to the nose and back.
      const rows = 9;
      for (let i = 0; i <= rows; i++) {
        const t = i / rows;
        const y = -length / 2 + t * length;
        const width = half * Math.sin(Math.PI * Math.min(1, 0.14 + t * 0.9)) ** 0.7;
        outline.push([width, y]);
      }
      for (let i = rows; i >= 0; i--) {
        const [x, y] = outline[i]!;
        if (x > 1e-3 || i === 0) outline.push([-x, y]);
      }
      const thick = 0.045;
      const board = slab(outline, thick, PALETTE.skyBlue);
      const stripe = slab(
        [
          [0.02, -length / 2 + 0.06],
          [0.02, length / 2 - 0.1],
          [-0.02, length / 2 - 0.1],
          [-0.02, -length / 2 + 0.06],
        ],
        thick + 0.012,
        PALETTE.white,
      );
      const fin = slab(
        [
          [0, 0],
          [0.12, 0],
          [0, 0.1],
        ],
        0.012,
        PALETTE.crimson,
      );
      // Its base along the board, its point away from the back, its thickness across.
      const basis = new THREE.Matrix4().makeBasis(UP, BACKWARD, RIGHT);
      if (!(basis.determinant() > 0)) throw new Error('cosmetics: the fin is turned through a mirror');
      fin.quaternion.setFromRotationMatrix(basis);
      fin.position.set(0, -length / 2 + 0.14, -thick / 2 + 0.002);
      const holder = group(board, stripe, fin);
      holder.rotation.z = 0.12;
      // Long enough to reach the hips, so clear of them too.
      holder.position.set(-0.02, 1.38, Math.min(fit.backZ, fit.lowZ) - 0.016 - thick / 2);
      return [[holder, FINISH.none]];
    },
  },
  'back-maptube': {
    build(fit) {
      const ctx = craftContext();
      const r = 0.045;
      const tube = ctx.column(r, 0.72, PALETTE.sand, 8);
      tube.position.y = -0.36;
      const caps: THREE.Object3D[] = [];
      for (const y of [-0.38, 0.33]) {
        const cap = ctx.column(r + 0.008, 0.05, PALETTE.brown, 8);
        cap.position.y = y;
        caps.push(cap);
      }
      const band = ctx.column(r + 0.005, 0.03, PALETTE.crimson, 8);
      band.position.y = 0.0;
      const holder = group(tube, ...caps, band);
      holder.rotation.z = 0.75;
      holder.position.set(0, 1.3, fit.backZ - 0.024 - r);
      return [
        [group(holder), FINISH.pack],
      ];
    },
  },
  'back-jetpack': {
    build(fit) {
      const ctx = craftContext();
      const plate = ctx.box(0.26, 0.34, 0.04, PALETTE.steel);
      plate.position.set(0, 1.1, fit.backZ - 0.012 - 0.02);
      const r = 0.065;
      const tanks: THREE.Object3D[] = [];
      const metal: THREE.Object3D[] = [plate];
      const z = fit.backZ - 0.04 - r;
      for (const s of [1, -1]) {
        const tank = ctx.column(r, 0.34, PALETTE.white, 10);
        tank.position.set(s * 0.078, 1.08, z);
        const dome = ellipse(turned(domeProfile(3), PALETTE.white, 10), r * 1.06, 0.05, r * 1.06, 1.42, z);
        dome.position.x = s * 0.078;
        const stripe = ellipse(turned(ringProfile(0.9, 1.12, 0.04), PALETTE.red, 10), r, 1, r, 1.3, z);
        stripe.position.x = s * 0.078;
        tanks.push(tank, dome, stripe);
        const nozzle = ctx.taper(0.052, 0.034, 0.07, PALETTE.steel, 8);
        nozzle.position.set(s * 0.078, 1.01, z);
        metal.push(nozzle);
      }
      return [
        [group(...tanks), FINISH.none],
        [group(...metal), FINISH.none],
      ];
    },
  },
  'back-wings': {
    build(fit) {
      // Three folds of paper a wing, each a long blade from the shoulder blade out and up, layered away from the back.
      const folds: [number, [number, number][]][] = [
        [PALETTE.white, [[0, 0], [0.74, 0.4], [0.66, 0.5], [0, 0.16]]],
        [PALETTE.cream, [[0, -0.03], [0.68, 0.16], [0.62, 0.3], [0, 0.08]]],
        [tone(PALETTE.bone, 1.08), [[0, -0.09], [0.55, -0.1], [0.52, 0.07], [0, 0]]],
      ];
      const pieces: THREE.Object3D[] = [];
      for (const s of [1, -1]) {
        const wing = group();
        folds.forEach(([colour, points], i) => {
          const blade = slab(points, 0.012, colour);
          // Away from the back on either side: the right wing is the left turned half round.
          blade.position.z = -s * i * 0.016;
          wing.add(blade);
        });
        // Swept back: the left's tip towards -Z, the right's the same once turned.
        wing.rotation.y = s > 0 ? 0.55 : Math.PI - 0.55;
        wing.position.set(s * 0.05, 1.32, fit.backZ - 0.03);
        pieces.push(wing);
      }
      return [[group(...pieces), FINISH.none]];
    },
  },
  'back-kite': {
    build(fit) {
      const ctx = craftContext();
      const w = 0.27;
      const top = 0.42;
      const bottom = -0.3;
      const quarters: [number, [number, number][]][] = [
        [PALETTE.crimson, [[0, 0], [0, top], [-w, 0]]],
        [PALETTE.gold, [[0, 0], [w, 0], [0, top]]],
        [PALETTE.skyBlue, [[0, 0], [-w, 0], [0, bottom]]],
        [PALETTE.green, [[0, 0], [0, bottom], [w, 0]]],
      ];
      const sail = group(...quarters.map(([colour, points]) => slab(points, 0.01, colour)));
      const spars = group(
        ctx.strut(new V(0, bottom + 0.01, -0.012), new V(0, top - 0.01, -0.012), 0.014, PALETTE.bark),
        ctx.strut(new V(-w + 0.01, 0, -0.012), new V(w - 0.01, 0, -0.012), 0.014, PALETTE.bark),
      );
      const tail = group();
      let y = bottom;
      for (let i = 0; i < 4; i++) {
        const next = y - 0.11;
        tail.add(ctx.strut(new V(0, y, -0.004), new V(0, next, -0.004), 0.008, PALETTE.bone));
        const bow = ball(0.026, [PALETTE.crimson, PALETTE.gold, PALETTE.skyBlue, PALETTE.green][i]!);
        bow.scale.set(1.5, 0.7, 0.5);
        bow.position.set(0, next, -0.004);
        tail.add(bow);
        y = next;
      }
      const holder = group(sail, spars, tail);
      holder.rotation.z = 0.16;
      holder.position.set(0, 1.28, Math.min(fit.backZ, fit.lowZ) - 0.03);
      return [
        [group(holder), FINISH.cloth],
      ];
    },
  },
  'back-satchel': {
    build(fit) {
      const ctx = craftContext();
      const depth = 0.08;
      const z = fit.backZ - 0.012 - depth;
      const bag = ctx.box(0.28, 0.21, depth, PALETTE.darkOlive);
      bag.position.set(0, 0, depth / 2);
      const flap = ctx.box(0.29, 0.12, 0.014, tone(PALETTE.darkOlive, 0.86));
      flap.position.set(0, 0.1, -0.006);
      const buckle = ctx.box(0.05, 0.04, 0.012, PALETTE.gold);
      buckle.position.set(0, 0.08, -0.018);
      const badge = ball(0.02, PALETTE.gold);
      badge.scale.set(1, 1, 0.4);
      badge.position.set(-0.08, 0.15, -0.016);
      const bagGroup = group(bag, flap, buckle, badge);
      bagGroup.rotation.z = 0.1;
      bagGroup.position.set(-0.04, 1.14, z);
      const strap = ctx.strut(new V(0.08, 1.24, fit.backZ - 0.03), new V(0.13, fit.shoulderY - 0.01, fit.backZ - 0.03), 0.024, PALETTE.brown);
      return [[group(bagGroup, strap), FINISH.pack]];
    },
  },
};

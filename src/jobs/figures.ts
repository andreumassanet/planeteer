/**
 * Who and what waits at a job's pickup, drawn near the player: a fare on the
 * verge waving at the traffic, a walker on a hilltop waving at the sky, a
 * swimmer treading water beside an orange buoy, a stack of crates beside an
 * airstrip; and, once collected, the passenger in the player's vehicle, or a
 * crate on the seat. People are the cast (`folk.ts`), dressed by where the job
 * is offered and played by the hero's own motion; a pickup further than
 * `FIGURE_REACH` or past the first `MAX_FIGURES` is not drawn at all.
 */
import * as THREE from 'three';
import { SEAT_SHIN, SEAT_THIGH, createMotion } from '../avatar.ts';
import type { Motion } from '../avatar/motion-types.ts';
import { craftContext, craftMaterial, geometryOf, soupOf } from '../craft/build.ts';
import type { Folk } from '../folk.ts';
import type { Person } from '../cast/types.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';

/** How near the player a pickup is drawn, units, and how many at once. */
export const FIGURE_REACH = 420;
export const MAX_FIGURES = 6;
/** Seconds between a waiting person's waves, either side of its mean. */
const WAVE_EVERY: readonly [number, number] = [2.2, 4.5];
/** How deep a swimmer treading water stands, feet under the surface: the shoulders and the waving arm above it. */
const SWIM_DEPTH = AVATAR_HEIGHT * 0.6;

export type WaitingKind = 'hail' | 'walker' | 'swimmer' | 'crates';

export interface Waiting {
  /** A person's key, the same every time for the same job, or the crates' own. */
  who: string;
  kind: WaitingKind;
  /** Where, a unit direction. */
  at: THREE.Vector3;
  /** Which way they face, a unit tangent at `at`, or null for any. */
  facing: THREE.Vector3 | null;
  /** The style they are dressed in (`regionFor(...).id`). */
  region: string;
}

export interface FiguresOptions {
  folk: Folk;
  /** The ground a figure stands on under a unit direction, as a radius: the drawn land and the made surfaces on it. */
  groundAt(direction: THREE.Vector3): number;
  radius: number;
}

export interface Figures {
  readonly group: THREE.Group;
  /** Each frame, with what is waiting near, nearest first, and the viewer. */
  update(dt: number, waiting: readonly Waiting[], viewer: THREE.Vector3): void;
  /**
   * Puts `who` in a seat frame (a person seated, or `crate` for a load), or
   * empties the one held with null. The frame is a child of the vehicle's
   * model at the hip (`FleetSeats.seatFrame`).
   */
  ride(frame: THREE.Object3D | null, who: string, region: string, crate: boolean): void;
  /** The seat frame the rider sits in now, or null. */
  readonly riding: THREE.Object3D | null;
  readonly stats: { drawn: number; riding: boolean };
  dispose(): void;
}

interface Figure {
  root: THREE.Group;
  person: Person | null;
  motion: Motion | null;
  extra: THREE.Mesh | null;
  wave: number;
  kind: WaitingKind;
}

const UP = new THREE.Vector3(0, 1, 0);

/** A pallet with three crates on it, standing on y = 0, as one painted mesh. */
function cratesGeometry(): THREE.BufferGeometry {
  const ctx = craftContext();
  const group = new THREE.Group();
  const pallet = ctx.box(3.2, 0.35, 2.4, ctx.tone(PALETTE.brown, 0.85));
  group.add(pallet);
  const sizes: [number, number, number, number, number][] = [
    [1.4, 1.2, 1.4, -0.75, 0],
    [1.4, 1.2, 1.4, 0.75, 0],
    [1.3, 1.1, 1.3, 0, 1.2],
  ];
  for (const [w, h, d, x, y] of sizes) {
    const crate = ctx.box(w, h, d, ctx.tone(PALETTE.tan, 1.05));
    crate.position.set(x, 0.35 + y, 0);
    group.add(crate);
    const band = ctx.box(w + 0.16, 0.16, d + 0.16, ctx.tone(PALETTE.clay, 0.8));
    band.position.set(x, 0.35 + y + h * 0.45, 0);
    group.add(band);
  }
  return geometryOf([soupOf(group)]);
}

/** One crate held on a seat, its middle on the hip, and the hip at the origin. */
function seatCrateGeometry(): THREE.BufferGeometry {
  const ctx = craftContext();
  const group = new THREE.Group();
  const crate = ctx.box(1.1, 0.9, 1.1, ctx.tone(PALETTE.tan, 1.05));
  crate.position.set(0, -0.1, 0.25);
  group.add(crate);
  const band = ctx.box(1.24, 0.14, 1.24, ctx.tone(PALETTE.clay, 0.8));
  band.position.set(0, 0.25, 0.25);
  group.add(band);
  return geometryOf([soupOf(group)]);
}

/** The orange buoy a swimmer holds on to, floating at y = 0. */
function buoyGeometry(): THREE.BufferGeometry {
  const ctx = craftContext();
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.26, 8, 14), ctx.toon(PALETTE.orange));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0.95, 0.05, 0.5);
  group.add(ring);
  const geometry = geometryOf([soupOf(group)]);
  ring.geometry.dispose();
  return geometry;
}

export function createFigures(options: FiguresOptions): Figures {
  const { folk, radius: R } = options;
  const group = new THREE.Group();
  group.name = 'jobs:figures';
  let crates: THREE.BufferGeometry | null = null;
  let seatCrate: THREE.BufferGeometry | null = null;
  let buoy: THREE.BufferGeometry | null = null;
  const figures = new Map<string, Figure>();
  const stats = { drawn: 0, riding: false };
  const basis = new THREE.Matrix4();
  const side = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const up = new THREE.Vector3();
  const wanted = new Set<string>();
  let rider: { frame: THREE.Object3D; mesh: THREE.Mesh; key: string } | null = null;

  function release(key: string, figure: Figure): void {
    if (figure.person !== null) {
      figure.root.remove(figure.person.root);
      folk.release(figure.person);
    }
    figure.root.removeFromParent();
    figures.delete(key);
  }

  function build(waiting: Waiting): Figure | null {
    const root = new THREE.Group();
    root.name = `jobs:${waiting.kind}`;
    const figure: Figure = { root, person: null, motion: null, extra: null, wave: 0, kind: waiting.kind };
    if (waiting.kind === 'crates') {
      crates ??= cratesGeometry();
      const mesh = new THREE.Mesh(crates, craftMaterial());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      figure.extra = mesh;
    } else {
      const person = folk.dress(waiting.who, waiting.region);
      if (person === null) return null;
      person.root.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) object.castShadow = true;
      });
      root.add(person.root);
      figure.person = person;
      figure.motion = createMotion(person);
      figure.wave = Math.random() * WAVE_EVERY[0];
      if (waiting.kind === 'swimmer') {
        buoy ??= buoyGeometry();
        const ring = new THREE.Mesh(buoy, craftMaterial());
        ring.position.y = SWIM_DEPTH - 0.15;
        root.add(ring);
        figure.extra = ring;
      }
    }
    group.add(root);
    return figure;
  }

  /** Stands a figure's root on its ground, facing its way, the matrix a proper rotation. */
  function stand(figure: Figure, waiting: Waiting): void {
    up.copy(waiting.at).normalize();
    const ground = waiting.kind === 'swimmer' ? R - SWIM_DEPTH : options.groundAt(up);
    ahead.copy(waiting.facing ?? side.set(0, 0, 1)).projectOnPlane(up);
    if (ahead.lengthSq() < 1e-8) ahead.copy(UP).projectOnPlane(up);
    if (ahead.lengthSq() < 1e-8) ahead.set(1, 0, 0).projectOnPlane(up);
    ahead.normalize();
    // X = Y x Z, so the basis is a proper rotation.
    side.crossVectors(up, ahead).normalize();
    basis.makeBasis(side, up, ahead);
    if (basis.determinant() <= 0) throw new Error('jobs: a figure would stand mirrored');
    figure.root.quaternion.setFromRotationMatrix(basis);
    figure.root.position.copy(up).multiplyScalar(ground);
  }

  function animate(figure: Figure, dt: number): void {
    const motion = figure.motion;
    if (motion === null) return;
    // A swimmer treads water upright and waves for help as the rest wave for a ride.
    figure.wave -= dt;
    if (figure.wave <= 0 && motion.emoting === null) {
      motion.emote('wave');
      figure.wave = WAVE_EVERY[0] + Math.random() * (WAVE_EVERY[1] - WAVE_EVERY[0]);
    }
    if (motion.emoting === null) motion.foot(dt, 0, false);
    else motion.still(dt);
  }

  return {
    group,
    stats,
    get riding() {
      return rider?.frame ?? null;
    },
    update(dt, waiting, viewer) {
      wanted.clear();
      let drawn = 0;
      for (const item of waiting) {
        if (drawn >= MAX_FIGURES) break;
        if (item.at.angleTo(viewer) * R > FIGURE_REACH) continue;
        let figure = figures.get(item.who);
        if (figure === undefined) {
          const made = build(item);
          if (made === null) continue;
          figures.set(item.who, made);
          figure = made;
        }
        wanted.add(item.who);
        stand(figure, item);
        animate(figure, dt);
        drawn++;
      }
      for (const [key, figure] of figures) if (!wanted.has(key)) release(key, figure);
      stats.drawn = drawn;
    },
    ride(frame, who, region, crate) {
      if (rider !== null && (frame === null || rider.frame !== frame || rider.key !== who)) {
        rider.mesh.removeFromParent();
        if (rider.mesh.geometry !== seatCrate) rider.mesh.geometry.dispose();
        rider = null;
      }
      if (frame === null || rider !== null) {
        stats.riding = rider !== null;
        return;
      }
      let geometry: THREE.BufferGeometry | null = null;
      if (crate) geometry = seatCrate ??= seatCrateGeometry();
      else {
        const seated = folk.seated(who, region, AVATAR_HEIGHT, { thigh: SEAT_THIGH, shin: SEAT_SHIN });
        if (seated !== null) {
          const holder = new THREE.Group();
          holder.add(seated);
          geometry = geometryOf([soupOf(holder)]);
          seated.geometry.dispose();
        }
      }
      if (geometry === null) return;
      const mesh = new THREE.Mesh(geometry, craftMaterial());
      mesh.name = 'jobs:rider';
      mesh.castShadow = true;
      frame.add(mesh);
      rider = { frame, mesh, key: who };
      stats.riding = true;
    },
    dispose() {
      for (const [key, figure] of figures) release(key, figure);
      if (rider !== null) {
        rider.mesh.removeFromParent();
        if (rider.mesh.geometry !== seatCrate) rider.mesh.geometry.dispose();
      }
      rider = null;
      crates?.dispose();
      seatCrate?.dispose();
      buoy?.dispose();
      group.removeFromParent();
    },
  };
}

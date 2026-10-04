/**
 * What flies over another world that nobody flies: the inhabitants' own
 * craft — a saucer with a dome, a long shuttle — crossing the sky between
 * their towns, as Earth's airliners and light planes cross its sky
 * (`air-traffic.ts`). A world with nobody living on it has none.
 *
 * Near and capped, as Earth's are: `SHIPS` at once, each put down on a
 * straight line past the traveller at a height, a heading and a speed of its
 * own, and stood up again on another line once it has flown out of `REACH`.
 * Each is its own small mesh, inked, because it moves. **A saucer is the
 * saucer a traveller can fly** (`ufo.ts`), in the inhabitants' colours, its
 * lamps chasing round its band, its legs folded and its beam off at that
 * height — so the one in the sky is plainly the one parked by a town. They
 * are heard through Earth's passing voices
 * (`passing-sound.ts`): a saucer as a jet's hush, a shuttle as a rotor's beat.
 */

import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { AVATAR_HEIGHT } from '../avatar.ts';
import type { PassingSource } from '../passing-sound.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import { buildUfo } from './ufo.ts';
import type { UfoModel } from './ufo.ts';

/** How many fly at once, and how far from the traveller one is let go and flown again. */
const SHIPS = 4;
const REACH = 1700;
/** Their height over the ground under them, units, and their speed, units a second. */
const HEIGHT = [50, 190] as const;
const SPEED = [28, 75] as const;

export interface Skyships {
  group: THREE.Group;
  /** Every frame; `voices` gets the nearest of each kind for the passing sound. */
  update(dt: number, player: THREE.Vector3, groundAt: (point: THREE.Vector3) => number, radius: number): void;
  /** The nearest saucer and the nearest shuttle as the ear hears them, for `passing-sound.ts`. */
  readonly nearest: { jet: PassingSource | null; rotor: PassingSource | null };
  dispose(): void;
}

interface Ship {
  object: THREE.Group;
  /** The unit direction it is over, the tangent it flies along, and how high. */
  dir: THREE.Vector3;
  along: THREE.Vector3;
  height: number;
  speed: number;
  saucer: UfoModel | null;
  wobble: number;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

function toon(color: number, gradientMap: THREE.Texture, materials: THREE.Material[]): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ color, gradientMap });
  material.userData.outlineParameters = { thickness: 0.004, color: [0.11, 0.02, 0.01] };
  materials.push(material);
  return material;
}

export function createSkyships(ctx: SceneryContext, gradientMap: THREE.Texture, hull: number, trim: number): Skyships {
  const group = new THREE.Group();
  group.name = 'skyships';
  const materials: THREE.Material[] = [];
  const H = AVATAR_HEIGHT;
  const hullPaint = toon(hull, gradientMap, materials);
  const trimPaint = toon(trim, gradientMap, materials);
  const glow = new THREE.MeshBasicMaterial({ color: PALETTE.gold });
  glow.userData.outlineParameters = { visible: false };
  materials.push(glow);

  // A shuttle's shapes: a capsule with stubby wings and a tail.
  const lamp = new THREE.SphereGeometry(H * 0.18, 6, 4);
  const body = new THREE.CapsuleGeometry(H * 0.75, H * 3.2, 4, 10).rotateX(Math.PI / 2);
  const wing = new THREE.BoxGeometry(H * 3.4, H * 0.12, H * 1.1);
  const fin = new THREE.BoxGeometry(H * 0.12, H * 1.1, H * 0.9);
  const geometries = [lamp, body, wing, fin];
  /** What a saucer is told each frame: aloft, its legs up and its beam off at any height it flies. */
  const flying = { airborne: true, over: 0, pace: 0.6, burn: 0 };

  function shuttle(): THREE.Group {
    const object = new THREE.Group();
    object.add(new THREE.Mesh(body, hullPaint));
    const wings = new THREE.Mesh(wing, trimPaint);
    wings.position.set(0, -H * 0.2, -H * 0.4);
    object.add(wings);
    const tail = new THREE.Mesh(fin, trimPaint);
    tail.position.set(0, H * 0.7, -H * 1.9);
    object.add(tail);
    const nose = new THREE.Mesh(lamp, glow);
    nose.position.set(0, 0, H * 2.4);
    object.add(nose);
    return object;
  }

  const ships: Ship[] = [];
  for (let k = 0; k < SHIPS; k++) {
    // Every other one a saucer, in the hull's and the trim's colours.
    const saucer = k % 2 === 0 ? buildUfo(ctx, gradientMap, { wall: hull, roof: PALETTE.steel, accent: trim }) : null;
    const object = saucer?.group ?? shuttle();
    object.visible = false;
    group.add(object);
    ships.push({
      object,
      dir: new THREE.Vector3(),
      along: new THREE.Vector3(),
      height: 0,
      speed: 0,
      saucer,
      wobble: Math.random() * 10,
    });
  }

  const up = new THREE.Vector3();
  const side = new THREE.Vector3();
  const across = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const nearest: Skyships['nearest'] = { jet: null, rotor: null };
  const jet: PassingSource = { distance: 0, closing: 0, effort: 0.4 };
  const rotor: PassingSource = { distance: 0, closing: 0, effort: 0.5 };
  let placed = false;

  /** A new line for `ship`: across the sky somewhere near the traveller, entering from the far side. */
  function fly(ship: Ship, player: THREE.Vector3, anywhere: boolean): void {
    up.copy(player).normalize();
    side.set(up.y, -up.x, 0.3).cross(up).normalize();
    across.crossVectors(up, side);
    const heading = Math.random() * Math.PI * 2;
    ship.along.copy(side).multiplyScalar(Math.cos(heading)).addScaledVector(across, Math.sin(heading));
    const offset = rand(-REACH * 0.25, REACH * 0.25);
    const lateral = new THREE.Vector3().crossVectors(up, ship.along);
    const back = anywhere ? rand(-REACH * 0.8, REACH * 0.8) : REACH * 0.92;
    ship.dir.copy(player).addScaledVector(lateral, offset).addScaledVector(ship.along, -back).normalize();
    ship.along.addScaledVector(ship.dir, -ship.along.dot(ship.dir)).normalize();
    ship.height = rand(HEIGHT[0], HEIGHT[1]);
    ship.speed = rand(SPEED[0], SPEED[1]) * (ship.saucer !== null ? 1.2 : 1);
    ship.object.visible = true;
  }

  return {
    group,
    nearest,
    update(dt, player, groundAt, radius) {
      if (!placed) {
        for (const ship of ships) fly(ship, player, true);
        placed = true;
      }
      let jetNear = Infinity;
      let rotorNear = Infinity;
      for (const ship of ships) {
        // Along the sphere: turn the direction about the axis across its path.
        const angle = (ship.speed * dt) / radius;
        across.crossVectors(ship.dir, ship.along).normalize();
        ship.dir.applyAxisAngle(across, angle).normalize();
        ship.along.applyAxisAngle(across, angle);
        ship.along.addScaledVector(ship.dir, -ship.along.dot(ship.dir)).normalize();
        ship.wobble += dt;
        at.copy(ship.dir).multiplyScalar(radius + Math.max(0, groundAt(ship.dir)) + ship.height + Math.sin(ship.wobble * 0.7) * 3);
        ship.object.position.copy(at);
        side.crossVectors(ship.dir, ship.along).normalize();
        // +x = up x z: a rotation, determinant +1.
        basis.makeBasis(side, ship.dir, ship.along);
        ship.object.quaternion.setFromRotationMatrix(basis);
        if (ship.saucer !== null) {
          ship.object.rotateZ(Math.sin(ship.wobble * 1.3) * 0.08);
          flying.over = ship.height;
          ship.saucer.animate(dt, flying);
        }
        const distance = at.distanceTo(player);
        if (distance > REACH && at.clone().sub(player).dot(ship.along) > 0) fly(ship, player, false);
        const closing = -at.clone().sub(player).normalize().dot(ship.along) * ship.speed;
        if (ship.saucer !== null && distance < jetNear) {
          jetNear = distance;
          jet.distance = distance;
          jet.closing = closing;
        } else if (ship.saucer === null && distance < rotorNear) {
          rotorNear = distance;
          rotor.distance = distance;
          rotor.closing = closing;
        }
      }
      nearest.jet = Number.isFinite(jetNear) ? jet : null;
      nearest.rotor = Number.isFinite(rotorNear) ? rotor : null;
    },
    dispose() {
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      // The saucers' own meshes, which are theirs alone.
      for (const ship of ships) {
        ship.saucer?.group.traverse((one) => {
          const mesh = one as THREE.Mesh;
          if (mesh.isMesh !== true) return;
          mesh.geometry.dispose();
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
        });
      }
    },
  };
}

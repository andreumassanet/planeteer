/**
 * What a vehicle does between its pose and its paint: the body on its
 * springs, the wheels turning and steering, the propeller, a moored launch on
 * the swell.
 *
 * **None of it is the pose.** Where a vehicle is and which way it faces is the
 * player's (`player.ts`) or the wire's (`fleet.ts`, `fleet-sync.ts`), and
 * everything here is a child transform under it that nobody else reads: a
 * car's body pitching as it brakes moves no wheel off the road and no seat
 * off the wire. So it is the same for a vehicle you drive and one somebody
 * else does — theirs is handed the speed and turn its poses imply
 * (`fleet.ts`), yours the ones you are driving at — and a parked one is simply
 * handed nothing and eases back to rest.
 *
 * **The parts are the model's own.** `CraftModel.build` names what turns —
 * `'wheel'` about +X, `'prop'` about +Z — and everything else is moved into a
 * `'sprung'` group under the model the first time it is asked for here: the
 * body, the propeller on its nose, and the seat frames `fleet.ts` hangs on it,
 * so a passenger drawn in a moored launch rides its swell. The wheels stay
 * where the model put them, on the ground, which is what reads as suspension.
 *
 * Every transform here is a rotation about a point and a small translation,
 * so no matrix under a vehicle can come out reflected; `motionOf` asserts it
 * once all the same, because an inked part with a reflected matrix is a solid
 * blob of ink. Nothing allocates after the first call for a model.
 */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import type { CraftModel } from './contract.ts';

/** What the vehicle is doing this frame, as the motion reads it. */
export interface MotionInput {
  /** Speed along the vehicle's own +Z, units a second; negative astern. */
  speed: number;
  /** Rate of turn about its up, radians a second, positive to the left. */
  turnRate: number;
  /** The wheel or the rudder, -1 to 1, positive to the right. */
  steering: number;
  /** On its wheels: always for a car on the road, only on the ground for a plane. */
  grounded: boolean;
  /** Somebody at the controls, so the engine is running. */
  engine: boolean;
  /** Afloat with nobody driving: the swell is this file's to draw. When driven it is the pose's. */
  moored: boolean;
}

export interface CraftMotion {
  update(dt: number, input: Readonly<MotionInput>): void;
  /** Straight to rest: body square, nothing turning. */
  rest(): void;
  /** Still easing back to rest, or turning: worth another `update` with nothing asked of it. */
  readonly settling: boolean;
}

/** A motion input with nothing asked of it: parked, engine off. */
export const AT_REST: Readonly<MotionInput> = { speed: 0, turnRate: 0, steering: 0, grounded: true, engine: false, moored: false };

/**
 * A car's body on its springs: radians of pitch per unit a second squared of
 * acceleration, and of roll per unit a second squared of the turn's lateral
 * pull, each with its stop. Flat out from standing (`CAR_ACCELERATION_TIME`,
 * 1.3 s to 45) is 35 units a second squared at the start, a squat of two
 * degrees; the brake (`CAR_BRAKE_TIME`, 0.45 s) is a hundred, and dives to the
 * stop. The hardest turn at the road speed pulls about 34, a roll of three.
 */
const PITCH_PER_ACCEL = 0.001;
const MAX_PITCH = 0.05;
const ROLL_PER_PULL = 0.0015;
const MAX_ROLL = 0.06;
/**
 * The springs: stiffness and damping of a second-order follow, which is what
 * gives a body the small overshoot a car has and an ease does not — about one
 * and a half cycles a second, damped to half a swing.
 */
const SPRING = 90;
const DAMPING = 9;
/** How fast the measured acceleration is smoothed, per second: a frame's speed step is noise. */
const ACCEL_SMOOTHING = 6;
/** The idle: how far the body shakes on its mounts with the engine running and the car standing, in units and radians. */
const IDLE_SHAKE = 0.025;
const IDLE_ROLL = 0.004;
/** How far the front wheels go over at full lock, radians. */
const STEER_LOCK = 0.45;
/** Under this speed a vehicle counts as standing, units a second. */
const STANDING = 0.3;

/**
 * The propeller, in radians a second: ticking over on the ground, and at full
 * power; how fast it spins up and down, per second; and the most it is drawn
 * turning. A two-bladed propeller looks the same every half turn, so past half
 * a turn in two frames it seems to slow and run backwards: the blades are
 * drawn at no more than `PROP_DRAWN`, and past `DISC_FROM` a pale disc comes
 * up in the arc they sweep, which is what a propeller at speed looks like.
 */
const PROP_IDLE = 14;
const PROP_FULL = 60;
const PROP_EASE = 1.5;
const PROP_DRAWN = 28;
const DISC_FROM = 20;
const DISC_FULL = 50;
const DISC_OPACITY = 0.35;
/** The ground roll: radians of roll and pitch, and units of bounce, of a light aircraft on grass at rotation speed. */
const ROLL_WOBBLE = 0.012;
const PITCH_WOBBLE = 0.006;
const BOUNCE = 0.04;
/** The speed a plane's ground roll is scaled to, units a second: its rotation speed, near enough (`PLANE_ROTATE`). */
const ROLL_SCALE = 84;
/**
 * A launch on its mooring: heave in units, pitch and roll in radians, and
 * their periods' rates, none dividing another, so it never repeats as a loop.
 * Gentler than the driven swell in `player.ts`, because nobody is aboard.
 */
const MOOR_HEAVE = 0.12;
const MOOR_PITCH = 0.025;
const MOOR_ROLL = 0.04;

interface Parts {
  sprung: THREE.Group;
  /** The wheels and their radii, and which are steered (ahead of the middle). */
  wheels: THREE.Object3D[];
  radii: number[];
  steered: boolean[];
  props: THREE.Object3D[];
  /** Each propeller's blades, and the disc drawn in their place at speed. */
  blades: THREE.Object3D[];
  discs: THREE.Mesh[];
  /** The point the body pitches and rolls about: the axles' height, on the axis. */
  pivotY: number;
}

const euler = new THREE.Euler();
const offset = new THREE.Vector3();

/** A turning part's mesh's own box, in the part's frame, or null if it has none. */
function boxOf(part: THREE.Object3D): THREE.Box3 | null {
  const mesh = part.children.find((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
  if (mesh === undefined) return null;
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox;
}

function partsOf(group: THREE.Object3D, model: CraftModel): Parts {
  const sprung = new THREE.Group();
  sprung.name = 'sprung';
  const wheels: THREE.Object3D[] = [];
  const props: THREE.Object3D[] = [];
  for (const child of [...group.children]) {
    if (child.name === 'wheel') {
      wheels.push(child);
      continue;
    }
    // The body, the propeller, the seat frames: everything the springs carry.
    sprung.add(child);
  }
  group.add(sprung);
  group.traverse((part) => {
    if (part.name === 'prop') props.push(part);
  });
  // A wheel's mesh is built about its own axle (`Turning` in `build.ts`), so
  // its geometry's box is the wheel's, whatever the vehicle is doing.
  const radii = wheels.map((wheel) => {
    const extent = boxOf(wheel);
    return extent === null ? 0.5 : Math.max(0.05, (extent.max.y - extent.min.y) / 2);
  });
  const steered = wheels.map((wheel) => wheel.position.z > 0);
  const pivotY = radii.length > 0 ? radii.reduce((a, b) => a + b, 0) / radii.length : 0;
  const blades: THREE.Object3D[] = [];
  const discs: THREE.Mesh[] = [];
  for (const prop of props) {
    const bladeMesh = prop.children[0] ?? prop;
    const extent = boxOf(prop);
    const radius = extent === null ? 1 : Math.max(extent.max.x - extent.min.x, extent.max.y - extent.min.y) / 2;
    const disc = new THREE.Mesh(discGeometry(), discMaterial());
    disc.name = 'prop-disc';
    disc.scale.setScalar(radius);
    // Just ahead of the blades, square to the axle; a scale and no rotation.
    disc.position.set(0, 0, 0.05);
    disc.visible = false;
    disc.castShadow = false;
    disc.receiveShadow = false;
    prop.add(disc);
    blades.push(bladeMesh);
    discs.push(disc);
  }
  group.updateMatrixWorld(true);
  group.traverse((part) => {
    if (part.matrixWorld.determinant() <= 0 && part !== group) {
      throw new Error(`craft ${model.id}: '${part.name}' has a reflected matrix under its motion`);
    }
  });
  return { sprung, wheels, radii, steered, props, blades, discs, pivotY };
}

let disc: THREE.CircleGeometry | null = null;
const discGeometry = (): THREE.CircleGeometry => (disc ??= new THREE.CircleGeometry(1, 20));

let discFill: THREE.MeshBasicMaterial | null = null;
/**
 * The swept disc's one material. It is see-through and writes no depth, so it
 * has no ink hull: a see-through fill shows its whole hull through itself.
 * One material for every disc, at one opacity — the one of the nearest plane
 * running, which is the only one near enough to see it on.
 */
export function discMaterial(): THREE.MeshBasicMaterial {
  if (discFill !== null) return discFill;
  discFill = new THREE.MeshBasicMaterial({
    color: PALETTE.bone,
    transparent: true,
    opacity: DISC_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  discFill.userData.outlineParameters = { visible: false };
  discFill.name = 'prop-disc';
  return discFill;
}

/** Clamp and the time-step-free ease every file here writes the same way. */
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const approach = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/**
 * The motion of a built vehicle, made on the first ask and kept on the group:
 * the fleet's copy and the player's are one object, so a car let go of eases
 * to rest from where it was.
 */
export function motionOf(group: THREE.Object3D, model: CraftModel): CraftMotion {
  const known = group.userData.motion as CraftMotion | undefined;
  if (known !== undefined) return known;
  const parts = partsOf(group, model);
  const road = model.kind === 'car' || model.kind === 'van';
  const plane = model.kind === 'plane';
  const boat = model.kind === 'boat';

  let lastSpeed = 0;
  let accel = 0;
  let pitch = 0;
  let pitchRate = 0;
  let roll = 0;
  let rollRate = 0;
  let spin = 0;
  let time = 0;
  /** Each propeller's drawn angle. */
  let propAngle = 0;
  let settling = false;
  const phase = (group.id * 2.39996) % (Math.PI * 2);

  function rest(): void {
    lastSpeed = accel = pitch = pitchRate = roll = rollRate = spin = 0;
    parts.sprung.position.set(0, 0, 0);
    parts.sprung.rotation.set(0, 0, 0);
    for (const wheel of parts.wheels) wheel.rotation.y = 0;
    for (const d of parts.discs) d.visible = false;
    for (const b of parts.blades) b.visible = true;
    settling = false;
  }

  const motion: CraftMotion = {
    get settling() {
      return settling;
    },
    rest,
    update(dt, input) {
      if (dt <= 0) return;
      // The springs are stepped explicitly: past a twentieth of a second a
      // stiff one overshoots on its own, so a long frame is taken as that.
      const step = Math.min(dt, 1 / 20);
      time += dt;
      const speed = input.speed;
      const measured = (speed - lastSpeed) / dt;
      lastSpeed = speed;
      accel += (measured - accel) * approach(ACCEL_SMOOTHING, dt);

      let pitchTarget = 0;
      let rollTarget = 0;
      let lift = 0;
      let shakeRoll = 0;
      let shakePitch = 0;
      if (road && input.grounded) {
        // Squat under the throttle, dive under the brake (negative pitch is
        // nose up), and lean out of the turn: a left turn is a positive
        // `turnRate` and, in this frame, a positive roll leans the body right.
        pitchTarget = clamp(-accel * PITCH_PER_ACCEL, -MAX_PITCH, MAX_PITCH);
        rollTarget = clamp(speed * input.turnRate * ROLL_PER_PULL, -MAX_ROLL, MAX_ROLL);
        if (input.engine && Math.abs(speed) < STANDING) {
          lift = IDLE_SHAKE * (0.6 * Math.sin(time * 43 + phase) + 0.4 * Math.sin(time * 61));
          shakeRoll = IDLE_ROLL * Math.sin(time * 37 + phase);
        }
      } else if (plane && input.grounded && Math.abs(speed) > STANDING) {
        // A light aircraft on grass: it rocks on its gear, more as it goes faster.
        const k = clamp(Math.abs(speed) / ROLL_SCALE, 0, 1);
        shakeRoll = ROLL_WOBBLE * k * (Math.sin(time * 11.3 + phase) + 0.6 * Math.sin(time * 17.9));
        shakePitch = PITCH_WOBBLE * k * Math.sin(time * 13.7 + phase);
        lift = BOUNCE * k * Math.abs(Math.sin(time * 7.9 + phase));
      } else if (boat && input.moored) {
        lift = MOOR_HEAVE * Math.sin(time * 1.1 + phase);
        shakePitch = MOOR_PITCH * Math.sin(time * 0.63 + phase * 1.7);
        shakeRoll = MOOR_ROLL * Math.sin(time * 0.81 + phase * 0.6);
      }
      pitchRate += ((pitchTarget - pitch) * SPRING - pitchRate * DAMPING) * step;
      pitch += pitchRate * step;
      rollRate += ((rollTarget - roll) * SPRING - rollRate * DAMPING) * step;
      roll += rollRate * step;

      // About the axles' height on the axis rather than the ground under it:
      // the rotation, and the translation that keeps that point still.
      euler.set(pitch + shakePitch, 0, roll + shakeRoll);
      parts.sprung.rotation.copy(euler);
      offset.set(0, parts.pivotY, 0).applyEuler(euler);
      parts.sprung.position.set(-offset.x, parts.pivotY - offset.y + lift, -offset.z);

      // The wheels roll on the ground at the speed it passes under them, and
      // the front pair turns with the wheel; off the ground they keep still.
      if (input.grounded) {
        for (let i = 0; i < parts.wheels.length; i++) {
          const wheel = parts.wheels[i]!;
          wheel.rotation.order = 'YXZ';
          wheel.rotation.x += (speed * dt) / parts.radii[i]!;
          // +Y turns +Z to the left, and the wheel's positive is to the right.
          if (parts.steered[i]) wheel.rotation.y += (-input.steering * STEER_LOCK - wheel.rotation.y) * approach(12, dt);
        }
      }

      // The propeller: ticking over on the ground, flat out in the air, and
      // winding down when the engine stops.
      if (parts.props.length > 0) {
        const wanted = !input.engine ? 0 : input.grounded ? PROP_IDLE + (PROP_FULL - PROP_IDLE) * clamp(Math.abs(speed) / ROLL_SCALE, 0, 1) : PROP_FULL;
        spin += (wanted - spin) * approach(PROP_EASE, dt);
        if (!input.engine && spin < 0.05) spin = 0;
        propAngle = (propAngle + Math.min(spin, PROP_DRAWN) * dt) % (Math.PI * 2);
        const sweep = clamp((spin - DISC_FROM) / (DISC_FULL - DISC_FROM), 0, 1);
        for (let i = 0; i < parts.props.length; i++) {
          parts.props[i]!.rotation.z = propAngle;
          parts.discs[i]!.visible = sweep > 0;
        }
        if (sweep > 0) discMaterial().opacity = DISC_OPACITY * sweep;
      }

      let steered = false;
      for (let i = 0; i < parts.wheels.length; i++) if (parts.steered[i] && Math.abs(parts.wheels[i]!.rotation.y) > 1e-3) steered = true;
      settling =
        input.engine ||
        input.moored ||
        steered ||
        spin > 0 ||
        Math.abs(speed) > 0.01 ||
        Math.abs(pitch) + Math.abs(roll) + Math.abs(pitchRate) + Math.abs(rollRate) > 1e-4;
    },
  };
  group.userData.motion = motion;
  return motion;
}

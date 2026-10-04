/**
 * What a vehicle does between its pose and its paint: the body on its
 * springs, the wheels turning and steering, the propeller and the rotors, a
 * bicycle's crank, a horse's legs and back, a moored hull on the swell.
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
import type { Rigged } from '../models.ts';
import { ROAD_HANDLING } from '../vehicles.ts';
import type { CraftModel } from './contract.ts';
import { NEEDLE_REST, NEEDLE_SWEEP, WHEEL_LOCK } from './cabin.ts';

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
  /**
   * Afloat with nobody driving: the swell is this file's to draw. When driven
   * it is the pose's. A horse nobody is riding is `moored` too, and idles.
   */
  moored: boolean;
  /**
   * The throttle, -1 to 1: `W` forward, `S` back. A bicycle's pedals turn
   * only while it is pushed; coasting, they stop and the wheels run on.
   */
  throttle: number;
}

export interface CraftMotion {
  update(dt: number, input: Readonly<MotionInput>): void;
  /** Straight to rest: body square, nothing turning. */
  rest(): void;
  /** Still easing back to rest, or turning: worth another `update` with nothing asked of it. */
  readonly settling: boolean;
  /**
   * A bicycle's crank, radians: 0 with the left pedal at the bottom, rising as
   * it is pedalled forward. The rider's feet are put round it
   * (`poseAstride` in `cast.ts`), so they and the pedals cannot part. 0 for
   * anything without a crank.
   */
  readonly phase: number;
  /**
   * How far the seats are lifted off where the model publishes them, in
   * units: a horse's back rising and falling under the saddle. The rider's
   * own body is not under the model (`player.ts`) and adds it itself.
   */
  readonly lift: number;
  /**
   * The steering wheel's turn, radians, positive clockwise as the driver sees
   * it: the front wheels' own lock carried up the column (`WHEEL_LOCK`). The
   * driver's hands are put round it (`holdWheel` in `cast.ts`), so they and
   * the rim cannot part. 0 for anything without a wheel.
   */
  readonly steer: number;
}

/** A motion input with nothing asked of it: parked, engine off. */
export const AT_REST: Readonly<MotionInput> = { speed: 0, turnRate: 0, steering: 0, grounded: true, engine: false, moored: false, throttle: 0 };

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
/** A helicopter's rotor at full power, radians a second: slower than a propeller, and the tail's faster. */
const ROTOR_FULL = 40;
const TAIL_RATE = 2.5;
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
/**
 * A horse's gaits: under `WALK_FROM` units a second it stands, over
 * `GALLOP_FROM` it gallops, and walks between; the walk clip plays at a
 * third of the horse's length a second, as the herds' does (`pace` in
 * `life.ts`), and the gallop at `GALLOP_STRIDE` lengths a cycle of its clip.
 * `GAIT_EASE` is how fast one gait gives way to the next, per second.
 */
const WALK_FROM = 0.4;
const GALLOP_FROM = 10;
const WALK_PACE = 0.3;
const GALLOP_STRIDE = 1.6;
const GAIT_EASE = 5;
/**
 * A ridden horse's jumps, by the pack's clip: a leap at speed, and a jump from
 * a stand that ends standing. `craft/horse.ts` measures each for how high its
 * hooves go (`JumpCurve`), and `JUMP_EASE` is how fast a jump takes over from
 * the gaits and gives way to them again, per second.
 */
export const JUMP_CLIPS = ['Gallop_Jump', 'Jump_toIdle'] as const;
const JUMP_EASE = 14;

/**
 * A jump clip as measured: the lowest hoof's height over the ground through
 * it, in the craft's units at `duration / (feet.length - 1)` seconds a
 * sample, and the clip's times at the last frame on the ground before the
 * leap and the first after it.
 */
export interface JumpCurve {
  feet: Float32Array;
  duration: number;
  off: number;
  on: number;
}

/** A jump curve's hoof height at `time`, between its samples. */
function feetAt(curve: JumpCurve, time: number): number {
  const last = curve.feet.length - 1;
  const at = clamp((time / curve.duration) * last, 0, last);
  const i = Math.min(last - 1, Math.floor(at));
  return curve.feet[i]! + (curve.feet[i + 1]! - curve.feet[i]!) * (at - i);
}

interface Parts {
  sprung: THREE.Group;
  /** A bicycle's crank. */
  cranks: THREE.Object3D[];
  /** A helicopter's rotor, about +Y, and its tail rotor, about +X; each with its disc. */
  rotors: THREE.Object3D[];
  tails: THREE.Object3D[];
  /** An animal's rig: its body and mixer, and the bone the saddle rides. */
  rig: Rigged | null;
  back: THREE.Bone | null;
  /** The group the rig hangs in, which a jump lowers, and the jumps it can play. */
  holder: THREE.Object3D | null;
  jumps: Readonly<Record<string, JumpCurve>> | null;
  /** A cabin's steering wheel and its speedometer's needle (`cabin.ts`). */
  steers: THREE.Object3D[];
  needles: THREE.Object3D[];
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
  const cranks: THREE.Object3D[] = [];
  const rotors: THREE.Object3D[] = [];
  const tails: THREE.Object3D[] = [];
  const steers: THREE.Object3D[] = [];
  const needles: THREE.Object3D[] = [];
  let rig: Rigged | null = null;
  let back: THREE.Bone | null = null;
  let holder: THREE.Object3D | null = null;
  let jumps: Readonly<Record<string, JumpCurve>> | null = null;
  for (const child of [...group.children]) {
    if (child.name === 'wheel') {
      wheels.push(child);
      continue;
    }
    if (child.name === 'rig') {
      // An animal walks on its own legs: its body stays where the model put
      // it, and the saddle and the seats ride its back (`lift`).
      rig = (child.userData.rigged as Rigged | undefined) ?? null;
      const named = child.userData.back as string | undefined;
      if (rig !== null && named !== undefined) back = rig.body.skeleton.bones.find((bone) => bone.name === named) ?? null;
      holder = child;
      jumps = (child.userData.jumps as Record<string, JumpCurve> | undefined) ?? null;
      continue;
    }
    // The body, the propeller, the seat frames: everything the springs carry.
    sprung.add(child);
  }
  group.add(sprung);
  group.traverse((part) => {
    if (part.name === 'prop') props.push(part);
    else if (part.name === 'crank') cranks.push(part);
    else if (part.name === 'rotor') rotors.push(part);
    else if (part.name === 'tail') tails.push(part);
    else if (part.name === 'steer') steers.push(part);
    else if (part.name === 'needle') needles.push(part);
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
  for (const prop of [...props, ...rotors, ...tails]) {
    const bladeMesh = prop.children[0] ?? prop;
    const extent = boxOf(prop);
    const disc = new THREE.Mesh(discGeometry(), discMaterial());
    disc.name = 'prop-disc';
    disc.visible = false;
    disc.castShadow = false;
    disc.receiveShadow = false;
    if (prop.name === 'rotor') {
      // Flat, in the plane the blades sweep: the circle's +Z turned up to +Y.
      disc.scale.setScalar(extent === null ? 1 : Math.max(extent.max.x - extent.min.x, extent.max.z - extent.min.z) / 2);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(0, 0.05, 0);
    } else if (prop.name === 'tail') {
      // Square to the X axle, just outboard of the blades.
      disc.scale.setScalar(extent === null ? 1 : Math.max(extent.max.y - extent.min.y, extent.max.z - extent.min.z) / 2);
      disc.rotation.y = Math.PI / 2;
      disc.position.set(0.05, 0, 0);
    } else {
      disc.scale.setScalar(extent === null ? 1 : Math.max(extent.max.x - extent.min.x, extent.max.y - extent.min.y) / 2);
      // Just ahead of the blades, square to the axle; a scale and no rotation.
      disc.position.set(0, 0, 0.05);
    }
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
  return { sprung, wheels, radii, steered, props, blades, discs, pivotY, cranks, rotors, tails, steers, needles, rig, back, holder, jumps };
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
  const kind = model.kind;
  // On four wheels and springs: the body squats, dives and rolls. A
  // two-wheeler leans instead, and the lean is the pose's (`player.ts`).
  const road = kind === 'car' || kind === 'van' || kind === 'bus' || kind === 'tractor' || kind === 'jeep' || kind === 'tuktuk';
  const plane = kind === 'plane';
  const boat = model.medium === 'water';
  const motorbike = kind === 'motorbike';
  /** How far the bicycle goes for one turn of its crank. */
  const gearing = model.gearing ?? 0;
  let crank = 0;
  let lift = 0;
  /** The steering wheel's turn, and the speed the needle reads at its stop. */
  let wheelTurn = 0;
  const needleFull = ROAD_HANDLING[kind]?.boost ?? 40;
  for (const needle of parts.needles) needle.rotation.z = NEEDLE_REST;
  // The horse's clips, their weights and their rates.
  const rigged = parts.rig;
  const idle = rigged?.actions.get('Idle') ?? null;
  const walk = rigged?.actions.get('Walk') ?? null;
  const gallop = rigged?.actions.get('Gallop') ?? walk;
  const gaits = [idle, walk, gallop];
  const weights = [1, 0, 0];
  const length = model.size[0];
  const gallopPace = gallop !== null ? (GALLOP_STRIDE * length) / Math.max(0.1, gallop.getClip().duration) : length;
  const backAt = new THREE.Vector3();
  let backRest = 0;
  const backY = (): number => {
    if (parts.back === null || rigged === null) return 0;
    rigged.root.updateMatrixWorld(true);
    parts.back.getWorldPosition(backAt);
    return group.worldToLocal(backAt).y;
  };
  /** The jump playing, its curve, and how much of the body it has. */
  let jumping: THREE.AnimationAction | null = null;
  let jumpCurve: JumpCurve | null = null;
  let jumpWeight = 0;
  let wasGrounded = true;
  if (rigged !== null) {
    for (const [i, action] of gaits.entries()) {
      if (action === null) continue;
      action.reset().play();
      action.setEffectiveWeight(weights[i]!);
    }
    rigged.mixer.update(0);
    group.updateMatrixWorld(true);
    backRest = backY();
  }

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
    lift = 0;
    jumping?.stop();
    jumping = jumpCurve = null;
    jumpWeight = 0;
    wasGrounded = true;
    if (parts.holder !== null) parts.holder.position.y = 0;
    parts.sprung.position.set(0, 0, 0);
    parts.sprung.rotation.set(0, 0, 0);
    for (const wheel of parts.wheels) wheel.rotation.y = 0;
    wheelTurn = 0;
    for (const part of parts.steers) part.rotation.z = 0;
    for (const needle of parts.needles) needle.rotation.z = NEEDLE_REST;
    for (const d of parts.discs) d.visible = false;
    for (const b of parts.blades) b.visible = true;
    settling = false;
  }

  const motion: CraftMotion = {
    get settling() {
      return settling;
    },
    get phase() {
      return crank;
    },
    get lift() {
      return lift;
    },
    get steer() {
      return wheelTurn;
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
      let heave = 0;
      let shakeRoll = 0;
      let shakePitch = 0;
      if (road && input.grounded) {
        // Squat under the throttle, dive under the brake (negative pitch is
        // nose up), and lean out of the turn: a left turn is a positive
        // `turnRate` and, in this frame, a positive roll leans the body right.
        pitchTarget = clamp(-accel * PITCH_PER_ACCEL, -MAX_PITCH, MAX_PITCH);
        rollTarget = clamp(speed * input.turnRate * ROLL_PER_PULL, -MAX_ROLL, MAX_ROLL);
        if (input.engine && Math.abs(speed) < STANDING) {
          heave = IDLE_SHAKE * (0.6 * Math.sin(time * 43 + phase) + 0.4 * Math.sin(time * 61));
          shakeRoll = IDLE_ROLL * Math.sin(time * 37 + phase);
        }
      } else if (motorbike && input.grounded && input.engine && Math.abs(speed) < STANDING) {
        // A single ticking over under its rider: a shiver, no roll.
        heave = IDLE_SHAKE * 0.6 * Math.sin(time * 53 + phase);
      } else if (plane && input.grounded && Math.abs(speed) > STANDING) {
        // A light aircraft on grass: it rocks on its gear, more as it goes faster.
        const k = clamp(Math.abs(speed) / ROLL_SCALE, 0, 1);
        shakeRoll = ROLL_WOBBLE * k * (Math.sin(time * 11.3 + phase) + 0.6 * Math.sin(time * 17.9));
        shakePitch = PITCH_WOBBLE * k * Math.sin(time * 13.7 + phase);
        heave = BOUNCE * k * Math.abs(Math.sin(time * 7.9 + phase));
      } else if (boat && input.moored) {
        heave = MOOR_HEAVE * Math.sin(time * 1.1 + phase);
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
      parts.sprung.position.set(-offset.x, parts.pivotY - offset.y + heave, -offset.z);

      // A horse: its gaits blended by its speed, each at the rate its legs
      // cover the ground at, and the saddle on its back as it rises and falls.
      if (rigged !== null) {
        const pace = Math.abs(speed);
        // Off the ground — a jump, or off a terrace — it leaps: the pack's
        // leap at speed, its standing jump from a stand, from the last frame
        // before the hooves leave the ground. Down again sooner than the clip
        // is, it goes straight to the landing; still up when the clip lands,
        // it holds the stretch until it is down.
        if (!input.grounded && wasGrounded && parts.jumps !== null) {
          const name = pace >= WALK_FROM ? JUMP_CLIPS[0] : JUMP_CLIPS[1];
          const curve = parts.jumps[name] ?? null;
          const action = rigged.actions.get(name) ?? null;
          if (curve !== null && action !== null) {
            if (jumping !== null && jumping !== action) jumping.stop();
            action.reset();
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.play();
            action.time = curve.off;
            jumping = action;
            jumpCurve = curve;
          }
        }
        wasGrounded = input.grounded;
        let leaping = false;
        if (jumping !== null && jumpCurve !== null) {
          if (input.grounded && jumping.time < jumpCurve.on) jumping.time = jumpCurve.on;
          else if (!input.grounded && jumping.time > jumpCurve.on) jumping.time = jumpCurve.on - 0.02;
          leaping = !jumping.paused && jumping.time < jumpCurve.duration - 1e-3;
        }
        jumpWeight += ((leaping ? 1 : 0) - jumpWeight) * approach(JUMP_EASE, dt);
        if (!leaping && jumpWeight < 1e-3) {
          jumpWeight = 0;
          jumping?.stop();
          jumping = jumpCurve = null;
        }
        jumping?.setEffectiveWeight(jumpWeight);
        const want = pace < WALK_FROM ? 0 : pace < GALLOP_FROM ? 1 : 2;
        const ease = approach(GAIT_EASE, dt);
        for (let i = 0; i < 3; i++) {
          weights[i]! += ((i === want ? 1 : 0) - weights[i]!) * ease;
          gaits[i]?.setEffectiveWeight(weights[i]! * (1 - jumpWeight));
        }
        if (walk !== null) walk.timeScale = clamp(pace / (WALK_PACE * length), 0.5, 2.2);
        if (gallop !== null && gallop !== walk) gallop.timeScale = clamp(pace / gallopPace, 0.6, 1.8);
        const moving = pace > 0.01 || input.moored || weights[0]! < 0.999 || jumping !== null;
        if (moving) {
          rigged.mixer.update(dt);
          // The clip's own rise taken back off, so the height is the jump's.
          if (parts.holder !== null) parts.holder.position.y = jumping !== null && jumpCurve !== null ? -feetAt(jumpCurve, jumping.time) * jumpWeight : 0;
          lift = backY() - backRest;
          parts.sprung.position.y += lift;
        }
      }

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

      // The steering wheel turns with the front wheels, eased the same way, and
      // comes back to the middle as they do; the needle reads the speed.
      // Each is a turn about its own +Z on top of the tilt `assemble` stood it
      // at, so the matrix stays a rotation (`Turning.tilt`).
      if (parts.steers.length > 0) {
        wheelTurn += (input.steering * WHEEL_LOCK - wheelTurn) * approach(12, dt);
        for (const part of parts.steers) part.rotation.z = wheelTurn;
      }
      if (parts.needles.length > 0) {
        const read = NEEDLE_REST + NEEDLE_SWEEP * clamp(Math.abs(speed) / needleFull, 0, 1);
        for (const needle of parts.needles) needle.rotation.z += (read - needle.rotation.z) * approach(6, dt);
      }

      // A bicycle's crank goes round while it is pedalled, by the gearing;
      // coasting, the pedals stop where they are.
      if (parts.cranks.length > 0 && gearing > 0 && input.grounded && input.throttle > 0 && speed > 0) {
        crank = (crank + (speed * dt * Math.PI * 2) / gearing) % (Math.PI * 2);
        for (const part of parts.cranks) part.rotation.x = crank;
      }

      // The propeller: ticking over on the ground, flat out in the air, and
      // winding down when the engine stops. A rotor spins the same way, at its
      // own full rate, and a tail rotor faster than the rotor it answers.
      const spinning = parts.props.length + parts.rotors.length + parts.tails.length;
      if (spinning > 0) {
        const full = parts.rotors.length > 0 ? ROTOR_FULL : PROP_FULL;
        const wanted = !input.engine ? 0 : input.grounded ? PROP_IDLE + (full - PROP_IDLE) * clamp(Math.abs(speed) / ROLL_SCALE, 0, 1) : full;
        spin += (wanted - spin) * approach(PROP_EASE, dt);
        if (!input.engine && spin < 0.05) spin = 0;
        propAngle = (propAngle + Math.min(spin, PROP_DRAWN) * dt) % (Math.PI * 2);
        const sweep = clamp((spin - DISC_FROM) / (DISC_FULL - DISC_FROM), 0, 1);
        let d = 0;
        for (const prop of parts.props) {
          prop.rotation.z = propAngle;
          parts.discs[d++]!.visible = sweep > 0;
        }
        for (const rotor of parts.rotors) {
          rotor.rotation.y = propAngle;
          parts.discs[d++]!.visible = sweep > 0;
        }
        for (const tail of parts.tails) {
          tail.rotation.x = (propAngle * TAIL_RATE) % (Math.PI * 2);
          parts.discs[d++]!.visible = sweep > 0;
        }
        if (sweep > 0) discMaterial().opacity = DISC_OPACITY * sweep;
      }

      let steered = false;
      for (let i = 0; i < parts.wheels.length; i++) if (parts.steered[i] && Math.abs(parts.wheels[i]!.rotation.y) > 1e-3) steered = true;
      if (Math.abs(wheelTurn) > 1e-3) steered = true;
      for (const needle of parts.needles) if (Math.abs(needle.rotation.z - NEEDLE_REST) > 1e-3) steered = true;
      settling =
        input.engine ||
        input.moored ||
        (rigged !== null && (weights[0]! < 0.999 || jumping !== null)) ||
        steered ||
        spin > 0 ||
        Math.abs(speed) > 0.01 ||
        Math.abs(pitch) + Math.abs(roll) + Math.abs(pitchRate) + Math.abs(rollRate) > 1e-4;
    },
  };
  group.userData.motion = motion;
  return motion;
}

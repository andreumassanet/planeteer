/**
 * What a vehicle does between its pose and its paint: the body on its
 * springs, the wheels turning and steering, the propeller and the rotors, a
 * bicycle's crank, a horse's legs and back, a moored hull on the swell.
 *
 * None of it is the pose. Where a vehicle is and which way it faces belongs to
 * the player (`player.ts`) or the wire (`fleet.ts`, `fleet-sync.ts`); everything
 * here is a child transform under it that nobody else reads. A driven vehicle
 * and another player's are treated alike, and a parked one is handed nothing
 * and eases back to rest.
 *
 * `CraftModel.build` names what turns (`'wheel'` about +X, `'prop'` about +Z);
 * everything else is moved into a `'sprung'` group under the model on first
 * use: the body, the propeller on its nose, and the seat frames `fleet.ts`
 * hangs on it. The wheels stay where the model put them.
 *
 * Every transform is a rotation about a point plus a small translation, so no
 * matrix can come out reflected; `motionOf` asserts it once anyway, because an
 * inked part with a reflected matrix is a solid blob of ink. Nothing allocates
 * after the first call for a model.
 */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import type { Rigged } from '../models.ts';
import { ROAD_HANDLING } from '../vehicles.ts';
import type { CraftModel, Seat } from './contract.ts';
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
  /**
   * An aircraft's stick, -1 to 1: `elevator` positive nose up, `aileron`
   * positive rolling right. The control surfaces follow them; the rudder
   * follows `steering`.
   */
  elevator: number;
  aileron: number;
  /**
   * A hull's wind: where it comes from against the bow, radians, positive
   * from starboard, and its speed, metres a second. A sail's rig stands to
   * it; a hull handed none rides head to wind, its boom amidships.
   */
  windFrom?: number;
  windSpeed?: number;
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
  /**
   * The seat with its grip carried round with the bars, where the model has a
   * `'fork'`: the hands of whoever rides it stay on the grips as it steers.
   * The seat itself where it has none. The result is reused.
   */
  turned(seat: Seat): Seat;
}

/** A motion input with nothing asked of it: parked, engine off. */
export const AT_REST: Readonly<MotionInput> = { speed: 0, turnRate: 0, steering: 0, grounded: true, engine: false, moored: false, throttle: 0, elevator: 0, aileron: 0 };

/**
 * A car's body on its springs: radians of pitch per unit a second squared of
 * acceleration, and of roll per unit a second squared of lateral pull, each
 * with its stop.
 */
const PITCH_PER_ACCEL = 0.001;
const MAX_PITCH = 0.05;
const ROLL_PER_PULL = 0.0015;
const MAX_ROLL = 0.06;
/**
 * The springs: stiffness and damping of a second-order follow, giving the
 * small overshoot a car has (about one and a half cycles a second, damped to
 * half a swing).
 */
const SPRING = 90;
const DAMPING = 9;
/**
 * A landing on wheels: the body squashes onto its springs and comes back up,
 * by `LAND_SQUASH` of its height for a fall of `LAND_FULL` seconds or more
 * (the impact grows with the time in the air), and the nose dips by
 * `LAND_NOD` radians at the same. Under `LAND_FROM` seconds off the ground
 * it was a bump, not a landing.
 */
const LAND_SQUASH = 0.12;
const LAND_FULL = 0.6;
const LAND_NOD = 0.04;
const LAND_FROM = 0.06;
/** How fast the measured acceleration is smoothed, per second: a frame's speed step is noise. */
const ACCEL_SMOOTHING = 6;
/** The idle: how far the body shakes on its mounts with the engine running and the car standing, in units and radians. */
const IDLE_SHAKE = 0.025;
const IDLE_ROLL = 0.004;
/** How far the front wheels go over at full lock, radians. */
const STEER_LOCK = 0.45;
/**
 * The other things that steer, at full deflection, radians: a two-wheeler's
 * bars (less than a car's wheels, since a rider at speed leans rather than
 * turns them), a rudder or an outboard, and an aircraft's elevator and
 * ailerons.
 */
const FORK_LOCK = 0.32;
const RUDDER_LOCK = 0.5;
const ELEVATOR_LOCK = 0.35;
const AILERON_LOCK = 0.3;
/** How fast the surfaces and the bars follow what is asked of them, per second. */
const SURFACE_EASE = 10;
/** Under this speed a vehicle counts as standing, units a second. */
const STANDING = 0.3;

/**
 * The propeller, in radians a second: ticking over on the ground, and at full
 * power; how fast it spins up and down, per second; and the most it is drawn
 * turning. A two-bladed propeller looks the same every half turn, so the
 * blades are drawn at no more than `PROP_DRAWN` and past `DISC_FROM` a pale
 * disc comes up in the arc they sweep.
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
 * The air aloft is never quite still: a light aircraft's slow wobble in it,
 * radians of roll and pitch and units of heave at its low cruise, on periods
 * that do not divide; and the shiver a helicopter's rotor puts through it.
 */
const AIR_ROLL = 0.012;
const AIR_PITCH = 0.006;
const AIR_HEAVE = 0.05;
const ROTOR_SHIVER = 0.012;
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
 * Seconds a jump clip takes to catch up with a landing that came before its
 * own, from wherever it is to the hooves' touchdown (`JumpCurve.on`).
 */
const LAND_CATCH = 0.08;

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

/**
 * Where a jump clip is held while the horse is still in the air: past the top
 * of the leap, where the lowest hoof has come down to half its highest, so a
 * long fall hangs in one pose until the landing steps on to `on`. A clip whose
 * hooves never come down by half before `on` holds at its last sample off the
 * ground. Measured once a curve.
 */
const holds = new WeakMap<JumpCurve, number>();
function holdOf(curve: JumpCurve): number {
  const known = holds.get(curve);
  if (known !== undefined) return known;
  const last = curve.feet.length - 1;
  const step = curve.duration / last;
  const first = Math.max(0, Math.ceil(curve.off / step));
  const end = Math.min(last, Math.floor(curve.on / step));
  let top = first;
  for (let i = first; i <= end; i++) if (curve.feet[i]! > curve.feet[top]!) top = i;
  const half = curve.feet[top]! / 2;
  let hold = Math.max(curve.off, curve.on - step);
  for (let i = top + 1; i <= end; i++) {
    const a = curve.feet[i - 1]!;
    const b = curve.feet[i]!;
    if (b > half) continue;
    hold = (i - 1 + (a - half) / Math.max(1e-6, a - b)) * step;
    break;
  }
  hold = clamp(hold, curve.off, curve.on);
  holds.set(curve, hold);
  return hold;
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
  /** What steers about its own +Y, and the control surfaces about their hinges, each with its rest. */
  forks: THREE.Object3D[];
  rudders: THREE.Object3D[];
  elevators: THREE.Object3D[];
  ailerons: THREE.Object3D[];
  /** Each elevator's and aileron's rest about its hinge, and each aileron's side (+1 on the left wing). */
  hinges: Map<THREE.Object3D, number>;
  /** The wheels and their radii, and which are steered (ahead of the middle, and not on a fork). */
  wheels: THREE.Object3D[];
  radii: number[];
  steered: boolean[];
  props: THREE.Object3D[];
  /** Each propeller's blades, and the disc drawn in their place at speed. */
  blades: THREE.Object3D[];
  discs: THREE.Mesh[];
  /** The point the body pitches and rolls about: the axles' height, on the axis. */
  pivotY: number;
  /** A sail's boom with its mainsail, its jib, and the pennant at its masthead, each about its own +Y. */
  booms: THREE.Object3D[];
  jibs: THREE.Object3D[];
  vanes: THREE.Object3D[];
}

const euler = new THREE.Euler();
const AXIS_X = new THREE.Vector3(1, 0, 0);
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
  const forks: THREE.Object3D[] = [];
  const rudders: THREE.Object3D[] = [];
  const elevators: THREE.Object3D[] = [];
  const ailerons: THREE.Object3D[] = [];
  const booms: THREE.Object3D[] = [];
  const jibs: THREE.Object3D[] = [];
  const vanes: THREE.Object3D[] = [];
  const hinges = new Map<THREE.Object3D, number>();
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
    else if (part.name === 'fork') forks.push(part);
    else if (part.name === 'rudder') rudders.push(part);
    else if (part.name === 'elevator') elevators.push(part);
    else if (part.name === 'aileron') ailerons.push(part);
    else if (part.name === 'boom') booms.push(part);
    else if (part.name === 'jib') jibs.push(part);
    else if (part.name === 'vane') vanes.push(part);
    // A wheel hung on a fork rolls with the others and steers with the fork.
    else if (part.name === 'wheel' && part.parent?.name === 'fork') wheels.push(part);
  });
  for (const part of [...elevators, ...ailerons]) hinges.set(part, part.rotation.x);
  // A wheel's mesh is built about its own axle (`Turning` in `build.ts`), so
  // its geometry's box is the wheel's, whatever the vehicle is doing.
  const radii = wheels.map((wheel) => {
    const extent = boxOf(wheel);
    return extent === null ? 0.5 : Math.max(0.05, (extent.max.y - extent.min.y) / 2);
  });
  const steered = wheels.map((wheel) => wheel.parent === group && wheel.position.z > 0);
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
  return {
    sprung, wheels, radii, steered, props, blades, discs, pivotY, cranks, rotors, tails, steers, needles, rig, back, holder, jumps,
    forks, rudders, elevators, ailerons, hinges, booms, jibs, vanes,
  };
}

let disc: THREE.CircleGeometry | null = null;
const discGeometry = (): THREE.CircleGeometry => (disc ??= new THREE.CircleGeometry(1, 20));

let discFill: THREE.MeshBasicMaterial | null = null;
/**
 * The swept disc's one material. It is see-through and writes no depth, so it
 * has no ink hull. One material for every disc, at one opacity.
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

/** A ridden or grazing horse's rig: its gaits blended by speed, the jumps, and the saddle's rise and fall. */
interface HorseMotion {
  /** How far the back has risen over its rest height. */
  readonly lift: number;
  /** Whether the rig is still easing: not idle, or mid-jump. */
  readonly busy: boolean;
  update(dt: number, input: MotionInput): void;
  rest(): void;
}

function createHorseMotion(group: THREE.Object3D, model: CraftModel, parts: Parts, rigged: NonNullable<Parts['rig']>): HorseMotion {
  const idle = rigged.actions.get('Idle') ?? null;
  const walk = rigged.actions.get('Walk') ?? null;
  const gallop = rigged.actions.get('Gallop') ?? walk;
  const gaits = [idle, walk, gallop];
  const weights = [1, 0, 0];
  const length = model.size[0];
  const gallopPace = gallop !== null ? (GALLOP_STRIDE * length) / Math.max(0.1, gallop.getClip().duration) : length;
  const backAt = new THREE.Vector3();
  let backRest = 0;
  const backY = (): number => {
    if (parts.back === null) return 0;
    rigged.root.updateMatrixWorld(true);
    parts.back.getWorldPosition(backAt);
    return group.worldToLocal(backAt).y;
  };
  /** The jump playing, its curve, and how much of the body it has. */
  let jumping: THREE.AnimationAction | null = null;
  let jumpCurve: JumpCurve | null = null;
  let jumpWeight = 0;
  let wasGrounded = true;
  let lift = 0;
  for (const [i, action] of gaits.entries()) {
    if (action === null) continue;
    action.reset().play();
    action.setEffectiveWeight(weights[i]!);
  }
  rigged.mixer.update(0);
  group.updateMatrixWorld(true);
  backRest = backY();

  return {
    get lift() {
      return lift;
    },
    get busy() {
      return weights[0]! < 0.999 || jumping !== null;
    },
    rest() {
      lift = 0;
      if (jumping !== null) jumping.timeScale = 1;
      jumping?.stop();
      jumping = jumpCurve = null;
      jumpWeight = 0;
      wasGrounded = true;
      if (parts.holder !== null) parts.holder.position.y = 0;
    },
    update(dt, input) {
      const speed = input.speed;
      const pace = Math.abs(speed);
      // Off the ground it leaps: the pack's leap at speed, or its standing
      // jump from a stand, from the last frame before the hooves leave the
      // ground. Down again sooner than the clip, it hurries on to the landing
      // (`LAND_CATCH`); still up when the clip comes down, it is held at
      // `holdOf` by a time scale of zero, so the mixer draws the same frame
      // every frame until it is down.
      if (!input.grounded && wasGrounded && parts.jumps !== null) {
        const name = pace >= WALK_FROM ? JUMP_CLIPS[0] : JUMP_CLIPS[1];
        const curve = parts.jumps[name] ?? null;
        const action = rigged.actions.get(name) ?? null;
        if (curve !== null && action !== null) {
          if (jumping !== null && jumping !== action) jumping.stop();
          action.reset();
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.timeScale = 1;
          action.play();
          action.time = curve.off;
          jumping = action;
          jumpCurve = curve;
        }
      }
      wasGrounded = input.grounded;
      let leaping = false;
      if (jumping !== null && jumpCurve !== null) {
        if (input.grounded) {
          jumping.timeScale = Math.max(1, (jumpCurve.on - jumping.time) / LAND_CATCH);
        } else {
          const hold = holdOf(jumpCurve);
          if (jumping.time + dt >= hold) {
            jumping.time = hold;
            jumping.timeScale = 0;
          } else jumping.timeScale = 1;
        }
        leaping = !jumping.paused && jumping.time < jumpCurve.duration - 1e-3;
      }
      jumpWeight += ((leaping ? 1 : 0) - jumpWeight) * approach(JUMP_EASE, dt);
      if (!leaping && jumpWeight < 1e-3) {
        jumpWeight = 0;
        if (jumping !== null) jumping.timeScale = 1;
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
    },
  };
}

/** The propellers and rotors: spun up while the engine runs, wound down when it stops, a pale disc drawn where the blades sweep at speed. */
interface SpinMotion {
  readonly spin: number;
  update(dt: number, input: MotionInput): void;
  rest(): void;
}

function createSpinMotion(parts: Parts): SpinMotion {
  let spin = 0;
  /** Each propeller's drawn angle. */
  let propAngle = 0;
  return {
    get spin() {
      return spin;
    },
    rest() {
      spin = 0;
    },
    update(dt, input) {
      const speed = input.speed;
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
    },
  };
}

/** The wheels roll on the ground at the speed it passes under them, and the front pair turns with the wheel; off the ground they keep still. */
function rollWheels(parts: Parts, input: MotionInput, dt: number): void {
  if (input.grounded) {
    for (let i = 0; i < parts.wheels.length; i++) {
      const wheel = parts.wheels[i]!;
      wheel.rotation.order = 'YXZ';
      wheel.rotation.x += (input.speed * dt) / parts.radii[i]!;
      // +Y turns +Z to the left, and the wheel's positive is to the right.
      if (parts.steered[i]) wheel.rotation.y += (-input.steering * STEER_LOCK - wheel.rotation.y) * approach(12, dt);
    }
  }
}

/**
 * The bars, the rudders and the control surfaces, eased after what is asked
 * of them: the bars and the rudders about their own +Y (a right turn swings
 * a fork's front and a rudder's trailing edge to the right, -X), the
 * elevator about its hinge (trailing edge up for nose up) and the ailerons
 * opposite (the right one up for a roll to the right).
 */
function deflect(parts: Parts, surfaces: Surfaces, input: MotionInput, dt: number): void {
  const ease = approach(SURFACE_EASE, dt);
  surfaces.fork += (-input.steering * FORK_LOCK - surfaces.fork) * ease;
  surfaces.rudder += (input.steering * RUDDER_LOCK - surfaces.rudder) * ease;
  surfaces.elevator += (input.elevator * ELEVATOR_LOCK - surfaces.elevator) * ease;
  surfaces.aileron += (input.aileron * AILERON_LOCK - surfaces.aileron) * ease;
  for (const part of parts.forks) part.rotation.y = surfaces.fork;
  for (const part of parts.rudders) part.rotation.y = surfaces.rudder;
  for (const part of parts.elevators) part.rotation.x = parts.hinges.get(part)! + surfaces.elevator;
  for (const part of parts.ailerons) part.rotation.x = parts.hinges.get(part)! + (part.position.x < 0 ? 1 : -1) * surfaces.aileron;
}

/**
 * A sail's rig: how far out the boom goes close-hauled and dead before the
 * wind, radians, and the jib's share of it; the boom's swing as a spring, so
 * a gybe slams it across and it rebounds; how far past dead downwind the wind
 * must come before it does; the shiver of a luffing sail, radians; and how
 * fast the pennant follows the wind, per second, and how much it flutters.
 */
const BOOM_CLOSE = 0.1;
const BOOM_RUN = 1.25;
const JIB_SHARE = 0.7;
const BOOM_SPRING = 14;
const BOOM_DAMPING = 4.5;
const GYBE_HOLD = 0.2;
const LUFF_SHAKE = 0.1;
/** Off the wind, radians, where the sail stops luffing and the boom starts easing out. */
const CLOSE_HAULED = 0.7;
const VANE_EASE = 6;
const VANE_FLUTTER = 0.08;

/**
 * The boom and the jib out to leeward by how far off the wind the hull is,
 * close in on the wind and squared off before it; shivering head to wind,
 * where the sail luffs; and the pennant streaming where the wind blows. A
 * boom to starboard (-X) is a positive turn about +Y.
 */
function createRigMotion(parts: Parts) {
  const rigged = parts.booms.length + parts.jibs.length + parts.vanes.length > 0;
  let boom = 0;
  let boomRate = 0;
  let side = 1;
  let vane = 0;
  let time = 0;
  let shake = 0;

  function apply(): void {
    for (const part of parts.booms) part.rotation.y = boom + shake;
    for (const part of parts.jibs) part.rotation.y = boom * JIB_SHARE + shake * 1.4;
  }

  return {
    get busy(): boolean {
      return rigged && Math.abs(boom) + Math.abs(boomRate) + Math.abs(vane) + Math.abs(shake) > 1e-3;
    },
    rest(): void {
      boom = boomRate = vane = shake = 0;
      side = 1;
      apply();
      for (const part of parts.vanes) part.rotation.y = 0;
    },
    update(dt: number, input: MotionInput): void {
      if (!rigged) return;
      time += dt;
      const from = input.windFrom;
      const windy = from !== undefined && Number.isFinite(from);
      let wanted = 0;
      let luff = 0;
      if (windy) {
        const off = Math.abs(from);
        // The boom goes out on the side the wind leaves by; dead before it,
        // it holds its side until the wind is clearly on the other quarter.
        const lee = from > 0 ? -1 : 1;
        if (lee !== side && Math.PI - off > GYBE_HOLD) side = lee;
        wanted = side * (BOOM_CLOSE + (BOOM_RUN - BOOM_CLOSE) * clamp((off - CLOSE_HAULED) / (Math.PI - CLOSE_HAULED), 0, 1));
        luff = clamp(1 - off / CLOSE_HAULED, 0, 1) * clamp((input.windSpeed ?? 3) / 4, 0.4, 1.5);
      }
      for (let left = dt; left > 1e-9; left -= 1 / 60) {
        const step = Math.min(left, 1 / 60);
        boomRate += ((wanted - boom) * BOOM_SPRING - boomRate * BOOM_DAMPING) * step;
        boom += boomRate * step;
      }
      shake = luff * LUFF_SHAKE * (Math.sin(time * 19) + 0.5 * Math.sin(time * 31));
      apply();
      // The pennant streams where the wind blows to: its tail, aft at rest, turned by the wind's angle.
      const toward = windy ? -from : 0;
      vane += Math.atan2(Math.sin(toward - vane), Math.cos(toward - vane)) * approach(VANE_EASE, dt);
      const flutter = windy ? VANE_FLUTTER * Math.sin(time * 17) : 0;
      for (const part of parts.vanes) part.rotation.y = vane + flutter;
    },
  };
}

/** The steered parts' deflections, radians. */
interface Surfaces {
  fork: number;
  rudder: number;
  elevator: number;
  aileron: number;
}

/** Whether anything steered (wheels, steering wheel, needle, bars, surfaces) is still off its rest. */
function isDeflected(parts: Parts, wheelTurn: number, surfaces: Surfaces): boolean {
  for (let i = 0; i < parts.wheels.length; i++) if (parts.steered[i] && Math.abs(parts.wheels[i]!.rotation.y) > 1e-3) return true;
  if (Math.abs(wheelTurn) > 1e-3) return true;
  if (Math.abs(surfaces.fork) + Math.abs(surfaces.rudder) + Math.abs(surfaces.elevator) + Math.abs(surfaces.aileron) > 1e-3) return true;
  for (const needle of parts.needles) if (Math.abs(needle.rotation.z - NEEDLE_REST) > 1e-3) return true;
  return false;
}

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
  /** On wheels and springs of some kind: what squashes on a landing. */
  const wheeled = road || motorbike || kind === 'bicycle';
  /** The squash's spring speed, radians a second, and its kick for a full landing, units a second. */
  const omega = Math.sqrt(SPRING);
  const landKick = LAND_SQUASH * model.size[2] * omega;
  /** How far the bicycle goes for one turn of its crank. */
  const gearing = model.gearing ?? 0;
  let crank = 0;
  /** The steering wheel's turn, and the speed the needle reads at its stop. */
  let wheelTurn = 0;
  const needleFull = ROAD_HANDLING[kind]?.boost ?? 40;
  for (const needle of parts.needles) needle.rotation.z = NEEDLE_REST;
  const horse = parts.rig === null ? null : createHorseMotion(group, model, parts, parts.rig);
  const surfaces: Surfaces = { fork: 0, rudder: 0, elevator: 0, aileron: 0 };
  // The seat handed back by `turned`, its grip carried round the fork's axis.
  const fork = parts.forks[0] ?? null;
  const turnedSeat: { -readonly [K in keyof Seat]: Seat[K] } = { x: 0, y: 0, z: 0, yaw: 0, pose: 'ride', shown: true };
  const turnedFork: { at: [number, number, number]; axis: [number, number, number]; angle: number } = { at: [0, 0, 0], axis: [0, 1, 0], angle: 0 };
  const seatAt = new THREE.Vector3();
  const gripAt = new THREE.Vector3();
  const forkAxis = new THREE.Vector3();
  const forkAt = new THREE.Vector3();
  const rotors = createSpinMotion(parts);
  const rig = createRigMotion(parts);

  let lastSpeed = 0;
  let accel = 0;
  let pitch = 0;
  let pitchRate = 0;
  let roll = 0;
  let rollRate = 0;
  /** The squash of a landing, units (negative down), its rate, and the seconds since the wheels left the ground. */
  let drop = 0;
  let dropRate = 0;
  let airTime = 0;
  let time = 0;
  let settling = false;
  const phase = (group.id * 2.39996) % (Math.PI * 2);

  function rest(): void {
    lastSpeed = accel = pitch = pitchRate = roll = rollRate = 0;
    drop = dropRate = airTime = 0;
    rotors.rest();
    rig.rest();
    horse?.rest();
    parts.sprung.position.set(0, 0, 0);
    parts.sprung.rotation.set(0, 0, 0);
    for (const wheel of parts.wheels) wheel.rotation.y = 0;
    wheelTurn = 0;
    for (const part of parts.steers) part.rotation.z = 0;
    surfaces.fork = surfaces.rudder = surfaces.elevator = surfaces.aileron = 0;
    for (const part of [...parts.forks, ...parts.rudders]) part.rotation.y = 0;
    for (const [part, rest] of parts.hinges) part.rotation.x = rest;
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
      return horse?.lift ?? drop;
    },
    get steer() {
      return wheelTurn;
    },
    turned(seat) {
      if (fork === null || seat.grip === undefined || Math.abs(surfaces.fork) < 1e-4) return seat;
      // The grip in the model's frame, turned about the fork's own axis
      // (its +Y, stood at its rake) through where it hangs.
      forkAt.copy(fork.position);
      forkAxis.set(0, 1, 0).applyAxisAngle(AXIS_X, fork.rotation.x);
      gripAt.set(seat.x + seat.grip[0], seat.y + seat.grip[1], seat.z + seat.grip[2]).sub(forkAt).applyAxisAngle(forkAxis, surfaces.fork).add(forkAt);
      Object.assign(turnedSeat, seat);
      turnedSeat.grip = [gripAt.x - seat.x, gripAt.y - seat.y, gripAt.z - seat.z];
      forkAt.sub(seatAt.set(seat.x, seat.y, seat.z)).toArray(turnedFork.at);
      forkAxis.toArray(turnedFork.axis);
      turnedFork.angle = surfaces.fork;
      turnedSeat.fork = turnedFork;
      return turnedSeat;
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
      } else if (plane && !input.grounded) {
        // Aloft: the wobble of the air, as much as it has speed through it.
        const k = clamp(Math.abs(speed) / ROLL_SCALE, 0, 1);
        shakeRoll = AIR_ROLL * k * (Math.sin(time * 1.7 + phase) + 0.5 * Math.sin(time * 2.9));
        shakePitch = AIR_PITCH * k * Math.sin(time * 2.3 + phase);
        heave = AIR_HEAVE * k * Math.sin(time * 1.3 + phase);
      } else if (kind === 'helicopter' && !input.grounded) {
        heave = ROTOR_SHIVER * (Math.sin(time * 31 + phase) + 0.5 * Math.sin(time * 2.1));
      } else if (boat && input.moored) {
        heave = MOOR_HEAVE * Math.sin(time * 1.1 + phase);
        shakePitch = MOOR_PITCH * Math.sin(time * 0.63 + phase * 1.7);
        shakeRoll = MOOR_ROLL * Math.sin(time * 0.81 + phase * 0.6);
      }
      if (wheeled) {
        // Down again after a flight: the springs take the fall.
        if (!input.grounded) airTime += dt;
        else if (airTime > 0) {
          if (airTime > LAND_FROM) {
            const hard = clamp(airTime / LAND_FULL, 0, 1);
            dropRate -= landKick * hard;
            if (road) pitchRate += LAND_NOD * omega * hard;
          }
          airTime = 0;
        }
        dropRate += (-drop * SPRING - dropRate * DAMPING) * step;
        drop += dropRate * step;
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
      parts.sprung.position.set(-offset.x, parts.pivotY - offset.y + heave + drop, -offset.z);

      horse?.update(dt, input);

      rollWheels(parts, input, dt);

      // The steering wheel turns with the front wheels, eased the same way, and
      // comes back to the middle as they do; the needle reads the speed.
      // Each is a turn about its own +Z on top of the tilt `assemble` stood it
      // at, so the matrix stays a rotation (`Turning.tilt`).
      if (parts.steers.length > 0) {
        // Aloft, an aircraft's yoke turns with its ailerons.
        const asked = plane && !input.grounded ? input.aileron : input.steering;
        wheelTurn += (asked * WHEEL_LOCK - wheelTurn) * approach(12, dt);
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

      rotors.update(dt, input);
      rig.update(dt, input);
      deflect(parts, surfaces, input, dt);

      const steered = isDeflected(parts, wheelTurn, surfaces);
      settling =
        input.engine ||
        input.moored ||
        (horse !== null && horse.busy) ||
        steered ||
        rotors.spin > 0 ||
        rig.busy ||
        Math.abs(speed) > 0.01 ||
        Math.abs(pitch) + Math.abs(roll) + Math.abs(pitchRate) + Math.abs(rollRate) + Math.abs(drop) + Math.abs(dropRate) > 1e-4;
    },
  };
  group.userData.motion = motion;
  return motion;
}

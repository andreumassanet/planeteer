import type * as THREE from 'three';
import type { TravelMode } from '../controls.ts';
import type { Emote } from '../../server/src/limits.ts';
import type { CraftModel, PlayerState, WirePose } from '../craft/contract.ts';

/**
 * What the player just did, or was refused, for whoever tells the player so.
 *
 * - `swim`, `ashore`: into the water on foot, and back out of it.
 * - `took-off`, `landed`: a plane or a balloon leaving the ground and coming back to it.
 * - `water-refused`, `steep-refused`: a plane let down onto the sea, or onto a
 *   hillside, which goes round again.
 * - `crashed`: a car, or a plane on its wheels, driven into a wall or a parked
 *   vehicle hard enough to count (`CRASH_SPEED`); told with the speed the knock
 *   took off it.
 * - `foundered`: a vehicle driven into water it cannot float on.
 */
export type PlayerEvent = 'travel' | 'aerobatics' | 'swim' | 'ashore' | 'took-off' | 'landed' | 'water-refused' | 'steep-refused' | 'crashed' | 'foundered';

export interface PlayerInput {
  move: { x: number; y: number };
  run: boolean;
  jump: boolean;
  /** Tangent direction the camera faces. Movement on foot is relative to this. */
  heading: THREE.Vector3;
  /**
   * Held, in the air: climb and descend. Optional; see `Player.controls`. In
   * an aircraft the run key descends as well, so `Space` goes up and `Shift`
   * or `C` down (`liftOf`); swimming and in a submarine `Shift` stays the
   * sprint and `C` alone goes down.
   */
  climb?: boolean;
  dive?: boolean;
  /**
   * Held, a plane's stick: `pitch` positive pulls the nose up, `roll`
   * positive rolls right. Either off zero in the air takes the plane into
   * aerobatics (`player/aerobatics.ts`).
   */
  attitude?: { pitch: number; roll: number };
  /** Edge: a plane's flight switches between travel and aerobatics. */
  flightMode?: boolean;
}

/**
 * The vehicle you are in, handed over by `fleet.ts`: which one and which seat,
 * its model, and its own group, which rides in the player's frame while the
 * player holds it and goes back to the fleet when he lets go.
 */
export interface Ride {
  vehicle: string;
  seat: number;
  model: CraftModel;
  group: THREE.Object3D;
}

export interface Player {
  object: THREE.Group;
  /**
   * World position; its length is the distance to the planet's centre. The
   * feet on foot, the water's surface while swimming (the body hangs `sink`
   * under it), and the vehicle's own origin while seated.
   */
  position: THREE.Vector3;
  /** Heading, always tangent to the surface. In a vehicle it is the bow. */
  forward: THREE.Vector3;
  up: THREE.Vector3;
  /** Current ground speed in units/s. Used by the HUD and the walk cycle. */
  velocity: number;
  /**
   * At the controls, the speed along the bow, negative astern; anywhere else
   * `velocity`. With `climb`, how the vehicle was going when it was let go of,
   * which is how it goes on without anybody (`fleet.ts`).
   */
  speed: number;
  /** Units a second away from the planet's centre this frame: a climb, a fall. */
  climb: number;
  /**
   * Out of an aircraft in flight and not yet down: falling, and then under a
   * canopy (`CHUTE_FORCED`), steered by the movement keys.
   */
  parachute: boolean;
  /** Under the canopy, once it has opened: what the others see (`FLAGS` on the wire). */
  canopy: boolean;
  /** True while off the ground: a jump, a fall, and the whole of a flight. */
  airborne: boolean;
  /**
   * At the controls of a vehicle that was driven into the water and has gone
   * under (`FOUNDER_TIME` in `vehicles.ts`): the fleet puts the body out
   * swimming and sends the vehicle back to its site.
   */
  sunk: boolean;
  /** Seconds the vehicle at the controls has been going down in the water, -1 while it is not. */
  foundering: number;
  /** On foot, swimming, or in a seat: `PLAYER_STATES`, which is what the wire carries. */
  state: PlayerState;
  /** The same, as the keys and the HUD read it: which vehicle, and whether you are driving it. */
  mode: TravelMode;
  /** The vehicle and seat you are in, or null. */
  ride: Readonly<Pick<Ride, 'vehicle' | 'seat' | 'model'>> | null;
  /** A plane or a balloon standing on the ground, which is where it can be left. */
  grounded: boolean;
  /** How far the soles are under `position`, along `up`: 0 standing, `SWIM_DEPTH` afloat. */
  sink: number;
  /** How far under the surface a swimmer has dived, or a submarine has gone, units: 0 everywhere else. */
  depth: number;
  /** Units above sea level. The camera reads it to open the view out. */
  altitude: number;
  /**
   * In a helicopter, units over whatever is under it (the ground, a roof, the
   * sea) and whether that is water: what its downwash blows on. Infinity
   * otherwise.
   */
  clearance: number;
  overWater: boolean;
  /** At the controls of a plane in full control: pitch and roll are the keys' own. */
  aerobatic: boolean;
  /**
   * In full control, how far the nose is pitched from the heading, radians,
   * continuous through a loop (`PI` at its top); 0 otherwise.
   */
  nosePitch: number;
  /**
   * An aircraft aloft: its body's rotation in the frame of its bow (side, up,
   * `forward`), pitch and roll and whatever yaw full control has off the bow;
   * the identity otherwise. The chase turns with it.
   */
  readonly attitude: THREE.Quaternion;
  /**
   * Held intent in the air, written by whoever reads the keyboard: +1 climb,
   * -1 descend. `rig.aim` fills it in from the raw input.
   */
  controls: { lift: number };
  update(dt: number, input: PlayerInput): void;
  /**
   * Shows or hides the body, for first person. A seat that hides its body
   * (`Seat.shown` false) keeps it hidden whatever this says; first person in a
   * seat draws it whatever this says (`setCockpit`).
   */
  setBodyVisible(visible: boolean): void;
  /**
   * Where the eyes are in the seat, into `position`, and the way the seat
   * faces, into `orientation` (+Z ahead, +Y the seat's up, the vehicle's
   * roll, nose and swell included). False when not seated.
   */
  seatEye(position: THREE.Vector3, orientation: THREE.Quaternion): boolean;
  /**
   * First person in a seat: the body drawn without its head, so the eye sees
   * its own arms and knees in the cabin (`craft/cabin.ts`), and the ride's
   * glass all but cleared. Off, both are as they were.
   */
  setCockpit(on: boolean): void;
  /**
   * First person on foot: the body stays drawn with its head folded away, so
   * looking down shows the chest, the arms and the feet in their stride.
   */
  setEyeInHead(on: boolean): void;
  /** Teleport. Leaves the player in a fully consistent state in one call, on foot or swimming. */
  goTo(lat: number, lon: number): void;
  /**
   * Into a seat, with the vehicle standing at `pose` and, at the controls of
   * one still rolling (jumped out of and taken again), going at `speed` along its bow.
   */
  board(ride: Ride, pose: WirePose, speed?: number): void;
  /**
   * Out of the seat, beside the vehicle: the pose it is left at, or null when
   * not seated. Standing still it is stepping out; under way it is jumping
   * out, over the side with some of its speed; and in the air it is a fall
   * with a parachute. The vehicle's group is taken off the player; whoever
   * handed it over puts it back, and reads `speed` and `climb` first if it is
   * to go on without the player.
   */
  leave(): WirePose | null;
  /** Where the vehicle is while seated, or the body on foot: nine numbers, see `WirePose`. */
  pose(out: WirePose): WirePose;
  /**
   * A gesture where others can see it (`Motion.emote`): standing on the
   * ground only, and false anywhere else or where the body has no clip for it.
   * Walking off ends it.
   */
  emote(name: Emote | null): boolean;
  /** The gesture being made, or null. */
  readonly emoting: Emote | null;
  /**
   * Sits down on a bench (`bench.ts`): the root at `at`, on the ground under
   * it less `sink`, facing `facing`, the sitting clip held. Any movement key,
   * a jump or `stand` gets up again. False anywhere but on foot on the ground.
   */
  sitOn(at: THREE.Vector3, facing: THREE.Vector3, sink: number): boolean;
  /** Up off the bench and a pace forward, clear of it. */
  stand(): void;
  /** Sitting on a bench. */
  readonly sitting: boolean;
  /** A passenger is carried: stand the vehicle, and the player in it, at a pose somebody else drives. */
  carry(pose: WirePose): void;
}

export interface PlayerOptions {
  /**
   * The land's radius under `point`, which is what is drawn there: the mesh's
   * own triangles near the player (`drawnRadius` in `land-probe.ts`), the sea's
   * radius over water, and the relief where nothing nearer knows. Only the
   * direction of `point` is read. Without it the player walks the relief.
   */
  groundAt?: (point: THREE.Vector3) => number;
  /**
   * How high the ground people made stands here, as a radius, or 0 where there
   * is none: a town's floor and a road's carriageway. It is a callback because
   * those surfaces belong to streamers (`settlements.ts`, `roads.ts`) that know
   * what is standing. Without it the player walks the relief.
   */
  madeHeightAt?: (point: THREE.Vector3) => number;
  /**
   * Pushes a body of `radius` out of every building it overlaps at `point`:
   * the world-space displacement, tangent to the ground, into `push`, and
   * whether anything was hit. Only the point's direction is meaningful.
   * `push` has to be the whole clearing displacement and not a unit normal;
   * `slide` in `scenery/solids.ts` does the rest. It is asked whether the
   * player is moving or not, and in the air too. A car and a taxiing plane ask
   * it with their own width; a boat never asks, and a craft in the air asks it
   * only within `AIR_LOW` of the ground. Without it nothing is solid.
   */
  collide?: (point: THREE.Vector3, radius: number, push: THREE.Vector3) => boolean;
  /**
   * `collide` for a craft in the air, higher than `AIR_LOW` over the ground:
   * only the walls whose roofs are over `point`'s own height push it, so a
   * balloon drifts over a house it clears and into a tower it does not.
   * Without it nothing is solid up there.
   */
  collideAloft?: (point: THREE.Vector3, radius: number, push: THREE.Vector3) => boolean;
  /**
   * The nearest point to `point` where a body of `radius` stands clear of every
   * building, into `out`; false when `point` already is. The pushes settle a
   * body that walked into a wall; they cannot settle one that was put inside a
   * building (a teleport, stepping out of a car, a town raised round somebody
   * standing still). So a frame that hit anything ends by asking this, and
   * `goTo` and `leave` ask it on arrival.
   */
  freeSpotNear?: (point: THREE.Vector3, radius: number, out: THREE.Vector3) => boolean;
  /**
   * Told what the player just did, or was refused: see `PlayerEvent`. Never
   * called by `goTo`. `strength` is a crash's lost speed, in units a second,
   * and 0 for everything else.
   */
  onEvent?: (event: PlayerEvent, strength: number) => void;
  /**
   * A foot came down, on foot: once per half cycle of the gait, with `weight`
   * the speed as a multiple of a walk. For the footsteps.
   */
  onStep?: (weight: number) => void;
  /** Back on the ground after a jump or a fall, with the speed it landed at. */
  onTouchdown?: (speed: number) => void;
  /**
   * The radius of the sea floor under a point (`seaDepthAt` in `sea-floor.ts`),
   * which a diver and a submarine stop on and a wader walks on; where it stands
   * over the sea (the apron's dry half) it is ground. Without it nobody goes
   * under the surface, and the water's edge is a step into a swim.
   */
  seaFloorAt?: (point: THREE.Vector3) => number;
}

import type * as THREE from 'three';
import type { AstrideSeat, HandHold, Limbs, Person, SeatedPose } from '../cast.ts';
import type { Motion } from '../avatar.ts';
import type { FleetSeats, PlayerState } from '../craft/contract.ts';
import type { Emote } from '../../server/src/limits.ts';
import type { Player } from '../player.ts';

/** `[x, y, z, fx, fy, fz, state, speed, airborne]`; see `server/src/index.ts`. */
export type State = [number, number, number, number, number, number, number, number, number];

export interface Snapshot {
  at: number;
  position: THREE.Vector3;
  forward: THREE.Vector3;
  state: PlayerState;
  speed: number;
  airborne: boolean;
}

export interface Body {
  person: Person;
  /** The hero's own: `createMotion` in `avatar.ts`. */
  motion: Motion;
  limbs: Limbs;
  /** Where the clips left what a seat poses by hand, put back before they run again (`handHold`). */
  hold: HandHold;
  /** Last frame's facing and whether it was off the ground, for a turn and a landing. */
  facing: THREE.Vector3;
  airborne: boolean;
  /** How far under the surface the stroke is, 0 to 1, eased as the player's own is. */
  under: number;
}

export interface Peer {
  id: string;
  name: string;
  snapshots: Snapshot[];
  heard: number;
  holder: THREE.Group;
  body: Body | null;
  label: THREE.Sprite;
  /** Where it is drawn this frame, for the minimap. */
  shown: THREE.Vector3;
  /**
   * A gesture heard and not yet made, for a body not dressed or not near when it
   * came, and when it came: one older than `GESTURE_STALE_MS` is let go.
   */
  gesture: Emote | null;
  gestureAt: number;
  /** What the relay says they are doing that a state does not (`FLAGS`). */
  flags: number;
  /** The canopy over them, made the first time it opens, and how long it has been open. */
  canopy: THREE.Object3D | null;
  canopyAge: number;
  /** Whether the flags said they were on a bench last frame. */
  sat: boolean;
  /** Whether the state drawn this frame is off the ground. */
  aloft: boolean;
}

export interface PeerMark {
  id: string;
  name: string;
  /** A point on the unit sphere. */
  x: number;
  y: number;
  z: number;
  /** What they are doing as the wire says it: on foot, swimming, or in a seat. */
  state: PlayerState;
}

export interface PeersStats {
  state: 'off' | 'connecting' | 'open' | 'closed';
  id: string | null;
  name: string;
  peers: number;
  drawn: number;
  sent: number;
  received: number;
}

/** Any object the relay sends; `t` says which. See `server/src/index.ts`. */
export interface RelayMessage {
  t: string;
  [field: string]: unknown;
}

/** Which seat of which vehicle a player sits in. */
export interface PeerSeat {
  vehicle: string;
  seat: number;
}

/**
 * How a seat frame from `FleetSeats.seatFrame` says what a body in it looks
 * like, by the frame's `userData`: `shown: false` on a seat that hides its body,
 * `pose: 'stand'` at a helm or in a basket (the body stands with its hip at the
 * frame), `pose: 'ride'` astride, to the `seat`'s grip and footrests and round
 * its crank at the `motion`'s phase. All optional; a frame without them is a
 * visible seat, sat in.
 */
export interface SeatFrameData {
  shown?: boolean;
  pose?: 'sit' | 'stand' | 'ride';
  /** Astride, its grip and footrests; seated, how the legs fold and the wheel the hands are on (`SeatedPose`). */
  seat?: AstrideSeat & SeatedPose;
  /** The vehicle's motion: a crank's phase, and its steering wheel's turn. */
  motion?: { readonly phase: number; readonly steer?: number };
}

/**
 * As much of the traveller as the link reads and sends: Earth's `Player`, or a
 * walked world's traveller dressed in the same fields (`worlds/shell.ts`).
 */
export type PeerSelf = Pick<Player, 'position' | 'forward' | 'velocity' | 'airborne' | 'canopy' | 'sitting' | 'state'>;

export interface Peers {
  group: THREE.Group;
  update(dt: number, player: PeerSelf): void;
  /** Every peer's drawn position, on the unit sphere. Rewritten by `update`. */
  readonly marks: readonly PeerMark[];
  /** The nearest drawn peer that is moving, in world units, for the shadow's cadence. */
  readonly nearestMoving: number;
  readonly stats: PeersStats;
  /** How many others are connected, or `null` while we are not. */
  readonly online: number | null;
  /** Where a peer is drawn, in world units, or `null` if it has gone. */
  positionOf(id: string): THREE.Vector3 | null;
  /**
   * Whether a peer's drawn state is off the ground: a jump, a fall, a flight,
   * and a horse's leap under its rider (`FleetLink.leaping`).
   */
  airborneOf(id: string): boolean;
  /** Our name as we chose it, `''` for none. */
  readonly name: string;
  /**
   * Change our name; it is sent on the next connection, which this makes now.
   * Returns the name as it was kept.
   */
  rename(name: string): string;
  /**
   * How we look, as `encodeAppearance` writes it: sent with every connection
   * and, while one is open, to everyone at once.
   */
  setLook(code: string): void;
  /** Our id on the relay, from its `hi`; `null` until then and while disconnected. */
  readonly id: string | null;
  /** Sends one typed message. False, and nothing sent, while the socket is not open. */
  send(message: RelayMessage): boolean;
  /** Every object the relay sends, `hi` included, after this file has read it. */
  onMessage(listener: (message: RelayMessage) => void): () => void;
  /** Whenever the connection changes state; `open` comes before the relay's `hi`. */
  onState(listener: (state: PeersStats['state']) => void): () => void;
  /**
   * Where a seated peer is drawn: the fleet's seat frames, and which seat each
   * player holds (`FleetSync.seatOf`). Until this is called, or while a seated
   * peer's vehicle is not built, the peer is only its name.
   */
  useSeats(seats: FleetSeats, seatOf: (id: string) => PeerSeat | null): void;
  /**
   * Closes the socket for good, with no reconnection, and takes every peer off
   * the group: a walked world's link, when the traveller leaves it.
   */
  dispose(): void;
}

/**
 * Which world the link is on, and how big it is. The relay keeps a room a world
 * (`/ws?body=<id>`): a traveller on Mars and one on Earth never see each other.
 * Earth is the room an address with no `body` reaches. The waterline a swimmer
 * dives under is Earth's alone.
 */
export interface PeersOptions {
  /** The body's id, `'earth'` when left out. */
  body?: string;
  /** Its walkable radius, `PLANET_RADIUS` when left out. */
  radius?: number;
}

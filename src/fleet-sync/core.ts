/** What the relay link keeps: who moved which vehicle and who sits in it, and the driver's throttling. */
import type { WirePose } from '../craft/contract.ts';
import type { PeerSeat, Peers, RelayMessage } from '../peers.ts';

export interface Entry {
  pose: WirePose;
  seats: (string | null)[];
}

export interface Driven {
  /** Who was driving when these poses were taken. */
  driver: string | null;
  poses: { at: number; pose: WirePose; speed: number }[];
}

export interface Pending {
  seat: number;
  /** Absent for a seat taken again after a reconnection, which nobody awaits. */
  resolve: ((won: boolean) => void) | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface SyncFields {
  flushing: ReturnType<typeof setInterval> | null;
  live: boolean;
  /** Our id as the room named us, so the seats it filled can be renamed when it goes. */
  liveId: string | null;
  held: PeerSeat | null;
  indexed: boolean;
  // The driver's side: what was last sent, to throttle against.
  sentAt: number;
  sentPose: WirePose | null;
  sentSpeed: number;
}

export interface SyncCore {
  readonly peers: Peers;
  readonly fields: SyncFields;
  readonly moved: Map<string, Entry>;
  readonly driven: Map<string, Driven>;
  readonly pending: Map<string, Pending>;
  readonly listeners: Set<(vehicle: string) => void>;
  /** Where this client left a vehicle while offline, told to the room when the socket opens. */
  readonly parks: Map<string, WirePose>;
  /** The vehicles that went under while offline, told to the room the same way. */
  readonly sunkOffline: Set<string>;
  readonly outbox: RelayMessage[];
  /**
   * The offline parks whose `sit` has gone or is going out and whose `up` with
   * the pose has not: the room's grant of that `sit` is not a claim that timed
   * out, and is not given straight back with a bare `up`.
   */
  readonly parking: Set<string>;
  readonly index: Map<string, PeerSeat>;
  readonly stats: { sent: number; received: number };
}

export function createSyncCore(peers: Peers): SyncCore {
  return {
    peers,
    fields: { flushing: null, live: false, liveId: null, held: null, indexed: false, sentAt: 0, sentPose: null, sentSpeed: 0 },
    moved: new Map(),
    driven: new Map(),
    pending: new Map(),
    listeners: new Set(),
    parks: new Map(),
    sunkOffline: new Set(),
    outbox: [],
    parking: new Set(),
    index: new Map(),
    stats: { sent: 0, received: 0 },
  };
}
